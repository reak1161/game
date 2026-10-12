// Mulberry32 with copyable uint32 state for reproducible search branches.
export function createRng(seed = Date.now()) {
  if (!Number.isSafeInteger(seed)) throw new Error('seed must be a safe integer');
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.getState = () => state;
  random.clone = () => createRng(state);
  return random;
}
export const defaultRandom = createRng();
