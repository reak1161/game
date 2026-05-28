function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
    ...init,
  });
}

function normalizeName(input) {
  const name = String(input || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 20);
  return name || "Guest";
}

function toSafeInt(value, { min = 0, max = 999999999 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < min || i > max) return null;
  return i;
}

function hasDb(env) {
  return env && env.DB && typeof env.DB.prepare === "function";
}

function isSameOriginRequest(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getClientIp(request) {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureRateLimitTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ranking_rate_limits (
      key TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (key, window_start)
    )`
  ).run();
}

async function checkRateLimit(env, request) {
  const windowSeconds = 60;
  const maxRequests = 10;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const key = await sha256Hex(getClientIp(request));

  await ensureRateLimitTable(env);

  const current = await env.DB.prepare(
    `SELECT count FROM ranking_rate_limits WHERE key = ? AND window_start = ?`
  ).bind(key, windowStart).first();

  if ((current?.count ?? 0) >= maxRequests) {
    return false;
  }

  await env.DB.prepare(
    `INSERT INTO ranking_rate_limits (key, window_start, count)
     VALUES (?, ?, 1)
     ON CONFLICT(key, window_start)
     DO UPDATE SET count = count + 1`
  ).bind(key, windowStart).run();

  return true;
}

function isPlausibleScore(entry) {
  const maxTotal = 100;
  const maxScorePerCorrect = 1500;

  if (entry.total > maxTotal) return false;
  if (entry.correct > entry.total) return false;
  if (entry.score > entry.correct * maxScorePerCorrect) return false;
  return true;
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!hasDb(env)) {
    return json({ ok: false, error: "D1 binding(DB) is not configured." }, { status: 503 });
  }

  const limitParam = new URL(context.request.url).searchParams.get("limit");
  const limit = toSafeInt(limitParam ?? 20, { min: 1, max: 100 }) ?? 20;

  const stmt = env.DB.prepare(
    `SELECT name, score, correct, total, time_ms AS timeMs, created_at AS createdAt
     FROM rankings
     ORDER BY score DESC, time_ms ASC, id ASC
     LIMIT ?`
  ).bind(limit);

  const result = await stmt.all();
  return json({ ok: true, ranking: result.results || [] });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!hasDb(env)) {
    return json({ ok: false, error: "D1 binding(DB) is not configured." }, { status: 503 });
  }

  if (!isSameOriginRequest(request)) {
    return json({ ok: false, error: "Forbidden origin." }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "Expected application/json." }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 4096) {
    return json({ ok: false, error: "Payload too large." }, { status: 413 });
  }

  if (!(await checkRateLimit(env, request))) {
    return json({ ok: false, error: "Rate limit exceeded." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const entry = {
    name: normalizeName(body?.name),
    score: toSafeInt(body?.score, { min: 0, max: 999999 }),
    correct: toSafeInt(body?.correct, { min: 0, max: 100 }),
    total: toSafeInt(body?.total, { min: 1, max: 100 }),
    timeMs: toSafeInt(body?.timeMs, { min: 0, max: 24 * 60 * 60 * 1000 }),
  };

  if (
    entry.score === null ||
    entry.correct === null ||
    entry.total === null ||
    entry.timeMs === null ||
    !isPlausibleScore(entry)
  ) {
    return json({ ok: false, error: "Invalid ranking payload." }, { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO rankings (name, score, correct, total, time_ms)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(entry.name, entry.score, entry.correct, entry.total, entry.timeMs)
    .run();

  const latest = await env.DB.prepare(
    `SELECT name, score, correct, total, time_ms AS timeMs, created_at AS createdAt
     FROM rankings
     ORDER BY score DESC, time_ms ASC, id ASC
     LIMIT 20`
  ).all();

  return json({ ok: true, ranking: latest.results || [] }, { status: 201 });
}
