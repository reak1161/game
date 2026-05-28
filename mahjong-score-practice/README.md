# Mahjong Score Practice (Cloudflare Ready)

このフォルダは、静的フロント (`index.html`) と Cloudflare Pages Functions + D1 の共有ランキングAPI雛形を含みます。

## ローカルで使う

- `game/mahjong-score-practice/index.html` をブラウザで開く
- APIが無い環境ではランキングは `localStorage` に保存されます

## Cloudflare Pages に公開（静的配信）

Cloudflare Pages の設定例:

1. `Root directory`: `game/mahjong-score-practice`
2. `Build command`: なし
3. `Build output directory`: `.`

## 共有ランキングを有効化（Pages Functions + D1）

1. D1 DB を作成
   - `wrangler d1 create mahjong-score-practice`
2. `wrangler.toml` の `database_id` を作成したIDに置き換える
3. スキーマ適用
   - `wrangler d1 execute mahjong-score-practice --file=./db/schema.sql`
4. Pages Functions を含めてデプロイ

## API

- `GET /api/rankings?limit=20`
- `POST /api/rankings`

`POST` payload 例:

```json
{
  "name": "Guest",
  "score": 12345,
  "correct": 8,
  "total": 10,
  "timeMs": 47200
}
```

## 注意

- `_headers` でCSPなどの基本セキュリティヘッダーを設定しています
- ランキングAPIは同一オリジン確認、JSON/サイズ制限、簡易レート制限、スコア上限検証を行います
- `db/schema.sql` 更新後は `wrangler d1 execute mahjong-score-practice --file=./db/schema.sql --remote` を再実行してください
- 公開運用を強める場合は Cloudflare Turnstile や WAF の追加も検討してください
