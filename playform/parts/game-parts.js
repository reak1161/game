/* PLAYFORM components. Load as a normal script; no build, framework, or external CSS. */
(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function items(value = []) {
    if (!Array.isArray(value)) throw new TypeError('Items must be an array.');
    const ids = new Set();
    return value.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new TypeError('Every item needs a unique, nonempty string id.');
      ids.add(item.id);
      return { ...item };
    });
  }
  const themes = Object.freeze(['neutral', 'table', 'slate', 'pixel', 'arena', 'blueprint']);
  const css = `
    :host{display:block;--_bg:var(--gp-background,#f4f4f5);--_ink:var(--gp-ink,#25272b);--_accent:var(--gp-accent,#375b91);--_muted:var(--gp-muted,#6b6e75);--_line:var(--gp-line,#d2d4d8);--_face:var(--gp-face,#ffffff);--_on:var(--gp-on-accent,#ffffff);--_radius:3px;--_border:1px;--_shadow:0 3px 0 #17191e18;font:14px/1.4 var(--gp-font,'Segoe UI','Yu Gothic UI',Meiryo,sans-serif);color:var(--_ink);color-scheme:light}
    :host([theme=table]){--_bg:var(--gp-background,#edf3f1);--_accent:var(--gp-accent,#326654);--_line:var(--gp-line,#bdcec7);--_shadow:0 3px 0 #223b3218}
    :host([theme=slate]){--_bg:var(--gp-background,#272e35);--_ink:var(--gp-ink,#f1f3f6);--_accent:var(--gp-accent,#a9c6f2);--_muted:var(--gp-muted,#a8b1c0);--_line:var(--gp-line,#546071);--_face:var(--gp-face,#333d42);--_on:var(--gp-on-accent,#272e35);--_radius:1px;--_shadow:none;color-scheme:dark}
    :host([theme=pixel]){--_bg:var(--gp-background,#e8eaee);--_ink:var(--gp-ink,#282c38);--_accent:var(--gp-accent,#b43d51);--_muted:var(--gp-muted,#686e7d);--_line:var(--gp-line,#323847);--_face:var(--gp-face,#ffffff);--_on:var(--gp-on-accent,#ffffff);--_radius:0px;--_border:3px;--_shadow:4px 4px 0 #323847;font-family:var(--gp-font,Consolas,'MS Gothic',monospace)}
    :host([theme=arena]){--_bg:var(--gp-background,#f0f1f2);--_ink:var(--gp-ink,#22282c);--_accent:var(--gp-accent,#265d55);--_muted:var(--gp-muted,#606e72);--_line:var(--gp-line,#bbc5c7);--_face:var(--gp-face,#ffffff);--_on:var(--gp-on-accent,#ffffff);--_radius:0px;--_shadow:none}
    :host([theme=blueprint]){--_bg:var(--gp-background,#e5edf2);--_ink:var(--gp-ink,#284963);--_accent:var(--gp-accent,#255f8c);--_muted:var(--gp-muted,#597285);--_line:var(--gp-line,#a5bdcd);--_face:var(--gp-face,#f5f9fc);--_on:var(--gp-on-accent,#f5f9fc);--_radius:0px;--_shadow:none;font-family:var(--gp-font,Consolas,'Yu Gothic UI',monospace)}
    *{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer}button:disabled{cursor:default}button:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--_accent);outline-offset:5px}button{border-radius:var(--_radius)}[hidden]{display:none!important}.frame{padding:var(--gp-padding,24px);background:var(--_bg);border:var(--_border) solid var(--_line);border-radius:var(--_radius)}:host([theme=blueprint]) .frame{background-image:linear-gradient(#255f8c08 1px,transparent 1px),linear-gradient(90deg,#255f8c08 1px,transparent 1px);background-size:20px 20px}:host([theme=arena]) .frame{border:0;border-left:4px solid var(--_accent)}
    .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}.empty{color:var(--_muted);margin:0;font-size:12px}.meter-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px}.meter-name{font-size:13px}.meter-numbers{display:flex;align-items:baseline;gap:7px;font-variant-numeric:tabular-nums}.meter-numbers b{font:28px/1.1 Georgia,serif;font-weight:400}.meter-numbers small{font-size:12px;color:var(--_muted)}.track{position:relative;margin-top:15px;height:7px;background:var(--_line);overflow:hidden}.bar{height:100%;background:var(--_accent)}:host([theme=pixel]) .track{height:12px;border:2px solid var(--_ink)}:host([theme=pixel]) .meter-numbers b,:host([theme=arena]) .meter-numbers b{font:700 28px/1 Consolas,monospace}:host([theme=arena]) .track{height:12px;transform:skewX(-12deg);margin-inline:2px}:host([theme=blueprint]) .track{height:5px}
    .hand{display:flex;gap:14px;align-items:end;overflow-x:auto;padding:8px 6px 12px}.card{position:relative;flex:0 0 var(--gp-card-width,126px);min-height:174px;display:flex;flex-direction:column;align-items:start;padding:15px 14px;background:var(--_face);border:var(--_border) solid var(--_line);box-shadow:var(--_shadow);text-align:left}.card b{display:block;font:42px/1 Georgia;margin:15px 0 18px;letter-spacing:-1px}.card strong{font-size:13px;font-weight:600;margin-top:auto}.card small{font-size:11px;color:var(--_muted);margin-top:8px}.card[aria-pressed=true]{outline:2px solid var(--_accent);outline-offset:3px;translate:0 -5px}.card:disabled{opacity:.4}:host([theme=pixel]) .card b{font:700 35px/1 Consolas}:host([theme=arena]) .card{border:0;border-top:4px solid var(--_accent);min-height:160px}:host([theme=slate]) .card b{color:var(--_accent)}
    .turns{display:flex;gap:0}.turn{position:relative;flex:1;min-width:85px;border:0;border-bottom:1px solid var(--_line);background:none;padding:15px 16px 20px;text-align:left;overflow-wrap:anywhere}.turn strong{font-size:13px;font-weight:500;display:block}.turn small{display:block;font-size:11px;margin-top:6px;color:var(--_muted)}.turn[aria-current=true]:after{content:'';position:absolute;left:16px;right:16px;bottom:-1px;height:3px;background:var(--_accent)}.turn[aria-current=true]{color:var(--_accent)}.turn:disabled{opacity:.35}:host([theme=pixel]) .turn[aria-current=true]:after{height:5px;left:0;right:0}:host([theme=arena]) .turn[aria-current=true]{background:var(--_accent);color:var(--_on)}:host([theme=arena]) .turn[aria-current=true] small{color:var(--_on)}
    .slots{display:flex;gap:12px;overflow-x:auto;padding:7px 5px 12px}.slot,.vacant{flex:1;min-width:102px;max-width:170px;position:relative}.slot{border:var(--_border) solid var(--_line);background:var(--_face);box-shadow:var(--_shadow);border-radius:var(--_radius)}.slot.selected{outline:2px solid var(--_accent);outline-offset:3px}.slot-main{width:100%;min-height:116px;background:none;border:0;padding:12px;text-align:left}.slot-main b{display:block;font:27px Georgia;color:var(--_accent);margin-bottom:11px}.slot-main strong{font-size:12px;font-weight:500}.slot-main:disabled{opacity:.4}.slot-controls{display:flex;justify-content:space-between;border-top:1px solid var(--_line);margin:0 10px;padding:3px 0}.slot-controls button{background:none;border:0;font-size:17px;width:30px;height:29px}.slot-controls button:disabled{opacity:.25}.vacant{border:1px dashed var(--_line);min-height:155px;display:grid;place-items:center;color:var(--_muted);font:11px Consolas}.slot.dragging{opacity:.4}:host([theme=arena]) .slot{border:0;border-top:4px solid var(--_accent)}
    .commands{display:flex;gap:13px;flex-wrap:wrap}.command{position:relative;isolation:isolate;overflow:hidden;min-width:135px;flex:1;background:var(--_face);border:var(--_border) solid var(--_line);padding:15px;text-align:left;min-height:76px;box-shadow:var(--_shadow)}.command kbd{display:inline-grid;place-items:center;min-width:24px;height:24px;font:12px Consolas;border:1px solid var(--_line);margin-right:12px;background:var(--_bg)}.command-name{font-size:12px}.command .cooldown{position:absolute;bottom:0;left:0;height:3px;background:var(--_accent);z-index:-1}.command small{position:absolute;right:9px;top:7px;font:12px Consolas;color:var(--_muted)}.command[aria-pressed=true]{border-color:var(--_accent);outline:1px solid var(--_accent)}.command:disabled{color:var(--_muted)}.command:disabled:not(.cooling){opacity:.4}:host([theme=pixel]) .command .cooldown{height:6px}:host([theme=arena]) .command kbd{background:var(--_accent);color:var(--_on)}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  `;
  class GamePart extends HTMLElement {
    static observedAttributes = ['theme', 'reduced-motion'];
    constructor() { super(); this.attachShadow({ mode: 'open' }); this._data = {}; this._motions = new Set(); }
    get data() { return structuredClone(this._data); }
    set data(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('data must be an object.');
      const next = this.normalize(structuredClone(value)); // Invalid updates leave the previous state intact.
      this._data = next; this.render();
    }
    normalize(value) { return value; }
    connectedCallback() {
      // Preserve properties assigned before customElements.define() upgraded this element.
      if (Object.prototype.hasOwnProperty.call(this, 'data')) { const value = this.data; delete this.data; this.data = value; }
      else this.render();
    }
    disconnectedCallback() { this.cancelMotion(); }
    attributeChangedCallback() { this.render(); }
    cancelMotion() { this._motions.forEach(handle => handle.cancel()); this._motions.clear(); }
    shell(content) {
      const focus = this.shadowRoot.activeElement?.dataset.focus;
      this.cancelMotion();
      this.shadowRoot.innerHTML = `<style>${css}</style><div class="frame" part="body">${content}</div>`;
      if (focus) [...this.shadowRoot.querySelectorAll('[data-focus]')].find(el => el.dataset.focus === focus)?.focus();
    }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })); }
    /** Motion targets are public CSS part names. Returns { finished: Promise<boolean>, cancel }. */
    play(name, { part = 'body', index = 0, ...options } = {}) {
      if (!/^[a-z-]+$/.test(part)) throw new TypeError('Invalid part name.');
      if (!globalThis.GamePartsMotion) throw new Error('Load motions.js before using play().');
      const element = this.shadowRoot.querySelectorAll(`[part~="${part}"]`)[index];
      if (!element) throw new RangeError('No matching part: ' + part);
      const handle = GamePartsMotion.play(element, name, { ...options, reducedMotion: this.hasAttribute('reduced-motion') || options.reducedMotion });
      this._motions.add(handle); handle.finished.finally(() => this._motions.delete(handle)); return handle;
    }
    bind(selector, fn) { this.shadowRoot.querySelectorAll(selector).forEach(el => el.addEventListener('click', () => fn(el))); }
  }
  class Meter extends GamePart {
    normalize(data) { const max = Math.max(1, number(data.max, 100)); return { ...data, max, value: clamp(number(data.value), 0, max) }; }
    render() {
      const d = this.normalize(this._data);
      this.shell(`<div class="meter-head"><span class="meter-name">${escape(d.label || 'HP')}</span><span class="meter-numbers"><b part="value">${d.value}</b><small>/ ${d.max}</small></span></div><div class="track" part="track" role="progressbar" aria-label="${escape(d.label || 'HP')}" aria-valuemin="0" aria-valuemax="${d.max}" aria-valuenow="${d.value}"><div class="bar" part="bar" style="width:${d.value / d.max * 100}%"></div></div>`);
    }
  }
  class Hand extends GamePart {
    normalize(data) { return { ...data, cards: items(data.cards) }; }
    render() {
      const d = this.normalize(this._data);
      this.shell(d.cards.length ? `<div class="hand" role="group" aria-label="${escape(d.label || '手札')}">${d.cards.map((c, i) => `<button class="card" part="item card" data-index="${i}" data-focus="card:${escape(c.id)}" aria-pressed="${d.selectedId === c.id}" ${c.disabled ? 'disabled' : ''}><b>${escape(c.value)}</b><strong>${escape(c.label)}</strong>${c.detail ? `<small>${escape(c.detail)}</small>` : ''}</button>`).join('')}</div>` : '<p class="empty">手札なし</p>');
      this.bind('[data-index]', el => { const index = Number(el.dataset.index), card = d.cards[index]; if (!card.disabled) this.emit('gp-select', { id: card.id, index }); });
      this.shadowRoot.querySelectorAll('.card').forEach(el => el.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const enabled = [...this.shadowRoot.querySelectorAll('.card:not(:disabled)')], i = enabled.indexOf(el);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? enabled.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
        enabled[next]?.focus();
      }));
    }
  }
  class Turns extends GamePart {
    normalize(data) { return { ...data, players: items(data.players) }; }
    render() {
      const d = this.normalize(this._data);
      this.shell(`<div class="turns" role="group" aria-label="手番">${d.players.map((p, i) => `<button class="turn" part="item${p.id === d.activeId ? ' active' : ''}" data-index="${i}" data-focus="turn:${escape(p.id)}" aria-current="${p.id === d.activeId}" ${p.disabled ? 'disabled' : ''}><strong>${escape(p.label)}</strong>${p.subtext ? `<small>${escape(p.subtext)}</small>` : ''}</button>`).join('')}</div>`);
      this.bind('[data-index]', el => { const index = Number(el.dataset.index); if (!d.players[index].disabled) this.emit('gp-turn', { id: d.players[index].id, index }); });
    }
  }
  class Slots extends GamePart {
    normalize(data) {
      const value = items(data.items), capacity = clamp(Math.trunc(number(data.capacity, 5)), 1, 20);
      if (value.length > capacity) throw new RangeError('items exceed capacity.');
      return { ...data, items: value, capacity };
    }
    render() {
      const d = this.normalize(this._data); let dragging = null;
      this.shell(`<div class="slots" role="group" aria-label="${escape(d.label || '配置順')}">${d.items.map((item, i) => `<div class="slot ${item.id === d.selectedId ? 'selected' : ''}" part="item" data-slot="${i}" draggable="${!item.disabled}"><button class="slot-main" data-select="${i}" data-focus="slot:${escape(item.id)}" ${item.disabled ? 'disabled' : ''}><b>${escape(item.value ?? String(i + 1).padStart(2, '0'))}</b><strong>${escape(item.label)}</strong></button><div class="slot-controls"><button data-move="${i},-1" data-focus="left:${escape(item.id)}" aria-label="${escape(item.label)}を左へ" ${i === 0 || item.disabled || d.items[i - 1]?.disabled ? 'disabled' : ''}>←</button><button data-move="${i},1" data-focus="right:${escape(item.id)}" aria-label="${escape(item.label)}を右へ" ${i === d.items.length - 1 || item.disabled || d.items[i + 1]?.disabled ? 'disabled' : ''}>→</button></div></div>`).join('')}${Array.from({ length: d.capacity - d.items.length }, (_, i) => `<span class="vacant" aria-label="空き ${d.items.length + i + 1}">${String(d.items.length + i + 1).padStart(2, '0')}</span>`).join('')}</div>`);
      const request = (from, to) => {
        if (from === to || from < 0 || to < 0 || from >= d.items.length || to >= d.items.length || d.items.slice(Math.min(from, to), Math.max(from, to) + 1).some(item => item.disabled)) return;
        const order = d.items.map(item => item.id); order.splice(to, 0, order.splice(from, 1)[0]);
        this.emit('gp-reorder', { id: d.items[from].id, from, to, order });
      };
      this.bind('[data-select]', el => { const index = Number(el.dataset.select); if (!d.items[index].disabled) this.emit('gp-select', { id: d.items[index].id, index }); });
      this.bind('[data-move]', el => { const [i, step] = el.dataset.move.split(',').map(Number); request(i, i + step); });
      this.shadowRoot.querySelectorAll('[data-slot]').forEach(el => {
        el.addEventListener('dragstart', e => { const i = Number(el.dataset.slot); if (d.items[i].disabled) { e.preventDefault(); return; } dragging = i; e.dataTransfer?.setData('text/plain', d.items[i].id); el.classList.add('dragging'); });
        el.addEventListener('dragover', e => { if (dragging !== null) e.preventDefault(); });
        el.addEventListener('drop', e => { e.preventDefault(); if (dragging !== null) request(dragging, Number(el.dataset.slot)); dragging = null; });
        el.addEventListener('dragend', () => { dragging = null; el.classList.remove('dragging'); });
      });
    }
  }
  class Commands extends GamePart {
    normalize(data) { return { ...data, commands: items(data.commands).map(c => ({ ...c, remaining: Math.max(0, number(c.remaining)), total: Math.max(1, number(c.total, 1)) })) }; }
    render() {
      const d = this.normalize(this._data);
      this.shell(`<div class="commands" role="group" aria-label="コマンド">${d.commands.map((c, i) => `<button class="command ${c.remaining > 0 ? 'cooling' : ''}" part="item" data-command="${i}" data-focus="command:${escape(c.id)}" aria-label="${escape(c.label)}${c.remaining > 0 ? ' 再使用まで' + Math.ceil(c.remaining) + '秒' : ''}" aria-pressed="${d.selectedId === c.id}" ${c.disabled || c.remaining > 0 ? 'disabled' : ''}>${c.key ? `<kbd>${escape(c.key)}</kbd>` : ''}<span class="command-name">${escape(c.label)}</span>${c.remaining > 0 ? `<small>${Math.ceil(c.remaining)}</small><i class="cooldown" part="cooldown" style="width:${clamp(1 - c.remaining / c.total, 0, 1) * 100}%"></i>` : ''}</button>`).join('')}</div>`);
      const request = index => { const c = d.commands[index]; if (c && !c.disabled && c.remaining === 0) this.emit('gp-command', { id: c.id, index }); };
      this.bind('[data-command]', el => request(Number(el.dataset.command)));
      this.shadowRoot.querySelector('.commands').addEventListener('keydown', e => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
        const index = d.commands.findIndex(c => c.key && c.key.toLowerCase() === e.key.toLowerCase());
        if (index !== -1) { e.preventDefault(); request(index); }
      });
    }
  }
  for (const [tag, Component] of [['pf-meter', Meter], ['pf-hand', Hand], ['pf-turns', Turns], ['pf-slots', Slots], ['pf-command', Commands]]) {
    if (!customElements.get(tag)) customElements.define(tag, Component);
  }
  globalThis.GameParts = Object.freeze({ version: '1.1.0', themes, Component: GamePart });
})();
