import test from 'node:test';
import assert from 'node:assert/strict';
import { RandomAgent } from '../../src/ai/agents/randomAgent.js';
import { playGame } from '../../src/ai/simulator.js';
import { summarize } from '../../src/ai/statistics.js';
import { GameEnvironment } from '../../src/game-core/environment.js';

const run = seed => playGame(new RandomAgent(seed ^ 0x13579BDF), new RandomAgent(seed ^ 0x2468ACE0), seed, { trace: true });

test('complete seeded games reproduce rerolls and outcomes; trace replays exactly', () => {
  const results = [];
  for (let seed = 0; seed < 10; seed++) {
    const result = run(seed);
    assert.deepEqual(run(seed), result);
    const replay = new GameEnvironment(seed);
    for (const { player, move } of result.history) {
      assert.equal(replay.getState().currentPlayer, player);
      replay.step(move);
    }
    assert.deepEqual(replay.getState(), result.finalState);
    assert.equal(replay.isGameOver(), true);
    assert.equal(replay.getWinner(), result.winner);
    assert.deepEqual(replay.getLegalMoves(), []);
    assert.equal(replay.getLegalActionMask().some(Boolean), false);
    assert.throws(() => replay.step({ handIndex: 0, rotation: 0, x: 0, y: 0 }), /finished/);
    assert.equal(result.turns, result.placements + result.rerollCount);
    results.push(result);
  }
  const stats = summarize(results);
  assert.equal(stats.games, 10);
  assert.equal(stats.player1Wins + stats.player2Wins + stats.draws, 10);
  assert.equal(stats.connectionWins + stats.judgementWins + stats.draws, 10);
  assert(stats.judgementWins > 0 && stats.connectionWins > 0 && stats.averageRerolls > 0 && stats.extendedPhaseRate > 0);
});

test('turn limit and illegal agent actions are errors, never draws', () => {
  assert.throws(() => playGame(new RandomAgent(1), new RandomAgent(2), 7, { maxTurns: 1 }), error => {
    assert.match(error.message, /seed=7.*Turn limit/);
    assert.equal(error.diagnostic.seed, 7);
    return true;
  });
  const invalidAgent = { chooseMove: () => ({ handIndex: 4, rotation: 0, x: 0, y: 0 }) };
  assert.throws(() => playGame(invalidAgent, invalidAgent, 8), /Simulation failed/);
  assert.throws(() => new RandomAgent(1).chooseMove({}, []), /legal move/);
});

test('statistics counts complete draws and extrema', () => {
  const results = [
    { winner: 1, winType: 'connection', turns: 10, rerollCount: 0, enteredExtendedPhase: false },
    { winner: 2, winType: 'judgement', turns: 20, rerollCount: 2, enteredExtendedPhase: true },
    { winner: 'draw', winType: 'draw', turns: 30, rerollCount: 4, enteredExtendedPhase: true },
  ];
  assert.deepEqual(summarize(results), { games: 3, player1Wins: 1, player2Wins: 1, connectionWins: 1,
    judgementWins: 1, draws: 1, averageTurns: 20, minTurns: 10, maxTurns: 30,
    extendedPhaseRate: 2 / 3, averageRerolls: 2 });
});
