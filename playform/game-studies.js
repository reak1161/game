'use strict';
const G=globalThis.PlayformLogic;
const stage=document.querySelector('#sample');
const reduceControl=document.querySelector('#reduce-motion');
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');
const timers=new Set(),animations=new Set();
let generation=0,current;
const $=s=>stage.querySelector(s);
const $$=s=>[...stage.querySelectorAll(s)];
const quiet=()=>reduceControl.checked||systemMotion.matches;
function later(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;}
function motion(el,frames,options){const a=el.animate(frames,{...options,duration:quiet()?1:options.duration,delay:quiet()?0:options.delay||0});animations.add(a);a.finished.then(()=>animations.delete(a)).catch(()=>animations.delete(a));return a;}
function cleanup(){generation++;timers.forEach(clearTimeout);timers.clear();animations.forEach(a=>a.cancel());animations.clear();}
function on(selector,fn){$$(selector).forEach(e=>e.addEventListener('click',()=>fn(e)));}
function say(text){$('[data-status]').textContent=text;}
function mount(name,html){stage.innerHTML=`<div class="sample game-sample ${name}">${html}</div>`;}
const svg=(body,box='0 0 100 100')=>`<svg viewBox="${box}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const pips=(hp,max=10)=>`<span class="rw-pips" aria-hidden="true">${Array.from({length:max},(_,i)=>`<i class="${i<hp?'filled':''}"></i>`).join('')}</span>`;
function wolfArt(){return svg(`<path d="m57 192 26-76-7-66 49 31 52-31 22 64 47 45-22 27-31 62-66 28-61-27z" fill="currentColor"/><path d="m92 97 20 10-18 16m61-15 20-18-2 31m-57 50 17 29 21-30-7 49-18 19-17-25z" fill="#e8dfc9"/><path d="m95 146 25 8-16 6m52-6 24-11-14 16" stroke="#e8dfc9" stroke-width="4"/><path d="m94 183-16 35m21-30-7 46m13-37 4 45m57-55 9 35m-13-25-3 39m27-65 12 25M86 134l-8 20m17-26-5 13m98-19 14 17m-8-8 17 22" stroke="#e8dfc9" stroke-width="1.4"/><path d="m96 243 28 11 27-12" stroke="#e8dfc9" stroke-width="2"/>`, '0 0 270 310');}
function sigil(kind){return svg(kind==='attack'?'<path d="m24 74 49-50 6-3-2 10-47 49zM25 58l17 17M22 74l-7 8" stroke="currentColor" stroke-width="3"/><path d="m65 23 12-3-2 12" fill="currentColor"/>':kind==='defense'?'<path d="M22 24q28 4 56 0v28Q74 72 50 87 26 72 22 52z" stroke="currentColor" stroke-width="3"/><path d="M50 30v49M29 50h42" stroke="currentColor" stroke-width="2"/>':'<path d="m20 30 13 5 17-20 17 20 13-5-7 49H27z" stroke="currentColor" stroke-width="2"/><path d="M50 26v44M28 79h44M33 86h34" stroke="currentColor" stroke-width="3"/>');}
const people=[{name:'まお',sprite:'blue_man.png',hp:500,mp:50,color:'#426688',cmd:'たいあたり',stat:'攻撃 300 / 速さ 100',spd:100},{name:'しょう',sprite:'red_man.png',hp:300,mp:250,color:'#b65b44',cmd:'てっぺき',stat:'防御 85 / 速さ 76',spd:76},{name:'ぽんきち',sprite:'green_man.png',hp:330,mp:50,color:'#5b7750',cmd:'でんこうせっか',stat:'攻撃 130 / 速さ 200',spd:200},{name:'まさよし',sprite:'yellow_man.png',hp:300,mp:150,color:'#aa8135',cmd:'だくりゅう',stat:'MP 150 / 速さ 80',spd:80}];
const sprite=(i,cls='')=>`<img class="lt-sprite ${cls}" src="assets/${people[i].sprite}" alt="${people[i].name}" draggable="false">`;
const gameTop=(name,meta)=>`<div class="g-top"><strong>${name}</strong><span>${meta}</span></div>`;
const result=(text)=>`<p class="g-status" data-status role="status">${text}</p>`;
const action=(id,text)=>`<button class="g-action" id="${id}">${text}<span aria-hidden="true">↗</span></button>`;

function renderWolfUI(){
  const enemies=[{name:'ナギ',hp:8,shield:1,role:'役職は伏せられている'},{name:'リン',hp:6,shield:0,role:'騎士 / CO済み'},{name:'ハル',hp:9,shield:2,role:'役職は伏せられている'}];
  const hand=[{title:'アタック',level:2,kind:'attack'},{title:'ディフェンス',level:1,kind:'defense'},{title:'ツインズ',level:2,kind:'twins'}];
  let selected=2,choice='attack',target=0,selfShield=0,used=new Set();
  mount('rw-ui',`${gameTop('ライトウルフ','夜 / フェーズ 02')}<div class="rw-intro"><div><span class="g-eyebrow">YOUR TURN</span><h3>この一枚を、誰に。</h3></div><span class="rw-you">あなた <b>10</b><small>防御 <em id="self-shield">0</em></small></span></div><div class="rw-opponents">${enemies.map((e,i)=>`<button class="rw-person" data-target="${i}" aria-pressed="${i===0}"><span class="rw-seat">0${i+1}<i aria-hidden="true">${i===1?'♜':'?'}</i></span><strong>${e.name}</strong><small>${e.role}</small><span class="rw-vitals"><span data-hp="${i}">HP ${e.hp} / 10</span><span data-shield="${i}">防御 ${e.shield}</span></span><span data-pips="${i}">${pips(e.hp)}</span></button>`).join('')}</div><div class="rw-hand-label"><span>手札から、一枚</span><span id="hand-count">3 CARDS</span></div><div class="rw-hand">${hand.map((c,i)=>`<button class="rw-card ${c.kind}" data-card="${i}" aria-pressed="${i===2}"><span class="rw-card-no">${c.kind==='twins'?'ATTACK / DEFENSE':c.kind.toUpperCase()}</span><span class="rw-card-art">${sigil(c.kind==='twins'?'attack':c.kind)}</span><strong>${c.title}</strong><span class="rw-level">LV. ${c.level}</span>${c.kind==='twins'?'<span class="rw-twins-line">攻撃 2 ／ 防御 2</span>':''}</button>`).join('')}</div><div class="rw-resolution"><div class="rw-choice" aria-label="ツインズの効果"><button data-choice="attack" aria-pressed="true">攻撃に使う</button><button data-choice="defense" aria-pressed="false">防御に使う</button></div><div class="rw-equation" id="resolution"></div>${action('play-card','この内容で使う')}</div>${result('ツインズを選択中。効果と相手を選んでから確定。')}`);
  function update(){
    const c=hand[selected],e=enemies[target];
    $$('[data-card]').forEach((b,i)=>{b.setAttribute('aria-pressed',i===selected);b.disabled=used.has(i);b.classList.toggle('spent',used.has(i));});
    $$('[data-target]').forEach((b,i)=>{b.setAttribute('aria-pressed',i===target&&choice==='attack');b.disabled=choice==='defense'||enemies[i].hp===0;});
    $('.rw-choice').hidden=c.kind!=='twins';
    $$('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.choice===choice));
    $('#resolution').innerHTML=choice==='attack'?`<span>${e.name}へ</span><b>${c.level}</b><span>− 防御 ${Math.min(e.shield,c.level)} ＝</span><strong>${Math.max(0,c.level-e.shield)}<small> ダメージ</small></strong>`:`<span>あなたの防御</span><b>${selfShield}</b><span>＋ ${c.level} ＝</span><strong>${selfShield+c.level}</strong>`;
    $('#hand-count').textContent=`${3-used.size} CARDS`;
    if(used.has(selected))$('#resolution').textContent=used.size===3?'3枚とも使いました。リセットでもう一度。':'使用済みです。ほかの手札を選んでください。';
    $('#play-card').disabled=used.has(selected)||(choice==='attack'&&e.hp===0);
  }
  on('[data-target]',e=>{target=Number(e.dataset.target);update();say(`${enemies[target].name}への効果を確認してください。`);});
  on('[data-card]',e=>{selected=Number(e.dataset.card);choice=hand[selected].kind==='defense'?'defense':'attack';update();say(`${hand[selected].title} LV.${hand[selected].level} を選択。`);});
  on('[data-choice]',e=>{choice=e.dataset.choice;update();say(choice==='defense'?'防御は自分に適用されます。':'攻撃する相手を選んでください。');});
  on('#play-card',()=>{
    if(used.has(selected))return;
    const c=hand[selected],e=enemies[target];
    if(choice==='attack'){
      const resolved=G.attack(e.hp,e.shield,c.level);Object.assign(e,{hp:resolved.hp,shield:resolved.shield});
      $(`[data-hp="${target}"]`).textContent=`HP ${e.hp} / 10`;$(`[data-shield="${target}"]`).textContent=`防御 ${e.shield}`;$(`[data-pips="${target}"]`).innerHTML=pips(e.hp);
      say(`${e.name}に${resolved.damage}ダメージ。${resolved.blocked}を防御で軽減。カードを1枚使いました。`);
    }else{selfShield+=c.level;$('#self-shield').textContent=selfShield;say(`あなたの防御が${selfShield}になりました。カードを1枚使いました。`);}
    used.add(selected);update();
  });update();
}

function mini(type,turns=0){const cells=G.rotate(type,turns);return `<span class="qd-mini" style="--cols:${Math.max(...cells.map(p=>p[0]))+1}">${Array.from({length:(Math.max(...cells.map(p=>p[0]))+1)*(Math.max(...cells.map(p=>p[1]))+1)},(_,i)=>{const width=Math.max(...cells.map(p=>p[0]))+1;return `<i class="${cells.some(([x,y])=>x===i%width&&y===Math.floor(i/width))?'on':''}"></i>`;}).join('')}</span>`;}
function boardMarkup(board,interactive=false){return `<div class="qd-frame"><div class="qd-edge top">蒼 / こちらの岸</div><span class="qd-edge left">朱</span><div class="qd-board" ${interactive?'role="group" aria-label="15×15の盤面。矢印キーで移動、Enterで仮置き"':'aria-label="15×15の接続盤面"'}>${board.map((v,i)=>interactive?`<button class="qd-cell ${v?'team-'+v:''}" data-cell="${i}" tabindex="${i===112?0:-1}" aria-label="${i%15+1}列${Math.floor(i/15)+1}行 ${v===1?'蒼':v===2?'朱':'空き'}"></button>`:`<span class="qd-cell ${v?'team-'+v:''}" data-square="${i}"></span>`).join('')}</div><span class="qd-edge right">朱</span><div class="qd-edge bottom">蒼 / 対岸</div></div>`;}
function seedBoard(){const b=Array(225).fill(0);[[6,0],[7,0],[6,1],[7,1],[7,3],[7,4],[7,5],[8,5],[7,12],[8,12],[7,13],[7,14]].forEach(([x,y])=>b[y*15+x]=1);[[0,7],[1,7],[2,7],[2,8],[11,7],[12,7],[13,7],[14,7],[10,9],[11,9],[11,10],[12,10]].forEach(([x,y])=>b[y*15+x]=2);return b;}
function renderQuadUI(){
  const board=seedBoard(),types=['L','T','O'],turns={L:0,T:0,O:0};let type='L',anchor=[6,7],team=1,placements=0,winner=0;
  mount('qd-ui',`${gameTop('QUADRIDGE','LOCAL TABLE / 15 × 15')}<div class="qd-layout"><div>${boardMarkup(board,true)}</div><aside class="qd-tools"><span class="g-eyebrow">PLACEMENT DESK</span><h3>向きを決めて。<br>岸をつなごう。</h3><p class="qd-turn" id="qd-turn">蒼の手番 <span>↕ 上から下へ</span></p><div class="qd-candidates">${types.map(t=>`<button data-shape="${t}" aria-label="${t}型を選ぶ" aria-pressed="${t===type}">${mini(t)}<small>${t}</small></button>`).join('')}</div><div class="qd-rotate"><button id="rotate-left" aria-label="左へ90度回転">↶</button><span id="rotation">0°</span><button id="rotate-right" aria-label="右へ90度回転">↷</button></div><div class="qd-coordinate"><span>仮置きの左上</span><strong id="coordinate"></strong></div><p id="placement-valid" class="qd-valid"></p>${action('place-piece','ここに置く')}<p class="qd-tip">マスを押すと仮置き。<br>矢印キーでも移動できます。</p></aside></div><div class="qd-bottom"><span id="placement-count">00 手 配置済み</span>${result('淡い4マスは仮置きです。位置と回転を確認して確定。')}</div>`);
  function update(){
    const placement=G.placement(board,15,G.rotate(type,turns[type]),...anchor);
    $$('[data-cell]').forEach((b,i)=>{const pending=placement.points.some(([x,y])=>x===i%15&&y===Math.floor(i/15));b.className=`qd-cell ${board[i]?'team-'+board[i]:''} ${pending?'preview team-preview-'+team:''} ${pending&&!placement.valid?'invalid':''}`;b.textContent=pending&&!placement.valid?'×':'';b.setAttribute('aria-label',`${i%15+1}列${Math.floor(i/15)+1}行 ${board[i]===1?'蒼':board[i]===2?'朱':'空き'}${pending?' 仮置き':''}`);b.tabIndex=i===anchor[1]*15+anchor[0]?0:-1;});
    $$('[data-shape]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.shape===type);b.innerHTML=`${mini(b.dataset.shape,turns[b.dataset.shape])}<small>${b.dataset.shape}</small>`;});
    $('#rotation').textContent=`${turns[type]*90}°`;$('#coordinate').textContent=`${String.fromCharCode(65+anchor[0])} · ${String(anchor[1]+1).padStart(2,'0')}`;
    $('#placement-valid').textContent=winner?'対岸までつながりました。':placement.valid?'✓ 4マスとも配置できます':'× 盤外か、すでに埋まったマスです';
    $('#place-piece').disabled=!placement.valid||!!winner;
    $('#qd-turn').innerHTML=`${team===1?'蒼':'朱'}の手番 <span>${team===1?'↕ 上から下へ':'↔ 左から右へ'}</span>`;
    $('.qd-ui').dataset.team=team;
  }
  $$('[data-cell]').forEach(b=>{
    b.addEventListener('click',()=>{if(winner)return;anchor=[Number(b.dataset.cell)%15,Math.floor(Number(b.dataset.cell)/15)];update();say('仮置き位置を変えました。「ここに置く」で確定します。');});
    b.addEventListener('keydown',event=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta||winner)return;event.preventDefault();anchor=[Math.max(0,Math.min(14,anchor[0]+delta[0])),Math.max(0,Math.min(14,anchor[1]+delta[1]))];update();$(`[data-cell="${anchor[1]*15+anchor[0]}"]`).focus();});
  });
  on('[data-shape]',e=>{type=e.dataset.shape;update();});
  on('#rotate-left',()=>{turns[type]=(turns[type]+3)%4;update();});on('#rotate-right',()=>{turns[type]=(turns[type]+1)%4;update();});
  on('#place-piece',()=>{
    const p=G.placement(board,15,G.rotate(type,turns[type]),...anchor);if(!p.valid||winner)return;
    p.points.forEach(([x,y])=>board[y*15+x]=team);placements++;
    const path=G.connection(board,15,team);winner=path.length?team:0;const placedTeam=team;if(!winner)team=3-team;
    $('#placement-count').textContent=`${String(placements).padStart(2,'0')} 手 配置済み`;update();
    p.points.forEach(([x,y])=>motion($(`[data-cell="${y*15+x}"]`),[{transform:'translateY(-4px)'},{transform:'translateY(0)'}],{duration:140,easing:'cubic-bezier(.4,0,1,1)'}));
    if(winner){path.forEach(i=>$(`[data-cell="${i}"]`).classList.add('connected'));say(`${winner===1?'蒼':'朱'}の勝ち。対岸まで${path.length}マスで接続しました。`);}else say(`${placedTeam===1?'蒼':'朱'}が4マスを配置。次は${team===1?'蒼':'朱'}の手番です。`);
  });update();
}

function renderLattitleUI(){
  let selected=1,destination=null,busy=false;const positions=[0,5,10,15];
  mount('lt-ui',`${gameTop('ラティトル','作戦盤 / へびとの戦い')}<div class="lt-layout"><div class="lt-field"><div class="lt-enemy"><img src="assets/snake.png" alt="へび"><div><span class="g-eyebrow">次の攻撃</span><h3>しっぽうち</h3><p>2列目 / 予告から5秒で着弾</p></div><span class="lt-warning-symbol">!</span></div><div class="lt-board" role="group" aria-label="4×4の作戦盤">${Array.from({length:16},(_,i)=>`<button data-tile="${i}" class="lt-tile ${i%4===1?'hazard':''}" aria-label="${i%4+1}列${Math.floor(i/4)+1}行"><span class="lt-cell-no">${i%4+1}·${Math.floor(i/4)+1}</span></button>`).join('')}</div><div class="lt-legend"><span>斜線：攻撃予告</span><span>点線：移動先</span></div></div><aside class="lt-orders"><span class="g-eyebrow">仲間を選んで、移動先を指示</span><div class="lt-party">${people.map((p,i)=>`<button data-member="${i}" aria-pressed="${i===selected}">${sprite(i)}<span><strong>${p.name}</strong><small>HP ${p.hp} / MP ${p.mp}</small></span><i style="--member:${p.color}"></i></button>`).join('')}</div><div class="lt-order-summary"><span id="order-name"></span><strong id="order-destination">移動先を選択</strong><p id="order-time">予告マスにいる仲間を、安全な場所へ。</p></div>${action('move-member','このマスへ移動')}<p class="lt-command" id="member-command"></p></aside></div>${result('しょうが攻撃範囲にいます。空いているマスを選んで退避。')}`);
  function update(){
    $$('[data-tile]').forEach((b,i)=>{b.querySelector('img')?.remove();const member=positions.indexOf(i);if(member!==-1)b.insertAdjacentHTML('beforeend',sprite(member));b.classList.toggle('selected',positions[selected]===i);b.classList.toggle('destination',destination===i);b.setAttribute('aria-label',`${i%4+1}列${Math.floor(i/4)+1}行 ${member!==-1?people[member].name:'空き'}${i%4===1?' 攻撃予告':''}`);b.disabled=busy;});
    $$('[data-member]').forEach((b,i)=>{b.setAttribute('aria-pressed',selected===i);b.disabled=busy;});
    $('#order-name').textContent=people[selected].name+'への指示';
    $('#order-destination').textContent=destination===null?'移動先を選択':`${destination%4+1}列 ${Math.floor(destination/4)+1}行へ`;
    const steps=destination===null?0:Math.abs(destination%4-positions[selected]%4)+Math.abs(Math.floor(destination/4)-Math.floor(positions[selected]/4));
    $('#order-time').textContent=destination===null?'予告マスにいる仲間を、安全な場所へ。':`${steps}マス / 移動 約${(steps*5*.2**(people[selected].spd/100)).toFixed(1)}秒${destination%4===1?' / 移動先も攻撃範囲です':''}`;
    $('#move-member').disabled=busy||destination===null;
    $('#member-command').textContent=`得意なコマンド / ${people[selected].cmd}`;
  }
  on('[data-member]',e=>{selected=Number(e.dataset.member);destination=null;update();say(`${people[selected].name}の移動先を選んでください。`);});
  on('[data-tile]',e=>{const index=Number(e.dataset.tile),member=positions.indexOf(index);if(member!==-1){selected=member;destination=null;}else destination=index;update();say(member!==-1?`${people[selected].name}を選択。`:index%4===1?'この移動先も攻撃予告の範囲内です。':'安全な移動先です。移動時間を確認できます。');});
  on('#move-member',()=>{
    if(busy||destination===null)return;busy=true;
    const from=positions[selected],to=destination,a=$(`[data-tile="${from}"]`).getBoundingClientRect(),b=$(`[data-tile="${to}"]`).getBoundingClientRect();
    const steps=Math.abs(from%4-to%4)+Math.abs(Math.floor(from/4)-Math.floor(to/4));const duration=steps*5*.2**(people[selected].spd/100)*1000;
    const who=selected,run=generation;update();const liveActor=$(`[data-tile="${from}"] img`);liveActor.classList.add('moving');
    const horizontal=Math.abs(from%4-to%4)/steps;const frames=[{transform:'translate(0,0)',offset:0}];if(horizontal>0&&horizontal<1)frames.push({transform:`translate(${b.left-a.left}px,0)`,offset:horizontal});frames.push({transform:`translate(${b.left-a.left}px,${b.top-a.top}px)`,offset:1});
    motion(liveActor,frames,{duration,easing:'linear',fill:'forwards'}).finished.then(()=>{if(run!==generation)return;positions[who]=to;destination=null;busy=false;update();say(`${people[who].name}が${to%4+1}列${Math.floor(to/4)+1}行に移動。${to%4===1?'まだ攻撃範囲です。別の列へ移動しよう。':'攻撃範囲から退避できました。'}`);}).catch(()=>{});
  });update();
}

function renderWolfDesign(){
  let day=false,joined=false,ready=false;
  mount('rw-poster',`${gameTop('LIGHTWOLF','一卓、六人まで。')}<div class="rw-poster-art">${wolfArt()}</div><div class="rw-poster-copy"><span class="rw-chapter">昼は探り、夜は仕掛ける。</span><h3>その正体は、<br><em>まだ伏せて。</em></h3><p>最後まで立っていた者が、勝つ。<br>手の内を隠して、一枚を切る。</p><button id="join-table" class="rw-join">卓につく <span>↗</span></button></div><div class="rw-moon" aria-hidden="true">◒</div><div class="rw-table"><div class="rw-table-label"><span>今夜の卓</span><button id="day-night">昼の版を見る ◐</button></div><div class="rw-seats">${['ナギ','リン','ハル','空席','空席','空席'].map((name,i)=>`<div data-seat="${i}" class="${i<3?'occupied':''}"><span>0${i+1}</span><b>${name}</b><i></i></div>`).join('')}</div>${result('3 / 6人 着席。あなたの席が、ひとつ。')}</div>`);
  on('#day-night',e=>{day=!day;$('.rw-poster').classList.toggle('day',day);e.textContent=day?'夜の版を見る ◑':'昼の版を見る ◐';});
  on('#join-table',e=>{if(!joined){joined=true;const seat=$('[data-seat="3"]');seat.classList.add('occupied','your-seat');seat.querySelector('b').textContent='あなた';e.innerHTML='準備を完了する <span>✓</span>';say('4 / 6人 着席。席につきました。準備ができたら合図を。');}else{ready=!ready;$('[data-seat="3"]').classList.toggle('ready',ready);e.innerHTML=ready?'準備を取り消す <span>↶</span>':'準備を完了する <span>✓</span>';say(ready?'あなたは準備完了。ほかのプレイヤーを待っています。':'準備を取り消しました。席はそのままです。');}});
}

function renderQuadDesign(){
  let color=1,started=false;
  mount('qd-poster',`${gameTop('Q / 15','A GAME OF CONNECTIONS')}<div class="qd-poster-type"><span>QUAD</span><span>RIDGE<span class="qd-period">.</span></span></div><div class="qd-poster-blocks" aria-hidden="true">${svg('<path d="M20 0h80v80h80v160h-80v80H20z" fill="#35678c"/><path d="M180 80h80v80h80v80h80v80H180v-80h-80v-80h80z" fill="#c45137"/><path d="M340 0h80v80h-80zM20 400h80v80H20z" fill="#d2c9af"/><path d="M12 328h416M12 336h416" stroke="#313c3b" stroke-width="1"/>','0 0 440 480')}</div><p class="qd-poster-line">四つ置く。<br>ひとつにつなぐ。</p><div class="qd-rule-stub"><b>15 × 15</b><span>4マスずつ、交互に。<br>先に対岸へつなげよう。</span></div><div class="qd-entry"><div class="qd-side-picker"><span>最初の手番</span><button data-side="1" aria-pressed="true">蒼 ↕</button><button data-side="2" aria-pressed="false">朱 ↔</button></div>${action('open-match','対局をはじめる')}</div>${result('蒼は上下、朱は左右。あなたなら、どこからつなぐ？')}`);
  on('[data-side]',e=>{color=Number(e.dataset.side);$$('[data-side]').forEach(b=>b.setAttribute('aria-pressed',b===e));$('.qd-poster').classList.toggle('red-first',color===2);say(`${color===1?'蒼 / 上下':'朱 / 左右'}を選びました。`);});
  on('#open-match',e=>{
    if(started){renderQuadDesign();return;}started=true;
    const art=$('.qd-poster-blocks');art.classList.add('opening-board');const board=Array(225).fill(0);G.rotate('L').forEach(([x,y])=>board[(y+6)*15+x+6]=color);art.innerHTML=boardMarkup(board);
    e.innerHTML='入口に戻る <span>↶</span>';$('.qd-poster-line').innerHTML='最初の四マス。<br>ここから、対岸へ。';$$('[data-side]').forEach(b=>b.disabled=true);say(`${color===1?'蒼':'朱'}が最初のL型を置いた、対局画面へのつながり方です。`);
  });
}

function renderLattitleDesign(){
  let selected=0,entered=false;
  mount('lt-book',`${gameTop('ラティトル','冒険の記録 / 第一章')}<div class="lt-book-layout"><div class="lt-book-copy"><span class="lt-book-chapter">01</span><p class="g-eyebrow">THE FIRST ENCOUNTER</p><h3>小さな盤上の、<br>大きな冒険。</h3><p class="lt-book-prose">四人いれば、道はある。<br>一歩を読み、呼吸を合わせ、<br>あの、へびの先へ。</p><div class="lt-book-roster">${people.map((p,i)=>`<button data-portrait="${i}" aria-label="${p.name}の紹介" aria-pressed="${i===0}">${sprite(i)}<span>${p.name}</span></button>`).join('')}</div></div><div class="lt-book-plate"><div class="lt-book-plate-head"><span>図一 / 最初の出会い</span><span>地属性</span></div><img class="lt-book-snake" src="assets/snake.png" alt="最初の敵 へび"><div class="lt-book-grid" aria-hidden="true">${Array.from({length:16},(_,i)=>`<div>${i%5===0?sprite(i/5):'<i></i>'}</div>`).join('')}</div><div class="lt-book-caption"><span>FIELD NOTES</span><p>四つの列、四つの行。<br>移動の選択が、戦いを変える。</p></div></div></div><div class="lt-book-bottom"><div id="adventurer"><b>まお</b><span>HP 500 / たいあたり</span></div>${action('read-chapter','最初の一戦へ')}</div>${result('仲間の絵を押して、得意なことを確かめよう。')}`);
  on('[data-portrait]',e=>{selected=Number(e.dataset.portrait);$$('[data-portrait]').forEach(b=>b.setAttribute('aria-pressed',b===e));const p=people[selected];$('#adventurer').innerHTML=`<b>${p.name}</b><span>HP ${p.hp} / ${p.cmd}</span>`;say(`${p.name}：${p.stat}。得意なコマンドは${p.cmd}。`);});
  on('#read-chapter',e=>{entered=!entered;$('.lt-book').classList.toggle('chapter-open',entered);$('.lt-book-plate-head>span').textContent=entered?'戦闘準備 / 四人、位置につく':'図一 / 最初の出会い';e.innerHTML=entered?'記録に戻る <span>↶</span>':'最初の一戦へ <span>↗</span>';say(entered?'四人の初期位置を確認。盤上の斜線が、次の攻撃予告です。':'仲間の絵を押して、得意なことを確かめよう。');});
}

function renderWolfMotion(){
  const roles=[{name:'人狼',effect:'CO中、攻撃カードの通常ダメージが1増える。',label:'攻撃 +1',art:'wolf'},{name:'占い師',effect:'CO時、指定した相手の伏せ役職を自分だけ確認。',label:'本人だけに情報',art:'seer'},{name:'騎士',effect:'CO中、防御カードで得る防御値が1増える。',label:'防御 +1',art:'knight'}];
  let chosen=0,revealed=false,busy=false;
  mount('rw-reveal',`${gameTop('ライトウルフ','ROLE / COMING OUT')}<div class="rw-reveal-layout"><div class="rw-role-space"><div class="rw-role-card" id="role-card"><div class="rw-role-back"><div class="rw-back-ornament">${svg('<path d="m50 12 35 38-35 38L15 50zM50 22l25 28-25 28L25 50z" stroke="currentColor"/><circle cx="50" cy="50" r="9" stroke="currentColor"/><path d="M50 0v20m0 60v20M0 50h20m60 0h20" stroke="currentColor"/>')}</div><span>役職 / 伏せ</span><small>LIGHTWOLF</small></div><div class="rw-role-front" aria-hidden="true"></div></div><span class="rw-role-shadow"></span></div><div class="rw-reveal-copy"><span class="g-eyebrow">YOUR ROLE, YOUR TIMING.</span><h3>一拍置いて、<br>正体を明かす。</h3><p>カードが立つ。<br>卓の視線が、一人に集まる。</p><div class="rw-role-options" aria-label="自分の役職を選ぶ">${roles.map((r,i)=>`<button data-role="${i}" aria-pressed="${i===0}">${r.name}</button>`).join('')}</div>${action('reveal-role','役職をCOする')}<div class="rw-role-effect" id="role-effect">公開すると、役職の能力が有効になります。</div></div></div><div class="g-timing"><span>持ち上げ 180ms</span><span>真横で止める 100ms</span><span>表を置く 360ms</span></div>${result('自分の役職を選んで、公開の動きを試せます。')}`);
  function reset(){revealed=false;$('#role-card').classList.remove('revealed');$('.rw-role-front').innerHTML='';$('.rw-role-front').setAttribute('aria-hidden','true');$('.rw-role-back').setAttribute('aria-hidden','false');$('#reveal-role').innerHTML='役職をCOする <span>↗</span>';$('#role-effect').textContent='公開すると、役職の能力が有効になります。';}
  on('[data-role]',e=>{chosen=Number(e.dataset.role);reset();$$('[data-role]').forEach(b=>b.setAttribute('aria-pressed',b===e));say(`自分の役職：${roles[chosen].name}。まだ公開していません。`);});
  on('#reveal-role',e=>{
    if(busy)return;if(revealed){reset();say('再生用に伏せ直しました。');return;}busy=true;e.disabled=true;$$('[data-role]').forEach(b=>b.disabled=true);const role=roles[chosen],run=generation;
    const card=$('#role-card');
    // This is the player's own selected role. Populate its back-facing face before motion;
    // expose it to assistive technology only once the reveal is complete.
    $('.rw-role-front').innerHTML=`<span class="rw-front-art">${role.art==='wolf'?wolfArt():role.art==='knight'?sigil('defense'):svg('<path d="M10 50q40-50 80 0-40 50-80 0Z" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="50" r="15" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="50" r="5" fill="currentColor"/>')}</span><strong>${role.name}</strong><small>役職公開 / CO</small>`;
    const flip=motion(card,[{transform:'rotateY(0) translateY(0)',offset:0},{transform:'rotateY(90deg) translateY(-12px)',offset:.28125},{transform:'rotateY(90deg) translateY(-12px)',offset:.4375},{transform:'rotateY(180deg) translateY(0)',offset:1}],{duration:640,easing:'linear',fill:'forwards'});
    flip.finished.then(()=>{if(run!==generation)return;card.classList.add('revealed');flip.cancel();$('.rw-role-front').setAttribute('aria-hidden','false');$('.rw-role-back').setAttribute('aria-hidden','true');busy=false;revealed=true;e.disabled=false;e.innerHTML='もう一度見る <span>↻</span>';$$('[data-role]').forEach(b=>b.disabled=false);$('#role-effect').innerHTML=`<strong>${role.label}</strong><span>${role.effect}</span>`;say(`${role.name}をCOしました。${role.effect}`);}).catch(()=>{});
  });
}

function renderQuadMotion(){
  const board=Array(225).fill(0);for(let y=0;y<15;y++)if(y<6||y>9)board[y*15+7]=1;
  [[0,6],[1,6],[2,6],[2,7],[10,10],[11,10],[12,10],[13,10]].forEach(([x,y])=>board[y*15+x]=2);
  let busy=false,finished=false;
  mount('qd-trace',`${gameTop('QUADRIDGE','CONNECTION / ONE LAST PIECE')}<div class="qd-layout"><div>${boardMarkup(board)}<div class="qd-trace-legend"><i></i> 接続したマスだけを、順にたどる。</div></div><aside class="qd-tools"><span class="g-eyebrow">THE MOMENT IT CONNECTS</span><h3>勝ち筋が、<br>目で追える。</h3><p class="qd-trace-copy">置いた四マスから、<br>盤面の端まで。<br>つながった理由を見せる。</p><div class="qd-final-piece">${mini('I',1)}<span>最後のピース<br><b>I 型 / H7 → H10</b></span></div>${action('connect','最後の4マスを置く')}<strong class="qd-winner" id="winner-label">あと、四マス。</strong></aside></div><div class="g-timing"><span>配置 160ms</span><span>接続をたどる 55ms / マス</span><span>結果は、最後に。</span></div>${result('蒼の道は中央で途切れています。I型でつなげてみよう。')}`);
  for(let y=6;y<=9;y++)$(`[data-square="${y*15+7}"]`).classList.add('trace-gap');
  on('#connect',e=>{
    if(busy)return;if(finished){renderQuadMotion();return;}busy=true;e.disabled=true;
    const points=G.placement(board,15,G.rotate('I',1),7,6).points;points.forEach(([x,y])=>{board[y*15+x]=1;const square=$(`[data-square="${y*15+x}"]`);square.className='qd-cell team-1';motion(square,[{transform:'translateY(-12px)',opacity:.2},{transform:'translateY(0)',opacity:1}],{duration:160,easing:'cubic-bezier(.4,0,1,1)'});});
    const path=G.connection(board,15,1);say('蒼のマスがつながりました。対岸までの経路を確認中。');
    path.forEach((i,n)=>later(()=>$(`[data-square="${i}"]`).classList.add('connected'),quiet()?0:200+n*55));
    later(()=>{finished=true;busy=false;e.disabled=false;e.innerHTML='もう一度つなぐ <span>↻</span>';$('#winner-label').textContent='蒼、接続。';$('#winner-label').classList.add('done');say(`蒼の勝ち。上端から下端まで、${path.length}マスの経路がつながっています。`);},quiet()?30:200+path.length*55);
  });
}

function renderLattitleMotion(){
  let escape=true,busy=false,finished=false;
  mount('lt-dodge',`${gameTop('ラティトル','しっぽうち / 5秒の読み合い')}<div class="lt-dodge-head"><div><span class="g-eyebrow">READ. MOVE. SURVIVE.</span><h3>避けたことまで、伝わる。</h3></div><div class="lt-dodge-hp">まお <strong id="dodge-hp">500</strong><span>/ 500 HP</span></div></div><div class="lt-dodge-layout"><div class="lt-dodge-arena"><img class="lt-dodge-snake" src="assets/snake.png" alt="へび"><div class="lt-motion-board" aria-label="4×4の盤面">${Array.from({length:16},(_,i)=>`<span class="lt-motion-cell" data-motion-cell="${i}">${i===9?sprite(0,'dodge-actor'):''}<span>${i%4===1?'!':''}</span></span>`).join('')}</div><div class="lt-impact-message" id="dodge-result"></div></div><aside class="lt-dodge-control"><span class="g-eyebrow">同じ予告を、二つの結果で。</span><div class="lt-behavior"><button data-behavior="escape" aria-pressed="true"><strong>退避する</strong><small>2列目 → 3列目</small></button><button data-behavior="stay" aria-pressed="false"><strong>その場に残る</strong><small>攻撃を受ける</small></button></div><div class="lt-seconds"><strong id="seconds">5.0</strong><span>秒 / 着弾まで</span></div>${action('run-dodge','予告を再生')}<p class="lt-demo-detail">移動は1マス、1秒。<br>まおの移動速度に合わせた動き。</p></aside></div><div class="lt-event-timeline"><div class="lt-time-fill" id="time-fill"></div><span>0s 予告</span><span>1s 移動開始</span><span>5s 着弾</span></div>${result('予告された列をよく見て、二つの結果を比較できます。')}`);
  function resetScene(){$$('.lt-motion-cell').forEach(e=>e.classList.remove('warn','hit'));const actor=$('.dodge-actor');actor.style.transform='';$('[data-motion-cell="9"]').prepend(actor);$('#seconds').textContent='5.0';$('#dodge-hp').textContent='500';$('#time-fill').style.width='0%';$('#dodge-result').textContent='';$('#run-dodge').innerHTML='予告を再生 <span>↗</span>';finished=false;}
  on('[data-behavior]',e=>{escape=e.dataset.behavior==='escape';$$('[data-behavior]').forEach(b=>b.setAttribute('aria-pressed',b===e));resetScene();say(escape?'攻撃予告を見て、隣の列へ退避します。':'その場に残ったときの、被弾の見え方を確認します。');});
  on('#run-dodge',e=>{
    if(busy)return;if(finished)resetScene();busy=true;e.disabled=true;$$('[data-behavior]').forEach(b=>b.disabled=true);const run=generation;
    for(let y=0;y<4;y++)$(`[data-motion-cell="${y*4+1}"]`).classList.add('warn');
    const duration=quiet()?80:5000,start=performance.now();
    say('へびがしっぽうちを予告。2列目に着弾します。');
    function tick(){if(run!==generation)return;const progress=Math.min(1,(performance.now()-start)/duration);$('#seconds').textContent=(5*(1-progress)).toFixed(1);$('#time-fill').style.width=`${progress*100}%`;if(progress<1)later(tick,quiet()?10:50);}
    tick();
    if(escape)later(()=>{const a=$('[data-motion-cell="9"]').getBoundingClientRect(),b=$('[data-motion-cell="10"]').getBoundingClientRect();const actor=$('.dodge-actor');motion(actor,[{transform:'translateX(0)'},{transform:`translateX(${b.left-a.left}px)`}],{duration:1000,easing:'linear'}).finished.then(()=>{if(run===generation)$('[data-motion-cell="10"]').prepend(actor);}).catch(()=>{});say('まおが隣の列へ移動。予告は、元の列に残ります。');},quiet()?0:1000);
    later(()=>{
      for(let y=0;y<4;y++){const square=$(`[data-motion-cell="${y*4+1}"]`);square.classList.remove('warn');square.classList.add('hit');motion(square,[{background:'#c57443'},{background:'#f0b777'},{background:'#d6bd8d'}],{duration:270,easing:'steps(3)'});}
      $('#seconds').textContent='0.0';$('#time-fill').style.width='100%';$('#dodge-result').textContent=escape?'回避':'−142';$('#dodge-hp').textContent=escape?'500':'358';
      if(!escape)motion($('.dodge-actor'),[{transform:'translateX(0)'},{transform:'translateX(7px)'},{transform:'translateX(7px)'},{transform:'translateX(0)'}],{duration:260,easing:'steps(2)'});
      say(escape?'回避成功。HPは500のまま。攻撃は移動前の列に着弾しました。':'しっぽうちが命中。HP 500 → 358。予告された列から退避しよう。');
      busy=false;finished=true;e.disabled=false;e.innerHTML='もう一度見る <span>↻</span>';$$('[data-behavior]').forEach(b=>b.disabled=false);
    },duration+20);
  });
}

const studies=[
  {id:'wolf-hand',name:'手札と対象',game:'ライトウルフ',category:'INTERFACE',title:'何を、誰に、どれだけ。',description:'カードを選ぶ、効果を選ぶ、対象を決める。ツインズの二択と、防御で軽減されるダメージを、一続きの判断にする。くすんだ紙と濃い葡萄色で、夜の卓の落ち着きを。',instruction:'カードと対象を選択して確定。ツインズは攻撃・防御を切り替え可能。使ったカードは手札から外れます。',principle:'App.tsx の手札・対象・使用確認へ。カード値と防御処理は既存仕様に準拠。ターン進行は省いた手札操作の抜粋です。',render:renderWolfUI},
  {id:'quad-desk',name:'配置の作業台',game:'QUADRIDGE',category:'INTERFACE',title:'確定するまで、よく考えられる。',description:'大きな盤面の横に、選んだ形・向き・座標だけを置く。仮置きは淡い面、置けない位置は×。色だけに頼らず、操作の途中と確定を区別する。',instruction:'形を選び、マスを押して仮置き。回転して「ここに置く」。蒼と朱が交互に置けます。盤面は矢印キーにも対応。',principle:'battle-ui.js の候補・ゴースト・確定へ。15×15、4マス、直交接続を再現。候補の補充・延長配置は含みません。',render:renderQuadUI},
  {id:'lattitle-orders',name:'予告と移動指示',game:'ラティトル',category:'INTERFACE',title:'危ないのは誰か。次に、どこへ。',description:'敵の予告を盤面に残し、仲間の選択と移動先の確認を隣り合わせに。実際の4人と4×4盤面を使って、避けるために必要な情報の順番を組み直す。',instruction:'仲間を選び、空きマスを選択して移動。移動先も危険なら注意を表示。各キャラの速さに応じて移動時間が変わります。',principle:'remake/app.js の board・party・setRoute 周辺へ。確認用に予告時間は停止。戦闘全体を止める仕様の提案ではありません。',render:renderLattitleUI},
  {id:'wolf-table',name:'夜の集会所',game:'ライトウルフ',category:'ART DIRECTION',title:'秘密のある卓には、静けさを。',description:'切り紙の人狼、縦に流れる和文、六人分の席。正体を隠してカードを切るゲームの緊張を、余白と濃淡でつくる。昼と夜は背景色だけでなく、紙とインクの関係ごと反転。',instruction:'昼夜の版を切り替え。「卓につく」で着席し、準備完了・取り消しを試せます。参加者は固定の見本です。',principle:'タイトル・ルーム待機画面へ。席順・自分の席・準備状態を保ったまま、縦の見出しと版画を固有の顔に。',render:renderWolfDesign},
  {id:'quad-print',name:'四マスのポスター',game:'QUADRIDGE',category:'ART DIRECTION',title:'ルールが、そのままロゴになる。',description:'四角がつながる形を、大きく裁ち落とす。蒼・朱の二色と、詰めたタイポグラフィ。ゲームの名前、駒、勝ち方を一枚の大会ポスターとしてまとめる。',instruction:'最初の手番を蒼・朱から選択。「対局をはじめる」で、最初のL型を置いた盤面への遷移を試せます。',principle:'ホーム・対局導入へ。線の発光に頼らず、平面の色と余白で接続ゲームの個性を出す。ここは対局開始までの見本です。',render:renderQuadDesign},
  {id:'lattitle-fieldbook',name:'冒険の記録帳',game:'ラティトル',category:'ART DIRECTION',title:'今いる四人を、画面の主役に。',description:'既存のドット絵を、図鑑や攻略本の見開きのように扱う。新しい装飾で覆わず、へびの輪郭と四人の色がよく見える、温かい余白を足す。',instruction:'仲間を押してHPと得意技を確認。「最初の一戦へ」で初期配置と予告のある版に切り替え。',principle:'タイトル・戦闘導入へ。既存のblue/red/green/yellow_man.pngとsnake.pngをそのまま使用。紹介と戦闘の絵柄が一致します。',render:renderLattitleDesign},
  {id:'wolf-reveal',name:'COの一拍',game:'ライトウルフ',category:'MOTION',title:'公開は、一つの出来事にする。',description:'カードを持ち上げ、真横で100ms待ち、それから正体を見せる。光を散らす代わりに、情報が変わる瞬間へ視線を集める。能力の説明はカードが収まってから。',instruction:'自分の役職を選んでCO。人狼・占い師・騎士の3種類を試せます。「もう一度見る」で再生用に伏せ直します。',principle:'REVEAL_ROLE の表示へ。実装時はサーバーの公開確定後に再生。非公開の相手役職はDOMにも渡さず、演出と情報権限を分離。',render:renderWolfMotion},
  {id:'quad-connect',name:'勝ち筋をたどる',game:'QUADRIDGE',category:'MOTION',title:'「勝った」より先に、「つながった」。',description:'ピースが着地してから、同じ色の経路を端から端へたどる。最後に勝者名が収まる。盤面を覆わないので、勝ちを決めた四マスをそのまま振り返れる。',instruction:'最後のI型を置いて接続。実際に探索した経路の15マスだけを順に表示します。再生後は繰り返し可能。',principle:'connectivity / judgement の勝利経路へ。四方向の経路探索結果を使い、無関係なマスは光らせない。入力受付はゲーム側の確定に従う。',render:renderQuadMotion},
  {id:'lattitle-dodge',name:'予告・退避・着弾',game:'ラティトル',category:'MOTION',title:'避けた手応えも、ちゃんと残す。',description:'危険な列は着弾まで動かさない。仲間だけが1秒かけて移動し、最後に元の列へ攻撃が落ちる。被弾時との比較で、位置とHPに何が起きたかが分かる。',instruction:'「退避する」と「その場に残る」を切り替えて5秒の予告を再生。回避ならHP維持、命中なら142減少の固定例。',principle:'engine.js の hazards・route・effects を表示に渡す。5秒のしっぽうち予告と、まおの1マス1秒に準拠。ダメージ乱数は固定化。',render:renderLattitleMotion},
];

const groups=[['01 / INTERFACE','UI',0,3],['02 / ART DIRECTION','デザイン',3,6],['03 / MOTION','アニメーション',6,9]];
document.querySelector('#index').innerHTML=groups.map(([title,jp,start,end])=>`<div class="index-group"><div class="index-heading"><span>${title}</span><small>${jp}</small></div>${studies.slice(start,end).map((s,i)=>`<a class="index-link" href="#${s.id}" data-study="${s.id}"><span class="num">${start+i+10}</span><span><strong>${s.name}</strong><small>${s.game}</small></span><span class="arrow">↗</span></a>`).join('')}</div>`).join('');
function show(id){const s=studies.find(s=>s.id===id)||studies[0];cleanup();current=s;document.querySelectorAll('[data-study]').forEach(a=>{if(a.dataset.study===s.id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});document.querySelector('#sample-label').textContent=`${studies.indexOf(s)+10} / ${s.category} / ${s.game}`;document.querySelector('#note-category').textContent=`${s.category} / ${s.game}`;for(const [id,field] of [['note-title','title'],['note-description','description'],['note-instruction','instruction'],['note-principle','principle']])document.getElementById(id).textContent=s[field];stage.setAttribute('aria-label',`${s.game} — ${s.name}`);s.render();}
document.querySelectorAll('[data-study]').forEach(a=>a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();if(location.hash!==a.hash)history.pushState(null,'',a.hash);show(a.dataset.study);}));
window.addEventListener('hashchange',()=>{if(location.hash!=='#sample'&&current?.id!==location.hash.slice(1))show(location.hash.slice(1));});
window.addEventListener('popstate',()=>{if(location.hash!=='#sample'&&current?.id!==location.hash.slice(1))show(location.hash.slice(1));});
document.querySelector('#reset').addEventListener('click',()=>show(current.id));
reduceControl.checked=systemMotion.matches;
function syncMotion(){document.documentElement.classList.toggle('reduced-motion',quiet());if(quiet())animations.forEach(a=>{try{a.finish();}catch{}});}
reduceControl.addEventListener('change',syncMotion);systemMotion.addEventListener('change',()=>{reduceControl.checked=systemMotion.matches;syncMotion();});
syncMotion();show(location.hash.slice(1));
