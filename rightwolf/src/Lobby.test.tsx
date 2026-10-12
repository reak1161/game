// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Lobby } from './App'
import type { RoomView } from './network/protocol'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it('defaults to three CPUs, retains empty solo testing, and excludes CPUs when a human joins', () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const send = vi.fn()
  let room: RoomView = { code: 'TEST1', selfId: 'player-1', isHost: true, status: 'LOBBY', game: null,
    players: [{ id: 'player-1', name: 'Host', connected: true, isHost: true }] }
  const render = () => act(() => root.render(<Lobby room={room} send={send} error="" />))
  const start = () => act(() => container.querySelector<HTMLButtonElement>('.primary')!.click())
  try {
    render()
    expect(container.querySelector<HTMLSelectElement>('select')!.value).toBe('3')
    start()
    expect(send).toHaveBeenLastCalledWith({ type: 'START_GAME', cpuCount: 3, sets: ['FOREST', 'MOON'] })
    act(() => {
      const select = container.querySelector<HTMLSelectElement>('select')!
      select.value = '0'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.textContent).toContain('1人用テスト開始')
    start()
    expect(send).toHaveBeenLastCalledWith({ type: 'START_GAME', cpuCount: 0, sets: ['FOREST', 'MOON'] })
    room = { ...room, players: [...room.players, { id: 'player-2', name: 'Guest', isHost: false, connected: true }] }
    render()
    expect(container.querySelector('select')).toBeNull()
    start()
    expect(send).toHaveBeenLastCalledWith({ type: 'START_GAME', cpuCount: 0, sets: ['FOREST', 'MOON'] })
  } finally { act(() => root.unmount()); container.remove() }
})
