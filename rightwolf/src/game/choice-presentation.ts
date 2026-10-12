import { normalDamageAmount } from './engine'
import { cardOf } from './cards'
import type { ChoicePresentation, GameState, PendingChoice } from './types'
import { livingCount } from './v03-rules'

// Only the responding player receives these descriptions. No queue or hidden cards
// are copied into the presentation, and a forecast stops at the current effect.
export function describeChoice(game: GameState, choice: PendingChoice): ChoicePresentation {
  const self = game.players.find(p => p.id === choice.playerId)!
  const source = game.players.find(p => p.id === choice.sourceId)!
  const target = game.players.find(p => p.id === choice.targetId)
  const result: ChoicePresentation = { summary: '', options: {} }
  const hpResult = (amount: number) => `HP ${self.hp} → ${Math.max(0, self.hp - amount)}（${amount}ダメージ）${amount >= self.hp && self.hp > 0 ? '。死亡時の効果はこの後に解決' : ''}`
  switch (choice.kind) {
    case 'DEFENSE': {
      const amount = choice.task?.value ?? 0
      if (choice.sourceCard && cardOf(choice.sourceCard).attack !== undefined) result.sourceRank = String(amount)
      result.summary = `${source.name}から${amount}の通常ダメージ · 今回の1ヒット`
      result.skipLabel = '使用しない'
      result.skip = hpResult(normalDamageAmount(game, source.id, self.id, amount, true))
      for (const option of choice.options) {
        result.options[option.id] = option.card?.cardId === 'trap'
          ? `反撃：${source.name}へ${normalDamageAmount(game, self.id, source.id, 2)}ダメージ。今回の攻撃は残る。使用後は捨て札へ`
          : `この1ヒットを無効化。HP ${self.hp} → ${self.hp}。使用後は捨て札へ`
      }
      break
    }
    case 'DEMAND':
      result.summary = `${source.name}へ手札を1枚渡すか、拒否する`
      result.skipLabel = '拒否する'
      result.skip = hpResult(normalDamageAmount(game, source.id, self.id, 3))
      for (const option of choice.options) result.options[option.id] = `「${option.label}」を${source.name}へ渡す。HP ${self.hp} → ${self.hp}`
      break
    case 'TRADE':
      result.summary = `${target?.name ?? source.name}と選んだ枚数の手札を交換する。受け取るカードは相手が選ぶ`
      result.skipLabel = '交換しない'; result.skip = '手札は変わらない'
      for (const option of choice.options) result.options[option.id] = `「${option.label}」を交換に出す`
      break
    case 'VOTE':
      result.summary = '選んだ手札を捨て、同じ枚数分を指定した相手に投票。最多得票者全員に7の通常ダメージ'
      result.skipLabel = '投票しない'; result.skip = '手札を捨てず、0票で進む。自分が最多得票者になる可能性は残る'
      for (const option of choice.options) result.options[option.id] = `「${option.label}」を捨てて1票`
      break
    case 'DRAW':
      result.summary = choice.amount === -1 ? '選択順に山札の一番上から戻す' : '選んだカードが手札に加わる。残りは次に山札へ戻す順番を選ぶ'
      for (const option of choice.options) result.options[option.id] = choice.amount === -1 ? '選択番号の位置へ戻す（1番が山札の一番上）' : '手札に加える'
      break
    case 'RECOVER':
      result.summary = `${target?.name ?? '対象'}の捨て札から、自分の手札へ加える`
      for (const option of choice.options) result.options[option.id] = '捨て札から手札へ移す'
      break
    case 'GUARD':
      result.summary = '次の自分のターン開始まで、選んだ相手を攻撃カードのダメージから守る'
      for (const option of choice.options) result.options[option.id] = `${option.label}を護衛してターンを終了`
      break
    case 'SEER':
      result.summary = '選んだ相手の役職を強制開示する。通常のCO時能力は発動しない'
      for (const option of choice.options) result.options[option.id] = `${option.label}の役職を公開。呪われ人形の強制開示時能力は発動する`
      break
    case 'ASSASSIN': {
      const killing = livingCount(game) >= 3
      result.summary = killing ? '選んだ相手を殺害する。HPダメージではない' : '選んだ相手の手札をすべて捨てさせる'
      result.skipLabel = '見送る'; result.skip = '殺害せずに進む'
      for (const option of choice.options) result.options[option.id] = `${option.label}${killing ? 'を殺害（無効化・反転・死亡時の効果があれば解決）' : 'の手札をすべて捨てる（効果無効化は適用）'}`
      break
    }
    case 'LOVE_TARGET': case 'CHANGE_LOVE':
      result.summary = '愛する人の勝利と連動する'
      result.skipLabel = '変更しない'
      for (const option of choice.options) result.options[option.id] = `${option.label}を愛する人にする${choice.kind === 'CHANGE_LOVE' ? ' · 元の相手へ3ダメージ' : ''}`
      break
    case 'REDIRECT':
      result.summary = '行動の対象を変更する'
      for (const option of choice.options) result.options[option.id] = `${option.label}へ対象を変更`
      break
    case 'INTERRUPT':
      result.summary = '行動への誘発'
      result.skipLabel = '使用しない'; result.skip = '元の行動を解決する'
      for (const option of choice.options) result.options[option.id] = option.card?.cardId === 'wolfSkin' ? '発言を無効化 · 攻撃力+1を失う' : option.card?.cardId === 'counterG' ? '発言の使用者と対象を反転する' : '行動の対象を別の人へ変更する'
      break
    case 'DAMAGE_RESPONSE': {
      const raw = choice.task?.value ?? 0
      result.summary = `${source.name}から${raw}の通常ダメージ`
      result.skipLabel = '使用しない'; result.skip = hpResult(normalDamageAmount(game, source.id, self.id, raw, choice.task?.attack))
      for (const option of choice.options) {
        const returned = option.card?.cardId === 'deflect' ? Math.floor(raw / 2) : option.card?.cardId === 'counterB' ? 2 : 1
        const received = option.card?.cardId === 'deflect' ? raw - returned : 0
        result.options[option.id] = `自分${normalDamageAmount(game, source.id, self.id, received, choice.task?.attack)} · ${source.name}へ${normalDamageAmount(game, self.id, source.id, returned)}ダメージ`
      }
      break
    }
    case 'SILENCE':
      result.summary = `${source.name}のターンを終了する`
      result.skipLabel = '使用しない'; result.skip = '補充後のターンを続ける'
      for (const option of choice.options) result.options[option.id] = '自分のターンを開始 · 相手の補充カードは保持'
      break
    case 'SCISSORS':
      result.summary = '裏向きの手札を1枚捨てさせ、公開後に数値を計算する'
      for (const option of choice.options) result.options[option.id] = '選んだ裏向きカードを公開して捨てる'
      break
    case 'CROW_ORDER':
      result.summary = '①が山札の一番上'
      for (const option of choice.options) result.options[option.id] = 'この順番で山札へ戻す'
      break
    case 'CROW_HAND':
      result.summary = '選んだ手札を捨て、同じ枚数引く'
      result.skipLabel = '入れ替えない'; result.skip = '手札を維持する'
      for (const option of choice.options) result.options[option.id] = '捨てて1枚引く'
      break
    case 'RESCUE':
      result.summary = '死亡時に発動する手札を選ぶ'
      result.skipLabel = '使用せず死亡する'; result.skip = 'HP 0・死亡になる'
      for (const option of choice.options) result.options[option.id] = option.card?.cardId === 'prayer'
        ? `HP ${self.hp} → ${Math.min(self.maxHp, self.hp + 5)}。死亡を回避し、カードは捨て札へ`
        : `HP ${self.hp} → ${Math.max(1, self.hp)}。今回の死亡を無効化し、カードは捨て札へ`
      break
    case 'ORDER':
      result.summary = '選択番号の順に効果を解決する。途中でHPや生存状態が変わる可能性がある'
      for (const option of choice.options) {
        const effect = game.effects?.find(e => e.id === option.id)
        result.options[option.id] = effect?.kind === 'DELAY' ? `${effect.value ?? 10}の通常ダメージを解決（防御は発動時に選択）` : effect?.kind === 'HOPE' ? '所有者が強制死亡する' : 'この期間効果が終了する'
      }
      break
  }
  return result
}
