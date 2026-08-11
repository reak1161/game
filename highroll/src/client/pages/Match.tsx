import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ActionPayload } from '@shared/protocol';
import type {
    CardDefinition,
    CardEffect,
    CardTarget,
    CurseId,
    GameLogEntry,
    GameState,
    Player,
    PlayerRuntimeState,
    RoleActionDefinition,
    TeamColor,
} from '@shared/types';
import cardsCatalogRaw from '../../../data/cards.json';
import rolesCatalogRaw from '../../../data/roles.json';
import {
    clearRememberedMatchPlayer,
    getRememberedMatchPlayer,
    getRememberedMatchSpectator,
    rememberMatchPlayer,
} from '@client/utils/matchPlayer';
import { rememberLobbyPlayer, rememberLobbySpectator } from '@client/utils/matchPlayer';
import { getRoleActionsForRoleIds, ROLE_ACTION_BASE_STATS } from '@shared/roleActions';
import { API_BASE, wsBase } from '@client/config/env';
import styles from './Match.module.css';
import matchGameBgUrl from '../assets/match/match-game-bg.png';
import handCardAttackBgUrl from '../assets/match/hand-card-attack-bg.png';
import handCardDefenseBgUrl from '../assets/match/hand-card-defense-bg.png';
import handCardSpellBgUrl from '../assets/match/hand-card-spell-bg.png';
import handCardEquipBgUrl from '../assets/match/hand-card-equip-bg.png';

type CardsFile = {
    cards: CardDefinition[];
};

type RoleEntry = {
    id: string;
    name: string;
    params: {
        hp: number;
        atk: number;
        def: number;
        spe: number;
        bra: number;
    };
    text?: string;
    detailText?: string;
};

type RolesFile = {
    roles: RoleEntry[];
};

type StatusEffectChip = {
    key: string;
    icon: string;
    label: string;
    value?: number | string;
    color: string;
    tooltip: string;
    bucket?: 'role' | 'equip' | 'defense' | 'buff' | 'debuff';
    showLabel?: boolean;
    sortOrder?: number;
};

type CardEffectAdjustment = {
    label: string;
    base: number;
    adjusted: number;
};

type PlayChoicesPayload = Record<string, string | number | boolean | string[] | number[] | Record<string, unknown>>;

type TargetRule = {
    mode: 'any' | 'self' | 'others';
    disallowDefeated?: boolean;
};

type TargetSelectionContext =
    | { kind: 'generic' }
    | { kind: 'card'; cardId?: string }
    | { kind: 'roleAttack' }
    | { kind: 'roleAction'; actionId: string };

const CARD_LOOKUP = new Map<string, CardDefinition>(((cardsCatalogRaw as CardsFile).cards ?? []).map((card) => [card.id, card]));
const ROLE_LOOKUP = new Map<string, RoleEntry>(((rolesCatalogRaw as RolesFile).roles ?? []).map((role) => [role.id, role]));

const statusColors: Record<string, string> = {
    waiting: '#eab308',
    inProgress: '#22c55e',
    finished: '#ef4444',
};

const TEAM_OPTIONS: Array<{ id: TeamColor; label: string; bg: string; border: string; text: string }> = [
    { id: 'red', label: '赤', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
    { id: 'blue', label: '青', bg: '#dbeafe', border: '#bfdbfe', text: '#1d4ed8' },
    { id: 'green', label: '緑', bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
    { id: 'yellow', label: '黄', bg: '#fef9c3', border: '#fde68a', text: '#92400e' },
];

const STAT_OPTIONS: Array<'atk' | 'def' | 'spe' | 'bra'> = ['atk', 'def', 'spe', 'bra'];

const CATEGORY_LABELS: Record<string, string> = {
    attack: '攻撃',
    defense: '防御',
    spell: '呪文',
    equip: '装備',
};

const getCategoryLabel = (category?: string | null): string | undefined =>
    category ? CATEGORY_LABELS[category] ?? category.toUpperCase() : undefined;

const KIND_LABELS: Record<string, string> = {
    skill: 'スキル',
    install: '設置',
};

const CHIP_BUCKET_ORDER: Record<NonNullable<StatusEffectChip['bucket']>, number> = {
    role: 0,
    equip: 1,
    defense: 2,
    buff: 3,
    debuff: 4,
};

const getStatusChipBucket = (chipKey: string): NonNullable<StatusEffectChip['bucket']> => {
    switch (chipKey) {
        case 'hayate-wing':
        case 'charge':
        case 'surgery-immobilize':
        case 'surgery-heal':
        case 'taunt':
        case 'mine-chance':
            return 'role';
        case 'invincible':
        case 'adrenaline':
        case 'next-role-atk-bonus':
        case 'card-bonus':
        case 'feint':
            return 'buff';
        case 'adrenaline-rebound':
        case 'burn':
        case 'bleed':
        case 'timed-bomb':
        case 'future-sight':
        case 'shock':
        case 'waterlogged':
        case 'cold':
        case 'gaze':
        case 'silence-role':
        case 'anesthesia':
        case 'pending-debuff':
        case 'stun':
        case 'dizzy':
        case 'suppressed':
            return 'debuff';
        default:
            return 'role';
    }
};

const sortChips = (chips: StatusEffectChip[]): StatusEffectChip[] =>
    [...chips].sort((a, b) => {
        const aBucket = CHIP_BUCKET_ORDER[a.bucket ?? 'role'] ?? 0;
        const bBucket = CHIP_BUCKET_ORDER[b.bucket ?? 'role'] ?? 0;
        if (aBucket !== bBucket) return aBucket - bBucket;
        const aOrder = a.sortOrder ?? 0;
        const bOrder = b.sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.label.localeCompare(b.label, 'ja');
    });

const MATCH_DESIGN_WIDTH = 1920;
const MATCH_DESIGN_HEIGHT = 1080;

const getKindLabel = (kind?: string | null): string | undefined =>
    kind ? KIND_LABELS[kind] ?? kind.toUpperCase() : undefined;

const HAND_CARD_BG_BY_CATEGORY: Record<string, string> = {
    attack: handCardAttackBgUrl,
    defense: handCardDefenseBgUrl,
    spell: handCardSpellBgUrl,
    equip: handCardEquipBgUrl,
};

type DeckCategoryFilter = 'all' | 'attack' | 'defense' | 'spell' | 'equip';
type DeckZoneFilter = 'all' | 'deck' | 'hand' | 'discard' | 'install' | 'remaining' | 'empty';
type DeckSortKey = 'name' | 'remaining' | 'total' | 'cost' | 'category';
type DeckSortDir = 'asc' | 'desc';

const CURSE_LABELS: Record<string, string> = {
    weakness: '衰弱の呪い',
    force: '強制の呪い',
    decay: '減衰の呪い',
    collapse: '崩壊の呪い',
    cost: '代償の呪い',
    rebuttal: '反駁の呪い',
    enrage: '激昂の呪い',
    resonate: '共振の呪い',
    silence: '沈黙の呪い',
    wear: '摩耗の呪い',
};

const getCurseLabel = (curseId?: string | null): string | undefined =>
    curseId ? CURSE_LABELS[curseId] ?? curseId : undefined;

const CURSE_DESCRIPTIONS: Record<CurseId, string> = {
    weakness: '手札にある間、追加Def-1。',
    force: '使用可能な「強制の呪い」付きカードがある限り、それ以外を使用できない。',
    decay: 'このカードの数値が-2（使用時のみ）。',
    collapse: '自分のターン終了時に、このカードは捨て札になる。',
    cost: 'このカード使用時、固定2ダメージを受ける。',
    rebuttal: 'このカード使用時、手札から1枚選んで捨てる。',
    enrage: 'このカードはBra消費が+1。',
    resonate: '対象選択がある効果は、自分にも同じ効果を適用する。',
    silence: 'このカード使用後、ターンを強制終了する。',
    wear: 'このカード使用時、追加Atk-1。',
};

const getCurseDescription = (curseId?: string | null): string | undefined => {
    if (!curseId) return undefined;
    if (!(curseId in CURSE_DESCRIPTIONS)) return undefined;
    return CURSE_DESCRIPTIONS[curseId as CurseId];
};

const flattenCardEffects = (effects: CardEffect[] | undefined): CardEffect[] => {
    const out: CardEffect[] = [];
    (effects ?? []).forEach((effect) => {
        out.push(effect);
        if (effect.type === 'chooseOne') {
            effect.options?.forEach((opt) => {
                flattenCardEffects(opt.effects).forEach((child) => out.push(child));
            });
        }
    });
    return out;
};

const cardNeedsStatChoice = (card?: CardDefinition | null): boolean =>
    Boolean(flattenCardEffects(card?.effects).some((effect) => effect.type === 'doubleBaseStat'));

const getTargetRuleFromEffects = (effects?: CardEffect[]): TargetRule | null => {
    if (!effects?.length) return null;
    const targets = flattenCardEffects(effects).flatMap((effect) => (effectHasTarget(effect) ? [effect.target] : []));
    if (targets.includes('chosen_enemy')) {
        return { mode: 'others', disallowDefeated: true };
    }
    if (targets.includes('chosen_player')) {
        return { mode: 'any', disallowDefeated: true };
    }
    return null;
};

const getCardTargetRule = (card?: CardDefinition | null): TargetRule | null => {
    return getTargetRuleFromEffects(card?.effects);
};

const STAT_LABELS: Record<string, string> = {
    hp: 'HP',
    atk: 'Atk',
    def: 'Def',
    spe: 'Spe',
    bra: 'Bra',
};

const effectHasTarget = (effect: CardEffect): effect is CardEffect & { target: CardTarget } => 'target' in effect;

const isRoleActionLog = (entry: GameLogEntry): entry is Extract<GameLogEntry, { type: 'roleAction' }> =>
    entry.type === 'roleAction';

type DamageResolvedLog = Extract<GameLogEntry, { type: 'damageResolved' }>;
const isDamageResolvedLog = (entry: GameLogEntry): entry is DamageResolvedLog => entry.type === 'damageResolved';
type ActionToastLog = Exclude<
    GameLogEntry,
    Extract<GameLogEntry, { type: 'damageResolved' | 'damageReduced' | 'roleAttack' | 'roleAttackHit' | 'abilityDamage' }>
>;
const isActionToastLog = (entry: GameLogEntry): entry is ActionToastLog =>
    entry.type === 'cardPlay' ||
    entry.type === 'roleAction' ||
    entry.type === 'turnStart' ||
    entry.type === 'roundStart' ||
    entry.type === 'playerDefeated' ||
    entry.type === 'statusEffect';

const shouldIncludeTurnLogEntry = (entry: GameLogEntry): boolean => {
    if (entry.type === 'damageResolved') {
        if (entry.source === 'status' || entry.source === 'ability') {
            return false;
        }
    }
    return true;
};

const buildTurnLogDisplay = (logs: GameLogEntry[], maxEntries = 20, lookback = 120): GameLogEntry[] => {
    if (!logs.length) return [];

    const recent = logs.slice(Math.max(0, logs.length - lookback)).filter(shouldIncludeTurnLogEntry);
    const groups: GameLogEntry[][] = [];
    let currentGroup: GameLogEntry[] = [];

    recent.forEach((entry) => {
        if (entry.type === 'turnStart') {
            if (currentGroup.length) {
                if (currentGroup.length === 1 && currentGroup[0]?.type === 'roundStart') {
                    currentGroup.push(entry);
                    return;
                }
                groups.push(currentGroup);
            }
            currentGroup = [entry];
            return;
        }
        if (entry.type === 'roundStart') {
            if (currentGroup.length) {
                groups.push(currentGroup);
            }
            currentGroup = [entry];
            return;
        }
        if (!currentGroup.length) {
            currentGroup = [entry];
            return;
        }
        currentGroup.push(entry);
    });

    if (currentGroup.length) {
        groups.push(currentGroup);
    }

    // ターンログは「発生順」を優先する。
    // ターン開始/使用/効果詳細のまとまりを崩さないため、ターン内の再ソートは行わない。
    const flat = groups.flat();
    if (flat.length <= maxEntries) return flat;
    return flat.slice(flat.length - maxEntries);
};

const buildCardEffectAdjustments = (
    card: CardDefinition | null | undefined,
    multiplier: number,
    bonus: number
): CardEffectAdjustment[] => {
    if (!card || (multiplier === 1 && bonus === 0)) {
        return [];
    }
    const adjustments: CardEffectAdjustment[] = [];
    const applyScaled = (base: number) => base * multiplier + bonus;
    const applyInt = (base: number) => Math.max(0, Math.floor(base * multiplier + bonus));
    const pushScaled = (label: string, base: number, prefix = '') => {
        adjustments.push({ label: `${prefix}${label}`, base, adjusted: applyScaled(base) });
    };
    const pushInt = (label: string, base: number, prefix = '') => {
        adjustments.push({ label: `${prefix}${label}`, base, adjusted: applyInt(base) });
    };

    const walkEffect = (effect: CardEffect, prefix = '') => {
        // ロール条件付き（専用シナジー）効果はプレビュー上で個別表示しない。
        if (effect.condition?.roleId) {
            return;
        }
        switch (effect.type) {
            case 'chooseOne':
                effect.options.forEach((option) => {
                    const nextPrefix = `${prefix}${option.label}：`;
                    option.effects.forEach((nested) => walkEffect(nested, nextPrefix));
                });
                return;
            case 'dealDamage':
                if (typeof effect.value === 'number') {
                    pushInt('ダメージ', effect.value, prefix);
                }
                return;
            case 'coinFlipDealDamage':
                pushInt('ダメージ', effect.value, prefix);
                return;
            case 'coinFlipDealDamageEither':
                pushInt('ダメージ（対象）', effect.targetValue, prefix);
                pushInt('ダメージ（自分）', effect.selfValue, prefix);
                return;
            case 'dealDamagePerSealedHand':
                pushScaled('封印ダメ倍率', effect.multiplier, prefix);
                return;
            case 'afterRoleAttackDamage':
                if (typeof effect.value === 'number') {
                    pushInt('追撃ダメージ', effect.value, prefix);
                    return;
                }
                if (typeof effect.valueMultiplierOfDealt === 'number') {
                    pushScaled('追撃倍率', effect.valueMultiplierOfDealt, prefix);
                }
                return;
            case 'futureSightRoleAttack':
                pushInt('未来予知Atk補正', effect.atkBonus, prefix);
                return;
            case 'addStatToken':
                if (typeof effect.value === 'number') {
                    const statLabel = STAT_LABELS[effect.stat] ?? effect.stat.toUpperCase();
                    pushInt(`${statLabel}トークン`, effect.value, prefix);
                }
                return;
            case 'applyStatDebuffUntilDamage': {
                const statLabel = STAT_LABELS[effect.stat] ?? effect.stat.toUpperCase();
                pushInt(`${statLabel}デバフ`, effect.value, prefix);
                return;
            }
            case 'adjustBra':
                pushInt('Bra', effect.value, prefix);
                return;
            case 'drawCards':
                pushInt('ドロー', effect.count, prefix);
                return;
            case 'applyBurn':
                pushInt('炎上', effect.value, prefix);
                return;
            case 'applyStun':
                pushInt('スタン', effect.durationRounds, prefix);
                return;
            case 'applyDizzy':
                pushInt('めまい', effect.value, prefix);
                return;
            case 'applyShock':
                pushInt('感電', effect.value, prefix);
                return;
            case 'heal':
                pushInt('回復', effect.value, prefix);
                return;
            case 'modifyMaxHpInstall':
                pushInt('最大HP', effect.value, prefix);
                return;
            case 'gainAtkBoostTurn':
                pushInt('Atkブースト', effect.value, prefix);
                return;
            case 'setNextRoleAttackAtkBonus':
                pushInt('次攻撃Atk+', effect.value, prefix);
                return;
            case 'handStatModifier': {
                const statLabel = STAT_LABELS[effect.stat] ?? effect.stat.toUpperCase();
                pushInt(`${statLabel}（手札）`, effect.value, prefix);
                return;
            }
            case 'contactBurnOnRoleAttack':
                pushInt('接触炎上', effect.value, prefix);
                return;
            case 'reduceDamageOnce':
                pushInt('ダメージ軽減', effect.amount, prefix);
                return;
            case 'poltergeist':
                pushScaled('倍率', effect.multiplier, prefix);
                return;
            case 'libraryBurst':
                pushScaled('倍率', effect.multiplier, prefix);
                return;
            default:
                return;
        }
    };

    card.effects?.forEach((effect) => walkEffect(effect));
    return adjustments;
};

const buildStatusEffects = (
    runtime?: PlayerRuntimeState,
    roleId?: string,
    currentRound?: number,
    playerId?: string,
    nextRoundPriority?: GameState['nextRoundPriority']
): StatusEffectChip[] => {
    if (!runtime?.roleState) return [];
    const { roleState } = runtime;
    const effects: StatusEffectChip[] = [];

    if (
        playerId &&
        nextRoundPriority &&
        nextRoundPriority.playerId === playerId &&
        typeof currentRound === 'number' &&
        nextRoundPriority.applyOnRound === currentRound + 1
    ) {
        effects.push({
            key: 'hayate-wing',
            icon: '🪽',
            label: 'はやてのつばさ',
            value: '次R',
            color: '#38bdf8',
            tooltip: '次のラウンドでSpeを無視して最優先で行動（トリックルーム中は最後）',
        });
    }

    if ((roleState.adrenalineTurnsRemaining ?? 0) > 0) {
        const remainingTurns = roleState.adrenalineTurnsRemaining ?? 0;
        const buffAtk = roleState.adrenalineBuff?.atk ?? 0;
        const buffSpe = roleState.adrenalineBuff?.spe ?? 0;
        effects.push({
            key: 'adrenaline',
            icon: '💉',
            label: 'アドレナリン',
            value: `残り${remainingTurns}`,
            color: '#fb923c',
            tooltip: `追加Spe+${buffSpe} / 追加Atk+${buffAtk}（次の自分ターン終了時に反動）`,
        });
    }

    if (roleState.adrenalineReboundApplied) {
        const reboundAtk = roleState.adrenalineReboundApplied.atk ?? 0;
        const reboundSpe = roleState.adrenalineReboundApplied.spe ?? 0;
        effects.push({
            key: 'adrenaline-rebound',
            icon: '🥶',
            label: '反動',
            color: '#94a3b8',
            tooltip: `アドレナリン反動: 追加Spe${reboundSpe} / 追加Atk${reboundAtk}`,
        });
    }

    if ((roleState.burnStacks ?? 0) > 0) {
        const burn = roleState.burnStacks ?? 0;
        effects.push({
            key: 'burn',
            icon: '🔥',
            label: '炎上',
            value: burn,
            color: '#f97316',
            tooltip:
                roleId === 'flame'
                    ? `炎上${burn}: ターン終了時に${burn}回復し、炎上-1`
                    : `炎上${burn}: ターン終了時に${burn}ダメージを受け、炎上-1`,
        });
    }

    if ((roleState.bleedStacks ?? 0) > 0) {
        const bleed = roleState.bleedStacks ?? 0;
        effects.push({
            key: 'bleed',
            icon: '🩸',
            label: '出血',
            value: bleed,
            color: '#fb7185',
            tooltip: `出血${bleed}: 行動する度に特殊1ダメージ / ターン終了時に特殊1ダメージ＋出血-1`,
        });
    }

    if (roleState.timedBomb && typeof roleState.timedBomb.count === 'number' && Number.isFinite(roleState.timedBomb.count)) {
        const count = Math.max(0, Math.floor(roleState.timedBomb.count));
        effects.push({
            key: 'timed-bomb',
            icon: '💣',
            label: '時限爆弾',
            value: count,
            color: '#f59e0b',
            tooltip: `時限爆弾${count}: ターン終了ごとに-1 / 0で固定10ダメージ`,
        });
    }

    if (Array.isArray(roleState.futureSight) && roleState.futureSight.length > 0) {
        const counts = roleState.futureSight
            .map((entry) => (typeof entry.count === 'number' ? Math.max(0, Math.floor(entry.count)) : 0))
            .filter((value) => Number.isFinite(value));
        const next = counts.length > 0 ? Math.min(...counts) : 0;
        effects.push({
            key: 'future-sight',
            icon: '🔮',
            label: '未来予知',
            value: `残り${next}`,
            color: '#a855f7',
            tooltip: 'ターン終了ごとにカウントが減り、0で予知攻撃が発動',
        });
    }

    if ((roleState.shockTokens ?? 0) > 0) {
        const shock = roleState.shockTokens ?? 0;
        effects.push({
            key: 'shock',
            icon: '⚡',
            label: '感電',
            value: shock,
            color: '#eab308',
            tooltip: `感電${shock}: 5ごとにBraを1失い、その度に感電を消費`,
        });
    }

    if ((roleState.waterloggedStacks ?? 0) > 0) {
        const water = roleState.waterloggedStacks ?? 0;
        effects.push({
            key: 'waterlogged',
            icon: '🌊',
            label: '水びたし',
            value: water,
            color: '#38bdf8',
            tooltip: `水びたし${water}: Spe-${water} / ターン終了時に水びたし×10%で風邪を付与し、水びたし-1`,
        });
    }

    if ((roleState.coldStacks ?? 0) > 0) {
        const cold = roleState.coldStacks ?? 0;
        effects.push({
            key: 'cold',
            icon: '🤧',
            label: '風邪',
            value: cold,
            color: '#60a5fa',
            tooltip: `風邪${cold}: ターン終了時に1ダメージ / 20%で自然回復`,
        });
    }

    if ((roleState.gazeMarks ?? 0) > 0) {
        const marks = roleState.gazeMarks ?? 0;
        effects.push({
            key: 'gaze',
            icon: '👁️',
            label: '凝視',
            value: marks,
            color: '#a78bfa',
            tooltip: `凝視${marks}: ロール攻撃時に追加固定 2^(1+凝視) ダメージ`,
        });
    }

    if ((roleState.silenceTurns ?? 0) > 0) {
        const turns = roleState.silenceTurns ?? 0;
        effects.push({
            key: 'silence-role',
            icon: '🤐',
            label: '沈黙',
            value: turns,
            color: '#94a3b8',
            tooltip: `沈黙${turns}: 呪文カードを使用できない（ターン終了時に-1）`,
        });
    }

    if ((roleState.invincibleStacks ?? 0) > 0) {
        const stacks = roleState.invincibleStacks ?? 0;
        effects.push({
            key: 'invincible',
            icon: '🛡️',
            label: '無敵',
            value: stacks,
            color: '#22c55e',
            tooltip: `無敵${stacks}: 被ダメージ時に1消費してダメージを0にできる`,
        });
    }

    if ((roleState.mineChancePercent ?? 0) > 0) {
        const chance = roleState.mineChancePercent ?? 0;
        effects.push({
            key: 'mine-chance',
            icon: '💥',
            label: '地雷率',
            value: `${chance}%`,
            color: '#f59e0b',
            tooltip: `地雷の発動率: ${chance}%`,
        });
    }

    if ((roleState.chargeTokens ?? 0) > 0) {
        const charge = roleState.chargeTokens ?? 0;
        effects.push({
            key: 'charge',
            icon: '🔋',
            label: '蓄電',
            value: charge,
            color: '#38bdf8',
            tooltip: `蓄電${charge}: ロール/カード効果で消費されるトークン`,
        });
    }

    if (roleState.surgeryPhase === 'immobilize') {
        effects.push({
            key: 'surgery-immobilize',
            icon: '🩺',
            label: '手術準備中',
            color: '#a855f7',
            tooltip: '次のターンは行動不可（手術中）',
        });
    } else if (roleState.surgeryPhase === 'heal') {
        effects.push({
            key: 'surgery-heal',
            icon: '❤️‍🩹',
            label: '手術回復待ち',
            color: '#a855f7',
            tooltip: '次のターン開始時にHP+15',
        });
    }

    if ((roleState.pendingBraPenalty ?? 0) > 0) {
        const pen = roleState.pendingBraPenalty ?? 0;
        effects.push({
            key: 'anesthesia',
            icon: '💉',
            label: '麻酔',
            value: pen,
            color: '#38bdf8',
            tooltip: `次のターン Bra-${pen}`,
        });
    }

    if (roleState.pendingStatDebuff) {
        const { stat, value } = roleState.pendingStatDebuff;
        effects.push({
            key: 'pending-debuff',
            icon: '📉',
            label: `弱体: ${stat.toUpperCase()}`,
            value,
            color: '#f87171',
            tooltip: `${stat.toUpperCase()}${value}: 次にダメージを受けるまで継続`,
        });
    }

    const stunUntilRound = roleState.stunUntilRound;
    const hasStunRound = typeof stunUntilRound === 'number' && Number.isFinite(stunUntilRound);
    const stunPenalty = roleState.stunSpePenalty ?? 0;
    if (hasStunRound || stunPenalty !== 0) {
        const remain = hasStunRound && currentRound ? Math.max(0, stunUntilRound - currentRound + 1) : undefined;
        effects.push({
            key: 'stun',
            icon: '🛑',
            label: 'スタン',
            value: remain,
            color: '#facc15',
            tooltip: 'Speが0になる',
        });
    }

    if ((roleState.dizzyTurns ?? 0) > 0) {
        const remain = roleState.dizzyTurns ?? 0;
        effects.push({
            key: 'dizzy',
            icon: '💫',
            label: 'めまい',
            value: remain,
            color: '#fb7185',
            tooltip: 'ターン終了時に-1。手札からカードを使うと50%で不発。',
        });
    }

    if (roleState.tauntUntilNextTurnStart) {
        effects.push({
            key: 'taunt',
            icon: '🧲',
            label: 'このゆびとまれ',
            value: '次T',
            color: '#60a5fa',
            tooltip: '次の自分ターン開始まで、対象選択は強制的に自分が対象になる。',
        });
    }

    if (roleState.nextRoleAttackIgnoreDefense) {
        effects.push({
            key: 'feint',
            icon: '👁️‍🗨️',
            label: 'フェイント',
            value: '次',
            color: '#a78bfa',
            tooltip: '次のロール攻撃は防御カードを無視する',
        });
    }

    const nextAtkBonus = roleState.nextRoleAttackAtkBonus ?? 0;
    if (nextAtkBonus !== 0) {
        effects.push({
            key: 'next-role-atk-bonus',
            icon: '🗡️',
            label: '次攻撃強化',
            value: nextAtkBonus > 0 ? `+${Math.floor(nextAtkBonus)}` : `${Math.floor(nextAtkBonus)}`,
            color: '#34d399',
            tooltip: `次のロール攻撃のAtk${nextAtkBonus >= 0 ? '+' : ''}${Math.floor(nextAtkBonus)}`,
        });
    }


    const suppressedUntil = roleState.suppressedUntilRound;
    if (typeof suppressedUntil === 'number') {
        const remain = currentRound ? Math.max(0, suppressedUntil - currentRound + 1) : undefined;
        effects.push({
            key: 'suppressed',
            icon: '🔒',
            label: '抑制',
            value: remain ? `${remain}R` : undefined,
            color: '#94a3b8',
            tooltip: '次のラウンド終了まで固有能力なし',
        });
    }

    const cardBonus = roleState.cardEffectBonus ?? 0;
    if (cardBonus !== 0) {
        effects.push({
            key: 'card-bonus',
            icon: '✨',
            label: 'アイテム強化',
            value: `+${cardBonus}`,
            color: '#f97316',
            tooltip: `次に使うアイテムの数値+${cardBonus}`,
        });
    }

    return effects;
};

const groupInstallsByPlayer = (
    runtimeStates: Record<string, PlayerRuntimeState | undefined>,
    cardLookup: Map<string, CardDefinition>
): Record<string, Array<{ instanceId: string; cardId: string; name: string; text?: string; category?: string; kind?: string }>> => {
    const result: Record<string, Array<{ instanceId: string; cardId: string; name: string; text?: string; category?: string; kind?: string }>> = {};
    Object.entries(runtimeStates).forEach(([playerId, runtime]) => {
        if (!runtime || !runtime.installs.length) {
            return;
        }
        result[playerId] = runtime.installs.map((install) => {
            const cardInfo = cardLookup.get(install.cardId);
            return {
                instanceId: install.instanceId,
                cardId: install.cardId,
                name: cardInfo?.name ?? install.cardId,
                text: cardInfo?.text,
                category: cardInfo?.category,
                kind: cardInfo?.kind,
            };
        });
    });
    return result;
};

type StoredPlayerInfo = ReturnType<typeof getRememberedMatchPlayer>;
const Match: React.FC = () => {
    const DAMAGE_POPUP_DURATION_MS = 1800;
    const ACTION_TOAST_DURATION_MS = 1200;

    const { id } = useParams();
    const navigate = useNavigate();
    const [state, setState] = React.useState<GameState | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [wsConnected, setWsConnected] = React.useState(false);
    const [reconnectNonce, setReconnectNonce] = React.useState(0);
    const [localPlayerInfo, setLocalPlayerInfo] = React.useState<StoredPlayerInfo>(() => {
        if (typeof window === 'undefined' || !id) return null;
        return getRememberedMatchPlayer(id);
    });
    const [isSpectator, setIsSpectator] = React.useState<boolean>(() => {
        if (typeof window === 'undefined' || !id) return false;
        return getRememberedMatchSpectator(id);
    });
    const [tooltip, setTooltip] = React.useState<
        { title: string; text: string; x: number; y: number; adjustments?: CardEffectAdjustment[] } | null
    >(null);
    const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
    const [selectedStatChoice, setSelectedStatChoice] = React.useState<'atk' | 'def' | 'spe' | 'bra' | ''>('');
    const [roleActionChoices, setRoleActionChoices] = React.useState<Record<string, Record<string, string>>>({});
    const [roleActionBusy, setRoleActionBusy] = React.useState(false);
    const [promptBusy, setPromptBusy] = React.useState(false);
    const [infoDrawBusy, setInfoDrawBusy] = React.useState(false);
    const [helpOpen, setHelpOpen] = React.useState<'deck' | 'rules' | 'roles' | null>(null);
    const [deckSearchText, setDeckSearchText] = React.useState('');
    const [deckCategoryFilter, setDeckCategoryFilter] = React.useState<DeckCategoryFilter>('all');
    const [deckZoneFilter, setDeckZoneFilter] = React.useState<DeckZoneFilter>('all');
    const [deckInspectMode, setDeckInspectMode] = React.useState<'remaining' | 'all'>('remaining');
    const [deckSortKey, setDeckSortKey] = React.useState<DeckSortKey>('name');
    const [deckSortDir, setDeckSortDir] = React.useState<DeckSortDir>('asc');
    const [jesterSpin, setJesterSpin] = React.useState<{ label: string; result?: string } | null>(null);
    const [lastJesterLogKey, setLastJesterLogKey] = React.useState<string | null>(null);
    const [damagePopup, setDamagePopup] = React.useState<DamageResolvedLog | null>(null);
    const [damagePopupQueue, setDamagePopupQueue] = React.useState<DamageResolvedLog[]>([]);
    const [actionToast, setActionToast] = React.useState<ActionToastLog | null>(null);
    const [actionToastQueue, setActionToastQueue] = React.useState<ActionToastLog[]>([]);
    const [matchResultOpen, setMatchResultOpen] = React.useState(false);
    const [roleActionPage, setRoleActionPage] = React.useState(0);
    const [viewportSize, setViewportSize] = React.useState<{ width: number; height: number }>(() => ({
        width: typeof window === 'undefined' ? MATCH_DESIGN_WIDTH : window.innerWidth,
        height: typeof window === 'undefined' ? MATCH_DESIGN_HEIGHT : window.innerHeight,
    }));
    const matchResultShownRef = React.useRef<string | null>(null);
    const [selectionModal, setSelectionModal] = React.useState<
        | {
              type: 'target';
              title: string;
              rule: TargetRule;
              context?: TargetSelectionContext;
              note?: string;
              forcedTargetId?: string;
          }
        | { type: 'stat'; title: string; options?: Array<'atk' | 'def' | 'spe' | 'bra'> }
        | { type: 'chooseOne'; title: string; options: Array<{ value: string; label: string }> }
        | null
    >(null);
    const selectionResolveRef = React.useRef<((value: string | null) => void) | null>(null);
    const seenDamagePopupKeysRef = React.useRef<Set<string>>(new Set());
    const damagePopupTimerRef = React.useRef<number | null>(null);
    const seenActionToastKeysRef = React.useRef<Set<string>>(new Set());
    const actionToastTimerRef = React.useRef<number | null>(null);
    const actionToastInitializedRef = React.useRef(false);
    const jesterSpinIntervalRef = React.useRef<number | null>(null);
    const jesterSpinTimeoutRef = React.useRef<number | null>(null);
    const jesterSpinStartRef = React.useRef<number | null>(null);
    const jesterSpinClearRef = React.useRef<number | null>(null);
    const wsRef = React.useRef<WebSocket | null>(null);
    const localPlayerNameRef = React.useRef<string | null>(null);
    const sendWsAction = React.useCallback((payload: ActionPayload): boolean => {
        const ws = wsRef.current;
        if (!ws) return false;
        if (ws.readyState !== WebSocket.OPEN) return false;
        try {
            ws.send(JSON.stringify({ t: 'action', payload }));
            return true;
        } catch {
            return false;
        }
    }, []);

    const requestReconnect = React.useCallback(() => {
        setError(null);
        setWsConnected(false);
        try {
            wsRef.current?.close();
        } catch {
            // noop
        }
        setReconnectNonce((prev) => prev + 1);
    }, []);

    const localPlayerId = localPlayerInfo?.id ?? null;
    const localPlayerName = localPlayerInfo?.name;

    React.useEffect(() => {
        if (typeof window === 'undefined' || !id) {
            setIsSpectator(false);
            return;
        }
        setIsSpectator(getRememberedMatchSpectator(id));
    }, [id]);

    React.useEffect(() => {
        if (!id) return;
        if (!isSpectator) return;
        if (!localPlayerInfo) return;
        setLocalPlayerInfo(null);
        clearRememberedMatchPlayer(id);
    }, [id, isSpectator, localPlayerInfo]);

    React.useEffect(() => {
        localPlayerNameRef.current = localPlayerName ?? null;
    }, [localPlayerName]);

    React.useEffect(() => {
        if (!id) return;
        if (typeof window === 'undefined') return;

        const url = `${wsBase(API_BASE)}/rooms/${encodeURIComponent(id)}/ws`;
        let reconnectTimer: number | null = null;
        let pingTimer: number | null = null;
        let lastPongAt = Date.now();
        let backoffMs = 500;
        let closedByClient = false;
        let startTimer: number | null = null;

        const cleanup = () => {
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            if (pingTimer) window.clearInterval(pingTimer);
            reconnectTimer = null;
            pingTimer = null;
        };

        const closeCurrent = () => {
            const prev = wsRef.current;
            wsRef.current = null;
            if (prev) {
                try {
                    prev.close();
                } catch {
                    // noop
                }
            }
        };

        const connect = () => {
            cleanup();
            closeCurrent();

            const ws = new WebSocket(url);
            wsRef.current = ws;
            closedByClient = false;
            const isCurrent = () => wsRef.current === ws;

            const sendJoin = () => {
                const name = (localPlayerNameRef.current ?? 'Player').trim() || 'Player';
                try {
                    ws.send(JSON.stringify({ t: 'join', name }));
                } catch {
                    // noop
                }
            };

            const scheduleReconnect = () => {
                if (!isCurrent()) return;
                if (closedByClient) return;
                setWsConnected(false);
                cleanup();
                if (reconnectTimer) window.clearTimeout(reconnectTimer);
                const wait = Math.min(5000, backoffMs);
                backoffMs = Math.min(5000, Math.floor(backoffMs * 1.6));
                reconnectTimer = window.setTimeout(() => connect(), wait);
            };

            ws.addEventListener('open', () => {
                if (!isCurrent()) return;
                setWsConnected(true);
                backoffMs = 500;
                lastPongAt = Date.now();
                sendJoin();
                pingTimer = window.setInterval(() => {
                    const now = Date.now();
                    if (now - lastPongAt > 60000) {
                        try {
                            ws.close();
                        } catch {
                            // noop
                        }
                        return;
                    }
                    if (ws.readyState !== WebSocket.OPEN) {
                        return;
                    }
                    try {
                        ws.send(JSON.stringify({ t: 'ping' }));
                    } catch {
                        // noop
                    }
                }, 25000);
            });

            ws.addEventListener('message', (event) => {
                if (!isCurrent()) return;
                let parsed: any = null;
                try {
                    parsed = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                if (parsed?.t === 'pong') {
                    lastPongAt = Date.now();
                    return;
                }
                if (parsed?.t === 'state') {
                    setState(parsed.state as GameState);
                    setError(null);
                    return;
                }
                if (parsed?.t === 'lobby') {
                    if (id && localPlayerId && localPlayerName) {
                        rememberLobbyPlayer(id, localPlayerId, localPlayerName);
                        rememberLobbySpectator(id, Boolean(isSpectator));
                    }
                    navigate(`/lobby/${encodeURIComponent(id)}`);
                    return;
                }
                if (parsed?.t === 'error') {
                    setError(String(parsed.message ?? 'サーバーエラー'));
                }
            });

            ws.addEventListener('close', () => scheduleReconnect());
            ws.addEventListener('error', () => scheduleReconnect());
        };

        // React StrictMode (dev) で Effect が二重実行されると、接続直後に close され
        // 「WebSocket is closed before the connection is established」が出やすい。
        startTimer = window.setTimeout(() => connect(), 0);

        return () => {
            closedByClient = true;
            if (startTimer) window.clearTimeout(startTimer);
            cleanup();
            closeCurrent();
        };
    }, [id, navigate, reconnectNonce]);

    React.useEffect(() => {
        if (!id) return;
        if (!state) return;
        if (isSpectator) return;
        if (!localPlayerId) return;
        if (state.players.some((p) => p.id === localPlayerId)) return;

        if (localPlayerName) {
            const fallback = state.players.find((p) => p.name === localPlayerName);
            if (fallback) {
                rememberMatchPlayer(id, fallback.id, fallback.name);
                setLocalPlayerInfo({ id: fallback.id, name: fallback.name });
                return;
            }
        }

        setLocalPlayerInfo(null);
        clearRememberedMatchPlayer(id);
    }, [id, state, isSpectator, localPlayerId, localPlayerName]);

    React.useEffect(() => {
        if (!state || state.players.length === 0) return;
        if (!selectedTargetId) return;
        if (state.players.some((p) => p.id === selectedTargetId)) {
            return;
        }
        setSelectedTargetId(null);
    }, [state, selectedTargetId]);

    React.useEffect(() => {
        if (!id || !state) return;
        if (state.status !== 'finished') return;
        if (matchResultShownRef.current === id) return;

        matchResultShownRef.current = id;
        setMatchResultOpen(true);
    }, [id, state]);

    React.useEffect(() => {
        if (!id) return;
        const status = state?.status;
        if (!status) return;
        if (status === 'finished') return;

        setMatchResultOpen(false);
        matchResultShownRef.current = null;
    }, [id, state?.status]);

    if (!id) {
        return <div className={styles.page}>マッチIDが不正です。</div>;
    }

    const currentPlayerId = state?.currentPlayerId ?? state?.turnOrder?.[state?.currentTurn ?? 0];
    const isCurrentPlayer = (playerId: string) => currentPlayerId === playerId;
    const hands = state?.hands ?? {};
    const runtimeStates = state?.board?.playerStates ?? {};
    const installsByPlayer = React.useMemo(() => (state ? groupInstallsByPlayer(runtimeStates, CARD_LOOKUP) : {}), [state, runtimeStates]);
    const playerName = React.useCallback((pid: string | undefined) => state?.players.find((p) => p.id === pid)?.name ?? '不明なプレイヤー', [state?.players]);
    const teamMode = Boolean(state?.teamMode);

    const showFloatingTooltip = React.useCallback(
        (title: string, text: string, event: React.MouseEvent) => {
            const offsetX = 16;
            const offsetY = 14;
            setTooltip({
                title,
                text,
                x: event.clientX + offsetX,
                y: event.clientY + offsetY,
            });
        },
        [setTooltip]
    );

    const clearFloatingTooltip = React.useCallback(() => {
        setTooltip(null);
    }, [setTooltip]);

    const getTeamDef = React.useCallback(
        (team?: TeamColor | null) => (team ? TEAM_OPTIONS.find((opt) => opt.id === team) ?? null : null),
        []
    );
    const renderPlayerChip = React.useCallback(
        (pid: string | undefined) => {
            const name = playerName(pid);
            const team = state?.players.find((p) => p.id === pid)?.team;
            const teamDef = getTeamDef(team);
            if (!teamMode || !teamDef) {
                return <>{name}</>;
            }
            return (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: teamDef.bg,
                        border: `1px solid ${teamDef.border}`,
                        color: teamDef.text,
                        fontWeight: 900,
                    }}
                >
                    {name}
                </span>
            );
        },
        [getTeamDef, playerName, state?.players, teamMode]
    );
    const renderTeamChip = React.useCallback(
        (team: TeamColor) => {
            const teamDef = getTeamDef(team);
            if (!teamDef) return <>{`${team}チーム`}</>;
            return (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: teamDef.bg,
                        border: `1px solid ${teamDef.border}`,
                        color: teamDef.text,
                        fontWeight: 900,
                    }}
                >
                    {teamDef.label}チーム
                </span>
            );
        },
        [getTeamDef]
    );
    const isPlayerDefeated = (pid: string) => Boolean(runtimeStates[pid]?.isDefeated);
    const braTokens = state?.braTokens ?? {};
    const roleAttackUsed = state?.roleAttackUsed ?? {};
    const logs: GameLogEntry[] = state?.logs ?? [];
    const logsToDisplay = React.useMemo(() => buildTurnLogDisplay(logs, 20), [logs]);
    const totalHandCount = React.useMemo(
        () => Object.values(hands).reduce((sum, hand) => sum + hand.length, 0),
        [hands]
    );
    const totalInstallCount = React.useMemo(
        () =>
            Object.values(runtimeStates).reduce(
                (sum, runtime) => sum + (runtime?.installs?.length ?? 0),
                0
            ),
        [runtimeStates]
    );
    const remainingDeckCount = (state?.sharedDeck.length ?? 0) + totalHandCount;
    const totalDeckCount =
        remainingDeckCount + (state?.sharedDiscard.length ?? 0) + totalInstallCount;
    const deckInfo = `${remainingDeckCount}枚 / ${totalDeckCount}枚`;
    const deckPileInfo = `${state?.sharedDeck.length ?? 0}枚 / 捨て札 ${state?.sharedDiscard.length ?? 0}枚`;
    const currentPlayerName = state?.players.find((p) => p.id === currentPlayerId)?.name ?? '未設定';
    const isTrickRoomActive =
        state?.turnOrderMode === 'ascendingSpe' &&
        (state?.turnOrderModeUntilRound ? (state?.round ?? 0) <= state.turnOrderModeUntilRound : true);
    const trickRoomLabel = isTrickRoomActive
        ? `トリックルーム中${state?.turnOrderModeUntilRound ? ` (〜R${state.turnOrderModeUntilRound})` : ''}`
        : null;
    const localPlayer = state?.players.find((p) => p.id === localPlayerId) ?? null;
    const localPlayerRuntime = localPlayerId ? runtimeStates[localPlayerId] : undefined;
    const isLocalDefeated = Boolean(localPlayerRuntime?.isDefeated);
    const sealedHand = localPlayerRuntime?.roleState?.sealedHand ?? [];
    const sealedHandIndexSet = React.useMemo(() => new Set(sealedHand.map((entry) => entry.index)), [sealedHand]);
    const cursedHand = localPlayerRuntime?.roleState?.cursedHand ?? [];
    const cursedHandIndexMap = React.useMemo(
        () => new Map(cursedHand.map((entry) => [entry.index, entry.curseId])),
        [cursedHand]
    );
    const forcedHandIndexSet = React.useMemo(() => {
        if (!localPlayerId) return new Set<number>();
        const hand = hands[localPlayerId] ?? [];
        const set = new Set<number>();
        cursedHand.forEach((entry) => {
            if (entry.curseId !== 'force') return;
            if (hand[entry.index] !== entry.cardId) return;
            if (sealedHandIndexSet.has(entry.index)) return;
            set.add(entry.index);
        });
        return set;
    }, [cursedHand, hands, localPlayerId, sealedHandIndexSet]);
    const bloodPatternHand = localPlayerRuntime?.roleState?.bloodPatternHand ?? [];
    const bloodPatternIndexSet = React.useMemo(() => {
        if (!localPlayerId) return new Set<number>();
        const hand = hands[localPlayerId] ?? [];
        const set = new Set<number>();
        bloodPatternHand.forEach((entry) => {
            if (hand[entry.index] !== entry.cardId) return;
            set.add(entry.index);
        });
        return set;
    }, [bloodPatternHand, hands, localPlayerId]);
    const localMaxBra =
        localPlayerRuntime
            ? localPlayerRuntime.baseStats.bra + localPlayerRuntime.statTokens.bra + localPlayerRuntime.turnBoosts.bra
            : null;
    const rescueBraCost = localPlayerRuntime ? Math.max(1, Math.floor(localPlayerRuntime.maxHp / 4)) : null;
    const showRescueInDrawSlot = localMaxBra !== null && localMaxBra <= 0 && rescueBraCost !== null;
    const copiedRoleIds = React.useMemo(
        () => localPlayerRuntime?.roleState?.copiedRoleAbilities?.map((entry) => entry.roleId) ?? [],
        [localPlayerRuntime?.roleState?.copiedRoleAbilities]
    );
    const hasRoleAbility = React.useCallback(
        (roleId: string) => Boolean(localPlayer?.roleId === roleId || copiedRoleIds.includes(roleId)),
        [copiedRoleIds, localPlayer?.roleId]
    );
    const localRoleActions = getRoleActionsForRoleIds([localPlayer?.roleId, ...copiedRoleIds]);
    const roleActionsPerPage = 4;
    const localRoleActionPageCount = Math.max(1, Math.ceil(localRoleActions.length / roleActionsPerPage));
    const safeRoleActionPage = Math.min(roleActionPage, Math.max(0, localRoleActionPageCount - 1));
    const visibleLocalRoleActions = localRoleActions.slice(
        safeRoleActionPage * roleActionsPerPage,
        safeRoleActionPage * roleActionsPerPage + roleActionsPerPage
    );
    const cardEffectMultiplier =
        localPlayerRuntime?.roleState?.cardEffectMultiplier ?? (hasRoleAbility('efficiency') ? 2 : 1);
    const cardEffectBonus = localPlayerRuntime?.roleState?.cardEffectBonus ?? 0;
    const pendingPrompt = state?.pendingPrompt ?? null;
    const pendingCard = pendingPrompt ? CARD_LOOKUP.get(pendingPrompt.cardId) : undefined;
    const pendingEffect = pendingPrompt && pendingCard ? pendingCard.effects?.[pendingPrompt.effectIndex] : undefined;
    const pendingPromptLabel = pendingPrompt?.promptLabel ?? pendingCard?.name ?? pendingPrompt?.cardId;
    const isPromptTarget = Boolean(pendingPrompt && localPlayer?.id === pendingPrompt.targetId);
    const pendingInfoDraw = state?.pendingInfoDraw ?? null;
    const pendingInfoDrawPlayer = pendingInfoDraw ? state?.players.find((p) => p.id === pendingInfoDraw.playerId) : undefined;
    const isInfoDrawTarget = Boolean(pendingInfoDraw && localPlayer?.id === pendingInfoDraw.playerId);
    const isPromptBlocking = Boolean(pendingPrompt || pendingInfoDraw);
    const hostPlayerId = state?.players[0]?.id ?? null;
    const isHost = Boolean(hostPlayerId && localPlayerId && hostPlayerId === localPlayerId);
    const otherPlayers = React.useMemo(
        () => (state?.players ?? []).filter((p) => !localPlayer || p.id !== localPlayer.id),
        [localPlayer, state?.players]
    );
    const livingPlayers = React.useMemo(() => {
        if (!state) return [];
        return state.players.filter((p) => !runtimeStates[p.id]?.isDefeated);
    }, [state, runtimeStates]);
    const winnerText = React.useMemo<React.ReactNode>(() => {
        if (!state) return '';
        if (state.winnerTeam) {
            return (
                <>
                    {renderTeamChip(state.winnerTeam)} の勝利！
                </>
            );
        }
        if (state.winnerId) {
            return (
                <>
                    {renderPlayerChip(state.winnerId)} の勝利！
                </>
            );
        }
        if (livingPlayers.length === 1) {
            return (
                <>
                    {renderPlayerChip(livingPlayers[0].id)} の勝利！
                </>
            );
        }
        if (livingPlayers.length === 0) {
            return '全員脱落（引き分け）';
        }
        return (
            <>
                決着（生存: {livingPlayers.map((p, idx) => (
                    <React.Fragment key={p.id}>
                        {idx > 0 ? ', ' : ''}
                        {renderPlayerChip(p.id)}
                    </React.Fragment>
                ))}）
            </>
        );
    }, [livingPlayers, renderPlayerChip, renderTeamChip, state]);
    const allCards = (cardsCatalogRaw as CardsFile).cards ?? [];
    const jesterSpinItems = React.useMemo(
        () => [
            'ドロー+1',
            '最大HP+3/HP+3',
            'Atk+3',
            'Def+2',
            'Spe+3',
            'ランダム3ダメージ',
            'HP+8',
            '全員に10ダメージ',
            '大強化',
            '火炎2',
            'Bra-1',
            'HP=1',
            '手札全捨て',
            '次のアイテム+2',
        ],
        []
    );
    const deckCounts = React.useMemo(() => {
        if (!state) return [];
        const counts = new Map<
            string,
            { total: number; remaining: number; inDeck: number; inHand: number; inDiscard: number; inInstall: number }
        >();
        state.sharedDeck.forEach((cardId) => {
            const entry = counts.get(cardId) ?? {
                total: 0,
                remaining: 0,
                inDeck: 0,
                inHand: 0,
                inDiscard: 0,
                inInstall: 0,
            };
            entry.total += 1;
            entry.remaining += 1;
            entry.inDeck += 1;
            counts.set(cardId, entry);
        });
        Object.values(state.hands).forEach((hand) => {
            hand.forEach((cardId) => {
                const entry = counts.get(cardId) ?? {
                    total: 0,
                    remaining: 0,
                    inDeck: 0,
                    inHand: 0,
                    inDiscard: 0,
                    inInstall: 0,
                };
                entry.total += 1;
                entry.remaining += 1;
                entry.inHand += 1;
                counts.set(cardId, entry);
            });
        });
        state.sharedDiscard.forEach((cardId) => {
            const entry = counts.get(cardId) ?? {
                total: 0,
                remaining: 0,
                inDeck: 0,
                inHand: 0,
                inDiscard: 0,
                inInstall: 0,
            };
            entry.total += 1;
            entry.inDiscard += 1;
            counts.set(cardId, entry);
        });
        Object.values(state.board.playerStates).forEach((runtime) => {
            runtime.installs.forEach((install) => {
                const entry = counts.get(install.cardId) ?? {
                    total: 0,
                    remaining: 0,
                    inDeck: 0,
                    inHand: 0,
                    inDiscard: 0,
                    inInstall: 0,
                };
                entry.total += 1;
                entry.inInstall += 1;
                counts.set(install.cardId, entry);
            });
        });
        return Array.from(counts.entries())
            .map(([cardId, count]) => ({
                cardId,
                count,
                info: CARD_LOOKUP.get(cardId),
            }))
            .sort((a, b) => (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId));
    }, [state]);

    const deckCountsToDisplay = React.useMemo(() => {
        const query = deckSearchText.trim();
        const q = query.toLowerCase();
        const dirFactor = deckSortDir === 'desc' ? -1 : 1;

        const filtered = deckCounts.filter(({ cardId, count, info }) => {
            if (deckInspectMode === 'remaining' && count.remaining === 0) {
                return false;
            }
            if (deckCategoryFilter !== 'all' && info?.category !== deckCategoryFilter) {
                return false;
            }
            if (deckZoneFilter === 'deck' && count.inDeck === 0) return false;
            if (deckZoneFilter === 'hand' && count.inHand === 0) return false;
            if (deckZoneFilter === 'discard' && count.inDiscard === 0) return false;
            if (deckZoneFilter === 'install' && count.inInstall === 0) return false;
            if (deckZoneFilter === 'remaining' && count.remaining === 0) return false;
            if (deckZoneFilter === 'empty' && count.remaining !== 0) return false;
            if (q.length > 0) {
                const name = (info?.name ?? cardId).toLowerCase();
                const text = (info?.text ?? '').toLowerCase();
                if (!name.includes(q) && !text.includes(q)) {
                    return false;
                }
            }
            return true;
        });

        const getCost = (info?: CardDefinition) => (typeof info?.cost === 'number' ? info.cost : 1);
        const getCategoryKey = (info?: CardDefinition) => getCategoryLabel(info?.category) ?? info?.category ?? '';

        return filtered.slice().sort((a, b) => {
            switch (deckSortKey) {
                case 'remaining': {
                    const diff = (a.count.remaining ?? 0) - (b.count.remaining ?? 0);
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'total': {
                    const diff = (a.count.total ?? 0) - (b.count.total ?? 0);
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'cost': {
                    const diff = getCost(a.info) - getCost(b.info);
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'category': {
                    const diff = getCategoryKey(a.info).localeCompare(getCategoryKey(b.info));
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'name':
                default:
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
            }
        });
    }, [
        deckCounts,
        deckInspectMode,
        deckSearchText,
        deckCategoryFilter,
        deckZoneFilter,
        deckSortKey,
        deckSortDir,
    ]);

    const closeDamagePopup = React.useCallback(() => {
        if (damagePopupTimerRef.current) {
            window.clearTimeout(damagePopupTimerRef.current);
            damagePopupTimerRef.current = null;
        }
        setDamagePopup(null);
    }, []);

    React.useEffect(() => {
        setRoleActionChoices({});
    }, [localPlayer?.roleId, copiedRoleIds.join('|')]);

    React.useEffect(() => {
        const onResize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    React.useEffect(() => {
        return () => {
            if (jesterSpinIntervalRef.current) {
                window.clearInterval(jesterSpinIntervalRef.current);
            }
            if (jesterSpinTimeoutRef.current) {
                window.clearTimeout(jesterSpinTimeoutRef.current);
            }
            if (jesterSpinClearRef.current) {
                window.clearTimeout(jesterSpinClearRef.current);
            }
        };
    }, []);

    const clearJesterSpinTimers = React.useCallback(() => {
        if (jesterSpinIntervalRef.current) {
            window.clearInterval(jesterSpinIntervalRef.current);
            jesterSpinIntervalRef.current = null;
        }
        if (jesterSpinTimeoutRef.current) {
            window.clearTimeout(jesterSpinTimeoutRef.current);
            jesterSpinTimeoutRef.current = null;
        }
        if (jesterSpinClearRef.current) {
            window.clearTimeout(jesterSpinClearRef.current);
            jesterSpinClearRef.current = null;
        }
    }, []);

    const runJesterSpinWithResult = React.useCallback(
        (resultText: string) => {
            clearJesterSpinTimers();
            let spinIndex = 0;
            setJesterSpin({ label: jesterSpinItems[0] });
            jesterSpinIntervalRef.current = window.setInterval(() => {
                spinIndex = (spinIndex + 1) % jesterSpinItems.length;
                setJesterSpin({ label: jesterSpinItems[spinIndex] });
            }, 90);
            jesterSpinTimeoutRef.current = window.setTimeout(() => {
                if (jesterSpinIntervalRef.current) {
                    window.clearInterval(jesterSpinIntervalRef.current);
                    jesterSpinIntervalRef.current = null;
                }
                setJesterSpin({ label: resultText, result: resultText });
                jesterSpinClearRef.current = window.setTimeout(() => {
                    setJesterSpin(null);
                }, 1000);
            }, 1000);
        },
        [clearJesterSpinTimers, jesterSpinItems]
    );

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        const latest = [...state.logs].reverse().find(isRoleActionLog);
        if (!latest) return;
        if (latest.actionId !== 'jester_random') return;
        const key = `${latest.timestamp}-${latest.playerId}-${latest.actionId}`;
        if (key === lastJesterLogKey) return;
        setLastJesterLogKey(key);
        const resultText = latest.description ?? '道化の効果';
        runJesterSpinWithResult(resultText);
    }, [state?.logs, lastJesterLogKey, localPlayerId, runJesterSpinWithResult]);

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        if (pendingPrompt || pendingInfoDraw) return;
        if (damagePopup) return;
        const makeKey = (entry: DamageResolvedLog) =>
            `${entry.timestamp}-${entry.attackerId ?? 'none'}-${entry.targetId}-${entry.source}-${entry.attempted}-${entry.totalAfterReductions}-${entry.hpDamage}-${entry.tempAbsorbed}`;
        const seen = seenDamagePopupKeysRef.current;
        const fresh = state.logs.filter(isDamageResolvedLog).filter((entry) => {
            const key = makeKey(entry);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (fresh.length === 0) return;
        setDamagePopupQueue((prev) => [...prev, ...fresh]);
    }, [state?.logs, pendingPrompt, pendingInfoDraw, damagePopup]);

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        if (pendingPrompt || pendingInfoDraw) return;
        if (damagePopup) return;
        if (!actionToastInitializedRef.current) {
            const seen = seenActionToastKeysRef.current;
            state.logs.filter(isActionToastLog).forEach((entry) => {
                const common = `${entry.type}-${entry.timestamp}-${entry.round ?? 'n'}`;
                if (entry.type === 'cardPlay') {
                    seen.add(`${common}-${entry.playerId}-${entry.cardId}-${(entry.targets ?? []).join(',')}`);
                } else if (entry.type === 'roleAction') {
                    seen.add(`${common}-${entry.playerId}-${entry.actionId}-${entry.targetId ?? 'none'}`);
                } else if (entry.type === 'turnStart') {
                    seen.add(`${common}-${entry.playerId}-${entry.kind ?? 'n'}`);
                } else if (entry.type === 'roundStart') {
                    seen.add(`${common}-${entry.round ?? 'n'}`);
                } else if (entry.type === 'playerDefeated') {
                    seen.add(`${common}-${entry.playerId}`);
                } else if (entry.type === 'statusEffect') {
                    seen.add(`${common}-${entry.playerId}-${entry.effect}-${entry.amount}-${entry.kind}`);
                } else {
                    seen.add(common);
                }
            });
            actionToastInitializedRef.current = true;
            return;
        }
        const makeKey = (entry: ActionToastLog) => {
            const common = `${entry.type}-${entry.timestamp}-${entry.round ?? 'n'}`;
            switch (entry.type) {
                case 'cardPlay':
                    return `${common}-${entry.playerId}-${entry.cardId}-${(entry.targets ?? []).join(',')}`;
                case 'roleAction':
                    return `${common}-${entry.playerId}-${entry.actionId}-${entry.targetId ?? 'none'}`;
                case 'turnStart':
                    return `${common}-${entry.playerId}-${entry.kind ?? 'n'}`;
                case 'roundStart':
                    return `${common}-${entry.round ?? 'n'}`;
                case 'playerDefeated':
                    return `${common}-${entry.playerId}`;
                case 'statusEffect':
                    return `${common}-${entry.playerId}-${entry.effect}-${entry.amount}-${entry.kind}`;
                default:
                    return common;
            }
        };
        const seen = seenActionToastKeysRef.current;
        const fresh = state.logs.filter(isActionToastLog).filter((entry) => {
            const key = makeKey(entry);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (fresh.length === 0) return;
        setActionToastQueue((prev) => [...prev, ...fresh]);
    }, [state?.logs, pendingPrompt, pendingInfoDraw, damagePopup]);

    React.useEffect(() => {
        if (actionToast) return;
        if (damagePopup) return;
        if (actionToastQueue.length === 0) return;
        const next = actionToastQueue[0] ?? null;
        if (!next) return;
        setActionToast(next);
        setActionToastQueue((prev) => prev.slice(1));
    }, [actionToast, actionToastQueue, damagePopup]);

    React.useEffect(() => {
        if (!actionToast) return;
        if (actionToastTimerRef.current) {
            window.clearTimeout(actionToastTimerRef.current);
        }
        actionToastTimerRef.current = window.setTimeout(() => {
            setActionToast(null);
        }, ACTION_TOAST_DURATION_MS);
        return () => {
            if (actionToastTimerRef.current) {
                window.clearTimeout(actionToastTimerRef.current);
                actionToastTimerRef.current = null;
            }
        };
    }, [actionToast, ACTION_TOAST_DURATION_MS]);

    React.useEffect(() => {
        if (damagePopup) return;
        if (damagePopupQueue.length === 0) return;
        const next = damagePopupQueue[0] ?? null;
        if (!next) return;
        setDamagePopup(next);
        setDamagePopupQueue((prev) => prev.slice(1));
    }, [damagePopup, damagePopupQueue]);

    React.useEffect(() => {
        if (!damagePopup) return;
        if (damagePopupTimerRef.current) {
            window.clearTimeout(damagePopupTimerRef.current);
        }
        damagePopupTimerRef.current = window.setTimeout(() => {
            closeDamagePopup();
        }, DAMAGE_POPUP_DURATION_MS);
        return () => {
            if (damagePopupTimerRef.current) {
                window.clearTimeout(damagePopupTimerRef.current);
                damagePopupTimerRef.current = null;
            }
        };
    }, [damagePopup, closeDamagePopup, DAMAGE_POPUP_DURATION_MS]);

    const requireLocalPlayer = (): string | null => {
        if (!localPlayerId) {
            alert('操作するプレイヤーが設定されていません。');
            return null;
        }
        return localPlayerId;
    };

    const requestSelection = React.useCallback(
        (
            modal:
                | {
                      type: 'target';
                      title: string;
                      rule: TargetRule;
                      context?: TargetSelectionContext;
                      note?: string;
                      forcedTargetId?: string;
                  }
                | { type: 'stat'; title: string; options?: Array<'atk' | 'def' | 'spe' | 'bra'> }
                | { type: 'chooseOne'; title: string; options: Array<{ value: string; label: string }> }
        ) => {
            if (selectionModal) {
                return Promise.resolve<string | null>(null);
            }
            return new Promise<string | null>((resolve) => {
                selectionResolveRef.current = resolve;
                setSelectionModal(modal);
            });
        },
        [selectionModal]
    );

    const closeSelection = React.useCallback((value: string | null) => {
        selectionResolveRef.current?.(value);
        selectionResolveRef.current = null;
        setSelectionModal(null);
    }, []);

    const currentBraValue = localPlayerId ? braTokens[localPlayerId] ?? 0 : 0;
    const attackIsStruggle = currentBraValue <= 0;
    const attackButtonLabel = attackIsStruggle ? '悪あがき' : 'ロール攻撃';
    const roleAttackAlreadyUsed = localPlayerId ? Boolean(roleAttackUsed[localPlayerId]) : true;
    const isBarrage = hasRoleAbility('barrage');
    const allowRepeatRoleAttack = Boolean(isBarrage && !attackIsStruggle);
    const roleAttackDisabled =
        !localPlayer ||
        isLocalDefeated ||
        !isCurrentPlayer(localPlayer.id) ||
        (roleAttackAlreadyUsed && !allowRepeatRoleAttack) ||
        !state?.players.some((player) => player.id !== localPlayerId && !isPlayerDefeated(player.id));

    const describeTargets = (ids?: string[]) => {
        if (!ids || ids.length === 0) {
            return '';
        }
        return ids.map((pid) => playerName(pid)).join(', ');
    };

    const formatLogEntry = (entry: GameLogEntry): React.ReactNode => {
        const roundLabel =
            typeof entry.round === 'number' && Number.isFinite(entry.round)
                ? entry.round
                : typeof state?.round === 'number' && Number.isFinite(state.round)
                  ? state.round
                  : undefined;
        const prefix = roundLabel !== undefined ? `R${roundLabel} ` : '';
        const renderTargets = (ids?: string[]) => {
            if (!ids || ids.length === 0) return null;
            return ids.map((pid, idx) => (
                <React.Fragment key={`${entry.type}-target-${pid}`}>
                    {idx > 0 ? ', ' : ''}
                    {renderPlayerChip(pid)}
                </React.Fragment>
            ));
        };
        switch (entry.type) {
            case 'roundStart':
                return roundLabel !== undefined ? `ラウンド${roundLabel}開始` : 'ラウンド開始';
            case 'turnStart':
                if (entry.label) {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}の{entry.label}
                        </>
                    );
                }
                if (entry.deferred || entry.kind === 'extended') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}の延長ターン開始
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}のターン開始
                    </>
                );
            case 'abilityDamage': {
                const source = entry.sourcePlayerId ? renderPlayerChip(entry.sourcePlayerId) : null;
                if (entry.sourceAbilityId === 'bomb_self_blowback') {
                    return (
                        <>
                            {prefix}
                            {source ?? renderPlayerChip(entry.playerId)}の爆弾反動で{renderPlayerChip(entry.playerId)}が{entry.amount}ダメージ
                        </>
                    );
                }
                if (entry.sourceAbilityId === 'bomb_thorns') {
                    return (
                        <>
                            {prefix}
                            {source ?? renderPlayerChip(entry.playerId)}の爆弾反射で{renderPlayerChip(entry.playerId)}が{entry.amount}ダメージ
                        </>
                    );
                }
                if (entry.sourceAbilityId === 'bomb_timed_bomb') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}の時限爆弾が爆発して{entry.amount}ダメージ
                        </>
                    );
                }
                if (source) {
                    return (
                        <>
                            {prefix}
                            {source}の能力で{renderPlayerChip(entry.playerId)}が{entry.amount}ダメージ
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が能力で{entry.amount}ダメージ
                    </>
                );
            }
            case 'cardPlay': {
                const cardInfo = CARD_LOOKUP.get(entry.cardId);
                const cardName = cardInfo?.name ?? entry.cardId;
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が「{cardName}」を{entry.targets?.length ? <>{renderTargets(entry.targets)}に</> : ''}使用
                    </>
                );
            }
            case 'roleAttack': {
                const detail = entry.isStruggle ? '（悪あがき）' : '';
                const selfText = entry.selfInflicted ? `（自傷 ${entry.selfInflicted}）` : '';
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.attackerId)}が{renderPlayerChip(entry.targetId)}にロール攻撃{detail}
                        {selfText}
                    </>
                );
            }
            case 'roleAttackHit': {
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.attackerId)}の連撃 {entry.hitIndex}/{entry.totalHits} → {renderPlayerChip(entry.targetId)} に {entry.damage}ダメージ
                    </>
                );
            }
            case 'playerDefeated':
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が脱落
                    </>
                );
            case 'roleAction': {
                const desc = entry.description ?? entry.actionId;
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が{desc}
                        {entry.targetId ? <> → {renderPlayerChip(entry.targetId)}</> : ''}
                    </>
                );
            }
            case 'statusEffect': {
                const kindText = entry.kind === 'heal' ? '回復' : 'ダメージ';
                const effectText = entry.effect === 'burn' ? '炎上' : '出血';
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}の{effectText}: {entry.amount}
                        {kindText}
                    </>
                );
            }
            case 'cardEffect': {
                const cardName = CARD_LOOKUP.get(entry.cardId)?.name ?? entry.cardId;
                const target = renderPlayerChip(entry.targetId ?? entry.playerId);
                if (entry.kind === 'draw') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}が{entry.count ?? 0}枚ドロー
                        </>
                    );
                }
                if (entry.kind === 'heal') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}がHP+{entry.amount ?? 0}
                        </>
                    );
                }
                if (entry.kind === 'adjustBra') {
                    const delta = entry.amount ?? 0;
                    const sign = delta >= 0 ? '+' : '';
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}のBra{sign}
                            {delta}
                        </>
                    );
                }
                if (entry.kind === 'addStatToken') {
                    const statLabel = STAT_LABELS[entry.stat ?? ''] ?? (entry.stat ? entry.stat.toUpperCase() : 'Stat');
                    const delta = entry.amount ?? 0;
                    const sign = delta >= 0 ? '+' : '';
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}の追加{statLabel}
                            {sign}
                            {delta}
                        </>
                    );
                }
                if (entry.kind === 'applyStatus') {
                    const statusLabel: Record<string, string> = {
                        burn: '炎上',
                        bleed: '出血',
                        shock: '感電',
                        stun: 'スタン',
                        dizzy: 'めまい',
                    };
                    const label = entry.status ? statusLabel[entry.status] ?? entry.status : '状態';
                    const value = entry.amount ?? 0;
                    const sign = value >= 0 ? '+' : '';
                    const suffix = entry.status === 'stun' ? ` (${value}R)` : '';
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}に{label}
                            {sign}
                            {value}
                            {suffix}
                        </>
                    );
                }
                if (entry.kind === 'sealHand') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}の手札を封印 ({entry.count ?? 0}枚)
                        </>
                    );
                }
                if (entry.kind === 'discard') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}: {entry.note ?? `手札を${entry.count ?? 0}枚捨てた`}
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}がカード「{cardName}」を使用
                    </>
                );
            }
            case 'damageReduced': {
                const reason =
                    entry.reason ??
                    (entry.source === 'install'
                        ? entry.cardId
                            ? `カード「${CARD_LOOKUP.get(entry.cardId)?.name ?? entry.cardId}」`
                            : '防御カード'
                        : entry.abilityId ?? '能力');
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}のダメージを{entry.amount}軽減 ({reason})
                    </>
                );
            }
            case 'damageResolved': {
                const label = entry.label ?? 'ダメージ';
                const reducedText = entry.attempted !== entry.totalAfterReductions ? ` (${entry.attempted}→${entry.totalAfterReductions})` : '';
                if (entry.prevented) {
                    if (entry.attackerId && entry.attackerId !== entry.targetId) {
                        return (
                            <>
                                {prefix}
                                {renderPlayerChip(entry.attackerId)}→{renderPlayerChip(entry.targetId)} {label}: 無効{reducedText}
                            </>
                        );
                    }
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.targetId)} {label}: 無効{reducedText}
                        </>
                    );
                }
                if (entry.attackerId && entry.attackerId !== entry.targetId) {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.attackerId)}→{renderPlayerChip(entry.targetId)} {label}: {entry.totalAfterReductions}ダメージ{reducedText}
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.targetId)} {label}: {entry.totalAfterReductions}ダメージ{reducedText}
                    </>
                );
            }
            default:
                return '';
        }
    };

    const isTargetValid = (targetId: string | null, rule: TargetRule): boolean => {
        if (!targetId) return false;
        if (!state?.players.some((player) => player.id === targetId)) return false;
        if (rule.mode === 'self' && targetId !== localPlayerId) return false;
        if (rule.mode === 'others') {
            if (targetId === localPlayerId) return false;
            if (state?.teamMode) {
                const actorTeam = state.players.find((player) => player.id === localPlayerId)?.team ?? null;
                const targetTeam = state.players.find((player) => player.id === targetId)?.team ?? null;
                if (actorTeam && targetTeam && actorTeam === targetTeam) return false;
            }
        }
        if (rule.disallowDefeated && isPlayerDefeated(targetId)) return false;
        return true;
    };

    const getTargetCandidates = React.useCallback(
        (rule: TargetRule): Player[] => {
            if (!state) return [];
            return state.players.filter((player) => {
                if (rule.mode === 'self' && player.id !== localPlayerId) return false;
                if (rule.mode === 'others') {
                    if (player.id === localPlayerId) return false;
                    if (state.teamMode) {
                        const actorTeam = state.players.find((p) => p.id === localPlayerId)?.team ?? null;
                        if (actorTeam && player.team && player.team === actorTeam) return false;
                    }
                }
                if (rule.disallowDefeated && isPlayerDefeated(player.id)) return false;
                return true;
            });
        },
        [state, localPlayerId, isPlayerDefeated]
    );

    const requestTargetSelection = async (
        rule: TargetRule,
        title: string,
        context: TargetSelectionContext = { kind: 'generic' }
    ): Promise<string | null> => {
        const taunterId =
            state?.players.find((player) => {
                if (isPlayerDefeated(player.id)) return false;
                return Boolean(runtimeStates[player.id]?.roleState?.tauntUntilNextTurnStart);
            })?.id ?? null;
        const forcedTargetId = taunterId && taunterId !== localPlayerId ? taunterId : null;

        const candidates = getTargetCandidates(rule);
        if (forcedTargetId && !candidates.some((player) => player.id === forcedTargetId)) {
            alert(`「このゆびとまれ」中のため対象は${playerName(forcedTargetId)}に固定されますが、対象にできません。`);
            return null;
        }
        if (candidates.length === 0) {
            alert('対象にできるプレイヤーがいません。');
            return null;
        }
        const note = forcedTargetId
            ? `「このゆびとまれ」中のため、対象は${playerName(forcedTargetId)}に固定されます。`
            : undefined;
        const selected = await requestSelection({
            type: 'target',
            title,
            rule,
            context,
            note,
            forcedTargetId: forcedTargetId ?? undefined,
        });
        if (!selected) return null;
        if (forcedTargetId && selected !== forcedTargetId) {
            return null;
        }
        setSelectedTargetId(selected);
        return selected;
    };

    const requestStatSelection = async (
        title: string,
        options?: Array<'atk' | 'def' | 'spe' | 'bra'>
    ): Promise<'atk' | 'def' | 'spe' | 'bra' | null> => {
        const selected = await requestSelection({ type: 'stat', title, options });
        if (!selected) return null;
        const stat = selected as 'atk' | 'def' | 'spe' | 'bra';
        setSelectedStatChoice(stat);
        return stat;
    };

    const requestChooseOneSelection = async (
        title: string,
        options: Array<{ value: string; label: string }>
    ): Promise<string | null> => {
        if (options.length === 0) {
            alert('選択肢が不正です。');
            return null;
        }
        if (options.length === 1) {
            return options[0]?.value ?? null;
        }
        const selected = await requestSelection({ type: 'chooseOne', title, options });
        return selected;
    };

    const selectionTargets =
        selectionModal?.type === 'target' ? getTargetCandidates(selectionModal.rule) : [];
    const selectionCopiedFromSet = React.useMemo(() => {
        const copied = localPlayerRuntime?.roleState?.copiedRoleAbilities ?? [];
        return new Set(copied.map((entry) => entry.fromPlayerId));
    }, [localPlayerRuntime?.roleState?.copiedRoleAbilities]);

    const handleDraw = async (count = 1) => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        const currentBra = braTokens[playerId] ?? 0;
        if (currentBra <= 0) {
            alert('Braが不足しています。');
            return;
        }
        try {
            const ok = sendWsAction({ k: 'match/draw', playerId, count });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ドローできません。');
            }
        } catch (err) {
            alert('ドローに失敗しました: ' + (err as Error).message);
        }
    };

    const handlePlay = async (cardId: string, handIndex?: number) => {
        const playerId = requireLocalPlayer();
        if (!playerId || !cardId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        const cardMeta = CARD_LOOKUP.get(cardId);
        const curseId =
            typeof handIndex === 'number' && Number.isFinite(handIndex)
                ? (cursedHandIndexMap.get(Math.floor(handIndex)) ?? null)
                : null;
        const optionalEffectIndexes =
            cardMeta?.effects?.reduce<number[]>((acc, effect, index) => {
                if (effect?.optional && effect.trigger === 'onPlay') {
                    acc.push(index);
                }
                return acc;
            }, []) ?? [];
        try {
            const params: { targets?: string[]; choices?: PlayChoicesPayload; handIndex?: number } = {};
            if (typeof handIndex === 'number' && Number.isFinite(handIndex)) {
                params.handIndex = Math.floor(handIndex);
            }
            let choicesPayload: PlayChoicesPayload | undefined;

            const getDoubleBaseStatEffect = (effects?: CardEffect[]): Extract<CardEffect, { type: 'doubleBaseStat' }> | null => {
                const flat = flattenCardEffects(effects);
                const found = flat.find((eff) => eff.type === 'doubleBaseStat');
                return (found as Extract<CardEffect, { type: 'doubleBaseStat' }>) ?? null;
            };

            const getStatOptionsFromEffects = (effects?: CardEffect[]): Array<'atk' | 'def' | 'spe' | 'bra'> => {
                const statEffect = getDoubleBaseStatEffect(effects);
                const statOptionsRaw = (statEffect?.playerChoice?.chooseOneOf ?? STAT_OPTIONS) as Array<'atk' | 'def' | 'spe' | 'bra'>;
                const statExcluded = new Set(statEffect?.exclude ?? []);
                const statOptions = statOptionsRaw.filter((stat) => !statExcluded.has(stat));
                return cardMeta?.id === 'twice_boost' ? statOptions.filter((stat) => stat !== 'bra') : statOptions;
            };

            const hasStatChoice = (effects?: CardEffect[]): boolean => Boolean(getDoubleBaseStatEffect(effects));
            if (optionalEffectIndexes.length > 0) {
                const promptText = `${cardMeta?.name ?? cardId} の任意効果を発動しますか？`;
                const shouldActivate = window.confirm(promptText);
                if (shouldActivate) {
                    choicesPayload = { ...(choicesPayload ?? {}), optionalEffects: optionalEffectIndexes };
                }
            }
            const chooseOneEffect = cardMeta?.effects?.find(
                (effect): effect is Extract<CardEffect, { type: 'chooseOne' }> =>
                    effect.type === 'chooseOne' && effect.trigger === 'onPlay'
            );
            let chosenOptionEffects: CardEffect[] | undefined;
            let greedSelections: Record<string, { targets?: string[]; choices?: Record<string, unknown> }> | null = null;
            if (chooseOneEffect) {
                const opts = chooseOneEffect.options ?? [];
                if (opts.length < 2) {
                    alert('選択肢が不正です。');
                    return;
                }
                if (hasRoleAbility('strong_greed')) {
                    greedSelections = {};
                    for (const opt of opts) {
                        const optEffects = (opt.effects ?? []).filter((eff) => eff.trigger === chooseOneEffect.trigger);
                        const optTargetRule = getTargetRuleFromEffects(optEffects);
                        if (optTargetRule) {
                            const targetId = await requestTargetSelection(
                                optTargetRule,
                                `${cardMeta?.name ?? cardId}：${opt.label} の対象を選択`,
                                { kind: 'card', cardId }
                            );
                            if (!targetId) return;
                            greedSelections[opt.value] = { ...(greedSelections[opt.value] ?? {}), targets: [targetId] };
                        }
                        if (hasStatChoice(optEffects)) {
                            const optsForStat = getStatOptionsFromEffects(optEffects);
                            if (optsForStat.length === 0) {
                                alert('選択できるステータスがありません。');
                                return;
                            }
                            const selected = await requestStatSelection(
                                `${cardMeta?.name ?? cardId}：${opt.label} の増幅ステータスを選択`,
                                optsForStat
                            );
                            if (!selected) return;
                            greedSelections[opt.value] = {
                                ...(greedSelections[opt.value] ?? {}),
                                choices: { ...(greedSelections[opt.value]?.choices ?? {}), stat: selected },
                            };
                        }
                    }
                    choicesPayload = { ...(choicesPayload ?? {}), [chooseOneEffect.key]: { selections: greedSelections } };
                } else {
                    let selectedValue: string | null = null;
                    const selected = await requestChooseOneSelection(
                        `${cardMeta?.name ?? cardId}：効果を選択`,
                        opts.map((opt) => ({ value: opt.value, label: opt.label }))
                    );
                    selectedValue = selected;
                    if (!selectedValue) {
                        return;
                    }
                    chosenOptionEffects = opts.find((opt) => opt.value === selectedValue)?.effects;
                    choicesPayload = { ...(choicesPayload ?? {}), [chooseOneEffect.key]: selectedValue };
                }
            }

            const isGreed = hasRoleAbility('strong_greed');
            const onPlayEffects = (cardMeta?.effects ?? []).filter((eff) => eff.trigger === 'onPlay');
            const nonChooseOneOnPlayEffects = onPlayEffects.filter((eff) => eff.type !== 'chooseOne');
            const statChoiceEffects = isGreed
                ? nonChooseOneOnPlayEffects
                : chooseOneEffect
                ? [...(chosenOptionEffects ?? []), ...nonChooseOneOnPlayEffects].filter((eff) => eff.trigger === 'onPlay')
                : onPlayEffects;

            if (hasStatChoice(statChoiceEffects)) {
                const optionsForStat = getStatOptionsFromEffects(statChoiceEffects);
                if (optionsForStat.length === 0) {
                    alert('選択できるステータスがありません。');
                    return;
                }
                const statChoice = selectedStatChoice || (await requestStatSelection('増幅するステータスを選択', optionsForStat));
                if (!statChoice) return;
                choicesPayload = { ...(choicesPayload ?? {}), stat: statChoice };
            }

            const targetRule =
                chooseOneEffect && isGreed
                    ? getTargetRuleFromEffects(nonChooseOneOnPlayEffects)
                    : chooseOneEffect
                    ? getTargetRuleFromEffects(chosenOptionEffects)
                    : getCardTargetRule(cardMeta);
            const needsTarget = Boolean(targetRule);
            if (needsTarget && targetRule) {
                const targetId = await requestTargetSelection(targetRule, 'カード対象を選択', { kind: 'card', cardId });
                if (!targetId) return;
                params.targets = [targetId];
            }

            if (curseId === 'rebuttal' && typeof handIndex === 'number' && Number.isFinite(handIndex)) {
                const currentHand = state?.hands?.[playerId] ?? [];
                const usedIndex = Math.floor(handIndex);
                const discardOptions = currentHand
                    .map((cid, idx) => ({ cid, idx }))
                    .filter((entry) => entry.idx !== usedIndex)
                    .map((entry) => ({
                        value: String(entry.idx),
                        label: CARD_LOOKUP.get(entry.cid)?.name ?? entry.cid,
                    }));
                const selected = await requestChooseOneSelection('反駁の呪い: 捨てる手札を選択', discardOptions);
                if (!selected) return;
                const discardIdx = Number.parseInt(selected, 10);
                if (!Number.isFinite(discardIdx)) {
                    alert('捨てる手札の指定が不正です。');
                    return;
                }
                choicesPayload = { ...(choicesPayload ?? {}), curseDiscardIndex: discardIdx };
            }
            if (cardMeta?.id === 'reconstruct') {
                const currentHand = state?.hands?.[playerId] ?? [];
                const usedIndex = typeof handIndex === 'number' && Number.isFinite(handIndex) ? Math.floor(handIndex) : -1;
                const remainingHand = currentHand.filter((_, idx) => idx !== usedIndex);
                if (remainingHand.length < 2) {
                    alert('再構築に必要な手札が足りません。');
                    return;
                }
                const buildDiscardOptions = (excludeIndexes: number[]) =>
                    remainingHand
                        .map((cid, idx) => ({ cid, idx }))
                        .filter((entry) => !excludeIndexes.includes(entry.idx))
                        .map((entry) => ({
                            value: String(entry.idx),
                            label: CARD_LOOKUP.get(entry.cid)?.name ?? entry.cid,
                        }));
                const firstSelected = await requestChooseOneSelection('再構築: 1枚目に捨てる手札を選択', buildDiscardOptions([]));
                if (!firstSelected) return;
                const firstIndex = Number.parseInt(firstSelected, 10);
                if (!Number.isFinite(firstIndex)) {
                    alert('再構築の手札指定が不正です。');
                    return;
                }
                const secondSelected = await requestChooseOneSelection('再構築: 2枚目に捨てる手札を選択', buildDiscardOptions([firstIndex]));
                if (!secondSelected) return;
                const secondIndex = Number.parseInt(secondSelected, 10);
                if (!Number.isFinite(secondIndex)) {
                    alert('再構築の手札指定が不正です。');
                    return;
                }
                choicesPayload = { ...(choicesPayload ?? {}), discardIndexes: [firstIndex, secondIndex] };
            }
            if (choicesPayload) {
                params.choices = choicesPayload;
            }
            if (
                sendWsAction({
                    k: 'match/play',
                    playerId,
                    cardId,
                    targets: params.targets,
                    choices: params.choices,
                    handIndex: params.handIndex,
                })
            ) {
                return;
            }
            throw new Error('WebSocket未接続のため、カードを使用できません。');
        } catch (err) {
            alert('カードをプレイできませんでした: ' + (err as Error).message);
        } finally {
            setSelectedTargetId(null);
            setSelectedStatChoice('');
        }
    };

    const handleRoleAttack = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        const attackRule: TargetRule = { mode: 'others', disallowDefeated: true };
        const targetId = await requestTargetSelection(attackRule, '攻撃対象を選択', { kind: 'roleAttack' });
        if (!targetId) return;
        const struggle = (braTokens[playerId] ?? 0) <= 0;
        try {
            const ok = sendWsAction({ k: 'match/roleAttack', playerId, targetId, struggle });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ロール攻撃できません。');
            }
        } catch (err) {
            alert('ロール攻撃に失敗しました: ' + (err as Error).message);
        } finally {
            setSelectedTargetId(null);
        }
    };

    const handleEndTurn = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        try {
            const ok = sendWsAction({ k: 'match/endTurn', playerId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ターン終了できません。');
            }
        } catch (err) {
            alert('ターン終了に失敗しました: ' + (err as Error).message);
        }
    };

    const handleRescueBra = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        if (!localPlayerRuntime || localMaxBra === null || rescueBraCost === null) {
            alert('プレイヤー状態の取得に失敗しました。');
            return;
        }
        if (!isCurrentPlayer(playerId)) {
            alert('自分のターンではありません。');
            return;
        }
        if (isLocalDefeated) {
            alert('脱落しています。');
            return;
        }
        if (localMaxBra > 0) {
            alert('この救済アクションは「最大Braが0のとき」のみ実行できます。');
            return;
        }

        try {
            const ok = sendWsAction({ k: 'match/rescueBra', playerId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、救済を実行できません。');
            }
        } catch (err) {
            alert('救済に失敗しました: ' + (err as Error).message);
        }
    };

    const handleEndMatchToLobby = React.useCallback(() => {
        if (!localPlayerId) {
            alert('操作するプレイヤーが設定されていません。');
            return;
        }
        const ok = sendWsAction({ k: 'match/end', playerId: localPlayerId } satisfies ActionPayload);
        if (!ok) {
            alert('WebSocket未接続のため、マッチを終了できません。');
        }
    }, [localPlayerId, sendWsAction]);

    const updateRoleActionChoice = React.useCallback((actionId: string, key: string, value: string) => {
        setRoleActionChoices((prev) => ({
            ...prev,
            [actionId]: {
                ...(prev[actionId] ?? {}),
                [key]: value,
            },
        }));
    }, []);

    const handleRoleAction = async (action: RoleActionDefinition) => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        let targetId: string | undefined;
        if (action.requiresTarget) {
            const rule: TargetRule =
                action.requiresTarget === 'self'
                    ? { mode: 'self', disallowDefeated: true }
                    : action.requiresTarget === 'others'
                    ? { mode: 'others', disallowDefeated: true }
                    : { mode: 'any', disallowDefeated: true };
            const selected = await requestTargetSelection(rule, '対象プレイヤーを選択', {
                kind: 'roleAction',
                actionId: action.id,
            });
            if (!selected) return;
            targetId = selected;
        }
        setRoleActionBusy(true);
        try {
            let injectedChoices: Record<string, string | number | boolean> | undefined;
            if (action.id === 'vampire_blood_pattern') {
                const currentHand = state?.hands?.[playerId] ?? [];
                if (currentHand.length === 0) {
                    alert('手札がありません。');
                    return;
                }
                const options = currentHand.map((cid, idx) => ({
                    value: String(idx),
                    label: CARD_LOOKUP.get(cid)?.name ?? cid,
                }));
                const selected = await requestChooseOneSelection('血の紋様: 付与する手札を選択', options);
                if (!selected) return;
                const handIndex = Number.parseInt(selected, 10);
                if (!Number.isFinite(handIndex)) {
                    alert('手札の指定が不正です。');
                    return;
                }
                injectedChoices = { handIndex };
            }
            if (action.id === 'doctor_reshape') {
                const reshapeStats: Array<'atk' | 'def' | 'spe'> = ['atk', 'def', 'spe'];
                const statDown = await requestStatSelection('整形: 下げるステータスを選択', reshapeStats);
                if (!statDown) return;
                const statUp = await requestStatSelection(
                    '整形: 上げるステータスを選択',
                    reshapeStats.filter((stat) => stat !== statDown)
                );
                if (!statUp) return;
                injectedChoices = { ...(injectedChoices ?? {}), statDown, statUp };
            }
            // jester_random のスピン演出はログ検知(useEffect)側で統一する
            // （WS経由でもHTTP経由でも同じ挙動にするため）
            const choices = injectedChoices ?? roleActionChoices[action.id];
            const ok = sendWsAction({ k: 'match/roleAction', playerId, actionId: action.id, targetId, choices });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ロールアクションを実行できません。');
            }
        } catch (err) {
            alert('ロールアクションの実行に失敗しました: ' + (err as Error).message);
        } finally {
            setRoleActionBusy(false);
            if (action.requiresTarget) {
                setSelectedTargetId(null);
            }
        }
    };

    const handlePromptChoice = async (accepted: boolean) => {
        if (!pendingPrompt || !localPlayer) {
            return;
        }
        if (!isPromptTarget) {
            alert('割り込み対象プレイヤーではありません。');
            return;
        }
        try {
            setPromptBusy(true);
            const ok = sendWsAction({ k: 'match/resolvePrompt', playerId: localPlayer.id, accepted });
            if (!ok) {
                throw new Error('WebSocket未接続のため、割り込みを処理できません。');
            }
        } catch (err) {
            alert('割り込みの処理に失敗しました: ' + (err as Error).message);
        } finally {
            setPromptBusy(false);
        }
    };

    const handleInfoDrawChoice = async (cardId: string) => {
        if (!pendingInfoDraw || !localPlayer) {
            return;
        }
        if (!isInfoDrawTarget) {
            alert('情報のカード選択対象ではありません。');
            return;
        }
        try {
            setInfoDrawBusy(true);
            const ok = sendWsAction({ k: 'match/resolveInfoDraw', playerId: localPlayer.id, cardId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、情報のカード選択を処理できません。');
            }
        } catch (err) {
            alert('情報のカード選択に失敗しました: ' + (err as Error).message);
        } finally {
            setInfoDrawBusy(false);
        }
    };

    const getRoleActionAvailability = (action: RoleActionDefinition): { disabled: boolean; reason?: string } => {
        if (!localPlayer) {
            return { disabled: true, reason: '操作するプレイヤーがありません' };
        }
        if (isLocalDefeated) {
            return { disabled: true, reason: '脱落しています' };
        }
        if (!isCurrentPlayer(localPlayer.id)) {
            return { disabled: true, reason: '自分のターンではありません' };
        }
        if (roleActionBusy) {
            return { disabled: true, reason: '処理中です' };
        }
        const cost = action.costBra ?? 0;
        if (cost > 0 && currentBraValue < cost) {
            return { disabled: true, reason: 'Braが不足しています' };
        }
        const localHandCount = (hands[localPlayer.id] ?? []).length;
        if (action.id === 'tsunami_ultimate') {
            const requiredDiscardCount = getTargetCandidates({ mode: 'others', disallowDefeated: true }).length;
            if (localHandCount < requiredDiscardCount) {
                return {
                    disabled: true,
                    reason: `手札が不足しています（必要${requiredDiscardCount}枚）`,
                };
            }
        }
        if (action.id === 'meteor_ultimate' && localHandCount < 3) {
            return { disabled: true, reason: '手札が不足しています（必要3枚）' };
        }
        if (action.requiresTarget) {
            const rule: TargetRule =
                action.requiresTarget === 'self'
                    ? { mode: 'self', disallowDefeated: true }
                    : action.requiresTarget === 'others'
                    ? { mode: 'others', disallowDefeated: true }
                    : { mode: 'any', disallowDefeated: true };
            if (getTargetCandidates(rule).length === 0) {
                return { disabled: true, reason: '対象プレイヤーがいません' };
            }
        }
        if (action.id === 'doctor_surgery' && selectedTargetId) {
            const targetRuntime = runtimeStates[selectedTargetId];
            if (targetRuntime?.roleState?.surgeryPhase) {
                return { disabled: true, reason: '選択中のプレイヤーは手術中です' };
            }
        }
        if (action.choices?.length && action.id !== 'doctor_reshape') {
            const choiceValues = roleActionChoices[action.id] ?? {};
            for (const choice of action.choices) {
                if (!choiceValues[choice.key]) {
                    return { disabled: true, reason: '必要な選択肢を設定してください' };
                }
            }
            if (
                action.id === 'doctor_reshape' &&
                choiceValues.statDown &&
                choiceValues.statUp &&
                choiceValues.statDown === choiceValues.statUp
            ) {
                return { disabled: true, reason: '異なるステータスを選んでください' };
            }
        }
        if (action.id === 'discharge_release') {
            const charge = localPlayerRuntime?.roleState?.chargeTokens ?? 0;
            if (charge <= 0) {
                return { disabled: true, reason: 'チャージトークンがありません' };
            }
        }
        return { disabled: false };
    };

    const renderRoleActionChoiceControls = (action: RoleActionDefinition) => {
        if (!action.choices?.length) {
            return null;
        }
        if (action.id === 'doctor_reshape') {
            return null;
        }
        const choiceValues = roleActionChoices[action.id] ?? {};
        return (
            <div
                className={styles.choiceRow}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {action.choices.map((choice) => {
                    const options = choice.options ?? ROLE_ACTION_BASE_STATS;
                    return (
                        <label key={`${action.id}-${choice.key}`} className={styles.choiceLabel}>
                            {choice.label}
                            <select
                                value={choiceValues[choice.key] ?? ''}
                                onChange={(e) => updateRoleActionChoice(action.id, choice.key, e.target.value)}
                                className={styles.select}
                            >
                                <option value="">未選択</option>
                                {options.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </label>
                    );
                })}
            </div>
        );
    };

    const renderPlayerCard = (player: Player) => {
        const controlling = localPlayerId === player.id;
        const teamDef = teamMode ? getTeamDef(player.team ?? null) : null;
        const roleInfo = player.roleId ? ROLE_LOOKUP.get(player.roleId) : undefined;
        const runtime = runtimeStates[player.id];
        const roleRuntime = runtime?.roleState;
        const copiedRoles = roleRuntime?.copiedRoleAbilities ?? [];
        const statusEffects = buildStatusEffects(runtime, player.roleId, state?.round, player.id, state?.nextRoundPriority);
        const clampGiantStat = (stat: 'def' | 'spe', value: number): number => {
            if (player.roleId !== 'giant') return value;
            return Math.min(value, 0);
        };
        const getDisplayedStatValue = (stat: 'atk' | 'def' | 'spe' | 'bra') => {
            if (!runtime) return null;
            const raw = runtime.baseStats[stat] + runtime.statTokens[stat] + runtime.turnBoosts[stat];
            if (stat === 'def' || stat === 'spe') {
                return clampGiantStat(stat, raw);
            }
            return raw;
        };
        const getDisplayedBaseStat = (stat: 'atk' | 'def' | 'spe' | 'bra') => {
            if (!runtime) return null;
            const raw = runtime.baseStats[stat];
            if (stat === 'def' || stat === 'spe') {
                return clampGiantStat(stat, raw);
            }
            return raw;
        };
        const stats = runtime
            ? {
                  hp: `${runtime.hp} / ${runtime.maxHp}`,
                  tempHp: runtime.tempHp,
                  atk: getDisplayedStatValue('atk') ?? 0,
                  def: getDisplayedStatValue('def') ?? 0,
                  spe: getDisplayedStatValue('spe') ?? 0,
                  bra: getDisplayedStatValue('bra') ?? 0,
              }
            : roleInfo?.params
            ? {
                  hp: `${roleInfo.params.hp}`,
                  tempHp: 0,
                  atk: roleInfo.params.atk,
                  def: clampGiantStat('def', roleInfo.params.def),
                  spe: clampGiantStat('spe', roleInfo.params.spe),
                  bra: roleInfo.params.bra,
              }
            : null;
        const installsForPlayer = installsByPlayer[player.id] ?? [];
        const installChips: StatusEffectChip[] = installsForPlayer
            .filter((install) => install.category === 'equip' || install.category === 'defense')
            .map((install, index) => {
                const isEquip = install.category === 'equip';
                const kindLabel = getKindLabel(install.kind) ?? 'スキル';
                const categoryLabel = getCategoryLabel(install.category) ?? install.category ?? '設置';
                return {
                    key: `install-${install.instanceId}`,
                    icon: isEquip ? '🧰' : '🛡️',
                    label: install.name,
                    color: isEquip ? 'rgba(167, 243, 208, 0.92)' : 'rgba(191, 219, 254, 0.92)',
                    tooltip: `${categoryLabel} ・ ${kindLabel}${install.text ? `\n${install.text}` : ''}`,
                    bucket: isEquip ? 'equip' : 'defense',
                    showLabel: true,
                    sortOrder: index,
                };
            });
        const copiedRoleChips: StatusEffectChip[] = copiedRoles.map((entry, index) => {
            const copiedName = ROLE_LOOKUP.get(entry.roleId)?.name ?? entry.roleId;
            const fromName = playerName(entry.fromPlayerId);
            return {
                key: `copied-${entry.roleId}-${entry.fromPlayerId}-${index}`,
                icon: '🪞',
                label: `［${copiedName}］`,
                color: 'rgba(199, 210, 254, 0.92)',
                tooltip: `複製元: ${fromName}`,
                bucket: 'role',
                showLabel: true,
                sortOrder: 50 + index,
            };
        });
        const mergedChips = sortChips([
            ...statusEffects.map((chip, index) => ({
                ...chip,
                bucket: chip.bucket ?? getStatusChipBucket(chip.key),
                sortOrder: chip.sortOrder ?? index,
            })),
            ...copiedRoleChips,
            ...installChips,
        ]);
        const roleName = roleInfo?.name ?? (player.roleId ? `［${player.roleId}］` : 'ロール未設定');
        const renderStatValue = (stat: 'atk' | 'def' | 'spe' | 'bra', label: string, value: number) => {
            if (!runtime) {
                return <span>{label} {value}</span>;
            }
            const base = getDisplayedBaseStat(stat) ?? runtime.baseStats[stat];
            const token = runtime.statTokens[stat] ?? 0;
            const turnBoost = runtime.turnBoosts[stat] ?? 0;
            const total = getDisplayedStatValue(stat) ?? value;
            const toneClass =
                total > base ? styles.statValueUp : total < base ? styles.statValueDown : '';
            const tooltipLines = [
                `基礎: ${base}`,
                `トークン: ${token >= 0 ? '+' : ''}${token}`,
                `ターン補正: ${turnBoost >= 0 ? '+' : ''}${turnBoost}`,
                `合計: ${total}`,
            ];
            return (
                <span
                    onMouseMove={(event) => showFloatingTooltip(label, tooltipLines.join('\n'), event)}
                    onMouseLeave={clearFloatingTooltip}
                >
                    {label}{' '}
                    <span className={toneClass}>{total}</span>
                </span>
            );
        };
        return (
            <li
                key={player.id}
                className={styles.playerCard}
                style={teamDef ? { background: teamDef.bg, borderColor: teamDef.border } : undefined}
            >
                <div className={styles.playerHeader}>
                    <div>
                        <div className={styles.playerName}>{player.name}</div>
                    </div>
                    <span className={styles.roleBadge}>
                        ロール: {roleName}
                        {runtime?.isDefeated ? ' / 脱落' : ''}
                    </span>
                </div>
                {stats && (
                    <div className={styles.statLine}>
                        <span>
                            HP {stats.hp}
                            {runtime && runtime.tempHp > 0 && ` (+Temp ${runtime.tempHp})`}
                        </span>
                        {renderStatValue('atk', 'Atk', stats.atk)}
                        {renderStatValue('def', 'Def', stats.def)}
                        {renderStatValue('spe', 'Spe', stats.spe)}
                        {renderStatValue('bra', 'Bra', stats.bra)}
                    </div>
                )}
                <div className={styles.statLine}>
                    <span>Bra トークン: {braTokens[player.id] ?? 0}</span>
                    <span>手札 {hands[player.id]?.length ?? 0}枚</span>
                </div>
                {mergedChips.length > 0 && (
                    <div className={styles.effectChips}>
                        {mergedChips.map((effect) => (
                            <span
                                key={`${player.id}-${effect.key}`}
                                className={styles.effectChip}
                                style={{ background: effect.color }}
                                onMouseMove={(event) => {
                                    showFloatingTooltip(effect.label, effect.tooltip, event);
                                }}
                                onMouseLeave={() => {
                                    clearFloatingTooltip();
                                }}
                            >
                                <span aria-hidden>{effect.icon}</span>
                                {effect.showLabel && <span className={styles.effectChipLabel}>{effect.label}</span>}
                                {effect.value !== undefined && <span>{effect.value}</span>}
                            </span>
                        ))}
                    </div>
                )}
            </li>
        );
    };

    const handWrapperStyle: React.CSSProperties = {
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        overflowX: 'auto',
        paddingBottom: 0,
    };

    const matchScale = Math.min(
        1,
        viewportSize.width / MATCH_DESIGN_WIDTH,
        viewportSize.height / MATCH_DESIGN_HEIGHT
    );
    const scaledCanvasWidth = Math.round(MATCH_DESIGN_WIDTH * matchScale);
    const scaledCanvasHeight = Math.round(MATCH_DESIGN_HEIGHT * matchScale);
    const pageScaleStyle: React.CSSProperties = {
        width: 1480,
        minWidth: 1480,
        maxWidth: 1480,
        height: MATCH_DESIGN_HEIGHT,
        minHeight: MATCH_DESIGN_HEIGHT,
        margin: '0 auto',
        padding: '18px 24px 20px',
        transform: `scale(${matchScale})`,
        transformOrigin: 'top left',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.70), rgba(255,255,255,0.72)), url(${matchGameBgUrl})`,
        backgroundSize: '100% 82%',
        backgroundPosition: 'top center',
        backgroundRepeat: 'no-repeat',
    };

    const turnLogPanelStyle: React.CSSProperties = {};

    const cardButtonStyle = (active: boolean, category?: string | null): React.CSSProperties => {
        const bgUrl = category ? HAND_CARD_BG_BY_CATEGORY[category] : undefined;
        return {
            position: 'relative',
            border: '1px solid #cbd5f5',
            borderRadius: 12,
            padding: '10px 12px',
            textAlign: 'left',
            background: bgUrl
                ? `${active ? 'linear-gradient(rgba(255,255,255,0.08), rgba(15,23,42,0.04)),' : 'linear-gradient(rgba(255,255,255,0.30), rgba(255,255,255,0.20)),'} url(${bgUrl}) center / cover no-repeat`
                : active
                ? 'linear-gradient(135deg, #1d4ed8, #9333ea)'
                : '#f1f5f9',
            backgroundColor: '#f1f5f9',
            color: '#fff',
            cursor: active ? 'pointer' : 'not-allowed',
            boxShadow: active ? '0 6px 15px rgba(15, 23, 42, 0.25)' : 'none',
            minHeight: 108,
            width: 180,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            textShadow: '0 2px 8px rgba(15,23,42,0.95), 0 1px 2px rgba(0,0,0,0.9)',
        };
    };

    return (
        <div className={styles.pageViewport}>
            <div className={styles.pageCanvasSlot} style={{ width: scaledCanvasWidth, height: scaledCanvasHeight }}>
                <div className={styles.page} style={pageScaleStyle}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Match {id}</h1>
                    <p className={styles.subtitle}>ロビーID: {id}</p>
                </div>
                <div className={styles.headerMeta}>
                    <div className={styles.helpButtons}>
                        <button
                            type="button"
                            className={styles.helpButton}
                            onClick={requestReconnect}
                            title="WebSocketを再接続します"
                        >
                            再接続
                        </button>
                        {isHost && state?.status === 'finished' && (
                            <button
                                type="button"
                                className={`${styles.helpButton} ${styles.hostEndButton}`}
                                onClick={handleEndMatchToLobby}
                                disabled={!wsConnected || isSpectator}
                                title="マッチを終了してロビーに戻ります（ホスト）"
                            >
                                ロビーに戻る
                            </button>
                        )}
                        <button type="button" className={styles.helpButton} onClick={() => setHelpOpen('roles')}>
                            ロール
                        </button>
                        <button type="button" className={styles.helpButton} onClick={() => setHelpOpen('rules')}>
                            ?
                        </button>
                        <button type="button" className={styles.helpButton} onClick={() => setHelpOpen('deck')}>
                            デッキ
                        </button>
                    </div>
                    <Link to="/" className={styles.backLink}>
                        ホームへ戻る
                    </Link>
                </div>
            </header>

            {error && <p className={styles.errorText}>エラー: {error}</p>}
            {!state && !error && <p>読み込み中...</p>}
            {pendingPrompt && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 40,
                        padding: 16,
                    }}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: 20,
                            maxWidth: 420,
                            width: '100%',
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                        }}
                    >
                        <h3 style={{ margin: 0 }}>ダメージ確認</h3>
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 100%', fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                                {renderPlayerChip(pendingPrompt.attackerId)} → {renderPlayerChip(pendingPrompt.targetId)}
                            </div>
                        </div>
                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                            <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>与えようとしているダメージ</div>
                                <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{pendingPrompt.amount}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                                    種別:{' '}
                                    {pendingPrompt.action?.type === 'roleAttack' || pendingPrompt.action?.type === 'resonateRoleAttack'
                                        ? 'ロール攻撃'
                                        : pendingPrompt.source === 'card'
                                        ? 'カード'
                                        : pendingPrompt.source === 'ability'
                                        ? '能力'
                                        : pendingPrompt.source === 'status'
                                        ? '継続'
                                        : 'その他'}
                                </div>
                            </div>
                            <div style={{ padding: 12, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                                <div style={{ fontSize: 12, color: '#9a3412' }}>防御効果（割り込み）</div>
                                <div style={{ fontWeight: 800, marginTop: 4 }}>{pendingPromptLabel}</div>
                                {pendingCard?.text && (
                                    <p style={{ marginTop: 6, fontSize: 12, color: '#7c2d12', lineHeight: 1.5 }}>
                                        {pendingCard.text}
                                    </p>
                                )}
                                {pendingEffect?.type && (
                                    <div style={{ marginTop: 6, fontSize: 11, color: '#9a3412' }}>効果: {pendingEffect.type}</div>
                                )}
                            </div>
                            {pendingPrompt.preview && (
                                <div style={{ padding: 12, borderRadius: 12, background: '#f1f5f9' }}>
                                    <div style={{ fontSize: 12, color: '#334155' }}>予測（HPダメージ/Temp吸収）</div>
                                    <div style={{ marginTop: 8, display: 'grid', gap: 8, fontSize: 13, color: '#0f172a' }}>
                                        <div>
                                            <strong>使う:</strong> {pendingPrompt.preview.ifAccepted.hpDamage}
                                            {pendingPrompt.preview.ifAccepted.tempAbsorbed > 0
                                                ? `（Temp吸収 ${pendingPrompt.preview.ifAccepted.tempAbsorbed}）`
                                                : ''}
                                            {pendingPrompt.preview.ifAccepted.breakdown &&
                                                pendingPrompt.preview.ifAccepted.breakdown.length > 0 && (
                                                    <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                                                        {pendingPrompt.preview.ifAccepted.breakdown.map((line) => (
                                                            <div key={line}>{line}</div>
                                                        ))}
                                                    </div>
                                                )}
                                        </div>
                                        <div>
                                            <strong>使わない:</strong>{' '}
                                            {pendingPrompt.preview.ifDeclined.hpDamage}
                                            {pendingPrompt.preview.ifDeclined.tempAbsorbed > 0
                                                ? `（Temp吸収 ${pendingPrompt.preview.ifDeclined.tempAbsorbed}）`
                                                : ''}
                                            {pendingPrompt.preview.ifDeclined.breakdown &&
                                                pendingPrompt.preview.ifDeclined.breakdown.length > 0 && (
                                                    <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                                                        {pendingPrompt.preview.ifDeclined.breakdown.map((line) => (
                                                            <div key={line}>{line}</div>
                                                        ))}
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        {isPromptTarget ? (
                            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => handlePromptChoice(true)}
                                    disabled={promptBusy}
                                    className={styles.primaryButton}
                                    style={{ flex: 1 }}
                                >
                                    使う（HP {pendingPrompt.preview?.ifAccepted.hpDamage ?? 0}）
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePromptChoice(false)}
                                    disabled={promptBusy}
                                    className={styles.secondaryButton}
                                    style={{ flex: 1 }}
                                >
                                    使わない
                                </button>
                            </div>
                        ) : (
                            <p style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>
                                対象プレイヤーが選択中です...
                            </p>
                        )}
                    </div>
                </div>
            )}
            {pendingInfoDraw && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 41,
                        padding: 16,
                    }}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: 20,
                            maxWidth: isInfoDrawTarget ? 640 : 420,
                            width: '100%',
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                        }}
                    >
                        <h3 style={{ margin: 0 }}>情報: カード選択</h3>
                        <div style={{ marginTop: 6, fontSize: 13, color: '#475569', fontWeight: 700 }}>
                            {pendingInfoDraw.drawIndex}/{pendingInfoDraw.drawTotal}
                        </div>
                        {isInfoDrawTarget ? (
                            <>
                                <p style={{ marginTop: 12, marginBottom: 10, color: '#334155' }}>
                                    山札の上から2枚を見て、手札に加えるカードを1枚選んでください。
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                                    {pendingInfoDraw.options.map((cardId, index) => {
                                        const info = CARD_LOOKUP.get(cardId);
                                        return (
                                            <button
                                                key={`${pendingInfoDraw.id}-${index}-${cardId}`}
                                                type="button"
                                                onClick={() => handleInfoDrawChoice(cardId)}
                                                disabled={infoDrawBusy}
                                                className={styles.secondaryButton}
                                                style={{
                                                    minHeight: 150,
                                                    padding: 14,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'stretch',
                                                    textAlign: 'left',
                                                    gap: 8,
                                                }}
                                            >
                                                <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                                                    {info?.name ?? cardId}
                                                </span>
                                                <span style={{ fontSize: 12, color: '#64748b' }}>
                                                    {getCategoryLabel(info?.category)} / {getKindLabel(info?.kind)}
                                                </span>
                                                <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                                    {info?.text ?? '説明がありません。'}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <p style={{ marginTop: 14, color: '#334155', lineHeight: 1.6 }}>
                                {pendingInfoDrawPlayer?.name ?? '情報'} がカードを選択しています...
                            </p>
                        )}
                    </div>
                </div>
            )}

            {damagePopup && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 35,
                        padding: 16,
                    }}
                    onClick={closeDamagePopup}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: 18,
                            paddingBottom: 26,
                            maxWidth: 440,
                            width: '100%',
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ margin: 0 }}>ダメージ結果</h3>
                        <div
                            style={{
                                marginTop: 10,
                                padding: 12,
                                borderRadius: 12,
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 58,
                            }}
                        >
                            <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', textAlign: 'center', lineHeight: 1.2 }}>
                                {damagePopup.source === 'status' ? (
                                    <>
                                        {renderPlayerChip(damagePopup.targetId)}
                                        <span>
                                            （特殊ダメージ{damagePopup.label ? `: ${damagePopup.label}` : ''}）
                                        </span>
                                    </>
                                ) : damagePopup.attackerId === damagePopup.targetId ? (
                                    <>
                                        {renderPlayerChip(damagePopup.targetId)}
                                        <span>（自傷{damagePopup.label ? `: ${damagePopup.label}` : ''}）</span>
                                    </>
                                ) : (
                                    <>
                                        {renderPlayerChip(damagePopup.attackerId)} → {renderPlayerChip(damagePopup.targetId)}
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                            <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>種別</div>
                                <div style={{ fontWeight: 800, marginTop: 2 }}>
                                    {damagePopup.label ?? (damagePopup.source === 'role'
                                        ? 'ロール攻撃'
                                        : damagePopup.source === 'card'
                                        ? 'カード'
                                        : damagePopup.source === 'ability'
                                        ? '能力'
                                        : damagePopup.source === 'status'
                                        ? '特殊ダメージ'
                                        : 'その他')}
                                </div>
                                {damagePopup.cardId && (
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                                        カード: {CARD_LOOKUP.get(damagePopup.cardId)?.name ?? damagePopup.cardId}
                                    </div>
                                )}
                                {damagePopup.abilityId && (
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                                        能力: {damagePopup.abilityId}
                                    </div>
                                )}
                            </div>

                            <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>ダメージ（予定 → 実際）</div>
                                <div
                                    style={{
                                        marginTop: 6,
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        justifyContent: 'space-between',
                                        gap: 10,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>予定</span>
                                        <span style={{ fontWeight: 900, fontSize: 22, color: '#0f172a' }}>
                                            {damagePopup.attempted}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 14, color: '#94a3b8' }}>→</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>実際</span>
                                        <span
                                            style={{
                                                fontWeight: 900,
                                                fontSize: 22,
                                                color: damagePopup.totalAfterReductions <= 0 ? '#dc2626' : '#0f172a',
                                            }}
                                        >
                                            {damagePopup.totalAfterReductions}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                                    Temp吸収: {damagePopup.tempAbsorbed} / HPダメージ: {damagePopup.hpDamage}
                                </div>
                            </div>

                            {damagePopup.breakdown && damagePopup.breakdown.length > 0 && (
                                <div style={{ padding: 12, borderRadius: 12, background: '#f1f5f9' }}>
                                    <div style={{ fontSize: 12, color: '#334155' }}>軽減/無効の内訳</div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                                        {damagePopup.breakdown.map((line) => (
                                            <div key={line}>{line}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="button" className={styles.secondaryButton} onClick={closeDamagePopup}>
                                閉じる
                            </button>
                        </div>
                        <div className={styles.damagePopupProgressTrack} aria-hidden="true">
                            <div
                                className={styles.damagePopupProgressBar}
                                style={{ animationDuration: `${DAMAGE_POPUP_DURATION_MS}ms` }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {actionToast && !pendingPrompt && !pendingInfoDraw && !damagePopup && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 18,
                        display: 'flex',
                        justifyContent: 'center',
                        zIndex: 34,
                        pointerEvents: 'none',
                        padding: 16,
                    }}
                >
                    <div
                        style={{
                            background: 'rgba(15, 23, 42, 0.92)',
                            color: '#e2e8f0',
                            borderRadius: 14,
                            padding: '10px 14px',
                            maxWidth: 560,
                            width: '100%',
                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                            fontSize: 13,
                            lineHeight: 1.5,
                            textAlign: 'center',
                        }}
                    >
                        {formatLogEntry(actionToast)}
                    </div>
                </div>
            )}

            {state && (
                <div className={styles.matchGrid}>
                    <div className={styles.mainColumn}>
                        <section className={`${styles.sectionCard} ${styles.heroSection}`}>
                            <div className={styles.heroGrid}>
                                <div className={styles.heroSelfPanel}>
                                    {localPlayer ? (
                                        <ul className={styles.heroPlayerList}>{renderPlayerCard(localPlayer)}</ul>
                                    ) : (
                                        <div className={styles.heroFallback}>
                                            {!wsConnected
                                                ? 'サーバー接続中…'
                                                : isSpectator
                                                ? '観戦中（操作不可）'
                                                : '操作権なし'}
                                        </div>
                                    )}
                                </div>

                                <div className={styles.heroActionPanel}>
                                    <div className={styles.statusGrid}>
                                        <div className={styles.statusCard}>
                                            <div className={styles.statusLabel}>現在の手番</div>
                                            <div className={styles.statusValue}>{currentPlayerName}</div>
                                        </div>
                                        <div className={styles.statusCard}>
                                            <div className={styles.statusLabel}>山札 / 捨て札</div>
                                            <div className={styles.statusValue}>{deckPileInfo}</div>
                                        </div>
                                    </div>

                                    {localPlayer && (
                                        <>
                                            <div className={styles.controlsRow}>
                                                <button
                                                    onClick={() => (showRescueInDrawSlot ? handleRescueBra() : handleDraw(1))}
                                                    disabled={
                                                        showRescueInDrawSlot
                                                            ? !isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking
                                                            : !isCurrentPlayer(localPlayer.id) ||
                                                              isLocalDefeated ||
                                                              isPromptBlocking ||
                                                              (braTokens[localPlayer.id] ?? 0) <= 0
                                                    }
                                                    className={`${styles.primaryButton} ${
                                                        showRescueInDrawSlot ? styles.dangerButton : ''
                                                    }`}
                                                    title={
                                                        showRescueInDrawSlot
                                                            ? '最大Braが0のときのみ実行できます。最大HPの1/4を消費して最大Braを+1します。'
                                                            : undefined
                                                    }
                                                >
                                                    {showRescueInDrawSlot ? `救済（HP-${rescueBraCost} / 最大Bra+1）` : '1枚ドロー'}
                                                </button>
                                                <button
                                                    onClick={handleRoleAttack}
                                                    disabled={roleAttackDisabled || isPromptBlocking}
                                                    className={`${styles.primaryButton} ${attackIsStruggle ? styles.dangerButton : ''}`}
                                                >
                                                    {attackButtonLabel}
                                                </button>
                                                <button
                                                    onClick={handleEndTurn}
                                                    disabled={!isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking}
                                                    className={styles.secondaryButton}
                                                >
                                                    ターンを終える
                                                </button>
                                            </div>

                                            {localRoleActions.length > 0 && (
                                                <div className={styles.abilitySection}>
                                                    {localRoleActionPageCount > 1 && (
                                                        <div className={styles.abilityHeader}>
                                                            <div className={styles.abilityPager}>
                                                                <button
                                                                    type="button"
                                                                    className={styles.helpButton}
                                                                    onClick={() =>
                                                                        setRoleActionPage((prev) => Math.max(0, prev - 1))
                                                                    }
                                                                    disabled={safeRoleActionPage <= 0}
                                                                >
                                                                    ←
                                                                </button>
                                                                <span className={styles.abilityPageText}>
                                                                    {safeRoleActionPage + 1} / {localRoleActionPageCount}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className={styles.helpButton}
                                                                    onClick={() =>
                                                                        setRoleActionPage((prev) =>
                                                                            Math.min(localRoleActionPageCount - 1, prev + 1)
                                                                        )
                                                                    }
                                                                    disabled={safeRoleActionPage >= localRoleActionPageCount - 1}
                                                                >
                                                                    →
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className={`${styles.roleActionGrid} ${styles.roleActionGridThreeCols}`}>
                                                        {visibleLocalRoleActions.map((action) => {
                                                            const availability = getRoleActionAvailability(action);
                                                            const actionTooltipText = action.description ?? '';
                                                            const canShowTooltip = actionTooltipText.trim().length > 0;
                                                            const isDisabled = availability.disabled || isPromptBlocking;
                                                            return (
                                                                <div
                                                                    key={action.id}
                                                                    className={`${styles.roleActionCard} ${
                                                                        isDisabled ? styles.roleActionCardDisabled : ''
                                                                    }`}
                                                                    role="button"
                                                                    tabIndex={isDisabled ? -1 : 0}
                                                                    aria-disabled={isDisabled}
                                                                    onClick={() => {
                                                                        if (isDisabled) return;
                                                                        handleRoleAction(action);
                                                                    }}
                                                                    onKeyDown={(event) => {
                                                                        if (isDisabled) return;
                                                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                                                        event.preventDefault();
                                                                        handleRoleAction(action);
                                                                    }}
                                                                    onMouseMove={(event) => {
                                                                        if (!canShowTooltip) return;
                                                                        showFloatingTooltip(action.label, actionTooltipText, event);
                                                                    }}
                                                                    onMouseLeave={() => {
                                                                        if (!canShowTooltip) return;
                                                                        clearFloatingTooltip();
                                                                    }}
                                                                >
                                                                    <div className={styles.roleActionHeader}>
                                                                        <strong className={styles.roleActionName}>{action.label}</strong>
                                                                        <span className={styles.roleActionCost}>
                                                                            Bra消費: {action.costBra ?? 0}
                                                                        </span>
                                                                    </div>
                                                                    {renderRoleActionChoiceControls(action)}
                                                                    {availability.disabled &&
                                                                        availability.reason &&
                                                                        availability.reason !== '自分のターンではありません。' && (
                                                                            <div className={styles.roleActionReason}>
                                                                                {availability.reason}
                                                                            </div>
                                                                        )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </section>

                        {localPlayer && (
                            <section className={`${styles.sectionCard} ${styles.handSection} ${styles.handSectionFixed}`}>
                                <div style={handWrapperStyle}>
                                    {(hands[localPlayer.id] ?? []).length === 0 && <span className={styles.mutedText}>手札なし</span>}
                                    {(hands[localPlayer.id] ?? []).map((cardId, idx) => {
                                        const info = CARD_LOOKUP.get(cardId);
                                        const isSealed = sealedHandIndexSet.has(idx);
                                        const curseId = cursedHandIndexMap.get(idx) ?? null;
                                        const isCursed = Boolean(curseId);
                                        const isBloodPattern = bloodPatternIndexSet.has(idx);
                                        const requiredBra = curseId === 'enrage' ? 2 : 1;
                                        const forceRestricted = forcedHandIndexSet.size > 0 && !forcedHandIndexSet.has(idx);
                                        const canPlay =
                                            isCurrentPlayer(localPlayer.id) &&
                                            !isLocalDefeated &&
                                            !isPromptBlocking &&
                                            info?.playable !== false &&
                                            !isSealed &&
                                            !forceRestricted &&
                                            (braTokens[localPlayer.id] ?? 0) >= requiredBra;
                                        const wrapperClassName = [
                                            isSealed ? styles.sealedHandCard : '',
                                            isCursed ? styles.cursedHandCard : '',
                                            isBloodPattern ? styles.bloodPatternHandCard : '',
                                        ]
                                            .filter(Boolean)
                                            .join(' ') || undefined;
                                        return (
                                            <div
                                                key={`${cardId}-${idx}`}
                                                style={{ position: 'relative', width: 180 }}
                                                className={wrapperClassName}
                                                onMouseEnter={(e) => {
                                                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                                                    const offsetX = 8;
                                                    const maxWidth = 260;
                                                    const x = Math.min(rect.right + offsetX, window.innerWidth - maxWidth - 8);
                                                    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 140));
                                                    const adjustments = buildCardEffectAdjustments(
                                                        info,
                                                        cardEffectMultiplier,
                                                        cardEffectBonus
                                                    );
                                                    const curseLabel = getCurseLabel(curseId);
                                                    const curseDescription = getCurseDescription(curseId);
                                                    const tooltipPrefixLines: string[] = [];
                                                    if (curseLabel) tooltipPrefixLines.push(`🪄 ${curseLabel}`);
                                                    if (curseDescription) tooltipPrefixLines.push(`📝 ${curseDescription}`);
                                                    if (isBloodPattern) tooltipPrefixLines.push('🩸 血の紋様');
                                                    const costLine = `コスト: ${info?.cost ?? 1}`;
                                                    const tooltipPrefix =
                                                        tooltipPrefixLines.length > 0 ? `${tooltipPrefixLines.join('\n')}\n\n` : '';
                                                    setTooltip({
                                                        title: info?.name ?? cardId,
                                                        text: `${tooltipPrefix}${costLine}\n\n${info?.text ?? '説明がありません。'}`,
                                                        x,
                                                        y,
                                                        adjustments,
                                                    });
                                                }}
                                                onMouseLeave={() => setTooltip((prev) => (prev ? null : prev))}
                                            >
                                                <button
                                                    onClick={() => handlePlay(cardId, idx)}
                                                    disabled={!canPlay}
                                                    style={cardButtonStyle(canPlay, info?.category)}
                                                >
                                                    <div
                                                        style={{
                                                            fontWeight: 400,
                                                            fontSize: 20,
                                                            textAlign: 'center',
                                                            lineHeight: 1.1,
                                                            letterSpacing: '0.02em',
                                                            fontFamily: '"HighrollDotTitle", "DotGothic16", "MS Gothic", monospace',
                                                        }}
                                                    >
                                                        {info?.name ?? cardId}
                                                    </div>
                                                </button>
                                                {isSealed && <div className={styles.sealedHandOverlay} aria-hidden="true" />}
                                                {isCursed && <div className={styles.cursedHandOverlay} aria-hidden="true" />}
                                                {isBloodPattern && <div className={styles.bloodPatternOverlay} aria-hidden="true" />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        <section
                            className={`${styles.sectionCard} ${styles.playersSection} ${styles.playersStripSection} ${
                                localPlayer ? styles.playersStripSectionNoHeader : ''
                            }`}
                        >
                            {!localPlayer && (
                                <div className={styles.sectionHeader}>
                                    <h2>プレイヤー情報</h2>
                                    {!wsConnected ? (
                                        <span className={styles.sectionBadgeDanger}>接続中…（操作不可）</span>
                                    ) : isSpectator ? (
                                        <span className={styles.sectionBadgeDanger}>観戦中（操作不可）</span>
                                    ) : (
                                        <span className={styles.sectionBadgeDanger}>操作権なし（操作不可）</span>
                                    )}
                                </div>
                            )}
                            <ul className={styles.playerStrip}>
                                {(localPlayer ? otherPlayers : state.players).map((player) => renderPlayerCard(player))}
                            </ul>
                        </section>
                    </div>

                    <aside className={styles.sidebar}>
                        <section className={`${styles.sectionCard} ${styles.logSectionCard}`}>
                            <div className={styles.logPanel} style={turnLogPanelStyle}>
                                {logsToDisplay.length === 0 ? (
                                    <p className={styles.mutedText}>まだログはありません。</p>
                                ) : (
                                    <ul className={styles.turnLog}>
                                        {logsToDisplay.map((entry, idx) => (
                                            <li
                                                key={`${entry.type}-${entry.timestamp}-${idx}`}
                                                className={`${styles.turnLogItem} ${
                                                    entry.type === 'turnStart' ? styles.turnLogCurrent : ''
                                                } ${entry.type === 'roundStart' ? styles.turnLogRound : ''}`}
                                            >
                                                {formatLogEntry(entry)}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>
                    </aside>
                </div>
            )}
                </div>
            </div>
            {tooltip && (
                <div className={styles.cardTooltipFloating} style={{ top: tooltip.y, left: tooltip.x }}>
                    <strong>{tooltip.title}</strong>
                    <p style={{ margin: '4px 0 0', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{tooltip.text}</p>
                    {tooltip.adjustments && tooltip.adjustments.length > 0 && (
                        <div className={styles.cardEffectAdjustments}>
                            {tooltip.adjustments.map((adjustment, index) => {
                                const tone =
                                    adjustment.adjusted > adjustment.base
                                        ? styles.cardEffectAdjustedIncrease
                                        : adjustment.adjusted < adjustment.base
                                        ? styles.cardEffectAdjustedDecrease
                                        : '';
                                return (
                                    <div key={`${adjustment.label}-${index}`} className={styles.cardEffectItem}>
                                        <span className={styles.cardEffectLabel}>{adjustment.label}</span>
                                        <span className={styles.cardEffectBase}>{adjustment.base}</span>
                                        <span className={styles.cardEffectArrow}>→</span>
                                        <span className={`${styles.cardEffectAdjusted} ${tone}`.trim()}>
                                            {adjustment.adjusted}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {jesterSpin && (
                <div className={styles.jesterOverlay}>
                    <div className={styles.jesterPanel}>
                        <div className={styles.jesterTitle}>道化のスロット</div>
                        <div className={styles.jesterSlot}>{jesterSpin.label}</div>
                        {jesterSpin.result && <div className={styles.jesterResult}>結果: {jesterSpin.result}</div>}
                    </div>
                </div>
            )}
            {matchResultOpen && state?.status === 'finished' && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 34,
                        padding: 16,
                    }}
                    onClick={() => setMatchResultOpen(false)}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 16,
                            padding: 18,
                            maxWidth: 520,
                            width: '100%',
                            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{ margin: 0, fontSize: 20 }}>ゲーム終了</h2>
                        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                            <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a' }}>{winnerText}</div>
                            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>マッチID: {id}</div>
                        </div>

                        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setMatchResultOpen(false)} className={styles.secondaryButton}>
                                閉じる
                            </button>
                            {isHost && (
                                <button
                                    type="button"
                                    onClick={handleEndMatchToLobby}
                                    className={styles.primaryButton}
                                    disabled={!wsConnected || isSpectator}
                                >
                                    マッチを終了してロビーに戻る（ホスト）
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {selectionModal && (
                <div className={styles.modalOverlay} onClick={() => closeSelection(null)}>
                    <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>{selectionModal.title}</h2>
                            <button type="button" className={styles.modalClose} onClick={() => closeSelection(null)}>
                                閉じる
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {selectionModal.type === 'target' ? (
                                selectionTargets.length === 0 ? (
                                    <p className={styles.mutedText}>選択できるプレイヤーがいません。</p>
                                ) : (
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        {selectionModal.note && (
                                            <div className={styles.selectionNote}>{selectionModal.note}</div>
                                        )}
                                        {selectionTargets.map((player) => (
                                            (() => {
                                                const context = selectionModal.context ?? { kind: 'generic' as const };
                                                const isDuplicateCopy =
                                                    context.kind === 'roleAction' &&
                                                    context.actionId === 'duplicate_copy';

                                                const badges: string[] = [];
                                                let disabledReason: string | null = null;
                                                const forcedTargetId = selectionModal.forcedTargetId ?? null;

                                                const tauntActive = Boolean(
                                                    runtimeStates[player.id]?.roleState?.tauntUntilNextTurnStart
                                                );
                                                if (tauntActive) {
                                                    badges.push('対象固定中');
                                                }

                                                if (!disabledReason && forcedTargetId && player.id !== forcedTargetId) {
                                                    disabledReason = '対象固定中のため選択できません';
                                                }

                                                if (isDuplicateCopy) {
                                                    if (player.roleId === 'duplicate') {
                                                        badges.push('複製不可');
                                                        disabledReason = '［複製］の固有能力は複製できません';
                                                    } else if (selectionCopiedFromSet.has(player.id)) {
                                                        badges.push('複製済み');
                                                        disabledReason = '同じプレイヤーから2回目の複製はできません';
                                                    }
                                                }

                                                const disabled = Boolean(disabledReason);

                                                return (
                                                    <button
                                                        key={player.id}
                                                        type="button"
                                                        className={styles.secondaryButton}
                                                        onClick={() => closeSelection(player.id)}
                                                        disabled={disabled}
                                                        title={disabledReason ?? undefined}
                                                    >
                                                        <span className={styles.selectionOptionRow}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                                {renderPlayerChip(player.id)}
                                                                {isPlayerDefeated(player.id) && (
                                                                    <span style={{ color: '#b91c1c' }}>(脱落)</span>
                                                                )}
                                                            </span>
                                                            <span className={styles.selectionOptionMeta}>
                                                                {badges.map((badge) => (
                                                                    <span key={`${player.id}-${badge}`} className={styles.selectionOptionBadge}>
                                                                        {badge}
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        </span>
                                                        {disabledReason && <div className={styles.selectionOptionReason}>{disabledReason}</div>}
                                                    </button>
                                                );
                                            })()
                                        ))}
                                    </div>
                                )
                            ) : selectionModal.type === 'stat' ? (
                                <div style={{ display: 'grid', gap: 8 }}>
                                    {(selectionModal.options ?? STAT_OPTIONS).map((stat) => (
                                        <button
                                            key={stat}
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() => closeSelection(stat)}
                                        >
                                            {stat.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 8 }}>
                                    {selectionModal.options.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={styles.secondaryButton}
                                            onClick={() => closeSelection(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {helpOpen && (
                <div className={styles.modalOverlay} onClick={() => setHelpOpen(null)}>
                    <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2>
                                {helpOpen === 'deck'
                                    ? 'デッキ内容'
                                    : helpOpen === 'roles'
                                    ? 'ロール詳細'
                                    : 'ルール / 進め方'}
                            </h2>
                            <button type="button" className={styles.modalClose} onClick={() => setHelpOpen(null)}>
                                閉じる
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            {helpOpen === 'deck' ? (
                                <>
                                    <div className={styles.deckTools}>
                                        <label className={styles.deckTool}>
                                            <span className={styles.deckToolLabel}>検索（名前/効果）</span>
                                            <input
                                                className={styles.deckSearchInput}
                                                value={deckSearchText}
                                                onChange={(e) => setDeckSearchText(e.target.value)}
                                                placeholder="例: 未来予知 / 炎上 / 防御"
                                            />
                                        </label>
                                        <label className={styles.deckTool}>
                                            <span className={styles.deckToolLabel}>種別</span>
                                            <select
                                                className={styles.select}
                                                value={deckCategoryFilter}
                                                onChange={(e) => setDeckCategoryFilter(e.target.value as DeckCategoryFilter)}
                                            >
                                                <option value="all">すべて</option>
                                                <option value="attack">攻撃</option>
                                                <option value="defense">防御</option>
                                                <option value="spell">呪文</option>
                                                <option value="equip">装備</option>
                                            </select>
                                        </label>
                                        <label className={styles.deckTool}>
                                            <span className={styles.deckToolLabel}>場所</span>
                                            <select
                                                className={styles.select}
                                                value={deckZoneFilter}
                                                onChange={(e) => setDeckZoneFilter(e.target.value as DeckZoneFilter)}
                                            >
                                                <option value="all">すべて</option>
                                                <option value="deck">山札にある</option>
                                                <option value="hand">手札にある</option>
                                                <option value="discard">捨て札にある</option>
                                                <option value="install">設置にある</option>
                                                <option value="remaining">残りあり</option>
                                                <option value="empty">残り0</option>
                                            </select>
                                        </label>
                                        <label className={styles.deckTool}>
                                            <span className={styles.deckToolLabel}>表示</span>
                                            <select
                                                className={styles.select}
                                                value={deckInspectMode}
                                                onChange={(e) => setDeckInspectMode(e.target.value as 'remaining' | 'all')}
                                            >
                                                <option value="remaining">残りありのみ</option>
                                                <option value="all">全カード</option>
                                            </select>
                                        </label>
                                        <label className={styles.deckTool}>
                                            <span className={styles.deckToolLabel}>ソート</span>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <select
                                                    className={styles.select}
                                                    value={deckSortKey}
                                                    onChange={(e) => setDeckSortKey(e.target.value as DeckSortKey)}
                                                    style={{ minWidth: 160 }}
                                                >
                                                    <option value="name">名前</option>
                                                    <option value="category">種別</option>
                                                    <option value="cost">コスト</option>
                                                    <option value="remaining">残り</option>
                                                    <option value="total">総数</option>
                                                </select>
                                                <select
                                                    className={styles.select}
                                                    value={deckSortDir}
                                                    onChange={(e) => setDeckSortDir(e.target.value as DeckSortDir)}
                                                    style={{ minWidth: 110 }}
                                                >
                                                    <option value="asc">昇順</option>
                                                    <option value="desc">降順</option>
                                                </select>
                                            </div>
                                        </label>
                                    </div>
                                    <div className={styles.deckSummaryRow}>
                                        表示: {deckCountsToDisplay.length} 件（全 {deckCounts.length} 種類）
                                    </div>
                                    <ul className={styles.cardList}>
                                        {deckCounts.length === 0 && <li className={styles.cardItem}>デッキ情報がありません。</li>}
                                        {deckCounts.length > 0 && deckCountsToDisplay.length === 0 && (
                                            <li className={styles.cardItem}>条件に一致するカードがありません。</li>
                                        )}
                                        {deckCountsToDisplay.map(({ cardId, count, info }) => (
                                        <li key={cardId} className={styles.cardItem}>
                                            <div className={styles.cardNameRow}>
                                                <strong>{info?.name ?? cardId}</strong>
                                                <span
                                                    className={styles.cardMetaChip}
                                                    style={
                                                        count.remaining === 0
                                                            ? { color: '#b91c1c', background: '#fee2e2' }
                                                            : undefined
                                                    }
                                                >
                                                    残り {count.remaining} / {count.total}
                                                </span>
                                                <span className={styles.cardMetaChip}>コスト {info?.cost ?? 1}</span>
                                                {info?.category && (
                                                    <span className={styles.cardMetaChip}>{getCategoryLabel(info.category)}</span>
                                                )}
                                                {info?.kind && <span className={styles.cardMetaChip}>{getKindLabel(info.kind)}</span>}
                                                <span className={styles.cardMetaChip}>
                                                    山札 {count.inDeck} / 手札 {count.inHand} / 捨て札 {count.inDiscard} / 設置 {count.inInstall}
                                                </span>
                                            </div>
                                            {info?.text && <p>{info.text}</p>}
                                        </li>
                                    ))}
                                    </ul>
                                </>
                            ) : helpOpen === 'roles' ? (
                                <div className={styles.ruleBlock}>
                                    <p>現在のマッチに登場しているロールの詳細です。</p>
                                    <ul>
                                        {Array.from(
                                            new Map(
                                                (state?.players ?? [])
                                                    .map((player) => player.roleId)
                                                    .filter(Boolean)
                                                    .map((roleId) => [roleId as string, ROLE_LOOKUP.get(roleId as string)])
                                            ).entries()
                                        )
                                            .filter(([, role]) => Boolean(role))
                                            .map(([roleId, role]) => (
                                                <li key={roleId}>
                                                    <strong>{role?.name ?? roleId}</strong>
                                                    {role?.text ? `：${role.text}` : ''}
                                                    {role?.detailText ? (
                                                        <div style={{ marginTop: 6, color: '#334155', whiteSpace: 'pre-wrap' }}>{role.detailText}</div>
                                                    ) : null}
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className={styles.ruleBlock}>
                                    <p>目的: 相手のHPを0にして勝利します。</p>
                                     <ul>
                                         <li>手番: Spe順に進行します。</li>
                                         <li>Bra: 行動ポイントとして消費します。</li>
                                         <li>行動: ドロー（Bra-1）、カード使用（基本Bra-1）、ロール攻撃、ターン終了。</li>
                                         <li>カード: 対象指定やステータス選択が必要なものがあります。</li>
                                         <li>ログ: 右側で直近の行動履歴を確認できます。</li>
                                     </ul>
                                     <h3 style={{ marginTop: 12 }}>用語</h3>
                                     <ul>
                                         <li>通常ダメージ: Defで軽減されるダメージ（例: ジャブ、ボディプレス、ロール攻撃など）。</li>
                                         <li>固定ダメージ: Defで軽減されないダメージ（例: ダイナマイトなど）。</li>
                                         <li>特殊ダメージ: 炎上/出血などのダメージ。基本的に防御カードで防げない（例外あり）。</li>
                                         <li>次のうちどれか選ぶ: 効果の候補から1つを選んで発動する形式。</li>
                                     </ul>
                                     <h3 style={{ marginTop: 12 }}>状態異常 / バフ / デバフ一覧</h3>
                                     <p style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                                         画面上のチップの数字は「スタック」または「残りターン/ラウンド」を表します。
                                     </p>
                                     <ul>
                                         <li>
                                             <strong>炎上（🔥）</strong>: ターン終了時にダメージ（炎上-1）。※［火炎］は回復に変化
                                         </li>
                                         <li>
                                             <strong>出血（🩸）</strong>: 行動時に特殊1ダメージ / ターン終了時に特殊1ダメージ＋出血-1
                                         </li>
                                         <li>
                                             <strong>感電（⚡）</strong>: 5ごとにBra-1し、その度に感電を消費
                                         </li>
                                         <li>
                                             <strong>蓄電（🔋）</strong>: ロール/カード効果で消費されるトークン
                                         </li>
                                         <li>
                                             <strong>スタン（STN）</strong>: Speが0になる
                                         </li>
                                         <li>
                                             <strong>めまい（💫）</strong>: ターン終了時に-1。手札からカードを使うと50%で不発
                                         </li>
                                         <li>
                                             <strong>時限爆弾（💣）</strong>: ターン終了ごとに-1 / 0で固定10ダメージ
                                         </li>
                                         <li>
                                             <strong>麻酔（💉）</strong>: 次のターン Bra-◯
                                         </li>
                                         <li>
                                             <strong>弱体（DEB）</strong>: 次にダメージを受けるまで対象ステータスが変化
                                         </li>
                                         <li>
                                             <strong>手術準備中（🩺）</strong>: 次のターンは行動不可
                                         </li>
                                         <li>
                                             <strong>手術回復待ち（❤️‍🩹）</strong>: 次のターン開始時にHP+15
                                         </li>
                                         <li>
                                             <strong>アドレナリン（💉）</strong>: 一定ターン 追加Spe/Atk 上昇（終了後に反動）
                                         </li>
                                         <li>
                                             <strong>反動（🥶）</strong>: アドレナリンの反動で 追加Spe/Atk 低下
                                         </li>
                                         <li>
                                             <strong>はやてのつばさ（🪽）</strong>: 次のラウンドでSpeを無視して最優先で行動（トリックルーム中は最後）
                                         </li>
                                         <li>
                                             <strong>このゆびとまれ（🧲）</strong>: 次の自分ターン開始まで、他プレイヤーの対象選択が自分に固定（使用者本人は自由に選択可能）
                                         </li>
                                         <li>
                                             <strong>抑制（LOCK）</strong>: 次のラウンド終了まで固有能力なし
                                         </li>
                                         <li>
                                             <strong>アイテム強化（ITEM+）</strong>: 次に使うアイテムの数値が上昇
                                         </li>
                                         <li>
                                             <strong>次攻撃強化（🗡️）</strong>: 次のロール攻撃のAtk+◯（攻撃後に消費）
                                         </li>
                                         <li>
                                             <strong>封印（×）</strong>: 封印された手札は使用できない（封印解除/減少で戻る）
                                         </li>
                                         <li>
                                             <strong>呪い（🪄）</strong>: 呪いの種類に応じて追加効果/デバフ（ツールチップに表示）
                                         </li>
                                         <li>
                                             <strong>血の紋様（🩸）</strong>: 手札の血の紋様の枚数に応じて追加効果（ツールチップに表示）
                                         </li>
                                     </ul>
                                 </div>
                             )}
                         </div>
                     </div>
                </div>
            )}
        </div>
    );
};

export default Match;
