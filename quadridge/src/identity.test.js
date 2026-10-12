import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayName, normalizeRoomCode } from './identity.js';

test('表示名は前後の空白と Unicode を正規化する', () => {
  assert.equal(normalizeDisplayName('  Ａｌｉｃｅ＿１２  '), 'Alice_12');
  assert.equal(normalizeDisplayName('あおい'), 'あおい');
  assert.equal(normalizeDisplayName('太郎'), '太郎');
});

test('不正な表示名とルームIDを拒否する', () => {
  assert.throws(() => normalizeDisplayName('<script>'));
  assert.throws(() => normalizeDisplayName('a'.repeat(17)));
  assert.throws(() => normalizeDisplayName(''));
  assert.equal(normalizeRoomCode(' abc123 '), 'ABC123');
  assert.throws(() => normalizeRoomCode('AB 123'));
  assert.throws(() => normalizeRoomCode('ABCDE'));
});
