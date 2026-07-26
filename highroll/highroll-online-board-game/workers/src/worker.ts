import { RoomDO } from "./roomDO";
import { getRolesCatalog, listDeckSummaries } from "./highrollCatalog";
import { LobbyIndexDO } from "./lobbyIndexDO";
import { createCorsHeaders, createJsonResponse, createSecurityHeaders } from "./security";

export { RoomDO, LobbyIndexDO };

type Env = {
  ROOMS: DurableObjectNamespace;
  LOBBY_INDEX: DurableObjectNamespace;
  KV_CARDS?: KVNamespace;
  ALLOWED_ORIGINS?: string;
};

const json = (value: unknown, init?: ResponseInit) => createJsonResponse(value, init);

const makeRoomId = (len = 8): string => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("").toUpperCase();
};

const isWs = (request: Request): boolean => request.headers.get("Upgrade") === "websocket";

const withRoomId = (requestUrl: string, pathname: string, roomId: string): string => {
  const nextUrl = new URL(requestUrl);
  nextUrl.pathname = pathname;
  nextUrl.searchParams.set("roomId", roomId);
  return nextUrl.toString();
};

const toJsonResponse = async (
  upstream: Response,
  request: Request,
  env: Env,
  mapper?: (payload: any) => any,
): Promise<Response> => {
  const text = await upstream.text();
  const headers = createSecurityHeaders({
    ...createCorsHeaders(request, env),
    "content-type": "application/json; charset=utf-8",
  });
  if (!upstream.ok) {
    return new Response(text, { status: upstream.status, headers });
  }
  try {
    const parsed = JSON.parse(text);
    return json(mapper ? mapper(parsed) : parsed, { status: upstream.status, headers });
  } catch {
    return new Response(text, { status: upstream.status, headers });
  }
};

const lobbyIndexStub = (env: Env): DurableObjectStub => env.LOBBY_INDEX.get(env.LOBBY_INDEX.idFromName("index"));

const makeLobbySummary = (detail: any): import("../../src/shared/types").LobbySummary | null => {
  if (!detail || typeof detail !== "object") return null;
  const id = typeof detail.id === "string" ? detail.id : null;
  const name = typeof detail.name === "string" ? detail.name : null;
  const deckId = typeof detail.deckId === "string" ? detail.deckId : null;
  const isPrivate = Boolean((detail as any).isPrivate);
  const createdAt = typeof (detail as any).createdAt === "number" ? (detail as any).createdAt : Date.now();
  const players = Array.isArray((detail as any).players) ? (detail as any).players : [];
  if (!id || !name || !deckId) return null;
  return { id, name, isPrivate, deckId, playerCount: players.length, createdAt };
};

const lobbyIndexUpsert = async (env: Env, summary: import("../../src/shared/types").LobbySummary): Promise<void> => {
  const stub = lobbyIndexStub(env);
  await stub.fetch("https://lobby-index/upsert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lobby: summary }),
  });
};

const lobbyIndexRemove = async (env: Env, lobbyId: string): Promise<void> => {
  const stub = lobbyIndexStub(env);
  await stub.fetch("https://lobby-index/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: lobbyId }),
  });
};

const forwardJsonAndUpdateLobbyIndex = async (
  env: Env,
  request: Request,
  lobbyId: string,
  upstream: Promise<Response>,
  indexMode: "upsert" | "remove-on-success" | "none",
): Promise<Response> => {
  const response = await upstream;
  const text = await response.text();
  const headers = createSecurityHeaders({
    ...createCorsHeaders(request, env),
    "content-type": "application/json; charset=utf-8",
  });
  if (!response.ok) {
    return new Response(text, { status: response.status, headers });
  }
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(text, { status: response.status, headers });
  }

  if (indexMode === "remove-on-success") {
    await lobbyIndexRemove(env, lobbyId).catch(() => null);
  } else if (indexMode === "upsert") {
    const summary = makeLobbySummary(parsed?.lobby ?? null);
    if (summary) {
      await lobbyIndexUpsert(env, summary).catch(() => null);
    }
  }

  return json(parsed, { status: response.status, headers });
};

const stripDeckIdFromPlayers = (players: unknown): unknown => {
  if (!Array.isArray(players)) return players;
  return players.map((player) => {
    if (!player || typeof player !== "object") return player;
    const { deckId: _deckId, ...rest } = player as Record<string, unknown>;
    return rest;
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: createSecurityHeaders(createCorsHeaders(request, env)) });
    }

    if (url.pathname === "/health") {
      return json({ status: "ok" }, { headers: createCorsHeaders(request, env) });
    }

    // compatibility: existing client sometimes calls /api/health
    if (url.pathname.match(/^\/api\/health\/?$/) && (request.method === "GET" || request.method === "HEAD")) {
      return json({ status: "ok" }, { headers: createCorsHeaders(request, env) });
    }

    if (url.pathname === "/api/lobbies/ws") {
      const stub = lobbyIndexStub(env);
      return stub.fetch(new Request("https://lobby-index/ws", request));
    }

    // compatibility: existing catalog endpoints
    if (url.pathname.match(/^\/api\/catalog\/roles\/?$/) && request.method === "GET") {
      return json({ roles: getRolesCatalog() }, { headers: createCorsHeaders(request, env) });
    }
    if (url.pathname.match(/^\/api\/catalog\/decks\/?$/) && request.method === "GET") {
      return json({ decks: listDeckSummaries() }, { headers: createCorsHeaders(request, env) });
    }

    // compatibility: existing lobby endpoints (Workers移行前の暫定。今は空配列を返す)
    if (url.pathname.match(/^\/api\/lobbies\/?$/) && request.method === "GET") {
      try {
        const stub = lobbyIndexStub(env);
        const upstream = await stub.fetch("https://lobby-index/list?includePrivate=1", { method: "GET" });
        return toJsonResponse(upstream, request, env);
      } catch {
        return json({ lobbies: [] }, { headers: createCorsHeaders(request, env) });
      }
    }

    if (url.pathname.match(/^\/api\/lobbies\/?$/) && request.method === "POST") {
      const lobbyId = makeRoomId(8);
      const rawBody = (await request.json().catch(() => null)) as any;
      const deckId = String(rawBody?.deckId ?? "default_60").trim() || "default_60";
      const lobbyName = String(rawBody?.lobbyName ?? "").trim();
      const ownerName = String(rawBody?.ownerName ?? "").trim();
      const password = String(rawBody?.password ?? "").trim() || undefined;

      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = await stub.fetch(withRoomId(request.url, "/lobby/init", lobbyId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckId, lobbyName, ownerName, password }),
      });

      const text = await upstream.text();
      const headers = createSecurityHeaders({
        ...createCorsHeaders(request, env),
        "content-type": "application/json; charset=utf-8",
      });
      if (!upstream.ok) {
        return new Response(text, { status: upstream.status, headers });
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return new Response(text, { status: upstream.status, headers });
      }

      const summary = makeLobbySummary(parsed?.lobby ?? null);
      if (summary) {
        await lobbyIndexUpsert(env, summary).catch(() => null);
      }

      return json({ lobbyId, ...parsed }, { status: upstream.status, headers });
    }

    const lobbyGet = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/?$/);
    if (lobbyGet && request.method === "GET") {
      const lobbyId = decodeURIComponent(lobbyGet[1]);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = await stub.fetch(withRoomId(request.url, "/lobby", lobbyId), { method: "GET" });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, Promise.resolve(upstream), "upsert");
    }

    const lobbyJoin = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/join\/?$/);
    if (lobbyJoin && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyJoin[1]);
      const rawBody = (await request.json().catch(() => null)) as any;
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/join", lobbyId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: rawBody?.name, password: rawBody?.password }),
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbyRole = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/role\/?$/);
    if (lobbyRole && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyRole[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/role", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbyReady = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/ready\/?$/);
    if (lobbyReady && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyReady[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/ready", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbyStart = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/start\/?$/);
    if (lobbyStart && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyStart[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/start", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "remove-on-success");
    }

    const lobbySettings = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/settings\/?$/);
    if (lobbySettings && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbySettings[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/settings", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbyTeam = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/team\/?$/);
    if (lobbyTeam && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyTeam[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/team", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbySpectator = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/spectator\/?$/);
    if (lobbySpectator && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbySpectator[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/spectator", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbyCpu = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/cpu\/?$/);
    if (lobbyCpu && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyCpu[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = stub.fetch(withRoomId(request.url, "/lobby/cpu", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });
      return forwardJsonAndUpdateLobbyIndex(env, request, lobbyId, upstream, "upsert");
    }

    const lobbyLeave = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/leave\/?$/);
    if (lobbyLeave && request.method === "POST") {
      const lobbyId = decodeURIComponent(lobbyLeave[1]);
      const rawBody = await request.text();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(lobbyId));
      const upstream = await stub.fetch(withRoomId(request.url, "/lobby/leave", lobbyId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });

      const text = await upstream.text();
      const headers = createSecurityHeaders({
        ...createCorsHeaders(request, env),
        "content-type": "application/json; charset=utf-8",
      });
      if (!upstream.ok) {
        return new Response(text, { status: upstream.status, headers });
      }
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return new Response(text, { status: upstream.status, headers });
      }
      if (parsed?.removed) {
        await lobbyIndexRemove(env, lobbyId).catch(() => null);
      } else {
        const summary = makeLobbySummary(parsed?.lobby ?? null);
        if (summary) {
          await lobbyIndexUpsert(env, summary).catch(() => null);
        }
      }
      return json(parsed, { status: upstream.status, headers });
    }

    // --- KV cards ---
    if (url.pathname === "/api/cards" && request.method === "GET") {
      if (!env.KV_CARDS) {
        return json(
          { message: "KV_CARDS が未設定です（wrangler.toml の kv_namespaces を設定してください）" },
          { status: 501, headers: createCorsHeaders(request, env) },
        );
      }
      const payload = await env.KV_CARDS.get("cards.json", { type: "json" }).catch(() => null);
      if (!payload) {
        return json({ message: "cards.json が KV にありません" }, { status: 404, headers: createCorsHeaders(request, env) });
      }
      return json(payload, { headers: createCorsHeaders(request, env) });
    }

    // --- Rooms (canonical) ---
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const id = makeRoomId(8);
      return json({ id }, { headers: createCorsHeaders(request, env) });
    }

    const roomState = url.pathname.match(/^\/api\/rooms\/([^/]+)\/state$/);
    if (roomState && request.method === "GET") {
      const roomId = decodeURIComponent(roomState[1]);
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/state";
      nextUrl.searchParams.set("roomId", roomId);
      const resp = await stub.fetch(nextUrl.toString(), { method: "GET" });
      const text = await resp.text();
      return new Response(text, {
        status: resp.status,
        headers: createSecurityHeaders({
          ...createCorsHeaders(request, env),
          "content-type": "application/json; charset=utf-8",
        }),
      });
    }

    const roomWs = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (roomWs && isWs(request)) {
      const roomId = decodeURIComponent(roomWs[1]);
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/ws";
      nextUrl.searchParams.set("roomId", roomId);
      return stub.fetch(new Request(nextUrl.toString(), request));
    }

    // --- Compatibility (existing client paths) ---
    if (url.pathname === "/api/matches" && request.method === "POST") {
      const matchId = makeRoomId(8);
      const rawBody = (await request.json().catch(() => null)) as any;
      const rawPlayers = rawBody?.players;
      const players = stripDeckIdFromPlayers(rawPlayers);
      const deckId =
        String(rawBody?.deckId ?? rawPlayers?.[0]?.deckId ?? "default_60").trim() || "default_60";

      const stub = env.ROOMS.get(env.ROOMS.idFromName(matchId));
      const upstream = await stub.fetch(withRoomId(request.url, "/init", matchId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckId, players }),
      });

      return toJsonResponse(upstream, request, env, (payload) => ({ matchId, ...payload }));
    }

    if (url.pathname === "/api/matches/solo" && request.method === "POST") {
      const matchId = makeRoomId(8);
      const rawBody = (await request.json().catch(() => null)) as any;
      const stub = env.ROOMS.get(env.ROOMS.idFromName(matchId));
      const upstream = await stub.fetch(withRoomId(request.url, "/solo", matchId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rawBody ?? {}),
      });
      return toJsonResponse(upstream, request, env, (payload) => ({ matchId, ...payload }));
    }

    const matchStateCompat = url.pathname.match(/^\/api\/matches\/([^/]+)$/);
    if (matchStateCompat && request.method === "GET") {
      const roomId = decodeURIComponent(matchStateCompat[1]);
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/state";
      nextUrl.searchParams.set("roomId", roomId);
      const resp = await stub.fetch(nextUrl.toString(), { method: "GET" });
      const rawText = await resp.text();
      if (!resp.ok) {
        return new Response(rawText, {
          status: resp.status,
          headers: createSecurityHeaders({
            ...createCorsHeaders(request, env),
            "content-type": "application/json; charset=utf-8",
          }),
        });
      }
      // 互換：Node版は { state } を返すのでwrapする
      return json({ state: JSON.parse(rawText) }, { headers: createCorsHeaders(request, env) });
    }

    const matchActionCompat = url.pathname.match(
      /^\/api\/matches\/([^/]+)\/(draw|play|endTurn|roleAttack|roleAction|resolvePrompt|resolveInfoDraw|rescueBra)$/,
    );
    if (matchActionCompat && request.method === "POST") {
      const roomId = decodeURIComponent(matchActionCompat[1]);
      const action = matchActionCompat[2];
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      const rawBody = await request.text();

      const upstream = await stub.fetch(withRoomId(request.url, `/${action}`, roomId), {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
        body: rawBody,
      });

      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: createSecurityHeaders({
          ...createCorsHeaders(request, env),
          "content-type": "application/json; charset=utf-8",
        }),
      });
    }

    const matchWsCompat = url.pathname.match(/^\/api\/matches\/([^/]+)\/ws$/);
    if (matchWsCompat && isWs(request)) {
      const roomId = decodeURIComponent(matchWsCompat[1]);
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/ws";
      nextUrl.searchParams.set("roomId", roomId);
      return stub.fetch(new Request(nextUrl.toString(), request));
    }

    const lobbyWsCompat = url.pathname.match(/^\/api\/lobbies\/([^/]+)\/ws$/);
    if (lobbyWsCompat && isWs(request)) {
      const roomId = decodeURIComponent(lobbyWsCompat[1]);
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/ws";
      nextUrl.searchParams.set("roomId", roomId);
      return stub.fetch(new Request(nextUrl.toString(), request));
    }

    return new Response("Not found", {
      status: 404,
      headers: createSecurityHeaders(createCorsHeaders(request, env)),
    });
  },
};
