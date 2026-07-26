import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ActionPayload } from '@shared/protocol';
import type { LobbyDetail, Role, TeamColor } from '@shared/types';
import {
    clearRememberedLobbyPlayer,
    clearRememberedLobbySpectator,
    clearRememberedMatchPlayer,
    getRememberedLobbyPlayer,
    rememberLobbyPlayer,
    rememberLobbySpectator,
    rememberMatchPlayer,
    rememberMatchSpectator,
} from '@client/utils/matchPlayer';
import RoleSelect from '@client/components/RoleSelect';
import DeckSelectModal from '@client/components/DeckSelectModal';
import { API_BASE, wsBase } from '@client/config/env';
import { getRolesCatalogLocal, listDeckSummariesLocal } from '@client/catalog/localCatalog';

const MAX_PLAYERS = 6;
const TEAM_OPTIONS: Array<{ id: TeamColor; label: string; bg: string; border: string; text: string }> = [
    { id: 'red', label: '赤', bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
    { id: 'blue', label: '青', bg: '#dbeafe', border: '#bfdbfe', text: '#1d4ed8' },
    { id: 'green', label: '緑', bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
    { id: 'yellow', label: '黄', bg: '#fef9c3', border: '#fde68a', text: '#92400e' },
];

type StoredPlayerInfo = ReturnType<typeof getRememberedLobbyPlayer>;
type PendingLobbyJoin = { name: string; password?: string; roleId?: string };

const LobbyRoom: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [roles, setRoles] = React.useState<Role[]>([]);
    const [lobby, setLobby] = React.useState<LobbyDetail | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const [joinName, setJoinName] = React.useState('');
    const [joinPassword, setJoinPassword] = React.useState('');
    const [joinBusy, setJoinBusy] = React.useState(false);
    const [spectatorBusy, setSpectatorBusy] = React.useState(false);
    const [leaveBusy, setLeaveBusy] = React.useState(false);
    const [cpuBusy, setCpuBusy] = React.useState(false);
    const [disbandBusy, setDisbandBusy] = React.useState(false);
    const [cpuCount, setCpuCount] = React.useState(1);
    const [cpuLevel, setCpuLevel] = React.useState<'easy' | 'normal' | 'hard'>('normal');
    const [deckModalOpen, setDeckModalOpen] = React.useState(false);
    const [wsConnected, setWsConnected] = React.useState(false);
    const wsRef = React.useRef<WebSocket | null>(null);
    const playerNameRef = React.useRef<string | null>(null);
    const playerIdRef = React.useRef<string | null>(null);
    const isSpectatorRef = React.useRef<boolean>(false);
    const pendingJoinNameRef = React.useRef<string | null>(null);

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

    const [localPlayerInfo, setLocalPlayerInfo] = React.useState<StoredPlayerInfo>(() => {
        if (typeof window === 'undefined' || !id) return null;
        return getRememberedLobbyPlayer(id);
    });
    React.useEffect(() => {
        if (typeof window === 'undefined' || !id) {
            setLocalPlayerInfo(null);
            return;
        }
        setLocalPlayerInfo(getRememberedLobbyPlayer(id));
    }, [id]);
    const playerId = localPlayerInfo?.id ?? null;
    const playerName = localPlayerInfo?.name ?? null;
    const decks = React.useMemo(() => listDeckSummariesLocal(), []);

    React.useEffect(() => {
        playerNameRef.current = playerName;
    }, [playerName]);

    React.useEffect(() => {
        playerIdRef.current = playerId;
    }, [playerId]);

    const [pendingJoin, setPendingJoin] = React.useState<PendingLobbyJoin | null>(() => {
        if (typeof window === 'undefined' || !id) return null;
        try {
            const raw = sessionStorage.getItem(`pendingLobbyJoin:${id}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<PendingLobbyJoin> | null;
            const name = String(parsed?.name ?? '').trim();
            if (!name) return null;
            const password = parsed?.password ? String(parsed.password) : undefined;
            const roleId = parsed?.roleId ? String(parsed.roleId) : undefined;
            return { name, password, roleId };
        } catch {
            return null;
        }
    });
    React.useEffect(() => {
        if (typeof window === 'undefined' || !id) {
            setPendingJoin(null);
            return;
        }
        try {
            const raw = sessionStorage.getItem(`pendingLobbyJoin:${id}`);
            if (!raw) {
                setPendingJoin(null);
                return;
            }
            const parsed = JSON.parse(raw) as Partial<PendingLobbyJoin> | null;
            const name = String(parsed?.name ?? '').trim();
            if (!name) {
                setPendingJoin(null);
                return;
            }
            const password = parsed?.password ? String(parsed.password) : undefined;
            const roleId = parsed?.roleId ? String(parsed.roleId) : undefined;
            setPendingJoin({ name, password, roleId });
        } catch {
            setPendingJoin(null);
        }
    }, [id]);

    const roleLookup = React.useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);

    const localLobbyPlayer = React.useMemo(() => {
        if (!lobby || !playerId) return null;
        return lobby.players.find((p) => p.id === playerId) ?? null;
    }, [lobby, playerId]);

    const isOwner = Boolean(lobby && playerId && lobby.ownerId === playerId);
    const isSpectator = Boolean(localLobbyPlayer?.isSpectator);
    const teamMode = Boolean(lobby?.teamMode);
    const activePlayers = React.useMemo(() => (lobby ? lobby.players.filter((p) => !p.isSpectator) : []), [lobby]);
    const teamStartOk = React.useMemo(() => {
        if (!teamMode) return true;
        if (!activePlayers.length) return false;
        const teams = activePlayers.map((p) => p.team).filter(Boolean) as TeamColor[];
        if (teams.length !== activePlayers.length) return false;
        return new Set(teams).size >= 2;
    }, [activePlayers, teamMode]);
    const allNonOwnerReady = Boolean(
        lobby &&
            lobby.players.some((p) => p.id !== lobby.ownerId) &&
            lobby.players.filter((p) => p.id !== lobby.ownerId).every((p) => Boolean(p.isReady))
    );
    const remainingSlots = Math.max(0, MAX_PLAYERS - (lobby?.players.length ?? 0));
    const selectedDeckLabel = React.useMemo(() => {
        if (!lobby) return null;
        const found = decks.find((deck) => deck.id === lobby.deckId);
        return found ? `${found.name}（${found.total}枚）` : lobby.deckId;
    }, [decks, lobby]);

    const handleDeckSelect = React.useCallback((deckId: string) => {
        if (!playerId) {
            alert('デッキを変更するにはロビーに参加してください。');
            return;
        }
        if (lobby?.deckId && deckId === lobby.deckId) {
            setDeckModalOpen(false);
            return;
        }
        const ok = sendWsAction({ k: 'lobby/deck', playerId, deckId });
        if (!ok) {
            alert('WebSocket未接続のため、デッキを変更できませんでした。');
            return;
        }
        setDeckModalOpen(false);
    }, [playerId, lobby?.deckId, sendWsAction]);

    React.useEffect(() => {
        isSpectatorRef.current = isSpectator;
        if (id) {
            rememberLobbySpectator(id, Boolean(isSpectator));
        }
    }, [id, isSpectator]);

    React.useEffect(() => {
        if (!id) return;
        if (typeof window === 'undefined') return;

        const url = `${wsBase(API_BASE)}/lobbies/${encodeURIComponent(id)}/ws`;
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

            const sendJoin = () => {
                const name = (playerNameRef.current ?? 'Player').trim() || 'Player';
                try {
                    ws.send(JSON.stringify({ t: 'join', name }));
                } catch {
                    // noop
                }
            };

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
                sendJoin();
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
                let parsed: any = null;
                try {
                    parsed = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                if (parsed?.t === 'pong') {
                    lastPongAt = Date.now();
                    return;
                }
                if (parsed?.t === 'lobby') {
                    const nextLobby = (parsed.lobby as LobbyDetail) ?? null;
                    setLobby(nextLobby);
                    setError(null);
                    setLoading(false);

                    // WS の瞬断などで lobbyJoined が取りこぼされると、参加はできているのに playerId を保存できず
                    // マッチ開始後に「観戦（操作不可）」扱いになってしまう。
                    // lobby 状態に自分の名前が居るなら、その playerId を確定させる（ベストエフォート）。
                    if (id && nextLobby && !playerId) {
                        const desiredName =
                            (pendingJoin?.name ?? joinName ?? pendingJoinNameRef.current ?? playerNameRef.current ?? '').trim();
                        if (desiredName) {
                            const matched = nextLobby.players.find((p) => p.name === desiredName) ?? null;
                            if (matched) {
                                rememberLobbyPlayer(id, matched.id, desiredName);
                                setLocalPlayerInfo({ id: matched.id, name: desiredName });
                                sessionStorage.removeItem(`pendingLobbyJoin:${id}`);
                                setPendingJoin(null);
                                setJoinPassword('');
                                setJoinBusy(false);
                            }
                        }
                    }
                    return;
                }
                if (parsed?.t === 'lobbyJoined') {
                    const joinedPlayerId = String(parsed.playerId ?? '');
                    if (!joinedPlayerId) {
                        setJoinBusy(false);
                        setLoading(false);
                        return;
                    }
                    const name = (pendingJoinNameRef.current ?? playerName ?? 'Player').trim() || 'Player';
                    rememberLobbyPlayer(id, joinedPlayerId, name);
                    setLocalPlayerInfo({ id: joinedPlayerId, name });
                    sessionStorage.removeItem(`pendingLobbyJoin:${id}`);
                    setPendingJoin(null);
                    setJoinPassword('');
                    setJoinBusy(false);
                    setDisbandBusy(false);
                    setLoading(false);
                    return;
                }
                if (parsed?.t === 'lobbyDisbanded') {
                    closedByClient = true;
                    cleanup();
                    closeCurrent();
                    setWsConnected(false);
                    setDisbandBusy(false);
                    clearRememberedLobbyPlayer(id);
                    clearRememberedLobbySpectator(id);
                    sessionStorage.removeItem(`pendingLobbyJoin:${id}`);
                    setPendingJoin(null);
                    setLobby(null);
                    setLoading(false);
                    alert('ロビーが解散されました。');
                    navigate(`/`);
                    return;
                }
                if (parsed?.t === 'state') {
                    const status = String(parsed?.state?.status ?? '');
                    if (status && status !== 'waiting') {
                        const pid = playerIdRef.current;
                        const pname = playerNameRef.current;
                        const spectator = Boolean(isSpectatorRef.current);
                        rememberMatchSpectator(id, spectator);
                        if (spectator) {
                            clearRememberedMatchPlayer(id);
                        } else if (pid && pname) {
                            rememberMatchPlayer(id, pid, pname);
                        }
                        navigate(`/match/${id}`);
                    }
                    setLoading(false);
                    return;
                }
                if (parsed?.t === 'error') {
                    setError(String(parsed.message ?? 'サーバーエラー'));
                    setJoinBusy(false);
                    setLoading(false);
                }
            });

            ws.addEventListener('close', () => scheduleReconnect());
            ws.addEventListener('error', () => scheduleReconnect());
        };

        // React StrictMode (dev) で Effect が二重実行されると、接続直後に close され
        // 「WebSocket is closed before the connection is established」が出やすい。
        startTimer = window.setTimeout(() => connect(), 0);

        return () => {
            closedByClient = true;
            if (startTimer) window.clearTimeout(startTimer);
            cleanup();
            closeCurrent();
        };
    }, [id, navigate]);

    React.useEffect(() => {
        try {
            setRoles(getRolesCatalogLocal());
        } catch (err) {
            setError((err as Error).message);
        }
    }, []);

    React.useEffect(() => {
        if (!id) return;
        if (!wsConnected) return;
        if (playerId) return;
        if (!pendingJoin) return;
        if (joinBusy) return;

        const attempt = async () => {
            setJoinBusy(true);
            pendingJoinNameRef.current = pendingJoin.name;
            setJoinName(pendingJoin.name);
            setJoinPassword(pendingJoin.password ?? '');

            try {
                const ok = sendWsAction({ k: 'lobby/join', name: pendingJoin.name, password: pendingJoin.password, roleId: pendingJoin.roleId });
                if (!ok) {
                    throw new Error('WebSocket未接続のため、ロビーに参加できません。');
                }
            } catch (err) {
                alert(`参加に失敗しました: ${(err as Error).message}`);
                setJoinBusy(false);
            } finally {
                // lobbyJoined で解除する（WSのみ）
            }
        };

        void attempt();
    }, [id, wsConnected, playerId, pendingJoin, joinBusy, sendWsAction]);

    const handleJoin = React.useCallback(async () => {
        if (!id) return;
        if (!joinName.trim()) {
            alert('名前を入力してください。');
            return;
        }
        setJoinBusy(true);
        try {
            const name = joinName.trim();
            pendingJoinNameRef.current = name;
            const ok = sendWsAction({ k: 'lobby/join', name, password: joinPassword || undefined });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ロビーに参加できません。');
            }
            // lobbyJoined で playerId が確定する（WSのみ）
        } catch (err) {
            alert(`参加に失敗しました: ${(err as Error).message}`);
        } finally {
            setJoinBusy(false);
        }
    }, [id, joinName, joinPassword, sendWsAction]);

    const handleLeave = React.useCallback(async () => {
        if (!id) return;
        if (leaveBusy) return;
        setLeaveBusy(true);
        try {
            if (playerId) {
                const ok = sendWsAction({ k: 'lobby/leave', playerId });
                if (!ok) {
                    alert('WebSocket未接続のため、サーバー側の退出処理ができませんでした（ローカルは退出します）。');
                }
            }
        } catch (err) {
            alert(`退出に失敗しました: ${(err as Error).message}`);
        } finally {
            clearRememberedLobbyPlayer(id);
            setLocalPlayerInfo(null);
            sessionStorage.removeItem(`pendingLobbyJoin:${id}`);
            setPendingJoin(null);
            navigate('/');
            setLeaveBusy(false);
        }
    }, [id, playerId, leaveBusy, navigate, sendWsAction]);

    const handleSpectatorToggle = React.useCallback(async () => {
        if (!id || !playerId) {
            alert('観戦設定を変更できません。');
            return;
        }
        if (isOwner) {
            alert('ホストは観戦に切り替えられません。');
            return;
        }
        if (spectatorBusy) return;
        setSpectatorBusy(true);
        try {
            const ok = sendWsAction({ k: 'lobby/spectator', playerId, isSpectator: !isSpectator });
            if (!ok) {
                throw new Error('WebSocket未接続のため、観戦設定を変更できません。');
            }
        } catch (err) {
            alert(`観戦設定の変更に失敗しました: ${(err as Error).message}`);
        } finally {
            setSpectatorBusy(false);
        }
    }, [id, playerId, isOwner, isSpectator, spectatorBusy, sendWsAction]);

    const handleRoleSelect = React.useCallback(
        async (roleId: string) => {
            if (!id || !playerId) {
                alert('操作するプレイヤーがありません。');
                return;
            }
            try {
                const ok = sendWsAction({ k: 'lobby/role', playerId, roleId });
                if (!ok) {
                    throw new Error('WebSocket未接続のため、ロールを変更できません。');
                }
            } catch (err) {
                alert(`ロール変更に失敗しました: ${(err as Error).message}`);
            }
        },
        [id, playerId, sendWsAction]
    );

    const handleReadyToggle = React.useCallback(async () => {
        if (!id || !playerId) {
            alert('準備状態を変更できません。');
            return;
        }
        try {
            const nextReady = !localLobbyPlayer?.isReady;
            const ok = sendWsAction({ k: 'lobby/ready', playerId, isReady: Boolean(nextReady) });
            if (!ok) {
                throw new Error('WebSocket未接続のため、準備状態を変更できません。');
            }
        } catch (err) {
            alert(`準備状態の変更に失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, localLobbyPlayer?.isReady, sendWsAction]);

    const handleAddCpu = React.useCallback(async () => {
        if (!id || !playerId || !isOwner) return;
        if (cpuBusy) return;
        const maxAdd = Math.max(0, remainingSlots);
        if (maxAdd <= 0) {
            alert('空き枠がありません。');
            return;
        }
        const addCount = Math.min(Math.max(1, Math.floor(cpuCount)), maxAdd);
        setCpuBusy(true);
        try {
            const ok = sendWsAction({ k: 'lobby/cpu', playerId, cpuCount: addCount, cpuLevel });
            if (!ok) {
                throw new Error('WebSocket未接続のため、CPUを追加できません。');
            }
        } catch (err) {
            alert(`CPU追加に失敗しました: ${(err as Error).message}`);
        } finally {
            setCpuBusy(false);
        }
    }, [id, playerId, isOwner, cpuBusy, remainingSlots, cpuCount, cpuLevel, sendWsAction]);

    const handleToggleShowRoles = React.useCallback(async () => {
        if (!id || !playerId || !lobby) return;
        try {
            const next = !lobby.showRoles;
            const ok = sendWsAction({ k: 'lobby/settings', playerId, showRoles: next });
            if (!ok) {
                throw new Error('WebSocket未接続のため、設定を変更できません。');
            }
        } catch (err) {
            alert(`設定変更に失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, lobby, sendWsAction]);

    const handleToggleTeamMode = React.useCallback(async () => {
        if (!id || !playerId || !lobby) return;
        if (!isOwner) return;
        try {
            const next = !lobby.teamMode;
            const ok = sendWsAction({ k: 'lobby/settings', playerId, teamMode: next });
            if (!ok) {
                throw new Error('WebSocket未接続のため、チーム戦設定を変更できませんでした。');
            }
        } catch (err) {
            alert(`チーム戦設定の変更に失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, lobby, isOwner, sendWsAction]);

    const handleSetTeam = React.useCallback(
        async (targetPlayerId: string, team: TeamColor) => {
            if (!id || !playerId) return;
            try {
                const ok = sendWsAction({ k: 'lobby/team', playerId, targetPlayerId, team });
                if (!ok) {
                    throw new Error('WebSocket未接続のため、チームを変更できませんでした。');
                }
            } catch (err) {
                alert(`チーム変更に失敗しました: ${(err as Error).message}`);
            }
        },
        [id, playerId, sendWsAction]
    );

    const handleStart = React.useCallback(async () => {
        if (!id || !playerId) return;
        try {
            const ok = sendWsAction({ k: 'lobby/start', playerId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ゲームを開始できません。');
            }
            // state が waiting 以外になったタイミングで /match/:id へ遷移する
        } catch (err) {
            alert(`ゲーム開始に失敗しました: ${(err as Error).message}`);
        }
    }, [id, playerId, sendWsAction]);

    const handleDisband = React.useCallback(() => {
        if (!id) return;
        if (!playerId) {
            alert('操作するプレイヤーが設定されていません。');
            return;
        }
        if (!isOwner) {
            alert('ホストのみ操作できます。');
            return;
        }
        const ok = window.confirm('ロビーを解散します。\n参加者はホームに戻ります。\nよろしいですか？');
        if (!ok) return;
        setDisbandBusy(true);
        try {
            const sent = sendWsAction({ k: 'lobby/disband', playerId });
            if (!sent) throw new Error('WebSocket未接続のため、ロビーを解散できません。');
        } catch (err) {
            alert(`ロビー解散に失敗しました: ${(err as Error).message}`);
            setDisbandBusy(false);
        }
    }, [id, isOwner, playerId, sendWsAction]);

    if (!id) {
        return <div style={{ padding: 16 }}>ロビーIDが不正です。</div>;
    }

    return (
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 24 }}>ロビー: {id}</h1>
                <button
                    onClick={handleLeave}
                    disabled={leaveBusy}
                    style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5f5', background: '#fff' }}
                >
                    {leaveBusy ? '退出中...' : 'ホームへ戻る'}
                </button>
            </div>

            {error && <p style={{ color: '#b91c1c' }}>エラー: {error}</p>}
            {loading && <p>読み込み中...</p>}

            {!playerId && (
                <section style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                    <h2 style={{ marginTop: 0 }}>ロビーに参加</h2>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                            value={joinName}
                            onChange={(e) => setJoinName(e.target.value)}
                            placeholder="名前"
                            style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <input
                            value={joinPassword}
                            onChange={(e) => setJoinPassword(e.target.value)}
                            placeholder="パスワード（必要なら）"
                            style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <button
                            onClick={handleJoin}
                            disabled={joinBusy}
                            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: joinBusy ? '#94a3b8' : '#16a34a', color: '#fff' }}
                        >
                            {joinBusy ? '参加中...' : '参加'}
                        </button>
                    </div>
                    <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                        このページを直接開いた場合は、ここで参加すると操作プレイヤーが保存されます（タブ単位）。
                    </p>
                </section>
            )}

            {lobby && (
                <>
                    <section style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                        <h2 style={{ marginTop: 0 }}>ロビー情報</h2>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: '#475569' }}>
                            <div>名前: {lobby.name}</div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span>デッキ: {selectedDeckLabel ?? lobby.deckId}</span>
                                <button
                                    onClick={() => setDeckModalOpen(true)}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: 10,
                                        border: '1px solid #cbd5f5',
                                        background: '#fff',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {isOwner ? '変更' : 'プレビュー'}
                                </button>
                            </div>
                            <div>人数: {lobby.players.length} / {MAX_PLAYERS}</div>
                            <div>残り枠: {remainingSlots}</div>
                        </div>

                        <DeckSelectModal
                            open={deckModalOpen}
                            decks={decks}
                            selectedDeckId={lobby.deckId}
                            onClose={() => setDeckModalOpen(false)}
                            onSelect={handleDeckSelect}
                            canSelect={isOwner}
                            selectLabel="このデッキに変更"
                        />

                        {isOwner && (
                            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                    onClick={handleToggleShowRoles}
                                    style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5f5', background: '#fff' }}
                                >
                                    ロール公開: {lobby.showRoles ? 'ON' : 'OFF'}
                                </button>
                                <button
                                    onClick={handleToggleTeamMode}
                                    style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5f5', background: '#fff' }}
                                >
                                    チーム戦: {lobby.teamMode ? 'ON' : 'OFF'}
                                </button>
                                <button
                                    onClick={handleStart}
                                    disabled={!allNonOwnerReady || !teamStartOk}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 10,
                                        border: 'none',
                                        background: allNonOwnerReady && teamStartOk ? '#1d4ed8' : '#94a3b8',
                                        color: '#fff',
                                    }}
                                >
                                    ゲーム開始
                                </button>
                                <button
                                    onClick={handleDisband}
                                    disabled={disbandBusy}
                                    style={{
                                        padding: '8px 12px',
                                        borderRadius: 10,
                                        border: '1px solid #fecaca',
                                        background: '#fff',
                                        color: '#b91c1c',
                                    }}
                                >
                                    {disbandBusy ? '解散中…' : 'ロビー解散'}
                                </button>
                                {!allNonOwnerReady && (
                                    <span style={{ fontSize: 12, color: '#64748b' }}>ホスト以外が全員準備OKになると開始できます。</span>
                                )}
                                {allNonOwnerReady && lobby.teamMode && !teamStartOk && (
                                    <span style={{ fontSize: 12, color: '#b45309' }}>
                                        チーム戦では、全員がチームを選択し、全員同じチームにならないようにしてください。
                                    </span>
                                )}
                            </div>
                        )}

                        {isOwner && remainingSlots > 0 && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                                <h3 style={{ margin: 0, fontSize: 14 }}>CPU追加（ロビー作成後）</h3>
                                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <label style={{ fontSize: 12, color: '#475569' }}>
                                        人数
                                        <select
                                            value={cpuCount}
                                            onChange={(e) => setCpuCount(Number(e.target.value))}
                                            style={{ marginLeft: 6, padding: 6, borderRadius: 8, border: '1px solid #cbd5f5' }}
                                        >
                                            {Array.from({ length: remainingSlots }, (_, i) => i + 1).map((n) => (
                                                <option key={n} value={n}>
                                                    {n}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label style={{ fontSize: 12, color: '#475569' }}>
                                        強さ
                                        <select
                                            value={cpuLevel}
                                            onChange={(e) => setCpuLevel(e.target.value as typeof cpuLevel)}
                                            style={{ marginLeft: 6, padding: 6, borderRadius: 8, border: '1px solid #cbd5f5' }}
                                        >
                                            <option value="easy">EASY</option>
                                            <option value="normal">NORMAL</option>
                                            <option value="hard">HARD</option>
                                        </select>
                                    </label>
                                    <button
                                        onClick={handleAddCpu}
                                        disabled={cpuBusy}
                                        style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: cpuBusy ? '#94a3b8' : '#111827', color: '#fff' }}
                                    >
                                        {cpuBusy ? '追加中...' : 'CPUを追加'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    <section style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                        <h2 style={{ marginTop: 0 }}>参加者</h2>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                            {lobby.players.map((p) => {
                                const isSelf = p.id === playerId;
                                const canSeeRole = lobby.showRoles || isSelf;
                                const roleLabel = canSeeRole ? (p.roleId ? roleLookup.get(p.roleId) ?? p.roleId : '未選択') : '非公開';
                                const badges: string[] = [];
                                const teamDef = TEAM_OPTIONS.find((t) => t.id === p.team) ?? null;
                                const canChangeTeam = Boolean(lobby.teamMode && playerId && (isSelf || (isOwner && p.isCpu)));
                                if (p.id === lobby.ownerId) badges.push('ホスト');
                                if (p.isCpu) badges.push(`CPU${p.cpuLevel ? `(${p.cpuLevel.toUpperCase()})` : ''}`);
                                if (p.isSpectator) badges.push('観戦');
                                return (
                                    <li key={p.id} style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                            <div style={{ fontWeight: 700 }}>
                                                {p.name}{isSelf ? '（あなた）' : ''}
                                            </div>
                                            <div style={{ fontSize: 12, color: p.isReady ? '#16a34a' : '#64748b' }}>
                                                {p.isReady ? '準備OK' : '未準備'}
                                            </div>
                                        </div>
                                        {badges.length > 0 && (
                                            <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                {badges.map((b) => (
                                                    <span
                                                        key={`${p.id}-${b}`}
                                                        style={{
                                                            fontSize: 11,
                                                            padding: '2px 8px',
                                                            borderRadius: 999,
                                                            background: '#e2e8f0',
                                                            color: '#0f172a',
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {b}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ fontSize: 12, color: '#64748b' }}>ロール: {roleLabel}</div>
                                        {lobby.teamMode && (
                                            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding: '2px 8px',
                                                        borderRadius: 999,
                                                        background: teamDef?.bg ?? '#e2e8f0',
                                                        border: `1px solid ${teamDef?.border ?? '#cbd5f5'}`,
                                                        color: teamDef?.text ?? '#0f172a',
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    {teamDef ? `${teamDef.label}チーム` : 'チーム未選択'}
                                                </span>
                                                {TEAM_OPTIONS.map((opt) => {
                                                    const selected = opt.id === p.team;
                                                    return (
                                                        <button
                                                            key={`${p.id}-${opt.id}`}
                                                            type="button"
                                                            onClick={() => handleSetTeam(p.id, opt.id)}
                                                            disabled={!canChangeTeam}
                                                            style={{
                                                                padding: '4px 8px',
                                                                borderRadius: 999,
                                                                border: `1px solid ${selected ? opt.border : '#cbd5f5'}`,
                                                                background: selected ? opt.bg : '#fff',
                                                                color: selected ? opt.text : '#0f172a',
                                                                fontSize: 11,
                                                                fontWeight: 800,
                                                                cursor: canChangeTeam ? 'pointer' : 'not-allowed',
                                                            }}
                                                            title={canChangeTeam ? `チームを${opt.label}にする` : '自分（またはCPU/ホスト）のみ変更できます'}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>

                    <section style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                        <h2 style={{ marginTop: 0 }}>自分の設定</h2>
                        {!playerId ? (
                            <p style={{ color: '#64748b' }}>参加すると設定できます。</p>
                        ) : (
                            <>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <button
                                        onClick={handleReadyToggle}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: 10,
                                            border: 'none',
                                            background: localLobbyPlayer?.isReady ? '#f59e0b' : '#16a34a',
                                            color: '#fff',
                                        }}
                                    >
                                        {localLobbyPlayer?.isReady ? '準備を解除' : '準備OK'}
                                    </button>
                                    <button
                                        onClick={handleSpectatorToggle}
                                        disabled={isOwner || spectatorBusy}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: 10,
                                            border: '1px solid #cbd5f5',
                                            background: isSpectator ? '#0f172a' : '#fff',
                                            color: isSpectator ? '#fff' : '#0f172a',
                                        }}
                                    >
                                        {spectatorBusy ? '切替中...' : isSpectator ? '観戦を解除' : '観戦する'}
                                    </button>
                                    <span style={{ fontSize: 12, color: '#64748b' }}>ロールを選んでから準備OK推奨</span>
                                </div>
                                {isOwner && (
                                    <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                        ホストは観戦に切り替えできません。
                                    </p>
                                )}
                                {isSpectator && (
                                    <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                                        観戦中はロール選択ができません（ゲーム開始時に参加プレイヤーから除外されます）。
                                    </p>
                                )}
                                <div style={{ marginTop: 12 }}>
                                    <RoleSelect
                                        roles={roles}
                                        selectedId={localLobbyPlayer?.roleId ?? null}
                                        onSelect={handleRoleSelect}
                                        disabled={isSpectator}
                                    />
                                </div>
                            </>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default LobbyRoom;
