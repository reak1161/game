import {
  type Attribute,
  type CardDefinition,
  type CardInstance,
  type ConditionDefinition,
  type EffectDefinition,
  type EnchantmentInstance,
  type EngineLogEntry,
  type GameState,
  type OperationDefinition,
  type PlayerState,
  type ReplayEvent,
  type RoundBuffDefinition,
  type RoleDefinition,
  type SubmittedRoundData,
  type TriggerDefinition
} from "@hyperdimensional-battle/shared";

type CreateLocalGameInput = {
  roleId: string;
  cards: CardDefinition[];
  roles: RoleDefinition[];
  roundBuffs?: RoundBuffDefinition[];
  seed?: string;
};

export type RoundPlanInput = SubmittedRoundData;

type ActivationTask = {
  instanceId: string;
  skippedReactiveEffectIds: string[];
  isAdditional?: boolean;
};

type FutureChainMultiplier = {
  id: string;
  mode: "same" | "specific";
  attribute?: Attribute;
  value: number;
  startsAfterActivation: number;
};

type ScheduledRevive = {
  card: CardInstance;
  fieldIndex: number;
};

type PendingFinalActionState =
  | {
      kind: "dolphin_duplicate";
    };

type PendingRoundBuffChoiceState = {
  options: string[];
  rerollUsed: boolean;
  rollIndex: number;
};

type PendingResolutionState = {
  queue: ActivationTask[];
  cursor: number;
  currentResolvingInstanceId: string | null;
  activationCount: number;
  loopGuardCount: number;
  previousResolvedAttribute: Attribute | null;
  lastResolvedAttribute: Attribute | null;
  sameAttributeChainCount: number;
  futureChainMultipliers: FutureChainMultiplier[];
};

export type LocalGameState = GameState & {
  phaseLabel: string;
  cardCatalog: CardDefinition[];
  roleCatalog: RoleDefinition[];
  roundBuffCatalog: RoundBuffDefinition[];
  chanceRollCount: number;
  pendingResolution?: PendingResolutionState | null;
  pendingFinalAction?: PendingFinalActionState | null;
  pendingRoundBuffChoice?: PendingRoundBuffChoiceState | null;
  scheduledRoundEndRevives: ScheduledRevive[];
};

type TriggerEvent =
  | { kind: "before_card_activates" | "after_card_activates"; sourceCard: CardInstance; activationTask: ActivationTask }
  | { kind: "before_damage_dealt"; sourceCard: CardInstance; activationTask: ActivationTask; pendingDamage: number }
  | { kind: "after_damage_dealt"; sourceCard: CardInstance; activationTask: ActivationTask; damageAmount: number }
  | { kind: "when_ally_field_card_destroyed"; destroyedCard: CardInstance; sourceCard: CardInstance | null; activationTask: ActivationTask | null }
  | { kind: "on_enter_field"; enteredCard: CardInstance }
  | { kind: "on_field_state_check"; subjectCard: CardInstance }
  | { kind: "at_next_round_start" }
  | { kind: "at_round_end" };

type ResolutionContext = {
  state: LocalGameState;
  player: PlayerState;
  cardsById: Record<string, CardDefinition>;
  resolvingCard: CardInstance;
  activationTask: ActivationTask;
  targetSelections: Record<string, string>;
  activeEnchantment: EnchantmentInstance | null;
  lastDestroySucceeded: boolean;
  lastDestroyCount: number;
  lastRemovedEnchantCount: number;
  lastInvalidatedCount: number;
  lastInvalidatedCardInstanceIds: string[];
};

type PlayerStatSnapshot = {
  baseAttack: number;
  baseMagic: number;
  tempAttack: number;
  tempMagic: number;
};

const ROUND_EVENT_LIMIT = 5000;

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getTokenPlacementSelectionKey(effectId: string, tokenDefinitionId: string) {
  return `create_token_positions:${effectId}:${tokenDefinitionId}`;
}

function cloneGame(state: LocalGameState): LocalGameState {
  return structuredClone(state);
}

function floorValue(value: number) {
  return Math.round(value * 100) / 100;
}

function floorDamageValue(value: number) {
  return Math.max(0, Math.floor(value));
}

function formatLogNumber(value: number) {
  if (Math.abs(value) >= 1_000_000_000_000) {
    return value.toExponential(3).replace(/(\.\d*?[1-9])0+e/, "$1e").replace(/\.0+e/, "e");
  }
  if (Number.isInteger(value)) {
    return `${value}`;
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatSignedLogNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatLogNumber(value)}`;
}

function hashSeed(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash || 1;
}

function createRng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: string) {
  const cloned = [...items];
  const random = createRng(seed);
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function addLog(state: LocalGameState, entry: Omit<EngineLogEntry, "id" | "ts">) {
  state.log.push({
    id: createId("log"),
    ts: Date.now(),
    ...entry
  });
}

function addReplay(state: LocalGameState, event: ReplayEvent) {
  state.replayEvents.push(event);
}

function snapshotPlayerStats(player: PlayerState): PlayerStatSnapshot {
  return {
    baseAttack: player.baseAttack,
    baseMagic: player.baseMagic,
    tempAttack: player.tempAttack,
    tempMagic: player.tempMagic
  };
}

function formatDelta(next: number, prev: number) {
  const delta = next - prev;
  if (delta === 0) {
    return null;
  }
  return formatSignedLogNumber(delta);
}

function formatMultiplier(next: number, prev: number) {
  if (prev === 0 || next === prev) {
    return null;
  }
  return `×${formatLogNumber(next / prev)}`;
}

function addStatDeltaLog(
  state: LocalGameState,
  resolvingCard: CardInstance,
  label: string,
  before: PlayerStatSnapshot,
  after: PlayerStatSnapshot,
  options?: {
    sourceKind?: "card" | "enchant";
    sourceName?: string;
    preferMultiplier?: boolean;
  }
) {
  const displayChanges = [
    {
      label: "基礎攻撃",
      display: options?.preferMultiplier
        ? formatMultiplier(after.baseAttack, before.baseAttack) && formatDelta(after.baseAttack, before.baseAttack)
          ? `基礎攻撃 ${formatMultiplier(after.baseAttack, before.baseAttack)}（${formatDelta(after.baseAttack, before.baseAttack)}）`
          : formatDelta(after.baseAttack, before.baseAttack) && `基礎攻撃 ${formatDelta(after.baseAttack, before.baseAttack)}`
        : formatDelta(after.baseAttack, before.baseAttack) && `基礎攻撃 ${formatDelta(after.baseAttack, before.baseAttack)}`,
      delta: formatDelta(after.baseAttack, before.baseAttack)
    },
    {
      label: "基礎魔法",
      display: options?.preferMultiplier
        ? formatMultiplier(after.baseMagic, before.baseMagic) && formatDelta(after.baseMagic, before.baseMagic)
          ? `基礎魔法 ${formatMultiplier(after.baseMagic, before.baseMagic)}（${formatDelta(after.baseMagic, before.baseMagic)}）`
          : formatDelta(after.baseMagic, before.baseMagic) && `基礎魔法 ${formatDelta(after.baseMagic, before.baseMagic)}`
        : formatDelta(after.baseMagic, before.baseMagic) && `基礎魔法 ${formatDelta(after.baseMagic, before.baseMagic)}`,
      delta: formatDelta(after.baseMagic, before.baseMagic)
    },
    {
      label: "一時攻撃",
      display: options?.preferMultiplier
        ? formatMultiplier(after.tempAttack, before.tempAttack) && formatDelta(after.tempAttack, before.tempAttack)
          ? `一時攻撃 ${formatMultiplier(after.tempAttack, before.tempAttack)}（${formatDelta(after.tempAttack, before.tempAttack)}）`
          : formatDelta(after.tempAttack, before.tempAttack) && `一時攻撃 ${formatDelta(after.tempAttack, before.tempAttack)}`
        : formatDelta(after.tempAttack, before.tempAttack) && `一時攻撃 ${formatDelta(after.tempAttack, before.tempAttack)}`,
      delta: formatDelta(after.tempAttack, before.tempAttack)
    },
    {
      label: "一時魔法",
      display: options?.preferMultiplier
        ? formatMultiplier(after.tempMagic, before.tempMagic) && formatDelta(after.tempMagic, before.tempMagic)
          ? `一時魔法 ${formatMultiplier(after.tempMagic, before.tempMagic)}（${formatDelta(after.tempMagic, before.tempMagic)}）`
          : formatDelta(after.tempMagic, before.tempMagic) && `一時魔法 ${formatDelta(after.tempMagic, before.tempMagic)}`
        : formatDelta(after.tempMagic, before.tempMagic) && `一時魔法 ${formatDelta(after.tempMagic, before.tempMagic)}`,
      delta: formatDelta(after.tempMagic, before.tempMagic)
    }
  ];

  const changes = displayChanges
    .map((entry) => entry.display)
    .filter((entry): entry is string => Boolean(entry));
  const deltaTexts = displayChanges
    .map((entry) => entry.delta)
    .filter((entry): entry is string => Boolean(entry));

  if (changes.length === 0) {
    return;
  }

  addLog(state, {
    level: "info",
    code: "CARD_EFFECT_APPLIED",
    message:
      options?.sourceKind === "enchant"
        ? `${resolvingCard.name}: 付与エンチャント ${options?.sourceName ?? resolvingCard.name} により ${changes.join(" / ")}`
        : `${resolvingCard.name}: カード効果 ${label} により ${changes.join(" / ")}`,
    meta: {
      sourceKind: options?.sourceKind ?? "card",
      sourceName: options?.sourceName ?? resolvingCard.name,
      deltaTexts
    }
  });
}
function describePhase(phase: GameState["phase"]) {
  switch (phase) {
    case "input":
      return "入力";
    case "round_end":
      return "ラウンド終了";
    case "finished":
      return "ゲーム終了";
  }
}

function withUiState(state: LocalGameState): LocalGameState {
  state.phaseLabel = describePhase(state.phase);
  return state;
}

function buildCardInstance(definition: CardDefinition, ownerPlayerId: string, copyIndex: number): CardInstance {
  return {
    instanceId: `${definition.id}_${copyIndex}_${Math.random().toString(36).slice(2, 8)}`,
    definitionId: definition.id,
    name: definition.name,
    type: definition.type,
    attribute: definition.attribute,
    text: definition.text,
    ownerPlayerId,
    zone: "deck",
    enchantments: [],
    counters: {},
    derived: {
      numericValueMultiplier: 1
    }
  };
}

function getRoundTriggeredCount(card: CardInstance, effectId: string) {
  return typeof card.counters?.[`round_triggered_${effectId}`] === "number"
    ? card.counters?.[`round_triggered_${effectId}`] ?? 0
    : 0;
}

function markRoundTriggered(card: CardInstance, effectId: string) {
  card.counters = {
    ...(card.counters ?? {}),
    [`round_triggered_${effectId}`]: getRoundTriggeredCount(card, effectId) + 1
  };
}

function getPlayer(state: LocalGameState) {
  const player = state.players[0];
  if (!player) {
    throw new Error("プレイヤー情報がありません。");
  }
  return player;
}

function getReferencedPreviousRoundEffectDefinition(
  player: PlayerState,
  cardsById: Record<string, CardDefinition>
) {
  const definitionId = player.previousRoundLastEffectDefinitionId;
  if (!definitionId) {
    return null;
  }
  const definition = cardsById[definitionId] ?? null;
  if (definition && isRewindDefinition(definition)) {
    return null;
  }
  return definition;
}

function isRewindDefinition(definition: CardDefinition) {
  return definition.effects.some((effect) =>
    effect.operations.some((operation) => operation.kind === "repeat_previous_round_last_effect_as_self")
  );
}

function getResolvableCardDefinition(
  player: PlayerState,
  card: CardInstance,
  cardsById: Record<string, CardDefinition>
) {
  const definition = cardsById[card.definitionId];
  if (!definition) {
    return null;
  }

  const isRewind = isRewindDefinition(definition);
  if (!isRewind) {
    return definition;
  }

  return getReferencedPreviousRoundEffectDefinition(player, cardsById);
}

function assignFieldIndexes(player: PlayerState) {
  player.field.forEach((card, index) => {
    card.fieldIndex = index;
  });
}

function moveCard(card: CardInstance, zone: CardInstance["zone"], collection: CardInstance[]) {
  card.zone = zone;
  collection.push(card);
}

function getRoundBuffMap(state: LocalGameState) {
  return Object.fromEntries(state.roundBuffCatalog.map((buff) => [buff.id, buff] as const));
}

function getSelectedRoundBuffBaseCounts(player: PlayerState) {
  const counts: Record<string, number> = {};
  for (const buff of player.selectedRoundBuffs) {
    counts[buff.buffId] = (counts[buff.buffId] ?? 0) + 1;
  }
  return counts;
}

function getEffectiveRoundBuffCount(player: PlayerState, buffId: string) {
  const counts = getSelectedRoundBuffBaseCounts(player);
  const mirrorCount = counts.round_buff_mirror ?? 0;
  if (buffId === "round_buff_mirror") {
    return mirrorCount;
  }
  const baseCount = counts[buffId] ?? 0;
  return baseCount + mirrorCount * baseCount;
}

function getRoundBuffDrawWeightBonus(player: PlayerState, attribute: Attribute) {
  if (attribute === "thunder") {
    return getEffectiveRoundBuffCount(player, "round_buff_voltessimo");
  }
  if (attribute === "ice") {
    return getEffectiveRoundBuffCount(player, "round_buff_freezing_wind");
  }
  if (attribute === "wind") {
    return getEffectiveRoundBuffCount(player, "round_buff_tailwind_rush");
  }
  return 0;
}

function getRoundBuffMaxHandSizeBonus(player: PlayerState) {
  return getEffectiveRoundBuffCount(player, "round_buff_information_society");
}

function getRoundBuffPlacementLimitBonus(player: PlayerState) {
  return getEffectiveRoundBuffCount(player, "round_buff_information_society");
}

function getEffectiveRoundHandSize(player: PlayerState) {
  return 7 + player.nextRoundDrawBonus + getRoundBuffMaxHandSizeBonus(player);
}

function getEffectiveRoundPlacementLimit(player: PlayerState) {
  return player.roundPlacementLimit + getRoundBuffPlacementLimitBonus(player);
}

function getAttributeActivationTotal(player: PlayerState, attribute: Attribute) {
  return player.attributeActivationCounts[attribute] ?? 0;
}

function getSealCounterKey(definition: CardDefinition) {
  if (!definition.seal) {
    return null;
  }

  switch (definition.seal.kind) {
    case "ally_attribute_activation_total_at_least":
      return `seal_progress_${definition.seal.kind}_${definition.seal.attribute}`;
  }
}

function getCardSealProgress(card: CardInstance, definition: CardDefinition) {
  const key = getSealCounterKey(definition);
  if (!key) {
    return 0;
  }
  return card.counters?.[key] ?? 0;
}

function isSealSatisfied(card: CardInstance, definition: CardDefinition) {
  if (!definition.seal) {
    return true;
  }

  switch (definition.seal.kind) {
    case "ally_attribute_activation_total_at_least":
      return getCardSealProgress(card, definition) >= definition.seal.value;
  }
}

function isCardSealed(player: PlayerState, card: CardInstance, cardsById: Record<string, CardDefinition>) {
  const definition = cardsById[card.definitionId];
  if (!definition?.seal) {
    return false;
  }
  return !isSealSatisfied(card, definition);
}

function advanceSealProgressForActivation(player: PlayerState, cardsById: Record<string, CardDefinition>, attribute: Attribute) {
  for (const card of player.field) {
    if (card.isInvalidated || card.isDestroyed) {
      continue;
    }
    const definition = cardsById[card.definitionId];
    if (!definition?.seal) {
      continue;
    }
    if (definition.seal.kind !== "ally_attribute_activation_total_at_least") {
      continue;
    }
    if (definition.seal.attribute !== attribute) {
      continue;
    }
    const counterKey = getSealCounterKey(definition);
    if (!counterKey) {
      continue;
    }
    card.counters = {
      ...(card.counters ?? {}),
      [counterKey]: floorValue((card.counters?.[counterKey] ?? 0) + 1)
    };
  }
}

function getMainTiming(card: CardDefinition) {
  if (card.timings.includes("consume")) {
    return "consume" as const;
  }
  return "activate" as const;
}

function drawUpToHandSize(state: LocalGameState, player: PlayerState, size: number) {
  while (player.hand.length < size && player.deck.length > 0) {
    const card = drawCardByAttributeWeight(state, player);
    if (!card) {
      break;
    }
    card.zone = "hand";
    player.hand.push(card);
  }
  addLog(state, {
    level: "info",
    code: "DRAW_UP_TO",
    message: `手札を ${player.hand.length} 枚まで補充しました。`
  });
}

function drawCardByAttributeWeight(state: LocalGameState, player: PlayerState) {
  if (player.deck.length === 0) {
    return null;
  }

  const availableAttributes = [...new Set(player.deck.map((card) => card.attribute))].sort();
  const random = createRng(`${state.rngSeed}:draw:${player.playerId}`);
  let randomValue = 0;
  for (let index = 0; index <= player.drawSequence; index += 1) {
    randomValue = random();
  }
  player.drawSequence += 1;

  const weightedAttributes = availableAttributes.flatMap((attribute) => {
    const weight = Math.max(
      1,
      1 + (player.drawAttributeWeights[attribute] ?? 0) + getRoundBuffDrawWeightBonus(player, attribute)
    );
    return Array.from({ length: weight }, () => attribute);
  });

  const selectedAttribute = weightedAttributes[Math.floor(randomValue * weightedAttributes.length)];
  if (!selectedAttribute) {
    return null;
  }

  const candidates = player.deck.filter((card) => card.attribute === selectedAttribute);
  const selectedCard = candidates[Math.floor(random() * candidates.length)];
  if (!selectedCard) {
    return null;
  }

  player.deck = player.deck.filter((card) => card.instanceId !== selectedCard.instanceId);
  return selectedCard;
}

function findCardByInstanceId(player: PlayerState, instanceId: string) {
  return (
    player.field.find((card) => card.instanceId === instanceId) ??
    player.hand.find((card) => card.instanceId === instanceId) ??
    player.discard.find((card) => card.instanceId === instanceId) ??
    player.removed.find((card) => card.instanceId === instanceId) ??
    null
  );
}

function getNumericBonus(card: CardInstance) {
  return Object.entries(card.counters ?? {}).reduce(
    (sum, [key, value]) => (key.startsWith("round_triggered_") ? sum : sum + value),
    0
  );
}

function getHostEnchantNumericBonus(card: CardInstance) {
  const bonus = card.derived?.hostEnchantNumericBonus;
  return typeof bonus === "number" ? bonus : 0;
}

function getProbabilityValueMultiplier(card: CardInstance | null) {
  if (!card) {
    return 1;
  }
  const multiplier = card.derived?.probabilityValueMultiplier;
  return typeof multiplier === "number" ? multiplier : 1;
}

function getNumericMultiplier(card: CardInstance) {
  const multiplier = card.derived?.numericValueMultiplier;
  const roundBuffMultiplier = card.derived?.roundBuffNumericValueMultiplier;
  const fieldTransformMultiplier = card.derived?.fieldTransformNumericValueMultiplier;
  return (
    (typeof multiplier === "number" ? multiplier : 1) *
    (typeof roundBuffMultiplier === "number" ? roundBuffMultiplier : 1) *
    (typeof fieldTransformMultiplier === "number" ? fieldTransformMultiplier : 1)
  );
}

function getScaledValue(value: number, card: CardInstance | null) {
  if (!card) {
    return value;
  }
  return (value + getNumericBonus(card)) * getNumericMultiplier(card);
}

function getScaledProbabilityValue(value: number, card: CardInstance | null) {
  if (!card) {
    return value;
  }
  return floorValue(value * getProbabilityValueMultiplier(card));
}

function rollChancePercent(state: LocalGameState, context: ResolutionContext, effectId: string, chancePercent: number) {
  const clampedChance = Math.max(0, Math.min(100, chancePercent));
  const rollIndex = state.chanceRollCount;
  state.chanceRollCount += 1;
  const rng = createRng(
    `${state.rngSeed}:chance:${state.round}:${rollIndex}:${effectId}:${context.resolvingCard.instanceId}:${context.activeEnchantment?.instanceId ?? "card"}`
  );
  return rng() * 100 < clampedChance;
}

function countConnectedAttributeCards(player: PlayerState, sourceCard: CardInstance, attribute: Attribute) {
  const sourceIndex = sourceCard.fieldIndex ?? player.field.findIndex((card) => card.instanceId === sourceCard.instanceId);
  let connectedCount = 0;
  for (let index = sourceIndex - 1; index >= 0; index -= 1) {
    if (player.field[index]?.attribute !== attribute) {
      break;
    }
    connectedCount += 1;
  }
  for (let index = sourceIndex + 1; index < player.field.length; index += 1) {
    if (player.field[index]?.attribute !== attribute) {
      break;
    }
    connectedCount += 1;
  }
  return connectedCount;
}

function countConnectedEnchantedCards(player: PlayerState, sourceCard: CardInstance) {
  const sourceIndex = sourceCard.fieldIndex ?? player.field.findIndex((card) => card.instanceId === sourceCard.instanceId);
  let connectedCount = 0;

  for (let index = sourceIndex - 1; index >= 0; index -= 1) {
    const card = player.field[index];
    if (!card || card.enchantments.length === 0) {
      break;
    }
    connectedCount += 1;
  }

  for (let index = sourceIndex + 1; index < player.field.length; index += 1) {
    const card = player.field[index];
    if (!card || card.enchantments.length === 0) {
      break;
    }
    connectedCount += 1;
  }

  return connectedCount;
}

function getFirstNumericOperationBaseValue(definition: CardDefinition) {
  for (const effect of definition.effects) {
    for (const operation of effect.operations) {
      if ("value" in operation && typeof operation.value === "number") {
        return operation.value;
      }
    }
  }
  return null;
}

function getEffectiveCardAttribute(card: CardInstance) {
  const overrideAttribute = card.derived?.activationAttributeOverride;
  if (typeof overrideAttribute === "string") {
    return overrideAttribute as Attribute;
  }
  const fieldOverride = card.derived?.fieldAttributeOverride;
  return typeof fieldOverride === "string" ? (fieldOverride as Attribute) : card.attribute;
}

function clearActivationOverride(card: CardInstance) {
  if (card.derived && "activationAttributeOverride" in card.derived) {
    delete card.derived.activationAttributeOverride;
  }
}

function setActivationOverride(card: CardInstance, attribute: Attribute) {
  card.derived = {
    ...(card.derived ?? {}),
    activationAttributeOverride: attribute
  };
}

function scaleCardNumericValue(cardsById: Record<string, CardDefinition>, targetCard: CardInstance, multiplier: number) {
  const baseDefinition = cardsById[targetCard.definitionId];
  const baseValue = baseDefinition ? getFirstNumericOperationBaseValue(baseDefinition) : null;
  if (baseValue === null || baseValue === 0) {
    return false;
  }

  const currentValue = getScaledValue(baseValue, targetCard);
  const nextValue = floorValue(currentValue * multiplier);
  const preservedCounters = Object.fromEntries(
    Object.entries(targetCard.counters ?? {}).filter(([key]) => key.startsWith("round_triggered_"))
  );
  targetCard.counters = {
    ...preservedCounters,
    merge_numeric: nextValue - baseValue
  };
  targetCard.derived = {
    ...(targetCard.derived ?? {}),
    numericValueMultiplier: 1
  };
  return true;
}

function setCardNumericValue(cardsById: Record<string, CardDefinition>, targetCard: CardInstance, value: number) {
  const baseDefinition = cardsById[targetCard.definitionId];
  const baseValue = baseDefinition ? getFirstNumericOperationBaseValue(baseDefinition) : null;
  if (baseValue === null) {
    return false;
  }

  const preservedCounters = Object.fromEntries(
    Object.entries(targetCard.counters ?? {}).filter(([key]) => key.startsWith("round_triggered_"))
  );
  targetCard.counters = {
    ...preservedCounters,
    merge_numeric: floorValue(value - baseValue)
  };
  targetCard.derived = {
    ...(targetCard.derived ?? {}),
    numericValueMultiplier: 1
  };
  return true;
}

function getRelativeCard(player: PlayerState, sourceCard: CardInstance, relativePosition: "left_1" | "right_1") {
  const index = sourceCard.fieldIndex ?? player.field.findIndex((card) => card.instanceId === sourceCard.instanceId);
  if (index < 0) {
    return null;
  }
  const targetIndex = relativePosition === "left_1" ? index - 1 : index + 1;
  return player.field[targetIndex] ?? null;
}

function pushStatusReplay(state: LocalGameState, player: PlayerState) {
  addReplay(state, {
    type: "STATUS_CHANGED",
    playerId: player.playerId,
    baseAttack: player.baseAttack,
    baseMagic: player.baseMagic,
    tempAttack: player.tempAttack,
    tempMagic: player.tempMagic
  });
}

export function getCardDefinitionMap(cards: CardDefinition[]) {
  return Object.fromEntries(cards.map((card) => [card.id, card] as const));
}

export function getRoleDefinitionMap(roles: RoleDefinition[]) {
  return Object.fromEntries(roles.map((role) => [role.id, role] as const));
}

function resetRoundStats(player: PlayerState, role: RoleDefinition) {
  player.tempAttack = player.baseAttack;
  player.tempMagic = player.baseMagic;
  player.scoreThisRound = 0;
  player.finalAttackMultiplier = 1;
  player.finalAttackForcedZero = false;
  player.roundDestroyedCardCount = 0;
  player.currentRoundLastEffectDefinitionId = null;
  player.roundPlacementLimit = 5;
  player.oncePerRound.mulliganUsed = false;

  for (const effect of role.passiveEffects) {
    for (const operation of effect.operations) {
      if (operation.kind === "set_round_placement_limit") {
        player.roundPlacementLimit = operation.value;
      }
    }
  }

  clearRoundInvalidations(player);
  for (const card of player.field) {
    if (card.counters) {
      card.counters = Object.fromEntries(
        Object.entries(card.counters).filter(([key]) => !key.startsWith("round_triggered_"))
      );
    }
  }
}

function ensureLoopGuard(state: LocalGameState, reason: string) {
  if (!state.pendingResolution) {
    return;
  }
  state.pendingResolution.loopGuardCount += 1;
  if (state.pendingResolution.loopGuardCount <= ROUND_EVENT_LIMIT) {
    return;
  }

  addLog(state, {
    level: "warn",
    code: "LOOP_GUARD_TRIGGERED",
    message: `${reason} の処理を打ち切りました。`
  });
  throw new Error("無限ループ防止により発動処理を停止しました。");
}

function getChainState(state: LocalGameState) {
  if (!state.pendingResolution) {
    throw new Error("カード発動中の情報がありません。");
  }
  return state.pendingResolution;
}

function conditionSatisfied(
  effect: EffectDefinition,
  hostCard: CardInstance | null,
  state: LocalGameState,
  event: TriggerEvent | null
) {
  const condition = effect.condition;
  if (!condition) {
    return true;
  }

  const player = getPlayer(state);
  switch (condition.kind) {
    case "host_card_type_is":
      return hostCard?.type === condition.value;
    case "is_final_round":
      return state.round === 5;
    case "source_owner_is_self":
      if (!event || !("sourceCard" in event) || !event.sourceCard) {
        return false;
      }
      return event.sourceCard.ownerPlayerId === hostCard?.ownerPlayerId;
    case "source_owner_is_self_and_source_main_timing_is_consume":
      if (!event || !("sourceCard" in event) || !event.sourceCard || !hostCard) {
        return false;
      }
      return (
        event.sourceCard.ownerPlayerId === hostCard.ownerPlayerId &&
        getMainTiming(getCardDefinitionMap(state.cardCatalog)[event.sourceCard.definitionId]!) === "consume"
      );
    case "source_owner_is_self_and_not_host":
      if (!event || !("sourceCard" in event) || !event.sourceCard || !hostCard) {
        return false;
      }
      return (
        event.sourceCard.ownerPlayerId === hostCard.ownerPlayerId &&
        event.sourceCard.instanceId !== hostCard.instanceId
      );
    case "source_owner_is_self_and_not_host_and_attribute_matches_previous":
      if (!event || !("sourceCard" in event) || !event.sourceCard || !hostCard) {
        return false;
      }
      return (
        event.sourceCard.ownerPlayerId === hostCard.ownerPlayerId &&
        event.sourceCard.instanceId !== hostCard.instanceId &&
        getEffectiveCardAttribute(event.sourceCard) === state.pendingResolution?.previousResolvedAttribute
      );
    case "source_owner_is_self_and_not_host_and_definition_is":
      if (!event || !("sourceCard" in event) || !event.sourceCard || !hostCard) {
        return false;
      }
      return (
        event.sourceCard.ownerPlayerId === hostCard.ownerPlayerId &&
        event.sourceCard.instanceId !== hostCard.instanceId &&
        event.sourceCard.definitionId === condition.definitionId
      );
    case "source_owner_is_self_and_not_host_and_definition_is_not":
      if (!event || !("sourceCard" in event) || !event.sourceCard || !hostCard) {
        return false;
      }
      return (
        event.sourceCard.ownerPlayerId === hostCard.ownerPlayerId &&
        event.sourceCard.instanceId !== hostCard.instanceId &&
        event.sourceCard.definitionId !== condition.definitionId
      );
    case "previous_attribute_exists":
      return Boolean(state.pendingResolution?.lastResolvedAttribute);
    case "adjacent_same_definition_exists": {
      if (!hostCard) {
        return false;
      }
      const leftCard = getRelativeCard(player, hostCard, "left_1");
      const rightCard = getRelativeCard(player, hostCard, "right_1");
      return (
        leftCard?.definitionId === condition.definitionId ||
        rightCard?.definitionId === condition.definitionId
      );
    }
    case "same_attribute_chain_at_least":
      return (state.pendingResolution?.sameAttributeChainCount ?? 0) >= condition.value;
    case "both_adjacent_attribute_is": {
      if (!hostCard) {
        return false;
      }
      const leftCard = getRelativeCard(player, hostCard, "left_1");
      const rightCard = getRelativeCard(player, hostCard, "right_1");
      return leftCard?.attribute === condition.attribute && rightCard?.attribute === condition.attribute;
    }
    case "ally_field_attribute_count_at_least":
      return player.field.filter((card) => card.attribute === condition.attribute).length >= condition.value;
  }
}

function matchesTargetFilter(listenerCard: CardInstance, event: TriggerEvent, trigger: TriggerDefinition) {
  if (!("sourceCard" in event) || !event.sourceCard) {
    return true;
  }

  const sourceCard = event.sourceCard;
  if ("target" in trigger && trigger.target === "ally_none_attribute_card" && getEffectiveCardAttribute(sourceCard) !== "none") {
    return false;
  }

  if ("target" in trigger && trigger.target === "right_1_of_self") {
    return (listenerCard.fieldIndex ?? -1) + 1 === sourceCard.fieldIndex;
  }

  if ("attribute" in trigger && trigger.attribute && getEffectiveCardAttribute(sourceCard) !== trigger.attribute) {
    return false;
  }

  if ("cardType" in trigger && trigger.cardType && sourceCard.type !== trigger.cardType) {
    return false;
  }

  return true;
}

function shouldRunTriggeredEffect(
  state: LocalGameState,
  listenerCard: CardInstance,
  effect: EffectDefinition,
  event: TriggerEvent
) {
  const cardsById = getCardDefinitionMap(state.cardCatalog);
  const player = getPlayer(state);
  if (!effect.trigger || effect.trigger.kind !== event.kind) {
    return false;
  }
  if (listenerCard.isInvalidated || listenerCard.isDestroyed) {
    return false;
  }
  if (isCardSealed(player, listenerCard, cardsById)) {
    return false;
  }

  switch (event.kind) {
    case "on_enter_field":
      return (listenerCard.fieldIndex ?? Number.MAX_SAFE_INTEGER) <= (event.enteredCard.fieldIndex ?? -1);
    case "on_field_state_check":
      return listenerCard.instanceId === event.subjectCard.instanceId;
    case "at_next_round_start":
    case "at_round_end":
      return true;
    case "before_card_activates":
    case "after_card_activates":
    case "before_damage_dealt":
    case "after_damage_dealt":
      if (listenerCard.instanceId === event.sourceCard.instanceId) {
        return false;
      }
      if ("activationTask" in event && event.activationTask.skippedReactiveEffectIds.includes(effect.id)) {
        return false;
      }
      if (typeof effect.roundTriggerLimit === "number" && getRoundTriggeredCount(listenerCard, effect.id) >= effect.roundTriggerLimit) {
        return false;
      }
      return matchesTargetFilter(listenerCard, event, effect.trigger);
    case "when_ally_field_card_destroyed":
      if (typeof effect.roundTriggerLimit === "number" && getRoundTriggeredCount(listenerCard, effect.id) >= effect.roundTriggerLimit) {
        return false;
      }
      return listenerCard.instanceId !== event.destroyedCard.instanceId;
  }
}

function queueAdditionalActivation(
  state: LocalGameState,
  player: PlayerState,
  sourceCard: CardInstance,
  instanceId: string,
  skippedReactiveEffectId: string,
  reasonLabel: string
) {
  if (!state.pendingResolution) {
    return;
  }
  state.pendingResolution.queue.splice(state.pendingResolution.cursor, 0, {
    instanceId,
    skippedReactiveEffectIds: [skippedReactiveEffectId],
    isAdditional: true
  });

  const targetCard = findCardByInstanceId(player, instanceId);
  if (!targetCard) {
    return;
  }
  const isSelfTrigger = sourceCard.instanceId === targetCard.instanceId;

  addLog(state, {
    level: "info",
    code: "ADDITIONAL_ACTIVATION_QUEUED",
    message: isSelfTrigger
      ? `${sourceCard.name}: ${reasonLabel} により誘発します。`
      : `${sourceCard.name}: ${reasonLabel} により ${targetCard.name} が追加で発動します。`
  });
}

function queueActivationByFieldOrder(
  state: LocalGameState,
  player: PlayerState,
  card: CardInstance,
  skippedReactiveEffectIds: string[] = []
) {
  if (!state.pendingResolution) {
    return;
  }

  if (state.pendingResolution.queue.some((task) => task.instanceId === card.instanceId)) {
    return;
  }

  const cardIndex = card.fieldIndex ?? player.field.findIndex((entry) => entry.instanceId === card.instanceId);
  const currentResolvingCard =
    state.pendingResolution.currentResolvingInstanceId
      ? findCardByInstanceId(player, state.pendingResolution.currentResolvingInstanceId)
      : null;
  const currentResolvingFieldIndex =
    currentResolvingCard?.fieldIndex ??
    (currentResolvingCard ? player.field.findIndex((entry) => entry.instanceId === currentResolvingCard.instanceId) : null);
  if (typeof currentResolvingFieldIndex === "number" && cardIndex < currentResolvingFieldIndex) {
    return;
  }
  let insertIndex = state.pendingResolution.cursor;
  while (insertIndex < state.pendingResolution.queue.length) {
    const queuedCard = findCardByInstanceId(player, state.pendingResolution.queue[insertIndex]!.instanceId);
    if (!queuedCard) {
      insertIndex += 1;
      continue;
    }
    const queuedIndex = queuedCard.fieldIndex ?? player.field.findIndex((entry) => entry.instanceId === queuedCard.instanceId);
    if (queuedIndex > cardIndex) {
      break;
    }
    insertIndex += 1;
  }

  state.pendingResolution.queue.splice(insertIndex, 0, {
    instanceId: card.instanceId,
    skippedReactiveEffectIds,
    isAdditional: false
  });
}

function queuePlacedRoundStartAdditionalActivations(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>
) {
  if (!state.pendingResolution) {
    return;
  }

  for (const sourceCard of player.field) {
    if (sourceCard.isInvalidated || sourceCard.isDestroyed || isCardSealed(player, sourceCard, cardsById)) {
      continue;
    }
    const definition = cardsById[sourceCard.definitionId];
    if (!definition) {
      continue;
    }
    for (const effect of definition.effects.filter((entry) => entry.timing === "placed")) {
      for (const operation of effect.operations) {
        if (operation.kind !== "queue_additional_activation_for_all_ally_field_cards") {
          continue;
        }
        for (const target of player.field) {
          state.pendingResolution.queue.push({
            instanceId: target.instanceId,
            skippedReactiveEffectIds: [],
            isAdditional: true
          });
        }
        addLog(state, {
          level: "info",
          code: "ADDITIONAL_ACTIVATION_QUEUED",
          message: `${sourceCard.name}: 設置効果により場の ${player.field.length} 枚が追加で発動します。`
        });
      }
    }
  }
}

function runCardEffects(
  effects: EffectDefinition[],
  context: ResolutionContext,
  event: TriggerEvent | null
): TriggerEvent | null {
  for (const effect of effects) {
    if (!conditionSatisfied(effect, context.resolvingCard, context.state, event)) {
      continue;
    }
    for (const operation of effect.operations) {
      event = resolveOperation(operation, context, effect.id, event);
    }
  }
  return event;
}

function destroyCard(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  target: CardInstance,
  sourceCard: CardInstance | null,
  activationTask: ActivationTask | null
) {
  const existing = player.field.find((card) => card.instanceId === target.instanceId);
  if (!existing || existing.isDestroyed) {
    return false;
  }

  const previousIndex = existing.fieldIndex ?? player.field.findIndex((card) => card.instanceId === existing.instanceId);
  existing.derived = {
    ...(existing.derived ?? {}),
    reviveFieldIndex: previousIndex
  };

  for (const enchantment of [...existing.enchantments]) {
    const enchantContext: ResolutionContext = {
      state,
      player,
      cardsById,
      resolvingCard: existing,
      activationTask: activationTask ?? { instanceId: existing.instanceId, skippedReactiveEffectIds: [] },
      targetSelections: {},
      activeEnchantment: enchantment,
      lastDestroySucceeded: false,
      lastDestroyCount: 0,
      lastRemovedEnchantCount: 0,
      lastInvalidatedCount: 0,
      lastInvalidatedCardInstanceIds: []
    };
    runCardEffects(
      enchantment.effects.filter((effect) => effect.timing === "enchant" && effect.trigger?.kind === "when_host_card_destroyed"),
      enchantContext,
      null
    );
  }

  existing.isDestroyed = true;
  player.roundDestroyedCardCount += 1;
  player.field = player.field.filter((card) => card.instanceId !== existing.instanceId);
  assignFieldIndexes(player);
  syncPersistentPlacedAuras(state, player, cardsById, { suppressLogs: true });
  moveCard(existing, "discard", player.discard);
  addReplay(state, { type: "CARD_DESTROYED", playerId: player.playerId, instanceId: existing.instanceId });
  addLog(state, {
    level: "info",
    code: "CARD_DESTROYED",
    message: `${existing.name} が破壊されました。`
  });

  dispatchPlacedTrigger(state, player, cardsById, {
    kind: "when_ally_field_card_destroyed",
    destroyedCard: existing,
    sourceCard,
    activationTask
  });
  return true;
}

function applyEnchantmentToCard(
  state: LocalGameState,
  cardsById: Record<string, CardDefinition>,
  sourceCard: CardInstance,
  targetCard: CardInstance,
  enchantDefinitionId: string,
  options?: {
    suppressLog?: boolean;
    persistentSourceCardInstanceId?: string;
    persistentSourceEffectId?: string;
  }
) {
  const definition = cardsById[enchantDefinitionId];
  if (!definition) {
    return false;
  }

  targetCard.enchantments.push({
    instanceId: createId("enchant"),
    definitionId: definition.id,
    name: definition.name,
    effects: definition.effects,
    persistentSourceCardInstanceId: options?.persistentSourceCardInstanceId,
    persistentSourceEffectId: options?.persistentSourceEffectId
  });
  addReplay(state, {
    type: "ENCHANT_APPLIED",
    playerId: targetCard.ownerPlayerId,
    instanceId: targetCard.instanceId,
    enchantId: definition.id
  });
  if (!options?.suppressLog) {
    addLog(state, {
      level: "info",
      code: "ENCHANT_APPLIED",
      message: `${sourceCard.name}: ${targetCard.name} に ${definition.name} を付与しました。`
    });
  }
  return true;
}

function getPersistentPlacedAuraEntries(player: PlayerState, cardsById: Record<string, CardDefinition>) {
  type PersistentPlacedAuraEntry = {
    sourceCard: CardInstance;
    effectId: string;
    enchantDefinitionId: string;
    targetMode: "all" | "adjacent";
  };

  return player.field.flatMap((sourceCard): PersistentPlacedAuraEntry[] => {
    if (sourceCard.isInvalidated || sourceCard.isDestroyed) {
      return [];
    }
    if (isCardSealed(player, sourceCard, cardsById)) {
      return [];
    }

    return (cardsById[sourceCard.definitionId]?.effects ?? [])
      .filter((effect) => effect.timing === "placed")
      .flatMap((effect): PersistentPlacedAuraEntry[] =>
        effect.operations.flatMap((operation): PersistentPlacedAuraEntry[] => {
          if (operation.kind === "apply_enchant_to_all_ally_field_cards") {
            return [
              {
                sourceCard,
                effectId: effect.id,
                enchantDefinitionId: operation.enchantDefinitionId,
                targetMode: "all"
              }
            ];
          }
          if (operation.kind === "apply_enchant_to_adjacent_cards") {
            return [
              {
                sourceCard,
                effectId: effect.id,
                enchantDefinitionId: operation.enchantDefinitionId,
                targetMode: "adjacent"
              }
            ];
          }
          return [];
        })
      );
  });
}

function syncPersistentAttributeTransforms(player: PlayerState, cardsById: Record<string, CardDefinition>) {
  for (const card of player.field) {
    const derived = { ...(card.derived ?? {}) };
    delete derived.fieldAttributeOverride;
    delete derived.fieldTransformNumericValueMultiplier;
    card.derived = derived;
  }

  for (const sourceCard of player.field) {
    if (sourceCard.isInvalidated || sourceCard.isDestroyed) {
      continue;
    }
    if (isCardSealed(player, sourceCard, cardsById)) {
      continue;
    }
    const definition = cardsById[sourceCard.definitionId];
    if (!definition) {
      continue;
    }
    for (const effect of definition.effects.filter((entry) => entry.timing === "placed")) {
      for (const operation of effect.operations) {
        if (operation.kind !== "transform_all_non_attribute_allies_to_attribute") {
          continue;
        }
        for (const targetCard of player.field) {
          if (targetCard.instanceId === sourceCard.instanceId) {
            continue;
          }
          if (targetCard.attribute === operation.excludedAttribute) {
            continue;
          }
          const multiplier = targetCard.attribute === "none" ? operation.noneMultiplier : operation.otherMultiplier;
          const currentMultiplier = targetCard.derived?.fieldTransformNumericValueMultiplier;
          targetCard.derived = {
            ...(targetCard.derived ?? {}),
            fieldTransformNumericValueMultiplier:
              floorValue((typeof currentMultiplier === "number" ? currentMultiplier : 1) * multiplier),
            fieldAttributeOverride: operation.targetAttribute
          };
        }
      }
    }
  }
}

function syncSelfTransformingPlacedCards(player: PlayerState, cardsById: Record<string, CardDefinition>) {
  for (const sourceCard of player.field) {
    if (sourceCard.isInvalidated || sourceCard.isDestroyed) {
      continue;
    }
    if (isCardSealed(player, sourceCard, cardsById)) {
      continue;
    }
    const definition = cardsById[sourceCard.definitionId];
    if (!definition) {
      continue;
    }
    for (const effect of definition.effects.filter((entry) => entry.timing === "placed" && !entry.trigger)) {
      for (const operation of effect.operations) {
        if (operation.kind !== "transform_self_to_definition") {
          continue;
        }
        const nextDefinition = cardsById[operation.definitionId];
        if (!nextDefinition || sourceCard.definitionId === nextDefinition.id) {
          continue;
        }
        sourceCard.definitionId = nextDefinition.id;
        sourceCard.name = nextDefinition.name;
        sourceCard.type = nextDefinition.type;
        sourceCard.attribute = nextDefinition.attribute;
        sourceCard.text = nextDefinition.text;
      }
    }
  }
}

function syncHostEnchantNumericModifiers(player: PlayerState, cardsById: Record<string, CardDefinition>) {
  for (const card of player.field) {
    const derived = { ...(card.derived ?? {}) };
    delete derived.hostEnchantNumericBonus;
    card.derived = derived;
  }

  for (const sourceCard of player.field) {
    if (sourceCard.isInvalidated || sourceCard.isDestroyed) {
      continue;
    }
    if (isCardSealed(player, sourceCard, cardsById)) {
      continue;
    }

    const definition = cardsById[sourceCard.definitionId];
    if (!definition) {
      continue;
    }

    let totalBonus = 0;
    for (const effect of definition.effects.filter((entry) => entry.timing === "placed")) {
      for (const operation of effect.operations) {
        if (operation.kind !== "add_self_enchant_numeric_bonus") {
          continue;
        }
        totalBonus += getScaledValue(operation.value, sourceCard);
      }
    }

    if (totalBonus !== 0) {
      sourceCard.derived = {
        ...(sourceCard.derived ?? {}),
        hostEnchantNumericBonus: totalBonus
      };
    }
  }
}

function syncPersistentPlacedAuras(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  options?: {
    sourceCardInstanceId?: string;
    suppressLogs?: boolean;
  }
) {
  const auraEntries = getPersistentPlacedAuraEntries(player, cardsById).filter(
    (entry) => !options?.sourceCardInstanceId || entry.sourceCard.instanceId === options.sourceCardInstanceId
  );
  const activeAuraKeys = new Set(
    getPersistentPlacedAuraEntries(player, cardsById).map(
      (entry) => `${entry.sourceCard.instanceId}:${entry.effectId}:${entry.enchantDefinitionId}`
    )
  );

  for (const targetCard of player.field) {
    targetCard.enchantments = targetCard.enchantments.filter((enchantment) => {
      if (!enchantment.persistentSourceCardInstanceId || !enchantment.persistentSourceEffectId) {
        return true;
      }
      if (enchantment.persistentSourceCardInstanceId.startsWith("round_buff:")) {
        return true;
      }

      return activeAuraKeys.has(
        `${enchantment.persistentSourceCardInstanceId}:${enchantment.persistentSourceEffectId}:${enchantment.definitionId}`
      );
    });
  }

  const additions = new Map<
    string,
    {
      sourceCard: CardInstance;
      enchantName: string;
      targetNames: string[];
    }
  >();

  for (const auraEntry of auraEntries) {
    const enchantDefinition = cardsById[auraEntry.enchantDefinitionId];
    if (!enchantDefinition) {
      continue;
    }

    const targetCards =
      auraEntry.targetMode === "adjacent"
        ? player.field.filter((card) => {
            const fieldIndex = auraEntry.sourceCard.fieldIndex ?? player.field.findIndex((entry) => entry.instanceId === auraEntry.sourceCard.instanceId);
            return Math.abs((card.fieldIndex ?? -1) - fieldIndex) === 1;
          })
        : player.field;

    for (const targetCard of targetCards) {
      const exists = targetCard.enchantments.some(
        (enchantment) =>
          enchantment.definitionId === auraEntry.enchantDefinitionId &&
          enchantment.persistentSourceCardInstanceId === auraEntry.sourceCard.instanceId &&
          enchantment.persistentSourceEffectId === auraEntry.effectId
      );
      if (exists) {
        continue;
      }

      if (
        applyEnchantmentToCard(state, cardsById, auraEntry.sourceCard, targetCard, auraEntry.enchantDefinitionId, {
          suppressLog: true,
          persistentSourceCardInstanceId: auraEntry.sourceCard.instanceId,
          persistentSourceEffectId: auraEntry.effectId
        })
      ) {
        const additionKey = `${auraEntry.sourceCard.instanceId}:${auraEntry.effectId}:${auraEntry.enchantDefinitionId}`;
        const current = additions.get(additionKey) ?? {
          sourceCard: auraEntry.sourceCard,
          enchantName: enchantDefinition.name,
          targetNames: []
        };
        current.targetNames.push(targetCard.name);
        additions.set(additionKey, current);
      }
    }
  }

  syncSelfTransformingPlacedCards(player, cardsById);
  syncPersistentAttributeTransforms(player, cardsById);
  syncHostEnchantNumericModifiers(player, cardsById);
  syncRoundBuffFieldModifiers(player, cardsById);
  syncJammingInvalidations(player);

  if (options?.suppressLogs) {
    return;
  }

  // 常時同期で付くエンチャントはターンログに出さない。
  return;
}

function syncJammingInvalidations(player: PlayerState) {
  for (const card of player.field) {
    if (card.derived?.jammingInvalidated) {
      card.isInvalidated = Boolean(card.derived.preJammingInvalidated);
      const derived = { ...(card.derived ?? {}) };
      delete derived.jammingInvalidated;
      delete derived.preJammingInvalidated;
      card.derived = derived;
    }
  }

  const jammedInstanceIds = new Set<string>();
  for (const sourceCard of player.field) {
    if (sourceCard.isDestroyed) {
      continue;
    }
    if (!sourceCard.enchantments.some((enchantment) => enchantment.definitionId === "enchant_jamming")) {
      continue;
    }
    const leftCard = getRelativeCard(player, sourceCard, "left_1");
    if (leftCard) {
      jammedInstanceIds.add(leftCard.instanceId);
    }
  }

  for (const card of player.field) {
    if (!jammedInstanceIds.has(card.instanceId)) {
      continue;
    }
    const derived = { ...(card.derived ?? {}) };
    derived.preJammingInvalidated = Boolean(card.isInvalidated);
    derived.jammingInvalidated = true;
    card.derived = derived;
    card.isInvalidated = true;
  }
}

function syncRoundBuffFieldModifiers(player: PlayerState, cardsById: Record<string, CardDefinition>) {
  const thunderMultiplier = 1.1 ** getEffectiveRoundBuffCount(player, "round_buff_voltessimo");
  const freezingWindCount = getEffectiveRoundBuffCount(player, "round_buff_freezing_wind");
  const snowEnchantDefinition = cardsById.enchant_kirameku_yukigeshiki;

  for (const card of player.field) {
    const desiredSnowEnchantCount = card.attribute === "ice" ? freezingWindCount : 0;
    const existingSnowEnchants = card.enchantments.filter((enchantment) =>
      enchantment.persistentSourceCardInstanceId?.startsWith("round_buff:freezing_wind:")
    );

    if (existingSnowEnchants.length > desiredSnowEnchantCount) {
      let remaining = existingSnowEnchants.length - desiredSnowEnchantCount;
      card.enchantments = card.enchantments.filter((enchantment) => {
        if (remaining <= 0) {
          return true;
        }
        if (!enchantment.persistentSourceCardInstanceId?.startsWith("round_buff:freezing_wind:")) {
          return true;
        }
        remaining -= 1;
        return false;
      });
    } else if (existingSnowEnchants.length < desiredSnowEnchantCount && snowEnchantDefinition) {
      for (let index = existingSnowEnchants.length; index < desiredSnowEnchantCount; index += 1) {
        const persistentSourceId = `round_buff:freezing_wind:${index}`;
        card.enchantments.push({
          instanceId: createId("enchant"),
          definitionId: snowEnchantDefinition.id,
          name: snowEnchantDefinition.name,
          effects: snowEnchantDefinition.effects,
          persistentSourceCardInstanceId: persistentSourceId,
          persistentSourceEffectId: persistentSourceId
        });
      }
    }

    const snowMultiplier = desiredSnowEnchantCount > 0 ? 2 ** desiredSnowEnchantCount : 1;
    const derived = { ...(card.derived ?? {}) };
    const appliedThunderMultiplier = card.attribute === "thunder" ? thunderMultiplier : 1;
    const totalMultiplier = appliedThunderMultiplier * snowMultiplier;
    if (totalMultiplier !== 1) {
      derived.roundBuffNumericValueMultiplier = totalMultiplier;
    } else {
      delete derived.roundBuffNumericValueMultiplier;
    }
    card.derived = derived;
  }
}

function applyRoleRoundInvalidations(state: LocalGameState, player: PlayerState) {
  if (player.roleId !== "role_balance") {
    return;
  }

  for (const card of player.field) {
    if ((card.type === "attack" || card.type === "spell") && !card.isInvalidated) {
      card.isInvalidated = true;
      addReplay(state, {
        type: "CARD_INVALIDATED",
        playerId: player.playerId,
        instanceId: card.instanceId
      });
      addLog(state, {
        level: "info",
        code: "CARD_INVALIDATED",
        message: `${card.name} は［バランス］の効果でこのラウンド無効になりました。`
      });
    }
  }
}

function resolveChosenTokenInsertIndexes(
  placementOrderRaw: string | undefined,
  currentFieldIds: string[],
  count: number
) {
  if (!placementOrderRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(placementOrderRaw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const existingIdSet = new Set(currentFieldIds);
    const insertIndexes: number[] = [];
    let existingSeen = 0;
    let placeholdersSeen = 0;

    for (const entry of parsed) {
      if (typeof entry !== "string") {
        continue;
      }
      if (existingIdSet.has(entry)) {
        existingSeen += 1;
      } else {
        insertIndexes.push(existingSeen + placeholdersSeen);
        placeholdersSeen += 1;
      }
    }

    return insertIndexes.length === count ? insertIndexes : null;
  } catch {
    return null;
  }
}

function createTokenCards(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  resolvingCard: CardInstance,
  effectId: string,
  targetSelections: Record<string, string>,
  tokenDefinitionId: string,
  count: number,
  position: "right_of_self" | "chosen_positions"
) {
  const tokenDefinition = cardsById[tokenDefinitionId];
  if (!tokenDefinition) {
    return;
  }

  const defaultInsertIndex =
    (resolvingCard.fieldIndex ?? player.field.findIndex((card) => card.instanceId === resolvingCard.instanceId)) + 1;
  const chosenInsertIndexes =
    position === "chosen_positions"
      ? resolveChosenTokenInsertIndexes(
          targetSelections[getTokenPlacementSelectionKey(effectId, tokenDefinitionId)],
          player.field.map((card) => card.instanceId),
          count
        )
      : null;

  for (let index = 0; index < count; index += 1) {
    const tokenCard = buildCardInstance(tokenDefinition, player.playerId, Date.now() + index);
    tokenCard.zone = "field";
    const insertIndex =
      chosenInsertIndexes?.[index] ??
      (position === "chosen_positions" ? Math.max(defaultInsertIndex, player.field.length) : defaultInsertIndex + index);
    player.field.splice(insertIndex, 0, tokenCard);
    assignFieldIndexes(player);
    applyRoleRoundInvalidations(state, player);
    if (getMainTiming(tokenDefinition) === "activate" || getMainTiming(tokenDefinition) === "consume") {
      queueActivationByFieldOrder(state, player, tokenCard);
    }
    addReplay(state, {
      type: "CARD_CREATED",
      playerId: player.playerId,
      instanceId: tokenCard.instanceId,
      definitionId: tokenCard.definitionId,
      fieldIndex: tokenCard.fieldIndex ?? insertIndex
    });
    addLog(state, {
      level: "info",
      code: "CARD_CREATED",
      message: `${resolvingCard.name}: ${tokenCard.name} を場に作成しました。`
    });
    dispatchPlacedTrigger(state, player, cardsById, {
      kind: "on_enter_field",
      enteredCard: tokenCard
    });
  }

  syncPersistentPlacedAuras(state, player, cardsById);
  runFieldStateChecks(state, player, cardsById);
}

function createRandomPositionTokenCards(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  resolvingCard: CardInstance,
  tokenDefinitionId: string,
  minCount: number,
  maxCount: number,
  effectId: string
) {
  const tokenDefinition = cardsById[tokenDefinitionId];
  if (!tokenDefinition) {
    return;
  }

  const random = createRng(
    `${state.rngSeed}:random_token:${state.round}:${effectId}:${state.pendingResolution?.activationCount ?? 0}`
  );
  const countRange = Math.max(0, maxCount - minCount);
  const count = minCount + Math.floor(random() * (countRange + 1));

  for (let index = 0; index < count; index += 1) {
    const tokenCard = buildCardInstance(tokenDefinition, player.playerId, Date.now() + index);
    tokenCard.zone = "field";
    const insertIndex = Math.floor(random() * (player.field.length + 1));
    player.field.splice(insertIndex, 0, tokenCard);
    assignFieldIndexes(player);
    applyRoleRoundInvalidations(state, player);
    if (getMainTiming(tokenDefinition) === "activate" || getMainTiming(tokenDefinition) === "consume") {
      queueActivationByFieldOrder(state, player, tokenCard);
    }
    addReplay(state, {
      type: "CARD_CREATED",
      playerId: player.playerId,
      instanceId: tokenCard.instanceId,
      definitionId: tokenCard.definitionId,
      fieldIndex: tokenCard.fieldIndex ?? insertIndex
    });
    addLog(state, {
      level: "info",
      code: "CARD_CREATED",
      message: `${resolvingCard.name}: ${tokenCard.name} を場に作成しました。`
    });
    dispatchPlacedTrigger(state, player, cardsById, {
      kind: "on_enter_field",
      enteredCard: tokenCard
    });
  }

  syncPersistentPlacedAuras(state, player, cardsById);
  runFieldStateChecks(state, player, cardsById);
}

function applyFutureChainMultipliers(context: ResolutionContext) {
  const pending = getChainState(context.state);
  const currentAttribute = getEffectiveCardAttribute(context.resolvingCard);
  const previousAttribute = pending.lastResolvedAttribute;
  if (!previousAttribute) {
    return;
  }

  const before = snapshotPlayerStats(context.player);
  let applied = false;
  for (const chainEffect of pending.futureChainMultipliers) {
    if (pending.activationCount <= chainEffect.startsAfterActivation) {
      continue;
    }

    const shouldApply =
      chainEffect.mode === "same"
        ? currentAttribute === previousAttribute
        : currentAttribute === chainEffect.attribute && previousAttribute === chainEffect.attribute;

    if (!shouldApply) {
      continue;
    }

    context.player.tempAttack = floorValue(context.player.tempAttack * chainEffect.value);
    context.player.tempMagic = floorValue(context.player.tempMagic * chainEffect.value);
    applied = true;
    addLog(context.state, {
      level: "info",
      code: "CHAIN_MULTIPLIER_APPLIED",
      message: `${context.resolvingCard.name}: 連続発動補正で一時ステータスを ×${formatLogNumber(chainEffect.value)} にしました。`
    });
  }

  if (applied) {
    addStatDeltaLog(context.state, context.resolvingCard, "連続補正", before, snapshotPlayerStats(context.player), {
      sourceKind: "card",
      sourceName: context.resolvingCard.name,
      preferMultiplier: true
    });
    pushStatusReplay(context.state, context.player);
  }
}

function applyRolePreActivationEffect(context: ResolutionContext) {
  if (context.player.roleId !== "role_finale" || context.state.round !== 5) {
    return;
  }
  const before = snapshotPlayerStats(context.player);
  context.player.tempAttack = floorValue(context.player.tempAttack * 2);
  context.player.tempMagic = floorValue(context.player.tempMagic * 2);
  addLog(context.state, {
    level: "info",
    code: "ROLE_FINALE",
    message: "フィナーレの効果で一時ステータスを2倍にしました。"
  });
  addStatDeltaLog(context.state, context.resolvingCard, "役職補正", before, snapshotPlayerStats(context.player), {
    sourceKind: "card",
    sourceName: context.resolvingCard.name,
    preferMultiplier: true
  });
  pushStatusReplay(context.state, context.player);
}

function applyRoleAfterActivationEffects(context: ResolutionContext) {
  const role = getRoleDefinitionMap(context.state.roleCatalog)[context.player.roleId];
  if (!role) {
    return;
  }

  for (const effect of role.passiveEffects) {
    if (effect.trigger?.kind !== "after_card_activates") {
      continue;
    }

    const before = snapshotPlayerStats(context.player);
    let applied = false;
    for (const operation of effect.operations) {
      if (operation.kind === "multiply_base_both") {
        context.player.baseAttack = floorValue(context.player.baseAttack * operation.value);
        context.player.baseMagic = floorValue(context.player.baseMagic * operation.value);
        context.player.tempAttack = floorValue(context.player.tempAttack * operation.value);
        context.player.tempMagic = floorValue(context.player.tempMagic * operation.value);
        applied = true;
      }
    }

    if (!applied) {
      continue;
    }

    addLog(context.state, {
      level: "info",
      code: "ROLE_PASSIVE_APPLIED",
      message: `${role.name} の効果で基礎ステータスが強化されました。`
    });
    addStatDeltaLog(context.state, context.resolvingCard, "役職補正", before, snapshotPlayerStats(context.player), {
      sourceKind: "card",
      sourceName: role.name,
      preferMultiplier: true
    });
    pushStatusReplay(context.state, context.player);
  }
}

function applyRoleRoundStartEffects(state: LocalGameState, player: PlayerState, role: RoleDefinition) {
  for (const effect of role.passiveEffects) {
    if (effect.trigger?.kind !== "at_next_round_start") {
      continue;
    }

    for (const operation of effect.operations) {
      if (operation.kind === "add_draw_attribute_weight") {
        player.drawAttributeWeights = {
          ...player.drawAttributeWeights,
          [operation.attribute]: (player.drawAttributeWeights[operation.attribute] ?? 0) + operation.value
        };
        addLog(state, {
          level: "info",
          code: "ROLE_DRAW_WEIGHT_UP",
          message: `${role.name} の効果で ${operation.attribute} 属性の出現度が ${formatLogNumber(operation.value)} 上がりました。`
        });
      }
    }
  }

  if (role.id === "role_dolphin") {
    const waterCount = player.field.filter((card) => card.attribute === "water").length;
    const multiplierCount = Math.floor(waterCount / 3);
    if (multiplierCount > 0) {
      const multiplier = 2 ** multiplierCount;
      player.tempAttack = floorValue(player.tempAttack * multiplier);
      player.tempMagic = floorValue(player.tempMagic * multiplier);
      addLog(state, {
        level: "info",
        code: "ROLE_DOLPHIN_ROUND_START",
        message: `ドルフィンの効果で、水カード ${waterCount} 枚ぶん一時ステータスを ×${formatLogNumber(multiplier)} にしました。`
      });
      pushStatusReplay(state, player);
    }
  }
}

function executeHostEnchantmentEffects(
  context: ResolutionContext,
  triggerKind: "when_host_card_activates" | "when_host_card_additionally_activates" | "before_host_damage_calculation"
) {
  for (const enchantment of [...context.resolvingCard.enchantments]) {
    const enchantContext: ResolutionContext = {
      ...context,
      activeEnchantment: enchantment
    };
    runCardEffects(
      enchantment.effects.filter(
        (effect) =>
          effect.timing === "enchant" &&
          effect.trigger?.kind === triggerKind &&
          !context.activationTask.skippedReactiveEffectIds.includes(effect.id)
      ),
      enchantContext,
      null
    );
  }
}

function dealDamage(
  context: ResolutionContext,
  calculateAmount: () => number,
  sourceLabel: "一時攻撃" | "一時魔法" | "最大一時ステータス" | "効果"
) {
  executeHostEnchantmentEffects(context, "before_host_damage_calculation");
  const amount = calculateAmount();
  let event: Extract<TriggerEvent, { kind: "before_damage_dealt" }> = {
    kind: "before_damage_dealt",
    sourceCard: context.resolvingCard,
    activationTask: context.activationTask,
    pendingDamage: amount
  };
  event = dispatchPlacedTrigger(context.state, context.player, context.cardsById, event) as Extract<
    TriggerEvent,
    { kind: "before_damage_dealt" }
  >;

  const finalAmount = floorDamageValue(event.pendingDamage);
  context.player.scoreThisRound += finalAmount;
  context.player.totalScore += finalAmount;
  addReplay(context.state, {
    type: "DAMAGE_DEALT",
    playerId: context.player.playerId,
    amount: finalAmount,
    source: context.resolvingCard.definitionId
  });
  addLog(context.state, {
    level: "info",
    code: "DAMAGE_DEALT",
    message: `${context.resolvingCard.name}: ${sourceLabel} で ${formatLogNumber(finalAmount)} ダメージ`
  });
  pushStatusReplay(context.state, context.player);

  dispatchPlacedTrigger(context.state, context.player, context.cardsById, {
    kind: "after_damage_dealt",
    sourceCard: context.resolvingCard,
    activationTask: context.activationTask,
    damageAmount: finalAmount
  });

  resolveImmediateAdditionalActivations(context.state, context.player, context.cardsById);
}

function resolveImmediateAdditionalActivations(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>
) {
  if (!state.pendingResolution) {
    return;
  }

  const previousResolvingInstanceId = state.pendingResolution.currentResolvingInstanceId;
  let keepCurrentResolvingCard = false;

  while (state.pendingResolution.cursor < state.pendingResolution.queue.length) {
    const activationTask = state.pendingResolution.queue[state.pendingResolution.cursor];
    if (!activationTask?.isAdditional) {
      break;
    }

    const resolvingCard = findCardByInstanceId(player, activationTask.instanceId);
    if (!resolvingCard) {
      state.pendingResolution.cursor += 1;
      continue;
    }
    if (isCardSealed(player, resolvingCard, cardsById)) {
      addLog(state, {
        level: "info",
        code: "CARD_SKIPPED_SEALED",
        message: `${resolvingCard.name} は封印中のためスキップしました。`
      });
      state.pendingResolution.cursor += 1;
      continue;
    }

    state.pendingResolution.currentResolvingInstanceId = resolvingCard.instanceId;
    const targetKeys = getCurrentResolutionTargetKeys(state);
    if (targetKeys.length > 0) {
      keepCurrentResolvingCard = true;
      break;
    }

    state.pendingResolution.cursor += 1;
    resolveSingleCard(state, player, cardsById, activationTask, {});
  }

  if (!keepCurrentResolvingCard && state.pendingResolution) {
    state.pendingResolution.currentResolvingInstanceId = previousResolvingInstanceId;
  }
}

function resolveOperation(
  operation: OperationDefinition,
  context: ResolutionContext,
  effectId: string,
  event: TriggerEvent | null
) {
  ensureLoopGuard(context.state, context.resolvingCard.name);
  const { player, state, resolvingCard, cardsById } = context;
  const before = snapshotPlayerStats(player);
  const scaledValue =
    "value" in operation && typeof operation.value === "number"
      ? context.activeEnchantment
        ? operation.value + getHostEnchantNumericBonus(resolvingCard)
        : getScaledValue(operation.value, resolvingCard)
      : null;
  const scaledProbabilityValue =
    "value" in operation && typeof operation.value === "number"
      ? context.activeEnchantment
        ? operation.value
        : getScaledProbabilityValue(operation.value, resolvingCard)
      : null;

  switch (operation.kind) {
    case "chance_percent":
      if (rollChancePercent(state, context, effectId, scaledProbabilityValue!)) {
        for (const nestedOperation of operation.operations) {
          event = resolveOperation(nestedOperation, context, effectId, event);
        }
      }
      break;
    case "add_base_attack":
      player.baseAttack += scaledValue!;
      player.tempAttack += scaledValue!;
      break;
    case "add_base_magic":
      player.baseMagic += scaledValue!;
      player.tempMagic += scaledValue!;
      break;
    case "add_base_both":
      player.baseAttack += scaledValue!;
      player.baseMagic += scaledValue!;
      player.tempAttack += scaledValue!;
      player.tempMagic += scaledValue!;
      break;
    case "add_base_attack_per_ally_field_card_count": {
      const amount = scaledValue! * player.field.length;
      player.baseAttack += amount;
      player.tempAttack += amount;
      break;
    }
    case "add_base_both_per_ally_field_card_count": {
      const amount = scaledValue! * player.field.length;
      player.baseAttack += amount;
      player.baseMagic += amount;
      player.tempAttack += amount;
      player.tempMagic += amount;
      break;
    }
    case "add_base_magic_per_last_removed_enchant_count": {
      const amount = context.lastRemovedEnchantCount * scaledValue!;
      player.baseMagic += amount;
      player.tempMagic += amount;
      break;
    }
    case "add_next_round_draw_bonus":
      player.nextRoundDrawBonus += scaledValue!;
      addLog(state, {
        level: "info",
        code: "NEXT_ROUND_DRAW_BONUS",
        message: `${resolvingCard.name}: 次のラウンドの手札補充枚数が ${formatLogNumber(scaledValue!)} 増えました。`
      });
      break;
    case "add_self_enchant_numeric_bonus":
      break;
    case "add_self_numeric_counter": {
      const counterValue = scaledValue!;
      resolvingCard.counters = {
        ...(resolvingCard.counters ?? {}),
        [operation.counter]: (resolvingCard.counters?.[operation.counter] ?? 0) + counterValue
      };
      addLog(state, {
        level: "info",
        code: "CARD_COUNTER_UPDATED",
        message: `${resolvingCard.name}: 数値が ${formatSignedLogNumber(counterValue)} 変化しました。`
      });
      break;
    }
    case "add_self_numeric_counter_per_connected_attribute_count": {
      const connectedCount = countConnectedAttributeCards(player, resolvingCard, operation.attribute);
      if (connectedCount <= 0) {
        break;
      }
      const counterValue = connectedCount * scaledValue!;
      resolvingCard.counters = {
        ...(resolvingCard.counters ?? {}),
        [operation.counter]: (resolvingCard.counters?.[operation.counter] ?? 0) + counterValue
      };
      addLog(state, {
        level: "info",
        code: "CARD_COUNTER_UPDATED",
        message: `${resolvingCard.name}: 連結 ${connectedCount} 枚ぶん数値が ${formatSignedLogNumber(counterValue)} 変化しました。`
      });
      break;
    }
    case "multiply_temp_attack":
      player.tempAttack = floorValue(player.tempAttack * scaledValue!);
      break;
    case "multiply_temp_magic":
      player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      break;
    case "multiply_temp_both":
      player.tempAttack = floorValue(player.tempAttack * scaledValue!);
      player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      break;
    case "multiply_temp_both_by_self_numeric_value": {
      const multiplier = scaledValue!;
      player.tempAttack = floorValue(player.tempAttack * multiplier);
      player.tempMagic = floorValue(player.tempMagic * multiplier);
      break;
    }
    case "multiply_base_magic":
      player.baseMagic = floorValue(player.baseMagic * scaledValue!);
      player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      break;
    case "multiply_base_both":
      player.baseAttack = floorValue(player.baseAttack * scaledValue!);
      player.baseMagic = floorValue(player.baseMagic * scaledValue!);
      player.tempAttack = floorValue(player.tempAttack * scaledValue!);
      player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      break;
    case "multiply_base_both_if_last_destroy_succeeded":
      if (context.lastDestroySucceeded) {
        player.baseAttack = floorValue(player.baseAttack * scaledValue!);
        player.baseMagic = floorValue(player.baseMagic * scaledValue!);
        player.tempAttack = floorValue(player.tempAttack * scaledValue!);
        player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      }
      break;
    case "multiply_pending_damage":
      if (event?.kind === "before_damage_dealt") {
        event.pendingDamage = floorValue(event.pendingDamage * scaledValue!);
      }
      break;
    case "multiply_self_numeric_counters": {
      const multiplier = scaledValue!;
      resolvingCard.counters = Object.fromEntries(
        Object.entries(resolvingCard.counters ?? {}).map(([key, value]) => [key, floorValue(value * multiplier)])
      );
      resolvingCard.derived = {
        ...(resolvingCard.derived ?? {}),
        numericValueMultiplier: floorValue(getNumericMultiplier(resolvingCard) * multiplier)
      };
      addLog(state, {
        level: "info",
        code: "CARD_COUNTER_UPDATED",
        message: `${resolvingCard.name}: カード数値を ×${formatLogNumber(multiplier)} にしました。`
      });
      break;
    }
    case "multiply_temp_attack_per_last_invalidated_count": {
      for (let count = 0; count < context.lastInvalidatedCount; count += 1) {
        player.tempAttack = floorValue(player.tempAttack * scaledValue!);
      }
      break;
    }
    case "multiply_temp_magic_per_last_destroy_count": {
      for (let count = 0; count < context.lastDestroyCount; count += 1) {
        player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      }
      break;
    }
    case "multiply_temp_magic_per_connected_attribute_count": {
      const connectedCount = countConnectedAttributeCards(player, resolvingCard, operation.attribute);
      for (let count = 0; count < connectedCount; count += 1) {
        player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      }
      break;
    }
    case "multiply_temp_magic_per_self_enchant_count": {
      for (let count = 0; count < resolvingCard.enchantments.length; count += 1) {
        player.tempMagic = floorValue(player.tempMagic * scaledValue!);
      }
      break;
    }
    case "multiply_base_attack_per_connected_enchanted_count": {
      const connectedCount = countConnectedEnchantedCards(player, resolvingCard);
      for (let count = 0; count < connectedCount; count += 1) {
        player.baseAttack = floorValue(player.baseAttack * scaledValue!);
        player.tempAttack = floorValue(player.tempAttack * scaledValue!);
      }
      break;
    }
    case "multiply_base_both_and_add_reduction_to_self_numeric": {
      const multiplier = operation.value;
      const previousBaseAttack = player.baseAttack;
      const previousBaseMagic = player.baseMagic;
      const nextBaseAttack = floorValue(player.baseAttack * multiplier);
      const nextBaseMagic = floorValue(player.baseMagic * multiplier);
      const reducedAmount = previousBaseAttack - nextBaseAttack + (previousBaseMagic - nextBaseMagic);
      player.baseAttack = nextBaseAttack;
      player.baseMagic = nextBaseMagic;
      player.tempAttack = floorValue(player.tempAttack * multiplier);
      player.tempMagic = floorValue(player.tempMagic * multiplier);
      if (reducedAmount > 0) {
        resolvingCard.counters = {
          ...(resolvingCard.counters ?? {}),
          cold_reaction_gain: (resolvingCard.counters?.cold_reaction_gain ?? 0) + reducedAmount
        };
        addLog(state, {
          level: "info",
          code: "CARD_COUNTER_UPDATED",
          message: `${resolvingCard.name}: 減少した基礎ステータス ${formatLogNumber(reducedAmount)} をカード数値に加算しました。`
        });
      }
      break;
    }
    case "scale_self_numeric_value": {
      if (scaleCardNumericValue(cardsById, resolvingCard, operation.value)) {
        addLog(state, {
          level: "info",
          code: "CARD_COUNTER_UPDATED",
          message: `${resolvingCard.name}: カード数値を ×${formatLogNumber(operation.value)} にしました。`
        });
      }
      break;
    }
    case "set_self_numeric_value": {
      if (setCardNumericValue(cardsById, resolvingCard, operation.value)) {
        addLog(state, {
          level: "info",
          code: "CARD_COUNTER_UPDATED",
          message: `${resolvingCard.name}: カード数値を ${formatLogNumber(operation.value)} にしました。`
        });
      }
      break;
    }
    case "scale_target_probability_values": {
      const target =
        operation.target === "self"
          ? resolvingCard
          : player.field.find((card) => card.instanceId === context.targetSelections[operation.kind]);
      if (target) {
        target.derived = {
          ...(target.derived ?? {}),
          probabilityValueMultiplier: floorValue(getProbabilityValueMultiplier(target) * operation.value)
        };
        addLog(state, {
          level: "info",
          code: "CARD_COUNTER_UPDATED",
          message: `${target.name}: 確率数値を ×${formatLogNumber(operation.value)} にしました。`
        });
      }
      break;
    }
    case "deal_damage_from_temp_attack":
      dealDamage(context, () => player.tempAttack, "一時攻撃");
      break;
    case "deal_damage_from_temp_attack_fraction":
      dealDamage(context, () => floorValue(player.tempAttack * scaledValue!), "一時攻撃");
      break;
    case "deal_damage_from_ally_field_definition_count_multiplier": {
      const count = player.field.filter((card) => card.definitionId === operation.definitionId).length;
      dealDamage(context, () => floorValue(count * scaledValue!), "効果");
      break;
    }
    case "deal_damage_from_temp_magic":
      dealDamage(context, () => player.tempMagic, "一時魔法");
      break;
    case "deal_damage_from_max_temp_stat":
      dealDamage(context, () => Math.max(player.tempAttack, player.tempMagic), "最大一時ステータス");
      break;
    case "destroy_target": {
      const targetKey = operation.target === "self" ? resolvingCard.instanceId : context.targetSelections.destroy_target;
      const target =
        operation.target === "self" ? resolvingCard : player.field.find((card) => card.instanceId === targetKey);
      context.lastDestroyCount = 0;
      context.lastDestroySucceeded = false;
      if (target && destroyCard(state, player, cardsById, target, resolvingCard, context.activationTask)) {
        context.lastDestroySucceeded = true;
        context.lastDestroyCount = 1;
      }
      break;
    }
    case "destroy_relative_card": {
      const target = getRelativeCard(player, resolvingCard, operation.relativePosition);
      context.lastDestroyCount = 0;
      context.lastDestroySucceeded = false;
      if (target && destroyCard(state, player, cardsById, target, resolvingCard, context.activationTask)) {
        context.lastDestroySucceeded = true;
        context.lastDestroyCount = 1;
      }
      break;
    }
    case "destroy_all_other_cards_on_own_field": {
      const targets = player.field.filter((card) => card.instanceId !== resolvingCard.instanceId);
      let destroyedCount = 0;
      for (const target of targets) {
        if (destroyCard(state, player, cardsById, target, resolvingCard, context.activationTask)) {
          destroyedCount += 1;
        }
      }
      context.lastDestroySucceeded = destroyedCount > 0;
      context.lastDestroyCount = destroyedCount;
      break;
    }
    case "destroy_all_self_enchantments":
      context.lastRemovedEnchantCount = resolvingCard.enchantments.length;
      resolvingCard.enchantments = [];
      if (context.lastRemovedEnchantCount > 0) {
        addLog(state, {
          level: "info",
          code: "ENCHANT_DESTROYED",
          message: `${resolvingCard.name}: ${context.lastRemovedEnchantCount} 個のエンチャントを破壊しました。`
        });
      }
      break;
    case "destroy_self":
      context.lastDestroySucceeded = destroyCard(state, player, cardsById, resolvingCard, resolvingCard, context.activationTask);
      context.lastDestroyCount = context.lastDestroySucceeded ? 1 : 0;
      break;
    case "invalidate_relative_card": {
      const target = getRelativeCard(player, resolvingCard, operation.relativePosition);
      if (target && !target.isInvalidated) {
        target.isInvalidated = true;
        addReplay(state, { type: "CARD_INVALIDATED", playerId: player.playerId, instanceId: target.instanceId });
        addLog(state, {
          level: "info",
          code: "CARD_INVALIDATED",
          message: `${target.name} が無効化されました。`
        });
      }
      break;
    }
    case "destroy_each_ally_field_card_with_chance": {
      let destroyedCount = 0;
      for (const target of [...player.field]) {
        const targetContext: ResolutionContext = {
          ...context,
          resolvingCard: target,
          activeEnchantment: null
        };
        if (!rollChancePercent(state, targetContext, effectId, scaledProbabilityValue!)) {
          continue;
        }
        if (destroyCard(state, player, cardsById, target, resolvingCard, context.activationTask)) {
          destroyedCount += 1;
        }
      }
      context.lastDestroyCount = destroyedCount;
      context.lastDestroySucceeded = destroyedCount > 0;
      break;
    }
    case "invalidate_all_right_cards": {
      const sourceIndex = resolvingCard.fieldIndex ?? player.field.findIndex((card) => card.instanceId === resolvingCard.instanceId);
      let invalidatedCount = 0;
      const invalidatedCardInstanceIds: string[] = [];
      for (let index = sourceIndex + 1; index < player.field.length; index += 1) {
        const target = player.field[index];
        if (target && !target.isInvalidated) {
          target.isInvalidated = true;
          invalidatedCount += 1;
          invalidatedCardInstanceIds.push(target.instanceId);
          addReplay(state, { type: "CARD_INVALIDATED", playerId: player.playerId, instanceId: target.instanceId });
          addLog(state, {
            level: "info",
            code: "CARD_INVALIDATED",
            message: `${resolvingCard.name}: ${target.name} をこのラウンド無効にしました。`
          });
        }
      }
      context.lastInvalidatedCount = invalidatedCount;
      context.lastInvalidatedCardInstanceIds = invalidatedCardInstanceIds;
      break;
    }
    case "invalidate_cards_with_attribute_different_from_previous": {
      const previousAttribute = state.pendingResolution?.previousResolvedAttribute;
      context.lastInvalidatedCount = 0;
      context.lastInvalidatedCardInstanceIds = [];
      if (!previousAttribute) {
        break;
      }
      for (const target of player.field) {
        if (
          target.instanceId === resolvingCard.instanceId ||
          getEffectiveCardAttribute(target) === previousAttribute ||
          target.isInvalidated
        ) {
          continue;
        }
        target.isInvalidated = true;
        context.lastInvalidatedCount += 1;
        context.lastInvalidatedCardInstanceIds.push(target.instanceId);
        addReplay(state, { type: "CARD_INVALIDATED", playerId: player.playerId, instanceId: target.instanceId });
        addLog(state, {
          level: "info",
          code: "CARD_INVALIDATED",
          message: `${resolvingCard.name}: ${target.name} をこのラウンド無効にしました。`
        });
      }
      break;
    }
    case "trigger_round_end_effects_of_last_invalidated_cards": {
      triggerRoundEndEffectsForCards(state, player, cardsById, context.lastInvalidatedCardInstanceIds, resolvingCard);
      break;
    }
    case "apply_enchant": {
      const target =
        operation.target === "self"
          ? resolvingCard
          : player.field.find((card) => card.instanceId === context.targetSelections.apply_enchant);
      if (target) {
        applyEnchantmentToCard(state, cardsById, resolvingCard, target, operation.enchantDefinitionId);
      }
      break;
    }
    case "apply_enchant_to_all_ally_field_cards": {
      if (event?.kind === "on_enter_field" || event?.kind === "on_field_state_check") {
        syncPersistentPlacedAuras(state, player, cardsById, {
          sourceCardInstanceId: resolvingCard.instanceId
        });
        break;
      }

      const enchantDefinition = cardsById[operation.enchantDefinitionId];
      const targets = [...player.field];

      let appliedCount = 0;
      for (const target of targets) {
        if (
          applyEnchantmentToCard(state, cardsById, resolvingCard, target, operation.enchantDefinitionId, {
            suppressLog: true
          })
        ) {
          appliedCount += 1;
        }
      }

      if (enchantDefinition && appliedCount > 0) {
        addLog(state, {
          level: "info",
          code: "ENCHANT_APPLIED",
          message:
            appliedCount === 1 && targets[0]
              ? `${resolvingCard.name}: ${targets[0].name} に ${enchantDefinition.name} を付与しました。`
              : `${resolvingCard.name}: 場の ${appliedCount} 枚に ${enchantDefinition.name} をまとめて付与しました。`
        });
      }
      break;
    }
    case "apply_enchant_to_adjacent_cards": {
      if (event?.kind === "on_enter_field" || event?.kind === "on_field_state_check") {
        syncPersistentPlacedAuras(state, player, cardsById, {
          sourceCardInstanceId: resolvingCard.instanceId
        });
      }
      break;
    }
    case "create_token":
      createTokenCards(
        state,
        player,
        cardsById,
        resolvingCard,
        effectId,
        context.targetSelections,
        operation.tokenDefinitionId,
        operation.count,
        operation.position
      );
      break;
    case "create_token_random_count_random_positions":
      createRandomPositionTokenCards(
        state,
        player,
        cardsById,
        resolvingCard,
        operation.tokenDefinitionId,
        operation.minCount,
        operation.maxCount,
        effectId
      );
      break;
    case "merge_adjacent_same_definition_cards": {
      const leftCard = getRelativeCard(player, resolvingCard, "left_1");
      const rightCard = getRelativeCard(player, resolvingCard, "right_1");
      const mergeDefinition = cardsById[operation.definitionId];
      const mergeBaseValue = mergeDefinition ? getFirstNumericOperationBaseValue(mergeDefinition) : null;
      const applyMergedNumericValue = (targetCard: CardInstance, sourceCard: CardInstance) => {
        if (mergeBaseValue === null || mergeBaseValue === 0) {
          targetCard.counters = mergeCounters(targetCard, sourceCard);
          targetCard.derived = {
            ...(targetCard.derived ?? {}),
            numericValueMultiplier: getNumericMultiplier(targetCard) * getNumericMultiplier(sourceCard)
          };
          return;
        }

        const mergedValue = floorValue(getScaledValue(mergeBaseValue, targetCard) * getScaledValue(mergeBaseValue, sourceCard));
        const preservedCounters = Object.fromEntries(
          Object.entries(targetCard.counters ?? {}).filter(([key]) => key.startsWith("round_triggered_"))
        );
        targetCard.counters = {
          ...preservedCounters,
          merge_numeric: mergedValue - mergeBaseValue
        };
        targetCard.derived = {
          ...(targetCard.derived ?? {}),
          numericValueMultiplier: 1
        };
      };
      if (leftCard?.definitionId === operation.definitionId) {
        applyMergedNumericValue(leftCard, resolvingCard);
        destroyCard(state, player, cardsById, resolvingCard, resolvingCard, context.activationTask);
      } else if (rightCard?.definitionId === operation.definitionId) {
        applyMergedNumericValue(resolvingCard, rightCard);
        destroyCard(state, player, cardsById, rightCard, resolvingCard, context.activationTask);
      }
      break;
    }
    case "queue_additional_activation_for_leftmost_ally_field_card": {
      const target = player.field[0];
      if (target) {
        queueAdditionalActivation(state, player, resolvingCard, target.instanceId, effectId, "左端追加発動");
      }
      break;
    }
    case "queue_additional_activation_for_all_ally_field_cards":
      for (const target of player.field) {
        queueAdditionalActivation(state, player, resolvingCard, target.instanceId, effectId, "全体追加発動");
      }
      break;
    case "queue_additional_activation_for_relative_card": {
      const target = getRelativeCard(player, resolvingCard, operation.relativePosition);
      if (target) {
        queueAdditionalActivation(state, player, resolvingCard, target.instanceId, effectId, "相対追加発動");
      }
      break;
    }
    case "queue_random_additional_activations_excluding_self": {
      const candidates = player.field.filter((card) => card.instanceId !== resolvingCard.instanceId);
      const random = createRng(`${state.rngSeed}:random_additional:${state.round}:${effectId}:${state.pendingResolution?.activationCount ?? 0}`);
      const shuffled = [...candidates];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      for (const target of shuffled.slice(0, operation.count)) {
        queueAdditionalActivation(state, player, resolvingCard, target.instanceId, effectId, "ランダム追加発動");
      }
      break;
    }
    case "queue_additional_activation_for_self":
      queueAdditionalActivation(state, player, resolvingCard, resolvingCard.instanceId, effectId, "自己誘発");
      break;
    case "queue_additional_activation_for_source_card":
      if (event && "sourceCard" in event && event.sourceCard) {
        queueAdditionalActivation(state, player, resolvingCard, event.sourceCard.instanceId, effectId, "元カード追加発動");
      }
      break;
    case "register_future_same_attribute_chain_multiplier":
      getChainState(state).futureChainMultipliers.push({
        id: createId("chain"),
        mode: "same",
        value: scaledValue!,
        startsAfterActivation: getChainState(state).activationCount
      });
      break;
    case "register_future_specific_attribute_chain_multiplier":
      getChainState(state).futureChainMultipliers.push({
        id: createId("chain"),
        mode: "specific",
        attribute: operation.attribute,
        value: scaledValue!,
        startsAfterActivation: getChainState(state).activationCount
      });
      break;
    case "remove_self_enchant":
      if (context.activeEnchantment) {
        resolvingCard.enchantments = resolvingCard.enchantments.filter(
          (enchantment) => enchantment.instanceId !== context.activeEnchantment?.instanceId
        );
      }
      break;
    case "repeat_embedded_operation":
      for (let repeatIndex = 0; repeatIndex < operation.count; repeatIndex += 1) {
        for (const embeddedOperation of operation.operations) {
          event = resolveOperation(embeddedOperation, context, effectId, event);
        }
      }
      break;
    case "repeat_previous_round_last_effect_as_self": {
      const previousDefinition = getReferencedPreviousRoundEffectDefinition(player, cardsById);
      if (!previousDefinition) {
        addLog(state, {
          level: "info",
          code: "REWIND_SKIPPED",
          message: `${resolvingCard.name}: 前のラウンドに最後に発動したカードがないため何も起きませんでした。`
        });
        break;
      }

      const previousMainTiming = getMainTiming(previousDefinition);
      addLog(state, {
        level: "info",
        code: "REWIND_APPLIED",
        message: `${resolvingCard.name}: 前のラウンド最後に発動した ${previousDefinition.name} の効果をこのカードの効果として扱います。`
      });
      runCardEffects(
        previousDefinition.effects.filter((effect) => effect.timing === previousMainTiming),
        context,
        null
      );
      break;
    }
    case "schedule_add_base_both_at_next_round_start":
      player.scheduledNextRoundBaseBothBonus += scaledValue!;
      addLog(state, {
        level: "info",
        code: "SCHEDULED_EFFECT",
        message: `${resolvingCard.name}: 次ラウンド開始時の基礎ステータス増加を予約しました。`
      });
      break;
    case "schedule_host_revive_at_round_end":
      state.scheduledRoundEndRevives.push({
        card: structuredClone(resolvingCard),
        fieldIndex: typeof resolvingCard.derived?.reviveFieldIndex === "number" ? (resolvingCard.derived.reviveFieldIndex as number) : player.field.length
      });
      addLog(state, {
        level: "info",
        code: "SCHEDULED_EFFECT",
        message: `${resolvingCard.name}: ラウンド終了時の復活を予約しました。`
      });
      break;
    case "schedule_source_card_revive_at_round_end":
      if (event && "sourceCard" in event && event.sourceCard) {
        state.scheduledRoundEndRevives.push({
          card: structuredClone(event.sourceCard),
          fieldIndex:
            typeof event.sourceCard.derived?.reviveFieldIndex === "number"
              ? (event.sourceCard.derived.reviveFieldIndex as number)
              : player.field.length
        });
        addLog(state, {
          level: "info",
          code: "SCHEDULED_EFFECT",
          message: `${event.sourceCard.name}: ラウンド終了時の復活を予約しました。`
        });
      }
      break;
    case "set_activating_card_attribute_to_previous_attribute": {
      const previousAttribute = state.pendingResolution?.lastResolvedAttribute;
      if (previousAttribute) {
        setActivationOverride(resolvingCard, previousAttribute);
        addLog(state, {
          level: "info",
          code: "ATTRIBUTE_CHANGED",
          message: `${resolvingCard.name}: 今回の発動属性を ${previousAttribute} に変更しました。`
        });
      }
      break;
    }
    case "transform_self_to_definition": {
      const nextDefinition = cardsById[operation.definitionId];
      if (!nextDefinition) {
        break;
      }
      const previousName = resolvingCard.name;
      resolvingCard.definitionId = nextDefinition.id;
      resolvingCard.name = nextDefinition.name;
      resolvingCard.type = nextDefinition.type;
      resolvingCard.attribute = nextDefinition.attribute;
      resolvingCard.text = nextDefinition.text;
      addLog(state, {
        level: "info",
        code: "CARD_TRANSFORMED",
        message: `${previousName}: ${nextDefinition.name} に変化しました。`
      });
      break;
    }
    case "transform_all_non_attribute_allies_to_attribute":
      syncPersistentPlacedAuras(state, player, cardsById, { suppressLogs: true, sourceCardInstanceId: resolvingCard.instanceId });
      break;
    case "set_pending_damage_to_zero":
      if (event?.kind === "before_damage_dealt") {
        event.pendingDamage = 0;
      }
      break;
    case "multiply_final_attack":
      player.finalAttackMultiplier = floorValue(player.finalAttackMultiplier * scaledValue!);
      addLog(state, {
        level: "info",
        code: "FINAL_ATTACK_MODIFIED",
        message: `${resolvingCard.name}: 最終攻撃を ×${formatLogNumber(scaledValue!)} にしました。`
      });
      break;
    case "set_final_attack_to_zero":
      player.finalAttackForcedZero = true;
      addLog(state, {
        level: "info",
        code: "FINAL_ATTACK_MODIFIED",
        message: `${resolvingCard.name}: 最終攻撃を 0 にしました。`
      });
      break;
    case "gamble_total_score_double_or_zero": {
      const random = createRng(
        `${state.rngSeed}:total_score_gamble:${state.round}:${effectId}:${state.pendingResolution?.activationCount ?? 0}:${state.chanceRollCount}`
      );
      state.chanceRollCount += 1;
      const won = random() < 0.5;
      if (won) {
        player.totalScore = floorValue(player.totalScore * 2);
      } else {
        player.totalScore = 0;
      }
      addLog(state, {
        level: "info",
        code: "TOTAL_SCORE_MODIFIED",
        message: `${resolvingCard.name}: ${won ? "闇のギャンブル成功で合計得点を ×2 にしました。" : "闇のギャンブル失敗で合計得点を 0 にしました。"}`
      });
      break;
    }
    case "set_round_placement_limit":
      player.roundPlacementLimit = scaledValue!;
      break;
  }

  const after = snapshotPlayerStats(player);
  const operationLabelMap: Record<OperationDefinition["kind"], string> = {
    chance_percent: "確率効果",
    add_base_attack: "基礎攻撃変化",
    add_base_magic: "基礎魔法変化",
    add_base_both: "基礎ステータス変化",
    add_draw_attribute_weight: "属性出現度変化",
    add_base_attack_per_ally_field_card_count: "場参照の基礎攻撃変化",
    add_base_both_per_ally_field_card_count: "場参照の基礎ステータス変化",
    add_base_magic_per_last_removed_enchant_count: "エンチャント破壊参照の基礎魔法変化",
    add_next_round_draw_bonus: "次ラウンド補充枚数変化",
    add_self_enchant_numeric_bonus: "エンチャント数値変化",
    add_self_numeric_counter: "カード数値変化",
    add_self_numeric_counter_per_connected_attribute_count: "連結参照のカード数値変化",
    multiply_temp_attack: "一時攻撃変化",
    multiply_temp_magic: "一時魔法変化",
    multiply_temp_both: "一時ステータス変化",
    multiply_temp_both_by_self_numeric_value: "カード数値参照の一時ステータス変化",
    multiply_base_magic: "基礎魔法倍化",
    multiply_base_both: "基礎ステータス倍化",
    multiply_base_both_if_last_destroy_succeeded: "破壊成功時の強化",
    multiply_pending_damage: "ダメージ補正",
    multiply_self_numeric_counters: "カード数値倍化",
    multiply_temp_attack_per_last_invalidated_count: "無効化参照の一時攻撃変化",
    multiply_temp_magic_per_last_destroy_count: "破壊参照の一時魔法変化",
    multiply_temp_magic_per_connected_attribute_count: "連結参照の一時魔法変化",
    multiply_temp_magic_per_self_enchant_count: "エンチャント参照の一時魔法変化",
    multiply_base_attack_per_connected_enchanted_count: "連結エンチャント参照の基礎攻撃変化",
    multiply_base_both_and_add_reduction_to_self_numeric: "基礎ステータス減衰変化",
    scale_self_numeric_value: "カード数値倍率変化",
    set_self_numeric_value: "カード数値設定",
    scale_target_probability_values: "確率数値変化",
    deal_damage_from_temp_attack: "攻撃ダメージ",
    deal_damage_from_temp_attack_fraction: "分割攻撃ダメージ",
    deal_damage_from_ally_field_definition_count_multiplier: "カード数参照ダメージ",
    deal_damage_from_temp_magic: "魔法ダメージ",
    deal_damage_from_max_temp_stat: "最大ステータスダメージ",
    destroy_target: "破壊",
    destroy_relative_card: "相対破壊",
    destroy_all_other_cards_on_own_field: "全体破壊",
    destroy_all_self_enchantments: "エンチャント全破壊",
    destroy_self: "自壊",
    destroy_each_ally_field_card_with_chance: "確率破壊",
    invalidate_relative_card: "相対無効",
    invalidate_all_right_cards: "右側無効",
    invalidate_cards_with_attribute_different_from_previous: "直前属性比較無効",
    trigger_round_end_effects_of_last_invalidated_cards: "無効化カードの終了時効果発動",
    apply_enchant: "付与",
    apply_enchant_to_all_ally_field_cards: "全体付与",
    apply_enchant_to_adjacent_cards: "両隣付与",
    create_token: "生成",
    create_token_random_count_random_positions: "ランダム生成",
    merge_adjacent_same_definition_cards: "融合",
    queue_additional_activation_for_leftmost_ally_field_card: "左端追加発動",
    queue_additional_activation_for_all_ally_field_cards: "全体追加発動",
    queue_additional_activation_for_relative_card: "相対追加発動",
    queue_random_additional_activations_excluding_self: "ランダム追加発動",
    queue_additional_activation_for_self: "自己誘発",
    queue_additional_activation_for_source_card: "元カード追加発動",
    register_future_same_attribute_chain_multiplier: "連続発動予約",
    register_future_specific_attribute_chain_multiplier: "属性連続予約",
    remove_self_enchant: "エンチャント除去",
    repeat_embedded_operation: "複数回発動",
    repeat_previous_round_last_effect_as_self: "前ラウンド効果再現",
    schedule_add_base_both_at_next_round_start: "次ラウンド予約",
    schedule_host_revive_at_round_end: "復活予約",
    schedule_source_card_revive_at_round_end: "元カード復活予約",
    set_activating_card_attribute_to_previous_attribute: "属性変化",
    transform_self_to_definition: "自己変化",
    transform_all_non_attribute_allies_to_attribute: "属性変換",
    set_pending_damage_to_zero: "ダメージ無効化",
    multiply_final_attack: "最終攻撃補正",
    set_final_attack_to_zero: "最終攻撃無効化",
    gamble_total_score_double_or_zero: "合計得点ギャンブル",
    set_round_placement_limit: "配置上限変化"
  };

  addStatDeltaLog(state, resolvingCard, operationLabelMap[operation.kind], before, after, {
    sourceKind: context.activeEnchantment ? "enchant" : "card",
    sourceName: context.activeEnchantment?.name ?? resolvingCard.name,
    preferMultiplier: operation.kind.startsWith("multiply_")
  });
  pushStatusReplay(state, player);
  return event;
}

function mergeCounters(primary: CardInstance, secondary: CardInstance) {
  const keys = new Set([...Object.keys(primary.counters ?? {}), ...Object.keys(secondary.counters ?? {})]);
  const merged: Record<string, number> = {};
  for (const key of keys) {
    const leftValue = primary.counters?.[key] ?? 1;
    const rightValue = secondary.counters?.[key] ?? 1;
    merged[key] = floorValue(leftValue * rightValue);
  }
  return merged;
}

function dispatchPlacedTrigger(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  event: TriggerEvent
) {
  const fieldSnapshot = [...player.field];
  for (const listenerCard of fieldSnapshot) {
    const currentCard = player.field.find((card) => card.instanceId === listenerCard.instanceId);
    if (!currentCard) {
      continue;
    }

    for (const effect of cardsById[currentCard.definitionId]?.effects ?? []) {
      if (effect.timing !== "placed") {
        continue;
      }
      if (!shouldRunTriggeredEffect(state, currentCard, effect, event)) {
        continue;
      }
      const triggerContext: ResolutionContext = {
        state,
        player,
        cardsById,
        resolvingCard: currentCard,
        activationTask:
          "activationTask" in event && event.activationTask
            ? event.activationTask
            : { instanceId: currentCard.instanceId, skippedReactiveEffectIds: [] },
        targetSelections: {},
        activeEnchantment: null,
        lastDestroySucceeded: false,
        lastDestroyCount: 0,
        lastRemovedEnchantCount: 0,
        lastInvalidatedCount: 0,
        lastInvalidatedCardInstanceIds: []
      };
      event = runCardEffects([effect], triggerContext, event) as TriggerEvent;
      if (typeof effect.roundTriggerLimit === "number") {
        markRoundTriggered(currentCard, effect.id);
      }
    }
  }
  return event;
}

function triggerRoundEndEffectsForCard(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  card: CardInstance
) {
  const definition = cardsById[card.definitionId];
  if (!definition) {
    return;
  }

  const roundEndEffects = definition.effects.filter(
    (effect) => effect.timing === "placed" && effect.trigger?.kind === "at_round_end"
  );
  if (roundEndEffects.length === 0) {
    return;
  }

  const triggerContext: ResolutionContext = {
    state,
    player,
    cardsById,
    resolvingCard: card,
    activationTask: { instanceId: card.instanceId, skippedReactiveEffectIds: [] },
    targetSelections: {},
    activeEnchantment: null,
    lastDestroySucceeded: false,
    lastDestroyCount: 0,
    lastRemovedEnchantCount: 0,
    lastInvalidatedCount: 0,
    lastInvalidatedCardInstanceIds: []
  };

  runCardEffects(roundEndEffects, triggerContext, { kind: "at_round_end" });
}

function triggerRoundEndEffectsForCards(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  instanceIds: string[],
  sourceCard: CardInstance
) {
  const targets = instanceIds
    .map((instanceId) => player.field.find((card) => card.instanceId === instanceId))
    .filter((card): card is CardInstance => Boolean(card));

  if (targets.length === 0) {
    return;
  }

  addLog(state, {
    level: "info",
    code: "ROUND_END_EFFECTS_TRIGGERED",
    message: `${sourceCard.name}: 右側の ${targets.length} 枚のラウンド終了時効果を即時発動しました。`
  });

  for (const target of targets) {
    triggerRoundEndEffectsForCard(state, player, cardsById, target);
  }
}

function runFieldStateChecks(state: LocalGameState, player: PlayerState, cardsById: Record<string, CardDefinition>) {
  let changed = true;
  let guard = 0;
  while (changed && guard < 20) {
    changed = false;
    guard += 1;
    const snapshot = [...player.field];
    for (const card of snapshot) {
      const current = player.field.find((entry) => entry.instanceId === card.instanceId);
      if (!current) {
        continue;
      }
      const beforeLength = player.field.length;
      dispatchPlacedTrigger(state, player, cardsById, {
        kind: "on_field_state_check",
        subjectCard: current
      });
      if (player.field.length !== beforeLength) {
        changed = true;
        break;
      }
    }
  }
}

function cleanupConsumeCard(context: ResolutionContext, definition: CardDefinition) {
  if (getMainTiming(definition) !== "consume") {
    return;
  }

  const targetCard = context.player.field.find((card) => card.instanceId === context.resolvingCard.instanceId);
  if (!targetCard) {
    return;
  }

  context.player.field = context.player.field.filter((card) => card.instanceId !== targetCard.instanceId);
  assignFieldIndexes(context.player);
  targetCard.isConsumed = true;

  const destination = definition.consumeBehavior ?? "discard";
  if (destination === "removed") {
    moveCard(targetCard, "removed", context.player.removed);
  } else if (destination === "stay") {
    context.player.field.push(targetCard);
    assignFieldIndexes(context.player);
  } else {
    moveCard(targetCard, "discard", context.player.discard);
  }

  syncPersistentPlacedAuras(context.state, context.player, context.cardsById, { suppressLogs: true });
}

function temporarilyRestoreConsumedCardForActivation(
  state: LocalGameState,
  player: PlayerState,
  card: CardInstance
) {
  const destinationZone = card.zone;
  if (destinationZone !== "discard" && destinationZone !== "removed") {
    return false;
  }

  if (destinationZone === "discard") {
    player.discard = player.discard.filter((entry) => entry.instanceId !== card.instanceId);
  } else {
    player.removed = player.removed.filter((entry) => entry.instanceId !== card.instanceId);
  }

  const reviveIndexRaw = card.derived?.reviveFieldIndex;
  const reviveIndex = typeof reviveIndexRaw === "number" ? reviveIndexRaw : player.field.length;
  const insertIndex = Math.min(Math.max(reviveIndex, 0), player.field.length);
  card.zone = "field";
  card.isConsumed = false;
  player.field.splice(insertIndex, 0, card);
  assignFieldIndexes(player);
  syncPersistentPlacedAuras(state, player, getCardDefinitionMap(state.cardCatalog), { suppressLogs: true });

  addLog(state, {
    level: "info",
    code: "CARD_RESTORED_FOR_REACTIVATION",
    message: `${card.name} を一時的に場へ戻して再発動します。`
  });
  return true;
}

function computeFinalAttackFromValues(roleId: string, tempAttack: number, tempMagic: number) {
  if (roleId === "role_balance") {
    const average = floorValue((tempAttack + tempMagic) / 2);
    return {
      amount: average * average,
      sourceLabel: "平均化した一時ステータス"
    };
  }

  if (tempAttack > tempMagic) {
    return {
      amount: tempAttack,
      sourceLabel: "一時攻撃"
    };
  }

  if (tempMagic > tempAttack) {
    return {
      amount: tempMagic,
      sourceLabel: "一時魔法"
    };
  }

  return {
    amount: tempAttack,
    sourceLabel: "一時攻撃/一時魔法"
  };
}

function computeFinalAttack(state: LocalGameState, player: PlayerState) {
  if (player.roleId === "role_blaze" && player.roundDestroyedCardCount > 0) {
    const multiplier = 5 ** player.roundDestroyedCardCount;
    addLog(state, {
      level: "info",
      code: "ROLE_BLAZE_FINAL",
      message: `ブレイズの効果で、そのラウンド中に破壊された ${player.roundDestroyedCardCount} 枚ぶん最終攻撃前の一時ステータスを ×${formatLogNumber(multiplier)} にしました。`
    });
    const computed = computeFinalAttackFromValues(
      player.roleId,
      floorValue(player.tempAttack * multiplier),
      floorValue(player.tempMagic * multiplier)
    );
    computed.amount = player.finalAttackForcedZero ? 0 : floorValue(computed.amount * player.finalAttackMultiplier);
    return computed;
  }

  const computed = computeFinalAttackFromValues(player.roleId, player.tempAttack, player.tempMagic);
  computed.amount = player.finalAttackForcedZero ? 0 : floorValue(computed.amount * player.finalAttackMultiplier);
  return computed;
}

function cloneCardForDuplication(sourceCard: CardInstance) {
  const duplicatedCard = structuredClone(sourceCard);
  duplicatedCard.instanceId = createId("card");
  duplicatedCard.zone = "field";
  duplicatedCard.fieldIndex = undefined;
  duplicatedCard.isDestroyed = false;
  duplicatedCard.isConsumed = false;
  duplicatedCard.isInvalidated = false;
  if (duplicatedCard.derived) {
    delete duplicatedCard.derived.reviveFieldIndex;
  }
  duplicatedCard.enchantments = duplicatedCard.enchantments.map((enchantment) => ({
    ...enchantment,
    instanceId: createId("enchant")
  }));
  return duplicatedCard;
}

function completeRoundAfterResolution(state: LocalGameState, player: PlayerState, cardsById: Record<string, CardDefinition>) {
  const finalAttack = computeFinalAttack(state, player);
  const finalAttackAmount = floorDamageValue(finalAttack.amount);
  player.scoreThisRound += finalAttackAmount;
  player.totalScore += finalAttackAmount;
  addReplay(state, { type: "FINAL_ATTACK", playerId: player.playerId, amount: finalAttackAmount });
  addLog(state, {
    level: "info",
    code: "FINAL_ATTACK",
    message: `最終攻撃: ${finalAttack.sourceLabel} で ${formatLogNumber(finalAttackAmount)} ダメージ`
  });
  clearRoundInvalidations(player);
  applyRoundEndEffects(state, player, cardsById);
  state.pendingResolution = null;
  state.pendingFinalAction = null;
  state.phase = "round_end";
}

function validatePlacementIds(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  rolesById: Record<string, RoleDefinition>,
  nextPlacementIds: string[]
) {
  if (state.phase !== "input") {
    throw new Error("現在は入力フェーズではありません。");
  }

  const role = rolesById[player.roleId];
  const restrictedTypes = role.restrictions?.disallowCardTypes ?? [];

  const placementLimit = getEffectiveRoundPlacementLimit(player);
  if (nextPlacementIds.length > placementLimit) {
    throw new Error(`このラウンドでは ${placementLimit} 枚までしか配置できません。`);
  }

  const placementIdSet = new Set<string>();
  for (const handInstanceId of nextPlacementIds) {
    if (placementIdSet.has(handInstanceId)) {
      throw new Error("同じカードを複数回配置できません。");
    }
    placementIdSet.add(handInstanceId);

    const handCard = player.hand.find((card) => card.instanceId === handInstanceId);
    if (!handCard) {
      throw new Error("手札に存在しないカードが選ばれています。");
    }

    if (restrictedTypes.includes(handCard.type)) {
      throw new Error(`${handCard.name} はこの役職では配置できません。`);
    }
    if (!cardsById[handCard.definitionId]) {
      throw new Error(`${handCard.name} の定義が見つかりません。`);
    }
  }
}

function applyMulligan(state: LocalGameState, player: PlayerState, mulliganInstanceIds: string[]) {
  if (mulliganInstanceIds.length === 0) {
    return;
  }

  if (player.oncePerRound.mulliganUsed) {
    throw new Error("このラウンドではすでに手札交換を使っています。");
  }

  const returningCards: CardInstance[] = [];
  for (const instanceId of mulliganInstanceIds) {
    const card = player.hand.find((entry) => entry.instanceId === instanceId);
    if (!card) {
      throw new Error("交換対象に手札以外のカードが含まれています。");
    }
    player.hand = player.hand.filter((entry) => entry.instanceId !== instanceId);
    card.zone = "deck";
    returningCards.push(card);
  }

  player.deck = shuffle([...player.deck, ...returningCards], `${state.rngSeed}:${state.round}:mulligan`);
  player.oncePerRound.mulliganUsed = true;
  addLog(state, {
    level: "info",
    code: "MULLIGAN_USED",
    message: `${returningCards.length} 枚を交換しました。`
  });
  drawUpToHandSize(state, player, getEffectiveRoundHandSize(player));
}

function updateChainState(state: LocalGameState, card: CardInstance) {
  const pending = getChainState(state);
  const currentAttribute = getEffectiveCardAttribute(card);
  pending.previousResolvedAttribute = pending.lastResolvedAttribute;
  if (pending.lastResolvedAttribute === currentAttribute) {
    pending.sameAttributeChainCount += 1;
  } else {
    pending.sameAttributeChainCount = 1;
  }
  pending.lastResolvedAttribute = currentAttribute;
}

function resolveSingleCard(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  activationTask: ActivationTask,
  targetSelections: Record<string, string>
) {
  let resolvingCard = findCardByInstanceId(player, activationTask.instanceId);
  if (!resolvingCard) {
    return;
  }

  const definition = cardsById[resolvingCard.definitionId];
  if (
    resolvingCard.zone !== "field" &&
    getMainTiming(definition) === "consume" &&
    resolvingCard.isConsumed
  ) {
    temporarilyRestoreConsumedCardForActivation(state, player, resolvingCard);
    resolvingCard = player.field.find((card) => card.instanceId === activationTask.instanceId) ?? resolvingCard;
  }

  if (resolvingCard.zone !== "field") {
    return;
  }

  if (resolvingCard.isInvalidated) {
    addLog(state, {
      level: "warn",
      code: "CARD_SKIPPED_INVALID",
      message: `${resolvingCard.name} は無効化されているためスキップしました。`
    });
    return;
  }

  if (resolvingCard.isDestroyed) {
    addLog(state, {
      level: "warn",
      code: "CARD_SKIPPED_DESTROYED",
      message: `${resolvingCard.name} は破壊済みのためスキップしました。`
    });
    return;
  }
  if (isCardSealed(player, resolvingCard, cardsById)) {
    addLog(state, {
      level: "info",
      code: "CARD_SKIPPED_SEALED",
      message: `${resolvingCard.name} は封印中のためスキップしました。`
    });
    return;
  }

  const pending = getChainState(state);
  pending.activationCount += 1;

  const context: ResolutionContext = {
    state,
    player,
    cardsById,
    resolvingCard,
    activationTask,
    targetSelections,
    activeEnchantment: null,
    lastDestroySucceeded: false,
    lastDestroyCount: 0,
    lastRemovedEnchantCount: 0,
    lastInvalidatedCount: 0,
    lastInvalidatedCardInstanceIds: []
  };

  dispatchPlacedTrigger(state, player, cardsById, {
    kind: "before_card_activates",
    sourceCard: resolvingCard,
    activationTask
  });
  applyRolePreActivationEffect(context);
    applyFutureChainMultipliers(context);
    updateChainState(state, resolvingCard);
    const activationAttribute = getEffectiveCardAttribute(resolvingCard);
    player.attributeActivationCounts[activationAttribute] = (player.attributeActivationCounts[activationAttribute] ?? 0) + 1;
    advanceSealProgressForActivation(player, cardsById, activationAttribute);

    addReplay(state, {
      type: "CARD_ACTIVATED",
    playerId: player.playerId,
    instanceId: resolvingCard.instanceId,
    attribute: activationAttribute,
    chainCount: pending.sameAttributeChainCount
  });

  const mainTiming = getMainTiming(definition);
  const referencedEffectDefinition = getResolvableCardDefinition(player, resolvingCard, cardsById);
  executeHostEnchantmentEffects(context, "when_host_card_activates");
  if (activationTask.isAdditional) {
    executeHostEnchantmentEffects(context, "when_host_card_additionally_activates");
  }
  runCardEffects(definition.effects.filter((effect) => effect.timing === mainTiming), context, null);
  dispatchPlacedTrigger(state, player, cardsById, {
    kind: "after_card_activates",
    sourceCard: resolvingCard,
    activationTask
  });
  applyRoleAfterActivationEffects(context);
  cleanupConsumeCard(context, definition);
  player.currentRoundLastEffectDefinitionId = isRewindDefinition(definition)
    ? referencedEffectDefinition?.id ?? null
    : definition.id;

  addLog(state, {
    level: "info",
    code: "CARD_ACTIVATED_DONE",
    message: `${resolvingCard.name} の発動が終わりました。`
  });
  clearActivationOverride(resolvingCard);
  syncPersistentPlacedAuras(state, player, cardsById, { suppressLogs: true });
}

function applyRoundEndEffects(state: LocalGameState, player: PlayerState, cardsById: Record<string, CardDefinition>) {
  const hasPlacedRoundEndEffects = player.field.some((card) => {
    const definition = cardsById[card.definitionId];
    return !!definition?.effects.some((effect) => effect.timing === "placed" && effect.trigger?.kind === "at_round_end");
  });
  const hasRoundBuffRoundEndEffects =
    getEffectiveRoundBuffCount(player, "round_buff_tailwind_rush") > 0 &&
    player.field.some((card) => card.attribute === "wind");
  const hasScheduledRevives = state.scheduledRoundEndRevives.length > 0;
  if (hasPlacedRoundEndEffects || hasRoundBuffRoundEndEffects || hasScheduledRevives) {
    addLog(state, {
      level: "info",
      code: "ROUND_END_EFFECTS_TRIGGERED",
      message: "ラウンド終了時効果"
    });
  }
  dispatchPlacedTrigger(state, player, cardsById, { kind: "at_round_end" });

  const revives = [...state.scheduledRoundEndRevives].sort((left, right) => left.fieldIndex - right.fieldIndex);
  state.scheduledRoundEndRevives = [];
  for (const revive of revives) {
    const revivedCard = structuredClone(revive.card);
    revivedCard.isDestroyed = false;
    revivedCard.zone = "field";
    player.discard = player.discard.filter((card) => card.instanceId !== revivedCard.instanceId);
    const insertIndex = Math.min(Math.max(revive.fieldIndex, 0), player.field.length);
    player.field.splice(insertIndex, 0, revivedCard);
    assignFieldIndexes(player);
    addReplay(state, {
      type: "CARD_CREATED",
      playerId: player.playerId,
      instanceId: revivedCard.instanceId,
      definitionId: revivedCard.definitionId,
      fieldIndex: revivedCard.fieldIndex ?? insertIndex
    });
    addLog(state, {
      level: "info",
      code: "CARD_REVIVED",
      message: `${revivedCard.name} がラウンド終了時に復活しました。`
    });
  }
  syncPersistentPlacedAuras(state, player, cardsById);
  applyRoundBuffRoundEndEffects(state, player);
}

function applyRoundBuffRoundEndEffects(state: LocalGameState, player: PlayerState) {
  const windBuffCount = getEffectiveRoundBuffCount(player, "round_buff_tailwind_rush");
  if (windBuffCount <= 0) {
    return;
  }

  const multiplier = 1.3 ** windBuffCount;
  const windCards = player.field.filter((card) => card.attribute === "wind");
  if (windCards.length === 0) {
    return;
  }

  for (const card of windCards) {
    card.derived = {
      ...(card.derived ?? {}),
      numericValueMultiplier: getNumericMultiplier(card) * multiplier / (typeof card.derived?.roundBuffNumericValueMultiplier === "number" ? card.derived.roundBuffNumericValueMultiplier : 1)
    };
  }

  addLog(state, {
    level: "info",
    code: "ROUND_BUFF_APPLIED",
    message: `追い風ラッシュの効果で、場の風属性 ${windCards.length} 枚の数値を ×${formatLogNumber(multiplier)} にしました。`
  });
}

function clearRoundInvalidations(player: PlayerState) {
  for (const card of player.field) {
    card.isInvalidated = false;
    card.isDestroyed = false;
  }
}

function rollRoundBuffOptions(state: LocalGameState, rollIndex: number) {
  const options = state.roundBuffCatalog.map((buff) => buff.id);
  const random = createRng(`${state.rngSeed}:round_buff:${state.round}:${rollIndex}`);
  if (options.length <= 3) {
    const pool = [...options];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool;
  }

  const pool = [...options];
  const picked: string[] = [];
  while (picked.length < 3 && pool.length > 0) {
    const selectedIndex = Math.floor(random() * pool.length);
    const [selected] = pool.splice(selectedIndex, 1);
    if (selected) {
      picked.push(selected);
    }
  }
  return picked;
}

function queueRoundBuffChoice(state: LocalGameState) {
  if (state.roundBuffCatalog.length === 0) {
    state.round += 1;
    state.phase = "input";
    prepareNextRound(state);
    return;
  }

  state.pendingRoundBuffChoice = {
    options: rollRoundBuffOptions(state, 0),
    rerollUsed: false,
    rollIndex: 0
  };
  addLog(state, {
    level: "info",
    code: "ROUND_BUFF_OFFERED",
    message: "ラウンドバフ候補が3つ提示されました。"
  });
}

function prepareNextRound(state: LocalGameState) {
  const player = getPlayer(state);
  const rolesById = getRoleDefinitionMap(state.roleCatalog);
  const cardsById = getCardDefinitionMap(state.cardCatalog);
  const role = rolesById[player.roleId];
  resetRoundStats(player, role);
  addReplay(state, { type: "ROUND_START", round: state.round });
  applyRoleRoundStartEffects(state, player, role);

  if (player.scheduledNextRoundBaseBothBonus > 0) {
    const bonus = player.scheduledNextRoundBaseBothBonus;
    player.baseAttack += bonus;
    player.baseMagic += bonus;
    player.tempAttack += bonus;
    player.tempMagic += bonus;
    player.scheduledNextRoundBaseBothBonus = 0;
    addLog(state, {
      level: "info",
      code: "SCHEDULED_EFFECT_APPLIED",
      message: `予約効果で基礎ステータスが ${formatLogNumber(bonus)} 増えました。`
    });
    pushStatusReplay(state, player);
  }

  const snapshot = [...player.field];
  for (const card of snapshot) {
    const currentCard = player.field.find((entry) => entry.instanceId === card.instanceId);
    if (!currentCard) {
      continue;
    }
    for (const enchantment of [...currentCard.enchantments]) {
      const context: ResolutionContext = {
        state,
        player,
        cardsById,
        resolvingCard: currentCard,
        activationTask: { instanceId: currentCard.instanceId, skippedReactiveEffectIds: [] },
        targetSelections: {},
        activeEnchantment: enchantment,
        lastDestroySucceeded: false,
        lastDestroyCount: 0,
        lastRemovedEnchantCount: 0,
        lastInvalidatedCount: 0,
        lastInvalidatedCardInstanceIds: []
      };
      runCardEffects(
        enchantment.effects.filter((effect) => effect.timing === "enchant" && effect.trigger?.kind === "at_next_round_start"),
        context,
        null
      );
    }
  }

  const handSize = getEffectiveRoundHandSize(player);
  player.nextRoundDrawBonus = 0;
  drawUpToHandSize(state, player, handSize);
  syncRoundBuffFieldModifiers(player, getCardDefinitionMap(state.cardCatalog));
}

export function createLocalGame({ roleId, cards, roles, roundBuffs = [], seed: providedSeed }: CreateLocalGameInput): LocalGameState {
  const role = roles.find((entry) => entry.id === roleId);
  if (!role) {
    throw new Error("指定された役職が見つかりません。");
  }

  const seed = providedSeed && providedSeed.trim().length > 0 ? providedSeed.trim() : createId("seed");
  const deckDefinitions = cards.filter((card) => card.deckEligible !== false);
  const deck = shuffle(
    deckDefinitions.flatMap((definition) =>
      Array.from({ length: 3 }, (_, index) => buildCardInstance(definition, "player_local", index))
    ),
    seed
  );

  const state: LocalGameState = {
    gameId: createId("game"),
    round: 1,
    phase: "input",
    phaseLabel: "入力",
    cardCatalog: cards,
    roleCatalog: roles,
    roundBuffCatalog: roundBuffs,
    chanceRollCount: 0,
    pendingResolution: null,
    pendingFinalAction: null,
    pendingRoundBuffChoice: null,
    scheduledRoundEndRevives: [],
    players: [
      {
        playerId: "player_local",
        displayName: "プレイヤー",
        roleId: role.id,
        selectedRoundBuffs: [],
        drawSequence: 0,
        drawAttributeWeights: {},
        attributeActivationCounts: {},
        roundDestroyedCardCount: 0,
        currentRoundLastEffectDefinitionId: null,
        previousRoundLastEffectDefinitionId: null,
        baseAttack: role.initialBaseAttack,
        baseMagic: role.initialBaseMagic,
        tempAttack: role.initialBaseAttack,
        tempMagic: role.initialBaseMagic,
        hand: [],
        field: [],
        discard: [],
        removed: [],
        deck,
        scoreThisRound: 0,
        totalScore: 0,
        finalAttackMultiplier: 1,
        finalAttackForcedZero: false,
        statusFlags: [],
        roundPlacementLimit: 5,
        nextRoundDrawBonus: 0,
        scheduledNextRoundBaseBothBonus: 0,
        oncePerRound: {
          mulliganUsed: false
        }
      }
    ],
    rngSeed: seed,
    log: [],
    replayEvents: []
  };

  resetRoundStats(state.players[0], role);
  addReplay(state, { type: "ROUND_START", round: 1 });
  applyRoleRoundStartEffects(state, state.players[0], role);
  addLog(state, { level: "info", code: "GAME_CREATED", message: `${role.name} でゲームを開始しました。` });
  drawUpToHandSize(state, state.players[0], 7);
  return withUiState(state);
}

export function applyMulliganOnly(currentState: LocalGameState, mulliganInstanceIds: string[]): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);

  if (state.phase !== "input") {
    throw new Error("現在は交換できません。");
  }

  applyMulligan(state, player, mulliganInstanceIds);
  return withUiState(state);
}

function validateFieldOrder(
  state: LocalGameState,
  player: PlayerState,
  cardsById: Record<string, CardDefinition>,
  rolesById: Record<string, RoleDefinition>,
  orderedFieldIds: string[]
) {
  const currentFieldIds = player.field.map((card) => card.instanceId);
  const currentFieldSet = new Set(currentFieldIds);

  for (const currentFieldId of currentFieldIds) {
    if (!orderedFieldIds.includes(currentFieldId)) {
      throw new Error("既存の場カードが配置順から外れています。");
    }
  }

  const newPlacementIds = orderedFieldIds.filter((instanceId) => !currentFieldSet.has(instanceId));
  validatePlacementIds(state, player, cardsById, rolesById, newPlacementIds);
}

function rebuildFieldByOrder(state: LocalGameState, player: PlayerState, orderedFieldIds: string[]) {
  const fieldMap = new Map(player.field.map((card) => [card.instanceId, card] as const));
  const handMap = new Map(player.hand.map((card) => [card.instanceId, card] as const));
  const nextField: CardInstance[] = [];
  const enteredCards: CardInstance[] = [];

  for (const instanceId of orderedFieldIds) {
    const fieldCard = fieldMap.get(instanceId);
    if (fieldCard) {
      nextField.push(fieldCard);
      continue;
    }

    const handCard = handMap.get(instanceId);
    if (!handCard) {
      throw new Error("配置順に存在しないカードが含まれています。");
    }

    player.hand = player.hand.filter((card) => card.instanceId !== instanceId);
    handCard.zone = "field";
    nextField.push(handCard);
    enteredCards.push(handCard);
    addReplay(state, {
      type: "CARD_CREATED",
      playerId: player.playerId,
      instanceId: handCard.instanceId,
      definitionId: handCard.definitionId,
      fieldIndex: nextField.length - 1
    });
  }

  player.field = nextField;
  assignFieldIndexes(player);
  return enteredCards;
}

export function startRoundResolution(currentState: LocalGameState, orderedFieldIds: string[]): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);
  const cardsById = getCardDefinitionMap(state.cardCatalog);
  const rolesById = getRoleDefinitionMap(state.roleCatalog);

  validateFieldOrder(state, player, cardsById, rolesById, orderedFieldIds);
  const enteredCards = rebuildFieldByOrder(state, player, orderedFieldIds);
  state.pendingResolution = {
    queue: orderedFieldIds.map((instanceId) => ({
      instanceId,
      skippedReactiveEffectIds: [],
      isAdditional: false
    })),
    cursor: 0,
    currentResolvingInstanceId: null,
    activationCount: 0,
    loopGuardCount: 0,
    previousResolvedAttribute: null,
    lastResolvedAttribute: null,
    sameAttributeChainCount: 0,
    futureChainMultipliers: []
  };

  const oneMoreCount = getEffectiveRoundBuffCount(player, "round_buff_one_more");
  const rightmostFieldInstanceId = orderedFieldIds[orderedFieldIds.length - 1];
  if (oneMoreCount > 0 && rightmostFieldInstanceId) {
    for (let index = 0; index < oneMoreCount; index += 1) {
      state.pendingResolution.queue.push({
        instanceId: rightmostFieldInstanceId,
        skippedReactiveEffectIds: [],
        isAdditional: true
      });
    }
    const rightmostCard = player.field.find((card) => card.instanceId === rightmostFieldInstanceId);
    if (rightmostCard) {
      addLog(state, {
        level: "info",
        code: "ROUND_BUFF_ONE_MORE",
        message: `もう一回の効果で、右端の ${rightmostCard.name} が ${oneMoreCount} 回追加発動します。`
      });
    }
  }

  queuePlacedRoundStartAdditionalActivations(state, player, cardsById);

  applyRoleRoundInvalidations(state, player);
  syncPersistentPlacedAuras(state, player, cardsById);

  for (const enteredCard of enteredCards) {
    dispatchPlacedTrigger(state, player, cardsById, {
      kind: "on_enter_field",
      enteredCard
    });
    runFieldStateChecks(state, player, cardsById);
  }

  addLog(state, {
    level: "info",
    code: "RESOLUTION_STARTED",
    message: "ターン開始"
  });
  return withUiState(state);
}

export function getCurrentResolutionCard(currentState: LocalGameState): CardInstance | null {
  if (!currentState.pendingResolution) {
    return null;
  }

  const player = getPlayer(currentState);
  const cardsById = getCardDefinitionMap(currentState.cardCatalog);
  for (let index = currentState.pendingResolution.cursor; index < currentState.pendingResolution.queue.length; index += 1) {
    const instanceId = currentState.pendingResolution.queue[index]?.instanceId;
    if (!instanceId) {
      continue;
    }
    const card = findCardByInstanceId(player, instanceId);
    const definition = card ? cardsById[card.definitionId] : null;
    const canRestoreForConsumeReactivate =
      card &&
      definition &&
      getMainTiming(definition) === "consume" &&
      card.isConsumed &&
      (card.zone === "discard" || card.zone === "removed");
    if (card && !card.isInvalidated && !card.isDestroyed && (card.zone === "field" || canRestoreForConsumeReactivate)) {
      return card;
    }
  }

  return null;
}

export function getCurrentResolutionTargetKeys(currentState: LocalGameState): string[] {
  const card = getCurrentResolutionCard(currentState);
  if (!card) {
    return [];
  }

  const cardsById = getCardDefinitionMap(currentState.cardCatalog);
  const player = getPlayer(currentState);
  if (isCardSealed(player, card, cardsById)) {
    return [];
  }
  const definition = cardsById[card.definitionId];
  const targetDefinition = getResolvableCardDefinition(player, card, cardsById) ?? definition;
  return targetDefinition.effects.flatMap((effect) =>
    effect.operations.flatMap((operation) =>
      "target" in operation && operation.target === "one_ally_field_card" ? [operation.kind] : []
    )
  );
}

export function resolveNextCard(currentState: LocalGameState, targetSelections: Record<string, string> = {}): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);
  const cardsById = getCardDefinitionMap(state.cardCatalog);

  if (!state.pendingResolution) {
    throw new Error("現在はカード発動中ではありません。");
  }

  while (state.pendingResolution.cursor < state.pendingResolution.queue.length) {
    const activationTask = state.pendingResolution.queue[state.pendingResolution.cursor]!;
    state.pendingResolution.cursor += 1;
    const resolvingCard = findCardByInstanceId(player, activationTask.instanceId);
    if (!resolvingCard) {
      continue;
    }
    if (isCardSealed(player, resolvingCard, cardsById)) {
      addLog(state, {
        level: "info",
        code: "CARD_SKIPPED_SEALED",
        message: `${resolvingCard.name} は封印中のためスキップしました。`
      });
      continue;
    }
    state.pendingResolution.currentResolvingInstanceId = resolvingCard.instanceId;

    const requiredTargetKeys = getCurrentResolutionTargetKeys({
      ...state,
      pendingResolution: {
        ...state.pendingResolution,
        cursor: state.pendingResolution.cursor - 1
      }
    });

    for (const targetKey of requiredTargetKeys) {
      if (!targetSelections[targetKey]) {
        throw new Error(`${resolvingCard.name} の対象が未選択です。`);
      }
    }

    resolveSingleCard(state, player, cardsById, activationTask, targetSelections);
    state.pendingResolution.currentResolvingInstanceId = null;
    break;
  }

  if (state.pendingResolution.cursor >= state.pendingResolution.queue.length) {
    state.pendingResolution = null;
    if (player.roleId === "role_dolphin") {
      state.pendingFinalAction = { kind: "dolphin_duplicate" };
      state.phase = "round_end";
      addLog(state, {
        level: "info",
        code: "ROLE_DOLPHIN_FINAL",
        message: "ドルフィンの効果で、最終攻撃の代わりに場のカードを複製します。"
      });
    } else {
      completeRoundAfterResolution(state, player, cardsById);
    }
  }

  return withUiState(state);
}

export function resolvePendingFinalAction(
  currentState: LocalGameState,
  sourceInstanceId: string,
  insertIndex: number
): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);
  const cardsById = getCardDefinitionMap(state.cardCatalog);

  if (!state.pendingFinalAction || state.pendingFinalAction.kind !== "dolphin_duplicate") {
    throw new Error("現在は最終攻撃の追加処理を受け付けていません。");
  }

  const sourceCard = player.field.find((card) => card.instanceId === sourceInstanceId);
  if (!sourceCard) {
    throw new Error("複製元のカードが場にありません。");
  }

  const duplicatedCard = cloneCardForDuplication(sourceCard);
  const clampedInsertIndex = Math.max(0, Math.min(insertIndex, player.field.length));
  player.field.splice(clampedInsertIndex, 0, duplicatedCard);
  assignFieldIndexes(player);

  addReplay(state, {
    type: "CARD_CREATED",
    playerId: player.playerId,
    instanceId: duplicatedCard.instanceId,
    definitionId: duplicatedCard.definitionId,
    fieldIndex: duplicatedCard.fieldIndex ?? clampedInsertIndex
  });
  addLog(state, {
    level: "info",
    code: "ROLE_DOLPHIN_DUPLICATED",
    message: `ドルフィンの効果で ${sourceCard.name} を複製して場に置きました。`
  });

  dispatchPlacedTrigger(state, player, cardsById, {
    kind: "on_enter_field",
    enteredCard: duplicatedCard
  });
  syncPersistentPlacedAuras(state, player, cardsById);
  runFieldStateChecks(state, player, cardsById);
  completeRoundAfterResolution(state, player, cardsById);
  return withUiState(state);
}

export function applyRoundPlan(currentState: LocalGameState, roundPlan: RoundPlanInput): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);
  const cardsById = getCardDefinitionMap(state.cardCatalog);
  const rolesById = getRoleDefinitionMap(state.roleCatalog);

  validatePlacementIds(
    state,
    player,
    cardsById,
    rolesById,
    roundPlan.placements.map((placement) => placement.handInstanceId)
  );
  applyMulligan(state, player, roundPlan.mulliganInstanceIds);
  const existingFieldIds = player.field.map((card) => card.instanceId);
  const orderedFieldIds = [...existingFieldIds];
  const sortedPlacements = [...roundPlan.placements].sort((left, right) => left.order - right.order);
  for (const placement of sortedPlacements) {
    orderedFieldIds.push(placement.handInstanceId);
  }

  let nextState = startRoundResolution(state, orderedFieldIds);
  while (nextState.pendingResolution) {
    const currentCard = getCurrentResolutionCard(nextState);
    if (!currentCard) {
      nextState = resolveNextCard(nextState, {});
      continue;
    }
    const matchingPlacement = sortedPlacements.find((placement) => placement.handInstanceId === currentCard.instanceId);
    nextState = resolveNextCard(nextState, matchingPlacement?.targetSelections ?? {});
  }

  return withUiState(nextState);
}

export function finalizeRound(currentState: LocalGameState, discardIds: string[]): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);

  if (state.phase !== "round_end") {
    throw new Error("現在はラウンド終了処理を受け付けていません。");
  }

  const requiredDiscardCount = Math.min(2, player.field.length);
  if (discardIds.length !== requiredDiscardCount) {
    throw new Error(`場から ${requiredDiscardCount} 枚選んでください。`);
  }

  for (const discardId of discardIds) {
    const target = player.field.find((card) => card.instanceId === discardId);
    if (!target) {
      throw new Error("場に存在しないカードが選ばれています。");
    }

    player.field = player.field.filter((card) => card.instanceId !== discardId);
    moveCard(target, "discard", player.discard);
  }

  assignFieldIndexes(player);
  syncPersistentPlacedAuras(state, player, getCardDefinitionMap(state.cardCatalog), { suppressLogs: true });
  addReplay(state, { type: "ROUND_END", round: state.round });
  addLog(state, {
    level: "info",
    code: "ROUND_END",
    message: `ラウンド ${state.round} を終了しました。`
  });
  player.previousRoundLastEffectDefinitionId = player.currentRoundLastEffectDefinitionId;

  if (state.round >= 5) {
    state.phase = "finished";
    addLog(state, { level: "info", code: "GAME_FINISHED", message: "5ラウンドが終了しました。" });
    return withUiState(state);
  }

  queueRoundBuffChoice(state);
  return withUiState(state);
}

export function rerollRoundBuffChoice(currentState: LocalGameState): LocalGameState {
  const state = cloneGame(currentState);
  if (!state.pendingRoundBuffChoice) {
    throw new Error("現在はラウンドバフをリロールできません。");
  }
  if (state.pendingRoundBuffChoice.rerollUsed) {
    throw new Error("このラウンドではすでにリロール済みです。");
  }

  const nextRollIndex = state.pendingRoundBuffChoice.rollIndex + 1;
  state.pendingRoundBuffChoice = {
    options: rollRoundBuffOptions(state, nextRollIndex),
    rerollUsed: true,
    rollIndex: nextRollIndex
  };
  addLog(state, {
    level: "info",
    code: "ROUND_BUFF_REROLLED",
    message: "ラウンドバフ候補を1回リロールしました。"
  });
  return withUiState(state);
}

export function chooseRoundBuff(currentState: LocalGameState, optionIndex: number): LocalGameState {
  const state = cloneGame(currentState);
  const player = getPlayer(state);
  if (!state.pendingRoundBuffChoice) {
    throw new Error("現在はラウンドバフを選択できません。");
  }

  const buffId = state.pendingRoundBuffChoice.options[optionIndex];
  const buff = getRoundBuffMap(state)[buffId];
  if (!buff) {
    throw new Error("選択したラウンドバフが見つかりません。");
  }

  player.selectedRoundBuffs.push({
    instanceId: createId("round_buff"),
    buffId
  });
  state.pendingRoundBuffChoice = null;
  addLog(state, {
    level: "info",
    code: "ROUND_BUFF_SELECTED",
    message: `ラウンドバフ「${buff.name}」を獲得しました。`
  });

  state.round += 1;
  state.phase = "input";
  prepareNextRound(state);
  return withUiState(state);
}
