import type { LobbyDetail, LobbySummary, MatchmakingStatus } from '@shared/types';
import { withApiBase } from '@client/config/api';

export async function fetchLobbies(signal?: AbortSignal): Promise<LobbySummary[]> {
    const res = await fetch(withApiBase('/api/lobbies'), { credentials: 'include', signal });
    if (!res.ok) {
        throw new Error(`Failed to fetch lobbies: ${res.status}`);
    }
    const data = (await res.json()) as { lobbies?: LobbySummary[] };
    return Array.isArray(data.lobbies) ? data.lobbies : [];
}

export async function createLobby(payload: {
    lobbyName?: string;
    ownerName?: string;
    password?: string;
    deckId?: string;
}): Promise<{ lobbyId: string; ownerPlayerId: string }> {
    const res = await fetch(withApiBase('/api/lobbies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`Failed to create lobby: ${res.status}`);
    }
    const data = await res.json();
    return {
        lobbyId: data.lobby?.id ?? data.lobbyId ?? '',
        ownerPlayerId: data.ownerPlayerId,
    };
}

export async function fetchLobby(lobbyId: string, signal?: AbortSignal): Promise<LobbyDetail | null> {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}`), { credentials: 'include', signal });
    if (!res.ok) {
        if (res.status === 404) {
            return null;
        }
        throw new Error(`Failed to fetch lobby: ${res.status}`);
    }
    const data = (await res.json()) as { lobby?: LobbyDetail };
    return data.lobby ?? null;
}

export async function joinLobby(
    lobbyId: string,
    payload: { name: string; password?: string; roleId?: string; isSpectator?: boolean }
) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/join`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`Failed to join lobby: ${res.status}`);
    }
    return res.json();
}

export async function leaveLobby(lobbyId: string, playerId: string) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/leave`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId }),
    });
    if (!res.ok && res.status !== 204) {
        throw new Error(`Failed to leave lobby: ${res.status}`);
    }
}

export async function startLobby(lobbyId: string, playerId: string) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
        throw new Error(`Failed to start lobby: ${res.status}`);
    }
    return res.json() as Promise<{ matchId: string }>;
}

export async function setLobbyRole(lobbyId: string, playerId: string, roleId: string) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/role`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId, roleId }),
    });
    if (!res.ok) {
        throw new Error(`Failed to set lobby role: ${res.status}`);
    }
    return res.json();
}

export async function setLobbyReady(lobbyId: string, playerId: string, isReady: boolean) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/ready`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId, isReady }),
    });
    if (!res.ok) {
        throw new Error(`Failed to set lobby ready: ${res.status}`);
    }
    return res.json();
}

export async function setLobbySpectator(lobbyId: string, playerId: string, isSpectator: boolean) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/spectator`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId, isSpectator }),
    });
    if (!res.ok) {
        throw new Error(`Failed to set lobby spectator: ${res.status}`);
    }
    return res.json();
}

export async function addLobbyCpu(
    lobbyId: string,
    playerId: string,
    cpuCount = 1,
    cpuLevel: 'easy' | 'normal' | 'hard' = 'normal'
): Promise<LobbyDetail | null> {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/cpu`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId, cpuCount, cpuLevel }),
    });
    if (!res.ok) {
        throw new Error(`Failed to add CPU players: ${res.status}`);
    }
    const data = (await res.json()) as { lobby?: LobbyDetail };
    return data.lobby ?? null;
}

export async function updateLobbySettings(lobbyId: string, playerId: string, showRoles: boolean) {
    const res = await fetch(withApiBase(`/api/lobbies/${lobbyId}/settings`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId, showRoles }),
    });
    if (!res.ok) {
        throw new Error(`Failed to update lobby settings: ${res.status}`);
    }
    const data = (await res.json()) as { lobby?: LobbyDetail };
    return data.lobby ?? null;
}

export async function enqueueMatchmaking(name: string, roleId?: string | null, deckId = 'default_60') {
    const res = await fetch(withApiBase('/api/lobbies/matchmaking/enqueue'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, roleId: roleId ?? undefined, deckId }),
    });
    if (!res.ok) {
        throw new Error(`Failed to enqueue matchmaking: ${res.status}`);
    }
    return res.json() as Promise<{ ticketId: string }>;
}

export async function getMatchmakingStatus(ticketId: string) {
    const res = await fetch(withApiBase(`/api/lobbies/matchmaking/status/${ticketId}`), {
        credentials: 'include',
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch matchmaking status: ${res.status}`);
    }
    return res.json() as Promise<{ status: MatchmakingStatus; matchId?: string }>;
}

export async function cancelMatchmaking(ticketId: string) {
    const res = await fetch(withApiBase('/api/lobbies/matchmaking/cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ticketId }),
    });
    if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to cancel matchmaking: ${res.status}`);
    }
}
