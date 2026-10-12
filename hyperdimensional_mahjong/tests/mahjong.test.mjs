import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseCompressedTile } from '../src/mahjong.ts';
import { randomChangeKind } from '../src/mahjong.ts';
import { dancerExpandedPairs } from '../src/mahjong.ts';
import { dancerLanternChoices } from '../src/mahjong.ts';

test('踊り子は刻子牌を両端に保持して十三連宝燈の聴牌形を生成する', () => {
  const hand = tiles(Array(13).fill(27));
  hand[3].special = 'triplet'; hand[10].special = 'triplet';
  const choice = dancerLanternChoices(hand, 'trump');
  assert.equal(choice.role, '十三連宝燈');
  assert.equal(choice.variants.length, 3);
  choice.variants.forEach((pattern, suit) => {
    assert.equal(pattern[3], suitKind(suit, 1));
    assert.equal(pattern[10], suitKind(suit, 13));
    const changed = hand.map((tile, index) => ({ ...tile, kind: pattern[index] }));
    assert.equal(dancerHandReachesRole(changed, choice.role, 'trump', 4, settings), true);
    assert.equal(waitKinds(changed, 'trump').length, 13);
  });
  assert.equal(dancerLanternChoices(hand, 'none'), null);
  assert.equal(dancerLanternChoices(hand, 'trump', false), null);
  const compressed = hand.map(tile => ({ ...tile }));
  compressed[0].compressedMate = { id: 100, kind: 27 };
  assert.equal(dancerLanternChoices(compressed, 'trump'), null);
  hand[3].special = undefined;
  assert.equal(dancerLanternChoices(hand, 'trump'), null);
});

test('踊り子は圧縮牌2〜12枚から八対子〜十三対子の実手牌を生成する', () => {
  for (const event of ['none', 'hachiku', 'trump']) for (const compressed of [2, 4, 6, 8, 10, 12]) {
    const hand = Array.from({ length: 13 }, (_, id) => ({ id, kind: 27, ...(id < compressed ? { compressedMate: { id: 100 + id, kind: 27 } } : {}) }));
    const choice = dancerExpandedPairs(hand, event, 3);
    assert.ok(choice);
    assert.equal(choice.variants.length, 3);
    let reachable = false;
    for (const candidate of choice.variants) {
      assert.equal(candidate.length, 13);
      assert.ok(candidate.every(kind => availableKinds(event, 3).includes(kind)));
      const changed = hand.map((tile, index) => ({ ...tile, kind: candidate[index], ...(tile.compressedMate ? { compressedMate: { ...tile.compressedMate, kind: candidate[index] } } : {}) }));
      reachable ||= dancerHandReachesRole(changed, choice.role, event, 3, settings);
    }
    assert.equal(reachable, true, `${event}/${compressed}/${choice.role}`);
  }
  const plain = tiles(Array(13).fill(27));
  assert.equal(dancerExpandedPairs(plain, 'none', 4), null);
  plain[0].compressedMate = { id: 100, kind: 27 };
  assert.equal(dancerExpandedPairs(plain, 'none', 4), null);
});

test('千変万化はトランプマジックの拡張数牌も等しい抽選幅で生成する', () => {
  for (const event of ['none', 'hachiku', 'trump']) {
    const count = event === 'trump' ? 13 : 9;
    const suit = event === 'hachiku' ? 2 : 1;
    for (let rank = 1; rank <= count; rank++) {
      assert.equal(randomChangeKind(event, () => (rank - 1) / count), suitKind(suit, rank));
      assert.equal(randomChangeKind(event, () => (rank - 0.01) / count), suitKind(suit, rank));
    }
    assert.equal(randomChangeKind(event, () => 0.9999999), suitKind(suit, count));
  }
  const tile = { id: 990, kind: 0, special: 'musou', red: true };
  changeTileKind(tile, randomChangeKind('trump', () => 0.9999999), 'trump');
  assert.equal(tile.kind, suitKind(1, 13));
  assert.equal(tile.special, 'musou');
  assert.equal(tile.red, undefined);
});

test('踊り子の目標役は特殊牌による役変換後の実手牌でも成立を確認する', () => {
  const hand = tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 31, 31, 31, 0]);
  assert.equal(dancerHandReachesRole(hand, '混一色', 'none', 4, settings), true);
  hand[0].special = 'purify';
  assert.equal(dancerHandReachesRole(hand, '混一色', 'none', 4, settings), true);
  assert.equal(dancerHandReachesRole(hand, '混老頭', 'none', 4, settings), false);
  assert.equal(dancerHandReachesRole(hand, '清一色（浄化牌）', 'none', 4, settings), true);
  hand[0].special = 'pure';
  assert.equal(dancerHandReachesRole(hand, '混一色', 'none', 4, settings), true);
});

test('踊り子はカン後の残り手牌へ固定カンを加えて役到達を確認する', () => {
  for (const count of [1, 2, 3, 4]) {
    const kinds = [27, 28, 29, 30].slice(0, count);
    const kans = kinds.map((kind, group) => Array.from({ length: 4 }, (_, copy) => ({ id: 1000 + group * 4 + copy, kind })));
    const pattern = dancerKanFallback(kinds, 'none');
    const loose = dancerLooseTiles(pattern, kinds).map((kind, id) => ({ kind, id }));
    loose[0].special = 'pure';
    const role = count === 4 ? '四槓子' : count === 3 ? '三槓子' : '門前清自摸和';
    assert.equal(dancerHandReachesRole(loose, role, 'none', 4, settings, 28, 27, kans), true, String(count));
    const full = [...loose, ...kans.flatMap(kan => kan.slice(0, 3))];
    assert.equal(dancerHandReachesRole(full, role, 'none', 4, settings, 28, 27, kans), true);
    assert.equal(dancerHandReachesRole(loose, role, 'none', 4, settings), false);
  }
});
import { dancerCompressedAssignments } from '../src/mahjong.ts';
import { memoryCanClaim, memoryCanContinue, memorySpecials } from '../src/mahjong.ts';
import { availableKinds, bestRiverScore, bestScore, bestScoreWithExtra, changeTileKind, chooseMemoryTiles, compressPair, consumeDrawReservation, dancerHandReachesRole, dancerKanFallback, dancerLooseTiles, dancerPatternGroups, dancerPatterns, dancerRoleChoices, dancerRoleEnabled, dancerRoleGroups, dancerRoleReachable, dancerRoles, dancerVariant, dealerSeat, dealCards, doraFromIndicator, existingWaitKinds, finaleTileCount, firstFourVisibleKind, infectWithZombie, isDamascusTarget, isMemoryMeld, isTenpai, isTerminal, isWinningShape, makeWall, meldCandidates, nagashiEligible, openingDealerSeat, openingIntact, reserveAfterDiscard, reserveDragonPairs, reserveDraws, scoreHand, shiftNumberTiles, spreadZombies, suitKind, takeRiverTile, transferRonPoints, trumpDancerPatterns, waitKinds, winningShapeSummary } from '../src/mahjong.ts';

const settings = { rounds: 4, specialCount: 8, startingPoints: 100000, kazoeMultiple: true, cards: true };
const player = { hand: [], river: [], points: 100000, card: 'seitenjo', used: false, discards: 0, riichi: false };

test('親の席は人数に合わせて局ごとに巡る', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => dealerSeat(index + 1, 3)), [0, 1, 2, 0, 1, 2, 0, 1]);
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => dealerSeat(index + 1, 4)), [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.equal(openingDealerSeat(3), dealerSeat(1, 3));
  assert.notEqual(openingDealerSeat(3), dealerSeat(2, 3));
  assert.equal(openingDealerSeat(4), dealerSeat(1, 4));
  assert.notEqual(openingDealerSeat(4), dealerSeat(2, 4));
});
test('設定で選んだ能力カードと特殊牌だけを配る', () => {
  const dealt = dealCards(2, 4, ['oni', 'highRisk']);
  assert.deepEqual(dealt.flat().sort(), ['highRisk', 'oni']);
  const wall = makeWall(12, 'none', false, 4, ['zombie']);
  assert.ok(wall.some(tile => tile.special === 'zombie'));
  assert.ok(wall.every(tile => !tile.special || tile.special === 'zombie'));
  assert.ok(makeWall(12, 'none', false, 4, []).every(tile => !tile.special));
  const terminalsOnly = makeWall(12, 'none', false, 4, ['musou']);
  assert.equal(terminalsOnly.filter(tile => tile.special === 'musou').length, 12);
  assert.ok(terminalsOnly.every(tile => !tile.special || isTerminal(tile.kind)));
  const limited = makeWall(12, 'none', false, 4, ['zombie'], ['zombie']);
  assert.equal(limited.filter(tile => tile.special === 'zombie').length, 1);
  const mixed = makeWall(12, 'none', false, 4, ['zombie', 'trap'], ['zombie']);
  assert.equal(mixed.filter(tile => tile.special).length, 12);
  assert.ok(mixed.filter(tile => tile.special === 'zombie').length <= 1);
});
test('神経衰弱では得点・和了形に作用する特殊牌だけを配置する', () => {
  const enabled = ['zombie', 'trap', 'rainbow', 'shochikubai'].filter(special => memorySpecials.includes(special));
  const wall = makeWall(12, 'memory', false, 4, enabled);
  assert.equal(wall.filter(tile => tile.special).length, 12);
  assert.ok(wall.every(tile => !tile.special || enabled.includes(tile.special)));
  assert.ok(!memorySpecials.includes('zombie'));
  assert.ok(!memorySpecials.includes('trap'));
});
test('神経衰弱の暫定ルールでは赤ドラを盤面へ配置しない', () => {
  const wall = makeWall(0, 'memory', true);
  assert.ok(wall.every(tile => !tile.red));
  assert.equal(makeWall(0, 'none', true).filter(tile => tile.red).length, 3);
});
test('神経衰弱で14枚完成した席は役なしでも追加の雀頭を集めない', () => {
  const remaining = tiles([0, 0, 0, 1, 1, 1]);
  assert.equal(memoryCanContinue(remaining, 12), true);
  assert.equal(memoryCanContinue(remaining, 14), false);
});
test('対子祭りは対子を1枚に圧縮し、牌山を使わずに1枚生成する', () => {
  const hand = tiles([4, 4, 0, 1, 2]);
  const wall = makeWall(0);
  const before = wall.length;
  const drawn = compressPair(hand, [0, 1]);
  assert.ok(drawn);
  assert.equal(hand.length, 5);
  assert.equal(hand[0].compressedMate.kind, 4);
  assert.equal(wall.length, before);
  assert.equal(compressPair(hand, [0, 0]), null);
  changeTileKind(hand[0], 5);
  assert.equal(hand[0].compressedMate.kind, 5);
});
test('圧縮牌を打牌すると通常の1枚になり、副露には使えない', () => {
  const discard = { id: 90, kind: 4, compressedMate: { id: 91, kind: 4 } };
  assert.equal(releaseCompressedTile(discard), true);
  assert.equal(discard.compressedMate, undefined);
  assert.equal(releaseCompressedTile(discard), false);
  const ready = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 4]);
  assert.equal(bestScore([...ready, discard], player, false, false, settings, 30).valid, true);
  const hand = tiles([0, 1, 2, 2]);
  hand[0].compressedMate = { id: 99, kind: 0 };
  assert.equal(meldCandidates(hand, { id: 100, kind: 2 }, true, false).some(option => option.type === 'chi'), false);
  hand[2].compressedMate = { id: 98, kind: 2 };
  assert.equal(meldCandidates(hand, { id: 101, kind: 2 }, false, true).some(option => option.type === 'pon'), false);
});
test('神経衰弱は残り牌から面子・雀頭を作れる席だけ進行できる', () => {
  assert.equal(memoryCanClaim(tiles([0, 1, 2]), 3), true);
  assert.equal(memoryCanClaim(tiles([31, 31, 31]), 3), true);
  assert.equal(memoryCanClaim(tiles([0, 0]), 2), true);
  assert.equal(memoryCanClaim(tiles([0, 0]), 3), false);
  assert.equal(memoryCanClaim(tiles([0, 4, 8, 27]), 3), false);
  assert.equal(memoryCanClaim(tiles([0, 4, 8, 27]), 2), false);
});

test('神経衰弱のCPUは記憶した牌で完成組や二枚組を優先し、伏せ牌の中身は参照しない', () => {
  const remembered = new Map([[0, 0], [1, 1], [2, 2], [3, 31]]);
  assert.deepEqual(new Set(chooseMemoryTiles([0, 1, 2, 3, 4], remembered, 3, 4, () => 0)), new Set([0, 1, 2]));
  const partial = chooseMemoryTiles([0, 1, 3, 4], remembered, 3, 4, () => 0);
  assert.deepEqual(new Set(partial), new Set([0, 1, 4]));
  assert.deepEqual(new Set(chooseMemoryTiles([0, 3, 4], new Map([[0, 31], [3, 31]]), 2, 4, () => 0)), new Set([0, 3]));
  const unseen = chooseMemoryTiles([0, 1, 2], new Map(), 3, 4, () => 0);
  assert.deepEqual(new Set(unseen), new Set([0, 1, 2]));
});
test('神経衰弱の完成手は4面子と雀頭の形で役判定する', () => {
  const hand = tiles([10, 11, 12, 10, 11, 12, 13, 14, 15, 13, 14, 15, 16, 16]);
  const rules = { ...settings, localYaku: { daisharin: true } };
  assert.ok(scoreHand(hand, player, false, true, rules, 33).lines.some(line => line.startsWith('大車輪')));
  const memory = scoreHand(hand, player, false, true, { ...rules, roundEvent: 'memory' }, 33);
  assert.equal(memory.valid, true);
  assert.equal(memory.shape, '通常形');
  assert.equal(memory.lines.some(line => line.startsWith('大車輪') || line.startsWith('七対子')), false);
  assert.ok(memory.lines.some(line => line === '神経衰弱 ×3'));
});
test('神経衰弱は獲得した順子を刻子へ組み替えて役を増やさない', () => {
  const hand = tiles([0, 1, 2, 0, 1, 2, 0, 1, 2, 3, 3, 3, 4, 4]);
  const context = { memoryMelds: [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9), hand.slice(9, 12)], memoryPair: hand.slice(12) };
  const rules = { ...settings, roundEvent: 'memory' };
  assert.ok(scoreHand(hand, player, false, true, rules, 33).lines.some(line => line.startsWith('四暗刻')));
  const fixed = scoreHand(hand, player, false, true, rules, 33, false, context);
  assert.equal(fixed.valid, true);
  assert.equal(fixed.lines.some(line => line.startsWith('四暗刻') || line.startsWith('対々和')), false);
  hand[0].special = 'triplet';
  assert.equal(bestScore(hand, player, false, true, rules, 33, false, context).valid, true);
});
test('神経衰弱の最後の雀頭を両面待ちとして平和にしない', () => {
  const hand = tiles([0, 1, 2, 0, 1, 2, 3, 4, 5, 3, 4, 5, 0, 0]);
  const context = { memoryMelds: [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9), hand.slice(9, 12)], memoryPair: hand.slice(12), winningKind: 0, winningTileId: hand[13].id };
  const ordinary = scoreHand(hand, player, false, true, settings, 33, false, context);
  assert.ok(ordinary.lines.some(line => line.startsWith('平和 ')));
  const memory = scoreHand(hand, player, false, true, { ...settings, roundEvent: 'memory' }, 33, false, context);
  assert.equal(memory.valid, true);
  assert.equal(memory.lines.some(line => line.startsWith('平和 ')), false);
});
test('圧縮牌は通常形の雀頭と八対子の両方に使える', () => {
  const normal = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 4, 33]);
  normal[12].compressedMate = { id: 50, kind: 4 };
  const score = bestScore(normal, { ...player, cards: ['pairFestival'] }, false, true, settings, 30, false, { winningTileId: 12, winningKind: 4 });
  assert.ok(score.valid);
  assert.ok(score.chosen.some(tile => tile.compressedVirtual && tile.kind === 4));
  assert.ok(score.lines.some(line => line.startsWith('白の刻子 ')));
  const pairs = tiles([0, 2, 4, 6, 8, 9, 11, 13].flatMap(kind => [kind, kind]));
  pairs[0].compressedMate = { ...pairs[1] };
  pairs.splice(1, 1);
  pairs[1].compressedMate = { ...pairs[2] };
  pairs.splice(2, 1);
  const eight = bestScore(pairs, { ...player, cards: ['pairFestival'] }, false, true, settings, 33);
  assert.ok(eight.valid);
  assert.ok(eight.lines.some(line => line.startsWith('八対子 4翻')));
  assert.equal(eight.chosen.length, 16);
  normal[12].special = 'rainbow';
  const rainbow = bestScore(normal, { ...player, cards: ['pairFestival'] }, false, true, settings, 30, false, { winningTileId: 12, winningKind: 4 });
  assert.ok(rainbow.valid);
  assert.equal(rainbow.chosen.find(tile => tile.id === 12).kind, rainbow.chosen.find(tile => tile.compressedVirtual).kind);
});
test('圧縮牌の待ち判定では同じ対子を二重に展開しない', () => {
  const hand = tiles([0, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 27, 0]);
  hand[11].compressedMate = { id: 100, kind: 27 };
  const waits = waitKinds(hand);
  assert.deepEqual(waits, [0, 1, 27]);
  assert.equal(isTenpai(hand), true);
  assert.equal(bestScore([...hand, { id: 200, kind: 2 }], player, false, true, settings, -1, false, { winningTileId: 200, winningKind: 2 }).valid, false);
});
test('圧縮牌を持つ踊り子は聴牌だけでなく狙った役も確認する', () => {
  const hand = dancerPatterns[27].map((kind, id) => ({ kind, id }));
  hand[0].compressedMate = { id: 90, kind: 31 };
  assert.ok(waitKinds(hand).length > 0);
  assert.equal(dancerHandReachesRole(hand, '白の刻子', 'none', 4, settings), true);
  assert.equal(dancerHandReachesRole(hand, '發の刻子', 'none', 4, settings), false);
  const choices = dancerRoleChoices([dancerPatterns[27], dancerPatterns[27]], ['白の刻子', '白の刻子'], [], 'none', 4);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].role, '白の刻子');
});

test('踊り子は複数の圧縮牌へ対子候補を割り当て、目標役を保てる', () => {
  const pattern = dancerPatterns[dancerRoles.indexOf('四暗刻')];
  const candidates = dancerCompressedAssignments(pattern, [0, 1]);
  assert.ok(candidates.length > 0 && candidates.length <= 8);
  assert.ok(candidates.some(candidate => {
    const hand = tiles(candidate);
    for (const index of [0, 1]) hand[index].compressedMate = { id: 100 + index, kind: hand[index].kind };
    return dancerHandReachesRole(hand, '四暗刻', 'none', 4, { ...settings, doubleYakuman: { suankoTanki: false } });
  }));
  assert.deepEqual(dancerCompressedAssignments([0, 0, 1, 2], [0, 1]), []);
  assert.deepEqual(dancerCompressedAssignments(pattern, [0, 0]), []);
});
test('踊り子は固定した暗槓3組・4組から槓子系の役を狙える', () => {
  for (const [kinds, role] of [[[0, 9, 18], '三槓子'], [[0, 9, 18, 27], '四槓子']]) {
    const kans = kinds.map((kind, index) => Array.from({ length: 4 }, (_, copy) => ({ id: 100 + index * 4 + copy, kind })));
    const pattern = dancerKanFallback(kinds, 'none');
    assert.equal(dancerRoleReachable(pattern, role, 'none', 4, settings, 28, 27, kans), true);
    assert.equal(dancerLooseTiles(pattern, kinds).length, 13 - kinds.length * 3);
  }
});
test('踊り子は門前清自摸和を通常局・三人打ち・特殊局で狙える', () => {
  const pattern = dancerPatterns[dancerRoles.indexOf('門前清自摸和')];
  assert.equal(pattern.length, 13);
  for (const event of ['none', 'hachiku', 'trump']) for (const playerCount of [3, 4]) {
    const variants = dancerPatternGroups([pattern], [], event, playerCount)[0] ?? [];
    assert.ok(variants.some(variant => dancerRoleReachable(variant, '門前清自摸和', event, playerCount, settings)));
  }
});
test('無効にした特殊役だけで成立する形は待ち牌に数えない', () => {
  const linked = tiles([0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 31, 31]);
  assert.ok(waitKinds(linked).includes(21));
  assert.deepEqual(waitKinds(linked, 'none', false, 4, { sanrenko: false, isshokusanren: false }), []);
  const trump = tiles(Array.from({ length: 13 }, (_, index) => suitKind(0, index + 1)));
  assert.ok(waitKinds(trump, 'trump').includes(1));
  assert.ok(!waitKinds(trump, 'trump', false, 4, { superStraight: false, lantern: false }).includes(1));
});
test('ニアピンは三同刻・四同刻へあと1面子の形を判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, yakumanStack: true };
  const three = scoreHand(tiles([4, 4, 4, 4, 4, 4, 9, 9, 9, 0, 1, 2, 31, 31]), near, false, true, rules, -1);
  assert.ok(three.lines.some(line => line.startsWith('三同刻まであと1面子 5翻')));
  const four = scoreHand(tiles([4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 1, 2, 31, 31]), near, false, true, rules, -1);
  assert.ok(four.lines.some(line => line.startsWith('四同刻まであと1面子 13翻')));
  assert.ok(!four.lines.some(line => line.startsWith('三同刻 ')));
  const disabled = scoreHand(tiles([4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 1, 2, 31, 31]), near, false, true, { ...rules, specialYaku: { sameTriplet4: false } }, -1);
  assert.ok(!disabled.lines.some(line => line.startsWith('四同刻')));
});
test('ニアピンは同一色へあと1面子なら上位役だけを判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const hand = tiles([...Array(11).fill(4), 9, 9, 9]);
  const scored = scoreHand(hand, near, false, true, { ...settings, yakumanStack: true }, -1);
  assert.ok(scored.lines.some(line => line.startsWith('同一色まであと1面子 19翻')));
  assert.ok(!scored.lines.some(line => line.startsWith('三同刻') || line.startsWith('四同刻')));
  const disabled = scoreHand(hand, near, false, true, { ...settings, yakumanStack: true, specialYaku: { sameColor: false } }, -1);
  assert.ok(!disabled.lines.some(line => line.startsWith('同一色')));
});
test('八対子から十四対子まで下位の対子役を重ねず翻数が倍増する', () => {
  const names = ['八', '九', '十', '十一', '十二', '十三', '十四'];
  for (let pairs = 8; pairs <= 14; pairs++) {
    const expanded = tiles(Array.from({ length: pairs }, (_, kind) => [kind, kind]).flat());
    for (let index = 0; index < pairs - 7; index++) expanded[index * 2 + 1].compressedVirtual = true;
    const result = scoreHand(expanded, { ...player, cards: ['pairFestival'] }, false, true, settings, 33);
    assert.ok(result.lines.some(line => line.startsWith(`${names[pairs - 8]}対子 ${2 ** (pairs - 6)}翻`)));
    assert.ok(!result.lines.some(line => line.startsWith('七対子 ')));
  }
});
test('鳴くだけ大三元は牌山から白・發・中を各2枚確保する', () => {
  const wall = makeWall(0);
  const initialLength = wall.length;
  const reserved = reserveDragonPairs(wall);
  assert.deepEqual([31, 32, 33].map(kind => reserved.filter(tile => tile.kind === kind).length), [2, 2, 2]);
  assert.equal(wall.length, initialLength - 6);
  assert.equal(new Set([...wall, ...reserved].map(tile => tile.id)).size, initialLength);
});
test('転調は同じ牌を一度だけ変化させ、字牌を維持する', () => {
  const one = { id: 1, kind: 0 };
  const nine = { id: 2, kind: 8 };
  const honor = { id: 3, kind: 31 };
  shiftNumberTiles([[one, nine, honor], [one, nine]]);
  assert.deepEqual([one.kind, nine.kind, honor.kind], [1, 0, 31]);
});
test('三人打ちの転調は初期牌山を108枚に保ち、変化後の萬子待ちとドラを判定する', () => {
  const wall = makeWall(0, 'tenchou', false, 3);
  assert.equal(wall.length, 108);
  assert.equal(wall.some(tile => tile.kind >= 1 && tile.kind <= 7), false);
  shiftNumberTiles([wall]);
  assert.ok(wall.some(tile => tile.kind === 1));
  assert.ok(availableKinds('tenchou', 3).includes(1));
  const ready = tiles([0, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 27, 27]);
  assert.equal(waitKinds(ready, 'none', false, 3).includes(1), false);
  assert.equal(waitKinds(ready, 'tenchou', false, 3).includes(1), true);
  assert.equal(doraFromIndicator(0, 'none', 3), 8);
  assert.equal(doraFromIndicator(0, 'tenchou', 3), 8);
  assert.equal(doraFromIndicator(0, 'tenchou', 3, true), 1);
  assert.equal(doraFromIndicator(8, 'tenchou', 3, true), 0);
});
test('三人打ちの転調で現存しない萬子2～8は現在の待ち候補から外す', () => {
  const ready = tiles([0, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 27, 27]);
  const wall = makeWall(0, 'tenchou', false, 3);
  assert.ok(waitKinds(ready, 'tenchou', false, 3).includes(1));
  assert.equal(existingWaitKinds(ready, 'tenchou', false, 3, wall).includes(1), false);
  shiftNumberTiles([wall]);
  assert.equal(existingWaitKinds(ready, 'tenchou', false, 3, wall).includes(1), true);
  assert.equal(existingWaitKinds(ready, 'tenchou', false, 4, wall).includes(1), true);
});
const tiles = kinds => kinds.map((kind, id) => ({ kind, id }));

test('フィナーレの開始残数は四人打ち12牌、三人打ち9牌', () => {
  assert.equal(finaleTileCount(4), 12);
  assert.equal(finaleTileCount(3), 9);
});

test('ダマスカスの責任払いは門前かつ立直していない和了だけを対象にする', () => {
  assert.equal(isDamascusTarget({ riichi: false, openMelds: [] }), true);
  assert.equal(isDamascusTarget({ riichi: true, openMelds: [] }), false);
  assert.equal(isDamascusTarget({ riichi: false, openMelds: [{ type: 'pon', tiles: tiles([31, 31, 31]) }] }), false);
});

test('三人打ちの暫定牌山は萬子2～8を除き、3人分の能力カードを配る', () => {
  const kinds = availableKinds('none', 3);
  assert.equal(kinds.length, 27);
  assert.ok(kinds.includes(0) && kinds.includes(8));
  assert.ok(kinds.every(kind => kind < 1 || kind > 7));
  const wall = makeWall(0, 'none', true, 3);
  assert.equal(wall.length, 108);
  assert.ok(wall.every(tile => tile.kind < 1 || tile.kind > 7));
  assert.deepEqual(wall.filter(tile => tile.red).map(tile => tile.kind).sort((a, b) => a - b), [13, 22]);
  const dealt = dealCards(3, 3);
  assert.deepEqual(dealt.map(cards => cards.length), [3, 3, 3]);
  assert.equal(new Set(dealt.flat()).size, 9);
  assert.equal(makeWall(0, 'trump', false, 3).length, 162);
  assert.equal(doraFromIndicator(0, 'none', 3), 8);
  assert.equal(doraFromIndicator(8, 'none', 3), 0);
  const unavailablePair = tiles([0, 0, 0, 8, 8, 8, 9, 10, 11, 18, 19, 20, 4]);
  assert.ok(waitKinds(unavailablePair).includes(4));
  assert.ok(!waitKinds(unavailablePair, 'none', false, 3).includes(4));
});

test('三人打ちのツモ和了点は実際の2人分の支払い合計になる', () => {
  const hand = tiles([0, 0, 0, 8, 8, 8, 9, 10, 11, 18, 19, 20, 31, 31]);
  const rules = { ...settings, cards: false, playerCount: 3 };
  const dealer = scoreHand(hand, player, true, true, rules, 33);
  const child = scoreHand(hand, player, false, true, rules, 33);
  assert.equal(dealer.total, dealer.nonDealerPayment * 2n);
  assert.equal(child.total, child.dealerPayment + child.nonDealerPayment);
  assert.ok(scoreHand(hand, player, true, true, { ...rules, playerCount: 4 }, 33).total > dealer.total);
});

test('三人打ちの北抜きは1枚につき1翻、役満のみでは加算しない', () => {
  const hand = tiles([0, 0, 0, 8, 8, 8, 9, 10, 11, 18, 19, 20, 31, 31]);
  const north = { ...player, northTiles: [{ id: 99, kind: 30 }] };
  const rules = { ...settings, cards: false, playerCount: 3 };
  const plain = scoreHand(hand, player, false, true, rules, 33);
  const boosted = scoreHand(hand, north, false, true, rules, 33);
  assert.equal(boosted.han, plain.han + 1);
  assert.ok(boosted.lines.includes('北抜き 1枚 → 1翻'));
  const yakuman = tiles([27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 31, 31]);
  assert.ok(!scoreHand(yakuman, north, false, true, rules, 33).lines.some(line => line.startsWith('北抜き')));
});

test('トランプマジックで39種と追加の刻子牌6枚を生成する', () => {
  const wall = makeWall(0, 'trump');
  assert.equal(wall.length, 162);
  assert.equal(wall.some(tile => tile.kind >= 27 && tile.kind < 34), false);
  assert.deepEqual(wall.filter(tile => tile.special === 'triplet').map(tile => tile.kind).sort((a, b) => a - b), [0, 9, 18, 37, 41, 45]);
  assert.equal(doraFromIndicator(suitKind(0, 13), 'trump'), suitKind(0, 1));
});

test('追加の刻子牌6枚は表示牌の位置に固定せず牌山へ混ぜる', () => {
  const random = Math.random;
  let wall;
  try { Math.random = () => 0; wall = makeWall(0, 'trump'); }
  finally { Math.random = random; }
  assert.equal(wall.at(-1).special, undefined);
  assert.equal(wall.filter(tile => tile.special === 'triplet').length, 6);
});

test('トランプマジックで9-10-11の順子と1～13の13面待ちが成立する', () => {
  const sequence = tiles([8, 34, 35, 9, 10, 11, 18, 19, 20, 0, 1, 2, 4, 4]);
  assert.equal(isWinningShape(sequence, 'trump'), true);
  assert.equal(isWinningShape(sequence), false);
  const pure = tiles(Array.from({ length: 13 }, (_, i) => suitKind(1, i + 1)));
  assert.equal(waitKinds(pure, 'trump').length, 13);
  const score = bestScore([...pure, { kind: suitKind(1, 7), id: 13 }], player, false, true, { ...settings, cards: false, roundEvent: 'trump' }, 0);
  assert.equal(score.shape, '超一気通貫');
  assert.equal(score.han, 13);
});

test('トランプマジックの数牌符は局全体のカン回数で革命・革命返しに変わる', () => {
  const hand = tiles([...Array.from({ length: 13 }, (_, index) => suitKind(0, index + 1)), suitKind(0, 2)]);
  const rules = { ...settings, cards: false, roundEvent: 'trump' };
  const ordinary = scoreHand(hand, player, false, true, rules, 33, false, { roundKanCount: 0 });
  const revolution = scoreHand(hand, player, false, true, rules, 33, false, { roundKanCount: 1 });
  const reversal = scoreHand(hand, player, false, true, rules, 33, false, { roundKanCount: 2 });
  const third = scoreHand(hand, player, false, true, rules, 33, false, { roundKanCount: 3 });
  assert.ok(ordinary.lines.includes('数牌ボーナス +9300符'));
  assert.equal(revolution.fu - ordinary.fu, 800);
  assert.equal(reversal.fu - ordinary.fu, 2000);
  assert.equal(third.fu, revolution.fu);
  assert.ok(revolution.lines.includes('数牌ボーナス +10100符（革命）'));
  assert.ok(reversal.lines.includes('数牌ボーナス +11300符（革命返し）'));
});
test('転調では数牌ボーナス符を加え、カンによる革命は発生しない', () => {
  const hand = tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 31, 31]);
  const score = scoreHand(hand, player, false, true, { ...settings, cards: false, roundEvent: 'tenchou' }, 33, false, { roundKanCount: 3 });
  assert.ok(score.valid);
  assert.ok(score.lines.includes('数牌ボーナス +4800符'));
  assert.ok(!score.lines.some(line => line.includes('革命')));
});

test('十三連宝燈は両端の刻子牌をそのまま使い169翻になる', () => {
  const hand = tiles([...Array.from({ length: 13 }, (_, i) => suitKind(2, i + 1)), suitKind(2, 6)]);
  hand[0].special = 'triplet'; hand[12].special = 'triplet';
  const score = bestScore(hand, player, false, true, { ...settings, cards: false, roundEvent: 'trump' }, 0);
  assert.equal(score.valid, true);
  assert.equal(score.shape, '十三連宝燈');
  assert.equal(score.han, 169);
});

test('2枚の刻子牌をそれぞれ刻子にし、余る4枚を和了形から除く', () => {
  const hand = tiles([0, 9, 2, 3, 4, 19, 20, 21, 5, 7, 12, 14, 31, 31]);
  hand[0].special = 'triplet'; hand[1].special = 'triplet';
  assert.equal(isWinningShape(hand), true);
  const score = bestScore(hand, player, false, true, { ...settings, cards: false }, 33);
  assert.equal(score.valid, true);
  assert.equal(score.chosen.filter(tile => tile.virtual).length, 4);
  assert.ok(winningShapeSummary(score).includes('＊は刻子牌の効果'));
});

test('和了形の表示には採用した14枚の牌種を含める', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const score = scoreHand(hand, player, false, true, { ...settings, cards: false }, 30);
  const summary = winningShapeSummary(score);
  assert.ok(summary.startsWith('通常形：1萬 2萬 3萬'));
  assert.ok(summary.endsWith('發 發'));
});

test('踊り子は局イベント中もその牌体系にある聴牌形を選べる', () => {
  for (const event of ['hachiku', 'trump']) {
    const allowed = new Set(availableKinds(event));
    const variants = dancerPatterns.filter(pattern => event !== 'trump' || pattern.every(kind => kind < 27)).flatMap(pattern => [0, 1, 2].map(offset => dancerVariant(pattern, offset, event)));
    assert.equal(variants.some(pattern => pattern.every(kind => allowed.has(kind)) && isTenpai(tiles(pattern), event)), true);
  }
});

test('鳴き候補はポン・カンと上家からのチーを牌種に合わせて返す', () => {
  const hand = tiles([8, 8, 8, 34, 35]);
  const discarded = { id: 99, kind: 8 };
  assert.deepEqual(meldCandidates(hand, discarded, true, true, 'trump').map(option => option.type), ['pon', 'kan', 'chi']);
  assert.equal(meldCandidates(hand, discarded, false, false, 'trump').some(option => option.type === 'chi' || option.type === 'kan'), false);
  assert.equal(meldCandidates(hand, discarded, true, true).some(option => option.type === 'chi'), false);
});

test('鳴き候補は特殊牌・赤ドラを使う組み合わせを選び分ける', () => {
  const hand = tiles([8, 8, 8, 8, 7, 7, 10]);
  hand[3].special = 'triplet';
  hand[5].red = true;
  const ponKan = meldCandidates(hand, { id: 99, kind: 8 }, false, true);
  assert.equal(ponKan.filter(option => option.type === 'pon').length, 2);
  assert.equal(ponKan.filter(option => option.type === 'kan').length, 2);
  assert.ok(ponKan.some(option => option.handIds.includes(hand[3].id)));
  const chi = meldCandidates(hand, { id: 100, kind: 6 }, true, false);
  assert.equal(chi.filter(option => option.type === 'chi').length, 4);
  assert.ok(chi.some(option => option.handIds.includes(hand[5].id)));
});

test('トランプマジックの10～13は字牌ではなく、1と13だけを么九牌として扱う', () => {
  const hand = tiles([34, 34, 34, 35, 36, 37, 9, 10, 11, 18, 19, 20, 0, 0]);
  const score = scoreHand(hand, player, false, true, { ...settings, cards: false, roundEvent: 'trump' }, 1);
  assert.equal(score.valid, true);
  assert.equal(score.lines.some(line => line.includes('10萬の刻子') || line.includes('字一色')), false);
  assert.equal(isTerminal(suitKind(0, 9), 'trump'), false);
  assert.equal(isTerminal(suitKind(0, 13), 'trump'), true);
});

test('通常形と七対子を和了形として判定する', () => {
  const normal = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  assert.equal(scoreHand(normal, player, false, true, settings, 33).shape, '通常形');
  const pairs = tiles([0, 0, 2, 2, 9, 9, 11, 11, 18, 18, 20, 20, 31, 31]);
  assert.equal(scoreHand(pairs, player, false, true, settings, 33).shape, '七対子');
});

test('国士無双と圧倒的無双の倍率を判定する', () => {
  const hand = tiles([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 33]);
  hand[0].special = 'musou';
  const score = scoreHand(hand, player, false, true, settings, 1);
  assert.equal(score.shape, '国士無双');
  assert.equal(score.multiplier, 10);
});

test('2枚とも虹色の圧縮対子は変化後の保存牌種と赤属性を一致させる', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 13, 33]);
  hand[12].special = 'rainbow';
  hand[12].compressedMate = { id: 50, kind: 13, special: 'rainbow', red: true };
  const before = structuredClone(hand);
  const score = bestScore(hand, { ...player, card: 'seitenjo' }, false, true, { ...settings, cards: true }, 4, false, { winningTileId: 12, winningKind: 13 });
  assert.equal(score.valid, true);
  const primary = score.chosen.find(tile => tile.id === 12);
  const partner = score.chosen.find(tile => tile.id === 50);
  assert.equal(primary.kind, 4);
  assert.equal(primary.compressedMate.kind, primary.kind);
  assert.equal(partner.kind, primary.kind);
  assert.equal(primary.compressedMate.red, true);
  assert.equal(partner.red, true);
  assert.ok(score.lines.includes('赤ドラ 1枚'));
  assert.deepEqual(hand, before);
});

test('異なる赤属性の虹色変化は手牌順で最高得点を失わない', () => {
  const hand = tiles([0, 2, 3, 5, 9, 10, 11, 18, 19, 20, 31, 4, 1, 31]);
  hand[11].special = 'rainbow'; hand[11].red = true;
  hand[12].special = 'rainbow';
  const rules = { ...settings, cards: false };
  const context = { winningTileId: 13, winningKind: 31 };
  const result = bestScore(hand, player, false, true, rules, 33, false, context);
  const reversed = bestScore([...hand.slice(0, 11), hand[12], hand[11], hand[13]], player, false, true, rules, 33, false, context);
  assert.equal(result.valid, true);
  assert.equal(result.total, reversed.total);
  assert.equal(result.chosen.find(tile => tile.id === 11).kind, 4);
  assert.equal(result.chosen.find(tile => tile.id === 11).red, true);
  assert.ok(result.lines.includes('赤ドラ 1枚'));
  assert.deepEqual(hand.slice(11, 13).map(tile => tile.kind), [4, 1]);
});

test('固定組の虹色牌を探索から外しても残りの虹色牌は変化できる', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  for (const tile of hand.slice(0, 3)) tile.special = 'rainbow';
  const context = { openMelds: [{ type: 'chi', tiles: hand.slice(0, 3), from: 1 }] };
  const rules = { ...settings, cards: false };
  const fixed = bestScore(hand, player, false, true, rules, 33, false, context);
  const direct = scoreHand(hand, player, false, true, rules, 33, false, context);
  assert.equal(fixed.valid, true);
  assert.equal(fixed.total, direct.total);
  assert.deepEqual(fixed.chosen.slice(0, 3).map(tile => tile.kind), [0, 1, 2]);
  const free = hand.map(tile => ({ ...tile }));
  free[13].kind = 33; free[13].special = 'rainbow';
  const changed = bestScore(free, player, false, true, rules, 33, false, { ...context, winningTileId: 13, winningKind: 33 });
  assert.equal(changed.valid, true);
  assert.equal(changed.chosen.find(tile => tile.id === 13).kind, 32);
  assert.deepEqual(changed.chosen.slice(0, 3).map(tile => tile.kind), [0, 1, 2]);
});

test('虹色牌を含む副露の実牌を別の手牌で組み直さない', () => {
  const hand = tiles([0, 1, 2, 0, 0, 0, 9, 10, 11, 18, 19, 20, 31, 31]);
  hand[0].special = 'rainbow';
  const context = { openMelds: [{ type: 'chi', tiles: hand.slice(0, 3), from: 1 }] };
  const result = bestScore(hand, player, false, true, { ...settings, cards: false }, 33, false, context);
  assert.equal(result.valid, true);
  assert.equal(result.chosen.find(tile => tile.id === 0).kind, 0);
  assert.equal(result.lines.some(line => line.startsWith('白の刻子')), false);
  const moved = hand.map(tile => tile.id === 0 ? { ...tile, kind: 31 } : tile);
  assert.equal(scoreHand(moved, player, false, true, settings, 33, false, context).valid, false);
});

test('虹色変化は和了できる牌を選択する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 0]);
  hand[13].special = 'rainbow';
  const score = bestScore(hand, player, false, true, settings, 33);
  assert.equal(score.valid, true);
  assert.equal(score.chosen[13].kind, 32);
});

test('能力カードを無効にすると青天井を適用しない', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const disabled = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33);
  const enabled = scoreHand(hand, player, false, true, settings, 33);
  assert.equal(disabled.valid, true);
  assert.equal(enabled.valid, true);
  assert.equal(doraFromIndicator(8), 0);
});

test('聴牌を判定する', () => {
  assert.equal(isTenpai(tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32])), true);
  assert.equal(isTenpai(tiles([0, 0, 1, 4, 8, 9, 11, 14, 17, 18, 20, 23, 26])), false);
});

test('虹色変化を含む聴牌を判定する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 4]);
  hand[12].special = 'rainbow';
  assert.equal(isTenpai(hand), true);
});

test('立直と海底摸月は役の翻に含まれる', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const ready = { ...player, riichi: true };
  const score = scoreHand(hand, ready, false, true, { ...settings, cards: false }, 33, true);
  assert.ok(score.lines.some(line => line.includes('立直')));
  assert.ok(score.lines.some(line => line.includes('海底摸月')));
});

test('ダブル立直は立直の代わりに2翻、河底撈魚は最後の打牌で1翻になる', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const rules = { ...settings, cards: false };
  const ordinary = scoreHand(hand, { ...player, riichi: true }, false, false, rules, 30);
  const double = scoreHand(hand, { ...player, riichi: true, doubleRiichi: true }, false, false, rules, 30);
  const riverBottom = scoreHand(hand, player, false, false, rules, 30, false, { houtei: true });
  assert.equal(double.han, ordinary.han + 1);
  assert.ok(double.lines.some(line => line.includes('ダブル立直')));
  assert.equal(double.lines.some(line => line.startsWith('立直 ')), false);
  assert.equal(riverBottom.han, scoreHand(hand, player, false, false, rules, 30).han + 1);
  assert.ok(riverBottom.lines.some(line => line.includes('河底撈魚')));
});

test('加槓牌へのロンでは槍槓を1翻加え、通常のロンには加えない', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const rules = { ...settings, cards: false };
  const ordinary = scoreHand(hand, player, false, false, rules, 30);
  const robbed = scoreHand(hand, player, false, false, rules, 30, false, { chankan: true });
  assert.equal(robbed.han, ordinary.han + 1);
  assert.ok(robbed.lines.some(line => line.includes('槍槓 1翻')));
  assert.ok(!ordinary.lines.some(line => line.includes('槍槓')));
});

test('鳴きのない初回ツモで親は天和、子は地和になる', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const rules = { ...settings, cards: false };
  const dealer = scoreHand(hand, player, true, true, rules, 30, false, { initialDraw: true });
  const child = scoreHand(hand, player, false, true, rules, 30, false, { initialDraw: true });
  assert.ok(dealer.lines.some(line => line.includes('天和 13翻')));
  assert.ok(child.lines.some(line => line.includes('地和 13翻')));
  assert.ok(!scoreHand(hand, player, false, true, rules, 30).lines.some(line => line.includes('地和')));
});

test('初巡は誰かの追加打牌や鳴き・カンで終了する', () => {
  const seats = [0, 1, 1, 0].map(discards => ({ discards, openMelds: [], kans: [] }));
  assert.equal(openingIntact(seats), true);
  seats[1].discards = 2;
  assert.equal(openingIntact(seats), false);
  seats[1].discards = 1;
  seats[2].openMelds.push({ type: 'pon', tiles: tiles([0, 0, 0]) });
  assert.equal(openingIntact(seats), false);
  seats[2].openMelds = [];
  seats[0].kans.push(tiles([9, 9, 9, 9]));
  assert.equal(openingIntact(seats), false);
});

test('ツモの親・子の支払いが和了点と一致する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const child = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33);
  const dealer = scoreHand(hand, player, true, true, { ...settings, cards: false }, 33);
  assert.equal(child.total, child.dealerPayment + child.nonDealerPayment * 2n);
  assert.equal(dealer.total, dealer.nonDealerPayment * 3n);
  assert.ok(child.dealerPayment > child.nonDealerPayment);
});

test('破竹の勢いで数牌が索子として扱われる', () => {
  const wall = makeWall(8, 'hachiku');
  assert.equal(wall.length, 136);
  assert.equal(wall.filter(t => t.special).length, 8);
  assert.ok(wall.every(t => t.kind >= 18));
  assert.equal(wall.filter(t => t.kind === 18).length, 12);
});

test('破竹の勢いではカードによる数牌変化と圧縮牌の相方も索子になる', () => {
  const tile = { id: 900, kind: 22, red: true, compressedMate: { id: 901, kind: 22, special: 'musou' } };
  changeTileKind(tile, 13, 'hachiku');
  assert.equal(tile.kind, 22);
  assert.equal(tile.red, true);
  assert.equal(tile.compressedMate.kind, 22);
  assert.equal(tile.compressedMate.special, undefined);
  changeTileKind(tile, 9, 'hachiku');
  assert.equal(tile.kind, 18);
  assert.equal(tile.compressedMate.kind, 18);
  assert.equal(tile.red, undefined);
  changeTileKind(tile, 31, 'hachiku');
  assert.equal(tile.kind, 31);
});

test('破竹の勢いではゾンビ感染先の数牌も索子として扱う', () => {
  const source = { id: 902, kind: 9, special: 'zombie' };
  const target = { id: 903, kind: 27 };
  infectWithZombie(target, source, 'hachiku');
  assert.equal(target.kind, 18);
  assert.equal(target.special, 'zombie');
  changeTileKind(target, 9);
  assert.equal(target.kind, 9);
});

test('局イベントの青天井は全プレイヤーに適用される', () => {
  const hand = tiles([0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
  const normal = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33);
  const event = scoreHand(hand, player, false, true, { ...settings, cards: false, roundEvent: 'seitenjo' }, 33);
  assert.ok(event.total > normal.total);
});

test('刻子牌の余る2枚を除いても副露とカンの実牌を保持する', () => {
  for (const type of ['chi', 'pon', 'kan', 'closedKan']) {
    const hand = tiles(type === 'chi'
      ? [0, 1, 2, 9, 18, 18, 18, 31, 31, 31, 32, 32, 0, 33]
      : [0, 0, 0, 9, 18, 18, 18, 31, 31, 31, 32, 32, 0, 33]);
    hand[3].special = 'triplet';
    const meldTiles = [...hand.slice(0, 3), ...(type === 'kan' || type === 'closedKan' ? [{ id: 100, kind: 0 }] : [])];
    const context = type === 'closedKan' ? { kans: [meldTiles] } : { openMelds: [{ type, tiles: meldTiles, from: 1 }] };
    const score = bestScore(hand, player, false, true, { ...settings, cards: false }, 33, false, context);
    assert.equal(score.valid, true, type);
    const ids = new Set(score.chosen.map(tile => tile.id));
    for (const tile of meldTiles.slice(0, 3)) assert.ok(ids.has(tile.id), `${type}: 固定牌${tile.id}が除外されました`);
    assert.equal(ids.has(hand[12].id), false, type);
    assert.equal(ids.has(hand[13].id), false, type);
  }
});

test('多牌は余分な牌を除くときも副露とカンの実牌を保持する', () => {
  for (const type of ['chi', 'pon', 'kan', 'closedKan']) {
    const hand = tiles(type === 'chi'
      ? [0, 1, 2, 9, 9, 9, 18, 18, 18, 31, 31, 31, 32, 32, 0]
      : [0, 0, 0, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32, 0]);
    const meldTiles = [...hand.slice(0, 3), ...(type === 'kan' || type === 'closedKan' ? [{ id: 100, kind: 0 }] : [])];
    const context = type === 'closedKan' ? { kans: [meldTiles] } : { openMelds: [{ type, tiles: meldTiles, from: 1 }] };
    const score = bestScoreWithExtra(hand, { ...player, card: 'multipai' }, false, true, { ...settings, cards: true }, 33, false, context);
    assert.equal(score.valid, true, type);
    const ids = new Set(score.chosen.map(tile => tile.id));
    for (const tile of meldTiles.slice(0, 3)) assert.ok(ids.has(tile.id), `${type}: 固定牌${tile.id}が除外されました`);
    assert.equal(ids.has(hand.at(-1).id), false, `${type}: 固定牌と同種の余分な牌を除外する必要があります`);
  }
});

test('多牌は15枚から最も高い14枚を選び、完成済みなら全牌待ちになる', () => {
  const completed = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const multi = { ...player, card: 'multipai' };
  assert.equal(waitKinds(completed, 'none', true).length, 34);
  const score = bestScoreWithExtra([...completed, { id: 99, kind: 30 }], multi, false, true, settings, 33);
  assert.equal(score.valid, true);
  assert.equal(score.chosen.length, 14);
});

test('複数の和了形から最高点を選ぶ', () => {
  const hand = tiles([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
  const result = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33);
  assert.equal(result.shape, '通常形');
  assert.ok(result.lines.some(line => line.includes('二盃口')));
});

test('平和は順子と両面待ちで判定し、ツモは20符になる', () => {
  const hand = tiles([0, 1, 2, 1, 2, 3, 11, 12, 13, 23, 24, 25, 4, 4]);
  const result = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33, false, { winningKind: 25, winningTileId: 11 });
  assert.ok(result.lines.some(line => line.includes('平和')));
  assert.equal(result.fu, 20);
});

test('両面待ちと雀頭待ちの両方に取れる平和ツモは20符になる', () => {
  const hand = tiles([0, 1, 2, 1, 2, 3, 3, 4, 5, 6, 7, 8, 1, 1]);
  const result = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33, false, { winningKind: 1, winningTileId: 13 });
  assert.ok(result.lines.some(line => line.startsWith('平和 ')));
  assert.equal(result.fu, 20);
});

test('ロンで完成した刻子は四暗刻に数えず、対々和を判定する', () => {
  const hand = tiles([0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 31, 31]);
  const result = scoreHand(hand, player, false, false, { ...settings, cards: false }, 33, false, { winningKind: 27, winningTileId: 11 });
  assert.ok(result.lines.some(line => line.includes('対々和')));
  assert.ok(!result.lines.some(line => line.includes('四暗刻')));
});

test('ロン牌を雀頭や順子に使える形では暗刻を明刻扱いしない', () => {
  const pairWait = tiles([0, 0, 0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27]);
  const four = scoreHand(pairWait, player, false, false, settings, 33, false, { winningKind: 0, winningTileId: 4 });
  assert.ok(four.lines.some(line => line.includes('四暗刻単騎')));
  const sequenceWait = tiles([1, 1, 1, 9, 9, 9, 18, 18, 18, 0, 1, 2, 31, 31]);
  const three = scoreHand(sequenceWait, player, false, false, { ...settings, yakumanStack: true }, 33, false, { winningKind: 1, winningTileId: 10 });
  assert.ok(three.lines.some(line => line.startsWith('三暗刻 ')));
  const calledSequence = scoreHand(sequenceWait, player, false, false, { ...settings, yakumanStack: true }, 33, false, { winningKind: 1, winningTileId: 1, openMelds: [{ type: 'chi', tiles: sequenceWait.slice(9, 12) }] });
  assert.ok(!calledSequence.lines.some(line => line.startsWith('三暗刻 ')));
});

test('立直直後の一発と裏ドラを加算する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const ready = { ...player, riichi: true, ippatsu: true };
  const result = scoreHand(hand, ready, false, true, { ...settings, cards: false }, 33, false, { uraDora: 31 });
  assert.ok(result.lines.some(line => line.startsWith('一発 ')));
  assert.ok(result.lines.some(line => line.startsWith('裏ドラ 3枚')));
  const expired = scoreHand(hand, { ...ready, ippatsu: false }, false, true, { ...settings, cards: false }, 33, false, { uraDora: 31 });
  assert.ok(!expired.lines.some(line => line.startsWith('一発 ')));
});

test('純粋牌と浄化牌は対象役を強化する', () => {
  const green = tiles([19, 19, 19, 20, 20, 20, 21, 21, 21, 23, 23, 23, 25, 25]);
  green[0].special = 'pure';
  const greenScore = scoreHand(green, player, false, true, { ...settings, cards: false }, 33);
  assert.ok(greenScore.lines.some(line => line.includes('緑一色 39翻') && line.includes('純粋牌')));
  const combined = scoreHand(green, { ...player, card: 'yakumanBody' }, false, true, settings, 33);
  assert.ok(combined.lines.some(line => line.includes('緑一色 78翻') && line.includes('純粋牌') && line.includes('役満ボディ')));
  const chanta = tiles([0, 1, 2, 6, 7, 8, 9, 10, 11, 15, 16, 17, 27, 27]);
  chanta[0].special = 'purify';
  const chantaScore = scoreHand(chanta, player, false, true, { ...settings, cards: false }, 33);
  assert.ok(chantaScore.lines.some(line => line.includes('純全帯幺九（浄化牌）')));
});

test('虹色変化が3枚あっても和了形を探索する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 3, 4, 5]);
  for (let i = 11; i < 14; i++) hand[i].special = 'rainbow';
  const result = bestScore(hand, player, false, true, { ...settings, cards: false }, 33);
  assert.equal(result.valid, true);
  assert.equal(result.chosen.filter(tile => tile.special === 'rainbow').length, 3);
});

test('先を見据えるは河から最高の14枚を選ぶ', () => {
  const river = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32, 30]);
  const result = bestRiverScore(river, { ...player, card: 'foresight' }, false, { ...settings, cards: true }, 33);
  assert.ok(result?.valid);
  assert.equal(result?.chosen.length, 14);
  assert.ok(!result?.chosen.some(tile => tile.kind === 30));
  assert.equal(bestRiverScore(river.slice(0, 13), player, false, settings, 33), null);
});

test('先を見据えるは同じ性質の捨牌が多数あっても最高和了点を選ぶ', () => {
  const river = tiles([...Array(14).fill(31), ...Array(12).fill(30)]);
  const result = bestRiverScore(river, { ...player, card: 'foresight' }, false, settings, 33);
  assert.ok(result?.valid);
  assert.deepEqual(result?.chosen.map(tile => tile.kind), Array(14).fill(31));
});

test('先を見据えるは対子を作れない長い河を発動対象にしない', () => {
  const river = tiles(Array.from({ length: 30 }, (_, kind) => kind));
  assert.equal(bestRiverScore(river, { ...player, card: 'foresight' }, false, settings, 33), null);
});

test('先を見据えるの和了形からの探索は短い河の総当たりと同じ最高点になる', () => {
  const cases = [
    { river: tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32, 30, 4]), rules: settings },
    { river: tiles([0, 0, 2, 2, 9, 9, 11, 11, 18, 18, 20, 20, 31, 31, 33, 34]), rules: settings },
    { river: tiles([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 0, 4, 5]), rules: settings },
    { river: tiles([...Array.from({ length: 13 }, (_, rank) => suitKind(0, rank + 1)), 4, 9, 10]), rules: { ...settings, roundEvent: 'trump' } },
  ];
  cases[0].river[15].red = true;
  for (const { river, rules } of cases) {
    let expected = 0n;
    const chosen = [];
    const search = from => {
      if (chosen.length === 14) {
        const score = bestScore(chosen, player, false, true, rules, 33);
        if (score.valid && score.total > expected) expected = score.total;
        return;
      }
      for (let i = from; i <= river.length - (14 - chosen.length); i++) {
        chosen.push(river[i]);
        search(i + 1);
        chosen.pop();
      }
    };
    search(0);
    assert.equal(bestRiverScore(river, player, false, rules, 33)?.total ?? 0n, expected);
  }
});

test('先を見据えるは刻子牌の効果で河の最後の牌を除く和了形も認める', () => {
  const river = tiles([31, 0, 1, 2, 9, 10, 11, 18, 19, 20, 32, 32, 27, 29]);
  river[0].special = 'triplet';
  const score = bestRiverScore(river, player, false, settings, 33);
  assert.ok(score?.valid);
  assert.ok(score.chosen.some(tile => tile.virtual));
});

test('ニアピンはあと1面子の役を加え、役だけ半減する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 21, 22, 23, 24, 25, 26, 4, 4]);
  const near = { ...player, card: 'near', nearPinActive: true };
  const result = scoreHand(hand, near, false, true, settings, 0);
  assert.ok(result.lines.some(line => line.includes('三色同順まであと1面子 1翻')));
  assert.ok(result.lines.some(line => line === 'ドラ 1枚 → 1翻'));
  const flush = tiles([0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
  const flushScore = scoreHand(flush, near, false, true, settings, 33);
  assert.ok(flushScore.lines.some(line => line.includes('清一色 3翻（ニアピン）')));
});

test('ニアピンは所持していても任意発動するまで役を半減しない', () => {
  const hand = tiles([0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
  const inactive = scoreHand(hand, { ...player, card: 'near', nearPinActive: false }, false, true, settings, 33);
  const active = scoreHand(hand, { ...player, card: 'near', nearPinActive: true }, false, true, settings, 33);
  assert.ok(inactive.lines.some(line => line.includes('清一色 6翻')));
  assert.ok(inactive.lines.every(line => !line.includes('ニアピン')));
  assert.ok(active.lines.some(line => line.includes('清一色 3翻（ニアピン）')));
  assert.ok(inactive.total > active.total);
});

test('ニアピンは断么九の不足1面子を判定し、雀頭と残る3面子も確認する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const missingOne = tiles([0, 1, 2, 3, 4, 5, 10, 11, 12, 20, 21, 22, 4, 4]);
  const result = scoreHand(missingOne, near, false, true, settings, 33);
  assert.ok(result.lines.some(line => line.startsWith('断么九まであと1面子 1翻')));
  const terminalPair = tiles([0, 0, 2, 3, 4, 5, 6, 7, 11, 12, 13, 20, 21, 22]);
  assert.ok(!scoreHand(terminalPair, near, false, true, settings, 33).lines.some(line => line.startsWith('断么九まであと1面子 ')));
  const twoMissing = tiles([0, 1, 2, 9, 10, 11, 3, 4, 5, 20, 21, 22, 4, 4]);
  assert.ok(!scoreHand(twoMissing, near, false, true, settings, 33).lines.some(line => line.startsWith('断么九まであと1面子 ')));
});

test('ニアピンは平和の不足1面子でも雀頭と両面待ちを確認する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const hand = tiles([2, 3, 4, 11, 12, 13, 20, 21, 22, 5, 5, 5, 14, 14]);
  const rules = { ...settings, yakumanStack: true };
  const ready = scoreHand(hand, near, false, true, rules, 33, false, { winningKind: 2, winningTileId: 0 });
  assert.ok(ready.lines.some(line => line.startsWith('平和まであと1面子 1翻')));
  const edgeHand = tiles([0, 1, 2, 11, 12, 13, 20, 21, 22, 5, 5, 5, 14, 14]);
  const edgeWait = scoreHand(edgeHand, near, false, true, rules, 33, false, { winningKind: 2, winningTileId: 2 });
  assert.ok(!edgeWait.lines.some(line => line.startsWith('平和まであと1面子 ')));
  const valuePair = tiles([2, 3, 4, 11, 12, 13, 20, 21, 22, 5, 5, 5, 31, 31]);
  assert.ok(!scoreHand(valuePair, near, false, true, rules, 33, false, { winningKind: 2, winningTileId: 0 }).lines.some(line => line.startsWith('平和まであと1面子 ')));
});

test('ニアピンは一盃口・二盃口・三色同刻・小三元の不足面子も判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, yakumanStack: true };
  const oneSequence = scoreHand(tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 4, 4]), near, false, true, rules, 30);
  assert.ok(oneSequence.lines.some(line => line.includes('一盃口まであと1面子')));
  const twoPairs = scoreHand(tiles([0, 1, 2, 0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31]), near, false, true, rules, 30);
  assert.ok(twoPairs.lines.some(line => line.includes('二盃口まであと1面子')));
  assert.ok(!twoPairs.lines.some(line => line.startsWith('一盃口 ')));
  const withoutNear = scoreHand(tiles([0, 1, 2, 0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31]), player, false, true, rules, 30);
  assert.ok(withoutNear.lines.some(line => line.startsWith('一盃口 ')));
  const twoTriplets = scoreHand(tiles([4, 4, 4, 13, 13, 13, 18, 19, 20, 27, 27, 27, 31, 31]), near, false, true, rules, 30);
  assert.ok(twoTriplets.lines.some(line => line.includes('三色同刻まであと1面子')));
  const oneDragon = scoreHand(tiles([31, 31, 31, 32, 32, 0, 1, 2, 9, 10, 11, 18, 19, 20]), near, false, true, rules, 30);
  assert.ok(oneDragon.lines.some(line => line.includes('小三元まであと1面子')));
});

test('ニアピンは大三元・小四喜・大四喜の不足面子を判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const dragons = scoreHand(tiles([31, 31, 31, 32, 32, 32, 0, 1, 2, 9, 10, 11, 18, 18]), near, false, true, settings, 30);
  assert.ok(dragons.lines.some(line => line.includes('大三元まであと1面子 6翻')));
  const littleWinds = scoreHand(tiles([27, 27, 27, 28, 28, 28, 29, 29, 0, 1, 2, 9, 10, 11]), near, false, true, settings, 30);
  assert.ok(littleWinds.lines.some(line => line.includes('小四喜まであと1面子 6翻')));
  const bigWinds = scoreHand(tiles([27, 27, 27, 28, 28, 28, 29, 29, 29, 0, 1, 2, 31, 31]), near, false, true, settings, 30);
  assert.ok(bigWinds.lines.some(line => line.includes('大四喜まであと1面子 13翻')));
});

test('重複した同種の刻子だけでは大三元・大四喜にならない', () => {
  const repeatedDragon = scoreHand(tiles([31, 31, 31, 31, 31, 31, 31, 31, 31, 0, 1, 2, 9, 9]), player, false, true, { ...settings, yakumanStack: true }, 30);
  assert.ok(!repeatedDragon.lines.some(line => line.startsWith('大三元 ')));
  const repeatedWind = scoreHand(tiles([27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 27, 31, 31]), player, false, true, { ...settings, yakumanStack: true }, 30);
  assert.ok(!repeatedWind.lines.some(line => line.startsWith('大四喜 ')));
});

test('暗槓の4枚目とドラミングビートをドラ・符に反映する', () => {
  const hand = tiles([0, 0, 0, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const kan = [...hand.slice(0, 3), { id: 99, kind: 0, special: 'drumming' }];
  const result = scoreHand(hand, player, false, true, { ...settings, cards: false }, 33, false, { kans: [kan], rinshan: true });
  assert.ok(result.lines.some(line => line.includes('ドラミングビートの槓 +4ドラ')));
  assert.ok(result.lines.some(line => line.includes('ドラ 4枚 → 8翻')));
  assert.ok(result.lines.some(line => line.includes('嶺上開花')));
  assert.ok(result.fu >= 70);
});

test('ニアピンは四暗刻と槓子系役のあと1面子を判定する', () => {
  const hand = tiles([0, 0, 0, 9, 9, 9, 18, 18, 18, 21, 22, 23, 32, 32]);
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, yakumanStack: true };
  const concealed = scoreHand(hand, near, false, true, rules, 33);
  assert.ok(concealed.lines.some(line => line.includes('四暗刻まであと1面子 6翻')));
  assert.ok(!concealed.lines.some(line => line.startsWith('三暗刻 ')));
  const withoutNear = scoreHand(hand, player, false, true, rules, 33);
  assert.ok(withoutNear.lines.some(line => line.startsWith('三暗刻 ')));
  const kans = [0, 9, 18].map((kind, i) => [...hand.filter(tile => tile.kind === kind), { id: 100 + i, kind }]);
  const twoKans = scoreHand(hand, near, false, true, rules, 33, false, { kans: kans.slice(0, 2) });
  assert.ok(twoKans.lines.some(line => line.includes('三槓子まであと1面子 6翻')));
  const threeKans = scoreHand(hand, near, false, true, rules, 33, false, { kans });
  assert.ok(threeKans.lines.some(line => line.includes('四槓子まであと1面子 13翻')));
  assert.ok(!threeKans.lines.some(line => line.startsWith('三槓子 ')));
  const withoutNearKans = scoreHand(hand, player, false, true, rules, 33, false, { kans });
  assert.ok(withoutNearKans.lines.some(line => line.startsWith('三槓子 ')));
});

test('ニアピンは有効な四連刻のあと1面子を判定する', () => {
  const hand = tiles([9, 9, 9, 10, 10, 10, 11, 11, 11, 0, 1, 2, 31, 31]);
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, localYaku: { suurenko: true }, yakumanStack: true };
  const score = scoreHand(hand, near, false, true, rules, 33);
  assert.ok(score.lines.some(line => line.includes('四連刻まであと1面子 6翻')));
  const disabled = scoreHand(hand, near, false, true, { ...rules, localYaku: { suurenko: false } }, 33);
  assert.ok(!disabled.lines.some(line => line.includes('四連刻')));
});

test('ニアピンは混全帯么九と純全帯么九のあと1面子を判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const pure = scoreHand(tiles([0, 1, 2, 6, 7, 8, 9, 10, 11, 3, 4, 5, 8, 8]), near, false, true, settings, 33);
  assert.ok(pure.lines.some(line => line.includes('純全帯幺九まであと1面子')));
  const mixed = scoreHand(tiles([0, 1, 2, 6, 7, 8, 31, 31, 31, 3, 4, 5, 27, 27]), near, false, true, settings, 33);
  assert.ok(mixed.lines.some(line => line.includes('混全帯幺九まであと1面子')));
  const wrongPair = scoreHand(tiles([0, 1, 2, 6, 7, 8, 9, 10, 11, 3, 4, 5, 4, 4]), near, false, true, settings, 33);
  assert.ok(!wrongPair.lines.some(line => line.includes('全帯幺九まであと1面子')));
});

test('ニアピンは混老頭と清老頭のあと1面子を判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const pure = scoreHand(tiles([0, 0, 0, 8, 8, 8, 9, 9, 9, 12, 13, 14, 18, 18]), near, false, true, settings, 33);
  assert.ok(pure.lines.some(line => line.includes('清老頭まであと1面子 6翻')));
  const mixed = scoreHand(tiles([0, 0, 0, 8, 8, 8, 31, 31, 31, 12, 13, 14, 27, 27]), near, false, true, { ...settings, yakumanStack: true }, 33);
  assert.ok(mixed.lines.some(line => line.includes('混老頭まであと1面子')));
});

test('ニアピンは混一色と清一色のあと1面子を判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, yakumanStack: true };
  const pure = scoreHand(tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 8, 8]), near, false, true, rules, 33);
  assert.ok(pure.lines.some(line => line.includes('清一色まであと1面子 3翻')));
  const mixed = scoreHand(tiles([0, 1, 2, 3, 4, 5, 31, 31, 31, 9, 10, 11, 27, 27]), near, false, true, rules, 33);
  assert.ok(mixed.lines.some(line => line.includes('混一色まであと1面子 1翻')));
  const full = scoreHand(tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 8, 8]), near, false, true, rules, 33);
  assert.ok(!full.lines.some(line => line.includes('清一色まであと1面子')));
});

test('ニアピンは字一色と緑一色のあと1面子を判定する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, yakumanStack: true };
  const honors = scoreHand(tiles([27, 27, 27, 28, 28, 28, 29, 29, 29, 0, 1, 2, 31, 31]), near, false, true, rules, 33);
  assert.ok(honors.lines.some(line => line.includes('字一色まであと1面子 6翻')));
  const green = scoreHand(tiles([19, 19, 19, 23, 23, 23, 25, 25, 25, 0, 1, 2, 32, 32]), near, false, true, rules, 33);
  assert.ok(green.lines.some(line => line.includes('緑一色まであと1面子 6翻')));
  const wrongPair = scoreHand(tiles([19, 19, 19, 23, 23, 23, 25, 25, 25, 19, 20, 21, 31, 31]), near, false, true, rules, 33);
  assert.ok(!wrongPair.lines.some(line => line.includes('緑一色まであと1面子')));
});

test('補完した字一色・緑一色は純粋牌と役満ボディの変更要因を表示する', () => {
  const cases = [
    ['字一色', [27, 27, 27, 28, 28, 28, 29, 29, 29, 0, 1, 2, 31, 31]],
    ['緑一色', [19, 19, 19, 23, 23, 23, 25, 25, 25, 0, 1, 2, 32, 32]],
  ];
  for (const [name, kinds] of cases) {
    const hand = tiles(kinds);
    hand[0].special = 'pure';
    const near = { ...player, card: 'near', cards: ['near'], nearPinActive: true };
    const score = scoreHand(hand, near, false, true, settings, 33);
    assert.ok(score.lines.some(line => line.startsWith(`${name}まであと1面子 19翻（純粋牌・ニアピン）`)));
    const body = scoreHand(hand, { ...near, cards: ['near', 'yakumanBody'] }, false, true, settings, 33);
    assert.ok(body.lines.some(line => line.startsWith(`${name}まであと1面子 38翻（純粋牌・ニアピン・役満ボディ）`)));
    hand[0].special = undefined;
    const noPure = scoreHand(hand, near, false, true, settings, 33);
    assert.ok(noPure.lines.every(line => !line.includes('純粋牌')));
  }
});

test('ニアピンで補完した混一色にも浄化牌と純粋牌を適用する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const rules = { ...settings, yakumanStack: true };
  for (const pair of [27, 4]) {
    const hand = tiles([0, 1, 2, 3, 4, 5, 31, 31, 31, 9, 10, 11, pair, pair]);
    hand[0].special = 'purify';
    const purified = scoreHand(hand, near, false, true, rules, 33);
    assert.ok(purified.lines.some(line => line.includes('清一色まであと1面子（浄化牌） 3翻')));
    assert.ok(purified.lines.every(line => !line.includes('混一色まであと1面子')));
    hand[1].special = 'pure';
    const boosted = scoreHand(hand, near, false, true, rules, 33);
    assert.ok(boosted.lines.some(line => line.includes('清一色まであと1面子（浄化牌） 9翻') && line.includes('純粋牌・ニアピン')));
    const chi = { type: 'chi', tiles: hand.slice(0, 3) };
    const open = scoreHand(hand, { ...near, openMelds: [chi] }, false, true, rules, 33, false, { openMelds: [chi] });
    assert.ok(open.lines.some(line => line.includes('清一色まであと1面子（浄化牌） 7翻')));
    hand[0].special = undefined;
    const unpurified = scoreHand(hand, near, false, true, rules, 33);
    assert.ok(unpurified.lines.some(line => line.includes('混一色まであと1面子 1翻')));
  }
});

test('三槓子の強化設定を切り替えられる', () => {
  const kinds = [0, 0, 0, 9, 9, 9, 18, 18, 18, 21, 22, 23, 32, 32];
  const hand = tiles(kinds);
  const kans = [0, 9, 18].map((kind, i) => [...hand.filter(tile => tile.kind === kind), { id: 100 + i, kind }]);
  const enhanced = scoreHand(hand, player, false, true, { ...settings, cards: false, kanYakuEnhanced: true }, 33, false, { kans });
  const normal = scoreHand(hand, player, false, true, { ...settings, cards: false, kanYakuEnhanced: false }, 33, false, { kans });
  assert.ok(enhanced.lines.some(line => line.includes('三槓子 13翻')));
  assert.ok(normal.lines.some(line => line.includes('三槓子 2翻')));
});

test('ローカル役を個別設定で判定する', () => {
  const localYaku = { renhou: true, daisharin: true, daichisei: true, shiisantou: true, suurenko: true };
  const enabled = { ...settings, cards: false, localYaku };
  const wheel = tiles([10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16]);
  assert.ok(scoreHand(wheel, player, false, true, enabled, 33).lines.some(line => line.includes('大車輪')));
  assert.ok(!scoreHand(wheel, player, false, true, { ...enabled, localYaku: { ...localYaku, daisharin: false } }, 33).lines.some(line => line.includes('大車輪')));
  const stars = tiles([27, 27, 28, 28, 29, 29, 30, 30, 31, 31, 32, 32, 33, 33]);
  assert.ok(scoreHand(stars, player, false, true, enabled, 0).lines.some(line => line.includes('大七星')));
  const consecutive = tiles([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 13, 13]);
  assert.ok(scoreHand(consecutive, player, false, true, enabled, 33).lines.some(line => line.includes('四連刻')));
});

test('トランプマジックの十三不塔は10〜13との隣接も除外する', () => {
  const rules = { ...settings, cards: false, roundEvent: 'trump', localYaku: { shiisantou: true } };
  const kinds = [0, 1, 2].flatMap(suit => [1, 4, 7, 10].map(rank => suitKind(suit, rank)));
  const isolated = tiles([...kinds, suitKind(0, 13), suitKind(0, 1)]);
  assert.ok(scoreHand(isolated, player, false, true, rules, 0, false, { initialDraw: true }).lines.some(line => line.includes('十三不塔')));
  for (const rank of [8, 9, 11, 12]) {
    const adjacent = tiles([...kinds, suitKind(0, rank), suitKind(0, 1)]);
    assert.ok(!scoreHand(adjacent, player, false, true, rules, 0, false, { initialDraw: true }).lines.some(line => line.includes('十三不塔')), String(rank));
  }
  assert.ok(!scoreHand(isolated, player, false, true, rules, 0).lines.some(line => line.includes('十三不塔')));
});

test('初巡限定の人和と十三不塔を判定する', () => {
  const enabled = { ...settings, cards: false, localYaku: { renhou: true, shiisantou: true } };
  const normal = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  assert.ok(scoreHand(normal, player, false, false, enabled, 33, false, { initialRon: true }).lines.some(line => line.includes('人和')));
  const tower = tiles([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 27, 28, 29, 30]);
  assert.ok(scoreHand(tower, player, false, true, enabled, 33, false, { initialDraw: true }).lines.some(line => line.includes('十三不塔')));
  assert.equal(scoreHand(tower, player, false, true, enabled, 33).valid, false);
});

test('ダブル役満を個別に切り替えられる', () => {
  const kokushi = tiles([0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
  const on = scoreHand(kokushi, player, false, false, settings, 1, false, { winningKind: 0, winningTileId: 1 });
  const off = scoreHand(kokushi, player, false, false, { ...settings, doubleYakuman: { kokushi13: false } }, 1, false, { winningKind: 0, winningTileId: 1 });
  assert.ok(on.lines.some(line => line.includes('国士無双十三面待ち 26翻')));
  assert.ok(off.lines.some(line => line.includes('国士無双 13翻')));
  const chuuren = tiles([0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 8]);
  assert.ok(scoreHand(chuuren, player, false, true, settings, 33, false, { winningKind: 4, winningTileId: 7 }).lines.some(line => line.includes('純正九蓮宝燈 26翻')));
  assert.ok(scoreHand(chuuren, player, false, true, { ...settings, doubleYakuman: { junseiChuuren: false } }, 33, false, { winningKind: 4, winningTileId: 7 }).lines.some(line => line.includes('九蓮宝燈 13翻')));
  const suuankou = tiles([0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 31, 31]);
  assert.ok(scoreHand(suuankou, player, false, false, settings, 33, false, { winningKind: 31, winningTileId: 13 }).lines.some(line => line.includes('四暗刻単騎 26翻')));
  const winds = tiles([27, 27, 27, 28, 28, 28, 29, 29, 29, 30, 30, 30, 31, 31]);
  assert.ok(scoreHand(winds, player, false, true, { ...settings, doubleYakuman: { daisuushii: false } }, 33).lines.some(line => line.includes('大四喜 13翻')));
});

test('すべて加算でも四暗刻に下位の三暗刻を重ねない', () => {
  const hand = tiles([0, 0, 0, 9, 9, 9, 18, 18, 18, 27, 27, 27, 31, 31]);
  const result = scoreHand(hand, player, false, true, { ...settings, yakumanStack: true }, 33, false, { winningKind: 31, winningTileId: 13 });
  assert.ok(result.lines.some(line => line.startsWith('四暗刻単騎 ')));
  assert.ok(!result.lines.some(line => line.startsWith('三暗刻 ')));
});

test('九蓮宝燈は副露した手では成立しない', () => {
  const hand = tiles([0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 4]);
  const closed = scoreHand(hand, player, false, true, settings, 33);
  const open = scoreHand(hand, player, false, true, settings, 33, false, { openMelds: [{ type: 'pon', tiles: hand.slice(0, 3) }] });
  assert.ok(closed.lines.some(line => line.includes('九蓮宝燈')));
  assert.ok(!open.lines.some(line => line.includes('九蓮宝燈')));
});

test('赤ドラは3枚生成され、通常ドラと重複して数える', () => {
  const wall = makeWall(0, 'none', true);
  assert.deepEqual(wall.filter(tile => tile.red).map(tile => tile.kind).sort((a, b) => a - b), [4, 13, 22]);
  const hand = tiles([2, 3, 4, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  hand[2].red = true;
  const result = scoreHand(hand, player, false, true, { ...settings, cards: false }, 4);
  assert.ok(result.lines.some(line => line === '赤ドラ 1枚'));
  assert.ok(result.lines.some(line => line === 'ドラ 2枚 → 2翻'));
});

test('青天井は高翻数でも整数精度を保ち、点数の上限を設けない', () => {
  const hand = tiles([19, 19, 19, 20, 20, 20, 21, 21, 21, 23, 23, 23, 25, 25]);
  hand[0].special = 'pure';
  const result = scoreHand(hand, player, false, true, { ...settings, roundEvent: 'seitenjo' }, 0);
  assert.ok(result.han >= 52);
  assert.equal(typeof result.total, 'bigint');
  assert.ok(result.total > BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(result.total, result.dealerPayment + result.nonDealerPayment * 2n);
});

test('副露した手は門前役と面前至上主義を得ず、刻子の符を開いて数える', () => {
  const hand = tiles([31, 31, 31, 0, 1, 2, 9, 10, 11, 18, 19, 20, 32, 32]);
  const openMelds = [{ type: 'pon', tiles: hand.slice(0, 3) }];
  const closed = scoreHand(hand, { ...player, card: 'menzen' }, false, true, settings, 33);
  const open = scoreHand(hand, { ...player, card: 'menzen' }, false, true, settings, 33, false, { openMelds });
  assert.equal(open.valid, true);
  assert.ok(closed.lines.some(line => line.includes('門前清自摸和')));
  assert.ok(closed.lines.some(line => line.includes('面前至上主義')));
  assert.ok(!open.lines.some(line => line.includes('門前清自摸和') || line.includes('面前至上主義')));
  assert.ok(open.han > 0);
});

test('v0.2のイレギュラーと運命の導きが翻・ツモ倍率に反映される', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const ordinary = scoreHand(hand, player, false, true, settings, 33, false, { winningTileId: 13, winningKind: 32 });
  hand[0].special = 'irregular';
  hand[13].special = 'destiny';
  const boosted = scoreHand(hand, player, false, true, settings, 33, false, { winningTileId: 13, winningKind: 32 });
  assert.equal(boosted.han, ordinary.han + 20);
  assert.equal(boosted.multiplier, 5);
  assert.ok(boosted.lines.includes('イレギュラー +20翻'));
  assert.ok(boosted.lines.includes('運命の導き ×5'));
});

test('イレギュラーは河と副露に同じ打牌があっても4枚として重複計数しない', () => {
  const visible = tiles([4, 4, 4, 4]);
  const seat = { ...player, river: visible.slice(0, 2), openMelds: [{ type: 'pon', tiles: visible.slice(0, 3) }] };
  assert.equal(firstFourVisibleKind([seat]), null);
  seat.river.push(visible[3]);
  assert.equal(firstFourVisibleKind([seat]), 4);
});

test('イレギュラーは複数の牌種が4枚見えても先に公開された牌種を選ぶ', () => {
  const early = tiles([22, 22, 22, 22]).map((tile, index) => ({ ...tile, visibleOrder: index + 1 }));
  const late = tiles([4, 4, 4, 4]).map((tile, index) => ({ ...tile, id: tile.id + 10, visibleOrder: index + 5 }));
  const seats = [{ ...player, river: late }, { ...player, river: early }];
  assert.equal(firstFourVisibleKind(seats), 22);
  seats[1].river.pop();
  assert.equal(firstFourVisibleKind(seats), 4);
});

test('役満ボディは成立した役満の翻を倍にする', () => {
  const hand = tiles([0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
  const ordinary = scoreHand(hand, player, false, false, settings, 1, false, { winningKind: 0, winningTileId: 1 });
  const boosted = scoreHand(hand, { ...player, card: 'yakumanBody' }, false, false, settings, 1, false, { winningKind: 0, winningTileId: 1 });
  assert.equal(boosted.han, ordinary.han * 2);
  assert.ok(boosted.lines.some(line => line.includes('役満ボディ')));
});

test('同じ牌が通常の4枚制限を超えた特殊形を判定する', () => {
  const hand = tiles(Array(14).fill(31));
  const result = scoreHand(hand, player, false, true, settings, 33);
  assert.ok(result.lines.some(line => line.includes('同一色 39翻')));
  assert.ok(!result.lines.some(line => line.includes('四同刻')));
});

test('三同刻と四同刻は上位役を優先し、副露で三同刻は8翻になる', () => {
  const three = tiles([4, 4, 4, 4, 4, 4, 4, 4, 4, 9, 10, 11, 31, 31]);
  const closed = scoreHand(three, player, false, true, settings, 33);
  assert.ok(closed.lines.some(line => line.includes('三同刻 10翻')));
  const open = scoreHand(three, player, false, true, settings, 33, false, { openMelds: [{ type: 'pon', tiles: three.slice(0, 3) }] });
  assert.ok(open.lines.some(line => line.includes('三同刻 8翻')));
  const four = tiles([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 31, 31]);
  const upper = scoreHand(four, player, false, true, settings, 33);
  assert.ok(upper.lines.some(line => line.includes('四同刻 26翻')));
  assert.ok(!upper.lines.some(line => line.includes('三同刻')));
});
test('特殊役を個別に無効化すると得点から外れる', () => {
  const same = tiles(Array(14).fill(31));
  const disabled = scoreHand(same, player, false, true, { ...settings, specialYaku: { sameColor: false, sameTriplet4: false, sameTriplet3: false } }, 33);
  assert.ok(!disabled.lines.some(line => /同一色|四同刻|三同刻/.test(line)));
  const four = tiles([...Array(12).fill(4), 31, 31]);
  const lower = scoreHand(four, player, false, true, { ...settings, yakumanStack: true, specialYaku: { sameTriplet4: false } }, 33);
  assert.ok(lower.lines.some(line => line.startsWith('三同刻 ')));
  assert.ok(!lower.lines.some(line => line.startsWith('四同刻 ')));
  const run = tiles([...Array.from({ length: 13 }, (_, index) => suitKind(0, index + 1)), suitKind(0, 2)]);
  const noRun = scoreHand(run, player, false, true, { ...settings, roundEvent: 'trump', specialYaku: { superStraight: false, lantern: false } }, 33);
  assert.ok(!noRun.lines.some(line => /超一気通貫|十三連宝燈/.test(line)));
});
test('ニアピンは一色三連への不足1連子を判定し三連子と重ねない', () => {
  const hand = tiles([0, 1, 2, 3, 3, 4, 5, 6, 9, 10, 11, 12, 31, 31]);
  const near = { ...player, card: 'near', nearPinActive: true };
  const score = scoreHand(hand, near, false, true, settings, 33);
  assert.equal(score.shape, '連子形');
  assert.ok(score.lines.some(line => line.includes('一色三連まであと1面子 1翻（ニアピン）')));
  assert.ok(score.lines.every(line => !line.startsWith('三連子 ')));
  const inactive = scoreHand(hand, { ...near, nearPinActive: false }, false, true, settings, 33);
  assert.ok(inactive.lines.some(line => line.startsWith('三連子 ')));
  const disabled = scoreHand(hand, near, false, true, { ...settings, specialYaku: { isshokusanren: false } }, 33);
  assert.ok(disabled.lines.every(line => !line.includes('一色三連')));
  assert.ok(disabled.lines.some(line => line.startsWith('三連子 ')));
  const different = scoreHand(tiles([0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 21, 31, 31]), near, false, true, settings, 33);
  assert.ok(different.lines.every(line => !line.includes('一色三連')));
});

test('ニアピンの連子形の断么九は4枚目も確認し完全成立と重ねない', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const full = scoreHand(tiles([1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 24, 13, 13]), near, false, true, settings, 33);
  assert.equal(full.shape, '連子形');
  assert.ok(full.lines.some(line => line.startsWith('断么九 ')));
  assert.ok(full.lines.every(line => !line.includes('断么九まであと1面子')));
  const missing = scoreHand(tiles([1, 2, 3, 4, 11, 12, 13, 14, 23, 24, 25, 26, 13, 13]), near, false, true, settings, 33);
  assert.equal(missing.shape, '連子形');
  assert.ok(missing.lines.some(line => line.startsWith('断么九まであと1面子 ')));
  assert.ok(missing.lines.every(line => !line.startsWith('断么九 ')));
  const twoMissing = scoreHand(tiles([0, 1, 2, 3, 11, 12, 13, 14, 23, 24, 25, 26, 13, 13]), near, false, true, settings, 33);
  assert.ok(twoMissing.lines.every(line => !line.includes('断么九')));
});

test('連子形の1234を順子として混全帯幺九・純全帯幺九へ補完しない', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  for (const pair of [0, 31]) {
    const hand = tiles([0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 21, pair, pair]);
    for (const purify of [false, true]) {
      if (purify) hand[0].special = 'purify';
      const score = scoreHand(hand, near, false, true, settings, 33);
      assert.equal(score.shape, '連子形');
      assert.ok(score.lines.every(line => !line.includes('全帯幺九')));
    }
  }
});

test('連子形のニアピン一色役は2連子と雀頭の種類を確認する', () => {
  const near = { ...player, card: 'near', nearPinActive: true };
  const kinds = [0, 1, 2, 3, 3, 4, 5, 6, 9, 10, 11, 12];
  const clear = scoreHand(tiles([...kinds, 4, 4]), near, false, true, settings, 33);
  assert.equal(clear.shape, '連子形');
  assert.ok(clear.lines.some(line => line.startsWith('清一色まであと1面子 3翻')));
  const mixedHand = tiles([...kinds, 31, 31]);
  const mixed = scoreHand(mixedHand, near, false, true, settings, 33);
  assert.ok(mixed.lines.some(line => line.startsWith('混一色まであと1面子 1翻')));
  mixedHand[0].special = 'purify';
  mixedHand[1].special = 'pure';
  const purified = scoreHand(mixedHand, near, false, true, settings, 33);
  assert.ok(purified.lines.some(line => line.startsWith('清一色まであと1面子（浄化牌） 9翻')));
  const wrongPair = scoreHand(tiles([...kinds, 13, 13]), near, false, true, settings, 33);
  assert.ok(wrongPair.lines.every(line => !line.includes('清一色まで') && !line.includes('混一色まで')));
  const twoMissing = scoreHand(tiles([0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 21, 4, 4]), near, false, true, settings, 33);
  assert.ok(twoMissing.lines.every(line => !line.includes('清一色まで') && !line.includes('混一色まで')));
});

test('連子3組と雀頭を一色三連として判定する', () => {
  const hand = tiles([0, 1, 2, 3, 2, 3, 4, 5, 5, 6, 7, 8, 31, 31]);
  const result = scoreHand(hand, player, false, true, settings, 33);
  assert.equal(result.shape, '連子形');
  assert.ok(result.lines.some(line => line.startsWith('一色三連 3翻')));
  assert.ok(!result.lines.some(line => line.startsWith('三連子 ')));
  const disabled = scoreHand(hand, player, false, true, { ...settings, specialYaku: { isshokusanren: false } }, 33);
  assert.ok(disabled.lines.some(line => line.startsWith('三連子 1翻')));
  const mixed = tiles([0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 21, 31, 31]);
  const basic = scoreHand(mixed, player, false, true, settings, 33);
  assert.equal(basic.shape, '連子形');
  assert.ok(basic.lines.some(line => line.startsWith('三連子 1翻')));
});

test('純粋牌は一色三連を3倍にしてからニアピンで半減する', () => {
  const hand = tiles([0, 1, 2, 3, 2, 3, 4, 5, 5, 6, 7, 8, 31, 31]);
  hand[0].special = 'pure';
  const rules = { ...settings, cards: false };
  const score = scoreHand(hand, player, false, true, rules, 33);
  assert.ok(score.lines.some(line => line.includes('一色三連 9翻（純粋牌）')));
  const near = { ...player, card: 'near', nearPinActive: true };
  const halved = scoreHand(hand, near, false, true, settings, 33);
  assert.ok(halved.lines.some(line => line.includes('一色三連 4翻（純粋牌・ニアピン）')));
  const mixed = tiles([0, 1, 2, 3, 3, 4, 5, 6, 9, 10, 11, 12, 31, 31]);
  mixed[0].special = 'pure';
  const complemented = scoreHand(mixed, near, false, true, settings, 33);
  assert.ok(complemented.lines.some(line => line.includes('一色三連まであと1面子 4翻（純粋牌・ニアピン）')));
  const ordinary = scoreHand(mixed, player, false, true, rules, 33);
  assert.ok(ordinary.lines.some(line => line.startsWith('三連子 1翻')));
  assert.ok(ordinary.lines.every(line => !line.includes('純粋牌')));
});
test('連子形と刻子形が競合するとき高い和了点の解釈だけを採用する', () => {
  const hand = tiles([...Array(3).fill([0, 1, 2, 3]).flat(), 31, 31]);
  const result = scoreHand(hand, player, false, true, settings, 33);
  assert.ok(result.valid);
  assert.equal(result.shape, '通常形');
  assert.ok(!result.lines.some(line => line.startsWith('一色三連 ')));
});
test('神経衰弱は3枚の順子・刻子だけを獲得し、完成和了点を3倍にする', () => {
  assert.equal(isMemoryMeld(tiles([0, 1, 2])), true);
  assert.equal(isMemoryMeld(tiles([31, 31, 31])), true);
  assert.equal(isMemoryMeld(tiles([0, 1, 9])), false);
  assert.equal(isMemoryMeld(tiles([0, 1, 3])), false);
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 4, 4]);
  const ordinary = scoreHand(hand, player, false, true, { ...settings, cards: false }, [], false, { initialDraw: false });
  const memory = scoreHand(hand, player, false, true, { ...settings, cards: false, roundEvent: 'memory' }, [], false, { initialDraw: false });
  assert.equal(memory.total, ordinary.total * 3n);
  assert.ok(memory.lines.includes('神経衰弱 ×3'));
});

test('同種の刻子が複数あるロンでは完成した1組だけを明刻として数える', () => {
  const hand = tiles([...Array(12).fill(4), 31, 31]);
  const result = scoreHand(hand, player, false, false, { ...settings, yakumanStack: true }, 33, false, { winningKind: 4, winningTileId: 0 });
  assert.ok(result.lines.some(line => line.includes('三暗刻')));
  assert.equal(result.fu, 50);
});

test('牌変化では特殊効果を維持し、付与条件だけを見直す', () => {
  const tile = { id: 1, kind: 0, special: 'musou', red: true };
  changeTileKind(tile, 9);
  assert.equal(tile.special, 'musou');
  assert.equal(tile.red, undefined);
  changeTileKind(tile, 10);
  assert.equal(tile.special, undefined);
});

test('踊り子の役別テンプレートはすべて聴牌している', () => {
  for (const pattern of dancerPatterns) assert.equal(isTenpai(tiles(pattern)), true);
});

test('踊り子は役別テンプレートごとに有効な色をまとめ、同じ形を重複させない', () => {
  const groups = dancerPatternGroups([dancerPatterns[0], dancerPatterns[30]], [], 'none', 4);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].length, 6);
  assert.equal(groups[1].length, 1);
  const unchanged = dancerPatternGroups([dancerPatterns[30]], dancerPatterns[30], 'none', 4);
  assert.equal(unchanged.length, 0);
  const sanma = dancerPatternGroups([dancerPatterns[0]], [], 'none', 3);
  assert.ok(sanma.every(group => group.every(pattern => pattern.every(kind => availableKinds('none', 3).includes(kind)))));
});

test('踊り子は数字を反転して候補を増やし、目標役を失う候補は除く', () => {
  const source = dancerPatterns[dancerRoles.indexOf('断么九')];
  const reverse = dancerVariant(source, 0, 'none', true);
  assert.notDeepEqual([...reverse].sort((a, b) => a - b), [...source].sort((a, b) => a - b));
  assert.equal(dancerRoleReachable(reverse, '断么九', 'none', 4, settings), true);
  const green = dancerPatterns[dancerRoles.indexOf('緑一色')];
  assert.equal(dancerRoleReachable(dancerVariant(green, 0, 'none', true), '緑一色', 'none', 4, settings), false);
  const choices = dancerRoleChoices([green], ['緑一色'], [], 'none', 4, (pattern, role) => dancerRoleReachable(pattern, role, 'none', 4, settings));
  assert.equal(choices.length, 1);
  assert.equal(choices[0].variants.length, 1);
  const trump = dancerVariant([suitKind(0, 1), suitKind(0, 9), suitKind(0, 10), suitKind(0, 13), 31], 1, 'trump', true);
  assert.deepEqual(trump, [suitKind(1, 13), suitKind(1, 5), suitKind(1, 4), suitKind(1, 1), 31]);
  for (const event of ['none', 'hachiku', 'trump']) for (const playerCount of [3, 4]) {
    const patterns = dancerPatterns.filter(pattern => event !== 'trump' || pattern.every(kind => kind < 27));
    const groups = dancerPatternGroups(patterns, source, event, playerCount);
    for (const variants of groups) {
      const keys = variants.map(pattern => [...pattern].sort((a, b) => a - b).join(','));
      assert.equal(new Set(keys).size, keys.length);
      for (const pattern of variants) {
        assert.equal(isTenpai(tiles(pattern), event, playerCount), true);
        assert.ok(pattern.every(kind => availableKinds(event, playerCount).includes(kind)));
        assert.notEqual([...pattern].sort((a, b) => a - b).join(','), [...source].sort((a, b) => a - b).join(','));
      }
    }
  }
});

test('踊り子は同じ役を狙う複数の聴牌形を一つの抽選枠にまとめる', () => {
  assert.equal(dancerRoles.length, dancerPatterns.length);
  const groups = dancerRoleGroups([dancerPatterns[7], dancerPatterns[23]], ['小三元', '小三元'], [], 'none', 4);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].length >= 2);
  assert.equal(dancerRoleGroups(dancerPatterns, dancerRoles, [], 'none', 4).length, new Set(dancerRoles).size);
});

test('踊り子の各テンプレートは割り当てられた役を狙える', () => {
  const rules = { ...settings, yakumanStack: true, localYaku: { daisharin: true, daichisei: true, suurenko: true } };
  for (const [index, role] of dancerRoles.entries()) {
    const pattern = tiles(dancerPatterns[index]);
    const roleWind = ['東の刻子', '南の刻子', '西の刻子', '北の刻子'].indexOf(role);
    const reachesRole = waitKinds(pattern).some(kind => {
      const hand = [...pattern, { id: 99, kind }];
      const score = bestScore(hand, player, false, true, rules, 30, false, { winningKind: kind, winningTileId: 99, seatWind: roleWind < 0 ? 28 : 27 + roleWind });
      return score.lines.some(line => line.includes(role));
    });
    assert.equal(reachesRole, true, `${index}: ${role}`);
  }
});

test('踊り子の風牌候補は席風か場風に一致する局だけ抽選する', () => {
  const rules = { ...settings, cards: false };
  for (const [wind, role] of ['東の刻子', '南の刻子', '西の刻子', '北の刻子'].entries()) {
    const pattern = dancerPatterns[dancerRoles.indexOf(role)];
    assert.equal(dancerRoleReachable(pattern, role, 'none', 4, rules, 27 + wind, 27), true, role);
    if (wind > 1) assert.equal(dancerRoleReachable(pattern, role, 'none', 4, rules, 28, 27), false, role);
  }
});
test('踊り子は暗槓を固定したまま残りの手牌を聴牌形に変化できる', () => {
  for (const event of ['none', 'hachiku', 'trump']) {
    const kind = event === 'hachiku' ? 22 : 13;
    const kan = tiles([kind, kind, kind, kind]);
    const pattern = dancerKanFallback([kind], event);
    const loose = dancerLooseTiles(pattern, [kind]);
    assert.equal(loose?.length, 10);
    assert.equal(isTenpai(tiles(pattern), event), true);
    assert.equal(dancerRoleReachable(pattern, '門前清自摸和', event, 4, settings, 28, 27, [kan]), true);
    assert.equal(dancerLooseTiles(tiles([0, 1, 2]).map(tile => tile.kind), [kind]), null);
  }
});

test('踊り子は無効にしたローカル役を抽選しない', () => {
  for (const role of ['大車輪', '大七星', '四連刻']) assert.equal(dancerRoleEnabled(role), false, role);
  assert.equal(dancerRoleEnabled('大車輪', { daisharin: true }), true);
  assert.equal(dancerRoleEnabled('大七星', { daichisei: true }), true);
  assert.equal(dancerRoleEnabled('四連刻', { suurenko: true }), true);
  assert.equal(dancerRoleEnabled('平和'), true);
  for (const role of ['三色同順', '三色同刻']) {
    assert.equal(dancerRoleEnabled(role, undefined, undefined, 'hachiku'), false, role);
    assert.equal(dancerRoleEnabled(role, undefined, undefined, 'none'), true, role);
  }
  assert.equal(dancerRoleEnabled('三同刻', undefined, undefined, 'hachiku'), true);
  assert.equal(dancerRoleEnabled('四同刻', undefined, undefined, 'hachiku'), true);
  for (const [role, key] of [['国士無双十三面待ち', 'kokushi13'], ['四暗刻単騎', 'suankoTanki'], ['純正九蓮宝燈', 'junseiChuuren']]) {
    assert.equal(dancerRoleEnabled(role), true);
    assert.equal(dancerRoleEnabled(role, undefined, { [key]: false }), false);
  }
});

test('踊り子は変化後に狙った役で和了できない聴牌形を抽選しない', () => {
  const rules = { ...settings, localYaku: { daisharin: true, daichisei: true, suurenko: true }, specialYaku: { sanrenko: true, isshokusanren: true } };
  const role = '三連子';
  const original = dancerPatterns[dancerRoles.indexOf(role)];
  const changed = dancerVariant(original, 0, 'hachiku');
  assert.equal(dancerRoleReachable(original, role, 'none', 4, rules), true);
  assert.equal(dancerRoleReachable(changed, role, 'hachiku', 4, rules), false);
  assert.equal(dancerRoleGroups([original], [role], [], 'hachiku', 4, (pattern, target) => dancerRoleReachable(pattern, target, 'hachiku', 4, rules)).length, 0);
});

test('トランプマジック中の踊り子は三色で超一気通貫を狙える', () => {
  for (let suit = 0; suit < 3; suit++) {
    const pattern = dancerVariant(trumpDancerPatterns[0], suit, 'trump');
    assert.equal(isTenpai(tiles(pattern), 'trump'), true);
    const extra = suitKind(suit, 7);
    const score = bestScore([...tiles(pattern), { id: 99, kind: extra }], player, false, true, { ...settings, cards: false, roundEvent: 'trump' }, extra);
    assert.ok(score.lines.some(line => line.startsWith('超一気通貫')), `色${suit}`);
  }
});

test('追加した踊り子の聴牌形は狙った役で和了できる', () => {
  const roles = ['一盃口', '二盃口', '三色同刻', '混全帯幺九', '純全帯幺九', '混老頭', '混一色', '清一色', '小三元', '大七星', '対々和', '三暗刻', '白の刻子', '大四喜', '四同刻', '同一色'];
  assert.ok(dancerPatterns.length >= 15 + roles.length);
  for (const [index, role] of roles.entries()) {
    const pattern = tiles(dancerPatterns[index + 15]);
    const reachesRole = waitKinds(pattern).some(kind => bestScore([...pattern, { id: 99, kind }], player, false, true, { ...settings, cards: false, yakumanStack: true, localYaku: { daichisei: true } }, 30).lines.some(line => line.startsWith(role)));
    assert.equal(reachesRole, true, role);
  }
});

test('踊り子は字一色・三同刻・ダブル役満の形も抽選できる', () => {
  const additional = ['字一色', '三同刻', '国士無双十三面待ち', '四暗刻単騎', '純正九蓮宝燈'];
  for (const role of additional) {
    const index = dancerRoles.indexOf(role);
    assert.ok(index >= 0, role);
    const pattern = tiles(dancerPatterns[index]);
    assert.ok(waitKinds(pattern).some(kind => {
      const score = bestScore([...pattern, { id: 99, kind }], player, false, true, { ...settings, yakumanStack: true }, 30, false, { winningKind: kind, winningTileId: 99 });
      return score.lines.some(line => line.startsWith(`${role} `));
    }), role);
  }
});

test('複数枚配布でも同局のカードは重複せず、踊り子と多牌は同時に配られない', () => {
  for (let i = 0; i < 50; i++) {
    const dealt = dealCards(3);
    assert.deepEqual(dealt.map(cards => cards.length), [3, 3, 3, 3]);
    assert.equal(new Set(dealt.flat()).size, 12);
    assert.ok(dealt.every(cards => !(cards.includes('dancer') && cards.includes('multipai'))));
  }
});

test('複数枚の能力カードの常時効果が重ねて適用される', () => {
  const hand = tiles([0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
  const combined = scoreHand(hand, { ...player, cards: ['yakumanBody', 'seitenjo'] }, false, false, settings, 1, false, { winningKind: 0, winningTileId: 1 });
  const single = scoreHand(hand, { ...player, card: 'yakumanBody' }, false, false, settings, 1, false, { winningKind: 0, winningTileId: 1 });
  assert.equal(combined.han, single.han);
  assert.ok(combined.total > single.total);
});

test('ゾンビの増殖では対象が元のゾンビと同じ牌種に変化する', () => {
  const source = { id: 1, kind: 13, special: 'zombie', red: true };
  const target = { id: 2, kind: 31, special: 'knockout' };
  infectWithZombie(target, source);
  assert.deepEqual(target, { id: 2, kind: 13, special: 'zombie', red: true });
  const next = { id: 3, kind: 4, red: true };
  infectWithZombie(next, target);
  assert.deepEqual(next, { id: 3, kind: 13, special: 'zombie', red: true });
});
test('トランプマジックのゾンビは圧縮牌の2枚目も変化させ、幺九牌の効果を保つ', () => {
  const hand = [
    { id: 1, kind: 37, special: 'zombie' },
    { id: 2, kind: 0, compressedMate: { id: 3, kind: 0, special: 'musou' } },
  ];
  spreadZombies(hand, () => 0, 'trump');
  assert.equal(hand[1].kind, 37);
  assert.equal(hand[1].special, 'zombie');
  assert.equal(hand[1].compressedMate.kind, 37);
  assert.equal(hand[1].compressedMate.special, 'musou');
});

test('複数のゾンビは独立抽選し、新しいゾンビは次の打牌から抽選する', () => {
  const hand = [
    { id: 1, kind: 4, special: 'zombie' },
    { id: 2, kind: 13, special: 'zombie', red: true },
    { id: 3, kind: 31 },
    { id: 4, kind: 32 },
  ];
  let calls = 0;
  const changed = spreadZombies(hand, () => { calls++; return 0; });
  assert.deepEqual(changed, [{ previousKind: 31, targetKind: 4 }, { previousKind: 32, targetKind: 13 }]);
  assert.equal(calls, 4);
  assert.deepEqual(hand[2], { id: 3, kind: 4, special: 'zombie' });
  assert.deepEqual(hand[3], { id: 4, kind: 13, special: 'zombie', red: true });
  spreadZombies(hand, () => { calls++; return 0; });
  assert.equal(calls, 8);
});

test('ツモ予約はプレイヤーごとに消化し、再予約で未消化分を上書きする', () => {
  const owner = { ...player, drawReservations: [] };
  reserveDraws(owner, [4, 4]);
  const first = { id: 10, kind: 31 };
  assert.equal(consumeDrawReservation(owner, first), true);
  assert.equal(first.kind, 4);
  const firstAgain = { id: 12, kind: 32 };
  assert.equal(consumeDrawReservation(owner, firstAgain), true);
  assert.equal(firstAgain.kind, 4);
  assert.deepEqual(owner.drawReservations, []);
  reserveDraws(owner, [8, 9]);
  const second = { id: 11, kind: 20 };
  consumeDrawReservation(owner, second);
  assert.equal(second.kind, 8);
  assert.deepEqual(owner.drawReservations, [9]);
});
test('幺九牌の打牌で両カードが発動するとポケットビスケットの2回予約を優先する', () => {
  const owner = { ...player, cards: ['machinegun', 'pocket'], drawReservations: [], pocketArmed: true };
  assert.deepEqual(reserveAfterDiscard(owner, 0, 'none', 4, () => 0.5), { machinegun: true, pocket: true });
  assert.deepEqual(owner.drawReservations, [0, 0]);
  assert.equal(owner.pocketArmed, false);
  assert.deepEqual(reserveAfterDiscard(owner, 8, 'none', 4, () => 0), { machinegun: true, pocket: false });
  assert.deepEqual(owner.drawReservations, [0]);
});

test('役満のみ設定ではドラを加算せず、すべて加算では通常役とドラを加える', () => {
  const hand = tiles([0, 0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
  hand[0].special = 'irregular';
  const only = scoreHand(hand, player, false, false, { ...settings, yakumanStack: false }, 0);
  const all = scoreHand(hand, player, false, false, { ...settings, yakumanStack: true }, 0);
  assert.equal(only.han, 13);
  assert.ok(all.han > only.han);
  assert.ok(!only.lines.some(line => line.includes('イレギュラー')));
  assert.ok(all.lines.some(line => line.includes('イレギュラー +20翻')));
  assert.ok(!only.lines.some(line => line.startsWith('ドラ ')));
  assert.ok(all.lines.some(line => line.startsWith('ドラ ')));
});

test('オープンリーチの2翻と対象者の放銃ペナルティを判定する', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const ready = { ...player, riichi: true, openRiichi: true };
  const normal = scoreHand(hand, ready, false, false, settings, 33);
  const penalty = scoreHand(hand, ready, false, false, settings, 33, false, { openRiichiPenalty: true });
  assert.ok(normal.lines.some(line => line.includes('オープンリーチ 2翻')));
  assert.ok(penalty.lines.some(line => line.includes('オープンリーチ放銃 13翻')));
});

test('アルティメットリーチの和了点は6回目のツモまで10倍になる', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const early = scoreHand(hand, { ...player, cards: ['ultimate'], riichi: true, riichiDraws: 6 }, false, true, settings, 33);
  const late = scoreHand(hand, { ...player, cards: ['ultimate'], riichi: true, riichiDraws: 7 }, false, true, settings, 33);
  const failed = scoreHand(hand, { ...player, cards: ['ultimate'], riichi: true, riichiDraws: 6, ultimatePenaltyDone: true }, false, true, settings, 33);
  assert.equal(early.total, late.total * 10n);
  assert.equal(failed.total, late.total);
  assert.ok(!failed.lines.some(line => line.includes('アルティメットリーチ ×10')));
});

test('トラップ牌でのロンは和了者が打牌者へ支払う', () => {
  const players = [{ ...player, points: 100000n }, { ...player, points: 100000n }];
  transferRonPoints(players, 0, 1, 12000n, true);
  assert.deepEqual(players.map(p => p.points), [88000n, 112000n]);
});

test('ハイリスクハイリターンは自分の和了と自分が支払う放銃だけを3倍にする', () => {
  const hand = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 31, 31, 31, 32, 32]);
  const ordinary = scoreHand(hand, { ...player, cards: [] }, false, true, settings, 33);
  const boosted = scoreHand(hand, { ...player, cards: ['highRisk'] }, false, true, settings, 33);
  assert.equal(boosted.total, ordinary.total * 3n);
  assert.ok(boosted.lines.includes('ハイリスクハイリターン ×3'));
  const players = [{ ...player, points: 100000n }, { ...player, cards: ['highRisk'], points: 100000n }, { ...player, points: 100000n }];
  assert.equal(transferRonPoints(players, 0, 1, 12000n, false, 1, true), 36000n);
  assert.deepEqual(players.map(p => p.points), [136000n, 64000n, 100000n]);
  assert.equal(transferRonPoints(players, 0, 1, 12000n, false, 2, true), 12000n);
  assert.equal(transferRonPoints(players, 0, 1, 12000n, true, 1, true), 12000n);
  assert.equal(transferRonPoints(players, 0, 1, 12000n, false, 1, false), 12000n);
});

test('鬼に金棒は最も翻数が高い成立役1つを役数倍する', () => {
  const hand = tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 4, 4]);
  const rules = { ...settings, yakumanStack: true };
  const ordinary = scoreHand(hand, { ...player, cards: [] }, false, true, rules, 33);
  const boosted = scoreHand(hand, { ...player, cards: ['oni'] }, false, true, rules, 33);
  const roleCount = ordinary.lines.filter(line => /^.+ \d+翻/.test(line)).length;
  const flush = ordinary.lines.find(line => line.startsWith('清一色 '));
  const flushHan = Number(flush.match(/ (\d+)翻/)[1]);
  assert.ok(roleCount > 1);
  assert.equal(boosted.han, ordinary.han + flushHan * (roleCount - 1));
  assert.ok(boosted.lines.some(line => line.startsWith(`清一色 ${flushHan * roleCount}翻`) && line.includes('鬼に金棒')));
});

test('タンヤオ32000点は2～5の数牌だけで断么九が唯一の役なら13翻にする', () => {
  const hand = tiles([1, 2, 3, 11, 12, 13, 19, 20, 21, 4, 4, 4, 10, 10]);
  const openMelds = [{ type: 'chi', tiles: hand.slice(0, 3) }];
  const rules = { ...settings, yakumanStack: true };
  const ordinary = scoreHand(hand, { ...player, cards: [] }, false, true, rules, 33, false, { openMelds });
  const boosted = scoreHand(hand, { ...player, cards: ['tanyao32000'] }, false, true, rules, 33, false, { openMelds });
  assert.ok(ordinary.lines.some(line => line.startsWith('断么九 1翻')));
  assert.ok(boosted.lines.some(line => line.startsWith('断么九 13翻') && line.includes('タンヤオ32000点')));
  const outside = tiles([0, 1, 2, 11, 12, 13, 19, 20, 21, 4, 4, 4, 10, 10]);
  assert.ok(!scoreHand(outside, { ...player, cards: ['tanyao32000'] }, false, true, rules, 33, false, { openMelds: [{ type: 'chi', tiles: outside.slice(0, 3) }] }).lines.some(line => line.includes('タンヤオ32000点')));
});
test('下克上はオーラスの最下位だけ成立役を各13翻にする', () => {
  const hand = tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 4, 4]);
  const owner = { ...player, cards: ['gekokujou'] };
  const inactive = scoreHand(hand, owner, false, true, settings, 33);
  const active = scoreHand(hand, owner, false, true, settings, 33, false, { finalRoundLast: true });
  assert.ok(active.valid && active.han > inactive.han);
  assert.ok(active.lines.some(line => line.includes('下克上')));
  assert.ok(active.lines.filter(line => line.includes('下克上')).every(line => line.includes('13翻')));
});
test('下克上で役満扱いになった役にも役満ボディを適用する', () => {
  const hand = tiles([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 4, 4]);
  const rules = { ...settings, yakumanStack: true };
  const base = scoreHand(hand, { ...player, cards: ['gekokujou'] }, false, true, rules, 33, false, { finalRoundLast: true });
  const boosted = scoreHand(hand, { ...player, cards: ['gekokujou', 'yakumanBody'] }, false, true, rules, 33, false, { finalRoundLast: true });
  assert.equal(boosted.han, base.han * 2);
  assert.ok(boosted.lines.filter(line => line.includes('下克上')).every(line => line.includes('26翻') && line.includes('役満ボディ')));
});
test('なきむしは四副露した単騎待ちだけで成立する', () => {
  const hand = tiles([0, 0, 0, 9, 9, 9, 18, 18, 18, 31, 31, 31, 4, 4]);
  const melds = [0, 3, 6, 9].map(start => ({ type: 'pon', tiles: hand.slice(start, start + 3) }));
  const owner = { ...player, cards: ['nakimushi'] };
  const active = scoreHand(hand, owner, false, false, settings, 33, false, { openMelds: melds, winningKind: 4, winningTileId: 13 });
  assert.ok(active.lines.some(line => line.startsWith('なきむし 13翻')));
  const inactive = scoreHand(hand, owner, false, false, settings, 33, false, { openMelds: melds.slice(0, 3), winningKind: 4, winningTileId: 13 });
  assert.ok(!inactive.lines.some(line => line.startsWith('なきむし')));
});

test('流し満貫は么九牌だけを捨て、河を鳴かれていないとき成立する', () => {
  const river = tiles([0, 8, 27, 31]);
  assert.equal(nagashiEligible({ ...player, river }), true);
  assert.equal(nagashiEligible({ ...player, river, riverCalled: true }), false);
  assert.equal(nagashiEligible({ ...player, river: tiles([0, 1, 8]) }), false);
});
test('ものひろいで河から消えた中張牌は捨牌判定から外れ、鳴き扱いにはならない', () => {
  const source = { ...player, river: tiles([0, 4]), riverCalled: false };
  const picked = takeRiverTile(source, source.river[1].id);
  assert.equal(picked?.kind, 4);
  assert.equal(source.riverCalled, false);
  assert.equal(nagashiEligible(source), true);
});

test('刻子牌1枚で刻子を作り、余る2枚を和了形から除く', () => {
  const hand = tiles([31, 0, 1, 2, 9, 10, 11, 18, 19, 20, 32, 27, 29, 32]);
  assert.equal(isWinningShape(hand), false);
  hand[0].special = 'triplet';
  assert.equal(isWinningShape(hand), true);
  const scored = bestScore(hand, player, false, true, settings, 31, false, { winningTileId: 13, winningKind: 32 });
  assert.equal(scored.valid, true);
  assert.equal(scored.chosen.filter(tile => tile.virtual).length, 2);
  assert.ok(scored.lines.some(line => line === 'ドラ 1枚 → 1翻'));
});
