export type Attribute = "none" | "fire" | "water" | "ice" | "wind" | "thunder" | "earth" | "dark";
export type CardType = "attack" | "spell" | "ability";
export type EffectTiming = "activate" | "placed" | "consume" | "enchant";
export type CardZone = "deck" | "hand" | "field" | "discard" | "removed";
export type RelativePosition = "left_1" | "right_1";
export type PlacementTarget = "self" | "one_ally_field_card";
export type TriggerTarget = "ally_none_attribute_card" | "right_1_of_self";

export type TriggerDefinition =
  | { kind: "before_card_activates"; target?: TriggerTarget; attribute?: Attribute; cardType?: CardType }
  | { kind: "after_card_activates"; target?: TriggerTarget; attribute?: Attribute; cardType?: CardType }
  | { kind: "before_damage_dealt" }
  | { kind: "after_damage_dealt" }
  | { kind: "when_host_card_activates" }
  | { kind: "before_host_damage_calculation" }
  | { kind: "when_host_card_destroyed" }
  | { kind: "when_ally_field_card_destroyed" }
  | { kind: "on_enter_field" }
  | { kind: "on_field_state_check" }
  | { kind: "at_next_round_start" }
  | { kind: "at_round_end" };

export type ConditionDefinition =
  | { kind: "host_card_type_is"; value: CardType }
  | { kind: "is_final_round" }
  | { kind: "source_owner_is_self" }
  | { kind: "source_owner_is_self_and_not_host" }
  | { kind: "source_owner_is_self_and_not_host_and_attribute_matches_previous" }
  | { kind: "source_owner_is_self_and_not_host_and_definition_is"; definitionId: string }
  | { kind: "source_owner_is_self_and_not_host_and_definition_is_not"; definitionId: string }
  | { kind: "previous_attribute_exists" }
  | { kind: "adjacent_same_definition_exists"; definitionId: string }
  | { kind: "same_attribute_chain_at_least"; value: number }
  | { kind: "both_adjacent_attribute_is"; attribute: Attribute }
  | { kind: "ally_field_attribute_count_at_least"; attribute: Attribute; value: number };

export type SealConditionDefinition = {
  kind: "ally_attribute_activation_total_at_least";
  attribute: Attribute;
  value: number;
};

export type OperationDefinition =
  | { kind: "chance_percent"; value: number; operations: OperationDefinition[] }
  | { kind: "add_base_attack"; value: number }
  | { kind: "add_base_magic"; value: number }
  | { kind: "add_base_both"; value: number }
  | { kind: "add_draw_attribute_weight"; attribute: Attribute; value: number }
  | { kind: "add_base_attack_per_ally_field_card_count"; value: number }
  | { kind: "add_base_both_per_ally_field_card_count"; value: number }
  | { kind: "add_next_round_draw_bonus"; value: number }
  | { kind: "add_self_enchant_numeric_bonus"; value: number }
  | { kind: "add_self_numeric_counter"; counter: string; value: number }
  | { kind: "add_self_numeric_counter_per_connected_attribute_count"; counter: string; attribute: Attribute; value: number }
  | { kind: "multiply_temp_attack"; value: number }
  | { kind: "multiply_temp_magic"; value: number }
  | { kind: "multiply_temp_both"; value: number }
  | { kind: "multiply_base_magic"; value: number }
  | { kind: "multiply_base_both"; value: number }
  | { kind: "multiply_base_both_if_last_destroy_succeeded"; value: number }
  | { kind: "multiply_pending_damage"; value: number }
  | { kind: "multiply_self_numeric_counters"; value: number }
  | { kind: "multiply_temp_attack_per_last_invalidated_count"; value: number }
  | { kind: "multiply_temp_magic_per_last_destroy_count"; value: number }
  | { kind: "multiply_temp_magic_per_connected_attribute_count"; attribute: Attribute; value: number }
  | { kind: "multiply_temp_magic_per_self_enchant_count"; value: number }
  | { kind: "multiply_base_attack_per_connected_enchanted_count"; value: number }
  | { kind: "multiply_base_both_and_add_reduction_to_self_numeric"; value: number }
  | { kind: "scale_self_numeric_value"; value: number }
  | { kind: "scale_target_probability_values"; target: PlacementTarget; value: number }
  | { kind: "deal_damage_from_temp_attack" }
  | { kind: "deal_damage_from_temp_attack_fraction"; value: number }
  | { kind: "deal_damage_from_temp_magic" }
  | { kind: "deal_damage_from_max_temp_stat" }
  | { kind: "destroy_target"; target: PlacementTarget }
  | { kind: "destroy_relative_card"; relativePosition: RelativePosition }
  | { kind: "destroy_all_other_cards_on_own_field" }
  | { kind: "destroy_all_self_enchantments" }
  | { kind: "destroy_self" }
  | { kind: "invalidate_all_right_cards" }
  | { kind: "invalidate_cards_with_attribute_different_from_previous" }
  | { kind: "trigger_round_end_effects_of_last_invalidated_cards" }
  | { kind: "apply_enchant"; target: PlacementTarget; enchantDefinitionId: string }
  | { kind: "apply_enchant_to_all_ally_field_cards"; enchantDefinitionId: string }
  | { kind: "apply_enchant_to_adjacent_cards"; enchantDefinitionId: string }
  | { kind: "create_token"; tokenDefinitionId: string; position: "right_of_self" | "chosen_positions"; count: number }
  | { kind: "merge_adjacent_same_definition_cards"; definitionId: string; mergeRule: "multiply_numeric_counters" }
  | { kind: "queue_additional_activation_for_leftmost_ally_field_card" }
  | { kind: "queue_additional_activation_for_all_ally_field_cards" }
  | { kind: "queue_additional_activation_for_relative_card"; relativePosition: RelativePosition }
  | { kind: "queue_random_additional_activations_excluding_self"; count: number }
  | { kind: "queue_additional_activation_for_self" }
  | { kind: "queue_additional_activation_for_source_card" }
  | { kind: "register_future_same_attribute_chain_multiplier"; value: number; scope: "after_this_card" }
  | { kind: "register_future_specific_attribute_chain_multiplier"; attribute: Attribute; value: number; scope: "after_this_card" }
  | { kind: "remove_self_enchant" }
  | { kind: "repeat_embedded_operation"; count: number; operations: OperationDefinition[] }
  | { kind: "repeat_previous_round_last_effect_as_self" }
  | { kind: "schedule_add_base_both_at_next_round_start"; value: number }
  | { kind: "schedule_host_revive_at_round_end"; position: "same_slot" }
  | { kind: "set_activating_card_attribute_to_previous_attribute" }
  | {
      kind: "transform_all_non_attribute_allies_to_attribute";
      excludedAttribute: Attribute;
      targetAttribute: Attribute;
      noneMultiplier: number;
      otherMultiplier: number;
    }
  | { kind: "set_pending_damage_to_zero" }
  | { kind: "set_round_placement_limit"; value: number }
  | { kind: "add_base_magic_per_last_removed_enchant_count"; value: number }
  | { kind: "destroy_each_ally_field_card_with_chance"; value: number };

export type EffectDefinition = {
  id: string;
  timing: EffectTiming;
  trigger?: TriggerDefinition | null;
  condition?: ConditionDefinition | null;
  roundTriggerLimit?: number;
  operations: OperationDefinition[];
};

export type CardTextValueBinding = {
  effectId: string;
  operationIndex: number;
  operationPath?: number[];
  occurrence: number;
  writtenValueKind?: "normal" | "probability" | "enchant";
  affectsValueKind?: "normal" | "probability" | "enchant";
};

export type RoundBuffDefinition = {
  id: string;
  name: string;
  description: string;
  iconAsset?: string | null;
};

export type SelectedRoundBuff = {
  instanceId: string;
  buffId: string;
};

export type CardDefinition = {
  id: string;
  name: string;
  type: CardType;
  attribute: Attribute;
  timings: EffectTiming[];
  text: string;
  effects: EffectDefinition[];
  textValueBindings?: CardTextValueBinding[];
  seal?: SealConditionDefinition;
  tags?: string[];
  consumeBehavior?: "discard" | "removed" | "stay";
  deckEligible?: boolean;
};

export type RoleDefinition = {
  id: string;
  name: string;
  description: string;
  initialBaseAttack: number;
  initialBaseMagic: number;
  passiveEffects: EffectDefinition[];
  restrictions?: {
    disallowCardTypes?: CardType[];
  };
};

export type EnchantmentInstance = {
  instanceId: string;
  definitionId: string;
  name: string;
  effects: EffectDefinition[];
  persistentSourceCardInstanceId?: string;
  persistentSourceEffectId?: string;
};

export type CardInstance = {
  instanceId: string;
  definitionId: string;
  name: string;
  type: CardType;
  attribute: Attribute;
  text: string;
  ownerPlayerId: string;
  zone: CardZone;
  fieldIndex?: number;
  isInvalidated?: boolean;
  isDestroyed?: boolean;
  isConsumed?: boolean;
  enchantments: EnchantmentInstance[];
  counters?: Record<string, number>;
  derived?: Record<string, number | string | boolean>;
};

export type EngineLogEntry = {
  id: string;
  ts: number;
  level: "debug" | "info" | "warn" | "error";
  code: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type ReplayEvent =
  | { type: "ROUND_START"; round: number }
  | { type: "CARD_ACTIVATED"; playerId: string; instanceId: string; attribute: Attribute; chainCount: number }
  | { type: "STATUS_CHANGED"; playerId: string; baseAttack: number; baseMagic: number; tempAttack: number; tempMagic: number }
  | { type: "CARD_CREATED"; playerId: string; instanceId: string; definitionId: string; fieldIndex: number }
  | { type: "CARD_DESTROYED"; playerId: string; instanceId: string }
  | { type: "CARD_INVALIDATED"; playerId: string; instanceId: string }
  | { type: "ENCHANT_APPLIED"; playerId: string; instanceId: string; enchantId: string }
  | { type: "DAMAGE_DEALT"; playerId: string; amount: number; source: string }
  | { type: "FINAL_ATTACK"; playerId: string; amount: number }
  | { type: "ROUND_END"; round: number };

export type PlayerState = {
  playerId: string;
  displayName: string;
  roleId: string;
  selectedRoundBuffs: SelectedRoundBuff[];
  drawSequence: number;
  drawAttributeWeights: Partial<Record<Attribute, number>>;
  attributeActivationCounts: Partial<Record<Attribute, number>>;
  roundDestroyedCardCount: number;
  currentRoundLastEffectDefinitionId: string | null;
  previousRoundLastEffectDefinitionId: string | null;
  baseAttack: number;
  baseMagic: number;
  tempAttack: number;
  tempMagic: number;
  hand: CardInstance[];
  field: CardInstance[];
  discard: CardInstance[];
  removed: CardInstance[];
  deck: CardInstance[];
  scoreThisRound: number;
  totalScore: number;
  statusFlags: string[];
  roundPlacementLimit: number;
  nextRoundDrawBonus: number;
  scheduledNextRoundBaseBothBonus: number;
  oncePerRound: {
    mulliganUsed: boolean;
  };
};

export type LocalGamePhase = "input" | "round_end" | "finished";

export type GameState = {
  gameId: string;
  round: number;
  phase: LocalGamePhase;
  players: PlayerState[];
  rngSeed: string;
  log: EngineLogEntry[];
  replayEvents: ReplayEvent[];
};

export type SubmittedPlacement = {
  handInstanceId: string;
  order: number;
  targetSelections?: Record<string, string>;
};

export type SubmittedRoundData = {
  round: number;
  selectedHandIndexesToDiscard?: number[];
  mulliganInstanceIds: string[];
  placements: SubmittedPlacement[];
};
