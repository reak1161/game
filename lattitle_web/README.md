# ラティトル Web版

## 現在の状態

- `legacy/`: `../lattitle_prototype/` を複製したブラウザ用のレガシー版。元フォルダは変更していない。
- `remake/`: 製品版の最初のプレイ可能な戦闘プロトタイプ。4人対「へび」の1戦、移動、コマンド、敵の予告、勝敗、再戦を実装。
- `index.html`: レガシー版と製品版を分ける入口。
- `legacy/build/`: Pygbagの生成物。Gitには含めない。

## レガシー版の実行

Pythonと[Pygbag](https://pygame-web.github.io/wiki/pygbag/)が必要。

```powershell
py -m pip install pygbag==0.9.3
py -m pygbag D:/programming/game/lattitle_web/legacy
```

起動後、`http://localhost:8000/` を開く。初回は画面をクリックしてからゲームが始まる。

配布用ビルド:

```powershell
py -m pygbag --build D:/programming/game/lattitle_web/legacy
```

`legacy/build/web/` が静的配布物。入口の `index.html` とともに公開する場合は、`lattitle_web/` をサイトのルートにする。

## 元版との差分

- ブラウザのイベントループに合わせ、毎フレーム制御を返す。
- Pygame画面の作成を初期化後に移した。
- Web用エントリーポイントでPygameを先に読み込む。
- 魔力効率の2元連立方程式を同等の四則演算にし、NumPy依存をなくした。
- 再生処理が元から無効になっていたMP3をWeb用コピーから除いた。

## 製品版の方針

元の4×4盤面、移動経路、行動ゲージ、攻撃・防御・魔法・アイテムのリアルタイム戦闘を基準にする。レガシー版は固定して遊べる状態を保ち、製品版の実装は別ディレクトリで進める。最初の制作単位は、戦闘ルールの仕様化と再現、その後に操作性・視認性・演出を改善する。

製品版を入口から試すには、次を実行して `http://localhost:8768/` を開く。

```powershell
py -m http.server 8768 --directory D:/programming/game/lattitle_web
```

Node.js がある場合、`remake/` で `node --test` を実行すると戦闘エンジンを検証できる。現在は最初の1戦のみを実装しており、敵のパッシブや他の敵、コンテンツ全体の移植は今後の作業。
