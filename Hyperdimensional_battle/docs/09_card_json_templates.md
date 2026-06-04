# 超次元バトル - カード定義JSON雛形

## 1. 目的
本書は、Codex がカード追加をデータ定義で行えるようにするための JSON 雛形集である。

## 2. 基本スキーマ
```json
{
  "id": "string",
  "name": "string",
  "type": "attack | spell | ability",
  "attribute": "none | fire | water | ice | wind | thunder | earth | dark",
  "timings": ["activate"],
  "text": "カード説明文",
  "effects": [
    {
      "id": "string",
      "timing": "activate | placed | consume | enchant",
      "trigger": null,
      "condition": null,
      "operations": []
    }
  ],
  "tags": []
}
```

## 2.1 変動数値の内部記法
- 将来的に数値が変動する箇所は、内部向けの目印として `{{...}}` を使ってよい
- 例: `発動: 通常攻撃{{+10}}、その後ダメージを与える`
- `+` や `×` まで含めてまとめて囲む
- UI では `{` `}` 自体は表示せず、従来どおり背景プレートだけを出す
- `1枚につき` や `5回` のような回数・位置参照は、変動しないなら囲まない

## 2.2 変動数値の用語
- `数値（ノーマル数値）`
  - カード本体に書かれた変動数値のうち、確率数値を除いたもの
  - `+10` / `×2` / `×1.5` を含む
  - `風まとい` に書かれた `+10` や `×2` はここに含む
- `確率数値`
  - カード本体に書かれた変動数値のうち、確率に関するもの
- `カード数値`
  - カード本体に書かれた変動数値全体
  - `数値（ノーマル数値） + 確率数値`
- `エンチャント数値`
  - 付与されているエンチャントに書かれた変動数値
  - `きらめく雪景色` 自体に書かれた `×2` はここに含む
- `ステータス数値`
  - `数値（ノーマル数値） + エンチャント数値`
- `数値全体`
  - `カード数値 + エンチャント数値`

## 2.3 数値変動の原則
- カードの数値を増減させる効果は、原則としてカード数値だけを変動させる
- エンチャント数値は別管理とし、カード数値の増減では変動しない
- エンチャント数値を変動させたい場合は、その意図をカード文・効果定義で明示する
- 「どこに書かれている変動数値か」と「その効果が何を変動させるか」は別に考える
- 例:
  - `きらめく雪景色` に書かれた `×2` はエンチャント数値
  - ただし、その効果が変動させる対象はステータス数値
  - `風まとい` に書かれた `+10` や `×2` は数値（ノーマル数値）
  - その効果が変動させる対象もステータス数値

## 2.4 変動数値タグ
- `textValueBindings` には、処理側で意味を判断しやすくするための補助タグを持たせてよい
- 最小構成では、次の 2 つを使う
  - `writtenValueKind`
    - その値が「どこに書かれている変動数値か」
    - `normal | probability | enchant`
  - `affectsValueKind`
    - その効果が「何を変動させる対象か」
    - `normal | probability | enchant`
- これらは表示用ではなく、仕様整理・将来の処理分岐用の内部タグである

### 例
```json
{
  "textValueBindings": [
    {
      "effectId": "wind_kazematoi_round_end",
      "operationIndex": 0,
      "occurrence": 0,
      "writtenValueKind": "normal",
      "affectsValueKind": "normal"
    }
  ]
}
```

```json
{
  "textValueBindings": [
    {
      "effectId": "enchant_kirameku_yukigeshiki_effect",
      "operationIndex": 0,
      "occurrence": 0,
      "writtenValueKind": "enchant",
      "affectsValueKind": "normal"
    }
  ]
}
```

## 3. Operation の例
```json
{ "kind": "add_base_attack", "value": 30 }
{ "kind": "add_base_magic", "value": 30 }
{ "kind": "add_base_both", "value": 15 }
{ "kind": "multiply_temp_attack", "value": 2 }
{ "kind": "multiply_temp_magic", "value": 2 }
{ "kind": "multiply_temp_both", "value": 2 }
{ "kind": "deal_damage_from_temp_attack" }
{ "kind": "deal_damage_from_temp_magic" }
{ "kind": "deal_damage_from_max_temp_stat" }
{ "kind": "destroy_target", "target": "one_ally_field_card" }
{ "kind": "invalidate_right_cards" }
{ "kind": "create_token", "tokenDefinitionId": "water_aqua", "position": "right_of_self", "count": 1 }
{ "kind": "apply_enchant", "target": "one_ally_field_card", "enchantDefinitionId": "enchant_attack_plus_10" }
{ "kind": "set_continuous_multiplier", "attribute": "fire", "tempStatMultiplier": 3 }
```

## 4. サンプル: パンチ
```json
{
  "id": "none_punch",
  "name": "パンチ",
  "type": "attack",
  "attribute": "none",
  "timings": ["activate"],
  "text": "発動: 自分の一時攻撃×2、その後ダメージを与える",
  "effects": [
    {
      "id": "none_punch_activate",
      "timing": "activate",
      "trigger": null,
      "condition": null,
      "operations": [
        { "kind": "multiply_temp_attack", "value": 2 },
        { "kind": "deal_damage_from_temp_attack" }
      ]
    }
  ],
  "tags": ["starter"]
}
```

## 5. サンプル: はどうだん
```json
{
  "id": "none_hadou",
  "name": "はどうだん",
  "type": "spell",
  "attribute": "none",
  "timings": ["activate"],
  "text": "発動: 自分の一時魔法×2、その後ダメージを与える",
  "effects": [
    {
      "id": "none_hadou_activate",
      "timing": "activate",
      "trigger": null,
      "condition": null,
      "operations": [
        { "kind": "multiply_temp_magic", "value": 2 },
        { "kind": "deal_damage_from_temp_magic" }
      ]
    }
  ],
  "tags": ["starter"]
}
```

## 6. サンプル: 筋トレ
```json
{
  "id": "none_kintore",
  "name": "筋トレ",
  "type": "ability",
  "attribute": "none",
  "timings": ["activate"],
  "text": "発動: 基礎攻撃+30",
  "effects": [
    {
      "id": "none_kintore_activate",
      "timing": "activate",
      "trigger": null,
      "condition": null,
      "operations": [
        { "kind": "add_base_attack", "value": 30 }
      ]
    }
  ],
  "tags": ["starter"]
}
```

## 7. サンプル: ハイブリッド
```json
{
  "id": "none_hybrid",
  "name": "ハイブリッド",
  "type": "ability",
  "attribute": "none",
  "timings": ["activate"],
  "text": "発動: 基礎ステータス+15",
  "effects": [
    {
      "id": "none_hybrid_activate",
      "timing": "activate",
      "trigger": null,
      "condition": null,
      "operations": [
        { "kind": "add_base_both", "value": 15 }
      ]
    }
  ],
  "tags": ["starter"]
}
```

## 8. サンプル: 焼却処分
```json
{
  "id": "fire_shoukyaku",
  "name": "焼却処分",
  "type": "ability",
  "attribute": "fire",
  "timings": ["consume"],
  "text": "消費: 自分の場のカードを1枚選び、破壊する。破壊したなら基礎ステータス×2",
  "effects": [
    {
      "id": "fire_shoukyaku_consume",
      "timing": "consume",
      "trigger": null,
      "condition": null,
      "operations": [
        { "kind": "destroy_target", "target": "one_ally_field_card" },
        { "kind": "multiply_base_both_if_last_destroy_succeeded", "value": 2 }
      ]
    }
  ],
  "tags": ["fire", "starter"]
}
```

## 9. サンプル: ビルドアップ + エンチャント
```json
{
  "id": "none_buildup",
  "name": "ビルドアップ",
  "type": "ability",
  "attribute": "none",
  "timings": ["consume"],
  "text": "消費: 自分の場のカード1つにエンチャント『攻撃強化10』を付与する",
  "effects": [
    {
      "id": "none_buildup_consume",
      "timing": "consume",
      "trigger": null,
      "condition": null,
      "operations": [
        {
          "kind": "apply_enchant",
          "target": "one_ally_field_card",
          "enchantDefinitionId": "enchant_attack_plus_10"
        }
      ]
    }
  ],
  "tags": ["starter"]
}
```

```json
{
  "id": "enchant_attack_plus_10",
  "name": "攻撃強化10",
  "type": "ability",
  "attribute": "none",
  "timings": ["enchant"],
  "text": "発動: 基礎攻撃+10",
  "effects": [
    {
      "id": "enchant_attack_plus_10_effect",
      "timing": "enchant",
      "trigger": {
        "kind": "when_host_card_activates"
      },
      "condition": null,
      "operations": [
        { "kind": "add_base_attack", "value": 10 }
      ]
    }
  ],
  "tags": ["enchant"]
}
```

## 10. 役職JSON雛形
```json
{
  "id": "role_simple",
  "name": "シンプル",
  "description": "毎ラウンド7枚まで配置できるようになる",
  "initialBaseAttack": 50,
  "initialBaseMagic": 50,
  "passiveEffects": [
    {
      "id": "role_simple_passive",
      "timing": "placed",
      "trigger": null,
      "condition": null,
      "operations": [
        { "kind": "set_round_placement_limit", "value": 7 }
      ]
    }
  ],
  "restrictions": {}
}
```
## 11. 設置効果の実装メモ
- `timing: "placed"` で他カードへ持続的に作用する効果は、ソースカードが場から消えたら消える前提で設計する。
- その種の効果は、対象カードの `counters` や `numericValueMultiplier` を恒久的に直接書き換えない。
- 推奨:
- `derived` に一時値を積む
- persistent aura として毎回再計算する
- 非推奨:
- `placed` 効果の解決時に一度だけ他カードの実数値を焼き込むこと
- 例:
- `transform_all_non_attribute_allies_to_attribute`
- `apply_enchant_to_adjacent_cards`
- `apply_enchant_to_all_ally_field_cards`
- これらは「場にいる間だけ有効」になっているかを実装時に必ず確認する。
