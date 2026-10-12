export const SIZE = 15;
export const SHAPES = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[0, 0], [1, 0], [2, 0], [1, 1]],
  L: [[0, 0], [0, 1], [0, 2], [1, 2]],
  J: [[1, 0], [1, 1], [1, 2], [0, 2]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};
export const TYPES = Object.keys(SHAPES);

let cachedShapes;
let cachedRotations;
export function shapeCells(type, turns) {
  cachedShapes ??= Object.fromEntries(TYPES.map(t => [t, Array.from({ length: 4 }, (_, r) =>
    Object.freeze(cells(t, r).map(p => Object.freeze(p))))]));
  return cachedShapes[type]?.[((turns % 4) + 4) % 4];
}
export function uniqueRotations(type) {
  cachedRotations ??= Object.fromEntries(TYPES.map(t => {
    const seen = new Set();
    return [t, Object.freeze([0, 1, 2, 3].filter(r => {
      const key = shapeCells(t, r).map(p => p.join(',')).sort().join(';');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }))];
  }));
  return cachedRotations[type];
}

export function cells(type, turns = 0) {
  if (!SHAPES[type]) throw new Error('不明なブロックです');
  let result = SHAPES[type].map(([x, y]) => [x, y]);
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    result = result.map(([x, y]) => [-y, x]);
    const minX = Math.min(...result.map(([x]) => x));
    const minY = Math.min(...result.map(([, y]) => y));
    result = result.map(([x, y]) => [x - minX, y - minY]);
  }
  return result;
}

