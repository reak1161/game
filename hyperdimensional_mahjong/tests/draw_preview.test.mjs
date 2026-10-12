import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPreview } from '../src/draw_preview.ts';
import { consumeDrawReservation } from '../src/mahjong.ts';

test('山の取得予定は追加ツモとプレイヤー別の予約を消費せずに反映する', () => {
  const wall = Array.from({ length: 10 }, (_, id) => ({ id, kind: id }));
  const players = [{ drawReservations: [0] }, { drawReservations: [9, 10, 11] }, { drawReservations: [18] }, { drawReservations: [] }];
  const owed = [0, 2, 0, 0];
  const before = structuredClone({ wall, players, owed });
  const preview = drawPreview(wall, players, 1, 10, 'none', owed);
  assert.deepEqual(preview.map(entry => entry.seat), [1, 1, 1, 2, 3, 0, 1, 2, 3, 0]);
  assert.deepEqual(preview.map(entry => entry.additional), [false, true, true, false, false, false, false, false, false, false]);
  assert.deepEqual(preview.slice(0, 6).map(entry => entry.reservedKind), [9, 10, 11, 18, undefined, 0]);
  assert.deepEqual(preview.map(entry => entry.tile.id), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual({ wall, players, owed }, before);
});

test('予定の席順変更・三人打ち・フィナーレと予約変化を実ツモ処理に合わせる', () => {
  const wall = Array.from({ length: 8 }, (_, id) => ({ id, kind: 27 }));
  const players = [{ drawReservations: [9, 10] }, { drawReservations: [] }, { drawReservations: [0] }];
  const preview = drawPreview(wall, players, 2, 6, 'hachiku', [1, 0, 1]);
  assert.deepEqual(preview.map(entry => entry.seat), [2, 2, 0, 0, 1, 2]);
  for (const entry of preview) {
    const tile = { ...entry.tile };
    if (consumeDrawReservation(players[entry.seat], tile, 'hachiku')) assert.equal(entry.reservedKind, tile.kind);
    else assert.equal(entry.reservedKind, undefined);
  }
  assert.deepEqual(drawPreview(wall, players, 1, 6, 'finale', [2, 2, 2], false).map(entry => entry.seat), [1, 2, 0, 1, 2, 0]);
  assert.equal(drawPreview(wall, players, 0, 20, 'none').length, wall.length);
  assert.deepEqual(drawPreview([], players, 0, 20, 'none'), []);
  assert.deepEqual(drawPreview(wall, players, 0, 0, 'none'), []);
});
