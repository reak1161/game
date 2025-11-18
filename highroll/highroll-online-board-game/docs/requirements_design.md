# ハイロール 要件定義書 + 設計書 v0.4

本書はオンラインボEドゲーム「ハイロール (High Roll)」E要件と実裁E針をまとめたドキュメントです。VSCode / Codex での参Eを前提に UTF-8 で記述してぁEす、E
---

## 1. キーコンセプト
- **追加トEクン**: Atk / Def / Spe / Bra に付与できる恒常バフ。被ダメージでは消費しなぁEE- **ブEスチE*: ターン終亁Eまで有効な一時バフ。侁E 「このターン Atk +3」、E- **TempHP**: HP を趁Eて保持できる耐乁E。ダメージは TempHP ↁEHP の頁E減少する、E- **マEケチE**: 常晁E3 枚E開。購入時Eコインを支払い、売却時E半顁E(刁E捨て) を得る。EーケチEが空になった瞬間に 1 枚だけE動補E、E
---

## 2. セチEョンフロー
1. ロール (役職) を選択。各ロールは hp/atk/def/spe/bra を持ち公開される、E2. 共有デチEを構築してシャチEル。既定E 60 枚、E3. 吁EEレイヤーは初期手札3枚、EーケチE1枚を公開でセチE、E4. ラウンド開始時に Spe (基礁EトEクン) の降頁E手番を決定、E
共有デチEが尽きた場合E捨て札をシャチEルして再利用する、E
---

## 3. ラウンチE/ ターン
- ラウンチE= 全員ぁE1 回ずつ手番を行う単位、E- 手番の流れ:
  1. **ドロー**: 山札から 1 枚引くか、EーケチE購入/売却を実行、E  2. **行動**: 最大 Bra 回。カード使用 (skill/install/boost) めEール能力、E  3. **ロール攻撁E*: 手番終亁Eに 1 回だけ実行可能、E
### 3.1 ドロー詳細
- 山札から引く / マEケチE購入 (コイン >= コスチE / マEケチE売却 (空きがある場合Eみ、半額で捨て札送り)、E
### 3.2 行動
- Bra めE1 消費するアクションを最大 Bra 回実行、Era ぁE0 になってもE動でターン終亁EなぁEE- `roleAttackConsumesBra` ぁEtrue の場合、ロール攻撁EE体でめEBra めE1 消費する、E
### 3.3 ロール攻撁E& 悪あがぁE- ダメージ計箁E  
  \( D = \max(1, (Atk + atkTokens + atkBoost) - (Def + defTokens + defBoost)) \)
- Bra >= 1 の場合E **ロール攻撁E* ボタンで攻撁E Bra めE1 消費、E- Bra = 0 の場合E **悪あがぁE* ボタンに変化し、攻撁E決後に自刁EE最大HPの 1/4 (刁E捨て・最佁E) を失ぁE即座にターン終亁EE- 吁Eーン 1 回Eみ。E傷めE封Eどの特殊挙動EカーチEロール能力に従う、E
### 3.4 割り込み
- Spe が手番中に上下した場合E、効果解決後に未行動プレイヤーで頁EをEソーチE(同値は初期頁E、E
---

## 4. 回復
- 既定では最大 HP まで。`allowOverheal: true` の効果E TempHP として蓁Eし、ラウンド終亁Eに減衰しなぁEE- `tempHpDecayAtEndRound` ぁEtrue の場合Eみラウンド終亁Eに TempHP めE0 にする、E
---

## 5. ルールトグル (data/rules.json)
```json
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
- **Swiftwind**: Spe が非常に高く、攻撃のたびに Spe トークンを獲得。15/20/25…を超えると Bra が増え、Spe トークンを消費して被ダメを軽減できる。
- **Anger**: Atk が高い代わりに Def が低い。HP が減るたびに受けたダメージ量に応じて Atk トークンを得る。
- **Monster**: 全ステータスが高いが、残りプレイヤーが 2 人になると最大 HP が 1 になる呪いを受ける。
- **Bomb**: 与ダメージの半分を自傷し、被ダメージの半分を相手にも返すトゲを持つ。
- **Murderer**: キルするたびに Atk/Spe/Bra トークンを獲得し、血塗れの剣とシナジーを持つ。
- **放電**: ターン終了時に余った Bra を蓄電トークンとして保存し、専用ボタンで「放電」を行うと (蓄電^2) の感電トークンを自分以外へ付与。感電トークンは 5 個ごとに対象の Bra を 1 減らし、消費される。
- **医師**: Bra を 1 消費して治療/麻酔/手術/整形のいずれかを実行できるロール。手術は対象の次のターンを休ませ、その次のターン開始時に HP を 15 回復させる。

ロール固有のボタンは Match 画面の「ロール専用アクション」エリアに表示され、Bra コストや対象、整形のステータス選択などを UI から指定できる。放電ロールが参加しているマッチではプレイヤーカードに蓄電/感電トークンも表示される。

データ定義と作業手順は docs/role_workflow_and_spec.md に整理。UI 用テキストは 
oles.json、挙動定義は 
oles_compiled.json を更新すること。

## 7. 共有型 (TypeScript)
`src/shared/types/index.ts` に以下を定義:
- `RoleParams`, `Role`, `CardDefinition`, `EffectCondition`, `CardEffect` など、E- `PlayerRuntimeState` には `hp / tempHp / statTokens / turnBoosts / installs / isDefeated` を保持、E- `GameState` には `sharedDeck`, `sharedDiscard`, `hands`, `braTokens`, `roleAttackUsed`, `logs` を含む、E
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
- Bra ぁE1 以丁E 「ロール攻撁EEタンが有効、Era めE1 消費、E- Bra ぁE0: ボタンが「悪あがき」に変化し、E傷ダメージ後にターン終亁EEra は消費しなぁEE- 攻撁E象はドロチEEダウンで持E。倒れたEレイヤーは選べなぁEE- 行動ログに `roleAttack` イベントを記録し、履歴めEUI に表示、E
---

## 11. Turn Log & Defeat Handling
- サーバEは `logs` に turnStart / cardPlay / roleAttack / playerDefeated を時系列で記録。クライアントE最新 20 件を表示、E- HP <= 0 のプレイヤーは `isDefeated` をセチEしターン頁Eら除外。最後E 1 人になった時点で自動的に `status = finished`、勝老EID を設定、E- プレイヤーカードにホバーすると基礎スチEEタスとトEクン/ブEストE冁E + TempHP をツールチップ表示。脱落老EE赤斁Eで「戦闘不E」を表示、E
---

## 12. 開発メモとの関連
- 進捗E課題E `docs/progress.md` に記録、E- カード制作手頁EEJSON 仕様E `docs/card_workflow_and_spec.md` を参照、E
本ドキュメントE仕様更新のたEに最新化し、エンジン・クライアント実裁E差異がEなぁEぁE期してぁE、E
