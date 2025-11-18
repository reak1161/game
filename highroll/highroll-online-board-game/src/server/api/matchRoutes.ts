import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Router } from 'express';
import GameEngine, { PlayCardOptions } from '../game/engine';
import { buildDeckCards } from '../data/catalog';

const router = Router();

export const matches = new Map<string, GameEngine>();

const DEFAULT_DECK_ID = 'default_60';

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

export type CreatePlayerInput = string | { name: string; roleId?: string; playerId?: string };

export interface CreateMatchOptions {
    deckId?: string;
}

export const createMatch = (players: CreatePlayerInput[] = [], options: CreateMatchOptions = {}) => {
    const matchId = randomUUID();
    const engine = new GameEngine(matchId);
    const deckId = options.deckId ?? DEFAULT_DECK_ID;
    engine.assignSharedDeck(deckId, buildDeckCards(deckId));

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
    });

    matches.set(matchId, engine);

    return { matchId, engine };
};

router.post('/', (req: Request, res: Response) => {
    const { players = [], deckId } = req.body as { players?: CreatePlayerInput[]; deckId?: string };
    const { matchId, engine } = createMatch(players, { deckId });
    res.status(201).json({ matchId, state: engine.getState() });
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

    if (!name || name.trim().length === 0) {
        res.status(400).json({ message: 'Player name is required.' });
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

    const { playerId, cardId, targets, choices } = req.body as {
        playerId?: string;
        cardId?: string;
        targets?: string[];
        choices?: PlayCardOptions['choices'];
    };
    if (!playerId || !cardId) {
        res.status(400).json({ message: 'playerId and cardId are required.' });
        return;
    }

    try {
        engine.playCard(playerId, cardId, { targets, choices });
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

router.delete('/:id', (req: Request, res: Response) => {
    if (!matches.delete(req.params.id)) {
        res.status(404).json({ message: `Match ${req.params.id} not found.` });
        return;
    }

    res.status(204).send();
});

export default router;
