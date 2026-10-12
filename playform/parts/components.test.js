import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
const library = readFileSync(new URL('./game-parts.js', import.meta.url),'utf8');
const motions = readFileSync(new URL('./motions.js', import.meta.url),'utf8');
function setup(t, beforeLoad) {
  const win = new Window({url:'http://localhost/parts/example.html',settings:{enableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
  win.structuredClone = structuredClone; // Browser API not implemented by happy-dom.
  const calls=[];
  win.HTMLElement.prototype.animate=function(frames,options){let resolve;const finished=new Promise(r=>resolve=r);const a={finished,cancelled:false,frames,options,cancel(){this.cancelled=true;resolve();},finish(){resolve();}};calls.push(a);return a;};
  beforeLoad?.(win);win.eval(motions);win.eval(library);
  t.after(()=>win.happyDOM.close());
  const create=(tag,data)=>{const el=win.document.createElement(tag);win.document.body.append(el);el.data=data;return el;};
  return {win,create,calls};
}
test('hand requests selection without changing engine state; incoming text remains text', t=>{
  const {create}=setup(t);const data={cards:[{id:'<id>"',label:'<img src=x onerror=alert(1)>',value:2},{id:'b',label:'防御',disabled:true}],selectedId:null};
  const el=create('pf-hand',data);let event;el.addEventListener('gp-select',e=>event=e);
  el.shadowRoot.querySelector('.card').click();
  assert.equal(event.detail.id,'<id>"');assert.equal(event.bubbles,true);assert.equal(event.composed,true);assert.equal(el.data.selectedId,null);
  assert.equal(el.shadowRoot.querySelector('img'),null);assert.match(el.shadowRoot.querySelector('strong').textContent,/<img/);
  data.cards[0].label='changed';assert.notEqual(el.data.cards[0].label,'changed');
  const copy=el.data;copy.cards.length=0;assert.equal(el.data.cards.length,2);
  event=null;el.shadowRoot.querySelectorAll('.card')[1].click();assert.equal(event,null);
  assert.throws(()=>el.data={cards:[{id:'x'},{id:'x'}]},/unique/);assert.equal(el.data.cards.length,2);
});
test('keyboard focus skips unavailable hand cards and survives controlled rerender', t=>{
  const {win,create}=setup(t);const el=create('pf-hand',{cards:[{id:'a',label:'A'},{id:'b',disabled:true},{id:'c',label:'C'}]});
  let buttons=el.shadowRoot.querySelectorAll('.card');buttons[0].focus();buttons[0].dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(el.shadowRoot.activeElement.dataset.focus,'card:c');
  el.data={...el.data,selectedId:'c'};assert.equal(el.shadowRoot.activeElement.dataset.focus,'card:c');assert.equal(el.shadowRoot.activeElement.getAttribute('aria-pressed'),'true');
});
test('slot reorder is a request; disabled barriers and capacity are enforced', t=>{
  const {create}=setup(t);const el=create('pf-slots',{items:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C',disabled:true}],capacity:5});let result;
  el.addEventListener('gp-reorder',e=>result=e.detail);
  el.shadowRoot.querySelector('[data-move="0,1"]').click();assert.deepEqual(Array.from(result.order),['b','a','c']);assert.deepEqual(Array.from(el.data.items,c=>c.id),['a','b','c']);
  result=null;el.shadowRoot.querySelector('[data-move="1,1"]').click();assert.equal(result,null);
  assert.throws(()=>el.data={items:[{id:'a'},{id:'b'}],capacity:1},/capacity/);assert.equal(el.data.items.length,3);
});
test('command cooldown blocks clicks and scoped shortcuts until engine updates it', t=>{
  const {win,create}=setup(t);const el=create('pf-command',{commands:[{id:'q',label:'雷撃',key:'Q',remaining:2,total:3},{id:'e',label:'回復',key:'E'}]});const events=[];el.addEventListener('gp-command',e=>events.push(e.detail.id));
  el.shadowRoot.querySelector('[data-command="0"]').click();
  el.shadowRoot.querySelector('.commands').dispatchEvent(new win.KeyboardEvent('keydown',{key:'q',bubbles:true}));assert.equal(events.length,0);
  el.data={commands:[{id:'q',label:'雷撃',key:'Q',remaining:0,total:3}]};el.shadowRoot.querySelector('.commands').dispatchEvent(new win.KeyboardEvent('keydown',{key:'q',bubbles:true}));assert.deepEqual(events,['q']);
  assert.equal(el.data.commands[0].remaining,0); // No internal timer or hidden game mutation.
});
test('meter clamps bad bounds, exposes accessible progress, and supports pre-upgrade data', t=>{
  const {win,create}=setup(t,w=>{w.document.body.innerHTML='<pf-meter id="early"></pf-meter>';w.document.getElementById('early').data={label:'HP',value:8,max:10};});
  assert.equal(win.document.getElementById('early').shadowRoot.querySelector('[aria-valuenow]').getAttribute('aria-valuenow'),'8');
  const el=create('pf-meter',{label:'HP',value:900,max:100});assert.equal(el.data.value,100);
  el.data={value:-5,max:0};assert.equal(el.data.value,0);assert.equal(el.data.max,1);
});
test('motion respects suppression, cancels replacement, abort, updates and disconnection', async t=>{
  const {win,create,calls}=setup(t);const el=create('pf-meter',{value:10,max:20});
  let a=el.play('hit',{reducedMotion:true});assert.equal(await a.finished,true);assert.equal(calls.length,0);
  a=el.play('hit');const b=el.play('resolve');assert.equal(await a.finished,false);assert.equal(calls[0].cancelled,true);
  el.remove();assert.equal(await b.finished,false);
  win.document.body.append(el);const controller=new win.AbortController();a=el.play('place',{signal:controller.signal});controller.abort();assert.equal(await a.finished,false);
  a=el.play('deal');el.data={value:9,max:20};assert.equal(await a.finished,false);
  assert.throws(()=>el.play('missing'),/Unknown motion/);assert.throws(()=>el.play('hit',{part:'no-such-part'}),/matching part/);
});
test('all themes render for all five widgets; turn requests remain controlled', t=>{
  const {win,create}=setup(t);const examples=[['pf-meter',{value:10,max:20}],['pf-hand',{cards:[{id:'x',label:'X'}]}],['pf-turns',{players:[{id:'a',label:'A'},{id:'b',label:'B'}],activeId:'a'}],['pf-slots',{items:[{id:'x',label:'X'}]}],['pf-command',{commands:[{id:'x',label:'X'}]}]];
  for(const [tag,data]of examples){const el=create(tag,data);for(const theme of win.GameParts.themes){el.setAttribute('theme',theme);assert.ok(el.shadowRoot.querySelector('[part=body]'));}if(tag==='pf-turns'){let id;el.addEventListener('gp-turn',e=>id=e.detail.id);el.shadowRoot.querySelector('[data-index="1"]').click();assert.equal(id,'b');assert.equal(el.data.activeId,'a');}}
  assert.equal(win.document.querySelector('style'),null); // All component style stays inside shadow roots.
});
test('standalone example connects selection, damage, placement, turns and reset', t=>{
  const {win}=setup(t);win.document.write(readFileSync(new URL('./example.html',import.meta.url),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));win.eval(readFileSync(new URL('./example.js',import.meta.url),'utf8'));
  const get=id=>win.document.getElementById(id);
  get('hand').shadowRoot.querySelector('[data-index="0"]').click();get('commands').shadowRoot.querySelector('[data-command="0"]').click();
  assert.equal(get('enemy').data.value,18);assert.equal(get('hand').data.cards.length,2);assert.equal(get('field').data.items.length,1);
  get('commands').shadowRoot.querySelector('[data-command="1"]').click();assert.equal(get('player').data.value,26);assert.equal(get('hand').shadowRoot.querySelector('.card').disabled,true);
  get('commands').shadowRoot.querySelector('[data-command="1"]').click();get('hand').shadowRoot.querySelector('[data-index="1"]').click();get('commands').shadowRoot.querySelector('[data-command="0"]').click();assert.equal(get('player').data.value,30);
  get('reset').click();assert.equal(get('enemy').data.value,24);assert.equal(get('hand').data.cards.length,3);assert.equal(get('field').data.items.length,0);
});
test('parts gallery switches all five demos and exposes pasteable integration snippets', t=>{
  const {win}=setup(t);win.document.write(readFileSync(new URL('../parts.html',import.meta.url),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));win.eval(readFileSync(new URL('../parts-demo.js',import.meta.url),'utf8'));
  for(const id of ['meter','hand','turns','slots','command']){
    win.document.querySelector(`[data-type="${id}"]`).click();
    const component=win.document.querySelector('#sample').firstElementChild;
    assert.ok(component.shadowRoot.querySelector('[part=body]'));
    for(const theme of win.GameParts.themes){const select=win.document.querySelector('#theme');select.value=theme;select.dispatchEvent(new win.Event('change'));assert.equal(component.getAttribute('theme'),theme);}
    win.document.querySelector('#show-code').click();const code=win.document.querySelector('#code').value;
    assert.ok(code.includes('</script>'));assert.ok(code.includes(component.tagName.toLowerCase()));assert.ok(code.includes('part.data ='));
    win.document.querySelector('#code-dialog').close();
  }
});
