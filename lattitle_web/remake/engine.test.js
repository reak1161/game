import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startGame, setRoute, issueCommand, advance, actionSeconds, elementMultiplier } from './engine.js';

test('legacy timing and elemental immunity carry into the battle engine', () => {
  assert.equal(actionSeconds(100), 10);
  assert.equal(actionSeconds(200), 5);
  assert.equal(elementMultiplier(['Ground'], 'Electric'), 0);
  assert.equal(elementMultiplier(['Ground'], 'Wind'), 2);
});

test('movement reserves a destination and rejects a second player on it', () => {
  const game = startGame(createGame(1));
  assert.equal(setRoute(game, 0, [{ x: 0, y: 0 }, { x: 0, y: 1 }]), true);
  assert.equal(setRoute(game, 1, [{ x: 1, y: 1 }, { x: 0, y: 1 }]), false);
  for (let i = 0; i < 120; i++) advance(game, 1 / 60);
  assert.equal(game.players[0].y, 1);
  assert.equal(game.players[0].route.length, 0);
});

test('commands require a full gauge; item use heals and consumes stock', () => {
  const game = startGame(createGame(2));
  const player = game.players[0];
  player.hp = 420;
  assert.equal(issueCommand(game, 0, 3), false);
  player.gauge = 1000;
  assert.equal(issueCommand(game, 0, 3), true);
  assert.equal(player.hp, 470);
  assert.equal(player.gauge, 0);
  assert.equal(game.items[0].count, 4);
});

test('a charged attack resolves after its charge time', () => {
  const game = startGame(createGame(3));
  game.players[0].gauge = 1000;
  assert.equal(issueCommand(game, 0, 1), true);
  assert.equal(game.enemy.hp, 1200);
  for (let i = 0; i < 61; i++) advance(game, 1 / 60);
  assert.ok(game.enemy.hp < 1200);
  assert.ok(game.players[0].gauge < 100);
});

test('enemy attack is telegraphed before damage and can end a battle', () => {
  const game = startGame(createGame(4));
  game.enemy.gauge = 1000;
  advance(game, 1 / 60);
  assert.ok(game.hazards.length > 0);
  assert.ok(game.hazards.every((hazard) => hazard.remaining > 4));
  game.enemy.hp = 0;
  for (let i = 0; i < 95; i++) advance(game, 1 / 60);
  assert.equal(game.phase, 'clear');
});
