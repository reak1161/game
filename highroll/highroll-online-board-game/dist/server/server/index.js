"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const matchRoutes_1 = __importDefault(require("./api/matchRoutes"));
const catalogRoutes_1 = __importDefault(require("./api/catalogRoutes"));
const lobbyRoutes_1 = __importDefault(require("./api/lobbyRoutes"));
const lobbyGateway_1 = __importDefault(require("./sockets/lobbyGateway"));
const gatewayContext_1 = require("./sockets/gatewayContext");
dotenv_1.default.config();
const app = (0, express_1.default)();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
app.use((0, cors_1.default)({
    origin: CLIENT_ORIGIN,
    credentials: true,
}));
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/api/matches', matchRoutes_1.default);
app.use('/api/lobbies', lobbyRoutes_1.default);
app.use('/api/catalog', catalogRoutes_1.default);
const clientDistPath = path_1.default.resolve(__dirname, '../client');
if (process.env.NODE_ENV === 'production' && fs_1.default.existsSync(clientDistPath)) {
    app.use(express_1.default.static(clientDistPath));
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
    });
}
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: CLIENT_ORIGIN,
        credentials: true,
    },
});
new lobbyGateway_1.default(io);
(0, gatewayContext_1.registerLobbyServer)(io);
const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
