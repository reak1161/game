# three_turn_will_be_end 要件定義

## ゴール
- Cloudflare Pages + Workers + Durable Objects で完結するオンライン版を実装する。
- PC ブラウザで友達がルームコードを共有して遊べる。UI はクリック操作のみ。
- サーバー権威型（山札/手札/捨て札/進行判定は RoomDO が管理）。
- MVP では 1 ルーム内で作成/参加→配席→3 ターン進行→ラウンド終了→得点加算→次ラウンド/ゲーム終了までを行う。

## 非ゴール
- スマホ最適化 UI、マッチメイキング/ランキング/ログイン。
- DB 永続化やリプレイ保存。
- 派手な演出。

## クラウド構成
- Pages: フロント（Vite/React 相当のシンプル実装、今回リポジトリではプレーン JS で構成）。
- Worker: HTTP 入口。ルーム作成 API と WebSocket Upgrade を担当し、RoomDO にルーティング。
- Durable Object (RoomDO): ルームごとにゲーム状態を保持し、直列処理と WebSocket 配信を行う。
- ルームは `roomCode` を `idFromName(roomCode)` で一意決定。

## ルーティング仕様
- `POST /api/room/create` → `{ roomCode, playerId }` を返し、ホストとして join 済み扱いでも良い。
- `GET /api/room/:roomCode/ws` → WebSocket Upgrade。クエリまたは最初のメッセージで `{type:"join", name}` を送る。

## WebSocket メッセージ
- Client → Server
  - `{ type: "join", name }`
  - `{ type: "leave" }`（任意）
  - `{ type: "start" }`（ホストのみ）
  - `{ type: "declare", count: 1|2|3 }`
  - `{ type: "play", cardIdsInOrder: string[] }`
  - `{ type: "choose", requestId, payload }`（対象/方向など）
- Server → Client
  - `{ type: "roomState", payload: { roomCode, players: PublicPlayer[], hostId } }`
  - `{ type: "publicState", payload: PublicState }`（全員へ）
  - `{ type: "privateState", payload: PrivateState }`（本人のみ）
  - `{ type: "log", payload: LogEntry[] }`
  - `{ type: "prompt", payload: { requestId, promptType, options, message } }`
  - `{ type: "error", payload: { code, message } }`

## UI 要件
- Lobby: ルーム作成/コード入力/プレイヤー一覧/ホストだけ開始ボタン。
- Game: 中央に攻撃ゾーンとプレイボード、下に手札（クリックで選択・複数選択）、右にログ、上に手番・ラウンド・宣言履歴表示。
- 手番フロー
  1. 宣言（未使用の 1/2/3 から選択）。
  2. 手札から宣言枚数を選択（不足/過剰はエラー）。
  3. 「プレイ」をクリック。
  4. 対象が必要なカードが含まれる場合はモーダルで対象/方向を選択。
  5. 解決結果をログに表示し状態更新。

## ルール概要
- 準備/ラウンド開始
  - 「さつじんはん」を山に含め、基本カードをシャッフル。
  - プレイヤー数 N に対して 6*N 枚になるよう山を作り、余りは除外。
  - 各プレイヤーに 6 枚配る。
- ターン進行（時計回り）
  - 初ラウンドはホストが開始。次ラウンドは前ラウンドで「さつじんはん」を持っていた人が開始。
  - 2 ターン目以降、すでに宣言した枚数は再宣言不可。ラウンド中に 1/2/3 を一度ずつ使う。
  - 宣言枚数だけ手札を選び、1 枚ずつ順に解決。攻撃カードは攻撃ゾーンに表で置く。
- 脱落/まけ判定
  - 手番終了時に「ころす」「きまぐれ」等で “まけ” 条件ならそのラウンドは脱落し以後手番なし。
- ラウンド終了条件
  - 3 ターン目で「さつじんはん」をプレイしたプレイヤーがいる、または
  - 3 ターン目までに「さつじんはん」が “まけ” 状態。
  - 「さつじんはん」を公開してラウンド終了。
- 得点
  - かち：さつじんはん確定時に “まけ” ていない人 → +2
  - まけ：ころす/きまぐれ等で “まけ” → +1
  - さつじんはん：
    - 3 ターン目で 6 枚目に出して “まけ” ていない → 0
    - 3 ターン目までに “まけ” → -1
    - 3 ターン目で 6 枚目に出して “まけ” → -1
  - 「さつじんはん以外が全員まけ」：その全員 -1
  - 終了推奨は「プレイヤー数ラウンド」または「5 点先取」（設定で変えられる）。

## カード定義（基本）
- カード定義: `CardDef { defId, name, kind, needsPrompt, description }`。実体は `CardInstance { id, defId }`。
- 効果は `server/game/cards/*.ts` 相当の関数で実装。
- 基本カード
  - さつじんはん x1: MVP では 3 ターン目に出たらラウンド終了トリガー。
  - ころす x4（攻撃）: 左右の隣を対象（2 人なら相手固定）。手番終了時、対象が “まけ”。
  - きまぐれ x4（攻撃）: 対象を選ぶ。対象の手札が 0 になった時点で攻撃ゾーンにあれば “まけ”。
  - こうかん x4（移動）: 誰かと 1 枚交換。最後の 1 枚に使った場合は無効。
  - みんな いっしょ x4（イベント）: 左右どちらか選び、その方向に全員 1 枚裏で渡す。最後の 1 枚に使った場合は自分は渡さない。
  - せきにんてんか x4（移動）: 自分の攻撃ゾーンの「ころす/きまぐれ（＋拡張攻撃）」を全て次の人に移す。
  - めんぴ x4（拒否）: 直前に受けた攻撃カード群をキャンセルし、攻撃ゾーンから除去して捨て札へ。
- 後回しカード（くちどめ等）は `config.enableAdvancedCards` で OFF 可能。

## 型の方針
- 公開情報と非公開情報を分ける。PublicState は手札の中身を含めず handCount のみ。PrivateState は手札を含む。
- 型例: PlayerId, CardDef, CardInstance, GameState, PublicState, PrivateState, LogEntry, PromptRequest。

## 受け入れ条件
- 2+人で同じルームに入り同期する。
- 手札は本人のみ可視、他人には handCount のみ。
- 宣言制約（1/2/3 の重複不可）を守る。
- 不正操作をサーバーが拒否し error を返す。
- 3 ターン進行し、ラウンド終了で得点加算。
