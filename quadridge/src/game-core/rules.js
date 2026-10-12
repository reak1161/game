import { SIZE, cells, shapeCells } from './pieces.js';
export function placement(board, type, turns, x, y) {
  return cells(type, turns).map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

export function canPlace(board, type, turns, x, y, player = null, extension = false) {
  if (![turns, x, y].every(Number.isInteger)) return false;
  const shape = shapeCells(type, turns);
  if (!shape) return false;
  let empty = false;
  for (const [dx, dy] of shape) {
    const cx = x + dx; const cy = y + dy;
    if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return false;
    const owner = board[cy * SIZE + cx];
    if (owner === null) empty = true;
    else if (!extension || owner !== player) return false;
  }
  return !extension || empty;
}

