# three_turn_will_be_end 開発メモ

- 2026-03-14 19:xx JST: 要件を requirement.md から抽出し、`docs/requirements.md` に整形。実装仕様を `docs/spec.md` にまとめ、カード効果・ターン進行・スコア計算の方針を決定。
- 2026-03-14 20:xx JST: Cloudflare Worker + Durable Object の骨格を `src/worker.js` に実装。カード定義、デッキ構築、宣言/プレイ/プロンプト/攻撃処理、ラウンド終了とスコア計算までを実装し、`wrangler.toml` を追加。
- 2026-03-14 21:xx JST: フロントエンド（`index.html`/`styles.css`/`main.js`）を追加。ロビー作成・WS接続・宣言/カード選択/プロンプトUI・ログ表示・攻撃ゾーン表示を実装。カード画像を `image/` から参照。
- 2026-03-14 22:xx JST: `main.js` に file:// アクセス時の WS 接続先フォールバック（localhost:8787）を追加し、`wrangler dev` + ローカルファイルで動作確認しやすくした。
- 2026-03-14 22:yy JST: `main.js` に API/WS のフォールバック強化（HTTP でポートが 8787 以外でも localhost:8787 に向ける）、fetch 失敗時のエラー表示強化、WS 切断時の通知を追加。
- 2026-03-14 22:zz JST: Worker の API 応答に CORS ヘッダーと OPTIONS レスポンスを追加し、file:// や別ポートのフロントからの fetch が通るようにした。
- 2026-03-14 23:aa JST: 同ブラウザ複数タブで参加する際に既存 playerId を再利用しないよう `handleJoinRoom` を修正（別タブを別プレイヤーとして扱う）。
- 2026-03-14 23:bb JST: WebSocket 単純フォワード（stub.fetch(request)）に変更し、接続直後に hello フレームを送信するようにして疎通確認をしやすくした。
- 2026-03-14 23:cc JST: UI微調整（メタバー、カードサイズ縮小、roomCode短縮表示、手札画像高さ調整）。
- 2026-03-14 23:dd JST: カード画像の対応を修正（こうかん=008、みんな いっしょ=010、せきにんてんか=007、やだ=006）し、カード名を「やだ」に修正。
