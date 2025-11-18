"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lobbyRoom = void 0;
const lobbyRoom = (lobbyId) => `lobby:${lobbyId}`;
exports.lobbyRoom = lobbyRoom;
class LobbyGateway {
    constructor(io) {
        this.io = io;
        this.registerListeners();
    }
    registerListeners() {
        this.io.on('connection', (socket) => {
            console.log('A user connected:', socket.id);
            socket.on('joinLobby', (lobbyId) => {
                const room = lobbyRoom(lobbyId);
                socket.join(room);
                console.log(`User ${socket.id} joined lobby ${lobbyId}`);
                this.io.to(room).emit('userJoined', socket.id);
            });
            socket.on('leaveLobby', (lobbyId) => {
                const room = lobbyRoom(lobbyId);
                socket.leave(room);
                console.log(`User ${socket.id} left lobby ${lobbyId}`);
                this.io.to(room).emit('userLeft', socket.id);
            });
            socket.on('disconnect', () => {
                console.log('User disconnected:', socket.id);
            });
        });
    }
}
exports.default = LobbyGateway;
