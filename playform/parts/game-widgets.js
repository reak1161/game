/* Game-specific presentation components. Requires game-parts.js; no game engine or network. */
(function () {
  'use strict';
  if (!globalThis.GameParts?.Component) throw new Error('Load game-parts.js 1.1+ first.');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const int = (v, fallback, min, max) => { const n=v ?? fallback; if (!Number.isInteger(n)||n<min||n>max) throw new RangeError(`Expected integer ${min}..${max}`); return n; };
  const list = (v=[]) => { if(!Array.isArray(v))throw new TypeError('Expected array'); const ids=new Set(); return v.map(x=>{if(!x||typeof x.id!=='string'||!x.id||ids.has(x.id))throw new TypeError('Unique string ids required');ids.add(x.id);return {...x};}); };
  class Widget extends GameParts.Component {
    layout(style,html) { this.shell(`<style>${style}</style>${html}`); }
  }
  class GuessHistory extends Widget {
    normalize(d) {
      const columns=list(d.columns), rows=list(d.rows).map(row=>{
        if(!Array.isArray(row.cells)||row.cells.length!==columns.length)throw new RangeError('cells must match columns');
        return {...row,cells:row.cells.map(c=>{if(!c||!['higher','lower','equal','none'].includes(c.comparison??'none'))throw new TypeError('Unknown comparison');return {...c,comparison:c.comparison??'none'};})};
      });
      return {...d,columns,rows};
    }
    render() {
      const d=this.normalize(this._data), signs={higher:'↑',lower:'↓',equal:'=',none:'·'}, words={higher:'正解はもっと大きい',lower:'正解はもっと小さい',equal:'一致',none:'比較なし'};
      this.layout(`.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}caption{text-align:left;font-size:13px;margin-bottom:22px}th{font-weight:400;font-size:11px;color:var(--_muted);text-align:right;padding:0 16px 13px}th:first-child{text-align:left}tbody th{font-size:14px;color:var(--_ink);padding:22px 16px 22px 0;white-space:nowrap}td{text-align:right;padding:19px 16px;border-left:1px solid var(--_line);min-width:85px}tr{border-bottom:1px solid var(--_line)}tbody tr:last-child{border:0}.value{font:22px Consolas,monospace}.mark{display:inline-block;margin-left:12px;font:16px Consolas;color:var(--_muted)}.equal{color:var(--_accent)}.empty{text-align:left;padding:25px 0}`,`<div class="scroll"><table part="table"><caption>${esc(d.label||'回答履歴')}</caption><thead><tr><th scope="col">${esc(d.rowLabel||'回答')}</th>${d.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r=>`<tr part="item" data-id="${esc(r.id)}"><th scope="row">${esc(r.label)}</th>${r.cells.map(c=>`<td class="${c.comparison}"><span class="value">${esc(c.value)}</span><span class="mark" aria-hidden="true">${signs[c.comparison]}</span><span class="sr">${words[c.comparison]}</span></td>`).join('')}</tr>`).join('')||`<tr><td class="empty" colspan="${d.columns.length+1}">—</td></tr>`}</tbody></table></div>`);
    }
  }
  class GridBoard extends Widget {
    normalize(d) {
      const rows=int(d.rows,15,1,30), cols=int(d.cols,15,1,30), size=rows*cols;
      const cells=d.cells??Array(size).fill(0);
      if(!Array.isArray(cells)||cells.length!==size||cells.some(c=>![0,1,2].includes(c)))throw new RangeError('cells must match board size and contain 0, 1, 2');
      const indices=v=>{if(!Array.isArray(v))throw new TypeError('Expected indices');return v.map(i=>int(i,0,0,size-1));};
      return {...d,rows,cols,cells,path:indices(d.path??[]),preview:indices(d.preview??[])};
    }
    render() {
      const d=this.normalize(this._data), path=new Set(d.path), preview=new Set(d.preview);
      this._cursor=Math.min(this._cursor??0,d.cells.length-1);
      this.layout(`.board{display:grid;grid-template-columns:repeat(${d.cols},1fr);gap:2px;padding:5px;border-top:3px solid var(--gp-team-one,#3765a8);border-bottom:3px solid var(--gp-team-one,#3765a8);border-left:3px solid var(--gp-team-two,#b94c62);border-right:3px solid var(--gp-team-two,#b94c62);width:min(100%,var(--gp-board-width,465px));margin:auto;background:var(--_line)}.row{display:contents}.cell{padding:0;aspect-ratio:1;border:0;background:var(--_face);position:relative;border-radius:0;min-width:0}.cell[data-team="1"]{background:var(--gp-team-one,#3765a8)}.cell[data-team="2"]{background:var(--gp-team-two,#b94c62)}.cell.path:after{content:'';position:absolute;inset:34%;background:white;border-radius:50%}.cell.preview{box-shadow:inset 0 0 0 2px var(--_accent);background:var(--_bg)}.cell.invalid:after{content:'×';color:var(--_ink);position:absolute;inset:0;display:grid;place-items:center}.cell:focus-visible{outline-offset:0;outline:2px solid var(--_ink);z-index:1}.cell:disabled{cursor:default}`,`<div class="board" part="board" role="grid" aria-label="${esc(d.label||'盤面')}" aria-rowcount="${d.rows}" aria-colcount="${d.cols}">${Array.from({length:d.rows},(_,y)=>`<div class="row" role="row">${Array.from({length:d.cols},(_,x)=>{const i=y*d.cols+x;return `<button role="gridcell" class="cell ${path.has(i)?'path':''} ${preview.has(i)?'preview':''} ${preview.has(i)&&d.previewValid===false?'invalid':''}" part="cell" data-index="${i}" data-focus="cell:${i}" data-team="${d.cells[i]}" tabindex="${i===this._cursor?0:-1}" aria-label="${x+1}列 ${y+1}行 ${['空き','青','赤'][d.cells[i]]}" ${d.disabled?'disabled':''}></button>`;}).join('')}</div>`).join('')}</div>`);
      this.bind('[data-index]', el=>{if(!d.disabled)this.emit('gp-cell',{index:+el.dataset.index,x:+el.dataset.index%d.cols,y:Math.floor(+el.dataset.index/d.cols)});});
      this.shadowRoot.querySelectorAll('[data-index]').forEach(el=>{
        const detail=()=>({index:+el.dataset.index,x:+el.dataset.index%d.cols,y:Math.floor(+el.dataset.index/d.cols)});
        el.addEventListener('pointerenter',()=>{if(!d.disabled)this.emit('gp-preview',detail());});
        el.addEventListener('focus',()=>{this._cursor=+el.dataset.index;this.shadowRoot.querySelectorAll('[data-index]').forEach(b=>b.tabIndex=b===el?0:-1);if(!d.disabled)this.emit('gp-preview',detail());});
        el.addEventListener('keydown',e=>{const i=+el.dataset.index,x=i%d.cols,y=Math.floor(i/d.cols);const next={ArrowLeft:y*d.cols+Math.max(0,x-1),ArrowRight:y*d.cols+Math.min(d.cols-1,x+1),ArrowUp:Math.max(0,y-1)*d.cols+x,ArrowDown:Math.min(d.rows-1,y+1)*d.cols+x,Home:y*d.cols,End:y*d.cols+d.cols-1}[e.key];if(next!==undefined){e.preventDefault();this.shadowRoot.querySelector(`[data-index="${next}"]`).focus();}});
      });
    }
  }
  const bombSVG=(fuses,lit)=>`<svg viewBox="0 0 74 142" aria-hidden="true"><path d="M37 80V25" stroke="var(--_line)" stroke-width="3" fill="none"/>${Array.from({length:fuses},(_,i)=>`<path d="M37 ${76-i*9}v-5" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`).join('')}<path d="M31 83v-8h12v8" fill="currentColor"/><circle cx="37" cy="108" r="25" fill="currentColor"/><path d="M23 98q3-6 9-7" stroke="var(--_face)" stroke-width="3" fill="none"/>${lit?`<path d="m37 ${fuses?69-(fuses-1)*9:77} -5 -9 6 3 3 -10 3 10 6 -3 -5 9Z" fill="var(--gp-danger,#bd3e54)"/>`:''}</svg>`;
  class FuseLane extends Widget {
    normalize(d) {const bombs=list(d.bombs).map(b=>({...b,fuses:int(b.fuses,1,0,6)}));const capacity=int(d.capacity,5,1,12);if(bombs.length>capacity)throw new RangeError('bombs exceed capacity');return {...d,bombs,capacity};}
    render() {
      const d=this.normalize(this._data), insert=i=>`<button class="insert" part="insert" data-insert="${i}" data-focus="insert:${i}" aria-label="${i+1}番目に爆弾を置く" ${d.disabled||d.bombs.length>=d.capacity?'disabled':''}>+</button>`;
      this.layout(`.lane{display:flex;align-items:end;overflow-x:auto;gap:12px;padding:10px 3px 20px;min-height:184px}.bomb{flex:0 0 74px;background:none;border:0;padding:0;color:var(--_ink);position:relative}.bomb[aria-pressed=true]{box-shadow:0 2px var(--_accent)}svg{display:block;width:74px;height:142px}.count{display:block;text-align:center;font:11px Consolas;color:var(--_muted);height:20px}.insert{flex:0 0 32px;height:46px;margin-bottom:24px;border:1px solid var(--_line);background:none;color:var(--_muted);font-size:20px}.insert:hover:enabled{border-color:var(--_ink);color:var(--_ink)}.insert:disabled{opacity:.2}.bomb:disabled{opacity:.55}`,`<div class="lane" role="group" aria-label="${esc(d.label||'爆弾の列')}">${insert(0)}${d.bombs.map((b,i)=>`<button class="bomb" part="item bomb" data-index="${i}" data-focus="bomb:${esc(b.id)}" aria-pressed="${d.selectedId===b.id}" aria-label="爆弾 ${i+1}、導火線 ${b.fuses}、${b.lit?'点火中':'未点火'}" ${d.disabled||b.disabled?'disabled':''}>${bombSVG(b.fuses,b.lit)}<span class="count">${b.fuses}</span></button>${insert(i+1)}`).join('')}</div>`);
      this.bind('[data-insert]',el=>{if(!d.disabled&&d.bombs.length<d.capacity)this.emit('gp-insert',{index:+el.dataset.insert});});
      this.bind('[data-index]',el=>{const index=+el.dataset.index;if(!d.disabled&&!d.bombs[index].disabled)this.emit('gp-select',{id:d.bombs[index].id,index});});
    }
  }
  const chars=['東','南','西','北','白','發','中'], numerals=['一','二','三','四','五','六','七','八','九'];
  function face(code) {
    const n=+code[0], suit=code[1];let shapes='';
    if(suit==='z')shapes=n===5?'<rect x="12" y="16" width="36" height="50" fill="none" stroke="var(--gp-tile-blue,#2f5680)" stroke-width="2"/>':`<text x="30" y="58" font-size="38" fill="${n===6?'var(--gp-tile-green,#22735d)':n===7?'var(--gp-tile-red,#b43148)':'var(--_ink)'}">${chars[n-1]}</text>`;
    else if(suit==='m')shapes=`<text x="30" y="35" font-size="29">${numerals[n-1]}</text><text x="30" y="67" font-size="27" fill="var(--gp-tile-red,#b43148)">萬</text>`;
    else {
      const patterns={1:[[30,41]],2:[[30,23],[30,59]],3:[[16,22],[30,41],[44,60]],4:[[16,23],[44,23],[16,59],[44,59]],5:[[16,23],[44,23],[30,41],[16,59],[44,59]],6:[[16,19],[44,19],[16,41],[44,41],[16,63],[44,63]],7:[[16,17],[30,17],[44,17],[20,40],[40,40],[20,63],[40,63]],8:[[18,15],[42,15],[18,32],[42,32],[18,50],[42,50],[18,67],[42,67]],9:[[14,18],[30,18],[46,18],[14,41],[30,41],[46,41],[14,64],[30,64],[46,64]]};
      if(suit==='s'&&n===1)shapes='<path d="M20 58q-4-15 13-27l-4-13 10 6 6 2-8 4q11 29-17 28l-6 9 4-16" fill="var(--gp-tile-green,#22735d)"/><circle cx="34" cy="24" r="1.7" fill="white"/>';
      else shapes=patterns[n].map(([x,y],i)=>suit==='p'?`<circle cx="${x}" cy="${y}" r="${n===1?16:6}" fill="none" stroke="${i===Math.floor(n/2)&&n%2?'var(--gp-tile-red,#b43148)':'var(--gp-tile-blue,#2f5680)'}" stroke-width="3"/>`:`<path d="M${x} ${y-5}v10m-3-7h6m-6 4h6" stroke="${n===7&&i<3?'var(--gp-tile-red,#b43148)':'var(--gp-tile-green,#22735d)'}" stroke-width="2.6" stroke-linecap="round"/>`).join('');
    }
    return `<svg viewBox="0 0 60 82" aria-hidden="true" fill="currentColor" text-anchor="middle" font-family="'Yu Mincho',serif">${shapes}</svg>`;
  }
  class TileRack extends Widget {
    normalize(d) {return {...d,tiles:list(d.tiles).map(t=>{if(!t.concealed&&!/^(?:[1-9][mps]|[1-7]z)$/.test(t.code))throw new TypeError('Tile code must be 1m..9m, 1p..9p, 1s..9s or 1z..7z');return t;})};}
    render() {
      const d=this.normalize(this._data);
      this.layout(`.rack{display:flex;align-items:end;gap:4px;overflow-x:auto;padding:16px 4px 19px}.tile{position:relative;flex:0 0 var(--gp-tile-width,49px);background:var(--_face);border:1px solid var(--_line);border-radius:3px;padding:0 2px 4px;box-shadow:0 4px 0 var(--_line);color:var(--_ink)}svg{display:block;width:100%;height:auto}.tile.win{margin-left:17px}.tile.win:after{content:'';position:absolute;height:2px;left:13px;right:13px;bottom:-13px;background:var(--_accent)}.tile[aria-pressed=true]{translate:0 -10px;border-color:var(--_accent);box-shadow:0 4px 0 var(--_accent)}.tile:disabled{cursor:default}.back{display:block;aspect-ratio:60/82;background:var(--_accent);border:4px solid var(--_face);border-radius:2px}.tile:focus-visible{outline-offset:5px}`,`<div class="rack" role="group" aria-label="${esc(d.label||'手牌')}">${d.tiles.map((t,i)=>`<button class="tile ${t.id===d.winningId?'win':''}" part="item tile" data-index="${i}" data-focus="tile:${esc(t.id)}" aria-label="${t.concealed?'伏せ牌':esc(t.label||(t.code[1]==='z'?chars[+t.code[0]-1]:t.code[0]+({m:'萬',p:'筒',s:'索'}[t.code[1]])))}${t.id===d.winningId?'、和了牌':''}" aria-pressed="${t.id===d.selectedId}" ${d.disabled||t.disabled||t.concealed?'disabled':''}>${t.concealed?'<span class="back"></span>':face(t.code)}</button>`).join('')}</div>`);
      this.bind('[data-index]',el=>{const index=+el.dataset.index,t=d.tiles[index];if(!d.disabled&&!t.disabled&&!t.concealed)this.emit('gp-select',{id:t.id,index,code:t.code});});
      this.shadowRoot.querySelectorAll('.tile').forEach(el=>el.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tiles=[...this.shadowRoot.querySelectorAll('.tile:not(:disabled)')],i=tiles.indexOf(el),next=e.key==='Home'?0:e.key==='End'?tiles.length-1:(i+(e.key==='ArrowRight'?1:-1)+tiles.length)%tiles.length;tiles[next]?.focus();}));
    }
  }
  class Lobby extends Widget {
    normalize(d) {const players=list(d.players), maxPlayers=int(d.maxPlayers,8,1,32), minPlayers=int(d.minPlayers,2,1,maxPlayers);if(players.length>maxPlayers)throw new RangeError('players exceed capacity');return {...d,players,maxPlayers,minPlayers};}
    render() {
      const d=this.normalize(this._data), draft=this.shadowRoot.querySelector('input')?.value;
      this.layout(`.lobby{max-width:430px;margin:auto;padding:12px 6px}.room{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--_line);padding-bottom:22px;gap:20px}.room label{font-size:11px;display:block;color:var(--_muted);margin-bottom:8px}input{font:22px Consolas,monospace;letter-spacing:2px;width:220px;max-width:100%;border:0;border-bottom:1px solid var(--_line);background:none;color:var(--_ink);padding:4px 0;border-radius:0}input:focus-visible{outline:2px solid var(--_accent);outline-offset:4px}.code{font:25px Consolas;letter-spacing:2px;overflow-wrap:anywhere}.count{font:12px Consolas;color:var(--_muted);white-space:nowrap}.people{list-style:none;padding:8px 0;margin:0 0 16px}.people li{display:flex;align-items:center;gap:13px;min-height:45px;font-size:13px}.people li:before{content:'';height:7px;width:7px;background:var(--_ink);border-radius:50%}.people small{margin-left:auto;font-size:10px;color:var(--_muted)}.action{border:1px solid var(--_ink);background:var(--_ink);color:var(--_bg);padding:11px 28px;min-width:120px;font-size:13px}.action:disabled{opacity:.35}.bottom{display:flex;justify-content:flex-end;min-height:41px}.status{font-size:12px;color:var(--_muted);align-self:center}.error{font-size:12px;color:var(--gp-danger,#bd3e54);margin:14px 0}`,`<form class="lobby" aria-label="${esc(d.label||'ルーム')}"><div class="room"><div><label for="room-code">ROOM</label>${d.connected?`<span class="code" part="code">${esc(d.roomId)}</span>`:`<input id="room-code" data-focus="room" aria-label="ルームID" value="${esc(d.roomId||'')}" autocomplete="off" required ${d.busy?'disabled':''}>`}</div><span class="count">${d.players.length} / ${d.maxPlayers}</span></div><ul class="people" part="players">${d.players.map(p=>`<li part="item"><span>${esc(p.label)}</span>${p.id===d.hostId?'<small>HOST</small>':''}</li>`).join('')}</ul>${d.error?`<p class="error" role="alert">${esc(d.error)}</p>`:''}<div class="bottom">${!d.connected?`<button class="action" type="submit" data-focus="join" ${d.busy?'disabled':''}>${d.busy?'接続中…':'参加'}</button>`:d.isHost?`<button class="action" type="submit" data-focus="start" ${d.busy||d.players.length<d.minPlayers?'disabled':''}>${d.busy?'開始中…':'始める'}</button>`:'<span class="status" role="status">開始を待っています</span>'}</div></form>`);
      const input=this.shadowRoot.querySelector('input');if(input&&draft!==undefined&&this._lastRoomId===d.roomId)input.value=draft;this._lastRoomId=d.roomId;
      this.shadowRoot.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(d.busy)return;if(d.connected){if(d.isHost&&d.players.length>=d.minPlayers)this.emit('gp-start',{roomId:d.roomId});}else{const roomId=input.value.trim();if(roomId)this.emit('gp-join',{roomId});}});
    }
  }
  for(const [tag,Component] of [['pf-guess-history',GuessHistory],['pf-grid-board',GridBoard],['pf-fuse-lane',FuseLane],['pf-tile-rack',TileRack],['pf-lobby',Lobby]])if(!customElements.get(tag))customElements.define(tag,Component);
})();
