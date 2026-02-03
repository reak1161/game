import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Lobby from './pages/Lobby';
import LobbyRoom from './pages/LobbyRoom';
import Match from './pages/Match';

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Lobby />} />
                <Route path="/lobby/:id" element={<LobbyRoom />} />
                <Route path="/match/:id" element={<Match />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
