# ハイロール 要件定義書 + 設計書 v0.4

本書はオンラインボードゲーム「ハイロール (High Roll)」の要件と実装指針をまとめたドキュメントです。VSCode / Codex での編集を前提に UTF-8 で記述しています。
---

## 1. キーコンセプト
- **追加トークン**: Atk / Def / Spe / Bra に付与できる恒常バフ。被ダメージでは消費されず、ステータス合計に加算される。
- **ブースト**: ターン終了まで有効な一時バフ。例: 「このターン Atk +3」。ターンが終わると自動的にリセットされる。
- **TempHP**: HP を超えて保持できる耐久力。ダメージは TempHP → HP の順で減少する。
- **マーケット**: 常に公開 3 枚。購入時はコインを支払い、売却時は半額 (切り捨て) を得る。マーケットが空になった瞬間に 1 枚だけ自動補充される。
---

## 2. セッションフロー
1. ロール (役職) を選択。各ロールは hp/atk/def/spe/bra が公開される。
2. 共有デッキを構築してシャッフル。既定は 60 枚。
3. 各プレイヤーは初期手札 3 枚、マーケット 1 枚を公開でセット。
4. ラウンド開始時に Spe (基礎トークン) の降順で手番を決定。
5. 共有デッキが尽きた場合は捨て札をシャッフルして再利用する。
---

## 3. ラウンド / ターン
- ラウンド = 全員が 1 回ずつ手番を行う単位。
- 手番の流れ:
  1. **ドロー**: 山札から 1 枚引くか、マーケット購入 / 売却を実行。
  2. **行動**: 最大 Bra 回。カード使用 (skill/install/boost) やロール能力を実行。
  3. **ロール攻撃**: 手番終了時に 1 回だけ実行可能。

### 3.1 ドロー詳細
- 山札から引く / マーケット購入 (コイン >= コスト) / マーケット売却 (空きがある場合のみ、半額で捨て札送り)。

### 3.2 行動
- Bra を 1 消費するアクションを最大 Bra 回実行する。Bra が 0 になっても自動でターン終了しない。
- `roleAttackConsumesBra` が true の場合、ロール攻撃自体でも Bra を 1 消費する。

### 3.3 ロール攻撃 & 悪あがき
- ダメージ計算:  \
  \( D = \max(1, (Atk + atkTokens + atkBoost) - (Def + defTokens + defBoost)) \)
- Bra >= 1 のとき **ロール攻撃** ボタンで攻撃し Bra を 1 消費。
- Bra = 0 のとき **悪あがき** ボタンに変化し、攻撃後に自分の最大 HP の 1/4 (切り捨て・最低 1) を失い直ちにターン終了。Bra は消費しない。
- 手番につき 1 回のみ。被ダメージ封じなどの特殊挙動はカードやロール能力に従う。

### 3.4 割り込み
- Spe が手番中に上下した場合、効果解決後に未行動プレイヤーで順番をリソート (同値は初期順)。
---

## 4. 回復
- 既定では最大 HP まで回復。
- `allowOverheal: true` の効果は TempHP として蓄積し、ラウンド終了時に減衰しない。
- `tempHpDecayAtEndRound` が true の場合はラウンド終了時に TempHP を 0 にする。
---

## 5. ルールトグル (data/rules.json)
```
{
  "roleAttackConsumesBra": true,
  "marketMax": 3,
  "marketRefillWhenZero": true,
  "sellPayout": "half_floor",
  "allowOverhealTempHP": true,
  "tempHpDecayAtEndRound": false
}
```
---

## 6. ロール抜粋 (data/roles.json / roles_compiled.json)
- **Swiftwind**: Spe が非常に高く、攻撃するたび Spe トークンを獲得。5/20/25…を越えると Bra が増え、Spe トークンを消費して被ダメージを軽減できる。
- **Anger**: Atk が高い代わりに Def が低い。HP が減るたびに受けたダメージ量に応じて Atk トークンを得る。
- **Monster**: 全ステータスが高いが、残りプレイヤーが 2 人になると最大 HP が 1 になる呪いを受ける。
- **Bomb**: 与ダメージの半分を追撃し、被ダメージの半分を相手にも返すトゲ効果を持つ。
- **Murderer**: キルするたびに Atk/Spe/Bra トークンを獲得し、血塗れの剣とシナジーを持つ。
- **放電**: ターン終了時に余った Bra を蓄電トークンとして保存。専用ボタンで「放電」を行うと (蓄電^2) の感電トークンを周囲へ付与。感電トークンは 5 個ごとに対象の Bra を 1 減らし消費される。
- **医師**: Bra を 1 消費して治療 / 麻酔 / 手術 / 整形のいずれかを実行できる。手術は対象の次のターンを休ませ、その次のターン開始時に HP を 15 回復させる。

ロール固有のボタンは Match 画面の「ロール専用アクション」エリアに表示され、Bra コストや対象指定、整形用のステータス選択などを UI から操作できる。放電ロールが参加しているマッチではプレイヤーカードに蓄電 / 感電トークンも表示される。

docs/role_workflow_and_spec.md に手順をまとめているので、roles.json を変更した際は roles_compiled.json も忘れず更新する。
---

## 7. 共有型 (TypeScript)
`src/shared/types/index.ts` に以下を定義する。
- `RoleParams`, `Role`, `CardDefinition`, `EffectCondition`, `CardEffect` など。
- `PlayerRuntimeState` には `hp / tempHp / statTokens / turnBoosts / installs / isDefeated` を保持する。
- `GameState` には `sharedDeck`, `sharedDiscard`, `hands`, `braTokens`, `roleAttackUsed`, `logs` を含める。
---

## 8. Acceptance Tests (Gherkin)
```
Scenario: Market auto-refill only when becomes empty
  Given market has 1 card
  When a player buys the only market card
  Then market becomes 0 cards
  And exactly 1 card is drawn into market
```
```
Scenario: Recompute next actor after Spe change
  Given order A(10) -> B(9) -> C(8)
  When B gains +3 Spe during A's turn
  And A's effect resolves
  Then next actor is B
```
---

## 9. Repository Layout (recap)
```
hiroll/
  docs/{requirements.md, requirements_design.md, progress.md, ...}
  data/{roles.json, roles_compiled.json, rules.json, cards.json, decklist.default_60.json}
  src/shared/...
  src/server/...
  src/client/...
  tests/server/...
```
---

## 10. Role Attack & Struggle UX
- Bra が 1 以上のとき「ロール攻撃」ボタンが有効。押下で Bra を 1 消費し行動ログに `roleAttack` を記録。
- Bra が 0 のときボタンが「悪あがき」に変化し、使用後に自傷ダメージを受けた上でターン終了する (Bra 消費なし)。
- 攻撃対象はドロップダウンで選択。倒れたプレイヤーは選べない。
- 行動ログは UI の履歴に表示し、観戦者も参照できる。
---

## 11. Turn Log & Defeat Handling
- サーバーは `logs` に turnStart / cardPlay / roleAttack / playerDefeated を時系列で記録。クライアントは最新 20 件を表示する。
- HP <= 0 のプレイヤーは `isDefeated` を設定しターン順から除外。最後の 1 人になった時点で自動的に `status = finished`、勝者 ID を設定する。
- プレイヤーカードにホバーすると基礎ステータスとトークン/ブースト/TempHP をツールチップ表示。脱落者は赤色で「戦闘不能」を表示する。
---

## 12. 開発メモとの関連
- 進捗や課題は `docs/progress.md` に記録する。
- カード制作手順と JSON 仕様は `docs/card_workflow_and_spec.md` を参照する。
- 本ドキュメントは仕様更新のたびに最新化し、エンジン・クライアント実装差異がないよう維持する。
---

## 13. マッチ画面 UI 指針
- 手札カードは 1 枚あたり幅 180px・高さ 150px を基準とし、テキスト量やホバー中の挙動に関わらず表示サイズが変動しないよう `min-height` と固定幅を持たせる。
- カードボタン内部は縦方向のフレックスでカテゴリ／名称／コストを配置し、共通の余白と行間を維持する。
- 手札コンテナはフレックスレイアウトで折り返しを許容しつつ、カード幅は一定のまま等間隔に並べる。
- UI を変更した場合は本ドキュメントへ UTF-8 で追記し、ガイドラインと実装の差異が出ないようにする。
