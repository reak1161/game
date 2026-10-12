// Keep the board and the three pieces in one visual column for both game modes.
export function compactBattleUi(app, { turn, selected, status = '', players = null }) {
  const shell = app.querySelector('.shell');
  const panel = shell?.querySelector('.panel');
  if (!panel) return;
  shell.classList.add('battle-shell', turn === 0 ? 'turn-blue' : 'turn-red');

  const hand = panel.querySelector('.hand');
  const controls = panel.querySelector('.controls');
  const message = panel.querySelector('.message');
  const round = panel.querySelector('.round');
  const reconnect = panel.querySelector('#reconnect');
  const previous = document.createElement('button');
  previous.id = 'candidate-prev';
  previous.className = 'tray-arrow';
  previous.type = 'button';
  previous.textContent = '◀ A';
  previous.setAttribute('aria-label', '前のブロック候補');
  const next = document.createElement('button');
  next.id = 'candidate-next';
  next.className = 'tray-arrow';
  next.type = 'button';
  next.textContent = 'D ▶';
  next.setAttribute('aria-label', '次のブロック候補');
  previous.disabled = selected === 0 || !hand.querySelector('.candidate:not(:disabled)');
  next.disabled = selected >= hand.querySelectorAll('.candidate').length - 1 || !hand.querySelector('.candidate:not(:disabled)');

  for (const candidate of hand.querySelectorAll('.candidate')) {
    const type = candidate.querySelector('strong');
    candidate.setAttribute('aria-label', `${type.textContent}の候補`);
    type.remove();
  }
  controls.className = 'piece-rotation';
  controls.querySelector('#rotate-left').innerHTML = '↶ <kbd>Q</kbd>';
  controls.querySelector('#rotate-right').innerHTML = '<kbd>E</kbd> ↷';
  controls.querySelector('#rotate-left').setAttribute('aria-label', '左へ回転');
  controls.querySelector('#rotate-right').setAttribute('aria-label', '右へ回転');
  controls.querySelector('.rotation')?.remove();
  const active = hand.querySelector('.candidate.active');
  if (active) {
    const selectedPiece = document.createElement('div');
    selectedPiece.className = 'selected-piece';
    active.replaceWith(selectedPiece);
    selectedPiece.append(controls, active);
  } else {
    controls.hidden = true;
  }

  const tray = document.createElement('div');
  tray.className = 'battle-tray';
  tray.append(previous, hand, next);
  const info = document.createElement('div');
  info.className = 'battle-info';
  info.append(round);
  if (players) info.append(players);
  if (status) {
    const notice = document.createElement('span');
    notice.className = 'battle-notice';
    notice.textContent = status;
    info.append(notice);
  }
  panel.className = 'battle-panel';
  panel.replaceChildren(tray, info, message, ...(reconnect ? [reconnect] : []), ...(!active ? [controls] : []));
}

export function showBattlePopup(app, kind) {
  const boardFrame = app.querySelector('.battle-shell .board-frame');
  if (!boardFrame) return;
  boardFrame.querySelector('.battle-popup')?.remove();
  const popup = document.createElement('div');
  popup.className = `battle-popup ${kind === 'extension' ? 'extension' : 'reroll'}`;
  popup.setAttribute('role', 'status');
  const card = document.createElement('div');
  card.className = 'battle-popup-card';
  const mark = document.createElement('span');
  mark.className = 'battle-popup-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = kind === 'extension' ? '◇' : '↻';
  const label = document.createElement('strong');
  label.textContent = kind === 'extension' ? '延長配置開始' : '候補をリロール';
  card.append(mark, label);
  popup.append(card);
  boardFrame.append(popup);
  window.setTimeout(() => popup.remove(), kind === 'extension' ? 2000 : 1700);
}
