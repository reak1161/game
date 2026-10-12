import { cardOf } from './cards'
import { addExtra, alive, canTarget, livingCount, putPermanent, roleOf } from './v03-rules'
import type { CardInstance, EffectTask, GameState, PendingChoice, PlayCardInput, Player } from './types'
import { sumCardEffectNumbers } from './card-numbers'

export interface EffectContext {
  queue: (s: GameState, tasks: EffectTask[]) => void
  choice: (s: GameState, choice: Omit<PendingChoice, 'id'>) => void
  draw: (s: GameState, p: Player, amount: number) => void
  heal: (s: GameState, p: Player, amount: number) => void
  attack: (s: GameState, p: Player, value: number) => number
}
const options = (cards: CardInstance[]) => cards.map(card => ({ id: card.uid, label: cardOf(card).name, card }))
const targets = (s: GameState, id: string) => s.players.filter(p => canTarget(s, id, p.id)).map(p => ({ id: p.id, label: p.name }))
const damage = (sourceId: string, targetId: string, value: number, card: CardInstance): EffectTask => ({ kind: 'DAMAGE', sourceId, targetId, value, card, sourceCard: card })
const loss = (sourceId: string, targetId: string, value: number, card: CardInstance): EffectTask => ({ kind: 'LIFE_LOSS', sourceId, targetId, value, sourceCard: card, selfCost: sourceId === targetId })

export function validateExpansion(s: GameState, p: Player, input: PlayCardInput, card: CardInstance): string | undefined {
  const id = card.cardId
  if (cardOf(card).reactive) return 'このカードは誘発時に手札から使用します。'
  if (id === 'sunrise' && s.time !== 'DAY' || id === 'whiteNight' && s.time !== 'NIGHT') return '現在の昼夜では使用できません。'
  if (['cakeWine', 'affection'].includes(id) && !(id === 'cakeWine' ? ['CAKE', 'WINE'] : ['DAMAGE', 'BOTH']).includes(input.mode ?? '')) return '使用する効果を選んでください。'
  if (['scales', 'rain'].includes(id) && (!Number.isInteger(input.amount) || input.amount! < 0 || input.amount! > p.hp)) return 'HP減少量を確認してください。'
  if (id === 'rain') {
    const entries = Object.entries(input.distribution ?? {})
    if (entries.some(([id, value]) => id === p.id || !canTarget(s, p.id, id) || !Number.isInteger(value) || value < 0) || entries.reduce((n, [, value]) => n + value, 0) !== input.amount) return '分配値の合計をHP減少量と一致させてください。'
  }
}

export function expansionStatement(s: GameState, task: EffectTask, ctx: EffectContext): boolean {
  const p = s.players.find(p => p.id === task.sourceId)!, t = s.players.find(p => p.id === task.targetId) ?? p, card = task.card!, input = task.input
  switch (card.cardId) {
    case 'catVoice': putPermanent(s, 'TARGET_BAN', p, t, card); break
    case 'burningLove':
      putPermanent(s, 'LOVE', p, t, card)
      ;(s.victoryLinks ??= []).push({ ownerId: p.id, targetId: t.id, kind: 'CARD', cardUid: card.uid }); break
    case 'basket': putPermanent(s, 'BASKET', p, p, card); break
    case 'stone': { const e = putPermanent(s, 'STONE', p, t, card); e.expires = s.turnNumber; e.value = s.turnNumber; break }
    case 'crucifix': putPermanent(s, 'MAX_HP', p, t, card); break
    case 'cakeWine': ctx.heal(s, t, input?.mode === 'WINE' ? Math.max(0, 7 - t.hp) : 3); break
    case 'fickle':
      if (roleOf(p) === 'LOVER') {
        const link = s.victoryLinks?.find(e => e.kind === 'ROLE' && e.ownerId === p.id)
        if (alive(p) && link) ctx.choice(s, { kind: 'CHANGE_LOVE', playerId: p.id, sourceId: p.id, sourceCard: card, targetId: link.targetId, title: '愛する人', options: targets(s, p.id).filter(o => o.id !== link.targetId), min: 0, max: 1 })
      } else ctx.queue(s, [{ kind: 'DRAW_CARDS', sourceId: p.id, targetId: p.id, value: 2 }, damage(p.id, p.id, 1, card)])
      break
    case 'reverseTime':
      ctx.queue(s, [...(s.time === 'DAY' ? [{ kind: 'HEAL' as const, sourceId: p.id, targetId: t.id, value: 3 }] : [1, 1, 2].map(n => damage(p.id, t.id, n, card))), { kind: 'SWITCH_TIME', sourceId: p.id }]); break
    case 'whiteCandle': { const n = p.hand.length; p.discard.push(...p.hand.splice(0)); if (n >= 2) addExtra(s, p.id); break }
    case 'blackCandle': {
      const n = s.players.filter(alive).reduce((sum, other) => {
        if (s.effects?.some(e => e.targetId === other.id && ['TALK', 'IMMUNE'].includes(e.kind) && s.players.some(p => p.id === e.ownerId && alive(p)))) return sum
        const count = other.hand.length; other.discard.push(...other.hand.splice(0)); return sum + count
      }, 0)
      if (n >= livingCount(s) * 2) addExtra(s, p.id); break
    }
    case 'fate': addExtra(s, p.id, true); break
    case 'crow': {
      const cards = s.deck.splice(Math.max(0, s.deck.length - 5)).reverse()
      if (alive(p)) ctx.choice(s, { playerId: p.id, sourceId: p.id, sourceCard: card, kind: 'CROW_ORDER', title: '山札の順番', options: options(cards), cards, min: cards.length, max: cards.length })
      else s.deck.push(...cards.reverse()); break
    }
    case 'danger': ctx.queue(s, [loss(p.id, p.id, Math.max(0, p.hp - 1), card), ...(t.id === p.id ? [] : [loss(p.id, t.id, Math.max(0, t.hp - 1), card)])]); break
    case 'scales': {
      const e = putPermanent(s, 'HEAL_RESERVATION', p, p, undefined); e.sourceCard = card; e.expires = (p.turnsStarted ?? 0) + 1; e.value = input!.amount! * 2
      ctx.queue(s, [loss(p.id, p.id, input!.amount!, card)]); break
    }
    case 'comeback': ctx.heal(s, p, p.turnDamage ?? 0); break
    default: return false
  }
  if (['catVoice', 'burningLove', 'basket', 'stone', 'crucifix'].includes(card.cardId)) p.discard = p.discard.filter(c => c.uid !== card.uid)
  return true
}

export function expansionAttack(s: GameState, p: Player, target: Player, card: CardInstance, input: PlayCardInput, ctx: EffectContext): EffectTask[] | undefined {
  const hit = (to: string, base: number): EffectTask => ({ kind: 'ATTACK', sourceId: p.id, targetId: to, value: ctx.attack(s, p, base), card, sourceCard: card })
  switch (card.cardId) {
    case 'hunt': return target.role.state === 'REVEALED' && target.role.card?.cardId === 'wolf' ? [hit(target.id, 5)] : [hit(target.id, 2), ...(target.role.state === 'FACE_DOWN' ? [{ kind: 'AFTER_HUNT' as const, sourceId: p.id, targetId: target.id, card, value: ctx.attack(s, p, 3), deathGeneration: s.deathGenerations?.[target.id] ?? 0 }] : [])]
    case 'affection': {
      const n = Math.max(0, p.hp - 1)
      return [loss(p.id, p.id, n, card), ...(input.mode === 'BOTH' ? target.id === p.id ? [] : [loss(p.id, target.id, Math.max(0, target.hp - 1), card)] : [hit(target.id, n)])]
    }
    case 'scissors': return [{ kind: 'CHOICE', sourceId: p.id, choice: { id: '', kind: 'SCISSORS', title: '裏向きの手札', sourceId: p.id, playerId: p.id, targetId: target.id, sourceCard: card, options: target.hand.map((_, i) => ({ id: `back-${i}`, label: `裏向きの手札 ${i + 1}` })), min: Math.min(1, target.hand.length), max: Math.min(1, target.hand.length) } }]
    case 'sunrise': return [{ kind: 'HEAL', sourceId: p.id, targetId: p.id, value: 2 }, hit(target.id, 3)]
    case 'whiteNight': return [{ ...hit(target.id, 3), chain: true }]
    case 'vampirePlay': return [{ ...hit(target.id, 2), drainLife: true }]
    case 'resolve': return [hit(target.id, (p.turnSelfLoss ?? 0) * 2)]
    case 'rain': return [loss(p.id, p.id, input.amount!, card), ...Object.entries(input.distribution!).filter(([, value]) => value > 0).map(([id, value]) => hit(id, value))]
  }
}

export function expansionChoice(s: GameState, pending: PendingChoice, selected: string[], ctx: EffectContext): boolean {
  const p = s.players.find(p => p.id === pending.playerId)!
  switch (pending.kind) {
    case 'LOVE_TARGET': (s.victoryLinks ??= []).push({ ownerId: p.id, targetId: selected[0], kind: 'ROLE' }); break
    case 'CHANGE_LOVE': if (selected[0]) {
      const link = s.victoryLinks?.find(link => link.ownerId === p.id && link.kind === 'ROLE')
      if (link) { const old = link.targetId; link.targetId = selected[0]; ctx.queue(s, [damage(p.id, old, 3, pending.sourceCard!)]) }
    } break
    case 'CROW_ORDER': {
      s.deck.push(...selected.map(id => pending.cards!.find(c => c.uid === id)!).reverse())
      ctx.choice(s, { playerId: p.id, sourceId: p.id, sourceCard: pending.sourceCard, kind: 'CROW_HAND', title: '入れ替える手札', min: 0, max: p.hand.length, options: options(p.hand) }); break
    }
    case 'CROW_HAND': {
      const cards = p.hand.filter(c => selected.includes(c.uid)); p.hand = p.hand.filter(c => !selected.includes(c.uid)); p.discard.push(...cards); ctx.draw(s, p, cards.length); break
    }
    case 'SCISSORS': {
      const t = s.players.find(p => p.id === pending.targetId)!
      if (selected.length && alive(t)) {
        const c = t.hand.splice(Number(selected[0].slice(5)), 1)[0]
        if (c) { t.discard.push(c); const n = sumCardEffectNumbers(c.cardId); ctx.queue(s, [{ kind: 'ATTACK', sourceId: p.id, targetId: t.id, value: ctx.attack(s, p, Math.max(0, Math.floor(n / 2))), card: pending.sourceCard }]) }
      } break
    }
    default: return false
  }
  return true
}
