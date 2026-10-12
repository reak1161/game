import type { CardDefinition, CardInstance, ExpansionSet } from './types'
import { EXPANSION_CARDS } from './v03-cards'

const definitions: CardDefinition[] = [
  { id: 'citizen', name: '市民', kind: 'ROLE', roleEffect: 'NONE', count: 2, description: 'CO後、ゲーム中に1度だけ発言カードを2回分使用できる。' },
  { id: 'wolf', name: '人狼', kind: 'ROLE', roleEffect: 'WOLF', count: 2, description: 'CO時、次の自分のターンの初めまで全ステータス1/2。CO中、攻撃力は昼2倍・夜3倍、最大HP+2。' },
  { id: 'seer', name: '占い師', kind: 'ROLE', roleEffect: 'SEER', description: 'CO時、誰か1人の役職を強制開示する。ゲーム中に1度、誰か1人の手札をすべて見る。' },
  { id: 'medium', name: '霊媒師', kind: 'ROLE', roleEffect: 'MEDIUM', description: 'CO中、呪われ人形に殺害されない。誰かを殺害するたび攻撃力+100%を永続的に得る。' },
  { id: 'knight', name: '騎士', kind: 'ROLE', roleEffect: 'KNIGHT', description: 'CO中、ターン終了時に誰か1人を護衛。攻撃カードによるダメージを防ぐ。同じ人を連続で護衛できない。自分も選べる。' },
  { id: 'assassin', name: '暗殺者', kind: 'ROLE', roleEffect: 'ASSASSIN', description: 'CO時、生存者が3人以上なら誰か1人を殺害できる。殺害できない場合は誰か1人の手札をすべて捨てさせる。強制開示では発動しない。' },
  { id: 'doll', name: '呪われ人形', kind: 'ROLE', roleEffect: 'DOLL', description: 'CO時、次の自分のターンの初めまで全ステータス1/2。占い師の強制開示時は占い師に5、自分に3の通常ダメージ。伏せ状態で殺害されると反転し、殺害者のHPを得る。' },
  ...Array.from({ length: 4 }, (_, i): CardDefinition => ({ id: `twins${i + 1}`, name: `アタックLV.${i + 1}／ディフェンスLV.${i + 1}`, kind: 'TWINS', attack: i + 1, defense: i + 1, target: 'ONE', description: `次のうちどれか選ぶ：誰か1人へ${i + 1}の通常ダメージ／設置し、攻撃による${i + 1}以下の通常ダメージを1ヒット無効化。発動時に捨てる。` })),
  { id: 'forceArrow', name: 'フォースアロー／ディフェンスLV.5', kind: 'TWINS', attack: 1, hits: 4, defense: 5, target: 'ONE', description: '次のうちどれか選ぶ：誰か1人へ1の通常ダメージ×4回／設置し、攻撃による5以下の通常ダメージを1ヒット無効化。' },
  { id: 'multiAttack', name: 'マルチアタック／エレメントディフェンス', kind: 'TWINS', attack: 2, hits: 2, defense: 2, target: 'ONE', description: '次のうちどれか選ぶ：誰か1人へ2の通常ダメージ×2回／次の自分のターンの初めまで2以下の通常ダメージをすべて防ぐ。' },
  { id: 'consider', name: '考察の構え', kind: 'STATEMENT', count: 2, target: 'SELF', description: '山札上4枚を自分だけ確認し、2枚を手札へ加える。残りを好きな順で山札の一番上へ戻す。' },
  { id: 'retract', name: '前言撤回', kind: 'STATEMENT', count: 2, target: 'SELF', description: '自分のCOを取り消し、公開中の役職を山札へ加えてシャッフルする。役職スロットは空になる。' },
  { id: 'treatment', name: '適切な治療', kind: 'STATEMENT', count: 2, target: 'ONE', description: '誰か1人のHPを4回復する。次の自分のターンの初めまで、その人が受ける通常ダメージ-1。' },
  { id: 'howl', name: '人狼の雄叫び', kind: 'STATEMENT', count: 2, unresolved: true, target: 'ALL', description: 'すべての人狼の攻撃力を次の自分のターンの初めまで2倍にし、HPを2回復する。伏せ役職の参照範囲は確認中。' },
  { id: 'refute', name: '論破', kind: 'STATEMENT', count: 2, target: 'SELF', description: '次の生存プレイヤーは、次の自分のターンの初めまで何もできない。' },
  { id: 'eloquence', name: '巧みな話術', kind: 'STATEMENT', count: 2, target: 'SELF', description: '次の自分のターンの初めまで、自分に対する発言カードを無効化し、受ける通常ダメージ-1。' },
  { id: 'renew', name: '忘却と新造', kind: 'STATEMENT', count: 2, target: 'SELF', description: '手札をすべて捨て、捨てた枚数+2枚を引く。手札上限を超えて保持できる。' },
  { id: 'parrot', name: '鸚鵡返し', kind: 'STATEMENT', count: 2, unresolved: true, description: '前のプレイヤーが前回捨てたカードをすべて手札へ加える。旧文章の確認中。' },
  { id: 'trade', name: '取り引き', kind: 'STATEMENT', count: 2, target: 'ONE', description: '誰か1人を選び、好きな枚数の手札を交換する。手札上限超過可能。' },
  { id: 'torture', name: '拷問', kind: 'STATEMENT', count: 2, target: 'ONE', description: '誰か1人の現在HPを半分まで減らす（切り捨て）。HP減少なので通常の防御では防げない。' },
  { id: 'vote', name: '投票', kind: 'STATEMENT', count: 2, target: 'ALL', description: '全員が手札を好きな枚数捨て、その枚数分を誰か1人へ投票する。最多得票者全員に7の通常ダメージ。' },
  { id: 'roleSwap', name: '役職操作', kind: 'STATEMENT', count: 2, target: 'TWO', description: 'プレイヤー2人の役職を、伏せ／CO状態ごと交換する。CO時能力は再発動しない。' },
  { id: 'citizenship', name: '市民権', kind: 'STATEMENT', unresolved: true, target: 'ALL', description: '次の自分のターン終了時まで、すべての市民の手札上限+1、最大HP+2。自分のHPを2回復。伏せ役職の参照範囲は確認中。' },
  { id: 'cooling', name: 'クーリングオフ', kind: 'STATEMENT', target: 'ALL', description: '全員の手札・捨て札・使用したカードを山札へ戻してシャッフルし、全員2枚引く。このカードは山札の一番下へ置く。' },
  { id: 'prayer', name: '巫女の願い', kind: 'STATEMENT', target: 'SELF', description: '次の自分のターンの初めまで自分に対する効果を無効化。手札からの誘発：死亡時にHPを5回復し、死亡条件を外れれば死亡しない。' },
  { id: 'countdown', name: '死へのカウントダウン', kind: 'STATEMENT', unresolved: true, target: 'ONE', description: '誰か1人は自分のターン終了時に2の通常ダメージ。設置形式は確認中。' },
  { id: 'memoir', name: '色褪せた手記', kind: 'STATEMENT', target: 'ONE', description: '誰か1人の捨て札から2枚を手札へ加える。このカード自身は選べない。' },
  { id: 'demand', name: '強欲な提案', kind: 'STATEMENT', target: 'ALL', description: '他の全員に手札を1枚要求する。相手は拒否でき、拒否した人に3の通常ダメージ。' },
  { id: 'quarrel', name: '喧嘩両成敗', kind: 'STATEMENT', target: 'ALL', description: '全員に使用者の現在HPの半分の通常ダメージ（切り捨て）。その後、自分以外の全員に1の通常ダメージ。' },
  { id: 'unbounded', name: '縦横無尽', kind: 'ATTACK', count: 2, attack: 3, target: 'ALL', description: 'CO済みのプレイヤー全員に3の通常ダメージ。自分もCO済みなら含む。' },
  { id: 'accel', name: 'アクセルブースト', kind: 'ATTACK', count: 2, attack: 0, target: 'ONE', description: '誰か1人へ、このカードを除いた現在手札枚数分の通常ダメージ。' },
  { id: 'reprieve', name: '残虐な猶予', kind: 'ATTACK', attack: 10, target: 'ONE', description: '誰か1人の2ターン後の終了時に10の通常ダメージ。使用者死亡後も予約は残る。' },
  { id: 'dragon', name: '龍神の咆哮', kind: 'ATTACK', attack: 0, unresolved: true, description: 'このターンに使用した攻撃・防御カード枚数分の通常ダメージ。自身を数えるか確認中。' },
  { id: 'thunder', name: '青天の霹靂', kind: 'ATTACK', attack: 0, unresolved: true, description: '場の人数分の通常ダメージを他の全員へ、自分に1の通常ダメージ。人数の条件を確認中。' },
  { id: 'lightning', name: 'ライトニングレシーブ', kind: 'ATTACK', attack: 0, target: 'ONE', description: '誰か1人へ、このターンに使用した発言カード枚数分の通常ダメージ。' },
  { id: 'doubleEdge', name: '諸刃の剣', kind: 'ATTACK', attack: 0, target: 'ONE', description: '1〜5から数値を選び、対象と自分の双方へその値の通常ダメージ。' },
  { id: 'brand', name: '混血の烙印', kind: 'ATTACK', attack: 0, target: 'ONE', description: '誰か1人のHPを3減らす。通常ダメージでも攻撃力補正の対象でもない。' },
  { id: 'sheep', name: '屠所の羊', kind: 'ATTACK', attack: 20, target: 'ALL', description: 'HP2以下の全員に20の通常ダメージ。' },
  { id: 'slash', name: '乱れ斬り', kind: 'ATTACK', attack: 2, hits: 2, target: 'ALL', description: '全員に2の通常ダメージ×2回。各ヒット独立、死亡・仮死で残りを終了。' },
  { id: 'cyclone', name: 'アジェットサイクロン', kind: 'ATTACK', attack: 0, target: 'ONE', description: '対象の捨て札枚数−自分の捨て札枚数を計算。正なら対象へ、負なら自分へ絶対値分の通常ダメージ。' },
  { id: 'burst', name: '瞬間火力', kind: 'ATTACK', attack: 5, target: 'ONE', description: '誰か1人に5の通常ダメージ。その後、自分のHPを3減らす。' },
  { id: 'justGuard', name: 'ジャストガード', kind: 'DEFENSE', defense: 3, target: 'SELF', description: '設置型。攻撃による3以上の通常ダメージを1ヒット無効化し、捨てる。' },
  { id: 'trap', name: 'トラップ', kind: 'DEFENSE', defense: 0, target: 'SELF', description: '設置型。攻撃を受けたとき、攻撃者へ2の通常ダメージを与え、捨てる。攻撃のダメージが0でも発動できる。' },
  { id: 'wall', name: 'ウォールバリア', kind: 'DEFENSE', defense: 0, target: 'SELF', description: '次の自分のターン終了時まで、通常ダメージを受けず、与えられない。HP減少は防げない。' },
  { id: 'miracle', name: '奇跡の盾', kind: 'DEFENSE', defense: 0, target: 'ONE', description: '誰か1人を選ぶ。次の自分のターンの初めまで、その人から受けるすべての通常ダメージを無効化。' },
  { id: 'hope', name: '一縷の希望', kind: 'DEFENSE', defense: 0, target: 'SELF', description: '常時設置：通常ダメージを無効化し、次の自分のターン終了時に強制死亡。手札からの誘発：5以上のダメージか攻撃以外の能力による死亡を1回無効化（自身の強制死亡を除く）。' },
]

// Compatibility IDs for saved fixtures; these are not part of the v0.2 deck.
const legacy: CardDefinition[] = [1, 2, 3].map(n => ({ id: `attack${n}`, name: `アタックLV.${n}`, kind: 'ATTACK', attack: n, target: 'ONE', description: `誰か1人へ${n}の通常ダメージ。` }))
legacy.push(...[1, 2].map((n): CardDefinition => ({ id: `defense${n}`, name: `ディフェンスLV.${n}`, kind: 'DEFENSE', defense: n, target: 'SELF', description: `設置型。攻撃による${n}以下の通常ダメージを1ヒット無効化する。` })))
export const CARD_LIBRARY = Object.fromEntries([...definitions, ...EXPANSION_CARDS, ...legacy].map(card => [card.id, card]))
export const BASIC_CARDS = definitions
export const ALL_CARDS = [...definitions, ...EXPANSION_CARDS]
export const BASIC_CARD_COUNT = definitions.reduce((sum, card) => sum + (card.count ?? 1), 0)
export const PLAYABLE_CARD_COUNT = ALL_CARDS.filter(card => !card.unresolved).reduce((sum, card) => sum + (card.count ?? 1), 0)

export function shuffle<T>(cards: T[], random = Math.random): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

export function createDeck(random = Math.random, sets: ExpansionSet[] = ['FOREST', 'MOON']): CardInstance[] {
  let serial = 0
  return shuffle(ALL_CARDS.filter(card => !card.unresolved && (!card.set || sets.includes(card.set))).flatMap(card => Array.from({ length: card.count ?? 1 }, () => ({ uid: `card-${++serial}`, cardId: card.id }))), random)
}

export function cardOf(instance: CardInstance): CardDefinition {
  const card = CARD_LIBRARY[instance.cardId]
  if (!card) throw new Error(`不明なカードです: ${instance.cardId}`)
  return card
}
