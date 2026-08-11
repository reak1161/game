import type { CardInstance, SubmittedPlacement, SubmittedRoundData } from "@hyperdimensional-battle/shared";
import {
  getCurrentResolutionCard,
  getCurrentResolutionTargetKeys,
  resolveNextCard,
  resolvePendingFinalAction,
  startRoundResolution,
  type LocalGameState
} from "./index";

export type AiLevel = "easy" | "normal" | "expert";

export type AiRoundDecision = {
  level: AiLevel;
  plan: SubmittedRoundData;
  projectedRoundScore: number;
  evaluatedPlans: number;
  orderedFieldInstanceIds: string[];
  targetSelectionsByInstanceId: Record<string, Record<string, string>>;
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
  const candidateIds = state.players[0]!.field.map((entry) => entry.instanceId);
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
export function planAiRound(state: LocalGameState, level: AiLevel = "normal"): AiRoundDecision {
  if (state.phase !== "input") {
    throw new Error("AI can only plan during the input phase.");
  }

  const random = createDeterministicRandom(`${state.rngSeed}:ai:${state.round}:${level}`);
  const sampleLimit = level === "easy" ? 1 : level === "normal" ? 96 : Number.POSITIVE_INFINITY;
  let seen = 0;
  let evaluated = 0;
  let best: ScoredPlan | null = null;

  if (level === "easy") {
    const player = state.players[0]!;
    const shuffled = getEligibleHandCards(state)
      .map((card) => ({ card, order: random() }))
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.card);
    const count = Math.floor(random() * (Math.min(player.roundPlacementLimit, shuffled.length) + 1));
    best = evaluateOrder(state, [...player.field, ...shuffled.slice(0, count)]);
    evaluated = best ? 1 : 0;
  }

  for (const order of level === "easy" ? [] : orderedFieldCandidates(state, level === "expert")) {
    seen += 1;
    if (level !== "expert" && seen > sampleLimit && random() > sampleLimit / seen) {
      continue;
    }
    const candidate = evaluateOrder(state, order);
    if (!candidate) {
      continue;
    }
    evaluated += 1;
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
export function applyAiRoundDecision(state: LocalGameState, decision: AiRoundDecision): LocalGameState {
  let next = startRoundResolution(state, decision.orderedFieldInstanceIds);
  while (next.pendingResolution) {
    const card = getCurrentResolutionCard(next);
    next = resolveNextCard(next, card ? decision.targetSelectionsByInstanceId[card.instanceId] ?? {} : {});
  }
  if (next.pendingFinalAction?.kind === "dolphin_duplicate") {
    return resolveBestOutcome(next).state;
  }
  return next;
}
