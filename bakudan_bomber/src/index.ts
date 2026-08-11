import { DurableObject } from "cloudflare:workers";

type CardKey = "bomb" | "chain" | "double" | "igniteBomb" | "fuse" | "flint" | "heal" | "extinguisher" | "watch" | "think";
type Card = { id: string; key: CardKey };
type Bomb = { id: string; key: "bomb" | "chain" | "double" | "igniteBomb"; fuses: number; lit: boolean; card: Card };
type Player = { id: string; name: string; connected: boolean; joinedAt: number; life: number; hand: Card[]; bombs: Bomb[]; isAlive: boolean };
type GameState = { deck: Card[]; discard: Card[]; currentPlayerId: string; round: number; turns: number; log: string[]; winnerId: string | null; roundEvent: string | null; phase: "choose" | "draw-use" | "use-two-second" };
type RoomState = { roomCode: string; hostId: string; status: "waiting" | "playing" | "finished"; players: Player[]; game: GameState | null; mode: "online" | "solo-test"; testControllerId?: string };
type Play = { cardId: string; targetPlayerId?: string; targetBombId?: string; position?: number };
type ClientMessage =
  | { type: "join"; playerId: string; name: string }
  | { type: "start"; playerId: string }
  | { type: "action"; playerId: string; mode: "drawTwo" | "discardDraw" | "useDraw" | "drawUse" | "finishDrawUse" | "useTwoFirst" | "useTwoSecond"; discardCardId?: string; plays?: Play[] };

const MAX_HAND = 7;
const PLAYER_ID_PATTERN = /^[a-f0-9-]{36}$/;
const BOMB_KEYS: CardKey[] = ["bomb", "chain", "double", "igniteBomb"];
const CARD_COUNTS: Record<CardKey, number> = { bomb: 18, chain: 5, double: 5, igniteBomb: 5, fuse: 22, flint: 12, heal: 7, extinguisher: 7, watch: 5, think: 6 };
const CARD_NAMES: Record<CardKey, string> = { bomb: "ばくだん", chain: "れんさぼむ", double: "だぶるぼむ", igniteBomb: "ちゃっかだん", fuse: "どうかせん", flint: "ひうちいし", heal: "おうきゅうしょち", extinguisher: "しょうかき", watch: "ぼうかん", think: "ちょっとかんがえる" };
const ROUND_EVENTS = ["全員着火", "スワップ", "ライブラリメテオ", "薄れる記憶", "ひょっこりぼむ", "大逆転", "綿密な調整"] as const;

function jsonError(message: string, status = 400): Response { return Response.json({ error: message }, { status }); }
function randomCode(): string { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from(crypto.getRandomValues(new Uint8Array(6)), value => chars[value % chars.length]).join(""); }
function randomId(): string { return crypto.randomUUID(); }
function shuffle<T>(values: T[]): T[] {
  const bytes = new Uint32Array(values.length); crypto.getRandomValues(bytes);
  for (let i = values.length - 1; i > 0; i--) { const j = bytes[i] % (i + 1); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}
function newDeck(): Card[] { return shuffle(Object.entries(CARD_COUNTS).flatMap(([key, count]) => Array.from({ length: count }, () => ({ id: randomId(), key: key as CardKey })))); }

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)"); });
  }

  async initialize(roomCode: string): Promise<void> {
    if (!this.read()) this.write({ roomCode, hostId: "", status: "waiting", players: [], game: null, mode: "online" });
  }

  async initializeSolo(roomCode: string, controllerId: string): Promise<void> {
    if (this.read()) return;
    if (!PLAYER_ID_PATTERN.test(controllerId)) throw new Error("プレイヤー情報が正しくありません。");
    const deck = newDeck();
    const players: Player[] = Array.from({ length: 5 }, (_, index) => ({ id: `test-${index + 1}`, name: `プレイヤー${index + 1}`, connected: true, joinedAt: Date.now() + index, life: 5, hand: deck.splice(-5), bombs: [], isAlive: true }));
    this.write({ roomCode, hostId: controllerId, status: "playing", players, mode: "solo-test", testControllerId: controllerId, game: { deck, discard: [], currentPlayerId: players[0].id, round: 1, turns: 0, log: ["1人テストを開始しました。"], winnerId: null, roundEvent: null, phase: "choose" } });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return jsonError("WebSocket接続が必要です。", 426);
    const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      if (text.length > 8192) throw new Error("メッセージが大きすぎます。");
      const message = JSON.parse(text) as ClientMessage;
      if (message.type === "join") this.join(socket, message.playerId, message.name);
      else if (message.type === "start") this.start(message.playerId);
      else if (message.type === "action") this.action(message);
      else throw new Error("未対応の操作です。");
    } catch (error) { socket.send(JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "操作に失敗しました。" })); }
  }

  async webSocketClose(socket: WebSocket): Promise<void> { this.disconnect(socket); }
  async webSocketError(socket: WebSocket): Promise<void> { this.disconnect(socket); }

  private join(socket: WebSocket, playerId: string, rawName: string): void {
    if (!PLAYER_ID_PATTERN.test(playerId)) throw new Error("プレイヤー情報が正しくありません。");
    const name = rawName.trim().slice(0, 16); if (!name) throw new Error("名前を入力してください。");
    const state = this.required(); let player = state.players.find(item => item.id === playerId);
    if (state.mode === "solo-test") {
      if (state.testControllerId !== playerId) throw new Error("このテストルームには参加できません。");
      socket.serializeAttachment({ playerId }); this.broadcast(state); return;
    }
    if (!player) {
      if (state.status !== "waiting") throw new Error("ゲームはすでに始まっています。");
      if (state.players.length >= 5) throw new Error("このルームは満員です。");
      player = { id: playerId, name, connected: true, joinedAt: Date.now(), life: 5, hand: [], bombs: [], isAlive: true };
      state.players.push(player); if (!state.hostId) state.hostId = playerId;
    } else { player.name = name; player.connected = true; }
    socket.serializeAttachment({ playerId }); this.write(state); this.broadcast(state);
  }

  private start(playerId: string): void {
    const state = this.required();
    if (state.hostId !== playerId) throw new Error("ルームを作った人だけが開始できます。");
    if (state.status !== "waiting") throw new Error("すでに開始しています。");
    if (state.players.filter(player => player.connected).length < 2) throw new Error("2人以上の参加が必要です。");
    state.players = state.players.filter(player => player.connected);
    const deck = newDeck();
    for (const player of state.players) { player.life = 5; player.isAlive = true; player.bombs = []; player.hand = deck.splice(-5); }
    const first = crypto.getRandomValues(new Uint32Array(1))[0] % state.players.length;
    state.game = { deck, discard: [], currentPlayerId: state.players[first].id, round: 1, turns: 0, log: [`${state.players[first].name}からゲーム開始！`], winnerId: null, roundEvent: null, phase: "choose" };
    state.status = "playing"; this.write(state); this.broadcast(state);
  }

  private action(message: Extract<ClientMessage, { type: "action" }>): void {
    const state = this.required(); const game = state.game;
    if (state.status !== "playing" || !game) throw new Error("ゲームは進行中ではありません。");
    const player = state.mode === "solo-test" && state.testControllerId === message.playerId ? state.players.find(item => item.id === game.currentPlayerId) : state.players.find(item => item.id === message.playerId);
    if (!player || game.currentPlayerId !== player.id || !player.isAlive) throw new Error("あなたの手番ではありません。");
    if (message.mode === "finishDrawUse") {
      if (game.phase !== "draw-use") throw new Error("カードを使用する段階ではありません。");
      this.play(state, player, this.singlePlay(message)); game.phase = "choose"; this.endTurn(state); return;
    }
    if (message.mode === "useTwoSecond") {
      if (game.phase !== "use-two-second") throw new Error("2枚目を使用する段階ではありません。");
      this.play(state, player, this.singlePlay(message)); game.phase = "choose"; this.endTurn(state); return;
    }
    if (game.phase !== "choose") throw new Error("引いたカードから1枚使用してください。");
    if (message.mode === "drawTwo") { this.draw(game, player, 2); game.log.unshift(`${player.name}が2枚引いた。`); }
    else if (message.mode === "discardDraw") {
      const index = player.hand.findIndex(card => card.id === message.discardCardId); if (index < 0) throw new Error("捨てるカードが見つかりません。");
      game.discard.push(player.hand.splice(index, 1)[0]); this.draw(game, player, 1); game.log.unshift(`${player.name}が1枚捨てて1枚引いた。`);
    } else if (message.mode === "useDraw") { this.play(state, player, this.singlePlay(message)); this.draw(game, player, 1); }
    else if (message.mode === "drawUse") { this.draw(game, player, 1); game.phase = "draw-use"; game.log.unshift(`${player.name}が1枚引いた。カードを1枚使用する。`); this.write(state); this.broadcast(state); return; }
    else if (message.mode === "useTwoFirst") { this.play(state, player, this.singlePlay(message)); game.phase = "use-two-second"; game.log.unshift(`${player.name}が1枚目を使用した。2枚目を選ぶ。`); this.write(state); this.broadcast(state); return; }
    else throw new Error("未対応の行動です。");
    this.endTurn(state);
  }

  private singlePlay(message: Extract<ClientMessage, { type: "action" }>): Play { if (message.plays?.length !== 1) throw new Error("使用するカードを1枚選んでください。"); return message.plays[0]; }

  private play(state: RoomState, player: Player, play: Play): void {
    const game = state.game!; const cardIndex = player.hand.findIndex(card => card.id === play.cardId);
    if (cardIndex < 0) throw new Error("カードが手札にありません。");
    const card = player.hand[cardIndex]; const targetPlayer = state.players.find(item => item.id === play.targetPlayerId);
    let used = true; let removed = false;
    if (BOMB_KEYS.includes(card.key)) {
      if (!targetPlayer?.isAlive) throw new Error("配置先を選んでください。");
      const position = Math.max(0, Math.min(play.position ?? targetPlayer.bombs.length, targetPlayer.bombs.length));
      const bomb: Bomb = { id: randomId(), key: card.key as Bomb["key"], fuses: card.key === "igniteBomb" ? 1 : 0, lit: card.key === "igniteBomb", card };
      targetPlayer.bombs.splice(position, 0, bomb);
    } else if (card.key === "fuse" || card.key === "flint" || card.key === "extinguisher") {
      const located = this.findBomb(state, play.targetBombId);
      if (!located) throw new Error("対象の爆弾を選んでください。");
      if (card.key === "fuse") located.bomb.fuses++;
      if (card.key === "flint") { if (located.bomb.lit) throw new Error("すでに着火しています。"); located.bomb.lit = true; }
      if (card.key === "extinguisher") { if (!located.bomb.lit) throw new Error("着火中の爆弾を選んでください。"); located.bomb.lit = false; }
    } else if (card.key === "heal") {
      if (!targetPlayer?.isAlive || targetPlayer.life >= 5) throw new Error("回復できるプレイヤーを選んでください。"); targetPlayer.life++;
    } else if (card.key === "think") { player.hand.splice(cardIndex, 1); removed = true; this.draw(game, player, 1); }
    else if (card.key !== "watch") used = false;
    if (!used) throw new Error("このカードはまだ使用できません。");
    if (!removed) player.hand.splice(cardIndex, 1); if (!BOMB_KEYS.includes(card.key)) game.discard.push(card);
    game.log.unshift(`${player.name}が「${CARD_NAMES[card.key]}」を使った。`);
  }

  private findBomb(state: RoomState, id?: string): { owner: Player; bomb: Bomb } | null {
    if (!id) return null; for (const owner of state.players) { const bomb = owner.bombs.find(item => item.id === id); if (bomb) return { owner, bomb }; } return null;
  }

  private draw(game: GameState, player: Player, count: number): void {
    if (player.hand.length + count > MAX_HAND) throw new Error("手札上限を超えるため引けません。");
    if (game.deck.length < count) throw new Error("山札が足りません。");
    player.hand.push(...game.deck.splice(-count));
  }

  private endTurn(state: RoomState): void {
    const game = state.game!;
    const owner = state.players.find(player => player.id === game.currentPlayerId);
    if (owner) {
      const burning = owner.bombs.filter(bomb => bomb.lit).map(bomb => bomb.id);
      for (const id of burning) {
        const index = owner.bombs.findIndex(bomb => bomb.id === id); if (index < 0) continue;
        const bomb = owner.bombs[index];
        if (bomb.fuses > 0) { bomb.fuses--; game.discard.push({ id: randomId(), key: "fuse" }); }
        else this.explode(state, owner, index);
      }
    }
    for (const player of state.players) if (player.isAlive && player.life <= 0) { player.isAlive = false; game.log.unshift(`${player.name}は敗北した。`); }
    const alive = state.players.filter(player => player.isAlive);
    if (alive.length <= 1) { state.status = "finished"; game.winnerId = alive[0]?.id ?? null; if (alive[0]) game.log.unshift(`${alive[0].name}の勝利！`); this.write(state); this.broadcast(state); return; }
    const currentIndex = state.players.findIndex(player => player.id === game.currentPlayerId);
    let next = currentIndex; do next = (next + 1) % state.players.length; while (!state.players[next].isAlive);
    game.currentPlayerId = state.players[next].id; game.turns++;
    if (game.turns >= alive.length) {
      game.round++; game.turns = 0;
      this.applyRoundEvent(state, alive);
      game.log.unshift(`ラウンド${game.round}開始。`);
    }
    game.log = game.log.slice(0, 30); this.write(state); this.broadcast(state);
  }

  private applyRoundEvent(state: RoomState, alive: Player[]): void {
    const game = state.game!;
    const event = ROUND_EVENTS[crypto.getRandomValues(new Uint32Array(1))[0] % ROUND_EVENTS.length];
    game.roundEvent = event;
    if (event === "全員着火") {
      for (const player of alive) for (const bomb of player.bombs) bomb.lit = true;
    } else if (event === "スワップ") {
      const bombs = alive.map(player => player.bombs);
      alive.forEach((player, index) => { player.bombs = bombs[(index - 1 + alive.length) % alive.length]; });
    } else if (event === "ライブラリメテオ") {
      for (const player of alive) this.drawAvailable(game, player, 3);
    } else if (event === "薄れる記憶") {
      for (const player of alive) {
        const count = Math.min(2, player.hand.length);
        for (let i = 0; i < count; i++) {
          const index = crypto.getRandomValues(new Uint32Array(1))[0] % player.hand.length;
          game.discard.push(player.hand.splice(index, 1)[0]);
        }
      }
    } else if (event === "ひょっこりぼむ") {
      for (const player of alive) this.addNormalBomb(player);
    } else if (event === "大逆転") {
      for (const player of alive) for (let i = 0; i < player.life; i++) this.addNormalBomb(player);
    } else {
      const lowestLife = Math.min(...alive.map(player => player.life));
      for (const player of alive.filter(item => item.life === lowestLife)) this.drawAvailable(game, player, MAX_HAND - player.hand.length);
    }
    game.log.unshift(`ラウンドイベント「${event}」が発生！`);
  }

  private drawAvailable(game: GameState, player: Player, requested: number): number {
    const count = Math.min(requested, MAX_HAND - player.hand.length, game.deck.length);
    if (count > 0) player.hand.push(...game.deck.splice(-count));
    return count;
  }

  private addNormalBomb(player: Player): void {
    const card: Card = { id: randomId(), key: "bomb" };
    player.bombs.push({ id: randomId(), key: "bomb", fuses: 0, lit: false, card });
  }

  private explode(state: RoomState, owner: Player, index: number): void {
    const game = state.game!; const bomb = owner.bombs[index]; if (!bomb) return;
    const adjacent = [owner.bombs[index - 1], owner.bombs[index + 1]].filter(Boolean);
    const damage = bomb.key === "double" ? 2 : 1; owner.life = Math.max(0, owner.life - damage);
    game.discard.push(bomb.card, ...Array.from({ length: bomb.fuses }, () => ({ id: randomId(), key: "fuse" as const })));
    owner.bombs.splice(index, 1); game.log.unshift(`${owner.name}の爆弾が爆発！ ${damage}通常ダメージ。`);
    for (const next of adjacent) if (next.key === "chain") { const nextIndex = owner.bombs.findIndex(item => item.id === next.id); if (nextIndex >= 0) this.explode(state, owner, nextIndex); }
  }

  private disconnect(socket: WebSocket): void {
    const playerId = (socket.deserializeAttachment() as { playerId?: string } | null)?.playerId; if (!playerId) return;
    const state = this.read(); if (!state) return; if (state.mode === "solo-test") return; const player = state.players.find(item => item.id === playerId); if (player) player.connected = false;
    this.write(state); this.broadcast(state);
  }

  private publicState(state: RoomState, viewerId: string) {
    const viewerPlayerId = state.mode === "solo-test" && state.testControllerId === viewerId ? state.game?.currentPlayerId ?? "" : viewerId;
    return { roomCode: state.roomCode, hostId: state.hostId, status: state.status, mode: state.mode, viewerPlayerId, players: state.players.map(player => ({ id: player.id, name: player.name, connected: player.connected, life: player.life, isAlive: player.isAlive, handCount: player.hand.length, bombs: player.bombs.map(({ card: _card, ...bomb }) => bomb) })), game: state.game ? { deckCount: state.game.deck.length, discardCount: state.game.discard.length, discard: state.game.discard.map(card => card.key), currentPlayerId: state.game.currentPlayerId, round: state.game.round, roundEvent: state.game.roundEvent, log: state.game.log, winnerId: state.game.winnerId, phase: state.game.phase, hand: state.players.find(player => player.id === viewerPlayerId)?.hand ?? [] } : null };
  }

  private broadcast(state: RoomState): void {
    for (const socket of this.ctx.getWebSockets()) { try { const playerId = (socket.deserializeAttachment() as { playerId?: string } | null)?.playerId ?? ""; socket.send(JSON.stringify({ type: "room", room: this.publicState(state, playerId) })); } catch (error) { console.error(JSON.stringify({ message: "websocket_send_failed", error: String(error) })); } }
  }
  private read(): RoomState | null { const row = this.ctx.storage.sql.exec<{ json: string }>("SELECT json FROM room_state WHERE id = 1").toArray()[0]; if (!row) return null; const state = JSON.parse(row.json) as RoomState; state.game ??= null; if (state.game) state.game.roundEvent ??= null; state.mode ??= "online"; for (const player of state.players) { player.life ??= 5; player.hand ??= []; player.bombs ??= []; player.isAlive ??= true; } return state; }
  private required(): RoomState { const state = this.read(); if (!state) throw new Error("ルームが見つかりません。"); return state; }
  private write(state: RoomState): void { this.ctx.storage.sql.exec("INSERT OR REPLACE INTO room_state (id, json) VALUES (1, ?)", JSON.stringify(state)); }
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "POST" && url.pathname === "/api/rooms") { const roomCode = randomCode(); await env.GAME_ROOMS.getByName(roomCode).initialize(roomCode); return Response.json({ roomCode }, { status: 201 }); }
  if (request.method === "POST" && url.pathname === "/api/test-rooms") { const body = await request.json<{ playerId?: string }>(); if (!body.playerId) return jsonError("プレイヤー情報が必要です。"); const roomCode = randomCode(); await env.GAME_ROOMS.getByName(roomCode).initializeSolo(roomCode, body.playerId); return Response.json({ roomCode }, { status: 201 }); }
  const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/connect$/);
  if (request.method === "GET" && match) { const room = env.GAME_ROOMS.getByName(match[1]); await room.initialize(match[1]); return room.fetch(request); }
  return jsonError("APIが見つかりません。", 404);
}

export default { async fetch(request: Request, env: Env): Promise<Response> { const url = new URL(request.url); try { if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url); return await env.ASSETS.fetch(request); } catch (error) { console.error(JSON.stringify({ message: "request_failed", path: url.pathname, error: String(error) })); return jsonError("サーバーでエラーが発生しました。", 500); } } } satisfies ExportedHandler<Env>;
