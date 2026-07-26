import type { GameState, ModifyTurnOrderEffect, PlayerRuntimeState } from '../../shared/types';

type TurnMode = ModifyTurnOrderEffect['mode'];

// 生存プレイヤーのみを Spe 順（昇順/降順）で並べる。
export const getSortedAliveTurnOrder = (params: {
    players: GameState['players'];
    playerStates: Record<string, PlayerRuntimeState | undefined>;
    mode: TurnMode;
    getSpe: (playerId: string) => number;
}): string[] => {
    const { players, playerStates, mode, getSpe } = params;
    return players
        .filter((player) => {
            const runtime = playerStates[player.id];
            return runtime && !runtime.isDefeated;
        })
        .slice()
        .sort((a, b) => {
            const speA = getSpe(a.id);
            const speB = getSpe(b.id);
            return mode === 'ascendingSpe' ? speA - speB : speB - speA;
        })
        .map((player) => player.id);
};

// 次ラウンド優先権（先頭/末尾移動）を適用し、消費済みなら priority をクリアする。
export const applyNextRoundPriority = (params: {
    order: string[];
    mode: TurnMode;
    nextRound: number;
    priority: GameState['nextRoundPriority'];
}): { order: string[]; nextRoundPriority?: GameState['nextRoundPriority'] } => {
    const { order, mode, nextRound, priority } = params;
    if (!priority) {
        return { order, nextRoundPriority: undefined };
    }
    if (priority.applyOnRound < nextRound) {
        return { order, nextRoundPriority: undefined };
    }
    if (priority.applyOnRound > nextRound) {
        return { order, nextRoundPriority: priority };
    }
    const idx = order.indexOf(priority.playerId);
    if (idx === -1) {
        return { order, nextRoundPriority: undefined };
    }
    const next = order.slice();
    next.splice(idx, 1);
    if (mode === 'ascendingSpe') {
        next.push(priority.playerId);
    } else {
        next.unshift(priority.playerId);
    }
    return { order: next, nextRoundPriority: undefined };
};

// ターン順モードの有効期限を判定し、次ラウンドで使う mode を返す。
export const resolveNextRoundMode = (params: {
    currentRound: number;
    nextRound: number;
    turnOrderMode?: TurnMode;
    turnOrderModeUntilRound?: number;
}): { mode: TurnMode; expire: boolean } => {
    const currentRound = Number.isFinite(params.currentRound) ? params.currentRound : 1;
    const expiresAt = params.turnOrderModeUntilRound ?? currentRound;
    const hasMode = Boolean(params.turnOrderMode);
    const expire = hasMode && params.nextRound > expiresAt;
    const mode = expire ? 'descendingSpe' : params.turnOrderMode ?? 'descendingSpe';
    return { mode, expire };
};
