const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Game, dist } = require('../engine.js');

test('every spawn can navigate to every heat source, gate and cage', () => {
  const g = new Game('hunter', 1);
  for (const actor of [...g.survivors, g.hunter]) {
    assert.equal(g.blocked(actor.x, actor.y, actor.radius), false);
    for (const target of [...g.map.gens, ...g.map.gates, ...g.map.cages]) {
      const route = g.route(actor, target);
      assert.ok(route.length > 0, `No route from ${actor.x},${actor.y} to ${target.x},${target.y}`);
      assert.ok(dist(route.at(-1), target) < 55);
      for (const node of route) assert.equal(g.blocked(node.x, node.y, actor.radius), false);
    }
  }
});

test('walls stop movement and prevent attacks through cover', () => {
  const g = new Game('hunter', 2), h = g.hunter, s = g.survivors[0];
  Object.assign(h, { x: 345, y: 400 }); Object.assign(s, { x: 430, y: 400 });
  for (let i = 0; i < 60; i++) g.move(h, 1, 0, 163, .05);
  assert.ok(h.x <= 352); assert.equal(g.line(h, s), false);
  g.attack(); assert.equal(s.hp, 2);
});

test('capture, rescue protection and third capture elimination', () => {
  const g = new Game('hunter', 3), s = g.survivors[0];
  g.capture(s); assert.equal(s.state, 'caged'); assert.equal(s.captures, 1);
  g.work(g.survivors[1], { type: 'rescue', target: s }, 3.1);
  assert.equal(s.state, 'active'); assert.equal(s.hp, 1); assert.equal(s.invuln, 7);
  g.capture(s); g.work(g.survivors[1], { type: 'rescue', target: s }, 3.1); g.capture(s);
  assert.equal(s.state, 'dead'); assert.equal(g.stats.rescues, 2);
});

test('skill check rewards timing and penalizes misses with a noise', () => {
  const g = new Game('survivor', 4), target = g.map.gens[0]; target.progress = .5;
  g.skill = { value: .72, target }; g.skillCheck(); assert.equal(target.progress, .545);
  g.skill = { value: .2, target }; g.skillCheck(); assert.ok(Math.abs(target.progress - .465) < .0001); assert.equal(g.noises.length, 1);
});

test('three repaired heat sources unlock gate and permit escape', () => {
  const g = new Game('survivor', 5), p = g.player, gate = g.map.gates[0];
  Object.assign(p, { x: gate.x, y: gate.y }); assert.equal(g.interaction(p), null);
  for (const target of g.map.gens.slice(0, 3)) g.work(p, { type: 'repair', target }, 33);
  assert.equal(g.repaired, 3); assert.equal(g.interaction(p).type, 'gate');
  g.work(p, { type: 'gate', target: gate }, 7.1); g.step(.02);
  assert.equal(p.state, 'escaped'); assert.equal(g.result.outcome, 'win');
});

test('pallet stun and destruction update the navigation mesh', () => {
  const g = new Game('survivor', 6), b = g.map.pallets[0];
  Object.assign(g.player, { x: b.x, y: b.y + 42 }); Object.assign(g.hunter, { x: b.x, y: b.y - 42 });
  assert.equal(g.dropPallet(g.player), true); assert.equal(b.down, true); assert.equal(g.hunter.stun, 3); assert.equal(g.blocked(g.player.x, g.player.y, 13), false);
  g.work(g.hunter, { type: 'break', target: b }, 2.1); assert.equal(b.broken, true); assert.equal(g.blocked(b.x, b.y), false);
});

test('ice fog hides survivors and ability cannot ignore cooldown', () => {
  const g = new Game('survivor', 7); Object.assign(g.hunter, { x: g.player.x + 70, y: g.player.y });
  assert.equal(g.visible(g.player), true); g.ability(); assert.equal(g.visible(g.player), false); g.ability(); assert.equal(g.smokes.length, 1);
});

test('hunter match results distinguish win, draw and loss', () => {
  for (const [escaped, expected] of [[0, 'win'], [1, 'win'], [2, 'draw'], [3, 'lose'], [4, 'lose']]) {
    const g = new Game('hunter', 8); g.survivors.forEach((s, i) => s.state = i < escaped ? 'escaped' : 'dead'); g.checkEnd(); assert.equal(g.result.outcome, expected);
  }
});

test('AI survivors can repair, open gates and escape an idle hunter', () => {
  const g = new Game('hunter', 9); g.hunter.x = 2250; g.hunter.y = 200;
  for (let i = 0; i < 8000 && !g.ended; i++) g.step(.05);
  assert.equal(g.repaired >= 3, true); assert.equal(g.ended, true); assert.equal(g.result.outcome, 'lose'); assert.equal(g.survivors.filter(s => s.state === 'escaped').length, 4);
});

test('AI hunter navigates, pursues and eventually catches an idle player', () => {
  const g = new Game('survivor', 10);
  for (let i = 0; i < 8401 && !g.ended; i++) g.step(.05);
  assert.equal(g.ended, true); assert.ok(g.stats.hits > 0); assert.ok(g.stats.captures > 0); assert.equal(g.result.outcome, 'lose');
});
