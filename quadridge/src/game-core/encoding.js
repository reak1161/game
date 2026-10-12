import { SIZE, TYPES } from './pieces.js';

export const ACTION_COUNT = 3 * 4 * SIZE * SIZE;
export function encodeMove(move) {
  if (!move || ![move.handIndex, move.rotation, move.x, move.y].every(Number.isInteger) ||
      move.handIndex < 0 || move.handIndex >= 3 || move.rotation < 0 || move.rotation >= 4 ||
      move.x < 0 || move.x >= SIZE || move.y < 0 || move.y >= SIZE) throw new Error('Invalid move');
  return ((move.handIndex * 4 + move.rotation) * SIZE + move.y) * SIZE + move.x;
}
export function decodeMove(id) {
  if (!Number.isInteger(id) || id < 0 || id >= ACTION_COUNT) throw new Error('Invalid action ID');
  return { handIndex: Math.floor(id / (4 * SIZE * SIZE)), rotation: Math.floor(id / (SIZE * SIZE)) % 4,
    x: id % SIZE, y: Math.floor(id / SIZE) % SIZE };
}

// Channel-first float32: own/opponent/empty, 3 x 7 one-hot hand planes,
// extended, vertical-goal, finished. Never exposes the opponent's hand/bag.
export const OBSERVATION_CHANNELS = 27;
export function encodeObservation(state, player = state.currentPlayer) {
  if (player !== 1 && player !== 2) throw new Error('Invalid player');
  const area = SIZE * SIZE;
  const data = new Float32Array(OBSERVATION_CHANNELS * area);
  state.board.forEach((row, y) => row.forEach((owner, x) => {
    const channel = owner === 0 ? 2 : owner === player ? 0 : 1;
    data[channel * area + y * SIZE + x] = 1;
  }));
  state.hands[player].forEach((type, slot) => {
    const channel = 3 + slot * 7 + TYPES.indexOf(type);
    data.fill(1, channel * area, (channel + 1) * area);
  });
  if (state.enteredExtendedPhase) data.fill(1, 24 * area, 25 * area);
  if (player === 1) data.fill(1, 25 * area, 26 * area);
  if (state.phase === 'finished') data.fill(1, 26 * area);
  return { data, shape: [OBSERVATION_CHANNELS, SIZE, SIZE] };
}
