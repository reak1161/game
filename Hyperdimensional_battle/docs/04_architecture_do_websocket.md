# 超次元バトル - アーキテクチャ設計（DO + WebSocket）

## 1. 採用方針
- ゲームエンジンはクライアントでもサーバーでも実行可能な純粋 TypeScript とする
- ルームごとの共有状態は Cloudflare Durable Object が保持する
- リアルタイム同期は WebSocket を使用する
- 1ルーム = 1 Durable Object とする

## 2. 目的
この構成の目的は「みんなで同じ状態を見る」ことであり、  
相互干渉型のリアルタイムアクションではない。  
よって、Durable Object は **共有観戦・共有進行の司会役** として扱う。

## 3. 役割分担

### クライアント（React）
- UI表示
- ローカル入力
- 一時的な操作状態保持
- 演出再生
- WebSocketによるルーム更新受信
- 必要に応じたローカルシミュレーション

### 共通ゲームエンジン（TypeScript）
- ルール解釈
- 状態更新
- カード解決
- リプレイイベント列生成

### Worker
- APIエントリ
- ルーム作成
- Durable Object ルーティング
- 静的アセット配信補助（必要に応じて）

### Durable Object
- ルーム状態保持
- 参加者一覧
- Ready状態
- 現在ラウンド
- 現在再生中プレイヤー
- 現在再生中イベントインデックス
- 各プレイヤーの提出データ
- 再接続時の状態復元
- 全クライアントへの状態配信

## 4. ルーム状態の例
```ts
type RoomState = {
  roomId: string;
  phase: "lobby" | "input" | "replay" | "round_result" | "finished";
  players: RoomPlayer[];
  currentRound: number;
  replayCursor: {
    playerIndex: number;
    eventIndex: number;
    isPaused: boolean;
  } | null;
  submittedRounds: Record<string, SubmittedRoundData[]>;
  createdAt: number;
  updatedAt: number;
};
```

## 5. フェーズ遷移
- lobby
  - 参加待ち / 役職選択 / ready
- input
  - 各プレイヤーが手札交換、配置などを決定
- replay
  - DOがプレイヤーごとのイベント列を順番に配信
- round_result
  - ラウンド結果を表示
- finished
  - 最終結果表示

## 6. WebSocketメッセージ例
### クライアント -> DO
- `JOIN_ROOM`
- `LEAVE_ROOM`
- `SET_READY`
- `SELECT_ROLE`
- `SUBMIT_ROUND_ACTIONS`
- `REQUEST_RESYNC`
- `REPLAY_PLAY`
- `REPLAY_PAUSE`
- `REPLAY_NEXT`
- `REPLAY_SKIP_TO_PLAYER`

### DO -> クライアント
- `ROOM_STATE_UPDATED`
- `PLAYER_JOINED`
- `PLAYER_LEFT`
- `ROUND_STARTED`
- `ROUND_ALL_SUBMITTED`
- `REPLAY_EVENT`
- `REPLAY_CURSOR_UPDATED`
- `ROUND_RESULT`
- `GAME_FINISHED`
- `ERROR`

## 7. 共有観戦の基本方針
- 各プレイヤーはラウンド入力を提出する
- DOは全員提出を確認後、再生順を確定する
- 再生対象のプレイヤーを1人ずつ進める
- クライアントは `REPLAY_EVENT` を受けて演出再生する
- 再接続者は `REQUEST_RESYNC` で現在のカーソル位置へ復帰する

## 8. 再生戦略
推奨案:
- ゲームロジックの確定結果は提出時に生成しておく
- replay フェーズでは結果イベント列を再生するだけにする
- 再生中にルール再計算を行わない

## 9. ディレクトリ構成案
```text
apps/
  web/
    src/
      app/
      components/
      features/
      pages/
      store/
      ws/
packages/
  engine/
    src/
      core/
      effects/
      rules/
      replay/
      types/
  shared/
    src/
      dto/
      schemas/
workers/
  room-worker/
    src/
      index.ts
      room-do.ts
```

## 10. 初期実装の優先順位
1. ローカルエンジン
2. ローカルリプレイ再生
3. Worker + DO の最低限ルーム管理
4. WebSocket 同期
5. DO 主導の共有リプレイ
6. 再接続復元
