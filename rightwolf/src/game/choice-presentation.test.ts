import { describe, expect, it } from 'vitest'
import { createGame, endTurn, playCard, resolveChoice, revealRole } from './engine'
import { describeChoice } from './choice-presentation'
import type { GameResult, GameState, PlayCardInput } from './types'

const ok = (r: GameResult) => { if (!r.ok) throw new Error(r.error); return r.state }
const game = () => createGame(['A', 'B', 'C'], () => .5, [])
function play(s: GameState, cardId: string, extra: Partial<PlayCardInput> = {}) {
  const p = s.players[s.currentPlayerIndex]
  const card = { uid: `source-${cardId}`, cardId }; p.hand.push(card)
  return ok(playCard(s, { playerId: p.id, cardUid: card.uid, choice: 'ATTACK', targetId: 'player-2', ...extra }))
}
const answer = (s: GameState, selected: string[] = []) => ok(resolveChoice(s, s.pendingChoice!.playerId, s.pendingChoice!.id, selected))
const preview = (s: GameState) => describeChoice(s, s.pendingChoice!)

describe('choice source and consequences', () => {
  it('keeps each hit source and forecasts defense against the actual reduced damage', () => {
    let s = game()
    s.players[1].installed = [{ uid: 'block', cardId: 'forceArrow' }]
    s.effects = [{ id: 'reduce', kind: 'REDUCE', ownerId: 'player-2', targetId: 'player-2', expires: 2, timing: 'START' }]
    s = play(s, 'forceArrow')
    expect(s.pendingChoice?.sourceCard).toEqual({ uid: 'source-forceArrow', cardId: 'forceArrow' })
    expect(preview(s).summary).toContain('今回の1ヒット')
    expect(preview(s).skip).toContain('HP 10 → 10（0ダメージ）')
    const used = answer(s, ['block'])
    expect(used.players[1].hp).toBe(10)
    expect(used.players[1].discard.some(c => c.uid === 'block')).toBe(true)
    const skipped = answer(s)
    expect(skipped.pendingChoice?.id).not.toBe(s.pendingChoice?.id)
    expect(skipped.pendingChoice?.sourceCard).toEqual(s.pendingChoice?.sourceCard)
    expect(skipped.players[1].hp).toBe(10)
  })
  it('forecasts guarding and trap retaliation without treating a trap as damage prevention', () => {
    let s = game()
    s.players[1].installed = [{ uid: 'trap', cardId: 'trap' }, { uid: 'block', cardId: 'twins2' }]
    s.players[2].role = { state: 'REVEALED', card: { uid: 'knight', cardId: 'knight' } }
    s.players[2].guardTarget = 'player-2'
    s = play(s, 'twins2')
    expect(preview(s).skip).toContain('0ダメージ')
    expect(preview(s).options.trap).toContain('Aへ2ダメージ。今回の攻撃は残る')
    s = answer(s, ['trap'])
    expect(s.players[0].hp).toBe(8)
    expect(s.pendingChoice?.sourceCard?.cardId).toBe('twins2')
    s = answer(s)
    expect(s.players[1].hp).toBe(10)
  })
  it('shows demand transfer/refusal and keeps the source through a death response', () => {
    let s = game()
    s.players[1].hp = 2
    s.players[1].hand = [{ uid: 'rescue', cardId: 'prayer' }]
    s = play(s, 'demand', { choice: 'STATEMENT' })
    expect(s.pendingChoice?.sourceCard?.cardId).toBe('demand')
    expect(preview(s).skip).toContain('HP 2 → 0（3ダメージ）')
    expect(preview(s).options.rescue).toContain('Aへ渡す。HP 2 → 2')
    const given = answer(s, ['rescue'])
    expect(given.players[1].hp).toBe(2)
    expect(given.players[0].hand.some(c => c.uid === 'rescue')).toBe(true)
    const refused = answer(s)
    expect(refused.players[1].hp).toBe(0)
    expect(refused.pendingChoice?.kind).toBe('RESCUE')
    expect(refused.pendingChoice?.sourceCard?.cardId).toBe('demand')
    expect(preview(refused).options.rescue).toContain('HP 0 → 5')
    expect(answer(refused, ['rescue']).players[1].hp).toBe(5)
  })
  it.each(['consider', 'trade'])('preserves %s source and creates a new ID at the second stage', cardId => {
    let s = game()
    s.players[1].hand = [{ uid: 'other', cardId: 'twins2' }]
    s = play(s, cardId, { choice: 'STATEMENT', targetId: cardId === 'consider' ? 'player-1' : 'player-2' })
    const first = s.pendingChoice!
    s = answer(s, first.options.slice(0, cardId === 'consider' ? first.min : 1).map(o => o.id))
    expect(s.pendingChoice?.id).not.toBe(first.id)
    expect(s.pendingChoice?.sourceCard).toEqual(first.sourceCard)
    expect(s.pendingChoice?.sourceCard?.cardId).toBe(cardId)
  })
  it('retains delayed attack source after its user dies without discarding it twice', () => {
    let s = play(game(), 'reprieve')
    s.players[0].status = 'DEAD'; s.players[0].hp = 0
    s.players[1].installed = [{ uid: 'guard', cardId: 'justGuard' }]
    s.currentPlayerIndex = 1
    s.players[1].turnsStarted = s.effects![0].expires
    s = ok(endTurn(s, 'player-2'))
    expect(s.pendingChoice?.kind).toBe('DEFENSE')
    expect(s.pendingChoice?.sourceCard?.cardId).toBe('reprieve')
    expect(preview(s).skip).toContain('10ダメージ')
    expect(s.players.flatMap(p => p.discard).filter(c => c.uid === 'source-reprieve')).toHaveLength(1)
  })
  it('identifies a revealed role as the origin of its choice', () => {
    const s = game()
    s.players[0].role = { state: 'FACE_DOWN', card: { uid: 'role', cardId: 'assassin' } }
    const revealed = ok(revealRole(s, 'player-1'))
    expect(revealed.pendingChoice?.sourceCard).toEqual({ uid: 'role', cardId: 'assassin' })
    expect(preview(revealed).options['player-2']).toContain('殺害')
  })
})
