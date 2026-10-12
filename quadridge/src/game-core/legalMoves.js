import { SIZE, TYPES, uniqueRotations } from './pieces.js';
import { canPlace } from './rules.js';
import { shuffleItems } from './bag.js';
import { defaultRandom } from './rng.js';

export function getLegalMoves(state) {
  if (state.winner !== null || state.draw) return [];
  const moves = [];
  state.players[state.turn].hand.forEach((type, handIndex) => {
    for (const rotation of uniqueRotations(type)) {
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        if (canPlace(state.board, type, rotation, x, y, state.turn, Boolean(state.extension))) {
          moves.push({ handIndex, rotation, x, y });
        }
      }
    }
  });
  return moves;
}
export function hasMove(board, hand, player = null, extension = false) {
  return hand.some(type => {
    for (const rotation of uniqueRotations(type)) {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          if (canPlace(board, type, rotation, x, y, player, extension)) return true;
        }
      }
    }
    return false;
  });
}

export function placeableTypes(board, player = null, extension = false) {
  return TYPES.filter(type => hasMove(board, [type], player, extension));
}

// パス時の候補は通常バッグを消費しない例外的な抽選。
export function rerollPlaceable(board, rng = defaultRandom, player = null, extension = false) {
  return shuffleItems(placeableTypes(board, player, extension), rng).slice(0, 3);
}

