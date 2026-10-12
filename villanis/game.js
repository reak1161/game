/* VILLANICE — FPS / over-the-shoulder TPS input, UI and audio. */
(() => {
  'use strict';
  const { Game, dist, clamp, W, H } = Villanis;
  const $ = id => document.getElementById(id), canvas = $('world'), mini = $('minimap').getContext('2d');
  let view;
  try { view = new Villanis3D(canvas); }
  catch (error) { $('start').disabled = true; $('start').textContent = '3D描画を開始できませんでした'; $('render-error').hidden = false; $('render-error').textContent = 'WebGL 2に対応するChrome / Edgeで開き、ブラウザのグラフィックアクセラレーションを有効にしてください。'; console.error(error); return; }
  let selected = 'survivor', game = null, paused = false, last = 0, noticeUntil = 0, endedShown = false;
  let keys = new Set(), taps = {}, muted = false, audio, heartbeat = 0, shake = 0, dragging = false, wasLocked = false;
  try { muted = localStorage.getItem('villanis-muted') === 'true'; } catch {}
  addEventListener('resize', () => view.resize());
  function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
  function notify(message, duration = 3400) { $('notice').textContent = message; noticeUntil = performance.now() + duration; }
  function requestLook() {
    if (!game || game.ended || paused || document.pointerLockElement === canvas) return;
    try { const pending = canvas.requestPointerLock(); pending?.catch(() => notify('画面クリックで視点操作。取得できない場合は右ドラッグで視点を動かせます', 6000)); }
    catch { notify('右ドラッグで視点を動かせます', 6000); }
  }
  function releaseLook() { dragging = false; if (document.pointerLockElement) document.exitPointerLock(); }
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (wasLocked && !locked && game && !game.ended && !paused) pause();
    wasLocked = locked; $('capture-mouse').hidden = locked || !game || paused || game.ended;
  });
  document.addEventListener('pointerlockerror', () => { if (game && !paused) $('capture-mouse').hidden = false; });
  document.addEventListener('mousemove', e => { if (game && !paused && !game.ended && (document.pointerLockElement === canvas || dragging)) view.look(e.movementX, e.movementY, Number($('sensitivity').value)); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    if (!game || paused || game.ended) return;
    if (e.button === 2) dragging = true;
    if (e.button === 0) { if (document.pointerLockElement !== canvas) requestLook(); else if (game.role === 'hunter') taps.attack = true; }
  });
  addEventListener('mouseup', () => dragging = false);
  $('capture-mouse').onclick = requestLook;
  function drawMinimap() {
    if ($('map-panel').hidden) return;
    mini.clearRect(0, 0, 180, 135); mini.fillStyle = '#0a1c29'; mini.fillRect(0, 0, 180, 135); mini.save(); mini.scale(180 / W, 135 / H);
    mini.fillStyle = '#416174'; for (const o of game.map.obstacles) mini.fillRect(o.x, o.y, o.w, o.h);
    for (const g of game.map.gens) { mini.fillStyle = g.done ? '#f2c391' : '#aac9d1'; mini.fillRect(g.x - 24, g.y - 24, 48, 48); }
    for (const g of game.map.gates) { mini.fillStyle = game.repaired >= 3 ? '#ffd2a5' : '#5b849a'; mini.fillRect(g.x - 20, g.y - 50, 40, 100); }
    for (const s of game.survivors) if (s.state !== 'dead' && s.state !== 'escaped' && (game.role === 'survivor' || game.visible(s) || game.reveal > 0 || s.state === 'caged')) circle(mini, s.x, s.y, s === game.player ? 30 : 22, s.state === 'caged' ? '#eea1b1' : '#a3d6e0');
    if (game.role === 'hunter' || game.visible(game.player)) circle(mini, game.hunter.x, game.hunter.y, 29, '#deabc6');
    mini.strokeStyle = '#d3edee'; mini.lineWidth = 9; mini.beginPath(); mini.arc(game.player.x, game.player.y, 45, 0, 6.28); mini.stroke(); mini.restore();
  }
  const stateLabel = s => s.state === 'caged' ? `氷牢 ${Math.ceil(s.cageTime)}秒` : s.state === 'dead' ? '脱落' : s.state === 'escaped' ? '脱出' : s.hp === 1 ? '負傷' : '無傷';
  function updateHUD() {
    const p = game.player, hunter = game.role === 'hunter', left = Math.max(0, Math.ceil(game.limit - game.time));
    $('timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    $('phase').textContent = game.repaired >= 3 ? 'OPEN THE FROZEN GATE' : hunter ? 'LET NO ONE LEAVE' : 'RESTORE THE HEAT';
    $('objective').textContent = game.repaired >= 3 ? hunter ? '出口を守れ' : '氷の門を開放して脱出' : hunter ? '生存者を追跡・捕獲' : `熱源を復旧する ${game.repaired} / 3`;
    $('gen-pips').innerHTML = [0, 1, 2].map(i => `<i class="${i < game.repaired ? 'done' : ''}"></i>`).join('');
    $('team').innerHTML = game.survivors.map(s => `<div class="teammate ${s.hp < 2 ? 'hurt' : ''} ${['dead', 'escaped'].includes(s.state) ? 'out' : ''}"><div class="portrait">${s.state === 'escaped' ? '↗' : s.state === 'dead' ? '×' : ['Ⅰ','Ⅱ','Ⅲ','Ⅳ'][s.id]}</div><div>${s.name}<small>${stateLabel(s)}${s.captures ? ` · 捕獲 ${s.captures}/3` : ''}</small></div></div>`).join('');
    $('player-role').textContent = hunter ? 'FROST WARDEN / 01' : 'SURVIVOR / 01';
    $('condition').textContent = hunter ? p.stun > 0 ? 'スタン中' : p.attackCD > .8 ? '攻撃中' : '氷の番人' : stateLabel(p);
    $('stamina-fill').style.width = `${hunter ? (1 - p.attackCD / 1.35) * 100 : p.stamina}%`;
    $('ability').textContent = `Q ${hunter ? '凍てつく反響' : '氷霧'} / ${p.cooldown > 0 ? `${Math.ceil(p.cooldown)}秒` : '使用可能'}`;
    $('chase').hidden = hunter || !game.visible(p) || p.state !== 'active';
    let prompt = game.action?.label || (hunter ? '左クリック / 正面の生存者を攻撃' : '熱源の近くで E を長押し');
    if (!hunter && p.state === 'caged') prompt = '氷牢に収容された。仲間の救助を待とう';
    else if (!hunter && !game.action && game.map.pallets.some(b => !b.down && !b.broken && dist(p, b) < 90)) prompt = 'SPACE / 氷の足場を倒す';
    else if (!hunter && !game.action && game.repaired >= 3) prompt = 'マップ左右の出口へ向かおう';
    $('prompt').textContent = prompt; $('action-track').hidden = !game.action; $('action-fill').style.width = `${clamp(game.action?.progress || 0, 0, 1) * 100}%`;
    $('skill').hidden = !game.skill; if (game.skill) $('skill-needle').style.left = `${game.skill.value * 100}%`;
    $('notice').style.opacity = performance.now() < noticeUntil ? '1' : '0';
    $('view-mode').textContent = view.mode === 'tps' ? 'THIRD PERSON / TPS' : 'FIRST PERSON / FPS';
    $('crosshair').classList.toggle('hunter', hunter);
    const bearing = ((view.yaw * 180 / Math.PI + 90) % 360 + 360) % 360;
    $('bearing').textContent = `${['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing / 45) % 8]}  ${String(Math.round(bearing)).padStart(3, '0')}°`;
    const objectives = game.repaired >= 3 ? game.map.gates : game.map.gens.filter(g => !g.done);
    const nearest = [...objectives].sort((a, b) => dist(p, a) - dist(p, b))[0];
    $('location').textContent = nearest ? `${game.repaired >= 3 ? '出口' : '最寄りの熱源'}まで ${Math.round(dist(p, nearest) * .03)} m` : 'FROST VEIL / SECTOR 04';
    $('danger-vignette').style.opacity = String(Math.max(shake / 8, !hunter && p.hp === 1 ? .28 : 0));
    drawMinimap();
  }
  function initAudio() { if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); } if (audio?.state === 'suspended') audio.resume().catch(() => {}); }
  function tone(freq, duration = .15, volume = .045, type = 'sine', end = freq) {
    if (muted || !audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(freq, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), audio.currentTime + duration);
    gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
  }
  function eventAudio(type) { if (['complete','power','success','rescue','escape'].includes(type)) { tone(440, .5, .04, 'sine', 880); } else if (['hit','capture','fail','pallet'].includes(type)) { tone(110, .4, .09, 'sawtooth', 30); } else if (type === 'skill') tone(740, .22, .045); else if (type === 'ability') tone(160, 1, .06, 'sine', 800); else if (type === 'swing') tone(210, .2, .025, 'triangle', 60); }
  function showEvents() { for (const e of game.events.splice(0)) { if (e.text) { $('notice').textContent = e.text; noticeUntil = performance.now() + 3400; } eventAudio(e.type); if (e.type === 'hit' && e.pos === game.player) shake = 6; } }
  function mute() { muted = !muted; try { localStorage.setItem('villanis-muted', String(muted)); } catch {} syncSound(); if (!muted) initAudio(); }
  function syncSound() { $('sound-menu').textContent = `SOUND / ${muted ? 'OFF' : 'ON'}`; $('sound').textContent = `音 ${muted ? 'OFF' : 'ON'}`; }
  function closeDialogs() { for (const d of document.querySelectorAll('dialog')) if (d.open) d.close(); }
  function start() {
    closeDialogs(); initAudio(); game = new Game(selected); view.start(game); paused = false; endedShown = false; keys.clear(); taps = {}; heartbeat = 0; shake = 0;
    $('menu').hidden = true; $('hud').hidden = false; $('map-panel').hidden = true; $('capture-mouse').hidden = false;
    $('controls-extra').innerHTML = selected === 'hunter' ? '<kbd>SPACE / クリック</kbd> 攻撃 <kbd>E</kbd> 長押しで破壊' : '<kbd>SHIFT</kbd> 走る <kbd>C</kbd> しゃがむ <kbd>E</kbd> 長押しで作業 <kbd>SPACE</kbd> 板 / 判定';
    document.activeElement?.blur(); updateHUD(); requestLook();
  }
  function title() { closeDialogs(); game = null; paused = false; keys.clear(); taps = {}; releaseLook(); $('capture-mouse').hidden = true; $('hud').hidden = true; $('menu').hidden = false; $('start').focus(); }
  function pause() { if (!game || game.ended || paused) return; paused = true; keys.clear(); taps = {}; releaseLook(); $('capture-mouse').hidden = true; $('pause-dialog').showModal(); }
  function resume() { $('pause-dialog').close(); paused = false; keys.clear(); taps = {}; requestLook(); }
  function showResult() {
    if (endedShown) return; endedShown = true; keys.clear(); releaseLook(); $('capture-mouse').hidden = true;
    $('result-label').textContent = game.result.outcome === 'win' ? 'TRIAL COMPLETE / VICTORY' : game.result.outcome === 'draw' ? 'TRIAL COMPLETE / DRAW' : 'TRIAL COMPLETE / DEFEAT';
    $('result-title').textContent = game.result.title; $('result-copy').textContent = game.result.copy;
    $('result-stats').innerHTML = `<div><strong>${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}</strong>経過時間</div><div><strong>${game.stats.repairs}</strong>復旧した熱源</div><div><strong>${game.stats.rescues}</strong>チームの救助</div><div><strong>${game.stats.captures}</strong>捕獲回数</div>`;
    $('result').showModal();
  }
  for (const button of document.querySelectorAll('[data-role]')) button.addEventListener('click', () => { selected = button.dataset.role; for (const b of document.querySelectorAll('[data-role]')) { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); } });
  $('start').onclick = start; $('retry').onclick = start; $('back').onclick = title; $('quit').onclick = title; $('resume').onclick = resume; $('pause').onclick = pause;
  $('help-button').onclick = () => $('help').showModal(); $('close-help').onclick = () => $('help').close(); $('sound').onclick = mute; $('sound-menu').onclick = mute; syncSound();
  $('pause-dialog').addEventListener('cancel', e => e.preventDefault()); $('result').addEventListener('cancel', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (!game || game.ended) return;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft','ControlRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Escape') { e.preventDefault(); if (!paused) pause(); return; }
    if (paused) return;
    if (!e.repeat) { if (e.code === 'Space') taps.space = true; if (e.code === 'KeyQ') taps.ability = true; if (e.code === 'KeyV') { view.toggleView(); notify(view.mode === 'tps' ? 'TPS / 三人称視点' : 'FPS / 一人称視点'); } if (e.code === 'KeyB' && view.mode === 'tps') view.shoulder *= -1; if (e.code === 'KeyM') $('map-panel').hidden = !$('map-panel').hidden; }
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', pause); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  let hudClock = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000 || .016, .05); last = now;
    let moving = false;
    if (!game) view.render(null, now / 1000, dt);
    else {
      if (!paused && !game.ended) {
        const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
        const strafe = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
        const move = VillanisControls.movement(view.yaw, forward, strafe), before = { x: game.player.x, y: game.player.y };
        game.step(dt, { ...move, aimAngle: view.yaw, aimPitch: view.pitch, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), crouch: keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight'), interact: keys.has('KeyE'), ...taps });
        moving = dist(before, game.player) > .01;
        taps = {}; showEvents(); heartbeat -= dt; const near = dist(game.hunter, game.player);
        if (game.role === 'survivor' && near < 400 && game.player.state === 'active' && heartbeat <= 0) { tone(52, .2, (1 - near / 450) * .11, 'sine', 30); heartbeat = .35 + near / 420; }
      }
      view.render(game, game.time, paused ? 0 : dt, moving); hudClock += dt; if (hudClock > .08) { updateHUD(); hudClock = 0; } shake = Math.max(0, shake - dt * 15); if (game.ended) showResult();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
