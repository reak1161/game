import type { Player } from './game/types'

// Clockwise from the viewer's seat. Seats never move when a player dies.
const POSITIONS: Record<number, Array<[number, number, number]>> = {
  0: [],
  1: [[50, 10, 0]],
  2: [[25, 16, -8], [75, 16, 8]],
  3: [[17, 37, -16], [50, 8, 0], [83, 37, 16]],
  4: [[16, 38, -16], [36, 9, -5], [64, 9, 5], [84, 38, 16]],
  5: [[15, 45, -18], [26, 11, -10], [50, 5, 0], [74, 11, 10], [85, 45, 18]],
}

export function tableSeats(players: Player[], selfId: string) {
  const selfIndex = players.findIndex((player) => player.id === selfId)
  if (selfIndex < 0) return []
  const others = [...players.slice(selfIndex + 1), ...players.slice(0, selfIndex)]
  return others.map((player, index) => {
    const [x, y, angle] = POSITIONS[others.length][index]
    return { player, x, y, angle }
  })
}

export function fanPosition(index: number, count: number) {
  const offset = index - (count - 1) / 2
  const spread = Math.min(1, 4 / Math.max(1, count - 1))
  return { x: offset * 62 * spread, y: Math.abs(offset) * 11 * spread, angle: offset * 12 * spread }
}
