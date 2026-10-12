import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cardOf } from './game/cards'
import { cardAttackDisplay } from './game/card-display'
import type { CardInstance, GameState, Player } from './game/types'
import type { ClientMessage, RoomView } from './network/protocol'
import { fanPosition, tableSeats } from './battle-layout'
import { resolveDrop, sourceCard } from './battle-interaction'
import type { CardSource, DropTarget } from './battle-interaction'
import { useCardDrag } from './useCardDrag'
import CardPopover from './CardPopover'
import { ConfigureCard, DefenseCards, DefenseContext, isHandChoice, isPlayerChoice, PendingSelection, RoleActions, RoleTargetPanel, useChoiceSelection } from './GameChoices'
import type { RoleTargetAction } from './GameChoices'
import { CardSpread, fieldEntries, InstalledCards } from './TableCards'
import { canTarget } from './game/v03-rules'
import type { FieldEntry } from './TableCards'
import CardFace, { CardMark } from './CardFace'
import './battle.css'
import './battle-interaction.css'
import './table-selection.css'
import './fixed-table.css'

type BoardProps = { room: RoomView; send: (message: ClientMessage) => void; error: string; connected: boolean }
type Inspection = { playerId: string; zone: 'role' | 'discard' } | null
type PopupContent = { kind: 'hand'; uid: string } | { kind: 'role' | 'discard'; playerId: string } | { kind: 'installed'; playerId: string; entryId: string } | { kind: 'spread'; card: CardInstance }
type PopupState = { content: PopupContent; anchor: HTMLElement; pinned: boolean }
function CardBack() {
  return <span className="card-back" aria-hidden="true"><span><CardMark /></span></span>
}

function PlayerBadge({ player, active, self, parent, connected, cpu = false, targetable = false, targeted = false, onTarget }: {
  player: Player; active: boolean; self?: boolean; parent: boolean; connected: boolean;
  cpu?: boolean; targetable?: boolean; targeted?: boolean; onTarget?: () => void
}) {
  return <button className={`seat-badge ${active ? 'is-active' : ''} ${targetable ? 'is-targetable' : ''} ${targeted ? 'is-targeted' : ''}`}
    disabled={!targetable} onClick={onTarget} aria-label={targetable ? `${player.name}を対象に選ぶ、HP ${player.hp}` : `${player.name}${self ? '（あなた）' : ''}、HP ${player.hp}${active ? '、行動中' : ''}`}
    aria-pressed={targetable ? targeted : undefined}>
    <span className="seat-avatar">{player.name.slice(0, 1)}</span>
    <span className="seat-name"><strong>{player.name}{self && <small>あなた</small>}</strong><span>{parent && <b>親</b>}{player.status === 'DEAD' ? '死亡' : !connected ? '再接続中' : targeted ? '選択中' : active ? cpu ? '思考中' : '行動中' : '待機中'}</span></span>
    <span className="seat-life" data-hp><b>{player.hp}</b><small>/ {player.maxHp}</small><span className="life-track"><i style={{ width: `${player.hp / player.maxHp * 100}%` }} /></span></span>
  </button>
}

function FieldCards({ player, self = false, events, children, roleTarget = false, roleLocked = false, game, installedEvents, order, hideInstalled = false, discardSource = false, roleNumber }: {
  player: Player; self?: boolean; events: (zone: 'role' | 'discard') => ButtonHTMLAttributes<HTMLButtonElement>;
  children?: ReactNode; roleTarget?: boolean; roleLocked?: boolean; roleNumber?: number
  game: GameState; installedEvents: (entry: FieldEntry) => ButtonHTMLAttributes<HTMLButtonElement>; hideInstalled?: boolean; discardSource?: boolean
  order?: { options: string[]; selected: string[]; enabled: boolean; toggle: (id: string) => void }
}) {
  const visibleRole = player.role.card && (self || player.role.state === 'REVEALED') ? player.role.card : null
  const lastDiscard = player.discard.at(-1)
  return <><div className="field-cards">
    <div className={`field-zone role-zone ${roleTarget ? 'drop-valid' : ''} ${roleLocked ? 'drop-locked' : ''}`}><button className={`field-card ${player.role.state === 'EMPTY' ? 'empty-slot' : ''}`} data-role data-drop-player={player.id} data-drop-zone="role"
      {...events('role')} aria-label={`${player.name}の役職：${visibleRole ? cardOf(visibleRole).name : player.role.state === 'FACE_DOWN' ? '伏せ役職' : '未設置'}`}>
      {visibleRole ? <CardFace instance={visibleRole} /> : player.role.state === 'FACE_DOWN' ? <CardBack /> : <span className="slot-symbol">◈</span>}
    </button>{roleNumber && <b className="choice-number">{roleNumber}</b>}<span className="field-label">{player.role.state === 'REVEALED' ? 'CO' : player.role.state === 'FACE_DOWN' ? self ? '自分だけ' : '伏せ役職' : '役職'}</span></div>
    {children}
    <div className={`field-zone discard-zone ${discardSource ? 'is-choice-source' : ''}`}><button className={`field-card ${lastDiscard ? 'discard-stack' : 'empty-slot'}`} data-discard
      {...events('discard')} aria-label={`${player.name}の捨て札 ${player.discard.length}枚を確認`}>
      {lastDiscard ? <CardFace instance={lastDiscard} /> : <span className="slot-symbol">—</span>}
    </button><span className="field-label">捨て札 <b>{player.discard.length}</b></span></div>
  </div><InstalledCards player={player} game={game} events={installedEvents} order={order} hidden={hideInstalled} /></>
}

function OpponentHand({ count }: { count: number }) {
  return <div className="opponent-hand" role="img" aria-label={`裏向きの手札 ${count}枚`}>
    {Array.from({ length: count }, (_, index) => {
      const offset = index - (count - 1) / 2
      return <span className="opponent-card" key={index} style={{ '--back-x': `${offset * Math.min(21, 85 / Math.max(1, count - 1))}px`, '--back-y': `${Math.abs(offset) * 3}px`, '--back-angle': `${offset * Math.min(11, 42 / Math.max(1, count - 1))}deg`, '--deal-delay': `${index * 90}ms` } as CSSProperties}><CardBack /></span>
    })}
    <span className="hand-count">手札 {count}</span>
  </div>
}

function handKeys(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return
  const cards = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.hand-card'))
  const index = cards.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0 || event.key === 'Escape') return
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + cards.length) % cards.length
  cards[next]?.focus()
}

export default function GameBoard({ room, send, error, connected }: BoardProps) {
  const game = room.game!
  const player = game.players.find((item) => item.id === room.selfId)!
  const current = game.players[game.currentPlayerIndex]
  const choice = game.pendingChoice
  const handChoice = choice?.playerId === player.id && isHandChoice(choice)
  const defenseChoice = choice?.playerId === player.id && choice.kind === 'DEFENSE'
  const selection = useChoiceSelection(choice, player.id, connected, error, send)
  const canAct = connected && current.id === player.id && player.status === 'ALIVE' && !game.winnerId && !game.draw && !game.pendingChoice
  const [configuration, setConfiguration] = useState<Extract<ClientMessage, { type: 'PLAY_CARD' }> | null>(null)
  const [roleTarget, setRoleTarget] = useState<RoleTargetAction | null>(null)
  const [aim, setAim] = useState<CardSource | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [inspection, setInspection] = useState<Inspection>(null)
  const [pending, setPending] = useState(false)
  const configuring = Boolean(configuration || roleTarget)
  const ownChoice = choice?.playerId === player.id
  const order = ownChoice && choice?.kind === 'ORDER' ? { options: choice.options.map(o => o.id), selected: selection.selected, enabled: selection.enabled, toggle: selection.toggle } : undefined
  const pendingRef = useRef(false)
  const pendingSnapshot = useRef(game)
  const hoverTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)
  const stage = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const previous = useRef(game)
  useLayoutEffect(() => {
    const fit = () => {
      const box = viewport.current?.getBoundingClientRect()
      if (box?.width && box.height) viewport.current!.style.setProperty('--table-scale', String(Math.min(box.width / 1400, box.height / 900)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    if (viewport.current) observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [])
  const clearTimers = () => { window.clearTimeout(hoverTimer.current); window.clearTimeout(closeTimer.current) }
  const closePopup = () => { clearTimers(); setPopup(null) }
  const act = (message: ClientMessage) => {
    if (!canAct || pendingRef.current) return
    pendingRef.current = true
    pendingSnapshot.current = game
    setPending(true)
    setAim(null)
    setConfiguration(null)
    setRoleTarget(null)
    setInspection(null)
    closePopup()
    send(message)
  }
  const commit = (source: CardSource, target: DropTarget) => {
    const message = resolveDrop(game, player.id, source, target, connected)
    if (message?.type === 'PLAY_CARD') {
      const card = cardOf(player.hand.find(c => c.uid === message.cardUid)!)
      if (['doubleEdge', 'roleSwap', 'cakeWine', 'affection', 'scales', 'rain'].includes(card.id) || card.kind === 'STATEMENT' && player.role.card?.cardId === 'citizen' && player.role.state === 'REVEALED' && !player.abilityUsed) {
        setConfiguration(message); closePopup(); setAim(null); return
      }
    }
    if (message) act(message)
  }
  const dragging = useCardDrag({
    enabled: Boolean(canAct && !pending && !configuring), epoch: game.turnNumber,
    validTarget: (source, target) => Boolean(resolveDrop(game, player.id, source, target, connected)),
    commit, onStart: () => { closePopup(); setAim(null) },
  })
  const source = dragging.drag?.source ?? aim
  const heldCard = source ? sourceCard(game, player.id, source) : undefined
  const canDrop = (target: DropTarget) => Boolean(source && !pending && resolveDrop(game, player.id, source, target, connected))
  const target = dragging.drag?.target
  const isConnected = (id: string) => room.players.find((member) => member.id === id)?.connected ?? false
  const seats = tableSeats(game.players, player.id)
  const winner = game.winnerIds?.length ? { name: game.players.filter(p => game.winnerIds!.includes(p.id)).map(p => p.name).join('・') } : game.players.find((item) => item.id === game.winnerId)

  useEffect(() => {
    if (game !== pendingSnapshot.current || error || !connected) {
      pendingRef.current = false
      setPending(false)
    }
  }, [game, error, connected])
  useEffect(() => { setAim(null); setConfiguration(null); setRoleTarget(null); setInspection(null); closePopup() }, [game.turnNumber, connected, game.pendingChoice?.id])
  useEffect(() => {
    if (handChoice) stage.current?.querySelector<HTMLButtonElement>('[data-choice-eligible="true"]')?.focus()
  }, [choice?.id, handChoice, connected])
  useEffect(() => {
    if (ownChoice && isPlayerChoice(choice) || configuring) stage.current?.querySelector<HTMLButtonElement>('.is-choice-target .seat-badge:not(:disabled), .self-field.is-choice-target .seat-badge:not(:disabled)')?.focus({ preventScroll: true })
  }, [choice?.id, configuration?.cardUid, roleTarget?.card.uid])
  useEffect(() => {
    if (aim && (!canAct || !sourceCard(game, player.id, aim))) setAim(null)
    if (dragging.drag && !sourceCard(game, player.id, dragging.drag.source)) dragging.cancel()
    if (popup?.content.kind === 'hand' && !player.hand.some((card) => card.uid === (popup.content as { uid: string }).uid)) closePopup()
    if (configuration && !player.hand.some(c => c.uid === configuration.cardUid)) setConfiguration(null)
    if (roleTarget && (roleTarget.message.type === 'PLAY_CARD' ? !player.hand.some(c => c.uid === roleTarget.card.uid) : player.role.card?.uid !== roleTarget.card.uid)) setRoleTarget(null)
  }, [game])
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setAim(null); setConfiguration(null); setRoleTarget(null); setInspection(null); closePopup() } }
    window.addEventListener('keydown', escape)
    return () => { clearTimers(); window.removeEventListener('keydown', escape) }
  }, [])
  useEffect(() => {
    if (aim) stage.current?.querySelector<HTMLButtonElement>('.drop-valid button, button.is-targetable')?.focus()
  }, [aim])
  useLayoutEffect(() => {
    const animations: Animation[] = []
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      game.players.forEach((item) => {
        const before = previous.current.players.find((p) => p.id === item.id)
        const seat = stage.current?.querySelector(`[data-player-id="${item.id}"]`)
        if (!before || !seat) return
        const animate = (selector: string, frames: Keyframe[], duration: number) => {
          const element = seat.querySelector(selector)
          if (element) animations.push(element.animate(frames, { duration, easing: 'cubic-bezier(.2,.7,.2,1)' }))
        }
        if (item.hp < before.hp) animate('.seat-badge', [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)', background: '#683c32' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], 350)
        if (item.role.state !== before.role.state || item.role.card?.uid !== before.role.card?.uid) animate('[data-role]', [{ transform: 'perspective(500px) rotateY(-90deg)', opacity: .3 }, { transform: 'perspective(500px) rotateY(0deg)', opacity: 1 }], 420)
        if (item.discard.length > before.discard.length) animate('[data-discard] .paper-card', [{ transform: 'translateY(-38px) rotate(-14deg)', opacity: .2 }, { transform: 'translateY(2px) rotate(2deg)', opacity: 1 }, { transform: 'none' }], 450)
      })
    }
    previous.current = game
    return () => animations.forEach((animation) => animation.cancel())
  }, [game])

  const schedulePopup = (content: PopupContent, anchor: HTMLElement) => {
    if (source || popup?.pinned) return
    clearTimers()
    hoverTimer.current = window.setTimeout(() => setPopup({ content, anchor, pinned: false }), 550)
  }
  const leavePopup = () => {
    window.clearTimeout(hoverTimer.current)
    if (!popup?.pinned) closeTimer.current = window.setTimeout(() => setPopup(null), 180)
  }
  const hoverEvents = (content: PopupContent): ButtonHTMLAttributes<HTMLButtonElement> => ({
    onPointerEnter: (event) => { if (event.pointerType !== 'touch') schedulePopup(content, event.currentTarget) },
    onPointerLeave: leavePopup,
    onFocus: (event) => { if (!game.pendingChoice && !configuring) schedulePopup(content, event.currentTarget) },
    onBlur: (event) => { if (!(event.relatedTarget as Element | null)?.closest('.card-popover')) leavePopup() },
    'aria-haspopup': 'dialog',
  })
  const showPopup = (content: PopupContent, anchor: HTMLElement) => {
    clearTimers()
    setAim(null)
    setPopup({ content, anchor, pinned: true })
  }
  const canChoosePlayer = (owner: Player) => {
    if (owner.status !== 'ALIVE' || !canTarget(game, player.id, owner.id)) return false
    if (ownChoice && selection.enabled) return isPlayerChoice(choice) ? choice!.options.some(o => o.id === owner.id) : choice?.kind === 'VOTE'
    if (!canAct || pending) return false
    return roleTarget ? true : configuration && player.hand.find(c => c.uid === configuration.cardUid)?.cardId === 'roleSwap' ? owner.id !== configuration.targetId : false
  }
  const selectedPlayer = (id: string) => ownChoice ? choice?.kind === 'VOTE' ? selection.targetId === id : isPlayerChoice(choice) && selection.selected.includes(id) : roleTarget?.message.targetId === id || configuration?.secondTargetId === id || configuration?.targetId === id
  const choosePlayer = (owner: Player) => {
    if (!canChoosePlayer(owner)) return
    closePopup(); setInspection(null)
    if (ownChoice) choice?.kind === 'VOTE' ? selection.setTargetId(owner.id) : selection.toggle(owner.id)
    else if (roleTarget) setRoleTarget({ ...roleTarget, message: { ...roleTarget.message, targetId: owner.id } })
    else if (configuration) setConfiguration({ ...configuration, secondTargetId: owner.id })
  }
  const roleNumber = (id: string) => configuration && player.hand.find(c => c.uid === configuration.cardUid)?.cardId === 'roleSwap' ? configuration.targetId === id ? 1 : configuration.secondTargetId === id ? 2 : undefined : undefined
  const startRoleTarget = (action: RoleTargetAction) => { if (canAct && !pending) { closePopup(); setAim(null); setInspection(null); setRoleTarget(action) } }
  const installedEvents = (owner: Player, entry: FieldEntry): ButtonHTMLAttributes<HTMLButtonElement> => {
    const content: PopupContent = { kind: 'installed', playerId: owner.id, entryId: entry.id }
    return { ...hoverEvents(content), onClick: e => showPopup(content, e.currentTarget) }
  }
  const spreadEvents = (card?: CardInstance): ButtonHTMLAttributes<HTMLButtonElement> => {
    if (!card) return {}
    const content: PopupContent = { kind: 'spread', card }
    return { ...hoverEvents(content), onClick: e => showPopup(content, e.currentTarget) }
  }
  const fieldEvents = (owner: Player, zone: 'role' | 'discard'): ButtonHTMLAttributes<HTMLButtonElement> => {
    const content: PopupContent = { kind: zone, playerId: owner.id }
    const seer = owner.id === player.id && zone === 'role' && owner.role.state === 'FACE_DOWN' && owner.role.card && cardOf(owner.role.card).roleEffect === 'SEER'
    return {
      ...hoverEvents(content),
      ...(seer ? dragging.bindings({ kind: 'role', uid: owner.role.card!.uid }) : {}),
      onClick: (event) => {
        if (dragging.consumeClick(event.currentTarget)) return
        if (zone === 'role' && canChoosePlayer(owner)) return choosePlayer(owner)
        const drop: DropTarget = { playerId: owner.id, zone: zone === 'role' ? 'role' : 'player' }
        if (aim && canDrop(drop)) return commit(aim, drop)
        if (zone === 'discard') { closePopup(); setInspection({ playerId: owner.id, zone }); return }
        showPopup(content, event.currentTarget)
      },
    }
  }
  const beginAim = (next: CardSource) => { closePopup(); setAim(next) }
  const popupPlayerId = popup && 'playerId' in popup.content ? popup.content.playerId : undefined
  const popupOwner = game.players.find((p) => p.id === popupPlayerId)
  const popupEntry = popup?.content.kind === 'installed' && popupOwner ? fieldEntries(popupOwner, game).find(e => e.id === (popup.content as { entryId: string }).entryId) : undefined
  const popupCard = popup?.content.kind === 'hand' ? player.hand.find((card) => card.uid === (popup.content as { uid: string }).uid)
    : popup?.content.kind === 'spread' ? popup.content.card
    : popup?.content.kind === 'installed' ? popupEntry?.card
    : popup?.content.kind === 'discard' ? popupOwner?.discard.at(-1)
    : popupOwner?.role.card && (popupOwner.id === player.id || popupOwner.role.state === 'REVEALED') ? popupOwner.role.card : undefined
  const popupDefinition = popupCard ? cardOf(popupCard) : null
  const popupTitle = popupEntry?.label ?? popupDefinition?.name ?? (popup?.content.kind === 'role' ? popupOwner?.role.state === 'FACE_DOWN' ? '伏せ役職' : '役職なし' : '捨て札なし')
  const popupAttack = popup?.content.kind === 'hand' && popupCard ? cardAttackDisplay(game, player, popupCard, configuration?.targetId, configuration?.amount, configuration?.mode) : undefined
  const popupDescription = popupEntry ? `${popupEntry.description}${popupEntry.active ? '' : ' 現在は無効です。'}` : `${popupDefinition?.description ?? (popupOwner?.role.state === 'FACE_DOWN' && popup?.content.kind === 'role' ? 'この役職は伏せられています。' : 'カードはまだ置かれていません。')}${popupAttack ? ` 現在：${popupAttack.description}` : ''}`
  const selfDrop = canDrop({ playerId: player.id, zone: 'player' })
  const roleDrop = canDrop({ playerId: player.id, zone: 'role' })
  const cardChoice = ownChoice && Boolean(choice && (['DRAW', 'RECOVER', 'CROW_ORDER', 'SCISSORS'].includes(choice.kind) || choice.kind === 'INTERRUPT' && choice.stage === 'FIELD'))
  const discardSource = cardChoice && choice?.kind === 'RECOVER' ? choice.targetId : inspection?.playerId
  const inspectedPlayer = game.players.find(p => p.id === inspection?.playerId)
  const hasInstalled = game.players.some(p => fieldEntries(p, game).length > 0)

  return <section className={`battle-layout ${game.time.toLowerCase()} page-enter ${choice || configuring ? 'has-decision' : ''}`}>
    <header className="battle-heading"><div className="table-title"><span className="table-icon">◈</span><h1>ライトウルフ <small>THE TABLE</small></h1></div><div className="battle-meta"><span>{game.mode === 'TEST' ? '1人用テスト' : room.players.some(member => member.isCpu) ? `CPU対戦 · ${game.players.length}人` : `${game.players.length}人対戦`}</span><span>ROOM <b>{room.code}</b></span></div></header>
    <div className="table-viewport" ref={viewport}>
    <div className={`table-stage ${source ? 'is-aiming' : ''} ${defenseChoice ? 'is-defending' : ''} ${hasInstalled ? 'has-installed' : ''} ${cardChoice || inspection ? 'has-card-spread' : ''} ${ownChoice && (isPlayerChoice(choice) || choice?.kind === 'VOTE') || configuring ? 'is-choosing-player' : ''}`} ref={stage} data-player-count={game.players.length}>
      {choice && !defenseChoice && <PendingSelection key={`${choice.id}-${error}`} choice={choice} game={game} selfId={player.id} connected={connected} error={error} selection={selection} />}
      {configuration && player.hand.some(c => c.uid === configuration.cardUid) && <ConfigureCard message={configuration} game={game} selfId={player.id} enabled={canAct && !pending} onChange={setConfiguration} onCancel={() => setConfiguration(null)} onConfirm={act} />}
      {roleTarget && <RoleTargetPanel action={roleTarget} game={game} enabled={canAct && !pending} onCancel={() => setRoleTarget(null)} onConfirm={() => act(roleTarget.message)} />}
      <div className="table-surface" aria-hidden="true"><div className="table-stitch" /></div>
      <div className="table-phase" key={`${game.phase}-${game.time}`}><span className={`phase-orb ${game.time.toLowerCase()}`}>{game.time === 'DAY' ? '☀' : '☾'}</span><span>{game.time === 'DAY' ? '昼' : '夜'}<small>PHASE {String(game.phase).padStart(2, '0')} · 切替まで{game.phase % 2 ? 2 : 1}フェーズ{game.extraTurn && ' · 追加ターン'}</small></span></div>
      <div className="table-tools">
        <button className="end-turn" disabled={!canAct || pending || configuring || Boolean(dragging.drag)} onClick={() => act({ type: 'END_TURN' })}>ターン終了 <span>→</span></button>
        <details className="table-log"><summary>履歴 <span>{game.log.length}</span></summary><div className="log-entries">{game.log.map((entry) => <p key={entry.id}>{entry.visibility === 'PRIVATE' && <small>自分だけ</small>}{entry.message}</p>)}</div></details>
      </div>
      {seats.map(({ player: other, x, y, angle }) => {
        const eligible = canDrop({ playerId: other.id, zone: 'player' })
        const locked = target?.playerId === other.id
        const selectable = canChoosePlayer(other), picked = selectedPlayer(other.id)
        return <article key={other.id} data-player-id={other.id} data-drop-player={other.id} aria-label={`${other.name}の席`} className={`table-seat ${other.status === 'DEAD' ? 'is-dead' : ''} ${eligible ? 'drop-valid' : ''} ${locked ? 'drop-locked' : ''} ${selectable ? 'is-choice-target' : ''} ${picked ? 'is-choice-selected' : ''}`} style={{ left: `${x}%`, top: `${y}%`, '--seat-angle': `${angle}deg` } as CSSProperties}>
          <PlayerBadge player={other} active={other.id === current.id} parent={other.id === game.players[game.parentIndex].id} connected={isConnected(other.id)} cpu={room.players.find(member => member.id === other.id)?.isCpu} targetable={eligible || selectable} targeted={locked || picked} onTarget={() => { if (selectable) choosePlayer(other); else if (aim) commit(aim, { playerId: other.id, zone: 'player' }) }} />
          <div className="seat-cards"><OpponentHand count={other.handCount ?? other.hand.length} /><FieldCards player={other} game={game} events={(zone) => fieldEvents(other, zone)} installedEvents={entry => installedEvents(other, entry)} order={order} roleTarget={selectable} roleLocked={picked} roleNumber={roleNumber(other.id)} discardSource={discardSource === other.id} /></div>
          {(locked || picked) && <div className="lock-on" aria-hidden="true"><i /></div>}
        </article>
      })}
      <div className="table-center"><div className={`deck-pile ${cardChoice && choice?.kind === 'DRAW' ? 'is-choice-source' : ''} ${canDrop({ playerId: player.id, zone: 'deck' }) ? 'drop-valid' : ''}`} data-drop-player={player.id} data-drop-zone="deck" aria-label={canDrop({ playerId: player.id, zone: 'deck' }) ? '山札の一番下へ戻す' : '山札'} onClick={() => { if (aim) commit(aim, { playerId: player.id, zone: 'deck' }) }}><CardBack /></div>{defenseChoice && choice ? <DefenseContext choice={choice} game={game} selection={selection} connected={connected} error={error} /> : <div className="center-turn" key={game.turnNumber} role="status"><small>{winner || game.draw ? 'MATCH COMPLETE' : !connected ? 'CONNECTING' : canAct ? 'YOUR TURN' : 'TURN ' + String(game.turnNumber).padStart(2, '0')}</small><strong>{winner ? `${winner.name} の勝利` : game.draw ? '引き分け' : !connected ? '再接続中' : canAct ? 'あなたのターン' : `${current.name} のターン`}</strong></div>}</div>
      <div className={`self-seat ${player.status === 'DEAD' ? 'is-dead' : ''}`} data-player-id={player.id}>
        <div className={`self-field ${selfDrop ? 'drop-valid' : ''} ${target?.playerId === player.id ? 'drop-locked' : ''} ${canChoosePlayer(player) ? 'is-choice-target' : ''} ${selectedPlayer(player.id) ? 'is-choice-selected' : ''}`} data-drop-player={player.id}>
          <FieldCards player={player} self game={game} events={(zone) => fieldEvents(player, zone)} installedEvents={entry => installedEvents(player, entry)} order={order} hideInstalled={defenseChoice} discardSource={discardSource === player.id} roleTarget={roleDrop || canChoosePlayer(player)} roleLocked={target?.playerId === player.id && target.zone === 'role' || selectedPlayer(player.id)} roleNumber={roleNumber(player.id)}>
            <div className="self-status"><PlayerBadge player={player} self active={player.id === current.id} parent={player.id === game.players[game.parentIndex].id} connected={connected} targetable={selfDrop || canChoosePlayer(player)} targeted={Boolean(target?.playerId === player.id && selfDrop || selectedPlayer(player.id))} onTarget={() => { if (canChoosePlayer(player)) choosePlayer(player); else if (aim) commit(aim, { playerId: player.id, zone: 'player' }) }} /><span className="self-hand-count">手札 <b>{player.hand.length}</b><small> / 上限 {player.handLimit}</small></span></div>
          </FieldCards>
        </div>
        <div className={`hand-fan ${handChoice ? 'is-choosing-hand' : ''}`} inert={defenseChoice} onKeyDown={handKeys} aria-label="あなたの手札">
          {player.hand.map((instance, index) => {
            const { x, y, angle } = fanPosition(index, player.hand.length)
            const content: PopupContent = { kind: 'hand', uid: instance.uid }
            const pickedUp = dragging.drag?.source.kind === 'hand' && dragging.drag.source.uid === instance.uid
            const eligible = handChoice && choice!.options.some(o => o.id === instance.uid)
            const selected = handChoice ? selection.selected.includes(instance.uid) : source?.uid === instance.uid || configuration?.cardUid === instance.uid
            const attack = cardAttackDisplay(game, player, instance, source?.uid === instance.uid ? target?.playerId : configuration?.cardUid === instance.uid ? configuration.targetId : undefined, configuration?.cardUid === instance.uid ? configuration.amount ?? 1 : undefined, configuration?.cardUid === instance.uid ? configuration.mode : undefined)
            return <div key={instance.uid} className={`fan-card-slot ${selected ? 'is-selected' : ''} ${pickedUp ? 'is-dragged' : ''} ${handChoice ? eligible ? 'choice-eligible' : 'choice-ineligible' : ''}`} style={{ '--fan-x': `${x}px`, '--fan-y': `${y}px`, '--fan-angle': `${angle}deg`, '--fan-z': index + 1, '--deal-delay': `${index * 90}ms` } as CSSProperties}><div className="hand-deal"><button className="hand-card" aria-pressed={selected} data-choice-eligible={eligible || undefined} aria-disabled={handChoice && (!eligible || !selection.enabled) || undefined} aria-label={`${cardOf(instance).name}：${cardOf(instance).description}`} aria-describedby={handChoice ? 'hand-choice-instructions' : undefined} aria-keyshortcuts={!handChoice ? 'Space' : undefined}
              {...hoverEvents(content)} {...dragging.bindings({ kind: 'hand', uid: instance.uid })}
              onKeyDown={event => { if (event.key === ' ' && !handChoice && canAct && !pending && !configuring) { event.preventDefault(); source?.uid === instance.uid ? setAim(null) : beginAim({ kind: 'hand', uid: instance.uid }) } }}
              onClick={(event) => { if (dragging.consumeClick(event.currentTarget)) return; if (handChoice) { closePopup(); selection.toggle(instance.uid) } else showPopup(content, event.currentTarget) }}><CardFace instance={instance} rank={attack?.rank} />{handChoice && choice!.max > 1 && selected && <span className="hand-choice-number" aria-label={`選択順 ${selection.selected.indexOf(instance.uid) + 1}`}>{selection.selected.indexOf(instance.uid) + 1}</span>}</button></div></div>
          })}
          {!player.hand.length && <p className="empty-hand">{player.status === 'DEAD' ? '観戦中' : '手札は次の自分のターンに補充されます'}</p>}
        </div>
        {defenseChoice && choice && <DefenseCards key={choice.id} choice={choice} game={game} selection={selection} connected={connected} />}
      </div>
      {error && <p className="table-error" role="alert">{error}</p>}
      {cardChoice && choice && <CardSpread events={spreadEvents} cards={choice.options} title={choice.kind === 'DRAW' ? choice.amount === -1 ? '山札に戻す順番' : '山札から選ぶ' : choice.kind === 'RECOVER' ? `${game.players.find(p => p.id === choice.targetId)?.name ?? '対象'}の捨て札` : choice.title} selected={selection.selected} enabled={selection.enabled} onSelect={id => { closePopup(); selection.toggle(id) }} multiple={choice.max > 1} source={choice.kind === 'RECOVER' ? 'discard' : choice.kind === 'SCISSORS' ? 'hand' : choice.kind === 'INTERRUPT' ? 'field' : 'deck'} />}
      {!cardChoice && inspectedPlayer && <CardSpread events={spreadEvents} cards={[...inspectedPlayer.discard].reverse().map(card => ({ id: card.uid, label: cardOf(card).name, card }))} title={`${inspectedPlayer.name}の捨て札`} onClose={() => setInspection(null)} source="discard" />}
    </div>
    </div>
    {dragging.drag && heldCard && createPortal(<div className={`drag-card ${target ? 'has-target' : ''}`} style={{ left: dragging.drag.x, top: dragging.drag.y }} aria-hidden="true"><CardFace instance={heldCard} rank={dragging.drag.source.kind === 'hand' ? cardAttackDisplay(game, player, heldCard, target?.playerId)?.rank : undefined} /></div>, document.body)}
    {popup && <CardPopover anchor={popup.anchor} title={popupTitle} caption={popup.content.kind === 'spread' ? popupCard ? cardOf(popupCard).name : '' : popup.content.kind === 'hand' ? 'あなたの手札' : `${popupOwner?.name}の${popup.content.kind === 'role' ? '役職' : popup.content.kind === 'installed' ? '設置カード・効果' : '捨て札'}${popup.content.kind === 'role' ? popupOwner?.role.state === 'REVEALED' ? ' · CO済み' : popupOwner?.id === player.id && popupCard ? ' · 自分だけ' : '' : ''}`} description={popupDescription} onClose={closePopup} onEnter={clearTimers} onLeave={leavePopup}>
      {popup.content.kind === 'hand' && popupCard && popupDefinition?.kind === 'ROLE' && <RoleActions game={game} selfId={player.id} cardUid={popupCard.uid} enabled={canAct && !pending && !configuring} send={act} onTarget={startRoleTarget} />}
      {popup.content.kind === 'role' && popupOwner?.id === player.id && <RoleActions game={game} selfId={player.id} enabled={canAct && !pending && !configuring} send={act} onTarget={startRoleTarget} />}
      {popup.content.kind === 'hand' && popupCard && popupDefinition?.kind === 'TWINS' && <button className="popover-action" disabled={!canAct || pending || configuring} onClick={() => act({ type: 'PLAY_CARD', cardUid: popupCard.uid, choice: 'ATTACK', targetId: player.id })}>自分を攻撃する</button>}
      {popup.content.kind === 'role' && popupOwner?.id === player.id && popupOwner.role.state === 'FACE_DOWN' && popupCard && <button className="popover-action" disabled={!canAct || pending || configuring} onClick={() => popupDefinition?.roleEffect === 'SEER' ? startRoleTarget({ card: popupCard, message: { type: 'REVEAL_ROLE' } }) : act({ type: 'REVEAL_ROLE' })}>CO</button>}
      {popup.content.kind === 'discard' && <button className="popover-action" onClick={() => { setInspection({ playerId: popupOwner!.id, zone: 'discard' }); closePopup() }}>捨て札をすべて見る</button>}
    </CardPopover>}
  </section>
}
