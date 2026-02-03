const state = {
  ws: null,
  roomCode: "",
  playerId: "",
  name: "",
  roomState: null,
  publicState: null,
  privateState: null,
  prompt: null,
  selectedCards: [],
  cardDefs: [],
  lastError: "",
};

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
    nameInput.value = storedName;
    state.name = storedName;
  }

  document.getElementById("createRoomBtn").addEventListener("click", handleCreateRoom);
  document.getElementById("joinRoomBtn").addEventListener("click", handleJoinRoom);
  document.getElementById("startGameBtn").addEventListener("click", () => send({ type: "start" }));
  document.getElementById("playBtn").addEventListener("click", handlePlay);

  nameInput.addEventListener("input", (e) => {
    state.name = e.target.value;
    localStorage.setItem("ttwbe.name", state.name);
  });
}

async function handleCreateRoom() {
  const name = state.name || document.getElementById("nameInput").value.trim();
  if (!name) return alert("名前を入力してください");
  try {
    const res = await fetch(`${apiBase()}/api/room/create`, { method: "POST" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`create failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    state.roomCode = data.roomCode;
    state.playerId = data.playerId;
    localStorage.setItem(`ttwbe.${state.roomCode}.playerId`, state.playerId);
    connectWebSocket(state.roomCode, state.playerId, name);
    document.getElementById("roomInput").value = state.roomCode;
  } catch (err) {
    console.error(err);
    showError(err.message || "ルーム作成に失敗しました");
  }
}

function handleJoinRoom() {
  const roomCode = document.getElementById("roomInput").value.trim().toUpperCase();
  const name = state.name || document.getElementById("nameInput").value.trim();
  if (!roomCode) return alert("ルームコードを入力してください");
  if (!name) return alert("名前を入力してください");
  // 新規参加を優先（同ブラウザで2人目をテストするため、既存IDは使わない）
  state.playerId = "";
  state.roomCode = roomCode;
  connectWebSocket(roomCode, state.playerId, name);
}

function connectWebSocket(roomCode, playerId, name) {
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
    ws.send(JSON.stringify({ type: "join", name, playerId }));
    localStorage.setItem(`ttwbe.${roomCode}.playerId`, playerId);
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
        state.privateState = msg.payload;
        state.prompt = msg.payload?.prompt || null;
        if (msg.payload?.playerId) {
          state.playerId = msg.payload.playerId;
          if (state.roomCode) {
            localStorage.setItem(`ttwbe.${state.roomCode}.playerId`, state.playerId);
          }
        }
        render();
        break;
      case "prompt":
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

function handlePlay() {
  const selection = state.selectedCards;
  const pending = state.privateState?.pendingDeclaration;
  if (!pending) {
    showError("先に宣言してください");
    return;
  }
  if (selection.length !== pending.count) {
    showError(`宣言枚数(${pending.count})と一致するカードを選択してください`);
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
  document.getElementById("roomCodeDisplay").textContent = rs?.roomCode || "";
  const api = apiBase() || window.location.origin;
  document.getElementById("connectionStatus").textContent = state.ws ? `connected (${api})` : `disconnected (${api})`;
  const players = rs?.players || [];
  const list = document.getElementById("playerList");
  list.innerHTML = "";
  players.forEach((p) => {
    const div = document.createElement("div");
    div.className = "player-chip";
    const left = document.createElement("div");
    const declared = p.declared && p.declared.length ? `宣言:${p.declared.join("/")}` : "宣言: -";
    const status = p.status === "out" ? "脱落" : "参加中";
    left.innerHTML = `<strong>${p.name}</strong><br><span class="muted">score ${p.score} / ${status} / ${declared}</span>`;
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
    notice.textContent = "ルームを共有して参加者を待ってください。2〜4人推奨。";
  } else if (rs?.stage === "in_round") {
    notice.textContent = "ゲーム進行中。";
  } else if (rs?.stage === "game_over") {
    notice.textContent = "ゲーム終了。";
  } else {
    notice.textContent = "";
  }

  const startBtn = document.getElementById("startGameBtn");
  const isHost = rs?.hostId && rs.hostId === state.playerId;
  startBtn.disabled = !isHost || rs?.stage !== "lobby";

  // show/hide panels
  document.getElementById("lobby").classList.toggle("hidden", false);
  document.getElementById("gamePanel").classList.toggle("hidden", !rs || rs.stage === "lobby");
}

function renderGame() {
  const rs = state.roomState;
  const ps = state.publicState;
  if (!rs || rs.stage === "lobby") return;

  const shortCode = rs.roomCode ? rs.roomCode.slice(0, 6) : "-";
  const meta = document.getElementById("gameMeta");
  meta.innerHTML = `
    <span class="pill label">ルーム</span><span class="pill"><strong>${shortCode}</strong></span>
    <span class="pill label">プレイヤー</span><span class="pill"><strong>${rs.players?.length || 0}</strong>人</span>
    <span class="pill label">手番</span><span class="pill"><strong>${playerName(rs.activePlayerId)}</strong></span>
  `;

  document.getElementById("roundInfo").textContent = `Round ${rs.round || 0} / Cycle ${rs.cycle || 1}`;
  document.getElementById("turnInfo").textContent = rs.activePlayerId
    ? `手番: ${playerName(rs.activePlayerId)}`
    : "手番待ち";

  renderDeclareButtons();
  renderHand();
  renderAttackZone();

  const selectionInfo = document.getElementById("selectionInfo");
  const pending = state.privateState?.pendingDeclaration;
  selectionInfo.textContent = pending ? `宣言: ${pending.count}枚 / 選択: ${state.selectedCards.length}枚` : "宣言を行ってください";

  const playBtn = document.getElementById("playBtn");
  playBtn.disabled = !(state.privateState?.canPlay && pending && state.selectedCards.length === pending.count);
}

function renderDeclareButtons() {
  const container = document.getElementById("declareButtons");
  container.innerHTML = "";
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
  handWrap.innerHTML = "";
  const hand = state.privateState?.hand || [];
  state.selectedCards = state.selectedCards.filter((id) => hand.find((c) => c.id === id));

  hand.forEach((card) => {
    const div = document.createElement("div");
    div.className = "hand-card";
    const def = state.cardDefs.find((d) => d.defId === card.defId);
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.innerHTML = `<strong>${def?.name || card.defId}</strong><br>${def?.description || "効果情報なし"}`;
    div.appendChild(tooltip);
    const img = document.createElement("img");
    img.src = cardImages[card.defId] || cardImages.back;
    img.alt = card.defId;
    div.appendChild(img);

    const idx = state.selectedCards.indexOf(card.id);
    if (idx !== -1) {
      div.classList.add("selected");
      const badge = document.createElement("div");
      badge.className = "order-badge";
      badge.textContent = idx + 1;
      div.appendChild(badge);
    }
    div.addEventListener("click", () => {
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
  zone.innerHTML = "";
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
    meta.textContent = `${playerName(a.ownerId)} → ${playerName(a.targetId)} (${a.type})`;
    card.appendChild(meta);
    zone.appendChild(card);
  });
}

function renderPrompt() {
  const panel = document.getElementById("promptPanel");
  panel.innerHTML = "";
  const prompt = state.prompt || state.privateState?.prompt;
  if (!prompt) return;
  const title = document.createElement("h3");
  title.textContent = "選択が必要です";
  const body = document.createElement("div");
  body.className = "prompt-body";
  const msg = document.createElement("div");
  msg.textContent = prompt.message || "";
  body.appendChild(msg);

  if (prompt.promptType === "selectTarget") {
    const opts = document.createElement("div");
    opts.className = "prompt-options";
    prompt.options.forEach((id) => {
      const btn = document.createElement("button");
      btn.className = "prompt-btn";
      btn.textContent = playerName(id);
      btn.addEventListener("click", () => sendChoose(prompt.requestId, { targetId: id }));
      opts.appendChild(btn);
    });
    body.appendChild(opts);
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
  } else if (prompt.promptType === "exchange") {
    const targetSelect = document.createElement("select");
    prompt.options.targets.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = playerName(id);
      targetSelect.appendChild(opt);
    });
    const ownSelect = document.createElement("select");
    prompt.options.ownHand.forEach((cid) => {
      const opt = document.createElement("option");
      opt.value = cid;
      opt.textContent = `自分のカード ${cid.slice(0, 4)}`;
      ownSelect.appendChild(opt);
    });
    const submit = document.createElement("button");
    submit.className = "btn primary";
    submit.textContent = "交換";
    submit.addEventListener("click", () =>
      sendChoose(prompt.requestId, { targetId: targetSelect.value, ownCardId: ownSelect.value }),
    );
    body.appendChild(targetSelect);
    body.appendChild(ownSelect);
    body.appendChild(submit);
  }

  panel.appendChild(title);
  panel.appendChild(body);
}

function renderLog() {
  const logs = state.publicState?.logs || [];
  const list = document.getElementById("logList");
  list.innerHTML = "";
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
  state.prompt = null;
  renderPrompt();
}

function playerName(id) {
  const p = state.roomState?.players?.find((p) => p.id === id);
  return p ? p.name : "不明";
}

init();
