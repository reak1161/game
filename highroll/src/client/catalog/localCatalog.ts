import type { DeckSummary, Role } from '@shared/types';

import rolesBaseRaw from '../../../data/roles.json';
import rolesCompiledRaw from '../../../data/roles_compiled.json';

import deckDefault60Raw from '../../../data/decklist.default_60.json';
import deckExpanded90Raw from '../../../data/decklist.expanded_mixed_90.json';
import deckLastOne60Raw from '../../../data/decklist.last_one_60.json';

type RolesFile = { roles: Role[] };
type DeckListEntry = { id: string; count: number };
type DeckList = { name: string; total: number; entries?: DeckListEntry[] };

const getRolesFile = (raw: unknown): Role[] => {
    const file = raw as Partial<RolesFile> | null;
    return Array.isArray(file?.roles) ? file.roles : [];
};

export const getRolesCatalogLocal = (): Role[] => {
    const baseRoles = getRolesFile(rolesBaseRaw);
    const compiledRoles = getRolesFile(rolesCompiledRaw);
    const merged = new Map<string, Role>();

    baseRoles.forEach((role) => {
        if (role?.id) merged.set(role.id, role);
    });

    compiledRoles.forEach((role) => {
        if (!role?.id) return;
        const existing = merged.get(role.id);
        if (existing) {
            merged.set(role.id, {
                ...existing,
                ...role,
                // roles.json を表示上の最終定義として優先する
                params: existing.params ?? role.params,
                tags: role.tags ?? existing.tags,
                text: existing.text ?? role.text,
                detailText: (existing as any).detailText ?? (role as any).detailText,
            });
        } else {
            merged.set(role.id, role);
        }
    });

    return Array.from(merged.values());
};

const getDeckList = (raw: unknown): DeckList | null => {
    const deck = raw as Partial<DeckList> | null;
    if (!deck || typeof deck !== 'object') return null;
    const name = typeof deck.name === 'string' ? deck.name : null;
    const total = typeof deck.total === 'number' ? deck.total : null;
    if (!name || total == null) return null;
    const entries = Array.isArray(deck.entries) ? (deck.entries as DeckListEntry[]) : undefined;
    return { name, total, entries };
};

export const listDeckSummariesLocal = (): DeckSummary[] => {
    const decks: Array<{ id: string; raw: unknown }> = [
        { id: 'default_60', raw: deckDefault60Raw },
        { id: 'expanded_mixed_90', raw: deckExpanded90Raw },
        { id: 'last_one_60', raw: deckLastOne60Raw },
    ];

    return decks
        .map(({ id, raw }) => {
            const list = getDeckList(raw);
            if (!list) return null;
            return { id, name: list.name, total: list.total } satisfies DeckSummary;
        })
        .filter((entry): entry is DeckSummary => Boolean(entry));
};

export type DeckListLocal = { name: string; total: number; entries: Array<{ id: string; count: number }> };

export const getDeckListLocal = (deckId: string): DeckListLocal => {
    const decks: Array<{ id: string; raw: unknown }> = [
        { id: 'default_60', raw: deckDefault60Raw },
        { id: 'expanded_mixed_90', raw: deckExpanded90Raw },
        { id: 'last_one_60', raw: deckLastOne60Raw },
    ];
    const raw = decks.find((d) => d.id === deckId)?.raw ?? null;
    const list = raw ? getDeckList(raw) : null;
    if (!list || !Array.isArray(list.entries)) {
        throw new Error(`Unknown deckId: ${deckId}`);
    }
    const entries = list.entries
        .filter((e) => e && typeof e.id === 'string' && typeof e.count === 'number')
        .map((e) => ({ id: e.id, count: e.count }));
    return { name: list.name, total: list.total, entries };
};
