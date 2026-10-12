import type { Settings, RoundEvent, LocalYaku, SpecialYaku, DoubleYakuman } from './mahjong';

export type YakuCategory = 'normal' | 'local' | 'special';
export type YakuInfo = { category: YakuCategory; status: 'enabled' | 'disabled' | 'unavailable'; han: string; reason: string; tab?: string };
const locals: Record<string, LocalYaku> = { 人和: 'renhou', 大車輪: 'daisharin', 大七星: 'daichisei', 十三不塔: 'shiisantou', 四連刻: 'suurenko' };
const specials: Record<string, SpecialYaku> = { 同一色: 'sameColor', 三同刻: 'sameTriplet3', 四同刻: 'sameTriplet4', 超一気通貫: 'superStraight', 十三連宝燈: 'lantern', 三連子: 'sanrenko', 一色三連: 'isshokusanren' };
const doubles: Record<string, DoubleYakuman> = { 国士無双十三面待ち: 'kokushi13', 四暗刻単騎: 'suankoTanki', 純正九蓮宝燈: 'junseiChuuren', 大四喜: 'daisuushii' };
const memoryExcluded = new Set(['立直', '一発', 'ダブル立直', 'オープンリーチ', '海底摸月', '河底撈魚', '嶺上開花', '槍槓', '平和', '天和', '地和', '人和', '十三不塔', '七対子', '大車輪', '大七星', '国士無双', '国士無双十三面待ち', '三槓子', '四槓子', 'オープンリーチ放銃', '三連子', '一色三連']);
const trumpExcluded = new Set(['役牌', '小三元', '大三元', '小四喜', '大四喜', '字一色', '混一色', '混老頭', '混全帯幺九', '大七星', '国士無双', '国士無双十三面待ち', '九蓮宝燈', '純正九蓮宝燈']);

/** Configured availability, not a promise that the current hand satisfies a role. */
export function yakuInfo(name: string, baseHan: string, rules: Settings, event: RoundEvent): YakuInfo {
  const nPairs = /^[八九十]+対子$/.test(name) || /^(十一|十二|十三|十四)対子$/.test(name);
  const category: YakuCategory = locals[name] ? 'local' : specials[name] || nPairs ? 'special' : 'normal';
  const info: YakuInfo = { category, status: 'enabled', han: baseHan, reason: 'この対局で有効です。成立には各役の条件を満たす必要があります。' };
  if (name === '三槓子') { info.han = rules.kanYakuEnhanced === false ? '2翻' : '13翻'; info.tab = rules.kanYakuEnhanced === false ? '2翻' : '役満'; }
  if (name === '四槓子') info.han = rules.kanYakuEnhanced === false ? '13翻' : '26翻';
  if (doubles[name]) {
    info.han = rules.doubleYakuman?.[doubles[name]] === false ? '13翻' : '26翻';
    info.reason = rules.doubleYakuman?.[doubles[name]] === false ? 'ダブル役満がOFFのため、通常の役満として13翻で計算します。' : 'ダブル役満がONのため、26翻で計算します。';
  }
  const disabled = locals[name] && !rules.localYaku?.[locals[name]]
    || specials[name] && rules.specialYaku?.[specials[name]] === false
    || (name === 'オープンリーチ' || name === 'オープンリーチ放銃') && !rules.openRiichi;
  if (disabled) return { ...info, status: 'disabled', reason: '対局設定でOFFになっています。' };
  if ((name === '超一気通貫' || name === '十三連宝燈') && event !== 'trump') return { ...info, status: 'unavailable', reason: 'トランプマジックの局で使用します。' };
  if (event === 'trump' && trumpExcluded.has(name)) return { ...info, status: 'unavailable', reason: 'トランプマジックでは字牌を使わず、1～13の牌体系になります。字牌を必要とする役、国士無双、通常の九蓮宝燈は対象外です。' };
  if (event === 'memory' && (memoryExcluded.has(name) || nPairs)) return { ...info, status: 'unavailable', reason: '神経衰弱では獲得した4面子と雀頭を使い、通常の打牌・立直・カンを行わないため、この役は対象外です。' };
  return info;
}
