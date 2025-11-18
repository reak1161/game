const MATCH_KEY_PREFIX = 'highroll:matchPlayer:';
const LOBBY_KEY_PREFIX = 'highroll:lobbyPlayer:';

const getMatchKey = (matchId: string): string => `${MATCH_KEY_PREFIX}${matchId}`;
const getLobbyKey = (lobbyId: string): string => `${LOBBY_KEY_PREFIX}${lobbyId}`;

type StoredPlayer = {
    id: string;
    name?: string;
};

const writeValue = (key: string, value: StoredPlayer): void => {
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {
        // ignore storage errors (e.g., disabled cookies)
    }
};

const readValue = (key: string): StoredPlayer | null => {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as StoredPlayer;
    } catch (_error) {
        return null;
    }
};

export const rememberMatchPlayer = (matchId: string, playerId: string, name?: string): void => {
    if (!matchId || !playerId) return;
    writeValue(getMatchKey(matchId), { id: playerId, name });
};

export const getRememberedMatchPlayer = (matchId: string): StoredPlayer | null => {
    return readValue(getMatchKey(matchId));
};

export const clearRememberedMatchPlayer = (matchId: string): void => {
    try {
        sessionStorage.removeItem(getMatchKey(matchId));
    } catch (_error) {
        // ignore
    }
};

export const rememberLobbyPlayer = (lobbyId: string, playerId: string, name?: string): void => {
    if (!lobbyId || !playerId) return;
    writeValue(getLobbyKey(lobbyId), { id: playerId, name });
};

export const getRememberedLobbyPlayer = (lobbyId: string): StoredPlayer | null => {
    return readValue(getLobbyKey(lobbyId));
};

export const clearRememberedLobbyPlayer = (lobbyId: string): void => {
    try {
        sessionStorage.removeItem(getLobbyKey(lobbyId));
    } catch (_error) {
        // ignore
    }
};
