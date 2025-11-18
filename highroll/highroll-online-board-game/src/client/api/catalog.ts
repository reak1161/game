import type { DeckSummary, Role, RolesResponse } from '@shared/types';
import { withApiBase } from '@client/config/api';

export async function fetchRoles(signal?: AbortSignal): Promise<Role[]> {
    const url = withApiBase('/api/catalog/roles');
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) {
        throw new Error(`Failed to fetch roles: ${res.status}`);
    }
    const data = (await res.json()) as RolesResponse;
    if (!data || !Array.isArray(data.roles)) {
        return [];
    }
    // Ensure minimal shape for forward compatibility
    return data.roles
        .filter((r) => typeof r?.id === 'string' && typeof r?.name === 'string')
        .map((r) => r);
}

export async function fetchDecks(signal?: AbortSignal): Promise<DeckSummary[]> {
    const url = withApiBase('/api/catalog/decks');
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) {
        throw new Error(`Failed to fetch decks: ${res.status}`);
    }
    const data = (await res.json()) as { decks?: DeckSummary[] };
    return Array.isArray(data.decks) ? data.decks : [];
}
