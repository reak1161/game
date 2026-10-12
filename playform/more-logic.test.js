import test from 'node:test';
import assert from 'node:assert/strict';
import './more-logic.js';
const { resolve, anger } = globalThis.MoreLogic;
test('card order changes both dealt damage and the final attack', () => {
  const first = resolve(['train','punch','wave']);
  assert.deepEqual(first.steps.map(s=>s.damage), [0,160,260]);
  assert.equal(first.final,160);
  assert.equal(first.damage,420);
  const second = resolve(['punch','train','wave']);
  assert.equal(second.attack,130);
  assert.equal(second.damage,330);
});
test('anger uses actual HP loss and rounds down each damage event', () => {
  assert.deepEqual(anger(30,11,2),{hp:28,attack:12,lost:2});
  assert.deepEqual(anger(1,11,2),{hp:0,attack:11,lost:1});
  assert.deepEqual(anger(0,11,2),{hp:0,attack:11,lost:0});
  assert.deepEqual(anger(30,11,3),{hp:27,attack:12,lost:3});
});
