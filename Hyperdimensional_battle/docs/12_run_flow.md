# 超次元バトル - 実行方法 / 確認フロー

## 1. 前提
- 作業ディレクトリ:
  - `c:\Users\reak1\programming\game\Hyperdimensional_battle`
- 想定ランタイム:
  - Node.js
  - npm

## 2. 初回セットアップ
```powershell
cd c:\Users\reak1\programming\game\Hyperdimensional_battle
npm install
```

## 3. 普段の確認フロー
変更後は、基本的に以下の順で確認する。

### 3.1 型チェック
```powershell
npm run typecheck
```

### 3.2 エンジンテスト
```powershell
npm test
```

### 3.3 本番ビルド確認
```powershell
npm run build
```

## 4. ローカルで画面を動かす
```powershell
npm run dev:web
```

起動後、ブラウザで以下を開く。

- `http://localhost:5173`

## 5. 画面の確認手順
ローカル検証 UI では、以下の流れで確認する。

1. 役職を選ぶ
2. `ゲーム開始` を押す
3. 交換フェーズで必要なら手札カードをクリックして交換対象にする
4. `交換して配置へ` または `交換せず配置へ` を押す
5. 配置フェーズで、手札からカードをドラッグして場へ置く
6. 必要なら場のカードもドラッグして順番を入れ替える
7. `この並びで発動開始` を押す
8. 対象を取るカードが出たら、場の対象カードをクリックして選ぶ
9. ラウンド終了時は場から2枚選んで捨てる
10. 5ラウンド終了まで繰り返す

## 6. よく使う確認パターン

### 6.1 実装直後の最小確認
```powershell
npm run typecheck
npm test
```

### 6.2 UI 変更を含む確認
```powershell
npm run typecheck
npm test
npm run build
npm run dev:web
```

### 6.3 公開向け変更を入れたとき
以下も合わせて更新する。

- `docs/progress.md`
- `docs/patch_notes_public.md`

## 7. 補足
- `npm test` は現在 `packages/engine` の Vitest を実行する
- `npm run build` は現在 `apps/web` の Vite build を含む
- Worker 側は骨組みのみで、現時点では主に `typecheck` 対象

