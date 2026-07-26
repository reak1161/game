export type SecurityEnv = {
  ALLOWED_ORIGINS?: string;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://highroll.reak1161.com",
  ".pages.dev",
] as const;

const DEFAULT_PERMISSION_POLICY =
  "accelerometer=(), autoplay=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()";

function parseAllowedOrigins(env?: SecurityEnv) {
  const values = new Set<string>(DEFAULT_ALLOWED_ORIGINS);
  if (!env?.ALLOWED_ORIGINS) {
    return values;
  }
  for (const part of env.ALLOWED_ORIGINS.split(",")) {
    const value = part.trim();
    if (value) {
      values.add(value);
    }
  }
  return values;
}

function matchesOriginRule(origin: string, rule: string) {
  if (rule.startsWith(".")) {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" && url.hostname.endsWith(rule);
    } catch {
      return false;
    }
  }
  return origin === rule;
}

export function isAllowedOrigin(origin: string | null, env?: SecurityEnv) {
  if (!origin) {
    return false;
  }
  for (const rule of parseAllowedOrigins(env)) {
    if (matchesOriginRule(origin, rule)) {
      return true;
    }
  }
  return false;
}

export function createCorsHeaders(request: Request, env?: SecurityEnv): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(origin, env)) {
    return {
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "Origin",
    };
  }
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export function createSecurityHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("permissions-policy", DEFAULT_PERMISSION_POLICY);
  headers.set("cross-origin-opener-policy", "same-origin");
  return headers;
}

export function createJsonResponse(value: unknown, init?: ResponseInit): Response {
  const headers = createSecurityHeaders(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), {
    ...init,
    headers,
  });
}

export function createTextResponse(body: string, init?: ResponseInit): Response {
  const headers = createSecurityHeaders(init?.headers);
  headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(body, {
    ...init,
    headers,
  });
}
