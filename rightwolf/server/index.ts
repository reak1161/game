import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { createGame, endTurn, playCard, revealRole, resolveChoice, useRoleAbility } from '../src/game/engine.js'
import type { GameState } from '../src/game/types.js'
import type { ClientMessage, RoomView, ServerMessage } from '../src/network/protocol.js'
import { chooseCpuAction } from './cpu.js'
import { gameView } from './game-view.js'

interface Member {
  token: string
  playerId: string
  name: string
  socket: WebSocket | null
  isCpu?: boolean
}

interface Room {
  code: string
  hostToken: string
  members: Member[]
  game: GameState | null
  cpuTimer?: ReturnType<typeof setTimeout>
}

const rooms = new Map<string, Room>()
const connections = new Map<WebSocket, { roomCode: string; token: string }>()
const port = Number(process.env.PORT || 8787)
const dist = fileURLToPath(new URL('../dist', import.meta.url))

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

function roomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  do {
    let code = ''
    for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)]
    if (!rooms.has(code)) return code
  } while (true)
}

function view(room: Room, member: Member): RoomView {
  return {
    code: room.code,
    status: room.game ? (room.game.winnerId || room.game.draw ? 'FINISHED' : 'PLAYING') : 'LOBBY',
    selfId: member.playerId,
    isHost: member.token === room.hostToken,
    players: room.members.map((item) => ({
      id: item.playerId,
      name: item.name,
      connected: Boolean(item.isCpu || item.socket?.readyState === WebSocket.OPEN),
      isHost: item.token === room.hostToken,
      isCpu: item.isCpu,
    })),
    game: room.game ? gameView(room.game, member.playerId) : null,
  }
}

function broadcast(room: Room): void {
  for (const member of room.members) {
    if (member.socket) send(member.socket, { type: 'ROOM_STATE', room: view(room, member) })
  }
  scheduleCpu(room)
}

function currentCpu(room: Room) {
  if (!room.game || room.game.winnerId || room.game.draw || !room.members.some(m => !m.isCpu && m.socket?.readyState === WebSocket.OPEN)) return null
  const active = room.game.pendingChoice ? room.game.players.find(p => p.id === room.game!.pendingChoice!.playerId)! : room.game.players[room.game.currentPlayerIndex]
  return active.status === 'ALIVE' ? room.members.find(m => m.isCpu && m.playerId === active.id) : null
}

function scheduleCpu(room: Room): void {
  if (room.cpuTimer) clearTimeout(room.cpuTimer)
  room.cpuTimer = undefined
  if (!currentCpu(room)) return
  // One action per tick lets card, damage and turn animations finish visibly.
  room.cpuTimer = setTimeout(() => {
    room.cpuTimer = undefined
    const cpu = currentCpu(room)
    if (!cpu || !room.game) return
    const action = chooseCpuAction(gameView(room.game, cpu.playerId))
    const result = action.type === 'RESOLVE_CHOICE'
      ? resolveChoice(room.game, cpu.playerId, action.choiceId, action.selected, action.targetId)
      : action.type === 'PLAY_CARD'
      ? playCard(room.game, { ...action, playerId: cpu.playerId })
      : action.type === 'REVEAL_ROLE'
        ? revealRole(room.game, cpu.playerId, action.targetId)
        : endTurn(room.game, cpu.playerId)
    // A rejected action must never leave the table stuck on a CPU turn.
    const applied = result.ok ? result : endTurn(room.game, cpu.playerId)
    if (applied.ok) { room.game = applied.state; broadcast(room) }
  }, 900)
}

function identify(socket: WebSocket): { room: Room; member: Member } | null {
  const session = connections.get(socket)
  if (!session) return null
  const room = rooms.get(session.roomCode)
  const member = room?.members.find((item) => item.token === session.token)
  return room && member ? { room, member } : null
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 12) : ''
}

function leave(socket: WebSocket): void {
  const found = identify(socket)
  if (!found) return
  const { room, member } = found
  connections.delete(socket)
  // A replaced connection can close after its replacement has already resumed.
  if (member.socket !== socket) return
  member.socket = null
  if (!room.game) {
    room.members = room.members.filter((item) => item.token !== member.token)
    if (room.members.length === 0) rooms.delete(room.code)
    else if (member.token === room.hostToken) room.hostToken = room.members[0].token
  }
  broadcast(room)
}

function bind(socket: WebSocket, room: Room, member: Member): void {
  if (member.socket && member.socket !== socket) member.socket.close(4001, '別の接続で再開されました')
  member.socket = socket
  connections.set(socket, { roomCode: room.code, token: member.token })
  send(socket, { type: 'SESSION', roomCode: room.code, token: member.token })
  broadcast(room)
}

const server = createServer((request, response) => {
  if (!existsSync(dist)) {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('開発時の画面は http://localhost:5173 を開いてください。')
    return
  }
  const requestPath = request.url === '/' ? '/index.html' : request.url?.split('?')[0] || '/index.html'
  const safePath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '')
  let filePath = join(dist, safePath)
  if (!existsSync(filePath)) filePath = join(dist, 'index.html')
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
  response.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' })
  response.end(readFileSync(filePath))
})

const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', (socket) => {
  socket.on('message', (data) => {
    let message: ClientMessage
    try { message = JSON.parse(data.toString()) as ClientMessage } catch { return send(socket, { type: 'ERROR', message: '通信内容を読み取れませんでした。' }) }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return send(socket, { type: 'ERROR', message: '通信内容を読み取れませんでした。' })

    if (message.type === 'CREATE_ROOM') {
      const name = cleanName(message.name)
      if (!name) return send(socket, { type: 'ERROR', message: '名前を入力してください。' })
      leave(socket)
      const code = roomCode()
      const token = randomBytes(24).toString('base64url')
      const member: Member = { token, playerId: 'player-1', name, socket: null }
      const room: Room = { code, hostToken: token, members: [member], game: null }
      rooms.set(code, room)
      return bind(socket, room, member)
    }

    if (message.type === 'JOIN_ROOM') {
      const code = String(message.roomCode || '').trim().toUpperCase()
      const name = cleanName(message.name)
      const room = rooms.get(code)
      if (!room || room.game) return send(socket, { type: 'ERROR', message: '参加できる部屋が見つかりません。' })
      if (!name) return send(socket, { type: 'ERROR', message: '名前を入力してください。' })
      if (room.members.length >= 6) return send(socket, { type: 'ERROR', message: 'この部屋は満員です。' })
      if (room.members.some((item) => item.name === name)) return send(socket, { type: 'ERROR', message: '同じ名前は使用できません。' })
      leave(socket)
      let seat = 1
      while (room.members.some((item) => item.playerId === `player-${seat}`)) seat += 1
      const member: Member = { token: randomBytes(24).toString('base64url'), playerId: `player-${seat}`, name, socket: null }
      room.members.push(member)
      return bind(socket, room, member)
    }

    if (message.type === 'RESUME') {
      const room = rooms.get(String(message.roomCode || '').toUpperCase())
      const member = room?.members.find((item) => item.token === message.token)
      if (!room || !member || member.isCpu) return send(socket, { type: 'ERROR', message: '以前の部屋へ再接続できませんでした。' })
      leave(socket)
      return bind(socket, room, member)
    }

    const found = identify(socket)
    if (!found) return send(socket, { type: 'ERROR', message: '先に部屋へ参加してください。' })
    const { room, member } = found

    if (message.type === 'LEAVE_ROOM') return leave(socket)
    if (message.type === 'START_GAME') {
      if (member.token !== room.hostToken) return send(socket, { type: 'ERROR', message: 'ホストだけがゲームを開始できます。' })
      if (room.game) return send(socket, { type: 'ERROR', message: 'ゲームはすでに始まっています。' })
      if (room.members.some((item) => item.socket?.readyState !== WebSocket.OPEN)) return send(socket, { type: 'ERROR', message: '全員の接続を確認してください。' })
      const cpuCount = message.cpuCount ?? 0
      const sets = message.sets ?? ['FOREST', 'MOON']
      if (!Array.isArray(sets) || sets.some(set => set !== 'FOREST' && set !== 'MOON') || new Set(sets).size !== sets.length) return send(socket, { type: 'ERROR', message: '追加セットを確認してください。' })
      if (!Number.isInteger(cpuCount) || cpuCount < 0 || cpuCount > 5) return send(socket, { type: 'ERROR', message: 'CPUの人数は0〜5人で選んでください。' })
      if (cpuCount > 0 && room.members.length !== 1) return send(socket, { type: 'ERROR', message: 'CPU対戦は1人だけの部屋で開始できます。' })
      for (let index = 1; index <= cpuCount; index++) {
        let name = `CPU ${index}`
        while (room.members.some(m => m.name === name)) name += '号'
        room.members.push({ token: randomBytes(24).toString('base64url'), playerId: `player-${index + 1}`, name, socket: null, isCpu: true })
      }
      room.game = createGame(room.members.map((item) => item.name), Math.random, sets)
      room.members.forEach((item, index) => { item.playerId = room.game!.players[index].id })
      broadcast(room)
      return
    }
    if (!room.game) return send(socket, { type: 'ERROR', message: 'ゲームはまだ始まっていません。' })

    const result = message.type === 'PLAY_CARD'
      ? playCard(room.game, { ...message, playerId: member.playerId })
      : message.type === 'REVEAL_ROLE'
        ? revealRole(room.game, member.playerId, message.targetId)
        : message.type === 'END_TURN'
          ? endTurn(room.game, member.playerId)
          : message.type === 'RESOLVE_CHOICE'
            ? resolveChoice(room.game, member.playerId, message.choiceId, message.selected, message.targetId)
            : message.type === 'ROLE_ABILITY'
              ? useRoleAbility(room.game, member.playerId, message.targetId)
          : null
    if (!result) return
    if (!result.ok) return send(socket, { type: 'ERROR', message: result.error })
    room.game = result.state
    broadcast(room)
  })
  socket.on('close', () => leave(socket))
})

server.listen(port, () => {
  const address = server.address()
  console.log(`Right Wolf server: http://localhost:${typeof address === 'object' && address ? address.port : port}`)
})
