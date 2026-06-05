export interface Env {
  ROOM_DO: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

type MultiRoomPhase = "lobby" | "match";

type RoomPlayer = {
  playerId: string;
  displayName: string;
  ready: boolean;
  roleId: string | null;
  joinedAt: string;
  lastSeenAt: string;
};

type RoomState = {
  roomId: string;
  phase: MultiRoomPhase;
  seed: string;
  hostPlayerId: string | null;
  players: RoomPlayer[];
  log: string[];
  updatedAt: string;
};

type RoomEventMessage = {
  type: "ROOM_STATE_UPDATED";
  payload: RoomState;
};

const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
] as const;
const ROOM_STATE_STORAGE_KEY = "room-state";

function buildSecurityHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "accelerometer=(), autoplay=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return headers;
}

function createJsonResponse(payload: unknown, init?: ResponseInit) {
  const headers = buildSecurityHeaders(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}

function createTextResponse(body: string, init?: ResponseInit) {
  const headers = buildSecurityHeaders(init?.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, {
    ...init,
    headers
  });
}

function getAllowedOrigins(env: Env, request: Request) {
  const allowedOrigins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
  allowedOrigins.add(new URL(request.url).origin);

  if (!env.ALLOWED_ORIGINS) {
    return allowedOrigins;
  }

  for (const origin of env.ALLOWED_ORIGINS.split(",")) {
    const normalized = origin.trim();
    if (normalized.length > 0) {
      allowedOrigins.add(normalized);
    }
  }

  return allowedOrigins;
}

function isAllowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return false;
  }
  return getAllowedOrigins(env, request).has(origin);
}

function sanitizeDisplayName(value: unknown) {
  if (typeof value !== "string") {
    return "プレイヤー";
  }
  const normalized = value.trim().slice(0, 24);
  return normalized.length > 0 ? normalized : "プレイヤー";
}

function sanitizeSeed(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/[^0-9A-Za-z_-]/g, "").slice(0, 32);
}

function sanitizeDisplayNameStrict(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han} _-]/gu, "")
    .trim()
    .slice(0, 24);
  return normalized;
}

function appendRoomLog(state: RoomState, message: string) {
  state.log = [...state.log, message].slice(-80);
  state.updatedAt = new Date().toISOString();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return createJsonResponse({ ok: true, runtime: "worker" });
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})(?:\/(join|player|leave|start|ws))?$/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      if (!ROOM_ID_PATTERN.test(roomId)) {
        return createTextResponse("Invalid room id", { status: 400 });
      }
      const id = env.ROOM_DO.idFromName(roomId);
      return env.ROOM_DO.get(id).fetch(request);
    }

    return createTextResponse("Not Found", { status: 404 });
  }
};

export class RoomDurableObject {
  private sockets = new Set<WebSocket>();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.pathname.split("/")[2] ?? this.ctx.id.toString();
    const action = url.pathname.split("/")[3] ?? "";

    if (request.method === "GET" && action === "ws") {
      if (!isAllowedOrigin(request, this.env)) {
        return createTextResponse("Forbidden", { status: 403 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.sockets.add(server);
      server.addEventListener("close", () => {
        this.sockets.delete(server);
      });
      server.addEventListener("message", () => {
        // no-op for now
      });
      const state = await this.getState(roomId);
      server.send(JSON.stringify({ type: "ROOM_STATE_UPDATED", payload: state } satisfies RoomEventMessage));
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: buildSecurityHeaders()
      });
    }

    if (request.method === "GET" && !action) {
      return createJsonResponse(await this.getState(roomId));
    }

    if (request.method !== "POST") {
      return createTextResponse("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, POST" }
      });
    }

    if (!isAllowedOrigin(request, this.env)) {
      return createTextResponse("Forbidden", { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return createTextResponse("Invalid JSON", { status: 400 });
    }

    switch (action) {
      case "join":
        return createJsonResponse(await this.handleJoin(roomId, payload));
      case "player":
        return createJsonResponse(await this.handlePlayerUpdate(roomId, payload));
      case "leave":
        return createJsonResponse(await this.handleLeave(roomId, payload));
      case "start":
        return createJsonResponse(await this.handleStart(roomId, payload));
      default:
        return createTextResponse("Not Found", { status: 404 });
    }
  }

  private async getState(roomId: string) {
    const stored = await this.ctx.storage.get<RoomState>(ROOM_STATE_STORAGE_KEY);
    if (stored) {
      return stored;
    }
    const initialState: RoomState = {
      roomId,
      phase: "lobby",
      seed: "",
      hostPlayerId: null,
      players: [],
      log: [],
      updatedAt: new Date().toISOString()
    };
    await this.ctx.storage.put(ROOM_STATE_STORAGE_KEY, initialState);
    return initialState;
  }

  private async saveState(state: RoomState) {
    state.updatedAt = new Date().toISOString();
    await this.ctx.storage.put(ROOM_STATE_STORAGE_KEY, state);
    this.broadcastState(state);
    return state;
  }

  private broadcastState(state: RoomState) {
    const message = JSON.stringify({ type: "ROOM_STATE_UPDATED", payload: state } satisfies RoomEventMessage);
    for (const socket of [...this.sockets]) {
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private async handleJoin(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    if (!playerId) {
      throw new Error("playerId is required");
    }

    const state = await this.getState(roomId);
    const displayName = sanitizeDisplayNameStrict(payload.displayName);
    const seed = sanitizeSeed(payload.seed);
    const now = new Date().toISOString();
    const existing = state.players.find((player) => player.playerId === playerId);

    if (existing) {
      existing.displayName = displayName;
      existing.lastSeenAt = now;
    } else {
      state.players.push({
        playerId,
        displayName,
        ready: false,
        roleId: null,
        joinedAt: now,
        lastSeenAt: now
      });
      appendRoomLog(state, `${displayName} がルームに参加しました。`);
    }

    if (!state.hostPlayerId) {
      state.hostPlayerId = playerId;
      if (seed) {
        state.seed = seed;
      }
    }
    if (!state.seed) {
      state.seed = seed;
    }

    return this.saveState(state);
  }

  private async handlePlayerUpdate(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    if (!playerId) {
      throw new Error("playerId is required");
    }

    const state = await this.getState(roomId);
    const player = state.players.find((entry) => entry.playerId === playerId);
    if (!player) {
      throw new Error("player not found");
    }

    if (typeof payload.displayName === "string") {
      player.displayName = sanitizeDisplayNameStrict(payload.displayName);
    }
    if (typeof payload.ready === "boolean") {
      player.ready = payload.ready;
      appendRoomLog(state, `${player.displayName} が${payload.ready ? "準備完了" : "準備解除"}しました。`);
    }
    if (payload.roleId === null || typeof payload.roleId === "string") {
      player.roleId = payload.roleId;
    }
    if (playerId === state.hostPlayerId && typeof payload.seed === "string") {
      const seed = sanitizeSeed(payload.seed);
      if (seed) {
        state.seed = seed;
      }
    }
    player.lastSeenAt = new Date().toISOString();

    return this.saveState(state);
  }

  private async handleLeave(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    if (!playerId) {
      throw new Error("playerId is required");
    }

    const state = await this.getState(roomId);
    const leaving = state.players.find((entry) => entry.playerId === playerId);
    state.players = state.players.filter((entry) => entry.playerId !== playerId);
    if (leaving) {
      appendRoomLog(state, `${leaving.displayName} がルームから退出しました。`);
    }
    if (state.hostPlayerId === playerId) {
      state.hostPlayerId = state.players[0]?.playerId ?? null;
      if (state.hostPlayerId) {
        const nextHost = state.players.find((entry) => entry.playerId === state.hostPlayerId);
        if (nextHost) {
          appendRoomLog(state, `${nextHost.displayName} がホストになりました。`);
        }
      }
    }
    return this.saveState(state);
  }

  private async handleStart(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    if (!playerId) {
      throw new Error("playerId is required");
    }

    const state = await this.getState(roomId);
    if (state.hostPlayerId !== playerId) {
      throw new Error("only host can start");
    }
    if (state.players.length < 2) {
      throw new Error("at least two players are required");
    }
    if (state.players.some((player) => !player.ready)) {
      throw new Error("all players must be ready");
    }
    state.phase = "match";
    appendRoomLog(state, "マッチを開始しました。");
    return this.saveState(state);
  }
}
