# 画像素材と利用条件

## 麻雀牌

- 素材: [riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)
- 作者: FluffyStuff
- 利用条件: [CC0 1.0 / Public Domain](https://creativecommons.org/publicdomain/zero/1.0/)
- 確認日: 2026-10-04
- 取得元コミット: `26e127ba2117f45cdce5ea0225748cc0cfad3169`
- 保存先: `public/assets/tiles/`。Regularの通常34種、赤5牌3種、裏面1種と原文の `LICENSE.md` を同梱。
- SVG自体は改変せず使用。数字の補助表示、特殊牌・赤ドラ・圧縮牌の印、影は画面側で重ねる。
- 10～13の拡張数牌は本プロジェクトの文字による表示。外部画像を流用しない。
- ゲーム実行時にはローカル配信される素材を使用し、GitHub等への画像の直接参照は行わない。

## 独自の描画

卓、牌の裏面模様、印、背景、エフェクトはCSSとWeb Animations APIで作成。
画像生成サービスによる素材は使用していない。
