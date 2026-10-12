import { createRng } from '../../game-core/rng.js';

export class RandomAgent {
  constructor(seed) { this.rng = createRng(seed); }
  chooseMove(state, legalMoves) {
    if (!legalMoves.length) throw new Error('RandomAgent requires a legal move');
    return { ...legalMoves[Math.floor(this.rng() * legalMoves.length)] };
  }
}
