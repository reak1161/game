import { cardOf } from './game/cards'
import type { CardDefinition, CardInstance } from './game/types'

const kindNames = { ROLE: '役職', STATEMENT: '発言', ATTACK: '攻撃', DEFENSE: '防御', TWINS: 'ツインズ' }

export function CardMark({ card }: { card?: CardDefinition }) {
  const shape = !card ? <><path d="m12 9 12 12L36 9l-2 29-10 12-10-12Z" /><path d="m12 9 8 22-6 7m22-29-8 22 6 7m-14-7 4 4 4-4m-9 10 5 3 5-3" /></>
    : card.kind === 'ATTACK' ? <><path d="m29 7 8 2 2 8-21 22-9-9Z" /><path d="m12 34-6 6 8 8 6-6M8 46l-4 4M32 14 15 32" /></>
    : card.kind === 'DEFENSE' || card.roleEffect === 'KNIGHT' ? <><path d="m24 6 17 8-3 20c-2 8-14 16-14 16S12 42 10 34L7 14Z" /><path d="M24 13v29M15 23h18" /></>
    : card.kind === 'TWINS' ? <><path d="M24 6a22 22 0 0 1 0 44 11 11 0 0 0 0-22 11 11 0 0 1 0-22Z" fill="currentColor" stroke="none" /><circle cx="24" cy="28" r="22" /><circle cx="24" cy="17" r="3" fill="var(--card-paper)" stroke="none" /><circle cx="24" cy="39" r="3" fill="currentColor" /></>
    : card.roleEffect === 'SEER' ? <><path d="M3 28s8-14 21-14 21 14 21 14-8 14-21 14S3 28 3 28Z" /><circle cx="24" cy="28" r="7" /><path d="M24 4v5m0 38v5M8 10l4 5m24 0 4-5" /></>
    : card.roleEffect === 'WOLF' ? <><path d="m9 6 15 12L39 6l-3 31-12 15-12-15Z" /><path d="m9 6 10 23-7 8m27-31L29 29l7 8m-17-8 5 5 5-5m-10 12 5 4 5-4" /></>
    : <><path d="m24 5 17 23-17 23L7 28Z" /><circle cx="24" cy="28" r="8" /><path d="M24 13v7m0 16v7" /></>
  return <svg viewBox="0 0 48 56" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{shape}</svg>
}

export default function CardFace({ instance, defense = false, rank: displayedRank }: { instance: CardInstance; defense?: boolean; rank?: string }) {
  const definition = cardOf(instance)
  const card = defense && definition.defense !== undefined ? { ...definition, kind: 'DEFENSE' as const } : definition
  const rank = defense && card.defense !== undefined ? card.id === 'trap' ? '↶' : card.id === 'justGuard' ? '3+' : card.defense === 0 ? '継' : String(card.defense) : card.kind === 'ROLE' ? { NONE: '民', WOLF: '狼', SEER: '占', KNIGHT: '騎', MEDIUM: '霊', ASSASSIN: '暗', DOLL: '呪', RED_HOOD: '赤', LOVER: '愛', FOX: '狐', VAMPIRE: '血' }[card.roleEffect ?? 'NONE'] : card.kind === 'STATEMENT' ? '言' : String(card.attack ?? card.defense ?? '誘')
  return <span className={`paper-card ${card.kind.toLowerCase()}`}>
      <span className="card-corner"><b>{displayedRank ?? rank}</b><small>{kindNames[card.kind]}</small></span>
    <span className="paper-mark"><CardMark card={card} /></span>
    <span className="paper-name">{card.name}</span>
    <span className="card-corner lower" aria-hidden="true"><b>{displayedRank ?? rank}</b></span>
  </span>
}
