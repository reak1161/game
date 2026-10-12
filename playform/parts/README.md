# Game Parts

コピーして使えるPCゲーム用の10部品、外観6種、有限アニメーション5種。フレームワーク・実行時依存・ビルド不要。各部品はShadow DOMでスタイルを分離しています。v1.1では白・無彩色を既定にし、既存テーマのクリーム色・黄土色も見直しました。

## 最短の組み込み

`game-parts.js` と `motions.js` を同じフォルダーにコピーします。通常のscriptなので、ローカルHTMLを直接開いても動きます。下の例ではscriptを部品より前に読み込み、値の設定を部品より後に置きます。

```html
<script src="./motions.js"></script>
<script src="./game-parts.js"></script>

<pf-meter id="hp" theme="neutral"></pf-meter>
<script>
  const hp = document.querySelector('#hp');
  hp.data = { label: 'HP', value: 24, max: 30 };

  // ゲーム側でダメージを確定したあと、状態を丸ごと渡す。
  hp.data = { ...hp.data, value: 18 };
  hp.play('hit', { part: 'value' });
</script>
```

動く組み合わせ例は `example.html`。ゲームの状態と処理は `example.js` にあります。ライブラリだけなら2つのJSファイルで足ります。演出を使わない場合は `game-parts.js` だけでも動作します。

## 5つの部品

| タグ | `.data` の内容 | 通知イベント |
| --- | --- | --- |
| `pf-meter` | `{label, value, max}` | なし |
| `pf-hand` | `{cards: [{id, label, value, detail?, disabled?}], selectedId?}` | `gp-select`: `{id, index}` |
| `pf-turns` | `{players: [{id, label, subtext?, disabled?}], activeId}` | `gp-turn`: `{id, index}` |
| `pf-slots` | `{items: [{id, label, value?, disabled?}], capacity?, selectedId?}` | `gp-select` / `gp-reorder`: `{id, from, to, order}` |
| `pf-command` | `{commands: [{id, label, key?, remaining?, total?, disabled?}], selectedId?}` | `gp-command`: `{id, index}` |

- 状態は呼び出し側が管理します。クリックだけでカードが消費されたり、手番が進んだりすることはありません。
- 通知は `CustomEvent` の `detail`。`bubbles` / `composed` がtrueなので、親の要素でも受け取れます。
- `.data` はコピーを保持し、getterもコピーを返します。更新は `part.data = {...}` で行います。値はstructuredClone可能なデータにしてください。
- `id` は同じリスト内で一意な空でない文字列。重複時、または配置数がcapacityを超える場合は例外にし、前の表示を保持します。capacityは1〜20、既定5。
- HPは0〜maxに制限。maxは最低1。コマンドのremaining / totalは秒数です。部品にCDタイマーはなく、ゲームの時計からremainingを渡します。
- キー操作：手札は左右・Home・Endでフォーカス移動。Enter/Spaceで選択。配置は左右ボタンまたは部品内のドラッグ。コマンドのkeyはその部品内にフォーカスがある間だけ有効です。

```js
hand.addEventListener('gp-select', ({ detail }) => {
  hand.data = { ...hand.data, selectedId: detail.id };
});

slots.addEventListener('gp-reorder', ({ detail }) => {
  const current = slots.data;
  slots.data = {
    ...current,
    items: detail.order.map(id => current.items.find(item => item.id === id)),
  };
  slots.play('place', { part: 'item', index: detail.to });
});

commands.addEventListener('gp-command', ({ detail }) => {
  // ゲーム側で使用可能か検証し、処理結果を.dataへ戻す。
  game.useSkill(detail.id);
});
```

## 外観6種

`theme="neutral | table | slate | pixel | arena | blueprint"` を各部品に指定します。省略時はneutral。旧テーマ名と既存の部品APIは引き続き使えます。

| 値 | 外観 |
| --- | --- |
| neutral | 白・無彩色：白い面、灰色の罫線、選択時の青 |
| table | 卓：冷たい白と緑、細い縁、数字に明朝系 |
| slate | 石板：暗い灰色、淡い青、控えめな境界 |
| pixel | ドット：角ばった枠、段差、等幅文字 |
| arena | 競技：太いゲージ、明確な選択色、数値の強調 |
| blueprint | 設計図：青い罫線、直角、薄い方眼 |

色だけでなく、枠・ゲージ・選択表示・数字の組版も変わります。`.data` とイベントは共通なので、ゲーム処理を変更せず切り替えられます。

個別調整はCSS変数とCSS Partsを使えます。ページ全体のスタイルは変更しません。

```css
pf-meter {
  width: 320px;
  --gp-accent: #375b91;
  --gp-background: #f4f4f5;
  --gp-padding: 18px;
}
pf-meter::part(value) { font-size: 32px; }
pf-hand { --gp-card-width: 140px; }
```

共通変数：`--gp-background`, `--gp-ink`, `--gp-accent`, `--gp-muted`, `--gp-line`, `--gp-face`, `--gp-on-accent`, `--gp-font`, `--gp-padding`。手札は `--gp-card-width` も対応。Partsは全要素の `body`、ゲージの `value / track / bar`、リストの `item`、手札の `card`、手番の `active`、コマンドの `cooldown` です。

## 動き5種

| 名前 | 動き | 時間 |
| --- | --- | --- |
| place | 6px上から着地 | 130ms |
| deal | 下からカードが入る | 210ms |
| handoff | 9px横から手番表示が移る | 160ms |
| hit | 対象だけ短く横に動く | 170ms |
| resolve | 解決する対象だけ持ち上がる | 300ms |

```js
const motion = part.play('resolve', { part: 'item', index: 0 });
await motion.finished; // true=完了、false=キャンセル
motion.cancel();

// 既存ゲームの普通のHTML要素にも使える。
const handle = GamePartsMotion.play(document.querySelector('.card'), 'deal');
```

`part.play()` と `GamePartsMotion.play()` は `{reducedMotion, signal}` に対応。部品は `reduced-motion` 属性でも抑制できます。OSの `prefers-reduced-motion` も尊重し、抑制時は待たずに完了します。

同じ対象への再生は前の再生をキャンセル。部品のdata更新・テーマ変更・削除時もキャンセルします。表示を更新してから `.play()` を呼んでください。任意のHTML要素に直接使う場合は、要素の破棄に合わせて `handle.cancel()` またはAbortSignalを使います。transformを自前で制御している要素は、その内側のラッパーを再生対象にしてください。

## 既存ゲームへの対応例

- High Roll：プレイヤーHP → meter、手札 → hand、Bra不足 → commandのdisabled。
- 超次元バトル：場の順番 → slots、解決イベント → `play('resolve')`。
- ROOM：HP → meter、スキルCD → commandのremaining/total。移動キーは既存ゲーム側で管理。
- ライトウルフ：手札 → hand、currentPlayer → turns。非公開カードは渡さず、公開可能な情報だけをdataへ入れます。

これは表示部品です。通信・ルール判定・乱数・セーブ・認証は含みません。スマートフォン向け調整はしていません。

## ゲーム別の追加5部品

`game-parts.js` の後に `game-widgets.js` を読み込みます。演出を使うときは `motions.js` も読み込みます。動く例は `game-example.html` / `game-example.js`。ZIP内だけで動作します。

| タグ | `.data` | 通知イベント |
| --- | --- | --- |
| `pf-guess-history` | `{columns:[{id,label}], rows:[{id,label,cells:[{value,comparison}]}], label?, rowLabel?}` | なし |
| `pf-grid-board` | `{rows:15, cols:15, cells:[0,1,2,...], preview?:[index], previewValid?, path?:[index], disabled?, label?}` | `gp-cell` / `gp-preview`: `{index,x,y}` |
| `pf-fuse-lane` | `{bombs:[{id,fuses,lit?,disabled?}], capacity?:5, selectedId?, disabled?, label?}` | `gp-insert`: `{index}` / `gp-select`: `{id,index}` |
| `pf-tile-rack` | `{tiles:[{id,code?,label?,concealed?,disabled?}], selectedId?, winningId?, disabled?, label?}` | `gp-select`: `{id,index,code}` |
| `pf-lobby` | `{roomId?, players:[{id,label}], hostId?, connected?, isHost?, busy?, error?, minPlayers?:2, maxPlayers?:8, label?}` | `gp-join` / `gp-start`: `{roomId}` |

```html
<script src="./motions.js"></script>
<script src="./game-parts.js"></script>
<script src="./game-widgets.js"></script>
<pf-tile-rack id="rack"></pf-tile-rack>
<script>
  const rack = document.querySelector('#rack');
  rack.data = { tiles: [
    { id: 'a', code: '2m' },
    { id: 'b', code: '3m' },
    { id: 'hidden', concealed: true },
  ] };
  rack.addEventListener('gp-select', ({ detail }) => {
    rack.data = { ...rack.data, selectedId: detail.id };
  });
</script>
```

- **回答履歴**：`comparison` は `higher / lower / equal / none`。↑は「正解はもっと大きい」、↓は「もっと小さい」。1行のcells数はcolumns数と一致させます。比較・答え合わせは呼び出し側で行い、正解の秘密データを渡す必要はありません。`poke_and_blow` はデータのみの段階のため、見本の大小比較は仮仕様です。
- **盤面**：各辺1〜30。cellsは行優先の配列で0=空き、1=青、2=赤。indexは0始まり、x=列、y=行。矢印・Home・Endで移動、Enter/Spaceで座標を通知。占有マスも通知するので、ゲーム側で合法手を判定します。`gp-preview`はポインター進入またはフォーカス時に通知。見本帳のQUADRIDGEは15×15・通常配置のみで、延長配置や候補補充は省略。
- **爆弾列**：capacityは1〜12、fusesは追加導火線0〜6。0でlitなら本体に着火。部品には時計がなく、燃焼や爆発は行いません。見本帳は手番ごとに全爆弾の最上段を一段減らし、本体着火済みなら除去して1ダメージ。追加本数の上限6は表示サンプルの制約です。
- **牌**：`1m..9m`=萬子、`1p..9p`=筒子、`1s..9s`=索子、`1z..7z`=東南西北白發中。SVGを内蔵し、画像ファイルに依存しません。concealedならcodeを渡さず表示できます。左右・Home・Endで選択可能牌へフォーカス移動。赤牌・副露・横向き牌・点数計算は含みません。
- **待機欄**：ルームIDをtrimして参加要求を通知。接続済み・isHost・必要人数以上・busyでない場合に開始要求を通知します。入力途中の文字は外観変更や同じroomIdの更新で保持。入力制限・認証・開始権限・人数は実サーバー側で検証してください。部品は通信しません。

追加CSS Parts：回答履歴 `table / item`、盤面 `board / cell`、爆弾列 `insert / item / bomb`、牌 `item / tile`、待機欄 `code / players / item`。共通の `body` と5種のモーションも使えます。

追加CSS変数：`--gp-board-width`（既定465px）、`--gp-team-one / --gp-team-two`、`--gp-danger`、`--gp-tile-width`（既定49px）、`--gp-tile-blue / --gp-tile-green / --gp-tile-red`。テーマの色とは別にゲーム内の陣営・牌種の色を指定できます。

## 検証

リポジトリで `npm install` 後、`npm run check`。開発テストだけhappy-domを使用し、配布部品には含めません。契約テストでは、状態を勝手に変更しないこと、無効操作、並べ替え、文字列の扱い、キーボード、CD、モーション破棄、組み合わせ例を確認します。DOMテストはブラウザでの描画確認の代用にはなりません。
