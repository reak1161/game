import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const playerCount = Number(process.argv[2] ?? 3);
assert.ok(playerCount === 3 || playerCount === 4, '人数は3または4を指定してください');
const expectedTiles = playerCount === 3 ? 9 : 12;
const profile = await mkdtemp(join(tmpdir(), 'hyperdimensional-mahjong-browser-'));
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
  assert.ok(page, 'Chromeのタブが見つかりませんでした');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
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
  const until = async (expression, limit = 10000) => {
    const deadline = Date.now() + limit;
    while (Date.now() < deadline) {
      const value = await evaluate(expression);
      if (value) return value;
      await pause(30);
    }
    throw new Error(`画面が変わりませんでした: ${expression}`);
  };

  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, document.querySelector('.finale-preview') ? 150 : 20), ...args);
  ` });
  let sawFinale = false;
  let previewCount = 0;
  let finalResult = '';
  for (let seed = 1; seed <= 30 && finalResult !== 'フィナーレ終了'; seed++) {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await until("!!document.querySelector('#start')");
    await evaluate(`{
      document.querySelector('#playerCount').value = '${playerCount}';
      document.querySelector('#eventMode').value = 'every';
      document.querySelector('#cards').checked = false;
      document.querySelector('#elementSettings').click();
      document.querySelector('[data-category="events"]').click();
      document.querySelector('[data-bulk="none"]').click();
      document.querySelector('[data-element="finale"]').click();
      document.querySelector('[data-close]').click();
      let first = true, state = ${seed};
      Math.random = () => { if (first) { first = false; return 0.63; } state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
      document.querySelector('#start').click();
    }`);
    assert.ok(await until("document.body.textContent.includes('局イベント フィナーレ')"), 'フィナーレ局が始まりませんでした');
    await evaluate(`document.querySelector('[data-action="settings"]').click()`);
    for (const key of ['noCalls', 'noKan', 'tsumogiri', 'win']) {
      await evaluate(`{ const input = document.querySelector('[data-auto="${key}"]'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }`);
    }
    await evaluate(`document.querySelector('.close[data-action="settings"]').click()`);
    await evaluate(`document.querySelector('.hand [data-tile]')?.click()`);
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const state = await evaluate(`({ finale: !!document.querySelector('.finale-preview'), preview: document.querySelectorAll('.finale-tiles .tile').length, result: document.querySelector('.dialog:not(.info) h2')?.textContent || '' })`);
      if (state.finale) { sawFinale = true; previewCount = Math.max(previewCount, state.preview); }
      if (state.result) { finalResult = state.result; break; }
      await pause(10);
    }
  }
  assert.ok(sawFinale, `フィナーレ画面が表示されませんでした: ${finalResult}`);
  assert.equal(previewCount, expectedTiles, `${playerCount}人打ちの公開開始時は${expectedTiles}牌`);
  assert.equal(finalResult, 'フィナーレ終了');
  console.log(`${playerCount}人打ちのフィナーレ: ${expectedTiles}牌の公開表示から終了画面まで確認しました。`);
} finally {
  socket?.close();
  chrome.kill();
  const tempRoot = resolve(tmpdir());
  if (resolve(dirname(profile)) !== tempRoot) throw new Error('一時プロファイルの場所を確認できません');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
