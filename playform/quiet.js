'use strict';
const stage=document.querySelector('#stage'),reduction=document.querySelector('#reduce');
const preference=matchMedia('(prefers-reduced-motion: reduce)'),rules=globalThis.PlayformLogic;
const pending=new Set(),animations=new Set();
let version=0,current;
const $=s=>stage.querySelector(s),$$=s=>[...stage.querySelectorAll(s)];
const quiet=()=>reduction.checked||preference.matches;
function schedule(fn,ms){const id=setTimeout(()=>{pending.delete(id);fn();},ms);pending.add(id);return id;}
function clearScene(){version++;pending.forEach(clearTimeout);pending.clear();animations.forEach(a=>a.cancel());animations.clear();}
function move(el,frames,options){const a=el.animate(frames,{...options,duration:quiet()?1:options.duration,delay:quiet()?0:options.delay||0});animations.add(a);a.finished.then(()=>animations.delete(a)).catch(()=>animations.delete(a));return a;}
function bind(selector,fn){$$(selector).forEach(el=>el.addEventListener('click',()=>fn(el)));}
function announce(text){$('[data-status]').textContent=text;}
function mount(cls,content){stage.innerHTML=`<div class="scene ${cls}">${content}</div>`;}
const status=text=>`<p class="status" data-status role="status">${text}</p>`;
const primary=(id,text)=>`<button class="primary" id="${id}">${text}</button>`;
const header=(name,text)=>`<div class="scene-header"><strong>${name}</strong><span>${text}</span></div>`;
const members=[{name:'まお',hp:500,mp:50,sprite:'blue_man.png',command:'たいあたり',color:'#52738a'},{name:'しょう',hp:300,mp:250,sprite:'red_man.png',command:'てっぺき',color:'#b97561'},{name:'ぽんきち',hp:330,mp:50,sprite:'green_man.png',command:'でんこうせっか',color:'#7b986b'},{name:'まさよし',hp:300,mp:150,sprite:'yellow_man.png',command:'だくりゅう',color:'#c3a665'}];
const sprite=i=>`<img src="assets/${members[i].sprite}" alt="${members[i].name}" class="sprite" draggable="false">`;
function shape(type,rotation=0){const cells=rules.rotate(type,rotation),width=Math.max(...cells.map(p=>p[0]))+1,height=Math.max(...cells.map(p=>p[1]))+1;return `<span class="shape" style="--columns:${width}">${Array.from({length:width*height},(_,i)=>`<i class="${cells.some(([x,y])=>y*width+x===i)?'filled':''}"></i>`).join('')}</span>`;}
function seed(){const b=Array(225).fill(0);[[6,0],[7,0],[6,1],[7,1],[7,3],[7,4],[7,5],[8,5],[7,12],[8,12],[7,13],[7,14]].forEach(([x,y])=>b[y*15+x]=1);[[0,7],[1,7],[2,7],[2,8],[11,7],[12,7],[13,7],[14,7]].forEach(([x,y])=>b[y*15+x]=2);return b;}
function board(data,interactive=false){return `<div class="board-wrap"><span class="board-edge north"></span><span class="board-edge west"></span><div class="board-grid" role="group" aria-label="15×15の盤面">${data.map((v,i)=>interactive?`<button class="board-cell team-${v}" data-cell="${i}" tabindex="${i===112?'0':'-1'}" aria-label="${i%15+1}列${Math.floor(i/15)+1}行 ${v===1?'蒼':v===2?'朱':'空き'}"></button>`:`<span class="board-cell team-${v}" data-cell="${i}"></span>`).join('')}</div><span class="board-edge east"></span><span class="board-edge south"></span></div>`;}

// 19 / The workspace is the board; all routine controls fit in one line.
function boardUI(){
  const data=seed(),rotations={L:0,T:0,O:0};let type='L',anchor=[5,7],team=1,count=0,finished=false;
  mount('board-ui',`${header('QUADRIDGE','ふたりの対局')}<div class="board-turn"><span class="turn-dot"></span><strong id="turn-name">蒼の手番</strong><span id="turn-direction">上下をつなぐ</span><small id="move-number">01</small></div>${board(data,true)}<div class="board-toolbar"><div class="shape-picker" aria-label="ピースを選ぶ">${['L','T','O'].map(t=>`<button data-shape="${t}" aria-label="${t}型" aria-pressed="${t===type}">${shape(t)}</button>`).join('')}</div><button class="rotate" id="rotate" aria-label="右へ90度回転">↻</button><span class="placement-hint" id="placement-hint">盤面を選んで配置</span>${primary('place','置く')}</div><div class="board-foot">${status('淡い4マスが配置予定です。マスを選び、「置く」で確定。')}<details class="inline-help"><summary>操作</summary><p>形を選択 → マスで仮置き → 確定。<br>矢印キー：仮置きの移動 / 回転：右へ90度。<br>この見本は候補固定の通常配置です。</p></details></div>`);
  function update(){
    const p=rules.placement(data,15,rules.rotate(type,rotations[type]),...anchor);
    $$('[data-cell]').forEach((b,i)=>{const ghost=p.points.some(([x,y])=>x===i%15&&y===Math.floor(i/15));b.className=`board-cell team-${data[i]}${ghost&&!finished?` ghost ghost-${team}${p.valid?'':' invalid'}`:''}`;b.textContent=ghost&&!p.valid&&!finished?'×':'';b.tabIndex=i===anchor[1]*15+anchor[0]?0:-1;b.setAttribute('aria-label',`${i%15+1}列${Math.floor(i/15)+1}行 ${data[i]===1?'蒼':data[i]===2?'朱':'空き'}${ghost&&!finished?' 仮置き':''}`);});
    $$('[data-shape]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.shape===type);b.innerHTML=shape(b.dataset.shape,rotations[b.dataset.shape]);b.disabled=finished;});
    $('#rotate').disabled=finished;$('#place').disabled=!p.valid||finished;
    $('#placement-hint').textContent=finished?'接続しました':p.valid?`${String.fromCharCode(65+anchor[0])}${anchor[1]+1} に4マス`:'この位置には置けません';
    $('#turn-name').textContent=finished?`${team===1?'蒼':'朱'}の勝ち`:`${team===1?'蒼':'朱'}の手番`;$('#turn-direction').textContent=team===1?'上下をつなぐ':'左右をつなぐ';$('.board-ui').dataset.team=team;
  }
  $$('[data-cell]').forEach(b=>{
    b.addEventListener('click',()=>{if(finished)return;const i=Number(b.dataset.cell);anchor=[i%15,Math.floor(i/15)];update();});
    b.addEventListener('keydown',e=>{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!d||finished)return;e.preventDefault();anchor=[Math.max(0,Math.min(14,anchor[0]+d[0])),Math.max(0,Math.min(14,anchor[1]+d[1]))];update();$(`[data-cell="${anchor[1]*15+anchor[0]}"]`).focus();});
  });
  bind('[data-shape]',b=>{type=b.dataset.shape;update();});bind('#rotate',()=>{rotations[type]=(rotations[type]+1)%4;update();});
  bind('#place',()=>{const p=rules.placement(data,15,rules.rotate(type,rotations[type]),...anchor);if(!p.valid||finished)return;p.points.forEach(([x,y])=>data[y*15+x]=team);const path=rules.connection(data,15,team);count++;finished=path.length>0;announce(finished?`${team===1?'蒼':'朱'}が対岸までつながりました。`:`${team===1?'蒼':'朱'}が4マスを配置。`);if(!finished)team=3-team;$('#move-number').textContent=String(count+1).padStart(2,'0');update();if(finished)path.forEach(i=>$(`[data-cell="${i}"]`).classList.add('connection'));});update();
}

// 20 / The action explanation is deferred until there is a card to explain.
function handUI(){
  const cards=[{name:'アタック',level:2,kind:'attack',label:'攻撃 2'},{name:'ディフェンス',level:1,kind:'defense',label:'防御 1'},{name:'ツインズ',level:2,kind:'twins',label:'攻撃 2 / 防御 2'}];
  const players=[{name:'ナギ',hp:8,shield:1},{name:'リン',hp:6,shield:0},{name:'ハル',hp:9,shield:2}];let selected=null,target=0,choice='attack',shield=0;const used=new Set();
  mount('hand-ui',`${header('ライトウルフ','夜 · あなたの手番')}<div class="opponent-line">${players.map((p,i)=>`<button data-opponent="${i}" aria-pressed="false"><span>${p.name}</span><small data-vitals="${i}">HP ${p.hp} <i>防御 ${p.shield}</i></small><span class="target-mark">対象</span></button>`).join('')}</div><div class="hand-workspace"><div class="hand-empty-caption" id="empty-caption">手札を一枚、選ぶ。</div><div class="hand-cards">${cards.map((c,i)=>`<button class="plain-card ${c.kind}" data-card="${i}" aria-pressed="false"><small>0${i+1}</small><span class="plain-card-level">${c.level}</span><strong>${c.name}</strong><span>${c.label}</span></button>`).join('')}</div><div class="card-context" id="card-context" hidden><div class="context-head"><strong id="chosen-title"></strong><button id="cancel-card" aria-label="カードの選択を解除">×</button></div><div class="context-choices" id="context-choices"><button data-effect="attack" aria-pressed="true">攻撃</button><button data-effect="defense" aria-pressed="false">防御</button></div><p id="card-effect"></p>${primary('use-card','使う')}<details class="card-rule"><summary>効果を詳しく</summary><p>攻撃は相手の防御を先に減らし、残りがHPへ。防御は自分に蓄積します。ツインズはどちらか一方を使います。</p></details></div></div><div class="hand-footer"><span>あなた <b>10</b><small id="your-defense">防御 0</small></span>${status('手札 3枚')}</div>`);
  function update(){
    const active=selected!==null;$('#card-context').hidden=!active;$('#empty-caption').hidden=active;
    $$('[data-card]').forEach((b,i)=>{b.setAttribute('aria-pressed',i===selected);b.disabled=used.has(i);b.classList.toggle('used',used.has(i));});
    $$('[data-opponent]').forEach((b,i)=>{b.disabled=!active||choice==='defense';b.setAttribute('aria-pressed',active&&choice==='attack'&&i===target);});
    if(!active)return;const c=cards[selected];$('#chosen-title').textContent=c.name+' '+c.level;$('#context-choices').hidden=c.kind!=='twins';$$('[data-effect]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.effect===choice));
    $('#card-effect').textContent=choice==='attack'?`${players[target].name}へ ${Math.max(0,c.level-players[target].shield)} ダメージ（防御 ${Math.min(c.level,players[target].shield)}）`:`自分の防御 ${shield} → ${shield+c.level}`;
  }
  bind('[data-card]',b=>{selected=Number(b.dataset.card);choice=cards[selected].kind==='defense'?'defense':'attack';update();});bind('[data-opponent]',b=>{target=Number(b.dataset.opponent);update();});bind('[data-effect]',b=>{choice=b.dataset.effect;update();});bind('#cancel-card',()=>{selected=null;update();});
  bind('#use-card',()=>{if(selected===null||used.has(selected))return;const c=cards[selected];if(choice==='attack'){const p=players[target],r=rules.attack(p.hp,p.shield,c.level);Object.assign(p,{hp:r.hp,shield:r.shield});$(`[data-vitals="${target}"]`).innerHTML=`HP ${p.hp} <i>防御 ${p.shield}</i>`;announce(`${p.name}に${r.damage}ダメージ。`);}else{shield+=c.level;$('#your-defense').textContent=`防御 ${shield}`;announce(`防御が${shield}になりました。`);}used.add(selected);selected=null;update();if(used.size===3){$('#empty-caption').textContent='手札を使い切りました。';announce('リセットでもう一度試せます。');}});update();
}

// 21 / Member status and the selected member's controls occupy the same strip.
function battleUI(){
  let selected=0,enemyHP=1200;const positions=[0,5,10,15],guards=new Set(),acted=new Set();
  mount('battle-ui',`${header('ラティトル','へびとの戦い')}<div class="compact-enemy"><img src="assets/snake.png" alt="へび"><span>へび <small id="enemy-hp">1200 / 1200</small></span><span class="enemy-intent">しっぽうち <b>2列目</b></span></div><div class="battle-board">${Array.from({length:16},(_,i)=>`<button class="battle-tile ${i%4===1?'threat':''}" data-tile="${i}" aria-label="${i%4+1}列${Math.floor(i/4)+1}行"><span>${i%4===1?'!':''}</span></button>`).join('')}</div><div class="party-strip">${members.map((m,i)=>`<button data-member="${i}" aria-pressed="${i===0}">${sprite(i)}<span><strong>${m.name}</strong><small>HP ${m.hp}</small></span><span class="member-mark">●</span></button>`).join('')}</div><div class="command-strip"><span id="command-owner">まお</span><button id="main-command">たいあたり</button><button id="move-command" aria-pressed="true">移動</button><small id="command-hint">空きマスを選択</small></div>${status('仲間を選んでから、移動先かコマンドを選択。')}`);
  function update(){
    $$('[data-member]').forEach((b,i)=>b.setAttribute('aria-pressed',i===selected));$$('[data-tile]').forEach((b,i)=>{b.querySelector('img')?.remove();const member=positions.indexOf(i);if(member!==-1)b.insertAdjacentHTML('beforeend',sprite(member));b.classList.toggle('selected',positions[selected]===i);b.classList.toggle('guarding',guards.has(member));b.setAttribute('aria-label',`${i%4+1}列${Math.floor(i/4)+1}行 ${member===-1?'空き':members[member].name}${i%4===1?' 攻撃予告':''}`);});
    $('#command-owner').textContent=members[selected].name;$('#main-command').textContent=members[selected].command;$('#main-command').disabled=acted.has(selected);$('#command-hint').textContent=acted.has(selected)?'行動済み · 移動できます':'空きマスを選択';
  }
  bind('[data-member]',b=>{selected=Number(b.dataset.member);update();});bind('[data-tile]',b=>{const tile=Number(b.dataset.tile),member=positions.indexOf(tile);if(member!==-1)selected=member;else{positions[selected]=tile;announce(`${members[selected].name}が${tile%4+1}列${Math.floor(tile/4)+1}行へ。${tile%4===1?'この列は攻撃予告の範囲です。':'安全な列です。'}`);}update();});
  bind('#move-command',()=>{announce(`${members[selected].name}の移動先を、盤面の空きマスから選んでください。`);});
  bind('#main-command',()=>{if(acted.has(selected))return;acted.add(selected);if(selected===1){guards.add(1);announce('しょうは、てっぺきで身を守る。');}else{enemyHP-=20;$('#enemy-hp').textContent=`${enemyHP} / 1200`;announce(`${members[selected].name}の${members[selected].command}。へびに20ダメージ。`);}update();});update();
}

// 22 / The start screen borrows its identity from the board, not an illustration.
function whiteRoom(){
  let mode=2;const data=Array(225).fill(0);[[6,5],[6,6],[6,7],[7,7]].forEach(([x,y])=>data[y*15+x]=1);[[9,9],[10,9],[9,10],[10,10]].forEach(([x,y])=>data[y*15+x]=2);
  mount('white-room',`${header('QUADRIDGE','')}<div class="room-intro"><div class="room-copy"><h3>つながるまで、<br>考えよう。</h3><p>四マスずつ。先に、対岸へ。</p><div class="room-modes" aria-label="対局人数"><button data-mode="2" aria-pressed="true">ふたり</button><button data-mode="1" aria-pressed="false">ひとりで試す</button></div>${primary('enter-room','盤面を開く')}<small>15 × 15 / ローカル</small></div><div class="room-board">${board(data)}<span>蒼は上下。朱は左右。</span></div></div>${status('')}`);
  bind('[data-mode]',b=>{mode=Number(b.dataset.mode);$$('[data-mode]').forEach(el=>el.setAttribute('aria-pressed',el===b));announce(mode===2?'同じ画面で、交互に指します。':'両方の手番を操作して試せます。');});bind('#enter-room',()=>{boardUI();$('.scene-header>span').textContent=mode===2?'ふたりの対局':'ひとりで試す';announce(mode===2?'蒼から始めます。交互に置いてください。':'両方の手番を操作できる練習盤です。');});
}

// 23 / A single card is enough to say what kind of game this is.
function blueTable(){
  let open=false;
  mount('blue-table',`${header('ライトウルフ','2—6 PLAYERS')}<div class="blue-table-center"><div class="single-card" id="single-card" aria-label="伏せた役職カード"><span class="card-seam"></span><strong id="single-role"></strong><small id="single-card-label">LIGHTWOLF</small></div><div class="blue-table-copy"><h3>まだ、伏せておく。</h3><p id="blue-table-line">出す一枚で、卓の空気が変わる。</p><button class="quiet-action" id="look-role">自分のカードを見る <span>→</span></button></div></div><div class="blue-table-footer"><span>最後まで残った一人が勝つ。</span>${status('自分の役職だけを確認できます。')}</div>`);
  bind('#look-role',b=>{open=!open;$('.single-card').classList.toggle('face-up',open);$('#single-role').textContent=open?'騎士':'';$('#single-card-label').textContent=open?'あなたの役職':'LIGHTWOLF';$('#single-card').setAttribute('aria-label',open?'あなたの役職 騎士':'伏せた役職カード');b.innerHTML=open?'伏せておく <span>←</span>':'自分のカードを見る <span>→</span>';$('#blue-table-line').textContent=open?'CO中、防御カードの防御値が1増える。':'出す一枚で、卓の空気が変わる。';announce(open?'騎士を確認しました。まだCOしていません。':'役職を伏せました。');});
}

// 24 / Preserve the smallness of the original sprites and give them a place to stand.
function openSky(){
  let evening=false,started=false;
  mount('open-sky',`${header('ラティトル','')}<button class="time-of-day" id="change-light">夕方にする</button><div class="sky-title"><h3>ラティトル</h3><p id="sky-line">四人と、小さな盤面の旅。</p><button class="sky-start" id="start-walk">はじめる <span>→</span></button></div><div class="little-landscape" aria-hidden="true"><svg viewBox="0 0 1000 260" preserveAspectRatio="none"><path class="distant-hill" d="M0 195q130-50 230-27t220-11 260 10 290-24v117H0Z"/><path class="near-hill" d="M0 220q220-42 412-11t588-13v64H0Z"/><path class="ground-line" d="M0 237q220-16 460 1t540-9" fill="none"/></svg><div class="landscape-tree"><i></i><span></span></div></div><div class="walking-party">${members.map((m,i)=>`<span>${sprite(i)}</span>`).join('')}</div><div class="encounter" id="encounter" hidden><img src="assets/snake.png" alt="へび"><div><strong>へびが、道をふさいでいる。</strong><span>四人で、進もう。</span></div></div>${status('')}`);
  bind('#change-light',b=>{evening=!evening;$('.open-sky').classList.toggle('evening',evening);b.textContent=evening?'昼に戻す':'夕方にする';announce(evening?'夕方の色合いに切り替えました。':'昼の色合いに戻しました。');});
  bind('#start-walk',b=>{started=!started;$('.open-sky').classList.toggle('encounter-open',started);$('#encounter').hidden=!started;$('#sky-line').textContent=started?'最初の一戦。':'四人と、小さな盤面の旅。';b.innerHTML=started?'入口に戻る <span>←</span>':'はじめる <span>→</span>';announce(started?'四人がそろいました。最初の敵は、へびです。':'旅の入口に戻りました。');});
}

// 25 / Only the four newly occupied cells travel, by two pixels, for 100 ms.
function placementMotion(){
  const data=seed(),moves=[{type:'O',x:4,y:8,team:1},{type:'T',x:9,y:3,team:2},{type:'L',x:5,y:10,team:1},{type:'O',x:11,y:11,team:2}];let n=0,busy=false;
  mount('placement-motion',`${header('QUADRIDGE','一手の反応')}<div class="placement-motion-center">${board(data)}<div class="motion-counter"><span id="placed-count">0</span> / 4 手</div></div><div class="motion-controls"><label><input type="checkbox" id="instant">動きなしと比べる</label>${primary('next-piece','一手進める')}</div>${status('置いた四マスだけが、2px沈んで止まります。')}`);
  bind('#next-piece',b=>{if(busy)return;if(n===moves.length){placementMotion();return;}const m=moves[n],p=rules.placement(data,15,rules.rotate(m.type),m.x,m.y);if(!p.valid)return;busy=true;b.disabled=true;const run=version;const animateThis=!$('#instant').checked;
    p.points.forEach(([x,y])=>{const i=y*15+x;data[i]=m.team;const el=$(`[data-cell="${i}"]`);el.className=`board-cell team-${m.team}`;if(animateThis)move(el,[{transform:'translateY(-2px)'},{transform:'translateY(0)'}],{duration:100,easing:'cubic-bezier(.3,0,1,1)'});});
    n++;$('#placed-count').textContent=n;announce(`${m.team===1?'蒼':'朱'}が${m.type}型を配置。${animateThis&&!quiet()?'100msで着地。':'即時に確定。'}`);
    schedule(()=>{if(run!==version)return;busy=false;b.disabled=false;b.textContent=n===moves.length?'最初から':'一手進める';},animateThis&&!quiet()?110:1);
  });
}

// 26 / A short underline hands attention to the next player. The players stay still.
function turnMotion(){
  const names=['あなた','ナギ','リン','ハル'];let turn=0,busy=false,total=0;
  mount('turn-motion',`${header('ライトウルフ','手番の受け渡し')}<div class="turn-table"><div class="turn-seats">${names.map((name,i)=>`<div class="turn-seat ${i===0?'active':''}" data-seat="${i}"><span>${name}</span><small>HP 10</small></div>`).join('')}<i class="turn-underline" id="turn-underline"></i></div><div class="turn-center"><span id="phase-label">昼</span><h3 id="active-player">あなたの手番</h3><p>考える時間は、そのままに。</p></div><div class="resting-hand" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="motion-controls"><label><input type="checkbox" id="instant">動きなしと比べる</label>${primary('pass-turn','手番を渡す')}</div>${status('名前の下の線だけが、次の人へ移ります。')}`);
  bind('#pass-turn',b=>{if(busy)return;busy=true;b.disabled=true;const from=turn;turn=(turn+1)%4;total++;const marker=$('#turn-underline');marker.style.left=`${turn*25}%`;
    if(!$('#instant').checked)move(marker,[{left:`${from*25}%`},{left:`${turn*25}%`}],{duration:140,easing:'cubic-bezier(.2,.65,.3,1)'});
    $$('[data-seat]').forEach((el,i)=>el.classList.toggle('active',i===turn));$('#active-player').textContent=`${names[turn]}の手番`;$('#phase-label').textContent=Math.floor(total/4)%2?'夜':'昼';announce(`${names[from]}から${names[turn]}へ。`);schedule(()=>{busy=false;b.disabled=false;},$('#instant').checked||quiet()?1:150);
  });
}

// 27 / Health changes where it already lives; no camera shake or flying numerals.
function healthMotion(){
  const hp=members.map(m=>m.hp);let selected=0,busy=false;
  mount('health-motion',`${header('ラティトル','被弾の反応')}<div class="health-scene"><div class="health-enemy"><img src="assets/snake.png" alt="へび"><span>しっぽうち</span></div><div class="health-party">${members.map((m,i)=>`<button class="health-member" data-health="${i}" aria-pressed="${i===0}" style="--member:${m.color}">${sprite(i)}<span class="health-name">${m.name}</span><span class="health-numbers"><b data-hp="${i}">${m.hp}</b><small> / ${m.hp}</small><em data-delta="${i}"></em></span><span class="health-track"><i class="health-trail" data-trail="${i}"></i><i class="health-current" data-bar="${i}"></i></span></button>`).join('')}</div></div><div class="motion-controls"><label><input type="checkbox" id="instant">動きなしと比べる</label><div><button class="secondary" id="heal">回復</button>${primary('take-hit','攻撃を受ける')}</div></div>${status('仲間を選んで、HPの変化を比較できます。')}`);
  function updateButtons(){$('#take-hit').disabled=busy||hp[selected]===0;$('#heal').disabled=busy||hp[selected]===members[selected].hp;$$('[data-health]').forEach((b,i)=>{b.disabled=busy;b.setAttribute('aria-pressed',i===selected);});}
  bind('[data-health]',b=>{selected=Number(b.dataset.health);updateButtons();});
  function change(amount){if(busy)return;const i=selected,old=hp[i];hp[i]=Math.max(0,Math.min(members[i].hp,old+amount));if(hp[i]===old)return;busy=true;updateButtons();const ratio=hp[i]/members[i].hp*100,oldRatio=old/members[i].hp*100;
    $(`[data-hp="${i}"]`).textContent=String(hp[i]);$(`[data-delta="${i}"]`).textContent=`${hp[i]>old?'+':''}${hp[i]-old}`;const bar=$(`[data-bar="${i}"]`),trail=$(`[data-trail="${i}"]`);bar.style.width=trail.style.width=`${ratio}%`;
    const animated=!$('#instant').checked&&!quiet();if(animated){move(bar,[{width:`${oldRatio}%`},{width:`${ratio}%`}],{duration:160,easing:'ease-out'});move(trail,[{width:`${oldRatio}%`},{width:`${oldRatio}%`,offset:.35},{width:`${ratio}%`}],{duration:360,easing:'ease-out'});}
    announce(`${members[i].name}のHP ${old} → ${hp[i]}。${hp[i]===0?'戦闘不能。':''}`);schedule(()=>{busy=false;updateButtons();},animated?370:1);
  }
  bind('#take-hit',()=>change(-36));bind('#heal',()=>change(50));updateButtons();
}

const studies=[
  {id:'board-first',name:'盤面を広く',game:'QUADRIDGE',category:'UI',intent:'盤面の周りに説明を積み重ねず、日常操作を一列へ。候補・回転・確定を近づけ、ルール説明は必要なときに開きます。',action:'形とマスを選び、「置く」で確定。回転と矢印キーに対応。蒼と朱が交互に配置します。',kept:'二色の駒、岸の色、現在の手番。飾りの見出しや操作専用の大きなパネルは置きません。',integration:'battle-ui.js の通常配置UIへ。15×15・重なり判定・直交接続を再現。候補は固定、延長配置なし。',render:boardUI},
  {id:'on-demand',name:'選んだときだけ',game:'ライトウルフ',category:'UI',intent:'最初は相手と手札だけ。選択したカードに必要な効果・対象・実行をその場で開きます。詳しいルールはもう一段奥へ。',action:'手札を選択し、攻撃なら上の相手を選んで使用。ツインズは二択。×で選択を解除できます。',kept:'伏せた情報の気配、紙一枚の比率、選択中の細い縁。常時表示の効果説明や大きなアイコンを減らします。',integration:'App.tsx の手札と対象選択へ。防御計算に準拠した3枚の操作抜粋で、ターン進行は省略。',render:handUI},
  {id:'nearby-orders',name:'状態と操作を近く',game:'ラティトル',category:'UI',intent:'盤面、仲間、選んだ仲間のコマンドを縦につなぎます。視線が左右のパネルを往復しなくても、誰に何をさせるか分かる並びです。',action:'仲間を選び、空きマスで移動。コマンドは各人一回。しょうは防御、他の仲間は20ダメージの表示例です。',kept:'既存のドット絵と仲間の色。HPは数字、予告は列、コマンドは選択中の一人分だけ。',integration:'remake/app.js のパーティー欄・コマンド欄へ。時間・行動ゲージ・ダメージ計算を省いた操作見本。',render:battleUI},
  {id:'white-room',name:'白い対局室',game:'QUADRIDGE',category:'デザイン',intent:'競技性の強いゲームは、駒そのものがよく見える静かな部屋に。模様ではなく、盤面の寸法と余白で印象をつくります。',action:'ふたり／ひとりで試すを選び、盤面を開く。どちらも同じ画面で両手番を操作できるローカル見本です。',kept:'少し温かい白、蒼と朱、短い一文。大きなポスター文字や背景図形は使いません。',integration:'QUADRIDGE の入口から対局画面へ。ゲーム名と盤面を同じ尺度に近づける構成。',render:whiteRoom},
  {id:'blue-table',name:'青い夜の卓',game:'ライトウルフ',category:'デザイン',intent:'役職の秘密を、一枚の伏せ札に任せる。暗い青と小さな明色だけで、人狼の緊張感を残します。',action:'自分のカードを見る／伏せる。確認はCOとは別の操作として扱います。',kept:'一枚の傾き、背の継ぎ目、文字の間。狼の絵、月、席の装飾を重ねなくても世界観があるかを見る案。',integration:'タイトルや自分の役職確認へ。相手の非公開情報は扱いません。表示する役職は自分の騎士のみ。',render:blueTable},
  {id:'small-journey',name:'小さな旅の入口',game:'ラティトル',category:'デザイン',intent:'四人の小さな絵を大きく飾り直さず、立てる場所だけを足します。RPGには無機質に削りすぎない、少しの空気と色を残す案です。',action:'昼／夕方の色を切り替え。「はじめる」で最初の敵の紹介へ。',kept:'既存キャラクター、一本の木、低い地平線。情報量ではなく、絵の小ささと余白で温かさを残します。',integration:'ラティトルのタイトル・初戦導入へ。戦闘本編への接続はなく、入口の構成を比較する見本。',render:openSky},
  {id:'local-feedback',name:'置いた場所だけ',game:'QUADRIDGE',category:'アニメーション',intent:'盤面全体を揺らさず、置いた4マスだけを2px、100ms動かします。操作が通ったことが分かる最小限の反応を探ります。',action:'一手ずつ4手を再生。「動きなしと比べる」で即時確定に切り替え。4手後は最初から再生できます。',kept:'入力と確定の対応。弾み、余韻、勝利の光は加えません。',integration:'配置成功後の新しい4セルにだけ適用。判定待ちと演出待ちを結び付けない構成へ。',render:placementMotion},
  {id:'pass-attention',name:'手番だけ渡す',game:'ライトウルフ',category:'アニメーション',intent:'人やカードは動かさず、名前の下の線だけを140msで次の人へ。画面の構図を保ったまま、注意の向きを受け渡します。',action:'手番を渡す。4人が一巡すると昼夜表示が変わります。「動きなし」と比較できます。',kept:'今、誰の番か。見出しの登場演出や全面の昼夜切り替えは使いません。',integration:'currentPlayerIndex と phase の表示へ。ゲーム結果を受け取った時点で手番文字を更新し、細い線だけ追従。',render:turnMotion},
  {id:'health-in-place',name:'HPの、その場所で',game:'ラティトル',category:'アニメーション',intent:'被弾は、普段HPを読む位置で伝えます。数字はすぐ更新し、バーが160ms、減る前の量が360msで収まる。目を別の場所へ連れ出さない案です。',action:'仲間を選んで36ダメージ、または50回復。HPの上下限に対応。「動きなし」と比較できます。',kept:'誰が、どれだけ変わったか。画面揺れ、飛ぶ数値、連続フラッシュを足さずに比較。',integration:'HPゲージの表示だけを変更。実際のダメージ・回復量はゲームエンジンから受け取る想定。',render:healthMotion},
];
document.querySelector('#sample-index').innerHTML=['UI','デザイン','アニメーション'].map((category,g)=>`<div class="index-group"><h2>${category}<span>03</span></h2>${studies.slice(g*3,g*3+3).map((s,i)=>`<a href="#${s.id}" data-study="${s.id}"><span class="index-number">${19+g*3+i}</span><span>${s.name}<small>${s.game}</small></span></a>`).join('')}</div>`).join('');
function show(id){current=studies.find(s=>s.id===id)||studies[0];clearScene();document.querySelectorAll('[data-study]').forEach(a=>{if(a.dataset.study===current.id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});document.querySelector('#sample-caption').textContent=`${19+studies.indexOf(current)} / ${current.category} / ${current.game}`;document.querySelector('#note-summary').textContent=current.name;for(const key of ['intent','action','kept','integration'])document.querySelector('#note-'+key).textContent=current[key];stage.setAttribute('aria-label',`${current.game} — ${current.name}`);current.render();}
document.querySelectorAll('[data-study]').forEach(a=>a.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();if(location.hash!==a.hash)history.pushState(null,'',a.hash);show(a.dataset.study);}));
const navigate=()=>{if(location.hash!=='#stage'&&current?.id!==location.hash.slice(1))show(location.hash.slice(1));};window.addEventListener('hashchange',navigate);window.addEventListener('popstate',navigate);
document.querySelector('#reset').addEventListener('click',()=>show(current.id));reduction.checked=preference.matches;
function syncReduction(){document.documentElement.classList.toggle('reduced',quiet());if(quiet())animations.forEach(a=>{try{a.finish();}catch{}});}
reduction.addEventListener('change',syncReduction);preference.addEventListener('change',()=>{reduction.checked=preference.matches;syncReduction();});syncReduction();show(location.hash.slice(1));
