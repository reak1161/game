# 開発メモ / Progress Log (UTF-8)

## 運用メモ
- すべてのソースファイルは UTF-8 固定。Shift-JIS などを混在させると Vite で `Unexpected character` が発生する。
- クライアント / サーバー URL は `src/client/config/api.ts`（`withApiBase`, `SOCKET_URL`）と `.env`（`VITE_API_URL`, `VITE_SERVER_URL`）で切り替え。変更時は Vite を再起動する。
- サーバー（`npm run dev:server`）はポート 4000 固定。`EADDRINUSE` が出たら既存の Node プロセスを停止する。
- `npm run dev` でクライアントとサーバーを同時起動。WSL では `/mnt/c/.../highroll-online-board-game` で実行し、Windows 側と二重起動しないようにする。
- `npm run typecheck` は CJS 出力のため `import.meta` を直接扱えない。将来的に ESM 化するか `define` で注入する。

---

## 2025-01-13
### Done
- roles.json / decklist.* を読み込むサーバーサイドユーティリティを実装。
- パスワード付きロビー作成と簡易マッチメイキングを REST で整備。
- 共有デッキからのドロー / カードプレイ API を用意し、プロトタイプレベルの Lobby / Match UI で動作確認。

### Next / Issues
- ロビーイベントとマッチ状態を WebSocket 化（REST はフォールバック用途）。
- Spe / Bra を反映したターン制ルールと共有山札挙動を仕様通りに実装。
- カード効果・ターン終了処理・再シャッフルロジックをサーバー側に寄せる。
- 認証 / セッション層を導入して `playerId` の手動送信を不要にする。

---

## 2025-01-14
### Done
- Match 画面に共有山札 / 捨て札 / 手札のリアルタイム表示を追加し、GameEngine に Bra 消費と Spe 順決定を反映。
- `/api/matches` に `draw` / `play` / `endTurn` を追加し、クライアントから Bra / ターン操作が可能に。
- WebSocket ロビーゲートウェイを導入し、`lobby:<id>` チャンネルで参加 / 退出 / 開始を push 配信。
- プロトタイプ用ロール / デッキデータを整備し、`docs/requirements.md` を更新。

### Clarified Requirements
- 通信は WebSocket を基本チャネル（REST はフェイルセーフ用途）。
- 共有山札: ロビー作成時に選んだデッキを全員で共有し、山札が尽きたら捨て札をシャッフル。
- ターン制: Round 開始時に Spe 順で手番決定 → 初期手札は Spe 順で 3 枚ずつ → Bra を行動ポイントとし 0 になっても即終了しない（End Turn ボタンで明示）→ 通常ドローはゲーム開始時のみ、以降はカード効果で補充。

### Upcoming Tasks
1. ロビー更新 / マッチ状態 / 開始通知を WebSocket へ統合。
2. ダメージ / バフ / ターン管理などサーバーエンジンを拡張。
3. セッション管理を導入して API 側で `playerId` を渡さなくても済むようにする。
4. カスタムデッキ UI / ストレージを検討し、ロールとデッキ種類を拡大。

---

## 2025-01-15
### Done
- `POST /api/lobbies/:id/start` で `engine.start()` を実行し、共有山札配布 / 手番決定をサーバーで完結。
- `lobbyStarted` イベントを broadcast し、参加者を自動画面遷移（`/match/:id`）。
- `createMatch` で追加されたレイヤーを強制 Ready 扱いにし、開始時の手番未設定を防止。
- `client/config/api.ts` のデフォルト URL を `http://localhost:4000` に戻して Vite プロキシ経由の `ECONNREFUSED` を回避。Lobby 画面に API Health チェックと復旧ガイドを追加。
- Match 画面の手札 UI をカード風タイルへ刷新。`cards.json` から名称 / コスト / 説明を読み込み、WebSocket 経由の開始イベントにも対応。
- `sessionStorage` に playerId / name を保持し、ブラウザ再読込でも同じプレイヤーを操作できるようにした。
- 観戦モードと操作権限表示を追加し、ターン情報 / 山札残数を UI で視覚化。

### Notes
- カード効果とマッチ中のリアルタイム更新は未対応。今後のタスクで継続。
- API 接続エラー時は赤帯に復旧手順（`npm run dev` / ポート 4000）を表示。

---

## 2025-01-17
### Done
- GameEngine に `PlayerRuntimeState` を実装し、HP / TempHP / トークン / インストール / 敗北状態を管理。
- `dealDamage`, `addStatToken`, `discardAllHand`, `doubleBaseStat`, `thresholdPrevent`, `cheatDeathAtFull` などサーバー側のカード効果を実装。
- 行動ログ (`logs`) を追加し、ターン開始 / カード使用 / ロール攻撃 / 戦闘不能を記録。
- ロール攻撃 API (`POST /api/matches/:id/roleAttack`) を追加し、Era >= 1 で通常攻撃、Bra = 0 で悪あがきを再現。
- HP <= 0 のプレイヤーを自動脱落させ、最後の 1 人で勝敗を決定。
- クライアント Match 画面にロール攻撃 / 悪あがきボタンを追加し、Bra 0 時の挙動を明示。
- プレイヤーカードのホバーで基礎ステータス / トークン / ブースト / TempHP を表示し、脱落者は「戦闘不能」扱いに。

### Next
- カードテンプレートを拡張（マーケット操作、コイン生成など）し、`card_workflow_and_spec.md` と合わせて管理。
- WebSocket でマッチ更新を push 化し、秒ポーリングを廃止。
- `jest-environment-jsdom` でテスト環境を整え、サーバーテストを CI で通す。

---

## 2025-01-18
### Done
- `src/client/config/api.ts` と `useGameClient.ts` の接続先を同一オリジン優先（必要に応じて環境変数で上書き）へ変更し、Cloudflare トンネル 1 本で API / Socket.io も動作するようにした。
- Vite の proxy に `/socket.io`（`ws: true`）を追加し、開発サーバー経由でも WebSocket がポート 4000 の Node サーバーへ中継されるよう調整。
- `vite.config.ts` の `allowedHosts` を `.trycloudflare.com` + `VITE_ALLOWED_HOSTS`（カンマ区切り）で柔軟に指定できるよう整理。
- 変更内容を `docs/progress.md` に追記し、Cloudflare Quick Tunnel 運用メモを更新。

### Notes
- Quick Tunnel では `npm run dev` を起動した状態で `cloudflared tunnel --url http://localhost:5173` を実行するだけで `/api` / `/socket.io` が backend に届く。個別に API 用トンネルを立てる必要はない。

---

## 現状まとめ
- カタログ API / ロビー作成 / マッチ進行 / カード操作 / Bra 制御 / ロール攻撃まで実装済み。
- 行動ログ・ターン表示・観戦モードにより最低限のプレイ体験を確認済み。
- 残課題: WebSocket リアルタイム同期、カード効果拡張、認証・セッション管理、カスタムデッキ UI など。

---

このファイルは進捗ごとに更新し、仕様ドキュメント（`requirements*.md`）と実装の差異があれば補足する。
