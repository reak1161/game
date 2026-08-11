import type {
    CardDefinition,
    DamageSource,
    PendingAction,
    Role,
    StatKey,
} from '../../shared/types';

export type EngineCatalog = {
    roles: Role[];
    cards: CardDefinition[];
};

export interface PlayCardOptions {
    targets?: string[];
    handIndex?: number;
    choices?: Record<string, string | number | boolean | number[] | string[] | Record<string, unknown>>;
}

export interface RoleActionOptions {
    targetId?: string;
    choices?: Record<string, string | number | boolean>;
}

export type AbilityTriggerResult = {
    damageReduction?: number;
};

export type PendingSkip = {
    installInstanceId: string;
    effectIndex: number;
};

export type ForcedPromptDecision = PendingSkip & {
    decision: 'accept' | 'decline';
};

export type DamageResolutionOptions = {
    allowPrompt?: boolean;
    skipOptional?: PendingSkip;
    forcedPromptDecision?: ForcedPromptDecision;
    action?: PendingAction;
    cardId?: string;
    abilityId?: string;
    label?: string;
    contactAttack?: boolean;
    ignoreDefenseInstalls?: boolean;
};

export type MultiTargetDamagePlanItem = { targetId: string; amount: number };

export interface RoleAbilityContext {
    attackerId?: string;
    targetId?: string;
    damageSource?: DamageSource;
    damageAmount?: number;
    damageTaken?: number;
    damageDealt?: number;
    spentStatTokens?: number;
    stat?: StatKey;
    previousStatTotal?: number;
    nextStatTotal?: number;
    alivePlayers?: number;
}
