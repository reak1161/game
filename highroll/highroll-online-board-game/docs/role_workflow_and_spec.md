# ロール部門 作業メモ & 仕様書 v0.2

本ドキュメントはロール制作のフローと `data/roles*.json` の書き方をまとめたリファレンスです。カード仕様書 (`docs/card_workflow_and_spec.md`) と同じく、実装とドキュメントを同期させるために参照してください。

---

## 1. 制作ワークフロー
1. **コンセプト整理**: 戦術上の役割 (先手奪取、防御、支援など) と消費リソースを洗い出し、Bra/行動回数との噛み合わせを考える。
2. **基礎パラメータ決定**: `hp / atk / def / spe / bra` を決めて既存ロールとの差別化ポイントを明文化する。
3. **能力モデリング**:
   - `roles.json` にプレイヤー向けテキストを記載。
   - `roles_compiled.json` に挙動ロジック (abilities / roleActions / 条件) を JSON で定義。
4. **データ反映と検証**: JSON を更新後 `npm run typecheck` で型エラーが無いことを確認し、必要に応じて `docs/requirements_design.md` / 本ファイルを更新する。
5. **テスト**: `tests/server/engine.test.ts` にロール固有のケースを追加し `npm test` を実行。UI の追加ボタンなどは Match 画面で手動確認する。
6. **進捗ログ**: 作業内容は `docs/progress.md` に追記し、他チームへ共有する。

---

## 2. データ構成
- `data/roles.json`: UI 表示用 (名称・説明・タグ・基礎パラメータ)。
- `data/roles_compiled.json`: エンジンが解釈する挙動定義 (abilities / roleActions / condition)。コメント付き JSON を許容し、`getRolesCatalog` が `roles.json` とマージする。
- すべてのロールは `id` で一意にし、`src/shared/types/index.ts` の `Role` 型に準拠させる。

---

## 3. Ability スキーマ概要
Ability は `trigger` + `actions` の組み合わせで、基本テンプレートは以下。

```jsonc
{
  "id": "swiftwind_gain_spe_on_attack",
  "trigger": "afterRoleAttack",
  "condition": { "stat": "spe" },
  "playerChoice": {
    "spendStatToken": { "stat": "spe", "min": 0, "max": "any" }
  },
  "actions": [
    { "addStatToken": { "stat": "spe", "value": 1 } }
  ],
  "text": "攻撃後 Spe トークン +1"
}
```

| フィールド | 説明 |
| --- | --- |
| `trigger` | 発火タイミング。`afterRoleAttack / beforeDamageTaken / onKill / ...` |
| `condition` | ステータス・プレイヤー条件 (stat, threshold, alivePlayers など)。|
| `playerChoice` | 自動解決時に必要な選択 (現状はトークン消費のみ)。|
| `actions` | 実行する処理の配列。`addStatToken`, `selfDamage`, `setHp`, `dealDamageToSource` 等を順に解決。|

値は数値のほか、`{"from": "damageTaken"}` や `{"ratioOf": "damageDealt", "ratio": 0.5, "round": "floor"}` を指定可能。

---

## 4. サーバー側処理メモ
1. クライアントが `/api/matches/:id/play` や `/roleAction` を呼び出す。
2. `GameEngine` は `playCard` / `roleAction` で Bra を消費し、カードやロールアクションの効果を解決する。
3. `resolveCardEffects` → `applyCardEffect` が Ability と同じヘルパー (`applyDamageToPlayer`, `addStatTokensToPlayer`, `mutateBaseStat`) を利用。
4. ログ (`logs`) には `turnStart / cardPlay / roleAttack / roleAction / playerDefeated` を記録し、クライアントは最新 20 件を表示する。

---

## 5. テスト & ドキュメント更新
- 新しい挙動を追加したら `tests/server/engine.test.ts` にカバレッジを用意する (蓄電 → 放電、医師の手術など)。
- UI の説明文が増えた場合は `roles.json` および `docs/requirements_design.md` を更新する。
- ワークフロー本文は必ず UTF-8 で保存し、文字化け防止のため PowerShell から `Set-Content -Encoding utf8` を使用すること。

---

## 6. ロールアクションの実装メモ
- 共通定義は `src/shared/roleActions.ts`。`id / label / costBra / requiresTarget / choices` を記述する。
- サーバー側は `GameEngine.roleAction` にロールごとの実装 (放電の蓄電放出、医師の4アクションなど) を追加し、`handleRoleEndTurnEffects` や `applyRoleStartOfTurnEffects` でターンフックを処理する。
- クライアント Match 画面は `getRoleActions(roleId)` を読み込み、UI を自動生成する。必要に応じて `roleState` (蓄電トークンや感電トークン等) をプレイヤーカードに表示する。
- 追加の内部状態が必要な場合は `PlayerRuntimeState.roleState` に格納し、`updateRoleState` ヘルパーで更新する。

---

## 7. 参考コマンド
```bash
npm run typecheck
npm test
npm run dev
```

これらのコマンドを実行して型チェック / テスト / ローカルプレイを確認し、ロールワークフローを完結させること。
