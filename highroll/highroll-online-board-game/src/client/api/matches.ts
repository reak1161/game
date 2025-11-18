import type { GameState } from '@shared/types';
import { withApiBase } from '@client/config/api';

type CreateMatchInput = {
  players?: Array<string | { name: string; roleId?: string; deckId?: string }>;
};

export async function createMatchWithRole(roleId: string, name = 'You', deckId = 'default_60'): Promise<{ matchId: string; state: GameState }> {
  const res = await fetch(withApiBase('/api/matches'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ players: [{ name, roleId, deckId }] } satisfies CreateMatchInput),
  });
  if (!res.ok) {
    throw new Error(`Failed to create match: ${res.status}`);
  }
  return (await res.json()) as { matchId: string; state: GameState };
}

export async function getMatch(id: string): Promise<{ state: GameState }>{
  const res = await fetch(withApiBase(`/api/matches/${id}`), {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Failed to get match ${id}: ${res.status}`);
  }
  return (await res.json()) as { state: GameState };
}

export async function drawCards(matchId: string, playerId: string, count = 1): Promise<{ state: GameState }>{
  const res = await fetch(withApiBase(`/api/matches/${matchId}/draw`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ playerId, count }),
  });
  if (!res.ok) {
    throw new Error(`Failed to draw cards: ${res.status}`);
  }
  return (await res.json()) as { state: GameState };
}

type PlayCardChoices = Record<string, string | number | boolean | string[] | number[]>;

type PlayCardParams = {
  targets?: string[];
  choices?: PlayCardChoices;
};

export async function playCard(matchId: string, playerId: string, cardId: string, params: PlayCardParams = {}): Promise<{ state: GameState }>{
  const res = await fetch(withApiBase(`/api/matches/${matchId}/play`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ playerId, cardId, ...params }),
  });
  if (!res.ok) {
    throw new Error(`Failed to play card: ${res.status}`);
  }
  return (await res.json()) as { state: GameState };
}

export async function endTurn(matchId: string, playerId: string): Promise<{ state: GameState }> {
  const res = await fetch(withApiBase(`/api/matches/${matchId}/endTurn`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ playerId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to end turn: ${res.status}`);
  }
  return (await res.json()) as { state: GameState };
}

export async function roleAttack(matchId: string, playerId: string, targetId: string, struggle = false): Promise<{ state: GameState }> {
  const res = await fetch(withApiBase(`/api/matches/${matchId}/roleAttack`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ playerId, targetId, struggle }),
  });
  if (!res.ok) {
    throw new Error(`Failed to perform role attack: ${res.status}`);
  }
  return (await res.json()) as { state: GameState };
}

type RoleActionParams = {
  targetId?: string | null;
  choices?: Record<string, string | number | boolean>;
};

export async function roleAction(matchId: string, playerId: string, actionId: string, params: RoleActionParams = {}): Promise<{ state: GameState }> {
  const res = await fetch(withApiBase(`/api/matches/${matchId}/roleAction`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ playerId, actionId, targetId: params.targetId ?? undefined, choices: params.choices }),
  });
  if (!res.ok) {
    throw new Error(`Failed to perform role action: ${res.status}`);
  }
  return (await res.json()) as { state: GameState };
}

