import React from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DeckSummary, LobbySummary, MatchmakingStatus, Role } from '@shared/types';
import { useNavigate } from 'react-router-dom';
import { fetchDecks, fetchRoles } from '@client/api/catalog';
import RoleSelect from '@client/components/RoleSelect';
import { createMatchWithRole } from '@client/api/matches';
import {
    cancelMatchmaking,
    createLobby,
    enqueueMatchmaking,
    fetchLobbies,
    getMatchmakingStatus,
    joinLobby,
    setLobbyRole,
    startLobby,
} from '@client/api/lobbies';
import { SOCKET_URL, withApiBase } from '@client/config/api';
import { rememberMatchPlayer, rememberLobbyPlayer, clearRememberedLobbyPlayer, getRememberedLobbyPlayer } from '@client/utils/matchPlayer';

type LobbyOwnerContext = { lobbyId: string; ownerPlayerId: string; ownerPlayerName: string } | null;
type PlayerLobbyContext = { lobbyId: string; playerId: string; playerName: string } | null;

const Lobby: React.FC = () => {
    const [roles, setRoles] = React.useState<Role[]>([]);
    const [decks, setDecks] = React.useState<DeckSummary[]>([]);
    const [lobbies, setLobbies] = React.useState<LobbySummary[]>([]);
    const [selectedRoleId, setSelectedRoleId] = React.useState<string | null>(null);
    const [selectedDeckId, setSelectedDeckId] = React.useState('default_60');
    const [playerName, setPlayerName] = React.useState('');
    const [lobbyName, setLobbyName] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [queueName, setQueueName] = React.useState('');
    const [joinPlayerName, setJoinPlayerName] = React.useState('');
    const [joinPassword, setJoinPassword] = React.useState('');
    const [ticketId, setTicketId] = React.useState<string | null>(null);
    const [queueStatus, setQueueStatus] = React.useState<MatchmakingStatus | null>(null);
    const [ownedLobby, setOwnedLobby] = React.useState<LobbyOwnerContext>(null);
    const [playerLobbyContext, setPlayerLobbyContext] = React.useState<PlayerLobbyContext>(null);
    const [subscribedLobbyId, setSubscribedLobbyId] = React.useState<string | null>(null);
    const [socket, setSocket] = React.useState<Socket | null>(null);
    const [apiStatus, setApiStatus] = React.useState<'unknown' | 'online' | 'offline'>('unknown');
    const [apiMessage, setApiMessage] = React.useState<string | null>(null);

    const rememberPlayerControl = React.useCallback((matchId: string, playerId?: string | null, playerName?: string | null) => {
        if (matchId && playerId) {
            rememberMatchPlayer(matchId, playerId, playerName ?? undefined);
        }
    }, []);

    const rememberLobbyControl = React.useCallback((lobbyId: string, playerId?: string | null, playerName?: string | null) => {
        if (lobbyId && playerId) {
            rememberLobbyPlayer(lobbyId, playerId, playerName ?? undefined);
        }
    }, []);

    const navigate = useNavigate();

    React.useEffect(() => {
        const lobbySocket = io(SOCKET_URL ?? undefined, {
            transports: ['websocket'],
            withCredentials: true,
        });
        setSocket(lobbySocket);
        return () => lobbySocket.disconnect();
    }, []);

    React.useEffect(() => {
        if (!socket) {
            return;
        }

        const handleLobbyStarted = (payload: { lobbyId: string; matchId: string }) => {
            if (payload?.lobbyId === subscribedLobbyId) {
                const rememberedLobbyPlayer = getRememberedLobbyPlayer(payload.lobbyId);
                const controllingPlayerId = playerLobbyContext?.playerId ?? rememberedLobbyPlayer?.id ?? ownedLobby?.ownerPlayerId ?? null;
                const controllingPlayerName = playerLobbyContext?.playerName ?? rememberedLobbyPlayer?.name ?? ownedLobby?.ownerPlayerName ?? null;
                rememberPlayerControl(payload.matchId, controllingPlayerId, controllingPlayerName);
                if (payload.lobbyId) {
                    clearRememberedLobbyPlayer(payload.lobbyId);
                }
                setSubscribedLobbyId(null);
                setOwnedLobby(null);
                setPlayerLobbyContext(null);
                navigate(`/match/${payload.matchId}`);
            }
        };

        socket.on('lobbyStarted', handleLobbyStarted);
        return () => {
            socket.off('lobbyStarted', handleLobbyStarted);
        };
    }, [socket, subscribedLobbyId, navigate, playerLobbyContext, ownedLobby, rememberPlayerControl, getRememberedLobbyPlayer, clearRememberedLobbyPlayer]);

    React.useEffect(() => {
        if (!socket) {
            return;
        }

        if (subscribedLobbyId) {
            socket.emit('joinLobby', subscribedLobbyId);
            return () => {
                socket.emit('leaveLobby', subscribedLobbyId);
            };
        }

        return undefined;
    }, [socket, subscribedLobbyId]);

    const handleNetworkFailure = React.useCallback((message?: string) => {
        setApiStatus('offline');
        setApiMessage(message ?? 'APIに接続できません。`npm run dev` または `npm run dev:server` でサーバーを起動してください。');
    }, []);

    const flagNetworkError = React.useCallback((error: unknown) => {
        if (error instanceof TypeError || (error as Error)?.message?.includes('Failed to fetch')) {
            handleNetworkFailure();
        }
    }, [handleNetworkFailure]);

    const checkApiHealth = React.useCallback(async () => {
        try {
            await fetch(withApiBase('/health'), { credentials: 'include' });
            setApiStatus('online');
            setApiMessage(null);
            return true;
        } catch (_error) {
            handleNetworkFailure();
            return false;
        }
    }, [handleNetworkFailure]);

    const loadInitialCatalogs = React.useCallback(async () => {
        const healthy = await checkApiHealth();
        if (!healthy) {
            throw new Error('API offline');
        }
        const [roleData, deckData] = await Promise.all([fetchRoles(), fetchDecks()]);
        setRoles(roleData);
        setDecks(deckData);
        if (deckData.length > 0) {
            setSelectedDeckId(deckData[0].id);
        }
    }, [checkApiHealth]);

    const refreshLobbies = React.useCallback(async () => {
        try {
            const healthy = await checkApiHealth();
            if (!healthy) {
                setLobbies([]);
                return;
            }
            setLobbies(await fetchLobbies());
        } catch (error) {
            console.error(error);
            setLobbies([]);
            flagNetworkError(error);
        }
    }, [checkApiHealth, flagNetworkError]);

    React.useEffect(() => {
        loadInitialCatalogs()
            .catch((error) => {
                setRoles([]);
                setDecks([]);
                flagNetworkError(error);
            });
        refreshLobbies();
    }, [loadInitialCatalogs, refreshLobbies, flagNetworkError]);

    React.useEffect(() => {
        if (apiStatus !== 'offline') {
            return undefined;
        }
        const timer = setInterval(() => {
            checkApiHealth().catch(() => {
                /* swallow */
            });
        }, 5000);
        return () => clearInterval(timer);
    }, [apiStatus, checkApiHealth]);

    React.useEffect(() => {
        if (!ticketId) {
            return undefined;
        }

        const interval = setInterval(() => {
            getMatchmakingStatus(ticketId)
                .then((result) => {
                    setQueueStatus(result.status);
                    if (result.status === 'matched' && result.matchId) {
                        setTicketId(null);
                        setQueueStatus(null);
                        navigate(`/match/${result.matchId}`);
                    }
                })
                .catch((error) => {
                    setQueueStatus('not_found');
                    clearInterval(interval);
                    flagNetworkError(error);
                });
        }, 2000);

        return () => clearInterval(interval);
    }, [ticketId, navigate]);

    const handleSoloStart = async () => {
        if (!selectedRoleId) {
            alert('ロールを選択してください。');
            return;
        }
        try {
            const { matchId, state } = await createMatchWithRole(selectedRoleId, playerName || 'Player', selectedDeckId);
            const owner = state.players?.[0];
            rememberPlayerControl(matchId, owner?.id, owner?.name);
            navigate(`/match/${matchId}`);
        } catch (error) {
            flagNetworkError(error);
            alert(`マッチ作成に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleCreateLobby = async () => {
        const ownerNameResolved = (playerName || 'ホスト').trim() || 'ホスト';
        try {
            const { lobbyId, ownerPlayerId } = await createLobby({
                lobbyName,
                ownerName: ownerNameResolved,
                password: password || undefined,
                deckId: selectedDeckId,
            });

            if (selectedRoleId) {
                await setLobbyRole(lobbyId, ownerPlayerId, selectedRoleId);
            }

            setOwnedLobby({ lobbyId, ownerPlayerId, ownerPlayerName: ownerNameResolved });
            setPlayerLobbyContext({ lobbyId, playerId: ownerPlayerId, playerName: ownerNameResolved });
            setSubscribedLobbyId(lobbyId);
            rememberLobbyControl(lobbyId, ownerPlayerId, ownerNameResolved);
            refreshLobbies();
        } catch (error) {
            flagNetworkError(error);
            alert(`ロビー作成に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleJoinLobby = async (lobby: LobbySummary) => {
        const resolvedName = (joinPlayerName || playerName || '').trim();
        if (!resolvedName) {
            alert('参加するプレイヤー名を入力してください。');
            return;
        }
        if (lobby.isPrivate && !joinPassword.trim()) {
            alert('このロビーはパスワードが必要です。参加用パスワードを入力してください。');
            return;
        }
        const pw = lobby.isPrivate ? joinPassword.trim() : undefined;
        try {
            const result = await joinLobby(lobby.id, { name: resolvedName, password: pw, roleId: selectedRoleId ?? undefined });
            if (selectedRoleId && result?.player?.id) {
                await setLobbyRole(lobby.id, result.player.id, selectedRoleId);
            }
            setPlayerLobbyContext({ lobbyId: lobby.id, playerId: result?.player?.id, playerName: resolvedName });
            setSubscribedLobbyId(lobby.id);
            rememberLobbyControl(lobby.id, result?.player?.id ?? undefined);
            if (!lobby.isPrivate) {
                setJoinPassword('');
            }
            setJoinPlayerName(resolvedName);
            alert('ロビーに参加しました。ホストが開始するまでお待ちください。');
        } catch (error) {
            flagNetworkError(error);
            alert(`ロビー参加に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleStartOwnedLobby = async () => {
        if (!ownedLobby) {
            alert('開始できるロビーがありません。');
            return;
        }
        try {
            const { matchId } = await startLobby(ownedLobby.lobbyId, ownedLobby.ownerPlayerId);
            rememberPlayerControl(matchId, ownedLobby.ownerPlayerId, ownedLobby.ownerPlayerName);
            clearRememberedLobbyPlayer(ownedLobby.lobbyId);
            setOwnedLobby(null);
            setSubscribedLobbyId(null);
            navigate(`/match/${matchId}`);
        } catch (error) {
            flagNetworkError(error);
            alert(`ロビーの開始に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleMatchmaking = async () => {
        try {
            const { ticketId: newTicket } = await enqueueMatchmaking(queueName || playerName || 'プレイヤー', selectedRoleId ?? undefined, selectedDeckId);
            setTicketId(newTicket);
            setQueueStatus('waiting');
        } catch (error) {
            flagNetworkError(error);
            alert(`マッチング登録に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleCancelMatchmaking = async () => {
        if (!ticketId) return;
        try {
            await cancelMatchmaking(ticketId);
            setTicketId(null);
            setQueueStatus(null);
        } catch (error) {
            flagNetworkError(error);
            alert(`マッチングキャンセルに失敗しました: ${(error as Error).message}`);
        }
    };

    const sectionStyle = {
        marginTop: 24,
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        padding: 20,
        boxShadow: '0 8px 20px rgba(15,23,42,0.05)',
    };

    return (
        <div className="lobby container" style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 64px', minHeight: '100vh' }}>
            <section style={{ background: 'linear-gradient(120deg, #0f172a, #1e3a8a)', borderRadius: 24, padding: '32px 40px', color: '#fff', boxShadow: '0 15px 35px rgba(15,23,42,0.3)' }}>
                <h1 style={{ fontSize: 32, margin: 0 }}>Highroll Lobby</h1>
                <p style={{ marginTop: 12, color: '#e2e8f0' }}>ロールとデッキを選び、友だちとロビーまたは自動マッチングで対戦を始めましょう。</p>
            </section>
            {apiStatus === 'offline' && (
                <section style={{ ...sectionStyle, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 16 }}>
                    <h2 style={{ fontSize: 18, color: '#b91c1c', marginBottom: 8 }}>API に接続できません</h2>
                    <p style={{ color: '#b91c1c', marginBottom: 8 }}>
                        {apiMessage ?? 'バックエンドサーバーに到達できません。以下を確認してください。'}
                    </p>
                    <ul style={{ color: '#991b1b', paddingLeft: 18, marginBottom: 12 }}>
                        <li>WSL / ターミナルで `npm run dev` または `npm run dev:server` を実行してポート 4000 を起動する</li>
                        <li>既存の Node プロセスがポートを塞いでいないか確認（`lsof -i :4000`）</li>
                        <li>再接続しても解消しない場合は `.env` の URL 設定を確認</li>
                    </ul>
                    <button onClick={() => { checkApiHealth().catch(() => undefined); }} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c' }}>
                        再接続を試す
                    </button>
                </section>
            )}

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロール選択</h2>
                <RoleSelect roles={roles} selectedId={selectedRoleId} onSelect={setSelectedRoleId} />
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                        onClick={handleSoloStart}
                        disabled={!selectedRoleId}
                        style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            border: 'none',
                            background: selectedRoleId ? '#2563eb' : '#94a3b8',
                            color: '#fff',
                            cursor: selectedRoleId ? 'pointer' : 'not-allowed',
                        }}
                    >
                        ソロで即マッチ開始
                    </button>
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>デッキ選択</h2>
                <select
                    value={selectedDeckId}
                    onChange={(e) => setSelectedDeckId(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                >
                    {decks.map((deck) => (
                        <option key={deck.id} value={deck.id}>
                            {deck.name}（{deck.total}枚）
                        </option>
                    ))}
                </select>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー参加情報</h2>
                <p style={{ color: '#64748b', marginBottom: 12 }}>既存ロビーへ参加するときに使用するプレイヤー名・パスワード（鍵付きのみ）を設定します。</p>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <input value={joinPlayerName} onChange={(e) => setJoinPlayerName(e.target.value)} placeholder="参加用プレイヤー名" style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <input value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="参加用パスワード（鍵付きのみ）" style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー作成</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                    <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="プレイヤー名" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <input value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} placeholder="ロビー名" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード（任意）" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleCreateLobby} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff' }}>
                        ロビーを作成
                    </button>
                    {ownedLobby && (
                        <button onClick={handleStartOwnedLobby} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5f5', background: '#fff' }}>
                            自分のロビーを開始
                        </button>
                    )}
                </div>
                {ownedLobby && (
                    <p style={{ marginTop: 8, color: '#0f172a' }}>Lobby ID: {ownedLobby.lobbyId}</p>
                )}
            </section>

            <section style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: 20 }}>公開ロビー一覧</h2>
                    <button onClick={refreshLobbies} style={{ border: 'none', background: '#e2e8f0', padding: '6px 12px', borderRadius: 6 }}>更新</button>
                </div>
                {lobbies.length === 0 ? (
                    <p style={{ color: '#64748b' }}>公開ロビーはありません。</p>
                ) : (
                    <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                                <th>名前</th>
                                <th>人数</th>
                                <th>デッキ</th>
                                <th>参加</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lobbies.map((lobby) => (
                                <tr key={lobby.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td>
                                        {lobby.name}
                                        {lobby.isPrivate ? '（鍵付き）' : ''}
                                    </td>
                                    <td>{lobby.playerCount}</td>
                                    <td>{lobby.deckId}</td>
                                    <td>
                                        <button onClick={() => handleJoinLobby(lobby)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #94a3b8', background: '#fff' }}>
                                            参加
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20 }}>自動マッチング</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <input value={queueName} onChange={(e) => setQueueName(e.target.value)} placeholder="マッチング用プレイヤー名" style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <button onClick={handleMatchmaking} disabled={Boolean(ticketId)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: ticketId ? '#94a3b8' : '#16a34a', color: '#fff' }}>
                        {ticketId ? '待機中' : 'マッチングに参加'}
                    </button>
                    {ticketId && (
                        <button onClick={handleCancelMatchmaking} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #f87171', background: '#fff', color: '#b91c1c' }}>
                            キャンセル
                        </button>
                    )}
                </div>
                {ticketId && (
                    <p style={{ marginTop: 8 }}>ステータス: {queueStatus ?? 'checking...'} （チケット: {ticketId}）</p>
                )}
            </section>
        </div>
    );
};

export default Lobby;

