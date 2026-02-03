import { RoomDO } from "./roomDO";

export { RoomDO };

type Env = {
  ROOMS: DurableObjectNamespace;
  KV_CARDS?: KVNamespace;
};

const json = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get("Origin") ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
  };
};

const makeRoomId = (len = 8): string => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("").toUpperCase();
};

const isWs = (request: Request): boolean => request.headers.get("Upgrade") === "websocket";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/health") {
      return json({ status: "ok" }, { headers: corsHeaders(request) });
    }

    // --- KV cards ---
    if (url.pathname === "/api/cards" && request.method === "GET") {
      if (!env.KV_CARDS) {
        return json(
          { message: "KV_CARDS が未設定です（wrangler.toml の kv_namespaces を設定してください）" },
          { status: 501, headers: corsHeaders(request) },
        );
      }
      const payload = await env.KV_CARDS.get("cards.json", { type: "json" }).catch(() => null);
      if (!payload) {
        return json({ message: "cards.json が KV にありません" }, { status: 404, headers: corsHeaders(request) });
      }
      return json(payload, { headers: corsHeaders(request) });
    }

    // --- Rooms (canonical) ---
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      const id = makeRoomId(8);
      return json({ id }, { headers: corsHeaders(request) });
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
        headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8" },
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
      return stub.fetch(nextUrl.toString(), request);
    }

    // --- Compatibility (existing client paths) ---
    if (url.pathname === "/api/matches" && request.method === "POST") {
      const id = makeRoomId(8);
      return json({ matchId: id, id }, { headers: corsHeaders(request) });
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
          headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8" },
        });
      }
      // 互換：Node版は { state } を返すのでwrapする
      return json({ state: JSON.parse(rawText) }, { headers: corsHeaders(request) });
    }

    const matchWsCompat = url.pathname.match(/^\/api\/matches\/([^/]+)\/ws$/);
    if (matchWsCompat && isWs(request)) {
      const roomId = decodeURIComponent(matchWsCompat[1]);
      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      const nextUrl = new URL(request.url);
      nextUrl.pathname = "/ws";
      nextUrl.searchParams.set("roomId", roomId);
      return stub.fetch(nextUrl.toString(), request);
    }

    return new Response("Not found", { status: 404 });
  },
};
