'use strict';

// No dependencies, remote fonts, or image requests. The drawings belong to each study.
const studies = [
  { id: 'fieldkit', name: 'FIELDKIT', sub: '旅支度のインベントリ', category: 'INTERFACE', title: '持ちものに、重さを。', description: '山小屋に残された装備表のように。罫線、鉛筆の地形図、少しくすんだ道具。持っていくものを選ぶだけで、これから始まる旅が見えてくる。', instruction: '道具を選んで、2.5 kgまで詰める。「出発する」で荷造りを確定。', principle: '選択を色・チェック・重量で返す。装飾も情報も、旅支度という一つの目的へ。', render: renderField },
  { id: 'last-train', name: 'LAST TRAIN', sub: '駅の案内ときっぷ', category: 'INTERFACE', title: '迷わない、夜の駅。', description: '時刻、行き先、番線。この画面で大事な順番に並べる。選んだ列車は手元の切符になり、移動の目的がひと続きの操作になる。', instruction: '発車案内から行き先を選び、切符を発券する。', principle: '時刻は等幅、行き先は大きく。選択は行全体、確定は切符の入鋏で伝える。', render: renderRail },
  { id: 'night-shift', name: 'NIGHT SHIFT', sub: '観測装置の操作盤', category: 'INTERFACE', title: '指先に、機械の都合。', description: '古い沿岸観測所の送信機。段差のあるスイッチと、押し込む発信ボタン。準備が整うまで動かない、不器用でわかりやすい操作盤。', instruction: '3つのスイッチをONにして信号を送る。ひとつ切ると再び待機。', principle: '光は状態を伝える場所だけ。入力と出力を、機械としてつながる位置に置く。', render: renderConsole },
  { id: 'tideline', name: 'TIDELINE', sub: '木版画の海辺', category: 'ART DIRECTION', title: '余白にも、潮風を。', description: '海辺の探索ゲームのタイトル画面。削ったような線、二色の版、波に沿う余白。風景と文字が、同じ紙の上に刷られているように。', instruction: '「灯台へ」で小舟が進む。「夕景に切り替え」で時間帯を変える。', principle: '色数を絞り、線の密度で奥行きをつくる。舞台を説明文より先に見せる。', render: renderTide },
  { id: 'club-09', name: 'CLUB 09', sub: '街角のピンポンクラブ', category: 'ART DIRECTION', title: 'お行儀より、勢い。', description: '週末の小さな卓球大会。大胆に切れるラケット、詰めた文字、朱赤の一色刷り。街の壁に貼られたポスターのテンションを、そのままゲームへ。', instruction: '「SERVE」を押すたびラリー。5ポイントでゲーム、もう一度で再開。', principle: '見出しと絵を重ね、版面からはみ出す。強い形があるから、飾りは少なく。', render: renderClub },
  { id: 'mushroom-post', name: 'MUSHROOM POST', sub: '森の小さな郵便局', category: 'ART DIRECTION', title: '小さな用事が、冒険になる。', description: '森の住人に手紙を届けるゲーム。封筒の傾き、切手の縁、便箋の罫線。それぞれの紙に役割があり、画面の中に暮らしが感じられる。', instruction: '宛先を選んで手紙を届ける。届け先ごとに文面と返事が変わる。', principle: '物の大きさと置き方で親しみを出す。少しの不揃いにも、素材の理由を持たせる。', render: renderPost },
  { id: 'handful', name: 'HANDFUL', sub: '一枚ずつ、配る', category: 'MOTION', title: '同時に出さない、というリズム。', description: '一枚目が着きかけたころ、二枚目が追いかける。わずかに行き過ぎて机に落ち着く。時間差と回転の支点で、カードに扱われる物の感じを。', instruction: '「配り直す」で再生。カードを押すと、手札から一枚だけ持ち上がる。', principle: '90 msずつずらす。移動は600 ms、最後に7 pxの着地。選択は別の短い動き。', render: renderCards },
  { id: 'impact', name: 'ONE GOOD HIT', sub: '止めて、重くする', category: 'MOTION', title: '当たった瞬間、時間を止める。', description: '踏み込みの前に少し引く。接触の瞬間に両者が止まり、遅れて標的がしなる。派手な光に頼らず、動きの緩急だけで手応えをつくる。', instruction: '「打ち込む」で再生。赤い区間が、接触を約100 ms保つヒットストップ。', principle: '予備動作 → 加速 → 停止 → 戻り。動く側と受ける側に同じ接触時刻を持たせる。', render: renderImpact },
  { id: 'clockwork', name: 'CLOCKWORK', sub: '桁が回るスコア表示', category: 'MOTION', title: '数字が増える。その手応えまで。', description: '遊園地の片隅にある古い得点機。レバーを押すと、数字の帯が一桁ずつ送り出される。変わらない桁は動かさず、最後の桁が収まるまでをひとつの動作に。', instruction: '「+125 POINTS」で加点。0990から始まり、最初の操作で桁上がりが見られる。', principle: '実際の差分だけ回転。70 msの桁のずれと、終端3 pxの小さな行き過ぎ。', render: renderCounter },
];

const stage = document.querySelector('#sample');
const reduceControl = document.querySelector('#reduce-motion');
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current = null;
let timers = new Set();
let activeAnimations = new Set();
let epoch = 0;
const reduced = () => reduceControl.checked || systemMotion.matches;
function later(fn, ms) {
  const handle = setTimeout(() => { timers.delete(handle); fn(); }, ms);
  timers.add(handle);
  return handle;
}
function animate(el, keyframes, options) {
  const animation = el.animate(keyframes, { ...options, duration: reduced() ? 1 : options.duration, delay: reduced() ? 0 : (options.delay || 0) });
  activeAnimations.add(animation);
  animation.finished.then(() => activeAnimations.delete(animation)).catch(() => activeAnimations.delete(animation));
  return animation;
}
function clearEffects() {
  epoch++;
  timers.forEach(clearTimeout);
  timers.clear();
  activeAnimations.forEach(a => a.cancel());
  activeAnimations.clear();
}
function wire(selector, callback) { stage.querySelectorAll(selector).forEach(el => el.addEventListener('click', () => callback(el))); }
function status(text) { const el = stage.querySelector('[data-status]'); if (el) el.textContent = text; }
function restartClass(el, name) { el.classList.remove(name); void el.offsetWidth; el.classList.add(name); }
function svg(body, viewBox = '0 0 100 100', cls = '') { return `<svg class="${cls}" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`; }
const pen = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const icons = {
  flask: `<path d="M39 15h22v13l6 9v46H33V37l6-9z" fill="#bec3ab" ${pen}/><path d="M39 13h22v9H39zM34 45h32v23H34z" fill="#e8e3cd" ${pen}/><path d="M44 50v13m6-13v13m6-13v13M40 76h20" ${pen}/><path d="M62 29c17-12 19 14 5 14" ${pen}/>`,
  compass: `<circle cx="50" cy="53" r="30" fill="#dfd0a0" ${pen}/><circle cx="50" cy="53" r="24" ${pen}/><path d="m50 30-8 31 8-8 8 8z" fill="#a6543c" ${pen}/><path d="m50 77 8-31-8 7-8-7z" fill="#f3efda" ${pen}/><path d="M43 21v-7h14v7M27 53h5m36 0h5M50 30v4m0 38v5" ${pen}/>`,
  rope: `<path d="M31 72C6 30 38 15 51 26c20-14 48 15 23 51-6 13-20 5-24-5-8 15-25 11-19 0Z" fill="#d5c59b" ${pen}/><path d="M34 66C19 37 36 27 46 35m8-1c17-6 24 12 10 35M40 60c-8-13-4-20 6-20m9 1c8 0 9 10 3 20M31 70l36 5M29 65l40 5M30 59l40 6M51 73l-8 14M57 75l9 11" ${pen}/>`,
  lantern: `<path d="M40 28c-9-34 31-34 22 0M36 30h30l7 42H29z" ${pen}/><path d="M35 34h31v34H35z" fill="#ddc68a" ${pen}/><path d="M35 25h31v9H35zM28 69h46v10H28zM34 79h34v6H34z" fill="#859277" ${pen}/><path d="M50 43c-16 17-9 22 0 20 11-2 0-12 0-20Z" fill="#ac5e38"/><path d="M27 27C4 73 20 92 42 83m30-56c22 45 11 63-11 56" ${pen}/>`,
  map: `<path d="m15 27 24-8 24 8 22-8v57l-22 8-24-8-24 8z" fill="#e9dfbd" ${pen}/><path d="M39 19v57m24-49v57" ${pen}/><path d="m20 59 9-21 9 18 8-13 15 20 9-24 10 14" stroke="#89906f" stroke-width="1.2"/><path d="m22 70 16-10 11 10 12-15 17-23" stroke="#a45842" stroke-width="2" stroke-dasharray="3 3"/>`,
  apple: `<path d="M50 33c-27-19-41 10-27 35 11 22 22 13 27 13s21 10 31-17c10-27-7-44-31-31Z" fill="#b26b4d" ${pen}/><path d="M49 34c1-14 6-20 14-24m-14 17C33 26 33 13 32 13c20 0 20 10 17 14Z" fill="#8b986c" ${pen}/><path d="M31 41c-7 8-5 17-3 22" stroke="#e5bb8d" stroke-width="3" stroke-linecap="round"/>`,
};
function icon(name) { return `<div class="draw-icon">${svg(icons[name])}</div>`; }
function backpack() {
  return svg(`<g stroke="#465339" stroke-width="1.8" stroke-linejoin="round"><path d="M77 43C67 2 137 0 126 43" fill="none" stroke-width="8"/><path d="M62 49c-27 13-29 85-15 119m87-117c30 14 36 77 20 117" fill="none" stroke-width="11"/><path d="M56 53q41-18 88 0l12 124q-47 24-111 0z" fill="#899775"/><path d="M56 68q43-13 88 0M51 125l-11 7 3 35 10 1m96-44 13 7-2 34-7 4" fill="#768768"/><path d="M54 44q48-23 90 0l3 49q-45 21-96 0z" fill="#a2ae8b"/><path d="M55 51q42-20 88 0M57 84q40 17 83 0" fill="none"/><path d="M72 39h13v88H72zM118 39h13v88h-13z" fill="#b2a77c"/><path d="M71 91h15v20H71zM117 91h15v20h-15z" fill="#ddd4ab"/><path d="M74 100h9m37 0h9"/><path d="M70 132q34-9 63 0v40q-32 13-63 0z" fill="#a0aa87"/><path d="M73 140h57m-39-9v11"/><path d="M57 177q42 16 85-1" fill="none" stroke-dasharray="3 3"/><path d="M87 58h27v17H87z" fill="#e6ddbb"/><path d="m91 71 8-9 5 6 4-4 3 7" fill="none"/></g>`, '0 0 200 210');
}

function renderField() {
  const gear = [ ['flask', '水筒', 800], ['compass', 'コンパス', 120], ['rope', 'ロープ', 900], ['lantern', 'ランタン', 450], ['map', '地図', 80], ['apple', 'りんご', 220] ];
  const selected = new Set(['flask', 'compass', 'map']);
  stage.innerHTML = `<div class="sample fieldkit paper-texture"><div class="sample-top"><div class="field-brand">FIELDKIT <span>OUTDOOR SUPPLY CO.</span></div><span class="micro">EXPEDITION / 014</span></div><div class="field-layout"><div class="field-left"><h3>Less, but<br>enough.<span>身軽に、遠くへ。</span></h3><p class="field-copy">北の尾根まで、一泊二日。<br>必要なものを、必要なだけ。</p><div class="field-topography"><div class="contours">${svg(`<g stroke="#748064" stroke-width=".7">${Array.from({length:11},(_,i)=>`<ellipse cx="110" cy="95" rx="${34+i*9}" ry="${22+i*8}" transform="rotate(-28 110 95)"/>`).join('')}</g>`, '0 0 220 200')}</div><div class="bag-art">${backpack()}</div><div class="field-tag">TRAIL No. 04 ↗<br>北アルプス / 秋</div></div></div><div><div class="pack-header"><span>道具をえらぶ</span><b id="pack-count"></b></div><div class="field-gear">${gear.map(([id,label,weight])=>`<button class="gear" data-gear="${id}" aria-label="${label} ${weight}グラム" aria-pressed="${selected.has(id)}">${icon(id)}<b>${label}</b><small>${weight} g</small></button>`).join('')}</div><div class="weight-label"><span>PACK WEIGHT</span><b id="weight-label"></b></div><div class="weight-track"><span id="weight-fill"></span></div><div class="pack-bottom"><p class="status-line" data-status aria-live="polite">忘れものは、ない？</p><button class="solid-btn" id="depart">出発する <span>↗</span></button></div></div></div><div class="field-footer"><span>TAKE ONLY WHAT YOU NEED.</span><span>EST. 1984 / 36°18′ N, 137°37′ E</span></div></div>`;
  const update = () => {
    const weight = gear.reduce((sum,[id,,w])=>sum+(selected.has(id)?w:0),0);
    stage.querySelector('#pack-count').textContent = `${selected.size} / 6 ITEMS`;
    stage.querySelector('#weight-label').textContent = `${(weight/1000).toFixed(2)} / 2.50 kg`;
    stage.querySelector('#weight-fill').style.width = `${Math.min(weight/2500*100,100)}%`;
    stage.querySelector('.fieldkit').classList.toggle('overweight',weight>2500);
    return weight;
  };
  update();
  wire('[data-gear]', el => {
    const id = el.dataset.gear;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    el.setAttribute('aria-pressed', selected.has(id));
    stage.querySelector('.stamp')?.remove();
    stage.querySelector('#depart').innerHTML = '出発する <span>↗</span>';
    const weight = update();
    status(weight>2500 ? `${weight-2500} gオーバー。どれか置いていこう。` : selected.size ? `あと ${((2500-weight)/1000).toFixed(2)} kg、持っていける。` : '道具をひとつ選ぼう。');
  });
  wire('#depart', el => {
    if (!selected.size) { status('道具をひとつ選んでから出発しよう。'); return; }
    if (update()>2500) { status('重すぎるようです。2.50 kg以下にしよう。'); return; }
    if (stage.querySelector('.stamp')) { status('準備完了。よい旅を！ 道具を選び直すと再編集できます。'); return; }
    stage.querySelector('.fieldkit').insertAdjacentHTML('beforeend', '<div class="stamp" aria-hidden="true">TRAIL READY<small>HAVE A GOOD TRIP</small></div>');
    el.innerHTML = '準備完了 <span>✓</span>';
    status(`${selected.size}点、${(update()/1000).toFixed(2)} kg。よい旅を！`);
  });
}

function renderRail() {
  const trains = [ ['23:14','汐見','SHIOMI','2','海沿いの町へ。最終列車は2番線から。'], ['23:28','月ヶ瀬','TSUKIGASE','1','山あいの温泉へ。1番線でお待ちください。'], ['23:46','灯台口','TODAI-GUCHI','3','夜明けの灯台へ。3番線から出発します。'] ];
  let chosen = 0;
  stage.innerHTML = `<div class="sample rail"><div class="rail-head"><span class="rail-logo">北</span><div><h3>北浜駅</h3><small>KITAHAMA STATION</small></div><time>23:08</time></div><div class="rail-layout"><div><div class="departure-labels"><span>時刻</span><span>行き先 / LOCAL</span><span>番線</span></div>${trains.map(([t,n,en,p],i)=>`<button class="train" data-train="${i}" aria-pressed="${i===0}"><time>${t}</time><span><strong>${n}</strong><small>${en}</small></span><span class="platform">${p}</span></button>`).join('')}<p class="rail-route" id="rail-route"></p></div><div class="ticket-wrap"><div class="ticket"><p class="micro">北浜鉄道 / 片道乗車券</p><h4>北浜 <span>→</span> <b id="ticket-to"></b></h4><div class="ticket-detail"><span id="ticket-time"></span><span id="ticket-platform"></span></div><p class="ticket-serial">0482 — 0927</p></div><button class="solid-btn" id="issue-ticket">切符を発券 <span>→</span></button></div></div><p class="status-line" data-status aria-live="polite">今夜は、どこまで行こう。</p></div>`;
  function update() {
    const [time,name,,platform,route] = trains[chosen];
    stage.querySelector('#ticket-to').textContent=name;
    stage.querySelector('#ticket-time').textContent=`${time} 発`;
    stage.querySelector('#ticket-platform').textContent=`${platform} 番線`;
    stage.querySelector('#rail-route').textContent=route;
    stage.querySelector('.ticket').classList.remove('punched');
    stage.querySelector('#issue-ticket').innerHTML='切符を発券 <span>→</span>';
  }
  update();
  wire('[data-train]', el => {
    chosen=Number(el.dataset.train);
    stage.querySelectorAll('[data-train]').forEach(btn=>btn.setAttribute('aria-pressed', btn===el));
    update();
    status(`${trains[chosen][1]}行きを選びました。切符を発券できます。`);
  });
  wire('#issue-ticket', el => {
    restartClass(stage.querySelector('.ticket'),'punched');
    el.innerHTML='発券済み <span>✓</span>';
    status(`${trains[chosen][1]}行きの切符を発券しました。${trains[chosen][3]}番線へどうぞ。`);
  });
}

function renderConsole() {
  let busy=false;
  let sent=0;
  stage.innerHTML = `<div class="sample console"><div class="sample-top"><h3>NIGHT SHIFT / 03</h3><span class="screw" aria-hidden="true">−</span></div><div class="console-body"><div><div class="radar">${svg(`<g stroke="#72875c" stroke-width=".6"><circle cx="100" cy="100" r="76"/><circle cx="100" cy="100" r="52"/><circle cx="100" cy="100" r="26"/><path d="M100 11v178M11 100h178M37 37l126 126M37 163 163 37"/><path d="m100 100 63-62" stroke-width="1.5"/><path d="m100 100 31-82 32 20z" fill="#52663e" opacity=".3"/></g><path d="m40 146 18-13 7 6 22-11 17 7 28-14 31 3" stroke="#a6ba81" stroke-width="1"/>`, '0 0 200 200')}<span class="radar-coordinates">35.6 / 139.7</span><span class="radar-cross"></span></div><p class="micro" style="text-align:center;margin-top:14px">COASTAL OBSERVATORY / EAST</p></div><div class="console-controls"><h4>TRANSMISSION SEQUENCE</h4>${['POWER','ANTENNA','CHANNEL'].map((name,i)=>`<div class="switch-row"><span>0${i+1} / ${name}</span><button class="switch" role="switch" aria-label="${name}" aria-checked="${i===0}"><span></span></button></div>`).join('')}<div class="console-readiness"><i></i><span id="readiness">1 / 3 SYSTEMS READY</span></div><button class="launch" id="transmit" disabled>信号を送る ↗</button></div></div><div class="console-bottom"><span>FREQUENCY: 156.800 MHz<br>OPERATOR: N. MORI / 02:16 AM</span><p class="status-line" data-status aria-live="polite">アンテナと通信回線を接続してください。</p></div></div>`;
  function readyCount() { return stage.querySelectorAll('.switch[aria-checked="true"]').length; }
  function update() {
    const count=readyCount();
    stage.querySelector('#readiness').textContent=`${count} / 3 SYSTEMS READY`;
    stage.querySelector('.console-readiness').classList.toggle('ready',count===3);
    stage.querySelector('#transmit').disabled=count!==3||busy;
    stage.querySelectorAll('.switch').forEach(el=>el.disabled=busy);
  }
  wire('.switch',el=> {
    el.setAttribute('aria-checked',el.getAttribute('aria-checked')!=='true');
    update();
    status(readyCount()===3?'回線接続。いつでも送信できます。':'待機中。3つの回線を接続してください。');
  });
  wire('#transmit',()=> {
    if(busy||readyCount()!==3)return;
    busy=true; update(); status('発信中…');
    const pulse=document.createElement('div'); pulse.className='signal-pulse';stage.querySelector('.radar').append(pulse);
    later(()=> { busy=false;sent++;pulse.remove();update();status(`信号 ${String(sent).padStart(2,'0')} を受信。こちら灯台、異常なし。`); }, reduced()?80:1100);
  });
}

function coastArt() {
  return svg(`<defs><pattern id="sea-hatch" width="28" height="17" patternUnits="userSpaceOnUse"><path d="M2 10h15m5-7h4" stroke="#e8e0c8" stroke-width="1" opacity=".45"/></pattern><pattern id="cliff-hatch" width="13" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)"><path d="M3 0v12m6-7v8" stroke="#e5dabe" stroke-width="1" opacity=".7"/></pattern></defs><path class="sky-fill" d="M0 0h900v560H0z" fill="#e9e2cc"/><circle class="sun-fill" cx="675" cy="129" r="59" fill="#bf6544"/><path class="far-fill" d="m382 251 60-36 37 10 48-38 56 16 47-29 62 41 36-21 69 36 103-31v174H382z" fill="#abb5a1"/><path d="M0 388c117-34 209-47 352-48 124-1 283-43 548-28v248H0z" fill="#50776b"/><path d="M0 388c117-34 209-47 352-48 124-1 283-43 548-28v248H0z" fill="url(#sea-hatch)"/><path d="m588 256 36-40 18-73 24-14 26 8 15 73 33 18 20 44 48 34-63 35-58-16-20 30-95-23-62 19-72-25 84-17z" fill="#244b45"/><path d="m588 256 36-40 18-73 24-14 26 8 15 73 33 18 20 44 48 34-63 35-58-16-20 30-95-23-62 19-72-25 84-17z" fill="url(#cliff-hatch)"/><path d="m635 219 10-56 44-1 11 57-20 17z" fill="#a8b59a"/><path d="m651 166 5-73h21l8 73z" fill="#e8e2cd" stroke="#264d45" stroke-width="2"/><path d="M650 96h32v-8h-32zM653 82l13-15 14 15z" fill="#aa5239" stroke="#264d45" stroke-width="2"/><path d="M656 83h21v7h-21z" fill="#e4c78e" stroke="#264d45" stroke-width="2"/><path d="M666 100v9m0 16v9m-6 21v10" stroke="#264d45" stroke-width="4"/><path class="lighthouse-light" d="m654 86-275-56v138z" fill="#e4ca80" opacity=".12"/><path d="M579 341c84 29 140 32 215 3M532 353c98 39 170 43 266 12M479 371c82 37 134 49 209 41" stroke="#e0ddc4" stroke-width="2"/><path d="M0 523c67-28 107-14 163-6 88 10 128-26 198-14" stroke="#dce0c8" stroke-width="2"/><path class="tide-path" d="M532 479q43-81 126-83" stroke="#ede0af" stroke-width="1.5"/><g class="boat"><path d="m569 463 54 2-13 15h-27z" fill="#e7d6af" stroke="#234b44" stroke-width="2"/><path d="M597 423v42m-2-40-20 32h20z" fill="#d5a06c" stroke="#234b44" stroke-width="2"/><path d="M574 487h52m-43 8h27" stroke="#b8c6ae" stroke-width="1.5"/></g><path d="m454 152 8-4 8 4m30 11 7-3 7 3m-28-30 5-3 5 3" stroke="#254c44" stroke-width="1.5"/><path d="m775 555 25-45 13 5 18-26 69 30v41z" fill="#244b45"/>`, '0 0 900 560');
}
function renderTide() {
  let evening=false;let traveling=false;let arrived=false;
  stage.innerHTML=`<div class="sample tideline paper-texture"><div class="tide-art">${coastArt()}</div><div class="tide-content"><div class="sample-top"><span>A COASTAL WALKING ADVENTURE</span><span>CHAPTER 01</span></div><h3>Tide<em>line.</em></h3><p class="tide-sub">潮の満ちる、その前に。</p><p class="tide-caption" data-status aria-live="polite">誰もいない岬に、灯りがひとつ。<br>今日の届けものは、あの灯台まで。</p><button class="tide-button" id="sail">灯台へ ↗</button></div><div class="tide-bottom"><span>THE LONG WAY HOME / 05:42</span><button id="evening">夕景に切り替え ◐</button></div></div>`;
  stage.querySelector('.tide-art svg').setAttribute('preserveAspectRatio','xMidYMid slice');
  wire('#evening',el=> { evening=!evening;stage.querySelector('.tideline').classList.toggle('evening',evening);el.textContent=evening?'朝景に切り替え ◑':'夕景に切り替え ◐';stage.querySelector('.tide-bottom>span').textContent=`THE LONG WAY HOME / ${evening?'18:24':'05:42'}`; });
  wire('#sail',el=> {
    if(traveling)return;
    if(arrived){stage.querySelector('.tideline').classList.remove('travel');arrived=false;el.textContent='灯台へ ↗';status('もう一度、灯台へ届けものを。');return;}
    traveling=true;el.disabled=true;stage.querySelector('.tideline').classList.add('travel');status('波の合間を、小舟が進む。');
    later(()=>{traveling=false;arrived=true;el.disabled=false;el.textContent='港に戻る ↙';status('灯台に到着。温かいお茶と、次の手紙が待っていた。');},reduced()?80:1800);
  });
}

function renderClub() {
  let points=0;let busy=false;
  stage.innerHTML=`<div class="sample club"><div class="sample-top"><span>NEIGHBORHOOD TABLE TENNIS</span><span>OPEN EVERY SATURDAY</span></div><h3 class="club-title">SMALL<br>TABLE.<br><span>BIG<br>GAME.</span></h3><div class="club-sticker">CLUB No.<b>09</b></div><div class="club-art">${svg(`<defs><pattern id="rubber" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#f1ebcf" opacity=".6"/></pattern></defs><path d="m340 365 90 120 46-35-67-143z" fill="#c9ab6d" stroke="#ed462b" stroke-width="5"/><ellipse cx="300" cy="227" rx="149" ry="175" fill="#ed462b" stroke="#ed462b" stroke-width="11"/><ellipse cx="292" cy="217" rx="149" ry="175" fill="#f0e8cf" stroke="#ed462b" stroke-width="6"/><ellipse cx="290" cy="213" rx="134" ry="158" fill="#ed462b"/><ellipse cx="290" cy="213" rx="134" ry="158" fill="url(#rubber)"/><path d="m364 370 38-25 8 16-37 27z" fill="#292f27"/><path d="m388 405 39-26m-31 40 39-26" stroke="#ed462b" stroke-width="3"/><g class="club-ball"><circle cx="475" cy="145" r="33" fill="#f6efd8" stroke="#ed462b" stroke-width="3"/><path d="M460 129c-13 11-14 23-4 34" stroke="#d7cfb7" stroke-width="3"/></g><path d="m500 222 37-21m-24 42 49-10" stroke="#ed462b" stroke-width="2"/>`, '0 0 620 500')}</div><p class="club-copy">いつもの角で、ひと勝負。<br>上手いかどうかは、あとでいい。</p><div class="club-action"><button id="serve">SERVE ↗</button><p class="status-line" data-status aria-live="polite">FIRST TO FIVE. / 00 — 00</p></div></div>`;
  wire('#serve',el=> {
    if(busy)return;
    if(points===5){points=0;el.textContent='SERVE ↗';status('NEW GAME. / 00 — 00');return;}
    busy=true;el.disabled=true;restartClass(stage.querySelector('.club'),'rally');
    later(()=>{points++;busy=false;el.disabled=false;el.textContent=points===5?'PLAY AGAIN ↺':'ONE MORE ↗';status(points===5?'GAME! / 05 — 00   また来週、ここで。':`NICE SHOT. / ${String(points).padStart(2,'0')} — 00`);},reduced()?80:600);
  });
}

function mushroomArt() {
  return svg(`<g stroke="#58634a" stroke-width="1.7" stroke-linejoin="round"><path d="M41 246c42-9 140-9 187 0" fill="none"/><path d="M89 115h90l7 121H78z" fill="#eee2bd"/><path d="M92 170h22v29H92zM153 158h19v27h-19z" fill="#aaba92"/><path d="M102 170v29m-10-15h22m48-26v27m-9-13h19" fill="none"/><path d="M123 236v-39q0-22 20-20 17 0 17 20v39" fill="#a4af81"/><path d="M132 190v46m9-51v51m9-47v47" stroke="#7d8b66" stroke-width="1"/><circle cx="148" cy="210" r="2" fill="#667455"/><path d="M31 124C58 26 160 6 222 117c-56 30-132 37-191 7Z" fill="#b85943"/><path d="M40 128c61 15 121 18 175-9-38 39-125 46-175 9Z" fill="#d9c6a1"/><g fill="#ebd7b4" stroke="none"><ellipse cx="86" cy="88" rx="16" ry="10" transform="rotate(-30 86 88)"/><ellipse cx="131" cy="58" rx="13" ry="9"/><ellipse cx="163" cy="100" rx="17" ry="12" transform="rotate(15 163 100)"/><ellipse cx="192" cy="105" rx="7" ry="6"/><ellipse cx="116" cy="120" rx="9" ry="5"/></g><path d="M53 193v49m-14-41h27v-20H39z" fill="#ab674a"/><path d="m39 181 13-9 14 9" fill="#815b41"/><path d="M44 187h17" stroke="#eedeb7"/><path d="m25 241 5-18m-5 13-7-8m14 8 7-12m172 13 3-24m-3 13-9-7m12 5 8-12" fill="none"/><path d="M189 243c-8-16 0-33 15-25 12 6 12 20 11 25" fill="#dabd7f"/><path d="m194 220-2-14 9 11m3 0 7-11 1 15" fill="#dabd7f"/><circle cx="203" cy="229" r="1.5" fill="#444d38"/><path d="m192 235-12-1 2-10 14 1z" fill="#eee2bd"/><path d="M82 151h32v9H82z" fill="#eee2bd"/><path d="M86 155h24" stroke="#8d7354"/></g><text x="132" y="271" text-anchor="middle" fill="#657253" font-family="Georgia" font-size="9" letter-spacing="3">WOODLAND POST OFFICE</text>`, '0 0 260 290');
}
function renderPost() {
  const recipients=[['くまさん','丘の上の、くまさんへ。','はちみつのお礼に、<br>焼きたてのパンを持っていきます。<br>明日の朝、いつもの木の下で。','「お茶をいれて、待っているよ。」'],['きつねさん','川のそばの、きつねさんへ。','なくした青いマフラー、<br>郵便局に届いています。<br>帰り道に、寄ってくださいね。','「探していたんだ。ありがとう！」'],['ふくろうさん','大きな樫の、ふくろうさんへ。','今夜は、きれいな満月。<br>屋根の上で読書会をします。<br>お気に入りの一冊を持ってきてね。','「月が出るころに、伺います。」']];
  let chosen=0;let busy=false;
  stage.innerHTML=`<div class="sample post paper-texture"><div class="sample-top"><span>Mushroom Post</span><span>森の郵便局 / 秋便り</span></div><div class="post-layout"><div class="post-illustration">${mushroomArt()}</div><div class="letter"><div class="postage">15<small>FOREST POST</small></div><div class="micro">A LETTER FOR YOU</div><h3 id="recipient-title"></h3><p id="letter-text"></p></div></div><div class="recipient-row"><span>届け先</span>${recipients.map(([name],i)=>`<button data-recipient="${i}" aria-pressed="${i===0}">${name}</button>`).join('')}</div><div class="post-bottom"><p class="status-line" data-status aria-live="polite">かばんに、手紙をひとつ。</p><button class="solid-btn" id="deliver">手紙を届ける <span>→</span></button></div></div>`;
  function update(){stage.querySelector('#recipient-title').textContent=recipients[chosen][1];stage.querySelector('#letter-text').innerHTML=recipients[chosen][2];stage.querySelector('.postmark')?.remove();stage.querySelector('#deliver').innerHTML='手紙を届ける <span>→</span>';}
  update();
  wire('[data-recipient]',el=>{if(busy)return;chosen=Number(el.dataset.recipient);stage.querySelectorAll('[data-recipient]').forEach(b=>b.setAttribute('aria-pressed',b===el));update();status(`${recipients[chosen][0]}への手紙を、かばんに。`);});
  wire('#deliver',el=>{
    if(busy)return;
    if(stage.querySelector('.postmark')){status('配達済みです。別の住人にも手紙を届けよう。');return;}
    busy=true;el.disabled=true;stage.querySelectorAll('[data-recipient]').forEach(b=>b.disabled=true);
    const letter=stage.querySelector('.letter');letter.classList.add('mailed');status('森の小道を、てくてく。');
    later(()=>{letter.classList.remove('mailed');letter.insertAdjacentHTML('beforeend','<div class="postmark" aria-hidden="true">DELIVERED<br>森の郵便局</div>');status(recipients[chosen][3]);el.innerHTML='配達しました <span>✓</span>';el.disabled=false;stage.querySelectorAll('[data-recipient]').forEach(b=>b.disabled=false);busy=false;},reduced()?80:750);
  });
}

function renderCards() {
  let hand=[['A','♠'],['7','♦'],['Q','♣'],['3','♥'],['K','♠']];
  let busy=false;
  stage.innerHTML=`<div class="sample cards"><div class="sample-top"><span>07 / A STUDY IN TIMING</span><span>THE DEALER'S TABLE</span></div><h3>A little sleight of hand.</h3><p class="cards-sub">一枚ずつ、手になじむ。</p><div class="card-table"><div class="table-ring"></div><div id="hand"></div></div><div class="motion-footer"><button class="solid-btn" id="deal">配り直す <span>↻</span></button><p class="status-line" data-status aria-live="polite">5枚のカード。気になる一枚を。</p></div><div class="timing-strip"><i style="width:18%"></i><i style="width:64%"></i><i style="width:18%"></i></div><div class="timing-labels"><span>STAGGER / 90ms</span><span>TRAVEL / 600ms</span><span>SETTLE / 7px</span></div></div>`;
  function draw() {
    stage.querySelector('#hand').innerHTML=hand.map(([value,suit],i)=>`<button class="playing-card ${['♦','♥'].includes(suit)?'red':''}" data-card="${i}" aria-label="${{'♠':'スペード','♦':'ダイヤ','♣':'クラブ','♥':'ハート'}[suit]}の${value}" aria-pressed="false" style="--x:${(i-2)*62}px;--y:${Math.abs(i-2)*11}px;--r:${(i-2)*12}deg;--z:${i+1};--delay:${i*90}ms"><span class="corner">${value}<small>${suit}</small></span><span class="suit">${suit}</span><span class="lower">${value}</span></button>`).join('');
    wire('[data-card]',el=> {
      if(busy)return;
      const i=Number(el.dataset.card);const deselect=el.getAttribute('aria-pressed')==='true';
      stage.querySelectorAll('[data-card]').forEach((b,j)=>{
        const before=getComputedStyle(b).transform;
        b.setAttribute('aria-pressed',b===el&&!deselect);
        b.style.setProperty('--y',`${Math.abs(j-2)*11-(b===el&&!deselect?25:0)}px`);
        animate(b,[{transform:before},{transform:getComputedStyle(b).transform}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'});
      });
      status(deselect?'カードを手札に戻しました。':`${hand[i][1]} ${hand[i][0]} を選びました。もう一度押すと戻ります。`);
    });
  }
  draw();
  wire('#deal',el=>{
    if(busy)return;
    busy=true;el.disabled=true;
    // Fisher–Yates keeps the shuffle independent of the animation cadence.
    for(let i=hand.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[hand[i],hand[j]]=[hand[j],hand[i]];}
    draw();restartClass(stage.querySelector('.card-table'),'dealing');status('一枚、もう一枚。');
    later(()=>{stage.querySelector('.card-table').classList.remove('dealing');busy=false;el.disabled=false;status('配り終えました。一枚、選んでみよう。');},reduced()?80:970);
  });
}

function renderImpact() {
  let busy=false;let hits=0;
  stage.innerHTML=`<div class="sample impact"><div class="sample-top"><span>08 / A STUDY IN WEIGHT</span><span>DO LESS. FEEL MORE.</span></div><div class="impact-title"><h3>ONE GOOD HIT.</h3><span>ためて、止めて、返す。</span></div><div class="fight-scene"><div class="impact-ground"></div>${svg(`<g stroke="#38372f" stroke-linecap="round" stroke-linejoin="round"><path d="M79 256h508" stroke-width="1"/><g class="dummy"><path d="M477 254V123" stroke-width="7"/><path d="M456 251h44" stroke-width="5"/><path d="M454 111q22-18 46 0v66q-26 16-46 0z" fill="#bd694b" stroke-width="3"/><path d="M456 128h41m-41 18h41m-41 18h41" stroke="#e1ae83" stroke-width="2"/><path d="m475 179-12 14 22 12-22 11 22 10-9 13" fill="none" stroke-width="3"/></g><g class="fighter"><path d="m210 205-24 49h-25m61-49 35 46 18 2" stroke-width="13"/><path d="m204 155-5 24 17 34 24-24-4-44" fill="#46665a" stroke-width="3"/><circle cx="223" cy="129" r="20" fill="#d9b487" stroke-width="3"/><path d="M208 117q8-22 30-7l8 10-14-3-21 12" fill="#36392f" stroke-width="2"/><path d="m212 164-23 19-17-22m61-4 27 11 25-19" fill="none" stroke-width="13"/><path d="m282 148 11-3" stroke="#b94e34" stroke-width="19"/><path d="m171 163-6-10" stroke="#b94e34" stroke-width="18"/><path d="m209 207 22-10" stroke="#e6dbc4" stroke-width="4"/></g><g class="impact-line" stroke="#bd4930" stroke-width="3"><path d="m431 132-16-24m27 16 5-29m-23 53-25-3m32 19-19 20m41-16 1 25m10-58 19-23"/><path d="m436 136 11-15-2 20 13 5-16 4-9 18 1-18-14-11z" fill="#e2ad51" stroke-width="1"/></g></g>`, '0 0 660 280')}<span class="hit-number" aria-hidden="true">POW!</span></div><div class="impact-steps"><span>ため / 167ms</span><span>加速</span><span>停止</span><span>戻り / 433ms</span></div><div class="motion-footer"><button class="solid-btn" id="punch">打ち込む <span>→</span></button><p class="status-line" data-status aria-live="polite">接触の瞬間に、約100 msの停止。</p></div></div>`;
  wire('#punch',el=> {
    if(busy)return;
    busy=true;el.disabled=true;restartClass(stage.querySelector('.impact'),'striking');
    later(()=>{hits++;status(`${hits} HIT${hits>1?'S':''}。${reduced()?'命中しました。':'止まる一拍が、重さになる。'}`);busy=false;el.disabled=false;},reduced()?80:770);
  });
}

function renderCounter() {
  let score=990;let busy=false;
  stage.innerHTML=`<div class="sample counter"><div class="sample-top"><span>09 / A STUDY IN MOMENTUM</span><span>MECHANICAL SCOREKEEPER</span></div><h3>Make it count.</h3><p class="counter-sub">たった125点にも、手応えを。</p><div class="machine"><span class="screw" aria-hidden="true">−</span><div class="reels" aria-hidden="true">${[0,9,9,0].map(d=>`<div class="reel"><div class="reel-track"><div class="reel-digit">${d}</div></div></div>`).join('')}</div><div class="machine-label"><span>TOTAL POINTS</span><span>NO. 004 / MADE TO LAST</span></div><span class="screw" aria-hidden="true">−</span></div><div class="counter-bottom"><button class="counter-lever" id="add-score">+125 POINTS ↓</button><p class="status-line" data-status aria-live="polite">現在 0990 点。<br>レバーを押して加点。</p></div><p class="counter-note">DIGIT BY DIGIT. / NO RANDOM NUMBERS, JUST MECHANICS.</p></div>`;
  wire('#add-score',async el=>{
    if(busy)return;
    if(score+125>9999){status('得点機がいっぱいです。リセットで最初から遊べます。');return;}
    busy=true;el.disabled=true;
    const runEpoch=epoch;
    const before=String(score).padStart(4,'0');score+=125;const after=String(score).padStart(4,'0');
    status('桁を送っています…');
    const promises=[];
    stage.querySelectorAll('.reel-track').forEach((track,i)=>{
      const start=Number(before[i]);const end=Number(after[i]);
      if(start===end)return;
      const steps=(end-start+10)%10;
      const height=track.querySelector('.reel-digit').getBoundingClientRect().height;
      track.innerHTML=Array.from({length:steps+1},(_,j)=>`<div class="reel-digit">${(start+j)%10}</div>`).join('');
      const y=-height*steps;
      const animation=animate(track,[{transform:'translateY(0)',offset:0},{transform:`translateY(${y-3}px)`,offset:.86},{transform:`translateY(${y}px)`,offset:1}],{duration:600+steps*35,delay:(3-i)*70,easing:'cubic-bezier(.22,.7,.24,1)',fill:'forwards'});
      promises.push(animation.finished.then(()=>{if(runEpoch!==epoch)return;track.innerHTML=`<div class="reel-digit">${end}</div>`;animation.cancel();}).catch(()=>{}));
    });
    await Promise.all(promises);
    if(runEpoch!==epoch)return;
    status(`現在 ${after} 点。125点が加わりました。`);busy=false;el.disabled=false;
  });
}

const groups=[['01 / INTERFACE','UI',0,3],['02 / ART DIRECTION','デザイン',3,6],['03 / MOTION','アニメーション',6,9]];
document.querySelector('#index').innerHTML=groups.map(([title,jp,start,end])=>`<div class="index-group"><div class="index-heading"><span>${title}</span><small>${jp}</small></div>${studies.slice(start,end).map((s,i)=>`<a class="index-link" href="#${s.id}" data-study="${s.id}"><span class="num">${String(start+i+1).padStart(2,'0')}</span><span><strong>${s.name}</strong><small>${s.sub}</small></span><span class="arrow">↗</span></a>`).join('')}</div>`).join('');
function showStudy(id) {
  const study=studies.find(s=>s.id===id)||studies[0];
  clearEffects();current=study;
  document.querySelectorAll('[data-study]').forEach(link=>{if(link.dataset.study===study.id)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.querySelector('#sample-label').textContent=`${String(studies.indexOf(study)+1).padStart(2,'0')} / ${study.category}`;
  document.querySelector('#note-category').textContent=`${study.category} / ${study.name}`;
  document.querySelector('#note-title').textContent=study.title;
  document.querySelector('#note-description').textContent=study.description;
  document.querySelector('#note-instruction').textContent=study.instruction;
  document.querySelector('#note-principle').textContent=study.principle;
  stage.setAttribute('aria-label',`${study.name} — ${study.sub}`);
  study.render();
}
document.querySelectorAll('[data-study]').forEach(link=>link.addEventListener('click',event=>{
  if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  if(location.hash!==link.hash)history.pushState(null,'',link.hash);
  showStudy(link.dataset.study);
}));
window.addEventListener('hashchange',()=>{if(location.hash!=='#sample'&&current?.id!==location.hash.slice(1))showStudy(location.hash.slice(1));});
window.addEventListener('popstate',()=>{if(location.hash!=='#sample'&&current?.id!==location.hash.slice(1))showStudy(location.hash.slice(1));});
document.querySelector('#reset').addEventListener('click',()=>showStudy(current.id));
reduceControl.checked=systemMotion.matches;
function syncMotion(){document.documentElement.classList.toggle('reduced-motion',reduced());if(reduced())activeAnimations.forEach(a=>{try{a.finish();}catch{}});}
reduceControl.addEventListener('change',syncMotion);
systemMotion.addEventListener('change',()=>{reduceControl.checked=systemMotion.matches;syncMotion();});
syncMotion();
showStudy(location.hash.slice(1));
