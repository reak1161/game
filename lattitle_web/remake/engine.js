import { party, snake, itemDefs } from './data.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const chance = (game) => {
  game.seed = (Math.imul(game.seed, 1664525) + 1013904223) >>> 0;
  return game.seed / 4294967296;
};
const whole = (game, min, max) => min + Math.floor(chance(game) * (max - min + 1));
const log = (game, message) => { game.log.unshift(message); game.log.length = Math.min(5, game.log.length); };

export function createGame(seed = Date.now()) {
  return {
    phase: 'title', paused: false, seed: seed >>> 0, elapsed: 0, selected: 0,
    selectedItem: 'potion', log: [], hazards: [], effects: [], resultDelay: 0,
    players: party.map((base, index) => ({
      ...base, commands: base.commands.map((command) => ({ ...command })),
      hp: base.maxHp, mp: base.maxMp, gauge: 0, x: index, y: index,
      destX: index, destY: index, route: [], charge: null, guard: null,
      speedBoost: 0, immobilized: 0, silenced: 0, slip: 0,
    })),
    enemy: { ...snake, hp: snake.maxHp, mp: snake.maxMp, gauge: 0, cooldown: 0 },
    items: itemDefs.map((item) => ({ ...item })),
  };
}

export function startGame(game) {
  const next = createGame(game.seed);
  next.phase = 'battle';
  log(next, '戦闘開始。敵の予告マスを避けながら攻撃しよう。');
  return next;
}

export function actionSeconds(itg) { return 20 * 0.5 ** (itg / 100); }
export function moveSeconds(spd, distance) { return distance * 5 * 0.2 ** (spd / 100); }

export function elementMultiplier(targetElements, attackElement) {
  const table = {
    Normal: [[], [], []],
    Fire: [['Leaf', 'Ice'], ['Fire', 'Water', 'Wind'], []],
    Water: [['Fire'], ['Water', 'Leaf'], []],
    Electric: [['Water', 'Wind'], ['Electric'], ['Ground']],
    Leaf: [['Water', 'Ground'], ['Fire', 'Leaf', 'Wind'], []],
    Wind: [['Fire', 'Leaf', 'Ground'], ['Wind'], []],
    Ice: [['Leaf', 'Wind', 'Ground'], ['Fire', 'Ice'], []],
    Ground: [['Electric'], ['Ground'], ['Wind']],
  };
  const [strong, weak, immune] = table[attackElement] ?? table.Normal;
  let value = 1;
  for (const element of targetElements) {
    if (strong.includes(element)) value *= 2;
    if (weak.includes(element)) value *= 0.5;
    if (immune.includes(element)) return 0;
  }
  return value;
}

function damageRoll(game) { return whole(game, 85, 100) / 100; }

export function playerDamage(game, player, command, cost = 0) {
  let amount;
  if (command.type === 'magic') {
    const base = Math.floor(22 * (player.mp + 20) / (game.enemy.mp + 20));
    const efficiency = player.magicEfficiency;
    const a = (2 * efficiency - 100) / 100;
    const b = 100 - efficiency;
    const averageMpPercent = 100 * (player.mp - cost / 2) / player.maxMp;
    amount = Math.floor(base * (a * averageMpPercent + b) / 100);
  } else {
    amount = Math.floor(22 * (player.atk + 20) / (game.enemy.def + 20));
  }
  amount = Math.floor(amount * command.power / 50 + 5);
  amount = Math.floor(amount * elementMultiplier(game.enemy.elements, command.element));
  if (player.elements.includes(command.element)) amount = Math.floor(amount * 1.5);
  if (command.type === 'attack') {
    amount = Math.floor(amount * 2 * 0.5 ** (player.y / 1.5));
    const guard = { front: 1.5, middle: 1, back: 2 / 3 }[game.enemy.guard] ?? 1;
    amount = Math.floor(amount * guard);
  }
  return Math.max(0, Math.floor(amount * damageRoll(game)));
}

export function setRoute(game, playerIndex, cells) {
  if (game.phase !== 'battle' || game.paused) return false;
  const player = game.players[playerIndex];
  if (!player || player.hp <= 0 || player.immobilized > 0 || cells.length < 2) return false;
  const first = cells[0];
  if (first.x !== player.destX || first.y !== player.destY) return false;
  if (cells.some(({ x, y }) => x < 0 || x > 3 || y < 0 || y > 3)) return false;
  const last = cells.at(-1);
  if (game.players.some((other) => other !== player && other.hp > 0 && other.destX === last.x && other.destY === last.y)) return false;
  player.route = cells.slice(1).map(({ x, y }) => ({ x, y }));
  player.destX = last.x;
  player.destY = last.y;
  game.selected = playerIndex;
  return true;
}

function finishPlayerCommand(game, player, command) {
  if (command.type === 'attack' || command.type === 'magic') {
    const cost = command.type === 'magic' ? player.mp * command.mpPercent / 100 + command.mpFlat : 0;
    if (command.type === 'magic' && player.mp < cost) {
      player.charge = null;
      log(game, `${player.name}：MPが足りない`);
      return false;
    }
    const x = Math.round(player.x);
    if (game.enemy.hitColumns.includes(x)) {
      const damage = playerDamage(game, player, command, cost);
      game.enemy.hp = Math.max(0, game.enemy.hp - damage);
      if (command.type === 'magic') player.mp -= cost;
      log(game, `${player.name}の${command.name}！ ${damage}ダメージ`);
      game.effects.push({ kind: 'enemy', text: `-${damage}`, time: 0.9 });
    } else {
      log(game, `${player.name}の${command.name}は届かなかった`);
    }
    player.gauge = 0;
    player.charge = null;
    return true;
  }
  if (command.type === 'defense') {
    player.guard = { percent: command.reducePercent, flat: command.reduceFlat, movePercent: command.movePercent };
    player.gauge = 0;
    log(game, `${player.name}は${command.name}で身を守る`);
    return true;
  }
  if (command.type === 'item') {
    const item = game.items.find((entry) => entry.id === game.selectedItem);
    if (!item || item.count <= 0) { log(game, 'アイテムがない'); return false; }
    if (item.id === 'potion') player.hp = Math.min(player.maxHp, player.hp + 50);
    if (item.id === 'mana_potion') player.mp = Math.min(player.maxMp, player.mp + 50);
    if (item.id === 'falcon_feather') player.speedBoost = 10;
    item.count -= 1;
    player.gauge = 0;
    log(game, `${player.name}は${item.name}を使った`);
    return true;
  }
  return false;
}

export function issueCommand(game, playerIndex, commandIndex) {
  if (game.phase !== 'battle' || game.paused) return false;
  const player = game.players[playerIndex];
  const command = player?.commands[commandIndex];
  if (!command || player.hp <= 0 || player.gauge < 1000 || player.silenced > 0 || player.charge) return false;
  if (command.type === 'magic' && player.mp < player.mp * command.mpPercent / 100 + command.mpFlat) {
    log(game, `${player.name}：MPが足りない`);
    return false;
  }
  if (command.charge > 0) {
    player.charge = { commandIndex, remaining: command.charge };
    log(game, `${player.name}は${command.name}を準備中`);
    return true;
  }
  return finishPlayerCommand(game, player, command);
}

function addHazard(game, x, y, delay, label, power, effect = null) {
  game.hazards.push({ x, y, remaining: delay, total: delay, label, power, effect });
}

function enemyAction(game) {
  const roll = chance(game);
  const name = roll < 0.5 ? 'しっぽうち' : roll < 0.65 ? 'へびダッシュ' : 'しめつけ';
  if (name === 'しっぽうち') {
    const x = whole(game, 0, 3);
    for (let y = 0; y < 4; y++) addHazard(game, x, y, 5, name, 150);
  } else if (name === 'へびダッシュ') {
    for (let y = 0; y < 4; y++) {
      for (let step = 0; step < 4; step++) {
        const x = y % 2 === 0 ? step : 3 - step;
        addHazard(game, x, y, 5 + step * 0.05 + y * 0.2, name, 75);
      }
    }
  } else {
    addHazard(game, whole(game, 0, 3), whole(game, 0, 3), 5, name, 50, 'tighten');
  }
  game.enemy.gauge = 0;
  game.enemy.cooldown = 5;
  log(game, `へびが${name}を予告！ 赤いマスから移動しよう`);
}

function resolveHazard(game, hazard) {
  let hits = 0;
  for (const player of game.players) {
    if (player.hp <= 0 || Math.round(player.x) !== hazard.x || Math.round(player.y) !== hazard.y) continue;
    let amount = Math.floor(22 * (game.enemy.atk + 20) / (player.def + 20));
    if (player.guard) amount = Math.floor(amount * (100 - player.guard.percent) / 100 - player.guard.flat);
    amount = Math.floor(amount * hazard.power / 50 + 5);
    amount = Math.floor(amount * elementMultiplier(player.elements, 'Normal'));
    amount = Math.max(0, Math.floor(amount * damageRoll(game)));
    player.hp = Math.max(0, player.hp - amount);
    if (hazard.effect === 'tighten' && player.hp > 0) {
      player.immobilized = Math.max(player.immobilized, 10);
      player.silenced = Math.max(player.silenced, 10);
      player.slip = Math.max(player.slip, 10);
    }
    if (player.hp === 0) { player.route = []; player.charge = null; }
    game.effects.push({ kind: player.id, text: `-${amount}`, time: 0.9 });
    hits += 1;
  }
  if (hits) log(game, `${hazard.label}が命中！`);
}

export function advance(game, dt) {
  if (game.phase !== 'battle' || game.paused) return game;
  dt = clamp(dt, 0, 0.1);
  game.elapsed += dt;
  for (const player of game.players) {
    if (player.hp <= 0) continue;
    player.speedBoost = Math.max(0, player.speedBoost - dt);
    player.immobilized = Math.max(0, player.immobilized - dt);
    player.silenced = Math.max(0, player.silenced - dt);
    player.slip = Math.max(0, player.slip - dt);
    if (player.slip > 0) player.hp = Math.max(0, player.hp - dt);
    if (player.immobilized === 0 && player.route.length) {
      const target = player.route[0];
      const distance = Math.hypot(target.x - player.x, target.y - player.y);
      const speed = 1 / moveSeconds(player.spd, 1) * (player.guard?.movePercent ?? 100) / 100 * (player.speedBoost > 0 ? 1.5 : 1);
      const step = Math.min(distance, speed * dt);
      if (distance > 0) {
        player.x += (target.x - player.x) / distance * step;
        player.y += (target.y - player.y) / distance * step;
      }
      if (distance <= step + 0.000001) {
        player.x = target.x;
        player.y = target.y;
        player.route.shift();
      }
    }
    if (player.gauge < 1000) {
      const modifier = player.route.length ? player.movingGaugePercent / 100 : 1;
      player.gauge = Math.min(1000, player.gauge + dt * 1000 / actionSeconds(player.itg) * modifier);
    } else {
      player.guard = null;
    }
    player.mp = Math.min(player.maxMp, player.mp + player.mpRegen * dt);
    if (player.charge) {
      player.charge.remaining -= dt;
      if (player.charge.remaining <= 0) finishPlayerCommand(game, player, player.commands[player.charge.commandIndex]);
    }
  }
  game.enemy.mp = Math.min(game.enemy.maxMp, game.enemy.mp + game.enemy.mpRegen * dt);
  game.enemy.gauge = Math.min(1000, game.enemy.gauge + dt * 1000 / actionSeconds(game.enemy.itg) * (game.enemy.cooldown > 0 ? 0.1 : 1));
  game.enemy.cooldown = Math.max(0, game.enemy.cooldown - dt);
  if (game.enemy.gauge >= 1000 && game.enemy.hp > 0) enemyAction(game);
  for (const hazard of game.hazards) hazard.remaining -= dt;
  const expired = game.hazards.filter((hazard) => hazard.remaining <= 0);
  game.hazards = game.hazards.filter((hazard) => hazard.remaining > 0);
  for (const hazard of expired) resolveHazard(game, hazard);
  for (const effect of game.effects) effect.time -= dt;
  game.effects = game.effects.filter((effect) => effect.time > 0);
  if (game.enemy.hp <= 0 || game.players.every((player) => player.hp <= 0)) {
    game.resultDelay += dt;
    if (game.resultDelay >= 1.5) {
      game.phase = game.enemy.hp <= 0 ? 'clear' : 'over';
      log(game, game.phase === 'clear' ? '勝利！' : '敗北……');
    }
  }
  return game;
}
