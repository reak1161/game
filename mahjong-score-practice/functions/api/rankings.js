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
  const name = String(input || "").trim().slice(0, 20);
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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const entry = {
    name: normalizeName(body?.name),
    score: toSafeInt(body?.score, { min: 0, max: 999999 }),
    correct: toSafeInt(body?.correct, { min: 0, max: 1000 }),
    total: toSafeInt(body?.total, { min: 1, max: 1000 }),
    timeMs: toSafeInt(body?.timeMs, { min: 0, max: 24 * 60 * 60 * 1000 }),
  };

  if (
    entry.score === null ||
    entry.correct === null ||
    entry.total === null ||
    entry.timeMs === null ||
    entry.correct > entry.total
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

