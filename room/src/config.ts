export type CharacterId = 'zeus' | 'melodia' | 'skater' | 'prowler' | 'future' | 'poseidon';

export interface SkillDefinition {
  id: string;
  name: string;
  cooldownSeconds?: number;
  description: string;
  status: 'playable' | 'tbd-blocked';
}

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  epithet: string;
  hp: number;
  attackPower: number;
  movementSpeed: number;
  attackType: '近接' | '遠距離';
  attribute: string;
  passiveName: string;
  passive: string;
  q: SkillDefinition;
  status: 'playable' | 'tbd-blocked';
}

export type AbilityTrigger = 'Always' | 'Interval' | 'OnDamageTaken' | 'OnDash' | 'OnBasicAttack';
export type AbilityEffect =
  | 'Damage'
  | 'DamageReduction'
  | 'SpawnProjectile'
  | 'ModifyBasicAttack'
  | 'ReplaceAbility'
  | 'AddCharge';

export interface AbilityDefinition {
  id: string;
  name: string;
  attributes: string[];
  types: string[];
  triggers: AbilityTrigger[];
  effects: AbilityEffect[];
  requires?: string[];
  characterId?: CharacterId;
  status: 'playable' | 'tbd-blocked';
  incompleteReason?: string;
  description?: string;
}

export const WORLD_UNIT_PX = 56;

export const CRITICAL_CONFIG = {
  baseChance: 0.03,
  baseDamageMultiplier: 1.5,
} as const;

export const BOSS_REWARD_CONFIG = {
  killerShare: 0.8,
  damageContributionShare: 0.2,
} as const;

export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'zeus',
    name: 'ゼウス',
    epithet: '疾雷の無法者',
    hp: 240,
    attackPower: 9,
    movementSpeed: 1.2,
    attackType: '近接',
    attribute: '雷',
    passiveName: '電光石火',
    passive: '実際に移動している速度が1.0を超えるほど、スキルのクールダウン回復速度が上昇する。停止中はボーナスなし。',
    q: {
      id: 'bolt-shock',
      name: 'ボルトショック',
      cooldownSeconds: 14,
      description: '前方3.2へ半径0.5の攻撃エリアを3つ並べ、各エリアに雷ダメージ20。',
      status: 'playable',
    },
    status: 'playable',
  },
  {
    id: 'melodia',
    name: 'メロディア',
    epithet: '旋律の技巧家',
    hp: 240,
    attackPower: 7,
    movementSpeed: 1,
    attackType: '遠距離',
    attribute: '音楽',
    passiveName: '絶対音感',
    passive: '効果は再調整予定。',
    q: {
      id: 'tuning',
      name: '調律',
      description: 'Q長押しで調律エリアを指定し、5領域から3音を入力する。音符1発につき15ダメージ。',
      status: 'playable',
    },
    status: 'playable',
  },
  {
    id: 'skater',
    name: 'スケーター',
    epithet: '氷路の支配者',
    hp: 200,
    attackPower: 9,
    movementSpeed: 1.2,
    attackType: '近接',
    attribute: '氷',
    passiveName: '冷気纏い',
    passive: '移動経路にサイズ0.7の冷気を7秒間残し、接触した対象へ0.5秒ごとに1スリップダメージを与える。',
    q: {
      id: 'blizzard-lance',
      name: 'ブリザードランス',
      cooldownSeconds: 7,
      description: '自分の位置から前方4まで続く幅1へ氷ダメージ12を与える。',
      status: 'playable',
    },
    status: 'playable',
  },
  {
    id: 'prowler', name: 'プラウラー', epithet: '連続撃破の捕食者', hp: 176, attackPower: 10, movementSpeed: 1.1, attackType: '近接', attribute: '獣',
    passiveName: '捕食者', passive: 'モンスター撃破時、対象の最大HPの10%分、自身のHPを回復する。',
    q: { id: 'beast-form', name: 'ビーストフォルム', cooldownSeconds: 20, description: '10秒間、移動速度+15%、ダメージ+10%。', status: 'playable' }, status: 'playable',
  },
  {
    id: 'future', name: 'フューチャー', epithet: '時空を駆ける無法者', hp: 190, attackPower: 4, movementSpeed: 1.2, attackType: '遠距離', attribute: '時空',
    passiveName: '時空管理', passive: '自身のスキルが1つ以上CD中ならダメージ+5%。攻撃対象のスキルが1つ以上CD中ならさらにダメージ+10%。',
    q: { id: 'high-speed', name: 'ハイスピード', cooldownSeconds: 16, description: '8秒間、移動速度+20%、攻撃速度+50%。', status: 'playable' }, status: 'playable',
  },
  {
    id: 'poseidon', name: 'ポセイドン', epithet: '大海の支配者', hp: 270, attackPower: 4.5, movementSpeed: 0.8, attackType: '遠距離', attribute: '水',
    passiveName: 'ビッグウェーブ', passive: '半径7以内の敵が新たに獲得したバフを自身も獲得する。',
    q: { id: 'hydro-cannon', name: 'ハイドロカノン', cooldownSeconds: 15, description: '0.8秒チャージ後、0.2秒かけて前方7・幅1.4へ水ダメージ18。', status: 'playable' }, status: 'playable',
  },
] as const;

export const ZEUS = CHARACTERS[0];

export interface ESkillDefinition {
  id: string;
  name: string;
  description: string;
  attribute?: string;
  cooldownSeconds: number;
}

export const COMMON_SKILLS: readonly ESkillDefinition[] = [
  { id: 'stealth-mission', name: 'ステルスミッション', description: '3秒間、移動速度+20%と透明化を得る。', cooldownSeconds: 15 },
  { id: 'diamond-dust', name: 'ダイヤモンドダスト', description: '前方45度の扇形へ氷の粒を30発発射。射程6、弾速9/s、1発につき氷ダメージ6。', attribute: '氷', cooldownSeconds: 15 },
  { id: 'lightning-relay', name: 'ライトニングリレー', description: '長押しで射程7以内の設置位置を確認し、離すとサイズ0.7・寿命30秒の装置を設置。全装置間に幅0.3の雷を両端から17/sで形成。接触中は0.5秒ごとに雷ダメージ7、移動速度-70%。', attribute: '雷', cooldownSeconds: 10 },
];

export const availableAdditionalSkills = (characterId: CharacterId) => [...E_SKILLS[characterId].filter((skill) => skill.id !== 'bubble-reflect'), ...COMMON_SKILLS];

export const E_SKILLS: Readonly<Record<CharacterId, readonly ESkillDefinition[]>> = {
  zeus: [
    { id: 'energy-charge', name: 'エネルギーチャージ', description: '10秒間、移動速度+25%、ダメージ+10%、毎秒最大HPの0.6%回復。', attribute: '雷', cooldownSeconds: 22 },
    { id: 'purple-flash', name: '紫電一閃', description: 'マウス方向へ距離5を0.2秒で移動し、触れた敵へ雷ダメージ35。', attribute: '雷', cooldownSeconds: 20 },
    { id: 'super-spark', name: '超絶スパーク', description: '前方4・幅1へ雷ダメージ15と2秒間のスタン。', attribute: '雷', cooldownSeconds: 15 },
  ],
  melodia: [
    { id: 'piano', name: 'ピアノ', description: '前方4・幅2の敵を10秒間30%弱体化。', attribute: '音楽', cooldownSeconds: 18 },
    { id: 'forte', name: 'フォルテ', description: '10秒間、自身のダメージ+30%。', attribute: '音楽', cooldownSeconds: 18 },
    { id: 'golden-tone', name: '黄金の音色', description: '自身のHPを50回復。', attribute: '音楽', cooldownSeconds: 22 },
  ],
  skater: [
    { id: 'chain-icicles', name: 'つらなるつらら', description: '中央と±30度へ、サイズ0.7・弾速5/s・射程5のつららを3本発射。1発につき氷ダメージ12。', attribute: '氷', cooldownSeconds: 10 },
    { id: 'ice-break', name: 'アイスブレイク', description: '1秒かけて自分から前方5まで進行する幅2。氷ダメージ20、命中は1回。', attribute: '氷', cooldownSeconds: 20 },
    { id: 'freezing-cold', name: 'いてつく冷気', description: '自分から前方4まで続く幅1.6へ凍結蓄積+35%。', attribute: '氷', cooldownSeconds: 1.7 },
  ],
  prowler: [
    { id: 'blood-detection', name: '血液探知', description: '10秒間、一度でも自分が攻撃したことのあるモンスターと敵アウトローをマップへ表示する。', attribute: '獣', cooldownSeconds: 15 },
    { id: 'wild-scratch', name: 'みだれひっかき', description: '現在の視点方向へ前方2.4・幅1.1を0.2秒間隔で3回攻撃し、各9ダメージ。', attribute: '獣', cooldownSeconds: 12 },
    { id: 'pheromone', name: 'フェロモン', description: '半径20以内のモンスターの探知範囲を10秒間20にし、移動速度を25%上昇させる。', attribute: '獣', cooldownSeconds: 11 },
  ],
  future: [
    { id: 'rollback', name: 'ロールバック', description: '過去3秒の移動経路を逆向きになぞり、3秒前の位置と現在HPへ0.3秒で戻る。移動中は無敵。', attribute: '時空', cooldownSeconds: 24 },
    { id: 'time-bomb', name: 'タイムボム', description: '射程5以内の指定地点へボムを置き、0.3秒後、半径0.5の敵へ3秒間、移動速度-70%・CD回復速度-50%。', attribute: '時空', cooldownSeconds: 8 },
    { id: 'time-slip', name: 'タイムスリップ', description: '前方3を0.1秒で移動する。最大3スタック。使用済みスタックは4秒ごとに1つずつ回復する。', attribute: '時空', cooldownSeconds: 4 },
  ],
  poseidon: [
    { id: 'jet-surfer', name: 'ジェットサーファー', description: '3秒間、移動速度+180%。左右への操作が鈍くなる。', attribute: '水', cooldownSeconds: 7 },
    { id: 'tidal-wave', name: 'タイダルウェーブ', description: '半径7の敵を0.9秒間引き寄せ、0.4秒かけて波を放ち半径8内へ水ダメージ20。', attribute: '水', cooldownSeconds: 20 },
    { id: 'bubble-reflect', name: 'バブルリフレクト', description: '6秒間、遠距離攻撃を防ぎ反射する。反射内容は仕様確定待ち。', attribute: '水', cooldownSeconds: 20 },
  ],
} as const;

export const DASH_CONFIG = {
  distance: 2.5,
  durationSeconds: 0.2,
  cooldownSeconds: 7,
  maxCharges: 1,
} as const;

export const BASIC_ATTACKS = {
  melee: { range: 1.7, angleDegrees: 45, intervalSeconds: 0.8 },
  ranged: { range: 2.9, projectileSize: 0.2, projectileSpeed: 8, intervalSeconds: 1 },
} as const;

export const PROJECTILE_DEFAULTS = {
  threeWayAnglesDegrees: [-30, 0, 30],
  damageMultiplier: 1,
  speed: 5,
  size: 0.2,
  rotationRadius: 2,
} as const;

export const MOB_DEFINITIONS = {
  melee: { name: '近接雑魚モンスター', category: '雑魚モンスター', attackType: '近接', hp: 30, movementSpeed: 0.5, attackRange: 0.8, detectionRange: 10, damage: 5, attackIntervalSeconds: 1, xpMin: 3, xpMax: 5, coinMin: 4, coinMax: 7, spawnCondition: 'ゲーム開始直後から出現' },
  ranged: { name: '遠距離雑魚モンスター', category: '雑魚モンスター', attackType: '遠距離', hp: 30, movementSpeed: 0.4, attackRange: 1.3, detectionRange: 10, projectileSpeed: 5, damage: 5, attackIntervalSeconds: 1.5, xpMin: 3, xpMax: 5, coinMin: 4, coinMax: 7, spawnCondition: 'ゲーム開始直後から出現' },
  mediumMelee: { name: '近接中モンスター', category: '中モンスター', attackType: '近接', hp: 50, movementSpeed: 0.5, attackRange: 2, detectionRange: 10, damage: 10, attackIntervalSeconds: 1, xpMin: 7, xpMax: 12, coinMin: 10, coinMax: 15, spawnCondition: '1分経過後、各出現個体につき20%' },
  mediumRanged: { name: '遠距離中モンスター', category: '中モンスター', attackType: '遠距離', hp: 50, movementSpeed: 0.4, attackRange: 3, detectionRange: 10, projectileSpeed: 5, damage: 8, attackIntervalSeconds: 1.5, xpMin: 7, xpMax: 12, coinMin: 10, coinMax: 15, spawnCondition: '1分経過後、各出現個体につき20%' },
  largeMelee: { name: '近接大モンスター', category: '大モンスター', attackType: '近接', hp: 100, movementSpeed: 0.4, attackRange: 2, detectionRange: 13, damage: 18, attackIntervalSeconds: 1, xpMin: 20, xpMax: 30, coinMin: 30, coinMax: 45, spawnCondition: '1分経過後、大モンスター枠から出現' },
  largeRanged: { name: '遠距離大モンスター', category: '大モンスター', attackType: '遠距離', hp: 45, movementSpeed: 0.3, attackRange: 6, recognitionRange: 7, detectionRange: 13, projectileSpeed: 12, damage: 20, attackIntervalSeconds: 3, xpMin: 20, xpMax: 30, coinMin: 30, coinMax: 45, spawnCondition: '1分経過後、大モンスター枠から出現' },
  witch: { name: '魔女', category: '大モンスター', attackType: '特殊', hp: 50, movementSpeed: 0.4, attackRange: 7, recognitionRange: 8, detectionRange: 13, damage: 18, attackIntervalSeconds: 3, xpMin: 35, xpMax: 44, coinMin: 48, coinMax: 60, spawnCondition: '1分経過後、大モンスター枠から出現' },
} as const;

export const ITEMS = [
  { id: 'speed-potion-s', name: 'すばやさのポーションS', price: 250, durationSeconds: 15, description: '移動速度 +25%' },
  { id: 'attack-potion-s', name: 'こうげきのポーションS', price: 300, durationSeconds: 15, description: 'ダメージ +20%' },
  { id: 'defense-potion-s', name: 'ぼうぎょのポーションS', price: 250, durationSeconds: 15, description: '被ダメージ軽減 +20%' },
  { id: 'healing-potion-s', name: 'かいふくポーションS', price: 150, durationSeconds: 1, description: '1秒間かけてHPを50回復' },
  { id: 'muzzle', name: 'マズル', price: 40, durationSeconds: 0, description: '所持中、遠距離通常攻撃の射程+0.2' },
  { id: 'brass-knuckles', name: 'メリケンサック', price: 35, durationSeconds: 0, description: '所持中、近接通常攻撃の攻撃力+0.4' },
  { id: 'master-belt', name: '達人の帯', price: 40, durationSeconds: 0, description: '所持中、近接通常攻撃の射程+0.2' },
] as const;
export type ItemId = typeof ITEMS[number]['id'];

export const XP_REQUIREMENTS: Readonly<Record<number, number>> = {
  1: 20,
  2: 37,
  3: 57,
  4: 95,
  5: 130,
  6: 176,
};

export const XP_GROWTH_CONFIG = {
  quadratic: 4.031,
  linear: 2.979,
  constant: 13.409,
  maxLevel: 25,
} as const;

// 0.1.17の初期HP240向け成長例を、正式テーブル確定までの暫定比率として使用する。
export const HP_GROWTH_CONFIG = { linear: 0.01, quadratic: 0.0015 } as const;

export const ATTACK_GROWTH_REFERENCE: Readonly<Record<number, number>> = {
  1: 9, 2: 9, 3: 9, 4: 10, 5: 10, 6: 11, 7: 12, 8: 14, 9: 17, 10: 22, 11: 28,
  12: 32, 13: 37, 14: 42, 15: 48, 16: 55, 17: 62, 18: 70, 19: 79, 20: 88,
  21: 98, 22: 108, 23: 119, 24: 131, 25: 143,
};

export const ABILITIES: readonly AbilityDefinition[] = [
  { id: 'bubbling-guard', name: 'バブリンガル', attributes: ['水'], types: ['常時発動', '防御'], triggers: ['Always'], effects: [], status: 'playable', description: '周囲を時計回りに毎秒30度で回転するサイズ0.3の泡が、触れた遠距離攻撃を無効化する。泡は攻撃ダメージを与えない。' },
  { id: 'wandering-wisp', name: '漂う鬼火', attributes: ['炎'], types: ['常時発動', '自動攻撃'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '自身から距離0.75の左上〜右上を漂う。半径3以内の敵を探し、25/sで突進して炎ダメージ6。命中後は25/sで帰還する。攻撃CD1秒と帰還完了の両方を満たすと再攻撃する。' },
  { id: 'dash', name: 'ダッシュ', attributes: [], types: ['基本アクション'], triggers: [], effects: [], status: 'playable', description: 'Spaceで移動方向へ2.5移動する。移動時間0.2秒、CD7秒。' },
  { id: 'flame-dance', name: 'フレイムダンス', attributes: ['炎'], types: ['常時発動', '自動攻撃'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '半径2を回る3つの炎が、接触した敵へ炎ダメージ10。再ヒット間隔1秒。' },
  { id: 'ice-pick', name: 'アイスピック', attributes: ['氷'], types: ['周期発動', '自動攻撃'], triggers: ['Interval'], effects: ['Damage', 'SpawnProjectile'], status: 'playable', description: '2秒ごとに上下左右へ弾速5/s・射程5のつららを放ち、氷ダメージ12。' },
  { id: 'static-electricity', name: 'せいでんき', attributes: ['雷'], types: ['被ダメージ時発動'], triggers: ['OnDamageTaken'], effects: ['Damage'], status: 'playable', description: '被ダメージ時、自身の半径1.5へ雷ダメージ6。CD5秒。' },
  { id: 'crackle-spark', name: 'ぱちぱちスパーク', attributes: ['雷'], types: ['常時発動', '設置型'], triggers: ['Interval'], effects: ['Damage'], status: 'playable', description: '3～5秒ごとに半径4～7へ電気の粒を生成。取得すると10秒間移動速度+5%、最大5スタック。敵には0.5秒ごとに1スリップダメージ。' },
  { id: 'marine-veil', name: 'マリンベール', attributes: ['水'], types: ['防御', '被ダメージ反応'], triggers: ['OnDamageTaken'], effects: ['DamageReduction'], status: 'playable', description: '次の被ダメージを軽減する。被ダメージ軽減+60%、発動後CD10秒。' },
  { id: 'bubble-launcher', name: 'バブルランチャー', attributes: ['水'], types: ['自動攻撃', '設置型'], triggers: ['Interval'], effects: ['Damage', 'SpawnProjectile'], status: 'playable', description: '2秒ごとに5発の泡をランダムな間隔・方向へ発射。停止後は最大5秒漂い、最初に触れた敵へ水ダメージ6を与えて消滅する。' },
  { id: 'triple-shot', name: 'トリプルショット', attributes: [], types: ['通常攻撃変化'], triggers: ['OnBasicAttack'], effects: ['ModifyBasicAttack'], requires: ['ranged-basic-attack'], status: 'playable', description: '遠距離通常攻撃を中央と±30度の3発へ変更。各弾のダメージ倍率100%。' },
  { id: 'volteccer', name: 'ボルテッカー', attributes: ['雷'], types: ['ダッシュ派生', '置換'], triggers: ['OnDash'], effects: ['Damage', 'ReplaceAbility'], requires: ['dash'], status: 'playable', description: 'ダッシュを前方4・0.2秒へ置換し、移動中に触れた敵へ雷ダメージ10。CD7秒。' },
  { id: 'mega-volteccer', name: 'メガボルテッカー', attributes: ['雷'], types: ['ダッシュ派生', '置換'], triggers: ['OnDash'], effects: ['Damage', 'ReplaceAbility'], requires: ['volteccer'], status: 'playable', description: 'Spaceを全体0.3秒の稲妻状3区間移動へ置換。始点から前方5へ到達し、軌道上の敵へ雷ダメージ14。CD7秒。' },
  { id: 'double-dash', name: 'ダブルダッシュ', attributes: [], types: ['ダッシュ強化'], triggers: [], effects: ['AddCharge'], requires: ['dash'], status: 'playable', description: 'ダッシュ系能力の最大ストック数を2へ増加。使用済みストックは7秒ごとに1つずつ回復。' },
  { id: 'icicle-arrow', name: 'アイシクルアロー', attributes: ['氷'], types: ['Spaceアクション', '投射物'], triggers: [], effects: ['Damage', 'SpawnProjectile'], status: 'playable', description: 'ダッシュ未所持時に取得可能。Spaceで射程8・サイズ0.6・弾速8/sの貫通する矢を放ち、氷ダメージ12。CD8秒。' },
  { id: 'fire-punch', name: 'ファイアパンチ', attributes: ['炎'], types: ['通常攻撃追加'], triggers: ['OnBasicAttack'], effects: ['Damage'], status: 'playable', description: '近接通常攻撃の直接命中時、現在の通常攻撃力40%分の炎追加ダメージ。CD4秒。' },
  { id: 'frost-run', name: 'フロストラン', attributes: ['氷'], types: ['周期発動', '自動攻撃'], triggers: ['Interval'], effects: ['Damage'], status: 'playable', description: '5秒ごとに最寄りの敵方向へ攻撃体を送り、最大射程5の往路・2秒滞留・復路で接触中の敵へ0.5秒ごとに氷ダメージ6。' },
  { id: 'elect-road', name: 'エレクトロード', attributes: ['雷'], types: ['Spaceアクション', '設置型'], triggers: [], effects: ['Damage'], status: 'playable', description: 'ダッシュ未所持時にSpace長押しで前方5・幅2を確認し、離すと前方20へ0.5秒で道を展開。9秒滞留し、自分は移動速度+20%、敵は0.5秒ごとに1スリップダメージ。CD20秒。' },
  { id: 'surfing', name: 'サーフィン', attributes: ['水'], types: ['常時発動', 'ステータス強化'], triggers: ['Always'], effects: [], status: 'playable', description: '移動速度+10%。' },
  { id: 'boiling-flame', name: '滾る炎', attributes: ['炎'], types: ['常時発動', 'ステータス強化'], triggers: ['Always'], effects: [], status: 'playable', description: 'ダメージ+8%。' },
  { id: 'ice-storm', name: 'アイスストーム', attributes: ['氷'], types: ['常時発動', '自動攻撃'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '氷属性アビリティを3つ所持すると取得可能。周囲の3層を30個の氷粒が毎秒240°で回転し、命中時に氷ダメージ3。同じ氷粒の再ヒット間隔は1秒で、別の氷粒は独立して命中する。' },
  { id: 'critical-hit', name: 'クリティカルヒット', attributes: [], types: ['常時発動'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '急所ダメージ+100%。急所倍率が150%から250%になる。' },
  { id: 'aim-for-opening', name: '隙を狙う', attributes: [], types: ['常時発動'], triggers: ['Always'], effects: [], status: 'playable', description: '急所確率+12%。基本3%と合わせて15%。' },
  { id: 'regeneration', name: '再生力', attributes: [], types: ['常時発動'], triggers: ['Always'], effects: [], status: 'playable', description: '毎秒HPを1回復する。' },
  { id: 'logical-thinking', name: '論理的思考', attributes: [], types: ['常時発動'], triggers: ['Always'], effects: [], status: 'playable', description: 'レベルアップ時のアビリティ選択肢を1つ増やす。' },
  { id: 'weakness-exploit', name: '弱点特攻', attributes: [], types: ['常時発動'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '敵の弱点属性で攻撃したとき、さらにダメージ+50%。' },
  { id: 'freezing-wind', name: '凍える風', attributes: ['氷'], types: ['常時発動'], triggers: ['Always'], effects: [], status: 'playable', description: '半径5以内の敵へ毎秒凍結蓄積+5%。半径2以内の敵プレイヤーにはさらに+5%。' },
  { id: 'freeze-breaker', name: '凍結ブレイカー', attributes: ['氷'], types: ['常時発動'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '凍結状態の敵へのダメージ+50%。最初の一撃は凍結の1.2倍と乗算する。' },
  { id: 'soul-flame', name: 'ソウルフレイム', attributes: ['炎'], types: ['常時発動', '自動攻撃'], triggers: ['Always'], effects: ['Damage'], status: 'playable', description: '自身の後方2に魂の炎を展開し、接触中の敵へ0.5秒ごとに炎ダメージ7。' },
  { id: 'rising-tide', name: '潮が満ちる', attributes: ['水'], types: ['防御'], triggers: ['Always'], effects: ['DamageReduction'], status: 'playable', description: '毎秒1スタック蓄積し、1スタックにつき被ダメージ軽減+1%。10スタックで+40%状態へ変化し、以後は被弾ごとに1スタック消費する。' },
  { id: 'too-fast-to-see', name: '目にもとまらぬ', attributes: [], types: ['ダッシュ強化'], triggers: ['OnDash'], effects: [], requires: ['dash'], status: 'playable', description: 'ダッシュ系アクション発動時、0.5秒間無敵。' },
  { id: 'predator-form', name: 'プレデターフォルム', attributes: ['獣'], types: ['Q強化'], triggers: [], effects: ['ReplaceAbility'], characterId: 'prowler', status: 'playable', description: 'ビーストフォルムを強化。CD25秒、10秒間移動速度+20%・ダメージ+15%。効果中の撃破で残り時間延長と個別2秒の撃破トークンを得る。' },
] as const;

export const TERMS = [
  ['追加スキル', '開始時にEを選択し、後続のスキル選択でCを取得できる。Q/E/Cの最大3枠。各スキルのCDは独立して進行する。'],
  ['装備アイテム', 'マズル・メリケンサック・達人の帯は所持中に効果が働く。数字キーで消費する必要はない。'],
  ['通常攻撃', '自動で発動するキャラクター固有の基本攻撃。'],
  ['クリティカル', '基本確率3%で発生し、ダメージが1.5倍になる攻撃。対象の防御系バフを無視する。'],
  ['急所', 'クリティカルと同じ意味。急所確率や急所ダメージを上げる能力がある。'],
  ['弱点・耐性', '該当する属性のダメージは、弱点なら2倍、耐性なら半分になる。'],
  ['ダメージ+○%', '通常攻撃・スキル・アビリティなど、アウトロー自身が与えるダメージ全般への補正。'],
  ['雷ダメージ', '雷属性として分類されるダメージ。属性相性は未確定。'],
  ['帯電エリア', '6秒間残り、最初に触れたプレイヤーまたは敵へ「帯電」を1スタック付与して消滅する領域。'],
  ['帯電（ゼウス以外）', '1スタックにつき10秒間、移動速度が5%低下し、毎秒1.2ダメージを受ける状態。'],
  ['スリップダメージ', '接触中、原則0.5秒ごとに発生し、防御系効果を無視するダメージ。'],
  ['凍結蓄積', '最後の蓄積から5秒後、毎秒20%ずつ自然減衰する。100%で凍結状態へ移行し、蓄積は0%へ戻る。'],
  ['凍結', '最大3秒間移動できず、最初に受ける1回のダメージが20%増加して解除される状態。'],
  ['クールダウン', 'スキル発動時から再使用可能になるまでの時間。'],
  ['攻撃CD', '攻撃が発動した後、次の攻撃行動を開始できるまでの時間。予兆時間は含まない。'],
  ['再ヒット間隔', '同じ攻撃判定が同じ対象へ継続接触した際、再び命中できるまでの時間。原則1秒。'],
  ['射程', '弾・攻撃・オブジェクトなどが到達できる最大距離。プレイヤーの基準サイズ1.0に対する相対値。'],
  ['サイズ', '弾・炎・モンスターなど個別オブジェクトの当たり判定サイズ。アウトローの基準サイズは1.0。'],
] as const;
