import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, TYPES, cells, canPlace, canStillConnect, findWinningPath, hasMove, judgeBoard, newGame, play, placeableTypes, rerollPlaceable, scoreConnection } from './engine.js';

test('全形状は回転しても4マスで、4回転すると元に戻る', () => {
  for (const type of TYPES) {
    for (let turns = 0; turns < 4; turns++) {
      assert.equal(new Set(cells(type, turns).map(point => point.join(','))).size, 4);
    }
    assert.deepEqual(cells(type, 4), cells(type, 0));
  }
});

test('各プレイヤーのバッグは独立した7種1巡', () => {
  const game = newGame(() => 0);
  for (const player of game.players) {
    const firstSet = [...player.hand, ...player.bag];
    assert.deepEqual([...firstSet].sort(), [...TYPES].sort());
    assert.equal(player.hand.length, 3);
  }
  const other = structuredClone(game.players[1]);
  const type = game.players[0].hand[0];
  let moved = null;
  for (let y = 0; y < SIZE && !moved; y++) for (let x = 0; x < SIZE && !moved; x++) {
    if (canPlace(game.board, type, 0, x, y)) moved = play(game, 0, 0, x, y, () => 0);
  }
  assert.deepEqual(moved.players[1], other);
  assert.equal(moved.players[0].hand.length, 3);
});

test('重なりと盤面外への配置はできない', () => {
  const game = newGame(() => 0);
  assert.equal(canPlace(game.board, 'I', 0, 12, 0), false);
  assert.equal(canPlace(game.board, 'O', 0, 14, 14), false);
  game.board[0] = 0;
  assert.equal(canPlace(game.board, 'O', 0, 0, 0), false);
});

test('勝利は自分の辺接続だけを数え、斜めや相手マスは数えない', () => {
  const board = Array(SIZE * SIZE).fill(null);
  for (let y = 0; y < SIZE; y++) board[y * SIZE + 2] = 0;
  assert.equal(findWinningPath(board, 0).length, SIZE);
  assert.deepEqual(findWinningPath(board, 1), []);
  board[7 * SIZE + 2] = 1;
  assert.deepEqual(findWinningPath(board, 0), []);
  const diagonal = Array(SIZE * SIZE).fill(null);
  for (let y = 0; y < SIZE; y++) diagonal[y * SIZE + y] = 0;
  assert.deepEqual(findWinningPath(diagonal, 0), []);
});

test('配置できる形状だけをリロールし、3種類未満なら候補を減らす', () => {
  const board = Array(SIZE * SIZE).fill(0);
  for (let x = 5; x < 9; x++) board[7 * SIZE + x] = null;
  assert.deepEqual(placeableTypes(board), ['I']);
  assert.deepEqual(rerollPlaceable(board, () => 0), ['I']);
  assert.equal(hasMove(board, ['O', 'T', 'L']), false);
});

test('次の手番の候補がすべて置けなければパスし、バッグを保ってリロールする', () => {
  const game = newGame(() => 0);
  game.board.fill(1);
  for (const index of [0, 1, SIZE, SIZE + 1]) game.board[index] = null;
  for (let x = 5; x < 9; x++) game.board[7 * SIZE + x] = null;
  game.players[0] = { hand: ['O', 'I', 'T'], bag: ['I'] };
  game.players[1] = { hand: ['O', 'T', 'L'], bag: ['Z', 'S'] };
  const result = play(game, 0, 0, 0, 0, () => 0);
  assert.deepEqual(result.passedPlayers, [1]);
  assert.equal(result.turn, 0);
  assert.deepEqual(result.players[1].hand, ['I']);
  assert.deepEqual(result.players[1].bag, ['Z', 'S']);
  assert.equal(result.draw, false);
});

test('通常配置ができない盤面を判定する', () => {
  const board = Array(SIZE * SIZE).fill(0);
  board[0] = null;
  assert.equal(hasMove(board, TYPES), false);
  assert.deepEqual(rerollPlaceable(board), []);
});

test('延長配置でも両者が置けなくなると接続状況で判定する', () => {
  const game = newGame(() => 0);
  game.extension = true;
  game.board.fill(1);
  for (const index of [1, SIZE, SIZE + 1]) game.board[index] = 0;
  game.board[0] = null;
  game.players[0].hand = ['O'];
  const result = play(game, 0, 0, 0, 0, () => 0);
  assert.equal(result.winner, 1);
  assert.equal(result.extension, true);
  assert.equal(result.draw, false);
  assert.equal(result.judgment.winner, 1);
});

test('延長配置は自分のマスに重ねられるが、新しい空きマスが必要', () => {
  const board = Array(SIZE * SIZE).fill(0);
  board[1] = null;
  assert.equal(canPlace(board, 'O', 0, 0, 0, 0, true), true);
  assert.equal(canPlace(board, 'O', 0, 0, 0, 1, true), false);
  assert.equal(canPlace(board, 'O', 0, 2, 0, 0, true), false);
  board[SIZE] = 1;
  assert.equal(canPlace(board, 'O', 0, 0, 0, 0, true), false);
});

test('延長配置の再抽選は自分のマスとの重なりと新規マスを考慮する', () => {
  const board = Array(SIZE * SIZE).fill(0);
  board[1] = null;
  assert.equal(hasMove(board, ['O'], 0, true), true);
  assert.equal(hasMove(board, ['O'], 1, true), false);
  assert.deepEqual(rerollPlaceable(board, () => 0, 0, true).length, 3);
  assert.deepEqual(rerollPlaceable(board, () => 0, 1, true), []);
});

test('延長配置の勝利可能性は相手の壁と合法配置できる空きマスで判定する', () => {
  const open = Array(SIZE * SIZE).fill(null);
  assert.equal(canStillConnect(open, 0), true);
  assert.equal(canStillConnect(open, 1), true);
  const barrier = [...open];
  for (let x = 0; x < SIZE; x++) barrier[7 * SIZE + x] = 1;
  assert.equal(canStillConnect(barrier, 0), false);
  assert.equal(canStillConnect(barrier, 1), true);
  const sealed = Array.from({ length: SIZE * SIZE }, (_, index) => (index % SIZE + Math.floor(index / SIZE)) % 2);
  assert.equal(canStillConnect(sealed, 0), false);
  assert.equal(canStillConnect(sealed, 1), false);
});

test('延長配置で両者が対岸へ届かなくなれば、合法配置が残っていても判定する', () => {
  const game = newGame(() => 0);
  game.extension = true;
  game.board = Array.from({ length: SIZE * SIZE }, (_, index) => (index % SIZE + Math.floor(index / SIZE)) % 2);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [12, 12], [13, 12], [12, 13], [13, 13]]) {
    game.board[y * SIZE + x] = null;
  }
  game.players[0].hand = ['O'];
  const result = play(game, 0, 0, 0, 0, () => 0);
  assert.equal(placeableTypes(result.board, 0, true).length > 0, true);
  assert.equal(placeableTypes(result.board, 1, true).length > 0, true);
  assert.equal(result.judgment !== null, true);
  assert.equal(result.draw, result.judgment.winner === null);
});

test('判定は残り距離、代表連結成分、総占有マスの順で比較する', () => {
  const board = Array(SIZE * SIZE).fill(null);
  for (let y = 2; y <= 10; y++) board[y * SIZE + 2] = 0;
  for (let x = 4; x <= 9; x++) board[5 * SIZE + x] = 1;
  const blue = scoreConnection(board, 0);
  const red = scoreConnection(board, 1);
  assert.equal(blue.score, 6);
  assert.equal(red.score, 9);
  assert.equal(judgeBoard(board).winner, 0);
  assert.equal(blue.path.length, 9);
  assert.equal(blue.guides.length, 6);
});

test('判定条件がすべて同じなら完全な引き分け', () => {
  const board = Array(SIZE * SIZE).fill(null);
  board[7 * SIZE + 7] = 0;
  board[6 * SIZE + 6] = 1;
  const judgment = judgeBoard(board);
  assert.equal(judgment.winner, null);
  assert.equal(judgment.players[0].score, judgment.players[1].score);
});

test('延長配置で片方だけ配置不能なら、そのプレイヤーをパスして続行する', () => {
  const game = newGame(() => 0);
  game.extension = true;
  game.turn = 1;
  game.board = Array.from({ length: SIZE * SIZE }, (_, index) => (index % SIZE + Math.floor(index / SIZE)) % 2);
  for (let x = 0; x < SIZE; x++) game.board[7 * SIZE + x] = 1;
  game.board[7 * SIZE + 7] = null;
  for (const [x, y] of [[0, 0], [1, 0], [0, 1]]) game.board[y * SIZE + x] = 1;
  game.board[SIZE + 1] = null;
  game.players[1].hand = ['O'];
  game.players[0].hand = ['O'];
  const result = play(game, 0, 0, 0, 0, () => 0);
  assert.deepEqual(result.passedPlayers, [0]);
  assert.equal(result.players[0].hand.length, 0);
  assert.equal(result.draw, false);
  assert.equal(result.turn, 1);
});

test('通常配置が尽きると延長配置に移行し、両者の候補を引き直す', () => {
  const game = newGame(() => 0);
  game.board.fill(1);
  for (const index of [0, 1, SIZE, SIZE + 1, 7 * SIZE + 7]) game.board[index] = null;
  game.players[0] = { hand: ['O', 'I', 'T'], bag: ['I', 'O', 'L'] };
  game.players[1] = { hand: ['O', 'T', 'L'], bag: ['S', 'Z', 'J'] };
  const result = play(game, 0, 0, 0, 0, () => 0);
  assert.equal(result.extension, true);
  assert.equal(result.draw, false);
  assert.equal(result.turn, 1);
  assert.equal(result.players[0].hand.length, 3);
  assert.equal(result.players[1].hand.length, 3);
  assert.equal(hasMove(result.board, TYPES), false);
  assert.equal(hasMove(result.board, result.players[1].hand, 1, true), true);
});
