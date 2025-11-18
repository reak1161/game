# カード部門 作業メモ & 仕様書 v0.2

カード制作や `data/cards.json` 更新時の手順とテンプレートをまとめる。

---

## 1. 制作ワークフロー
1. **アイデア整理**
   - 目的 (直接ダメージ / 防御補助 / 設置 / 経済) を明確化。
   - 影響するリソース (HP, TempHP, トークン, Bra, 行動回数, コイン) を列挙。
2. **効果マッピング**
   - 既存テンプレート (3章) で表現できるかを確認。
   - 対象と条件 (self / chosen_enemy / 〜以上 etc.) を決定。
3. **JSON 定義**
   - `id`: 英小文字 + `_`。`kind`: `"skill" | "install" | "boost"`.
   - `effects` は上から順に解決。条件がある場合は `condition` を付与。
   - `text` は UI 表示用に 1-2 行で記述。
4. **ローカルテスト**
   - `npm run dev:server` / `npm run dev:client` で実際にプレイして確認。
   - `tests/server/engine.test.ts` に回帰テストを追加する (ダメージ計算や制御効果など)。
5. **ドキュメント更新**
   - 本ファイルと `docs/requirements_design.md` を必要に応じて更新し、仕様と実装差分をなくす。

---

## 2. JSON スキーマ概要
```jsonc
{
  "id": "jab",
  "name": "ジャブ",
  "category": "attack",
  "kind": "skill",
  "cost": 1,
  "text": "好きなプレイヤー1人に3ダメージ（Defで軽減）",
  "effects": [
    {
      "trigger": "onPlay",
      "type": "dealDamage",
      "target": "chosen_enemy",
      "value": 3,
      "defApplied": true
    }
  ],
  "tags": ["attack","simple"]
}
```

| フィールド | 説明 |
| --- | --- |
| `category` | UI 表示用の分類。自由文字列。 |
| `kind` | `"skill"` = 使い切り, `"install"` = 設置, `"boost"` = そのターンのみ。 |
| `unique` | true ならプレイヤーごとに 1 枚制限。 |
| `effects` | 下記の `CardEffect` を順番に解決。 |

---

## 3. サポート済み CardEffect
| type | 主なフィールド | 説明 |
| --- | --- | --- |
| `dealDamage` | `target`, `value` or `formula`, `defApplied`, `ignoreDef` | 単体/全体ダメージ。`formula` 例: `{ "type": "selfStatHalf", "stat": "def" }`. |
| `addStatToken` | `stat`, `value` or `valueFormula`, `target` | Atk/Def/Spe/Bra のトークンを追加。`valueFormula` で Spe/3 などを指定可能。 |
| `discardAllHand` | `target`, `condition.targetHandCountAtLeast` | 対象の手札を全て捨て札へ。 |
| `doubleBaseStat` | `playerChoice`, `exclude` | 基礎ステータスを倍化。HP を除外する場合は `exclude: ["hp"]`。 |
| `thresholdPrevent` | `operator`, `threshold`, `preventAll`, `sacrificeSelf` | インストールカード向けのダメージ軽減。 |
| `cheatDeathAtFull` | `setHpTo`, `sacrificeSelf` | インストール破壊で致死ダメージを 1 に抑える。 |
| `forceDiscardEquip` / `gainAtkBoostTurn` / `selfDestroy` | ロール攻撃後の追加処理用 (例: 装備破壊)。 |
| `modifyTurnOrder` | `mode`, `duration` | Spe 逆順など、ターン順を操作。 |

### Target キーワード
`self`, `chosen_enemy`, `chosen_player`, `all_players`, `defender`.

### choices オブジェクト
UI がプレイヤー選択・ステータス選択を行う際に `choices` で指定。例: `{ "stat": "atk" }`.

### Optional 効果
- 任意で発動する効果には `optional: true` を付与し、クライアントがユーザーに確認してから `choices.optionalEffects` に実行したい effect の index (0-based) を渡す。
- 指定しない場合、その効果はスキップされる。

---

## 4. サーバー側処理
1. クライアントが `/api/matches/:id/play` に `playerId`, `cardId`, `targets?`, `choices?` を POST。
2. `GameEngine.playCard` が手札を更新し、Bra を消費。
3. `resolveCardEffects` が `effects` を順番に処理。ダメージは `applyDamageToPlayer` が HP / TempHP / defeat を管理。

悪あがき・ロール攻撃は `/api/matches/:id/roleAttack` で処理され、`logs` に記録される。

---

## 5. 注意点
- 文字コードは UTF-8。コメントアウトした JSON (//) をコミットしない。
- 市場やコイン系のカード効果は現在未実装。必要ならサーバーの `GameEngine` に type を追加する。
- テキスト表現 (name/text) は英語でも構わないが、UI で読みやすいよう 20 文字以内を目安にする。
- カード追加後は `npm test -- engine` でユニットテストを流し、最低限の回帰を確認する。

---

## 6. TODO / 拡張案
- 反射ダメージや継続ダメージなどロール固有挙動へのフック追加。
- コイン / マーケット操作カード (`gainCoin`, `marketDiscount`) のサポート。
- インストールカードの UI 表示 (現状は内部ステートのみ)。

---

カード制作に関わる全員はこのドキュメントと `requirements_design.md` を参照し、仕様と実装の乖離を防ぐこと。
