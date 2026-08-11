const MATCH_KEY_PREFIX = 'highroll:matchPlayer:';
const LOBBY_KEY_PREFIX = 'highroll:lobbyPlayer:';
const MATCH_SPECTATOR_PREFIX = 'highroll:matchSpectator:';
const LOBBY_SPECTATOR_PREFIX = 'highroll:lobbySpectator:';

const getMatchKey = (matchId: string): string => `${MATCH_KEY_PREFIX}${matchId}`;
const getLobbyKey = (lobbyId: string): string => `${LOBBY_KEY_PREFIX}${lobbyId}`;
const getMatchSpectatorKey = (matchId: string): string => `${MATCH_SPECTATOR_PREFIX}${matchId}`;
const getLobbySpectatorKey = (lobbyId: string): string => `${LOBBY_SPECTATOR_PREFIX}${lobbyId}`;

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

const writeBool = (key: string, value: boolean): void => {
    try {
        sessionStorage.setItem(key, value ? '1' : '0');
    } catch (_error) {
        // ignore
    }
};

const readBool = (key: string): boolean => {
    try {
        const raw = sessionStorage.getItem(key);
        return raw === '1';
    } catch (_error) {
        return false;
    }
};

const removeKey = (key: string): void => {
    try {
        sessionStorage.removeItem(key);
    } catch (_error) {
        // ignore
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
    removeKey(getMatchKey(matchId));
};

export const rememberLobbyPlayer = (lobbyId: string, playerId: string, name?: string): void => {
    if (!lobbyId || !playerId) return;
    writeValue(getLobbyKey(lobbyId), { id: playerId, name });
};

export const getRememberedLobbyPlayer = (lobbyId: string): StoredPlayer | null => {
    return readValue(getLobbyKey(lobbyId));
};

export const clearRememberedLobbyPlayer = (lobbyId: string): void => {
    removeKey(getLobbyKey(lobbyId));
};

export const rememberMatchSpectator = (matchId: string, isSpectator: boolean): void => {
    if (!matchId) return;
    writeBool(getMatchSpectatorKey(matchId), Boolean(isSpectator));
};

export const getRememberedMatchSpectator = (matchId: string): boolean => {
    if (!matchId) return false;
    return readBool(getMatchSpectatorKey(matchId));
};

export const clearRememberedMatchSpectator = (matchId: string): void => {
    if (!matchId) return;
    removeKey(getMatchSpectatorKey(matchId));
};

export const rememberLobbySpectator = (lobbyId: string, isSpectator: boolean): void => {
    if (!lobbyId) return;
    writeBool(getLobbySpectatorKey(lobbyId), Boolean(isSpectator));
};

export const getRememberedLobbySpectator = (lobbyId: string): boolean => {
    if (!lobbyId) return false;
    return readBool(getLobbySpectatorKey(lobbyId));
};

export const clearRememberedLobbySpectator = (lobbyId: string): void => {
    if (!lobbyId) return;
    removeKey(getLobbySpectatorKey(lobbyId));
};
