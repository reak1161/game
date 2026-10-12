export type MultiRoomPhase = "lobby" | "match";
export type AiLevel = "easy" | "normal" | "advanced" | "expert";

export type MultiRoomPlayer = {
  playerId: string;
  displayName: string;
  ready: boolean;
  roleId: string | null;
  joinedAt: string;
  lastSeenAt: string;
  isAi?: boolean;
  aiLevel?: AiLevel;
};

export type MultiRoomState = {
  roomId: string;
  phase: MultiRoomPhase;
  seed: string;
  hostPlayerId: string | null;
  players: MultiRoomPlayer[];
  log: string[];
  updatedAt: string;
  matchPlayers?: Array<{
    playerId: string;
    displayName: string;
    round: number;
    phase: LocalGameState["phase"];
    scoreThisRound: number;
    totalScore: number;
    replayCode?: string;
  }>;
  winnerPlayerIds?: string[];
  game?: LocalGameState;
  viewingPlayerId?: string;
};

export type ReplayRecord = {
  code: string;
  roomId: string;
  seed: string;
  playerId: string;
  displayName: string;
  completedAt: string;
  roleId?: string;
  gameSeed?: string;
  initialGame?: LocalGameState;
  commands?: Array<{ action: string; payload: Record<string, unknown> }>;
  game?: LocalGameState;
  frames?: LocalGameState[];
  expiresAt?: string | null;
  savedAt?: string;
  rankingProtected?: boolean;
};

export type RoomWorkerHealth = {
  ok: boolean;
  runtime?: string;
};

export const MULTI_PLAYER_ID_STORAGE_KEY = "hyperdimensional_battle_multi_player_id";
export const MULTI_PLAYER_NAME_STORAGE_KEY = "hyperdimensional_battle_multi_player_name";

function createRandomToken(length = 8) {
  let token = "";
  while (token.length < length) {
    token += Math.random().toString(36).slice(2);
  }
  return token.slice(0, length);
}

function safeLocalStorageGet(key: string) {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function getOrCreateMultiPlayerId() {
  if (typeof window === "undefined") {
    return `player_${createRandomToken(10)}`;
  }
  const saved = safeLocalStorageGet(MULTI_PLAYER_ID_STORAGE_KEY);
  if (saved) {
    return saved;
  }
  const created = `player_${createRandomToken(10)}`;
  safeLocalStorageSet(MULTI_PLAYER_ID_STORAGE_KEY, created);
  return created;
}

export function loadMultiPlayerName() {
  if (typeof window === "undefined") {
    return "";
  }
  return safeLocalStorageGet(MULTI_PLAYER_NAME_STORAGE_KEY) ?? "";
}

export function saveMultiPlayerName(name: string) {
  safeLocalStorageSet(MULTI_PLAYER_NAME_STORAGE_KEY, name);
}

export function loadStoredMultiPlayerName() {
  if (typeof window === "undefined") {
    return "";
  }
  return safeLocalStorageGet(MULTI_PLAYER_NAME_STORAGE_KEY) ?? "";
}

export function resolveRoomWorkerBaseUrl() {
  const envValue =
    typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_ROOM_WORKER_URL === "string"
      ? import.meta.env.VITE_ROOM_WORKER_URL.trim()
      : "";
  if (envValue) {
    return envValue.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:8787";
  }

  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://127.0.0.1:8787";
  }

  if (hostname === "hdbattle.reak1161.com" || hostname === "hdbattle.pages.dev" || hostname.endsWith(".hdbattle.pages.dev")) {
    return "https://hdbattle-room.reak1161.com";
  }

  throw new Error("VITE_ROOM_WORKER_URL is not configured for production");
}

function createJsonHeaders() {
  return {
    "Content-Type": "application/json"
  };
}

async function parseRoomResponse(response: Response) {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Room request failed (${response.status})`);
  }
  return (await response.json()) as MultiRoomState;
}

export async function fetchRoomWorkerHealth() {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/health`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Health request failed (${response.status})`);
  }
  return (await response.json()) as RoomWorkerHealth;
}

export async function fetchRoomState(roomId: string, playerId?: string, viewPlayerId?: string) {
  const url = new URL(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}`);
  if (playerId) {
    url.searchParams.set("playerId", playerId);
  }
  if (viewPlayerId) {
    url.searchParams.set("viewPlayerId", viewPlayerId);
  }
  const response = await fetch(url);
  return parseRoomResponse(response);
}

export async function fetchReplay(code: string) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/replays/${encodeURIComponent(code)}`);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Replay request failed (${response.status})`);
  }
  return (await response.json()) as ReplayRecord;
}

export async function saveReplay(code: string) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/replays/${encodeURIComponent(code)}/save`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({})
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Replay save request failed (${response.status})`);
  }
  return (await response.json()) as ReplayRecord;
}

export async function submitMatchAction(roomId: string, payload: Record<string, unknown>) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/action`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseRoomResponse(response);
}

export async function joinRoom(roomId: string, payload: { playerId: string; displayName: string; seed?: string }) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/join`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseRoomResponse(response);
}

export async function updateRoomPlayer(
  roomId: string,
  payload: { playerId: string; displayName?: string; ready?: boolean; roleId?: string | null; seed?: string }
) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/player`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify(payload)
  });
  return parseRoomResponse(response);
}

export async function startRoomMatch(roomId: string, playerId: string) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/start`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ playerId })
  });
  return parseRoomResponse(response);
}

export async function returnRoomToLobby(roomId: string, playerId: string) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/lobby`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ playerId })
  });
  return parseRoomResponse(response);
}

export async function addRoomAi(roomId: string, playerId: string, level: AiLevel, roleId = "role_simple") {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/ai`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ playerId, level, roleId })
  });
  return parseRoomResponse(response);
}

export async function leaveRoom(roomId: string, playerId: string) {
  const response = await fetch(`${resolveRoomWorkerBaseUrl()}/rooms/${roomId}/leave`, {
    method: "POST",
    headers: createJsonHeaders(),
    body: JSON.stringify({ playerId })
  });
  return parseRoomResponse(response);
}

export function openRoomSocket(
  roomId: string,
  playerId: string,
  handlers: {
    onState: (state: MultiRoomState) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: () => void;
  }
) {
  const baseUrl = resolveRoomWorkerBaseUrl();
  const websocketUrl = new URL(`${baseUrl}/rooms/${roomId}/ws`);
  websocketUrl.searchParams.set("playerId", playerId);
  websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(websocketUrl.toString());

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", () => handlers.onClose?.());
  socket.addEventListener("error", () => handlers.onError?.());
  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(String(event.data)) as { type: string; payload?: MultiRoomState };
      if (data.type === "ROOM_STATE_UPDATED" && data.payload) {
        handlers.onState(data.payload);
      }
    } catch {
      handlers.onError?.();
    }
  });

  return socket;
}
import type { LocalGameState } from "@hyperdimensional-battle/engine";
