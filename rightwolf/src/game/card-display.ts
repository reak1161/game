import { cardOf } from './cards'
import { attackBaseValue, attackValue } from './engine'
import type { CardInstance, GameState, PlayCardInput, Player } from './types'

export function cardAttackDisplay(game: GameState, player: Player, instance: CardInstance, targetId?: string, amount?: number, mode?: PlayCardInput['mode']) {
  const card = cardOf(instance)
  if (card.attack === undefined || card.unresolved) return undefined
  if (card.id === 'brand') return { rank: '3', description: 'HPを3減少（攻撃力補正なし）' }
  if (card.id === 'scissors') return { rank: '?', description: '選んで公開した手札の本文数値で決まる' }
  if (card.id === 'affection' && mode === 'BOTH') return { rank: 'HP1', description: '自分と対象のHPを1にする（通常ダメージではない）' }
  if (card.id === 'rain' && amount === undefined) return { rank: '?', description: 'HP減少量と対象への配分を選ぶ' }
  const base = attackBaseValue(player, card, game.players.find(p => p.id === targetId), amount, true)
  if (base === undefined) return card.id === 'doubleEdge'
    ? { rank: '1–5', description: '基礎値1〜5から選択' }
    : { rank: '?', description: '対象の捨て札枚数で変動' }
  const value = attackValue(game, player, Math.abs(base))
  const selfHit = card.id === 'cyclone' && base < 0
  return { rank: `${selfHit ? '↶' : ''}${value}`, description: `${selfHit ? '自分へ' : ''}${value}の通常ダメージ${card.hits ? ` × ${card.hits}ヒット` : ''}（防御・軽減の適用前）` }
}
