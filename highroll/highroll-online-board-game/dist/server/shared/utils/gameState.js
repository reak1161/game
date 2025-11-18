"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMatchStatus = exports.updatePlayerScore = exports.consumeBra = exports.setBraTokens = exports.advanceTurnState = exports.setTurnOrder = exports.playCardFromHand = exports.drawFromSharedDeck = exports.setSharedDeck = exports.setPlayerRole = exports.setPlayerReady = exports.addPlayerToState = exports.createPlayer = exports.createInitialGameState = void 0;
const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};
const withTimestamp = (state) => ({
    ...state,
    updatedAt: Date.now(),
});
const generateId = () => {
    if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
        const cryptoObj = globalThis.crypto;
        if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID();
        }
    }
    return `player-${Math.random().toString(36).slice(2, 11)}`;
};
const createInitialGameState = (matchId, initialPlayers = []) => ({
    id: matchId,
    players: initialPlayers,
    currentTurn: 0,
    status: 'waiting',
    winnerId: undefined,
    board: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deckId: undefined,
    sharedDeck: [],
    sharedDiscard: [],
    hands: {},
    braTokens: {},
    currentPlayerId: undefined,
    turnOrder: [],
});
exports.createInitialGameState = createInitialGameState;
const createPlayer = (name) => ({
    id: generateId(),
    name,
    score: 0,
    isReady: false,
    joinedAt: Date.now(),
});
exports.createPlayer = createPlayer;
const addPlayerToState = (state, player) => {
    if (state.players.some((candidate) => candidate.id === player.id)) {
        return state;
    }
    return withTimestamp({
        ...state,
        players: [...state.players, player],
    });
};
exports.addPlayerToState = addPlayerToState;
const setPlayerReady = (state, playerId, isReady) => withTimestamp({
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, isReady } : player),
});
exports.setPlayerReady = setPlayerReady;
const setPlayerRole = (state, playerId, roleId) => withTimestamp({
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, roleId } : player),
});
exports.setPlayerRole = setPlayerRole;
const setSharedDeck = (state, deckId, cards) => withTimestamp({
    ...state,
    deckId,
    sharedDeck: [...cards],
    sharedDiscard: [],
});
exports.setSharedDeck = setSharedDeck;
const drawFromSharedDeck = (state, playerId, count) => {
    if (count <= 0) {
        return state;
    }
    let deck = [...state.sharedDeck];
    let discard = [...state.sharedDiscard];
    const hand = state.hands[playerId] ?? [];
    const drawn = [];
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
exports.drawFromSharedDeck = drawFromSharedDeck;
const playCardFromHand = (state, playerId, cardId) => {
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
exports.playCardFromHand = playCardFromHand;
const setTurnOrder = (state, order) => withTimestamp({
    ...state,
    turnOrder: order,
    currentPlayerId: order[0],
    currentTurn: 0,
});
exports.setTurnOrder = setTurnOrder;
const advanceTurnState = (state) => {
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
exports.advanceTurnState = advanceTurnState;
const setBraTokens = (state, playerId, amount) => withTimestamp({
    ...state,
    braTokens: {
        ...state.braTokens,
        [playerId]: amount,
    },
});
exports.setBraTokens = setBraTokens;
const consumeBra = (state, playerId, amount = 1) => {
    const current = state.braTokens[playerId] ?? 0;
    return withTimestamp({
        ...state,
        braTokens: {
            ...state.braTokens,
            [playerId]: Math.max(0, current - amount),
        },
    });
};
exports.consumeBra = consumeBra;
const updatePlayerScore = (state, playerId, delta) => withTimestamp({
    ...state,
    players: state.players.map((player) => player.id === playerId ? { ...player, score: player.score + delta } : player),
});
exports.updatePlayerScore = updatePlayerScore;
const setMatchStatus = (state, status, winnerId) => withTimestamp({
    ...state,
    status,
    winnerId,
});
exports.setMatchStatus = setMatchStatus;
