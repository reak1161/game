import WebSocket from 'ws'

const open = () => new Promise((resolve, reject) => {
  const socket = new WebSocket(process.env.RIGHTWOLF_WS || 'ws://127.0.0.1:8787/ws')
  socket.once('open', () => resolve(socket))
  socket.once('error', reject)
})

const inbox = (socket) => {
  const messages = []
  const waiters = []
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    const index = waiters.findIndex((waiter) => waiter.type === message.type)
    if (index < 0) messages.push(message)
    else {
      const waiter = waiters.splice(index, 1)[0]
      clearTimeout(waiter.timer)
      waiter.resolve(message)
    }
  })
  return (type) => {
    const index = messages.findIndex((message) => message.type === type)
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0])
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, timer: undefined }
      waiters.push(waiter)
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        reject(new Error(`${type}を受信できませんでした。`))
      }, 3000)
    })
  }
}

const host = await open()
const nextHost = inbox(host)
host.send(JSON.stringify({ type: 'CREATE_ROOM', name: 'アキラ' }))
const hostSession = await nextHost('SESSION')
await nextHost('ROOM_STATE')

const guest = await open()
const nextGuest = inbox(guest)
guest.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: hostSession.roomCode, name: 'ユウ' }))
const guestSession = await nextGuest('SESSION')
await nextGuest('ROOM_STATE')
const joined = await nextHost('ROOM_STATE')

host.send(JSON.stringify({ type: 'START_GAME' }))
const hostGame = await nextHost('ROOM_STATE')
const guestGame = await nextGuest('ROOM_STATE')
const secretOk = hostGame.room.game.players[0].hand.length === 3
  && guestGame.room.game.players[0].hand.length === 0
  && guestGame.room.game.players[0].handCount === 3

host.send(JSON.stringify({ type: 'END_TURN' }))
const hostTurn = await nextHost('ROOM_STATE')
const guestTurn = await nextGuest('ROOM_STATE')
const turnOk = hostTurn.room.game.currentPlayerIndex === 1
  && guestTurn.room.game.players[1].hand.length === 3

guest.close()
const resumed = await open()
const nextResumed = inbox(resumed)
resumed.send(JSON.stringify({ type: 'RESUME', roomCode: guestSession.roomCode, token: guestSession.token }))
await nextResumed('SESSION')
const resumedRoom = await nextResumed('ROOM_STATE')
const resumeOk = resumedRoom.room.selfId === 'player-2' && resumedRoom.room.game.players[1].hand.length === 3

if (joined.room.players.length !== 2 || !secretOk || !turnOk || !resumeOk) throw new Error('オンライン同期の検証に失敗しました。')
console.log(JSON.stringify({ players: 2, secretOk, turnOk, resumeOk }))
host.close()
resumed.close()

const solo = await open()
const nextSolo = inbox(solo)
solo.send(JSON.stringify({ type: 'CREATE_ROOM', name: 'テスター' }))
await nextSolo('SESSION')
await nextSolo('ROOM_STATE')
solo.send(JSON.stringify({ type: 'START_GAME' }))
const soloGame = await nextSolo('ROOM_STATE')
solo.send(JSON.stringify({ type: 'END_TURN' }))
const soloTurn = await nextSolo('ROOM_STATE')
const soloOk = soloGame.room.game.mode === 'TEST'
  && soloTurn.room.game.phase === 2
  && soloTurn.room.game.time === 'DAY'
  && soloTurn.room.game.winnerId === null
if (!soloOk) throw new Error('1人用テストの検証に失敗しました。')
console.log(JSON.stringify({ players: 1, soloOk }))
solo.close()
