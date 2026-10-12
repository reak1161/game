'use strict';
const types = [ ['meter','ゲージ','pf-meter'], ['hand','手札','pf-hand'], ['turns','手番','pf-turns'], ['slots','配置','pf-slots'], ['command','コマンド','pf-command'] ];
const $ = s => document.querySelector(s);
let active = 'meter', part, data, tick;
const presets = {
  meter: {label:'まお / HP',value:330,max:500},
  hand: {cards:[{id:'attack',label:'攻撃',value:2},{id:'guard',label:'防御',value:1},{id:'heal',label:'回復',value:'+4'},{id:'combo',label:'連撃',value:'×2'},{id:'move',label:'移動',value:3}],selectedId:null},
  turns: {players:[{id:'you',label:'あなた',subtext:'HP 10'},{id:'nagi',label:'ナギ',subtext:'HP 8'},{id:'rin',label:'リン',subtext:'HP 6'},{id:'haru',label:'ハル',subtext:'HP 9'}],activeId:'you'},
  slots: {items:[{id:'train',label:'筋トレ',value:'+30'},{id:'punch',label:'パンチ',value:'×2'},{id:'wave',label:'はどうだん',value:'×2'}],capacity:5,selectedId:null},
  command: {commands:[{id:'bolt',label:'雷撃',key:'Q',remaining:0,total:3},{id:'heal',label:'回復',key:'E',remaining:0,total:3},{id:'dash',label:'回避',key:'R',remaining:0,total:3}]},
};
function play(partName, index=0) {
  return part.play($('#motion').value,{part:partName,index,reducedMotion:$('#reduce').checked});
}
function update() { part.data=data; }
function replay() {
  const options=active==='meter'?['value',0]:active==='turns'?['active',0]:active==='hand'?['item',Math.max(0,data.cards.findIndex(c=>c.id===data.selectedId))]:active==='slots'?['item',Math.max(0,data.items.findIndex(c=>c.id===data.selectedId))]:['item',0];
  if(active==='hand'&&!data.cards.length)return;play(...options);
}
function appearance() { part.setAttribute('theme',$('#theme').value);part.toggleAttribute('reduced-motion',$('#reduce').checked);$('#part-stage').dataset.theme=$('#theme').value; }
function build(id=active,push=false) {
  clearInterval(tick);active=id;const config=types.find(t=>t[0]===id)||types[0];active=config[0];
  if(push)history.pushState(null,'','#'+active);
  data=structuredClone(presets[active]);part=document.createElement(config[2]);$('#sample').replaceChildren(part);appearance();update();
  $('#part-types').innerHTML=types.map(([key,label])=>`<button data-type="${key}" aria-pressed="${key===active}">${label}</button>`).join('');
  document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>build(b.dataset.type,true)));
  $('#sample-actions').replaceChildren();
  function action(text,fn,id){const b=document.createElement('button');b.textContent=text;if(id)b.id=id;b.addEventListener('click',fn);$('#sample-actions').append(b);return b;}
  if(active==='meter') {
    const adjust=amount=>{data.value=Math.max(0,Math.min(data.max,data.value+amount));update();play('value');$('#lose').disabled=data.value===0;$('#heal').disabled=data.value===data.max;};
    action('−36',()=>adjust(-36),'lose');action('+50',()=>adjust(50),'heal');
  } else if(active==='hand') {
    const use=action('使う',()=>{data.cards=data.cards.filter(c=>c.id!==data.selectedId);data.selectedId=null;update();use.disabled=true;},'use');use.disabled=true;
    part.addEventListener('gp-select',e=>{data.selectedId=e.detail.id;update();use.disabled=false;play('item',e.detail.index);});
  } else if(active==='turns') {
    const select=id=>{data.activeId=id;update();play('active');};part.addEventListener('gp-turn',e=>select(e.detail.id));
    action('次の手番 →',()=>select(data.players[(data.players.findIndex(p=>p.id===data.activeId)+1)%data.players.length].id));
  } else if(active==='slots') {
    part.addEventListener('gp-select',e=>{data.selectedId=e.detail.id;update();});
    part.addEventListener('gp-reorder',e=>{data.items=e.detail.order.map(id=>data.items.find(c=>c.id===id));data.selectedId=e.detail.id;update();play('item',e.detail.to);});
  } else {
    const deadlines = new Map();
    part.addEventListener('gp-command',e=>{const command=data.commands[e.detail.index];deadlines.set(command.id,performance.now()+3000);command.remaining=3;update();play('item',e.detail.index);});
    tick=setInterval(()=>{let changed=false;const now=performance.now();data.commands.forEach(c=>{const remaining=Math.max(0,Math.ceil(((deadlines.get(c.id)||0)-now)/1000));if(remaining!==c.remaining){c.remaining=remaining;changed=true;}});if(changed)update();},100);
  }
}
$('#theme').addEventListener('change',appearance);$('#reduce').addEventListener('change',appearance);$('#replay').addEventListener('click',replay);$('#reset').addEventListener('click',()=>build());
function snippet() {
  const tag=types.find(t=>t[0]===active)[2],payload=JSON.stringify(presets[active],null,2);
  let listener='';
  if(active==='hand')listener=`\npart.addEventListener('gp-select', ({ detail }) => {\n  part.data = { ...part.data, selectedId: detail.id };\n});`;
  if(active==='turns')listener=`\npart.addEventListener('gp-turn', ({ detail }) => {\n  part.data = { ...part.data, activeId: detail.id };\n});`;
  if(active==='slots')listener=`\npart.addEventListener('gp-reorder', ({ detail }) => {\n  const state = part.data;\n  part.data = { ...state, items: detail.order.map(\n    id => state.items.find(item => item.id === id)\n  ) };\n});`;
  if(active==='command')listener=`\npart.addEventListener('gp-command', ({ detail }) => {\n  // ゲーム側で処理し、remainingなどを更新する\n  console.log(detail.id);\n});`;
  return `<script src="./motions.js"><\/script>\n<script src="./game-parts.js"><\/script>\n<${tag} id="part" theme="${$('#theme').value}"></${tag}>\n<script>\nconst part = document.querySelector('#part');\npart.data = ${payload};${listener}\n// 表示を更新したあと、必要なときだけ再生\npart.play('${$('#motion').value}');\n<\/script>`;
}
$('#show-code').addEventListener('click',()=>{$('#code-title').textContent=types.find(t=>t[0]===active)[2];$('#code').value=snippet();$('#copy-status').textContent='';$('#code-dialog').showModal();});
$('#copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#code').value);$('#copy-status').textContent='コピーしました。';}catch{$('#code').select();$('#copy-status').textContent='コードを選択しました。Ctrl+Cでコピーできます。';}});
window.addEventListener('popstate',()=>build(location.hash.slice(1)));window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(id!=='part-stage'&&id!==active)build(id);});
build(types.some(t=>t[0]===location.hash.slice(1))?location.hash.slice(1):'meter');
