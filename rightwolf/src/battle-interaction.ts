import { cardOf } from './game/cards'
import type { GameState } from './game/types'
import type { ClientMessage } from './network/protocol'
import { canTarget, handAllowed } from './game/v03-rules'

export type CardSource = { kind: 'hand'; uid: string } | { kind: 'role'; uid: string }
export type DropTarget = { playerId: string; zone: 'player' | 'role' | 'deck' }

export function sourceCard(game: GameState, selfId: string, source: CardSource) {
  const self = game.players.find((player) => player.id === selfId)
  if (source.kind === 'hand') return self?.hand.find((card) => card.uid === source.uid)
  return self?.role.state === 'FACE_DOWN' && self.role.card?.uid === source.uid ? self.role.card : undefined
}

// This determines the gesture's intent. The server still validates every command.
export function resolveDrop(game: GameState, selfId: string, source: CardSource, target: DropTarget | null, connected = true): ClientMessage | null {
  const self = game.players.find((player) => player.id === selfId)
  const other = game.players.find((player) => player.id === target?.playerId)
  const instance = sourceCard(game, selfId, source)
  if (!connected || !self || !target || !other || !instance || game.winnerId || game.draw || game.pendingChoice || self.status !== 'ALIVE' || other.status !== 'ALIVE' || game.players[game.currentPlayerIndex].id !== selfId) return null
  const card = cardOf(instance)
  if (card.unresolved || card.reactive || !handAllowed(game, self)) return null
  if (card.id === 'sunrise' && game.time !== 'DAY' || card.id === 'whiteNight' && game.time !== 'NIGHT') return null
  if (target.zone === 'deck') return source.kind === 'hand' && card.kind === 'ROLE' && self.role.state === 'REVEALED' ? { type: 'PLAY_CARD', cardUid: instance.uid, choice: 'RETURN_ROLE' } : null
  if (!canTarget(game, selfId, other.id)) return null
  if (source.kind === 'role') {
    return card.roleEffect === 'SEER' ? { type: 'REVEAL_ROLE', targetId: other.id } : null
  }
  if (card.kind === 'ROLE') {
    return other.id === selfId && target.zone === 'role' && self.role.state !== 'REVEALED'
      ? { type: 'PLAY_CARD', cardUid: instance.uid, choice: 'SET_ROLE' } : null
  }
  if (card.kind === 'STATEMENT') return (card.target === 'SELF' || card.target === 'ALL') && other.id !== selfId ? null : { type: 'PLAY_CARD', cardUid: instance.uid, choice: 'STATEMENT', targetId: other.id }
  if (card.id === 'miracle') return { type: 'PLAY_CARD', cardUid: instance.uid, choice: 'DEFENSE', targetId: other.id }
  if (other.id === selfId && card.defense !== undefined) return { type: 'PLAY_CARD', cardUid: instance.uid, choice: 'DEFENSE' }
  if (card.attack !== undefined) return { type: 'PLAY_CARD', cardUid: instance.uid, choice: 'ATTACK', targetId: other.id }
  return null
}
