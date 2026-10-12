import { SIZE, TYPES, cells } from './pieces.js';
import { canPlace } from './rules.js';
// 相手のマスを越えず、今後の合法配置で獲得できるマスだけで対岸へ届くか。
// 配置間の競合は無視する保守的な判定。双方が到達不能な場合だけ早期判定する。
export function canStillConnect(board, player) {
  const available = board.map(owner => owner === player);
  for (const type of TYPES) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const shape = cells(type, rotation);
      const width = Math.max(...shape.map(([x]) => x)) + 1;
      const height = Math.max(...shape.map(([, y]) => y)) + 1;
      for (let y = 0; y <= SIZE - height; y++) {
        for (let x = 0; x <= SIZE - width; x++) {
          if (!canPlace(board, type, rotation, x, y, player, true)) continue;
          for (const [dx, dy] of shape) available[(y + dy) * SIZE + x + dx] = true;
        }
      }
    }
  }
  const queue = [];
  const seen = new Set();
  for (let edge = 0; edge < SIZE; edge++) {
    const index = player === 0 ? edge : edge * SIZE;
    if (available[index]) { queue.push(index); seen.add(index); }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    if (player === 0 ? y === SIZE - 1 : x === SIZE - 1) return true;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx; const ny = y + dy;
      const next = ny * SIZE + nx;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && available[next] && !seen.has(next)) {
        seen.add(next); queue.push(next);
      }
    }
  }
  return false;
}

export function findWinningPath(board, player) {
  const queue = [];
  const previous = new Map();
  for (let edge = 0; edge < SIZE; edge++) {
    const start = player === 0 ? edge : edge * SIZE;
    if (board[start] === player) {
      queue.push(start);
      previous.set(start, null);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const x = current % SIZE;
    const y = Math.floor(current / SIZE);
    if ((player === 0 && y === SIZE - 1) || (player === 1 && x === SIZE - 1)) {
      const path = [];
      for (let step = current; step !== null; step = previous.get(step)) path.push(step);
      return path.reverse();
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const next = ny * SIZE + nx;
      if (board[next] === player && !previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  return [];
}

