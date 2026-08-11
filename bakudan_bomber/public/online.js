"use strict";

(() => {
  const NAMES = { bomb: "ばくだん", chain: "れんさぼむ", double: "だぶるぼむ", igniteBomb: "ちゃっかだん", fuse: "どうかせん", flint: "ひうちいし", heal: "おうきゅうしょち", extinguisher: "しょうかき", watch: "ぼうかん", think: "ちょっとかんがえる" };
  const EFFECTS = { bomb: "爆発すると、置かれているプレイヤーに1通常ダメージ。", chain: "隣接している爆弾が起爆したとき、この爆弾も即座に爆発。", double: "爆発すると2通常ダメージ。", igniteBomb: "配置時に導火線を1つ追加し、その導火線へ着火。", fuse: "選んだ爆弾の一番上に導火線を1つ追加。", flint: "選んだ爆弾の一番上の導火線へ着火。", heal: "選んだプレイヤーのライフを1回復。最大ライフは5。", extinguisher: "選んだ爆弾の着火状態を解除。導火線は残る。", watch: "何も起こらない。", think: "山札からカードを1枚引く。" };
  const CARD_COUNTS = { bomb: 18, chain: 5, double: 5, igniteBomb: 5, fuse: 22, flint: 12, heal: 7, extinguisher: 7, watch: 5, think: 6 };
  const BOMB_KEYS = ["bomb", "chain", "double", "igniteBomb"];
  const lobby = document.querySelector("#onlineLobby");
  const nameInput = document.querySelector("#playerName");
  const codeInput = document.querySelector("#roomCodeInput");
  const message = document.querySelector("#lobbyMessage");
  const roomPanel = document.querySelector("#roomPanel");
  const roomCodeLabel = document.querySelector("#roomCodeLabel");
  const playerList = document.querySelector("#roomPlayers");
  const startButton = document.querySelector("#startOnlineButton");
  const storageKey = "bakudan-bomber-player-id";
  const playerId = localStorage.getItem(storageKey) || crypto.randomUUID();
  let socket = null;
  let latestRoom = null;
  let pendingSelection = null;
  let continuedPhaseKey = "";
  const hoverTooltip = document.createElement("div");
  hoverTooltip.className = "hover-tooltip";
  hoverTooltip.hidden = true;
  document.body.appendChild(hoverTooltip);
  localStorage.setItem(storageKey, playerId);

  const showMessage = text => { message.textContent = text; };
  const playerName = () => nameInput.value.trim().slice(0, 16);
  const send = payload => socket?.send(JSON.stringify(payload));

  async function connect(roomCode) {
    if (!playerName()) { showMessage("プレイヤー名を入力してください。"); return; }
    if (!/^[A-Z2-9]{6}$/.test(roomCode)) { showMessage("6文字の参加コードを入力してください。"); return; }
    if (socket) socket.close();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${roomCode}/connect`);
    showMessage("ルームへ接続しています…");
    socket.addEventListener("open", () => send({ type: "join", playerId, name: playerName() }));
    socket.addEventListener("message", event => handleServerMessage(JSON.parse(event.data)));
    socket.addEventListener("close", () => { if (!latestRoom || latestRoom.status === "waiting") showMessage("接続が切れました。もう一度参加してください。"); });
    socket.addEventListener("error", () => showMessage("ルームへ接続できませんでした。"));
  }

  function handleServerMessage(data) {
    if (data.type === "error") { alert(data.message); return; }
    if (data.type !== "room") return;
    latestRoom = data.room;
    if (latestRoom.status === "waiting") renderLobby(latestRoom);
    else {
      lobby.hidden = true; renderOnlineGame(latestRoom);
      const phase = latestRoom.game?.phase;
      if (phase === "choose") continuedPhaseKey = "";
      if (phase === "draw-use" || phase === "use-two-second") {
        const key = `${latestRoom.roomCode}:${latestRoom.game.currentPlayerId}:${phase}`;
        const canControl = latestRoom.mode === "solo-test" || latestRoom.game.currentPlayerId === playerId;
        if (canControl && continuedPhaseKey !== key) {
          continuedPhaseKey = key;
          queueMicrotask(() => handleAction(phase === "draw-use" ? "finishDrawUse" : "useTwoSecond"));
        }
      }
    }
  }

  function renderLobby(room) {
    roomPanel.hidden = false; roomCodeLabel.textContent = room.roomCode;
    playerList.innerHTML = room.players.map(player => `<li><span>${escapeHtml(player.name)}${player.id === room.hostId ? "（ホスト）" : ""}</span><span>${player.connected ? "接続中" : "切断"}</span></li>`).join("");
    startButton.hidden = room.hostId !== playerId;
    showMessage(`${room.players.length} / 5人が参加中`);
  }

  function renderOnlineGame(room) {
    const game = room.game; const self = room.players.find(player => player.id === room.viewerPlayerId); if (!game || !self) return;
    const others = room.players.filter(player => player.id !== self.id);
    document.querySelector("#opponents").innerHTML = others.map(playerPanel).join("");
    const selfChoice = choiceAttrs(`player:${self.id}`);
    document.querySelector("#selfArea").classList.toggle("selectable", Boolean(selfChoice));
    document.querySelector("#selfArea").innerHTML = `<div class="self-target" ${selfChoice}><div class="player-head"><span class="player-name">あなた：${escapeHtml(self.name)}</span><span class="life">${"♥".repeat(self.life)}</span></div><div class="self-grid"><div><div class="player-meta">自分のばくだん</div><div class="bomb-row">${bombsHtml(self.bombs, self.id)}</div></div><div><div class="player-meta">手札 ${game.hand.length} / 7</div><div class="hand">${game.hand.map(card => `<div class="card has-tooltip ${choiceAttrs(`card:${card.id}`) ? "selectable" : ""}" ${choiceAttrs(`card:${card.id}`)} ${tooltipAttrs(card.key)}><strong>${NAMES[card.key]}</strong><span>${cardType(card.key)}</span></div>`).join("")}</div></div></div></div>`;
    document.querySelector("#roundNumber").textContent = game.round;
    document.querySelector("#roundEvent").textContent = game.roundEvent || "まだ発生していません";
    document.querySelector("#deckPile").innerHTML = `山札<br><strong>${game.deckCount}</strong>枚`;
    document.querySelector("#discardPile").innerHTML = `捨て札<br><strong>${game.discardCount}</strong>枚`;
    const log = document.querySelector("#gameLog");
    log.innerHTML = [...game.log].reverse().map(item => `<li>${escapeHtml(item)}</li>`).join("");
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
    const current = room.players.find(player => player.id === game.currentPlayerId);
    const myTurn = (game.currentPlayerId === playerId || room.mode === "solo-test") && room.status === "playing";
    document.querySelector("#statusBar").textContent = pendingSelection?.title || (room.status === "finished" ? `${room.players.find(player => player.id === game.winnerId)?.name || "引き分け"}の勝利！` : myTurn ? `${self.name}のターン：行動を選んでください` : `${current?.name || ""}のターンです`);
    document.querySelector("#actionPanel").innerHTML = onlineActions(game, myTurn);
    document.querySelector("#resetButton").hidden = true;
  }

  function playerPanel(player) {
    const choice = choiceAttrs(`player:${player.id}`);
    return `<article class="player-panel ${choice ? "selectable" : ""} ${latestRoom.game.currentPlayerId === player.id ? "active" : ""} ${!player.isAlive ? "defeated" : ""}" ${choice}><div class="player-head"><span class="player-name">${escapeHtml(player.name)}</span><span class="life">${"♥".repeat(player.life)}</span></div><div class="player-meta">手札 ${player.handCount}枚${player.connected ? "" : " ・ 切断"}</div><div class="bomb-row">${bombsHtml(player.bombs, player.id)}</div></article>`;
  }
  function bombsHtml(bombs, ownerId) {
    const positions = Array.from({ length: bombs.length + 1 }, (_, index) => { const attrs = choiceAttrs(`position:${ownerId}:${index}`); return attrs ? `<button class="insert-position selectable" ${attrs} aria-label="ここに置く">＋</button>` : ""; });
    if (!bombs.length) return positions[0] || '<span class="empty-field">ばくだんなし</span>';
    return bombs.map((bomb, index) => { const choice = choiceAttrs(`bomb:${bomb.id}`); return `${positions[index]}<div class="bomb has-tooltip ${choice ? "selectable" : ""}" ${choice} ${tooltipAttrs(bomb.key)}><div class="fuse-stack">${Array.from({ length: bomb.fuses }, (_, i) => `<i class="fuse ${bomb.lit && i === bomb.fuses - 1 ? "lit" : ""}"></i>`).join("")}</div><div class="bomb-core">${bomb.lit && bomb.fuses === 0 ? "🔥" : "●"}</div><div class="bomb-name">${NAMES[bomb.key]}</div></div>`; }).join("") + positions[bombs.length];
  }
  function cardType(key) { if (BOMB_KEYS.includes(key)) return "ばくだん"; if (key === "fuse") return "導火線"; if (key === "flint") return "着火"; if (["heal", "extinguisher"].includes(key)) return "道具"; return "イベント"; }
  function onlineActions(game, enabled) {
    if (game.phase === "draw-use") return '<div class="action-guidance">引いた後に使うカードを選択中</div>';
    if (game.phase === "use-two-second") return '<div class="action-guidance">2枚目に使うカードを選択中</div>';
    const hand = game.hand.length;
    return [["useDraw", "1枚使って → 1枚引く", hand >= 1], ["drawUse", "1枚引いて → 1枚使う", hand < 7], ["discardDraw", "1枚捨てて → 1枚引く", hand >= 1], ["drawTwo", "2枚引く", hand <= 5], ["useTwo", "2枚使う", hand >= 2]].map(([id, label, ok]) => `<button class="action-button" data-online-action="${id}" ${!enabled || !ok ? "disabled" : ""}>${label}</button>`).join("");
  }

  async function handleAction(mode) {
    const game = latestRoom.game;
    if (mode === "drawTwo" || mode === "drawUse") { send({ type: "action", playerId, mode }); return; }
    if (mode === "discardDraw") { const card = await select("捨てるカードを手札から選んでください", game.hand.map(card => ({ key: `card:${card.id}`, value: card }))); if (card) send({ type: "action", playerId, mode, discardCardId: card.id }); return; }
    const serverMode = mode === "useTwo" ? "useTwoFirst" : mode;
    const prompt = mode === "useTwo" ? "1枚目に使うカードを手札から選んでください" : mode === "useTwoSecond" ? "2枚目に使うカードを手札から選んでください" : "使うカードを手札から選んでください";
    const usableCards = game.hand.filter(isPlayable);
    const card = await select(prompt, usableCards.map(item => ({ key: `card:${item.id}`, value: item }))); if (!card) { continuedPhaseKey = ""; return; }
    const play = await buildPlay(card); if (!play) return;
    send({ type: "action", playerId, mode: serverMode, plays: [play] });
  }

  function isPlayable(card) {
    const players = latestRoom.players.filter(player => player.isAlive);
    const bombs = players.flatMap(player => player.bombs);
    if (BOMB_KEYS.includes(card.key) || ["watch", "think"].includes(card.key)) return true;
    if (card.key === "heal") return players.some(player => player.life < 5);
    if (card.key === "fuse") return bombs.length > 0;
    if (card.key === "flint") return bombs.some(bomb => !bomb.lit);
    if (card.key === "extinguisher") return bombs.some(bomb => bomb.lit);
    return false;
  }

  async function buildPlay(card) {
    const play = { cardId: card.id };
    if (BOMB_KEYS.includes(card.key) || card.key === "heal") { const players = latestRoom.players.filter(player => player.isAlive && (card.key !== "heal" || player.life < 5)); const target = await select("対象のプレイヤーを盤面から選んでください", players.map(player => ({ key: `player:${player.id}`, value: player }))); if (!target) return null; play.targetPlayerId = target.id; if (BOMB_KEYS.includes(card.key)) { const position = await select("＋ボタンを押して、ばくだんを置く位置を選んでください", Array.from({ length: target.bombs.length + 1 }, (_, index) => ({ key: `position:${target.id}:${index}`, value: index }))); if (position === null) return null; play.position = position; } }
    if (["fuse", "flint", "extinguisher"].includes(card.key)) { const bombs = latestRoom.players.flatMap(player => player.bombs.map(bomb => ({ player, bomb }))).filter(item => card.key === "fuse" || (card.key === "flint" ? !item.bomb.lit : item.bomb.lit)); const target = await select("対象のばくだんを盤面から選んでください", bombs.map(item => ({ key: `bomb:${item.bomb.id}`, value: item.bomb }))); if (!target) return null; play.targetBombId = target.id; }
    return play;
  }

  function select(title, options) {
    if (!options.length) { alert("選べる対象がありません。"); return Promise.resolve(null); }
    return new Promise(resolve => {
      pendingSelection = { title, options, resolve };
      renderOnlineGame(latestRoom);
    });
  }

  function choiceAttrs(key) {
    if (!pendingSelection?.options.some(option => option.key === key)) return "";
    return `data-board-choice="${key}" role="button" tabindex="0"`;
  }

  function finishSelection(key) {
    if (!pendingSelection) return;
    const option = pendingSelection.options.find(item => item.key === key); if (!option) return;
    const resolve = pendingSelection.resolve; pendingSelection = null; renderOnlineGame(latestRoom); resolve(option.value);
  }

  function escapeHtml(value) { const element = document.createElement("span"); element.textContent = String(value); return element.innerHTML; }
  function tooltipAttrs(key) { return `data-tooltip="${escapeHtml(EFFECTS[key])}" aria-label="${escapeHtml(`${NAMES[key]}：${EFFECTS[key]}`)}"`; }

  function openDeckDialog() {
    if (!latestRoom?.game) return;
    const game = latestRoom.game;
    const visible = Object.fromEntries(Object.keys(CARD_COUNTS).map(key => [key, 0]));
    for (const card of game.hand) visible[card.key]++;
    for (const key of game.discard || []) visible[key]++;
    const rows = Object.keys(CARD_COUNTS).map(key => `<tr><td><strong>${NAMES[key]}</strong><small>${cardType(key)}</small></td><td>${CARD_COUNTS[key]}</td><td>${visible[key]}</td><td><strong>${Math.max(0, CARD_COUNTS[key] - visible[key])}</strong></td></tr>`).join("");
    document.querySelector("#deckDialogContent").innerHTML = `<p class="deck-total">山札の実残枚数 <strong>${game.deckCount}枚</strong></p><p class="deck-note">カード別の残り候補は、初期投入枚数から自分の手札と捨て札だけを差し引いた枚数です。他プレイヤーの手札や盤面の情報は計算に含みません。</p><div class="deck-table-wrap"><table class="deck-table"><thead><tr><th>カード</th><th>初期</th><th>確認済み</th><th>残り候補</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    document.querySelector("#deckDialog").showModal();
  }

  function showTooltip(target) {
    hoverTooltip.textContent = target.dataset.tooltip;
    hoverTooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const left = Math.min(window.innerWidth - 130, Math.max(130, rect.left + rect.width / 2));
    hoverTooltip.style.left = `${left}px`;
    hoverTooltip.style.top = `${Math.max(8, rect.top - 10)}px`;
  }
  function hideTooltip() { hoverTooltip.hidden = true; }

  document.querySelector("#createRoomButton").addEventListener("click", async () => { if (!playerName()) { showMessage("プレイヤー名を入力してください。"); return; } try { const response = await fetch("/api/rooms", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); codeInput.value = data.roomCode; await connect(data.roomCode); } catch (error) { showMessage(error instanceof Error ? error.message : "ルームを作成できませんでした。"); } });
  document.querySelector("#joinRoomButton").addEventListener("click", () => connect(codeInput.value.trim().toUpperCase()));
  startButton.addEventListener("click", () => send({ type: "start", playerId }));
  document.querySelector("#localPlayButton").addEventListener("click", async () => {
    try {
      const response = await fetch("/api/test-rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (!playerName()) nameInput.value = "テストプレイヤー";
      await connect(data.roomCode);
    } catch (error) { showMessage(error instanceof Error ? error.message : "1人テストを開始できませんでした。"); }
  });
  document.querySelector("#actionPanel").addEventListener("click", event => { const button = event.target.closest("[data-online-action]"); if (button && !button.disabled) handleAction(button.dataset.onlineAction); });
  document.querySelector("#deckPile").addEventListener("click", openDeckDialog);
  document.addEventListener("pointerover", event => { const target = event.target.closest("[data-tooltip]"); if (target) showTooltip(target); });
  document.addEventListener("pointerout", event => { if (event.target.closest("[data-tooltip]")) hideTooltip(); });
  document.addEventListener("focusin", event => { const target = event.target.closest("[data-tooltip]"); if (target) showTooltip(target); });
  document.addEventListener("focusout", event => { if (event.target.closest("[data-tooltip]")) hideTooltip(); });
  document.addEventListener("click", event => { const target = event.target.closest("[data-board-choice]"); if (target) finishSelection(target.dataset.boardChoice); });
  document.addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-board-choice]")) { event.preventDefault(); finishSelection(event.target.dataset.boardChoice); } });
  codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, ""); });
})();
