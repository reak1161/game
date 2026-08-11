import express, { type Request, type Response } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import matchRoutes from './api/matchRoutes';
import catalogRoutes from './api/catalogRoutes';
import lobbyRoutes from './api/lobbyRoutes';
import LobbyGateway from './sockets/lobbyGateway';
import { registerLobbyServer } from './sockets/gatewayContext';

dotenv.config();

const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

app.use(
    cors({
        origin: CLIENT_ORIGIN,
        credentials: true,
    })
);

app.use(express.json());
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
});
app.use('/api/matches', matchRoutes);
app.use('/api/lobbies', lobbyRoutes);
app.use('/api/catalog', catalogRoutes);

const clientDistPath = path.resolve(__dirname, '../client');

if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));

    app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: CLIENT_ORIGIN,
        credentials: true,
    },
});

new LobbyGateway(io);
registerLobbyServer(io);

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});


