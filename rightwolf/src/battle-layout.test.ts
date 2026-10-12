import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import GameBoard from './GameBoard'
import { fanPosition, tableSeats } from './battle-layout'
import { createGame } from './game/engine'
import type { RoomView } from './network/protocol'

describe('table perspective', () => {
  it('keeps clockwise order relative to every viewer for one to six players', () => {
    for (let count = 1; count <= 6; count++) {
      const game = createGame(Array.from({ length: count }, (_, i) => `Player ${i}`), () => .5)
      game.players.forEach((self, index) => {
        const seats = tableSeats(game.players, self.id)
        expect(seats.map((seat) => seat.player.id)).toEqual(Array.from({ length: count - 1 }, (_, i) => game.players[(index + i + 1) % count].id))
        expect(seats.every((seat) => Number.isFinite(seat.x) && Number.isFinite(seat.y))).toBe(true)
      })
    }
  })

  it('retains the seat of a dead player', () => {
    const game = createGame(['A', 'B', 'C', 'D'], () => .5)
    const before = tableSeats(game.players, 'player-2').map(({ player, ...seat }) => ({ id: player.id, ...seat }))
    game.players[2].status = 'DEAD'
    expect(tableSeats(game.players, 'player-2').map(({ player, ...seat }) => ({ id: player.id, ...seat }))).toEqual(before)
  })

  it('keeps a centered, bounded fan even above the normal hand limit', () => {
    for (const count of [1, 2, 3, 5, 12]) {
      const fan = Array.from({ length: count }, (_, i) => fanPosition(i, count))
      expect(fan[0].x + fan.at(-1)!.x).toBe(0)
      expect(fan[0].angle + fan.at(-1)!.angle).toBe(0)
      expect(fan.every((card) => Math.abs(card.x) <= 124 && Math.abs(card.angle) <= 24)).toBe(true)
    }
  })
})

describe('table information visibility', () => {
  function render(revealed: boolean) {
    const game = createGame(['自分', '相手'], () => .5)
    game.players[0].hand = [{ uid: 'own', cardId: 'defense1' }]
    game.players[1].hand = [{ uid: 'secret-hand', cardId: 'seer' }]
    game.players[1].handCount = 3
    game.players[1].role = { state: revealed ? 'REVEALED' : 'FACE_DOWN', card: { uid: 'secret-role', cardId: 'wolf' } }
    game.players[1].discard = [{ uid: 'public-discard', cardId: 'attack3' }]
    const room: RoomView = { code: 'TEST1', status: 'PLAYING', isHost: true, selfId: game.players[0].id, game, players: game.players.map((p) => ({ id: p.id, name: p.name, isHost: p.id === game.players[0].id, connected: true })) }
    return renderToStaticMarkup(createElement(GameBoard, { room, send: () => {}, connected: true, error: '' }))
  }

  it('renders opponent hand backs and public discards, concealing an unrevealed role', () => {
    const html = render(false)
    expect(html).toContain('裏向きの手札 3枚')
    expect(html).toContain('相手の役職：伏せ役職')
    expect(html).toContain('アタックLV.3')
    expect(html).not.toContain('占い師')
    expect(html).not.toContain('人狼')
  })

  it('shows the role face after CO without revealing the hand', () => {
    const html = render(true)
    expect(html).toContain('相手の役職：人狼')
    expect(html).not.toContain('占い師')
  })
})
