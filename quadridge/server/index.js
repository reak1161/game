import { DurableObject } from 'cloudflare:workers';
import { newGame, play } from '../src/engine.js';
import { normalizeDisplayName, normalizeRoomCode } from '../src/identity.js';

const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
const TICKET_LIFETIME = 10 * 60 * 1000;
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function secureRandom() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}

function newIdentity(displayName) {
  return { playerId: crypto.randomUUID(), token: crypto.randomUUID(), displayName: normalizeDisplayName(displayName) };
}

function publicSeat(code, player) {
  return { code, playerId: player.playerId, token: player.token, displayName: player.displayName };
}

function makeCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => CODE_CHARS[byte % CODE_CHARS.length]).join('');
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function error(message, status = 400) { return json({ error: message }, status); }

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('入力がありません。');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2048) { await reader.cancel(); throw new Error('入力が長すぎます。'); }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(data)); }
  catch { throw new Error('入力形式が正しくありません。'); }
}

function tokenFromWebSocket(request) {
  const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(item => item.trim());
  if (!protocols.includes('quadridge')) return null;
  const auth = protocols.find(item => /^auth\.[0-9a-f-]{36}$/.test(item));
  return auth?.slice(5) || null;
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!sameOrigin(request)) return error('この接続元からは利用できません。', 403);
    try {
      const lobby = env.LOBBY.getByName('global');
      if (request.method === 'POST' && path === '/api/rooms') {
        const body = await readJson(request);
        const displayName = normalizeDisplayName(body.displayName);
        return json(await lobby.createRoom(displayName), 201);
      }
      const join = path.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/join$/);
      if (request.method === 'POST' && join) {
        const code = normalizeRoomCode(join[1]);
        const body = await readJson(request);
        const displayName = normalizeDisplayName(body.displayName);
        return json(await env.ROOM.getByName(code).join(displayName));
      }
      const roomSocket = path.match(/^\/api\/rooms\/([A-Za-z0-9]{6})\/ws$/);
      if (request.method === 'GET' && roomSocket) {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error('WebSocket 接続が必要です。', 426);
        const token = tokenFromWebSocket(request);
        if (!token) return error('接続情報が正しくありません。', 401);
        const code = normalizeRoomCode(roomSocket[1]);
        const headers = new Headers(request.headers);
        headers.set('X-Seat-Token', token);
        return env.ROOM.getByName(code).fetch(new Request(request, { headers }));
      }
      if (request.method === 'POST' && path === '/api/matchmaking') {
        const body = await readJson(request);
        const displayName = normalizeDisplayName(body.displayName);
        return json(await lobby.joinRandom(displayName), 201);
      }
      if (request.method === 'POST' && path === '/api/matchmaking/cancel') {
        const body = await readJson(request);
        await lobby.cancelRandom(body.ticket);
        return json({ ok: true });
      }
      if (request.method === 'GET' && path === '/api/matchmaking/ws') {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error('WebSocket 接続が必要です。', 426);
        const ticket = tokenFromWebSocket(request);
        if (!ticket) return error('接続情報が正しくありません。', 401);
        const headers = new Headers(request.headers);
        headers.set('X-Match-Ticket', ticket);
        return lobby.fetch(new Request(request, { headers }));
      }
      return error('見つかりません。', 404);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '処理に失敗しました。';
      const status = /満員|見つかりません|期限切れ|終了/.test(message) ? 409 : 400;
      return error(message, status);
    }
  },
};

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS tickets (ticket TEXT PRIMARY KEY, player TEXT NOT NULL, status TEXT NOT NULL, code TEXT, created_at INTEGER NOT NULL, connected INTEGER NOT NULL DEFAULT 0)');
    if (!this.ctx.storage.sql.exec('PRAGMA table_info(tickets)').toArray().some(column => column.name === 'connected')) {
      this.ctx.storage.sql.exec('ALTER TABLE tickets ADD COLUMN connected INTEGER NOT NULL DEFAULT 0');
    }
  }

  reserveCode() {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM codes WHERE expires_at < ?', now);
    for (let attempt = 0; attempt < 40; attempt++) {
      const code = makeCode();
      if (this.ctx.storage.sql.exec('SELECT code FROM codes WHERE code = ?', code).toArray().length) continue;
      this.ctx.storage.sql.exec('INSERT INTO codes (code, expires_at) VALUES (?, ?)', code, now + ROOM_LIFETIME);
      return code;
    }
    throw new Error('ルームIDを発行できませんでした。');
  }

  async initializeFreshRoom(players) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const code = this.reserveCode();
      try {
        await this.env.ROOM.getByName(code).initialize(code, players);
        return code;
      } catch (caught) {
        this.ctx.storage.sql.exec('DELETE FROM codes WHERE code = ?', code);
        if (!(caught instanceof Error) || caught.message !== 'ルームIDが使用中です。') throw caught;
      }
    }
    throw new Error('空いているルームIDを発行できませんでした。');
  }

  async createRoom(displayName) {
    const player = newIdentity(displayName);
    const code = await this.initializeFreshRoom([player]);
    return publicSeat(code, player);
  }

  async joinRandom(displayName) {
    const player = newIdentity(displayName);
    const ticket = crypto.randomUUID();
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE status = ? AND created_at < ?', 'waiting', now - TICKET_LIFETIME);
    this.ctx.storage.sql.exec('INSERT INTO tickets (ticket, player, status, created_at) VALUES (?, ?, ?, ?)', ticket, JSON.stringify(player), 'waiting', now);
    return { ticket };
  }

  async maybeMatch(ticket) {
    const current = this.ctx.storage.sql.exec('SELECT player FROM tickets WHERE ticket = ? AND status = ? AND connected = 1', ticket, 'waiting').toArray()[0];
    if (!current) return;
    const waiting = this.ctx.storage.sql.exec('SELECT ticket, player FROM tickets WHERE status = ? AND connected = 1 AND ticket != ? ORDER BY created_at LIMIT 1', 'waiting', ticket).toArray()[0];
    if (waiting) {
      // 待機中から先に外して、同時リクエストによる二重マッチを防ぐ。
      this.ctx.storage.sql.exec('UPDATE tickets SET status = ? WHERE ticket IN (?, ?)', 'matching', waiting.ticket, ticket);
      try {
        const code = await this.initializeFreshRoom([JSON.parse(waiting.player), JSON.parse(current.player)]);
        this.ctx.storage.sql.exec('UPDATE tickets SET status = ?, code = ? WHERE ticket IN (?, ?)', 'matched', code, waiting.ticket, ticket);
        this.notifyTicket(waiting.ticket, code);
        this.notifyTicket(ticket, code);
        return true;
      } catch (caught) {
        this.ctx.storage.sql.exec('UPDATE tickets SET status = ? WHERE ticket IN (?, ?)', 'waiting', waiting.ticket, ticket);
        throw caught;
      }
    }
  }

  cancelRandom(ticket) {
    if (typeof ticket !== 'string' || !/^[0-9a-f-]{36}$/.test(ticket)) return;
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE ticket = ? AND status = ?', ticket, 'waiting');
  }

  ticketResult(ticket) {
    const row = this.ctx.storage.sql.exec('SELECT player, status, code, created_at FROM tickets WHERE ticket = ?', ticket).toArray()[0];
    if (!row || row.created_at < Date.now() - TICKET_LIFETIME) return { type: 'error', message: 'マッチングの期限が切れました。' };
    if (row.status !== 'matched') return { type: 'waiting' };
    return { type: 'matched', ...publicSeat(row.code, JSON.parse(row.player)) };
  }

  notifyTicket(ticket, code) {
    const payload = JSON.stringify(this.ticketResult(ticket));
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.deserializeAttachment()?.ticket === ticket && socket.readyState === 1) socket.send(payload);
    }
  }

  async fetch(request) {
    const ticket = request.headers.get('X-Match-Ticket');
    if (!ticket || this.ticketResult(ticket).type === 'error') return error('マッチングが見つかりません。', 404);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ ticket });
    this.ctx.storage.sql.exec('UPDATE tickets SET connected = 1 WHERE ticket = ?', ticket);
    const matchedNow = await this.maybeMatch(ticket);
    if (!matchedNow) server.send(JSON.stringify(this.ticketResult(ticket)));
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'quadridge' } });
  }

  webSocketMessage(socket, message) {
    if (message === 'ping') socket.send('pong');
  }

  webSocketClose(socket) {
    const ticket = socket.deserializeAttachment()?.ticket;
    if (ticket) this.ctx.storage.sql.exec('UPDATE tickets SET connected = 0 WHERE ticket = ? AND status = ?', ticket, 'waiting');
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (key INTEGER PRIMARY KEY CHECK (key = 1), data TEXT NOT NULL)');
  }

  load() {
    const row = this.ctx.storage.sql.exec('SELECT data FROM room WHERE key = 1').toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }

  save(room) {
    this.ctx.storage.sql.exec('INSERT INTO room (key, data) VALUES (1, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data', JSON.stringify(room));
  }

  initialize(code, players) {
    if (this.load()) throw new Error('ルームIDが使用中です。');
    const room = { code, players, game: newGame(secureRandom), started: players.length === 2, createdAt: Date.now() };
    this.save(room);
  }

  join(displayName) {
    const room = this.load();
    if (!room) throw new Error('ルームが見つかりません。');
    if (room.players.length >= 2) throw new Error('ルームは満員です。');
    const player = newIdentity(displayName);
    room.players.push(player);
    room.started = true;
    this.save(room);
    this.broadcast(room);
    return publicSeat(room.code, player);
  }

  snapshot(room, playerId) {
    const index = room.players.findIndex(player => player.playerId === playerId);
    return {
      type: 'state', code: room.code, seat: index, started: room.started,
      players: room.players.map(player => ({
        playerId: player.playerId, displayName: player.displayName,
        connected: this.ctx.getWebSockets().some(socket => socket.readyState === 1 && socket.deserializeAttachment()?.playerId === player.playerId),
      })),
      board: room.game.board, turn: room.game.turn, moves: room.game.moves,
      winner: room.game.winner, draw: room.game.draw, extension: Boolean(room.game.extension), winningPath: room.game.winningPath,
      judgment: room.game.judgment || null,
      passedPlayers: room.game.passedPlayers,
      hand: room.game.players[index]?.hand || [],
    };
  }

  broadcast(room) {
    for (const socket of this.ctx.getWebSockets()) {
      const playerId = socket.deserializeAttachment()?.playerId;
      if (playerId && socket.readyState === 1) socket.send(JSON.stringify(this.snapshot(room, playerId)));
    }
  }

  async fetch(request) {
    const room = this.load();
    if (!room) return error('ルームが見つかりません。', 404);
    const token = request.headers.get('X-Seat-Token');
    const player = room.players.find(entry => entry.token === token);
    if (!player) return error('参加情報が正しくありません。', 401);
    for (const old of this.ctx.getWebSockets()) {
      if (old.deserializeAttachment()?.playerId === player.playerId) old.close(4000, '新しい接続に切り替えました');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: player.playerId });
    this.broadcast(room);
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'quadridge' } });
  }

  webSocketMessage(socket, message) {
    if (message === 'ping') { socket.send('pong'); return; }
    if (typeof message !== 'string' || message.length > 4096) { socket.send(JSON.stringify({ type: 'error', message: '操作が正しくありません。' })); return; }
    try {
      const action = JSON.parse(message);
      if (action?.type !== 'place') throw new Error('操作が正しくありません。');
      const room = this.load();
      const playerId = socket.deserializeAttachment()?.playerId;
      const seat = room?.players.findIndex(player => player.playerId === playerId);
      if (!room?.started || seat < 0) throw new Error('対戦を開始できません。');
      if (room.game.turn !== seat) throw new Error('相手の手番です。');
      const { slot, rotation, x, y } = action;
      if (![slot, rotation, x, y].every(Number.isInteger) || slot < 0 || slot > 2 || rotation < 0 || rotation > 3 || x < 0 || x >= 15 || y < 0 || y >= 15) {
        throw new Error('配置情報が正しくありません。');
      }
      room.game = play(room.game, slot, rotation, x, y, secureRandom);
      this.save(room);
      this.broadcast(room);
    } catch (caught) {
      socket.send(JSON.stringify({ type: 'error', message: caught instanceof Error ? caught.message : '操作に失敗しました。' }));
    }
  }

  webSocketClose() { const room = this.load(); if (room) this.broadcast(room); }
  webSocketError() { const room = this.load(); if (room) this.broadcast(room); }
}
