const state = {
  ws: null,
  roomCode: "",
  playerId: "",
  playerToken: "",
  name: "",
  roomState: null,
  publicState: null,
  privateState: null,
  prompt: null,
  selectedCards: [],
  promptHandCardId: "",
  promptTargetId: "",
  cardDefs: [],
  lastError: "",
};

function clearNode(node) {
  node.replaceChildren();
}

function appendText(parent, tagName, text, className = "") {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

const cardImages = {
  assassin: "./image/assassin.png",
  kill: "./image/kill.png",
  whim: "./image/whim.png",
  exchange: "./image/exchange.png",
  everyone: "./image/everyone.png",
  handoff: "./image/handoff.png",
  deny: "./image/yada.png",
  back: "./image/card_back.png",
};

const DEV_API = "http://localhost:8787";

function apiBase() {
  if (location.protocol === "file:") return DEV_API;
  if (location.hostname === "localhost" && location.port && location.port !== "8787") return DEV_API;
  return "";
}

function wsEndpoint(roomCode) {
  const base = apiBase();
  if (base) {
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${u.host}/api/room/${roomCode}/ws`;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/room/${roomCode}/ws`;
}

function init() {
  const nameInput = document.getElementById("nameInput");
  const storedName = localStorage.getItem("ttwbe.name");
  if (storedName) {
    state.name = normalizeName(storedName);
    nameInput.value = state.name;
  }

  document.getElementById("createRoomBtn").addEventListener("click", handleCreateRoom);
  document.getElementById("joinRoomBtn").addEventListener("click", handleJoinRoom);
  document.getElementById("startGameBtn").addEventListener("click", () => send({ type: "start" }));
  document.getElementById("playBtn").addEventListener("click", handlePlay);

  nameInput.addEventListener("input", (e) => {
    state.name = normalizeName(e.target.value);
    localStorage.setItem("ttwbe.name", state.name);
  });
}

function normalizeName(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 24);
}

function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

async function handleCreateRoom() {
  const name = normalizeName(state.name || document.getElementById("nameInput").value);
  if (!name) return alert("プレイヤー名を入力してください");
  try {
    const res = await fetch(`${apiBase()}/api/room/create`, { method: "POST" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`create failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    state.roomCode = data.roomCode;
    state.playerId = data.playerId;
    state.playerToken = data.playerToken || "";
    localStorage.setItem(`ttwbe.${state.roomCode}.playerId`, state.playerId);
    localStorage.setItem(`ttwbe.${state.roomCode}.playerToken`, state.playerToken);
    connectWebSocket(state.roomCode, state.playerId, state.playerToken, name);
    document.getElementById("roomInput").value = state.roomCode;
  } catch (err) {
    console.error(err);
    showError(err.message || "ルーム作成に失敗しました");
  }
}

function handleJoinRoom() {
  const roomCode = normalizeRoomCode(document.getElementById("roomInput").value);
  const name = normalizeName(state.name || document.getElementById("nameInput").value);
  if (!roomCode) return alert("ルームコードを入力してください");
  if (!name) return alert("プレイヤー名を入力してください");
  // 2タブ検証しやすいよう、参加時は既存 playerId を使わず新規参加を優先する
  state.playerId = "";
  state.playerToken = "";
  state.roomCode = roomCode;
  connectWebSocket(roomCode, state.playerId, state.playerToken, name);
}

function connectWebSocket(roomCode, playerId, playerToken, name) {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  const wsUrl = wsEndpoint(roomCode);
  console.log("WS connect to", wsUrl);
  const ws = new WebSocket(wsUrl);
  state.ws = ws;
  setStatus("connecting");

  ws.addEventListener("open", () => {
    setStatus("connected");
    ws.send(JSON.stringify({ type: "join", name, playerId, playerToken }));
    localStorage.setItem(`ttwbe.${roomCode}.playerId`, playerId);
    localStorage.setItem(`ttwbe.${roomCode}.playerToken`, playerToken);
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    console.log("WS message", msg);
    switch (msg.type) {
      case "hello":
        break;
      case "roomState":
        state.roomState = msg.payload;
        state.cardDefs = msg.payload.cardDefs || state.cardDefs;
        if (!state.playerId && msg.payload.players) {
          const me = msg.payload.players.find((p) => p.name === name);
          if (me) state.playerId = me.id;
        }
        render();
        break;
      case "publicState":
        state.publicState = msg.payload;
        render();
        break;
      case "privateState":
        syncPromptDraftOnChange(msg.payload?.prompt || null);
        state.privateState = msg.payload;
        state.prompt = msg.payload?.prompt || null;
        if (msg.payload?.playerId) {
          state.playerId = msg.payload.playerId;
          state.playerToken = msg.payload.playerToken || state.playerToken;
          if (state.roomCode) {
            localStorage.setItem(`ttwbe.${state.roomCode}.playerId`, state.playerId);
            localStorage.setItem(`ttwbe.${state.roomCode}.playerToken`, state.playerToken);
          }
        }
        render();
        break;
      case "prompt":
        syncPromptDraftOnChange(msg.payload || null);
        state.prompt = msg.payload;
        renderPrompt();
        break;
      case "error":
        showError(msg.payload?.message || "エラーが発生しました");
        break;
      default:
        console.warn("unknown message", msg);
    }
  });

  ws.addEventListener("close", () => {
    setStatus("disconnected");
    showError("WebSocket が切断されました");
  });
}

function setStatus(text) {
  document.getElementById("connectionStatus").textContent = text;
}

function send(obj) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(obj));
  }
}

function activePrompt() {
  return state.prompt || state.privateState?.prompt || null;
}

function promptUsesHandSelection(prompt = activePrompt()) {
  return !!prompt && (prompt.promptType === "exchangeSelect" || prompt.promptType === "everyoneSelect");
}

function resetPromptDraft() {
  state.promptHandCardId = "";
  state.promptTargetId = "";
}

function syncPromptDraftOnChange(nextPrompt) {
  const prevId = activePrompt()?.requestId || null;
  const nextId = nextPrompt?.requestId || null;
  if (prevId !== nextId) resetPromptDraft();
}

function handlePlay() {
  const selection = state.selectedCards;
  const pending = state.privateState?.pendingDeclaration;
  if (!pending) {
    showError("先に宣言してください");
    return;
  }
  if (selection.length !== pending.count) {
    showError(`宣言枚数(${pending.count})と同じ枚数のカードを選んでください`);
    return;
  }
  send({ type: "play", cardIdsInOrder: selection });
  state.selectedCards = [];
  renderHand();
}

function handleDeclare(count) {
  send({ type: "declare", count });
}

function render() {
  renderLobby();
  renderGame();
  renderPrompt();
  renderLog();
  renderErrors();
}

function renderLobby() {
  const rs = state.roomState;
  const api = apiBase() || window.location.origin;
  document.getElementById("connectionStatus").textContent = state.ws ? `connected (${api})` : `disconnected (${api})`;
  const inLobby = rs?.stage === "lobby" || !rs;
  const lobbyTitle = document.getElementById("lobbyTitle");
  if (lobbyTitle) {
    lobbyTitle.textContent = inLobby ? "ロビー" : "プレイヤー";
  }
  const prompt = activePrompt();
  const targetableIds =
    prompt?.promptType === "selectTarget"
      ? new Set(prompt.options || [])
      : prompt?.promptType === "exchangeTarget"
        ? new Set(prompt.options?.targets || [])
        : null;
  const players = rs?.players || [];
  const list = document.getElementById("playerList");
  clearNode(list);
  players.forEach((p) => {
    const div = document.createElement("div");
    div.className = "player-chip";
    const isTargetable = !!targetableIds?.has(p.id);
    if (isTargetable) {
      div.classList.add("targetable");
      if (prompt?.promptType === "exchangeTarget" && state.promptTargetId === p.id) {
        div.classList.add("target-selected");
      }
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `${p.name} を選択`);
      const onSelect = () => {
        if (prompt.promptType === "selectTarget") {
          sendChoose(prompt.requestId, { targetId: p.id });
          return;
        }
        if (prompt.promptType === "exchangeTarget") {
          state.promptTargetId = state.promptTargetId === p.id ? "" : p.id;
          renderLobby();
          renderPrompt();
        }
      };
      div.addEventListener("click", onSelect);
      div.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      });
    }
    const left = document.createElement("div");
    const declared = p.declared && p.declared.length ? `宣言:${p.declared.join("/")}` : "宣言: -";
    const status = p.status === "out" ? "脱落" : "参加中";
    appendText(left, "strong", p.name);
    left.appendChild(document.createElement("br"));
    appendText(left, "span", `score ${p.score} / ${status} / ${declared}`, "muted");
    const right = document.createElement("div");
    right.className = "chip-right";
    if (p.isHost) {
      const badge = document.createElement("span");
      badge.className = "badge host";
      badge.textContent = "HOST";
      right.appendChild(badge);
    }
    if (rs?.activePlayerId === p.id && rs.stage === "in_round") {
      const badge = document.createElement("span");
      badge.className = "badge turn";
      badge.textContent = "TURN";
      right.appendChild(badge);
    }
    div.appendChild(left);
    div.appendChild(right);
    list.appendChild(div);
  });

  const notice = document.getElementById("lobbyNotice");
  if (rs?.stage === "lobby") {
    notice.textContent = "ルームを作成して参加者を待ってください（2〜4人）";
  } else if (rs?.stage === "in_round") {
    notice.textContent = "ゲーム進行中";
  } else if (rs?.stage === "game_over") {
    notice.textContent = "ゲーム終了";
  } else {
    notice.textContent = "";
  }

  const startBtn = document.getElementById("startGameBtn");
  const isHost = rs?.hostId && rs.hostId === state.playerId;
  startBtn.disabled = !isHost || rs?.stage !== "lobby";

  document.getElementById("nameInput").closest(".form-row")?.classList.toggle("hidden", !inLobby);
  document.getElementById("roomInput").closest(".form-row")?.classList.toggle("hidden", !inLobby);
  document.getElementById("createRoomBtn").closest(".button-row")?.classList.toggle("hidden", !inLobby);
  document.querySelector("#lobby .host-actions")?.classList.toggle("hidden", !inLobby);
  notice.classList.toggle("hidden", !inLobby);

  // show/hide panels
  document.getElementById("lobby").classList.toggle("hidden", false);
  document.getElementById("gamePanel").classList.toggle("hidden", !rs || rs.stage === "lobby");
}

function renderGame() {
  const rs = state.roomState;
  if (!rs || rs.stage === "lobby") return;

  const shortCode = rs.roomCode ? rs.roomCode.slice(0, 6) : "-";
  const turnLabel = rs.activePlayerId ? playerName(rs.activePlayerId) : "手番待ち";
  const meta = document.getElementById("gameMeta");
  clearNode(meta);
  appendText(meta, "span", "ルーム", "pill label");
  const roomPill = appendText(meta, "span", "", "pill");
  appendText(roomPill, "strong", shortCode);
  appendText(meta, "span", "プレイヤー", "pill label");
  const playerPill = appendText(meta, "span", "", "pill");
  appendText(playerPill, "strong", `${rs.players?.length || 0}`);
  playerPill.append("人");
  appendText(meta, "span", "手番", "pill label");
  const turnPill = appendText(meta, "span", "", "pill");
  appendText(turnPill, "strong", turnLabel);

  document.getElementById("roundInfo").textContent = `Round ${rs.round || 0} / Cycle ${rs.cycle || 1}`;

  renderDeclareButtons();
  renderHand();
  renderAttackZone();

  const playBtn = document.getElementById("playBtn");
  const pending = state.privateState?.pendingDeclaration;
  playBtn.disabled = !(state.privateState?.canPlay && pending && state.selectedCards.length === pending.count);
}

function renderDeclareButtons() {
  const container = document.getElementById("declareButtons");
  clearNode(container);
  const declared = new Set(state.privateState?.declared || []);
  const pending = state.privateState?.pendingDeclaration;
  [1, 2, 3].forEach((n) => {
    const btn = document.createElement("button");
    btn.className = "declare-btn";
    btn.textContent = n;
    if (declared.has(n)) btn.classList.add("used");
    if (pending?.count === n) btn.classList.add("active");
    const canDeclare = state.privateState?.canDeclare && !declared.has(n);
    btn.disabled = !canDeclare;
    btn.addEventListener("click", () => handleDeclare(n));
    container.appendChild(btn);
  });
}

function renderHand() {
  const handWrap = document.getElementById("handCards");
  clearNode(handWrap);
  const hand = state.privateState?.hand || [];
  const prompt = activePrompt();
  const handPromptMode = promptUsesHandSelection(prompt);
  state.selectedCards = state.selectedCards.filter((id) => hand.find((c) => c.id === id));
  if (state.promptHandCardId && !hand.find((c) => c.id === state.promptHandCardId)) {
    state.promptHandCardId = "";
  }

  hand.forEach((card) => {
    const div = document.createElement("div");
    div.className = "hand-card";
    const def = state.cardDefs.find((d) => d.defId === card.defId);
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    appendText(tooltip, "strong", def?.name || card.defId);
    tooltip.appendChild(document.createElement("br"));
    tooltip.append(def?.description || "効果説明なし");
    div.appendChild(tooltip);
    const img = document.createElement("img");
    img.src = cardImages[card.defId] || cardImages.back;
    img.alt = card.defId;
    div.appendChild(img);

    const idx = state.selectedCards.indexOf(card.id);
    const promptSelected = handPromptMode && state.promptHandCardId === card.id;
    if (idx !== -1 || promptSelected) {
      div.classList.add("selected");
      if (!handPromptMode && idx !== -1) {
        const badge = document.createElement("div");
        badge.className = "order-badge";
        badge.textContent = idx + 1;
        div.appendChild(badge);
      }
    }
    div.addEventListener("click", () => {
      if (handPromptMode) {
        if (prompt?.selected) return;
        state.promptHandCardId = state.promptHandCardId === card.id ? "" : card.id;
        renderHand();
        renderPrompt();
        return;
      }
      const current = state.selectedCards.indexOf(card.id);
      if (current !== -1) {
        state.selectedCards.splice(current, 1);
      } else {
        state.selectedCards.push(card.id);
      }
      renderHand();
      renderGame();
    });

    handWrap.appendChild(div);
  });
}

function renderAttackZone() {
  const zone = document.getElementById("attackZone");
  clearNode(zone);
  const attacks = state.publicState?.attackBoard || [];
  attacks.forEach((a) => {
    const card = document.createElement("div");
    card.className = "card-view";
    const img = document.createElement("img");
    img.src = cardImages[a.defId] || cardImages.back;
    img.alt = a.defId;
    card.appendChild(img);
    const meta = document.createElement("div");
    meta.className = "card-meta";
    meta.textContent = `${playerName(a.ownerId)} -> ${playerName(a.targetId)} (${a.type})`;
    card.appendChild(meta);
    zone.appendChild(card);
  });
}

function renderPrompt() {
  const panel = document.getElementById("promptPanel");
  clearNode(panel);
  const prompt = activePrompt();
  if (!prompt) return;

  const title = document.createElement("h3");
  title.textContent = "選択";
  const body = document.createElement("div");
  body.className = "prompt-body";
  const msg = document.createElement("div");
  msg.textContent = prompt.message || "";
  body.appendChild(msg);

  if (prompt.promptType === "selectTarget") {
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "左のプレイヤー一覧から対象をクリックしてください";
    body.appendChild(hint);
  } else if (prompt.promptType === "direction") {
    const opts = document.createElement("div");
    opts.className = "prompt-options";
    prompt.options.forEach((dir) => {
      const btn = document.createElement("button");
      btn.className = "prompt-btn";
      btn.textContent = dir === "left" ? "左回り" : "右回り";
      btn.addEventListener("click", () => sendChoose(prompt.requestId, { direction: dir }));
      opts.appendChild(btn);
    });
    body.appendChild(opts);
  } else if (prompt.promptType === "exchangeTarget") {
    if (state.promptTargetId && !prompt.options.targets.includes(state.promptTargetId)) {
      state.promptTargetId = "";
    }
    const targetInfo = document.createElement("div");
    targetInfo.className = "muted";
    targetInfo.textContent = state.promptTargetId
      ? `交換相手: ${playerName(state.promptTargetId)}`
      : "左のプレイヤー一覧から交換相手を選んでください";

    const submit = document.createElement("button");
    submit.className = "btn primary";
    submit.textContent = "次へ";
    submit.disabled = !state.promptTargetId;
    submit.addEventListener("click", () => sendChoose(prompt.requestId, { targetId: state.promptTargetId }));
    body.appendChild(targetInfo);
    body.appendChild(submit);
  } else if (prompt.promptType === "exchangeSelect") {
    const partnerInfo = document.createElement("div");
    partnerInfo.className = "muted";
    partnerInfo.textContent = `交換相手: ${playerName(prompt.partnerId)}`;
    body.appendChild(partnerInfo);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = prompt.selected
      ? "カード提出済み。相手の選択待ちです。"
      : state.promptHandCardId
        ? "下の手札で交換するカードを選択済み"
        : "下の手札から交換するカードを1枚選んでください";
    body.appendChild(hint);

    const submit = document.createElement("button");
    submit.className = "btn primary";
    submit.textContent = "決定";
    submit.disabled = !!prompt.selected || !state.promptHandCardId;
    submit.addEventListener("click", () => sendChoose(prompt.requestId, { cardId: state.promptHandCardId }));
    body.appendChild(submit);
  } else if (prompt.promptType === "everyoneSelect") {
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = prompt.selected
      ? "カード提出済み。ほかのプレイヤー待ちです。"
      : state.promptHandCardId
        ? "下の手札で渡すカードを選択済み"
        : "下の手札から渡すカードを1枚選んでください";
    body.appendChild(hint);

    const opts = document.createElement("div");
    opts.className = "prompt-options";

    const submit = document.createElement("button");
    submit.className = "btn primary";
    submit.textContent = "決定";
    submit.disabled = !!prompt.selected || !state.promptHandCardId;
    submit.addEventListener("click", () => sendChoose(prompt.requestId, { cardId: state.promptHandCardId }));
    opts.appendChild(submit);

    if (prompt.canSkip) {
      const skipBtn = document.createElement("button");
      skipBtn.className = "btn ghost";
      skipBtn.textContent = "渡せない";
      skipBtn.disabled = !!prompt.selected;
      skipBtn.addEventListener("click", () => sendChoose(prompt.requestId, { skip: true }));
      opts.appendChild(skipBtn);
    }
    body.appendChild(opts);
  } else if (prompt.promptType === "selectAttack") {
    const opts = document.createElement("div");
    opts.className = "prompt-options";
    prompt.options.forEach((a) => {
      const btn = document.createElement("button");
      btn.className = "prompt-btn";
      btn.textContent = `${a.type}: ${playerName(a.ownerId)} -> ${playerName(state.playerId)}`;
      btn.addEventListener("click", () => sendChoose(prompt.requestId, { attackId: a.attackId }));
      opts.appendChild(btn);
    });
    body.appendChild(opts);
  }

  panel.appendChild(title);
  panel.appendChild(body);
}

function renderLog() {
  const logs = state.publicState?.logs || [];
  const list = document.getElementById("logList");
  clearNode(list);
  logs.slice().reverse().forEach((line) => {
    const div = document.createElement("div");
    div.className = "log-item";
    div.textContent = line;
    list.appendChild(div);
  });
}

function renderErrors() {
  const box = document.getElementById("errorBox");
  box.textContent = state.lastError || "";
}

function showError(msg) {
  state.lastError = msg;
  renderErrors();
  setTimeout(() => {
    if (state.lastError === msg) {
      state.lastError = "";
      renderErrors();
    }
  }, 4000);
}

function sendChoose(requestId, payload) {
  send({ type: "choose", requestId, payload });
  if (payload?.cardId || payload?.ownCardId || payload?.skip) {
    state.promptHandCardId = "";
  }
  renderPrompt();
  renderHand();
}

function playerName(id) {
  const p = state.roomState?.players?.find((p) => p.id === id);
  return p ? p.name : "不明";
}

init();

