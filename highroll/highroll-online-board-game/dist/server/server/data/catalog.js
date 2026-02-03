"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDataRoot = exports.buildDeckCards = exports.loadDeckList = exports.listDeckSummaries = exports.getCardsCatalog = exports.getRolesCatalog = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const stripJsonComments = (input) => input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const resolveDataRoot = () => {
    const cwdData = node_path_1.default.resolve(process.cwd(), 'data');
    const candidates = [
        cwdData,
        node_path_1.default.resolve(__dirname, '../../../data'),
        node_path_1.default.resolve(__dirname, '../../data'),
    ];
    for (const candidate of candidates) {
        if (node_fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return cwdData;
};
const dataRoot = resolveDataRoot();
const readJson = (filename) => {
    const file = node_path_1.default.join(dataRoot, filename);
    const raw = node_fs_1.default.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(stripJsonComments(raw));
};
let cachedRoles;
let cachedCards;
const readRolesFile = (filename) => {
    const filePath = node_path_1.default.join(dataRoot, filename);
    if (!node_fs_1.default.existsSync(filePath)) {
        return undefined;
    }
    const data = readJson(filename);
    return Array.isArray(data.roles) ? data.roles : undefined;
};
const getRolesCatalog = () => {
    if (!cachedRoles) {
        const baseRoles = readRolesFile('roles.json') ?? [];
        const compiledRoles = readRolesFile('roles_compiled.json') ?? [];
        const merged = new Map();
        baseRoles.forEach((role) => {
            if (role?.id) {
                merged.set(role.id, role);
            }
        });
        compiledRoles.forEach((role) => {
            if (!role?.id) {
                return;
            }
            const existing = merged.get(role.id);
            if (existing) {
                merged.set(role.id, {
                    ...existing,
                    ...role,
                    params: role.params ?? existing.params,
                    tags: role.tags ?? existing.tags,
                    text: existing.text ?? role.text,
                    detailText: existing.detailText ?? role.detailText,
                });
            }
            else {
                merged.set(role.id, role);
            }
        });
        cachedRoles = Array.from(merged.values());
    }
    return cachedRoles;
};
exports.getRolesCatalog = getRolesCatalog;
const getCardsCatalog = () => {
    if (!cachedCards) {
        const data = readJson('cards.json');
        cachedCards = Array.isArray(data.cards) ? data.cards : [];
    }
    return cachedCards;
};
exports.getCardsCatalog = getCardsCatalog;
const listDeckSummaries = () => {
    const files = node_fs_1.default.readdirSync(dataRoot).filter((file) => file.startsWith('decklist.') && file.endsWith('.json'));
    return files.map((file) => {
        const deckId = file.replace(/^decklist\./, '').replace(/\.json$/, '');
        const list = readJson(file);
        return {
            id: deckId,
            name: list.name,
            total: list.total,
        };
    });
};
exports.listDeckSummaries = listDeckSummaries;
const loadDeckList = (deckId) => readJson(`decklist.${deckId}.json`);
exports.loadDeckList = loadDeckList;
const buildDeckCardsInternal = (deck) => {
    const cards = [];
    deck.entries.forEach((entry) => {
        for (let i = 0; i < entry.count; i += 1) {
            cards.push(entry.id);
        }
    });
    return cards;
};
const shuffle = (arr) => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};
const buildDeckCards = (deckId) => {
    const deckList = (0, exports.loadDeckList)(deckId);
    return shuffle(buildDeckCardsInternal(deckList));
};
exports.buildDeckCards = buildDeckCards;
const getDataRoot = () => dataRoot;
exports.getDataRoot = getDataRoot;
