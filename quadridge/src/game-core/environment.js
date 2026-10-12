import { SIZE, TYPES } from './pieces.js';
import { newGame, play } from './game.js';
import { getLegalMoves } from './legalMoves.js';
import { createRng } from './rng.js';
import { encodeMove, ACTION_COUNT } from './encoding.js';

export function copyState(state) { return structuredClone(state); }

export function validateCoreState(state) {
  const fail = message => { throw new Error(`Invalid game state: ${message}`); };
  if (!Array.isArray(state.board) || state.board.length !== SIZE * SIZE ||
      Array.from(state.board).some(v => v !== null && v !== 0 && v !== 1)) fail('board');
  if (![0, 1].includes(state.turn)) fail('player');
  if (!Number.isInteger(state.moves) || state.moves < 0 || state.moves > SIZE * SIZE) fail('moves');
  if (!Array.isArray(state.players) || state.players.length !== 2) fail('players');
  for (const player of state.players) {
    if (!Array.isArray(player.hand) || player.hand.length > 3 || player.hand.some(t => !TYPES.includes(t))) fail('hand');
    if (!Array.isArray(player.bag) || player.bag.length > 7 ||
        player.bag.some(t => !TYPES.includes(t)) || new Set(player.bag).size !== player.bag.length) fail('bag');
  }
  if (![null, 0, 1].includes(state.winner) || typeof state.draw !== 'boolean' ||
      (state.draw && state.winner !== null)) fail('result');
  return true;
}

export class GameEnvironment {
  #core;
  #rng;
  #seed;
  #rerolls = 0;
  #turns = 0;

  constructor(seed) { this.reset(seed); }

  reset(seed = Date.now()) {
    this.#rng = createRng(seed);
    this.#seed = seed >>> 0;
    this.#core = newGame(this.#rng);
    this.#rerolls = 0;
    this.#turns = 0;
    return this.getState();
  }

  getState() {
    const s = this.#core;
    return {
      board: Array.from({ length: SIZE }, (_, y) => s.board.slice(y * SIZE, (y + 1) * SIZE).map(v => v === null ? 0 : v + 1)),
      currentPlayer: s.turn + 1,
      hands: { 1: [...s.players[0].hand], 2: [...s.players[1].hand] },
      bags: { 1: [...s.players[0].bag], 2: [...s.players[1].bag] },
      phase: this.isGameOver() ? 'finished' : s.extension ? 'extended' : 'normal',
      turn: this.#turns,
      placements: s.moves,
      winner: this.getWinner(),
      winType: s.draw ? 'draw' : s.winner === null ? null : s.judgment ? 'judgement' : 'connection',
      judgement: copyState(s.judgment && {
        winner: s.judgment.winner === null ? 'draw' : s.judgment.winner + 1,
        players: s.judgment.players,
        player1Distance: s.judgment.players[0].score,
        player2Distance: s.judgment.players[1].score,
        player1Component: s.judgment.players[0].path.map(index => ({ x: index % SIZE, y: Math.floor(index / SIZE) })),
        player2Component: s.judgment.players[1].path.map(index => ({ x: index % SIZE, y: Math.floor(index / SIZE) })),
      }),
      enteredExtendedPhase: Boolean(s.extension),
      rerollCount: this.#rerolls,
      passedPlayers: s.passedPlayers.map(p => p + 1),
      seed: this.#seed,
      rngState: this.#rng.getState(),
    };
  }

  getLegalMoves() { return getLegalMoves(this.#core); }
  getLegalActionMask() {
    const mask = new Uint8Array(ACTION_COUNT);
    for (const move of this.getLegalMoves()) mask[encodeMove(move)] = 1;
    return mask;
  }
  isGameOver() { return this.#core.winner !== null || this.#core.draw; }
  getWinner() { return this.#core.draw ? 'draw' : this.#core.winner === null ? null : this.#core.winner + 1; }

  step(move) {
    encodeMove(move); // Reject malformed coordinates before any state or RNG mutation.
    if (this.isGameOver()) throw new Error('Game is finished');
    const next = play(this.#core, move.handIndex, move.rotation, move.x, move.y, this.#rng);
    validateCoreState(next);
    if (next.board.filter(v => v !== null).length <= this.#core.board.filter(v => v !== null).length) {
      throw new Error('Placement did not acquire a new cell');
    }
    this.#core = next;
    this.#rerolls += next.passedPlayers.length;
    this.#turns += 1 + next.passedPlayers.length;
    const state = this.getState();
    return { state, done: this.isGameOver(), winner: state.winner, winType: state.winType };
  }

  clone() {
    const result = new GameEnvironment(0);
    result.#core = copyState(this.#core);
    result.#rng = this.#rng.clone();
    result.#seed = this.#seed;
    result.#rerolls = this.#rerolls;
    result.#turns = this.#turns;
    return result;
  }
}
