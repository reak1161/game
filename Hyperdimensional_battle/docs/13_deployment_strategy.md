# Cloudflare デプロイ方針

## 1. 目的

Hyperdimensional Battle は、ソロとマルチで UI を分けて別サービス化するのではなく、**1つのフロントエンド**に両方を含める。

その上で、マルチプレイ用の同期処理だけを Worker / Durable Object に分離する。

## 2. デプロイ分担

### Cloudflare Pages

Pages はフロントエンド全体を配信する。

含めるもの:

- ホーム画面
- ソロモード導線
- マルチプレイ導線
- ソロバトル UI
- マルチバトル UI
- カード一覧、ヘルプ、設定などのクライアント UI

要点:

- ソロモードは Pages 配下の同一フロントで動かす
- ソロ専用の別デプロイは作らない
- マルチ用画面も同じ Pages 配下に置く

### Cloudflare Worker / Durable Object

Worker / DO はマルチプレイ専用のサーバー処理を担当する。

含めるもの:

- ルーム作成
- ルーム参加 / 離脱
- Ready 状態管理
- 役職選択同期
- 入力受付
- ラウンド進行
- リプレイ / 同期イベント配信
- authoritative なゲーム状態管理

要点:

- マルチの判定と状態確定は Worker / DO 側を正とする
- クライアントは表示と入力送信に寄せる

## 3. GitHub 連携の前提

同一リポジトリから、Pages と Worker を**別プロジェクトとして**デプロイする。

つまり:

- `apps/web` は Pages
- `workers/room-worker` は Worker / DO

に分かれる。

ただしリポジトリは分けない。

## 4. 仕様変更の反映方針

ゲーム仕様変更は、できるだけ `packages/engine` と `packages/shared` に集約する。

これにより:

- ソロモードではローカル engine に反映される
- マルチモードでは Worker 側の判定にも反映される

共通ロジックの変更を 1 箇所で済ませやすくする。

## 5. 今後のデプロイ運用方針

最終的には、GitHub push を起点に以下のように更新するのが自然。

- `apps/web/**` の変更
  - Pages を更新
- `workers/room-worker/**` の変更
  - Worker を更新
- `packages/shared/**` または `packages/engine/**` の変更
  - Pages と Worker の両方を更新

この制御は GitHub Actions で行う想定。

## 6. 現時点の結論

現時点の正式方針は以下。

- フロントは Cloudflare Pages に 1 本化する
- ソロモードは Pages の中に含める
- マルチ用の同期処理だけ Worker / Durable Object に分ける
- 仕様変更は `packages/engine` / `packages/shared` に寄せ、ソロとマルチへ共通反映できる形を維持する
