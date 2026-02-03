# オンライン版「3ターンでおわるゲーム」実装指示書（Codex用 / Cloudflare完結 完全版）

## 0. ゴール（MVP）
- PCブラウザで、友達同士がルームに集まって遊べるオンライン版を作る
- Cloudflareで完結：Pages + Workers + Durable Objects + WebSocket
- 操作：クリックで選択 → 決定（ドラッグ&ドロップなし）
- サーバー権威型（チート防止）：山札/手札/捨て札/進行/判定はすべてサーバー（RoomDO）で管理
- 最小成立：ルーム作成/参加 → 開始 → 配布 → 3ターン進行 → ラウンド終了 → 得点 → 次ラウンド → 規定でゲーム終了

## 1. 非ゴール（MVPではやらない）
- スマホ最適化UI
- マッチメイキング、ランキング、ログイン
- DB永続化（リプレイ保存）
- 派手な演出

---

## 2. Cloudflare構成
### 2.1 役割
- **Pages**：フロント配信（Vite+React+TS）
- **Worker**：HTTP入口（ルーム作成、WebSocket Upgrade、RoomDOへルーティング）
- **Durable Object（RoomDO）**：部屋ごとにゲーム状態を保持し、WebSocketで同期配信

### 2.2 ルーム＝DO 1個
- `roomCode` を発行し、`idFromName(roomCode)` で RoomDO を一意に決定
- 参加者のWS接続は RoomDO に集約
- 同じルームの操作は RoomDO 内で直列的に処理し、状態競合を避ける

---

## 3. ルーティング仕様（Worker）
### 3.1 ルーム作成（HTTP）
- `POST /api/room/create`
  - req: { name: string }
  - res: { roomCode: string, playerId: string }  // 作成者がhostとしてjoin済みでもOK
  - 備考：作成直後にWS接続する設計でも良い

### 3.2 ルーム参加（WebSocket）
- `GET /api/room/:roomCode/ws`
  - WebSocket Upgrade
  - query or first messageで `{type:"join", name}` を送る

---

## 4. WebSocketメッセージ仕様（JSON）
### 4.1 Client -> Server
- `{ type: "join", name: string }`
- `{ type: "leave" }`（任意）
- `{ type: "start" }`（hostのみ）
- `{ type: "declare", count: 1|2|3 }`
- `{ type: "play", cardIdsInOrder: string[] }`
- `{ type: "choose", requestId: string, payload: any }`（対象/方向など）

### 4.2 Server -> Client
- `{ type: "roomState", payload: { roomCode, players: PublicPlayer[], hostId } }`
- `{ type: "publicState", payload: PublicState }`（全員に配信）
- `{ type: "privateState", payload: PrivateState }`（本人にのみ）
- `{ type: "log", payload: LogEntry[] }`
- `{ type: "prompt", payload: { requestId, promptType, options, message } }`
- `{ type: "error", payload: { code, message } }`

---

## 5. UI要件（PC）
### 5.1 画面
- Lobby
  - ルーム作成（ルームコード表示）
  - 参加（コード入力）
  - プレイヤー一覧
  - hostだけ開始ボタン
- Game
  - 中央：自分のプレイヤーボード（下段スロット 1/2/3、上段攻撃ゾーン）
  - 下：自分の手札（クリックで選択、複数選択）
  - 右：ログ（公開情報のみ）
  - 上：手番、ラウンド数、宣言履歴（1/2/3の使用状況）

### 5.2 手番の操作フロー
1) 宣言（1〜3のうち未使用の数字のみ選べる）
2) 手札から宣言枚数を選択（不足/超過はエラー）
3) 「プレイ」クリック
4) 対象が必要なカードが含まれる場合は、順にモーダルで対象/方向を選択
5) 解決結果をログ表示、状態更新

---

## 6. ルール要約（画像ベース）
※曖昧な部分は `TODO:` として実装内コメントに残し、MVPでは暫定仕様で動かしてOK。

### 6.1 準備（ラウンド開始）
- 「さつじんはん」カードを必ず山に含める
- 基本カード（＋拡張なら追加）をシャッフルし、
  プレイヤー数Nに対して **6*N枚** になるよう山札を作る（余りは除外）
- 各プレイヤーに **6枚配布**

### 6.2 ターン進行（時計回り）
- スタートプレイヤー：
  - ラウンド1はルーム作成者（host）
  - 次ラウンドは直前ラウンドの「さつじんはん」所持者（確定したプレイヤー）
- 手番プレイヤーはプレイ枚数を宣言（1〜3）
- **2ターン目以降、自分が既に宣言した枚数は宣言できない**
  - 各プレイヤーはラウンド中に 1/2/3 をそれぞれ一度ずつ使用
- 宣言枚数だけ手札から選んでプレイし、**1枚ずつ順に解決**
- 攻撃カードは対象の「上段（攻撃ゾーン）」に置く

### 6.3 脱落（まけ）判定
- 手番終了時に「ころす」「きまぐれ」（＋拡張なら該当）で “まけ” 条件を満たすとそのラウンドから脱落
- 脱落者は以降の手番なし

### 6.4 ラウンド終了条件
- 3ターン目に「さつじんはん」をプレイしたプレイヤーが出た
  OR
- 3ターン目までに「さつじんはん」が “まけ” 状態になった
→ 「さつじんはん」を公開してラウンド終了

追加：
- 「さつじんはん以外の全員がまけ」の場合、特殊得点処理あり

### 6.5 得点
- 「かち」：さつじんはんが確定した時点で “まけ” ていない → 2点
- 「まけ」：ころす/きまぐれ等で “まけ” → 1点
- 「さつじんはん」：
  - 3ターン目で6枚目に出して “まけ” ていない → 0点
  - 3ターン目までに「さつじんはん」が “まけ” → -1点
  - 3ターン目で6枚目に出して “まけ” → -1点
- 「さつじんはん以外の全員がまけ」：
  - さつじんはん以外の全員 → -1点
- ゲーム終了：推奨「プレイヤー数分のラウンド」or「5点先取」（configで切替）

---

## 7. カード定義（MVP：基本カード中心）
### 7.1 実装方針
- `CardDef` に defId/name/kind/needsPrompt/description 等
- 1枚のカードは `CardInstance { id, defId }`（手札の個体）
- 効果は `server/game/cards/*.ts` に `resolve` 関数として実装
- 曖昧なカードはMVPから外してもよい（configで除外）

### 7.2 基本カード（優先実装）
- さつじんはん x1
  - TODO: 「必ず6枚目に出す」「出した/捨てたら負け」文言の厳密化
  - MVP暫定：3ターン目にプレイされたらラウンド終了トリガー
- ころす x4（攻撃）
  - 左右を選んで隣を対象（2人なら相手固定）
  - 手番終了時、対象は“まけ”
- きまぐれ x4（攻撃）
  - 対象を選ぶ
  - 対象の手札が0になった時点で、このカードが攻撃ゾーンにあれば“まけ”
- こうかん x4（移動）
  - だれかと1枚ずつ交換
  - 最後の1枚に使った場合は無効
- みんな いっしょ x4（イベント）
  - 左右どちらか選ぶ
  - 選んだ方向に全員が1枚を裏向きで渡す
  - 最後の1枚に使った場合、自分を含まず渡す
- せきにんてんか x4（移動）
  - 自分の攻撃ゾーンの「ころす/きまぐれ（＋拡張攻撃）」を全て次の人に移す
- やだ x4（拒否）
  - 指定した攻撃カード1枚を取り消す（攻撃ゾーンから除去して捨て札へ）
  - TODO: “だんやくは手元に置く” 等の特殊はMVPでは後回し

### 7.3 後回し（曖昧/介入系）
- くちどめ、かわりにつかう、もう…わたす 等は `config.enableAdvancedCards` でOFFにできるようにする
- 実装する場合は prompt の仕様を明確化し、ルールの暫定解釈をコメントに残す

---

## 8. Shared型（/shared/types.ts）
### 8.1 公開/非公開の分離（必須）
- `PublicState`：手札の中身を含めない（handCountのみ）
- `PrivateState`：自分のhand（CardInstance[]）を含める

### 8.2 例（最低限）
- PlayerId = string
- CardDef, CardInstance
- GameState（DO内部の正）
- PublicState / PrivateState
- LogEntry
- PromptRequest（requestId, promptType, options）

---

## 9. Durable Object: RoomDO の責務
- WS接続管理（playerId <-> websocket）
- join/leave、host判定
- `reduce(action)` で状態遷移（不正手は reject）
- 状態更新後に
  - publicState を全員へ broadcast
  - privateState を個別送信
- prompt中は choose が返るまで次の手を受けない（またはキューで管理）

---

## 10. 実装タスク（この順）
### Step 1: 雛形
- wrangler 設定（Pages + Worker + DO）
- clientからWS接続して疎通

### Step 2: ルーム作成/参加
- /api/room/create
- /api/room/:roomCode/ws
- lobby同期（players一覧）

### Step 3: start→配布
- デッキ作成（6*N枚、さつじんはん必須）
- 各自に6枚配布（privateState）
- publicStateはhandCountのみ

### Step 4: ターン骨格
- declare: 1〜3未使用のみ
- play: 宣言枚数と一致
- まずは「ログだけ出して進行」でもOK

### Step 5: カード効果を追加（優先順）
1) こうかん / みんな いっしょ（移動系）
2) ころす / きまぐれ（攻撃系）
3) せきにんてんか（攻撃移動）
4) やだ（拒否）
5) さつじんはん（終了トリガ）

### Step 6: ラウンド終了と得点
- 条件成立で公開→得点計算→次ラウンド
- 規定ラウンド or 5点先取で game_end

---

## 11. 受け入れ条件（Acceptance Criteria）
- 2〜5人で同じルームに入り、同期する
- 手札は本人にしか見えない（他人には handCount）
- 宣言制約（1/2/3の重複不可）が守られる
- 不正操作（手番違い/枚数違い/対象不正）はサーバーが拒否して error を返す
- 3ターン進行→ラウンド終了→得点が加算される
