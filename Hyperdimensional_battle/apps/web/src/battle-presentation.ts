import type { ReplayEvent, ReplayScore } from "@hyperdimensional-battle/shared";
import type { LocalGameState } from "@hyperdimensional-battle/engine";

/** Older replays can contain separate frames for cards that never activated. */
export function isSilentReplayStep(previous: LocalGameState, next: LocalGameState) {
  return previous.round === next.round && previous.phase === next.phase &&
    !!previous.pendingResolution && !!next.pendingResolution &&
    next.pendingResolution.cursor > previous.pendingResolution.cursor &&
    next.replayEvents.length === previous.replayEvents.length;
}

export type BattlePresentationEvent = ReplayEvent | { type: "SCORE_SYNC"; score: ReplayScore };

export type MultiHitProgress = {
  instanceId: string;
  definitionId?: string;
  count: number;
  current: number;
  total: number;
  lastAmount: number;
};
export type BattlePlaybackState = { activeInstanceId: string | null; multiHit: MultiHitProgress | null };
export const idleBattlePlayback: BattlePlaybackState = { activeInstanceId: null, multiHit: null };

/** The visible card follows presentation events, never the engine's next cursor. */
export function advanceBattlePlayback(state: BattlePlaybackState, event: ReplayEvent, definitionId?: string): BattlePlaybackState {
  if (event.type === "ROUND_START" || event.type === "ROUND_END" || event.type === "FINAL_ATTACK") return idleBattlePlayback;
  if (event.type === "CARD_ACTIVATED") return { activeInstanceId: event.instanceId, multiHit: null };
  if (event.type === "MULTI_HIT_STARTED") return {
    activeInstanceId: event.instanceId,
    multiHit: { instanceId: event.instanceId, definitionId, count: event.count, current: 0, total: 0, lastAmount: 0 }
  };
  const multi = state.multiHit;
  if (event.type === "DAMAGE_DEALT" && multi && multi.current < multi.count &&
    (event.sourceInstanceId ? event.sourceInstanceId === multi.instanceId : event.source === multi.definitionId)) {
    return { ...state, multiHit: { ...multi, current: multi.current + 1, total: multi.total + event.amount, lastAmount: event.amount } };
  }
  if (event.type === "CARD_DESTROYED" && event.instanceId === state.activeInstanceId) return { ...state, activeInstanceId: null };
  return state;
}

/** Preserve per-hit scores, including older replays without score snapshots. */
export function buildBattlePresentation(
  events: ReplayEvent[], previous: ReplayScore, target: ReplayScore, playerId: string
): BattlePresentationEvent[] {
  let score = { ...previous };
  const result: BattlePresentationEvent[] = [];
  for (const event of events) {
    if ("playerId" in event && event.playerId !== playerId) continue;
    if (event.type === "ROUND_START") {
      score = { ...score, scoreThisRound: 0 };
    }
    if (event.type === "DAMAGE_DEALT" || event.type === "FINAL_ATTACK") {
      score = event.score ?? {
        scoreThisRound: score.scoreThisRound + event.amount,
        totalScore: score.totalScore + event.amount
      };
      result.push({ ...event, score });
    } else {
      if (event.type === "STATUS_CHANGED" && event.score) score = event.score;
      result.push(event);
    }
  }
  // Old records may change totals directly (for example, the score gamble).
  // Reconcile only after their queued effects, never jump ahead of an attack.
  result.push({ type: "SCORE_SYNC", score: { ...target } });
  return result;
}
