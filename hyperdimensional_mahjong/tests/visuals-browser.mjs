import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'mahjong-visuals-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(50); }
  }
  assert.ok(port);
  const pages = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const pending = new Map();
  const errors = [];
  let id = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 200; i++) { const value = await evaluate(expression); if (value) return value; await pause(25); }
    throw new Error(`画面の待機失敗: ${expression}`);
  };
  const screenshot = async name => {
    await until("[...document.images].every(img => img.complete)");
    await pause(350);
    await mkdir('artifacts/visuals', { recursive: true });
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(`artifacts/visuals/${name}.png`, Buffer.from(result.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: process.env.GAME_URL || 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await screenshot('setup');
  // Verify every normal/red asset decodes, plus all extended ranks.
  assert.equal(await evaluate(`(async () => {
    const { tileFaceHtml } = await import('/src/visuals.ts');
    const gallery = document.createElement('div'); gallery.className = 'asset-gallery';
    gallery.innerHTML = Array.from({length:46}, (_, kind) => '<span class="tile">' + tileFaceHtml(kind) + '</span>').join('') + [4,13,22].map(kind => '<span class="tile red">' + tileFaceHtml(kind,true) + '</span>').join('');
    document.body.append(gallery);
    await Promise.all([...gallery.querySelectorAll('img')].map(img => img.decode()));
    const count = gallery.querySelectorAll('img').length;
    if (gallery.querySelectorAll('.extended-face').length !== 12) throw new Error('拡張数牌');
    gallery.remove(); return count;
  })()`), 37);
  await evaluate("Math.random = () => 0.42; document.querySelector('#cards').checked = false; document.querySelector('#elementSettings').click(); document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-close]').click(); document.querySelector('#start').click()");
  await until("!!document.querySelector('.hand .drawn')");
  assert.ok(await evaluate("!document.querySelector('[title]')"));
  assert.equal(await evaluate("document.querySelector('.ability small').textContent"), '能力カード ・ 0枚');
  assert.equal(await evaluate("document.querySelector('.ability').classList.contains('spent')"), false);
  assert.equal(await evaluate("document.querySelector('.hand .tile').getAttribute('aria-label').length > 0"), true);
  await screenshot('table-desktop');
  assert.ok(await evaluate(`(() => {
    const table = document.querySelector('.table');
    const hand = table.querySelector('.hand');
    const drawn = hand.querySelector('.drawn');
    const ability = table.querySelector('.ability').getBoundingClientRect();
    const melds = table.querySelector('.table-melds').getBoundingClientRect();
    return !!table.querySelector('.hand-panel') && drawn === hand.lastElementChild
      && parseFloat(getComputedStyle(drawn).marginLeft) >= 10 && ability.right <= melds.left;
  })()`));
  assert.equal(await evaluate("[...document.querySelectorAll('.tile-face img')].every(img => img.naturalWidth > 0)"), true);
  await evaluate("document.querySelector('[data-action=help]').click()");
  assert.equal(await evaluate("document.querySelector('.dialog.info').textContent.includes('素材・クレジット')"), true);
  assert.equal(await evaluate("document.getAnimations().filter(a => a.effect.target.closest('.hand')).length"), 0);
  await evaluate("document.querySelector('.dialog [data-action=help]').click()");
  // Capture a discard synchronously, before CPU timers can change the state.
  const discarded = await evaluate("(() => { const tile = document.querySelector('.hand .drawn'); const id = tile.dataset.tile; tile.click(); return { id, marked: !!document.querySelector('.river .last-discard'), animations: document.getAnimations().filter(a => a.effect.target.closest('.river')).length }; })()");
  assert.equal(discarded.marked, true);
  assert.ok(discarded.animations > 0);
  await until("!!document.querySelector('.hand [data-tile]')");
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await screenshot('table-mobile');
  assert.ok(await evaluate("document.querySelector('.hand').scrollWidth <= document.querySelector('.hand').clientWidth"));
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
  assert.ok(await evaluate("document.querySelector('.hand-panel').getBoundingClientRect().bottom <= innerHeight + 1"));
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.table-arena .kan-group')).every(group => {
    const box = group.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth;
  })`));
  await send('Emulation.setDeviceMetricsOverride', { width: 738, height: 425, deviceScaleFactor: 1, mobile: false });
  await screenshot('table-landscape');
  const riversFit = await evaluate(`Array.from(document.querySelectorAll('.table-arena .river')).every(river => {
    const box = river.getBoundingClientRect(); return box.top >= 0 && box.bottom <= document.querySelector('.hand').getBoundingClientRect().top;
  })`);
  assert.ok(riversFit, JSON.stringify(await evaluate("Array.from(document.querySelectorAll('.table-arena .river')).map(r => ({top: r.getBoundingClientRect().top, bottom: r.getBoundingClientRect().bottom, hand: document.querySelector('.hand').getBoundingClientRect().top}))")));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('[data-action=settings]').click(); document.querySelector('[data-motion]').click()");
  assert.equal(await evaluate("localStorage.getItem('mahjong-motion')"), 'off');
  await evaluate("document.querySelector('.dialog [data-action=settings]').click()");
  await evaluate("document.querySelector('.hand [data-tile]').click()");
  assert.equal(await evaluate("document.getAnimations().length"), 0);
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  assert.equal(await evaluate("document.querySelector('[data-motion]').checked"), false);
  await evaluate("document.querySelector('[data-motion]').click(); document.querySelector('#cards').checked = false; Math.random = () => 0.42; document.querySelector('#start').click()");
  await until("!!document.querySelector('.hand .drawn')");
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate("document.querySelector('.hand .drawn').click()");
  assert.equal(await evaluate("document.getAnimations().length"), 0);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await evaluate(`document.querySelector('#elementSettings').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=dancer]').click(); document.querySelector('[data-category=specials]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=triplet]').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-close]').click(); document.querySelector('#cards').checked = true; document.querySelector('#specialCount').value = '12'; document.querySelector('#eventMode').value = 'off'; let seed = 41; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); document.querySelector('#start').click();`);
  await until("!!document.querySelector('.hand [data-special-id]')");
  await evaluate("document.querySelector('.hand [data-special-id]').dispatchEvent(new MouseEvent('mouseenter'))");
  await screenshot('special-popover-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('.hand [data-special-id]').dispatchEvent(new MouseEvent('mouseenter'))");
  await screenshot('special-popover-mobile');
  assert.ok(await evaluate(`(() => {
    const box = document.querySelector('.special-popover').getBoundingClientRect();
    const tile = document.querySelector('.hand [data-special-id]').getBoundingClientRect();
    return box.bottom <= tile.top - 12 && box.left >= 8 && box.right <= innerWidth - 8;
  })()`));
  await evaluate("document.querySelector('.ability-face').click()");
  assert.ok(await evaluate("!!document.querySelector('.dialog.info h3')"));
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await until("!!document.querySelector('#start')");
  await evaluate("document.querySelector('#elementSettings').click(); document.querySelector('[data-category=events]').click(); document.querySelector('[data-bulk=none]').click(); document.querySelector('[data-element=memory]').click(); document.querySelector('[data-close]').click(); document.querySelector('#eventMode').value = 'every'; document.querySelector('#start').click()");
  await until("!!document.querySelector('[data-memory]')");
  await evaluate("document.querySelector('[data-memory]').click()");
  await until("!!document.querySelector('.memory-face img')?.naturalWidth");
  await screenshot('memory');
  assert.deepEqual(errors, []);
  console.log('牌画像37種、拡張牌12種、PC・スマホ表示、ツモ・打牌の印、演出の差分再生・OFF・動きを減らす設定、神経衰弱を確認。画像は artifacts/visuals/ に保存。');
} finally {
  socket?.close(); chrome.kill();
  if (resolve(dirname(profile)) !== resolve(tmpdir())) throw new Error('一時プロファイルの場所を確認できません');
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
