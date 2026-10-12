import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const configUrl = moduleUrl(compile('../src/config.ts'));
const { BASIC_ATTACKS, WORLD_UNIT_PX } = await import(configUrl);
const { RoomGame } = await import(moduleUrl(compile('../src/room-game.ts').replace("'./config'", JSON.stringify(configUrl))));
const elements = new Map();
const calls = [];
const context = new Proxy({}, { get: (_, method) => (...args) => calls.push([method, ...args]), set: () => true });
const canvas = { getContext: () => context };
globalThis.document = { querySelector: (selector) => selector === '#world-map' ? canvas : elements.get(selector) ?? null };
globalThis.ResizeObserver = class {};
globalThis.window = {};
globalThis.HTMLElement = class {};
const createGame = (character = 'zeus') => {
  const game = new RoomGame(canvas, canvas, {}, character, 'training');
  game.player.x = game.player.y = 1000;
  game.pointer.x = 1200; game.pointer.y = 1000;
  game.awaitingInitialSkill = false;
  game.itemSlots.fill(undefined);
  game.showAnnouncement = () => {};
  return game;
};
const targetAt = (game, radius, angle = 0) => {
  const target = game.createMob(game.player.x + radius * Math.cos(angle), game.player.y + radius * Math.sin(angle));
  target.hp = target.maxHp = 1000;
  return target;
};

// Reach and angular boundaries must remain the gameplay's existing 1.7 / 45 degrees.
const melee = createGame();
const range = BASIC_ATTACKS.melee.range * WORLD_UNIT_PX;
const target = targetAt(melee, range + 24 - 0.001);
target.radius = 24;
assert(melee.isMeleeTarget(target));
target.x += 0.01;
assert(!melee.isMeleeTarget(target));
melee.itemSlots[0] = 'master-belt';
assert(melee.isMeleeTarget(target));
const outsideAngle = targetAt(melee, 70, 22.6 * Math.PI / 180);
const behind = targetAt(melee, 70, Math.PI);
assert(!melee.isMeleeTarget(outsideAngle));
assert(!melee.isMeleeTarget(behind));
melee.targets = [target, outsideAngle, behind];
melee.updateBasicAttack();
assert(target.hp < 1000);
assert.equal(outsideAngle.hp, 1000);
assert.equal(behind.hp, 1000);
assert.equal(melee.arcs.length, 1);
assert(Math.abs(melee.arcs[0].range - range - 0.2 * WORLD_UNIT_PX) < 1e-8);
const afterFirstHit = target.hp;
melee.updateBasicAttack();
assert.equal(target.hp, afterFirstHit, 'Feedback must not add an extra hit');
assert.equal(melee.basicAttackTimer, 0.8);

// A dash after a strike must not drag the slash origin along with the player.
const arc = melee.arcs[0];
melee.player.x += 200;
calls.length = 0;
melee.drawMeleeArc(arc);
assert.deepEqual(calls.find(([method]) => method === 'translate'), ['translate', 1000, 1000]);
assert(calls.some(([method, , , radius]) => method === 'arc' && radius === arc.range));
const miss = createGame();
miss.targets = [targetAt(miss, 300)];
miss.updateBasicAttack();
assert.equal(miss.basicAttackTimer, 0, 'No-target behavior remains unchanged');
assert.equal(miss.arcs.length, 0);

// Lethal hit feedback survives target removal; repeated damage cannot award twice.
const lethal = createGame();
const victim = targetAt(lethal, 60);
victim.hp = 1;
lethal.targets = [victim];
lethal.gainXp = () => {};
lethal.damageMob(victim, 10);
assert.equal(lethal.targets.length, 0);
assert.equal(lethal.defeats.length, 1);
assert.equal(lethal.impacts.length, 1);
assert(lethal.defeats[0].coins > 0 && lethal.defeats[0].xp > 0);
const coins = lethal.coins;
lethal.damageMob(victim, 10);
assert.equal(lethal.coins, coins);
assert.equal(lethal.defeats.length, 1);
lethal.update(1);
assert.equal(lethal.defeats.length, 0);
assert.equal(lethal.impacts.length, 0);

// Pausing must cancel held inputs and aimed casts, including Q without a cooldown.
const paused = createGame('melodia');
paused.keys.add('d');
paused.tuning = { state: 'aiming' };
paused.relayPreview = { slot: 'E' };
paused.electRoadPreview = { angle: 0 };
paused.pause();
assert.equal(paused.keys.size, 0);
assert.equal(paused.tuning, undefined);
assert.equal(paused.relayPreview, undefined);
assert.equal(paused.electRoadPreview, undefined);
paused.onKeyDown({ key: 'q', repeat: false });
assert.equal(paused.tuning, undefined);
paused.onKeyUp({ key: 'e' });
assert.equal(paused.relayDevices.length, 0);

// The HUD distinguishes empty slots, independent cooldowns, and remaining charges.
for (const slot of ['q', 'e', 'c', 'space']) {
  for (const suffix of ['', '-name', '-value', '-status']) {
    elements.set(`#skill-${slot}${suffix}`, { dataset: {}, style: { setProperty() {} }, setAttribute() {}, textContent: '' });
  }
}
const hud = createGame('future');
hud.selectedESkill = 'time-slip'; hud.timeSlipCharges = 0; hud.timeSlipCooldown = 2.5;
hud.qCooldown = 7;
hud.updateCombatHud();
assert.equal(elements.get('#skill-q').dataset.state, 'cooldown');
assert.equal(elements.get('#skill-q-value').textContent, '7.0s');
assert.equal(elements.get('#skill-e').dataset.state, 'cooldown');
assert.equal(elements.get('#skill-c').dataset.state, 'locked');
assert.equal(elements.get('#skill-space').dataset.state, 'locked');
hud.timeSlipCharges = 1;
hud.acquiredAbilities.add('double-dash');
hud.dashCharges = 1; hud.dashCooldown = 3;
hud.updateCombatHud();
assert.equal(elements.get('#skill-e').dataset.state, 'ready');
assert.equal(elements.get('#skill-space').dataset.state, 'ready');
assert.equal(elements.get('#skill-c').dataset.state, 'locked');
console.log('Combat feedback verification passed (reach, facing, cadence, slash origin, lethal hits, pause input, HUD states).');

// Rejected inputs explain the reason without spending cooldowns or charges.
const inputs = createGame('future');
inputs.qCooldown = 1.24;
assert.equal(inputs.canUseAction('Q'), false);
assert.match(inputs.actionFeedback.message, /1\.3/);
assert.equal(inputs.qCooldown, 1.24);
assert.equal(inputs.canUseAction('C'), false);
assert.match(inputs.actionFeedback.message, /Lv5/);
assert.equal(inputs.canUseAction('SPACE'), false);
inputs.acquiredAbilities.add('dash');
assert.equal(inputs.canUseAction('SPACE'), false, 'Dash requires movement input');
inputs.keys.add('d');
assert.equal(inputs.canUseAction('SPACE'), true);
inputs.selectedESkill = 'time-slip'; inputs.timeSlipCharges = 1; inputs.timeSlipCooldown = 3;
assert.equal(inputs.canUseAction('E'), true, 'Recovering one charge must not block another');
inputs.timeSlipCharges = 0;
assert.equal(inputs.canUseAction('E'), false);

// Items cannot be consumed before setup or while paused; equipment is never consumed.
const inventory = createGame();
inventory.itemSlots[0] = 'healing-potion-s'; inventory.awaitingInitialSkill = true;
inventory.useItem(0); assert.equal(inventory.itemSlots[0], 'healing-potion-s');
inventory.awaitingInitialSkill = false; inventory.pause();
inventory.useItem(0); assert.equal(inventory.itemSlots[0], 'healing-potion-s');
inventory.resume(); inventory.useItem(0); assert.equal(inventory.itemSlots[0], undefined);
inventory.itemSlots[1] = 'master-belt'; inventory.useItem(1);
assert.equal(inventory.itemSlots[1], 'master-belt');
inventory.useItem(NaN); inventory.useItem(-1);

// Training placement provides real melee reach, resets measurements, and never moves the player.
const training = createGame();
training.createDecoy(); training.trainingTotalDamage = 100;
training.positionTrainingDecoy();
assert(training.isMeleeTarget(training.targets[0]));
assert.equal(training.trainingTotalDamage, 0);
training.player.x = 28; training.player.y = 28;
training.pointer.x = -100; training.pointer.y = -100;
training.positionTrainingDecoy();
assert.deepEqual(training.player, { x: 28, y: 28 });
assert(training.targets[0].x >= training.targets[0].radius && training.targets[0].y >= training.targets[0].radius);
assert(training.isMeleeTarget(training.targets[0]));
training.updateBasicAttack(); assert(training.trainingTotalDamage > 0);

// Defeat produces one summary and freezes the match, including healing effects.
let resultOpened = 0;
elements.set('#result-dialog', { open: false, showModal() { this.open = true; resultOpened++; } });
for (const name of ['character', 'time', 'level', 'kills', 'coins']) elements.set(`#result-${name}`, { textContent: '' });
const defeated = createGame();
defeated.elapsed = 75.2; defeated.kills = 3; defeated.level = 4; defeated.coins = 120.7;
defeated.energyChargeRemaining = 5; defeated.healingPotionRemaining = 1; defeated.healingPotionAmountRemaining = 50;
defeated.applyPlayerDamage(10000);
assert.equal(resultOpened, 1);
assert.equal(elements.get('#result-time').textContent, '01:15');
assert.equal(elements.get('#result-kills').textContent, '3');
assert.equal(elements.get('#result-level').textContent, '4');
assert.equal(elements.get('#result-coins').textContent, '120');
defeated.resume(); assert.equal(defeated.paused, true);
defeated.update(10); assert.equal(defeated.elapsed, 75.2); assert.equal(defeated.playerHp, 0);
defeated.applyPlayerDamage(1); assert.equal(resultOpened, 1);
const fresh = createGame(); assert.equal(fresh.defeated, false); assert.equal(fresh.kills, 0);
console.log('UX verification passed (input feedback, charged skills, inventory guards, decoy placement, defeat summary).');
