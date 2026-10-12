import { SIZE } from './pieces.js';
export function scoreConnection(board, player) {
  const visited = new Set();
  const components = [];
  for (let start = 0; start < board.length; start++) {
    if (board[start] !== player || visited.has(start)) continue;
    const cells = [start];
    visited.add(start);
    for (let head = 0; head < cells.length; head++) {
      const index = cells[head];
      const x = index % SIZE; const y = Math.floor(index / SIZE);
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx; const ny = y + dy;
        const next = ny * SIZE + nx;
        if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && board[next] === player && !visited.has(next)) {
          visited.add(next); cells.push(next);
        }
      }
    }
    const axes = cells.map(index => player === 0 ? Math.floor(index / SIZE) : index % SIZE);
    const near = Math.min(...axes); const far = Math.max(...axes);
    components.push({ cells, score: near + (SIZE - 1 - far), near, far });
  }
  components.sort((a, b) => a.score - b.score || b.cells.length - a.cells.length || Math.min(...a.cells) - Math.min(...b.cells));
  const best = components[0] || { cells: [], score: SIZE * 2, near: SIZE, far: -1 };
  const guides = [];
  if (best.cells.length) {
    const nearCell = best.cells.find(index => (player === 0 ? Math.floor(index / SIZE) : index % SIZE) === best.near);
    const farCell = best.cells.find(index => (player === 0 ? Math.floor(index / SIZE) : index % SIZE) === best.far);
    if (player === 0) {
      const x1 = nearCell % SIZE; const x2 = farCell % SIZE;
      for (let y = 0; y < best.near; y++) guides.push(y * SIZE + x1);
      for (let y = best.far + 1; y < SIZE; y++) guides.push(y * SIZE + x2);
    } else {
      const y1 = Math.floor(nearCell / SIZE); const y2 = Math.floor(farCell / SIZE);
      for (let x = 0; x < best.near; x++) guides.push(y1 * SIZE + x);
      for (let x = best.far + 1; x < SIZE; x++) guides.push(y2 * SIZE + x);
    }
  }
  return {
    score: best.score,
    size: best.cells.length,
    total: board.filter(owner => owner === player).length,
    path: best.cells,
    guides,
  };
}

export function judgeBoard(board) {
  const players = [scoreConnection(board, 0), scoreConnection(board, 1)];
  const compare = (a, b) => a.score - b.score || b.size - a.size || b.total - a.total;
  const result = compare(players[0], players[1]);
  return { winner: result < 0 ? 0 : result > 0 ? 1 : null, players };
}

