import type { DamageSource, RoleAbility, RoleAbilitySpendTokenChoice } from '../../shared/types';
import type { AbilityTriggerResult, RoleAbilityContext } from './engine.types';

type ApplyBeforeDamageParams = {
    targetId: string;
    attackerId: string | undefined;
    amount: number;
    source: DamageSource;
    abilities: RoleAbility[];
    spendStatTokensForAbility: (playerId: string, spec: RoleAbilitySpendTokenChoice['spendStatToken'], limit: number) => number;
    executeAbilityActions: (ownerId: string, ability: RoleAbility, context: RoleAbilityContext) => AbilityTriggerResult;
    logDamageReduction: (details: { playerId: string; amount: number; source: 'ability'; abilityId: string; reason: string }) => void;
};

// 被ダメージ前パッシブを適用し、軽減後のダメージと内訳を返す。
export const applyBeforeDamageAbilitiesFlow = (params: ApplyBeforeDamageParams): { amount: number; breakdown: string[] } => {
    const { targetId, attackerId, amount, source, abilities, spendStatTokensForAbility, executeAbilityActions, logDamageReduction } =
        params;

    let remaining = amount;
    const breakdown: string[] = [];
    if (remaining <= 0) {
        return { amount: 0, breakdown };
    }
    if (abilities.length === 0) {
        return { amount: remaining, breakdown };
    }

    abilities.forEach((ability) => {
        if (remaining <= 0) {
            return;
        }
        if (ability.id === 'swiftwind_spend_spe_reduce_damage' && source !== 'role' && source !== 'card') {
            return;
        }
        const beforeRemaining = remaining;
        const abilityContext: RoleAbilityContext = {
            attackerId,
            targetId,
            damageAmount: remaining,
        };
        const spendSpec = ability.playerChoice?.spendStatToken;
        if (spendSpec) {
            const spent = spendStatTokensForAbility(targetId, spendSpec, remaining);
            if (spent > 0) {
                abilityContext.spentStatTokens = spent;
                remaining = Math.max(0, remaining);
            }
        }
        const result = executeAbilityActions(targetId, ability, abilityContext);
        if (result.damageReduction) {
            const reduced = Math.min(result.damageReduction, beforeRemaining);
            remaining = Math.max(0, remaining - result.damageReduction);
            const spentLabel =
                ability.id === 'swiftwind_spend_spe_reduce_damage' && abilityContext.spentStatTokens
                    ? `Speトークン${abilityContext.spentStatTokens}消費`
                    : undefined;
            logDamageReduction({
                playerId: targetId,
                amount: reduced,
                source: 'ability',
                abilityId: ability.id,
                reason: spentLabel ?? ability.text ?? ability.id,
            });
            if (ability.id === 'swiftwind_spend_spe_reduce_damage' && abilityContext.spentStatTokens) {
                breakdown.push(`疾風: Speトークン${abilityContext.spentStatTokens}消費で${reduced}軽減`);
            } else {
                breakdown.push(`${spentLabel ?? ability.text ?? ability.id}: ${reduced}軽減`);
            }
        }
        abilityContext.damageAmount = remaining;
    });

    return { amount: remaining, breakdown };
};
