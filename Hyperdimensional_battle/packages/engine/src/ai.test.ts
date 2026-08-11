import { describe, expect, it } from "vitest";
import { sampleCards, sampleRoles } from "@hyperdimensional-battle/shared";
import { applyAiRoundDecision, applyRoundPlan, createLocalGame, planAiRound } from "./index";

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
    const decision = planAiRound(game, "expert");
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
  });

  it.each(["easy", "normal"] as const)("%s produces a legal deterministic plan", (level) => {
    const game = createSmallGame();
    const first = planAiRound(game, level);
    const second = planAiRound(game, level);
    expect(first.plan).toEqual(second.plan);
    expect(() => applyRoundPlan(game, first.plan)).not.toThrow();
  });
});
