import React from 'react';
import { useNavigate } from 'react-router-dom';
import RoleSelect from '@client/components/RoleSelect';
import DeckSelectModal from '@client/components/DeckSelectModal';
import { getRolesCatalogLocal, listDeckSummariesLocal } from '@client/catalog/localCatalog';
import { API_BASE, wsBase } from '@client/config/env';
import { rememberLobbyPlayer, rememberMatchPlayer } from '@client/utils/matchPlayer';
import type { ActionPayload, ServerMsg } from '@shared/protocol';
import type { DeckSummary, LobbySummary, MatchmakingStatus, Role } from '@shared/types';
import patchNotesMarkdown from '../../../docs/patch_notes_public.md?raw';

const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;

const normalizeName = (value?: string | null): string | null => {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;
    if ([...trimmed].length > NAME_MAX_LENGTH) return null;
    if (!NAME_REGEX.test(trimmed)) return null;
    return trimmed;
};

const Lobby: React.FC = () => {
    const navigate = useNavigate();

    const [roles, setRoles] = React.useState<Role[]>([]);
    const [decks, setDecks] = React.useState<DeckSummary[]>([]);
    const [lobbies, setLobbies] = React.useState<LobbySummary[]>([]);

    const [selectedRoleId, setSelectedRoleId] = React.useState<string | null>(null);
    const [selectedDeckId, setSelectedDeckId] = React.useState('default_60');
    const [deckModalOpen, setDeckModalOpen] = React.useState(false);

    const [playerName, setPlayerName] = React.useState('');
    const [lobbyName, setLobbyName] = React.useState('');
    const [password, setPassword] = React.useState('');

    const [joinPlayerName, setJoinPlayerName] = React.useState('');
    const [joinPassword, setJoinPassword] = React.useState('');

    const [queueName, setQueueName] = React.useState('');
    const [ticketId, setTicketId] = React.useState<string | null>(null);
    const [queueStatus, setQueueStatus] = React.useState<MatchmakingStatus | null>(null);

    const [message, setMessage] = React.useState<string | null>(null);
    const [showPatchNotes, setShowPatchNotes] = React.useState(false);
    const [wsConnected, setWsConnected] = React.useState(false);

    const wsRef = React.useRef<WebSocket | null>(null);
    const pendingCreateOwnerNameRef = React.useRef<string | null>(null);
    const ticketIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        ticketIdRef.current = ticketId;
    }, [ticketId]);

    const patchNotesForDisplay = React.useMemo(() => {
        const marker = /^## v/m;
        const match = marker.exec(patchNotesMarkdown);
        if (!match || match.index == null) {
            return patchNotesMarkdown.trim();
        }
        return patchNotesMarkdown.slice(match.index).trim();
    }, [patchNotesMarkdown]);

    React.useEffect(() => {
        try {
            const roleData = getRolesCatalogLocal();
            const deckData = listDeckSummariesLocal();
            setRoles(roleData);
            setDecks(deckData);
            if (!selectedRoleId && roleData.length > 0) {
                setSelectedRoleId(roleData[0].id);
            }
            if (deckData.length > 0 && !deckData.some((d) => d.id === selectedDeckId)) {
                setSelectedDeckId(deckData[0].id);
            }
        } catch (error) {
            console.error(error);
            setMessage('ロール/デッキの読み込みに失敗しました。');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedDeck = React.useMemo(() => decks.find((deck) => deck.id === selectedDeckId) ?? null, [decks, selectedDeckId]);

    const sendWsAction = React.useCallback((payload: ActionPayload): boolean => {
        const ws = wsRef.current;
        if (!ws) return false;
        if (ws.readyState !== WebSocket.OPEN) return false;
        try {
            ws.send(JSON.stringify({ t: 'action', payload }));
            return true;
        } catch {
            return false;
        }
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const url = `${wsBase(API_BASE)}/lobbies/ws`;
        let reconnectTimer: number | null = null;
        let pingTimer: number | null = null;
        let lastPongAt = Date.now();
        let backoffMs = 500;
        let closedByClient = false;
        let startTimer: number | null = null;

        const cleanup = () => {
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            if (pingTimer) window.clearInterval(pingTimer);
            reconnectTimer = null;
            pingTimer = null;
        };

        const closeCurrent = () => {
            const prev = wsRef.current;
            wsRef.current = null;
            if (prev) {
                try {
                    prev.close();
                } catch {
                    // noop
                }
            }
        };

        const connect = () => {
            cleanup();
            closeCurrent();

            const ws = new WebSocket(url);
            wsRef.current = ws;
            closedByClient = false;
            const isCurrent = () => wsRef.current === ws;

            const scheduleReconnect = () => {
                if (!isCurrent()) return;
                if (closedByClient) return;
                setWsConnected(false);
                cleanup();
                if (reconnectTimer) window.clearTimeout(reconnectTimer);
                const wait = Math.min(5000, backoffMs);
                backoffMs = Math.min(5000, Math.floor(backoffMs * 1.6));
                reconnectTimer = window.setTimeout(() => connect(), wait);
            };

            ws.addEventListener('open', () => {
                if (!isCurrent()) return;
                setWsConnected(true);
                backoffMs = 500;
                lastPongAt = Date.now();

                const existingTicket = ticketIdRef.current;
                if (existingTicket) {
                    try {
                        ws.send(JSON.stringify({ t: 'action', payload: { k: 'matchmaking/watch', ticketId: existingTicket } satisfies ActionPayload }));
                    } catch {
                        // noop
                    }
                }

                pingTimer = window.setInterval(() => {
                    const now = Date.now();
                    if (now - lastPongAt > 60000) {
                        try {
                            ws.close();
                        } catch {
                            // noop
                        }
                        return;
                    }
                    if (ws.readyState !== WebSocket.OPEN) {
                        return;
                    }
                    try {
                        ws.send(JSON.stringify({ t: 'ping' }));
                    } catch {
                        // noop
                    }
                }, 25000);
            });

            ws.addEventListener('message', (event) => {
                if (!isCurrent()) return;
                let parsed: ServerMsg | null = null;
                try {
                    parsed = JSON.parse(String(event.data)) as ServerMsg;
                } catch {
                    return;
                }

                if (parsed.t === 'pong') {
                    lastPongAt = Date.now();
                    return;
                }
                if (parsed.t === 'lobbies') {
                    setLobbies((parsed.lobbies as LobbySummary[]) ?? []);
                    return;
                }
                if (parsed.t === 'matchmakingTicket') {
                    const newTicketId = String(parsed.ticketId ?? '');
                    if (!newTicketId) {
                        setMessage('マッチング開始に失敗しました。');
                        return;
                    }
                    setTicketId(newTicketId);
                    setQueueStatus('waiting');
                    return;
                }
                if (parsed.t === 'matchmakingStatus') {
                    const currentTicketId = String(parsed.ticketId ?? '');
                    const status = (String(parsed.status ?? '') as MatchmakingStatus) || 'not_found';
                    if (ticketIdRef.current && currentTicketId && ticketIdRef.current !== currentTicketId) {
                        return;
                    }
                    setQueueStatus(status);
                    if (status === 'matched') {
                        const matchId = String(parsed.matchId ?? '');
                        const playerId = String(parsed.playerId ?? '');
                        const playerNameResolved = parsed.playerName ? String(parsed.playerName) : undefined;
                        if (!matchId || !playerId) {
                            setMessage('マッチング成立に失敗しました。');
                            setTicketId(null);
                            return;
                        }
                        rememberMatchPlayer(matchId, playerId, playerNameResolved);
                        setTicketId(null);
                        setQueueStatus(null);
                        navigate(`/match/${matchId}`);
                    }
                    if (status === 'not_found') {
                        setTicketId(null);
                    }
                    return;
                }
                if (parsed.t === 'lobbyCreated') {
                    const lobbyId = String(parsed.lobbyId ?? '');
                    const ownerPlayerId = String(parsed.ownerPlayerId ?? '');
                    if (!lobbyId || !ownerPlayerId) {
                        setMessage('ロビー作成に失敗しました。');
                        return;
                    }
                    const ownerNameResolved = pendingCreateOwnerNameRef.current ?? 'ホスト';
                    rememberLobbyPlayer(lobbyId, ownerPlayerId, ownerNameResolved);
                    navigate(`/lobby/${lobbyId}`);
                    return;
                }
                if (parsed.t === 'soloMatchCreated') {
                    const matchId = String(parsed.matchId ?? '');
                    const playerId = String(parsed.playerId ?? '');
                    const playerNameResolved = parsed.playerName ? String(parsed.playerName) : undefined;
                    if (!matchId || !playerId) {
                        setMessage('ソロマッチ開始に失敗しました。');
                        return;
                    }
                    rememberMatchPlayer(matchId, playerId, playerNameResolved);
                    navigate(`/match/${matchId}`);
                    return;
                }
                if (parsed.t === 'error') {
                    setMessage(String(parsed.message ?? 'サーバーエラー'));
                }
            });

            ws.addEventListener('close', () => scheduleReconnect());
            ws.addEventListener('error', () => scheduleReconnect());
        };

        // React StrictMode (dev) で Effect が二重実行されると、接続直後に close され
        // 「WebSocket is closed before the connection is established」が出やすい。
        // 1tick 遅らせて、1回目の mount/unmount では接続しないようにする。
        startTimer = window.setTimeout(() => connect(), 0);

        return () => {
            closedByClient = true;
            if (startTimer) window.clearTimeout(startTimer);
            cleanup();
            closeCurrent();
        };
    }, [navigate]);

    const handleSoloStart = React.useCallback(() => {
        if (!selectedRoleId) {
            alert('ロールを選択してください。');
            return;
        }
        const resolvedPlayerName = normalizeName(playerName);
        if (playerName.trim() && !resolvedPlayerName) {
            alert('プレイヤー名は8文字まで、英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }

        const ok = sendWsAction({
            k: 'matches/soloCpu',
            name: resolvedPlayerName ?? 'Player',
            roleId: selectedRoleId,
            deckId: selectedDeckId,
            cpuLevel: 'normal',
        } as ActionPayload);
        if (!ok) {
            alert('WebSocketに接続できていません。少し待ってから再試行してください。');
        }
    }, [playerName, selectedDeckId, selectedRoleId, sendWsAction]);

    const handleCreateLobby = React.useCallback(() => {
        const ownerNameResolved = normalizeName(playerName) ?? 'ホスト';
        if (playerName.trim() && !normalizeName(playerName)) {
            alert('プレイヤー名は8文字まで、英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }
        const lobbyNameResolved = normalizeName(lobbyName);
        if (lobbyName.trim() && !lobbyNameResolved) {
            alert('ロビー名は8文字まで、英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }

        pendingCreateOwnerNameRef.current = ownerNameResolved;
        const ok = sendWsAction({
            k: 'lobbies/create',
            deckId: selectedDeckId,
            lobbyName: lobbyNameResolved ?? undefined,
            ownerName: ownerNameResolved,
            password: password || undefined,
            roleId: selectedRoleId ?? undefined,
        });
        if (!ok) {
            alert('WebSocketに接続できていません。少し待ってから再試行してください。');
        }
    }, [lobbyName, password, playerName, selectedDeckId, selectedRoleId, sendWsAction]);

    const handleJoinLobby = React.useCallback(
        (lobby: LobbySummary) => {
            const resolvedName = normalizeName(joinPlayerName || playerName);
            if (!resolvedName) {
                alert('参加するプレイヤー名を入力してください。');
                return;
            }
            if (lobby.isPrivate && !joinPassword.trim()) {
                alert('このロビーはパスワードが必要です。');
                return;
            }
            const pw = lobby.isPrivate ? joinPassword.trim() : undefined;
            try {
                sessionStorage.setItem(
                    `pendingLobbyJoin:${lobby.id}`,
                    JSON.stringify({ name: resolvedName, password: pw, roleId: selectedRoleId ?? undefined })
                );
                if (!lobby.isPrivate) {
                    setJoinPassword('');
                }
                setJoinPlayerName(resolvedName);
                navigate(`/lobby/${lobby.id}`);
            } catch (error) {
                alert(`ロビー参加に失敗しました: ${(error as Error).message}`);
            }
        },
        [joinPassword, joinPlayerName, navigate, playerName, selectedRoleId]
    );

    const handleMatchmaking = React.useCallback(() => {
        const resolvedQueueName = normalizeName(queueName || playerName);
        if ((queueName || playerName || '').trim() && !resolvedQueueName) {
            alert('プレイヤー名は8文字まで、英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }
        const ok = sendWsAction({
            k: 'matchmaking/enqueue',
            name: resolvedQueueName ?? 'プレイヤー',
            roleId: selectedRoleId ?? undefined,
            deckId: selectedDeckId,
        });
        if (!ok) {
            alert('WebSocketに接続できていません。少し待ってから再試行してください。');
            return;
        }
        setQueueStatus('waiting');
    }, [playerName, queueName, selectedDeckId, selectedRoleId, sendWsAction]);

    const handleCancelMatchmaking = React.useCallback(() => {
        if (!ticketId) return;
        sendWsAction({ k: 'matchmaking/cancel', ticketId });
        setTicketId(null);
        setQueueStatus(null);
    }, [sendWsAction, ticketId]);

    const sectionStyle: React.CSSProperties = {
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: 32, margin: 0 }}>ホーム</h1>
                        <p style={{ marginTop: 12, color: '#e2e8f0' }}>ロールとデッキを選んで、ソロ/ロビー/自動マッチングで遊べます。</p>
                        <div style={{ marginTop: 8, fontSize: 12, color: '#cbd5f5' }}>WS: {wsConnected ? '接続中' : '未接続（自動再接続）'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => {
                                setShowPatchNotes(true);
                                window.setTimeout(() => {
                                    document.getElementById('patch-notes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 0);
                            }}
                            style={{
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: '1px solid rgba(226,232,240,0.5)',
                                background: 'rgba(15, 23, 42, 0.25)',
                                color: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            パッチノート
                        </button>
                    </div>
                </div>
            </section>

            {message && (
                <section style={{ ...sectionStyle, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ color: '#9a3412' }}>{message}</div>
                        <button onClick={() => setMessage(null)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fdba74', background: '#fff' }}>
                            閉じる
                        </button>
                    </div>
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
                        ソロで即マッチ（CPU 1人）
                    </button>
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>デッキ選択</h2>
                <button
                    onClick={() => setDeckModalOpen(true)}
                    style={{
                        width: '100%',
                        padding: 12,
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                        textAlign: 'left',
                        cursor: 'pointer',
                    }}
                >
                    <div style={{ fontSize: 12, color: '#64748b' }}>選択中のデッキ</div>
                    <div style={{ marginTop: 4, fontWeight: 800 }}>
                        {selectedDeck ? `${selectedDeck.name}（${selectedDeck.total}枚）` : selectedDeckId}
                    </div>
                </button>
                <DeckSelectModal
                    open={deckModalOpen}
                    decks={decks}
                    selectedDeckId={selectedDeckId}
                    onClose={() => setDeckModalOpen(false)}
                    onSelect={(deckId) => {
                        setSelectedDeckId(deckId);
                        setDeckModalOpen(false);
                    }}
                />
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー参加</h2>
                <p style={{ color: '#64748b', marginBottom: 12 }}>参加に使う名前/パスワードを入力してから、ロビー一覧の「参加」を押してください。</p>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <input value={joinPlayerName} onChange={(e) => setJoinPlayerName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="参加プレイヤー名（省略時は下のプレイヤー名）" style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <input value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="参加パスワード（必要なロビーのみ）" style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー作成</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                    <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="プレイヤー名（省略可）" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <input value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="ロビー名（省略可）" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード（任意）" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleCreateLobby} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff' }}>
                        ロビーを作成
                    </button>
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー一覧</h2>
                {lobbies.length === 0 ? (
                    <p style={{ color: '#64748b' }}>ロビーはありません。</p>
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
                                        {lobby.isPrivate ? '（パスワード）' : ''}
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
                    <input value={queueName} onChange={(e) => setQueueName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="マッチング用プレイヤー名（省略時はプレイヤー名）" style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <button onClick={handleMatchmaking} disabled={Boolean(ticketId)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: ticketId ? '#94a3b8' : '#16a34a', color: '#fff' }}>
                        {ticketId ? '待機中' : 'マッチングに参加'}
                    </button>
                    {ticketId && (
                        <button onClick={handleCancelMatchmaking} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #f87171', background: '#fff', color: '#b91c1c' }}>
                            キャンセル
                        </button>
                    )}
                </div>
                {ticketId && <p style={{ marginTop: 8 }}>ステータス: {queueStatus ?? 'checking...'} / チケット: {ticketId}</p>}
            </section>

            <section id="patch-notes" style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 20, margin: 0 }}>パッチノート</h2>
                    <button onClick={() => setShowPatchNotes((prev) => !prev)} style={{ border: '1px solid #cbd5f5', background: '#fff', padding: '6px 12px', borderRadius: 10 }}>
                        {showPatchNotes ? '閉じる' : '開く'}
                    </button>
                </div>
                {showPatchNotes ? (
                    <pre
                        style={{
                            marginTop: 12,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: '#0f172a',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 12,
                            padding: 12,
                            maxHeight: 520,
                            overflow: 'auto',
                        }}
                    >
                        {patchNotesForDisplay}
                    </pre>
                ) : (
                    <p style={{ marginTop: 8, color: '#64748b' }}>「開く」を押すと、公開用の変更履歴を表示します。</p>
                )}
            </section>
        </div>
    );
};

export default Lobby;
