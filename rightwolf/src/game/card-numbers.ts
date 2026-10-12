// Numeric occurrences in the design's card-effect body, not the abbreviated UI
// description. Headings, copy counts, examples and Web UI instructions are excluded.
// Signs and fractions retain their numeric value; repeated occurrences count again.
export const CARD_EFFECT_NUMBERS: Record<string, number[]> = {
  citizen: [1, 2], wolf: [.5, 2, 3, 2], seer: [1, 1, 1], medium: [100, 100], knight: [1], assassin: [3, 1, 1], doll: [.5, 5, 3],
  twins1: [1, 1, 1], twins2: [2, 2, 1], twins3: [3, 3, 1], twins4: [4, 4, 1], forceArrow: [1, 1, 4, 5, 1], multiAttack: [1, 2, 2, 2],
  consider: [4, 2, 2], retract: [], treatment: [1, 4, -1], howl: [2, 2], refute: [], eloquence: [-1], renew: [2], parrot: [], trade: [1], torture: [1],
  vote: [1, 7, 1, 1, 7], roleSwap: [2], citizenship: [1, 2, 2], cooling: [2], prayer: [5], countdown: [1, 2], memoir: [1, 2], demand: [1, 3], quarrel: [1],
  unbounded: [3], accel: [1], reprieve: [1, 2, 10], dragon: [1], thunder: [1, 1], lightning: [1], doubleEdge: [1, 1, 5], brand: [1, 3], sheep: [2, 20], slash: [2, 2], cyclone: [1], burst: [1, 5, 3],
  justGuard: [3, 1], trap: [2, 0], wall: [], miracle: [1], hope: [5],
  redHood: [10, 1], lover: [3, 1], catVoice: [1], burningLove: [1], fickle: [3, 2, 1], stone: [1, 1, 1], basket: [1, 3, 4], cakeWine: [1, 7, 7, 1, 3],
  hunt: [1, 5, 1, 5, 2, 3, 2], affection: [1, 1, 1, 1, 1], scissors: [1, 1, 2, 0], temptation: [1], wolfSkin: [1, 1],
  fox: [.5], vampire: [.5, 1, .5], reverseTime: [1, 3, 1, 1, 2, 2, 1], whiteCandle: [2], blackCandle: [2], crow: [5], fate: [], danger: [1, 1, 1], scales: [2],
  crucifix: [1, 5, 5, 5], comeback: [], silence: [], sunrise: [2, 1, 3], whiteNight: [1, 3, -1, 0, 2, -1], vampirePlay: [1, 2], resolve: [2, 1], rain: [],
  foxFur: [-4, 0], virus: [1, 1], counterA: [1], counterB: [3, 2], counterG: [], deflect: [2, 1],
  attack1: [1, 1], attack2: [1, 2], attack3: [1, 3], defense1: [1, 1], defense2: [2, 1],
}

export function sumCardEffectNumbers(cardId: string): number {
  const numbers = CARD_EFFECT_NUMBERS[cardId]
  if (!numbers) throw new Error(`カード本文の数値定義がありません: ${cardId}`)
  return numbers.reduce((sum, number) => sum + number, 0)
}
