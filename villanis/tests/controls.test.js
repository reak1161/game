const { test } = require('node:test');
const assert = require('node:assert/strict');
const { movement, inAttackArc } = require('../controls.js');
const { Game } = require('../engine.js');

test('WASD follows the camera in all four cardinal directions', () => {
  for (const [yaw, expected] of [[0, [1, 0]], [Math.PI / 2, [0, 1]], [Math.PI, [-1, 0]], [-Math.PI / 2, [0, -1]]]) {
    const p = movement(yaw, 1, 0), right = movement(yaw, 0, 1);
    assert.ok(Math.abs(p.x - expected[0]) < 1e-9); assert.ok(Math.abs(p.y - expected[1]) < 1e-9);
    assert.ok(Math.abs(right.x + expected[1]) < 1e-9); assert.ok(Math.abs(right.y - expected[0]) < 1e-9);
  }
});

test('diagonal camera-relative movement does not grant a speed advantage', () => {
  for (let yaw = -Math.PI; yaw <= Math.PI; yaw += .1) {
    const v = movement(yaw, 1, 1); assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9);
  }
  assert.deepEqual(movement(1.3, 0, 0), { x: 0, y: 0 });
});

test('melee cannot hit behind the FPS camera, then hits when turned to face the target', () => {
  const g = new Game('hunter', 12), h = g.hunter, s = g.survivors[0];
  Object.assign(h, { x: 600, y: 850 }); Object.assign(s, { x: 560, y: 850 });
  assert.equal(inAttackArc(h, s, 0), false); g.attack(0); assert.equal(s.hp, 2);
  h.attackCD = 0; assert.equal(inAttackArc(h, s, Math.PI), true); g.attack(Math.PI); assert.equal(s.hp, 1);
});

test('strafing does not rotate hunter aim away from the camera', () => {
  const g = new Game('hunter', 13); Object.assign(g.hunter, { x: 600, y: 850 });
  g.step(.05, { ...movement(0, 0, 1), aimAngle: 0 });
  assert.ok(g.hunter.y > 850); assert.equal(g.hunter.angle, 0);
});

test('looking at the sky cannot hit a survivor on the ground', () => {
  const g = new Game('hunter', 14), h = g.hunter, s = g.survivors[0];
  Object.assign(h, { x: 600, y: 850 }); Object.assign(s, { x: 650, y: 850 });
  g.attack(0, 1.1); assert.equal(s.hp, 2);
  h.attackCD = 0; g.attack(0, -.1); assert.equal(s.hp, 1);
});
