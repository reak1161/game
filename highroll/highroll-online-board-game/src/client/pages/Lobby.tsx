import React from 'react';
import type { DeckSummary, LobbySummary, MatchmakingStatus, Role } from '@shared/types';
import { useNavigate } from 'react-router-dom';
import { fetchDecks, fetchRoles } from '@client/api/catalog';
import RoleSelect from '@client/components/RoleSelect';
import { createSoloMatchVsCpu } from '@client/api/matches';
import {
    cancelMatchmaking,
    createLobby,
    enqueueMatchmaking,
    fetchLobbies,
    getMatchmakingStatus,
    joinLobby,
    setLobbyRole,
} from '@client/api/lobbies';
import { withApiBase } from '@client/config/api';
import { rememberMatchPlayer, rememberLobbyPlayer } from '@client/utils/matchPlayer';
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
    // CPU設定はロビー作成後（ロビー画面）で行う。ここは互換のため残しているが、UIは非表示。
    const [cpuCount, setCpuCount] = React.useState(0);
    const [cpuLevel, setCpuLevel] = React.useState<'easy' | 'normal' | 'hard'>('normal');
    const [ticketId, setTicketId] = React.useState<string | null>(null);
    const [queueStatus, setQueueStatus] = React.useState<MatchmakingStatus | null>(null);
    const [apiStatus, setApiStatus] = React.useState<'unknown' | 'online' | 'offline'>('unknown');
    const [apiMessage, setApiMessage] = React.useState<string | null>(null);
    const [showPatchNotes, setShowPatchNotes] = React.useState(false);
    const patchNotesForDisplay = React.useMemo(() => {
        const marker = /^## v/m;
        const match = marker.exec(patchNotesMarkdown);
        if (!match || match.index == null) {
            return patchNotesMarkdown.trim();
        }
        return patchNotesMarkdown.slice(match.index).trim();
    }, [patchNotesMarkdown]);

    const rememberPlayerControl = React.useCallback((matchId: string, playerId?: string | null, playerName?: string | null) => {
        if (matchId && playerId) {
            rememberMatchPlayer(matchId, playerId, playerName ?? undefined);
        }
    }, []);

    const navigate = useNavigate();

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
        const resolvedPlayerName = normalizeName(playerName);
        if (playerName.trim() && !resolvedPlayerName) {
            alert('プレイヤー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }
        try {
            const { matchId, playerId, state } = await createSoloMatchVsCpu(
                selectedRoleId,
                resolvedPlayerName ?? 'Player',
                selectedDeckId
            );
            const owner = state.players.find((p) => p.id === playerId) ?? state.players?.[0];
            rememberPlayerControl(matchId, owner?.id, owner?.name);
            navigate(`/match/${matchId}`);
        } catch (error) {
            flagNetworkError(error);
            alert(`マッチ作成に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleCreateLobby = async () => {
        const ownerNameResolved = normalizeName(playerName) ?? 'ホスト';
        if (playerName.trim() && ownerNameResolved === 'ホスト') {
            alert('プレイヤー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }
        const lobbyNameResolved = normalizeName(lobbyName);
        if (lobbyName.trim() && !lobbyNameResolved) {
            alert('ロビー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }
        try {
            const { lobbyId, ownerPlayerId } = await createLobby({
                lobbyName: lobbyNameResolved ?? undefined,
                ownerName: ownerNameResolved,
                password: password || undefined,
                deckId: selectedDeckId,
            });

            if (selectedRoleId) {
                await setLobbyRole(lobbyId, ownerPlayerId, selectedRoleId);
            }

            rememberLobbyPlayer(lobbyId, ownerPlayerId, ownerNameResolved);
            refreshLobbies();
            navigate(`/lobby/${lobbyId}`);
        } catch (error) {
            flagNetworkError(error);
            alert(`ロビー作成に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleJoinLobby = async (lobby: LobbySummary) => {
        const resolvedName = normalizeName(joinPlayerName || playerName);
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
            const result = await joinLobby(lobby.id, {
                name: resolvedName,
                password: pw,
                roleId: selectedRoleId ?? undefined,
            });
            if (selectedRoleId && result?.player?.id) {
                await setLobbyRole(lobby.id, result.player.id, selectedRoleId);
            }
            if (result?.player?.id) {
                rememberLobbyPlayer(lobby.id, result.player.id, resolvedName);
            }
            if (!lobby.isPrivate) {
                setJoinPassword('');
            }
            setJoinPlayerName(resolvedName);
            navigate(`/lobby/${lobby.id}`);
        } catch (error) {
            flagNetworkError(error);
            alert(`ロビー参加に失敗しました: ${(error as Error).message}`);
        }
    };

    const handleMatchmaking = async () => {
        const resolvedQueueName = normalizeName(queueName || playerName);
        if ((queueName || playerName || '').trim() && !resolvedQueueName) {
            alert('プレイヤー名は8文字以内の英数字/ひらがな/カタカナ/漢字のみです。');
            return;
        }
        try {
            const { ticketId: newTicket } = await enqueueMatchmaking(resolvedQueueName ?? 'プレイヤー', selectedRoleId ?? undefined, selectedDeckId);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: 32, margin: 0 }}>ホーム</h1>
                        <p style={{ marginTop: 12, color: '#e2e8f0' }}>ロールとデッキを選び、友だちとロビーまたは自動マッチングで対戦を始めましょう。</p>
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
                    <input value={joinPlayerName} onChange={(e) => setJoinPlayerName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="参加用プレイヤー名" style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                    <input value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="参加用パスワード（鍵付きのみ）" style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
                </div>
            </section>

            <section style={sectionStyle}>
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー作成</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                    <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="プレイヤー名" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <input value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="ロビー名" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード（任意）" style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <div style={{ display: 'none', gap: 8, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', minWidth: 180 }}>
                            CPU人数（0〜5）
                            <select
                                value={cpuCount}
                                onChange={(e) => setCpuCount(Number(e.target.value))}
                                style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                            >
                                {[0, 1, 2, 3, 4, 5].map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', minWidth: 180 }}>
                            CPU強さ
                            <select
                                value={cpuLevel}
                                onChange={(e) => setCpuLevel(e.target.value as 'easy' | 'normal' | 'hard')}
                                style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                            >
                                <option value="easy">EASY</option>
                                <option value="normal">NORMAL</option>
                                <option value="hard">HARD</option>
                            </select>
                        </label>
                    </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleCreateLobby} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff' }}>
                        ロビーを作成
                    </button>
                </div>
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
                    <input value={queueName} onChange={(e) => setQueueName(e.target.value)} maxLength={NAME_MAX_LENGTH} placeholder="マッチング用プレイヤー名" style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }} />
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

            <section id="patch-notes" style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 20, margin: 0 }}>パッチノート</h2>
                    <button
                        onClick={() => setShowPatchNotes((prev) => !prev)}
                        style={{ border: '1px solid #cbd5f5', background: '#fff', padding: '6px 12px', borderRadius: 10 }}
                    >
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
                    <p style={{ marginTop: 8, color: '#64748b' }}>「開く」を押すと、最新版の更新履歴を表示します。</p>
                )}
            </section>
        </div>
    );
};

export default Lobby;

