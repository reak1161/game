// Values are transcribed from the prototype CSV files. The original files stay untouched.
export const party = [
  {
    id: 'mao', name: 'まお', sprite: 'player_001/blue_man.png', color: '#69a9ff',
    maxHp: 500, atk: 300, def: 120, maxMp: 50, mpRegen: 0, magicEfficiency: 100,
    spd: 100, itg: 100, movingGaugePercent: 50, elements: ['Normal'],
    commands: [
      { type: 'attack', name: 'たいあたり', power: 50, charge: 0, element: 'Normal' },
      { type: 'attack', name: 'とつげき', power: 120, charge: 1, element: 'Normal' },
      { type: 'magic', name: 'ファイア', power: 100, charge: 0, element: 'Fire', mpPercent: 10, mpFlat: 30 },
      { type: 'item', name: 'アイテム' },
    ],
  },
  {
    id: 'sho', name: 'しょう', sprite: 'player_002/red_man.png', color: '#ff7676',
    maxHp: 300, atk: 67, def: 85, maxMp: 250, mpRegen: 0, magicEfficiency: 100,
    spd: 76, itg: 80, movingGaugePercent: 30, elements: ['Fire'],
    commands: [
      { type: 'attack', name: 'たいあたり', power: 50, charge: 0, element: 'Normal' },
      { type: 'defense', name: 'てっぺき', reducePercent: 50, reduceFlat: 0, movePercent: 30 },
      { type: 'magic', name: 'ファイア', power: 100, charge: 0, element: 'Fire', mpPercent: 10, mpFlat: 30 },
      { type: 'item', name: 'アイテム' },
    ],
  },
  {
    id: 'ponkichi', name: 'ぽんきち', sprite: 'player_003/green_man.png', color: '#81da96',
    maxHp: 330, atk: 130, def: 120, maxMp: 50, mpRegen: 0, magicEfficiency: 100,
    spd: 200, itg: 50, movingGaugePercent: 20, elements: ['Electric', 'Wind'],
    commands: [
      { type: 'attack', name: 'でんこうせっか', power: 75, charge: 0, element: 'Electric' },
      { type: 'attack', name: 'しっぷうじんらい', power: 75, charge: 0, element: 'Wind' },
      { type: 'defense', name: 'ガード', reducePercent: 30, reduceFlat: 0, movePercent: 50 },
      { type: 'item', name: 'アイテム' },
    ],
  },
  {
    id: 'masayoshi', name: 'まさよし', sprite: 'player_004/yellow_man.png', color: '#f5d86e',
    maxHp: 300, atk: 80, def: 60, maxMp: 150, mpRegen: 1, magicEfficiency: 100,
    spd: 80, itg: 200, movingGaugePercent: 50, elements: ['Water'],
    commands: [
      { type: 'magic', name: 'かみなり', power: 100, charge: 0, element: 'Electric', mpPercent: 10, mpFlat: 30 },
      { type: 'magic', name: 'だくりゅう', power: 100, charge: 0, element: 'Water', mpPercent: 10, mpFlat: 30 },
      { type: 'magic', name: 'ファイア', power: 100, charge: 0, element: 'Fire', mpPercent: 10, mpFlat: 30 },
      { type: 'item', name: 'アイテム' },
    ],
  },
];

export const snake = {
  name: 'へび', sprite: 'enemy_001/snake.png', maxHp: 1200, atk: 300, def: 400,
  maxMp: 100, mpRegen: 1, itg: 200, elements: ['Ground'], guard: 'middle', hitColumns: [0, 1, 2, 3],
};

export const itemDefs = [
  { id: 'potion', name: 'ポーション', count: 5, sprite: 'potion.png', description: 'HPを50回復' },
  { id: 'mana_potion', name: 'マナポーション', count: 3, sprite: 'mana_potion.png', description: 'MPを50回復' },
  { id: 'falcon_feather', name: 'ハヤブサの羽', count: 2, sprite: 'falcon_feather.png', description: '10秒間、移動速度が上がる' },
];
