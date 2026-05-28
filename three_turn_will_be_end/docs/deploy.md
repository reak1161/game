# three_turn_will_be_end デプロイ手順

## 構成（本番）
- UI（Cloudflare Pages）: `https://three-turn.reak1161.com`
- API / WebSocket（Cloudflare Worker + Durable Object）: `https://three-turn.reak1161.com/api/*`
- Worker Route: `three-turn.reak1161.com/api/*`（失敗クローズ推奨）

## 初回デプロイ

### 1. Worker + Durable Object をデプロイ
```powershell
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler login
wrangler deploy
```

メモ:
- `wrangler.toml` の DO migration は `new_sqlite_classes = ["RoomDO"]` を使う（Free プラン対応）。

### 2. Pages プロジェクト作成（初回のみ）
```powershell
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler pages project create three-turn-ui
```

### 3. フロント（静的ファイル）を Pages にデプロイ
```powershell
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler pages deploy . --project-name three-turn-ui
```

デプロイ対象:
- `index.html`
- `main.js`
- `styles.css`
- `image/`

### 4. Pages にカスタムドメイン設定
- Cloudflare Dashboard → `Workers & Pages` → `Pages` → `three-turn-ui`
- `Custom domains` で `three-turn.reak1161.com` を追加

### 5. Worker Route 設定（`/api/*` のみ）
- Cloudflare Dashboard → `Workers & Pages` → `Workers` → `three-turn-will-be-end`
- `Triggers` / `Routes` → `Add route`
- Route pattern: `three-turn.reak1161.com/api/*`
- Zone: `reak1161.com`
- 失敗モード: `失敗クローズ`

## 再デプロイ手順（今後）

### A. Worker 側を変更したとき
対象例:
- `src/worker.js`
- `wrangler.toml`

```powershell
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler deploy
```

### B. フロント側を変更したとき
対象例:
- `index.html`
- `main.js`
- `styles.css`
- `image/*`

```powershell
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler pages deploy . --project-name three-turn-ui
```

### C. 両方変更したとき
```powershell
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler deploy
wrangler pages deploy . --project-name three-turn-ui
```

## デプロイ後チェック（最小）
1. `https://three-turn.reak1161.com` で UI が表示される
2. ルーム作成で `POST /api/room/create` が成功する
3. 2タブで参加して WebSocket が接続される（`/api/room/<code>/ws`）
4. ゲーム開始→宣言→プレイ→同期が動く

## よくある失敗
- Route を `three-turn.reak1161.com/*` にしてしまう
  - UI まで Worker が受けて Pages が表示されない
  - 対策: `three-turn.reak1161.com/api/*` に限定
- Pages は更新したのに表示が古い
  - 対策: ブラウザでハードリロード（`Ctrl+F5`）
- Worker は動くがルーム作成できない
  - 対策: DevTools で `POST /api/room/create` のステータス確認（404ならRoute設定を見直し）

## ローカル確認（参考）
```powershell
# ターミナル1
cd C:\Users\reak1\programming\game\three_turn_will_be_end
wrangler dev

# ターミナル2
cd C:\Users\reak1\programming\game\three_turn_will_be_end
python -m http.server 3000
```

- ブラウザ: `http://localhost:3000/index.html`
