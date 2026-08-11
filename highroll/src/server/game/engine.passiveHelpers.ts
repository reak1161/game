import type {
    RoleAbility,
    RoleAbilityThreshold,
    RoleAbilityValue,
    RoleAbilityValueSource,
    RoleAbilitySource,
} from '../../shared/types';
import type { RoleAbilityContext } from './engine.types';

// onStatTotalChanged の閾値跨ぎ回数を計算する。
export const calculateStatThresholdTriggers = (
    threshold: RoleAbilityThreshold | undefined,
    previous: number,
    next: number,
    direction: 'up' | 'down'
): number => {
    if (!threshold) {
        return direction === 'up' ? (next > previous ? 1 : 0) : next < previous ? 1 : 0;
    }
    const from = threshold.from ?? 0;
    const step = threshold.step ?? 1;
    if (step <= 0) {
        return 0;
    }
    if (direction === 'up') {
        if (next <= previous) {
            return 0;
        }
        const prevIndex = previous >= from ? Math.floor((previous - from) / step) : -1;
        const nextIndex = next >= from ? Math.floor((next - from) / step) : -1;
        return Math.max(0, nextIndex - prevIndex);
    }
    if (next >= previous) {
        return 0;
    }
    const prevIndex = previous <= from ? Math.floor((from - previous) / step) : -1;
    const nextIndex = next <= from ? Math.floor((from - next) / step) : -1;
    return Math.max(0, prevIndex - nextIndex);
};

// パッシブの条件一致判定。
export const isRoleAbilityConditionMet = (
    ability: Pick<RoleAbility, 'source' | 'condition'>,
    context: RoleAbilityContext
): boolean => {
    if (ability.source === 'attacker' && context.attackerId && context.attackerId === context.targetId) {
        return false;
    }
    const condition = ability.condition;
    if (!condition) {
        return true;
    }
    if (condition.sources?.length) {
        const src = context.damageSource;
        if (!src || !condition.sources.includes(src)) {
            return false;
        }
    }
    if (typeof condition.alivePlayers === 'number' && condition.alivePlayers !== context.alivePlayers) {
        return false;
    }
    if (condition.stat && context.stat && condition.stat !== context.stat) {
        return false;
    }
    return true;
};

// ability の対象（自身 or 攻撃者）を解決。
export const resolveAbilityTargetId = (
    source: RoleAbilitySource | undefined,
    ownerId: string,
    context: RoleAbilityContext
): string | undefined => {
    if (source === 'attacker') {
        return context.attackerId;
    }
    return ownerId;
};

// 文脈値から ability 数値を評価。
export const resolveAbilityValue = (
    value: RoleAbilityValue | number | undefined,
    context: RoleAbilityContext
): number => {
    if (typeof value === 'number') {
        return value;
    }
    if (!value) {
        return 0;
    }
    if ('from' in value) {
        return getAbilityContextValue(value.from, context);
    }
    if ('ratioOf' in value) {
        const base = getAbilityContextValue(value.ratioOf, context);
        const raw = base * value.ratio;
        switch (value.round) {
            case 'ceil':
                return Math.ceil(raw);
            case 'round':
                return Math.round(raw);
            case 'floor':
            default:
                return Math.floor(raw);
        }
    }
    return 0;
};

// ability で参照する文脈値を取得。
export const getAbilityContextValue = (source: RoleAbilityValueSource, context: RoleAbilityContext): number => {
    switch (source) {
        case 'damageTaken':
            return context.damageTaken ?? context.damageAmount ?? 0;
        case 'damageDealt':
            return context.damageDealt ?? 0;
        case 'spentStatTokens':
            return context.spentStatTokens ?? 0;
        case 'damageAmount':
        default:
            return context.damageAmount ?? 0;
    }
};
