export function helpMarkup() {
  return `<div class="modal-backdrop" id="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button id="close-help" class="close" aria-label="閉じる">×</button><div class="eyebrow">HOW TO PLAY</div><h2 id="help-title">遊び方</h2><p>2人で交互に4マスのブロックを置きます。蒼は上端と下端、朱は左端と右端を、自分のマスだけで先につなげると勝利です。</p><ul><li><strong>候補</strong>は盤面下のブロックです。A / D キーまたは左右のボタンで選びます。</li><li>Q キーまたは ↶ で左へ、E キーまたは ↷ で右へ90°回転します。回転するのは選択中の候補だけです。各候補の向きは選択を外しても保持されます。</li><li><strong>ゴースト</strong>は配置予定のマスです。置けないマスには中立色の × が出ます。ブロック全体を盤面内に収めてください。</li><li>通常は空きマスだけに配置します。自分のマスに接していなくても置けます。接続は上下左右の辺だけで、斜めはつながりません。</li><li>候補をどれも置けない手番は<strong>パス</strong>します。次回の候補は置ける形状から<strong>リロール</strong>されます。延長配置中も同じです。</li><li>両者とも通常配置ができなくなると<strong>延長配置</strong>になります。自分のマスには重ねられますが、少なくとも1マスは新しい空きマスに置く必要があります。相手のマスには重ねられません。</li><li>延長配置の終了時は、対岸までの<strong>残り距離</strong>が短い方の判定勝ちです。同じ場合は代表経路のマス数、総占有マス数の順で比べ、すべて同じなら引き分けです。</li></ul><button id="help-ok" class="primary">対局に戻る</button></section></div>`;
}

export function showHelp(app) {
  app.insertAdjacentHTML('beforeend', helpMarkup());
  const close = () => app.querySelector('#backdrop')?.remove();
  app.querySelector('#close-help').addEventListener('click', close);
  app.querySelector('#help-ok').addEventListener('click', close);
  app.querySelector('#backdrop').addEventListener('click', event => { if (event.target.id === 'backdrop') close(); });
}
