"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMatch = exports.matches = void 0;
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const engine_1 = __importDefault(require("../game/engine"));
const catalog_1 = require("../data/catalog");
const router = (0, express_1.Router)();
exports.matches = new Map();
const DEFAULT_DECK_ID = 'default_60';
const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;
const isValidName = (name) => name.length > 0 && [...name].length <= NAME_MAX_LENGTH && NAME_REGEX.test(name);
const getEngineOr404 = (matchId, res) => {
    const engine = exports.matches.get(matchId);
    if (!engine) {
        res.status(404).json({ message: `Match ${matchId} not found.` });
        return undefined;
    }
    return engine;
};
router.get('/', (_req, res) => {
    const summaries = Array.from(exports.matches.values()).map((engine) => engine.getSummary());
    res.json({ matches: summaries });
});
const createMatch = (players = [], options = {}) => {
    const matchId = (0, node_crypto_1.randomUUID)();
    const engine = new engine_1.default(matchId);
    const deckId = options.deckId ?? DEFAULT_DECK_ID;
    engine.assignSharedDeck(deckId, (0, catalog_1.buildDeckCards)(deckId));
    players.forEach((p) => {
        const normalized = typeof p === 'string' ? { name: p } : p;
        const name = normalized?.name?.trim();
        if (!name) {
            return;
        }
        const player = engine.addPlayer(name, normalized.playerId);
        if (normalized.roleId) {
            engine.setPlayerRole(player.id, normalized.roleId);
        }
        // Lobby フロー経由では Ready ボタンがまだないため自動的に準備完了扱いにする
        engine.markPlayerReady(player.id, true);
        if (normalized.isCpu) {
            engine.registerCpuPlayer(player.id, normalized.cpuLevel ?? 'normal');
        }
    });
    exports.matches.set(matchId, engine);
    return { matchId, engine };
};
exports.createMatch = createMatch;
router.post('/', (req, res) => {
    const { players = [], deckId } = req.body;
    for (const p of players) {
        const normalized = typeof p === 'string' ? { name: p } : p;
        const name = normalized?.name?.trim() ?? '';
        if (name && !isValidName(name)) {
            res.status(400).json({ message: '名前は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。' });
            return;
        }
    }
    const { matchId, engine } = (0, exports.createMatch)(players, { deckId });
    res.status(201).json({ matchId, state: engine.getState() });
});
router.post('/solo', (req, res) => {
    const { name, roleId, deckId } = req.body;
    const resolvedName = (name ?? '').trim();
    if (resolvedName && !isValidName(resolvedName)) {
        res.status(400).json({ message: '名前は8文字以内で、英数字/ひらがな/カタカナ/漢字のみ使用できます。' });
        return;
    }
    if (!roleId) {
        res.status(400).json({ message: 'roleId is required.' });
        return;
    }
    const roles = (0, catalog_1.getRolesCatalog)();
    const cpuRoleId = roles.length > 0 ? roles[Math.floor(Math.random() * roles.length)]?.id : undefined;
    const { matchId, engine } = (0, exports.createMatch)([
        { name: resolvedName || 'Player', roleId },
        { name: 'CPU', roleId: cpuRoleId, isCpu: true, cpuLevel: 'normal' },
    ], { deckId });
    try {
        engine.start();
    }
    catch (error) {
        res.status(400).json({ message: error.message });
        return;
    }
    const human = engine.getState().players[0];
    res.status(201).json({ matchId, playerId: human?.id, state: engine.getState() });
});
router.get('/:id', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) {
        return;
    }
    res.json({ state: engine.getState() });
});
router.post('/:id/join', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) {
        return;
    }
    const { name, roleId } = req.body;
    if (!name || !isValidName(name.trim())) {
        res.status(400).json({ message: '名前は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。' });
        return;
    }
    const player = engine.addPlayer(name.trim());
    if (roleId && typeof roleId === 'string') {
        engine.setPlayerRole(player.id, roleId);
    }
    res.status(200).json({
        player,
        state: engine.getState(),
    });
});
router.post('/:id/role', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId, roleId } = req.body;
    if (!playerId || !roleId) {
        res.status(400).json({ message: 'playerId and roleId are required.' });
        return;
    }
    engine.setPlayerRole(playerId, roleId);
    res.status(200).json({ state: engine.getState() });
});
router.post('/:id/ready', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) {
        return;
    }
    const { playerId, ready } = req.body;
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    engine.markPlayerReady(playerId, ready ?? true);
    res.status(200).json({ state: engine.getState() });
});
router.post('/:id/start', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) {
        return;
    }
    try {
        engine.start();
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/score', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) {
        return;
    }
    const { playerId, delta } = req.body;
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    if (typeof delta !== 'number') {
        res.status(400).json({ message: 'delta must be a number.' });
        return;
    }
    engine.applyScore(playerId, delta);
    res.status(200).json({ state: engine.getState() });
});
router.post('/:id/draw', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId, count } = req.body;
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    try {
        engine.drawCards(playerId, typeof count === 'number' ? count : 1);
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/play', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId, cardId, targets, choices, handIndex } = req.body;
    if (!playerId || !cardId) {
        res.status(400).json({ message: 'playerId and cardId are required.' });
        return;
    }
    try {
        engine.playCard(playerId, cardId, { targets, choices, handIndex });
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/endTurn', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId } = req.body;
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    try {
        engine.endTurn(playerId);
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/roleAttack', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId, targetId, struggle } = req.body;
    if (!playerId || !targetId) {
        res.status(400).json({ message: 'playerId and targetId are required.' });
        return;
    }
    try {
        engine.roleAttack(playerId, targetId, { struggle: Boolean(struggle) });
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/roleAction', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId, actionId, targetId, choices } = req.body;
    if (!playerId || !actionId) {
        res.status(400).json({ message: 'playerId and actionId are required.' });
        return;
    }
    try {
        engine.roleAction(playerId, actionId, { targetId, choices });
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/rescueBra', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId } = req.body;
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    try {
        engine.rescueBra(playerId);
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.post('/:id/resolvePrompt', (req, res) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine)
        return;
    const { playerId, accepted } = req.body;
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }
    try {
        engine.resolvePendingPrompt(playerId, Boolean(accepted));
        res.status(200).json({ state: engine.getState() });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.delete('/:id', (req, res) => {
    if (!exports.matches.delete(req.params.id)) {
        res.status(404).json({ message: `Match ${req.params.id} not found.` });
        return;
    }
    res.status(204).send();
});
exports.default = router;
