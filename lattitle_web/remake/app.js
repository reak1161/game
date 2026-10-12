import { createGame, startGame, setRoute, issueCommand, advance } from './engine.js';

const app = document.querySelector('#app');
let game = createGame();
let path = null;
let dragging = null;
let lastFrame = performance.now();
let renderElapsed = 0;

const playerImage = (player) => `../legacy/data_list/players/${player.sprite.split('/')[0]}/images/${player.sprite.split('/')[1]}`;
const enemyImage = `../legacy/data_list/enemies/enemy_001/images/snake.png`;
const itemImage = (item) => `../legacy/data_list/items/images/${item.sprite}`;
const percent = (value, max) => Math.max(0, Math.min(100, max ? value / max * 100 : 0));
const bar = (value, max, kind, ready = false) => `<div class="bar ${kind}${ready ? ' ready' : ''}"><i style="width:${percent(value, max)}%"></i></div>`;
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Keep buttons and board cells mounted while their text, gauges and warning timers change.
function morphNode(current, next) {
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
    current.replaceWith(next.cloneNode(true));
    return;
  }
  if (current.nodeType === Node.TEXT_NODE) {
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
    return;
  }
  if (current.nodeType !== Node.ELEMENT_NODE) return;
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of [...next.attributes]) {
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
  let index = 0;
  while (index < next.childNodes.length || index < current.childNodes.length) {
    if (!next.childNodes[index]) current.childNodes[index].remove();
    else if (!current.childNodes[index]) current.append(next.childNodes[index].cloneNode(true));
    else { morphNode(current.childNodes[index], next.childNodes[index]); index++; }
  }
}

function setMarkup(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  let index = 0;
  while (index < template.content.childNodes.length || index < app.childNodes.length) {
    if (!template.content.childNodes[index]) app.childNodes[index].remove();
    else if (!app.childNodes[index]) app.append(template.content.childNodes[index].cloneNode(true));
    else { morphNode(app.childNodes[index], template.content.childNodes[index]); index++; }
  }
}

function landing() {
  const squares = Array.from({ length: 16 }, (_, i) => {
    const member = i % 5 === 0 ? game.players[Math.floor(i / 5)] : null;
    return `<div>${member ? `<img src="${playerImage(member)}" alt="">` : ''}</div>`;
  }).join('');
  setMarkup(`<section class="landing">
    <div>
      <div class="eyebrow">REAL-TIME TACTICAL BATTLE · REMAKE</div>
      <h1>ラティトル<span>LATTITLE</span></h1>
      <p class="lead">4人の仲間を動かし、敵の攻撃を見切る。<br>小さな盤面に、止まらない戦い。</p>
      <div class="landing-actions"><button class="primary-button" data-action="start">戦闘を始める</button><a class="secondary-button" href="../legacy/build/web/">レガシー版で遊ぶ</a></div>
      <p class="landing-note">製品版の最初のプレイ可能版です。4人対「へび」の1戦を収録。<br>仲間を選び、盤面をなぞって移動。ゲージが満ちたら技を選びます。</p>
    </div>
    <div class="landing-art" aria-hidden="true"><div class="art-frame"><div class="art-label">FIELD 04 × 04 / ENCOUNTER 01</div><div class="art-enemy"><img src="${enemyImage}" alt=""></div><div class="art-board">${squares}</div></div></div>
  </section>`);
}

function cellHtml(x, y) {
  const player = game.players.find((entry) => entry.hp > 0 && Math.round(entry.x) === x && Math.round(entry.y) === y);
  const hazard = game.hazards.filter((entry) => entry.x === x && entry.y === y).sort((a, b) => a.remaining - b.remaining)[0];
  const reserved = game.players.some((entry) => entry.hp > 0 && entry.route.length && entry.destX === x && entry.destY === y);
  const dragged = path?.some((entry) => entry.x === x && entry.y === y);
  const classes = ['cell', hazard && 'hazard', reserved && 'reserved', dragged && 'dragged', player && game.players[game.selected] === player && 'selected'].filter(Boolean).join(' ');
  const label = `${x + 1}列${y + 1}行${player ? `、${player.name}` : ''}${hazard ? `、${hazard.label}の予告、残り${hazard.remaining.toFixed(1)}秒` : ''}`;
  return `<button class="${classes}" data-action="cell" data-x="${x}" data-y="${y}" aria-label="${label}">
    ${player ? `<img src="${playerImage(player)}" alt="${player.name}">` : `<span class="cell-dot">${x + 1}·${y + 1}</span>`}
    ${hazard ? `<span class="timer">${hazard.remaining.toFixed(1)}s</span>` : ''}
  </button>`;
}

function memberHtml(player, index) {
  const active = game.selected === index;
  const ready = player.gauge >= 1000 && player.hp > 0;
  return `<button class="member${active ? ' active' : ''}${player.hp <= 0 ? ' dead' : ''}" data-action="select" data-index="${index}" aria-pressed="${active}">
    <img src="${playerImage(player)}" alt="">
    <div><div class="member-name"><span>${player.name}</span><em>${player.hp <= 0 ? '戦闘不能' : ready ? 'READY' : player.charge ? 'CHARGE' : ''}</em></div>
    ${bar(player.hp, player.maxHp, 'hp')}
    <div class="mini-stats"><span>HP ${Math.ceil(player.hp)}/${player.maxHp}</span><span>MP ${Math.floor(player.mp)}/${player.maxMp}</span></div>
    ${bar(player.gauge, 1000, 'gauge', ready)}</div>
  </button>`;
}

function commandHtml(command, index, canAct) {
  const kinds = { attack: 'こうげき', defense: 'ぼうぎょ', magic: 'まほう', item: 'アイテム' };
  return `<button class="command${canAct ? ' ready' : ''}" data-action="command" data-index="${index}" ${canAct ? '' : 'disabled'} title="${command.type === 'magic' ? 'MPを消費します' : command.type === 'attack' ? `威力 ${command.power}` : ''}">
    <span class="kind">${kinds[command.type]}</span><strong>${esc(command.name)}</strong>
  </button>`;
}

function battle() {
  const selected = game.players[game.selected];
  const ready = selected.hp > 0 && selected.gauge >= 1000 && !selected.charge && selected.silenced <= 0;
  const hazardCount = game.hazards.length;
  setMarkup(`<div class="battle-heading">
    <div><div class="eyebrow">ENCOUNTER 01 · THE SNAKE</div><h1>へびとの戦い</h1></div>
    <div class="battle-actions"><button class="small-button" data-action="pause">${game.paused ? '再開' : '一時停止'}</button><button class="small-button" data-action="restart">最初から</button></div>
  </div>
  <div class="battle-layout">
    <section class="arena panel" aria-label="戦闘フィールド">
      <div class="enemy-row"><div class="enemy-portrait"><img src="${enemyImage}" alt="敵のへび"></div>
      <div><div class="enemy-identity">BOSS / GROUND</div><div class="enemy-name">へび</div><div class="stat-line"><span>HP</span><strong>${Math.ceil(game.enemy.hp)} / ${game.enemy.maxHp}</strong></div>${bar(game.enemy.hp, game.enemy.maxHp, 'hp')}
      <div class="stat-line"><span>敵の行動</span><strong>${hazardCount ? `予告 ${hazardCount}マス` : '準備中'}</strong></div>${bar(game.enemy.gauge, 1000, 'gauge')}</div></div>
      <div class="arena-caption"><span>FIELD / 4 × 4</span><span>${hazardCount ? '赤いマスから退避！' : '仲間を動かして攻撃'}</span></div>
      <div class="board" aria-label="4×4の盤面">${Array.from({ length: 16 }, (_, i) => cellHtml(i % 4, Math.floor(i / 4))).join('')}</div>
      <p class="arena-tip">仲間のマスを押して選択。押したまま別のマスへなぞると移動します。敵の攻撃予告は赤く表示されます。</p>
    </section>
    <aside class="sidebar">
      <section class="party-panel panel"><div class="section-head"><h2>PARTY / 仲間</h2><span>選んで指示する</span></div><div class="party-list">${game.players.map(memberHtml).join('')}</div></section>
      <section class="command-panel panel"><div class="section-head"><h2>COMMAND / ${selected.name}</h2><span>${selected.hp <= 0 ? '戦闘不能' : selected.silenced > 0 ? '行動不能' : selected.charge ? `準備 ${selected.charge.remaining.toFixed(1)}秒` : ready ? '行動できます' : 'ゲージ待ち'}</span></div><div class="command-grid">${selected.commands.map((command, index) => commandHtml(command, index, ready && (command.type !== 'magic' || selected.mp >= selected.mp * command.mpPercent / 100 + command.mpFlat))).join('')}</div></section>
      <section class="item-panel panel"><div class="section-head"><h2>ITEM / 持ち物</h2><span>選んでコマンドを押す</span></div><div class="item-list">${game.items.map((item) => `<button class="item${game.selectedItem === item.id ? ' active' : ''}" data-action="item" data-id="${item.id}" ${item.count ? '' : 'disabled'} aria-pressed="${game.selectedItem === item.id}"><img src="${itemImage(item)}" alt=""><span>${item.name}</span><b>× ${item.count}</b></button>`).join('')}</div><p class="item-description">${game.items.find((item) => item.id === game.selectedItem)?.description ?? ''}</p></section>
      <section class="log-panel panel"><div class="section-head"><h2>BATTLE LOG</h2><span>${Math.floor(game.elapsed)}秒</span></div><ol>${game.log.map((entry) => `<li>${esc(entry)}</li>`).join('')}</ol></section>
    </aside>
  </div>${game.paused ? `<div class="overlay"><div class="overlay-card"><div class="eyebrow">PAUSE</div><h2>一時停止</h2><p>準備ができたら戦闘に戻れます。</p><div class="overlay-actions"><button class="primary-button" data-action="pause">戦闘に戻る</button><button class="secondary-button" data-action="restart">最初から</button></div></div></div>` : ''}`);
}

function result() {
  const clear = game.phase === 'clear';
  setMarkup(`<div class="overlay"><div class="overlay-card"><div class="eyebrow">${clear ? 'VICTORY' : 'GAME OVER'}</div><h2>${clear ? 'ゲームクリア！' : 'ゲームオーバー'}</h2><p>${clear ? 'へびを倒しました。仲間を動かす判断が勝利につながりました。' : '仲間が全員倒れました。予告マスからの退避を意識して再挑戦しましょう。'}</p><div class="overlay-actions"><button class="primary-button" data-action="restart">もう一度遊ぶ</button><button class="secondary-button" data-action="title">タイトルへ</button></div></div></div>`);
}

function render() {
  if (game.phase === 'title') landing();
  else if (game.phase === 'battle') battle();
  else result();
}

function handleAction(element) {
  const action = element.dataset.action;
  if (action === 'start' || action === 'restart') { game = startGame(game); path = null; render(); }
  if (action === 'title') { game = createGame(); path = null; render(); }
  if (action === 'pause' && game.phase === 'battle') { game.paused = !game.paused; render(); }
  if (action === 'select' && game.phase === 'battle') { game.selected = Number(element.dataset.index); render(); }
  if (action === 'item' && game.phase === 'battle') { game.selectedItem = element.dataset.id; render(); }
  if (action === 'command' && game.phase === 'battle') { issueCommand(game, game.selected, Number(element.dataset.index)); render(); }
}

document.addEventListener('pointerdown', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action !== 'cell') { handleAction(target); return; }
  if (game.phase !== 'battle' || game.paused) return;
  const x = Number(target.dataset.x), y = Number(target.dataset.y);
  const index = game.players.findIndex((player) => player.hp > 0 && player.destX === x && player.destY === y && !player.route.length);
  if (index < 0) return;
  event.preventDefault();
  game.selected = index;
  dragging = index;
  path = [{ x, y }];
  render();
});

document.addEventListener('pointermove', (event) => {
  if (dragging === null) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-action="cell"]');
  if (!cell) return;
  const x = Number(cell.dataset.x), y = Number(cell.dataset.y);
  const existing = path.findIndex((entry) => entry.x === x && entry.y === y);
  if (existing >= 0) path = path.slice(0, existing + 1);
  else path.push({ x, y });
  render();
});

document.addEventListener('pointerup', () => {
  if (dragging === null) return;
  if (path.length > 1) setRoute(game, dragging, path);
  dragging = null;
  path = null;
  render();
});

document.addEventListener('pointercancel', () => {
  dragging = null;
  path = null;
  render();
});

document.addEventListener('click', (event) => {
  // Keyboard-activated native buttons dispatch a click without a pointer event.
  if (event.detail !== 0) return;
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (target.dataset.action === 'cell') {
    const x = Number(target.dataset.x), y = Number(target.dataset.y);
    const index = game.players.findIndex((player) => player.hp > 0 && Math.round(player.x) === x && Math.round(player.y) === y);
    if (index >= 0) { game.selected = index; render(); }
  } else handleAction(target);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && game.phase === 'battle') { game.paused = !game.paused; render(); }
});

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.15);
  lastFrame = now;
  if (game.phase === 'battle' && !game.paused) {
    let remaining = delta;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      advance(game, step);
      remaining -= step;
    }
  }
  renderElapsed += delta;
  if (renderElapsed >= 0.1) { renderElapsed = 0; if (game.phase !== 'title') render(); }
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);
