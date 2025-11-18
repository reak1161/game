# 開発メモ / Progress Log (UTF-8)

## 運用メモ
- すべてのソースファイルは UTF-8 固定。Shift-JIS を混ぜると Vite で `Unexpected character` が発生する。
- クライアント / サーバー URL は `src/client/config/api.ts` (`withApiBase`, `SOCKET_URL`) と `.env` (`VITE_API_URL`, `VITE_SERVER_URL`) で切り替え。変更時は Vite を再起動。
- サーバー (`npm run dev:server`) はポート 4000 固定。`EADDRINUSE` が出たら既存 Node プロセスを停止。
- `npm run dev` でクライアント+サーバー同時起動。WSL では `/mnt/c/.../highroll-online-board-game` で実行し、Windows 側と二重起動しない。
- `npm run typecheck` は CJS 出力のため `import.meta` を直接扱えない。今後 ESM 化か `define` 注入を検討。

---

## 2025-01-13
### Done
- roles.json / decklist.* を読み込むサーバーユーティリティを実装。
- パスワード付きロビー作成と簡易マッチメイキングを REST で整備。
- 共有デッキからのドロー・カードプレイ API を用意し、プロトタイプ UI (Lobby/Match) で操作確認。

### Next / Issues
- ロビーイベントとマッチ状態の WebSocket 化 (REST はフォールバック)。
- Spe/Bra を考慮したターン制ルール / 共有山札挙動を仕様通りに。
- カード効果とターン終了処理 / 再シャッフルロジックをサーバー側に実装。
- 認証・セッション層を導入して `playerId` 送信を不要にする。

---

## 2025-01-14
### Done
- Match 画面に共有山札 / 捨て札 / 手札のリアルタイム表示を追加。GameEngine に Bra 消費と Spe 順序決定を反映。
- `/api/matches` に `draw` / `play` / `endTurn` を追加し、クライアントから Bra / ターンを制御可能に。
- WebSocket ロビーゲートウェイを導入し、`lobby:<id>` チャンネルで参加・退出・開始を push 配信。
- プロトタイプ用ロール/デッキデータと `docs/requirements.md` を更新。

### Clarified Requirements
- 通信は WebSocket を基本チャネル、REST はフェイルセーフ用途。
- 共有山札: ロビー作成時に選んだデッキを全員が共有し、山札が尽きたら捨て札をシャッフル。
- ターン制:
  - Round 開始時 Spe 降順で手番を決定。
  - 初期手札は Spe順で 3 枚ずつ配る。
  - Bra を行動ポイントとし、0 になっても自動終了しない (End Turn ボタンで終了)。
  - 通常ドローはゲーム開始時のみ。以降はカード効果による。

### Upcoming Tasks
1. ロビー更新 / マッチ状態 / 開始通知を WebSocket へ統合。
2. ダメージ / バフ / ターン管理などサーバーエンジンを拡張。
3. セッション管理を導入して API 側で `playerId` を任意送信させない。
4. カスタムデッキ UI / ストレージを検討し、ロールとデッキのカバレッジを拡大。

---

## 2025-01-15
### Done
- `POST /api/lobbies/:id/start` で `engine.start()` を実行し、共有山札配布と手番決定をサーバーで完結。
- `lobbyStarted` イベントの broadcast を実装し、参加者を自動的に `/match/:id` へ遷移。
- `createMatch` で追加されたプレイヤーを自動 Ready 扱いにして開始時の手番未設定を防止。
- `client/config/api.ts` のデフォルト URL を `http://localhost:4000` に変更し、Vite プロキシ経由の `ECONNREFUSED` を回避。Lobby 画面に API Health チェックと復旧ガイドを表示。
- Match 画面の手札 UI をカード風タイルへ刷新。cards.json から名称/コスト/説明を読み込み、WebSocket 経由の開始イベントにも対応。
- `sessionStorage` に playerId/name を保持し、ブラウザ再読込でも自分のプレイヤーを操作できるように。
- 観戦モードと操作権限表示を追加。ターン情報 / 山札残数を UI で視覚化。

### Notes
- カード効果とマッチ中のリアルタイム更新は未対応。引き続き「今後のタスク」を継続。
- API 接続エラー時は赤帯に復旧手順 (`npm run dev` / ポート4000) を表示。

---

## 2025-01-17
### Done
- GameEngine にランタイムステータス (`PlayerRuntimeState`) を実装し、HP/TempHP/トークン/インストール/敗北状態を管理。
- カード効果: `dealDamage`, `addStatToken`, `discardAllHand`, `doubleBaseStat`, `thresholdPrevent`, `cheatDeathAtFull` などをサーバーで解決。
- 行動ログ (`logs`) を追加し、ターン開始 / カード使用 / ロール攻撃 / 戦闘不能を記録。
- ロール攻撃 API (`POST /api/matches/:id/roleAttack`) を追加。Bra >=1 で通常攻撃、Bra=0 で悪あがき (自傷 + ターン即終了)。
- HP<=0 のプレイヤーを自動で脱落させ、最後の 1 人で勝敗を決定。
- クライアントの Match 画面にロール攻撃/悪あがきボタンを追加。対象選択や Bra 0 の挙動を UI で可視化。
- プレイヤーカードのホバーで基礎ステータス / トークン / ブースト内訳と TempHP を表示。脱落者には「戦闘不能」を表示。

### Next
- カードテンプレートを増やし (マーケット操作、コイン生成など)、`card_workflow_and_spec.md` と合わせて管理。
- WebSocket でマッチ更新を push 化し、2 秒ポーリングを廃止。
- Jest 実行環境 (`jest-environment-jsdom`) を導入し、サーバーテストを CI で通す。

---

## 現状まとめ
- カタログ API / ロビー作成 / マッチ開始 / カード操作 / Bra 制御 / ロール攻撃まで実装済み。
- 行動ログ・ターン表示・観戦モードにより最低限のプレイ体験を確認できる。
- 残課題: WebSocket リアルタイム同期、カード効果拡張、認証・セッション管理、カスタムデッキ UI など。

---

このファイルは進捗ごとに更新し、仕様ドキュメント (`requirements*.md`) と実装の差異が出ないよう管理する。
