import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { CreatePlayerInput } from './matchRoutes';
import { createMatch } from './matchRoutes';
import { emitLobbyEvent } from '../sockets/gatewayContext';

interface LobbyPlayer {
    id: string;
    name: string;
    roleId?: string;
}

interface Lobby {
    id: string;
    name: string;
    ownerId: string;
    isPrivate: boolean;
    passwordHash?: string;
    deckId: string;
    players: LobbyPlayer[];
    createdAt: number;
}

interface MatchmakingTicket {
    id: string;
    name: string;
    roleId?: string;
    deckId?: string;
    createdAt: number;
    matchId?: string;
}

const DEFAULT_DECK_ID = 'default_60';

const router = Router();
const lobbies = new Map<string, Lobby>();
const matchmakingQueue: MatchmakingTicket[] = [];
const matchmakingResults = new Map<string, MatchmakingTicket>();

const hashPassword = (pw: string): string => createHash('sha256').update(pw).digest('hex');

const sanitizeName = (name?: string): string | undefined => {
    if (!name) return undefined;
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const findLobby = (id: string, res: Response): Lobby | undefined => {
    const lobby = lobbies.get(id);
    if (!lobby) {
        res.status(404).json({ message: `Lobby ${id} not found.` });
        return undefined;
    }
    return lobby;
};

router.get('/', (_req: Request, res: Response) => {
    const items = Array.from(lobbies.values()).map((lobby) => ({
        id: lobby.id,
        name: lobby.name,
        isPrivate: lobby.isPrivate,
        deckId: lobby.deckId,
        playerCount: lobby.players.length,
        createdAt: lobby.createdAt,
    }));
    res.json({ lobbies: items });
});

router.post('/', (req: Request, res: Response) => {
    const { lobbyName, ownerName, password, deckId = DEFAULT_DECK_ID } = req.body as {
        lobbyName?: string;
        ownerName?: string;
        password?: string;
        deckId?: string;
    };

    const resolvedName = sanitizeName(lobbyName) ?? 'Lobby';
    const owner = sanitizeName(ownerName) ?? 'Host';
    const lobbyId = randomUUID();
    const ownerId = randomUUID();

    const lobby: Lobby = {
        id: lobbyId,
        name: resolvedName,
        ownerId,
        isPrivate: Boolean(password && password.trim().length > 0),
        passwordHash: password ? hashPassword(password) : undefined,
        deckId,
        players: [
            {
                id: ownerId,
                name: owner,
            },
        ],
        createdAt: Date.now(),
    };

    lobbies.set(lobbyId, lobby);

    res.status(201).json({
        lobby,
        ownerPlayerId: ownerId,
    });
});

router.post('/:id/join', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { name, password, roleId } = req.body as { name?: string; password?: string; roleId?: string };
    const resolvedName = sanitizeName(name);

    if (!resolvedName) {
        res.status(400).json({ message: 'name is required.' });
        return;
    }

    if (lobby.passwordHash) {
        if (!password || hashPassword(password) !== lobby.passwordHash) {
            res.status(403).json({ message: 'Incorrect password.' });
            return;
        }
    }

    const player = { id: randomUUID(), name: resolvedName, roleId } satisfies LobbyPlayer;
    lobby.players.push(player);

    res.status(200).json({ lobbyId: lobby.id, player });
});

router.post('/:id/leave', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId } = req.body as { playerId?: string };
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }

    lobby.players = lobby.players.filter((player) => player.id !== playerId);

    if (lobby.players.length === 0) {
        lobbies.delete(lobby.id);
    }

    res.status(204).send();
});

router.post('/:id/start', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId } = req.body as { playerId?: string };
    if (!playerId || playerId !== lobby.ownerId) {
        res.status(403).json({ message: 'Only the lobby owner can start the match.' });
        return;
    }

    const players: CreatePlayerInput[] = lobby.players.map((player) => ({
        name: player.name,
        roleId: player.roleId,
        playerId: player.id,
    }));
    const { matchId, engine } = createMatch(players, { deckId: lobby.deckId });
    try {
        engine.start();
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
        return;
    }
    lobbies.delete(lobby.id);
    emitLobbyEvent(lobby.id, 'lobbyStarted', { lobbyId: lobby.id, matchId });

    res.status(200).json({ matchId });
});

router.post('/:id/role', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId, roleId } = req.body as { playerId?: string; roleId?: string };
    if (!playerId || !roleId) {
        res.status(400).json({ message: 'playerId and roleId are required.' });
        return;
    }

    const target = lobby.players.find((player) => player.id === playerId);
    if (!target) {
        res.status(404).json({ message: 'Player not found in lobby.' });
        return;
    }

    target.roleId = roleId;
    res.status(200).json({ lobbyId: lobby.id, player: target });
});

const tryMatchmaking = () => {
    while (matchmakingQueue.length >= 2) {
        const a = matchmakingQueue.shift();
        const b = matchmakingQueue.shift();
        if (!a || !b) {
            break;
        }

        const { matchId } = createMatch([
            { name: a.name, roleId: a.roleId },
            { name: b.name, roleId: b.roleId },
        ], { deckId: a.deckId ?? b.deckId ?? DEFAULT_DECK_ID });
        a.matchId = matchId;
        b.matchId = matchId;
        matchmakingResults.set(a.id, a);
        matchmakingResults.set(b.id, b);
    }
};

router.post('/matchmaking/enqueue', (req: Request, res: Response) => {
    const { name, roleId, deckId } = req.body as { name?: string; roleId?: string; deckId?: string };
    const resolvedName = sanitizeName(name) ?? 'Player';
    const ticket: MatchmakingTicket = {
        id: randomUUID(),
        name: resolvedName,
        roleId,
        deckId,
        createdAt: Date.now(),
    };
    matchmakingQueue.push(ticket);
    tryMatchmaking();
    res.status(202).json({ ticketId: ticket.id });
});

router.get('/matchmaking/status/:ticketId', (req: Request, res: Response) => {
    const ticketId = req.params.ticketId;
    const result = matchmakingResults.get(ticketId);
    if (result && result.matchId) {
        res.json({ status: 'matched', matchId: result.matchId });
        return;
    }

    const stillQueued = matchmakingQueue.find((ticket) => ticket.id === ticketId);
    if (stillQueued) {
        res.json({ status: 'waiting' });
        return;
    }

    res.status(404).json({ status: 'not_found' });
});

router.post('/matchmaking/cancel', (req: Request, res: Response) => {
    const { ticketId } = req.body as { ticketId?: string };
    if (!ticketId) {
        res.status(400).json({ message: 'ticketId is required.' });
        return;
    }

    const queueIndex = matchmakingQueue.findIndex((ticket) => ticket.id === ticketId);
    if (queueIndex >= 0) {
        matchmakingQueue.splice(queueIndex, 1);
        res.status(204).send();
        return;
    }

    res.status(404).json({ message: 'ticket not found or already matched.' });
});

export default router;








