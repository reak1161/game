import './style.css';
import { SIZE, cells, placement, newGame, play } from './engine.js';
import { compactBattleUi, showBattlePopup } from './battle-ui.js';
import { helpMarkup } from './help.js';

const app = document.querySelector('#app');
let game = newGame();
let selected = 0;
let rotation = 0;
let rotations = [0, 0, 0];
let hover = null;
let message = '';
let helpOpen = false;
let pathTimer = null;
let visiblePath = 0;

const names = ['蒼 / 上下をつなぐ', '朱 / 左右をつなぐ'];
const colors = ['blue', 'red'];

function mini(type, turns = 0) {
  const shape = cells(type, turns);
  const width = Math.max(...shape.map(([x]) => x)) + 1;
  const height = Math.max(...shape.map(([, y]) => y)) + 1;
  const filled = new Set(shape.map(([x, y]) => `${x},${y}`));
  return `<span class="mini" style="--columns:${width}">${Array.from({ length: width * height }, (_, i) =>
    `<i class="${filled.has(`${i % width},${Math.floor(i / width)}`) ? 'filled' : ''}"></i>`).join('')}</span>`;
}

function preview() {
  if (!hover || game.winner !== null || game.draw) return { validIndices: new Set(), invalidIndices: new Set(), valid: false, outOfBounds: false };
  const type = game.players[game.turn].hand[selected];
  const points = placement(game.board, type, rotation, hover.x, hover.y);
  const validIndices = new Set();
  const invalidIndices = new Set();
  let outOfBounds = false;
  for (const { x, y } of points) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) { outOfBounds = true; continue; }
    const index = y * SIZE + x;
    (game.board[index] === null || (game.extension && game.board[index] === game.turn) ? validIndices : invalidIndices).add(index);
  }
  if (game.extension && ![...validIndices].some(index => game.board[index] === null)) {
    for (const index of validIndices) invalidIndices.add(index);
    validIndices.clear();
  }
  return {
    validIndices, invalidIndices, outOfBounds,
    valid: !outOfBounds && invalidIndices.size === 0 && (!game.extension || [...validIndices].some(index => game.board[index] === null)),
  };
}

function render() {
  const current = game.turn;
  const ghost = preview();
  const path = new Set(game.winningPath.slice(0, visiblePath));
  const judgePaths = (game.judgment?.players || []).map(player => new Set(player.path));
  const judgeGuides = (game.judgment?.players || []).map(player => new Set(player.guides));
  const judgmentText = game.judgment ? `蒼 残り${game.judgment.players[0].score}　朱 残り${game.judgment.players[1].score}` : '';
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div><div class="eyebrow">STRATEGY / CONNECTION</div><h1>QUADRIDGE<span>クアドリッジ</span></h1></div>
        <div class="top-actions"><button id="help-toggle" class="quiet help-small" aria-label="遊び方">?</button><button id="restart" class="quiet">新しい対局</button><a class="quiet home-link" href="/">ホームへ</a></div>
      </header>
      <main>
        <section class="arena" aria-label="対局盤面">
          <div class="edge-label top">蒼のゴール</div>
          <div class="board-frame">
            <div class="edge-side left">朱のゴール</div>
            <div class="board" role="grid" aria-label="15×15の盤面">
              ${game.board.map((owner, index) => {
                const x = index % SIZE; const y = Math.floor(index / SIZE);
                const classes = ['cell'];
                if (owner !== null) classes.push(colors[owner]);
                if (ghost.validIndices.has(index)) classes.push(`ghost-${colors[current]}`);
                if (ghost.invalidIndices.has(index)) classes.push(`ghost-invalid-${colors[current]}`);
                if (path.has(index)) classes.push('victory');
                if (judgePaths[0]?.has(index)) classes.push('judgment-blue');
                if (judgePaths[1]?.has(index)) classes.push('judgment-red');
                if (judgeGuides[0]?.has(index)) classes.push('guide-blue');
                if (judgeGuides[1]?.has(index)) classes.push('guide-red');
                return `<button class="${classes.join(' ')}" data-x="${x}" data-y="${y}" role="gridcell" aria-label="${x + 1}列 ${y + 1}行 ${owner === null ? '空き' : names[owner]}" ${game.winner !== null || game.draw ? 'disabled' : ''}></button>`;
              }).join('')}
            </div>
            <div class="edge-side right">朱のゴール</div>
            ${game.judgment ? `<div class="judgment-result"><span>${judgmentText}</span><strong>${game.winner !== null ? `${game.winner === 0 ? '蒼' : '朱'} 判定勝ち` : '引き分け'}</strong></div>` : ''}
          </div>
          <div class="edge-label bottom">蒼のゴール</div>
        </section>
        <aside class="panel">
          <div class="round">TURN ${String(game.moves + 1).padStart(2, '0')}</div>
          <div class="turn-heading ${colors[current]}"><span class="turn-dot"></span>${game.judgment ? game.winner !== null ? `${game.winner === 0 ? '蒼' : '朱'}の判定勝ち` : '引き分け' : game.winner !== null ? `${names[game.winner]} の勝利` : game.draw ? '引き分け' : `${names[current]} の手番`}</div>
          <p class="status">${game.judgment ? judgmentText : game.winner !== null ? '対岸をつなぎました。' : game.draw ? '判定条件も同じため引き分けです。' : game.passedPlayers.length ? `${game.passedPlayers.map(player => player === 0 ? '蒼' : '朱').join('と')}は配置できずパスしました。候補を置ける形状にリロールしました。` : '候補を選び、盤面上の置きたい位置を押してください。'}</p>
          <div class="divider"></div>
          <div class="section-title">ブロック候補 <span>${game.players[current].hand.length}つから1つ選択 · A / D</span></div>
          <div class="hand">${game.players[current].hand.map((type, index) => `<button class="candidate ${index === selected ? 'active' : ''} ${colors[current]}" data-slot="${index}" ${game.winner !== null || game.draw ? 'disabled' : ''}><span class="candidate-number">0${index + 1}</span>${mini(type, rotations[index])}<strong>${type} 型</strong></button>`).join('')}</div>
          <div class="controls"><button id="rotate-left" class="primary" ${game.winner !== null || game.draw ? 'disabled' : ''}>↶ 左回転 <kbd>Q</kbd></button><button id="rotate-right" class="primary" ${game.winner !== null || game.draw ? 'disabled' : ''}>↷ 右回転 <kbd>E</kbd></button><div class="rotation">${rotation * 90}°</div></div>
          <p class="hint">A / D で候補を選択、Q / E で90°回転。各候補の向きは切り替えても保持します。× は配置不可です。</p>
          <div class="message" role="status">${message || (hover && !ghost.valid ? ghost.outOfBounds ? '盤面の外には置けません。' : '× のマスには置けません。' : '&nbsp;')}</div>
          <div class="legend"><span><i class="legend-blue"></i>蒼：上 ↔ 下</span><span><i class="legend-red"></i>朱：左 ↔ 右</span></div>
        </aside>
      </main>
      <footer>4マスのブロックを置いて、自分の2つの対岸を先につなごう。</footer>
    </div>
    ${helpOpen ? helpMarkup() : ''}
  `;
  compactBattleUi(app, {
    turn: current, selected,
    status: game.winner !== null ? '勝利' : game.draw ? '引き分け' : game.extension ? '延長配置' : game.passedPlayers.length ? 'パス' : '',
  });
  wire();
}

function wire() {
  app.querySelector('#candidate-prev')?.addEventListener('click', () => selectSlot(Math.max(0, selected - 1)));
  app.querySelector('#candidate-next')?.addEventListener('click', () => selectSlot(Math.min(game.players[game.turn].hand.length - 1, selected + 1)));
  app.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => {
    selectSlot(Number(button.dataset.slot));
  }));
  app.querySelector('#rotate-left')?.addEventListener('click', () => rotate(-1));
  app.querySelector('#rotate-right')?.addEventListener('click', () => rotate(1));
  app.querySelectorAll('.cell').forEach(button => {
    button.addEventListener('pointerenter', () => {
      hover = { x: Number(button.dataset.x), y: Number(button.dataset.y) }; updateBoard();
    });
    button.addEventListener('focus', () => {
      hover = { x: Number(button.dataset.x), y: Number(button.dataset.y) }; updateBoard();
    });
    button.addEventListener('click', () => {
      const x = Number(button.dataset.x); const y = Number(button.dataset.y);
      let placed = false;
      const wasExtended = game.extension;
      try {
        game = play(game, selected, rotation, x, y);
        placed = true;
        selected = 0; rotation = 0; rotations = [0, 0, 0]; hover = null; message = '';
        if (game.winner !== null) animatePath();
      } catch (error) { message = error.message; }
      render();
      if (placed) {
        animatePlacement();
        if (!wasExtended && game.extension) showBattlePopup(app, 'extension');
        else if (game.passedPlayers.length) showBattlePopup(app, 'reroll');
      }
    });
  });
  app.querySelector('.board')?.addEventListener('pointerleave', () => { hover = null; updateBoard(); });
  app.querySelector('#restart')?.addEventListener('click', () => {
    if (pathTimer) clearInterval(pathTimer);
    game = newGame(); selected = 0; rotation = 0; rotations = [0, 0, 0]; hover = null; message = ''; visiblePath = 0; render();
  });
  app.querySelector('#help-toggle')?.addEventListener('click', () => { helpOpen = true; render(); });
  app.querySelector('#close-help')?.addEventListener('click', closeHelp);
  app.querySelector('#help-ok')?.addEventListener('click', closeHelp);
  app.querySelector('#backdrop')?.addEventListener('click', event => { if (event.target.id === 'backdrop') closeHelp(); });
}

function closeHelp() { helpOpen = false; render(); }
function selectSlot(index) {
  selected = index;
  rotation = rotations[selected] ?? 0;
  message = '';
  render();
}
function rotate(direction) {
  if (game.winner !== null || game.draw || helpOpen) return;
  const previousRotation = rotation;
  rotation = (rotation + direction + 4) % 4;
  rotations[selected] = rotation;
  message = '';
  render();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    app.querySelector('.candidate.active .mini')?.animate(
      [{ transform: `rotate(${-direction * 90}deg)`, opacity: .7 }, { transform: 'rotate(0deg)', opacity: 1 }],
      { duration: 170, easing: 'ease-out' }
    );
    animateBoardRotation(previousRotation, direction);
  }
}
function animateBoardRotation(previousRotation, direction) {
  if (!hover) return;
  const board = app.querySelector('.board');
  const boardCells = board.querySelectorAll('.cell');
  board.classList.add('rotating');
  for (const cell of boardCells) cell.classList.remove('ghost-blue', 'ghost-red', 'ghost-invalid-blue', 'ghost-invalid-red');
  void board.offsetWidth;
  const first = boardCells[0].getBoundingClientRect();
  const second = boardCells[1].getBoundingClientRect();
  const below = boardCells[SIZE].getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const pitchX = second.left - first.left;
  const pitchY = below.top - first.top;
  const type = game.players[game.turn].hand[selected];
  const oldShape = cells(type, previousRotation);
  const newShape = cells(type, rotation);
  const oldWidth = Math.max(...oldShape.map(([x]) => x)) * pitchX + first.width;
  const oldHeight = Math.max(...oldShape.map(([, y]) => y)) * pitchY + first.height;
  const newWidth = Math.max(...newShape.map(([x]) => x)) * pitchX + first.width;
  const newHeight = Math.max(...newShape.map(([, y]) => y)) * pitchY + first.height;
  const overlay = document.createElement('div');
  overlay.className = `turning-ghost ${colors[game.turn]}`;
  Object.assign(overlay.style, {
    left: `${first.left - boardRect.left + hover.x * pitchX}px`,
    top: `${first.top - boardRect.top + hover.y * pitchY}px`,
    width: `${oldWidth}px`, height: `${oldHeight}px`,
  });
  for (const [x, y] of oldShape) {
    const tile = document.createElement('i');
    const boardX = hover.x + x;
    const boardY = hover.y + y;
    if (boardX < 0 || boardY < 0 || boardX >= SIZE || boardY >= SIZE || (game.board[boardY * SIZE + boardX] !== null && !(game.extension && game.board[boardY * SIZE + boardX] === game.turn))) {
      tile.className = 'invalid';
    }
    Object.assign(tile.style, {
      left: `${x * pitchX}px`, top: `${y * pitchY}px`,
      width: `${first.width}px`, height: `${first.height}px`,
    });
    overlay.appendChild(tile);
  }
  board.appendChild(overlay);
  const animation = overlay.animate([
    { transform: 'translate(0px, 0px) rotate(0deg)' },
    { transform: `translate(${(newWidth - oldWidth) / 2}px, ${(newHeight - oldHeight) / 2}px) rotate(${direction * 90}deg)` },
  ], { duration: 170, easing: 'ease-out', fill: 'forwards' });
  animation.onfinish = () => {
    if (board.isConnected) updateBoard(true);
    overlay.remove();
    board.classList.remove('rotating');
  };
}
function updateBoard(force = false) {
  const ghost = preview();
  const rotating = app.querySelector('.board')?.classList.contains('rotating');
  app.querySelectorAll('.cell').forEach((cell, index) => {
    cell.classList.remove('ghost-blue', 'ghost-red', 'ghost-invalid-blue', 'ghost-invalid-red');
    if ((!rotating || force) && ghost.validIndices.has(index)) cell.classList.add(`ghost-${colors[game.turn]}`);
    if ((!rotating || force) && ghost.invalidIndices.has(index)) cell.classList.add(`ghost-invalid-${colors[game.turn]}`);
  });
  const messageNode = app.querySelector('.message');
  if (messageNode) messageNode.textContent = message || (hover && !ghost.valid ? ghost.outOfBounds ? '盤面の外には置けません。' : '× のマスには置けません。' : '');
}
function animatePlacement() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const boardCells = app.querySelectorAll('.cell');
  for (const index of game.lastCells) {
    boardCells[index]?.animate(
      [{ transform: 'scale(.7)' }, { transform: 'scale(1.08)', offset: .7 }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'ease-out' }
    );
  }
}
function animatePath() {
  visiblePath = 0;
  if (pathTimer) clearInterval(pathTimer);
  pathTimer = setInterval(() => {
    visiblePath = Math.min(visiblePath + 2, game.winningPath.length);
    render();
    if (visiblePath === game.winningPath.length) clearInterval(pathTimer);
  }, 70);
}
document.addEventListener('keydown', event => {
  if (helpOpen) { if (event.key === 'Escape') closeHelp(); return; }
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (key === 'q') rotate(-1);
  if (key === 'e') rotate(1);
  if ((key === 'a' || key === 'd') && game.winner === null && !game.draw) {
    selectSlot(Math.max(0, Math.min(game.players[game.turn].hand.length - 1, selected + (key === 'a' ? -1 : 1))));
  }
  if (event.key === 'Escape' && helpOpen) closeHelp();
});
render();
