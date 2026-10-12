import { cardOf } from './cards'
import { alive, canTarget, handAllowed } from './v03-rules'
import type { EffectContext } from './v03-effects'
import type { CardInstance, EffectTask, GameState, PendingChoice } from './types'

const options = (cards: CardInstance[]) => cards.map(card => ({ id: card.uid, label: cardOf(card).name, card }))

export function actionReaction(s: GameState, task: EffectTask, ctx: EffectContext) {
  const order = [...s.players.slice(s.parentIndex), ...s.players.slice(0, s.parentIndex)]
  for (const p of order.filter(alive)) {
    const cards = task.card && cardOf(task.card).kind === 'STATEMENT' ? (p.installed ?? []).filter(c => c.cardId === 'wolfSkin') : []
    if (handAllowed(s, p) && task.single && task.targetId === p.id && !s.effects?.some(e => e.targetId === p.id && e.kind === 'IMMUNE' && s.players.some(owner => owner.id === e.ownerId && alive(owner)))) {
      cards.push(...p.hand.filter(c => c.cardId === 'temptation' || c.cardId === 'counterG' && task.card && cardOf(task.card).kind === 'STATEMENT' && cardOf(task.card).target === 'ONE'))
    }
    const available = cards.filter(c => !task.reacted?.includes(c.uid))
    if (!available.length) continue
    ctx.choice(s, { kind: 'INTERRUPT', stage: available.some(c => p.installed?.some(i => i.uid === c.uid)) ? 'FIELD' : 'HAND', playerId: p.id, sourceId: task.sourceId, sourceCard: task.card ?? task.sourceCard, targetId: task.targetId, title: '誘発', min: 0, max: 1, options: options(available), task: { ...task, reacted: [...(task.reacted ?? []), ...available.map(c => c.uid)] } })
    return
  }
  ctx.queue(s, task.tasks ?? [])
}

export function damageReaction(s: GameState, task: EffectTask, amount: number, ctx: EffectContext): boolean {
  if (task.damageChecked || amount <= 0) return false
  const p = s.players.find(p => p.id === task.targetId)!
  if (!handAllowed(s, p)) return false
  const cards = p.hand.filter(c => c.cardId === 'counterA' || c.cardId === 'counterB' && amount >= 3 || c.cardId === 'deflect')
  if (!cards.length) return false
  ctx.choice(s, { kind: 'DAMAGE_RESPONSE', playerId: p.id, sourceId: task.sourceId, sourceCard: task.card ?? task.sourceCard, title: 'ダメージへの誘発', options: options(cards), min: 0, max: 1, task: { ...task, damageChecked: true } })
  return true
}

export function resolveReaction(s: GameState, pending: PendingChoice, selected: string[], ctx: EffectContext): boolean {
  const p = s.players.find(p => p.id === pending.playerId)!, task = pending.task
  if (!['INTERRUPT', 'REDIRECT', 'DAMAGE_RESPONSE', 'SILENCE'].includes(pending.kind)) return false
  if (pending.kind === 'REDIRECT') {
    const newTarget = selected[0]
    const target = s.players.find(p => p.id === newTarget)!
    const tasks = task!.tasks!.map(t => ({
      ...t, targetId: !t.selfCost && t.targetId === pending.targetId ? newTarget : t.targetId,
      deathGeneration: t.deathGeneration === undefined ? undefined : s.deathGenerations?.[newTarget] ?? 0,
      input: t.input ? { ...t.input, targetId: newTarget } : undefined,
      choice: t.choice?.kind === 'SCISSORS' ? { ...t.choice, targetId: newTarget, options: target.hand.map((_, i) => ({ id: `back-${i}`, label: `裏向きの手札 ${i + 1}` })), min: Math.min(1, target.hand.length), max: Math.min(1, target.hand.length) } : t.choice,
    }))
    ctx.queue(s, [{ ...task!, targetId: newTarget, tasks }]); return true
  }
  if (!selected.length) { if (task) ctx.queue(s, [task]); return true }
  const c = p.hand.find(c => c.uid === selected[0]) ?? p.installed?.find(c => c.uid === selected[0])
  if (!c) return true
  p.hand = p.hand.filter(card => card.uid !== c.uid)
  p.installed = (p.installed ?? []).filter(card => card.uid !== c.uid)
  p.discard.push(c)
  p.turnCards = (p.turnCards ?? 0) + (cardOf(c).reactive ? 1 : 0)
  if (pending.kind === 'SILENCE') { ctx.queue(s, [{ kind: 'END_TURN', sourceId: pending.sourceId }]); return true }
  if (c.cardId === 'wolfSkin') return true
  if (c.cardId === 'temptation') {
    const candidates = s.players.filter(other => other.id !== p.id && canTarget(s, p.id, other.id)).map(other => ({ id: other.id, label: other.name }))
    if (candidates.length) ctx.choice(s, { ...pending, kind: 'REDIRECT', title: '変更先', options: candidates, min: 1, max: 1 })
    else ctx.queue(s, [task!])
    return true
  }
  if (c.cardId === 'counterG') {
    const tasks = task!.tasks!.map(t => ({ ...t, sourceId: p.id, targetId: pending.sourceId, input: t.input ? { ...t.input, playerId: p.id, targetId: pending.sourceId } : undefined }))
    ctx.queue(s, [{ ...task!, sourceId: p.id, targetId: pending.sourceId, tasks }]); return true
  }
  if (pending.kind === 'DAMAGE_RESPONSE') {
    const returned = c.cardId === 'deflect' ? Math.floor((task!.value ?? 0) / 2) : c.cardId === 'counterB' ? 2 : 1
    ctx.queue(s, [
      { kind: 'DAMAGE', sourceId: p.id, targetId: pending.sourceId, value: returned, sourceCard: c },
      { ...task!, value: c.cardId === 'deflect' ? (task!.value ?? 0) - returned : 0 },
    ])
  }
  return true
}
