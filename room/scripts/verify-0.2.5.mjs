import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const configUrl = moduleUrl(compile('../src/config.ts'));
const config = await import(configUrl);
const { RoomGame } = await import(moduleUrl(compile('../src/room-game.ts').replace("'./config'", JSON.stringify(configUrl))));
const canvas = { getContext: () => ({}) };
globalThis.document = { querySelector: (selector) => selector === '#world-map' ? canvas : null };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.requestAnimationFrame = () => 1;
const createGame = (character = 'zeus') => {
  const game = new RoomGame(canvas, canvas, {}, character);
  game.player.x = game.player.y = 1000;
  game.pointer.x = 1200; game.pointer.y = 1000;
  game.awaitingInitialSkill = false;
  game.showAnnouncement = () => {};
  return game;
};

const startup = createGame();
startup.awaitingInitialSkill = true;
startup.resize = () => {};
startup.canvas.addEventListener = () => {};
startup.openEChoice = () => true;
startup.openAbilityChoice = () => true;
startup.start();
assert.deepEqual(startup.pendingChoices.map(({ kind, slot }) => [kind, slot]), [['e-skill', 'E'], ['ability', undefined]]);
startup.draw = () => {};
startup.loop(1000); assert.equal(startup.elapsed, 0);
const startupButton = { dataset: { eSkill: 'energy-charge', skillSlot: 'E' }, querySelector: () => ({ textContent: 'エネルギーチャージ' }) };
startup.onAbilityChoice({ target: { closest: () => startupButton } });
assert.equal(startup.awaitingInitialSkill, false); assert.equal(startup.selectedESkill, 'energy-charge');
assert.equal(startup.pendingChoices[0].kind, 'ability');

// Several level-ups while a choice is pending must preserve both milestone events.
const queueGame = createGame();
queueGame.choiceOpen = true;
queueGame.level = 4;
const nextLevelXp = config.XP_REQUIREMENTS[4] + config.XP_REQUIREMENTS[5];
queueGame.gainXp(nextLevelXp);
assert.deepEqual(queueGame.pendingChoices.map(({ kind, level }) => [kind, level]), [['ability', 5], ['skill-upgrade', 5], ['ability', 6]]);
const shown = [];
queueGame.openAbilityChoice = (_, level) => { shown.push(`ability:${level}`); return true; };
queueGame.openSkillUpgradeChoice = (level) => { shown.push(`skill:${level}`); return true; };
queueGame.choiceOpen = false;
queueGame.showNextChoice(); queueGame.completeChoice(); queueGame.completeChoice();
assert.deepEqual(shown, ['ability:5', 'skill:5', 'ability:6']);

// Additional skills keep separate cooldowns and cannot occupy both slots.
const skills = createGame();
assert.equal(skills.assignAdditionalSkill('E', 'diamond-dust'), true);
assert.equal(skills.assignAdditionalSkill('C', 'stealth-mission'), true);
assert.equal(skills.assignAdditionalSkill('C', 'diamond-dust'), false);
skills.castAdditionalSkill('E');
assert.equal(skills.abilityProjectiles.length, 30);
assert.equal(skills.eCooldown, 15); assert.equal(skills.cCooldown, 0);
assert(skills.abilityProjectiles.every((projectile) => projectile.speed === 9 && projectile.maxDistance === 6 && projectile.damage === 6 && Math.abs(projectile.angle) <= Math.PI / 8));
skills.castAdditionalSkill('C');
assert.equal(skills.cCooldown, 15); assert.equal(skills.stealthRemaining, 3);
skills.castAdditionalSkill('E'); assert.equal(skills.abilityProjectiles.length, 30);
for (let index = 0; index < 20; index += 1) skills.update(0.05);
assert(Math.abs(skills.eCooldown - 14) < 1e-8); assert(Math.abs(skills.cCooldown - 14) < 1e-8);

// Every device pair connects; range and forming segments use the gameplay geometry.
const relay = createGame();
relay.assignAdditionalSkill('C', 'lightning-relay');
for (let index = 0; index < 4; index += 1) {
  relay.cCooldown = 0;
  relay.pointer.x = relay.player.x + (index + 1) * config.WORLD_UNIT_PX;
  relay.castAdditionalSkill('C'); relay.placeLightningRelay();
}
assert.equal(relay.relayDevices.length, 4); assert.equal(relay.relayLinks.length, 6);
relay.pointer.x = relay.player.x + 30 * config.WORLD_UNIT_PX;
assert.equal(relay.relayPlacementPoint().x - relay.player.x, 7 * config.WORLD_UNIT_PX);
const first = { x: 0, y: 0, remaining: 30 }, second = { x: 40 * config.WORLD_UNIT_PX, y: 0, remaining: 30 };
relay.relayDevices = [first, second];
const link = { first, second, age: 0, hitTimes: new Map() };
relay.relayLinks = [link];
const near = { x: config.WORLD_UNIT_PX, y: 0, radius: 0, relaySlowRemaining: 0 };
const middle = { x: 20 * config.WORLD_UNIT_PX, y: 0, radius: 0, relaySlowRemaining: 0 };
relay.targets = [near, middle];
const hits = []; relay.damageMob = (target, damage, attribute) => hits.push({ target, damage, attribute });
relay.updateLightningRelays(0.5);
assert.equal(hits.length, 1); assert.equal(hits[0].target, near); assert.equal(hits[0].damage, 7);
assert.equal(near.relaySlowRemaining, 0.1); assert.equal(middle.relaySlowRemaining, 0);
assert.equal(relay.relaySegments(link)[0].end.x, 8.5 * config.WORLD_UNIT_PX);
first.remaining = 0.1; relay.updateLightningRelays(0.2);
assert.equal(relay.relayLinks.length, 0);

// A returning wisp cannot start another attack even after its cooldown expires.
const wisp = createGame(); wisp.acquiredAbilities.add('wandering-wisp');
const enemy = { x: wisp.player.x + 3 * config.WORLD_UNIT_PX, y: wisp.player.y, radius: 8 };
wisp.targets = [enemy];
const wispHits = []; wisp.damageMob = (_, damage, attribute) => wispHits.push([damage, attribute]);
for (let index = 0; index < 10 && !wispHits.length; index += 1) wisp.updateWanderingWisp(0.05);
assert.deepEqual(wispHits, [[6, '炎']]);
assert.equal(wisp.wanderingWisp.phase, 'return');
wisp.wanderingWisp.cooldown = 0;
wisp.wanderingWisp.x = wisp.player.x - 20 * config.WORLD_UNIT_PX;
wisp.updateWanderingWisp(0.05);
assert.equal(wisp.wanderingWisp.phase, 'return'); assert.equal(wispHits.length, 1);
for (let index = 0; index < 20; index += 1) wisp.updateWanderingWisp(0.05);
assert(wispHits.length > 1);

// Multi-stock purchases reduce quantity once without shifting other shop slots.
const shop = createGame();
shop.shopOpen = true; shop.shopPosition.x = shop.player.x; shop.shopPosition.y = shop.player.y;
shop.shopStock.splice(0, shop.shopStock.length, { itemId: 'muzzle', quantity: 3 });
shop.itemSlots.fill(undefined); shop.coins = 120;
shop.buyShopItem(0); shop.buyShopItem(0);
assert.equal(shop.shopStock[0].quantity, 1); assert.equal(shop.coins, 40);
assert.deepEqual(shop.itemSlots, ['muzzle', 'muzzle', undefined]);
shop.useItem(0); assert.equal(shop.itemSlots[0], 'muzzle');
shop.buyShopItem(0); assert.equal(shop.shopStock[0].quantity, 0);
shop.buyShopItem(0); assert.equal(shop.coins, 0);
shop.updateBasicAttack();
assert.equal(shop.basicProjectiles.length, 0); // Zeus is melee; equipment is attack-type specific.
const ranged = createGame('melodia'); ranged.itemSlots.fill(undefined); ranged.itemSlots[0] = 'muzzle';
ranged.updateBasicAttack(); assert.equal(ranged.basicProjectiles[0].maxDistance, 3.1);
const melee = createGame(); melee.itemSlots.splice(0, 3, 'brass-knuckles', 'master-belt', undefined);
const meleeTarget = { x: melee.player.x + 1.85 * config.WORLD_UNIT_PX, y: melee.player.y, radius: 0 };
melee.targets = [meleeTarget]; const meleeHits = [];
melee.damageMob = (_, damage) => meleeHits.push(damage);
melee.updateBasicAttack(); assert.deepEqual(meleeHits, [melee.playerAttackPower + 0.4]);

const guard = createGame(); guard.acquiredAbilities.add('bubbling-guard');
const incoming = { x: guard.player.x + 3 * config.WORLD_UNIT_PX, y: guard.player.y, angle: Math.PI, speed: 50, travelled: 0, maxDistance: 8, damage: 5 };
guard.monsterProjectiles.push(incoming);
const guardHp = guard.playerHp; guard.update(0.05);
assert.equal(guard.monsterProjectiles.length, 0); assert.equal(guard.playerHp, guardHp);
const unguarded = createGame(); unguarded.monsterProjectiles.push({ ...incoming, x: unguarded.player.x + 3 * config.WORLD_UNIT_PX, y: unguarded.player.y, travelled: 0 });
const unguardedHp = unguarded.playerHp; unguarded.update(0.05);
assert.equal(unguarded.playerHp, unguardedHp - 5);

const metrics = createGame();
const metricLabels = { '#training-total': {}, '#training-dps': {}, '#training-dps-recent': {} };
document.querySelector = (selector) => metricLabels[selector] ?? null;
metrics.trainingStartedAt = 2; metrics.elapsed = 4; metrics.trainingTotalDamage = 30;
metrics.trainingRecentDamage = [{ time: 2, damage: 10 }, { time: 3, damage: 5 }, { time: 3.5, damage: 15 }];
metrics.updateTrainingMetrics();
assert.equal(metricLabels['#training-dps'].textContent, '平均DPS 15');
assert.equal(metricLabels['#training-dps-recent'].textContent, '直近1秒DPS 15');
metrics.elapsed = 4.5; metrics.updateTrainingMetrics();
assert.equal(metricLabels['#training-dps-recent'].textContent, '直近1秒DPS 0');
metrics.resetTrainingMetrics();
assert.equal(metricLabels['#training-dps'].textContent, '平均DPS 0');
assert.equal(metricLabels['#training-dps-recent'].textContent, '直近1秒DPS 0');
assert.equal(metrics.trainingRecentDamage.length, 0);

console.log('0.2.5 gameplay verification passed (queue, E/C, projectiles, relays, wisp, shop, DPS).');
