import { randomUUID } from 'node:crypto';
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
    advanceTurnState,
    setBraTokens,
    consumeBra,
    setPlayerRuntimeState,
    updatePlayerRuntimeState,
} from '../../shared/utils/gameState';
import type {
    AddStatTokenEffect,
    CardDefinition,
    CardEffect,
    CardTarget,
    CombatStatKey,
    DealDamageEffect,
    DiscardAllHandEffect,
    DoubleBaseStatEffect,
    EffectCondition,
    GameState,
    GameLogEntry,
    MatchSummary,
    Player,
    PlayerRuntimeState,
    Role,
    RoleParams,
    RoleAbility,
    RoleAbilitySpendTokenChoice,
    RoleAbilityThreshold,
    RoleAbilityValue,
    RoleAbilityValueSource,
    RoleRuntimeState,
    StatKey,
} from '../../shared/types';
import { getRolesCatalog, getCardsCatalog } from '../data/catalog';
import {
    createRuntimeStateFromRole,
    evaluateDamageFormula,
    evaluateValueFormula,
    getEffectiveStatValue,
    mutateBaseStat,
} from './effectUtils';
import { getRoleActions } from '../../shared/roleActions';

export interface PlayCardOptions {
    targets?: string[];
    choices?: Record<string, string | number | boolean | number[] | string[]>;
}

export interface RoleActionOptions {
    targetId?: string;
    choices?: Record<string, string | number | boolean>;
}

type AbilityTriggerResult = {
    damageReduction?: number;
};

interface RoleAbilityContext {
    attackerId?: string;
    targetId?: string;
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

    constructor(matchId: string, initialPlayers: Player[] = []) {
        this.state = createInitialGameState(matchId, initialPlayers);
        this.roleMap = new Map(getRolesCatalog().map((role) => [role.id, role]));
        this.cardMap = new Map(getCardsCatalog().map((card) => [card.id, card]));
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
        if (this.state.status === 'inProgress') {
            this.assertPlayerTurn(playerId);
        }
        this.state = drawFromSharedDeck(this.state, playerId, count);
    }

    playCard(playerId: string, cardId: string, options?: PlayCardOptions): void {
        this.assertPlayerTurn(playerId);
        this.assertBraAvailable(playerId);
        this.assertCardInHand(playerId, cardId);
        const card = this.cardMap.get(cardId);
        if (!card) {
            throw new Error(`Card ${cardId} is not defined.`);
        }
        this.ensureRuntimeExists(playerId);
        this.state = playCardFromHand(this.state, playerId, cardId);
        if (card.kind === 'install') {
            this.reclaimCardFromDiscard(cardId);
            this.installCard(playerId, card);
            this.resolveCardEffects(playerId, card, 'onEquip', options);
        } else {
            this.resolveCardEffects(playerId, card, 'onPlay', options);
        }
        this.logEvent({ type: 'cardPlay', playerId, cardId, targets: options?.targets, timestamp: Date.now() });
        this.state = consumeBra(this.state, playerId, 1);
    }

    roleAttack(playerId: string, targetId: string, options?: { struggle?: boolean }): void {
        this.assertPlayerTurn(playerId);
        if (!targetId) {
            throw new Error('攻撃対象を選択してください。');
        }
        if (playerId === targetId) {
            throw new Error('自分自身は対象にできません。');
        }
        const isStruggle = Boolean(options?.struggle);
        const currentBra = this.state.braTokens[playerId] ?? 0;
        if (!isStruggle && currentBra <= 0) {
            throw new Error('Braが足りません。');
        }
        if (isStruggle && currentBra > 0) {
            throw new Error('Braが残っているため悪あがきはできません。');
        }
        if (this.state.roleAttackUsed[playerId]) {
            throw new Error('このターンのロール攻撃は既に使用済みです。');
        }

        const attackerRuntime = this.ensureRuntimeExists(playerId);
        const defenderRuntime = this.ensureRuntimeExists(targetId);
        if (defenderRuntime.isDefeated) {
            throw new Error('対象プレイヤーは既に倒れています。');
        }

        const atk = getEffectiveStatValue(attackerRuntime, 'atk');
        const def = getEffectiveStatValue(defenderRuntime, 'def');
        const damage = Math.max(1, atk - def);

        const inflicted = this.applyDamageToPlayer(playerId, targetId, damage);
        if (!isStruggle) {
            this.state = consumeBra(this.state, playerId, 1);
        }
        this.setRoleAttackUsed(playerId, true);
        let selfInflicted: number | undefined;

        if (isStruggle) {
            const selfDamage = Math.max(1, Math.floor(attackerRuntime.maxHp / 4));
            selfInflicted = this.applyDamageToPlayer(playerId, playerId, selfDamage);
        }

        this.logEvent({
            type: 'roleAttack',
            attackerId: playerId,
            targetId,
            damage: inflicted,
            isStruggle,
            selfInflicted,
            timestamp: Date.now(),
        });
        this.triggerRoleAbilities('afterRoleAttack', playerId, {
            targetId,
            damageDealt: inflicted,
        });

        if (isStruggle) {
            const runtimeAfter = this.getRuntime(playerId);
            if (runtimeAfter && !runtimeAfter.isDefeated) {
                this.endTurn(playerId);
            }
        }
    }

    roleAction(playerId: string, actionId: string, options?: RoleActionOptions): void {
        this.assertPlayerTurn(playerId);
        if (!actionId) {
            throw new Error('アクションIDを指定してください。');
        }
        this.performRoleAction(playerId, actionId, options);
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
        switch (player.roleId) {
            case 'discharge':
                this.executeDischargeAction(playerId, actionId);
                break;
            case 'doctor':
                this.executeDoctorAction(playerId, actionId, targetId, options?.choices);
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
            description: definition.label,
            timestamp: Date.now(),
        });
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
            this.state = setBraTokens(this.state, playerId, this.getBra(this.getPlayer(playerId)?.roleId));
            this.state = drawFromSharedDeck(this.state, playerId, 3);
        });

        this.state = setMatchStatus(this.state, 'inProgress');
        this.beginTurn(order[0]);
    }

    end(winnerId?: string): void {
        this.state = setMatchStatus(this.state, 'finished', winnerId);
    }

    endTurn(playerId: string): void {
        this.assertPlayerTurn(playerId);
        this.handleRoleEndTurnEffects(playerId);
        this.state = advanceTurnState(this.state);
        const nextPlayerId = this.state.currentPlayerId ?? this.state.turnOrder[this.state.currentTurn];
        this.beginTurn(nextPlayerId);
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
        const next = { ...entry, timestamp: entry.timestamp ?? Date.now() };
        const logs = [...this.state.logs, next];
        const maxEntries = 100;
        const trimmed = logs.length > maxEntries ? logs.slice(logs.length - maxEntries) : logs;
        this.state = {
            ...this.state,
            logs: trimmed,
            updatedAt: Date.now(),
        };
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
                this.applyDealDamageEffect(playerId, effect, options);
                break;
            case 'addStatToken':
                this.applyAddStatTokenEffect(playerId, effect, options);
                break;
            case 'discardAllHand':
                this.applyDiscardAllHandEffect(playerId, effect, options);
                break;
            case 'doubleBaseStat':
                this.applyDoubleBaseStatEffect(playerId, effect, options);
                break;
            default:
                break;
        }
    }

    private applyDealDamageEffect(playerId: string, effect: DealDamageEffect, options?: PlayCardOptions): void {
        const actorRuntime = this.getRuntime(playerId);
        const baseValue =
            typeof effect.value === 'number'
                ? effect.value
                : effect.formula
                ? evaluateDamageFormula(effect.formula, actorRuntime)
                : 0;
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const targetRuntime = this.getRuntime(targetId);
            if (!targetRuntime) {
                return;
            }
            let damage = baseValue;
            if (effect.defApplied && !effect.ignoreDef) {
                damage -= getEffectiveStatValue(targetRuntime, 'def');
            }
            if (damage <= 0) {
                return;
            }
            this.applyDamageToPlayer(playerId, targetId, damage);
        });
    }

    private applyAddStatTokenEffect(playerId: string, effect: AddStatTokenEffect, options?: PlayCardOptions): void {
        const actorRuntime = this.getRuntime(playerId);
        const value =
            typeof effect.value === 'number'
                ? effect.value
                : effect.valueFormula
                ? evaluateValueFormula(effect.valueFormula, actorRuntime)
                : 0;
        if (value === 0) {
            return;
        }
        const targets = this.resolveTargets(effect.target ?? 'self', playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            this.addStatTokensToPlayer(targetId, effect.stat, value);
        });
    }

    private applyDiscardAllHandEffect(playerId: string, effect: DiscardAllHandEffect, options?: PlayCardOptions): void {
        const targets = this.resolveTargets(effect.target, playerId, options?.targets);
        targets.forEach((targetId) => {
            if (!this.isEffectConditionSatisfied(effect.condition, playerId, targetId)) {
                return;
            }
            const hand = this.state.hands[targetId] ?? [];
            if (hand.length === 0) {
                return;
            }
            this.state = {
                ...this.state,
                hands: {
                    ...this.state.hands,
                    [targetId]: [],
                },
                sharedDiscard: [...this.state.sharedDiscard, ...hand],
                updatedAt: Date.now(),
            };
        });
    }

private applyDoubleBaseStatEffect(playerId: string, effect: DoubleBaseStatEffect, options?: PlayCardOptions): void {

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

    if (!validChoices.includes(chosenStat)) {

        throw new Error('このカードでは選択できないステータスです。');

    }

    const runtime = this.ensureRuntimeExists(playerId);

    const baseValue = runtime.baseStats[chosenStat] ?? 0;

    const targetStat = chosenStat as CombatStatKey | 'bra';

    this.addStatTokensToPlayer(playerId, targetStat, baseValue);

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

        return true;
    }

    private applyDamageToPlayer(attackerId: string, targetId: string, amount: number): number {
        if (amount <= 0) {
            return 0;
        }
        this.ensureRuntimeExists(targetId);
        let runtime = this.getRuntime(targetId);
        if (!runtime) {
            return 0;
        }
        const resolution = this.handleBeforeDamageEffects(targetId, amount, attackerId);
        if (resolution.prevented || resolution.amount <= 0) {
            return 0;
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

        const damageToHp = Math.max(0, prevHp - nextHp);
        if (damageToHp > 0) {
            this.handleAfterDamageEvents(attackerId, targetId, damageToHp);
        }
        if (nextHp <= 0) {
            this.handlePlayerDefeated(targetId, attackerId);
        }

        return damageToHp > 0 ? damageToHp : 0;
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

    private handleBeforeDamageEffects(targetId: string, amount: number, attackerId?: string): { prevented: boolean; amount: number } {
        const runtime = this.getRuntime(targetId);
        if (!runtime) {
            return { prevented: false, amount };
        }

        let pendingAmount = amount;
        if (runtime.installs.length > 0) {
            for (const install of runtime.installs) {
                const card = this.cardMap.get(install.cardId);
                if (!card) {
                    continue;
                }
                for (const effect of card.effects) {
                    if (effect.trigger !== 'beforeDamageTaken') {
                        continue;
                    }
                    if (effect.type === 'thresholdPrevent') {
                        const satisfies =
                            (effect.operator === '<=' && pendingAmount <= effect.threshold) ||
                            (effect.operator === '>=' && pendingAmount >= effect.threshold);
                        if (!satisfies) {
                            continue;
                        }
                        if (effect.sacrificeSelf) {
                            this.destroyInstall(targetId, install.instanceId);
                        }
                        if (effect.preventAll) {
                            return { prevented: true, amount: 0 };
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
                        return { prevented: true, amount: 0 };
                    }
                }
            }
        }

        const adjusted = this.applyBeforeDamageAbilities(targetId, attackerId, pendingAmount);
        return { prevented: adjusted <= 0, amount: Math.max(0, adjusted) };
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
        }
    }

    private installCard(playerId: string, card: CardDefinition): void {
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
            return {
                ...next,
                installs: [...next.installs, { cardId: card.id, instanceId: randomUUID() }],
            };
        });
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
        let before: number | undefined;
        let after: number | undefined;
        this.state = updatePlayerRuntimeState(this.state, playerId, (runtime) => {
            const ensured = runtime ?? this.ensureRuntimeExists(playerId);
            before = getEffectiveStatValue(ensured, stat);
            const nextValue = Math.max(0, (ensured.statTokens[stat] ?? 0) + delta);
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
        const condition = ability.condition;
        if (!condition) {
            return true;
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
                    this.applyDamageToPlayer(ownerId, ownerId, value);
                }
            } else if ('dealDamageToSource' in action) {
                const target = targetId ?? context.attackerId;
                const value = this.resolveAbilityValue(action.dealDamageToSource.value, context);
                if (target && value > 0) {
                    this.applyDamageToPlayer(ownerId, target, value);
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

    private applyBeforeDamageAbilities(targetId: string, attackerId: string | undefined, amount: number): number {
        let remaining = amount;
        if (remaining <= 0) {
            return 0;
        }
        const abilities = this.getRoleAbilities(targetId).filter((ability) => ability.trigger === 'beforeDamageTaken');
        if (abilities.length === 0) {
            return remaining;
        }
        abilities.forEach((ability) => {
            if (remaining <= 0) {
                return;
            }
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
                remaining = Math.max(0, remaining - result.damageReduction);
            }
            abilityContext.damageAmount = remaining;
        });
        return remaining;
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

    private handleAfterDamageEvents(attackerId: string, targetId: string, amount: number): void {
        this.triggerRoleAbilities('afterDamageTaken', targetId, {
            attackerId,
            targetId,
            damageAmount: amount,
            damageTaken: amount,
        });
        if (attackerId !== targetId) {
            this.triggerRoleAbilities('afterDealingDamage', attackerId, {
                targetId,
                damageAmount: amount,
                damageDealt: amount,
            });
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

    private assertCardInHand(playerId: string, cardId: string): void {
        const hand = this.state.hands[playerId] ?? [];
        if (!hand.includes(cardId)) {
            throw new Error(`Card ${cardId} is not in the player's hand.`);
        }
    }

    private beginTurn(playerId?: string): void {
        if (!playerId) {
            return;
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

        this.state = {
            ...this.state,
            currentPlayerId: playerId,
        };
        this.state = setBraTokens(this.state, playerId, this.getBra(this.getPlayer(playerId)?.roleId));
        this.setRoleAttackUsed(playerId, false);
        this.state = drawFromSharedDeck(this.state, playerId, 1);
        this.logEvent({ type: 'turnStart', playerId, timestamp: Date.now() });
        const skipTurn = this.applyRoleStartOfTurnEffects(playerId);
        if (skipTurn) {
            this.endTurn(playerId);
        }
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

        const currentBra = this.state.braTokens[playerId] ?? 0;
        const shockTokens = updated.shockTokens ?? 0;
        if (shockTokens >= 5 && currentBra > 0) {
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

        return skipTurn;
    }

    private handleRoleEndTurnEffects(playerId: string): void {
        const player = this.getPlayer(playerId);
        if (!player?.roleId) {
            return;
        }
        if (player.roleId === 'discharge') {
            const remaining = this.state.braTokens[playerId] ?? 0;
            if (remaining > 0) {
                this.updateRoleState(playerId, (prev) => ({
                    ...prev,
                    chargeTokens: (prev.chargeTokens ?? 0) + remaining,
                }));
            }
        }
    }
}

export default GameEngine;
