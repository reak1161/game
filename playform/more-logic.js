'use strict';
globalThis.MoreLogic = {
  resolve(order) {
    let attack = 50, magic = 50, damage = 0;
    const steps = order.map(id => {
      if (id === 'train') attack += 30;
      else if (id === 'punch') { attack *= 2; damage += attack; }
      else if (id === 'wave') { magic *= 2; damage += magic; }
      else throw new Error('Unknown sample card: ' + id);
      return { id, attack, magic, damage };
    });
    return { steps, attack, magic, damage: damage + Math.max(attack, magic), final: Math.max(attack, magic) };
  },
  anger(hp, attack, damage) {
    const lost = Math.min(hp, Math.max(0, damage));
    return { hp: hp - lost, attack: attack + Math.floor(lost / 2), lost };
  },
};
