import { describe, expect, it } from 'vitest'
import { createGame, playCard } from './engine'
import { cardAttackDisplay } from './card-display'

describe('live attack numbers', () => {
  it.each(['accel', 'lightning', 'doubleEdge', 'cyclone'] as const)('matches resolved %s damage, counting the played card correctly', cardId => {
    const game = createGame(['Self', 'Other'], () => .5)
    const [self, target] = game.players
    const card = { uid: 'attack', cardId }
    self.hand = [card, { uid: 'spare1', cardId: 'wolf' }, { uid: 'spare2', cardId: 'citizen' }]
    self.turnStatements = 3
    self.attackFlat = 1
    target.discard = [{ uid: 'discard1', cardId: 'attack2' }, { uid: 'discard2', cardId: 'attack2' }]
    const display = cardAttackDisplay(game, self, card, target.id, 4)!
    const result = playCard(game, { playerId: self.id, cardUid: card.uid, choice: 'ATTACK', targetId: target.id, amount: 4 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(10 - result.state.players[1].hp).toBe(Number(display.rank))
  })
  it('updates lightning after statements, and applies public attack modifiers', () => {
    const game = createGame(['Self', 'Other'], () => .5), self = game.players[0]
    const card = { uid: 'lightning', cardId: 'lightning' }
    self.role = { state: 'REVEALED', card: { uid: 'wolf', cardId: 'wolf' } }
    self.turnStatements = 2
    expect(cardAttackDisplay(game, self, card)?.rank).toBe('4')
    self.turnStatements = 3; game.time = 'NIGHT'
    expect(cardAttackDisplay(game, self, card)?.rank).toBe('9')
    game.effects = [{ id: 'half', kind: 'HALF', ownerId: self.id, targetId: self.id, expires: 2, timing: 'START' }]
    expect(cardAttackDisplay(game, self, card)?.rank).toBe('4')
  })
  it('does not invent a target or selected value and identifies reverse cyclone damage', () => {
    const game = createGame(['Self', 'Other'], () => .5), self = game.players[0]
    const cyclone = { uid: 'cyclone', cardId: 'cyclone' }
    expect(cardAttackDisplay(game, self, cyclone)?.rank).toBe('?')
    expect(cardAttackDisplay(game, self, { uid: 'double', cardId: 'doubleEdge' })?.rank).toBe('1–5')
    expect(cardAttackDisplay(game, self, cyclone, game.players[1].id)?.rank).toBe('↶1')
    expect(cardAttackDisplay(game, self, cyclone, self.id)?.rank).toBe('0')
    self.attackFlat = 10
    expect(cardAttackDisplay(game, self, { uid: 'brand', cardId: 'brand' })?.rank).toBe('3')
  })
  it('keeps scissors and unallocated rain unknown, and distinguishes affection HP loss mode', () => {
    const game = createGame(['Self', 'Other'], () => .5), self = game.players[0]
    expect(cardAttackDisplay(game, self, { uid: 'scissors', cardId: 'scissors' })?.rank).toBe('?')
    expect(cardAttackDisplay(game, self, { uid: 'rain', cardId: 'rain' })?.rank).toBe('?')
    expect(cardAttackDisplay(game, self, { uid: 'affection', cardId: 'affection' }, 'player-2', 1, 'BOTH')?.rank).toBe('HP1')
    expect(cardAttackDisplay(game, self, { uid: 'whiteNight', cardId: 'whiteNight' })?.rank).toBe('3')
  })
})
