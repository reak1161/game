import test from 'node:test';
import assert from 'node:assert/strict';
import { cardEventNote, cardStatus } from '../src/card_status.ts';

test('破竹の勢いの説明は筒子へ変化するカードにだけ追加する', () => {
  assert.ok(cardEventNote('roadroller', 'hachiku').includes('一索'));
  assert.ok(cardEventNote('change', 'hachiku').includes('同じ数字の索子'));
  assert.equal(cardEventNote('roadroller', 'none'), '');
  assert.ok(cardEventNote('change', 'trump').includes('1〜13'));
  assert.equal(cardEventNote('near', 'hachiku'), '');
});

test('カード表示は発動中と使用済みを区別する', () => {
  assert.equal(cardStatus({ usedCards: [], nearPinActive: false }, 'near'), '未発動');
  assert.equal(cardStatus({ usedCards: ['near'], nearPinActive: true }, 'near'), '発動中');
  assert.equal(cardStatus({ usedCards: ['roadroller'] }, 'roadroller'), '使用済み');
  assert.equal(cardStatus({ usedCards: ['skeleton'], skeletonRevealed: 2 }, 'skeleton'), '公開中・残り2ツモ');
  assert.equal(cardStatus({ usedCards: ['skeleton'], skeletonRevealed: 0 }, 'skeleton'), '使用済み');
});

test('複数カードの使用状況と繰り返し使用・残数を表示する', () => {
  const player = { card: 'change', used: true, usedCards: ['change'], pocketArmed: true, dangerUses: 1 };
  assert.equal(cardStatus(player, 'change'), '使用済み');
  assert.equal(cardStatus(player, 'borrow'), '未使用');
  assert.equal(cardStatus(player, 'pocket'), '次の打牌で予約');
  assert.equal(cardStatus(player, 'pairFestival'), '繰り返し使用');
  assert.equal(cardStatus(player, 'danger'), '残り1回');
  assert.equal(cardStatus(player, 'oni'), '常時効果');
});
