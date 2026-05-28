# 超次元バトル - データモデル / イベントモデル

## 1. CardDefinition
```ts
type Attribute = "none" | "fire" | "water" | "ice" | "wind" | "thunder" | "earth" | "dark";
type CardType = "attack" | "spell" | "ability";
type EffectTiming = "activate" | "placed" | "consume" | "enchant";

type CardDefinition = {
  id: string;
  name: string;
  type: CardType;
  attribute: Attribute;
  timings: EffectTiming[];
  text: string;
  effects: EffectDefinition[];
  tags?: string[];
};
```

## 2. RoleDefinition
```ts
type RoleDefinition = {
  id: string;
  name: string;
  description: string;
  initialBaseAttack: number;
  initialBaseMagic: number;
  passiveEffects: EffectDefinition[];
  restrictions?: {
    disallowCardTypes?: CardType[];
  };
};
```

## 3. GameState
```ts
type GameState = {
  gameId: string;
  round: number;
  phase: "setup" | "draw" | "mulligan" | "place" | "resolve" | "final_attack" | "round_end" | "finished";
  players: PlayerState[];
  rngSeed: string;
  log: EngineLogEntry[];
  replayEvents: ReplayEvent[];
};
```

## 4. PlayerState
```ts
type PlayerState = {
  playerId: string;
  displayName: string;
  roleId: string;
  baseAttack: number;
  baseMagic: number;
  tempAttack: number;
  tempMagic: number;
  hand: CardInstance[];
  field: CardInstance[];
  discard: CardInstance[];
  scoreThisRound: number;
  totalScore: number;
  statusFlags: string[];
  oncePerRound: {
    mulliganUsed: boolean;
  };
};
```

## 5. CardInstance
```ts
type CardInstance = {
  instanceId: string;
  definitionId: string;
  ownerPlayerId: string;
  zone: "deck" | "hand" | "field" | "discard" | "removed";
  fieldIndex?: number;
  isInvalidated?: boolean;
  enchantments: EnchantmentInstance[];
  counters?: Record<string, number>;
  derived?: Record<string, number | string | boolean>;
};
```

## 6. EffectDefinition
```ts
type EffectDefinition = {
  id: string;
  timing: "activate" | "placed" | "consume" | "enchant";
  trigger?: TriggerDefinition;
  condition?: ConditionDefinition;
  operations: OperationDefinition[];
};
```

## 7. ReplayEvent
```ts
type ReplayEvent =
  | { type: "ROUND_START"; round: number }
  | { type: "CARD_ACTIVATED"; playerId: string; instanceId: string; attribute: Attribute; chainCount: number }
  | { type: "STATUS_CHANGED"; playerId: string; baseAttack: number; baseMagic: number; tempAttack: number; tempMagic: number }
  | { type: "CARD_CREATED"; playerId: string; instanceId: string; definitionId: string; fieldIndex: number }
  | { type: "CARD_DESTROYED"; playerId: string; instanceId: string }
  | { type: "CARD_INVALIDATED"; playerId: string; instanceId: string }
  | { type: "ENCHANT_APPLIED"; playerId: string; instanceId: string; enchantId: string }
  | { type: "DAMAGE_DEALT"; playerId: string; amount: number; source: string }
  | { type: "FINAL_ATTACK"; playerId: string; amount: number }
  | { type: "ROUND_END"; round: number };
```

## 8. EngineLogEntry
```ts
type EngineLogEntry = {
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  code: string;
  message: string;
  meta?: Record<string, unknown>;
};
```

## 9. SubmittedRoundData
```ts
type SubmittedRoundData = {
  round: number;
  selectedHandIndexesToDiscard: number[];
  placements: {
    handInstanceId: string;
    order: number;
  }[];
};
```

## 10. UI/演出向け補足
ReplayEvent は演出レイヤーから扱いやすいことを優先する。  
ゲーム状態を直接覗かずとも、イベント列だけで最低限の演出再生ができるようにする。

### 例
- `CARD_ACTIVATED` -> カード発光 + 属性パーティクル + 効果音
- `STATUS_CHANGED` -> 数値ポップ
- `DAMAGE_DEALT` -> ダメージ演出
- `FINAL_ATTACK` -> 大きめの集約演出

## 11. サンプルカード定義（パンチ）
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
      "operations": [
        { "kind": "multiply_temp_attack", "value": 2 },
        { "kind": "deal_damage_from_temp_attack" }
      ]
    }
  ]
}
```
