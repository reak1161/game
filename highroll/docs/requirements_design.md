# ハイロール 要件定義書 + 設計書（v0.3 / VSCode & Codex向け）

本書は「ハイロール（High Roll）」の**要件（WHAT）**と**設計（HOW）**を1ファイルで記述したものです。
- プレイ人数：2–8（推奨4–5） / 目的：**自分以外の全滅**
- ランダム：山札のみ（ダイス等なし）
- 非公開：手札 / 公開：HP, TempHP, 追加トークン, 設置, コイン, マーケット
- 目標プレイ時間：12–18分（4–5人）

## 1. キーコンセプト
- **追加トークン（恒久）**：Atk/Def/Spe/Braに加算（被ダメでは消費しない）
- **ブースト（一時）**：ターン終了で消滅（例：攻撃+X）
- **TempHP（オーバーヒール）**：上限超過分。ダメージは TempHP→HP の順に減る
- **マーケット**：公開0–3枚。開始時は1枚のみ

## 2. セットアップ
1) ロールを1つ選択（ランダム可）。基礎パラメータ（hp/atk/def/spe/bra）は公開  
2) 山札を構成してシャッフル（**デッキ構成はカスタム** / 既定は合計60）  
3) 各自手札3枚 / **マーケット1枚**公開で開始  
4) 手番順（ラウンド開始時）：**Spe合計（基礎+トークン）降順**

## 3. ラウンド/ターン
- ラウンド＝全員が1回ずつ手番
- 各手番：**ドロー → 行動（最大Bra回） → ロール攻撃**

### 3.1 ドロー（いずれか1つ）
- 山札から1枚引く
- マーケットから**購入**（コイン≥コスト）
- マーケットへ**売却**（空きがある時のみ）：カードを公開で置き、**コイン=半額（切り捨て）**
- **マーケットが0枚**になった瞬間、**自動で1枚だけ補充**

### 3.2 行動（最大Bra回）
- カード使用（skill / install / boost）
- **ロール攻撃がBra消費かはトグル**（既定:false）

### 3.3 ロール攻撃（手番終了時に1回）
- 対象1人にダメージ  
  \( D = \max(1, (Atk+atkTokens+atkBoost) - (Def+defTokens+defBoost)) \)
- 反射/自傷などの特殊処理はカード/ロール能力に従う

### 3.4 行動順の割り込み
- ラウンド中にSpeが上下した場合、**現在の効果解決後**に、**未行動の集合**でSpe降順へ再並び替え（同値は `initOrder`）

## 4. 回復
- 既定：**上限まで**（maxHPを超えない）
- `allowOverheal: true` の効果は**超過分をTempHP**へ付与（自然消失なし）

## 5. ルールトグル（rules.json）
```json
{
  "roleAttackConsumesBra": false,
  "marketMax": 3,
  "marketRefillWhenZero": true,
  "sellPayout": "half_floor",
  "allowOverhealTempHP": true,
  "tempHpDecayAtEndRound": false
}
```

## 6. ロール（roles.json 抜粋）
> 下記は `data/roles.json` を参照（完全版はファイルに同梱）

- 疾風（swiftwind）：攻撃後Spe+1。Speが15以降の5刻みを跨ぐたびBra+1。被ダメ前にSpeトークンを消費し軽減可  
- 憤怒（anger）：受けたダメージ分だけAtkトークン+1  
- 怪物（monster）：残り2人になった瞬間、最大HP=1に固定（現在HPも最低1に調整）  
- 爆弾（bomb）：与ダメ半分を自傷／被ダメ半分を反射（いずれも切り捨て）

## 7. 共有型（TypeScript）
```ts
export type PID = string;
export type CardID = string;
export type RoleID = string;

export interface RoleParams { hp: number; atk: number; def: number; spe: number; bra: number; }
export interface Role { id: RoleID; name: string; params: RoleParams; text: string; tags?: string[] }

export type CardKind = "skill" | "install" | "boost";
export interface Effect
  = { type: "atkBuff"; value: number; scope: "turn" | "permanent" }
  | { type: "defBuff"; value: number; scope: "turn" | "permanent" }
  | { type: "speBuff"; value: number; scope: "permanent" }
  | { type: "braBuff"; value: number; scope: "permanent" }
  | { type: "heal"; value: number; allowOverheal?: boolean }
  | { type: "pierce"; value: number }
  | { type: "gainCoin"; value: number }
  | { type: "marketDiscount"; value: number }
  | { type: "scry"; count: number; keep: number }
  | { type: "extraAction"; value: 1 }
  | { type: "maxHpBuff"; value: number; scope: "round" | "permanent" };

export interface Card { id: CardID; name: string; cost: number; kind: CardKind; unique?: boolean; text: string; effects: Effect[]; tags?: string[] }

export interface Rules {
  roleAttackConsumesBra: boolean;
  marketMax: 3;
  marketRefillWhenZero: boolean;
  sellPayout: "half_floor";
  allowOverhealTempHP: boolean;
  tempHpDecayAtEndRound: boolean;
}
```

## 8. 受入テスト（Gherkin 抜粋）
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

## 9. リポジトリ構成（推奨）
```
hiroll/
  docs/requirements_design.md
  data/roles.json
  data/roles_compiled.json
  data/rules.json
  data/cards.json                 # 後日追加
  data/decklist.default_60.json   # 後日追加
  src/shared/types.ts
  src/server/index.ts
  .vscode/{settings.json,tasks.json,launch.json}
```
