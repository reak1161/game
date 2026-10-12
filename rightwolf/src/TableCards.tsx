import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent } from 'react'
import CardFace, { CardMark } from './CardFace'
import { cardOf } from './game/cards'
import type { CardInstance, GameState, Player, TimedEffect } from './game/types'

export const effectNames = { HALF: '全ステータス1/2', REDUCE: '通常ダメージ−1', TALK: '巧みな話術', IMMUNE: '効果無効', HOWL: '人狼の雄叫び', CITIZEN: '市民権', BLOCK: '論破', ELEMENT: '2以下を無効化', WALL: '通常ダメージ無効', MIRACLE: '奇跡の盾', HOPE: '一縷の希望', DELAY: '残虐な猶予', REVIVAL: '復活予約', ATTACK_HALF: '攻撃力1/2', TARGET_BAN: '対象選択禁止', LOVE: '勝利／死亡リンク', STONE: '手札使用1枚まで', BASKET: '手札上限+1', MAX_HP: '最大HP5', FOX_FUR: '夜の通常ダメージ−4', VIRUS: '正のダメージ1', HEAL_RESERVATION: '回復予約' }
export type FieldEntry = { id: string; card?: CardInstance; label: string; badge: string; description: string; active: boolean; effect?: TimedEffect }

export function fieldEntries(player: Player, game: GameState): FieldEntry[] {
  return [
    ...(player.installed ?? []).map(card => ({ id: card.uid, card, label: cardOf(card).name, badge: card.cardId === 'wolfSkin' ? '攻撃力+1 · 発言無効化' : card.cardId === 'foxFur' ? '夜のダメージ−4' : card.cardId === 'virus' ? '正のダメージ1' : card.cardId === 'trap' ? '反撃 2' : card.cardId === 'justGuard' ? '3以上 · 1ヒット' : `${cardOf(card).defense}以下 · 1ヒット`, description: cardOf(card).description, active: player.status === 'ALIVE' })),
    ...(game.effects ?? []).filter(e => e.targetId === player.id).map(effect => {
      const owner = game.players.find(p => p.id === effect.ownerId)!
      const remaining = Math.max(0, effect.expires - (owner.turnsStarted ?? 0))
      const timing = effect.expires === Number.MAX_SAFE_INTEGER ? '設置中' : effect.kind === 'STONE' ? 'このターン終了まで' : `${owner.name}の${remaining ? `${remaining}ターン後の` : 'このターンの'}${effect.timing === 'START' ? '開始時' : '終了時'}まで`
      const card = effect.card ?? effect.sourceCard
      return { id: effect.id, card, effect, label: effectNames[effect.kind], badge: effect.kind === 'DELAY' ? `${effect.value ?? 10}ダメージ予約` : effectNames[effect.kind], description: `${effect.kind === 'DELAY' ? `${owner.name}の${remaining}ターン後の終了時に${effect.value ?? 10}の通常ダメージ。使用者死亡後も残る。` : `${card ? cardOf(card).description : effectNames[effect.kind]} ${timing}。`}`, active: player.status === 'ALIVE' && (effect.kind === 'DELAY' || owner.status === 'ALIVE') }
    }),
  ]
}

export function cardRowKeys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0) return
  event.preventDefault()
  buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
}

export function InstalledCards({ player, game, events, order, hidden = false }: {
  player: Player; game: GameState; events: (entry: FieldEntry) => ButtonHTMLAttributes<HTMLButtonElement>; hidden?: boolean
  order?: { options: string[]; selected: string[]; enabled: boolean; toggle: (id: string) => void }
}) {
  const entries = fieldEntries(player, game)
  if (!entries.length || hidden) return null
  return <div className="installed-cards" role="group" aria-label={`${player.name}の設置カードと効果`} onKeyDown={cardRowKeys}>
    {entries.map((entry, index) => {
      const eligible = order?.options.includes(entry.id)
      const selected = Boolean(order?.selected.includes(entry.id))
      const number = order?.selected.indexOf(entry.id) ?? -1
      const handlers = events(entry)
      return <button key={entry.id} data-field-entry={entry.id} data-effect-id={entry.effect?.id} className={`installed-card ${entry.active ? '' : 'is-inactive'} ${eligible ? 'is-eligible' : ''} ${selected ? 'is-selected' : ''}`} style={{ '--installed-delay': `${Math.min(index, 5) * 50}ms` } as CSSProperties}
        {...handlers} onClick={eligible ? () => { if (order?.enabled) order.toggle(entry.id) } : handlers.onClick}
        aria-disabled={eligible && !order?.enabled || undefined} aria-pressed={eligible ? selected : undefined}
        aria-label={`${player.name}の${entry.effect ? '効果' : '設置'}：${entry.label}、${entry.badge}${entry.active ? '' : '、現在無効'}`}>
        <span className="installed-face">{entry.card ? <CardFace instance={entry.card} defense={cardOf(entry.card).kind !== 'STATEMENT'} /> : <span className="effect-token">{entry.label}</span>}</span>
        <span className="installed-condition">{entry.badge}</span>
        {number >= 0 && <b className="choice-number">{number + 1}</b>}
      </button>
    })}
  </div>
}

export function CardSpread({ cards, title, selected = [], enabled = true, onSelect, onClose, source, events, multiple = false }: {
  cards: Array<{ id: string; label: string; card?: CardInstance }>; title: string; selected?: string[]; enabled?: boolean
  onSelect?: (id: string) => void; onClose?: () => void; source: 'deck' | 'discard' | 'hand' | 'field'; multiple?: boolean
  events: (card?: CardInstance) => ButtonHTMLAttributes<HTMLButtonElement>
}) {
  return <section className={`card-spread from-${source}`} role="region" aria-label={title}>
    <header><strong>{title}</strong>{onClose && <button onClick={onClose} aria-label="カード一覧を閉じる">×</button>}</header>
    <div className="spread-cards" onKeyDown={cardRowKeys}>{cards.map(option => <button key={option.id} className={`spread-card ${selected.includes(option.id) ? 'is-selected' : ''}`} disabled={onSelect ? !enabled : undefined} aria-pressed={onSelect ? selected.includes(option.id) : undefined} aria-label={option.label} {...events(option.card)} onClick={onSelect ? () => onSelect(option.id) : events(option.card).onClick}>
      <span className="spread-face">{option.card ? <CardFace instance={option.card} /> : <span className="card-back" aria-hidden="true"><span><CardMark /></span></span>}</span><strong>{option.label}</strong>
      {multiple && selected.includes(option.id) && <b className="choice-number">{selected.indexOf(option.id) + 1}</b>}
    </button>)}</div>
    {!cards.length && <p>カードはありません</p>}
  </section>
}
