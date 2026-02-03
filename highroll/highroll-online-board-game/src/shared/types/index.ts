export type GameStatus = 'waiting' | 'inProgress' | 'finished';

export type StatKey = 'hp' | 'atk' | 'def' | 'spe' | 'bra';
export type CombatStatKey = Exclude<StatKey, 'hp'>;
export type ThresholdOperator = '<=' | '>=';

export interface RoleParams {
    hp: number;
    atk: number;
    def: number;
    spe: number;
    bra: number;
}

export interface Role {
    id: string;
    name: string;
    params: RoleParams;
    text?: string;
    tags?: string[];
    abilities?: RoleAbility[];
    roleActions?: RoleActionDefinition[];
    [key: string]: unknown;
}

export type RoleAbilityTrigger =
    | 'afterRoleAttack'
    | 'afterDealingDamage'
    | 'afterDamageTaken'
    | 'beforeDamageTaken'
    | 'onStatTotalChanged'
    | 'onAlivePlayersChanged'
    | 'onKill';

export type RoleAbilitySource = 'self' | 'attacker';

export interface RoleAbilityThreshold {
    from: number;
    step?: number;
}

export interface RoleAbilityCondition {
    stat?: StatKey;
    threshold?: RoleAbilityThreshold;
    direction?: 'up' | 'down';
    alivePlayers?: number;
    sources?: DamageSource[];
}

export type RoleAbilityValueSource = 'damageAmount' | 'damageTaken' | 'damageDealt' | 'spentStatTokens';

export interface RoleAbilityValueFromContext {
    from: RoleAbilityValueSource;
}

export interface RoleAbilityRatioValue {
    ratioOf: RoleAbilityValueSource;
    ratio: number;
    round?: 'floor' | 'ceil' | 'round';
}

export type RoleAbilityValue = number | RoleAbilityValueFromContext | RoleAbilityRatioValue;

export interface RoleAbilitySpendTokenChoice {
    spendStatToken: {
        stat: CombatStatKey | 'bra';
        min?: number;
        max: number | 'any';
    };
}

export type RoleAbilityPlayerChoice = RoleAbilitySpendTokenChoice;

export interface RoleAbilityActionAddStatToken {
    addStatToken: {
        stat: CombatStatKey | 'bra';
        value: RoleAbilityValue | number;
    };
}

export interface RoleAbilityActionReduceDamage {
    reduceIncomingDamageBy: RoleAbilityValue | number | 'spent';
}

export interface RoleAbilityActionSetMaxHp {
    setMaxHp: number;
}

export interface RoleAbilityActionSetHp {
    setHp: {
        min?: number;
        max?: number;
        set?: number;
    };
}

export interface RoleAbilityActionSelfDamage {
    selfDamage: {
        value: RoleAbilityValue | number;
    };
}

export interface RoleAbilityActionDealDamageToSource {
    dealDamageToSource: {
        value: RoleAbilityValue | number;
    };
}

export interface RoleStateBurn {
    burnStacks?: number;
}

export type RoleAbilityAction =
    | RoleAbilityActionAddStatToken
    | RoleAbilityActionReduceDamage
    | RoleAbilityActionSetMaxHp
    | RoleAbilityActionSetHp
    | RoleAbilityActionSelfDamage
    | RoleAbilityActionDealDamageToSource;

export interface RoleAbility {
    id: string;
    trigger: RoleAbilityTrigger;
    source?: RoleAbilitySource;
    condition?: RoleAbilityCondition;
    playerChoice?: RoleAbilityPlayerChoice;
    actions: RoleAbilityAction[];
    text?: string;
}

export interface RoleActionChoice {
    key: string;
    label: string;
    type: 'stat';
    options?: StatKey[];
}

export type RoleActionTargeting = 'any' | 'others' | 'self';

export interface RoleActionDefinition {
    id: string;
    label: string;
    description?: string;
    costBra?: number;
    requiresTarget?: RoleActionTargeting;
    choices?: RoleActionChoice[];
}

export interface RolesResponse {
    roles: Role[];
}

export interface StatModifierMap {
    atk: number;
    def: number;
    spe: number;
    bra: number;
}

export interface PlayerInstallState {
    cardId: string;
    instanceId: string;
}

export interface PlayerRuntimeState {
    playerId: string;
    roleId?: string;
    hp: number;
    maxHp: number;
    tempHp: number;
    baseStats: RoleParams;
    statTokens: StatModifierMap;
    turnBoosts: StatModifierMap;
    installs: PlayerInstallState[];
    isDefeated?: boolean;
    roleState?: RoleRuntimeState;
}

export interface RoleRuntimeState {
    chargeTokens?: number;
    shockTokens?: number;
    pendingBraPenalty?: number;
    surgeryPhase?: 'immobilize' | 'heal';
    scheduledHealAmount?: number;
    burnStacks?: number;
    bleedStacks?: number;
    postponePhase?: 'idle' | 'acted' | 'queued' | 'deferred';
    postponeBra?: number;
    postponeDeferredDamage?: number;
    postponeDeferredAttackerId?: string;
    cardEffectMultiplier?: number;
    cardEffectBonus?: number;
    suppressedUntilRound?: number;
    barrageAttackCount?: number;
    barrageTargets?: string[];
    pendingStatDebuff?: {
        stat: CombatStatKey;
        value: number;
    };
    stunUntilRound?: number;
    stunOriginalSpe?: number;
    stunSpePenalty?: number;
    handStatTokens?: StatModifierMap;
    adrenalineTurnsRemaining?: number;
    adrenalineBuff?: Pick<StatModifierMap, 'atk' | 'spe'>;
    adrenalineRebound?: Pick<StatModifierMap, 'atk' | 'spe'>;
    adrenalineReboundApplied?: Pick<StatModifierMap, 'atk' | 'spe'>;
    dizzyTurns?: number;
    tauntUntilNextTurnStart?: boolean;
    tauntDefBonusApplied?: number;
    sealedHand?: Array<{
        index: number;
        cardId: string;
    }>;
    cursedHand?: Array<{
        index: number;
        cardId: string;
        curseId: CurseId;
    }>;
    bloodPatternHand?: Array<{
        index: number;
        cardId: string;
    }>;
    lightningRodAtkBonusApplied?: number;
    nextRoleAttackAtkBonus?: number;
    nextRoleAttackIgnoreDefense?: boolean;
    timedBomb?: {
        sourcePlayerId: string;
        count: number;
    };
}

export type CurseId =
    | 'weakness' // 手札にある間 追加Def-1
    | 'force' // 手札にある間 可能ならこのカードしか使用できない
    | 'decay' // 使用時 効果値-2
    | 'collapse' // ターン終了時に捨て札
    | 'cost' // 使用時 固定2ダメージ（自傷）
    | 'rebuttal' // 使用時 手札1枚を選んで捨てる
    | 'enrage' // 使用時 Bra消費+1
    | 'resonate' // 自分以外に使用するとき自分にも同効果
    | 'silence' // 使用後 ターン強制終了
    | 'wear'; // 使用時 追加Atk-1

export interface BoardState {
    playerStates: Record<string, PlayerRuntimeState>;
}

export interface Player {
    id: string;
    name: string;
    score: number;
    isReady: boolean;
    joinedAt: number;
    roleId?: string;
}

export interface GameState {
    id: string;
    players: Player[];
    currentTurn: number;
    round: number;
    status: GameStatus;
    winnerId?: string;
    board: BoardState;
    createdAt: number;
    updatedAt: number;
    deckId?: string;
    sharedDeck: string[];
    sharedDiscard: string[];
    hands: Record<string, string[]>;
    braTokens: Record<string, number>;
    roleAttackUsed: Record<string, boolean>;
    logs: GameLogEntry[];
    currentPlayerId?: string;
    turnOrder: string[];
    turnOrderMode?: ModifyTurnOrderEffect['mode'];
    turnOrderModeUntilRound?: number;
    roundTurnsTaken?: number;
    deferredTurns: Array<{ playerId: string; bra: number }>;
    deferredTurnActive?: boolean;
    pendingPrompt?: PendingPrompt;
    nextRoundPriority?: { playerId: string; applyOnRound: number };
}

export type GameLogEntry =
    | { type: 'roundStart'; timestamp: number; round?: number }
    | {
          type: 'turnStart';
          playerId: string;
          timestamp: number;
          round?: number;
          deferred?: boolean;
          label?: string;
          kind?: 'normal' | 'extended';
      }
    | {
          type: 'abilityDamage';
          playerId: string;
          sourceAbilityId: string;
          amount: number;
          sourcePlayerId?: string;
          timestamp: number;
          round?: number;
      }
    | { type: 'cardPlay'; playerId: string; cardId: string; targets?: string[]; timestamp: number; round?: number }
    | {
          type: 'cardEffect';
          playerId: string;
          cardId: string;
          kind:
              | 'draw'
              | 'heal'
              | 'adjustBra'
              | 'addStatToken'
              | 'applyStatus'
              | 'discard'
              | 'sealHand';
          targetId?: string;
          stat?: StatKey;
          amount?: number;
          count?: number;
          status?: 'burn' | 'bleed' | 'shock' | 'stun' | 'dizzy';
          note?: string;
          timestamp: number;
          round?: number;
      }
    | {
          type: 'roleAttack';
          attackerId: string;
          targetId: string;
          damage: number;
          isStruggle?: boolean;
          selfInflicted?: number;
          timestamp: number;
          round?: number;
      }
    | {
          type: 'roleAttackHit';
          attackerId: string;
          targetId: string;
          damage: number;
          hitIndex: number;
          totalHits: number;
          timestamp: number;
          round?: number;
      }
    | { type: 'playerDefeated'; playerId: string; timestamp: number; round?: number }
    | { type: 'roleAction'; playerId: string; actionId: string; targetId?: string; description?: string; timestamp: number; round?: number }
    | {
          type: 'damageResolved';
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
          timestamp: number;
          round?: number;
      }
    | {
          type: 'damageReduced';
          playerId: string;
          amount: number;
          source: 'install' | 'ability';
          cardId?: string;
          abilityId?: string;
          reason?: string;
          timestamp: number;
          round?: number;
      }
    | {
          type: 'statusEffect';
          playerId: string;
          effect: 'burn' | 'bleed';
          amount: number;
          kind: 'damage' | 'heal';
          timestamp: number;
          round?: number;
      };

export type CardTrigger = 'onPlay' | 'onEquip' | 'beforeDamageTaken' | 'afterRoleAttack' | 'inHand';

export type CardTarget = 'self' | 'chosen_enemy' | 'chosen_player' | 'all_players' | 'defender';

export interface EffectCondition {
    roleId?: string;
    targetHandCountAtLeast?: number;
    hpEqualsMax?: boolean;
    fatalIfApplied?: boolean;
    lastEffect?: string;
    discardedCountAtLeast?: number;
    hpAtMostPercent?: number;
}

export interface ValueFormulaPerN {
    type: 'perN';
    stat: StatKey;
    n: number;
    round?: 'floor' | 'ceil' | 'round';
}

export interface DamageFormulaSelfStatHalf {
    type: 'selfStatHalf';
    stat: CombatStatKey;
    round?: 'floor' | 'ceil' | 'round';
}

export type ValueFormula = ValueFormulaPerN;
export type DamageFormula = DamageFormulaSelfStatHalf;

interface BaseCardEffect {
    trigger: CardTrigger;
    condition?: EffectCondition;
    optional?: boolean;
}

export interface DealDamageEffect extends BaseCardEffect {
    type: 'dealDamage';
    target: CardTarget;
    value?: number;
    formula?: DamageFormula;
    fixed?: boolean;
    defApplied?: boolean;
    ignoreDef?: boolean;
    contact?: boolean;
}

export interface DrawCardsEffect extends BaseCardEffect {
    type: 'drawCards';
    count: number;
    target?: CardTarget;
}

export interface AdjustBraEffect extends BaseCardEffect {
    type: 'adjustBra';
    value: number;
    target?: CardTarget;
}

export interface ThresholdPreventEffect extends BaseCardEffect {
    type: 'thresholdPrevent';
    operator: ThresholdOperator;
    threshold: number;
    preventAll: boolean;
    sacrificeSelf?: boolean;
    playerChoice?: boolean;
    sources?: DamageSource[];
}

export interface DamageInterceptEffect extends BaseCardEffect {
    type: 'damageIntercept';
    min?: number;
    max?: number;
    replaceWith: number;
    sacrificeSelf?: boolean;
    freeIfDamageEquals?: number;
    applyDizzyToSelf?: number;
    playerChoice?: boolean;
    sources?: DamageSource[];
}

export interface ApplyStatDebuffUntilDamageEffect extends BaseCardEffect {
    type: 'applyStatDebuffUntilDamage';
    stat: CombatStatKey;
    value: number;
    target: CardTarget;
}

export interface ApplyBurnEffect extends BaseCardEffect {
    type: 'applyBurn';
    value: number;
    target: CardTarget;
}

export interface ApplyBleedEffect extends BaseCardEffect {
    type: 'applyBleed';
    value: number;
    target: CardTarget;
}

export interface ApplyShockEffect extends BaseCardEffect {
    type: 'applyShock';
    value: number;
    target: CardTarget;
}

export interface ApplyStunEffect extends BaseCardEffect {
    type: 'applyStun';
    durationRounds: number;
    target: CardTarget;
}

export interface ApplyDizzyEffect extends BaseCardEffect {
    type: 'applyDizzy';
    value: number;
    target: CardTarget;
}

export interface TauntUntilNextTurnStartEffect extends BaseCardEffect {
    type: 'tauntUntilNextTurnStart';
    defBonus?: number;
}

export interface SealHandEffect extends BaseCardEffect {
    type: 'sealHand';
    mode: 'all';
    target?: CardTarget;
}

export interface DealDamagePerSealedHandEffect extends BaseCardEffect {
    type: 'dealDamagePerSealedHand';
    multiplier: number;
    round?: 'floor' | 'ceil' | 'round';
    fixed?: boolean;
    ignoreDef?: boolean;
}

export interface HealEffect extends BaseCardEffect {
    type: 'heal';
    value: number;
    target?: CardTarget;
}

export interface ModifyMaxHpInstallEffect extends BaseCardEffect {
    type: 'modifyMaxHpInstall';
    value: number;
}

export interface AddStatTokenEffect extends BaseCardEffect {
    type: 'addStatToken';
    stat: CombatStatKey | 'bra';
    target?: CardTarget;
    value?: number;
    valueFormula?: ValueFormula;
}

export interface HandStatModifierEffect extends BaseCardEffect {
    type: 'handStatModifier';
    stat: CombatStatKey | 'bra';
    value: number;
}

export interface ForceDiscardEquipEffect extends BaseCardEffect {
    type: 'forceDiscardEquip';
    target: CardTarget;
    count: number;
}

export interface GainAtkBoostTurnEffect extends BaseCardEffect {
    type: 'gainAtkBoostTurn';
    value: number;
}

export interface SelfDestroyEffect extends BaseCardEffect {
    type: 'selfDestroy';
}

export interface CheatDeathAtFullEffect extends BaseCardEffect {
    type: 'cheatDeathAtFull';
    sacrificeSelf?: boolean;
    setHpTo: number;
}

export interface DiscardAllHandEffect extends BaseCardEffect {
    type: 'discardAllHand';
    target: CardTarget;
}

export interface DiscardThenDrawEffect extends BaseCardEffect {
    type: 'discardThenDraw';
    discardCount: number;
    target?: CardTarget;
}

export interface ReduceDamageOnceEffect extends BaseCardEffect {
    type: 'reduceDamageOnce';
    amount: number;
    sources?: DamageSource[];
    sacrificeSelf?: boolean;
}

export interface AfterRoleAttackDamageEffect extends BaseCardEffect {
    type: 'afterRoleAttackDamage';
    target: 'target' | 'self';
    value?: number;
    valueMultiplierOfDealt?: number;
    fixed?: boolean;
    ignoreDef?: boolean;
    selfDamage?: number;
}

export interface CoinFlipDealDamageEffect extends BaseCardEffect {
    type: 'coinFlipDealDamage';
    target: CardTarget;
    chance: number;
    value: number;
    fixed?: boolean;
    defApplied?: boolean;
    ignoreDef?: boolean;
}

export interface CoinFlipDealDamageEitherEffect extends BaseCardEffect {
    type: 'coinFlipDealDamageEither';
    target: CardTarget;
    chanceToHitTarget: number;
    targetValue: number;
    selfValue: number;
    fixed?: boolean;
    defApplied?: boolean;
    ignoreDef?: boolean;
}

export interface SetNextRoundPriorityEffect extends BaseCardEffect {
    type: 'setNextRoundPriority';
}

export interface AdrenalineEffect extends BaseCardEffect {
    type: 'adrenaline';
    buff: Pick<StatModifierMap, 'atk' | 'spe'>;
    rebound: Pick<StatModifierMap, 'atk' | 'spe'>;
}

export interface ContactBurnOnRoleAttackEffect extends BaseCardEffect {
    type: 'contactBurnOnRoleAttack';
    value: number;
}

export interface ChooseOneOption {
    value: string;
    label: string;
    effects: CardEffect[];
}

export interface ChooseOneEffect extends BaseCardEffect {
    type: 'chooseOne';
    key: string;
    options: ChooseOneOption[];
    defaultValue?: string;
}

export interface PlayerChoiceSpec {
    chooseOneOf: StatKey[];
}

export interface DoubleBaseStatEffect extends BaseCardEffect {
    type: 'doubleBaseStat';
    playerChoice?: PlayerChoiceSpec;
    exclude?: StatKey[];
}

export interface ModifyTurnOrderEffect extends BaseCardEffect {
    type: 'modifyTurnOrder';
    mode: 'ascendingSpe' | 'descendingSpe';
    duration: 'instant' | 'untilEndOfNextRound';
}

export interface BrokenWindowTheoryEffect extends BaseCardEffect {
    type: 'brokenWindowTheory';
}

export interface FeintEffect extends BaseCardEffect {
    type: 'feint';
}

export interface SetNextRoleAttackAtkBonusEffect extends BaseCardEffect {
    type: 'setNextRoleAttackAtkBonus';
    value: number;
}

export interface PoltergeistEffect extends BaseCardEffect {
    type: 'poltergeist';
    multiplier: number;
    round?: 'floor' | 'ceil' | 'round';
}

export interface LibraryBurstEffect extends BaseCardEffect {
    type: 'libraryBurst';
    multiplier: number;
    round?: 'floor' | 'ceil' | 'round';
}

export interface SelfInstallEffect extends BaseCardEffect {
    type: 'selfInstall';
}

export type CardEffect =
    | DealDamageEffect
    | DrawCardsEffect
    | AdjustBraEffect
    | ThresholdPreventEffect
    | DamageInterceptEffect
    | ApplyStatDebuffUntilDamageEffect
    | ApplyBurnEffect
    | ApplyBleedEffect
    | ApplyShockEffect
    | ApplyStunEffect
    | ApplyDizzyEffect
    | HealEffect
    | ModifyMaxHpInstallEffect
    | AddStatTokenEffect
    | ForceDiscardEquipEffect
    | GainAtkBoostTurnEffect
    | SelfDestroyEffect
    | CheatDeathAtFullEffect
    | DiscardAllHandEffect
    | DiscardThenDrawEffect
    | ReduceDamageOnceEffect
    | AfterRoleAttackDamageEffect
    | CoinFlipDealDamageEffect
    | CoinFlipDealDamageEitherEffect
    | SetNextRoundPriorityEffect
    | AdrenalineEffect
    | ContactBurnOnRoleAttackEffect
    | TauntUntilNextTurnStartEffect
    | SealHandEffect
    | DealDamagePerSealedHandEffect
    | ChooseOneEffect
    | DoubleBaseStatEffect
    | ModifyTurnOrderEffect
    | HandStatModifierEffect
    | BrokenWindowTheoryEffect
    | FeintEffect
    | SetNextRoleAttackAtkBonusEffect
    | PoltergeistEffect
    | LibraryBurstEffect
    | SelfInstallEffect;

export type DamageSource = 'role' | 'card' | 'status' | 'ability' | 'other';

export type PendingAction =
    | {
          type: 'roleAttack';
          attackerId: string;
          targetId: string;
          isStruggle: boolean;
      }
    | {
          type: 'resonateRoleAttack';
          attackerId: string;
          targetId: string;
          isStruggle: boolean;
          nextDamage: number;
          totalDealt: number;
          hits: number;
      };

export type PendingPrompt = {
    id: string;
    type: 'beforeDamageTaken';
    targetId: string;
    attackerId?: string;
    source: DamageSource;
    amount: number;
    installInstanceId: string;
    cardId: string;
    effectIndex: number;
    action?: PendingAction;
    contactAttack?: boolean;
    preview?: {
        incoming: number;
        source: DamageSource;
        attackerId?: string;
        targetId: string;
        ifAccepted: {
            totalAfterReductions: number;
            tempAbsorbed: number;
            hpDamage: number;
            breakdown?: string[];
        };
        ifDeclined: {
            totalAfterReductions: number;
            tempAbsorbed: number;
            hpDamage: number;
            breakdown?: string[];
        };
    };
};

export interface CardDefinition {
    id: string;
    name: string;
    category: string;
    kind: 'skill' | 'install' | 'boost';
    cost: number;
    text?: string;
    playable?: boolean;
    unique?: boolean;
    subtype?: string;
    effects: CardEffect[];
    tags?: string[];
}

export type Card = CardDefinition;

export interface Deck {
    id: string;
    name: string;
    cards: Card[];
}

export interface DeckEntry {
    id: string;
    count: number;
}

export interface DeckList {
    name: string;
    total: number;
    entries: DeckEntry[];
}

export interface DeckSummary {
    id: string;
    name: string;
    total: number;
}

export interface DeckCards {
    id: string;
    cards: string[];
}

export interface LobbyPlayer {
    id: string;
    name: string;
    roleId?: string;
    isReady?: boolean;
    isSpectator?: boolean;
}

export interface LobbySummary {
    id: string;
    name: string;
    isPrivate: boolean;
    deckId: string;
    playerCount: number;
    createdAt: number;
}

export interface LobbyDetail {
    id: string;
    name: string;
    ownerId: string;
    isPrivate: boolean;
    deckId: string;
    players: LobbyPlayer[];
    createdAt: number;
    showRoles: boolean;
}

export type MatchmakingStatus = 'waiting' | 'matched' | 'not_found';

export interface MatchSummary {
    id: string;
    status: GameStatus;
    playerCount: number;
    createdAt: number;
    updatedAt: number;
}
