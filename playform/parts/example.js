'use strict';
// This file owns all game state. The five components only display it and send requests.
const $ = id => document.getElementById(id);
let state;
function reset() {
  state={hp:30,enemy:24,turn:'you',selected:null,used:[],cards:[{id:'a',label:'攻撃',value:6},{id:'b',label:'強打',value:10},{id:'c',label:'回復',value:8}]};
  $('message').textContent='';render();
}
function render() {
  const over=state.hp===0||state.enemy===0;
  $('player').data={label:'あなた / HP',value:state.hp,max:30};$('enemy').data={label:'標的 / HP',value:state.enemy,max:24};
  $('turns').data={players:[{id:'you',label:'あなた'},{id:'enemy',label:'標的'}],activeId:state.turn};
  $('hand').data={cards:state.cards.map(c=>({...c,disabled:state.turn!=='you'||over})),selectedId:state.selected};
  $('field').data={items:state.used,capacity:3};
  $('commands').data={commands:[{id:'use',label:'使う',key:'Q',disabled:!state.selected||state.turn!=='you'||over},{id:'next',label:'手番を渡す',key:'E',disabled:over}]};
}
$('hand').addEventListener('gp-select',({detail})=>{state.selected=detail.id;render();});
$('field').addEventListener('gp-reorder',({detail})=>{state.used=detail.order.map(id=>state.used.find(c=>c.id===id));render();});
$('commands').addEventListener('gp-command',({detail})=>{
  if(state.hp===0||state.enemy===0)return;
  if(detail.id==='use') {
    const card=state.cards.find(c=>c.id===state.selected);if(!card||state.turn!=='you')return;
    if(card.id==='c')state.hp=Math.min(30,state.hp+card.value);else state.enemy=Math.max(0,state.enemy-card.value);
    state.used.push({...card});state.cards=state.cards.filter(c=>c.id!==card.id);state.selected=null;render();
    (card.id==='c'?$('player'):$('enemy')).play(card.id==='c'?'resolve':'hit',{part:'value'});
    $('field').play('place',{part:'item',index:state.used.length-1});
  }else if(detail.id==='next') {
    state.turn=state.turn==='you'?'enemy':'you';
    if(state.turn==='enemy')state.hp=Math.max(0,state.hp-4);
    render();$('turns').play('handoff',{part:'active'});
    if(state.turn==='enemy')$('player').play('hit',{part:'value'});
  }
  $('message').textContent=state.hp===0?'終了':state.enemy===0?'勝利':'';
});
// Turn selection requests are deliberately ignored: the engine controls turn order.
$('reset').addEventListener('click',reset);reset();
