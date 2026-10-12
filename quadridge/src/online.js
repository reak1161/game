import { SIZE, cells, placement } from './engine.js';
import { compactBattleUi, showBattlePopup } from './battle-ui.js';
import { showHelp } from './help.js';
import { normalizeDisplayName, normalizeRoomCode } from './identity.js';

const app = document.querySelector('#app');
const model = {
  name: sessionStorage.getItem('quadridge:name') || '',
  code: '', token: '', playerId: '', ws: null, ticket: '',
  state: null, selected: 0, rotation: 0, rotations: [0, 0, 0], hover: null,
  error: '', notice: '', connecting: false,
};

const colors = ['blue', 'red'];
const directions = ['上 ↔ 下', '左 ↔ 右'];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function mini(type, turns = 0) {
  const shape = cells(type, turns);
  const width = Math.max(...shape.map(([x]) => x)) + 1;
  const height = Math.max(...shape.map(([, y]) => y)) + 1;
  const occupied = new Set(shape.map(([x, y]) => `${x},${y}`));
  return `<span class="mini" style="--columns:${width}">${Array.from({ length: width * height }, (_, index) =>
    `<i class="${occupied.has(`${index % width},${Math.floor(index / width)}`) ? 'filled' : ''}"></i>`).join('')}</span>`;
}

function setName() {
  const input = app.querySelector('#player-name');
  model.name = normalizeDisplayName(input?.value ?? model.name);
  sessionStorage.setItem('quadridge:name', model.name);
}

async function post(path, data) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  let body;
  try { body = await response.json(); }
  catch { throw new Error('サーバーから応答を受け取れませんでした。'); }
  if (!response.ok) throw new Error(body.error || '処理に失敗しました。');
  return body;
}

function saveSeat(seat) {
  model.code = seat.code;
  model.token = seat.token;
  model.playerId = seat.playerId;
  sessionStorage.setItem(`quadridge:room:${seat.code}`, JSON.stringify(seat));
}

function loadSeat(code) {
  try {
    const seat = JSON.parse(sessionStorage.getItem(`quadridge:room:${code}`) || 'null');
    if (seat?.code === code && typeof seat.token === 'string') return seat;
  } catch { /* 保存データが壊れていれば再参加する。 */ }
  return null;
}

function navigate(path) {
  if (model.ws) { model.ws.close(); model.ws = null; }
  history.pushState({}, '', path);
  model.error = ''; model.notice = ''; model.hover = null;
  route();
}

function route() {
  const match = location.pathname.match(/^\/room\/([A-Za-z0-9]{6})$/);
  if (match) {
    const code = normalizeRoomCode(match[1]);
    const seat = loadSeat(code);
    if (seat) {
      const previousCode = model.code;
      saveSeat(seat);
      if (!model.ws || previousCode !== code || model.ws.readyState > 1) {
        if (model.ws) model.ws.close();
        model.state = null;
        connectRoom();
      }
      renderRoom();
    } else {
      model.code = code;
      renderInvite();
    }
  } else if (location.pathname === '/room') {
    if (model.name) renderRoomMenu();
    else { history.replaceState({}, '', '/'); renderHome(); }
  } else if (location.pathname === '/random') {
    renderRandom();
  } else {
    renderHome();
  }
}

function frame(content, extra = '') {
  app.innerHTML = `<div class="online-shell ${extra}"><header class="online-header"><a class="brand" href="/">QUADRIDGE <span>クアドリッジ</span></a><span class="eyebrow">CONNECT THE EDGES</span></header>${content}</div>`;
}

function renderHome() {
  frame(`<main class="online-card home-card"><h1>対岸を、つなげ。</h1><label for="player-name">プレイヤー名</label><input id="player-name" maxlength="16" autocomplete="nickname" value="${escapeHtml(model.name)}" placeholder="名前を入力" /><div class="mode-actions"><button id="random-mode" class="primary">ランダムバトル</button><button id="room-mode" class="quiet">ルームバトル</button></div><p class="online-error" role="alert">${escapeHtml(model.error)}</p><a class="local-link" href="/local">同じ端末で2人対戦</a></main>`);
  app.querySelector('#random-mode').addEventListener('click', async () => {
    try { setName(); await startRandom(); } catch (caught) { model.error = caught.message; renderHome(); }
  });
  app.querySelector('#room-mode').addEventListener('click', () => {
    try { setName(); navigate('/room'); } catch (caught) { model.error = caught.message; renderHome(); }
  });
}

function renderRoomMenu() {
  frame(`<main class="online-card"><button class="back-link" id="back-home">← ホーム</button><div class="eyebrow">ROOM BATTLE</div><h1>ルームバトル</h1><p class="home-lead"><strong>${escapeHtml(model.name)}</strong> として参加します。</p><div class="mode-actions"><button id="create-room" class="primary">ルーム作成</button></div><div class="room-join"><label for="room-code">ルームIDで参加</label><div class="join-row"><input id="room-code" maxlength="6" autocomplete="off" placeholder="ABC123" /><button id="join-room" class="quiet">参加</button></div></div><p class="online-error" role="alert">${escapeHtml(model.error)}</p></main>`);
  app.querySelector('#back-home').addEventListener('click', () => navigate('/'));
  app.querySelector('#create-room').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try { enterRoom(await post('/api/rooms', { displayName: model.name })); }
    catch (caught) { model.error = caught.message; renderRoomMenu(); }
  });
  const join = async () => {
    try {
      const code = normalizeRoomCode(app.querySelector('#room-code').value);
      enterRoom(await post(`/api/rooms/${code}/join`, { displayName: model.name }));
    } catch (caught) { model.error = caught.message; renderRoomMenu(); }
  };
  app.querySelector('#join-room').addEventListener('click', join);
  app.querySelector('#room-code').addEventListener('keydown', event => { if (event.key === 'Enter') join(); });
}

function renderInvite() {
  frame(`<main class="online-card"><button class="back-link" id="back-home">← ホーム</button><div class="eyebrow">INVITATION</div><h1>ルーム ${escapeHtml(model.code)}</h1><p class="home-lead">名前を入力して、このルームに参加してください。</p><label for="player-name">プレイヤー名</label><input id="player-name" maxlength="16" autocomplete="nickname" value="${escapeHtml(model.name)}" placeholder="1〜16文字" /><button id="accept-invite" class="primary">ルームに参加</button><p class="online-error" role="alert">${escapeHtml(model.error)}</p></main>`);
  app.querySelector('#back-home').addEventListener('click', () => navigate('/'));
  app.querySelector('#accept-invite').addEventListener('click', async () => {
    try { setName(); enterRoom(await post(`/api/rooms/${model.code}/join`, { displayName: model.name })); }
    catch (caught) { model.error = caught.message; renderInvite(); }
  });
}

function enterRoom(seat) {
  if (model.ws) model.ws.close();
  saveSeat(seat);
  model.state = null; model.selected = 0; model.rotation = 0; model.rotations = [0, 0, 0];
  history.pushState({}, '', `/room/${seat.code}`);
  connectRoom();
  renderRoom();
}

function socketUrl(path) { return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`; }

function connectRoom() {
  if (!model.token || !model.code) return;
  model.connecting = true;
  const socket = new WebSocket(socketUrl(`/api/rooms/${model.code}/ws`), ['quadridge', `auth.${model.token}`]);
  model.ws = socket;
  socket.addEventListener('open', () => { if (model.ws !== socket) return; model.connecting = false; renderRoom(); });
  socket.addEventListener('message', event => {
    if (model.ws !== socket) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'state') {
        const previousState = model.state;
        const previousMoves = previousState?.moves;
        model.state = data;
        if (data.started) model.notice = '';
        if (previousMoves !== data.moves) { model.selected = 0; model.rotation = 0; model.rotations = [0, 0, 0]; model.hover = null; }
        model.error = '';
        renderRoom();
        if (data.started && previousState?.started && data.moves > previousMoves) {
          if (!previousState.extension && data.extension) showBattlePopup(app, 'extension');
          else if (data.passedPlayers?.length) showBattlePopup(app, 'reroll');
        }
      } else if (data.type === 'error') { model.error = data.message; renderRoom(); }
    } catch { model.error = '通信内容を読み取れませんでした。'; renderRoom(); }
  });
  socket.addEventListener('close', () => {
    if (model.ws !== socket) return;
    model.connecting = false;
    model.notice = '接続が切れました。再接続してください。';
    renderRoom();
  });
  socket.addEventListener('error', () => { if (model.ws === socket) { model.error = '接続できませんでした。'; renderRoom(); } });
}

async function startRandom() {
  model.ticket = (await post('/api/matchmaking', { displayName: model.name })).ticket;
  history.pushState({}, '', '/random');
  connectRandom();
  renderRandom();
}

function connectRandom() {
  const ticket = model.ticket;
  if (!ticket) return;
  const socket = new WebSocket(socketUrl('/api/matchmaking/ws'), ['quadridge', `auth.${ticket}`]);
  model.ws = socket;
  socket.addEventListener('message', event => {
    if (model.ws !== socket) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'matched') { model.ticket = ''; enterRoom(data); }
      else if (data.type === 'error') { model.error = data.message; model.ticket = ''; renderRandom(); }
    } catch { model.error = 'マッチングの応答を読み取れませんでした。'; renderRandom(); }
  });
  socket.addEventListener('close', () => { if (model.ws === socket && model.ticket) { model.error = '待機の接続が切れました。'; renderRandom(); } });
}

function renderRandom() {
  frame(`<main class="online-card waiting-card"><div class="eyebrow">RANDOM BATTLE</div><h1>対戦相手を探しています</h1><div class="waiting-spinner"></div><p class="home-lead">もう1人が参加すると自動で対戦が始まります。</p><button id="cancel-random" class="quiet">待機をやめる</button><p class="online-error" role="alert">${escapeHtml(model.error)}</p></main>`);
  app.querySelector('#cancel-random').addEventListener('click', async () => {
    const ticket = model.ticket;
    model.ticket = '';
    if (model.ws) { model.ws.close(); model.ws = null; }
    if (ticket) await post('/api/matchmaking/cancel', { ticket }).catch(() => {});
    navigate('/');
  });
}

function roomPreview() {
  const state = model.state;
  const result = { validIndices: new Set(), invalidIndices: new Set(), outOfBounds: false, valid: false };
  if (!state || !state.started || state.seat !== state.turn || !model.hover || state.winner !== null || state.draw) return result;
  const type = state.hand[model.selected];
  if (!type) return result;
  for (const { x, y } of placement(state.board, type, model.rotation, model.hover.x, model.hover.y)) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) { result.outOfBounds = true; continue; }
    const index = y * SIZE + x;
    (state.board[index] === null || (state.extension && state.board[index] === state.seat) ? result.validIndices : result.invalidIndices).add(index);
  }
  if (state.extension && ![...result.validIndices].some(index => state.board[index] === null)) {
    for (const index of result.validIndices) result.invalidIndices.add(index);
    result.validIndices.clear();
  }
  result.valid = !result.outOfBounds && result.invalidIndices.size === 0 && (!state.extension || [...result.validIndices].some(index => state.board[index] === null));
  return result;
}

function renderRoom() {
  const state = model.state;
  const link = `${location.origin}/room/${model.code}`;
  if (!state?.started) {
    frame(`<main class="online-card waiting-card"><button class="back-link" id="back-home">← ホーム</button><div class="eyebrow">ROOM BATTLE</div><h1>ルーム ${escapeHtml(model.code)}</h1><p class="home-lead">${state ? '相手の参加を待っています。' : model.connecting ? '接続しています…' : '接続が切れています。'}</p><div class="room-join"><label>招待リンク</label><div class="invite-link">${escapeHtml(link)}</div><button id="copy-link" class="primary">リンクをコピー</button></div><p class="online-error" role="alert">${escapeHtml(model.error || model.notice)}</p>${!model.connecting && model.ws?.readyState !== WebSocket.OPEN ? '<button id="reconnect" class="quiet">再接続</button>' : ''}</main>`);
    app.querySelector('#back-home').addEventListener('click', () => navigate('/'));
    app.querySelector('#copy-link').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); model.notice = '招待リンクをコピーしました。'; }
      catch { model.notice = 'コピーできませんでした。リンクを選択してコピーしてください。'; }
      renderRoom();
    });
    app.querySelector('#reconnect')?.addEventListener('click', () => { connectRoom(); renderRoom(); });
    return;
  }
  const myTurn = state.seat === state.turn && state.winner === null && !state.draw;
  const connected = model.ws?.readyState === WebSocket.OPEN;
  const ghost = roomPreview();
  const path = new Set(state.winningPath);
  const names = state.players.map(player => escapeHtml(player.displayName));
  const judgePaths = (state.judgment?.players || []).map(player => new Set(player.path));
  const judgeGuides = (state.judgment?.players || []).map(player => new Set(player.guides));
  const judgmentText = state.judgment ? `${names[0]} 残り${state.judgment.players[0].score}　${names[1]} 残り${state.judgment.players[1].score}` : '';
  app.innerHTML = `<div class="shell online-game"><header class="topbar"><div><div class="eyebrow">ONLINE BATTLE / ROOM ${escapeHtml(model.code)}</div><h1>QUADRIDGE<span>クアドリッジ</span></h1></div><div class="top-actions"><button id="leave-room" class="quiet">ホームへ</button></div></header><main><section class="arena" aria-label="対局盤面"><div class="edge-label top">${names[0]} のゴール</div><div class="board-frame"><div class="edge-side left">${names[1]} のゴール</div><div class="board" role="grid" aria-label="15×15の盤面">${state.board.map((owner, index) => {
    const classes = ['cell'];
    if (owner !== null) classes.push(colors[owner]);
    if (ghost.validIndices.has(index)) classes.push(`ghost-${colors[state.seat]}`);
    if (ghost.invalidIndices.has(index)) classes.push(`ghost-invalid-${colors[state.seat]}`);
    if (path.has(index)) classes.push('victory');
    if (judgePaths[0]?.has(index)) classes.push('judgment-blue');
    if (judgePaths[1]?.has(index)) classes.push('judgment-red');
    if (judgeGuides[0]?.has(index)) classes.push('guide-blue');
    if (judgeGuides[1]?.has(index)) classes.push('guide-red');
    return `<button class="${classes.join(' ')}" data-index="${index}" role="gridcell" aria-label="${index % SIZE + 1}列 ${Math.floor(index / SIZE) + 1}行 ${owner === null ? '空き' : names[owner]}" ${!myTurn || !connected ? 'disabled' : ''}></button>`;
  }).join('')}</div><div class="edge-side right">${names[1]} のゴール</div>${state.judgment ? `<div class="judgment-result"><span>${judgmentText}</span><strong>${state.winner !== null ? `${names[state.winner]} 判定勝ち` : '引き分け'}</strong></div>` : ''}</div><div class="edge-label bottom">${names[0]} のゴール</div></section><aside class="panel"><div class="round">TURN ${String(state.moves + 1).padStart(2, '0')} · ${escapeHtml(model.code)}</div><div class="turn-heading ${colors[state.turn]}"><span class="turn-dot"></span>${state.judgment ? state.winner !== null ? `${names[state.winner]}の判定勝ち` : '引き分け' : state.winner !== null ? `${names[state.winner]} の勝利` : state.draw ? '引き分け' : myTurn ? 'あなたの手番' : `${names[state.turn]} の手番`}</div><p class="status">${!connected ? '接続が切れています。再接続してください。' : state.judgment ? judgmentText : state.winner !== null ? '対岸がつながりました。' : state.draw ? '判定条件も同じため引き分けです。' : state.passedPlayers.length ? `${state.passedPlayers.map(index => names[index]).join('と')}がパスしました。` : myTurn ? '候補を選び、盤面に配置してください。' : '相手の配置を待っています。'}</p><div class="player-list">${state.players.map((player, index) => `<span class="player-chip ${colors[index]}"><i></i>${names[index]} ${index === state.seat ? '（あなた）' : ''}${player.connected ? '' : ' · 切断中'}</span>`).join('')}</div><div class="divider"></div><div class="section-title">あなたのブロック候補 <span>A / D で選択</span></div><div class="hand">${state.hand.map((type, index) => `<button class="candidate ${index === model.selected ? 'active' : ''} ${colors[state.seat]}" data-slot="${index}" ${!myTurn || !connected ? 'disabled' : ''}><span class="candidate-number">0${index + 1}</span>${mini(type, model.rotations[index])}<strong>${type} 型</strong></button>`).join('')}</div><div class="controls"><button id="rotate-left" class="primary" ${!myTurn || !connected ? 'disabled' : ''}>↶ 左回転 <kbd>Q</kbd></button><button id="rotate-right" class="primary" ${!myTurn || !connected ? 'disabled' : ''}>↷ 右回転 <kbd>E</kbd></button><div class="rotation">${model.rotation * 90}°</div></div><p class="hint">× は重なるマスです。盤面外にも配置できません。</p><div class="message" role="status">${escapeHtml(model.error || (model.hover && !ghost.valid ? ghost.outOfBounds ? '盤面の外には置けません。' : '× のマスには置けません。' : ''))}</div><div class="legend"><span><i class="legend-blue"></i>${names[0]}：${directions[0]}</span><span><i class="legend-red"></i>${names[1]}：${directions[1]}</span></div>${!connected ? '<button id="reconnect" class="quiet">再接続</button>' : ''}</aside></main></div>`;
  const helpButton = document.createElement('button');
  helpButton.className = 'quiet help-small';
  helpButton.textContent = '?';
  helpButton.setAttribute('aria-label', '遊び方');
  helpButton.addEventListener('click', () => showHelp(app));
  app.querySelector('.top-actions').prepend(helpButton);
  compactBattleUi(app, {
    turn: state.turn, selected: model.selected, players: app.querySelector('.player-list'),
    status: !connected ? '切断中' : state.judgment && state.winner !== null ? `${names[state.winner]}の判定勝ち` : state.winner !== null ? `${names[state.winner]}の勝利` : state.draw ? '引き分け' : state.extension ? '延長配置' : state.passedPlayers.length ? 'パス' : '',
  });
  app.querySelector('#leave-room').addEventListener('click', () => { model.ws?.close(); model.ws = null; navigate('/'); });
  app.querySelector('#reconnect')?.addEventListener('click', () => { connectRoom(); renderRoom(); });
  app.querySelector('#candidate-prev')?.addEventListener('click', () => selectSlot(Math.max(0, model.selected - 1)));
  app.querySelector('#candidate-next')?.addEventListener('click', () => selectSlot(Math.min(state.hand.length - 1, model.selected + 1)));
  app.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => {
    selectSlot(Number(button.dataset.slot));
  }));
  app.querySelector('#rotate-left').addEventListener('click', () => rotate(-1));
  app.querySelector('#rotate-right').addEventListener('click', () => rotate(1));
  app.querySelectorAll('.cell').forEach(button => {
    const index = Number(button.dataset.index);
    button.addEventListener('pointerenter', () => { model.hover = { x: index % SIZE, y: Math.floor(index / SIZE) }; updateBoardPreview(); });
    button.addEventListener('focus', () => { model.hover = { x: index % SIZE, y: Math.floor(index / SIZE) }; updateBoardPreview(); });
    button.addEventListener('click', () => {
      if (!myTurn || !connected || !model.ws) return;
      model.ws.send(JSON.stringify({ type: 'place', slot: model.selected, rotation: model.rotation, x: index % SIZE, y: Math.floor(index / SIZE) }));
    });
  });
  app.querySelector('.board').addEventListener('pointerleave', () => { model.hover = null; updateBoardPreview(); });
}

function updateBoardPreview(force = false) {
  if (!model.state?.started) return;
  const ghost = roomPreview();
  const rotating = app.querySelector('.board')?.classList.contains('rotating');
  const color = colors[model.state.seat];
  app.querySelectorAll('.cell').forEach((cell, index) => {
    cell.classList.remove('ghost-blue', 'ghost-red', 'ghost-invalid-blue', 'ghost-invalid-red');
    if ((!rotating || force) && ghost.validIndices.has(index)) cell.classList.add(`ghost-${color}`);
    if ((!rotating || force) && ghost.invalidIndices.has(index)) cell.classList.add(`ghost-invalid-${color}`);
  });
  const message = app.querySelector('.message');
  if (message) message.textContent = model.error || (model.hover && !ghost.valid ? ghost.outOfBounds ? '盤面の外には置けません。' : '× のマスには置けません。' : '');
}

function selectSlot(index) {
  model.selected = index;
  model.rotation = model.rotations[index] ?? 0;
  model.error = '';
  renderRoom();
}

function rotate(direction) {
  if (app.querySelector('#backdrop') || !model.state?.started || model.state.seat !== model.state.turn || model.state.winner !== null || model.state.draw || model.ws?.readyState !== WebSocket.OPEN) return;
  const previous = model.rotation;
  model.rotation = (model.rotation + direction + 4) % 4;
  model.rotations[model.selected] = model.rotation;
  renderRoom();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    app.querySelector('.candidate.active .mini')?.animate([
      { transform: `rotate(${-direction * 90}deg)`, opacity: .7 }, { transform: 'rotate(0deg)', opacity: 1 },
    ], { duration: 170, easing: 'ease-out' });
    animateBoardRotation(previous, direction);
  }
}

function animateBoardRotation(previous, direction) {
  if (!model.hover || !model.state) return;
  const board = app.querySelector('.board');
  const boardCells = board.querySelectorAll('.cell');
  board.classList.add('rotating');
  for (const cell of boardCells) cell.classList.remove('ghost-blue', 'ghost-red', 'ghost-invalid-blue', 'ghost-invalid-red');
  void board.offsetWidth;
  const first = boardCells[0].getBoundingClientRect();
  const pitchX = boardCells[1].getBoundingClientRect().left - first.left;
  const pitchY = boardCells[SIZE].getBoundingClientRect().top - first.top;
  const boardRect = board.getBoundingClientRect();
  const type = model.state.hand[model.selected];
  const oldShape = cells(type, previous);
  const newShape = cells(type, model.rotation);
  const oldWidth = Math.max(...oldShape.map(([x]) => x)) * pitchX + first.width;
  const oldHeight = Math.max(...oldShape.map(([, y]) => y)) * pitchY + first.height;
  const newWidth = Math.max(...newShape.map(([x]) => x)) * pitchX + first.width;
  const newHeight = Math.max(...newShape.map(([, y]) => y)) * pitchY + first.height;
  const overlay = document.createElement('div');
  overlay.className = `turning-ghost ${colors[model.state.seat]}`;
  Object.assign(overlay.style, { left: `${first.left - boardRect.left + model.hover.x * pitchX}px`, top: `${first.top - boardRect.top + model.hover.y * pitchY}px`, width: `${oldWidth}px`, height: `${oldHeight}px` });
  for (const [x, y] of oldShape) {
    const tile = document.createElement('i');
    const bx = model.hover.x + x; const by = model.hover.y + y;
    if (bx < 0 || by < 0 || bx >= SIZE || by >= SIZE || (model.state.board[by * SIZE + bx] !== null && !(model.state.extension && model.state.board[by * SIZE + bx] === model.state.seat))) tile.className = 'invalid';
    Object.assign(tile.style, { left: `${x * pitchX}px`, top: `${y * pitchY}px`, width: `${first.width}px`, height: `${first.height}px` });
    overlay.appendChild(tile);
  }
  board.appendChild(overlay);
  const animation = overlay.animate([
    { transform: 'translate(0px, 0px) rotate(0deg)' },
    { transform: `translate(${(newWidth - oldWidth) / 2}px, ${(newHeight - oldHeight) / 2}px) rotate(${direction * 90}deg)` },
  ], { duration: 170, easing: 'ease-out', fill: 'forwards' });
  animation.onfinish = () => {
    if (board.isConnected) updateBoardPreview(true);
    overlay.remove();
    board.classList.remove('rotating');
  };
}

document.addEventListener('keydown', event => {
  if (!model.state?.started || model.state.seat !== model.state.turn || model.state.winner !== null || model.state.draw) return;
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === 'q') rotate(-1);
  if (key === 'e') rotate(1);
  if (key === 'a' || key === 'd') {
    selectSlot(Math.max(0, Math.min(model.state.hand.length - 1, model.selected + (key === 'a' ? -1 : 1))));
  }
});

window.addEventListener('popstate', () => {
  if (!location.pathname.startsWith('/room/') && location.pathname !== '/random' && model.ws) {
    model.ws.close(); model.ws = null;
  }
  route();
});
route();
