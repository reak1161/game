"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catalog_1 = require("../data/catalog");
const router = (0, express_1.Router)();
router.get('/roles', (_req, res) => {
    try {
        const roles = (0, catalog_1.getRolesCatalog)();
        res.json({ roles });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
router.get('/decks', (_req, res) => {
    try {
        res.json({ decks: (0, catalog_1.listDeckSummaries)() });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
router.get('/decks/:id', (req, res) => {
    try {
        const deck = (0, catalog_1.loadDeckList)(req.params.id);
        res.json({ deck });
    }
    catch (error) {
        res.status(404).json({ message: `Deck ${req.params.id} not found.` });
    }
});
exports.default = router;
