export type TimeOfDay = 'DAY' | 'NIGHT'
export type PlayerStatus = 'ALIVE' | 'DEAD' | 'SUSPENDED'
export type RoleState = 'EMPTY' | 'FACE_DOWN' | 'REVEALED'
export type CardKind = 'ROLE' | 'STATEMENT' | 'ATTACK' | 'DEFENSE' | 'TWINS'
export type ExpansionSet = 'FOREST' | 'MOON'

export interface CardDefinition {
  id: string
  name: string
  kind: CardKind
  description: string
  attack?: number
  defense?: number
  roleEffect?: 'NONE' | 'WOLF' | 'SEER' | 'KNIGHT' | 'MEDIUM' | 'ASSASSIN' | 'DOLL' | 'RED_HOOD' | 'LOVER' | 'FOX' | 'VAMPIRE'
  set?: ExpansionSet
  reactive?: boolean
  count?: number
  hits?: number
  target?: 'ONE' | 'SELF' | 'ALL' | 'TWO'
  unresolved?: boolean
}

export interface CardInstance {
  uid: string
  cardId: string
}

export interface RoleSlot {
  state: RoleState
  card: CardInstance | null
}

export interface Player {
  id: string
  name: string
  hp: number
  maxHp: number
  status: PlayerStatus
  handLimit: number
  hand: CardInstance[]
  discard: CardInstance[]
  role: RoleSlot
  shield: number
  handCount?: number
  connected?: boolean
  installed?: CardInstance[]
  attackFlat?: number
  attackPercent?: number
  abilityUsed?: boolean
  guardTarget?: string
  previousGuard?: string
  turnsStarted?: number
  turnAttacks?: number
  turnStatements?: number
  turnCards?: number
  turnDamage?: number
  turnSelfLoss?: number
  revivalUsed?: boolean
}

export interface TimedEffect {
  id: string
  kind: 'HALF' | 'REDUCE' | 'TALK' | 'IMMUNE' | 'HOWL' | 'CITIZEN' | 'BLOCK' | 'ELEMENT' | 'WALL' | 'MIRACLE' | 'HOPE' | 'DELAY' | 'REVIVAL' | 'ATTACK_HALF' | 'TARGET_BAN' | 'LOVE' | 'STONE' | 'BASKET' | 'MAX_HP' | 'FOX_FUR' | 'VIRUS' | 'HEAL_RESERVATION'
  ownerId: string
  targetId: string
  expires: number
  timing: 'START' | 'END'
  fromId?: string
  card?: CardInstance
  sourceCard?: CardInstance
  value?: number
}

export interface EffectTask {
  kind: 'DAMAGE' | 'LIFE_LOSS' | 'KILL' | 'DEATH' | 'ATTACK' | 'DEFEND' | 'END_TURN' | 'NEXT_TURN' | 'FORCE_REVEAL' | 'STATEMENT' | 'CHOICE' | 'VOTE_RESULT' | 'EXPIRE' | 'HEAL' | 'DRAW_CARDS' | 'SWITCH_TIME' | 'REVIVE' | 'ACTION' | 'READY' | 'AFTER_HUNT' | 'SCHEDULE_ATTACK' | 'INSPECT_HAND'
  sourceId: string
  targetId?: string
  value?: number
  hits?: number
  attack?: boolean
  card?: CardInstance
  sourceCard?: CardInstance
  choice?: PendingChoice
  effectId?: string
  input?: PlayCardInput
  tasks?: EffectTask[]
  reacted?: string[]
  single?: boolean
  chain?: boolean
  drainLife?: boolean
  deathGeneration?: number
  onExtraEnd?: boolean
  damageChecked?: boolean
  selfCost?: boolean
}

export interface ChoiceOption { id: string; label: string; card?: CardInstance }
export interface ChoicePresentation {
  summary: string
  sourceRank?: string
  options: Record<string, string>
  skip?: string
  skipLabel?: string
}
export interface PendingChoice {
  id: string
  playerId: string
  kind: 'DEFENSE' | 'RESCUE' | 'GUARD' | 'SEER' | 'ASSASSIN' | 'DRAW' | 'TRADE' | 'VOTE' | 'DEMAND' | 'RECOVER' | 'ORDER' | 'LOVE_TARGET' | 'CHANGE_LOVE' | 'SCISSORS' | 'CROW_ORDER' | 'CROW_HAND' | 'INTERRUPT' | 'REDIRECT' | 'DAMAGE_RESPONSE' | 'SILENCE'
  title: string
  options: ChoiceOption[]
  min: number
  max: number
  sourceId: string
  sourceCard?: CardInstance
  presentation?: ChoicePresentation
  targetId?: string
  task?: EffectTask
  cards?: CardInstance[]
  amount?: number
  tasks?: EffectTask[]
  stage?: string
  targets?: string[]
}

export interface GameLog {
  id: number
  message: string
  visibility: 'PUBLIC' | 'PRIVATE'
  playerId?: string
}

export interface GameState {
  version: 1
  id: string
  mode: 'NORMAL' | 'TEST'
  players: Player[]
  parentIndex: number
  currentPlayerIndex: number
  phase: number
  time: TimeOfDay
  deck: CardInstance[]
  turnNumber: number
  winnerId: string | null
  log: GameLog[]
  nextLogId: number
  effects?: TimedEffect[]
  queue?: EffectTask[]
  pendingChoice?: PendingChoice | null
  votes?: Record<string, number>
  draw?: boolean
  deckCount?: number
  winnerIds?: string[]
  victoryLinks?: Array<{ ownerId: string; targetId: string; kind: 'ROLE' | 'CARD'; cardUid?: string }>
  extraTurns?: Array<{ playerId: string; fatal?: boolean }>
  extraTurn?: boolean
  extraFatal?: boolean
  deathGenerations?: Record<string, number>
  sets?: ExpansionSet[]
}

export type PlayChoice = 'ATTACK' | 'DEFENSE' | 'SET_ROLE' | 'REVEAL_ROLE' | 'RETURN_ROLE' | 'STATEMENT'

export interface PlayCardInput {
  playerId: string
  cardUid: string
  choice: PlayChoice
  targetId?: string
  secondTargetId?: string
  amount?: number
  double?: boolean
  mode?: 'CAKE' | 'WINE' | 'DAMAGE' | 'BOTH'
  distribution?: Record<string, number>
}

export type GameResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string }
