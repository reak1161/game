import type { GameState, Player, PlayerRuntimeState } from '../types';

const createInitialBoardState = () => ({
    playerStates: {} as Record<string, PlayerRuntimeState>,
});

const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const withTimestamp = (state: GameState): GameState => ({
    ...state,
    updatedAt: Date.now(),
});

const generateId = (): string => {
    if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
        const cryptoObj = globalThis.crypto as Crypto | undefined;

        if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID();
        }
    }

    return `player-${Math.random().toString(36).slice(2, 11)}`;
};

export const createInitialGameState = (matchId: string, initialPlayers: Player[] = []): GameState => ({
    id: matchId,
    players: initialPlayers,
    currentTurn: 0,
    status: 'waiting',
    winnerId: undefined,
    board: createInitialBoardState(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deckId: undefined,
    sharedDeck: [],
    sharedDiscard: [],
    hands: {},
    braTokens: {},
    roleAttackUsed: {},
    logs: [],
    currentPlayerId: undefined,
    turnOrder: [],
});

export const createPlayer = (name: string, id?: string): Player => ({
    id: id ?? generateId(),
    name,
    score: 0,
    isReady: false,
    joinedAt: Date.now(),
});

export const addPlayerToState = (state: GameState, player: Player): GameState => {
    if (state.players.some((candidate) => candidate.id === player.id)) {
        return state;
    }

    return withTimestamp({
        ...state,
        players: [...state.players, player],
    });
};

export const setPlayerReady = (state: GameState, playerId: string, isReady: boolean): GameState =>
    withTimestamp({
        ...state,
        players: state.players.map((player) =>
            player.id === playerId ? { ...player, isReady } : player
        ),
    });

export const setPlayerRole = (state: GameState, playerId: string, roleId: string): GameState =>
    withTimestamp({
        ...state,
        players: state.players.map((player) =>
            player.id === playerId ? { ...player, roleId } : player
        ),
    });

export const setSharedDeck = (state: GameState, deckId: string, cards: string[]): GameState =>
    withTimestamp({
        ...state,
        deckId,
        sharedDeck: [...cards],
        sharedDiscard: [],
    });

export const drawFromSharedDeck = (state: GameState, playerId: string, count: number): GameState => {
    if (count <= 0) {
        return state;
    }

    let deck = [...state.sharedDeck];
    let discard = [...state.sharedDiscard];
    const hand = state.hands[playerId] ?? [];
    const drawn: string[] = [];

    for (let i = 0; i < count; i += 1) {
        if (deck.length === 0) {
            if (discard.length === 0) {
                break;
            }
            deck = discard;
            discard = [];
        }
        const top = deck.shift();
        if (!top) {
            break;
        }
        drawn.push(top);
    }

    if (drawn.length === 0) {
        return state;
    }

    return withTimestamp({
        ...state,
        sharedDeck: deck,
        sharedDiscard: discard,
        hands: {
            ...state.hands,
            [playerId]: [...hand, ...drawn],
        },
    });
};

export const playCardFromHand = (state: GameState, playerId: string, cardId: string): GameState => {
    const hand = state.hands[playerId] ?? [];
    const index = hand.indexOf(cardId);
    if (index === -1) {
        return state;
    }

    const newHand = [...hand];
    newHand.splice(index, 1);

    return withTimestamp({
        ...state,
        hands: {
            ...state.hands,
            [playerId]: newHand,
        },
        sharedDiscard: [...state.sharedDiscard, cardId],
    });
};

export const setTurnOrder = (state: GameState, order: string[]): GameState =>
    withTimestamp({
        ...state,
        turnOrder: order,
        currentPlayerId: order[0],
        currentTurn: 0,
    });

export const advanceTurnState = (state: GameState): GameState => {
    if (state.turnOrder.length === 0) {
        return state;
    }
    const nextIndex = (state.currentTurn + 1) % state.turnOrder.length;
    return withTimestamp({
        ...state,
        currentTurn: nextIndex,
        currentPlayerId: state.turnOrder[nextIndex],
    });
};

export const setBraTokens = (state: GameState, playerId: string, amount: number): GameState =>
    withTimestamp({
        ...state,
        braTokens: {
            ...state.braTokens,
            [playerId]: amount,
        },
    });

export const consumeBra = (state: GameState, playerId: string, amount = 1): GameState => {
    const current = state.braTokens[playerId] ?? 0;
    return withTimestamp({
        ...state,
        braTokens: {
            ...state.braTokens,
            [playerId]: Math.max(0, current - amount),
        },
    });
};

export const setPlayerRuntimeState = (state: GameState, playerId: string, runtime: PlayerRuntimeState): GameState =>
    withTimestamp({
        ...state,
        board: {
            ...state.board,
            playerStates: {
                ...state.board.playerStates,
                [playerId]: runtime,
            },
        },
    });

export const updatePlayerRuntimeState = (
    state: GameState,
    playerId: string,
    updater: (current?: PlayerRuntimeState) => PlayerRuntimeState
): GameState => {
    const updated = updater(state.board.playerStates[playerId]);
    return setPlayerRuntimeState(state, playerId, updated);
};

export const updatePlayerScore = (state: GameState, playerId: string, delta: number): GameState =>
    withTimestamp({
        ...state,
        players: state.players.map((player) =>
            player.id === playerId ? { ...player, score: player.score + delta } : player
        ),
    });

export const setMatchStatus = (state: GameState, status: GameState['status'], winnerId?: string): GameState =>
    withTimestamp({
        ...state,
        status,
        winnerId,
    });

