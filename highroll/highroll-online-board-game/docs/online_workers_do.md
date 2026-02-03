# Workers + Durable Objects でオンライン化（設計メモ / 内部用）

目的：現状の「ローカル（WSL）で `npm run dev` + Cloudflare Tunnel」での公開を卒業し、**Cloudflare上で常時稼働**できるオンライン構成へ移行する。

## 方針（B案：全部 Cloudflare）
- フロント：Cloudflare Pages（Vite の build 出力を静的配信）
- API 入口：Cloudflare Worker（`/api/...` を処理）
- 状態保持・WebSocket：Durable Object（部屋/マッチごとに 1 インスタンス）

### 重要：socket.io は使わない
Workers では Node の常駐サーバ（`listen`）や socket.io 前提をそのまま持ち込めないため、**標準 WebSocket（JSONメッセージ）**に置き換える。

## 無料枠で回すための原則
- ポーリングをやめる（APIのリクエスト数を消費しやすい）
- WS は常時接続にして、**イベント駆動 + 差分（patch）配信**を基本にする
- 永続化（DO storage / SQLite）は「毎フレーム」ではなく、**節目（例：ターン終了）でまとめて保存**

## 実装の入口（このリポジトリ内）
`game/highroll/highroll-online-board-game/workers/`
- `wrangler.toml`：Worker + DO の設定
- `src/worker.ts`：API入口（`/api/rooms`, `/api/rooms/:id/ws`, `/api/cards`）
- `src/roomDO.ts`：RoomDO（WS接続管理＋ state 配信）

現段階は「接続できて、プレイヤー一覧が同期される」までの骨格。

## ローカル実行（疎通確認）
### API/WS（Workers/DO）単体
1. `game/highroll/highroll-online-board-game/workers/` に移動
2. `npm i`
3. `npm run dev`（既定では `http://127.0.0.1:8787`）
4. 別ターミナルでマッチ作成：
   - `curl -sS -X POST http://127.0.0.1:8787/api/rooms`
   - 返ってきた `id` を使って WebSocket に接続：
     - `ws://127.0.0.1:8787/api/rooms/<id>/ws`
5. WS は接続直後に `t:"state"` が返る。必要なら `{ "t": "join", "name": "Alice" }` を送って参加者を追加できる。

### フロントも一緒に起動（Vite + Workers/DO）
1. `game/highroll/highroll-online-board-game/` に移動
2. まだなら `npm i` と `npm --prefix workers i`
3. `npm run dev:cf`
   - Worker（wrangler dev）を `http://127.0.0.1:4000` で起動する
   - Vite は `http://localhost:5173`（`/api` を 4000 に proxy）

※フロント（React）は `/api/rooms/:id/ws` の購読（state push）に対応。開発時のみ polling にフォールバックする（production では無効）。

## 環境変数（接続先の切替）
- 開発：`.env.development`
  - `VITE_API_BASE=/api`（Vite と同一オリジンの `/api` を叩く。dev:cf では proxy で `:4000` に流れる）
- 本番：`.env.production`
  - `VITE_API_BASE=https://highroll-api.<your>.workers.dev/api`

## KV（cards.json）
`GET /api/cards` は KV から `cards.json` を返す。

初回セットアップ（コマンドはメモ。実行は手動でOK）:
- `wrangler kv:namespace create KV_CARDS`
- 出力された `id` を `workers/wrangler.toml` の `KV_CARDS` に反映
- `wrangler kv:key put --binding=KV_CARDS cards.json @../../cards/dev/cards.json`

※ローカルでは `KV_CARDS` が未設定だと `GET /api/cards` は `501` を返す。

## デプロイ（メモ）
- API（Workers/DO）
  - 開発: `cd workers && wrangler deploy`
  - 本番: `cd workers && wrangler deploy --env production`
- フロント（Pages）
  - `npm run build:client`
  - Pages 側で `dist/client` を公開（または `wrangler pages deploy dist/client --project-name <name>`）

## 今後の移植ステップ（順番）
1. **通信プロトコル確定**
   - client→server：`t:"join"` / `t:"action"` / `t:"ping"`
   - server→client：`t:"state"` / `t:"error"` / `t:"pong"`
2. engine の移植
   - `engine.ts` を Workers 互換にする（Node依存を排除）
   - DO が単一の正として直列に処理（競合防止）
3. クライアント側の差し替え
   - `socket.io-client` を削除して `WebSocket` に変更
   - API ベースを `/api`（同一ホスト）に統一
4. デプロイ
   - Pages（フロント） + Worker/DO（API/WS）
