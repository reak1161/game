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
}

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
}

export type GameLogEntry =
    | { type: 'turnStart'; playerId: string; timestamp: number }
    | { type: 'cardPlay'; playerId: string; cardId: string; targets?: string[]; timestamp: number }
    | { type: 'roleAttack'; attackerId: string; targetId: string; damage: number; isStruggle?: boolean; selfInflicted?: number; timestamp: number }
    | { type: 'roleAttackHit'; attackerId: string; targetId: string; damage: number; hitIndex: number; totalHits: number; timestamp: number }
    | { type: 'playerDefeated'; playerId: string; timestamp: number }
    | { type: 'roleAction'; playerId: string; actionId: string; targetId?: string; description?: string; timestamp: number }
    | { type: 'statusEffect'; playerId: string; effect: 'burn'; amount: number; kind: 'damage' | 'heal'; timestamp: number };

export type CardTrigger = 'onPlay' | 'onEquip' | 'beforeDamageTaken' | 'afterRoleAttack';

export type CardTarget = 'self' | 'chosen_enemy' | 'chosen_player' | 'all_players' | 'defender';

export interface EffectCondition {
    roleId?: string;
    targetHandCountAtLeast?: number;
    hpEqualsMax?: boolean;
    fatalIfApplied?: boolean;
    lastEffect?: string;
    discardedCountAtLeast?: number;
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
}

export interface ThresholdPreventEffect extends BaseCardEffect {
    type: 'thresholdPrevent';
    operator: ThresholdOperator;
    threshold: number;
    preventAll: boolean;
    sacrificeSelf?: boolean;
    playerChoice?: boolean;
}

export interface AddStatTokenEffect extends BaseCardEffect {
    type: 'addStatToken';
    stat: CombatStatKey | 'bra';
    target?: CardTarget;
    value?: number;
    valueFormula?: ValueFormula;
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

export type CardEffect =
    | DealDamageEffect
    | ThresholdPreventEffect
    | AddStatTokenEffect
    | ForceDiscardEquipEffect
    | GainAtkBoostTurnEffect
    | SelfDestroyEffect
    | CheatDeathAtFullEffect
    | DiscardAllHandEffect
    | DoubleBaseStatEffect
    | ModifyTurnOrderEffect;

export interface CardDefinition {
    id: string;
    name: string;
    category: string;
    kind: 'skill' | 'install' | 'boost';
    cost: number;
    text?: string;
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
}

export interface LobbySummary {
    id: string;
    name: string;
    isPrivate: boolean;
    deckId: string;
    playerCount: number;
    createdAt: number;
}

export type MatchmakingStatus = 'waiting' | 'matched' | 'not_found';

export interface MatchSummary {
    id: string;
    status: GameStatus;
    playerCount: number;
    createdAt: number;
    updatedAt: number;
}
