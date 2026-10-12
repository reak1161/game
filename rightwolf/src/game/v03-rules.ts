import { cardOf } from './cards'
import type { EffectTask, GameState, Player, TimedEffect } from './types'

export const alive = (p: Player) => p.status === 'ALIVE'
export const roleOf = (p: Player) => p.role.state === 'REVEALED' && p.role.card ? cardOf(p.role.card).roleEffect : undefined
export const livingCount = (s: GameState) => s.players.filter(p => alive(p) && roleOf(p) !== 'LOVER').length
export const permanent = (s: GameState, p: Player, kind: TimedEffect['kind']) => (s.effects ?? []).filter(e => e.targetId === p.id && e.kind === kind && s.players.some(owner => owner.id === e.ownerId && alive(owner)))
export const installedCount = (p: Player, id: string) => alive(p) ? (p.installed ?? []).filter(c => c.cardId === id).length : 0
export const handAllowed = (s: GameState, p: Player) => !permanent(s, p, 'STONE').some(e => e.value === s.turnNumber) || (p.turnCards ?? 0) < 1

export function canTarget(s: GameState, sourceId: string, targetId: string) {
  return s.players.some(p => p.id === targetId && alive(p)) && !(s.effects ?? []).some(e => e.kind === 'TARGET_BAN' && e.targetId === sourceId && e.ownerId === targetId && s.players.some(p => p.id === e.ownerId && alive(p)))
}
export function addExtra(s: GameState, playerId: string, fatal = false) { (s.extraTurns ??= []).push({ playerId, fatal }) }
export function putPermanent(s: GameState, kind: TimedEffect['kind'], owner: Player, target: Player, card: TimedEffect['card']) {
  const effect: TimedEffect = { id: `effect-${s.nextLogId++}`, kind, ownerId: owner.id, targetId: target.id, expires: Number.MAX_SAFE_INTEGER, timing: 'START', card, sourceCard: card }
  ;(s.effects ??= []).push(effect)
  return effect
}
export function revokeCardLinks(s: GameState) {
  s.victoryLinks = (s.victoryLinks ?? []).filter(link => link.kind === 'ROLE' || s.effects?.some(e => e.kind === 'LOVE' && e.card?.uid === link.cardUid))
}
export function expireAttackBan(s: GameState, sourceId: string, targetId: string) {
  const remove = (s.effects ?? []).filter(e => e.kind === 'TARGET_BAN' && e.ownerId === sourceId && e.targetId === targetId)
  s.effects = (s.effects ?? []).filter(e => !remove.includes(e))
  for (const e of remove) if (e.card) s.players.find(p => p.id === e.targetId)!.discard.push(e.card)
}
export function guardGeneration(s: GameState, task: EffectTask) {
  return task.deathGeneration === undefined || task.deathGeneration === (s.deathGenerations?.[task.targetId!] ?? 0)
}
