import test from 'node:test';
import assert from 'node:assert/strict';
import { yakuInfo } from '../src/yaku_catalog.ts';

const rules = { rounds: 4, specialCount: 5, startingPoints: 100000, kazoeMultiple: true, cards: true };

test('役一覧はローカル役と特殊役の設定を区別して表示する', () => {
  assert.equal(yakuInfo('人和', '13翻', rules, 'none').status, 'disabled');
  assert.equal(yakuInfo('人和', '13翻', { ...rules, localYaku: { renhou: true } }, 'none').status, 'enabled');
  assert.equal(yakuInfo('同一色', '39翻', { ...rules, specialYaku: { sameColor: false } }, 'none').status, 'disabled');
  assert.equal(yakuInfo('同一色', '39翻', rules, 'none').category, 'special');
  assert.equal(yakuInfo('三同刻', '10翻', rules, 'none').category, 'special');
  for (const name of ['八対子', '十対子', '十一対子', '十四対子']) assert.equal(yakuInfo(name, '4翻', rules, 'none').category, 'special');
});

test('役一覧のダブル役満OFFは無効化ではなく13翻への変更を示す', () => {
  for (const [name, key] of [['国士無双十三面待ち', 'kokushi13'], ['四暗刻単騎', 'suankoTanki'], ['純正九蓮宝燈', 'junseiChuuren'], ['大四喜', 'daisuushii']]) {
    assert.equal(yakuInfo(name, '26翻', rules, 'none').han, '26翻');
    const info = yakuInfo(name, '26翻', { ...rules, doubleYakuman: { [key]: false } }, 'none');
    assert.equal(info.han, '13翻');
    assert.equal(info.status, 'enabled');
    assert.ok(info.reason.includes('OFF'));
  }
});

test('槓子系役の翻数と三槓子の翻数タブは実際の設定に従う', () => {
  assert.equal(yakuInfo('三槓子', '2翻', rules, 'none').han, '13翻');
  assert.equal(yakuInfo('三槓子', '2翻', rules, 'none').tab, '役満');
  assert.equal(yakuInfo('三槓子', '2翻', { ...rules, kanYakuEnhanced: false }, 'none').tab, '2翻');
  assert.equal(yakuInfo('四槓子', '26翻', { ...rules, kanYakuEnhanced: false }, 'none').han, '13翻');
});

test('トランプ限定役は設定OFFとイベント対象外を分ける', () => {
  assert.equal(yakuInfo('超一気通貫', '13翻', rules, 'none').status, 'unavailable');
  assert.equal(yakuInfo('超一気通貫', '13翻', rules, 'trump').status, 'enabled');
  assert.equal(yakuInfo('十三連宝燈', '169翻', { ...rules, specialYaku: { lantern: false } }, 'trump').status, 'disabled');
  for (const name of ['役牌', '大三元', '国士無双', '九蓮宝燈']) assert.equal(yakuInfo(name, '13翻', rules, 'trump').status, 'unavailable');
  assert.equal(yakuInfo('清老頭', '13翻', rules, 'trump').status, 'enabled');
});

test('神経衰弱の固定面子と進行で使わない役を対象外にする', () => {
  for (const name of ['平和', '七対子', '国士無双', '嶺上開花', '三槓子', '三連子', '十四対子']) assert.equal(yakuInfo(name, '1翻', rules, 'memory').status, 'unavailable');
  assert.equal(yakuInfo('立直', '1翻', rules, 'memory').status, 'unavailable');
  assert.equal(yakuInfo('オープンリーチ', '2翻', rules, 'memory').status, 'disabled');
  for (const name of ['門前清自摸和', '断么九', '対々和', '清一色', '大三元']) assert.equal(yakuInfo(name, '1翻', rules, 'memory').status, 'enabled');
});
