import type { TeamColor } from './types';

export type CpuLevel = 'easy' | 'normal' | 'hard';

export type ActionPayload =
    // Home (lobby index) actions
    | {
          k: 'lobbies/create';
          deckId?: string;
          lobbyName?: string;
          ownerName: string;
          password?: string;
          roleId?: string;
      }
    | {
          k: 'matches/soloCpu';
          name: string;
          roleId: string;
          deckId?: string;
          cpuLevel?: CpuLevel;
      }
    | {
          k: 'matchmaking/enqueue';
          name: string;
          roleId?: string;
          deckId?: string;
      }
    | { k: 'matchmaking/cancel'; ticketId: string }
    | { k: 'matchmaking/watch'; ticketId: string }
    // Lobby actions
    | { k: 'lobby/join'; name: string; password?: string; roleId?: string }
    | { k: 'lobby/ready'; playerId: string; isReady: boolean }
    | { k: 'lobby/role'; playerId: string; roleId: string }
    | { k: 'lobby/spectator'; playerId: string; isSpectator: boolean }
    | { k: 'lobby/cpu'; playerId: string; cpuCount: number; cpuLevel: CpuLevel }
    | { k: 'lobby/settings'; playerId: string; showRoles?: boolean; teamMode?: boolean }
    | { k: 'lobby/team'; playerId: string; targetPlayerId?: string; team: TeamColor }
    | { k: 'lobby/deck'; playerId: string; deckId: string }
    | { k: 'lobby/start'; playerId: string }
    | { k: 'lobby/leave'; playerId: string }
    | { k: 'lobby/disband'; playerId: string }
    // Match actions
    | { k: 'match/draw'; playerId: string; count?: number }
    | {
          k: 'match/play';
          playerId: string;
          cardId: string;
          targets?: string[];
          choices?: Record<string, unknown>;
          handIndex?: number;
      }
    | { k: 'match/endTurn'; playerId: string }
    | { k: 'match/roleAttack'; playerId: string; targetId: string; struggle?: boolean }
    | {
          k: 'match/roleAction';
          playerId: string;
          actionId: string;
          targetId?: string;
          choices?: Record<string, unknown>;
      }
    | { k: 'match/resolvePrompt'; playerId: string; accepted: boolean }
    | { k: 'match/resolveInfoDraw'; playerId: string; cardId: string }
    | { k: 'match/rescueBra'; playerId: string }
    | { k: 'match/end'; playerId: string };

export type ClientMsg =
    | { t: 'join'; name: string }
    | { t: 'action'; payload: ActionPayload }
    | { t: 'ping' };

export type ServerMsg =
    | { t: 'state'; state: unknown }
    | { t: 'lobby'; lobby: unknown }
    | { t: 'lobbies'; lobbies: unknown }
    | { t: 'lobbyCreated'; lobbyId: string; ownerPlayerId: string }
    | { t: 'lobbyJoined'; lobbyId: string; playerId: string }
    | { t: 'lobbyDisbanded'; lobbyId: string }
    | { t: 'soloMatchCreated'; matchId: string; playerId: string; playerName?: string }
    | { t: 'matchmakingTicket'; ticketId: string }
    | { t: 'matchmakingStatus'; ticketId: string; status: 'waiting' | 'matched' | 'not_found'; matchId?: string; playerId?: string; playerName?: string }
    | { t: 'error'; message: string }
    | { t: 'pong' };
