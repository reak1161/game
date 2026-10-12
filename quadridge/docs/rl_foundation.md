# 強化学習基盤 v0.1 の使い方

Node.js 22 以降で、ブラウザやCloudflareへの接続なしに実行できる。

```sh
npm run ai:simulate -- --games 1000 --seed 0
npm run ai:simulate -- --games 1000 --seed 0 --json --output results.json
npm test
```

`--games` は対局数、`--seed` は先頭対局の32ビット符号なし整数seed。後続局はseedを1ずつ増やす。対局の乱数と両AIの乱数は別々に管理する。CLIはAIのseedを対局seedと固定定数のXORで決めるため、同じコマンドで同じ結果を再現できる。実行時間だけは再現対象外。

`--max-turns`（既定1000）を超えた場合や不正状態が発生した場合は、seed・状態を診断出力して終了コード1で停止する。引き分けとして集計しない。`--output` にはUTF-8の統計・全対局結果を保存する。

## API

```js
import { GameEnvironment, encodeObservation } from '../src/game-core/index.js';
import { RandomAgent } from '../src/ai/agents/randomAgent.js';

const env = new GameEnvironment(123);
const agent = new RandomAgent(456);
const moves = env.getLegalMoves();
const branch = env.clone();
const result = branch.step(agent.chooseMove(branch.getState(), moves));
const observation = encodeObservation(env.getState());
```

- `reset(seed)`：初期化し、状態のコピーを返す。
- `getState()`：盤面・候補・バッグ・勝敗・乱数状態などのコピーを返す。返り値を編集しても環境は変わらない。
- `getLegalMoves()`：現在の候補の合法手を列挙。対称形の同じ回転は最小の回転番号だけを採用する。同形候補でも枠が違うと補充先が異なるため別の行動として残す。
- `step({handIndex, rotation, x, y})`：配置し、必要なパス・リロール・延長配置への移行・終局まで処理する。終局後や不正な手は例外。
- `clone()`：盤面だけでなく乱数位置と集計値も複製する。探索分岐は元の対局を変更しない。
- `isGameOver()` / `getWinner()`：終局・勝者の取得。
- `getLegalActionMask()`：2700要素の `Uint8Array`。合法手IDのみ1。
- `playGame(agent1, agent2, seed, {maxTurns, trace})`：対局結果を返す。`trace: true` なら行動履歴と最終状態も取得できる。

## 状態・用語

AI用の状態は15×15の配列で、空き=0、蒼=1、朱=2。`currentPlayer` も1/2。既存Webの平坦な配列（空き=null、蒼=0、朱=1）はコア内部で維持し、環境APIの境界で変換する。ルールは再実装しない。

`phase` は `normal` / `extended` / `finished`。`winner` は1/2/`draw`/null、`winType` は `connection` / `judgement` / `draw` / null。`judgement` は両者の残り距離、代表連結成分、既存画面と共通の判定情報を含む。

`turn` と統計のターン数は、完了した配置回数と自動パス回数の合計（初期値0）。`placements` は配置回数。`rerollCount` は配置不能による再抽選の実行回数で、候補が0個となった場合も含む。延長配置開始時の通常バッグからの引き直しは含めない。

基準座標は正規化した形状の左上。回転は0～3、右へ90度ずつ。行動IDは `((handIndex * 4 + rotation) * 15 + y) * 15 + x`。`encodeMove` / `decodeMove` で相互変換できる。マスクでは対称形の重複回転を0にするが、`step` 自体は合法な同値回転も受け付ける。

観測 `encodeObservation` は `[27,15,15]` のチャンネル優先 `Float32Array`。0～2は自色・相手色・空き、3～23は候補3枠×7形状のone-hot平面（I/O/T/L/J/S/Z）、24は延長配置、25は上下方向、26は終局。空の候補枠は全0。盤面座標の回転・転置は行わない。

## 忘れてはならない事項

- Web・オンライン・AIの正式ルールは `src/game-core/` のみ。`src/engine.js` は既存呼び出し用の再エクスポート。
- 判定条件を変える際は `judgement.js` を変更し、AIとWebの共通テストを通す。
- 7種バッグをパスのリロールで消費しない。延長配置でも新規空きマスが必須。
- 探索時は `clone()` を使い、乱数状態も複製する。`copyState()` は単なるデータコピーで環境の復元APIではない。
- `getState()` はシミュレーション・診断用の完全情報を含む。オンラインの相手候補・バッグをクライアントへ送らない。学習用の観測変換は相手候補とバッグを含めない。将来のAI評価では完全情報を読むかどうかを明示する。
- 通常の対局終了に最大ターン制限を混ぜない。異常な対局はエラーとして調査する。
- ニューラルネット学習、MCTS、人間対AIのUI、GPUはこの版の対象外。
- この追加は開発・学習用の内部基盤。プレイヤーの操作や対戦ルールの公開変更はないため公開パッチノートには追加しない。
