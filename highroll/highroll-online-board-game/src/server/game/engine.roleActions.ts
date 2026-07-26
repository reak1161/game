import { getEffectiveStatValue } from './effectUtils';
import type { CombatStatKey, CurseId, Player, PlayerRuntimeState, RoleRuntimeState, StatKey } from '../../shared/types';

// 放電: 蓄電トークンを全て消費し、他プレイヤーへ感電を付与する。
export const executeDischargeRelease = (params: {
    playerId: string;
    actionId: string;
    readRoleState: (playerId: string) => RoleRuntimeState;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
    players: Player[];
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
}): void => {
    const { playerId, actionId, readRoleState, updateRoleState, players, getRuntime } = params;
    if (actionId !== 'discharge_release') {
        throw new Error('unsupported_action');
    }

    const state = readRoleState(playerId);
    const charge = state.chargeTokens ?? 0;
    if (charge <= 0) {
        throw new Error('no_charge_tokens');
    }

    // 感電量は charge^2。放電実行時に自身の蓄電は0に戻す。
    const shockAmount = charge * charge;
    updateRoleState(playerId, (prev) => ({
        ...prev,
        chargeTokens: 0,
    }));

    // 自分以外の生存プレイヤーに感電を加算。
    players.forEach((target) => {
        if (target.id === playerId) {
            return;
        }
        const runtime = getRuntime(target.id);
        if (!runtime || runtime.isDefeated) {
            return;
        }
        updateRoleState(target.id, (prev) => ({
            ...prev,
            shockTokens: (prev.shockTokens ?? 0) + shockAmount,
        }));
    });
};

// 火炎: 対象1人に火炎スタックを付与する。
export const executeFlameApplyBurn = (params: {
    actionId: string;
    targetId?: string;
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
}): void => {
    const { actionId, targetId, getRuntime, updateRoleState } = params;
    if (actionId !== 'flame_apply_burn') {
        throw new Error('unsupported_action');
    }
    if (!targetId) {
        throw new Error('target_required');
    }

    const targetRuntime = getRuntime(targetId);
    if (!targetRuntime || targetRuntime.isDefeated) {
        throw new Error('invalid_target');
    }

    updateRoleState(targetId, (prev) => ({
        ...prev,
        burnStacks: (prev.burnStacks ?? 0) + 1,
    }));
};

// 抑制: 対象のロール能力を次ラウンドまで封じる。
export const executeSuppressLock = (params: {
    actionId: string;
    targetId?: string;
    currentRound: number;
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
}): void => {
    const { actionId, targetId, currentRound, getRuntime, updateRoleState } = params;
    if (actionId !== 'suppress_lock') {
        throw new Error('unsupported_action');
    }
    if (!targetId) {
        throw new Error('target_required');
    }

    const runtime = getRuntime(targetId);
    if (!runtime || runtime.isDefeated) {
        throw new Error('invalid_target');
    }

    updateRoleState(targetId, (prev) => ({
        ...prev,
        suppressedUntilRound: currentRound + 1,
    }));
};

// 時限爆弾: 対象1人へ3カウントの爆弾を設置する。
export const executeBombTimedBomb = (params: {
    actionId: string;
    playerId: string;
    targetId?: string;
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
}): string => {
    const { actionId, playerId, targetId, getRuntime, updateRoleState } = params;
    if (actionId !== 'bomb_timed_bomb') {
        throw new Error('unsupported_action');
    }
    if (!targetId) {
        throw new Error('target_required');
    }
    if (targetId === playerId) {
        throw new Error('invalid_target');
    }

    const targetRuntime = getRuntime(targetId);
    if (!targetRuntime || targetRuntime.isDefeated) {
        throw new Error('invalid_target');
    }

    updateRoleState(targetId, (prev) => ({
        ...prev,
        timedBomb: {
            sourcePlayerId: playerId,
            count: 3,
        },
    }));
    return 'timed_bomb_set';
};

// 医師: heal/anesthesia/surgery/reshape の個別効果を適用する。
export const executeDoctorAbility = (params: {
    actionId: string;
    targetId?: string;
    choices?: Record<string, string | number | boolean>;
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
    applyHealToPlayer: (playerId: string, amount: number) => void;
    mutatePlayerBaseStat: (playerId: string, stat: StatKey, mutator: (current: number) => number) => void;
}): void => {
    const { actionId, targetId, choices, getRuntime, updateRoleState, applyHealToPlayer, mutatePlayerBaseStat } = params;
    if (!targetId) {
        throw new Error('target_required');
    }

    const runtime = getRuntime(targetId);
    if (!runtime || runtime.isDefeated) {
        throw new Error('invalid_target');
    }

    switch (actionId) {
        case 'doctor_heal':
            applyHealToPlayer(targetId, 3);
            return;
        case 'doctor_anesthesia':
            // 次ターンにBra減衰を積む。
            updateRoleState(targetId, (prev) => ({
                ...prev,
                pendingBraPenalty: (prev.pendingBraPenalty ?? 0) + 1,
            }));
            return;
        case 'doctor_surgery':
            if (runtime.roleState?.surgeryPhase) {
                throw new Error('already_in_surgery');
            }
            // 手術開始: 固定フェーズと予約回復量を持たせる。
            updateRoleState(targetId, (prev) => ({
                ...prev,
                surgeryPhase: 'immobilize',
                scheduledHealAmount: 15,
            }));
            return;
        case 'doctor_reshape': {
            // 指定ステータスの1減/1増を適用。
            const statDown = String(choices?.statDown ?? '');
            const statUp = String(choices?.statUp ?? '');
            const allowedStats: StatKey[] = ['hp', 'atk', 'def', 'spe'];
            if (!allowedStats.includes(statDown as StatKey) || !allowedStats.includes(statUp as StatKey)) {
                throw new Error('invalid_stat_selection');
            }
            if (statDown === statUp) {
                throw new Error('same_stat_selected');
            }
            const downKey = statDown as StatKey;
            const upKey = statUp as StatKey;
            mutatePlayerBaseStat(targetId, downKey, (current) => Math.max(downKey === 'hp' ? 1 : 0, current - 1));
            mutatePlayerBaseStat(targetId, upKey, (current) => current + 1);
            return;
        }
        default:
            throw new Error('unsupported_action');
    }
};

// 脱皮: Defを捨ててAtk/Speへ変換する。
export const executeShedMolt = (params: {
    actionId: string;
    playerId: string;
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
    addStatTokensToPlayer: (playerId: string, stat: CombatStatKey, amount: number) => void;
    clearTurnBoostDef: (playerId: string) => void;
}): void => {
    const { actionId, playerId, getRuntime, addStatTokensToPlayer, clearTurnBoostDef } = params;
    if (actionId !== 'shed_molt') {
        throw new Error('unsupported_action');
    }

    const runtime = getRuntime(playerId);
    if (!runtime || runtime.isDefeated) {
        return;
    }

    // 有効Defの半分を変換量とする。
    const currentDef = Math.max(0, getEffectiveStatValue(runtime, 'def'));
    const gain = Math.floor(currentDef / 2);

    // Defは基礎+トークン+ターン補正を0に寄せる。
    const basePlusTokens = runtime.baseStats.def + runtime.statTokens.def;
    if (basePlusTokens !== 0) {
        addStatTokensToPlayer(playerId, 'def', -basePlusTokens);
    }
    if (runtime.turnBoosts.def !== 0) {
        clearTurnBoostDef(playerId);
    }

    if (gain > 0) {
        addStatTokensToPlayer(playerId, 'atk', gain);
        addStatTokensToPlayer(playerId, 'spe', gain);
    }
};

// 封印: 鎖系バフか手札封印を実行する。
export const executeSealAbility = (params: {
    actionId: string;
    playerId: string;
    targetId?: string;
    hands: Record<string, string[]>;
    readRoleState: (playerId: string) => RoleRuntimeState;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
    mutatePlayerBaseStat: (playerId: string, stat: CombatStatKey, mutator: (current: number) => number) => void;
    getPlayerName: (playerId: string) => string;
}): string | null => {
    const { actionId, targetId, hands, readRoleState, updateRoleState, mutatePlayerBaseStat, getPlayerName } = params;
    switch (actionId) {
        case 'seal_chain_atk':
            mutatePlayerBaseStat(params.playerId, 'atk', (current) => current + 2);
            return 'seal_chain_atk';
        case 'seal_chain_def':
            mutatePlayerBaseStat(params.playerId, 'def', (current) => current + 1);
            return 'seal_chain_def';
        case 'seal_chain_spe':
            mutatePlayerBaseStat(params.playerId, 'spe', (current) => current + 3);
            return 'seal_chain_spe';
        case 'seal_lock': {
            if (!targetId) {
                throw new Error('target_required');
            }
            const hand = hands[targetId] ?? [];
            if (hand.length === 0) {
                return `${getPlayerName(targetId)}:empty_hand`;
            }

            const state = readRoleState(targetId);
            const sealed = state.sealedHand ?? [];
            const sealedIndexSet = new Set(sealed.map((entry) => entry.index));
            const candidates = hand.map((_, idx) => idx).filter((idx) => !sealedIndexSet.has(idx));
            if (candidates.length === 0) {
                return `${getPlayerName(targetId)}:already_sealed`;
            }

            // まだ封印されていない位置からランダムで1枚封印する。
            const idx = candidates[Math.floor(Math.random() * candidates.length)];
            const cardId = hand[idx];
            if (!cardId) {
                return null;
            }
            updateRoleState(targetId, (prev) => ({
                ...prev,
                sealedHand: [...(prev.sealedHand ?? []), { index: idx, cardId }],
            }));
            return `seal_lock:${getPlayerName(targetId)}`;
        }
        default:
            throw new Error('unsupported_action');
    }
};

// 魔女: 対象手札1枚にランダムな呪いを付与する。
export const executeWitchCurse = (params: {
    actionId: string;
    targetId?: string;
    cursePool: CurseId[];
    hands: Record<string, string[]>;
    getRuntime: (playerId: string) => PlayerRuntimeState | undefined;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
    syncHandStatTokens: (playerId: string) => void;
    getPlayerName: (playerId: string) => string;
    getCurseLabel: (curseId: CurseId) => string;
}): string | null => {
    const { actionId, targetId, getRuntime, hands, updateRoleState, syncHandStatTokens, cursePool, getPlayerName, getCurseLabel } =
        params;
    if (actionId !== 'witch_curse') {
        throw new Error('unsupported_action');
    }
    if (!targetId) {
        throw new Error('target_required');
    }

    const targetRuntime = getRuntime(targetId);
    if (!targetRuntime || targetRuntime.isDefeated) {
        throw new Error('invalid_target');
    }

    const hand = hands[targetId] ?? [];
    if (hand.length === 0) {
        return `${getPlayerName(targetId)}:empty_hand`;
    }

    const idx = Math.floor(Math.random() * hand.length);
    const cardId = hand[idx];
    if (!cardId) {
        return null;
    }

    const curseId = cursePool[Math.floor(Math.random() * cursePool.length)];
    // 同じ手札位置の古い呪いを上書きする。
    updateRoleState(targetId, (prev) => {
        const next = (prev.cursedHand ?? []).filter((entry) => entry.index !== idx);
        return {
            ...prev,
            cursedHand: [...next, { index: idx, cardId, curseId }],
        };
    });
    syncHandStatTokens(targetId);
    return `witch_curse:${getPlayerName(targetId)}:${getCurseLabel(curseId)}`;
};

// 吸血: 手札1枚を血の紋様に登録する（自身HP-2）。
export const executeVampireBloodPattern = (params: {
    actionId: string;
    playerId: string;
    choices?: Record<string, string | number | boolean>;
    hand: string[];
    runtime?: PlayerRuntimeState;
    reduceHpDirectly: (playerId: string, amount: number) => void;
    updateRoleState: (playerId: string, mutator: (prev: RoleRuntimeState) => RoleRuntimeState) => void;
    syncHandStatTokens: (playerId: string) => void;
    getCardName: (cardId: string) => string;
}): string => {
    const { actionId, playerId, choices, hand, runtime, reduceHpDirectly, updateRoleState, syncHandStatTokens, getCardName } =
        params;
    if (actionId !== 'vampire_blood_pattern') {
        throw new Error('unsupported_action');
    }
    if (!runtime || runtime.isDefeated) {
        throw new Error('invalid_player');
    }
    if (hand.length === 0) {
        throw new Error('empty_hand');
    }

    const rawIndex = (choices as any)?.handIndex;
    const index = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : null;
    if (index === null || index < 0 || index >= hand.length) {
        throw new Error('invalid_hand_index');
    }
    const cardId = hand[index];
    if (!cardId) {
        throw new Error('invalid_hand_card');
    }

    // コスト処理 -> 紋様登録 -> 表示同期。
    reduceHpDirectly(playerId, 2);
    updateRoleState(playerId, (prev) => {
        const existing = prev.bloodPatternHand ?? [];
        const next = [...existing.filter((entry) => entry.index !== index), { index, cardId }].sort((a, b) => a.index - b.index);
        return { ...prev, bloodPatternHand: next };
    });
    syncHandStatTokens(playerId);
    return `血の紋様: ${getCardName(cardId)}`;
};

// 道化: 確率テーブルに基づいてランダム効果を1つ実行する。
export const executeJesterRandom = (params: {
    actionId: string;
    playerId: string;
    alivePlayerIds: string[];
    drawCards: (playerId: string, amount: number) => void;
    mutatePlayerBaseStat: (playerId: string, stat: StatKey, mutator: (current: number) => number) => void;
    applyHealToPlayer: (playerId: string, amount: number) => void;
    addStatTokensToPlayer: (playerId: string, stat: CombatStatKey, amount: number) => void;
    dealAbilityDamage: (targetId: string, amount: number) => void;
    addBurnStacks: (playerId: string, amount: number) => void;
    consumeBraOne: (playerId: string) => void;
    setHpToOne: (playerId: string) => void;
    redrawHandSameCount: (playerId: string) => void;
    addCardEffectBonus: (playerId: string, amount: number) => void;
    random?: () => number;
}): string => {
    const {
        actionId,
        playerId,
        alivePlayerIds,
        drawCards,
        mutatePlayerBaseStat,
        applyHealToPlayer,
        addStatTokensToPlayer,
        dealAbilityDamage,
        addBurnStacks,
        consumeBraOne,
        setHpToOne,
        redrawHandSameCount,
        addCardEffectBonus,
        random = Math.random,
    } = params;
    if (actionId !== 'jester_random') {
        throw new Error('unsupported_action');
    }

    const roll = random() * 100;
    let cursor = 0;

    // 生存者からランダム対象を選ぶ（必要な効果だけで使用）。
    const pickRandomPlayerId = () => {
        if (alivePlayerIds.length === 0) return undefined;
        const index = Math.floor(random() * alivePlayerIds.length);
        return alivePlayerIds[index];
    };

    // 確率テーブルを上から順に評価する。
    const applyEffect = (chance: number, handler: () => void): boolean => {
        if (roll < cursor + chance) {
            handler();
            return true;
        }
        cursor += chance;
        return false;
    };

    if (applyEffect(20, () => drawCards(playerId, 1))) return '道化: ドロー+1';
    if (
        applyEffect(10, () => {
            mutatePlayerBaseStat(playerId, 'hp', (current) => current + 3);
            applyHealToPlayer(playerId, 3);
        })
    )
        return '道化: 最大HP+3 / HP+3';
    if (applyEffect(10, () => addStatTokensToPlayer(playerId, 'atk', 3))) return '道化: Atk+3';
    if (applyEffect(10, () => addStatTokensToPlayer(playerId, 'def', 2))) return '道化: Def+2';
    if (applyEffect(10, () => addStatTokensToPlayer(playerId, 'spe', 3))) return '道化: Spe+3';
    if (
        applyEffect(10, () => {
            const targetId = pickRandomPlayerId();
            if (targetId) dealAbilityDamage(targetId, 3);
        })
    )
        return '道化: ランダム3ダメージ';
    if (applyEffect(5, () => applyHealToPlayer(playerId, 8))) return '道化: HP+8';
    if (
        applyEffect(5, () => {
            alivePlayerIds.forEach((targetId) => {
                if (targetId !== playerId) dealAbilityDamage(targetId, 10);
            });
        })
    )
        return '道化: 全員に10ダメージ';
    if (
        applyEffect(5, () => {
            mutatePlayerBaseStat(playerId, 'hp', (current) => current + 10);
            applyHealToPlayer(playerId, 10);
            addStatTokensToPlayer(playerId, 'atk', 5);
            addStatTokensToPlayer(playerId, 'def', 5);
            addStatTokensToPlayer(playerId, 'spe', 5);
        })
    )
        return '道化: 超強化';
    if (applyEffect(3, () => addBurnStacks(playerId, 2))) return '道化: 火炎+2';
    if (applyEffect(3, () => consumeBraOne(playerId))) return '道化: Bra-1';
    if (applyEffect(3, () => setHpToOne(playerId))) return '道化: HP=1';
    if (applyEffect(3, () => redrawHandSameCount(playerId))) return '道化: 手札全交換';

    // 最後の3%に外れた場合は次回カード効果ボーナス。
    addCardEffectBonus(playerId, 2);
    return '道化: 次の効果+2';
};
