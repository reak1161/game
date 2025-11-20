"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mutateBaseStat = exports.evaluateValueFormula = exports.evaluateDamageFormula = exports.getEffectiveStatValue = exports.createRuntimeStateFromRole = void 0;
const cloneRoleParams = (params) => ({
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
const createRuntimeStateFromRole = (playerId, role) => ({
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
exports.createRuntimeStateFromRole = createRuntimeStateFromRole;
const getEffectiveStatValue = (runtime, stat) => {
    if (!runtime) {
        return 0;
    }
    const key = stat;
    return ((runtime.baseStats[key] ?? 0) +
        (runtime.statTokens[stat] ?? 0) +
        (runtime.turnBoosts[stat] ?? 0));
};
exports.getEffectiveStatValue = getEffectiveStatValue;
const applyRounding = (value, mode) => {
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
const evaluateDamageFormula = (formula, runtime) => {
    if (!runtime) {
        return 0;
    }
    switch (formula.type) {
        case 'selfStatHalf': {
            const statValue = (0, exports.getEffectiveStatValue)(runtime, formula.stat);
            return applyRounding(statValue / 2, formula.round ?? 'floor');
        }
        default:
            return 0;
    }
};
exports.evaluateDamageFormula = evaluateDamageFormula;
const evaluateValueFormula = (formula, runtime) => {
    if (!runtime) {
        return 0;
    }
    switch (formula.type) {
        case 'perN': {
            if (formula.n <= 0) {
                return 0;
            }
            const stat = formula.stat;
            const sourceValue = stat === 'hp'
                ? runtime.baseStats.hp
                : (0, exports.getEffectiveStatValue)(runtime, stat);
            return applyRounding(sourceValue / formula.n, formula.round ?? 'floor');
        }
        default:
            return 0;
    }
};
exports.evaluateValueFormula = evaluateValueFormula;
const mutateBaseStat = (runtime, stat, mutator) => {
    const key = stat;
    const nextBase = {
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
exports.mutateBaseStat = mutateBaseStat;
