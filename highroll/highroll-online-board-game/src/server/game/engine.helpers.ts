import type { PendingPrompt, Role } from '../../shared/types';

// roleId から Spe 基礎値を取得する。
export const getSpeByRoleId = (roleMap: Map<string, Role>, roleId?: string): number => {
    if (roleId && roleMap.has(roleId)) {
        return roleMap.get(roleId)?.params.spe ?? 0;
    }
    return 0;
};

// roleId から Bra 基礎値を取得する。
export const getBraByRoleId = (roleMap: Map<string, Role>, roleId?: string): number => {
    if (roleId && roleMap.has(roleId)) {
        return roleMap.get(roleId)?.params.bra ?? 1;
    }
    return 1;
};

// 登録ロールからランダムに1つ選ぶ（未登録なら undefined）。
export const pickRandomRoleId = (roleMap: Map<string, Role>, rand: () => number = Math.random): string | undefined => {
    const roleIds = Array.from(roleMap.keys());
    if (roleIds.length === 0) {
        return undefined;
    }
    const index = Math.floor(rand() * roleIds.length);
    return roleIds[index];
};

// カード効果倍率を決定する（抑制中は常に1倍）。
export const resolveCardEffectMultiplier = (params: {
    suppressed: boolean;
    runtimeMultiplier?: number;
    hasEfficiency: boolean;
}): number => {
    if (params.suppressed) {
        return 1;
    }
    if (typeof params.runtimeMultiplier === 'number' && params.runtimeMultiplier !== 0) {
        return params.runtimeMultiplier;
    }
    return params.hasEfficiency ? 2 : 1;
};

// 永続ボーナスと一時ボーナスを合算する。
export const resolveCardEffectBonus = (baseBonus: number | undefined, transientBonus: number | undefined): number => {
    return (baseBonus ?? 0) + (transientBonus ?? 0);
};

// 操作中プレイヤーの「実ロール + 複製ロール」ID一覧を構築する。
export const collectRoleAbilityIds = (params: { primaryRoleId?: string; copiedRoleIds: string[] }): string[] => {
    const { primaryRoleId, copiedRoleIds } = params;
    if (!primaryRoleId) {
        return [];
    }
    return [primaryRoleId, ...copiedRoleIds];
};

// 指定ロール能力を、実ロールまたは複製ロールが保持しているか判定する。
export const hasRoleAbilityId = (params: {
    primaryRoleId?: string;
    copiedRoleIds: string[];
    targetRoleId: string;
}): boolean => {
    const { primaryRoleId, copiedRoleIds, targetRoleId } = params;
    if (primaryRoleId === targetRoleId) {
        return true;
    }
    return copiedRoleIds.includes(targetRoleId);
};

// 指定ラウンド時点で能力封印（suppressed）が有効か判定する。
export const isSuppressedAtRound = (params: { currentRound: number; suppressedUntilRound?: number }): boolean => {
    const { currentRound, suppressedUntilRound } = params;
    if (typeof suppressedUntilRound !== 'number') {
        return false;
    }
    return currentRound <= suppressedUntilRound;
};

// CPU の割り込み応答（防御する/しない）を難易度別に決定する。
export const decideCpuPromptAcceptance = (params: {
    level: 'easy' | 'normal' | 'hard';
    prompt: PendingPrompt;
    random?: () => number;
}): boolean => {
    const { level, prompt, random = Math.random } = params;
    if (level === 'easy') {
        return random() < 0.5;
    }

    const preview = prompt.preview;
    if (!preview) {
        return prompt.amount >= 3;
    }

    const before = preview.ifDeclined;
    const after = preview.ifAccepted;
    const hpReduced = before.hpDamage - after.hpDamage;
    const totalReduced = before.totalAfterReductions - after.totalAfterReductions;

    if (level === 'hard') {
        return hpReduced > 0 || totalReduced > 0;
    }
    return hpReduced > 0;
};
