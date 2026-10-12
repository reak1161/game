(function () {
  'use strict';
  const $=s=>document.querySelector(s);
  const types=[['guess','回答履歴','pf-guess-history','POKE & BLOW / UI試作'],['board','盤面','pf-grid-board','QUADRIDGE'],['fuse','爆弾列','pf-fuse-lane','ばくだんぼんばー'],['tiles','手牌','pf-tile-rack','麻雀 点数計算'],['lobby','待機欄','pf-lobby','WEB GAME / ローカルデモ']];
  const notes={guess:'データのみのpoke_and_blow向けの仮UI。CSVの種族値を使った大小比較の操作例で、ゲームルールは未確定です。部品には比較済みの値だけを渡します。',board:'盤面表示と座標の通知を担当します。配置・回転・勝敗はゲーム側で判定。この見本は既存の15×15盤面用ロジックを接続しています。',fuse:'挿入位置と爆弾の選択を通知します。手番による燃焼・爆発・ダメージはゲーム側で処理します。数字は追加の導火線数、0は本体が燃える状態です。',tiles:'34種の牌をSVGで描画します。選択・和了牌・伏せ表示に対応。点数計算は含みません。非公開の牌種は渡さず、concealed: trueだけで表示できます。',lobby:'参加・開始リクエストを通知します。この見本は通信しません。参加判定・ホスト権限・ゲーム開始は接続先のサーバーで検証してください。'};
  const candidates=[['フシギダネ',45,49,49,45],['フシギソウ',60,62,63,60],['ヒトカゲ',39,52,43,65],['ゼニガメ',44,48,65,43],['フシギバナ',80,82,83,80]];
  const target=[80,82,83,80]; // Demo only; the widget receives comparisons, never this target.
  const sampleRow=(n,id)=>({id,label:candidates[n][0],cells:candidates[n].slice(1).map((value,i)=>({value,comparison:value===target[i]?'equal':value<target[i]?'higher':'lower'}))});
  const presets={guess:()=>({columns:['HP','攻撃','防御','素早さ'].map(id=>({id,label:id})),rows:[sampleRow(0,'g0'),sampleRow(2,'g1')]}),board:()=>({rows:15,cols:15,cells:Array(225).fill(0),preview:[],path:[]}),fuse:()=>({bombs:[{id:'a',fuses:3,lit:true},{id:'b',fuses:1,lit:true},{id:'c',fuses:0,lit:true}],capacity:5}),tiles:()=>({tiles:['2m','3m','4m','3p','4p','5p','6s','7s','8s','2z','2z','2z','5z','5z'].map((code,i)=>({id:'t'+i,code})),winningId:'t13'}),lobby:()=>({roomId:'TABLE-7',players:[],maxPlayers:8,minPlayers:2,connected:false})};
  let active,part,data,config,serial=0;
  function update(){part.data=data;}
  function motion(name,partName='item',index=0){if(part.shadowRoot.querySelector(`[part~="${partName}"]`))part.play(name,{part:partName,index});}
  function appearance(){part.setAttribute('theme',$('#widget-theme').value);part.toggleAttribute('reduced-motion',$('#widget-reduce').checked);$('#widget-stage').dataset.theme=$('#widget-theme').value;}
  function action(label,fn,id){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',fn);if(id)b.id=id;$('#widget-actions').append(b);return b;}
  function divider(){const e=document.createElement('span');e.className='divider';e.setAttribute('aria-hidden','true');$('#widget-actions').append(e);}
  function build(id='guess',push=false){
    config=types.find(x=>x[0]===id)||types[0];active=config[0];if(push)history.pushState(null,'','#'+active);
    $('#game-name').textContent=config[3];$('#game-state').textContent='';$('#widget-actions').replaceChildren();
    $('#widget-types').innerHTML=types.map(([key,label])=>`<button data-widget="${key}" aria-pressed="${key===active}">${label}</button>`).join('');
    $('#widget-types').querySelectorAll('button').forEach(b=>b.onclick=()=>build(b.dataset.widget,true));
    data=presets[active]();part=document.createElement(config[2]);$('#widget').replaceChildren(part);update();appearance();
    if(active==='guess'){
      const select=document.createElement('select');select.setAttribute('aria-label','回答するポケモン');select.id='guess-choice';candidates.forEach(([name],i)=>{const o=document.createElement('option');o.value=i;o.textContent=name;select.append(o);});select.value=1;$('#widget-actions').append(select);
      action('回答',()=>{data.rows.push(sampleRow(+select.value,'g'+(++serial+2)));if(data.rows.length>5)data.rows.shift();update();motion('place','item',data.rows.length-1);$('#game-state').textContent=data.rows.at(-1).cells.every(c=>c.comparison==='equal')?'一致':'';},'guess-submit');
    }else if(active==='board'){
      let shape='T',rotation=0,team=1,anchor=97,ended=false;
      const snapshot=()=>PlayformLogic.placement(data.cells,15,PlayformLogic.rotate(shape,rotation),anchor%15,Math.floor(anchor/15));
      function preview(index){anchor=index;const p=snapshot();data.preview=p.points.filter(([x,y])=>x>=0&&y>=0&&x<15&&y<15).map(([x,y])=>y*15+x);data.previewValid=p.valid;update();}
      function status(){$('#game-state').textContent=ended?(team===1?'青の勝ち':'赤の勝ち'):(team===1?'青の手番':'赤の手番');}
      ['I','O','T','L'].forEach(s=>{const b=action(s,()=>{shape=s;$('#widget-actions').querySelectorAll('[data-shape]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.shape===s));preview(anchor);});b.dataset.shape=s;b.setAttribute('aria-pressed',s===shape);});
      divider();action('回転 ↻',()=>{rotation++;preview(anchor);},'board-rotate');
      part.addEventListener('gp-preview',e=>{if(!ended&&e.detail.index!==anchor)preview(e.detail.index);});
      part.addEventListener('gp-cell',e=>{if(ended)return;anchor=e.detail.index;const p=snapshot();if(!p.valid){preview(anchor);return;}p.points.forEach(([x,y])=>data.cells[y*15+x]=team);data.path=PlayformLogic.connection(data.cells,15,team);ended=data.path.length>0;data.disabled=ended;data.preview=[];if(!ended)team=3-team;update();motion('place','cell',p.points[0][1]*15+p.points[0][0]);status();});preview(anchor);status();
    }else if(active==='fuse'){
      let life=5;const status=()=>$('#game-state').textContent='HP '+life+' / 5';status();
      part.addEventListener('gp-select',e=>{data.selectedId=e.detail.id;update();add.disabled=data.bombs[e.detail.index].fuses>=6;});
      part.addEventListener('gp-insert',e=>{data.bombs.splice(e.detail.index,0,{id:'new'+(++serial),fuses:2,lit:true});update();motion('place','bomb',e.detail.index);});
      const add=action('導火線を足す',()=>{const b=data.bombs.find(x=>x.id===data.selectedId);if(b&&b.fuses<6){b.fuses++;update();add.disabled=b.fuses>=6;motion('place','bomb',data.bombs.indexOf(b));}},'fuse-add');add.disabled=true;
      const end=action('手番を終える →',()=>{const exploding=data.bombs.filter(b=>b.lit&&b.fuses===0).length;life=Math.max(0,life-exploding);data.bombs=data.bombs.filter(b=>!(b.lit&&b.fuses===0)).map(b=>({...b,fuses:b.lit?b.fuses-1:b.fuses}));data.selectedId=null;data.disabled=life===0;update();status();end.disabled=life===0;add.disabled=true;motion(exploding?'hit':'handoff','body');},'fuse-end');
    }else if(active==='tiles'){
      part.addEventListener('gp-select',e=>{data.selectedId=e.detail.id;update();win.disabled=false;});
      const win=action('和了牌にする',()=>{if(data.selectedId){data.winningId=data.selectedId;update();motion('place','tile',data.tiles.findIndex(t=>t.id===data.winningId));}},'tile-win');win.disabled=true;
      const saved=structuredClone(data.tiles);const conceal=action('伏せる',()=>{const hidden=!data.tiles[0].concealed;data.tiles=hidden?saved.map(t=>({id:t.id,concealed:true})):structuredClone(saved);data.selectedId=null;update();win.disabled=true;conceal.textContent=hidden?'開く':'伏せる';},'tile-conceal');
    }else{
      let started=false;
      part.addEventListener('gp-join',e=>{data={...data,roomId:e.detail.roomId,connected:true,isHost:true,hostId:'you',players:[{id:'you',label:'あなた'}]};update();join.disabled=false;role.disabled=false;motion('place');});
      part.addEventListener('gp-start',()=>{started=true;data.busy=true;update();join.disabled=true;role.disabled=true;$('#game-state').textContent='開始リクエストを受信';});
      const join=action('参加者を追加',()=>{if(!data.connected||started||data.players.length===8)return;data.players.push({id:'p'+(++serial),label:['ナギ','リン','ハル','ユウ','アオ','サキ','トワ'][data.players.length-1]});update();join.disabled=data.players.length===8;motion('place','item',data.players.length-1);},'lobby-add');join.disabled=true;
      const role=action('参加者の表示',()=>{if(started)return;data.isHost=!data.isHost;role.textContent=data.isHost?'参加者の表示':'ホストの表示';update();},'lobby-role');role.disabled=true;
    }
  }
  $('#widget-theme').onchange=appearance;$('#widget-reduce').onchange=appearance;$('#widget-reset').onclick=()=>build(active);
  const events={guess:'',board:"part.addEventListener('gp-cell', ({ detail }) => {\n  // detail: { index, x, y }。ゲーム側で合法手を検証して盤面を更新。\n  console.log(detail);\n});",fuse:"part.addEventListener('gp-insert', ({ detail }) => {\n  console.log(detail.index); // ゲーム側で挿入可能か確認\n});",tiles:"part.addEventListener('gp-select', ({ detail }) => {\n  part.data = { ...part.data, selectedId: detail.id };\n});",lobby:"part.addEventListener('gp-join', ({ detail }) => {\n  console.log(detail.roomId); // 接続先の参加処理へ渡す\n});\npart.addEventListener('gp-start', ({ detail }) => {\n  console.log(detail.roomId); // サーバー側で開始権限を検証\n});"};
  $('#widget-code').onclick=()=>{const payload=JSON.stringify(presets[active](),null,2);$('#widget-tag').textContent=config[2];$('#widget-note').textContent=notes[active];$('#widget-snippet').value=`<script src="./motions.js"><\/script>\n<script src="./game-parts.js"><\/script>\n<script src="./game-widgets.js"><\/script>\n<${config[2]} id="part" theme="${$('#widget-theme').value}"></${config[2]}>\n<script>\nconst part = document.querySelector('#part');\npart.data = ${payload};\n${events[active]}\n<\/script>`;$('#widget-copy-status').textContent='';$('#widget-dialog').showModal();};
  $('#widget-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#widget-snippet').value);$('#widget-copy-status').textContent='コピーしました。';}catch{$('#widget-snippet').select();$('#widget-copy-status').textContent='Ctrl+Cでコピーできます。';}};
  window.addEventListener('popstate',()=>build(location.hash.slice(1)));window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(id!=='widget-stage'&&id!==active)build(id);});build(location.hash.slice(1));
})();
