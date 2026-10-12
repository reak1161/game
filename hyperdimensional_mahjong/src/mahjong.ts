export type Suit = 'm' | 'p' | 's' | 'z';
export type Special = 'knockout' | 'rainbow' | 'musou' | 'shochikubai' | 'purify' | 'ichigo' | 'pure' | 'drumming' | 'irregular' | 'zombie' | 'destiny' | 'trap' | 'triplet';
export type Card = 'seitenjo' | 'menzen' | 'early' | 'change' | 'borrow' | 'pickup' | 'nail' | 'ride' | 'damascus' | 'multipai' | 'foresight' | 'near' | 'akuukan' | 'countdown' | 'dancer' | 'roadroller' | 'randomizer' | 'yakumanBody' | 'danger' | 'machinegun' | 'pocket' | 'ultimate' | 'skeleton' | 'highRisk' | 'oni' | 'tanyao32000' | 'gekokujou' | 'dragonPairs' | 'nakimushi' | 'pairFestival';
export type Tile = { id: number; kind: number; special?: Special; red?: boolean; virtual?: boolean; compressedVirtual?: boolean; compressedMate?: Tile; visibleOrder?: number };
export type OpenMeld = { type: 'chi' | 'pon' | 'kan'; tiles: Tile[] };
export type Player = { hand: Tile[]; river: Tile[]; riverCalled?: boolean; kans?: Tile[][]; openMelds?: OpenMeld[]; northTiles?: Tile[]; memoryMelds?: Tile[][]; memoryPair?: Tile[]; points: bigint; card: Card; cards?: Card[]; usedCards?: Card[]; used: boolean; discards: number; riichi: boolean; doubleRiichi?: boolean; openRiichi?: boolean; riichiOrder?: number; ippatsu?: boolean; temporaryFuriten?: boolean; riichiFuriten?: boolean; nearPinActive?: boolean; riichiDraws?: number; dangerUses?: number; drawReservations?: number[]; pocketArmed?: boolean; skeletonRevealed?: number; ultimatePenaltyDone?: boolean };
export type EventMode = 'off' | 'random' | 'every';
export type RoundEvent = 'none' | 'seitenjo' | 'hachiku' | 'finale' | 'trump' | 'tenchou' | 'memory';
export function dealerSeat(round: number, playerCount: 3 | 4): number { return (round - 1) % playerCount; }
export function openingDealerSeat(playerCount: 3 | 4): number { return dealerSeat(1, playerCount); }
export function finaleTileCount(playerCount: 3 | 4): number { return playerCount === 3 ? 9 : 12; }
export type LocalYaku = 'renhou' | 'daisharin' | 'daichisei' | 'shiisantou' | 'suurenko';
export type DoubleYakuman = 'kokushi13' | 'suankoTanki' | 'junseiChuuren' | 'daisuushii';
export type SpecialYaku = 'sameColor' | 'sameTriplet3' | 'sameTriplet4' | 'superStraight' | 'lantern' | 'sanrenko' | 'isshokusanren';
export type Settings = { rounds: number; specialCount: number; startingPoints: number; kazoeMultiple: boolean; cards: boolean; playerCount?: 3 | 4; cardsPerPlayer?: number; finalCardsPerPlayer?: number; redDora?: boolean; eventMode?: EventMode; roundEvent?: RoundEvent; enabledCards?: Card[]; enabledSpecials?: Special[]; enabledEvents?: Exclude<RoundEvent, 'none'>[]; specialYaku?: Partial<Record<SpecialYaku, boolean>>; kanYakuEnhanced?: boolean; localYaku?: Partial<Record<LocalYaku, boolean>>; doubleYakuman?: Partial<Record<DoubleYakuman, boolean>>; yakumanStack?: boolean; openRiichi?: boolean };
export type Score = { valid: boolean; lines: string[]; han: number; fu: number; base: bigint; multiplier: number; total: bigint; dealerPayment: bigint; nonDealerPayment: bigint; shape: string; chosen: Tile[] };
export type ScoreContext = { seatWind?: number; roundWind?: number; winningKind?: number; winningTileId?: number; uraDora?: number | number[]; kans?: Tile[][]; openMelds?: OpenMeld[]; memoryMelds?: Tile[][]; memoryPair?: Tile[]; roundKanCount?: number; finalRoundLast?: boolean; rinshan?: boolean; houtei?: boolean; chankan?: boolean; initialRon?: boolean; initialDraw?: boolean; openRiichiPenalty?: boolean };

export const localYakuNames: Record<LocalYaku, string> = { renhou: '人和', daisharin: '大車輪', daichisei: '大七星', shiisantou: '十三不塔', suurenko: '四連刻' };
export const doubleYakumanNames: Record<DoubleYakuman, string> = { kokushi13: '国士無双十三面待ち', suankoTanki: '四暗刻単騎', junseiChuuren: '純正九蓮宝燈', daisuushii: '大四喜' };
export const specialYakuNames: Record<SpecialYaku, string> = { sameColor: '同一色', sameTriplet3: '三同刻', sameTriplet4: '四同刻', superStraight: '超一気通貫', lantern: '十三連宝燈', sanrenko: '三連子', isshokusanren: '一色三連' };

export const specialNames: Record<Special, string> = {
  knockout: 'ノックアウト', rainbow: '虹色変化', musou: '圧倒的無双', shochikubai: '松竹梅',
  purify: '浄化牌', ichigo: '一期一会', pure: '純粋牌', drumming: 'ドラミングビート',
  irregular: 'イレギュラー', zombie: 'ゾンビ', destiny: '運命の導き', trap: 'トラップ', triplet: '刻子牌',
};
export const cardNames: Record<Card, string> = {
  seitenjo: '青天井', menzen: '面前至上主義', early: 'お先に失礼', change: '千変万化', borrow: '借りパク', pickup: 'ものひろい', nail: '海底の釘', ride: '便乗', damascus: 'ダマスカス', multipai: '多牌', foresight: '先を見据える', near: 'ニアピン', akuukan: '亜空槓', countdown: 'カウントダウン', dancer: '踊り子', roadroller: 'ロードローラー', randomizer: 'ランダマイザー', yakumanBody: '役満ボディ', danger: '危機感知', machinegun: '流しマシンガン', pocket: 'ポケットビスケット', ultimate: 'アルティメットリーチ', skeleton: 'スケスケルトン', highRisk: 'ハイリスクハイリターン', oni: '鬼に金棒', tanyao32000: 'タンヤオ32000点', gekokujou: '下克上', dragonPairs: '鳴くだけ大三元', nakimushi: 'なきむし', pairFestival: '対子祭り',
};
export const cardDescriptions: Record<Card, string> = {
  seitenjo: 'この局の自分の和了点を青天井で計算します。',
  menzen: '門前和了の和了点が2倍になります。',
  early: '7回目の打牌より前の和了点が3倍になります。',
  change: '手牌5枚を選び、1～9筒へランダムに変化させます。局に1回。',
  borrow: '相手の手牌をランダムに1枚取り、自分が追加で1枚打牌します。奪われた側は次の手番の補充まで和了できず、聴牌が崩れた立直は解除されます。局に1回。',
  pickup: '相手の河から1枚を取り、自分が追加で1枚打牌します。局に1回。',
  nail: '聴牌中に最後の牌をツモると、最も高い点になる待ち牌として必ずツモ和了します。',
  ride: '他家がツモ和了した牌で自分も和了できる場合、同時にツモ和了します。',
  damascus: '他家が立直せずに門前和了したとき、その和了点を自分が全額支払います。',
  multipai: '手牌を通常より1枚多く持ち、和了時は最も高い14枚を採用します。',
  foresight: '誰かが和了したとき、または流局時に、自分の河から最高和了点になる14枚でツモ和了します。',
  near: 'この局で一度発動。あと1面子で届く役も成立し、すべての役の翻数が半分（切り捨て・最低1翻）になります。',
  akuukan: '同じ牌2枚と任意の牌2枚を選び、同じ牌4枚の暗槓を作ります。何度でも使用できます。',
  countdown: '立直後6回目のツモで、最も高い和了点になる待ち牌を必ずツモ和了します。',
  dancer: '最初の配牌は聴牌形。自分のツモ番開始時、通常のツモ前に別の聴牌形へ強制変化します。副露はできません。',
  roadroller: '手牌から選んだ3枚を一筒に変化させます。局に1回。',
  randomizer: '選んだ手牌を1枚ずつ独立したランダムな牌へ変化させます。局に1回。',
  yakumanBody: '成立した役満の翻数を2倍にします。',
  danger: '放銃しそうな打牌、トラップ牌へのロンを2回まで事前に警告します。',
  machinegun: '幺九牌を打牌すると、次の自分のツモがランダムな幺九牌になります。',
  pocket: '発動後の次の打牌と同じ牌を、その後2回の自分のツモで引きます。何度でも使用できます。',
  ultimate: '立直後6回目のツモまでの和了点が10倍。和了できなければ最高打点の和了点を他家へ支払います。',
  skeleton: '発動すると、この先5巡分の山と各プレイヤーの取得予定牌を確認できます。局に1回。',
  highRisk: '自分の和了点が3倍になります。自分が放銃して支払う点数も3倍になります。他家のツモによる支払いは変わりません。',
  oni: '成立役の数だけ、最も翻数が高い役1つの翻数を倍にします。',
  tanyao32000: '2・3・4・5の数牌だけで和了し、成立役が断么九のみなら、その役を13翻にします。',
  gekokujou: 'オーラスに最下位で和了した場合、成立した役をそれぞれ13翻として扱います。同点の最下位も対象です。',
  dragonPairs: '配牌に白・發・中を各2枚含めます。残りの牌は通常どおり配られます。',
  nakimushi: '四副露して単騎待ちで和了すると、なきむしが13翻で成立します。',
  pairFestival: '自分の手番に同じ牌2枚を1枚の圧縮牌へ変え、牌山を減らさずに新しい牌を1枚得ます。何度でも使えます。圧縮牌は手牌では対子2枚分です。打牌すると通常の1枚に戻り、鳴き・カン・北抜きには使えません。',
};
export const specials = Object.keys(specialNames) as Special[];
export const memorySpecials: readonly Special[] = ['rainbow', 'shochikubai', 'purify', 'ichigo', 'pure'];
export const cards = Object.keys(cardNames) as Card[];
export function hasCard(player: Player, card: Card): boolean { return player.cards ? player.cards.includes(card) : player.card === card; }
export function isDamascusTarget(player: Pick<Player, 'riichi' | 'openMelds'>): boolean { return !player.riichi && !player.openMelds?.length; }
export function openingIntact(players: Pick<Player, 'discards' | 'openMelds' | 'kans'>[]): boolean {
  return players.every(player => player.discards <= 1 && !player.openMelds?.length && !player.kans?.length);
}
export function reserveDraws(player: Player, kinds: number[]): void { player.drawReservations = [...kinds]; }
export function consumeDrawReservation(player: Player, tile: Tile, event: RoundEvent = 'none'): boolean {
  const kind = player.drawReservations?.shift();
  if (kind === undefined) return false;
  changeTileKind(tile, kind, event);
  return true;
}
export function reserveAfterDiscard(player: Player, kind: number, event: RoundEvent, playerCount: 3 | 4, random: () => number = Math.random): { machinegun: boolean; pocket: boolean } {
  const machinegun = hasCard(player, 'machinegun') && isTerminal(kind, event);
  if (machinegun) {
    const terminals = availableKinds(event, playerCount).filter(candidate => isTerminal(candidate, event));
    reserveDraws(player, [terminals[Math.floor(random() * terminals.length)]]);
  }
  const pocket = !!player.pocketArmed;
  if (pocket) {
    reserveDraws(player, [kind, kind]);
    player.pocketArmed = false;
  }
  return { machinegun, pocket };
}
export function dealCards(count: number, playerCount: 3 | 4 = 4, enabled: readonly Card[] = cards): Card[][] {
  const pool = shuffle(cards.filter(card => enabled.includes(card)));
  const dealt: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let n = 0; n < count; n++) for (let seat = 0; seat < playerCount; seat++) {
    const candidate = pool.findIndex(card => !(card === 'multipai' && dealt[seat].includes('dancer') || card === 'dancer' && dealt[seat].includes('multipai')));
    if (candidate >= 0) dealt[seat].push(pool.splice(candidate, 1)[0]);
  }
  return dealt;
}
export function reserveDragonPairs(wall: Tile[]): Tile[] {
  const reserved: Tile[] = [];
  for (const kind of [31, 32, 33]) for (let copy = 0; copy < 2; copy++) {
    const index = wall.findIndex(tile => tile.kind === kind);
    if (index < 0) throw new Error('三元牌の対子を配牌できません');
    reserved.push(wall.splice(index, 1)[0]);
  }
  return reserved;
}
export function shiftNumberTiles(groups: readonly (readonly Tile[])[]): void {
  const seen = new Set<number>();
  for (const group of groups) for (const tile of group) {
    if (seen.has(tile.id)) continue;
    seen.add(tile.id);
    const suit = suitOf(tile.kind), rank = rankOf(tile.kind);
    if (suit !== null && rank !== null && rank <= 9) changeTileKind(tile, suitKind(suit, rank % 9 + 1), 'tenchou');
  }
}
export const dancerPatterns = [
  [1, 2, 3, 10, 11, 12, 19, 20, 21, 4, 4, 13, 13],
  [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 27, 27],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 4, 4],
  [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33],
  [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 31],
  [0, 0, 2, 2, 9, 9, 11, 11, 18, 18, 20, 20, 31],
  [31, 31, 31, 32, 32, 32, 33, 33, 33, 0, 1, 2, 4],
  [27, 27, 27, 28, 28, 28, 31, 31, 31, 32, 32, 32, 33],
  [0, 0, 0, 8, 8, 8, 9, 9, 9, 17, 17, 17, 18],
  [19, 19, 19, 20, 20, 20, 21, 21, 21, 23, 23, 23, 32],
  [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8],
  [10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16],
  [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 0, 1],
  [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4],
  [0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 3, 4, 5],
  [0, 1, 2, 0, 1, 9, 10, 11, 18, 19, 20, 31, 31],
  [0, 1, 2, 0, 1, 2, 9, 10, 11, 9, 10, 31, 31],
  [4, 4, 4, 13, 13, 13, 22, 22, 0, 1, 2, 31, 31],
  [0, 1, 2, 6, 7, 8, 27, 27, 27, 31, 31, 31, 0],
  [0, 1, 2, 6, 7, 8, 9, 10, 11, 15, 16, 17, 0],
  [0, 0, 0, 8, 8, 8, 27, 27, 27, 31, 31, 31, 9],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 31, 31, 31, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 4],
  [31, 31, 31, 32, 32, 32, 33, 33, 0, 1, 2, 9, 10],
  [27, 27, 28, 28, 29, 29, 30, 30, 31, 31, 32, 32, 33],
  [0, 0, 0, 9, 9, 9, 18, 18, 18, 31, 31, 31, 4],
  [0, 0, 0, 9, 9, 9, 18, 18, 18, 1, 2, 3, 4],
  [31, 31, 31, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 31],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 13],
  [31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31, 31],
  [27, 27, 27, 28, 28, 28, 31, 31, 31, 32, 32, 32, 33],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 1, 2, 31],
  [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33],
  [0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 31],
  [0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8],
  [0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 21, 31],
  [0, 1, 2, 3, 2, 3, 4, 5, 5, 6, 7, 8, 31],
  [32, 32, 32, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [33, 33, 33, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [27, 27, 27, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [28, 28, 28, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [29, 29, 29, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [30, 30, 30, 0, 1, 2, 9, 10, 11, 18, 19, 20, 4],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
];
export const dancerRoles = [
  '断么九', '三色同順', '一気通貫', '国士無双', '四暗刻', '七対子', '大三元', '小三元',
  '清老頭', '緑一色', '九蓮宝燈', '大車輪', '小四喜', '四連刻', '平和', '一盃口',
  '二盃口', '三色同刻', '混全帯幺九', '純全帯幺九', '混老頭', '混一色', '清一色', '小三元',
  '大七星', '対々和', '三暗刻', '白の刻子', '大四喜', '四同刻', '同一色',
  '字一色', '三同刻', '国士無双十三面待ち', '四暗刻単騎', '純正九蓮宝燈', '三連子', '一色三連',
  '發の刻子', '中の刻子',
  '東の刻子', '南の刻子', '西の刻子', '北の刻子',
  '門前清自摸和',
];
export function dancerRoleEnabled(role: string, localYaku?: Settings['localYaku'], doubleYakuman?: Settings['doubleYakuman'], event: RoundEvent = 'none'): boolean {
  if (event === 'hachiku' && ['三色同順', '三色同刻'].includes(role)) return false;
  const localRole: Partial<Record<string, LocalYaku>> = { 大車輪: 'daisharin', 大七星: 'daichisei', 四連刻: 'suurenko' };
  const rule = localRole[role];
  if (rule !== undefined && localYaku?.[rule] !== true) return false;
  const doubleRole: Partial<Record<string, DoubleYakuman>> = { 国士無双十三面待ち: 'kokushi13', 四暗刻単騎: 'suankoTanki', 純正九蓮宝燈: 'junseiChuuren' };
  const doubleRule = doubleRole[role];
  return doubleRule === undefined || doubleYakuman?.[doubleRule] !== false;
}
export const trumpDancerPatterns = [Array.from({ length: 13 }, (_, rank) => suitKind(0, rank + 1))];
export function dancerVariant(pattern: number[], offset: number, event: RoundEvent = 'none', reverseRanks = false): number[] {
  return pattern.map(kind => {
    const suit = suitOf(kind), rank = rankOf(kind);
    if (suit === null || rank === null) return kind;
    const changedRank = reverseRanks ? (event === 'trump' ? 14 : 10) - rank : rank;
    return suitKind(event === 'hachiku' ? 2 : (suit + offset) % 3, changedRank);
  });
}
export function dancerPatternGroups(patterns: number[][], before: number[], event: RoundEvent = 'none', playerCount: 3 | 4 = 4): number[][][] {
  const allowed = new Set(availableKinds(event, playerCount));
  const previous = [...before].sort((a, b) => a - b).join(',');
  return patterns.map(pattern => {
    const seen = new Set<string>();
    const variants: number[][] = [];
    for (let transform = 0; transform < 6; transform++) {
      const candidate = dancerVariant(pattern, transform % 3, event, transform >= 3);
      const key = [...candidate].sort((a, b) => a - b).join(',');
      if (seen.has(key) || key === previous || candidate.some(kind => !allowed.has(kind))) continue;
      seen.add(key);
      if (isTenpai(candidate.map((kind, id) => ({ kind, id })), event, playerCount)) variants.push(candidate);
    }
    return variants;
  }).filter(group => group.length > 0);
}
export function dancerRoleChoices(patterns: number[][], roles: string[], before: number[], event: RoundEvent = 'none', playerCount: 3 | 4 = 4, canReachRole?: (pattern: number[], role: string) => boolean): { role: string; variants: number[][] }[] {
  if (patterns.length !== roles.length) throw new Error('踊り子の役と聴牌形の数が一致しません');
  const byRole = new Map<string, number[][]>();
  patterns.forEach((pattern, index) => {
    const role = roles[index];
    const variants = dancerPatternGroups([pattern], before, event, playerCount)[0]?.filter(variant => !canReachRole || canReachRole(variant, role));
    if (!variants?.length) return;
    const combined = [...(byRole.get(role) ?? []), ...variants];
    const seen = new Set<string>();
    byRole.set(role, combined.filter(variant => {
      const key = [...variant].sort((a, b) => a - b).join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  });
  return [...byRole].map(([role, variants]) => ({ role, variants }));
}
export function dancerRoleGroups(patterns: number[][], roles: string[], before: number[], event: RoundEvent = 'none', playerCount: 3 | 4 = 4, canReachRole?: (pattern: number[], role: string) => boolean): number[][][] {
  return dancerRoleChoices(patterns, roles, before, event, playerCount, canReachRole).map(choice => choice.variants);
}
export function dancerHandReachesRole(hand: Tile[], role: string, event: RoundEvent, playerCount: 3 | 4, rules: Settings, seatWind = 28, roundWind = 27, kans: Tile[][] = []): boolean {
  const effectiveHand = kans.length && hand.length === 13 - kans.length * 3 ? [...hand, ...kans.flatMap(kan => kan.slice(0, 3))] : hand;
  const purifiedRoles: Record<string, string> = { 混一色: '清一色（浄化牌）', 混老頭: '清老頭（浄化牌）', 混全帯幺九: '純全帯幺九（浄化牌）' };
  const acceptedRoles = [role, ...(effectiveHand.some(tile => tile.special === 'purify' || tile.compressedMate?.special === 'purify') && purifiedRoles[role] ? [purifiedRoles[role]] : [])];
  const player: Player = { hand, river: [], points: 0n, card: 'seitenjo', used: false, discards: 0, riichi: false };
  const scoringRules = { ...rules, cards: false, roundEvent: event, playerCount, yakumanStack: true };
  return waitKinds(effectiveHand, event, false, playerCount, rules.specialYaku).some(kind => {
    const winner = { id: -999999, kind };
    return bestScore([...effectiveHand, winner], player, false, true, scoringRules, -1, false, { winningTileId: winner.id, winningKind: kind, seatWind, roundWind, kans })
      .lines.some(line => acceptedRoles.some(name => line.startsWith(`${name} `)));
  });
}
export function dancerRoleReachable(pattern: number[], role: string, event: RoundEvent, playerCount: 3 | 4, rules: Settings, seatWind = 28, roundWind = 27, kans: Tile[][] = []): boolean {
  const loose = dancerLooseTiles(pattern, kans.map(kan => kan[0].kind));
  if (!loose) return false;
  const firstId = Math.min(-1, ...kans.flatMap(kan => kan.map(tile => tile.id))) - 1;
  const hand = [...loose.map((kind, index) => ({ kind, id: firstId - index })), ...kans.flatMap(kan => kan.slice(0, 3))];
  return dancerHandReachesRole(hand, role, event, playerCount, rules, seatWind, roundWind, kans);
}
export function dancerLooseTiles(pattern: readonly number[], kanKinds: readonly number[]): number[] | null {
  const loose = [...pattern];
  for (const kind of kanKinds) {
    for (let copy = 0; copy < 3; copy++) {
      const index = loose.indexOf(kind);
      if (index < 0) return null;
      loose.splice(index, 1);
    }
  }
  return loose;
}
export function dancerCompressedAssignments(pattern: readonly number[], compressedIndices: readonly number[], limit = 8): number[][] {
  if (!compressedIndices.length || new Set(compressedIndices).size !== compressedIndices.length || compressedIndices.some(index => index < 0 || index >= pattern.length)) return [];
  const counts = new Map<number, number>();
  for (const kind of pattern) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const kinds = shuffle([...counts].filter(([, count]) => count >= 2).map(([kind]) => kind));
  const chosen: number[] = [];
  const assignments: number[][] = [];
  const collect = (): void => {
    if (assignments.length >= limit) return;
    if (chosen.length === compressedIndices.length) {
      const remaining = [...pattern];
      for (const kind of chosen) remaining.splice(remaining.indexOf(kind), 1);
      shuffle(remaining);
      const byIndex = new Map(compressedIndices.map((index, slot) => [index, chosen[slot]]));
      assignments.push(Array.from({ length: pattern.length }, (_, index) => byIndex.get(index) ?? remaining.shift()!));
      return;
    }
    for (const kind of kinds) {
      if (2 * (chosen.filter(value => value === kind).length + 1) > counts.get(kind)!) continue;
      chosen.push(kind);
      collect();
      chosen.pop();
      if (assignments.length >= limit) return;
    }
  };
  collect();
  return assignments;
}
export function dancerKanFallback(kanKinds: readonly number[], event: RoundEvent): number[] {
  const starts = event === 'hachiku' ? [18, 21, 24] : [9, 12, 15];
  const melds = starts.slice(0, 4 - kanKinds.length).flatMap(start => [start, start + 1, start + 2]);
  const pairKind = (event === 'trump' ? [0, 1, 2] : [31, 32, 33, 0]).find(kind => !kanKinds.includes(kind))!;
  return [...kanKinds.flatMap(kind => [kind, kind, kind]), ...melds, pairKind];
}
export function dancerExpandedPairs(hand: readonly Tile[], event: RoundEvent, playerCount: 3 | 4): { role: string; variants: number[][] } | null {
  const compressed = hand.filter(tile => tile.compressedMate).length;
  if (hand.length !== 13 || compressed < 2 || compressed % 2) return null;
  const pairCount = (14 + compressed) / 2;
  const allowed = new Set(availableKinds(event, playerCount));
  const pool: number[] = [];
  const rankOrder = [1, 4, 7, 10, 13, 2, 5, 8, 11, 3, 6, 9, 12].filter(rank => rank <= (event === 'trump' ? 13 : 9));
  let honor = 27;
  for (const rank of rankOrder) {
    for (const suit of [0, 1, 2]) {
      const kind = suitKind(suit, rank);
      if (allowed.has(kind)) pool.push(kind);
    }
    if (allowed.has(honor)) pool.push(honor++);
  }
  while (allowed.has(honor)) pool.push(honor++);
  const previous = hand.map(tile => tile.kind).sort((a, b) => a - b).join(',');
  const variants: number[][] = [];
  for (let offset = 0; offset < 3; offset++) {
    const kinds = Array.from({ length: pairCount }, (_, index) => pool[(index + offset * pairCount) % pool.length]);
    const ordinary = kinds.slice(compressed, -1).flatMap(kind => [kind, kind]);
    ordinary.push(kinds.at(-1)!);
    let slot = 0;
    const candidate = hand.map(tile => tile.compressedMate ? kinds[slot++] : ordinary.shift()!);
    if ([...candidate].sort((a, b) => a - b).join(',') !== previous) variants.push(candidate);
  }
  return { role: `${['', '', '', '', '', '', '', '', '八', '九', '十', '十一', '十二', '十三'][pairCount]}対子`, variants };
}
export function dancerLanternChoices(hand: readonly Tile[], event: RoundEvent, enabled = true): { role: string; variants: number[][] } | null {
  const endpoints = hand.flatMap((tile, index) => tile.special === 'triplet' ? [index] : []).slice(0, 2);
  if (!enabled || event !== 'trump' || hand.length !== 13 || hand.some(tile => tile.compressedMate) || endpoints.length !== 2) return null;
  const previous = hand.map(tile => tile.kind).sort((a, b) => a - b).join(',');
  const variants: number[][] = [];
  for (const suit of [0, 1, 2]) {
    let rank = 2;
    const candidate = hand.map((_, index) => suitKind(suit, index === endpoints[0] ? 1 : index === endpoints[1] ? 13 : rank++));
    if ([...candidate].sort((a, b) => a - b).join(',') !== previous) variants.push(candidate);
  }
  return { role: '十三連宝燈', variants };
}
export function changeTileKind(tile: Tile, kind: number, event: RoundEvent = 'none'): void {
  if (event === 'hachiku' && kind < 27) kind = 18 + kind % 9;
  tile.kind = kind;
  if (tile.red && ![4, 13, 22].includes(kind)) delete tile.red;
  if (tile.special === 'musou' && !isTerminal(kind, event)) delete tile.special;
  if (tile.compressedMate) changeTileKind(tile.compressedMate, kind, event);
}
export function randomChangeKind(event: RoundEvent = 'none', random: () => number = Math.random): number {
  const ranks = event === 'trump' ? 13 : 9;
  return suitKind(event === 'hachiku' ? 2 : 1, 1 + Math.floor(random() * ranks));
}
export function infectWithZombie(target: Tile, source: Tile, event: RoundEvent = 'none'): void {
  if (source.special !== 'zombie' || target.id === source.id) return;
  changeTileKind(target, source.kind, event);
  target.special = 'zombie';
  if (source.red) target.red = true;
  else delete target.red;
}
export function spreadZombies(hand: Tile[], random: () => number = Math.random, event: RoundEvent = 'none'): { previousKind: number; targetKind: number }[] {
  const sources = hand.filter(tile => tile.special === 'zombie');
  const changed: { previousKind: number; targetKind: number }[] = [];
  for (const source of sources) {
    if (random() >= 0.3) continue;
    const targets = hand.filter(tile => tile.id !== source.id && tile.special !== 'zombie');
    if (!targets.length) continue;
    const target = targets[Math.floor(random() * targets.length)];
    const previousKind = target.kind;
    infectWithZombie(target, source, event);
    changed.push({ previousKind, targetKind: source.kind });
  }
  return changed;
}
export function firstFourVisibleKind(players: Player[]): number | null {
  const seen = new Set<number>();
  const counts = Array(46).fill(0) as number[];
  const visible = players.flatMap(player => [...player.river, ...(player.northTiles ?? []), ...(player.kans ?? []).flat(), ...(player.openMelds ?? []).flatMap(meld => meld.tiles)]);
  visible.sort((a, b) => (a.visibleOrder ?? Number.MAX_SAFE_INTEGER) - (b.visibleOrder ?? Number.MAX_SAFE_INTEGER));
  for (const tile of visible) {
    if (seen.has(tile.id)) continue;
    seen.add(tile.id);
    if (++counts[tile.kind] === 4) return tile.kind;
  }
  return null;
}
let nextId = 1;
export function suitOf(kind: number): number | null { return kind < 27 ? Math.floor(kind / 9) : kind >= 34 && kind < 46 ? Math.floor((kind - 34) / 4) : null; }
export function rankOf(kind: number): number | null { return kind < 27 ? kind % 9 + 1 : kind >= 34 && kind < 46 ? (kind - 34) % 4 + 10 : null; }
export function suitKind(suit: number, rank: number): number { return rank <= 9 ? suit * 9 + rank - 1 : 34 + suit * 4 + rank - 10; }
export function availableKinds(event: RoundEvent = 'none', playerCount: 3 | 4 = 4): number[] {
  if (event === 'trump') return Array.from({ length: 3 }, (_, suit) => Array.from({ length: 13 }, (_, rank) => suitKind(suit, rank + 1))).flat().sort((a, b) => a - b);
  return Array.from({ length: 34 }, (_, kind) => kind).filter(kind => (event !== 'hachiku' || kind >= 18) && (playerCount === 4 || event === 'tenchou' || kind < 1 || kind > 7));
}
export function tileName(kind: number): string {
  const suit = suitOf(kind), rank = rankOf(kind);
  if (suit !== null && rank !== null) return `${rank}${['萬', '筒', '索'][suit]}`;
  return ['東', '南', '西', '北', '白', '發', '中'][kind - 27];
}
export function tileGlyph(kind: number): string {
  const suit = suitOf(kind), rank = rankOf(kind);
  if (suit !== null && rank !== null) return `${rank}${['萬', '筒', '索'][suit]}`;
  return ['東', '南', '西', '北', '白', '發', '中'][kind - 27];
}
export function winningShapeSummary(score: Score): string {
  const triplet = score.chosen.some(tile => tile.virtual && !tile.compressedVirtual);
  const compressed = score.chosen.some(tile => tile.compressedVirtual);
  const tiles = score.chosen.map(tile => `${tileName(tile.kind)}${tile.compressedVirtual ? '◇' : tile.virtual ? '＊' : ''}`).join(' ');
  return `${score.shape}：${tiles}${triplet ? '（＊は刻子牌の効果）' : ''}${compressed ? '（◇は圧縮牌の2枚目）' : ''}`;
}
export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
export function makeWall(specialCount: number, event: RoundEvent = 'none', redDora = false, playerCount: 3 | 4 = 4, enabled: readonly Special[] = specials, oncePerRound: readonly Special[] = []): Tile[] {
  const wall: Tile[] = [];
  for (const kind of availableKinds(event === 'hachiku' || event === 'tenchou' ? 'none' : event, playerCount)) for (let i = 0; i < 4; i++) wall.push({ id: nextId++, kind });
  shuffle(wall);
  if (redDora && event !== 'memory') for (const kind of [4, 13, 22]) {
    const tile = wall.find(candidate => candidate.kind === kind);
    if (tile) tile.red = true;
  }
  const positions = shuffle(wall.map((_, i) => i).filter(index => specials.some(s => enabled.includes(s) && (s !== 'musou' || isTerminal(wall[index].kind, event))))).slice(0, Math.min(specialCount, wall.length));
  const assignedOnce = new Set<Special>();
  for (const position of positions) {
    const choices = specials.filter(s => enabled.includes(s) && !assignedOnce.has(s) && (s !== 'musou' || isTerminal(wall[position].kind, event)));
    if (choices.length) {
      const special = choices[Math.floor(Math.random() * choices.length)];
      wall[position].special = special;
      if (oncePerRound.includes(special)) assignedOnce.add(special);
    }
  }
  if (event === 'hachiku') for (const tile of wall) if (tile.kind < 27) tile.kind = 18 + tile.kind % 9;
  if (event === 'trump') {
    for (let suit = 0; suit < 3; suit++) for (const rank of [1, 13]) wall.push({ id: nextId++, kind: suitKind(suit, rank), ...(enabled.includes('triplet') ? { special: 'triplet' as const } : {}) });
    shuffle(wall);
  }
  return wall;
}
export function compressPair(hand: Tile[], ids: readonly number[], event: RoundEvent = 'none', playerCount: 3 | 4 = 4): Tile | null {
  if (ids.length !== 2 || ids[0] === ids[1]) return null;
  const first = hand.find(tile => tile.id === ids[0]), second = hand.find(tile => tile.id === ids[1]);
  if (!first || !second || first.kind !== second.kind || first.compressedMate || second.compressedMate) return null;
  first.compressedMate = { ...second };
  hand.splice(hand.indexOf(second), 1);
  const kinds = availableKinds(event, playerCount);
  const drawn = { id: nextId++, kind: kinds[Math.floor(Math.random() * kinds.length)] };
  hand.push(drawn);
  return drawn;
}
export function releaseCompressedTile(tile: Tile): boolean {
  if (!tile.compressedMate) return false;
  delete tile.compressedMate;
  return true;
}
export function isTerminal(k: number, event: RoundEvent = 'none'): boolean {
  const rank = rankOf(k);
  return rank === null || rank === 1 || rank === (event === 'trump' ? 13 : 9);
}
export function isMemoryMeld(tiles: readonly Tile[]): boolean {
  if (tiles.length !== 3) return false;
  const kinds = tiles.map(tile => tile.kind).sort((a, b) => a - b);
  if (kinds[0] === kinds[2]) return true;
  const suit = suitOf(kinds[0]);
  return suit !== null && kinds.every(kind => suitOf(kind) === suit) && kinds[1] === kinds[0] + 1 && kinds[2] === kinds[1] + 1;
}
export function memoryCanClaim(tiles: readonly Tile[], need: 2 | 3): boolean {
  const counts = new Map<number, number>();
  for (const tile of tiles) counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
  if (need === 2) return [...counts.values()].some(count => count >= 2);
  if ([...counts.values()].some(count => count >= 3)) return true;
  return [...counts.keys()].some(kind => {
    const suit = suitOf(kind);
    return suit !== null && rankOf(kind)! <= 7 && counts.has(kind + 1) && counts.has(kind + 2)
      && suitOf(kind + 1) === suit && suitOf(kind + 2) === suit;
  });
}
export function memoryCanContinue(tiles: readonly Tile[], acquiredCount: number): boolean {
  return acquiredCount < 14 && memoryCanClaim(tiles, acquiredCount < 12 ? 3 : 2);
}
export function chooseMemoryTiles(available: readonly number[], knownKinds: ReadonlyMap<number, number>, need: 2 | 3, playerCount: 3 | 4, random: () => number = Math.random): number[] {
  const shuffled = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const known = shuffled(available.filter(index => knownKinds.has(index)));
  const unknown = shuffled(available.filter(index => !knownKinds.has(index)));
  if (need === 2) {
    for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) {
      if (knownKinds.get(known[i]) === knownKinds.get(known[j])) return [known[i], known[j]];
    }
    if (known.length && unknown.length) return [known[0], unknown[0]];
    return shuffled([...available]).slice(0, 2);
  }
  const meld = (indices: number[]): boolean => isMemoryMeld(indices.map((index, id) => ({ id, kind: knownKinds.get(index)! })));
  for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) for (let k = j + 1; k < known.length; k++) {
    const indices = [known[i], known[j], known[k]];
    if (meld(indices)) return indices;
  }
  if (unknown.length) {
    const possibleKinds = availableKinds('memory', playerCount);
    let bestPair: number[] = [];
    let bestCount = 0;
    for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) {
      const pair = [known[i], known[j]];
      const count = possibleKinds.filter(kind => isMemoryMeld([
        { id: 0, kind: knownKinds.get(pair[0])! }, { id: 1, kind: knownKinds.get(pair[1])! }, { id: 2, kind },
      ])).length;
      if (count > bestCount) { bestCount = count; bestPair = pair; }
    }
    if (bestPair.length) return [...bestPair, unknown[0]];
  }
  if (known.length && unknown.length >= 2) return [known[0], ...unknown.slice(0, 2)];
  return shuffled([...available]).slice(0, 3);
}
export function meldCandidates(hand: Tile[], tile: Tile, canChi: boolean, canKan: boolean, event: RoundEvent = 'none'): { type: OpenMeld['type']; handIds: number[]; label: string }[] {
  const available = hand.filter(other => !other.compressedMate);
  const same = available.filter(other => other.kind === tile.kind);
  const options: { type: OpenMeld['type']; handIds: number[]; label: string }[] = [];
  const seen = new Set<string>();
  const combinations = (choices: Tile[], count: number): Tile[][] => {
    if (count === 0) return [[]];
    return choices.flatMap((choice, index) => combinations(choices.slice(index + 1), count - 1).map(rest => [choice, ...rest]));
  };
  const add = (type: OpenMeld['type'], chosen: Tile[], label: string): void => {
    const key = `${type}:${chosen.map(used => `${used.kind}/${used.special ?? ''}/${used.red ? 1 : 0}`).sort().join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ type, handIds: chosen.map(used => used.id), label });
  };
  if (same.length >= 2) for (const chosen of combinations(same, 2)) add('pon', chosen, `ポン ${tileName(tile.kind)}`);
  if (same.length >= 3 && canKan) for (const chosen of combinations(same, 3)) add('kan', chosen, `明槓 ${tileName(tile.kind)}`);
  const suit = suitOf(tile.kind), rank = rankOf(tile.kind);
  if (canChi && suit !== null && rank !== null) for (let startRank = Math.max(1, rank - 2); startRank <= rank; startRank++) {
    if (startRank > (event === 'trump' ? 11 : 7)) continue;
    const sequence = [0, 1, 2].map(offset => suitKind(suit, startRank + offset));
    const needed = sequence.filter(kind => kind !== tile.kind);
    const first = available.filter(other => other.kind === needed[0]);
    const second = available.filter(other => other.kind === needed[1]);
    for (const a of first) for (const b of second) add('chi', [a, b], `チー ${sequence.map(tileName).join('・')}`);
  }
  return options;
}
export function nagashiEligible(player: Player, event: RoundEvent = 'none'): boolean { return !player.riverCalled && player.river.length > 0 && player.river.every(tile => isTerminal(tile.kind, event)); }
export function takeRiverTile(player: Pick<Player, 'river'>, id: number): Tile | null {
  const index = player.river.findIndex(tile => tile.id === id);
  return index < 0 ? null : player.river.splice(index, 1)[0];
}
export function transferRonPoints(players: Player[], winner: number, discarder: number, amount: bigint, trap: boolean, responsible = discarder, cardsEnabled = false): bigint {
  const payment = !trap && responsible === discarder && cardsEnabled && hasCard(players[discarder], 'highRisk') ? amount * 3n : amount;
  if (trap) { players[winner].points -= payment; players[discarder].points += payment; }
  else { players[responsible].points -= payment; players[winner].points += payment; }
  return payment;
}
export function sortHand(hand: Tile[]): void { hand.sort((a, b) => a.kind - b.kind || a.id - b.id); }
function countsOf(tiles: Tile[]): number[] { const c = Array(46).fill(0); for (const t of tiles) c[t.kind]++; return c; }
type Meld = { type: 'sequence' | 'triplet' | 'linked'; kind: number };
type StandardShape = { pair: number; melds: Meld[] };
function standardShapes(counts: number[], event: RoundEvent = 'none'): StandardShape[] {
  const shapes: StandardShape[] = [];
  const collect = (pair: number, melds: Meld[]): void => {
    const k = counts.findIndex(n => n > 0);
    if (k < 0) {
      if (melds.length === 4) shapes.push({ pair, melds: [...melds] });
      return;
    }
    if (melds.length >= 4) return;
    if (counts[k] >= 3) {
      counts[k] -= 3; melds.push({ type: 'triplet', kind: k });
      collect(pair, melds);
      melds.pop(); counts[k] += 3;
    }
    const suit = suitOf(k), rank = rankOf(k);
    const a = suit !== null && rank !== null ? suitKind(suit, rank + 1) : -1;
    const b = suit !== null && rank !== null ? suitKind(suit, rank + 2) : -1;
    if (suit !== null && rank !== null && rank <= (event === 'trump' ? 11 : 7) && counts[a] > 0 && counts[b] > 0) {
      counts[k]--; counts[a]--; counts[b]--;
      melds.push({ type: 'sequence', kind: k });
      collect(pair, melds);
      melds.pop(); counts[k]++; counts[a]++; counts[b]++;
    }
  };
  for (let pair = 0; pair < counts.length; pair++) if (counts[pair] >= 2) {
    counts[pair] -= 2;
    collect(pair, []);
    counts[pair] += 2;
  }
  return shapes;
}
function linkedShapes(counts: number[], event: RoundEvent = 'none'): StandardShape[] {
  const shapes: StandardShape[] = [];
  const collect = (pair: number, melds: Meld[]): void => {
    const first = counts.findIndex(count => count > 0);
    if (first < 0) { if (melds.length === 3) shapes.push({ pair, melds: [...melds] }); return; }
    if (melds.length >= 3) return;
    const suit = suitOf(first), rank = rankOf(first);
    if (suit === null || rank === null || rank > (event === 'trump' ? 10 : 6)) return;
    const kinds = [0, 1, 2, 3].map(offset => suitKind(suit, rank + offset));
    if (!kinds.every(kind => counts[kind] > 0)) return;
    for (const kind of kinds) counts[kind]--;
    melds.push({ type: 'linked', kind: first });
    collect(pair, melds);
    melds.pop();
    for (const kind of kinds) counts[kind]++;
  };
  for (let pair = 0; pair < counts.length; pair++) if (counts[pair] >= 2) {
    counts[pair] -= 2;
    collect(pair, []);
    counts[pair] += 2;
  }
  return shapes;
}
function trumpRun(tiles: Tile[]): { suit: number; lantern: boolean } | null {
  if (tiles.length !== 14) return null;
  const suit = suitOf(tiles[0].kind);
  if (suit === null || !tiles.every(tile => suitOf(tile.kind) === suit)) return null;
  const ranks = tiles.map(tile => rankOf(tile.kind)!);
  if (!Array.from({ length: 13 }, (_, i) => i + 1).every(rank => ranks.includes(rank))) return null;
  return { suit, lantern: tiles.some(tile => rankOf(tile.kind) === 1 && tile.special === 'triplet') && tiles.some(tile => rankOf(tile.kind) === 13 && tile.special === 'triplet') };
}
function shapeOf(tiles: Tile[], event: RoundEvent = 'none', specialYaku?: Settings['specialYaku']): '国士無双' | '七対子' | '通常形' | '連子形' | '超一気通貫' | '十三連宝燈' | null {
  if (tiles.length !== 14) return null;
  if (event === 'trump') { const run = trumpRun(tiles); if (run && (specialYaku?.superStraight !== false || run.lantern && specialYaku?.lantern !== false)) return run.lantern && specialYaku?.lantern !== false ? '十三連宝燈' : '超一気通貫'; }
  const c = countsOf(tiles);
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  if (terminals.every(k => c[k] > 0) && terminals.some(k => c[k] > 1)) return '国士無双';
  if (c.filter(n => n === 2).length === 7) return '七対子';
  if (standardShapes(c, event).length) return '通常形';
  if (linkedShapes(c, event).some(shape => specialYaku?.sanrenko !== false || specialYaku?.isshokusanren !== false && new Set(shape.melds.map(meld => suitOf(meld.kind))).size === 1)) return '連子形';
  return null;
}
function compressedVariants(tiles: Tile[], winningTileId?: number): Tile[][] {
  const groups = tiles.map(tile => tile.compressedMate ? [tile, { ...tile.compressedMate, virtual: true, compressedVirtual: true }] : [tile]);
  const variants: Tile[][] = [];
  const chosen: Tile[] = [];
  const collect = (at: number): void => {
    if (chosen.length > 14) return;
    if (at === groups.length) {
      if (chosen.length === 14 && (winningTileId === undefined || chosen.some(tile => tile.id === winningTileId))) variants.push([...chosen]);
      return;
    }
    collect(at + 1);
    chosen.push(...groups[at]);
    collect(at + 1);
    chosen.length -= groups[at].length;
  };
  collect(0);
  const expanded = groups.flat();
  if (expanded.length >= 16 && expanded.length <= 28 && expanded.length % 2 === 0 && (winningTileId === undefined || expanded.some(tile => tile.id === winningTileId))) variants.push(expanded);
  return variants;
}
function expandedPairCount(tiles: Tile[]): number {
  if (tiles.length < 16 || tiles.length > 28 || tiles.length % 2 || !tiles.some(tile => tile.compressedVirtual)) return 0;
  const counts = countsOf(tiles);
  return counts.filter(count => count === 2).length === tiles.length / 2 && counts.every(count => count === 0 || count === 2) ? tiles.length / 2 : 0;
}
export function tripletVariants(tiles: Tile[], winningTileId?: number, protectedIds: ReadonlySet<number> = new Set()): Tile[][] {
  const triplets = tiles.filter(tile => tile.special === 'triplet');
  if (!triplets.length || tiles.length !== 14) return [tiles];
  const removable = tiles.filter(tile => tile.special !== 'triplet' && tile.id !== winningTileId && !tile.virtual && !protectedIds.has(tile.id));
  const omitCount = triplets.length * 2;
  if (removable.length < omitCount) return [];
  const variants: Tile[][] = [];
  const choose = (from: number, omitted: Set<number>): void => {
    if (omitted.size === omitCount) {
      variants.push([
        ...tiles.filter(tile => !omitted.has(tile.id)),
        ...triplets.flatMap((tile, index) => [
          { id: -1000000 - index * 2, kind: tile.kind, virtual: true },
          { id: -1000001 - index * 2, kind: tile.kind, virtual: true },
        ]),
      ]);
      return;
    }
    for (let i = from; i <= removable.length - (omitCount - omitted.size); i++) {
      omitted.add(removable[i].id);
      choose(i + 1, omitted);
      omitted.delete(removable[i].id);
    }
  };
  choose(0, new Set());
  return variants;
}
function thirteenTower(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = countsOf(tiles);
  if (counts.filter(n => n === 2).length !== 1 || counts.some(n => n > 2)) return false;
  for (let suit = 0; suit < 3; suit++) {
    const ranks = [...new Set(tiles.filter(tile => suitOf(tile.kind) === suit).map(tile => rankOf(tile.kind)!))].sort((a, b) => a - b);
    for (let i = 1; i < ranks.length; i++) if (ranks[i] - ranks[i - 1] <= 2) return false;
  }
  return true;
}
function chuurenExtra(counts: number[]): number | null {
  for (const suit of [0, 9, 18]) {
    if (counts.some((n, kind) => n > 0 && (kind < suit || kind >= suit + 9))) continue;
    const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    if (base.every((needed, rank) => counts[suit + rank] >= needed)) {
      const extra = base.findIndex((needed, rank) => counts[suit + rank] === needed + 1);
      if (extra >= 0) return suit + extra;
    }
  }
  return null;
}
export function isWinningShape(tiles: Tile[], event: RoundEvent = 'none', playerCount: 3 | 4 = 4, specialYaku?: Settings['specialYaku']): boolean {
  if (tiles.some(tile => tile.compressedMate)) return compressedVariants(tiles, tiles.at(-1)?.id).some(variant => expandedPairCount(variant) > 0 || isWinningShape(variant.map(tile => ({ ...tile, compressedMate: undefined })), event, playerCount, specialYaku));
  if (event === 'trump') {
    const run = trumpRun(tiles);
    if (run && (specialYaku?.superStraight !== false || run.lantern && specialYaku?.lantern !== false)) return true;
  }
  if (tiles.length === 14 && tiles.some(tile => tile.special === 'triplet')) {
    return tripletVariants(tiles, tiles.at(-1)?.id).some(variant => isWinningShape(variant.map(tile => tile.special === 'triplet' ? { ...tile, special: undefined } : tile), event, playerCount, specialYaku));
  }
  if (shapeOf(tiles, event, specialYaku)) return true;
  const wild = tiles.map((t, i) => t.special === 'rainbow' ? i : -1).filter(i => i >= 0);
  if (!wild.length) return false;
  const work = tiles.map(t => ({ ...t }));
  const search = (at: number, start: number): boolean => {
    if (at === wild.length) return shapeOf(work, event, specialYaku) !== null;
    for (const kind of availableKinds(event, playerCount)) {
      if (kind < start) continue;
      work[wild[at]].kind = kind; if (search(at + 1, kind)) return true;
    }
    return false;
  };
  return search(0, 0);
}
export function isTenpai(tiles: Tile[], event: RoundEvent = 'none', playerCount: 3 | 4 = 4, specialYaku?: Settings['specialYaku']): boolean {
  return waitKinds(tiles, event, false, playerCount, specialYaku).length > 0;
}
export function waitKinds(tiles: Tile[], event: RoundEvent = 'none', extra = false, playerCount: 3 | 4 = 4, specialYaku?: Settings['specialYaku']): number[] {
  if (tiles.length !== (extra ? 14 : 13)) return [];
  const waits: number[] = [];
  for (const kind of availableKinds(event, playerCount)) {
    const candidate = [...tiles, { id: -1, kind }];
    const shape = (hand: Tile[]): boolean => hand.some(tile => tile.compressedMate)
      ? compressedVariants(hand, hand.some(tile => tile.id === -1) ? -1 : undefined).some(variant =>
        expandedPairCount(variant) > 0 || isWinningShape(variant.map(tile => ({ ...tile, compressedMate: undefined })), event, playerCount, specialYaku))
      : isWinningShape(hand, event, playerCount, specialYaku);
    if (extra ? candidate.some((_, i) => shape(candidate.filter((_, j) => i !== j))) : shape(candidate)) waits.push(kind);
  }
  return waits;
}
export function existingWaitKinds(tiles: Tile[], event: RoundEvent, extra: boolean, playerCount: 3 | 4, presentTiles: readonly Tile[], specialYaku?: Settings['specialYaku']): number[] {
  const waits = waitKinds(tiles, event, extra, playerCount, specialYaku);
  if (event !== 'tenchou' || playerCount !== 3) return waits;
  const present = new Set(presentTiles.map(tile => tile.kind));
  return waits.filter(kind => kind < 1 || kind > 7 || present.has(kind));
}
function basePoints(han: number, fu: number, seitenjo: boolean, multiple: boolean): bigint {
  if (seitenjo) return BigInt(fu) * (1n << BigInt(han + 2));
  if (han >= 13) return 8000n * BigInt(multiple ? Math.max(1, Math.floor(han / 13)) : 1);
  if (han >= 11) return 6000n;
  if (han >= 8) return 4000n;
  if (han >= 6) return 3000n;
  const raw = BigInt(fu) * (1n << BigInt(han + 2));
  return raw < 2000n ? raw : 2000n;
}
function round100(n: bigint): bigint { return ((n + 99n) / 100n) * 100n; }
export function scoreHand(tiles: Tile[], player: Player, dealer: boolean, tsumo: boolean, settings: Settings, dora: number | number[], haitei = false, context: ScoreContext = {}): Score {
  const invalid: Score = { valid: false, lines: [], han: 0, fu: 0, base: 0n, multiplier: 1, total: 0n, dealerPayment: 0n, nonDealerPayment: 0n, shape: '', chosen: tiles };
  const memoryShape = settings.roundEvent === 'memory';
  const pairCount = expandedPairCount(tiles);
  if (tiles.length !== 14 && !pairCount) return invalid;
  const counts = countsOf(tiles);
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const kokushi = terminals.every(k => counts[k] > 0) && terminals.some(k => counts[k] > 1);
  const sevenPairs = counts.filter(n => n === 2).length === 7;
  const chuuren = settings.roundEvent === 'trump' ? null : chuurenExtra(counts);
  const kans = context.kans ?? [];
  const openMelds = context.openMelds ?? [];
  const closed = openMelds.length === 0;
  const scoredById = new Map(tiles.map(tile => [tile.id, tile]));
  const fixedTiles = [...kans.flatMap(kan => kan.slice(0, 3)), ...openMelds.flatMap(meld => meld.tiles.slice(0, 3))];
  if (fixedTiles.some(tile => scoredById.get(tile.id)?.kind !== tile.kind)) return invalid;
  const memoryMelds = context.memoryMelds?.map(meld => meld.map(tile => scoredById.get(tile.id)));
  const memoryPair = context.memoryPair?.map(tile => scoredById.get(tile.id));
  if (memoryShape && context.memoryMelds && (memoryMelds?.length !== 4 || memoryMelds.some(meld => meld.length !== 3 || meld.some(tile => !tile) || !isMemoryMeld(meld as Tile[]))
    || memoryPair?.length !== 2 || memoryPair.some(tile => !tile) || memoryPair[0]!.kind !== memoryPair[1]!.kind)) return invalid;
  const fixedMelds: Meld[] = [
    ...kans.map(kan => ({ type: 'triplet' as const, kind: kan[0].kind })),
    ...openMelds.map(meld => ({ type: meld.type === 'chi' ? 'sequence' as const : 'triplet' as const, kind: meld.type === 'chi' ? Math.min(...meld.tiles.map(tile => tile.kind)) : meld.tiles[0].kind })),
    ...(memoryShape && memoryMelds ? memoryMelds.map(meld => ({ type: meld[0]!.kind === meld[1]!.kind ? 'triplet' as const : 'sequence' as const, kind: Math.min(...meld.map(tile => tile!.kind)) })) : []),
  ];
  const respectsFixedMelds = (shape: StandardShape): boolean => {
    if (memoryShape && memoryPair && shape.pair !== memoryPair[0]!.kind) return false;
    const remaining = [...shape.melds];
    for (const fixed of fixedMelds) {
      const index = remaining.findIndex(meld => meld.type === fixed.type && meld.kind === fixed.kind);
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
    return true;
  };
  const options: { shape: string; groups?: StandardShape }[] = [];
  const run = settings.roundEvent === 'trump' && !fixedMelds.length ? trumpRun(tiles) : null;
  if (run && (settings.specialYaku?.superStraight !== false || run.lantern && closed && settings.specialYaku?.lantern !== false)) options.push({ shape: run.lantern && closed && settings.specialYaku?.lantern !== false ? '十三連宝燈' : '超一気通貫' });
  if (!memoryShape && kokushi && !fixedMelds.length) options.push({ shape: '国士無双' });
  if (!memoryShape && sevenPairs && !fixedMelds.length) options.push({ shape: '七対子' });
  if (!memoryShape && pairCount && !fixedMelds.length) options.push({ shape: `${['', '', '', '', '', '', '', '', '八', '九', '十', '十一', '十二', '十三', '十四'][pairCount]}対子` });
  if (!memoryShape && settings.localYaku?.shiisantou && context.initialDraw && tsumo && !fixedMelds.length && thirteenTower(tiles)) options.push({ shape: '十三不塔' });
  for (const groups of standardShapes(counts, settings.roundEvent)) if (respectsFixedMelds(groups)) options.push({ shape: '通常形', groups });
  if (!memoryShape && !fixedMelds.length) for (const groups of linkedShapes(counts, settings.roundEvent)) {
    const oneSuit = new Set(groups.melds.map(meld => suitOf(meld.kind))).size === 1;
    if (oneSuit ? settings.specialYaku?.isshokusanren !== false || settings.specialYaku?.sanrenko !== false : settings.specialYaku?.sanrenko !== false) options.push({ shape: '連子形', groups });
  }
  if (!options.length) return invalid;
  const physicalTiles = [...tiles.filter(tile => !tile.virtual || tile.compressedVirtual), ...kans.map(kan => kan[3]), ...openMelds.filter(meld => meld.type === 'kan').map(meld => meld.tiles[3])];
  const has = (special: Special) => physicalTiles.some(tile => tile.special === special);
  const all = (predicate: (kind: number) => boolean) => tiles.every(tile => predicate(tile.kind));
  const terminal = (kind: number): boolean => isTerminal(kind, settings.roundEvent);
  const allTerminal = all(terminal);
  const honors = tiles.some(tile => suitOf(tile.kind) === null);
  const suits = new Set(tiles.map(tile => suitOf(tile.kind)).filter((suit): suit is number => suit !== null));
  const seatWind = context.seatWind ?? (dealer ? 27 : 28);
  const roundWind = context.roundWind ?? 27;
  const win = context.winningTileId !== undefined && !tiles.some(tile => tile.id === context.winningTileId) ? undefined : context.winningKind;
  let best = invalid;
  for (const option of options) {
    const { shape, groups } = option;
    const melds = groups?.melds ?? [];
    const sequences = melds.filter(m => m.type === 'sequence');
    const triplets = melds.filter(m => m.type === 'triplet');
    const lines: string[] = [];
    let han = 0;
    let yakumanHan = 0;
    const yakumanLines: string[] = [];
    const roles: { name: string; han: number; yakuman: boolean; lineIndex: number; yakumanIndex?: number; suffixes: string[] }[] = [];
    const add = (name: string, value: number, oneHan = false, yakuman = false): void => {
      const boosted = oneHan && has('ichigo') ? 5 : value;
      const actual = settings.cards && hasCard(player, 'near') && player.nearPinActive ? Math.max(1, Math.floor(boosted / 2)) : boosted;
      const pureBoost = has('pure') && (name.startsWith('字一色') || name.startsWith('緑一色') || name.startsWith('清一色') || name.startsWith('一色三連'));
      const finalHan = yakuman && settings.cards && hasCard(player, 'yakumanBody') ? actual * 2 : actual;
      const suffixes = [boosted !== value ? '一期一会' : '', pureBoost ? '純粋牌' : '', actual !== boosted ? 'ニアピン' : '', finalHan !== actual ? '役満ボディ' : ''].filter(Boolean);
      const line = `${name} ${finalHan}翻${suffixes.length ? `（${suffixes.join('・')}）` : ''}`;
      const lineIndex = lines.push(line) - 1;
      const yakumanIndex = yakuman ? yakumanLines.push(line) - 1 : undefined;
      roles.push({ name, han: finalHan, yakuman, lineIndex, yakumanIndex, suffixes });
      han += finalHan;
      if (yakuman) yakumanHan += finalHan;
    };
    const changeRole = (role: typeof roles[number], nextHan: number, reason: string, yakuman = role.yakuman): void => {
      han += nextHan - role.han;
      if (role.yakuman) yakumanHan -= role.han;
      if (yakuman) yakumanHan += nextHan;
      role.han = nextHan;
      role.yakuman = yakuman;
      role.suffixes.push(reason);
      const line = `${role.name} ${nextHan}翻（${role.suffixes.join('・')}）`;
      lines[role.lineIndex] = line;
      if (role.yakumanIndex === undefined && yakuman) role.yakumanIndex = yakumanLines.push(line) - 1;
      else if (role.yakumanIndex !== undefined) yakumanLines[role.yakumanIndex] = line;
    };
    const pair = groups?.pair;
    const valuePair = pair !== undefined && (pair >= 31 && pair < 34 || pair === seatWind || pair === roundWind);
    const twoSided = !memoryShape && (win === undefined || sequences.some(m => {
      const suit = suitOf(m.kind)!, rank = rankOf(m.kind)!;
      return win === m.kind && rank < (settings.roundEvent === 'trump' ? 11 : 7) || win === suitKind(suit, rank + 2) && rank > 1;
    }));
    const remainingOpenSequences = openMelds.filter(meld => meld.type === 'chi').map(meld => Math.min(...meld.tiles.map(tile => tile.kind)));
    const concealedSequences = sequences.filter(meld => {
      const index = remainingOpenSequences.indexOf(meld.kind);
      if (index < 0) return true;
      remainingOpenSequences.splice(index, 1);
      return false;
    });
    const ronCompletesTriplet = !tsumo && win !== undefined && win !== pair && !concealedSequences.some(m => {
      const suit = suitOf(m.kind), rank = rankOf(m.kind);
      return suit !== null && rank !== null && [0, 1, 2].some(offset => win === suitKind(suit, rank + offset));
    });
    const pinfu = closed && shape === '通常形' && sequences.length === 4 && !valuePair && twoSided;
    if (tsumo && context.initialDraw && closed) add(dealer ? '天和' : '地和', 13, false, true);
    if (shape === '十三連宝燈') add('十三連宝燈', 169, false, true);
    else if (shape === '超一気通貫') add('超一気通貫', 13, false, true);
    else if (shape === '国士無双') {
      const pairKind = counts.findIndex(n => n === 2);
      const double = win === pairKind && settings.doubleYakuman?.kokushi13 !== false;
      add(double ? '国士無双十三面待ち' : '国士無双', double ? 26 : 13, false, true);
    }
    else if (shape === '十三不塔') add('十三不塔', 13, false, true);
    else {
      if (shape === '連子形') {
        const oneSuit = new Set(melds.map(meld => suitOf(meld.kind))).size === 1;
        if (oneSuit && settings.specialYaku?.isshokusanren !== false) add('一色三連', has('pure') ? 9 : 3);
        else if (!oneSuit && settings.specialYaku?.isshokusanren !== false && settings.cards && hasCard(player, 'near') && player.nearPinActive
          && [0, 1, 2].some(suit => melds.filter(meld => suitOf(meld.kind) === suit).length === 2)) add('一色三連まであと1面子', has('pure') ? 9 : 3);
        else if (settings.specialYaku?.sanrenko !== false) add('三連子', 1, true);
      }
      if (shape === '七対子') add('七対子', 2);
      else if (pairCount && shape.endsWith('対子')) add(shape, 2 ** (pairCount - 6));
      if (settings.localYaku?.renhou && context.initialRon && !tsumo) add('人和', 13, false, true);
      if (shape === '七対子' && settings.localYaku?.daisharin && Array.from({ length: 7 }, (_, i) => counts[10 + i]).every(n => n === 2)) add('大車輪', 13, false, true);
      if (shape === '七対子' && settings.localYaku?.daichisei && Array.from({ length: 7 }, (_, i) => counts[27 + i]).every(n => n === 2)) add('大七星', 13, false, true);
      if (chuuren !== null && closed) {
        const pure = win === chuuren && settings.doubleYakuman?.junseiChuuren !== false;
        add(pure ? '純正九蓮宝燈' : '九蓮宝燈', pure ? 26 : 13, false, true);
      }
      if (player.openRiichi) add('オープンリーチ', 2);
      else if (player.riichi && player.doubleRiichi) add('ダブル立直', 2);
      else if (player.riichi) add('立直', 1, true);
      if (context.openRiichiPenalty) add('オープンリーチ放銃', 13, false, true);
      if (player.riichi && player.ippatsu) add('一発', 1, true);
      if (tsumo && closed) add('門前清自摸和', 1, true);
      if (tsumo && context.rinshan) add('嶺上開花', 1, true);
      if (!tsumo && context.chankan) add('槍槓', 1, true);
      if (haitei && tsumo) add('海底摸月', 1, true);
      if (context.houtei && !tsumo) add('河底撈魚', 1, true);
      if (all(kind => !terminal(kind))) add('断么九', 1, true);
      for (const m of triplets) {
        if (m.kind >= 31 && m.kind < 34) add(`${tileName(m.kind)}の刻子`, 1, true);
        else if (m.kind === seatWind || m.kind === roundWind) {
          add(`${tileName(m.kind)}の刻子`, m.kind === seatWind && m.kind === roundWind ? 2 : 1, m.kind !== seatWind || m.kind !== roundWind);
        }
      }
      if (pinfu) add('平和', 1, true);
      else if (groups && closed && sequences.length === 3 && !valuePair && twoSided && settings.cards && hasCard(player, 'near') && player.nearPinActive) add('平和まであと1面子', 1, true);
      if (groups) {
        const sameTriplets = new Map<number, number>();
        for (const meld of triplets) sameTriplets.set(meld.kind, (sameTriplets.get(meld.kind) ?? 0) + 1);
        const maxSame = Math.max(0, ...sameTriplets.values());
        const nearSameTriplets = settings.cards && hasCard(player, 'near') && player.nearPinActive;
        if (counts.some(count => count === 14) && settings.specialYaku?.sameColor !== false) add('同一色', 39, false, true);
        else if (counts.some(count => count === 11) && nearSameTriplets && settings.specialYaku?.sameColor !== false) add('同一色まであと1面子', 39, false, true);
        else if (maxSame >= 4 && settings.specialYaku?.sameTriplet4 !== false) add('四同刻', 26, false, true);
        else if (maxSame === 3 && nearSameTriplets && settings.specialYaku?.sameTriplet4 !== false) add('四同刻まであと1面子', 26, false, true);
        else if (maxSame >= 3 && settings.specialYaku?.sameTriplet3 !== false) add('三同刻', closed ? 10 : 8);
        else if (maxSame === 2 && nearSameTriplets && settings.specialYaku?.sameTriplet3 !== false) add('三同刻まであと1面子', closed ? 10 : 8);
        else {
          const sameRankTriplets = Array.from({ length: settings.roundEvent === 'trump' ? 13 : 9 }, (_, i) => [0, 1, 2].filter(suit => triplets.some(meld => meld.kind === suitKind(suit, i + 1))).length);
          if (sameRankTriplets.includes(3)) add('三色同刻', 2);
          else if (sameRankTriplets.includes(2) && settings.cards && hasCard(player, 'near') && player.nearPinActive) add('三色同刻まであと1面子', 2);
        }
        if (triplets.length === 4) add('対々和', 2);
        else if (settings.cards && hasCard(player, 'near') && player.nearPinActive && triplets.length === 3) add('対々和まであと1面子', 2);
        const remainingOpenTriplets = openMelds.filter(meld => meld.type !== 'chi').map(meld => meld.tiles[0].kind);
        const remainingClosedKans = kans.map(kan => kan[0].kind);
        let ronTripletCounted = false;
        const concealedTriplets = triplets.filter(m => {
          const openIndex = remainingOpenTriplets.indexOf(m.kind);
          if (openIndex >= 0) { remainingOpenTriplets.splice(openIndex, 1); return false; }
          const kanIndex = remainingClosedKans.indexOf(m.kind);
          if (kanIndex >= 0) { remainingClosedKans.splice(kanIndex, 1); return true; }
          if (ronCompletesTriplet && win === m.kind && !ronTripletCounted) { ronTripletCounted = true; return false; }
          return true;
        }).length;
        const fourConcealedTriplets = triplets.length === 4 && concealedTriplets === 4 && closed;
        const nearFourConcealedTriplets = closed && concealedTriplets === 3 && settings.cards && hasCard(player, 'near') && player.nearPinActive;
        if (concealedTriplets >= 3 && !fourConcealedTriplets && !nearFourConcealedTriplets) add('三暗刻', 2);
        else if (settings.cards && hasCard(player, 'near') && player.nearPinActive && concealedTriplets === 2) add('三暗刻まであと1面子', 2);
        if (fourConcealedTriplets) {
          const double = win === pair && settings.doubleYakuman?.suankoTanki !== false;
          add(double ? '四暗刻単騎' : '四暗刻', double ? 26 : 13, false, true);
        }
        else if (nearFourConcealedTriplets) add('四暗刻まであと1面子', 13, false, true);
        if (settings.localYaku?.suurenko) {
          const consecutiveTriplets = (length: number): boolean => [0, 9, 18].some(suit => Array.from({ length: 10 - length }, (_, rank) => rank).some(rank => Array.from({ length }, (_, offset) => suit + rank + offset).every(kind => triplets.some(m => m.kind === kind))));
          if (triplets.length === 4 && consecutiveTriplets(4)) add('四連刻', 13, false, true);
          else if (settings.cards && hasCard(player, 'near') && player.nearPinActive && consecutiveTriplets(3)) add('四連刻まであと1面子', 13, false, true);
        }
        const kanCount = kans.length + openMelds.filter(meld => meld.type === 'kan').length;
        const nearFourKans = kanCount === 3 && settings.cards && hasCard(player, 'near') && player.nearPinActive;
        if (kanCount >= 4) add('四槓子', settings.kanYakuEnhanced === false ? 13 : 26, false, true);
        else if (kanCount >= 3 && !nearFourKans) add('三槓子', settings.kanYakuEnhanced === false ? 2 : 13, false, settings.kanYakuEnhanced !== false);
        if (settings.cards && hasCard(player, 'near') && player.nearPinActive) {
          if (nearFourKans) add('四槓子まであと1面子', settings.kanYakuEnhanced === false ? 13 : 26, false, true);
          else if (kanCount === 2) add('三槓子まであと1面子', settings.kanYakuEnhanced === false ? 2 : 13, false, settings.kanYakuEnhanced !== false);
        }
        const sequenceCount = new Map<number, number>();
        for (const m of sequences) sequenceCount.set(m.kind, (sequenceCount.get(m.kind) ?? 0) + 1);
        const repeated = [...sequenceCount.values()].reduce((n, count) => n + Math.floor(count / 2), 0);
        const nearTwoIdenticalSequences = closed && repeated === 1 && sequences.length === 4 && settings.cards && hasCard(player, 'near') && player.nearPinActive;
        if (closed && repeated >= 2) add('二盃口', 3);
        else if (closed && repeated === 1 && !nearTwoIdenticalSequences) add('一盃口', 1, true);
        if (closed && settings.cards && hasCard(player, 'near') && player.nearPinActive) {
          if (nearTwoIdenticalSequences) add('二盃口まであと1面子', 3);
          else if (repeated === 0 && sequences.length > 0) add('一盃口まであと1面子', 1, true);
        }
        const sanshokuCounts = Array.from({ length: settings.roundEvent === 'trump' ? 11 : 7 }, (_, i) => [0, 1, 2].filter(suit => sequenceCount.has(suitKind(suit, i + 1))).length);
        if (sanshokuCounts.includes(3)) add('三色同順', closed ? 2 : 1, !closed);
        else if (sanshokuCounts.includes(2) && settings.cards && hasCard(player, 'near') && player.nearPinActive) add('三色同順まであと1面子', 2);
        const ittsuCounts = [0, 9, 18].map(suit => [suit, suit + 3, suit + 6].filter(kind => sequenceCount.has(kind)).length);
        if (ittsuCounts.includes(3)) add('一気通貫', closed ? 2 : 1, !closed);
        else if (ittsuCounts.includes(2) && settings.cards && hasCard(player, 'near') && player.nearPinActive) add('一気通貫まであと1面子', 2);
        const nearPin = settings.cards && hasCard(player, 'near') && player.nearPinActive;
        const simpleGroup = (m: Meld): boolean => m.type === 'triplet'
          ? !terminal(m.kind)
          : !terminal(m.kind) && !terminal(suitKind(suitOf(m.kind)!, rankOf(m.kind)! + (m.type === 'linked' ? 3 : 2)));
        if (nearPin && pair !== undefined && !terminal(pair) && melds.filter(simpleGroup).length === melds.length - 1) add('断么九まであと1面子', 1, true);
        const groupHasTerminal = (m: Meld): boolean => m.type === 'triplet' ? terminal(m.kind) : rankOf(m.kind) === 1 || rankOf(m.kind) === (settings.roundEvent === 'trump' ? 11 : 7);
        const terminalGroups = terminal(pair!) && melds.every(groupHasTerminal);
        if (terminalGroups && sequences.length) {
          if (!honors || has('purify')) add(honors ? '純全帯幺九（浄化牌）' : '純全帯幺九', closed ? 3 : 2);
          else add('混全帯幺九', closed ? 2 : 1, !closed);
        } else if (nearPin && shape !== '連子形' && pair !== undefined && terminal(pair)) {
          const mixedGroups = melds.filter(groupHasTerminal).length;
          const pureGroups = melds.filter(m => groupHasTerminal(m) && suitOf(m.kind) !== null).length;
          if (pair < 27 && pureGroups >= 3) add('純全帯幺九まであと1面子', closed ? 3 : 2);
          else if (mixedGroups >= 3 && has('purify')) add('純全帯幺九まであと1面子（浄化牌）', closed ? 3 : 2);
          else if (mixedGroups >= 3) add('混全帯幺九まであと1面子', closed ? 2 : 1, !closed);
        }
        if (nearPin && pair !== undefined && terminal(pair) && !allTerminal) {
          const terminalTriplets = triplets.filter(m => terminal(m.kind));
          if (terminalTriplets.length === 3) {
            const pureTerminals = suitOf(pair) !== null && terminalTriplets.every(m => suitOf(m.kind) !== null);
            if (pureTerminals || has('purify')) add(`清老頭まであと1面子${pureTerminals ? '' : '（浄化牌）'}`, 13, false, true);
            else add('混老頭まであと1面子', 2);
          }
        }
        const dragonKinds = new Set(triplets.filter(m => m.kind >= 31 && m.kind < 34).map(m => m.kind));
        const dragonPair = pair !== undefined && pair >= 31 && pair < 34 && !dragonKinds.has(pair);
        if (dragonKinds.size === 2 && dragonPair) add('小三元', 2);
        else if (dragonKinds.size === 1 && dragonPair && nearPin) add('小三元まであと1面子', 2);
        if (dragonKinds.size === 3) add('大三元', 13, false, true);
        else if (dragonKinds.size === 2 && pair !== undefined && (pair < 31 || pair >= 34) && nearPin) add('大三元まであと1面子', 13, false, true);
        const windKinds = new Set(triplets.filter(m => m.kind >= 27 && m.kind <= 30).map(m => m.kind));
        const windPair = pair !== undefined && pair >= 27 && pair <= 30 && !windKinds.has(pair);
        if (windKinds.size === 4) add('大四喜', settings.doubleYakuman?.daisuushii === false ? 13 : 26, false, true);
        else if (windKinds.size === 3 && windPair) add('小四喜', 13, false, true);
        else if (windKinds.size === 2 && windPair && nearPin) add('小四喜まであと1面子', 13, false, true);
        if (windKinds.size === 3 && pair !== undefined && (pair < 27 || pair > 30) && nearPin) add('大四喜まであと1面子', settings.doubleYakuman?.daisuushii === false ? 13 : 26, false, true);
      }
      if (allTerminal && shape !== '国士無双') {
        if (honors && has('purify')) add('清老頭（浄化牌）', 13, false, true);
        else if (honors) add('混老頭', 2);
        else add('清老頭', 13, false, true);
      }
      const allHonors = all(kind => kind >= 27 && kind < 34);
      const greenKinds = [19, 20, 21, 23, 25, 32];
      const allGreen = all(kind => greenKinds.includes(kind));
      if (allHonors) add('字一色', has('pure') ? 39 : 13, false, true);
      if (allGreen) add('緑一色', has('pure') ? 39 : 13, false, true);
      if (groups && settings.cards && hasCard(player, 'near') && player.nearPinActive) {
        if (!allHonors && groups.pair >= 27 && groups.pair < 34 && melds.filter(meld => meld.type === 'triplet' && meld.kind >= 27 && meld.kind < 34).length === 3) {
          add('字一色まであと1面子', has('pure') ? 39 : 13, false, true);
        }
        if (!allGreen && greenKinds.includes(groups.pair) && melds.filter(meld => meld.type === 'triplet' ? greenKinds.includes(meld.kind) : meld.kind === 19).length === 3) {
          add('緑一色まであと1面子', has('pure') ? 39 : 13, false, true);
        }
      }
      if (suits.size === 1) {
        if (honors) add(has('purify') ? '清一色（浄化牌）' : '混一色', has('purify') ? (has('pure') ? (closed ? 18 : 15) : closed ? 6 : 5) : closed ? 3 : 2);
        else add('清一色', has('pure') ? (closed ? 18 : 15) : closed ? 6 : 5);
      }
      if (groups && settings.cards && hasCard(player, 'near') && player.nearPinActive) {
        const pairSuit = suitOf(groups.pair);
        const requiredGroups = melds.length - 1;
        if (pairSuit !== null && !(suits.size === 1 && (!honors || has('purify'))) && [0, 1, 2].some(suit => suit === pairSuit && melds.filter(meld => suitOf(meld.kind) === suit).length === requiredGroups)) {
          add('清一色まであと1面子', has('pure') ? (closed ? 18 : 15) : closed ? 6 : 5);
        } else if (suits.size > 1 && [0, 1, 2].some(suit => (pairSuit === suit || pairSuit === null) && melds.filter(meld => suitOf(meld.kind) === suit || suitOf(meld.kind) === null).length === requiredGroups)) {
          if (has('purify')) add('清一色まであと1面子（浄化牌）', has('pure') ? (closed ? 18 : 15) : closed ? 6 : 5);
          else add('混一色まであと1面子', closed ? 3 : 2);
        }
      }
    }
    if (settings.cards && hasCard(player, 'nakimushi') && openMelds.length === 4 && groups && win === groups.pair) add('なきむし', 13, false, true);
    if (settings.cards && hasCard(player, 'tanyao32000') && roles.length === 1 && roles[0].name === '断么九'
      && tiles.every(tile => { const rank = rankOf(tile.kind); return rank !== null && rank >= 2 && rank <= 5; })) {
      const body = hasCard(player, 'yakumanBody');
      changeRole(roles[0], body ? 26 : 13, body ? 'タンヤオ32000点・役満ボディ' : 'タンヤオ32000点', true);
    }
    if (settings.cards && hasCard(player, 'gekokujou') && context.finalRoundLast) {
      const body = hasCard(player, 'yakumanBody');
      for (const role of roles) changeRole(role, body ? 26 : 13, body ? '下克上・役満ボディ' : '下克上', true);
    }
    if (settings.cards && hasCard(player, 'oni')) {
      const eligible = roles.filter(role => !yakumanHan || settings.yakumanStack || role.yakuman);
      if (eligible.length > 1) {
        const highest = eligible.reduce((bestRole, role) => role.han > bestRole.han ? role : bestRole);
        changeRole(highest, highest.han * eligible.length, '鬼に金棒');
      }
    }
    if (!han) continue;
    if (yakumanHan && !settings.yakumanStack) { han = yakumanHan; lines.splice(0, lines.length, ...yakumanLines); }
    if (has('irregular') && (!yakumanHan || settings.yakumanStack)) { han += 20; lines.push('イレギュラー +20翻'); }
    const doraKinds = Array.isArray(dora) ? dora : [dora];
    const naturalDora = doraKinds.reduce((n, kind) => n + physicalTiles.filter(tile => tile.kind === kind).length, 0);
    const redDora = physicalTiles.filter(tile => tile.red).length;
    const kanDora = (kans.filter(kan => kan.some(tile => tile.special === 'drumming')).length + openMelds.filter(meld => meld.type === 'kan' && meld.tiles.some(tile => tile.special === 'drumming')).length) * 4;
    const doraCount = naturalDora + kanDora + redDora;
    if (redDora && (!yakumanHan || settings.yakumanStack)) lines.push(`赤ドラ ${redDora}枚`);
    if (kanDora && (!yakumanHan || settings.yakumanStack)) lines.push(`ドラミングビートの槓 +${kanDora}ドラ`);
    if (doraCount && (!yakumanHan || settings.yakumanStack)) { const value = doraCount * (has('drumming') ? 2 : 1); han += value; lines.push(`ドラ ${doraCount}枚 → ${value}翻`); }
    const northCount = settings.playerCount === 3 ? player.northTiles?.length ?? 0 : 0;
    if (northCount && (!yakumanHan || settings.yakumanStack)) { han += northCount; lines.push(`北抜き ${northCount}枚 → ${northCount}翻`); }
    if (player.riichi && context.uraDora !== undefined) {
      const uraKinds = Array.isArray(context.uraDora) ? context.uraDora : [context.uraDora];
      const uraCount = uraKinds.reduce((n, kind) => n + physicalTiles.filter(tile => tile.kind === kind).length, 0);
      if (uraCount && (!yakumanHan || settings.yakumanStack)) { const value = uraCount * (has('drumming') ? 2 : 1); han += value; lines.push(`裏ドラ ${uraCount}枚 → ${value}翻`); }
    }
    let fu = shape === '国士無双' || shape === '十三不塔' ? 0 : shape.endsWith('対子') ? 25 : 20;
    if (groups) {
      if (pair !== undefined) {
        if (pair >= 31 && pair < 34) fu += 2;
        if (pair === seatWind) fu += 2;
        if (pair === roundWind) fu += 2;
      }
      const remainingKans = kans.map(kan => kan[0].kind);
      const remainingOpenKans = openMelds.filter(meld => meld.type === 'kan').map(meld => meld.tiles[0].kind);
      const remainingOpenPons = openMelds.filter(meld => meld.type === 'pon').map(meld => meld.tiles[0].kind);
      let ronTripletCounted = false;
      for (const m of triplets) {
        const kanIndex = remainingKans.indexOf(m.kind);
        if (kanIndex >= 0) {
          remainingKans.splice(kanIndex, 1);
          fu += terminal(m.kind) ? 32 : 16;
          continue;
        }
        const openKanIndex = remainingOpenKans.indexOf(m.kind);
        if (openKanIndex >= 0) { remainingOpenKans.splice(openKanIndex, 1); fu += terminal(m.kind) ? 16 : 8; continue; }
        const openPonIndex = remainingOpenPons.indexOf(m.kind);
        if (openPonIndex >= 0) { remainingOpenPons.splice(openPonIndex, 1); fu += terminal(m.kind) ? 4 : 2; continue; }
        const openedByRon = ronCompletesTriplet && win === m.kind && !ronTripletCounted;
        if (openedByRon) ronTripletCounted = true;
        fu += (terminal(m.kind) ? 8 : 4) * (openedByRon ? 0.5 : 1);
      }
      if (!pinfu && win !== undefined && (win === pair || sequences.some(m => { const suit = suitOf(m.kind)!, rank = rankOf(m.kind)!; return win === suitKind(suit, rank + 1) || win === m.kind && rank === (settings.roundEvent === 'trump' ? 11 : 7) || win === suitKind(suit, rank + 2) && rank === 1; }))) fu += 2;
      if (tsumo && !pinfu) fu += 2;
      if (!tsumo && closed) fu += 10;
      fu = Math.ceil(fu / 10) * 10;
      if (fu === 20 && !tsumo) fu = 30;
    }
    if (has('shochikubai')) { const added = physicalTiles.filter(tile => suitOf(tile.kind) === 2).length * 10; fu += added; lines.push(`松竹梅 +${added}符`); }
    if (settings.roundEvent === 'trump' || settings.roundEvent === 'tenchou') {
      const roundKanCount = context.roundKanCount ?? kans.length + openMelds.filter(meld => meld.type === 'kan').length;
      const revolution = settings.roundEvent === 'trump' ? roundKanCount % 2 === 1 ? '革命' : roundKanCount >= 2 ? '革命返し' : '' : '';
      const scoringTiles = [...tiles, ...kans.map(kan => kan[3]), ...openMelds.filter(meld => meld.type === 'kan').map(meld => meld.tiles[3])];
      const added = scoringTiles.reduce((sum, tile) => {
        const rank = rankOf(tile.kind);
        if (rank === null) return sum;
        if (revolution === '革命' && rank === 3 || revolution === '革命返し' && rank === 2) return sum + 1300;
        if (revolution && (rank === 2 || rank === 3)) return sum + 100;
        return sum + rank * 100;
      }, 0);
      fu += added;
      lines.push(`数牌ボーナス +${added}符${revolution ? `（${revolution}）` : ''}`);
    }
    const scoringFu = fu || 30;
    const base = basePoints(han, scoringFu, settings.roundEvent === 'seitenjo' || (settings.cards && hasCard(player, 'seitenjo')), settings.kazoeMultiple);
    const dealerShare = round100(base * 2n);
    const nonDealerShare = round100(base * (dealer ? 2n : 1n));
    const ordinary = tsumo ? (dealer ? nonDealerShare * BigInt((settings.playerCount ?? 4) - 1) : dealerShare + nonDealerShare * BigInt((settings.playerCount ?? 4) - 2)) : round100(base * (dealer ? 6n : 4n));
    let multiplier = 1;
    if (has('knockout') && !tsumo) { multiplier *= closed ? 5 : 3; lines.push(`ノックアウト ×${closed ? 5 : 3}`); }
    if (has('musou') && shape === '国士無双') { multiplier *= 10; lines.push('圧倒的無双 ×10'); }
    if (tsumo && context.winningTileId !== undefined && tiles.some(tile => tile.id === context.winningTileId && tile.special === 'destiny')) { multiplier *= 5; lines.push('運命の導き ×5'); }
    if (settings.cards && hasCard(player, 'menzen') && closed) { multiplier *= 2; lines.push('面前至上主義 ×2'); }
    if (settings.cards && hasCard(player, 'early') && player.discards < 7) { multiplier *= 3; lines.push('お先に失礼 ×3'); }
    if (settings.cards && hasCard(player, 'ultimate') && player.riichi && !player.ultimatePenaltyDone && (player.riichiDraws ?? 0) <= 6) { multiplier *= 10; lines.push('アルティメットリーチ ×10'); }
    if (settings.cards && hasCard(player, 'highRisk')) { multiplier *= 3; lines.push('ハイリスクハイリターン ×3'); }
    if (settings.roundEvent === 'memory') { multiplier *= 3; lines.push('神経衰弱 ×3'); }
    const candidate: Score = { valid: true, lines, han, fu, base: ordinary, multiplier, total: ordinary * BigInt(multiplier), dealerPayment: dealerShare * BigInt(multiplier), nonDealerPayment: nonDealerShare * BigInt(multiplier), shape, chosen: tiles };
    if (!best.valid || candidate.total > best.total) best = candidate;
  }
  return best;
}
function fixedMeldTileIds(context: ScoreContext): Set<number> {
  return new Set([...(context.kans ?? []).flatMap(kan => kan.slice(0, 3)), ...(context.openMelds ?? []).flatMap(meld => meld.tiles.slice(0, 3))].map(tile => tile.id));
}
export function bestScore(hand: Tile[], player: Player, dealer: boolean, tsumo: boolean, settings: Settings, dora: number | number[], haitei = false, context: ScoreContext = {}, tripletExpanded = false, compressedExpanded = false): Score {
  if (!compressedExpanded && hand.some(tile => tile.compressedMate)) {
    let best = scoreHand([], player, dealer, tsumo, settings, dora, haitei, context);
    for (const variant of compressedVariants(hand, context.winningTileId)) {
      const candidate = bestScore(variant, player, dealer, tsumo, settings, dora, haitei, context, false, true);
      if (candidate.valid && (!best.valid || candidate.total > best.total)) best = candidate;
    }
    return best;
  }
  if (!tripletExpanded && settings.roundEvent !== 'memory' && hand.some(tile => tile.special === 'triplet')) {
    let best: Score | null = (settings.roundEvent === 'trump' && trumpRun(hand)) || expandedPairCount(hand) ? scoreHand(hand, player, dealer, tsumo, settings, dora, haitei, context) : null;
    for (const variant of tripletVariants(hand, context.winningTileId, fixedMeldTileIds(context))) {
      const score = bestScore(variant, player, dealer, tsumo, settings, dora, haitei, context, true, compressedExpanded);
      if (!best || score.valid && (!best.valid || score.total > best.total)) best = score;
    }
    return best ?? scoreHand([], player, dealer, tsumo, settings, dora, haitei, context);
  }
  let best = scoreHand(hand, player, dealer, tsumo, settings, dora, haitei, context);
  const fixedIds = fixedMeldTileIds(context);
  const rainbows = hand.filter(t => t.special === 'rainbow' && !fixedIds.has(t.id));
  if (!rainbows.length) return best;
  const work = hand.map(t => ({ ...t }));
  let indexes = work.map((t, i) => t.special === 'rainbow' && !fixedIds.has(t.id) ? i : -1).filter(i => i >= 0);
  const winnerIndex = indexes.findIndex(i => work[i].id === context.winningTileId);
  if (winnerIndex > 0) indexes.unshift(indexes.splice(winnerIndex, 1)[0]);
  const pairedUnits = new Set<string>();
  indexes = indexes.filter(index => {
    const tile = hand[index];
    const partner = tile.compressedMate ? hand.find(other => other.id === tile.compressedMate!.id) : tile.compressedVirtual ? hand.find(other => other.compressedMate?.id === tile.id) : undefined;
    const key = partner ? `pair:${Math.min(tile.id, partner.id)}:${Math.max(tile.id, partner.id)}` : `tile:${tile.id}`;
    if (pairedUnits.has(key)) return false;
    pairedUnits.add(key);
    return true;
  });
  const symmetryKeys = indexes.map(index => {
    const tile = hand[index];
    const partner = tile.compressedMate ? hand.find(other => other.id === tile.compressedMate!.id) : tile.compressedVirtual ? hand.find(other => other.compressedMate?.id === tile.id) : undefined;
    if (tile.id === context.winningTileId || partner?.id === context.winningTileId) return `winner:${tile.id}`;
    if (tile.compressedMate || partner) return `pair:${tile.id}`;
    return `ordinary:${!!tile.red}:${!!tile.virtual}`;
  });
  const assignedKinds = new Map<string, number>();
  const changeRainbowPair = (index: number, kind: number): void => {
    const tile = work[index];
    const mateId = tile.compressedMate?.id;
    const partner = mateId !== undefined ? work.find(other => other.id === mateId) : tile.compressedVirtual ? work.find(other => other.compressedMate?.id === tile.id) : undefined;
    for (const member of partner ? [tile, partner] : [tile]) {
      const original = hand.find(other => other.id === member.id);
      if (original) Object.assign(member, { ...original, compressedMate: original.compressedMate ? { ...original.compressedMate } : undefined });
      changeTileKind(member, kind, settings.roundEvent);
    }
  };
  const search = (at: number): void => {
    if (at === indexes.length) {
      const winningKind = context.winningTileId === undefined ? context.winningKind : work.find(t => t.id === context.winningTileId)?.kind;
      const candidate = scoreHand(work, player, dealer, tsumo, settings, dora, haitei, { ...context, winningKind });
      if (candidate.valid && candidate.total > best.total) best = { ...candidate, chosen: work.map(t => ({ ...t })) };
      return;
    }
    const key = symmetryKeys[at];
    const previous = assignedKinds.get(key);
    for (const k of availableKinds(settings.roundEvent, settings.playerCount)) {
      if (previous !== undefined && k < previous) continue;
      changeRainbowPair(indexes[at], k);
      assignedKinds.set(key, k);
      search(at + 1);
    }
    if (previous === undefined) assignedKinds.delete(key); else assignedKinds.set(key, previous);
  };
  search(0);
  return best;
}
export function bestScoreWithExtra(hand: Tile[], player: Player, dealer: boolean, tsumo: boolean, settings: Settings, dora: number | number[], haitei = false, context: ScoreContext = {}): Score {
  if (hand.length !== 15) return bestScore(hand, player, dealer, tsumo, settings, dora, haitei, context);
  const fixedIds = fixedMeldTileIds(context);
  let best: Score | null = null;
  for (let i = 0; i < hand.length; i++) {
    if (fixedIds.has(hand[i].id)) continue;
    const candidate = bestScore(hand.filter((_, j) => i !== j), player, dealer, tsumo, settings, dora, haitei, context);
    if (!best || candidate.valid && (!best.valid || candidate.total > best.total)) best = candidate;
  }
  return best ?? bestScore([], player, dealer, tsumo, settings, dora, haitei, context);
}
export function bestRiverScore(river: Tile[], player: Player, dealer: boolean, settings: Settings, dora: number | number[], context: ScoreContext = {}): Score | null {
  if (river.length < 14) return null;
  if (!river.some(tile => tile.special === 'rainbow' || tile.special === 'triplet') && !river.some((tile, index) => river.slice(index + 1).some(other => other.kind === tile.kind))) return null;
  const chosen: Tile[] = [];
  let best: Score | null = null;
  const signature = (tile: Tile): string => context.winningTileId !== undefined
    ? String(tile.id)
    : `${tile.kind}/${tile.special ?? ''}/${tile.red ? 1 : 0}/${tile.virtual ? 1 : 0}`;
  const evaluate = (): void => {
    const candidate = bestScore(chosen, player, dealer, true, settings, dora, false, context);
    if (candidate.valid && (!best || candidate.total > best.total)) best = { ...candidate, chosen: candidate.chosen.map(tile => ({ ...tile })) };
  };
  if (context.winningTileId === undefined && !(settings.localYaku?.shiisantou && context.initialDraw) && !river.some(tile => tile.special === 'rainbow' || tile.special === 'triplet' || tile.virtual)) {
    const byKind = Array.from({ length: 46 }, () => [] as Tile[]);
    for (const tile of river) byKind[tile.kind].push(tile);
    const available = byKind.map(group => group.length);
    const used = Array(46).fill(0) as number[];
    const examined = new Set<string>();
    const choosePhysical = (kinds: number[], at: number): void => {
      if (at === kinds.length) { evaluate(); return; }
      const kind = kinds[at], group = byKind[kind], count = used[kind];
      const select = (from: number, remaining: number, picked: Tile[]): void => {
        if (!remaining) {
          chosen.push(...picked);
          choosePhysical(kinds, at + 1);
          chosen.length -= picked.length;
          return;
        }
        const seen = new Set<string>();
        for (let i = from; i <= group.length - remaining; i++) {
          const key = signature(group[i]);
          if (seen.has(key)) continue;
          seen.add(key);
          picked.push(group[i]);
          select(i + 1, remaining - 1, picked);
          picked.pop();
        }
      };
      select(0, count, []);
    };
    const accept = (): void => {
      const key = used.join(',');
      if (examined.has(key)) return;
      examined.add(key);
      choosePhysical(used.map((count, kind) => count ? kind : -1).filter(kind => kind >= 0), 0);
    };
    const melds: number[][] = [];
    for (let kind = 0; kind < 46; kind++) {
      melds.push([kind, kind, kind]);
      const suit = suitOf(kind), rank = rankOf(kind);
      if (suit !== null && rank !== null && rank <= (settings.roundEvent === 'trump' ? 11 : 7)) melds.push([kind, suitKind(suit, rank + 1), suitKind(suit, rank + 2)]);
    }
    const meldSearch = (from: number, remaining: number): void => {
      if (!remaining) { accept(); return; }
      for (let i = from; i < melds.length; i++) {
        const meld = melds[i];
        for (const kind of meld) used[kind]++;
        if (meld.every(kind => used[kind] <= available[kind])) meldSearch(i, remaining - 1);
        for (const kind of meld) used[kind]--;
      }
    };
    for (let pair = 0; pair < 46; pair++) if (available[pair] >= 2) {
      used[pair] = 2;
      meldSearch(0, 4);
      used[pair] = 0;
    }
    const pairKinds = available.map((count, kind) => count >= 2 ? kind : -1).filter(kind => kind >= 0);
    const sevenPairs = (from: number, remaining: number): void => {
      if (!remaining) { accept(); return; }
      for (let i = from; i <= pairKinds.length - remaining; i++) {
        used[pairKinds[i]] = 2;
        sevenPairs(i + 1, remaining - 1);
        used[pairKinds[i]] = 0;
      }
    };
    sevenPairs(0, 7);
    const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
    if (terminals.every(kind => available[kind] >= 1)) {
      for (const kind of terminals) used[kind] = 1;
      for (const kind of terminals) if (available[kind] >= 2) { used[kind]++; accept(); used[kind]--; }
      for (const kind of terminals) used[kind] = 0;
    }
    if (settings.roundEvent === 'trump') for (let suit = 0; suit < 3; suit++) {
      const kinds = Array.from({ length: 13 }, (_, i) => suitKind(suit, i + 1));
      if (!kinds.every(kind => available[kind] >= 1)) continue;
      for (const kind of kinds) used[kind] = 1;
      for (const kind of kinds) if (available[kind] >= 2) { used[kind]++; accept(); used[kind]--; }
      for (const kind of kinds) used[kind] = 0;
    }
    return best;
  }
  const search = (from: number): void => {
    if (chosen.length === 14) {
      if (!chosen.some(tile => tile.special === 'triplet') && !isWinningShape(chosen, settings.roundEvent)) return;
      evaluate();
      return;
    }
    const needed = 14 - chosen.length;
    const seen = new Set<string>();
    for (let i = from; i <= river.length - needed; i++) {
      const key = signature(river[i]);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(river[i]);
      search(i + 1);
      chosen.pop();
    }
  };
  search(0);
  return best;
}
export function doraFromIndicator(k: number, event: RoundEvent = 'none', playerCount: 3 | 4 = 4, tenchouActivated = false): number {
  if (event === 'trump') { const suit = suitOf(k), rank = rankOf(k); if (suit !== null && rank !== null) return suitKind(suit, rank % 13 + 1); }
  if (playerCount === 3 && !(event === 'tenchou' && tenchouActivated) && (k === 0 || k === 8)) return k === 0 ? 8 : 0;
  if (k < 27) return Math.floor(k / 9) * 9 + (k % 9 + 1) % 9;
  if (k < 31) return 27 + (k - 27 + 1) % 4;
  return 31 + (k - 31 + 1) % 3;
}
