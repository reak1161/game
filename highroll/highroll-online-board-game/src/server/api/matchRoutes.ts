import type { Request, Response } from 'express';
import { Router } from 'express';
import GameEngine, { PlayCardOptions } from '../game/engine';
import { buildDeckCards, getCardsCatalog, getRolesCatalog } from '../data/catalog';

const router = Router();

export const matches = new Map<string, GameEngine>();

const DEFAULT_DECK_ID = 'default_60';
const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;

const isValidName = (name: string): boolean =>
    name.length > 0 && [...name].length <= NAME_MAX_LENGTH && NAME_REGEX.test(name);

const getEngineOr404 = (matchId: string, res: Response): GameEngine | undefined => {
    const engine = matches.get(matchId);

    if (!engine) {
        res.status(404).json({ message: `Match ${matchId} not found.` });
        return undefined;
    }

    return engine;
};

router.get('/', (_req: Request, res: Response) => {
    const summaries = Array.from(matches.values()).map((engine) => engine.getSummary());
    res.json({ matches: summaries });
});

export type CpuLevel = 'easy' | 'normal' | 'hard';
export type CreatePlayerInputNormalized = {
    name: string;
    roleId?: string;
    playerId?: string;
    isCpu?: boolean;
    cpuLevel?: CpuLevel;
};
export type CreatePlayerInput = string | CreatePlayerInputNormalized;

export interface CreateMatchOptions {
    deckId?: string;
}

export const createMatch = (players: CreatePlayerInput[] = [], options: CreateMatchOptions = {}) => {
    const matchId = globalThis.crypto?.randomUUID?.() ?? `match-${Math.random().toString(36).slice(2, 11)}`;
    const engine = new GameEngine(matchId, [], { catalog: { roles: getRolesCatalog(), cards: getCardsCatalog() } });
    const deckId = options.deckId ?? DEFAULT_DECK_ID;
    engine.assignSharedDeck(deckId, buildDeckCards(deckId));

    players.forEach((p) => {
        const normalized: CreatePlayerInputNormalized = typeof p === 'string' ? { name: p } : (p as CreatePlayerInputNormalized);
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

    matches.set(matchId, engine);

    return { matchId, engine };
};

router.post('/', (req: Request, res: Response) => {
    const { players = [], deckId } = req.body as { players?: CreatePlayerInput[]; deckId?: string };
    for (const p of players) {
        const normalized = typeof p === 'string' ? { name: p } : p;
        const name = normalized?.name?.trim() ?? '';
        if (name && !isValidName(name)) {
            res.status(400).json({ message: '名前は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。' });
            return;
        }
    }
    const { matchId, engine } = createMatch(players, { deckId });
    res.status(201).json({ matchId, state: engine.getState() });
});

router.post('/solo', (req: Request, res: Response) => {
    const { name, roleId, deckId } = req.body as { name?: string; roleId?: string; deckId?: string };

    const resolvedName = (name ?? '').trim();
    if (resolvedName && !isValidName(resolvedName)) {
        res.status(400).json({ message: '名前は8文字以内で、英数字/ひらがな/カタカナ/漢字のみ使用できます。' });
        return;
    }
    if (!roleId) {
        res.status(400).json({ message: 'roleId is required.' });
        return;
    }

    const roles = getRolesCatalog();
    const cpuRoleId = roles.length > 0 ? roles[Math.floor(Math.random() * roles.length)]?.id : undefined;

    const { matchId, engine } = createMatch(
        [
            { name: resolvedName || 'Player', roleId } satisfies CreatePlayerInputNormalized,
            { name: 'CPU', roleId: cpuRoleId, isCpu: true, cpuLevel: 'normal' } satisfies CreatePlayerInputNormalized,
        ],
        { deckId }
    );

    try {
        engine.start();
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
        return;
    }

    const human = engine.getState().players[0];
    res.status(201).json({ matchId, playerId: human?.id, state: engine.getState() });
});

router.get('/:id', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);

    if (!engine) {
        return;
    }

    res.json({ state: engine.getState() });
});

router.post('/:id/join', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);

    if (!engine) {
        return;
    }

    const { name, roleId } = req.body as { name?: string; roleId?: string };

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

router.post('/:id/role', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId, roleId } = req.body as { playerId?: string; roleId?: string };
    if (!playerId || !roleId) {
        res.status(400).json({ message: 'playerId and roleId are required.' });
        return;
    }

    engine.setPlayerRole(playerId, roleId);
    res.status(200).json({ state: engine.getState() });
});

router.post('/:id/ready', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);

    if (!engine) {
        return;
    }

    const { playerId, ready } = req.body as { playerId?: string; ready?: boolean };

    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }

    engine.markPlayerReady(playerId, ready ?? true);

    res.status(200).json({ state: engine.getState() });
});

router.post('/:id/start', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);

    if (!engine) {
        return;
    }

    try {
        engine.start();
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/score', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);

    if (!engine) {
        return;
    }

    const { playerId, delta } = req.body as { playerId?: string; delta?: number };

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

router.post('/:id/draw', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId, count } = req.body as { playerId?: string; count?: number };
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }

    try {
        engine.drawCards(playerId, typeof count === 'number' ? count : 1);
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/play', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId, cardId, targets, choices, handIndex } = req.body as {
        playerId?: string;
        cardId?: string;
        targets?: string[];
        choices?: PlayCardOptions['choices'];
        handIndex?: number;
    };
    if (!playerId || !cardId) {
        res.status(400).json({ message: 'playerId and cardId are required.' });
        return;
    }

    try {
        engine.playCard(playerId, cardId, { targets, choices, handIndex });
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/endTurn', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId } = req.body as { playerId?: string };
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }

    try {
        engine.endTurn(playerId);
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/roleAttack', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId, targetId, struggle } = req.body as { playerId?: string; targetId?: string; struggle?: boolean };
    if (!playerId || !targetId) {
        res.status(400).json({ message: 'playerId and targetId are required.' });
        return;
    }

    try {
        engine.roleAttack(playerId, targetId, { struggle: Boolean(struggle) });
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/roleAction', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId, actionId, targetId, choices } = req.body as {
        playerId?: string;
        actionId?: string;
        targetId?: string;
        choices?: Record<string, string | number | boolean>;
    };
    if (!playerId || !actionId) {
        res.status(400).json({ message: 'playerId and actionId are required.' });
        return;
    }

    try {
        engine.roleAction(playerId, actionId, { targetId, choices });
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/rescueBra', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId } = req.body as { playerId?: string };
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }

    try {
        engine.rescueBra(playerId);
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.post('/:id/resolvePrompt', (req: Request, res: Response) => {
    const engine = getEngineOr404(req.params.id, res);
    if (!engine) return;

    const { playerId, accepted } = req.body as { playerId?: string; accepted?: boolean };
    if (!playerId) {
        res.status(400).json({ message: 'playerId is required.' });
        return;
    }

    try {
        engine.resolvePendingPrompt(playerId, Boolean(accepted));
        res.status(200).json({ state: engine.getState() });
    } catch (error) {
        res.status(400).json({ message: (error as Error).message });
    }
});

router.delete('/:id', (req: Request, res: Response) => {
    if (!matches.delete(req.params.id)) {
        res.status(404).json({ message: `Match ${req.params.id} not found.` });
        return;
    }

    res.status(204).send();
});

export default router;
