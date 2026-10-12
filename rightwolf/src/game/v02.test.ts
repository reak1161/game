import { describe, expect, it } from 'vitest'
import { BASIC_CARDS, BASIC_CARD_COUNT, createDeck, PLAYABLE_CARD_COUNT } from './cards'
import { calculateAttack, createGame, endTurn, playCard, resolveChoice, revealRole, useRoleAbility } from './engine'
import type { GameResult, GameState, PlayCardInput } from './types'

const ok = (r: GameResult) => { if (!r.ok) throw new Error(r.error); return r.state }
const game = (n = 3) => createGame(Array.from({ length: n }, (_, i) => `P${i + 1}`), () => .5, [])
function play(s: GameState, cardId: string, extra: Partial<PlayCardInput> = {}) {
  const p = s.players[s.currentPlayerIndex]
  p.hand.push({ uid: `test-${cardId}-${s.nextLogId}`, cardId })
  return ok(playCard(s, { playerId: p.id, cardUid: p.hand.at(-1)!.uid, choice: 'ATTACK', targetId: 'player-2', ...extra }))
}
const respond = (s: GameState, selected: string[] = [], targetId?: string) => ok(resolveChoice(s, s.pendingChoice!.playerId, s.pendingChoice!.id, selected, targetId))
const end = (s: GameState) => ok(endTurn(s, s.players[s.currentPlayerIndex].id))

describe('v0.2 rules', () => {
  it('catalogues 65 cards and excludes the eight unresolved copies', () => {
    expect(BASIC_CARD_COUNT).toBe(65)
    expect(PLAYABLE_CARD_COUNT).toBeGreaterThanOrEqual(57)
    expect(createDeck(Math.random, [])).toHaveLength(57)
    expect(BASIC_CARDS.filter(c => c.kind === 'STATEMENT')).toHaveLength(19)
    expect(createDeck(Math.random, []).some(c => BASIC_CARDS.find(d => d.id === c.cardId)!.unresolved)).toBe(false)
  })
  it('adds percent modifiers before applying multipliers and floors once', () => {
    expect(calculateAttack(3, 1, [50, 100, -20], [2])).toBe(18)
  })
  it('consumes one installed defense for one arrow hit, not a pool of shield points', () => {
    let s = game()
    s.players[1].installed = [{ uid: 'block', cardId: 'twins5' }]
    // LV.5 lives on the force-arrow twins.
    s.players[1].installed[0].cardId = 'forceArrow'
    s = play(s, 'forceArrow')
    expect(s.pendingChoice?.kind).toBe('DEFENSE')
    s = respond(s, ['block'])
    expect(s.players[1].hp).toBe(7)
    expect(s.players[1].discard.some(c => c.uid === 'block')).toBe(true)
  })
  it('does not offer a low-level defense against a larger hit', () => {
    const s = game()
    s.players[1].installed = [{ uid: 'block', cardId: 'twins1' }]
    const result = play(s, 'burst')
    expect(result.pendingChoice).toBeNull()
    expect(result.players[1].hp).toBe(5)
    expect(result.players[1].installed).toHaveLength(1)
  })
  it('stops remaining hits on death and continues a confirmed all-player attack after its user dies', () => {
    let s = game()
    s.players[0].hp = 1
    s = play(s, 'slash')
    expect(s.players[0].status).toBe('DEAD')
    expect(s.players[1].hp).toBe(6)
    expect(s.players[2].hp).toBe(6)
    expect(s.currentPlayerIndex).toBe(1)
  })
  it('can trigger trap and then a separate defense even when final damage becomes zero', () => {
    let s = game()
    s.players[1].installed = [{ uid: 'trap', cardId: 'trap' }, { uid: 'shield', cardId: 'twins2' }]
    s = play(s, 'twins2')
    s = respond(s, ['trap'])
    expect(s.players[0].hp).toBe(8)
    expect(s.pendingChoice?.kind).toBe('DEFENSE')
    s = respond(s, ['shield'])
    expect(s.players[1].hp).toBe(10)
  })
  it('can activate trap after a defense has reduced the attack to zero', () => {
    let s = game()
    s.players[1].installed = [{ uid: 'trap', cardId: 'trap' }, { uid: 'shield', cardId: 'twins2' }]
    s = respond(play(s, 'twins2'), ['shield'])
    expect(s.pendingChoice?.options.map(o => o.id)).toEqual(['trap'])
    s = respond(s, ['trap'])
    expect(s.players[0].hp).toBe(8); expect(s.players[1].hp).toBe(10)
  })
  it('does not grant medium a kill bonus for ordinary damage deaths', () => {
    let s = game()
    s.players[0].role = { state: 'REVEALED', card: { uid: 'medium', cardId: 'medium' } }
    s.players[1].hp = 1; s.players[1].hand = []
    s = play(s, 'twins2')
    expect(s.players[0].attackPercent ?? 0).toBe(0)
  })
  it('hope cannot rescue HP loss from an attack card below the damage threshold', () => {
    let s = game()
    s.players[1].hp = 1; s.players[1].hand = [{ uid: 'hope', cardId: 'hope' }]
    s = play(s, 'brand')
    expect(s.players[1].status).toBe('DEAD')
    expect(s.pendingChoice).toBeNull()
  })
  it('HP loss bypasses defense and attack multipliers, and torture floors the result', () => {
    let s = game()
    s.players[0].role = { state: 'REVEALED', card: { uid: 'wolf', cardId: 'wolf' } }
    s.players[1].installed = [{ uid: 'shield', cardId: 'forceArrow' }]
    s = play(s, 'brand')
    expect(s.players[1].hp).toBe(7)
    s = play(s, 'torture', { choice: 'STATEMENT' })
    expect(s.players[1].hp).toBe(3)
  })
  it('wolf CO halves stats until its next start, then applies night triple attack', () => {
    let s = game(2)
    s = play(s, 'wolf', { choice: 'REVEAL_ROLE', targetId: undefined })
    expect(s.players[0].maxHp).toBe(6)
    expect(s.players[0].handLimit).toBe(1)
    s = end(end(end(end(s))))
    expect(s.players[0].maxHp).toBe(12)
    expect(s.players[0].handLimit).toBe(3)
    s = play(s, 'twins2')
    expect(s.players[1].hp).toBe(4)
  })
  it('forced reveal does not trigger assassin CO', () => {
    let s = game()
    s.players[0].role = { state: 'FACE_DOWN', card: { uid: 'seer', cardId: 'seer' } }
    s.players[1].role = { state: 'FACE_DOWN', card: { uid: 'assassin', cardId: 'assassin' } }
    s = ok(revealRole(s, 'player-1', 'player-2'))
    expect(s.players[1].role.state).toBe('REVEALED')
    expect(s.pendingChoice).toBeNull()
    expect(s.players.every(p => p.hp === 10)).toBe(true)
  })
  it('doll forced reveal deals damage to both players without a CO stat penalty', () => {
    let s = game()
    s.players[0].role = { state: 'FACE_DOWN', card: { uid: 'seer', cardId: 'seer' } }
    s.players[1].role = { state: 'FACE_DOWN', card: { uid: 'doll', cardId: 'doll' } }
    s = ok(revealRole(s, 'player-1', 'player-2'))
    expect(s.players[0].hp).toBe(5)
    expect(s.players[1].hp).toBe(7)
    expect(s.players[1].maxHp).toBe(10)
  })
  it('doll reverses assassination and inherits the assassin HP', () => {
    let s = game()
    s.players[0].hp = 8
    s.players[0].hand = []
    s.players[1].role = { state: 'FACE_DOWN', card: { uid: 'doll', cardId: 'doll' } }
    s = play(s, 'assassin', { choice: 'REVEAL_ROLE' })
    s = respond(s, ['player-2'])
    expect(s.players[0].status).toBe('DEAD')
    expect(s.players[1].hp).toBe(8)
    expect(s.players[1].role.state).toBe('REVEALED')
  })
  it('knight chooses a guard at turn end, prevents attack damage and cannot repeat', () => {
    let s = game(2)
    s.players[0].role = { state: 'REVEALED', card: { uid: 'knight', cardId: 'knight' } }
    s = end(s); s = respond(s, ['player-1'])
    s = play(s, 'burst', { targetId: 'player-1' })
    expect(s.players[0].hp).toBe(10)
    s = end(s); s = end(s)
    expect(s.pendingChoice?.options.map(o => o.id)).toEqual(['player-2'])
  })
  it('seer may inspect a hand only once and logs the result privately', () => {
    const s = game()
    s.players[0].role = { state: 'REVEALED', card: { uid: 'seer', cardId: 'seer' } }
    const result = ok(useRoleAbility(s, 'player-1', 'player-2'))
    expect(result.log[0].visibility).toBe('PRIVATE')
    expect(useRoleAbility(result, 'player-1', 'player-2').ok).toBe(false)
  })
  it('wall persists through the next own turn and does not stop HP loss', () => {
    let s = game(2)
    s = play(s, 'wall', { choice: 'DEFENSE' })
    s = play(s, 'twins2'); expect(s.players[1].hp).toBe(10)
    s = play(s, 'brand', { targetId: 'player-1' }); expect(s.players[0].hp).toBe(7)
    s = end(end(s)); expect(s.effects?.some(e => e.kind === 'WALL')).toBe(true)
    s = end(s); expect(s.effects?.some(e => e.kind === 'WALL')).toBe(false)
  })
  it('death rescue pauses on the dying player and rejects another player response', () => {
    let s = game()
    s.players[1].hp = 1; s.players[1].hand = [{ uid: 'prayer', cardId: 'prayer' }]
    s = play(s, 'twins2')
    expect(s.pendingChoice?.playerId).toBe('player-2')
    expect(resolveChoice(s, 'player-1', s.pendingChoice!.id, ['prayer']).ok).toBe(false)
    s = respond(s, ['prayer'])
    expect(s.players[1].status).toBe('ALIVE'); expect(s.players[1].hp).toBe(5)
  })
  it('hope cannot prevent its own scheduled forced death', () => {
    let s = game(2)
    s = play(s, 'hope', { choice: 'DEFENSE' })
    s.players[0].hand.push({ uid: 'hope2', cardId: 'hope' })
    s = end(end(s)); s = end(s)
    expect(s.players[0].status).toBe('DEAD')
    expect(s.pendingChoice).toBeNull()
  })
  it('reprieve survives its user death and fires on target second turn end', () => {
    let s = game()
    s = play(s, 'reprieve')
    s.players[0].status = 'DEAD'; s.players[0].hp = 0
    s.currentPlayerIndex = 1; s.players[1].turnsStarted = 1
    s = end(s); expect(s.players[1].hp).toBe(10)
    s = end(s); expect(s.players[1].turnsStarted).toBe(2)
    s = end(s); expect(s.players[1].status).toBe('DEAD')
  })
  it('cooling rebuilds the deck without losing or duplicating itself', () => {
    let s = game()
    s.deck = []; s.players.forEach(p => { p.hand = []; p.discard = [] })
    s.players[1].discard = [{ uid: 'a', cardId: 'twins1' }, { uid: 'b', cardId: 'twins2' }]
    s = play(s, 'cooling', { choice: 'STATEMENT' })
    expect(s.deck).toHaveLength(1); expect(s.deck[0].cardId).toBe('cooling')
    expect(s.players[0].hand).toHaveLength(2)
  })
  it('cooling collects installed and duration cards as well as hand and discard', () => {
    let s = game()
    s.deck = []; s.players.forEach(p => { p.hand = []; p.discard = [] })
    s.players[1].installed = [{ uid: 'shield', cardId: 'twins1' }]
    s.effects = [{ id: 'wall', kind: 'WALL', ownerId: 'player-2', targetId: 'player-2', timing: 'END', expires: 1, card: { uid: 'wall-card', cardId: 'wall' } }]
    s = play(s, 'cooling', { choice: 'STATEMENT' })
    expect(s.players[1].installed).toEqual([])
    expect(s.effects).toEqual([])
    expect(s.players[0].hand.map(c => c.uid).sort()).toEqual(['shield', 'wall-card'])
  })
  it('lets the owner order end effects and use installed defense against delayed damage', () => {
    let s = game()
    s = play(s, 'reprieve', { targetId: 'player-1' })
    s = play(s, 'wall', { choice: 'DEFENSE' })
    s.players[0].installed = [{ uid: 'guard', cardId: 'justGuard' }]
    s.effects!.find(e => e.kind === 'DELAY')!.expires = 2
    s = end(end(end(s)))
    s = end(s)
    expect(s.pendingChoice?.kind).toBe('ORDER')
    const delay = s.pendingChoice!.options.find(o => o.label === '残虐な猶予')!
    const wall = s.pendingChoice!.options.find(o => o.id !== delay.id)!
    s = respond(s, [wall.id, delay.id])
    expect(s.pendingChoice?.kind).toBe('DEFENSE')
    s = respond(s, ['guard'])
    expect(s.players[0].hp).toBe(10)
  })
  it('does not declare a solo winner but terminates when the tester dies', () => {
    let s = game(1)
    s.players[0].hp = 1; s.players[0].hand = []
    s = play(s, 'twins2', { targetId: 'player-1' })
    expect(s.winnerId).toBeNull()
    expect(s.draw).toBe(true)
  })
  it('citizen double statement is consumed once and resolves both copies', () => {
    let s = game()
    s.players[0].role = { state: 'REVEALED', card: { uid: 'citizen', cardId: 'citizen' } }
    s.players[0].hp = 1
    s = play(s, 'treatment', { choice: 'STATEMENT', targetId: 'player-1', double: true })
    expect(s.players[0].hp).toBe(9)
    expect(s.players[0].abilityUsed).toBe(true)
    s.players[0].hand.push({ uid: 'more', cardId: 'treatment' })
    expect(playCard(s, { playerId: 'player-1', cardUid: 'more', choice: 'STATEMENT', targetId: 'player-1', double: true }).ok).toBe(false)
  })
  it('consider keeps unchosen deck cards private and respects explicit return order', () => {
    let s = game()
    s.deck = ['twins1', 'twins2', 'twins3', 'twins4'].map((cardId, i) => ({ uid: `${i}`, cardId }))
    s = play(s, 'consider', { choice: 'STATEMENT' })
    s = respond(s, ['3', '1'])
    s = respond(s, ['0', '2'])
    expect(s.deck.map(c => c.uid)).toEqual(['2', '0'])
  })
  it('trade asks both players only for their own cards', () => {
    let s = game()
    s.players[0].hand = [{ uid: 'a', cardId: 'twins1' }]
    s.players[1].hand = [{ uid: 'b', cardId: 'twins2' }]
    s = play(s, 'trade', { choice: 'STATEMENT' }); s = respond(s, ['a'])
    expect(s.pendingChoice?.playerId).toBe('player-2')
    expect(s.pendingChoice?.options.map(o => o.id)).toEqual(['b'])
    s = respond(s, ['b'])
    expect(s.players[0].hand.map(c => c.uid)).toEqual(['b'])
    expect(s.players[1].hand.map(c => c.uid)).toEqual(['a'])
  })
  it('vote damages all tied leaders and waits for each player', () => {
    let s = game()
    s.players.forEach((p, i) => { p.hand = [{ uid: `${i}`, cardId: 'twins1' }] })
    s = play(s, 'vote', { choice: 'STATEMENT' })
    s = respond(s, ['0'], 'player-2'); s = respond(s, ['1'], 'player-1'); s = respond(s)
    expect(s.players.map(p => p.hp)).toEqual([3, 3, 10])
  })
  it('role swap moves public state without triggering CO and return puts spare role at deck bottom', () => {
    let s = game()
    s.players[1].role = { state: 'REVEALED', card: { uid: 'a', cardId: 'assassin' } }
    s.players[2].role = { state: 'FACE_DOWN', card: { uid: 'b', cardId: 'doll' } }
    s = play(s, 'roleSwap', { choice: 'STATEMENT', secondTargetId: 'player-3' })
    expect(s.players[2].role.card?.cardId).toBe('assassin'); expect(s.pendingChoice).toBeNull()
    s.players[0].role = { state: 'REVEALED', card: { uid: 'own', cardId: 'citizen' } }
    s = play(s, 'knight', { choice: 'RETURN_ROLE' })
    expect(s.deck[0].cardId).toBe('knight')
  })
})
