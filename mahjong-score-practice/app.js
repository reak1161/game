const RANKING_KEY = "mahjong-score-drill-ranking-v1";

const TILE_LABELS = [
  "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
  "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p",
  "1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s",
  "東", "南", "西", "北", "白", "發", "中",
];

const YAKU_HAN = {
  riichi: { name: "立直", han: 1 },
  tsumo: { name: "門前清自摸和", han: 1 },
  tanyao: { name: "断么九", han: 1 },
  pinfu: { name: "平和", han: 1 },
  iipeiko: { name: "一盃口", han: 1 },
  yakuhai_haku: { name: "役牌（白）", han: 1 },
  yakuhai_hatsu: { name: "役牌（發）", han: 1 },
  yakuhai_chun: { name: "役牌（中）", han: 1 },
  yakuhai_ton: { name: "役牌（東）", han: 1 },
  yakuhai_nan: { name: "役牌（南）", han: 1 },
  toitoi: { name: "対々和", han: 2 },
  sanankou: { name: "三暗刻", han: 2 },
  sanshoku: { name: "三色同順", han: 2 },
  ittsuu: { name: "一気通貫", han: 2 },
  chiitoi: { name: "七対子", han: 2 },
  honitsu_closed: { name: "混一色", han: 3 },
  honitsu_open: { name: "混一色", han: 2 },
  junchan_closed: { name: "純全帯么九", han: 3 },
  junchan_open: { name: "純全帯么九", han: 2 },
  chanta_closed: { name: "混全帯么九", han: 2 },
  chanta_open: { name: "混全帯么九", han: 1 },
  chinitsu_closed: { name: "清一色", han: 6 },
  chinitsu_open: { name: "清一色", han: 5 },
};

const QUESTION_TEMPLATES = [
  {
    id: "pinfu-tanyao-iipeiko",
    hand: "234m 234m 456p 345s 55p",
    winTile: "和了牌: 6s",
    memo: "良形の門前手",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["tanyao", "pinfu", "iipeiko"],
    fu: { ron: 30, tsumo: 20 },
  },
  {
    id: "pinfu-sanshoku",
    hand: "123m 123p 123s 345m 77p",
    winTile: "和了牌: 5m",
    memo: "三色同順の門前手",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["pinfu", "sanshoku"],
    fu: { ron: 30, tsumo: 20 },
  },
  {
    id: "tanyao-ittsuu",
    hand: "123p 456p 789p 345s 22m",
    winTile: "和了牌: 3s",
    memo: "一気通貫（門前）",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["ittsuu"],
    fu: { ron: 30, tsumo: 30 },
  },
  {
    id: "yakuhai-toitoi-open",
    hand: "白白白 777m 999p 333s 中中",
    winTile: "和了牌: 中",
    memo: "副露あり想定",
    closed: false,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["yakuhai_haku", "toitoi"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "yakuhai-double-toitoi",
    hand: "白白白 發發發 222m 888s 99p",
    winTile: "和了牌: 9p",
    memo: "役牌2種＋対々和",
    closed: false,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["yakuhai_haku", "yakuhai_hatsu", "toitoi"],
    fu: { ron: 50, tsumo: 50 },
  },
  {
    id: "chiitoi-tanyao",
    hand: "22m 33m 44p 55p 66s 77s 88p",
    winTile: "和了牌: 8p",
    memo: "七対子",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["chiitoi", "tanyao"],
    fu: { ron: 25, tsumo: 25 },
  },
  {
    id: "honitsu-yakuhai-open",
    hand: "111p 234p 678p 999p 白白",
    winTile: "和了牌: 白",
    memo: "混一色（副露あり）",
    closed: false,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["honitsu_open", "yakuhai_haku"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "honitsu-closed",
    hand: "123s 456s 789s 南南南 22s",
    winTile: "和了牌: 2s",
    memo: "混一色（門前）＋役牌",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["honitsu_closed", "yakuhai_nan"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "chinitsu-open",
    hand: "111m 234m 456m 789m 99m",
    winTile: "和了牌: 9m",
    memo: "清一色（副露あり）",
    closed: false,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["chinitsu_open"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "chanta-yakuhai-open",
    hand: "123m 789m 白白白 789p 99s",
    winTile: "和了牌: 9s",
    memo: "混全帯么九＋役牌",
    closed: false,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["chanta_open", "yakuhai_haku"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "junchan-closed",
    hand: "123m 789m 123p 789s 11p",
    winTile: "和了牌: 1p",
    memo: "純全帯么九（門前）",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["junchan_closed"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "sanankou-toitoi-closed",
    hand: "222m 777p 333s 999m 55m",
    winTile: "和了牌: 5m",
    memo: "三暗刻＋対々和（想定問題）",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["sanankou", "toitoi"],
    fu: { ron: 50, tsumo: 50 },
  },
  {
    id: "ittsuu-open",
    hand: "123s 456s 789s 77m 999p",
    winTile: "和了牌: 7m",
    memo: "一気通貫（副露あり）",
    closed: false,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["ittsuu"],
    fu: { ron: 40, tsumo: 40 },
  },
  {
    id: "yakuhai-basic",
    hand: "中中中 456m 678p 789s 22m",
    winTile: "和了牌: 2m",
    memo: "基本形の確認用",
    closed: true,
    allowedWinTypes: ["ron", "tsumo"],
    yakuKeys: ["yakuhai_chun"],
    fu: { ron: 40, tsumo: 30 },
  },
];

const els = {
  playerName: document.getElementById("playerName"),
  questionCount: document.getElementById("questionCount"),
  startBtn: document.getElementById("startBtn"),
  quizPanel: document.getElementById("quizPanel"),
  progressText: document.getElementById("progressText"),
  timerText: document.getElementById("timerText"),
  scoreChip: document.getElementById("scoreChip"),
  streakChip: document.getElementById("streakChip"),
  handTiles: document.getElementById("handTiles"),
  winTypeText: document.getElementById("winTypeText"),
  seatText: document.getElementById("seatText"),
  riichiText: document.getElementById("riichiText"),
  doraIndicatorTile: document.getElementById("doraIndicatorTile"),
  uraDoraIndicatorTile: document.getElementById("uraDoraIndicatorTile"),
  answerForm: document.getElementById("answerForm"),
  answerInputs: document.getElementById("answerInputs"),
  resultPanel: document.getElementById("resultPanel"),
  judgeText: document.getElementById("judgeText"),
  correctPointsText: document.getElementById("correctPointsText"),
  breakdownText: document.getElementById("breakdownText"),
  fuDetailList: document.getElementById("fuDetailList"),
  yakuList: document.getElementById("yakuList"),
  nextBtn: document.getElementById("nextBtn"),
  summaryPanel: document.getElementById("summaryPanel"),
  summaryName: document.getElementById("summaryName"),
  summaryCorrect: document.getElementById("summaryCorrect"),
  summaryRate: document.getElementById("summaryRate"),
  summaryTime: document.getElementById("summaryTime"),
  summaryScore: document.getElementById("summaryScore"),
  restartBtn: document.getElementById("restartBtn"),
  rankingList: document.getElementById("rankingList"),
  rankingEmpty: document.getElementById("rankingEmpty"),
  clearRankingBtn: document.getElementById("clearRankingBtn"),
};

const TILE_FILE_MAP = {
  "1m": "1m.gif", "2m": "2m.gif", "3m": "3m.gif", "4m": "4m.gif", "5m": "5m.gif", "6m": "6m.gif", "7m": "7m.gif", "8m": "8m.gif", "9m": "9m.gif",
  "1p": "1p.gif", "2p": "2p.gif", "3p": "3p.gif", "4p": "4p.gif", "5p": "5p.gif", "6p": "6p.gif", "7p": "7p.gif", "8p": "8p.gif", "9p": "9p.gif",
  "1s": "1s.gif", "2s": "2s.gif", "3s": "3s.gif", "4s": "4s.gif", "5s": "5s.gif", "6s": "6s.gif", "7s": "7s.gif", "8s": "8s.gif", "9s": "9s.gif",
  "東": "east.gif", "南": "south.gif", "西": "west.gif", "北": "north.gif",
  "白": "white.gif", "發": "green.gif", "中": "red.gif",
};

function tileAssetPath(tileCode, orientation = "stand") {
  const file = TILE_FILE_MAP[tileCode];
  return file ? `assets/tiles/${orientation}/${file}` : "";
}

const state = {
  playerName: "Guest",
  questionCount: 10,
  questions: [],
  index: 0,
  answered: false,
  correctCount: 0,
  score: 0,
  streak: 0,
  startAt: 0,
  timerId: null,
  currentQuestionStartAt: 0,
};
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function ceil100(n) {
  return Math.ceil(n / 100) * 100;
}

function computeLimitLevel(han, fu) {
  if (han >= 13) return "yakuman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han >= 5) return "mangan";
  if (han === 4 && fu >= 40) return "mangan";
  if (han === 3 && fu >= 70) return "mangan";
  return null;
}

function calcPoints({ han, fu, isDealer, winType }) {
  const limit = computeLimitLevel(han, fu);
  let ron;
  let tsumoDealerPay;
  let tsumoChildPay;

  if (limit) {
    const table = {
      mangan: { ronChild: 8000, ronDealer: 12000, tsumoChild: [4000, 2000], tsumoDealerAll: 4000 },
      haneman: { ronChild: 12000, ronDealer: 18000, tsumoChild: [6000, 3000], tsumoDealerAll: 6000 },
      baiman: { ronChild: 16000, ronDealer: 24000, tsumoChild: [8000, 4000], tsumoDealerAll: 8000 },
      sanbaiman: { ronChild: 24000, ronDealer: 36000, tsumoChild: [12000, 6000], tsumoDealerAll: 12000 },
      yakuman: { ronChild: 32000, ronDealer: 48000, tsumoChild: [16000, 8000], tsumoDealerAll: 16000 },
    }[limit];

    if (winType === "ron") {
      ron = isDealer ? table.ronDealer : table.ronChild;
    } else if (isDealer) {
      tsumoDealerPay = table.tsumoDealerAll;
    } else {
      [tsumoDealerPay, tsumoChildPay] = table.tsumoChild;
    }
  } else {
    const base = fu * Math.pow(2, han + 2);
    if (winType === "ron") {
      ron = ceil100(base * (isDealer ? 6 : 4));
    } else if (isDealer) {
      tsumoDealerPay = ceil100(base * 2);
    } else {
      tsumoDealerPay = ceil100(base * 2);
      tsumoChildPay = ceil100(base);
    }
  }

  return { han, fu, limit, isDealer, winType, ron, tsumoDealerPay, tsumoChildPay };
}

function totalPointsFromBreakdown(result) {
  if (result.winType === "ron") return result.ron;
  if (result.isDealer) return result.tsumoDealerPay * 3;
  return result.tsumoDealerPay + result.tsumoChildPay * 2;
}

function limitLabel(limit) {
  return {
    mangan: "満貫",
    haneman: "跳満",
    baiman: "倍満",
    sanbaiman: "三倍満",
    yakuman: "役満",
  }[limit];
}

function formatPointAnswer(result) {
  if (result.winType === "ron") {
    return `${result.ron}点（ロン）`;
  }
  if (result.isDealer) {
    return `${result.tsumoDealerPay}オール（総計 ${totalPointsFromBreakdown(result)}点）`;
  }
  return `${result.tsumoChildPay}/${result.tsumoDealerPay}（子/親支払い, 総計 ${totalPointsFromBreakdown(result)}点）`;
}

function formatBreakdown(result) {
  const limitText = result.limit ? ` / ${limitLabel(result.limit)}` : "";
  const pointText = result.winType === "ron"
    ? `ロン ${result.ron}点`
    : (result.isDealer ? `ツモ ${result.tsumoDealerPay}オール` : `ツモ 子${result.tsumoChildPay} / 親${result.tsumoDealerPay}`);
  return `${result.han}飜 ${result.fu}符${limitText} → ${pointText}`;
}

function buildFuDetails(question) {
  const fu = question.fu;
  const hasYaku = (key) => question.yakuDetails.some((y) => y.key === key);

  if (hasYaku("chiitoi")) {
    return [
      { label: "七対子固定", fu: 25 },
    ];
  }

  if (question.closed && question.winType === "tsumo" && hasYaku("pinfu") && fu === 20) {
    return [
      { label: "平和ツモ（20符固定扱い）", fu: 20 },
    ];
  }

  const items = [{ label: "副底", fu: 20 }];
  let used = 20;

  if (question.closed && question.winType === "ron") {
    items.push({ label: "門前ロン", fu: 10 });
    used += 10;
  }

  if (question.winType === "tsumo" && fu > 20) {
    items.push({ label: "ツモ", fu: 2 });
    used += 2;
  }

  const rest = fu - used;
  if (rest > 0) {
    items.push({ label: "刻子・雀頭・待ち・切り上げ等", fu: rest });
  }

  return items;
}

function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function sanitizeNumberInput(value) {
  return Number(String(value).replace(/[^\d]/g, ""));
}

function parseCompactTiles(group) {
  if (!group) return [];
  if (/^[1-9]+[mps]$/.test(group)) {
    const suit = group[group.length - 1];
    return group.slice(0, -1).split("").map((n) => `${n}${suit}`);
  }
  return Array.from(group);
}

function parseHandTextToGroups(handText) {
  return String(handText || "").trim().split(/\s+/).filter(Boolean).map(parseCompactTiles);
}

function parseHandTextToTiles(handText) {
  return parseHandTextToGroups(handText).flat();
}

function tileSortKey(tile) {
  const honorOrder = ["東", "南", "西", "北", "白", "發", "中"];
  if (/^[1-9][mps]$/.test(tile)) {
    const suitOrder = { m: 0, p: 1, s: 2 };
    return suitOrder[tile[1]] * 10 + Number(tile[0]);
  }
  const honorIndex = honorOrder.indexOf(tile);
  if (honorIndex >= 0) return 100 + honorIndex;
  return 999;
}

function sortTiles(tiles) {
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

function parseWinTileLabel(winTileLabel) {
  const raw = String(winTileLabel || "").replace(/^和了牌:\s*/, "").trim();
  return parseCompactTiles(raw)[0] || raw;
}

function validateQuestionTemplates() {
  const yakuhaiMap = {
    yakuhai_haku: "白",
    yakuhai_hatsu: "發",
    yakuhai_chun: "中",
    yakuhai_ton: "東",
    yakuhai_nan: "南",
  };

  QUESTION_TEMPLATES.forEach((tpl) => {
    const tiles = parseHandTextToTiles(tpl.hand);
    tpl.yakuKeys
      .filter((key) => yakuhaiMap[key])
      .forEach((key) => {
        const expected = yakuhaiMap[key];
        const count = countTiles(tiles, expected);
        if (count < 3) {
          console.warn(`[template mismatch] ${tpl.id}: ${key} requires ${expected}x3, but hand has ${count}`);
        }
      });
  });
}

function createTileImg(tileCode, options = {}) {
  const orientation = options.orientation || "stand";
  const img = document.createElement("img");
  img.className = "tile-image";
  if (orientation === "side") img.classList.add("tile-image-side");
  img.alt = tileCode;
  img.loading = "lazy";
  img.decoding = "async";
  img.src = tileAssetPath(tileCode, orientation);
  if (!tileAssetPath(tileCode, orientation)) img.style.display = "none";
  return img;
}

function renderTileLine(container, tileGroups, options = {}) {
  container.innerHTML = "";
  if (options.prefixLabel) {
    const label = document.createElement("span");
    label.className = "tile-caption";
    label.textContent = options.prefixLabel;
    container.appendChild(label);
  }
  tileGroups.forEach((group, index) => {
    group.forEach((tileCode) => container.appendChild(createTileImg(tileCode)));
    if (index < tileGroups.length - 1) {
      const gap = document.createElement("span");
      gap.className = "tile-group-gap";
      gap.setAttribute("aria-hidden", "true");
      container.appendChild(gap);
    }
  });
}

function renderOpenMeld(container, meldTiles, rotateIndex) {
  const wrap = document.createElement("div");
  wrap.className = "open-meld";
  meldTiles.forEach((tileCode, i) => {
    wrap.appendChild(createTileImg(tileCode, { orientation: i === rotateIndex ? "side" : "stand" }));
  });
  container.appendChild(wrap);
}

function consumeTiles(sourceTiles, tilesToRemove) {
  const remaining = [...sourceTiles];
  for (const tile of tilesToRemove) {
    const idx = remaining.indexOf(tile);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return remaining;
}

function renderHandWithWinningTile(container, question) {
  container.innerHTML = "";
  const handTiles = parseHandTextToTiles(question.hand);
  const winTile = parseWinTileLabel(question.winTile);
  const hand13 = sortTiles([...handTiles]);
  const winIndexInHand = hand13.indexOf(winTile);
  if (winIndexInHand >= 0) {
    hand13.splice(winIndexInHand, 1);
  }

  let concealedTiles = [...hand13];
  if (question.openMeldTiles?.length) {
    concealedTiles = sortTiles(consumeTiles(hand13, question.openMeldTiles));
  }

  concealedTiles.forEach((tileCode) => container.appendChild(createTileImg(tileCode)));
  if (question.openMeldTiles?.length) {
    const furoGap = document.createElement("span");
    furoGap.className = "tile-block-gap";
    furoGap.setAttribute("aria-hidden", "true");
    container.appendChild(furoGap);
    renderOpenMeld(container, question.openMeldTiles, question.openMeldRotateIndex ?? 1);
  }
  const winImg = createTileImg(winTile);
  winImg.classList.add("tile-image-win");
  container.appendChild(winImg);
}

function renderIndicatorTile(container, indicatorTile, actualDoraTile, emptyText = "なし") {
  container.innerHTML = "";
  if (!indicatorTile) {
    const span = document.createElement("span");
    span.className = "subtle-inline";
    span.textContent = emptyText;
    container.appendChild(span);
    return;
  }

  container.appendChild(createTileImg(indicatorTile));
}

function nextDora(tile) {
  const suitMap = {
    m: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m"],
    p: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p"],
    s: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s"],
  };

  if (/^[1-9][mps]$/.test(tile)) {
    const suit = tile[1];
    const arr = suitMap[suit];
    const idx = arr.indexOf(tile);
    return arr[(idx + 1) % arr.length];
  }

  const winds = ["東", "南", "西", "北"];
  const dragons = ["白", "發", "中"];
  if (winds.includes(tile)) return winds[(winds.indexOf(tile) + 1) % winds.length];
  if (dragons.includes(tile)) return dragons[(dragons.indexOf(tile) + 1) % dragons.length];
  return tile;
}

function countTiles(tileList, targetTile) {
  return tileList.reduce((count, tile) => count + (tile === targetTile ? 1 : 0), 0);
}

function pickOpenMeldFromTemplate(template) {
  if (template.closed) return { openMeldTiles: null, openMeldRotateIndex: null };

  const winTile = parseWinTileLabel(template.winTile);
  const groups = String(template.hand).trim().split(/\s+/).filter(Boolean).map(parseCompactTiles);
  const meldCandidates = groups.filter((g) => g.length === 3);
  if (!meldCandidates.length) return { openMeldTiles: null, openMeldRotateIndex: null };

  const preferred = meldCandidates.filter((g) => !g.includes(winTile));
  if (!preferred.length) {
    return { openMeldTiles: null, openMeldRotateIndex: null };
  }
  const chosen = sample(preferred);
  return {
    openMeldTiles: [...chosen],
    openMeldRotateIndex: randomInt(0, Math.max(0, chosen.length - 1)),
  };
}

function generateQuestion(template) {
  const winType = sample(template.allowedWinTypes);
  const isDealer = Math.random() < 0.35;
  const riichi = template.closed ? (Math.random() < 0.55) : false;
  const doraIndicator = sample(TILE_LABELS);
  const doraTile = nextDora(doraIndicator);
  const uraDoraIndicator = riichi ? sample(TILE_LABELS) : null;
  const uraDoraTile = uraDoraIndicator ? nextDora(uraDoraIndicator) : null;
  const shownTiles = [...parseHandTextToTiles(template.hand), parseWinTileLabel(template.winTile)];
  const doraCount = countTiles(shownTiles, doraTile);
  const uraDoraCount = uraDoraTile ? countTiles(shownTiles, uraDoraTile) : 0;
  const { openMeldTiles, openMeldRotateIndex } = pickOpenMeldFromTemplate(template);

  const yakuDetails = template.yakuKeys.map((key) => ({ ...YAKU_HAN[key], key }));
  if (riichi) yakuDetails.push({ ...YAKU_HAN.riichi, key: "riichi" });
  if (template.closed && winType === "tsumo") yakuDetails.push({ ...YAKU_HAN.tsumo, key: "tsumo" });
  if (doraCount > 0) yakuDetails.push({ name: "ドラ", han: doraCount, key: "dora" });
  if (uraDoraCount > 0) yakuDetails.push({ name: "裏ドラ", han: uraDoraCount, key: "ura_dora" });

  const fu = template.fu[winType];
  const han = yakuDetails.reduce((sum, item) => sum + item.han, 0);
  const pointResult = calcPoints({ han, fu, isDealer, winType });

  return {
    id: `${template.id}-${Math.random().toString(36).slice(2, 8)}`,
    templateId: template.id,
    hand: template.hand,
    winTile: template.winTile,
    memo: template.memo,
    closed: template.closed,
    winType,
    isDealer,
    riichi,
    doraIndicator,
    doraTile,
    uraDoraIndicator,
    uraDoraTile,
    doraCount,
    uraDoraCount,
    openMeldTiles,
    openMeldRotateIndex,
    yakuDetails,
    fu,
    han,
    pointResult,
  };
}

function buildQuestions(count) {
  const templates = shuffle(QUESTION_TEMPLATES);
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(generateQuestion(templates[i % templates.length]));
  }
  return picked;
}

function updateTimer() {
  if (!state.startAt) return;
  els.timerText.textContent = formatElapsed(Date.now() - state.startAt);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startTimer() {
  stopTimer();
  state.startAt = Date.now();
  updateTimer();
  state.timerId = setInterval(updateTimer, 1000);
}

function updateScoreChips() {
  els.scoreChip.textContent = `Score: ${state.score}`;
  els.streakChip.textContent = `連続正解: ${state.streak}`;
}

function setAnswerInputs(question) {
  const html = [];
  if (question.winType === "ron") {
    html.push(`
      <label class="field">
        <span>ロン点数</span>
        <input type="text" inputmode="numeric" name="ronPoints" placeholder="例: 3900" required />
      </label>
    `);
  } else if (question.isDealer) {
    html.push(`
      <label class="field">
        <span>ツモ（オール）</span>
        <input type="text" inputmode="numeric" name="tsumoAll" placeholder="例: 2000" required />
      </label>
    `);
  } else {
    html.push(`
      <label class="field">
        <span>子の支払い</span>
        <input type="text" inputmode="numeric" name="tsumoChildPay" placeholder="例: 1000" required />
      </label>
    `);
    html.push(`
      <label class="field">
        <span>親の支払い</span>
        <input type="text" inputmode="numeric" name="tsumoDealerPay" placeholder="例: 2000" required />
      </label>
    `);
  }
  els.answerInputs.innerHTML = html.join("");

  if (!question.isDealer && question.winType === "tsumo") {
    const childInput = els.answerInputs.querySelector('input[name="tsumoChildPay"]');
    const dealerInput = els.answerInputs.querySelector('input[name="tsumoDealerPay"]');
    let syncing = false;

    const digits = (value) => String(value ?? "").replace(/[^\d]/g, "");

    childInput?.addEventListener("input", () => {
      if (syncing) return;
      syncing = true;
      const raw = digits(childInput.value);
      dealerInput.value = raw ? String(Number(raw) * 2) : "";
      syncing = false;
    });

    dealerInput?.addEventListener("input", () => {
      if (syncing) return;
      syncing = true;
      const raw = digits(dealerInput.value);
      childInput.value = raw ? String(Math.floor(Number(raw) / 2)) : "";
      syncing = false;
    });
  }
}

function renderQuestion() {
  const q = state.questions[state.index];
  state.answered = false;
  state.currentQuestionStartAt = Date.now();

  els.progressText.textContent = `${state.index + 1} / ${state.questionCount}`;
  renderHandWithWinningTile(els.handTiles, q);
  els.winTypeText.textContent = q.winType === "ron" ? "ロン" : "ツモ";
  els.seatText.textContent = q.isDealer ? "親" : "子";
  els.riichiText.textContent = q.riichi ? "あり" : "なし";
  renderIndicatorTile(els.doraIndicatorTile, q.doraIndicator, q.doraTile);
  renderIndicatorTile(
    els.uraDoraIndicatorTile,
    q.uraDoraIndicator,
    q.uraDoraTile,
    "リーチなし"
  );

  setAnswerInputs(q);
  els.answerForm.classList.remove("hidden");
  els.resultPanel.classList.add("hidden");
  els.judgeText.className = "judge";
  els.yakuList.innerHTML = "";
  const firstInput = els.answerInputs.querySelector("input");
  if (firstInput) firstInput.focus();
}
function collectAnswer(question) {
  const form = new FormData(els.answerForm);
  if (question.winType === "ron") {
    return { ron: sanitizeNumberInput(form.get("ronPoints")) };
  }
  if (question.isDealer) {
    return { tsumoAll: sanitizeNumberInput(form.get("tsumoAll")) };
  }
  return {
    tsumoChildPay: sanitizeNumberInput(form.get("tsumoChildPay")),
    tsumoDealerPay: sanitizeNumberInput(form.get("tsumoDealerPay")),
  };
}

function isCorrectAnswer(question, answer) {
  const p = question.pointResult;
  if (question.winType === "ron") {
    return answer.ron === p.ron;
  }
  if (question.isDealer) {
    return answer.tsumoAll === p.tsumoDealerPay;
  }
  return answer.tsumoChildPay === p.tsumoChildPay && answer.tsumoDealerPay === p.tsumoDealerPay;
}

function renderResult(question, correct) {
  els.resultPanel.classList.remove("hidden");
  els.answerForm.classList.add("hidden");
  els.judgeText.textContent = correct ? "正解" : "不正解";
  els.judgeText.classList.add(correct ? "ok" : "ng");
  els.correctPointsText.textContent = `正答: ${formatPointAnswer(question.pointResult)}`;
  els.breakdownText.textContent = `内訳: ${formatBreakdown(question.pointResult)}`;
  els.fuDetailList.innerHTML = buildFuDetails(question)
    .map((item) => `<li>${item.label} ${item.fu}符</li>`)
    .join("");

  const yakuItems = [...question.yakuDetails].sort((a, b) => b.han - a.han || a.name.localeCompare(b.name, "ja"));
  els.yakuList.innerHTML = yakuItems.map((y) => `<li>${y.name} ${y.han}飜</li>`).join("");
  els.nextBtn.textContent = state.index + 1 >= state.questionCount ? "結果を見る" : "次の問題へ";
}

function onAnswerSubmit(event) {
  event.preventDefault();
  if (state.answered) return;

  const q = state.questions[state.index];
  const answer = collectAnswer(q);
  const correct = isCorrectAnswer(q, answer);
  const elapsedSec = Math.max(1, Math.floor((Date.now() - state.currentQuestionStartAt) / 1000));

  state.answered = true;
  if (correct) {
    state.correctCount += 1;
    state.streak += 1;
    state.score += 1000 + Math.max(0, 200 - elapsedSec * 10) + Math.min(100, state.streak * 10);
  } else {
    state.streak = 0;
    state.score = Math.max(0, state.score - 50);
  }

  updateScoreChips();
  renderResult(q, correct);
}

function nextQuestionOrFinish() {
  if (!state.answered) return;
  state.index += 1;
  if (state.index >= state.questionCount) {
    void finishQuiz();
    return;
  }
  renderQuestion();
}

let rankingMode = "unknown";

function getLocalRanking() {
  try {
    const raw = localStorage.getItem(RANKING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setLocalRanking(rows) {
  localStorage.setItem(RANKING_KEY, JSON.stringify(rows.slice(0, 20)));
}

function saveLocalRanking(entry) {
  const ranking = getLocalRanking();
  ranking.push(entry);
  ranking.sort((a, b) => b.score - a.score || a.timeMs - b.timeMs);
  setLocalRanking(ranking);
  return ranking.slice(0, 20);
}

function normalizeRankingRow(row) {
  return {
    name: String(row?.name || "Guest"),
    score: Number(row?.score || 0),
    correct: Number(row?.correct || 0),
    total: Number(row?.total || 0),
    timeMs: Number(row?.timeMs || row?.time_ms || 0),
    createdAt: row?.createdAt || row?.created_at || new Date().toISOString(),
  };
}

async function fetchRankingFromApi() {
  const res = await fetch("./api/rankings?limit=20", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`GET /api/rankings failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.ok || !Array.isArray(data.ranking)) {
    throw new Error("Ranking API response is invalid");
  }
  return data.ranking.map(normalizeRankingRow);
}

async function postRankingToApi(entry) {
  const res = await fetch("./api/rankings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    throw new Error(`POST /api/rankings failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.ok || !Array.isArray(data.ranking)) {
    throw new Error("Ranking API response is invalid");
  }
  return data.ranking.map(normalizeRankingRow);
}

function setRankingModeUi(mode) {
  rankingMode = mode;
  els.clearRankingBtn.disabled = mode === "remote";
  els.clearRankingBtn.title = mode === "remote"
    ? "共有ランキング運用時はブラウザから一括削除できません"
    : "";
}

async function getRanking() {
  try {
    const remote = await fetchRankingFromApi();
    setRankingModeUi("remote");
    return remote;
  } catch {
    setRankingModeUi("local");
    return getLocalRanking();
  }
}

async function saveRanking(entry) {
  try {
    const remote = await postRankingToApi(entry);
    setRankingModeUi("remote");
    return remote;
  } catch {
    setRankingModeUi("local");
    return saveLocalRanking(entry).map(normalizeRankingRow);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function renderRanking(rowsOverride = null) {
  const ranking = rowsOverride ?? await getRanking();
  els.rankingList.innerHTML = "";
  els.rankingEmpty.classList.toggle("hidden", ranking.length > 0);

  ranking.forEach((row) => {
    const li = document.createElement("li");
    const date = new Date(row.createdAt);
    li.innerHTML = `
      <div class="ranking-main">
        <strong>${escapeHtml(row.name)}</strong>
        <span>${row.score} pt</span>
      </div>
      <div class="ranking-meta">
        ${row.correct}/${row.total}問正解 ・ ${formatElapsed(row.timeMs)} ・ ${date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
      </div>
    `;
    els.rankingList.appendChild(li);
  });
}

function startQuiz() {
  state.playerName = (els.playerName.value || "Guest").trim() || "Guest";
  state.questionCount = Number(els.questionCount.value) || 10;
  state.questions = buildQuestions(state.questionCount);
  state.index = 0;
  state.correctCount = 0;
  state.score = 0;
  state.streak = 0;
  state.answered = false;

  updateScoreChips();
  els.quizPanel.classList.remove("hidden");
  els.summaryPanel.classList.add("hidden");
  startTimer();
  renderQuestion();
}

async function finishQuiz() {
  stopTimer();
  const totalTimeMs = Date.now() - state.startAt;
  const rate = Math.round((state.correctCount / state.questionCount) * 100);
  const finalScore = Math.max(0, state.score + state.correctCount * 100 - Math.floor(totalTimeMs / 1000));
  state.score = finalScore;
  updateScoreChips();

  els.quizPanel.classList.add("hidden");
  els.summaryPanel.classList.remove("hidden");
  els.summaryName.textContent = state.playerName;
  els.summaryCorrect.textContent = `${state.correctCount} / ${state.questionCount}`;
  els.summaryRate.textContent = `${rate}%`;
  els.summaryTime.textContent = formatElapsed(totalTimeMs);
  els.summaryScore.textContent = `${finalScore} pt`;

  const rankingRows = await saveRanking({
    name: state.playerName,
    score: finalScore,
    correct: state.correctCount,
    total: state.questionCount,
    timeMs: totalTimeMs,
    createdAt: new Date().toISOString(),
  });
  await renderRanking(rankingRows);
}

els.startBtn.addEventListener("click", startQuiz);
els.answerForm.addEventListener("submit", onAnswerSubmit);
els.nextBtn.addEventListener("click", nextQuestionOrFinish);
els.restartBtn.addEventListener("click", startQuiz);
els.clearRankingBtn.addEventListener("click", () => {
  if (rankingMode === "remote") return;
  localStorage.removeItem(RANKING_KEY);
  void renderRanking();
});

validateQuestionTemplates();
void renderRanking();
