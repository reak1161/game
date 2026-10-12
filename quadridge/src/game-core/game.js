import { SIZE } from './pieces.js';
import { draw } from './bag.js';
import { canPlace, placement } from './rules.js';
import { hasMove, placeableTypes, rerollPlaceable } from './legalMoves.js';
import { canStillConnect, findWinningPath } from './connectivity.js';
import { judgeBoard } from './judgement.js';
import { defaultRandom } from './rng.js';
export function newGame(rng = defaultRandom) {
  const players = [0, 1].map(() => ({ bag: [], hand: [] }));
  for (const player of players) {
    while (player.hand.length < 3) player.hand.push(draw(player, rng));
  }
  return {
    board: Array(SIZE * SIZE).fill(null),
    players,
    turn: 0,
    moves: 0,
    winner: null,
    draw: false,
    extension: false,
    judgment: null,
    winningPath: [],
    lastCells: [],
    passedPlayers: [],
  };
}

export function play(state, slot, turns, x, y, rng = defaultRandom) {
  if (state.winner !== null || state.draw) throw new Error('対局は終了しています');
  const type = state.players[state.turn].hand[slot];
  const extension = Boolean(state.extension);
  if (!type || !canPlace(state.board, type, turns, x, y, state.turn, extension)) throw new Error('ここには配置できません');
  const placed = placement(state.board, type, turns, x, y);
  const board = [...state.board];
  for (const cell of placed) board[cell.y * SIZE + cell.x] = state.turn;
  const players = state.players.map(player => ({ bag: [...player.bag], hand: [...player.hand] }));
  players[state.turn].hand[slot] = draw(players[state.turn], rng);
  const winningPath = findWinningPath(board, state.turn);
  let nextTurn = winningPath.length ? state.turn : 1 - state.turn;
  const passedPlayers = [];
  let isDraw = false;
  let judgment = null;
  if (!winningPath.length) {
    const extended = extension || !placeableTypes(board).length;
    if (!extension && extended) {
      for (const player of players) {
        player.hand = [];
        while (player.hand.length < 3) player.hand.push(draw(player, rng));
      }
    }
    isDraw = extended && !canStillConnect(board, 0) && !canStillConnect(board, 1);
    for (let checked = 0; !isDraw && checked < 2 && !hasMove(board, players[nextTurn].hand, nextTurn, extended); checked++) {
      const candidates = rerollPlaceable(board, rng, nextTurn, extended);
      players[nextTurn].hand = candidates;
      passedPlayers.push(nextTurn);
      nextTurn = 1 - nextTurn;
    }
    if (!isDraw && !hasMove(board, players[nextTurn].hand, nextTurn, extended)) {
      const other = 1 - nextTurn;
      if (hasMove(board, players[other].hand, other, extended)) nextTurn = other;
      else isDraw = true;
    }
    if (isDraw) {
      judgment = judgeBoard(board);
      isDraw = judgment.winner === null;
    }
    return {
      board, players, turn: nextTurn, extension: extended,
      moves: state.moves + 1, winner: judgment?.winner ?? null, draw: isDraw, judgment, passedPlayers,
      winningPath, lastCells: placed.map(({ x: cx, y: cy }) => cy * SIZE + cx),
    };
  }
  return {
    board, players, turn: nextTurn, extension,
    moves: state.moves + 1, winner: winningPath.length ? state.turn : null,
    draw: isDraw, passedPlayers,
    judgment: null, winningPath, lastCells: placed.map(({ x: cx, y: cy }) => cy * SIZE + cx),
  };
}
