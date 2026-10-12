import { describe, expect, it } from 'vitest'
import { createGame, endTurn, playCard } from './engine'

describe('ゲームエンジン', () => {
  it('開始時に親へ手札を3枚配る', () => {
    const game = createGame(['アキラ', 'ユウ'], () => 0.5)
    expect(game.players[0].hand).toHaveLength(3)
    expect(game.players[1].hand).toHaveLength(0)
    expect(game.time).toBe('DAY')
  })

  it('一周するとフェーズが進み、昼夜は2フェーズ周期となる', () => {
    let game = createGame(['アキラ', 'ユウ'], () => 0.5)
    const first = endTurn(game, game.players[0].id)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    game = first.state
    const second = endTurn(game, game.players[1].id)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.phase).toBe(2)
    expect(second.state.time).toBe('DAY')
  })

  it('手札にないカードは使用できない', () => {
    const game = createGame(['アキラ', 'ユウ'], () => 0.5)
    const result = playCard(game, { playerId: game.players[0].id, cardUid: 'missing', choice: 'ATTACK', targetId: game.players[1].id })
    expect(result.ok).toBe(false)
  })

  it('1人用テストでは勝利せずフェーズを進められる', () => {
    const game = createGame(['テスター'], () => 0.5)
    expect(game.mode).toBe('TEST')
    expect(game.winnerId).toBeNull()
    const result = endTurn(game, game.players[0].id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.phase).toBe(2)
    expect(result.state.time).toBe('DAY')
    expect(result.state.winnerId).toBeNull()
  })
})
