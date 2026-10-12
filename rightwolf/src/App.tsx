import { useEffect, useRef, useState } from 'react'
import { ALL_CARDS, PLAYABLE_CARD_COUNT } from './game/cards'
import type { ExpansionSet } from './game/types'
import GameBoard from './GameBoard'
import type { ClientMessage, RoomView, ServerMessage } from './network/protocol'

const SESSION_KEY = 'rightwolf.session.v1'

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = location.port === '5173' ? `${location.hostname}:8787` : location.host
  return `${protocol}//${host}/ws`
}

function App() {
  const socket = useRef<WebSocket | null>(null)
  const [room, setRoom] = useState<RoomView | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState(false)

  useEffect(() => {
    let retry: number | undefined
    let active = true
    const connect = () => {
      const ws = new WebSocket(socketUrl())
      socket.current = ws
      ws.onopen = () => {
        if (!active) return ws.close()
        setConnected(true)
        const saved = localStorage.getItem(SESSION_KEY)
        if (saved) {
          try { ws.send(JSON.stringify({ type: 'RESUME', ...JSON.parse(saved) })) } catch { localStorage.removeItem(SESSION_KEY) }
        }
      }
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage
        if (message.type === 'SESSION') localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: message.roomCode, token: message.token }))
        if (message.type === 'ROOM_STATE') { setRoom(message.room); setError('') }
        if (message.type === 'ERROR') setError(message.message)
      }
      ws.onclose = () => {
        setConnected(false)
        if (active) retry = window.setTimeout(connect, 1200)
      }
    }
    connect()
    return () => { active = false; if (retry) clearTimeout(retry); socket.current?.close() }
  }, [])

  const send = (message: ClientMessage) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return setError('サーバーへ接続中です。少し待ってからもう一度お試しください。')
    setError('')
    socket.current.send(JSON.stringify(message))
  }
  const leave = () => {
    send({ type: 'LEAVE_ROOM' })
    localStorage.removeItem(SESSION_KEY)
    setRoom(null)
  }

  return <div className="app-shell"><header className="topbar"><button className="brand" aria-label="トップへ"><span className="brand-mark">RW</span><span>RIGHT WOLF<small>正体を隠し、爪を研げ。</small></span></button><nav><span className={`connection ${connected ? 'online' : ''}`}>{connected ? '接続中' : '再接続中'}</span><button className="text-button" onClick={() => setShowRules(true)}>遊び方</button>{room && <button className="text-button danger" onClick={leave}>退出</button>}</nav></header><main>
    {showRules ? <Rules onBack={() => setShowRules(false)} /> : !room ? <Home send={send} error={error} connected={connected} /> : room.status === 'LOBBY' ? <Lobby room={room} send={send} error={error} /> : room.game ? <GameBoard key={room.game.id} room={room} send={send} error={error} connected={connected} /> : null}
  </main></div>
}

function Home({ send, error, connected }: { send: (message: ClientMessage) => void; error: string; connected: boolean }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  return <section className="setup page-enter"><div className="eyebrow">ONLINE MATCH</div><h1>夜が来る前に、<br /><em>正体を見抜け。</em></h1><p className="lead">離れた仲間とリアルタイムで遊ぶ、2〜6人用カードバトル。</p><div className="online-grid">
    <div className="setup-card"><div className="section-title"><span>01</span><div><h2>部屋を作る</h2><p>あなたがホストになり、参加者を待ちます。</p></div></div><label className="online-field"><span>プレイヤー名</span><input value={name} maxLength={12} placeholder="名前を入力" onChange={(e) => setName(e.target.value)} /></label><button className="primary wide" disabled={!connected || !name.trim()} onClick={() => send({ type: 'CREATE_ROOM', name })}>部屋を作成 <span>→</span></button></div>
    <div className="setup-card"><div className="section-title"><span>02</span><div><h2>部屋に参加</h2><p>ホストから受け取った5文字のコードを入力します。</p></div></div><label className="online-field"><span>部屋コード</span><input className="room-input" value={code} maxLength={5} placeholder="ABCDE" onChange={(e) => setCode(e.target.value.toUpperCase())} /></label><button className="secondary wide" disabled={!connected || !name.trim() || code.length !== 5} onClick={() => send({ type: 'JOIN_ROOM', roomCode: code, name })}>参加する <span>→</span></button></div>
  </div>{error && <p className="error standalone">{error}</p>}</section>
}

export function Lobby({ room, send, error }: { room: RoomView; send: (message: ClientMessage) => void; error: string }) {
  const [cpuCount, setCpuCount] = useState(3)
  const [sets, setSets] = useState<ExpansionSet[]>(['FOREST', 'MOON'])
  const solo = room.players.length === 1
  const copyCode = () => navigator.clipboard.writeText(room.code).catch(() => undefined)
  return <section className="lobby page-enter">
    <div className="eyebrow">WAITING ROOM</div><h1>参加者を待っています</h1>
    <p className="lead">仲間を招待するか、1人でCPUと対戦できます。</p>
    <button className="room-code" onClick={copyCode}><small>ROOM CODE</small><strong>{room.code}</strong><span>クリックしてコピー</span></button>
    <div className="lobby-card">
      <div className="panel-heading"><div><span>PLAYERS</span><h2>参加者 <small>{room.players.length} / 6</small></h2></div>
        {room.isHost && <button className="primary" disabled={room.players.some(player => !player.connected)} onClick={() => send({ type: 'START_GAME', cpuCount: solo ? cpuCount : 0, sets })}>{solo ? cpuCount > 0 ? 'CPU対戦を開始' : '1人用テスト開始' : 'ゲーム開始'} →</button>}
      </div>
      <div className="lobby-players">{room.players.map((player, index) => <div key={player.id}><div className="avatar">{player.name.slice(0, 1)}</div><strong>{player.name}</strong>{player.isHost && <b>HOST</b>}<span className={player.connected ? 'ready' : ''}>{player.connected ? 'READY' : 'OFFLINE'}</span><i>{String(index + 1).padStart(2, '0')}</i></div>)}</div>
      {room.isHost && solo && <div className="cpu-setup">
        <label htmlFor="cpu-count">CPUの人数<select id="cpu-count" value={cpuCount} onChange={event => setCpuCount(Number(event.target.value))}>
          {[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count}人{count === 3 ? '（標準）' : ''}</option>)}
          <option value={0}>なし（1人用テスト）</option>
        </select></label>
        <p>{cpuCount > 0 ? `あなたとCPU ${cpuCount}人が卓を囲みます。CPUもカードや役職を使い、最後の1人が勝利します。` : '1人でカードと役職を試せます。「誰か1人」は自分も選べます。勝利判定は行いません。'}</p>
      </div>}
      {room.isHost && <div className="expansion-sets" role="group" aria-label="追加セット">{(['FOREST', 'MOON'] as const).map(set => <label key={set}><input type="checkbox" checked={sets.includes(set)} onChange={() => setSets(current => current.includes(set) ? current.filter(s => s !== set) : [...current, set])} />{set === 'FOREST' ? '眠りの森' : '血塗れの赤い月'}</label>)}</div>}
      {!room.isHost && <p className="waiting">ホストがゲームを開始するまでお待ちください。</p>}
      {error && <p className="error">{error}</p>}
    </div>
  </section>
}


function Rules({ onBack }: { onBack: () => void }) {
  return <section className="rules page-enter"><button className="text-button" onClick={onBack}>← 戻る</button><div className="eyebrow">QUICK GUIDE</div><h1>遊び方</h1>
    <div className="rules-grid"><article><span>01</span><h2>部屋に集まる</h2><p>5文字の部屋コードで参加。追加セットはホストが選べます。1人ならCPU対戦やテストもできます。</p></article><article><span>02</span><h2>生き残る</h2><p>HPは10。通常は最後の生存者が勝利。純愛者は生存人数に数えず、勝利リンクで一緒に勝てます。「誰か1人」は自分も選べます。</p></article><article><span>03</span><h2>カードを使う</h2><p>連続攻撃は1ヒットずつ処理し、防御・誘発は発動するか選べます。HP減少と直接死亡は通常ダメージとは別です。</p></article><article><span>04</span><h2>昼と夜</h2><p>昼夜は2フェーズごとに切り替わります。追加ターンはフェーズを進めません。昼夜逆転は周期を変えず即座に反転します。</p></article></div>
    <h2>カード一覧</h2><p>基本65枚・追加36枚のうち、確定済み{PLAYABLE_CARD_COUNT}枚に対応しています。確認中のカードは山札に入りません。</p>
    <div className="catalog">{ALL_CARDS.map(card => <div key={card.id}><strong>{card.name} ×{card.count ?? 1}{card.unresolved ? '（確認中）' : ''}</strong><span>{card.description}</span></div>)}</div>
  </section>
}

export default App
