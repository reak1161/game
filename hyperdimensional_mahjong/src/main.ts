import './style.css';
import { specialStatus } from './special_status';
import { drawPreview } from './draw_preview';
import { finishVisuals, motionEnabled, motionPreferred, setMotion, tileFaceHtml, tileGuideHtml } from './visuals';
import { dancerCompressedAssignments } from './mahjong';
import { cardEventNote, cardStatus } from './card_status';
import { yakuExamples } from './yaku_examples';
import { mountYakuBrowser } from './yaku_browser';
import { releaseCompressedTile } from './mahjong';
import { randomChangeKind } from './mahjong';
import { dancerExpandedPairs } from './mahjong';
import { dancerLanternChoices } from './mahjong';
import { specialShapeGuideHtml } from './visuals';
import { memoryCanContinue, memorySpecials } from './mahjong';
import { availableKinds, bestRiverScore, bestScore, bestScoreWithExtra, cards, cardDescriptions, cardNames, changeTileKind, chooseMemoryTiles, compressPair, consumeDrawReservation, dancerHandReachesRole, dancerKanFallback, dancerLooseTiles, dancerPatterns, dancerRoleChoices, dancerRoleEnabled, dancerRoleReachable, dancerRoles, dealerSeat, dealCards, doraFromIndicator, doubleYakumanNames, existingWaitKinds, finaleTileCount, firstFourVisibleKind, hasCard, isDamascusTarget, isMemoryMeld, isTerminal, localYakuNames, makeWall, meldCandidates, nagashiEligible, openingDealerSeat, openingIntact, rankOf, reserveAfterDiscard, reserveDragonPairs, reserveDraws, shiftNumberTiles, shuffle, sortHand, specials, specialNames, specialYakuNames, spreadZombies, suitKind, suitOf, takeRiverTile, tileGlyph, tileName, transferRonPoints, trumpDancerPatterns, waitKinds, winningShapeSummary, type Card, type DoubleYakuman, type LocalYaku, type OpenMeld, type Player, type RoundEvent, type Score, type Settings, type Special, type SpecialYaku, type Tile } from './mahjong';

type Phase = 'setup' | 'turn' | 'claim' | 'call' | 'warning' | 'finale' | 'memory' | 'result';
const app = document.querySelector<HTMLDivElement>('#app')!;
const defaults: Settings = { rounds: 4, specialCount: 5, startingPoints: 100000, kazoeMultiple: true, cards: true, cardsPerPlayer: 1, finalCardsPerPlayer: 1, redDora: false, eventMode: 'off', kanYakuEnhanced: true, yakumanStack: false, openRiichi: false };
let settings = { ...defaults };
const configurableEvents = ['seitenjo', 'hachiku', 'finale', 'trump', 'tenchou', 'memory'] as const;
const configurableEventNames = { seitenjo: '青天井', hachiku: '破竹の勢い', finale: 'フィナーレ', trump: 'トランプマジック', tenchou: '転調', memory: '神経衰弱' };
type ElementCategory = 'cards' | 'specials' | 'events' | 'specialYaku' | 'local' | 'other';
const defaultElements: Record<ElementCategory, string[]> = {
  cards, specials, events: [...configurableEvents], specialYaku: Object.keys(specialYakuNames), local: [],
  other: ['kazoeMultiple', 'kanYakuEnhanced', ...Object.keys(doubleYakumanNames).map(id => `double:${id}`)],
};
const selectedElements: Record<ElementCategory, Set<string>> = Object.fromEntries(Object.entries(defaultElements).map(([id, values]) => [id, new Set(values)])) as Record<ElementCategory, Set<string>>;
const setupStorageKey = 'mahjong-setup-v1';
function restoreSetup(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(setupStorageKey) ?? 'null');
    if (!saved || typeof saved !== 'object') return;
    const choices = { playerCount: [3, 4], rounds: [4, 8], specialCount: [4, 5, 8, 12], startingPoints: [50000, 100000], cardsPerPlayer: [1, 2, 3], finalCardsPerPlayer: [1, 2, 3], eventMode: ['off', 'random', 'every'] };
    for (const [id, values] of Object.entries(choices)) {
      if ((values as unknown[]).includes(saved.settings?.[id])) Object.assign(settings, { [id]: saved.settings[id] });
    }
    if (typeof saved.settings?.cards === 'boolean') settings.cards = saved.settings.cards;
    const allowed: Record<ElementCategory, string[]> = { ...defaultElements, local: Object.keys(localYakuNames), other: [...defaultElements.other, 'redDora', 'openRiichi', 'yakumanStack'] };
    for (const id of Object.keys(allowed) as ElementCategory[]) {
      if (!Array.isArray(saved.elements?.[id])) continue;
      selectedElements[id] = new Set(saved.elements[id].filter((value: unknown) => typeof value === 'string' && allowed[id].includes(value)));
    }
  } catch { /* 保存できない環境でも対局を開始できる。 */ }
}
restoreSetup();
function syncSetupControls(): void {
  document.querySelectorAll<HTMLInputElement>('[data-local]').forEach(input => { input.checked = selectedElements.local.has(input.dataset.local!); });
  document.querySelectorAll<HTMLInputElement>('[data-double]').forEach(input => { input.checked = selectedElements.other.has(`double:${input.dataset.double}`); });
  for (const id of ['redDora', 'openRiichi'] as const) { const input = document.querySelector<HTMLInputElement>(`#${id}`); if (input) input.checked = selectedElements.other.has(id); }
  for (const id of ['kazoeMultiple', 'kanYakuEnhanced', 'yakumanStack'] as const) { const select = document.querySelector<HTMLSelectElement>(`#${id}`); if (select) select.value = String(selectedElements.other.has(id)); }
}
function openElementSettings(): void {
  document.querySelectorAll<HTMLInputElement>('[data-local]').forEach(input => { input.checked ? selectedElements.local.add(input.dataset.local!) : selectedElements.local.delete(input.dataset.local!); });
  document.querySelectorAll<HTMLInputElement>('[data-double]').forEach(input => { input.checked ? selectedElements.other.add(`double:${input.dataset.double}`) : selectedElements.other.delete(`double:${input.dataset.double}`); });
  for (const id of ['redDora', 'openRiichi'] as const) { const input = document.querySelector<HTMLInputElement>(`#${id}`); if (input?.checked) selectedElements.other.add(id); else selectedElements.other.delete(id); }
  for (const id of ['kazoeMultiple', 'kanYakuEnhanced', 'yakumanStack'] as const) { const select = document.querySelector<HTMLSelectElement>(`#${id}`); if (select?.value === 'true') selectedElements.other.add(id); else selectedElements.other.delete(id); }
  const description = (name: string): string => Object.values(yakuExamples).flat().find(example => example.name === name)?.note ?? `${name}を対局で使用します。`;
  const categories = [
    { id: 'cards', name: '能力カード', entries: cards.map(id => ({ id, name: cardNames[id], detail: cardDescriptions[id] })) },
    { id: 'specials', name: '特殊牌', entries: specials.map(id => ({ id, name: specialNames[id], detail: specialHelp[id] })) },
    { id: 'events', name: '局イベント', entries: configurableEvents.map(id => ({ id, name: configurableEventNames[id], detail: `${configurableEventNames[id]}が局イベントの抽選対象になります。` })) },
    { id: 'specialYaku', name: '特殊役', entries: Object.entries(specialYakuNames).map(([id, name]) => ({ id, name, detail: description(name) })) },
    { id: 'local', name: 'ローカル役', entries: Object.entries(localYakuNames).map(([id, name]) => ({ id, name, detail: description(name) })) },
    { id: 'other', name: 'その他のルール', entries: [
      { id: 'redDora', name: '赤ドラ', detail: '5萬・5筒・5索を各1枚ずつ赤ドラにします。' },
      { id: 'openRiichi', name: 'オープンリーチ', detail: '手牌を公開して立直できます。' },
      { id: 'kazoeMultiple', name: '数え役満の倍増', detail: '13翻ごとに数え役満を倍増します。' },
      { id: 'kanYakuEnhanced', name: '槓子系役の超次元ルール', detail: '槓子系役を超次元ルールの翻数で計算します。' },
      { id: 'yakumanStack', name: '役満時のすべて加算', detail: '役満成立時にも通常役とドラを加算します。' },
      ...Object.entries(doubleYakumanNames).map(([id, name]) => ({ id: `double:${id}`, name: `${name}のダブル役満`, detail: description(name) })),
    ] },
  ] as const;
  let category: ElementCategory = 'cards';
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = '<section class="dialog element-dialog" role="dialog" aria-modal="true" aria-label="使用する要素"><button class="close" type="button" data-close>閉じる</button><h2>使用する要素</h2><div class="element-tabs"></div><div class="element-tools"><input type="search" aria-label="項目を検索" placeholder="名前で検索"><button type="button" data-bulk="all">全選択</button><button type="button" data-bulk="none">全解除</button><button type="button" data-bulk="default">デフォルト</button></div><div class="element-list"></div><p class="element-detail" aria-live="polite">項目を選ぶと説明が表示されます。</p></section>';
  document.body.append(overlay);
  const search = overlay.querySelector<HTMLInputElement>('input[type=search]')!;
  function renderItems(): void {
    overlay.querySelector('.element-tabs')!.innerHTML = categories.map(group => `<button type="button" data-category="${group.id}" aria-pressed="${category === group.id}">${group.name}</button>`).join('');
    const group = categories.find(item => item.id === category)!;
    const query = search.value.trim();
    overlay.querySelector('.element-list')!.innerHTML = group.entries.filter(item => item.name.includes(query)).map(item => `<label><input type="checkbox" data-element="${item.id}" ${selectedElements[category].has(item.id) ? 'checked' : ''}><span>${escape(item.name)}</span><button type="button" data-detail="${item.id}" aria-label="${escape(item.name)}の説明">詳細</button></label>`).join('') || '<p>一致する項目はありません。</p>';
  }
  overlay.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close]') || target === overlay) { overlay.remove(); return; }
    const tab = target.closest<HTMLElement>('[data-category]');
    if (tab) { category = tab.dataset.category as typeof category; search.value = ''; renderItems(); return; }
    const bulk = target.closest<HTMLElement>('[data-bulk]');
    if (bulk) {
      const group = categories.find(item => item.id === category)!;
      const selection = selectedElements[category];
      if (bulk.dataset.bulk !== 'all') selection.clear();
      if (bulk.dataset.bulk === 'all') group.entries.forEach(item => selection.add(item.id));
      if (bulk.dataset.bulk === 'default') defaultElements[category].forEach(id => selection.add(id));
      syncSetupControls();
      renderItems(); return;
    }
    const detail = target.closest<HTMLElement>('[data-detail]');
    if (detail) { const item = categories.find(group => group.id === category)!.entries.find(item => item.id === detail.dataset.detail); overlay.querySelector('.element-detail')!.textContent = item?.detail ?? ''; }
  });
  overlay.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.element) return;
    const selection = selectedElements[category];
    if (input.checked) selection.add(input.dataset.element); else selection.delete(input.dataset.element);
    syncSetupControls();
  });
  search.addEventListener('input', renderItems);
  renderItems();
}
function playerCount(): 3 | 4 { return settings.playerCount ?? 4; }
let players: Player[] = [];
let wall: Tile[] = [];
let indicator: Tile;
let uraIndicator: Tile;
let kanIndicators: Tile[] = [];
let uraKanIndicators: Tile[] = [];
let rinshanDrawn = false;
let houteiEligible = false;
let mayTsumo = false;
let current = 0;
let round = 0;
let phase: Phase = 'setup';
let pending: { tile: Tile; from: number; winners: { seat: number; score: Score }[]; chankan?: boolean } | null = null;
let pendingAddedKan: { seat: number; tile: Tile; meldIndex: number } | null = null;
let pendingCall: { tile: Tile; from: number; options: { type: OpenMeld['type']; handIds: number[]; label: string }[] } | null = null;
let callStage: OpenMeld['type'] | null = null;
let dangerDiscardId: number | null = null;
let trapRonWarned = false;
type ResultHand = { label: string; shape: string; tiles: Tile[] };
let result: { title: string; details: string[]; hands?: ResultHand[] } | null = null;
let resultStage = 0;
let resultAnimating = false;
let resultTimer = 0;
let roundStartingPoints: bigint[] = [];
let selected = new Set<number>();
let action: 'change' | 'pickup' | 'borrow' | 'kan' | 'akuukan' | 'roadroller' | 'randomizer' | 'pairFestival' | null = null;
let activeCard: Card | null = null;
let log: string[] = [];
let helpOpen = false;
let yakuOpen = false;
let skeletonOpen = false;
let settingsOpen = false;
let logOpen = false;
let cardsOpen = false;
let lastSpecialTapId: number | null = null;
const autoOptions = { noCalls: false, noKan: false, tsumogiri: false, sort: true, win: false, north: false };
function arrangeHand(seat: number): void { if (seat !== 0 || autoOptions.sort) sortHand(players[seat].hand); }
let timer = 0;
let extraDiscards = 0;
let owedDraw = [0, 0, 0, 0];
let riichiPending = false;
let openRiichiPending = false;
let riichiPot = 0n;
let riichiSerial = 0;
let drawnTileId = 0;
let lastDiscardId: number | null = null;
let roundEvent: RoundEvent = 'none';
let memoryBoard: (Tile | null)[] = [];
let memoryRevealed: number[] = [];
let memoryKnown = new Map<number, number>();
let memoryLocked = false;
let tenchouTurns = 0;
let tenchouShifts = 0;
let irregularKind: number | null = null;
let visibleSerial = 0;
function markVisible(tile: Tile): void { if (tile.visibleOrder === undefined) tile.visibleOrder = ++visibleSerial; }
let finaleDetails: string[] = [];
let finaleHands: ResultHand[] = [];
const dancerReachability = new Map<string, boolean>();
function danceHand(player: Player, roundNumber = round): boolean {
  const kans = player.kans ?? [];
  const kanKinds = kans.map(kan => kan[0].kind);
  if (player.hand.length !== 13 - kanKinds.length * 3 || player.openMelds?.length) return false;
  const seat = players.indexOf(player);
  const parent = dealerSeat(roundNumber, playerCount());
  const seatWind = 27 + (seat - parent + playerCount()) % playerCount();
  const roundWind = 27 + Math.floor((roundNumber - 1) / playerCount()) % 4;
  const sources = dancerPatterns.map((pattern, index) => ({ pattern, role: dancerRoles[index] })).filter(source => dancerRoleEnabled(source.role, settings.localYaku, settings.doubleYakuman, roundEvent) && !Object.entries(specialYakuNames).some(([id, name]) => source.role === name && settings.specialYaku?.[id as SpecialYaku] === false) && (roundEvent !== 'trump' || source.pattern.every(kind => kind < 27)));
  if (roundEvent === 'trump' && settings.specialYaku?.superStraight !== false) sources.push(...trumpDancerPatterns.map(pattern => ({ pattern, role: '超一気通貫' })));
  if (kanKinds.length) {
    const kanPattern = dancerKanFallback(kanKinds, roundEvent);
    sources.push({ pattern: kanPattern, role: '門前清自摸和' });
    if (kanKinds.length >= 3) sources.push({ pattern: kanPattern, role: '三槓子' });
    if (kanKinds.length >= 4) sources.push({ pattern: kanPattern, role: '四槓子' });
  }
  const canReachRole = (pattern: number[], role: string): boolean => {
    if (!dancerLooseTiles(pattern, kanKinds)) return false;
    const key = JSON.stringify([roundEvent, playerCount(), seatWind, roundWind, kanKinds, settings.specialYaku, settings.localYaku, settings.doubleYakuman, settings.kanYakuEnhanced, role, [...pattern].sort((a, b) => a - b)]);
    let reachable = dancerReachability.get(key);
    if (reachable === undefined) {
      reachable = dancerRoleReachable(pattern, role, roundEvent, playerCount(), settings, seatWind, roundWind, kans);
      dancerReachability.set(key, reachable);
    }
    return reachable;
  };
  const before = [...player.hand.map(tile => tile.kind), ...kanKinds.flatMap(kind => [kind, kind, kind])];
  const choices = dancerRoleChoices(sources.map(source => source.pattern), sources.map(source => source.role), before, roundEvent, playerCount(), canReachRole);
  const expandedPairs = !kanKinds.length ? dancerExpandedPairs(player.hand, roundEvent, playerCount()) : null;
  if (expandedPairs) {
    expandedPairs.variants = expandedPairs.variants.filter(candidate => dancerHandReachesRole(player.hand.map((tile, index) => {
      const next = { ...tile, compressedMate: tile.compressedMate ? { ...tile.compressedMate } : undefined };
      changeTileKind(next, candidate[index], roundEvent);
      return next;
    }), expandedPairs.role, roundEvent, playerCount(), settings, seatWind, roundWind));
    if (expandedPairs.variants.length) choices.push(expandedPairs);
  }
  const lantern = !kanKinds.length ? dancerLanternChoices(player.hand, roundEvent, settings.specialYaku?.lantern !== false) : null;
  if (lantern?.variants.length) choices.push(lantern);
  if (!choices.length) return false;
  let pattern: number[] | null = null;
  if (player.hand.some(tile => tile.compressedMate || tile.special)) {
    const compressedIndices = player.hand.flatMap((tile, index) => tile.compressedMate ? [index] : []);
    for (const choice of shuffle([...choices])) {
      const seen = new Set<string>();
      for (const variant of shuffle([...choice.variants])) {
        const loose = dancerLooseTiles(variant, kanKinds)!;
        const candidates = choice === expandedPairs || choice === lantern ? [[...loose]] : dancerCompressedAssignments(loose, compressedIndices);
        while (candidates.length < 3) candidates.push(shuffle([...loose]));
        for (const candidate of candidates) {
          const key = candidate.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          const changed = player.hand.map((tile, index) => {
            const next = { ...tile, compressedMate: tile.compressedMate ? { ...tile.compressedMate } : undefined };
            changeTileKind(next, candidate[index], roundEvent);
            return next;
          });
          if (dancerHandReachesRole(changed, choice.role, roundEvent, playerCount(), settings, seatWind, roundWind, kans)) { pattern = candidate; break; }
        }
        if (pattern) break;
      }
      if (pattern) break;
    }
    if (!pattern) return false;
  } else {
    const variants = choices[Math.floor(Math.random() * choices.length)].variants;
    pattern = dancerLooseTiles(variants[Math.floor(Math.random() * variants.length)], kanKinds)!;
    shuffle(pattern);
  }
  player.hand.forEach((tile, index) => changeTileKind(tile, pattern[index], roundEvent));
  if (player !== players[0] || autoOptions.sort) sortHand(player.hand);
  return true;
}
let names = ['あなた', '北家 CPU', '対面 CPU', '下家 CPU'];
function cardUsed(player: Player, card: Card): boolean { return player.usedCards ? player.usedCards.includes(card) : player.used; }
function markCardUsed(player: Player, card: Card): void { player.usedCards ??= []; if (!player.usedCards.includes(card)) player.usedCards.push(card); player.used = true; }
function say(message: string) { log.unshift(message); log = log.slice(0, 8); }
function escape(s: string): string { return s.replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]!); }
function tileHtml(t: Tile, options: { clickable?: boolean; selected?: boolean; hidden?: boolean; concealTrap?: boolean; label?: string; visualKey?: string } = {}): string {
  if (options.hidden) return '<span class="tile back" aria-label="伏せ牌">◆</span>';
  const special = options.concealTrap && t.special === 'trap' ? undefined : t.special;
  const suitIndex = suitOf(t.kind);
  const suit = suitIndex === null ? 'honor' : ['man', 'pin', 'sou'][suitIndex];
  const title = `${tileName(t.kind)}${t.compressedMate ? '・圧縮牌（対子2枚分）' : ''}${t.red ? '・赤ドラ' : ''}${special ? `・${specialNames[special]}` : ''}`;
  return `<button class="tile ${suit} ${special ? 'special' : ''} ${t.red ? 'red' : ''} ${t.compressedMate ? 'compressed' : ''} ${options.selected ? 'selected' : ''}" ${options.clickable ? `data-tile="${t.id}"` : special ? 'data-special-inspect' : 'disabled'} ${special ? `data-special-id="${t.id}"` : ''} data-visual-key="${options.visualKey ?? `tile:${t.id}`}" data-face="${t.kind}:${!!t.red}:${special ?? ''}:${!!t.compressedMate}" aria-label="${escape(title)}">${tileFaceHtml(t.kind, t.red)}${special ? '<b class="spark">✦</b>' : ''}${t.compressedMate ? '<b class="pair-mark">対</b>' : ''}${t.red ? '<b class="red-mark">赤</b>' : ''}</button>`;
}
function setup(): void {
  app.innerHTML = `<main class="shell"><header class="hero"><div class="eyebrow">HYPERDIMENSIONAL MAHJONG</div><h1>超次元麻雀</h1><p>いつもの一打が、次元を変える。</p></header><section class="setup card"><h2>対局設定</h2><div class="fields"><label>局数<select id="rounds"><option value="4">4局</option><option value="8">8局</option></select></label><label>特殊牌の枚数<select id="specialCount"><option value="4">4枚</option><option value="8" selected>8枚</option><option value="12">12枚</option></select></label><label>初期持ち点<select id="startingPoints"><option value="50000">50,000点</option><option value="100000" selected>100,000点</option></select></label><label>数え役満<select id="kazoeMultiple"><option value="true">13翻ごとに倍増</option><option value="false">1倍で打ち止め</option></select></label></div><label class="check"><input id="cards" type="checkbox" checked>能力カードを配る</label><button class="primary" id="start">対局を始める <span>→</span></button></section><footer>ローカル対局・CPU 3人</footer></main>`;
  document.querySelector('.hero')?.insertAdjacentHTML('beforeend', `<div class="hero-tiles" aria-hidden="true">${[0, 13, 18, 33].map((kind, id) => tileHtml({ id: -10 - id, kind })).join('')}</div>`);
  document.querySelector('.setup')?.insertAdjacentHTML('beforeend', `<label class="check motion-setting"><input type="checkbox" data-motion ${motionPreferred() ? 'checked' : ''}>演出を有効にする</label>`);
  document.querySelector('[data-motion]')?.addEventListener('change', event => setMotion((event.target as HTMLInputElement).checked));
  finishVisuals('setup');
  document.querySelector('.fields')?.insertAdjacentHTML('afterbegin', '<label>対局人数<select id="playerCount"><option value="4" selected>四人打ち</option><option value="3">三人打ち</option></select></label>');
  document.querySelector('#playerCount')?.addEventListener('change', event => {
    const three = (event.target as HTMLSelectElement).value === '3';
    const footer = document.querySelector('footer');
    if (footer) footer.textContent = `ローカル対局・CPU ${three ? 2 : 3}人`;
  });
  (document.querySelector('#specialCount') as HTMLSelectElement).innerHTML = '<option value="4">4枚</option><option value="5" selected>5枚</option><option value="8">8枚</option><option value="12">12枚</option>';
  document.querySelector('.fields')?.insertAdjacentHTML('beforeend', '<label>局イベント<select id="eventMode"><option value="off">使用しない</option><option value="random">ときどき発生</option><option value="every">毎局発生</option></select></label>');
  document.querySelector('.fields')?.insertAdjacentHTML('beforeend', '<label>通常局の能力カード<select id="cardsPerPlayer"><option value="1" selected>1枚</option><option value="2">2枚</option><option value="3">3枚</option></select></label><label>オーラスの能力カード<select id="finalCardsPerPlayer"><option value="1" selected>1枚</option><option value="2">2枚</option><option value="3">3枚</option></select></label><label>役満時の加算<select id="yakumanStack"><option value="false" selected>役満のみ</option><option value="true">すべて加算</option></select></label>');
  document.querySelector('.fields')?.insertAdjacentHTML('beforeend', '<label>槓子系役<select id="kanYakuEnhanced"><option value="true">超次元ルール</option><option value="false">通常ルール</option></select></label>');
  document.querySelector('.check')?.insertAdjacentHTML('beforebegin', `<fieldset class="local-yaku"><legend>ローカル役</legend>${Object.entries(localYakuNames).map(([id, name]) => `<label><input type="checkbox" data-local="${id}">${name}</label>`).join('')}</fieldset>`);
  document.querySelector('.check')?.insertAdjacentHTML('beforebegin', `<fieldset class="local-yaku"><legend>ダブル役満</legend>${Object.entries(doubleYakumanNames).map(([id, name]) => `<label><input type="checkbox" data-double="${id}" checked>${name}</label>`).join('')}</fieldset>`);
  document.querySelector('.check')?.insertAdjacentHTML('beforebegin', '<label class="check"><input id="redDora" type="checkbox">赤ドラを使用する</label>');
  document.querySelector('.check')?.insertAdjacentHTML('beforebegin', '<label class="check"><input id="openRiichi" type="checkbox">オープンリーチを使用する</label>');
  document.querySelector('.check')?.insertAdjacentHTML('beforebegin', '<button type="button" class="element-open" id="elementSettings">使用する要素とルールを選ぶ</button>');
  document.querySelector('#elementSettings')!.addEventListener('click', openElementSettings);
  document.querySelector('#elementSettings')!.insertAdjacentHTML('afterend', '<button type="button" class="element-open" id="resetSetup">対局設定を初期値に戻す</button><p>対局開始時の設定を、このブラウザーに保存します。</p>');
  document.querySelector('#resetSetup')!.addEventListener('click', () => {
    settings = { ...defaults };
    for (const id of Object.keys(defaultElements) as ElementCategory[]) selectedElements[id] = new Set(defaultElements[id]);
    try { localStorage.removeItem(setupStorageKey); } catch { /* 保存先が利用できなくても画面は初期化する。 */ }
    setup();
  });
  document.querySelector('#start')!.addEventListener('click', () => {
    document.querySelectorAll<HTMLInputElement>('[data-local]').forEach(input => { input.checked ? selectedElements.local.add(input.dataset.local!) : selectedElements.local.delete(input.dataset.local!); });
    document.querySelectorAll<HTMLInputElement>('[data-double]').forEach(input => { input.checked ? selectedElements.other.add(`double:${input.dataset.double}`) : selectedElements.other.delete(`double:${input.dataset.double}`); });
    for (const id of ['redDora', 'openRiichi'] as const) {
      (document.querySelector<HTMLInputElement>(`#${id}`)!.checked ? selectedElements.other.add(id) : selectedElements.other.delete(id));
    }
    for (const id of ['kazoeMultiple', 'kanYakuEnhanced', 'yakumanStack'] as const) {
      document.querySelector<HTMLSelectElement>(`#${id}`)!.value === 'true' ? selectedElements.other.add(id) : selectedElements.other.delete(id);
    }
    settings = {
      playerCount: Number((document.querySelector('#playerCount') as HTMLSelectElement).value) as 3 | 4,
      rounds: Number((document.querySelector('#rounds') as HTMLSelectElement).value),
      specialCount: Number((document.querySelector('#specialCount') as HTMLSelectElement).value),
      startingPoints: Number((document.querySelector('#startingPoints') as HTMLSelectElement).value),
      kazoeMultiple: (document.querySelector('#kazoeMultiple') as HTMLSelectElement).value === 'true',
      cards: (document.querySelector('#cards') as HTMLInputElement).checked && selectedElements.cards.size > 0,
      cardsPerPlayer: Number((document.querySelector('#cardsPerPlayer') as HTMLSelectElement).value),
      finalCardsPerPlayer: Number((document.querySelector('#finalCardsPerPlayer') as HTMLSelectElement).value),
      yakumanStack: (document.querySelector('#yakumanStack') as HTMLSelectElement).value === 'true',
      openRiichi: (document.querySelector('#openRiichi') as HTMLInputElement).checked,
      redDora: (document.querySelector('#redDora') as HTMLInputElement).checked,
      eventMode: (document.querySelector('#eventMode') as HTMLSelectElement).value as Settings['eventMode'],
      enabledCards: [...selectedElements.cards] as Card[],
      enabledSpecials: [...selectedElements.specials] as Special[],
      enabledEvents: [...selectedElements.events] as Exclude<RoundEvent, 'none'>[],
      specialYaku: Object.fromEntries(Object.keys(specialYakuNames).map(id => [id, selectedElements.specialYaku.has(id)])) as Partial<Record<SpecialYaku, boolean>>,
      kanYakuEnhanced: (document.querySelector('#kanYakuEnhanced') as HTMLSelectElement).value === 'true',
      localYaku: Object.fromEntries(Array.from(document.querySelectorAll<HTMLInputElement>('[data-local]')).map(input => [input.dataset.local, input.checked])) as Partial<Record<LocalYaku, boolean>>,
      doubleYakuman: Object.fromEntries(Array.from(document.querySelectorAll<HTMLInputElement>('[data-double]')).map(input => [input.dataset.double, input.checked])) as Partial<Record<DoubleYakuman, boolean>>,
    };
    try {
      localStorage.setItem(setupStorageKey, JSON.stringify({ settings, elements: Object.fromEntries(Object.entries(selectedElements).map(([id, values]) => [id, [...values]])) }));
    } catch { /* 保存先が利用できなくても対局を続ける。 */ }
    names = playerCount() === 3 ? ['あなた', '左 CPU', '対面 CPU'] : ['あなた', '北家 CPU', '対面 CPU', '下家 CPU'];
    players = Array.from({ length: playerCount() }, () => ({ hand: [], river: [], kans: [], openMelds: [], points: BigInt(settings.startingPoints), card: 'seitenjo' as Card, used: false, discards: 0, riichi: false, ippatsu: false }));
    round = 0;
    riichiPot = 0n;
    riichiSerial = 0;
    startRound();
  });
  syncSetupControls();
  for (const id of ['playerCount', 'rounds', 'specialCount', 'startingPoints', 'cardsPerPlayer', 'finalCardsPerPlayer', 'eventMode'] as const) {
    const control = document.querySelector<HTMLSelectElement>(`#${id}`)!;
    control.value = String(settings[id] ?? (id === 'playerCount' ? 4 : defaults[id]));
  }
  document.querySelector<HTMLInputElement>('#cards')!.checked = settings.cards;
  document.querySelector('#playerCount')!.dispatchEvent(new Event('change'));
}
function startRound(): void {
  roundStartingPoints = players.map(player => player.points);
  lastDiscardId = null;
  window.clearTimeout(timer);
  window.clearTimeout(resultTimer);
  resultAnimating = false;
  helpOpen = false;
  yakuOpen = false;
  cardsOpen = false;
  settingsOpen = false;
  if (round >= settings.rounds) { finishGame(); return; }
  visibleSerial = 0;
  tenchouTurns = 0;
  tenchouShifts = 0;
  const eventPool = settings.enabledEvents ?? configurableEvents;
  roundEvent = eventPool.length && (settings.eventMode === 'every' || (settings.eventMode === 'random' && Math.random() < 0.35))
    ? eventPool[Math.floor(Math.random() * eventPool.length)] : 'none';
  for (const player of players) { player.memoryMelds = undefined; player.memoryPair = undefined; }
  const enabledSpecials = roundEvent === 'memory'
    ? (settings.enabledSpecials ?? specials).filter(special => memorySpecials.includes(special))
    : settings.enabledSpecials;
  wall = makeWall(settings.specialCount, roundEvent, settings.redDora, playerCount(), enabledSpecials);
  kanIndicators = [];
  uraKanIndicators = [];
  irregularKind = null;
  finaleDetails = [];
  finaleHands = [];
  if (roundEvent === 'memory') {
    const allowed: Card[] = ['seitenjo', 'menzen', 'near', 'yakumanBody', 'oni', 'tanyao32000', 'gekokujou'];
    const count = round === settings.rounds - 1 ? settings.finalCardsPerPlayer ?? 1 : settings.cardsPerPlayer ?? 1;
    const pool = (settings.enabledCards ?? cards).filter(card => allowed.includes(card));
    const dealt = settings.cards ? dealCards(count, playerCount(), pool) : Array.from({ length: playerCount() }, () => [] as Card[]);
    memoryBoard = wall.map(tile => tile);
    memoryRevealed = []; memoryKnown = new Map(); memoryLocked = false; wall = [];
    indicator = { id: -2, kind: 0 }; uraIndicator = { id: -3, kind: 0 };
    for (let p = 0; p < playerCount(); p++) Object.assign(players[p], { hand: [], river: [], riverCalled: false, kans: [], openMelds: [], northTiles: [], memoryMelds: [], memoryPair: [], card: dealt[p][0] || 'seitenjo', cards: dealt[p], usedCards: [], used: !dealt[p].length, discards: 0, riichi: false, doubleRiichi: false, openRiichi: false, riichiOrder: 0, ippatsu: false, temporaryFuriten: false, riichiFuriten: false, riichiDraws: 0, dangerUses: 0, drawReservations: [], nearPinActive: false, pocketArmed: false, skeletonRevealed: 0, ultimatePenaltyDone: false });
    current = openingDealerSeat(playerCount()); round++; phase = 'memory'; result = null; log = []; selected.clear(); drawnTileId = 0;
    say(`第${round}局 神経衰弱。3枚で面子を集め、4面子の後に2枚で雀頭を作ります。`);
    render();
    if (current !== 0) timer = window.setTimeout(memoryBotTurn, 500);
    return;
  }
  const count = round === settings.rounds - 1 ? settings.finalCardsPerPlayer ?? 1 : settings.cardsPerPlayer ?? 1;
  const availableCards = roundEvent === 'trump' ? (settings.enabledCards ?? cards).filter(card => card !== 'dragonPairs') : settings.enabledCards;
  const dealt = settings.cards ? dealCards(count, playerCount(), availableCards) : Array.from({ length: playerCount() }, () => [] as Card[]);
  const reservedPairs = dealt.map(hand => hand.includes('dragonPairs') ? reserveDragonPairs(wall) : []);
  indicator = wall.pop()!;
  uraIndicator = wall.pop()!;
  for (let p = 0; p < playerCount(); p++) {
    Object.assign(players[p], { hand: [], river: [], riverCalled: false, kans: [], openMelds: [], northTiles: [], card: dealt[p][0] || 'seitenjo', cards: dealt[p], usedCards: [], used: !settings.cards, discards: 0, riichi: false, doubleRiichi: false, openRiichi: false, riichiOrder: 0, ippatsu: false, temporaryFuriten: false, riichiFuriten: false, riichiDraws: 0, dangerUses: 0, drawReservations: [], nearPinActive: false, pocketArmed: false, skeletonRevealed: 0, ultimatePenaltyDone: false });
    players[p].hand.push(...reservedPairs[p]);
    for (let j = players[p].hand.length; j < (settings.cards && hasCard(players[p], 'multipai') ? 14 : 13); j++) players[p].hand.push(wall.pop()!);
    arrangeHand(p);
    if (settings.cards && hasCard(players[p], 'dancer')) danceHand(players[p], round + 1);
  }
  current = round % playerCount();
  round++;
  phase = 'turn'; pending = null; pendingAddedKan = null; pendingCall = null; callStage = null; dangerDiscardId = null; trapRonWarned = false; result = null; action = null; activeCard = null; extraDiscards = 0; owedDraw = Array(playerCount()).fill(0); riichiPending = false; openRiichiPending = false; skeletonOpen = false; settingsOpen = false; logOpen = false; cardsOpen = false; selected.clear(); log = []; houteiEligible = false;
  say(`第${round}局 開始。ドラは${tileName(doraFromIndicator(indicator.kind, roundEvent, playerCount(), tenchouShifts > 0))}。`);
  if (roundEvent !== 'none') say(`局イベント：${eventName(roundEvent)}。`);
  drawCurrent();
}
function eventName(event: RoundEvent): string { return event === 'none' ? 'なし' : configurableEventNames[event]; }
function applyDrawEffects(seat: number, tile: Tile, label = ''): void {
  if (consumeDrawReservation(players[seat], tile, roundEvent)) say(`${names[seat]}の${label}ツモ予約：${tileName(tile.kind)}。`);
  if (players[seat].riichi) players[seat].riichiDraws = (players[seat].riichiDraws ?? 0) + 1;
  for (const player of players) if ((player.skeletonRevealed ?? 0) > 0) player.skeletonRevealed!--;
  if (!players[0].skeletonRevealed) skeletonOpen = false;
}
function extractNorth(seat: number, tileId: number): boolean {
  if (playerCount() !== 3 || phase !== 'turn' || current !== seat || !wall.length) return false;
  const player = players[seat];
  const index = player.hand.findIndex(tile => tile.id === tileId && tile.kind === 30 && !tile.compressedMate);
  if (index < 0) return false;
  const [north] = player.hand.splice(index, 1);
  markVisible(north);
  player.northTiles ??= [];
  player.northTiles.push(north);
  const replacement = wall.pop()!;
  applyDrawEffects(seat, replacement, '北抜き');
  player.hand.push(replacement);
  drawnTileId = replacement.id;
  mayTsumo = true;
  rinshanDrawn = false;
  houteiEligible = wall.length === 0;
  arrangeHand(seat);
  say(`${names[seat]}が北を抜き、補充牌をツモ。`);
  resolveIrregular();
  return true;
}
function autoExtractNorth(seat: number): void {
  if (seat === 0 && !autoOptions.north) return;
  while (wall.length) {
    const north = players[seat].hand.find(tile => tile.kind === 30 && !tile.compressedMate);
    if (!north || !extractNorth(seat, north.id)) break;
  }
}
function drawCurrent(): void {
  if (roundEvent === 'finale' && wall.length <= finaleTileCount(playerCount())) { startFinale(); return; }
  if (!wall.length) { exhaustiveDraw(); return; }
  if (roundEvent === 'tenchou' && current === openingDealerSeat(playerCount())) {
    tenchouTurns++;
    if (Math.random() < (tenchouTurns <= 10 ? 0.1 : 0.5)) {
      shiftNumberTiles([wall, [indicator, uraIndicator, ...kanIndicators, ...uraKanIndicators], ...players.flatMap(player => [player.hand, player.river, ...(player.kans ?? []), ...(player.openMelds ?? []).map(meld => meld.tiles), player.northTiles ?? []])]);
      tenchouShifts++;
      if (irregularKind !== null && rankOf(irregularKind) !== null) {
        const suit = suitOf(irregularKind)!;
        irregularKind = suitKind(suit, rankOf(irregularKind)! % 9 + 1);
      }
      players.forEach((_, seat) => arrangeHand(seat));
      say('転調：場の数牌がすべて次の数字に変化しました。');
    }
  }
  if (settings.cards && hasCard(players[current], 'dancer') && danceHand(players[current])) {
    say(`${names[current]}の踊り子がツモ前の手牌を変化。`);
  }
  const nailReady = settings.cards && hasCard(players[current], 'nail') && waitKinds(effectiveHand(current), roundEvent, hasCard(players[current], 'multipai'), playerCount(), settings.specialYaku).length > 0 && wall.length === 1;
  const drawsBefore = players[current].riichiDraws ?? 0;
  const t = wall.pop()!;
  applyDrawEffects(current, t);
  drawnTileId = t.id;
  rinshanDrawn = false;
  mayTsumo = true;
  players[current].temporaryFuriten = false;
  players[current].hand.push(t);
  while (owedDraw[current] > 0 && wall.length) {
    const replacement = wall.pop()!;
    applyDrawEffects(current, replacement, '追加');
    players[current].hand.push(replacement);
    drawnTileId = replacement.id;
    owedDraw[current]--;
  }
  autoExtractNorth(current);
  houteiEligible = wall.length === 0;
  arrangeHand(current);
  say(`${names[current]}がツモ。`);
  if (settings.cards && hasCard(players[current], 'countdown') && drawsBefore < 6 && (players[current].riichiDraws ?? 0) >= 6) {
    let best: { kind: number; score: Score } | null = null;
    for (const kind of availableKinds(roundEvent, playerCount())) {
      const candidate = players[current].hand.map(tile => tile.id === drawnTileId ? { ...tile, kind } : tile);
      const score = winScore(current, candidate, true);
      if (score.valid && (!best || score.total > best.score.total)) best = { kind, score };
    }
    if (best) { settle(current, null, best.score, true, `カウントダウン → ${tileName(best.kind)}`); return; }
  }
  if (nailReady) {
    let best: { kind: number; score: Score } | null = null;
    for (const kind of availableKinds(roundEvent, playerCount())) {
      const candidate = players[current].hand.map(x => x.id === drawnTileId ? { ...x, kind } : x);
      const score = winScore(current, candidate, true);
      if (score.valid && (!best || score.total > best.score.total)) best = { kind, score };
    }
    if (best) { settle(current, null, best.score, true, `海底の釘 → ${tileName(best.kind)}`); return; }
  }
  if (current === 0 && autoOptions.win) {
    const score = winScore(0, players[0].hand, true);
    if (score.valid) { settle(0, null, score, true); return; }
  }
  render();
  if (current !== 0) timer = window.setTimeout(botTurn, 450);
  else if (autoOptions.tsumogiri) timer = window.setTimeout(() => discard(0, drawnTileId), 200);
}
function startFinale(): void {
  phase = 'finale';
  say('フィナーレ開始。残りの牌を順番に公開します。');
  const reveal = (): void => {
    if (!wall.length) { exhaustiveDraw(); return; }
    const drawingSeat = current;
    const drawsBefore = players[drawingSeat].riichiDraws ?? 0;
    const nailReady = settings.cards && hasCard(players[drawingSeat], 'nail') && wall.length === 1 && waitKinds(effectiveHand(drawingSeat), roundEvent, hasCard(players[drawingSeat], 'multipai'), playerCount(), settings.specialYaku).length > 0;
    const tile = wall.pop()!;
    applyDrawEffects(drawingSeat, tile, 'フィナーレ');
    players[drawingSeat].temporaryFuriten = false;
    drawnTileId = tile.id; rinshanDrawn = false;
    say(`フィナーレ：${names[drawingSeat]}の番に${tileName(tile.kind)}を公開。`);
    let drawingSeatWon = false;
    for (let seat = 0; seat < playerCount(); seat++) {
      let score = winScore(seat, [...players[seat].hand, tile], true);
      let effect = '';
      const countdownReady = seat === drawingSeat && settings.cards && hasCard(players[seat], 'countdown') && players[seat].riichi && drawsBefore < 6 && (players[seat].riichiDraws ?? 0) >= 6;
      if (seat === drawingSeat && (countdownReady || nailReady)) {
        for (const kind of availableKinds(roundEvent, playerCount())) {
          const candidate = winScore(seat, [...players[seat].hand, { ...tile, kind }], true);
          if (candidate.valid && (!score.valid || candidate.total > score.total)) { score = candidate; effect = countdownReady ? 'カウントダウン' : '海底の釘'; }
        }
      }
      if (!score.valid) continue;
      if (seat === drawingSeat) drawingSeatWon = true;
      const payment = payTsumo(seat, score);
      if (riichiPot) { players[seat].points += riichiPot; riichiPot = 0n; }
      const winningKind = score.chosen.find(chosen => chosen.id === tile.id)?.kind ?? tile.kind;
      const summary = `${names[seat]}が${tileName(winningKind)}でツモ和了${effect ? `（${effect}）` : ''}：${score.total.toLocaleString()}点。${payment}`;
      finaleDetails.push(summary);
      finaleHands.push(resultHand(seat, score, `フィナーレ・${tileName(winningKind)}で和了`));
      say(summary);
    }
    if (!drawingSeatWon) {
      const penalty = applyUltimatePenalty(drawingSeat, tile);
      if (penalty) finaleDetails.push(penalty);
    }
    current = (current + 1) % playerCount();
    render();
    timer = window.setTimeout(reveal, 450);
  };
  render();
  timer = window.setTimeout(reveal, 450);
}
function doraKinds(): number[] { return roundEvent === 'memory' ? [] : [indicator, ...kanIndicators].map(tile => doraFromIndicator(tile.kind, roundEvent, playerCount(), tenchouShifts > 0)); }
function roundKanCount(): number { return players.reduce((count, player) => count + (player.kans?.length ?? 0) + (player.openMelds?.filter(meld => meld.type === 'kan').length ?? 0), 0); }
function uraKinds(): number[] { return roundEvent === 'memory' ? [] : [uraIndicator, ...uraKanIndicators].map(tile => doraFromIndicator(tile.kind, roundEvent, playerCount(), tenchouShifts > 0)); }
function effectiveHand(playerIndex: number, hand = players[playerIndex].hand): Tile[] {
  return [...hand, ...(players[playerIndex].kans ?? []).flatMap(kan => kan.slice(0, 3)), ...(players[playerIndex].openMelds ?? []).flatMap(meld => meld.tiles.slice(0, 3))];
}
function winScore(playerIndex: number, hand: Tile[], tsumo: boolean, discarder?: number, chankan = false, winningTileId = drawnTileId): Score {
  const score = settings.cards && hasCard(players[playerIndex], 'multipai') ? bestScoreWithExtra : bestScore;
  const parent = dealerSeat(round, playerCount());
  const winningTile = tsumo ? hand.find(tile => tile.id === winningTileId) : hand.at(-1);
  const result = score(effectiveHand(playerIndex, hand), players[playerIndex], parent === playerIndex, tsumo, { ...settings, roundEvent }, doraKinds(), roundEvent !== 'memory' && tsumo && wall.length === 0 && !rinshanDrawn, {
    seatWind: 27 + (playerIndex - parent + playerCount()) % playerCount(),
    roundWind: 27 + Math.floor((round - 1) / playerCount()) % 4,
    winningKind: winningTile?.kind,
    winningTileId: winningTile?.id,
    uraDora: uraKinds(),
    kans: players[playerIndex].kans,
    openMelds: players[playerIndex].openMelds,
    memoryMelds: roundEvent === 'memory' ? players[playerIndex].memoryMelds : undefined,
    memoryPair: roundEvent === 'memory' ? players[playerIndex].memoryPair : undefined,
    roundKanCount: roundKanCount(),
    finalRoundLast: round === settings.rounds && players.every((other, seat) => seat === playerIndex || players[playerIndex].points <= other.points),
    rinshan: rinshanDrawn,
    chankan,
    houtei: !tsumo && houteiEligible && !rinshanDrawn,
    initialRon: !tsumo && !chankan && players[playerIndex].discards === 0 && openingIntact(players),
    initialDraw: roundEvent !== 'memory' && tsumo && !rinshanDrawn && players[playerIndex].discards === 0 && openingIntact(players),
    openRiichiPenalty: !tsumo && discarder !== undefined && !!settings.openRiichi && !!players[playerIndex].openRiichi && !((players[discarder].riichiOrder ?? 0) > 0 && (players[discarder].riichiOrder ?? 0) < (players[playerIndex].riichiOrder ?? 0)),
  });
  return owedDraw[playerIndex] > 0 ? { ...result, valid: false } : result;
}
function waitsFor(playerIndex: number, hand = effectiveHand(playerIndex)): number[] {
  const present = [indicator, uraIndicator, ...kanIndicators, ...uraKanIndicators, ...wall,
    ...players.flatMap(player => [player.hand, player.river, ...(player.kans ?? []), ...(player.openMelds ?? []).map(meld => meld.tiles), player.northTiles ?? []].flat())];
  return existingWaitKinds(hand, roundEvent, settings.cards && hasCard(players[playerIndex], 'multipai'), playerCount(), present, settings.specialYaku);
}
function wouldDealIn(discarder: number, tile: Tile): boolean {
  return players.some((player, seat) => seat !== discarder && !player.temporaryFuriten && !player.riichiFuriten && winScore(seat, [...player.hand, tile], false, discarder).valid && !player.river.some(discarded => waitsFor(seat).includes(discarded.kind)));
}
function skipTrapRons(winners: { seat: number; score: Score }[], tile: Tile): void {
  if (tile.special !== 'trap' || !settings.cards) return;
  for (let index = winners.length - 1; index >= 0; index--) {
    const seat = winners[index].seat;
    if (seat === 0 || !hasCard(players[seat], 'danger') || (players[seat].dangerUses ?? 0) >= 2) continue;
    players[seat].dangerUses = (players[seat].dangerUses ?? 0) + 1;
    players[seat].temporaryFuriten = true;
    if (players[seat].riichi) players[seat].riichiFuriten = true;
    winners.splice(index, 1);
    say(`${names[seat]}は危機感知でトラップ牌へのロンを見送りました。`);
  }
}
function discard(playerIndex: number, id: number, confirmedDanger = false, declareBotRiichi = false, declareBotOpenRiichi = false): void {
  if (phase !== 'turn' || current !== playerIndex) return;
  const hand = players[playerIndex].hand;
  if (players[playerIndex].riichi && id !== drawnTileId) { if (playerIndex === 0) { say('立直中はツモ牌を打牌してください。'); render(); } return; }
  const i = hand.findIndex(t => t.id === id);
  if (i < 0) return;
  if (playerIndex === 0 && !confirmedDanger && settings.cards && hasCard(players[0], 'danger') && (players[0].dangerUses ?? 0) < 2) {
    const tile = hand[i];
    if (wouldDealIn(0, tile)) {
      players[0].dangerUses = (players[0].dangerUses ?? 0) + 1;
      dangerDiscardId = id; phase = 'warning'; render(); return;
    }
  }
  applyUltimatePenalty(playerIndex);
  const declaringRiichi = playerIndex === 0 ? riichiPending : declareBotRiichi;
  if (declaringRiichi) {
    const remaining = hand.filter(t => t.id !== id);
    const readyHand = effectiveHand(playerIndex, remaining);
    const tenpai = waitsFor(playerIndex, readyHand).length > 0;
    if (!tenpai) { if (playerIndex === 0) { say('その打牌では聴牌になりません。'); render(); } return; }
    players[playerIndex].points -= 1000n;
    riichiPot += 1000n;
    players[playerIndex].riichi = true;
    players[playerIndex].openRiichi = playerIndex === 0 ? openRiichiPending : declareBotOpenRiichi;
    players[playerIndex].doubleRiichi = !players[playerIndex].openRiichi && players[playerIndex].discards === 0 && openingIntact(players);
    players[playerIndex].riichiOrder = ++riichiSerial;
    players[playerIndex].ippatsu = true;
    riichiPending = false;
    say(`${names[playerIndex]}が${players[playerIndex].openRiichi ? 'オープンリーチ' : players[playerIndex].doubleRiichi ? 'ダブル立直' : '立直'}を宣言しました。`);
    openRiichiPending = false;
  }
  const [t] = hand.splice(i, 1);
  if (releaseCompressedTile(t)) say(`${names[playerIndex]}の圧縮牌は打牌後、通常の1枚として扱います。`);
  markVisible(t);
  players[playerIndex].river.push(t);
  lastDiscardId = t.id;
  const reservations = settings.cards ? reserveAfterDiscard(players[playerIndex], t.kind, roundEvent, playerCount()) : { machinegun: false, pocket: false };
  if (reservations.machinegun) say(`${names[playerIndex]}の流しマシンガンが次のツモを予約。`);
  if (reservations.pocket) say(`${names[playerIndex]}のポケットビスケットが次の2回のツモを予約。`);
  resolveIrregular();
  const infected = spreadZombies(hand, Math.random, roundEvent);
  for (const { previousKind, targetKind } of infected) say(`${names[playerIndex]}の${tileName(previousKind)}が${tileName(targetKind)}のゾンビ牌に変化。`);
  if (infected.length) arrangeHand(playerIndex);
  players[playerIndex].discards++;
  if (extraDiscards > 0 && current === playerIndex) extraDiscards--;
  if (!declaringRiichi && players[playerIndex].riichi) players[playerIndex].ippatsu = false;
  say(`${names[playerIndex]}が${tileName(t.kind)}を打牌。`);
  action = null; activeCard = null; selected.clear();
  const winners: { seat: number; score: Score }[] = [];
  for (let p = 0; p < playerCount(); p++) if (p !== playerIndex) {
    const score = winScore(p, [...players[p].hand, t], false, playerIndex);
    if (score.valid && !players[p].temporaryFuriten && !players[p].riichiFuriten && !players[p].river.some(x => waitsFor(p).includes(x.kind))) winners.push({ seat: p, score });
  }
  skipTrapRons(winners, t);
  houteiEligible = false;
  const human = winners.find(w => w.seat === 0);
  if (human) {
    phase = 'claim'; pending = { tile: t, from: playerIndex, winners }; trapRonWarned = false;
    const options = playerIndex !== 0 && !autoOptions.noCalls ? callOptions(t, playerIndex) : [];
    pendingCall = options.length ? { tile: t, from: playerIndex, options } : null;
    if (autoOptions.win && !(t.special === 'trap' && settings.cards && hasCard(players[0], 'danger') && (players[0].dangerUses ?? 0) < 2)) { settleMultipleRon(winners, playerIndex); return; }
    render(); return;
  }
  if (winners.length) { settleMultipleRon(winners, playerIndex); return; }
  if (playerIndex !== 0) {
    const options = callOptions(t, playerIndex);
    if (options.length && !autoOptions.noCalls) { pendingCall = { tile: t, from: playerIndex, options }; callStage = null; phase = 'call'; render(); return; }
  }
  if (resumeExtraDiscard(playerIndex)) return;
  if (tryCpuCall(t, playerIndex)) return;
  nextTurn();
}
function resumeExtraDiscard(seat: number): boolean {
  if (!extraDiscards || current !== seat) return false;
  phase = 'turn';
  render();
  if (seat !== 0) timer = window.setTimeout(botTurn, 450);
  return true;
}
function applyUltimatePenalty(seat: number, finaleDraw?: Tile): string | null {
  const player = players[seat];
  if (!settings.cards || !hasCard(player, 'ultimate') || !player.riichi || (player.riichiDraws ?? 0) < 6 || player.ultimatePenaltyDone) return null;
  player.ultimatePenaltyDone = true;
  const scoringHand = finaleDraw ? [...player.hand, finaleDraw] : player.hand;
  let best: Score | null = null;
  for (let discard = 0; discard < scoringHand.length; discard++) {
    const baseHand = scoringHand.filter((_, index) => index !== discard);
    const waits = waitKinds(effectiveHand(seat, baseHand), roundEvent, hasCard(player, 'multipai'), playerCount(), settings.specialYaku);
    for (const kind of waits) {
      const candidate = winScore(seat, [...baseHand, { id: -1, kind }], true, undefined, false, -1);
      if (candidate.valid && (!best || candidate.total > best.total)) best = candidate;
    }
  }
  if (!best) return null;
  const opponents = players.map((_, other) => other).filter(other => other !== seat);
  const share = best.total / BigInt(opponents.length);
  let remainder = best.total % BigInt(opponents.length);
  player.points -= best.total;
  for (const opponent of opponents) { players[opponent].points += share + (remainder > 0n ? 1n : 0n); if (remainder > 0n) remainder--; }
  const message = `${names[seat]}のアルティメットリーチが不発。${best.total.toLocaleString()}点を他家へ分配。`;
  say(message);
  return message;
}
function resolveIrregular(): void {
  if (irregularKind !== null) return;
  const kind = firstFourVisibleKind(players);
  if (kind === null) return;
  irregularKind = kind;
  for (const player of players) for (const tile of [...player.hand, ...player.river, ...(player.northTiles ?? []), ...(player.kans ?? []).flat(), ...(player.openMelds ?? []).flatMap(meld => meld.tiles)]) if (tile.special === 'irregular') changeTileKind(tile, kind, roundEvent);
  for (const tile of wall) if (tile.special === 'irregular') changeTileKind(tile, kind, roundEvent);
  say(`イレギュラーが${tileName(kind)}に変化。`);
}
function callOptionsFor(seat: number, tile: Tile, from: number): { type: OpenMeld['type']; handIds: number[]; label: string }[] {
  if (seat === from || players[seat].riichi || settings.cards && hasCard(players[seat], 'dancer') || (players[seat].openMelds?.length ?? 0) + (players[seat].kans?.length ?? 0) >= 4) return [];
  return meldCandidates(players[seat].hand, tile, seat === (from + 1) % playerCount(), wall.length >= 3 && (seat !== 0 || !autoOptions.noKan), roundEvent);
}
function callOptions(tile: Tile, from: number): { type: OpenMeld['type']; handIds: number[]; label: string }[] { return callOptionsFor(0, tile, from); }
function tryCpuCall(tile: Tile, from: number): boolean {
  for (const type of ['kan', 'pon', 'chi'] as const) for (let offset = 1; offset < playerCount(); offset++) {
    const seat = (from + offset) % playerCount();
    if (seat === 0) continue;
    const option = callOptionsFor(seat, tile, from).find(candidate => candidate.type === type);
    if (!option) continue;
    const riverIndex = players[from].river.findIndex(discarded => discarded.id === tile.id);
    if (riverIndex < 0) return false;
    const used = option.handIds.map(id => players[seat].hand.find(handTile => handTile.id === id)!);
    players[from].river.splice(riverIndex, 1);
    players[from].riverCalled = true;
    for (const usedTile of [...used, tile]) if (usedTile.special === 'triplet') delete usedTile.special;
    for (const usedTile of used) markVisible(usedTile);
    players[seat].hand = players[seat].hand.filter(handTile => !option.handIds.includes(handTile.id));
    players[seat].openMelds ??= [];
    players[seat].openMelds!.push({ type, tiles: [...used, tile] });
    resolveIrregular();
    for (const player of players) player.ippatsu = false;
    current = seat; phase = 'turn'; pendingCall = null; callStage = null; mayTsumo = false; rinshanDrawn = false; houteiEligible = false; drawnTileId = 0;
    extraDiscards = 0;
    if (type === 'kan') {
      kanIndicators.push(wall.pop()!); uraKanIndicators.push(wall.pop()!);
      const replacement = wall.pop()!; applyDrawEffects(seat, replacement, '嶺上'); players[seat].hand.push(replacement); drawnTileId = replacement.id; rinshanDrawn = true; mayTsumo = true;
    }
    autoExtractNorth(seat);
    arrangeHand(seat);
    say(`${names[seat]}が${tileName(tile.kind)}を${type === 'chi' ? 'チー' : type === 'pon' ? 'ポン' : '明槓'}。`);
    render(); timer = window.setTimeout(botTurn, 450);
    return true;
  }
  return false;
}
function claimMeld(index: number): void {
  if (!pendingCall || phase !== 'call') return;
  const { tile, from, options } = pendingCall;
  const option = options[index];
  if (!option || autoOptions.noCalls || autoOptions.noKan && option.type === 'kan') return;
  const riverIndex = players[from].river.findIndex(t => t.id === tile.id);
  if (riverIndex < 0) return;
  const tiles = option.handIds.map(id => players[0].hand.find(t => t.id === id));
  if (tiles.some(t => !t)) return;
  players[from].river.splice(riverIndex, 1);
  players[from].riverCalled = true;
  for (const used of [...tiles, tile]) if (used?.special === 'triplet') delete used.special;
  for (const used of tiles) if (used) markVisible(used);
  players[0].hand = players[0].hand.filter(t => !option.handIds.includes(t.id));
  players[0].openMelds ??= [];
  players[0].openMelds!.push({ type: option.type, tiles: [...tiles as Tile[], tile] });
  resolveIrregular();
  current = 0; phase = 'turn'; pendingCall = null; callStage = null; action = null; selected.clear(); riichiPending = false;
  extraDiscards = 0;
  for (const p of players) p.ippatsu = false;
  mayTsumo = false; rinshanDrawn = false; drawnTileId = 0;
  if (option.type === 'kan') {
    kanIndicators.push(wall.pop()!); uraKanIndicators.push(wall.pop()!);
    const replacement = wall.pop()!; applyDrawEffects(0, replacement, '嶺上'); players[0].hand.push(replacement); arrangeHand(0);
    drawnTileId = replacement.id; rinshanDrawn = true; mayTsumo = true;
  }
  autoExtractNorth(0);
  say(`あなたは${tileName(tile.kind)}を${option.type === 'chi' ? 'チー' : option.type === 'pon' ? 'ポン' : '明槓'}しました。`);
  if (option.type === 'kan' && autoTsumoAfterKan(0)) return;
  render();
}
function autoTsumoAfterKan(seat: number): boolean {
  if (seat !== 0 || !autoOptions.win || !mayTsumo) return false;
  const score = winScore(seat, players[seat].hand, true);
  if (!score.valid) return false;
  settle(seat, null, score, true);
  return true;
}
function nextTurn(): void { current = (current + 1) % playerCount(); drawCurrent(); }
function botTurn(): void {
  if (phase !== 'turn' || current === 0) return;
  autoExtractNorth(current);
  if (settings.cards && hasCard(players[current], 'near') && !cardUsed(players[current], 'near')) { players[current].nearPinActive = true; markCardUsed(players[current], 'near'); }
  const hand = players[current].hand;
  const rank = (t: Tile) => {
    const neighbors = hand.filter(x => x.id !== t.id && (x.kind === t.kind || (suitOf(t.kind) !== null && suitOf(x.kind) === suitOf(t.kind) && Math.abs(rankOf(x.kind)! - rankOf(t.kind)!) <= 2))).length;
    return neighbors * 10 + (t.special ? 15 : 0) + (suitOf(t.kind) === null ? -2 : 0) + Math.random() * 2;
  };
  const discardExtra = (): void => {
    let choice = [...hand].sort((a, b) => rank(a) - rank(b))[0];
    if (!choice) return;
    if (settings.cards && hasCard(players[current], 'danger') && (players[current].dangerUses ?? 0) < 2 && wouldDealIn(current, choice)) {
      players[current].dangerUses = (players[current].dangerUses ?? 0) + 1;
      const safe = hand.filter(tile => !wouldDealIn(current, tile)).sort((a, b) => rank(a) - rank(b))[0];
      if (safe) choice = safe;
      say(`${names[current]}の危機感知が放銃を警告。${safe ? '別の牌を選びました。' : '打牌を続けます。'}`);
    }
    discard(current, choice.id);
  };
  if (extraDiscards > 0) {
    discardExtra();
    return;
  }
  if (mayTsumo) { const score = winScore(current, hand, true); if (score.valid) { settle(current, null, score, true); return; } }
  if (settings.cards && hasCard(players[current], 'pairFestival') && !players[current].riichi) {
    while (true) {
      const pair = hand.find(tile => !tile.compressedMate && hand.some(other => other.id !== tile.id && !other.compressedMate && other.kind === tile.kind));
      if (!pair) break;
      const mate = hand.find(tile => tile.id !== pair.id && !tile.compressedMate && tile.kind === pair.kind)!;
      const drawn = compressPair(hand, [pair.id, mate.id], roundEvent, playerCount());
      if (!drawn) break;
      drawnTileId = drawn.id;
      mayTsumo = true;
      arrangeHand(current);
      say(`${names[current]}が対子祭りで${tileName(pair.kind)}を圧縮。`);
      const score = winScore(current, hand, true);
      if (score.valid) { settle(current, null, score, true); return; }
    }
  }
  if (settings.cards && hasCard(players[current], 'roadroller') && !cardUsed(players[current], 'roadroller') && !players[current].riichi) {
    const candidates = hand.filter(tile => !tile.compressedMate);
    if (candidates.length >= 3) {
      const neighbors = (tile: Tile): number => candidates.filter(other => other.id !== tile.id &&
        (other.kind === tile.kind || suitOf(tile.kind) !== null && suitOf(other.kind) === suitOf(tile.kind) && Math.abs(rankOf(other.kind)! - rankOf(tile.kind)!) <= 2)).length;
      const targets = [...candidates].sort((a, b) => neighbors(a) - neighbors(b) || a.id - b.id).slice(0, 3);
      targets.forEach(tile => changeTileKind(tile, 9, roundEvent));
      markCardUsed(players[current], 'roadroller');
      arrangeHand(current);
      say(`${names[current]}がロードローラーで手牌3枚を${tileName(targets[0].kind)}に変化。`);
      if (mayTsumo) {
        const score = winScore(current, hand, true);
        if (score.valid) { settle(current, null, score, true); return; }
      }
    }
  }
  for (const card of ['change', 'randomizer'] as const) {
    if (!settings.cards || !hasCard(players[current], card) || cardUsed(players[current], card) || players[current].riichi) continue;
    const candidates = hand.filter(tile => !tile.compressedMate && !tile.special);
    const count = card === 'change' ? 5 : 1;
    if (candidates.length < count) continue;
    const neighbors = (tile: Tile): number => hand.filter(other => other.id !== tile.id &&
      (other.kind === tile.kind || suitOf(tile.kind) !== null && suitOf(other.kind) === suitOf(tile.kind) && Math.abs(rankOf(other.kind)! - rankOf(tile.kind)!) <= 2)).length;
    const targets = [...candidates].sort((a, b) => neighbors(a) - neighbors(b) || a.id - b.id).slice(0, count);
    const kinds = availableKinds(roundEvent, playerCount());
    for (const tile of targets) changeTileKind(tile, card === 'change' ? randomChangeKind(roundEvent) : kinds[Math.floor(Math.random() * kinds.length)], roundEvent);
    markCardUsed(players[current], card);
    arrangeHand(current);
    say(`${names[current]}が${cardNames[card]}で手牌${count}枚を変化。`);
    if (mayTsumo) {
      const score = winScore(current, hand, true);
      if (score.valid) { settle(current, null, score, true); return; }
    }
  }
  applyUltimatePenalty(current);
  if (wall.length >= 3 && !players[current].riichi) {
    const kanTiles = hand.filter(tile => !tile.compressedMate);
    const added = kanTiles.find(tile => players[current].openMelds?.some(meld => meld.type === 'pon' && meld.tiles[0].kind === tile.kind));
    if (added && startAddedKan(current, added.id)) return;
    const natural = kanTiles.find(t => kanTiles.filter(x => x.kind === t.kind).length >= 4);
    if (natural) { makeKan(current, kanTiles.filter(t => t.kind === natural.kind).slice(0, 4).map(t => t.id), false); return; }
    if (settings.cards && hasCard(players[current], 'akuukan')) {
      const pair = kanTiles.find(t => kanTiles.filter(x => x.kind === t.kind).length >= 2);
      if (pair && kanTiles.length >= 4) {
        const basis = kanTiles.filter(t => t.kind === pair.kind).slice(0, 2);
        const others = kanTiles.filter(t => !basis.some(x => x.id === t.id)).slice(0, 2);
        makeKan(current, [...basis, ...others].map(t => t.id), true);
        return;
      }
    }
  }
  if (settings.cards && !players[current].riichi && hasCard(players[current], 'borrow') && !cardUsed(players[current], 'borrow')) {
    const targets = players.map((player, seat) => ({ player, seat })).filter(({ player, seat }) => seat !== current && player.hand.length);
    const target = targets.sort((a, b) => a.player.points === b.player.points ? a.seat - b.seat : a.player.points > b.player.points ? -1 : 1)[0];
    if (target) {
      const index = Math.floor(Math.random() * target.player.hand.length);
      const [tile] = target.player.hand.splice(index, 1);
      hand.push(tile); arrangeHand(current); markCardUsed(players[current], 'borrow'); owedDraw[target.seat]++; extraDiscards = 2;
      if (target.player.riichi && !waitsFor(target.seat).length) {
        target.player.riichi = false; target.player.doubleRiichi = false; target.player.openRiichi = false; target.player.riichiOrder = 0;
        target.player.riichiDraws = 0; target.player.ippatsu = false; target.player.riichiFuriten = false;
        say(`${names[target.seat]}の立直が解除されました。`);
      }
      say(`${names[current]}が${names[target.seat]}から${tileName(tile.kind)}を借りパク。追加で1枚打牌します。`);
    }
  }
  if (!extraDiscards && settings.cards && !players[current].riichi && hasCard(players[current], 'pickup') && !cardUsed(players[current], 'pickup')) {
    const candidates = players.flatMap((player, seat) => seat === current ? [] : player.river.map(tile => ({ seat, tile })));
    const connections = (tile: Tile): number => hand.filter(other => other.kind === tile.kind ||
      suitOf(tile.kind) !== null && suitOf(other.kind) === suitOf(tile.kind) && Math.abs(rankOf(other.kind)! - rankOf(tile.kind)!) <= 2).length;
    const selected = candidates.sort((a, b) => connections(b.tile) - connections(a.tile) || a.seat - b.seat)[0];
    if (selected && connections(selected.tile) > 0) {
      const source = players[selected.seat];
      const picked = takeRiverTile(source, selected.tile.id)!;
      hand.push(picked); arrangeHand(current); markCardUsed(players[current], 'pickup'); extraDiscards = 2;
      say(`${names[current]}が${names[selected.seat]}の河から${tileName(selected.tile.kind)}を拾いました。追加で1枚打牌します。`);
    }
  }
  if (extraDiscards > 0) { discardExtra(); return; }
  // 孤立牌と字牌を優先して切る。特殊牌はなるべく残す。
  const dangerActive = settings.cards && hasCard(players[current], 'danger') && (players[current].dangerUses ?? 0) < 2;
  if (settings.cards && hasCard(players[current], 'pocket') && !players[current].riichi
    && !players[current].pocketArmed && !(players[current].drawReservations?.length)) {
    players[current].pocketArmed = true;
    say(`${names[current]}がポケットビスケットを発動。次の打牌で2回のツモを予約します。`);
  }
  if (players[current].riichi) {
    const drawn = hand.find(tile => tile.id === drawnTileId);
    if (drawn && dangerActive && wouldDealIn(current, drawn)) {
      players[current].dangerUses = (players[current].dangerUses ?? 0) + 1;
      say(`${names[current]}の危機感知が放銃を警告しました。立直中のためツモ牌を打牌します。`);
    }
    discard(current, drawnTileId); return;
  }
  const canRiichi = players[current].points >= 1000n && !players[current].openMelds?.length;
  const ready = canRiichi ? hand.filter(tile => {
    const remaining = effectiveHand(current, hand.filter(other => other.id !== tile.id));
    return waitsFor(current, remaining).length > 0;
  }) : [];
  let choice = [...(ready.length ? ready : hand)].sort((a, b) => rank(a) - rank(b))[0];
  if (dangerActive && wouldDealIn(current, choice)) {
    players[current].dangerUses = (players[current].dangerUses ?? 0) + 1;
    const safeReady = ready.filter(tile => !wouldDealIn(current, tile)).sort((a, b) => rank(a) - rank(b))[0];
    const safe = safeReady ?? hand.filter(tile => !wouldDealIn(current, tile)).sort((a, b) => rank(a) - rank(b))[0];
    if (safe) choice = safe;
    say(`${names[current]}の危機感知が放銃を警告。${safe ? '別の牌を選びました。' : '打牌を続けます。'}`);
  }
  const declareRiichi = ready.some(tile => tile.id === choice.id);
  discard(current, choice.id, false, declareRiichi, declareRiichi && settings.openRiichi);
}
function completeAddedKan(): void {
  if (!pendingAddedKan || wall.length < 3) return;
  const { seat, tile, meldIndex } = pendingAddedKan;
  const meld = players[seat].openMelds?.[meldIndex];
  if (!meld || meld.type !== 'pon' || !players[seat].hand.some(handTile => handTile.id === tile.id)) return;
  pendingAddedKan = null;
  pending = null;
  players[seat].hand = players[seat].hand.filter(handTile => handTile.id !== tile.id);
  if (tile.special === 'triplet') delete tile.special;
  meld.type = 'kan';
  markVisible(tile);
  meld.tiles.push(tile);
  resolveIrregular();
  for (const player of players) player.ippatsu = false;
  kanIndicators.push(wall.pop()!);
  uraKanIndicators.push(wall.pop()!);
  const replacement = wall.pop()!;
  applyDrawEffects(seat, replacement, '嶺上');
  players[seat].hand.push(replacement);
  current = seat; phase = 'turn'; mayTsumo = true; rinshanDrawn = true; houteiEligible = false; drawnTileId = replacement.id;
  autoExtractNorth(seat);
  arrangeHand(seat);
  say(`${names[seat]}が${tileName(tile.kind)}を加槓。嶺上牌をツモ。`);
  if (autoTsumoAfterKan(seat)) return;
  render();
  if (seat !== 0) timer = window.setTimeout(botTurn, 450);
}
function startAddedKan(seat: number, id: number): boolean {
  if (phase !== 'turn' || current !== seat || players[seat].riichi || seat === 0 && autoOptions.noKan || wall.length < 3) return false;
  const tile = players[seat].hand.find(handTile => handTile.id === id);
  if (!tile || tile.compressedMate) return false;
  const meldIndex = players[seat].openMelds?.findIndex(meld => meld.type === 'pon' && meld.tiles[0].kind === tile.kind) ?? -1;
  if (meldIndex < 0) return false;
  houteiEligible = false;
  pendingAddedKan = { seat, tile, meldIndex };
  const winners: { seat: number; score: Score }[] = [];
  for (let other = 0; other < playerCount(); other++) if (other !== seat) {
    const score = winScore(other, [...players[other].hand, tile], false, seat, true);
    if (score.valid && !players[other].temporaryFuriten && !players[other].riichiFuriten && !players[other].river.some(discarded => waitsFor(other).includes(discarded.kind))) winners.push({ seat: other, score });
  }
  skipTrapRons(winners, tile);
  if (!winners.length) { completeAddedKan(); return true; }
  pending = { tile, from: seat, winners, chankan: true };
  const human = winners.some(winner => winner.seat === 0);
  if (!human || autoOptions.win && !(tile.special === 'trap' && settings.cards && hasCard(players[0], 'danger') && (players[0].dangerUses ?? 0) < 2)) { settleMultipleRon(winners, seat, tile); return true; }
  phase = 'claim'; pendingCall = null; callStage = null; trapRonWarned = false;
  render();
  return true;
}
function makeKan(seat: number, ids: number[], akuukan: boolean): void {
  if (phase !== 'turn' || current !== seat || seat === 0 && autoOptions.noKan || players[seat].riichi || wall.length < 3 || ids.length !== 4 || new Set(ids).size !== 4) return;
  const hand = players[seat].hand;
  const chosen = ids.map(id => hand.find(t => t.id === id)).filter((tile): tile is Tile => tile !== undefined);
  if (chosen.length !== 4) return;
  if (chosen.some(tile => tile.compressedMate)) { if (seat === 0) { say('圧縮牌はカンに使えません。'); render(); } return; }
  let kind = chosen[0].kind;
  if (akuukan) {
    const pair = chosen.find(tile => chosen.filter(other => other.kind === tile.kind).length >= 2);
    if (!pair || !hasCard(players[seat], 'akuukan')) { say('亜空槓には同じ牌2枚が必要です。'); render(); return; }
    kind = pair.kind;
  } else if (chosen.some(tile => tile.kind !== kind)) { say('通常の暗槓には同じ牌4枚が必要です。'); render(); return; }
  if ((players[seat].kans?.length ?? 0) + (players[seat].openMelds?.length ?? 0) >= 4) return;
  for (const tile of chosen) {
    hand.splice(hand.findIndex(x => x.id === tile.id), 1);
    if (akuukan) changeTileKind(tile, kind, roundEvent);
    if (tile.special === 'triplet') delete tile.special;
    markVisible(tile);
  }
  players[seat].kans ??= [];
  players[seat].kans.push(chosen);
  resolveIrregular();
  for (const p of players) p.ippatsu = false;
  kanIndicators.push(wall.pop()!);
  uraKanIndicators.push(wall.pop()!);
  const replacement = wall.pop()!;
  applyDrawEffects(seat, replacement, '嶺上');
  hand.push(replacement);
  arrangeHand(seat);
  drawnTileId = replacement.id;
  rinshanDrawn = true;
  houteiEligible = false;
  autoExtractNorth(seat);
  action = null; selected.clear();
  say(`${names[seat]}が${tileName(kind)}を${akuukan ? '亜空槓で' : ''}暗槓。嶺上牌をツモ。`);
  if (autoTsumoAfterKan(seat)) return;
  render();
  if (seat !== 0) timer = window.setTimeout(botTurn, 450);
}
function payTsumo(winner: number, score: Score): string {
  const responsible = damascusPayer(winner);
  if (responsible !== null) {
    players[responsible].points -= score.total;
    players[winner].points += score.total;
    return `ダマスカス：${names[responsible]}が${score.total.toLocaleString()}点を全額支払い`;
  }
  const dealer = dealerSeat(round, playerCount());
  for (let p = 0; p < playerCount(); p++) if (p !== winner) {
    const amount = p === dealer ? score.dealerPayment : score.nonDealerPayment;
    players[p].points -= amount;
    players[winner].points += amount;
  }
  return winner === dealer
    ? `子の支払い 各${score.nonDealerPayment.toLocaleString()}点`
    : `親の支払い ${score.dealerPayment.toLocaleString()}点 / 子の支払い 各${score.nonDealerPayment.toLocaleString()}点`;
}
function damascusPayer(winner: number): number | null {
  if (!settings.cards || !isDamascusTarget(players[winner])) return null;
  const seat = players.findIndex((p, i) => i !== winner && hasCard(p, 'damascus'));
  return seat >= 0 ? seat : null;
}
function foresightWinner(excluded: Set<number>): { seat: number; score: Score } | null {
  if (!settings.cards) return null;
  const parent = dealerSeat(round, playerCount());
  for (let seat = 0; seat < playerCount(); seat++) {
    if (excluded.has(seat) || owedDraw[seat] > 0 || !hasCard(players[seat], 'foresight') || players[seat].river.length < 14) continue;
    const score = bestRiverScore(players[seat].river, players[seat], seat === parent, { ...settings, roundEvent }, doraKinds(), {
      seatWind: 27 + (seat - parent + playerCount()) % playerCount(),
      roundWind: 27 + Math.floor((round - 1) / playerCount()) % 4,
      uraDora: uraKinds(),
      roundKanCount: roundKanCount(),
    });
    if (score) return { seat, score };
  }
  return null;
}
function payForesight(details: string[], excluded: Set<number>, hands?: ResultHand[]): number | null {
  const found = foresightWinner(excluded);
  if (!found) return null;
  const payment = payTsumo(found.seat, found.score);
  hands?.push(resultHand(found.seat, found.score, '先を見据える'));
  details.push(`先を見据える：${names[found.seat]}が河の14枚でツモ和了`);
  details.push(...scoreResultLines(found.score));
  details.push(payment);
  return found.seat;
}
function resultHand(seat: number, score: Score, effect = ''): ResultHand {
  return {
    label: `${names[seat]}${effect ? `・${effect}` : ''}`,
    shape: score.shape,
    tiles: score.chosen.map(tile => ({ ...tile, compressedMate: tile.compressedMate ? { ...tile.compressedMate } : undefined })),
  };
}
function scoreResultLines(score: Score, extraEffects: string[] = []): string[] {
  const isEffect = (line: string): boolean => line.includes('×') || line.startsWith('ドラ ') || line.startsWith('裏ドラ ') || line.startsWith('赤ドラ ') || line.startsWith('北抜き ') || line.startsWith('ドラミングビート') || line.startsWith('松竹梅 ') || line.startsWith('数牌ボーナス ') || line.startsWith('イレギュラー ');
  const roles = score.lines.filter(line => !isEffect(line));
  const effects = [...score.lines.filter(isEffect), ...extraEffects];
  return [winningShapeSummary(score), ...roles, `${score.han}翻 ${score.fu}符`, ...effects, `通常和了点 ${score.base.toLocaleString()}点`, `最終和了点 ${score.total.toLocaleString()}点`];
}
function settleMultipleRon(winners: { seat: number; score: Score }[], discarder: number, robbedTile?: Tile): void {
  phase = 'result';
  const trap = (robbedTile ?? players[discarder].river.at(-1))?.special === 'trap';
  pending = null;
  pendingAddedKan = null;
  const ordered = [...winners].sort((a, b) => ((a.seat - discarder + playerCount()) % playerCount()) - ((b.seat - discarder + playerCount()) % playerCount()));
  const details: string[] = [];
  const hands = ordered.map(({ seat, score }) => resultHand(seat, score));
  for (const { seat, score } of ordered) {
    const payer = trap ? seat : damascusPayer(seat) ?? discarder;
    const paid = transferRonPoints(players, seat, discarder, score.total, trap, payer, settings.cards);
    const lines = scoreResultLines(score);
    details.push(`${names[seat]}：${lines[0]}`, ...lines.slice(1));
    details.push(trap ? `トラップ：${names[seat]}から${names[discarder]}へ支払い` : `${payer === discarder ? names[discarder] : `ダマスカス：${names[payer]}`}からの支払い`);
    if (paid !== score.total) details.push(`ハイリスクハイリターン：${names[discarder]}の放銃支払い ×3（${paid.toLocaleString()}点）`);
  }
  const foresightSeat = payForesight(details, new Set(ordered.map(w => w.seat)), hands);
  if (riichiPot) {
    players[ordered[0].seat].points += riichiPot;
    details.push(`立直供託 ${riichiPot.toLocaleString()}点 → ${names[ordered[0].seat]}`);
    riichiPot = 0n;
  }
  result = { title: `${ordered.map(w => names[w.seat]).join('・')}のロン和了${foresightSeat === null ? '' : '・先を見据える'}`, details, hands };
  resultStage = 1; resultAnimating = true;
  render();
}
function settle(winner: number, loser: number | null, score: Score, tsumo: boolean, effectLine?: string): void {
  phase = 'result';
  const rainbow = score.chosen.filter(t => t.special === 'rainbow');
  const details = scoreResultLines(score, [...(rainbow.length ? [`虹色変化 → ${rainbow.map(t => tileName(t.kind)).join('・')}`] : []), ...(effectLine ? [effectLine] : [])]);
  const hands = [resultHand(winner, score)];
  const rideWinners: { seat: number; score: Score }[] = [];
  if (tsumo && settings.cards) {
    const drawn = players[winner].hand.find(t => t.id === drawnTileId);
    if (drawn) for (let i = 0; i < playerCount(); i++) if (i !== winner && hasCard(players[i], 'ride')) {
      const candidate = winScore(i, [...players[i].hand, drawn], true);
      if (candidate.valid) rideWinners.push({ seat: i, score: candidate });
    }
  }
  if (tsumo) {
    details.push(payTsumo(winner, score));
  } else if (loser !== null) {
    const trap = players[loser].river.at(-1)?.special === 'trap';
    const payer = trap ? winner : damascusPayer(winner) ?? loser;
    const paid = transferRonPoints(players, winner, loser, score.total, trap, payer, settings.cards);
    details.push(trap ? `トラップ：${names[winner]}から${names[loser]}へ支払い` : `${payer === loser ? names[loser] : `ダマスカス：${names[payer]}`}からの支払い`);
    if (paid !== score.total) details.push(`ハイリスクハイリターン：${names[loser]}の放銃支払い ×3（${paid.toLocaleString()}点）`);
  }
  for (const rider of rideWinners) {
    hands.push(resultHand(rider.seat, rider.score, '便乗'));
    const payment = payTsumo(rider.seat, rider.score);
    details.push(`便乗：${names[rider.seat]}もツモ和了（${rider.score.han}翻 ${rider.score.fu}符・${payment}）`);
  }
  const foresightSeat = payForesight(details, new Set([winner, ...rideWinners.map(w => w.seat)]), hands);
  if (riichiPot) { players[winner].points += riichiPot; details.push(`立直供託 ${riichiPot.toLocaleString()}点`); riichiPot = 0n; }
  result = { title: `${names[winner]}の${tsumo ? 'ツモ' : 'ロン'}和了${rideWinners.length ? '・便乗' : ''}${foresightSeat === null ? '' : '・先を見据える'}`, details, hands };
  resultStage = 1; resultAnimating = true;
  render();
}
function exhaustiveDraw(): void {
  phase = 'result';
  const nagashi = players.map((player, seat) => owedDraw[seat] === 0 && nagashiEligible(player, roundEvent) ? seat : -1).filter(seat => seat >= 0);
  if (nagashi.length) {
    const dealer = dealerSeat(round, playerCount());
    const details = [...finaleDetails];
    for (const seat of nagashi) {
      let total = 0n;
      for (let other = 0; other < playerCount(); other++) if (other !== seat) {
        const amount = seat === dealer || other === dealer ? 4000n : 2000n;
        players[other].points -= amount; players[seat].points += amount; total += amount;
      }
      details.push(`${names[seat]}：流し満貫 ${total.toLocaleString()}点`);
    }
    if (riichiPot) { players[nagashi[0]].points += riichiPot; riichiPot = 0n; }
    result = { title: '流し満貫', details, hands: finaleHands }; render(); return;
  }
  const foresightDetails: string[] = [];
  const hands: ResultHand[] = [...finaleHands];
  const foresightSeat = payForesight(foresightDetails, new Set(), hands);
  if (foresightSeat !== null) {
    if (riichiPot) { players[foresightSeat].points += riichiPot; foresightDetails.push(`立直供託 ${riichiPot.toLocaleString()}点`); riichiPot = 0n; }
    result = { title: `${names[foresightSeat]}の先を見据える`, details: [...finaleDetails, ...foresightDetails], hands };
    resultStage = 1; resultAnimating = true;
    render();
    return;
  }
  const ready = players.map((_, i) => waitsFor(i).length ? i : -1).filter(i => i >= 0);
  const details = [...finaleDetails, `聴牌 ${ready.length}人`];
  if (ready.length > 0 && ready.length < playerCount()) {
    const gain = 3000n / BigInt(ready.length), loss = 3000n / BigInt(playerCount() - ready.length);
    for (let i = 0; i < playerCount(); i++) players[i].points += ready.includes(i) ? gain : -loss;
    details.push(`聴牌者 +${gain.toLocaleString()}点 / 不聴者 -${loss.toLocaleString()}点`);
  }
  result = { title: roundEvent === 'finale' ? 'フィナーレ終了' : '流局', details, hands: finaleHands };
  render();
}
function finishGame(): void {
  phase = 'result';
  if (riichiPot) {
    const leader = players.reduce((best, p, i) => p.points > players[best].points ? i : best, 0);
    players[leader].points += riichiPot;
    riichiPot = 0n;
  }
  const order = players.map((p, i) => ({ name: names[i], points: p.points })).sort((a, b) => a.points === b.points ? 0 : a.points > b.points ? -1 : 1);
  result = { title: '対局終了', details: order.map((p, i) => `${i + 1}位 ${p.name}　${p.points.toLocaleString()}点`) };
  render();
}
function memoryNeed(seat: number): 2 | 3 { return players[seat].hand.length < 12 ? 3 : 2; }
function memoryFinishTurn(): void {
  if (phase !== 'memory' || !memoryLocked) return;
  const tiles = memoryRevealed.map(index => memoryBoard[index]).filter((tile): tile is Tile => !!tile);
  const complete = tiles.length === memoryNeed(current) && (tiles.length === 3 ? isMemoryMeld(tiles) : tiles[0].kind === tiles[1].kind);
  if (complete) {
    for (const index of memoryRevealed) { memoryBoard[index] = null; memoryKnown.delete(index); }
    players[current].hand.push(...tiles);
    if (tiles.length === 3) players[current].memoryMelds?.push([...tiles]);
    else players[current].memoryPair = [...tiles];
    arrangeHand(current);
    say(`${names[current]}が${tiles.length === 3 ? '面子' : '雀頭'}を獲得しました。`);
    if (players[current].hand.length === 14) {
      drawnTileId = tiles.at(-1)!.id;
      const score = winScore(current, players[current].hand, true);
      if (score.valid) { settle(current, null, score, true); return; }
      say(`${names[current]}は4面子と雀頭を完成させましたが、和了できる役がありません。`);
    }
  } else say(`${names[current]}の牌は${tiles.length === 3 ? '面子' : '雀頭'}になりませんでした。`);
  memoryRevealed = []; memoryLocked = false;
  const remaining = memoryBoard.filter((tile): tile is Tile => !!tile);
  const next = Array.from({ length: playerCount() }, (_, offset) => (current + offset + 1) % playerCount())
    .find(seat => memoryCanContinue(remaining, players[seat].hand.length));
  if (next === undefined) {
    const allComplete = players.every(player => player.hand.length === 14);
    phase = 'result'; result = { title: '神経衰弱終了', details: [allComplete
      ? '全員が4面子と雀頭を完成させましたが、和了できる役がありませんでした。'
      : '牌を獲得できる席が残っていません。'] };
    render(); return;
  }
  current = next;
  render();
  if (current !== 0) timer = window.setTimeout(memoryBotTurn, 450);
}
function memorySelect(index: number): void {
  if (phase !== 'memory' || current !== 0 || memoryLocked || !memoryBoard[index] || memoryRevealed.includes(index)) return;
  memoryRevealed.push(index);
  memoryKnown.set(index, memoryBoard[index]!.kind);
  if (memoryRevealed.length === memoryNeed(0)) {
    memoryLocked = true;
    render();
    timer = window.setTimeout(memoryFinishTurn, 900);
  } else render();
}
function memoryBotTurn(): void {
  if (phase !== 'memory' || current === 0 || memoryLocked) return;
  if (settings.cards && hasCard(players[current], 'near') && !cardUsed(players[current], 'near')) {
    players[current].nearPinActive = true;
    markCardUsed(players[current], 'near');
  }
  const need = memoryNeed(current);
  const available = memoryBoard.map((tile, index) => tile ? index : -1).filter(index => index >= 0);
  memoryRevealed = chooseMemoryTiles(available, memoryKnown, need, playerCount());
  memoryRevealed.forEach(index => memoryKnown.set(index, memoryBoard[index]!.kind));
  memoryLocked = true;
  render();
  timer = window.setTimeout(memoryFinishTurn, 650);
}
function memoryPlayersHtml(): string {
  return players.map((player, seat) => `<div class="${seat === current ? 'active' : ''}"><strong>${names[seat]}</strong><span>${Math.min(4, Math.floor(player.hand.length / 3))}面子${player.hand.length === 14 ? '＋雀頭' : ''}</span>${settings.cards && player.cards?.length ? `<small>能力カード：${player.cards.map(card => cardNames[card]).join('・')}</small>` : ''}<div class="memory-tiles" aria-label="${names[seat]}が獲得した牌">${player.hand.map(tile => tileHtml(tile, { clickable: !!tile.special })).join('')}</div><small>${player.points.toLocaleString()}点</small></div>`).join('');
}
function memoryFaceHtml(tile: Tile): string {
  const label = `${tileName(tile.kind)}${tile.red ? '・赤ドラ' : ''}${tile.special ? `・${specialNames[tile.special]}` : ''}`;
  const content = `${tileFaceHtml(tile.kind, tile.red)}${tile.special ? '✦' : ''}${tile.red ? '<small>赤</small>' : ''}`;
  return tile.special ? `<button type="button" class="memory-face" data-visual-key="memory:${tile.id}" data-face="${tile.kind}" data-memory-special="${tile.id}" aria-label="${escape(label)}">${content}</button>` : `<span class="memory-face" data-visual-key="memory:${tile.id}" data-face="${tile.kind}" aria-label="${escape(label)}">${content}</span>`;
}
function showMemorySpecialInfo(tile: Tile, anchor: HTMLElement): void {
  document.querySelector('.special-popover')?.remove();
  if (!tile.special) return;
  const popup = document.createElement('div');
  popup.className = 'special-popover';
  const state = specialStatus(tile, { inHand: players.some(player => player.hand.some(candidate => candidate.id === tile.id)), inRiver: false, event: 'memory', irregularKind: null });
  popup.innerHTML = `<strong>${escape(specialNames[tile.special])}</strong><p>${escape(specialHelp[tile.special] ?? '')}</p><small>神経衰弱では、めくった時の面子判定に特殊効果を使いません。<br>現在の状態：${escape(state)}</small>`;
  placePopover(popup, anchor);
}
function renderMemory(): void {
  document.querySelector('.special-popover')?.remove();
  const waiting = phase === 'memory' && current !== 0;
  app.innerHTML = `<main class="shell memory-game"><header class="topbar"><div><div class="eyebrow">HYPERDIMENSIONAL MAHJONG</div><h1>神経衰弱</h1></div><span>第${round}局 / 全${settings.rounds}局</span></header><p>${phase === 'memory' ? `${names[current]}の手番：${memoryNeed(current)}枚めくって${memoryNeed(current) === 3 ? '面子' : '雀頭'}を作る` : '局終了'}</p><div class="memory-players">${memoryPlayersHtml()}</div><div class="memory-board">${memoryBoard.map((tile, index) => tile ? memoryRevealed.includes(index) ? `${memoryFaceHtml(tile)}` : `<button class="memory-back" data-memory="${index}" aria-label="${index + 1}番の伏せ牌" ${waiting || memoryLocked || phase !== 'memory' ? 'disabled' : ''}>◆</button>` : '<span class="memory-empty"></span>').join('')}</div><p class="memory-log">${escape(log[0] ?? '')}</p>${result ? `<div class="overlay"><div class="dialog"><h2>${escape(result.title)}</h2>${result.details.map(line => `<p>${escape(line)}</p>`).join('')}<button class="primary" id="memoryNext">${result.title === '対局終了' ? '新しく始める' : '次へ'}</button></div></div>` : ''}</main>`;
  app.querySelector('.memory-game .topbar')?.insertAdjacentHTML('beforeend', `<div class="top-actions"><button id="memoryYaku">役一覧</button>${settings.cards && players[0].cards?.length ? '<button id="memoryCards">カード</button>' : ''}<button id="memoryHelp" aria-label="神経衰弱の遊び方">遊び方</button></div>`);
  if (helpOpen) app.querySelector('.memory-game')?.insertAdjacentHTML('beforeend', '<div class="overlay"><div class="dialog info"><button class="close" id="memoryHelpClose" aria-label="遊び方を閉じる">×</button><h2>神経衰弱の遊び方</h2><p>対局の最初に親だったプレイヤーから順番に伏せ牌を3枚めくります。同じ牌3枚の刻子、または同じ種類で数字が連続する3枚の順子ができれば、その面子を獲得します。できなければ同じ位置へ伏せ直します。</p><p>面子を4組集めた後は2枚をめくり、同じ牌なら雀頭として獲得します。4面子と雀頭を完成させ、役が成立したプレイヤーがツモ和了します。役がなければ、その席は牌を集め終えてほかの席へ手番が進みます。</p><p><b>和了点</b>は役の翻と手牌の符などから決まります。この局では和了時の最終点数が3倍になります。通常の打牌、鳴き、立直、ロンは行いません。</p><p>ドラと赤ドラは使いません。虹色変化、松竹梅、浄化牌、一期一会、純粋牌を設定で有効にした場合は盤面に現れます。めくった特殊牌は✦で示し、タップすると説明を確認できます。</p></div></div>');
  if (helpOpen) app.querySelector('.memory-game .dialog.info')?.insertAdjacentHTML('beforeend', '<p>最後に作るのは雀頭です。両面待ちにはならないため、平和は成立しません。</p>');
  if (yakuOpen) {
    app.querySelector('.memory-game')?.insertAdjacentHTML('beforeend', '<div class="overlay"><div class="dialog info yaku-dialog"></div></div>');
    mountYakuBrowser(app.querySelector<HTMLElement>('.yaku-dialog')!, settings, roundEvent, true);
  }
  if (cardsOpen) app.querySelector('.memory-game')?.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="dialog info"><button class="close" id="memoryCardsClose" aria-label="能力カードを閉じる">×</button><h2>能力カード</h2>${(players[0].cards ?? []).map(card => `<h3>${cardNames[card]}（${cardStatus(players[0], card)}）</h3><p>${cardDescriptions[card]} ${cardEventNote(card, roundEvent)}</p>`).join('')}</div></div>`);
  document.querySelector('#memoryHelp')?.addEventListener('click', () => { helpOpen = !helpOpen; yakuOpen = false; cardsOpen = false; settingsOpen = false; renderMemory(); });
  document.querySelector('#memoryHelpClose')?.addEventListener('click', () => { helpOpen = false; renderMemory(); });
  document.querySelector('#memoryYaku')?.addEventListener('click', () => { yakuOpen = !yakuOpen; helpOpen = false; cardsOpen = false; settingsOpen = false; renderMemory(); });
  document.querySelector('#memoryYakuClose')?.addEventListener('click', () => { yakuOpen = false; renderMemory(); });
  document.querySelector('#memoryCards')?.addEventListener('click', () => { cardsOpen = !cardsOpen; helpOpen = false; yakuOpen = false; settingsOpen = false; renderMemory(); });
  document.querySelector('#memoryCardsClose')?.addEventListener('click', () => { cardsOpen = false; renderMemory(); });
  app.querySelector('.memory-game .top-actions')?.insertAdjacentHTML('beforeend', '<button id="memorySettings">設定</button>');
  if (settingsOpen) app.querySelector('.memory-game')?.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="dialog info" role="dialog" aria-modal="true" aria-label="演出設定"><button class="close" id="memorySettingsClose" aria-label="設定を閉じる">×</button><h2>設定</h2><label class="check motion-setting"><input type="checkbox" data-motion ${motionPreferred() ? 'checked' : ''}>演出を有効にする</label><p>端末の「動きを減らす」設定が有効な場合は、そちらを優先します。</p></div></div>`);
  document.querySelector('#memorySettings')?.addEventListener('click', () => { settingsOpen = !settingsOpen; helpOpen = false; yakuOpen = false; cardsOpen = false; renderMemory(); });
  document.querySelector('#memorySettingsClose')?.addEventListener('click', () => { settingsOpen = false; renderMemory(); });
  document.querySelector('[data-motion]')?.addEventListener('change', event => { setMotion((event.target as HTMLInputElement).checked); renderMemory(); });
  if (settings.cards && hasCard(players[0], 'near')) {
    app.querySelector('.memory-game .top-actions')?.insertAdjacentHTML('beforeend', `<button id="memoryNear" ${current !== 0 || phase !== 'memory' || memoryLocked || cardUsed(players[0], 'near') ? 'disabled' : ''}>${players[0].nearPinActive ? 'ニアピン発動中' : 'ニアピンを使う'}</button>`);
    document.querySelector('#memoryNear')?.addEventListener('click', () => {
      players[0].nearPinActive = true;
      markCardUsed(players[0], 'near');
      say('ニアピンを発動しました。');
      renderMemory();
    });
  }
  document.querySelectorAll<HTMLElement>('[data-memory-special], .memory-tiles [data-special-id]').forEach(button => button.addEventListener('click', () => {
    const id = Number(button.dataset.memorySpecial ?? button.dataset.specialId);
    const tile = memoryBoard.find(candidate => candidate?.id === id) ?? players.flatMap(player => player.hand).find(candidate => candidate.id === id);
    if (tile) showMemorySpecialInfo(tile, button);
  }));
  document.querySelectorAll<HTMLElement>('[data-memory]').forEach(button => button.addEventListener('click', () => memorySelect(Number(button.dataset.memory))));
  if (helpOpen) document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', tileGuideHtml + specialShapeGuideHtml);
  decorateResult();
  finishVisuals(`memory:${round}`);
  document.querySelector('#memoryNext')?.addEventListener('click', () => { if (result?.title === '対局終了') { phase = 'setup'; setup(); } else startRound(); });
}
function useChange(): void {
  const p = players[0];
  if (!hasCard(p, 'change') || cardUsed(p, 'change') || current !== 0 || selected.size !== 5) return;
  for (const t of p.hand) if (selected.has(t.id)) changeTileKind(t, randomChangeKind(roundEvent), roundEvent);
  markCardUsed(p, 'change'); action = null; selected.clear(); arrangeHand(0); say('千変万化で5枚の牌が変化。'); render();
}
function useTileChange(): void {
  const p = players[0];
  if (current !== 0 || phase !== 'turn' || !activeCard || !['roadroller', 'randomizer'].includes(activeCard) || cardUsed(p, activeCard)) return;
  if (activeCard === 'roadroller' && selected.size !== 3 || activeCard === 'randomizer' && selected.size < 1) return;
  for (const tile of p.hand) if (selected.has(tile.id)) { const kinds = availableKinds(roundEvent, playerCount()); changeTileKind(tile, activeCard === 'roadroller' ? 9 : kinds[Math.floor(Math.random() * kinds.length)], roundEvent); }
  markCardUsed(p, activeCard); action = null; selected.clear(); arrangeHand(0);
  say(`${cardNames[activeCard]}で手牌が変化。`); render();
}
function usePairFestival(): void {
  if (phase !== 'turn' || current !== 0 || action !== 'pairFestival' || selected.size !== 2 || !hasCard(players[0], 'pairFestival')) return;
  const drawn = compressPair(players[0].hand, [...selected], roundEvent, playerCount());
  if (!drawn) return;
  drawnTileId = drawn.id;
  mayTsumo = true;
  action = null; activeCard = null; selected.clear(); arrangeHand(0);
  say(`対子祭り：対子を圧縮し、${tileName(drawn.kind)}を取得。`);
  if (autoOptions.win) { const score = winScore(0, players[0].hand, true); if (score.valid) { settle(0, null, score, true); return; } }
  render();
}
function useBorrow(target: number): void {
  if (target <= 0 || target >= playerCount()) return;
  const p = players[0], other = players[target];
  if (!hasCard(p, 'borrow') || cardUsed(p, 'borrow') || current !== 0 || target === 0 || !other.hand.length) return;
  const i = Math.floor(Math.random() * other.hand.length), [t] = other.hand.splice(i, 1);
  p.hand.push(t); arrangeHand(0); markCardUsed(p, 'borrow'); owedDraw[target]++; extraDiscards = 2; action = null;
  if (other.riichi && !waitsFor(target).length) {
    other.riichi = false; other.doubleRiichi = false; other.openRiichi = false; other.riichiOrder = 0; other.riichiDraws = 0; other.ippatsu = false; other.riichiFuriten = false;
    say(`${names[target]}の立直が解除されました。`);
  }
  say(`${names[target]}から${tileName(t.kind)}を借りパク。追加で1枚打牌します。`); render();
}
function usePickup(target: number, id: number): void {
  const p = players[0];
  if (!hasCard(p, 'pickup') || cardUsed(p, 'pickup') || current !== 0 || target === 0) return;
  const t = takeRiverTile(players[target], id);
  if (!t) return;
  p.hand.push(t); arrangeHand(0); markCardUsed(p, 'pickup'); extraDiscards = 2; action = null; say(`${names[target]}の河から${tileName(t.kind)}を拾いました。追加で1枚打牌します。`); render();
}
function activateCard(card: Card): void {
  const player = players[0];
  if (!hasCard(player, card) || cardUsed(player, card) && card !== 'akuukan' && card !== 'pairFestival' || phase !== 'turn' || current !== 0 || player.riichi || extraDiscards) return;
  if (card === 'near') { player.nearPinActive = true; markCardUsed(player, 'near'); say('ニアピンを発動しました。'); render(); return; }
  if (card === 'pocket') { player.pocketArmed = true; say('ポケットビスケットを発動。次の打牌で2回のツモを予約します。'); render(); return; }
  if (card === 'skeleton') { markCardUsed(player, 'skeleton'); player.skeletonRevealed = playerCount() === 3 ? 15 : 20; skeletonOpen = true; render(); return; }
  activeCard = card;
  action = card === 'change' || card === 'borrow' || card === 'akuukan' || card === 'roadroller' || card === 'randomizer' || card === 'pairFestival' ? card : 'pickup';
  selected.clear(); render();
}
function playerHtml(p: number): string {
  if (!players[p]) return '';
  const x = players[p];
  const river = x.river.map(t => tileHtml(t, { clickable: action === 'pickup' && p !== 0, visualKey: `river:${t.id}` })).join('');
  return `<section class="player player-${p} ${current === p && phase === 'turn' ? 'active' : ''}"><div class="player-head"><span>${names[p]} ${p === dealerSeat(round, playerCount()) ? '<small>親</small>' : ''} ${x.openRiichi ? '<small>オープンリーチ</small>' : x.doubleRiichi ? '<small>ダブル立直</small>' : x.riichi ? '<small>立直</small>' : ''}</span><strong>${x.points.toLocaleString()}<small> 点</small></strong></div>${p ? `<div class="opponent-hand ${x.openRiichi ? 'open' : ''}">${x.hand.map(tile => x.openRiichi ? tileHtml(tile, { concealTrap: true }) : tileHtml({ id: 0, kind: 0 }, { hidden: true })).join('')}</div>` : ''}<div class="river">${river || '<span class="empty">捨牌なし</span>'}</div></section>`;
}
function render(): void {
  document.querySelector('.special-popover')?.remove();
  if (phase === 'setup') { setup(); return; }
  if (roundEvent === 'memory' && (phase === 'memory' || phase === 'result')) { renderMemory(); return; }
  const me = players[0];
  const myTurn = phase === 'turn' && current === 0;
  const kanHand = me.hand.filter(tile => !tile.compressedMate);
  const needed = settings.cards && hasCard(me, 'multipai') ? 15 : 14;
  const tsumo = myTurn && mayTsumo && !extraDiscards && effectiveHand(0).length === needed ? winScore(0, me.hand, true) : null;
  const cardAvailable = settings.cards && myTurn && !riichiPending && !me.riichi && !extraDiscards && !me.used && ['change', 'borrow', 'pickup', 'near', 'akuukan', 'roadroller', 'randomizer'].includes(me.card) && (me.card !== 'akuukan' || wall.length >= 3 && kanHand.length >= 4 && kanHand.some(t => kanHand.filter(x => x.kind === t.kind).length >= 2));
  app.innerHTML = `<main class="shell game"><header class="topbar"><div><div class="eyebrow">HYPERDIMENSIONAL MAHJONG</div><h1>超次元麻雀</h1></div><div class="top-actions"><button data-action="yaku">役一覧</button><button data-action="help">遊び方</button></div></header><div class="status"><span>第${round}局 / 全${settings.rounds}局</span><span>残り ${wall.length}枚</span><span>ドラ表示牌 ${tileGlyph(indicator.kind)} <b>→ ${tileGlyph(doraFromIndicator(indicator.kind))}</b></span></div><div class="table"><div class="upper">${playerHtml(2)}</div><div class="middle"><div>${playerHtml(1)}</div><div class="center"><div class="center-mark">超<br>次元</div><span>${phase === 'turn' ? `${names[current]}の手番` : phase === 'claim' ? 'ロンできます' : '局終了'}</span></div><div>${playerHtml(3)}</div></div><div class="lower">${playerHtml(0)}</div></div><section class="hand-panel"><div class="panel-title"><h2>あなたの手牌</h2><span>${myTurn ? '牌を選んで打牌' : phase === 'claim' ? 'ロンを選択できます' : '手番をお待ちください'}</span></div><div class="hand">${me.hand.map(t => tileHtml(t, { clickable: myTurn, selected: selected.has(t.id), visualKey: `hand:${t.id}` })).join('')}</div><div class="controls">${tsumo?.valid ? '<button class="primary" data-action="tsumo">ツモ和了</button>' : ''}${phase === 'claim' ? '<button class="primary" data-action="ron">ロン和了</button><button data-action="pass">見送る</button>' : ''}${myTurn && action === 'change' ? `<button class="primary" data-action="confirm-change" ${selected.size !== 5 ? 'disabled' : ''}>5枚を変化させる</button><button data-action="cancel">キャンセル</button>` : ''}${myTurn && action === 'borrow' ? [1, 2, 3].map(i => `<button data-borrow="${i}">${names[i]}から取る</button>`).join('') + '<button data-action="cancel">キャンセル</button>' : ''}${myTurn && action === 'pickup' ? '<span>相手の河から牌を選択</span><button data-action="cancel">キャンセル</button>' : ''}${myTurn && !action && cardAvailable ? `<button data-action="card">${cardNames[me.card]}を使う</button>` : ''}</div><div class="ability ${me.used ? 'spent' : ''}"><span class="ability-icon">✦</span><div><small>能力カード ・ ${me.used ? '使用済み' : '発動中 / 使用可能'}</small><strong>${settings.cards ? cardNames[me.card] : 'なし'}</strong><p>${settings.cards ? cardDescriptions[me.card] : 'この対局では能力カードを使用しません。'}</p></div></div></section><aside class="log card"><h3>対局ログ</h3>${log.map(x => `<p>${escape(x)}</p>`).join('')}</aside>${result ? `<div class="overlay"><div class="dialog"><div class="eyebrow">ROUND RESULT</div><h2>${escape(result.title)}</h2>${result.details.map(x => `<p>${escape(x)}</p>`).join('')}<button class="primary" data-action="next">${round >= settings.rounds || result.title === '対局終了' ? '最終結果へ / 新しく始める' : '次の局へ'}</button></div></div>` : ''}${helpOpen ? `<div class="overlay"><div class="dialog info"><button class="close" data-action="help">×</button><h2>遊び方と用語</h2><p>牌を選んで打牌します。14枚で和了形ができ、役があるとツモ・ロンできます。CPUと4局または8局を競います。</p><p><b>翻</b>は役の強さ、<b>符</b>は手牌の形による点数要素です。<b>ドラ</b>は和了点を上げますが、ドラだけでは和了できません。</p><p><b>特殊牌</b>は✦付きの牌です。元の牌として使え、和了時に追加効果を発揮します。<b>能力カード</b>は局ごとに配られます。</p><p>このバージョンは門前進行です。立直、チー、ポン、カンは使えません。</p><h3>特殊牌</h3>${Object.entries(specialNames).map(([id, n]) => `<p>✦ ${n}：${specialHelp[id] || ''}</p>`).join('')}</div></div>` : ''}${yakuOpen ? `<div class="overlay"><div class="dialog info"><button class="close" data-action="yaku">×</button><h2>役一覧</h2><h3>通常役</h3><p>門前清自摸和、断么九、平和、役牌、対々和、七対子、混一色、清一色、国士無双</p><h3>ローカル役</h3><p>現在の対局では無効です。</p><h3>特殊役</h3><p>現在の対局では無効です。</p></div></div>` : ''}</main>`;
  if (helpOpen) {
    const stale = Array.from(document.querySelectorAll<HTMLElement>('.dialog.info p')).find(paragraph => paragraph.textContent?.includes('このバージョンは門前進行です'));
    if (stale) stale.textContent = '立直、チー、ポン、カンを使えます。転調では数牌が変化し、和了時に数牌ボーナス符が加わります。';
  }
  if (playerCount() === 3) {
    document.querySelector('main')?.classList.add('sanma');
    document.querySelector('.status')?.insertAdjacentHTML('beforeend', '<span>三人打ち</span>');
    document.querySelector('[data-borrow="3"]')?.remove();
    document.querySelectorAll('.player-head small').forEach(mark => { if (mark.textContent === '親') mark.remove(); });
    document.querySelector(`.player-${(round - 1) % 3} .player-head span`)?.insertAdjacentHTML('beforeend', ' <small>親</small>');
  }
  if (phase === 'claim') {
    const skip = document.querySelector<HTMLElement>('[data-action="pass"]');
    if (skip) skip.textContent = 'スキップ';
    if (pending?.chankan) document.querySelector('.panel-title span')!.textContent = `加槓された${tileName(pending.tile.kind)}でロンできます`;
  }
  document.querySelector('[data-action="card"]')?.remove();
  if (settings.cards) {
    document.querySelector('.ability strong')!.textContent = (me.cards ?? [me.card]).map(card => `${cardNames[card]}（${cardStatus(me, card)}）`).join(' / ') || 'なし';
    document.querySelector('.ability p')!.textContent = (me.cards ?? [me.card]).map(card => [cardDescriptions[card], cardEventNote(card, roundEvent)].filter(Boolean).join(' ')).join(' ') || 'この局では能力カードが配られませんでした。';
    document.querySelector('.ability small')!.textContent = `能力カード ・ ${(me.cards ?? [me.card]).length}枚`;
  } else {
    document.querySelector('.ability small')!.textContent = '能力カード ・ 0枚';
  }
  document.querySelector('.ability')?.classList.remove('spent');
  if (settings.cards && myTurn && !action && !riichiPending && !me.riichi && !extraDiscards) {
    const usable: Card[] = ['change', 'borrow', 'pickup', 'near', 'akuukan', 'roadroller', 'randomizer', 'pocket', 'skeleton', 'pairFestival'];
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', (me.cards ?? [me.card]).filter(card => usable.includes(card) && (!cardUsed(me, card) || card === 'akuukan' || card === 'pocket' || card === 'pairFestival') && (card !== 'akuukan' || !autoOptions.noKan && wall.length >= 3 && kanHand.length >= 4 && kanHand.some(tile => kanHand.filter(other => other.kind === tile.kind).length >= 2)) && (card !== 'pairFestival' || me.hand.some(tile => !tile.compressedMate && me.hand.some(other => other.id !== tile.id && !other.compressedMate && other.kind === tile.kind)))).map(card => `<button data-card="${card}">${cardNames[card]}を使う</button>`).join(''));
  }
  if ((me.skeletonRevealed ?? 0) > 0) document.querySelector('.top-actions')?.insertAdjacentHTML('beforeend', '<button data-action="skeleton">山を見る</button>');
  if (skeletonOpen && (me.skeletonRevealed ?? 0) > 0) {
    const firstSeat = (current + (phase === 'finale' ? 0 : 1)) % playerCount();
    const tiles = drawPreview(wall, players, firstSeat, me.skeletonRevealed!, roundEvent, owedDraw, phase !== 'finale').map(({ tile, seat, reservedKind, additional }) => {
      return `<div class="preview-tile"><small>${names[seat]}${additional ? '・追加ツモ' : ''}</small>${tileHtml(tile, { concealTrap: true })}${reservedKind === undefined ? '' : `<b>→${tileName(reservedKind)}</b>`}</div>`;
    }).join('');
    document.querySelector('main')?.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="dialog info"><button class="close" data-action="skeleton">×</button><h2>スケスケルトン：これからの山</h2><p>現在のツモ順での取得予定です。鳴き・カン・北抜きなどで順番が変わると、表示も変わります。</p><div class="skeleton-tiles">${tiles}</div></div></div>`);
  }
  if (yakuOpen) {
    const dialog = Array.from(document.querySelectorAll<HTMLElement>('.dialog.info')).find(element => element.querySelector('h2')?.textContent === '役一覧');
    if (dialog) {
      dialog.classList.add('yaku-dialog');
      mountYakuBrowser(dialog, settings, roundEvent);
    }
  }
  if (roundEvent !== 'none') document.querySelector('.status')?.insertAdjacentHTML('beforeend', `<span>局イベント <b>${eventName(roundEvent)}</b></span>`);
  const doraLabel = document.querySelector<HTMLElement>('.status span:nth-child(3) b');
  if (doraLabel?.parentElement) {
    const doraKind = doraFromIndicator(indicator.kind, roundEvent, playerCount(), tenchouShifts > 0);
    const badge = doraLabel.parentElement;
    badge.classList.add('dora-status');
    badge.setAttribute('aria-label', `ドラ表示牌：${tileName(indicator.kind)}。ドラ：${tileName(doraKind)}`);
    badge.innerHTML = `<i class="dora-face">${tileFaceHtml(indicator.kind)}</i>`;
  }
  if (phase === 'finale') document.querySelector('.center span')!.textContent = `フィナーレ：次は${names[current]}の公開ツモ`;
  if (phase === 'finale') document.querySelector('.status')?.insertAdjacentHTML('afterend', `<section class="finale-preview card"><strong>フィナーレの残り牌</strong><div class="finale-tiles">${wall.slice().reverse().map(tile => tileHtml(tile)).join('')}</div></section>`);
  if (kanIndicators.length) document.querySelector('.status')?.insertAdjacentHTML('beforeend', `<span class="dora-status" aria-label="槓ドラ表示牌">${kanIndicators.map(t => `<i class="dora-face">${tileFaceHtml(t.kind)}</i>`).join('')}</span>`);
  for (let seat = 0; seat < playerCount(); seat++) if (players[seat].kans?.length) {
    const kanHtml = players[seat].kans!.map(kan => `<div class="kan-group">${kan.map(tile => tileHtml(tile)).join('')}</div>`).join('');
    document.querySelector(`.player-${seat}`)?.insertAdjacentHTML('beforeend', `<div class="kans">暗槓 ${kanHtml}</div>`);
  }
  for (let seat = 0; seat < playerCount(); seat++) if (players[seat].openMelds?.length) {
    const meldHtml = players[seat].openMelds!.map(meld => `<div class="kan-group">${meld.tiles.map(tile => tileHtml(tile)).join('')}</div>`).join('');
    document.querySelector(`.player-${seat}`)?.insertAdjacentHTML('beforeend', `<div class="kans">副露 ${meldHtml}</div>`);
  }
  if (playerCount() === 3) for (let seat = 0; seat < playerCount(); seat++) if (players[seat].northTiles?.length) {
    document.querySelector(`.player-${seat}`)?.insertAdjacentHTML('beforeend', `<div class="kans">北抜き ${players[seat].northTiles!.length}枚</div>`);
  }
  if (phase === 'call' && pendingCall) {
    const controls = document.querySelector('.controls');
    if (!callStage) {
      const types = [...new Set(pendingCall.options.map(option => option.type))];
      controls?.insertAdjacentHTML('beforeend', types.map(type => `<button class="primary" data-call-type="${type}">${type === 'chi' ? 'チー' : type === 'pon' ? 'ポン' : 'カン'}</button>`).join('') + '<button data-action="pass-call">スキップ</button>');
      document.querySelector('.panel-title span')!.textContent = '鳴きのアクションを選択';
    } else {
      controls?.insertAdjacentHTML('beforeend', pendingCall.options.map((option, index) => {
        if (option.type !== callStage) return '';
        const tiles = [...option.handIds.map(id => players[0].hand.find(tile => tile.id === id)!), pendingCall!.tile];
        return `<button class="call-candidate" data-call="${index}"><span>${escape(option.label)}</span><span class="candidate-tiles">${tiles.map(tile => `<span class="candidate-tile ${tile.special ? 'special' : ''} ${tile.red ? 'red' : ''}">${tileFaceHtml(tile.kind, tile.red)}${tile.special ? '<b>✦</b>' : ''}${tile.red ? '<b>赤</b>' : ''}</span>`).join('')}</span></button>`;
      }).join('') + '<button data-action="back-call">戻る</button><button data-action="pass-call">スキップ</button>');
      document.querySelector('.panel-title span')!.textContent = '鳴き方を選択';
    }
  }
  if (phase === 'claim' && pendingCall && pending?.winners.every(winner => winner.seat === 0)) {
    const types = [...new Set(pendingCall.options.map(option => option.type))];
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', types.map(type => `<button data-call-type="${type}">${type === 'chi' ? 'チー' : type === 'pon' ? 'ポン' : 'カン'}</button>`).join(''));
    const skip = document.querySelector<HTMLElement>('[data-action="pass"]');
    if (skip) skip.textContent = 'スキップ';
    document.querySelector('.panel-title span')!.textContent = 'ロン・鳴き・スキップを選択';
  }
  document.querySelector('.top-actions')?.insertAdjacentHTML('beforeend', '<button data-action="settings">設定</button>');
  document.querySelector('.top-actions')?.insertAdjacentHTML('beforeend', '<button data-action="log">ログ</button>');
  if (settings.cards) document.querySelector('.top-actions')?.insertAdjacentHTML('beforeend', '<button data-action="cards-info">カード</button>');
  if (settingsOpen) {
    const threePlayer = playerCount() === 3;
    const northDescription = threePlayer
      ? '北抜きは北を抜いて補充牌を引きます。和了時は1枚につき1翻です。'
      : '自動北抜きは三人打ちで使用できます。';
    document.querySelector('main')?.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="dialog info"><button class="close" data-action="settings">×</button><h2>対局中の設定</h2><div class="auto-settings">${([['noCalls','鳴きなし'],['noKan','カンなし'],['tsumogiri','ツモ切り'],['sort','自動理牌'],['win','自動和了'],['north','自動北抜き（三人麻雀用）']] as const).map(([key,label]) => `<label><input type="checkbox" data-auto="${key}" ${autoOptions[key] ? 'checked' : ''} ${key === 'north' && !threePlayer ? 'disabled' : ''}>${label}</label>`).join('')}</div><p>${northDescription}</p></div></div>`);
  }
  if (logOpen) document.querySelector('main')?.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="dialog info"><button class="close" data-action="log">×</button><h2>対局ログ</h2>${log.map(line => `<p>${escape(line)}</p>`).join('')}</div></div>`);
  if (cardsOpen) document.querySelector('main')?.insertAdjacentHTML('beforeend', `<div class="overlay"><div class="dialog info"><button class="close" data-action="cards-info">×</button><h2>能力カード</h2>${(me.cards ?? [me.card]).map(card => `<h3>${cardNames[card]}（${cardStatus(me, card)}）</h3><p>${cardDescriptions[card]} ${cardEventNote(card, roundEvent)}</p>`).join('')}</div></div>`);
  if (phase === 'warning' && dangerDiscardId !== null) {
    document.querySelector('.panel-title span')!.textContent = '危機感知：この打牌で放銃する可能性があります';
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', '<button class="primary" data-action="confirm-danger">そのまま打牌</button><button data-action="cancel-danger">別の牌を選ぶ</button>');
  }
  if (phase === 'claim' && trapRonWarned) {
    document.querySelector('.panel-title span')!.textContent = '危機感知：この牌はトラップです';
    const ronButton = document.querySelector<HTMLElement>('[data-action="ron"]');
    if (ronButton) ronButton.textContent = 'トラップを承知してロン';
  }
  if (myTurn && (action === 'roadroller' || action === 'randomizer')) {
    const ready = action === 'roadroller' ? selected.size === 3 : selected.size > 0;
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', `<span>${action === 'roadroller' ? '一筒にする3枚を選択' : 'ランダムに変化させる牌を選択'}</span><button class="primary" data-action="confirm-tile-change" ${ready ? '' : 'disabled'}>牌を変化させる</button><button data-action="cancel">キャンセル</button>`);
  }
  if (myTurn && action === 'pairFestival') {
    const chosen = [...selected].map(id => me.hand.find(tile => tile.id === id)!);
    const ready = chosen.length === 2 && chosen[0].kind === chosen[1].kind && chosen.every(tile => !tile.compressedMate);
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', `<span>同じ牌2枚を選択</span><button class="primary" data-action="confirm-pair" ${ready ? '' : 'disabled'}>対子を圧縮する</button><button data-action="cancel">キャンセル</button>`);
  }
  if (myTurn && !action && !extraDiscards && !me.riichi && !autoOptions.noKan && wall.length >= 3 && kanHand.some(t => kanHand.filter(x => x.kind === t.kind).length >= 4)) {
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', '<button data-action="kan">暗槓する</button>');
  }
  if (playerCount() === 3 && myTurn && !action && wall.length && !autoOptions.north) {
    const norths = me.hand.filter(tile => tile.kind === 30 && !tile.compressedMate);
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', norths.map(tile => `<button data-north="${tile.id}">北を抜く</button>`).join(''));
  }
  if (myTurn && !action && !extraDiscards && !me.riichi && !autoOptions.noKan && wall.length >= 3) {
    const addable = kanHand.filter(tile => me.openMelds?.some(meld => meld.type === 'pon' && meld.tiles[0].kind === tile.kind));
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', addable.map(tile => `<button data-added-kan="${tile.id}">${tileName(tile.kind)}で加槓${tile.special ? `（${specialNames[tile.special]}）` : ''}${tile.red ? '（赤ドラ）' : ''}</button>`).join(''));
  }
  if (myTurn && (action === 'kan' || action === 'akuukan')) {
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', `<span>${action === 'akuukan' ? '同じ牌2枚と任意の2枚を選択' : '同じ牌4枚を選択'}</span><button class="primary" data-action="confirm-kan" ${selected.size !== 4 ? 'disabled' : ''}>暗槓を成立させる</button><button data-action="cancel">キャンセル</button>`);
  }
  if (myTurn && !action && !extraDiscards && !me.riichi && !me.openMelds?.length && me.points >= 1000n && effectiveHand(0).length === needed && me.hand.some(t => waitsFor(0, effectiveHand(0, me.hand.filter(x => x.id !== t.id))).length)) {
    document.querySelector('.controls')?.insertAdjacentHTML('beforeend', `<button data-action="riichi">${riichiPending ? '立直をやめる' : '立直を宣言して打牌'}</button>`);
    if (settings.openRiichi) document.querySelector('.controls')?.insertAdjacentHTML('beforeend', `<button data-action="open-riichi">${openRiichiPending ? 'オープンリーチをやめる' : 'オープンリーチを宣言して打牌'}</button>`);
  }
  if (myTurn && me.riichi) document.querySelector('.panel-title span')!.textContent = '立直中：ツモ牌を打牌';
  if (riichiPending) document.querySelector('.panel-title span')!.textContent = '聴牌になる牌を選んで打牌';
  if (action === 'kan' || action === 'akuukan') document.querySelector('.panel-title span')!.textContent = '槓にする4枚を選択';
  if (myTurn && extraDiscards > 0) document.querySelector('.panel-title span')!.textContent = `追加の打牌：あと${extraDiscards}枚`;
  if (hasCard(me, 'near') && me.nearPinActive) document.querySelector('.ability')?.classList.remove('spent');
  if (helpOpen) {
    if (playerCount() === 3) {
      const intro = document.querySelector<HTMLElement>('.dialog.info p');
      if (intro) intro.textContent = '牌を選んで打牌します。14枚で和了形ができ、役があるとツモ・ロンできます。CPU 2人と対局します。北抜きは補充牌を引き、和了時に1枚1翻を加えます。';
    }
    const oldRules = Array.from(document.querySelectorAll<HTMLElement>('.dialog.info p')).find(p => p.textContent?.includes('立直、チー'));
    if (oldRules) oldRules.textContent = '聴牌できる門前の手牌では立直を宣言できます。同じ牌4枚で暗槓、亜空槓では同じ牌2枚と任意の2枚で暗槓できます。局イベントは対局設定で選べます。';
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p><b>副露</b>は他家の打牌を使って組を作ることです。上家からはチー、他家からはポン・明槓ができます。ポンした組へ4枚目を加えると<b>加槓</b>です。副露すると門前限定の役は得られません。カンでは嶺上牌を引き、槓ドラが増えます。相手の加槓牌でロンする<b>槍槓</b>は1翻です。</p>');
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p><b>和了点</b>は和了によって移動する点数です。役とドラの翻、手牌の符、親か子か、特殊効果で決まります。</p>');
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', `<p><b>フィナーレ</b>では山の残り${finaleTileCount(playerCount())}牌を順に公開します。各牌で全員のツモ和了を判定し、同じ人も繰り返し和了できます。</p>`);
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p><b>トランプマジック</b>では字牌がなくなり、各数牌に10～13が加わります。13の次のドラは1です。1～13と同じ色の1枚で超一気通貫、両端が刻子牌なら門前で十三連宝燈になります。</p>');
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p><b>転調</b>では対局の最初に親だったプレイヤーのツモ番開始時、1～10巡目は10%、11巡目以降は50%で場の数牌の数字が1つ進みます。9の次は1です。和了時は数牌1枚ごとに数字×100符を加えます。</p>');
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p><b>トランプマジック</b>でも数牌1枚ごとに数字×100符を加えます。その局のカンが奇数回なら<b>革命</b>で3が1300符・2が100符、2回以上の偶数回なら<b>革命返し</b>で2が1300符・3が100符になります。</p>');
    document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p><b>オープンリーチ</b>は対局設定で有効にできます。2翻で、宣言時に手牌を公開します。先に立直していない相手が放銃すると、その和了は役満扱いになります。トラップ牌の正体は打牌まで伏せます。</p>');
  }
  if (helpOpen) document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', tileGuideHtml + specialShapeGuideHtml);
  if (helpOpen) document.querySelector('.dialog.info')?.insertAdjacentHTML('beforeend', '<p>卓の左上には<b>ドラ表示牌</b>を表示します。通常は表示牌の次の牌がドラです。カンをすると槓ドラ表示牌が増えます。<b>河</b>は捨てた牌を並べる場所で、卓の中央を囲む四方向に表示します。ツモ牌は手牌の右端に離して表示します。左下の能力カードを押すと、効果と現在の状態を確認できます。</p>');
  if (settingsOpen) document.querySelector('.auto-settings')?.parentElement?.insertAdjacentHTML('beforeend', `<label class="check motion-setting"><input type="checkbox" data-motion ${motionPreferred() ? 'checked' : ''}>演出を有効にする</label>`);
  document.querySelector('[data-motion]')?.addEventListener('change', event => { setMotion((event.target as HTMLInputElement).checked); render(); });
  const drawn = current === 0 && phase === 'turn' && mayTsumo ? document.querySelector<HTMLElement>(`.hand [data-tile="${drawnTileId}"]`) : null;
  if (drawn) {
    drawn.classList.add('drawn');
    drawn.insertAdjacentHTML('beforeend', '<b class="drawn-mark">ツモ</b>');
    document.querySelector('.hand')!.append(drawn);
  }
  const table = document.querySelector('.table')!;
  table.append(document.querySelector('.hand-panel')!);
  const footer = document.createElement('div');
  footer.className = 'table-footer';
  footer.innerHTML = '<section class="table-melds" aria-label="あなたの副露とカン"><strong>副露・カン</strong></section>';
  footer.prepend(document.querySelector('.ability')!);
  const meldArea = footer.querySelector('.table-melds')!;
  document.querySelectorAll('.player-0 .kans').forEach(group => meldArea.append(group));
  if (!meldArea.querySelector('.kans')) meldArea.insertAdjacentHTML('beforeend', '<span class="empty">なし</span>');
  table.append(footer);
  if (lastDiscardId !== null) document.querySelector(`[data-visual-key="river:${lastDiscardId}"]`)?.classList.add('last-discard');
  const center = document.querySelector('.center');
  center?.classList.toggle('your-turn', myTurn);
  document.querySelector('.center-mark')?.insertAdjacentHTML('afterend', `<small class="table-round">第${round}局</small>`);
  arrangeTableLayout(table, myTurn);
  decorateResult();
  finishVisuals(`table:${round}`);
  bind();
}
function decorateResult(): void {
  const dialog = document.querySelector<HTMLElement>('.dialog:not(.info):has([data-action="next"]), .dialog:has(#memoryNext)');
  if (!dialog || !result) return;
  dialog.classList.add('result-dialog');
  if (result.hands?.length) {
    const html = result.hands.map((hand, handIndex) => `<section class="result-hand" aria-label="${escape(hand.label)}の和了形"><h3>${escape(hand.label)} <small>${escape(hand.shape)}</small></h3><div class="result-tiles">${hand.tiles.map((tile, index) => `<span class="result-tile">${tileHtml(tile, { visualKey: `result:hand:${handIndex}:${index}` })}${tile.virtual ? `<b class="virtual-mark">${tile.compressedVirtual ? '◇' : '＊'}</b>` : ''}</span>`).join('')}</div>${hand.tiles.some(tile => tile.virtual) ? '<small class="result-legend">＊：刻子牌の効果で数える牌　◇：圧縮牌の2枚目</small>' : ''}</section>`).join('');
    dialog.querySelector('h2')?.insertAdjacentHTML('afterend', `<div class="result-hands">${html}</div>`);
  }
  const paragraphs = dialog?.querySelectorAll<HTMLElement>('p') ?? [];
    window.clearTimeout(resultTimer);
    if (!motionEnabled()) resultAnimating = false;
    paragraphs.forEach((paragraph, index) => {
      if (resultAnimating && index >= resultStage) paragraph.style.display = 'none';
      const line = paragraph.textContent ?? '';
      const notes = [
        line.includes('一期一会') ? '一期一会により1翻の役が5翻に変化' : '',
        line.includes('役満ボディ') ? '役満ボディにより役満の翻数が2倍' : '',
        line.includes('浄化牌') ? '浄化牌により混系の役が純系の役へ変化' : '',
        line.includes('純粋牌') ? '純粋牌により清一色・緑一色・字一色・一色三連の翻数が3倍' : '',
        line.includes('ニアピン') ? 'ニアピンにより役の翻数が半分（切り捨て・最低1翻）に変化' : '',
        line.includes('鬼に金棒') ? '鬼に金棒により最高翻の役1つを成立役数倍に変化' : '',
        line.includes('下克上') ? '下克上によりオーラス最下位の成立役をそれぞれ13翻へ変化' : '',
        line.includes('タンヤオ32000点') ? 'タンヤオ32000点により2～5だけで作った断么九を13翻へ変化' : '',
      ].filter(Boolean);
      if (notes.length) { paragraph.dataset.scoreNote = notes.join('。'); paragraph.tabIndex = 0; }
    });
    const next = dialog?.querySelector<HTMLElement>('[data-action="next"], #memoryNext');
    if (resultAnimating) {
      if (next && resultStage < paragraphs.length) next.style.display = 'none';
      window.clearTimeout(resultTimer);
      if (resultStage < paragraphs.length) resultTimer = window.setTimeout(() => { resultStage++; render(); }, 380);
      else resultAnimating = false;
    }
  if (resultAnimating) {
    const skip = document.createElement('button');
    skip.type = 'button'; skip.className = 'result-skip'; skip.textContent = '演出をスキップ';
    skip.addEventListener('click', () => { window.clearTimeout(resultTimer); resultAnimating = false; render(); });
    dialog.append(skip);
  }
  if (roundEvent === 'memory') dialog.querySelectorAll<HTMLElement>('[data-score-note]').forEach(element => {
    const show = () => showScoreNote(element.dataset.scoreNote!, element);
    element.addEventListener('mouseenter', show);
    element.addEventListener('mouseleave', () => document.querySelector('.special-popover')?.remove());
    element.addEventListener('click', show);
    element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
  });
  if (!resultAnimating && result.title !== '対局終了' && roundStartingPoints.length === players.length) {
    const rows = players.map((player, seat) => {
      const change = player.points - roundStartingPoints[seat];
      return `<tr><th scope="row">${escape(names[seat])}</th><td class="${change > 0n ? 'point-gain' : change < 0n ? 'point-loss' : ''}" data-point-change="${change}">${change > 0n ? '+' : ''}${change.toLocaleString()}</td><td>${player.points.toLocaleString()}</td></tr>`;
    }).join('');
    dialog.querySelector('[data-action="next"], #memoryNext')?.insertAdjacentHTML('beforebegin', `<section class="result-points"><h3>この局の点数移動</h3><table aria-label="この局の点数移動"><thead><tr><th scope="col">プレイヤー</th><th scope="col">増減</th><th scope="col">持ち点</th></tr></thead><tbody>${rows}</tbody></table><small>立直供託・聴牌料を含む、局開始時からの増減です。</small></section>`);
  }

  const title = dialog.querySelector<HTMLElement>('h2');
  if (title) { title.dataset.visualKey = 'result:title'; title.dataset.face = result.title; }
  dialog.querySelectorAll<HTMLElement>('p').forEach((paragraph, index) => {
    if (paragraph.style.display === 'none') return;
    paragraph.dataset.visualKey = `result:line:${index}`;
    paragraph.dataset.face = paragraph.textContent ?? '';
  });
}

const specialHelp: Record<string, string> = {
  knockout: 'ロン和了の最終和了点が門前なら5倍、副露後なら3倍。', rainbow: '和了時に最も高い点になる通常牌へ変化。', musou: '国士無双の和了点が10倍。',
  shochikubai: '和了形の索子1枚につき10符を加算。', purify: '混一色・混老頭・混全帯幺九を対応する純系の役に変換。', ichigo: '1翻の役を5翻として扱う。',
  pure: '清一色・緑一色・字一色・一色三連の翻数が3倍。', drumming: 'ドラ1枚を2翻として扱い、含まれる槓の4枚すべてをドラにする。',
  irregular: '最初に場へ4枚現れた牌種に変化し、和了時に20翻を加算。', zombie: '手牌にある間、打牌ごとに30%で別の手牌を自身と同じ牌種のゾンビ牌に変える。', destiny: 'この牌でツモ和了したとき、最終和了点が5倍。', trap: 'この牌でロンされると、和了者が打牌者へ和了点を支払う。', triplet: '1枚で刻子を作り、余る2枚を和了形から外す。副露で使うと効果を失う。',
};
function placePopover(popup: HTMLElement, anchor: HTMLElement): void {
  document.body.append(popup);
  const bounds = anchor.getBoundingClientRect();
  const size = popup.getBoundingClientRect();
  const left = Math.max(8, Math.min(bounds.left + bounds.width / 2 - size.width / 2, innerWidth - size.width - 8));
  // Prefer above; near the upper edge, use a free side or below without covering the tile.
  let top = bounds.top - size.height - 16;
  let side = left;
  if (top < 8) {
    top = Math.max(8, Math.min(bounds.top, innerHeight - size.height - 8));
    if (bounds.right + size.width + 16 <= innerWidth - 8) side = bounds.right + 16;
    else if (bounds.left - size.width - 16 >= 8) side = bounds.left - size.width - 16;
    else top = bounds.bottom + 16;
  }
  popup.style.left = `${side}px`;
  popup.style.top = `${top}px`;
}

function arrangeTableLayout(table: Element, myTurn: boolean): void {
  const arena = document.createElement('div');
  arena.className = 'table-arena';
  table.prepend(arena);
  for (const selector of ['.upper', '.middle', '.lower']) arena.append(table.querySelector(selector)!);
  arena.querySelectorAll<HTMLElement>('.player').forEach(player => {
    const seat = Number(Array.from(player.classList).find(name => /^player-\d$/.test(name))!.slice(-1));
    const head = player.querySelector<HTMLElement>('.player-head')!;
    head.classList.add('seat-badge', `seat-${seat}`);
    head.classList.toggle('active', current === seat && phase === 'turn');
    arena.append(head);
    if (seat !== 0 && player.querySelector('.kans')) {
      const melds = document.createElement('div');
      melds.className = `opponent-melds meld-seat-${seat}`;
      player.querySelectorAll('.kans').forEach(group => melds.append(group));
      arena.append(melds);
    }
  });
  const center = arena.querySelector('.center')!;
  center.querySelector('.center-mark')?.remove();
  center.querySelector('.table-round')?.remove();
  const summary = document.createElement('div');
  summary.className = 'table-summary';
  summary.innerHTML = `<strong>第${round}局<small> / ${settings.rounds}</small></strong><span class="wall-count">残り ${wall.length}</span>`;
  center.prepend(summary);
  const status = document.querySelector('.status')!;
  status.classList.add('table-info');
  // The central counter replaces the two duplicate status labels.
  status.children[1]?.remove();
  status.children[0]?.remove();
  table.append(status);
  const heading = document.querySelector<HTMLElement>('.panel-title')!;
  heading.querySelector('h2')?.remove();
  heading.classList.toggle('action-prompt', !!action || !!extraDiscards || riichiPending || phase === 'call' || phase === 'claim' || phase === 'warning');
  const topbar = document.querySelector('.game .topbar')!;
  topbar.querySelector(':scope > div:first-child')?.remove();
  for (const [key, icon, label] of [['settings', '⚙', '設定'], ['help', '?', '遊び方'], ['yaku', '役', '役一覧'], ['log', '≡', '対局ログ'], ['cards-info', '✦', '能力カード']] as const) {
    const button = topbar.querySelector<HTMLElement>(`[data-action="${key}"]`);
    if (button) { button.textContent = icon; button.setAttribute('aria-label', label); }
  }
  document.querySelector('.table-melds > strong')?.remove();
  document.querySelector('.table-melds > .empty')?.remove();
  document.querySelector('.table-melds')?.classList.toggle('no-melds', !document.querySelector('.table-melds .kans'));
  const ability = document.querySelector('.ability')!;
  ability.classList.toggle('no-cards', !settings.cards || !meCardCount());
  if (settings.cards) {
    const faces = document.createElement('div');
    faces.className = 'ability-faces';
    faces.innerHTML = (players[0].cards ?? [players[0].card]).map(card => `<button data-action="cards-info" class="ability-face ${cardUsed(players[0], card) ? 'used' : ''}" aria-label="${escape(`${cardNames[card]}：${cardStatus(players[0], card)}。説明を開く`)}"><span>✦</span><b>${cardNames[card]}</b></button>`).join('');
    ability.append(faces);
  }
  table.classList.toggle('your-turn', myTurn);
  function meCardCount(): number { return (players[0].cards ?? [players[0].card]).length; }
}

function showSpecialInfo(tile: Tile, anchor: HTMLElement): void {
  document.querySelector('.special-popover')?.remove();
  if (!tile.special) return;
  const conditions: Record<string, string> = {
    knockout: 'ロン和了時', rainbow: '和了判定時', musou: '么九牌を保ち、国士無双で和了した時',
    shochikubai: '和了形に索子がある時', purify: '対応する混系の役で和了した時', ichigo: '1翻の役で和了した時',
    pure: '清一色・緑一色・字一色・一色三連で和了した時', drumming: 'この牌を含むカン、またはドラを含む和了時',
    irregular: '場に同じ牌種が最初に4枚現れた時', zombie: '自分の打牌時', destiny: 'この牌をツモ和了牌にした時',
    trap: 'この牌を打牌し、相手にロンされた時', triplet: '和了判定時。副露に使うと失効',
  };
  const inHand = players.some(player => player.hand.some(handTile => handTile.id === tile.id));
  const inRiver = players.some(player => player.river.some(discarded => discarded.id === tile.id));
  const state = specialStatus(tile, { inHand, inRiver, event: roundEvent, irregularKind, drawnTileId: phase === 'turn' && mayTsumo ? drawnTileId : undefined, ronTileId: phase === 'claim' ? pending?.tile.id : undefined });
  const popup = document.createElement('div');
  popup.className = 'special-popover';
  popup.innerHTML = `<strong>${specialNames[tile.special]}</strong><p>${specialHelp[tile.special] || ''}</p><small>発動条件：${conditions[tile.special]}<br>牌種：${tileName(tile.kind)} / 現在の状態：${state}</small>`;
  placePopover(popup, anchor);
}
function showScoreNote(message: string, anchor: HTMLElement): void {
  document.querySelector('.special-popover')?.remove();
  const popup = document.createElement('div');
  popup.className = 'special-popover';
  popup.innerHTML = `<strong>変更要因</strong><p>${escape(message)}</p>`;
  placePopover(popup, anchor);
}
function bind(): void {
  document.querySelectorAll<HTMLElement>('[data-score-note]').forEach(el => {
    const message = el.dataset.scoreNote!;
    el.addEventListener('mouseenter', () => showScoreNote(message, el));
    el.addEventListener('mouseleave', () => document.querySelector('.special-popover')?.remove());
    el.addEventListener('click', () => showScoreNote(message, el));
    el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showScoreNote(message, el); } });
  });
  document.querySelectorAll<HTMLElement>('[data-special-id]').forEach(el => {
    const id = Number(el.dataset.specialId);
    const tile = [...wall, ...players.flatMap(player => [...player.hand, ...player.river, ...(player.kans ?? []).flat(), ...(player.openMelds ?? []).flatMap(meld => meld.tiles), ...(player.northTiles ?? [])])].find(tile => tile.id === id);
    if (!tile) return;
    el.addEventListener('mouseenter', () => showSpecialInfo(tile, el));
    el.addEventListener('mouseleave', () => document.querySelector('.special-popover')?.remove());
    el.addEventListener('focus', () => showSpecialInfo(tile, el));
    el.addEventListener('blur', () => document.querySelector('.special-popover')?.remove());
    if (el.hasAttribute('data-special-inspect')) el.addEventListener('click', () => showSpecialInfo(tile, el));
  });
  document.querySelectorAll<HTMLElement>('[data-call-type]').forEach(el => el.addEventListener('click', () => {
    if (!pendingCall) return;
    const type = el.dataset.callType as OpenMeld['type'];
    if (autoOptions.noCalls || autoOptions.noKan && type === 'kan' || !pendingCall.options.some(option => option.type === type)) return;
    if (phase === 'claim') {
      players[0].temporaryFuriten = true;
      if (players[0].riichi) players[0].riichiFuriten = true;
      pending = null;
      phase = 'call';
    }
    const matching = pendingCall.options.map((option, index) => ({ option, index })).filter(item => item.option.type === type);
    if (matching.length === 1) claimMeld(matching[0].index);
    else { callStage = type; render(); }
  }));
  document.querySelectorAll<HTMLInputElement>('[data-auto]').forEach(el => el.addEventListener('change', () => {
    const key = el.dataset.auto as keyof typeof autoOptions;
    autoOptions[key] = el.checked;
    if (key === 'north' && el.checked && playerCount() === 3 && phase === 'turn' && current === 0) {
      autoExtractNorth(0);
      if (autoOptions.win && mayTsumo) {
        const score = winScore(0, players[0].hand, true);
        if (score.valid) { settingsOpen = false; settle(0, null, score, true); return; }
      }
    }
    if (key === 'sort' && el.checked) arrangeHand(0);
    if (key === 'noKan' && el.checked) {
      if (action === 'kan' || action === 'akuukan') { action = null; selected.clear(); }
      if (pendingCall) {
        pendingCall.options = pendingCall.options.filter(option => option.type !== 'kan');
        if (callStage === 'kan') callStage = null;
        if (!pendingCall.options.length) {
          const { tile, from } = pendingCall;
          pendingCall = null;
          if (phase === 'call') { phase = 'turn'; if (!resumeExtraDiscard(from) && !tryCpuCall(tile, from)) nextTurn(); return; }
        }
      }
    }
    if (key === 'noCalls' && el.checked && pendingCall) {
      const { tile, from } = pendingCall;
      pendingCall = null; callStage = null;
      if (phase === 'claim') { render(); return; }
      phase = 'turn'; if (!resumeExtraDiscard(from) && !tryCpuCall(tile, from)) nextTurn(); return;
    }
    if (key === 'win' && el.checked) {
      if (phase === 'turn' && current === 0 && mayTsumo && !extraDiscards) {
        const score = winScore(0, players[0].hand, true);
        if (score.valid) { settingsOpen = false; settle(0, null, score, true); return; }
      }
      if (phase === 'claim' && pending?.winners.some(winner => winner.seat === 0)
        && !(pending.tile.special === 'trap' && settings.cards && hasCard(players[0], 'danger') && (players[0].dangerUses ?? 0) < 2)) {
        const { winners, from, chankan, tile } = pending;
        settingsOpen = false;
        settleMultipleRon(winners, from, chankan ? tile : undefined);
        return;
      }
    }
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-card]').forEach(el => el.addEventListener('click', () => activateCard(el.dataset.card as Card)));
  document.querySelectorAll<HTMLElement>('[data-added-kan]').forEach(el => el.addEventListener('click', () => startAddedKan(0, Number(el.dataset.addedKan))));
  document.querySelectorAll<HTMLElement>('[data-north]').forEach(el => el.addEventListener('click', () => {
    if (!extractNorth(0, Number(el.dataset.north))) return;
    if (autoOptions.win) {
      const score = winScore(0, players[0].hand, true);
      if (score.valid) { settle(0, null, score, true); return; }
    }
    render();
  }));
  document.querySelectorAll<HTMLElement>('[data-call]').forEach(el => el.addEventListener('click', () => claimMeld(Number(el.dataset.call))));
  document.querySelectorAll<HTMLElement>('[data-tile]').forEach(el => el.addEventListener('click', event => {
    const id = Number(el.dataset.tile);
    const specialTile = players[0].hand.find(tile => tile.id === id && tile.special);
    if (specialTile && (event as PointerEvent).pointerType === 'touch' && lastSpecialTapId !== id) { lastSpecialTapId = id; showSpecialInfo(specialTile, el); return; }
    lastSpecialTapId = null;
    if (action === 'pickup') {
      for (let p = 1; p < playerCount(); p++) if (players[p].river.some(t => t.id === id)) { usePickup(p, id); return; }
    }
    if (!players[0].hand.some(t => t.id === id) || current !== 0 || phase !== 'turn') return;
    if (action === 'change' || action === 'roadroller' || action === 'randomizer' || action === 'pairFestival') { selected.has(id) ? selected.delete(id) : (action === 'randomizer' || selected.size < (action === 'change' ? 5 : action === 'pairFestival' ? 2 : 3)) && selected.add(id); render(); }
    else if (action === 'kan' || action === 'akuukan') { selected.has(id) ? selected.delete(id) : selected.size < 4 && selected.add(id); render(); }
    else discard(0, id);
  }));
  document.querySelectorAll<HTMLElement>('[data-borrow]').forEach(el => el.addEventListener('click', () => useBorrow(Number(el.dataset.borrow))));
  document.querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.addEventListener('click', () => {
    switch (el.dataset.action) {
      case 'tsumo': { const s = winScore(0, players[0].hand, true); if (s.valid) settle(0, null, s, true); break; }
      case 'ron': if (pending) {
        if (pending.tile.special === 'trap' && settings.cards && hasCard(players[0], 'danger') && (players[0].dangerUses ?? 0) < 2 && !trapRonWarned) {
          players[0].dangerUses = (players[0].dangerUses ?? 0) + 1;
          trapRonWarned = true; render();
        } else settleMultipleRon(pending.winners, pending.from, pending.chankan ? pending.tile : undefined);
      } break;
      case 'confirm-danger': if (dangerDiscardId !== null) { const id = dangerDiscardId; dangerDiscardId = null; phase = 'turn'; discard(0, id, true); } break;
      case 'cancel-danger': dangerDiscardId = null; phase = 'turn'; render(); break;
      case 'pass': if (pending) {
        const bots = pending.winners.filter(w => w.seat !== 0);
        players[0].temporaryFuriten = true;
        if (players[0].riichi) players[0].riichiFuriten = true;
        const { tile, from, chankan } = pending;
        pending = null;
        phase = 'turn';
        if (bots.length) { pendingCall = null; settleMultipleRon(bots, from, chankan ? tile : undefined); }
        else if (chankan) completeAddedKan();
        else { pendingCall = null; callStage = null; if (!resumeExtraDiscard(from) && !tryCpuCall(tile, from)) nextTurn(); }
      } break;
      case 'pass-call': if (pendingCall) { const { tile, from } = pendingCall; pendingCall = null; callStage = null; phase = 'turn'; if (!resumeExtraDiscard(from) && !tryCpuCall(tile, from)) nextTurn(); } break;
      case 'back-call': callStage = null; render(); break;
      case 'confirm-change': useChange(); break;
      case 'confirm-pair': usePairFestival(); break;
      case 'confirm-tile-change': useTileChange(); break;
      case 'kan': action = 'kan'; selected.clear(); render(); break;
      case 'confirm-kan': if (action === 'kan' || action === 'akuukan') makeKan(0, [...selected], action === 'akuukan'); break;
      case 'cancel': action = null; activeCard = null; selected.clear(); render(); break;
      case 'riichi': riichiPending = !riichiPending || openRiichiPending; openRiichiPending = false; render(); break;
      case 'open-riichi': openRiichiPending = !openRiichiPending; riichiPending = openRiichiPending; render(); break;
      case 'next': if (result?.title === '対局終了') { phase = 'setup'; setup(); } else startRound(); break;
      case 'help': helpOpen = !helpOpen; yakuOpen = false; render(); break;
      case 'yaku': yakuOpen = !yakuOpen; helpOpen = false; render(); break;
      case 'skeleton': skeletonOpen = !skeletonOpen; render(); break;
      case 'settings': settingsOpen = !settingsOpen; helpOpen = false; yakuOpen = false; render(); break;
      case 'log': logOpen = !logOpen; render(); break;
      case 'cards-info': cardsOpen = !cardsOpen; render(); break;
    }
  }));
}
setup();
