import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import WebSocket from 'ws'

// An isolated ephemeral server keeps test rooms out of the running development game.
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
const sockets = []
let stderr = ''
server.stderr.on('data', chunk => { stderr += chunk })
try {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server start timed out: ${stderr}`)), 10000)
    server.once('error', reject)
    server.once('exit', () => reject(new Error(`Server exited: ${stderr}`)))
    server.stdout.on('data', chunk => {
      const match = chunk.toString().match(/localhost:(\d+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
  })
  const endpoint = `ws://127.0.0.1:${port}/ws`
  async function open() {
    const socket = new WebSocket(endpoint)
    sockets.push(socket)
    const queue = []
    const waiting = []
    let answerChoices = false
    socket.on('message', raw => {
      const data = JSON.parse(raw.toString())
      const choice = data.room?.game?.pendingChoice
      if (answerChoices && choice && choice.playerId === data.room.selfId) {
        const count = ['DEFENSE', 'RESCUE', 'DEMAND'].includes(choice.kind) ? Math.min(1, choice.options.length) : choice.min
        socket.send(JSON.stringify({ type: 'RESOLVE_CHOICE', choiceId: choice.id, selected: choice.options.slice(0, count).map(o => o.id), targetId: data.room.selfId }))
      }
      const index = waiting.findIndex(w => w.predicate(data))
      if (index === -1) queue.push(data)
      else { const waiter = waiting.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(data) }
    })
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
    return {
      answerChoices: () => { answerChoices = true },
      send: message => socket.send(JSON.stringify(message)),
      close: () => new Promise(resolve => { socket.once('close', resolve); socket.close() }),
      next: (predicate, timeout = 20000) => {
        const index = queue.findIndex(predicate)
        if (index !== -1) return Promise.resolve(queue.splice(index, 1)[0])
        return new Promise((resolve, reject) => {
          const waiter = { predicate, resolve, timer: null }
          waiter.timer = setTimeout(() => { waiting.splice(waiting.indexOf(waiter), 1); reject(new Error('Expected server message was not received')) }, timeout)
          waiting.push(waiter)
        })
      },
    }
  }
  const host = await open()
  host.send({ type: 'CREATE_ROOM', name: 'CPU 1' }) // Also exercises CPU name collision handling.
  const session = await host.next(m => m.type === 'SESSION')
  await host.next(m => m.type === 'ROOM_STATE')
  for (const sets of [['UNKNOWN'], ['FOREST', 'FOREST'], 'FOREST', [null]]) {
    host.send({ type: 'START_GAME', sets })
    await host.next(m => m.type === 'ERROR')
  }
  for (const cpuCount of [-1, 6, 1.5, '3']) {
    host.send({ type: 'START_GAME', cpuCount })
    await host.next(m => m.type === 'ERROR')
  }
  const guest = await open()
  guest.send({ type: 'JOIN_ROOM', roomCode: session.roomCode, name: 'Guest' })
  await guest.next(m => m.type === 'SESSION')
  await host.next(m => m.type === 'ROOM_STATE' && m.room.players.length === 2)
  guest.send({ type: 'START_GAME', cpuCount: 3 })
  await guest.next(m => m.type === 'ERROR')
  host.send({ type: 'START_GAME', cpuCount: 3 })
  await host.next(m => m.type === 'ERROR')
  guest.send({ type: 'LEAVE_ROOM' })
  await host.next(m => m.type === 'ROOM_STATE' && m.room.players.length === 1)
  await guest.close()

  host.send({ type: 'START_GAME', cpuCount: 3 })
  const started = (await host.next(m => m.type === 'ROOM_STATE' && m.room.game)).room
  assert.equal(started.players.length, 4)
  assert.equal(started.game.mode, 'NORMAL')
  assert.deepEqual(started.game.sets, ['FOREST', 'MOON'])
  assert.equal(started.game.deckCount, 90, 'Both complete expansion sets produce a 93-card deck before dealing')
  assert.equal(started.players.filter(p => p.isCpu && p.connected).length, 3)
  assert.equal(new Set(started.players.map(p => p.name)).size, 4)
  host.send({ type: 'END_TURN' })
  const paused = (await host.next(m => m.type === 'ROOM_STATE' && m.room.game?.currentPlayerIndex === 1)).room
  host.send({ type: 'END_TURN', playerId: 'player-2' })
  await host.next(m => m.type === 'ERROR')
  await host.close()
  await delay(2100)

  const resumed = await open()
  resumed.answerChoices()
  resumed.send({ type: 'RESUME', roomCode: session.roomCode, token: session.token })
  await resumed.next(m => m.type === 'SESSION')
  const restored = (await resumed.next(m => m.type === 'ROOM_STATE')).room
  assert.equal(restored.game.nextLogId, paused.game.nextLogId, 'CPU must pause without a connected human')
  assert.equal(restored.game.turnNumber, paused.game.turnNumber)
  const completed = (await resumed.next(m => m.type === 'ROOM_STATE' && (m.room.game?.turnNumber > 1 && m.room.game.currentPlayerIndex === 0 || m.room.status === 'FINISHED'), 60000)).room
  if (completed.status !== 'FINISHED') assert.equal(completed.game.currentPlayerIndex, 0)
  assert.ok(completed.game.log.some(entry => entry.message.includes('CPU 2')))
  for (const player of completed.game.players.slice(1)) {
    assert.equal(player.hand.length, 0, 'CPU hand must remain private')
    if (player.role.state === 'FACE_DOWN') assert.equal(player.role.card, null)
  }
  assert.ok(completed.game.log.every(entry => entry.visibility === 'PUBLIC' || entry.playerId === completed.selfId))
  // Replacing a still-open connection must not let its later close pause the CPU or mark the new socket offline.
  const replacement = await open()
  replacement.answerChoices()
  replacement.send({ type: 'RESUME', roomCode: session.roomCode, token: session.token })
  await replacement.next(m => m.type === 'SESSION')
  let alive = (await replacement.next(m => m.type === 'ROOM_STATE')).room
  if (alive.status !== 'FINISHED' && !alive.game.pendingChoice) {
    replacement.send({ type: 'END_TURN' })
    alive = (await replacement.next(m => m.type === 'ROOM_STATE' && (m.room.game?.turnNumber > completed.game.turnNumber || m.room.status === 'FINISHED'))).room
  }
  assert.ok(alive.players.find(p => p.id === alive.selfId).connected)
  await replacement.close()

  // Host transfer in a lobby must keep the single human's player ID aligned with the created game.
  const first = await open()
  first.send({ type: 'CREATE_ROOM', name: 'Leaving host' })
  const firstSession = await first.next(m => m.type === 'SESSION')
  const second = await open()
  second.send({ type: 'JOIN_ROOM', roomCode: firstSession.roomCode, name: 'New host' })
  await second.next(m => m.type === 'SESSION')
  first.send({ type: 'LEAVE_ROOM' })
  await second.next(m => m.type === 'ROOM_STATE' && m.room.isHost)
  second.send({ type: 'START_GAME', cpuCount: 5 })
  const six = (await second.next(m => m.type === 'ROOM_STATE' && m.room.game)).room
  assert.equal(six.players.length, 6)
  assert.equal(six.selfId, six.game.players[0].id)
  assert.equal(six.game.players[0].hand.length, 3)
  await second.close()
  await first.close()

  // Exercise a real private choice, reconnection in the middle, and duplicate/foreign responses.
  const chooser = await open(), observer = await open()
  let choiceSession, choiceRoom, consider
  for (let attempt = 0; attempt < 120; attempt++) {
    chooser.send({ type: 'CREATE_ROOM', name: 'Choice owner' })
    choiceSession = await chooser.next(m => m.type === 'SESSION')
    observer.send({ type: 'JOIN_ROOM', roomCode: choiceSession.roomCode, name: 'Observer' })
    await observer.next(m => m.type === 'SESSION')
    await chooser.next(m => m.type === 'ROOM_STATE' && m.room.code === choiceSession.roomCode && m.room.players.length === 2)
    chooser.send({ type: 'START_GAME' })
    choiceRoom = (await chooser.next(m => m.type === 'ROOM_STATE' && m.room.code === choiceSession.roomCode && m.room.game)).room
    consider = choiceRoom.game.players[0].hand.find(c => c.cardId === 'consider')
    if (consider) break
  }
  assert.ok(consider, 'A private draw choice fixture must be dealt')
  chooser.send({ type: 'PLAY_CARD', cardUid: consider.uid, choice: 'STATEMENT' })
  const choiceView = (await chooser.next(m => m.type === 'ROOM_STATE' && m.room.game?.pendingChoice)).room.game
  const publicChoice = (await observer.next(m => m.type === 'ROOM_STATE' && m.room.game?.pendingChoice)).room.game
  assert.equal(choiceView.pendingChoice.options.length, 4)
  assert.deepEqual(publicChoice.pendingChoice.options, [])
  assert.deepEqual(publicChoice.queue, [])
  assert.equal(publicChoice.pendingChoice.cards, undefined)
  assert.equal(publicChoice.pendingChoice.tasks, undefined)
  observer.send({ type: 'RESOLVE_CHOICE', choiceId: choiceView.pendingChoice.id, selected: choiceView.pendingChoice.options.slice(0, 2).map(o => o.id) })
  await observer.next(m => m.type === 'ERROR')
  await chooser.close()
  const rechooser = await open()
  rechooser.send({ type: 'RESUME', roomCode: choiceSession.roomCode, token: choiceSession.token })
  await rechooser.next(m => m.type === 'SESSION')
  const restoredChoice = (await rechooser.next(m => m.type === 'ROOM_STATE')).room.game.pendingChoice
  assert.equal(restoredChoice.id, choiceView.pendingChoice.id)
  const response = { type: 'RESOLVE_CHOICE', choiceId: restoredChoice.id, selected: restoredChoice.options.slice(0, 2).map(o => o.id) }
  rechooser.send(response)
  const returnChoice = (await rechooser.next(m => m.type === 'ROOM_STATE')).room.game.pendingChoice
  assert.notEqual(returnChoice.id, restoredChoice.id)
  rechooser.send(response)
  await rechooser.next(m => m.type === 'ERROR')
  rechooser.send({ type: 'RESOLVE_CHOICE', choiceId: returnChoice.id, selected: returnChoice.options.map(o => o.id) })
  assert.equal((await rechooser.next(m => m.type === 'ROOM_STATE')).room.game.pendingChoice, null)
  await rechooser.close(); await observer.close()

  await new Promise((resolve, reject) => {
    const smoke = spawn(process.execPath, ['scripts/online-smoke.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, RIGHTWOLF_WS: endpoint }, stdio: 'inherit', windowsHide: true })
    smoke.once('error', reject)
    smoke.once('exit', code => code === 0 ? resolve() : reject(new Error(`Online smoke exited ${code}`)))
  })
  console.log(JSON.stringify({ cpu: true, countsAndHostValidation: true, cpuTurns: true, pauseResume: true, replacementConnection: true, secretFiltering: true, sixPlayerHostTransfer: true, privateChoiceResume: true, duplicateChoiceRejected: true }))
} finally {
  for (const socket of sockets) socket.terminate()
  server.kill()
}
