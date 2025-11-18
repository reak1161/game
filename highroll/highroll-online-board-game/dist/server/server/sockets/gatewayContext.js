"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitLobbyEvent = exports.registerLobbyServer = void 0;
let lobbySocketServer = null;
const registerLobbyServer = (server) => {
    lobbySocketServer = server;
};
exports.registerLobbyServer = registerLobbyServer;
const emitLobbyEvent = (lobbyId, event, payload) => {
    lobbySocketServer?.to(`lobby:${lobbyId}`).emit(event, payload);
};
exports.emitLobbyEvent = emitLobbyEvent;
