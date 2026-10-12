import { ABILITIES, ATTACK_GROWTH_REFERENCE, availableAdditionalSkills, BASIC_ATTACKS, CHARACTERS, CharacterDefinition, CharacterId, CRITICAL_CONFIG, DASH_CONFIG, E_SKILLS, HP_GROWTH_CONFIG, ITEMS, ItemId, MOB_DEFINITIONS, PROJECTILE_DEFAULTS, WORLD_UNIT_PX, XP_GROWTH_CONFIG, XP_REQUIREMENTS } from './config';

type Vec = { x: number; y: number };
type DamagePopup = { value: number; critical: boolean; age: number; horizontalOffset: number; verticalOffset: number };
type MobType = 'melee' | 'ranged' | 'witch';
type MobTier = 'minor' | 'medium' | 'large';
type Target = Vec & {
  radius: number;
  phase: number;
  hitFlash: number;
  lastDamage: number;
  lastHitCritical: boolean;
  damagePopups: DamagePopup[];
  damagePopupSequence: number;
  hp: number;
  maxHp: number;
  type: MobType;
  tier: MobTier;
  hasDetectedPlayer: boolean;
  attackTimer: number;
  chargedStacks: Map<number, number>;
  chargedDamageTimer: number;
  freezeAccumulation: number;
  freezeDecayDelay: number;
  frozenRemaining: number;
  stunRemaining: number;
  weakenedRemaining: number;
  attackedByPlayer: boolean;
  detectionOverrideRemaining: number;
  timeSlowRemaining: number;
  relaySlowRemaining: number;
  kind: 'monster' | 'boss' | 'decoy';
  windup?: { remaining: number; duration: number; angle: number; attack: 'melee' | 'boss-normal' | 'hell-slash' };
  bossNormalAttacks: number;
  bossAbilityChance: number;
  outOfRangeSeconds: number;
  weakness?: string;
  resistance?: string;
};
type Arc = Vec & { age: number; angle: number; range: number; direction: number };
type Impact = Vec & { age: number; angle: number; critical: boolean; color: string };
type DefeatEffect = Vec & { age: number; radius: number; damage: number; xp: number; coins: number };
type ChargedArea = Vec & { id: number; remaining: number };
type SparkParticle = Vec & { remaining: number; hitTimes: Map<Target, number> };
type NoteProjectile = Vec & { angle: number; travelled: number; startDistance: number; note: number };
type BasicProjectile = Vec & { angle: number; travelled: number; damage: number; maxDistance?: number; attribute?: string };
type ColdArea = Vec & { remaining: number; hitTimes: Map<Target, number> };
type AbilityProjectile = Vec & {
  kind: 'ice-pick' | 'e-icicle' | 'bubble' | 'icicle-arrow' | 'diamond-dust'; angle: number; speed: number; travelled: number; maxDistance: number;
  radius: number; damage: number; stoppedRemaining: number; hitTimes: Map<Target, number>;
};
type MonsterProjectile = Vec & { angle: number; speed: number; travelled: number; maxDistance: number; damage: number };
type WitchAttack = Vec & { remaining: number; damage: number; source: Target };
type TimeBomb = Vec & { remaining: number };
type Afterimage = Vec & { remaining: number; angle: number };
type FrostRunner = Vec & { phase: 'outbound' | 'dwell' | 'return'; direction: Vec; travelled: number; remaining: number; hitTimes: Map<Target, number> };
type ElectRoadSegment = { start: Vec; end: Vec; length: number };
type ElectRoad = { age: number; segments: ElectRoadSegment[]; hitTimes: Map<Target, number> };
type TidalWave = { phase: 'pull' | 'wave'; age: number; hitTargets: Set<Target> };
type RelayDevice = Vec & { id: number; remaining: number };
type RelayLink = { first: RelayDevice; second: RelayDevice; age: number; hitTimes: Map<Target, number> };
type WanderingWisp = Vec & { phase: 'idle' | 'attack' | 'return'; target?: Target; cooldown: number };
type PendingChoice =
  | { kind: 'ability'; level: number; initial: boolean }
  | { kind: 'e-skill'; level: number; slot: 'E' | 'C' }
  | { kind: 'skill-upgrade'; level: number };

const BOLT_SHOCK = {
  areaCount: 3,
  areaRadius: 0.5,
  firstNearEdgeOffsetFromPlayerFront: 0.5,
  lastFarEdgeOffsetFromPlayerFront: 3.2,
  intervalSeconds: 0.15,
  chargedAreaDurationSeconds: 6,
} as const;
const PLAYER_RADIUS = 0.5 * WORLD_UNIT_PX;
const MELEE_EFFECT_SECONDS = 0.34;
const CHARACTER_COLORS: Record<CharacterId, string> = { zeus: '#8ff4ff', skater: '#bce5ff', prowler: '#ffbd87', melodia: '#f0a9e8', future: '#c5adff', poseidon: '#7cdbff' };
const WORLD_SIZE_UNITS = 100;
const WORLD_SIZE_PX = WORLD_SIZE_UNITS * WORLD_UNIT_PX;
const ELEMENTS = ['雷', '氷', '炎', '水', '音楽', '獣', '時空'] as const;
const MONSTER_ACTIVE_RANGE = 40 * WORLD_UNIT_PX;
const MONSTER_LIMIT = 100;
const SHOP_INTERACT_RANGE = 1.6 * WORLD_UNIT_PX;
const SHOP_CLOSE_RANGE = 3 * WORLD_UNIT_PX;
const SHOP_DISCOVERY_RANGE = 8 * WORLD_UNIT_PX;
const CAMERA_FOLLOW = {
  normalSpeed: 10,
  fastNearSpeed: 1.2,
  fastFarSpeed: 4.5,
  fastDeadZone: 0.65 * WORLD_UNIT_PX,
  fastFullFollowDistance: 3 * WORLD_UNIT_PX,
  inertiaSeconds: 0.35,
  maxLag: 4 * WORLD_UNIT_PX,
  maxViewportLagRatio: 0.32,
  megaLateralFollow: 0.35,
} as const;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const distanceToSegment = (point: Vec, start: Vec, end: Vec) => {
  const dx = end.x - start.x, dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: start.x + dx * ratio, y: start.y + dy * ratio });
};
const normalizeNumber = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10;
const countdown = (seconds: number) => (Math.ceil(Math.max(0, seconds) * 10) / 10).toFixed(1);
const formatNumber = (value: number) => {
  const normalized = normalizeNumber(value);
  return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
};
const requiredXpForLevel = (level: number) => {
  if (level >= XP_GROWTH_CONFIG.maxLevel) return undefined;
  return XP_REQUIREMENTS[level] ?? Math.round(XP_GROWTH_CONFIG.quadratic * level ** 2 + XP_GROWTH_CONFIG.linear * level + XP_GROWTH_CONFIG.constant);
};

export class RoomGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly miniCtx: CanvasRenderingContext2D;
  private readonly worldMapCanvas: HTMLCanvasElement;
  private readonly worldMapCtx: CanvasRenderingContext2D;
  private readonly keys = new Set<string>();
  private readonly pointer: Vec = { x: 0, y: 0 };
  private readonly player: Vec = { x: 0, y: 0 };
  private readonly camera: Vec = { x: 0, y: 0 };
  private targets: Target[] = [];
  private arcs: Arc[] = [];
  private impacts: Impact[] = [];
  private defeats: DefeatEffect[] = [];
  private swingSequence = 0;
  private pointerScreen?: Vec;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly hudElements = new Map<string, HTMLElement | null>();
  private announcementTimeout?: number;
  private actionFeedback?: { slot?: string; message: string; remaining: number };
  private defeated = false;
  private defeatTime = 0;
  private kills = 0;
  private muzzleFlash = 0;
  private chargedAreas: ChargedArea[] = [];
  private sparkParticles: SparkParticle[] = [];
  private sparkSpawnTimer = 3 + Math.random() * 2;
  private sparkStacks = 0;
  private sparkBuffRemaining = 0;
  private animationFrame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private level = 1;
  private currentXp = 0;
  private spawnTimer = 7 + Math.random() * 3;
  private playerHp: number;
  private playerMaxHp: number;
  private playerAttackPower: number;
  private playerHitFlash = 0;
  private basicAttackTimer = 0;
  private staticCooldown = 0;
  private marineVeilCooldown = 0;
  private qCooldown = 0;
  private dashCharges = 1;
  private dashCooldown = 0;
  private readonly chargedStacks = new Map<number, number>();
  private nextChargedAreaId = 1;
  private dash?: { direction: Vec; remainingDistance: number; remainingTime: number; hitTargets: Set<Target> };
  private megaDash?: { points: Vec[]; pointIndex: number; speed: number; hitTargets: Set<Target> };
  private dashInvincibleRemaining = 0;
  private strike?: { centers: Vec[]; age: number; pulses: number };
  private blizzardEffect?: Vec & { age: number; angle: number };
  private tuning?: { state: 'aiming' | 'input'; center: Vec; angle: number; notes: number[]; canSelect: boolean };
  private notes: NoteProjectile[] = [];
  private basicProjectiles: BasicProjectile[] = [];
  private abilityProjectiles: AbilityProjectile[] = [];
  private monsterProjectiles: MonsterProjectile[] = [];
  private witchAttacks: WitchAttack[] = [];
  private coldAreas: ColdArea[] = [];
  private lastColdPosition?: Vec;
  private icePickTimer = 0;
  private icePickDiagonal = false;
  private bubbleCycleTimer = 0;
  private bubbleLaunchDelays: number[] = [];
  private readonly flameHitTimes = Array.from({ length: 3 }, () => new Map<Target, number>());
  private eCooldown = 0;
  private selectedESkill?: string;
  private selectedCSkill?: string;
  private cCooldown = 0;
  private awaitingInitialSkill = true;
  private stealthRemaining = 0;
  private relayPreview?: { slot: 'E' | 'C' };
  private relayDevices: RelayDevice[] = [];
  private relayLinks: RelayLink[] = [];
  private nextRelayId = 1;
  private wanderingWisp?: WanderingWisp;
  private iceBreak?: { origin: Vec; angle: number; age: number; hitTargets: Set<Target> };
  private directionalEffect?: { origin: Vec; angle: number; length: number; width: number; age: number; duration: number; color: string };
  private skillMovement?: { direction: Vec; remainingDistance: number; remainingTime: number; hitTargets: Set<Target>; damage?: number };
  private energyChargeRemaining = 0;
  private energyChargeHealAccumulator = 0;
  private forteRemaining = 0;
  private coins = 0;
  private readonly itemSlots: Array<ItemId | undefined> = ['speed-potion-s', 'attack-potion-s', 'healing-potion-s'];
  private speedPotionRemaining = 0;
  private attackPotionRemaining = 0;
  private defensePotionRemaining = 0;
  private healingPotionRemaining = 0;
  private healingPotionAmountRemaining = 0;
  private actualMovementSpeed = 0;
  private readonly pendingChoices: PendingChoice[] = [];
  private choiceOpen = false;
  private beastFormRemaining = 0;
  private highSpeedRemaining = 0;
  private futureBurstShots = 0;
  private positionHistory: Array<Vec & { hp: number; age: number }> = [];
  private rollback?: { points: Vec[]; pointIndex: number; speed: number; targetHp: number; remaining: number };
  private timeBombs: TimeBomb[] = [];
  private timeSlipCharges = 3;
  private timeSlipCooldown = 0;
  private afterimages: Afterimage[] = [];
  private cameraInertiaRemaining = 0;
  private spaceActionCooldown = 0;
  private electRoadPreview?: { angle: number };
  private electRoads: ElectRoad[] = [];
  private frostRunCooldown = 0;
  private frostRunners: FrostRunner[] = [];
  private firePunchCooldown = 0;
  private readonly iceStormHitTimes = Array.from({ length: 30 }, () => new Map<Target, number>());
  private regenerationTimer = 0;
  private freezingWindTimer = 0;
  private readonly soulFlameHitTimes = new Map<Target, number>();
  private risingTideStacks = 0;
  private risingTideTimer = 0;
  private risingTideEnhanced = false;
  private hydroCannon?: { phase: 'charge' | 'fire'; age: number; angle: number; origin: Vec; hitTargets: Set<Target> };
  private jetSurferRemaining = 0;
  private jetLateralVelocity = 0;
  private tidalWave?: TidalWave;
  private readonly bossSpawnPoint: Vec = { x: 8 * WORLD_UNIT_PX + Math.random() * 84 * WORLD_UNIT_PX, y: 8 * WORLD_UNIT_PX + Math.random() * 84 * WORLD_UNIT_PX };
  private bossSpawned = false;
  private bossMapped = false;
  private buildInfoHtml = '';
  private readonly shopPosition: Vec = { x: 12 * WORLD_UNIT_PX + Math.random() * 76 * WORLD_UNIT_PX, y: 12 * WORLD_UNIT_PX + Math.random() * 76 * WORLD_UNIT_PX };
  private shopDiscovered = false;
  private shopProductsMapped = false;
  private shopOpen = false;
  private readonly shopStock: Array<{ itemId: ItemId; quantity: number }> = Array.from({ length: 5 }, () => ({ itemId: ITEMS[Math.floor(Math.random() * ITEMS.length)].id, quantity: Math.random() < 0.1 ? 2 + Math.floor(Math.random() * 2) : 1 }));
  private minimapMode: 'nearby' | 'whole' | 'minimized' = 'nearby';
  private trainingTotalDamage = 0;
  private trainingStartedAt?: number;
  private trainingRecentDamage: Array<{ time: number; damage: number }> = [];
  private predatorTokens: number[] = [];
  private bloodDetectionRemaining = 0;
  private wildScratch?: { age: number; pulses: number };
  private running = false;
  private paused = false;
  private readonly acquiredAbilities = new Set<string>();
  private resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly minimap: HTMLCanvasElement,
    private readonly announcement: HTMLElement,
    characterId: CharacterId,
    private readonly mode: 'combat' | 'training' = 'combat',
  ) {
    this.character = CHARACTERS.find((character) => character.id === characterId)!;
    this.playerHp = this.character.hp;
    this.playerMaxHp = this.character.hp;
    this.playerAttackPower = this.character.attackPower;
    this.ctx = canvas.getContext('2d')!;
    this.miniCtx = minimap.getContext('2d')!;
    this.worldMapCanvas = document.querySelector<HTMLCanvasElement>('#world-map')!;
    this.worldMapCtx = this.worldMapCanvas.getContext('2d')!;
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  private readonly character: CharacterDefinition;

  start() {
    this.running = true;
    this.resizeObserver.observe(this.canvas);
    this.resize();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    document.querySelector('#ability-dialog')?.addEventListener('click', this.onAbilityChoice);
    this.refreshItemSlots();
    const trainingStats = document.querySelector<HTMLElement>('#training-stats');
    if (trainingStats) trainingStats.hidden = this.mode !== 'training';
    this.updateProgressUi();
    this.animationFrame = requestAnimationFrame(this.loop);
    this.enqueueChoice({ kind: 'e-skill', level: 1, slot: 'E' });
    if (this.mode === 'combat') this.enqueueChoice({ kind: 'ability', level: 1, initial: true });
  }

  pause() { this.paused = true; this.clearInput(); }
  resume() { if (this.defeated) return; this.paused = false; this.lastTime = performance.now(); }

  private clearInput = () => {
    this.keys.clear();
    this.tuning = undefined;
    this.electRoadPreview = undefined;
    this.relayPreview = undefined;
  };

  destroy() {
    this.running = false;
    if (this.announcementTimeout !== undefined) window.clearTimeout(this.announcementTimeout);
    this.announcement.classList.remove('show');
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    document.querySelector('#ability-dialog')?.removeEventListener('click', this.onAbilityChoice);
    document.querySelector<HTMLDialogElement>('#ability-dialog')?.close();
    document.querySelector<HTMLDialogElement>('#build-dialog')?.close();
    document.querySelector<HTMLDialogElement>('#result-dialog')?.close();
    document.querySelector<HTMLDialogElement>('#training-dialog')?.close();
    const shop = document.querySelector<HTMLElement>('#shop-panel');
    if (shop) shop.hidden = true;
    const feedback = document.querySelector<HTMLElement>('#action-feedback');
    if (feedback) feedback.hidden = true;
    const trainingStats = document.querySelector<HTMLElement>('#training-stats');
    if (trainingStats) trainingStats.hidden = true;
  }

  resetTrainingMetrics() {
    this.trainingTotalDamage = 0; this.trainingStartedAt = undefined;
    this.trainingRecentDamage = [];
    const decoy = this.targets.find((target) => target.kind === 'decoy');
    if (decoy) decoy.hp = decoy.maxHp;
    this.updateTrainingMetrics();
  }

  positionTrainingDecoy() {
    if (this.mode !== 'training' || this.paused || this.awaitingInitialSkill) return;
    const decoy = this.targets.find((target) => target.kind === 'decoy');
    if (!decoy) return;
    const spacing = (this.character.attackType === '近接' ? 1.5 : 2) * WORLD_UNIT_PX;
    let angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    const x = this.player.x + Math.cos(angle) * spacing, y = this.player.y + Math.sin(angle) * spacing;
    if (x < decoy.radius || y < decoy.radius || x > WORLD_SIZE_PX - decoy.radius || y > WORLD_SIZE_PX - decoy.radius) {
      angle = Math.atan2(WORLD_SIZE_PX / 2 - this.player.y, WORLD_SIZE_PX / 2 - this.player.x);
    }
    decoy.x = this.player.x + Math.cos(angle) * spacing;
    decoy.y = this.player.y + Math.sin(angle) * spacing;
    this.pointer.x = decoy.x; this.pointer.y = decoy.y;
    this.pointerScreen = undefined;
    decoy.hitFlash = 0; decoy.damagePopups = [];
    this.resetTrainingMetrics();
    this.showActionFeedback('デコイを前方に配置・計測をリセット');
  }

  private showActionFeedback(message: string, slot?: string) {
    this.actionFeedback = { message, slot, remaining: 2 };
    const feedback = document.querySelector<HTMLElement>('#action-feedback');
    if (feedback) { feedback.textContent = message; feedback.hidden = false; }
  }

  private canUseAction(slot: 'Q' | 'E' | 'C' | 'SPACE') {
    let cooldown = 0;
    let unavailable = '';
    if (slot === 'Q') cooldown = this.qCooldown;
    else if (slot === 'SPACE') {
      if (this.acquiredAbilities.has('elect-road') || this.acquiredAbilities.has('icicle-arrow')) cooldown = this.spaceActionCooldown;
      else if (!this.hasAbilityOrLineage('dash')) unavailable = 'Spaceアクションはアビリティで取得できます';
      else if (this.dashCharges <= 0) cooldown = this.dashCooldown;
      else if (!['w', 'a', 's', 'd'].some((key) => this.keys.has(key))) unavailable = 'WASDで移動しながらSpaceでダッシュ';
    } else {
      const id = slot === 'E' ? this.selectedESkill : this.selectedCSkill;
      if (!id) unavailable = slot === 'C' ? 'CスキルはLv5以降のスキル選択で取得できます' : '開始時にEスキルを選択してください';
      else cooldown = id === 'time-slip' ? this.timeSlipCharges > 0 ? 0 : this.timeSlipCooldown : slot === 'E' ? this.eCooldown : this.cCooldown;
    }
    if (unavailable || cooldown > 0) {
      this.showActionFeedback(unavailable || `${slot} は回復中・あと ${countdown(cooldown)}秒`, slot.toLowerCase());
      return false;
    }
    return true;
  }

  setTrainingLevel(level: number) {
    if (this.mode !== 'training' || !Number.isFinite(level)) return;
    this.level = clamp(Math.floor(level), 1, 25);
    const offset = this.level - 1;
    this.playerMaxHp = Math.floor(this.character.hp * (1 + HP_GROWTH_CONFIG.linear * offset + HP_GROWTH_CONFIG.quadratic * offset ** 2));
    this.playerAttackPower = Math.floor(this.character.attackPower * ATTACK_GROWTH_REFERENCE[this.level] / ATTACK_GROWTH_REFERENCE[1]);
    this.playerHp = this.playerMaxHp; this.currentXp = 0; this.updateProgressUi();
  }

  setTrainingESkill(skillId: string) {
    this.setTrainingSkill('E', skillId);
  }

  trainingSetup() {
    return { level: this.level, e: this.selectedESkill, c: this.selectedCSkill, abilities: [...this.acquiredAbilities] };
  }

  setTrainingSkill(slot: 'E' | 'C', skillId: string) {
    if (this.mode !== 'training' || !availableAdditionalSkills(this.character.id).some((skill) => skill.id === skillId)) return;
    if ((slot === 'E' ? this.selectedCSkill : this.selectedESkill) === skillId) return;
    this.assignAdditionalSkill(slot, skillId);
  }

  toggleTrainingAbility(abilityId: string) {
    if (this.mode !== 'training' || !ABILITIES.some((ability) => ability.id === abilityId && ability.status === 'playable')) return false;
    if (this.acquiredAbilities.has(abilityId)) {
      this.acquiredAbilities.delete(abilityId);
      if (abilityId === 'double-dash') { this.dashCharges = Math.min(1, this.dashCharges); if (this.dashCharges === 1) this.dashCooldown = 0; }
      return false;
    }
    this.acquiredAbilities.add(abilityId);
    if (abilityId === 'double-dash') this.dashCharges = Math.min(2, this.dashCharges + 1);
    return true;
  }

  resetTrainingState() {
    if (this.mode !== 'training') return;
    this.playerHp = this.playerMaxHp; this.qCooldown = 0; this.eCooldown = 0; this.cCooldown = 0; this.dashCharges = this.acquiredAbilities.has('double-dash') ? 2 : 1; this.dashCooldown = 0; this.timeSlipCharges = 3; this.timeSlipCooldown = 0;
    this.spaceActionCooldown = 0; this.firePunchCooldown = 0; this.frostRunCooldown = 0;
  }

  toggleBuildInfo() {
    const dialog = document.querySelector<HTMLDialogElement>('#build-dialog');
    if (!dialog) return;
    if (dialog.open) dialog.close();
    else {
      this.updateBuildInfo();
      dialog.show();
    }
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.player.x ||= WORLD_SIZE_PX / 2;
    this.player.y ||= WORLD_SIZE_PX / 2;
    if (this.camera.x === 0 && this.camera.y === 0) {
      this.camera.x = clamp(this.player.x - rect.width / 2, 0, Math.max(0, WORLD_SIZE_PX - rect.width));
      this.camera.y = clamp(this.player.y - rect.height / 2, 0, Math.max(0, WORLD_SIZE_PX - rect.height));
    }
    this.pointer.x ||= this.player.x + 200;
    this.pointer.y ||= this.player.y;
    if (this.targets.length === 0) this.mode === 'training' ? this.createDecoy() : this.createTargets();
  }

  private createDecoy() {
    const decoy = this.createMob(this.player.x + 5 * WORLD_UNIT_PX, this.player.y, 0, 'large', 'decoy');
    decoy.hp = 1000000; decoy.maxHp = 1000000; decoy.radius = 32; decoy.hasDetectedPlayer = false;
    this.targets = [decoy];
  }

  private createTargets() {
    const positions = [
      [4, -3], [6, 4], [-5, -4], [-7, 3], [1, -6], [-2, 7],
    ];
    this.targets = positions.map(([x, y], index) => this.createMob(this.player.x + x * WORLD_UNIT_PX, this.player.y + y * WORLD_UNIT_PX, index));
  }

  private createMob(x: number, y: number, phase = Math.random() * 10, tier: MobTier = 'minor', kind: Target['kind'] = 'monster'): Target {
    const type: MobType = tier === 'large'
      ? (['melee', 'ranged', 'witch'] as const)[Math.floor(Math.random() * 3)]
      : Math.random() < 0.5 ? 'melee' : 'ranged';
    const definition = this.mobDefinition(type, tier);
    const weakness = kind === 'monster' && Math.random() < 0.1 ? ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)] : undefined;
    const resistanceOptions = ELEMENTS.filter((element) => element !== weakness);
    const resistance = kind === 'monster' && Math.random() < 0.1 ? resistanceOptions[Math.floor(Math.random() * resistanceOptions.length)] : undefined;
    return {
      x, y,
      radius: (type === 'melee' ? 24 : type === 'ranged' ? 18 : 22) + (tier === 'medium' ? 6 : tier === 'large' ? 12 : 0),
      phase,
      hitFlash: 0,
      lastDamage: 0,
      lastHitCritical: false,
      damagePopups: [],
      damagePopupSequence: 0,
      hp: definition.hp,
      maxHp: definition.hp,
      type,
      tier,
      hasDetectedPlayer: false,
      attackTimer: 0,
      chargedStacks: new Map(),
      chargedDamageTimer: 0,
      freezeAccumulation: 0,
      freezeDecayDelay: 0,
      frozenRemaining: 0,
      stunRemaining: 0,
      weakenedRemaining: 0,
      attackedByPlayer: false,
      detectionOverrideRemaining: 0,
      timeSlowRemaining: 0,
      relaySlowRemaining: 0,
      kind,
      bossNormalAttacks: 0,
      bossAbilityChance: 0.3,
      outOfRangeSeconds: 0,
      weakness, resistance,
    };
  }

  private mobDefinition(type: MobType, tier: MobTier) {
    if (type === 'witch') return MOB_DEFINITIONS.witch;
    if (tier === 'large') return type === 'melee' ? MOB_DEFINITIONS.largeMelee : MOB_DEFINITIONS.largeRanged;
    if (tier === 'medium') return type === 'melee' ? MOB_DEFINITIONS.mediumMelee : MOB_DEFINITIONS.mediumRanged;
    return type === 'melee' ? MOB_DEFINITIONS.melee : MOB_DEFINITIONS.ranged;
  }

  private createHellBlade(): Target {
    const boss = this.createMob(this.bossSpawnPoint.x, this.bossSpawnPoint.y, Math.random() * 10, 'large', 'boss');
    boss.type = 'melee'; boss.radius = 42; boss.hp = 700; boss.maxHp = 700;
    return boss;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.paused || this.defeated || this.awaitingInitialSkill || event.isComposing || (event.target instanceof HTMLElement && event.target.matches('input,select,textarea,[contenteditable="true"]'))) return;
    this.keys.add(event.key.toLowerCase());
    if (event.key.toLowerCase() === 'q' && !event.repeat && this.canUseAction('Q')) {
      if (this.character.id === 'melodia') this.startTuning();
      else if (this.character.id === 'skater') this.castBlizzardLance();
      else if (this.character.id === 'prowler') this.castProwlerQ();
      else if (this.character.id === 'future') this.castFutureQ();
      else if (this.character.id === 'poseidon') this.castHydroCannon();
      else this.castQ();
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      if (!this.canUseAction('SPACE')) return;
      if (this.acquiredAbilities.has('elect-road')) this.startElectRoadPreview();
      else if (this.acquiredAbilities.has('icicle-arrow')) this.castIcicleArrow();
      else this.startDash();
    }
    if (event.key.toLowerCase() === 'e' && !event.repeat && this.canUseAction('E')) this.castAdditionalSkill('E');
    if (event.key.toLowerCase() === 'c' && !event.repeat && this.canUseAction('C')) this.castAdditionalSkill('C');
    if (event.key.toLowerCase() === 'f' && !event.repeat) this.toggleShop();
    if (!event.repeat && ['1', '2', '3'].includes(event.key)) this.useItem(Number(event.key) - 1);
    if (event.key.toLowerCase() === 'm' && !event.repeat) {
      const dialog = document.querySelector<HTMLDialogElement>('#world-map-dialog');
      if (dialog) {
        if (dialog.open) dialog.close();
        else { this.pause(); dialog.showModal(); }
      }
    }
  };

  cycleMinimapMode() {
    this.minimapMode = this.minimapMode === 'nearby' ? 'whole' : this.minimapMode === 'whole' ? 'minimized' : 'nearby';
    const container = document.querySelector<HTMLElement>('.minimap');
    const label = document.querySelector<HTMLElement>('#minimap-mode-label');
    container?.classList.toggle('minimized', this.minimapMode === 'minimized');
    if (label) label.textContent = this.minimapMode === 'nearby' ? '付近表示' : this.minimapMode === 'whole' ? '全体表示' : '最小化';
  }

  private toggleShop() {
    if (distance(this.player, this.shopPosition) > SHOP_INTERACT_RANGE || this.playerHp <= 0) return;
    this.shopOpen = !this.shopOpen;
    if (this.shopOpen) this.shopProductsMapped = true;
    this.refreshShopUi();
  }

  private refreshShopUi() {
    const panel = document.querySelector<HTMLElement>('#shop-panel');
    if (!panel) return;
    panel.hidden = !this.shopOpen;
    const stock = panel.querySelector<HTMLElement>('#shop-stock');
    if (!stock) return;
    stock.innerHTML = this.shopStock.map(({ itemId, quantity }, index) => {
      const item = ITEMS.find((entry) => entry.id === itemId);
      return item && quantity > 0 ? `<button data-shop-slot="${index}"><b>${item.name} ×${quantity}</b><span>${item.description}</span><strong>1個 ${item.price} COIN</strong></button>` : '<button disabled>売り切れ</button>';
    }).join('');
  }

  buyShopItem(slotIndex: number) {
    if (!this.shopOpen || distance(this.player, this.shopPosition) > SHOP_CLOSE_RANGE) return;
    const stock = this.shopStock[slotIndex];
    if (!stock || stock.quantity <= 0 || this.playerHp <= 0) return;
    const itemId = stock.itemId;
    const item = ITEMS.find((entry) => entry.id === itemId);
    const emptySlot = this.itemSlots.findIndex((entry) => entry === undefined);
    if (!item) return;
    if (emptySlot < 0) { this.showAnnouncement('購入できません', 'アイテムスロットが満杯です'); return; }
    if (this.coins < item.price) { this.showAnnouncement('コイン不足', `${item.price}コイン必要です`); return; }
    this.coins -= item.price;
    this.itemSlots[emptySlot] = itemId;
    stock.quantity -= 1;
    this.refreshItemSlots(); this.refreshShopUi();
    this.showAnnouncement('購入完了', item.name);
  }
  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
    if (this.paused || this.awaitingInitialSkill) return;
    if (event.key.toLowerCase() === 'q' && this.character.id === 'melodia') this.lockTuning();
    if (event.code === 'Space' && this.electRoadPreview) this.castElectRoad();
    if (this.relayPreview && event.key.toUpperCase() === this.relayPreview.slot) this.placeLightningRelay();
  };

  private castIcicleArrow() {
    if (this.paused || this.playerHp <= 0 || this.spaceActionCooldown > 0) return;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    this.abilityProjectiles.push({ x: this.player.x, y: this.player.y, angle, speed: 8, travelled: 0, maxDistance: 8, radius: 0.3, damage: 12, kind: 'icicle-arrow', stoppedRemaining: 0, hitTimes: new Map() });
    this.spaceActionCooldown = 8;
  }

  private startElectRoadPreview() {
    if (this.paused || this.playerHp <= 0 || this.spaceActionCooldown > 0) return;
    this.electRoadPreview = { angle: Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x) };
  }

  private castElectRoad() {
    const preview = this.electRoadPreview;
    this.electRoadPreview = undefined;
    if (!preview || this.spaceActionCooldown > 0) return;
    const start = { ...this.player };
    const direction = { x: Math.cos(preview.angle), y: Math.sin(preview.angle) };
    const maxLength = 20 * WORLD_UNIT_PX;
    const distances = [
      direction.x > 0 ? (WORLD_SIZE_PX - PLAYER_RADIUS - start.x) / direction.x : direction.x < 0 ? (PLAYER_RADIUS - start.x) / direction.x : Infinity,
      direction.y > 0 ? (WORLD_SIZE_PX - PLAYER_RADIUS - start.y) / direction.y : direction.y < 0 ? (PLAYER_RADIUS - start.y) / direction.y : Infinity,
    ];
    const wallDistance = Math.min(...distances.filter((value) => value >= 0));
    const mainLength = Math.min(maxLength, wallDistance);
    const end = { x: start.x + direction.x * mainLength, y: start.y + direction.y * mainLength };
    const segments: ElectRoadSegment[] = [{ start, end, length: mainLength }];
    const remaining = maxLength - mainLength;
    if (remaining > 1) {
      const verticalWall = end.x <= PLAYER_RADIUS + 1 || end.x >= WORLD_SIZE_PX - PLAYER_RADIUS - 1;
      const tangents: Vec[] = verticalWall ? [{ x: 0, y: -1 }, { x: 0, y: 1 }] : [{ x: -1, y: 0 }, { x: 1, y: 0 }];
      for (const tangent of tangents) {
        const branchEnd = { x: clamp(end.x + tangent.x * remaining, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS), y: clamp(end.y + tangent.y * remaining, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS) };
        segments.push({ start: end, end: branchEnd, length: distance(end, branchEnd) });
      }
    }
    this.electRoads.push({ age: 0, segments, hitTimes: new Map() });
    this.spaceActionCooldown = 20;
    this.showAnnouncement('エレクトロード', '電撃の道を展開');
  }
  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.pointer.x = this.pointerScreen.x + this.camera.x;
    this.pointer.y = this.pointerScreen.y + this.camera.y;
    if (this.paused) return;
    if (this.electRoadPreview) this.electRoadPreview.angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    this.updateTuningInput();
  };

  private startTuning() {
    if (this.playerHp <= 0) return;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    this.tuning = { state: 'aiming', center: this.tuningCenter(angle), angle, notes: [], canSelect: false };
  }

  private lockTuning() {
    if (!this.tuning || this.tuning.state !== 'aiming') return;
    this.tuning.state = 'input';
    this.tuning.canSelect = this.tuningRegionAtPointer() === undefined;
  }

  private tuningCenter(angle: number): Vec {
    return { x: this.player.x + Math.cos(angle) * 1.8 * WORLD_UNIT_PX, y: this.player.y + Math.sin(angle) * 1.8 * WORLD_UNIT_PX };
  }

  private tuningRegionAtPointer() {
    if (!this.tuning) return undefined;
    const dx = this.pointer.x - this.tuning.center.x, dy = this.pointer.y - this.tuning.center.y;
    const localX = dx * Math.cos(this.tuning.angle) + dy * Math.sin(this.tuning.angle);
    const localY = -dx * Math.sin(this.tuning.angle) + dy * Math.cos(this.tuning.angle);
    const halfWidth = 0.8 * WORLD_UNIT_PX, halfHeight = 1.25 * WORLD_UNIT_PX;
    if (Math.abs(localX) > halfWidth || Math.abs(localY) > halfHeight) return undefined;
    return Math.min(5, Math.floor((localY + halfHeight) / (halfHeight * 2 / 5)) + 1);
  }

  private updateTuningInput() {
    if (!this.tuning) return;
    if (this.tuning.state === 'aiming') {
      this.tuning.angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
      this.tuning.center = this.tuningCenter(this.tuning.angle);
      return;
    }
    const region = this.tuningRegionAtPointer();
    if (region === undefined) { this.tuning.canSelect = true; return; }
    if (!this.tuning.canSelect) return;
    this.tuning.notes.push(region);
    this.tuning.canSelect = false;
    if (this.tuning.notes.length === 3) this.fireNotes();
  }

  private fireNotes() {
    if (!this.tuning) return;
    const angle = this.tuning.angle;
    this.tuning.notes.forEach((note, index) => {
      const startDistance = 2.6 - index * 0.6;
      const lateral = (note - 3) * 0.5 * WORLD_UNIT_PX;
      this.notes.push({
        x: this.player.x + Math.cos(angle) * startDistance * WORLD_UNIT_PX - Math.sin(angle) * lateral,
        y: this.player.y + Math.sin(angle) * startDistance * WORLD_UNIT_PX + Math.cos(angle) * lateral,
        angle, travelled: startDistance, startDistance, note,
      });
    });
    this.showAnnouncement('五線譜攻撃', '音符1発につき15ダメージ');
    this.tuning = undefined;
  }

  private castQ() {
    if (this.paused || this.playerHp <= 0 || this.qCooldown > 0) return;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    const playerRadius = PLAYER_RADIUS / WORLD_UNIT_PX;
    const firstCenter = playerRadius + BOLT_SHOCK.firstNearEdgeOffsetFromPlayerFront + BOLT_SHOCK.areaRadius;
    const lastCenter = playerRadius + BOLT_SHOCK.lastFarEdgeOffsetFromPlayerFront - BOLT_SHOCK.areaRadius;
    const centerStep = (lastCenter - firstCenter) / (BOLT_SHOCK.areaCount - 1);
    this.strike = {
      centers: Array.from({ length: BOLT_SHOCK.areaCount }, (_, index) => firstCenter + centerStep * index).map((range) => ({
        x: this.player.x + Math.cos(angle) * range * WORLD_UNIT_PX,
        y: this.player.y + Math.sin(angle) * range * WORLD_UNIT_PX,
      })),
      age: 0,
      pulses: 0,
    };
    this.qCooldown = this.character.q.cooldownSeconds!;
  }

  private castBlizzardLance() {
    if (this.paused || this.playerHp <= 0 || this.qCooldown > 0) return;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    for (const target of [...this.targets]) {
      const dx = target.x - this.player.x;
      const dy = target.y - this.player.y;
      const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
      const sideways = -dx * Math.sin(angle) + dy * Math.cos(angle);
      const inLength = forward >= 0 && forward <= 4 * WORLD_UNIT_PX + target.radius;
      const inWidth = Math.abs(sideways) <= 0.5 * WORLD_UNIT_PX + target.radius;
      if (inLength && inWidth) this.damageMob(target, 12, '氷');
    }
    this.blizzardEffect = { ...this.player, angle, age: 0 };
    this.qCooldown = this.character.q.cooldownSeconds!;
    this.showAnnouncement('ブリザードランス', '範囲内へ氷ダメージ12');
  }

  private castProwlerQ() {
    if (this.paused || this.playerHp <= 0 || this.qCooldown > 0) return;
    this.beastFormRemaining = 10;
    this.predatorTokens = [];
    this.qCooldown = this.acquiredAbilities.has('predator-form') ? 25 : 20;
    this.showAnnouncement(this.acquiredAbilities.has('predator-form') ? 'プレデターフォルム' : 'ビーストフォルム', '10秒間、移動速度・ダメージ上昇');
  }

  private castFutureQ() {
    if (this.paused || this.playerHp <= 0 || this.qCooldown > 0) return;
    this.highSpeedRemaining = 8;
    this.qCooldown = 16;
    this.showAnnouncement('ハイスピード', '8秒間、移動速度+20%・攻撃速度+50%');
  }

  private castHydroCannon() {
    if (this.paused || this.playerHp <= 0 || this.qCooldown > 0) return;
    this.hydroCannon = { phase: 'charge', age: 0, angle: Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x), origin: { ...this.player }, hitTargets: new Set() };
    this.qCooldown = 15;
  }

  private castAdditionalSkill(slot: 'E' | 'C') {
    const skillId = slot === 'E' ? this.selectedESkill : this.selectedCSkill;
    if (this.paused || this.awaitingInitialSkill || this.playerHp <= 0 || !skillId) return;
    const skillDefinition = availableAdditionalSkills(this.character.id).find((skill) => skill.id === skillId);
    if (!skillDefinition) return;
    const setCooldown = (seconds: number) => { if (slot === 'E') this.eCooldown = seconds; else this.cCooldown = seconds; };
    if (skillId === 'time-slip') {
      if (this.timeSlipCharges <= 0 || this.skillMovement) return;
      const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
      this.skillMovement = { direction: { x: Math.cos(angle), y: Math.sin(angle) }, remainingDistance: 3 * WORLD_UNIT_PX, remainingTime: 0.1, hitTargets: new Set() };
      this.timeSlipCharges -= 1;
      if (this.timeSlipCooldown <= 0) this.timeSlipCooldown = 4;
      this.showAnnouncement('タイムスリップ', '前方3へ高速移動');
      return;
    }
    if ((slot === 'E' ? this.eCooldown : this.cCooldown) > 0) return;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    if (skillId === 'stealth-mission') {
      this.stealthRemaining = 3; setCooldown(15); return;
    }
    if (skillId === 'diamond-dust') {
      for (let index = 0; index < 30; index += 1) {
        this.abilityProjectiles.push({ ...this.player, kind: 'diamond-dust', angle: angle + (Math.random() - 0.5) * Math.PI / 4, speed: 9, travelled: 0, maxDistance: 6, radius: PROJECTILE_DEFAULTS.size / 2, damage: 6, stoppedRemaining: 0, hitTimes: new Map() });
      }
      setCooldown(15); return;
    }
    if (skillId === 'lightning-relay') {
      this.relayPreview = { slot };
      return;
    }
    if (skillId === 'jet-surfer') {
      this.jetSurferRemaining = 3; this.jetLateralVelocity = 0; setCooldown(7);
      this.showAnnouncement('ジェットサーファー', '3秒間、高速移動'); return;
    }
    if (skillId === 'tidal-wave') {
      this.tidalWave = { phase: 'pull', age: 0, hitTargets: new Set() }; setCooldown(20);
      this.showAnnouncement('タイダルウェーブ', '敵を引き寄せて波を放つ'); return;
    }
    if (skillId === 'bubble-reflect') return;
    if (skillId === 'energy-charge') {
      this.energyChargeRemaining = 10; this.energyChargeHealAccumulator = 0; setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('エネルギーチャージ', '10秒間、移動速度・ダメージ上昇／毎秒最大HP0.6%回復'); return;
    }
    if (skillId === 'purple-flash') {
      this.skillMovement = { direction: { x: Math.cos(angle), y: Math.sin(angle) }, remainingDistance: 5 * WORLD_UNIT_PX, remainingTime: 0.2, hitTargets: new Set(), damage: 35 };
      setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('紫電一閃', 'マウス方向へ高速移動'); return;
    }
    if (skillId === 'super-spark') {
      for (const target of [...this.targets]) {
        const dx = target.x - this.player.x, dy = target.y - this.player.y;
        const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
        const sideways = -dx * Math.sin(angle) + dy * Math.cos(angle);
        if (forward >= 0 && forward <= 4 * WORLD_UNIT_PX + target.radius && Math.abs(sideways) <= 0.5 * WORLD_UNIT_PX + target.radius) {
          this.damageMob(target, 15, '雷'); target.stunRemaining = 2;
        }
      }
      setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('超絶スパーク', '雷ダメージ15／スタン2秒'); return;
    }
    if (skillId === 'piano') {
      for (const target of this.targets) {
        const dx = target.x - this.player.x, dy = target.y - this.player.y;
        const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
        const sideways = -dx * Math.sin(angle) + dy * Math.cos(angle);
        if (forward >= 0 && forward <= 4 * WORLD_UNIT_PX + target.radius && Math.abs(sideways) <= WORLD_UNIT_PX + target.radius) target.weakenedRemaining += 10;
      }
      setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('ピアノ', '10秒間、攻撃力を30%弱体化'); return;
    }
    if (skillId === 'forte') {
      this.forteRemaining = 10; setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('フォルテ', '10秒間、ダメージ+30%'); return;
    }
    if (skillId === 'golden-tone') {
      this.playerHp = normalizeNumber(Math.min(this.playerMaxHp, this.playerHp + 50)); setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('黄金の音色', 'HPを50回復'); return;
    }
    if (skillId === 'blood-detection') {
      this.bloodDetectionRemaining = 10; setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('血液探知', '攻撃済みの敵を10秒間表示'); return;
    }
    if (skillId === 'wild-scratch') {
      this.wildScratch = { age: 0, pulses: 0 }; setCooldown(skillDefinition.cooldownSeconds); return;
    }
    if (skillId === 'pheromone') {
      for (const target of this.targets) if (distance(this.player, target) <= 20 * WORLD_UNIT_PX + target.radius) target.detectionOverrideRemaining = 10;
      setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('フェロモン', '対象の探知範囲を10秒間20へ変更'); return;
    }
    if (skillId === 'rollback') {
      const past = this.positionHistory.find((sample) => sample.age >= 3) ?? this.positionHistory[this.positionHistory.length - 1];
      if (!past) return;
      const points = this.positionHistory.filter((sample) => sample.age <= past.age).map(({ x, y }) => ({ x, y }));
      if (points.length === 0) points.push({ ...this.player });
      const pathLength = points.reduce((total, point, index) => index === 0 ? total + distance(this.player, point) : total + distance(points[index - 1], point), 0);
      this.rollback = { points, pointIndex: 0, speed: pathLength / 0.3, targetHp: Math.min(this.playerMaxHp, past.hp), remaining: 0.3 };
      setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('ロールバック', '3秒前の位置とHPへ復帰'); return;
    }
    if (skillId === 'time-bomb') {
      const dx = this.pointer.x - this.player.x, dy = this.pointer.y - this.player.y;
      const pointerDistance = Math.hypot(dx, dy);
      const ratio = pointerDistance > 5 * WORLD_UNIT_PX ? 5 * WORLD_UNIT_PX / pointerDistance : 1;
      this.timeBombs.push({ x: this.player.x + dx * ratio, y: this.player.y + dy * ratio, remaining: 0.3 });
      setCooldown(skillDefinition.cooldownSeconds); this.showAnnouncement('タイムボム', '0.3秒後に時間減速'); return;
    }
    if (skillId === 'chain-icicles') {
      for (const offset of PROJECTILE_DEFAULTS.threeWayAnglesDegrees) {
        this.abilityProjectiles.push({
          x: this.player.x, y: this.player.y, angle: angle + offset * Math.PI / 180,
          speed: 5, travelled: 0, maxDistance: 5, radius: 0.35, damage: 12,
          kind: 'e-icicle', stoppedRemaining: 0, hitTimes: new Map(),
        });
      }
      setCooldown(skillDefinition.cooldownSeconds);
    } else if (skillId === 'ice-break') {
      this.iceBreak = { origin: { ...this.player }, angle, age: 0, hitTargets: new Set() };
      setCooldown(skillDefinition.cooldownSeconds);
    } else {
      this.directionalEffect = { origin: { ...this.player }, angle, length: 4, width: 1.6, age: 0, duration: 0.55, color: '#b9efff' };
      for (const target of this.targets) {
        const dx = target.x - this.player.x, dy = target.y - this.player.y;
        const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
        const sideways = -dx * Math.sin(angle) + dy * Math.cos(angle);
        if (forward >= 0 && forward <= 4 * WORLD_UNIT_PX + target.radius && Math.abs(sideways) <= 0.8 * WORLD_UNIT_PX + target.radius) this.addFreeze(target, 35);
      }
      setCooldown(skillDefinition.cooldownSeconds);
    }
  }

  private assignAdditionalSkill(slot: 'E' | 'C', skillId: string) {
    const skill = availableAdditionalSkills(this.character.id).find((entry) => entry.id === skillId);
    if (!skill || (slot === 'E' ? this.selectedCSkill : this.selectedESkill) === skillId) return false;
    if (slot === 'E') { this.selectedESkill = skillId; this.eCooldown = 0; }
    else { this.selectedCSkill = skillId; this.cCooldown = 0; }
    return true;
  }

  private relayPlacementPoint(): Vec {
    const length = distance(this.player, this.pointer);
    const ratio = length > 7 * WORLD_UNIT_PX ? 7 * WORLD_UNIT_PX / length : 1;
    return { x: clamp(this.player.x + (this.pointer.x - this.player.x) * ratio, 0, WORLD_SIZE_PX), y: clamp(this.player.y + (this.pointer.y - this.player.y) * ratio, 0, WORLD_SIZE_PX) };
  }

  private placeLightningRelay() {
    const preview = this.relayPreview;
    this.relayPreview = undefined;
    if (!preview || this.paused || this.playerHp <= 0) return;
    const skillId = preview.slot === 'E' ? this.selectedESkill : this.selectedCSkill;
    if (skillId !== 'lightning-relay' || (preview.slot === 'E' ? this.eCooldown : this.cCooldown) > 0) return;
    const device: RelayDevice = { ...this.relayPlacementPoint(), id: this.nextRelayId++, remaining: 30 };
    for (const other of this.relayDevices) this.relayLinks.push({ first: other, second: device, age: 0, hitTimes: new Map() });
    this.relayDevices.push(device);
    if (preview.slot === 'E') this.eCooldown = 10; else this.cCooldown = 10;
  }

  private relaySegments(link: RelayLink): Array<{ start: Vec; end: Vec }> {
    const length = distance(link.first, link.second);
    if (length <= 0) return [];
    const ratio = Math.min(0.5, link.age * 17 * WORLD_UNIT_PX / length);
    return [
      { start: link.first, end: { x: link.first.x + (link.second.x - link.first.x) * ratio, y: link.first.y + (link.second.y - link.first.y) * ratio } },
      { start: link.second, end: { x: link.second.x + (link.first.x - link.second.x) * ratio, y: link.second.y + (link.first.y - link.second.y) * ratio } },
    ];
  }

  private updateLightningRelays(dt: number) {
    this.relayDevices.forEach((device) => { device.remaining -= dt; });
    this.relayDevices = this.relayDevices.filter((device) => device.remaining > 0);
    this.relayLinks = this.relayLinks.filter((link) => this.relayDevices.includes(link.first) && this.relayDevices.includes(link.second));
    for (const link of this.relayLinks) {
      link.age += dt;
      const segments = this.relaySegments(link);
      for (const target of [...this.targets]) {
        if (!segments.some((segment) => distanceToSegment(target, segment.start, segment.end) <= 0.15 * WORLD_UNIT_PX + target.radius)) { link.hitTimes.delete(target); continue; }
        target.relaySlowRemaining = 0.1;
        const contact = (link.hitTimes.get(target) ?? 0) + dt;
        if (contact >= 0.5) { this.damageMob(target, 7, '雷'); link.hitTimes.set(target, contact - 0.5); }
        else link.hitTimes.set(target, contact);
      }
    }
  }

  private orbitingBubble(): Vec {
    const angle = this.elapsed * Math.PI / 6;
    return { x: this.player.x + Math.cos(angle) * PROJECTILE_DEFAULTS.rotationRadius * WORLD_UNIT_PX, y: this.player.y + Math.sin(angle) * PROJECTILE_DEFAULTS.rotationRadius * WORLD_UNIT_PX };
  }

  private updateWanderingWisp(dt: number) {
    if (!this.acquiredAbilities.has('wandering-wisp') || this.playerHp <= 0) { this.wanderingWisp = undefined; return; }
    const angle = -Math.PI / 2 + Math.sin(this.elapsed * 0.8) * Math.PI / 4;
    const orbit = { x: this.player.x + Math.cos(angle) * 0.75 * WORLD_UNIT_PX, y: this.player.y + Math.sin(angle) * 0.75 * WORLD_UNIT_PX };
    const wisp = this.wanderingWisp ??= { ...orbit, phase: 'idle', cooldown: 0 };
    wisp.cooldown = Math.max(0, wisp.cooldown - dt);
    if (wisp.phase === 'idle') {
      wisp.x = orbit.x; wisp.y = orbit.y;
      if (wisp.cooldown <= 0) {
        const target = this.targets.filter((entry) => distance(this.player, entry) <= 3 * WORLD_UNIT_PX + entry.radius).sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
        if (target) { wisp.target = target; wisp.phase = 'attack'; wisp.cooldown = 1; }
      }
    }
    if (wisp.phase === 'attack' && (!wisp.target || !this.targets.includes(wisp.target))) { wisp.phase = 'return'; wisp.target = undefined; }
    if (wisp.phase === 'idle') return;
    const destination = wisp.phase === 'attack' ? wisp.target! : orbit;
    const start = { x: wisp.x, y: wisp.y };
    const length = distance(wisp, destination), ratio = length > 0 ? Math.min(1, 25 * WORLD_UNIT_PX * dt / length) : 1;
    wisp.x += (destination.x - wisp.x) * ratio; wisp.y += (destination.y - wisp.y) * ratio;
    if (wisp.phase === 'attack' && wisp.target && distanceToSegment(wisp.target, start, wisp) <= wisp.target.radius + PROJECTILE_DEFAULTS.size / 2 * WORLD_UNIT_PX) {
      this.damageMob(wisp.target, 6, '炎'); wisp.target = undefined; wisp.phase = 'return';
    } else if (wisp.phase === 'return' && ratio >= 1) wisp.phase = 'idle';
  }

  useItem(slotIndex: number) {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.itemSlots.length || this.paused || this.defeated || this.awaitingInitialSkill || this.playerHp <= 0) return;
    const itemId = this.itemSlots[slotIndex];
    if (!itemId) { this.showActionFeedback(`${slotIndex + 1}番スロットは空です`); return; }
    if (ITEMS.find((item) => item.id === itemId)?.durationSeconds === 0) { this.showActionFeedback('この装備は持っているだけで効果があります'); return; }
    if (itemId === 'speed-potion-s') this.speedPotionRemaining += 15;
    if (itemId === 'attack-potion-s') this.attackPotionRemaining += 15;
    if (itemId === 'defense-potion-s') this.defensePotionRemaining += 15;
    if (itemId === 'healing-potion-s') {
      this.healingPotionRemaining += 1;
      this.healingPotionAmountRemaining += 50;
    }
    const item = ITEMS.find((entry) => entry.id === itemId)!;
    this.itemSlots[slotIndex] = undefined;
    this.refreshItemSlots();
    this.showAnnouncement(item.name, `${item.description}／${item.durationSeconds}秒`);
  }

  private refreshItemSlots() {
    this.itemSlots.forEach((itemId, index) => {
      const container = document.querySelector<HTMLElement>(`#item-slot-${index}`);
      const name = container?.querySelector<HTMLElement>('span');
      const detail = container?.querySelector<HTMLElement>('small');
      const item = ITEMS.find((entry) => entry.id === itemId);
      container?.classList.toggle('empty', !item);
      container?.setAttribute('aria-label', item ? `${index + 1} ${item.name}：${item.description}${item.durationSeconds === 0 ? '（装備中）' : '（クリックまたは数字キーで使用）'}` : `${index + 1} 空きスロット`);
      if (name) name.textContent = item?.name ?? '空きスロット';
      if (detail) detail.textContent = item?.description ?? '';
    });
  }

  private addFreeze(target: Target, amount: number) {
    if (target.frozenRemaining > 0) return;
    target.freezeAccumulation = Math.min(100, target.freezeAccumulation + amount);
    target.freezeDecayDelay = 5;
    if (target.freezeAccumulation >= 100) {
      target.freezeAccumulation = 0;
      target.freezeDecayDelay = 0;
      target.frozenRemaining = 3;
    }
  }

  private startDash() {
    if (this.paused || this.playerHp <= 0 || !this.hasAbilityOrLineage('dash') || this.dash || this.megaDash || this.dashCharges <= 0) return;
    const dx = Number(this.keys.has('d')) - Number(this.keys.has('a'));
    const dy = Number(this.keys.has('s')) - Number(this.keys.has('w'));
    const length = Math.hypot(dx, dy);
    if (!length) {
      this.showAnnouncement('ダッシュ不可', 'WASDで移動方向を入力してください');
      return;
    }
    if (this.acquiredAbilities.has('mega-volteccer')) {
      const facing = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
      const segmentLength = 2.88 * WORLD_UNIT_PX;
      const start = { ...this.player };
      const pointAt = (angle: number, length: number): Vec => ({
        x: clamp(start.x + Math.cos(angle) * length, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS),
        y: clamp(start.y + Math.sin(angle) * length, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS),
      });
      this.megaDash = {
        points: [
          pointAt(facing - Math.PI / 6, segmentLength),
          pointAt(facing + Math.PI / 6, segmentLength),
          pointAt(facing, 5 * WORLD_UNIT_PX),
        ], pointIndex: 0, speed: 2.88 * 3 * WORLD_UNIT_PX / 0.3, hitTargets: new Set(),
      };
    } else this.dash = {
      direction: { x: dx / length, y: dy / length },
      remainingDistance: (this.acquiredAbilities.has('volteccer') ? 4 : DASH_CONFIG.distance) * WORLD_UNIT_PX,
      remainingTime: DASH_CONFIG.durationSeconds,
      hitTargets: new Set(),
    };
    if (this.acquiredAbilities.has('too-fast-to-see')) this.dashInvincibleRemaining = 0.5;
    this.dashCharges -= 1;
    if (this.dashCooldown <= 0) this.dashCooldown = DASH_CONFIG.cooldownSeconds;
  }

  private hasAbilityOrLineage(abilityId: string): boolean {
    const derivesFrom = (currentId: string, targetId: string, visited: Set<string>): boolean => {
      if (currentId === targetId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      const ability = ABILITIES.find((entry) => entry.id === currentId);
      return (ability?.requires ?? []).some((requirement) => derivesFrom(requirement, targetId, visited));
    };
    return [...this.acquiredAbilities].some((id) => derivesFrom(id, abilityId, new Set()));
  }

  private loop = (time: number) => {
    if (!this.running) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = time;
    if (!this.paused && !this.defeated && !this.awaitingInitialSkill) this.update(dt);
    this.draw(dt);
    this.animationFrame = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    if (this.defeated) return;
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    if (this.actionFeedback) {
      this.actionFeedback.remaining -= dt;
      if (this.actionFeedback.remaining <= 0) {
        this.actionFeedback = undefined;
        const feedback = document.querySelector<HTMLElement>('#action-feedback');
        if (feedback) feedback.hidden = true;
      }
    }
    this.elapsed += dt;
    if (this.mode === 'combat' && !this.bossSpawned && this.elapsed >= 180) {
      this.bossSpawned = true;
      this.targets.push(this.createHellBlade());
      this.showAnnouncement('HELL BLADE', 'ヘルブレイド出現');
    }
    if (!this.shopDiscovered && distance(this.player, this.shopPosition) <= SHOP_DISCOVERY_RANGE) {
      this.shopDiscovered = true;
      this.showAnnouncement('新ショップ発見', '位置をマッピングしました');
    }
    if (!this.bossMapped && distance(this.player, this.mappedBossPosition()) <= SHOP_DISCOVERY_RANGE) {
      this.bossMapped = true;
      this.showAnnouncement('ボス位置発見', '位置をマッピングしました');
    }
    if (this.shopOpen && distance(this.player, this.shopPosition) >= SHOP_CLOSE_RANGE) {
      this.shopOpen = false;
      this.refreshShopUi();
    }
    this.playerHitFlash = Math.max(0, this.playerHitFlash - dt * 4);
    this.basicAttackTimer = Math.max(0, this.basicAttackTimer - dt);
    this.spaceActionCooldown = Math.max(0, this.spaceActionCooldown - dt);
    this.firePunchCooldown = Math.max(0, this.firePunchCooldown - dt);
    this.frostRunCooldown = Math.max(0, this.frostRunCooldown - dt);
    this.staticCooldown = Math.max(0, this.staticCooldown - dt);
    this.marineVeilCooldown = Math.max(0, this.marineVeilCooldown - dt);
    const energyChargeWasActive = this.energyChargeRemaining > 0;
    this.energyChargeRemaining = Math.max(0, this.energyChargeRemaining - dt);
    this.forteRemaining = Math.max(0, this.forteRemaining - dt);
    this.speedPotionRemaining = Math.max(0, this.speedPotionRemaining - dt);
    this.attackPotionRemaining = Math.max(0, this.attackPotionRemaining - dt);
    this.defensePotionRemaining = Math.max(0, this.defensePotionRemaining - dt);
    this.dashInvincibleRemaining = Math.max(0, this.dashInvincibleRemaining - dt);
    this.bloodDetectionRemaining = Math.max(0, this.bloodDetectionRemaining - dt);
    this.highSpeedRemaining = Math.max(0, this.highSpeedRemaining - dt);
    this.jetSurferRemaining = Math.max(0, this.jetSurferRemaining - dt);
    this.sparkBuffRemaining = Math.max(0, this.sparkBuffRemaining - dt);
    if (this.sparkBuffRemaining === 0) this.sparkStacks = 0;
    this.beastFormRemaining = Math.max(0, this.beastFormRemaining - dt);
    this.predatorTokens = this.beastFormRemaining > 0 ? this.predatorTokens.map((time) => time - dt).filter((time) => time > 0) : [];
    if (this.healingPotionRemaining > 0 && this.healingPotionAmountRemaining > 0) {
      const healing = Math.min(this.healingPotionAmountRemaining, 50 * dt);
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + healing);
      this.healingPotionAmountRemaining = Math.max(0, this.healingPotionAmountRemaining - healing);
      this.healingPotionRemaining = Math.max(0, this.healingPotionRemaining - dt);
    }
    if (this.playerHp > 0) this.coins += 1.7 * dt;
    if (energyChargeWasActive) {
      this.energyChargeHealAccumulator += dt;
      while (this.energyChargeHealAccumulator >= 1) {
        this.playerHp = Math.min(this.playerMaxHp, normalizeNumber(this.playerHp + this.playerMaxHp * 0.006));
        this.energyChargeHealAccumulator -= 1;
      }
    } else this.energyChargeHealAccumulator = 0;
    if (this.playerHp > 0 && this.acquiredAbilities.has('regeneration')) {
      this.regenerationTimer += dt;
      while (this.regenerationTimer >= 1) {
        this.playerHp = Math.min(this.playerMaxHp, normalizeNumber(this.playerHp + 1));
        this.regenerationTimer -= 1;
      }
    }
    if (this.playerHp > 0 && this.acquiredAbilities.has('rising-tide') && !this.risingTideEnhanced) {
      this.risingTideTimer += dt;
      while (this.risingTideTimer >= 1 && this.risingTideStacks < 10) {
        this.risingTideStacks += 1; this.risingTideTimer -= 1;
      }
      if (this.risingTideStacks === 10) { this.risingTideEnhanced = true; this.risingTideTimer = 0; }
    }
    if (this.playerHp > 0 && this.acquiredAbilities.has('freezing-wind')) {
      this.freezingWindTimer += dt;
      while (this.freezingWindTimer >= 1) {
        for (const target of this.targets) if (distance(this.player, target) <= 5 * WORLD_UNIT_PX + target.radius) this.addFreeze(target, 5);
        this.freezingWindTimer -= 1;
      }
    }
    if (this.mode === 'combat') this.spawnTimer -= dt;
    if (this.mode === 'combat' && this.spawnTimer <= 0) {
      const [minCount, maxCount] = this.monsterSpawnRange();
      const normalCount = this.targets.filter((target) => target.kind === 'monster').length;
      const count = Math.min(MONSTER_LIMIT - normalCount, minCount + Math.floor(Math.random() * (maxCount - minCount + 1)));
      for (let index = 0; index < count; index += 1) {
        const categoryRoll = Math.random();
        const tier: MobTier = this.elapsed < 60 ? 'minor' : categoryRoll < 0.75 ? 'minor' : categoryRoll < 0.95 ? 'medium' : 'large';
        let x: number, y: number;
        if (Math.random() < 0.9) {
          const angle = Math.random() * Math.PI * 2, range = Math.sqrt(Math.random()) * MONSTER_ACTIVE_RANGE;
          x = clamp(this.player.x + Math.cos(angle) * range, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
          y = clamp(this.player.y + Math.sin(angle) * range, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
        } else {
          x = PLAYER_RADIUS + Math.random() * (WORLD_SIZE_PX - PLAYER_RADIUS * 2);
          y = PLAYER_RADIUS + Math.random() * (WORLD_SIZE_PX - PLAYER_RADIUS * 2);
        }
        this.targets.push(this.createMob(x, y, Math.random() * 10, tier));
      }
      this.spawnTimer = 7 + Math.random() * 3;
    }
    for (const [areaId, remaining] of this.chargedStacks) {
      const nextRemaining = remaining - dt;
      if (nextRemaining <= 0) this.chargedStacks.delete(areaId);
      else this.chargedStacks.set(areaId, nextRemaining);
    }
    const cooldownRecovery = this.cooldownRecovery();
    this.qCooldown = Math.max(0, this.qCooldown - dt * cooldownRecovery);
    this.eCooldown = Math.max(0, this.eCooldown - dt * cooldownRecovery);
    this.cCooldown = Math.max(0, this.cCooldown - dt * cooldownRecovery);
    this.stealthRemaining = Math.max(0, this.stealthRemaining - dt);
    const maxDashCharges = this.acquiredAbilities.has('double-dash') ? 2 : 1;
    if (this.dashCharges < maxDashCharges) {
      this.dashCooldown -= dt;
      while (this.dashCooldown <= 0 && this.dashCharges < maxDashCharges) {
        this.dashCharges += 1;
        this.dashCooldown = this.dashCharges < maxDashCharges ? this.dashCooldown + DASH_CONFIG.cooldownSeconds : 0;
      }
    }
    if (this.timeSlipCharges < 3) {
      this.timeSlipCooldown -= dt;
      while (this.timeSlipCooldown <= 0 && this.timeSlipCharges < 3) {
        this.timeSlipCharges += 1;
        this.timeSlipCooldown = this.timeSlipCharges < 3 ? this.timeSlipCooldown + 4 : 0;
      }
    }
    this.afterimages.forEach((afterimage) => { afterimage.remaining -= dt; });
    this.afterimages = this.afterimages.filter((afterimage) => afterimage.remaining > 0);
    this.updateFrostRun(dt);
    this.updateElectRoads(dt);
    this.updateIceStorm();
    this.updateSoulFlame();
    this.updatePoseidonSkills(dt);
    this.updateLightningRelays(dt);
    this.updateWanderingWisp(dt);
    this.targets.forEach((target) => {
      target.hitFlash = Math.max(0, target.hitFlash - dt * 4);
      target.damagePopups.forEach((popup) => { popup.age += dt; });
      target.damagePopups = target.damagePopups.filter((popup) => popup.age < 0.75);
    });
    for (const target of this.targets) {
      if (target.kind !== 'monster') continue;
      target.outOfRangeSeconds = distance(this.player, target) > MONSTER_ACTIVE_RANGE ? target.outOfRangeSeconds + dt : 0;
    }
    this.targets = this.targets.filter((target) => target.kind !== 'monster' || target.outOfRangeSeconds < 3);
    this.arcs.forEach((arc) => { arc.age += dt; });
    this.arcs = this.arcs.filter((arc) => arc.age < MELEE_EFFECT_SECONDS);
    this.impacts.forEach((impact) => { impact.age += dt; });
    this.impacts = this.impacts.filter((impact) => impact.age < 0.25);
    this.defeats.forEach((effect) => { effect.age += dt; });
    this.defeats = this.defeats.filter((effect) => effect.age < 0.85);
    if (this.blizzardEffect) {
      this.blizzardEffect.age += dt;
      if (this.blizzardEffect.age >= 0.45) this.blizzardEffect = undefined;
    }
    if (this.directionalEffect) {
      this.directionalEffect.age += dt;
      if (this.directionalEffect.age >= this.directionalEffect.duration) this.directionalEffect = undefined;
    }
    this.chargedAreas.forEach((area) => { area.remaining -= dt; });
    this.chargedAreas = this.chargedAreas.filter((area) => area.remaining > 0);
    this.coldAreas.forEach((area) => {
      area.remaining -= dt;
      for (const target of [...this.targets]) {
        if (distance(area, target) > 0.35 * WORLD_UNIT_PX + target.radius) {
          area.hitTimes.delete(target);
          continue;
        }
        const contactTime = (area.hitTimes.get(target) ?? 0) + dt;
        if (contactTime >= 0.5) {
          this.damageMob(target, 1);
          area.hitTimes.set(target, contactTime - 0.5);
        } else area.hitTimes.set(target, contactTime);
      }
    });
    this.coldAreas = this.coldAreas.filter((area) => area.remaining > 0);
    for (const target of [...this.targets]) {
      if (target.frozenRemaining > 0) {
        target.frozenRemaining = Math.max(0, target.frozenRemaining - dt);
      } else if (target.freezeAccumulation > 0) {
        target.freezeDecayDelay = Math.max(0, target.freezeDecayDelay - dt);
        if (target.freezeDecayDelay === 0) target.freezeAccumulation = Math.max(0, target.freezeAccumulation - 20 * dt);
      }
      target.stunRemaining = Math.max(0, target.stunRemaining - dt);
      target.weakenedRemaining = Math.max(0, target.weakenedRemaining - dt);
      target.detectionOverrideRemaining = Math.max(0, target.detectionOverrideRemaining - dt);
      target.timeSlowRemaining = Math.max(0, target.timeSlowRemaining - dt);
      target.relaySlowRemaining = Math.max(0, target.relaySlowRemaining - dt);
      for (const [areaId, remaining] of target.chargedStacks) {
        const nextRemaining = remaining - dt;
        if (nextRemaining <= 0) target.chargedStacks.delete(areaId);
        else target.chargedStacks.set(areaId, nextRemaining);
      }
      if (target.chargedStacks.size === 0) {
        target.chargedDamageTimer = 0;
        continue;
      }
      target.chargedDamageTimer += dt;
      while (target.chargedDamageTimer >= 1 && this.targets.includes(target)) {
        target.chargedDamageTimer -= 1;
        this.damageMob(target, target.chargedStacks.size * 1.2);
      }
    }
    if (this.iceBreak) {
      this.iceBreak.age += dt;
      const progress = Math.min(1, this.iceBreak.age / 0.3);
      const reach = progress * 5 * WORLD_UNIT_PX;
      for (const target of [...this.targets]) {
        if (this.iceBreak.hitTargets.has(target)) continue;
        const dx = target.x - this.iceBreak.origin.x, dy = target.y - this.iceBreak.origin.y;
        const forward = dx * Math.cos(this.iceBreak.angle) + dy * Math.sin(this.iceBreak.angle);
        const sideways = -dx * Math.sin(this.iceBreak.angle) + dy * Math.cos(this.iceBreak.angle);
        if (forward >= 0 && forward <= reach + target.radius && Math.abs(sideways) <= WORLD_UNIT_PX + target.radius) {
          this.iceBreak.hitTargets.add(target);
          this.damageMob(target, 20, '氷');
        }
      }
      if (this.iceBreak.age >= 0.3) this.iceBreak = undefined;
    }
    if (this.wildScratch) {
      this.wildScratch.age += dt;
      while (this.wildScratch.pulses < 3 && this.wildScratch.age >= this.wildScratch.pulses * 0.2) {
        const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
        for (const target of [...this.targets]) {
          const dx = target.x - this.player.x, dy = target.y - this.player.y;
          const forward = dx * Math.cos(angle) + dy * Math.sin(angle);
          const sideways = -dx * Math.sin(angle) + dy * Math.cos(angle);
          if (forward >= 0 && forward <= 2.4 * WORLD_UNIT_PX + target.radius && Math.abs(sideways) <= 0.55 * WORLD_UNIT_PX + target.radius) this.damageMob(target, 9);
        }
        this.wildScratch.pulses += 1;
      }
      if (this.wildScratch.pulses >= 3) this.wildScratch = undefined;
    }
    for (const note of this.notes) {
      const movement = 4 * WORLD_UNIT_PX * dt;
      note.x += Math.cos(note.angle) * movement; note.y += Math.sin(note.angle) * movement; note.travelled += 4 * dt;
    }
    this.notes = this.notes.filter((note) => {
      if (note.travelled >= 6) return false;
      const target = this.targets.find((mob) => distance(note, mob) <= 0.35 * WORLD_UNIT_PX + mob.radius);
      if (!target) return true;
      this.damageMob(target, 15);
      return false;
    });
    for (const projectile of this.basicProjectiles) {
      const movement = BASIC_ATTACKS.ranged.projectileSpeed * WORLD_UNIT_PX * dt;
      projectile.x += Math.cos(projectile.angle) * movement;
      projectile.y += Math.sin(projectile.angle) * movement;
      projectile.travelled += BASIC_ATTACKS.ranged.projectileSpeed * dt;
    }
    this.basicProjectiles = this.basicProjectiles.filter((projectile) => {
      if (projectile.travelled >= (projectile.maxDistance ?? BASIC_ATTACKS.ranged.range)) return false;
      const target = this.targets.find((mob) => distance(projectile, mob) <= BASIC_ATTACKS.ranged.projectileSize * 0.5 * WORLD_UNIT_PX + mob.radius);
      if (!target) return true;
      this.damageMob(target, projectile.damage, projectile.attribute);
      return false;
    });
    for (const projectile of this.monsterProjectiles) {
      const previous = { x: projectile.x, y: projectile.y };
      const movement = projectile.speed * WORLD_UNIT_PX * dt;
      projectile.x += Math.cos(projectile.angle) * movement;
      projectile.y += Math.sin(projectile.angle) * movement;
      projectile.travelled += projectile.speed * dt;
      if (this.acquiredAbilities.has('bubbling-guard') && this.playerHp > 0 && distanceToSegment(this.orbitingBubble(), previous, projectile) <= 0.25 * WORLD_UNIT_PX) projectile.travelled = projectile.maxDistance;
    }
    this.monsterProjectiles = this.monsterProjectiles.filter((projectile) => {
      if (projectile.travelled >= projectile.maxDistance) return false;
      if (distance(projectile, this.player) > 0.1 * WORLD_UNIT_PX + PLAYER_RADIUS) return true;
      this.applyPlayerDamage(projectile.damage);
      return false;
    });
    this.witchAttacks.forEach((attack) => { attack.remaining -= dt; });
    this.witchAttacks = this.witchAttacks.filter((attack) => {
      if (attack.remaining > 0) return true;
      if (distance(attack, this.player) <= 0.5 * WORLD_UNIT_PX + PLAYER_RADIUS) this.applyPlayerDamage(attack.damage);
      if (this.targets.includes(attack.source)) attack.source.attackTimer = 3;
      return false;
    });
    this.timeBombs.forEach((bomb) => { bomb.remaining -= dt; });
    this.timeBombs = this.timeBombs.filter((bomb) => {
      if (bomb.remaining > 0) return true;
      for (const target of this.targets) if (distance(bomb, target) <= 0.5 * WORLD_UNIT_PX + target.radius) target.timeSlowRemaining = 3;
      return false;
    });

    let dx = Number(this.keys.has('d')) - Number(this.keys.has('a'));
    let dy = Number(this.keys.has('s')) - Number(this.keys.has('w'));
    if (this.playerHp <= 0) { dx = 0; dy = 0; }
    const length = Math.hypot(dx, dy) || 1;
    dx /= length; dy /= length;
    const positionBeforeMovement = { ...this.player };
    if (this.dash || this.megaDash || this.skillMovement || this.rollback || this.jetSurferRemaining > 0) this.cameraInertiaRemaining = CAMERA_FOLLOW.inertiaSeconds;
    else this.cameraInertiaRemaining = Math.max(0, this.cameraInertiaRemaining - dt);
    const leavesVolteccerTrail = Boolean(this.megaDash || (this.dash && this.acquiredAbilities.has('volteccer')));
    if (this.rollback) {
      let travelBudget = this.rollback.speed * dt;
      while (travelBudget > 0 && this.rollback.pointIndex < this.rollback.points.length) {
        const point = this.rollback.points[this.rollback.pointIndex];
        const remaining = distance(this.player, point);
        const travel = Math.min(remaining, travelBudget);
        if (remaining > 0) {
          this.player.x += (point.x - this.player.x) / remaining * travel;
          this.player.y += (point.y - this.player.y) / remaining * travel;
        }
        travelBudget -= travel;
        if (travel >= remaining - 0.001) this.rollback.pointIndex += 1;
        else break;
      }
      this.rollback.remaining -= dt;
      if (this.rollback.remaining <= 0) {
        const target = this.rollback.points[this.rollback.points.length - 1];
        if (target) { this.player.x = target.x; this.player.y = target.y; }
        this.playerHp = this.rollback.targetHp; this.rollback = undefined;
      }
    } else if (this.skillMovement) {
      const moveSpeed = this.skillMovement.remainingDistance / this.skillMovement.remainingTime;
      const travel = Math.min(this.skillMovement.remainingDistance, moveSpeed * dt);
      this.player.x = clamp(this.player.x + this.skillMovement.direction.x * travel, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
      this.player.y = clamp(this.player.y + this.skillMovement.direction.y * travel, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
      for (const target of [...this.targets]) {
        if (this.skillMovement.damage === undefined) break;
        if (this.skillMovement.hitTargets.has(target) || distance(this.player, target) > PLAYER_RADIUS + target.radius) continue;
        this.skillMovement.hitTargets.add(target); this.damageMob(target, this.skillMovement.damage, '雷');
      }
      this.skillMovement.remainingDistance -= travel;
      this.skillMovement.remainingTime -= dt;
      if (this.skillMovement.remainingDistance <= 0 || this.skillMovement.remainingTime <= 0) this.skillMovement = undefined;
    } else if (this.megaDash) {
      let travelBudget = this.megaDash.speed * dt;
      while (travelBudget > 0 && this.megaDash) {
        const point = this.megaDash.points[this.megaDash.pointIndex];
        const dxToPoint = point.x - this.player.x, dyToPoint = point.y - this.player.y;
        const remaining = Math.hypot(dxToPoint, dyToPoint);
        const travel = Math.min(remaining, travelBudget);
        const segmentStart = { ...this.player };
        if (remaining > 0) {
          this.player.x = clamp(this.player.x + dxToPoint / remaining * travel, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
          this.player.y = clamp(this.player.y + dyToPoint / remaining * travel, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
        }
        for (const target of [...this.targets]) {
          if (this.megaDash.hitTargets.has(target) || distanceToSegment(target, segmentStart, this.player) > PLAYER_RADIUS + target.radius) continue;
          this.megaDash.hitTargets.add(target); this.damageMob(target, 14, '雷');
        }
        travelBudget -= travel;
        if (travel >= remaining - 0.001) {
          this.megaDash.pointIndex += 1;
          if (this.megaDash.pointIndex >= this.megaDash.points.length) this.megaDash = undefined;
        } else break;
      }
    } else if (this.dash) {
      const dashSpeed = this.dash.remainingDistance / this.dash.remainingTime;
      const travel = Math.min(this.dash.remainingDistance, dashSpeed * dt);
      this.player.x = clamp(this.player.x + this.dash.direction.x * travel, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
      this.player.y = clamp(this.player.y + this.dash.direction.y * travel, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
      if (this.acquiredAbilities.has('volteccer')) {
        for (const target of [...this.targets]) {
          if (this.dash.hitTargets.has(target) || distance(this.player, target) > PLAYER_RADIUS + target.radius) continue;
          this.dash.hitTargets.add(target);
          this.damageMob(target, 10, '雷');
        }
      }
      this.dash.remainingDistance -= travel;
      this.dash.remainingTime -= dt;
      if (this.dash.remainingDistance <= 0 || this.dash.remainingTime <= 0) this.dash = undefined;
    } else {
      const speed = 180 * this.currentMovementSpeed();
      let moveX = dx, moveY = dy;
      if (this.jetSurferRemaining > 0) {
        const facing = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
        const fx = Math.cos(facing), fy = Math.sin(facing);
        const forward = Math.max(0, dx * fx + dy * fy);
        const lateral = -dx * fy + dy * fx;
        this.jetLateralVelocity += (lateral * 0.3 - this.jetLateralVelocity) * Math.min(1, dt * 4);
        moveX = fx * forward + -fy * this.jetLateralVelocity;
        moveY = fy * forward + fx * this.jetLateralVelocity;
      } else this.jetLateralVelocity = 0;
      this.player.x = clamp(this.player.x + moveX * speed * dt, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
      this.player.y = clamp(this.player.y + moveY * speed * dt, PLAYER_RADIUS, WORLD_SIZE_PX - PLAYER_RADIUS);
    }
    this.actualMovementSpeed = dt > 0 ? distance(positionBeforeMovement, this.player) / (180 * dt) : 0;
    if (leavesVolteccerTrail && distance(positionBeforeMovement, this.player) >= 2) {
      this.afterimages.push({ ...positionBeforeMovement, angle: Math.atan2(this.player.y - positionBeforeMovement.y, this.player.x - positionBeforeMovement.x), remaining: 0.32 });
    }
    this.positionHistory.forEach((sample) => { sample.age += dt; });
    this.positionHistory.unshift({ ...this.player, hp: this.playerHp, age: 0 });
    this.positionHistory = this.positionHistory.filter((sample) => sample.age <= 3.1);
    if (this.tuning) {
      // 方向指定中はpointermove時に向きを更新する。Qを離した後は
      // 確定した向きを保ち、3音入力完了までプレイヤーへ追従する。
      this.tuning.center = this.tuningCenter(this.tuning.angle);
    }
    if (this.playerHp > 0 && this.character.id === 'skater') this.updateColdTrail();
    if (this.playerHp > 0) this.updateAcquiredAbilities(dt);

    const acquiredAreaIds = new Set<number>();
    for (const area of this.chargedAreas) {
      if (distance(this.player, area) <= BOLT_SHOCK.areaRadius * WORLD_UNIT_PX + PLAYER_RADIUS) {
        if (this.character.id === 'zeus') {
          if (this.chargedStacks.size < 10) this.chargedStacks.set(area.id, 10);
          for (const stackId of this.chargedStacks.keys()) this.chargedStacks.set(stackId, 10);
        } else this.chargedStacks.set(area.id, 10);
        acquiredAreaIds.add(area.id);
        continue;
      }
      const target = this.targets.find((mob) => distance(mob, area) <= BOLT_SHOCK.areaRadius * WORLD_UNIT_PX + mob.radius);
      if (target) {
        target.chargedStacks.set(area.id, 10);
        acquiredAreaIds.add(area.id);
      }
    }
    this.chargedAreas = this.chargedAreas.filter((area) => !acquiredAreaIds.has(area.id));

    this.updateBasicAttack();
    this.updateMobs(dt);
    if (this.defeated) return;

    if (this.strike) {
      this.strike.age += dt;
      while (this.strike.pulses < BOLT_SHOCK.areaCount && this.strike.age >= this.strike.pulses * BOLT_SHOCK.intervalSeconds) {
        const center = this.strike.centers[this.strike.pulses];
        this.strike.pulses += 1;
        this.chargedAreas.push({ ...center, id: this.nextChargedAreaId++, remaining: BOLT_SHOCK.chargedAreaDurationSeconds });
        for (const target of this.targets) {
          if (distance(target, center) <= BOLT_SHOCK.areaRadius * WORLD_UNIT_PX + target.radius) {
            this.damageMob(target, 20, '雷');
          }
        }
      }
      if (this.strike.age > 1) this.strike = undefined;
    }
    const coinValue = document.querySelector<HTMLElement>('#coin-value');
    if (coinValue) coinValue.textContent = String(Math.floor(this.coins));
    if (document.querySelector<HTMLDialogElement>('#build-dialog')?.open) this.updateBuildInfo();
    if (this.mode === 'training') this.updateTrainingMetrics();
  }

  private monsterSpawnRange(): [number, number] {
    if (this.elapsed < 60) return [2, 5];
    if (this.elapsed < 120) return [4, 6];
    if (this.elapsed < 180) return [5, 7];
    if (this.elapsed < 300) return [6, 8];
    return [7, 10];
  }

  private cooldownRecovery() {
    if (this.character.id !== 'zeus') return 1;
    return 1 + Math.max(0, this.actualMovementSpeed - 1) * 0.5;
  }

  private currentMovementSpeed() {
    const energyMultiplier = this.energyChargeRemaining > 0 ? 1.25 : 1;
    const potionMultiplier = this.speedPotionRemaining > 0 ? 1.25 : 1;
    const formBonus = this.beastFormRemaining > 0 ? (this.acquiredAbilities.has('predator-form') ? 0.2 : 0.15) + this.predatorTokens.length * 0.05 : 0;
    const surfingMultiplier = this.acquiredAbilities.has('surfing') ? 1.1 : 1;
    const sparkMultiplier = 1 + this.sparkStacks * 0.05;
    const highSpeedMultiplier = this.highSpeedRemaining > 0 ? 1.2 : 1;
    const stealthMultiplier = this.stealthRemaining > 0 ? 1.2 : 1;
    const jetSurferMultiplier = this.jetSurferRemaining > 0 ? 2.8 : 1;
    const electRoadMultiplier = this.electRoads.some((road) => this.pointOnElectRoad(this.player, road)) ? 1.2 : 1;
    return this.character.movementSpeed * (1 + (this.character.id === 'zeus' ? this.chargedStacks.size * 0.1 : -this.chargedStacks.size * 0.05) + formBonus) * energyMultiplier * potionMultiplier * surfingMultiplier * sparkMultiplier * highSpeedMultiplier * jetSurferMultiplier * electRoadMultiplier * stealthMultiplier;
  }

  private currentDamageMultiplier() {
    const chargedMultiplier = this.character.id === 'zeus' ? 1 + this.chargedStacks.size * 0.03 : 1;
    const energyMultiplier = this.energyChargeRemaining > 0 ? 1.1 : 1;
    const forteMultiplier = this.forteRemaining > 0 ? 1.3 : 1;
    const potionMultiplier = this.attackPotionRemaining > 0 ? 1.2 : 1;
    const formMultiplier = 1 + (this.beastFormRemaining > 0 ? (this.acquiredAbilities.has('predator-form') ? 0.15 : 0.1) + this.predatorTokens.length * 0.05 : 0);
    const flameMultiplier = this.acquiredAbilities.has('boiling-flame') ? 1.08 : 1;
    const futureSelfCooldownMultiplier = this.character.id === 'future' && (this.qCooldown > 0 || this.eCooldown > 0 || this.cCooldown > 0 || this.timeSlipCharges < 3) ? 1.05 : 1;
    return chargedMultiplier * energyMultiplier * forteMultiplier * potionMultiplier * formMultiplier * flameMultiplier * futureSelfCooldownMultiplier;
  }

  private meleeRange() {
    return (BASIC_ATTACKS.melee.range + this.itemSlots.filter((item) => item === 'master-belt').length * 0.2) * WORLD_UNIT_PX;
  }

  private isMeleeTarget(target: Target, facing = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x)) {
    if (target.hp <= 0 || distance(this.player, target) > this.meleeRange() + target.radius) return false;
    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x) - facing;
    return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= BASIC_ATTACKS.melee.angleDegrees * Math.PI / 360;
  }

  private updateBasicAttack() {
    if (this.playerHp <= 0 || this.basicAttackTimer > 0) return;
    if (this.character.attackType === '遠距離') {
      const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
      const angles = this.character.id === 'poseidon' ? [-18, 0, 18] : this.acquiredAbilities.has('triple-shot') ? PROJECTILE_DEFAULTS.threeWayAnglesDegrees : [0];
      for (const offsetDegrees of angles) {
        const projectileAngle = angle + offsetDegrees * Math.PI / 180;
        this.basicProjectiles.push({
          x: this.player.x + Math.cos(projectileAngle) * PLAYER_RADIUS,
          y: this.player.y + Math.sin(projectileAngle) * PLAYER_RADIUS,
          angle: projectileAngle,
          travelled: 0,
          damage: this.playerAttackPower * PROJECTILE_DEFAULTS.damageMultiplier,
          attribute: this.character.attribute,
          maxDistance: (this.character.id === 'future' ? 2.2 : this.character.id === 'poseidon' ? 3.4 : BASIC_ATTACKS.ranged.range) + this.itemSlots.filter((item) => item === 'muzzle').length * 0.2,
        });
      }
      if (this.character.id === 'future') {
        this.futureBurstShots += 1;
        const interval = this.futureBurstShots >= 3 ? 1 : 0.1;
        if (this.futureBurstShots >= 3) this.futureBurstShots = 0;
        this.basicAttackTimer = interval / (this.highSpeedRemaining > 0 ? 1.5 : 1);
      } else this.basicAttackTimer = this.character.id === 'poseidon' ? 2 : BASIC_ATTACKS.ranged.intervalSeconds;
      this.muzzleFlash = 0.16;
      return;
    }
    const facing = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    const targets = this.targets.filter((mob) => this.isMeleeTarget(mob, facing));
    if (targets.length === 0) return;
    const damage = this.playerAttackPower + this.itemSlots.filter((item) => item === 'brass-knuckles').length * 0.4;
    targets.forEach((target) => this.damageMob(target, damage, this.character.attribute));
    if (this.acquiredAbilities.has('fire-punch') && this.firePunchCooldown <= 0) {
      this.damageMob(targets[0], this.playerAttackPower * 0.4, '炎');
      this.firePunchCooldown = 4;
    }
    this.arcs.push({ ...this.player, age: 0, angle: facing, range: this.meleeRange(), direction: this.swingSequence++ % 2 ? -1 : 1 });
    this.basicAttackTimer = BASIC_ATTACKS.melee.intervalSeconds;
  }

  private updateFrostRun(dt: number) {
    if (this.acquiredAbilities.has('frost-run') && this.frostRunCooldown <= 0 && this.frostRunners.length === 0) {
      const nearest = this.targets.filter((target) => target.kind !== 'decoy' || this.mode === 'training').sort((left, right) => distance(this.player, left) - distance(this.player, right))[0];
      if (nearest) {
        const angle = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
        this.frostRunners.push({ ...this.player, phase: 'outbound', direction: { x: Math.cos(angle), y: Math.sin(angle) }, travelled: 0, remaining: 2, hitTimes: new Map() });
        this.frostRunCooldown = 5;
      }
    }
    for (const runner of this.frostRunners) {
      if (runner.phase === 'outbound') {
        const travel = Math.min(12 * WORLD_UNIT_PX * dt, 5 * WORLD_UNIT_PX - runner.travelled);
        runner.x += runner.direction.x * travel; runner.y += runner.direction.y * travel; runner.travelled += travel;
        if (runner.travelled >= 5 * WORLD_UNIT_PX - 0.001) runner.phase = 'dwell';
      } else if (runner.phase === 'dwell') {
        runner.remaining -= dt;
        if (runner.remaining <= 0) { runner.phase = 'return'; runner.remaining = 1; }
      } else {
        const remaining = distance(runner, this.player), travel = Math.min(17 * WORLD_UNIT_PX * dt, remaining);
        if (remaining > 0) { runner.x += (this.player.x - runner.x) / remaining * travel; runner.y += (this.player.y - runner.y) / remaining * travel; }
        if (remaining <= PLAYER_RADIUS + travel) runner.remaining = -1;
      }
      for (const target of [...this.targets]) {
        if (distance(runner, target) > 0.4 * WORLD_UNIT_PX + target.radius) { runner.hitTimes.delete(target); continue; }
        const lastHit = runner.hitTimes.get(target);
        if (lastHit === undefined || this.elapsed - lastHit >= 0.5) {
          this.damageMob(target, 6, '氷');
          runner.hitTimes.set(target, this.elapsed);
        }
      }
    }
    this.frostRunners = this.frostRunners.filter((runner) => runner.remaining >= 0);
  }

  private visibleElectRoadSegment(segment: ElectRoadSegment, road: ElectRoad) {
    const progress = clamp(road.age / 0.5, 0, 1);
    return { start: segment.start, end: { x: segment.start.x + (segment.end.x - segment.start.x) * progress, y: segment.start.y + (segment.end.y - segment.start.y) * progress } };
  }

  private pointOnElectRoad(point: Vec, road: ElectRoad, radius = 0) {
    return road.segments.some((segment) => {
      const visible = this.visibleElectRoadSegment(segment, road);
      return distanceToSegment(point, visible.start, visible.end) <= WORLD_UNIT_PX + radius;
    });
  }

  private updateElectRoads(dt: number) {
    for (const road of this.electRoads) {
      road.age += dt;
      for (const target of [...this.targets]) {
        if (!this.pointOnElectRoad(target, road, target.radius)) { road.hitTimes.delete(target); continue; }
        const contact = (road.hitTimes.get(target) ?? 0) + dt;
        if (contact >= 0.5) { this.damageMob(target, 1); road.hitTimes.set(target, contact - 0.5); }
        else road.hitTimes.set(target, contact);
      }
    }
    this.electRoads = this.electRoads.filter((road) => road.age < 9.5);
  }

  private iceStormParticles() {
    const rotation = this.elapsed * 240 * Math.PI / 180;
    const layers = [
      { radius: 0.8, count: 6, offset: 0 },
      // 第1・第3層を同位相にし、第2層だけ第1層の粒間隔（60°）の半分ずらす。
      { radius: 1.3, count: 10, offset: Math.PI / 6 },
      { radius: 1.8, count: 14, offset: 0 },
    ];
    return layers.flatMap((layer) => Array.from({ length: layer.count }, (_, index) => {
      const angle = rotation + layer.offset + index * Math.PI * 2 / layer.count;
      return { x: this.player.x + Math.cos(angle) * layer.radius * WORLD_UNIT_PX, y: this.player.y + Math.sin(angle) * layer.radius * WORLD_UNIT_PX };
    }));
  }

  private updateIceStorm() {
    if (!this.acquiredAbilities.has('ice-storm')) return;
    this.iceStormParticles().forEach((particle, index) => {
      const hitTimes = this.iceStormHitTimes[index];
      for (const target of [...this.targets]) {
        if (distance(particle, target) > 0.1 * WORLD_UNIT_PX + target.radius) continue;
        const lastHit = hitTimes.get(target);
        if (lastHit !== undefined && this.elapsed - lastHit < 1) continue;
        hitTimes.set(target, this.elapsed);
        this.damageMob(target, 3, '氷');
      }
    });
  }

  private soulFlamePosition(): Vec {
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    return { x: this.player.x - Math.cos(angle) * 2 * WORLD_UNIT_PX, y: this.player.y - Math.sin(angle) * 2 * WORLD_UNIT_PX };
  }

  private updateSoulFlame() {
    if (!this.acquiredAbilities.has('soul-flame')) return;
    const flame = this.soulFlamePosition();
    for (const target of [...this.targets]) {
      if (distance(flame, target) > 0.35 * WORLD_UNIT_PX + target.radius) { this.soulFlameHitTimes.delete(target); continue; }
      const lastHit = this.soulFlameHitTimes.get(target);
      if (lastHit !== undefined && this.elapsed - lastHit < 0.5) continue;
      this.soulFlameHitTimes.set(target, this.elapsed);
      this.damageMob(target, 7, '炎');
    }
  }

  private updatePoseidonSkills(dt: number) {
    if (this.hydroCannon) {
      const cannon = this.hydroCannon;
      cannon.age += dt;
      if (cannon.phase === 'charge' && cannon.age >= 0.8) { cannon.phase = 'fire'; cannon.age -= 0.8; }
      if (cannon.phase === 'fire') {
        const reach = Math.min(1, cannon.age / 0.2) * 7 * WORLD_UNIT_PX;
        for (const target of [...this.targets]) {
          if (cannon.hitTargets.has(target)) continue;
          const dx = target.x - cannon.origin.x, dy = target.y - cannon.origin.y;
          const forward = dx * Math.cos(cannon.angle) + dy * Math.sin(cannon.angle);
          const sideways = -dx * Math.sin(cannon.angle) + dy * Math.cos(cannon.angle);
          if (forward >= 0 && forward <= reach + target.radius && Math.abs(sideways) <= 0.7 * WORLD_UNIT_PX + target.radius) {
            cannon.hitTargets.add(target); this.damageMob(target, 18, '水');
          }
        }
        if (cannon.age >= 0.2) this.hydroCannon = undefined;
      }
    }
    if (this.tidalWave) {
      const wave = this.tidalWave;
      wave.age += dt;
      if (wave.phase === 'pull') {
        for (const target of this.targets) {
          if (distance(this.player, target) > 7 * WORLD_UNIT_PX + target.radius) continue;
          const remaining = distance(this.player, target);
          if (remaining <= PLAYER_RADIUS + target.radius) continue;
          const travel = Math.min(5 * WORLD_UNIT_PX * dt, remaining - PLAYER_RADIUS - target.radius);
          target.x += (this.player.x - target.x) / remaining * travel;
          target.y += (this.player.y - target.y) / remaining * travel;
        }
        if (wave.age >= 0.9) { wave.phase = 'wave'; wave.age -= 0.9; }
      } else {
        const radius = Math.min(1, wave.age / 0.4) * 8 * WORLD_UNIT_PX;
        for (const target of [...this.targets]) {
          if (wave.hitTargets.has(target) || distance(this.player, target) > radius + target.radius) continue;
          wave.hitTargets.add(target); this.damageMob(target, 20, '水');
        }
        if (wave.age >= 0.4) this.tidalWave = undefined;
      }
    }
  }

  private updateColdTrail() {
    if (!this.lastColdPosition) this.lastColdPosition = { ...this.player };
    const spacing = 0.35 * WORLD_UNIT_PX;
    let travelled = distance(this.lastColdPosition, this.player);
    while (travelled >= spacing) {
      const ratio = spacing / travelled;
      this.lastColdPosition = {
        x: this.lastColdPosition.x + (this.player.x - this.lastColdPosition.x) * ratio,
        y: this.lastColdPosition.y + (this.player.y - this.lastColdPosition.y) * ratio,
      };
      this.coldAreas.push({ ...this.lastColdPosition, remaining: 7, hitTimes: new Map() });
      travelled = distance(this.lastColdPosition, this.player);
    }
  }

  private updateAcquiredAbilities(dt: number) {
    if (this.acquiredAbilities.has('crackle-spark')) {
      this.sparkSpawnTimer -= dt;
      if (this.sparkSpawnTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const range = 4 + Math.random() * 3;
        this.sparkParticles.push({ x: this.player.x + Math.cos(angle) * range * WORLD_UNIT_PX, y: this.player.y + Math.sin(angle) * range * WORLD_UNIT_PX, remaining: 10, hitTimes: new Map() });
        this.sparkSpawnTimer = 3 + Math.random() * 2;
      }
      const acquired = new Set<SparkParticle>();
      for (const particle of this.sparkParticles) {
        particle.remaining -= dt;
        if (distance(this.player, particle) <= PLAYER_RADIUS + 0.5 * WORLD_UNIT_PX) {
          this.sparkStacks = Math.min(5, this.sparkStacks + 1);
          this.sparkBuffRemaining = 10;
          acquired.add(particle);
          continue;
        }
        for (const target of [...this.targets]) {
          if (distance(particle, target) > 0.5 * WORLD_UNIT_PX + target.radius) {
            particle.hitTimes.delete(target);
            continue;
          }
          const contactTime = (particle.hitTimes.get(target) ?? 0) + dt;
          if (contactTime >= 0.5) {
            this.damageMob(target, 1);
            particle.hitTimes.set(target, contactTime - 0.5);
          } else particle.hitTimes.set(target, contactTime);
        }
      }
      this.sparkParticles = this.sparkParticles.filter((particle) => particle.remaining > 0 && !acquired.has(particle));
    }

    if (this.acquiredAbilities.has('flame-dance')) {
      for (let index = 0; index < 3; index += 1) {
        const angle = this.elapsed * Math.PI * 2 / 3 + index * Math.PI * 2 / 3;
        const flame = { x: this.player.x + Math.cos(angle) * 2 * WORLD_UNIT_PX, y: this.player.y + Math.sin(angle) * 2 * WORLD_UNIT_PX };
        for (const target of [...this.targets]) {
          if (distance(flame, target) > 0.35 * WORLD_UNIT_PX + target.radius) continue;
          const flameHits = this.flameHitTimes[index];
          if (this.elapsed - (flameHits.get(target) ?? -Infinity) < 1) continue;
          flameHits.set(target, this.elapsed);
          this.damageMob(target, 10, '炎');
        }
      }
    }

    if (this.acquiredAbilities.has('ice-pick')) {
      this.icePickTimer -= dt;
      if (this.icePickTimer <= 0) {
        const offset = this.icePickDiagonal ? Math.PI / 4 : 0;
        for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((value) => value + offset)) {
          this.abilityProjectiles.push({ x: this.player.x, y: this.player.y, angle, speed: 5, travelled: 0, maxDistance: 5, radius: 0.35, damage: 12, kind: 'ice-pick', stoppedRemaining: 0, hitTimes: new Map() });
        }
        this.icePickDiagonal = !this.icePickDiagonal;
        this.icePickTimer += 2;
      }
    }

    if (this.acquiredAbilities.has('bubble-launcher')) {
      this.bubbleCycleTimer -= dt;
      if (this.bubbleCycleTimer <= 0) {
        this.bubbleLaunchDelays.push(...Array.from({ length: 5 }, () => Math.random() * 2));
        this.bubbleCycleTimer += 2;
      }
      this.bubbleLaunchDelays = this.bubbleLaunchDelays.map((delay) => delay - dt);
      const launchCount = this.bubbleLaunchDelays.filter((delay) => delay <= 0).length;
      this.bubbleLaunchDelays = this.bubbleLaunchDelays.filter((delay) => delay > 0);
      for (let index = 0; index < launchCount; index += 1) {
        this.abilityProjectiles.push({
          x: this.player.x, y: this.player.y, angle: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.8, travelled: 0, maxDistance: 0.5 + Math.random() * 1.3,
          radius: 0.4, damage: 6, kind: 'bubble', stoppedRemaining: 5, hitTimes: new Map(),
        });
      }
    }

    for (const projectile of this.abilityProjectiles) {
      for (const [target, remaining] of projectile.hitTimes) {
        if (remaining <= dt) projectile.hitTimes.delete(target);
        else projectile.hitTimes.set(target, remaining - dt);
      }
      if (projectile.travelled < projectile.maxDistance) {
        const movement = Math.min(projectile.speed * dt, projectile.maxDistance - projectile.travelled);
        projectile.x += Math.cos(projectile.angle) * movement * WORLD_UNIT_PX;
        projectile.y += Math.sin(projectile.angle) * movement * WORLD_UNIT_PX;
        projectile.travelled += movement;
      } else if (projectile.kind === 'bubble') projectile.stoppedRemaining -= dt;

      const target = this.targets.find((mob) => !projectile.hitTimes.has(mob) && distance(projectile, mob) <= projectile.radius * WORLD_UNIT_PX + mob.radius);
      if (target) {
        projectile.hitTimes.set(target, projectile.kind === 'icicle-arrow' ? Infinity : 0);
        this.damageMob(target, projectile.damage, projectile.kind === 'bubble' ? '水' : '氷');
        if (projectile.kind !== 'icicle-arrow') projectile.stoppedRemaining = -1;
      }
    }
    this.abilityProjectiles = this.abilityProjectiles.filter((projectile) => projectile.kind === 'bubble' ? projectile.stoppedRemaining > 0 : projectile.travelled < projectile.maxDistance && projectile.stoppedRemaining >= 0);
  }

  private damageMob(target: Target, damage: number, attribute?: string) {
    if (this.defeated || target.hp <= 0) return;
    target.attackedByPlayer = true;
    const frozen = target.frozenRemaining > 0;
    const freezeMultiplier = frozen ? 1.2 * (this.acquiredAbilities.has('freeze-breaker') ? 1.5 : 1) : 1;
    const critical = Math.random() < CRITICAL_CONFIG.baseChance + (this.acquiredAbilities.has('aim-for-opening') ? 0.12 : 0);
    const criticalMultiplier = critical ? CRITICAL_CONFIG.baseDamageMultiplier + (this.acquiredAbilities.has('critical-hit') ? 1 : 0) : 1;
    const weaknessMultiplier = attribute && target.weakness === attribute ? 2 * (this.acquiredAbilities.has('weakness-exploit') ? 1.5 : 1) : 1;
    const resistanceMultiplier = attribute && target.resistance === attribute ? 0.5 : 1;
    const normalizedDamage = normalizeNumber(damage * this.currentDamageMultiplier() * freezeMultiplier * criticalMultiplier * weaknessMultiplier * resistanceMultiplier);
    if (target.kind === 'decoy') {
      if (this.trainingStartedAt === undefined) this.trainingStartedAt = this.elapsed;
      this.trainingTotalDamage = normalizeNumber(this.trainingTotalDamage + normalizedDamage);
      this.trainingRecentDamage.push({ time: this.elapsed, damage: normalizedDamage });
    }
    if (frozen) {
      target.frozenRemaining = 0;
      target.freezeAccumulation = 0;
    }
    target.hitFlash = 1;
    target.lastDamage = normalizedDamage;
    target.lastHitCritical = critical;
    const impactAngle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    this.impacts.push({ x: target.x - Math.cos(impactAngle) * target.radius * 0.7, y: target.y - Math.sin(impactAngle) * target.radius * 0.7, age: 0, angle: impactAngle, critical, color: critical ? '#ffe58a' : CHARACTER_COLORS[this.character.id] });
    if (this.impacts.length > 64) this.impacts.shift();
    const popupLane = target.damagePopupSequence % 6;
    const horizontalOffsets = [-18, 0, 18, -12, 12, 0];
    const verticalOffsets = [0, -4, 0, -12, -12, -18];
    target.damagePopupSequence += 1;
    target.damagePopups.push({ value: normalizedDamage, critical, age: 0, horizontalOffset: horizontalOffsets[popupLane], verticalOffset: verticalOffsets[popupLane] });
    if (target.damagePopups.length > 8) target.damagePopups.splice(0, target.damagePopups.length - 8);
    target.hp = Math.max(0, normalizeNumber(target.hp - normalizedDamage));
    if (target.hp > 0) return;
    if (target.kind === 'decoy') { target.hp = target.maxHp; return; }
    this.kills += 1;
    if (this.character.id === 'prowler') this.playerHp = Math.min(this.playerMaxHp, normalizeNumber(this.playerHp + target.maxHp * 0.1));
    if (this.character.id === 'prowler' && this.beastFormRemaining > 0 && this.acquiredAbilities.has('predator-form')) {
      this.beastFormRemaining = Math.max(4, this.beastFormRemaining + 2);
      this.predatorTokens.push(2);
    }
    const definition = this.mobDefinition(target.type, target.tier);
    const gainedXp = target.kind === 'boss' ? 1000 : Math.floor(Math.random() * (definition.xpMax - definition.xpMin + 1)) + definition.xpMin;
    const gainedCoins = target.kind === 'boss' ? 800 : Math.floor(Math.random() * (definition.coinMax - definition.coinMin + 1)) + definition.coinMin;
    this.defeats.push({ x: target.x, y: target.y, age: 0, radius: target.radius, damage: normalizedDamage, xp: gainedXp, coins: gainedCoins });
    if (this.defeats.length > 24) this.defeats.shift();
    this.coins += gainedCoins;
    this.targets = this.targets.filter((mob) => mob !== target);
    this.gainXp(gainedXp);
  }

  private gainXp(amount: number) {
    this.currentXp += amount;
    let required = requiredXpForLevel(this.level);
    while (required !== undefined && this.currentXp >= required) {
      this.currentXp -= required;
      this.level += 1;
      const levelOffset = this.level - 1;
      const previousMaxHp = this.playerMaxHp;
      this.playerMaxHp = Math.floor(this.character.hp * (1 + HP_GROWTH_CONFIG.linear * levelOffset + HP_GROWTH_CONFIG.quadratic * levelOffset ** 2));
      this.playerHp = Math.min(this.playerMaxHp, normalizeNumber(this.playerHp + this.playerMaxHp - previousMaxHp));
      const attackReference = ATTACK_GROWTH_REFERENCE[this.level];
      if (attackReference !== undefined) this.playerAttackPower = Math.floor(this.character.attackPower * attackReference / ATTACK_GROWTH_REFERENCE[1]);
      this.enqueueChoice({ kind: 'ability', level: this.level, initial: false });
      if (this.level % 5 === 0) this.enqueueChoice({ kind: 'skill-upgrade', level: this.level });
      required = requiredXpForLevel(this.level);
    }
    this.updateProgressUi();
  }

  private enqueueChoice(choice: PendingChoice) {
    this.pendingChoices.push(choice);
    this.showNextChoice();
  }

  private showNextChoice() {
    if (this.choiceOpen) return;
    while (this.pendingChoices.length > 0) {
      const choice = this.pendingChoices[0];
      const shown = choice.kind === 'ability'
        ? this.openAbilityChoice(choice.initial, choice.level)
        : choice.kind === 'e-skill'
          ? this.openEChoice(choice.level, choice.slot)
          : this.openSkillUpgradeChoice(choice.level);
      if (shown) {
        this.choiceOpen = true;
        return;
      }
      this.pendingChoices.shift();
    }
  }

  private completeChoice() {
    document.querySelector<HTMLDialogElement>('#ability-dialog')?.close();
    this.pendingChoices.shift();
    this.choiceOpen = false;
    this.showNextChoice();
  }

  private openAbilityChoice(initial: boolean, choiceLevel: number) {
    const candidates = ABILITIES.filter((ability) => {
      if (ability.status !== 'playable' || this.acquiredAbilities.has(ability.id)) return false;
      if (ability.types.includes('Q強化') || ability.types.includes('E強化') || ability.types.includes('スキル強化')) return false;
      if (ability.characterId && ability.characterId !== this.character.id) return false;
      if (!initial && ability.id === 'dash') return false;
      if (ability.id === 'fire-punch' && this.character.attackType !== '近接') return false;
      if (['icicle-arrow', 'elect-road'].includes(ability.id) && (this.hasAbilityOrLineage('dash') || this.acquiredAbilities.has('icicle-arrow') || this.acquiredAbilities.has('elect-road'))) return false;
      if (ability.id === 'ice-storm') {
        const iceAbilityCount = [...this.acquiredAbilities].filter((id) => ABILITIES.find((entry) => entry.id === id)?.attributes.includes('氷')).length;
        if (iceAbilityCount < 3) return false;
      }
      if (ability.id === 'freeze-breaker' && !this.acquiredAbilities.has('freezing-wind') && ![this.selectedESkill, this.selectedCSkill].includes('freezing-cold')) return false;
      return (ability.requires ?? []).every((requirement) => requirement === 'ranged-basic-attack'
        ? this.character.attackType === '遠距離'
        : this.hasAbilityOrLineage(requirement));
    });
    const dash = candidates.find((ability) => ability.id === 'dash');
    const choiceCount = 3 + (this.acquiredAbilities.has('logical-thinking') ? 1 : 0);
    const choices = initial && dash
      ? [dash, ...candidates.filter((ability) => ability.id !== 'dash').sort(() => Math.random() - 0.5).slice(0, choiceCount - 1)]
      : candidates.sort(() => Math.random() - 0.5).slice(0, choiceCount);
    if (choices.length === 0) {
      this.showAnnouncement(`LEVEL ${choiceLevel}`, '確定済みの未取得アビリティはありません');
      return false;
    }
    const dialog = document.querySelector<HTMLDialogElement>('#ability-dialog');
    const list = document.querySelector<HTMLElement>('#ability-choices');
    const title = document.querySelector<HTMLElement>('#ability-choice-title');
    if (!dialog || !list || !title) return false;
    title.textContent = initial ? 'Lv1 アビリティ選択' : `LEVEL ${choiceLevel} アビリティ選択`;
    list.innerHTML = choices.map((ability) => `<button data-ability="${ability.id}">${ability.attributes.length ? `<span>${ability.attributes.join(' / ')}</span>` : ''}<strong>${ability.name}</strong><small>${ability.description ?? ''}</small></button>`).join('');
    dialog.show();
    return true;
  }

  private openEChoice(choiceLevel: number, slot: 'E' | 'C') {
    const dialog = document.querySelector<HTMLDialogElement>('#ability-dialog');
    const list = document.querySelector<HTMLElement>('#ability-choices');
    const title = document.querySelector<HTMLElement>('#ability-choice-title');
    if (!dialog || !list || !title) return false;
    title.textContent = choiceLevel === 1 ? '開始時 Eスキル選択' : `LEVEL ${choiceLevel} ${slot}スキル選択`;
    const pool = choiceLevel === 1 && slot === 'E'
      ? E_SKILLS[this.character.id].filter((skill) => skill.id !== 'bubble-reflect')
      : availableAdditionalSkills(this.character.id);
    const choices = pool.filter((skill) => ![this.selectedESkill, this.selectedCSkill].includes(skill.id)).sort(() => Math.random() - 0.5).slice(0, 3);
    if (!choices.length) return false;
    list.innerHTML = choices.map((skill) => `<button data-e-skill="${skill.id}" data-skill-slot="${slot}">${skill.attribute ? `<span>${skill.attribute}</span>` : ''}<strong>${skill.name}</strong><small>${skill.description} CD${skill.cooldownSeconds}秒。</small></button>`).join('');
    dialog.show();
    return true;
  }

  private openSkillUpgradeChoice(choiceLevel: number) {
    if (!this.selectedCSkill) return this.openEChoice(choiceLevel, 'C');
    const choices = ABILITIES.filter((ability) =>
      choiceLevel >= 10
      &&
      ability.status === 'playable'
      && !this.acquiredAbilities.has(ability.id)
      && ability.characterId === this.character.id
      && (ability.types.includes('Q強化') || ability.types.includes('E強化') || ability.types.includes('スキル強化'))
      && (ability.requires ?? []).every((requirement) => this.hasAbilityOrLineage(requirement))
    );
    if (choices.length === 0) {
      this.showAnnouncement(`LEVEL ${choiceLevel}`, '確定済みの未取得スキル強化はありません');
      return false;
    }
    const dialog = document.querySelector<HTMLDialogElement>('#ability-dialog');
    const list = document.querySelector<HTMLElement>('#ability-choices');
    const title = document.querySelector<HTMLElement>('#ability-choice-title');
    if (!dialog || !list || !title) return false;
    title.textContent = `LEVEL ${choiceLevel} スキル強化選択`;
    list.innerHTML = choices.map((ability) => `<button data-skill-upgrade="${ability.id}"><span>${ability.attributes.length ? `${ability.attributes.join(' / ')} / ` : ''}${ability.types.join('・')}</span><strong>${ability.name}</strong><small>${ability.description ?? ''}</small></button>`).join('');
    dialog.show();
    return true;
  }

  private onAbilityChoice = (event: Event) => {
    const skillButton = (event.target as HTMLElement).closest<HTMLElement>('[data-e-skill]');
    if (skillButton?.dataset.eSkill) {
      const slot = skillButton.dataset.skillSlot === 'C' ? 'C' : 'E';
      if (!this.assignAdditionalSkill(slot, skillButton.dataset.eSkill)) return;
      if (slot === 'E') this.awaitingInitialSkill = false;
      this.completeChoice();
      this.showAnnouncement(skillButton.querySelector('strong')?.textContent ?? `${slot}スキル`, `${slot}スキルを取得`);
      return;
    }
    const upgradeButton = (event.target as HTMLElement).closest<HTMLElement>('[data-skill-upgrade]');
    if (upgradeButton?.dataset.skillUpgrade) {
      const upgrade = ABILITIES.find((item) => item.id === upgradeButton.dataset.skillUpgrade);
      if (!upgrade) return;
      this.acquiredAbilities.add(upgrade.id);
      this.completeChoice();
      this.showAnnouncement(upgrade.name, 'スキルを強化');
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-ability]');
    if (!button?.dataset.ability) return;
    const ability = ABILITIES.find((item) => item.id === button.dataset.ability);
    if (!ability) return;
    this.acquiredAbilities.add(ability.id);
    if (ability.id === 'double-dash') this.dashCharges = Math.min(2, this.dashCharges + 1);
    this.completeChoice();
    this.showAnnouncement(ability.name, 'アビリティを取得');
  };

  private updateProgressUi() {
    const levelValue = document.querySelector<HTMLElement>('#level-value');
    const xpValue = document.querySelector<HTMLElement>('#xp-value');
    const xpFill = document.querySelector<HTMLElement>('#xp-fill');
    const progressNote = document.querySelector<HTMLElement>('#progress-note');
    const required = requiredXpForLevel(this.level);
    if (levelValue) levelValue.textContent = String(this.level);
    if (xpValue) xpValue.textContent = required === undefined ? 'MAX' : `${this.currentXp} / ${required}`;
    if (xpFill) xpFill.style.width = required === undefined ? '100%' : `${this.currentXp / required * 100}%`;
    if (progressNote) progressNote.textContent = required === undefined ? '最大レベル' : 'モンスターを倒して経験値を獲得';
  }

  private updateBuildInfo() {
    const content = document.querySelector<HTMLElement>('#build-info-content');
    if (!content) return;
    const iconFor = (attribute?: string) => ({ 雷: '⚡', 水: '💧', 炎: '🔥', 氷: '❄', 音楽: '♪' })[attribute ?? ''] ?? '◇';
    const escapeAttribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const entry = (icon: string, name: string, detail: string, state = '', effect = detail) => `<div class="build-entry" tabindex="0" data-effect-name="${escapeAttribute(name)}" data-effect="${escapeAttribute(effect)}"><i>${icon}</i><span><b>${name}</b><small>${detail}</small></span><em>${state}</em></div>`;
    const abilities = ABILITIES.filter((ability) => this.acquiredAbilities.has(ability.id));
    const items = this.itemSlots.map((itemId) => ITEMS.find((item) => item.id === itemId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const buffs = [
      this.energyChargeRemaining > 0 ? ['⚡', 'エネルギーチャージ', `${formatNumber(this.energyChargeRemaining)}秒`] : undefined,
      this.forteRemaining > 0 ? ['♪', 'フォルテ', `${formatNumber(this.forteRemaining)}秒`] : undefined,
      this.speedPotionRemaining > 0 ? ['↟', '移動速度+25%', `${formatNumber(this.speedPotionRemaining)}秒`] : undefined,
      this.attackPotionRemaining > 0 ? ['↟', 'ダメージ+20%', `${formatNumber(this.attackPotionRemaining)}秒`] : undefined,
      this.defensePotionRemaining > 0 ? ['◇', '被ダメージ軽減+20%', `${formatNumber(this.defensePotionRemaining)}秒`] : undefined,
      this.healingPotionRemaining > 0 ? ['＋', 'HP回復中', `${formatNumber(this.healingPotionRemaining)}秒`] : undefined,
      this.character.id === 'zeus' && this.chargedStacks.size > 0 ? ['⚡', '帯電', `${this.chargedStacks.size}スタック`] : undefined,
      this.beastFormRemaining > 0 ? ['P', this.acquiredAbilities.has('predator-form') ? 'プレデターフォルム' : 'ビーストフォルム', `${formatNumber(this.beastFormRemaining)}秒／トークン${this.predatorTokens.length}`] : undefined,
      this.highSpeedRemaining > 0 ? ['⧖', 'ハイスピード', `${formatNumber(this.highSpeedRemaining)}秒`] : undefined,
      this.sparkStacks > 0 ? ['⚡', 'ぱちぱちスパーク', `${this.sparkStacks}スタック／${formatNumber(this.sparkBuffRemaining)}秒`] : undefined,
      this.stealthRemaining > 0 ? ['◇', 'ステルスミッション', `${formatNumber(this.stealthRemaining)}秒`] : undefined,
    ].filter((buff): buff is string[] => Boolean(buff));
    const debuffs = this.character.id !== 'zeus' && this.chargedStacks.size > 0
      ? [['⚡', '帯電', `${this.chargedStacks.size}スタック`]]
      : [];
    const selectedE = availableAdditionalSkills(this.character.id).find((skill) => skill.id === this.selectedESkill);
    const selectedC = availableAdditionalSkills(this.character.id).find((skill) => skill.id === this.selectedCSkill);
    const buffEffects: Record<string, string> = {
      'エネルギーチャージ': E_SKILLS.zeus.find((skill) => skill.id === 'energy-charge')?.description ?? '',
      'フォルテ': E_SKILLS.melodia.find((skill) => skill.id === 'forte')?.description ?? '',
      '移動速度+25%': '移動速度が25%上昇する。',
      'ダメージ+20%': '自身が与えるダメージが20%増加する。',
      '被ダメージ軽減+20%': '受けるダメージを20%軽減する。',
      'HP回復中': ITEMS.find((item) => item.id === 'healing-potion-s')?.description ?? '1秒間かけてHPを合計50回復する。',
      '帯電': this.character.id === 'zeus' ? '1スタックにつき移動速度+10%、ダメージ+3%。最大10スタック。取得時に全スタックの残り時間を10秒へ更新する。' : '1スタックにつき移動速度-5%、毎秒1.2ダメージ。効果時間は10秒。',
      'ビーストフォルム': this.character.q.description,
      'プレデターフォルム': ABILITIES.find((ability) => ability.id === 'predator-form')?.description ?? '',
      'ハイスピード': CHARACTERS.find((character) => character.id === 'future')?.q.description ?? '',
      'ぱちぱちスパーク': ABILITIES.find((ability) => ability.id === 'crackle-spark')?.description ?? '',
      'ステルスミッション': availableAdditionalSkills(this.character.id).find((skill) => skill.id === 'stealth-mission')?.description ?? '',
    };
    const html = `
      <section class="build-section"> <h3>固有能力</h3>
        ${entry(iconFor(this.character.attribute), `Q / ${this.character.q.name}`, this.character.q.description ?? '', '段階 1')}
        ${entry('E', `E / ${selectedE?.name ?? '未取得'}`, this.selectedESkill ? '取得済み' : '開始時に選択', this.selectedESkill ? '段階 1' : '未取得', selectedE ? `${selectedE.description} CD${selectedE.cooldownSeconds}秒。` : '開始時にEスキルを選択する。')}
        ${entry('C', `C / ${selectedC?.name ?? '未取得'}`, selectedC ? '取得済み' : 'スキル選択で取得', selectedC ? '段階 1' : '未取得', selectedC ? `${selectedC.description} CD${selectedC.cooldownSeconds}秒。` : '5の倍数のレベルで、アビリティ選択後にCスキルを選択する。')}
        ${entry('◆', `パッシブ / ${this.character.passiveName}`, this.character.passive, '常時')}
      </section>
      <section class="build-section"><h3>所持アイテム</h3>${items.length ? items.map((item) => entry('▣', item.name, item.description, '1個')).join('') : '<p class="build-empty">なし</p>'}</section>
      <section class="build-section wide"><h3>所持アビリティ</h3>${abilities.length ? abilities.map((ability) => entry(iconFor(ability.attributes[0]), ability.name, ability.attributes.join(' / '), 'スタック 1 / 強化なし', ability.description ?? '')).join('') : '<p class="build-empty">なし</p>'}</section>
      <section class="build-section"><h3>現在のバフ</h3>${buffs.length ? buffs.map(([icon, name, state]) => entry(icon, name, '有効', state, buffEffects[name] ?? '')).join('') : '<p class="build-empty">なし</p>'}</section>
      <section class="build-section"><h3>現在のデバフ</h3>${debuffs.length ? debuffs.map(([icon, name, state]) => entry(icon, name, '有効', state, buffEffects[name] ?? '')).join('') : '<p class="build-empty">なし</p>'}</section>`;
    if (this.buildInfoHtml !== html) {
      const focusedName = content.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.effectName : undefined;
      this.buildInfoHtml = html;
      content.innerHTML = html;
      if (focusedName) Array.from(content.querySelectorAll<HTMLElement>('[data-effect-name]')).find((entry) => entry.dataset.effectName === focusedName)?.focus({ preventScroll: true });
      content.dispatchEvent(new Event('build-info-updated', { bubbles: true }));
    }
  }

  private updateMobs(dt: number) {
    if (this.playerHp <= 0) return;
    for (const mob of this.targets) {
      if (mob.kind === 'decoy') continue;
      mob.attackTimer = Math.max(0, mob.attackTimer - dt * (mob.timeSlowRemaining > 0 ? 0.5 : 1));
      const dx = this.player.x - mob.x;
      const dy = this.player.y - mob.y;
      const targetDistance = Math.hypot(dx, dy);
      if (mob.windup) {
        mob.windup.remaining -= dt;
        if (mob.windup.remaining > 0) continue;
        const attack = mob.windup; mob.windup = undefined;
        const targetAngle = Math.atan2(this.player.y - mob.y, this.player.x - mob.x);
        const angleDelta = Math.abs(Math.atan2(Math.sin(targetAngle - attack.angle), Math.cos(targetAngle - attack.angle)));
        if (attack.attack === 'melee') {
          const definition = this.mobDefinition(mob.type, mob.tier);
          if (targetDistance <= definition.attackRange * WORLD_UNIT_PX + PLAYER_RADIUS) this.applyPlayerDamage(definition.damage);
          mob.attackTimer = definition.attackIntervalSeconds;
        } else if (attack.attack === 'boss-normal') {
          if (targetDistance <= 6 * WORLD_UNIT_PX + PLAYER_RADIUS && angleDelta <= Math.PI / 8) this.applyPlayerDamage(26);
          mob.attackTimer = 2.8; mob.bossNormalAttacks += 1;
          if (mob.bossNormalAttacks > 3) mob.bossAbilityChance = Math.min(1, mob.bossAbilityChance + 0.3);
        } else {
          const forward = dx * Math.cos(attack.angle) + dy * Math.sin(attack.angle);
          const sideways = Math.abs(-dx * Math.sin(attack.angle) + dy * Math.cos(attack.angle));
          if (forward >= 0 && forward <= 9 * WORLD_UNIT_PX + PLAYER_RADIUS && sideways <= 1.3 * WORLD_UNIT_PX + PLAYER_RADIUS) this.applyPlayerDamage(38);
          mob.attackTimer = 3; mob.bossAbilityChance = 0.3;
        }
        continue;
      }
      const definition = this.mobDefinition(mob.type, mob.tier);
      const pheromoneMultiplier = mob.detectionOverrideRemaining > 0 ? 1.25 : 1;
      const timeSlowMultiplier = mob.timeSlowRemaining > 0 || mob.relaySlowRemaining > 0 ? 0.3 : 1;
      const weakenedDamage = definition.damage * (mob.weakenedRemaining > 0 ? 0.7 : 1);
      const detectionRange = (mob.detectionOverrideRemaining > 0 ? 20 : mob.kind === 'boss' ? 17 : definition.detectionRange) * WORLD_UNIT_PX + PLAYER_RADIUS;
      if (targetDistance <= detectionRange) mob.hasDetectedPlayer = true;
      if (!mob.hasDetectedPlayer) continue;
      if (mob.kind === 'boss') {
        if (targetDistance > 6 * WORLD_UNIT_PX + PLAYER_RADIUS) {
          const speed = 0.6 * 180 * timeSlowMultiplier;
          mob.x += dx / targetDistance * speed * dt; mob.y += dy / targetDistance * speed * dt;
        } else if (mob.attackTimer <= 0) {
          const useAbility = mob.bossNormalAttacks >= 3 && Math.random() < mob.bossAbilityChance;
          mob.windup = { remaining: useAbility ? 1.8 : 1.2, duration: useAbility ? 1.8 : 1.2, angle: Math.atan2(dy, dx), attack: useAbility ? 'hell-slash' : 'boss-normal' };
        }
        continue;
      }
      if (mob.type === 'witch') {
        const witch = MOB_DEFINITIONS.witch;
        if (this.witchAttacks.some((attack) => attack.source === mob)) continue;
        const minimumDistance = 5 * WORLD_UNIT_PX;
        const attackDistance = witch.attackRange * WORLD_UNIT_PX + PLAYER_RADIUS;
        if (mob.frozenRemaining <= 0 && (targetDistance < minimumDistance || targetDistance > attackDistance)) {
          const direction = targetDistance < minimumDistance ? -1 : 1;
          const stunMultiplier = mob.stunRemaining > 0 ? 0.1 : 1;
          const movementSpeed = witch.movementSpeed * 180 * (1 - mob.chargedStacks.size * 0.05) * stunMultiplier * pheromoneMultiplier * timeSlowMultiplier;
          mob.x += dx / targetDistance * movementSpeed * dt * direction;
          mob.y += dy / targetDistance * movementSpeed * dt * direction;
        }
        if (targetDistance <= attackDistance && mob.attackTimer <= 0) {
          this.witchAttacks.push({ ...this.player, remaining: 1, damage: weakenedDamage, source: mob });
        }
        continue;
      }
      if (mob.type === 'ranged') {
        const rangedDefinition = definition as typeof MOB_DEFINITIONS.ranged | typeof MOB_DEFINITIONS.mediumRanged | typeof MOB_DEFINITIONS.largeRanged;
        const recognitionRange = ('recognitionRange' in rangedDefinition ? rangedDefinition.recognitionRange : rangedDefinition.attackRange) * WORLD_UNIT_PX + PLAYER_RADIUS;
        const targetRange = rangedDefinition.attackRange * 0.5 * WORLD_UNIT_PX + PLAYER_RADIUS;
        if (mob.frozenRemaining <= 0 && Math.abs(targetDistance - targetRange) > 0.1 * WORLD_UNIT_PX) {
          const direction = targetDistance < targetRange ? -1 : 1;
          const stunMultiplier = mob.stunRemaining > 0 ? 0.1 : 1;
          const movementSpeed = rangedDefinition.movementSpeed * 180 * (1 - mob.chargedStacks.size * 0.05) * stunMultiplier * pheromoneMultiplier * timeSlowMultiplier;
          mob.x += dx / targetDistance * movementSpeed * dt * direction;
          mob.y += dy / targetDistance * movementSpeed * dt * direction;
        }
        if (targetDistance <= recognitionRange && mob.attackTimer <= 0) {
          this.monsterProjectiles.push({ x: mob.x, y: mob.y, angle: Math.atan2(dy, dx), speed: rangedDefinition.projectileSpeed, travelled: 0, maxDistance: rangedDefinition.attackRange, damage: weakenedDamage });
          mob.attackTimer = rangedDefinition.attackIntervalSeconds;
        }
        continue;
      }
      const attackRange = definition.attackRange * WORLD_UNIT_PX + PLAYER_RADIUS;
      if (targetDistance > attackRange) {
        if (mob.frozenRemaining <= 0) {
          const stunMultiplier = mob.stunRemaining > 0 ? 0.1 : 1;
          const movementSpeed = definition.movementSpeed * 180 * (1 - mob.chargedStacks.size * 0.05) * stunMultiplier * pheromoneMultiplier * timeSlowMultiplier;
          mob.x += dx / targetDistance * movementSpeed * dt;
          mob.y += dy / targetDistance * movementSpeed * dt;
        }
      } else if (mob.attackTimer <= 0) {
        mob.windup = { remaining: 0.2, duration: 0.2, angle: Math.atan2(dy, dx), attack: 'melee' };
      }
    }
  }

  private applyPlayerDamage(rawDamage: number) {
    if (this.playerHp <= 0 || this.dashInvincibleRemaining > 0 || this.rollback) return;
    const marineVeilActive = this.acquiredAbilities.has('marine-veil') && this.marineVeilCooldown <= 0;
    let damage = rawDamage;
    if (marineVeilActive) {
      damage *= 0.4;
      this.marineVeilCooldown = 10;
    }
    if (this.defensePotionRemaining > 0) damage *= 0.8;
    if (this.acquiredAbilities.has('rising-tide')) damage *= this.risingTideEnhanced ? 0.6 : 1 - this.risingTideStacks * 0.01;
    this.playerHp = Math.max(0, normalizeNumber(this.playerHp - damage));
    this.playerHitFlash = 1;
    if (this.acquiredAbilities.has('rising-tide')) {
      if (this.risingTideEnhanced) {
        this.risingTideStacks = Math.max(0, this.risingTideStacks - 1);
        if (this.risingTideStacks === 0) { this.risingTideEnhanced = false; this.risingTideTimer = 0; }
      } else { this.risingTideStacks = 0; this.risingTideTimer = 0; }
    }
    if (this.acquiredAbilities.has('static-electricity') && this.staticCooldown <= 0) {
      this.targets.filter((target) => distance(this.player, target) <= 1.5 * WORLD_UNIT_PX + target.radius).forEach((target) => this.damageMob(target, 6));
      this.staticCooldown = 5;
    }
    if (this.playerHp === 0) {
      this.defeated = true;
      this.defeatTime = this.elapsed;
      this.dash = undefined;
      this.megaDash = undefined;
      this.skillMovement = undefined;
      this.pause();
      this.hudText('result-character', `${this.character.name}・今回の記録`);
      this.hudText('result-time', `${String(Math.floor(this.defeatTime / 60)).padStart(2, '0')}:${String(Math.floor(this.defeatTime % 60)).padStart(2, '0')}`);
      this.hudText('result-level', String(this.level));
      this.hudText('result-kills', String(this.kills));
      this.hudText('result-coins', String(Math.floor(this.coins)));
      const result = document.querySelector<HTMLDialogElement>('#result-dialog');
      if (result && !result.open) result.showModal();
    }
  }

  private draw(dt: number) {
    const { width, height } = this.canvas.getBoundingClientRect();
    const targetCamera = { x: this.player.x - width / 2, y: this.player.y - height / 2 };
    const inertiaRatio = clamp(this.cameraInertiaRemaining / CAMERA_FOLLOW.inertiaSeconds, 0, 1);
    const lagX = targetCamera.x - this.camera.x, lagY = targetCamera.y - this.camera.y;
    const lagDistance = Math.hypot(lagX, lagY);
    const maxLag = Math.min(CAMERA_FOLLOW.maxLag, Math.min(width, height) * CAMERA_FOLLOW.maxViewportLagRatio);
    let nextX = this.camera.x, nextY = this.camera.y;
    if (inertiaRatio > 0) {
      const followRatio = clamp((lagDistance - CAMERA_FOLLOW.fastDeadZone) / (CAMERA_FOLLOW.fastFullFollowDistance - CAMERA_FOLLOW.fastDeadZone), 0, 1);
      const fastSpeed = CAMERA_FOLLOW.fastNearSpeed + (CAMERA_FOLLOW.fastFarSpeed - CAMERA_FOLLOW.fastNearSpeed) * followRatio;
      const speed = CAMERA_FOLLOW.normalSpeed * (1 - inertiaRatio) + fastSpeed * inertiaRatio;
      const strength = (1 - Math.exp(-speed * dt)) * (1 - inertiaRatio + inertiaRatio * followRatio);
      if (this.megaDash) {
        const destination = this.megaDash.points[this.megaDash.points.length - 1];
        const forwardLength = distance(this.player, destination);
        if (forwardLength > 0) {
          const forward = { x: (destination.x - this.player.x) / forwardLength, y: (destination.y - this.player.y) / forwardLength };
          const along = lagX * forward.x + lagY * forward.y;
          const lateral = { x: lagX - along * forward.x, y: lagY - along * forward.y };
          nextX += (along * forward.x + lateral.x * CAMERA_FOLLOW.megaLateralFollow) * strength;
          nextY += (along * forward.y + lateral.y * CAMERA_FOLLOW.megaLateralFollow) * strength;
        }
      } else { nextX += lagX * strength; nextY += lagY * strength; }
    } else {
      const strength = 1 - Math.exp(-CAMERA_FOLLOW.normalSpeed * dt);
      nextX += lagX * strength; nextY += lagY * strength;
    }
    const remainingX = targetCamera.x - nextX, remainingY = targetCamera.y - nextY;
    const remainingDistance = Math.hypot(remainingX, remainingY);
    if (remainingDistance > maxLag) {
      const excess = remainingDistance - maxLag;
      nextX += remainingX / remainingDistance * excess;
      nextY += remainingY / remainingDistance * excess;
    }
    this.camera.x = clamp(nextX, 0, Math.max(0, WORLD_SIZE_PX - width));
    this.camera.y = clamp(nextY, 0, Math.max(0, WORLD_SIZE_PX - height));
    if (this.pointerScreen) {
      this.pointer.x = this.pointerScreen.x + this.camera.x;
      this.pointer.y = this.pointerScreen.y + this.camera.y;
    }
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);
    this.drawFloor(WORLD_SIZE_PX, WORLD_SIZE_PX);
    this.drawShop();
    this.drawBossSpawnMarker();
    this.drawColdAreas();
    this.drawSparkParticles();
    this.chargedAreas.forEach((area) => this.drawChargedArea(area));
    this.drawTuning();
    this.drawNotes();
    this.drawBasicProjectiles();
    this.drawMonsterProjectiles();
    this.drawWitchAttacks();
    this.drawTimeBombs();
    this.drawAbilityEffects();
    this.drawStrike();
    this.drawBlizzardEffect();
    this.drawIceBreak();
    this.drawDirectionalEffect();
    this.drawAttackGuide();
    this.targets.forEach((target) => this.drawTarget(target));
    this.drawAfterimages();
    this.drawPlayer();
    this.arcs.forEach((arc) => this.drawMeleeArc(arc));
    this.drawCombatEffects();
    this.ctx.restore();
    this.drawDirectionIndicators(width, height);
    this.updateCombatHud();
    this.drawMinimap();
  }

  private drawFloor(width: number, height: number) {
    const ctx = this.ctx;
    const gradient = ctx.createRadialGradient(this.player.x, this.player.y, 20, this.player.x, this.player.y, Math.max(width, height) * 0.8);
    gradient.addColorStop(0, '#183b31'); gradient.addColorStop(0.55, '#0c201b'); gradient.addColorStop(1, '#06100e');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.strokeStyle = 'rgba(99, 196, 159, .08)'; ctx.lineWidth = 1;
    const grid = 64;
    const viewport = this.canvas.getBoundingClientRect();
    const right = Math.min(width, this.camera.x + viewport.width), bottom = Math.min(height, this.camera.y + viewport.height);
    for (let x = Math.floor(this.camera.x / grid) * grid; x < right; x += grid) { ctx.beginPath(); ctx.moveTo(x, this.camera.y); ctx.lineTo(x, bottom); ctx.stroke(); }
    for (let y = Math.floor(this.camera.y / grid) * grid; y < bottom; y += grid) { ctx.beginPath(); ctx.moveTo(this.camera.x, y); ctx.lineTo(right, y); ctx.stroke(); }
    for (let i = 0; i < 16; i++) {
      const x = (i * 193) % width, y = (i * 97) % height;
      ctx.fillStyle = `rgba(53, 115, 85, ${0.08 + (i % 3) * 0.03})`;
      ctx.beginPath(); ctx.arc(x, y, 28 + (i % 4) * 13, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawShop() {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(this.shopPosition.x, this.shopPosition.y);
    ctx.fillStyle = '#132d25'; ctx.strokeStyle = '#d8f258'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-34, -28, 68, 56, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d8f258'; ctx.font = '800 22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('SHOP', 0, 0);
    if (distance(this.player, this.shopPosition) <= SHOP_INTERACT_RANGE) {
      ctx.fillStyle = '#edf6f1'; ctx.font = '700 12px system-ui'; ctx.fillText('Fでショップ', 0, 46);
    }
    ctx.restore();
  }

  private drawDirectionIndicators(width: number, height: number) {
    const entries: Array<{ position: Vec; label: string; color: string }> = [
      ...(this.bossMapped ? [{ position: this.mappedBossPosition(), label: 'BOSS', color: '#ff6b58' }] : []),
      ...(this.shopDiscovered ? [{ position: this.shopPosition, label: 'SHOP', color: '#d8f258' }] : []),
    ];
    const center = { x: width / 2, y: height / 2 };
    for (const entry of entries) {
      const screenX = entry.position.x - this.camera.x, screenY = entry.position.y - this.camera.y;
      if (screenX >= 24 && screenX <= width - 24 && screenY >= 24 && screenY <= height - 24) continue;
      const angle = Math.atan2(screenY - center.y, screenX - center.x);
      const scale = Math.min((width / 2 - 34) / Math.max(0.001, Math.abs(Math.cos(angle))), (height / 2 - 34) / Math.max(0.001, Math.abs(Math.sin(angle))));
      const x = center.x + Math.cos(angle) * scale, y = center.y + Math.sin(angle) * scale;
      this.ctx.save(); this.ctx.translate(x, y); this.ctx.rotate(angle);
      this.ctx.fillStyle = entry.color; this.ctx.beginPath(); this.ctx.moveTo(12, 0); this.ctx.lineTo(-8, -8); this.ctx.lineTo(-8, 8); this.ctx.closePath(); this.ctx.fill();
      this.ctx.rotate(-angle); this.ctx.fillStyle = entry.color; this.ctx.font = '800 9px system-ui'; this.ctx.textAlign = 'center'; this.ctx.fillText(entry.label, 0, 20); this.ctx.restore();
    }
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    ctx.save(); ctx.translate(this.player.x, this.player.y);
    if (this.muzzleFlash > 0 && this.character.attackType === '遠距離') {
      ctx.save(); ctx.rotate(angle); ctx.globalAlpha = this.muzzleFlash / 0.16;
      ctx.strokeStyle = CHARACTER_COLORS[this.character.id]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(PLAYER_RADIUS + 6, 0, 5 + (1 - this.muzzleFlash / 0.16) * 12, -0.9, 0.9); ctx.stroke(); ctx.restore();
    }
    if (this.stealthRemaining > 0) ctx.globalAlpha = 0.3;
    if (this.acquiredAbilities.has('marine-veil') && this.marineVeilCooldown <= 0) {
      ctx.fillStyle = 'rgba(97, 207, 255, .12)'; ctx.strokeStyle = 'rgba(127, 224, 255, .8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS + 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (const bubbleAngle of [0.4, 2.2, 4.5]) { ctx.beginPath(); ctx.arc(Math.cos(bubbleAngle) * (PLAYER_RADIUS + 4), Math.sin(bubbleAngle) * (PLAYER_RADIUS + 4), 4, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.strokeStyle = 'rgba(107, 238, 255, .22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 42 + Math.sin(this.elapsed * 3) * 3, 0, Math.PI * 2); ctx.stroke();
    const swing = this.arcs[this.arcs.length - 1];
    const recoil = swing && !this.reducedMotion ? Math.sin(clamp(swing.age / MELEE_EFFECT_SECONDS, 0, 1) * Math.PI) * 5 : 0;
    ctx.translate(Math.cos(angle) * recoil, Math.sin(angle) * recoil);
    ctx.save(); ctx.rotate(angle);
    ctx.fillStyle = CHARACTER_COLORS[this.character.id];
    ctx.beginPath(); ctx.moveTo(PLAYER_RADIUS + 9, 0); ctx.lineTo(PLAYER_RADIUS + 2, -5); ctx.lineTo(PLAYER_RADIUS + 2, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.shadowColor = this.playerHitFlash ? '#ff7766' : '#66e9ff'; ctx.shadowBlur = this.playerHitFlash ? 34 : 22; ctx.fillStyle = this.playerHitFlash ? '#64302b' : '#102c32'; ctx.strokeStyle = this.playerHitFlash ? '#ff9d85' : '#8ff4ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#e5fbff'; ctx.font = '700 24px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.character.id === 'zeus' ? 'Ζ' : this.character.id === 'melodia' ? '♪' : this.character.id === 'skater' ? '❄' : this.character.id === 'future' ? '⧖' : 'P', 0, 1);
    ctx.restore();
    if (this.acquiredAbilities.has('dash')) {
      const maxCharges = this.acquiredAbilities.has('double-dash') ? 2 : 1;
      const chargeProgress = Array.from({ length: maxCharges }, (_, index) => index < this.dashCharges ? 1 : index === this.dashCharges ? 1 - clamp(this.dashCooldown / DASH_CONFIG.cooldownSeconds, 0, 1) : 0);
      const gap = maxCharges > 1 ? 3 : 0;
      const chargeWidth = (72 - gap * (maxCharges - 1)) / maxCharges;
      chargeProgress.forEach((progress, index) => {
        this.drawBar(this.player.x - 36 + index * (chargeWidth + gap), this.player.y + 29, chargeWidth, 3, progress, '#70dcea');
      });
    } else if (this.acquiredAbilities.has('icicle-arrow') || this.acquiredAbilities.has('elect-road')) {
      const cooldown = this.acquiredAbilities.has('elect-road') ? 20 : 8;
      this.drawBar(this.player.x - 36, this.player.y + 29, 72, 3, 1 - this.spaceActionCooldown / cooldown, this.acquiredAbilities.has('elect-road') ? '#79efff' : '#b9efff');
    }
    this.drawBar(this.player.x - 36, this.player.y + 34, 72, 6, this.playerHp / this.playerMaxHp, '#71e39f');
    ctx.textAlign = 'center';
    if (this.character.id === 'zeus' && this.chargedStacks.size > 0) {
      const longestRemaining = Math.max(...this.chargedStacks.values());
      const stacks = this.chargedStacks.size;
      ctx.fillStyle = '#8ff4ff'; ctx.font = '700 10px system-ui';
      ctx.fillText(`帯電×${stacks}  ${formatNumber(longestRemaining)}秒  移動+${stacks * 10}% / ダメージ+${stacks * 3}%`, this.player.x, this.player.y - 42);
    }
    if (this.sparkStacks > 0) {
      ctx.fillStyle = '#ffe66d'; ctx.font = '700 10px system-ui';
      ctx.fillText(`ぱちぱちスパーク×${this.sparkStacks} ${formatNumber(this.sparkBuffRemaining)}秒`, this.player.x, this.player.y - 98);
    }
    if (this.energyChargeRemaining > 0 || this.forteRemaining > 0) {
      const buff = this.energyChargeRemaining > 0 ? `エネルギーチャージ ${formatNumber(this.energyChargeRemaining)}秒` : `フォルテ ${formatNumber(this.forteRemaining)}秒`;
      ctx.fillStyle = '#d8f258'; ctx.font = '700 10px system-ui'; ctx.fillText(buff, this.player.x, this.player.y - 56);
    }
    const potionEffects = [
      this.speedPotionRemaining > 0 ? `移動+25% ${formatNumber(this.speedPotionRemaining)}秒` : '',
      this.attackPotionRemaining > 0 ? `ダメージ+20% ${formatNumber(this.attackPotionRemaining)}秒` : '',
      this.defensePotionRemaining > 0 ? `被ダメージ軽減+20% ${formatNumber(this.defensePotionRemaining)}秒` : '',
      this.healingPotionRemaining > 0 ? `HP回復中 ${formatNumber(this.healingPotionRemaining)}秒` : '',
    ].filter(Boolean);
    if (potionEffects.length) {
      ctx.fillStyle = '#9cecff'; ctx.font = '700 9px system-ui';
      ctx.fillText(potionEffects.join(' / '), this.player.x, this.player.y - 70);
    }
    if (this.beastFormRemaining > 0) {
      ctx.fillStyle = '#ff9b72'; ctx.font = '700 10px system-ui';
      ctx.fillText(`${this.acquiredAbilities.has('predator-form') ? 'プレデターフォルム' : 'ビーストフォルム'} ${formatNumber(this.beastFormRemaining)}秒 / 撃破トークン×${this.predatorTokens.length}`, this.player.x, this.player.y - 84);
    }
  }

  private drawAfterimages() {
    const symbol = this.character.id === 'zeus' ? 'Ζ' : this.character.id === 'melodia' ? '♪' : this.character.id === 'skater' ? '❄' : this.character.id === 'future' ? '⧖' : 'P';
    for (const afterimage of this.afterimages) {
      const alpha = clamp(afterimage.remaining / 0.32, 0, 1) * 0.34;
      this.ctx.save(); this.ctx.translate(afterimage.x, afterimage.y); this.ctx.rotate(afterimage.angle * 0.04);
      this.ctx.globalAlpha = alpha; this.ctx.fillStyle = '#65efff'; this.ctx.strokeStyle = '#c0faff'; this.ctx.lineWidth = 1;
      this.ctx.beginPath(); this.ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
      this.ctx.fillStyle = '#efffff'; this.ctx.font = '700 24px Georgia'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.fillText(symbol, 0, 1); this.ctx.restore();
    }
  }

  private drawBossSpawnMarker() {
    if (this.bossSpawned) return;
    const remaining = Math.max(0, 180 - this.elapsed);
    const ctx = this.ctx; ctx.save(); ctx.translate(this.bossSpawnPoint.x, this.bossSpawnPoint.y);
    ctx.strokeStyle = 'rgba(255, 80, 55, .75)'; ctx.fillStyle = 'rgba(90, 12, 10, .22)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 1.5 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9b82'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('HELL BLADE', 0, -10);
    ctx.font = '700 12px system-ui'; ctx.fillText(`出現まで ${Math.ceil(remaining)}秒`, 0, 10); ctx.restore();
  }

  private drawTarget(target: Target) {
    const ctx = this.ctx;
    const bob = this.reducedMotion ? 0 : Math.sin(this.elapsed * 2 + target.phase) * 3;
    if (target.windup) {
      const ratio = 1 - target.windup.remaining / target.windup.duration;
      ctx.save(); ctx.translate(target.x, target.y); ctx.rotate(target.windup.angle);
      ctx.fillStyle = `rgba(255, 76, 55, ${0.12 + ratio * 0.18})`; ctx.strokeStyle = 'rgba(255, 126, 85, .8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      if (target.windup.attack === 'hell-slash') ctx.roundRect(0, -1.3 * WORLD_UNIT_PX, 9 * WORLD_UNIT_PX, 2.6 * WORLD_UNIT_PX, 10);
      else if (target.windup.attack === 'melee') {
        // Normal monsters check distance in every direction; the warning must do the same.
        ctx.arc(0, 0, this.mobDefinition(target.type, target.tier).attackRange * WORLD_UNIT_PX, 0, Math.PI * 2);
      } else {
        const range = 6 * WORLD_UNIT_PX;
        const halfAngle = Math.PI / 8;
        ctx.moveTo(0, 0); ctx.arc(0, 0, range, -halfAngle, halfAngle); ctx.closePath();
      }
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (this.playerHp > 0 && this.character.attackType === '近接' && this.isMeleeTarget(target)) {
      ctx.save(); ctx.strokeStyle = CHARACTER_COLORS[this.character.id]; ctx.lineWidth = 2;
      const radius = target.radius + 7;
      for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath(); ctx.arc(target.x, target.y, radius, angle - 0.18, angle + 0.18); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save(); ctx.translate(target.x, target.y + bob);
    const ranged = target.type === 'ranged'; const witch = target.type === 'witch';
    ctx.shadowColor = target.hitFlash ? '#fff7a1' : witch ? '#ff66d9' : ranged ? '#c76cff' : '#ef604c'; ctx.shadowBlur = target.hitFlash ? 28 : 12;
    ctx.fillStyle = target.hitFlash ? '#fff4b8' : witch ? '#35102f' : ranged ? '#321945' : '#4a1718'; ctx.strokeStyle = witch ? '#ff75dc' : ranged ? '#c477e8' : '#e66c52'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const r = i % 2 ? target.radius * .76 : target.radius; const x = Math.cos(a) * r; const y = Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = ranged ? '#e6b7ff' : '#ffb09c'; ctx.fillRect(-9, -3, 5, 4); ctx.fillRect(4, -3, 5, 4);
    if (ranged) { ctx.strokeStyle = '#e6b7ff'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, 15); ctx.stroke(); }
    target.damagePopups.forEach((popup) => {
      ctx.globalAlpha = clamp(1 - popup.age / 0.75, 0, 1);
      ctx.fillStyle = popup.critical ? '#ffe66d' : '#fff';
      ctx.font = `${popup.critical ? '900 22px' : '800 16px'} system-ui`;
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#08120f'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      const label = `${popup.critical ? '✦ ' : ''}${formatNumber(popup.value)}`;
      const y = -target.radius - 30 + popup.verticalOffset - popup.age * 26;
      ctx.strokeText(label, popup.horizontalOffset, y); ctx.fillText(label, popup.horizontalOffset, y);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    this.drawBar(target.x - 24, target.y - target.radius - 12 + bob, 48, 4, target.hp / target.maxHp, ranged ? '#c477e8' : '#e66c52');
    ctx.fillStyle = ranged ? '#c99cdd' : '#e89a87'; ctx.font = '600 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(target.kind === 'boss' ? 'ヘルブレイド' : target.kind === 'decoy' ? '訓練用デコイ' : this.mobDefinition(target.type, target.tier).name, target.x, target.y + target.radius + 21 + bob);
    if (target.chargedStacks.size > 0) {
      ctx.fillStyle = '#8ff4ff'; ctx.font = '700 9px system-ui';
      ctx.fillText(`帯電×${target.chargedStacks.size}`, target.x, target.y - target.radius - 14 + bob);
    }
    if (target.frozenRemaining > 0 || target.freezeAccumulation > 0) {
      ctx.fillStyle = '#b9efff'; ctx.font = '700 9px system-ui';
      ctx.fillText(target.frozenRemaining > 0 ? `凍結 ${formatNumber(target.frozenRemaining)}秒` : `凍結蓄積 ${formatNumber(target.freezeAccumulation)}%`, target.x, target.y - target.radius - 25 + bob);
    }
    if (target.stunRemaining > 0 || target.weakenedRemaining > 0) {
      ctx.fillStyle = '#ffe58a'; ctx.font = '700 9px system-ui';
      const status = target.stunRemaining > 0 ? `スタン ${formatNumber(target.stunRemaining)}秒` : `弱体化30% ${formatNumber(target.weakenedRemaining)}秒`;
      ctx.fillText(status, target.x, target.y - target.radius - 36 + bob);
    }
  }

  private drawTimeBombs() {
    const ctx = this.ctx;
    for (const bomb of this.timeBombs) {
      ctx.save(); ctx.translate(bomb.x, bomb.y);
      ctx.fillStyle = 'rgba(178, 119, 255, .18)'; ctx.strokeStyle = '#c99cff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 0.5 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ead7ff'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(formatNumber(bomb.remaining), 0, 4);
      ctx.restore();
    }
  }

  private drawWitchAttacks() {
    const ctx = this.ctx;
    for (const attack of this.witchAttacks) {
      const pulse = 0.55 + Math.sin(this.elapsed * 18) * 0.2;
      ctx.save(); ctx.fillStyle = `rgba(255, 62, 180, ${0.12 + pulse * 0.08})`; ctx.strokeStyle = `rgba(255, 125, 215, ${pulse})`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(attack.x, attack.y, 0.5 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd2ef'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText(formatNumber(attack.remaining), attack.x, attack.y + 3); ctx.restore();
    }
  }

  private drawAttackGuide() {
    if (this.playerHp <= 0 || this.awaitingInitialSkill) return;
    const ctx = this.ctx;
    const angle = Math.atan2(this.pointer.y - this.player.y, this.pointer.x - this.player.x);
    const melee = this.character.attackType === '近接';
    const hasTarget = melee && this.targets.some((target) => this.isMeleeTarget(target, angle));
    const color = CHARACTER_COLORS[this.character.id];
    ctx.save(); ctx.translate(this.player.x, this.player.y); ctx.rotate(angle);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
    if (melee) {
      const range = this.meleeRange(), half = BASIC_ATTACKS.melee.angleDegrees * Math.PI / 360;
      ctx.globalAlpha = hasTarget ? 0.16 : 0.045;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, range, -half, half); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = hasTarget ? 0.85 : 0.35;
      ctx.beginPath(); ctx.arc(0, 0, range, -half, half); ctx.stroke();
      ctx.setLineDash([3, 5]);
      for (const side of [-half, half]) {
        ctx.beginPath(); ctx.moveTo(Math.cos(side) * (PLAYER_RADIUS + 8), Math.sin(side) * (PLAYER_RADIUS + 8)); ctx.lineTo(Math.cos(side) * range, Math.sin(side) * range); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.85; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS + 8, -half, -half + half * 2 * (1 - this.basicAttackTimer / BASIC_ATTACKS.melee.intervalSeconds)); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.3; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(PLAYER_RADIUS + 12, 0); ctx.lineTo(100, 0); ctx.stroke();
    }
    ctx.restore();
  }

  private drawMeleeArc(arc: Arc) {
    const ctx = this.ctx, progress = clamp(arc.age / MELEE_EFFECT_SECONDS, 0, 1);
    const half = BASIC_ATTACKS.melee.angleDegrees * Math.PI / 360;
    const sweep = 1 - (1 - clamp(progress / 0.65, 0, 1)) ** 3;
    const head = -half + half * 2 * sweep;
    ctx.save(); ctx.translate(arc.x, arc.y); ctx.rotate(arc.angle); ctx.scale(1, arc.direction);
    ctx.globalAlpha = (1 - progress) * (this.reducedMotion ? 0.55 : 1);
    ctx.fillStyle = CHARACTER_COLORS[this.character.id]; ctx.strokeStyle = CHARACTER_COLORS[this.character.id];
    ctx.beginPath(); ctx.arc(0, 0, arc.range, -half, head); ctx.arc(0, 0, arc.range * 0.48, head, -half, true); ctx.closePath();
    ctx.globalAlpha *= 0.25; ctx.fill(); ctx.globalAlpha *= 4;
    ctx.lineCap = 'round'; ctx.lineWidth = 5 * (1 - progress) + 1;
    ctx.shadowColor = CHARACTER_COLORS[this.character.id]; ctx.shadowBlur = this.reducedMotion ? 0 : 15;
    ctx.beginPath(); ctx.arc(0, 0, arc.range, -half, head); ctx.stroke();
    ctx.strokeStyle = '#f5ffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(head) * PLAYER_RADIUS, Math.sin(head) * PLAYER_RADIUS); ctx.lineTo(Math.cos(head) * arc.range, Math.sin(head) * arc.range); ctx.stroke();
    if (this.character.id === 'prowler') {
      for (const offset of [12, 24]) { ctx.beginPath(); ctx.arc(0, 0, arc.range - offset, -half, head); ctx.stroke(); }
    }
    ctx.restore();
  }

  private drawCombatEffects() {
    const ctx = this.ctx;
    for (const impact of this.impacts) {
      const progress = impact.age / 0.25;
      ctx.save(); ctx.translate(impact.x, impact.y); ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = impact.color; ctx.lineWidth = impact.critical ? 3 : 2; ctx.lineCap = 'round';
      const travel = this.reducedMotion ? 3 : progress * (impact.critical ? 28 : 18);
      for (let index = 0; index < 5; index++) {
        const angle = impact.angle + (index - 2) * 0.9;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * (4 + travel), Math.sin(angle) * (4 + travel)); ctx.lineTo(Math.cos(angle) * (10 + travel), Math.sin(angle) * (10 + travel)); ctx.stroke();
      }
      ctx.restore();
    }
    for (const effect of this.defeats) {
      const progress = effect.age / 0.85;
      ctx.save(); ctx.translate(effect.x, effect.y); ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = '#ffbd87'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, effect.radius + (this.reducedMotion ? 0 : progress * 28), 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '800 17px system-ui'; ctx.fillStyle = '#fff1d7';
      ctx.fillText(formatNumber(effect.damage), 0, -effect.radius - 12 - progress * 20);
      ctx.font = '700 11px system-ui'; ctx.fillStyle = '#d8f258';
      ctx.fillText(`+${effect.xp} XP  ·  +${effect.coins} COIN`, 0, effect.radius + 18 - progress * 12);
      ctx.restore();
    }
  }

  private drawStrike() {
    if (!this.strike) return;
    const { centers, age, pulses } = this.strike; const ctx = this.ctx; const radius = BOLT_SHOCK.areaRadius * WORLD_UNIT_PX;
    ctx.save();
    for (let i = pulses; i < centers.length; i++) {
      const center = centers[i];
      ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(128, 243, 255, .2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let i = 0; i < pulses; i++) {
      const center = centers[i];
      const pulseAge = age - i * BOLT_SHOCK.intervalSeconds;
      if (pulseAge > 0.32) continue;
      ctx.fillStyle = 'rgba(53, 205, 239, .18)'; ctx.strokeStyle = 'rgba(128, 243, 255, .85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const seed = i * 2.1 + age * 11;
      ctx.strokeStyle = `rgba(220, 250, 255, ${Math.max(0, 1 - pulseAge / 0.32)})`; ctx.lineWidth = 3; ctx.shadowColor = '#5deaff'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.moveTo(center.x + Math.sin(seed) * 22, center.y - 140);
      for (let y = -120; y <= 5; y += 20) ctx.lineTo(center.x + Math.sin(seed + y) * 14, center.y + y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawChargedArea(area: ChargedArea) {
    const ctx = this.ctx;
    const radius = BOLT_SHOCK.areaRadius * WORLD_UNIT_PX;
    const fade = Math.min(1, area.remaining);
    ctx.save();
    ctx.fillStyle = `rgba(42, 176, 194, ${0.08 * fade})`;
    ctx.strokeStyle = `rgba(89, 225, 239, ${0.28 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.arc(area.x, area.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = `rgba(178, 248, 255, ${0.5 * fade})`; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('帯電エリア', area.x, area.y + 3);
    ctx.restore();
  }

  private drawTuning() {
    if (!this.tuning) return;
    const ctx = this.ctx, halfWidth = 0.8 * WORLD_UNIT_PX, halfHeight = 1.25 * WORLD_UNIT_PX;
    ctx.save(); ctx.translate(this.tuning.center.x, this.tuning.center.y); ctx.rotate(this.tuning.angle);
    ctx.fillStyle = 'rgba(205, 111, 210, .09)'; ctx.strokeStyle = '#df9ee5'; ctx.lineWidth = 1;
    ctx.fillRect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
    for (let i = 0; i <= 5; i++) { const y = -halfHeight + i * halfHeight * 2 / 5; ctx.beginPath(); ctx.moveTo(-halfWidth, y); ctx.lineTo(halfWidth, y); ctx.stroke(); }
    ctx.fillStyle = '#f1c8f5'; ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
    for (let i = 0; i < 5; i++) ctx.fillText(String(i + 1), 0, -halfHeight + (i + .65) * halfHeight * 2 / 5);
    ctx.restore();
    ctx.fillStyle = '#f1c8f5'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.tuning.state === 'aiming' ? 'Qを離して方向確定' : `入力 ${this.tuning.notes.join(' → ') || '待機中'}`, this.tuning.center.x, this.tuning.center.y - halfHeight - 12);
  }

  private drawSparkParticles() {
    const ctx = this.ctx;
    for (const particle of this.sparkParticles) {
      const pulse = 1 + Math.sin(this.elapsed * 8 + particle.x) * 0.1;
      ctx.save(); ctx.translate(particle.x, particle.y); ctx.scale(pulse, pulse);
      ctx.shadowColor = '#ffe66d'; ctx.shadowBlur = 18; ctx.fillStyle = 'rgba(255, 230, 109, .8)'; ctx.strokeStyle = '#fff5a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 0.5 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#604c00'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚡', 0, 1);
      ctx.restore();
    }
  }

  private drawColdAreas() {
    const ctx = this.ctx;
    const radius = 0.35 * WORLD_UNIT_PX;
    for (const area of this.coldAreas) {
      const fade = Math.min(1, area.remaining);
      ctx.save();
      ctx.fillStyle = `rgba(125, 218, 255, ${0.16 * fade})`;
      ctx.strokeStyle = `rgba(190, 241, 255, ${0.3 * fade})`;
      ctx.beginPath(); ctx.arc(area.x, area.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  private drawBasicProjectiles() {
    const radius = BASIC_ATTACKS.ranged.projectileSize * 0.5 * WORLD_UNIT_PX;
    for (const projectile of this.basicProjectiles) {
      this.drawProjectileTrail(projectile, radius, CHARACTER_COLORS[this.character.id], false);
    }
  }

  private drawMonsterProjectiles() {
    for (const projectile of this.monsterProjectiles) this.drawProjectileTrail(projectile, 0.1 * WORLD_UNIT_PX, '#ff9c80', true);
  }

  private drawProjectileTrail(projectile: BasicProjectile | MonsterProjectile, radius: number, color: string, hostile: boolean) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(projectile.angle);
    const tail = this.reducedMotion ? 0 : Math.min(28, projectile.travelled * WORLD_UNIT_PX);
    ctx.strokeStyle = color; ctx.lineWidth = radius; ctx.lineCap = 'round'; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(-tail, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.strokeStyle = hostile ? '#ff563f' : '#f5ffff'; ctx.lineWidth = 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = this.reducedMotion ? 0 : 10;
    ctx.beginPath();
    if (hostile) { ctx.moveTo(radius + 2, 0); ctx.lineTo(0, -radius); ctx.lineTo(-radius, 0); ctx.lineTo(0, radius); ctx.closePath(); }
    else ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke(); ctx.restore();
  }

  private drawNewSkillEffects() {
    const ctx = this.ctx; ctx.save();
    ctx.strokeStyle = '#a0eaff'; ctx.shadowColor = '#6abfff'; ctx.shadowBlur = 14;
    ctx.lineWidth = 0.3 * WORLD_UNIT_PX;
    for (const link of this.relayLinks) for (const segment of this.relaySegments(link)) {
      ctx.beginPath(); ctx.moveTo(segment.start.x, segment.start.y); ctx.lineTo(segment.end.x, segment.end.y); ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (const device of this.relayDevices) {
      ctx.fillStyle = '#123847'; ctx.beginPath(); ctx.arc(device.x, device.y, 0.35 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#effcff'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⚡', device.x, device.y);
    }
    if (this.relayPreview) {
      const point = this.relayPlacementPoint(); ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.player.x, this.player.y); ctx.lineTo(point.x, point.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(point.x, point.y, 0.35 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.acquiredAbilities.has('bubbling-guard')) {
      const bubble = this.orbitingBubble(); ctx.fillStyle = 'rgba(135,213,255,.4)';
      ctx.beginPath(); ctx.arc(bubble.x, bubble.y, 0.15 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (this.wanderingWisp) {
      ctx.shadowColor = '#ff914d'; ctx.shadowBlur = 20; ctx.fillStyle = '#ffb463';
      ctx.beginPath(); ctx.arc(this.wanderingWisp.x, this.wanderingWisp.y, PROJECTILE_DEFAULTS.size / 2 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private drawAbilityEffects() {
    this.drawNewSkillEffects();
    const ctx = this.ctx;
    if (this.acquiredAbilities.has('ice-storm')) {
      for (const particle of this.iceStormParticles()) {
        ctx.save(); ctx.translate(particle.x, particle.y); ctx.fillStyle = '#bcefff'; ctx.strokeStyle = '#f1fdff'; ctx.shadowColor = '#72d9ff'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(0, 0, 0.1 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    for (const road of this.electRoads) {
      const fade = road.age > 8.5 ? 9.5 - road.age : 1;
      for (const segment of road.segments) {
        const visible = this.visibleElectRoadSegment(segment, road);
        ctx.save(); ctx.globalAlpha = clamp(fade, 0, 1) * 0.72; ctx.strokeStyle = '#69eaff'; ctx.lineWidth = 2 * WORLD_UNIT_PX; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(visible.start.x, visible.start.y); ctx.lineTo(visible.end.x, visible.end.y); ctx.stroke();
        ctx.strokeStyle = '#e7ffff'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      }
    }
    if (this.electRoadPreview) {
      const angle = this.electRoadPreview.angle, length = 5 * WORLD_UNIT_PX;
      ctx.save(); ctx.translate(this.player.x, this.player.y); ctx.rotate(angle); ctx.globalAlpha = 0.32;
      const gradient = ctx.createLinearGradient(0, 0, length, 0); gradient.addColorStop(0, '#75eaff'); gradient.addColorStop(0.82, '#75eaff'); gradient.addColorStop(1, 'rgba(117,234,255,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, -WORLD_UNIT_PX, length, 2 * WORLD_UNIT_PX);
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#c8fbff'; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(length - 30, 0); ctx.lineTo(length + 25, 0); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }
    for (const runner of this.frostRunners) {
      ctx.save(); ctx.translate(runner.x, runner.y); ctx.fillStyle = 'rgba(161,232,255,.55)'; ctx.strokeStyle = '#e9fcff'; ctx.shadowColor = '#6edcff'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(0, 0, 0.4 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (this.acquiredAbilities.has('flame-dance')) {
      for (let index = 0; index < 3; index += 1) {
        const angle = this.elapsed * Math.PI * 2 / 3 + index * Math.PI * 2 / 3;
        const x = this.player.x + Math.cos(angle) * 2 * WORLD_UNIT_PX;
        const y = this.player.y + Math.sin(angle) * 2 * WORLD_UNIT_PX;
        ctx.save(); ctx.fillStyle = '#ff873c'; ctx.shadowColor = '#ff4d1f'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(x, y, 0.35 * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    for (const projectile of this.abilityProjectiles) {
      ctx.save();
      const icy = projectile.kind !== 'bubble';
      ctx.fillStyle = icy ? '#b9efff' : 'rgba(135, 213, 255, .35)';
      ctx.strokeStyle = icy ? '#e8fbff' : '#7bd7ff';
      ctx.shadowColor = '#72d9ff'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(projectile.x, projectile.y, projectile.radius * WORLD_UNIT_PX, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  private drawBlizzardEffect() {
    if (!this.blizzardEffect) return;
    const ctx = this.ctx;
    const ratio = 1 - this.blizzardEffect.age / 0.45;
    ctx.save(); ctx.translate(this.blizzardEffect.x, this.blizzardEffect.y); ctx.rotate(this.blizzardEffect.angle);
    ctx.strokeStyle = `rgba(190, 241, 255, ${ratio})`; ctx.fillStyle = `rgba(104, 202, 255, ${ratio * 0.2})`;
    ctx.lineWidth = 3; ctx.shadowColor = '#85ddff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.roundRect(0, -0.5 * WORLD_UNIT_PX, 4 * WORLD_UNIT_PX, WORLD_UNIT_PX, 0.5 * WORLD_UNIT_PX); ctx.fill(); ctx.stroke();
    for (let x = 0.6; x < 4; x += 0.6) {
      const px = x * WORLD_UNIT_PX;
      ctx.beginPath(); ctx.moveTo(px - 12, -12); ctx.lineTo(px, 0); ctx.lineTo(px - 12, 12); ctx.stroke();
    }
    ctx.restore();
  }

  private drawIceBreak() {
    if (!this.iceBreak) return;
    const ctx = this.ctx;
    const reach = Math.min(1, this.iceBreak.age / 0.3) * 5 * WORLD_UNIT_PX;
    ctx.save(); ctx.translate(this.iceBreak.origin.x, this.iceBreak.origin.y); ctx.rotate(this.iceBreak.angle);
    ctx.fillStyle = 'rgba(128, 219, 255, .18)'; ctx.strokeStyle = '#b9efff'; ctx.lineWidth = 2; ctx.shadowColor = '#79dfff'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(0, -WORLD_UNIT_PX, reach, 2 * WORLD_UNIT_PX, 18); ctx.fill(); ctx.stroke(); ctx.restore();
  }

  private drawDirectionalEffect() {
    if (!this.directionalEffect) return;
    const effect = this.directionalEffect;
    const alpha = 1 - effect.age / effect.duration;
    const ctx = this.ctx;
    ctx.save(); ctx.translate(effect.origin.x, effect.origin.y); ctx.rotate(effect.angle);
    ctx.fillStyle = `rgba(145, 224, 255, ${0.2 * alpha})`;
    ctx.strokeStyle = effect.color; ctx.globalAlpha = alpha; ctx.lineWidth = 2;
    ctx.shadowColor = effect.color; ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(0, -effect.width * WORLD_UNIT_PX / 2, effect.length * WORLD_UNIT_PX, effect.width * WORLD_UNIT_PX, 14);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(effect.length * WORLD_UNIT_PX, 0); ctx.stroke();
    ctx.restore();
  }

  private drawNotes() {
    const ctx = this.ctx;
    for (const note of this.notes) {
      ctx.save(); ctx.translate(note.x, note.y); ctx.fillStyle = '#f2b8ed'; ctx.shadowColor = '#e35ed8'; ctx.shadowBlur = 15;
      ctx.font = `${0.7 * WORLD_UNIT_PX}px Georgia`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♪', 0, 0); ctx.restore();
    }
  }

  private hudElement(id: string) {
    if (!this.hudElements.has(id)) this.hudElements.set(id, document.querySelector<HTMLElement>(`#${id}`));
    return this.hudElements.get(id);
  }

  private hudText(id: string, value: string) {
    const element = this.hudElement(id);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private updateCombatHud() {
    const color = CHARACTER_COLORS[this.character.id];
    const hpRatio = this.playerHp / this.playerMaxHp;
    this.hudText('hud-character', this.character.name);
    this.hudText('hud-hp', `${formatNumber(this.playerHp)} / ${formatNumber(this.playerMaxHp)}`);
    this.hudText('hud-health-status', this.playerHp <= 0 ? '戦闘不能' : hpRatio <= 0.3 ? 'HP低下' : 'HP');
    const health = this.hudElement('health-panel');
    if (health) health.dataset.state = hpRatio <= 0.3 ? 'danger' : 'normal';
    const fill = this.hudElement('hud-hp-fill');
    if (fill) fill.style.width = `${hpRatio * 100}%`;
    const screen = this.hudElement('game-screen');
    if (screen) {
      screen.style.setProperty('--combat-accent', color);
      screen.style.setProperty('--damage-opacity', String(this.reducedMotion ? 0 : this.playerHitFlash * 0.32));
    }
    const melee = this.character.attackType === '近接';
    const hasTarget = melee && this.targets.some((target) => this.isMeleeTarget(target));
    this.hudText('attack-mode', melee ? '近接・自動攻撃' : '遠距離・自動攻撃');
    this.hudText('attack-status', this.awaitingInitialSkill ? 'Eスキルを選んで開始' : this.paused ? '一時停止中' : this.playerHp <= 0 ? 'ESCでメニューを開く' : melee ? this.basicAttackTimer > 0 ? `次の攻撃まで ${countdown(this.basicAttackTimer)}秒` : hasTarget ? '射程内・攻撃可能' : '扇形に敵を入れると攻撃' : 'マウス方向へ自動で発射');
    this.hudText('match-clock', `${String(Math.floor(this.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`);
    this.hudText('match-mode', this.mode === 'training' ? '射撃訓練場' : '戦闘訓練場');
    const updateSlot = (slot: string, name: string, cooldown: number, total: number, detail: string, available = true, charges?: number, active = false) => {
      const element = this.hudElement(`skill-${slot}`);
      if (!element) return;
      const ready = available && (charges !== undefined ? charges > 0 : cooldown <= 0);
      const state = !available ? 'locked' : active ? 'active' : ready ? 'ready' : 'cooldown';
      element.dataset.state = state;
      element.dataset.blocked = String(this.actionFeedback?.slot === slot);
      element.dataset.effectName = name;
      element.dataset.effect = detail;
      element.setAttribute('aria-label', `${slot.toUpperCase()} ${name}：${!available ? '未取得' : active ? '入力中' : ready ? '使用可能' : `あと${countdown(cooldown)}秒`}`);
      element.style.setProperty('--cooldown', `${available ? clamp(cooldown / Math.max(total, 0.001), 0, 1) * 100 : 100}%`);
      this.hudText(`skill-${slot}-name`, name);
      this.hudText(`skill-${slot}-value`, !available ? '—' : active ? '入力中' : charges !== undefined ? `${charges}回` : ready ? 'READY' : `${countdown(cooldown)}s`);
      this.hudText(`skill-${slot}-status`, !available ? slot === 'c' ? 'Lv5から取得' : 'アビリティで取得' : active ? '照準を指定' : charges !== undefined && cooldown > 0 ? `回復 ${countdown(cooldown)}s` : ready ? '使用可能' : '回復中');
    };
    updateSlot('q', this.character.q.name, this.qCooldown, this.character.q.cooldownSeconds ?? 1, this.character.q.description, true, undefined, !!this.tuning || this.hydroCannon?.phase === 'charge');
    for (const [slot, skillId, cooldown] of [['e', this.selectedESkill, this.eCooldown], ['c', this.selectedCSkill, this.cCooldown]] as const) {
      const skill = availableAdditionalSkills(this.character.id).find((entry) => entry.id === skillId);
      const timeSlip = skillId === 'time-slip';
      updateSlot(slot, skill?.name ?? '未取得', timeSlip ? this.timeSlipCooldown : cooldown, skill?.cooldownSeconds ?? 1, skill?.description ?? (slot === 'c' ? 'Lv5以降のスキル選択で取得できます。' : '開始時にEスキルを選択します。'), !!skill, timeSlip ? this.timeSlipCharges : undefined, this.relayPreview?.slot === slot.toUpperCase());
    }
    const road = this.acquiredAbilities.has('elect-road'), arrow = this.acquiredAbilities.has('icicle-arrow');
    const dash = this.hasAbilityOrLineage('dash');
    const spaceName = road ? 'エレクトロード' : arrow ? 'つららアロー' : 'ダッシュ';
    updateSlot('space', spaceName, road || arrow ? this.spaceActionCooldown : this.dashCooldown, road ? 20 : arrow ? 8 : DASH_CONFIG.cooldownSeconds, road ? 'Space長押しで照準、離して電撃の道を展開。' : arrow ? 'Spaceでマウス方向へつららを発射。' : 'ダッシュ系アビリティ取得後、WASDで移動しながらSpace。', road || arrow || dash, !road && !arrow && dash ? this.dashCharges : undefined, !!this.electRoadPreview);
  }

  private mappedBossPosition(): Vec {
    return this.targets.find((target) => target.kind === 'boss') ?? this.bossSpawnPoint;
  }

  private drawBar(x: number, y: number, width: number, height: number, ratio: number, color: string) {
    this.ctx.fillStyle = 'rgba(0,0,0,.65)'; this.ctx.fillRect(x, y, width, height);
    this.ctx.fillStyle = color; this.ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, height - 2);
  }

  private drawMinimap() {
    const ctx = this.miniCtx; const w = this.minimap.width, h = this.minimap.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#071713'; ctx.fillRect(0, 0, w, h);
    if (this.minimapMode === 'minimized') return;
    ctx.strokeStyle = 'rgba(99,196,159,.16)'; ctx.lineWidth = 1;
    for (let i = 20; i < w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
    const nearbySize = 40 * WORLD_UNIT_PX;
    const toMap = (position: Vec) => this.minimapMode === 'whole'
      ? { x: position.x / WORLD_SIZE_PX * w, y: position.y / WORLD_SIZE_PX * h }
      : { x: w / 2 + (position.x - this.player.x) / nearbySize * w, y: h / 2 + (position.y - this.player.y) / nearbySize * h };
    const drawMapped = (position: Vec, color: string, radius: number, directional = true) => {
      const point = toMap(position);
      const inside = point.x >= 5 && point.x <= w - 5 && point.y >= 5 && point.y <= h - 5;
      if (!inside && !directional) return;
      const x = clamp(point.x, 5, w - 5), y = clamp(point.y, 5, h - 5);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    };
    drawMapped(this.player, '#8ff4ff', 4, false);
    if (this.bloodDetectionRemaining > 0) {
      for (const target of this.targets) if (target.attackedByPlayer) drawMapped(target, '#ff5c77', 2.5);
    }
    if (this.bossMapped) drawMapped(this.mappedBossPosition(), this.bossSpawned ? '#ff4938' : '#ff9b72', 3);
    if (this.shopDiscovered) drawMapped(this.shopPosition, '#d8f258', 3);
    ctx.strokeStyle = '#568a76'; ctx.strokeRect(.5, .5, w - 1, h - 1);
    this.drawWorldMap();
  }

  private drawWorldMap() {
    const ctx = this.worldMapCtx, w = this.worldMapCanvas.width, h = this.worldMapCanvas.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#071713'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(99,196,159,.12)';
    for (let index = 1; index < 10; index += 1) { const point = index / 10 * w; ctx.beginPath(); ctx.moveTo(point, 0); ctx.lineTo(point, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, point); ctx.lineTo(w, point); ctx.stroke(); }
    ctx.fillStyle = '#8ff4ff'; ctx.beginPath(); ctx.arc(this.player.x / WORLD_SIZE_PX * w, this.player.y / WORLD_SIZE_PX * h, 6, 0, Math.PI * 2); ctx.fill();
    if (this.bossMapped) {
      const bossPosition = this.mappedBossPosition();
      ctx.fillStyle = this.bossSpawned ? '#ff4938' : '#ff9b72'; ctx.beginPath(); ctx.arc(bossPosition.x / WORLD_SIZE_PX * w, bossPosition.y / WORLD_SIZE_PX * h, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb09c'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.bossSpawned ? 'HELL BLADE' : `HELL BLADE ${Math.ceil(Math.max(0, 180 - this.elapsed))}秒`, bossPosition.x / WORLD_SIZE_PX * w, bossPosition.y / WORLD_SIZE_PX * h - 12);
    }
    if (this.shopDiscovered) {
      const x = this.shopPosition.x / WORLD_SIZE_PX * w, y = this.shopPosition.y / WORLD_SIZE_PX * h;
      ctx.fillStyle = '#d8f258'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8f258'; ctx.fillText('SHOP', x, y - 11);
    }
    const mappedInfo = document.querySelector<HTMLElement>('#mapped-shop-info');
    if (mappedInfo) mappedInfo.textContent = this.shopProductsMapped
      ? `ショップ在庫：${this.shopStock.filter((stock) => stock.quantity > 0).map((stock) => `${ITEMS.find((item) => item.id === stock.itemId)?.name} ×${stock.quantity}`).join('／') || '売り切れ'}`
      : this.shopDiscovered ? 'ショップを訪れると商品情報を確認できます。' : 'ショップはまだ発見されていません。';
  }

  private updateTrainingMetrics() {
    const elapsed = this.trainingStartedAt === undefined ? 0 : Math.max(0, this.elapsed - this.trainingStartedAt);
    this.trainingRecentDamage = this.trainingRecentDamage.filter((hit) => hit.time > this.elapsed - 1);
    const recentDamage = this.trainingRecentDamage.reduce((total, hit) => total + hit.damage, 0);
    const total = document.querySelector<HTMLElement>('#training-total');
    const dps = document.querySelector<HTMLElement>('#training-dps');
    const recentDps = document.querySelector<HTMLElement>('#training-dps-recent');
    if (total) total.textContent = `総ダメージ ${formatNumber(this.trainingTotalDamage)}`;
    if (dps) dps.textContent = `平均DPS ${formatNumber(elapsed > 0 ? this.trainingTotalDamage / elapsed : 0)}`;
    if (recentDps) recentDps.textContent = `直近1秒DPS ${formatNumber(recentDamage)}`;
  }

  private showAnnouncement(title: string, message: string) {
    this.announcement.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    this.announcement.classList.add('show');
    if (this.announcementTimeout !== undefined) window.clearTimeout(this.announcementTimeout);
    this.announcementTimeout = window.setTimeout(() => this.announcement.classList.remove('show'), 3600);
  }
}
