import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState } from '@/shared/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:4000';

const useGameClient = (roomId: string | null) => {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);

    useEffect(() => {
        if (!roomId) {
            return undefined;
        }

        const newSocket = io(SERVER_URL, {
            transports: ['websocket'],
            withCredentials: true,
            query: { roomId },
        });

        setSocket(newSocket);

        newSocket.on('gameStateUpdate', (state: GameState) => {
            setGameState(state);
        });

        return () => {
            newSocket.disconnect();
            setSocket(null);
            setGameState(null);
        };
    }, [roomId]);

        const sendAction = useCallback(
            (action: unknown) => {
                if (socket && roomId) {
                    socket.emit('playerAction', { roomId, action });
                }
            },
            [socket, roomId]
        );

    return {
        isConnected: socket?.connected ?? false,
        gameState,
        sendAction,
    };
};

export default useGameClient;