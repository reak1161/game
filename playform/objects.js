'use strict';
const stage = document.querySelector('#stage');
const $ = s => stage.querySelector(s);
const $$ = s => [...stage.querySelectorAll(s)];
const reduce = document.querySelector('#reduce');
const preference = matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set();
let generation = 0, category = 0, game = 0;
const names = ['ばくだんぼんばー', '麻雀 点数計算', '３ターンで終わるゲーム'];
const categories = ['UI', 'デザイン', 'アニメーション'];
const ids = [['bomb-place', 'mahjong-answer', 'three-declare'], ['bomb-title', 'mahjong-title', 'three-title'], ['bomb-fuse', 'mahjong-sort', 'three-exchange']];
const notes = [
  ['カードを選び、＋の位置に爆弾を挿入。どうかせんは既存の爆弾を選んで追加。↶で一手戻せます。', '配置だけを抜き出した見本です。各列3個、導火線3本まで。ターン・補充・特殊効果は省略しています。'],
  ['点数を入力してEnter。回答後にだけ答えと内訳が開きます。', '同じ手牌で子のロン2,000点、親のロン2,900点を比較する固定2問。0本場・供託なし・赤牌なし。元ゲームの出題器やランキングには接続していません。'],
  ['1・2・3で枚数を宣言し、同じ枚数の手札を選んで「出す」。使用済みの宣言は再使用できません。', '宣言と手札選択の見本です。出したカードの効果、他プレイヤーの行動、得点計算は省略。カード絵の細かな文章は既存素材の表記で、現行ルールとの対応を保証しません。'],
  ['矢印から配置画面へ。', '黄と黒の大きな面、赤い導火線、丸い爆弾を使った入口です。装飾のコピーや機能紹介は置いていません。'],
  ['子・親を切り替えて開始。', '牌と卓の縁を中心にした入口です。開始後は選んだ立場の固定問題を表示します。'],
  ['「はじめる」で手札へ。カードはフォーカス・ホバーで少し持ち上がります。', '既存の強いカード絵を主役にした入口です。背景は黒と白に絞っています。'],
  ['「手番を終える」で導火線が一段ずつ燃えます。本体が燃えている状態で次の手番を終えると爆発。', '通常爆弾・ライフ5・1ダメージの表示例。実時間では進みません。動きなしでも同じ段階と結果になります。'],
  ['「理牌」で萬子・筒子・索子の順に整列。もう一度押すと元の順序へ。', '移動前後の位置から牌だけを動かす見本です。役判定や対局進行はありません。'],
  ['「交換」で相手の伏せ札と自分の一枚を交換。', '相手のカードは裏のまま移動し、自分に到着した時点でだけ公開します。固定のカードを交互に交換する表示例です。相手の手札全体や通信は扱いません。'],
];
function on(selector, fn) { $$(selector).forEach(el => el.addEventListener('click', () => fn(el))); }
function mount(className, html) { stage.innerHTML = `<div class="scene ${className}">${html}<p class="sr-only" role="status" id="status"></p></div>`; }
function say(text) { $('#status').textContent = text; }
function animate(el, frames, duration = 220, delay = 0) {
  if (reduce.checked || preference.matches) return Promise.resolve();
  const a = el.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'none' });
  running.add(a);
  return a.finished.catch(() => {}).finally(() => running.delete(a));
}
function clean() { generation++; running.forEach(a => a.cancel()); running.clear(); }
const bomb = (cls = '') => `<svg class="bomb-icon ${cls}" viewBox="0 0 90 95" aria-hidden="true"><path class="bomb-wick" d="M53 28q-7-16 4-20t10 5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="m40 24 20 2-2 15-22-3z" fill="currentColor"/><circle cx="43" cy="62" r="29" fill="currentColor"/><path d="M25 52q4-10 13-12" fill="none" stroke="var(--shine,#f5d747)" stroke-width="5" stroke-linecap="round"/></svg>`;
const fuse = `<svg viewBox="0 0 90 95" aria-hidden="true"><path d="M20 75C75 65 12 29 69 17" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="m60 8 18 18m-18 0L78 8" stroke="currentColor" stroke-width="3"/></svg>`;
const lives = hp => `<span class="lives" aria-label="ライフ${hp}">${Array.from({ length: 5 }, (_, i) => `<i class="${i < hp ? 'alive' : ''}"></i>`).join('')}</span>`;

// 28. The insertion point itself is the action; there is no separate target form.
function bombUI() {
  let rows = [[1], [0, 2], [], [1], [0]], selected = 'bomb';
  const history = [], people = ['あなた', 'ナギ', 'リン', 'ハル', 'ソラ'];
  mount('bomb-ui', `<div class="bomb-hand"><button class="tool-card" data-tool="bomb" aria-pressed="true">${bomb()}<span>ばくだん</span></button><button class="tool-card" data-tool="fuse" aria-pressed="false">${fuse}<span>どうかせん</span></button></div><div class="bomb-rows" id="bomb-rows"></div><button class="undo" id="undo" aria-label="一手戻す" title="一手戻す" disabled>↶</button>`);
  function draw() {
    $('#bomb-rows').innerHTML = rows.map((row, r) => `<div class="player-row"><div class="player-name"><b>${people[r]}</b>${lives(5)}</div><div class="bomb-lane">${Array.from({ length: row.length + 1 }, (_, i) => `<button class="insert" data-insert="${r},${i}" aria-label="${people[r]}の${i + 1}番目に爆弾を置く" ${selected !== 'bomb' || row.length >= 3 ? 'disabled' : ''}>+</button>${i < row.length ? `<button class="lane-bomb" data-fuse="${r},${i}" aria-label="${people[r]}の${i + 1}番目、導火線${row[i]}本。追加する" ${selected !== 'fuse' || row[i] >= 3 ? 'disabled' : ''}>${bomb()}<span class="fuse-count">${'<i></i>'.repeat(row[i])}</span></button>` : ''}`).join('')}</div></div>`).join('');
    on('[data-insert]', el => { const [r, i] = el.dataset.insert.split(',').map(Number); history.push(rows.map(x => x.slice())); rows[r].splice(i, 0, 0); draw(); say(`${people[r]}の${i + 1}番目に配置。`); });
    on('[data-fuse]', el => { const [r, i] = el.dataset.fuse.split(',').map(Number); history.push(rows.map(x => x.slice())); rows[r][i]++; draw(); say(`${people[r]}の導火線を追加。`); });
    $('#undo').disabled = !history.length;
  }
  on('[data-tool]', el => { selected = el.dataset.tool; $$('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b === el)); draw(); });
  on('#undo', () => { rows = history.pop(); draw(); say('一手戻しました。'); }); draw();
}

const hand = ['2m', '3m', '3m', '4m', '4m', '5m', '4p', '5p', '5p', '5p', '6p', '6s', '7s'];
function tileLabel(code) { return code === 'west' ? '西' : `${code[0]}${{ m: '萬', p: '筒', s: '索' }[code[1]]}`; }
const tile = code => `<img src="assets/tiles/${code}.gif" alt="${tileLabel(code)}" draggable="false">`;

// 29. Only the question exists until the answer is submitted.
function mahjongUI(parent = false) {
  let question = 0, solved = false;
  function draw() {
    const dealer = question === 0 ? parent : !parent, answer = dealer ? 2900 : 2000;
    mount('mahjong-ui', `<div class="quiz-top"><span>東1局 · ${dealer ? '東家' : '南家'} · ロン</span><span>${question + 1} / 2</span></div><div class="quiz-dora"><small>ドラ表示牌</small>${tile('5m')}</div><div class="quiz-hand">${hand.map(tile).join('')}<span class="win-tile">${tile('8s')}</span></div><div class="quiz-condition">門前 · リーチなし · 0本場</div><form class="point-form" id="point-form"><label><input id="points" type="number" min="0" step="100" required autocomplete="off" aria-label="ロンの点数"><span>点</span></label><button class="round-action" type="submit" aria-label="回答する">↵</button></form><div class="quiz-result" id="quiz-result" hidden><div><strong id="judgment"></strong><b>${answer.toLocaleString()}</b><span>点</span></div><details><summary>内訳</summary><p>断么九 1翻 · 平和 1翻<br>30符 2翻<br><small>副底20符 + 門前ロン10符</small></p></details><button id="next-question">${question ? 'もう一度' : '次へ'} →</button></div>`);
    $('#point-form').addEventListener('submit', e => {
      e.preventDefault(); if (solved || !$('#points').checkValidity() || $('#points').value === '') return;
      solved = true; const correct = Number($('#points').value) === answer;
      $('#judgment').textContent = correct ? '○' : '×'; $('#quiz-result').hidden = false;
      $('#point-form').hidden = true; $('#quiz-result').classList.toggle('incorrect', !correct);
      say(`${correct ? '正解' : '不正解'}。${answer}点。`); $('#next-question').focus();
    });
    on('#next-question', () => { question = (question + 1) % 2; solved = false; draw(); $('#points').focus(); });
  } draw();
}

const cards = [{ id: 'kill', name: 'ころす' }, { id: 'whim', name: 'きまぐれ' }, { id: 'yada', name: 'やだ' }, { id: 'exchange', name: 'こうかん' }, { id: 'everyone', name: 'みんな いっしょ' }, { id: 'handoff', name: 'せきにんてんか' }];
const cardImage = id => `<img src="assets/three-turn/${id}.png" alt="${cards.find(c => c.id === id)?.name || '伏せ札'}" draggable="false">`;

// 30. Declaration and hand selection share a single surface.
function threeUI() {
  let declaration = 1, cycle = 1;
  const available = new Set(cards.map(c => c.id)), chosen = new Set(), used = new Set();
  mount('three-ui', `<div class="three-top"><span>あなた</span><div class="cycle-dots" aria-label="1周目">${[1, 2, 3].map(n => `<i class="${n === 1 ? 'current' : ''}"></i>`).join('')}</div></div><div class="played-pile" id="played-pile"></div><div class="three-hand">${cards.map(c => `<button class="play-card" data-card="${c.id}" aria-label="${c.name}" aria-pressed="false"><span class="card-crop">${cardImage(c.id)}</span><span class="card-name">${c.name}</span></button>`).join('')}</div><div class="declare-bar"><div class="declarations" aria-label="枚数を宣言">${[1, 2, 3].map(n => `<button data-declare="${n}" aria-label="${n}枚を宣言" aria-pressed="${n === 1}">${n}</button>`).join('')}</div><button class="play-action" id="play" disabled>出す <span id="selection-count">0 / 1</span></button></div>`);
  function sync() {
    $$('[data-card]').forEach(el => { el.hidden = !available.has(el.dataset.card); el.setAttribute('aria-pressed', chosen.has(el.dataset.card)); });
    $$('[data-declare]').forEach(el => { const n = Number(el.dataset.declare); el.disabled = used.has(n); el.setAttribute('aria-pressed', n === declaration); });
    $('#selection-count').textContent = `${chosen.size} / ${declaration}`;
    $('#play').disabled = chosen.size !== declaration || used.size === 3;
  }
  on('[data-declare]', el => { declaration = Number(el.dataset.declare); chosen.clear(); sync(); });
  on('[data-card]', el => { const id = el.dataset.card; if (chosen.has(id)) chosen.delete(id); else if (chosen.size < declaration) chosen.add(id); sync(); });
  on('#play', () => {
    $('#played-pile').innerHTML = [...chosen].map(id => `<span class="played-card">${cardImage(id)}</span>`).join('');
    chosen.forEach(id => available.delete(id)); chosen.clear(); used.add(declaration); cycle++;
    say(`${declaration}枚を出しました。`);
    if (used.size === 3) { $('.three-hand').innerHTML = '<button class="three-restart" id="three-restart">もう一度 ↻</button>'; on('#three-restart', threeUI); }
    else declaration = [1, 2, 3].find(n => !used.has(n));
    $('.cycle-dots').setAttribute('aria-label', cycle > 3 ? '終了' : `${cycle}周目`);
    $$('.cycle-dots i').forEach((el, i) => el.classList.toggle('current', i === cycle - 1)); sync();
  }); sync();
}

// 31–33. Entrances carry identity through a few large, specific objects.
function bombTitle() {
  mount('bomb-title', `<h1>ばくだん<br>ぼんばー<span>。</span></h1><div class="hero-bomb">${bomb()}</div><svg class="hero-fuse" viewBox="0 0 600 250" aria-hidden="true"><path d="M600 170C380 300 420 30 200 55S10 15 0 0"/></svg><button class="bomb-start" id="start-bomb" aria-label="はじめる">↗</button>`);
  on('#start-bomb', bombUI);
}
function mahjongTitle() {
  let parent = false;
  mount('mahjong-title', `<div class="mahjong-title-copy"><h1>点数<br>練習</h1><div class="seat-choice"><button data-parent="false" aria-pressed="true">子</button><button data-parent="true" aria-pressed="false">親</button></div><button id="start-quiz">はじめる <span>→</span></button></div><div class="tile-still-life" aria-hidden="true"><div>${tile('4p')}${tile('5p')}${tile('6p')}</div><span>${tile('5m')}</span></div><div class="table-edge"></div>`);
  on('[data-parent]', el => { parent = el.dataset.parent === 'true'; $$('[data-parent]').forEach(b => b.setAttribute('aria-pressed', b === el)); });
  on('#start-quiz', () => mahjongUI(parent));
}
function threeTitle() {
  mount('three-title', `<h1>３ターンで終わるゲーム</h1><div class="giant-three" aria-hidden="true">3</div><div class="title-fan">${['kill', 'yada', 'exchange'].map(id => `<button class="fan-card" data-preview="${id}" aria-label="${cards.find(c => c.id === id).name}のカードを見る">${cardImage(id)}</button>`).join('')}</div><button id="start-three">はじめる <span>↗</span></button><dialog id="card-preview"><form method="dialog"><button aria-label="閉じる">×</button></form><div id="preview-image"></div></dialog>`);
  on('[data-preview]', el => { $('#preview-image').innerHTML = cardImage(el.dataset.preview); $('#card-preview').showModal(); });
  on('#start-three', threeUI);
}

// 34. Burn one game step, not an automatic countdown.
function bombMotion() {
  let segments = 3, hp = 5, busy = false;
  mount('bomb-motion', `<div class="motion-lives" id="motion-lives">${lives(hp)}</div><div class="fuse-scene"><div class="fuse-stack" id="fuse-stack">${[2, 1, 0].map(n => `<span class="wick-piece" data-wick="${n}"></span>`).join('')}<i class="spark" id="spark"></i><div class="live-bomb" id="live-bomb">${bomb()}</div></div><div class="cold-bomb">${bomb()}</div></div><button class="bomb-step" id="burn">手番を終える <span>→</span></button>`);
  on('#burn', async el => {
    if (busy) return;
    if (hp < 5) { bombMotion(); return; }
    busy = true; el.disabled = true; const run = generation;
    if (segments > 0) {
      const piece = $(`[data-wick="${segments - 1}"]`), spark = $('#spark');
      const from = (3 - segments) * 42; segments--;
      piece.classList.add('burnt'); spark.style.top = `${from + 42}px`;
      await Promise.all([animate(piece, [{ opacity: 1 }, { opacity: 0 }], 230), animate(spark, [{ top: `${from}px` }, { top: `${from + 42}px` }], 230)]);
      if (run !== generation) return; say(segments ? `導火線が残り${segments}本。` : '爆弾本体に着火。');
    } else {
      const body = $('#live-bomb'); $('#spark').hidden = true;
      await animate(body, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: .4 }, { transform: 'scale(.75)', opacity: 0 }], 180);
      if (run !== generation) return; body.innerHTML = '<span class="blast-mark" aria-hidden="true">×</span>'; body.classList.add('spent'); hp--;
      $('#motion-lives').innerHTML = lives(hp); el.innerHTML = 'もう一度 <span>↻</span>'; say('爆発。ライフ4。');
    }
    busy = false; el.disabled = false;
  });
}

// 35. Preserve every tile's identity while its position changes.
function mahjongMotion() {
  const mixed = [8, 0, 11, 3, 6, 1, 12, 7, 4, 10, 2, 9, 5]; let sorted = false, busy = false;
  mount('mahjong-motion', `<div class="sorting-hand" id="sorting-hand">${mixed.map(i => `<span class="sort-tile" data-tile="${i}">${tile(hand[i])}</span>`).join('')}</div><button id="sort">理牌 <span>→</span></button>`);
  on('#sort', async el => {
    if (busy) return; busy = true; el.disabled = true; const run = generation;
    const elements = $$('[data-tile]'), before = new Map(elements.map(node => [node, node.getBoundingClientRect().left]));
    sorted = !sorted;
    (sorted ? [...elements].sort((a, b) => Number(a.dataset.tile) - Number(b.dataset.tile)) : mixed.map(i => elements.find(node => Number(node.dataset.tile) === i))).forEach(node => $('#sorting-hand').append(node));
    await Promise.all(elements.map((node, i) => animate(node, [{ transform: `translateX(${before.get(node) - node.getBoundingClientRect().left}px)` }, { transform: 'translateX(0)' }], 230, i * 8)));
    if (run !== generation) return; busy = false; el.disabled = false; el.innerHTML = sorted ? '戻す <span>↶</span>' : '理牌 <span>→</span>'; say(sorted ? '萬子、筒子、索子の順に整列。' : '元の順序に戻しました。');
  });
}

// 36. A private card is revealed only after it reaches its new owner.
function threeMotion() {
  let own = 'yada', other = 'exchange', busy = false;
  mount('three-motion', `<div class="exchange-seat opponent"><span>ナギ</span><div class="exchange-card" id="other-card">${cardImage('card_back')}</div></div><div class="exchange-track" aria-hidden="true"><span>⇄</span></div><div class="exchange-seat own"><div class="exchange-card" id="own-card">${cardImage(own)}</div><span>あなた</span></div><button id="exchange">交換 <span>↔</span></button>`);
  on('#exchange', async el => {
    if (busy) return; busy = true; el.disabled = true; const run = generation;
    const a = $('#own-card'), b = $('#other-card'), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    a.innerHTML = cardImage('card_back');
    const dx = rb.left - ra.left, dy = rb.top - ra.top;
    await Promise.all([
      animate(a, [{ transform: 'translate(0,0)' }, { transform: `translate(${dx / 2}px,${dy / 2 - 32}px)`, offset: .5 }, { transform: `translate(${dx}px,${dy}px)` }], 320),
      animate(b, [{ transform: 'translate(0,0)' }, { transform: `translate(${-dx / 2}px,${-dy / 2 + 32}px)`, offset: .5 }, { transform: `translate(${-dx}px,${-dy}px)` }], 320),
    ]);
    if (run !== generation) return; [own, other] = [other, own]; a.innerHTML = cardImage(own); b.innerHTML = cardImage('card_back'); busy = false; el.disabled = false; say(`${cards.find(c => c.id === own).name}を受け取りました。`);
  });
}

const renders = [[bombUI, mahjongUI, threeUI], [bombTitle, mahjongTitle, threeTitle], [bombMotion, mahjongMotion, threeMotion]];
function show(c, g, push = true) {
  clean(); category = c; game = g;
  if (push) history.pushState(null, '', '#' + ids[c][g]);
  document.querySelector('#categories').innerHTML = categories.map((name, i) => `<button data-category="${i}" aria-pressed="${i === c}">${name}</button>`).join('');
  document.querySelector('#games').innerHTML = names.map((name, i) => `<button data-game="${i}" aria-pressed="${i === g}">${name}</button>`).join('');
  document.querySelectorAll('[data-category]').forEach(el => el.addEventListener('click', () => show(Number(el.dataset.category), game)));
  document.querySelectorAll('[data-game]').forEach(el => el.addEventListener('click', () => show(category, Number(el.dataset.game))));
  document.querySelector('#sample-number').textContent = String(28 + c * 3 + g);
  document.querySelector('#motion-option').hidden = c !== 2;
  stage.setAttribute('aria-label', `${names[g]} / ${categories[c]}`); renders[c][g]();
}
function fromHash() { const id = location.hash.slice(1); if (id === 'stage') return; for (let c = 0; c < 3; c++) for (let g = 0; g < 3; g++) if (ids[c][g] === id) { show(c, g, false); return; } show(0, 0, false); }
document.querySelector('#reset').addEventListener('click', () => show(category, game, false));
document.querySelector('#help').addEventListener('click', () => { const n = category * 3 + game; document.querySelector('#notes-title').textContent = `${names[game]} / ${categories[category]}`; document.querySelector('#notes-action').textContent = notes[n][0]; document.querySelector('#notes-scope').textContent = notes[n][1]; document.querySelector('#notes').showModal(); });
function syncMotion() { document.documentElement.classList.toggle('reduced', reduce.checked || preference.matches); if (reduce.checked || preference.matches) running.forEach(a => a.finish()); }
reduce.addEventListener('change', syncMotion); preference.addEventListener('change', syncMotion);
window.addEventListener('popstate', fromHash); window.addEventListener('hashchange', fromHash);
syncMotion(); fromHash();
