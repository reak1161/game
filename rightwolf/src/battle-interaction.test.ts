import { describe, expect, it } from 'vitest'
import { createGame, playCard, revealRole } from './game/engine'
import { resolveDrop } from './battle-interaction'

function setup(cardId = 'twins2') {
  const game = createGame(['Self', 'Other'], () => .5)
  game.players[0].hand = [{ uid: 'held', cardId }]
  return game
}
const source = { kind: 'hand', uid: 'held' } as const
const self = { playerId: 'player-1', zone: 'player' } as const
const other = { playerId: 'player-2', zone: 'player' } as const

describe('card drop commands', () => {
  it('uses twins as attack on an opponent and defense on the own field', () => {
    const game = setup()
    const attack = resolveDrop(game, self.playerId, source, other)!
    const defense = resolveDrop(game, self.playerId, source, self)!
    expect(attack).toEqual({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: other.playerId })
    expect(defense).toEqual({ type: 'PLAY_CARD', cardUid: 'held', choice: 'DEFENSE' })
    if (attack.type !== 'PLAY_CARD' || defense.type !== 'PLAY_CARD') throw new Error('Expected play commands')
    const attacked = playCard(game, { ...attack, playerId: self.playerId })
    const defended = playCard(game, { ...defense, playerId: self.playerId })
    expect(attacked.ok && attacked.state.players[1].hp).toBe(8)
    expect(defended.ok && defended.state.players[0].shield).toBe(2)
    expect(attacked.ok && attacked.state.players[0].hand).toHaveLength(0)
  })

  it('does not consume a card on an invalid drop and allows self targeting in v0.2', () => {
    const game = setup('attack2')
    const before = structuredClone(game)
    expect(resolveDrop(game, self.playerId, source, null)).toBeNull()
    expect(resolveDrop(game, self.playerId, source, self)).toMatchObject({ choice: 'ATTACK', targetId: self.playerId })
    expect(resolveDrop(game, self.playerId, source, { playerId: 'missing', zone: 'player' })).toBeNull()
    expect(resolveDrop(setup('defense2'), self.playerId, source, other)).toBeNull()
    expect(game).toEqual(before)
  })

  it('sets roles only in the own role slot and permits replacing only a hidden role', () => {
    const game = setup('wolf')
    const role = { ...self, zone: 'role' } as const
    expect(resolveDrop(game, self.playerId, source, self)).toBeNull()
    expect(resolveDrop(game, self.playerId, source, { ...other, zone: 'role' })).toBeNull()
    expect(resolveDrop(game, self.playerId, source, role)).toMatchObject({ choice: 'SET_ROLE' })
    game.players[0].role = { state: 'FACE_DOWN', card: { uid: 'old', cardId: 'citizen' } }
    expect(resolveDrop(game, self.playerId, source, role)).toMatchObject({ choice: 'SET_ROLE' })
    game.players[0].role.state = 'REVEALED'
    expect(resolveDrop(game, self.playerId, source, role)).toBeNull()
  })

  it('reveals an installed seer by dropping it on another living player', () => {
    const game = setup('seer')
    game.players[0].role = { state: 'FACE_DOWN', card: game.players[0].hand.pop()! }
    const roleSource = { kind: 'role', uid: 'held' } as const
    const message = resolveDrop(game, self.playerId, roleSource, other)
    expect(message).toEqual({ type: 'REVEAL_ROLE', targetId: other.playerId })
    const result = revealRole(game, self.playerId, other.playerId)
    expect(result.ok && result.state.players[0].role.state).toBe('REVEALED')
    expect(resolveDrop(game, self.playerId, roleSource, self)).toEqual({ type: 'REVEAL_ROLE', targetId: self.playerId })
    game.players[0].role.state = 'REVEALED'
    expect(resolveDrop(game, self.playerId, roleSource, other)).toBeNull()
  })

  it.each(['disconnected', 'out-of-turn', 'self-dead', 'target-dead', 'winner', 'stale-card'])(
    'rejects a drop when %s', (condition) => {
      const game = setup('attack2')
      if (condition === 'out-of-turn') game.currentPlayerIndex = 1
      if (condition === 'self-dead') game.players[0].status = 'DEAD'
      if (condition === 'target-dead') game.players[1].status = 'DEAD'
      if (condition === 'winner') game.winnerId = self.playerId
      if (condition === 'stale-card') game.players[0].hand = []
      expect(resolveDrop(game, self.playerId, source, other, condition !== 'disconnected')).toBeNull()
    },
  )
})
