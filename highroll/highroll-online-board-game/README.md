# highroll-online-board-game

このプロジェクトは、オンラインでマルチプレイできる自作ボードゲームの実装です。プレイヤーはロビーで集まり、ゲームを開始することができます。

## 構成

- **README.md**: プロジェクトの概要や使用方法を記載したドキュメントです。
- **package.json**: npmの設定ファイルで、依存関係やスクリプトがリストされています。
- **tsconfig.json**: TypeScriptの設定ファイルで、コンパイラオプションやコンパイル対象のファイルを指定します。
- **vite.config.ts**: Viteの設定ファイルで、開発サーバーやビルドの設定が含まれています。
- **.env.example**: 環境変数の例を示すファイルです。

## フォルダ構成

- **src/**: アプリケーションのソースコード
  - **client/**: クライアントサイドのコード
    - **App.tsx**: アプリケーションのメインコンポーネント
    - **main.tsx**: アプリケーションのエントリーポイント
    - **components/**: 再利用可能なコンポーネント
    - **hooks/**: カスタムフック
    - **pages/**: ページコンポーネント
    - **styles/**: スタイルシート
  - **server/**: サーバーサイドのコード
    - **index.ts**: サーバーのエントリーポイント
    - **api/**: APIルート
    - **game/**: ゲームロジック
    - **sockets/**: WebSocket通信
  - **shared/**: クライアントとサーバーで共有するコード

- **tests/**: テストコード
- **docs/**: ドキュメント
- **scripts/**: スクリプト
- **config/**: 設定ファイル

## 使用方法

1. リポジトリをクローンします。
2. ルートディレクトリで依存関係をインストールします。
  ```bash
  npm install
  ```
3. 必要に応じて `.env` を作成し、`CLIENT_ORIGIN` や `VITE_SERVER_URL` などの値を上書きします（`.env.example` を参照）。
4. クライアントとサーバーを同時に起動します。
  ```bash
  npm run dev
  ```
  - Vite クライアント: http://localhost:5173
  - API/Socket サーバー: http://localhost:4000
5. プロダクションビルドを作成する場合は以下を実行します。
  ```bash
  npm run build
  npm start
  ```

## 利用可能な npm スクリプト

- `npm run dev`: クライアント (Vite) とサーバー (ts-node-dev) を同時起動
- `npm run dev:client`: クライアントのみ起動
- `npm run dev:server`: サーバーのみ起動
- `npm run build`: クライアントとサーバーをビルド
- `npm run build:client`: クライアントのみビルド
- `npm run build:server`: サーバーのみビルド
- `npm run start`: ビルド済みサーバーを起動
- `npm run typecheck`: TypeScript 型チェック
- `npm test`: Jest によるテスト実行

## 貢献

貢献を歓迎します！プルリクエストを作成する前に、必ずイシューを確認してください。