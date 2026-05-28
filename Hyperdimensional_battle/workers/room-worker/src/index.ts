export interface Env {
  ROOM_DO: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
}

const ROOM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
] as const;

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "GET") {
      return createTextResponse("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET"
        }
      });
    }

    if (url.pathname === "/health") {
      return createJsonResponse({ ok: true, runtime: "worker" });
    }

    const roomMatch = url.pathname.match(/^\/rooms\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/);
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
  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return createTextResponse("Method Not Allowed", {
        status: 405,
        headers: {
          Allow: "GET"
        }
      });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader?.toLowerCase() === "websocket") {
      if (!isAllowedOrigin(request, this.env)) {
        return createTextResponse("Forbidden", { status: 403 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      server.send(JSON.stringify({ type: "ROOM_STATE_UPDATED", payload: { phase: "lobby", players: [] } }));
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: buildSecurityHeaders()
      });
    }

    return createJsonResponse({
      roomId: this.ctx.id.toString(),
      phase: "lobby",
      players: []
    });
  }
}
