import {
  applyAiRoundDecision,
  applyMulliganOnly,
  chooseRoundBuff,
  createLocalGame,
  finalizeRound,
  planAiRound,
  rerollRoundBuffChoice,
  resolveNextCard,
  resolvePendingFinalAction,
  startRoundResolution,
  type LocalGameState
} from "@hyperdimensional-battle/engine";
import { sampleCards, sampleRoles, sampleRoundBuffs } from "@hyperdimensional-battle/shared";

export interface Env {
  ROOM_DO: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

type MultiRoomPhase = "lobby" | "match";
type AiLevel = "easy" | "normal" | "advanced" | "expert";

type RoomPlayer = {
  playerId: string;
  displayName: string;
  ready: boolean;
  roleId: string | null;
  joinedAt: string;
  lastSeenAt: string;
  isAi?: boolean;
  aiLevel?: AiLevel;
};

type RoomState = {
  roomId: string;
  phase: MultiRoomPhase;
  seed: string;
  hostPlayerId: string | null;
  players: RoomPlayer[];
  log: string[];
  updatedAt: string;
  matchPlayers?: MatchPlayerSummary[];
  winnerPlayerIds?: string[];
};

type MatchPlayerSummary = {
  playerId: string;
  displayName: string;
  round: number;
  phase: LocalGameState["phase"];
  scoreThisRound: number;
  totalScore: number;
  replayCode?: string;
};

type MatchGames = Record<string, LocalGameState>;
type ReplayCommand = { action: string; payload: Record<string, unknown> };
type MatchReplaySources = Record<string, { initialGame: LocalGameState; commands: ReplayCommand[] }>;
type PrivateRoomState = RoomState & { game?: LocalGameState; viewingPlayerId?: string };

type ReplayRecord = {
  code: string;
  roomId: string;
  seed: string;
  playerId: string;
  displayName: string;
  completedAt: string;
  roleId: string;
  gameSeed: string;
  initialGame: LocalGameState;
  commands: ReplayCommand[];
  expiresAt?: string | null;
  savedAt?: string;
  rankingProtected?: boolean;
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
const MATCH_GAMES_STORAGE_KEY = "match-games";
const MATCH_REPLAY_COMMANDS_STORAGE_KEY = "match-replay-commands";
const AI_TARGET_ROUND_STORAGE_KEY = "ai-target-round";
const REPLAY_STORAGE_PREFIX = "replay:";
const DEFAULT_REPLAY_RETENTION_MS = 24 * 60 * 60 * 1000;
const SAVED_REPLAY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function createReplayToken(length = 8) {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length);
}

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

function applyCorsHeaders(headers: Headers, request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return;
  }
  if (!getAllowedOrigins(env, request).has(origin)) {
    return;
  }
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
}

function createJsonResponse(payload: unknown, request: Request, env: Env, init?: ResponseInit) {
  const headers = buildSecurityHeaders(init?.headers);
  applyCorsHeaders(headers, request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}

function createTextResponse(body: string, request: Request, env: Env, init?: ResponseInit) {
  const headers = buildSecurityHeaders(init?.headers);
  applyCorsHeaders(headers, request, env);
  headers.set("Content-Type", "text/plain; charset=utf-8");
  return new Response(body, {
    ...init,
    headers
  });
}

function createOptionsResponse(request: Request, env: Env) {
  const headers = buildSecurityHeaders();
  applyCorsHeaders(headers, request, env);
  return new Response(null, {
    status: 204,
    headers
  });
}

function getAllowedOrigins(env: Env, request: Request) {
  const allowedOrigins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
  allowedOrigins.add(new URL(request.url).origin);
  const origin = request.headers.get("Origin");

  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === "https:") {
        allowedOrigins.add(origin);
      }
    } catch {
      // ignore invalid origins
    }
  }

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

function renderPlayerDisplayName(value: string) {
  return value.trim().length > 0 ? value : "未入力";
}

function appendRoomLog(state: RoomState, message: string) {
  state.log = [...state.log, message].slice(-80);
  state.updatedAt = new Date().toISOString();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, env)) {
        return createTextResponse("Forbidden", request, env, { status: 403 });
      }
      return createOptionsResponse(request, env);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return createJsonResponse({ ok: true, runtime: "worker" }, request, env);
    }

    const replayMatch = url.pathname.match(/^\/replays\/([^/]+)(?:\/(save))?$/);
    if ((request.method === "GET" || request.method === "POST") && replayMatch) {
      const code = decodeURIComponent(replayMatch[1]);
      const roomId = code.split("~")[1] ?? "";
      if (!ROOM_ID_PATTERN.test(roomId)) {
        return createTextResponse("Invalid replay code", request, env, { status: 400 });
      }
      const replayUrl = new URL(request.url);
      const replayAction = replayMatch[2];
      if (request.method === "GET" && replayAction) {
        return createTextResponse("Method Not Allowed", request, env, { status: 405 });
      }
      if (request.method === "POST" && replayAction !== "save") {
        return createTextResponse("Method Not Allowed", request, env, { status: 405 });
      }
      replayUrl.pathname = `/rooms/${roomId}/${replayAction === "save" ? "replay-save" : "replay"}`;
      replayUrl.search = `?code=${encodeURIComponent(code)}`;
      return env.ROOM_DO.get(env.ROOM_DO.idFromName(roomId)).fetch(new Request(replayUrl, request));
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})(?:\/(join|player|leave|start|lobby|ai|action|replay|replay-save|ws))?$/);
    if (roomMatch) {
      const roomId = roomMatch[1];
      if (!ROOM_ID_PATTERN.test(roomId)) {
        return createTextResponse("Invalid room id", request, env, { status: 400 });
      }
      const id = env.ROOM_DO.idFromName(roomId);
      return env.ROOM_DO.get(id).fetch(request);
    }

    return createTextResponse("Not Found", request, env, { status: 404 });
  }
};

export class RoomDurableObject {
  private sockets = new Set<WebSocket>();

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env
  ) {}

  async alarm(): Promise<void> {
    const targetRound = await this.ctx.storage.get<number>(AI_TARGET_ROUND_STORAGE_KEY);
    if (typeof targetRound === "number") {
      const state = await this.ctx.storage.get<RoomState>(ROOM_STATE_STORAGE_KEY);
      if (state?.phase === "match") {
        const games = (await this.ctx.storage.get<MatchGames>(MATCH_GAMES_STORAGE_KEY)) ?? {};
        const replaySources = (await this.ctx.storage.get<MatchReplaySources>(MATCH_REPLAY_COMMANDS_STORAGE_KEY)) ?? {};
        for (const aiPlayer of state.players.filter((player) => player.isAi)) {
          let aiGame = games[aiPlayer.playerId];
          while (aiGame?.phase === "input" && aiGame.round <= targetRound) {
            const replaySource = replaySources[aiPlayer.playerId];
            if (replaySource) replaySource.commands.push({ action: "ai_round", payload: { level: aiPlayer.aiLevel ?? "normal" } });
            aiGame = this.runAiRound(aiGame, aiPlayer.aiLevel ?? "normal");
          }
          if (aiGame) games[aiPlayer.playerId] = aiGame;
        }
        this.syncMatchSummaries(state, games);
        await this.publishFinishedReplays(state, games, replaySources);
        await this.ctx.storage.put(MATCH_GAMES_STORAGE_KEY, games);
        await this.ctx.storage.put(MATCH_REPLAY_COMMANDS_STORAGE_KEY, replaySources);
        await this.saveState(state);
      }
      await this.ctx.storage.delete(AI_TARGET_ROUND_STORAGE_KEY);
    }
    await this.deleteExpiredReplays();
    await this.scheduleNextAlarm();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.pathname.split("/")[2] ?? this.ctx.id.toString();
    const action = url.pathname.split("/")[3] ?? "";

    if (request.method === "GET" && action === "ws") {
      if (!isAllowedOrigin(request, this.env)) {
        return createTextResponse("Forbidden", request, this.env, { status: 403 });
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

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(request, this.env)) {
        return createTextResponse("Forbidden", request, this.env, { status: 403 });
      }
      return createOptionsResponse(request, this.env);
    }

    if (request.method === "GET" && !action) {
      return createJsonResponse(
        await this.getPrivateState(roomId, url.searchParams.get("playerId"), url.searchParams.get("viewPlayerId")),
        request,
        this.env
      );
    }

    if (request.method === "GET" && action === "replay") {
      const code = url.searchParams.get("code") ?? "";
      const replay = await this.ctx.storage.get<ReplayRecord>(`${REPLAY_STORAGE_PREFIX}${code}`);
      const normalized = replay ? this.normalizeReplay(replay) : null;
      if (normalized && this.isReplayExpired(normalized)) {
        await this.ctx.storage.delete(`${REPLAY_STORAGE_PREFIX}${code}`);
        await this.scheduleNextAlarm();
        return createTextResponse("Replay expired", request, this.env, { status: 404 });
      }
      return normalized
        ? createJsonResponse(normalized, request, this.env)
        : createTextResponse("Replay not found", request, this.env, { status: 404 });
    }

    if (request.method !== "POST") {
      return createTextResponse("Method Not Allowed", request, this.env, {
        status: 405,
        headers: { Allow: "GET, POST" }
      });
    }

    if (!isAllowedOrigin(request, this.env)) {
      return createTextResponse("Forbidden", request, this.env, { status: 403 });
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) {
      return createTextResponse("Invalid JSON", request, this.env, { status: 400 });
    }

    switch (action) {
      case "join":
        return createJsonResponse(await this.handleJoin(roomId, payload), request, this.env);
      case "player":
        return createJsonResponse(await this.handlePlayerUpdate(roomId, payload), request, this.env);
      case "leave":
        return createJsonResponse(await this.handleLeave(roomId, payload), request, this.env);
      case "start":
        return createJsonResponse(await this.handleStart(roomId, payload), request, this.env);
      case "lobby":
        return createJsonResponse(await this.handleReturnToLobby(roomId, payload), request, this.env);
      case "ai":
        return createJsonResponse(await this.handleAddAi(roomId, payload), request, this.env);
      case "replay-save":
        return createJsonResponse(await this.handleSaveReplay(url.searchParams.get("code") ?? ""), request, this.env);
      case "action":
        return createJsonResponse(await this.handleMatchAction(roomId, payload), request, this.env);
      default:
        return createTextResponse("Not Found", request, this.env, { status: 404 });
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

  private async scheduleAiAdvance(targetRound: number) {
    const scheduledRound = (await this.ctx.storage.get<number>(AI_TARGET_ROUND_STORAGE_KEY)) ?? 0;
    await this.ctx.storage.put(AI_TARGET_ROUND_STORAGE_KEY, Math.max(scheduledRound, targetRound));
    await this.scheduleNextAlarm(Date.now());
  }

  private normalizeReplay(replay: ReplayRecord): ReplayRecord & { expiresAt: string | null } {
    if (replay.expiresAt !== undefined) return replay as ReplayRecord & { expiresAt: string | null };
    return {
      ...replay,
      expiresAt: new Date(Date.parse(replay.completedAt) + DEFAULT_REPLAY_RETENTION_MS).toISOString()
    };
  }

  private isReplayExpired(replay: ReplayRecord & { expiresAt: string | null }, now = Date.now()) {
    return !replay.rankingProtected && replay.expiresAt !== null && Date.parse(replay.expiresAt) <= now;
  }

  private async listReplays() {
    const stored = await this.ctx.storage.list<ReplayRecord>({ prefix: REPLAY_STORAGE_PREFIX });
    return [...stored.entries()].map(([key, replay]) => [key, this.normalizeReplay(replay)] as const);
  }

  private async deleteExpiredReplays(now = Date.now()) {
    const expiredKeys = (await this.listReplays())
      .filter(([, replay]) => this.isReplayExpired(replay, now))
      .map(([key]) => key);
    if (expiredKeys.length > 0) await this.ctx.storage.delete(expiredKeys);
  }

  private async scheduleNextAlarm(immediate?: number) {
    const aiTargetRound = await this.ctx.storage.get<number>(AI_TARGET_ROUND_STORAGE_KEY);
    const replayExpirations = (await this.listReplays())
      .map(([, replay]) => replay.rankingProtected || replay.expiresAt === null ? Number.POSITIVE_INFINITY : Date.parse(replay.expiresAt))
      .filter(Number.isFinite);
    const next = Math.min(
      typeof aiTargetRound === "number" ? Date.now() : Number.POSITIVE_INFINITY,
      immediate ?? Number.POSITIVE_INFINITY,
      ...replayExpirations
    );
    if (Number.isFinite(next)) {
      const current = await this.ctx.storage.getAlarm();
      if (current === null || next < current) await this.ctx.storage.setAlarm(Math.max(Date.now(), next));
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async handleSaveReplay(code: string) {
    const key = `${REPLAY_STORAGE_PREFIX}${code}`;
    const stored = await this.ctx.storage.get<ReplayRecord>(key);
    if (!stored) throw new Error("replay not found");
    const replay = this.normalizeReplay(stored);
    if (this.isReplayExpired(replay)) {
      await this.ctx.storage.delete(key);
      throw new Error("replay expired");
    }
    const now = new Date();
    replay.savedAt = now.toISOString();
    if (!replay.rankingProtected) {
      replay.expiresAt = new Date(now.getTime() + SAVED_REPLAY_RETENTION_MS).toISOString();
    }
    await this.ctx.storage.put(key, replay);
    await this.scheduleNextAlarm();
    return replay;
  }

  private async getPrivateState(
    roomId: string,
    playerId: string | null,
    viewPlayerId: string | null
  ): Promise<PrivateRoomState> {
    const state = await this.getState(roomId);
    if (!playerId || state.phase !== "match") {
      return state;
    }
    if (!state.players.some((player) => player.playerId === playerId)) {
      return state;
    }
    const games = (await this.ctx.storage.get<MatchGames>(MATCH_GAMES_STORAGE_KEY)) ?? {};
    const requestedViewPlayerId = viewPlayerId && games[viewPlayerId] ? viewPlayerId : playerId;
    return { ...state, game: games[requestedViewPlayerId], viewingPlayerId: requestedViewPlayerId };
  }

  private syncMatchSummaries(state: RoomState, games: MatchGames) {
    const previousReplayCodes = new Map(
      (state.matchPlayers ?? []).map((player) => [player.playerId, player.replayCode] as const)
    );
    state.matchPlayers = state.players.map((roomPlayer) => {
      const game = games[roomPlayer.playerId];
      const player = game?.players[0];
      return {
        playerId: roomPlayer.playerId,
        displayName: roomPlayer.displayName,
        round: game?.round ?? 1,
        phase: game?.phase ?? "input",
        scoreThisRound: player?.scoreThisRound ?? 0,
        totalScore: player?.totalScore ?? 0,
        replayCode: previousReplayCodes.get(roomPlayer.playerId)
      };
    });
    if (state.matchPlayers.length > 0 && state.matchPlayers.every((player) => player.phase === "finished")) {
      const highScore = Math.max(...state.matchPlayers.map((player) => player.totalScore));
      state.winnerPlayerIds = state.matchPlayers
        .filter((player) => player.totalScore === highScore)
        .map((player) => player.playerId);
    } else {
      state.winnerPlayerIds = [];
    }
  }

  private async publishFinishedReplays(state: RoomState, games: MatchGames, replaySources: MatchReplaySources) {
    if (!state.matchPlayers) {
      return;
    }
    for (const summary of state.matchPlayers) {
      if (summary.phase !== "finished" || summary.replayCode) {
        continue;
      }
      const game = games[summary.playerId];
      const replaySource = replaySources[summary.playerId];
      if (!game || !replaySource) {
        continue;
      }
      const code = `${state.seed || "seed"}~${state.roomId}~${createReplayToken()}`;
      summary.replayCode = code;
      const replay: ReplayRecord = {
        code,
        roomId: state.roomId,
        seed: state.seed,
        playerId: summary.playerId,
        displayName: summary.displayName,
        completedAt: new Date().toISOString(),
        roleId: game.players[0]?.roleId ?? "role_simple",
        gameSeed: game.rngSeed,
        initialGame: replaySource.initialGame,
        commands: replaySource.commands,
        expiresAt: new Date(Date.now() + DEFAULT_REPLAY_RETENTION_MS).toISOString(),
        rankingProtected: false
      };
      await this.ctx.storage.put(`${REPLAY_STORAGE_PREFIX}${code}`, replay);
      await this.scheduleNextAlarm();
    }
  }

  private createPlayerGame(state: RoomState, roomPlayer: RoomPlayer) {
    const game = createLocalGame({
      roleId: roomPlayer.roleId ?? "role_simple",
      cards: sampleCards,
      roles: sampleRoles,
      roundBuffs: sampleRoundBuffs,
      seed: `${state.seed}:${roomPlayer.playerId}`
    });
    const player = game.players[0]!;
    const previousPlayerId = player.playerId;
    player.playerId = roomPlayer.playerId;
    player.displayName = roomPlayer.displayName;
    for (const card of [...player.hand, ...player.field, ...player.deck, ...player.discard, ...player.removed]) {
      if (card.ownerPlayerId === previousPlayerId) {
        card.ownerPlayerId = roomPlayer.playerId;
      }
    }
    return game;
  }

  private runAiRound(game: LocalGameState, level: AiLevel) {
    // Exact expert search is intentionally available in the engine for local
    // analysis, but can exceed a Worker's per-request CPU budget on a full hand.
    // Multiplayer uses the bounded normal search so a bot can never block the room.
    const workerSafeLevel = level === "expert" ? "advanced" : level;
    let next = applyAiRoundDecision(game, planAiRound(game, workerSafeLevel));
    if (next.phase === "round_end" && !next.pendingFinalAction) {
      next = finalizeRound(next, next.players[0]!.field.slice(0, 2).map((card) => card.instanceId));
      if (next.pendingRoundBuffChoice) {
        next = chooseRoundBuff(next, 0);
      }
    }
    return next;
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

    if (state.phase === "match" && !existing) {
      throw new Error("match already started");
    }

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
    if (state.phase !== "lobby") {
      throw new Error("lobby settings cannot be changed after the match starts");
    }
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
    const games: MatchGames = {};
    const replaySources: MatchReplaySources = {};
    for (const roomPlayer of state.players) {
      games[roomPlayer.playerId] = this.createPlayerGame(state, roomPlayer);
      replaySources[roomPlayer.playerId] = { initialGame: structuredClone(games[roomPlayer.playerId]!), commands: [] };
    }
    this.syncMatchSummaries(state, games);
    await this.ctx.storage.put(MATCH_GAMES_STORAGE_KEY, games);
    await this.ctx.storage.put(MATCH_REPLAY_COMMANDS_STORAGE_KEY, replaySources);
    appendRoomLog(state, "マッチを開始しました。");
    return this.saveState(state);
  }

  private async handleReturnToLobby(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    const state = await this.getState(roomId);
    if (state.hostPlayerId !== playerId) {
      throw new Error("only host can return the room to the lobby");
    }
    if (state.phase !== "match" || !state.matchPlayers?.length || state.matchPlayers.some((player) => player.phase !== "finished")) {
      throw new Error("the match must be finished before returning to the lobby");
    }
    state.phase = "lobby";
    state.matchPlayers = undefined;
    state.winnerPlayerIds = undefined;
    for (const player of state.players) {
      player.ready = Boolean(player.isAi);
    }
    await this.ctx.storage.delete(MATCH_GAMES_STORAGE_KEY);
    await this.ctx.storage.delete(MATCH_REPLAY_COMMANDS_STORAGE_KEY);
    appendRoomLog(state, "対戦が終了し、ロビーに戻りました。");
    return this.saveState(state);
  }

  private async handleMatchAction(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    const action = typeof payload.action === "string" ? payload.action : "";
    if (!playerId || !action) {
      throw new Error("playerId and action are required");
    }
    const state = await this.getState(roomId);
    const roomPlayer = state.players.find((player) => player.playerId === playerId);
    if (state.phase !== "match" || !roomPlayer || roomPlayer.isAi) {
      throw new Error("player cannot submit this action");
    }
    const games = (await this.ctx.storage.get<MatchGames>(MATCH_GAMES_STORAGE_KEY)) ?? {};
    const replaySources = (await this.ctx.storage.get<MatchReplaySources>(MATCH_REPLAY_COMMANDS_STORAGE_KEY)) ?? {};
    const game = games[playerId];
    if (!game) {
      throw new Error("game state not found");
    }
    const stringArray = (value: unknown) =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
    let next: LocalGameState;
    switch (action) {
      case "mulligan":
        next = applyMulliganOnly(game, stringArray(payload.instanceIds));
        break;
      case "start_resolution":
        next = startRoundResolution(game, stringArray(payload.orderedFieldIds));
        break;
      case "resolve_next":
        next = resolveNextCard(
          game,
          payload.targetSelections && typeof payload.targetSelections === "object"
            ? (payload.targetSelections as Record<string, string>)
            : {}
        );
        break;
      case "resolve_final":
        next = resolvePendingFinalAction(
          game,
          typeof payload.sourceInstanceId === "string" ? payload.sourceInstanceId : "",
          typeof payload.insertIndex === "number" ? payload.insertIndex : 0
        );
        break;
      case "finalize_round":
        next = finalizeRound(game, stringArray(payload.discardIds));
        break;
      case "reroll_buff":
        next = rerollRoundBuffChoice(game);
        break;
      case "choose_buff":
        next = chooseRoundBuff(game, typeof payload.optionIndex === "number" ? payload.optionIndex : -1);
        break;
      default:
        throw new Error("unknown match action");
    }
    games[playerId] = next;
    const { playerId: _playerId, ...commandPayload } = payload;
    replaySources[playerId]?.commands.push({ action, payload: commandPayload });
    const aiTargetRound =
      action === "choose_buff" || next.phase === "finished"
        ? next.phase === "finished"
          ? 5
          : Math.max(1, next.round - 1)
        : null;
    this.syncMatchSummaries(state, games);
    await this.publishFinishedReplays(state, games, replaySources);
    await this.ctx.storage.put(MATCH_GAMES_STORAGE_KEY, games);
    await this.ctx.storage.put(MATCH_REPLAY_COMMANDS_STORAGE_KEY, replaySources);
    await this.saveState(state);
    if (aiTargetRound !== null) {
      await this.scheduleAiAdvance(aiTargetRound);
    }
    return { ...state, game: next } satisfies PrivateRoomState;
  }

  private async handleAddAi(roomId: string, payload: Record<string, unknown>) {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : "";
    const level: AiLevel =
      payload.level === "easy" || payload.level === "normal" || payload.level === "advanced" || payload.level === "expert"
        ? payload.level
        : "normal";
    if (!playerId) {
      throw new Error("playerId is required");
    }

    const state = await this.getState(roomId);
    if (state.phase !== "lobby") {
      throw new Error("AI can only be added in the lobby");
    }
    if (state.hostPlayerId !== playerId) {
      throw new Error("only host can add AI players");
    }

    const now = new Date().toISOString();
    const aiNumber = state.players.filter((player) => player.isAi).length + 1;
    state.players.push({
      playerId: `ai_${crypto.randomUUID()}`,
      displayName: `AI ${aiNumber} (${level})`,
      ready: true,
      roleId: typeof payload.roleId === "string" ? payload.roleId : "role_simple",
      joinedAt: now,
      lastSeenAt: now,
      isAi: true,
      aiLevel: level
    });
    appendRoomLog(state, `AI ${aiNumber} (${level}) を追加しました。`);
    return this.saveState(state);
  }
}
