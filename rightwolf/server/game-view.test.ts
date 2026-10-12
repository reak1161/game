import { expect, it } from 'vitest'
import { createGame, playCard } from '../src/game/engine'
import { gameView } from './game-view'

it('only sends the responder their options and result previews, with a public effect source', () => {
  const game = createGame(['A', 'B', 'C'], () => .5)
  game.players[0].hand = [{ uid: 'source', cardId: 'demand' }]
  game.players[1].hand = [{ uid: 'secret-hand', cardId: 'prayer' }]
  game.players[1].role = { state: 'FACE_DOWN', card: { uid: 'secret-role', cardId: 'wolf' } }
  const result = playCard(game, { playerId: 'player-1', cardUid: 'source', choice: 'STATEMENT' })
  if (!result.ok) throw Error(result.error)
  const own = gameView(result.state, 'player-2')
  expect(own.pendingChoice?.sourceCard).toEqual({ uid: 'source', cardId: 'demand' })
  expect(own.pendingChoice?.presentation?.options['secret-hand']).toContain('渡す')
  const other = gameView(result.state, 'player-3')
  expect(other.pendingChoice?.sourceCard).toEqual(own.pendingChoice?.sourceCard)
  expect(other.pendingChoice?.presentation).toBeUndefined()
  expect(other.pendingChoice?.options).toEqual([])
  expect(JSON.stringify(other)).not.toContain('secret-hand')
  expect(JSON.stringify(other)).not.toContain('secret-role')
  for (const view of [own, other]) {
    expect(view.deck).toEqual([]); expect(view.queue).toEqual([])
    expect(view.pendingChoice?.task).toBeUndefined()
    expect(view.pendingChoice?.tasks).toBeUndefined()
    expect(view.pendingChoice?.cards).toBeUndefined()
  }
})
