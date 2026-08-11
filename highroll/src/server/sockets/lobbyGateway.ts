import { Server, Socket } from 'socket.io';

const lobbyRoom = (lobbyId: string): string => `lobby:${lobbyId}`;

class LobbyGateway {
    constructor(private readonly io: Server) {
        this.registerListeners();
    }

    private registerListeners(): void {
        this.io.on('connection', (socket: Socket) => {
            console.log('A user connected:', socket.id);

            socket.on('joinLobby', (lobbyId: string) => {
                const room = lobbyRoom(lobbyId);
                socket.join(room);
                console.log(`User ${socket.id} joined lobby ${lobbyId}`);
                this.io.to(room).emit('userJoined', socket.id);
            });

            socket.on('leaveLobby', (lobbyId: string) => {
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

export { lobbyRoom };
export default LobbyGateway;
