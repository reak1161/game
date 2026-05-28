const DEFAULT_CONFIG = {
  targetScore: 5,
  maxRounds: null, // null -> プレイヤー人数ラウンド
  enableAdvancedCards: false,
};

const PRODUCTION_ORIGINS = new Set(["https://three-turn.reak1161.com"]);
const MAX_WS_MESSAGE_BYTES = 8192;
const MAX_WS_MESSAGES_PER_10S = 80;

const CARD_DEFS = [
  {
    defId: "assassin",
    name: "さつじんはん",
    kind: "role",
    needsPrompt: false,
    description: "3サイクル目に公開される役職カード。ラウンド終了時の得点計算に使う。",
  },
  {
    defId: "kill",
    name: "ころす",
    kind: "attack",
    needsPrompt: true,
    description: "左右どちらかの隣に置く。対象のターン終了時に脱落させる。",
  },
  {
    defId: "whim",
    name: "きまぐれ",
    kind: "attack",
    needsPrompt: true,
    description: "対象に置く。対象の手札が0枚になった瞬間に脱落する。",
  },
  {
    defId: "exchange",
    name: "こうかん",
    kind: "move",
    needsPrompt: true,
    description: "対象と1枚交換。交換するカードはお互いに手札から1枚ずつ選ぶ。自分が1枚だけなら無効。",
  },
  {
    defId: "everyone",
    name: "みんな いっしょ",
    kind: "event",
    needsPrompt: true,
    description: "左右どちらかへ回す。全員が手札から1枚選んで同時に渡す。",
  },
  {
    defId: "handoff",
    name: "せきにんてんか",
    kind: "move",
    needsPrompt: false,
    description: "自分に向けられている『ころす』『きまぐれ』を次の人へ移す。",
  },
  {
    defId: "deny",
    name: "やだ",
    kind: "deny",
    needsPrompt: false,
    description: "自分にある攻撃カードを1枚選んで打ち消す。",
  },
];

function buildBaseDeck(playerCount) {
  const defs = [
    { defId: "assassin", count: 1 },
    { defId: "kill", count: 4 },
    { defId: "whim", count: 4 },
    { defId: "exchange", count: 4 },
    { defId: "everyone", count: 4 },
    { defId: "handoff", count: 4 },
    { defId: "deny", count: 4 },
  ];
  const totalNeeded = playerCount * 6;
  const deck = [];
  deck.push({ id: crypto.randomUUID(), defId: "assassin" });
  const pool = [];
  defs.forEach(({ defId, count }) => {
    for (let i = 0; i < count; i++) {
      if (defId === "assassin") continue;
      pool.push({ id: crypto.randomUUID(), defId });
    }
  });
  if (deck.length + pool.length < totalNeeded) throw new Error("カード枚数が不足しています");
  shuffle(pool);
  while (deck.length < totalNeeded) deck.push(pool.shift());
  shuffle(deck);
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function seatOrderFrom(players, startId) {
  const ids = Array.from(players.keys());
  const startIdx = ids.indexOf(startId);
  if (startIdx < 0) return ids;
  return ids.slice(startIdx).concat(ids.slice(0, startIdx));
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizePlayerName(value) {
  const name = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 24);
  return name || "Player";
}

function normalizePlayerId(value) {
  const id = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function normalizeToken(value) {
  return normalizePlayerId(value);
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  if (origin === "null" && isLocalHost(requestUrl.hostname)) return true;

  try {
    const originUrl = new URL(origin);
    return isLocalHost(originUrl.hostname) && isLocalHost(requestUrl.hostname);
  } catch {
    return false;
  }
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };
}

function corsHeaders(request) {
  const headers = {
    ...securityHeaders(),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const origin = request.headers.get("Origin");
  if (origin && isAllowedOrigin(request)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(request, body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
      ...(init.headers || {}),
    },
  });
}

class RoomGame {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.state = {
      roomCode,
      hostId: null,
      players: new Map(),
      stage: "lobby",
      round: 0,
      cycle: 0,
      turnOrder: [],
      turnCursor: 0,
      deck: [],
      discard: [],
      attackBoard: [],
      assassinHolderId: null,
      assassinPlayedBy: null,
      logs: [],
      pendingDeclaration: null,
      pendingAction: null,
      config: { ...DEFAULT_CONFIG },
    };
  }

  log(message) {
    const entry = `${new Date().toLocaleTimeString("ja-JP", { hour12: false })} ${message}`;
    this.state.logs.push(entry);
  }

  join(name, playerId, playerToken) {
    const safeName = normalizePlayerName(name);
    const candidateId = normalizePlayerId(playerId);
    const token = normalizeToken(playerToken) || crypto.randomUUID();
    const id = candidateId || crypto.randomUUID();
    const existing = this.state.players.get(id);
    if (existing) {
      if (!existing.token || existing.token !== token) throw new Error("プレイヤー認証に失敗しました");
      existing.name = safeName || existing.name;
      existing.status = existing.status || "active";
      existing.lastSeen = Date.now();
      return { playerId: existing.id, playerToken: existing.token };
    }
    const player = {
      id,
      token,
      name: safeName,
      isHost: this.state.players.size === 0,
      score: 0,
      hand: [],
      declared: new Set(),
      status: "active",
      lastSeen: Date.now(),
    };
    this.state.players.set(id, player);
    if (player.isHost) this.state.hostId = id;
    this.log(`プレイヤー ${player.name} が参加しました`);
    return { playerId: id, playerToken: token };
  }

  leave(playerId) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    player.lastSeen = Date.now();
    player.socket = null;
    this.log(`プレイヤー ${player.name} が切断しました（再接続待ち）`);
  }

  start(playerId) {
    if (this.state.stage !== "lobby") throw new Error("すでに開始済みです");
    if (playerId !== this.state.hostId) throw new Error("ホストのみ開始できます");
    const pc = this.state.players.size;
    if (pc < 2) throw new Error("2人以上で開始してください");
    if (pc > 4) throw new Error("最大4人までです");

    const deck = buildBaseDeck(pc);
    const order = seatOrderFrom(this.state.players, this.state.hostId);
    this.state.turnOrder = order;
    this.state.turnCursor = 0;
    this.state.round = 1;
    this.state.cycle = 1;
    this.state.stage = "in_round";
    this.state.deck = deck;
    this.state.discard = [];
    this.state.attackBoard = [];
    this.state.assassinHolderId = null;
    this.state.assassinPlayedBy = null;
    this.state.pendingDeclaration = null;
    this.state.pendingAction = null;
    for (const p of this.state.players.values()) {
      p.hand = [];
      p.declared = new Set();
      p.status = "active";
    }
    // 配札
    for (let i = 0; i < 6; i++) {
      for (const id of order) {
        const card = this.state.deck.shift();
        if (!card) throw new Error("山札が不足しています");
        this.state.players.get(id).hand.push(card);
        if (card.defId === "assassin") this.state.assassinHolderId = id;
      }
    }
    this.log(`ゲーム開始。ラウンド1、サイクル1。手番は ${this.activePlayer().name}`);
  }

  activePlayerId() {
    if (!this.state.turnOrder.length) return null;
    return this.state.turnOrder[this.state.turnCursor];
  }

  activePlayer() {
    return this.state.players.get(this.activePlayerId());
  }

  ensureActive(playerId) {
    if (playerId !== this.activePlayerId()) throw new Error("現在の手番ではありません");
    const player = this.state.players.get(playerId);
    if (!player || player.status !== "active") throw new Error("有効なプレイヤーではありません");
    if (this.state.stage !== "in_round") throw new Error("現在はラウンド進行中ではありません");
  }

  declare(playerId, count) {
    this.ensureActive(playerId);
    if (![1, 2, 3].includes(count)) throw new Error("宣言は1/2/3のみです");
    const player = this.state.players.get(playerId);
    if (player.declared.has(count)) throw new Error("その枚数はすでに宣言済みです");
    this.state.pendingDeclaration = { playerId, count };
    player.declared.add(count);
    this.log(`${player.name} が ${count} 枚を宣言しました`);
  }

  play(playerId, cardIdsInOrder, providedChoices = {}) {
    this.ensureActive(playerId);
    if (!this.state.pendingDeclaration || this.state.pendingDeclaration.playerId !== playerId) {
      throw new Error("先に宣言してください");
    }
    const expected = this.state.pendingDeclaration.count;
    if (!Array.isArray(cardIdsInOrder) || cardIdsInOrder.length !== expected) {
      throw new Error(`宣言枚数と一致するカードを選んでください（${expected}枚）`);
    }
    const player = this.state.players.get(playerId);
    const handIds = new Set(player.hand.map((c) => c.id));
    for (const id of cardIdsInOrder) if (!handIds.has(id)) throw new Error("手札にないカードが含まれています");

    const orderedCards = cardIdsInOrder.map((id) => {
      const idx = player.hand.findIndex((c) => c.id === id);
      return player.hand.splice(idx, 1)[0];
    });

    if (this.state.assassinHolderId === playerId && orderedCards.some((c) => c.defId === "assassin")) {
      this.state.assassinHolderId = null;
      this.state.assassinPlayedBy = playerId;
    }

    this.state.pendingAction = {
      playerId,
      remaining: orderedCards,
      providedChoices,
      awaiting: null,
    };
    return this.processPendingAction();
  }

  processPendingAction() {
    const pending = this.state.pendingAction;
    if (!pending) return;
    while (pending.remaining.length > 0) {
      const card = pending.remaining[0];
      const choice = pending.providedChoices[card.id];
      const outcome = this.resolveCard(pending.playerId, card, choice);
      if (outcome && outcome.type === "prompt") {
        pending.awaiting = { kind: "single", card, prompt: outcome.prompt, resume: outcome.resume };
        return { prompt: outcome.prompt };
      }
      if (outcome && outcome.type === "awaiting") {
        pending.awaiting = outcome.awaiting;
        return { prompt: this.promptForAwaitingPlayer(pending.awaiting, pending.playerId) };
      }
      this.state.discard.push(card);
      pending.remaining.shift();
      this.checkWhimsyTriggers();
    }
    this.state.pendingDeclaration = null;
    this.state.pendingAction = null;
    this.applyEndOfTurnEffects(pending.playerId);
    this.advanceTurn();
    return { done: true };
  }

  handleChoose(playerId, requestId, payload) {
    const pending = this.state.pendingAction;
    if (!pending || !pending.awaiting) throw new Error("選択待ちがありません");
    if (pending.awaiting.kind === "everyone_select") {
      return this.handleEveryoneChoose(playerId, requestId, payload);
    }
    if (pending.awaiting.kind === "exchange_select") {
      return this.handleExchangeChoose(playerId, requestId, payload);
    }
    if (pending.playerId !== playerId) throw new Error("あなたの選択ではありません");
    const { prompt, resume, card } = pending.awaiting;
    if (prompt.requestId !== requestId) throw new Error("無効なリクエストIDです");
    const result = resume(payload);
    if (result && result.type === "awaiting") {
      pending.awaiting = result.awaiting;
      return { prompt: this.promptForAwaitingPlayer(pending.awaiting, playerId) };
    }
    if (result !== true) throw new Error(result || "選択が無効です");
    this.state.discard.push(card);
    pending.remaining.shift();
    pending.awaiting = null;
    this.checkWhimsyTriggers();
    return this.processPendingAction() || { done: true };
  }

  resolveCard(playerId, card, choice) {
    const def = CARD_DEFS.find((d) => d.defId === card.defId);
    const player = this.state.players.get(playerId);
    if (!def) throw new Error("未定義のカードです");

    switch (card.defId) {
      case "assassin": {
        this.log(`${player.name} が「さつじんはん」を公開しました`);
        this.state.assassinPlayedBy = playerId;
        if (this.state.cycle >= 3) this.endRound("assassin_played");
        return;
      }
      case "kill": {
        const options = this.neighborOptions(playerId);
        if (!choice) {
          const requestId = crypto.randomUUID();
          return {
            type: "prompt",
            prompt: {
              requestId,
              promptType: "selectTarget",
              options,
              message: "左右どちらかの隣を選んでください",
            },
            resume: (payload) => {
              if (!payload || !options.includes(payload.targetId)) return "無効な対象です";
              this.applyKill(card, playerId, payload.targetId);
              return true;
            },
          };
        }
        if (!options.includes(choice.targetId)) throw new Error("無効な対象です");
        this.applyKill(card, playerId, choice.targetId);
        return;
      }
      case "whim": {
        const options = this.livingOpponents(playerId);
        if (!choice) {
          const requestId = crypto.randomUUID();
          return {
            type: "prompt",
            prompt: {
              requestId,
              promptType: "selectTarget",
              options,
              message: "対象プレイヤーを選んでください",
            },
            resume: (payload) => {
              if (!payload || !options.includes(payload.targetId)) return "無効な対象です";
              this.applyWhim(card, playerId, payload.targetId);
              return true;
            },
          };
        }
        if (!options.includes(choice.targetId)) throw new Error("無効な対象です");
        this.applyWhim(card, playerId, choice.targetId);
        return;
      }
      case "exchange": {
        const targets = this.livingOpponents(playerId).filter((id) => this.state.players.get(id).hand.length > 0);
        if (!choice) {
          const requestId = crypto.randomUUID();
          return {
            type: "prompt",
            prompt: {
              requestId,
              promptType: "exchangeTarget",
              options: {
                targets,
              },
              message: "交換相手を選んでください（カードはお互いに後で選びます）",
            },
            resume: (payload) => this.startExchangeSelection(playerId, card, payload),
          };
        }
        return this.startExchangeSelection(playerId, card, choice);
      }
      case "everyone": {
        const dirs = ["left", "right"];
        if (!choice) {
          const requestId = crypto.randomUUID();
          return {
            type: "prompt",
            prompt: {
              requestId,
              promptType: "direction",
              options: dirs,
              message: "左右どちらへ回すか選んでください",
            },
            resume: (payload) => {
              if (!payload || !dirs.includes(payload.direction)) return "無効な方向です";
              return this.startEveryoneSelection(playerId, payload.direction, card);
            },
          };
        }
        if (!dirs.includes(choice.direction)) throw new Error("無効な方向です");
        return this.startEveryoneSelection(playerId, choice.direction, card);
      }
      case "handoff": {
        this.applyHandoff(playerId);
        return;
      }
      case "deny": {
        const attacks = this.state.attackBoard.filter((e) => e.targetId === playerId && (e.type === "kill" || e.type === "whim"));
        if (attacks.length === 0) {
          this.log(`${player.name} の「やだ」は不発でした（対象の攻撃なし）`);
          return;
        }
        if (!choice) {
          const requestId = crypto.randomUUID();
          return {
            type: "prompt",
            prompt: {
              requestId,
              promptType: "selectAttack",
              options: attacks.map((a) => ({
                attackId: a.id,
                ownerId: a.ownerId,
                type: a.type,
              })),
              message: "打ち消す攻撃カードを1枚選んでください",
            },
            resume: (payload) => {
              if (!payload || !payload.attackId) return "攻撃カードを1枚選んでください";
              return this.applyYadaChoice(playerId, payload.attackId);
            },
          };
        }
        const res = this.applyYadaChoice(playerId, choice.attackId);
        if (res !== true) throw new Error(res || "やだの処理に失敗しました");
        return;
      }
      default:
        throw new Error("未実装のカードです");
    }
  }

  applyKill(card, playerId, targetId) {
    this.state.attackBoard.push({
      id: card.id,
      card,
      ownerId: playerId,
      targetId,
      type: "kill",
    });
    this.log(`${this.state.players.get(playerId).name} が ${this.state.players.get(targetId).name} に「ころす」を置きました`);
  }

  applyWhim(card, playerId, targetId) {
    this.state.attackBoard.push({
      id: card.id,
      card,
      ownerId: playerId,
      targetId,
      type: "whim",
    });
    this.log(`${this.state.players.get(playerId).name} が ${this.state.players.get(targetId).name} に「きまぐれ」を置きました`);
  }

  startExchangeSelection(playerId, sourceCard, payload) {
    if (!payload || !payload.targetId) return "交換相手を選んでください";
    const self = this.state.players.get(playerId);
    const target = this.state.players.get(payload.targetId);
    if (!target || target.status !== "active") return "対象が無効です";
    if (self.hand.length <= 1) return "手札1枚では交換できません";
    if (target.hand.length === 0) return "対象の手札がありません";
    return {
      type: "awaiting",
      awaiting: {
        kind: "exchange_select",
        card: sourceCard,
        requestId: crypto.randomUUID(),
        ownerId: playerId,
        targetId: target.id,
        selectedByPlayer: {},
      },
    };
  }

  promptForAwaitingPlayer(awaiting, playerId) {
    if (!awaiting) return null;
    if (awaiting.kind === "exchange_select") {
      if (![awaiting.ownerId, awaiting.targetId].includes(playerId)) return null;
      const selected = Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, playerId);
      const partnerId = playerId === awaiting.ownerId ? awaiting.targetId : awaiting.ownerId;
      return {
        requestId: awaiting.requestId,
        promptType: "exchangeSelect",
        selected,
        partnerId,
        ownerId: awaiting.ownerId,
        targetId: awaiting.targetId,
        message:
          playerId === awaiting.ownerId
            ? `こうかん: ${this.state.players.get(awaiting.targetId)?.name || "対象"} と交換するカードを選んでください`
            : `こうかん: ${this.state.players.get(awaiting.ownerId)?.name || "相手"} と交換するカードを選んでください`,
      };
    }
    if (awaiting.kind !== "everyone_select") return awaiting.prompt || null;
    if (!awaiting.participantIds.includes(playerId)) return null;
    const selected = Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, playerId);
    const waitingCount = awaiting.participantIds.filter(
      (id) => !Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, id),
    ).length;
    return {
      requestId: awaiting.requestId,
      promptType: "everyoneSelect",
      canSkip: !!awaiting.canSkipByPlayer[playerId],
      selected,
      direction: awaiting.direction,
      waitingCount,
      message: `みんな いっしょ（${awaiting.direction === "left" ? "左回り" : "右回り"}）で渡すカードを選んでください`,
    };
  }

  startEveryoneSelection(playerId, direction, sourceCard) {
    const aliveOrder = this.state.turnOrder.filter((id) => this.state.players.get(id).status === "active");
    if (aliveOrder.length < 2) return true;
    const awaiting = {
      kind: "everyone_select",
      card: sourceCard,
      requestId: crypto.randomUUID(),
      initiatorId: playerId,
      direction,
      participantIds: aliveOrder,
      canSkipByPlayer: {},
      selectedByPlayer: {},
    };
    for (const id of aliveOrder) {
      const p = this.state.players.get(id);
      awaiting.canSkipByPlayer[id] = !p || p.hand.length === 0;
    }
    return { type: "awaiting", awaiting };
  }

  handleEveryoneChoose(playerId, requestId, payload) {
    const pending = this.state.pendingAction;
    const awaiting = pending?.awaiting;
    if (!awaiting || awaiting.kind !== "everyone_select") throw new Error("選択待ちがありません");
    if (awaiting.requestId !== requestId) throw new Error("無効なリクエストIDです");
    if (!awaiting.participantIds.includes(playerId)) throw new Error("この選択には参加できません");
    if (Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, playerId)) {
      throw new Error("すでに選択済みです");
    }

    const canSkip = !!awaiting.canSkipByPlayer[playerId];
    const player = this.state.players.get(playerId);
    if (payload?.skip) {
      if (!canSkip) throw new Error("このプレイヤーはカードを選んで渡してください");
      awaiting.selectedByPlayer[playerId] = null;
    } else {
      const cardId = payload?.cardId;
      if (!cardId) throw new Error("渡すカードを1枚選んでください");
      if (!player || !player.hand.some((c) => c.id === cardId)) {
        throw new Error("選択したカードが手札にありません");
      }
      awaiting.selectedByPlayer[playerId] = cardId;
    }

    const done = awaiting.participantIds.every((id) => Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, id));
    if (!done) return { waiting: true };

    this.applyEveryoneSelections(awaiting.initiatorId, awaiting.direction, awaiting.selectedByPlayer);
    this.state.discard.push(awaiting.card);
    pending.remaining.shift();
    pending.awaiting = null;
    this.checkWhimsyTriggers();
    return this.processPendingAction() || { done: true };
  }

  handleExchangeChoose(playerId, requestId, payload) {
    const pending = this.state.pendingAction;
    const awaiting = pending?.awaiting;
    if (!awaiting || awaiting.kind !== "exchange_select") throw new Error("選択待ちがありません");
    if (awaiting.requestId !== requestId) throw new Error("無効なリクエストIDです");
    if (![awaiting.ownerId, awaiting.targetId].includes(playerId)) throw new Error("この選択には参加できません");
    if (Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, playerId)) throw new Error("すでに選択済みです");

    const cardId = payload?.cardId;
    if (!cardId) throw new Error("交換するカードを1枚選んでください");
    const player = this.state.players.get(playerId);
    if (!player || !player.hand.some((c) => c.id === cardId)) throw new Error("選択したカードが手札にありません");
    awaiting.selectedByPlayer[playerId] = cardId;

    const done =
      Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, awaiting.ownerId) &&
      Object.prototype.hasOwnProperty.call(awaiting.selectedByPlayer, awaiting.targetId);
    if (!done) return { waiting: true };

    const owner = this.state.players.get(awaiting.ownerId);
    const target = this.state.players.get(awaiting.targetId);
    const ownerIdx = owner.hand.findIndex((c) => c.id === awaiting.selectedByPlayer[awaiting.ownerId]);
    const targetIdx = target.hand.findIndex((c) => c.id === awaiting.selectedByPlayer[awaiting.targetId]);
    if (ownerIdx === -1 || targetIdx === -1) throw new Error("交換カードが見つかりません");
    const ownerCard = owner.hand.splice(ownerIdx, 1)[0];
    const targetCard = target.hand.splice(targetIdx, 1)[0];
    owner.hand.push(targetCard);
    target.hand.push(ownerCard);
    if (ownerCard.defId === "assassin") this.state.assassinHolderId = target.id;
    if (targetCard.defId === "assassin") this.state.assassinHolderId = owner.id;

    this.log(`${owner.name} と ${target.name} が互いに選んだカードを交換しました`);
    this.state.discard.push(awaiting.card);
    pending.remaining.shift();
    pending.awaiting = null;
    this.checkWhimsyTriggers();
    return this.processPendingAction() || { done: true };
  }

  applyEveryoneSelections(playerId, direction, selectedByPlayer) {
    const order = this.state.turnOrder;
    const aliveOrder = order.filter((id) => this.state.players.get(id).status === "active");
    if (aliveOrder.length < 2) return;
    const dir = direction === "left" ? 1 : -1;
    const transfers = [];

    for (let i = 0; i < aliveOrder.length; i++) {
      const fromId = aliveOrder[i];
      const toId = aliveOrder[(i + dir + aliveOrder.length) % aliveOrder.length];
      const fromPlayer = this.state.players.get(fromId);
      const chosenCardId = selectedByPlayer[fromId];
      if (chosenCardId == null) continue;
      const cardIdx = fromPlayer.hand.findIndex((c) => c.id === chosenCardId);
      if (cardIdx === -1) throw new Error("みんな いっしょの選択カードが不正です");
      const card = fromPlayer.hand.splice(cardIdx, 1)[0];
      transfers.push({ card, toId });
      if (card.defId === "assassin") this.state.assassinHolderId = null;
    }

    transfers.forEach(({ card, toId }) => {
      const p = this.state.players.get(toId);
      p.hand.push(card);
      if (card.defId === "assassin") this.state.assassinHolderId = toId;
    });
    this.log(`${this.state.players.get(playerId).name} の「みんな いっしょ」でカードが回りました（${direction}）`);
  }

  applyHandoff(playerId) {
    const order = this.state.turnOrder;
    const idx = order.indexOf(playerId);
    const nextId = this.nextAliveFromIndex(idx);
    const moved = [];
    for (const entry of this.state.attackBoard) {
      if (entry.targetId === playerId && (entry.type === "kill" || entry.type === "whim")) {
        entry.targetId = nextId;
        moved.push(entry);
      }
    }
    if (moved.length > 0) {
      this.log(`${this.state.players.get(playerId).name} が攻撃を ${this.state.players.get(nextId).name} に移しました`);
    } else {
      this.log(`${this.state.players.get(playerId).name} の「せきにんてんか」は移す攻撃がありませんでした`);
    }
  }

  applyYadaChoice(playerId, attackId) {
    let removed = null;
    this.state.attackBoard = this.state.attackBoard.filter((e) => {
      if (e.targetId === playerId && e.id === attackId) {
        removed = e;
        return false;
      }
      return true;
    });
    if (!removed) return "選択した攻撃が見つかりません";
    this.state.discard.push(removed.card);
    this.log(`${this.state.players.get(playerId).name} が「やだ」で攻撃を1枚打ち消しました`);
    return true;
  }

  applyEndOfTurnEffects(playerId) {
    // kill 解決（対象プレイヤーのターン終了時）
    const toRemove = [];
    for (const entry of this.state.attackBoard) {
      if (entry.type !== "kill") continue;
      if (entry.targetId !== playerId) continue;
      const target = this.state.players.get(entry.targetId);
      if (target && target.status === "active") {
        target.status = "out";
        this.log(`${target.name} は「ころす」で脱落しました`);
        if (entry.card.defId === "assassin") this.state.assassinHolderId = null;
        if (this.state.assassinHolderId === target.id) {
          this.state.assassinHolderId = null;
          this.state.assassinPlayedBy = target.id;
        }
      }
      toRemove.push(entry);
    }
    if (toRemove.length > 0) {
      this.state.attackBoard = this.state.attackBoard.filter((e) => !toRemove.includes(e));
      toRemove.forEach((e) => this.state.discard.push(e.card));
    }
    this.checkWhimsyTriggers();
  }

  checkWhimsyTriggers() {
    const removed = [];
    for (const entry of this.state.attackBoard) {
      if (entry.type === "whim") {
        const target = this.state.players.get(entry.targetId);
        if (target && target.status === "active" && target.hand.length === 0) {
          target.status = "out";
          this.log(`${target.name} は「きまぐれ」で脱落しました`);
          removed.push(entry);
        }
      }
    }
    if (removed.length > 0) {
      this.state.attackBoard = this.state.attackBoard.filter((e) => !removed.includes(e));
      removed.forEach((e) => this.state.discard.push(e.card));
    }
  }

  livingOpponents(playerId) {
    return Array.from(this.state.players.values())
      .filter((p) => p.id !== playerId && p.status === "active")
      .map((p) => p.id);
  }

  neighborOptions(playerId) {
    const order = this.state.turnOrder.filter((id) => this.state.players.get(id).status === "active");
    if (order.length <= 1) return [];
    const idx = order.indexOf(playerId);
    if (idx === -1) return [];
    const left = order[(idx + 1) % order.length];
    const right = order[(idx - 1 + order.length) % order.length];
    if (left === right) return [left];
    return [left, right];
  }

  nextAliveFromIndex(idx) {
    const n = this.state.turnOrder.length;
    for (let i = 1; i <= n; i++) {
      const id = this.state.turnOrder[(idx + i) % n];
      const p = this.state.players.get(id);
      if (p && p.status === "active") return id;
    }
    return this.state.turnOrder[idx];
  }

  advanceTurn() {
    if (this.state.stage !== "in_round") return;
    const total = this.state.turnOrder.length;
    let hops = 0;
    do {
      this.state.turnCursor = (this.state.turnCursor + 1) % total;
      hops++;
      if (this.state.turnCursor === 0) this.state.cycle += 1;
      const candidate = this.state.players.get(this.activePlayerId());
      if (candidate && candidate.status === "active") break;
    } while (hops <= total * 3);

    const active = this.activePlayer();
    this.log(`手番が ${active.name} に移りました（サイクル${this.state.cycle}）`);
    if (this.state.cycle > 3 || this.shouldEndRound()) this.endRound("cycle_limit");
  }

  shouldEndRound() {
    if (this.state.assassinPlayedBy && this.state.cycle >= 3) return true;
    if (this.state.assassinHolderId) {
      const holder = this.state.players.get(this.state.assassinHolderId);
      if (holder && holder.status === "out") return true;
    }
    return false;
  }

  endRound() {
    if (this.state.stage !== "in_round") return;
    this.state.stage = "round_end";
    let assassinId = this.state.assassinHolderId || this.state.assassinPlayedBy;
    if (!assassinId) {
      const holder = Array.from(this.state.players.values()).find((p) => p.hand.some((c) => c.defId === "assassin"));
      assassinId = holder ? holder.id : null;
    }
    const assassinPlayer = assassinId ? this.state.players.get(assassinId) : null;
    if (assassinPlayer) this.log(`さつじんはんは ${assassinPlayer.name} でした`);
    else this.log("さつじんはんの所在を特定できませんでした");

    const results = this.computeScores(assassinId);
    for (const { playerId, delta, reason: r } of results) {
      const p = this.state.players.get(playerId);
      p.score += delta;
      this.log(`${p.name}: ${delta >= 0 ? "+" : ""}${delta} (${r}) 竊・蜷郁ｨ・${p.score}`);
    }

    const maxRounds = this.state.config.maxRounds || this.state.players.size;
    const someoneWon = Array.from(this.state.players.values()).some((p) => p.score >= this.state.config.targetScore);
    if (this.state.round >= maxRounds || someoneWon) {
      this.state.stage = "game_over";
      this.log("ゲーム終了。最終結果を計算しました");
      return;
    }

    this.state.round += 1;
    this.state.cycle = 1;
    this.state.stage = "in_round";
    this.state.attackBoard = [];
    this.state.discard = [];
    this.state.pendingAction = null;
    this.state.pendingDeclaration = null;
    this.state.assassinPlayedBy = null;
    this.state.assassinHolderId = null;
    for (const p of this.state.players.values()) {
      p.declared = new Set();
      p.status = "active";
      p.hand = [];
    }
    const deck = buildBaseDeck(this.state.players.size);
    this.state.deck = deck;
    const startId = assassinId || this.state.hostId;
    this.state.turnOrder = seatOrderFrom(this.state.players, startId);
    this.state.turnCursor = 0;
    for (let i = 0; i < 6; i++) {
      for (const id of this.state.turnOrder) {
        const card = this.state.deck.shift();
        if (!card) throw new Error("山札が不足しています");
        this.state.players.get(id).hand.push(card);
        if (card.defId === "assassin") this.state.assassinHolderId = id;
      }
    }
    this.log(`ラウンド${this.state.round} 開始。開始プレイヤーは ${this.activePlayer().name}`);
  }

  computeScores(assassinId) {
    const outputs = [];
    const allOthersOut =
      assassinId && Array.from(this.state.players.values()).every((p) => p.id === assassinId || p.status === "out");

    for (const p of this.state.players.values()) {
      if (p.id === assassinId) {
        if (p.status === "out") outputs.push({ playerId: p.id, delta: -1, reason: "さつじんはんで負け" });
        else outputs.push({ playerId: p.id, delta: 0, reason: "さつじんはん生存" });
      } else {
        if (p.status === "out") outputs.push({ playerId: p.id, delta: allOthersOut ? -1 : 1, reason: "まけ" });
        else outputs.push({ playerId: p.id, delta: 2, reason: "かち" });
      }
    }
    return outputs;
  }

  buildRoomState() {
    return {
      roomCode: this.state.roomCode,
      hostId: this.state.hostId,
      stage: this.state.stage,
      round: this.state.round,
      cycle: this.state.cycle,
      activePlayerId: this.activePlayerId(),
      players: Array.from(this.state.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        status: p.status,
        handCount: p.hand.length,
        declared: Array.from(p.declared),
        isHost: p.isHost,
      })),
      cardDefs: CARD_DEFS,
    };
  }

  buildPublicState() {
    return {
      attackBoard: this.state.attackBoard.map((a) => ({
        id: a.id,
        defId: a.card.defId,
        ownerId: a.ownerId,
        targetId: a.targetId,
        type: a.type,
      })),
      deckCount: this.state.deck.length,
      discardCount: this.state.discard.length,
      logs: this.state.logs.slice(-20),
      assassinHolderId: this.state.assassinHolderId ? "secret" : null,
      assassinPlayedBy: this.state.assassinPlayedBy,
      round: this.state.round,
      cycle: this.state.cycle,
    };
  }

  buildPrivateState(playerId) {
    const player = this.state.players.get(playerId);
    if (!player) return null;
    const prompt = this.promptForAwaitingPlayer(this.state.pendingAction?.awaiting || null, playerId);
    const isActive = this.activePlayerId() === playerId && player.status === "active";
    return {
      playerId,
      playerToken: player.token,
      hand: player.hand,
      pendingDeclaration: this.state.pendingDeclaration?.playerId === playerId ? this.state.pendingDeclaration : null,
      prompt,
      canDeclare: isActive && !this.state.pendingDeclaration,
      canPlay: isActive && !!this.state.pendingDeclaration && !this.state.pendingAction?.awaiting,
      declared: Array.from(player.declared),
    };
  }
}

export class RoomDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.game = new RoomGame(state.id.toString());
    this.sockets = new Map();
  }

  async fetch(request) {
    if (!isAllowedOrigin(request)) return new Response("Forbidden", { status: 403, headers: securityHeaders() });
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") return new Response("Not a websocket", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.handleWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleWebSocket(ws) {
    ws.accept();
    ws.addEventListener("message", (event) => {
      try {
        const size = typeof event.data === "string" ? event.data.length : event.data?.byteLength || 0;
        if (size > MAX_WS_MESSAGE_BYTES) {
          this.safeSend(ws, { type: "error", payload: { code: "too_large", message: "メッセージが大きすぎます" } });
          return;
        }

        const now = Date.now();
        if (!ws._rate || now - ws._rate.start > 10000) ws._rate = { start: now, count: 0 };
        ws._rate.count += 1;
        if (ws._rate.count > MAX_WS_MESSAGES_PER_10S) {
          this.safeSend(ws, { type: "error", payload: { code: "rate_limited", message: "送信回数が多すぎます" } });
          ws.close(1008, "rate limit");
          return;
        }

        const msg = JSON.parse(event.data);
        this.routeMessage(ws, msg);
      } catch (err) {
        this.safeSend(ws, { type: "error", payload: { code: "bad_json", message: err.message } });
      }
    });
    ws.addEventListener("close", () => {
      if (ws._playerId) this.sockets.delete(ws._playerId);
    });
  }

  routeMessage(ws, msg) {
    const type = msg?.type;
    try {
      if (!msg || typeof msg !== "object" || typeof type !== "string") throw new Error("メッセージ形式が不正です");
      switch (type) {
        case "join": {
          const { playerId } = this.game.join(msg.name, msg.playerId, msg.playerToken);
          ws._playerId = playerId;
          this.sockets.set(playerId, ws);
          this.broadcastRoomState();
          this.sendPrivate(playerId);
          break;
        }
        case "leave": {
          if (!ws._playerId) throw new Error("未参加です");
          this.game.leave(ws._playerId);
          this.sockets.delete(ws._playerId);
          this.broadcastRoomState();
          break;
        }
        case "start": {
          this.game.start(ws._playerId);
          this.broadcastRoomState();
          this.broadcastPublic();
          this.broadcastPrivates();
          break;
        }
        case "declare": {
          this.game.declare(ws._playerId, msg.count);
          this.broadcastRoomState();
          this.broadcastPublic();
          this.sendPrivate(ws._playerId);
          break;
        }
        case "play": {
          const res = this.game.play(ws._playerId, msg.cardIdsInOrder, msg.choices || {});
          this.broadcastRoomState();
          this.broadcastPublic();
          this.broadcastPrivates();
          if (res?.prompt) this.safeSend(ws, { type: "prompt", payload: res.prompt });
          break;
        }
        case "choose": {
          const res = this.game.handleChoose(ws._playerId, msg.requestId, msg.payload);
          this.broadcastRoomState();
          this.broadcastPublic();
          this.broadcastPrivates();
          if (res?.prompt) this.safeSend(ws, { type: "prompt", payload: res.prompt });
          break;
        }
        default:
          throw new Error("未対応のメッセージです");
      }
    } catch (err) {
      this.safeSend(ws, { type: "error", payload: { code: "bad_request", message: err.message } });
    }
  }

  broadcastRoomState() {
    const payload = this.game.buildRoomState();
    for (const ws of this.sockets.values()) this.safeSend(ws, { type: "roomState", payload });
  }

  broadcastPublic() {
    const payload = this.game.buildPublicState();
    for (const ws of this.sockets.values()) this.safeSend(ws, { type: "publicState", payload });
  }

  broadcastPrivates() {
    for (const [pid, ws] of this.sockets.entries()) this.sendPrivate(pid, ws);
  }

  sendPrivate(playerId, socketOverride) {
    const ws = socketOverride || this.sockets.get(playerId);
    if (!ws) return;
    const payload = this.game.buildPrivateState(playerId);
    this.safeSend(ws, { type: "privateState", payload });
  }

  safeSend(ws, obj) {
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    } catch {
      // ignore
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: isAllowedOrigin(request) ? 204 : 403, headers: corsHeaders(request) });
    }
    if (!isAllowedOrigin(request)) return new Response("Forbidden", { status: 403, headers: securityHeaders() });

    if (url.pathname === "/api/room/create" && request.method === "POST") {
      const roomCode = makeRoomCode();
      const id = env.ROOM_DO.idFromName(roomCode);
      env.ROOM_DO.get(id);
      const playerId = crypto.randomUUID();
      const playerToken = crypto.randomUUID();
      return jsonResponse(request, { roomCode, playerId, playerToken });
    }

    const match = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4,12})\/ws$/);
    if (match && request.headers.get("Upgrade") === "websocket") {
      const roomCode = match[1];
      const id = env.ROOM_DO.idFromName(roomCode);
      const stub = env.ROOM_DO.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  },
};

