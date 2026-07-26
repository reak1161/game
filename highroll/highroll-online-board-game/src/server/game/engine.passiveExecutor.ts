import type { CombatStatKey, RoleAbility } from '../../shared/types';
import type { AbilityTriggerResult, RoleAbilityContext } from './engine.types';

type ExecuteAbilityParams = {
    ownerId: string;
    ability: RoleAbility;
    context: RoleAbilityContext;
    resolveAbilityTargetId: (ability: RoleAbility, ownerId: string, context: RoleAbilityContext) => string | undefined;
    resolveAbilityValue: (value: unknown, context: RoleAbilityContext) => number;
    addStatTokensToPlayer: (playerId: string, stat: CombatStatKey | 'bra', delta: number) => void;
    setTargetMaxHp: (playerId: string, hp: number) => void;
    setTargetHp: (playerId: string, spec: { min?: number; max?: number; set?: number }) => void;
    applyAbilityDamage: (sourcePlayerId: string, targetPlayerId: string, ability: RoleAbility, amount: number) => void;
};

// 1つの能力に含まれる actions を順に実行する共通エグゼキュータ。
export const executeAbilityActionsByRule = (params: ExecuteAbilityParams): AbilityTriggerResult => {
    const {
        ownerId,
        ability,
        context,
        resolveAbilityTargetId,
        resolveAbilityValue,
        addStatTokensToPlayer,
        setTargetMaxHp,
        setTargetHp,
        applyAbilityDamage,
    } = params;

    let damageReduction = 0;
    const targetId = resolveAbilityTargetId(ability, ownerId, context);

    for (const action of ability.actions ?? []) {
        if ('addStatToken' in action) {
            const value = resolveAbilityValue(action.addStatToken.value, context);
            if (targetId && value !== 0) {
                addStatTokensToPlayer(targetId, action.addStatToken.stat, value);
            }
            continue;
        }

        if ('reduceIncomingDamageBy' in action) {
            const value =
                action.reduceIncomingDamageBy === 'spent'
                    ? context.spentStatTokens ?? 0
                    : resolveAbilityValue(action.reduceIncomingDamageBy, context);
            if (value > 0) {
                damageReduction += value;
            }
            continue;
        }

        if ('setMaxHp' in action) {
            if (targetId) {
                setTargetMaxHp(targetId, action.setMaxHp);
            }
            continue;
        }

        if ('setHp' in action) {
            if (targetId) {
                setTargetHp(targetId, action.setHp);
            }
            continue;
        }

        if ('selfDamage' in action) {
            const value = resolveAbilityValue(action.selfDamage.value, context);
            if (value > 0) {
                applyAbilityDamage(ownerId, ownerId, ability, value);
            }
            continue;
        }

        if ('dealDamageToSource' in action) {
            const target = targetId ?? context.attackerId;
            const value = resolveAbilityValue(action.dealDamageToSource.value, context);
            if (target && value > 0) {
                applyAbilityDamage(ownerId, target, ability, value);
            }
        }
    }

    return damageReduction > 0 ? { damageReduction } : {};
};
