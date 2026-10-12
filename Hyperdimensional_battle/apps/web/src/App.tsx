import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
  type WheelEvent as ReactWheelEvent
} from "react";
import {
  applyAiRoundDecision,
  applyAiRoundDecisionWithFrames,
  applyMulliganOnly,
  chooseRoundBuff,
  createLocalGame,
  finalizeRound,
  getCardDefinitionMap,
  getCurrentResolutionCard,
  getCurrentResolutionTargetCandidateIds,
  getCurrentResolutionTargetKeys,
  hasCurrentResolutionActivationEffect,
  getRoleDefinitionMap,
  getTokenPlacementSelectionKey,
  planAiRound,
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
  addRoomAi,
  fetchReplay,
  saveReplay,
  fetchRoomState,
  fetchRoomWorkerHealth,
  getOrCreateMultiPlayerId,
  joinRoom,
  leaveRoom,
  loadStoredMultiPlayerName,
  openRoomSocket,
  resolveRoomWorkerBaseUrl,
  returnRoomToLobby,
  saveMultiPlayerName,
  startRoomMatch,
  submitMatchAction,
  type AiLevel,
  type MultiRoomState,
  type ReplayRecord,
  updateRoomPlayer
} from "./multiplayer";
import thunderElectricIllustration from "./assets/card-illustrations/thunder_electric.png";
import thunderOverchargeIllustration from "./assets/card-illustrations/thunder_overcharge.png";
import thunderShockIllustration from "./assets/card-illustrations/thunder_shock.png";
import thunderSpeedOfLightIllustration from "./assets/card-illustrations/thunder_speed_of_light.png";
import thunderStaticIllustration from "./assets/card-illustrations/thunder_static.png";
import thunderVoltageIllustration from "./assets/card-illustrations/thunder_voltage.png";
import thunderVortexIllustration from "./assets/card-illustrations/thunder_vortex.png";
import roundBuffFreezingWindImage from "./assets/round-buffs/round_buff_freezing_wind.png";
import roundBuffMirrorImage from "./assets/round-buffs/round_buff_mirror.png";
import roundBuffTailwindRushImage from "./assets/round-buffs/round_buff_tailwind_rush.png";
import roundBuffVoltessimoImage from "./assets/round-buffs/round_buff_voltessimo.png";
import { AnimatedScore, useBattleFeedback } from "./BattleFeedback";
import { buildBattlePresentation, isSilentReplayStep, type BattlePresentationEvent } from "./battle-presentation";

const cardMap = getCardDefinitionMap(sampleCards);
const roleMap = getRoleDefinitionMap(sampleRoles);
const cardNameToDefinitionIdMap = Object.fromEntries(sampleCards.map((card) => [card.name, card.id] as const));
const roundBuffNameMap = Object.fromEntries(sampleRoundBuffs.map((buff) => [buff.name, buff] as const));
const AUTO_RESOLVE_DELAY_MS = 650;
const MIN_AUTO_RESOLVE_DELAY_MS = 50;
const ACTIVATION_ACCELERATION_SCALE = 24;
const ACTIVATION_ACCELERATION_POWER = 1.7;
const DOLPHIN_DUPLICATE_PLACEHOLDER_ID = "dolphin_duplicate_preview";
const AUDIO_VOLUME_STORAGE_KEY = "hyperdimensional_battle_audio_volume";

const aiLevelLabels: Record<AiLevel, string> = {
  easy: "かんたん",
  normal: "ふつう",
  advanced: "上級",
  expert: "最上位"
};

function getActivationCadenceDelayMs(activationCount: number) {
  const normalizedCount = Math.max(0, activationCount) / ACTIVATION_ACCELERATION_SCALE;
  const remainingSlowdown = Math.exp(-(normalizedCount ** ACTIVATION_ACCELERATION_POWER));
  return Math.round(
    MIN_AUTO_RESOLVE_DELAY_MS + (AUTO_RESOLVE_DELAY_MS - MIN_AUTO_RESOLVE_DELAY_MS) * remainingSlowdown
  );
}

function getReplayRoundActivationCount(frame: LocalGameState) {
  let count = 0;
  for (let index = frame.replayEvents.length - 1; index >= 0; index -= 1) {
    const event = frame.replayEvents[index];
    if (event?.type === "ROUND_START") {
      break;
    }
    if (event?.type === "CARD_ACTIVATED") {
      count += 1;
    }
  }
  return count;
}

function resolveMatchPhaseLabel(phase: LocalGameState["phase"]) {
  if (phase === "input") return "配置中";
  if (phase === "round_end") return "強化選択";
  return "対戦終了";
}

function formatReplayTimestamp(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remaining.toFixed(1).padStart(4, "0")}`;
}

function resolveReplayTimelineLabel(frame: LocalGameState, previousFrame: LocalGameState | undefined) {
  if (!previousFrame || previousFrame.round !== frame.round) return "ラウンド開始";
  const newEvents = frame.replayEvents.slice(previousFrame.replayEvents.length);
  const event = newEvents.at(-1);
  if (event?.type === "CARD_ACTIVATED") return "カード発動";
  if (event?.type === "ADDITIONAL_ACTIVATION_ANNOUNCED") {
    return event.activationKind === "reactivation" ? "再発動" : "追加発動";
  }
  if (event?.type === "CHANCE_ROLL_RESULT") return event.succeeded ? "抽選成功" : "抽選失敗";
  if (event?.type === "MULTI_HIT_STARTED") return `${event.count}回攻撃`;
  if (event?.type === "DAMAGE_DEALT") return `ダメージ ${formatDisplayNumber(event.amount)}`;
  if (event?.type === "FINAL_ATTACK") return `最終攻撃 ${formatDisplayNumber(event.amount)}`;
  if (event?.type === "CARD_DESTROYED") return `${event.name}を破壊`;
  if (event?.type === "CARD_REVIVED") return `${event.name}が復活`;
  if (event?.type === "ROUND_END") return "ラウンド終了";
  if (frame.pendingRoundBuffChoice) return "ラウンドバフ選択";
  if (frame.phase === "finished") return "ゲーム終了";
  return "効果処理";
}
const cardIllustrationMap: Partial<Record<string, string>> = {
  thunder_electric: thunderElectricIllustration,
  thunder_overcharge: thunderOverchargeIllustration,
  thunder_shock: thunderShockIllustration,
  thunder_speed_of_light: thunderSpeedOfLightIllustration,
  thunder_static: thunderStaticIllustration,
  thunder_voltage: thunderVoltageIllustration,
  thunder_vortex: thunderVortexIllustration
};
const roundBuffImageMap: Partial<Record<string, string>> = {
  round_buff_freezing_wind: roundBuffFreezingWindImage,
  round_buff_mirror: roundBuffMirrorImage,
  round_buff_tailwind_rush: roundBuffTailwindRushImage,
  round_buff_voltessimo: roundBuffVoltessimoImage
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
type FloatingTextTone = "red" | "purple" | "cyan" | "gold";
type FloatingText = {
  id: string;
  x: number;
  y: number;
  text: string;
  tone: FloatingTextTone;
  scope: "status" | "card";
};
type CardMotionOverlay = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  attribute: Attribute;
  fieldIndex: number;
  motion: "destroy" | "revive";
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
  mode: "attribute" | "enchanted";
  instanceIds: string[];
};

type ConnectedFieldOverlay = {
  key: string;
  attribute: Attribute;
  mode: "attribute" | "enchanted";
  lane: number;
  particleCount: number;
  left: number;
  top: number;
  width: number;
  height: number;
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
type AppScreen = "home" | "solo_setup" | "solo_battle" | "multi_lobby" | "multi_match" | "ranking" | "replay";
type RoundBuffPresentation = RoundBuffDefinition & {
  instanceId: string;
};
type LogGroup = {
  key: string;
  title: string | null;
  kind: "card" | "system-global" | "system-shared";
  cardType: CardType | null;
  entries: EngineLogEntry[];
  activationKind?: "normal" | "additional" | "reactivation";
  activationSourceName?: string | null;
};

type UtilityIconKind = "settings" | "catalog" | "round-buffs" | "help";
type SoloRankingEntry = {
  gameId: string;
  seed: string;
  roleId: string;
  roleName: string;
  totalScore: number;
  completedAt: string;
  replayCode?: string;
  replayGame?: LocalGameState;
  replayFrames?: LocalGameState[];
};
type PreparedReplay = ReplayRecord & { game: LocalGameState; frames: LocalGameState[] };

type MultiConnectionState = "idle" | "connecting" | "connected" | "error";

const STATUS_KEYS = ["baseAttack", "tempAttack", "baseMagic", "tempMagic", "scoreThisRound", "totalScore"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];
const ATTRIBUTE_ORDER: Attribute[] = ["none", "fire", "water", "ice", "wind", "thunder", "earth", "dark"];
const ACTIVATION_TONE_STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
const SOLO_RANKING_STORAGE_KEY = "hyperdimensional_battle_solo_rankings";
const DESTROY_MOTION_FRAGMENTS = [
  { left: 0, top: 0, width: 34, height: 24, tx: -28, ty: -34, rotate: -18 },
  { left: 34, top: 0, width: 32, height: 22, tx: 6, ty: -42, rotate: 12 },
  { left: 66, top: 0, width: 34, height: 25, tx: 30, ty: -28, rotate: 20 },
  { left: 0, top: 24, width: 30, height: 28, tx: -36, ty: -4, rotate: -22 },
  { left: 30, top: 22, width: 38, height: 30, tx: 2, ty: -10, rotate: 10 },
  { left: 68, top: 25, width: 32, height: 27, tx: 38, ty: 2, rotate: 24 },
  { left: 0, top: 52, width: 28, height: 24, tx: -32, ty: 24, rotate: -16 },
  { left: 28, top: 52, width: 40, height: 24, tx: -4, ty: 36, rotate: -8 },
  { left: 68, top: 52, width: 32, height: 24, tx: 32, ty: 26, rotate: 18 },
  { left: 0, top: 76, width: 34, height: 24, tx: -18, ty: 48, rotate: -10 },
  { left: 34, top: 76, width: 32, height: 24, tx: 6, ty: 56, rotate: 8 },
  { left: 66, top: 76, width: 34, height: 24, tx: 24, ty: 44, rotate: 14 }
] as const;

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
    case "round-buffs":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="utility-icon">
          <path d="M12 2.8l1.7 5.5 5.5 1.7-5.5 1.7-1.7 5.5-1.7-5.5L4.8 10l5.5-1.7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M18.2 15.2l.8 2.3 2.2.8-2.2.8-.8 2.2-.8-2.2-2.3-.8 2.3-.8z" fill="currentColor" />
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
  let storedValue: string | null = null;
  try {
    storedValue = window.localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY);
  } catch {
    return 55;
  }
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
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const normalized = decoded.trim().replace(/[^0-9A-Za-z_-]/g, "").slice(0, 32);
  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeReplayCode(value: string | undefined | null) {
  if (!value) return "";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return decoded.trim().replace(/[^0-9A-Za-z_~-]/g, "").slice(0, 160);
}

function sanitizePlayerNameInput(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han} _-]/gu, "")
    .trim()
    .slice(0, 24);
}

function renderMultiPlayerName(value: string) {
  return value.trim().length > 0 ? value : "未入力";
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
  if (head === "replay") {
    return {
      screen: "replay" as AppScreen,
      soloSeed: createDefaultSoloSeed(),
      lobbyId: createDefaultLobbyId()
    };
  }
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

function buildAppPath(screen: AppScreen, options?: { soloSeed?: string; lobbyId?: string; replayCode?: string }) {
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
    case "replay":
      return `/replay/${encodeURIComponent(sanitizeReplayCode(options?.replayCode))}`;
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
  const persistedEntries = entries.map(({ replayFrames: _replayFrames, ...entry }) => entry);
  window.localStorage.setItem(SOLO_RANKING_STORAGE_KEY, JSON.stringify(persistedEntries));
}

function buildRemoteReplayFrames(replay: ReplayRecord) {
  if (replay.frames?.length) return replay.frames;
  if (replay.game) return [replay.game];
  let current = replay.initialGame
    ? structuredClone(replay.initialGame)
    : createLocalGame({
        roleId: replay.roleId ?? "role_simple",
        cards: sampleCards,
        roles: sampleRoles,
        roundBuffs: sampleRoundBuffs,
        seed: replay.gameSeed ?? replay.seed
      });
  const frames = [structuredClone(current)];
  const stringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  for (const command of replay.commands ?? []) {
    const payload = command.payload;
    switch (command.action) {
      case "mulligan":
        current = applyMulliganOnly(current, stringArray(payload.instanceIds));
        break;
      case "start_resolution":
        current = startRoundResolution(current, stringArray(payload.orderedFieldIds));
        break;
      case "resolve_next":
        current = resolveNextCard(
          current,
          payload.targetSelections && typeof payload.targetSelections === "object"
            ? (payload.targetSelections as Record<string, string>)
            : {}
        );
        break;
      case "resolve_final":
        current = resolvePendingFinalAction(
          current,
          typeof payload.sourceInstanceId === "string" ? payload.sourceInstanceId : "",
          typeof payload.insertIndex === "number" ? payload.insertIndex : 0
        );
        break;
      case "finalize_round":
        current = finalizeRound(current, stringArray(payload.discardIds));
        break;
      case "reroll_buff":
        current = rerollRoundBuffChoice(current);
        break;
      case "choose_buff":
        current = chooseRoundBuff(current, typeof payload.optionIndex === "number" ? payload.optionIndex : -1);
        break;
      case "ai_round": {
        const requestedLevel = payload.level === "easy"
          ? "easy"
          : payload.level === "advanced" || payload.level === "expert"
            ? "advanced"
            : "normal";
        const roundResult = applyAiRoundDecisionWithFrames(current, planAiRound(current, requestedLevel));
        current = roundResult.state;
        frames.push(...roundResult.frames);
        if (current.phase === "round_end" && !current.pendingFinalAction) {
          current = finalizeRound(current, current.players[0]!.field.slice(0, 2).map((card) => card.instanceId));
          frames.push(structuredClone(current));
          if (current.pendingRoundBuffChoice) current = chooseRoundBuff(current, 0);
          frames.push(structuredClone(current));
        }
        continue;
      }
      default:
        continue;
    }
    frames.push(structuredClone(current));
  }
  return frames;
}

function getTargetOperations(card: CardDefinition) {
  return card.effects.flatMap((effect) =>
    effect.operations.flatMap((operation) =>
      "target" in operation && operation.target === "one_ally_field_card"
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
  if (attribute === "ice") {
    return getEffectiveRoundBuffCount(buffIds, "round_buff_freezing_wind");
  }
  if (attribute === "wind") {
    return getEffectiveRoundBuffCount(buffIds, "round_buff_tailwind_rush");
  }
  if (attribute === "dark") {
    return getEffectiveRoundBuffCount(buffIds, "round_buff_halloween_trick");
  }
  if (attribute === "fire") {
    return getEffectiveRoundBuffCount(buffIds, "round_buff_flame_reaction");
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
  const skippedCardMatch = entry.message.match(
    /^(.+?)\s+は(?:封印中|無効化されている|破壊済み)の?ためスキップしました。$/
  );
  if (skippedCardMatch) {
    return skippedCardMatch[1] ?? null;
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
    "ROUND_END_EFFECTS_TRIGGERED",
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
    if (entry.code === "CARD_ACTIVATED_DONE" || entry.code === "ADDITIONAL_ACTIVATION_QUEUED") {
      continue;
    }
    if (entry.code === "ENCHANT_APPLIED") {
      continue;
    }
    if (entry.code === "CARD_ACTIVATION_STARTED") {
      const title = extractLogGroupTitle(entry);
      const definitionId = title ? cardNameToDefinitionIdMap[title] : null;
      const activationKind =
        entry.meta?.activationKind === "additional" || entry.meta?.activationKind === "reactivation"
          ? entry.meta.activationKind
          : "normal";
      groups.push({
        key: `group_${entry.id}`,
        title,
        kind: "card",
        cardType: definitionId ? cardMap[definitionId]?.type ?? null : null,
        entries: [],
        activationKind,
        activationSourceName:
          typeof entry.meta?.activationSourceName === "string" ? entry.meta.activationSourceName : null
      });
      continue;
    }
    const kind = getLogGroupKind(entry);
    if (kind !== "card") {
      groups.push({
        key: `group_${entry.id}`,
        title: null,
        kind,
        cardType: null,
        entries: [entry]
      });
      continue;
    }
    const title = extractLogGroupTitle(entry);
    const definitionId = title ? cardNameToDefinitionIdMap[title] : null;
    const cardType = definitionId ? cardMap[definitionId]?.type ?? null : null;
    const currentGroup = groups[groups.length - 1];
    if (title && currentGroup?.kind === "card" && currentGroup.title === title) {
      currentGroup.entries.push(entry);
      continue;
    }

    groups.push({
      key: `group_${entry.id}`,
      title,
      kind: "card",
      cardType,
      entries: [entry]
    });
  }

  return groups;
}

function trimGroupedLogMessage(message: string, title: string | null) {
  if (!title) {
    return message;
  }
  return message
    .replace(new RegExp(`^${escapeRegExp(title)}[:：]\\s?`), "")
    .replace(new RegExp(`^${escapeRegExp(title)}\\s+は\\s*`), "");
}

function renderLogGroupLabel(group: LogGroup) {
  if (!group.title) {
    return null;
  }
  const badgeLabel =
    group.activationKind === "reactivation"
      ? "再発動"
      : group.activationKind === "additional"
        ? `追加発動${group.activationSourceName ? `：${group.activationSourceName}` : ""}`
        : null;
  const sourceDefinitionId = group.activationSourceName
    ? cardNameToDefinitionIdMap[group.activationSourceName]
    : undefined;
  const sourceCard = sourceDefinitionId ? cardMap[sourceDefinitionId] : undefined;
  const sourceRoundBuff = group.activationSourceName ? roundBuffNameMap[group.activationSourceName] : undefined;
  return (
    <div className="log-group-label">
      <span>{group.title}</span>
      {badgeLabel ? (
        <button type="button" className={`log-activation-badge is-${group.activationKind}`}>
          {badgeLabel}
          <span className="log-activation-reason-popup" role="tooltip">
            <strong>{group.activationSourceName ?? group.title}</strong>
            {sourceCard ? (
              <span className="card-text-body">
                {renderCardTextWithAdjustedNumbers(sourceCard.text, null, { definitionId: sourceCard.id })}
              </span>
            ) : sourceRoundBuff ? (
              <span>{sourceRoundBuff.description}</span>
            ) : null}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function getLogEntryClassName(entry: EngineLogEntry, group: LogGroup) {
  const classes = ["log-entry", `log-${entry.level}`];
  if (group.kind !== "card") {
    classes.push("log-entry-system");
  } else if (entry.meta?.sourceKind === "enchant") {
    classes.push("log-entry-enchant");
  } else if (entry.code === "DAMAGE_DEALT" && group.cardType) {
    classes.push(`log-entry-damage-${group.cardType}`);
  }
  return classes.join(" ");
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
  const chainMultiplier = card.derived?.chainNumericValueMultiplier;
  return (
    (typeof multiplier === "number" ? multiplier : 1) *
    (typeof roundBuffMultiplier === "number" ? roundBuffMultiplier : 1) *
    (typeof fieldTransformMultiplier === "number" ? fieldTransformMultiplier : 1) *
    (typeof chainMultiplier === "number" ? chainMultiplier : 1)
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
  const roundBuffMultiplier = card.derived?.roundBuffProbabilityValueMultiplier;
  return (typeof multiplier === "number" ? multiplier : 1) *
    (typeof roundBuffMultiplier === "number" ? roundBuffMultiplier : 1);
}

function formatCardTextNumber(value: number) {
  return formatDisplayNumber(value);
}

type CardTextValueKind = "normal" | "probability" | "enchant" | "special";

const cardTextValueKindTooltips: Record<CardTextValueKind, string> = {
  normal: "通常数値：カード数値への補正で変動します",
  probability: "確率数値：確率への補正で変動します",
  enchant: "エンチャント数値：エンチャントへの補正で変動します",
  special: "特殊値：原則として補正では変動しない固定値です"
};

function getCardTextValueKindTooltip(kind?: CardTextValueKind) {
  return kind ? cardTextValueKindTooltips[kind] : "変動数値";
}

function alignCardTextValueTooltip(event: ReactMouseEvent<HTMLSpanElement> | ReactFocusEvent<HTMLSpanElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const catalogCard = element.closest<HTMLElement>(".catalog-card");
  const boundary = catalogCard?.getBoundingClientRect();
  const boundaryLeft = boundary ? boundary.left + 8 : 8;
  const boundaryRight = boundary ? boundary.right - 8 : window.innerWidth - 8;
  const availableWidth = Math.max(1, boundaryRight - boundaryLeft);
  const tooltipWidth = Math.min(260, availableWidth);
  const anchorCenter = rect.left + rect.width / 2;
  const centeredLeft = anchorCenter - tooltipWidth / 2;
  const clampedLeft = Math.min(
    Math.max(centeredLeft, boundaryLeft),
    Math.max(boundaryLeft, boundaryRight - tooltipWidth)
  );
  element.style.setProperty("--card-value-tooltip-width", `${tooltipWidth}px`);
  element.style.setProperty("--card-value-tooltip-shift-x", `${clampedLeft - centeredLeft}px`);
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
      kind: "normal" | "probability" | "enchant" | "special";
      preserveWrittenValue?: boolean;
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
          tabIndex={0}
          onMouseEnter={alignCardTextValueTooltip}
          onFocus={alignCardTextValueTooltip}
          data-value-kind-label={getCardTextValueKindTooltip(replacement.kind)}
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
      kind: "normal" | "probability" | "enchant" | "special";
      preserveWrittenValue?: boolean;
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
        tabIndex={0}
        onMouseEnter={alignCardTextValueTooltip}
        onFocus={alignCardTextValueTooltip}
        data-value-kind-label={getCardTextValueKindTooltip(replacement?.kind)}
        className={`card-text-value-chip${
          replacement?.change === "up"
            ? " card-text-value-modified-up"
            : replacement?.change === "down"
              ? " card-text-value-modified-down"
              : ""
        }${replacement ? ` card-text-value-kind-${replacement.kind}` : ""}`}
      >
        {replacement
          ? replacement.preserveWrittenValue
            ? markerValue
            : formatMarkedProbabilityAwareTextNumber(markerValue, Number(replacement.value))
          : markerValue}
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
      kind: "normal" | "probability" | "enchant" | "special";
      preserveWrittenValue?: boolean;
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
      parts.push(<Fragment key={`segment_${lastIndex}`}>{rendered.parts}</Fragment>);
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
    parts.push(<Fragment key={`segment_${lastIndex}`}>{rendered.parts}</Fragment>);
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
      kind: "normal" | "probability" | "enchant" | "special";
      preserveWrittenValue?: boolean;
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
          tabIndex={0}
          onMouseEnter={alignCardTextValueTooltip}
          onFocus={alignCardTextValueTooltip}
          data-value-kind-label={getCardTextValueKindTooltip(replacement.kind)}
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
      kind: "normal" | "probability" | "enchant" | "special";
      preserveWrittenValue?: boolean;
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
        tabIndex={0}
        onMouseEnter={alignCardTextValueTooltip}
        onFocus={alignCardTextValueTooltip}
        data-value-kind-label={getCardTextValueKindTooltip(replacement?.kind)}
        className={`card-text-value-chip${
          replacement?.change === "up"
            ? " card-text-value-modified-up"
            : replacement?.change === "down"
              ? " card-text-value-modified-down"
              : ""
        }${replacement ? ` card-text-value-kind-${replacement.kind}` : ""}`}
      >
        {replacement
          ? replacement.preserveWrittenValue
            ? markerValue
            : formatMarkedCardTextNumber(markerValue, Number(replacement.value))
          : markerValue}
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
      kind: "normal" | "probability" | "enchant" | "special";
      preserveWrittenValue?: boolean;
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
    const operationValue = operation && binding.operationValueKey
      ? (operation as Record<string, unknown>)[binding.operationValueKey]
      : operation?.value;
    const originalValue = binding.literalValue ?? operationValue;
    if (typeof originalValue !== "number") {
      continue;
    }
    const adjustedValue = (() => {
      const writtenKind = binding.writtenValueKind ?? "normal";
      if (writtenKind === "enchant") {
        return originalValue + hostEnchantNumericBonus;
      }
      if (writtenKind === "probability") {
        return isEnchantDefinition ? originalValue : originalValue * probabilityMultiplier;
      }
      if (writtenKind === "special") {
        return originalValue;
      }
      return (originalValue + numericBonus) * numericMultiplier;
    })();
    const change = adjustedValue > originalValue ? "up" : adjustedValue < originalValue ? "down" : "none";
    replacements.set(binding.occurrence, {
      value: formatCardTextNumber(adjustedValue),
      change,
      kind: binding.writtenValueKind ?? "normal",
      preserveWrittenValue: binding.preserveWrittenValue
    });
  }

  const parts: ReactNode[] = [];
  let occurrence = 0;
  const lines = formattedText.split("\n");
  lines.forEach((line, index) => {
    const rendered = renderCardTextLine(line, replacements, occurrence, options);
    parts.push(<Fragment key={`line_${index}`}>{rendered.parts}</Fragment>);
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
      mode: connectedConfig.mode,
      instanceIds: field.slice(start, end + 1).map((entry) => entry.instanceId)
    });
  });

  return groups;
}

function getTargetOperationLabel(key: string) {
  switch (key) {
    case "destroy_target":
      return "破壊するカード";
    case "apply_enchant":
      return "エンチャントを付与するカード";
    default:
      return "対象カード";
  }
}

function buildConnectedFieldOverlays(
  groups: ConnectedFieldGroup[],
  rowElement: HTMLDivElement | null,
  cardRefs: Map<string, HTMLDivElement>
) {
  if (!rowElement) {
    return [] as ConnectedFieldOverlay[];
  }

  const rowRect = rowElement.getBoundingClientRect();
  const overlays: ConnectedFieldOverlay[] = [];
  const laneUsage = new Map<string, number>();

  for (const group of groups) {
    const cardRects = group.instanceIds
      .map((instanceId) => cardRefs.get(instanceId)?.getBoundingClientRect() ?? null)
      .filter((rect): rect is DOMRect => Boolean(rect));

    if (cardRects.length < 2) {
      continue;
    }

    const minLeft = Math.min(...cardRects.map((rect) => rect.left));
    const maxRight = Math.max(...cardRects.map((rect) => rect.right));
    const minTop = Math.min(...cardRects.map((rect) => rect.top));
    const maxBottom = Math.max(...cardRects.map((rect) => rect.bottom));
    const laneKey = `${group.start}-${group.end}`;
    const lane = laneUsage.get(laneKey) ?? 0;
    laneUsage.set(laneKey, lane + 1);
    const inset = 6 + lane * 12;
    const overlayWidth = maxRight - minLeft + inset * 2;
    const baseParticleCount = group.mode === "enchanted" ? 8 : 6;
    const countByCards = Math.max(0, group.instanceIds.length - 2) * 2;
    const countByWidth = Math.max(0, Math.ceil((overlayWidth - 260) / 90));
    const particleCount = Math.min(24, baseParticleCount + countByCards + countByWidth);

    overlays.push({
      key: group.key,
      attribute: group.attribute,
      mode: group.mode,
      lane,
      particleCount,
      left: minLeft - rowRect.left + rowElement.scrollLeft - inset,
      top: minTop - rowRect.top - inset,
      width: overlayWidth,
      height: maxBottom - minTop + inset * 2
    });
  }

  return overlays;
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
  const [multiPlayerName, setMultiPlayerName] = useState(() => loadStoredMultiPlayerName());
  const [multiViewPlayerId, setMultiViewPlayerId] = useState(() => getOrCreateMultiPlayerId());
  const [replayCodeInput, setReplayCodeInput] = useState(() =>
    typeof window === "undefined" ? "" : sanitizeReplayCode(window.location.pathname.split("/")[2])
  );
  const [activeReplay, setActiveReplay] = useState<PreparedReplay | null>(null);
  const [replayFrameIndex, setReplayFrameIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(sampleRoles[0]?.id ?? "");
  const [selectedAiLevel, setSelectedAiLevel] = useState<AiLevel>("normal");
  const [selectedAiRoleId, setSelectedAiRoleId] = useState(sampleRoles[0]?.id ?? "");
  const [isGeneratingSoloAiReplay, setIsGeneratingSoloAiReplay] = useState(false);
  const [soloAiReplayProgress, setSoloAiReplayProgress] = useState<{
    round: number;
    completedRounds: number;
    message: string;
    processedPlans?: number;
    totalPlans?: number;
    explorationPercent?: number;
  } | null>(null);
  const [game, setGame] = useState<LocalGameState | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isCardCatalogOpen, setIsCardCatalogOpen] = useState(false);
  const [isRoundBuffCatalogOpen, setIsRoundBuffCatalogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRoundBuffListOpen, setIsRoundBuffListOpen] = useState(false);
  const [audioVolume, setAudioVolume] = useState(() => getInitialAudioVolume());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [cardSearchText, setCardSearchText] = useState("");
  const [cardTypeFilter, setCardTypeFilter] = useState<"all" | CardType>("all");
  const [cardAttributeFilter, setCardAttributeFilter] = useState<"all" | Attribute>("all");
  const [inputStep, setInputStep] = useState<InputStep>("mulligan");
  const [mulliganIds, setMulliganIds] = useState<string[]>([]);
  const [previewFieldOrder, setPreviewFieldOrder] = useState<string[]>([]);
  const [draggedCard, setDraggedCard] = useState<DraggedCardState | null>(null);
  const [collapsedDragOriginId, setCollapsedDragOriginId] = useState<string | null>(null);
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
  const [isRoundBuffSubmitting, setIsRoundBuffSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<HoveredCardState | null>(null);
  const [hoveredTooltipDetailDefinitionId, setHoveredTooltipDetailDefinitionId] = useState<string | null>(null);
  const [hoverTooltipHeight, setHoverTooltipHeight] = useState(260);
  const [soloRankings, setSoloRankings] = useState<SoloRankingEntry[]>(() => loadSoloRankings());
  const [particleBursts, setParticleBursts] = useState<ParticleBurst[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [cardMotionOverlays, setCardMotionOverlays] = useState<CardMotionOverlay[]>([]);
  const [connectionOverlayVersion, setConnectionOverlayVersion] = useState(0);
  const fieldCardRefs = useRef(new Map<string, HTMLDivElement>());
  const fieldRowRef = useRef<HTMLDivElement | null>(null);
  const statusBlockRefs = useRef(new Map<StatusKey, HTMLDivElement>());
  const lastProcessedReplayIndexRef = useRef(0);
  const lastProcessedLogIndexRef = useRef(0);
  const lastActivationRef = useRef<{ instanceId: string; attribute: Attribute } | null>(null);
  const previousStatusRef = useRef<StatSnapshot | null>(null);
  const particleTimeoutIdsRef = useRef<number[]>([]);
  const floatingTimeoutIdsRef = useRef<number[]>([]);
  const replayStepTimeoutRef = useRef<number | null>(null);
  const replayQueueRef = useRef<BattlePresentationEvent[]>([]);
  const queuedScoreRef = useRef({ scoreThisRound: 0, totalScore: 0 });
  const replayUserPausedRef = useRef(false);
  const replayProcessingRef = useRef(false);
  const gameRef = useRef<LocalGameState | null>(null);
  const statusPanelRef = useRef<HTMLElement | null>(null);
  const placementRowRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const tooltipHideTimeoutRef = useRef<number | null>(null);
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const dragScrollVelocityRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const battleFrameRef = useRef<HTMLDivElement | null>(null);
  const activationToneCountRef = useRef(0);
  const savedRankingGameIdsRef = useRef(new Set<string>());
  const soloReplayFramesRef = useRef<LocalGameState[]>([]);
  const initialReplayLoadedRef = useRef(false);
  const multiSocketRef = useRef<WebSocket | null>(null);

  const player = game?.players[0] ?? null;
  const battleFeedback = useBattleFeedback({
    identity: `${game?.gameId ?? ""}:${player?.playerId ?? ""}`,
    volume: audioVolume,
    audio: audioContextRef,
    fieldCards: fieldCardRefs,
    definitionId: (instanceId) => player ? [...player.field, ...player.hand, ...player.discard, ...player.removed, ...player.deck]
      .find((card) => card.instanceId === instanceId)?.definitionId : undefined,
    scoreAnchor: () => statusBlockRefs.current.get("scoreThisRound"),
    frame: battleFrameRef
  });
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
  const isSpectatingMultiPlayer = appScreen === "multi_match" && multiViewPlayerId !== multiPlayerId;
  const isReplayBattle = appScreen === "replay";
  const isReadOnlyBattle = isSpectatingMultiPlayer || isReplayBattle;
  const replayTimeline = useMemo(() => {
    const frames = activeReplay?.frames ?? [];
    const roundStartIndexes = new Map<number, number>();
    return frames.map((frame, index) => {
      if (!roundStartIndexes.has(frame.round)) roundStartIndexes.set(frame.round, index);
      const roundStartIndex = roundStartIndexes.get(frame.round) ?? index;
      const framePlayer = frame.players[0];
      return {
        index,
        round: frame.round,
        elapsedSeconds: index * 0.9,
        roundElapsedSeconds: (index - roundStartIndex) * 0.9,
        scoreThisRound: framePlayer?.scoreThisRound ?? 0,
        totalScore: framePlayer?.totalScore ?? 0,
        label: resolveReplayTimelineLabel(frame, frames[index - 1])
      };
    });
  }, [activeReplay]);
  const pendingDolphinFinalAction =
    !isReadOnlyBattle && game?.pendingFinalAction?.kind === "dolphin_duplicate" ? game.pendingFinalAction : null;
  const pendingRoundBuffChoice = !isReadOnlyBattle ? game?.pendingRoundBuffChoice ?? null : null;
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
  const allMultiPlayersHaveRoles = multiPlayers.length > 0 && multiPlayers.every((entry) => Boolean(entry.roleId));
  const canStartMultiMatch = Boolean(isMultiHost && multiPlayers.length >= 2 && allMultiPlayersReady && allMultiPlayersHaveRoles);
  const isMultiMatchFinished = Boolean(
    multiRoomState?.matchPlayers?.length && multiRoomState.matchPlayers.every((entry) => entry.phase === "finished")
  );
  const isMultiBattle = appScreen === "multi_match";
  const applyRemoteMatchAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (isReadOnlyBattle) {
      throw new Error("観戦・リプレイ中は操作できません。");
    }
    const nextState = await submitMatchAction(lobbyId, { playerId: multiPlayerId, action, ...payload });
    setMultiRoomState(nextState);
    if (nextState.game) {
      setGame(nextState.game);
    }
    return nextState;
  };
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
  const groupedSelectedRoundBuffs = useMemo(
    () =>
      selectedRoundBuffs.reduce<Array<RoundBuffPresentation & { count: number }>>((groups, buff) => {
        const existing = groups.find((entry) => entry.id === buff.id);
        if (existing) existing.count += 1;
        else groups.push({ ...buff, count: 1 });
        return groups;
      }, []),
    [selectedRoundBuffs]
  );
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
  const navigateToScreen = (
    nextScreen: AppScreen,
    options?: { soloSeed?: string; lobbyId?: string; replayCode?: string; replace?: boolean }
  ) => {
    const nextSoloSeed = options?.soloSeed ? sanitizeRouteToken(options.soloSeed, createDefaultSoloSeed()) : soloSeed;
    const nextLobbyId = options?.lobbyId ? sanitizeRouteToken(options.lobbyId, createDefaultLobbyId()) : lobbyId;
    const nextPath = buildAppPath(nextScreen, {
      soloSeed: nextSoloSeed,
      lobbyId: nextLobbyId,
      replayCode: options?.replayCode
    });
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
    lastProcessedReplayIndexRef.current = 0;
    lastProcessedLogIndexRef.current = 0;
    replayQueueRef.current = [];
    replayProcessingRef.current = false;
    lastActivationRef.current = null;
    activationToneCountRef.current = 0;
    queuedScoreRef.current = { scoreThisRound: 0, totalScore: 0 };
    if (replayStepTimeoutRef.current !== null) {
      window.clearTimeout(replayStepTimeoutRef.current);
      replayStepTimeoutRef.current = null;
    }
    setParticleBursts([]);
    setFloatingTexts([]);
    setCardMotionOverlays([]);
  }, [game?.gameId, player?.playerId]);

  useEffect(() => {
    if (game?.phase === "input" && player) {
      setInputStep("mulligan");
      setMulliganIds([]);
      setPreviewFieldOrder(player.field.map((card) => card.instanceId));
      setDraggedCard(null);
      setCollapsedDragOriginId(null);
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
      if (replayStepTimeoutRef.current !== null) {
        window.clearTimeout(replayStepTimeoutRef.current);
      }
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
    if (appScreen !== "solo_battle" || !game) return;
    if (soloReplayFramesRef.current.at(-1) !== game) {
      soloReplayFramesRef.current = [...soloReplayFramesRef.current, structuredClone(game)];
    }
  }, [appScreen, game]);

  useEffect(() => {
    if (appScreen !== "solo_battle" || !game || game.phase !== "finished" || savedRankingGameIdsRef.current.has(game.gameId)) {
      return;
    }

    const role = roleMap[game.players[0]?.roleId ?? ""];
    const entry: SoloRankingEntry = {
      gameId: game.gameId,
      seed: game.rngSeed,
      roleId: game.players[0]?.roleId ?? "",
      roleName: role?.name ?? game.players[0]?.roleId ?? "不明",
      totalScore: game.players[0]?.totalScore ?? 0,
      completedAt: new Date().toISOString(),
      replayCode: `${game.rngSeed}~solo~${createRandomRouteToken(8)}`,
      replayGame: game,
      replayFrames: soloReplayFramesRef.current
    };
    const nextEntries = [...soloRankings.filter((current) => current.gameId !== game.gameId), entry].sort(
      (left, right) => right.totalScore - left.totalScore || right.completedAt.localeCompare(left.completedAt)
    );
    savedRankingGameIdsRef.current.add(game.gameId);
    const limitedEntries = nextEntries.slice(0, 10);
    setSoloRankings(limitedEntries);
    saveSoloRankings(limitedEntries);
  }, [appScreen, game, soloRankings]);

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
        let roomState = joined;
        if (joined.phase === "match") {
          roomState = await fetchRoomState(lobbyId, multiPlayerId, multiViewPlayerId);
          if (roomState.game) {
            setGame(roomState.game);
          }
        }
        setMultiRoomState(roomState);
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
            if (nextState.phase === "match") {
              void fetchRoomState(lobbyId, multiPlayerId, multiViewPlayerId).then((privateState) => {
                if (!cancelled) {
                  setMultiRoomState(privateState);
                  if (privateState.game) {
                    setGame(privateState.game);
                  }
                }
              });
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
  }, [appScreen, lobbyId, multiPlayerId, multiPlayerName, multiSeed, multiViewPlayerId, multiWorkerUrl]);

  useEffect(() => {
    const primeAudio = async () => {
      if (audioVolume <= 0) {
        return;
      }
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new window.AudioContext();
      }
      if (audioContextRef.current.state !== "running") {
        await audioContextRef.current.resume().catch(() => undefined);
      }
    };

    const handlePrimeAudio = () => { void primeAudio(); };
    window.addEventListener("pointerdown", handlePrimeAudio);
    window.addEventListener("keydown", handlePrimeAudio);
    return () => {
      window.removeEventListener("pointerdown", handlePrimeAudio);
      window.removeEventListener("keydown", handlePrimeAudio);
    };
  }, [audioVolume]);

  const playActivationTone = async (attribute: Attribute) => {
    if (audioVolume <= 0 || typeof window === "undefined") {
      return;
    }

    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new window.AudioContext();
    }
    const audioContext = audioContextRef.current;
    if (audioContext.state !== "running") {
      await audioContext.resume().catch(() => undefined);
    }
    if (audioContext.state !== "running") {
      return;
    }
    const semitone =
      ACTIVATION_TONE_STEPS[Math.min(activationToneCountRef.current, ACTIVATION_TONE_STEPS.length - 1)] ?? 0;
    const baseFrequency = 261.63;
    const frequency = baseFrequency * 2 ** (semitone / 12);
    const startAt = audioContext.currentTime + 0.004;
    const peakGain = Math.max(0.0001, audioVolume / 900);

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = attribute === "water" || attribute === "ice" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.15);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.onended = () => { oscillator.disconnect(); gainNode.disconnect(); };
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.17);
  };

  const playCueTone = async (kind: "additional" | "reactivation" | "chance-failed") => {
    if (audioVolume <= 0 || typeof window === "undefined") return;
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new window.AudioContext();
    }
    const audioContext = audioContextRef.current;
    if (audioContext.state !== "running") {
      await audioContext.resume().catch(() => undefined);
    }
    if (audioContext.state !== "running") return;

    const startAt = audioContext.currentTime + 0.004;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const isFailure = kind === "chance-failed";
    const startFrequency = isFailure ? 190 : kind === "reactivation" ? 440 : 560;
    const endFrequency = isFailure ? 125 : kind === "reactivation" ? 660 : 820;
    const duration = isFailure ? 0.14 : 0.12;
    oscillator.type = isFailure ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(startFrequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration);
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, audioVolume / (isFailure ? 1500 : 1100)), startAt + 0.006);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
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
      setCardMotionOverlays([]);
      replayQueueRef.current = [];
      replayProcessingRef.current = false;
      if (replayStepTimeoutRef.current !== null) {
        window.clearTimeout(replayStepTimeoutRef.current);
        replayStepTimeoutRef.current = null;
      }
      return;
    }

    const newEvents = game.replayEvents.slice(lastProcessedReplayIndexRef.current);
    const newLogs = game.log.slice(lastProcessedLogIndexRef.current);
    const targetScore = { scoreThisRound: game.players[0].scoreThisRound, totalScore: game.players[0].totalScore };
    if (newEvents.length === 0 && newLogs.length === 0) {
      if (!replayProcessingRef.current) battleFeedback.syncScore(targetScore);
      else if (targetScore.scoreThisRound !== queuedScoreRef.current.scoreThisRound || targetScore.totalScore !== queuedScoreRef.current.totalScore) {
        replayQueueRef.current.push({ type: "SCORE_SYNC", score: targetScore });
      }
      queuedScoreRef.current = targetScore;
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
      setParticleBursts((current) => [...current.slice(-15), burst]);
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
        ...current.slice(-23),
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

    const getCardAnchor = (targetInstanceId?: string) => {
      const activeInstanceId = targetInstanceId ?? lastActivationRef.current?.instanceId;
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

    const spawnCardMotionOverlay = (
      event: Extract<ReplayEvent, { type: "CARD_DESTROYED" | "CARD_REVIVED" }>,
      motion: "destroy" | "revive"
    ) => {
      const rowRect = fieldRowRef.current?.getBoundingClientRect();
      if (!rowRect) {
        return;
      }
      const fieldElement = fieldCardRefs.current.get(event.instanceId);
      const fieldRect = fieldElement?.getBoundingClientRect();
      const overlayId = `${motion}_${event.instanceId}_${Date.now()}`;
      const sampleRect = fieldRect ?? fieldCardRefs.current.values().next().value?.getBoundingClientRect();
      const cardWidth = sampleRect?.width ?? 116;
      const cardHeight = sampleRect?.height ?? 174;
      const cardGap = 2;
      const left =
        fieldRect?.left !== undefined
          ? fieldRect.left + fieldRect.width / 2
          : rowRect.left + cardWidth / 2 + event.fieldIndex * (cardWidth + cardGap) - fieldRowRef.current!.scrollLeft;
      const top = fieldRect?.top !== undefined ? fieldRect.top + fieldRect.height / 2 : rowRect.top + 10 + cardHeight / 2;
      setCardMotionOverlays((current) => [
        ...current,
        {
          id: overlayId,
          x: left,
          y: top,
          width: cardWidth,
          height: cardHeight,
          name: event.name,
          attribute: event.attribute,
          fieldIndex: event.fieldIndex,
          motion
        }
      ]);
      const timeoutId = window.setTimeout(() => {
        setCardMotionOverlays((current) => current.filter((entry) => entry.id !== overlayId));
        floatingTimeoutIdsRef.current = floatingTimeoutIdsRef.current.filter((entry) => entry !== timeoutId);
      }, motion === "destroy" ? 430 : 380);
      floatingTimeoutIdsRef.current.push(timeoutId);
    };

    const processReplayQueue = () => {
      if (replayProcessingRef.current) {
        return;
      }
      replayProcessingRef.current = true;
      const step = () => {
        const event = replayQueueRef.current.shift();
        if (!event) {
          battleFeedback.finish();
          replayProcessingRef.current = false;
          replayStepTimeoutRef.current = null;
          return;
        }

        if (event.type === "SCORE_SYNC") {
          battleFeedback.syncScore(event.score);
          replayStepTimeoutRef.current = window.setTimeout(step, 0);
          return;
        }

        if (event.type === "CARD_DESTROYED") {
          const destroyEvents: Array<Extract<ReplayEvent, { type: "CARD_DESTROYED" }>> = [event];
          while (replayQueueRef.current[0]?.type === "CARD_DESTROYED") {
            const nextDestroyEvent = replayQueueRef.current.shift();
            if (nextDestroyEvent?.type === "CARD_DESTROYED") {
              destroyEvents.push(nextDestroyEvent);
            }
          }

          for (const destroyEvent of destroyEvents) {
            battleFeedback.present(destroyEvent);
            handleReplayEventParticle(destroyEvent, spawnBurst, lastActivationRef);
            spawnCardMotionOverlay(destroyEvent, "destroy");
          }

          replayStepTimeoutRef.current = window.setTimeout(step, 430);
          return;
        }

        if (event.type !== "DAMAGE_DEALT" && event.type !== "FINAL_ATTACK") {
          handleReplayEventParticle(event, spawnBurst, lastActivationRef);
        }
        const impactDelay = battleFeedback.present(event, {
          launch: () => handleReplayEventParticle(event, spawnBurst, lastActivationRef),
          impact: (multiHit) => {
            if (!multiHit && (event.type === "DAMAGE_DEALT" || event.type === "FINAL_ATTACK")) {
              spawnFloatingText(event.type === "FINAL_ATTACK" ? "gold" : "red",
                `+${formatDisplayNumber(event.amount)}`, getStatusAnchor("scoreThisRound"), "status");
            }
          }
        });

        if (event.type === "ROUND_START") {
          activationToneCountRef.current = 0;
        }

        if (event.type === "CARD_ACTIVATED") {
          void playActivationTone(event.attribute);
          activationToneCountRef.current += 1;
        }

        if (event.type === "ADDITIONAL_ACTIVATION_ANNOUNCED") {
          void playCueTone(event.activationKind);
          spawnFloatingText(
            event.activationKind === "reactivation" ? "purple" : "cyan",
            event.activationKind === "reactivation" ? "再発動！" : "追加発動！",
            getCardAnchor(event.instanceId),
            "card",
            { y: -42 }
          );
        }

        if (event.type === "CHANCE_ROLL_RESULT" && !event.succeeded) {
          void playCueTone("chance-failed");
        }

        if (event.type === "CARD_REVIVED") {
          spawnCardMotionOverlay(event, "revive");
        }

        if (event.type === "STATUS_CHANGED") {
          const latestGame = gameRef.current;
          const previous = previousStatusRef.current;
          const nextSnapshot: StatSnapshot = {
            baseAttack: event.baseAttack,
            baseMagic: event.baseMagic,
            tempAttack: event.tempAttack,
            tempMagic: event.tempMagic,
            scoreThisRound: latestGame?.players[0]?.scoreThisRound ?? 0,
            totalScore: latestGame?.players[0]?.totalScore ?? 0
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
            scoreThisRound: latestGame?.players[0]?.scoreThisRound ?? nextSnapshot.scoreThisRound,
            totalScore: latestGame?.players[0]?.totalScore ?? nextSnapshot.totalScore
          };
        }

        const nextActivationIndex = replayQueueRef.current.findIndex(
          (queuedEvent) => queuedEvent.type === "CARD_ACTIVATED" || queuedEvent.type === "FINAL_ATTACK"
        );
        const eventsInCurrentActivation =
          nextActivationIndex < 0 ? replayQueueRef.current : replayQueueRef.current.slice(0, nextActivationIndex);
        const hasFollowingHit =
          event.type === "DAMAGE_DEALT" &&
          eventsInCurrentActivation.some(
            (queuedEvent) => queuedEvent.type === "DAMAGE_DEALT" && queuedEvent.source === event.source
          );
        const immediatelyPrecedesActivation = nextActivationIndex === 0;
        const delay =
          event.type === "FINAL_ATTACK"
            ? 650
            : event.type === "CARD_REVIVED"
            ? 380
            : event.type === "CARD_ACTIVATED"
              ? immediatelyPrecedesActivation
                ? getActivationCadenceDelayMs(activationToneCountRef.current)
                : 90
              : event.type === "ADDITIONAL_ACTIVATION_ANNOUNCED"
                ? getActivationCadenceDelayMs(activationToneCountRef.current)
              : event.type === "CHANCE_ROLL_RESULT" && !event.succeeded
                ? 120
              : event.type === "MULTI_HIT_STARTED"
                ? 140
              : hasFollowingHit
                ? Math.max(150, Math.min(220, getActivationCadenceDelayMs(activationToneCountRef.current)))
              : immediatelyPrecedesActivation
                ? getActivationCadenceDelayMs(activationToneCountRef.current)
              : 0;
        replayStepTimeoutRef.current = window.setTimeout(step, Math.max(delay, impactDelay));
      };

      step();
    };

    replayQueueRef.current.push(...buildBattlePresentation(newEvents, queuedScoreRef.current, targetScore, game.players[0].playerId));
    queuedScoreRef.current = targetScore;
    processReplayQueue();

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

  // HTML Drag and Drop cancels when its source node is removed from the DOM.
  // Keep the dragged field card rendered (visually collapsed by CSS) until drop.
  const placementBaseCards = useMemo(() => previewCards, [previewCards]);

  const currentResolutionCard = useMemo(() => (game ? getCurrentResolutionCard(game) : null), [game]);
  const currentResolutionOperations = useMemo(() => {
    if (!game || !currentResolutionCard) {
      return [];
    }
    const targetKeys = getCurrentResolutionTargetKeys(game);
    if (targetKeys.length > 0) {
      return targetKeys.map((key) => ({
        key,
        label: getTargetOperationLabel(key)
      }));
    }
    return getTargetOperations(cardMap[currentResolutionCard.definitionId]);
  }, [currentResolutionCard, game]);
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
    const candidateIds = new Set(getCurrentResolutionTargetCandidateIds(game!));
    return player.field.filter((card) => candidateIds.has(card.instanceId));
  }, [game, player, currentResolutionCard]);

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
  const connectedFieldOverlays = useMemo(
    () => buildConnectedFieldOverlays(connectedFieldGroups, fieldRowRef.current, fieldCardRefs.current),
    [connectedFieldGroups, connectionOverlayVersion]
  );
  const destroySpacerIndexes = useMemo(
    () =>
      cardMotionOverlays
        .filter((overlay) => overlay.motion === "destroy")
        .map((overlay) => overlay.fieldIndex)
        .sort((a, b) => a - b),
    [cardMotionOverlays]
  );

  useLayoutEffect(() => {
    if (inputStep === "placement") {
      return;
    }

    const handleLayoutChange = () => setConnectionOverlayVersion((current) => current + 1);
    const rowElement = fieldRowRef.current;
    handleLayoutChange();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && rowElement
        ? new ResizeObserver(() => {
            handleLayoutChange();
          })
        : null;

    if (resizeObserver && rowElement) {
      resizeObserver.observe(rowElement);
    }
    window.addEventListener("resize", handleLayoutChange);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleLayoutChange);
    };
  }, [connectedFieldGroups, inputStep, player?.field.length]);

  useEffect(() => {
    if (!game?.pendingResolution || isReadOnlyBattle) {
      return;
    }

    if (!currentResolutionCard) {
      const advance = async () => {
        if (replayProcessingRef.current) {
          timeoutId = window.setTimeout(() => void advance(), 32);
          return;
        }
        const currentGame = gameRef.current;
        if (!currentGame) {
          return;
        }
        try {
          const nextState = isMultiBattle
            ? (await applyRemoteMatchAction("resolve_next", { targetSelections: {} })).game
            : resolveNextCard(currentGame, {});
          if (!nextState) return;
          setGame(nextState);
          setError(null);
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "Failed to auto-resolve card effect.");
        }
      };
      let timeoutId = window.setTimeout(() => void advance(), 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    const targetKeys = getCurrentResolutionTargetKeys(game);
    const hasTargets = targetKeys.length > 0;
    if (hasTargets || currentTokenPlacementRequirement) {
      return;
    }

    const advance = async () => {
      if (replayProcessingRef.current) {
        timeoutId = window.setTimeout(() => void advance(), 32);
        return;
      }
      const currentGame = gameRef.current;
      if (!currentGame) {
        return;
      }
      try {
        const nextState = isMultiBattle
          ? (await applyRemoteMatchAction("resolve_next", { targetSelections: {} })).game
          : resolveNextCard(currentGame, {});
        if (!nextState) return;
        setGame(nextState);
        setError(null);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Failed to auto-resolve card effect.");
      }
    };
    const delay = hasCurrentResolutionActivationEffect(game) ? getActivationCadenceDelayMs(game.pendingResolution.activationCount) : 0;
    let timeoutId = window.setTimeout(() => void advance(), delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [game, currentResolutionCard, currentTokenPlacementRequirement, isReadOnlyBattle]);

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
    soloReplayFramesRef.current = [];
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

  const watchSoloAiReplay = async () => {
    const normalizedSeed = sanitizeRouteToken(soloSeed, createDefaultSoloSeed());
    setSoloSeed(normalizedSeed);
    setIsGeneratingSoloAiReplay(true);
    setSoloAiReplayProgress({ round: 1, completedRounds: 0, message: "第1ラウンドの手を考えています…" });
    setError(null);

    try {
      const code = `${normalizedSeed}~solo-ai~${createRandomRouteToken(8)}`;
      let replayOpened = false;
      const streamReplayFrames = (aiGame: LocalGameState, frames: LocalGameState[]) => {
        const replay: PreparedReplay = {
          code,
          roomId: "solo",
          seed: normalizedSeed,
          playerId: aiGame.players[0]?.playerId ?? "solo-ai",
          displayName: `AI（${aiLevelLabels[selectedAiLevel]}）`,
          completedAt: new Date().toISOString(),
          roleId: selectedRoleId,
          gameSeed: aiGame.rngSeed,
          initialGame: frames[0],
          game: aiGame,
          frames
        };

        if (!replayOpened) {
          replayOpened = true;
          replayUserPausedRef.current = false;
          setReplayCodeInput(code);
          setActiveReplay(replay);
          setReplayFrameIndex(0);
          lastProcessedReplayIndexRef.current = 0;
          replayQueueRef.current = [];
          replayProcessingRef.current = false;
          setGame(frames[0] ?? aiGame);
          navigateToScreen("replay", { replayCode: code });
        } else {
          setActiveReplay((current) => current ? { ...current, game: aiGame, frames } : replay);
        }
        if (!replayUserPausedRef.current) setIsReplayPlaying(true);
      };
      const worker = new Worker(new URL("./soloAiReplay.worker.ts", import.meta.url), { type: "module" });
      const { game: aiGame, frames } = await new Promise<{ game: LocalGameState; frames: LocalGameState[] }>((resolve, reject) => {
        worker.addEventListener("message", (event: MessageEvent<{
          type?: "progress" | "round_complete" | "complete";
          round?: number;
          completedRounds?: number;
          processedPlans?: number;
          totalPlans?: number;
          explorationPercent?: number;
          message?: string;
          game?: LocalGameState;
          frames?: LocalGameState[];
          error?: string;
        }>) => {
          if (event.data.type === "progress") {
            setSoloAiReplayProgress({
              round: event.data.round ?? 1,
              completedRounds: event.data.completedRounds ?? 0,
              message: event.data.message ?? "AIが対局を進めています…",
              processedPlans: event.data.processedPlans,
              totalPlans: event.data.totalPlans,
              explorationPercent: event.data.explorationPercent
            });
            return;
          }
          if (event.data.type === "round_complete") {
            if (!event.data.game || !event.data.frames) {
              reject(new Error("AIリプレイのラウンド生成結果が不正です。"));
              return;
            }
            streamReplayFrames(event.data.game, event.data.frames);
            return;
          }
          if (event.data.error || !event.data.game || !event.data.frames) {
            reject(new Error(event.data.error ?? "AIリプレイの生成結果が不正です。"));
            return;
          }
          resolve({ game: event.data.game, frames: event.data.frames });
        });
        worker.addEventListener("error", () => reject(new Error("AIリプレイのバックグラウンド生成に失敗しました。")), { once: true });
        worker.postMessage({ roleId: selectedRoleId, seed: normalizedSeed, level: selectedAiLevel });
      }).finally(() => worker.terminate());

      streamReplayFrames(aiGame, frames);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AIリプレイを生成できませんでした。");
    } finally {
      setIsGeneratingSoloAiReplay(false);
      setSoloAiReplayProgress(null);
    }
  };

  const actionFocusCard = currentResolutionCard ?? dolphinDuplicateSourceCard ?? null;
  const actionFocusDefinition = actionFocusCard ? cardMap[actionFocusCard.definitionId] : null;
  const awaitingTargetInstanceId = !isReadOnlyBattle && !battleFeedback.activeInstanceId &&
    (currentResolutionOperations.length > 0 || currentTokenPlacementRequirement) ? currentResolutionCard?.instanceId : null;

  const renderFieldCard = (card: CardInstance, options?: { isDragOriginPlaceholder?: boolean }) => (
    <div
      key={card.instanceId}
      className={`card-chip ${options?.isDragOriginPlaceholder ? "is-drag-origin-placeholder" : ""} ${card.isInvalidated ? "is-invalidated" : ""} ${battleFeedback.activeInstanceId === card.instanceId ? "is-resolving" : ""} ${awaitingTargetInstanceId === card.instanceId ? "is-awaiting-target" : ""} ${
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
      } ${
        game?.phase === "round_end" && !pendingRoundBuffChoice && !pendingDolphinFinalAction
          ? "is-next-action-card"
          : ""
      }`}
      data-attribute={resolveVisualAttribute(card.attribute)}
      data-card-instance-id={card.instanceId}
      data-card-definition-id={card.definitionId}
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
          {battleFeedback.cardFeedback(card.instanceId)}
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

  const confirmMulligan = async () => {
    if (!game) {
      return;
    }

    try {
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("mulligan", { instanceIds: mulliganIds })).game ?? game
        : mulliganIds.length > 0 ? applyMulliganOnly(game, mulliganIds) : game;
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
    window.requestAnimationFrame(() => {
      setCollapsedDragOriginId(instanceId);
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
    const visiblePlacementCards =
      draggedCard.source === "field"
        ? placementBaseCards.filter((card) => card.instanceId !== draggedCard.instanceId)
        : placementBaseCards;
    const lastCard = visiblePlacementCards[visiblePlacementCards.length - 1];
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
    setCollapsedDragOriginId(null);
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
      setCollapsedDragOriginId(null);
      return;
    }

    if (draggedCard.source === "hand" && restrictedTypes.includes(card.type)) {
      setError(`${card.name} cannot be placed by the selected role.`);
      setDraggedCard(null);
      setCollapsedDragOriginId(null);
      return;
    }

    setPreviewFieldOrder((current) => {
      const placedCount = current.filter((instanceId) => player.hand.some((handCardEntry) => handCardEntry.instanceId === instanceId)).length;
      const alreadyPlaced = current.includes(draggedCard.instanceId);
      if (!alreadyPlaced && placedCount >= placementLimit) {
        setError(`You can place at most ${placementLimit} cards this round.`);
        return current;
      }

      const withoutDragged = current.filter((instanceId) => instanceId !== draggedCard.instanceId);
      const next = [...withoutDragged];
      const originalIndex = current.indexOf(draggedCard.instanceId);
      const adjustedDropIndex =
        draggedCard.source === "field" && originalIndex >= 0 && originalIndex < dropIndex ? dropIndex - 1 : dropIndex;
      next.splice(Math.max(0, Math.min(adjustedDropIndex, next.length)), 0, draggedCard.instanceId);
      return next;
    });

    setDraggedCard(null);
    setCollapsedDragOriginId(null);
    setPlacementPreviewIndex(null);
    setError(null);
  };

  const beginResolution = async () => {
    if (!game || !player) {
      return;
    }

    try {
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("start_resolution", { orderedFieldIds: previewFieldOrder })).game ?? game
        : startRoundResolution(game, previewFieldOrder);
      setGame(nextState);
      setInputStep("resolving");
      setCurrentTargets({});
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to start resolution.");
    }
  };

  const confirmCurrentTargetsAndResolve = async () => {
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
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("resolve_next", { targetSelections: nextTargets })).game ?? game
        : resolveNextCard(game, nextTargets);
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

  const handleTokenDropAt = async (dropIndex: number) => {
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
        const targetSelections = {
          ...currentTargets,
          [currentTokenPlacementRequirement.selectionKey]: JSON.stringify(nextOrder)
        };
        const nextState = isMultiBattle
          ? (await applyRemoteMatchAction("resolve_next", { targetSelections })).game ?? game
          : resolveNextCard(game, targetSelections);
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

  const handleDolphinDuplicateDropAt = async (dropIndex: number) => {
    if (!draggedDolphinDuplicateId || !game || !dolphinDuplicateSourceId) {
      return;
    }

    try {
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("resolve_final", {
            sourceInstanceId: dolphinDuplicateSourceId,
            insertIndex: dropIndex
          })).game ?? game
        : resolvePendingFinalAction(game, dolphinDuplicateSourceId, dropIndex);
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

  const submitRoundEnd = async () => {
    if (!game) {
      return;
    }

    try {
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("finalize_round", { discardIds: roundEndDiscardIds })).game ?? game
        : finalizeRound(game, roundEndDiscardIds);
      setGame(nextState);
      setRoundEndDiscardIds([]);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to finalize round.");
    }
  };

  const handleRoundBuffReroll = async () => {
    if (!game || isRoundBuffSubmitting) {
      return;
    }

    setIsRoundBuffSubmitting(true);
    try {
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("reroll_buff")).game ?? game
        : rerollRoundBuffChoice(game);
      setGame(nextState);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to reroll round buff.");
    } finally {
      setIsRoundBuffSubmitting(false);
    }
  };

  const handleRoundBuffSelect = async (optionIndex: number) => {
    if (!game || isRoundBuffSubmitting) {
      return;
    }

    setIsRoundBuffSubmitting(true);
    try {
      const nextState = isMultiBattle
        ? (await applyRemoteMatchAction("choose_buff", { optionIndex })).game ?? game
        : chooseRoundBuff(game, optionIndex);
      setGame(nextState);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to select round buff.");
    } finally {
      setIsRoundBuffSubmitting(false);
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
    setMultiViewPlayerId(multiPlayerId);
    setMultiLobbyEntryId(nextLobbyId);
    navigateToScreen("multi_lobby", { lobbyId: nextLobbyId });
  };

  const joinExistingMultiLobby = () => {
    const nextLobbyId = sanitizeRouteToken(multiLobbyEntryId, createDefaultLobbyId());
    setGame(null);
    setMultiConnectionError(null);
    setMultiViewPlayerId(multiPlayerId);
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

  const openReplayCode = async (rawCode: string) => {
    const code = sanitizeReplayCode(rawCode);
    if (!code) {
      setError("リプレイコードを入力してください。");
      return;
    }
    try {
      const localEntry = soloRankings.find((entry) => entry.replayCode === code && entry.replayGame);
      const loadedReplay: ReplayRecord = localEntry
        ? {
            code,
            roomId: "solo",
            seed: localEntry.seed,
            playerId: localEntry.replayGame!.players[0]?.playerId ?? "solo",
            displayName: localEntry.roleName,
            completedAt: localEntry.completedAt,
            game: localEntry.replayGame!,
            frames: localEntry.replayFrames ?? [localEntry.replayGame!]
          }
        : await fetchReplay(code);
      const frames = buildRemoteReplayFrames(loadedReplay);
      const replay: PreparedReplay = {
        ...loadedReplay,
        frames,
        game: frames.at(-1) ?? loadedReplay.game ?? (() => { throw new Error("リプレイデータが空です。"); })()
      };
      setReplayCodeInput(code);
      setActiveReplay(replay);
      setReplayFrameIndex(0);
      replayUserPausedRef.current = true;
      setIsReplayPlaying(false);
      lastProcessedReplayIndexRef.current = 0;
      lastProcessedLogIndexRef.current = 0;
      replayQueueRef.current = [];
      replayProcessingRef.current = false;
      if (replayStepTimeoutRef.current !== null) {
        window.clearTimeout(replayStepTimeoutRef.current);
        replayStepTimeoutRef.current = null;
      }
      setGame(replay.frames[0] ?? replay.game);
      setError(null);
      navigateToScreen("replay", { replayCode: code });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "リプレイを読み込めませんでした。");
    }
  };

  const retainActiveReplay = async () => {
    if (!activeReplay || activeReplay.roomId === "solo") return;
    try {
      const saved = await saveReplay(activeReplay.code);
      setActiveReplay((current) => current ? { ...current, ...saved } : current);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "リプレイを保存できませんでした。");
    }
  };

  const switchMultiView = async (playerId: string) => {
    try {
      const privateState = await fetchRoomState(lobbyId, multiPlayerId, playerId);
      setMultiViewPlayerId(privateState.viewingPlayerId ?? playerId);
      setMultiRoomState(privateState);
      if (privateState.game) setGame(privateState.game);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "観戦画面を開けませんでした。");
    }
  };

  useEffect(() => {
    if (appScreen !== "replay" || initialReplayLoadedRef.current || activeReplay) return;
    const routeCode = typeof window === "undefined" ? "" : sanitizeReplayCode(window.location.pathname.split("/")[2]);
    if (!routeCode) return;
    initialReplayLoadedRef.current = true;
    void openReplayCode(routeCode);
  }, [activeReplay, appScreen]);

  useEffect(() => {
    if (!isReplayPlaying || !activeReplay) return;
    if (replayFrameIndex >= activeReplay.frames.length - 1) {
      setIsReplayPlaying(false);
      return;
    }
    const currentFrame = activeReplay.frames[replayFrameIndex] ?? activeReplay.game;
    const advance = () => {
      if (replayProcessingRef.current) {
        timeoutId = window.setTimeout(advance, 32);
        return;
      }
      const nextIndex = replayFrameIndex + 1;
      setReplayFrameIndex(nextIndex);
      setGame(activeReplay.frames[nextIndex] ?? activeReplay.game);
    };
    const nextFrame = activeReplay.frames[replayFrameIndex + 1] ?? activeReplay.game;
    const delay = isSilentReplayStep(currentFrame, nextFrame) ? 0 : getActivationCadenceDelayMs(getReplayRoundActivationCount(currentFrame));
    let timeoutId = window.setTimeout(advance, delay);
    return () => window.clearTimeout(timeoutId);
  }, [activeReplay, isReplayPlaying, replayFrameIndex]);

  const showReplayFrame = (nextIndex: number) => {
    if (!activeReplay) return;
    const clampedIndex = Math.max(0, Math.min(activeReplay.frames.length - 1, nextIndex));
    replayUserPausedRef.current = true;
    setIsReplayPlaying(false);
    const targetFrame = activeReplay.frames[clampedIndex] ?? activeReplay.game;
    const isSingleStep = clampedIndex === replayFrameIndex + 1;
    const countFrame = isSingleStep ? activeReplay.frames[replayFrameIndex] ?? targetFrame : targetFrame;
    const activationCount = getReplayRoundActivationCount(countFrame);
    const scoreFrame = isSingleStep ? activeReplay.frames[replayFrameIndex] ?? targetFrame : targetFrame;
    const nextScore = { scoreThisRound: scoreFrame.players[0].scoreThisRound, totalScore: scoreFrame.players[0].totalScore };
    battleFeedback.reset(activationCount, nextScore);
    queuedScoreRef.current = nextScore;
    activationToneCountRef.current = activationCount;
    if (replayStepTimeoutRef.current !== null) {
      window.clearTimeout(replayStepTimeoutRef.current);
      replayStepTimeoutRef.current = null;
    }
    replayQueueRef.current = [];
    replayProcessingRef.current = false;
    setParticleBursts([]);
    setFloatingTexts([]);
    setCardMotionOverlays([]);
    if (clampedIndex !== replayFrameIndex + 1) {
      lastProcessedReplayIndexRef.current = targetFrame.replayEvents.length;
      lastProcessedLogIndexRef.current = targetFrame.log.length;
      replayQueueRef.current = [];
    }
    setReplayFrameIndex(clampedIndex);
    setGame(activeReplay.frames[clampedIndex] ?? activeReplay.game);
  };

  const toggleReplayPlayback = () => {
    setIsReplayPlaying((current) => {
      const next = !current;
      replayUserPausedRef.current = !next;
      return next;
    });
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

  const startMultiMatch = async () => {
    try {
      setMultiViewPlayerId(multiPlayerId);
      const nextState = await startRoomMatch(lobbyId, multiPlayerId);
      setMultiRoomState(nextState);
      navigateToScreen("multi_match", { lobbyId });
    } catch (caught) {
      setMultiConnectionError(caught instanceof Error ? caught.message : "マッチ開始に失敗しました。");
    }
  };

  const addLobbyAi = async () => {
    try {
      const nextState = await addRoomAi(lobbyId, multiPlayerId, selectedAiLevel, selectedAiRoleId);
      setMultiRoomState(nextState);
      setMultiConnectionError(null);
    } catch (caught) {
      setMultiConnectionError(caught instanceof Error ? caught.message : "AIの追加に失敗しました。");
    }
  };

  const returnFinishedMatchToLobby = async () => {
    try {
      const nextState = await returnRoomToLobby(lobbyId, multiPlayerId);
      setMultiRoomState(nextState);
      setGame(null);
      navigateToScreen("multi_lobby", { lobbyId, replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ロビーに戻れませんでした。");
    }
  };

  const handleHorizontalCardWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const canScrollLeft = event.deltaY < 0 && row.scrollLeft > 0;
    const canScrollRight = event.deltaY > 0 && row.scrollLeft < row.scrollWidth - row.clientWidth - 1;
    if (!canScrollLeft && !canScrollRight) return;
    event.preventDefault();
    row.scrollLeft += event.deltaY;
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

  const currentTask = (() => {
    if (!game || !player) return null;
    if (isReplayBattle) {
      return { key: "replay", text: `リプレイ：${activeReplay?.displayName ?? "プレイヤー"}`, ready: false, action: null } as const;
    }
    if (isSpectatingMultiPlayer) {
      const viewedPlayer = multiPlayers.find((entry) => entry.playerId === multiViewPlayerId);
      return { key: "spectating", text: `${viewedPlayer?.displayName ?? "プレイヤー"}を観戦中`, ready: false, action: null } as const;
    }
    if (game.phase === "finished" && isMultiBattle && isMultiHost && isMultiMatchFinished) {
      return { key: "finished-lobby", text: "対戦終了　クリックして全員でロビーに戻る", ready: true, action: "lobby" } as const;
    }
    if (game.phase === "finished" && isMultiBattle && !isMultiMatchFinished) {
      return { key: "finished-wait", text: "対戦終了　ほかのプレイヤーを待っています", ready: false, action: null } as const;
    }
    if (game.phase === "finished") return { key: "finished", text: "5ラウンド終了。最終得点を確認してください", ready: false, action: null } as const;
    if (pendingRoundBuffChoice) return { key: "buff", text: "ラウンド強化を1つ選んでください", ready: false, action: null } as const;
    if (pendingDolphinFinalAction) {
      return dolphinDuplicateSourceCard
        ? { key: "dolphin-place", text: "複製カードを場へ配置してください", ready: false, action: null } as const
        : { key: "dolphin-source", text: "複製するカードを場から選んでください", ready: false, action: null } as const;
    }
    if (game.phase === "round_end") {
      const required = Math.min(2, player.field.length);
      return roundEndDiscardIds.length === required
        ? { key: "round-discard-ready", text: "選択完了　クリックしてラウンド終了", ready: true, action: "round-end" } as const
        : { key: "round-discard", text: `場から捨てるカードを選んでください　${roundEndDiscardIds.length} / ${required}`, ready: false, action: null } as const;
    }
    if (inputStep === "mulligan") return { key: "mulligan", text: `交換する手札を選択　${mulliganIds.length}枚選択中　クリックして配置へ`, ready: true, action: "mulligan" } as const;
    if (inputStep === "placement") return { key: "placement", text: "配置と発動順を確認　クリックして発動開始", ready: true, action: "resolution" } as const;
    if (currentTokenPlacementRequirement) return { key: "token", text: `${currentTokenPlacementRequirement.tokenName}を場へ配置してください`, ready: false, action: null } as const;
    if (activeTargetOperation) {
      const completed = currentResolutionOperations.filter((operation) => Boolean(currentTargets[operation.key])).length;
      return { key: `target-${currentResolutionCard?.instanceId ?? "card"}`, text: `${activeTargetOperation.label}を選んでください　${completed} / ${currentResolutionOperations.length}`, ready: false, action: null } as const;
    }
    if (currentResolutionOperations.length > 0) return { key: "targets-ready", text: "対象選択完了　クリックして効果を解決", ready: true, action: "targets" } as const;
    return null;
  })();
  const currentTaskText = currentTask?.text ?? null;
  const requiredRoundEndDiscards = Math.min(2, player?.field.length ?? 0);
  const isRoundEndSelectionReady =
    game?.phase === "round_end" &&
    !pendingRoundBuffChoice &&
    !pendingDolphinFinalAction &&
    roundEndDiscardIds.length === requiredRoundEndDiscards;
  const areResolutionTargetsReady =
    inputStep === "resolving" &&
    currentResolutionOperations.length > 0 &&
    currentResolutionOperations.every((operation) => Boolean(currentTargets[operation.key]));
  const shouldHighlightField = Boolean(
    game &&
      ((game.phase === "input" && inputStep === "placement") ||
        activeTargetOperation ||
        currentTokenPlacementRequirement ||
        pendingDolphinFinalAction ||
        (game.phase === "round_end" && !pendingRoundBuffChoice && !isRoundEndSelectionReady))
  );
  const shouldHighlightHand = game?.phase === "input" && (inputStep === "mulligan" || inputStep === "placement");

  const runCurrentTaskAction = () => {
    switch (currentTask?.action) {
      case "mulligan": void confirmMulligan(); break;
      case "resolution": void beginResolution(); break;
      case "targets": void confirmCurrentTargetsAndResolve(); break;
      case "round-end": void submitRoundEnd(); break;
      case "lobby": void returnFinishedMatchToLobby(); break;
    }
  };

  return (
    <div className="app-shell" data-screen={appScreen}>
      {appScreen !== "solo_battle" && appScreen !== "multi_match" && appScreen !== "replay" ? (
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
              aria-label="ラウンドバフ一覧"
              aria-expanded={isRoundBuffCatalogOpen}
              onClick={() => setIsRoundBuffCatalogOpen(true)}
            >
              {renderUtilityIcon("round-buffs")}
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
                <span className="role-card-badge">オンライン</span>
              </div>
              <p>ルームを作成し、フレンドやAIと5ラウンド対戦を遊べます。</p>
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
              <p>招待されたルームIDを入力して、進行中のロビーへ参加します。</p>
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
        <section className="panel intro-panel solo-setup-panel">
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
            <div className="role-card-grid" onWheel={handleHorizontalCardWheel}>
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
          <div className="solo-start-actions">
            <button className="primary-button" onClick={startGame} disabled={isGeneratingSoloAiReplay}>
              ゲーム開始
            </button>
            <section className="solo-ai-replay-panel">
              <div>
                <strong>AIのプレイを観戦</strong>
                <p>選択中の役職とシードで5ラウンドを自動プレイし、リプレイとして再生します。</p>
              </div>
              <div className="solo-ai-replay-controls">
                <label>
                  <span>AI難易度</span>
                  <select value={selectedAiLevel} onChange={(event) => setSelectedAiLevel(event.target.value as AiLevel)} disabled={isGeneratingSoloAiReplay}>
                    {(Object.keys(aiLevelLabels) as AiLevel[]).map((level) => (
                      <option key={level} value={level}>{aiLevelLabels[level]}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-button" onClick={() => void watchSoloAiReplay()} disabled={isGeneratingSoloAiReplay}>
                  {isGeneratingSoloAiReplay ? "AIが対局を生成中…" : "AIプレイを観戦"}
                </button>
              </div>
              {isGeneratingSoloAiReplay && soloAiReplayProgress ? (
                <div className="solo-ai-replay-progress" role="status" aria-live="polite">
                  <div className="solo-ai-replay-progress-heading">
                    <strong>{soloAiReplayProgress.message}</strong>
                    <span>{soloAiReplayProgress.completedRounds} / 5 ラウンド完了</span>
                  </div>
                  <div className="solo-ai-replay-progress-track" aria-label="AI対局生成の進捗" aria-valuemin={0} aria-valuemax={5} aria-valuenow={soloAiReplayProgress.completedRounds} role="progressbar">
                    <span style={{ width: `${(soloAiReplayProgress.completedRounds / 5) * 100}%` }} />
                  </div>
                  <small>現在：第{Math.min(soloAiReplayProgress.round, 5)}ラウンド</small>
                  {typeof soloAiReplayProgress.explorationPercent === "number" ? (
                    <>
                      <div className="solo-ai-replay-progress-heading solo-ai-exploration-heading">
                        <span>ラウンド内の配置探索</span>
                        <strong>{soloAiReplayProgress.explorationPercent.toFixed(1)}%</strong>
                      </div>
                      <div className="solo-ai-replay-progress-track is-exploration" role="progressbar" aria-label="現在ラウンドの配置探索率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={soloAiReplayProgress.explorationPercent}>
                        <span style={{ width: `${soloAiReplayProgress.explorationPercent}%` }} />
                      </div>
                      <small>{formatDisplayNumber(soloAiReplayProgress.processedPlans ?? 0)} / {formatDisplayNumber(soloAiReplayProgress.totalPlans ?? 0)} 候補を調査</small>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      ) : appScreen === "multi_lobby" ? (
        <section className="panel intro-panel multi-lobby-shell">
          <div className="multi-lobby-hero">
            <div>
              <p className="selected-role-eyebrow">オンライン対戦</p>
              <h2>ルーム {lobbyId}</h2>
              <div className="selected-role-tags">
                <span className={multiConnectionState === "connected" ? "is-online" : ""}>
                  {multiConnectionState === "connected" ? "接続済み" : "再接続中"}
                </span>
                <span>{isMultiHost ? "あなたがホスト" : "ゲスト参加"}</span>
                <span>{multiPlayers.length}人参加</span>
              </div>
            </div>
            <div className="multi-lobby-hero-actions">
              <button type="button" className="secondary-button" onClick={() => void copyMultiInviteUrl()}>招待リンクをコピー</button>
              <button type="button" className="secondary-button" onClick={leaveCurrentRoom}>退出</button>
            </div>
          </div>
          <section className="multi-lobby-settings" aria-label="ルーム設定">
            <div>
              <p className="selected-role-eyebrow">ルーム設定</p>
              <strong>対戦シード</strong>
            </div>
            <label className="solo-seed-input">
              <span>全プレイヤー共通</span>
              <input
                type="text"
                value={sharedMultiSeed}
                disabled={!isMultiHost}
                onChange={(event) => setMultiSeed(sanitizeRouteToken(event.target.value, createDefaultSoloSeed()))}
                onBlur={() => {
                  if (isMultiHost) void updateMultiLobbyDetails({ seed: sanitizeRouteToken(multiSeed, createDefaultSoloSeed()) });
                }}
              />
            </label>
            {isMultiHost ? <button type="button" className="secondary-button" onClick={() => { const nextSeed = createDefaultSoloSeed(); setMultiSeed(nextSeed); void updateMultiLobbyDetails({ seed: nextSeed }); }}>新しく生成</button> : null}
          </section>
          <div className="multi-lobby-content">
            <section className="selected-role-panel multi-room-panel">
              <div className="selected-role-panel-top"><div><p className="selected-role-eyebrow">役職選択</p><h3>使用する役職を選択</h3></div></div>
              <div className="multi-role-grid">
                {sampleRoles.map((role) => {
                  const isSelected = currentMultiPlayer?.roleId === role.id;
                  return <button key={role.id} type="button" className={`multi-role-card${isSelected ? " is-selected" : ""}`} onClick={() => { setSelectedRoleId(role.id); void updateMultiLobbyDetails({ roleId: role.id, ready: false }); }}>
                    <strong>{role.name}</strong>
                    <span>攻撃 {role.initialBaseAttack} ・ 魔法 {role.initialBaseMagic}</span>
                    <small>{role.description}</small>
                  </button>;
                })}
              </div>
              <button type="button" className={currentMultiPlayer?.ready ? "secondary-button lobby-ready-button" : "primary-button lobby-ready-button"} disabled={!currentMultiPlayer?.roleId} onClick={() => void updateMultiLobbyDetails({ ready: !currentMultiPlayer?.ready })}>
                {currentMultiPlayer?.ready ? "準備を取り消す" : "この役職で準備完了"}
              </button>
            </section>
            <aside className="selected-role-panel multi-lobby-player-panel">
              <div className="selected-role-panel-top"><div><p className="selected-role-eyebrow">参加者</p><h3>対戦メンバー</h3></div><span className="role-card-badge">{multiPlayers.length} / 8</span></div>
              <div className="multi-player-list">
                {multiPlayers.map((entry) => <div key={entry.playerId} className={`multi-player-row${entry.playerId === multiPlayerId ? " is-self" : ""}`}>
                  <div className="multi-player-row-main"><strong>{renderMultiPlayerName(entry.displayName)}{entry.playerId === multiPlayerId ? "（あなた）" : ""}</strong><div className="multi-player-row-tags">
                    {entry.playerId === multiRoomState?.hostPlayerId ? <span>ホスト</span> : null}
                    {entry.isAi ? <span>AI・{aiLevelLabels[entry.aiLevel ?? "normal"]}</span> : null}
                    <span>{entry.roleId ? roleMap[entry.roleId]?.name : "役職未選択"}</span><span>{entry.ready ? "準備完了" : "準備待ち"}</span>
                  </div></div>
                  {isMultiHost && entry.isAi ? <button type="button" className="text-button" onClick={() => void leaveRoom(lobbyId, entry.playerId).then(setMultiRoomState)}>削除</button> : null}
                </div>)}
              </div>
              {isMultiHost ? <div className="multi-ai-panel"><strong>AIプレイヤーを追加</strong><div className="multi-ai-controls">
                <select aria-label="AI難易度" value={selectedAiLevel} onChange={(event) => setSelectedAiLevel(event.target.value as AiLevel)}>{(Object.keys(aiLevelLabels) as AiLevel[]).map((level) => <option key={level} value={level}>{aiLevelLabels[level]}</option>)}</select>
                <select aria-label="AIの役職" value={selectedAiRoleId} onChange={(event) => setSelectedAiRoleId(event.target.value)}>{sampleRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                <button type="button" className="secondary-button" onClick={() => void addLobbyAi()}>AIを追加</button>
              </div></div> : null}
              {multiConnectionError ? <p className="error-text">{multiConnectionError}</p> : null}
              <button type="button" className="primary-button lobby-start-button" disabled={!canStartMultiMatch} onClick={startMultiMatch}>5ラウンド対戦を開始</button>
              <p className="selected-role-description">{isMultiHost ? (canStartMultiMatch ? "全員の準備が整いました。" : "2人以上で役職を選び、全員が準備完了すると開始できます。") : "準備完了後、ホストの開始をお待ちください。"}</p>
            </aside>
          </div>
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
              <h3>{renderMultiPlayerName(currentMultiPlayer?.displayName ?? "")}</h3>
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
                      <strong>{renderMultiPlayerName(entry.displayName)}</strong>
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
                      <strong>{renderMultiPlayerName(entry.displayName)}</strong>
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
              <button type="button" className="primary-button" onClick={startMultiMatch}>
              /match/{lobbyId} を開く
            </button>
          </section>
        </section>
      ) : false && appScreen === "multi_match" ? (
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
        <section className="panel intro-panel ranking-shell">
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
            <div className="replay-code-form">
              <input
                value={replayCodeInput}
                onChange={(event) => setReplayCodeInput(sanitizeReplayCode(event.target.value))}
                placeholder="リプレイコードを入力"
                aria-label="リプレイコード"
              />
              <button type="button" className="primary-button" onClick={() => void openReplayCode(replayCodeInput)}>
                リプレイを見る
              </button>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
            {soloRankings.length > 0 ? (
              <div className="ranking-list">
                {soloRankings.map((entry, index) => (
                  <div key={entry.gameId} className="ranking-row">
                    <strong>#{index + 1}</strong>
                    <span>{entry.roleName}</span>
                    <span>seed: {entry.seed}</span>
                    <span>{formatDisplayNumber(entry.totalScore)}</span>
                    {entry.replayCode && entry.replayGame ? (
                      <button type="button" className="secondary-button" onClick={() => void openReplayCode(entry.replayCode!)}>
                        リプレイ
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="selected-role-description">まだ記録がありません。</p>
            )}
          </section>
        </section>
      ) : (appScreen === "solo_battle" || appScreen === "multi_match" || appScreen === "replay") && game ? (
        <main className="battle-stage">
          <div ref={battleFrameRef} className={`battle-frame${isReadOnlyBattle ? " is-read-only" : ""}`}>
            {currentTaskText && !isReadOnlyBattle ? (
              <button
                type="button"
                className={`battle-task-guide${currentTask?.action ? " is-actionable" : ""}${currentTask?.ready ? " is-ready" : ""}`}
                aria-live="polite"
                disabled={!currentTask?.action}
                onClick={runCurrentTaskAction}
              >
                <span>次の操作</span>
                <strong>{currentTaskText}</strong>
                {currentTask?.action ? <span className="battle-task-guide-arrow" aria-hidden="true">›</span> : null}
              </button>
            ) : null}
            {error ? <p className="battle-task-error error-text" role="alert">{error}</p> : null}
            <div className="battle-top-row">
              <section className="panel status-panel" ref={statusPanelRef}>
                <div className="status-hero">
                  <div className="status-hero-top">
                    <div className="status-hero-player">
                      <h2>{player ? renderMultiPlayerName(player.displayName) : ""}</h2>
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
                              <button
                                type="button"
                                className={`round-buff-icon${roundBuffImageMap[buff.iconAsset ?? buff.id] ? " has-image" : " no-image"}`}
                                aria-label={`${buff.name}の効果を確認`}
                                onClick={() => setIsRoundBuffListOpen(true)}
                              >
                                {roundBuffImageMap[buff.iconAsset ?? buff.id] ? (
                                  <img src={roundBuffImageMap[buff.iconAsset ?? buff.id]} alt="" />
                                ) : (
                                  <><strong>Noimage</strong><small>{buff.name}</small></>
                                )}
                              </button>
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
                            aria-label="ラウンドバフ一覧"
                            aria-expanded={isRoundBuffCatalogOpen}
                            onClick={() => setIsRoundBuffCatalogOpen(true)}
                          >
                            {renderUtilityIcon("round-buffs")}
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
                  <div className="status-stat-attack" ref={(element) => setStatusBlockRef("baseAttack", element)}>
                    <span>基礎攻撃</span>
                    <strong>{player ? formatDisplayNumber(player.baseAttack) : "-"}</strong>
                  </div>
                  <div className="status-stat-magic" ref={(element) => setStatusBlockRef("baseMagic", element)}>
                    <span>基礎魔法</span>
                    <strong>{player ? formatDisplayNumber(player.baseMagic) : "-"}</strong>
                  </div>
                  <div className="status-score" ref={(element) => setStatusBlockRef("scoreThisRound", element)}>
                    <span>ラウンド得点</span>
                    <AnimatedScore key={`round-${battleFeedback.scoreEpoch}`} value={battleFeedback.score.scoreThisRound} format={formatDisplayNumber} />
                  </div>
                  <div className="status-stat-attack" ref={(element) => setStatusBlockRef("tempAttack", element)}>
                    <span>一時攻撃</span>
                    <strong>{player ? formatDisplayNumber(player.tempAttack) : "-"}</strong>
                  </div>
                  <div className="status-stat-magic" ref={(element) => setStatusBlockRef("tempMagic", element)}>
                    <span>一時魔法</span>
                    <strong>{player ? formatDisplayNumber(player.tempMagic) : "-"}</strong>
                  </div>
                  <div className="status-score status-score-total" ref={(element) => setStatusBlockRef("totalScore", element)}>
                    <span>合計得点</span>
                    <AnimatedScore key={`total-${battleFeedback.scoreEpoch}`} value={battleFeedback.score.totalScore} format={formatDisplayNumber} />
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

              <section className="panel action-panel action-panel-compact" hidden aria-hidden="true">
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
                          <button className={`primary-button${areResolutionTargetsReady ? " is-next-action-ready" : ""}`} onClick={confirmCurrentTargetsAndResolve}>
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
                      className={`primary-button${isRoundEndSelectionReady ? " is-next-action-ready" : ""}`}
                      disabled={roundEndDiscardIds.length !== Math.min(2, player?.field.length ?? 0)}
                      onClick={submitRoundEnd}
                    >
                      ラウンド終了を確定
                    </button>
                  </>
                ) : null}

                {game.phase === "finished" ? (
                  <div className="action-copy">
                    <strong>5ラウンド終了</strong>
                    <p>合計得点を確認してください。</p>
                    {isMultiBattle && isMultiHost && isMultiMatchFinished ? <button type="button" className="primary-button" onClick={() => void returnFinishedMatchToLobby()}>全員でロビーに戻る</button> : null}
                    {isMultiBattle && !isMultiHost && isMultiMatchFinished ? <p className="action-copy-sub">ホストがロビーへ戻すのを待っています。</p> : null}
                    {isMultiBattle && !isMultiMatchFinished ? <p className="action-copy-sub">ほかのプレイヤーの終了を待っています。</p> : null}
                  </div>
                ) : null}

                {error ? <p className="error-text">{error}</p> : null}
              </section>
            </div>

            <section
              className={`panel field-panel${shouldHighlightField ? " is-next-action-target" : ""}`}
              onClickCapture={isReadOnlyBattle ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
              onDragStartCapture={isReadOnlyBattle ? (event) => event.preventDefault() : undefined}
            >
              <div className="battle-row-heading"><h2>場</h2></div>
              {battleFeedback.overlay}
              <div
                className={`horizontal-card-row ${inputStep === "placement" ? "is-placement-row" : ""}`}
                onWheel={handleHorizontalCardWheel}
                ref={inputStep === "placement" ? placementRowRef : fieldRowRef}
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
                            collapsedDragOriginId === card.instanceId && draggedCard?.source === "field" ? "is-drag-origin-empty" : ""
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
                            setCollapsedDragOriginId(null);
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

                    const renderedFieldCards = [...player.field.map((card) => renderFieldCard(card))];
                    destroySpacerIndexes.forEach((fieldIndex, spacerIndex) => {
                      const insertIndex = Math.max(0, Math.min(fieldIndex, renderedFieldCards.length));
                      renderedFieldCards.splice(
                        insertIndex,
                        0,
                        <div
                          key={`destroy_spacer_${fieldIndex}_${spacerIndex}`}
                          className="card-chip destroy-motion-spacer"
                          aria-hidden="true"
                        />
                      );
                    });

                    return [
                      connectedFieldOverlays.length > 0 ? (
                        <div key="connection-layer" className="field-connection-layer" aria-hidden="true">
                          {connectedFieldOverlays.map((overlay) => (
                            <div
                              key={overlay.key}
                              className="field-connection-overlay"
                              data-attribute={resolveVisualAttribute(overlay.attribute)}
                              data-mode={overlay.mode}
                              style={
                                {
                                  left: `${overlay.left}px`,
                                  top: `${overlay.top}px`,
                                  width: `${overlay.width}px`,
                                  height: `${overlay.height}px`
                                } as CSSProperties
                              }
                            >
                              {Array.from({ length: overlay.particleCount }, (_, particleIndex) => (
                                <span
                                  key={`${overlay.key}_particle_${particleIndex}`}
                                  className="field-connection-particle"
                                  style={
                                    {
                                      "--particle-delay": `${particleIndex * 0.1}s`,
                                      "--particle-duration": `${overlay.mode === "enchanted" ? 2.6 : 3.1}s`
                                    } as CSSProperties
                                  }
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : null,
                      ...renderedFieldCards
                    ];
                  })()
                ) : null}
              </div>
            </section>
            <section
              className={`panel hand-panel${shouldHighlightHand ? " is-next-action-target" : ""}`}
              onClickCapture={isReadOnlyBattle ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
              onDragStartCapture={isReadOnlyBattle ? (event) => event.preventDefault() : undefined}
            >
              <div className="battle-row-heading"><h2>手札</h2><span>{visibleHandCards.length}枚</span></div>
              <div
                className={`horizontal-card-row ${canReturnPlacedCardToHand(player?.hand, draggedCard) ? "is-hand-return-target" : ""}`}
                onWheel={handleHorizontalCardWheel}
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
                        setCollapsedDragOriginId(null);
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
            {isReplayBattle ? (
              <>
                <aside className="match-edge-drawer match-edge-drawer-log" aria-label="リプレイログ">
                  <div className="match-edge-drawer-handle">ログ</div>
                  <section className="panel match-edge-drawer-panel">
                    <h2>ログ</h2>
                    <div className="match-edge-drawer-scroll">
                      {logGroups.map((group) => (
                        <div key={group.key} className={`log-group log-group-${group.kind}${group.cardType ? ` log-group-card-${group.cardType}` : ""}`}>
                          {renderLogGroupLabel(group)}
                          <div className="log-group-entries">{group.entries.map((entry) => <div key={entry.id} className={getLogEntryClassName(entry, group)}><p>{trimGroupedLogMessage(entry.message, group.title)}</p></div>)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </aside>
                <aside className="match-edge-drawer match-edge-drawer-replay" aria-label="リプレイメニュー">
                  <div className="match-edge-drawer-handle">リプレイ</div>
                  <section className="panel match-edge-drawer-panel replay-edge-panel">
                    <div className="replay-edge-heading">
                      <div>
                        <h2>リプレイ</h2>
                        <small>{replayFrameIndex + 1} / {activeReplay?.frames.length ?? 1}</small>
                      </div>
                      <div className="replay-edge-score">
                        <span>ラウンド得点 <strong>{formatDisplayNumber(replayTimeline[replayFrameIndex]?.scoreThisRound ?? 0)}</strong></span>
                        <span>合計得点 <strong>{formatDisplayNumber(replayTimeline[replayFrameIndex]?.totalScore ?? 0)}</strong></span>
                      </div>
                    </div>
                    <div className="replay-viewer-controls replay-edge-controls">
                      <button type="button" className="secondary-button" onClick={() => showReplayFrame(replayFrameIndex - 1)} disabled={replayFrameIndex <= 0}>前へ</button>
                      <button type="button" className="primary-button" onClick={toggleReplayPlayback} disabled={!activeReplay || activeReplay.frames.length <= 1}>{isReplayPlaying ? "一時停止" : "再生"}</button>
                      <button type="button" className="secondary-button" onClick={() => showReplayFrame(replayFrameIndex + 1)} disabled={!activeReplay || replayFrameIndex >= activeReplay.frames.length - 1}>次へ</button>
                    </div>
                    {isGeneratingSoloAiReplay && soloAiReplayProgress ? (
                      <div className="replay-edge-generation">
                        <strong>{soloAiReplayProgress.message}</strong>
                        <span>{soloAiReplayProgress.completedRounds} / 5 完了{typeof soloAiReplayProgress.explorationPercent === "number" ? `・探索 ${soloAiReplayProgress.explorationPercent.toFixed(1)}%` : ""}</span>
                      </div>
                    ) : null}
                    <div className="match-edge-drawer-scroll replay-timeline-scroll">
                      {replayTimeline.map((entry, index) => (
                        <Fragment key={`${entry.round}-${entry.index}`}>
                          {index === 0 || replayTimeline[index - 1]?.round !== entry.round ? (
                            <button type="button" className="replay-round-start" onClick={() => showReplayFrame(entry.index)}>
                              <strong>第{entry.round}ラウンド</strong>
                              <span>開始位置 {formatReplayTimestamp(entry.elapsedSeconds)}</span>
                            </button>
                          ) : null}
                          <button type="button" className={`replay-timeline-entry${entry.index === replayFrameIndex ? " is-current" : ""}`} onClick={() => showReplayFrame(entry.index)}>
                            <span className="replay-timeline-time">+{formatReplayTimestamp(entry.roundElapsedSeconds)}</span>
                            <span className="replay-timeline-label">{entry.label}</span>
                            <span className="replay-timeline-score">R {formatDisplayNumber(entry.scoreThisRound)} / 合計 {formatDisplayNumber(entry.totalScore)}</span>
                          </button>
                        </Fragment>
                      ))}
                    </div>
                    <div className="replay-edge-footer">
                      <small className="replay-code-compact">{activeReplay?.code ?? replayCodeInput}</small>
                      {activeReplay && activeReplay.roomId !== "solo" && !activeReplay.rankingProtected ? (
                        <button type="button" className="secondary-button" onClick={() => void retainActiveReplay()}>{activeReplay.savedAt ? "7日延長" : "7日間保存"}</button>
                      ) : null}
                      <button type="button" className="secondary-button" onClick={openRanking}>ランキングへ戻る</button>
                    </div>
                  </section>
                </aside>
              </>
            ) : isMultiBattle ? (
              <>
                <aside className="match-edge-drawer match-edge-drawer-log" aria-label="対戦ログ">
                  <div className="match-edge-drawer-handle">ログ</div>
                  <section className="panel match-edge-drawer-panel">
                    <h2>ログ</h2>
                    <div className="match-edge-drawer-scroll">
                      {logGroups.map((group) => (
                        <div key={group.key} className={`log-group log-group-${group.kind}${group.cardType ? ` log-group-card-${group.cardType}` : ""}`}>
                          {renderLogGroupLabel(group)}
                          <div className="log-group-entries">{group.entries.map((entry) => <div key={entry.id} className={getLogEntryClassName(entry, group)}><p>{trimGroupedLogMessage(entry.message, group.title)}</p></div>)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </aside>
                <aside className="match-edge-drawer match-edge-drawer-player" aria-label="プレイヤー一覧">
                  <div className="match-edge-drawer-handle">プレイヤー</div>
                  <section className="panel match-edge-drawer-panel">
                    <h2>プレイヤー一覧</h2>
                    <div className="match-edge-drawer-scroll">
                      {[...(multiRoomState?.matchPlayers ?? [])].sort((a, b) => b.totalScore - a.totalScore).map((entry, index) => (
                        <article key={entry.playerId} className={`match-player-card${entry.playerId === multiPlayerId ? " is-self" : ""}${entry.playerId === multiViewPlayerId ? " is-viewing" : ""}`}>
                          <div className="match-player-card-top"><strong>{index + 1}位　{entry.displayName}</strong><span>{formatDisplayNumber(entry.totalScore)}点</span></div>
                          <p>第{entry.round}ラウンド・{resolveMatchPhaseLabel(entry.phase)}</p>
                          <p>今回の得点: {formatDisplayNumber(entry.scoreThisRound)}点</p>
                          <button type="button" className="secondary-button match-spectate-button" onClick={() => void switchMultiView(entry.playerId)}>
                            {entry.playerId === multiViewPlayerId ? "表示中" : entry.playerId === multiPlayerId ? "自分へ戻る" : "観戦する"}
                          </button>
                          {entry.replayCode ? (
                            <button type="button" className="secondary-button match-spectate-button" onClick={() => void openReplayCode(entry.replayCode!)}>
                              リプレイ
                            </button>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                </aside>
              </>
            ) : (
              <aside className="log-drawer" aria-label="ターンログ">
                <div className="log-drawer-handle">ログ</div>
                <section className="panel log-panel">
                  <h2>ログ</h2>
                  <div className="log-scroll">{logGroups.map((group) => <div key={group.key} className={`log-group log-group-${group.kind}${group.cardType ? ` log-group-card-${group.cardType}` : ""}`}>{renderLogGroupLabel(group)}<div className="log-group-entries">{group.entries.map((entry) => <div key={entry.id} className={getLogEntryClassName(entry, group)}><p>{trimGroupedLogMessage(entry.message, group.title)}</p></div>)}</div></div>)}</div>
                </section>
              </aside>
            )}
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
                {renderCardTextWithAdjustedNumbers(cardMap[hoveredTooltipDetailDefinitionId]!.text, latestHoveredCard, {
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
                disabled={pendingRoundBuffChoice.rerollUsed || isRoundBuffSubmitting}
                onClick={handleRoundBuffReroll}
              >
                {pendingRoundBuffChoice.rerollUsed ? "このラウンドはリロール済み" : "候補をリロール"}
              </button>
            </div>
            {isRoundBuffSubmitting ? (
              <div className="round-buff-submit-status" role="status" aria-live="polite">
                <span className="round-buff-submit-spinner" aria-hidden="true" />
                選択を反映しています…
              </div>
            ) : null}
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
                    disabled={isRoundBuffSubmitting}
                    onClick={() => handleRoundBuffSelect(index)}
                  >
                    <div className={`round-buff-icon${roundBuffImageMap[buff.iconAsset ?? buff.id] ? " has-image" : " no-image"}`}>
                      {roundBuffImageMap[buff.iconAsset ?? buff.id] ? (
                        <img src={roundBuffImageMap[buff.iconAsset ?? buff.id]} alt="" />
                      ) : (
                        <><strong>Noimage</strong><small>{buff.name}</small></>
                      )}
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

      {isRoundBuffListOpen ? (
        <div className="help-modal-backdrop" onClick={() => setIsRoundBuffListOpen(false)}>
          <div className="help-modal active-round-buff-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header">
              <div>
                <h2>発動中のラウンドバフ</h2>
                <p>現在のプレイヤーに適用されている効果です。</p>
              </div>
              <button type="button" className="help-close-button" onClick={() => setIsRoundBuffListOpen(false)}>
                閉じる
              </button>
            </div>
            <div className="active-round-buff-list">
              {groupedSelectedRoundBuffs.length > 0 ? groupedSelectedRoundBuffs.map((buff) => (
                <article key={buff.id} className="active-round-buff-card">
                  <div className={`round-buff-icon${roundBuffImageMap[buff.iconAsset ?? buff.id] ? " has-image" : " no-image"}`}>
                    {roundBuffImageMap[buff.iconAsset ?? buff.id] ? (
                      <img src={roundBuffImageMap[buff.iconAsset ?? buff.id]} alt="" />
                    ) : (
                      <><strong>Noimage</strong><small>{buff.name}</small></>
                    )}
                  </div>
                  <div>
                    <div className="active-round-buff-card-heading">
                      <strong>{buff.name}</strong>
                      {buff.count > 1 ? <span>×{buff.count}</span> : null}
                    </div>
                    <p>{buff.description}</p>
                  </div>
                </article>
              )) : <p className="selected-role-description">現在発動中のラウンドバフはありません。</p>}
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
                <button type="button" className="secondary-button settings-sound-preview" onClick={() => void playActivationTone("none")}>
                  発動音を試聴
                </button>
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
              <div className="help-block">
                <strong>変動数値</strong>
                <p>カード説明の白い数値は、効果や状態によって変化する可能性がある値です。数値にカーソルを合わせると種類を確認できます。</p>
                <div className="help-value-kind-list">
                  <span><i className="help-value-kind-dot is-normal" />通常数値：カード数値への補正で変動</span>
                  <span><i className="help-value-kind-dot is-probability" />確率数値：確率への補正で変動</span>
                  <span><i className="help-value-kind-dot is-enchant" />エンチャント数値：エンチャントへの補正で変動</span>
                  <span><i className="help-value-kind-dot is-special" />特殊値：原則として変動しない固定値</span>
                </div>
                <p>赤い文字は元の値より増加、青い文字は減少している状態を表します。</p>
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
                    {!card.timings.includes("enchant") ? <span>{resolveAttributeLabel(card.attribute)}</span> : null}
                  </div>
                  {!card.timings.includes("enchant") ? (
                    <div className="catalog-card-meta-row">
                      <span>{resolveCardTypeLabel(card.type)}</span>
                      {card.deckEligible === false ? <span>デッキ外</span> : <span>デッキ入り</span>}
                    </div>
                  ) : null}
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

      {isRoundBuffCatalogOpen ? (
        <div className="help-modal-backdrop" onClick={() => setIsRoundBuffCatalogOpen(false)}>
          <div className="help-modal card-catalog-modal round-buff-catalog-modal" onClick={(event) => event.stopPropagation()}>
            <div className="help-modal-header">
              <div>
                <h2>ラウンドバフ一覧</h2>
                <p>ゲームに登場するラウンドバフと、その効果を確認できます。</p>
              </div>
              <button type="button" className="help-close-button" onClick={() => setIsRoundBuffCatalogOpen(false)}>
                閉じる
              </button>
            </div>
            <div className="catalog-result-row">
              <span>{sampleRoundBuffs.length} 件</span>
            </div>
            <div className="round-buff-catalog-grid">
              {sampleRoundBuffs.map((buff) => {
                const ownedCount = selectedRoundBuffs.filter((selected) => selected.id === buff.id).length;
                return (
                  <article key={buff.id} className={`active-round-buff-card round-buff-catalog-card${ownedCount > 0 ? " is-active" : ""}`}>
                    <div className={`round-buff-icon${roundBuffImageMap[buff.iconAsset ?? buff.id] ? " has-image" : " no-image"}`}>
                      {roundBuffImageMap[buff.iconAsset ?? buff.id] ? (
                        <img src={roundBuffImageMap[buff.iconAsset ?? buff.id]} alt="" />
                      ) : (
                        <><strong>Noimage</strong><small>{buff.name}</small></>
                      )}
                    </div>
                    <div>
                      <div className="active-round-buff-card-heading">
                        <strong>{buff.name}</strong>
                        {ownedCount > 0 ? <span>発動中{ownedCount > 1 ? ` ×${ownedCount}` : ""}</span> : null}
                      </div>
                      <p>{buff.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {battleFeedback.effects}
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
        {cardMotionOverlays.map((overlay) => (
          <div
            key={overlay.id}
            className={`card-motion-overlay motion-${overlay.motion}`}
            data-attribute={resolveVisualAttribute(overlay.attribute)}
            style={{
              left: `${overlay.x}px`,
              top: `${overlay.y}px`,
              width: `${overlay.width}px`,
              height: `${overlay.height}px`
            }}
          >
            {overlay.motion === "destroy" ? (
              <div className="card-motion-overlay-fragment-layer">
                {DESTROY_MOTION_FRAGMENTS.map((fragment, index) => {
                  const backgroundSizeX = 100 / (fragment.width / 100);
                  const backgroundSizeY = 100 / (fragment.height / 100);
                  const backgroundPositionX = fragment.left === 0 ? 0 : (fragment.left / (100 - fragment.width)) * 100;
                  const backgroundPositionY = fragment.top === 0 ? 0 : (fragment.top / (100 - fragment.height)) * 100;
                  return (
                    <div
                      key={`${overlay.id}_fragment_${index}`}
                      className="card-motion-overlay-fragment"
                      style={
                        {
                          left: `${fragment.left}%`,
                          top: `${fragment.top}%`,
                          width: `${fragment.width}%`,
                          height: `${fragment.height}%`,
                          "--fragment-background-size": `${backgroundSizeX}% ${backgroundSizeY}%`,
                          "--fragment-background-position": `${backgroundPositionX}% ${backgroundPositionY}%`,
                          "--fragment-translate-x": `${fragment.tx}px`,
                          "--fragment-translate-y": `${fragment.ty}px`,
                          "--fragment-rotate": `${fragment.rotate}deg`
                        } as CSSProperties
                      }
                    >
                      <div className="card-motion-overlay-fragment-face" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card-motion-overlay-shell">
                <div className="card-motion-overlay-title">{overlay.name}</div>
              </div>
            )}
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
      spawnBurst(event.attribute ?? lastActivationRef.current?.attribute ?? "none", "damage", event.sourceInstanceId ?? lastActivationRef.current?.instanceId ?? null);
      break;
    case "FINAL_ATTACK":
      spawnBurst(lastActivationRef.current?.attribute ?? "none", "final", lastActivationRef.current?.instanceId ?? null);
      break;
    default:
      break;
  }
}
