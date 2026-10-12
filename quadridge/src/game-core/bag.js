import { TYPES } from './pieces.js';
export function shuffleItems(items, rng) {
  const bag = [...items];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function shuffle(rng) { return shuffleItems(TYPES, rng); }

export function draw(player, rng) {
  if (!player.bag.length) player.bag = shuffle(rng);
  return player.bag.shift();
}

