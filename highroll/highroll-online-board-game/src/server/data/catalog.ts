import fs from 'node:fs';
import path from 'node:path';
import type { Card, DeckList, DeckSummary, Role } from '../../shared/types';

const stripJsonComments = (input: string): string =>
    input
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

const resolveDataRoot = (): string => {
    const cwdData = path.resolve(process.cwd(), 'data');
    const candidates = [
        cwdData,
        path.resolve(__dirname, '../../../data'),
        path.resolve(__dirname, '../../data'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return cwdData;
};

const dataRoot = resolveDataRoot();

const readJson = <T>(filename: string): T => {
    const file = path.join(dataRoot, filename);
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(stripJsonComments(raw)) as T;
};

type RolesFile = { roles: Role[] };
type CardsFile = { cards: Card[] };

let cachedRoles: Role[] | undefined;
let cachedCards: Card[] | undefined;

const readRolesFile = (filename: string): Role[] | undefined => {
    const filePath = path.join(dataRoot, filename);
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    const data = readJson<RolesFile>(filename);
    return Array.isArray(data.roles) ? data.roles : undefined;
};

export const getRolesCatalog = (): Role[] => {
    if (!cachedRoles) {
        const baseRoles = readRolesFile('roles.json') ?? [];
        const compiledRoles = readRolesFile('roles_compiled.json') ?? [];
        const merged = new Map<string, Role>();
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
                    detailText: (existing as any).detailText ?? (role as any).detailText,
                });
            } else {
                merged.set(role.id, role);
            }
        });
        cachedRoles = Array.from(merged.values());
    }
    return cachedRoles;
};

export const getCardsCatalog = (): Card[] => {
    if (!cachedCards) {
        const data = readJson<CardsFile>('cards.json');
        cachedCards = Array.isArray(data.cards) ? data.cards : [];
    }
    return cachedCards;
};

export const listDeckSummaries = (): DeckSummary[] => {
    const files = fs.readdirSync(dataRoot).filter((file) => file.startsWith('decklist.') && file.endsWith('.json'));
    return files.map((file) => {
        const deckId = file.replace(/^decklist\./, '').replace(/\.json$/, '');
        const list = readJson<DeckList>(file);
        return {
            id: deckId,
            name: list.name,
            total: list.total,
        } satisfies DeckSummary;
    });
};

export const loadDeckList = (deckId: string): DeckList => readJson<DeckList>(`decklist.${deckId}.json`);

const buildDeckCardsInternal = (deck: DeckList): string[] => {
    const cards: string[] = [];
    deck.entries.forEach((entry) => {
        for (let i = 0; i < entry.count; i += 1) {
            cards.push(entry.id);
        }
    });
    return cards;
};

const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

export const buildDeckCards = (deckId: string): string[] => {
    const deckList = loadDeckList(deckId);
    return shuffle(buildDeckCardsInternal(deckList));
};

export const getDataRoot = (): string => dataRoot;
