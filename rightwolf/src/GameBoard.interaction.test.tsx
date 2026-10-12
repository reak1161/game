// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameBoard from './GameBoard'
import { createGame } from './game/engine'
import type { RoomView } from './network/protocol'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let container: HTMLDivElement
let room: RoomView
const send = vi.fn()
const hit = vi.fn()
const query = <T extends Element = HTMLElement,>(selector: string) => document.querySelector<T>(selector)!
const pointer = (element: Element, type: string, x = 0, y = 0, pointerType = 'mouse') => act(() => {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, pointerType }))
})
const click = (element: Element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const escape = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
const advance = (milliseconds: number) => act(() => { vi.advanceTimersByTime(milliseconds) })
const render = (connected = true) => act(() => root.render(<GameBoard room={room} send={send} error="" connected={connected} />))
function hand(cardId: string) {
  room.game!.players[0].hand = [{ uid: 'held', cardId }]
  render()
  return query('.hand-card')
}
function dragStart(card: Element, target: Element | null, pointerType = 'mouse') {
  hit.mockReturnValue(target)
  pointer(card, 'pointerdown', 100, 500, pointerType)
  pointer(card, 'pointermove', 200, 200, pointerType)
}

beforeEach(() => {
  vi.useFakeTimers()
  send.mockReset()
  hit.mockReset()
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    animate: { configurable: true, value: () => ({ cancel() {} }) },
  })
  const game = createGame(['Self', 'Other', 'Third', 'Fourth', 'Fifth', 'Sixth'], () => .5)
  room = { code: 'TEST1', game, selfId: 'player-1', status: 'PLAYING', isHost: true,
    players: game.players.map(p => ({ id: p.id, name: p.name, connected: true, isHost: p.id === 'player-1' })) }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('table card interactions', () => {
  it('waits before displaying an effect and closes after leaving', () => {
    const card = hand('attack2')
    pointer(card, 'pointerover')
    advance(549)
    expect(query('.card-popover')).toBeNull()
    advance(1)
    expect(query('.card-popover').textContent).toContain('誰か1人へ2の通常ダメージ')
    pointer(card, 'pointerout')
    advance(180)
    expect(query('.card-popover')).toBeNull()
  })

  it('keeps the popover open when moving from the card into it', () => {
    const card = hand('twins2')
    pointer(card, 'pointerover')
    advance(550)
    pointer(card, 'pointerout')
    pointer(query('.card-popover'), 'pointerover')
    advance(1000)
    expect(query('.card-popover')).not.toBeNull()
    escape()
    expect(query('.card-popover')).toBeNull()
  })

  it.each(['mouse', 'touch', 'pen'])('locks on and sends exactly once on %s drop', (pointerType) => {
    const card = hand('attack2')
    const target = query('[data-player-id="player-2"] .seat-badge')
    dragStart(card, target, pointerType)
    expect(query('[data-player-id="player-2"] .lock-on')).not.toBeNull()
    expect(query('.lock-on').textContent).toBe('')
    expect(query('.drag-status')).toBeNull()
    expect(query('.drag-card')).not.toBeNull()
    expect(send).not.toHaveBeenCalled()
    pointer(card, 'pointerup', 200, 200, pointerType)
    click(card)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: 'player-2' })
    expect(query('.drag-card')).toBeNull()
    expect(query('.card-popover')).toBeNull()
    dragStart(card, target, pointerType)
    pointer(card, 'pointerup', 200, 200, pointerType)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it.each(['outside', 'escape', 'pointercancel', 'blur', 'disconnect', 'turn-change'])('returns the card without sending after %s', (reason) => {
    const card = hand('attack2')
    dragStart(card, query('[data-player-id="player-2"] .seat-badge'))
    if (reason === 'outside') hit.mockReturnValue(null)
    if (reason === 'escape') escape()
    if (reason === 'pointercancel') pointer(card, 'pointercancel')
    if (reason === 'blur') act(() => window.dispatchEvent(new Event('blur')))
    if (reason === 'disconnect') render(false)
    if (reason === 'turn-change') {
      room = { ...room, game: { ...room.game!, currentPlayerIndex: 1, turnNumber: 2 } }
      render()
    }
    pointer(card, 'pointerup', 200, 200)
    expect(send).not.toHaveBeenCalled()
    expect(query('.drag-card')).toBeNull()
    expect(query('.is-dragged')).toBeNull()
    expect(query('.hand-card')).not.toBeNull()
  })

  it('uses twins for defense when dropped on the own status', () => {
    const card = hand('twins2')
    dragStart(card, query('.self-status .seat-badge'))
    expect(query('.self-field.drop-locked')).not.toBeNull()
    pointer(card, 'pointerup', 200, 200)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'DEFENSE' })
  })

  it('reveals the installed seer by dragging it to an opponent', () => {
    room.game!.players[0].role = { state: 'FACE_DOWN', card: { uid: 'seer-role', cardId: 'seer' } }
    render()
    const card = query('.self-field [data-role]')
    dragStart(card, query('[data-player-id="player-2"] .seat-badge'))
    expect(query('.lock-on')).not.toBeNull()
    expect(query('.lock-on').textContent).toBe('')
    pointer(card, 'pointerup', 200, 200)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'REVEAL_ROLE', targetId: 'player-2' })
  })

  it('does not lock onto an invalid self-attack and updates the target before release', () => {
    const card = hand('attack2')
    dragStart(card, query('[data-player-id="player-2"] .seat-badge'))
    hit.mockReturnValue(query('.self-status .seat-badge'))
    pointer(card, 'pointermove', 100, 400)
    expect(query('.lock-on')).toBeNull()
    hit.mockReturnValue(query('[data-player-id="player-3"] .seat-badge'))
    pointer(card, 'pointermove', 300, 200)
    expect(query('[data-player-id="player-3"] .lock-on')).not.toBeNull()
    pointer(card, 'pointerup', 300, 200)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: 'player-3' })
  })

  it('sets a role in its slot and offers CO in the installed role popup', () => {
    const card = hand('wolf')
    dragStart(card, query('.self-field [data-role]'))
    pointer(card, 'pointerup', 200, 200)
    expect(send).toHaveBeenLastCalledWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'SET_ROLE' })
    const game = structuredClone(room.game!)
    game.players[0].role = { state: 'FACE_DOWN', card: game.players[0].hand.pop()! }
    room = { ...room, game }
    render()
    click(query('.self-field [data-role]'))
    expect(query('.card-popover').textContent).toContain('CO')
    click(query('.popover-action'))
    expect(send).toHaveBeenLastCalledWith({ type: 'REVEAL_ROLE' })
  })

  it('supports keyboard target selection without an instruction button and Escape to cancel', () => {
    const card = hand('attack2')
    click(card)
    expect(query('.popover-action')).toBeNull()
    act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    expect(query('.is-aiming')).not.toBeNull()
    escape()
    expect(query('.is-aiming')).toBeNull()
    expect(send).not.toHaveBeenCalled()
    click(card)
    act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    click(query('[data-player-id="player-2"] .seat-badge'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: 'player-2' })
  })
  it('keeps effect descriptions but removes visible usage instructions and target buttons', () => {
    click(hand('attack2'))
    expect(query('.card-popover').textContent).toContain('誰か1人へ2の通常ダメージ')
    expect(query('.popover-hint')).toBeNull()
    expect(query('.table-hint')).toBeNull()
    expect(container.textContent).not.toMatch(/ドラッグ|使用先を選ぶ|ホバーで|攻撃の対象へ/)
  })

  it('keeps logs collapsed initially and does not disclose opponent hidden roles', () => {
    room.game!.players[1].role = { state: 'FACE_DOWN', card: { uid: 'secret', cardId: 'seer' } }
    hand('defense1')
    expect(query<HTMLDetailsElement>('.table-log').open).toBe(false)
    click(query('[data-player-id="player-2"] [data-role]'))
    expect(query('.card-popover').textContent).toContain('伏せ役職')
    expect(query('.card-popover').textContent).not.toContain('占い師')
  })

  it('animates the damaged player and updates their HP bar', () => {
    hand('defense1')
    const animate = vi.spyOn(HTMLElement.prototype, 'animate')
    const game = structuredClone(room.game!)
    game.players[0].hp = 7
    room = { ...room, game }
    render()
    expect(query('.self-status .seat-life > b').textContent).toBe('7')
    expect(query<HTMLElement>('.self-status .life-track i').style.width).toBe('70%')
    expect(animate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ transform: 'translateX(-5px)', background: '#683c32' })]), expect.objectContaining({ duration: 350 }))
  })
  it('allows an explicit self attack with twins without changing the self-defense drag', () => {
    click(hand('twins2'))
    click(Array.from(document.querySelectorAll('button')).find(b => b.textContent === '自分を攻撃する')!)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: 'player-1' })
  })
  it('asks for double-edge damage before consuming the card and cancels with Escape', () => {
    const card = hand('doubleEdge')
    dragStart(card, query('[data-player-id="player-2"]'))
    pointer(card, 'pointerup', 200, 200)
    expect(query('.table-decision [aria-label="通常ダメージの基礎値"]')).not.toBeNull()
    expect(query('.choice-backdrop, select')).toBeNull()
    expect(send).not.toHaveBeenCalled()
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(query('.table-decision')).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })
  it('submits a required choice outside the responders turn once and preserves selection order', () => {
    room.game!.currentPlayerIndex = 1
    room.game!.pendingChoice = { id: 'test-choice', kind: 'DRAW', playerId: 'player-1', sourceId: 'player-1', title: '順番を選ぶ', min: 2, max: 2, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }
    render()
    const button = query<HTMLButtonElement>('.choice-panel button')
    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('選択を確定')
    const inputs = document.querySelectorAll('.spread-card')
    click(inputs[1]); click(inputs[0]); click(button); click(button)
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'test-choice', selected: ['b', 'a'], targetId: undefined })
  })
  it('shows waiting without exposing private options for another responder', () => {
    room.game!.pendingChoice = { id: 'other-choice', kind: 'TRADE', playerId: 'player-2', sourceId: 'player-1', title: '選択待ち', min: 1, max: 1, options: [] }
    render()
    expect(query('.choice-panel').textContent).toContain('Otherが選択中です')
    expect(document.querySelectorAll('.choice-panel input')).toHaveLength(0)
    expect(query<HTMLButtonElement>('.table-tools button').disabled).toBe(true)
  })
  it('spreads deck cards on the table and preserves pick order without a modal', () => {
    room.game!.pendingChoice = { id: 'deck-choice', kind: 'DRAW', playerId: 'player-1', sourceId: 'player-1', title: '2枚選ぶ', min: 2, max: 2,
      options: [{ id: 'a', label: '人狼', card: { uid: 'a', cardId: 'wolf' } }, { id: 'b', label: '巫女の願い', card: { uid: 'b', cardId: 'prayer' } }] }
    render()
    expect(query('.choice-backdrop, [aria-modal="true"]')).toBeNull()
    expect(document.querySelectorAll('.card-spread .paper-card')).toHaveLength(2)
    expect(query('.card-spread .paper-name').textContent).toBe('人狼')
    expect(query('.deck-pile.is-choice-source')).not.toBeNull()
    const inputs = document.querySelectorAll('.spread-card')
    click(inputs[1]); click(inputs[0])
    expect(Array.from(document.querySelectorAll('.choice-number')).map(e => e.textContent)).toEqual(['2', '1'])
    click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'deck-choice', selected: ['b', 'a'], targetId: undefined })
  })
  it.each(['TRADE', 'VOTE', 'DEMAND', 'RESCUE'] as const)('selects %s cards directly from the existing hand without a modal copy', kind => {
    room.game!.currentPlayerIndex = 1
    room.game!.players[0].hand = [{ uid: 'a', cardId: 'wolf' }, { uid: 'b', cardId: 'prayer' }, { uid: 'c', cardId: 'hope' }]
    room.game!.pendingChoice = { id: `hand-${kind}`, kind, playerId: 'player-1', sourceId: 'player-2', title: '手札を選ぶ', min: 0, max: 1,
      options: [{ id: 'b', label: '巫女の願い', card: { uid: 'b', cardId: 'prayer' } }, { id: 'c', label: '一縷の希望', card: { uid: 'c', cardId: 'hope' } }] }
    render()
    expect(query('.choice-backdrop')).toBeNull()
    expect(query('.hand-choice-panel')).not.toBeNull()
    expect(document.querySelectorAll('.choice-panel .paper-card')).toHaveLength(0)
    expect(document.querySelectorAll('.choice-eligible')).toHaveLength(2)
    const cards = document.querySelectorAll('.hand-card')
    click(cards[0]); expect(query('.hand-choice-number')).toBeNull()
    click(cards[1]); expect(cards[1].getAttribute('aria-pressed')).toBe('true')
    expect(query('.card-popover')).toBeNull()
    click(cards[1]); expect(cards[1].getAttribute('aria-pressed')).toBe('false')
    click(cards[1]); click(cards[2])
    expect(cards[1].getAttribute('aria-pressed')).toBe('false')
    if (kind === 'VOTE') {
      expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
      click(query('[data-player-id="player-2"] .seat-badge'))
      expect(query('.selection-count').textContent).toContain('投票先：Other')
    }
    click(query('.choice-panel .primary')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: `hand-${kind}`, selected: ['c'], targetId: kind === 'VOTE' ? 'player-2' : undefined })
  })
  it('limits direct hand selection, preserves order, and resets for the next choice', () => {
    room.game!.players[0].hand = ['wolf', 'prayer', 'hope'].map((cardId, i) => ({ uid: `${i}`, cardId }))
    room.game!.pendingChoice = { id: 'trade-first', kind: 'TRADE', playerId: 'player-1', sourceId: 'player-2', title: '交換', min: 2, max: 2,
      options: room.game!.players[0].hand.map(card => ({ id: card.uid, label: card.cardId, card })) }
    render()
    const cards = document.querySelectorAll('.hand-card')
    click(cards[2]); click(cards[0]); click(cards[1])
    expect(cards[1].getAttribute('aria-pressed')).toBe('false')
    expect(Array.from(document.querySelectorAll('.hand-choice-number')).map(e => e.textContent)).toEqual(['2', '1'])
    click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'trade-first', selected: ['2', '0'], targetId: undefined })
    room.game!.pendingChoice = { ...room.game!.pendingChoice!, id: 'trade-next' }
    render()
    expect(document.querySelectorAll('.hand-choice-number')).toHaveLength(0)
    expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
  })
  it('blocks direct hand confirmation while disconnected and allows selecting after reconnect', () => {
    room.game!.players[0].hand = [{ uid: 'prayer', cardId: 'prayer' }]
    room.game!.pendingChoice = { id: 'rescue-reconnect', kind: 'RESCUE', playerId: 'player-1', sourceId: 'player-2', title: '救済', min: 0, max: 1,
      options: [{ id: 'prayer', label: '巫女の願い', card: { uid: 'prayer', cardId: 'prayer' } }] }
    render(false)
    click(query('.hand-card'))
    expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
    expect(send).not.toHaveBeenCalled()
    render(); click(query('.hand-card')); click(query('.choice-panel .primary'))
    render(false); render()
    click(query('.hand-card')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('raises installed defenses from the self field and keeps the source and skip beside the deck', () => {
    room.game!.currentPlayerIndex = 1
    room.game!.pendingChoice = { id: 'installed-choice', kind: 'DEFENSE', playerId: 'player-1', sourceId: 'player-2', title: '防御を発動', min: 0, max: 1,
      sourceCard: { uid: 'attack', cardId: 'burst' }, presentation: { summary: '5の通常ダメージ · 今回の1ヒット', skip: 'HP 10 → 5（5ダメージ）', options: { shield: 'この1ヒットを無効化。HP 10 → 10' } },
      options: [{ id: 'shield', label: 'ジャストガード', card: { uid: 'shield', cardId: 'justGuard' } }] }
    render()
    expect(query('.choice-backdrop')).toBeNull()
    expect(query('.self-seat .defense-card-face .paper-card.defense')).not.toBeNull()
    expect(query('.table-center [aria-label="効果元：瞬間火力"]')).not.toBeNull()
    expect(query('.table-center .defense-skip-result').textContent).toContain('HP 10 → 5')
    expect(query('.hand-fan').hasAttribute('inert')).toBe(true)
    expect(query('.hand-choice-panel')).toBeNull()
    expect(query<HTMLButtonElement>('.defense-use').disabled).toBe(true)
    click(query('.defense-choice-card'))
    expect(query('.defense-choice-card').getAttribute('aria-pressed')).toBe('true')
    click(query('.defense-use')); click(query('.defense-use'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'installed-choice', selected: ['shield'], targetId: undefined })
  })
  it('skips a defense even after selecting it and restores choices after reconnect', () => {
    room.game!.pendingChoice = { id: 'defense-skip', kind: 'DEFENSE', playerId: 'player-1', sourceId: 'player-2', title: '防御', min: 0, max: 1,
      options: [{ id: 'shield', label: 'ジャストガード', card: { uid: 'shield', cardId: 'justGuard' } }, { id: 'trap', label: 'トラップ', card: { uid: 'trap', cardId: 'trap' } }] }
    render(false)
    expect(query<HTMLButtonElement>('.defense-skip').disabled).toBe(true)
    expect(query<HTMLButtonElement>('.defense-choice-card').disabled).toBe(true)
    render()
    act(() => query<HTMLButtonElement>('.defense-choice-card').focus())
    act(() => query('.defense-card-row').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(document.activeElement?.getAttribute('aria-label')).toContain('トラップ')
    click(document.activeElement!)
    click(query('.defense-skip')); click(query('.defense-skip'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'defense-skip', selected: [], targetId: undefined })
  })
  it('compares giving and refusing demand with its source card while keeping the hand on the table', () => {
    room.game!.players[0].hand = [{ uid: 'gift', cardId: 'wolf' }]
    room.game!.pendingChoice = { id: 'demand-result', kind: 'DEMAND', playerId: 'player-1', sourceId: 'player-2', title: '強欲な提案', min: 0, max: 1,
      sourceCard: { uid: 'cause', cardId: 'demand' }, presentation: { summary: 'Otherへ手札を1枚渡すか、拒否する', skip: 'HP 10 → 7（3ダメージ）', skipLabel: '拒否する', options: { gift: '「人狼」をOtherへ渡す。HP 10 → 10' } },
      options: [{ id: 'gift', label: '人狼', card: { uid: 'gift', cardId: 'wolf' } }] }
    render()
    expect(query('.choice-backdrop')).toBeNull()
    expect(query('.effect-source [aria-label="効果元：強欲な提案"]')).not.toBeNull()
    expect(query('.choice-comparison').textContent).toContain('HP 10 → 7')
    expect(query('.choice-panel .primary').textContent).toBe('拒否する')
    advance(550)
    expect(query('.card-popover')).toBeNull()
    click(query('.hand-card'))
    expect(query('.choice-comparison .is-current').textContent).toContain('「人狼」をOtherへ渡す')
    expect(query('.choice-panel .primary').textContent).toBe('選んだカードを渡す')
  })

  it.each(['GUARD', 'SEER', 'ASSASSIN'] as const)('selects %s from the actual seats and roles, including self, only among server candidates', kind => {
    room.game!.currentPlayerIndex = 1
    room.game!.players[3].status = 'DEAD'
    room.game!.pendingChoice = { id: kind, kind, playerId: 'player-1', sourceId: 'player-1', title: '対象', min: 1, max: 1,
      options: [{ id: 'player-1', label: 'Self' }, { id: 'player-2', label: 'Other' }],
      presentation: { summary: '対象を選択', options: { 'player-1': 'Selfへ発動', 'player-2': 'Otherへ発動' } } }
    render()
    expect(query('.choice-backdrop, select, [aria-modal="true"]')).toBeNull()
    expect(query<HTMLButtonElement>('[data-player-id="player-3"] .seat-badge').disabled).toBe(true)
    expect(query<HTMLButtonElement>('[data-player-id="player-4"] .seat-badge').disabled).toBe(true)
    expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
    click(query('[data-player-id="player-2"] [data-role]'))
    expect(query('[data-player-id="player-2"] .lock-on')).not.toBeNull()
    expect(query('.choice-outcome').textContent).toContain('Otherへ発動')
    click(query('.self-status .seat-badge'))
    expect(query('[data-player-id="player-2"] .lock-on')).toBeNull()
    expect(query('.self-status .seat-badge').getAttribute('aria-pressed')).toBe('true')
    click(query('.choice-panel .primary')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: kind, selected: ['player-1'], targetId: undefined })
  })

  it('resets seat selection on disconnect and lets an optional responder skip', () => {
    room.game!.pendingChoice = { id: 'optional', kind: 'ASSASSIN', playerId: 'player-1', sourceId: 'player-1', title: '対象', min: 0, max: 1,
      options: [{ id: 'player-2', label: 'Other' }] }
    render(); click(query('[data-player-id="player-2"] .seat-badge'))
    render(false)
    expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
    expect(query('.lock-on')).toBeNull()
    render(); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'optional', selected: [], targetId: undefined })
  })

  it('orders effects by clicking the existing cards across different fields', () => {
    room.game!.effects = [
      { id: 'wall-end', kind: 'WALL', ownerId: 'player-1', targetId: 'player-1', expires: 1, timing: 'END', card: { uid: 'wall', cardId: 'wall' } },
      { id: 'delay-end', kind: 'DELAY', ownerId: 'player-1', targetId: 'player-2', expires: 1, timing: 'END', sourceCard: { uid: 'delay', cardId: 'reprieve' }, value: 10 },
      { id: 'unrelated', kind: 'REDUCE', ownerId: 'player-3', targetId: 'player-3', expires: 2, timing: 'START' },
    ]
    room.game!.pendingChoice = { id: 'order', kind: 'ORDER', playerId: 'player-1', sourceId: 'player-1', title: '処理順', min: 2, max: 2,
      options: [{ id: 'wall-end', label: 'ウォールバリア' }, { id: 'delay-end', label: '残虐な猶予' }] }
    render()
    expect(query('.card-spread, .choice-backdrop, select')).toBeNull()
    expect(document.querySelectorAll('.installed-card.is-eligible')).toHaveLength(2)
    click(query('[data-effect-id="delay-end"]')); click(query('[data-effect-id="wall-end"]'))
    expect(query('[data-effect-id="delay-end"] .choice-number').textContent).toBe('1')
    expect(query('[data-effect-id="wall-end"] .choice-number').textContent).toBe('2')
    expect(query('.card-popover')).toBeNull()
    click(query('.choice-panel .primary')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'order', selected: ['delay-end', 'wall-end'], targetId: undefined })
  })

  it('marks the discard source and selects recovery from its on-table spread', () => {
    const card = { uid: 'recover', cardId: 'wolf' }
    room.game!.players[1].discard = [card]
    room.game!.pendingChoice = { id: 'recover', kind: 'RECOVER', playerId: 'player-1', sourceId: 'player-1', targetId: 'player-2', title: '回収', min: 1, max: 1,
      options: [{ id: card.uid, label: '人狼', card }] }
    render()
    expect(query('[data-player-id="player-2"] .discard-zone.is-choice-source')).not.toBeNull()
    expect(query('.card-spread').getAttribute('aria-label')).toBe('Otherの捨て札')
    click(query('.spread-card')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'recover', selected: ['recover'], targetId: undefined })
  })

  it('inspects the discard without blocking the table and closes with Escape', () => {
    room.game!.players[1].discard = [{ uid: 'public', cardId: 'treatment' }]
    render(); click(query('[data-player-id="player-2"] [data-discard]'))
    expect(query('.card-spread').textContent).toContain('適切な治療')
    expect(query('.card-spread').textContent).not.toContain('HPを4回復')
    pointer(query('.spread-card'), 'pointerover'); advance(550)
    expect(query('.card-popover').textContent).toContain('HPを4回復')
    expect(query('dialog, .choice-backdrop, [aria-modal="true"]')).toBeNull()
    expect(query<HTMLButtonElement>('.end-turn').disabled).toBe(false)
    escape()
    expect(query('.card-spread')).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('shows a spread candidates effect after hovering without changing its selection', () => {
    room.game!.pendingChoice = { id: 'deck-hover', kind: 'DRAW', playerId: 'player-1', sourceId: 'player-1', title: '山札', min: 1, max: 1,
      options: [{ id: 'pick', label: '適切な治療', card: { uid: 'pick', cardId: 'treatment' } }] }
    render()
    pointer(query('.spread-card'), 'pointerover'); advance(549)
    expect(query('.card-popover')).toBeNull()
    advance(1)
    expect(query('.card-popover').textContent).toContain('HPを4回復')
    expect(query('.spread-card').getAttribute('aria-pressed')).toBe('false')
    click(query('.spread-card'))
    expect(query('.card-popover')).toBeNull()
    expect(query('.spread-card').getAttribute('aria-pressed')).toBe('true')
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps removed or inactive installed cards from causing stale hover details or unsafe actions', () => {
    room.game!.players[1].status = 'DEAD'
    room.game!.players[1].installed = [{ uid: 'old', cardId: 'trap' }]
    render(false)
    click(query('[data-field-entry="old"]'))
    expect(query('.card-popover').textContent).toContain('現在は無効')
    expect(query('[data-field-entry="old"]').className).toContain('is-inactive')
    expect(send).not.toHaveBeenCalled()
  })

  it('chooses a second role on the table after dropping role swap, without allowing the same seat', () => {
    const card = hand('roleSwap')
    dragStart(card, query('[data-player-id="player-2"] [data-role]')); pointer(card, 'pointerup', 200, 200)
    expect(query('select, .choice-backdrop')).toBeNull()
    expect(query('[data-player-id="player-2"] .role-zone .choice-number').textContent).toBe('1')
    expect(query<HTMLButtonElement>('[data-player-id="player-2"] .seat-badge').disabled).toBe(true)
    expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
    click(query('[data-player-id="player-3"] [data-role]'))
    expect(query('[data-player-id="player-3"] .role-zone .choice-number').textContent).toBe('2')
    expect(query('.configure-result').textContent).toContain('② Third')
    click(query('.choice-panel .primary')); click(query('[data-player-id="player-3"] .seat-badge'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'STATEMENT', targetId: 'player-2', secondTargetId: 'player-3', amount: 1, double: false })
  })

  it('configures double edge with numeric buttons and cancels a stale configuration on reconnect', () => {
    const card = hand('doubleEdge')
    dragStart(card, query('[data-player-id="player-2"]')); pointer(card, 'pointerup', 200, 200)
    const four = query('.number-choices button:nth-child(4)')
    click(four)
    expect(four.getAttribute('aria-pressed')).toBe('true')
    expect(query('.configure-result').textContent).toContain('基礎値4')
    render(false); render()
    expect(query('.table-decision')).toBeNull()
    expect(send).not.toHaveBeenCalled()
    dragStart(card, query('[data-player-id="player-2"]')); pointer(card, 'pointerup', 200, 200)
    click(query('.number-choices button:nth-child(4)')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: 'player-2', amount: 4, double: false })
  })

  it('configures the citizens double statement using buttons', () => {
    room.game!.players[0].role = { state: 'REVEALED', card: { uid: 'role', cardId: 'citizen' } }
    const card = hand('treatment')
    dragStart(card, query('.self-status .seat-badge')); pointer(card, 'pointerup', 200, 200)
    click(query('[aria-label="市民の能力"] button:nth-child(2)'))
    expect(query('.configure-result').textContent).toContain('2回解決')
    click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'STATEMENT', targetId: 'player-1', amount: 1, double: true })
  })

  it.each(['hand', 'face-down', 'ability'] as const)('selects the seer %s target from the table', mode => {
    if (mode === 'hand') click(hand('seer'))
    else {
      room.game!.players[0].role = { state: mode === 'ability' ? 'REVEALED' : 'FACE_DOWN', card: { uid: 'seer-role', cardId: 'seer' } }
      render(); click(query('.self-field [data-role]'))
    }
    click(query('.popover-action'))
    expect(query('.card-popover, select, .choice-backdrop')).toBeNull()
    expect(query('[aria-label="効果元：占い師"]')).not.toBeNull()
    click(query('[data-player-id="player-2"] .seat-badge'))
    expect(query('.decision-result').textContent).toContain(mode === 'ability' ? 'Otherの手札を確認' : 'Otherの役職を強制開示')
    click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith(mode === 'hand' ? { type: 'PLAY_CARD', cardUid: 'held', choice: 'REVEAL_ROLE', targetId: 'player-2' } : { type: mode === 'ability' ? 'ROLE_ABILITY' : 'REVEAL_ROLE', targetId: 'player-2' })
  })

  it('shows individual defense faces and conditions without a pooled shield, and explains timed effects on hover', () => {
    room.game!.players[0].shield = 99
    room.game!.players[0].installed = [{ uid: 'twins', cardId: 'twins4' }, { uid: 'trap', cardId: 'trap' }]
    room.game!.players[1].installed = [{ uid: 'just', cardId: 'justGuard' }]
    room.game!.effects = [{ id: 'timed', kind: 'WALL', ownerId: 'player-1', targetId: 'player-1', expires: 2, timing: 'END', card: { uid: 'wall', cardId: 'wall' } }]
    render()
    expect(query('.seat-shield')).toBeNull()
    expect(query('.self-status .seat-badge').getAttribute('aria-label')).not.toContain('99')
    expect(query('[data-field-entry="twins"] .paper-card.defense .card-corner b').textContent).toBe('4')
    expect(query('[data-field-entry="twins"] .installed-condition').textContent).toContain('4以下')
    expect(query('[data-field-entry="trap"] .installed-condition').textContent).toContain('反撃 2')
    expect(query('[data-field-entry="just"] .installed-condition').textContent).toContain('3以上')
    pointer(query('[data-effect-id="timed"]'), 'pointerover'); advance(550)
    expect(query('.card-popover').textContent).toContain('Selfの1ターン後の終了時まで')
  })

  it('does not animate a blocked hit as HP damage when an installed card is consumed', () => {
    room.game!.players[0].installed = [{ uid: 'shield', cardId: 'twins4' }]
    room.game!.players[0].shield = 4
    render()
    const animation = vi.spyOn(HTMLElement.prototype, 'animate')
    room = { ...room, game: structuredClone(room.game!) }
    room.game!.players[0].installed = []
    room.game!.players[0].shield = 0
    render()
    expect(animation).not.toHaveBeenCalled()
  })

  it('updates the hand number from live statement counts and omits numbering for single picks', () => {
    hand('lightning')
    expect(query('.hand-card .card-corner b').textContent).toBe('0')
    room = { ...room, game: structuredClone(room.game!) }
    room.game!.players[0].turnStatements = 3
    render()
    expect(query('.hand-card .card-corner b').textContent).toBe('3')
    room.game!.pendingChoice = { id: 'one', kind: 'DEMAND', playerId: 'player-1', sourceId: 'player-2', title: '手札1枚', min: 0, max: 1, options: [{ id: 'held', label: 'ライトニングレシーブ' }] }
    render(); click(query('.hand-card'))
    expect(query('.hand-card').getAttribute('aria-pressed')).toBe('true')
    expect(query('.hand-choice-number')).toBeNull()
    click(query('.hand-card'))
    expect(query('.fan-card-slot.is-selected')).toBeNull()
    expect(query('.hand-choice-number')).toBeNull()
  })
  it('chooses cake and wine modes with buttons and keeps the original target', () => {
    const card = hand('cakeWine')
    dragStart(card, query('[data-player-id="player-2"]')); pointer(card, 'pointerup', 200, 200)
    click(query('[aria-label="効果モード"] button:nth-child(2)'))
    expect(query('.configure-result').textContent).toContain('HP7まで回復')
    click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'STATEMENT', targetId: 'player-2', amount: 1, double: false, mode: 'WINE' })
    expect(query('select, .choice-backdrop')).toBeNull()
  })
  it('requires a matching rain allocation before confirmation', () => {
    const card = hand('rain')
    dragStart(card, query('.self-status .seat-badge')); pointer(card, 'pointerup', 200, 200)
    expect(query<HTMLButtonElement>('.choice-panel .primary').disabled).toBe(true)
    click(query('[aria-label="Otherへの分配を増やす"]'))
    expect(query('.configure-result').textContent).toContain('分配 1 / 1')
    click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'PLAY_CARD', cardUid: 'held', choice: 'ATTACK', targetId: 'player-1', amount: 1, double: false, distribution: { 'player-2': 1 } })
  })
  it('chooses a love target from actual seats without a copied player list', () => {
    room.game!.pendingChoice = { id: 'love-choice', kind: 'LOVE_TARGET', playerId: 'player-1', sourceId: 'player-1', sourceCard: { uid: 'love-role', cardId: 'lover' }, title: '愛する人', min: 1, max: 1, options: [{ id: 'player-2', label: 'Other' }] }
    render(); click(query('[data-player-id="player-2"] .seat-badge')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'love-choice', selected: ['player-2'], targetId: undefined })
    expect(query('select, .choice-backdrop')).toBeNull()
  })
  it('renders scissors choices only as backs, without showing hidden card names', () => {
    room.game!.pendingChoice = { id: 'scissors', kind: 'SCISSORS', playerId: 'player-1', sourceId: 'player-1', title: '裏向きの手札', targetId: 'player-2', min: 1, max: 1, options: [{ id: 'back-0', label: '裏向きの手札 1' }, { id: 'back-1', label: '裏向きの手札 2' }] }
    render()
    expect(document.querySelectorAll('.card-spread .card-back')).toHaveLength(2)
    expect(document.querySelectorAll('.card-spread .paper-card')).toHaveLength(0)
    click(query('.spread-card')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'scissors', selected: ['back-0'], targetId: undefined })
  })
  it('uses direct hand selection for damage counters and crow exchange', () => {
    hand('counterA')
    room.game!.currentPlayerIndex = 1
    room.game!.pendingChoice = { id: 'counter-response', kind: 'DAMAGE_RESPONSE', playerId: 'player-1', sourceId: 'player-2', title: 'ダメージへの誘発', min: 0, max: 1, options: [{ id: 'held', label: 'カウンターα', card: { uid: 'held', cardId: 'counterA' } }] }
    render(); click(query('.hand-card')); click(query('.choice-panel .primary'))
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'RESOLVE_CHOICE', choiceId: 'counter-response', selected: ['held'], targetId: undefined })
  })
  it('shows the phase countdown and extra turn, including shared winners', () => {
    room.game!.phase = 2; room.game!.extraTurn = true
    render(); expect(query('.table-phase').textContent).toContain('切替まで1フェーズ · 追加ターン')
    room.game!.winnerId = 'player-1'; room.game!.winnerIds = ['player-1', 'player-2']
    render(); expect(query('.center-turn').textContent).toContain('Self・Other の勝利')
  })
})
