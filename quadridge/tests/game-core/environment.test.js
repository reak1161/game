import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEnvironment, createRng, uniqueRotations, cells, canPlace, getLegalMoves,
  newGame, play, SIZE, judgeBoard, validateCoreState, ACTION_COUNT, encodeMove, decodeMove,
  encodeObservation } from '../../src/game-core/index.js';
import { play as webPlay } from '../../src/engine.js';

test('Web and AI use exactly the same transition function', () => assert.equal(webPlay, play));

test('rotation coordinates and unique orientations', () => {
  assert.deepEqual(cells('I', 1), [[0, 0], [0, 1], [0, 2], [0, 3]]);
  assert.deepEqual(['I', 'O', 'T', 'L', 'J', 'S', 'Z'].map(t => uniqueRotations(t).length), [2, 1, 4, 4, 4, 2, 2]);
  const s = newGame(createRng(1));
  s.players[0].hand = ['O'];
  assert.equal(getLegalMoves(s).length, 14 * 14);
  for (const m of getLegalMoves(s)) assert(canPlace(s.board, 'O', m.rotation, m.x, m.y));
});

test('same seed reproduces bags, state transitions and independent clone RNG', () => {
  const a = new GameEnvironment(123);
  const b = new GameEnvironment(123);
  const branch = a.clone();
  for (let i = 0; i < 15; i++) {
    const move = a.getLegalMoves()[0];
    assert.deepEqual(a.step(move), b.step(move));
    assert.deepEqual(a.getState(), branch.step(move).state);
  }
  const before = a.getState();
  branch.step(branch.getLegalMoves()[1]);
  assert.deepEqual(a.getState(), before);
  const returned = a.getState();
  returned.board[0][0] = 99;
  returned.hands[1].length = 0;
  assert.deepEqual(a.getState(), before);
  assert.deepEqual(a.reset(123), new GameEnvironment(123).getState());
});

test('all fixed action IDs round trip and mask matches canonical legal moves', () => {
  for (let id = 0; id < ACTION_COUNT; id++) assert.equal(encodeMove(decodeMove(id)), id);
  const env = new GameEnvironment(10);
  const legal = new Set(env.getLegalMoves().map(encodeMove));
  const mask = env.getLegalActionMask();
  assert.equal(mask.length, ACTION_COUNT);
  for (let id = 0; id < ACTION_COUNT; id++) assert.equal(Boolean(mask[id]), legal.has(id));
  const before = env.getState();
  for (const move of [null, { handIndex: 3, rotation: 0, x: 0, y: 0 },
    { handIndex: 0, rotation: 0, x: 0.5, y: 0 }, { handIndex: 0, rotation: 0, x: 14, y: 14 }]) {
    assert.throws(() => env.step(move));
    assert.deepEqual(env.getState(), before);
  }
  assert.throws(() => decodeMove(ACTION_COUNT));
});

test('observation is fixed size and excludes opponent hidden information', () => {
  const state = new GameEnvironment(1).getState();
  const a = encodeObservation(state);
  state.hands[2] = ['Z']; state.bags[1] = []; state.bags[2] = [];
  assert.deepEqual(encodeObservation(state), a);
  assert.deepEqual(a.shape, [27, 15, 15]);
  assert.equal(a.data.length, 6075);
  assert.equal(a.data.slice(450, 675).every(v => v === 1), true);
});

test('normal and extended connection victories in both directions', () => {
  for (const player of [0, 1]) for (const extension of [false, true]) {
    const s = newGame(createRng(1));
    s.turn = player; s.extension = extension;
    s.players[player].hand = ['I'];
    for (let n = 0; n < 11; n++) s.board[player === 0 ? n * SIZE : n] = player;
    const next = play(s, 0, player === 0 ? 1 : 0, player === 0 ? 0 : 11, player === 0 ? 11 : 0, createRng(2));
    assert.equal(next.winner, player);
    assert.equal(next.judgment, null);
    assert.equal(getLegalMoves(next).length, 0);
  }
});

test('judgement tie breakers compare component size then total occupancy', () => {
  const board = Array(225).fill(null);
  board[2 * SIZE + 2] = 0; board[3 * SIZE + 2] = 0;
  board[8 * SIZE + 8] = 1; board[8 * SIZE + 9] = 1;
  assert.equal(judgeBoard(board).winner, null);
  board[3 * SIZE + 3] = 0;
  assert.equal(judgeBoard(board).winner, 0);
  board[9 * SIZE + 9] = 1;
  assert.equal(judgeBoard(board).winner, null);
  board[12 * SIZE + 12] = 1;
  assert.equal(judgeBoard(board).winner, 1);
});

test('invalid boards and duplicate bag entries are diagnostic errors', () => {
  const state = newGame(createRng(4));
  assert.equal(validateCoreState(state), true);
  state.board[3] = 3;
  assert.throws(() => validateCoreState(state), /board/);
  state.board[3] = null;
  state.players[1].bag = ['I', 'I'];
  assert.throws(() => validateCoreState(state), /bag/);
});
