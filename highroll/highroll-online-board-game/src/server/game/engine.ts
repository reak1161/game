import {
    addPlayerToState,
    createInitialGameState,
    createPlayer,
    setMatchStatus,
    setPlayerReady,
    setPlayerRole,
    setSharedDeck,
    drawFromSharedDeck,
    playCardFromHand,
    updatePlayerScore,
    setTurnOrder,
    setBraTokens,
    consumeBra,
    setPlayerRuntimeState,
    updatePlayerRuntimeState,
} from '../../shared/utils/gameState';
import type {
    AddStatTokenEffect,
    AdjustBraEffect,
    AdrenalineEffect,
    ApplyBleedEffect,
    ApplyBurnEffect,
    ApplyDizzyEffect,
    ApplyShockEffect,
    ApplyStatDebuffUntilDamageEffect,
    ApplyStunEffect,
    BrokenWindowTheoryEffect,
    CardDefinition,
    CardEffect,
    CardTarget,
    CoinFlipDealDamageEffect,
    CoinFlipDealDamageEitherEffect,
    CombatStatKey,
    DamageSource,
    DealDamagePerSealedHandEffect,
    DealDamageEffect,
    DiscardAllHandEffect,
    DiscardThenDrawEffect,
    DoubleBaseStatEffect,
    DrawCardsEffect,
    EffectCondition,
    FeintEffect,
    GameState,
    GameLogEntry,
    HealEffect,
    LibraryBurstEffect,
    MatchSummary,
    ModifyTurnOrderEffect,
    ModifyMaxHpInstallEffect,
    SetNextRoleAttackAtkBonusEffect,
    PendingAction,
    PendingPrompt,
    Player,
    PlayerRuntimeState,
    PoltergeistEffect,
    ReduceDamageOnceEffect,
    Role,
    RoleParams,
    RoleAbility,
    RoleAbilitySpendTokenChoice,
    RoleAbilityThreshold,
    RoleAbilityValue,
    RoleAbilityValueSource,
    RoleRuntimeState,
    CurseId,
    SealHandEffect,
    SetNextRoundPriorityEffect,
    StatKey,
    StatModifierMap,
    TauntUntilNextTurnStartEffect,
} from '../../shared/types';
import {
    createRuntimeStateFromRole,
    evaluateDamageFormula,
    evaluateValueFormula,
    getEffectiveStatValue,
    mutateBaseStat,
} from './effectUtils';
import { getRoleActions } from '../../shared/roleActions';

type EngineCatalog = {
    roles: Role[];
    cards: CardDefinition[];
};

const generateUuid = (): string => {
    if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
        const cryptoObj = globalThis.crypto as Crypto | undefined;
        if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID();
        }
    }
    return `id-${Math.random().toString(36).slice(2, 11)}`;
};

export interface PlayCardOptions {
    targets?: string[];
    handIndex?: number;
    choices?: Record<string, string | number | boolean | number[] | string[] | Record<string, unknown>>;
}

export interface RoleActionOptions {
    targetId?: string;
    choices?: Record<string, string | number | boolean>;
}

type AbilityTriggerResult = {
    damageReduction?: number;
};

type PendingSkip = {
    installInstanceId: string;
    effectIndex: number;
};

type ForcedPromptDecision = PendingSkip & {
    decision: 'accept' | 'decline';
};

type DamageResolutionOptions = {
    allowPrompt?: boolean;
    skipOptional?: PendingSkip;
    forcedPromptDecision?: ForcedPromptDecision;
    action?: PendingAction;
    cardId?: string;
    abilityId?: string;
    label?: string;
    contactAttack?: boolean;
    ignoreDefenseInstalls?: boolean;
};

interface RoleAbilityContext {
    attackerId?: string;
    targetId?: string;
    damageSource?: DamageSource;
    damageAmount?: number;
    damageTaken?: number;
    damageDealt?: number;
    spentStatTokens?: number;
    stat?: StatKey;
    previousStatTotal?: number;
    nextStatTotal?: number;
    alivePlayers?: number;
}

export class GameEngine {
    private state: GameState;
    private readonly roleMap: Map<string, Role>;
    private readonly cardMap: Map<string, CardDefinition>;
    private lastDefeatContext: { attackerId: string; targetId: string; selfInflicted: boolean } | null = null;
    private lastNonSelfDefeatTargetId: string | null = null;

    private cpuPlayers = new Map<string, 'easy' | 'normal' | 'hard'>();
    private cpuLoopActive = false;
    private cpuTimer: ReturnType<typeof setTimeout> | null = null;
    private cpuNextAt = 0;
    // CPUの行動が速すぎると何が起きたか分からないため、最低間隔を設ける（ms）
    private readonly cpuActionDelayMs = 1000;

    private readonly cursePool: CurseId[] = [
        'weakness',
        'force',
        'decay',
        'collapse',
        'cost',
        'rebuttal',
        'enrage',
        'resonate',
        'silence',
        'wear',
    ];

    private transientCardEffectBonus = new Map<string, number>();

    private scheduleCpuStep(): void {
        if (this.cpuTimer) {
            return;
        }
        const delay = Math.max(0, this.cpuNextAt - Date.now());
        this.cpuTimer = setTimeout(() => {
            this.cpuTimer = null;
            this.runCpuStep();
        }, delay);
    }

    private runCpuStep(): void {
        if (this.cpuLoopActive) {
            return;
        }
        if (this.state.status !== 'inProgress') {
            return;
        }
        if (this.state.pendingPrompt) {
            return;
        }
        const current = this.state.currentPlayerId;
        if (!current || !this.isCpuPlayer(current)) {
            return;
        }

        this.cpuLoopActive = true;
        try {
            this.performCpuTurn(current);
        } finally {
            this.cpuLoopActive = false;
        }

        this.cpuNextAt = Date.now() + this.cpuActionDelayMs;
        this.scheduleCpuStep();
    }

    private previewDamageOutcome(
        targetId: string,
        attackerId: string | undefined,
        incoming: number,
        source: DamageSource
    ): { totalAfterReductions: number; tempAbsorbed: number; hpDamage: number; breakdown: string[] } {
        const runtime = this.getRuntime(targetId);
        if (!runtime || incoming <= 0) {
            return { totalAfterReductions: Math.max(0, incoming), tempAbsorbed: 0, hpDamage: 0, breakdown: [] };
        }

        let remaining = incoming;
        const breakdown: string[] = [];

        const abilities = this.getRoleAbilities(targetId).filter((ability) => ability.trigger === 'beforeDamageTaken');
        abilities.forEach((ability) => {
            if (remaining <= 0) return;
            if (ability.id === 'swiftwind_spend_spe_reduce_damage' && source !== 'role' && source !== 'card') {
                return;
            }

            const before = remaining;
            const spendSpec = ability.playerChoice?.spendStatToken;
            let spent = 0;
            if (spendSpec) {
                const available = runtime.statTokens[spendSpec.stat] ?? 0;
                if (available > 0) {
                    const maxAllowed = spendSpec.max === 'any' ? available : Math.min(available, spendSpec.max);
                    const desired = Math.min(maxAllowed, Math.max(0, Math.floor(remaining)));
                    const minRequired = spendSpec.min ?? 0;
                    spent = Math.max(Math.min(maxAllowed, desired), Math.min(maxAllowed, minRequired));
                }
            }

            let reduction = 0;
            for (const action of ability.actions ?? []) {
                if (!('reduceIncomingDamageBy' in action)) continue;
                const value = action.reduceIncomingDamageBy === 'spent' ? spent : Number(action.reduceIncomingDamageBy ?? 0);
                if (Number.isFinite(value) && value > 0) {
                    reduction += value;
                }
            }
            if (reduction <= 0) return;

            const reduced = Math.min(reduction, before);
            remaining = Math.max(0, remaining - reduction);

            if (ability.id === 'swiftwind_spend_spe_reduce_damage' && spent > 0) {
                breakdown.push(`疾風: Speトークン${spent}消費で${reduced}軽減`);
            } else {
                breakdown.push(`${ability.text ?? ability.id}: ${reduced}軽減`);
            }
        });

        const totalAfterReductions = Math.max(0, remaining);
        const tempAbsorbed = Math.min(runtime.tempHp, totalAfterReductions);
        const hpDamage = Math.min(runtime.hp, Math.max(0, totalAfterReductions - tempAbsorbed));

        return { totalAfterReductions, tempAbsorbed, hpDamage, breakdown };
    }

    private logDamageResolved(details: {
        attackerId?: string;
        targetId: string;
        source: DamageSource;
        label?: string;
        attempted: number;
        totalAfterReductions: number;
        tempAbsorbed: number;
        hpDamage: number;
        prevented?: boolean;
        breakdown?: string[];
        cardId?: string;
        abilityId?: string;
    }): void {
        if (details.attempted <= 0) {
            return;
        }
        this.logEvent({
            type: 'damageResolved',
            attackerId: details.attackerId,
            targetId: details.targetId,
            source: details.source,
            label: details.label,
            attempted: details.attempted,
            totalAfterReductions: details.totalAfterReductions,
            tempAbsorbed: details.tempAbsorbed,
            hpDamage: details.hpDamage,
            prevented: details.prevented,
            breakdown: details.breakdown,
            cardId: details.cardId,
            abilityId: details.abilityId,
            timestamp: Date.now(),
        });
    }

    constructor(
        matchId: string,
        initialPlayers: Player[] = [],
        options?: {
            catalog: EngineCatalog;
            state?: GameState;
        }
    ) {
        if (!options?.catalog) {
            throw new Error('GameEngine requires catalog (roles/cards).');
        }
        this.state = options.state ?? createInitialGameState(matchId, initialPlayers);
        this.roleMap = new Map(options.catalog.roles.map((role) => [role.id, role]));
        this.cardMap = new Map(options.catalog.cards.map((card) => [card.id, card]));
    }

    private assertNoPendingPrompt(): void {
        if (this.state.pendingPrompt) {
            throw new Error('割り込み確認中です。対応が完了するまでお待ちください。');
        }
    }

    private setPendingPrompt(prompt?: PendingPrompt): void {
        this.state = {
            ...this.state,
            pendingPrompt: prompt,
            updatedAt: Date.now(),
        };

        // CPU が対象の割り込み（防御カード）なら、その場で自動解決する。
        if (prompt && this.isCpuPlayer(prompt.targetId)) {
            const accepted = this.decideCpuPromptAcceptance(prompt.targetId, prompt);
            this.resolvePendingPrompt(prompt.targetId, accepted);
        }
    }

    registerCpuPlayer(playerId: string, level: 'easy' | 'normal' | 'hard' = 'normal'): void {
        this.cpuPlayers.set(playerId, level);
    }

    private isCpuPlayer(playerId: string | undefined): boolean {
        if (!playerId) return false;
        return this.cpuPlayers.has(playerId);
    }

    private decideCpuPromptAcceptance(playerId: string, prompt: PendingPrompt): boolean {
        const level = this.cpuPlayers.get(playerId) ?? 'normal';
        if (level === 'easy') {
            return Math.random() < 0.5;
        }
        const preview = prompt.preview;
        if (!preview) {
            // ざっくり：大きいダメージほど防ぐ（NORMAL/HARD）
            return prompt.amount >= 3;
        }
        const before = preview.ifDeclined;
        const after = preview.ifAccepted;
        const hpReduced = before.hpDamage - after.hpDamage;
        const totalReduced = before.totalAfterReductions - after.totalAfterReductions;
        if (level === 'hard') {
            return hpReduced > 0 || totalReduced > 0;
        }
        return hpReduced > 0;
    }

    addPlayer(name: string, id?: string): Player {
        const player = createPlayer(name, id);
        this.state = addPlayerToState(this.state, player);
        return player;
    }

    markPlayerReady(playerId: string, isReady = true): void {
        this.state = setPlayerReady(this.state, playerId, isReady);
    }

    setPlayerRole(playerId: string, roleId: string): void {
        this.state = setPlayerRole(this.state, playerId, roleId);
        this.initializeRuntimeForPlayer(playerId);
    }

    assignSharedDeck(deckId: string, cards: string[]): void {
        this.state = setSharedDeck(this.state, deckId, cards);
    }

    drawCards(playerId: string, count: number): void {
        this.assertNoPendingPrompt();
        if (this.state.status === 'inProgress') {
            this.assertPlayerTurn(playerId);
        }
        this.state = drawFromSharedDeck(this.state, playerId, count);
        this.syncHandStatTokens(playerId);
    }

    playCard(playerId: string, cardId: string, options?: PlayCardOptions): void {
        this.assertNoPendingPrompt();
        this.assertPlayerTurn(playerId);
        this.assertPostponeAllowsAction(playerId);
        this.assertPostponeAllowsAction(playerId);
        this.assertCardInHand(playerId, cardId);
        const card = this.cardMap.get(cardId);
        if (!card) {
            throw new Error(`Card ${cardId} is not defined.`);
        }
        if (card.playable === false) {
            throw new Error('このカードはプレイできません。');
        }
        const roleId = this.getPlayer(playerId)?.roleId;
        if (roleId === 'giant') {
            if (card.category === 'equip') {
                throw new Error('巨人は装備カードを使用できません。');
            }
            if (card.category === 'defense') {
                throw new Error('巨人は防御カードを使用できません。');
            }
        }
        this.ensureRuntimeExists(playerId);

        const hand = this.state.hands[playerId] ?? [];
        const sealed = this.readRoleState(playerId).sealedHand ?? [];
        const sealedIndexSet = new Set(sealed.map((entry) => entry.index));
        let playableIndex = -1;
        const requestedIndex = options?.handIndex;
        if (typeof requestedIndex === 'number' && Number.isFinite(requestedIndex)) {
            const idx = Math.floor(requestedIndex);
            if (idx < 0 || idx >= hand.length) {
                throw new Error('手札インデックスが不正です。');
            }
            if (hand[idx] !== cardId) {
                throw new Error('指定した手札のカードIDが一致しません。');
            }
            if (sealedIndexSet.has(idx)) {
                throw new Error('このカードは封印されているため使用できません。');
            }
            playableIndex = idx;
        } else {
            playableIndex = hand.findIndex((id, idx) => id === cardId && !sealedIndexSet.has(idx));
        }

        const roleState = this.readRoleState(playerId);
        const cursedHand = roleState.cursedHand ?? [];
        const playedCurseId = cursedHand.find((entry) => entry.index === playableIndex)?.curseId ?? null;
        const forcedPlayableIndices = cursedHand
            .filter((entry) => entry.curseId === 'force')
            .filter((entry) => hand[entry.index] === entry.cardId)
            .filter((entry) => !sealedIndexSet.has(entry.index))
            .map((entry) => entry.index);
        if (forcedPlayableIndices.length > 0 && !forcedPlayableIndices.includes(playableIndex)) {
            throw new Error('強制の呪いにより、このカードしか使用できません。');
        }

        const extraBraCost = playedCurseId === 'enrage' ? 1 : 0;
        const totalBraCost = 1 + extraBraCost;
        this.assertBraAvailable(playerId, totalBraCost);

        const dizzyTurns = this.readRoleState(playerId).dizzyTurns ?? 0;
        const misfire = dizzyTurns > 0 && Math.random() < 0.5;
        if (playableIndex === -1) {
            throw new Error('このカードは封印されているため使用できません。');
        }

        const curseDiscardIndexRaw = options?.choices?.curseDiscardIndex;
        const needsRebuttalDiscard = playedCurseId === 'rebuttal';
        const originalDiscardIndex =
            needsRebuttalDiscard && typeof curseDiscardIndexRaw === 'number' && Number.isFinite(curseDiscardIndexRaw)
                ? Math.floor(curseDiscardIndexRaw)
                : null;
        if (needsRebuttalDiscard) {
            if (originalDiscardIndex === null) {
                throw new Error('反駁の呪い: 捨てる手札を選択してください。');
            }
            if (originalDiscardIndex < 0 || originalDiscardIndex >= hand.length) {
                throw new Error('反駁の呪い: 捨てる手札の指定が不正です。');
            }
            if (originalDiscardIndex === playableIndex) {
                throw new Error('反駁の呪い: 使用するカード自身は捨てられません。');
            }
        }

        this.discardHandCardToSharedDiscard(playerId, playableIndex);
        if (originalDiscardIndex !== null) {
            const adjusted = originalDiscardIndex > playableIndex ? originalDiscardIndex - 1 : originalDiscardIndex;
            this.discardHandCardToSharedDiscard(playerId, adjusted);
            this.logEvent({
                type: 'roleAction',
                playerId,
                actionId: 'curse_rebuttal_discard',
                description: '反駁の呪い: 手札を1枚捨てた',
                timestamp: Date.now(),
            });
        }
        if (misfire) {
            this.logEvent({ type: 'cardPlay', playerId, cardId, targets: options?.targets, timestamp: Date.now() });
            this.logEvent({
                type: 'roleAction',
                playerId,
                actionId: 'dizzy_misfire',
                description: 'めまいで不発になった',
                timestamp: Date.now(),
            });
            this.applyCursesOnCardUse(playerId, card, playedCurseId);
            this.state = consumeBra(this.state, playerId, totalBraCost);
            this.handlePostponeAfterAction(playerId);
            if (playedCurseId === 'silence') {
                this.endTurn(playerId);
                return;
            }
            this.runCpuIfNeeded();
            return;
        }
        const decayBonus = playedCurseId === 'decay' ? -2 : 0;
        this.withTransientCardEffectBonus(playerId, decayBonus, () => {
            if (card.kind === 'install') {
                this.reclaimCardFromDiscard(cardId);
                this.installCard(playerId, card);
                this.resolveCardEffects(playerId, card, 'onEquip', options);
            } else {
                this.resolveCardEffects(playerId, card, 'onPlay', options);
            }
            if (playedCurseId === 'resonate' && options?.targets?.some((t) => t !== playerId)) {
                this.applyResonanceMirrorEffects(playerId, card, card.kind === 'install' ? 'onEquip' : 'onPlay', options);
            }
        });
        this.applyWitchSpellPassive(playerId, card);
        this.applyCursesOnCardUse(playerId, card, playedCurseId);
        if (this.getCardEffectBonus(playerId) !== 0) {
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                cardEffectBonus: 0,
            }));
        }
        this.logEvent({ type: 'cardPlay', playerId, cardId, targets: options?.targets, timestamp: Date.now() });
        this.state = consumeBra(this.state, playerId, totalBraCost);
        this.handlePostponeAfterAction(playerId);
        if (playedCurseId === 'silence') {
            this.endTurn(playerId);
            return;
        }
        this.runCpuIfNeeded();
    }

    private discardHandCardToSharedDiscard(playerId: string, index: number): string {
        const hand = [...(this.state.hands[playerId] ?? [])];
        if (index < 0 || index >= hand.length) {
            throw new Error('手札の指定が不正です。');
        }
        const cardId = hand.splice(index, 1)[0];
        if (!cardId) {
            throw new Error('手札の指定が不正です。');
        }
        this.state = {
            ...this.state,
            hands: {
                ...this.state.hands,
                [playerId]: hand,
            },
            sharedDiscard: [...this.state.sharedDiscard, cardId],
            updatedAt: Date.now(),
        };
        this.shiftSealedHandAfterRemoval(playerId, index);
        this.shiftCursedHandAfterRemoval(playerId, index);
        this.shiftBloodPatternHandAfterRemoval(playerId, index);
        this.syncHandStatTokens(playerId);
        return cardId;
    }

    private applyWitchSpellPassive(playerId: string, card: CardDefinition): void {
        const player = this.getPlayer(playerId);
        if (player?.roleId !== 'witch') {
            return;
        }
        if (this.isRoleSuppressed(playerId)) {
            return;
        }
        if (card.category !== 'spell') {
            return;
        }
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            return;
        }
        const nextMax = runtime.maxHp + 1;
        const nextHp = Math.min(nextMax, runtime.hp + 1);
        this.state = setPlayerRuntimeState(this.state, playerId, {
            ...runtime,
            maxHp: nextMax,
            hp: nextHp,
        });
        this.logEvent({
            type: 'roleAction',
            playerId,
            actionId: 'witch_spell_growth',
            description: '呪文使用: 最大HP+1 / HP+1',
            timestamp: Date.now(),
        });
    }

    private applyCursesOnCardUse(playerId: string, _card: CardDefinition, curseId: CurseId | null): void {
        if (!curseId) {
            return;
        }
        if (curseId === 'cost') {
            this.applyDamageToPlayer(playerId, playerId, 2, 'ability', {
                allowPrompt: false,
                label: '代償の呪い',
            });
        }
        if (curseId === 'wear') {
            this.addStatTokensToPlayer(playerId, 'atk', -1);
            this.logEvent({
                type: 'roleAction',
                playerId,
                actionId: 'curse_wear',
                description: '摩耗の呪い: 追加Atk-1',
                timestamp: Date.now(),
            });
        }
    }

    private applyResonanceMirrorEffects(
        playerId: string,
        card: CardDefinition,
        trigger: CardEffect['trigger'],
        options?: PlayCardOptions
    ): void {
        card.effects?.forEach((effect, index) => {
            if (effect.trigger !== trigger) {
                return;
            }
            if (!this.shouldApplyOptionalEffect(effect, index, options)) {
                return;
            }
            if (!('target' in effect)) {
                return;
            }
            const target = (effect as { target?: CardTarget }).target;
            if (target !== 'chosen_enemy' && target !== 'chosen_player') {
                return;
            }
            const cloned = { ...effect, target: 'self' } as CardEffect;
            this.applyCardEffect(playerId, card, cloned, { ...options, targets: [playerId] });
        });
    }

    /**
     * 最大Braが0のプレイヤー向け救済措置。
     * 最大HPの1/4を消費して、恒久的に最大Braを+1する（そのターン中にBraトークンも+1される）。
     */
    rescueBra(playerId: string): void {
        this.assertNoPendingPrompt();
        this.assertPlayerTurn(playerId);
        const runtime = this.ensureRuntimeExists(playerId);
        if (runtime.isDefeated) {
            throw new Error('脱落しているため実行できません。');
        }
        const maxBra = getEffectiveStatValue(runtime, 'bra');
        if (maxBra > 0) {
            throw new Error('最大Braが0のときのみ実行できます。');
        }
        const cost = Math.max(1, Math.floor(runtime.maxHp / 4));
        if (runtime.hp <= cost) {
            throw new Error(`HPが足りません（必要: ${cost} / 現在: ${runtime.hp}）。`);
        }

        const nextHp = runtime.hp - cost;
        this.state = setPlayerRuntimeState(this.state, playerId, {
            ...runtime,
            hp: nextHp,
        });

        this.mutatePlayerBaseStat(playerId, 'bra', (current) => current + 1);
        const currentBraTokens = this.state.braTokens[playerId] ?? 0;
        this.state = setBraTokens(this.state, playerId, currentBraTokens + 1);

        this.logEvent({
            type: 'roleAction',
            playerId,
            actionId: 'rescue_bra',
            description: `救済: 最大HPの1/4（${cost}）消費で最大Bra+1`,
            timestamp: Date.now(),
        });
        this.handlePostponeAfterAction(playerId);
        this.runCpuIfNeeded();
    }

    roleAttack(playerId: string, targetId: string, options?: { struggle?: boolean }): void {
        this.assertNoPendingPrompt();
        this.assertPlayerTurn(playerId);
        if (!targetId) {
            throw new Error('攻撃対象を選択してください。');
        }
        if (playerId === targetId) {
            throw new Error('自分自身は対象にできません。');
        }
        const isStruggle = Boolean(options?.struggle);
        const currentBra = this.state.braTokens[playerId] ?? 0;
        const player = this.getPlayer(playerId);
        const isSuppressed = this.isRoleSuppressed(playerId);
        const isBarrage = player?.roleId === 'barrage' && !isSuppressed;
        const isResonate = player?.roleId === 'resonate' && !isSuppressed;
        if (!isStruggle && currentBra <= 0) {
            throw new Error('Braが足りません。');
        }
        if (isStruggle && currentBra > 0) {
            throw new Error('Braが残っているため悪あがきはできません。');
        }
        if (this.state.roleAttackUsed[playerId] && (!isBarrage || isStruggle)) {
            throw new Error('このターンのロール攻撃は既に使用済みです。');
        }

        const attackerRuntime = this.ensureRuntimeExists(playerId);
        const defenderRuntime = this.ensureRuntimeExists(targetId);
        if (defenderRuntime.isDefeated) {
            throw new Error('対象プレイヤーは既に倒れています。');
        }

        if (isResonate) {
            this.resonateRoleAttack(playerId, targetId, isStruggle);
            return;
        }

        const attackerRoleState = attackerRuntime.roleState ?? {};
        const nextRoleAttackAtkBonus = attackerRoleState.nextRoleAttackAtkBonus ?? 0;
        const ignoreDefenseInstalls = Boolean(attackerRoleState.nextRoleAttackIgnoreDefense);

        const atk = getEffectiveStatValue(attackerRuntime, 'atk') + Math.max(0, Math.floor(nextRoleAttackAtkBonus));
        const def = getEffectiveStatValue(defenderRuntime, 'def');
        const damage = Math.max(1, atk - def);

        const inflicted = this.applyDamageToPlayer(playerId, targetId, damage, 'role', {
            action: {
                type: 'roleAttack',
                attackerId: playerId,
                targetId,
                isStruggle,
            },
            label: 'ロール攻撃',
            ignoreDefenseInstalls,
        });
        if (inflicted === null) {
            return;
        }
        this.finishRoleAttack(playerId, targetId, inflicted, isStruggle);
        this.runCpuIfNeeded();
    }

    private finishRoleAttack(attackerId: string, targetId: string, inflicted: number, isStruggle: boolean): void {
        const attackerRoleState = this.readRoleState(attackerId);
        const consumedAtkBonus = attackerRoleState.nextRoleAttackAtkBonus ?? 0;
        const consumedIgnoreDefense = Boolean(attackerRoleState.nextRoleAttackIgnoreDefense);
        if (consumedAtkBonus !== 0 || consumedIgnoreDefense) {
            this.updateRoleState(attackerId, (prev) => ({
                ...prev,
                nextRoleAttackAtkBonus: undefined,
                nextRoleAttackIgnoreDefense: undefined,
            }));
        }
        if (!isStruggle) {
            this.state = consumeBra(this.state, attackerId, 1);
        }
        this.setRoleAttackUsed(attackerId, true);
        const attacker = this.getPlayer(attackerId);
        if (attacker?.roleId === 'barrage' && !this.isRoleSuppressed(attackerId)) {
            const roleState = this.readRoleState(attackerId);
            const nextCount = (roleState.barrageAttackCount ?? 0) + 1;
            const previousTargets = roleState.barrageTargets ?? [];
            const firstOnTarget = !previousTargets.includes(targetId);
            const nextTargets = firstOnTarget ? [...previousTargets, targetId] : previousTargets;
            this.state = updatePlayerRuntimeState(this.state, attackerId, (runtime) => {
                const ensured = runtime ?? this.ensureRuntimeExists(attackerId);
                return {
                    ...ensured,
                    turnBoosts: {
                        ...ensured.turnBoosts,
                        atk: (ensured.turnBoosts.atk ?? 0) + 1,
                    },
                };
            });
            this.updateRoleState(attackerId, (prev) => ({
                ...prev,
                barrageAttackCount: nextCount,
                barrageTargets: nextTargets,
            }));
            if (!isStruggle && firstOnTarget) {
                const currentBra = this.state.braTokens[attackerId] ?? 0;
                this.state = setBraTokens(this.state, attackerId, currentBra + 1);
            }
        }

        if (attacker?.roleId === 'giant' && !this.isRoleSuppressed(attackerId)) {
            const recoil = Math.max(0, Math.floor(inflicted / 2));
            if (recoil > 0) {
                this.applyDamageToPlayer(attackerId, attackerId, recoil, 'role', {
                    allowPrompt: false,
                    label: '巨人の反動',
                });
            }
            this.updateRoleState(targetId, (prev) => ({
                ...prev,
                dizzyTurns: (prev.dizzyTurns ?? 0) + 1,
            }));
            this.logEvent({
                type: 'roleAction',
                playerId: attackerId,
                actionId: 'giant_dizzy_on_attack',
                targetId,
                description: 'ロール攻撃: 相手にめまい+1',
                timestamp: Date.now(),
            });
        }

        if (attacker?.roleId === 'vampire' && !this.isRoleSuppressed(attackerId)) {
            const targetRuntime = this.getRuntime(targetId);
            if (targetRuntime && !targetRuntime.isDefeated) {
                const hadBleed = (this.readRoleState(targetId).bleedStacks ?? 0) > 0;
                this.updateRoleState(targetId, (prev) => ({
                    ...prev,
                    bleedStacks: (prev.bleedStacks ?? 0) + 1,
                }));
                const ratio = hadBleed ? 3 / 4 : 1 / 2;
                const healAmount = Math.max(0, Math.floor(inflicted * ratio));
                if (healAmount > 0) {
                    this.applyHealToPlayer(attackerId, healAmount);
                }
                this.logEvent({
                    type: 'roleAction',
                    playerId: attackerId,
                    actionId: 'vampire_on_attack',
                    targetId,
                    description: `吸血: 相手に出血+1 / HP+${healAmount}`,
                    timestamp: Date.now(),
                });
            }
        }

        let selfInflicted: number | undefined;
        if (isStruggle) {
            const attackerRuntime = this.getRuntime(attackerId);
            if (attackerRuntime) {
                const selfDamage = Math.max(1, Math.floor(attackerRuntime.maxHp / 4));
                const applied = this.applyDamageToPlayer(attackerId, attackerId, selfDamage, 'role', {
                    allowPrompt: false,
                    label: '悪あがき（自傷）',
                });
                selfInflicted = applied ?? 0;
            }
        }

        this.logEvent({
            type: 'roleAttack',
            attackerId,
            targetId,
            damage: inflicted,
            isStruggle,
            selfInflicted,
            timestamp: Date.now(),
        });
        this.triggerRoleAbilities('afterRoleAttack', attackerId, {
            targetId,
            damageDealt: inflicted,
        });
        this.applyDefenderAfterRoleAttackInstallEffects(attackerId, targetId);
        this.applyAttackerAfterRoleAttackInstallEffects(attackerId, targetId, inflicted);
        this.handlePostponeAfterAction(attackerId);

        if (isStruggle) {
            const runtimeAfter = this.getRuntime(attackerId);
            if (runtimeAfter && !runtimeAfter.isDefeated) {
                this.endTurn(attackerId);
            }
        }
    }

    private applyDefenderAfterRoleAttackInstallEffects(attackerId: string, targetId: string): void {
        if (attackerId === targetId) {
            return;
        }
        const targetRuntime = this.getRuntime(targetId);
        if (!targetRuntime?.installs?.length) {
            return;
        }
        for (const install of targetRuntime.installs) {
            const card = this.cardMap.get(install.cardId);
            if (!card) continue;
            for (const effect of card.effects) {
                if (effect.trigger !== 'afterRoleAttack') {
                    continue;
                }
                if (effect.type !== 'contactBurnOnRoleAttack') {
                    continue;
                }
                if (!this.isEffectConditionSatisfied(effect.condition, targetId, attackerId)) {
                    continue;
                }
                const burnValue = effect.value ?? 0;
                if (burnValue <= 0) {
                    continue;
                }
                this.updateRoleState(attackerId, (prev) => ({
                    ...prev,
                    burnStacks: (prev.burnStacks ?? 0) + burnValue,
                }));
                this.logEvent({
                    type: 'roleAction',
                    playerId: targetId,
                    actionId: 'equip_contact_burn',
                    targetId: attackerId,
                    description: `${card.name ?? install.cardId}: 接触攻撃した相手に火炎+${burnValue}`,
                    timestamp: Date.now(),
                });
            }
        }
    }

    private applyAttackerAfterRoleAttackInstallEffects(attackerId: string, targetId: string, dealt: number): void {
        if (attackerId === targetId) {
            return;
        }
        const attackerRuntime = this.getRuntime(attackerId);
        if (!attackerRuntime?.installs?.length) {
            return;
        }
        for (const install of attackerRuntime.installs) {
            if (install.cardId === 'blood_sword') {
                const targetRuntime = this.getRuntime(targetId);
                if (targetRuntime && !targetRuntime.isDefeated) {
                    this.updateRoleState(targetId, (prev) => ({
                        ...prev,
                        bleedStacks: (prev.bleedStacks ?? 0) + 2,
                    }));
                    this.logEvent({
                        type: 'roleAction',
                        playerId: attackerId,
                        actionId: 'equip_blood_sword_bleed',
                        targetId,
                        description: '血の剣: 相手に出血+2',
                        timestamp: Date.now(),
                    });
                }
            }
            const card = this.cardMap.get(install.cardId);
            if (!card) continue;
            for (const effect of card.effects) {
                if (effect.trigger !== 'afterRoleAttack') {
                    continue;
                }
                if (effect.type !== 'afterRoleAttackDamage') {
                    continue;
                }
                if (!this.isEffectConditionSatisfied(effect.condition, attackerId, targetId)) {
                    continue;
                }
                const baseValue =
                    typeof effect.valueMultiplierOfDealt === 'number'
                        ? Math.floor(dealt * effect.valueMultiplierOfDealt)
                        : Math.floor(effect.value ?? 0);
                const amount = Math.max(0, baseValue);
                const target = effect.target === 'self' ? attackerId : targetId;
                if (amount > 0) {
                    this.applyDamageToPlayer(attackerId, target, amount, 'card', {
                        cardId: install.cardId,
                        label: `${card.name ?? install.cardId}: 追加ダメージ`,
                    });
                }
                const selfDamage = Math.max(0, Math.floor(effect.selfDamage ?? 0));
                if (selfDamage > 0) {
                    this.applyDamageToPlayer(attackerId, attackerId, selfDamage, 'card', {
                        cardId: install.cardId,
                        label: `${card.name ?? install.cardId}: 反動`,
                    });
                }
            }
        }
    }

    private resolveResonateRoleAttack(
        playerId: string,
        targetId: string,
        isStruggle: boolean,
        resume?: { damage: number; totalDealt: number; hits: number }
    ): void {
        const attackerRuntime = this.ensureRuntimeExists(playerId);
        const defenderRuntime = this.ensureRuntimeExists(targetId);
        const atk = getEffectiveStatValue(attackerRuntime, 'atk');
        const def = getEffectiveStatValue(defenderRuntime, 'def');
        const baseDamage = Math.max(1, atk - def);
        let damage = resume?.damage ?? baseDamage;
        let totalDealt = resume?.totalDealt ?? 0;
        let hits = resume?.hits ?? 0;

        while (damage >= 1) {
            const dealt = this.applyDamageToPlayer(playerId, targetId, damage, 'role', {
                action: {
                    type: 'resonateRoleAttack',
                    attackerId: playerId,
                    targetId,
                    isStruggle,
                    nextDamage: damage,
                    totalDealt,
                    hits,
                },
                label: '反響（連続攻撃）',
            });
            if (dealt === null) {
                return;
            }
            totalDealt += dealt;
            hits += 1;
            this.logEvent({
                type: 'roleAttackHit',
                attackerId: playerId,
                targetId,
                damage: dealt,
                hitIndex: hits,
                totalHits: 0,
                timestamp: Date.now(),
            });
            const decay = this.getResonateDecayRatio(playerId);
            damage = Math.floor((damage * decay.numerator) / decay.denominator);
        }

        this.state = {
            ...this.state,
            logs: this.state.logs.map((entry) =>
                entry.type === 'roleAttackHit' && entry.attackerId === playerId && entry.targetId === targetId && !entry.totalHits
                    ? { ...entry, totalHits: hits }
                    : entry
            ),
            updatedAt: Date.now(),
        };

        if (!isStruggle) {
            this.state = consumeBra(this.state, playerId, 1);
        }
        this.setRoleAttackUsed(playerId, true);

        let selfInflicted: number | undefined;
        if (hits > 0) {
            const applied = this.applyDamageToPlayer(playerId, playerId, hits, 'role', { allowPrompt: false, label: '反響（反動）' });
            selfInflicted = applied ?? 0;
        }
        if (isStruggle) {
            const selfDamage = Math.max(1, Math.floor(attackerRuntime.maxHp / 4));
            const applied = this.applyDamageToPlayer(playerId, playerId, selfDamage, 'role', { allowPrompt: false, label: '悪あがき（自傷）' });
            selfInflicted = (selfInflicted ?? 0) + (applied ?? 0);
        }

        this.logEvent({
            type: 'roleAttack',
            attackerId: playerId,
            targetId,
            damage: totalDealt,
            isStruggle,
            selfInflicted,
            timestamp: Date.now(),
        });

        if (isStruggle) {
            const runtimeAfter = this.getRuntime(playerId);
            if (runtimeAfter && !runtimeAfter.isDefeated) {
                this.endTurn(playerId);
            }
        }
    }

    private finalizePendingAction(action: PendingAction | undefined, dealt: number): void {
        if (!action) {
            return;
        }
        if (action.type === 'roleAttack') {
            this.finishRoleAttack(action.attackerId, action.targetId, dealt, action.isStruggle);
            return;
        }

        const nextHits = action.hits + 1;
        const nextTotalDealt = action.totalDealt + dealt;
        this.logEvent({
            type: 'roleAttackHit',
            attackerId: action.attackerId,
            targetId: action.targetId,
            damage: dealt,
            hitIndex: nextHits,
            totalHits: 0,
            timestamp: Date.now(),
        });
        const decay = this.getResonateDecayRatio(action.attackerId);
        const nextDamage = Math.floor((action.nextDamage * decay.numerator) / decay.denominator);
        this.resolveResonateRoleAttack(action.attackerId, action.targetId, action.isStruggle, {
            damage: nextDamage,
            totalDealt: nextTotalDealt,
            hits: nextHits,
        });
    }

    private getResonateDecayRatio(attackerId: string): { numerator: number; denominator: number } {
        const player = this.getPlayer(attackerId);
        if (player?.roleId !== 'resonate') {
            return { numerator: 2, denominator: 3 };
        }
        const runtime = this.getRuntime(attackerId);
        const hasMegaphone = Boolean(runtime?.installs?.some((install) => install.cardId === 'howling_megaphone'));
        return hasMegaphone ? { numerator: 3, denominator: 4 } : { numerator: 2, denominator: 3 };
    }

    roleAction(playerId: string, actionId: string, options?: RoleActionOptions): void {
        this.assertNoPendingPrompt();
        this.assertPlayerTurn(playerId);
        this.assertPostponeAllowsAction(playerId);
        if (!actionId) {
            throw new Error('アクションIDを指定してください。');
        }
        this.performRoleAction(playerId, actionId, options);
        this.runCpuIfNeeded();
    }

    resolvePendingPrompt(playerId: string, accepted: boolean): void {
        const pending = this.state.pendingPrompt;
        if (!pending) {
            throw new Error('割り込み確認中の処理がありません。');
        }
        if (pending.targetId !== playerId) {
            throw new Error('この割り込みは対象プレイヤーのみが選択できます。');
        }
        this.setPendingPrompt(undefined);

        if (pending.type !== 'beforeDamageTaken') {
            throw new Error('未知の割り込み種別です。');
        }

        const card = this.cardMap.get(pending.cardId);
        const effect = card?.effects?.[pending.effectIndex];
        if (!card || !effect || (effect.type !== 'thresholdPrevent' && effect.type !== 'damageIntercept')) {
            throw new Error('割り込み対象のカード効果が見つかりません。');
        }

        if (accepted && effect.type === 'thresholdPrevent') {
            if (effect.sacrificeSelf) {
                this.destroyInstall(pending.targetId, pending.installInstanceId);
            }
            if (effect.preventAll) {
                const reason = `${card.name ?? pending.cardId}: ${effect.operator}${effect.threshold}ダメージ無効`;
                this.logDamageReduction({
                    playerId: pending.targetId,
                    amount: pending.amount,
                    source: 'install',
                    cardId: pending.cardId,
                    reason,
                });
                this.logDamageResolved({
                    attackerId: pending.attackerId ?? pending.targetId,
                    targetId: pending.targetId,
                    source: pending.source,
                    label: '防御カード（割り込み）',
                    attempted: pending.amount,
                    totalAfterReductions: 0,
                    tempAbsorbed: 0,
                    hpDamage: 0,
                    prevented: true,
                    breakdown: pending.preview?.ifAccepted.breakdown ?? [reason],
                    cardId: pending.cardId,
                });
                if (pending.contactAttack && pending.attackerId && pending.attackerId !== pending.targetId) {
                    this.applyDefenderAfterRoleAttackInstallEffects(pending.attackerId, pending.targetId);
                }
                this.finalizePendingAction(pending.action, 0);
                this.runCpuIfNeeded();
                return;
            }
        }

        const applied = this.applyDamageToPlayer(
            pending.attackerId ?? pending.targetId,
            pending.targetId,
            pending.amount,
            pending.source,
            {
                forcedPromptDecision: {
                    installInstanceId: pending.installInstanceId,
                    effectIndex: pending.effectIndex,
                    decision: accepted ? 'accept' : 'decline',
                },
                action: pending.action,
                contactAttack: pending.contactAttack,
            }
        );
        if (applied === null) {
            return;
        }
        this.finalizePendingAction(pending.action, applied);
        this.runCpuIfNeeded();
    }

    private performRoleAction(playerId: string, actionId: string, options?: RoleActionOptions): void {
        const player = this.getPlayer(playerId);
        if (!player?.roleId) {
            throw new Error('ロールが設定されていません。');
        }
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            throw new Error('脱落したプレイヤーは行動できません。');
        }
        if (this.isRoleSuppressed(playerId)) {
            throw new Error('固有能力が抑制されています。');
        }
        const availableActions = getRoleActions(player.roleId);
        const definition = availableActions.find((action) => action.id === actionId);
        if (!definition) {
            throw new Error('このロールでは使用できないアクションです。');
        }
        const costBra = definition.costBra ?? 0;
        if (costBra > 0) {
            this.assertBraAvailable(playerId, costBra);
        }
        const targetId = options?.targetId;
        if (definition.requiresTarget) {
            if (!targetId) {
                throw new Error('対象を選択してください。');
            }
            if (definition.requiresTarget === 'self' && targetId !== playerId) {
                throw new Error('自分のみ対象にできます。');
            }
            if (definition.requiresTarget === 'others' && targetId === playerId) {
                throw new Error('自分以外を対象にしてください。');
            }
        }
        let actionLabel = definition.label;
        switch (player.roleId) {
            case 'bomb':
                actionLabel = this.executeBombAction(playerId, actionId, targetId) ?? actionLabel;
                break;
            case 'discharge':
                this.executeDischargeAction(playerId, actionId);
                break;
            case 'doctor':
                this.executeDoctorAction(playerId, actionId, targetId, options?.choices);
                break;
            case 'flame':
                this.executeFlameAction(playerId, actionId, targetId);
                break;
            case 'jester':
                actionLabel = this.executeJesterAction(playerId, actionId) ?? actionLabel;
                break;
            case 'suppress':
                this.executeSuppressAction(playerId, actionId, targetId);
                break;
            case 'shed':
                this.executeShedAction(playerId, actionId);
                break;
            case 'seal':
                actionLabel = this.executeSealAction(playerId, actionId, targetId) ?? actionLabel;
                break;
            case 'witch':
                actionLabel = this.executeWitchAction(playerId, actionId, targetId) ?? actionLabel;
                break;
            case 'vampire':
                actionLabel = this.executeVampireAction(playerId, actionId, options?.choices) ?? actionLabel;
                break;
            default:
                throw new Error('このロールは専用アクションを持っていません。');
        }
        if (costBra > 0) {
            this.state = consumeBra(this.state, playerId, costBra);
        }
        this.logEvent({
            type: 'roleAction',
            playerId,
            actionId,
            targetId,
            description: actionLabel,
            timestamp: Date.now(),
        });
        this.handlePostponeAfterAction(playerId);
    }

    private executeBombAction(playerId: string, actionId: string, targetId?: string): string | null {
        if (actionId !== 'bomb_timed_bomb') {
            throw new Error('未対応のアクションです。');
        }
        if (!targetId) {
            throw new Error('対象プレイヤーを指定してください。');
        }
        if (targetId === playerId) {
            throw new Error('自分には設置できません。');
        }
        const targetRuntime = this.getRuntime(targetId);
        if (!targetRuntime || targetRuntime.isDefeated) {
            throw new Error('対象プレイヤーが無効です。');
        }

        this.updateRoleState(targetId, (prev) => ({
            ...prev,
            timedBomb: {
                sourcePlayerId: playerId,
                count: 3,
            },
        }));

        return '時限爆弾を設置（カウント3）';
    }

    private executeVampireAction(
        playerId: string,
        actionId: string,
        choices?: Record<string, string | number | boolean>
    ): string | null {
        if (actionId !== 'vampire_blood_pattern') {
            throw new Error('未知のアクションです。');
        }
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            throw new Error('脱落したプレイヤーは行動できません。');
        }
        const hand = this.state.hands[playerId] ?? [];
        if (hand.length === 0) {
            throw new Error('手札がありません。');
        }
        const rawIndex = (choices as any)?.handIndex;
        const index =
            typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : null;
        if (index === null || index < 0 || index >= hand.length) {
            throw new Error('血の紋様: 付与する手札を選択してください。');
        }
        const cardId = hand[index];
        if (!cardId) {
            throw new Error('血の紋様: 付与する手札が不正です。');
        }

        // HP2消費
        this.reduceHpDirectly(playerId, 2);

        // 血の紋様を付与（同じindexは上書き）
        this.updateRoleState(playerId, (prev) => {
            const existing = prev.bloodPatternHand ?? [];
            const next = [
                ...existing.filter((entry) => entry.index !== index),
                { index, cardId },
            ].sort((a, b) => a.index - b.index);
            return { ...prev, bloodPatternHand: next };
        });
        this.syncHandStatTokens(playerId);

        const cardName = this.cardMap.get(cardId)?.name ?? cardId;
        return `血の紋様: ${cardName}`;
    }

    private executeDischargeAction(playerId: string, actionId: string): void {
        if (actionId !== 'discharge_release') {
            throw new Error('未知のアクションです。');
        }
        const state = this.readRoleState(playerId);
        const charge = state.chargeTokens ?? 0;
        if (charge <= 0) {
            throw new Error('蓄電トークンがありません。');
        }
        const shockAmount = charge * charge;
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            chargeTokens: 0,
        }));
        this.state.players.forEach((target) => {
            if (target.id === playerId) {
                return;
            }
            const runtime = this.getRuntime(target.id);
            if (!runtime || runtime.isDefeated) {
                return;
            }
            this.updateRoleState(target.id, (prev) => ({
                ...prev,
                shockTokens: (prev.shockTokens ?? 0) + shockAmount,
            }));
        });
    }

    private executeDoctorAction(
        playerId: string,
        actionId: string,
        targetId: string | undefined,
        choices?: Record<string, string | number | boolean>
    ): void {
        if (!targetId) {
            throw new Error('対象を選択してください。');
        }
        const resolvedTarget = targetId;
        const runtime = this.getRuntime(resolvedTarget);
        if (!runtime || runtime.isDefeated) {
            throw new Error('対象が無効です。');
        }
        switch (actionId) {
            case 'doctor_heal':
                this.applyHealToPlayer(resolvedTarget, 3);
                break;
            case 'doctor_anesthesia':
                this.updateRoleState(resolvedTarget, (prev) => ({
                    ...prev,
                    pendingBraPenalty: (prev.pendingBraPenalty ?? 0) + 1,
                }));
                break;
            case 'doctor_surgery':
                if (runtime.roleState?.surgeryPhase) {
                    throw new Error('このプレイヤーは既に手術中です。');
                }
                this.updateRoleState(resolvedTarget, (prev) => ({
                    ...prev,
                    surgeryPhase: 'immobilize',
                    scheduledHealAmount: 15,
                }));
                break;
            case 'doctor_reshape': {
                const statDown = String(choices?.statDown ?? '');
                const statUp = String(choices?.statUp ?? '');
                const allowedStats: StatKey[] = ['hp', 'atk', 'def', 'spe'];
                if (!allowedStats.includes(statDown as StatKey) || !allowedStats.includes(statUp as StatKey)) {
                    throw new Error('ステータスの選択が不正です。');
                }
                if (statDown === statUp) {
                    throw new Error('異なるステータスを選択してください。');
                }
                const downKey = statDown as StatKey;
                const upKey = statUp as StatKey;
                this.mutatePlayerBaseStat(resolvedTarget, downKey, (current) =>
                    Math.max(downKey === 'hp' ? 1 : 0, current - 1)
                );
                this.mutatePlayerBaseStat(resolvedTarget, upKey, (current) => current + 1);
                break;
            }
            default:
                throw new Error('未知のアクションです。');
        }
    }

    private resonateRoleAttack(playerId: string, targetId: string, isStruggle: boolean): void {
        this.resolveResonateRoleAttack(playerId, targetId, isStruggle);
    }

    private executeFlameAction(playerId: string, actionId: string, targetId?: string): void {
        if (actionId !== 'flame_apply_burn') {
            throw new Error('未知のアクションです。');
        }
        if (!targetId) {
            throw new Error('対象を選択してください。');
        }
        const targetRuntime = this.getRuntime(targetId);
        if (!targetRuntime || targetRuntime.isDefeated) {
            throw new Error('無効な対象です。');
        }
        this.updateRoleState(targetId, (prev) => ({
            ...prev,
            burnStacks: (prev.burnStacks ?? 0) + 1,
        }));
    }

    private executeJesterAction(playerId: string, actionId: string): string | undefined {
        if (actionId !== 'jester_random') {
            throw new Error('未知のアクションです。');
        }
        const alivePlayers = this.state.players.filter((player) => {
            const runtime = this.getRuntime(player.id);
            return runtime && !runtime.isDefeated;
        });
        const roll = Math.random() * 100;
        let cursor = 0;

        const dealAbilityDamage = (targetId: string, amount: number) => {
            const applied = this.applyDamageToPlayer(playerId, targetId, amount, 'ability', {
                abilityId: 'jester_random',
                label: '道化: ランダム効果',
            });
            if (typeof applied === 'number' && applied > 0) {
                this.logEvent({
                    type: 'abilityDamage',
                    playerId: targetId,
                    sourceAbilityId: 'jester_random',
                    sourcePlayerId: playerId,
                    amount: applied,
                    timestamp: Date.now(),
                });
            }
        };

        const pickRandomPlayerId = () => {
            if (alivePlayers.length === 0) {
                return undefined;
            }
            const index = Math.floor(Math.random() * alivePlayers.length);
            return alivePlayers[index]?.id;
        };

        const applyEffect = (chance: number, handler: () => void): boolean => {
            if (roll < cursor + chance) {
                handler();
                return true;
            }
            cursor += chance;
            return false;
        };

        if (applyEffect(20, () => this.drawCards(playerId, 1))) {
            return '道化: ドロー+1';
        }
        if (
            applyEffect(10, () => {
                this.mutatePlayerBaseStat(playerId, 'hp', (current) => current + 3);
                this.applyHealToPlayer(playerId, 3);
            })
        ) {
            return '道化: 最大HP+3 / HP+3';
        }
        if (applyEffect(10, () => this.addStatTokensToPlayer(playerId, 'atk', 3))) {
            return '道化: Atk+3';
        }
        if (applyEffect(10, () => this.addStatTokensToPlayer(playerId, 'def', 2))) {
            return '道化: Def+2';
        }
        if (applyEffect(10, () => this.addStatTokensToPlayer(playerId, 'spe', 3))) {
            return '道化: Spe+3';
        }
        if (
            applyEffect(10, () => {
                const targetId = pickRandomPlayerId();
                if (targetId) {
                    dealAbilityDamage(targetId, 3);
                }
            })
        ) {
            return '道化: ランダム3ダメージ';
        }
        if (applyEffect(5, () => this.applyHealToPlayer(playerId, 8))) {
            return '道化: HP+8';
        }
        if (
            applyEffect(5, () => {
                alivePlayers.forEach((target) => {
                    if (target.id !== playerId) {
                        dealAbilityDamage(target.id, 10);
                    }
                });
            })
        ) {
            return '道化: 全員に10ダメージ';
        }
        if (
            applyEffect(5, () => {
                this.mutatePlayerBaseStat(playerId, 'hp', (current) => current + 10);
                this.applyHealToPlayer(playerId, 10);
                this.addStatTokensToPlayer(playerId, 'atk', 5);
                this.addStatTokensToPlayer(playerId, 'def', 5);
                this.addStatTokensToPlayer(playerId, 'spe', 5);
            })
        ) {
            return '道化: 大強化(最大HP+10/HP+10/Atk+5/Def+5/Spe+5)';
        }
        if (
            applyEffect(3, () => {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    burnStacks: (prev.burnStacks ?? 0) + 2,
                }));
            })
        ) {
            return '道化: 火炎2';
        }
        if (
            applyEffect(3, () => {
                const currentBra = this.state.braTokens[playerId] ?? 0;
                if (currentBra > 0) {
                    this.state = setBraTokens(this.state, playerId, Math.max(0, currentBra - 1));
                }
            })
        ) {
            return '道化: Bra-1';
        }
        if (
            applyEffect(3, () => {
                this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
                    const ensured = runtime ?? this.ensureRuntimeExists(playerId);
                    return {
                        ...ensured,
                        hp: 1,
                    };
                });
            })
        ) {
            return '道化: HP=1';
        }
        if (
            applyEffect(3, () => {
                const hand = this.state.hands[playerId] ?? [];
                if (hand.length === 0) {
                    return;
                }
                this.state = {
                    ...this.state,
                    hands: {
                        ...this.state.hands,
                        [playerId]: [],
                    },
                    sharedDiscard: [...this.state.sharedDiscard, ...hand],
                    updatedAt: Date.now(),
                };
                this.state = drawFromSharedDeck(this.state, playerId, hand.length);
                this.syncHandStatTokens(playerId);
            })
        ) {
            return '道化: 手札全捨て→同枚数ドロー';
        }
        applyEffect(3, () => {
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                cardEffectBonus: (prev.cardEffectBonus ?? 0) + 2,
            }));
        });
        return '道化: 次のアイテム+2';
    }

    private executeSuppressAction(playerId: string, actionId: string, targetId?: string): void {
        if (actionId !== 'suppress_lock') {
            throw new Error('未知のアクションです。');
        }
        if (!targetId) {
            throw new Error('対象を選択してください。');
        }
        const runtime = this.getRuntime(targetId);
        if (!runtime || runtime.isDefeated) {
            throw new Error('無効な対象です。');
        }
        const currentRound = Number.isFinite(this.state.round) ? this.state.round : 1;
        this.updateRoleState(targetId, (prev) => ({
            ...prev,
            suppressedUntilRound: currentRound + 1,
        }));
    }

    private executeShedAction(playerId: string, actionId: string): void {
        if (actionId !== 'shed_molt') {
            throw new Error('未知のアクションです。');
        }
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            return;
        }
        const currentDef = Math.max(0, getEffectiveStatValue(runtime, 'def'));
        const gain = Math.floor(currentDef / 2);

        // Def を 0 にする（恒久分はトークンで相殺、ターンブースト分はリセット）
        const basePlusTokens = runtime.baseStats.def + runtime.statTokens.def;
        if (basePlusTokens !== 0) {
            this.addStatTokensToPlayer(playerId, 'def', -basePlusTokens);
        }
        if (runtime.turnBoosts.def !== 0) {
            this.state = updatePlayerRuntimeState(this.state, playerId, (next) => {
                if (!next) {
                    throw new Error('プレイヤーの状態が見つかりません。');
                }
                return {
                    ...next,
                    turnBoosts: {
                        ...next.turnBoosts,
                        def: 0,
                    },
                };
            });
        }

        if (gain > 0) {
            this.addStatTokensToPlayer(playerId, 'atk', gain);
            this.addStatTokensToPlayer(playerId, 'spe', gain);
        }
    }

    private executeSealAction(playerId: string, actionId: string, targetId?: string): string | null {
        switch (actionId) {
            case 'seal_chain_atk':
                this.mutatePlayerBaseStat(playerId, 'atk', (current) => current + 2);
                return '攻鎖: 基礎Atk+2';
            case 'seal_chain_def':
                this.mutatePlayerBaseStat(playerId, 'def', (current) => current + 1);
                return '防鎖: 基礎Def+1';
            case 'seal_chain_spe':
                this.mutatePlayerBaseStat(playerId, 'spe', (current) => current + 3);
                return '速鎖: 基礎Spe+3';
            case 'seal_lock': {
                if (!targetId) {
                    throw new Error('対象を選択してください。');
                }
                const hand = this.state.hands[targetId] ?? [];
                if (hand.length === 0) {
                    return `${this.getPlayer(targetId)?.name ?? '対象'}の手札は空です`;
                }
                const state = this.readRoleState(targetId);
                const sealed = state.sealedHand ?? [];
                const sealedIndexSet = new Set(sealed.map((entry) => entry.index));
                const candidates = hand.map((_, idx) => idx).filter((idx) => !sealedIndexSet.has(idx));
                if (candidates.length === 0) {
                    return `${this.getPlayer(targetId)?.name ?? '対象'}の手札はすでに全て封印されています`;
                }
                const idx = candidates[Math.floor(Math.random() * candidates.length)];
                const cardId = hand[idx];
                if (!cardId) {
                    return null;
                }
                this.updateRoleState(targetId, (prev) => ({
                    ...prev,
                    sealedHand: [...(prev.sealedHand ?? []), { index: idx, cardId }],
                }));
                return `封鎖: ${this.getPlayer(targetId)?.name ?? '対象'}の手札を封印`;
            }
            default:
                throw new Error('未知のアクションです。');
        }
    }

    private executeWitchAction(playerId: string, actionId: string, targetId?: string): string | null {
        if (actionId !== 'witch_curse') {
            throw new Error('未知のアクションです。');
        }
        if (!targetId) {
            throw new Error('対象を選択してください。');
        }
        const targetRuntime = this.getRuntime(targetId);
        if (!targetRuntime || targetRuntime.isDefeated) {
            throw new Error('対象プレイヤーは行動できません。');
        }
        const hand = this.state.hands[targetId] ?? [];
        if (hand.length === 0) {
            return `${this.getPlayer(targetId)?.name ?? '対象'}の手札は空です`;
        }
        const idx = Math.floor(Math.random() * hand.length);
        const cardId = hand[idx];
        if (!cardId) {
            return null;
        }
        const curseId = this.cursePool[Math.floor(Math.random() * this.cursePool.length)];
        this.updateRoleState(targetId, (prev) => {
            const next = (prev.cursedHand ?? []).filter((entry) => entry.index !== idx);
            return {
                ...prev,
                cursedHand: [...next, { index: idx, cardId, curseId }],
            };
        });
        this.syncHandStatTokens(targetId);
        const targetName = this.getPlayer(targetId)?.name ?? '対象';
        return `呪い付与: ${targetName}に「${this.getCurseLabel(curseId)}」`;
    }

    private getCurseLabel(curseId: CurseId): string {
        switch (curseId) {
            case 'weakness':
                return '衰弱の呪い';
            case 'force':
                return '強制の呪い';
            case 'decay':
                return '減衰の呪い';
            case 'collapse':
                return '崩壊の呪い';
            case 'cost':
                return '代償の呪い';
            case 'rebuttal':
                return '反駁の呪い';
            case 'enrage':
                return '激昂の呪い';
            case 'resonate':
                return '共振の呪い';
            case 'silence':
                return '沈黙の呪い';
            case 'wear':
                return '摩耗の呪い';
            default:
                return '呪い';
        }
    }

    start(): void {
        if (this.state.players.length === 0) {
            throw new Error('At least one player is required to start the game.');
        }

        const allPlayersReady = this.state.players.every((player) => player.isReady);
        if (!allPlayersReady) {
            throw new Error('All players must be ready.');
        }

        if (!this.state.deckId) {
            throw new Error('Deck must be assigned before starting the match.');
        }

        const missingRoles = this.state.players.filter((player) => !player.roleId);
        if (missingRoles.length > 0) {
            missingRoles.forEach((player) => {
                const fallbackRoleId = player.roleId ?? this.getRandomRoleId();
                if (!fallbackRoleId) {
                    throw new Error('No roles are available to assign.');
                }
                this.setPlayerRole(player.id, fallbackRoleId);
            });
        }

        this.state.players.forEach((player) => this.ensureRuntimeExists(player.id));

        const order = this.state.players
            .slice()
            .sort((a, b) => this.getSpe(b.roleId) - this.getSpe(a.roleId))
            .map((player) => player.id);

        this.state = setTurnOrder(this.state, order);

        order.forEach((playerId) => {
            const runtime = this.getRuntime(playerId);
            const baseBra = runtime ? getEffectiveStatValue(runtime, 'bra') : this.getBra(this.getPlayer(playerId)?.roleId);
            this.state = setBraTokens(this.state, playerId, Math.max(0, baseBra));
            this.state = drawFromSharedDeck(this.state, playerId, 3);
            this.syncHandStatTokens(playerId);
        });

        this.state = setMatchStatus(this.state, 'inProgress');
        this.logEvent({ type: 'roundStart', round: 1, timestamp: Date.now() });
        this.beginTurn(order[0]);
        this.runCpuIfNeeded();
    }

    end(winnerId?: string): void {
        this.state = setMatchStatus(this.state, 'finished', winnerId);
    }

    endTurn(playerId: string): void {
        this.assertNoPendingPrompt();
        this.assertPlayerTurn(playerId);
        this.applyCollapseCurseAtTurnEnd(playerId);
        const cleanedQueue = (this.state.deferredTurns ?? []).filter((entry) => {
            const runtime = this.getRuntime(entry.playerId);
            return runtime && !runtime.isDefeated;
        });
        if (cleanedQueue.length !== (this.state.deferredTurns ?? []).length) {
            this.state = {
                ...this.state,
                deferredTurns: cleanedQueue,
                updatedAt: Date.now(),
            };
        }

        const runtime = this.getRuntime(playerId);
        const postponePhase = runtime?.roleState?.postponePhase;
        const isDeferredTurn = postponePhase === 'deferred';
        const roleId = this.getPlayer(playerId)?.roleId;
        const shouldSplitTurn =
            (postponePhase === 'acted' || postponePhase === 'idle') &&
            !isDeferredTurn &&
            !this.state.deferredTurnActive &&
            (roleId === 'postpone' || (this.state.braTokens[playerId] ?? 0) > 0);

        if (!shouldSplitTurn) {
            this.handleRoleEndTurnEffects(playerId);
        } else {
            const remainingBra = this.state.braTokens[playerId] ?? 0;
            this.enqueueDeferredTurn(playerId, remainingBra, roleId === 'postpone');
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                postponePhase: 'queued',
                postponeBra: remainingBra,
            }));
        }

        if (isDeferredTurn) {
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                postponePhase: 'idle',
                postponeBra: undefined,
            }));
        } else if (postponePhase === 'acted' && (this.state.braTokens[playerId] ?? 0) <= 0) {
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                postponePhase: 'idle',
                postponeBra: undefined,
            }));
        }

        const aliveCount = this.state.players.reduce((count, player) => {
            const state = this.getRuntime(player.id);
            return state && !state.isDefeated ? count + 1 : count;
        }, 0);
        let roundComplete = false;
        if (!isDeferredTurn) {
            const nextTurnsTaken = (this.state.roundTurnsTaken ?? 0) + 1;
            roundComplete = aliveCount > 0 && nextTurnsTaken >= aliveCount;
            this.state = {
                ...this.state,
                roundTurnsTaken: roundComplete ? 0 : nextTurnsTaken,
                updatedAt: Date.now(),
            };
        }

        const queue = this.state.deferredTurns ?? [];
        if (this.state.deferredTurnActive) {
            if (queue.length > 0) {
                const nextDeferred = queue[0];
                this.state = {
                    ...this.state,
                    currentPlayerId: nextDeferred.playerId,
                    updatedAt: Date.now(),
                };
                this.beginTurn(nextDeferred.playerId);
                this.runCpuIfNeeded();
                return;
            }
            this.state = {
                ...this.state,
                deferredTurnActive: false,
                updatedAt: Date.now(),
            };
            const nextRound = (Number.isFinite(this.state.round) ? this.state.round : 1) + 1;
            const { mode, expire } = this.resolveNextRoundMode(nextRound);
            const sorted = this.getSortedAliveTurnOrder(mode);
            const prioritized = this.applyNextRoundPriority(sorted, mode, nextRound);
            const nextOrder = prioritized.order;
            if (nextOrder.length === 0) {
                return;
            }
            this.state = {
                ...this.state,
                round: nextRound,
                turnOrder: nextOrder,
                currentTurn: 0,
                currentPlayerId: nextOrder[0],
                roundTurnsTaken: 0,
                turnOrderMode: expire ? undefined : this.state.turnOrderMode,
                turnOrderModeUntilRound: expire ? undefined : this.state.turnOrderModeUntilRound,
                nextRoundPriority: prioritized.nextRoundPriority,
                updatedAt: Date.now(),
            };
            this.logEvent({ type: 'roundStart', round: nextRound, timestamp: Date.now() });
            this.beginTurn(nextOrder[0]);
            this.runCpuIfNeeded();
            return;
        }

        if (roundComplete && queue.length > 0) {
            const nextDeferred = queue[0];
            this.state = {
                ...this.state,
                deferredTurnActive: true,
                currentPlayerId: nextDeferred.playerId,
                updatedAt: Date.now(),
            };
            this.beginTurn(nextDeferred.playerId);
            this.runCpuIfNeeded();
            return;
        }

        if (roundComplete) {
            const nextRound = (Number.isFinite(this.state.round) ? this.state.round : 1) + 1;
            const { mode, expire } = this.resolveNextRoundMode(nextRound);
            const sorted = this.getSortedAliveTurnOrder(mode);
            const prioritized = this.applyNextRoundPriority(sorted, mode, nextRound);
            const nextOrder = prioritized.order;
            if (nextOrder.length === 0) {
                return;
            }
            this.state = {
                ...this.state,
                round: nextRound,
                turnOrder: nextOrder,
                currentTurn: 0,
                currentPlayerId: nextOrder[0],
                roundTurnsTaken: 0,
                turnOrderMode: expire ? undefined : this.state.turnOrderMode,
                turnOrderModeUntilRound: expire ? undefined : this.state.turnOrderModeUntilRound,
                nextRoundPriority: prioritized.nextRoundPriority,
                updatedAt: Date.now(),
            };
            this.logEvent({ type: 'roundStart', round: nextRound, timestamp: Date.now() });
            this.beginTurn(nextOrder[0]);
            this.runCpuIfNeeded();
            return;
        }

        const order = this.state.turnOrder;
        if (order.length === 0) {
            return;
        }
        const nextIndex = (this.state.currentTurn + 1) % order.length;
        const nextPlayerId = order[nextIndex];
        this.state = {
            ...this.state,
            currentTurn: nextIndex,
            currentPlayerId: nextPlayerId,
            updatedAt: Date.now(),
        };
        this.beginTurn(nextPlayerId);
        this.runCpuIfNeeded();
    }

    private applyCollapseCurseAtTurnEnd(playerId: string): void {
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            return;
        }
        const cursed = runtime.roleState?.cursedHand ?? [];
        if (cursed.length === 0) {
            return;
        }
        const hand = this.state.hands[playerId] ?? [];
        const collapseIndexes = cursed
            .filter((entry) => entry.curseId === 'collapse')
            .filter((entry) => hand[entry.index] === entry.cardId)
            .map((entry) => entry.index)
            .sort((a, b) => b - a);
        if (collapseIndexes.length === 0) {
            return;
        }
        collapseIndexes.forEach((idx) => {
            const cardId = this.discardHandCardToSharedDiscard(playerId, idx);
            const name = this.cardMap.get(cardId)?.name ?? cardId;
            this.logEvent({
                type: 'roleAction',
                playerId,
                actionId: 'curse_collapse_discard',
                description: `崩壊の呪い: 「${name}」が捨て札になった`,
                timestamp: Date.now(),
            });
        });
    }

    private runCpuIfNeeded(): void {
        if (this.state.status !== 'inProgress') {
            return;
        }
        if (this.state.pendingPrompt) {
            return;
        }
        const current = this.state.currentPlayerId;
        if (!current || !this.isCpuPlayer(current)) {
            return;
        }

        if (this.cpuNextAt === 0) {
            this.cpuNextAt = Date.now();
        }
        this.scheduleCpuStep();
    }

    private performCpuTurn(playerId: string): void {
        const level = this.cpuPlayers.get(playerId) ?? 'normal';
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            this.endTurn(playerId);
            return;
        }

        const maxBra = getEffectiveStatValue(runtime, 'bra');
        if (maxBra <= 0) {
            const cost = Math.max(1, Math.floor(runtime.maxHp / 4));
            const canRescue = runtime.hp > cost;
            if (canRescue && (level !== 'easy' || Math.random() < 0.5)) {
                this.rescueBra(playerId);
                return;
            }
        }

        const currentBraTokens = this.state.braTokens[playerId] ?? 0;
        if (currentBraTokens <= 0) {
            this.endTurn(playerId);
            return;
        }

        const hand = this.state.hands[playerId] ?? [];
        const roleState = this.readRoleState(playerId);
        const sealedIndexSet = new Set((roleState.sealedHand ?? []).map((entry) => entry.index));
        const forcedPlayableIndices = (roleState.cursedHand ?? [])
            .filter((entry) => entry.curseId === 'force')
            .filter((entry) => hand[entry.index] === entry.cardId)
            .filter((entry) => !sealedIndexSet.has(entry.index))
            .map((entry) => entry.index);

        const candidates = hand
            .map((cardId, idx) => ({ idx, card: this.cardMap.get(cardId) }))
            .filter((entry): entry is { idx: number; card: CardDefinition } => Boolean(entry.card && entry.card.playable !== false))
            .filter((entry) => !sealedIndexSet.has(entry.idx))
            .filter((entry) => forcedPlayableIndices.length === 0 || forcedPlayableIndices.includes(entry.idx))
            .filter((entry) => {
                const roleId = this.getPlayer(playerId)?.roleId;
                if (roleId !== 'giant') return true;
                return entry.card.category !== 'equip' && entry.card.category !== 'defense';
            });

        const opponents = this.state.players
            .filter((p) => p.id !== playerId)
            .filter((p) => {
                const r = this.getRuntime(p.id);
                return r && !r.isDefeated;
            });

        const pickOpponentLowestHp = (): string | null => {
            if (opponents.length === 0) return null;
            let best = opponents[0];
            let bestHp = this.getRuntime(best.id)?.hp ?? Number.POSITIVE_INFINITY;
            for (const p of opponents) {
                const hp = this.getRuntime(p.id)?.hp ?? Number.POSITIVE_INFINITY;
                if (hp < bestHp) {
                    best = p;
                    bestHp = hp;
                }
            }
            return best.id;
        };

        const chooseTargetsAndChoices = (card: CardDefinition): { targets?: string[]; choices?: PlayCardOptions['choices'] } => {
            const effectTarget = (e: CardEffect): CardTarget | undefined => {
                if (!('target' in e)) return undefined;
                return (e as { target?: CardTarget }).target;
            };

            const needsTarget = card.effects.some((e) => {
                const target = effectTarget(e);
                return target === 'chosen_enemy' || target === 'chosen_player';
            });
            const needsStat = card.effects.some((e) => e.type === 'doubleBaseStat');
            const result: { targets?: string[]; choices?: PlayCardOptions['choices'] } = {};

            if (needsTarget) {
                const hasEnemyTarget = card.effects.some((e) => effectTarget(e) === 'chosen_enemy');
                const hasChosenPlayerTarget = card.effects.some((e) => effectTarget(e) === 'chosen_player');

                const isHarmfulEffect = (effect: CardEffect): boolean => {
                    switch (effect.type) {
                        case 'dealDamage':
                        case 'applyBurn':
                        case 'applyStun':
                        case 'discardAllHand':
                        case 'applyStatDebuffUntilDamage':
                            return true;
                        case 'adjustBra':
                            return (effect.value ?? 0) < 0;
                        case 'addStatToken':
                            return typeof effect.value === 'number' ? effect.value < 0 : false;
                        default:
                            return false;
                    }
                };

                const isHelpfulEffect = (effect: CardEffect): boolean => {
                    switch (effect.type) {
                        case 'heal':
                        case 'drawCards':
                        case 'doubleBaseStat':
                            return true;
                        case 'adjustBra':
                            return (effect.value ?? 0) > 0;
                        case 'addStatToken':
                            return typeof effect.value === 'number' ? effect.value > 0 : false;
                        default:
                            return false;
                    }
                };

                const chosenPlayerIsHarmful = card.effects.some((e) => effectTarget(e) === 'chosen_player' && isHarmfulEffect(e));
                const chosenPlayerIsHelpful = card.effects.some((e) => effectTarget(e) === 'chosen_player' && isHelpfulEffect(e));

                let targetId: string | null = null;
                if (hasEnemyTarget) {
                    targetId = pickOpponentLowestHp();
                } else if (hasChosenPlayerTarget) {
                    targetId = chosenPlayerIsHarmful && !chosenPlayerIsHelpful ? pickOpponentLowestHp() : playerId;
                    if (!targetId) {
                        targetId = playerId;
                    }
                } else {
                    targetId = playerId;
                }
                if (targetId) {
                    result.targets = [targetId];
                }
            }
            if (needsStat) {
                const options: Array<'atk' | 'def' | 'spe'> = ['atk', 'def', 'spe'];
                const stat =
                    level === 'easy'
                        ? options[Math.floor(Math.random() * options.length)]
                        : level === 'hard'
                          ? 'atk'
                          : 'spe';
                result.choices = { ...(result.choices ?? {}), stat };
            }

            return result;
        };

        const scoreCard = (card: CardDefinition): number => {
            const hpRatio = runtime.maxHp > 0 ? runtime.hp / runtime.maxHp : 1;
            let score = 0;
            for (const effect of card.effects) {
                if (effect.type === 'dealDamage') {
                    const base = typeof effect.value === 'number' ? effect.value : effect.formula ? 3 : 0;
                    score += base * 2;
                } else if (effect.type === 'applyBurn') {
                    score += Math.max(1, effect.value);
                } else if (effect.type === 'applyStun') {
                    score += 4;
                } else if (effect.type === 'heal') {
                    const amount = typeof effect.value === 'number' ? effect.value : 0;
                    score += hpRatio < 0.5 ? amount * 2 : amount * 0.5;
                } else if (effect.type === 'adjustBra') {
                    score += (effect.value ?? 0) > 0 ? 4 : 1;
                } else if (effect.type === 'addStatToken') {
                    const v =
                        typeof effect.value === 'number'
                            ? effect.value
                            : effect.valueFormula
                              ? 2
                              : 1;
                    score += 2 + Math.abs(v);
                } else if (effect.type === 'doubleBaseStat') {
                    score += 5;
                }
            }
            if (card.kind === 'install') {
                score += 1.5;
            }
            return score;
        };

        const tryPlay = (entry: { idx: number; card: CardDefinition }): boolean => {
            const options = chooseTargetsAndChoices(entry.card);
            try {
                this.playCard(playerId, entry.card.id, { ...options, handIndex: entry.idx });
                return true;
            } catch {
                return false;
            }
        };

        if (candidates.length > 0) {
            if (level === 'easy') {
                const shuffled = candidates.slice().sort(() => Math.random() - 0.5);
                for (const entry of shuffled) {
                    if (tryPlay(entry)) return;
                }
            } else {
                const ranked = candidates.slice().sort((a, b) => scoreCard(b.card) - scoreCard(a.card));
                for (const entry of ranked) {
                    if (tryPlay(entry)) return;
                }
            }
        }

        // 何もできなければロール攻撃、それも無理ならターン終了
        const target = pickOpponentLowestHp();
        if (target) {
            try {
                this.roleAttack(playerId, target, { struggle: false });
                return;
            } catch {
                // ignore
            }
        }
        this.endTurn(playerId);
    }

    applyScore(playerId: string, delta: number): void {
        this.state = updatePlayerScore(this.state, playerId, delta);
    }

    isActive(): boolean {
        return this.state.status === 'inProgress';
    }

    getCurrentPlayer(): Player | undefined {
        const id = this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        return this.state.players.find((player) => player.id === id);
    }

    getState(): GameState {
        return this.state;
    }

    getSummary(): MatchSummary {
        return {
            id: this.state.id,
            status: this.state.status,
            playerCount: this.state.players.length,
            createdAt: this.state.createdAt,
            updatedAt: this.state.updatedAt,
        };
    }

    private getPlayer(id: string): Player | undefined {
        return this.state.players.find((player) => player.id === id);
    }

    private initializeRuntimeForPlayer(playerId: string): void {
        const player = this.getPlayer(playerId);
        if (!player || !player.roleId) {
            return;
        }
        const role = this.roleMap.get(player.roleId);
        if (!role) {
            return;
        }
        this.state = setPlayerRuntimeState(this.state, playerId, createRuntimeStateFromRole(playerId, role));
    }

    private ensureRuntimeExists(playerId: string): PlayerRuntimeState {
        let runtime = this.state.board.playerStates[playerId];
        if (!runtime) {
            this.initializeRuntimeForPlayer(playerId);
            runtime = this.state.board.playerStates[playerId];
        }
        if (!runtime) {
            throw new Error(`Runtime state for player ${playerId} is unavailable.`);
        }
        return runtime;
    }

    private getRuntime(playerId: string): PlayerRuntimeState | undefined {
        return this.state.board.playerStates[playerId];
    }

    private logEvent(entry: GameLogEntry): void {
        const safeRound = Number.isFinite(entry.round)
            ? entry.round
            : Number.isFinite(this.state.round)
              ? this.state.round
              : undefined;
        const next = { ...entry, timestamp: entry.timestamp ?? Date.now(), round: safeRound };
        const logs = [...this.state.logs, next];
        const maxEntries = 100;
        const trimmed = logs.length > maxEntries ? logs.slice(logs.length - maxEntries) : logs;
        this.state = {
            ...this.state,
            logs: trimmed,
            updatedAt: Date.now(),
        };
    }

    private logDamageReduction(details: {
        playerId: string;
        amount: number;
        source: 'install' | 'ability';
        cardId?: string;
        abilityId?: string;
        reason?: string;
    }): void {
        if (details.amount <= 0) {
            return;
        }
        this.logEvent({
            type: 'damageReduced',
            playerId: details.playerId,
            amount: details.amount,
            source: details.source,
            cardId: details.cardId,
            abilityId: details.abilityId,
            reason: details.reason,
            timestamp: Date.now(),
        });
    }

    private setRoleAttackUsed(playerId: string, used: boolean): void {
        this.state = {
            ...this.state,
            roleAttackUsed: {
                ...this.state.roleAttackUsed,
                [playerId]: used,
            },
            updatedAt: Date.now(),
        };
    }

    private handlePlayerDefeated(playerId: string, killerId?: string): void {
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            return;
        }
        this.state = setPlayerRuntimeState(this.state, playerId, {
            ...runtime,
            hp: 0,
            tempHp: 0,
            isDefeated: true,
        });
        this.logEvent({ type: 'playerDefeated', playerId, timestamp: Date.now() });
        if (killerId && killerId !== playerId) {
            this.triggerRoleAbilities('onKill', killerId, { targetId: playerId });
        }
        if (killerId) {
            const selfInflicted = killerId === playerId;
            this.lastDefeatContext = { attackerId: killerId, targetId: playerId, selfInflicted };
            if (!selfInflicted) {
                this.lastNonSelfDefeatTargetId = playerId;
            }
        }

        const order = this.state.turnOrder;
        const idx = order.indexOf(playerId);
        if (idx !== -1) {
            const newOrder = order.filter((id) => id !== playerId);
            let newCurrentTurn = this.state.currentTurn;
            let newCurrentPlayerId = this.state.currentPlayerId;
            if (idx < newCurrentTurn) {
                newCurrentTurn = Math.max(0, newCurrentTurn - 1);
            } else if (idx === newCurrentTurn) {
                newCurrentPlayerId = undefined;
            }
            this.state = {
                ...this.state,
                turnOrder: newOrder,
                currentTurn: newOrder.length === 0 ? 0 : newCurrentTurn % (newOrder.length || 1),
                currentPlayerId: newCurrentPlayerId,
            };
            if (!newCurrentPlayerId && newOrder.length > 0) {
                const nextId = newOrder[this.state.currentTurn % newOrder.length];
                this.state = {
                    ...this.state,
                    currentPlayerId: nextId,
                };
                this.beginTurn(nextId);
            }
        }

        this.notifyAlivePlayersChanged();
        this.checkForWinner();
    }

    private checkForWinner(): void {
        const alive = this.state.players.filter((player) => {
            const runtime = this.state.board.playerStates[player.id];
            return runtime && !runtime.isDefeated;
        });
        if (alive.length === 1) {
            this.end(alive[0].id);
            return;
        }
        if (alive.length === 0) {
            const context = this.lastDefeatContext;
            if (context) {
                if (!context.selfInflicted) {
                    this.end(context.targetId);
                    return;
                }
                if (this.lastNonSelfDefeatTargetId) {
                    this.end(this.lastNonSelfDefeatTargetId);
                    return;
                }
            }
            this.end();
        }
    }

    private resolveCardEffects(playerId: string, card: CardDefinition, trigger: CardEffect['trigger'], options?: PlayCardOptions): void {
        card.effects?.forEach((effect, index) => {
            if (effect.trigger !== trigger) {
                return;
            }
            if (!this.shouldApplyOptionalEffect(effect, index, options)) {
                return;
            }
            this.applyCardEffect(playerId, card, effect, options);
        });
    }

    private applyCardEffect(playerId: string, card: CardDefinition, effect: CardEffect, options?: PlayCardOptions): void {
        switch (effect.type) {
            case 'dealDamage':
                this.applyDealDamageEffect(playerId, card, effect, options);
                break;
            case 'drawCards':
                this.applyDrawCardsEffect(playerId, card, effect, options);
                break;
            case 'adjustBra':
                this.applyAdjustBraEffect(playerId, card, effect, options);
                break;
            case 'addStatToken':
                this.applyAddStatTokenEffect(playerId, card, effect, options);
                break;
            case 'applyStatDebuffUntilDamage':
                this.applyStatDebuffUntilDamageEffect(playerId, effect, options);
                break;
            case 'applyBurn':
                this.applyBurnEffect(playerId, card, effect, options);
                break;
            case 'applyBleed':
                this.applyBleedEffect(playerId, card, effect, options);
                break;
            case 'applyShock':
                this.applyShockEffect(playerId, card, effect, options);
                break;
            case 'applyStun':
                this.applyStunEffect(playerId, card, effect, options);
                break;
            case 'applyDizzy':
                this.applyDizzyEffect(playerId, card, effect, options);
                break;
            case 'tauntUntilNextTurnStart':
                this.applyTauntUntilNextTurnStartEffect(playerId, effect);
                break;
            case 'sealHand':
                this.applySealHandEffect(playerId, card, effect, options);
                break;
            case 'dealDamagePerSealedHand':
                this.applyDealDamagePerSealedHandEffect(playerId, card, effect);
                break;
            case 'chooseOne':
                this.applyChooseOneEffect(playerId, card, effect, options);
                break;
            case 'heal':
                this.applyHealEffect(playerId, card, effect, options);
                break;
            case 'modifyMaxHpInstall':
                this.applyModifyMaxHpInstallEffect(playerId, card, effect);
                break;
            case 'modifyTurnOrder':
                this.applyModifyTurnOrderEffect(effect);
                break;
            case 'discardAllHand':
                this.applyDiscardAllHandEffect(playerId, card, effect, options);
                break;
            case 'discardThenDraw':
                this.applyDiscardThenDrawEffect(playerId, card, effect, options);
                break;
            case 'coinFlipDealDamage':
                this.applyCoinFlipDealDamageEffect(playerId, card, effect, options);
                break;
            case 'coinFlipDealDamageEither':
                this.applyCoinFlipDealDamageEitherEffect(playerId, card, effect, options);
                break;
            case 'setNextRoundPriority':
                this.applySetNextRoundPriorityEffect(playerId, effect);
                break;
            case 'adrenaline':
                this.applyAdrenalineEffect(playerId, effect);
                break;
            case 'doubleBaseStat':
                this.applyDoubleBaseStatEffect(playerId, card, effect, options);
                break;
            case 'brokenWindowTheory':
                this.applyBrokenWindowTheoryEffect(playerId, card, effect);
                break;
            case 'feint':
                this.applyFeintEffect(playerId, effect);
                break;
            case 'setNextRoleAttackAtkBonus':
                this.applySetNextRoleAttackAtkBonusEffect(playerId, effect);
                break;
            case 'poltergeist':
                this.applyPoltergeistEffect(playerId, card, effect, options);
                break;
            case 'libraryBurst':
                this.applyLibraryBurstEffect(playerId, card, effect);
                break;
            case 'selfInstall':
                this.applySelfInstallEffect(playerId, card);
                break;
            default:
                break;
        }
    }

    private applySetNextRoleAttackAtkBonusEffect(playerId: string, effect: SetNextRoleAttackAtkBonusEffect): void {
        const value = Math.floor(effect.value ?? 0);
        if (!Number.isFinite(value) || value === 0) {
            return;
        }
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            nextRoleAttackAtkBonus: (prev.nextRoleAttackAtkBonus ?? 0) + value,
        }));
    }

    private applyDealDamageEffect(playerId: string, card: CardDefinition, effect: DealDamageEffect, options?: PlayCardOptions): void {
        const actorRuntime = this.getRuntime(playerId);
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const baseValue =
            typeof effect.value === 'number'
                ? effect.value
                : effect.formula
                ? evaluateDamageFormula(effect.formula, actorRuntime)
                : 0;
        const adjustedBase = baseValue * multiplier + bonus;
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const targetRuntime = this.getRuntime(targetId);
            if (!targetRuntime) {
                return;
            }
            let damage = adjustedBase;
            if (effect.defApplied && !effect.ignoreDef) {
                damage -= getEffectiveStatValue(targetRuntime, 'def');
            }
            // カードによる攻撃は防御で軽減されても最低1ダメージ通す
            if (damage <= 0 && adjustedBase <= 0) {
                return;
            }
            const kindLabel =
                effect.defApplied && !effect.ignoreDef ? '通常ダメージ' : effect.fixed || effect.ignoreDef ? '固定ダメージ' : 'ダメージ';
            const contactPrefix = effect.contact ? '接触' : '';
            const label = `${contactPrefix}${kindLabel}: ${card.name ?? card.id}`;
            this.applyDamageToPlayer(playerId, targetId, Math.max(1, damage), 'card', {
                cardId: card.id,
                label,
                contactAttack: Boolean(effect.contact),
            });
        });
    }

    private applyBrokenWindowTheoryEffect(playerId: string, card: CardDefinition, _effect: BrokenWindowTheoryEffect): void {
        const alive = this.state.players
            .map((player) => ({ player, runtime: this.getRuntime(player.id) }))
            .filter((entry) => entry.runtime && !entry.runtime.isDefeated) as Array<{ player: Player; runtime: PlayerRuntimeState }>;
        if (alive.length === 0) {
            return;
        }
        const totalDeficit = alive.reduce((sum, entry) => sum + Math.max(0, entry.runtime.maxHp - entry.runtime.hp), 0);
        const base = Math.floor(totalDeficit / alive.length);
        if (base <= 0) {
            return;
        }
        const label = `通常ダメージ: ${card.name ?? card.id}`;
        alive.forEach(({ runtime }) => {
            const def = getEffectiveStatValue(runtime, 'def');
            const damage = Math.max(1, base - def);
            this.applyDamageToPlayer(playerId, runtime.playerId, damage, 'card', { cardId: card.id, label });
        });
    }

    private applyFeintEffect(playerId: string, _effect: FeintEffect): void {
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            nextRoleAttackIgnoreDefense: true,
        }));
        this.logEvent({
            type: 'roleAction',
            playerId,
            actionId: 'feint_ready',
            description: 'フェイント: 次のロール攻撃は防御カードを無視する',
            timestamp: Date.now(),
        });
    }

    private applyPoltergeistEffect(playerId: string, card: CardDefinition, effect: PoltergeistEffect, options?: PlayCardOptions): void {
        const targetId = options?.targets?.[0];
        if (!targetId) {
            throw new Error('対象プレイヤーを選択してください。');
        }
        const runtime = this.getRuntime(playerId);
        if (!runtime) {
            return;
        }
        const removed =
            Math.max(0, runtime.statTokens.atk) +
            Math.max(0, runtime.statTokens.def) +
            Math.max(0, runtime.statTokens.spe) +
            Math.max(0, runtime.statTokens.bra) +
            Math.max(0, runtime.turnBoosts.atk) +
            Math.max(0, runtime.turnBoosts.def) +
            Math.max(0, runtime.turnBoosts.spe) +
            Math.max(0, runtime.turnBoosts.bra);

        this.state = updatePlayerRuntimeState(this.state, playerId, (existing) => {
            const ensured = existing ?? this.ensureRuntimeExists(playerId);
            return {
                ...ensured,
                turnBoosts: { atk: 0, def: 0, spe: 0, bra: 0 },
            };
        });
        (['atk', 'def', 'spe', 'bra'] as const).forEach((stat) => {
            const current = runtime.statTokens[stat] ?? 0;
            if (current !== 0) {
                this.addStatTokensToPlayer(playerId, stat, -current);
            }
        });

        const raw = removed * (effect.multiplier ?? 0);
        const baseDamage = (effect.round ?? 'floor') === 'ceil' ? Math.ceil(raw) : (effect.round ?? 'floor') === 'round' ? Math.round(raw) : Math.floor(raw);
        if (baseDamage <= 0) {
            return;
        }
        const targetRuntime = this.getRuntime(targetId);
        if (!targetRuntime || targetRuntime.isDefeated) {
            return;
        }
        const def = getEffectiveStatValue(targetRuntime, 'def');
        const damage = Math.max(1, baseDamage - def);
        const label = `通常ダメージ: ${card.name ?? card.id}`;
        this.applyDamageToPlayer(playerId, targetId, damage, 'card', { cardId: card.id, label });
    }

    private applyLibraryBurstEffect(playerId: string, card: CardDefinition, effect: LibraryBurstEffect): void {
        const hand = this.state.hands[playerId] ?? [];
        const discardedCount = hand.length;
        if (discardedCount > 0) {
            this.state = {
                ...this.state,
                hands: {
                    ...this.state.hands,
                    [playerId]: [],
                },
                sharedDiscard: [...this.state.sharedDiscard, ...hand],
                updatedAt: Date.now(),
            };
            this.clearSealedHand(playerId);
            this.clearCursedHand(playerId);
            this.clearBloodPatternHand(playerId);
            this.syncHandStatTokens(playerId);
        }

        const raw = discardedCount * (effect.multiplier ?? 0);
        const baseDamage = (effect.round ?? 'floor') === 'ceil' ? Math.ceil(raw) : (effect.round ?? 'floor') === 'round' ? Math.round(raw) : Math.floor(raw);
        if (baseDamage <= 0) {
            return;
        }
        const label = `通常ダメージ: ${card.name ?? card.id}`;
        this.state.players.forEach((p) => {
            if (p.id === playerId) return;
            const targetRuntime = this.getRuntime(p.id);
            if (!targetRuntime || targetRuntime.isDefeated) return;
            const def = getEffectiveStatValue(targetRuntime, 'def');
            const damage = Math.max(1, baseDamage - def);
            this.applyDamageToPlayer(playerId, p.id, damage, 'card', { cardId: card.id, label });
        });
    }

    private applySelfInstallEffect(playerId: string, card: CardDefinition): void {
        this.reclaimCardFromDiscard(card.id);
        this.installCard(playerId, card);
    }

    private applyDrawCardsEffect(playerId: string, card: CardDefinition, effect: DrawCardsEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const count = Math.max(0, Math.floor(effect.count * multiplier + bonus));
        if (count <= 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            const before = (this.state.hands[targetId] ?? []).length;
            this.state = drawFromSharedDeck(this.state, targetId, count);
            const after = (this.state.hands[targetId] ?? []).length;
            const drawn = Math.max(0, after - before);
            this.syncHandStatTokens(targetId);
            if (drawn > 0) {
                this.logEvent({
                    type: 'cardEffect',
                    playerId,
                    cardId: card.id,
                    kind: 'draw',
                    targetId,
                    count: drawn,
                    timestamp: Date.now(),
                });
            }
        });
    }

    private applyAdjustBraEffect(playerId: string, card: CardDefinition, effect: AdjustBraEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = effect.value * multiplier + bonus;
        if (adjusted === 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            const current = this.state.braTokens[targetId] ?? 0;
            const next = Math.max(0, current + adjusted);
            const deltaApplied = next - current;
            this.state = setBraTokens(this.state, targetId, next);
            if (deltaApplied !== 0) {
                this.logEvent({
                    type: 'cardEffect',
                    playerId,
                    cardId: card.id,
                    kind: 'adjustBra',
                    targetId,
                    amount: deltaApplied,
                    timestamp: Date.now(),
                });
            }
        });
    }

    private applyStatDebuffUntilDamageEffect(
        playerId: string,
        effect: ApplyStatDebuffUntilDamageEffect,
        options?: PlayCardOptions
    ): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = effect.value * multiplier + bonus;
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const existing = this.readRoleState(targetId).pendingStatDebuff;
            if (existing) {
                this.addStatTokensToPlayer(targetId, existing.stat, -existing.value);
            }
            this.addStatTokensToPlayer(targetId, effect.stat, adjusted);
            this.updateRoleState(targetId, (prev) => ({
                ...prev,
                pendingStatDebuff: { stat: effect.stat, value: adjusted },
            }));
        });
    }

    private applyBurnEffect(playerId: string, card: CardDefinition, effect: ApplyBurnEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = effect.value * multiplier + bonus;
        if (adjusted === 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            this.updateRoleState(targetId, (prev) => {
                const next = (prev.burnStacks ?? 0) + adjusted;
                return next > 0 ? { ...prev, burnStacks: next } : { ...prev, burnStacks: undefined };
            });
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'applyStatus',
                targetId,
                status: 'burn',
                amount: adjusted,
                timestamp: Date.now(),
            });
        });
    }

    private applyBleedEffect(playerId: string, card: CardDefinition, effect: ApplyBleedEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = effect.value * multiplier + bonus;
        if (adjusted === 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            this.updateRoleState(targetId, (prev) => {
                const next = (prev.bleedStacks ?? 0) + adjusted;
                return next > 0 ? { ...prev, bleedStacks: next } : { ...prev, bleedStacks: undefined };
            });
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'applyStatus',
                targetId,
                status: 'bleed',
                amount: adjusted,
                timestamp: Date.now(),
            });
        });
    }

    private applyShockEffect(playerId: string, card: CardDefinition, effect: ApplyShockEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = Math.floor(effect.value * multiplier + bonus);
        if (adjusted === 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            this.updateRoleState(targetId, (prev) => {
                const next = (prev.shockTokens ?? 0) + adjusted;
                return next > 0 ? { ...prev, shockTokens: next } : { ...prev, shockTokens: undefined };
            });
            this.reconcileLightningRodAtkBonus(targetId);
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'applyStatus',
                targetId,
                status: 'shock',
                amount: adjusted,
                timestamp: Date.now(),
            });
        });
    }

    private applyDizzyEffect(playerId: string, card: CardDefinition, effect: ApplyDizzyEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = Math.floor(effect.value * multiplier + bonus);
        if (adjusted <= 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            this.updateRoleState(targetId, (prev) => ({
                ...prev,
                dizzyTurns: (prev.dizzyTurns ?? 0) + adjusted,
            }));
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'applyStatus',
                targetId,
                status: 'dizzy',
                amount: adjusted,
                timestamp: Date.now(),
            });
        });
    }

    private applyTauntUntilNextTurnStartEffect(playerId: string, effect: TauntUntilNextTurnStartEffect): void {
        const bonus = Math.max(0, Math.floor(effect.defBonus ?? 0));
        const current = this.readRoleState(playerId);
        const alreadyApplied = current.tauntDefBonusApplied ?? 0;
        if (alreadyApplied !== 0) {
            this.addStatTokensToPlayer(playerId, 'def', -alreadyApplied);
        }
        if (bonus > 0) {
            this.addStatTokensToPlayer(playerId, 'def', bonus);
        }
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            tauntUntilNextTurnStart: true,
            tauntDefBonusApplied: bonus,
        }));
    }

    private applySealHandEffect(playerId: string, card: CardDefinition, effect: SealHandEffect, options?: PlayCardOptions): void {
        if (effect.mode !== 'all') {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            const runtime = this.getRuntime(targetId);
            if (!runtime || runtime.isDefeated) {
                return;
            }
            const hand = this.state.hands[targetId] ?? [];
            this.updateRoleState(targetId, (prev) => ({
                ...prev,
                sealedHand: hand.map((cardId, index) => ({ index, cardId })),
            }));
            if (hand.length > 0) {
                this.logEvent({
                    type: 'cardEffect',
                    playerId,
                    cardId: card.id,
                    kind: 'sealHand',
                    targetId,
                    count: hand.length,
                    timestamp: Date.now(),
                });
            }
        });
    }

    private applyDealDamagePerSealedHandEffect(
        playerId: string,
        card: CardDefinition,
        effect: DealDamagePerSealedHandEffect
    ): void {
        const sealedCount = this.readRoleState(playerId).sealedHand?.length ?? 0;
        const raw = sealedCount * (effect.multiplier ?? 0);
        const roundMode = effect.round ?? 'floor';
        const rounded =
            roundMode === 'ceil' ? Math.ceil(raw) : roundMode === 'round' ? Math.round(raw) : Math.floor(raw);
        const amount = Math.max(0, rounded);
        if (amount <= 0) {
            return;
        }
        this.state.players.forEach((p) => {
            if (p.id === playerId) {
                return;
            }
            const runtime = this.getRuntime(p.id);
            if (!runtime || runtime.isDefeated) {
                return;
            }
            this.applyDamageToPlayer(playerId, p.id, amount, 'card', {
                cardId: card.id,
                label: `${card.name ?? card.id}: 封印ダメージ`,
            });
        });
    }

    private applyChooseOneEffect(
        playerId: string,
        card: CardDefinition,
        effect: Extract<CardEffect, { type: 'chooseOne' }>,
        options?: PlayCardOptions
    ): void {
        const player = this.getPlayer(playerId);
        if (player?.roleId === 'strong_greed') {
            const raw = options?.choices?.[effect.key];
            const rawSelections =
                raw && typeof raw === 'object'
                    ? ((raw as { selections?: Record<string, unknown> }).selections ?? (raw as Record<string, unknown>))
                    : null;

            const baseChoices = { ...(options?.choices ?? {}) };
            delete baseChoices[effect.key];

            effect.options.forEach((option) => {
                const selection = rawSelections && typeof rawSelections === 'object' ? (rawSelections as any)[option.value] : null;
                const selectionTargets = Array.isArray(selection?.targets)
                    ? selection.targets.filter((t: unknown): t is string => typeof t === 'string')
                    : undefined;
                const selectionChoices = selection?.choices && typeof selection.choices === 'object' ? selection.choices : undefined;

                const childOptions: PlayCardOptions = {
                    targets: selectionTargets ?? options?.targets,
                    choices: selectionChoices ? { ...baseChoices, ...(selectionChoices as any) } : baseChoices,
                };
                option.effects?.forEach((child) => {
                    if (child.trigger !== effect.trigger) {
                        return;
                    }
                    this.applyCardEffect(playerId, card, child, childOptions);
                });
            });
            return;
        }
        const raw = options?.choices?.[effect.key];
        const chosenValue = typeof raw === 'string' ? raw : undefined;
        const defaultValue = effect.defaultValue ?? effect.options?.[0]?.value;
        const selected =
            effect.options.find((opt) => opt.value === chosenValue) ??
            effect.options.find((opt) => opt.value === defaultValue) ??
            effect.options[0];
        if (!selected?.effects?.length) {
            return;
        }
        selected.effects.forEach((child) => {
            if (child.trigger !== effect.trigger) {
                return;
            }
            this.applyCardEffect(playerId, card, child, options);
        });
    }

    private applyStunEffect(playerId: string, card: CardDefinition, effect: ApplyStunEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const duration = Math.max(0, Math.floor(effect.durationRounds * multiplier + bonus));
        if (duration <= 0) {
            return;
        }
        const baseRound = Number.isFinite(this.state.round) ? this.state.round : 1;
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const runtime = this.getRuntime(targetId);
            if (!runtime || runtime.isDefeated) {
                return;
            }
            const existingPenalty = runtime.roleState?.stunSpePenalty ?? 0;
            if (existingPenalty !== 0) {
                this.addStatTokensToPlayer(targetId, 'spe', -existingPenalty);
            }
            const currentSpe = getEffectiveStatValue(runtime, 'spe');
            const penalty = currentSpe === 0 ? 0 : -currentSpe;
            if (penalty !== 0) {
                this.addStatTokensToPlayer(targetId, 'spe', penalty);
            }
            this.updateRoleState(targetId, (prev) => ({
                ...prev,
                stunUntilRound: baseRound + duration,
                stunOriginalSpe: runtime.baseStats.spe,
                stunSpePenalty: penalty,
            }));
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'applyStatus',
                targetId,
                status: 'stun',
                amount: duration,
                timestamp: Date.now(),
            });
        });
    }

    private applyHealEffect(playerId: string, card: CardDefinition, effect: HealEffect, options?: PlayCardOptions): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = effect.value * multiplier + bonus;
        if (adjusted <= 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const healed = this.applyHealToPlayer(targetId, adjusted);
            if (healed > 0) {
                this.logEvent({
                    type: 'cardEffect',
                    playerId,
                    cardId: card.id,
                    kind: 'heal',
                    targetId,
                    amount: healed,
                    timestamp: Date.now(),
                });
            }
        });
    }

    private applyModifyMaxHpInstallEffect(playerId: string, card: CardDefinition, effect: ModifyMaxHpInstallEffect): void {
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const adjusted = effect.value * multiplier + bonus;
        if (card.kind !== 'install' || adjusted === 0) {
            return;
        }
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            const nextMax = Math.max(1, ensured.maxHp + adjusted);
            const nextHp = Math.min(nextMax, ensured.hp);
            return {
                ...ensured,
                maxHp: nextMax,
                hp: nextHp,
            };
        });
    }

    private applyModifyTurnOrderEffect(effect: ModifyTurnOrderEffect): void {
        if (effect.duration === 'instant') {
            this.reorderTurnOrder(effect.mode);
            return;
        }

        this.state = {
            ...this.state,
            turnOrderMode: effect.mode,
            turnOrderModeUntilRound: this.state.round + 1,
            updatedAt: Date.now(),
        };
        this.reorderTurnOrder(effect.mode);
    }

    private getSortedAliveTurnOrder(mode: ModifyTurnOrderEffect['mode']): string[] {
        return this.state.players
            .filter((player) => {
                const runtime = this.state.board.playerStates[player.id];
                return runtime && !runtime.isDefeated;
            })
            .slice()
            .sort((a, b) => {
                const speA = getEffectiveStatValue(this.getRuntime(a.id), 'spe');
                const speB = getEffectiveStatValue(this.getRuntime(b.id), 'spe');
                return mode === 'ascendingSpe' ? speA - speB : speB - speA;
            })
            .map((player) => player.id);
    }

    private applyNextRoundPriority(
        order: string[],
        mode: ModifyTurnOrderEffect['mode'],
        nextRound: number
    ): { order: string[]; nextRoundPriority?: GameState['nextRoundPriority'] } {
        const priority = this.state.nextRoundPriority;
        if (!priority) {
            return { order, nextRoundPriority: undefined };
        }
        if (priority.applyOnRound < nextRound) {
            return { order, nextRoundPriority: undefined };
        }
        if (priority.applyOnRound > nextRound) {
            return { order, nextRoundPriority: priority };
        }
        const idx = order.indexOf(priority.playerId);
        if (idx === -1) {
            return { order, nextRoundPriority: undefined };
        }
        const next = order.slice();
        next.splice(idx, 1);
        if (mode === 'ascendingSpe') {
            next.push(priority.playerId);
        } else {
            next.unshift(priority.playerId);
        }
        return { order: next, nextRoundPriority: undefined };
    }

    private resolveNextRoundMode(nextRound: number): { mode: ModifyTurnOrderEffect['mode']; expire: boolean } {
        const currentRound = Number.isFinite(this.state.round) ? this.state.round : 1;
        const expiresAt = this.state.turnOrderModeUntilRound ?? currentRound;
        const hasMode = Boolean(this.state.turnOrderMode);
        const expire = hasMode && nextRound > expiresAt;
        const mode = expire ? 'descendingSpe' : this.state.turnOrderMode ?? 'descendingSpe';
        return { mode, expire };
    }

    private reorderTurnOrder(mode: ModifyTurnOrderEffect['mode'], preferredCurrentId?: string): void {
        const currentId = preferredCurrentId ?? this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        const sorted = this.getSortedAliveTurnOrder(mode);
        if (sorted.length === 0) {
            return;
        }
        const nextCurrentId = currentId && sorted.includes(currentId) ? currentId : sorted[0];
        const nextIndex = Math.max(0, sorted.indexOf(nextCurrentId));
        this.state = {
            ...this.state,
            turnOrder: sorted,
            currentTurn: nextIndex,
            currentPlayerId: nextCurrentId,
            updatedAt: Date.now(),
        };
    }

    private applyAddStatTokenEffect(playerId: string, card: CardDefinition, effect: AddStatTokenEffect, options?: PlayCardOptions): void {
        const actorRuntime = this.getRuntime(playerId);
        const multiplier = this.getCardEffectMultiplier(playerId);
        const bonus = this.getCardEffectBonus(playerId);
        const value =
            typeof effect.value === 'number'
                ? effect.value
                : effect.valueFormula
                ? evaluateValueFormula(effect.valueFormula, actorRuntime)
                : 0;
        const adjusted = value * multiplier + bonus;
        if (adjusted === 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            this.addStatTokensToPlayer(targetId, effect.stat, adjusted);
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'addStatToken',
                targetId,
                stat: effect.stat,
                amount: adjusted,
                timestamp: Date.now(),
            });
        });
    }

    private applyDiscardAllHandEffect(playerId: string, card: CardDefinition, effect: DiscardAllHandEffect, options?: PlayCardOptions): void {
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const hand = this.state.hands[targetId] ?? [];
            if (hand.length === 0) {
                return;
            }
            const discardedCount = hand.length;
            this.state = {
                ...this.state,
                hands: {
                    ...this.state.hands,
                    [targetId]: [],
                },
                sharedDiscard: [...this.state.sharedDiscard, ...hand],
                updatedAt: Date.now(),
            };
            this.clearSealedHand(targetId);
            this.clearCursedHand(targetId);
            this.clearBloodPatternHand(targetId);
            this.syncHandStatTokens(targetId);
            this.logEvent({
                type: 'cardEffect',
                playerId,
                cardId: card.id,
                kind: 'discard',
                targetId,
                count: discardedCount,
                note: '手札をすべて捨てた',
                timestamp: Date.now(),
            });
        });
    }

    private applyDiscardThenDrawEffect(playerId: string, card: CardDefinition, effect: DiscardThenDrawEffect, options?: PlayCardOptions): void {
        const discardCount = Math.max(0, Math.floor(effect.discardCount ?? 0));
        if (discardCount <= 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const hand = [...(this.state.hands[targetId] ?? [])];
            if (hand.length < discardCount) {
                throw new Error('手札が足りません。');
            }
            const discarded: string[] = [];
            for (let i = 0; i < discardCount; i += 1) {
                const idx = Math.floor(Math.random() * hand.length);
                const picked = hand.splice(idx, 1)[0];
                if (picked) {
                    discarded.push(picked);
                }
                this.shiftSealedHandAfterRemoval(targetId, idx);
                this.shiftCursedHandAfterRemoval(targetId, idx);
                this.shiftBloodPatternHandAfterRemoval(targetId, idx);
            }
            this.state = {
                ...this.state,
                hands: {
                    ...this.state.hands,
                    [targetId]: hand,
                },
                sharedDiscard: [...this.state.sharedDiscard, ...discarded],
                updatedAt: Date.now(),
            };
            this.syncHandStatTokens(targetId);
            if (discarded.length > 0) {
                const beforeDraw = (this.state.hands[targetId] ?? []).length;
                this.state = drawFromSharedDeck(this.state, targetId, discarded.length);
                const afterDraw = (this.state.hands[targetId] ?? []).length;
                this.syncHandStatTokens(targetId);
                const drawn = Math.max(0, afterDraw - beforeDraw);
                this.logEvent({
                    type: 'cardEffect',
                    playerId,
                    cardId: card.id,
                    kind: 'discard',
                    targetId,
                    count: discarded.length,
                    note: `手札を${discarded.length}枚捨てて${drawn}枚引いた`,
                    timestamp: Date.now(),
                });
            }
        });
    }

    private clearSealedHand(playerId: string): void {
        this.updateRoleState(playerId, (prev) => {
            if (!prev.sealedHand || prev.sealedHand.length === 0) {
                return prev;
            }
            return { ...prev, sealedHand: [] };
        });
    }

    private clearCursedHand(playerId: string): void {
        this.updateRoleState(playerId, (prev) => {
            if (!prev.cursedHand || prev.cursedHand.length === 0) {
                return prev;
            }
            return { ...prev, cursedHand: [] };
        });
    }

    private clearBloodPatternHand(playerId: string): void {
        this.updateRoleState(playerId, (prev) => {
            if (!prev.bloodPatternHand || prev.bloodPatternHand.length === 0) {
                return prev;
            }
            return { ...prev, bloodPatternHand: [] };
        });
    }

    private shiftSealedHandAfterRemoval(playerId: string, removedIndex: number): void {
        if (removedIndex < 0) {
            return;
        }
        this.updateRoleState(playerId, (prev) => {
            const sealed = prev.sealedHand ?? [];
            if (sealed.length === 0) {
                return prev;
            }
            const next = sealed
                .filter((entry) => entry.index !== removedIndex)
                .map((entry) => (entry.index > removedIndex ? { ...entry, index: entry.index - 1 } : entry))
                .filter((entry) => entry.index >= 0);
            return { ...prev, sealedHand: next };
        });
    }

    private shiftCursedHandAfterRemoval(playerId: string, removedIndex: number): void {
        if (removedIndex < 0) {
            return;
        }
        this.updateRoleState(playerId, (prev) => {
            const cursed = prev.cursedHand ?? [];
            if (cursed.length === 0) {
                return prev;
            }
            const next = cursed
                .filter((entry) => entry.index !== removedIndex)
                .map((entry) => (entry.index > removedIndex ? { ...entry, index: entry.index - 1 } : entry));
            return { ...prev, cursedHand: next };
        });
    }

    private shiftBloodPatternHandAfterRemoval(playerId: string, removedIndex: number): void {
        if (removedIndex < 0) {
            return;
        }
        this.updateRoleState(playerId, (prev) => {
            const patterns = prev.bloodPatternHand ?? [];
            if (patterns.length === 0) {
                return prev;
            }
            const next = patterns
                .filter((entry) => entry.index !== removedIndex)
                .map((entry) => (entry.index > removedIndex ? { ...entry, index: entry.index - 1 } : entry))
                .filter((entry) => entry.index >= 0);
            return { ...prev, bloodPatternHand: next };
        });
    }

    private applyCoinFlipDealDamageEffect(
        playerId: string,
        card: CardDefinition,
        effect: CoinFlipDealDamageEffect,
        options?: PlayCardOptions
    ): void {
        const chance = Number.isFinite(effect.chance) ? effect.chance : 0;
        if (chance <= 0) {
            return;
        }
        if (chance < 1 && Math.random() >= chance) {
            return;
        }
        this.applyDealDamageEffect(playerId, card, {
            trigger: effect.trigger,
            condition: effect.condition,
            optional: effect.optional,
            type: 'dealDamage',
            target: effect.target,
            value: effect.value,
            fixed: effect.fixed,
            defApplied: effect.defApplied,
            ignoreDef: effect.ignoreDef,
        }, options);
    }

    private applyCoinFlipDealDamageEitherEffect(
        playerId: string,
        card: CardDefinition,
        effect: CoinFlipDealDamageEitherEffect,
        options?: PlayCardOptions
    ): void {
        const chanceToHitTarget = Number.isFinite(effect.chanceToHitTarget) ? effect.chanceToHitTarget : 0;
        const hitTarget = chanceToHitTarget >= 1 ? true : chanceToHitTarget <= 0 ? false : Math.random() < chanceToHitTarget;
        const selfTarget: CardTarget = 'self';
        const chosenTarget: CardTarget = effect.target;
        const actualTarget = hitTarget ? chosenTarget : selfTarget;
        const value = hitTarget ? effect.targetValue : effect.selfValue;
        if (value <= 0) {
            return;
        }
        this.applyDealDamageEffect(playerId, card, {
            trigger: effect.trigger,
            condition: effect.condition,
            optional: effect.optional,
            type: 'dealDamage',
            target: actualTarget,
            value,
            fixed: effect.fixed,
            defApplied: effect.defApplied,
            ignoreDef: effect.ignoreDef,
        }, options);
    }

    private applySetNextRoundPriorityEffect(playerId: string, _effect: SetNextRoundPriorityEffect): void {
        const currentRound = Number.isFinite(this.state.round) ? this.state.round : 1;
        this.state = {
            ...this.state,
            nextRoundPriority: { playerId, applyOnRound: currentRound + 1 },
            updatedAt: Date.now(),
        };
    }

    private applyAdrenalineEffect(playerId: string, effect: AdrenalineEffect): void {
        const buffAtk = effect.buff?.atk ?? 0;
        const buffSpe = effect.buff?.spe ?? 0;
        if (buffAtk !== 0) {
            this.addStatTokensToPlayer(playerId, 'atk', buffAtk);
        }
        if (buffSpe !== 0) {
            this.addStatTokensToPlayer(playerId, 'spe', buffSpe);
        }
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            adrenalineTurnsRemaining: 2,
            adrenalineBuff: { atk: buffAtk, spe: buffSpe },
            adrenalineRebound: {
                atk: effect.rebound?.atk ?? 0,
                spe: effect.rebound?.spe ?? 0,
            },
        }));
    }

    private syncHandStatTokens(playerId: string): void {
        const runtime = this.ensureRuntimeExists(playerId);
        const prevTokens: StatModifierMap = runtime.roleState?.handStatTokens ?? {
            atk: 0,
            def: 0,
            spe: 0,
            bra: 0,
        };
        const nextTokens: StatModifierMap = { atk: 0, def: 0, spe: 0, bra: 0 };
        const hand = this.state.hands[playerId] ?? [];

        hand.forEach((cardId) => {
            const card = this.cardMap.get(cardId);
            if (!card?.effects?.length) {
                return;
            }
            card.effects.forEach((effect) => {
                if (effect.type !== 'handStatModifier') {
                    return;
                }
                if (!this.isEffectConditionSatisfied(effect.condition, playerId, playerId)) {
                    return;
                }
                const value = effect.value ?? 0;
                if (value === 0) {
                    return;
                }
                nextTokens[effect.stat] = (nextTokens[effect.stat] ?? 0) + value;
            });
        });

        const cursed = this.readRoleState(playerId).cursedHand ?? [];
        cursed.forEach((entry) => {
            if (entry.curseId !== 'weakness') {
                return;
            }
            if (hand[entry.index] !== entry.cardId) {
                return;
            }
            nextTokens.def = (nextTokens.def ?? 0) - 1;
        });

        const bloodPatterns = this.readRoleState(playerId).bloodPatternHand ?? [];
        let validBloodPatternCount = 0;
        bloodPatterns.forEach((entry) => {
            if (hand[entry.index] !== entry.cardId) {
                return;
            }
            validBloodPatternCount += 1;
        });
        if (validBloodPatternCount > 0) {
            nextTokens.atk = (nextTokens.atk ?? 0) + validBloodPatternCount;
        }

        (Object.keys(nextTokens) as Array<keyof StatModifierMap>).forEach((stat) => {
            const delta = (nextTokens[stat] ?? 0) - (prevTokens[stat] ?? 0);
            if (delta !== 0) {
                this.addStatTokensToPlayer(playerId, stat, delta);
            }
        });

        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            handStatTokens: nextTokens,
        }));
    }

    private applyDoubleBaseStatEffect(
        playerId: string,
        card: CardDefinition,
        effect: DoubleBaseStatEffect,
        options?: PlayCardOptions
    ): void {
        const available = (effect.playerChoice?.chooseOneOf ?? []) as StatKey[];
        const excluded = new Set(effect.exclude ?? []);
        const validChoices = available.filter((stat) => !excluded.has(stat));
        if (validChoices.length === 0) {
            return;
        }

        const requested = options?.choices?.stat;
        if (!requested || typeof requested !== 'string') {
            throw new Error('このカードを使う前に強化するステータスを選択してください。');
        }

        const chosenStat = requested as StatKey;
        if (card.id === 'twice_boost' && chosenStat === 'bra') {
            throw new Error('トゥワイスブーストではBraを選べません。');
        }
        if (!validChoices.includes(chosenStat)) {
            throw new Error('このカードでは選択できないステータスです。');
        }

        const runtime = this.ensureRuntimeExists(playerId);
        const baseValue = runtime.baseStats[chosenStat] ?? 0;
        if (baseValue <= 0) {
            return;
        }

        const targetStat = chosenStat as CombatStatKey | 'bra';
        this.addStatTokensToPlayer(playerId, targetStat, baseValue);
        this.reduceHpDirectly(playerId, baseValue);
    }

    private reduceHpDirectly(playerId: string, amount: number): void {
        if (amount <= 0) {
            return;
        }
        const runtime = this.getRuntime(playerId);
        if (!runtime) {
            return;
        }
        const nextHp = Math.max(0, runtime.hp - amount);
        this.state = setPlayerRuntimeState(this.state, playerId, {
            ...runtime,
            hp: nextHp,
        });
        if (nextHp <= 0) {
            this.handlePlayerDefeated(playerId, playerId);
        }
    }

    private shouldApplyOptionalEffect(effect: CardEffect, effectIndex: number, options?: PlayCardOptions): boolean {
        if (!effect.optional) {
            return true;
        }
        const chosenRaw = options?.choices?.optionalEffects;
        if (Array.isArray(chosenRaw)) {
            const chosen = chosenRaw.filter((value): value is number => typeof value === 'number');
            return chosen.includes(effectIndex);
        }
        return false;
    }

    private resolveTargets(target: CardTarget | undefined, actorId: string, provided?: string[]): string[] {
        const candidates = new Set(this.state.players.map((player) => player.id));
        const filteredProvided = (provided ?? []).filter((id) => candidates.has(id));

        const taunterId = this.state.players.find((player) => {
            const runtime = this.getRuntime(player.id);
            return runtime && !runtime.isDefeated && runtime.roleState?.tauntUntilNextTurnStart;
        })?.id;
        if (taunterId && (target === 'chosen_enemy' || target === 'chosen_player')) {
            return [taunterId];
        }

        switch (target) {
            case 'all_players':
                return Array.from(candidates);
            case 'chosen_enemy': {
                const selection = filteredProvided.filter((id) => id !== actorId);
                if (selection.length === 0) {
                    throw new Error('対象のプレイヤーを選択してください。');
                }
                return selection.slice(0, 1);
            }
            case 'chosen_player': {
                if (filteredProvided.length === 0) {
                    throw new Error('対象のプレイヤーを選択してください。');
                }
                return filteredProvided;
            }
            case 'self':
            default:
                return [actorId];
        }
    }

    private isEffectConditionSatisfied(condition: EffectCondition | undefined, actorId: string, targetId?: string): boolean {
        if (!condition) {
            return true;
        }

        if (condition.roleId) {
            const player = this.getPlayer(actorId);
            if (!player || player.roleId !== condition.roleId) {
                return false;
            }
        }

        if (typeof condition.targetHandCountAtLeast === 'number') {
            if (!targetId) {
                return false;
            }
            const handSize = this.state.hands[targetId]?.length ?? 0;
            if (handSize < condition.targetHandCountAtLeast) {
                return false;
            }
        }

        if (typeof condition.hpAtMostPercent === 'number') {
            const runtime = this.getRuntime(actorId);
            if (!runtime || runtime.maxHp <= 0) {
                return false;
            }
            const ratio = runtime.hp / runtime.maxHp;
            if (ratio > condition.hpAtMostPercent) {
                return false;
            }
        }

        return true;
    }

    private applyDamageToPlayer(
        attackerId: string,
        targetId: string,
        amount: number,
        source: DamageSource = 'other',
        options?: DamageResolutionOptions
    ): number | null {
        if (amount <= 0) {
            return 0;
        }
        if (this.state.pendingPrompt) {
            return null;
        }
        this.ensureRuntimeExists(targetId);
        let runtime = this.getRuntime(targetId);
        if (!runtime) {
            return 0;
        }

        // 「ふしぎなまもり」: 特殊ダメージ（炎上/出血など）を受けない
        if (source === 'status' && runtime.installs.some((install) => install.cardId === 'mysterious_guard')) {
            this.logDamageResolved({
                attackerId,
                targetId,
                source,
                label: options?.label,
                attempted: amount,
                totalAfterReductions: 0,
                tempAbsorbed: 0,
                hpDamage: 0,
                prevented: true,
                breakdown: ['ふしぎなまもり: 特殊ダメージ無効'],
                cardId: options?.cardId,
                abilityId: options?.abilityId,
            });
            return 0;
        }
        const attempted = amount;
        const isContactAttack = Boolean(options?.contactAttack && attackerId !== targetId);
        const resolution = this.handleBeforeDamageEffects(targetId, amount, attackerId, source, options);
        if (resolution.pending) {
            return null;
        }
        if (resolution.prevented || resolution.amount <= 0) {
            this.logDamageResolved({
                attackerId,
                targetId,
                source,
                label: options?.label,
                attempted,
                totalAfterReductions: 0,
                tempAbsorbed: 0,
                hpDamage: 0,
                prevented: true,
                breakdown: resolution.breakdown,
                cardId: options?.cardId,
                abilityId: options?.abilityId,
            });
            if (isContactAttack) {
                this.applyDefenderAfterRoleAttackInstallEffects(attackerId, targetId);
            }
            return 0;
        }

        // 「延期」: ラウンド中に受けたダメージは追加ターンでまとめて受ける
        const targetPlayer = this.getPlayer(targetId);
        const isPostpone = targetPlayer?.roleId === 'postpone' && !this.isRoleSuppressed(targetId);
        const isDeferredPostponeTurn = runtime.roleState?.postponePhase === 'deferred';
        if (isPostpone && !isDeferredPostponeTurn) {
            const deferredAmount = Math.max(0, resolution.amount);
            if (deferredAmount > 0) {
                const reason = `延期: ${deferredAmount}ダメージを延長ターンに繰り越し`;
                const nextBreakdown = [...(resolution.breakdown ?? []), reason];
                this.updateRoleState(targetId, (prev) => ({
                    ...prev,
                    postponeDeferredDamage: (prev.postponeDeferredDamage ?? 0) + deferredAmount,
                    postponeDeferredAttackerId:
                        attackerId && attackerId !== targetId ? attackerId : prev.postponeDeferredAttackerId,
                }));
                this.logDamageResolved({
                    attackerId,
                    targetId,
                    source,
                    label: options?.label ?? '延期（繰り越し）',
                    attempted,
                    totalAfterReductions: deferredAmount,
                    tempAbsorbed: 0,
                    hpDamage: 0,
                    prevented: false,
                    breakdown: nextBreakdown,
                    cardId: options?.cardId,
                    abilityId: options?.abilityId,
                });
            }
            if (isContactAttack) {
                this.applyDefenderAfterRoleAttackInstallEffects(attackerId, targetId);
            }
            return deferredAmount;
        }

        runtime = this.getRuntime(targetId);
        if (!runtime) {
            return 0;
        }

        const prevHp = runtime.hp;
        const prevTemp = runtime.tempHp;
        let remaining = resolution.amount;
        let nextTempHp = runtime.tempHp;
        if (nextTempHp > 0) {
            const absorbed = Math.min(nextTempHp, remaining);
            nextTempHp -= absorbed;
            remaining -= absorbed;
        }

        let nextHp = runtime.hp;
        if (remaining > 0) {
            nextHp = Math.max(0, nextHp - remaining);
        }

        this.state = setPlayerRuntimeState(this.state, targetId, {
            ...runtime,
            tempHp: nextTempHp,
            hp: nextHp,
        });

        const tempAbsorbed = Math.max(0, prevTemp - nextTempHp);
        const damageToHp = Math.max(0, prevHp - nextHp);
        const totalApplied = tempAbsorbed + damageToHp;

        this.logDamageResolved({
            attackerId,
            targetId,
            source,
            label: options?.label,
            attempted,
            totalAfterReductions: resolution.amount,
            tempAbsorbed,
            hpDamage: damageToHp,
            prevented: false,
            breakdown: resolution.breakdown,
            cardId: options?.cardId,
            abilityId: options?.abilityId,
        });

        if (isContactAttack) {
            this.applyDefenderAfterRoleAttackInstallEffects(attackerId, targetId);
        }

        if (damageToHp > 0) {
            this.handleAfterDamageEvents(attackerId, targetId, damageToHp, source);
        }
        if (nextHp <= 0) {
            this.handlePlayerDefeated(targetId, attackerId);
        }

        return totalApplied > 0 ? totalApplied : 0;
    }

    private applyHealToPlayer(targetId: string, amount: number): number {
        if (amount <= 0) {
            return 0;
        }
        const runtime = this.ensureRuntimeExists(targetId);
        const prevHp = runtime.hp;
        const nextHp = Math.min(runtime.maxHp, prevHp + amount);
        const healed = nextHp - prevHp;
        if (healed <= 0) {
            return 0;
        }
        this.state = setPlayerRuntimeState(this.state, targetId, {
            ...runtime,
            hp: nextHp,
        });
        return healed;
    }

    private handleBeforeDamageEffects(
        targetId: string,
        amount: number,
        attackerId: string | undefined,
        source: DamageSource,
        options?: DamageResolutionOptions
    ): { prevented: boolean; amount: number; pending?: boolean; breakdown?: string[] } {
        const runtime = this.getRuntime(targetId);
        if (!runtime) {
            return { prevented: false, amount };
        }

        let pendingAmount = amount;
        const breakdown: string[] = [];
        const allowPrompt = options?.allowPrompt !== false;
        if (runtime.installs.length > 0) {
            for (const install of runtime.installs) {
                const card = this.cardMap.get(install.cardId);
                if (!card) {
                    continue;
                }
                if (options?.ignoreDefenseInstalls && card.category === 'defense') {
                    continue;
                }
                for (const [effectIndex, effect] of card.effects.entries()) {
                    if (effect.trigger !== 'beforeDamageTaken') {
                        continue;
                    }
                    // 防御系の割り込みは、指定がない限りロール/カードダメージにのみ反応させる（炎上などの継続ダメージは対象外）
                    const allowedSourcesForInstall =
                        (effect as { sources?: DamageSource[] }).sources ?? ['role', 'card'];
                    if (!allowedSourcesForInstall.includes(source)) {
                        continue;
                    }
                    const forcedDecision =
                        options?.forcedPromptDecision &&
                        options.forcedPromptDecision.installInstanceId === install.instanceId &&
                        options.forcedPromptDecision.effectIndex === effectIndex
                            ? options.forcedPromptDecision.decision
                            : undefined;
                    if (effect.type === 'thresholdPrevent') {
                        const satisfies =
                            (effect.operator === '<=' && pendingAmount <= effect.threshold) ||
                            (effect.operator === '>=' && pendingAmount >= effect.threshold);
                        if (!satisfies) {
                            continue;
                        }
                        const shouldSkipOptional =
                            options?.skipOptional &&
                            options.skipOptional.installInstanceId === install.instanceId &&
                            options.skipOptional.effectIndex === effectIndex;
                        if (forcedDecision === 'decline' && effect.playerChoice && effect.optional) {
                            continue;
                        }
                        if (!forcedDecision && shouldSkipOptional && effect.playerChoice && effect.optional) {
                            continue;
                        }
                        if (!forcedDecision && allowPrompt && effect.playerChoice && effect.optional) {
                            const cardName = card.name ?? install.cardId;
                            const declined = this.previewDamageOutcome(targetId, attackerId, pendingAmount, source);
                            const prompt: PendingPrompt = {
                                id: generateUuid(),
                                type: 'beforeDamageTaken',
                                targetId,
                                attackerId,
                                source,
                                amount: pendingAmount,
                                installInstanceId: install.instanceId,
                                cardId: install.cardId,
                                effectIndex,
                                action: options?.action,
                                contactAttack: options?.contactAttack,
                                preview: {
                                    incoming: pendingAmount,
                                    source,
                                    attackerId,
                                    targetId,
                                    ifAccepted: {
                                        totalAfterReductions: 0,
                                        tempAbsorbed: 0,
                                        hpDamage: 0,
                                        breakdown: [`${cardName}: ダメージ無効`],
                                    },
                                    ifDeclined: declined,
                                },
                            };
                            this.setPendingPrompt(prompt);
                            return { prevented: true, amount: pendingAmount, pending: true, breakdown };
                        }
                        if (effect.sacrificeSelf) {
                            this.destroyInstall(targetId, install.instanceId);
                        }
                        if (effect.preventAll) {
                            const reason = `${card.name ?? install.cardId}: ${effect.operator}${effect.threshold}ダメージ無効`;
                            this.logDamageReduction({
                                playerId: targetId,
                                amount: pendingAmount,
                                source: 'install',
                                cardId: install.cardId,
                                reason,
                            });
                            breakdown.push(reason);
                            return { prevented: true, amount: 0, breakdown };
                        }
                    }
                    if (effect.type === 'damageIntercept') {
                        const min = Math.max(0, Math.floor(effect.min ?? 0));
                        const max =
                            typeof effect.max === 'number' ? Math.max(min, Math.floor(effect.max)) : Number.POSITIVE_INFINITY;
                        if (pendingAmount < min || pendingAmount > max) {
                            continue;
                        }
                        const shouldSkipOptional =
                            options?.skipOptional &&
                            options.skipOptional.installInstanceId === install.instanceId &&
                            options.skipOptional.effectIndex === effectIndex;
                        if (forcedDecision === 'decline' && effect.playerChoice && effect.optional) {
                            continue;
                        }
                        if (!forcedDecision && shouldSkipOptional && effect.playerChoice && effect.optional) {
                            continue;
                        }

                        const replaceWith = Math.max(0, Math.floor(effect.replaceWith ?? 0));
                        const incoming = pendingAmount;
                        const cardName = card.name ?? install.cardId;
                        const reason = `${cardName}: ダメージを${replaceWith}に変更`;

                        if (!forcedDecision && allowPrompt && effect.playerChoice && effect.optional) {
                            const declined = this.previewDamageOutcome(targetId, attackerId, pendingAmount, source);
                            const accepted = this.previewDamageOutcome(targetId, attackerId, replaceWith, source);
                            const prompt: PendingPrompt = {
                                id: generateUuid(),
                                type: 'beforeDamageTaken',
                                targetId,
                                attackerId,
                                source,
                                amount: pendingAmount,
                                installInstanceId: install.instanceId,
                                cardId: install.cardId,
                                effectIndex,
                                action: options?.action,
                                contactAttack: options?.contactAttack,
                                preview: {
                                    incoming: pendingAmount,
                                    source,
                                    attackerId,
                                    targetId,
                                    ifAccepted: {
                                        ...accepted,
                                        breakdown: [reason, ...(accepted.breakdown ?? [])],
                                    },
                                    ifDeclined: declined,
                                },
                            };
                            this.setPendingPrompt(prompt);
                            return { prevented: true, amount: pendingAmount, pending: true, breakdown };
                        }

                        const reduction = Math.max(0, incoming - replaceWith);
                        if (reduction > 0) {
                            this.logDamageReduction({
                                playerId: targetId,
                                amount: reduction,
                                source: 'install',
                                cardId: install.cardId,
                                reason,
                            });
                        }
                        breakdown.push(reason);
                        pendingAmount = replaceWith;

                        const dizzy = Math.max(0, Math.floor(effect.applyDizzyToSelf ?? 0));
                        if (dizzy > 0) {
                            this.updateRoleState(targetId, (prev) => ({
                                ...prev,
                                dizzyTurns: (prev.dizzyTurns ?? 0) + dizzy,
                            }));
                        }

                        const shouldKeep =
                            typeof effect.freeIfDamageEquals === 'number' && incoming === effect.freeIfDamageEquals;
                        if (effect.sacrificeSelf && !shouldKeep) {
                            this.destroyInstall(targetId, install.instanceId);
                        }

                        if (pendingAmount <= 0) {
                            return { prevented: true, amount: 0, breakdown };
                        }
                    }
                    if (effect.type === 'reduceDamageOnce') {
                        const allowedSources = effect.sources ?? ['role', 'card'];
                        if (!allowedSources.includes(source)) {
                            continue;
                        }
                        if (!this.isEffectConditionSatisfied(effect.condition, targetId, attackerId)) {
                            continue;
                        }
                        const reduction = Math.min(pendingAmount, effect.amount);
                        if (reduction <= 0) {
                            continue;
                        }
                        pendingAmount = Math.max(0, pendingAmount - reduction);
                        const reason = `${card.name ?? install.cardId}: ダメージ-${reduction}`;
                        this.logDamageReduction({
                            playerId: targetId,
                            amount: reduction,
                            source: 'install',
                            cardId: install.cardId,
                            reason,
                        });
                        breakdown.push(reason);
                        if (effect.sacrificeSelf !== false) {
                            this.destroyInstall(targetId, install.instanceId);
                        }
                        if (pendingAmount <= 0) {
                            return { prevented: true, amount: 0, breakdown };
                        }
                    }
                    if (effect.type === 'cheatDeathAtFull') {
                        const condition = effect.condition ?? {};
                        const lethal = pendingAmount >= runtime.tempHp + runtime.hp;
                        if (condition.hpEqualsMax && runtime.hp < runtime.maxHp) {
                            continue;
                        }
                        if (condition.fatalIfApplied && !lethal) {
                            continue;
                        }
                        const nextState: PlayerRuntimeState = {
                            ...runtime,
                            hp: Math.max(0, effect.setHpTo),
                            tempHp: 0,
                        };
                        this.state = setPlayerRuntimeState(this.state, targetId, nextState);
                        if (effect.sacrificeSelf) {
                            this.destroyInstall(targetId, install.instanceId);
                        }
                        breakdown.push(`${card.name ?? install.cardId}: 致死ダメージを回避`);
                        return { prevented: true, amount: 0, breakdown };
                    }
                }
            }
        }

        const adjusted = this.applyBeforeDamageAbilities(targetId, attackerId, pendingAmount, source);
        if (adjusted.breakdown.length > 0) {
            breakdown.push(...adjusted.breakdown);
        }
        return { prevented: adjusted.amount <= 0, amount: Math.max(0, adjusted.amount), breakdown };
    }

    private destroyInstall(playerId: string, instanceId: string): void {
        let removedCardId: string | null = null;
        const ensuredRuntime = this.ensureRuntimeExists(playerId);
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const current = runtime ?? ensuredRuntime;
            const remaining = current.installs.filter((install) => {
                if (install.instanceId === instanceId) {
                    removedCardId = install.cardId;
                    return false;
                }
                return true;
            });
            if (!removedCardId) {
                return current;
            }
            return {
                ...current,
                installs: remaining,
            };
        });
        if (removedCardId) {
            this.state = {
                ...this.state,
                sharedDiscard: [...this.state.sharedDiscard, removedCardId],
                updatedAt: Date.now(),
            };
            this.handleInstallRemoved(playerId, removedCardId);
        }
    }

    private handleInstallRemoved(playerId: string, cardId: string): void {
        const removedCard = this.cardMap.get(cardId);
        if (!removedCard) {
            return;
        }
        removedCard.effects.forEach((effect) => {
            if (effect.type !== 'modifyMaxHpInstall') {
                return;
            }
            this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
                const ensured = runtime ?? this.ensureRuntimeExists(playerId);
                const nextMax = Math.max(1, ensured.maxHp - effect.value);
                const nextHp = Math.min(nextMax, ensured.hp);
                return {
                    ...ensured,
                    maxHp: nextMax,
                    hp: nextHp,
                };
            });
        });
        if (cardId === 'lightning_rod') {
            this.reconcileLightningRodAtkBonus(playerId);
        }
    }

    private reconcileLightningRodAtkBonus(playerId: string): void {
        const runtime = this.getRuntime(playerId);
        if (!runtime || runtime.isDefeated) {
            return;
        }
        const hasRod = runtime.installs.some((install) => install.cardId === 'lightning_rod');
        const applied = runtime.roleState?.lightningRodAtkBonusApplied ?? 0;

        if (!hasRod) {
            if (applied !== 0) {
                this.addStatTokensToPlayer(playerId, 'atk', -applied);
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    lightningRodAtkBonusApplied: undefined,
                }));
            }
            return;
        }

        const shock = runtime.roleState?.shockTokens ?? 0;
        const desired = Math.max(0, Math.floor(shock / 5));
        const delta = desired - applied;
        if (delta !== 0) {
            this.addStatTokensToPlayer(playerId, 'atk', delta);
        }
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            lightningRodAtkBonusApplied: desired > 0 ? desired : undefined,
        }));
    }

    private installCard(playerId: string, card: CardDefinition): void {
        let removedCardIds: string[] = [];
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            let next = runtime;
            if (!next) {
                const player = this.getPlayer(playerId);
                if (!player?.roleId) {
                    throw new Error('Player must have a role before installing cards.');
                }
                const role = this.roleMap.get(player.roleId);
                if (!role) {
                    throw new Error(`Role ${player.roleId} is not defined.`);
                }
                next = createRuntimeStateFromRole(playerId, role);
            }
            if (next.installs.length > 0 && card.subtype === 'equip') {
                removedCardIds = next.installs
                    .filter((install) => {
                        const installedCard = this.cardMap.get(install.cardId);
                        return installedCard?.subtype === 'equip';
                    })
                    .map((install) => install.cardId);
            }
            return {
                ...next,
                installs: [
                    ...(card.subtype === 'equip'
                        ? next.installs.filter((install) => {
                              const installedCard = this.cardMap.get(install.cardId);
                              return installedCard?.subtype !== 'equip';
                          })
                        : next.installs),
                    { cardId: card.id, instanceId: generateUuid() },
                ],
            };
        });
        if (removedCardIds.length > 0) {
            this.state = {
                ...this.state,
                sharedDiscard: [...this.state.sharedDiscard, ...removedCardIds],
                updatedAt: Date.now(),
            };
            removedCardIds.forEach((removedCardId) => {
                this.handleInstallRemoved(playerId, removedCardId);
            });
        }
    }

    private readRoleState(playerId: string): RoleRuntimeState {
        const runtime = this.state.board.playerStates[playerId];
        return runtime?.roleState ?? {};
    }

    private updateRoleState(playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState): void {
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            const nextRoleState = mutator(ensured.roleState ?? {});
            return {
                ...ensured,
                roleState: nextRoleState,
            };
        });
    }

    private addStatTokensToPlayer(playerId: string, stat: CombatStatKey | 'bra', delta: number): void {
        if (delta === 0) {
            return;
        }
        if (delta > 0) {
            const player = this.getPlayer(playerId);
            if (player?.roleId === 'greed') {
                this.applyHealToPlayer(playerId, delta);
                return;
            }
        }
        let before: number | undefined;
        let after: number | undefined;
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            before = getEffectiveStatValue(ensured, stat);
            const nextValue = (ensured.statTokens[stat] ?? 0) + delta;
            const nextState: PlayerRuntimeState = {
                ...ensured,
                statTokens: {
                    ...ensured.statTokens,
                    [stat]: nextValue,
                },
            };
            after = getEffectiveStatValue(nextState, stat);
            return nextState;
        });
        if (before !== undefined && after !== undefined && before !== after) {
            this.handleStatTotalChanged(playerId, stat, before, after);
        }
    }

    private mutatePlayerBaseStat(playerId: string, stat: StatKey, mutator: (current: number) => number): void {
        let before: number | undefined;
        let after: number | undefined;
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            before = this.getTotalStatValue(ensured, stat);
            const next = mutateBaseStat(ensured, stat, mutator);
            after = this.getTotalStatValue(next, stat);
            return next;
        });
        if (before !== undefined && after !== undefined && before !== after) {
            this.handleStatTotalChanged(playerId, stat, before, after);
        }
    }

    private getTotalStatValue(runtime: PlayerRuntimeState, stat: StatKey): number {
        if (stat === 'hp') {
            return runtime.baseStats.hp;
        }
        return getEffectiveStatValue(runtime, stat as CombatStatKey | 'bra');
    }

    private handleStatTotalChanged(playerId: string, stat: StatKey, previous: number, next: number): void {
        if (previous === next) {
            return;
        }
        const abilities = this.getRoleAbilities(playerId).filter((ability) => ability.trigger === 'onStatTotalChanged');
        if (abilities.length === 0) {
            return;
        }
        const context: RoleAbilityContext = {
            stat,
            previousStatTotal: previous,
            nextStatTotal: next,
        };
        abilities.forEach((ability) => {
            if (ability.condition?.stat && ability.condition.stat !== stat) {
                return;
            }
            const direction = ability.condition?.direction ?? (next > previous ? 'up' : 'down');
            if (direction === 'up' && next <= previous) {
                return;
            }
            if (direction === 'down' && next >= previous) {
                return;
            }
            const triggerCount = this.calculateStatThresholdTriggers(
                ability.condition?.threshold,
                previous,
                next,
                direction
            );
            const executions = ability.condition?.threshold ? triggerCount : triggerCount > 0 ? 1 : 0;
            if (executions <= 0) {
                return;
            }
            for (let i = 0; i < executions; i += 1) {
                this.executeAbilityActions(playerId, ability, context);
            }
        });
    }

    private calculateStatThresholdTriggers(
        threshold: RoleAbilityThreshold | undefined,
        previous: number,
        next: number,
        direction: 'up' | 'down'
    ): number {
        if (!threshold) {
            return direction === 'up' ? (next > previous ? 1 : 0) : next < previous ? 1 : 0;
        }
        const from = threshold.from ?? 0;
        const step = threshold.step ?? 1;
        if (step <= 0) {
            return 0;
        }
        if (direction === 'up') {
            if (next <= previous) {
                return 0;
            }
            const prevIndex = previous >= from ? Math.floor((previous - from) / step) : -1;
            const nextIndex = next >= from ? Math.floor((next - from) / step) : -1;
            return Math.max(0, nextIndex - prevIndex);
        }
        if (next >= previous) {
            return 0;
        }
        const prevIndex = previous <= from ? Math.floor((from - previous) / step) : -1;
        const nextIndex = next <= from ? Math.floor((from - next) / step) : -1;
        return Math.max(0, prevIndex - nextIndex);
    }

    private triggerRoleAbilities(
        trigger: RoleAbility['trigger'],
        playerId: string,
        context: RoleAbilityContext
    ): AbilityTriggerResult | undefined {
        if (trigger === 'onStatTotalChanged') {
            return undefined;
        }
        if (this.isRoleSuppressed(playerId)) {
            return undefined;
        }
        const abilities = this.getRoleAbilities(playerId).filter((ability) => ability.trigger === trigger);
        if (abilities.length === 0) {
            return undefined;
        }
        let aggregate: AbilityTriggerResult | undefined;
        abilities.forEach((ability) => {
            if (!this.isRoleAbilityConditionMet(ability, context)) {
                return;
            }
            const result = this.executeAbilityActions(playerId, ability, context);
            if (result.damageReduction) {
                aggregate = {
                    damageReduction: (aggregate?.damageReduction ?? 0) + result.damageReduction,
                };
            }
        });
        return aggregate;
    }

    private isRoleAbilityConditionMet(ability: RoleAbility, context: RoleAbilityContext): boolean {
        if (ability.source === 'attacker' && context.attackerId && context.attackerId === context.targetId) {
            return false;
        }
        const condition = ability.condition;
        if (!condition) {
            return true;
        }
        if (condition.sources?.length) {
            const src = context.damageSource;
            if (!src || !condition.sources.includes(src)) {
                return false;
            }
        }
        if (typeof condition.alivePlayers === 'number' && condition.alivePlayers !== context.alivePlayers) {
            return false;
        }
        if (condition.stat && context.stat && condition.stat !== context.stat) {
            return false;
        }
        return true;
    }

    private executeAbilityActions(
        ownerId: string,
        ability: RoleAbility,
        context: RoleAbilityContext
    ): AbilityTriggerResult {
        let damageReduction = 0;
        const targetId = this.resolveAbilityTargetId(ability, ownerId, context);
        for (const action of ability.actions ?? []) {
            if ('addStatToken' in action) {
                const value = this.resolveAbilityValue(action.addStatToken.value, context);
                if (targetId && value !== 0) {
                    this.addStatTokensToPlayer(targetId, action.addStatToken.stat, value);
                }
            } else if ('reduceIncomingDamageBy' in action) {
                const value =
                    action.reduceIncomingDamageBy === 'spent'
                        ? context.spentStatTokens ?? 0
                        : this.resolveAbilityValue(action.reduceIncomingDamageBy, context);
                if (value > 0) {
                    damageReduction += value;
                }
            } else if ('setMaxHp' in action) {
                if (targetId) {
                    this.mutatePlayerBaseStat(targetId, 'hp', () => action.setMaxHp);
                }
            } else if ('setHp' in action) {
                if (targetId) {
                    this.setPlayerHpFromAbility(targetId, action.setHp);
                }
            } else if ('selfDamage' in action) {
                const value = this.resolveAbilityValue(action.selfDamage.value, context);
                if (value > 0) {
                    const applied = this.applyDamageToPlayer(ownerId, ownerId, value, 'ability', {
                        abilityId: ability.id,
                        label: `能力: ${ability.text ?? ability.id}`,
                    });
                    if (typeof applied === 'number' && applied > 0) {
                        this.logEvent({
                            type: 'abilityDamage',
                            playerId: ownerId,
                            sourceAbilityId: ability.id,
                            sourcePlayerId: ownerId,
                            amount: applied,
                            timestamp: Date.now(),
                        });
                    }
                }
            } else if ('dealDamageToSource' in action) {
                const target = targetId ?? context.attackerId;
                const value = this.resolveAbilityValue(action.dealDamageToSource.value, context);
                if (target && value > 0) {
                    const applied = this.applyDamageToPlayer(ownerId, target, value, 'ability', {
                        abilityId: ability.id,
                        label: `能力: ${ability.text ?? ability.id}`,
                    });
                    if (typeof applied === 'number' && applied > 0) {
                        this.logEvent({
                            type: 'abilityDamage',
                            playerId: target,
                            sourceAbilityId: ability.id,
                            sourcePlayerId: ownerId,
                            amount: applied,
                            timestamp: Date.now(),
                        });
                    }
                }
            }
        }
        return damageReduction > 0 ? { damageReduction } : {};
    }

    private resolveAbilityTargetId(
        ability: RoleAbility,
        ownerId: string,
        context: RoleAbilityContext
    ): string | undefined {
        if (ability.source === 'attacker') {
            return context.attackerId;
        }
        return ownerId;
    }

    private resolveAbilityValue(value: RoleAbilityValue | number | undefined, context: RoleAbilityContext): number {
        if (typeof value === 'number') {
            return value;
        }
        if (!value) {
            return 0;
        }
        if ('from' in value) {
            return this.getAbilityContextValue(value.from, context);
        }
        if ('ratioOf' in value) {
            const base = this.getAbilityContextValue(value.ratioOf, context);
            const raw = base * value.ratio;
            switch (value.round) {
                case 'ceil':
                    return Math.ceil(raw);
                case 'round':
                    return Math.round(raw);
                case 'floor':
                default:
                    return Math.floor(raw);
            }
        }
        return 0;
    }

    private getAbilityContextValue(source: RoleAbilityValueSource, context: RoleAbilityContext): number {
        switch (source) {
            case 'damageTaken':
                return context.damageTaken ?? context.damageAmount ?? 0;
            case 'damageDealt':
                return context.damageDealt ?? 0;
            case 'spentStatTokens':
                return context.spentStatTokens ?? 0;
            case 'damageAmount':
            default:
                return context.damageAmount ?? 0;
        }
    }

    private applyBeforeDamageAbilities(
        targetId: string,
        attackerId: string | undefined,
        amount: number,
        source: DamageSource
    ): { amount: number; breakdown: string[] } {
        let remaining = amount;
        const breakdown: string[] = [];
        if (remaining <= 0) {
            return { amount: 0, breakdown };
        }
        const abilities = this.getRoleAbilities(targetId).filter((ability) => ability.trigger === 'beforeDamageTaken');
        if (abilities.length === 0) {
            return { amount: remaining, breakdown };
        }
        abilities.forEach((ability) => {
            if (remaining <= 0) {
                return;
            }
            if (ability.id === 'swiftwind_spend_spe_reduce_damage' && source !== 'role' && source !== 'card') {
                return;
            }
            const beforeRemaining = remaining;
            const abilityContext: RoleAbilityContext = {
                attackerId,
                targetId,
                damageAmount: remaining,
            };
            const spendSpec = ability.playerChoice?.spendStatToken;
            if (spendSpec) {
                const spent = this.spendStatTokensForAbility(targetId, spendSpec, remaining);
                if (spent > 0) {
                    abilityContext.spentStatTokens = spent;
                    remaining = Math.max(0, remaining);
                }
            }
            const result = this.executeAbilityActions(targetId, ability, abilityContext);
            if (result.damageReduction) {
                const reduced = Math.min(result.damageReduction, beforeRemaining);
                remaining = Math.max(0, remaining - result.damageReduction);
                const spentLabel =
                    ability.id === 'swiftwind_spend_spe_reduce_damage' && abilityContext.spentStatTokens
                        ? `Speトークン${abilityContext.spentStatTokens}消費`
                        : undefined;
                this.logDamageReduction({
                    playerId: targetId,
                    amount: reduced,
                    source: 'ability',
                    abilityId: ability.id,
                    reason: spentLabel ?? ability.text ?? ability.id,
                });
                if (ability.id === 'swiftwind_spend_spe_reduce_damage' && abilityContext.spentStatTokens) {
                    breakdown.push(`疾風: Speトークン${abilityContext.spentStatTokens}消費で${reduced}軽減`);
                } else {
                    breakdown.push(`${spentLabel ?? ability.text ?? ability.id}: ${reduced}軽減`);
                }
            }
            abilityContext.damageAmount = remaining;
        });
        return { amount: remaining, breakdown };
    }

    private spendStatTokensForAbility(
        playerId: string,
        spec: RoleAbilitySpendTokenChoice['spendStatToken'],
        limit: number
    ): number {
        const runtime = this.ensureRuntimeExists(playerId);
        const available = runtime.statTokens[spec.stat] ?? 0;
        if (available <= 0) {
            return 0;
        }
        const maxAllowed = spec.max === 'any' ? available : Math.min(available, spec.max);
        if (maxAllowed <= 0) {
            return 0;
        }
        const desired = Math.min(maxAllowed, Math.max(0, Math.floor(limit)));
        const minRequired = spec.min ?? 0;
        const spend = Math.max(Math.min(maxAllowed, desired), Math.min(maxAllowed, minRequired));
        if (spend <= 0) {
            return 0;
        }
        this.addStatTokensToPlayer(playerId, spec.stat, -spend);
        return spend;
    }

    private setPlayerHpFromAbility(playerId: string, spec: { min?: number; max?: number; set?: number }): void {
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            let nextHp = typeof spec.set === 'number' ? spec.set : ensured.hp;
            if (typeof spec.min === 'number') {
                nextHp = Math.max(nextHp, spec.min);
            }
            if (typeof spec.max === 'number') {
                nextHp = Math.min(nextHp, spec.max);
            }
            return {
                ...ensured,
                hp: Math.min(ensured.maxHp, Math.max(0, nextHp)),
            };
        });
    }

    private handleAfterDamageEvents(attackerId: string, targetId: string, amount: number, source: DamageSource): void {
        this.triggerRoleAbilities('afterDamageTaken', targetId, {
            attackerId,
            targetId,
            damageSource: source,
            damageAmount: amount,
            damageTaken: amount,
        });
        if (attackerId !== targetId) {
            this.triggerRoleAbilities('afterDealingDamage', attackerId, {
                targetId,
                damageSource: source,
                damageAmount: amount,
                damageDealt: amount,
            });
        }
        const targetRuntime = this.getRuntime(targetId);
        const pendingDebuff = targetRuntime?.roleState?.pendingStatDebuff;
        if (pendingDebuff) {
            this.addStatTokensToPlayer(targetId, pendingDebuff.stat, -pendingDebuff.value);
            this.updateRoleState(targetId, (prev) => ({ ...prev, pendingStatDebuff: undefined }));
        }
    }

    private notifyAlivePlayersChanged(): void {
        const alivePlayers = this.state.players.filter((player) => {
            const runtime = this.state.board.playerStates[player.id];
            return runtime && !runtime.isDefeated;
        }).length;
        if (alivePlayers <= 0) {
            return;
        }
        this.state.players.forEach((player) => {
            const runtime = this.state.board.playerStates[player.id];
            if (!runtime || runtime.isDefeated) {
                return;
            }
            this.triggerRoleAbilities('onAlivePlayersChanged', player.id, { alivePlayers });
        });
    }

    private getRoleAbilities(playerId: string): RoleAbility[] {
        const player = this.getPlayer(playerId);
        if (!player?.roleId) {
            return [];
        }
        const role = this.roleMap.get(player.roleId);
        return role?.abilities ?? [];
    }

    private getSpe(roleId?: string): number {
        if (roleId && this.roleMap.has(roleId)) {
            return this.roleMap.get(roleId)?.params.spe ?? 0;
        }
        return 0;
    }

    private getBra(roleId?: string): number {
        if (roleId && this.roleMap.has(roleId)) {
            return this.roleMap.get(roleId)?.params.bra ?? 1;
        }
        return 1;
    }

    private getCardEffectMultiplier(playerId: string): number {
        if (this.isRoleSuppressed(playerId)) {
            return 1;
        }
        const runtime = this.getRuntime(playerId);
        const fromState = runtime?.roleState?.cardEffectMultiplier;
        if (typeof fromState === 'number' && fromState !== 0) {
            return fromState;
        }
        const player = this.getPlayer(playerId);
        return player?.roleId === 'efficiency' ? 2 : 1;
    }

    private getCardEffectBonus(playerId: string): number {
        const runtime = this.getRuntime(playerId);
        const base = runtime?.roleState?.cardEffectBonus ?? 0;
        const transient = this.transientCardEffectBonus.get(playerId) ?? 0;
        return base + transient;
    }

    private withTransientCardEffectBonus<T>(playerId: string, bonus: number, fn: () => T): T {
        if (bonus === 0) {
            return fn();
        }
        const prev = this.transientCardEffectBonus.get(playerId) ?? 0;
        this.transientCardEffectBonus.set(playerId, prev + bonus);
        try {
            return fn();
        } finally {
            const next = (this.transientCardEffectBonus.get(playerId) ?? 0) - bonus;
            if (next === 0) {
                this.transientCardEffectBonus.delete(playerId);
            } else {
                this.transientCardEffectBonus.set(playerId, next);
            }
        }
    }

    private isRoleSuppressed(playerId: string): boolean {
        const runtime = this.getRuntime(playerId);
        const until = runtime?.roleState?.suppressedUntilRound;
        if (typeof until !== 'number') {
            return false;
        }
        const currentRound = Number.isFinite(this.state.round) ? this.state.round : 1;
        return currentRound <= until;
    }

    private getRandomRoleId(): string | undefined {
        const roleIds = Array.from(this.roleMap.keys());
        if (roleIds.length === 0) {
            return undefined;
        }
        const index = Math.floor(Math.random() * roleIds.length);
        return roleIds[index];
    }

    private assertPlayerTurn(playerId: string): void {
        const currentId = this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        if (currentId !== playerId) {
            throw new Error('Not your turn.');
        }
    }

    private assertBraAvailable(playerId: string, amount = 1): void {
        const remaining = this.state.braTokens[playerId] ?? 0;
        if (remaining < amount) {
            throw new Error('No Bra remaining.');
        }
    }

    private assertPostponeAllowsAction(playerId: string): void {
        void playerId;
    }

    private assertCardInHand(playerId: string, cardId: string): void {
        const hand = this.state.hands[playerId] ?? [];
        if (!hand.includes(cardId)) {
            throw new Error(`Card ${cardId} is not in the player's hand.`);
        }
    }

    private handlePostponeAfterAction(playerId: string): void {
        const runtime = this.getRuntime(playerId);
        if (runtime && !runtime.isDefeated) {
            const bleed = runtime.roleState?.bleedStacks ?? 0;
            if (bleed > 0) {
                const applied = this.applyDamageToPlayer(playerId, playerId, 1, 'status', { label: '出血' });
                this.logEvent({
                    type: 'statusEffect',
                    playerId,
                    effect: 'bleed',
                    amount: Math.max(0, applied ?? 0),
                    kind: 'damage',
                    timestamp: Date.now(),
                });
            }
        }

        const player = this.getPlayer(playerId);
        if (player?.roleId !== 'postpone') {
            return;
        }
        if (!runtime || runtime.isDefeated) {
            return;
        }
        const phase = runtime.roleState?.postponePhase;
        if (phase && phase !== 'idle' && phase !== 'acted') {
            return;
        }
        this.updateRoleState(playerId, (prev) => ({
            ...prev,
            postponePhase: 'acted',
        }));
    }

    private enqueueDeferredTurn(playerId: string, bra: number, allowZero = false): void {
        if (bra <= 0 && !allowZero) {
            return;
        }
        const currentQueue = this.state.deferredTurns ?? [];
        if (currentQueue.some((entry) => entry.playerId === playerId)) {
            return;
        }
        this.state = {
            ...this.state,
            deferredTurns: [...currentQueue, { playerId, bra }],
            updatedAt: Date.now(),
        };
    }

    private popDeferredTurnForPlayer(playerId: string): { playerId: string; bra: number } | null {
        if (!this.state.deferredTurnActive) {
            return null;
        }
        const queue = this.state.deferredTurns ?? [];
        if (queue.length === 0) {
            return null;
        }
        const [next, ...rest] = queue;
        if (next.playerId !== playerId) {
            return null;
        }
        this.state = {
            ...this.state,
            deferredTurns: rest,
            updatedAt: Date.now(),
        };
        return next;
    }

    private beginTurn(playerId?: string): void {
        if (!playerId) {
            return;
        }
        if (!Number.isFinite(this.state.round)) {
            this.state = {
                ...this.state,
                round: 1,
                updatedAt: Date.now(),
            };
        }
        const runtime = this.getRuntime(playerId);
        if (runtime?.isDefeated) {
            const currentIndex = this.state.turnOrder.indexOf(playerId);
            if (this.state.turnOrder.length > 0) {
                const nextIndex = (currentIndex + 1) % this.state.turnOrder.length;
                const nextId = this.state.turnOrder[nextIndex];
                if (nextId && nextId !== playerId) {
                    this.state = {
                        ...this.state,
                        currentTurn: nextIndex,
                        currentPlayerId: nextId,
                    };
                    this.beginTurn(nextId);
                }
            }
            return;
        }

        const deferredEntry = this.popDeferredTurnForPlayer(playerId);
        const isDeferredTurn = Boolean(deferredEntry);
        if (!isDeferredTurn && !this.state.deferredTurnActive) {
            const turnIndex = this.state.turnOrder.indexOf(playerId);
            if (turnIndex !== -1 && this.state.currentTurn !== turnIndex) {
                this.state = {
                    ...this.state,
                    currentTurn: turnIndex,
                    currentPlayerId: playerId,
                    updatedAt: Date.now(),
                };
            }
        }
        if (!isDeferredTurn) {
            this.clearExpiredRoundStatuses();
        }

        const tauntState = this.readRoleState(playerId);
        if (tauntState.tauntUntilNextTurnStart) {
            const applied = tauntState.tauntDefBonusApplied ?? 0;
            if (applied !== 0) {
                this.addStatTokensToPlayer(playerId, 'def', -applied);
            }
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                tauntUntilNextTurnStart: undefined,
                tauntDefBonusApplied: undefined,
            }));
        }

        this.state = {
            ...this.state,
            currentPlayerId: playerId,
        };
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            return {
                ...ensured,
                turnBoosts: {
                    atk: 0,
                    def: 0,
                    spe: 0,
                    bra: 0,
                },
            };
        });
        const baseBra = runtime ? getEffectiveStatValue(runtime, 'bra') : this.getBra(this.getPlayer(playerId)?.roleId);
        const braToSet = deferredEntry ? deferredEntry.bra : Math.max(0, baseBra);
        this.state = setBraTokens(this.state, playerId, braToSet);

        const player = this.getPlayer(playerId);
        if (player?.roleId === 'postpone') {
            if (isDeferredTurn) {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    postponePhase: 'deferred',
                    postponeBra: deferredEntry?.bra ?? prev.postponeBra,
                }));
            } else if (runtime?.roleState?.postponePhase === 'queued') {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    postponePhase: 'queued',
                    postponeBra: prev.postponeBra,
                }));
            } else {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    postponePhase: 'idle',
                    postponeBra: undefined,
                }));
            }
        }

        if (!isDeferredTurn) {
            if (player?.roleId === 'barrage') {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    barrageAttackCount: undefined,
                    barrageTargets: undefined,
                }));
            }
            this.setRoleAttackUsed(playerId, false);
            this.state = drawFromSharedDeck(this.state, playerId, 1);
            this.syncHandStatTokens(playerId);
        }
        this.logEvent({
            type: 'turnStart',
            playerId,
            timestamp: Date.now(),
            deferred: isDeferredTurn,
            label: isDeferredTurn ? '延長ターン開始' : undefined,
            kind: isDeferredTurn ? 'extended' : undefined,
        });
        if (isDeferredTurn && player?.roleId === 'postpone') {
            const stateNow = this.readRoleState(playerId);
            const pendingDamage = stateNow.postponeDeferredDamage ?? 0;
            if (pendingDamage > 0) {
                const attackerId = stateNow.postponeDeferredAttackerId ?? playerId;
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    postponeDeferredDamage: undefined,
                    postponeDeferredAttackerId: undefined,
                }));
                this.applyDamageToPlayer(attackerId, playerId, pendingDamage, 'other', {
                    allowPrompt: false,
                    label: '延期（繰り越しダメージ）',
                });
                const runtimeAfter = this.getRuntime(playerId);
                if (runtimeAfter?.isDefeated) {
                    return;
                }
            }
        }
        if (!isDeferredTurn) {
            const skipTurn = this.applyRoleStartOfTurnEffects(playerId);
            if (skipTurn) {
                this.endTurn(playerId);
            }
        }
    }

    private clearExpiredRoundStatuses(): void {
        const currentRound = this.state.round;
        if (this.state.turnOrderMode) {
            const expiresAt = this.state.turnOrderModeUntilRound ?? currentRound;
            if (currentRound > expiresAt) {
                this.state = {
                    ...this.state,
                    turnOrderMode: undefined,
                    turnOrderModeUntilRound: undefined,
                    updatedAt: Date.now(),
                };
                this.reorderTurnOrder('descendingSpe');
            } else {
                this.reorderTurnOrder(this.state.turnOrderMode);
            }
        }
        this.state.players.forEach((player) => {
            const runtime = this.getRuntime(player.id);
            if (!runtime || runtime.isDefeated) {
                return;
            }
            const roleState = runtime.roleState;
            if (roleState?.suppressedUntilRound && currentRound > roleState.suppressedUntilRound) {
                this.updateRoleState(player.id, (prev) => ({
                    ...prev,
                    suppressedUntilRound: undefined,
                }));
            }
            if (!roleState?.stunUntilRound) {
                return;
            }
            if (currentRound <= roleState.stunUntilRound) {
                return;
            }
            const penalty = roleState.stunSpePenalty ?? 0;
            if (penalty !== 0) {
                this.addStatTokensToPlayer(player.id, 'spe', -penalty);
            }
            this.updateRoleState(player.id, (prev) => ({
                ...prev,
                stunUntilRound: undefined,
                stunOriginalSpe: undefined,
                stunSpePenalty: undefined,
            }));
        });
    }

    private reclaimCardFromDiscard(cardId: string): void {
        const discard = [...this.state.sharedDiscard];
        const index = discard.lastIndexOf(cardId);
        if (index === -1) {
            return;
        }
        discard.splice(index, 1);
        this.state = {
            ...this.state,
            sharedDiscard: discard,
            updatedAt: Date.now(),
        };
    }

    private applyRoleStartOfTurnEffects(playerId: string): boolean {
        const runtime = this.getRuntime(playerId);
        if (!runtime) {
            return false;
        }
        let skipTurn = false;
        const roleState = runtime.roleState ?? {};
        const updated: RoleRuntimeState = { ...roleState };

        const player = this.getPlayer(playerId);
        const hasLightningRod = runtime.installs.some((install) => install.cardId === 'lightning_rod');
        const hasBloodArmor = runtime.installs.some((install) => install.cardId === 'blood_armor');
        const dischargeWithRod = player?.roleId === 'discharge' && hasLightningRod && !this.isRoleSuppressed(playerId);

        if (dischargeWithRod) {
            let total = updated.shockTokens ?? 0;
            this.state.players.forEach((p) => {
                if (p.id === playerId) return;
                const otherRuntime = this.getRuntime(p.id);
                const otherTokens = otherRuntime?.roleState?.shockTokens ?? 0;
                if (!otherTokens) return;
                total += otherTokens;
                this.updateRoleState(p.id, (prev) => ({
                    ...prev,
                    shockTokens: undefined,
                }));
                this.reconcileLightningRodAtkBonus(p.id);
            });
            updated.shockTokens = total > 0 ? total : undefined;
        }

        if (hasLightningRod) {
            updated.shockTokens = (updated.shockTokens ?? 0) + 1;
        }

        if (hasBloodArmor) {
            updated.bleedStacks = (updated.bleedStacks ?? 0) + 1;
            this.logEvent({
                type: 'roleAction',
                playerId,
                actionId: 'equip_blood_armor_bleed',
                description: '血の鎧: 出血+1',
                timestamp: Date.now(),
            });
        }

        const currentBra = this.state.braTokens[playerId] ?? 0;
        const shockTokens = updated.shockTokens ?? 0;
        if (!dischargeWithRod && shockTokens >= 5 && currentBra > 0) {
            const penalty = Math.min(Math.floor(shockTokens / 5), currentBra);
            if (penalty > 0) {
                this.state = setBraTokens(this.state, playerId, Math.max(0, currentBra - penalty));
                updated.shockTokens = shockTokens - penalty * 5;
            }
        }

        const pendingPenalty = updated.pendingBraPenalty ?? 0;
        if (pendingPenalty > 0) {
            const braAfterShock = this.state.braTokens[playerId] ?? 0;
            const penalty = Math.min(pendingPenalty, braAfterShock);
            if (penalty > 0) {
                this.state = setBraTokens(this.state, playerId, Math.max(0, braAfterShock - penalty));
            }
            updated.pendingBraPenalty = 0;
        }

        if (updated.surgeryPhase === 'immobilize') {
            skipTurn = true;
            updated.surgeryPhase = 'heal';
            updated.scheduledHealAmount = updated.scheduledHealAmount ?? 15;
        } else if (updated.surgeryPhase === 'heal') {
            const healAmount = updated.scheduledHealAmount ?? 15;
            this.applyHealToPlayer(playerId, healAmount);
            updated.surgeryPhase = undefined;
            updated.scheduledHealAmount = undefined;
        }

        this.updateRoleState(playerId, () => {
            const cleaned: RoleRuntimeState = {};
            Object.entries(updated).forEach(([key, value]) => {
                if (value !== undefined && value !== 0 && value !== null) {
                    (cleaned as Record<string, unknown>)[key] = value;
                }
            });
            return cleaned;
        });

        this.reconcileLightningRodAtkBonus(playerId);

        return skipTurn;
    }

    private handleRoleEndTurnEffects(playerId: string): void {
        const player = this.getPlayer(playerId);
        if (!player?.roleId) {
            return;
        }
        const roleState = this.readRoleState(playerId);
        const timedBomb = roleState.timedBomb;
        if ((roleState.adrenalineTurnsRemaining ?? 0) > 0) {
            const remaining = (roleState.adrenalineTurnsRemaining ?? 0) - 1;
            if (remaining <= 0) {
                const buffAtk = roleState.adrenalineBuff?.atk ?? 0;
                const buffSpe = roleState.adrenalineBuff?.spe ?? 0;
                if (buffAtk !== 0) {
                    this.addStatTokensToPlayer(playerId, 'atk', -buffAtk);
                }
                if (buffSpe !== 0) {
                    this.addStatTokensToPlayer(playerId, 'spe', -buffSpe);
                }
                const reboundAtk = roleState.adrenalineRebound?.atk ?? 0;
                const reboundSpe = roleState.adrenalineRebound?.spe ?? 0;
                if (reboundAtk !== 0) {
                    this.addStatTokensToPlayer(playerId, 'atk', reboundAtk);
                }
                if (reboundSpe !== 0) {
                    this.addStatTokensToPlayer(playerId, 'spe', reboundSpe);
                }
                this.logEvent({
                    type: 'roleAction',
                    playerId,
                    actionId: 'adrenaline_rebound',
                    description: `アドレナリン反動: 追加Spe${reboundSpe}, 追加Atk${reboundAtk}`,
                    timestamp: Date.now(),
                });
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    adrenalineTurnsRemaining: undefined,
                    adrenalineBuff: undefined,
                    adrenalineRebound: undefined,
                    adrenalineReboundApplied: { atk: reboundAtk, spe: reboundSpe },
                }));
            } else {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    adrenalineTurnsRemaining: remaining,
                }));
            }
        }

        const dizzyTurns = roleState.dizzyTurns ?? 0;
        if (dizzyTurns > 0) {
            const next = dizzyTurns - 1;
            this.updateRoleState(playerId, (prev) => ({
                ...prev,
                dizzyTurns: next > 0 ? next : undefined,
            }));
        }

        if (player.roleId === 'discharge' && !this.isRoleSuppressed(playerId)) {
            const remaining = this.state.braTokens[playerId] ?? 0;
            if (remaining > 0) {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    chargeTokens: (prev.chargeTokens ?? 0) + remaining,
                }));
            }
        }

        if (timedBomb && typeof timedBomb.count === 'number' && Number.isFinite(timedBomb.count)) {
            const current = Math.max(0, Math.floor(timedBomb.count));
            const next = current - 1;
            if (next <= 0) {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    timedBomb: undefined,
                }));
                const applied = this.applyDamageToPlayer(
                    timedBomb.sourcePlayerId,
                    playerId,
                    10,
                    'ability',
                    {
                        abilityId: 'bomb_timed_bomb',
                        label: '時限爆弾',
                    }
                );
                if (typeof applied === 'number' && applied > 0) {
                    this.logEvent({
                        type: 'abilityDamage',
                        playerId,
                        sourceAbilityId: 'bomb_timed_bomb',
                        sourcePlayerId: timedBomb.sourcePlayerId,
                        amount: applied,
                        timestamp: Date.now(),
                    });
                }
            } else {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    timedBomb: prev.timedBomb ? { ...prev.timedBomb, count: next } : prev.timedBomb,
                }));
            }
        }

        const runtime = this.getRuntime(playerId);
        const burn = runtime?.roleState?.burnStacks ?? 0;
        if (burn > 0) {
            const selfFlame = player.roleId === 'flame' && !this.isRoleSuppressed(playerId);
            if (selfFlame) {
                this.applyHealToPlayer(playerId, burn);
                this.logEvent({
                    type: 'statusEffect',
                    playerId,
                    effect: 'burn',
                    amount: burn,
                    kind: 'heal',
                    timestamp: Date.now(),
                });
            } else {
                const applied = this.applyDamageToPlayer(playerId, playerId, burn, 'status', { label: '炎上' });
                this.logEvent({
                    type: 'statusEffect',
                    playerId,
                    effect: 'burn',
                    amount: Math.max(0, applied ?? 0),
                    kind: 'damage',
                    timestamp: Date.now(),
                });
            }
            this.updateRoleState(playerId, (prev) => {
                const next = Math.max(0, (prev.burnStacks ?? 0) - 1);
                return next > 0 ? { ...prev, burnStacks: next } : { ...prev, burnStacks: undefined };
            });
        }

        const refreshed = this.getRuntime(playerId);
        if (!refreshed || refreshed.isDefeated) {
            return;
        }

        const bleed = refreshed.roleState?.bleedStacks ?? 0;
        if (bleed > 0) {
            const applied = this.applyDamageToPlayer(playerId, playerId, 1, 'status', { label: '出血' });
            this.logEvent({
                type: 'statusEffect',
                playerId,
                effect: 'bleed',
                amount: Math.max(0, applied ?? 0),
                kind: 'damage',
                timestamp: Date.now(),
            });
            this.updateRoleState(playerId, (prev) => {
                const next = Math.max(0, (prev.bleedStacks ?? 0) - 1);
                return next > 0 ? { ...prev, bleedStacks: next } : { ...prev, bleedStacks: undefined };
            });
        }
    }
}

export default GameEngine;
