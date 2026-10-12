(function (root) {
  'use strict';
  const W = 2400, H = 1800, CELL = 40;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const wall = (x, y, w, h, type = 'wall') => ({ x, y, w, h, type });
  function makeMap() {
    return {
      obstacles: [
        wall(370, 280, 340, 40), wall(370, 280, 40, 300), wall(370, 580, 125, 40), wall(595, 580, 115, 40), wall(670, 280, 40, 180),
        wall(1050, 300, 40, 420), wall(1050, 300, 370, 40), wall(1380, 300, 40, 140), wall(1380, 560, 40, 160), wall(1180, 680, 240, 40),
        wall(1770, 330, 300, 45), wall(2025, 330, 45, 310), wall(1770, 595, 150, 45),
        wall(490, 1080, 40, 320), wall(490, 1080, 310, 40), wall(490, 1360, 180, 40), wall(760, 1220, 40, 180),
        wall(1080, 1030, 320, 45), wall(1080, 1030, 40, 300), wall(1230, 1285, 170, 45), wall(1355, 1150, 45, 180),
        wall(1790, 1080, 330, 40), wall(2080, 1080, 40, 340), wall(1790, 1380, 170, 40),
        wall(850, 790, 160, 65, 'crate'), wall(1510, 860, 75, 160, 'crate'), wall(260, 860, 120, 70, 'crate'), wall(1630, 1450, 90, 75, 'crate'),
        wall(820, 390, 60, 100, 'crate'), wall(1850, 750, 110, 65, 'crate')
      ],
      gens: [{ x: 550, y: 425 }, { x: 1225, y: 475 }, { x: 1880, y: 475 }, { x: 630, y: 1240 }, { x: 1920, y: 1240 }].map((p, i) => ({ ...p, id: i, progress: 0, done: false, damaged: false })),
      gates: [{ x: 75, y: 700 }, { x: 2325, y: 900 }].map(p => ({ ...p, progress: 0, open: false })),
      cages: [{ x: 260, y: 380 }, { x: 1600, y: 300 }, { x: 900, y: 1480 }, { x: 2200, y: 1470 }],
      pallets: [{ x: 548, y: 600, w: 100, h: 24 }, { x: 1400, y: 500, w: 24, h: 110 }, { x: 725, y: 1380, w: 105, h: 24 }, { x: 2015, y: 1400, w: 110, h: 24 }, { x: 1570, y: 1100, w: 100, h: 24 }].map(p => ({ ...p, down: false, broken: false }))
    };
  }
  class Game {
    constructor(role = 'survivor', seed = Date.now()) {
      this.role = role; this.rng = random(seed); this.map = makeMap(); this.time = 0; this.limit = 420; this.events = []; this.ended = false; this.result = null;
      this.noises = []; this.trails = []; this.smokes = []; this.reveal = 0; this.skill = null; this.skillWait = 4;
      this.stats = { repairs: 0, rescues: 0, hits: 0, captures: 0 }; this.action = null;
      this.survivors = [{ x: 450, y: 730 }, { x: 1700, y: 650 }, { x: 550, y: 1490 }, { x: 2020, y: 1540 }].map((p, i) => ({ ...p, id: i, name: ['YOU', 'REN', 'MIO', 'KAI'][i], hp: 2, state: 'active', radius: 13, angle: 0, stamina: 100, cooldown: 0, invuln: 0, captures: 0, cageTime: 0, rescue: 0, heal: 0, path: [], pathTime: 0, running: false, crouch: false, trailTime: 0 }));
      if (role === 'hunter') this.survivors[0].name = 'AOI';
      this.hunter = { x: 1230, y: 920, radius: 18, angle: -Math.PI / 2, cooldown: 0, attackCD: 0, stun: 0, path: [], pathTime: 0, target: null, memory: 0, patrol: 0, swing: 0 };
      this.player = role === 'hunter' ? this.hunter : this.survivors[0];
      this.grid = this.buildGrid(); this.emit(role === 'survivor' ? '熱源装置を3台修理し、出口を開けて脱出しよう' : '足音を探せ。4人の生存者が氷獄に潜んでいる', 'intro');
    }
    emit(text, type = 'info', pos) { this.events.push({ text, type, pos }); }
    get repaired() { return this.map.gens.filter(g => g.done).length; }
    solids() { return this.map.obstacles.concat(this.map.pallets.filter(p => p.down && !p.broken).map(p => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }))); }
    blocked(x, y, r = 14) { return x < 45 + r || y < 45 + r || x > W - 45 - r || y > H - 45 - r || this.solids().some(o => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h); }
    line(a, b, r = 0) { const d = dist(a, b), n = Math.max(1, Math.ceil(d / 14)); for (let i = 1; i <= n; i++) if (this.blocked(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, r)) return false; return true; }
    buildGrid() { const g = []; for (let y = 0; y < H / CELL; y++) for (let x = 0; x < W / CELL; x++) g[y * 60 + x] = !this.blocked(x * CELL + 20, y * CELL + 20, 19); return g; }
    route(a, b) {
      const index = p => clamp(Math.floor(p.y / CELL), 0, 44) * 60 + clamp(Math.floor(p.x / CELL), 0, 59);
      let start = index(a), end = index(b);
      if (!this.grid[end]) { let best = Infinity; for (let i = 0; i < this.grid.length; i++) if (this.grid[i]) { const d = Math.hypot(i % 60 * CELL + 20 - b.x, Math.floor(i / 60) * CELL + 20 - b.y); if (d < best) { best = d; end = i; } } }
      const queue = [start], came = new Int32Array(2700).fill(-1); came[start] = start;
      for (let j = 0; j < queue.length; j++) { const at = queue[j]; if (at === end) break; for (const next of [at - 60, at + 60, ...(at % 60 ? [at - 1] : []), ...(at % 60 < 59 ? [at + 1] : [])]) if (next >= 0 && next < 2700 && this.grid[next] && came[next] === -1) { came[next] = at; queue.push(next); } }
      if (came[end] === -1) return [];
      const path = []; for (let n = end; n !== start; n = came[n]) path.push({ x: n % 60 * CELL + 20, y: Math.floor(n / 60) * CELL + 20 }); return path.reverse();
    }
    move(a, dx, dy, speed, dt) {
      const length = Math.hypot(dx, dy); if (length < .01) return;
      a.angle = Math.atan2(dy, dx); const steps = Math.max(1, Math.ceil(speed * dt / 8));
      for (let i = 0; i < steps; i++) { const x = dx / length * speed * dt / steps, y = dy / length * speed * dt / steps; if (!this.blocked(a.x + x, a.y, a.radius)) a.x += x; if (!this.blocked(a.x, a.y + y, a.radius)) a.y += y; }
    }
    go(a, target, speed, dt) {
      if (dist(a, target) < 8) return;
      if (this.line(a, target, a.radius + 2)) { this.move(a, target.x - a.x, target.y - a.y, speed, dt); return; }
      a.pathTime -= dt;
      if (a.pathTime <= 0 || !a.path.length) { a.path = this.route(a, target); a.pathTime = .75 + this.rng() * .3; }
      while (a.path.length && dist(a, a.path[0]) < 10) a.path.shift();
      const node = a.path[0]; if (node) this.move(a, node.x - a.x, node.y - a.y, speed, dt);
    }
    noise(p, strength = 1) { this.noises.push({ x: p.x, y: p.y, life: 5, strength }); }
    visible(s) { return s.state === 'active' && !this.smokes.some(p => dist(p, s) < 120) && dist(s, this.hunter) < (s.crouch ? 150 : 390) && this.line(this.hunter, s); }
    capture(s) {
      s.captures++; this.stats.captures++; s.hp = 0;
      if (s.captures >= 3) { s.state = 'dead'; this.emit(`${s.name} は霧に消えた`, 'capture'); return; }
      const cages = this.map.cages.filter(c => !this.survivors.some(t => t.state === 'caged' && dist(t, c) < 30));
      const cage = cages.sort((a, b) => dist(a, s) - dist(b, s))[0];
      s.x = cage.x; s.y = cage.y; s.state = 'caged'; s.cageTime = 55; s.rescue = 0; s.path = [];
      this.emit(`${s.name} が捕まった！ 檻から救助できる`, 'capture', s);
    }
    attack(aimAngle, aimPitch) {
      const h = this.hunter; if (h.attackCD > 0 || h.stun > 0) return;
      h.attackCD = 1.35; h.swing = .32;
      const inArc = s => (!Number.isFinite(aimAngle) || Math.cos(Math.atan2(s.y - h.y, s.x - h.x) - aimAngle) >= Math.cos(Math.PI * .29)) && (!Number.isFinite(aimPitch) || Math.abs(aimPitch - Math.atan2(-.62, Math.max(.8, dist(h, s) * .03))) < .75);
      const s = this.survivors.filter(s => s.state === 'active' && s.invuln <= 0 && dist(h, s) < 83 && inArc(s) && this.line(h, s)).sort((a, b) => dist(h, a) - dist(h, b))[0];
      if (!s) { this.emit('', 'swing'); return; }
      h.angle = Math.atan2(s.y - h.y, s.x - h.x); s.hp--; s.invuln = 2.8; this.stats.hits++; this.noise(s);
      this.emit(`${s.name} が攻撃を受けた`, 'hit', s);
      if (s.hp <= 0) this.capture(s);
    }
    ability() {
      const p = this.player; if (p.cooldown > 0 || (this.role === 'survivor' && p.state !== 'active')) return;
      if (this.role === 'hunter') { p.cooldown = 24; this.reveal = 5; this.emit('凍てつく反響 — 生存者の気配を感知', 'ability'); }
      else { p.cooldown = 28; this.smokes.push({ x: p.x, y: p.y, life: 6 }); this.emit('氷霧 — 視線を切って逃げよう', 'ability'); }
    }
    dropPallet(a) {
      const p = this.map.pallets.find(p => !p.down && !p.broken && dist(a, p) < 90); if (!p) return false;
      // Drop from the side; never trap an actor inside the new collider.
      if (Math.abs(a.x - p.x) < p.w / 2 + a.radius && Math.abs(a.y - p.y) < p.h / 2 + a.radius) {
        if (p.w > p.h) a.y = p.y + (a.y < p.y ? -1 : 1) * (p.h / 2 + a.radius + 3);
        else a.x = p.x + (a.x < p.x ? -1 : 1) * (p.w / 2 + a.radius + 3);
      }
      p.down = true; this.grid = this.buildGrid(); this.noise(p); this.emit('板を倒した', 'pallet');
      if (dist(this.hunter, p) < 110) { this.hunter.stun = 3; const h = this.hunter; if (this.blocked(h.x, h.y, h.radius)) { if (p.w > p.h) h.y = p.y + (h.y < p.y ? -1 : 1) * (p.h / 2 + h.radius + 3); else h.x = p.x + (h.x < p.x ? -1 : 1) * (p.w / 2 + h.radius + 3); } this.emit('番人をスタンさせた！', 'stun'); }
      return true;
    }
    interaction(a, hunter = false) {
      if (hunter) {
        const pallet = this.map.pallets.find(p => p.down && !p.broken && dist(a, p) < 100); if (pallet) return { type: 'break', target: pallet, label: 'E 長押し / 板を破壊', progress: pallet.breakProgress || 0 };
        const gen = this.map.gens.find(g => !g.done && g.progress > 0 && !g.damaged && dist(a, g) < 85); if (gen) return { type: 'damage', target: gen, label: 'E 長押し / 熱源装置を破壊', progress: gen.damageProgress || 0 };
        return null;
      }
      const caged = this.survivors.find(s => s.state === 'caged' && dist(a, s) < 75); if (caged) return { type: 'rescue', target: caged, label: 'E 長押し / 仲間を救助', progress: caged.rescue };
      const gate = this.map.gates.find(g => dist(a, g) < 95); if (gate && this.repaired >= 3 && !gate.open) return { type: 'gate', target: gate, label: 'E 長押し / 出口を開放', progress: gate.progress };
      const gen = this.map.gens.find(g => !g.done && dist(a, g) < 82); if (gen) return { type: 'repair', target: gen, label: 'E 長押し / 熱源装置を修理', progress: gen.progress };
      const hurt = this.survivors.find(s => s !== a && s.state === 'active' && s.hp === 1 && dist(a, s) < 65); if (hurt) return { type: 'heal', target: hurt, label: 'E 長押し / 仲間を治療', progress: hurt.heal };
      return null;
    }
    work(a, action, dt, human = false) {
      const t = action.target;
      if (action.type === 'repair') {
        t.damaged = false; t.progress = Math.min(1, t.progress + dt / 32);
        if (human) { this.skillWait -= dt; if (this.skillWait <= 0 && !this.skill) { this.skill = { value: 0, target: t }; this.skillWait = 5 + this.rng() * 5; this.emit('タイミングを合わせて SPACE', 'skill'); } }
        if (t.progress >= 1 && !t.done) { t.done = true; this.stats.repairs++; this.noise(t); this.emit(`熱源装置が復旧した (${this.repaired}/3)`, 'complete'); if (this.repaired === 3) this.emit('熱源復旧！ マップ両端の出口へ向かえ', 'power'); }
      } else if (action.type === 'rescue') {
        t.rescue += dt / 3;
        if (t.rescue >= 1) { t.state = 'active'; t.hp = 1; t.invuln = 7; t.rescue = 0; t.pathTime = 0; this.stats.rescues++; this.emit(`${t.name} が救助された`, 'rescue'); }
      } else if (action.type === 'gate') {
        t.progress = Math.min(1, t.progress + dt / 7); if (t.progress >= 1 && !t.open) { t.open = true; this.emit('出口が開いた！ ゲートに近づいて脱出', 'power'); }
      } else if (action.type === 'heal') {
        t.heal += dt / 7; if (t.heal >= 1) { t.hp = 2; t.heal = 0; this.emit(`${t.name} の治療が完了`, 'rescue'); }
      } else if (action.type === 'damage') {
        t.damageProgress = (t.damageProgress || 0) + dt / 1.8; if (t.damageProgress >= 1) { t.progress = Math.max(0, t.progress - .14); t.damaged = true; t.damageProgress = 0; this.emit('熱源装置を破壊した — 修理進捗が後退', 'pallet'); }
      } else if (action.type === 'break') {
        t.breakProgress = (t.breakProgress || 0) + dt / 2; if (t.breakProgress >= 1) { t.broken = true; this.grid = this.buildGrid(); this.emit('板を破壊した', 'pallet'); }
      }
    }
    skillCheck() {
      if (!this.skill) return;
      const { value, target } = this.skill;
      if (value >= .62 && value <= .82) { target.progress = Math.min(.999, target.progress + .045); this.emit('判定成功 / 修理ボーナス', 'success'); }
      else { target.progress = Math.max(0, target.progress - .08); this.noise(this.player, 2); this.emit('修理失敗！ 番人に音が届いた', 'fail'); }
      this.skill = null;
    }
    survivorAI(s, dt) {
      const h = this.hunter, danger = dist(s, h) < 285 && this.line(s, h) && h.stun <= 0 && !this.smokes.some(p => dist(p, s) < 100);
      s.running = false; s.crouch = false;
      if (danger) {
        s.running = s.stamina > 4;
        if (dist(s, h) < 145) this.dropPallet(s);
        if (!s.flee || dist(s, s.flee) < 65 || (s.fleeUntil || 0) < this.time) {
          const spots = [{ x: 240, y: 700 }, { x: 820, y: 610 }, { x: 1580, y: 650 }, { x: 2210, y: 870 }, { x: 900, y: 1510 }, { x: 1550, y: 1450 }, { x: 280, y: 1450 }, { x: 1660, y: 200 }];
          s.flee = spots.sort((a, b) => (dist(b, h) - dist(b, s) * .65) - (dist(a, h) - dist(a, s) * .65))[0]; s.fleeUntil = this.time + 2.5;
        }
        this.go(s, s.flee, s.running ? 194 : 126, dt); return;
      }
      const prisoner = this.survivors.filter(t => t.state === 'caged' && dist(t, h) > 190).sort((a, b) => dist(s, a) - dist(s, b))[0];
      // Only the closest available AI leaves its objective to rescue.
      const rescuers = prisoner ? this.survivors.filter(t => t.state === 'active' && (this.role === 'hunter' || t.id !== 0)).sort((a, b) => dist(a, prisoner) - dist(b, prisoner)) : [];
      let target, type;
      if (prisoner && rescuers[0] === s) { target = prisoner; type = 'rescue'; }
      else if (this.repaired >= 3) { target = [...this.map.gates].sort((a, b) => dist(s, a) - dist(s, b))[0]; type = 'gate'; }
      else { target = this.map.gens.filter(g => !g.done).sort((a, b) => (dist(s, a) + (dist(h, a) < 230 ? 650 : 0)) - (dist(s, b) + (dist(h, b) < 230 ? 650 : 0)))[0]; type = 'repair'; }
      if (!target) return;
      if (dist(s, target) < (type === 'gate' ? 62 : 64)) { if (!target.open) this.work(s, { type, target }, dt); }
      else this.go(s, target, 126, dt);
    }
    hunterAI(dt) {
      const h = this.hunter; if (h.stun > 0) return;
      const seen = this.survivors.filter(s => this.visible(s) && s.invuln < 4).sort((a, b) => dist(h, a) - dist(h, b));
      if (seen.length) { h.target = { x: seen[0].x, y: seen[0].y }; h.memory = 4; if (dist(h, seen[0]) < 76) this.attack(); }
      else if (h.memory > 0) h.memory -= dt;
      else {
        const noise = this.noises.filter(n => n.life > 2 && dist(n, h) < 1000).sort((a, b) => b.strength - a.strength)[0];
        if (noise) h.target = noise;
        else { const points = this.repaired >= 3 ? this.map.gates : this.map.gens.filter(g => !g.done); if (points.length) { if (!h.target || dist(h, h.target) < 75 || this.time > (h.patrolUntil || 0)) { h.patrol = (h.patrol + 1) % points.length; h.target = points[h.patrol]; h.patrolUntil = this.time + 12; } } }
      }
      const pallet = this.map.pallets.find(p => p.down && !p.broken && dist(h, p) < 95);
      if (pallet && h.target && !this.line(h, h.target, 19)) this.work(h, { type: 'break', target: pallet }, dt);
      else if (h.target) this.go(h, h.target, h.attackCD > .8 ? 88 : 153, dt);
    }
    step(dt, input = {}) {
      if (this.ended) return; dt = clamp(dt, 0, .05); this.time += dt; this.reveal = Math.max(0, this.reveal - dt); this.action = null;
      this.noises = this.noises.filter(n => (n.life -= dt) > 0); this.trails = this.trails.filter(n => (n.life -= dt) > 0); this.smokes = this.smokes.filter(n => (n.life -= dt) > 0);
      const h = this.hunter; h.cooldown = Math.max(0, h.cooldown - dt); h.attackCD = Math.max(0, h.attackCD - dt); h.stun = Math.max(0, h.stun - dt); h.swing = Math.max(0, h.swing - dt);
      for (const s of this.survivors) {
        s.cooldown = Math.max(0, s.cooldown - dt); s.invuln = Math.max(0, s.invuln - dt);
        if (s.state === 'caged') { s.cageTime -= dt; if (s.cageTime <= 0) { s.state = 'dead'; this.emit(`${s.name} は霧に消えた`, 'capture'); } continue; }
        if (s.state !== 'active') continue;
        if (this.role === 'survivor' && s.id === 0) {
          const moving = !!(input.x || input.y); s.crouch = !!input.crouch; s.running = !!input.sprint && !s.crouch && moving && s.stamina > 1;
          if (moving) this.move(s, input.x || 0, input.y || 0, s.crouch ? 72 : s.running ? 194 : s.invuln > 1.6 ? 208 : 126, dt);
          this.action = this.interaction(s);
          if (input.interact && this.action && !moving) this.work(s, this.action, dt, true);
          else if (this.skill) this.skill = null;
          if (input.space) { if (this.skill) this.skillCheck(); else this.dropPallet(s); }
        } else this.survivorAI(s, dt);
        s.stamina = clamp(s.stamina + (s.running ? -22 : 15) * dt, 0, 100);
        if (s.running) { s.trailTime -= dt; if (s.trailTime <= 0) { this.trails.push({ x: s.x, y: s.y, life: 4, angle: s.angle }); s.trailTime = .17; } if (dist(s, h) < 310 && h.memory <= 0) { h.target = { x: s.x, y: s.y }; h.memory = 1; } }
        for (const g of this.map.gates) if (g.open && dist(s, g) < 68) { s.state = 'escaped'; this.emit(`${s.name} が脱出した`, 'escape'); break; }
      }
      if (this.role === 'hunter') {
        if (h.stun <= 0) { const moving = !!(input.x || input.y); if (moving) this.move(h, input.x || 0, input.y || 0, h.attackCD > .8 ? 92 : 163, dt); if (Number.isFinite(input.aimAngle)) h.angle = input.aimAngle; this.action = this.interaction(h, true); if (input.interact && this.action && !moving) this.work(h, this.action, dt, true); if (input.space || input.attack) this.attack(input.aimAngle, input.aimPitch); }
      } else this.hunterAI(dt);
      if (input.ability) this.ability();
      if (this.skill) { this.skill.value += dt / 1.55; if (this.skill.value >= 1) this.skillCheck(); }
      for (const g of this.map.gens) if (g.damaged && !g.done) g.progress = Math.max(0, g.progress - dt / 220);
      this.checkEnd();
    }
    checkEnd() {
      if (this.ended) return;
      const escaped = this.survivors.filter(s => s.state === 'escaped').length, dead = this.survivors.filter(s => s.state === 'dead').length;
      if (this.role === 'survivor' && this.player.state === 'escaped') this.finish('win', '霧の向こうへ。', 'あなたは収容所から脱出した。遠くで、氷の溶ける音が聞こえる。');
      else if (this.role === 'survivor' && this.player.state === 'dead') this.finish('lose', '夜は、明けなかった。', 'あなたの足音は、氷原の静けさに消えた。次は仲間の近くで行動しよう。');
      else if (this.time >= this.limit || escaped + dead === 4) {
        if (this.role === 'hunter') { const count = 4 - escaped; this.finish(count >= 3 ? 'win' : count === 2 ? 'draw' : 'lose', count >= 3 ? '氷獄に静寂が戻った。' : count === 2 ? 'ふたつの足跡。' : '夜明けを許した。', `脱出 ${escaped} 人 / 収容 ${count} 人。${this.time >= this.limit ? '夜が終わり、残された生存者は収容された。' : 'この夜の記録は、霧に刻まれる。'}`); }
        else this.finish('lose', '時間切れ。', '極寒がすべてを覆った。熱源装置を仲間と分担し、早めに出口を目指そう。');
      }
    }
    finish(outcome, title, copy) { this.ended = true; this.result = { outcome, title, copy }; }
  }
  const api = { Game, makeMap, random, dist, clamp, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Villanis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
