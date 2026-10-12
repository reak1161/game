import { describe, expect, it } from "vitest";
import { sampleCards, sampleRoles, sampleRoundBuffs } from "@hyperdimensional-battle/shared";
import { applyAiRoundDecision, applyRoundPlan, chooseRoundBuff, createLocalGame, finalizeRound, planAiRound } from "./index";

function createSmallGame() {
  const game = createLocalGame({ roleId: "role_simple", cards: sampleCards, roles: sampleRoles, seed: "ai-test" });
  const player = game.players[0]!;
  const wanted = ["none_punch", "none_hadou"];
  const allCards = [...player.hand, ...player.deck];
  player.hand = allCards.filter((card) => wanted.includes(card.definitionId)).slice(0, 2);
  player.deck = allCards.filter((card) => !player.hand.some((handCard) => handCard.instanceId === card.instanceId));
  player.hand.forEach((card) => (card.zone = "hand"));
  player.deck.forEach((card) => (card.zone = "deck"));
  expect(player.hand).toHaveLength(2);
  return game;
}

describe("round AI", () => {
  it("expert returns an executable maximum-score placement", () => {
    const game = createSmallGame();
    const progress: number[] = [];
    const decision = planAiRound(game, "expert", (entry) => progress.push(entry.percent));
    const resolved = applyRoundPlan(game, decision.plan);
    const fullyResolved = applyAiRoundDecision(game, decision);

    const [first, second] = game.players[0]!.hand;
    const candidatePlans = [
      [],
      [first!],
      [second!],
      [first!, second!],
      [second!, first!]
    ];
    const maximum = Math.max(
      ...candidatePlans.map((cards) =>
        applyRoundPlan(game, {
          round: game.round,
          mulliganInstanceIds: [],
          placements: cards.map((card, order) => ({ handInstanceId: card.instanceId, order }))
        }).players[0]!.scoreThisRound
      )
    );

    expect(decision.projectedRoundScore).toBe(maximum);
    expect(resolved.players[0]!.scoreThisRound).toBe(maximum);
    expect(fullyResolved.players[0]!.scoreThisRound).toBe(maximum);
    expect(decision.evaluatedPlans).toBe(5);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(100);
  });

  it.each(["easy", "normal", "advanced"] as const)("%s produces a legal deterministic plan", (level) => {
    const game = createSmallGame();
    const first = planAiRound(game, level);
    const second = planAiRound(game, level);
    expect(first.plan).toEqual(second.plan);
    expect(() => applyRoundPlan(game, first.plan)).not.toThrow();
  });

  it("advanced keeps the normal candidate quality while searching reordered improvements", () => {
    const game = createSmallGame();
    const normal = planAiRound(game, "normal");
    const advanced = planAiRound(game, "advanced");
    expect(advanced.projectedRoundScore).toBeGreaterThanOrEqual(normal.projectedRoundScore);
  });

  it("normal AI can complete all five rounds for a solo replay", () => {
    let game = createLocalGame({
      roleId: "role_simple",
      cards: sampleCards,
      roles: sampleRoles,
      roundBuffs: sampleRoundBuffs,
      seed: "solo-ai-replay-test"
    });
    const frames = [structuredClone(game)];

    while (game.phase !== "finished") {
      game = applyAiRoundDecision(game, planAiRound(game, "normal"));
      frames.push(structuredClone(game));
      game = finalizeRound(game, game.players[0]!.field.slice(0, 2).map((card) => card.instanceId));
      frames.push(structuredClone(game));
      if (game.pendingRoundBuffChoice) {
        game = chooseRoundBuff(game, 0);
        frames.push(structuredClone(game));
      }
    }

    expect(game.round).toBe(5);
    expect(game.phase).toBe("finished");
    expect(frames.length).toBeGreaterThan(10);
  }, 20_000);
});
