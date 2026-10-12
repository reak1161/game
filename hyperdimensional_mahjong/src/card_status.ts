import type { Card, Player, RoundEvent } from './mahjong';

export function cardEventNote(card: Card, event: RoundEvent): string {
  if (card === 'change' && event === 'trump') return 'トランプマジックでは、1〜13の筒子から変化先を選びます。';
  if (event !== 'hachiku') return '';
  if (card === 'roadroller') return '破竹の勢いでは、変化先の一筒を一索として扱います。';
  if (card === 'change') return '破竹の勢いでは、変化先の筒子を同じ数字の索子として扱います。';
  return '';
}

const once: readonly Card[] = ['change', 'borrow', 'pickup', 'near', 'roadroller', 'randomizer', 'skeleton'];

/** 効果状態の表示。現在の手番で使用できるかどうかは操作側で判定する。 */
export function cardStatus(player: Player, card: Card): string {
  const used = player.usedCards?.includes(card) ?? (player.card === card && player.used);
  if (card === 'near') return player.nearPinActive ? '発動中' : used ? '使用済み' : '未発動';
  if (card === 'skeleton' && (player.skeletonRevealed ?? 0) > 0) return `公開中・残り${player.skeletonRevealed}ツモ`;
  if (card === 'pocket') return player.pocketArmed ? '次の打牌で予約' : '繰り返し使用';
  if (card === 'akuukan' || card === 'pairFestival') return '繰り返し使用';
  if (card === 'danger') return `残り${Math.max(0, 2 - (player.dangerUses ?? 0))}回`;
  if (once.includes(card)) return used ? '使用済み' : '未使用';
  return '常時効果';
}
