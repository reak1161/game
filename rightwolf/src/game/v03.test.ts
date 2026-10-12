import { describe, expect, it } from 'vitest'
import { ALL_CARDS, createDeck } from './cards'
import { attackValue, createGame, endTurn, normalDamageAmount, playCard, resolveChoice, revealRole } from './engine'
import { canTarget, livingCount } from './v03-rules'
import { CARD_EFFECT_NUMBERS, sumCardEffectNumbers } from './card-numbers'
import { gameView } from '../../server/game-view'
import type { GameResult, GameState, PlayCardInput } from './types'

const ok = (r: GameResult) => { if (!r.ok) throw Error(r.error); return r.state }
function game(n = 3) {
  const s = createGame(Array.from({ length: n }, (_, i) => `P${i + 1}`), () => .5, [])
  s.deck = []; s.players.forEach(p => { p.hand = []; p.discard = [] }); return s
}
function play(s: GameState, cardId: string, extra: Partial<PlayCardInput> = {}) {
  const p = s.players[s.currentPlayerIndex], card = { uid: `${cardId}-${s.nextLogId}`, cardId }
  p.hand.push(card)
  const kind = ALL_CARDS.find(c => c.id === cardId)!.kind
  return ok(playCard(s, { playerId: p.id, cardUid: card.uid, choice: kind === 'ROLE' ? 'REVEAL_ROLE' : kind === 'STATEMENT' ? 'STATEMENT' : kind === 'DEFENSE' ? 'DEFENSE' : 'ATTACK', targetId: 'player-2', ...extra }))
}
const end = (s: GameState) => ok(endTurn(s, s.players[s.currentPlayerIndex].id))
const answer = (s: GameState, ids: string[] = []) => ok(resolveChoice(s, s.pendingChoice!.playerId, s.pendingChoice!.id, ids))
const hold = (s: GameState, i: number, id: string, uid = id) => s.players[i].hand.push({ uid, cardId: id })

describe('v0.3 shared rules', () => {
  it('adds forest thirteen and moon twenty-three definitions, with selectable sets', () => {
    expect(ALL_CARDS.filter(c => c.set === 'FOREST')).toHaveLength(13)
    expect(ALL_CARDS.filter(c => c.set === 'MOON')).toHaveLength(23)
    expect(createDeck(Math.random, [])).toHaveLength(57)
    expect(createDeck(Math.random, ['FOREST'])).toHaveLength(57 + ALL_CARDS.filter(c => c.set === 'FOREST' && !c.unresolved).length)
    expect(createDeck().length).toBe(57 + ALL_CARDS.filter(c => c.set && !c.unresolved).length)
  })
  it('cycles day day night night and retains the cycle when explicitly reversed', () => {
    let s = game(2)
    s = end(end(s)); expect([s.phase, s.time]).toEqual([2, 'DAY'])
    s = end(end(s)); expect([s.phase, s.time]).toEqual([3, 'NIGHT'])
    s = end(end(s)); expect([s.phase, s.time]).toEqual([4, 'NIGHT'])
    s = end(end(s)); expect([s.phase, s.time]).toEqual([5, 'DAY'])
    s = play(s, 'reverseTime'); expect(s.time).toBe('NIGHT')
    s = end(end(s)); expect([s.phase, s.time]).toEqual([6, 'NIGHT'])
    s = end(end(s)); expect([s.phase, s.time]).toEqual([7, 'DAY'])
  })
  it('stacks independent half multipliers and vampire CO quarter attack during daytime', () => {
    let s = game()
    s = play(s, 'vampire')
    expect(s.players[0].hp).toBe(9)
    expect(attackValue(s, s.players[0], 8)).toBe(2)
    s = end(s); expect(attackValue(s, s.players[0], 8)).toBe(4)
    s.time = 'NIGHT'; expect(attackValue(s, s.players[0], 8)).toBe(8)
  })
  it('takes additional turns and chained additions without advancing phases or losing the next seat', () => {
    let s = play(game(), 'whiteCandle') // fewer than two discarded: no extra
    expect(s.extraTurns).toHaveLength(0)
    s = play(s, 'fate'); s = end(s)
    expect([s.currentPlayerIndex, s.phase, s.extraTurn]).toEqual([0, 1, true])
    // Use a nonfatal queued extra to independently verify chaining.
    s.extraFatal = false
    hold(s, 0, 'twins1'); hold(s, 0, 'twins2')
    s = play(s, 'whiteCandle'); s = end(s)
    expect([s.currentPlayerIndex, s.phase, s.extraTurn]).toEqual([0, 1, true])
    s = end(s); expect([s.currentPlayerIndex, s.phase, s.extraTurn]).toEqual([1, 1, false])
  })
  it('fate kills at the end of its designated extra turn rather than the normal turn', () => {
    let s = play(game(), 'fate'); s = end(s)
    expect(s.players[0].status).toBe('ALIVE')
    s = end(s); expect(s.players[0].status).toBe('DEAD'); expect(s.currentPlayerIndex).toBe(1)
  })
  it('black candle counts discarded hands against effective living count', () => {
    let s = game(); s.players.forEach((p, i) => { p.hand = ['twins1', 'twins2'].map((cardId, n) => ({ uid: `${i}-${n}`, cardId })) })
    s = play(s, 'blackCandle'); expect(s.extraTurns).toHaveLength(1)
    expect(s.players.every(p => !p.hand.length)).toBe(true)
  })
  it('red hood briefly dies, revives once, and does not resume the remaining hits', () => {
    let s = play(game(), 'redHood'); s.players[0].hp = 1; s = end(s)
    s = play(s, 'forceArrow', { targetId: 'player-1' })
    expect(s.players[0].hp).toBe(10); expect(s.players[0].revivalUsed).toBe(true)
    s.players[0].hp = 1; s = play(s, 'twins2', { targetId: 'player-1' })
    expect(s.players[0].status).toBe('DEAD')
  })
  it('red hood revival window expires at its next start', () => {
    let s = play(game(2), 'redHood'); s = end(end(s))
    s.players[0].hp = 1
    s = play(s, 'twins2', { targetId: 'player-1' })
    expect(s.players[0].status).toBe('DEAD')
  })
  it('lover requires three effective survivors and keeps a posthumous shared victory', () => {
    let s = game()
    s = answer(play(s, 'lover'), ['player-2'])
    expect(livingCount(s)).toBe(2)
    s.players[0].status = 'DEAD'; s.players[0].hp = 0
    s.currentPlayerIndex = 1; s.players[2].hp = 1
    s = play(s, 'twins2', { targetId: 'player-3' })
    expect(s.winnerIds).toEqual(['player-2', 'player-1'])
    const two = game(2); hold(two, 0, 'lover')
    expect(playCard(two, { playerId: 'player-1', cardUid: 'lover', choice: 'REVEAL_ROLE' }).ok).toBe(false)
  })
  it('burning love creates direct linked death and survives as a victory link after death', () => {
    let s = play(game(), 'burningLove'); s.players[1].hp = 1
    s = play(s, 'twins2')
    expect(s.players[0].status).toBe('DEAD')
    expect(s.victoryLinks?.some(l => l.ownerId === 'player-1')).toBe(true)
  })
  it('cooling revokes installed victory links, but retains role links', () => {
    let s = answer(play(game(4), 'lover'), ['player-3'])
    s = play(s, 'burningLove')
    s = play(s, 'cooling')
    expect(s.victoryLinks?.map(l => l.kind)).toEqual(['ROLE'])
  })
  it('fickle changes love and damages the previous partner, or draws two then hurts self', () => {
    let s = answer(play(game(4), 'lover'), ['player-2'])
    s = answer(play(s, 'fickle'), ['player-3'])
    expect(s.victoryLinks?.[0].targetId).toBe('player-3'); expect(s.players[1].hp).toBe(7)
    const normal = game(); normal.deck = [{ uid: 'a', cardId: 'twins1' }, { uid: 'b', cardId: 'twins2' }]
    const next = play(normal, 'fickle'); expect(next.players[0].hp).toBe(9); expect(next.players[0].hand).toHaveLength(2)
  })
  it('cat voice bans targeted use until its user attacks the affected player', () => {
    let s = play(game(), 'catVoice'); expect(canTarget(s, 'player-2', 'player-1')).toBe(false)
    s = end(s); hold(s, 1, 'twins2')
    expect(playCard(s, { playerId: 'player-2', cardUid: 'twins2', choice: 'ATTACK', targetId: 'player-1' }).ok).toBe(false)
    s = end(end(s)); s = play(s, 'twins2'); expect(canTarget(s, 'player-2', 'player-1')).toBe(true)
  })
  it('stone counts prior hand use and expires at the current global turn end', () => {
    let s = play(game(), 'stone', { targetId: 'player-1' }); hold(s, 0, 'twins1')
    expect(playCard(s, { playerId: 'player-1', cardUid: 'twins1', choice: 'DEFENSE' }).ok).toBe(false)
    s = end(s); expect(s.effects?.some(e => e.kind === 'STONE')).toBe(false)
  })
  it('basket raises hand limit and cake/wine obey max HP', () => {
    let s = play(game(), 'basket'); expect(s.players[0].handLimit).toBe(4)
    s.players[1].hp = 2; s = play(s, 'cakeWine', { mode: 'WINE' }); expect(s.players[1].hp).toBe(7)
    s = play(s, 'cakeWine', { mode: 'CAKE' }); expect(s.players[1].hp).toBe(10)
  })
  it('hunt distinguishes face-down wolf, revealed wolf, and non-wolf', () => {
    let s = game(); s.players[1].role = { state: 'FACE_DOWN', card: { uid: 'wolf', cardId: 'wolf' } }
    s = play(s, 'hunt'); expect(s.players[1].role.state).toBe('REVEALED'); expect(s.players[1].hp).toBe(5)
    expect(s.effects?.some(e => e.kind === 'HALF')).toBe(false)
    const plain = play(game(), 'hunt'); expect(plain.players[1].hp).toBe(8)
  })
  it('affection modes distinguish HP loss from attack and self-target does not double subtract', () => {
    const a = play(game(), 'affection', { mode: 'DAMAGE' }); expect([a.players[0].hp, a.players[1].hp]).toEqual([1, 1])
    const b = play(game(), 'affection', { mode: 'BOTH' }); expect([b.players[0].hp, b.players[1].hp]).toEqual([1, 1])
    const self = play(game(), 'affection', { mode: 'BOTH', targetId: 'player-1' }); expect(self.players[0].hp).toBe(1)
  })
  it('temptation moves a complete multi-hit action before the first hit', () => {
    let s = game(); hold(s, 1, 'temptation')
    s = play(s, 'forceArrow'); expect(s.pendingChoice?.kind).toBe('INTERRUPT')
    s = answer(s, ['temptation']); expect(s.pendingChoice?.kind).toBe('REDIRECT')
    s = answer(s, ['player-3']); expect(s.players[1].hp).toBe(10); expect(s.players[2].hp).toBe(6)
  })
  it('wolf skin grants flat attack and can cancel an all-player statement', () => {
    let s = play(game(), 'wolfSkin'); expect(attackValue(s, s.players[0], 2)).toBe(3)
    s = play(s, 'quarrel'); expect(s.pendingChoice?.kind).toBe('INTERRUPT')
    s = answer(s, [s.pendingChoice!.options[0].id]); expect(s.players.every(p => p.hp === 10)).toBe(true)
    expect(attackValue(s, s.players[0], 2)).toBe(2)
  })
  it('fox is damage immune at night but dies to seer forced reveal', () => {
    let s = game(); s.players[1].role = { state: 'REVEALED', card: { uid: 'fox', cardId: 'fox' } }; s.time = 'NIGHT'
    s = play(s, 'burst'); expect(s.players[1].hp).toBe(10)
    s.players[1].role.state = 'FACE_DOWN'; s.players[0].role = { state: 'FACE_DOWN', card: { uid: 'seer', cardId: 'seer' } }
    s = ok(revealRole(s, 'player-1', 'player-2')); expect(s.players[1].status).toBe('DEAD')
  })
  it('vampire and vampire play heal actual damage rather than overkill or blocked damage', () => {
    let s = game(); s.players[0].hp = 2; s.players[0].role = { state: 'REVEALED', card: { uid: 'vampire', cardId: 'vampire' } }; s.time = 'NIGHT'
    s.players[1].hp = 1
    s = play(s, 'vampirePlay'); expect(s.players[0].hp).toBe(4)
  })
  it('reverse time night hits remain independent and switch after resolving', () => {
    let s = game(); s.time = 'NIGHT'; s = play(s, 'reverseTime')
    expect(s.players[1].hp).toBe(6); expect(s.time).toBe('DAY')
  })
  it('crow reorders the top five then exchanges selected hand cards', () => {
    let s = game(); s.deck = Array.from({ length: 5 }, (_, i) => ({ uid: `d${i}`, cardId: 'twins1' })); hold(s, 0, 'twins2', 'hand')
    s = play(s, 'crow'); s = answer(s, ['d0', 'd1', 'd2', 'd3', 'd4']); expect(s.pendingChoice?.kind).toBe('CROW_HAND')
    s = answer(s, ['hand']); expect(s.players[0].hand.map(c => c.uid)).toEqual(['d0'])
  })
  it('scales schedules twice its HP cost for next start and crucifix caps max HP', () => {
    let s = play(game(), 'scales', { amount: 4 }); expect(s.players[0].hp).toBe(6)
    s = end(end(end(s))); expect(s.players[0].hp).toBe(10)
    s = play(s, 'crucifix'); expect([s.players[1].hp, s.players[1].maxHp]).toEqual([5, 5])
    s = play(s, 'cooling'); expect(s.players[1].maxHp).toBe(10)
  })
  it('comeback heals past enemy damage and resolve uses only self-origin HP loss', () => {
    let s = game(); s.players[0].hp = 3
    s = play(s, 'twins2'); s = play(s, 'comeback'); expect(s.players[0].hp).toBe(5)
    s = play(s, 'brand', { targetId: 'player-1' }); expect(s.players[0].turnSelfLoss).toBe(3)
    s = play(s, 'resolve'); expect(s.players[1].hp).toBe(2)
  })
  it('silence responds after draw and preserves cards when skipping directly to responder', () => {
    let s = game(); s.deck = [{ uid: 'draw', cardId: 'twins1' }]; hold(s, 2, 'silence')
    s = end(s); expect(s.players[1].hand).toHaveLength(1); expect(s.pendingChoice?.kind).toBe('SILENCE')
    s = answer(s, ['silence']); expect(s.currentPlayerIndex).toBe(2); expect(s.players[1].hand).toHaveLength(1)
  })
  it('sunrise rejects nighttime and recovers HP before attacking', () => {
    let s = game(); s.players[0].hp = 5; s = play(s, 'sunrise'); expect(s.players[0].hp).toBe(7); expect(s.players[1].hp).toBe(7)
    s.time = 'NIGHT'; hold(s, 0, 'sunrise'); expect(playCard(s, { playerId: 'player-1', cardUid: 'sunrise', choice: 'ATTACK', targetId: 'player-2' }).ok).toBe(false)
  })
  it('rain validates a distribution and continues its committed hits after self death', () => {
    let s = game(); s.players[0].hp = 4; hold(s, 0, 'rain')
    expect(playCard(s, { playerId: 'player-1', cardUid: 'rain', choice: 'ATTACK', amount: 4, distribution: { 'player-2': 3 } }).ok).toBe(false)
    s = play(s, 'rain', { amount: 4, distribution: { 'player-2': 3, 'player-3': 1 } })
    expect(s.players[0].status).toBe('DEAD'); expect(s.players.slice(1).map(p => p.hp)).toEqual([7, 9])
  })
  it('fox fur reduces night damage and virus preserves zero while fixing positive hits to one', () => {
    let s = play(game(), 'foxFur'); s.time = 'NIGHT'; expect(normalDamageAmount(s, 'player-2', 'player-1', 5)).toBe(1)
    s = play(s, 'virus'); expect(normalDamageAmount(s, 'player-1', 'player-2', 10)).toBe(1)
    expect(normalDamageAmount(s, 'player-2', 'player-1', 3)).toBe(0)
  })
  it.each(['counterA', 'counterB', 'deflect'])('%s responds to damage from non-attack as well as attack sources', id => {
    let s = game(); hold(s, 1, id)
    s = play(s, 'reverseTime'); // daytime healing is not a damage trigger
    expect(s.pendingChoice).toBeNull()
    s.time = 'NIGHT'; s = play(s, 'reverseTime')
    if (id === 'counterB') { expect(s.pendingChoice).toBeNull(); s = play(s, 'twins4') }
    s = answer(s, [id]); expect(s.players[1].discard.some(c => c.cardId === id)).toBe(true)
    expect(s.players[0].hp).toBeLessThanOrEqual(10)
  })
  it('counter gamma reflects only single-target statements', () => {
    let s = game(); s.players[0].hp = 2; s.players[1].hp = 8; hold(s, 1, 'counterG')
    s = answer(play(s, 'treatment'), ['counterG']); expect(s.players[0].hp).toBe(6); expect(s.players[1].hp).toBe(8)
  })
  it('white night uses previous actual damage, without multiplying later hits again', () => {
    const card = ALL_CARDS.find(c => c.id === 'whiteNight')!, unresolved = card.unresolved
    card.unresolved = false
    try {
      let s = game(); s.time = 'NIGHT'; s = play(s, 'whiteNight')
      expect(s.players[1].hp).toBe(4)
      const reduced = game(); reduced.time = 'NIGHT'; reduced.effects = [{ id: 'reduce', kind: 'REDUCE', ownerId: 'player-2', targetId: 'player-2', expires: 2, timing: 'START' }]
      s = play(reduced, 'whiteNight'); expect(s.players[1].hp).toBe(8)
      const guarded = game(); guarded.time = 'NIGHT'; guarded.players[1].installed = [{ uid: 'just', cardId: 'justGuard' }]
      s = answer(play(guarded, 'whiteNight'), ['just']); expect(s.players[1].hp).toBe(10)
    } finally { card.unresolved = unresolved }
  })
  it('scissors chooses an opaque index and evaluates only the revealed selected card', () => {
    const card = ALL_CARDS.find(c => c.id === 'scissors')!, unresolved = card.unresolved
    card.unresolved = false
    try {
      let s = game(); hold(s, 1, 'forceArrow', 'secret-card'); hold(s, 1, 'fox', 'not-picked')
      s = play(s, 'scissors'); expect(s.pendingChoice?.options[0]).toEqual({ id: 'back-0', label: '裏向きの手札 1' })
      expect(JSON.stringify(gameView(s, 'player-1'))).not.toContain('secret-card')
      s = answer(s, ['back-0']); expect(s.players[1].hp).toBe(4)
      expect(s.players[1].hand.map(c => c.uid)).toEqual(['not-picked'])
      expect(s.players[1].discard[0].uid).toBe('secret-card')
    } finally { card.unresolved = unresolved }
  })
  it('defines effect-body numbers for every card, independent of UI text, including signed modifiers and fractions', () => {
    expect(ALL_CARDS.every(c => Array.isArray(CARD_EFFECT_NUMBERS[c.id]))).toBe(true)
    expect(sumCardEffectNumbers('forceArrow')).toBe(12)
    expect(sumCardEffectNumbers('consider')).toBe(8)
    expect(sumCardEffectNumbers('wolf')).toBe(7.5)
    expect(sumCardEffectNumbers('medium')).toBe(200)
    expect(sumCardEffectNumbers('treatment')).toBe(4)
    expect(sumCardEffectNumbers('retract')).toBe(0)
    expect(createDeck()).toHaveLength(93)
    expect(createDeck().filter(c => ['whiteNight', 'scissors'].includes(c.cardId))).toHaveLength(2)
  })
  it('redirected scissors offers the new targets own opaque hand indexes', () => {
    let s = game(); hold(s, 1, 'temptation'); hold(s, 1, 'twins1'); hold(s, 2, 'forceArrow')
    s = answer(play(s, 'scissors'), ['temptation']); s = answer(s, ['player-3'])
    expect(s.pendingChoice?.targetId).toBe('player-3')
    expect(s.pendingChoice?.options.map(o => o.id)).toEqual(['back-0'])
    s = answer(s, ['back-0']); expect(s.players[2].hp).toBe(4); expect(s.players[1].hp).toBe(10)
  })
  it('redirection and hand-reaction options never expose other hands or continuation tasks', () => {
    let s = game(); hold(s, 1, 'temptation', 'hidden-choice'); hold(s, 1, 'fox', 'other-secret')
    s = play(s, 'twins2')
    const own = gameView(s, 'player-2'), other = gameView(s, 'player-3')
    expect(own.pendingChoice?.options[0].id).toBe('hidden-choice')
    expect(other.pendingChoice?.options).toEqual([])
    expect(JSON.stringify(other)).not.toContain('other-secret')
    expect(JSON.stringify(other)).not.toContain('hidden-choice')
    expect(other.pendingChoice?.task).toBeUndefined()
  })
  it('stone also prevents a second hand card from being used for death rescue', () => {
    let s = game(); s.players[0].hp = 1; s.players[0].turnCards = 1; hold(s, 0, 'prayer')
    s.currentPlayerIndex = 1
    s = play(s, 'stone', { targetId: 'player-1' })
    s = play(s, 'twins2', { targetId: 'player-1' })
    expect(s.players[0].status).toBe('DEAD')
    expect(s.pendingChoice).toBeNull()
  })
  it('source-side effect immunity does not suppress scissors card selection', () => {
    let s = play(game(), 'prayer'); hold(s, 1, 'twins2')
    s = play(s, 'scissors'); expect(s.pendingChoice?.kind).toBe('SCISSORS')
    s = answer(s, ['back-0']); expect(s.players[1].hp).toBe(8)
  })
})
