import React from 'react';
import { Link, useParams } from 'react-router-dom';
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
} from '@shared/types';
import { drawCards, endTurn, getMatch, playCard, resolvePrompt, rescueBra, roleAction as performRoleAction, roleAttack } from '@client/api/matches';
import cardsCatalogRaw from '../../../data/cards.json';
import rolesCatalogRaw from '../../../data/roles.json';
import { clearRememberedMatchPlayer, getRememberedMatchPlayer, rememberMatchPlayer } from '@client/utils/matchPlayer';
import { getRoleActions, ROLE_ACTION_BASE_STATS } from '@shared/roleActions';
import { API_BASE, wsBase } from '@client/config/env';
import styles from './Match.module.css';

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

const CARD_LOOKUP = new Map<string, CardDefinition>(((cardsCatalogRaw as CardsFile).cards ?? []).map((card) => [card.id, card]));
const ROLE_LOOKUP = new Map<string, RoleEntry>(((rolesCatalogRaw as RolesFile).roles ?? []).map((role) => [role.id, role]));

const statusColors: Record<string, string> = {
    waiting: '#eab308',
    inProgress: '#22c55e',
    finished: '#ef4444',
};

const STAT_OPTIONS: Array<'atk' | 'def' | 'spe' | 'bra'> = ['atk', 'def', 'spe', 'bra'];

const CATEGORY_LABELS: Record<string, string> = {
    attack: '攻撃',
    defense: '防御',
    spell: '呪文',
    equip: '装備',
};

const getCategoryLabel = (category?: string | null): string | undefined =>
    category ? CATEGORY_LABELS[category] ?? category.toUpperCase() : undefined;

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

const buildCardEffectAdjustments = (
    card: CardDefinition | null | undefined,
    multiplier: number,
    bonus: number
): CardEffectAdjustment[] => {
    if (!card || (multiplier === 1 && bonus === 0)) {
        return [];
    }
    const adjustments: CardEffectAdjustment[] = [];
    const applyValue = (base: number) => base * multiplier + bonus;
    card.effects?.forEach((effect) => {
        switch (effect.type) {
            case 'dealDamage':
                if (typeof effect.value === 'number') {
                    adjustments.push({ label: 'ダメージ', base: effect.value, adjusted: applyValue(effect.value) });
                }
                break;
            case 'addStatToken':
                if (typeof effect.value === 'number') {
                    const statLabel = STAT_LABELS[effect.stat] ?? effect.stat.toUpperCase();
                    adjustments.push({
                        label: `${statLabel}トークン`,
                        base: effect.value,
                        adjusted: applyValue(effect.value),
                    });
                }
                break;
            case 'applyStatDebuffUntilDamage': {
                const statLabel = STAT_LABELS[effect.stat] ?? effect.stat.toUpperCase();
                adjustments.push({
                    label: `${statLabel}デバフ`,
                    base: effect.value,
                    adjusted: applyValue(effect.value),
                });
                break;
            }
            case 'adjustBra':
                adjustments.push({ label: 'Bra', base: effect.value, adjusted: applyValue(effect.value) });
                break;
            case 'drawCards': {
                const adjusted = Math.max(0, Math.floor(effect.count * multiplier + bonus));
                adjustments.push({ label: 'ドロー', base: effect.count, adjusted });
                break;
            }
            case 'applyBurn':
                adjustments.push({ label: '炎上', base: effect.value, adjusted: applyValue(effect.value) });
                break;
            case 'applyStun': {
                const adjusted = Math.max(0, Math.floor(effect.durationRounds * multiplier + bonus));
                adjustments.push({
                    label: 'スタン',
                    base: effect.durationRounds,
                    adjusted,
                });
                break;
            }
            case 'heal':
                adjustments.push({ label: '回復', base: effect.value, adjusted: applyValue(effect.value) });
                break;
            case 'modifyMaxHpInstall':
                adjustments.push({ label: '最大HP', base: effect.value, adjusted: applyValue(effect.value) });
                break;
            default:
                break;
        }
    });
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
            icon: 'DEB',
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
            icon: 'STN',
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


    const suppressedUntil = roleState.suppressedUntilRound;
    if (typeof suppressedUntil === 'number') {
        const remain = currentRound ? Math.max(0, suppressedUntil - currentRound + 1) : undefined;
        effects.push({
            key: 'suppressed',
            icon: 'LOCK',
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
            icon: 'ITEM+2',
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
    const [state, setState] = React.useState<GameState | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [wsConnected, setWsConnected] = React.useState(false);
    const [localPlayerInfo, setLocalPlayerInfo] = React.useState<StoredPlayerInfo>(() => {
        if (typeof window === 'undefined' || !id) return null;
        return getRememberedMatchPlayer(id);
    });
    const [customCardId, setCustomCardId] = React.useState('');
    const [tooltip, setTooltip] = React.useState<
        { title: string; text: string; x: number; y: number; adjustments?: CardEffectAdjustment[] } | null
    >(null);
    const [hoveredPlayerId, setHoveredPlayerId] = React.useState<string | null>(null);
    const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
    const [selectedStatChoice, setSelectedStatChoice] = React.useState<'atk' | 'def' | 'spe' | 'bra' | ''>('');
    const [roleActionChoices, setRoleActionChoices] = React.useState<Record<string, Record<string, string>>>({});
    const [roleActionBusy, setRoleActionBusy] = React.useState(false);
    const [promptBusy, setPromptBusy] = React.useState(false);
    const [helpOpen, setHelpOpen] = React.useState<'deck' | 'rules' | 'roles' | null>(null);
    const [jesterSpin, setJesterSpin] = React.useState<{ label: string; result?: string } | null>(null);
    const [lastJesterLogKey, setLastJesterLogKey] = React.useState<string | null>(null);
    const [damagePopup, setDamagePopup] = React.useState<DamageResolvedLog | null>(null);
    const [damagePopupQueue, setDamagePopupQueue] = React.useState<DamageResolvedLog[]>([]);
    const [actionToast, setActionToast] = React.useState<ActionToastLog | null>(null);
    const [actionToastQueue, setActionToastQueue] = React.useState<ActionToastLog[]>([]);
    const [selectionModal, setSelectionModal] = React.useState<
        | { type: 'target'; title: string; rule: TargetRule }
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
    const wsMatchIdRef = React.useRef<string | null>(null);

    const localPlayerId = localPlayerInfo?.id ?? null;
    const localPlayerName = localPlayerInfo?.name;

    const refresh = React.useCallback(() => {
        if (!id) return;
        getMatch(id)
            .then(({ state: nextState }) => {
                setState(nextState);
                if (localPlayerId && !nextState.players.some((p) => p.id === localPlayerId)) {
                    if (localPlayerName) {
                        const fallback = nextState.players.find((p) => p.name === localPlayerName);
                        if (fallback) {
                            rememberMatchPlayer(id, fallback.id, fallback.name);
                            setLocalPlayerInfo({ id: fallback.id, name: fallback.name });
                            return;
                        }
                    }
                    setLocalPlayerInfo(null);
                    clearRememberedMatchPlayer(id);
                }
            })
            .catch((e) => setError((e as Error).message));
    }, [id, localPlayerId, localPlayerName]);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    React.useEffect(() => {
        if (!id) return;
        if (typeof window === 'undefined') return;
        if (wsMatchIdRef.current === id) return;
        wsMatchIdRef.current = id;

        const url = `${wsBase(API_BASE)}/rooms/${encodeURIComponent(id)}/ws`;
        let reconnectTimer: number | null = null;
        let pingTimer: number | null = null;
        let lastPongAt = Date.now();
        let backoffMs = 500;
        let closedByClient = false;

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

            const sendJoin = () => {
                const name = (localPlayerName ?? 'Player').trim() || 'Player';
                try {
                    ws.send(JSON.stringify({ t: 'join', name }));
                } catch {
                    // noop
                }
            };

            const scheduleReconnect = () => {
                if (closedByClient) return;
                setWsConnected(false);
                cleanup();
                const wait = Math.min(5000, backoffMs);
                backoffMs = Math.min(5000, Math.floor(backoffMs * 1.6));
                reconnectTimer = window.setTimeout(() => connect(), wait);
            };

            ws.addEventListener('open', () => {
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
                    try {
                        ws.send(JSON.stringify({ t: 'ping' }));
                    } catch {
                        // noop
                    }
                }, 25000);
            });

            ws.addEventListener('message', (event) => {
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
                if (parsed?.t === 'error') {
                    setError(String(parsed.message ?? 'サーバーエラー'));
                }
            });

            ws.addEventListener('close', () => scheduleReconnect());
            ws.addEventListener('error', () => scheduleReconnect());
        };

        connect();

        return () => {
            closedByClient = true;
            cleanup();
            closeCurrent();
        };
    }, [id, localPlayerName]);

    React.useEffect(() => {
        if (!id) return;
        if (import.meta.env.MODE === 'production') return;
        if (wsConnected) return;
        const timer = window.setInterval(() => refresh(), 2000);
        return () => window.clearInterval(timer);
    }, [id, refresh, wsConnected]);

    React.useEffect(() => {
        if (!state || state.players.length === 0) return;
        if (!selectedTargetId) return;
        if (state.players.some((p) => p.id === selectedTargetId)) {
            return;
        }
        setSelectedTargetId(null);
    }, [state, selectedTargetId]);

    if (!id) {
        return <div className={styles.page}>マッチIDが不正です。</div>;
    }

    const currentPlayerId = state?.currentPlayerId ?? state?.turnOrder?.[state?.currentTurn ?? 0];
    const isCurrentPlayer = (playerId: string) => currentPlayerId === playerId;
    const hands = state?.hands ?? {};
    const runtimeStates = state?.board?.playerStates ?? {};
    const installsByPlayer = React.useMemo(() => (state ? groupInstallsByPlayer(runtimeStates, CARD_LOOKUP) : {}), [state, runtimeStates]);
    const playerName = React.useCallback((pid: string | undefined) => state?.players.find((p) => p.id === pid)?.name ?? '不明なプレイヤー', [state?.players]);
    const isPlayerDefeated = (pid: string) => Boolean(runtimeStates[pid]?.isDefeated);
    const braTokens = state?.braTokens ?? {};
    const roleAttackUsed = state?.roleAttackUsed ?? {};
    const logs: GameLogEntry[] = state?.logs ?? [];
    const logsToDisplay = [...logs].slice(-20).reverse();
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
    const localRoleActions = getRoleActions(localPlayer?.roleId);
    const cardEffectMultiplier =
        localPlayerRuntime?.roleState?.cardEffectMultiplier ?? (localPlayer?.roleId === 'efficiency' ? 2 : 1);
    const cardEffectBonus = localPlayerRuntime?.roleState?.cardEffectBonus ?? 0;
    const pendingPrompt = state?.pendingPrompt ?? null;
    const pendingCard = pendingPrompt ? CARD_LOOKUP.get(pendingPrompt.cardId) : undefined;
    const pendingEffect = pendingPrompt && pendingCard ? pendingCard.effects?.[pendingPrompt.effectIndex] : undefined;
    const isPromptTarget = Boolean(pendingPrompt && localPlayer?.id === pendingPrompt.targetId);
    const isPromptBlocking = Boolean(pendingPrompt);
    const dischargeExists = Boolean(state?.players.some((p) => p.roleId === 'discharge'));
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

    const closeDamagePopup = React.useCallback(() => {
        if (damagePopupTimerRef.current) {
            window.clearTimeout(damagePopupTimerRef.current);
            damagePopupTimerRef.current = null;
        }
        setDamagePopup(null);
    }, []);

    React.useEffect(() => {
        setRoleActionChoices({});
    }, [localPlayer?.roleId]);

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
        if (latest.playerId === localPlayerId) {
            return;
        }
        const resultText = latest.description ?? '道化の効果';
        runJesterSpinWithResult(resultText);
    }, [state?.logs, lastJesterLogKey, localPlayerId, runJesterSpinWithResult]);

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        if (pendingPrompt) return;
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
    }, [state?.logs, pendingPrompt, damagePopup]);

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        if (pendingPrompt) return;
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
    }, [state?.logs, pendingPrompt, damagePopup]);

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
                | { type: 'target'; title: string; rule: TargetRule }
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
    const isBarrage = localPlayer?.roleId === 'barrage';
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

    const formatLogEntry = (entry: GameLogEntry): string => {
        const roundLabel =
            typeof entry.round === 'number' && Number.isFinite(entry.round)
                ? entry.round
                : typeof state?.round === 'number' && Number.isFinite(state.round)
                  ? state.round
                  : undefined;
        const prefix = roundLabel !== undefined ? `R${roundLabel} ` : '';
        switch (entry.type) {
            case 'roundStart':
                return roundLabel !== undefined ? `ラウンド${roundLabel}開始` : 'ラウンド開始';
            case 'turnStart':
                if (entry.label) {
                    return `${prefix}${playerName(entry.playerId)}の${entry.label}`;
                }
                if (entry.deferred || entry.kind === 'extended') {
                    return `${prefix}${playerName(entry.playerId)}の延長ターン開始`;
                }
                return `${prefix}${playerName(entry.playerId)}のターン開始`;
            case 'abilityDamage': {
                const sourceName = entry.sourcePlayerId ? playerName(entry.sourcePlayerId) : null;
                if (entry.sourceAbilityId === 'bomb_self_blowback') {
                    return `${prefix}${sourceName ?? playerName(entry.playerId)}の爆弾反動で${playerName(entry.playerId)}が${entry.amount}ダメージ`;
                }
                if (entry.sourceAbilityId === 'bomb_thorns') {
                    return `${prefix}${sourceName ?? playerName(entry.playerId)}の爆弾反射で${playerName(entry.playerId)}が${entry.amount}ダメージ`;
                }
                if (entry.sourceAbilityId === 'bomb_timed_bomb') {
                    return `${prefix}${playerName(entry.playerId)}の時限爆弾が爆発して${entry.amount}ダメージ`;
                }
                if (sourceName) {
                    return `${prefix}${sourceName}の能力で${playerName(entry.playerId)}が${entry.amount}ダメージ`;
                }
                return `${prefix}${playerName(entry.playerId)}が能力で${entry.amount}ダメージ`;
            }
            case 'cardPlay': {
                const cardInfo = CARD_LOOKUP.get(entry.cardId);
                const targetText = describeTargets(entry.targets);
                const cardName = cardInfo?.name ?? entry.cardId;
                return `${prefix}${playerName(entry.playerId)}が「${cardName}」を${targetText ? `${targetText}に` : ''}使用`;
            }
            case 'roleAttack': {
                const detail = entry.isStruggle ? '（悪あがき）' : '';
                const base = `${prefix}${playerName(entry.attackerId)}が${playerName(entry.targetId)}にロール攻撃${detail} - ${entry.damage}ダメージ`;
                return entry.selfInflicted ? `${base} / 自傷 ${entry.selfInflicted}` : base;
            }
            case 'roleAttackHit': {
                return `${prefix}${playerName(entry.attackerId)}の連撃 ${entry.hitIndex}/${entry.totalHits} → ${playerName(entry.targetId)} に ${entry.damage}ダメージ`;
            }
            case 'playerDefeated':
                return `${prefix}${playerName(entry.playerId)}が脱落`;
            case 'roleAction': {
                const desc = entry.description ?? entry.actionId;
                const target = entry.targetId ? ` → ${playerName(entry.targetId)}` : '';
                return `${prefix}${playerName(entry.playerId)}が${desc}${target}`;
            }
            case 'statusEffect': {
                const kindText = entry.kind === 'heal' ? '回復' : 'ダメージ';
                const effectText = entry.effect === 'burn' ? '炎上' : '出血';
                return `${prefix}${playerName(entry.playerId)}の${effectText}: ${entry.amount}${kindText}`;
            }
            case 'cardEffect': {
                const cardName = CARD_LOOKUP.get(entry.cardId)?.name ?? entry.cardId;
                const targetName = entry.targetId ? playerName(entry.targetId) : playerName(entry.playerId);
                if (entry.kind === 'draw') {
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}が${entry.count ?? 0}枚ドロー`;
                }
                if (entry.kind === 'heal') {
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}がHP+${entry.amount ?? 0}`;
                }
                if (entry.kind === 'adjustBra') {
                    const delta = entry.amount ?? 0;
                    const sign = delta >= 0 ? '+' : '';
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}のBra${sign}${delta}`;
                }
                if (entry.kind === 'addStatToken') {
                    const statLabel = STAT_LABELS[entry.stat ?? ''] ?? (entry.stat ? entry.stat.toUpperCase() : 'Stat');
                    const delta = entry.amount ?? 0;
                    const sign = delta >= 0 ? '+' : '';
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}の追加${statLabel}${sign}${delta}`;
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
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}に${label}${sign}${value}${suffix}`;
                }
                if (entry.kind === 'sealHand') {
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}の手札を封印 (${entry.count ?? 0}枚)`;
                }
                if (entry.kind === 'discard') {
                    return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」で${targetName}: ${entry.note ?? `手札を${entry.count ?? 0}枚捨てた`}`;
                }
                return `${prefix}${playerName(entry.playerId)}がカード「${cardName}」を使用`;
            }
            case 'damageReduced': {
                const reason =
                    entry.reason ??
                    (entry.source === 'install'
                        ? entry.cardId
                            ? `カード「${CARD_LOOKUP.get(entry.cardId)?.name ?? entry.cardId}」`
                            : '防御カード'
                        : entry.abilityId ?? '能力');
                return `${prefix}${playerName(entry.playerId)}のダメージを${entry.amount}軽減 (${reason})`;
            }
            case 'damageResolved': {
                const label = entry.label ?? 'ダメージ';
                const reducedText = entry.attempted !== entry.totalAfterReductions ? ` (${entry.attempted}→${entry.totalAfterReductions})` : '';
                if (entry.prevented) {
                    if (entry.attackerId && entry.attackerId !== entry.targetId) {
                        return `${prefix}${playerName(entry.attackerId)}→${playerName(entry.targetId)} ${label}: 無効${reducedText}`;
                    }
                    return `${prefix}${playerName(entry.targetId)} ${label}: 無効${reducedText}`;
                }
                if (entry.attackerId && entry.attackerId !== entry.targetId) {
                    return `${prefix}${playerName(entry.attackerId)}→${playerName(entry.targetId)} ${label}: ${entry.totalAfterReductions}ダメージ${reducedText}`;
                }
                return `${prefix}${playerName(entry.targetId)} ${label}: ${entry.totalAfterReductions}ダメージ${reducedText}`;
            }
            default:
                return '';
        }
    };

    const isTargetValid = (targetId: string | null, rule: TargetRule): boolean => {
        if (!targetId) return false;
        if (!state?.players.some((player) => player.id === targetId)) return false;
        if (rule.mode === 'self' && targetId !== localPlayerId) return false;
        if (rule.mode === 'others' && targetId === localPlayerId) return false;
        if (rule.disallowDefeated && isPlayerDefeated(targetId)) return false;
        return true;
    };

    const getTargetCandidates = React.useCallback(
        (rule: TargetRule): Player[] => {
            if (!state) return [];
            return state.players.filter((player) => {
                if (rule.mode === 'self' && player.id !== localPlayerId) return false;
                if (rule.mode === 'others' && player.id === localPlayerId) return false;
                if (rule.disallowDefeated && isPlayerDefeated(player.id)) return false;
                return true;
            });
        },
        [state, localPlayerId, isPlayerDefeated]
    );

    const requestTargetSelection = async (rule: TargetRule, title: string): Promise<string | null> => {
        const candidates = getTargetCandidates(rule);
        if (candidates.length === 0) {
            alert('対象にできるプレイヤーがいません。');
            return null;
        }
        const selected = await requestSelection({ type: 'target', title, rule });
        if (!selected) return null;
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

    const handleDraw = async (count = 1) => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        try {
            const { state: nextState } = await drawCards(id, playerId, count);
            setState(nextState);
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
                if (localPlayer?.roleId === 'strong_greed') {
                    greedSelections = {};
                    for (const opt of opts) {
                        const optEffects = (opt.effects ?? []).filter((eff) => eff.trigger === chooseOneEffect.trigger);
                        const optTargetRule = getTargetRuleFromEffects(optEffects);
                        if (optTargetRule) {
                            const targetId = await requestTargetSelection(
                                optTargetRule,
                                `${cardMeta?.name ?? cardId}：${opt.label} の対象を選択`
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

            const isGreed = localPlayer?.roleId === 'strong_greed';
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
                const targetId = await requestTargetSelection(targetRule, 'カード対象を選択');
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
            if (choicesPayload) {
                params.choices = choicesPayload;
            }
            const { state: nextState } = await playCard(id, playerId, cardId, params);
            setState(nextState);
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
        const targetId = await requestTargetSelection(attackRule, '攻撃対象を選択');
        if (!targetId) return;
        const struggle = (braTokens[playerId] ?? 0) <= 0;
        try {
            const { state: nextState } = await roleAttack(id, playerId, targetId, struggle);
            setState(nextState);
        } catch (err) {
            alert('ロール攻撃に失敗しました: ' + (err as Error).message);
            refresh();
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
            const { state: nextState } = await endTurn(id, playerId);
            setState(nextState);
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
            const { state: nextState } = await rescueBra(id, playerId);
            setState(nextState);
        } catch (err) {
            alert('救済に失敗しました: ' + (err as Error).message);
        }
    };

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
            const selected = await requestTargetSelection(rule, '対象プレイヤーを選択');
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
            if (action.id === 'jester_random') {
                clearJesterSpinTimers();
                let spinIndex = 0;
                setJesterSpin({ label: jesterSpinItems[0] });
                jesterSpinStartRef.current = Date.now();
                jesterSpinIntervalRef.current = window.setInterval(() => {
                    spinIndex = (spinIndex + 1) % jesterSpinItems.length;
                    setJesterSpin({ label: jesterSpinItems[spinIndex] });
                }, 90);
            }
            const { state: nextState } = await performRoleAction(id, playerId, action.id, {
                targetId: targetId ?? undefined,
                choices: injectedChoices ?? roleActionChoices[action.id],
            });
            if (action.id === 'jester_random') {
                const latestRoleAction = [...(nextState.logs ?? [])].reverse().find(isRoleActionLog);
                const isSelfAction =
                    latestRoleAction &&
                    latestRoleAction.playerId === playerId &&
                    latestRoleAction.actionId === action.id;
                const resultText = isSelfAction ? latestRoleAction.description ?? '道化の効果' : '道化の効果';
                if (isSelfAction && latestRoleAction) {
                    setLastJesterLogKey(`${latestRoleAction.timestamp}-${latestRoleAction.playerId}-${latestRoleAction.actionId}`);
                }
                const startedAt = jesterSpinStartRef.current ?? Date.now();
                const elapsed = Date.now() - startedAt;
                const remain = Math.max(0, 1000 - elapsed);
                jesterSpinTimeoutRef.current = window.setTimeout(() => {
                    if (jesterSpinIntervalRef.current) {
                        window.clearInterval(jesterSpinIntervalRef.current);
                        jesterSpinIntervalRef.current = null;
                    }
                    setJesterSpin({ label: resultText, result: resultText });
                    jesterSpinClearRef.current = window.setTimeout(() => {
                        setJesterSpin(null);
                    }, 1000);
                }, remain);
            }
            setState(nextState);
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
            const { state: nextState } = await resolvePrompt(id, localPlayer.id, accepted);
            setState(nextState);
        } catch (err) {
            alert('割り込みの処理に失敗しました: ' + (err as Error).message);
        } finally {
            setPromptBusy(false);
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
        if (action.choices?.length) {
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
        const choiceValues = roleActionChoices[action.id] ?? {};
        return (
            <div className={styles.choiceRow}>
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
        const roleInfo = player.roleId ? ROLE_LOOKUP.get(player.roleId) : undefined;
        const runtime = runtimeStates[player.id];
        const roleRuntime = runtime?.roleState;
        const surgeryPhase = roleRuntime?.surgeryPhase;
        const surgeryText =
            surgeryPhase === 'immobilize'
                ? '手術準備中（このターンは行動不可）'
                : surgeryPhase === 'heal'
                ? '手術回復待ち（次のターン開始時にHP+15）'
                : null;
        const chargeTokens = roleRuntime?.chargeTokens ?? 0;
        const shockTokens = roleRuntime?.shockTokens ?? 0;
        const statusEffects = buildStatusEffects(runtime, player.roleId, state?.round, player.id, state?.nextRoundPriority);
        const clampGiantStat = (stat: 'def' | 'spe', value: number): number => {
            if (player.roleId !== 'giant') return value;
            return Math.min(value, 0);
        };
        const stats = runtime
            ? {
                  hp: `${runtime.hp} / ${runtime.maxHp}`,
                  tempHp: runtime.tempHp,
                  atk: runtime.baseStats.atk + runtime.statTokens.atk + runtime.turnBoosts.atk,
                  def: clampGiantStat('def', runtime.baseStats.def + runtime.statTokens.def + runtime.turnBoosts.def),
                  spe: clampGiantStat('spe', runtime.baseStats.spe + runtime.statTokens.spe + runtime.turnBoosts.spe),
                  bra: runtime.baseStats.bra + runtime.statTokens.bra + runtime.turnBoosts.bra,
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
        const showDetail = runtime && hoveredPlayerId === player.id;
        const installsForPlayer = installsByPlayer[player.id] ?? [];
        return (
            <li
                key={player.id}
                className={styles.playerCard}
                onMouseEnter={() => setHoveredPlayerId(player.id)}
                onMouseLeave={() => setHoveredPlayerId((prev) => (prev === player.id ? null : prev))}
            >
                <div className={styles.playerHeader}>
                    <div>
                        <div className={styles.playerName}>{player.name}</div>
                        <div className={styles.playerRole}>ロール: {roleInfo?.name ?? '未設定'}</div>
                    </div>
                    {controlling && <span className={styles.controlBadge}>このタブで操作中</span>}
                </div>
                {stats && (
                    <div className={styles.statLine}>
                        <span>
                            HP {stats.hp}
                            {runtime && runtime.tempHp > 0 && ` (+Temp ${runtime.tempHp})`}
                        </span>
                        <span>Atk {stats.atk}</span>
                        <span>Def {stats.def}</span>
                        <span>Spe {stats.spe}</span>
                        <span>Bra {stats.bra}</span>
                    </div>
                )}
                <div className={styles.statLine}>
                    <span>Bra トークン: {braTokens[player.id] ?? 0}</span>
                    <span>手札 {hands[player.id]?.length ?? 0}枚</span>
                </div>
                {dischargeExists && (chargeTokens > 0 || shockTokens > 0) && (
                    <div className={styles.statLine}>
                        {player.roleId === 'discharge' && chargeTokens > 0 && <span>チャージ: {chargeTokens}</span>}
                        {shockTokens > 0 && <span>感電: {shockTokens}</span>}
                    </div>
                )}
                {runtime?.isDefeated && <div className={styles.defeatedText}>脱落</div>}
                {surgeryText && <div className={styles.surgeryText}>{surgeryText}</div>}
                {statusEffects.length > 0 && (
                    <div className={styles.effectChips}>
                        {statusEffects.map((effect) => (
                            <span
                                key={`${player.id}-${effect.key}`}
                                title={effect.tooltip}
                                className={styles.effectChip}
                                style={{ background: effect.color }}
                            >
                                <span aria-hidden>{effect.icon}</span>
                                <span>{effect.label}</span>
                                {effect.value !== undefined && <span>{effect.value}</span>}
                            </span>
                        ))}
                    </div>
                )}
                {roleInfo?.text && <p className={styles.roleText}>{roleInfo.text}</p>}
                {showDetail && runtime && (
                    <div className={styles.playerDetail}>
                        <div className={styles.detailGrid}>
                            <div>
                                <div className={styles.detailLabel}>ターン中ボーナス</div>
                                <div className={styles.detailValue}>
                                    Atk {runtime.turnBoosts.atk}, Def {runtime.turnBoosts.def}, Spe {runtime.turnBoosts.spe}, Bra {runtime.turnBoosts.bra}
                                </div>
                            </div>
                            <div>
                                <div className={styles.detailLabel}>トークン</div>
                                <div className={styles.detailValue}>
                                    Atk {runtime.statTokens.atk}, Def {runtime.statTokens.def}, Spe {runtime.statTokens.spe}, Bra {runtime.statTokens.bra}
                                </div>
                            </div>
                        </div>
                        {installsForPlayer.length > 0 && (
                            <div className={styles.installList}>
                                <div className={styles.detailLabel}>設置カード</div>
                                <ul>
                                    {installsForPlayer.map((install) => (
                                        <li key={install.instanceId} className={styles.installItem}>
                                            <div className={styles.installName}>{install.name}</div>
                                            {install.category && (
                                                <div className={styles.installMeta}>
                                                    {getCategoryLabel(install.category)} ・ {install.kind ?? 'skill'}
                                                </div>
                                            )}
                                            {install.text && <p className={styles.installText}>{install.text}</p>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </li>
        );
    };

    const handWrapperStyle: React.CSSProperties = {
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 6,
    };

    const cardButtonStyle = (active: boolean): React.CSSProperties => ({
        position: 'relative',
        border: '1px solid #cbd5f5',
        borderRadius: 12,
        padding: '12px 14px',
        textAlign: 'left',
        background: active ? 'linear-gradient(135deg, #1d4ed8, #9333ea)' : '#f1f5f9',
        color: active ? '#fff' : '#0f172a',
        cursor: active ? 'pointer' : 'not-allowed',
        boxShadow: active ? '0 6px 15px rgba(37, 99, 235, 0.35)' : 'none',
        minHeight: 150,
        width: 180,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        justifyContent: 'space-between',
        flexShrink: 0,
    });

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Match {id}</h1>
                    <p className={styles.subtitle}>ロビーID: {id}</p>
                </div>
                <div className={styles.headerMeta}>
                    {state && (
                        <>
                            <span className={styles.metaBadge}>手番: {currentPlayerName}</span>
                            <span className={styles.metaBadge}>{deckInfo}</span>
                            {trickRoomLabel && <span className={styles.metaBadge}>{trickRoomLabel}</span>}
                        </>
                    )}
                    <div className={styles.helpButtons}>
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
                        <p style={{ marginTop: 8, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                            {playerName(pendingPrompt.attackerId)} → {playerName(pendingPrompt.targetId)}
                        </p>
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
                                <div style={{ fontSize: 12, color: '#9a3412' }}>防御カード（割り込み）</div>
                                <div style={{ fontWeight: 800, marginTop: 4 }}>{pendingCard?.name ?? pendingPrompt.cardId}</div>
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
                                {damagePopup.source === 'status'
                                    ? `${playerName(damagePopup.targetId)}（特殊ダメージ${damagePopup.label ? `: ${damagePopup.label}` : ''}）`
                                    : damagePopup.attackerId === damagePopup.targetId
                                      ? `${playerName(damagePopup.targetId)}（自傷${damagePopup.label ? `: ${damagePopup.label}` : ''}）`
                                      : `${playerName(damagePopup.attackerId)} → ${playerName(damagePopup.targetId)}`}
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

            {actionToast && !pendingPrompt && !damagePopup && (
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
                        <section className={`${styles.sectionCard} ${styles.compactSection}`}>
                            <div className={styles.statusGrid}>
                                <div className={styles.statusCard}>
                                    <div className={styles.statusLabel}>現在の手番</div>
                                    <div className={styles.statusValue}>{currentPlayerName}</div>
                                </div>
                                <div className={styles.statusCard}>
                                    <div className={styles.statusLabel}>山札 / 捨て札</div>
                                    <div className={styles.statusValue}>{deckPileInfo}</div>
                                </div>
                                <button onClick={refresh} className={styles.secondaryButton}>
                                    手動更新
                                </button>
                            </div>
                            {localPlayer && (
                                <>
                                    <div className={styles.controlsRow}>
                                        <button
                                            onClick={() => handleDraw(1)}
                                            disabled={!isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking}
                                            className={styles.primaryButton}
                                        >
                                            1枚ドロー
                                        </button>
                                        <button
                                            onClick={handleRoleAttack}
                                            disabled={roleAttackDisabled || isPromptBlocking}
                                            className={`${styles.primaryButton} ${attackIsStruggle ? styles.dangerButton : ''}`}
                                        >
                                            {attackButtonLabel}
                                        </button>
                                        {localMaxBra !== null && localMaxBra <= 0 && rescueBraCost !== null && (
                                            <button
                                                onClick={handleRescueBra}
                                                disabled={!isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking}
                                                className={`${styles.primaryButton} ${styles.dangerButton}`}
                                                title="最大Braが0のときのみ実行できます。最大HPの1/4を消費して最大Braを+1します。"
                                            >
                                                救済（HP-{rescueBraCost} / 最大Bra+1）
                                            </button>
                                        )}
                                        <button
                                            onClick={handleEndTurn}
                                            disabled={!isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking}
                                            className={styles.secondaryButton}
                                        >
                                            ターンを終える
                                        </button>
                                    </div>
                                    {localRoleActions.length > 0 && (
                                        <div className={styles.roleActionGrid}>
                                            {localRoleActions.map((action) => {
                                                const availability = getRoleActionAvailability(action);
                                                return (
                                                    <div key={action.id} className={styles.roleActionCard}>
                                                        <div className={styles.roleActionHeader}>
                                                            <strong>{action.label}</strong>
                                                            <span className={styles.roleActionCost}>Bra消費: {action.costBra ?? 0}</span>
                                                        </div>
                                                        {action.description && (
                                                            <p className={styles.roleActionText}>{action.description}</p>
                                                        )}
                                                        {action.requiresTarget && (
                                                            <div className={styles.roleActionMeta}>
                                                                対象: {selectedTargetId ? playerName(selectedTargetId) : '未選択'}
                                                            </div>
                                                        )}
                                                        {renderRoleActionChoiceControls(action)}
                                                        <button
                                                            onClick={() => handleRoleAction(action)}
                                                            disabled={availability.disabled || isPromptBlocking}
                                                            className={styles.roleActionButton}
                                                        >
                                                            実行
                                                        </button>
                                                        {availability.disabled && availability.reason && (
                                                            <div className={styles.roleActionReason}>{availability.reason}</div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>

                        <section className={`${styles.sectionCard} ${styles.playersSection}`}>
                            <div className={styles.sectionHeader}>
                                <h2>プレイヤー情報</h2>
                                {localPlayer ? (
                                    <span className={styles.sectionBadge}>このタブは {localPlayer.name} を操作中</span>
                                ) : (
                                    <span className={styles.sectionBadgeDanger}>このタブには操作権がありません</span>
                                )}
                            </div>
                            <ul className={styles.playerList}>{state.players.map((player) => renderPlayerCard(player))}</ul>
                        </section>

                        {localPlayer && (
                            <section className={`${styles.sectionCard} ${styles.handSection}`}>
                                <h2 className={styles.sectionTitle}>手札</h2>
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
                                                    const bloodPatternText = isBloodPattern ? '🩸 血の紋様\n' : '';
                                                    const curseHeaderText = curseLabel ? `🪄 ${curseLabel}\n` : '';
                                                    const curseDescriptionText = curseDescription ? `📝 ${curseDescription}\n\n` : '';
                                                    setTooltip({
                                                        title: info?.name ?? cardId,
                                                        text: `${curseHeaderText}${bloodPatternText}${curseDescriptionText}${info?.text ?? '説明がありません。'}`,
                                                        x,
                                                        y,
                                                        adjustments,
                                                    });
                                                }}
                                                onMouseLeave={() => setTooltip((prev) => (prev ? null : prev))}
                                            >
                                                <button onClick={() => handlePlay(cardId, idx)} disabled={!canPlay} style={cardButtonStyle(canPlay)}>
                                                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                                                        {getCategoryLabel(info?.category) ?? 'CARD'} ・ {info?.kind ?? 'skill'}
                                                    </div>
                                                    <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{info?.name ?? cardId}</div>
                                                    <div style={{ fontSize: 12, marginTop: 4 }}>コスト {info?.cost ?? 1}</div>
                                                </button>
                                                {isSealed && <div className={styles.sealedHandOverlay} aria-hidden="true" />}
                                                {isCursed && <div className={styles.cursedHandOverlay} aria-hidden="true" />}
                                                {isBloodPattern && <div className={styles.bloodPatternOverlay} aria-hidden="true" />}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className={styles.customCardRow}>
                                    <input
                                        value={customCardId}
                                        onChange={(e) => setCustomCardId(e.target.value)}
                                        placeholder="カードIDを入力"
                                        className={styles.textInput}
                                    />
                                    <button
                                        onClick={() => handlePlay(customCardId)}
                                        disabled={!isCurrentPlayer(localPlayer.id) || !customCardId || isLocalDefeated || isPromptBlocking}
                                        className={styles.secondaryButton}
                                    >
                                        入力カードをプレイ
                                    </button>
                                </div>
                            </section>
                        )}

                        {!localPlayer && (
                            <section className={`${styles.sectionCard} ${styles.viewOnlyBanner}`}>
                                <p>このブラウザは観戦モードです。ロビー参加時に割り当てられたプレイヤーのみ操作できます。</p>
                            </section>
                        )}
                    </div>

                    <aside className={styles.sidebar}>
                        <section className={styles.sectionCard}>
                            <h2 className={styles.sectionTitle}>ターンログ</h2>
                            <div className={styles.logPanel}>
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
            {tooltip && (
                <div className={styles.cardTooltipFloating} style={{ top: tooltip.y, left: tooltip.x }}>
                    <strong>{tooltip.title}</strong>
                    <p style={{ marginTop: 4, lineHeight: 1.4 }}>{tooltip.text}</p>
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
                                        {selectionTargets.map((player) => (
                                            <button
                                                key={player.id}
                                                type="button"
                                                className={styles.secondaryButton}
                                                onClick={() => closeSelection(player.id)}
                                            >
                                                {player.name}
                                                {isPlayerDefeated(player.id) ? ' (脱落)' : ''}
                                            </button>
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
                                <ul className={styles.cardList}>
                                    {deckCounts.length === 0 && <li className={styles.cardItem}>デッキ情報がありません。</li>}
                                    {deckCounts.map(({ cardId, count, info }) => (
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
                                                {info?.kind && <span className={styles.cardMetaChip}>{info.kind}</span>}
                                            </div>
                                            {info?.text && <p>{info.text}</p>}
                                        </li>
                                    ))}
                                </ul>
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
                                        <li>行動: ドロー、カード使用、ロール攻撃、ターン終了。</li>
                                        <li>カード: 対象指定やステータス選択が必要なものがあります。</li>
                                        <li>ログ: 右側で直近の行動履歴を確認できます。</li>
                                    </ul>
                                    <h3 style={{ marginTop: 12 }}>用語</h3>
                                    <ul>
                                        <li>通常ダメージ: Defで軽減されるダメージ（例: ジャブ、ボディプレス、ロール攻撃など）。</li>
                                        <li>固定ダメージ: Defで軽減されないダメージ（例: ダイナマイトなど）。</li>
                                        <li>特殊ダメージ: 炎上/出血などのダメージ。基本的に防御カードで防げない（例外あり）。</li>
                                        <li>火炎: 炎上のスタック。ターン終了時にダメージ（火炎ロールなど一部例外あり）。</li>
                                        <li>次のうちどれか選ぶ: 効果の候補から1つを選んで発動する形式。</li>
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
