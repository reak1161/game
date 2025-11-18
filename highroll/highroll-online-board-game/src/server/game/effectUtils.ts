import type {
    CombatStatKey,
    DamageFormula,
    PlayerRuntimeState,
    Role,
    RoleParams,
    StatKey,
    ValueFormula,
} from '../../shared/types';

const cloneRoleParams = (params: RoleParams): RoleParams => ({
    hp: params.hp,
    atk: params.atk,
    def: params.def,
    spe: params.spe,
    bra: params.bra,
});

const emptyModifiers = () => ({
    atk: 0,
    def: 0,
    spe: 0,
    bra: 0,
});

export const createRuntimeStateFromRole = (playerId: string, role: Role): PlayerRuntimeState => ({
    playerId,
    roleId: role.id,
    hp: role.params.hp,
    maxHp: role.params.hp,
    tempHp: 0,
    baseStats: cloneRoleParams(role.params),
    statTokens: emptyModifiers(),
    turnBoosts: emptyModifiers(),
    installs: [],
    roleState: {},
});

export const getEffectiveStatValue = (
    runtime: PlayerRuntimeState | undefined,
    stat: CombatStatKey | 'bra'
): number => {
    if (!runtime) {
        return 0;
    }

    const key = stat as keyof RoleParams;
    return (
        (runtime.baseStats[key] ?? 0) +
        (runtime.statTokens[stat] ?? 0) +
        (runtime.turnBoosts[stat] ?? 0)
    );
};

const applyRounding = (value: number, mode: DamageFormula['round'] | ValueFormula['round']): number => {
    switch (mode) {
        case 'ceil':
            return Math.ceil(value);
        case 'round':
            return Math.round(value);
        case 'floor':
        default:
            return Math.floor(value);
    }
};

export const evaluateDamageFormula = (
    formula: DamageFormula,
    runtime: PlayerRuntimeState | undefined
): number => {
    if (!runtime) {
        return 0;
    }

    switch (formula.type) {
        case 'selfStatHalf': {
            const statValue = getEffectiveStatValue(runtime, formula.stat);
            return applyRounding(statValue / 2, formula.round ?? 'floor');
        }
        default:
            return 0;
    }
};

export const evaluateValueFormula = (
    formula: ValueFormula,
    runtime: PlayerRuntimeState | undefined
): number => {
    if (!runtime) {
        return 0;
    }

    switch (formula.type) {
        case 'perN': {
            if (formula.n <= 0) {
                return 0;
            }
            const stat = formula.stat;
            const sourceValue: number =
                stat === 'hp'
                    ? runtime.baseStats.hp
                    : getEffectiveStatValue(runtime, stat as CombatStatKey | 'bra');
            return applyRounding(sourceValue / formula.n, formula.round ?? 'floor');
        }
        default:
            return 0;
    }
};

export const mutateBaseStat = (
    runtime: PlayerRuntimeState,
    stat: StatKey,
    mutator: (current: number) => number
): PlayerRuntimeState => {
    const key = stat as keyof RoleParams;
    const nextBase: RoleParams = {
        ...runtime.baseStats,
        [stat]: mutator(runtime.baseStats[key]),
    };

    let nextHp = runtime.hp;
    let nextMaxHp = runtime.maxHp;
    if (stat === 'hp') {
        nextMaxHp = nextBase.hp;
        nextHp = Math.min(nextHp, nextMaxHp);
    }

    return {
        ...runtime,
        baseStats: nextBase,
        hp: nextHp,
        maxHp: nextMaxHp,
    };
};
