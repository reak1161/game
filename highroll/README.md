# High Roll

オンライン対戦に対応したオリジナルボードゲームです。

## 開発

```bash
npm install
npm run dev
```

- クライアント: http://localhost:5173
- ローカルAPI: http://localhost:4000
- Cloudflare Workersを使う開発環境: `npm run dev:cf`

## 確認

```bash
npm run typecheck
npm test
npm run build
npm --prefix workers run typecheck
```

## Cloudflareへのデプロイ

WorkerとPagesは既存のCloudflareプロジェクトへCLIから手動でデプロイします。詳しい手順は
[`docs/online_workers_do.md`](docs/online_workers_do.md)を参照してください。

