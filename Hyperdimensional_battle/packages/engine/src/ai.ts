import type { CardInstance, SubmittedPlacement, SubmittedRoundData } from "@hyperdimensional-battle/shared";
import {
  getCurrentResolutionCard,
  getCurrentResolutionTargetCandidateIds,
  getCurrentResolutionTargetKeys,
  resolveNextCard,
  resolvePendingFinalAction,
  startRoundResolution,
  type LocalGameState
} from "./index";

export type AiLevel = "easy" | "normal" | "advanced" | "expert";

export type AiRoundDecision = {
  level: AiLevel;
  plan: SubmittedRoundData;
  projectedRoundScore: number;
  evaluatedPlans: number;
  orderedFieldInstanceIds: string[];
  targetSelectionsByInstanceId: Record<string, Record<string, string>>;
};

export type AiPlanningProgress = {
  processedPlans: number;
  totalPlans: number;
  percent: number;
};

type ScoredPlan = {
  placements: SubmittedPlacement[];
  score: number;
  orderedFieldInstanceIds: string[];
  targetSelectionsByInstanceId: Record<string, Record<string, string>>;
};

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function createDeterministicRandom(seed: string) {
  let state = hash(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function* combinations<T>(items: T[], size: number, start = 0, selected: T[] = []): Generator<T[]> {
  if (selected.length === size) {
    yield [...selected];
    return;
  }
  for (let index = start; index <= items.length - (size - selected.length); index += 1) {
    selected.push(items[index]!);
    yield* combinations(items, size, index + 1, selected);
    selected.pop();
  }
}

function* permutations<T>(items: T[], prefix: T[] = []): Generator<T[]> {
  if (items.length === 0) {
    yield prefix;
    return;
  }
  for (let index = 0; index < items.length; index += 1) {
    yield* permutations([...items.slice(0, index), ...items.slice(index + 1)], [...prefix, items[index]!]);
  }
}

function factorial(value: number) {
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) {
    result = Math.min(Number.MAX_SAFE_INTEGER, result * factor);
  }
  return result;
}

function combinationCount(total: number, selected: number) {
  if (selected < 0 || selected > total) return 0;
  let result = 1;
  for (let index = 1; index <= Math.min(selected, total - selected); index += 1) {
    result = Math.min(Number.MAX_SAFE_INTEGER, result * (total - index + 1) / index);
  }
  return result;
}

function countOrderedFieldCandidates(state: LocalGameState, reorderExisting: boolean) {
  const handCount = getEligibleHandCards(state).length;
  const fieldCount = state.players[0]!.field.length;
  let total = 0;
  for (let selected = 0; selected <= handCount; selected += 1) {
    const orderCount = reorderExisting ? factorial(fieldCount + selected) : factorial(selected);
    total = Math.min(Number.MAX_SAFE_INTEGER, total + combinationCount(handCount, selected) * orderCount);
  }
  return total;
}

function getEligibleHandCards(state: LocalGameState) {
  const player = state.players[0]!;
  const role = state.roleCatalog.find((entry) => entry.id === player.roleId);
  const disallowed = new Set(role?.restrictions?.disallowCardTypes ?? []);
  return player.hand.filter((card) => !disallowed.has(card.type));
}

function* orderedFieldCandidates(state: LocalGameState, reorderExisting: boolean): Generator<CardInstance[]> {
  const player = state.players[0]!;
  const eligibleHand = getEligibleHandCards(state);
  // The engine remains the authority for dynamic placement-limit buffs.
  const placementLimit = eligibleHand.length;
  for (let count = 0; count <= placementLimit; count += 1) {
    for (const selected of combinations(eligibleHand, count)) {
      const cards = [...player.field, ...selected];
      if (reorderExisting) {
        yield* permutations(cards);
      } else {
        for (const orderedNewCards of permutations(selected)) {
          yield [...player.field, ...orderedNewCards];
        }
      }
    }
  }
}

function targetAssignments(keys: string[], candidates: string[]) {
  let assignments: Record<string, string>[] = [{}];
  for (const key of [...new Set(keys)]) {
    assignments = assignments.flatMap((assignment) =>
      candidates.map((candidate) => ({ ...assignment, [key]: candidate }))
    );
  }
  return assignments;
}

function resolveBestOutcome(state: LocalGameState): { state: LocalGameState; targets: Map<string, Record<string, string>> } {
  if (!state.pendingResolution) {
    if (state.pendingFinalAction?.kind === "dolphin_duplicate") {
      const player = state.players[0]!;
      let best: LocalGameState | null = null;
      for (const source of player.field) {
        for (let insertIndex = 0; insertIndex <= player.field.length; insertIndex += 1) {
          const candidate = resolvePendingFinalAction(state, source.instanceId, insertIndex);
          if (!best || candidate.players[0]!.scoreThisRound > best.players[0]!.scoreThisRound) {
            best = candidate;
          }
        }
      }
      return { state: best ?? state, targets: new Map() };
    }
    return { state, targets: new Map() };
  }

  const card = getCurrentResolutionCard(state);
  const keys = getCurrentResolutionTargetKeys(state);
  const candidateIds = getCurrentResolutionTargetCandidateIds(state);
  const assignments = keys.length > 0 ? targetAssignments(keys, candidateIds) : [{}];
  let best: ReturnType<typeof resolveBestOutcome> | null = null;

  for (const assignment of assignments) {
    try {
      const outcome = resolveBestOutcome(resolveNextCard(state, assignment));
      if (!best || outcome.state.players[0]!.scoreThisRound > best.state.players[0]!.scoreThisRound) {
        const targets = new Map(outcome.targets);
        if (card && Object.keys(assignment).length > 0) {
          targets.set(card.instanceId, assignment);
        }
        best = { state: outcome.state, targets };
      }
    } catch {
      // Some effects reject themselves or an already removed card as a target.
    }
  }
  if (!best) {
    throw new Error("AI could not find a valid target for the current effect.");
  }
  return best;
}

function evaluateOrder(state: LocalGameState, orderedCards: CardInstance[]): ScoredPlan | null {
  try {
    const outcome = resolveBestOutcome(startRoundResolution(state, orderedCards.map((card) => card.instanceId)));
    const handIds = new Set(state.players[0]!.hand.map((card) => card.instanceId));
    const placements = orderedCards
      .filter((card) => handIds.has(card.instanceId))
      .map((card, order) => ({
        handInstanceId: card.instanceId,
        order,
        targetSelections: outcome.targets.get(card.instanceId)
      }));
    return {
      placements,
      score: outcome.state.players[0]!.scoreThisRound,
      orderedFieldInstanceIds: orderedCards.map((card) => card.instanceId),
      targetSelectionsByInstanceId: Object.fromEntries(outcome.targets)
    };
  } catch {
    return null;
  }
}

/** Chooses a legal round plan using the same engine that resolves player turns. */
export function planAiRound(
  state: LocalGameState,
  level: AiLevel = "normal",
  onProgress?: (progress: AiPlanningProgress) => void
): AiRoundDecision {
  if (state.phase !== "input") {
    throw new Error("AI can only plan during the input phase.");
  }

  const random = createDeterministicRandom(`${state.rngSeed}:ai:${state.round}:${level}`);
  const advancedBudget = 384;
  const sampleLimit = level === "easy" ? 1 : level === "normal" ? 96 : level === "advanced" ? advancedBudget : Number.POSITIVE_INFINITY;
  const candidateCount = level === "easy" ? 1 : countOrderedFieldCandidates(state, level === "expert");
  const progressTotal = level === "normal"
    ? Math.min(sampleLimit, candidateCount)
    : level === "advanced"
      ? advancedBudget
      : candidateCount;
  const progressStep = Math.max(1, Math.floor(progressTotal / 500));
  let seen = 0;
  let evaluated = 0;
  let best: ScoredPlan | null = null;
  let lastProgressAt = 0;
  const reportProgress = (processedPlans: number, force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && processedPlans % progressStep !== 0 && now - lastProgressAt < 250) return;
    lastProgressAt = now;
    onProgress({
      processedPlans: Math.min(processedPlans, progressTotal),
      totalPlans: progressTotal,
      percent: progressTotal > 0 ? Math.min(100, processedPlans / progressTotal * 100) : 100
    });
  };
  reportProgress(0, true);

  if (level === "easy") {
    const player = state.players[0]!;
    const shuffled = getEligibleHandCards(state)
      .map((card) => ({ card, order: random() }))
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.card);
    const count = Math.floor(random() * (Math.min(player.roundPlacementLimit, shuffled.length) + 1));
    best = evaluateOrder(state, [...player.field, ...shuffled.slice(0, count)]);
    evaluated = best ? 1 : 0;
    reportProgress(1, true);
  }

  if (level === "advanced") {
    const player = state.players[0]!;
    const eligibleHand = getEligibleHandCards(state);
    const allCards = [...player.field, ...eligibleHand];
    const cardsByInstanceId = new Map(allCards.map((card) => [card.instanceId, card] as const));
    const handIds = new Set(eligibleHand.map((card) => card.instanceId));
    const beam: ScoredPlan[] = [];
    const seenOrders = new Set<string>();
    let processed = 0;

    const considerOrder = (order: CardInstance[]) => {
      if (processed >= advancedBudget) return;
      const key = order.map((card) => card.instanceId).join("|");
      if (seenOrders.has(key)) return;
      seenOrders.add(key);
      processed += 1;
      const candidate = evaluateOrder(state, order);
      if (candidate) {
        evaluated += 1;
        beam.push(candidate);
        beam.sort((left, right) => right.score - left.score || left.orderedFieldInstanceIds.join("|").localeCompare(right.orderedFieldInstanceIds.join("|")));
        if (beam.length > 16) beam.length = 16;
        if (!best || candidate.score > best.score) best = candidate;
      }
      reportProgress(processed);
    };

    for (const order of orderedFieldCandidates(state, false)) {
      considerOrder(order);
      if (processed >= 96) break;
    }

    const shuffleCards = (cards: CardInstance[]) => cards
      .map((card) => ({ card, weight: random() }))
      .sort((left, right) => left.weight - right.weight)
      .map((entry) => entry.card);

    let seedAttempts = 0;
    while (processed < 160 && seedAttempts < 1600) {
      seedAttempts += 1;
      const selectedCount = Math.floor(random() * (Math.min(player.roundPlacementLimit, eligibleHand.length) + 1));
      considerOrder(shuffleCards([...player.field, ...shuffleCards(eligibleHand).slice(0, selectedCount)]));
    }

    let mutationAttempts = 0;
    while (processed < advancedBudget && beam.length > 0 && mutationAttempts < advancedBudget * 12) {
      mutationAttempts += 1;
      const parent = beam[Math.floor(random() * beam.length)]!;
      const order = parent.orderedFieldInstanceIds
        .map((instanceId) => cardsByInstanceId.get(instanceId))
        .filter((card): card is CardInstance => Boolean(card));
      const mutationKind = Math.floor(random() * 4);

      if (mutationKind === 0 && order.length >= 2) {
        const first = Math.floor(random() * order.length);
        let second = Math.floor(random() * order.length);
        if (second === first) second = (second + 1) % order.length;
        [order[first], order[second]] = [order[second]!, order[first]!];
      } else if (mutationKind === 1 && order.length >= 2) {
        const from = Math.floor(random() * order.length);
        const [card] = order.splice(from, 1);
        order.splice(Math.floor(random() * (order.length + 1)), 0, card!);
      } else if (mutationKind === 2) {
        const unusedHand = eligibleHand.filter((card) => !order.some((entry) => entry.instanceId === card.instanceId));
        if (unusedHand.length > 0 && order.filter((card) => handIds.has(card.instanceId)).length < player.roundPlacementLimit) {
          const card = unusedHand[Math.floor(random() * unusedHand.length)]!;
          order.splice(Math.floor(random() * (order.length + 1)), 0, card);
        }
      } else {
        const placedHandIndexes = order
          .map((card, index) => handIds.has(card.instanceId) ? index : -1)
          .filter((index) => index >= 0);
        if (placedHandIndexes.length > 0) {
          order.splice(placedHandIndexes[Math.floor(random() * placedHandIndexes.length)]!, 1);
        }
      }
      considerOrder(order);
    }
    reportProgress(advancedBudget, true);
  }

  for (const order of level === "easy" || level === "advanced" ? [] : orderedFieldCandidates(state, level === "expert")) {
    seen += 1;
    if (level !== "expert" && seen > sampleLimit && random() > sampleLimit / seen) {
      continue;
    }
    const candidate = evaluateOrder(state, order);
    if (!candidate) {
      if (level === "expert") reportProgress(seen);
      continue;
    }
    evaluated += 1;
    reportProgress(level === "expert" ? seen : evaluated);
    if (!best || candidate.score > best.score || (candidate.score === best.score && random() < 0.5)) {
      best = candidate;
    }
    if (evaluated >= sampleLimit) {
      break;
    }
  }

  if (!best) {
    throw new Error("AI could not find a legal round plan.");
  }
  reportProgress(progressTotal, true);
  return {
    level,
    plan: {
      round: state.round,
      mulliganInstanceIds: [],
      placements: best.placements
    },
    projectedRoundScore: best.score,
    evaluatedPlans: evaluated,
    orderedFieldInstanceIds: best.orderedFieldInstanceIds,
    targetSelectionsByInstanceId: best.targetSelectionsByInstanceId
  };
}

/** Executes the full decision, including targets selected for cards already on the field. */
export function applyAiRoundDecisionWithFrames(
  state: LocalGameState,
  decision: AiRoundDecision
): { state: LocalGameState; frames: LocalGameState[] } {
  let next = startRoundResolution(state, decision.orderedFieldInstanceIds);
  const frames = [structuredClone(next)];
  while (next.pendingResolution) {
    const card = getCurrentResolutionCard(next);
    next = resolveNextCard(next, card ? decision.targetSelectionsByInstanceId[card.instanceId] ?? {} : {});
    frames.push(structuredClone(next));
  }
  if (next.pendingFinalAction?.kind === "dolphin_duplicate") {
    next = resolveBestOutcome(next).state;
    frames.push(structuredClone(next));
  }
  return { state: next, frames };
}

/** Executes the full decision, including targets selected for cards already on the field. */
export function applyAiRoundDecision(state: LocalGameState, decision: AiRoundDecision): LocalGameState {
  return applyAiRoundDecisionWithFrames(state, decision).state;
}
