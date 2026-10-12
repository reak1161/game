export function summarize(results) {
  if (!results.length) throw new Error('At least one game is required');
  const count = fn => results.filter(fn).length;
  const average = key => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  return {
    games: results.length,
    player1Wins: count(r => r.winner === 1), player2Wins: count(r => r.winner === 2),
    connectionWins: count(r => r.winType === 'connection'), judgementWins: count(r => r.winType === 'judgement'),
    draws: count(r => r.winner === 'draw'),
    averageTurns: average('turns'),
    minTurns: results.reduce((n, r) => Math.min(n, r.turns), Infinity),
    maxTurns: results.reduce((n, r) => Math.max(n, r.turns), 0),
    extendedPhaseRate: count(r => r.enteredExtendedPhase) / results.length,
    averageRerolls: average('rerollCount'),
  };
}
