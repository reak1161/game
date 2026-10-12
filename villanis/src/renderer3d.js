import * as THREE from 'three';

// A real perspective 3D scene. The simulation's x/y plane maps to world x/z.
const S = .03;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mat = (color, roughness = .8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(parent, x, y, z, w, h, d, material, shadow = true) {
  const m = new THREE.Mesh(boxGeo, material); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function cylinder(parent, top, bottom, height, material, x = 0, y = 0, z = 0, segments = 10) {
  return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, segments), material, x, y, z);
}
function frostTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const ctx = c.getContext('2d'); const rng = window.Villanis.random(47);
  ctx.fillStyle = '#94aeba'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 25000; i++) { const l = 130 + rng() * 90; ctx.fillStyle = `rgba(${l},${l + 8},${l + 15},.2)`; ctx.fillRect(rng() * 512, rng() * 512, rng() * 3 + 1, 1); }
  for (let i = 0; i < 25; i++) { const x = rng() * 512, y = rng() * 512; ctx.strokeStyle = '#dcecf226'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng() * 50, y + 25); ctx.lineTo(x + 60, y + rng() * 70); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(20, 16); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function label(parent, title, subtitle, x, y, z, scale = 2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#06131ed9'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#9acede'; g.fillRect(0, 0, 4, 128);
  g.fillStyle = '#daedf1'; g.font = 'bold 34px sans-serif'; g.fillText(title, 25, 53); g.fillStyle = '#8bb5c5'; g.font = '18px monospace'; g.fillText(subtitle, 25, 93);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, fog: true })); sprite.position.set(x, y, z); sprite.scale.set(scale, scale / 4, 1); parent.add(sprite); return sprite;
}

function humanoid(hunter = false, color = '#71858e') {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const coat = mat(hunter ? '#152d42' : color), dark = mat('#17212d'), skin = mat('#c2b8ae'), trim = mat(hunter ? '#80d8ec' : '#c5bc9c', .35), leather = mat('#46535c');
  const torso = mesh(body, new THREE.CylinderGeometry(hunter ? .42 : .29, hunter ? .32 : .24, .65, 8), coat, 0, 1.14, 0); torso.scale.z = .7;
  const hips = box(body, 0, .77, 0, .44, .25, .27, dark);
  const head = mesh(body, new THREE.SphereGeometry(.17, 12, 10), skin, 0, 1.68, 0); head.scale.z = .85;
  const hood = mesh(body, new THREE.SphereGeometry(.205, 12, 8), coat, 0, 1.71, .045); hood.scale.set(1.06, 1.05, .95);
  box(body, 0, 1.67, -.147, .24, .19, .075, hunter ? dark : skin);
  cylinder(body, .195, .23, .14, hunter ? trim : mat('#b1a177'), 0, 1.47, 0);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * (hunter ? .46 : .34), 1.4, 0); body.add(arm);
    const sleeve = mesh(arm, new THREE.CapsuleGeometry(.105, .27, 3, 6), coat, 0, -.21, 0);
    box(arm, 0, -.51, -.015, .15, .2, .17, dark); arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .14, .78, 0); body.add(leg);
    mesh(leg, new THREE.CapsuleGeometry(.105, .39, 3, 6), dark, 0, -.29, 0);
    box(leg, 0, -.67, -.07, .21, .19, .35, leather); legs.push(leg);
  }
  if (hunter) {
    const cloak = mesh(body, new THREE.CylinderGeometry(.31, .61, 1.2, 7, 1, true), coat, 0, .78, .08); cloak.material = coat.clone(); cloak.material.side = THREE.DoubleSide;
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const spike = mesh(body, new THREE.ConeGeometry(.065, .38 + (i % 3) * .09, 4), trim, Math.cos(a) * .19, 1.98, Math.sin(a) * .19); spike.rotation.z = -Math.cos(a) * .22; }
    const eyes = mat('#dcfcff', .2, { emissive: '#8feaff', emissiveIntensity: 3 }); box(body, -.065, 1.72, -.198, .065, .028, .025, eyes); box(body, .065, 1.72, -.198, .065, .028, .025, eyes);
    const blade = createBlade(); blade.position.set(0, -.44, -.1); blade.rotation.x = -.25; arms[1].add(blade);
    root.scale.setScalar(1.22);
  } else {
    box(body, 0, 1.15, .235, .42, .48, .2, leather); box(body, 0, 1.13, .35, .24, .25, .04, coat);
    for (const side of [-1, 1]) box(body, side * .18, 1.24, -.16, .045, .5, .025, trim);
    const lamp = mat('#c6f0f7', .3, { emissive: '#7dc8da', emissiveIntensity: 2 }); box(body, -.18, 1.37, -.195, .08, .07, .06, lamp);
  }
  root.userData = { body, arms, legs, torso, hips, prev: V(), gait: 0, moving: 0, hunter }; return root;
}
function createBlade() {
  const g = new THREE.Group(), grip = mat('#1f3447', .65), ice = mat('#9bdded', .17, { metalness: .35, emissive: '#245f78', emissiveIntensity: .4 });
  cylinder(g, .042, .042, .37, grip, 0, 0, 0, 8);
  box(g, 0, .2, 0, .3, .065, .09, ice);
  const blade = mesh(g, new THREE.ConeGeometry(.14, .86, 3), ice, 0, .64, 0); blade.scale.z = .4;
  return g;
}

class Villanis3D {
  constructor(canvas) {
    this.canvas = canvas; this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6)); this.renderer.setSize(innerWidth, innerHeight); this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.25;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#152638'); this.scene.fog = new THREE.FogExp2('#253e51', .026);
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .075, 260); this.ray = new THREE.Raycaster(); this.cameraWalls = [];
    this.yaw = -Math.PI / 2; this.pitch = -.13; this.mode = 'tps'; this.shoulder = 1; this.bob = 0; this.game = null;
    this.static = new THREE.Group(); this.scene.add(this.static);
    this.scene.add(new THREE.HemisphereLight('#bedaff', '#243344', 1.25));
    this.moon = new THREE.DirectionalLight('#b9dcff', 2.5); this.moon.position.set(15, 36, 0); this.moon.castShadow = true; this.moon.shadow.mapSize.set(2048, 2048); this.moon.shadow.camera.left = -22; this.moon.shadow.camera.right = 22; this.moon.shadow.camera.top = 22; this.moon.shadow.camera.bottom = -22; this.moon.shadow.camera.near = 1; this.moon.shadow.camera.far = 100; this.moon.shadow.bias = -.0004; this.moon.shadow.normalBias = .025; this.scene.add(this.moon, this.moon.target);
    this.fill = new THREE.SpotLight('#dbf1ff', 22, 24, .58, .6, 1.6); this.scene.add(this.fill, this.fill.target);
    this.buildWorld(window.Villanis.makeMap());
    this.actors = [...Array.from({ length: 4 }, (_, i) => humanoid(false, ['#837665', '#5f7b91', '#967982', '#858777'][i])), humanoid(true)]; this.scene.add(...this.actors);
    this.auras = this.actors.slice(0, 4).map(() => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(.38, 1.2, 4, 8), new THREE.MeshBasicMaterial({ color: '#e599cd', transparent: true, opacity: .55, depthTest: false, depthWrite: false, wireframe: true })); m.visible = false; m.renderOrder = 20; this.scene.add(m); return m; });
    this.weaponScene = new THREE.Scene(); this.weaponScene.add(new THREE.HemisphereLight('#d3f2ff', '#294253', 3));
    this.weaponCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .02, 10); this.hand = new THREE.Group(); this.hand.add(createBlade());
    const glove = mat('#28415a', .5); box(this.hand, 0, -.17, .04, .16, .24, .19, glove); cylinder(this.hand, .075, .105, .45, glove, 0, -.5, .05);
    this.hand.scale.setScalar(.66); this.hand.position.set(.49, -.35, -.9); this.hand.rotation.set(-.15, -.25, -.3); this.weaponScene.add(this.hand);
    this.fpsLantern = new THREE.Group(); box(this.fpsLantern, 0, 0, 0, .17, .25, .15, mat('#41556a')); box(this.fpsLantern, 0, .025, -.08, .12, .13, .01, mat('#dcf5ff', .2, { emissive: '#a3daee', emissiveIntensity: 2 })); this.fpsLantern.position.set(-.4, -.38, -.7); this.weaponScene.add(this.fpsLantern);
    this.scene.updateMatrixWorld(true); this.resize();
  }
  buildWorld(map) {
    const floorMaterial = mat('#a7c1d0', .63, { map: frostTexture(), metalness: .1 }); const floor = mesh(this.static, new THREE.PlaneGeometry(160, 140), floorMaterial, 36, -.02, 27); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    const concrete = mat('#466272', .9), snow = mat('#c9dce3', .85), metal = mat('#253c4a', .48, { metalness: .6 }), edge = mat('#7e9baa', .55), ice = mat('#79b6cf', .26, { metalness: .25 });
    for (const o of map.obstacles) {
      const x = (o.x + o.w / 2) * S, z = (o.y + o.h / 2) * S, w = o.w * S, d = o.h * S, h = o.type === 'crate' ? 1.65 : 3.45;
      const wall = box(this.static, x, h / 2, z, w, h, d, o.type === 'crate' ? metal : concrete); this.cameraWalls.push(wall);
      box(this.static, x, h + .055, z, w + .08, .11, d + .09, snow, false);
      if (o.type === 'crate') {
        for (let j = -1; j <= 1; j++) box(this.static, x + j * w * .31, h / 2, z, .055, h + .04, d + .06, edge, false);
      } else {
        box(this.static, x, .22, z, w + .03, .35, d + .04, metal, false);
        const alongX = w > d, n = Math.floor(Math.max(w, d) / 1.5);
        for (let i = 1; i <= n; i++) { const f = i / (n + 1) - .5; box(this.static, x + (alongX ? w * f : 0), h / 2, z + (alongX ? 0 : d * f), alongX ? .09 : w + .03, h, alongX ? d + .03 : .09, edge, false); }
        // Broken blue ice descending from the top of the bunker walls.
        for (let j = 0; j < 3; j++) { const f = (j - 1) * .28; const shard = mesh(this.static, new THREE.ConeGeometry(.09, .45 + j * .12, 5), ice, x + (alongX ? w * f : w / 2 + .03), h - .1, z + (alongX ? d / 2 + .03 : d * f)); shard.rotation.z = Math.PI; shard.castShadow = false; }
      }
    }
    // Chain-link perimeter with an opening at each gate.
    const fence = mat('#526e7c', .55, { metalness: .5 });
    for (let x = 1.35; x <= 70.65; x += 2.3) for (const z of [1.35, 52.65]) box(this.static, x, 1.55, z, .075, 3.1, .075, fence, false);
    for (let z = 1.35; z <= 52.65; z += 2.3) for (const x of [1.35, 70.65]) { if (Math.abs(z - (x < 10 ? 21 : 27)) < 2) continue; box(this.static, x, 1.55, z, .075, 3.1, .075, fence, false); }
    for (const y of [.5, 1.5, 2.6]) { for (const z of [1.35, 52.65]) box(this.static, 36, y, z, 69.3, .025, .025, fence, false); for (const [x, gateZ] of [[1.35, 21], [70.65, 27]]) for (const [a, b] of [[1.35, gateZ - 1.8], [gateZ + 1.8, 52.65]]) box(this.static, x, y, (a + b) / 2, .025, .025, b - a, fence, false); }
    const r = window.Villanis.random(652);
    // Instanced trees and distant ice cliffs keep the full forest inexpensive.
    const treePositions = [];
    for (let i = 0; i < 190; i++) { const x = r() * 125 - 25, z = r() * 110 - 25; if (x > 1 && x < 71 && z > 1 && z < 53) continue; treePositions.push({ x, z, scale: .8 + r() * 1.7 }); }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .2, 2.3, 5), metal, treePositions.length);
    const needles = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 3.2, 7), mat('#254455'), treePositions.length * 3);
    const caps = new THREE.InstancedMesh(new THREE.ConeGeometry(1.12, 2.2, 7), mat('#839da9'), treePositions.length * 3); const dummy = new THREE.Object3D();
    treePositions.forEach((p, i) => { dummy.position.set(p.x, 1.2 * p.scale, p.z); dummy.scale.setScalar(p.scale); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix); for (let j = 0; j < 3; j++) { dummy.position.set(p.x, (2.2 + j * .9) * p.scale, p.z); dummy.scale.setScalar(p.scale * (1 - j * .2)); dummy.updateMatrix(); needles.setMatrixAt(i * 3 + j, dummy.matrix); dummy.position.y += .55 * p.scale; dummy.updateMatrix(); caps.setMatrixAt(i * 3 + j, dummy.matrix); } });
    trunk.castShadow = needles.castShadow = true; this.static.add(trunk, needles, caps);
    for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; const peak = mesh(this.static, new THREE.ConeGeometry(12 + r() * 10, 17 + r() * 20, 5), mat(i % 2 ? '#3d6178' : '#344f66'), 36 + Math.cos(a) * 100, 7, 27 + Math.sin(a) * 95); peak.rotation.y = r() * 5; peak.castShadow = false; }
    const crystalGeo = new THREE.ConeGeometry(.4, 2.7, 5); const crystals = new THREE.InstancedMesh(crystalGeo, ice, 65);
    for (let i = 0; i < 65; i++) { const a = i / 65 * Math.PI * 2; dummy.position.set(36 + Math.cos(a) * (40 + r() * 6), .8, 27 + Math.sin(a) * (30 + r() * 5)); dummy.rotation.set((r() - .5) * .5, r() * 6, (r() - .5) * .6); dummy.scale.setScalar(.5 + r() * 2); dummy.updateMatrix(); crystals.setMatrixAt(i, dummy.matrix); } crystals.castShadow = true; this.static.add(crystals);
    const moon = mesh(this.scene, new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: '#d8ecff', fog: false }), -55, 73, -110); moon.castShadow = false;
    const stars = new Float32Array(600); for (let i = 0; i < 200; i++) { stars[i * 3] = (r() - .5) * 350; stars[i * 3 + 1] = 55 + r() * 110; stars[i * 3 + 2] = (r() - .5) * 350; } const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3)); this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#c5e5ff', size: .18, fog: false })));
    this.gens = map.gens.map(g => {
      const group = new THREE.Group(); group.position.set(g.x * S, 0, g.y * S); this.static.add(group);
      box(group, 0, .15, 0, 1.4, .3, 1.05, metal); box(group, 0, .78, 0, 1.12, 1.04, .72, concrete); box(group, 0, 1.32, 0, 1.22, .08, .82, snow);
      const coreMat = mat('#acdfff', .25, { emissive: '#509fc6', emissiveIntensity: 1.8 }); const core = cylinder(group, .22, .22, .6, coreMat, 0, .83, -.43, 12); core.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) { cylinder(group, .085, .085, 1.7, metal, side * .51, 1.25, .2); cylinder(group, .15, .15, .17, edge, side * .51, 2.08, .2); }
      for (let j = 0; j < 4; j++) box(group, -.3 + j * .2, .37, -.385, .06, .13, .04, edge);
      const light = new THREE.PointLight('#81d4ff', 5, 6, 2); light.position.set(0, 1.4, -.65); group.add(light);
      label(group, `HEAT / 0${g.id + 1}`, 'E  |  RESTORE THERMAL CORE', 0, 2.75, 0, 2.3);
      return { group, coreMat, light };
    });
    this.gates = map.gates.map((g, i) => {
      const group = new THREE.Group(); group.position.set(g.x * S, 0, g.y * S); group.rotation.y = Math.PI / 2; this.static.add(group);
      for (const x of [-1.6, 1.6]) box(group, x, 1.9, 0, .45, 3.8, .6, metal); box(group, 0, 3.65, 0, 3.65, .4, .65, metal);
      const door = box(group, 0, 1.65, 0, 2.75, 3.3, .2, ice); const light = new THREE.PointLight('#82c8f7', 7, 8, 2); light.position.set(0, 3.3, 0); group.add(light);
      label(group, `EXIT / ${i ? 'EAST' : 'WEST'}`, 'RESTORE THREE THERMAL CORES', 0, 4.3, 0, 3.4); return { group, door, light };
    });
    this.cages = map.cages.map(g => { const group = new THREE.Group(); group.position.set(g.x * S, 0, g.y * S); this.static.add(group); cylinder(group, .95, .95, .16, metal, 0, .08, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; cylinder(group, .04, .08, 2.3, ice, Math.cos(a) * .72, 1.15, Math.sin(a) * .72); } const ring = mesh(group, new THREE.TorusGeometry(.72, .055, 6, 16), ice, 0, 2.3, 0); ring.rotation.x = Math.PI / 2; label(group, 'CRYO CELL', 'E  |  RESCUE', 0, 2.9, 0, 1.8); return group; });
    this.pallets = map.pallets.map(p => {
      const group = new THREE.Group(), panel = new THREE.Group(); group.position.set(p.x * S, 0, p.y * S); if (p.w < p.h) group.rotation.y = Math.PI / 2; group.add(panel); this.static.add(group);
      for (let i = 0; i < 6; i++) box(panel, -.125 * 10 + i * .5, 0, 0, .42, .85, .15, i % 2 ? concrete : edge); for (const y of [-.26, .26]) box(panel, 0, y, -.09, 2.9, .065, .06, metal);
      return { group, panel };
    });
    // One draw call for animated snow, driven by GPU time rather than CPU copies.
    const positions = new Float32Array(1800 * 3); for (let i = 0; i < positions.length; i += 3) { positions[i] = r() * 60 - 30; positions[i + 1] = r() * 22; positions[i + 2] = r() * 60 - 30; }
    const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.snowMaterial = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: 'uniform float time; varying float fade; void main(){vec3 p=position;p.y=mod(p.y-time*1.2,22.0);p.x+=sin(time*.4+p.z)*1.1;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(25.0/-mv.z,1.0,3.0);fade=clamp(1.0+mv.z/38.0,0.0,.65);}', fragmentShader: 'varying float fade; void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;gl_FragColor=vec4(.8,.93,1.,fade*(1.-d));}', transparent: true, depthWrite: false });
    this.snow = new THREE.Points(snowGeo, this.snowMaterial); this.snow.frustumCulled = false; this.scene.add(this.snow);
    this.trails = new THREE.InstancedMesh(new THREE.PlaneGeometry(.09, .25), new THREE.MeshBasicMaterial({ color: '#92bed4', transparent: true, opacity: .55, depthWrite: false }), 160); this.trails.count = 0; this.scene.add(this.trails);
    const mistCanvas = document.createElement('canvas'); mistCanvas.width = mistCanvas.height = 128; const mistContext = mistCanvas.getContext('2d');
    const mistGradient = mistContext.createRadialGradient(64, 64, 0, 64, 64, 64); mistGradient.addColorStop(0, '#d6f0ffdd'); mistGradient.addColorStop(.45, '#c6e7f9aa'); mistGradient.addColorStop(1, '#b5d9ed00'); mistContext.fillStyle = mistGradient; mistContext.fillRect(0, 0, 128, 128);
    this.smokeMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mistCanvas), color: '#c1e4f7', transparent: true, opacity: .65, depthWrite: false, fog: true }); this.smokes = Array.from({ length: 24 }, () => { const m = new THREE.Sprite(this.smokeMaterial); m.visible = false; this.scene.add(m); return m; });
  }
  start(game) { this.game = game; this.mode = game.role === 'hunter' ? 'fps' : 'tps'; this.yaw = game.role === 'hunter' ? -.6 : Math.atan2(-130, 100); game.player.angle = this.yaw; this.pitch = -.07; this.cameraDistance = 3.7; for (const a of this.actors) { a.userData.prev.set(0, 0, 0); a.userData.gait = 0; } }
  look(dx, dy, sensitivity = 1) { this.yaw += dx * .0022 * sensitivity; this.pitch = clamp(this.pitch - dy * .002 * sensitivity, this.mode === 'fps' ? -1.1 : -.65, this.mode === 'fps' ? 1.1 : .55); }
  toggleView() { this.mode = this.mode === 'tps' ? 'fps' : 'tps'; this.pitch = clamp(this.pitch, -.65, .55); return this.mode; }
  resize() { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.weaponCamera.aspect = this.camera.aspect; this.weaponCamera.updateProjectionMatrix(); }
  animateActor(model, actor, time, dt) {
    const d = model.userData, pos = V(actor.x * S, 0, actor.y * S); const distance = d.prev.distanceTo(pos); const moving = distance > .0002 && distance < 1;
    d.moving = moving ? 1 : Math.max(0, d.moving - dt * 8); d.gait += distance < 1 ? distance * (actor.running ? 2.8 : 3.5) : 0; d.prev.copy(pos); model.position.copy(pos); model.rotation.y = -actor.angle - Math.PI / 2;
    const crouch = actor.crouch ? .24 : 0; const bob = Math.sin(d.gait * 2) * .025 * d.moving;
    d.body.position.y = bob - crouch; d.body.rotation.x = actor.crouch ? .22 : actor.hp === 1 ? .13 : 0;
    for (let i = 0; i < 2; i++) { const swing = Math.sin(d.gait + i * Math.PI) * (actor.running ? .9 : .5) * d.moving; d.legs[i].rotation.x = swing; d.arms[i].rotation.x = -swing * .65; }
    if (actor.swing > 0) d.arms[1].rotation.x = -Math.sin(actor.swing / .32 * Math.PI) * 2;
    if (actor.state === 'caged') { d.body.position.y = -.35; d.body.rotation.x = .23; d.arms.forEach(a => a.rotation.x = -1.3); }
    model.visible = actor.state !== 'dead' && actor.state !== 'escaped';
  }
  positionCamera(game, dt, moving) {
    const p = game.player, fps = this.mode === 'fps'; const eye = game.role === 'hunter' ? 1.97 : p.crouch ? 1.19 : 1.62;
    this.bob += dt * (p.running ? 13 : 8) * (moving ? 1 : 0);
    const direction = V(Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.sin(this.yaw) * Math.cos(this.pitch));
    const pivot = V(p.x * S, fps ? eye : 1.5 - (p.crouch ? .25 : 0), p.y * S);
    if (fps) { this.camera.position.copy(pivot); this.camera.position.y += moving ? Math.sin(this.bob) * .026 : 0; this.camera.lookAt(this.camera.position.clone().add(direction)); }
    else {
      const shoulder = V(-Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(.56 * this.shoulder);
      const offset = direction.clone().multiplyScalar(-3.65).add(shoulder); offset.y += .33;
      const length = offset.length(), normalized = offset.clone().normalize(); let safe = length;
      // Three swept rays protect the camera's near plane at corners, not only its center.
      for (const side of [-.17, 0, .17]) { const origin = pivot.clone().add(V(-Math.sin(this.yaw) * side, .03, Math.cos(this.yaw) * side)); this.ray.set(origin, normalized); this.ray.far = length + .2; const hits = this.ray.intersectObjects(this.cameraWalls, false); if (hits.length) safe = Math.min(safe, Math.max(.18, hits[0].distance - .25)); }
      this.cameraDistance = safe < this.cameraDistance ? safe : THREE.MathUtils.lerp(this.cameraDistance, safe, 1 - Math.exp(-dt * 9));
      this.camera.position.copy(pivot).addScaledVector(normalized, this.cameraDistance); this.camera.position.y = Math.max(.22, this.camera.position.y);
      this.camera.lookAt(pivot.clone().addScaledVector(direction, 12).add(shoulder));
    }
    const playerModel = this.actors[game.role === 'hunter' ? 4 : 0]; playerModel.visible = !fps && this.camera.position.distanceTo(pivot) > .6 && !['dead','escaped'].includes(p.state);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, p.running ? 79 : fps ? 76 : 70, 1 - Math.exp(-dt * 6)); this.camera.updateProjectionMatrix();
    this.fill.position.copy(pivot); this.fill.target.position.copy(pivot).addScaledVector(direction, 10); this.fill.intensity = game.role === 'hunter' ? 9 : 18;
    this.moon.position.set(p.x * S - 15, 30, p.y * S - 13); this.moon.target.position.set(p.x * S, 0, p.y * S);
    this.hand.visible = fps && game.role === 'hunter'; this.fpsLantern.visible = fps && game.role === 'survivor';
    const swing = Math.sin((game.hunter.swing / .32) * Math.PI);
    this.hand.position.set(.49 - swing * .55, -.35 + swing * .2 + (moving ? Math.sin(this.bob) * .018 : 0), -.9 - swing * .15); this.hand.rotation.set(-.15 - swing * .75, -.25 - swing * .6, -.3 + swing * 1.1);
    this.fpsLantern.position.y = -.38 + (moving ? Math.sin(this.bob) * .02 : 0);
  }
  render(game, time, dt = .016, moving = false) {
    if (!game) {
      this.game = null; this.camera.position.set(18 + Math.sin(time * .07) * .4, 2.1, 23.5); this.camera.lookAt(14, 1.55, 16.5); this.camera.fov = 58; this.camera.updateProjectionMatrix();
      this.actors.forEach((a, i) => a.visible = i === 4); this.actors[4].position.set(15.3, 0, 18); this.actors[4].rotation.y = -2.69; this.actors[4].userData.body.position.y = Math.sin(time * .8) * .015;
      this.fill.position.set(18, 2, 23); this.fill.target.position.set(15, 1.5, 18); this.fill.intensity = 25; this.moon.position.set(0, 30, 3); this.moon.target.position.set(16, 0, 17);
      this.snow.position.set(16, 0, 17); this.hand.visible = this.fpsLantern.visible = false; this.auras.forEach(a => a.visible = false); this.smokes.forEach(a => a.visible = false); this.trails.count = 0;
    } else {
      this.game = game; const actors = [...game.survivors, game.hunter]; actors.forEach((a, i) => this.animateActor(this.actors[i], a, time, dt));
      for (let i = 0; i < 4; i++) { const a = this.auras[i], s = game.survivors[i]; a.position.set(s.x * S, 1, s.y * S); a.visible = game.role === 'hunter' && game.reveal > 0 && s.state === 'active'; }
      game.map.gens.forEach((g, i) => { const model = this.gens[i]; model.coreMat.emissive.set(g.done ? '#ff9c4a' : '#509fc6'); model.coreMat.color.set(g.done ? '#ffe1a9' : '#acdfff'); model.light.color.set(g.done ? '#ffb66c' : '#81d4ff'); model.light.intensity = g.done ? 12 : 4 + Math.sin(time * 2 + i) * .5; });
      game.map.gates.forEach((g, i) => { this.gates[i].door.position.y = THREE.MathUtils.lerp(this.gates[i].door.position.y, g.open ? 5 : 1.65, 1 - Math.exp(-dt * 2)); this.gates[i].light.color.set(game.repaired >= 3 ? '#ffc685' : '#82c8f7'); });
      game.map.pallets.forEach((p, i) => { const panel = this.pallets[i].panel; panel.visible = !p.broken; panel.rotation.z = p.down ? 0 : Math.PI / 2 - .13; panel.position.set(p.down ? 0 : -1.45, p.down ? .6 : 1.5, 0); });
      const matrix = new THREE.Object3D(); this.trails.count = Math.min(160, game.trails.length); this.trails.material.color.set(game.role === 'hunter' ? '#dd84ac' : '#46667c');
      for (let i = 0; i < this.trails.count; i++) { const tr = game.trails[game.trails.length - 1 - i]; matrix.position.set(tr.x * S, .008, tr.y * S); matrix.rotation.set(-Math.PI / 2, 0, -tr.angle + Math.PI / 2); matrix.updateMatrix(); this.trails.setMatrixAt(i, matrix.matrix); } this.trails.instanceMatrix.needsUpdate = true;
      this.smokes.forEach((m, i) => { const s = game.smokes[Math.floor(i / 6)]; m.visible = !!s; if (s) { m.position.set(s.x * S + Math.sin(time + i * 2) * 1.2, 1.1 + Math.sin(i) * .4, s.y * S + Math.cos(time * .5 + i * 2) * 1.2); const fade = Math.min(1, s.life); m.scale.set(5 * fade, 3.5 * fade, 1); } });
      this.positionCamera(game, dt, moving); this.snow.position.set(game.player.x * S, 0, game.player.y * S);
    }
    this.snowMaterial.uniforms.time.value = time;
    this.renderer.render(this.scene, this.camera);
    if (game && this.mode === 'fps') { this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.weaponScene, this.weaponCamera); this.renderer.autoClear = true; }
  }
  project(point) { const p = V(point.x * S, 2.7, point.y * S); p.project(this.camera); return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < .9 && Math.abs(p.y) < .8 }; }
}
window.Villanis3D = Villanis3D;
