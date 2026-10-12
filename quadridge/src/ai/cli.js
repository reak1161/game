import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { RandomAgent } from './agents/randomAgent.js';
import { playGame } from './simulator.js';
import { summarize } from './statistics.js';

try {
  const { values } = parseArgs({ options: {
    games: { type: 'string', default: '1000' }, seed: { type: 'string', default: '0' },
    'max-turns': { type: 'string', default: '1000' }, json: { type: 'boolean', default: false },
    output: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run ai:simulate -- --games 1000 --seed 0 [--max-turns 1000] [--json] [--output results.json]');
  } else {
    const games = Number(values.games); const seed = Number(values.seed); const maxTurns = Number(values['max-turns']);
    if (!Number.isSafeInteger(games) || games < 1 || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF ||
        !Number.isSafeInteger(maxTurns) || maxTurns < 1) throw new Error('games/max-turns は正の整数、seed は 0～4294967295 を指定してください');
    const start = performance.now();
    const results = [];
    for (let i = 0; i < games; i++) {
      const gameSeed = (seed + i) >>> 0;
      results.push(playGame(new RandomAgent(gameSeed ^ 0x13579BDF), new RandomAgent(gameSeed ^ 0x2468ACE0), gameSeed, { maxTurns }));
    }
    const report = { seed, ...summarize(results), elapsedSeconds: (performance.now() - start) / 1000 };
    if (values.output) writeFileSync(values.output, JSON.stringify({ ...report, results }, null, 2) + '\n', 'utf8');
    if (values.json) console.log(JSON.stringify(report, null, 2));
    else {
      const pct = n => `${(100 * n).toFixed(1)}%`;
      console.log(`QUADRIDGE 自動対戦 / seed ${seed}\n対局数: ${games}\n蒼の勝利: ${report.player1Wins} (${pct(report.player1Wins / games)})\n朱の勝利: ${report.player2Wins} (${pct(report.player2Wins / games)})\n接続勝利: ${report.connectionWins}\n判定勝利: ${report.judgementWins}\n完全引き分け: ${report.draws}\n平均ターン数: ${report.averageTurns.toFixed(2)} (最短 ${report.minTurns} / 最長 ${report.maxTurns})\n延長配置突入率: ${pct(report.extendedPhaseRate)}\n平均リロール回数: ${report.averageRerolls.toFixed(2)}\n実行時間: ${report.elapsedSeconds.toFixed(2)}秒`);
    }
  }
} catch (error) {
  console.error(error.message);
  if (error.diagnostic) console.error(JSON.stringify(error.diagnostic));
  process.exitCode = 1;
}
