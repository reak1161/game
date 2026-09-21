import type { CardDefinition, CardEffect, CardTarget, GameLogEntry, GameState, PlayerRuntimeState } from '@shared/types';

export type StatusEffectChip = {
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

export type CardEffectAdjustment = {
    label: string;
    base: number;
    adjusted: number;
};

export type TargetRule = {
    mode: 'any' | 'self' | 'others';
    disallowDefeated?: boolean;
};

const CHIP_BUCKET_ORDER: Record<NonNullable<StatusEffectChip['bucket']>, number> = {
    role: 0,
    equip: 1,
    defense: 2,
    buff: 3,
    debuff: 4,
};

export const STAT_LABELS: Record<string, string> = {
    hp: 'HP',
    atk: 'Atk',
    def: 'Def',
    spe: 'Spe',
    bra: 'Bra',
};

const effectHasTarget = (effect: CardEffect): effect is CardEffect & { target: CardTarget } => 'target' in effect;

export const getStatusChipBucket = (chipKey: string): NonNullable<StatusEffectChip['bucket']> => {
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

export const sortChips = (chips: StatusEffectChip[]): StatusEffectChip[] =>
    [...chips].sort((a, b) => {
        const aBucket = CHIP_BUCKET_ORDER[a.bucket ?? 'role'] ?? 0;
        const bBucket = CHIP_BUCKET_ORDER[b.bucket ?? 'role'] ?? 0;
        if (aBucket !== bBucket) return aBucket - bBucket;
        const aOrder = a.sortOrder ?? 0;
        const bOrder = b.sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.label.localeCompare(b.label, 'ja');
    });

export const flattenCardEffects = (effects: CardEffect[] | undefined): CardEffect[] => {
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

export const cardNeedsStatChoice = (card?: CardDefinition | null): boolean =>
    Boolean(flattenCardEffects(card?.effects).some((effect) => effect.type === 'doubleBaseStat'));

export const getTargetRuleFromEffects = (effects?: CardEffect[]): TargetRule | null => {
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

export const getCardTargetRule = (card?: CardDefinition | null): TargetRule | null => getTargetRuleFromEffects(card?.effects);

export const isRoleActionLog = (entry: GameLogEntry): entry is Extract<GameLogEntry, { type: 'roleAction' }> =>
    entry.type === 'roleAction';

export type DamageResolvedLog = Extract<GameLogEntry, { type: 'damageResolved' }>;
export const isDamageResolvedLog = (entry: GameLogEntry): entry is DamageResolvedLog => entry.type === 'damageResolved';

export type ActionToastLog = Exclude<
    GameLogEntry,
    Extract<GameLogEntry, { type: 'damageResolved' | 'damageReduced' | 'roleAttack' | 'roleAttackHit' | 'abilityDamage' }>
>;
export const isActionToastLog = (entry: GameLogEntry): entry is ActionToastLog =>
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

export const buildTurnLogDisplay = (logs: GameLogEntry[], maxEntries = 20, lookback = 120): GameLogEntry[] => {
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

    // ターン開始→使用→効果詳細の並びを崩さないため、ターン内の再ソートは行わない。
    const flat = groups.flat();
    if (flat.length <= maxEntries) return flat;
    return flat.slice(flat.length - maxEntries);
};

export const buildCardEffectAdjustments = (
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

export const buildStatusEffects = (
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
            tooltip: roleId === 'flame' ? `炎上${burn}: ターン終了時に${burn}回復し、炎上-1` : `炎上${burn}: ターン終了時に${burn}ダメージを受け、炎上-1`,
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

export const groupInstallsByPlayer = (
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
