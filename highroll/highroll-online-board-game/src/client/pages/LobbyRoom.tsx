import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import type { LobbyDetail, Role } from '@shared/types';
import { fetchRoles } from '@client/api/catalog';
import { addLobbyCpu, fetchLobby, leaveLobby, setLobbyReady, setLobbyRole, setLobbySpectator, startLobby, updateLobbySettings } from '@client/api/lobbies';
import { SOCKET_URL } from '@client/config/api';
import { getRememberedLobbyPlayer, rememberMatchPlayer, clearRememberedLobbyPlayer } from '@client/utils/matchPlayer';
import RoleSelect from '@client/components/RoleSelect';

const MAX_PLAYERS = 6;

const LobbyRoom: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [roles, setRoles] = React.useState<Role[]>([]);
    const [lobby, setLobby] = React.useState<LobbyDetail | null>(null);
    const [socket, setSocket] = React.useState<Socket | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [cpuCountToAdd, setCpuCountToAdd] = React.useState(1);
    const [cpuLevelToAdd, setCpuLevelToAdd] = React.useState<'easy' | 'normal' | 'hard'>('normal');
    const [cpuBusy, setCpuBusy] = React.useState(false);

    const remembered = id ? getRememberedLobbyPlayer(id) : null;
    const playerId = remembered?.id ?? null;
    const playerName = remembered?.name ?? null;
    const roleLookup = React.useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);
    const selectedRoleId = React.useMemo(() => {
        if (!lobby || !playerId) return null;
        return lobby.players.find((player) => player.id === playerId)?.roleId ?? null;
    }, [lobby, playerId]);
    const localLobbyPlayer = React.useMemo(() => {
        if (!lobby || !playerId) return null;
        return lobby.players.find((player) => player.id === playerId) ?? null;
    }, [lobby, playerId]);
    const isLocalSpectator = Boolean(localLobbyPlayer?.isSpectator);

    React.useEffect(() => {
        const lobbySocket = io(SOCKET_URL ?? undefined, {
            transports: ['websocket'],
            withCredentials: true,
        });
        setSocket(lobbySocket);
        return () => {
            lobbySocket.disconnect();
        };
    }, []);

    React.useEffect(() => {
        if (!socket || !id) {
            return;
        }
        socket.emit('joinLobby', id);
        const handleLobbyStarted = (payload: { lobbyId: string; matchId: string }) => {
            if (payload.lobbyId !== id) return;
            if (!isLocalSpectator && playerId && playerName) {
                rememberMatchPlayer(payload.matchId, playerId, playerName);
            }
            clearRememberedLobbyPlayer(payload.lobbyId);
            navigate(`/match/${payload.matchId}`);
        };
        socket.on('lobbyStarted', handleLobbyStarted);
        return () => {
            socket.off('lobbyStarted', handleLobbyStarted);
            socket.emit('leaveLobby', id);
        };
    }, [socket, id, navigate, playerId, playerName, isLocalSpectator]);

    const refreshLobby = React.useCallback(async () => {
        if (!id) return;
        try {
            const detail = await fetchLobby(id);
            setLobby(detail);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    React.useEffect(() => {
        refreshLobby();
        const interval = setInterval(() => {
            refreshLobby().catch(() => undefined);
        }, 2000);
        return () => clearInterval(interval);
    }, [refreshLobby]);

    React.useEffect(() => {
        fetchRoles()
            .then((data) => setRoles(data))
            .catch((err) => setError((err as Error).message));
    }, []);

    const handleRoleSelect = React.useCallback(
        async (roleId: string) => {
            if (!id || !playerId) {
                alert('ロビー参加情報が見つかりません。');
                return;
            }
            if (isLocalSpectator) {
                return;
            }
            try {
                await setLobbyRole(id, playerId, roleId);
                refreshLobby();
            } catch (err) {
                alert(`ロール変更に失敗しました: ${(err as Error).message}`);
            }
        },
        [id, playerId, refreshLobby, isLocalSpectator]
    );

    const handleReadyToggle = React.useCallback(async () => {
        if (!id || !playerId) {
            alert('準備状態を更新できません。');
            return;
        }
        if (isLocalSpectator) {
            return;
        }
        try {
            await setLobbyReady(id, playerId, !localLobbyPlayer?.isReady);
            refreshLobby();
        } catch (err) {
            alert(`準備状態の更新に失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, isLocalSpectator, localLobbyPlayer?.isReady, refreshLobby]);

    const handleSpectatorToggle = React.useCallback(async () => {
        if (!id || !playerId) {
            alert('参加状態を更新できません。');
            return;
        }
        try {
            await setLobbySpectator(id, playerId, !isLocalSpectator);
            refreshLobby();
        } catch (err) {
            alert(`観戦モードの切り替えに失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, isLocalSpectator, refreshLobby]);

    const handleShowRolesChange = React.useCallback(
        async (nextValue: boolean) => {
            if (!id || !playerId) {
                alert('ロビー設定を更新できません。');
                return;
            }
            try {
                const updated = await updateLobbySettings(id, playerId, nextValue);
                if (updated) {
                    setLobby(updated);
                } else {
                    refreshLobby();
                }
            } catch (err) {
                alert(`ロール公開設定の更新に失敗しました: ${(err as Error).message}`);
            }
        },
        [id, playerId, refreshLobby]
    );

    const handleStart = React.useCallback(async () => {
        if (!id || !playerId) {
            alert('開始できるプレイヤー情報がありません。');
            return;
        }
        try {
            const { matchId } = await startLobby(id, playerId);
            if (playerName) {
                rememberMatchPlayer(matchId, playerId, playerName);
            }
            clearRememberedLobbyPlayer(id);
            navigate(`/match/${matchId}`);
        } catch (err) {
            alert(`ロビー開始に失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, playerName, navigate]);

    const handleLeave = React.useCallback(async () => {
        if (!id || !playerId) {
            navigate('/');
            return;
        }
        try {
            await leaveLobby(id, playerId);
        } catch (err) {
            alert(`ロビーから退出に失敗しました: ${(err as Error).message}`);
        } finally {
            clearRememberedLobbyPlayer(id);
            navigate('/');
        }
    }, [id, playerId, navigate]);

    if (!id) {
        return <div style={{ padding: 24 }}>ロビーIDが不正です。</div>;
    }

    const isOwner = Boolean(lobby && playerId && lobby.ownerId === playerId);
    const showRoles = lobby?.showRoles ?? true;
    const activePlayers = lobby?.players.filter((player) => !player.isSpectator) ?? [];
    const nonOwnerReady = activePlayers.filter((player) => player.id !== lobby?.ownerId).every((player) => player.isReady);
    const canStart = isOwner && nonOwnerReady;
    const remainingSlots = lobby ? Math.max(0, MAX_PLAYERS - lobby.players.length) : 0;

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 64px', minHeight: '100vh' }}>
            <section
                style={{
                    background: 'linear-gradient(120deg, #0f172a, #1e3a8a)',
                    borderRadius: 24,
                    padding: '32px 40px',
                    color: '#fff',
                    boxShadow: '0 15px 35px rgba(15,23,42,0.3)',
                }}
            >
                <h1 style={{ fontSize: 32, margin: 0 }}>ロビー</h1>
                <p style={{ marginTop: 12, color: '#e2e8f0' }}>参加メンバーの確認とロール選択を行います。</p>
            </section>

            {error && (
                <section style={{ marginTop: 16, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca', padding: 16 }}>
                    <strong style={{ color: '#b91c1c' }}>エラー</strong>
                    <p style={{ color: '#b91c1c', marginTop: 6 }}>{error}</p>
                </section>
            )}

            {loading && !lobby && <p style={{ marginTop: 16 }}>ロビー情報を読み込み中...</p>}
            {lobby && (
                <>
                    <section style={{ marginTop: 24, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 8px 20px rgba(15,23,42,0.05)' }}>
                        <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロビー状況</h2>
                        <div style={{ display: 'grid', gap: 6, color: '#1e293b' }}>
                            <div>ロビー名: {lobby.name}</div>
                            <div>ロビーID: {lobby.id}</div>
                            <div>デッキ: {lobby.deckId}</div>
                            <div>ロール公開: {showRoles ? '公開' : '非公開'}</div>
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={refreshLobby} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5f5', background: '#fff' }}>
                                更新
                            </button>
                            <button onClick={handleLeave} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c' }}>
                                ロビーから退出
                            </button>
                            <button
                                onClick={handleSpectatorToggle}
                                disabled={isOwner}
                                title={isOwner ? 'ホストは観戦モードに切り替えできません。' : undefined}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid #cbd5f5',
                                    background: isOwner ? '#f1f5f9' : isLocalSpectator ? '#e0f2fe' : '#fff',
                                    color: '#0f172a',
                                    cursor: isOwner ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {isLocalSpectator ? 'プレイヤーとして参加する' : '観戦モードにする'}
                            </button>
                            {isOwner && (
                                <button
                                    onClick={handleStart}
                                    disabled={!canStart}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 6,
                                        border: 'none',
                                        background: canStart ? '#0f172a' : '#94a3b8',
                                        color: '#fff',
                                        cursor: canStart ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    ロビーを開始
                                </button>
                            )}
                            {!isLocalSpectator && (
                                <button
                                    onClick={handleReadyToggle}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: 6,
                                        border: '1px solid #cbd5f5',
                                        background: localLobbyPlayer?.isReady ? '#dcfce7' : '#fff',
                                        color: '#0f172a',
                                    }}
                                >
                                    {localLobbyPlayer?.isReady ? '準備OK' : '準備OKにする'}
                                </button>
                            )}
                        </div>
                        {isOwner && (
                            <label style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
                                <input
                                    type="checkbox"
                                    checked={showRoles}
                                    onChange={(event) => handleShowRolesChange(event.target.checked)}
                                />
                                他プレイヤーのロールを公開する
                            </label>
                        )}
                        {isOwner && (
                            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', minWidth: 140 }}>
                                    CPU人数
                                    <select
                                        value={cpuCountToAdd}
                                        onChange={(e) => setCpuCountToAdd(Number(e.target.value))}
                                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        disabled={remainingSlots <= 0 || cpuBusy}
                                    >
                                        {Array.from({ length: Math.max(0, Math.min(5, remainingSlots)) }, (_, idx) => idx + 1).map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#475569', minWidth: 160 }}>
                                    CPU強さ
                                    <select
                                        value={cpuLevelToAdd}
                                        onChange={(e) => setCpuLevelToAdd(e.target.value as 'easy' | 'normal' | 'hard')}
                                        style={{ padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                        disabled={remainingSlots <= 0 || cpuBusy}
                                    >
                                        <option value="easy">EASY</option>
                                        <option value="normal">NORMAL</option>
                                        <option value="hard">HARD</option>
                                    </select>
                                </label>
                                <button
                                    onClick={async () => {
                                        if (!id || !playerId) return;
                                        if (remainingSlots <= 0) {
                                            alert(`ロビーは最大${MAX_PLAYERS}人まで参加できます。`);
                                            return;
                                        }
                                        const count = Math.max(1, Math.min(cpuCountToAdd, remainingSlots));
                                        setCpuBusy(true);
                                        try {
                                            const updated = await addLobbyCpu(id, playerId, count, cpuLevelToAdd);
                                            if (updated) {
                                                setLobby(updated);
                                            } else {
                                                refreshLobby();
                                            }
                                        } catch (err) {
                                            alert(`CPU追加に失敗しました: ${(err as Error).message}`);
                                        } finally {
                                            setCpuBusy(false);
                                        }
                                    }}
                                    disabled={cpuBusy || remainingSlots <= 0}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: cpuBusy || remainingSlots <= 0 ? '#94a3b8' : '#1d4ed8',
                                        color: '#fff',
                                        cursor: cpuBusy || remainingSlots <= 0 ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    CPUを追加
                                </button>
                                <span style={{ fontSize: 12, color: '#64748b' }}>残り枠: {remainingSlots}</span>
                            </div>
                        )}
                        <p style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                            同じロールが重複した場合、ゲーム開始時に片方がランダムで変更されます。
                            {!showRoles && ' 現在は自分のロールのみ表示されます。'}
                            {!nonOwnerReady && isOwner && ' 準備OKが揃うと開始できます。'}
                        </p>
                    </section>

                    <section style={{ marginTop: 24, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 8px 20px rgba(15,23,42,0.05)' }}>
                        <h2 style={{ fontSize: 20, marginBottom: 8 }}>参加プレイヤー</h2>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                            {lobby.players.map((player) => {
                                const isSelf = player.id === playerId;
                                const roleLabel = showRoles || isSelf
                                    ? player.roleId
                                        ? roleLookup.get(player.roleId) ?? player.roleId
                                        : '未選択'
                                    : '非公開';
                                const readyLabel = player.isSpectator
                                    ? '観戦'
                                    : player.isReady
                                    ? '準備OK'
                                    : '未準備';
                                return (
                                    <li key={player.id} style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontWeight: 700 }}>
                                            {player.name}
                                            {isSelf ? '（あなた）' : ''}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            ロール: {roleLabel}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b' }}>
                                            状態: {readyLabel}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    <section style={{ marginTop: 24, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 8px 20px rgba(15,23,42,0.05)' }}>
                        <h2 style={{ fontSize: 20, marginBottom: 8 }}>ロール選択</h2>
                        {playerId && !isLocalSpectator ? (
                            <RoleSelect roles={roles} selectedId={selectedRoleId} onSelect={handleRoleSelect} />
                        ) : (
                            <p style={{ color: '#64748b' }}>
                                {isLocalSpectator ? '観戦モードではロール選択できません。' : 'ロビー参加情報が見つかりません。'}
                            </p>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default LobbyRoom;
