import type { Server } from 'socket.io';

let lobbySocketServer: Server | null = null;

export const registerLobbyServer = (server: Server): void => {
    lobbySocketServer = server;
};

export const emitLobbyEvent = (lobbyId: string, event: string, payload: unknown): void => {
    lobbySocketServer?.to(`lobby:${lobbyId}`).emit(event, payload);
};
