// State belongs to the calling game. This example only selects a winning tile; no scoring rules.
(function(){
  const rack=document.querySelector('#rack'), confirm=document.querySelector('#confirm'), selected=document.querySelector('#selected');
  let state;
  function reset(){state={tiles:['2m','3m','4m','3p','4p','5p','6s','7s','8s','2z','2z','2z','5z','5z'].map((code,i)=>({id:'t'+i,code})),selectedId:null,winningId:null};rack.data=state;confirm.disabled=true;selected.textContent='';}
  rack.addEventListener('gp-select',({detail})=>{state={...state,selectedId:detail.id};rack.data=state;confirm.disabled=false;selected.textContent='';});
  confirm.addEventListener('click',()=>{if(!state.selectedId)return;state={...state,winningId:state.selectedId};rack.data=state;rack.play('place',{part:'tile',index:state.tiles.findIndex(t=>t.id===state.winningId)});selected.textContent='和了牌を設定しました';});
  document.querySelector('#reset').addEventListener('click',reset);reset();
})();
