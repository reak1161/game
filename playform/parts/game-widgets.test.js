import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function setup(t){
  const win=new Window({url:'http://localhost/game-parts.html',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
  win.structuredClone=structuredClone;win.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
  for(const f of ['./motions.js','./game-parts.js','./game-widgets.js'])win.eval(read(f));
  t.after(()=>win.happyDOM.close());
  return {win,create:(tag,data)=>{const e=win.document.createElement(tag);win.document.body.append(e);e.data=data;return e;}};
}
test('guess history receives public hints only, escapes text, validates dimensions atomically',t=>{
  const {create}=setup(t);const data={columns:[{id:'hp',label:'HP'}],rows:[{id:'a',label:'<img src=x>',cells:[{value:45,comparison:'higher'}]}]};const e=create('pf-guess-history',data);
  assert.equal(e.shadowRoot.querySelector('img'),null);assert.equal(e.shadowRoot.querySelector('.mark').textContent,'↑');assert.match(e.shadowRoot.textContent,/正解はもっと大きい/);
  data.rows[0].cells[0].value=999;assert.equal(e.data.rows[0].cells[0].value,45);
  assert.throws(()=>e.data={...data,rows:[{id:'a',cells:[]}]},/match columns/);assert.equal(e.data.rows[0].cells[0].value,45);
  assert.throws(()=>e.data={...data,rows:[{id:'a',cells:[{comparison:'bad'}]}]},/comparison/);
});
test('board emits coordinates, keeps caller state, supports keyboard and disabled mode',t=>{
  const {win,create}=setup(t);const e=create('pf-grid-board',{rows:2,cols:3,cells:[1,0,0,0,2,0],path:[0],preview:[1],previewValid:false});let got;const previews=[];
  e.addEventListener('gp-cell',ev=>got=ev);e.addEventListener('gp-preview',ev=>previews.push(ev.detail.index));
  e.shadowRoot.querySelector('[data-index="4"]').click();assert.equal(got.detail.x,1);assert.equal(got.detail.y,1);assert.ok(got.bubbles&&got.composed);assert.equal(e.data.cells[4],2);
  e.shadowRoot.querySelector('[data-index="0"]').focus();e.shadowRoot.activeElement.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(e.shadowRoot.activeElement.dataset.index,'3');assert.equal(previews.at(-1),3);
  e.data={...e.data,preview:[3]};assert.equal(e.shadowRoot.activeElement.dataset.index,'3');assert.equal(e.shadowRoot.querySelectorAll('[tabindex="0"]').length,1);
  assert.throws(()=>e.data={rows:2,cols:3,cells:[1]},/board size/);assert.equal(e.data.cells.length,6);
  e.data={...e.data,disabled:true};got=null;e.shadowRoot.querySelector('[data-index="0"]').click();assert.equal(got,null);
});
test('fuse lane requests insertion/selection, never burns itself and obeys capacity',t=>{
  const {create}=setup(t);const e=create('pf-fuse-lane',{bombs:[{id:'a',fuses:0,lit:true},{id:'b',fuses:2}],capacity:3});let insert,selected;
  e.addEventListener('gp-insert',ev=>insert=ev.detail.index);e.addEventListener('gp-select',ev=>selected=ev.detail.id);
  e.shadowRoot.querySelector('[data-insert="1"]').click();assert.equal(insert,1);assert.equal(e.data.bombs.length,2);
  e.shadowRoot.querySelector('[data-index="0"]').click();assert.equal(selected,'a');assert.equal(e.data.bombs[0].fuses,0);
  e.data={...e.data,capacity:2};insert=null;e.shadowRoot.querySelector('[data-insert="0"]').click();assert.equal(insert,null);
  assert.throws(()=>e.data={bombs:[{id:'bad',fuses:7}]},/integer/);assert.equal(e.data.bombs.length,2);
});
test('34 mahjong faces, concealed tiles without secrets, keyboard and winning tile are independent',t=>{
  const {win,create}=setup(t);const codes=['m','p','s'].flatMap(s=>Array.from({length:9},(_,i)=>(i+1)+s)).concat(Array.from({length:7},(_,i)=>(i+1)+'z'));
  const e=create('pf-tile-rack',{tiles:codes.map(code=>({id:code,code})),winningId:'7z'});assert.equal(e.shadowRoot.querySelectorAll('svg').length,34);assert.equal(e.shadowRoot.querySelectorAll('.win').length,1);
  let selected;e.addEventListener('gp-select',ev=>selected=ev.detail);e.shadowRoot.querySelector('[data-index="2"]').click();assert.equal(selected.code,'3m');assert.equal(e.data.selectedId,undefined);
  e.data={tiles:[{id:'secret',concealed:true},{id:'a',code:'1m'},{id:'b',code:'2p'}],selectedId:'a'};
  assert.equal(e.shadowRoot.querySelectorAll('svg').length,2);assert.equal(e.shadowRoot.querySelector('[data-index="0"]').getAttribute('aria-label'),'伏せ牌');
  e.shadowRoot.querySelector('[data-index="1"]').focus();e.shadowRoot.activeElement.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(e.shadowRoot.activeElement.dataset.index,'2');
  assert.throws(()=>e.data={tiles:[{id:'x',code:'8z'}]},/Tile code/);assert.equal(e.data.tiles.length,3);
});
test('lobby trims join input, preserves draft through theme changes, gates start and busy requests',t=>{
  const {win,create}=setup(t);const e=create('pf-lobby',{roomId:'initial',players:[]});let join,started=0;
  e.addEventListener('gp-join',ev=>join=ev.detail.roomId);e.addEventListener('gp-start',()=>started++);
  e.shadowRoot.querySelector('input').value='  TEST-7  ';e.setAttribute('theme','slate');assert.equal(e.shadowRoot.querySelector('input').value,'  TEST-7  ');
  const submit=()=>e.shadowRoot.querySelector('form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));submit();assert.equal(join,'TEST-7');assert.equal(e.data.connected,undefined);
  e.data={roomId:'TEST-7',connected:true,isHost:true,players:[{id:'a',label:'<script>x</script>'}],minPlayers:2};submit();assert.equal(started,0);assert.equal(e.shadowRoot.querySelector('script'),null);
  e.data={...e.data,players:[{id:'a'},{id:'b'}]};submit();assert.equal(started,1);
  e.data={...e.data,busy:true};submit();assert.equal(started,1);
  e.data={...e.data,busy:false,isHost:false};submit();assert.equal(started,1);
});
test('catalog connects all five widgets, game actions, themes, snippets and history',t=>{
  const {win}=setup(t);win.document.write(read('../game-parts.html').replace(/<script[\s\S]*?<\/script>/g,''));win.eval(read('../game-logic.js'));win.eval(read('../game-parts-demo.js'));
  const $=s=>win.document.querySelector(s), current=()=>$('#widget').firstElementChild;
  $('#guess-choice').value='4';$('#guess-submit').click();assert.equal(current().data.rows.length,3);assert.equal($('#game-state').textContent,'一致');
  $('[data-widget="board"]').click();current().shadowRoot.querySelector('[data-index="0"]').click();assert.equal(current().data.cells.filter(Boolean).length,4);assert.equal($('#game-state').textContent,'赤の手番');
  current().shadowRoot.querySelector('[data-index="0"]').click();assert.equal(current().data.cells.filter(Boolean).length,4);
  // Focus-triggered preview updates must keep the board operable, not recurse or lose focus.
  current().shadowRoot.querySelector('[data-index="50"]').focus();current().shadowRoot.activeElement.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(current().shadowRoot.activeElement.dataset.index,'51');
  $('[data-widget="fuse"]').click();$('#fuse-end').click();assert.equal(current().data.bombs.length,2);assert.equal(current().data.bombs[0].fuses,2);assert.equal($('#game-state').textContent,'HP 4 / 5');
  current().shadowRoot.querySelector('[data-insert="1"]').click();assert.equal(current().data.bombs.length,3);
  $('[data-widget="tiles"]').click();current().shadowRoot.querySelector('[data-index="2"]').click();$('#tile-win').click();assert.equal(current().data.winningId,'t2');$('#tile-conceal').click();assert.equal(current().data.tiles[0].code,undefined);$('#tile-conceal').click();assert.equal(current().data.tiles[0].code,'2m');
  $('[data-widget="lobby"]').click();current().shadowRoot.querySelector('form').dispatchEvent(new win.Event('submit',{cancelable:true}));assert.equal(current().data.players.length,1);$('#lobby-add').click();assert.equal(current().data.players.length,2);current().shadowRoot.querySelector('form').dispatchEvent(new win.Event('submit',{cancelable:true}));assert.equal(current().data.busy,true);
  for(const type of ['guess','board','fuse','tiles','lobby']){$(`[data-widget="${type}"]`).click();for(const theme of win.GameParts.themes){$('#widget-theme').value=theme;$('#widget-theme').dispatchEvent(new win.Event('change'));assert.equal(current().getAttribute('theme'),theme);}$('#widget-code').click();assert.ok($('#widget-snippet').value.includes('</script>'));assert.ok($('#widget-snippet').value.includes('game-widgets.js'));$('#widget-dialog').close();}
});
test('downloadable example selects winning tile and resets without external game files',t=>{
  const {win}=setup(t);win.document.write(read('./game-example.html').replace(/<script[\s\S]*?<\/script>/g,''));win.eval(read('./game-example.js'));const $=s=>win.document.querySelector(s), rack=$('#rack');
  rack.shadowRoot.querySelector('[data-index="3"]').click();$('#confirm').click();assert.equal(rack.data.winningId,'t3');$('#reset').click();assert.equal(rack.data.winningId,null);assert.equal($('#confirm').disabled,true);
});
