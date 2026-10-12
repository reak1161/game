import test from 'node:test';
import assert from 'node:assert/strict';
import { specialStatus } from '../src/special_status.ts';
import { tileName } from '../src/mahjong.ts';

const context = { inHand: true, inRiver: false, event: 'none', irregularKind: null };
test('トラップの状態は現在のロン対象と古い河を区別する', () => {
  const tile = { id: 5, kind: 0, special: 'trap' };
  assert.equal(specialStatus(tile, context), '打牌待ち');
  assert.equal(specialStatus(tile, { ...context, inHand: false, inRiver: true }), '河にある牌・現在この牌へのロン確認はない');
  assert.equal(specialStatus(tile, { ...context, ronTileId: 5 }), 'この牌へのロン確認中');
  assert.notEqual(specialStatus(tile, { ...context, ronTileId: 6 }), 'この牌へのロン確認中');
});
test('運命の導きは手牌の所持と現在のツモ和了牌を区別する', () => {
  const tile = { id: 5, kind: 0, special: 'destiny' };
  assert.ok(specialStatus(tile, context).includes('必要'));
  assert.ok(specialStatus(tile, { ...context, drawnTileId: 5 }).includes('現在のツモ牌'));
  assert.ok(specialStatus(tile, { ...context, drawnTileId: 5, inHand: false }).includes('必要'));
});
test('条件付き特殊牌は局の牌体系と専用進行を反映する', () => {
  assert.ok(specialStatus({ id: 0, kind: 8, special: 'musou' }, context).includes('条件を満たす'));
  assert.ok(specialStatus({ id: 0, kind: 8, special: 'musou' }, { ...context, event: 'trump' }).includes('無効'));
  assert.ok(specialStatus({ id: 0, kind: 0, special: 'triplet' }, { ...context, event: 'memory' }).includes('追加刻子効果なし'));
  assert.ok(specialStatus({ id: 0, kind: 0, special: 'zombie' }, { ...context, inHand: false }).includes('増殖しない'));
  assert.ok(specialStatus({ id: 0, kind: 0, special: 'irregular' }, { ...context, irregularKind: 9 }).includes(`${tileName(9)}に変化済み`));
});
