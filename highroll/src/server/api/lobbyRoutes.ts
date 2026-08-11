import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { CreatePlayerInput } from './matchRoutes';
import { createMatch } from './matchRoutes';
import { getRolesCatalog } from '../data/catalog';
import { emitLobbyEvent } from '../sockets/gatewayContext';

interface LobbyPlayer {
    id: string;
    name: string;
    roleId?: string;
    isReady?: boolean;
    isSpectator?: boolean;
    isCpu?: boolean;
    cpuLevel?: 'easy' | 'normal' | 'hard';
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
    showRoles: boolean;
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

const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;
const MAX_PLAYERS = 6;

const sanitizeName = (name?: string): string | undefined => {
    if (!name) return undefined;
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    if ([...trimmed].length > NAME_MAX_LENGTH) {
        return undefined;
    }
    if (!NAME_REGEX.test(trimmed)) {
        return undefined;
    }
    return trimmed;
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

router.get('/:id', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;
    res.json({
        lobby: {
            id: lobby.id,
            name: lobby.name,
            ownerId: lobby.ownerId,
            isPrivate: lobby.isPrivate,
            deckId: lobby.deckId,
            players: lobby.players,
            createdAt: lobby.createdAt,
            showRoles: lobby.showRoles,
        },
    });
});

router.post('/', (req: Request, res: Response) => {
    const { lobbyName, ownerName, password, deckId = DEFAULT_DECK_ID } = req.body as {
        lobbyName?: string;
        ownerName?: string;
        password?: string;
        deckId?: string;
    };

    if (lobbyName && !sanitizeName(lobbyName)) {
        res.status(400).json({ message: 'ロビー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみで入力してください。' });
        return;
    }
    if (ownerName && !sanitizeName(ownerName)) {
        res.status(400).json({ message: 'プレイヤー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみで入力してください。' });
        return;
    }
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
                isReady: true,
                isSpectator: false,
            },
        ],
        createdAt: Date.now(),
        showRoles: true,
    };

    lobbies.set(lobbyId, lobby);

    res.status(201).json({
        lobby,
        ownerPlayerId: ownerId,
    });
});

router.post('/:id/cpu', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId, cpuCount, cpuLevel } = req.body as {
        playerId?: string;
        cpuCount?: number;
        cpuLevel?: 'easy' | 'normal' | 'hard';
    };

    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    if (playerId !== lobby.ownerId) {
        res.status(403).json({ message: 'Only the lobby owner can add CPU players.' });
        return;
    }

    const normalizedCpuCount =
        typeof cpuCount === 'number' && Number.isFinite(cpuCount) ? Math.max(1, Math.floor(cpuCount)) : 1;
    const normalizedCpuLevel: 'easy' | 'normal' | 'hard' =
        cpuLevel === 'easy' || cpuLevel === 'hard' ? cpuLevel : 'normal';

    const remaining = Math.max(0, MAX_PLAYERS - lobby.players.length);
    const toAdd = Math.min(remaining, normalizedCpuCount);
    if (toAdd <= 0) {
        res.status(400).json({ message: `ロビーは最大${MAX_PLAYERS}人まで参加できます。` });
        return;
    }

    const roleIds = getRolesCatalog().map((role) => role.id);
    const existingCpuCount = lobby.players.filter((p) => p.isCpu).length;

    for (let i = 0; i < toAdd; i += 1) {
        const roleId = roleIds.length > 0 ? roleIds[Math.floor(Math.random() * roleIds.length)] : undefined;
        lobby.players.push({
            id: randomUUID(),
            name: `CPU${existingCpuCount + i + 1}`,
            roleId,
            isReady: true,
            isSpectator: false,
            isCpu: true,
            cpuLevel: normalizedCpuLevel,
        });
    }

    res.status(200).json({
        lobby: {
            id: lobby.id,
            name: lobby.name,
            ownerId: lobby.ownerId,
            isPrivate: lobby.isPrivate,
            deckId: lobby.deckId,
            players: lobby.players,
            createdAt: lobby.createdAt,
            showRoles: lobby.showRoles,
        },
    });
});

router.post('/:id/join', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { name, password, roleId } = req.body as {
        name?: string;
        password?: string;
        roleId?: string;
    };
    const resolvedName = sanitizeName(name);

    if (!resolvedName) {
        res.status(400).json({ message: 'プレイヤー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみで入力してください。' });
        return;
    }

    if (lobby.passwordHash) {
        if (!password || hashPassword(password) !== lobby.passwordHash) {
            res.status(403).json({ message: 'Incorrect password.' });
            return;
        }
    }

    if (lobby.players.length >= MAX_PLAYERS) {
        res.status(400).json({ message: `ロビーは最大${MAX_PLAYERS}人まで参加できます。` });
        return;
    }

    const player = {
        id: randomUUID(),
        name: resolvedName,
        roleId,
        isReady: false,
        isSpectator: false,
    } satisfies LobbyPlayer;
    lobby.players.push(player);

    res.status(200).json({ lobbyId: lobby.id, player });
});

router.post('/:id/spectator', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId, isSpectator } = req.body as { playerId?: string; isSpectator?: boolean };
    if (!playerId || typeof isSpectator !== 'boolean') {
        res.status(400).json({ message: 'playerId and isSpectator are required.' });
        return;
    }
    if (playerId === lobby.ownerId && isSpectator) {
        res.status(400).json({ message: 'ホストは観戦モードに切り替えできません。' });
        return;
    }

    const target = lobby.players.find((player) => player.id === playerId);
    if (!target) {
        res.status(404).json({ message: 'Player not found in lobby.' });
        return;
    }

    target.isSpectator = isSpectator;
    if (isSpectator) {
        target.roleId = undefined;
        target.isReady = false;
    } else {
        target.isReady = false;
    }

    res.status(200).json({ lobbyId: lobby.id, player: target });
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

    const roleIds = getRolesCatalog().map((role) => role.id);
    const activePlayers = lobby.players.filter((player) => !player.isSpectator);
    const hasUnready = activePlayers.some((player) => player.id !== lobby.ownerId && !player.isReady);
    if (hasUnready) {
        res.status(400).json({ message: '準備OKになっていないプレイヤーがいます。' });
        return;
    }
    const resolveDuplicateRoles = (players: LobbyPlayer[], allRoles: string[]) => {
        const used = new Set(players.map((player) => player.roleId).filter(Boolean) as string[]);
        const grouped = new Map<string, LobbyPlayer[]>();
        players.forEach((player) => {
            if (!player.roleId) return;
            const list = grouped.get(player.roleId) ?? [];
            list.push(player);
            grouped.set(player.roleId, list);
        });

        grouped.forEach((group, roleId) => {
            if (group.length <= 1) return;
            const keepIndex = Math.floor(Math.random() * group.length);
            group.forEach((player, index) => {
                if (index === keepIndex) return;
                const candidates = allRoles.filter((id) => id !== roleId && !used.has(id));
                const fallback = allRoles.filter((id) => id !== roleId);
                const pool = candidates.length > 0 ? candidates : fallback;
                if (pool.length === 0) {
                    player.roleId = undefined;
                    return;
                }
                const nextRole = pool[Math.floor(Math.random() * pool.length)];
                player.roleId = nextRole;
                used.add(nextRole);
            });
        });
    };

    resolveDuplicateRoles(activePlayers, roleIds);

    const players: CreatePlayerInput[] = activePlayers.map((player) => ({
        name: player.name,
        roleId: player.roleId,
        playerId: player.id,
        isCpu: Boolean(player.isCpu),
        cpuLevel: player.cpuLevel,
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
    if (target.isSpectator) {
        res.status(400).json({ message: 'Spectator cannot change roles.' });
        return;
    }

    target.roleId = roleId;
    res.status(200).json({ lobbyId: lobby.id, player: target });
});

router.post('/:id/ready', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId, isReady } = req.body as { playerId?: string; isReady?: boolean };
    if (!playerId || typeof isReady !== 'boolean') {
        res.status(400).json({ message: 'playerId and isReady are required.' });
        return;
    }
    const target = lobby.players.find((player) => player.id === playerId);
    if (!target) {
        res.status(404).json({ message: 'Player not found in lobby.' });
        return;
    }
    if (target.isSpectator) {
        res.status(400).json({ message: 'Spectator cannot set ready.' });
        return;
    }
    target.isReady = isReady;
    res.status(200).json({ lobbyId: lobby.id, player: target });
});

router.post('/:id/settings', (req: Request, res: Response) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby) return;

    const { playerId, showRoles } = req.body as { playerId?: string; showRoles?: boolean };
    if (!playerId || typeof showRoles !== 'boolean') {
        res.status(400).json({ message: 'playerId and showRoles are required.' });
        return;
    }
    if (playerId !== lobby.ownerId) {
        res.status(403).json({ message: 'Only the lobby owner can update settings.' });
        return;
    }

    lobby.showRoles = showRoles;

    res.status(200).json({
        lobby: {
            id: lobby.id,
            name: lobby.name,
            ownerId: lobby.ownerId,
            isPrivate: lobby.isPrivate,
            deckId: lobby.deckId,
            players: lobby.players,
            createdAt: lobby.createdAt,
            showRoles: lobby.showRoles,
        },
    });
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
    if (name && !sanitizeName(name)) {
        res.status(400).json({ message: 'プレイヤー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみで入力してください。' });
        return;
    }
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
