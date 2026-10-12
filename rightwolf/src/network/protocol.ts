import type { ExpansionSet, GameState, PlayCardInput, PlayChoice } from '../game/types.js'

export interface LobbyPlayer {
  id: string
  name: string
  connected: boolean
  isHost: boolean
  isCpu?: boolean
}

export interface RoomView {
  code: string
  status: 'LOBBY' | 'PLAYING' | 'FINISHED'
  players: LobbyPlayer[]
  selfId: string
  isHost: boolean
  game: GameState | null
}

export type ClientMessage =
  | { type: 'CREATE_ROOM'; name: string }
  | { type: 'JOIN_ROOM'; roomCode: string; name: string }
  | { type: 'RESUME'; roomCode: string; token: string }
  | { type: 'START_GAME'; cpuCount?: number; sets?: ExpansionSet[] }
  | { type: 'PLAY_CARD'; cardUid: string; choice: PlayChoice; targetId?: string; secondTargetId?: string; amount?: number; double?: boolean; mode?: PlayCardInput['mode']; distribution?: Record<string, number> }
  | { type: 'REVEAL_ROLE'; targetId?: string }
  | { type: 'END_TURN' }
  | { type: 'RESOLVE_CHOICE'; choiceId: string; selected: string[]; targetId?: string }
  | { type: 'ROLE_ABILITY'; targetId: string }
  | { type: 'LEAVE_ROOM' }

export type ServerMessage =
  | { type: 'SESSION'; roomCode: string; token: string }
  | { type: 'ROOM_STATE'; room: RoomView }
  | { type: 'ERROR'; message: string }
