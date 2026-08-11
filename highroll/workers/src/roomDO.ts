import GameEngine from "../../src/server/game/engine";
import { buildDeckCards, getCardsCatalog, getRolesCatalog } from "./highrollCatalog";
import type { CardDefinition, GameLogEntry, GameState, LobbySummary, Role, TeamColor } from "../../src/shared/types";
import type { ClientMsg, ServerMsg } from "../../src/shared/protocol";
import { createSecurityHeaders, createTextResponse, isAllowedOrigin } from "./security";

type Env = {
  ROOMS: DurableObjectNamespace;
  LOBBY_INDEX: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
};

type StoredRoom =
  | {
      tombstone: true;
      deletedAt: number;
      roomId: string;
    }
  | {
      tombstone?: false;
      roomId: string;
      deckId: string;
      state: GameState;
      cpuPlayers?: Array<{ playerId: string; level: CpuLevel }>;
      lobby?: StoredLobby;
    };

type StoredLobby = {
  name: string;
  ownerId: string;
  isPrivate: boolean;
  password?: string;
  createdAt: number;
  showRoles: boolean;
  teamMode: boolean;
  spectators?: string[];
};

type RoomSocketAttachment = {
  joined?: boolean;
  playerId?: string;
};

const jsonText = (value: unknown) => JSON.stringify(value);

type CpuLevel = "easy" | "normal" | "hard";
type CreatePlayerInputNormalized = {
  name: string;
  roleId?: string;
  playerId?: string;
  isCpu?: boolean;
  cpuLevel?: CpuLevel;
  team?: TeamColor;
};
type CreatePlayerInput = string | CreatePlayerInputNormalized;

const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;
const isValidName = (name: string): boolean =>
  name.length > 0 && [...name].length <= NAME_MAX_LENGTH && NAME_REGEX.test(name);

const MAX_PLAYERS = 6;
const LOBBY_ROOM_TTL_MS = 60 * 60 * 1000;

const normalizeCatalog = (): { roles: Role[]; cards: CardDefinition[] } => ({
  roles: getRolesCatalog(),
  cards: getCardsCatalog(),
});

export class RoomDO implements DurableObject {
  private readonly ctx: DurableObjectState;
  private sockets = new Set<WebSocket>();
  private engine: GameEngine | null = null;
  private roomId: string | null = null;
  private deckId: string | null = null;
  private cpuPlayers: Array<{ playerId: string; level: CpuLevel }> = [];
  private lobby: StoredLobby | null = null;
  private deletedAt: number | null = null;
  private cpuAlarmInProgress = false;
  private cpuLocalTimer: ReturnType<typeof setTimeout> | null = null;
  private nextCpuScheduledAt: number | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: Env,
  ) {
    this.ctx = state;
    for (const ws of this.ctx.getWebSockets()) {
      this.sockets.add(ws);
    }
  }

  private getSocketAttachment(ws: WebSocket): RoomSocketAttachment {
    try {
      const raw = ws.deserializeAttachment();
      if (!raw || typeof raw !== "object") return {};
      return raw as RoomSocketAttachment;
    } catch {
      return {};
    }
  }

  private setSocketAttachment(ws: WebSocket, patch: Partial<RoomSocketAttachment>): void {
    const next = { ...this.getSocketAttachment(ws), ...patch };
    try {
      ws.serializeAttachment(next);
    } catch {
      // noop
    }
  }

  private sendCurrentStateTo(ws: WebSocket): void {
    if (!this.engine) return;
    const viewerId = this.getSocketAttachment(ws).playerId;
    this.safeSend(ws, { t: "state", state: this.maskStateForViewer(this.engine.getState(), viewerId) });
    if (this.lobby) {
      this.safeSend(ws, { t: "lobby", lobby: this.lobbyDetail() });
    }
  }

  private scheduleCpuAlarm(delayMs: number): void {
    const minDelayMs = 50;
    const delay = Math.max(minDelayMs, Math.floor(delayMs));
    const when = Date.now() + delay;

    if (this.nextCpuScheduledAt !== null && when >= this.nextCpuScheduledAt - 5) {
      return;
    }
    this.nextCpuScheduledAt = when;

    if (this.cpuLocalTimer) {
      clearTimeout(this.cpuLocalTimer);
      this.cpuLocalTimer = null;
    }

    this.cpuLocalTimer = setTimeout(() => {
      this.cpuLocalTimer = null;
      this.alarm().catch(() => null);
    }, Math.max(0, when - Date.now()));

    this.state.storage.setAlarm(when).catch(() => null);
  }

  async alarm(): Promise<void> {
    if (this.cpuAlarmInProgress) return;
    this.cpuAlarmInProgress = true;
    try {
      if (this.cpuLocalTimer) {
        clearTimeout(this.cpuLocalTimer);
        this.cpuLocalTimer = null;
      }
      this.nextCpuScheduledAt = null;
      await this.load();
      if (!this.engine) return;
      this.engine.runCpuScheduledStep();
      await this.persist();
      this.broadcastState();
      if (this.lobby) {
        await this.upsertLobbyIndex();
      }
    } catch {
      // noop
    } finally {
      this.cpuAlarmInProgress = false;
    }
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

  private isSecretActive(state: GameState, playerId: string): boolean {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.roleId !== "secret") return false;
    const runtime = state.board.playerStates[playerId];
    if (!runtime || runtime.isDefeated) return false;
    const suppressedUntil = runtime.roleState?.suppressedUntilRound;
    if (typeof suppressedUntil === "number" && Number.isFinite(suppressedUntil) && state.round <= suppressedUntil) {
      return false;
    }
    return true;
  }

  private maskLogForViewer(log: GameLogEntry, viewerId: string | undefined, state: GameState): GameLogEntry {
    const isViewerSelf = (pid: string | undefined) => Boolean(pid && viewerId && pid === viewerId);
    const isSecretHidden = (pid: string | undefined) => Boolean(pid && this.isSecretActive(state, pid) && !isViewerSelf(pid));

    if (log.type === "cardPlay" && isSecretHidden(log.playerId)) {
      return { ...log, cardId: "???" };
    }

    if (log.type === "roleAction" && isSecretHidden(log.playerId)) {
      return { ...log, description: "???" };
    }

    if (log.type === "damageResolved" && isSecretHidden(log.targetId)) {
      return {
        ...log,
        attempted: 0,
        totalAfterReductions: 0,
        tempAbsorbed: 0,
        hpDamage: 0,
        label: "実際: ?ダメージ",
        breakdown: [],
      };
    }

    if (log.type === "abilityDamage" && isSecretHidden(log.playerId)) {
      return { ...log, amount: 0 };
    }

    if (log.type === "roleAttack" && isSecretHidden(log.targetId)) {
      return { ...log, damage: 0 };
    }

    return log;
  }

  private maskStateForViewer(state: GameState, viewerId?: string): GameState {
    const masked: GameState = JSON.parse(JSON.stringify(state));

    for (const player of masked.players) {
      if (!this.isSecretActive(masked, player.id)) continue;
      if (viewerId && viewerId === player.id) continue;

      const runtime = masked.board.playerStates[player.id];
      if (!runtime) continue;

      runtime.hp = 0;
      runtime.maxHp = 0;
      runtime.tempHp = 0;
      runtime.baseStats = { hp: 0, atk: 0, def: 0, spe: 0, bra: 0 };
      runtime.statTokens = { atk: 0, def: 0, spe: 0, bra: 0 };
      runtime.turnBoosts = { atk: 0, def: 0, spe: 0, bra: 0 };
      masked.braTokens[player.id] = 0;
    }

    masked.logs = masked.logs.map((log) => this.maskLogForViewer(log, viewerId, masked));
    return masked;
  }

  private broadcastState(): void {
    if (!this.engine) return;
    for (const ws of this.sockets) {
      const viewerId = this.getSocketAttachment(ws).playerId;
      this.safeSend(ws, { t: "state", state: this.maskStateForViewer(this.engine.getState(), viewerId) });
    }
    if (this.lobby) {
      this.broadcast({ t: "lobby", lobby: this.lobbyDetail() });
    }
  }

  private lobbyIndexStub(): DurableObjectStub {
    return this._env.LOBBY_INDEX.get(this._env.LOBBY_INDEX.idFromName("index"));
  }

  private lobbySummaryFromDetail(detail: import("../../src/shared/types").LobbyDetail): LobbySummary {
    return {
      id: detail.id,
      name: detail.name,
      isPrivate: detail.isPrivate,
      deckId: detail.deckId,
      playerCount: detail.players.length,
      createdAt: detail.createdAt,
    };
  }

  private async upsertLobbyIndex(): Promise<void> {
    if (!this.lobby) return;
    const summary = this.lobbySummaryFromDetail(this.lobbyDetail());
    try {
      await this.lobbyIndexStub().fetch("https://lobby-index/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lobby: summary }),
      });
    } catch {
      // noop (index is best-effort)
    }
  }

  private async removeLobbyIndex(lobbyId: string): Promise<void> {
    try {
      await this.lobbyIndexStub().fetch("https://lobby-index/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: lobbyId }),
      });
    } catch {
      // noop (index is best-effort)
    }
  }

  private async load(): Promise<void> {
    if (this.engine) return;
    const stored = await this.state.storage.get<StoredRoom>("room");
    if (!stored) return;

    if ("tombstone" in stored && stored.tombstone) {
      this.deletedAt = stored.deletedAt;
      this.roomId = stored.roomId;
      this.deckId = null;
      this.cpuPlayers = [];
      this.lobby = null;
      this.engine = null;
      return;
    }

    this.deletedAt = null;
    this.roomId = stored.roomId;
    this.deckId = stored.deckId;
    this.cpuPlayers = stored.cpuPlayers ?? [];
    this.lobby = stored.lobby ?? null;
    this.engine = new GameEngine(stored.roomId, [], {
      catalog: normalizeCatalog(),
      state: stored.state,
      cpuScheduleFn: (delayMs) => this.scheduleCpuAlarm(delayMs),
    });
    this.cpuPlayers.forEach((cpu) => this.engine?.registerCpuPlayer(cpu.playerId, cpu.level));

    this.engine.kickCpuScheduling();
  }

  private async persist(): Promise<void> {
    if (this.deletedAt !== null) {
      const roomId = this.roomId ?? this.state.id.toString();
      const stored: StoredRoom = { tombstone: true, deletedAt: this.deletedAt, roomId };
      await this.state.storage.put("room", stored);
      return;
    }

    if (!this.engine || !this.roomId || !this.deckId) return;
    const stored: StoredRoom = {
      tombstone: false,
      roomId: this.roomId,
      deckId: this.deckId,
      state: this.engine.getState(),
      cpuPlayers: this.cpuPlayers,
      lobby: this.lobby ?? undefined,
    };
    await this.state.storage.put("room", stored);
  }

  private requireEngine(): GameEngine {
    if (!this.engine) {
      throw new Error("room_not_initialized");
    }
    return this.engine;
  }

  private async ensureRoom(roomId: string): Promise<void> {
    if (this.engine) return;
    if (this.deletedAt !== null) {
      throw new Error("room_deleted");
    }
    const catalog = normalizeCatalog();
    const engine = new GameEngine(roomId, [], { catalog, cpuScheduleFn: (delayMs) => this.scheduleCpuAlarm(delayMs) });
    const deckId = "default_60";
    engine.assignSharedDeck(deckId, buildDeckCards(deckId));
    this.engine = engine;
    this.roomId = roomId;
    this.deckId = deckId;
    await this.persist();
  }

  private async expireLobbyRoom(reason: string): Promise<void> {
    const roomId = this.roomId ?? this.state.id.toString();

    for (const ws of this.sockets) {
      try {
        ws.close(1001, reason);
      } catch {
        // noop
      }
    }
    this.sockets.clear();

    this.engine = null;
    this.deckId = null;
    this.cpuPlayers = [];
    this.lobby = null;
    this.deletedAt = Date.now();
    this.roomId = roomId;

    await this.persist();
    await this.removeLobbyIndex(roomId);
  }

  private async maybeExpireLobbyRoom(): Promise<void> {
    if (this.deletedAt !== null) return;
    if (!this.lobby) return;
    if (!this.engine) return;

    const createdAt = Number.isFinite(this.lobby.createdAt) ? this.lobby.createdAt : Date.now();
    if (Date.now() - createdAt <= LOBBY_ROOM_TTL_MS) return;

    const status = this.engine.getState().status;
    if (status !== "waiting") return;

    await this.expireLobbyRoom("lobby_expired");
  }

  private async initMatch(roomId: string, deckId: string, players: CreatePlayerInput[] = []): Promise<GameState> {
    const catalog = normalizeCatalog();
    const engine = new GameEngine(roomId, [], { catalog, cpuScheduleFn: (delayMs) => this.scheduleCpuAlarm(delayMs) });
    engine.assignSharedDeck(deckId, buildDeckCards(deckId));

    this.cpuPlayers = [];

    players.forEach((p) => {
      const normalized: CreatePlayerInputNormalized =
        typeof p === "string" ? { name: p } : (p as CreatePlayerInputNormalized);
      const name = normalized?.name?.trim() ?? "";
      if (!name) return;
      if (!isValidName(name)) {
        throw new Error("invalid_name");
      }
      const player = engine.addPlayer(name, normalized.playerId);
      if (normalized.roleId) {
        engine.setPlayerRole(player.id, normalized.roleId);
      }
      if (normalized.team) {
        engine.setPlayerTeam(player.id, normalized.team);
      }
      engine.markPlayerReady(player.id, true);
      if (normalized.isCpu) {
        const level: CpuLevel = normalized.cpuLevel ?? "normal";
        engine.registerCpuPlayer(player.id, level);
        this.cpuPlayers.push({ playerId: player.id, level });
      }
    });

    this.engine = engine;
    this.roomId = roomId;
    this.deckId = deckId;
    this.lobby = null;
    await this.persist();
    return engine.getState();
  }

  private async endMatchToLobby(requesterId: string): Promise<void> {
    const engine = this.requireEngine();
    const roomId = this.roomId ?? engine.getState().id;
    const deckId = this.deckId ?? engine.getState().deckId ?? "default_60";

    const state = engine.getState();
    const ownerId = state.players[0]?.id ?? "";
    if (!ownerId || requesterId !== ownerId) {
      throw new Error("only_owner");
    }

    const catalog = normalizeCatalog();
    const nextEngine = new GameEngine(roomId, [], { catalog, cpuScheduleFn: (delayMs) => this.scheduleCpuAlarm(delayMs) });
    nextEngine.assignSharedDeck(deckId, buildDeckCards(deckId));

    const cpuLevelById = new Map(this.cpuPlayers.map((cpu) => [cpu.playerId, cpu.level] as const));
    this.cpuPlayers = [];

    state.players.forEach((player) => {
      const normalizedName = player.name?.trim() ?? "";
      if (!normalizedName) return;
      const nextPlayer = nextEngine.addPlayer(normalizedName, player.id);
      if (player.roleId) {
        nextEngine.setPlayerRole(nextPlayer.id, player.roleId);
      }
      if (player.team) {
        nextEngine.setPlayerTeam(nextPlayer.id, player.team);
      }
      const cpuLevel = cpuLevelById.get(player.id);
      if (cpuLevel) {
        nextEngine.registerCpuPlayer(nextPlayer.id, cpuLevel);
        this.cpuPlayers.push({ playerId: nextPlayer.id, level: cpuLevel });
      }

      nextEngine.markPlayerReady(nextPlayer.id, Boolean(cpuLevel));
    });

    this.engine = nextEngine;
    this.roomId = roomId;
    this.deckId = deckId;
    this.lobby = {
      name: roomId,
      ownerId,
      isPrivate: false,
      createdAt: Date.now(),
      showRoles: true,
      teamMode: Boolean(state.teamMode),
      spectators: [],
    };

    await this.persist();
    await this.upsertLobbyIndex();
    this.broadcastState();
  }

  private lobbyDetail(): import("../../src/shared/types").LobbyDetail {
    if (!this.engine) {
      throw new Error("room_not_initialized");
    }
    const state = this.engine.getState();
    const lobby = this.lobby;
    const showRoles = lobby?.showRoles ?? true;
    const spectators = new Set<string>(lobby?.spectators ?? []);
    const cpuLevelById = new Map(this.cpuPlayers.map((cpu) => [cpu.playerId, cpu.level]));
    return {
      id: this.roomId ?? state.id,
      name: lobby?.name ?? (this.roomId ?? state.id),
      ownerId: lobby?.ownerId ?? (state.players[0]?.id ?? ""),
      isPrivate: lobby?.isPrivate ?? false,
      deckId: this.deckId ?? state.deckId ?? "default_60",
      players: state.players.map((p) => ({
        id: p.id,
        name: p.name,
        roleId: p.roleId,
        isReady: Boolean(p.isReady),
        team: p.team,
        isSpectator: spectators.has(p.id),
        isCpu: cpuLevelById.has(p.id),
        cpuLevel: cpuLevelById.get(p.id),
      })),
      createdAt: lobby?.createdAt ?? state.createdAt ?? Date.now(),
      showRoles,
      teamMode: lobby?.teamMode ?? false,
    };
  }

  private requireLobby(): StoredLobby {
    if (!this.lobby) {
      throw new Error("lobby_not_initialized");
    }
    return this.lobby;
  }

  private async initLobby(roomId: string, deckId: string, lobbyName: string, ownerName: string, password?: string): Promise<{ lobby: import("../../src/shared/types").LobbyDetail; ownerPlayerId: string }> {
    const name = ownerName.trim();
    const lobbyTitle = lobbyName.trim() || roomId;
    if (!isValidName(name)) {
      throw new Error("invalid_name");
    }
    if (lobbyTitle && !isValidName(lobbyTitle)) {
      throw new Error("invalid_lobby_name");
    }

    const catalog = normalizeCatalog();
    const engine = new GameEngine(roomId, [], { catalog, cpuScheduleFn: (delayMs) => this.scheduleCpuAlarm(delayMs) });
    engine.assignSharedDeck(deckId, buildDeckCards(deckId));

    const owner = engine.addPlayer(name);
    engine.markPlayerReady(owner.id, false);

    this.cpuPlayers = [];
    this.engine = engine;
    this.roomId = roomId;
    this.deckId = deckId;
    this.lobby = {
      name: lobbyTitle,
      ownerId: owner.id,
      isPrivate: Boolean(password),
      password: password || undefined,
      createdAt: Date.now(),
      showRoles: true,
      teamMode: false,
      spectators: [],
    };
    await this.persist();
    await this.upsertLobbyIndex();
    return { lobby: this.lobbyDetail(), ownerPlayerId: owner.id };
  }

  private async joinLobby(name: string, password?: string, roleId?: string): Promise<{ lobby: import("../../src/shared/types").LobbyDetail; playerId: string }> {
    const lobby = this.requireLobby();
    const trimmed = name.trim();
    if (!isValidName(trimmed)) {
      throw new Error("invalid_name");
    }
    if (lobby.isPrivate) {
      if (!password || password !== lobby.password) {
        throw new Error("invalid_password");
      }
    }
    const engine = this.requireEngine();
    if (engine.getState().players.length >= MAX_PLAYERS) {
      throw new Error("lobby_full");
    }
    const player = engine.addPlayer(trimmed);
    if (roleId) {
      engine.setPlayerRole(player.id, roleId);
    }
    if (lobby.teamMode) {
      engine.setPlayerTeam(player.id, "red");
    }
    await this.persist();
    this.broadcastState();
    await this.upsertLobbyIndex();
    return { lobby: this.lobbyDetail(), playerId: player.id };
  }

  private isSpectator(playerId: string): boolean {
    const lobby = this.lobby;
    if (!lobby) return false;
    return (lobby.spectators ?? []).includes(playerId);
  }

  private async setSpectator(playerId: string, isSpectator: boolean): Promise<import("../../src/shared/types").LobbyDetail> {
    const lobby = this.requireLobby();
    const engine = this.requireEngine();
    if (playerId === lobby.ownerId && isSpectator) {
      throw new Error("owner_cannot_spectate");
    }
    const exists = engine.getState().players.some((p) => p.id === playerId);
    if (!exists) {
      throw new Error("player_not_found");
    }
    const spectators = new Set<string>(lobby.spectators ?? []);
    if (isSpectator) {
      spectators.add(playerId);
      engine.clearPlayerRole(playerId);
      engine.markPlayerReady(playerId, false);
    } else {
      spectators.delete(playerId);
      engine.markPlayerReady(playerId, false);
    }
    lobby.spectators = Array.from(spectators);
    this.lobby = lobby;
    await this.persist();
    this.broadcastState();
    await this.upsertLobbyIndex();
    return this.lobbyDetail();
  }

  private async leaveLobby(playerId: string): Promise<{ removed: boolean; lobby?: import("../../src/shared/types").LobbyDetail }> {
    const engine = this.requireEngine();
    const lobby = this.lobby;
    engine.removePlayer(playerId);

    // spectator cleanup
    if (lobby?.spectators?.length) {
      lobby.spectators = lobby.spectators.filter((id) => id !== playerId);
    }

    // cpu cleanup
    this.cpuPlayers = this.cpuPlayers.filter((cpu) => cpu.playerId !== playerId);

    const state = engine.getState();
    if (lobby && lobby.ownerId === playerId) {
      lobby.ownerId = state.players[0]?.id ?? lobby.ownerId;
      this.lobby = lobby;
    }

    if (state.players.length === 0) {
      if (this.roomId) {
        await this.removeLobbyIndex(this.roomId);
      }
      this.engine = null;
      this.roomId = null;
      this.deckId = null;
      this.cpuPlayers = [];
      this.lobby = null;
      await this.state.storage.delete("room");
      return { removed: true };
    }

    await this.persist();
    this.broadcastState();
    await this.upsertLobbyIndex();
    return { removed: false, lobby: this.lobby ? this.lobbyDetail() : undefined };
  }

  private async addCpuPlayers(requesterId: string, cpuCount: number, cpuLevel: CpuLevel): Promise<import("../../src/shared/types").LobbyDetail> {
    const lobby = this.requireLobby();
    const engine = this.requireEngine();
    if (requesterId !== lobby.ownerId) {
      throw new Error("only_owner");
    }

    const remaining = Math.max(0, MAX_PLAYERS - engine.getState().players.length);
    const toAdd = Math.min(remaining, Math.max(1, Math.floor(cpuCount)));
    if (toAdd <= 0) {
      throw new Error("lobby_full");
    }

    const roleIds = getRolesCatalog().map((role) => role.id).filter(Boolean);
    const existingCpuCount = this.cpuPlayers.length;

    for (let i = 0; i < toAdd; i += 1) {
      const roleId = roleIds.length > 0 ? roleIds[Math.floor(Math.random() * roleIds.length)] : undefined;
      const player = engine.addPlayer(`CPU${existingCpuCount + i + 1}`);
      if (roleId) {
        engine.setPlayerRole(player.id, roleId);
      }
      if (lobby.teamMode) {
        engine.setPlayerTeam(player.id, "red");
      }
      engine.markPlayerReady(player.id, true);
      engine.registerCpuPlayer(player.id, cpuLevel);
      this.cpuPlayers.push({ playerId: player.id, level: cpuLevel });
    }

    await this.persist();
    this.broadcastState();
    await this.upsertLobbyIndex();
    return this.lobbyDetail();
  }

  private async initSolo(roomId: string, deckId: string, name: string, roleId: string, cpuLevel: "easy" | "normal" | "hard"): Promise<{ state: GameState; playerId: string }> {
    const roles = getRolesCatalog();
    const cpuRoleId = roles.length > 0 ? roles[Math.floor(Math.random() * roles.length)]?.id : undefined;

    await this.initMatch(roomId, deckId, [
      { name: name || "Player", roleId } satisfies CreatePlayerInputNormalized,
      { name: "CPU", roleId: cpuRoleId, isCpu: true, cpuLevel } satisfies CreatePlayerInputNormalized,
    ]);

    const engine = this.requireEngine();
    engine.start();
    await this.persist();

    const human = engine.getState().players[0];
    return { state: engine.getState(), playerId: human?.id ?? "" };
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.sockets.add(ws);
    await this.load();

    let msg: ClientMsg | null = null;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      msg = JSON.parse(raw);
    } catch {
      this.safeSend(ws, { t: "error", message: "invalid_json" });
      return;
    }

    if (msg?.t === "ping") {
      this.safeSend(ws, { t: "pong" });
      return;
    }

    if (msg?.t === "join") {
      const attachment = this.getSocketAttachment(ws);
      if (attachment.joined) {
        return;
      }
      const name = String(msg.name ?? "").trim();
      if (!isValidName(name)) {
        this.safeSend(ws, { t: "error", message: "invalid_name" });
        return;
      }
      const engine = this.requireEngine();
      if (engine.getState().players.length === 0) {
        const player = engine.addPlayer(name);
        engine.markPlayerReady(player.id, true);
        await this.persist();
        this.broadcastState();
      } else {
        this.sendCurrentStateTo(ws);
      }
      this.setSocketAttachment(ws, { joined: true });
      return;
    }

    if (msg?.t === "action") {
      const payload = (msg as unknown as { payload?: unknown })?.payload as unknown;
      await this.handleSocketAction(ws, payload);
      return;
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    console.log("[RoomDO] ws close", { code, reason, wasClean });
    this.sockets.delete(ws);
    this.persist().catch(() => null);
  }

  webSocketError(_ws: WebSocket, error: unknown): void {
    console.log("[RoomDO] ws error", error ? String(error) : "");
  }

  private async handleSocketAction(ws: WebSocket, payload: unknown): Promise<void> {
    if (!payload || typeof payload !== "object") {
      this.safeSend(ws, { t: "error", message: "invalid_action_payload" });
      return;
    }
    const attachedPlayerId = (payload as { playerId?: unknown })?.playerId;
    if (typeof attachedPlayerId === "string" && attachedPlayerId) {
      this.setSocketAttachment(ws, { playerId: attachedPlayerId });
    }
    const k = (payload as { k?: unknown })?.k;
    if (typeof k !== "string") {
      this.safeSend(ws, { t: "error", message: "invalid_action_key" });
      return;
    }
    const roomId = this.roomId ?? this.state.id.toString();

    try {
      // Lobby actions
      if (k === "lobby/join") {
        const { name, password, roleId } = payload as { name?: string; password?: string; roleId?: string };
        const result = await this.joinLobby(String(name ?? ""), password, roleId);
        this.safeSend(ws, { t: "lobbyJoined", lobbyId: roomId, playerId: result.playerId });
        return;
      }
      if (k === "lobby/ready") {
        const engine = this.requireEngine();
        const { playerId, isReady } = payload as { playerId?: string; isReady?: boolean };
        if (!playerId) throw new Error("playerId is required.");
        engine.markPlayerReady(playerId, Boolean(isReady));
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return;
      }
      if (k === "lobby/role") {
        const engine = this.requireEngine();
        const { playerId, roleId } = payload as { playerId?: string; roleId?: string };
        if (!playerId || !roleId) throw new Error("playerId and roleId are required.");
        if (this.isSpectator(playerId)) throw new Error("spectator_cannot_change_role");
        engine.setPlayerRole(playerId, roleId);
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return;
      }
      if (k === "lobby/spectator") {
        const { playerId, isSpectator } = payload as { playerId?: string; isSpectator?: boolean };
        if (!playerId) throw new Error("playerId is required.");
        await this.setSpectator(playerId, Boolean(isSpectator));
        return;
      }
      if (k === "lobby/cpu") {
        const { playerId, cpuCount, cpuLevel } = payload as {
          playerId?: string;
          cpuCount?: number;
          cpuLevel?: "easy" | "normal" | "hard";
        };
        if (!playerId) throw new Error("playerId is required.");
        const count = typeof cpuCount === "number" && Number.isFinite(cpuCount) ? cpuCount : 1;
        const level = cpuLevel === "easy" || cpuLevel === "hard" ? cpuLevel : "normal";
        await this.addCpuPlayers(playerId, Math.max(1, Math.floor(count)), level);
        return;
      }
      if (k === "lobby/settings") {
        const lobby = this.requireLobby();
        const { playerId, showRoles, teamMode } = payload as { playerId?: string; showRoles?: boolean; teamMode?: boolean };
        if (!playerId) throw new Error("playerId is required.");
        if (playerId !== lobby.ownerId) throw new Error("only_owner");
        const hasShowRoles = typeof showRoles === "boolean";
        const hasTeamMode = typeof teamMode === "boolean";
        if (!hasShowRoles && !hasTeamMode) throw new Error("no_changes");
        if (hasShowRoles) {
          lobby.showRoles = Boolean(showRoles);
        }
        if (hasTeamMode) {
          lobby.teamMode = Boolean(teamMode);
          if (lobby.teamMode) {
            const engine = this.requireEngine();
            const spectators = new Set<string>(lobby.spectators ?? []);
            engine.getState().players.forEach((player) => {
              if (spectators.has(player.id)) return;
              if (player.team) return;
              engine.setPlayerTeam(player.id, "red");
            });
          }
        }
        this.lobby = lobby;
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return;
      }
      if (k === "lobby/team") {
        const lobby = this.requireLobby();
        const engine = this.requireEngine();
        const { playerId, targetPlayerId, team } = payload as {
          playerId?: string;
          targetPlayerId?: string;
          team?: TeamColor;
        };
        const requesterId = String(playerId ?? "");
        const targetId = String(targetPlayerId ?? requesterId);
        if (!requesterId || !targetId || !team) throw new Error("playerId and team are required.");
        if (targetId !== requesterId && requesterId !== lobby.ownerId) throw new Error("forbidden");
        const exists = engine.getState().players.some((p) => p.id === targetId);
        if (!exists) throw new Error("player_not_found");
        engine.setPlayerTeam(targetId, team);
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return;
      }
      if (k === "lobby/deck") {
        const lobby = this.requireLobby();
        const engine = this.requireEngine();
        const { playerId, deckId } = payload as { playerId?: string; deckId?: string };
        const requesterId = String(playerId ?? "");
        const nextDeckId = String(deckId ?? "").trim();
        if (!requesterId || !nextDeckId) throw new Error("playerId and deckId are required.");
        if (requesterId !== lobby.ownerId) throw new Error("only_owner");
        if (engine.getState().status !== "waiting") throw new Error("match_already_started");

        const cards = buildDeckCards(nextDeckId);
        engine.assignSharedDeck(nextDeckId, cards);
        this.deckId = nextDeckId;
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return;
      }
      if (k === "lobby/leave") {
        const { playerId } = payload as { playerId?: string };
        if (!playerId) throw new Error("playerId is required.");
        await this.leaveLobby(playerId);
        return;
      }
      if (k === "lobby/start") {
        const lobby = this.requireLobby();
        const engine = this.requireEngine();
        const { playerId } = payload as { playerId?: string };
        if (!playerId) throw new Error("playerId is required.");
        if (playerId !== lobby.ownerId) throw new Error("only_owner");
        const state = engine.getState();
        const nonOwnerPlayers = state.players.filter((p) => p.id !== lobby.ownerId);
        if (nonOwnerPlayers.length === 0) throw new Error("no_players");
        const allNonOwnerReady = nonOwnerPlayers.every((p) => Boolean(p.isReady));
        if (!allNonOwnerReady) throw new Error("not_all_ready");

        const spectators = new Set<string>(lobby.spectators ?? []);
        const active = state.players.filter((p) => !spectators.has(p.id));
        if (lobby.teamMode) {
          const activeTeams = active.map((p) => p.team).filter(Boolean) as TeamColor[];
          if (activeTeams.length !== active.length) throw new Error("team_not_selected");
          const uniqueTeams = new Set(activeTeams);
          if (uniqueTeams.size < 2) throw new Error("team_all_same");
        }
        const cpuLevelById = new Map(this.cpuPlayers.map((cpu) => [cpu.playerId, cpu.level] as const));
        await this.removeLobbyIndex(roomId);
        await this.initMatch(roomId, this.deckId ?? "default_60", active.map((p) => ({
          name: p.name,
          roleId: p.roleId,
          playerId: p.id,
          isCpu: cpuLevelById.has(p.id),
          cpuLevel: cpuLevelById.get(p.id),
          team: p.team,
        })));
        const nextEngine = this.requireEngine();
        nextEngine.setTeamMode(Boolean(lobby.teamMode));
        nextEngine.start();
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "lobby/disband") {
        const lobby = this.requireLobby();
        const engine = this.requireEngine();
        const { playerId } = payload as { playerId?: string };
        if (!playerId) throw new Error("playerId is required.");
        if (playerId !== lobby.ownerId) throw new Error("only_owner");
        if (engine.getState().status !== "waiting") throw new Error("match_already_started");

        this.broadcast({ t: "lobbyDisbanded", lobbyId: roomId });
        await this.expireLobbyRoom("lobby_disbanded");
        return;
      }

      // Match actions
      if (k === "match/draw") {
        const engine = this.requireEngine();
        const { playerId, count } = payload as { playerId?: string; count?: number };
        if (!playerId) throw new Error("playerId is required.");
        engine.drawCardsAsAction(playerId, typeof count === "number" ? count : 1);
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/play") {
        const engine = this.requireEngine();
        const { playerId, cardId, targets, choices, handIndex } = payload as {
          playerId?: string;
          cardId?: string;
          targets?: string[];
          choices?: unknown;
          handIndex?: number;
        };
        if (!playerId || !cardId) throw new Error("playerId and cardId are required.");
        engine.playCard(playerId, cardId, { targets, choices: (choices as any) ?? undefined, handIndex });
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/endTurn") {
        const engine = this.requireEngine();
        const { playerId } = payload as { playerId?: string };
        if (!playerId) throw new Error("playerId is required.");
        engine.endTurn(playerId);
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/roleAttack") {
        const engine = this.requireEngine();
        const { playerId, targetId, struggle } = payload as { playerId?: string; targetId?: string; struggle?: boolean };
        if (!playerId || !targetId) throw new Error("playerId and targetId are required.");
        engine.roleAttack(playerId, targetId, { struggle: Boolean(struggle) });
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/roleAction") {
        const engine = this.requireEngine();
        const { playerId, actionId, targetId, choices } = payload as { playerId?: string; actionId?: string; targetId?: string; choices?: unknown };
        if (!playerId || !actionId) throw new Error("playerId and actionId are required.");
        engine.roleAction(playerId, actionId, { targetId, choices: (choices as any) ?? undefined });
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/resolvePrompt") {
        const engine = this.requireEngine();
        const { playerId, accepted } = payload as { playerId?: string; accepted?: boolean };
        if (!playerId) throw new Error("playerId is required.");
        engine.resolvePendingPrompt(playerId, Boolean(accepted));
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/resolveInfoDraw") {
        const engine = this.requireEngine();
        const { playerId, cardId } = payload as { playerId?: string; cardId?: string };
        if (!playerId || !cardId) throw new Error("playerId and cardId are required.");
        engine.resolveInfoDraw(playerId, cardId);
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/rescueBra") {
        const engine = this.requireEngine();
        const { playerId } = payload as { playerId?: string };
        if (!playerId) throw new Error("playerId is required.");
        engine.rescueBra(playerId);
        await this.persist();
        this.broadcastState();
        return;
      }
      if (k === "match/end") {
        const { playerId } = payload as { playerId?: string };
        if (!playerId) throw new Error("playerId is required.");
        await this.endMatchToLobby(playerId);
        return;
      }

      this.safeSend(ws, { t: "error", message: `譛ｪ蟇ｾ蠢懊・action縺ｧ縺・ ${k}` });
    } catch (e) {
      this.safeSend(ws, { t: "error", message: (e as Error).message });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") ?? this.state.id.toString();
    await this.load();

    if (this.deletedAt !== null) {
      return new Response(jsonText({ message: "deleted" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    await this.ensureRoom(roomId);
    await this.maybeExpireLobbyRoom();

    if (this.deletedAt !== null) {
      return new Response(jsonText({ message: "deleted" }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // --- REST (compat / transitional) ---
    if (url.pathname === "/lobby/init" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { deckId?: string; lobbyName?: string; ownerName?: string; password?: string } | null;
        const deckId = (body?.deckId ?? "default_60").trim() || "default_60";
        const lobbyName = String(body?.lobbyName ?? "").trim();
        const ownerName = String(body?.ownerName ?? "").trim();
        const password = String(body?.password ?? "").trim() || undefined;
        const payload = await this.initLobby(roomId, deckId, lobbyName, ownerName, password);
        this.broadcastState();
        return new Response(jsonText(payload), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby" && request.method === "GET") {
      if (!this.lobby) {
        return new Response(jsonText({ message: "not_found" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8" } });
      }
      return new Response(jsonText({ lobby: this.lobbyDetail() }), { headers: { "content-type": "application/json; charset=utf-8" } });
    }

    if (url.pathname === "/lobby/join" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { name?: string; password?: string; roleId?: string } | null;
        const result = await this.joinLobby(String(body?.name ?? ""), body?.password, body?.roleId);
        return new Response(jsonText({ lobby: result.lobby, playerId: result.playerId }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/role" && request.method === "POST") {
      try {
        const engine = this.requireEngine();
        const body = (await request.json().catch(() => null)) as { playerId?: string; roleId?: string } | null;
        const playerId = String(body?.playerId ?? "");
        const roleId = String(body?.roleId ?? "");
        if (!playerId || !roleId) throw new Error("playerId and roleId are required.");
        if (this.isSpectator(playerId)) throw new Error("spectator_cannot_change_role");
        engine.setPlayerRole(playerId, roleId);
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return new Response(jsonText({ lobby: this.lobbyDetail() }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/ready" && request.method === "POST") {
      try {
        const engine = this.requireEngine();
        const body = (await request.json().catch(() => null)) as { playerId?: string; isReady?: boolean } | null;
        const playerId = String(body?.playerId ?? "");
        if (!playerId) throw new Error("playerId is required.");
        engine.markPlayerReady(playerId, Boolean(body?.isReady));
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return new Response(jsonText({ lobby: this.lobbyDetail() }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/spectator" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { playerId?: string; isSpectator?: boolean } | null;
        const playerId = String(body?.playerId ?? "");
        if (!playerId || typeof body?.isSpectator !== "boolean") throw new Error("playerId and isSpectator are required.");
        const updated = await this.setSpectator(playerId, Boolean(body?.isSpectator));
        return new Response(jsonText({ lobby: updated }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/leave" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { playerId?: string } | null;
        const playerId = String(body?.playerId ?? "");
        if (!playerId) throw new Error("playerId is required.");
        const result = await this.leaveLobby(playerId);
        return new Response(jsonText(result), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/cpu" && request.method === "POST") {
      try {
        const body = (await request.json().catch(() => null)) as { playerId?: string; cpuCount?: number; cpuLevel?: CpuLevel } | null;
        const playerId = String(body?.playerId ?? "");
        if (!playerId) throw new Error("playerId is required.");
        const cpuCount = typeof body?.cpuCount === "number" && Number.isFinite(body.cpuCount) ? body.cpuCount : 1;
        const cpuLevel: CpuLevel = body?.cpuLevel === "easy" || body?.cpuLevel === "hard" ? body.cpuLevel : "normal";
        const updated = await this.addCpuPlayers(playerId, cpuCount, cpuLevel);
        return new Response(jsonText({ lobby: updated }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/settings" && request.method === "POST") {
      try {
        const lobby = this.requireLobby();
        const body = (await request.json().catch(() => null)) as { playerId?: string; showRoles?: boolean; teamMode?: boolean } | null;
        const playerId = String(body?.playerId ?? "");
        if (!playerId) throw new Error("playerId is required.");
        if (playerId !== lobby.ownerId) throw new Error("only_owner");
        const hasShowRoles = typeof body?.showRoles === "boolean";
        const hasTeamMode = typeof body?.teamMode === "boolean";
        if (!hasShowRoles && !hasTeamMode) {
          throw new Error("no_changes");
        }
        if (hasShowRoles) {
          lobby.showRoles = Boolean(body?.showRoles);
        }
        if (hasTeamMode) {
          lobby.teamMode = Boolean(body?.teamMode);
          if (lobby.teamMode) {
            const engine = this.requireEngine();
            const spectators = new Set<string>(lobby.spectators ?? []);
            engine.getState().players.forEach((player) => {
              if (spectators.has(player.id)) return;
              if (player.team) return;
              engine.setPlayerTeam(player.id, "red");
            });
          }
        }
        this.lobby = lobby;
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return new Response(jsonText({ lobby: this.lobbyDetail() }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/lobby/team" && request.method === "POST") {
      try {
        const lobby = this.requireLobby();
        const engine = this.requireEngine();
        const body = (await request.json().catch(() => null)) as { playerId?: string; targetPlayerId?: string; team?: TeamColor } | null;
        const requesterId = String(body?.playerId ?? "");
        const team = body?.team;
        const targetPlayerId = String(body?.targetPlayerId ?? requesterId);
        if (!requesterId || !targetPlayerId || !team) throw new Error("playerId and team are required.");

        const playerExists = engine.getState().players.some((p) => p.id === targetPlayerId);
        if (!playerExists) throw new Error("player_not_found");
        if (targetPlayerId !== requesterId && requesterId !== lobby.ownerId) throw new Error("forbidden");

        engine.setPlayerTeam(targetPlayerId, team);
        await this.persist();
        this.broadcastState();
        await this.upsertLobbyIndex();
        return new Response(jsonText({ lobby: this.lobbyDetail() }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

      if (url.pathname === "/lobby/start" && request.method === "POST") {
      try {
        const lobby = this.requireLobby();
        const engine = this.requireEngine();
        const body = (await request.json().catch(() => null)) as { playerId?: string } | null;
        const playerId = String(body?.playerId ?? "");
        if (!playerId) throw new Error("playerId is required.");
        if (playerId !== lobby.ownerId) throw new Error("only_owner");
        const state = engine.getState();
        const nonOwnerPlayers = state.players.filter((p) => p.id !== lobby.ownerId);
        if (nonOwnerPlayers.length === 0) throw new Error("no_players");
        const allNonOwnerReady = nonOwnerPlayers.every((p) => Boolean(p.isReady));
        if (!allNonOwnerReady) throw new Error("not_all_ready");

        const spectators = new Set<string>(lobby.spectators ?? []);
        const active = state.players.filter((p) => !spectators.has(p.id));

        if (lobby.teamMode) {
          const activeTeams = active.map((p) => p.team).filter(Boolean) as TeamColor[];
          if (activeTeams.length !== active.length) throw new Error("team_not_selected");
          const uniqueTeams = new Set(activeTeams);
          if (uniqueTeams.size < 2) throw new Error("team_all_same");
        }

        const cpuLevelById = new Map(this.cpuPlayers.map((cpu) => [cpu.playerId, cpu.level] as const));
        await this.removeLobbyIndex(roomId);
        await this.initMatch(roomId, this.deckId ?? "default_60", active.map((p) => ({
          name: p.name,
          roleId: p.roleId,
          playerId: p.id,
          isCpu: cpuLevelById.has(p.id),
          cpuLevel: cpuLevelById.get(p.id),
          team: p.team,
        })));
        const nextEngine = this.requireEngine();
        nextEngine.setTeamMode(Boolean(lobby.teamMode));
        nextEngine.start();
        await this.persist();
        this.broadcastState();
        return new Response(jsonText({ matchId: roomId }), { headers: { "content-type": "application/json; charset=utf-8" } });
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/init" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { deckId?: string; players?: CreatePlayerInput[] } | null;
      const deckId = (body?.deckId ?? "default_60").trim();
      const players = Array.isArray(body?.players) ? body!.players : [];
      await this.initMatch(roomId, deckId, players);

      const shouldStart = url.searchParams.get("start") === "1";
      if (shouldStart) {
        try {
          const engine = this.requireEngine();
          engine.start();
          await this.persist();
        } catch (e) {
          return new Response(jsonText({ message: (e as Error).message }), {
            status: 400,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
      }

      this.broadcastState();
      return new Response(jsonText({ state: this.requireEngine().getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
    }

    if (url.pathname === "/solo" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { deckId?: string; name?: string; roleId?: string; cpuLevel?: "easy" | "normal" | "hard" } | null;
      const deckId = (body?.deckId ?? "default_60").trim();
      const name = (body?.name ?? "").trim();
      const roleId = (body?.roleId ?? "").trim();
      const cpuLevel = body?.cpuLevel === "easy" || body?.cpuLevel === "hard" || body?.cpuLevel === "normal" ? body.cpuLevel : "normal";
      if (name && !isValidName(name)) {
        return new Response(jsonText({ message: "invalid_name" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      if (!roleId) {
        return new Response(jsonText({ message: "roleId is required." }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
      const result = await this.initSolo(roomId, deckId, name || "Player", roleId, cpuLevel);
      this.broadcastState();
      return new Response(jsonText(result), { headers: { "content-type": "application/json; charset=utf-8" } });
    }

    if (this.engine && request.method === "POST") {
      const engine = this.requireEngine();
      const body = (await request.json().catch(() => null)) as any;
      try {
        switch (url.pathname) {
          case "/draw": {
            const { playerId, count } = body ?? {};
            if (!playerId) throw new Error("playerId is required.");
            engine.drawCardsAsAction(playerId, typeof count === "number" ? count : 1);
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/play": {
            const { playerId, cardId, targets, choices, handIndex } = body ?? {};
            if (!playerId || !cardId) throw new Error("playerId and cardId are required.");
            engine.playCard(playerId, cardId, { targets, choices, handIndex });
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/endTurn": {
            const { playerId } = body ?? {};
            if (!playerId) throw new Error("playerId is required.");
            engine.endTurn(playerId);
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/roleAttack": {
            const { playerId, targetId, struggle } = body ?? {};
            if (!playerId || !targetId) throw new Error("playerId and targetId are required.");
            engine.roleAttack(playerId, targetId, { struggle: Boolean(struggle) });
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/roleAction": {
            const { playerId, actionId, targetId, choices } = body ?? {};
            if (!playerId || !actionId) throw new Error("playerId and actionId are required.");
            engine.roleAction(playerId, actionId, { targetId, choices });
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/resolvePrompt": {
            const { playerId, accepted } = body ?? {};
            if (!playerId) throw new Error("playerId is required.");
            engine.resolvePendingPrompt(playerId, Boolean(accepted));
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/resolveInfoDraw": {
            const { playerId, cardId } = body ?? {};
            if (!playerId || !cardId) throw new Error("playerId and cardId are required.");
            engine.resolveInfoDraw(playerId, cardId);
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
          case "/rescueBra": {
            const { playerId } = body ?? {};
            if (!playerId) throw new Error("playerId is required.");
            engine.rescueBra(playerId);
            await this.persist();
            this.broadcastState();
            return new Response(jsonText({ state: engine.getState() }), { headers: { "content-type": "application/json; charset=utf-8" } });
          }
        }
      } catch (e) {
        return new Response(jsonText({ message: (e as Error).message }), { status: 400, headers: { "content-type": "application/json; charset=utf-8" } });
      }
    }

    if (url.pathname === "/state" && request.method === "GET") {
      const engine = this.requireEngine();
      return new Response(jsonText(engine.getState()), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return createTextResponse("Expected websocket", { status: 400 });
      }
      if (!isAllowedOrigin(request.headers.get("Origin"), this._env)) {
        return createTextResponse("Forbidden", { status: 403 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      this.sockets.add(server);
      this.setSocketAttachment(server, { joined: false });
      this.sendCurrentStateTo(server);
      return new Response(null, { status: 101, webSocket: client, headers: createSecurityHeaders() });
    }

    return createTextResponse("Not found", { status: 404 });
  }
}
