import { cardOf } from '../src/game/cards.js'
import type { GameState } from '../src/game/types.js'
import type { ClientMessage } from '../src/network/protocol.js'
import { canTarget, livingCount, handAllowed } from '../src/game/v03-rules.js'

export type CpuAction = Extract<ClientMessage, { type: 'PLAY_CARD' | 'REVEAL_ROLE' | 'END_TURN' | 'RESOLVE_CHOICE' }>

// Receives the same filtered view as this player would receive in a browser.
// Opponents' hidden cards and the deck are never supplied to this policy.
export function chooseCpuAction(game: GameState, random = Math.random): CpuAction {
  if (game.pendingChoice) {
    const c = game.pendingChoice
    const count = ['DEFENSE', 'RESCUE', 'DEMAND', 'DAMAGE_RESPONSE', 'INTERRUPT', 'SILENCE'].includes(c.kind) ? Math.min(1, c.options.length) : c.min
    return { type: 'RESOLVE_CHOICE', choiceId: c.id, selected: c.options.slice(0, count).map(o => o.id), targetId: game.players.find(p => p.status === 'ALIVE')?.id }
  }
  const self = game.players[game.currentPlayerIndex]
  const targets = game.players.filter(p => p.id !== self.id && canTarget(game, self.id, p.id))
  const pickTarget = () => targets[Math.floor(random() * targets.length)]?.id
  if (self.status !== 'ALIVE' || game.winnerId) return { type: 'END_TURN' }
  if (!handAllowed(game, self)) return { type: 'END_TURN' }

  if (self.role.state === 'EMPTY') {
    const role = self.hand.find(card => cardOf(card).kind === 'ROLE')
    if (role) return { type: 'PLAY_CARD', cardUid: role.uid, choice: 'SET_ROLE' }
  }
  if (self.role.state === 'FACE_DOWN' && self.role.card) {
    if (cardOf(self.role.card).roleEffect !== 'SEER' && (self.role.card.cardId !== 'lover' || livingCount(game) >= 3)) return { type: 'REVEAL_ROLE' }
    if (cardOf(self.role.card).roleEffect === 'SEER' && targets.length) return { type: 'REVEAL_ROLE', targetId: pickTarget() }
  }
  const defense = self.hand.find(card => cardOf(card).kind === 'DEFENSE' && !cardOf(card).reactive && card.cardId !== 'hope')
  if (defense) return { type: 'PLAY_CARD', cardUid: defense.uid, choice: 'DEFENSE', ...(defense.cardId === 'miracle' ? { targetId: pickTarget() ?? self.id } : {}) }
  const twins = self.hand.find(card => cardOf(card).kind === 'TWINS')
  if (twins && (self.hp <= 5 && self.shield < 2 || !targets.length)) {
    return { type: 'PLAY_CARD', cardUid: twins.uid, choice: 'DEFENSE' }
  }
  const attack = self.hand.find(card => cardOf(card).attack !== undefined && !cardOf(card).unresolved && (card.cardId !== 'sunrise' || game.time === 'DAY') && (card.cardId !== 'whiteNight' || game.time === 'NIGHT'))
  if (attack && targets.length) {
    const targetId = pickTarget()!
    return { type: 'PLAY_CARD', cardUid: attack.uid, choice: 'ATTACK', targetId, ...(attack.cardId === 'doubleEdge' ? { amount: Math.min(3, Math.max(1, self.hp - 1)) } : {}), ...(attack.cardId === 'affection' ? { mode: 'DAMAGE' as const } : {}), ...(attack.cardId === 'rain' ? { amount: Math.min(2, Math.max(0, self.hp - 1)), distribution: { [targetId]: Math.min(2, Math.max(0, self.hp - 1)) } } : {}) }
  }
  const statement = self.hand.find(card => cardOf(card).kind === 'STATEMENT' && !cardOf(card).unresolved && !cardOf(card).reactive && (card.cardId !== 'retract' || self.role.state === 'REVEALED') && card.cardId !== 'roleSwap')
  if (statement) return { type: 'PLAY_CARD', cardUid: statement.uid, choice: 'STATEMENT', targetId: ['treatment', 'memoir', 'consider', 'prayer', 'eloquence', 'cakeWine'].includes(statement.cardId) ? self.id : pickTarget() ?? self.id, ...(statement.cardId === 'cakeWine' ? { mode: 'CAKE' as const } : {}), ...(statement.cardId === 'scales' ? { amount: Math.min(1, Math.max(0, self.hp - 1)) } : {}) }
  return { type: 'END_TURN' }
}
