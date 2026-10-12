'use strict';
const stage = document.querySelector('#stage'), reduce = document.querySelector('#reduce');
const pref = matchMedia('(prefers-reduced-motion: reduce)'), logic = globalThis.MoreLogic;
const $ = s => stage.querySelector(s), $$ = s => [...stage.querySelectorAll(s)];
const animations = new Set(), timers = new Set();
let revision = 0, category = 0, game = 0;
const names = ['High Roll', '超次元バトル', 'ROOM'];
const groups = ['UI', 'デザイン', 'アニメーション'];
const hashes = [['role-pick','resolve-order','room-aim'],['highroll-entry','dimension-entry','room-entry'],['anger-response','chain-response','dash-response']];
const notes = [
  ['役職を選択。能力は「能力」で開き、「決定」で確定します。', 'High Rollのroles.jsonの疾風・憤怒・怪物を参照。数値は現行カタログと同じくroles.jsonを優先。役職選択だけの試作です。'],
  ['各カードの矢印で並べ替え、「解決」。同じ手札でも順序で合計が変わります。', 'シンプルの初期攻撃・魔法50、筋トレ・パンチ・はどうだんの3枚に限定。筋トレは基礎攻撃と一時攻撃を+30、パンチは一時攻撃×2で攻撃、はどうだんは一時魔法×2で攻撃。その後max(攻撃,魔法)の最終攻撃。継続ラウンド・追加発動は省略。'],
  ['地形の上でマウスを動かして照準。クリックかQで発動。照準にフォーカス中は左右キーでも回せます。', 'ゼウスのボルトショックの照準・命中表示です。半径0.5、前縁から0.5〜3.2の3領域、各20ダメージ。練習標的は各HP60。発動間隔・残留効果・CD・移動・敵AIを止めたUI見本です。'],
  ['紋章を選び、矢印で役職選択へ。', 'High Rollの役職を、生成画像に依存しない3つのSVG紋章で表現。現在の役職名と入口だけを置いています。'],
  ['矢印からカード配置へ。', '3枚のカード面をずらして重ねた入口。青い面と白い余白を主に使い、常時動く背景は置きません。'],
  ['「出撃」で照準の見本へ。', 'ROOMの地形とプレイヤーを使った入口。地図はこの見本用に作ったSVGで、実ゲームのマップではありません。'],
  ['「被弾」でHP-2、Atk+1。HPが0になるまで比較できます。', '憤怒のHP30、Atk11。受けたダメージ/2を切り捨てて攻撃トークンを獲得する定義を参照。ダメージ量は確定済みの2として扱い、防御計算・対戦進行は省略。'],
  ['「再生」で筋トレ→パンチ→はどうだん→最終攻撃を順に表示。', '数値はUI案と同じ計算です。今解決しているカードだけを持ち上げます。結果は420ダメージ。動きなしでは待たずに最終結果を表示します。'],
  ['右矢印か「ダッシュ」で右へ移動。次のダッシュでは左へ戻ります。', 'ROOMの基準56px、距離2.5、移動0.2秒、CD7秒を参照。冷却中は再入力不可。「動きなし」でも距離とCDは同じです。敵・衝突・カメラ追従は省略。'],
];
function bind(s, fn) { $$(s).forEach(el => el.addEventListener('click', () => fn(el))); }
function mount(cls, html) { stage.innerHTML = `<div class="scene ${cls}">${html}<p class="sr-only" role="status" id="status"></p></div>`; }
function say(text) { $('#status').textContent = text; }
function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); }
function clean() { revision++; animations.forEach(a => a.cancel()); animations.clear(); timers.forEach(clearTimeout); timers.clear(); }
function motion(el, frames, duration = 240) {
  if (reduce.checked || pref.matches) return Promise.resolve();
  const a = el.animate(frames, { duration, easing:'cubic-bezier(.2,.75,.25,1)' }); animations.add(a);
  return a.finished.catch(() => {}).finally(() => animations.delete(a));
}
const roles = [
  { name:'疾風', stats:[30,5,2,13,1], color:'#617b63', ability:'攻撃のたびに追加Speを獲得。追加Speの蓄積でBraが増え、被ダメージ時には追加Speを消費して軽減。' },
  { name:'憤怒', stats:[30,11,0,5,1], color:'#ae593a', ability:'受けたダメージの半分（切り捨て）だけ、Atkトークンを獲得。' },
  { name:'怪物', stats:[10,10,20,10,1], color:'#786743', ability:'残りプレイヤーが2人になると、最大HPが1になる。' },
];
function crest(i) {
  const paths = [
    '<path d="M31 61h54q20 0 20-18t-23-9M18 83h97q27 0 27-25M35 105h52q20 0 20 16t-23 9" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="square"/>',
    '<path d="m32 36 38 26 10-40 16 42 35-23-17 41 26 25-42-3-13 42-19-39-37 10 17-34z" fill="currentColor"/><path d="m59 84 15 7 29-18" fill="none" stroke="var(--paper,#eae2ce)" stroke-width="7"/>',
    '<path d="m31 28 24 27h50l24-27-4 63-23 42H58L35 91z" fill="currentColor"/><path d="m47 74 22 11m44-11-22 11M68 113l12-12 12 12" fill="none" stroke="var(--paper,#eae2ce)" stroke-width="7"/>',
  ];
  return `<svg viewBox="0 0 160 160" aria-hidden="true">${paths[i]}</svg>`;
}
function roleUI(initial = 0) {
  let selected = initial, locked = false;
  mount('role-ui', `<nav class="role-list" aria-label="役職">${roles.map((r,i) => `<button data-role="${i}"><span>${crest(i)}</span>${r.name}<i></i></button>`).join('')}</nav><div class="role-main"><div class="role-seal" id="role-seal"></div><h1 id="role-name"></h1><dl class="role-stats" id="role-stats"></dl><details class="role-ability"><summary>能力</summary><p id="role-ability"></p></details><button class="role-confirm" id="role-confirm">決定 <span>→</span></button></div>`);
  function sync() {
    const r=roles[selected]; $('.role-ui').style.setProperty('--ink',r.color); $('#role-seal').innerHTML=crest(selected); $('#role-name').textContent=r.name;
    $('#role-stats').innerHTML=['HP','Atk','Def','Spe','Bra'].map((s,i)=>`<div><dt>${s}</dt><dd>${r.stats[i]}</dd></div>`).join(''); $('#role-ability').textContent=r.ability;
    $$('[data-role]').forEach(b=>{b.setAttribute('aria-pressed',Number(b.dataset.role)===selected);b.disabled=locked;});
  }
  bind('[data-role]', b=>{selected=Number(b.dataset.role);sync();});
  bind('#role-confirm', b=>{locked=!locked; b.innerHTML=locked?'変更する <span>↶</span>':'決定 <span>→</span>'; $('.role-main').classList.toggle('confirmed',locked); sync();say(locked?`${roles[selected].name}に決定。`:'役職を変更できます。');}); sync();
}

const deck = {
  train:{name:'筋トレ',value:'+30',label:'基礎攻撃',type:'train',glyph:'╱'},
  punch:{name:'パンチ',value:'×2',label:'攻撃 → ダメージ',type:'punch',glyph:'↗'},
  wave:{name:'はどうだん',value:'×2',label:'魔法 → ダメージ',type:'wave',glyph:'◎'},
};
function face(id) { const c=deck[id]; return `<span class="formula-glyph">${c.glyph}</span><strong>${c.name}</strong><b>${c.value}</b><small>${c.label}</small>`; }
function numbers() { return '<div class="chain-stats"><span>攻撃 <b id="attack">50</b></span><span>魔法 <b id="magic">50</b></span><span>合計 <b id="damage">0</b></span></div>'; }
function setNumbers(a,m,d) { $('#attack').textContent=String(a);$('#magic').textContent=String(m);$('#damage').textContent=String(d); }
function chainUI() {
  let order=['train','punch','wave'],done=false;
  mount('chain-ui', `${numbers()}<div class="chain-line" id="chain-line"></div><div class="chain-bottom"><span id="chain-phase">シンプル</span><button id="resolve">解決 <span>→</span></button></div>`);
  function draw() { $('#chain-line').innerHTML=order.map((id,i)=>`<div class="formula-card ${id}" data-chain="${id}"><span class="sequence">0${i+1}</span>${face(id)}<div class="reorder"><button data-shift="${i},-1" aria-label="${deck[id].name}を左へ" ${i===0||done?'disabled':''}>←</button><button data-shift="${i},1" aria-label="${deck[id].name}を右へ" ${i===2||done?'disabled':''}>→</button></div></div>`).join('');
    bind('[data-shift]',b=>{const [i,d]=b.dataset.shift.split(',').map(Number);[order[i],order[i+d]]=[order[i+d],order[i]];draw();say(order.map(id=>deck[id].name).join('、'));});
  }
  bind('#resolve',b=>{if(done){done=false;setNumbers(50,50,0);$('#chain-phase').textContent='シンプル';b.innerHTML='解決 <span>→</span>';}else{const r=logic.resolve(order);done=true;setNumbers(r.attack,r.magic,r.damage);$('#chain-phase').textContent=`最終攻撃 ${r.final}`;b.innerHTML='戻す <span>↶</span>';say(`合計${r.damage}ダメージ。`);} draw();});draw();
}

function terrain(extra='') {
  return `<svg class="terrain" viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path fill="#354b3f" d="M0 0h1000v520H0z"/><path fill="#425844" d="m0 0 380 0-63 88 61 115-65 77 19 96-57 144H0zM820 0h180v520H801l71-152-87-121 37-104z"/><path fill="#6c7660" d="m587 0-29 111 16 69-96 82-21 85 33 173h89l-42-160 24-62 102-89-18-98L675 0z"/><path fill="#344e50" d="m626 0-37 114 16 77-95 88-21 68 39 173h33l-35-166 24-63 102-88-19-90L664 0z"/><g fill="none" stroke="#899078" stroke-width="1" opacity=".27"><path d="M0 97q178-95 250 0t-46 242T97 520M0 139q134-89 188-10t-67 183T24 480M1000 55q-189 93-94 222t-85 243M1000 90q-127 70-53 177t-59 253"/></g><g fill="#283b32" stroke="#62735a" stroke-width="1"><path d="m129 193 57-27 32 45-24 46-57-17zM695 355l49-14 38 32-9 51-69-17zM779 94l30-23 45 19-5 45-59 7z"/></g>${extra}</svg>`;
}
function roomUI() {
  let angle=0;const hp=[60,60,60],centers=[84,131.6,179.2],origin=[310,260];
  mount('room-ui', `${terrain()}<svg class="aim-field" id="aim-field" viewBox="0 0 1000 520" role="application" tabindex="0" aria-label="ボルトショックの照準。マウスか左右キーで向き、クリックかQで発動"><g class="aim-targets">${centers.map((d,i)=>`<g data-target="${i}" transform="translate(${origin[0]+d},260)"><circle r="11"/><text y="-22" text-anchor="middle" data-target-hp="${i}">60</text></g>`).join('')}</g><g id="aim-cone" transform="rotate(0 310 260)"><path d="M310 260h206"/>${centers.map(d=>`<circle cx="${310+d}" cy="260" r="28"/>`).join('')}</g><g transform="translate(310 260)" class="player-marker"><circle r="14"/><path id="player-direction" d="m-5 6 16-6-16-6z"/></g></svg><div class="room-hud"><div class="room-hp"><span>ゼウス</span><b>240</b><i></i></div><button id="cast" title="ボルトショック"><kbd>Q</kbd> ボルトショック</button></div>`);
  function aim(a){angle=a;$('#aim-cone').setAttribute('transform',`rotate(${angle} 310 260)`);$('#player-direction').setAttribute('transform',`rotate(${angle})`);}
  function cast(){const rad=angle*Math.PI/180;hp.forEach((h,i)=>{if(!h)return;const targetX=310+centers[i],targetY=260;const hits=centers.filter(d=>Math.hypot(targetX-(310+Math.cos(rad)*d),targetY-(260+Math.sin(rad)*d))<=39).length;hp[i]=Math.max(0,h-hits*20);$(`[data-target-hp="${i}"]`).textContent=String(hp[i]);$(`[data-target="${i}"]`).classList.toggle('down',hp[i]===0);});say(`標的のHP ${hp.join('、')}。`);}
  $('#aim-field').addEventListener('pointermove',e=>{const r=e.currentTarget.getBoundingClientRect();const x=(e.clientX-r.left)*1000/r.width,y=(e.clientY-r.top)*520/r.height;aim(Math.atan2(y-260,x-310)*180/Math.PI);});
  $('#aim-field').addEventListener('click',cast);$('#aim-field').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','q','Q'].includes(e.key)){e.preventDefault();if(e.key.startsWith('Arrow'))aim(angle+(e.key==='ArrowLeft'?-15:15));else cast();}});bind('#cast',cast);
}

function highrollTitle() {
  let selected=0;
  mount('highroll-title', `<h1>HIGH<br>ROLL</h1><div class="entry-seal" id="entry-seal">${crest(0)}</div><div class="entry-roles">${roles.map((r,i)=>`<button data-entry-role="${i}" aria-label="${r.name}" aria-pressed="${i===0}">${crest(i)}</button>`).join('')}</div><span class="entry-role-name" id="entry-role-name">疾風</span><button id="enter-highroll" aria-label="役職選択へ">↗</button>`);
  bind('[data-entry-role]',b=>{selected=Number(b.dataset.entryRole);$('#entry-seal').innerHTML=crest(selected);$('#entry-role-name').textContent=roles[selected].name;$('.highroll-title').style.setProperty('--ink',roles[selected].color);$$('[data-entry-role]').forEach(el=>el.setAttribute('aria-pressed',el===b));});bind('#enter-highroll',()=>roleUI(selected));
}
function dimensionTitle() {
  mount('dimension-title', `<h1>超次元<br>バトル</h1><div class="dimension-planes" aria-hidden="true">${['train','punch','wave'].map(id=>`<div class="dimension-plane ${id}"><span>${deck[id].glyph}</span></div>`).join('')}</div><button id="enter-dimension" aria-label="カード配置へ">→</button>`);bind('#enter-dimension',chainUI);
}
function roomTitle() {
  mount('room-title', `${terrain()}<div class="room-entry-player" aria-hidden="true"><i></i></div><h1>ROOM<span>Royale Of Outlaws & Monsters</span></h1><button id="enter-room">出撃 <span>↗</span></button>`);bind('#enter-room',roomUI);
}

function angerMotion() {
  let hp=30,atk=11,busy=false;
  mount('anger-motion', `<div class="anger-crest">${crest(1)}</div><h1>憤怒</h1><div class="anger-values"><div><span>HP</span><b id="anger-hp">30</b><i id="anger-loss"></i></div><span class="anger-link">→</span><div><span>Atk</span><b id="anger-atk">11</b><i id="anger-gain"></i></div></div><button id="take-damage">被弾 <span>−2</span></button>`);
  bind('#take-damage',async b=>{if(busy)return;if(!hp){angerMotion();return;}busy=true;b.disabled=true;const run=revision,result=logic.anger(hp,atk,2);hp=result.hp;atk=result.attack;$('#anger-hp').textContent=String(hp);$('#anger-atk').textContent=String(atk);$('#anger-loss').textContent='−2';$('#anger-gain').textContent='+1';
    await Promise.all([motion($('#anger-hp'),[{transform:'translateY(0)'},{transform:'translateY(4px)',offset:.4},{transform:'translateY(0)'}],180),motion($('#anger-atk'),[{transform:'translateY(5px)',opacity:.5},{transform:'translateY(0)',opacity:1}],240)]);
    if(run!==revision)return;busy=false;b.disabled=false;if(!hp)b.innerHTML='もう一度 <span>↻</span>';say(`HP${hp}、Atk${atk}。`);
  });
}
function chainMotion() {
  let busy=false;
  mount('chain-motion', `${numbers()}<div class="chain-line">${['train','punch','wave'].map((id,i)=>`<div class="formula-card ${id}" data-chain="${id}"><span class="sequence">0${i+1}</span>${face(id)}</div>`).join('')}</div><div class="chain-bottom"><span id="chain-phase"></span><button id="play-chain">再生 <span>→</span></button></div>`);
  bind('#play-chain',async b=>{if(busy)return;busy=true;b.disabled=true;const run=revision,result=logic.resolve(['train','punch','wave']);setNumbers(50,50,0);$$('[data-chain]').forEach(el=>el.classList.remove('resolved'));$('#chain-phase').textContent='';
    for(const s of result.steps){const el=$(`[data-chain="${s.id}"]`);el.classList.add('resolving');setNumbers(s.attack,s.magic,s.damage);await motion(el,[{transform:'translateY(0)'},{transform:'translateY(-12px)',offset:.35},{transform:'translateY(-12px)',offset:.7},{transform:'translateY(0)'}],460);if(run!==revision)return;el.classList.remove('resolving');el.classList.add('resolved');}
    setNumbers(result.attack,result.magic,result.damage);$('#chain-phase').textContent=`最終攻撃 +${result.final}`;say(`合計${result.damage}ダメージ。`);busy=false;b.disabled=false;b.innerHTML='もう一度 <span>↻</span>';
  });
}
function dashMotion() {
  let x=280,busy=false;
  mount('dash-motion', `${terrain()}<div class="dash-plane"><div class="dash-origin" id="dash-origin"></div><div class="dash-player" id="dash-player" style="left:280px"><i></i></div></div><div class="dash-control"><button id="dash" aria-label="右へダッシュ"><kbd>→</kbd> ダッシュ</button><span id="cooldown"></span><i class="cooldown-track"><i id="cooldown-fill"></i></i></div>`);
  bind('#dash',async b=>{if(busy)return;busy=true;b.disabled=true;const run=revision,old=x;x=x===280?420:280;const el=$('#dash-player');el.style.left=`${x}px`;$('#dash-origin').style.left=`${old}px`;$('#dash-origin').classList.add('visible');$('#cooldown').textContent='7';$('#cooldown-fill').style.width='0%';
    for(let s=1;s<=7;s++)later(()=>{if(run!==revision)return;$('#cooldown').textContent=s===7?'':String(7-s);$('#cooldown-fill').style.width=`${s/7*100}%`;if(s===7){busy=false;b.disabled=false;b.setAttribute('aria-label',x===280?'右へダッシュ':'左へダッシュ');b.innerHTML=`<kbd>${x===280?'→':'←'}</kbd> ダッシュ`;say('ダッシュ可能。');}},s*1000);
    await motion(el,[{transform:`translateX(${old-x}px)`},{transform:'translateX(0)'}],200);if(run!==revision)return;say('2.5移動。');$('#dash-origin').classList.remove('visible');
  });
  $('.dash-motion').tabIndex=0;$('.dash-motion').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(!busy)$('#dash').click();}});
}

const renderers=[[roleUI,chainUI,roomUI],[highrollTitle,dimensionTitle,roomTitle],[angerMotion,chainMotion,dashMotion]];
function show(c,g,push=true){clean();category=c;game=g;if(push)history.pushState(null,'','#'+hashes[c][g]);document.querySelector('#categories').innerHTML=groups.map((name,i)=>`<button data-category="${i}" aria-pressed="${i===c}">${name}</button>`).join('');document.querySelector('#games').innerHTML=names.map((name,i)=>`<button data-game="${i}" aria-pressed="${i===g}">${name}</button>`).join('');document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>show(Number(b.dataset.category),game)));document.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>show(category,Number(b.dataset.game))));document.querySelector('#sample-number').textContent=String(37+c*3+g);document.querySelector('#motion-option').hidden=c!==2;stage.setAttribute('aria-label',`${names[g]} / ${groups[c]}`);renderers[c][g]();}
function route(){const id=location.hash.slice(1);if(id==='stage'||(stage.firstElementChild&&hashes[category][game]===id))return;for(let c=0;c<3;c++)for(let g=0;g<3;g++)if(hashes[c][g]===id){show(c,g,false);return;}show(0,0,false);}
document.querySelector('#reset').addEventListener('click',()=>show(category,game,false));document.querySelector('#help').addEventListener('click',()=>{document.querySelector('#notes-title').textContent=`${names[game]} / ${groups[category]}`;document.querySelector('#notes-action').textContent=notes[category*3+game][0];document.querySelector('#notes-scope').textContent=notes[category*3+game][1];document.querySelector('#notes').showModal();});
function syncMotion(){document.documentElement.classList.toggle('reduced',reduce.checked||pref.matches);if(reduce.checked||pref.matches)animations.forEach(a=>a.finish());}
reduce.addEventListener('change',syncMotion);pref.addEventListener('change',syncMotion);window.addEventListener('popstate',route);window.addEventListener('hashchange',route);syncMotion();route();
