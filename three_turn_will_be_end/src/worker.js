const DEFAULT_CONFIG = {
  targetScore: 5,
  maxRounds: null, // null -> プレイヤー数ラウンド
  enableAdvancedCards: false,
};

const CARD_DEFS = [
  {
    defId: "assassin",
    name: "さつじんはん",
    kind: "role",
    needsPrompt: false,
    description: "3サイクル目に出すとラウンド終了。公開で役職確定。",
  },
  {
    defId: "kill",
    name: "ころす",
    kind: "attack",
    needsPrompt: true,
    description: "左右どちらかの隣を指定。対象のターン終了時にまけ。",
  },
  {
    defId: "whim",
    name: "きまぐれ",
    kind: "attack",
    needsPrompt: true,
    description: "対象を指定。対象の手札が0になった瞬間にまけ。",
  },
  {
    defId: "exchange",
    name: "こうかん",
    kind: "move",
    needsPrompt: true,
    description: "対象と1枚交換（相手のカードはランダム）。自分が1枚だけなら無効。",
  },
  {
    defId: "everyone",
    name: "みんな いっしょ",
    kind: "event",
    needsPrompt: true,
    description: "左右どちらかを選び、その方向へ生存プレイヤーが1枚ずつ裏で渡す。",
  },
  {
    defId: "handoff",
    name: "せきにんてんか",
    kind: "move",
    needsPrompt: false,
    description: "自分に刺さっているころす/きまぐれを次の人へ移す。",
  },
  {
    defId: "deny",
    name: "やだ",
    kind: "deny",
    needsPrompt: false,
    description: "前にある攻撃カードを1枚選んで無効化し捨て札へ。",
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
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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

  join(name, playerId) {
    const id = playerId || crypto.randomUUID();
    const existing = this.state.players.get(id);
    if (existing) {
      existing.name = name || existing.name;
      existing.status = existing.status || "active";
      existing.lastSeen = Date.now();
      return existing.id;
    }
    const player = {
      id,
      name: name || "Player",
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
    return id;
  }

  leave(playerId) {
    const player = this.state.players.get(playerId);
    if (!player) return;
    player.lastSeen = Date.now();
    player.socket = null;
    this.log(`プレイヤー ${player.name} が離脱しました（再接続可）`);
  }

  start(playerId) {
    if (this.state.stage !== "lobby") throw new Error("既に開始済みです");
    if (playerId !== this.state.hostId) throw new Error("ホストのみ開始できます");
    const pc = this.state.players.size;
    if (pc < 2) throw new Error("2人以上で開始してください");
    if (pc > 4) throw new Error("最大4人までを想定しています");

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
    this.log(`ゲーム開始。ラウンド1、サイクル1、手番は ${this.activePlayer().name}`);
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
    if (!player || player.status !== "active") throw new Error("無効なプレイヤーです");
    if (this.state.stage !== "in_round") throw new Error("現在はラウンド中ではありません");
  }

  declare(playerId, count) {
    this.ensureActive(playerId);
    if (![1, 2, 3].includes(count)) throw new Error("宣言は1/2/3のみです");
    const player = this.state.players.get(playerId);
    if (player.declared.has(count)) throw new Error("同じ枚数は宣言できません");
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
      const promptOrResult = this.resolveCard(pending.playerId, card, choice);
      if (promptOrResult && promptOrResult.type === "prompt") {
        pending.awaiting = { card, prompt: promptOrResult.prompt, resume: promptOrResult.resume };
        return { prompt: promptOrResult.prompt };
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
    if (!pending || !pending.awaiting) throw new Error("処理待ちの操作はありません");
    if (pending.playerId !== playerId) throw new Error("あなたの操作ではありません");
    const { prompt, resume, card } = pending.awaiting;
    if (prompt.requestId !== requestId) throw new Error("無効なリクエストIDです");
    const result = resume(payload);
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
    if (!def) throw new Error("未知のカードです");

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
              message: "左右どちらかを選んでください",
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
              message: "対象プレイヤーを選択してください",
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
              promptType: "exchange",
              options: {
                targets,
                ownHand: this.state.players.get(playerId).hand.map((c) => c.id),
              },
              message: "交換する相手と自分のカードを選んでください（相手はランダム）",
            },
            resume: (payload) => this.applyExchange(playerId, payload),
          };
        }
        const ok = this.applyExchange(playerId, choice);
        if (ok !== true) throw new Error(ok || "交換に失敗しました");
        return;
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
              message: "左回り or 右回りを選択してください",
            },
            resume: (payload) => {
              if (!payload || !dirs.includes(payload.direction)) return "無効な方向です";
              this.applyEveryone(playerId, payload.direction);
              return true;
            },
          };
        }
        if (!dirs.includes(choice.direction)) throw new Error("無効な方向です");
        this.applyEveryone(playerId, choice.direction);
        return;
      }
      case "handoff": {
        this.applyHandoff(playerId);
        return;
      }
      case "deny": {
        const attacks = this.state.attackBoard.filter((e) => e.targetId === playerId && (e.type === "kill" || e.type === "whim"));
        if (attacks.length === 0) {
          this.log(`${player.name} の「やだ」は無効でした（攻撃なし）`);
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
              message: "無効化する攻撃カードを1つ選んでください",
            },
            resume: (payload) => {
              if (!payload || !payload.attackId) return "攻撃を1つ選択してください";
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

  applyExchange(playerId, payload) {
    if (!payload || !payload.targetId || !payload.ownCardId) return "必要な情報が足りません";
    const self = this.state.players.get(playerId);
    const target = this.state.players.get(payload.targetId);
    if (!target || target.status !== "active") return "対象が無効です";
    if (self.hand.length <= 1) return "手札1枚のため交換は無効です";
    if (target.hand.length === 0) return "対象の手札がありません";
    const ownIdx = self.hand.findIndex((c) => c.id === payload.ownCardId);
    if (ownIdx === -1) return "選択したカードが見つかりません";

    const ownCard = self.hand.splice(ownIdx, 1)[0];
    const targetIdx = Math.floor(Math.random() * target.hand.length);
    const targetCard = target.hand.splice(targetIdx, 1)[0];
    self.hand.push(targetCard);
    target.hand.push(ownCard);

    if (ownCard.defId === "assassin") this.state.assassinHolderId = target.id;
    if (targetCard.defId === "assassin") this.state.assassinHolderId = self.id;

    this.log(`${self.name} と ${target.name} がカードを1枚交換しました`);
    return true;
  }

  applyEveryone(playerId, direction) {
    const order = this.state.turnOrder;
    const aliveOrder = order.filter((id) => this.state.players.get(id).status === "active");
    if (aliveOrder.length < 2) return;
    const dir = direction === "left" ? 1 : -1;
    const transfers = [];
    for (let i = 0; i < aliveOrder.length; i++) {
      const fromId = aliveOrder[i];
      const toId = aliveOrder[(i + dir + aliveOrder.length) % aliveOrder.length];
      const fromPlayer = this.state.players.get(fromId);
      if (fromPlayer.hand.length === 0) continue;
      if (fromId === playerId && fromPlayer.hand.length === 1) continue;
      const card = fromPlayer.hand.shift();
      transfers.push({ card, toId, fromId });
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
      this.log(`${this.state.players.get(playerId).name} が攻撃を ${this.state.players.get(nextId).name} に押し付けました`);
    } else {
      this.log(`${this.state.players.get(playerId).name} の「せきにんてんか」は移すものがありませんでした`);
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
    this.log(`${this.state.players.get(playerId).name} が「やだ」で攻撃を無効化しました（1枚）`);
    return true;
  }

  applyEndOfTurnEffects(playerId) {
    // kill 解決（ターゲットのターン終了時）
    const toRemove = [];
    for (const entry of this.state.attackBoard) {
      if (entry.type !== "kill") continue;
      if (entry.targetId !== playerId) continue;
      const target = this.state.players.get(entry.targetId);
      if (target && target.status === "active") {
        target.status = "out";
        this.log(`${target.name} が「ころす」でまけになりました`);
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
          this.log(`${target.name} は「きまぐれ」でまけになりました`);
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
    else this.log("さつじんはん不在のままラウンド終了");

    const results = this.computeScores(assassinId);
    for (const { playerId, delta, reason: r } of results) {
      const p = this.state.players.get(playerId);
      p.score += delta;
      this.log(`${p.name}: ${delta >= 0 ? "+" : ""}${delta} (${r}) → 合計 ${p.score}`);
    }

    const maxRounds = this.state.config.maxRounds || this.state.players.size;
    const someoneWon = Array.from(this.state.players.values()).some((p) => p.score >= this.state.config.targetScore);
    if (this.state.round >= maxRounds || someoneWon) {
      this.state.stage = "game_over";
      this.log("ゲーム終了条件を満たしました");
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
        if (p.status === "out") outputs.push({ playerId: p.id, delta: -1, reason: "さつじんはんでまけ" });
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
    const prompt = this.state.pendingAction?.awaiting?.prompt || null;
    const isActive = this.activePlayerId() === playerId && player.status === "active";
    return {
      playerId,
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
      switch (type) {
        case "join": {
          const playerId = this.game.join(msg.name, msg.playerId);
          ws._playerId = playerId;
          this.sockets.set(playerId, ws);
          this.broadcastRoomState();
          this.sendPrivate(playerId);
          break;
        }
        case "leave": {
          if (!ws._playerId) throw new Error("未接続です");
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
          throw new Error("未知のメッセージです");
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
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    if (url.pathname === "/api/room/create" && request.method === "POST") {
      const roomCode = makeRoomCode();
      const id = env.ROOM_DO.idFromName(roomCode);
      env.ROOM_DO.get(id);
      const playerId = crypto.randomUUID();
      return new Response(JSON.stringify({ roomCode, playerId }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const match = url.pathname.match(/^\/api\/room\/([A-Z0-9]+)\/ws$/);
    if (match && request.headers.get("Upgrade") === "websocket") {
      const roomCode = match[1];
      const id = env.ROOM_DO.idFromName(roomCode);
      const stub = env.ROOM_DO.get(id);
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  },
};
