import { Router, type Request, type Response } from 'express';
import { getRolesCatalog, listDeckSummaries, loadDeckList } from '../data/catalog';

const router = Router();

router.get('/roles', (_req: Request, res: Response) => {
    try {
        const roles = getRolesCatalog();
        res.json({ roles });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
});

router.get('/decks', (_req: Request, res: Response) => {
    try {
        res.json({ decks: listDeckSummaries() });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
});

router.get('/decks/:id', (req: Request, res: Response) => {
    try {
        const deck = loadDeckList(req.params.id);
        res.json({ deck });
    } catch (error) {
        res.status(404).json({ message: `Deck ${req.params.id} not found.` });
    }
});

export default router;
