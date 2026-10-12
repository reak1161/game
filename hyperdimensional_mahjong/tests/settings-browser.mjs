import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await mkdtemp(join(tmpdir(), 'hyperdimensional-settings-browser-'));
const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let socket;
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));

try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(50); }
  }
  assert.ok(port, 'Chromeのデバッグポートが開きませんでした');
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
  const page = targets.find(target => target.type === 'page');
  assert.ok(page);
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
    const id = nextId++;
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text);
    return reply.result.value;
  };
  const until = async expression => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const result = await evaluate(expression);
      if (result) return result;
      await pause(25);
    }
    throw new Error(`画面が変わりませんでした: ${expression}`);
  };
  await send('Page.enable');
  const cleanup = await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.removeItem('mahjong-setup-v1')" });
  const reloadSetup = async () => {
    await evaluate('window.setupReloadPending = true');
    await send('Page.reload');
    await until("!window.setupReloadPending && !!document.querySelector('#start')");
  };
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("document.querySelector('#elementSettings').click()");
  assert.equal(await evaluate("document.querySelectorAll('[data-category]').length"), 6);
  await evaluate("document.querySelector('[data-bulk=none]').click()");
  await evaluate("{ const search = document.querySelector('.element-tools input'); search.value = '対子祭り'; search.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-element=pairFestival]').click(); }");
  await evaluate("document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click()");
  await evaluate("document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click()");
  await evaluate("document.querySelector('[data-category=local]').click(); document.querySelector('[data-element=renhou]').click()");
  assert.equal(await evaluate("document.querySelector('[data-local=renhou]').checked"), true);
  await evaluate("document.querySelector('[data-category=other]').click(); document.querySelector('[data-element=redDora]').click()");
  assert.equal(await evaluate("document.querySelector('#redDora').checked"), true);
  await evaluate("document.querySelector('[data-category=specialYaku]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; Math.random = () => 0; document.querySelector('#start').click()");
  await until("!!document.querySelector('.shell.game')");
  assert.ok((await evaluate("document.querySelector('.ability strong').textContent")).includes('対子祭り'));
  await evaluate("document.querySelector('[data-action=settings]').click()");
  assert.equal(await evaluate("document.querySelector('[data-auto=north]').disabled"), true);
  assert.equal(await evaluate("document.querySelector('.auto-settings + p').textContent"), '自動北抜きは三人打ちで使用できます。');
  await evaluate("document.querySelector('.dialog [data-action=settings]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.tile.special').length"), 0);
  assert.equal(await evaluate("document.body.textContent.includes('局イベント：')"), false);
  const pairReady = await evaluate("!!document.querySelector('[data-card=pairFestival]')");
  assert.ok(pairReady, '対子祭りの発動候補が表示されませんでした');
  const beforeWall = await evaluate("document.querySelector('.wall-count').textContent.match(/残り (\\d+)/)[1]");
  await evaluate("document.querySelector('[data-card=pairFestival]').click()");
  await evaluate("{ const groups = Object.groupBy([...document.querySelectorAll('.hand [data-tile]')], tile => tile.querySelector('span').textContent); const pair = Object.values(groups).find(tiles => tiles.length >= 2); pair[0].click(); pair[1].click(); document.querySelector('[data-action=confirm-pair]').click(); }");
  assert.ok(await evaluate("!!document.querySelector('.hand .tile.compressed')"));
  assert.equal(await evaluate("document.querySelector('.wall-count').textContent.match(/残り (\\d+)/)[1]"), beforeWall);
  await evaluate("document.querySelector('.hand .tile.compressed').click()");
  assert.equal(await evaluate("!!document.querySelector('.hand .tile.compressed')"), false);
  assert.ok(await evaluate("document.body.textContent.includes('圧縮牌は打牌後、通常の1枚')"));
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); for (const id of ['seitenjo', 'dancer', 'roadroller', 'randomizer', 'yakumanBody', 'pairFestival']) document.querySelector(`[data-element=${id}]`).click(); document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-close]').click(); document.querySelector('#cardsPerPlayer').value = '2'; Math.random = () => 0; document.querySelector('#start').click()");
  await until("!!document.querySelector('[data-card=pairFestival]')");
  assert.ok(await evaluate("document.querySelector('.ability').textContent.includes('踊り子')"));
  assert.ok(await evaluate("document.querySelector('.log').textContent.includes('あなたの踊り子がツモ前の手牌を変化')"));
  await evaluate("document.querySelector('[data-card=pairFestival]').click()");
  await evaluate("{ const groups = Object.groupBy([...document.querySelectorAll('.hand [data-tile]')], tile => tile.querySelector('span').textContent); const pair = Object.values(groups).find(tiles => tiles.length >= 2); pair[0].click(); pair[1].click(); document.querySelector('[data-action=confirm-pair]').click(); }");
  assert.ok(await evaluate("!!document.querySelector('.hand .tile.compressed')"));
  await evaluate("document.querySelector('.hand .tile:not(.compressed)').click()");
  assert.ok(await evaluate("!!document.querySelector('.hand .tile.compressed')"));
  assert.equal(await evaluate("document.querySelector('.log').textContent.includes('踊り子が打牌後の手牌を変化')"), false);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("{ const nativeSetTimeout = window.setTimeout.bind(window); window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 380 ? delay : Math.min(delay, 3), ...args); }");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=memory]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; document.querySelector('#specialCount').value = '12'; document.querySelector('#cards').checked = false; document.querySelector('#start').click()");
  await until("!!document.querySelector('.memory-board')");
  assert.equal(await evaluate("document.querySelector('.memory-board').children.length"), 136);
  await evaluate("document.querySelector('#memoryHelp').click()");
  assert.ok(await evaluate("document.querySelector('.memory-game .dialog.info')?.textContent.includes('対局の最初に親だったプレイヤーから')"));
  assert.ok(await evaluate("document.querySelector('.memory-game .dialog.info')?.textContent.includes('最終点数が3倍')"));
  assert.ok(await evaluate("document.querySelector('.memory-game .dialog.info')?.textContent.includes('ドラと赤ドラは使いません')"));
  assert.ok(await evaluate("document.querySelector('.memory-game .dialog.info')?.textContent.includes('役が成立したプレイヤー')"));
  await evaluate("document.querySelector('#memoryHelpClose').click()");
  assert.equal(await evaluate("!!document.querySelector('.memory-game .dialog.info')"), false);
  await evaluate("document.querySelector('#memoryYaku').click()");
  await evaluate("document.querySelector('[data-memory-yaku-tab=特殊役]').click()");
  assert.ok(await evaluate("document.querySelector('.memory-game .dialog.info')?.textContent.includes('三連子')"));
  await evaluate("document.querySelector('#memoryYakuClose').click()");
  assert.equal(await evaluate("!!document.querySelector('.memory-game .dialog.info')"), false);
  await evaluate("{ for (const index of [0, 1, 2]) document.querySelector(`[data-memory='${index}']`).click(); }");
  assert.equal(await evaluate("document.querySelectorAll('.memory-face').length"), 3);
  assert.ok(await evaluate("[...document.querySelectorAll('.memory-face')].every(tile => tile.getAttribute('aria-label').length > 0 && !tile.hasAttribute('title'))"));
  const memoryResult = await evaluate(`(async () => {
    const deadline = Date.now() + 15000;
    let specialDescriptionSeen = false;
    while (Date.now() < deadline) {
      const special = document.querySelector('.memory-face[data-memory-special], .memory-tiles [data-special-id]');
      if (special && !specialDescriptionSeen) {
        special.click();
        specialDescriptionSeen = !!document.querySelector('.special-popover strong') && document.querySelector('.special-popover').textContent.includes('現在の状態：');
      }
      const result = document.querySelector('.dialog h2')?.textContent;
      if (result) return { result, details: document.querySelector('.dialog')?.textContent || '', acquired: document.querySelectorAll('.memory-tiles .tile').length, specialDescriptionSeen, resultTiles: document.querySelectorAll('.result-hand .tile').length, hiddenLines: [...document.querySelectorAll('.result-dialog>p')].filter(p => p.style.display === 'none').length };
      const candidates = [...document.querySelectorAll('.memory-back:not(:disabled)')];
      if (candidates.length >= 2) {
        const need = document.querySelector('.memory-game>p')?.textContent?.includes('3枚') ? 3 : 2;
        const choice = candidates.sort(() => Math.random() - 0.5).slice(0, need).map(button => button.dataset.memory);
        for (const index of choice) document.querySelector('[data-memory="' + index + '"]')?.click();
      }
      await new Promise(resolvePause => setTimeout(resolvePause, 3));
    }
    return null;
  })()`);
  assert.ok(memoryResult, '神経衰弱が終了画面へ進みませんでした');
  assert.ok(memoryResult.details.includes('神経衰弱 ×3'), '完成時の3倍が表示されませんでした');
  assert.ok(memoryResult.acquired >= 14, '獲得した牌が神経衰弱の画面に表示されませんでした');
  assert.ok(memoryResult.specialDescriptionSeen, 'めくった特殊牌の説明を確認できませんでした');
  assert.equal(memoryResult.resultTiles, 14, '神経衰弱の和了形14枚が画像で表示されませんでした');
  assert.ok(memoryResult.hiddenLines > 0, '神経衰弱の和了結果が段階表示されませんでした');
  await evaluate("document.querySelector('.result-skip').click()");
  const memoryPointChanges = await evaluate("[...document.querySelectorAll('[data-point-change]')].map(row => row.dataset.pointChange)");
  assert.ok(memoryPointChanges.length >= 3);
  assert.equal(memoryPointChanges.reduce((sum, value) => sum + BigInt(value), 0n), 0n);
  assert.ok(memoryPointChanges.some(value => BigInt(value) > 0n));
  assert.equal(await evaluate("[...document.querySelectorAll('.result-dialog>p')].filter(p => p.style.display === 'none').length"), 0);
  assert.equal(await evaluate("document.querySelector('#memoryNext').style.display"), '');
  await evaluate("document.querySelector('#memorySettings').click(); document.querySelector('[data-motion]').click(); document.querySelector('#memoryNext').click()");
  await until("document.querySelector('.memory-game .topbar')?.textContent.includes('第2局')");
  assert.equal(await evaluate("!!document.querySelector('#memorySettingsClose')"), false);
  assert.equal(await evaluate("localStorage.getItem('mahjong-motion')"), 'off');
  await evaluate("document.querySelector('#memorySettings').click(); document.querySelector('[data-motion]').click(); document.querySelector('#memorySettingsClose').click()");
  assert.ok(await evaluate("document.querySelector('.memory-game>p')?.textContent.includes('あなたの手番')"), '四人打ちの第2局が起家から始まりませんでした');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("{ const nativeSetTimeout = window.setTimeout.bind(window); window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 3), ...args); }");
  await evaluate("document.querySelector('#playerCount').value = '3'; document.querySelector('#elementSettings').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=memory]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; document.querySelector('#cards').checked = false; document.querySelector('#start').click()");
  await until("!!document.querySelector('.memory-board')");
  assert.equal(await evaluate("document.querySelector('.memory-board').children.length"), 108);
  assert.equal(await evaluate("document.querySelectorAll('.memory-players > div').length"), 3);
  const threePlayerResult = await evaluate(`(async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const result = document.querySelector('.dialog h2')?.textContent;
      if (result) return { result, details: document.querySelector('.dialog')?.textContent || '' };
      const candidates = [...document.querySelectorAll('.memory-back:not(:disabled)')];
      if (candidates.length >= 2) {
        const need = document.querySelector('.memory-game>p')?.textContent?.includes('3枚') ? 3 : 2;
        const choice = candidates.sort(() => Math.random() - 0.5).slice(0, need).map(button => button.dataset.memory);
        for (const index of choice) document.querySelector('[data-memory="' + index + '"]')?.click();
      }
      await new Promise(resolvePause => setTimeout(resolvePause, 3));
    }
    return null;
  })()`);
  assert.ok(threePlayerResult, '三人打ちの神経衰弱が終了画面へ進みませんでした');
  assert.ok(threePlayerResult.details.includes('神経衰弱 ×3'), '三人打ちの神経衰弱で3倍が表示されませんでした');
  await evaluate("document.querySelector('#memoryNext').click()");
  await until("document.querySelector('.memory-game .topbar')?.textContent.includes('第2局')");
  assert.ok(await evaluate("document.querySelector('.memory-game>p')?.textContent.includes('あなたの手番')"), '三人打ちの第2局が起家から始まりませんでした');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=menzen]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=memory]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; document.querySelector('#start').click()");
  await until("!!document.querySelector('.memory-board')");
  assert.ok(await evaluate("document.querySelector('.memory-players')?.textContent.includes('能力カード：面前至上主義')"));
  await evaluate("document.querySelector('#memoryCards').click()");
  assert.ok(await evaluate("document.querySelector('.memory-game .dialog.info')?.textContent.includes('門前和了の和了点が2倍')"));
  await evaluate("document.querySelector('#memoryCardsClose').click()");
  assert.equal(await evaluate("!!document.querySelector('.memory-game .dialog.info')"), false);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("Math.random = () => 0; document.querySelector('#playerCount').value = '3'; document.querySelector('#elementSettings').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=tenchou]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; document.querySelector('#cards').checked = false; document.querySelector('#start').click()");
  await until("!!document.querySelector('.shell.game')");
  assert.ok(await evaluate("document.querySelector('.status')?.textContent.includes('転調')"));
  await evaluate("document.querySelector('[data-action=settings]').click()");
  assert.equal(await evaluate("document.querySelector('[data-auto=north]').disabled"), false);
  assert.equal(await evaluate("document.querySelector('.auto-settings + p').textContent"), '北抜きは北を抜いて補充牌を引きます。和了時は1枚につき1翻です。');
  await evaluate("document.querySelector('.dialog [data-action=settings]').click()");
  assert.ok(await evaluate("document.body.textContent.includes('転調：場の数牌がすべて次の数字に変化')"));
  await evaluate("document.querySelector('[data-action=help]').click()");
  assert.ok(await evaluate("document.querySelector('.dialog.info')?.textContent.includes('11巡目以降は50%')"));
  assert.ok(await evaluate("document.querySelector('.dialog.info')?.textContent.includes('対局の最初に親だったプレイヤー')"));
  assert.ok(await evaluate("document.querySelector('.dialog.info')?.textContent.includes('革命返し')"));
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=dancer]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click()");
  await until("!!document.querySelector('.shell.game')");
  assert.ok(await evaluate("document.querySelector('.ability strong')?.textContent.includes('踊り子')"));
  assert.equal(await evaluate("document.querySelectorAll('.hand [data-tile]').length"), 14);
  const dancerDiscard = await evaluate("(() => { const tiles = [...document.querySelectorAll('.hand [data-tile]')]; const before = tiles.slice(1).map(tile => tile.dataset.face).sort().join('|'); tiles[0].click(); const afterTiles = [...document.querySelectorAll('.hand .tile')]; return { before, after: afterTiles.map(tile => tile.dataset.face).sort().join('|'), count: afterTiles.length }; })()");
  assert.equal(dancerDiscard.count, 13, JSON.stringify(dancerDiscard));
  assert.equal(dancerDiscard.after, dancerDiscard.before, '踊り子は打牌直後に手牌を変化させません');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=dancer]').click(); document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-close]').click(); Math.random = () => 23.5 / 35; document.querySelector('#start').click()");
  await until("!!document.querySelector('.shell.game')");
  const kanIds = await evaluate("(() => { const tiles = [...document.querySelectorAll('.hand [data-tile]')]; const groups = Object.groupBy(tiles, tile => tile.querySelector('span').textContent); return Object.values(groups).find(group => group.length >= 4)?.slice(0, 4).map(tile => tile.dataset.tile) ?? []; })()");
  assert.equal(kanIds.length, 4, '踊り子の暗槓候補を作れませんでした');
  await evaluate("document.querySelector('[data-action=kan]').click()");
  for (const id of kanIds) await evaluate(`document.querySelector('[data-tile="${id}"]').click()`);
  await evaluate("document.querySelector('[data-action=confirm-kan]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.hand [data-tile]').length"), 11);
  assert.ok(await evaluate("!!document.querySelector('.table-melds .kan-group') && !document.querySelector('.player-0 .kans')"));
  const dancerAfterKan = await evaluate("(() => { const tiles = [...document.querySelectorAll('.hand [data-tile]')]; const before = tiles.slice(1).map(tile => tile.dataset.face).sort().join('|'); tiles[0].click(); const after = [...document.querySelectorAll('.hand .tile')].map(tile => tile.dataset.face).sort().join('|'); return { before, after, count: document.querySelectorAll('.hand .tile').length }; })()");
  assert.equal(dancerAfterKan.count, 10, JSON.stringify(dancerAfterKan));
  assert.equal(dancerAfterKan.after, dancerAfterKan.before, '暗槓後も打牌直後には変化しません');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("{ const nativeSetTimeout = window.setTimeout.bind(window); window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 3), ...args); Math.random = () => 0.5; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=seitenjo]').click(); document.querySelector('[data-element=randomizer]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click(); }");
  await until("!!document.querySelector('.shell.game')");
  await evaluate("document.querySelector('.hand [data-tile]').click()");
  await until("document.body.textContent.includes('ランダマイザーで手牌1枚を変化')");
  for (const [card, message] of [
    ['roadroller', 'ロードローラーで手牌3枚を1筒に変化'],
    ['change', '千変万化で手牌5枚を変化'],
    ['pocket', 'ポケットビスケットを発動'],
  ]) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await until("!!document.querySelector('#elementSettings')");
    await evaluate(`{ const nativeSetTimeout = window.setTimeout.bind(window); window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 50), ...args); Math.random = () => 0.5; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=seitenjo]').click(); document.querySelector('[data-element=${card}]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click(); }`);
    await until("!!document.querySelector('.shell.game')");
    await evaluate("document.querySelector('.hand [data-tile]').click()");
    try { await until(`document.body.textContent.includes(${JSON.stringify(message)})`); }
    catch (error) { throw new Error(`${card}: ${error.message}; ${await evaluate("document.querySelector('.log')?.textContent + ' / ' + document.querySelector('.dialog')?.textContent + ' / ' + document.querySelector('.center')?.textContent")}`); }
    if (card === 'pocket') {
      await until("document.body.textContent.includes('北家 CPUのポケットビスケットが次の2回のツモを予約')");
    }
  }
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("{ Math.random = () => 0.5; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=borrow]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click(); }");
  await until("!!document.querySelector('[data-card=borrow]')");
  await evaluate("document.querySelector('[data-card=borrow]').click()");
  assert.ok(await evaluate("!!document.querySelector('[data-borrow=\"1\"]')"), '借りパクの対象選択が表示されませんでした');
  await evaluate("document.querySelector('[data-borrow=\"1\"]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.hand [data-tile]').length"), 15);
  assert.ok(await evaluate("document.querySelector('.panel-title span')?.textContent.includes('あと2枚')"));
  await evaluate("document.querySelector('.hand [data-tile]').click()");
  assert.ok(await evaluate("document.querySelector('.center')?.textContent.includes('あなたの手番')"));
  assert.equal(await evaluate("document.querySelectorAll('.hand [data-tile]').length"), 14);
  assert.ok(await evaluate("document.querySelector('.panel-title span')?.textContent.includes('あと1枚')"));
  await evaluate("document.querySelector('.hand [data-tile]').click()");
  assert.ok(await evaluate("(document.querySelector('.log')?.textContent.match(/あなたが[^。]*を打牌/g) || []).length >= 2"), '借りパク後の2回の打牌を確認できませんでした');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("{ const nativeSetTimeout = window.setTimeout.bind(window); window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 50), ...args); Math.random = () => 0.5; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=seitenjo]').click(); document.querySelector('[data-element=borrow]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click(); }");
  await until("!!document.querySelector('.shell.game')");
  await evaluate("document.querySelector('.hand [data-tile]').click()");
  await until("document.body.textContent.includes('北家 CPUがあなたから') && document.body.textContent.includes('借りパク')");
  await until("(document.querySelector('.log')?.textContent.match(/北家 CPUが[^。]*を打牌/g) || []).length >= 2");
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#elementSettings')");
  await evaluate("{ const nativeSetTimeout = window.setTimeout.bind(window); window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 50), ...args); Math.random = () => 0.6; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=seitenjo]').click(); document.querySelector('[data-element=pickup]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click(); }");
  await until("!!document.querySelector('.shell.game')");
  await evaluate("document.querySelector('.hand [data-tile]').click()");
  try { await until("document.body.textContent.includes('北家 CPUがあなたの河から') && document.body.textContent.includes('拾いました')"); }
  catch (error) { throw new Error(`pickup: ${error.message}; ${await evaluate("document.querySelector('.log')?.textContent + ' / ' + document.querySelector('.dialog')?.textContent + ' / ' + document.querySelector('.center')?.textContent")}`); }
  await until("(document.querySelector('.log')?.textContent.match(/北家 CPUが[^。]*を打牌/g) || []).length >= 2");
  let normalResult = false;
  for (let seed = 1; seed <= 6 && !normalResult; seed++) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await until("!!document.querySelector('#start')");
    await evaluate(`{
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay === 380 ? delay : Math.min(delay, 10), ...args);
      let randomState = ${seed}; Math.random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
      document.querySelector('#cards').checked = false;
      document.querySelector('#start').click();
      document.querySelector('[data-action=settings]').click();
      for (const key of ['noCalls', 'noKan', 'win', 'tsumogiri']) { const input = document.querySelector('[data-auto="'+key+'"]'); input.checked = true; input.dispatchEvent(new Event('change', {bubbles:true})); }
      document.querySelector('.dialog [data-action=settings]').click();
      document.querySelector('.hand [data-tile]')?.click();
    }`);
    await until("!!document.querySelector('.result-dialog')");
    normalResult = await evaluate("!!document.querySelector('.result-hand')");
    if (!normalResult) continue;
    assert.equal(await evaluate("document.querySelector('.result-hand').querySelectorAll('.tile').length"), 14);
    assert.ok(await evaluate("[...document.querySelectorAll('.result-hand img')].every(img => img.src.includes('/assets/tiles/'))"));
    await evaluate("document.querySelector('.result-skip')?.click()");
    assert.equal(await evaluate("document.querySelector('[data-action=next]').style.display"), '');
    await evaluate("Promise.all([...document.querySelectorAll('.result-hand img')].map(img => img.decode()))");
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await pause(300);
    const bounds = await evaluate("(() => { const dialog = document.querySelector('.result-dialog').getBoundingClientRect(); return {left:dialog.left,right:dialog.right,top:dialog.top,bottom:dialog.bottom}; })()");
    assert.ok(bounds.left >= 0 && bounds.right <= 390 && bounds.top >= 0 && bounds.bottom <= 844);
    await mkdir('artifacts/visuals', { recursive: true });
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile('artifacts/visuals/result-mobile.png', Buffer.from(screenshot.data, 'base64'));
  }
  assert.ok(normalResult, '通常局の和了形画像を確認できませんでした');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-category=specialYaku]').click(); document.querySelector('[data-element=sameColor]').click(); document.querySelector('[data-close]').click(); document.querySelector('#cards').checked = false; document.querySelector('[data-local=renhou]').checked = true; document.querySelector('#kanYakuEnhanced').value = 'false'; for (const input of document.querySelectorAll('[data-double]')) input.checked = false; document.querySelector('#start').click(); document.querySelector('[data-action=yaku]').click()");
  const yakuSearch = async query => evaluate(`{ const input = document.querySelector('[data-yaku-search]'); input.value = ${JSON.stringify(query)}; input.dispatchEvent(new Event('input', {bubbles:true})); }`);
  await yakuSearch('国士無双十三面待ち');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=国士無双十三面待ち] strong small').textContent"), '13翻');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=国士無双十三面待ち]').dataset.yakuStatus"), 'enabled');
  await yakuSearch('同一色');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=同一色]').dataset.yakuStatus"), 'disabled');
  await yakuSearch('超一気通貫');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=超一気通貫]').dataset.yakuStatus"), 'unavailable');
  await yakuSearch('三槓子');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=三槓子] strong small').textContent"), '2翻');
  await yakuSearch('');
  await evaluate("{ const category = document.querySelector('[data-yaku-category]'); category.value = 'local'; category.dispatchEvent(new Event('change', {bubbles:true})); const availability = document.querySelector('[data-yaku-availability]'); availability.value = 'enabled'; availability.dispatchEvent(new Event('change', {bubbles:true})); }");
  assert.equal(await evaluate("document.querySelectorAll('[data-yaku-name]').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-yaku-name]').dataset.yakuName"), '人和');
  await evaluate("{ const category = document.querySelector('[data-yaku-category]'); category.value = 'special'; category.dispatchEvent(new Event('change', {bubbles:true})); const availability = document.querySelector('[data-yaku-availability]'); availability.value = 'all'; availability.dispatchEvent(new Event('change', {bubbles:true})); document.querySelector('[data-yaku-tab=特殊役]').click(); }");
  assert.equal(await evaluate("!!document.querySelector('.yaku-priority [data-yaku-find=同一色]')"), false);
  await evaluate("document.querySelector('.yaku-priority [data-yaku-find=四同刻]').click()");
  assert.equal(await evaluate("document.querySelector('[data-yaku-search]').value"), '四同刻');
  assert.equal(await evaluate("document.querySelectorAll('[data-yaku-name]').length"), 1);
  await yakuSearch('三槓子');
  await evaluate("Promise.all([...document.querySelectorAll('.yaku-example img')].map(img => img.decode()))");
  await pause(300);
  const yakuScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile('artifacts/visuals/yaku-browser-mobile.png', Buffer.from(yakuScreenshot.data, 'base64'));
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=memory]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; document.querySelector('#start').click(); document.querySelector('#memoryYaku').click()");
  await yakuSearch('平和');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=平和]').dataset.yakuStatus"), 'unavailable');
  await yakuSearch('門前清自摸和');
  assert.equal(await evaluate("document.querySelector('[data-yaku-name=門前清自摸和]').dataset.yakuStatus"), 'enabled');
  await evaluate("document.querySelector('#memoryYakuClose').click()");
  assert.equal(await evaluate("!!document.querySelector('.yaku-browser')"), false);
  for (const memory of [false, true]) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await until("!!document.querySelector('#start')");
    await evaluate(`document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=near]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); ${memory ? "document.querySelector('[data-element=memory]').click();" : ''} document.querySelector('[data-close]').click(); document.querySelector('#cards').checked = true; document.querySelector('#eventMode').value = '${memory ? 'every' : 'off'}'; Math.random = () => 0; document.querySelector('#start').click()`);
    const selector = memory ? '#memoryNear' : '[data-card=near]';
    assert.equal(await evaluate(`document.querySelector('${selector}').disabled`), false);
    await evaluate(`document.querySelector('${selector}').click()`);
    if (memory) {
      assert.equal(await evaluate("document.querySelector('#memoryNear').textContent"), 'ニアピン発動中');
      assert.equal(await evaluate("document.querySelector('#memoryNear').disabled"), true);
      await evaluate("document.querySelector('#memoryCards').click()");
      assert.equal(await evaluate("document.querySelector('.dialog.info h3').textContent"), 'ニアピン（発動中）');
      await evaluate("document.querySelector('#memorySettings').click(); document.querySelector('[data-motion]').click()");
      assert.equal(await evaluate("localStorage.getItem('mahjong-motion')"), 'off');
      assert.equal(await evaluate("document.documentElement.classList.contains('motion-off')"), true);
      assert.equal(await evaluate("document.querySelectorAll('.dialog.info').length"), 1);
      await evaluate("document.querySelector('[data-motion]').click(); document.querySelector('#memorySettingsClose').click()");
      assert.equal(await evaluate("localStorage.getItem('mahjong-motion')"), 'on');
    } else {
      assert.equal(await evaluate("!!document.querySelector('[data-card=near]')"), false);
      assert.equal(await evaluate("document.querySelector('.ability strong').textContent"), 'ニアピン（発動中）');
    }
  }
  for (const event of ['trump', 'hachiku']) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await until("!!document.querySelector('#start')");
    await evaluate(`document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=change]').click(); document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=${event}]').click(); document.querySelector('[data-close]').click(); document.querySelector('#cards').checked = true; document.querySelector('#eventMode').value = 'every'; Math.random = () => 0; document.querySelector('#start').click(); document.querySelector('[data-card=change]').click()`);
    const selectedIds = await evaluate("[...document.querySelectorAll('.hand [data-tile]')].slice(0, 5).map(tile => tile.dataset.tile)");
    for (const id of selectedIds) await evaluate(`document.querySelector('.hand [data-tile="${id}"]').click()`);
    assert.equal(await evaluate("document.querySelector('[data-action=confirm-change]').disabled"), false);
    await evaluate("Math.random = () => 0.9999999; document.querySelector('[data-action=confirm-change]').click()");
    const faces = await evaluate(`JSON.parse('${JSON.stringify(selectedIds)}').map(id => { const tile = document.querySelector('.hand [data-tile="' + id + '"]'); return { title: tile.getAttribute('aria-label'), extended: !!tile.querySelector('.extended-face') }; })`);
    assert.ok(faces.every(face => face.title.includes(event === 'trump' ? '13筒' : '9索')));
    assert.ok(faces.every(face => face.extended === (event === 'trump')));
    assert.equal(await evaluate("!!document.querySelector('[data-card=change]')"), false);
    assert.ok(await evaluate("document.querySelector('.ability strong').textContent.includes('千変万化（使用済み）')"));
  }
  const dancerSamples = [];
  for (const event of ['none', 'trump']) for (const seed of [7, 19, 41]) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await until("!!document.querySelector('#start')");
    await evaluate(`document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=dancer]').click(); document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=triplet]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); ${event === 'trump' ? "document.querySelector('[data-element=trump]').click();" : ''} document.querySelector('[data-close]').click(); document.querySelector('#cards').checked = true; document.querySelector('#specialCount').value = '12'; document.querySelector('#eventMode').value = '${event === 'trump' ? 'every' : 'off'}'`);
    const sample = await evaluate(`(async () => {
      const { isTenpai } = await import('/src/mahjong.ts');
      let state = ${seed}; Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      const read = omitDraw => [...document.querySelectorAll('.hand .tile')].filter(tile => !omitDraw || !tile.classList.contains('drawn')).map((tile, index) => { const [kind, red, special] = tile.dataset.face.split(':'); return { id: index, kind: Number(kind), red: red === 'true', ...(special ? { special } : {}) }; });
      const started = performance.now(); document.querySelector('#start').click(); const startMs = performance.now() - started;
      const initial = read(true); const initialReady = isTenpai(initial, '${event}');
      const special = document.querySelector('.hand [data-special-id]');
      special.dispatchEvent(new MouseEvent('mouseenter'));
      const statusShown = document.querySelector('.special-popover')?.textContent.includes('和了判定で刻子として使用可能');
      const popupBounds = document.querySelector('.special-popover').getBoundingClientRect();
      const anchorBounds = special.getBoundingClientRect();
      const popupAbove = popupBounds.bottom <= anchorBounds.top - 12 && popupBounds.top >= 8;
      const noNativeTooltip = !document.querySelector('[title]');
      const discarded = performance.now(); document.querySelector('.hand .tile.drawn').click(); const discardMs = performance.now() - discarded;
      const after = read(false);
      const unchangedAfterDiscard = JSON.stringify(initial) === JSON.stringify(after);
      let publicDetails = true;
      if (${seed} === 41) {
        const publicTile = document.querySelector('.hand [data-special-inspect]');
        publicTile.focus(); publicTile.click();
        publicDetails = !publicTile.disabled && !!document.querySelector('.special-popover')?.textContent.includes('和了判定で刻子として使用可能') && read(false).length === after.length;
      }
      return { event: '${event}', seed: ${seed}, startMs, discardMs, specialCount: initial.filter(tile => tile.special).length, initialReady, afterReady: isTenpai(after, '${event}'), length: after.length, statusShown, popupAbove, noNativeTooltip, publicDetails, unchangedAfterDiscard, initialKinds: initial.map(tile => String(tile.kind)).sort().join(',') };
    })()`);
    assert.equal(sample.initialReady, true, JSON.stringify(sample));
    assert.equal(sample.popupAbove, true, JSON.stringify(sample));
    assert.equal(sample.noNativeTooltip, true, JSON.stringify(sample));
    assert.equal(sample.afterReady, true, JSON.stringify(sample));
    assert.equal(sample.length, 13);
    assert.equal(sample.statusShown, true);
    assert.equal(sample.publicDetails, true);
    assert.equal(sample.unchangedAfterDiscard, true, '踊り子は打牌直後に変化してはいけません');
    if (event === 'none' && seed === 7) {
      await until("(() => { document.querySelector('[data-action=pass]')?.click(); return !!document.querySelector('.hand [data-tile]'); })()");
      assert.ok(await evaluate("document.querySelector('.log').textContent.includes('あなたの踊り子がツモ前の手牌を変化')"));
      const beforeKinds = await evaluate("[...document.querySelectorAll('.hand .tile:not(.drawn)')].map(tile => tile.dataset.face.split(':')[0]).sort().join(',')");
      assert.equal(await evaluate("document.querySelectorAll('.hand .tile').length"), 14);
      assert.notEqual(beforeKinds, sample.initialKinds, '次の通常ツモ前に別の牌姿へ変化する必要があります');
    }
    dancerSamples.push(sample);
  }
  assert.ok(dancerSamples.some(sample => sample.specialCount >= 2));
  console.log('踊り子の特殊牌サンプル:', JSON.stringify(dancerSamples));
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await evaluate("Math.random = () => 0.5; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=skeleton]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click()");
  await until("!!document.querySelector('[data-card=skeleton]')");
  await evaluate("document.querySelector('[data-card=skeleton]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.preview-tile').length"), 20);
  assert.equal(await evaluate("document.querySelector('.preview-tile small').textContent"), '北家 CPU');
  assert.ok(await evaluate("document.querySelector('.dialog.info').textContent.includes('現在のツモ順')"));
  await evaluate("document.querySelector('.dialog.info [data-action=skeleton]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.preview-tile').length"), 0);
  await evaluate("document.querySelector('.top-actions [data-action=skeleton]').click()");
  assert.equal(await evaluate("document.querySelectorAll('.preview-tile').length"), 20);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: cleanup.identifier });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await evaluate("document.querySelector('#resetSetup').click(); document.querySelector('#playerCount').value = '3'; document.querySelector('#rounds').value = '8'; document.querySelector('#redDora').checked = true; document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=dancer]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click()");
  await reloadSetup();
  assert.deepEqual(await evaluate("[document.querySelector('#playerCount').value, document.querySelector('#rounds').value, document.querySelector('#redDora').checked]"), ['3', '8', true]);
  await evaluate("document.querySelector('#elementSettings').click()");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-element]:checked')].map(input => input.dataset.element)"), ['dancer']);
  await evaluate("document.querySelector('[data-close]').click(); document.querySelector('#resetSetup').click()");
  assert.equal(await evaluate("localStorage.getItem('mahjong-setup-v1')"), null);
  assert.equal(await evaluate("document.querySelector('#playerCount').value"), '4');
  await evaluate("localStorage.setItem('mahjong-setup-v1', JSON.stringify({ settings: { playerCount: 99, rounds: -1, cards: 'yes' }, elements: { cards: ['invalid', 'dancer'], other: ['invalid', 'redDora'] } }))");
  await reloadSetup();
  assert.deepEqual(await evaluate("[document.querySelector('#playerCount').value, document.querySelector('#rounds').value, document.querySelector('#redDora').checked]"), ['4', '4', true]);
  await evaluate("localStorage.setItem('mahjong-setup-v1', '{broken')");
  await reloadSetup();
  assert.equal(await evaluate("document.querySelector('#redDora').checked"), false);
  console.log(`設定・能力・局イベント・和了結果・役一覧と、拡張数牌／索子への千変万化を確認しました。`);
} finally {
  socket?.close();
  chrome.kill();
  if (resolve(dirname(profile)) !== resolve(tmpdir())) throw new Error('一時プロファイルの場所を確認できません');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
