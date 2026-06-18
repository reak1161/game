import { describe, expect, it } from "vitest";
import {
  applyMulliganOnly,
  applyRoundPlan,
  chooseRoundBuff,
  createLocalGame,
  finalizeRound,
  getCurrentResolutionCard,
  getCurrentResolutionTargetKeys,
  resolveNextCard,
  resolvePendingFinalAction,
  rerollRoundBuffChoice,
  startRoundResolution
} from "./index";
import { sampleCards, sampleRoles, sampleRoundBuffs, type CardDefinition } from "@hyperdimensional-battle/shared";

function createGame(roleId = "role_simple") {
  return createLocalGame({
    roleId,
    cards: sampleCards,
    roles: sampleRoles,
    roundBuffs: sampleRoundBuffs
  });
}

function ensureCardsInHand(game: ReturnType<typeof createGame>, definitionIds: string[]) {
  const player = game.players[0];
  for (const definitionId of definitionIds) {
    if (player.hand.some((card) => card.definitionId === definitionId)) {
      continue;
    }

    const deckCard = player.deck.find((card) => card.definitionId === definitionId);
    expect(deckCard).toBeDefined();
    player.deck = player.deck.filter((card) => card.instanceId !== deckCard!.instanceId);
    deckCard!.zone = "hand";
    player.hand.push(deckCard!);
  }
}

function ensureCardCopiesInHand(game: ReturnType<typeof createGame>, definitionId: string, count: number) {
  const player = game.players[0];
  while (player.hand.filter((card) => card.definitionId === definitionId).length < count) {
    const deckCard = player.deck.find((card) => card.definitionId === definitionId);
    expect(deckCard).toBeDefined();
    player.deck = player.deck.filter((card) => card.instanceId !== deckCard!.instanceId);
    deckCard!.zone = "hand";
    player.hand.push(deckCard!);
  }
}

function finalizeRoundAndAdvance(game: ReturnType<typeof createGame>, discardIds: string[]) {
  const afterFinalize = finalizeRound(game, discardIds);
  if (afterFinalize.pendingRoundBuffChoice) {
    const advanced = chooseRoundBuff(afterFinalize, 0);
    advanced.players[0].selectedRoundBuffs = [];
    for (const card of advanced.players[0].field) {
      if (card.derived) {
        delete card.derived.roundBuffNumericValueMultiplier;
      }
    }
    return advanced;
  }
  return afterFinalize;
}

describe("engine", () => {
  it("punch doubles temp attack and applies final attack", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_punch"]);
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch");
    expect(punch).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: punch!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.phase).toBe("round_end");
    expect(afterResolve.players[0].tempAttack).toBe(100);
    expect(afterResolve.players[0].scoreThisRound).toBe(200);
    expect(afterResolve.players[0].totalScore).toBe(200);
    expect(afterResolve.log.some((entry) => entry.code === "FINAL_ATTACK")).toBe(true);
  });

  it("overcharge halves non-final card damage instead of zeroing it", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_punch", "thunder_overcharge"]);
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch");
    const overcharge = game.players[0].hand.find((card) => card.definitionId === "thunder_overcharge");
    expect(punch).toBeDefined();
    expect(overcharge).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: punch!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: overcharge!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const damageLogs = afterResolve.log.filter((entry) => entry.code === "DAMAGE_DEALT");
    expect(damageLogs.length).toBeGreaterThan(0);
    expect(afterResolve.players[0].scoreThisRound).toBe(150);
  });

  it("speed of light keeps its fractional damage instead of zeroing each hit", () => {
    const game = createGame();
    ensureCardsInHand(game, ["thunder_speed_of_light"]);
    const card = game.players[0].hand.find((entry) => entry.definitionId === "thunder_speed_of_light");
    expect(card).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: card!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.log.filter((entry) => entry.code === "DAMAGE_DEALT")).toHaveLength(5);
    expect(afterResolve.players[0].scoreThisRound).toBe(100);
  });

  it("offers round buffs after discard and starts next round after selection", () => {
    const game = createGame();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: []
    });

    expect(afterResolve.phase).toBe("round_end");
    const withChoices = finalizeRound(afterResolve, []);
    expect(withChoices.pendingRoundBuffChoice?.options).toHaveLength(3);
    expect(new Set(withChoices.pendingRoundBuffChoice?.options ?? []).size).toBe(3);

    const rerolled = rerollRoundBuffChoice(withChoices);
    expect(rerolled.pendingRoundBuffChoice?.rerollUsed).toBe(true);
    expect(new Set(rerolled.pendingRoundBuffChoice?.options ?? []).size).toBe(3);

    const selected = chooseRoundBuff(rerolled, 0);
    expect(selected.phase).toBe("input");
    expect(selected.round).toBe(2);
    expect(selected.players[0].selectedRoundBuffs).toHaveLength(1);
  });

  it("freezing wind increases ice draw weight and adds twinkling snow scenery to ice cards", () => {
    const game = createGame();
    game.players[0].selectedRoundBuffs = [{ instanceId: "buff_freezing", buffId: "round_buff_freezing_wind" }];
    ensureCardsInHand(game, ["ice_tsuranaru_tsurara", "none_hybrid"]);

    const iceCard = game.players[0].hand.find((card) => card.definitionId === "ice_tsuranaru_tsurara");
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    expect(iceCard).toBeDefined();
    expect(hybrid).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: iceCard!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: hybrid!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const fieldIceCard = afterResolve.players[0].field.find((card) => card.instanceId === iceCard!.instanceId);
    const fieldHybrid = afterResolve.players[0].field.find((card) => card.instanceId === hybrid!.instanceId);
    expect(fieldIceCard?.enchantments.some((enchantment) => enchantment.definitionId === "enchant_kirameku_yukigeshiki")).toBe(true);
    expect(fieldIceCard?.derived?.roundBuffNumericValueMultiplier).toBe(2);
    expect(fieldHybrid?.enchantments.some((enchantment) => enchantment.definitionId === "enchant_kirameku_yukigeshiki")).toBe(false);
  });

  it("one more queues an extra activation for the rightmost card", () => {
    const game = createGame();
    game.players[0].selectedRoundBuffs = [{ instanceId: "buff_one_more", buffId: "round_buff_one_more" }];
    ensureCardsInHand(game, ["none_hybrid", "none_kintore"]);

    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const kintore = game.players[0].hand.find((card) => card.definitionId === "none_kintore");
    expect(hybrid).toBeDefined();
    expect(kintore).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: kintore!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.players[0].baseAttack).toBe(125);
    expect(
      afterResolve.log.some(
        (entry) => entry.code === "ROUND_BUFF_ONE_MORE" && entry.message.includes("もう一回") && entry.message.includes("筋トレ")
      )
    ).toBe(true);
  });

  it("information society increases next round hand size and round placement limit", () => {
    const game = createGame();
    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: []
    });

    const withChoices = finalizeRound(afterResolve, []);
    withChoices.pendingRoundBuffChoice = {
      options: ["round_buff_information_society", "round_buff_voltessimo", "round_buff_tailwind_rush"],
      rerollUsed: false,
      rollIndex: 0
    };

    const selected = chooseRoundBuff(withChoices, 0);
    const hybridDefinition = sampleCards.find((card) => card.id === "none_hybrid");
    expect(hybridDefinition).toBeDefined();
    selected.players[0].hand = Array.from({ length: 8 }, (_, index) => ({
      instanceId: `info_society_hand_${index}`,
      definitionId: hybridDefinition!.id,
      name: hybridDefinition!.name,
      type: hybridDefinition!.type,
      attribute: hybridDefinition!.attribute,
      text: hybridDefinition!.text,
      ownerPlayerId: selected.players[0].playerId,
      zone: "hand" as const,
      enchantments: [],
      counters: {},
      derived: {}
    }));

    expect(selected.players[0].hand).toHaveLength(8);
    expect(selected.players[0].roundPlacementLimit).toBe(7);

    const afterEightPlacements = applyRoundPlan(selected, {
      round: selected.round,
      mulliganInstanceIds: [],
      placements: selected.players[0].hand.slice(0, 8).map((card, index) => ({
        handInstanceId: card.instanceId,
        order: index,
        targetSelections: {}
      }))
    });

    expect(afterEightPlacements.phase).toBe("round_end");
  });

  it("shoukyaku destroys target and doubles both stats on success", () => {
    let game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "fire_shoukyaku"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const shoukyaku = game.players[0].hand.find((card) => card.definitionId === "fire_shoukyaku");
    expect(hybrid).toBeDefined();
    expect(shoukyaku).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: shoukyaku!.instanceId,
          order: 1,
          targetSelections: {
            destroy_target: hybrid!.instanceId
          }
        }
      ]
    });

    const discardHybrid = game.players[0].discard.find((card) => card.definitionId === "none_hybrid");
    expect(discardHybrid).toBeDefined();
    expect(game.players[0].baseAttack).toBe(130);
    expect(game.players[0].baseMagic).toBe(130);
  });

  it("buildup applies attack enchantment to the chosen ally card", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "none_buildup"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const buildup = game.players[0].hand.find((card) => card.definitionId === "none_buildup");
    expect(hybrid && buildup).toBeTruthy();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: buildup!.instanceId,
          order: 1,
          targetSelections: {
            apply_enchant: hybrid!.instanceId
          }
        }
      ]
    });

    const enchantedHybrid = afterResolve.players[0].field.find((card) => card.instanceId === hybrid!.instanceId);
    expect(enchantedHybrid?.enchantments).toHaveLength(1);
    expect(enchantedHybrid?.enchantments[0]?.definitionId).toBe("enchant_attack_plus_10");
  });

  it("hyakka ryoran queues up to five random additional activations excluding itself", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hyakka_ryoran", "none_hybrid", "none_kintore", "none_punch", "none_hadou", "fire_bending"]);
    const player = game.players[0];
    const setupIds = ["none_hybrid", "none_kintore", "none_punch", "none_hadou", "fire_bending", "none_hyakka_ryoran"];
    const fieldCards = setupIds.map((definitionId) => player.hand.find((card) => card.definitionId === definitionId)!);
    player.hand = player.hand.filter((card) => !fieldCards.some((fieldCard) => fieldCard.instanceId === card.instanceId));
    player.field = fieldCards.map((card, index) => ({
      ...card,
      zone: "field" as const,
      fieldIndex: index
    }));

    const resolving = startRoundResolution(game, player.field.map((card) => card.instanceId));
    let afterResolve = resolving;
    while (afterResolve.pendingResolution) {
      afterResolve = resolveNextCard(afterResolve, {});
    }

    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED" && entry.message.includes("ランダム追加発動"))).toHaveLength(5);
  });

  it("takumi kodawari invalidates different attributes and triples base stats when same attributes activate consecutively", () => {
    const game = createGame();
    ensureCardCopiesInHand(game, "fire_bending", 3);
    ensureCardsInHand(game, ["none_takumi_kodawari", "none_hybrid"]);

    const bends = game.players[0].hand.filter((card) => card.definitionId === "fire_bending").slice(0, 3);
    const takumi = game.players[0].hand.find((card) => card.definitionId === "none_takumi_kodawari")!;
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid")!;

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: bends[0]!.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: takumi.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: hybrid.instanceId, order: 2, targetSelections: {} },
        { handInstanceId: bends[1]!.instanceId, order: 3, targetSelections: {} },
        { handInstanceId: bends[2]!.instanceId, order: 4, targetSelections: {} }
      ]
    });

    expect(
      afterResolve.log.some(
        (entry) => entry.code === "CARD_INVALIDATED" && entry.message.includes(hybrid.name)
      )
    ).toBe(true);
    expect(afterResolve.players[0].baseAttack).toBe(150);
    expect(afterResolve.players[0].baseMagic).toBe(150);
  });

  it("touketsu no noroi continuously applies toushou to adjacent cards", () => {
    const game = createGame();
    ensureCardsInHand(game, ["ice_wall", "ice_touketsu_noroi", "ice_tsuranaru_tsurara"]);
    const wall = game.players[0].hand.find((card) => card.definitionId === "ice_wall")!;
    const curse = game.players[0].hand.find((card) => card.definitionId === "ice_touketsu_noroi")!;
    const icicle = game.players[0].hand.find((card) => card.definitionId === "ice_tsuranaru_tsurara")!;

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: wall.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: curse.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: icicle.instanceId, order: 2, targetSelections: {} }
      ]
    });

    const fieldWall = afterResolve.players[0].field.find((card) => card.instanceId === wall.instanceId);
    const fieldIcicle = afterResolve.players[0].field.find((card) => card.instanceId === icicle.instanceId);
    expect(fieldWall?.enchantments.some((entry) => entry.definitionId === "enchant_toushou")).toBe(true);
    expect(fieldIcicle?.enchantments.some((entry) => entry.definitionId === "enchant_toushou")).toBe(true);

    const afterFinalize = finalizeRound(afterResolve, [curse.instanceId, icicle.instanceId]);
    const remainingWall = afterFinalize.players[0].field.find((card) => card.instanceId === wall.instanceId);
    expect(remainingWall?.enchantments.some((entry) => entry.definitionId === "enchant_toushou")).toBe(false);
  });

  it("tsuranaru tsurara multiplies base attack for connected enchanted ice cards", () => {
    let game = createGame();
    ensureCardsInHand(game, ["ice_wall", "ice_touketsu_noroi", "ice_tsuranaru_tsurara"]);
    const wall = game.players[0].hand.find((card) => card.definitionId === "ice_wall")!;
    const curse = game.players[0].hand.find((card) => card.definitionId === "ice_touketsu_noroi")!;
    const icicle = game.players[0].hand.find((card) => card.definitionId === "ice_tsuranaru_tsurara")!;

    game = startRoundResolution(game, [wall.instanceId, curse.instanceId, icicle.instanceId]);
    game = resolveNextCard(game, {});
    game = resolveNextCard(game, {});
    const beforeIcicleAttack = game.players[0].baseAttack;

    const afterResolve = resolveNextCard(game, {});

    expect(afterResolve.players[0].baseAttack).toBeGreaterThan(beforeIcicleAttack);
  });

  it("cooling reaction reduces next round base stats and adds the reduced amount to host numeric value", () => {
    let game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "none_punch", "none_hadou", "ice_housha_reikyaku"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid")!;
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch")!;
    const hadou = game.players[0].hand.find((card) => card.definitionId === "none_hadou")!;
    const cooling = game.players[0].hand.find((card) => card.definitionId === "ice_housha_reikyaku")!;

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: hybrid.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: punch.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: hadou.instanceId, order: 2, targetSelections: {} },
        {
          handInstanceId: cooling.instanceId,
          order: 3,
          targetSelections: {
            apply_enchant: hybrid.instanceId
          }
        }
      ]
    });

    game = finalizeRoundAndAdvance(game, [punch.instanceId, hadou.instanceId]);

    const advancedHybrid = game.players[0].field.find((card) => card.instanceId === hybrid.instanceId)!;
    expect(game.players[0].baseAttack).toBe(58.5);
    expect(game.players[0].baseMagic).toBe(58.5);
    expect(advancedHybrid.counters?.cold_reaction_gain).toBe(13);
  });

  it("henden shisetsu only transforms and scales allies while it remains on the field", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_kintore", "none_punch", "thunder_henden_shisetsu"]);
    const kintore = game.players[0].hand.find((card) => card.definitionId === "none_kintore")!;
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch")!;
    const facility = game.players[0].hand.find((card) => card.definitionId === "thunder_henden_shisetsu")!;

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: kintore.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: punch.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: facility.instanceId, order: 2, targetSelections: {} }
      ]
    });

    const fieldKintore = afterResolve.players[0].field.find((card) => card.instanceId === kintore.instanceId)!;
    expect(fieldKintore.derived?.fieldAttributeOverride).toBe("thunder");
    expect(fieldKintore.derived?.fieldTransformNumericValueMultiplier).toBe(0.8);

    const afterFinalize = finalizeRound(afterResolve, [facility.instanceId, punch.instanceId]);
    const remainingKintore = afterFinalize.players[0].field.find((card) => card.instanceId === kintore.instanceId)!;
    expect(remainingKintore.derived?.fieldAttributeOverride).toBeUndefined();
    expect(remainingKintore.derived?.fieldTransformNumericValueMultiplier).toBeUndefined();
  });

  it("does not activate cards created to the left of the current resolving card during the same round", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "water_bubble_blink", "none_punch"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const bubbleBlink = game.players[0].hand.find((card) => card.definitionId === "water_bubble_blink");
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch");
    expect(hybrid && bubbleBlink && punch).toBeTruthy();

    const tokenPlacementKey = "create_token_positions:water_bubble_blink_consume:water_bubble";
    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: bubbleBlink!.instanceId,
          order: 1,
          targetSelections: {
            [tokenPlacementKey]: JSON.stringify(["token-left-a", hybrid!.instanceId, "token-left-b", bubbleBlink!.instanceId, punch!.instanceId])
          }
        },
        {
          handInstanceId: punch!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const createdBubbleIds = afterResolve.replayEvents
      .filter((event): event is Extract<(typeof afterResolve.replayEvents)[number], { type: "CARD_CREATED" }> => event.type === "CARD_CREATED")
      .filter((event) => event.definitionId === "water_bubble")
      .map((event) => event.instanceId);
    expect(createdBubbleIds).toHaveLength(2);

    const activatedBubbleIds = afterResolve.replayEvents
      .filter((event): event is Extract<(typeof afterResolve.replayEvents)[number], { type: "CARD_ACTIVATED" }> => event.type === "CARD_ACTIVATED")
      .map((event) => event.instanceId)
      .filter((instanceId) => createdBubbleIds.includes(instanceId));
    expect(activatedBubbleIds).toHaveLength(0);
  });

  it("balance role allows attack and spell cards but invalidates them during the round", () => {
    const game = createGame("role_balance");
    ensureCardsInHand(game, ["none_punch"]);
    const attackCard = game.players[0].hand.find((card) => card.definitionId === "none_punch");
    expect(attackCard).toBeDefined();

    const resolved = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: attackCard!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    const punch = resolved.players[0].field.find((card) => card.definitionId === "none_punch");
    expect(punch).toBeDefined();
    expect(punch?.isInvalidated).toBe(false);
    expect(resolved.log.some((entry) => entry.code === "CARD_INVALIDATED")).toBe(true);
  });

  it("charge role gains thunder appearance weight at each round start", () => {
    const game = createGame("role_charge");
    expect(game.players[0].drawAttributeWeights.thunder).toBe(1);

    game.phase = "round_end";
    game.players[0].field = [];
    const nextRound = finalizeRoundAndAdvance(game, []);
    expect(nextRound.players[0].drawAttributeWeights.thunder).toBe(2);
  });

  it("charge role multiplies base stats whenever an allied field card activates", () => {
    const game = createGame("role_charge");
    ensureCardsInHand(game, ["none_hybrid"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(hybrid).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [{ handInstanceId: hybrid!.instanceId, order: 0, targetSelections: {} }]
    });

    expect(afterResolve.players[0].baseAttack).toBe(49.5);
    expect(afterResolve.players[0].baseMagic).toBe(49.5);
  });

  it("dolphin role gains water appearance weight at each round start", () => {
    const game = createGame("role_dolphin");
    expect(game.players[0].drawAttributeWeights.water).toBe(2);

    game.phase = "round_end";
    game.players[0].field = [];
    const nextRound = finalizeRoundAndAdvance(game, []);
    expect(nextRound.players[0].drawAttributeWeights.water).toBe(4);
  });

  it("dolphin role doubles temp stats at round start for each set of three water cards on field", () => {
    const game = createGame("role_dolphin");
    const player = game.players[0];
    ensureCardCopiesInHand(game, "water_hydropump", 3);
    const safeWaterDefinitionIds = sampleCards
      .filter(
        (card) =>
          card.attribute === "water" &&
          !card.timings.includes("consume") &&
          card.id !== "water_hydropump" &&
          card.id !== "water_bubble" &&
          card.id !== "water_bubble_blink"
      )
      .map((card) => card.id);
    const fourthDefinitionId = safeWaterDefinitionIds.find(
      (definitionId) =>
        player.hand.some((entry) => entry.definitionId === definitionId) ||
        player.deck.some((entry) => entry.definitionId === definitionId)
    );
    expect(fourthDefinitionId).toBeDefined();
    ensureCardsInHand(game, [fourthDefinitionId!]);

    const selectedWaterCards = [
      ...player.hand.filter((entry) => entry.definitionId === "water_hydropump").slice(0, 3),
      player.hand.find((entry) => entry.definitionId === fourthDefinitionId!)
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    expect(selectedWaterCards).toHaveLength(4);

    for (const card of selectedWaterCards) {
      if (card.zone === "deck") {
        player.deck = player.deck.filter((entry) => entry.instanceId !== card.instanceId);
        card.zone = "hand";
        player.hand.push(card);
      }
    }

    const placements = selectedWaterCards.map((card, index) => ({
      handInstanceId: card.instanceId,
      order: index,
      targetSelections: {}
    }));

    let afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements
    });

    const sourceCard = afterResolve.players[0].field[0];
    expect(sourceCard).toBeDefined();
    expect(afterResolve.pendingFinalAction?.kind).toBe("dolphin_duplicate");

    afterResolve = resolvePendingFinalAction(afterResolve, sourceCard!.instanceId, afterResolve.players[0].field.length);
    const afterNextRound = finalizeRoundAndAdvance(
      afterResolve,
      afterResolve.players[0].field.slice(0, 2).map((card) => card.instanceId)
    );
    expect(afterNextRound.players[0].tempAttack).toBe(afterNextRound.players[0].baseAttack * 2);
    expect(afterNextRound.players[0].tempMagic).toBe(afterNextRound.players[0].baseMagic * 2);
  });

  it("dolphin role replaces final attack with duplicating a chosen field card", () => {
    const game = createGame("role_dolphin");
    ensureCardsInHand(game, ["none_hybrid"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    expect(hybrid).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [{ handInstanceId: hybrid!.instanceId, order: 0, targetSelections: {} }]
    });

    expect(afterResolve.pendingFinalAction?.kind).toBe("dolphin_duplicate");
    expect(afterResolve.log.some((entry) => entry.code === "FINAL_ATTACK")).toBe(false);

    const completed = resolvePendingFinalAction(afterResolve, hybrid!.instanceId, 1);
    expect(completed.pendingFinalAction).toBeNull();
    expect(completed.players[0].field).toHaveLength(2);
    expect(completed.players[0].field[1]?.definitionId).toBe("none_hybrid");
    expect(completed.log.some((entry) => entry.code === "ROLE_DOLPHIN_DUPLICATED")).toBe(true);
  });

  it("blaze role boosts final attack based on destroyed cards this round", () => {
    const game = createGame("role_blaze");
    ensureCardsInHand(game, ["none_hybrid", "fire_shoukyaku"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const shoukyaku = game.players[0].hand.find((card) => card.definitionId === "fire_shoukyaku");
    expect(hybrid).toBeDefined();
    expect(shoukyaku).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: hybrid!.instanceId, order: 0, targetSelections: {} },
        {
          handInstanceId: shoukyaku!.instanceId,
          order: 1,
          targetSelections: { destroy_target: hybrid!.instanceId }
        }
      ]
    });

    expect(afterResolve.players[0].roundDestroyedCardCount).toBe(1);
    expect(afterResolve.players[0].scoreThisRound).toBe(950);
    expect(afterResolve.log.some((entry) => entry.code === "ROLE_BLAZE_FINAL")).toBe(true);
  });

  it("static only chains from allied ability card activation and does not self-loop", () => {
    const game = createGame();
    ensureCardsInHand(game, ["thunder_static", "none_hybrid"]);
    const card = game.players[0].hand.find((entry) => entry.definitionId === "thunder_static");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(card).toBeDefined();
    expect(hybrid).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: card!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED")).toHaveLength(1);
    expect(afterResolve.players[0].baseMagic).toBe(85);
    expect(afterResolve.log.some((entry) => entry.code === "LOOP_GUARD_TRIGGERED")).toBe(false);
  });

  it("shock still chains from other allied damage and thunder shock feedback only extends once per shock damage source", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_punch"]);
    ensureCardCopiesInHand(game, "thunder_shock", 2);
    const punch = game.players[0].hand.find((entry) => entry.definitionId === "none_punch");
    const shocks = game.players[0].hand.filter((entry) => entry.definitionId === "thunder_shock");
    expect(punch).toBeDefined();
    expect(shocks).toHaveLength(2);

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: punch!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: shocks[0]!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: shocks[1]!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED")).toHaveLength(2);
    expect(afterResolve.log.filter((entry) => entry.code === "DAMAGE_DEALT").length).toBeGreaterThan(4);
    expect(afterResolve.players[0].baseAttack).toBeGreaterThan(50);
    expect(afterResolve.log.some((entry) => entry.code === "LOOP_GUARD_TRIGGERED")).toBe(false);
  });

  it("shock triggers for each hit of repeated non-shock damage cards", () => {
    const game = createGame();
    ensureCardsInHand(game, ["thunder_speed_of_light", "thunder_shock"]);
    const speedOfLight = game.players[0].hand.find((entry) => entry.definitionId === "thunder_speed_of_light");
    const shock = game.players[0].hand.find((entry) => entry.definitionId === "thunder_shock");
    expect(speedOfLight).toBeDefined();
    expect(shock).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: speedOfLight!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: shock!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED")).toHaveLength(5);
    expect(afterResolve.log.filter((entry) => entry.code === "DAMAGE_DEALT")).toHaveLength(11);
    const damageMessages = afterResolve.log
      .filter((entry) => entry.code === "DAMAGE_DEALT")
      .map((entry) => entry.message);
    const firstShockDamageIndex = damageMessages.findIndex((message) => message.includes(shock!.name));
    const fifthSpeedDamageIndex = damageMessages.reduce((foundIndex, message, index) => {
      if (foundIndex !== -1) {
        return foundIndex;
      }
      const speedDamageCount = damageMessages.slice(0, index + 1).filter((entry) => entry.includes(speedOfLight!.name)).length;
      return speedDamageCount >= 5 ? index : -1;
    }, -1);
    expect(firstShockDamageIndex).toBeGreaterThanOrEqual(0);
    expect(fifthSpeedDamageIndex).toBeGreaterThan(firstShockDamageIndex);
    expect(afterResolve.log.some((entry) => entry.code === "LOOP_GUARD_TRIGGERED")).toBe(false);
  });

  it("dropout creates aqua tokens on the right side", () => {
    const game = createGame();
    ensureCardsInHand(game, ["water_dropout"]);
    const card = game.players[0].hand.find((entry) => entry.definitionId === "water_dropout");
    expect(card).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: card!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.players[0].field.map((entry) => entry.definitionId)).toEqual(["water_dropout", "water_aqua"]);
    expect(afterResolve.players[0].baseAttack).toBe(60);
    expect(afterResolve.players[0].baseMagic).toBe(60);
  });

  it("bubble blink creates two bubbles at the chosen positions", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "water_bubble_blink"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const bubbleBlink = game.players[0].hand.find((entry) => entry.definitionId === "water_bubble_blink");
    expect(hybrid).toBeDefined();
    expect(bubbleBlink).toBeDefined();

    const started = startRoundResolution(game, [hybrid!.instanceId, bubbleBlink!.instanceId]);
    const afterHybrid = resolveNextCard(started, {});
    const afterBlink = resolveNextCard(afterHybrid, {
      "create_token_positions:water_bubble_blink_consume:water_bubble": JSON.stringify([
        hybrid!.instanceId,
        "__token_preview_0",
        bubbleBlink!.instanceId,
        "__token_preview_1"
      ])
    });

    expect(afterBlink.players[0].field.map((entry) => entry.definitionId)).toEqual(["none_hybrid", "water_bubble", "water_bubble"]);
  });

  it("draws by equal attribute weighting before choosing a card inside that attribute", () => {
    const game = createGame();
    const player = game.players[0];
    const allCards = [...player.hand, ...player.deck];
    const fireCard = allCards.find((entry) => entry.attribute === "fire");
    const noneCard = allCards.find((entry) => entry.attribute === "none");
    const waterCard = allCards.find((entry) => entry.attribute === "water");
    expect(fireCard).toBeDefined();
    expect(noneCard).toBeDefined();
    expect(waterCard).toBeDefined();

    player.hand = [];
    player.field = [];
    player.discard = [];
    player.removed = [];
    player.deck = [fireCard!, noneCard!, waterCard!].map((card) => ({
      ...card,
      zone: "deck" as const
    }));
    game.phase = "round_end";
    game.round = 1;
    game.rngSeed = "attribute-test";
    player.drawSequence = 0;

    const nextRound = finalizeRoundAndAdvance(game, []);
    expect(nextRound.players[0].hand.map((entry) => entry.attribute)).toEqual(["water", "fire", "none"]);
  });

  it("does not lock equal-weight draws to the same attribute across one refill", () => {
    const game = createGame();
    const player = game.players[0];
    const allCards = [...player.hand, ...player.deck];
    const fireCards = allCards.filter((entry) => entry.attribute === "fire").slice(0, 3);
    const iceCards = allCards.filter((entry) => entry.attribute === "ice").slice(0, 3);
    const thunderCard = allCards.find((entry) => entry.attribute === "thunder");

    expect(fireCards).toHaveLength(3);
    expect(iceCards).toHaveLength(3);
    expect(thunderCard).toBeDefined();

    player.hand = [];
    player.field = [];
    player.discard = [];
    player.removed = [];
    player.deck = [...fireCards, ...iceCards, thunderCard!].map((card) => ({
      ...card,
      zone: "deck" as const
    }));
    game.phase = "round_end";
    game.round = 1;
    game.rngSeed = "seed_a";
    player.drawSequence = 0;

    const nextRound = finalizeRoundAndAdvance(game, []);
    const drawnAttributes = nextRound.players[0].hand.map((entry) => entry.attribute);

    expect(new Set(drawnAttributes).size).toBeGreaterThan(1);
  });

  it("charge role makes thunder more likely than an equal two-attribute deck", () => {
    const game = createGame("role_charge");
    const player = game.players[0];
    const allCards = [...player.hand, ...player.deck];
    const fireCard = allCards.find((entry) => entry.attribute === "fire");
    const thunderCard = allCards.find((entry) => entry.attribute === "thunder");
    expect(fireCard).toBeDefined();
    expect(thunderCard).toBeDefined();

    player.hand = [];
    player.field = [];
    player.discard = [];
    player.removed = [];
    player.deck = [fireCard!, thunderCard!].map((card) => ({
      ...card,
      zone: "deck" as const
    }));
    game.phase = "round_end";
    game.round = 1;
    game.rngSeed = "find-8";
    player.drawSequence = 0;
    player.drawAttributeWeights = { thunder: 1 };

    const nextRound = finalizeRoundAndAdvance(game, []);
    expect(nextRound.players[0].hand[0]?.attribute).toBe("thunder");
  });

  it("invalidated cards are skipped before target selection is requested", () => {
    const game = createGame();
    ensureCardsInHand(game, ["fire_kagerou", "none_buildup", "none_hybrid"]);
    const kagerou = game.players[0].hand.find((entry) => entry.definitionId === "fire_kagerou");
    const buildup = game.players[0].hand.find((entry) => entry.definitionId === "none_buildup");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(kagerou).toBeDefined();
    expect(buildup).toBeDefined();
    expect(hybrid).toBeDefined();

    const started = startRoundResolution(game, [kagerou!.instanceId, buildup!.instanceId, hybrid!.instanceId]);
    expect(getCurrentResolutionCard(started)?.definitionId).toBe("fire_kagerou");

    const afterKagerou = resolveNextCard(started, {});
    expect(getCurrentResolutionCard(afterKagerou)).toBeNull();
    expect(getCurrentResolutionTargetKeys(afterKagerou)).toEqual([]);
  });

  it("stops immediate additional activation resolution when the next additional card needs a target", () => {
    const game = createGame();
    ensureCardsInHand(game, ["fire_karyoku_hatsuden", "wind_amakakeru_tsubasa", "none_hybrid"]);
    const karyoku = game.players[0].hand.find((entry) => entry.definitionId === "fire_karyoku_hatsuden");
    const tsubasa = game.players[0].hand.find((entry) => entry.definitionId === "wind_amakakeru_tsubasa");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(karyoku).toBeDefined();
      expect(tsubasa).toBeDefined();
      expect(hybrid).toBeDefined();

      karyoku!.counters = {
        ...(karyoku!.counters ?? {}),
        seal_progress_ally_attribute_activation_total_at_least_fire: 10
      };

    const started = startRoundResolution(game, [karyoku!.instanceId, tsubasa!.instanceId, hybrid!.instanceId]);
    expect(getCurrentResolutionCard(started)?.definitionId).toBe("fire_karyoku_hatsuden");

    const afterKaryoku = resolveNextCard(started, {});
    expect(getCurrentResolutionCard(afterKaryoku)?.definitionId).toBe("wind_amakakeru_tsubasa");
    expect(getCurrentResolutionTargetKeys(afterKaryoku)).toEqual(["apply_enchant"]);
  });

  it("hyakka ryoran can queue into karyoku hatsuden and still stop on amakakeru tsubasa target selection", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hyakka_ryoran", "fire_karyoku_hatsuden", "wind_amakakeru_tsubasa", "none_hybrid"]);
    const hyakka = game.players[0].hand.find((entry) => entry.definitionId === "none_hyakka_ryoran");
    const karyoku = game.players[0].hand.find((entry) => entry.definitionId === "fire_karyoku_hatsuden");
    const tsubasa = game.players[0].hand.find((entry) => entry.definitionId === "wind_amakakeru_tsubasa");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(hyakka).toBeDefined();
    expect(karyoku).toBeDefined();
    expect(tsubasa).toBeDefined();
    expect(hybrid).toBeDefined();

    game.players[0].attributeActivationCounts.fire = 10;
    game.rngSeed = "hyakka-karyoku-tsubasa";

    const started = startRoundResolution(game, [
      hyakka!.instanceId,
      karyoku!.instanceId,
      tsubasa!.instanceId,
      hybrid!.instanceId
    ]);

    const afterHyakka = resolveNextCard(started, {});
    expect(afterHyakka.pendingResolution).not.toBeNull();
    expect(getCurrentResolutionCard(afterHyakka)?.definitionId).toBe("wind_amakakeru_tsubasa");
    expect(getCurrentResolutionTargetKeys(afterHyakka)).toEqual(["apply_enchant"]);
  });

  it("logs which effect queued an additional activation", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "thunder_vortex"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const vortex = game.players[0].hand.find((entry) => entry.definitionId === "thunder_vortex");
    expect(hybrid).toBeDefined();
    expect(vortex).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: vortex!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(
      afterResolve.log.some(
        (entry) =>
          entry.code === "ADDITIONAL_ACTIVATION_QUEUED" &&
          entry.message.includes("追加で発動")
      )
    ).toBe(true);
  });

  it("kowareta kikai transforms into taiko no kikai after its seal is satisfied", () => {
    const game = createGame();
    ensureCardsInHand(game, ["thunder_kowareta_kikai", "thunder_static", "none_punch"]);
    const broken = game.players[0].hand.find((entry) => entry.definitionId === "thunder_kowareta_kikai");
    const thunderStatic = game.players[0].hand.find((entry) => entry.definitionId === "thunder_static");
    const punch = game.players[0].hand.find((entry) => entry.definitionId === "none_punch");
    expect(broken).toBeDefined();
    expect(thunderStatic).toBeDefined();
    expect(punch).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: broken!.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: thunderStatic!.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: punch!.instanceId, order: 2, targetSelections: {} }
      ]
    });
    const brokenOnField = afterResolve.players[0].field.find((card) => card.instanceId === broken!.instanceId);
    expect(brokenOnField?.definitionId).toBe("thunder_kowareta_kikai");
    expect(brokenOnField?.counters?.seal_progress_ally_attribute_activation_total_at_least_thunder).toBe(1);

    brokenOnField!.counters = {
      ...(brokenOnField!.counters ?? {}),
      seal_progress_ally_attribute_activation_total_at_least_thunder: 10
    };

    const advanced = finalizeRoundAndAdvance(afterResolve, [thunderStatic!.instanceId, punch!.instanceId]);
    const nextRound = startRoundResolution(
      advanced,
      advanced.players[0].field.map((card) => card.instanceId)
    );
    expect(nextRound.players[0].field.some((card) => card.definitionId === "thunder_taiko_no_kikai")).toBe(true);
  });

  it("taiko no kikai is not included in the normal deck pool", () => {
    const taikoDefinition = sampleCards.find((entry) => entry.id === "thunder_taiko_no_kikai");
    expect(taikoDefinition?.deckEligible).toBe(false);
  });

  it("taiko no kikai uses its current numeric value for repeated activations and resets at round end", () => {
    const game = createGame();
    ensureCardsInHand(game, ["thunder_kowareta_kikai", "none_hybrid"]);
    const taiko = game.players[0].hand.find((entry) => entry.definitionId === "thunder_kowareta_kikai");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(taiko).toBeDefined();
    expect(hybrid).toBeDefined();
    taiko!.counters = {
      ...(taiko!.counters ?? {}),
      seal_progress_ally_attribute_activation_total_at_least_thunder: 10
    };

      const started = startRoundResolution(game, [taiko!.instanceId, hybrid!.instanceId]);
  
      const afterFirstTaiko = resolveNextCard(started, {});
      const taikoAfterFirstActivation = afterFirstTaiko.players[0].field.find((entry) => entry.definitionId === "thunder_taiko_no_kikai");
      expect(afterFirstTaiko.players[0].tempAttack).toBeGreaterThan(50);
      expect((taikoAfterFirstActivation?.counters?.taiko_growth ?? 0)).toBeGreaterThan(0);

    const afterHybrid = resolveNextCard(afterFirstTaiko, {});
    expect(
      afterHybrid.log.some(
        (entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED" && entry.message.includes("自己誘発")
      )
    ).toBe(true);

      const afterSecondTaiko = resolveNextCard(afterHybrid, {});
      expect(afterSecondTaiko.players[0].tempAttack).toBeGreaterThan(afterHybrid.players[0].tempAttack);

    const resolvedTaiko = afterSecondTaiko.players[0].field.find((entry) => entry.definitionId === "thunder_taiko_no_kikai");
    expect(resolvedTaiko?.counters?.merge_numeric ?? 0).toBe(0);
  });

  it("vortex does not trigger its own placed effect on self activation", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "thunder_vortex"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const vortex = game.players[0].hand.find((entry) => entry.definitionId === "thunder_vortex");
    expect(hybrid).toBeDefined();
    expect(vortex).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: vortex!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.players[0].baseAttack).toBe(80);
    expect(afterResolve.players[0].baseMagic).toBe(80);
    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED")).toHaveLength(1);
  });

  it("vortex only triggers once per round from the first allied activation", () => {
    const game = createGame();
    ensureCardCopiesInHand(game, "none_hybrid", 3);
    ensureCardCopiesInHand(game, "none_kintore", 3);
    ensureCardsInHand(game, ["thunder_vortex"]);

    const hybrids = game.players[0].hand.filter((entry) => entry.definitionId === "none_hybrid").slice(0, 3);
    const kintores = game.players[0].hand.filter((entry) => entry.definitionId === "none_kintore").slice(0, 3);
    const vortex = game.players[0].hand.find((entry) => entry.definitionId === "thunder_vortex");
    expect(hybrids).toHaveLength(3);
    expect(kintores).toHaveLength(3);
    expect(vortex).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: hybrids[0]!.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: kintores[0]!.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: hybrids[1]!.instanceId, order: 2, targetSelections: {} },
        { handInstanceId: kintores[1]!.instanceId, order: 3, targetSelections: {} },
        { handInstanceId: vortex!.instanceId, order: 4, targetSelections: {} },
        { handInstanceId: hybrids[2]!.instanceId, order: 5, targetSelections: {} },
        { handInstanceId: kintores[2]!.instanceId, order: 6, targetSelections: {} }
      ]
    });

    expect(afterResolve.players[0].baseAttack).toBe(200);
    expect(afterResolve.players[0].baseMagic).toBe(110);
    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED")).toHaveLength(1);
  });

  it("electric only retriggers its right neighbor once per round", () => {
    const game = createGame();
    ensureCardCopiesInHand(game, "none_hybrid", 2);
    ensureCardCopiesInHand(game, "none_kintore", 2);
    ensureCardsInHand(game, ["thunder_electric"]);

    const hybrids = game.players[0].hand.filter((entry) => entry.definitionId === "none_hybrid").slice(0, 2);
    const kintores = game.players[0].hand.filter((entry) => entry.definitionId === "none_kintore").slice(0, 2);
    const electric = game.players[0].hand.find((entry) => entry.definitionId === "thunder_electric");
    expect(hybrids).toHaveLength(2);
    expect(kintores).toHaveLength(2);
    expect(electric).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        { handInstanceId: hybrids[0]!.instanceId, order: 0, targetSelections: {} },
        { handInstanceId: electric!.instanceId, order: 1, targetSelections: {} },
        { handInstanceId: hybrids[1]!.instanceId, order: 2, targetSelections: {} },
        { handInstanceId: kintores[0]!.instanceId, order: 3, targetSelections: {} },
        { handInstanceId: kintores[1]!.instanceId, order: 4, targetSelections: {} }
      ]
    });

    expect(afterResolve.players[0].baseAttack).toBe(155);
    expect(afterResolve.players[0].baseMagic).toBe(95);
    expect(afterResolve.log.filter((entry) => entry.code === "ADDITIONAL_ACTIVATION_QUEUED")).toHaveLength(1);
  });

  it("ice field also enchants cards created later in the same round", () => {
    const game = createGame();
    ensureCardsInHand(game, ["ice_field", "water_dropout"]);
    const iceField = game.players[0].hand.find((entry) => entry.definitionId === "ice_field");
    const dropout = game.players[0].hand.find((entry) => entry.definitionId === "water_dropout");
    expect(iceField).toBeDefined();
    expect(dropout).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: iceField!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: dropout!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const aqua = afterResolve.players[0].field.find((entry) => entry.definitionId === "water_aqua");
    expect(aqua).toBeDefined();
    expect(aqua?.enchantments.map((entry) => entry.definitionId)).toContain("enchant_magic_plus_5");
    expect(afterResolve.players[0].baseAttack).toBe(60);
    expect(afterResolve.players[0].baseMagic).toBe(75);
  });

  it("one placed aura source only keeps one enchant per target", () => {
    const game = createGame();
    ensureCardsInHand(game, ["ice_field", "none_hybrid"]);
    const iceField = game.players[0].hand.find((entry) => entry.definitionId === "ice_field");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(iceField).toBeDefined();
    expect(hybrid).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: iceField!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: hybrid!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const resolvedHybrid = afterResolve.players[0].field.find((entry) => entry.instanceId === hybrid!.instanceId);
    expect(resolvedHybrid?.enchantments.filter((entry) => entry.definitionId === "enchant_magic_plus_5")).toHaveLength(1);
  });

  it("placed aura disappears when the source card leaves the field", () => {
    let game = createGame();
    ensureCardsInHand(game, ["ice_field", "fire_shoukyaku", "none_hybrid"]);
    const iceField = game.players[0].hand.find((entry) => entry.definitionId === "ice_field");
    const shoukyaku = game.players[0].hand.find((entry) => entry.definitionId === "fire_shoukyaku");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    expect(iceField).toBeDefined();
    expect(shoukyaku).toBeDefined();
    expect(hybrid).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: iceField!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: shoukyaku!.instanceId,
          order: 1,
          targetSelections: {
            destroy_target: iceField!.instanceId
          }
        },
        {
          handInstanceId: hybrid!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const resolvedHybrid = game.players[0].field.find((entry) => entry.instanceId === hybrid!.instanceId);
    expect(resolvedHybrid?.enchantments.filter((entry) => entry.definitionId === "enchant_magic_plus_5")).toHaveLength(0);
    expect(game.players[0].baseAttack).toBe(115);
    expect(game.players[0].baseMagic).toBe(135);
  });

  it("whole-field enchant logs are summarized", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "ice_field"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const iceField = game.players[0].hand.find((entry) => entry.definitionId === "ice_field");
    expect(hybrid).toBeDefined();
    expect(iceField).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: iceField!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const enchantLogs = afterResolve.log.filter((entry) => entry.code === "ENCHANT_APPLIED");
    expect(enchantLogs).toHaveLength(0);
  });

  it("consumed card can be temporarily restored and reactivated by another effect", () => {
    const baseBuildup = sampleCards.find((card) => card.id === "none_buildup");
    expect(baseBuildup).toBeDefined();

    const thunderBuildup: CardDefinition = {
      ...structuredClone(baseBuildup!),
      id: "thunder_buildup_test",
      name: "髮ｷ繝薙Ν繝峨い繝・・",
      attribute: "thunder",
      tags: ["test", "thunder"]
    };

    const game = createLocalGame({
      roleId: "role_simple",
      cards: [...sampleCards, thunderBuildup],
      roles: sampleRoles
    });

    ensureCardsInHand(game, ["none_hybrid", "thunder_buildup_test", "thunder_overcharge"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const buildup = game.players[0].hand.find((card) => card.definitionId === "thunder_buildup_test");
    const overcharge = game.players[0].hand.find((card) => card.definitionId === "thunder_overcharge");
    expect(hybrid).toBeDefined();
    expect(buildup).toBeDefined();
    expect(overcharge).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: buildup!.instanceId,
          order: 1,
          targetSelections: {
            apply_enchant: hybrid!.instanceId
          }
        },
        {
          handInstanceId: overcharge!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const enchantedHybrid = afterResolve.players[0].field.find((card) => card.instanceId === hybrid!.instanceId);
    expect(enchantedHybrid?.enchantments).toHaveLength(2);
    expect(afterResolve.players[0].discard.some((card) => card.definitionId === "thunder_buildup_test")).toBe(true);
  });

  it("summer furin grants both stat growth at next round start", () => {
    let game = createGame();
    ensureCardsInHand(game, ["wind_summer_furin"]);
    const card = game.players[0].hand.find((entry) => entry.definitionId === "wind_summer_furin");
    expect(card).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: card!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    const discardTargets = game.players[0].field
      .slice(0, Math.min(2, game.players[0].field.length))
      .map((entry) => entry.instanceId);
    game = finalizeRoundAndAdvance(game, discardTargets);

    expect(game.round).toBe(2);
    expect(game.players[0].baseAttack).toBe(150);
    expect(game.players[0].baseMagic).toBe(150);
  });

  it("blizzard applies frozen air enchantment and increases total damage", () => {
    const game = createGame();
    ensureCardsInHand(game, ["ice_blizzard"]);
    const card = game.players[0].hand.find((entry) => entry.definitionId === "ice_blizzard");
    expect(card).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: card!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.players[0].scoreThisRound).toBe(200);
    expect(afterResolve.players[0].field[0]?.enchantments.some((entry) => entry.definitionId === "enchant_frozen_air")).toBe(true);
  });

  it("kamaitachi grows its own numeric value at round end", () => {
    let game = createGame();
    ensureCardsInHand(game, ["wind_kamaitachi", "none_hybrid", "none_kintore"]);
    const kamaitachi = game.players[0].hand.find((entry) => entry.definitionId === "wind_kamaitachi");
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const kintore = game.players[0].hand.find((entry) => entry.definitionId === "none_kintore");
    expect(kamaitachi).toBeDefined();
    expect(hybrid).toBeDefined();
    expect(kintore).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: kintore!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: kamaitachi!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const placedCard = game.players[0].field.find((entry) => entry.instanceId === kamaitachi!.instanceId);
    expect(placedCard?.counters?.power ?? 0).toBe(30);

    game = finalizeRoundAndAdvance(game, [hybrid!.instanceId, kintore!.instanceId]);

    game = applyRoundPlan(game, {
      round: 2,
      mulliganInstanceIds: [],
      placements: []
    });

    expect(game.players[0].baseAttack).toBe(145);
    expect(game.players[0].scoreThisRound).toBe(290);
  });

  it("rewind copies the previous round last activated card effect as itself", () => {
    let game = createGame();
    ensureCardsInHand(game, ["none_punch"]);
    const punch = game.players[0].hand.find((entry) => entry.definitionId === "none_punch");
    expect(punch).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: punch!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    game = finalizeRoundAndAdvance(game, [punch!.instanceId]);
    ensureCardsInHand(game, ["wind_rewind"]);
    const rewind = game.players[0].hand.find((entry) => entry.definitionId === "wind_rewind");
    expect(rewind).toBeDefined();

    game = applyRoundPlan(game, {
      round: 2,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: rewind!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    expect(game.players[0].tempAttack).toBe(100);
    expect(game.players[0].scoreThisRound).toBe(200);
    expect(game.log.some((entry) => entry.code === "REWIND_APPLIED")).toBe(true);
  });

  it("air slash grows its own numeric value at round end", () => {
    let game = createGame();
    ensureCardsInHand(game, ["wind_air_slash"]);
    const airSlash = game.players[0].hand.find((entry) => entry.definitionId === "wind_air_slash");
    expect(airSlash).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: airSlash!.instanceId,
          order: 0,
          targetSelections: {}
        }
      ]
    });

    const placedCard = game.players[0].field.find((entry) => entry.instanceId === airSlash!.instanceId);
    expect(placedCard?.counters?.power ?? 0).toBe(20);
  });

  it("sukimakaze invalidates cards to the right and immediately triggers their round-end effects", () => {
    let game = createGame();
    ensureCardsInHand(game, ["wind_sukimakaze", "wind_kamaitachi", "wind_air_slash"]);
    const sukimakaze = game.players[0].hand.find((entry) => entry.definitionId === "wind_sukimakaze");
    const kamaitachi = game.players[0].hand.find((entry) => entry.definitionId === "wind_kamaitachi");
    const airSlash = game.players[0].hand.find((entry) => entry.definitionId === "wind_air_slash");
    expect(sukimakaze).toBeDefined();
    expect(kamaitachi).toBeDefined();
    expect(airSlash).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: sukimakaze!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: kamaitachi!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: airSlash!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const rightKamaitachi = game.players[0].field.find((entry) => entry.instanceId === kamaitachi!.instanceId);
    const rightAirSlash = game.players[0].field.find((entry) => entry.instanceId === airSlash!.instanceId);
    expect(rightKamaitachi?.isInvalidated).toBe(false);
    expect(rightAirSlash?.isInvalidated).toBe(false);
    expect(rightKamaitachi?.counters?.power ?? 0).toBe(90);
    expect(rightAirSlash?.counters?.power ?? 0).toBe(60);
    expect(game.log.some((entry) => entry.code === "ROUND_END_EFFECTS_TRIGGERED")).toBe(true);
  });

  it("kyojin no haniki moves nearby cards to the right end and makes already resolved cards activatable again", () => {
    let game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "none_kintore", "wind_kyojin_no_haniki"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const kintore = game.players[0].hand.find((entry) => entry.definitionId === "none_kintore");
    const haniki = game.players[0].hand.find((entry) => entry.definitionId === "wind_kyojin_no_haniki");
    expect(hybrid).toBeDefined();
    expect(kintore).toBeDefined();
    expect(haniki).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: kintore!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: haniki!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    expect(game.players[0].baseAttack).toBe(140);
    expect(game.players[0].baseMagic).toBe(80);
    expect(game.players[0].discard.some((entry) => entry.definitionId === "wind_kyojin_no_haniki")).toBe(true);
    expect(game.log.some((entry) => entry.code === "CARD_MOVED")).toBe(true);
  });

  it("daichi no ibuki schedules a round-end multiplier for cards remaining on the field", () => {
    let game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "none_kintore", "wind_daichi_no_ibuki"]);
    const hybrid = game.players[0].hand.find((entry) => entry.definitionId === "none_hybrid");
    const kintore = game.players[0].hand.find((entry) => entry.definitionId === "none_kintore");
    const ibuki = game.players[0].hand.find((entry) => entry.definitionId === "wind_daichi_no_ibuki");
    expect(hybrid).toBeDefined();
    expect(kintore).toBeDefined();
    expect(ibuki).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hybrid!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: kintore!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: ibuki!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const fieldHybrid = game.players[0].field.find((entry) => entry.instanceId === hybrid!.instanceId);
    const fieldKintore = game.players[0].field.find((entry) => entry.instanceId === kintore!.instanceId);
    expect(fieldHybrid?.counters?.merge_numeric ?? 0).toBe(7.5);
    expect(fieldKintore?.counters?.merge_numeric ?? 0).toBe(15);
    expect(game.players[0].scheduledRoundEndFieldNumericMultipliers).toHaveLength(0);
    expect(game.log.some((entry) => entry.code === "SCHEDULED_EFFECT_APPLIED")).toBe(true);
  });

  it("invalidated cards still trigger their round-end effects during the normal round-end flow", () => {
    let game = createGame();
    ensureCardsInHand(game, ["fire_kagerou", "wind_kamaitachi", "wind_air_slash"]);
    const kagerou = game.players[0].hand.find((entry) => entry.definitionId === "fire_kagerou");
    const kamaitachi = game.players[0].hand.find((entry) => entry.definitionId === "wind_kamaitachi");
    const airSlash = game.players[0].hand.find((entry) => entry.definitionId === "wind_air_slash");
    expect(kagerou).toBeDefined();
    expect(kamaitachi).toBeDefined();
    expect(airSlash).toBeDefined();

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: kagerou!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: kamaitachi!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: airSlash!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const rightKamaitachi = game.players[0].field.find((entry) => entry.instanceId === kamaitachi!.instanceId);
    const rightAirSlash = game.players[0].field.find((entry) => entry.instanceId === airSlash!.instanceId);
    expect(rightKamaitachi?.isInvalidated).toBe(false);
    expect(rightAirSlash?.isInvalidated).toBe(false);
    expect(rightKamaitachi?.counters?.power ?? 0).toBe(30);
    expect(rightAirSlash?.counters?.power ?? 0).toBe(20);
  });

  it("tsumujikaze gains +20 numeric value per connected wind card after activating", () => {
    let game = createGame();
    ensureCardsInHand(game, ["wind_rewind", "wind_tsumujikaze", "wind_sukimakaze"]);
    const windRewind = game.players[0].hand.find((entry) => entry.definitionId === "wind_rewind");
    const tsumujikaze = game.players[0].hand.find((entry) => entry.definitionId === "wind_tsumujikaze");
    const sukimakaze = game.players[0].hand.find((entry) => entry.definitionId === "wind_sukimakaze");
    expect(windRewind).toBeDefined();
    expect(tsumujikaze).toBeDefined();
    expect(sukimakaze).toBeDefined();

    const beforeAttack = game.players[0].baseAttack;
    const beforeMagic = game.players[0].baseMagic;

    game = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: windRewind!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: tsumujikaze!.instanceId,
          order: 1,
          targetSelections: {}
        },
        {
          handInstanceId: sukimakaze!.instanceId,
          order: 2,
          targetSelections: {}
        }
      ]
    });

    const placedCard = game.players[0].field.find((entry) => entry.instanceId === tsumujikaze!.instanceId);
    expect(game.players[0].baseAttack).toBe(beforeAttack + 10);
    expect(game.players[0].baseMagic).toBe(beforeMagic + 10);
    expect(placedCard?.counters?.power ?? 0).toBe(40);
  });

  it("slime fusion multiplies the original card values, so +20 and +20 become +400", () => {
    const game = createGame();
    ensureCardCopiesInHand(game, "water_slime", 2);
    const slimes = game.players[0].hand.filter((entry) => entry.definitionId === "water_slime").slice(0, 2);
    expect(slimes).toHaveLength(2);

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: slimes[0]!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: slimes[1]!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.players[0].field).toHaveLength(1);
    const fusedSlime = afterResolve.players[0].field[0];
    expect(fusedSlime?.definitionId).toBe("water_slime");
    expect(fusedSlime?.counters?.merge_numeric).toBe(380);
    expect(afterResolve.players[0].baseAttack).toBe(450);
  });

  it("logs initial draw, mulligan, then refill in order", () => {
    const game = createGame();
    const targetIds = game.players[0].hand.slice(0, 2).map((card) => card.instanceId);
    const afterMulligan = applyMulliganOnly(game, targetIds);
    const codes = afterMulligan.log.map((entry) => entry.code);

    expect(codes).toContain("MULLIGAN_USED");
    expect(codes[codes.length - 2]).toBe("MULLIGAN_USED");
    expect(codes[codes.length - 1]).toBe("DRAW_UP_TO");
  });

  it("sealed karyoku hatsuden does not grant extra activations until 10 fire activations are reached", () => {
    const game = createGame();
    ensureCardsInHand(game, ["fire_karyoku_hatsuden", "none_punch"]);
    const hatsuden = game.players[0].hand.find((card) => card.definitionId === "fire_karyoku_hatsuden");
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch");
    expect(hatsuden).toBeDefined();
    expect(punch).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hatsuden!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: punch!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const punchActivations = afterResolve.replayEvents.filter(
      (event) => event.type === "CARD_ACTIVATED" && event.instanceId === punch!.instanceId
    );
    expect(punchActivations).toHaveLength(1);
    expect(afterResolve.log.some((entry) => entry.code === "CARD_SKIPPED_SEALED")).toBe(true);
    expect(
      afterResolve.players[0].field.find((card) => card.instanceId === hatsuden!.instanceId)?.counters
        ?.seal_progress_ally_attribute_activation_total_at_least_fire ?? 0
    ).toBe(0);
  });

  it("unsealed karyoku hatsuden grants one additional activation to all field cards at round start", () => {
    const game = createGame();
    ensureCardsInHand(game, ["fire_karyoku_hatsuden", "none_punch"]);
    const hatsuden = game.players[0].hand.find((card) => card.definitionId === "fire_karyoku_hatsuden");
    const punch = game.players[0].hand.find((card) => card.definitionId === "none_punch");
    expect(hatsuden).toBeDefined();
    expect(punch).toBeDefined();

    hatsuden!.counters = {
      ...(hatsuden!.counters ?? {}),
      seal_progress_ally_attribute_activation_total_at_least_fire: 10
    };

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: hatsuden!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: punch!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const punchActivations = afterResolve.replayEvents.filter(
      (event) => event.type === "CARD_ACTIVATED" && event.instanceId === punch!.instanceId
    );
    expect(punchActivations).toHaveLength(2);
  });

  it("meltdown destroys attached enchantments and gains +50 base magic per destroyed enchantment", () => {
    const game = createGame();
    ensureCardsInHand(game, ["wind_amakakeru_tsubasa", "ice_meltdown"]);
    const wing = game.players[0].hand.find((card) => card.definitionId === "wind_amakakeru_tsubasa");
    const meltdown = game.players[0].hand.find((card) => card.definitionId === "ice_meltdown");
    expect(wing).toBeDefined();
    expect(meltdown).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: wing!.instanceId,
          order: 0,
          targetSelections: {
            apply_enchant: meltdown!.instanceId
          }
        },
        {
          handInstanceId: meltdown!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    const resolvedMeltdown = afterResolve.players[0].field.find((card) => card.instanceId === meltdown!.instanceId);
    expect(resolvedMeltdown?.enchantments).toHaveLength(0);
    expect(afterResolve.players[0].baseMagic).toBe(100);
  });

  it("ice pick adds +10 to its own enchantment numeric values", () => {
    const game = createGame();
    ensureCardsInHand(game, ["ice_wall", "ice_ice_pick"]);
    const wall = game.players[0].hand.find((card) => card.definitionId === "ice_wall");
    const icePick = game.players[0].hand.find((card) => card.definitionId === "ice_ice_pick");
    expect(wall).toBeDefined();
    expect(icePick).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: wall!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: icePick!.instanceId,
          order: 1,
          targetSelections: {}
        }
      ]
    });

    expect(afterResolve.players[0].baseAttack).toBe(80);
  });

  it("dark gunzei doubles the chosen card's probability values", () => {
    const game = createGame();
    ensureCardsInHand(game, ["dark_shadow_step", "dark_gunzei"]);
    const shadowStep = game.players[0].hand.find((card) => card.definitionId === "dark_shadow_step");
    const gunzei = game.players[0].hand.find((card) => card.definitionId === "dark_gunzei");
    expect(shadowStep).toBeDefined();
    expect(gunzei).toBeDefined();

    const afterResolve = applyRoundPlan(game, {
      round: 1,
      mulliganInstanceIds: [],
      placements: [
        {
          handInstanceId: shadowStep!.instanceId,
          order: 0,
          targetSelections: {}
        },
        {
          handInstanceId: gunzei!.instanceId,
          order: 1,
          targetSelections: {
            scale_target_probability_values: shadowStep!.instanceId
          }
        }
      ]
    });

    const resolvedShadowStep = afterResolve.players[0].field.find((card) => card.instanceId === shadowStep!.instanceId);
    expect(resolvedShadowStep?.derived?.probabilityValueMultiplier).toBe(2);
  });

  it("requiem applies yureru tamashii to allied field cards", () => {
    const game = createGame();
    ensureCardsInHand(game, ["none_hybrid", "dark_requiem"]);
    const hybrid = game.players[0].hand.find((card) => card.definitionId === "none_hybrid");
    const requiem = game.players[0].hand.find((card) => card.definitionId === "dark_requiem");
    expect(hybrid).toBeDefined();
    expect(requiem).toBeDefined();

    const afterResolve = startRoundResolution(game, [hybrid!.instanceId, requiem!.instanceId]);

    const resolvedHybrid = afterResolve.players[0].field.find((card) => card.instanceId === hybrid!.instanceId);
    const resolvedRequiem = afterResolve.players[0].field.find((card) => card.instanceId === requiem!.instanceId);
    expect(resolvedHybrid?.enchantments.some((entry) => entry.definitionId === "enchant_yureru_tamashii")).toBe(true);
    expect(resolvedRequiem?.enchantments.some((entry) => entry.definitionId === "enchant_yureru_tamashii")).toBe(true);
  });
});

