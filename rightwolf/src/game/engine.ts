import { cardOf, createDeck, shuffle } from './cards'
import type { CardDefinition, CardInstance, EffectTask, GameResult, GameState, PendingChoice, PlayCardInput, Player, TimedEffect } from './types'
import type { ExpansionSet } from './types'
import { canTarget, expireAttackBan, guardGeneration, handAllowed, installedCount, livingCount, permanent, revokeCardLinks } from './v03-rules'
import { expansionAttack, expansionChoice, expansionStatement, validateExpansion } from './v03-effects'
import { actionReaction, damageReaction, resolveReaction } from './v03-reactions'

const copy = (state: GameState): GameState => structuredClone(state)
const alive = (p: Player) => p.status === 'ALIVE'
const get = (s: GameState, id?: string) => s.players.find(p => p.id === id)
const role = (p: Player) => p.role.state === 'REVEALED' && p.role.card ? cardOf(p.role.card).roleEffect : undefined
const failure = (error: string): GameResult => ({ ok: false, error })
const success = (state: GameState): GameResult => ({ ok: true, state })
const effects = (s: GameState, p: Player, kind?: TimedEffect['kind']) => (s.effects ?? []).filter(e => e.targetId === p.id && (!kind || e.kind === kind) && (['DELAY', 'HEAL_RESERVATION'].includes(e.kind) || alive(get(s, e.ownerId)!)))
const context = () => ({ queue, choice, draw, heal: healing, attack: attackValue })

function log(s: GameState, message: string, playerId?: string) {
  s.log.unshift({ id: s.nextLogId++, message, visibility: playerId ? 'PRIVATE' : 'PUBLIC', playerId })
  s.log = s.log.slice(0, 160)
}
function draw(s: GameState, p: Player, amount: number) {
  let count = 0
  while (count < amount && s.deck.length) { p.hand.push(s.deck.pop()!); count++ }
  if (count) log(s, `${p.name}がカードを${count}枚引いた。`)
}
function clockwise(s: GameState, id: string) {
  const i = s.players.findIndex(p => p.id === id)
  return [...s.players.slice(i), ...s.players.slice(0, i)].filter(alive)
}
function timed(s: GameState, kind: TimedEffect['kind'], owner: Player, target: Player = owner, timing: 'START' | 'END' = 'START', card?: CardInstance, fromId?: string, sourceCard = card) {
  const effect: TimedEffect = { id: `effect-${s.nextLogId++}`, kind, ownerId: owner.id, targetId: target.id, expires: (owner.turnsStarted ?? 0) + 1, timing, card, fromId, sourceCard }
  ;(s.effects ??= []).push(effect)
  return effect
}
function recalc(s: GameState) {
  for (const p of s.players) {
    const half = .5 ** effects(s, p, 'HALF').length
    const oldMax = p.maxHp
    p.maxHp = Math.max(1, Math.floor((10 + (alive(p) && role(p) === 'WOLF' ? 2 : 0) + effects(s, p, 'CITIZEN').length * 2) * half))
    if (permanent(s, p, 'MAX_HP').length) p.maxHp = 5
    if (p.maxHp < oldMax) p.hp = Math.min(p.hp, p.maxHp)
    p.handLimit = Math.floor((3 + effects(s, p, 'CITIZEN').length + permanent(s, p, 'BASKET').length) * half)
    p.shield = alive(p) ? (p.installed ?? []).reduce((sum, c) => sum + (cardOf(c).defense ?? 0), 0) : 0
  }
}
export function calculateAttack(base: number, flat = 0, percents: number[] = [], multipliers: number[] = []) {
  return Math.max(0, Math.floor((base + flat) * (1 + percents.reduce((a, b) => a + b, 0) / 100) * multipliers.reduce((a, b) => a * b, 1)))
}
export function attackValue(s: GameState, p: Player, base: number) {
  return calculateAttack(base, (p.attackFlat ?? 0) + installedCount(p, 'wolfSkin'), [p.attackPercent ?? 0], [role(p) === 'WOLF' ? s.time === 'NIGHT' ? 3 : 2 : 1, .5 ** effects(s, p, 'HALF').length, .5 ** effects(s, p, 'ATTACK_HALF').length, role(p) === 'VAMPIRE' && s.time === 'DAY' ? .5 : 1])
}
// Use the same variable base for resolution and the card's pre-play display.
export function attackBaseValue(p: Player, c: CardDefinition, target?: Player, amount?: number, beforePlay = false): number | undefined {
  if (c.id === 'accel') return Math.max(0, p.hand.length - (beforePlay ? 1 : 0))
  if (c.id === 'lightning') return p.turnStatements ?? 0
  if (c.id === 'doubleEdge') return amount
  if (c.id === 'cyclone') return target ? target.discard.length - p.discard.length - (beforePlay && target.id !== p.id ? 1 : 0) : undefined
  if (c.id === 'resolve') return (p.turnSelfLoss ?? 0) * 2
  if (c.id === 'hunt') return target?.role.state === 'REVEALED' && target.role.card?.cardId === 'wolf' ? 5 : 2
  if (c.id === 'affection') return Math.max(0, p.hp - 1)
  if (c.id === 'rain') return amount
  return c.attack
}
function healing(s: GameState, p: Player, amount: number) { p.hp = Math.min(p.maxHp, p.hp + amount); log(s, `${p.name}のHPが${amount}回復した。`) }
function discard(p: Player, uid: string) {
  const index = p.hand.findIndex(c => c.uid === uid)
  if (index < 0) return null
  const card = p.hand.splice(index, 1)[0]; p.discard.push(card); return card
}
function choice(s: GameState, value: Omit<PendingChoice, 'id'>) { s.pendingChoice = { ...value, sourceCard: value.sourceCard ?? value.task?.sourceCard ?? value.task?.card, id: `choice-${s.nextLogId++}` } }
const playerOptions = (s: GameState, chooserId?: string) => s.players.filter(p => alive(p) && (!chooserId || canTarget(s, chooserId, p.id))).map(p => ({ id: p.id, label: p.name }))
const cardOptions = (cards: CardInstance[]) => cards.map(card => ({ id: card.uid, label: cardOf(card).name, card }))
function queue(s: GameState, tasks: EffectTask[]) { (s.queue ??= []).unshift(...tasks) }

export function createGame(names: string[], random = Math.random, sets: ExpansionSet[] = ['FOREST', 'MOON']): GameState {
  const clean = names.map(n => n.trim()).filter(Boolean)
  if (clean.length < 1 || clean.length > 6) throw new Error('プレイヤーは1〜6人にしてください。')
  if (new Set(clean).size !== clean.length) throw new Error('同じプレイヤー名は使用できません。')
  const players: Player[] = clean.map((name, i) => ({ id: `player-${i + 1}`, name, hp: 10, maxHp: 10, status: 'ALIVE', handLimit: 3, hand: [], discard: [], role: { state: 'EMPTY', card: null }, shield: 0, installed: [], turnsStarted: i === 0 ? 1 : 0, turnAttacks: 0, turnStatements: 0 }))
  const s: GameState = { version: 1, id: `game-${Date.now()}`, mode: clean.length === 1 ? 'TEST' : 'NORMAL', players, parentIndex: 0, currentPlayerIndex: 0, phase: 1, time: 'DAY', deck: createDeck(random, sets), turnNumber: 1, winnerId: null, log: [], nextLogId: 1, effects: [], queue: [], pendingChoice: null, sets, extraTurns: [], victoryLinks: [], deathGenerations: {} }
  log(s, `${clean.length === 1 ? '1人用テスト' : 'ゲーム'}開始。親は${players[0].name}。昼のフェーズ1。`)
  draw(s, players[0], players[0].handLimit)
  return s
}
function active(s: GameState, id: string) {
  const p = s.players[s.currentPlayerIndex]
  return p.id === id && alive(p) && !s.winnerId && !s.draw && !s.pendingChoice && !effects(s, p, 'BLOCK').length ? p : null
}
function winner(s: GameState) {
  if (s.pendingChoice || s.queue?.length || s.winnerId || s.draw) return
  revokeCardLinks(s)
  const living = s.players.filter(p => alive(p) && role(p) !== 'LOVER')
  if (living.length === 1 && s.mode !== 'TEST') {
    s.winnerId = living[0].id; const wins = new Set([living[0].id])
    let changed = true
    while (changed) { changed = false; for (const link of s.victoryLinks ?? []) if (wins.has(link.targetId) && !wins.has(link.ownerId)) { wins.add(link.ownerId); changed = true } }
    s.winnerIds = [...wins]; log(s, `${s.players.filter(p => wins.has(p.id)).map(p => p.name).join('、')}の勝利！`)
  }
  if (!living.length && (s.mode !== 'TEST' || !s.players.some(alive))) { s.draw = true; log(s, '勝利条件を満たす生存者がいないため引き分け。') }
}
function die(s: GameState, task: EffectTask) {
  const p = get(s, task.targetId)!
  if (!alive(p)) return
  p.status = 'DEAD'; p.hp = 0
  ;(s.deathGenerations ??= {})[p.id] = (s.deathGenerations?.[p.id] ?? 0) + 1
  log(s, `${p.name}が${task.kind === 'KILL' ? '殺害された' : '死亡した'}。`)
  const killer = get(s, task.sourceId)
  if (task.kind === 'KILL' && killer && killer.id !== p.id && role(killer) === 'MEDIUM' && alive(killer)) killer.attackPercent = (killer.attackPercent ?? 0) + 100
  recalc(s)
  const linked = (s.effects ?? []).filter(e => e.kind === 'LOVE' && e.targetId === p.id && alive(get(s, e.ownerId)!)).map(e => ({ kind: 'DEATH' as const, sourceId: p.id, targetId: e.ownerId, sourceCard: e.card }))
  const revive = role(p) === 'RED_HOOD' && !p.revivalUsed && s.effects?.some(e => e.kind === 'REVIVAL' && e.targetId === p.id && e.expires > (p.turnsStarted ?? 0))
  if (revive) p.revivalUsed = true
  queue(s, [...linked, ...(revive ? [{ kind: 'REVIVE' as const, sourceId: p.id, targetId: p.id, value: 10 }] : [])])
}
function rescue(s: GameState, task: EffectTask) {
  const p = get(s, task.targetId)!
  if (p.hp > 0 && task.kind !== 'KILL') return
  const options = handAllowed(s, p) ? p.hand.filter(c => c.cardId === 'prayer' && task.kind !== 'KILL' || c.cardId === 'hope' && task.card?.cardId !== 'hope' && (!task.attack || task.kind === 'DAMAGE' && (task.value ?? 0) >= 5)) : []
  if (options.length) choice(s, { playerId: p.id, sourceId: task.sourceId, kind: 'RESCUE', title: '死亡時の誘発を選ぶ（使わずに死亡することもできます）', options: cardOptions(options), min: 0, max: 1, task })
  else die(s, task)
}
// Shared by resolution and the server's choice preview; it does not mutate state.
export function normalDamageAmount(s: GameState, sourceId: string, targetId: string, value: number, attack = false) {
  const p = get(s, targetId)!, source = get(s, sourceId)!
  const immune = effects(s, p, 'IMMUNE').length || effects(s, p, 'WALL').length || effects(s, p, 'HOPE').length || role(p) === 'FOX' && s.time === 'NIGHT' || alive(source) && effects(s, source, 'WALL').length || effects(s, p, 'MIRACLE').some(e => e.fromId === source.id)
  const guarded = attack && s.players.some(g => alive(g) && role(g) === 'KNIGHT' && g.guardTarget === p.id)
  let dealt = immune || guarded ? 0 : Math.max(0, value - effects(s, p, 'REDUCE').length - effects(s, p, 'TALK').length - (s.time === 'NIGHT' ? installedCount(p, 'foxFur') * 4 : 0))
  if (effects(s, p, 'ELEMENT').length && dealt <= 2) dealt = 0
  if (dealt > 0 && (installedCount(p, 'virus') || installedCount(source, 'virus'))) dealt = 1
  return dealt
}
function damage(s: GameState, task: EffectTask) {
  const p = get(s, task.targetId)
  if (!p || !alive(p)) return
  const source = get(s, task.sourceId)!
  const value = Math.max(0, task.value ?? 0)
  if (task.card && cardOf(task.card).kind === 'STATEMENT' && effects(s, p, 'TALK').length) return
  if (task.kind === 'LIFE_LOSS') {
    if (effects(s, p, 'IMMUNE').length) return
    const lost = Math.min(p.hp, value); p.hp = Math.max(0, p.hp - value)
    if (source.id === p.id) p.turnSelfLoss = (p.turnSelfLoss ?? 0) + lost
    log(s, `${p.name}のHPを${lost}減らした。`); rescue(s, task); return
  }
  const dealt = normalDamageAmount(s, source.id, p.id, value, task.attack)
  if (damageReaction(s, task, dealt, context())) return
  const actual = Math.min(p.hp, dealt)
  p.hp = Math.max(0, p.hp - dealt)
  if (source.id === p.id) p.turnSelfLoss = (p.turnSelfLoss ?? 0) + actual
  if (source.id !== p.id) source.turnDamage = (source.turnDamage ?? 0) + actual
  const follow: EffectTask[] = []
  if (alive(source) && task.drainLife) follow.push({ kind: 'HEAL', sourceId: source.id, targetId: source.id, value: actual })
  if (alive(source) && task.attack && role(source) === 'VAMPIRE') follow.push({ kind: 'HEAL', sourceId: source.id, targetId: source.id, value: actual })
  if (task.chain && actual > 1) follow.push({ ...task, kind: 'ATTACK', value: actual - 1, damageChecked: false })
  queue(s, follow)
  log(s, `${source.name}が${p.name}に${dealt}の通常ダメージを与えた。`)
  rescue(s, { ...task, value: dealt })
}
function kill(s: GameState, task: EffectTask) {
  const p = get(s, task.targetId), killer = get(s, task.sourceId)
  if (!p || !killer || !alive(p) || effects(s, p, 'IMMUNE').length) return
  if (role(p) === 'MEDIUM' && killer.role.card?.cardId === 'doll') { log(s, `${p.name}は呪われ人形の殺害を防いだ。`); return }
  if (p.role.state === 'FACE_DOWN' && p.role.card?.cardId === 'doll') {
    const hp = killer.hp
    p.role.state = 'REVEALED'; p.hp = hp
    log(s, `${p.name}の呪われ人形が殺害を反転した。HPは${hp}。`)
    queue(s, [{ kind: 'KILL', sourceId: p.id, sourceCard: p.role.card, targetId: killer.id }]); return
  }
  rescue(s, task)
}
function reveal(s: GameState, p: Player, forced = false, by?: Player, targetId?: string) {
  if (!p.role.card || p.role.state === 'REVEALED') return
  p.role.state = 'REVEALED'
  log(s, `${p.name}の「${cardOf(p.role.card).name}」を${forced ? '強制開示した' : 'COした'}。`)
  if (forced) {
    if (role(p) === 'DOLL' && by) queue(s, [{ kind: 'DAMAGE', sourceId: p.id, targetId: by.id, sourceCard: p.role.card, value: 5 }, { kind: 'DAMAGE', sourceId: p.id, targetId: p.id, sourceCard: p.role.card, value: 3 }])
    if (role(p) === 'FOX' && by?.role.card?.cardId === 'seer') queue(s, [{ kind: 'DEATH', sourceId: by.id, targetId: p.id, sourceCard: p.role.card }])
  } else if (['WOLF', 'DOLL', 'FOX'].includes(role(p) ?? '')) timed(s, 'HALF', p, p, 'START', undefined, undefined, p.role.card)
  else if (role(p) === 'RED_HOOD') timed(s, 'REVIVAL', p, p, 'START', undefined, undefined, p.role.card)
  else if (role(p) === 'VAMPIRE') {
    const e = timed(s, 'ATTACK_HALF', p, p, 'END', undefined, undefined, p.role.card); e.expires = p.turnsStarted ?? 0
    queue(s, [{ kind: 'LIFE_LOSS', sourceId: p.id, targetId: p.id, value: 1, sourceCard: p.role.card }])
  } else if (role(p) === 'LOVER') choice(s, { playerId: p.id, sourceId: p.id, sourceCard: p.role.card, kind: 'LOVE_TARGET', title: '愛する人', options: playerOptions(s, p.id), min: 1, max: 1 })
  else if (role(p) === 'SEER') {
    if (targetId) queue(s, [{ kind: 'ACTION', sourceId: p.id, targetId, sourceCard: p.role.card, single: true, tasks: [{ kind: 'FORCE_REVEAL', sourceId: p.id, targetId }] }])
    else choice(s, { playerId: p.id, sourceId: p.id, kind: 'SEER', sourceCard: p.role.card, title: '強制開示する役職を選ぶ', options: playerOptions(s), min: 1, max: 1 })
  } else if (role(p) === 'ASSASSIN') choice(s, { playerId: p.id, sourceId: p.id, kind: 'ASSASSIN', sourceCard: p.role.card, title: livingCount(s) >= 3 ? '殺害する相手を選ぶ' : '手札をすべて捨てさせる相手', options: playerOptions(s, p.id), min: livingCount(s) >= 3 ? 0 : 1, max: 1 })
  recalc(s)
}

function expire(s: GameState, p: Player, timing: 'START' | 'END') {
  const due = (s.effects ?? []).filter(e => e.ownerId === p.id && e.timing === timing && e.expires <= (p.turnsStarted ?? 0))
  if (due.some(e => ['DELAY', 'HOPE', 'HEAL_RESERVATION'].includes(e.kind))) {
    const tasks: EffectTask[] = due.map(e => ({ kind: 'EXPIRE', sourceId: e.ownerId, effectId: e.id }))
    if (due.length > 1 && alive(p)) choice(s, { playerId: p.id, sourceId: p.id, kind: 'ORDER', title: 'ターン終了時の効果を処理する順番に選ぶ', options: due.map(e => ({ id: e.id, card: e.card ?? e.sourceCard, label: e.card || e.sourceCard ? cardOf((e.card ?? e.sourceCard)!).name : e.kind === 'DELAY' ? '残虐な猶予' : '効果終了' })), min: due.length, max: due.length, tasks })
    else queue(s, tasks)
  } else {
    s.effects = (s.effects ?? []).filter(e => !due.includes(e))
    for (const e of due) if (e.card) get(s, e.targetId)!.discard.push(e.card)
  }
  recalc(s)
}
function finishTurn(s: GameState) {
  const p = s.players[s.currentPlayerIndex]
  log(s, `${p.name}がターンを終了した。`)
  const remaining = s.queue!.splice(0)
  const stones = (s.effects ?? []).filter(e => e.kind === 'STONE' && e.value === s.turnNumber)
  s.effects = (s.effects ?? []).filter(e => !stones.includes(e))
  for (const e of stones) if (e.card) get(s, e.targetId)!.discard.push(e.card)
  expire(s, p, 'END')
  if (s.extraTurn && s.extraFatal) s.queue!.push({ kind: 'DEATH', sourceId: p.id, targetId: p.id })
  s.queue!.push({ kind: 'NEXT_TURN', sourceId: p.id }, ...remaining)
}
function advanceTurn(s: GameState) {
  const living = s.players.filter(alive)
  if (!living.length) return
  const previous = s.currentPlayerIndex
  const extra = (s.extraTurns ?? []).findIndex(e => e.playerId === s.players[previous].id && alive(s.players[previous]))
  let next = previous
  if (extra >= 0) {
    const entry = s.extraTurns!.splice(extra, 1)[0]; s.extraTurn = true; s.extraFatal = entry.fatal
    log(s, `${s.players[previous].name}の追加ターン。`)
  } else {
    s.extraTurn = false; s.extraFatal = false
    do next = (next + 1) % s.players.length
    while (!alive(s.players[next]))
    if (next <= previous) { s.phase++; if (s.phase % 2 === 1) s.time = s.time === 'DAY' ? 'NIGHT' : 'DAY'; log(s, `${s.time === 'DAY' ? '昼' : '夜'}のフェーズ${s.phase}が始まった。`) }
  }
  s.currentPlayerIndex = next; s.turnNumber++
  const current = s.players[next]
  current.turnsStarted = (current.turnsStarted ?? 0) + 1
  for (const p of s.players) { p.turnDamage = 0; p.turnSelfLoss = 0; p.turnCards = 0 }
  current.turnAttacks = 0; current.turnStatements = 0; current.guardTarget = undefined
  expire(s, current, 'START')
  s.queue!.push({ kind: 'READY', sourceId: current.id })
}

function statement(s: GameState, task: EffectTask) {
  const p = get(s, task.sourceId)!, t = get(s, task.targetId) ?? p, id = task.card!.cardId
  if (cardOf(task.card!).target !== 'ALL' && (effects(s, t, 'IMMUNE').length || effects(s, t, 'TALK').length)) { log(s, `${t.name}への発言カードを無効化した。`); return }
  if (expansionStatement(s, task, context())) return
  switch (id) {
    case 'consider': {
      const cards = s.deck.splice(Math.max(0, s.deck.length - 4)).reverse()
      if (!cards.length || !alive(p)) { s.deck.push(...cards.reverse()); break }
      choice(s, { playerId: p.id, sourceId: p.id, kind: 'DRAW', sourceCard: task.card, title: '手札に加えるカードを選ぶ。その後、山札へ戻す順番を選びます', options: cardOptions(cards), cards, min: Math.min(2, cards.length), max: Math.min(2, cards.length) }); break
    }
    case 'retract': if (p.role.state === 'REVEALED' && p.role.card) { s.deck.push(p.role.card); shuffle(s.deck); p.role = { state: 'EMPTY', card: null }; p.guardTarget = undefined; s.victoryLinks = (s.victoryLinks ?? []).filter(link => link.kind !== 'ROLE' || link.ownerId !== p.id); recalc(s) } break
    case 'treatment': healing(s, t, 4); timed(s, 'REDUCE', p, t, 'START', undefined, undefined, task.card); break
    case 'refute': { const next = clockwise(s, p.id)[1]; if (next) timed(s, 'BLOCK', p, next, 'START', undefined, undefined, task.card); break }
    case 'eloquence': timed(s, 'TALK', p, p, 'START', undefined, undefined, task.card); break
    case 'renew': { const n = p.hand.length; p.discard.push(...p.hand.splice(0)); draw(s, p, n + 2); break }
    case 'torture': queue(s, [{ kind: 'LIFE_LOSS', sourceId: p.id, targetId: t.id, sourceCard: task.card, value: t.hp - Math.floor(t.hp / 2) }]); break
    case 'prayer': timed(s, 'IMMUNE', p, p, 'START', undefined, undefined, task.card); break
    case 'roleSwap': {
      const second = get(s, task.choice?.targetId)
      if (second && alive(second) && !effects(s, second, 'IMMUNE').length && !effects(s, second, 'TALK').length) {
        [t.role, second.role] = [second.role, t.role]; t.guardTarget = undefined; second.guardTarget = undefined
        for (const link of s.victoryLinks ?? []) if (link.kind === 'ROLE') link.ownerId = link.ownerId === t.id ? second.id : link.ownerId === second.id ? t.id : link.ownerId
        recalc(s)
      }
      break
    }
    case 'cooling': {
      s.deck = s.deck.filter(c => c.uid !== task.card!.uid)
      for (const other of s.players) {
        other.hand = other.hand.filter(c => c.uid !== task.card!.uid)
        other.discard = other.discard.filter(c => c.uid !== task.card!.uid)
        if (!alive(other) || effects(s, other, 'IMMUNE').length || effects(s, other, 'TALK').length) continue
        s.deck.push(...other.hand.splice(0), ...other.discard.splice(0))
        s.deck.push(...(other.installed ?? []).splice(0))
        const used = (s.effects ?? []).filter(e => e.targetId === other.id && e.card)
        s.deck.push(...used.map(e => e.card!))
        s.effects = (s.effects ?? []).filter(e => !used.includes(e))
      }
      shuffle(s.deck)
      revokeCardLinks(s)
      for (const other of clockwise(s, p.id)) if (!effects(s, other, 'IMMUNE').length && !effects(s, other, 'TALK').length) draw(s, other, 2)
      s.deck.unshift(task.card!); break
    }
    case 'quarrel': {
      const amount = Math.floor(p.hp / 2)
      queue(s, [...clockwise(s, p.id).map(other => ({ kind: 'DAMAGE' as const, sourceId: p.id, targetId: other.id, value: amount, card: task.card })), ...clockwise(s, p.id).filter(other => other.id !== p.id).map(other => ({ kind: 'DAMAGE' as const, sourceId: p.id, targetId: other.id, value: 1, card: task.card }))]); break
    }
    case 'memoir': {
      const cards = t.discard.filter(c => c.uid !== task.card!.uid)
      if (alive(p)) choice(s, { playerId: p.id, sourceId: p.id, targetId: t.id, kind: 'RECOVER', sourceCard: task.card, title: '手札へ加える捨て札を選ぶ', options: cardOptions(cards), min: Math.min(2, cards.length), max: Math.min(2, cards.length) }); break
    }
    case 'trade': if (alive(p)) choice(s, { playerId: p.id, sourceId: p.id, targetId: t.id, kind: 'TRADE', sourceCard: task.card, title: '交換する自分の手札を選ぶ', options: cardOptions(p.hand), min: 0, max: Math.min(p.hand.length, t.hand.length) }); break
    case 'vote': {
      s.votes = {}
      queue(s, [...s.players.filter(alive).map(other => ({ kind: 'CHOICE' as const, sourceId: p.id, choice: { id: '', playerId: other.id, sourceId: p.id, kind: 'VOTE' as const, sourceCard: task.card, title: '捨てる手札と投票先を選ぶ', options: cardOptions(other.hand), min: 0, max: other.hand.length } })), { kind: 'VOTE_RESULT', sourceId: p.id }]); break
    }
    case 'demand': queue(s, clockwise(s, p.id).filter(other => other.id !== p.id).map(other => ({ kind: 'CHOICE', sourceId: p.id, choice: { id: '', playerId: other.id, sourceId: p.id, kind: 'DEMAND', sourceCard: task.card, title: '手札を1枚渡すか、拒否して3の通常ダメージを受ける', options: cardOptions(other.hand), min: 0, max: 1 } }))); break
  }
}

function drain(s: GameState) {
  let safety = 0
  while (s.queue?.length && !s.pendingChoice && safety++ < 1000) {
    const task = s.queue.shift()!
    const p = get(s, task.targetId)
    switch (task.kind) {
      case 'ACTION': actionReaction(s, task, context()); break
      case 'SCHEDULE_ATTACK': if (p && alive(p)) {
        const effect = timed(s, 'DELAY', p, p, 'END', undefined, task.sourceId, task.card)
        effect.expires = (p.turnsStarted ?? 0) + 2; effect.value = task.value
      } break
      case 'INSPECT_HAND': if (p && alive(p) && alive(get(s, task.sourceId)!)) log(s, `${p.name}の手札：${p.hand.map(c => cardOf(c).name).join('、') || 'なし'}。`, task.sourceId); break
      case 'HEAL': if (p && alive(p)) healing(s, p, task.value ?? 0); break
      case 'DRAW_CARDS': if (p && alive(p)) draw(s, p, task.value ?? 0); break
      case 'SWITCH_TIME': s.time = s.time === 'DAY' ? 'NIGHT' : 'DAY'; log(s, `${s.time === 'DAY' ? '昼' : '夜'}へ反転した。`); break
      case 'REVIVE': if (p && !alive(p)) { p.status = 'ALIVE'; p.hp = task.value ?? 10; log(s, `${p.name}がHP${p.hp}で復活した。`) }; break
      case 'READY': {
        const current = get(s, task.sourceId)!
        if (!alive(current)) break
        const before = current.hand.length
        draw(s, current, Math.max(0, current.handLimit - current.hand.length))
        const next = clockwise(s, current.id)[1]
        const cards = next?.hand.filter(c => c.cardId === 'silence') ?? []
        if (cards.length && current.hand.length > before && !effects(s, next!, 'BLOCK').length) choice(s, { kind: 'SILENCE', playerId: next!.id, sourceId: current.id, title: '口封じ', options: cardOptions(cards), min: 0, max: 1 })
        if (effects(s, current, 'BLOCK').length) queue(s, [{ kind: 'END_TURN', sourceId: current.id }])
        break
      }
      case 'AFTER_HUNT': if (p && alive(p) && guardGeneration(s, task) && p.role.state === 'FACE_DOWN' && p.role.card?.cardId === 'wolf') {
        queue(s, [{ kind: 'FORCE_REVEAL', sourceId: task.sourceId, targetId: p.id }, { kind: 'ATTACK', sourceId: task.sourceId, targetId: p.id, value: task.value ?? 3, card: task.card, deathGeneration: task.deathGeneration }])
      } break
      case 'EXPIRE': {
        const e = s.effects?.find(e => e.id === task.effectId)
        if (!e) break
        s.effects = s.effects!.filter(effect => effect !== e)
        if (e.card) get(s, e.targetId)!.discard.push(e.card)
        if (e.kind === 'DELAY') queue(s, [{ kind: 'ATTACK', sourceId: e.fromId ?? e.ownerId, targetId: e.targetId, value: e.value ?? 10, card: e.card, sourceCard: e.sourceCard }])
        if (e.kind === 'HOPE') queue(s, [{ kind: 'DEATH', sourceId: e.ownerId, targetId: e.targetId, card: e.card, sourceCard: e.sourceCard }])
        if (e.kind === 'HEAL_RESERVATION') queue(s, [{ kind: 'HEAL', sourceId: e.ownerId, targetId: e.targetId, value: e.value }])
        recalc(s); break
      }
      case 'DAMAGE': case 'LIFE_LOSS': damage(s, task); break
      case 'KILL': kill(s, task); break
      case 'DEATH': if (p && alive(p)) die(s, task); break
      case 'FORCE_REVEAL': if (p && alive(p) && !effects(s, p, 'IMMUNE').length) reveal(s, p, true, get(s, task.sourceId)); break
      case 'END_TURN': finishTurn(s); break
      case 'NEXT_TURN': advanceTurn(s); break
      case 'STATEMENT': statement(s, task); break
      case 'CHOICE': if (task.choice && alive(get(s, task.choice.playerId)!)) {
        const responder = get(s, task.choice.playerId)!
        if (!['VOTE', 'DEMAND'].includes(task.choice.kind) || !effects(s, responder, 'IMMUNE').length && !effects(s, responder, 'TALK').length) choice(s, task.choice)
      } break
      case 'VOTE_RESULT': {
        const max = Math.max(0, ...Object.values(s.votes ?? {}))
        if (max > 0) queue(s, clockwise(s, task.sourceId).filter(p => s.votes?.[p.id] === max).map(p => ({ kind: 'DAMAGE', sourceId: task.sourceId, targetId: p.id, value: 7, card: { uid: 'vote-effect', cardId: 'vote' } })))
        s.votes = undefined; break
      }
      case 'ATTACK': {
        if (!p || !alive(p) || !guardGeneration(s, task)) break
        task.deathGeneration ??= s.deathGenerations?.[p.id] ?? 0
        const source = get(s, task.sourceId)!
        const raw = task.value ?? 0
        if ((task.hits ?? 1) > 1) queue(s, [{ ...task, hits: (task.hits ?? 1) - 1 }])
        queue(s, [{ ...task, kind: 'DEFEND', hits: 1, value: raw, attack: true }])
        break
      }
      case 'DEFEND': {
        if (!p || !alive(p)) break
        const source = get(s, task.sourceId)!
        const raw = task.value ?? 0
        const options = (p.installed ?? []).filter(c => !['wolfSkin', 'foxFur', 'virus'].includes(c.cardId) && (c.cardId === 'trap' || raw > 0 && (c.cardId === 'justGuard' ? raw >= 3 : raw <= (cardOf(c).defense ?? 0))))
        if (options.length && !effects(s, p, 'IMMUNE').length) choice(s, { playerId: p.id, sourceId: source.id, kind: 'DEFENSE', title: `${source.name}から${raw}の通常ダメージ。発動する設置カードを選ぶ`, options: cardOptions(options), min: 0, max: 1, task: { ...task, value: raw, hits: 1, kind: 'DAMAGE', attack: true } })
        else queue(s, [{ ...task, value: raw, hits: 1, kind: 'DAMAGE', attack: true }])
        break
      }
    }
  }
  recalc(s)
  winner(s)
  if (!s.pendingChoice && !s.queue?.length && !s.winnerId && !s.draw && !alive(s.players[s.currentPlayerIndex]) && s.players.some(alive)) { finishTurn(s); drain(s) }
  return success(s)
}

export function playCard(source: GameState, input: PlayCardInput): GameResult {
  const s = copy(source), p = active(s, input.playerId)
  if (!p) return failure('現在はカードを使用できません。選択待ちか手番を確認してください。')
  const instance = p.hand.find(c => c.uid === input.cardUid)
  if (!instance) return failure('そのカードは手札にありません。')
  const c = cardOf(instance), target = get(s, input.targetId)
  if (c.unresolved) return failure('このカードは仕様確認中です。')
  if (input.choice === 'RETURN_ROLE') {
    if (c.kind !== 'ROLE' || p.role.state !== 'REVEALED') return failure('CO済みの場合だけ、不要な役職を戻せます。')
    p.hand = p.hand.filter(card => card.uid !== instance.uid); s.deck.unshift(instance); log(s, `${p.name}が不要な役職を山札の一番下へ戻した。`); return success(s)
  }
  if (permanent(s, p, 'STONE').some(e => e.value === s.turnNumber) && (p.turnCards ?? 0) >= 1) return failure('このターンは手札から1枚までしか使用できません。')
  if (c.kind === 'ROLE') {
    if (!['SET_ROLE', 'REVEAL_ROLE'].includes(input.choice) || p.role.state === 'REVEALED') return failure('CO済みの役職は上書きできません。')
    if (input.choice === 'REVEAL_ROLE' && c.roleEffect === 'SEER' && (!target || !alive(target))) return failure('強制開示する相手を選んでください。')
    if (input.choice === 'REVEAL_ROLE' && c.roleEffect === 'LOVER' && livingCount(s) < 3) return failure('純愛者は生存人数3人以上の場合だけCOできます。')
    if (input.choice === 'REVEAL_ROLE' && c.roleEffect === 'SEER' && !canTarget(s, p.id, target!.id)) return failure('その相手は選択対象にできません。')
    p.turnCards = (p.turnCards ?? 0) + 1
    p.hand = p.hand.filter(card => card.uid !== instance.uid)
    if (p.role.card) s.deck.unshift(p.role.card)
    p.role = { state: 'FACE_DOWN', card: instance }
    log(s, `${p.name}が役職カードを伏せて置いた。`)
    if (input.choice === 'REVEAL_ROLE') reveal(s, p, false, undefined, input.targetId)
    return drain(s)
  }
  const defense = input.choice === 'DEFENSE' && c.defense !== undefined
  const attack = input.choice === 'ATTACK' && c.attack !== undefined
  const speech = input.choice === 'STATEMENT' && c.kind === 'STATEMENT'
  if (!defense && !attack && !speech) return failure('このカードにはその使用方法がありません。')
  const needsTarget = (attack && c.target !== 'ALL') || speech && ['ONE', 'TWO'].includes(c.target ?? '') || defense && c.id === 'miracle'
  if (needsTarget && (!target || !alive(target))) return failure('生存中の対象を選んでください。')
  if (needsTarget && !canTarget(s, p.id, target!.id)) return failure('その相手は選択対象にできません。')
  const expansionError = validateExpansion(s, p, input, instance)
  if (expansionError) return failure(expansionError)
  const second = get(s, input.secondTargetId)
  if (c.id === 'roleSwap' && (!second || !canTarget(s, p.id, second.id) || second.id === target?.id)) return failure('異なる2人を選んでください。')
  if (c.id === 'doubleEdge' && (!Number.isInteger(input.amount) || input.amount! < 1 || input.amount! > 5)) return failure('1〜5の数値を選んでください。')
  if (c.id === 'retract' && p.role.state !== 'REVEALED') return failure('取り消すCOがありません。')
  if (input.double && (!speech || role(p) !== 'NONE' || p.abilityUsed)) return failure('発言カードを2回使う能力は使用できません。')
  if (input.double) p.abilityUsed = true
  discard(p, instance.uid)
  p.turnCards = (p.turnCards ?? 0) + 1
  log(s, `${p.name}が「${c.name}」を使用した。`)
  if (defense) {
    p.turnAttacks = (p.turnAttacks ?? 0) + 1
    if (['multiAttack', 'wall', 'miracle', 'hope'].includes(c.id)) timed(s, c.id === 'multiAttack' ? 'ELEMENT' : c.id === 'wall' ? 'WALL' : c.id === 'miracle' ? 'MIRACLE' : 'HOPE', p, p, c.id === 'wall' || c.id === 'hope' ? 'END' : 'START', instance, target?.id)
    else (p.installed ??= []).push(instance)
    p.discard = p.discard.filter(card => card.uid !== instance.uid)
  } else if (speech) {
    p.turnStatements = (p.turnStatements ?? 0) + (input.double ? 2 : 1)
    const task: EffectTask = { kind: 'STATEMENT', sourceId: p.id, targetId: c.target === 'SELF' || c.target === 'ALL' ? p.id : target?.id ?? p.id, card: instance, input, choice: { targetId: second?.id } as PendingChoice }
    const action: EffectTask = { kind: 'ACTION', sourceId: p.id, targetId: task.targetId, card: instance, single: c.target === 'ONE', tasks: [task] }
    queue(s, input.double ? [action, { ...action }] : [action])
  } else {
    p.turnAttacks = (p.turnAttacks ?? 0) + 1
    const targets = c.target === 'ALL' ? clockwise(s, p.id).filter(other => c.id === 'unbounded' ? other.role.state === 'REVEALED' : c.id === 'sheep' ? other.hp <= 2 : true) : [target!]
    for (const other of targets) expireAttackBan(s, p.id, other.id)
    const expanded = expansionAttack(s, p, target ?? p, instance, input, context())
    if (expanded) {
      queue(s, [{ kind: 'ACTION', sourceId: p.id, targetId: target?.id, card: instance, single: c.target === 'ONE', tasks: expanded }])
      return drain(s)
    }
    const value = attackBaseValue(p, c, target, input.amount)!
    if (c.id === 'reprieve') {
      queue(s, [{ kind: 'SCHEDULE_ATTACK', sourceId: p.id, targetId: target!.id, card: instance, value: attackValue(s, p, 10) }])
    } else if (c.id === 'brand') queue(s, [{ kind: 'LIFE_LOSS', sourceId: p.id, targetId: target!.id, sourceCard: instance, value: 3, attack: true }])
    else {
      queue(s, targets.map(other => ({ kind: 'ATTACK', sourceId: p.id, targetId: c.id === 'cyclone' && value < 0 ? p.id : other.id, value: attackValue(s, p, Math.abs(value)), hits: c.hits ?? 1, card: instance })))
      if (c.id === 'doubleEdge') s.queue!.push({ kind: 'ATTACK', sourceId: p.id, targetId: p.id, value: attackValue(s, p, value), card: instance })
      if (c.id === 'burst') s.queue!.push({ kind: 'LIFE_LOSS', sourceId: p.id, targetId: p.id, sourceCard: instance, value: 3, attack: true })
    }
    const tasks = s.queue!.splice(0)
    queue(s, [{ kind: 'ACTION', sourceId: p.id, targetId: target?.id, card: instance, single: c.target === 'ONE', tasks }])
  }
  return drain(s)
}

export function revealRole(source: GameState, playerId: string, targetId?: string): GameResult {
  const s = copy(source), p = active(s, playerId)
  if (!p || p.role.state !== 'FACE_DOWN' || !p.role.card) return failure('COできる伏せ役職がありません。')
  if (cardOf(p.role.card).roleEffect === 'SEER' && (!get(s, targetId) || !alive(get(s, targetId)!))) return failure('強制開示する相手を選んでください。')
  if (cardOf(p.role.card).roleEffect === 'SEER' && !canTarget(s, p.id, targetId!)) return failure('その相手は選択対象にできません。')
  if (cardOf(p.role.card).roleEffect === 'LOVER' && livingCount(s) < 3) return failure('純愛者は生存人数3人以上の場合だけCOできます。')
  reveal(s, p, false, undefined, targetId)
  return drain(s)
}

export function useRoleAbility(source: GameState, playerId: string, targetId: string): GameResult {
  const s = copy(source), p = active(s, playerId), t = get(s, targetId)
  if (!p || role(p) !== 'SEER' || p.abilityUsed || !t || !canTarget(s, p.id, t.id)) return failure('この能力は使用できません。')
  p.abilityUsed = true
  queue(s, [{ kind: 'ACTION', sourceId: p.id, targetId: t.id, sourceCard: p.role.card!, single: true, tasks: [{ kind: 'INSPECT_HAND', sourceId: p.id, targetId: t.id }] }])
  return drain(s)
}

export function endTurn(source: GameState, playerId: string): GameResult {
  const s = copy(source), p = active(s, playerId)
  if (!p) return failure('現在はターンを終了できません。')
  if (role(p) === 'KNIGHT') {
    const options = playerOptions(s, p.id).filter(o => o.id !== p.previousGuard)
    if (options.length) { choice(s, { playerId: p.id, sourceId: p.id, kind: 'GUARD', sourceCard: p.role.card ?? undefined, title: '護衛する相手を選ぶ（同じ人を連続で護衛できません）', options, min: 1, max: 1 }); return success(s) }
  }
  queue(s, [{ kind: 'END_TURN', sourceId: p.id }])
  return drain(s)
}

export function resolveChoice(source: GameState, playerId: string, choiceId: string, selected: string[], targetId?: string): GameResult {
  const s = copy(source), pending = s.pendingChoice, p = get(s, playerId)
  if (!pending || pending.id !== choiceId || pending.playerId !== playerId || !p || !alive(p)) return failure('その選択は現在受け付けられません。')
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.length < pending.min || selected.length > pending.max || selected.some(id => !pending.options.some(o => o.id === id))) return failure('選択する枚数・対象を確認してください。')
  const t = get(s, pending.targetId), from = get(s, pending.sourceId)!
  if (pending.kind === 'VOTE' && selected.length && (!get(s, targetId) || !canTarget(s, p.id, targetId!))) return failure('投票先を選んでください。')
  if (['GUARD', 'SEER', 'ASSASSIN', 'LOVE_TARGET', 'CHANGE_LOVE', 'REDIRECT'].includes(pending.kind) && selected.some(id => !canTarget(s, p.id, id))) return failure('その相手は選択対象にできません。')
  s.pendingChoice = null
  if (resolveReaction(s, pending, selected, context()) || expansionChoice(s, pending, selected, context())) return drain(s)
  switch (pending.kind) {
    case 'ORDER': queue(s, selected.map(id => pending.tasks!.find(task => task.effectId === id)!)); break
    case 'DEFENSE': {
      const used = p.installed?.find(c => c.uid === selected[0])
      if (used) {
        p.installed = p.installed!.filter(c => c.uid !== used.uid); p.discard.push(used)
        log(s, `${p.name}が「${cardOf(used).name}」を発動した。`)
        if (used.cardId === 'trap') queue(s, [{ kind: 'DAMAGE', sourceId: p.id, targetId: from.id, sourceCard: used, value: 2 }, { ...pending.task!, kind: 'DEFEND' }])
        else queue(s, [{ ...pending.task!, kind: 'DEFEND', value: 0 }])
      } else queue(s, [pending.task!])
      break
    }
    case 'RESCUE': {
      const card = selected[0] ? discard(p, selected[0]) : null
      if (card) p.turnCards = (p.turnCards ?? 0) + 1
      if (!card) die(s, pending.task!)
      else if (card.cardId === 'prayer') { healing(s, p, 5); if (p.hp <= 0) rescue(s, pending.task!) }
      else { p.hp = Math.max(1, p.hp); log(s, `${p.name}が一縷の希望で死亡を無効化した。`) }
      break
    }
    case 'GUARD': p.guardTarget = selected[0]; p.previousGuard = selected[0]; log(s, `${p.name}が${get(s, selected[0])!.name}を護衛する。`); queue(s, [{ kind: 'END_TURN', sourceId: p.id }]); break
    case 'SEER': queue(s, [{ kind: 'ACTION', sourceId: p.id, targetId: selected[0], sourceCard: p.role.card ?? undefined, single: true, tasks: [{ kind: 'FORCE_REVEAL', sourceId: p.id, targetId: selected[0] }] }]); break
    case 'ASSASSIN': if (selected[0]) {
      const target = get(s, selected[0])!
      if (livingCount(s) >= 3) queue(s, [{ kind: 'ACTION', sourceId: p.id, targetId: target.id, sourceCard: pending.sourceCard, single: true, tasks: [{ kind: 'KILL', sourceId: p.id, sourceCard: pending.sourceCard, targetId: target.id }] }])
      else if (!effects(s, target, 'IMMUNE').length) target.discard.push(...target.hand.splice(0))
    } break
    case 'DRAW': {
      const cards = pending.cards ?? []
      if (pending.amount === -1) { s.deck.push(...selected.map(uid => cards.find(c => c.uid === uid)!).reverse()); break }
      p.hand.push(...selected.map(uid => cards.find(c => c.uid === uid)!))
      const rest = cards.filter(c => !selected.includes(c.uid))
      if (rest.length) choice(s, { ...pending, amount: -1, title: '山札に戻すカードを、一番上になる順に選ぶ', cards: rest, options: cardOptions(rest), min: rest.length, max: rest.length })
      break
    }
    case 'RECOVER': if (t) { const cards = t.discard.filter(c => selected.includes(c.uid)); t.discard = t.discard.filter(c => !selected.includes(c.uid)); p.hand.push(...cards) } break
    case 'TRADE': {
      if (!t || !alive(t)) break
      if (pending.cards) {
        const received = p.hand.filter(c => selected.includes(c.uid)); p.hand = p.hand.filter(c => !selected.includes(c.uid)); p.hand.push(...pending.cards); from.hand.push(...received)
      } else if (selected.length && t.id !== p.id) {
        const cards = p.hand.filter(c => selected.includes(c.uid)); p.hand = p.hand.filter(c => !selected.includes(c.uid))
        choice(s, { playerId: t.id, sourceId: p.id, targetId: p.id, kind: 'TRADE', sourceCard: pending.sourceCard, title: `${p.name}と交換する手札を${cards.length}枚選ぶ`, cards, options: cardOptions(t.hand), min: cards.length, max: cards.length })
      }
      break
    }
    case 'VOTE': for (const id of selected) discard(p, id); if (selected.length && targetId) { s.votes ??= {}; s.votes[targetId] = (s.votes[targetId] ?? 0) + selected.length; log(s, `${p.name}が${get(s, targetId)!.name}に${selected.length}票投じた。`) } break
    case 'DEMAND': if (selected.length) { const card = p.hand.find(c => c.uid === selected[0])!; p.hand = p.hand.filter(c => c.uid !== card.uid); from.hand.push(card) } else queue(s, [{ kind: 'DAMAGE', sourceId: from.id, targetId: p.id, sourceCard: pending.sourceCard, value: 3 }]); break
  }
  return drain(s)
}
