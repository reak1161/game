import type { CardDefinition, DeckList, DeckSummary, Role } from "../../src/shared/types";

import rolesBaseRaw from "../../data/roles.json" with { type: "json" };
import rolesCompiledRaw from "../../data/roles_compiled.json" with { type: "json" };
import cardsRaw from "../../data/cards.json" with { type: "json" };
import deckDefaultRaw from "../../data/decklist.default_60.json" with { type: "json" };
import deckExpandedRaw from "../../data/decklist.expanded_mixed_90.json" with { type: "json" };

type RolesFile = { roles: Role[] };
type CardsFile = { cards: CardDefinition[] };

const mergeRoles = (base: Role[], compiled: Role[]): Role[] => {
  const merged = new Map<string, Role>();
  base.forEach((role) => {
    if (role?.id) merged.set(role.id, role);
  });
  compiled.forEach((role) => {
    if (!role?.id) return;
    const existing = merged.get(role.id);
    if (existing) {
      merged.set(role.id, {
        ...existing,
        ...role,
        params: role.params ?? existing.params,
        tags: role.tags ?? existing.tags,
        text: existing.text ?? role.text,
        // NOTE: compiled 側の detailText を上書きしない（base側が優先の運用）
        detailText: (existing as any).detailText ?? (role as any).detailText,
      } as Role);
    } else {
      merged.set(role.id, role);
    }
  });
  return Array.from(merged.values());
};

const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const DECKS: Record<string, DeckList> = {
  default_60: deckDefaultRaw as DeckList,
  expanded_mixed_90: deckExpandedRaw as DeckList,
};

export const getRolesCatalog = (): Role[] => {
  const base = ((rolesBaseRaw as RolesFile).roles ?? []).filter(Boolean);
  const compiled = ((rolesCompiledRaw as RolesFile).roles ?? []).filter(Boolean);
  return mergeRoles(base, compiled);
};

export const getCardsCatalog = (): CardDefinition[] => {
  return ((cardsRaw as CardsFile).cards ?? []).filter(Boolean);
};

export const listDeckSummaries = (): DeckSummary[] => {
  return Object.entries(DECKS).map(([id, list]) => ({
    id,
    name: (list as DeckList).name,
    total: (list as DeckList).total,
  }));
};

export const buildDeckCards = (deckId: string): string[] => {
  const list = DECKS[deckId];
  if (!list) {
    throw new Error(`Unknown deckId: ${deckId}`);
  }
  const cards: string[] = [];
  list.entries.forEach((entry) => {
    for (let i = 0; i < entry.count; i += 1) cards.push(entry.id);
  });
  return shuffle(cards);
};

export const getDeckList = (deckId: string): DeckList => {
  const list = DECKS[deckId];
  if (!list) {
    throw new Error(`Unknown deckId: ${deckId}`);
  }
  return list;
};

