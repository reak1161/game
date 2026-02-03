# three_turn_will_be_end 仕様書（実装メモ準拠）

## 全体構成
- Cloudflare Pages: プロジェクト直下の `index.html`/`styles.css`/`main.js` をルートとして配信する静的フロント。プレーン HTML + ES Modules で実装し、ビルドレスで動作。
- Cloudflare Worker: `src/worker.js`。`/api/room/create`（POST）と `/api/room/:roomCode/ws`（GET, WebSocket Upgrade）を提供。
- Durable Object: `RoomDO`。ルーム状態の単一ソース。全プレイヤーの WebSocket を保持し、全アクションを直列で処理。
- 設定値: `config` に `maxRounds`（デフォルト: プレイヤー数ラウンド）と `targetScore`（デフォルト: 5 点先取）、`enableAdvancedCards`（false）を持つ。

## データモデル
- `CardDef { defId, name, kind, needsPrompt, description }`
- `CardInstance { id, defId }`
- `Player { id, name, isHost, score, hand: CardInstance[], declared: Set<number>, status: "active"|"out", socket?, lastSeen, pendingPrompt? }`
- `AttackEntry { id, card, ownerId, targetId, type: "kill"|"whim", note? }`
- `GameState`
  - `roomCode`, `hostId`, `players: Map<PlayerId, Player>`
  - `stage: "lobby"|"in_round"|"round_end"|"game_over"`
  - `round`, `cycle`（1..3 のテーブル周回番号）, `turnOrder`（開始プレイヤーからの座席順 PlayerId[]）, `turnCursor`（現在の index）
  - `deck`, `discard`, `attackBoard: AttackEntry[]`
  - `assassinHolderId`（手札にある場合）, `assassinPlayedBy`（公開済みの場合）
  - `logs: LogEntry[]`
  - `pendingAction`（プレイヤーの play 解決中に prompt が必要な場合の一時保存）
  - `config`

## ライフサイクル
1) ルーム作成: Worker が `roomCode` を生成し、RoomDO の stub を得て `playerId` を払い出す。
2) 参加: `join` メッセージで `name` を登録。初回のプレイヤーがホスト。`roomState` を全員に配信。
3) 開始: ホストが `start`。人数チェック（2〜4 人想定）→山札構築→配札→`stage="in_round"` へ。`round=1, cycle=1, turnCursor=0`。
4) 手番:
   - `declare`: 手番プレイヤーのみ。未使用の 1/2/3 を宣言して `pendingDeclaration` に保持。
   - `play`: 宣言済みかつ枚数一致を確認。カードを順に解決する。prompt が必要な場合は `prompt` を送り `pendingAction` に格納し、`choose` で再開。
   - 解決完了でターン終了処理（攻撃判定/脱落チェック）→次の生存プレイヤーへ。`turnCursor` が一周したら `cycle++`。
5) ラウンド終了:
   - 条件: `cycle>3` まで進んだ、または `assassinPlayedBy` が判明して `cycle>=3`、または `assassinLost` が発生。
   - `assassinId` を手札/公開済みから決定し公開ログを追加。
   - スコア計算:  
     - `out` プレイヤーは +1（ペナルティ扱い）。  
     - 生存かつ非さつじんはん → +2。  
     - さつじんはん: 生存 → 0、脱落 → -1。  
     - さつじんはん以外が全員脱落している場合、その全員を -1 に補正。  
   - `round++`。`maxRounds` または `targetScore` 到達で `stage="game_over"`。継続なら山札再構築・配札し `cycle=1` で再開。開始プレイヤーは前ラウンドのさつじんはん持ち。

## カード効果（MVP 実装）
- さつじんはん（role）
  - プレイ時に公開。`cycle>=3` なら即ラウンド終了トリガー。
  - 以後は攻撃対象にもなる。手札に残ったまま `cycle>3` でも公開して終了。
- ころす（attack, needsPrompt: target）
  - 左右どちらかの隣（2 人なら相手固定）を対象に攻撃ゾーンへ配置。
  - ターン終了時、対象が生存なら “まけ” 扱いで `status="out"`、カードは捨て札。
- きまぐれ（attack, needsPrompt: target）
  - 任意対象。攻撃ゾーンに残り、対象の手札が 0 になった瞬間に “まけ” にする。解決後カードは捨て札。
- こうかん（move, needsPrompt: target+ownCard）
  - 対象と 1 枚ずつ交換（相手のカードはランダム）。手番プレイヤーが手札 1 枚のみなら無効（ログに残す）。対象の手札が 0 なら無効。
- みんな いっしょ（event, needsPrompt: direction=left|right）
  - 選んだ方向へ各生存プレイヤーが手札 1 枚を裏で隣に渡す。カードがないプレイヤーはスキップ。使用者が 1 枚のみでも自分は渡さず、他プレイヤーは通常通り渡す。
- せきにんてんか（move）
  - 自分を対象としている攻撃ゾーンの「ころす/きまぐれ」をすべて次の生存プレイヤーに付け替える（時計回り）。
- やだ（deny）
  - 直近で自分を対象としている攻撃カード（ころす/きまぐれ）をすべて無効化し捨て札へ移動。

## エラーハンドリング
- 不正手番、宣言未完了、枚数不一致、対象が不在/自分などの入力エラーは `error` イベントで返し、状態は巻き戻さない。
- WebSocket 切断はソケットのみ破棄し、プレイヤーは残す（再接続可）。ゲーム停止はしない。

## メッセージペイロード
- `roomState`: ルームコード、プレイヤー一覧（id/name/score/status/handCount/declared）、hostId、stage、round、cycle、activePlayerId。
- `publicState`: 公開状態（攻撃ゾーン、山札残枚数、手番、宣言状況、ログ）。
- `privateState`: 自分の手札、未解決 prompt、操作可能フラグ。
- `prompt`: `{ requestId, promptType, options, message }`
- `log`: 時系列の短文。UI は最新 20 件表示。

## UI 仕様（実装版）
- ロビー: ルーム作成ボタン、コード入力、参加者リスト、ホストのみ「開始」。
- ゲーム画面:
  - 上部: ルームコード、ラウンド/サイクル、手番表示、宣言履歴（1/2/3 使用済みフラグ）。
  - 中央: 攻撃ゾーン（カード画像 + 所有者/対象ラベル）、公開されたさつじんはん。
  - 下部: 手札一覧（クリックで選択）。左に宣言ボタン 1/2/3、右に「プレイ」ボタン。
  - 右側: ログとエラー表示。
  - プロンプト: ターゲット選択/方向選択などをモーダル風パネルで表示。

## 簡易デプロイ手順
- Cloudflare Pages ビルドコマンド不要（`frontend` をルートに配置）。
- Worker/Wrangler: `wrangler.toml` をプロジェクトルートに配置し、`[[durable_objects.bindings]]` で `RoomDO` を登録。`workers_dev=true` でローカル動作可。
