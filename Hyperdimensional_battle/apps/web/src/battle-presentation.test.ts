import { describe, expect, it } from "vitest";
import type { ReplayEvent } from "@hyperdimensional-battle/shared";
import { advanceBattlePlayback, idleBattlePlayback, buildBattlePresentation, isSilentReplayStep } from "./battle-presentation";
import { createLocalGame, startRoundResolution } from "@hyperdimensional-battle/engine";
import { sampleCards, sampleRoles } from "@hyperdimensional-battle/shared";

const zero = { scoreThisRound: 0, totalScore: 0 };
const hit = (amount: number): Extract<ReplayEvent, { type: "DAMAGE_DEALT" }> => ({ type: "DAMAGE_DEALT", playerId: "p", source: "card", amount });

describe("battle playback focus", () => {
  const activated: ReplayEvent = { type: "CARD_ACTIVATED", playerId: "p", instanceId: "light", attribute: "thunder", chainCount: 1 };
  const burst: ReplayEvent = { type: "MULTI_HIT_STARTED", playerId: "p", instanceId: "light", attribute: "thunder", count: 5 };
  const damage = (amount: number): ReplayEvent => ({ ...hit(amount), source: "thunder_speed_of_light", sourceInstanceId: "light" });

  it("keeps focus on the attacking card for all five hits, then moves on the next activation", () => {
    let state = advanceBattlePlayback(idleBattlePlayback, activated);
    state = advanceBattlePlayback(state, burst, "thunder_speed_of_light");
    for (let index = 1; index <= 5; index += 1) {
      state = advanceBattlePlayback(state, damage(10));
      expect(state.activeInstanceId).toBe("light");
      expect(state.multiHit).toMatchObject({ current: index, count: 5, total: index * 10 });
      state = advanceBattlePlayback(state, { type: "STATUS_CHANGED", playerId: "p", baseAttack: 50, baseMagic: 50, tempAttack: 50, tempMagic: 50 });
      expect(state.activeInstanceId).toBe("light");
    }
    state = advanceBattlePlayback(state, { ...activated, instanceId: "next" });
    expect(state).toEqual({ activeInstanceId: "next", multiHit: null });
    expect(advanceBattlePlayback(state, { type: "FINAL_ATTACK", playerId: "p", amount: 50 })).toEqual(idleBattlePlayback);
  });

  it("does not count triggered damage or another copy of the same card as a burst hit", () => {
    let state = advanceBattlePlayback(idleBattlePlayback, burst, "thunder_speed_of_light");
    state = advanceBattlePlayback(state, damage(10));
    state = advanceBattlePlayback(state, { ...hit(7), source: "thunder_shock", sourceInstanceId: "shock" });
    state = advanceBattlePlayback(state, { ...hit(10), source: "thunder_speed_of_light", sourceInstanceId: "other-copy" });
    expect(state.multiHit).toMatchObject({ current: 1, total: 10 });
    expect(state.activeInstanceId).toBe("light");
  });

  it("counts zero-damage hits and clears the burst at a round boundary", () => {
    let state = advanceBattlePlayback(idleBattlePlayback, burst, "thunder_speed_of_light");
    state = advanceBattlePlayback(state, damage(0));
    expect(state.multiHit).toMatchObject({ current: 1, lastAmount: 0, total: 0 });
    expect(advanceBattlePlayback(state, { type: "ROUND_START", round: 2 })).toEqual(idleBattlePlayback);
  });

  it("supports old replays without source instance ids and never exceeds the hit count", () => {
    let state = advanceBattlePlayback(idleBattlePlayback, burst, "thunder_speed_of_light");
    for (let index = 0; index < 6; index += 1) {
      state = advanceBattlePlayback(state, { ...hit(0.2), source: "thunder_speed_of_light" });
    }
    expect(state.multiHit).toMatchObject({ current: 5, count: 5, total: 1 });
  });
});

describe("battle score presentation", () => {
  it("removes pauses from old replay frames that only passed an inactive card", () => {
    const game = createLocalGame({ roleId: "role_simple", cards: sampleCards, roles: sampleRoles });
    const previous = startRoundResolution(game, [game.players[0].hand[0].instanceId]);
    const next = structuredClone(previous);
    next.pendingResolution!.cursor += 1;
    expect(isSilentReplayStep(previous, next)).toBe(true);
    next.replayEvents.push(hit(10));
    expect(isSilentReplayStep(previous, next)).toBe(false);
    next.replayEvents.pop();
    next.round += 1;
    expect(isSilentReplayStep(previous, next)).toBe(false);
  });

  it("reveals fractional multi-hit damage one hit at a time in old replays", () => {
    const result = buildBattlePresentation([hit(0.2), hit(0.2), hit(0.2)], zero,
      { scoreThisRound: 0.6, totalScore: 0.6 }, "p");
    expect(result.map((event) => "score" in event ? event.score?.totalScore : undefined))
      .toEqual([0.2, 0.4, 0.6000000000000001, 0.6]);
  });

  it("preserves score changes between hits instead of assuming totals always increase", () => {
    const result = buildBattlePresentation([
      { ...hit(10), score: { scoreThisRound: 10, totalScore: 110 } },
      { type: "STATUS_CHANGED", playerId: "p", baseAttack: 50, baseMagic: 50, tempAttack: 50, tempMagic: 50,
        score: { scoreThisRound: 10, totalScore: 0 } },
      hit(5),
      { type: "FINAL_ATTACK", playerId: "p", amount: 50, score: { scoreThisRound: 65, totalScore: 55 } }
    ], { scoreThisRound: 0, totalScore: 100 }, { scoreThisRound: 65, totalScore: 55 }, "p");
    expect(result.map((event) => "score" in event ? event.score : undefined)).toEqual([
      { scoreThisRound: 10, totalScore: 110 }, { scoreThisRound: 10, totalScore: 0 },
      { scoreThisRound: 15, totalScore: 5 }, { scoreThisRound: 65, totalScore: 55 },
      { scoreThisRound: 65, totalScore: 55 }
    ]);
  });

  it("resets the round but retains totals and ignores another player's attacks", () => {
    const result = buildBattlePresentation([
      { type: "ROUND_START", round: 2 },
      { type: "DAMAGE_DEALT", playerId: "opponent", source: "card", amount: 999 }, hit(25)
    ], { scoreThisRound: 100, totalScore: 300 }, { scoreThisRound: 25, totalScore: 325 }, "p");
    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({ score: { scoreThisRound: 25, totalScore: 325 } });
  });

  it("settles direct score changes in old records after their effects finish", () => {
    const result = buildBattlePresentation([hit(10)], { scoreThisRound: 0, totalScore: 100 },
      { scoreThisRound: 10, totalScore: 0 }, "p");
    expect(result[0]).toMatchObject({ score: { scoreThisRound: 10, totalScore: 110 } });
    expect(result.at(-1)).toEqual({ type: "SCORE_SYNC", score: { scoreThisRound: 10, totalScore: 0 } });
  });
});
