"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const matchRoutes_1 = require("./matchRoutes");
const gatewayContext_1 = require("../sockets/gatewayContext");
const DEFAULT_DECK_ID = 'default_60';
const router = (0, express_1.Router)();
const lobbies = new Map();
const matchmakingQueue = [];
const matchmakingResults = new Map();
const hashPassword = (pw) => (0, node_crypto_1.createHash)('sha256').update(pw).digest('hex');
const sanitizeName = (name) => {
    if (!name)
        return undefined;
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
const findLobby = (id, res) => {
    const lobby = lobbies.get(id);
    if (!lobby) {
        res.status(404).json({ message: `Lobby ${id} not found.` });
        return undefined;
    }
    return lobby;
};
router.get('/', (_req, res) => {
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
router.post('/', (req, res) => {
    const { lobbyName, ownerName, password, deckId = DEFAULT_DECK_ID } = req.body;
    const resolvedName = sanitizeName(lobbyName) ?? 'Lobby';
    const owner = sanitizeName(ownerName) ?? 'Host';
    const lobbyId = (0, node_crypto_1.randomUUID)();
    const ownerId = (0, node_crypto_1.randomUUID)();
    const lobby = {
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
router.post('/:id/join', (req, res) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby)
        return;
    const { name, password, roleId } = req.body;
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
    const player = { id: (0, node_crypto_1.randomUUID)(), name: resolvedName, roleId };
    lobby.players.push(player);
    res.status(200).json({ lobbyId: lobby.id, player });
});
router.post('/:id/leave', (req, res) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby)
        return;
    const { playerId } = req.body;
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
router.post('/:id/start', (req, res) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby)
        return;
    const { playerId } = req.body;
    if (!playerId || playerId !== lobby.ownerId) {
        res.status(403).json({ message: 'Only the lobby owner can start the match.' });
        return;
    }
    const players = lobby.players.map((player) => ({
        name: player.name,
        roleId: player.roleId,
        playerId: player.id,
    }));
    const { matchId, engine } = (0, matchRoutes_1.createMatch)(players, { deckId: lobby.deckId });
    try {
        engine.start();
    }
    catch (error) {
        res.status(400).json({ message: error.message });
        return;
    }
    lobbies.delete(lobby.id);
    (0, gatewayContext_1.emitLobbyEvent)(lobby.id, 'lobbyStarted', { lobbyId: lobby.id, matchId });
    res.status(200).json({ matchId });
});
router.post('/:id/role', (req, res) => {
    const lobby = findLobby(req.params.id, res);
    if (!lobby)
        return;
    const { playerId, roleId } = req.body;
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
        const { matchId } = (0, matchRoutes_1.createMatch)([
            { name: a.name, roleId: a.roleId },
            { name: b.name, roleId: b.roleId },
        ], { deckId: a.deckId ?? b.deckId ?? DEFAULT_DECK_ID });
        a.matchId = matchId;
        b.matchId = matchId;
        matchmakingResults.set(a.id, a);
        matchmakingResults.set(b.id, b);
    }
};
router.post('/matchmaking/enqueue', (req, res) => {
    const { name, roleId, deckId } = req.body;
    const resolvedName = sanitizeName(name) ?? 'Player';
    const ticket = {
        id: (0, node_crypto_1.randomUUID)(),
        name: resolvedName,
        roleId,
        deckId,
        createdAt: Date.now(),
    };
    matchmakingQueue.push(ticket);
    tryMatchmaking();
    res.status(202).json({ ticketId: ticket.id });
});
router.get('/matchmaking/status/:ticketId', (req, res) => {
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
router.post('/matchmaking/cancel', (req, res) => {
    const { ticketId } = req.body;
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
exports.default = router;
