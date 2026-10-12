import { GameEnvironment } from '../game-core/environment.js';

export function playGame(agent1, agent2, seed = 0, { maxTurns = 1000, trace = false } = {}) {
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new Error('Invalid maxTurns');
  const environment = new GameEnvironment(seed);
  const history = [];
  try {
    while (!environment.isGameOver()) {
      const state = environment.getState();
      if (state.turn >= maxTurns) throw new Error(`Turn limit exceeded: ${maxTurns}`);
      const moves = environment.getLegalMoves();
      if (!moves.length) throw new Error('No legal move in a nonterminal state');
      const agent = state.currentPlayer === 1 ? agent1 : agent2;
      const move = agent.chooseMove(state, moves);
      if (trace) history.push({ player: state.currentPlayer, move: { ...move } });
      environment.step(move);
      if (environment.getState().turn > maxTurns) throw new Error(`Turn limit exceeded: ${maxTurns}`);
    }
  } catch (cause) {
    const error = new Error(`Simulation failed (seed=${seed}): ${cause.message}`, { cause });
    error.diagnostic = { seed, state: environment.getState(), history };
    throw error;
  }
  const state = environment.getState();
  return { seed, winner: state.winner, winType: state.winType, turns: state.turn,
    placements: state.placements, enteredExtendedPhase: state.enteredExtendedPhase,
    rerollCount: state.rerollCount, ...(trace ? { history, finalState: state } : {}) };
}
