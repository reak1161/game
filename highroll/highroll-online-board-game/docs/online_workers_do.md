# Highroll Cloudflare 運用メモ

`highroll-online-board-game` の Cloudflare Workers + Durable Objects + Pages 構成の実行、確認、本番更新手順をまとめる。

## 構成
- API: Cloudflare Workers + Durable Objects
- UI: Vite でビルドして Cloudflare Pages にデプロイ
- ローカル開発:
  - API: `http://127.0.0.1:4000`
  - UI: `http://localhost:5173`
- 本番:
  - UI: `https://highroll.reak1161.com/`
  - API: `https://api.reak1161.com/`

## 前提
- WSL 側の Node/npm を使う
- `which node` と `which npm` が `/home/.../.nvm/...` など WSL 側を指していること
- Cloudflare に `wrangler login` 済みであること

確認:

```sh
which node
which npm
npx wrangler whoami
```

## 初回セットアップ
リポジトリ直下:

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game
npm install
npm --prefix workers install
```

## ローカル開発
UI と API をまとめて起動:

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game
npm run dev:cf
```

必要に応じて個別起動:

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game/workers
npm run dev -- --port 4000
```

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game
npm run dev:client
```

## 環境変数
開発用:
- `.env.development`
  - `VITE_API_BASE=http://localhost:4000/api`
  - もし Vite の WS proxy が不安定なら `http://127.0.0.1:4000/api` にする

本番用:
- `.env.production`
  - `VITE_API_BASE=https://api.reak1161.com/api`

## 本番更新の基本手順
### API だけ変更したとき

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game/workers
npx wrangler deploy --env production
```

### UI だけ変更したとき

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game
npm run build:client
npx --yes wrangler@4.62.0 pages deploy dist/client --project-name highroll-ui --branch master --commit-dirty=true --skip-caching
```

### UI と API の両方を変更したとき
- API を先に更新する
- その後で UI を更新する

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game/workers
npx wrangler deploy --env production
```

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game
npm run build:client
npx --yes wrangler@4.62.0 pages deploy dist/client --project-name highroll-ui --branch master --commit-dirty=true --skip-caching
```

## 動作確認
最低限の確認:
- UI が `https://highroll.reak1161.com/` で開く
- ロビー一覧が取得できる
- ロビー入室後に WebSocket が接続できる
- マッチ開始後に WebSocket が接続できる

## WebSocket と Origin 制限
API 側では WebSocket 接続時に `Origin` を検証している。

許可元:
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:4173`
- `http://127.0.0.1:4173`
- `https://highroll.reak1161.com`
- `*.pages.dev`

本番で別のフロント URL を使う場合は、以下のどちらかを更新する。
- `workers/src/security.ts`
- `workers/wrangler.toml` の `ALLOWED_ORIGINS`

変更後は API を再デプロイする:

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game/workers
npx wrangler deploy --env production
```

## よくあるエラー
### `sh: 1: vite: not found`
原因:
- `node_modules` を消した
- 依存が未インストール
- WSL ではなく Windows 側の Node/npm を使っている

対処:

```sh
cd /mnt/c/Users/reak1/programming/game/highroll/highroll-online-board-game
which node
which npm
npm install
npm run build:client
```

注意:
- `node_modules` や `package-lock.json` を消した直後は、必ず `npm install` を先に実行する

### `WebSocket is closed before the connection is established`
原因:
- 開発中の再接続
- React StrictMode 由来の一時的な接続作り直し

対処:
- 一度だけ出るなら無視してよい
- 継続するならブラウザ再読込
- ロビー一覧、ロビー入室、マッチ入室のどこで切れているか切り分ける

### `403 Forbidden` で WebSocket がつながらない
原因:
- フロントの URL が許可オリジンに入っていない

対処:
- `workers/src/security.ts` または `workers/wrangler.toml` の `ALLOWED_ORIGINS` を更新
- API を再デプロイ

### `ws proxy socket error: write EPIPE`
原因:
- Vite の WS proxy が不安定

対処:
- `.env.development` を `VITE_API_BASE=http://127.0.0.1:4000/api` にして API へ直結する

### `durable_objects is not inherited by environments`
原因:
- `workers/wrangler.toml` の `[env.production]` 側に Durable Object binding が足りない

対処:
- `[[env.production.durable_objects.bindings]]` を定義する

## メモ
- UI デプロイでは `--skip-caching` を付ける
  - Pages 側のキャッシュ関連でハング気味になる環境があったため
- API の `workers.dev` の表示 URL と、実際に使うカスタムドメインは別
  - 実運用では `https://api.reak1161.com/` を使う
