# High Roll (ハイロール) — VSCode/Codex スケルトン

## セットアップ
```bash
cd hiroll
npm i
npm run dev
```
> 初回は `npm i` の後に「実行 → 構成の追加」で `Node: Dev (tsx)` を選べます（`.vscode` も同梱済み）。

## 主要ファイル
- `docs/requirements_design.md` … 要件定義書 + 設計書（.md）
- `data/roles.json` / `data/roles_compiled.json` / `data/rules.json`
- `src/shared/types.ts` … 共有型
- `src/server/index.ts` … JSONを読み込んで起動確認

## 次の手順
- `data/cards.json` と `data/decklist.default_60.json` を埋める
- サーバに `market.ts` / `rules.ts` / `abilities.ts` を追加実装（設計書参照）
