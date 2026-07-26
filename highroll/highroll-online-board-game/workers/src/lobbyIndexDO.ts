import type { LobbySummary } from "../../src/shared/types";
import type { ClientMsg, ServerMsg } from "../../src/shared/protocol";
import { createSecurityHeaders, createTextResponse, isAllowedOrigin } from "./security";

type StoredLobbyIndex = {
  version: 1;
  lobbies: Record<string, (LobbySummary & { updatedAt: number }) | undefined>;
};

type MatchmakingTicket = {
  id: string;
  playerId: string;
  name: string;
  roleId?: string;
  deckId: string;
  createdAt: number;
};

type MatchmakingResult = {
  ticketId: string;
  playerId: string;
  playerName: string;
  status: "waiting" | "matched" | "not_found";
  matchId?: string;
  updatedAt: number;
};

type StoredMatchmaking = {
  version: 1;
  queue: MatchmakingTicket[];
  results: Record<string, MatchmakingResult | undefined>;
};

const jsonText = (value: unknown) => JSON.stringify(value);

const defaultIndex = (): StoredLobbyIndex => ({ version: 1, lobbies: {} });
const defaultMatchmaking = (): StoredMatchmaking => ({ version: 1, queue: [], results: {} });

const LOBBY_TTL_MS = 60 * 60 * 1000;
const MATCHMAKING_TTL_MS = 10 * 60 * 1000;

type Env = {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
};

type LobbySocketAttachment = {
  watchedTickets?: string[];
};

const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;
const isValidName = (name: string): boolean =>
  name.length > 0 && [...name].length <= NAME_MAX_LENGTH && NAME_REGEX.test(name);

const makeRoomId = (len = 8): string => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("").toUpperCase();
};

const makeTicketId = (): string => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      const fn = (crypto as unknown as { randomUUID?: () => string }).randomUUID;
      if (typeof fn === "function") return fn();
    }
  } catch {
    // noop
  }
  return makeRoomId(16);
};

const makePlayerId = (): string => `player-${makeRoomId(12)}`;

export class LobbyIndexDO implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly ctx: DurableObjectState;
  private sockets = new Set<WebSocket>();
  private watchersByTicket = new Map<string, Set<WebSocket>>();
  private watchedTicketsBySocket = new Map<WebSocket, Set<string>>();
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.ctx = state;
    this.env = env;

    for (const ws of this.ctx.getWebSockets()) {
      this.sockets.add(ws);
      const attachment = this.getSocketAttachment(ws);
      const watched = attachment.watchedTickets ?? [];
      watched.forEach((ticketId) => this.watchTicket(ws, ticketId));
    }
  }

  private getSocketAttachment(ws: WebSocket): LobbySocketAttachment {
    try {
      const raw = ws.deserializeAttachment();
      if (!raw || typeof raw !== "object") return {};
      return raw as LobbySocketAttachment;
    } catch {
      return {};
    }
  }

  private setSocketAttachment(ws: WebSocket, patch: Partial<LobbySocketAttachment>): void {
    const next = { ...this.getSocketAttachment(ws), ...patch };
    try {
      ws.serializeAttachment(next);
    } catch {
      // noop
    }
  }

  private async load(): Promise<StoredLobbyIndex> {
    const stored = await this.state.storage.get<StoredLobbyIndex>("index");
    if (!stored || stored.version !== 1) return defaultIndex();
    return stored;
  }

  private async save(index: StoredLobbyIndex): Promise<void> {
    await this.state.storage.put("index", index);
  }

  private async loadMatchmaking(): Promise<StoredMatchmaking> {
    const stored = await this.state.storage.get<StoredMatchmaking>("matchmaking");
    if (!stored || stored.version !== 1) return defaultMatchmaking();
    return stored;
  }

  private async saveMatchmaking(matchmaking: StoredMatchmaking): Promise<void> {
    await this.state.storage.put("matchmaking", matchmaking);
  }

  private normalizeSummary(summary: LobbySummary): LobbySummary {
    return {
      id: String(summary.id),
      name: String(summary.name),
      isPrivate: Boolean(summary.isPrivate),
      deckId: String(summary.deckId),
      playerCount: Number(summary.playerCount ?? 0),
      createdAt: Number(summary.createdAt ?? Date.now()),
    };
  }

  private async list(includePrivate: boolean): Promise<LobbySummary[]> {
    const index = await this.load();
    const now = Date.now();
    let pruned = false;

    Object.entries(index.lobbies).forEach(([id, entry]) => {
      if (!entry) return;
      const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : entry.updatedAt;
      if (now - createdAt > LOBBY_TTL_MS) {
        delete index.lobbies[id];
        pruned = true;
      }
    });

    if (pruned) {
      await this.save(index);
    }

    return Object.values(index.lobbies)
      .filter((entry): entry is LobbySummary & { updatedAt: number } => Boolean(entry))
      .filter((entry) => includePrivate || !entry.isPrivate)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ updatedAt: _updatedAt, ...summary }) => summary);
  }

  private safeSend(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(jsonText(msg));
    } catch {
      // noop
    }
  }

  private broadcast(msg: ServerMsg): void {
    for (const ws of this.sockets) this.safeSend(ws, msg);
  }

  private async broadcastList(): Promise<void> {
    const lobbies = await this.list(true);
    this.broadcast({ t: "lobbies", lobbies });
  }

  private watchTicket(ws: WebSocket, ticketId: string): void {
    const normalized = String(ticketId ?? "").trim();
    if (!normalized) return;

    let watchers = this.watchersByTicket.get(normalized);
    if (!watchers) {
      watchers = new Set<WebSocket>();
      this.watchersByTicket.set(normalized, watchers);
    }
    watchers.add(ws);

    let tickets = this.watchedTicketsBySocket.get(ws);
    if (!tickets) {
      tickets = new Set<string>();
      this.watchedTicketsBySocket.set(ws, tickets);
    }
    tickets.add(normalized);
    this.setSocketAttachment(ws, { watchedTickets: Array.from(tickets) });
  }

  private unwatchAll(ws: WebSocket): void {
    const tickets = this.watchedTicketsBySocket.get(ws);
    this.watchedTicketsBySocket.delete(ws);
    this.setSocketAttachment(ws, { watchedTickets: [] });
    if (!tickets) return;

    for (const ticketId of tickets) {
      const watchers = this.watchersByTicket.get(ticketId);
      if (!watchers) continue;
      watchers.delete(ws);
      if (watchers.size === 0) {
        this.watchersByTicket.delete(ticketId);
      }
    }
  }

  private safeSendTicketStatus(ticketId: string, result: MatchmakingResult): void {
    const watchers = this.watchersByTicket.get(ticketId);
    if (!watchers) return;

    const msg: ServerMsg = {
      t: "matchmakingStatus",
      ticketId,
      status: result.status,
      matchId: result.matchId,
      playerId: result.playerId,
      playerName: result.playerName,
    };

    for (const ws of watchers) {
      this.safeSend(ws, msg);
    }
  }

  private safeSendTicketError(ticketId: string, message: string): void {
    const watchers = this.watchersByTicket.get(ticketId);
    if (!watchers) return;
    for (const ws of watchers) {
      this.safeSend(ws, { t: "error", message });
    }
  }

  private resolveTicketStatus(matchmaking: StoredMatchmaking, ticketId: string): MatchmakingResult {
    const known = matchmaking.results[ticketId];
    if (known) return known;

    const queued = matchmaking.queue.find((t) => t.id === ticketId);
    if (queued) {
      return {
        ticketId,
        playerId: queued.playerId,
        playerName: queued.name,
        status: "waiting",
        updatedAt: Date.now(),
      };
    }

    return {
      ticketId,
      playerId: "",
      playerName: "",
      status: "not_found",
      updatedAt: Date.now(),
    };
  }

  private pruneMatchmaking(matchmaking: StoredMatchmaking): boolean {
    const now = Date.now();
    let changed = false;

    const beforeQueue = matchmaking.queue.length;
    matchmaking.queue = matchmaking.queue.filter((t) => now - t.createdAt <= MATCHMAKING_TTL_MS);
    if (matchmaking.queue.length !== beforeQueue) changed = true;

    Object.entries(matchmaking.results).forEach(([ticketId, result]) => {
      if (!result) return;
      if (now - result.updatedAt > MATCHMAKING_TTL_MS) {
        delete matchmaking.results[ticketId];
        changed = true;
      }
    });

    return changed;
  }

  private async tryMatchmaking(matchmaking: StoredMatchmaking): Promise<void> {
    while (matchmaking.queue.length >= 2) {
      const a = matchmaking.queue.shift();
      const b = matchmaking.queue.shift();
      if (!a || !b) break;

      const matchId = makeRoomId(8);
      const deckId = (a.deckId || b.deckId || "default_60").trim() || "default_60";

      const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(matchId));
      const initRes = await stub.fetch(
        `https://rooms/init?roomId=${encodeURIComponent(matchId)}&start=1`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            deckId,
            players: [
              { name: a.name, roleId: a.roleId, playerId: a.playerId },
              { name: b.name, roleId: b.roleId, playerId: b.playerId },
            ],
          }),
        }
      );

      if (!initRes.ok) {
        const message = (await initRes.text().catch(() => "")) || "Failed to create match.";
        const errA: MatchmakingResult = {
          ticketId: a.id,
          playerId: a.playerId,
          playerName: a.name,
          status: "not_found",
          updatedAt: Date.now(),
        };
        const errB: MatchmakingResult = {
          ticketId: b.id,
          playerId: b.playerId,
          playerName: b.name,
          status: "not_found",
          updatedAt: Date.now(),
        };
        matchmaking.results[a.id] = errA;
        matchmaking.results[b.id] = errB;
        this.safeSendTicketError(a.id, message);
        this.safeSendTicketError(b.id, message);
        this.safeSendTicketStatus(a.id, errA);
        this.safeSendTicketStatus(b.id, errB);
        continue;
      }

      const resultA: MatchmakingResult = {
        ticketId: a.id,
        playerId: a.playerId,
        playerName: a.name,
        status: "matched",
        matchId,
        updatedAt: Date.now(),
      };
      const resultB: MatchmakingResult = {
        ticketId: b.id,
        playerId: b.playerId,
        playerName: b.name,
        status: "matched",
        matchId,
        updatedAt: Date.now(),
      };
      matchmaking.results[a.id] = resultA;
      matchmaking.results[b.id] = resultB;
      this.safeSendTicketStatus(a.id, resultA);
      this.safeSendTicketStatus(b.id, resultB);
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);

    let msg: ClientMsg | null = null;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.safeSend(ws, { t: "error", message: "Invalid JSON." });
      return;
    }

    if (msg?.t === "ping") {
      this.safeSend(ws, { t: "pong" });
      return;
    }

    if (msg?.t !== "action") {
      return;
    }

    const payload = (msg as any).payload as unknown;
    await this.handleSocketAction(ws, payload);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    console.log("[LobbyIndexDO] ws close", { code, reason });
    this.sockets.delete(ws);
    this.unwatchAll(ws);
  }

  webSocketError(_ws: WebSocket, _error: unknown): void {
    console.log("[LobbyIndexDO] ws error");
  }

  private async handleSocketAction(ws: WebSocket, payload: unknown): Promise<void> {
    if (!payload || typeof payload !== "object") {
      this.safeSend(ws, { t: "error", message: "action.payload is invalid." });
      return;
    }

    const action = payload as any;

    if (action.k === "matchmaking/watch") {
      const ticketId = String(action.ticketId ?? "").trim();
      if (!ticketId) {
        this.safeSend(ws, { t: "error", message: "ticketId is required." });
        return;
      }
      this.watchTicket(ws, ticketId);
      const matchmaking = await this.loadMatchmaking();
      const pruned = this.pruneMatchmaking(matchmaking);
      if (pruned) await this.saveMatchmaking(matchmaking);
      const status = this.resolveTicketStatus(matchmaking, ticketId);
      this.safeSend(ws, {
        t: "matchmakingStatus",
        ticketId,
        status: status.status,
        matchId: status.matchId,
        playerId: status.playerId || undefined,
        playerName: status.playerName || undefined,
      });
      return;
    }

    if (action.k === "matchmaking/cancel") {
      const ticketId = String(action.ticketId ?? "").trim();
      if (!ticketId) {
        this.safeSend(ws, { t: "error", message: "ticketId is required." });
        return;
      }
      this.watchTicket(ws, ticketId);
      const matchmaking = await this.loadMatchmaking();
      const before = matchmaking.queue.length;
      matchmaking.queue = matchmaking.queue.filter((t) => t.id !== ticketId);
      if (matchmaking.queue.length !== before) {
        matchmaking.results[ticketId] = {
          ticketId,
          playerId: "",
          playerName: "",
          status: "not_found",
          updatedAt: Date.now(),
        };
        await this.saveMatchmaking(matchmaking);
      }
      const status = this.resolveTicketStatus(matchmaking, ticketId);
      this.safeSendTicketStatus(ticketId, status);
      return;
    }

    if (action.k === "matchmaking/enqueue") {
      const name = String(action.name ?? "").trim();
      const roleId = action.roleId ? String(action.roleId).trim() : undefined;
      const deckId = String(action.deckId ?? "default_60").trim() || "default_60";

      if (!isValidName(name)) {
        this.safeSend(ws, {
          t: "error",
          message: "Name must be up to 8 chars and only letters/numbers/Japanese.",
        });
        return;
      }

      const ticketId = makeTicketId();
      const ticket: MatchmakingTicket = {
        id: ticketId,
        playerId: makePlayerId(),
        name,
        roleId,
        deckId,
        createdAt: Date.now(),
      };

      const matchmaking = await this.loadMatchmaking();
      matchmaking.queue.push(ticket);
      matchmaking.results[ticketId] = {
        ticketId,
        playerId: ticket.playerId,
        playerName: ticket.name,
        status: "waiting",
        updatedAt: Date.now(),
      };
      this.pruneMatchmaking(matchmaking);
      await this.tryMatchmaking(matchmaking);
      await this.saveMatchmaking(matchmaking);

      this.watchTicket(ws, ticketId);
      this.safeSend(ws, { t: "matchmakingTicket", ticketId });
      this.safeSendTicketStatus(ticketId, this.resolveTicketStatus(matchmaking, ticketId));
      return;
    }

    if (action.k === "matches/soloCpu") {
      const name = String(action.name ?? "").trim();
      const roleId = String(action.roleId ?? "").trim();
      const deckId = String(action.deckId ?? "default_60").trim() || "default_60";
      const cpuLevel = action.cpuLevel ? String(action.cpuLevel).trim() : undefined;

      if (name && !isValidName(name)) {
        this.safeSend(ws, {
          t: "error",
          message: "Player name must be up to 8 chars and only letters/numbers/Japanese.",
        });
        return;
      }
      if (!roleId) {
        this.safeSend(ws, { t: "error", message: "roleId is required." });
        return;
      }

      const matchId = makeRoomId(8);
      const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(matchId));
      const res = await stub.fetch(`https://rooms/solo?roomId=${encodeURIComponent(matchId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckId, name: name || "Player", roleId, cpuLevel }),
      });
      const text = await res.text();
      if (!res.ok) {
        this.safeSend(ws, { t: "error", message: text || "Failed to create solo match." });
        return;
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.safeSend(ws, { t: "error", message: "Failed to create solo match (invalid response)." });
        return;
      }
      const playerId = String(parsed?.playerId ?? "");
      if (!playerId) {
        this.safeSend(ws, { t: "error", message: "Failed to create solo match (playerId missing)." });
        return;
      }

      this.safeSend(ws, { t: "soloMatchCreated", matchId, playerId, playerName: name || "Player" });
      return;
    }

    if (action.k !== "lobbies/create") {
      this.safeSend(ws, { t: "error", message: `unsupported action: ${String(action.k ?? "")}` });
      return;
    }

    const deckId = String(action.deckId ?? "default_60").trim() || "default_60";
    const lobbyName = String(action.lobbyName ?? "").trim();
    const ownerName = String(action.ownerName ?? "").trim();
    const password = String(action.password ?? "").trim() || undefined;
    const roleId = action.roleId ? String(action.roleId).trim() : "";

    if (!isValidName(ownerName)) {
      this.safeSend(ws, {
        t: "error",
        message: "Name must be up to 8 chars and only letters/numbers/Japanese.",
      });
      return;
    }
    if (lobbyName && !isValidName(lobbyName)) {
      this.safeSend(ws, {
        t: "error",
        message: "Lobby name must be up to 8 chars and only letters/numbers/Japanese.",
      });
      return;
    }

    const lobbyId = makeRoomId(8);
    const stub = this.env.ROOMS.get(this.env.ROOMS.idFromName(lobbyId));
    const initRes = await stub.fetch(`https://rooms/lobby/init?roomId=${encodeURIComponent(lobbyId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deckId, lobbyName, ownerName, password }),
    });
    const initText = await initRes.text();
    if (!initRes.ok) {
      this.safeSend(ws, { t: "error", message: initText || "Failed to create lobby." });
      return;
    }

    let initParsed: any = null;
    try {
      initParsed = JSON.parse(initText);
    } catch {
      this.safeSend(ws, { t: "error", message: "Failed to create lobby (invalid response)." });
      return;
    }

    const ownerPlayerId = String(initParsed?.ownerPlayerId ?? "");
    if (!ownerPlayerId) {
      this.safeSend(ws, { t: "error", message: "ownerPlayerId was not returned." });
      return;
    }

    if (roleId) {
      await stub
        .fetch(`https://rooms/lobby/role?roomId=${encodeURIComponent(lobbyId)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerId: ownerPlayerId, roleId }),
        })
        .catch(() => null);
    }

    const lobby = initParsed?.lobby ?? null;
    if (lobby && typeof lobby === "object") {
      const summary = this.normalizeSummary({
        id: String(lobby.id ?? lobbyId),
        name: String(lobby.name ?? lobbyId),
        isPrivate: Boolean(lobby.isPrivate),
        deckId: String(lobby.deckId ?? deckId),
        playerCount: Array.isArray(lobby.players) ? lobby.players.length : 1,
        createdAt: Number(lobby.createdAt ?? Date.now()),
      });
      const index = await this.load();
      index.lobbies[lobbyId] = { ...summary, updatedAt: Date.now() };
      await this.save(index);
    }

    await this.broadcastList().catch(() => null);
    this.safeSend(ws, { t: "lobbyCreated", lobbyId, ownerPlayerId });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/list" && request.method === "GET") {
      const includePrivate = url.searchParams.get("includePrivate") !== "0";
      const lobbies = await this.list(includePrivate);
      return new Response(jsonText({ lobbies }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/upsert" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { lobby?: LobbySummary } | null;
      if (!body?.lobby) {
        return new Response(jsonText({ message: "lobby is required" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      const now = Date.now();
      const lobby = this.normalizeSummary(body.lobby);
      if (now - lobby.createdAt > LOBBY_TTL_MS) {
        return new Response(jsonText({ ok: true, skipped: "expired" }), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      const index = await this.load();
      index.lobbies[lobby.id] = { ...lobby, updatedAt: now };
      await this.save(index);
      await this.broadcastList().catch(() => null);
      return new Response(jsonText({ ok: true }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/remove" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { id?: string } | null;
      const id = String(body?.id ?? "");
      if (!id) {
        return new Response(jsonText({ message: "id is required" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      const index = await this.load();
      delete index.lobbies[id];
      await this.save(index);
      await this.broadcastList().catch(() => null);
      return new Response(jsonText({ ok: true }), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return createTextResponse("Expected websocket", { status: 400 });
      }
      if (!isAllowedOrigin(request.headers.get("Origin"), this.env)) {
        return createTextResponse("Forbidden", { status: 403 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      this.ctx.acceptWebSocket(server);
      this.sockets.add(server);
      this.setSocketAttachment(server, { watchedTickets: [] });

      this.safeSend(server, { t: "lobbies", lobbies: await this.list(true) });
      return new Response(null, { status: 101, webSocket: client, headers: createSecurityHeaders() });
    }

    return new Response(jsonText({ message: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}
