// Uses an installed Chrome; set BROWSER_PATH to use another Chromium browser.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..'), port = 4187;
const output = path.join(root, 'artifacts'); fs.mkdirSync(output, { recursive: true });

(async () => {
  const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let browser;
  try {
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000); server.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); server.once('error', reject); server.once('exit', code => { if (code) reject(new Error(`Server exited ${code}`)); }); });
    browser = await chromium.launch({ ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : { channel: 'chrome' }), headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // Test-only interception: production builds expose no debug game state.
    await page.addInitScript(() => {
      let api, render;
      Object.defineProperty(window, 'Villanis', { configurable: true, get: () => api, set: value => { const Base = value.Game; value.Game = class extends Base { constructor(...args) { super(...args); window.__game = this; } }; api = value; } });
      Object.defineProperty(window, 'Villanis3D', { configurable: true, get: () => render, set: value => { render = class extends value { constructor(...args) { super(...args); window.__view = this; } }; } });
    });
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => window.__view?.renderer.info.render.frame > 3);
    assert.equal(await page.evaluate(() => __view.camera.isPerspectiveCamera), true);
    await page.screenshot({ path: path.join(output, 'title-3d.png') });
    await page.click('#help-button'); assert.equal(await page.locator('#help').evaluate(e => e.open), true); await page.click('#close-help');
    await page.click('#start'); await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
    assert.equal(await page.evaluate(() => __view.mode), 'tps');
    assert.equal(await page.evaluate(() => __view.actors[0].visible), true);
    // Camera-relative motion must change direction after real mouse-look input.
    const yawBefore = await page.evaluate(() => __view.yaw);
    await page.mouse.move(950, 480); await page.waitForTimeout(100);
    assert.notEqual(await page.evaluate(() => __view.yaw), yawBefore);
    const before = await page.evaluate(() => ({ x: __game.player.x, y: __game.player.y, yaw: __view.yaw }));
    await page.keyboard.down('KeyW'); await page.waitForTimeout(450); await page.keyboard.up('KeyW');
    const delta = await page.evaluate(p => ({ x: __game.player.x - p.x, y: __game.player.y - p.y }), before);
    assert.ok(delta.x * Math.cos(before.yaw) + delta.y * Math.sin(before.yaw) > 15, 'W did not follow view direction');
    await page.keyboard.press('KeyV'); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => __view.mode), 'fps'); assert.equal(await page.evaluate(() => __view.actors[0].visible), false);
    const eye = await page.evaluate(() => __view.camera.position.y); assert.ok(eye > 1.5 && eye < 1.8);
    await page.keyboard.down('KeyC'); await page.waitForTimeout(100); assert.ok(await page.evaluate(() => __view.camera.position.y) < 1.3); await page.keyboard.up('KeyC');
    await page.keyboard.press('KeyV');
    // Put a solid bunker wall behind the character and verify camera retracts.
    await page.evaluate(() => { Object.assign(__game.player, { x: 740, y: 350 }); __view.yaw = 0; __view.pitch = 0; __view.cameraDistance = 3.7; });
    await page.waitForTimeout(150);
    const clipped = await page.evaluate(() => ({ x: __view.camera.position.x, distance: __view.cameraDistance }));
    assert.ok(clipped.distance < 1, 'TPS camera failed to retract at wall'); assert.ok(clipped.x > 21.3, 'Camera clipped into bunker');
    await page.evaluate(() => { Object.assign(__game.player, { x: 550, y: 490 }); __view.yaw = -Math.PI / 2; __view.pitch = -.1; __game.hunter.x = 2200; __game.hunter.y = 200; __game.hunterAI = () => {}; __game.map.gens[0].progress = .97; __game.skillWait = 100; });
    await page.keyboard.down('KeyE'); await page.waitForFunction(() => __game.map.gens[0].done, { timeout: 4000 }); await page.keyboard.up('KeyE');
    await page.keyboard.press('KeyQ'); await page.waitForFunction(() => __game.smokes.length === 1);
    await page.screenshot({ path: path.join(output, 'survivor-tps.png') });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.getElementById('pause-dialog').open);
    const pausedAt = await page.evaluate(() => __game.time); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => __game.time), pausedAt);
    await page.click('#resume'); await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => document.getElementById('pause-dialog').open); await page.click('#quit');
    await page.click('[data-role="hunter"]'); await page.click('#start'); await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
    assert.equal(await page.evaluate(() => __view.mode), 'fps');
    assert.equal(await page.evaluate(() => __view.hand.visible), true);
    await page.evaluate(() => { const g = __game; g.survivorAI = () => {}; Object.assign(g.hunter, { x: 600, y: 850, attackCD: 0 }); Object.assign(g.survivors[0], { x: 650, y: 850, invuln: 0 }); __view.yaw = Math.PI; __view.pitch = -.1; });
    await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __game.stats.hits), 0, 'Hit a target behind the camera');
    await page.evaluate(() => { __view.yaw = 0; __view.pitch = 1.1; __game.hunter.attackCD = 0; }); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __game.stats.hits), 0, 'Hit while looking at the sky');
    await page.evaluate(() => { __view.pitch = -.1; __game.hunter.attackCD = 0; }); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => __game.stats.hits), 1);
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(100); assert.ok(await page.evaluate(() => __game.reveal) > 4);
    await page.waitForTimeout(450); await page.screenshot({ path: path.join(output, 'hunter-fps.png') });
    await page.evaluate(() => { __game.survivors.forEach(s => s.state = 'dead'); }); await page.waitForFunction(() => document.getElementById('result').open); assert.equal(await page.evaluate(() => document.pointerLockElement), null);
    await page.click('#back'); await page.setViewportSize({ width: 800, height: 600 }); await page.waitForTimeout(100); await page.screenshot({ path: path.join(output, 'small-screen.png') });
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href); await page.waitForFunction(() => window.__view?.renderer.info.render.frame > 3); await page.click('#start'); await page.waitForTimeout(100); assert.equal(await page.locator('#hud').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('3D browser checks passed: WebGL, perspective, pointer lock, mouse look, camera-relative WASD, TPS/FPS, crouch, wall collision, repair, ice fog, pause/resume, directional attacks, reveal, result, resize, offline launch.');
  } finally { await browser?.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
