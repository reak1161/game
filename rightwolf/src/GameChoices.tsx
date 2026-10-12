import { useEffect, useRef, useState } from 'react'
import { cardOf } from './game/cards'
import { cardAttackDisplay } from './game/card-display'
import type { CardInstance, GameState, PendingChoice } from './game/types'
import type { CSSProperties } from 'react'
import type { ClientMessage } from './network/protocol'
import CardFace from './CardFace'
import CardPopover from './CardPopover'
import { canTarget } from './game/v03-rules'
import './choices.css'

export const isHandChoice = (choice?: PendingChoice | null) => Boolean(choice && (['TRADE', 'VOTE', 'DEMAND', 'RESCUE', 'CROW_HAND', 'DAMAGE_RESPONSE', 'SILENCE'].includes(choice.kind) || choice.kind === 'INTERRUPT' && choice.stage === 'HAND'))
export const isPlayerChoice = (choice?: PendingChoice | null) => Boolean(choice && ['GUARD', 'SEER', 'ASSASSIN', 'LOVE_TARGET', 'CHANGE_LOVE', 'REDIRECT'].includes(choice.kind))

export function useChoiceSelection(choice: PendingChoice | null | undefined, selfId: string, connected: boolean, error: string, send: (m: ClientMessage) => void) {
  const key = `${choice?.id ?? ''}:${error}:${connected}`
  const initial = { key, selected: [] as string[], targetId: '', sent: false }
  const [stored, setStored] = useState(initial)
  const state = stored.key === key ? stored : initial
  const lock = useRef('')
  useEffect(() => { lock.current = ''; setStored({ key, selected: [], targetId: '', sent: false }) }, [key])
  const enabled = Boolean(choice && choice.playerId === selfId && connected && !state.sent)
  const toggle = (id: string) => {
    if (!enabled || !choice!.options.some(o => o.id === id)) return
    setStored(current => {
      const value = current.key === key ? current : initial
      const selected = value.selected.includes(id) ? value.selected.filter(uid => uid !== id) : value.selected.length < choice!.max ? [...value.selected, id] : choice!.max === 1 ? [id] : value.selected
      return { ...value, selected }
    })
  }
  const setTargetId = (targetId: string) => { if (enabled) setStored(current => ({ ...(current.key === key ? current : initial), targetId })) }
  const valid = enabled && state.selected.length >= choice!.min && (choice!.kind !== 'VOTE' || !state.selected.length || Boolean(state.targetId))
  const respond = (answer: string[]) => {
    if (!enabled || answer.length < choice!.min || answer.length > choice!.max || (choice!.kind === 'VOTE' && answer.length && !state.targetId) || lock.current === key) return
    lock.current = key
    setStored({ ...state, selected: answer, sent: true })
    send({ type: 'RESOLVE_CHOICE', choiceId: choice!.id, selected: answer, targetId: state.targetId || undefined })
  }
  return { ...state, enabled, valid, toggle, setTargetId, submit: () => respond(state.selected), skip: () => respond([]) }
}

export function EffectSource({ card, owner, summary, rank }: { card?: CardInstance; owner?: string; summary?: string; rank?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => { clearTimeout(timer.current) }
  const close = () => { cancel(); setAnchor(null) }
  useEffect(() => { setAnchor(null); return () => clearTimeout(timer.current) }, [card?.uid, summary])
  if (!card && !summary) return null
  return <div className="effect-source" onPointerEnter={event => { cancel(); const node = event.currentTarget; timer.current = setTimeout(() => setAnchor(node), 550) }} onPointerLeave={() => { cancel(); timer.current = setTimeout(close, 150) }}>
    {card && <button type="button" className="effect-source-face" aria-haspopup="dialog" onClick={event => { cancel(); setAnchor(event.currentTarget) }} aria-label={`効果元：${cardOf(card).name}`}><CardFace instance={card} rank={rank} /></button>}<div><small>{owner ? `${owner}の効果` : '効果元'}</small>{card && <strong>{cardOf(card).name}</strong>}{summary && <p>{summary}</p>}</div>
    {anchor && <CardPopover anchor={anchor} title={card ? cardOf(card).name : '効果'} caption={owner ? `${owner}の効果` : '効果元'} description={[summary, card && cardOf(card).description].filter(Boolean).join('\n')} onClose={close} onEnter={cancel} onLeave={close} />}
  </div>
}

function ChoiceOutcome({ choice, selected }: { choice: PendingChoice; selected: string[] }) {
  const view = choice.presentation
  if (!view) return null
  if (choice.kind === 'DEMAND') return <div className="choice-comparison" aria-live="polite">
    <div className={selected.length ? 'is-current' : ''}><b>渡す</b><p>{selected.length ? view.options[selected[0]] : '手札1枚を渡す · HP変化なし'}</p></div>
    <div className={!selected.length ? 'is-current' : ''}><b>拒否する</b><p>{view.skip}</p></div>
  </div>
  const count = selected.length
  const aggregate = choice.kind === 'TRADE' ? `${count}枚を交換に出す` : choice.kind === 'VOTE' ? `${count}枚を捨てて${count}票` : choice.kind === 'DRAW' ? choice.amount === -1 ? `${count}枚を番号順に戻す · ①が山札の上` : `${count}枚を手札へ` : choice.kind === 'RECOVER' ? `${count}枚を捨て札から手札へ` : choice.kind === 'ORDER' ? `${count}件を盤面の番号順に解決` : undefined
  if (count && aggregate) return <div className="choice-outcome" aria-live="polite"><p>{aggregate}</p></div>
  return <div className="choice-outcome" aria-live="polite">{selected.length ? selected.map((id, index) => <p key={id}>{selected.length > 1 && <b>{index + 1}. </b>}{view.options[id]}</p>) : view.skip && choice.min === 0 ? <p>{view.skip}</p> : null}</div>
}

type DefenseProps = { choice: PendingChoice; game: GameState; selection: ReturnType<typeof useChoiceSelection>; connected: boolean; error?: string }

export function DefenseContext({ choice, game, selection, connected, error }: DefenseProps) {
  return <div className="defense-context">
    <div className="defense-source"><EffectSource card={choice.sourceCard} owner={game.players.find(p => p.id === choice.sourceId)?.name} summary={choice.presentation?.summary ?? choice.title} rank={choice.presentation?.sourceRank} /></div>
    <div className="defense-actions"><button className="defense-use" disabled={!selection.enabled || selection.selected.length !== 1} onClick={selection.submit}>発動する</button><button className="defense-skip" disabled={!selection.enabled || choice.min > 0} onClick={selection.skip}>使用しない</button></div>
    <p className="defense-skip-result">使用しない：{choice.presentation?.skip ?? '設置カードを温存して進む'}</p>
    {!connected && <p role="status">再接続中</p>}{error && <p role="alert">{error}</p>}
  </div>
}

export function DefenseCards({ choice, selection }: DefenseProps) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    row.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [choice.id])
  return <div ref={row} className="defense-card-row" role="group" aria-label="発動する設置防御" onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const buttons = Array.from(row.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }}>
    {choice.options.map((option, index) => <button key={option.id} className={`defense-choice-card ${selection.selected.includes(option.id) ? 'is-selected' : ''}`} style={{ '--defense-delay': `${index * 70}ms` } as CSSProperties} aria-pressed={selection.selected.includes(option.id)} aria-label={`${option.label}：${choice.presentation?.options[option.id] ?? ''}`} disabled={!selection.enabled} onClick={() => selection.toggle(option.id)}>
      {option.card && <span className="defense-card-face"><CardFace instance={option.card} defense /></span>}<strong>{option.label}</strong><small>{choice.presentation?.options[option.id] ?? (option.card ? cardOf(option.card).description : '')}</small>
    </button>)}
  </div>
}

export function PendingSelection({ choice, game, selfId, connected, selection, error = '' }: { choice: PendingChoice; game: GameState; selfId: string; connected: boolean; selection: ReturnType<typeof useChoiceSelection>; error?: string }) {
  const { selected, targetId, enabled, valid, submit, skip } = selection
  const own = choice.playerId === selfId
  const hand = isHandChoice(choice)
  return <section className={`table-decision choice-panel ${hand ? 'hand-choice-panel' : ''} ${!own ? 'choice-waiting' : ''}`} role="region" aria-label={own ? choice.title : '選択待ち'}>
    <EffectSource card={choice.sourceCard} owner={game.players.find(p => p.id === choice.sourceId)?.name} summary={own ? choice.presentation?.summary ?? choice.title : `${game.players.find(p => p.id === choice.playerId)?.name}が選択中です`} />
    {own && <div className="decision-result"><p id={hand ? 'hand-choice-instructions' : undefined} className="selection-count" aria-live="polite">{isPlayerChoice(choice) ? '対象' : choice.kind === 'ORDER' ? '処理順' : '選択'} {selected.length} / {choice.max}{isPlayerChoice(choice) ? '人' : choice.kind === 'ORDER' ? '件' : '枚'}{choice.min > 0 && choice.min !== choice.max ? `（最低${choice.min}枚）` : ''}{choice.kind === 'VOTE' && <span> · 投票先：{game.players.find(p => p.id === targetId)?.name ?? '未選択'}</span>}</p>{choice.kind !== 'DEMAND' && (!selected.length || ['TRADE', 'VOTE', 'DRAW', 'RECOVER', 'ORDER'].includes(choice.kind)) && <p className="decision-summary">{choice.presentation?.summary ?? choice.title}</p>}<ChoiceOutcome choice={choice} selected={selected} /></div>}
    <div className="decision-actions">{own && <><button className="primary" disabled={!valid} onClick={submit}>{selected.length || choice.min > 0 ? choice.kind === 'DEMAND' ? '選んだカードを渡す' : '選択を確定' : choice.presentation?.skipLabel ?? '使わずに進める'}</button>{choice.min === 0 && selected.length > 0 && <button className="secondary" disabled={!enabled} onClick={skip}>{choice.presentation?.skipLabel ?? '使わずに進める'}</button>}</>}{!connected && <p role="status">再接続中</p>}{error && <p role="alert">{error}</p>}</div>
  </section>
}

type PlayMessage = Extract<ClientMessage, { type: 'PLAY_CARD' }>
export function ConfigureCard({ message, game, selfId, enabled, onChange, onConfirm, onCancel }: { message: PlayMessage; game: GameState; selfId: string; enabled: boolean; onChange: (m: PlayMessage) => void; onConfirm: (m: PlayMessage) => void; onCancel: () => void }) {
  const self = game.players.find(p => p.id === selfId)!
  const instance = self.hand.find(c => c.uid === message.cardUid)!
  const card = cardOf(instance)
  const amount = message.amount ?? 1, second = message.secondTargetId, double = message.double ?? false
  const mode = message.mode ?? (card.id === 'cakeWine' ? 'CAKE' : 'DAMAGE')
  const distribution = message.distribution ?? {}
  const allocated = Object.values(distribution).reduce((a, b) => a + b, 0)
  const hpCost = card.id === 'scales' || card.id === 'rain'
  const names = (id?: string) => game.players.find(p => p.id === id)?.name ?? '未選択'
  return <section className="table-decision choice-panel" role="region" aria-label={card.name}>
    <EffectSource card={instance} owner={self.name} summary={card.description} rank={cardAttackDisplay(game, self, instance, message.targetId, amount, mode)?.rank} />
    <div className="decision-result">
      {card.id === 'doubleEdge' && <div className="number-choices" role="group" aria-label="通常ダメージの基礎値">{[1, 2, 3, 4, 5].map(n => <button key={n} aria-pressed={amount === n} disabled={!enabled} onClick={() => onChange({ ...message, amount: n })}>{n}</button>)}</div>}
      {['cakeWine', 'affection'].includes(card.id) && <div className="number-choices" role="group" aria-label="効果モード">{(card.id === 'cakeWine' ? ['CAKE', 'WINE'] : ['DAMAGE', 'BOTH']).map(value => <button key={value} aria-pressed={mode === value} disabled={!enabled} onClick={() => onChange({ ...message, mode: value as PlayMessage['mode'] })}>{value === 'CAKE' ? 'ケーキ' : value === 'WINE' ? 'ワイン' : value === 'DAMAGE' ? '自分のHP→ダメージ' : '双方HP1'}</button>)}</div>}
      {hpCost && <div className="number-choices" role="group" aria-label="HP減少量"><button disabled={!enabled || amount <= 0} aria-label="HP減少量を減らす" onClick={() => onChange({ ...message, amount: amount - 1 })}>−</button><strong>HP −{amount}</strong><button disabled={!enabled || amount >= self.hp} aria-label="HP減少量を増やす" onClick={() => onChange({ ...message, amount: amount + 1 })}>＋</button></div>}
      {card.id === 'rain' && <div className="damage-allocation" role="group" aria-label="ダメージ分配">{game.players.filter(p => p.id !== selfId && canTarget(game, selfId, p.id)).map(p => <div key={p.id}><span>{p.name}</span><button aria-label={`${p.name}への分配を減らす`} disabled={!enabled || !(distribution[p.id] > 0)} onClick={() => onChange({ ...message, distribution: { ...distribution, [p.id]: distribution[p.id] - 1 } })}>−</button><b>{distribution[p.id] ?? 0}</b><button aria-label={`${p.name}への分配を増やす`} disabled={!enabled || allocated >= amount} onClick={() => onChange({ ...message, distribution: { ...distribution, [p.id]: (distribution[p.id] ?? 0) + 1 } })}>＋</button></div>)}</div>}
      {card.kind === 'STATEMENT' && self.role.state === 'REVEALED' && self.role.card?.cardId === 'citizen' && !self.abilityUsed && <div className="number-choices" role="group" aria-label="市民の能力">{[false, true].map(value => <button key={String(value)} aria-pressed={double === value} disabled={!enabled} onClick={() => onChange({ ...message, double: value })}>{value ? '2回 · 能力を使用' : '1回'}</button>)}</div>}
      <p className="configure-result" aria-live="polite">{card.id === 'rain' ? `分配 ${allocated} / ${amount}` : card.id === 'scales' ? `HP ${self.hp} → ${self.hp - amount} · 次の開始時に${amount * 2}回復` : card.id === 'cakeWine' ? `${names(message.targetId)} · ${mode === 'CAKE' ? 'HP3回復' : 'HP7まで回復'}` : card.id === 'affection' ? mode === 'BOTH' ? '自分・対象のHPを1にする' : `自分HP1 · 基礎ダメージ${Math.max(0, self.hp - 1)}` : card.id === 'doubleEdge' ? `${names(message.targetId)}・自分へ基礎値${amount}の通常ダメージ（補正・防御を適用）` : card.id === 'roleSwap' ? `① ${names(message.targetId)} · ② ${names(second)}\n${double ? '2回交換で元に戻る · 市民の能力を消費' : '伏せ／CO状態ごと交換 · CO能力の再発動なし'}` : double ? '発言効果を2回解決 · 市民の能力を消費' : '発言効果を1回解決'}</p>
    </div>
    <div className="decision-actions"><button className="primary" disabled={!enabled || card.id === 'roleSwap' && !second || hpCost && amount > self.hp || card.id === 'rain' && allocated !== amount} onClick={() => onConfirm({ ...message, amount, double, ...(['cakeWine', 'affection'].includes(card.id) ? { mode } : {}), ...(card.id === 'rain' ? { distribution } : {}) })}>確定して使用</button><button className="secondary" onClick={onCancel}>キャンセル</button></div>
  </section>
}

export type RoleTargetAction = { card: CardInstance; message: Extract<ClientMessage, { type: 'PLAY_CARD' | 'REVEAL_ROLE' | 'ROLE_ABILITY' }> }
export function RoleTargetPanel({ action, game, enabled, onConfirm, onCancel }: { action: RoleTargetAction; game: GameState; enabled: boolean; onConfirm: () => void; onCancel: () => void }) {
  const target = game.players.find(p => p.id === action.message.targetId)
  const ability = action.message.type === 'ROLE_ABILITY'
  return <section className="table-decision choice-panel" role="region" aria-label={ability ? '手札を確認する対象' : '強制開示の対象'}><EffectSource card={action.card} summary={ability ? '手札をすべて見る · ゲーム中1度' : 'COして、選んだ相手の役職を強制開示'} /><p className="decision-result" aria-live="polite">{target ? `${target.name}の${ability ? '手札を確認する' : '役職を強制開示する'}` : '対象：未選択'}</p><div className="decision-actions"><button className="primary" disabled={!enabled || !target || target.status !== 'ALIVE'} onClick={onConfirm}>選択を確定</button><button className="secondary" onClick={onCancel}>キャンセル</button></div></section>
}

export function RoleActions({ game, selfId, cardUid, enabled, send, onTarget }: { game: GameState; selfId: string; cardUid?: string; enabled: boolean; send: (m: ClientMessage) => void; onTarget: (a: RoleTargetAction) => void }) {
  const self = game.players.find(p => p.id === selfId)!
  const card = cardUid ? self.hand.find(c => c.uid === cardUid) : self.role.card
  if (!card) return null
  if (cardUid && self.role.state === 'REVEALED') return <button className="popover-action" disabled={!enabled} onClick={() => send({ type: 'PLAY_CARD', cardUid, choice: 'RETURN_ROLE' })}>山札の一番下へ戻す</button>
  const seer = card.cardId === 'seer'
  const ability = !cardUid && self.role.state === 'REVEALED' && seer && !self.abilityUsed
  if (!cardUid && !ability) return null
  const message: RoleTargetAction['message'] = ability ? { type: 'ROLE_ABILITY', targetId: '' } : { type: 'PLAY_CARD', cardUid: cardUid!, choice: 'REVEAL_ROLE' }
  return <button className="popover-action" disabled={!enabled} onClick={() => seer ? onTarget({ card, message }) : send(message)}>{ability ? '手札を見る（1度だけ）' : '公開して置く（CO）'}</button>
}

