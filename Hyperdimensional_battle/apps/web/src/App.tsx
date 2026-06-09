import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode
} from "react";
import {
  applyMulliganOnly,
  chooseRoundBuff,
  createLocalGame,
  finalizeRound,
  getCardDefinitionMap,
  getCurrentResolutionCard,
  getCurrentResolutionTargetKeys,
  getRoleDefinitionMap,
  getTokenPlacementSelectionKey,
  resolvePendingFinalAction,
  resolveNextCard,
  rerollRoundBuffChoice,
  startRoundResolution,
  type LocalGameState
} from "@hyperdimensional-battle/engine";
import {
  sampleCards,
  sampleRoundBuffs,
  sampleRoles,
  type Attribute,
  type CardDefinition,
  type CardInstance,
  type CardType,
  type EngineLogEntry,
  type PlayerState,
  type ReplayEvent,
  type RoundBuffDefinition
} from "@hyperdimensional-battle/shared";
import {
  fetchRoomWorkerHealth,
  getOrCreateMultiPlayerId,
  joinRoom,
  leaveRoom,
  MULTI_PLAYER_NAME_STORAGE_KEY,
  openRoomSocket,
  resolveRoomWorkerBaseUrl,
  saveMultiPlayerName,
  startRoomMatch,
  type MultiRoomState,
  updateRoomPlayer
} from "./multiplayer";
import thunderElectricIllustration from "./assets/card-illustrations/thunder_electric.png";
import thunderOverchargeIllustration from "./assets/card-illustrations/thunder_overcharge.png";
import thunderShockIllustration from "./assets/card-illustrations/thunder_shock.png";
import thunderSpeedOfLightIllustration from "./assets/card-illustrations/thunder_speed_of_light.png";
import thunderStaticIllustration from "./assets/card-illustrations/thunder_static.png";
import thunderVoltageIllustration from "./assets/card-illustrations/thunder_voltage.png";
import thunderVortexIllustration from "./assets/card-illustrations/thunder_vortex.png";

const cardMap = getCardDefinitionMap(sampleCards);
const roleMap = getRoleDefinitionMap(sampleRoles);
const cardNameToDefinitionIdMap = Object.fromEntries(sampleCards.map((card) => [card.name, card.id] as const));
const AUTO_RESOLVE_DELAY_MS = 650;
const DOLPHIN_DUPLICATE_PLACEHOLDER_ID = "dolphin_duplicate_preview";
const AUDIO_VOLUME_STORAGE_KEY = "hyperdimensional_battle_audio_volume";
const cardIllustrationMap: Partial<Record<string, string>> = {
  thunder_electric: thunderElectricIllustration,
  thunder_overcharge: thunderOverchargeIllustration,
  thunder_shock: thunderShockIllustration,
  thunder_speed_of_light: thunderSpeedOfLightIllustration,
  thunder_static: thunderStaticIllustration,
  thunder_voltage: thunderVoltageIllustration,
  thunder_vortex: thunderVortexIllustration
};

type InputStep = "mulligan" | "placement" | "resolving";
type HoveredCardState = {
  card: CardInstance;
  anchorRight: number;
  anchorTop: number;
  anchorHeight: number;
};
type DraggedCardState = {
  instanceId: string;
  source: "hand" | "field";
};
type ParticleShape = "circle" | "diamond" | "square" | "line" | "triangle" | "ring";
type ParticleKind = "activate" | "damage" | "final";
type ParticleSprite = {
  id: string;
  shape: ParticleShape;
  size: number;
  dx: number;
  dy: number;
  delay: number;
  duration: number;
  rotation: number;
};
type ParticleBurst = {
  id: string;
  x: number;
  y: number;
  attribute: Attribute;
  kind: ParticleKind;
  sprites: ParticleSprite[];
};
type FloatingTextTone = "red" | "purple";
type FloatingText = {
  id: string;
  x: number;
  y: number;
  text: string;
  tone: FloatingTextTone;
  scope: "status" | "card";
};
type StatSnapshot = {
  baseAttack: number;
  baseMagic: number;
  tempAttack: number;
  tempMagic: number;
  scoreThisRound: number;
  totalScore: number;
};

type ConnectedFieldGroup = {
  key: string;
  start: number;
  end: number;
  attribute: Attribute;
  instanceIds: string[];
};

type ConnectedEffectConfig =
  | {
      mode: "attribute";
      attribute: Attribute;
    }
  | {
      mode: "enchanted";
      attribute: Attribute;
    };
type TokenPlacementRequirement = {
  selectionKey: string;
  tokenDefinitionId: string;
  tokenName: string;
  count: number;
};
type RoleFilter = "all" | "attack" | "magic" | "restricted" | "open";
type AppScreen = "home" | "solo_setup" | "solo_battle" | "multi_lobby" | "multi_match" | "ranking";
type RoundBuffPresentation = RoundBuffDefinition & {
  instanceId: string;
};
type LogGroup = {
  key: string;
  title: string | null;
  kind: "card" | "system-global" | "system-shared";
  entries: EngineLogEntry[];
};

type UtilityIconKind = "settings" | "catalog" | "help";
type SoloRankingEntry = {
  gameId: string;
  seed: string;
  roleId: string;
  roleName: string;
  totalScore: number;
  completedAt: string;
};

type MultiConnectionState = "idle" | "connecting" | "connected" | "error";

const STATUS_KEYS = ["baseAttack", "tempAttack", "baseMagic", "tempMagic", "scoreThisRound", "totalScore"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
const ATTRIBUTE_ORDER: Attribute[] = ["none", "fire", "water", "ice", "wind", "thunder", "earth", "dark"];
const ACTIVATION_TONE_STEPS = [0, 2, 4, 7, 9, 12, 14, 16];
const SOLO_RANKING_STORAGE_KEY = "hyperdimensional_battle_solo_rankings";

function renderUtilityIcon(kind: UtilityIconKind) {
  switch (kind) {
    case "settings":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="utility-icon">
          <path
            d="M10.3 2.4h3.4l.4 2a7.9 7.9 0 0 1 1.8.8l1.8-1 2.4 2.4-1 1.8c.3.6.6 1.2.8 1.8l2 .4v3.4l-2 .4a7.9 7.9 0 0 1-.8 1.8l1 1.8-2.4 2.4-1.8-1a7.9 7.9 0 0 1-1.8.8l-.4 2h-3.4l-.4-2a7.9 7.9 0 0 1-1.8-.8l-1.8 1-2.4-2.4 1-1.8a7.9 7.9 0 0 1-.8-1.8l-2-.4v-3.4l2-.4c.2-.6.5-1.2.8-1.8l-1-1.8L6 4.2l1.8 1c.6-.3 1.2-.6 1.8-.8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "catalog":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="utility-icon">
          <rect x="4" y="5" width="6.5" height="14" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="5" width="6.5" height="14" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 6.5v11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "help":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="utility-icon">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M9.7 9.3a2.8 2.8 0 1 1 4.7 2.1c-.9.8-1.7 1.4-1.7 2.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="17.2" r="1" fill="currentColor" />
        </svg>
      );
  }
}

function getInitialAudioVolume() {
  if (typeof window === "undefined") {
    return 55;
  }
  const storedValue = window.localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY);
  if (!storedValue) {
    return 55;
  }
  const parsed = Number(storedValue);
  if (!Number.isFinite(parsed)) {
    return 55;
  }
  return Math.min(100, Math.max(0, parsed));
}

function createRandomRouteToken(length = 8) {
  let token = "";
  while (token.length < length) {
    token += Math.random().toString(36).slice(2);
  }
  return token.slice(0, length);
}

function createDefaultSoloSeed() {
  return createRandomRouteToken(8);
}

function createDefaultLobbyId() {
  return createRandomRouteToken(8);
}

function sanitizeRouteToken(value: string | undefined | null, fallback: string) {
  if (!value) {
    return fallback;
  }
  const normalized = decodeURIComponent(value).trim().replace(/[^0-9A-Za-z_-]/g, "").slice(0, 32);
  return normalized.length > 0 ? normalized : fallback;
}

function sanitizePlayerNameInput(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han} _-]/gu, "")
    .trim()
    .slice(0, 24);
}

function formatMultiRoomError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught ?? "");
  if (/failed to fetch/i.test(message) || /networkerror/i.test(message)) {
    return "ルームサーバーに接続できません。マルチ用 worker のデプロイと VITE_ROOM_WORKER_URL を確認してください。";
  }
  return message || "ルーム通信に失敗しました。";
}

function parseAppRoute() {
  if (typeof window === "undefined") {
    return {
      screen: "home" as AppScreen,
      soloSeed: createDefaultSoloSeed(),
      lobbyId: createDefaultLobbyId()
    };
  }

  const [, head, tail] = window.location.pathname.split("/");
  if (head === "solo") {
    return {
      screen: "solo_setup" as AppScreen,
      soloSeed: sanitizeRouteToken(tail, createDefaultSoloSeed()),
      lobbyId: createDefaultLobbyId()
    };
  }
  if (head === "lobby") {
    return {
      screen: "multi_lobby" as AppScreen,
      soloSeed: createDefaultSoloSeed(),
      lobbyId: sanitizeRouteToken(tail, createDefaultLobbyId())
    };
  }
  if (head === "match") {
    return {
      screen: "multi_match" as AppScreen,
      soloSeed: createDefaultSoloSeed(),
      lobbyId: sanitizeRouteToken(tail, createDefaultLobbyId())
    };
  }
  if (head === "ranking") {
    return {
      screen: "ranking" as AppScreen,
      soloSeed: createDefaultSoloSeed(),
      lobbyId: createDefaultLobbyId()
    };
  }

  return {
    screen: "home" as AppScreen,
    soloSeed: createDefaultSoloSeed(),
    lobbyId: createDefaultLobbyId()
  };
}

function buildAppPath(screen: AppScreen, options?: { soloSeed?: string; lobbyId?: string }) {
  switch (screen) {
    case "solo_setup":
    case "solo_battle":
      return `/solo/${sanitizeRouteToken(options?.soloSeed, createDefaultSoloSeed())}`;
    case "multi_lobby":
      return `/lobby/${sanitizeRouteToken(options?.lobbyId, createDefaultLobbyId())}`;
    case "multi_match":
      return `/match/${sanitizeRouteToken(options?.lobbyId, createDefaultLobbyId())}`;
    case "ranking":
      return "/ranking";
    case "home":
    default:
      return "/";
  }
}

function loadSoloRankings() {
  if (typeof window === "undefined") {
    return [] as SoloRankingEntry[];
  }
  try {
    const raw = window.localStorage.getItem(SOLO_RANKING_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SoloRankingEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSoloRankings(entries: SoloRankingEntry[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SOLO_RANKING_STORAGE_KEY, JSON.stringify(entries));
}

function getTargetOperations(card: CardDefinition) {
  return card.effects.flatMap((effect) =>
    effect.operations.flatMap((operation) =>
      "target" in operation && operation.target
        ? [
            {
              key: operation.kind,
              label: operation.kind === "destroy_target" ? "破壊するカード" : "エンチャントを付与するカード"
            }
          ]
        : []
    )
  );
}

function resolveFieldLabel(card: CardInstance) {
  return `${card.name} #${card.instanceId.slice(-4)}`;
}

function isPlacedFromHand(player: CardInstance[], instanceId: string) {
  return player.some((card) => card.instanceId === instanceId);
}

function canReturnPlacedCardToHand(player: CardInstance[] | null | undefined, card: DraggedCardState | null) {
  if (!player || !card || card.source !== "field") {
    return false;
  }
  return isPlacedFromHand(player, card.instanceId);
}

function buildTooltipAnchor(rect: DOMRect) {
  return {
    anchorRight: rect.right,
    anchorTop: rect.top,
    anchorHeight: rect.height
  };
}

function resolveTooltipPosition(anchor: Omit<HoveredCardState, "card">, tooltipHeight: number) {
  const margin = 16;
  const width = 280;
  const nextX = Math.min(anchor.anchorRight + 14, window.innerWidth - width - margin);
  const anchorY = anchor.anchorTop + anchor.anchorHeight * 0.2 - tooltipHeight;
  const nextY = Math.min(anchorY, window.innerHeight - tooltipHeight - margin);
  return { x: Math.max(margin, nextX), y: Math.max(margin, nextY) };
}

function resolveVisualAttribute(attribute: Attribute) {
  switch (attribute) {
    case "fire":
    case "ice":
    case "water":
    case "wind":
    case "thunder":
    case "earth":
    case "dark":
      return attribute;
    default:
      return "none";
  }
}

function resolveAttributeLabel(attribute: Attribute) {
  switch (attribute) {
    case "none":
      return "無";
    case "fire":
      return "炎";
    case "water":
      return "水";
    case "ice":
      return "氷";
    case "wind":
      return "風";
    case "thunder":
      return "雷";
    case "earth":
      return "土";
    case "dark":
      return "闇";
  }
}

function resolveCardTypeLabel(type: CardType) {
  switch (type) {
    case "attack":
      return "攻撃";
    case "spell":
      return "魔法";
    case "ability":
      return "能力";
  }
}

function resolveRestrictedTypeLabel(type: CardType) {
  switch (type) {
    case "attack":
      return "攻撃不可";
    case "spell":
      return "魔法不可";
    case "ability":
      return "能力不可";
  }
}

function resolveRoleFilterLabel(filter: RoleFilter) {
  switch (filter) {
    case "all":
      return "すべて";
    case "attack":
      return "攻撃寄り";
    case "magic":
      return "魔法寄り";
    case "restricted":
      return "制限あり";
    case "open":
      return "制限なし";
  }
}

function getRoundBuffBaseCounts(buffIds: string[]) {
  return buffIds.reduce<Record<string, number>>((accumulator, buffId) => {
    accumulator[buffId] = (accumulator[buffId] ?? 0) + 1;
    return accumulator;
  }, {});
}

function getEffectiveRoundBuffCount(buffIds: string[], buffId: string) {
  const counts = getRoundBuffBaseCounts(buffIds);
  const mirrorCount = counts.round_buff_mirror ?? 0;
  if (buffId === "round_buff_mirror") {
    return mirrorCount;
  }
  const baseCount = counts[buffId] ?? 0;
  return baseCount + mirrorCount * baseCount;
}

function getRoundBuffDrawWeightBonus(buffIds: string[], attribute: Attribute) {
  if (attribute === "thunder") {
    return getEffectiveRoundBuffCount(buffIds, "round_buff_voltessimo");
  }
  if (attribute === "wind") {
    return getEffectiveRoundBuffCount(buffIds, "round_buff_tailwind_rush");
  }
  return 0;
}

function getRoundBuffPlacementLimitBonus(buffIds: string[]) {
  return getEffectiveRoundBuffCount(buffIds, "round_buff_information_society");
}

function extractLogGroupTitle(entry: EngineLogEntry) {
  const colonMatch = entry.message.match(/^([^:]+):\s*/);
  if (colonMatch) {
    return colonMatch[1] ?? null;
  }
  const damageMatch = entry.message.match(/^(.+?)\s+が\s+/);
  return damageMatch?.[1] ?? null;
}

function getLogGroupKind(entry: EngineLogEntry): LogGroup["kind"] {
  const globalCodes = new Set([
    "GAME_CREATED",
    "GAME_STARTED",
    "GAME_FINISHED",
    "ROUND_STARTED",
    "RESOLUTION_STARTED",
    "LOOP_GUARD_TRIGGERED",
    "ROUND_END",
    "ROUND_ENDED",
    "ROUND_FINALIZED"
  ]);
  const sharedCodes = new Set([
    "DRAW_UP_TO",
    "MULLIGAN_USED",
    "HAND_REFILLED",
    "MULLIGAN_APPLIED",
    "ROUND_BUFF_OFFERED",
    "ROUND_BUFF_APPLIED",
    "ROUND_BUFF_CHOICES_PRESENTED",
    "ROUND_BUFF_REROLLED",
    "ROUND_BUFF_SELECTED",
    "SCHEDULED_EFFECT_APPLIED"
  ]);

  if (globalCodes.has(entry.code)) {
    return "system-global";
  }
  if (sharedCodes.has(entry.code)) {
    return "system-shared";
  }
  return "card";
}

function buildLogGroups(entries: EngineLogEntry[]) {

  const groups: LogGroup[] = [];

  for (const entry of entries) {
    if (entry.code === "CARD_ACTIVATED_DONE") {
      continue;
    }
    const kind = getLogGroupKind(entry);
    if (kind !== "card") {
      groups.push({
        key: `group_${entry.id}`,
        title: null,
        kind,
        entries: [entry]
      });
      continue;
    }
    const title = extractLogGroupTitle(entry);
    const currentGroup = groups[groups.length - 1];
    if (title && currentGroup?.kind === "card" && currentGroup.title === title) {
      currentGroup.entries.push(entry);
      continue;
    }

    groups.push({
      key: `group_${entry.id}`,
      title,
      kind: "card",
      entries: [entry]
    });
  }

  return groups;
}

function trimGroupedLogMessage(message: string, title: string | null) {
  if (!title) {
    return message;
  }
  return message.replace(new RegExp(`^${escapeRegExp(title)}[:：]\\s?`), "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeSearchTextInput(value: string) {
  return value.normalize("NFKC").replace(/[^\p{L}\p{N}\sー]/gu, "");
}

function getRoleTrendLabel(cardAttack: number, cardMagic: number) {
  if (cardAttack > cardMagic) {
    return "攻撃寄り";
  }
  if (cardMagic > cardAttack) {
    return "魔法寄り";
  }
  return "両刀";
}

function createParticleSprites(attribute: Attribute, kind: ParticleKind): ParticleSprite[] {
  const visualAttribute = resolveVisualAttribute(attribute);
  const shapeMap: Record<string, ParticleShape[]> = {
    fire: ["diamond", "circle", "triangle"],
    water: ["circle", "ring", "circle"],
    ice: ["square", "diamond", "line"],
    wind: ["line", "line", "diamond"],
    thunder: ["triangle", "diamond", "line"],
    none: ["circle", "ring", "diamond"]
  };
  const shapes = shapeMap[visualAttribute] ?? shapeMap.none;
  const count = kind === "final" ? 14 : kind === "damage" ? 10 : 8;
  const distance = kind === "final" ? 120 : kind === "damage" ? 88 : 72;

  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.28;
    const radius = distance * (0.45 + Math.random() * 0.7);
    return {
      id: `sprite_${index}_${Math.random().toString(36).slice(2, 7)}`,
      shape: shapes[index % shapes.length] ?? "circle",
      size: kind === "final" ? 12 + Math.random() * 14 : 8 + Math.random() * 10,
      dx: Math.cos(angle) * radius,
      dy: Math.sin(angle) * radius,
      delay: index * 18,
      duration: 620 + Math.random() * 260,
      rotation: Math.random() * 280 - 140
    };
  });
}

function getViewportFallbackPosition() {
  return {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.42
  };
}

function formatDisplayNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000_000) {
    return value.toExponential(3).replace(/(\.\d*?[1-9])0+e/, "$1e").replace(/\.0+e/, "e");
  }
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatSignedValue(value: number) {
  return `${value > 0 ? "+" : ""}${formatDisplayNumber(value)}`;
}

function getCardNumericBonus(card: CardInstance | null | undefined) {
  if (!card) {
    return 0;
  }
  return Object.entries(card.counters ?? {}).reduce(
    (sum, [key, value]) => (key.startsWith("round_triggered_") ? sum : sum + value),
    0
  );
}

function getCardNumericMultiplier(card: CardInstance | null | undefined) {
  if (!card) {
    return 1;
  }
  const multiplier = card.derived?.numericValueMultiplier;
  const roundBuffMultiplier = card.derived?.roundBuffNumericValueMultiplier;
  const fieldTransformMultiplier = card.derived?.fieldTransformNumericValueMultiplier;
  return (
    (typeof multiplier === "number" ? multiplier : 1) *
    (typeof roundBuffMultiplier === "number" ? roundBuffMultiplier : 1) *
    (typeof fieldTransformMultiplier === "number" ? fieldTransformMultiplier : 1)
  );
}

function getCardHostEnchantNumericBonus(card: CardInstance | null | undefined) {
  if (!card) {
    return 0;
  }
  const bonus = card.derived?.hostEnchantNumericBonus;
  return typeof bonus === "number" ? bonus : 0;
}

function getCardProbabilityValueMultiplier(card: CardInstance | null | undefined) {
  if (!card) {
    return 1;
  }
  const multiplier = card.derived?.probabilityValueMultiplier;
  return typeof multiplier === "number" ? multiplier : 1;
}

function formatCardTextNumber(value: number) {
  return formatDisplayNumber(value);
}

function formatMarkedCardTextNumber(template: string, value: number) {
  const multiplySymbol = "×";
  const timesSuffix = "倍";
  const hasPlusPrefix = template.startsWith("+");
  const hasMultiplyPrefix = template.startsWith(multiplySymbol);
  const hasTimesSuffix = template.endsWith(timesSuffix);
  let formatted = formatCardTextNumber(value);

  if (hasPlusPrefix && value > 0) {
    formatted = `+${formatted}`;
  } else if (hasMultiplyPrefix) {
    formatted = `${multiplySymbol}${formatted}`;
  }

  if (hasTimesSuffix) {
    formatted = `${formatted}${timesSuffix}`;
  }

  return formatted;
}

function formatEffectText(text: string) {
  return text
    .replace(/((?:発動：|設置：|消費：|封印：|ラウンド終了時：))/g, "\n$1")
    .replace(/^\n/, "");
}

const CARD_TEXT_REFERENCE_PATTERN = /『([^』]+)』/g;

function formatMarkedProbabilityAwareTextNumber(template: string, value: number) {
  const percentSuffix = "%";
  let formatted = formatMarkedCardTextNumber(template, value);

  if (template.endsWith(percentSuffix) && !formatted.endsWith(percentSuffix)) {
    formatted = `${formatted}${percentSuffix}`;
  }

  return formatted;
}

function formatMarkedCardTextNumberSafe(template: string, value: number) {
  return formatMarkedCardTextNumber(template, value);
}

function formatEffectTextSafe(text: string) {
  return formatEffectText(text);
}



function renderPlainNumericAdjustedTextSegmentSafe(
  text: string,
  replacements: Map<
    number,
    {
      value: string;
      change: "none" | "up" | "down";
      kind: "normal" | "probability" | "enchant";
    }
  >,
  occurrenceStart: number
) {
  const parts: ReactNode[] = [];
  const pattern = /-?\d+(?:\.\d+)?/g;
  let lastIndex = 0;
  let occurrence = occurrenceStart;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    const [token] = match;
    const numberStart = match.index;
    const numberEnd = match.index + token.length;
    const hasPrefixSymbol = numberStart > lastIndex && ["+", "×"].includes(text[numberStart - 1] ?? "");
    const hasSuffixSymbol = text[numberEnd] === "倍";
    const renderStart = hasPrefixSymbol ? numberStart - 1 : numberStart;
    const renderEnd = hasSuffixSymbol ? numberEnd + 1 : numberEnd;

    if (renderStart > lastIndex) {
      parts.push(<Fragment key={`text_${occurrence}_${lastIndex}`}>{text.slice(lastIndex, renderStart)}</Fragment>);
    }

    const replacement = replacements.get(occurrence);
    if (replacement) {
      const prefix = hasPrefixSymbol ? text[numberStart - 1] : "";
      const suffix = hasSuffixSymbol ? "倍" : "";
      parts.push(
        <span
          key={`value_${occurrence}`}
          className={`card-text-value-chip${
            replacement.change === "up"
              ? " card-text-value-modified-up"
              : replacement.change === "down"
                ? " card-text-value-modified-down"
                : ""
          } card-text-value-kind-${replacement.kind}`}
        >
          {`${prefix}${replacement.value}${suffix}`}
        </span>
      );
    } else {
      parts.push(<Fragment key={`value_${occurrence}`}>{text.slice(renderStart, renderEnd)}</Fragment>);
    }

    occurrence += 1;
    lastIndex = renderEnd;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`tail_${occurrenceStart}_${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return { parts, nextOccurrence: occurrence };
}

function renderNumericAdjustedTextSegmentSafe(
  text: string,
  replacements: Map<
    number,
    {
      value: string;
      change: "none" | "up" | "down";
      kind: "normal" | "probability" | "enchant";
    }
  >,
  occurrenceStart: number
) {
  const markerPattern = /\{\{([^{}]+)\}\}/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let occurrence = occurrenceStart;
  let markerMatch: RegExpExecArray | null = null;

  while ((markerMatch = markerPattern.exec(text)) !== null) {
    const markerStart = markerMatch.index;
    const markerEnd = markerMatch.index + markerMatch[0].length;
    const markerValue = markerMatch[1];

    if (markerStart > lastIndex) {
      const rendered = renderPlainNumericAdjustedTextSegmentSafe(text.slice(lastIndex, markerStart), replacements, occurrence);
      parts.push(...rendered.parts);
      occurrence = rendered.nextOccurrence;
    }

    const replacement = replacements.get(occurrence);
    parts.push(
      <span
        key={`marked_value_${occurrence}_${markerStart}`}
        className={`card-text-value-chip${
          replacement?.change === "up"
            ? " card-text-value-modified-up"
            : replacement?.change === "down"
              ? " card-text-value-modified-down"
              : ""
        }${replacement ? ` card-text-value-kind-${replacement.kind}` : ""}`}
      >
        {replacement ? formatMarkedProbabilityAwareTextNumber(markerValue, Number(replacement.value)) : markerValue}
      </span>
    );
    occurrence += 1;
    lastIndex = markerEnd;
  }

  if (lastIndex < text.length) {
    const rendered = renderPlainNumericAdjustedTextSegmentSafe(text.slice(lastIndex), replacements, occurrence);
    parts.push(...rendered.parts);
    occurrence = rendered.nextOccurrence;
  }

  return { parts, nextOccurrence: occurrence };
}

type CardTextRenderOptions = {
  definitionId?: string;
  player?: PlayerState | null;
  onReferenceEnter?: (definitionId: string) => void;
  onReferenceLeave?: (definitionId: string) => void;
  renderReferencePopup?: (definitionId: string) => ReactNode;
};

function getSealProgress(definition: CardDefinition | undefined, player?: PlayerState | null, card?: CardInstance | null) {
  if (!definition?.seal || !player || !card) {
    return null;
  }

  switch (definition.seal.kind) {
    case "ally_attribute_activation_total_at_least":
      const counterKey = `seal_progress_${definition.seal.kind}_${definition.seal.attribute}`;
      return {
        current: card.counters?.[counterKey] ?? 0,
        target: definition.seal.value
      };
  }
}

function renderCardTextLine(
  line: string,
  replacements: Map<
    number,
    {
      value: string;
      change: "none" | "up" | "down";
      kind: "normal" | "probability" | "enchant";
    }
  >,
  occurrenceStart: number,
  options?: CardTextRenderOptions
) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let occurrence = occurrenceStart;
  const safeReferencePattern = new RegExp(CARD_TEXT_REFERENCE_PATTERN);
  let referenceMatch: RegExpExecArray | null = null;

  while ((referenceMatch = safeReferencePattern.exec(line)) !== null) {
    const fullMatch = referenceMatch[0];
    const referenceName = referenceMatch[1];
    const definitionId = cardNameToDefinitionIdMap[referenceName];
    const referenceDefinition = definitionId ? cardMap[definitionId] : undefined;
    const referenceClassName = `card-text-reference-chip${
      referenceDefinition?.timings.includes("enchant") ? " is-enchant-reference" : ""
    }`;
    const referenceStart = referenceMatch.index;
    const referenceEnd = referenceMatch.index + fullMatch.length;

    if (referenceStart > lastIndex) {
      const segment = line.slice(lastIndex, referenceStart);
      const rendered = renderNumericAdjustedTextSegmentSafe(segment, replacements, occurrence);
      parts.push(...rendered.parts);
      occurrence = rendered.nextOccurrence;
    }

    const hasReferenceHandlers = Boolean(options?.onReferenceEnter || options?.onReferenceLeave);
    const hasReferencePopup = Boolean(options?.renderReferencePopup);
    if (definitionId && (hasReferenceHandlers || hasReferencePopup)) {
      parts.push(
        <button
          key={`reference_${referenceStart}`}
          type="button"
          className={referenceClassName}
          onMouseEnter={() => options?.onReferenceEnter?.(definitionId)}
          onMouseLeave={() => options?.onReferenceLeave?.(definitionId)}
        >
          {fullMatch}
          {hasReferencePopup ? options?.renderReferencePopup?.(definitionId) : null}
        </button>
      );
    } else if (definitionId) {
      parts.push(
        <span key={`reference_${referenceStart}`} className={referenceClassName}>
          {fullMatch}
        </span>
      );
    } else {
      parts.push(<Fragment key={`reference_${referenceStart}`}>{fullMatch}</Fragment>);
    }

    lastIndex = referenceEnd;
  }

  if (lastIndex < line.length) {
    const rendered = renderNumericAdjustedTextSegmentSafe(line.slice(lastIndex), replacements, occurrence);
    parts.push(...rendered.parts);
    occurrence = rendered.nextOccurrence;
  }

  return { parts, nextOccurrence: occurrence };
}

function renderPlainNumericAdjustedTextSegment(
  text: string,
  replacements: Map<
    number,
    {
      value: string;
      change: "none" | "up" | "down";
      kind: "normal" | "probability" | "enchant";
    }
  >,
  occurrenceStart: number
) {
  const parts: ReactNode[] = [];
  const pattern = /-?\d+(?:\.\d+)?/g;
  let lastIndex = 0;
  let occurrence = occurrenceStart;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(text)) !== null) {
    const [token] = match;
    const numberStart = match.index;
    const numberEnd = match.index + token.length;
    const hasPrefixSymbol = numberStart > lastIndex && ["+", "×"].includes(text[numberStart - 1] ?? "");
    const hasSuffixSymbol = text[numberEnd] === "倍";
    const renderStart = hasPrefixSymbol ? numberStart - 1 : numberStart;
    const renderEnd = hasSuffixSymbol ? numberEnd + 1 : numberEnd;

    if (renderStart > lastIndex) {
      parts.push(<Fragment key={`text_${occurrence}_${lastIndex}`}>{text.slice(lastIndex, renderStart)}</Fragment>);
    }

    const replacement = replacements.get(occurrence);
    if (replacement) {
      const prefix = hasPrefixSymbol ? text[numberStart - 1] : "";
      const suffix = hasSuffixSymbol ? "倍" : "";
      parts.push(
        <span
          key={`value_${occurrence}`}
          className={`card-text-value-chip${
            replacement.change === "up"
              ? " card-text-value-modified-up"
              : replacement.change === "down"
                ? " card-text-value-modified-down"
                : ""
          } card-text-value-kind-${replacement.kind}`}
        >
          {`${prefix}${replacement.value}${suffix}`}
        </span>
      );
    } else {
      parts.push(<Fragment key={`value_${occurrence}`}>{text.slice(renderStart, renderEnd)}</Fragment>);
    }

    occurrence += 1;
    lastIndex = renderEnd;
  }

  if (lastIndex < text.length) {
    parts.push(<Fragment key={`tail_${occurrenceStart}_${lastIndex}`}>{text.slice(lastIndex)}</Fragment>);
  }

  return { parts, nextOccurrence: occurrence };
}

function renderNumericAdjustedTextSegment(
  text: string,
  replacements: Map<
    number,
    {
      value: string;
      change: "none" | "up" | "down";
      kind: "normal" | "probability" | "enchant";
    }
  >,
  occurrenceStart: number
) {
  const markerPattern = /\{\{([^{}]+)\}\}/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let occurrence = occurrenceStart;
  let markerMatch: RegExpExecArray | null = null;

  while ((markerMatch = markerPattern.exec(text)) !== null) {
    const markerStart = markerMatch.index;
    const markerEnd = markerMatch.index + markerMatch[0].length;
    const markerValue = markerMatch[1];

    if (markerStart > lastIndex) {
      const rendered = renderPlainNumericAdjustedTextSegment(text.slice(lastIndex, markerStart), replacements, occurrence);
      parts.push(...rendered.parts);
      occurrence = rendered.nextOccurrence;
    }

    const replacement = replacements.get(occurrence);
    parts.push(
      <span
        key={`marked_value_${occurrence}_${markerStart}`}
        className={`card-text-value-chip${
          replacement?.change === "up"
            ? " card-text-value-modified-up"
            : replacement?.change === "down"
              ? " card-text-value-modified-down"
              : ""
        }${replacement ? ` card-text-value-kind-${replacement.kind}` : ""}`}
      >
        {replacement ? formatMarkedCardTextNumber(markerValue, Number(replacement.value)) : markerValue}
      </span>
    );
    occurrence += 1;
    lastIndex = markerEnd;
  }

  if (lastIndex < text.length) {
    const rendered = renderPlainNumericAdjustedTextSegment(text.slice(lastIndex), replacements, occurrence);
    parts.push(...rendered.parts);
    occurrence = rendered.nextOccurrence;
  }

  return { parts, nextOccurrence: occurrence };
}

function renderCardTextWithAdjustedNumbers(text: string, card?: CardInstance | null, options?: CardTextRenderOptions): ReactNode {
  const formattedText = formatEffectTextSafe(text);
  const replacements = new Map<
    number,
    {
      value: string;
      change: "none" | "up" | "down";
      kind: "normal" | "probability" | "enchant";
    }
  >();
  const definition = card ? cardMap[card.definitionId] : options?.definitionId ? cardMap[options.definitionId] : undefined;
  const sealProgress = getSealProgress(definition, options?.player, card);
  const bindings = definition?.textValueBindings ?? [];
  const numericBonus = card ? getCardNumericBonus(card) : 0;
  const numericMultiplier = card ? getCardNumericMultiplier(card) : 1;
  const hostEnchantNumericBonus = card ? getCardHostEnchantNumericBonus(card) : 0;
  const probabilityMultiplier = card ? getCardProbabilityValueMultiplier(card) : 1;
  const isEnchantDefinition = definition?.timings.includes("enchant") ?? false;
  for (const binding of bindings) {
    const effect = definition?.effects.find((entry) => entry.id === binding.effectId);
    const operationPath = binding.operationPath ?? [binding.operationIndex];
    let operation: { value?: number } | undefined = undefined;
    let currentOperationList: any[] | undefined = effect?.operations;
    for (const pathIndex of operationPath) {
      const nextOperation = currentOperationList?.[pathIndex];
      if (!nextOperation) {
        currentOperationList = undefined;
        operation = undefined;
        break;
      }
      operation = nextOperation;
      currentOperationList = "operations" in nextOperation && Array.isArray(nextOperation.operations) ? nextOperation.operations : undefined;
    }
    if (!operation || !("value" in operation) || typeof operation.value !== "number") {
      continue;
    }
    const originalValue = operation.value;
    const adjustedValue = (() => {
      const writtenKind = binding.writtenValueKind ?? "normal";
      if (writtenKind === "enchant") {
        return originalValue + hostEnchantNumericBonus;
      }
      if (writtenKind === "probability") {
        return isEnchantDefinition ? originalValue : originalValue * probabilityMultiplier;
      }
      return (originalValue + numericBonus) * numericMultiplier;
    })();
    const change = adjustedValue > originalValue ? "up" : adjustedValue < originalValue ? "down" : "none";
    replacements.set(binding.occurrence, {
      value: formatCardTextNumber(adjustedValue),
      change,
      kind: binding.writtenValueKind ?? "normal"
    });
  }

  const parts: ReactNode[] = [];
  let occurrence = 0;
  const lines = formattedText.split("\n");
  lines.forEach((line, index) => {
    const rendered = renderCardTextLine(line, replacements, occurrence, options);
    parts.push(...rendered.parts);
    occurrence = rendered.nextOccurrence;

    if (sealProgress && line.startsWith("封印:")) {
      parts.push(
        <span key={`seal_progress_${index}`} className="card-text-seal-progress">
          {`${sealProgress.current}/${sealProgress.target}`}
        </span>
      );
    }

    if (index < lines.length - 1) {
      parts.push(<Fragment key={`line_break_${index}`}>{"\n"}</Fragment>);
    }
  });

  return parts;
}

function getCardIllustration(definitionId: string) {
  return cardIllustrationMap[definitionId] ?? null;
}

function renderCardIllustration(definitionId: string, name: string) {
  void definitionId;
  void name;
  return null;
}

function getConnectedEffectConfig(card: CardDefinition): ConnectedEffectConfig | null {
  for (const effect of card.effects) {
    for (const operation of effect.operations) {
      if (operation.kind === "multiply_temp_magic_per_connected_attribute_count") {
        return {
          mode: "attribute",
          attribute: operation.attribute
        };
      }
      if (operation.kind === "multiply_base_attack_per_connected_enchanted_count") {
        return {
          mode: "enchanted",
          attribute: card.attribute
        };
      }
    }
  }
  return null;
}

function buildConnectedFieldGroups(field: CardInstance[]) {
  const groups: ConnectedFieldGroup[] = [];
  const seen = new Set<string>();

  field.forEach((card, index) => {
    const definition = cardMap[card.definitionId];
    if (!definition) {
      return;
    }
    const connectedConfig = getConnectedEffectConfig(definition);
    if (!connectedConfig) {
      return;
    }

    let start = index;
    let end = index;

    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const target = field[cursor];
      if (
        !target ||
        (connectedConfig.mode === "attribute"
          ? target.attribute !== connectedConfig.attribute
          : target.enchantments.length === 0)
      ) {
        break;
      }
      start = cursor;
    }

    for (let cursor = index + 1; cursor < field.length; cursor += 1) {
      const target = field[cursor];
      if (
        !target ||
        (connectedConfig.mode === "attribute"
          ? target.attribute !== connectedConfig.attribute
          : target.enchantments.length === 0)
      ) {
        break;
      }
      end = cursor;
    }

    if (start === end) {
      return;
    }

    const key = `${start}-${end}-${connectedConfig.mode}-${connectedConfig.attribute}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    groups.push({
      key,
      start,
      end,
      attribute: connectedConfig.attribute,
      instanceIds: field.slice(start, end + 1).map((entry) => entry.instanceId)
    });
  });

  return groups;
}

function getReferencedDefinitionIdsForCard(card: CardInstance | null, player: PlayerState | null) {
  if (!card || !player) {
    return [];
  }

  const definition = cardMap[card.definitionId];
  if (!definition) {
    return [];
  }

  const referencedDefinitionIds = new Set<string>();
  for (const effect of definition.effects) {
    for (const operation of effect.operations) {
      if (operation.kind === "repeat_previous_round_last_effect_as_self" && player.previousRoundLastEffectDefinitionId) {
        referencedDefinitionIds.add(player.previousRoundLastEffectDefinitionId);
      }
    }
  }

  return [...referencedDefinitionIds].filter((definitionId) => Boolean(cardMap[definitionId]));
}

export function App() {
  const initialRoute = useMemo(() => parseAppRoute(), []);
  const [appScreen, setAppScreen] = useState<AppScreen>(initialRoute.screen);
  const [soloSeed, setSoloSeed] = useState(initialRoute.soloSeed);
  const [lobbyId, setLobbyId] = useState(initialRoute.lobbyId);
  const [multiLobbyEntryId, setMultiLobbyEntryId] = useState(initialRoute.lobbyId);
  const [multiSeed, setMultiSeed] = useState(createDefaultSoloSeed());
  const [multiRoomState, setMultiRoomState] = useState<MultiRoomState | null>(null);
  const [multiConnectionState, setMultiConnectionState] = useState<MultiConnectionState>("idle");
  const [multiConnectionError, setMultiConnectionError] = useState<string | null>(null);
  const [multiWorkerUrl, setMultiWorkerUrl] = useState("");
  const [multiWorkerHealth, setMultiWorkerHealth] = useState<string>("idle");
  const [multiPlayerId] = useState(() => getOrCreateMultiPlayerId());
  const [multiPlayerName, setMultiPlayerName] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }
    const saved = window.localStorage.getItem(MULTI_PLAYER_NAME_STORAGE_KEY);
    return saved ?? "";
  });
  const [selectedRoleId, setSelectedRoleId] = useState(sampleRoles[0]?.id ?? "");
  const [game, setGame] = useState<LocalGameState | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isCardCatalogOpen, setIsCardCatalogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [audioVolume, setAudioVolume] = useState(() => getInitialAudioVolume());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [cardSearchText, setCardSearchText] = useState("");
  const [cardTypeFilter, setCardTypeFilter] = useState<"all" | CardType>("all");
  const [cardAttributeFilter, setCardAttributeFilter] = useState<"all" | Attribute>("all");
  const [inputStep, setInputStep] = useState<InputStep>("mulligan");
  const [mulliganIds, setMulliganIds] = useState<string[]>([]);
  const [previewFieldOrder, setPreviewFieldOrder] = useState<string[]>([]);
  const [draggedCard, setDraggedCard] = useState<DraggedCardState | null>(null);
  const [placementPreviewIndex, setPlacementPreviewIndex] = useState<number | null>(null);
  const [currentTargets, setCurrentTargets] = useState<Record<string, string>>({});
  const [tokenPlacementOrder, setTokenPlacementOrder] = useState<string[]>([]);
  const [availableTokenIds, setAvailableTokenIds] = useState<string[]>([]);
  const [draggedTokenId, setDraggedTokenId] = useState<string | null>(null);
  const [tokenPlacementPreviewIndex, setTokenPlacementPreviewIndex] = useState<number | null>(null);
  const [dolphinDuplicateSourceId, setDolphinDuplicateSourceId] = useState<string | null>(null);
  const [draggedDolphinDuplicateId, setDraggedDolphinDuplicateId] = useState<string | null>(null);
  const [dolphinDuplicatePreviewIndex, setDolphinDuplicatePreviewIndex] = useState<number | null>(null);
  const [roundEndDiscardIds, setRoundEndDiscardIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<HoveredCardState | null>(null);
  const [hoveredTooltipDetailDefinitionId, setHoveredTooltipDetailDefinitionId] = useState<string | null>(null);
  const [hoverTooltipHeight, setHoverTooltipHeight] = useState(260);
  const [soloRankings, setSoloRankings] = useState<SoloRankingEntry[]>(() => loadSoloRankings());
  const [particleBursts, setParticleBursts] = useState<ParticleBurst[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const fieldCardRefs = useRef(new Map<string, HTMLDivElement>());
  const statusBlockRefs = useRef(new Map<StatusKey, HTMLDivElement>());
  const lastProcessedReplayIndexRef = useRef(0);
  const lastProcessedLogIndexRef = useRef(0);
  const lastActivationRef = useRef<{ instanceId: string; attribute: Attribute } | null>(null);
  const previousStatusRef = useRef<StatSnapshot | null>(null);
  const particleTimeoutIdsRef = useRef<number[]>([]);
  const floatingTimeoutIdsRef = useRef<number[]>([]);
  const gameRef = useRef<LocalGameState | null>(null);
  const statusPanelRef = useRef<HTMLElement | null>(null);
  const placementRowRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const tooltipHideTimeoutRef = useRef<number | null>(null);
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const dragScrollVelocityRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activationToneCountRef = useRef(0);
  const savedRankingGameIdsRef = useRef(new Set<string>());
  const multiSocketRef = useRef<WebSocket | null>(null);

  const player = game?.players[0] ?? null;
  const latestHoveredCard = useMemo(() => {
    if (!hoveredCard) {
      return null;
    }

    return (
      player?.field.find((card) => card.instanceId === hoveredCard.card.instanceId) ??
      player?.hand.find((card) => card.instanceId === hoveredCard.card.instanceId) ??
      hoveredCard.card
    );
  }, [hoveredCard, player]);
  const pendingDolphinFinalAction =
    game?.pendingFinalAction?.kind === "dolphin_duplicate" ? game.pendingFinalAction : null;
  const pendingRoundBuffChoice = game?.pendingRoundBuffChoice ?? null;
  const activeRoleId = game ? player?.roleId ?? selectedRoleId : selectedRoleId;
  const activeRole = roleMap[activeRoleId];
  const selectedRole = roleMap[selectedRoleId];
  const currentMultiPlayer = useMemo(
    () => multiRoomState?.players.find((entry) => entry.playerId === multiPlayerId) ?? null,
    [multiRoomState, multiPlayerId]
  );
  const isMultiHost = multiRoomState?.hostPlayerId === multiPlayerId;
  const multiPlayers = multiRoomState?.players ?? [];
  const sharedMultiSeed = multiRoomState?.seed || multiSeed;
  const multiRoomLogEntries = useMemo(() => (multiRoomState?.log ? [...multiRoomState.log].reverse() : []), [multiRoomState?.log]);
  const allMultiPlayersReady = multiPlayers.length > 0 && multiPlayers.every((entry) => entry.ready);
  const canStartMultiMatch = Boolean(isMultiHost && multiPlayers.length >= 2 && allMultiPlayersReady);
  const roundBuffCatalog = game?.roundBuffCatalog ?? sampleRoundBuffs;
  const roundBuffMap = useMemo(
    () => Object.fromEntries(roundBuffCatalog.map((buff) => [buff.id, buff] as const)),
    [roundBuffCatalog]
  );
  const selectedRoundBuffs = useMemo<RoundBuffPresentation[]>(
    () =>
      (player?.selectedRoundBuffs ?? []).map((entry) => ({
        ...(roundBuffMap[entry.buffId] ?? {
          id: entry.buffId,
          name: entry.buffId,
          description: "Unknown round buff.",
          iconAsset: null
        }),
        instanceId: entry.instanceId
      })),
    [player?.selectedRoundBuffs, roundBuffMap]
  );
  const selectedRoundBuffIds = useMemo(() => selectedRoundBuffs.map((buff) => buff.id), [selectedRoundBuffs]);
  const restrictedTypes = activeRole?.restrictions?.disallowCardTypes ?? [];
  const filteredRoles = useMemo(() => {
    return sampleRoles.filter((role) => {
      const hasRestrictions = (role.restrictions?.disallowCardTypes?.length ?? 0) > 0;
      switch (roleFilter) {
        case "attack":
          return role.initialBaseAttack > role.initialBaseMagic;
        case "magic":
          return role.initialBaseMagic > role.initialBaseAttack;
        case "restricted":
          return hasRestrictions;
        case "open":
          return !hasRestrictions;
        default:
          return true;
      }
    });
  }, [roleFilter]);
  const placementLimit = (player?.roundPlacementLimit ?? 5) + getRoundBuffPlacementLimitBonus(selectedRoundBuffIds);
  const navigateToScreen = (nextScreen: AppScreen, options?: { soloSeed?: string; lobbyId?: string; replace?: boolean }) => {
    const nextSoloSeed = options?.soloSeed ? sanitizeRouteToken(options.soloSeed, createDefaultSoloSeed()) : soloSeed;
    const nextLobbyId = options?.lobbyId ? sanitizeRouteToken(options.lobbyId, createDefaultLobbyId()) : lobbyId;
    const nextPath = buildAppPath(nextScreen, { soloSeed: nextSoloSeed, lobbyId: nextLobbyId });
    if (typeof window !== "undefined") {
      const method = options?.replace ? "replaceState" : "pushState";
      window.history[method](null, "", nextPath);
    }
    setSoloSeed(nextSoloSeed);
    setLobbyId(nextLobbyId);
    setAppScreen(nextScreen);
  };
  const multiInviteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return buildAppPath("multi_lobby", { lobbyId });
    }
    return `${window.location.origin}${buildAppPath("multi_lobby", { lobbyId })}`;
  }, [lobbyId]);
  const filteredCatalogCards = useMemo(() => {
    const normalizedSearch = cardSearchText.trim();
    return sampleCards.filter((card) => {
      if (cardTypeFilter !== "all" && card.type !== cardTypeFilter) {
        return false;
      }
      if (cardAttributeFilter !== "all" && card.attribute !== cardAttributeFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return (
        card.name.includes(normalizedSearch) ||
        card.text.includes(normalizedSearch) ||
        resolveCardTypeLabel(card.type).includes(normalizedSearch) ||
        resolveAttributeLabel(card.attribute).includes(normalizedSearch)
      );
    });
  }, [cardAttributeFilter, cardSearchText, cardTypeFilter]);
  const logGroups = useMemo(() => buildLogGroups(game?.log ?? []), [game?.log]);
  const attributeAppearanceRates = useMemo(() => {
    if (!player) {
      return [];
    }

    const deckCounts = ATTRIBUTE_ORDER.reduce<Record<Attribute, number>>((accumulator, attribute) => {
      accumulator[attribute] = player.deck.filter((card) => card.attribute === attribute).length;
      return accumulator;
    }, {} as Record<Attribute, number>);

    const weights = ATTRIBUTE_ORDER.reduce<Record<Attribute, number>>((accumulator, attribute) => {
      const remainingCount = deckCounts[attribute];
      accumulator[attribute] =
        remainingCount > 0
          ? Math.max(
              1,
              1 +
                (player.drawAttributeWeights[attribute] ?? 0) +
                getRoundBuffDrawWeightBonus(selectedRoundBuffIds, attribute)
            )
          : 0;
      return accumulator;
    }, {} as Record<Attribute, number>);

    const totalWeight = ATTRIBUTE_ORDER.reduce((sum, attribute) => sum + weights[attribute], 0);

    return ATTRIBUTE_ORDER.map((attribute) => ({
      attribute,
      remainingCount: deckCounts[attribute],
      weight: weights[attribute],
      percentage: totalWeight > 0 ? (weights[attribute] / totalWeight) * 100 : 0
    }));
  }, [player, selectedRoundBuffIds]);
  const referencedDefinitionIds = useMemo(
    () => getReferencedDefinitionIdsForCard(latestHoveredCard, player),
    [latestHoveredCard, player]
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (game?.phase === "input" && player) {
      setInputStep("mulligan");
      setMulliganIds([]);
      setPreviewFieldOrder(player.field.map((card) => card.instanceId));
      setDraggedCard(null);
      setCurrentTargets({});
      setAvailableTokenIds([]);
      setRoundEndDiscardIds([]);
      setDolphinDuplicateSourceId(null);
      setDraggedDolphinDuplicateId(null);
      setDolphinDuplicatePreviewIndex(null);
      setError(null);
    }
  }, [game?.phase, game?.round]);

  useEffect(() => {
    return () => {
      for (const timeoutId of particleTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }
      particleTimeoutIdsRef.current = [];
      for (const timeoutId of floatingTimeoutIdsRef.current) {
        window.clearTimeout(timeoutId);
      }
      floatingTimeoutIdsRef.current = [];
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
      }
      if (tooltipHideTimeoutRef.current !== null) {
        window.clearTimeout(tooltipHideTimeoutRef.current);
      }
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, `${audioVolume}`);
  }, [audioVolume]);

  useEffect(() => {
    const handlePopState = () => {
      const route = parseAppRoute();
      setSoloSeed(route.soloSeed);
      setLobbyId(route.lobbyId);
      setAppScreen(route.screen);
      if (route.screen !== "solo_battle") {
        setGame((current) => (route.screen === "solo_setup" && current ? current : null));
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!game || game.phase !== "finished" || savedRankingGameIdsRef.current.has(game.gameId)) {
      return;
    }

    const role = roleMap[game.players[0]?.roleId ?? ""];
    const entry: SoloRankingEntry = {
      gameId: game.gameId,
      seed: game.rngSeed,
      roleId: game.players[0]?.roleId ?? "",
      roleName: role?.name ?? game.players[0]?.roleId ?? "不明",
      totalScore: game.players[0]?.totalScore ?? 0,
      completedAt: new Date().toISOString()
    };
    const nextEntries = [...soloRankings.filter((current) => current.gameId !== game.gameId), entry].sort(
      (left, right) => right.totalScore - left.totalScore || right.completedAt.localeCompare(left.completedAt)
    );
    savedRankingGameIdsRef.current.add(game.gameId);
    setSoloRankings(nextEntries);
    saveSoloRankings(nextEntries);
  }, [game, soloRankings]);

  useEffect(() => {
    saveMultiPlayerName(multiPlayerName);
  }, [multiPlayerName]);

  useEffect(() => {
    if (appScreen !== "multi_lobby" && appScreen !== "multi_match") {
      setMultiWorkerUrl("");
      setMultiWorkerHealth("idle");
      return;
    }

    let cancelled = false;
    try {
      const resolvedUrl = resolveRoomWorkerBaseUrl();
      setMultiWorkerUrl(resolvedUrl);
      setMultiWorkerHealth("checking");
      void fetchRoomWorkerHealth()
        .then((health) => {
          if (cancelled) {
            return;
          }
          setMultiWorkerHealth(health.ok ? `ok (${health.runtime ?? "worker"})` : "error");
        })
        .catch((caught) => {
          if (cancelled) {
            return;
          }
          setMultiWorkerHealth(caught instanceof Error ? `error: ${caught.message}` : "error");
        });
    } catch (caught) {
      setMultiWorkerUrl("");
      setMultiWorkerHealth("error");
      setMultiConnectionError(caught instanceof Error ? caught.message : "Room worker URL resolution failed");
    }

    return () => {
      cancelled = true;
    };
  }, [appScreen]);

  useEffect(() => {
    if (appScreen !== "multi_lobby" && appScreen !== "multi_match") {
      multiSocketRef.current?.close();
      multiSocketRef.current = null;
      setMultiConnectionState("idle");
      setMultiConnectionError(null);
      setMultiRoomState(null);
      return;
    }

    let cancelled = false;
    setMultiConnectionState("connecting");
    setMultiConnectionError(null);

    const connect = async () => {
      try {
        const joined = await joinRoom(lobbyId, {
          playerId: multiPlayerId,
          displayName: multiPlayerName,
          seed: multiSeed
        });
        if (cancelled) {
          return;
        }
        setMultiRoomState(joined);
        if (joined.seed) {
          setMultiSeed(joined.seed);
        }
        setMultiConnectionState("connected");

        multiSocketRef.current?.close();
        multiSocketRef.current = openRoomSocket(lobbyId, multiPlayerId, {
          onState: (nextState) => {
            if (cancelled) {
              return;
            }
            setMultiRoomState(nextState);
            if (nextState.seed) {
              setMultiSeed(nextState.seed);
            }
            if (appScreen === "multi_lobby" && nextState.phase === "match") {
              navigateToScreen("multi_match", { lobbyId, replace: true });
            }
            if (appScreen === "multi_match" && nextState.phase === "lobby") {
              navigateToScreen("multi_lobby", { lobbyId, replace: true });
            }
          },
          onOpen: () => {
            if (!cancelled) {
              setMultiConnectionState("connected");
            }
          },
          onClose: () => {
            if (!cancelled) {
              setMultiConnectionState("error");
              setMultiConnectionError("接続が切断されました。");
            }
          },
          onError: () => {
            if (!cancelled) {
              setMultiConnectionState("error");
              setMultiConnectionError("ルーム接続に失敗しました。");
            }
          }
        });      } catch (caught) {
        if (cancelled) {
          return;
        }
        setMultiConnectionState("error");
        setMultiConnectionError(
          caught instanceof Error
            ? `${caught.message}${multiWorkerUrl ? ` | worker: ${multiWorkerUrl}` : ""}`
            : "Failed to connect to room worker"
        );
      }
    };

    connect();

    return () => {
      cancelled = true;
      multiSocketRef.current?.close();
      multiSocketRef.current = null;
    };
  }, [appScreen, lobbyId, multiPlayerId, multiPlayerName, multiSeed, multiWorkerUrl]);

  useEffect(() => {
    const primeAudio = () => {
      if (audioVolume <= 0) {
        return;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new window.AudioContext();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => undefined);
      }
    };

    window.addEventListener("pointerdown", primeAudio);
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
    };
  }, [audioVolume]);

  const playActivationTone = (attribute: Attribute) => {
    if (audioVolume <= 0 || typeof window === "undefined") {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }
    const audioContext = audioContextRef.current;
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => undefined);
    }
    const semitone = ACTIVATION_TONE_STEPS[activationToneCountRef.current % ACTIVATION_TONE_STEPS.length] ?? 0;
    const baseFrequency = 261.63;
    const frequency = baseFrequency * 2 ** (semitone / 12);
    const waveformByAttribute: Record<Attribute, OscillatorType> = {
      none: "sine",
      fire: "triangle",
      water: "sine",
      ice: "triangle",
      wind: "sawtooth",
      thunder: "square",
      earth: "triangle",
      dark: "sine"
    };

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = waveformByAttribute[attribute] ?? "sine";
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, audioVolume / 2200), audioContext.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.24);
  };

  useEffect(() => {
    const tick = () => {
      const container = placementRowRef.current;
      if (container && dragScrollVelocityRef.current !== 0) {
        container.scrollLeft += dragScrollVelocityRef.current;
      }
      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!game) {
      lastProcessedReplayIndexRef.current = 0;
      lastProcessedLogIndexRef.current = 0;
      lastActivationRef.current = null;
      previousStatusRef.current = null;
      setParticleBursts([]);
      setFloatingTexts([]);
      return;
    }

    const newEvents = game.replayEvents.slice(lastProcessedReplayIndexRef.current);
    const newLogs = game.log.slice(lastProcessedLogIndexRef.current);
    if (newEvents.length === 0 && newLogs.length === 0) {
      return;
    }

    const spawnBurst = (attribute: Attribute, kind: ParticleKind, anchorInstanceId?: string | null) => {
      const anchorElement = anchorInstanceId ? fieldCardRefs.current.get(anchorInstanceId) ?? null : null;
      const anchorRect = anchorElement?.getBoundingClientRect();
      const statusRect = statusPanelRef.current?.getBoundingClientRect();
      const fallback = getViewportFallbackPosition();
      const x =
        anchorRect?.left !== undefined
          ? anchorRect.left + anchorRect.width / 2
          : statusRect
            ? statusRect.left + statusRect.width * 0.5
            : fallback.x;
      const y =
        anchorRect?.top !== undefined
          ? anchorRect.top + anchorRect.height / 2
          : statusRect
            ? statusRect.top + Math.min(statusRect.height * 0.4, 120)
            : fallback.y;

      const burstId = `burst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const burst: ParticleBurst = {
        id: burstId,
        x,
        y,
        attribute,
        kind,
        sprites: createParticleSprites(attribute, kind)
      };
      setParticleBursts((current) => [...current, burst]);
      const timeoutId = window.setTimeout(() => {
        setParticleBursts((current) => current.filter((entry) => entry.id !== burstId));
        particleTimeoutIdsRef.current = particleTimeoutIdsRef.current.filter((entry) => entry !== timeoutId);
      }, 1200);
      particleTimeoutIdsRef.current.push(timeoutId);
    };

    const spawnFloatingText = (
      tone: FloatingTextTone,
      text: string,
      anchor: { x: number; y: number },
      scope: "status" | "card",
      offset?: { x?: number; y?: number }
    ) => {
      const floatingId = `floating_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setFloatingTexts((current) => [
        ...current,
        {
          id: floatingId,
          x: anchor.x + (offset?.x ?? 0),
          y: anchor.y + (offset?.y ?? 0),
          text,
          tone,
          scope
        }
      ]);
      const timeoutId = window.setTimeout(() => {
        setFloatingTexts((current) => current.filter((entry) => entry.id !== floatingId));
        floatingTimeoutIdsRef.current = floatingTimeoutIdsRef.current.filter((entry) => entry !== timeoutId);
      }, 1500);
      floatingTimeoutIdsRef.current.push(timeoutId);
    };

    const getStatusAnchor = (key: StatusKey) => {
      const rect = statusBlockRefs.current.get(key)?.getBoundingClientRect();
      if (!rect) {
        const fallback = getViewportFallbackPosition();
        return { x: fallback.x, y: fallback.y };
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height * 0.28
      };
    };

    const getCardAnchor = () => {
      const activeInstanceId = lastActivationRef.current?.instanceId;
      const rect = activeInstanceId ? fieldCardRefs.current.get(activeInstanceId)?.getBoundingClientRect() : null;
      if (!rect) {
        const fallback = getViewportFallbackPosition();
        return { x: fallback.x, y: fallback.y };
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height * 0.24
      };
    };

    for (const event of newEvents) {
      handleReplayEventParticle(event, spawnBurst, lastActivationRef);

      if (event.type === "ROUND_START") {
        activationToneCountRef.current = 0;
      }

      if (event.type === "CARD_ACTIVATED") {
        playActivationTone(event.attribute);
        activationToneCountRef.current += 1;
      }

      if (event.type === "STATUS_CHANGED") {
        const previous = previousStatusRef.current;
        const nextSnapshot: StatSnapshot = {
          baseAttack: event.baseAttack,
          baseMagic: event.baseMagic,
          tempAttack: event.tempAttack,
          tempMagic: event.tempMagic,
          scoreThisRound: game.players[0]?.scoreThisRound ?? 0,
          totalScore: game.players[0]?.totalScore ?? 0
        };

        if (previous) {
          const statusDiffs: Array<{ key: StatusKey; delta: number }> = [
            { key: "baseAttack", delta: nextSnapshot.baseAttack - previous.baseAttack },
            { key: "tempAttack", delta: nextSnapshot.tempAttack - previous.tempAttack },
            { key: "baseMagic", delta: nextSnapshot.baseMagic - previous.baseMagic },
            { key: "tempMagic", delta: nextSnapshot.tempMagic - previous.tempMagic }
          ];

          for (const diff of statusDiffs) {
            if (diff.delta !== 0) {
              spawnFloatingText("red", formatSignedValue(diff.delta), getStatusAnchor(diff.key), "status");
            }
          }
        }
        previousStatusRef.current = {
          baseAttack: nextSnapshot.baseAttack,
          baseMagic: nextSnapshot.baseMagic,
          tempAttack: nextSnapshot.tempAttack,
          tempMagic: nextSnapshot.tempMagic,
          scoreThisRound: game.players[0]?.scoreThisRound ?? nextSnapshot.scoreThisRound,
          totalScore: game.players[0]?.totalScore ?? nextSnapshot.totalScore
        };
      }

      if (event.type === "DAMAGE_DEALT") {
        spawnFloatingText("red", `+${formatDisplayNumber(event.amount)}`, getStatusAnchor("scoreThisRound"), "status");
        spawnFloatingText("red", `+${formatDisplayNumber(event.amount)}`, getStatusAnchor("totalScore"), "status");
      }

      if (event.type === "FINAL_ATTACK") {
        spawnFloatingText("red", `+${formatDisplayNumber(event.amount)}`, getStatusAnchor("scoreThisRound"), "status");
        spawnFloatingText("red", `+${formatDisplayNumber(event.amount)}`, getStatusAnchor("totalScore"), "status");
      }
    }

    for (const entry of newLogs) {
      if (entry.code !== "CARD_EFFECT_APPLIED") {
        continue;
      }

      const deltaTexts = Array.isArray(entry.meta?.deltaTexts)
        ? entry.meta.deltaTexts.filter((value): value is string => typeof value === "string")
        : [];
      if (deltaTexts.length === 0) {
        continue;
      }

      const tone = entry.meta?.sourceKind === "enchant" ? "purple" : "red";
      const anchor = getCardAnchor();
      deltaTexts.forEach((text, index) => {
        spawnFloatingText(
          tone,
          text,
          { x: anchor.x, y: anchor.y - index * 18 },
          "card",
          tone === "purple"
            ? { x: 54, y: -12 }
            : { x: -30, y: 0 }
        );
      });
    }

    lastProcessedReplayIndexRef.current = game.replayEvents.length;
    lastProcessedLogIndexRef.current = game.log.length;
  }, [game]);

  useEffect(() => {
    if (!player) {
      previousStatusRef.current = null;
      return;
    }

    previousStatusRef.current = {
      baseAttack: player.baseAttack,
      baseMagic: player.baseMagic,
      tempAttack: player.tempAttack,
      tempMagic: player.tempMagic,
      scoreThisRound: player.scoreThisRound,
      totalScore: player.totalScore
    };
  }, [player?.playerId]);

  const previewCards = useMemo(() => {
    if (!player) {
      return [];
    }

    return previewFieldOrder
      .map((instanceId) => {
        return (
          player.field.find((card) => card.instanceId === instanceId) ??
          player.hand.find((card) => card.instanceId === instanceId) ??
          null
        );
      })
      .filter((card): card is CardInstance => Boolean(card));
  }, [player, previewFieldOrder]);

  const draggedPreviewCard = useMemo(() => {
    if (!player || !draggedCard) {
      return null;
    }

    return (
      player.hand.find((entry) => entry.instanceId === draggedCard.instanceId) ??
      player.field.find((entry) => entry.instanceId === draggedCard.instanceId) ??
      null
    );
  }, [draggedCard, player]);

  const placementBaseCards = useMemo(() => previewCards, [previewCards]);

  const currentResolutionCard = useMemo(() => (game ? getCurrentResolutionCard(game) : null), [game]);
  const currentResolutionOperations = useMemo(() => {
    if (!currentResolutionCard) {
      return [];
    }
    return getTargetOperations(cardMap[currentResolutionCard.definitionId]);
  }, [currentResolutionCard]);
  const currentTokenPlacementRequirement = useMemo<TokenPlacementRequirement | null>(() => {
    if (!currentResolutionCard) {
      return null;
    }

    const definition = cardMap[currentResolutionCard.definitionId];
    for (const effect of definition.effects) {
      for (const operation of effect.operations) {
        if (operation.kind !== "create_token" || operation.position !== "chosen_positions") {
          continue;
        }
        const tokenDefinition = cardMap[operation.tokenDefinitionId];
        return {
          selectionKey: getTokenPlacementSelectionKey(effect.id, operation.tokenDefinitionId),
          tokenDefinitionId: operation.tokenDefinitionId,
          tokenName: tokenDefinition?.name ?? "Token",
          count: operation.count
        };
      }
    }

    return null;
  }, [currentResolutionCard]);
  const tokenPlaceholderIds = useMemo(
    () =>
      currentTokenPlacementRequirement
        ? Array.from(
            { length: currentTokenPlacementRequirement.count },
            (_, index) => `${currentTokenPlacementRequirement.selectionKey}:preview:${index}`
          )
        : [],
    [currentTokenPlacementRequirement]
  );
  const activeTargetOperation = useMemo(
    () => currentResolutionOperations.find((operation) => !currentTargets[operation.key]) ?? null,
    [currentResolutionOperations, currentTargets]
  );
  const editableTargetOperation = useMemo(() => {
    if (activeTargetOperation) {
      return activeTargetOperation;
    }
    if (currentResolutionOperations.length === 1) {
      return currentResolutionOperations[0] ?? null;
    }
    return null;
  }, [activeTargetOperation, currentResolutionOperations]);
  const selectedTargetInstanceIds = useMemo(
    () => new Set(Object.values(currentTargets).filter((value): value is string => Boolean(value))),
    [currentTargets]
  );

  const currentSelectableTargets = useMemo(() => {
    if (!player || !currentResolutionCard) {
      return [];
    }
    return player.field;
  }, [player, currentResolutionCard]);

  const visibleHandCards = useMemo(() => {
    if (!player) {
      return [];
    }

    const placedFromHandIds = new Set(
      previewFieldOrder.filter((instanceId) => player.field.every((card) => card.instanceId !== instanceId))
    );
    return player.hand.filter((card) => !placedFromHandIds.has(card.instanceId));
  }, [player, previewFieldOrder]);

  const tokenPlacementPreviewItems = useMemo(() => {
    if (!player || !currentTokenPlacementRequirement) {
      return [];
    }

    return tokenPlacementOrder.map((entry) => {
      const fieldCard = player.field.find((card) => card.instanceId === entry);
      if (fieldCard) {
        return {
          kind: "field" as const,
          id: entry,
          card: fieldCard
        };
      }

      return {
        kind: "token" as const,
        id: entry
      };
    });
  }, [currentTokenPlacementRequirement, player, tokenPlacementOrder]);
  const dolphinDuplicateSourceCard = useMemo(
    () => player?.field.find((card) => card.instanceId === dolphinDuplicateSourceId) ?? null,
    [dolphinDuplicateSourceId, player]
  );
  const dolphinDuplicatePreviewItems = useMemo(() => {
    if (!player || !pendingDolphinFinalAction || !dolphinDuplicateSourceId) {
      return [];
    }

    return player.field.map((card) => ({
      kind: "field" as const,
      id: card.instanceId,
      card
    }));
  }, [dolphinDuplicateSourceId, pendingDolphinFinalAction, player]);
  const tokenPlaceholderItems = useMemo(() => availableTokenIds.map((entry) => ({ id: entry })), [availableTokenIds]);
  const overlayPreviewCard = useMemo(() => {
    if (currentTokenPlacementRequirement) {
      return {
        definitionId: currentTokenPlacementRequirement.tokenDefinitionId,
        name: currentTokenPlacementRequirement.tokenName,
        attribute: "water" as const,
        type: cardMap[currentTokenPlacementRequirement.tokenDefinitionId]?.type ?? "ability"
      };
    }
    if (pendingDolphinFinalAction && dolphinDuplicateSourceCard) {
      return {
        definitionId: dolphinDuplicateSourceCard.definitionId,
        name: dolphinDuplicateSourceCard.name,
        attribute: dolphinDuplicateSourceCard.attribute,
        type: dolphinDuplicateSourceCard.type
      };
    }
    return null;
  }, [currentTokenPlacementRequirement, dolphinDuplicateSourceCard, pendingDolphinFinalAction]);
  const overlayPlacementPreviewIndex = currentTokenPlacementRequirement
    ? tokenPlacementPreviewIndex
    : pendingDolphinFinalAction
      ? dolphinDuplicatePreviewIndex
      : null;

  const connectedFieldGroups = useMemo(() => {

    if (!player || inputStep === "placement") {
      return [];
    }
    return buildConnectedFieldGroups(player.field);
  }, [inputStep, player]);

  useEffect(() => {
    if (!game?.pendingResolution) {
      return;
    }

    if (!currentResolutionCard) {
      const timeoutId = window.setTimeout(() => {
        const currentGame = gameRef.current;
        if (!currentGame) {
          return;
        }
        try {
          const nextState = resolveNextCard(currentGame, {});
          setGame(nextState);
          setError(null);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "Failed to auto-resolve card effect.");
        }
      }, AUTO_RESOLVE_DELAY_MS);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const targetKeys = getCurrentResolutionTargetKeys(game);
    const hasTargets = targetKeys.length > 0;
    if (hasTargets || currentTokenPlacementRequirement) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const currentGame = gameRef.current;
      if (!currentGame) {
        return;
      }
      try {
        const nextState = resolveNextCard(currentGame, {});
        setGame(nextState);
        setError(null);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Failed to auto-resolve card effect.");
      }
    }, AUTO_RESOLVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [game, currentResolutionCard, currentTokenPlacementRequirement]);

  useEffect(() => {
    setCurrentTargets({});
  }, [currentResolutionCard?.instanceId]);

  useEffect(() => {
    if (!currentTokenPlacementRequirement || !player) {
      setTokenPlacementOrder([]);
      setAvailableTokenIds([]);
      setDraggedTokenId(null);
      setTokenPlacementPreviewIndex(null);
      return;
    }

    setTokenPlacementOrder([...player.field.map((card) => card.instanceId)]);
    setAvailableTokenIds(tokenPlaceholderIds);
    setDraggedTokenId(null);
    setTokenPlacementPreviewIndex(null);
  }, [currentTokenPlacementRequirement?.selectionKey, player?.field, tokenPlaceholderIds]);

  useEffect(() => {
    if (!pendingDolphinFinalAction || !player) {
      setDolphinDuplicateSourceId(null);
      setDraggedDolphinDuplicateId(null);
      setDolphinDuplicatePreviewIndex(null);
      return;
    }

    setDolphinDuplicateSourceId(null);
    setDraggedDolphinDuplicateId(null);
    setDolphinDuplicatePreviewIndex(null);
  }, [pendingDolphinFinalAction, player]);

  const startGame = () => {
    const normalizedSeed = sanitizeRouteToken(soloSeed, createDefaultSoloSeed());
    setSoloSeed(normalizedSeed);
    setGame(
      createLocalGame({
        roleId: selectedRoleId,
        cards: sampleCards,
        roles: sampleRoles,
        roundBuffs: sampleRoundBuffs,
        seed: normalizedSeed
      })
    );
    navigateToScreen("solo_battle", { soloSeed: normalizedSeed, replace: true });
  };

  const actionFocusCard = currentResolutionCard ?? dolphinDuplicateSourceCard ?? null;
  const actionFocusDefinition = actionFocusCard ? cardMap[actionFocusCard.definitionId] : null;

  const renderFieldCard = (card: CardInstance, options?: { isDragOriginPlaceholder?: boolean }) => (
    <div
      key={card.instanceId}
      className={`card-chip ${options?.isDragOriginPlaceholder ? "is-drag-origin-placeholder" : ""} ${card.isInvalidated ? "is-invalidated" : ""} ${currentResolutionCard?.instanceId === card.instanceId ? "is-resolving" : ""} ${
        selectedTargetInstanceIds.has(card.instanceId) ||
        (game?.phase === "round_end" && roundEndDiscardIds.includes(card.instanceId)) ||
        (!!pendingDolphinFinalAction && dolphinDuplicateSourceId === card.instanceId)
          ? "is-selected"
          : ""
      } ${
        game?.phase === "input" &&
        inputStep === "resolving" &&
        !!editableTargetOperation &&
        currentSelectableTargets.some((target) => target.instanceId === card.instanceId)
          ? "is-targetable"
          : ""
      }`}
      data-attribute={resolveVisualAttribute(card.attribute)}
      ref={(element) => setFieldCardRef(card.instanceId, element)}
      onMouseEnter={(event) => showCardTooltip(card, event.currentTarget)}
      onMouseLeave={hideCardTooltip}
      onClick={
        pendingDolphinFinalAction
          ? () => setDolphinDuplicateSourceId(card.instanceId)
          : game?.phase === "round_end" && !pendingRoundBuffChoice
            ? () => toggleRoundEndDiscard(card.instanceId)
            : game?.phase === "input" &&
                inputStep === "resolving" &&
                !!editableTargetOperation &&
                currentSelectableTargets.some((target) => target.instanceId === card.instanceId)
              ? () => selectCurrentTargetCard(card.instanceId)
              : undefined
      }
    >
      {options?.isDragOriginPlaceholder ? (
        <div className="drag-origin-placeholder-label">
          <strong>移動中</strong>
          <small>元の位置</small>
        </div>
      ) : (
        <>
          {renderCardIllustration(card.definitionId, card.name)}
          <div className="card-title-row">
            <span>{card.name}</span>
          </div>
          <small>{resolveCardTypeLabel(card.type)}</small>
          {card.isInvalidated ? <small>このラウンドは無効</small> : null}
          {game?.phase === "round_end" && !pendingRoundBuffChoice ? (
            <small>{roundEndDiscardIds.includes(card.instanceId) ? "捨て札に選択中" : "クリックで捨て札に選択"}</small>
          ) : null}
        </>
      )}
    </div>
  );

  const toggleMulligan = (instanceId: string) => {
    setMulliganIds((current) =>
      current.includes(instanceId) ? current.filter((id) => id !== instanceId) : [...current, instanceId]
    );
  };

  const confirmMulligan = () => {
    if (!game) {
      return;
    }

    try {
      const nextState = mulliganIds.length > 0 ? applyMulliganOnly(game, mulliganIds) : game;
      setGame(nextState);
      setInputStep("placement");
      setMulliganIds([]);
      setPreviewFieldOrder(nextState.players[0].field.map((card) => card.instanceId));
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to resolve mulligan.");
    }
  };

  const handleHandDragStart = (instanceId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", instanceId);
    setHoveredCard(null);
    setHoveredTooltipDetailDefinitionId(null);
    setDraggedCard({
      instanceId,
      source: "hand"
    });
    window.requestAnimationFrame(() => {
      setPlacementPreviewIndex(previewFieldOrder.length);
    });
  };

  const handleFieldDragStart = (instanceId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", instanceId);
    setHoveredCard(null);
    setHoveredTooltipDetailDefinitionId(null);
    setDraggedCard({
      instanceId,
      source: "field"
    });
    const currentIndex = previewFieldOrder.findIndex((entry) => entry === instanceId);
    window.requestAnimationFrame(() => {
      setPlacementPreviewIndex(currentIndex >= 0 ? currentIndex : previewFieldOrder.length);
    });
  };

  const updatePlacementAutoScroll = (clientX: number) => {
    const container = placementRowRef.current;
    if (!container) {
      dragScrollVelocityRef.current = 0;
      return;
    }

    const rect = container.getBoundingClientRect();
    const edgeThreshold = 88;
    const maxSpeed = 24;
    const leftDistance = clientX - rect.left;
    const rightDistance = rect.right - clientX;

    if (leftDistance >= 0 && leftDistance < edgeThreshold) {
      dragScrollVelocityRef.current = -maxSpeed * (1 - leftDistance / edgeThreshold);
      return;
    }

    if (rightDistance >= 0 && rightDistance < edgeThreshold) {
      dragScrollVelocityRef.current = maxSpeed * (1 - rightDistance / edgeThreshold);
      return;
    }

    dragScrollVelocityRef.current = 0;
  };

  const stopPlacementAutoScroll = () => {
    dragScrollVelocityRef.current = 0;
  };

  const handlePlacementDragOver = (dropIndex: number, clientX: number) => {
    updatePlacementAutoScroll(clientX);
    setPlacementPreviewIndex(dropIndex);
  };

  const handlePlacementCardDragOver = (cardIndex: number, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    updatePlacementAutoScroll(event.clientX);
    const rect = event.currentTarget.getBoundingClientRect();
    const isLeftHalf = event.clientX < rect.left + rect.width / 2;
    setPlacementPreviewIndex(isLeftHalf ? cardIndex : cardIndex + 1);
  };

  const handlePlacementRowDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    updatePlacementAutoScroll(event.clientX);
    if (!draggedCard) {
      return;
    }

    if (placementBaseCards.length === 0) {
      setPlacementPreviewIndex(0);
      return;
    }

    const rowRect = event.currentTarget.getBoundingClientRect();
    const lastCard = placementBaseCards[placementBaseCards.length - 1];
    const lastCardRect = lastCard ? fieldCardRefs.current.get(lastCard.instanceId)?.getBoundingClientRect() : null;
    if (!lastCardRect) {
      return;
    }

    const inRightBlankArea = event.clientX >= lastCardRect.right && event.clientX <= rowRect.right;
    if (inRightBlankArea) {
      setPlacementPreviewIndex(placementBaseCards.length);
    }
  };

  const handleHandReturnDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!canReturnPlacedCardToHand(player?.hand, draggedCard)) {
      return;
    }
    event.preventDefault();
    stopPlacementAutoScroll();
    setPlacementPreviewIndex(null);
  };

  const handleDropBackToHand = () => {
    if (!player || !canReturnPlacedCardToHand(player.hand, draggedCard)) {
      return;
    }
    setPreviewFieldOrder((current) => current.filter((entry) => entry !== draggedCard?.instanceId));
    setDraggedCard(null);
    setPlacementPreviewIndex(null);
    setError(null);
  };

  const handleDropAt = (dropIndex: number) => {
    if (!player || !draggedCard) {
      return;
    }

    const handCard = player.hand.find((entry) => entry.instanceId === draggedCard.instanceId);
    const fieldCard = player.field.find((entry) => entry.instanceId === draggedCard.instanceId);
    const card = handCard ?? fieldCard ?? null;
    if (!card) {
      setDraggedCard(null);
      return;
    }

    if (draggedCard.source === "hand" && restrictedTypes.includes(card.type)) {
      setError(`${card.name} cannot be placed by the selected role.`);
      setDraggedCard(null);
      return;
    }

    setPreviewFieldOrder((current) => {
      const placedCount = current.filter((instanceId) => player.hand.some((handCardEntry) => handCardEntry.instanceId === instanceId)).length;
      const alreadyPlaced = current.includes(draggedCard.instanceId);
      if (!alreadyPlaced && placedCount >= placementLimit) {
        setError(`You can place at most ${placementLimit} cards this round.`);
        return current;
      }

      const originalIndex = current.indexOf(draggedCard.instanceId);
      const withoutDragged = current.filter((instanceId) => instanceId !== draggedCard.instanceId);
      const next = [...withoutDragged];
      const adjustedDropIndex =
        draggedCard.source === "field" && originalIndex >= 0 && originalIndex < dropIndex ? dropIndex - 1 : dropIndex;
      next.splice(Math.max(0, Math.min(adjustedDropIndex, next.length)), 0, draggedCard.instanceId);
      return next;
    });

    setDraggedCard(null);
    setPlacementPreviewIndex(null);
    setError(null);
  };

  const beginResolution = () => {
    if (!game || !player) {
      return;
    }

    try {
      const nextState = startRoundResolution(game, previewFieldOrder);
      setGame(nextState);
      setInputStep("resolving");
      setCurrentTargets({});
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to start resolution.");
    }
  };

  const confirmCurrentTargetsAndResolve = () => {
    if (!game || !currentResolutionCard) {
      return;
    }

    const targetKeys = getCurrentResolutionTargetKeys(game);
    const missingKey = targetKeys.find((key) => !currentTargets[key]);
    if (missingKey) {
      setError(`${currentResolutionCard.name} still needs a target.`);
      return;
    }
    if (currentTokenPlacementRequirement && tokenPlacementOrder.length === 0) {
      setError(`${currentResolutionCard.name} still needs token placement.`);
      return;
    }

    try {
      const nextTargets = currentTokenPlacementRequirement
        ? {
            ...currentTargets,
            [currentTokenPlacementRequirement.selectionKey]: JSON.stringify(tokenPlacementOrder)
          }
        : currentTargets;
      const nextState = resolveNextCard(game, nextTargets);
      setGame(nextState);
      setCurrentTargets({});
      setTokenPlacementOrder([]);
      setDraggedTokenId(null);
      setTokenPlacementPreviewIndex(null);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to resolve card effect.");
    }
  };

  const selectCurrentTargetCard = (instanceId: string) => {
    if (!editableTargetOperation) {
      return;
    }

    setCurrentTargets((current) => ({
      ...current,
      [editableTargetOperation.key]: instanceId
    }));
    setError(null);
  };

  const handleTokenDragStart = (placeholderId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", placeholderId);
    setDraggedTokenId(placeholderId);
    setTokenPlacementPreviewIndex(tokenPlacementOrder.length);
  };

  const handleTokenDropAt = (dropIndex: number) => {
    if (!draggedTokenId) {
      return;
    }

    const nextOrder = [...tokenPlacementOrder];
    nextOrder.splice(dropIndex, 0, draggedTokenId);
    const nextAvailable = availableTokenIds.filter((entry) => entry !== draggedTokenId);

    setTokenPlacementOrder(nextOrder);
    setAvailableTokenIds(nextAvailable);
    setDraggedTokenId(null);
    setTokenPlacementPreviewIndex(null);
    setError(null);

    if (nextAvailable.length === 0 && game && currentTokenPlacementRequirement) {
      try {
        const nextState = resolveNextCard(game, {
          ...currentTargets,
          [currentTokenPlacementRequirement.selectionKey]: JSON.stringify(nextOrder)
        });
        setGame(nextState);
        setCurrentTargets({});
        setTokenPlacementOrder([]);
        setAvailableTokenIds([]);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Failed to resolve token placement.");
      }
    }
  };

  const handleDolphinDuplicateDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", DOLPHIN_DUPLICATE_PLACEHOLDER_ID);
    setDraggedDolphinDuplicateId(DOLPHIN_DUPLICATE_PLACEHOLDER_ID);
    setDolphinDuplicatePreviewIndex(player?.field.length ?? 0);
  };

  const handleDolphinDuplicateDropAt = (dropIndex: number) => {
    if (!draggedDolphinDuplicateId || !game || !dolphinDuplicateSourceId) {
      return;
    }

    try {
      const nextState = resolvePendingFinalAction(game, dolphinDuplicateSourceId, dropIndex);
      setGame(nextState);
      setDolphinDuplicateSourceId(null);
      setDraggedDolphinDuplicateId(null);
      setDolphinDuplicatePreviewIndex(null);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to place dolphin duplicate.");
    }
  };

  const handleOverlayFieldRowDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    const isTokenDragActive = currentTokenPlacementRequirement && !!draggedTokenId;
    const isDolphinDragActive = pendingDolphinFinalAction && !!dolphinDuplicateSourceCard && !!draggedDolphinDuplicateId;
    if (!isTokenDragActive && !isDolphinDragActive) {
      return;
    }

    event.preventDefault();
    const fieldCount = player?.field.length ?? 0;
    if (fieldCount === 0) {
      if (isTokenDragActive) {
        setTokenPlacementPreviewIndex(0);
      } else {
        setDolphinDuplicatePreviewIndex(0);
      }
      return;
    }

    const rowRect = event.currentTarget.getBoundingClientRect();
    const lastFieldCard = player?.field[fieldCount - 1];
    const lastFieldCardRect = lastFieldCard ? fieldCardRefs.current.get(lastFieldCard.instanceId)?.getBoundingClientRect() : null;
    if (!lastFieldCardRect) {
      return;
    }

    const inRightBlankArea = event.clientX >= lastFieldCardRect.right && event.clientX <= rowRect.right;
    if (!inRightBlankArea) {
      return;
    }

    if (isTokenDragActive) {
      setTokenPlacementPreviewIndex(fieldCount);
    } else {
      setDolphinDuplicatePreviewIndex(fieldCount);
    }
  };

  const handleOverlayFieldRowDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (currentTokenPlacementRequirement && tokenPlacementPreviewIndex !== null) {
      handleTokenDropAt(tokenPlacementPreviewIndex);
      return;
    }
    if (pendingDolphinFinalAction && dolphinDuplicateSourceCard && dolphinDuplicatePreviewIndex !== null) {
      handleDolphinDuplicateDropAt(dolphinDuplicatePreviewIndex);
    }
  };

  const submitRoundEnd = () => {
    if (!game) {
      return;
    }

    try {
      const nextState = finalizeRound(game, roundEndDiscardIds);
      setGame(nextState);
      setRoundEndDiscardIds([]);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to finalize round.");
    }
  };

  const handleRoundBuffReroll = () => {
    if (!game) {
      return;
    }

    try {
      const nextState = rerollRoundBuffChoice(game);
      setGame(nextState);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to reroll round buff.");
    }
  };

  const handleRoundBuffSelect = (optionIndex: number) => {
    if (!game) {
      return;
    }

    try {
      const nextState = chooseRoundBuff(game, optionIndex);
      setGame(nextState);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to select round buff.");
    }
  };

  const toggleRoundEndDiscard = (instanceId: string) => {
    const discardLimit = Math.min(2, player?.field.length ?? 0);
    setRoundEndDiscardIds((current) => {
      if (current.includes(instanceId)) {
        return current.filter((id) => id !== instanceId);
      }
      if (current.length >= discardLimit) {
        return current;
      }
      return [...current, instanceId];
    });
    setError(null);
  };

  const clearTooltipHideTimeout = () => {

    if (tooltipHideTimeoutRef.current !== null) {
      window.clearTimeout(tooltipHideTimeoutRef.current);
      tooltipHideTimeoutRef.current = null;
    }
  };

  const showCardTooltip = (card: CardInstance, element: HTMLDivElement) => {
    if (draggedCard || draggedTokenId) {
      return;
    }
    clearTooltipHideTimeout();
    const anchor = buildTooltipAnchor(element.getBoundingClientRect());
    setHoverTooltipHeight(260);
    setHoveredCard({
      card,
      anchorRight: anchor.anchorRight,
      anchorTop: anchor.anchorTop,
      anchorHeight: anchor.anchorHeight
    });
    setHoveredTooltipDetailDefinitionId(null);
  };

  const hideCardTooltip = () => {
    clearTooltipHideTimeout();
    tooltipHideTimeoutRef.current = window.setTimeout(() => {
      setHoveredCard(null);
      setHoveredTooltipDetailDefinitionId(null);
      tooltipHideTimeoutRef.current = null;
    }, 90);
  };

  useEffect(() => {
    if (!hoveredCard || !hoverTooltipRef.current) {
      return;
    }
    const measuredHeight = hoverTooltipRef.current.getBoundingClientRect().height;
    if (Math.abs(measuredHeight - hoverTooltipHeight) >= 1) {
      setHoverTooltipHeight(measuredHeight);
    }
  }, [hoveredCard, hoveredTooltipDetailDefinitionId, hoverTooltipHeight]);

  const setFieldCardRef = (instanceId: string, element: HTMLDivElement | null) => {
    if (element) {
      fieldCardRefs.current.set(instanceId, element);
      return;
    }
    fieldCardRefs.current.delete(instanceId);
  };

  const setStatusBlockRef = (key: StatusKey, element: HTMLDivElement | null) => {
    if (element) {
      statusBlockRefs.current.set(key, element);
      return;
    }
    statusBlockRefs.current.delete(key);
  };

  const openSoloSetup = () => {
    setGame(null);
    navigateToScreen("solo_setup", { soloSeed: createDefaultSoloSeed() });
  };

  const openMultiLobby = () => {
    const nextLobbyId = createDefaultLobbyId();
    setGame(null);
    setMultiSeed(createDefaultSoloSeed());
    setMultiConnectionError(null);
    setMultiLobbyEntryId(nextLobbyId);
    navigateToScreen("multi_lobby", { lobbyId: nextLobbyId });
  };

  const joinExistingMultiLobby = () => {
    const nextLobbyId = sanitizeRouteToken(multiLobbyEntryId, createDefaultLobbyId());
    setGame(null);
    setMultiConnectionError(null);
    setMultiLobbyEntryId(nextLobbyId);
    navigateToScreen("multi_lobby", { lobbyId: nextLobbyId });
  };

  const copyMultiInviteUrl = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setMultiConnectionError("この環境ではクリップボードへコピーできません。");
      return;
    }
    try {
      await navigator.clipboard.writeText(multiInviteUrl);
      setMultiConnectionError(null);
    } catch (caught) {
      setMultiConnectionError(formatMultiRoomError(caught));
    }
  };

  const openRanking = () => {
    setGame(null);
    navigateToScreen("ranking");
  };

  const updateMultiLobbyDetails = async (patch: { ready?: boolean; roleId?: string | null; seed?: string; displayName?: string }) => {
    try {
      const nextState = await updateRoomPlayer(lobbyId, {
        playerId: multiPlayerId,
        ...patch
      });
      setMultiRoomState(nextState);
      if (patch.seed) {
        setMultiSeed(patch.seed);
      }
    } catch (caught) {
      setMultiConnectionError(caught instanceof Error ? caught.message : "ルーム更新に失敗しました。");
    }
  };

  const openMatchPlaceholder = async () => {
    try {
      const nextState = await startRoomMatch(lobbyId, multiPlayerId);
      setMultiRoomState(nextState);
      navigateToScreen("multi_match", { lobbyId });
    } catch (caught) {
      setMultiConnectionError(caught instanceof Error ? caught.message : "マッチ開始に失敗しました。");
    }
  };

  const leaveCurrentRoom = async () => {
    try {
      await leaveRoom(lobbyId, multiPlayerId);
    } catch {
      // no-op
    } finally {
      navigateToScreen("home");
    }
  };

  const returnToHome = () => {
    setGame(null);
    navigateToScreen("home");
  };

  return (
    <div className="app-shell">
      {appScreen !== "solo_battle" ? (
        <header className="topbar">
          <div>
            <p className="eyebrow">Hyperdimensional Battle</p>
            <h1>超次元バトル</h1>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="help-icon-button"
              aria-label="設定"
              aria-expanded={isSettingsOpen}
              onClick={() => setIsSettingsOpen(true)}
            >
              {renderUtilityIcon("settings")}
            </button>
            <button
              type="button"
              className="help-icon-button"
              aria-label="カード一覧"
              aria-expanded={isCardCatalogOpen}
              onClick={() => setIsCardCatalogOpen(true)}
            >
              {renderUtilityIcon("catalog")}
            </button>
            <button
              type="button"
              className="help-icon-button"
              aria-label="ヘルプ"
              aria-expanded={isHelpOpen}
              onClick={() => setIsHelpOpen(true)}
            >
              {renderUtilityIcon("help")}
            </button>
          </div>
        </header>
      ) : null}
      {appScreen === "home" ? (
        <section className="panel intro-panel home-panel">
          <div className="intro-header">
            <div>
              <h2>モード選択</h2>
              <p>遊び方に合わせて、ソロモードかマルチプレイを選んでください。</p>
            </div>
          </div>
          <label className="solo-seed-input home-player-name-input">
            <span>プレイヤー名</span>
            <input
              type="text"
              value={multiPlayerName}
              maxLength={24}
              onChange={(event) => setMultiPlayerName(sanitizePlayerNameInput(event.target.value))}
            />
          </label>
          <div className="mode-card-grid">
            <button type="button" className="mode-card" onClick={openSoloSetup}>
              <div className="mode-card-top">
                <strong>ソロモード</strong>
                <span className="role-card-badge">ひとり用</span>
              </div>
              <p>ローカル engine でそのまま遊べます。仕様変更はソロ側に即時反映されます。</p>
            </button>
            <button type="button" className="mode-card" onClick={openMultiLobby}>
              <div className="mode-card-top">
                <strong>マルチプレイ</strong>
                <span className="role-card-badge">準備中</span>
              </div>
              <p>今後ここにルーム作成、参加、準備完了、同期まわりを追加します。</p>
            </button>
            <button type="button" className="mode-card" onClick={openRanking}>
              <div className="mode-card-top">
                <strong>ランキング</strong>
                <span className="role-card-badge">ソロ集計</span>
              </div>
              <p>まずは5ラウンド合計得点の降順で記録します。項目は後から増やせます。</p>
            </button>
          </div>
          <section className="multi-home-entry-panel">
            <div>
              <strong>既存ロビーに参加</strong>
              <p>招待されたロビーIDを入力して参加します。マルチは別デプロイの worker が必要です。</p>
            </div>
            <div className="multi-home-entry-row">
              <label className="solo-seed-input">
                <span>ロビーID</span>
                <input
                  type="text"
                  value={multiLobbyEntryId}
                  onChange={(event) => setMultiLobbyEntryId(sanitizeRouteToken(event.target.value, createDefaultLobbyId()))}
                />
              </label>
              <button type="button" className="secondary-button" onClick={joinExistingMultiLobby}>
                ロビー参加
              </button>
            </div>
          </section>
        </section>
      ) : null}

      {appScreen === "solo_setup" ? (
        <section className="panel intro-panel">
          <div className="intro-header">
            <div>
              <h2>役職選択</h2>
              <p>上で詳細を確認しながら、下の一覧から開始する役職を選んでください。</p>
            </div>
            <div className="intro-header-actions">
              <label className="solo-seed-input">
                <span>シード値</span>
                <input
                  type="text"
                  value={soloSeed}
                  onChange={(event) => {
                    const nextSeed = sanitizeRouteToken(event.target.value, createDefaultSoloSeed());
                    setSoloSeed(nextSeed);
                    navigateToScreen("solo_setup", { soloSeed: nextSeed, replace: true });
                  }}
                />
              </label>
              <div className="selected-role-chip">選択中: {selectedRole?.name ?? "未選択"}</div>
              <button type="button" className="secondary-button" onClick={returnToHome}>
                ホームに戻る
              </button>
            </div>
          </div>
          {selectedRole ? (
            <section className="selected-role-panel">
              <div className="selected-role-panel-top">
                <div>
                  <p className="selected-role-eyebrow">選択中ロール</p>
                  <h3>{selectedRole.name}</h3>
                </div>
                <span className="role-card-badge">開始候補</span>
              </div>
              <p className="selected-role-description">{selectedRole.description}</p>
              <div className="role-stat-grid selected-role-stat-grid">
                <div>
                  <span>基礎攻撃</span>
                  <strong>{selectedRole.initialBaseAttack}</strong>
                </div>
                <div>
                  <span>基礎魔法</span>
                  <strong>{selectedRole.initialBaseMagic}</strong>
                </div>
              </div>
              <div className="role-restriction-list">
                {(selectedRole.restrictions?.disallowCardTypes?.length ?? 0) > 0 ? (
                  selectedRole.restrictions!.disallowCardTypes!.map((restriction) => (
                    <span key={restriction}>{resolveRestrictedTypeLabel(restriction)}</span>
                  ))
                ) : (
                  <span>制限なし</span>
                )}
              </div>
            </section>
          ) : null}
          <section className="panel role-list-panel">
            <div className="role-list-header">
              <h3>一覧</h3>
              <div className="role-filter-row">
                {(["all", "attack", "magic", "restricted", "open"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`secondary-button ${roleFilter === filter ? "is-selected" : ""}`}
                    onClick={() => setRoleFilter(filter)}
                  >
                    {resolveRoleFilterLabel(filter)}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="role-card-grid"
              style={{
                "--role-grid-columns": Math.max(1, Math.min(filteredRoles.length, 6))
              } as CSSProperties}
            >
              {filteredRoles.map((role) => {
                const isSelected = role.id === selectedRoleId;
                const restrictions = role.restrictions?.disallowCardTypes ?? [];
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={`role-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <div className="role-card-top">
                      <div>
                        <strong>{role.name}</strong>
                        <p>{getRoleTrendLabel(role.initialBaseAttack, role.initialBaseMagic)}</p>
                      </div>
                      <span className="role-card-badge">{isSelected ? "選択中" : "選ぶ"}</span>
                    </div>
                    <div className="role-stat-grid role-stat-grid-compact">
                      <div>
                        <span>基礎攻撃</span>
                        <strong>{role.initialBaseAttack}</strong>
                      </div>
                      <div>
                        <span>基礎魔法</span>
                        <strong>{role.initialBaseMagic}</strong>
                      </div>
                    </div>
                    <div className="role-restriction-list">
                      {restrictions.length > 0 ? (
                        restrictions.map((restriction) => (
                          <span key={restriction}>{resolveRestrictedTypeLabel(restriction)}</span>
                        ))
                      ) : (
                        <span>制限なし</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          <button className="primary-button" onClick={startGame}>
            ゲーム開始
          </button>
        </section>
      ) : appScreen === "multi_lobby" ? (
        <section className="panel intro-panel multi-lobby-shell">
          <div className="intro-header">
            <div>
              <h2>マルチロビー</h2>
              <p>ルーム、シード、役職、準備状態を共有します。ホストが開始すると全員でマッチ画面へ移ります。</p>
            </div>
            <button type="button" className="secondary-button" onClick={leaveCurrentRoom}>
              ホームに戻る
            </button>
          </div>
          <section className="selected-role-panel multi-room-panel">
            <div className="selected-role-panel-top">
              <div>
                <p className="selected-role-eyebrow">ルーム情報</p>
                <h3>オンライン対戦の準備</h3>
              </div>
              <span className="role-card-badge">{multiConnectionState === "connected" ? "接続中" : multiConnectionState}</span>
            </div>
            <div className="selected-role-tags">
              <span>ロビーID: {lobbyId}</span>
              <span>参加人数: {multiPlayers.length}</span>
              <span>{isMultiHost ? "ホスト" : "ゲスト"}</span>
            </div>
            <div className="selected-role-tags">
              <span>worker: {multiWorkerUrl || "unresolved"}</span>
              <span>health: {multiWorkerHealth}</span>
            </div>
            <div className="multi-lobby-share-row">
              <span className="selected-role-description">招待リンク: {multiInviteUrl}</span>
              <button type="button" className="secondary-button" onClick={() => void copyMultiInviteUrl()}>
                リンクをコピー
              </button>
            </div>
            <div className="multi-lobby-grid">
              <label className="solo-seed-input">
                <span>プレイヤー名</span>
                <input
                  type="text"
                  value={multiPlayerName}
                  maxLength={24}
                  onChange={(event) => setMultiPlayerName(sanitizePlayerNameInput(event.target.value))}
                  onBlur={() => void updateMultiLobbyDetails({ displayName: multiPlayerName })}
                />
              </label>
              <label className="solo-seed-input">
                <span>シード値</span>
                <input
                  type="text"
                  value={sharedMultiSeed}
                  disabled={!isMultiHost}
                  onChange={(event) => {
                    const nextSeed = sanitizeRouteToken(event.target.value, createDefaultSoloSeed());
                    setMultiSeed(nextSeed);
                  }}
                  onBlur={() => {
                    if (isMultiHost) {
                      void updateMultiLobbyDetails({ seed: sanitizeRouteToken(multiSeed, createDefaultSoloSeed()) });
                    }
                  }}
                />
              </label>
              <div className="multi-lobby-seed-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!isMultiHost}
                  onClick={() => {
                    const nextSeed = createDefaultSoloSeed();
                    setMultiSeed(nextSeed);
                    void updateMultiLobbyDetails({ seed: nextSeed });
                  }}
                >
                  自動生成
                </button>
                <button
                  type="button"
                  className={currentMultiPlayer?.ready ? "secondary-button" : "primary-button"}
                  onClick={() => void updateMultiLobbyDetails({ ready: !currentMultiPlayer?.ready })}
                >
                  {currentMultiPlayer?.ready ? "準備解除" : "準備完了"}
                </button>
              </div>
            </div>
            <label className="role-select">
              <span>役職選択</span>
              <select
                value={currentMultiPlayer?.roleId ?? selectedRoleId}
                onChange={(event) => {
                  setSelectedRoleId(event.target.value);
                  void updateMultiLobbyDetails({ roleId: event.target.value });
                }}
              >
                {sampleRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {multiConnectionError ? <p className="selected-role-description error-text">{multiConnectionError}</p> : null}
            <div className="multi-player-list">
              {multiPlayers.map((entry) => {
                const role = entry.roleId ? roleMap[entry.roleId] : null;
                return (
                  <div key={entry.playerId} className={`multi-player-row${entry.playerId === multiPlayerId ? " is-self" : ""}`}>
                    <div className="multi-player-row-main">
                      <strong>{entry.displayName}</strong>
                      <div className="multi-player-row-tags">
                        {entry.playerId === multiRoomState?.hostPlayerId ? <span>ホスト</span> : null}
                        <span>{entry.ready ? "準備完了" : "準備中"}</span>
                        <span>{role?.name ?? "役職未選択"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="action-row">
              <button type="button" className="secondary-button" onClick={leaveCurrentRoom}>
                退出
              </button>
              <button type="button" className="primary-button" disabled={!canStartMultiMatch} onClick={openMatchPlaceholder}>
                マッチ開始
              </button>
            </div>
            {!canStartMultiMatch ? (
              <p className="selected-role-description">
                {isMultiHost
                  ? "2人以上の参加と、全員の準備完了が必要です。"
                  : "ホストがマッチ開始すると自動でマッチ画面へ移動します。"}
              </p>
            ) : null}
          </section>
          <aside className="selected-role-panel multi-lobby-player-panel">
            <div className="selected-role-panel-top">
              <div>
                <p className="selected-role-eyebrow">Players</p>
                <h3>Joined Players</h3>
              </div>
              <span className="role-card-badge">{multiPlayers.length}</span>
            </div>
            <div className="multi-player-list">
              {multiPlayers.map((entry) => {
                const role = entry.roleId ? roleMap[entry.roleId] : null;
                return (
                  <div key={entry.playerId} className={`multi-player-row${entry.playerId === multiPlayerId ? " is-self" : ""}`}>
                    <div className="multi-player-row-main">
                      <strong>{entry.displayName}</strong>
                      <div className="multi-player-row-tags">
                        {entry.playerId === multiRoomState?.hostPlayerId ? <span>Host</span> : null}
                        <span>{entry.ready ? "Ready" : "Waiting"}</span>
                        <span>{role?.name ?? "No Role"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>
      ) : false && appScreen === "multi_match" ? (
        <main className="battle-frame match-frame" data-mode="multi">
          <section className="panel status-panel match-status-panel">
            <div className="match-status-header">
              <div>
                <p className="selected-role-eyebrow">マッチルーム</p>
                <h2>{lobbyId}</h2>
              </div>
              <div className="match-status-actions">
                <span className="role-card-badge">{multiConnectionState === "connected" ? "接続中" : multiConnectionState}</span>
                <button type="button" className="secondary-button" onClick={() => navigateToScreen("multi_lobby", { lobbyId })}>
                  ロビー
                </button>
                <button type="button" className="secondary-button" onClick={leaveCurrentRoom}>
                  退出
                </button>
              </div>
            </div>
            <div className="selected-role-tags">
              <span>シード値: {sharedMultiSeed}</span>
              <span>参加人数: {multiPlayers.length}</span>
              <span>{isMultiHost ? "ホスト" : "ゲスト"}</span>
            </div>
            <p className="selected-role-description">
              マルチ本編の同期は次段階ですが、ルーム、参加者、準備、開始状態はこの画面で共有されています。
            </p>
            {multiConnectionError ? <p className="selected-role-description error-text">{multiConnectionError}</p> : null}
          </section>
          <section className="panel action-panel match-action-panel">
            <div className="action-panel-card">
              <p className="selected-role-eyebrow">プレイヤー情報</p>
              <h3>{currentMultiPlayer?.displayName ?? "参加者"}</h3>
              <p className="selected-role-description">役職: {roleMap[currentMultiPlayer?.roleId ?? ""]?.name ?? "未選択"}</p>
              <p className="selected-role-description">状態: {currentMultiPlayer?.ready ? "準備完了" : "準備中"}</p>
            </div>
          </section>
          <section className="panel field-panel match-placeholder-panel">
            <div className="match-placeholder-body">
              <strong>マルチ対戦 UI 準備中</strong>
              <p>この画面ではルーム状態を共有しつつ、右端のログバーとプレイヤーバーから情報を確認できます。</p>
            </div>
          </section>
          <section className="panel hand-panel match-placeholder-panel">
            <div className="match-placeholder-body">
              <strong>共有プレイヤー一覧</strong>
              <div className="multi-player-list compact">
                {multiPlayers.map((entry) => (
                  <div key={entry.playerId} className={`multi-player-row${entry.playerId === multiPlayerId ? " is-self" : ""}`}>
                    <div className="multi-player-row-main">
                      <strong>{entry.displayName}</strong>
                      <div className="multi-player-row-tags">
                        {entry.playerId === multiRoomState?.hostPlayerId ? <span>ホスト</span> : null}
                        <span>{entry.ready ? "準備完了" : "準備中"}</span>
                        <span>{roleMap[entry.roleId ?? ""]?.name ?? "未選択"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside className="match-edge-drawer match-edge-drawer-log" aria-label="マッチログ">
            <div className="match-edge-drawer-handle">ログ</div>
            <section className="panel match-edge-drawer-panel">
              <h2>ログ</h2>
              <div className="match-edge-drawer-scroll">
                {multiRoomLogEntries.length > 0 ? (
                  multiRoomLogEntries.map((entry, index) => (
                    <div key={`${index}-${entry}`} className="log-entry log-entry-system">
                      <p>{entry}</p>
                    </div>
                  ))
                ) : (
                  <div className="log-entry log-entry-system">
                    <p>まだログがありません。</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
          <aside className="match-edge-drawer match-edge-drawer-player" aria-label="プレイヤー一覧">
            <div className="match-edge-drawer-handle match-edge-drawer-handle-player">プレイヤー</div>
            <section className="panel match-edge-drawer-panel">
              <h2>プレイヤー一覧</h2>
              <div className="match-edge-drawer-scroll match-player-drawer-scroll">
                {multiPlayers.map((entry) => (
                  <article key={entry.playerId} className={`match-player-card${entry.playerId === multiPlayerId ? " is-self" : ""}`}>
                    <div className="match-player-card-top">
                      <strong>{entry.displayName}</strong>
                      <span>{entry.playerId === multiRoomState?.hostPlayerId ? "ホスト" : "参加者"}</span>
                    </div>
                    <p>役職: {roleMap[entry.roleId ?? ""]?.name ?? "未選択"}</p>
                    <p>準備状態: {entry.ready ? "準備完了" : "準備中"}</p>
                    <p>参加時刻: {new Date(entry.joinedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</p>
                  </article>
                ))}
              </div>
            </section>
          </aside>
        </main>
      ) : false && appScreen === "multi_lobby" ? (
        <section className="panel intro-panel">
          <div className="intro-header">
            <div>
              <h2>マルチプレイ</h2>
              <p>ここからルーム作成や参加の導線を追加します。まずはホームからモード選択できる状態まで整えます。</p>
            </div>
            <button type="button" className="secondary-button" onClick={returnToHome}>
              ホームに戻る
            </button>
          </div>
          <section className="selected-role-panel">
            <div className="selected-role-panel-top">
              <div>
                <p className="selected-role-eyebrow">準備中</p>
                <h3>オンライン対戦の入口</h3>
              </div>
              <span className="role-card-badge">仮実装</span>
            </div>
            <p className="selected-role-description">ロビーID: {lobbyId}</p>
            <div className="multi-seed-row">
              <label className="solo-seed-input">
                <span>シード値</span>
                <input
                  type="text"
                  value={multiSeed}
                  onChange={(event) => setMultiSeed(sanitizeRouteToken(event.target.value, createDefaultSoloSeed()))}
                />
              </label>
              <button type="button" className="secondary-button" onClick={() => setMultiSeed(createDefaultSoloSeed())}>
                自動生成
              </button>
            </div>
            <p className="selected-role-description">
              まずはホームからソロとマルチを分けて、今後ここにルーム作成、参加、準備完了、役職選択同期を追加します。
            </p>
            <div className="selected-role-tags">
              <span>ルーム作成</span>
              <span>参加</span>
              <span>準備完了</span>
              <span>同期</span>
            </div>
            <button type="button" className="primary-button" onClick={openMatchPlaceholder}>
              /match/{lobbyId} を開く
            </button>
          </section>
        </section>
      ) : appScreen === "multi_match" ? (
        <section className="panel intro-panel">
          <div className="intro-header">
            <div>
              <h2>対戦画面</h2>
              <p>Worker と接続するまでは仮画面です。URL と画面の分離だけ先に済ませています。</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => navigateToScreen("multi_lobby", { lobbyId })}>
              ロビーに戻る
            </button>
          </div>
          <section className="selected-role-panel">
            <div className="selected-role-panel-top">
              <div>
                <p className="selected-role-eyebrow">対戦ルーム</p>
                <h3>{lobbyId}</h3>
              </div>
              <span className="role-card-badge">仮実装</span>
            </div>
            <p className="selected-role-description">シード値: {multiSeed}</p>
            <p className="selected-role-description">ここに今後、同期された役職選択と対戦本編を載せます。</p>
          </section>
        </section>
      ) : appScreen === "ranking" ? (
        <section className="panel intro-panel">
          <div className="intro-header">
            <div>
              <h2>ランキング</h2>
              <p>現在はソロの5ラウンド合計得点を降順で保存しています。</p>
            </div>
            <button type="button" className="secondary-button" onClick={returnToHome}>
              ホームに戻る
            </button>
          </div>
          <section className="selected-role-panel ranking-panel">
            <div className="selected-role-panel-top">
              <div>
                <p className="selected-role-eyebrow">5ラウンド合計得点</p>
                <h3>総合ランキング</h3>
              </div>
              <span className="role-card-badge">{soloRankings.length} 件</span>
            </div>
            {soloRankings.length > 0 ? (
              <div className="ranking-list">
                {soloRankings.map((entry, index) => (
                  <div key={entry.gameId} className="ranking-row">
                    <strong>#{index + 1}</strong>
                    <span>{entry.roleName}</span>
                    <span>seed: {entry.seed}</span>
                    <span>{formatDisplayNumber(entry.totalScore)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="selected-role-description">まだ記録がありません。</p>
            )}
          </section>
        </section>
      ) : appScreen === "solo_battle" && game ? (
        <main className="battle-stage">
          <div className="battle-frame">
            <div className="battle-top-row">
              <section className="panel status-panel" ref={statusPanelRef}>
                <div className="status-hero">
                  <div className="status-hero-top">
                    <div className="status-hero-player">
                      <h2>{player?.displayName}</h2>
                      <div className="role-summary-tooltip">
                        <button type="button" className="role-summary-button">
                          {activeRole?.name ?? "???"}
                        </button>
                        {activeRole ? (
                          <div className="role-summary-popup">
                            <strong>{activeRole.name}</strong>
                            <p>{activeRole.description}</p>
                            <div className="role-summary-stats">
                              <span>基礎攻撃 {activeRole.initialBaseAttack}</span>
                              <span>基礎魔法 {activeRole.initialBaseMagic}</span>
                            </div>
                            <div className="role-summary-restrictions">
                              {(activeRole.restrictions?.disallowCardTypes?.length ?? 0) > 0
                                ? activeRole.restrictions?.disallowCardTypes?.map((restriction) => (
                                    <span key={restriction}>{resolveRestrictedTypeLabel(restriction)}</span>
                                  ))
                                : <span>制限なし</span>}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="status-hero-center">
                      <div className="round-buff-icon-row">
                        {selectedRoundBuffs.length > 0 ? (
                          selectedRoundBuffs.map((buff) => (
                            <div key={buff.instanceId} className="round-buff-tooltip">
                              <div className="round-buff-icon no-image">
                                <strong>Noimage</strong>
                                <small>{buff.name}</small>
                              </div>
                              <div className="round-buff-popup">
                                <strong>{buff.name}</strong>
                                <p>{buff.description}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p>バフなし</p>
                        )}
                      </div>
                      <div className="status-hero-meta">
                        <div className="battle-utility-buttons">
                          <button
                            type="button"
                            className="help-icon-button battle-icon-button"
                            aria-label="設定"
                            aria-expanded={isSettingsOpen}
                            onClick={() => setIsSettingsOpen(true)}
                          >
                            {renderUtilityIcon("settings")}
                          </button>
                          <button
                            type="button"
                            className="help-icon-button battle-icon-button"
                            aria-label="カード一覧"
                            aria-expanded={isCardCatalogOpen}
                            onClick={() => setIsCardCatalogOpen(true)}
                          >
                            {renderUtilityIcon("catalog")}
                          </button>
                          <button
                            type="button"
                            className="help-icon-button battle-icon-button"
                            aria-label="ヘルプ"
                            aria-expanded={isHelpOpen}
                            onClick={() => setIsHelpOpen(true)}
                          >
                            {renderUtilityIcon("help")}
                          </button>
                        </div>
                        <div className="status-hero-round">
                          <div className="status-hero-round-line">
                            <div className="attribute-rate-tooltip">
                              <button type="button" className="attribute-rate-button" aria-label="属性出現率">
                                %
                              </button>
                              <div className="attribute-rate-popup">
                                <strong>属性出現率</strong>
                                <div className="attribute-rate-list">
                                  {attributeAppearanceRates.map((entry) => (
                                    <div key={entry.attribute} className="attribute-rate-row">
                                      <span>{resolveAttributeLabel(entry.attribute)}</span>
                                      <span>{entry.percentage.toFixed(1)}%</span>
                                      <small>
                                        {entry.remainingCount > 0
                                          ? `重み ${entry.weight} / 残り ${entry.remainingCount}`
                                          : "残りなし"}
                                      </small>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <span>ラウンド</span>
                          </div>
                          <strong>{game.round} / 5</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="status-grid">
                  <div ref={(element) => setStatusBlockRef("baseAttack", element)}>
                    <span>基礎攻撃</span>
                    <strong>{player ? formatDisplayNumber(player.baseAttack) : "-"}</strong>
                  </div>
                  <div ref={(element) => setStatusBlockRef("baseMagic", element)}>
                    <span>基礎魔法</span>
                    <strong>{player ? formatDisplayNumber(player.baseMagic) : "-"}</strong>
                  </div>
                  <div ref={(element) => setStatusBlockRef("scoreThisRound", element)}>
                    <span>ラウンド得点</span>
                    <strong>{player ? formatDisplayNumber(player.scoreThisRound) : "-"}</strong>
                  </div>
                  <div ref={(element) => setStatusBlockRef("tempAttack", element)}>
                    <span>一時攻撃</span>
                    <strong>{player ? formatDisplayNumber(player.tempAttack) : "-"}</strong>
                  </div>
                  <div ref={(element) => setStatusBlockRef("tempMagic", element)}>
                    <span>一時魔法</span>
                    <strong>{player ? formatDisplayNumber(player.tempMagic) : "-"}</strong>
                  </div>
                  <div ref={(element) => setStatusBlockRef("totalScore", element)}>
                    <span>合計得点</span>
                    <strong>{player ? formatDisplayNumber(player.totalScore) : "-"}</strong>
                  </div>
                </div>
                {pendingDolphinFinalAction || currentTokenPlacementRequirement ? (
                  <section className="transient-card-tray">
                    <div className="transient-card-tray-header">
                      <strong>
                        {pendingDolphinFinalAction
                          ? "ドルフィンの複製"
                          : `${currentTokenPlacementRequirement?.tokenName ?? "トークン"} の配置`}
                      </strong>
                      <p>
                        {pendingDolphinFinalAction
                          ? !dolphinDuplicateSourceCard
                            ? "場のカードをクリックして複製元を選んでください。"
                            : "複製カードをドラッグして場に配置してください。"
                          : `${currentTokenPlacementRequirement?.tokenName ?? "トークン"} をドラッグして場に配置してください。`}
                      </p>
                    </div>
                    <div className="transient-card-tray-row">
                      {pendingDolphinFinalAction && dolphinDuplicateSourceCard ? (
                        <div
                          className="card-chip token-placement-token"
                          data-attribute={resolveVisualAttribute(dolphinDuplicateSourceCard.attribute)}
                          draggable
                          onDragStart={handleDolphinDuplicateDragStart}
                          onDragEnd={() => {
                            setDraggedDolphinDuplicateId(null);
                            setDolphinDuplicatePreviewIndex(null);
                          }}
                        >
                          {renderCardIllustration(dolphinDuplicateSourceCard.definitionId, dolphinDuplicateSourceCard.name)}
                          <div className="card-title-row">
                            <span>{dolphinDuplicateSourceCard.name}</span>
                          </div>
                          <small>複製カード</small>
                        </div>
                      ) : null}
                      {currentTokenPlacementRequirement
                        ? tokenPlaceholderItems.map((item) => (
                            <div
                              key={item.id}
                              className={`card-chip token-placement-token ${draggedTokenId === item.id ? "is-dragging" : ""}`}
                              data-attribute="water"
                              draggable
                              onDragStart={(event) => handleTokenDragStart(item.id, event)}
                              onDragEnd={() => {
                                setDraggedTokenId(null);
                                setTokenPlacementPreviewIndex(null);
                              }}
                            >
                              {renderCardIllustration(currentTokenPlacementRequirement.tokenDefinitionId, currentTokenPlacementRequirement.tokenName)}
                              <div className="card-title-row">
                                <span>{currentTokenPlacementRequirement.tokenName}</span>
                              </div>
                              <small>ドラッグで配置</small>
                            </div>
                          ))
                        : null}
                    </div>
                  </section>
                ) : null}
              </section>

              <section className="panel action-panel action-panel-compact">
                {game.phase === "input" ? (
                  <>
                    <div className="control-meta-row">
                      <span>配置上限 {placementLimit}</span>
                      {restrictedTypes.length > 0 ? <span>配置不可: {restrictedTypes.map(resolveCardTypeLabel).join(" / ")}</span> : null}
                    </div>

                    {inputStep === "mulligan" ? (
                      <>
                        <div className="action-copy">
                          <strong>交換フェーズ</strong>
                          <p>交換したいカードをクリックし、終わったら次へ進みます。</p>
                        </div>
                        <button className="primary-button" onClick={confirmMulligan}>
                          {mulliganIds.length > 0 ? `${mulliganIds.length} 枚を交換して配置へ` : "交換せず配置へ"}
                        </button>
                      </>
                    ) : null}

                    {inputStep === "placement" ? (
                      <>
                        <div className="action-copy">
                          <strong>配置フェーズ</strong>
                          <p>手札をドラッグして場へ置き、並びが決まったら発動を開始します。</p>
                        </div>
                        <button className="primary-button" onClick={beginResolution}>
                          この並びで発動開始
                        </button>
                      </>
                    ) : null}

                    {inputStep === "resolving" ? (
                      <>
                        {actionFocusCard && actionFocusDefinition ? (
                          <div className="action-focus-card" data-attribute={resolveVisualAttribute(actionFocusCard.attribute)}>
                            <div className="action-focus-card-visual">
                              {renderCardIllustration(actionFocusCard.definitionId, actionFocusCard.name)}
                            </div>
                            <div className="action-focus-card-copy">
                              <div className="draft-card-header">
                                <strong>{actionFocusCard.name}</strong>
                                <span>{resolveCardTypeLabel(actionFocusCard.type)}</span>
                              </div>
                              <p className="card-text-body">
                                {renderCardTextWithAdjustedNumbers(actionFocusDefinition.text, actionFocusCard, { player })}
                              </p>
                            </div>
                          </div>
                        ) : null}
                        {currentResolutionCard ? (
                          currentResolutionOperations.length === 0 ? (
                            <p className="action-copy-sub">
                              {currentTokenPlacementRequirement ? "トレイのカードを場に配置すると自動で進みます。" : "対象選択なしで次へ進みます。"}
                            </p>
                          ) : (
                            <div className="target-picking-panel">
                              <p>
                                {activeTargetOperation
                                  ? `${activeTargetOperation.label} を場からクリック`
                                  : "必要な対象はすべて選択済みです"}
                              </p>
                              <div className="target-picked-list">
                                {currentResolutionOperations.map((operation) => (
                                  <div key={operation.key} className="target-picked-row">
                                    <span>{operation.label}</span>
                                    <strong>
                                      {currentTargets[operation.key]
                                        ? resolveFieldLabel(
                                            currentSelectableTargets.find((card) => card.instanceId === currentTargets[operation.key]) ??
                                              player?.field.find((card) => card.instanceId === currentTargets[operation.key]) ??
                                              currentResolutionCard
                                          )
                                        : "未選択"}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        ) : (
                          <p className="action-copy-sub">発動を進めています。</p>
                        )}
                        {currentResolutionOperations.length > 0 && !currentTokenPlacementRequirement ? (
                          <button className="primary-button" onClick={confirmCurrentTargetsAndResolve}>
                            対象を確定して解決
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}

                {game.phase === "round_end" && pendingDolphinFinalAction ? (
                  <>
                    {actionFocusCard && actionFocusDefinition ? (
                      <div className="action-focus-card" data-attribute={resolveVisualAttribute(actionFocusCard.attribute)}>
                        <div className="action-focus-card-visual">
                          {renderCardIllustration(actionFocusCard.definitionId, actionFocusCard.name)}
                        </div>
                        <div className="action-focus-card-copy">
                          <div className="draft-card-header">
                            <strong>{actionFocusCard.name}</strong>
                            <span>複製元</span>
                          </div>
                          <p className="card-text-body">{renderCardTextWithAdjustedNumbers(actionFocusDefinition.text, actionFocusCard)}</p>
                        </div>
                      </div>
                    ) : null}
                    <p className="action-copy-sub">ドルフィンの効果で複製カードを場に配置してください。</p>
                  </>
                ) : null}

                {game.phase === "round_end" && !pendingDolphinFinalAction && !pendingRoundBuffChoice ? (
                  <>
                    <div className="action-copy">
                      <strong>ラウンド終了</strong>
                      <p>場から {Math.min(2, player?.field.length ?? 0)} 枚選んで捨ててください。</p>
                    </div>
                    <button
                      className="primary-button"
                      disabled={roundEndDiscardIds.length !== Math.min(2, player?.field.length ?? 0)}
                      onClick={submitRoundEnd}
                    >
                      ラウンド終了を確定
                    </button>
                  </>
                ) : null}

                {game.phase === "finished" ? <p className="action-copy-sub">5 ラウンド終了です。合計得点を確認してください。</p> : null}

                {error ? <p className="error-text">{error}</p> : null}
              </section>
            </div>

            <section className="panel field-panel">
              <div
                className={`horizontal-card-row ${inputStep === "placement" ? "is-placement-row" : ""}`}
                ref={inputStep === "placement" ? placementRowRef : null}
                onDragOver={
                  inputStep === "placement"
                    ? handlePlacementRowDragOver
                    : currentTokenPlacementRequirement || (pendingDolphinFinalAction && dolphinDuplicateSourceCard)
                      ? handleOverlayFieldRowDragOver
                    : undefined
                }
                onDragLeave={
                  inputStep === "placement"
                    ? () => {
                        stopPlacementAutoScroll();
                      }
                    : undefined
                }
                onDrop={
                  inputStep === "placement"
                    ? (event) => {
                        event.preventDefault();
                        if (draggedCard && placementPreviewIndex !== null) {
                          handleDropAt(placementPreviewIndex);
                        }
                        stopPlacementAutoScroll();
                      }
                    : currentTokenPlacementRequirement || (pendingDolphinFinalAction && dolphinDuplicateSourceCard)
                      ? handleOverlayFieldRowDrop
                    : undefined
                }
              >
                {inputStep === "placement" ? (
                  <>
                    {placementBaseCards.length === 0 && placementPreviewIndex === 0 && draggedPreviewCard ? (
                      <div className="card-chip is-preview-ghost" data-attribute={resolveVisualAttribute(draggedPreviewCard.attribute)}>
                        {renderCardIllustration(draggedPreviewCard.definitionId, draggedPreviewCard.name)}
                        <div className="card-title-row">
                          <span>{draggedPreviewCard.name}</span>
                        </div>
                        <small>{resolveCardTypeLabel(draggedPreviewCard.type)}</small>
                        <small>ここに置かれます</small>
                      </div>
                    ) : null}
                    {placementBaseCards.map((card, index) => (
                      <Fragment key={card.instanceId}>
                        {placementPreviewIndex === index && draggedPreviewCard ? (
                          <div className="card-chip is-preview-ghost" data-attribute={resolveVisualAttribute(draggedPreviewCard.attribute)}>
                            {renderCardIllustration(draggedPreviewCard.definitionId, draggedPreviewCard.name)}
                            <div className="card-title-row">
                              <span>{draggedPreviewCard.name}</span>
                            </div>
                            <small>{resolveCardTypeLabel(draggedPreviewCard.type)}</small>
                            <small>ここに置かれます</small>
                          </div>
                        ) : null}
                        <div
                          className={`card-chip ${inputStep === "placement" ? "is-placement-draggable" : ""} ${
                            draggedCard?.instanceId === card.instanceId && draggedCard.source === "field" ? "is-dragging" : ""
                          } ${
                            draggedCard?.instanceId === card.instanceId && draggedCard.source === "field" ? "is-drag-origin-empty" : ""
                          }`}
                          data-attribute={resolveVisualAttribute(card.attribute)}
                          ref={(element) => setFieldCardRef(card.instanceId, element)}
                          draggable
                          onDragOver={(event) => handlePlacementCardDragOver(index, event)}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            const isLeftHalf = event.clientX < rect.left + rect.width / 2;
                            handleDropAt(isLeftHalf ? index : index + 1);
                            stopPlacementAutoScroll();
                          }}
                          onDragStart={(event) => handleFieldDragStart(card.instanceId, event)}
                          onDragEnd={() => {
                            setDraggedCard(null);
                            setPlacementPreviewIndex(null);
                            stopPlacementAutoScroll();
                          }}
                          onMouseEnter={(event) => showCardTooltip(card, event.currentTarget)}
                          onMouseLeave={hideCardTooltip}
                        >
                          {draggedCard?.instanceId === card.instanceId && draggedCard.source === "field" ? (
                            null
                          ) : (
                            <>
                              {renderCardIllustration(card.definitionId, card.name)}
                              <div className="card-title-row">
                                <span>{card.name}</span>
                              </div>
                              <small>{resolveCardTypeLabel(card.type)}</small>
                              <small>{player && isPlacedFromHand(player.hand, card.instanceId) ? "手札から配置済み" : "既存カード"}</small>
                            </>
                          )}
                        </div>
                      </Fragment>
                    ))}
                    {placementPreviewIndex === placementBaseCards.length && draggedPreviewCard && placementBaseCards.length > 0 ? (
                      <div className="card-chip is-preview-ghost" data-attribute={resolveVisualAttribute(draggedPreviewCard.attribute)}>
                        {renderCardIllustration(draggedPreviewCard.definitionId, draggedPreviewCard.name)}
                        <div className="card-title-row">
                          <span>{draggedPreviewCard.name}</span>
                        </div>
                        <small>{resolveCardTypeLabel(draggedPreviewCard.type)}</small>
                        <small>ここに置かれます</small>
                      </div>
                    ) : null}
                  </>
                ) : player ? (
                  (() => {
                    if (currentTokenPlacementRequirement || (pendingDolphinFinalAction && dolphinDuplicateSourceCard)) {
                      const overlayItems = currentTokenPlacementRequirement
                        ? tokenPlacementPreviewItems
                        : player.field.map((card) => ({
                            kind: "field" as const,
                            id: card.instanceId,
                            card
                          }));
                      return overlayItems.map((item, index) => (
                        <Fragment key={item.id}>
                          {overlayPlacementPreviewIndex === index && overlayPreviewCard ? (
                            <div className="card-chip is-preview-ghost" data-attribute={resolveVisualAttribute(overlayPreviewCard.attribute)}>
                              {renderCardIllustration(overlayPreviewCard.definitionId, overlayPreviewCard.name)}
                              <div className="card-title-row">
                                <span>{overlayPreviewCard.name}</span>
                              </div>
                              <small>{resolveCardTypeLabel(overlayPreviewCard.type)}</small>
                              <small>ここに置かれます</small>
                            </div>
                          ) : null}
                          <div
                            className="token-placement-slot"
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              const isLeftHalf = event.clientX < rect.left + rect.width / 2;
                              if (currentTokenPlacementRequirement) {
                                setTokenPlacementPreviewIndex(isLeftHalf ? index : index + 1);
                              } else if (pendingDolphinFinalAction && dolphinDuplicateSourceCard) {
                                setDolphinDuplicatePreviewIndex(isLeftHalf ? index : index + 1);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              const isLeftHalf = event.clientX < rect.left + rect.width / 2;
                              if (currentTokenPlacementRequirement) {
                                handleTokenDropAt(isLeftHalf ? index : index + 1);
                              } else if (pendingDolphinFinalAction && dolphinDuplicateSourceCard) {
                                handleDolphinDuplicateDropAt(isLeftHalf ? index : index + 1);
                              }
                            }}
                          >
                            {item.kind === "field" ? (
                              renderFieldCard(item.card)
                            ) : (
                              <div className="card-chip is-selected" data-attribute="water">
                                {renderCardIllustration(currentTokenPlacementRequirement!.tokenDefinitionId, currentTokenPlacementRequirement!.tokenName)}
                                <div className="card-title-row">
                                  <span>{currentTokenPlacementRequirement!.tokenName}</span>
                                </div>
                                <small>{resolveCardTypeLabel(cardMap[currentTokenPlacementRequirement!.tokenDefinitionId]?.type ?? "ability")}</small>
                                <small>配置済み</small>
                              </div>
                            )}
                          </div>
                        </Fragment>
                      )).concat(
                        overlayPlacementPreviewIndex === overlayItems.length && overlayPreviewCard
                          ? [
                              <div key="overlay-preview-end" className="card-chip is-preview-ghost" data-attribute={resolveVisualAttribute(overlayPreviewCard.attribute)}>
                                {renderCardIllustration(overlayPreviewCard.definitionId, overlayPreviewCard.name)}
                                <div className="card-title-row">
                                  <span>{overlayPreviewCard.name}</span>
                                </div>
                                <small>{resolveCardTypeLabel(overlayPreviewCard.type)}</small>
                                <small>ここに配置されます</small>
                              </div>
                            ]
                          : []
                      );
                    }

                    const groupedCardIds = new Set(connectedFieldGroups.flatMap((group) => group.instanceIds));
                    const groupByStart = new Map<number, ConnectedFieldGroup>(
                      connectedFieldGroups.map((group) => [group.start, group] as const)
                    );

                    return player.field.map((card, index) => {
                      const group = groupByStart.get(index);
                      if (group) {
                        return (
                          <div
                            key={group.key}
                            className="connected-field-group"
                            data-attribute={resolveVisualAttribute(group.attribute)}
                          >
                            {player.field.slice(group.start, group.end + 1).map((groupCard) => renderFieldCard(groupCard))}
                          </div>
                        );
                      }

                      if (groupedCardIds.has(card.instanceId)) {
                        return null;
                      }

                      return renderFieldCard(card);
                    });
                  })()
                ) : null}
              </div>
            </section>
            <section className="panel hand-panel">
              <div
                className={`horizontal-card-row ${canReturnPlacedCardToHand(player?.hand, draggedCard) ? "is-hand-return-target" : ""}`}
                onDragOver={game.phase === "input" && inputStep === "placement" ? handleHandReturnDragOver : undefined}
                onDrop={
                  game.phase === "input" && inputStep === "placement"
                    ? (event) => {
                        if (!canReturnPlacedCardToHand(player?.hand, draggedCard)) {
                          return;
                        }
                        event.preventDefault();
                        handleDropBackToHand();
                      }
                    : undefined
                }
              >
                {visibleHandCards.map((card) => {
                  const isRestricted = restrictedTypes.includes(card.type);
                  const inMulligan = mulliganIds.includes(card.instanceId);

                  return (
                    <div
                      key={card.instanceId}
                      className={`card-chip ${
                        draggedCard?.instanceId === card.instanceId && draggedCard.source === "hand" ? "is-dragging" : ""
                      } ${game.phase === "input" && inputStep === "mulligan" && inMulligan ? "is-selected" : ""} ${
                        game.phase === "input" && inputStep === "placement" && !isRestricted ? "is-placement-draggable" : ""
                      }`}
                      data-attribute={resolveVisualAttribute(card.attribute)}
                      draggable={game.phase === "input" && inputStep === "placement" && !isRestricted}
                      onDragStart={(event) => handleHandDragStart(card.instanceId, event)}
                      onDragEnd={() => {
                        setDraggedCard(null);
                        setPlacementPreviewIndex(null);
                        stopPlacementAutoScroll();
                      }}
                      onMouseEnter={(event) => showCardTooltip(card, event.currentTarget)}
                      onMouseLeave={hideCardTooltip}
                      onClick={
                        game.phase === "input" && inputStep === "mulligan"
                          ? () => toggleMulligan(card.instanceId)
                          : undefined
                      }
                    >
                      {renderCardIllustration(card.definitionId, card.name)}
                      <div className="card-title-row">
                        <span>{card.name}</span>
                      </div>
                      <small>{resolveCardTypeLabel(card.type)}</small>

                      {game.phase === "input" && inputStep === "mulligan" ? <small>{inMulligan ? "交換対象" : "クリックで交換対象"}</small> : null}

                      {game.phase === "input" && inputStep === "placement" ? (
                        <small>{isRestricted ? "この役職では配置不可" : "ドラッグして場へ配置"}</small>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
            <aside className="log-drawer" aria-label="ターンログ">
              <div className="log-drawer-handle">ログ</div>
              <section className="panel log-panel">
                <h2>ログ</h2>
                <div className="log-scroll">
                    {logGroups.map((group) => (
                      <div key={group.key} className={`log-group log-group-${group.kind}`}>
                        {group.title ? <div className="log-group-label">{group.title}</div> : null}
                        <div className="log-group-entries">
                          {group.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`log-entry log-${entry.level}${group.kind !== "card" ? " log-entry-system" : ""}${
                                entry.code === "ADDITIONAL_ACTIVATION_QUEUED" ? " log-entry-additional-activation" : ""
                              }`}
                            >
                              <p>{trimGroupedLogMessage(entry.message, group.title)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            </aside>
          </div>
        </main>
      ) : null}

      {hoveredCard && latestHoveredCard ? (
        (() => {
          const tooltipPosition = resolveTooltipPosition(
            {
              anchorRight: hoveredCard.anchorRight,
              anchorTop: hoveredCard.anchorTop,
              anchorHeight: hoveredCard.anchorHeight
            },
            hoverTooltipHeight
          );
          return (
        <div
          key={hoveredCard.card.instanceId}
          ref={hoverTooltipRef}
          className="hover-tooltip"
          data-attribute={resolveVisualAttribute(latestHoveredCard.attribute)}
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`
          }}
          onMouseEnter={clearTooltipHideTimeout}
          onMouseLeave={hideCardTooltip}
        >
          <strong>{latestHoveredCard.name}</strong>
          {renderCardIllustration(latestHoveredCard.definitionId, latestHoveredCard.name)}
          <p className="card-text-body">
            {renderCardTextWithAdjustedNumbers(cardMap[latestHoveredCard.definitionId]?.text ?? latestHoveredCard.text, latestHoveredCard, {
              player,
              onReferenceEnter: setHoveredTooltipDetailDefinitionId,
              onReferenceLeave: (definitionId) =>
                setHoveredTooltipDetailDefinitionId((current) => (current === definitionId ? null : current))
            })}
          </p>
          <p>属性: {resolveAttributeLabel(latestHoveredCard.attribute)}</p>
          <p>種類: {resolveCardTypeLabel(latestHoveredCard.type)}</p>
          {referencedDefinitionIds.length > 0 ? (
            <div className="hover-tooltip-reference-block">
              <span>参照中のカード</span>
              <div className="hover-tooltip-reference-list">
                {referencedDefinitionIds.map((definitionId: string) => (
                  <button
                    key={definitionId}
                    type="button"
                    className="hover-tooltip-reference-item"
                    onMouseEnter={() => setHoveredTooltipDetailDefinitionId(definitionId)}
                    onMouseLeave={() =>
                      setHoveredTooltipDetailDefinitionId((current) => (current === definitionId ? null : current))
                    }
                  >
                    {cardMap[definitionId]?.name ?? definitionId}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {latestHoveredCard.enchantments.length > 0 ? (
            <div className="hover-tooltip-enchant-block">
              <span>付与エンチャント</span>
              <div className="hover-tooltip-enchant-list">
                {latestHoveredCard.enchantments.map((enchant: CardInstance["enchantments"][number]) => {
                  return (
                    <button
                      key={enchant.instanceId}
                      type="button"
                      className="hover-tooltip-enchant-item"
                      onMouseEnter={() => setHoveredTooltipDetailDefinitionId(enchant.definitionId)}
                      onMouseLeave={() =>
                        setHoveredTooltipDetailDefinitionId((current) =>
                          current === enchant.definitionId ? null : current
                        )
                      }
                    >
                      {enchant.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          {hoveredTooltipDetailDefinitionId && cardMap[hoveredTooltipDetailDefinitionId] ? (
            <div key={hoveredTooltipDetailDefinitionId} className="hover-tooltip-subpopup">
              <strong>{cardMap[hoveredTooltipDetailDefinitionId]!.name}</strong>
              <p className="card-text-body">
                {renderCardTextWithAdjustedNumbers(cardMap[hoveredTooltipDetailDefinitionId]!.text, null, {
                  definitionId: hoveredTooltipDetailDefinitionId,
                  player
                })}
              </p>
            </div>
          ) : null}
        </div>
          );
        })()
      ) : null}

      {pendingRoundBuffChoice ? (
        <div className="help-modal-backdrop round-buff-modal-backdrop">
          <div className="help-modal round-buff-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header round-buff-modal-header">
              <div>
                <h2>ラウンドバフを選択</h2>
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={pendingRoundBuffChoice.rerollUsed}
                onClick={handleRoundBuffReroll}
              >
                {pendingRoundBuffChoice.rerollUsed ? "このラウンドはリロール済み" : "候補をリロール"}
              </button>
            </div>
            <div className="round-buff-choice-grid round-buff-choice-grid-modal">
              {pendingRoundBuffChoice.options.map((buffId, index) => {
                const buff = roundBuffMap[buffId];
                if (!buff) {
                  return null;
                }
                return (
                  <button
                    key={`${buffId}_${index}`}
                    type="button"
                    className="round-buff-choice-card round-buff-choice-card-modal"
                    onClick={() => handleRoundBuffSelect(index)}
                  >
                    <div className="round-buff-icon no-image">
                      <strong>Noimage</strong>
                      <small>{buff.name}</small>
                    </div>
                    <div className="round-buff-choice-copy">
                      <strong>{buff.name}</strong>
                      <p>{buff.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="help-modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="help-modal settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header">
              <div>
                <h2>設定</h2>
                <p>発動音の音量を調整できます。</p>
              </div>
              <button type="button" className="help-close-button" onClick={() => setIsSettingsOpen(false)}>
                閉じる
              </button>
            </div>
            <div className="help-modal-body">
              <div className="help-block settings-block">
                <strong>発動音量</strong>
                <label className="settings-slider-row">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={audioVolume}
                    onChange={(event) => setAudioVolume(Number(event.target.value))}
                  />
                  <span>{audioVolume}%</span>
                </label>
                <p>ラウンド中にカードが発動するたび、音階が少しずつ上がります。`0%` にすると消音です。</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isHelpOpen ? (
        <div className="help-modal-backdrop" onClick={() => setIsHelpOpen(false)}>
          <div className="help-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header">
              <div>
                <h2>ヘルプ</h2>
                <p>遊び方と主要な用語をここで確認できます。</p>
              </div>
              <button type="button" className="help-close-button" onClick={() => setIsHelpOpen(false)}>
                閉じる
              </button>
            </div>
            <div className="help-modal-body">
              <div className="help-block">
                <strong>交換</strong>
                <p>ラウンド開始時に一度だけ行える手札交換です。確定後に配置へ進みます。</p>
              </div>
              <div className="help-block">
                <strong>配置</strong>
                <p>手札からドラッグして、場の端やカードの間に差し込みます。</p>
              </div>
              <div className="help-block">
                <strong>発動</strong>
                <p>場の左から順に自動で進みます。対象が必要なカードだけ、その時点で指定します。</p>
              </div>
              <div className="help-block">
                <strong>最終攻撃</strong>
                <p>ラウンド最後に行う集約ダメージです。基本は一時攻撃と一時魔法の高い方を使います。</p>
              </div>
              <div className="help-block">
                <strong>ダメージ</strong>
                <p>このゲームでは対戦相手のHPではなく、自分のスコア加算として扱います。</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCardCatalogOpen ? (
        <div
          className="help-modal-backdrop"
          onClick={() => {
            setIsCardCatalogOpen(false);
          }}
        >
          <div className="help-modal card-catalog-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header">
              <div>
                <h2>カード一覧</h2>
                <p>名前、種別、属性で絞り込みながら効果を確認できます。</p>
              </div>
              <button
                type="button"
                className="help-close-button"
                onClick={() => {
                  setIsCardCatalogOpen(false);
                }}
              >
                閉じる
              </button>
            </div>
            <div className="catalog-filter-row">
              <label className="catalog-filter">
                <span>検索</span>
                <input
                  value={cardSearchText}
                  onChange={(event) => setCardSearchText(sanitizeSearchTextInput(event.target.value))}
                  placeholder="カード名 / 効果文"
                  inputMode="search"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="catalog-filter">
                <span>種別</span>
                <select value={cardTypeFilter} onChange={(event) => setCardTypeFilter(event.target.value as "all" | CardType)}>
                  <option value="all">すべて</option>
                  <option value="attack">攻撃</option>
                  <option value="spell">魔法</option>
                  <option value="ability">能力</option>
                </select>
              </label>
              <label className="catalog-filter">
                <span>属性</span>
                <select value={cardAttributeFilter} onChange={(event) => setCardAttributeFilter(event.target.value as "all" | Attribute)}>
                  <option value="all">すべて</option>
                  <option value="none">無</option>
                  <option value="fire">炎</option>
                  <option value="water">水</option>
                  <option value="ice">氷</option>
                  <option value="wind">風</option>
                  <option value="thunder">雷</option>
                  <option value="earth">土</option>
                  <option value="dark">闇</option>
                </select>
              </label>
            </div>
            <div className="catalog-result-row">
              <span>{filteredCatalogCards.length} 件</span>
            </div>
            <div className="catalog-card-grid">
              {filteredCatalogCards.map((card) => (
                <article
                  key={card.id}
                  className="catalog-card"
                  data-attribute={resolveVisualAttribute(card.attribute)}
                  data-is-enchant={card.timings.includes("enchant") ? "true" : "false"}
                >
                  {renderCardIllustration(card.id, card.name)}
                  <div className="catalog-card-top">
                    <strong>{card.name}</strong>
                    <span>{resolveAttributeLabel(card.attribute)}</span>
                  </div>
                  <div className="catalog-card-meta-row">
                    <span>{resolveCardTypeLabel(card.type)}</span>
                    {card.deckEligible === false ? <span>デッキ外</span> : <span>デッキ入り</span>}
                  </div>
                  <p className="card-text-body">
                    {renderCardTextWithAdjustedNumbers(card.text, null, {
                      definitionId: card.id,
                      renderReferencePopup: (definitionId) => (
                        <span className="catalog-inline-reference-popup">
                          <strong>{cardMap[definitionId]?.name}</strong>
                          <span className="card-text-body">
                            {renderCardTextWithAdjustedNumbers(cardMap[definitionId]?.text ?? "", null, {
                              definitionId
                            })}
                          </span>
                        </span>
                      )
                    })}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="particle-layer" aria-hidden="true">
        {floatingTexts.map((entry) => (
          <div
            key={entry.id}
            className={`floating-text floating-${entry.tone} floating-${entry.scope}`}
            style={{
              left: `${entry.x}px`,
              top: `${entry.y}px`
            }}
          >
            {entry.text}
          </div>
        ))}
        {particleBursts.map((burst) => (
          <div
            key={burst.id}
            className={`particle-burst particle-${burst.kind}`}
            data-attribute={resolveVisualAttribute(burst.attribute)}
            style={{
              left: `${burst.x}px`,
              top: `${burst.y}px`
            }}
          >
            {burst.sprites.map((sprite) => (
              <span
                key={sprite.id}
                className={`particle-shape shape-${sprite.shape}`}
                style={
                  {
                    "--dx": `${sprite.dx}px`,
                    "--dy": `${sprite.dy}px`,
                    "--particle-size": `${sprite.size}px`,
                    "--particle-delay": `${sprite.delay}ms`,
                    "--particle-duration": `${sprite.duration}ms`,
                    "--particle-rotation": `${sprite.rotation}deg`
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function handleReplayEventParticle(
  event: ReplayEvent,
  spawnBurst: (attribute: Attribute, kind: ParticleKind, anchorInstanceId?: string | null) => void,
  lastActivationRef: MutableRefObject<{ instanceId: string; attribute: Attribute } | null>
) {
  switch (event.type) {
    case "CARD_ACTIVATED":
      lastActivationRef.current = {
        instanceId: event.instanceId,
        attribute: event.attribute
      };
      spawnBurst(event.attribute, "activate", event.instanceId);
      break;
    case "DAMAGE_DEALT":
      spawnBurst(lastActivationRef.current?.attribute ?? "none", "damage", lastActivationRef.current?.instanceId ?? null);
      break;
    case "FINAL_ATTACK":
      spawnBurst(lastActivationRef.current?.attribute ?? "none", "final", lastActivationRef.current?.instanceId ?? null);
      break;
    default:
      break;
  }
}
