# 超次元バトル - Codex用 具体プロンプト集

## 1. リポジトリ初期化プロンプト
```text
超次元バトルの monorepo を作成してください。

要件:
- package manager は pnpm
- apps/web: React + TypeScript + Vite
- packages/engine: 純粋 TypeScript のゲームエンジン
- packages/shared: DTO / 型定義
- workers/room-worker: Cloudflare Worker + Durable Object
- ESLint, Prettier, Vitest を導入
- 各 package 間の import path を解決
- web から engine と shared を参照できるようにする
- worker は shared を参照できるようにする

成果物:
- ディレクトリ構成
- package.json 群
- tsconfig 群
- 最低限の起動確認用コード
```

## 2. 共通型定義プロンプト
```text
packages/shared に、超次元バトルの共通型定義を実装してください。

最低限必要な型:
- Attribute
- CardType
- EffectTiming
- CardDefinition
- RoleDefinition
- GameState
- PlayerState
- CardInstance
- ReplayEvent
- RoomState
- SubmittedRoundData

方針:
- できるだけ discriminated union を使う
- zod スキーマも合わせて用意する
- 後方拡張しやすい構造にする
- 型定義ファイルを分割する
```

## 3. エンジン最小実装プロンプト
```text
packages/engine に、超次元バトルの最小ゲームエンジンを実装してください。

対象範囲:
- 5ラウンド進行
- ドロー
- マリガン
- 配置
- 左から順の解決
- 最終攻撃
- ラウンド終了
- 累計スコア算出
- ReplayEvent 出力

初期対応カード:
- パンチ
- はどうだん
- 筋トレ
- 詠唱練習
- ハイブリッド

初期対応役職:
- シンプル
- バランス
- フィナーレ

要件:
- UIに依存しない純粋関数中心
- 単体テストを書いてください
- 不正入力に対して失敗し方が明確であること
```

## 4. UI骨組みプロンプト
```text
apps/web に、超次元バトルの一画面ゲームUI骨組みを実装してください。

要件:
- 上部ヘッダー: ルームID、ラウンド、フェーズ、再生対象
- 左上: 役職、基礎攻撃、基礎魔法、一時攻撃、一時魔法、今ラウンドスコア、累計スコア
- 中央: 自分の場
- 下部: 手札
- 右側: 他プレイヤー簡易状況、ログ、カード詳細
- 手札から場への配置UIを仮実装
- ダミーデータで見た目確認できるようにする
- Tailwind CSS を使ってよい
```

## 5. Durable Object 実装プロンプト
```text
workers/room-worker に、超次元バトル用のルーム Durable Object を実装してください。

要件:
- 1ルーム = 1 Durable Object
- ルーム参加 / 離脱
- Ready 状態
- 役職選択
- WebSocket 接続管理
- RoomState を保持
- 現在ラウンドと再生カーソルを共有
- 再接続時の再同期APIを持つ
- 最低限のメッセージ型を shared に置く

メッセージ:
- JOIN_ROOM
- LEAVE_ROOM
- SET_READY
- SELECT_ROLE
- REQUEST_RESYNC
- REPLAY_PLAY
- REPLAY_PAUSE
- REPLAY_NEXT
```

## 6. 演出レイヤープロンプト
```text
apps/web に PixiJS と Howler.js を導入し、超次元バトルの演出レイヤーを実装してください。

対応イベント:
- CARD_ACTIVATED
- STATUS_CHANGED
- CARD_DESTROYED
- ENCHANT_APPLIED
- DAMAGE_DEALT
- FINAL_ATTACK

要件:
- React UI の上にオーバーレイ表示する
- 属性ごとに簡易パーティクルを変える
- 連続数に応じて次イベントまでの待機時間を短縮する
- 効果音のピッチまたは音程感を少し変えて気持ちよさを出す
- 演出をオフにする設定も用意する
```
