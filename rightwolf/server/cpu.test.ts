import { describe, expect, it } from 'vitest'
import { createGame, endTurn, playCard, revealRole } from '../src/game/engine'
import { chooseCpuAction, type CpuAction } from './cpu'
import type { GameState } from '../src/game/types'

function apply(game: GameState, action: CpuAction) {
  const playerId = game.players[game.currentPlayerIndex].id
  const result = action.type === 'PLAY_CARD' ? playCard(game, { ...action, playerId })
    : action.type === 'REVEAL_ROLE' ? revealRole(game, playerId, action.targetId) : endTurn(game, playerId)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.state
}

describe('CPU decisions', () => {
  it('sets and reveals a role, defends, attacks, then ends its turn', () => {
    let game = createGame(['CPU', 'Human'], () => .5)
    game.players[0].hand = ['wolf', 'defense1', 'attack2'].map((cardId, i) => ({ uid: String(i), cardId }))
    const actions: CpuAction[] = []
    while (game.currentPlayerIndex === 0 && actions.length < 8) {
      const action = chooseCpuAction(game, () => 0)
      actions.push(action)
      game = apply(game, action)
    }
    expect(actions.map(a => a.type === 'PLAY_CARD' ? a.choice : a.type)).toEqual(['SET_ROLE', 'REVEAL_ROLE', 'DEFENSE', 'ATTACK', 'END_TURN'])
    expect(game.players[0].shield).toBe(1)
    expect(game.players[1].hp).toBe(8)
    expect(game.players[0].hand).toHaveLength(0)
  })

  it('chooses twins defense when low on HP, otherwise attacks', () => {
    const game = createGame(['CPU', 'Human'], () => .5)
    game.players[0].hand = [{ uid: 'twins', cardId: 'twins2' }]
    expect(chooseCpuAction(game)).toMatchObject({ choice: 'ATTACK', targetId: 'player-2' })
    game.players[0].hp = 4
    expect(chooseCpuAction(game)).toMatchObject({ choice: 'DEFENSE' })
  })

  it('targets only another living player, including for seer CO', () => {
    const game = createGame(['CPU', 'Dead', 'Alive'], () => .5)
    game.players[1].status = 'DEAD'
    game.players[0].hand = [{ uid: 'attack', cardId: 'attack1' }]
    expect(chooseCpuAction(game, () => 0)).toMatchObject({ targetId: 'player-3' })
    game.players[0].role = { state: 'FACE_DOWN', card: { uid: 'seer', cardId: 'seer' } }
    expect(chooseCpuAction(game, () => 0)).toEqual({ type: 'REVEAL_ROLE', targetId: 'player-3' })
    expect(apply(game, chooseCpuAction(game)).players[0].role.state).toBe('REVEALED')
  })

  it('never reads other hands, hidden roles, logs or the deck', () => {
    const game = createGame(['CPU', 'Human'], () => .5)
    game.players[0].hand = [{ uid: 'attack', cardId: 'attack3' }]
    const forbidden = () => { throw new Error('Hidden data accessed') }
    Object.defineProperty(game.players[1], 'hand', { get: forbidden })
    Object.defineProperty(game.players[1], 'role', { get: forbidden })
    Object.defineProperty(game, 'deck', { get: forbidden })
    Object.defineProperty(game, 'log', { get: forbidden })
    expect(chooseCpuAction(game, () => 0)).toMatchObject({ choice: 'ATTACK', targetId: 'player-2' })
  })

  it('uses normal victory rules and cannot overwrite a revealed role', () => {
    let game = createGame(['CPU', 'Human'], () => .5)
    game.players[0].role = { state: 'REVEALED', card: { uid: 'role', cardId: 'wolf' } }
    game.players[0].hand = [{ uid: 'unused', cardId: 'knight' }, { uid: 'finisher', cardId: 'attack3' }]
    game.players[1].hp = 1
    game = apply(game, chooseCpuAction(game))
    expect(game.winnerId).toBe('player-1')
    expect(game.players[0].role.card?.cardId).toBe('wolf')
    expect(chooseCpuAction(game)).toEqual({ type: 'END_TURN' })
  })
})
