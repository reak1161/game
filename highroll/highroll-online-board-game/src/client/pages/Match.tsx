import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ActionPayload } from '@shared/protocol';
import type {
    CardDefinition,
    CardEffect,
    CardTarget,
    GameLogEntry,
    GameState,
    Player,
    RoleActionDefinition,
    TeamColor,
} from '@shared/types';
import {
    clearRememberedMatchPlayer,
    getRememberedMatchPlayer,
    getRememberedMatchSpectator,
    rememberMatchPlayer,
} from '@client/utils/matchPlayer';
import { rememberLobbyPlayer, rememberLobbySpectator } from '@client/utils/matchPlayer';
import { getRoleActionsForRoleIds, ROLE_ACTION_BASE_STATS } from '@shared/roleActions';
import { API_BASE, wsBase } from '@client/config/env';
import styles from './Match.module.css';
import matchGameBgUrl from '../assets/match/match-game-bg.png';
import MatchHandSection from './MatchHandSection';
import MatchFloatingOverlays from './MatchFloatingOverlays';
import MatchHeroActionPanel from './MatchHeroActionPanel';
import MatchHelpModal from './MatchHelpModal';
import MatchPlayersSection from './MatchPlayersSection';
import { MatchDamagePopup, MatchResultModal } from './MatchOverlayPanels';
import { MatchPendingInfoDrawModal, MatchPendingPromptModal } from './MatchPendingModals';
import MatchPlayerCard from './MatchPlayerCard';
import MatchSelectionModal from './MatchSelectionModal';
import MatchTurnLogPanel from './MatchTurnLogPanel';
import {
    ALL_CARDS,
    CARD_LOOKUP,
    HAND_CARD_BG_BY_CATEGORY,
    MATCH_DESIGN_HEIGHT,
    MATCH_DESIGN_WIDTH,
    ROLE_LOOKUP,
    STAT_OPTIONS,
    TEAM_OPTIONS,
    getCategoryLabel,
    getCurseDescription,
    getCurseLabel,
    getKindLabel,
    statusColors,
} from './matchStatic';
import {
    type ActionToastLog,
    type CardEffectAdjustment,
    type DamageResolvedLog,
    type TargetRule,
    STAT_LABELS,
    buildCardEffectAdjustments,
    buildTurnLogDisplay,
    cardNeedsStatChoice,
    flattenCardEffects,
    getCardTargetRule,
    getTargetRuleFromEffects,
    groupInstallsByPlayer,
    isActionToastLog,
    isDamageResolvedLog,
    isRoleActionLog,
} from './matchHelpers';

type PlayChoicesPayload = Record<string, string | number | boolean | string[] | number[] | Record<string, unknown>>;

type TargetSelectionContext =
    | { kind: 'generic' }
    | { kind: 'card'; cardId?: string }
    | { kind: 'roleAttack' }
    | { kind: 'roleAction'; actionId: string };

type DeckCategoryFilter = 'all' | 'attack' | 'defense' | 'spell' | 'equip';
type DeckZoneFilter = 'all' | 'deck' | 'hand' | 'discard' | 'install' | 'remaining' | 'empty';
type DeckSortKey = 'name' | 'remaining' | 'total' | 'cost' | 'category';
type DeckSortDir = 'asc' | 'desc';

type StoredPlayerInfo = ReturnType<typeof getRememberedMatchPlayer>;
const Match: React.FC = () => {
    const DAMAGE_POPUP_DURATION_MS = 1800;
    const ACTION_TOAST_DURATION_MS = 1200;

    const { id } = useParams();
    const navigate = useNavigate();
    const [state, setState] = React.useState<GameState | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [wsConnected, setWsConnected] = React.useState(false);
    const [reconnectNonce, setReconnectNonce] = React.useState(0);
    const [localPlayerInfo, setLocalPlayerInfo] = React.useState<StoredPlayerInfo>(() => {
        if (typeof window === 'undefined' || !id) return null;
        return getRememberedMatchPlayer(id);
    });
    const [isSpectator, setIsSpectator] = React.useState<boolean>(() => {
        if (typeof window === 'undefined' || !id) return false;
        return getRememberedMatchSpectator(id);
    });
    const [tooltip, setTooltip] = React.useState<
        { title: string; text: string; x: number; y: number; adjustments?: CardEffectAdjustment[] } | null
    >(null);
    const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
    const [selectedStatChoice, setSelectedStatChoice] = React.useState<'atk' | 'def' | 'spe' | 'bra' | ''>('');
    const [roleActionChoices, setRoleActionChoices] = React.useState<Record<string, Record<string, string>>>({});
    const [roleActionBusy, setRoleActionBusy] = React.useState(false);
    const [promptBusy, setPromptBusy] = React.useState(false);
    const [infoDrawBusy, setInfoDrawBusy] = React.useState(false);
    const [helpOpen, setHelpOpen] = React.useState<'deck' | 'rules' | 'roles' | null>(null);
    const [deckSearchText, setDeckSearchText] = React.useState('');
    const [deckCategoryFilter, setDeckCategoryFilter] = React.useState<DeckCategoryFilter>('all');
    const [deckZoneFilter, setDeckZoneFilter] = React.useState<DeckZoneFilter>('all');
    const [deckInspectMode, setDeckInspectMode] = React.useState<'remaining' | 'all'>('remaining');
    const [deckSortKey, setDeckSortKey] = React.useState<DeckSortKey>('name');
    const [deckSortDir, setDeckSortDir] = React.useState<DeckSortDir>('asc');
    const [jesterSpin, setJesterSpin] = React.useState<{ label: string; result?: string } | null>(null);
    const [lastJesterLogKey, setLastJesterLogKey] = React.useState<string | null>(null);
    const [damagePopup, setDamagePopup] = React.useState<DamageResolvedLog | null>(null);
    const [damagePopupQueue, setDamagePopupQueue] = React.useState<DamageResolvedLog[]>([]);
    const [actionToast, setActionToast] = React.useState<ActionToastLog | null>(null);
    const [actionToastQueue, setActionToastQueue] = React.useState<ActionToastLog[]>([]);
    const [matchResultOpen, setMatchResultOpen] = React.useState(false);
    const [roleActionPage, setRoleActionPage] = React.useState(0);
    const [viewportSize, setViewportSize] = React.useState<{ width: number; height: number }>(() => ({
        width: typeof window === 'undefined' ? MATCH_DESIGN_WIDTH : window.innerWidth,
        height: typeof window === 'undefined' ? MATCH_DESIGN_HEIGHT : window.innerHeight,
    }));
    const matchResultShownRef = React.useRef<string | null>(null);
    const [selectionModal, setSelectionModal] = React.useState<
        | {
              type: 'target';
              title: string;
              rule: TargetRule;
              context?: TargetSelectionContext;
              note?: string;
              forcedTargetId?: string;
          }
        | { type: 'stat'; title: string; options?: Array<'atk' | 'def' | 'spe' | 'bra'> }
        | { type: 'chooseOne'; title: string; options: Array<{ value: string; label: string }> }
        | null
    >(null);
    const selectionResolveRef = React.useRef<((value: string | null) => void) | null>(null);
    const seenDamagePopupKeysRef = React.useRef<Set<string>>(new Set());
    const damagePopupTimerRef = React.useRef<number | null>(null);
    const seenActionToastKeysRef = React.useRef<Set<string>>(new Set());
    const actionToastTimerRef = React.useRef<number | null>(null);
    const actionToastInitializedRef = React.useRef(false);
    const jesterSpinIntervalRef = React.useRef<number | null>(null);
    const jesterSpinTimeoutRef = React.useRef<number | null>(null);
    const jesterSpinStartRef = React.useRef<number | null>(null);
    const jesterSpinClearRef = React.useRef<number | null>(null);
    const wsRef = React.useRef<WebSocket | null>(null);
    const localPlayerNameRef = React.useRef<string | null>(null);
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

    const requestReconnect = React.useCallback(() => {
        setError(null);
        setWsConnected(false);
        try {
            wsRef.current?.close();
        } catch {
            // noop
        }
        setReconnectNonce((prev) => prev + 1);
    }, []);

    const localPlayerId = localPlayerInfo?.id ?? null;
    const localPlayerName = localPlayerInfo?.name;

    React.useEffect(() => {
        if (typeof window === 'undefined' || !id) {
            setIsSpectator(false);
            return;
        }
        setIsSpectator(getRememberedMatchSpectator(id));
    }, [id]);

    React.useEffect(() => {
        if (!id) return;
        if (!isSpectator) return;
        if (!localPlayerInfo) return;
        setLocalPlayerInfo(null);
        clearRememberedMatchPlayer(id);
    }, [id, isSpectator, localPlayerInfo]);

    React.useEffect(() => {
        localPlayerNameRef.current = localPlayerName ?? null;
    }, [localPlayerName]);

    React.useEffect(() => {
        if (!id) return;
        if (typeof window === 'undefined') return;

        const url = `${wsBase(API_BASE)}/rooms/${encodeURIComponent(id)}/ws`;
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
                const name = (localPlayerNameRef.current ?? 'Player').trim() || 'Player';
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
                if (parsed?.t === 'state') {
                    setState(parsed.state as GameState);
                    setError(null);
                    return;
                }
                if (parsed?.t === 'lobby') {
                    if (id && localPlayerId && localPlayerName) {
                        rememberLobbyPlayer(id, localPlayerId, localPlayerName);
                        rememberLobbySpectator(id, Boolean(isSpectator));
                    }
                    navigate(`/lobby/${encodeURIComponent(id)}`);
                    return;
                }
                if (parsed?.t === 'error') {
                    setError(String(parsed.message ?? 'サーバーエラー'));
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
    }, [id, navigate, reconnectNonce]);

    React.useEffect(() => {
        if (!id) return;
        if (!state) return;
        if (isSpectator) return;
        if (!localPlayerId) return;
        if (state.players.some((p) => p.id === localPlayerId)) return;

        if (localPlayerName) {
            const fallback = state.players.find((p) => p.name === localPlayerName);
            if (fallback) {
                rememberMatchPlayer(id, fallback.id, fallback.name);
                setLocalPlayerInfo({ id: fallback.id, name: fallback.name });
                return;
            }
        }

        setLocalPlayerInfo(null);
        clearRememberedMatchPlayer(id);
    }, [id, state, isSpectator, localPlayerId, localPlayerName]);

    React.useEffect(() => {
        if (!state || state.players.length === 0) return;
        if (!selectedTargetId) return;
        if (state.players.some((p) => p.id === selectedTargetId)) {
            return;
        }
        setSelectedTargetId(null);
    }, [state, selectedTargetId]);

    React.useEffect(() => {
        if (!id || !state) return;
        if (state.status !== 'finished') return;
        if (matchResultShownRef.current === id) return;

        matchResultShownRef.current = id;
        setMatchResultOpen(true);
    }, [id, state]);

    React.useEffect(() => {
        if (!id) return;
        const status = state?.status;
        if (!status) return;
        if (status === 'finished') return;

        setMatchResultOpen(false);
        matchResultShownRef.current = null;
    }, [id, state?.status]);

    if (!id) {
        return <div className={styles.page}>マッチIDが不正です。</div>;
    }

    const currentPlayerId = state?.currentPlayerId ?? state?.turnOrder?.[state?.currentTurn ?? 0];
    const isCurrentPlayer = (playerId: string) => currentPlayerId === playerId;
    const hands = state?.hands ?? {};
    const runtimeStates = state?.board?.playerStates ?? {};
    const installsByPlayer = React.useMemo(() => (state ? groupInstallsByPlayer(runtimeStates, CARD_LOOKUP) : {}), [state, runtimeStates]);
    const playerName = React.useCallback((pid: string | undefined) => state?.players.find((p) => p.id === pid)?.name ?? '不明なプレイヤー', [state?.players]);
    const teamMode = Boolean(state?.teamMode);

    const showFloatingTooltip = React.useCallback(
        (title: string, text: string, event: React.MouseEvent) => {
            const offsetX = 16;
            const offsetY = 14;
            setTooltip({
                title,
                text,
                x: event.clientX + offsetX,
                y: event.clientY + offsetY,
            });
        },
        [setTooltip]
    );

    const clearFloatingTooltip = React.useCallback(() => {
        setTooltip(null);
    }, [setTooltip]);

    const getTeamDef = React.useCallback(
        (team?: TeamColor | null) => (team ? TEAM_OPTIONS.find((opt) => opt.id === team) ?? null : null),
        []
    );
    const renderPlayerChip = React.useCallback(
        (pid: string | undefined) => {
            const name = playerName(pid);
            const team = state?.players.find((p) => p.id === pid)?.team;
            const teamDef = getTeamDef(team);
            if (!teamMode || !teamDef) {
                return <>{name}</>;
            }
            return (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: teamDef.bg,
                        border: `1px solid ${teamDef.border}`,
                        color: teamDef.text,
                        fontWeight: 900,
                    }}
                >
                    {name}
                </span>
            );
        },
        [getTeamDef, playerName, state?.players, teamMode]
    );
    const renderTeamChip = React.useCallback(
        (team: TeamColor) => {
            const teamDef = getTeamDef(team);
            if (!teamDef) return <>{`${team}チーム`}</>;
            return (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: teamDef.bg,
                        border: `1px solid ${teamDef.border}`,
                        color: teamDef.text,
                        fontWeight: 900,
                    }}
                >
                    {teamDef.label}チーム
                </span>
            );
        },
        [getTeamDef]
    );
    const isPlayerDefeated = (pid: string) => Boolean(runtimeStates[pid]?.isDefeated);
    const braTokens = state?.braTokens ?? {};
    const roleAttackUsed = state?.roleAttackUsed ?? {};
    const logs: GameLogEntry[] = state?.logs ?? [];
    const logsToDisplay = React.useMemo(() => buildTurnLogDisplay(logs, 20), [logs]);
    const totalHandCount = React.useMemo(
        () => Object.values(hands).reduce((sum, hand) => sum + hand.length, 0),
        [hands]
    );
    const totalInstallCount = React.useMemo(
        () =>
            Object.values(runtimeStates).reduce(
                (sum, runtime) => sum + (runtime?.installs?.length ?? 0),
                0
            ),
        [runtimeStates]
    );
    const remainingDeckCount = (state?.sharedDeck.length ?? 0) + totalHandCount;
    const totalDeckCount =
        remainingDeckCount + (state?.sharedDiscard.length ?? 0) + totalInstallCount;
    const deckInfo = `${remainingDeckCount}枚 / ${totalDeckCount}枚`;
    const deckPileInfo = `${state?.sharedDeck.length ?? 0}枚 / 捨て札 ${state?.sharedDiscard.length ?? 0}枚`;
    const currentPlayerName = state?.players.find((p) => p.id === currentPlayerId)?.name ?? '未設定';
    const isTrickRoomActive =
        state?.turnOrderMode === 'ascendingSpe' &&
        (state?.turnOrderModeUntilRound ? (state?.round ?? 0) <= state.turnOrderModeUntilRound : true);
    const trickRoomLabel = isTrickRoomActive
        ? `トリックルーム中${state?.turnOrderModeUntilRound ? ` (〜R${state.turnOrderModeUntilRound})` : ''}`
        : null;
    const localPlayer = state?.players.find((p) => p.id === localPlayerId) ?? null;
    const localPlayerRuntime = localPlayerId ? runtimeStates[localPlayerId] : undefined;
    const isLocalDefeated = Boolean(localPlayerRuntime?.isDefeated);
    const sealedHand = localPlayerRuntime?.roleState?.sealedHand ?? [];
    const sealedHandIndexSet = React.useMemo(() => new Set(sealedHand.map((entry) => entry.index)), [sealedHand]);
    const cursedHand = localPlayerRuntime?.roleState?.cursedHand ?? [];
    const cursedHandIndexMap = React.useMemo(
        () => new Map(cursedHand.map((entry) => [entry.index, entry.curseId])),
        [cursedHand]
    );
    const forcedHandIndexSet = React.useMemo(() => {
        if (!localPlayerId) return new Set<number>();
        const hand = hands[localPlayerId] ?? [];
        const set = new Set<number>();
        cursedHand.forEach((entry) => {
            if (entry.curseId !== 'force') return;
            if (hand[entry.index] !== entry.cardId) return;
            if (sealedHandIndexSet.has(entry.index)) return;
            set.add(entry.index);
        });
        return set;
    }, [cursedHand, hands, localPlayerId, sealedHandIndexSet]);
    const bloodPatternHand = localPlayerRuntime?.roleState?.bloodPatternHand ?? [];
    const bloodPatternIndexSet = React.useMemo(() => {
        if (!localPlayerId) return new Set<number>();
        const hand = hands[localPlayerId] ?? [];
        const set = new Set<number>();
        bloodPatternHand.forEach((entry) => {
            if (hand[entry.index] !== entry.cardId) return;
            set.add(entry.index);
        });
        return set;
    }, [bloodPatternHand, hands, localPlayerId]);
    const localMaxBra =
        localPlayerRuntime
            ? localPlayerRuntime.baseStats.bra + localPlayerRuntime.statTokens.bra + localPlayerRuntime.turnBoosts.bra
            : null;
    const rescueBraCost = localPlayerRuntime ? Math.max(1, Math.floor(localPlayerRuntime.maxHp / 4)) : null;
    const showRescueInDrawSlot = localMaxBra !== null && localMaxBra <= 0 && rescueBraCost !== null;
    const copiedRoleIds = React.useMemo(
        () => localPlayerRuntime?.roleState?.copiedRoleAbilities?.map((entry) => entry.roleId) ?? [],
        [localPlayerRuntime?.roleState?.copiedRoleAbilities]
    );
    const hasRoleAbility = React.useCallback(
        (roleId: string) => Boolean(localPlayer?.roleId === roleId || copiedRoleIds.includes(roleId)),
        [copiedRoleIds, localPlayer?.roleId]
    );
    const localRoleActions = getRoleActionsForRoleIds([localPlayer?.roleId, ...copiedRoleIds]);
    const roleActionsPerPage = 4;
    const localRoleActionPageCount = Math.max(1, Math.ceil(localRoleActions.length / roleActionsPerPage));
    const safeRoleActionPage = Math.min(roleActionPage, Math.max(0, localRoleActionPageCount - 1));
    const visibleLocalRoleActions = localRoleActions.slice(
        safeRoleActionPage * roleActionsPerPage,
        safeRoleActionPage * roleActionsPerPage + roleActionsPerPage
    );
    const cardEffectMultiplier =
        localPlayerRuntime?.roleState?.cardEffectMultiplier ?? (hasRoleAbility('efficiency') ? 2 : 1);
    const cardEffectBonus = localPlayerRuntime?.roleState?.cardEffectBonus ?? 0;
    const showHandCardTooltip = React.useCallback(
        (
            event: React.MouseEvent<HTMLDivElement>,
            cardId: string,
            info: CardDefinition | undefined,
            curseId: string | null,
            isBloodPattern: boolean
        ) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const offsetX = 8;
            const maxWidth = 260;
            const x = Math.min(rect.right + offsetX, window.innerWidth - maxWidth - 8);
            const y = Math.max(8, Math.min(rect.top, window.innerHeight - 140));
            const adjustments = buildCardEffectAdjustments(info, cardEffectMultiplier, cardEffectBonus);
            const curseLabel = getCurseLabel(curseId);
            const curseDescription = getCurseDescription(curseId);
            const tooltipPrefixLines: string[] = [];
            if (curseLabel) tooltipPrefixLines.push(`🪄 ${curseLabel}`);
            if (curseDescription) tooltipPrefixLines.push(`📝 ${curseDescription}`);
            if (isBloodPattern) tooltipPrefixLines.push('🩸 血の紋様');
            const costLine = `コスト: ${info?.cost ?? 1}`;
            const tooltipPrefix = tooltipPrefixLines.length > 0 ? `${tooltipPrefixLines.join('\n')}\n\n` : '';
            setTooltip({
                title: info?.name ?? cardId,
                text: `${tooltipPrefix}${costLine}\n\n${info?.text ?? '説明がありません。'}`,
                x,
                y,
                adjustments,
            });
        },
        [cardEffectBonus, cardEffectMultiplier]
    );
    const pendingPrompt = state?.pendingPrompt ?? null;
    const pendingCard = pendingPrompt ? CARD_LOOKUP.get(pendingPrompt.cardId) : undefined;
    const pendingEffect = pendingPrompt && pendingCard ? pendingCard.effects?.[pendingPrompt.effectIndex] : undefined;
    const pendingPromptLabel = pendingPrompt?.promptLabel ?? pendingCard?.name ?? pendingPrompt?.cardId;
    const isPromptTarget = Boolean(pendingPrompt && localPlayer?.id === pendingPrompt.targetId);
    const pendingInfoDraw = state?.pendingInfoDraw ?? null;
    const pendingInfoDrawPlayer = pendingInfoDraw ? state?.players.find((p) => p.id === pendingInfoDraw.playerId) : undefined;
    const isInfoDrawTarget = Boolean(pendingInfoDraw && localPlayer?.id === pendingInfoDraw.playerId);
    const isPromptBlocking = Boolean(pendingPrompt || pendingInfoDraw);
    const hostPlayerId = state?.players[0]?.id ?? null;
    const isHost = Boolean(hostPlayerId && localPlayerId && hostPlayerId === localPlayerId);
    const otherPlayers = React.useMemo(
        () => (state?.players ?? []).filter((p) => !localPlayer || p.id !== localPlayer.id),
        [localPlayer, state?.players]
    );
    const livingPlayers = React.useMemo(() => {
        if (!state) return [];
        return state.players.filter((p) => !runtimeStates[p.id]?.isDefeated);
    }, [state, runtimeStates]);
    const winnerText = React.useMemo<React.ReactNode>(() => {
        if (!state) return '';
        if (state.winnerTeam) {
            return (
                <>
                    {renderTeamChip(state.winnerTeam)} の勝利！
                </>
            );
        }
        if (state.winnerId) {
            return (
                <>
                    {renderPlayerChip(state.winnerId)} の勝利！
                </>
            );
        }
        if (livingPlayers.length === 1) {
            return (
                <>
                    {renderPlayerChip(livingPlayers[0].id)} の勝利！
                </>
            );
        }
        if (livingPlayers.length === 0) {
            return '全員脱落（引き分け）';
        }
        return (
            <>
                決着（生存: {livingPlayers.map((p, idx) => (
                    <React.Fragment key={p.id}>
                        {idx > 0 ? ', ' : ''}
                        {renderPlayerChip(p.id)}
                    </React.Fragment>
                ))}）
            </>
        );
    }, [livingPlayers, renderPlayerChip, renderTeamChip, state]);
    const allCards = ALL_CARDS;
    const jesterSpinItems = React.useMemo(
        () => [
            'ドロー+1',
            '最大HP+3/HP+3',
            'Atk+3',
            'Def+2',
            'Spe+3',
            'ランダム3ダメージ',
            'HP+8',
            '全員に10ダメージ',
            '大強化',
            '火炎2',
            'Bra-1',
            'HP=1',
            '手札全捨て',
            '次のアイテム+2',
        ],
        []
    );
    const deckCounts = React.useMemo(() => {
        if (!state) return [];
        const counts = new Map<
            string,
            { total: number; remaining: number; inDeck: number; inHand: number; inDiscard: number; inInstall: number }
        >();
        state.sharedDeck.forEach((cardId) => {
            const entry = counts.get(cardId) ?? {
                total: 0,
                remaining: 0,
                inDeck: 0,
                inHand: 0,
                inDiscard: 0,
                inInstall: 0,
            };
            entry.total += 1;
            entry.remaining += 1;
            entry.inDeck += 1;
            counts.set(cardId, entry);
        });
        Object.values(state.hands).forEach((hand) => {
            hand.forEach((cardId) => {
                const entry = counts.get(cardId) ?? {
                    total: 0,
                    remaining: 0,
                    inDeck: 0,
                    inHand: 0,
                    inDiscard: 0,
                    inInstall: 0,
                };
                entry.total += 1;
                entry.remaining += 1;
                entry.inHand += 1;
                counts.set(cardId, entry);
            });
        });
        state.sharedDiscard.forEach((cardId) => {
            const entry = counts.get(cardId) ?? {
                total: 0,
                remaining: 0,
                inDeck: 0,
                inHand: 0,
                inDiscard: 0,
                inInstall: 0,
            };
            entry.total += 1;
            entry.inDiscard += 1;
            counts.set(cardId, entry);
        });
        Object.values(state.board.playerStates).forEach((runtime) => {
            runtime.installs.forEach((install) => {
                const entry = counts.get(install.cardId) ?? {
                    total: 0,
                    remaining: 0,
                    inDeck: 0,
                    inHand: 0,
                    inDiscard: 0,
                    inInstall: 0,
                };
                entry.total += 1;
                entry.inInstall += 1;
                counts.set(install.cardId, entry);
            });
        });
        return Array.from(counts.entries())
            .map(([cardId, count]) => ({
                cardId,
                count,
                info: CARD_LOOKUP.get(cardId),
            }))
            .sort((a, b) => (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId));
    }, [state]);

    const deckCountsToDisplay = React.useMemo(() => {
        const query = deckSearchText.trim();
        const q = query.toLowerCase();
        const dirFactor = deckSortDir === 'desc' ? -1 : 1;

        const filtered = deckCounts.filter(({ cardId, count, info }) => {
            if (deckInspectMode === 'remaining' && count.remaining === 0) {
                return false;
            }
            if (deckCategoryFilter !== 'all' && info?.category !== deckCategoryFilter) {
                return false;
            }
            if (deckZoneFilter === 'deck' && count.inDeck === 0) return false;
            if (deckZoneFilter === 'hand' && count.inHand === 0) return false;
            if (deckZoneFilter === 'discard' && count.inDiscard === 0) return false;
            if (deckZoneFilter === 'install' && count.inInstall === 0) return false;
            if (deckZoneFilter === 'remaining' && count.remaining === 0) return false;
            if (deckZoneFilter === 'empty' && count.remaining !== 0) return false;
            if (q.length > 0) {
                const name = (info?.name ?? cardId).toLowerCase();
                const text = (info?.text ?? '').toLowerCase();
                if (!name.includes(q) && !text.includes(q)) {
                    return false;
                }
            }
            return true;
        });

        const getCost = (info?: CardDefinition) => (typeof info?.cost === 'number' ? info.cost : 1);
        const getCategoryKey = (info?: CardDefinition) => getCategoryLabel(info?.category) ?? info?.category ?? '';

        return filtered.slice().sort((a, b) => {
            switch (deckSortKey) {
                case 'remaining': {
                    const diff = (a.count.remaining ?? 0) - (b.count.remaining ?? 0);
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'total': {
                    const diff = (a.count.total ?? 0) - (b.count.total ?? 0);
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'cost': {
                    const diff = getCost(a.info) - getCost(b.info);
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'category': {
                    const diff = getCategoryKey(a.info).localeCompare(getCategoryKey(b.info));
                    if (diff !== 0) return diff * dirFactor;
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
                }
                case 'name':
                default:
                    return (a.info?.name ?? a.cardId).localeCompare(b.info?.name ?? b.cardId) * dirFactor;
            }
        });
    }, [
        deckCounts,
        deckInspectMode,
        deckSearchText,
        deckCategoryFilter,
        deckZoneFilter,
        deckSortKey,
        deckSortDir,
    ]);

    const closeDamagePopup = React.useCallback(() => {
        if (damagePopupTimerRef.current) {
            window.clearTimeout(damagePopupTimerRef.current);
            damagePopupTimerRef.current = null;
        }
        setDamagePopup(null);
    }, []);

    React.useEffect(() => {
        setRoleActionChoices({});
    }, [localPlayer?.roleId, copiedRoleIds.join('|')]);

    React.useEffect(() => {
        const onResize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    React.useEffect(() => {
        return () => {
            if (jesterSpinIntervalRef.current) {
                window.clearInterval(jesterSpinIntervalRef.current);
            }
            if (jesterSpinTimeoutRef.current) {
                window.clearTimeout(jesterSpinTimeoutRef.current);
            }
            if (jesterSpinClearRef.current) {
                window.clearTimeout(jesterSpinClearRef.current);
            }
        };
    }, []);

    const clearJesterSpinTimers = React.useCallback(() => {
        if (jesterSpinIntervalRef.current) {
            window.clearInterval(jesterSpinIntervalRef.current);
            jesterSpinIntervalRef.current = null;
        }
        if (jesterSpinTimeoutRef.current) {
            window.clearTimeout(jesterSpinTimeoutRef.current);
            jesterSpinTimeoutRef.current = null;
        }
        if (jesterSpinClearRef.current) {
            window.clearTimeout(jesterSpinClearRef.current);
            jesterSpinClearRef.current = null;
        }
    }, []);

    const runJesterSpinWithResult = React.useCallback(
        (resultText: string) => {
            clearJesterSpinTimers();
            let spinIndex = 0;
            setJesterSpin({ label: jesterSpinItems[0] });
            jesterSpinIntervalRef.current = window.setInterval(() => {
                spinIndex = (spinIndex + 1) % jesterSpinItems.length;
                setJesterSpin({ label: jesterSpinItems[spinIndex] });
            }, 90);
            jesterSpinTimeoutRef.current = window.setTimeout(() => {
                if (jesterSpinIntervalRef.current) {
                    window.clearInterval(jesterSpinIntervalRef.current);
                    jesterSpinIntervalRef.current = null;
                }
                setJesterSpin({ label: resultText, result: resultText });
                jesterSpinClearRef.current = window.setTimeout(() => {
                    setJesterSpin(null);
                }, 1000);
            }, 1000);
        },
        [clearJesterSpinTimers, jesterSpinItems]
    );

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        const latest = [...state.logs].reverse().find(isRoleActionLog);
        if (!latest) return;
        if (latest.actionId !== 'jester_random') return;
        const key = `${latest.timestamp}-${latest.playerId}-${latest.actionId}`;
        if (key === lastJesterLogKey) return;
        setLastJesterLogKey(key);
        const resultText = latest.description ?? '道化の効果';
        runJesterSpinWithResult(resultText);
    }, [state?.logs, lastJesterLogKey, localPlayerId, runJesterSpinWithResult]);

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        if (pendingPrompt || pendingInfoDraw) return;
        if (damagePopup) return;
        const makeKey = (entry: DamageResolvedLog) =>
            `${entry.timestamp}-${entry.attackerId ?? 'none'}-${entry.targetId}-${entry.source}-${entry.attempted}-${entry.totalAfterReductions}-${entry.hpDamage}-${entry.tempAbsorbed}`;
        const seen = seenDamagePopupKeysRef.current;
        const fresh = state.logs.filter(isDamageResolvedLog).filter((entry) => {
            const key = makeKey(entry);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (fresh.length === 0) return;
        setDamagePopupQueue((prev) => [...prev, ...fresh]);
    }, [state?.logs, pendingPrompt, pendingInfoDraw, damagePopup]);

    React.useEffect(() => {
        if (!state?.logs?.length) return;
        if (pendingPrompt || pendingInfoDraw) return;
        if (damagePopup) return;
        if (!actionToastInitializedRef.current) {
            const seen = seenActionToastKeysRef.current;
            state.logs.filter(isActionToastLog).forEach((entry) => {
                const common = `${entry.type}-${entry.timestamp}-${entry.round ?? 'n'}`;
                if (entry.type === 'cardPlay') {
                    seen.add(`${common}-${entry.playerId}-${entry.cardId}-${(entry.targets ?? []).join(',')}`);
                } else if (entry.type === 'roleAction') {
                    seen.add(`${common}-${entry.playerId}-${entry.actionId}-${entry.targetId ?? 'none'}`);
                } else if (entry.type === 'turnStart') {
                    seen.add(`${common}-${entry.playerId}-${entry.kind ?? 'n'}`);
                } else if (entry.type === 'roundStart') {
                    seen.add(`${common}-${entry.round ?? 'n'}`);
                } else if (entry.type === 'playerDefeated') {
                    seen.add(`${common}-${entry.playerId}`);
                } else if (entry.type === 'statusEffect') {
                    seen.add(`${common}-${entry.playerId}-${entry.effect}-${entry.amount}-${entry.kind}`);
                } else {
                    seen.add(common);
                }
            });
            actionToastInitializedRef.current = true;
            return;
        }
        const makeKey = (entry: ActionToastLog) => {
            const common = `${entry.type}-${entry.timestamp}-${entry.round ?? 'n'}`;
            switch (entry.type) {
                case 'cardPlay':
                    return `${common}-${entry.playerId}-${entry.cardId}-${(entry.targets ?? []).join(',')}`;
                case 'roleAction':
                    return `${common}-${entry.playerId}-${entry.actionId}-${entry.targetId ?? 'none'}`;
                case 'turnStart':
                    return `${common}-${entry.playerId}-${entry.kind ?? 'n'}`;
                case 'roundStart':
                    return `${common}-${entry.round ?? 'n'}`;
                case 'playerDefeated':
                    return `${common}-${entry.playerId}`;
                case 'statusEffect':
                    return `${common}-${entry.playerId}-${entry.effect}-${entry.amount}-${entry.kind}`;
                default:
                    return common;
            }
        };
        const seen = seenActionToastKeysRef.current;
        const fresh = state.logs.filter(isActionToastLog).filter((entry) => {
            const key = makeKey(entry);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        if (fresh.length === 0) return;
        setActionToastQueue((prev) => [...prev, ...fresh]);
    }, [state?.logs, pendingPrompt, pendingInfoDraw, damagePopup]);

    React.useEffect(() => {
        if (actionToast) return;
        if (damagePopup) return;
        if (actionToastQueue.length === 0) return;
        const next = actionToastQueue[0] ?? null;
        if (!next) return;
        setActionToast(next);
        setActionToastQueue((prev) => prev.slice(1));
    }, [actionToast, actionToastQueue, damagePopup]);

    React.useEffect(() => {
        if (!actionToast) return;
        if (actionToastTimerRef.current) {
            window.clearTimeout(actionToastTimerRef.current);
        }
        actionToastTimerRef.current = window.setTimeout(() => {
            setActionToast(null);
        }, ACTION_TOAST_DURATION_MS);
        return () => {
            if (actionToastTimerRef.current) {
                window.clearTimeout(actionToastTimerRef.current);
                actionToastTimerRef.current = null;
            }
        };
    }, [actionToast, ACTION_TOAST_DURATION_MS]);

    React.useEffect(() => {
        if (damagePopup) return;
        if (damagePopupQueue.length === 0) return;
        const next = damagePopupQueue[0] ?? null;
        if (!next) return;
        setDamagePopup(next);
        setDamagePopupQueue((prev) => prev.slice(1));
    }, [damagePopup, damagePopupQueue]);

    React.useEffect(() => {
        if (!damagePopup) return;
        if (damagePopupTimerRef.current) {
            window.clearTimeout(damagePopupTimerRef.current);
        }
        damagePopupTimerRef.current = window.setTimeout(() => {
            closeDamagePopup();
        }, DAMAGE_POPUP_DURATION_MS);
        return () => {
            if (damagePopupTimerRef.current) {
                window.clearTimeout(damagePopupTimerRef.current);
                damagePopupTimerRef.current = null;
            }
        };
    }, [damagePopup, closeDamagePopup, DAMAGE_POPUP_DURATION_MS]);

    const requireLocalPlayer = (): string | null => {
        if (!localPlayerId) {
            alert('操作するプレイヤーが設定されていません。');
            return null;
        }
        return localPlayerId;
    };

    const requestSelection = React.useCallback(
        (
            modal:
                | {
                      type: 'target';
                      title: string;
                      rule: TargetRule;
                      context?: TargetSelectionContext;
                      note?: string;
                      forcedTargetId?: string;
                  }
                | { type: 'stat'; title: string; options?: Array<'atk' | 'def' | 'spe' | 'bra'> }
                | { type: 'chooseOne'; title: string; options: Array<{ value: string; label: string }> }
        ) => {
            if (selectionModal) {
                return Promise.resolve<string | null>(null);
            }
            return new Promise<string | null>((resolve) => {
                selectionResolveRef.current = resolve;
                setSelectionModal(modal);
            });
        },
        [selectionModal]
    );

    const closeSelection = React.useCallback((value: string | null) => {
        selectionResolveRef.current?.(value);
        selectionResolveRef.current = null;
        setSelectionModal(null);
    }, []);

    const currentBraValue = localPlayerId ? braTokens[localPlayerId] ?? 0 : 0;
    const attackIsStruggle = currentBraValue <= 0;
    const attackButtonLabel = attackIsStruggle ? '悪あがき' : 'ロール攻撃';
    const roleAttackAlreadyUsed = localPlayerId ? Boolean(roleAttackUsed[localPlayerId]) : true;
    const isBarrage = hasRoleAbility('barrage');
    const allowRepeatRoleAttack = Boolean(isBarrage && !attackIsStruggle);
    const roleAttackDisabled =
        !localPlayer ||
        isLocalDefeated ||
        !isCurrentPlayer(localPlayer.id) ||
        (roleAttackAlreadyUsed && !allowRepeatRoleAttack) ||
        !state?.players.some((player) => player.id !== localPlayerId && !isPlayerDefeated(player.id));

    const describeTargets = (ids?: string[]) => {
        if (!ids || ids.length === 0) {
            return '';
        }
        return ids.map((pid) => playerName(pid)).join(', ');
    };

    const formatLogEntry = (entry: GameLogEntry): React.ReactNode => {
        const roundLabel =
            typeof entry.round === 'number' && Number.isFinite(entry.round)
                ? entry.round
                : typeof state?.round === 'number' && Number.isFinite(state.round)
                  ? state.round
                  : undefined;
        const prefix = roundLabel !== undefined ? `R${roundLabel} ` : '';
        const renderTargets = (ids?: string[]) => {
            if (!ids || ids.length === 0) return null;
            return ids.map((pid, idx) => (
                <React.Fragment key={`${entry.type}-target-${pid}`}>
                    {idx > 0 ? ', ' : ''}
                    {renderPlayerChip(pid)}
                </React.Fragment>
            ));
        };
        switch (entry.type) {
            case 'roundStart':
                return roundLabel !== undefined ? `ラウンド${roundLabel}開始` : 'ラウンド開始';
            case 'turnStart':
                if (entry.label) {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}の{entry.label}
                        </>
                    );
                }
                if (entry.deferred || entry.kind === 'extended') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}の延長ターン開始
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}のターン開始
                    </>
                );
            case 'abilityDamage': {
                const source = entry.sourcePlayerId ? renderPlayerChip(entry.sourcePlayerId) : null;
                if (entry.sourceAbilityId === 'bomb_self_blowback') {
                    return (
                        <>
                            {prefix}
                            {source ?? renderPlayerChip(entry.playerId)}の爆弾反動で{renderPlayerChip(entry.playerId)}が{entry.amount}ダメージ
                        </>
                    );
                }
                if (entry.sourceAbilityId === 'bomb_thorns') {
                    return (
                        <>
                            {prefix}
                            {source ?? renderPlayerChip(entry.playerId)}の爆弾反射で{renderPlayerChip(entry.playerId)}が{entry.amount}ダメージ
                        </>
                    );
                }
                if (entry.sourceAbilityId === 'bomb_timed_bomb') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}の時限爆弾が爆発して{entry.amount}ダメージ
                        </>
                    );
                }
                if (source) {
                    return (
                        <>
                            {prefix}
                            {source}の能力で{renderPlayerChip(entry.playerId)}が{entry.amount}ダメージ
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が能力で{entry.amount}ダメージ
                    </>
                );
            }
            case 'cardPlay': {
                const cardInfo = CARD_LOOKUP.get(entry.cardId);
                const cardName = cardInfo?.name ?? entry.cardId;
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が「{cardName}」を{entry.targets?.length ? <>{renderTargets(entry.targets)}に</> : ''}使用
                    </>
                );
            }
            case 'roleAttack': {
                const detail = entry.isStruggle ? '（悪あがき）' : '';
                const selfText = entry.selfInflicted ? `（自傷 ${entry.selfInflicted}）` : '';
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.attackerId)}が{renderPlayerChip(entry.targetId)}にロール攻撃{detail}
                        {selfText}
                    </>
                );
            }
            case 'roleAttackHit': {
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.attackerId)}の連撃 {entry.hitIndex}/{entry.totalHits} → {renderPlayerChip(entry.targetId)} に {entry.damage}ダメージ
                    </>
                );
            }
            case 'playerDefeated':
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が脱落
                    </>
                );
            case 'roleAction': {
                const desc = entry.description ?? entry.actionId;
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}が{desc}
                        {entry.targetId ? <> → {renderPlayerChip(entry.targetId)}</> : ''}
                    </>
                );
            }
            case 'statusEffect': {
                const kindText = entry.kind === 'heal' ? '回復' : 'ダメージ';
                const effectText = entry.effect === 'burn' ? '炎上' : '出血';
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}の{effectText}: {entry.amount}
                        {kindText}
                    </>
                );
            }
            case 'cardEffect': {
                const cardName = CARD_LOOKUP.get(entry.cardId)?.name ?? entry.cardId;
                const target = renderPlayerChip(entry.targetId ?? entry.playerId);
                if (entry.kind === 'draw') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}が{entry.count ?? 0}枚ドロー
                        </>
                    );
                }
                if (entry.kind === 'heal') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}がHP+{entry.amount ?? 0}
                        </>
                    );
                }
                if (entry.kind === 'adjustBra') {
                    const delta = entry.amount ?? 0;
                    const sign = delta >= 0 ? '+' : '';
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}のBra{sign}
                            {delta}
                        </>
                    );
                }
                if (entry.kind === 'addStatToken') {
                    const statLabel = STAT_LABELS[entry.stat ?? ''] ?? (entry.stat ? entry.stat.toUpperCase() : 'Stat');
                    const delta = entry.amount ?? 0;
                    const sign = delta >= 0 ? '+' : '';
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}の追加{statLabel}
                            {sign}
                            {delta}
                        </>
                    );
                }
                if (entry.kind === 'applyStatus') {
                    const statusLabel: Record<string, string> = {
                        burn: '炎上',
                        bleed: '出血',
                        shock: '感電',
                        stun: 'スタン',
                        dizzy: 'めまい',
                    };
                    const label = entry.status ? statusLabel[entry.status] ?? entry.status : '状態';
                    const value = entry.amount ?? 0;
                    const sign = value >= 0 ? '+' : '';
                    const suffix = entry.status === 'stun' ? ` (${value}R)` : '';
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}に{label}
                            {sign}
                            {value}
                            {suffix}
                        </>
                    );
                }
                if (entry.kind === 'sealHand') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}の手札を封印 ({entry.count ?? 0}枚)
                        </>
                    );
                }
                if (entry.kind === 'discard') {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.playerId)}がカード「{cardName}」で{target}: {entry.note ?? `手札を${entry.count ?? 0}枚捨てた`}
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}がカード「{cardName}」を使用
                    </>
                );
            }
            case 'damageReduced': {
                const reason =
                    entry.reason ??
                    (entry.source === 'install'
                        ? entry.cardId
                            ? `カード「${CARD_LOOKUP.get(entry.cardId)?.name ?? entry.cardId}」`
                            : '防御カード'
                        : entry.abilityId ?? '能力');
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.playerId)}のダメージを{entry.amount}軽減 ({reason})
                    </>
                );
            }
            case 'damageResolved': {
                const label = entry.label ?? 'ダメージ';
                const reducedText = entry.attempted !== entry.totalAfterReductions ? ` (${entry.attempted}→${entry.totalAfterReductions})` : '';
                if (entry.prevented) {
                    if (entry.attackerId && entry.attackerId !== entry.targetId) {
                        return (
                            <>
                                {prefix}
                                {renderPlayerChip(entry.attackerId)}→{renderPlayerChip(entry.targetId)} {label}: 無効{reducedText}
                            </>
                        );
                    }
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.targetId)} {label}: 無効{reducedText}
                        </>
                    );
                }
                if (entry.attackerId && entry.attackerId !== entry.targetId) {
                    return (
                        <>
                            {prefix}
                            {renderPlayerChip(entry.attackerId)}→{renderPlayerChip(entry.targetId)} {label}: {entry.totalAfterReductions}ダメージ{reducedText}
                        </>
                    );
                }
                return (
                    <>
                        {prefix}
                        {renderPlayerChip(entry.targetId)} {label}: {entry.totalAfterReductions}ダメージ{reducedText}
                    </>
                );
            }
            default:
                return '';
        }
    };

    const isTargetValid = (targetId: string | null, rule: TargetRule): boolean => {
        if (!targetId) return false;
        if (!state?.players.some((player) => player.id === targetId)) return false;
        if (rule.mode === 'self' && targetId !== localPlayerId) return false;
        if (rule.mode === 'others') {
            if (targetId === localPlayerId) return false;
            if (state?.teamMode) {
                const actorTeam = state.players.find((player) => player.id === localPlayerId)?.team ?? null;
                const targetTeam = state.players.find((player) => player.id === targetId)?.team ?? null;
                if (actorTeam && targetTeam && actorTeam === targetTeam) return false;
            }
        }
        if (rule.disallowDefeated && isPlayerDefeated(targetId)) return false;
        return true;
    };

    const getTargetCandidates = React.useCallback(
        (rule: TargetRule): Player[] => {
            if (!state) return [];
            return state.players.filter((player) => {
                if (rule.mode === 'self' && player.id !== localPlayerId) return false;
                if (rule.mode === 'others') {
                    if (player.id === localPlayerId) return false;
                    if (state.teamMode) {
                        const actorTeam = state.players.find((p) => p.id === localPlayerId)?.team ?? null;
                        if (actorTeam && player.team && player.team === actorTeam) return false;
                    }
                }
                if (rule.disallowDefeated && isPlayerDefeated(player.id)) return false;
                return true;
            });
        },
        [state, localPlayerId, isPlayerDefeated]
    );

    const requestTargetSelection = async (
        rule: TargetRule,
        title: string,
        context: TargetSelectionContext = { kind: 'generic' }
    ): Promise<string | null> => {
        const taunterId =
            state?.players.find((player) => {
                if (isPlayerDefeated(player.id)) return false;
                return Boolean(runtimeStates[player.id]?.roleState?.tauntUntilNextTurnStart);
            })?.id ?? null;
        const forcedTargetId = taunterId && taunterId !== localPlayerId ? taunterId : null;

        const candidates = getTargetCandidates(rule);
        if (forcedTargetId && !candidates.some((player) => player.id === forcedTargetId)) {
            alert(`「このゆびとまれ」中のため対象は${playerName(forcedTargetId)}に固定されますが、対象にできません。`);
            return null;
        }
        if (candidates.length === 0) {
            alert('対象にできるプレイヤーがいません。');
            return null;
        }
        const note = forcedTargetId
            ? `「このゆびとまれ」中のため、対象は${playerName(forcedTargetId)}に固定されます。`
            : undefined;
        const selected = await requestSelection({
            type: 'target',
            title,
            rule,
            context,
            note,
            forcedTargetId: forcedTargetId ?? undefined,
        });
        if (!selected) return null;
        if (forcedTargetId && selected !== forcedTargetId) {
            return null;
        }
        setSelectedTargetId(selected);
        return selected;
    };

    const requestStatSelection = async (
        title: string,
        options?: Array<'atk' | 'def' | 'spe' | 'bra'>
    ): Promise<'atk' | 'def' | 'spe' | 'bra' | null> => {
        const selected = await requestSelection({ type: 'stat', title, options });
        if (!selected) return null;
        const stat = selected as 'atk' | 'def' | 'spe' | 'bra';
        setSelectedStatChoice(stat);
        return stat;
    };

    const requestChooseOneSelection = async (
        title: string,
        options: Array<{ value: string; label: string }>
    ): Promise<string | null> => {
        if (options.length === 0) {
            alert('選択肢が不正です。');
            return null;
        }
        if (options.length === 1) {
            return options[0]?.value ?? null;
        }
        const selected = await requestSelection({ type: 'chooseOne', title, options });
        return selected;
    };

    const selectionTargets =
        selectionModal?.type === 'target' ? getTargetCandidates(selectionModal.rule) : [];
    const selectionCopiedFromSet = React.useMemo(() => {
        const copied = localPlayerRuntime?.roleState?.copiedRoleAbilities ?? [];
        return new Set(copied.map((entry) => entry.fromPlayerId));
    }, [localPlayerRuntime?.roleState?.copiedRoleAbilities]);
    const selectionTargetItems = React.useMemo(() => {
        if (selectionModal?.type !== 'target') return [];
        return selectionTargets.map((player) => {
            const context = selectionModal.context ?? { kind: 'generic' as const };
            const isDuplicateCopy = context.kind === 'roleAction' && context.actionId === 'duplicate_copy';

            const badges: string[] = [];
            let disabledReason: string | null = null;
            const forcedTargetId = selectionModal.forcedTargetId ?? null;

            const tauntActive = Boolean(runtimeStates[player.id]?.roleState?.tauntUntilNextTurnStart);
            if (tauntActive) {
                badges.push('対象固定中');
            }

            if (!disabledReason && forcedTargetId && player.id !== forcedTargetId) {
                disabledReason = '対象固定中のため選択できません';
            }

            if (isDuplicateCopy) {
                if (player.roleId === 'duplicate') {
                    badges.push('複製不可');
                    disabledReason = '［複製］の固有能力は複製できません';
                } else if (selectionCopiedFromSet.has(player.id)) {
                    badges.push('複製済み');
                    disabledReason = '同じプレイヤーから2回目の複製はできません';
                }
            }

            return {
                playerId: player.id,
                playerLabel: renderPlayerChip(player.id),
                isDefeated: isPlayerDefeated(player.id),
                badges,
                disabled: Boolean(disabledReason),
                disabledReason,
            };
        });
    }, [isPlayerDefeated, renderPlayerChip, runtimeStates, selectionCopiedFromSet, selectionModal, selectionTargets]);

    const handleDraw = async (count = 1) => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        const currentBra = braTokens[playerId] ?? 0;
        if (currentBra <= 0) {
            alert('Braが不足しています。');
            return;
        }
        try {
            const ok = sendWsAction({ k: 'match/draw', playerId, count });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ドローできません。');
            }
        } catch (err) {
            alert('ドローに失敗しました: ' + (err as Error).message);
        }
    };

    const handlePlay = async (cardId: string, handIndex?: number) => {
        const playerId = requireLocalPlayer();
        if (!playerId || !cardId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        const cardMeta = CARD_LOOKUP.get(cardId);
        const curseId =
            typeof handIndex === 'number' && Number.isFinite(handIndex)
                ? (cursedHandIndexMap.get(Math.floor(handIndex)) ?? null)
                : null;
        const optionalEffectIndexes =
            cardMeta?.effects?.reduce<number[]>((acc, effect, index) => {
                if (effect?.optional && effect.trigger === 'onPlay') {
                    acc.push(index);
                }
                return acc;
            }, []) ?? [];
        try {
            const params: { targets?: string[]; choices?: PlayChoicesPayload; handIndex?: number } = {};
            if (typeof handIndex === 'number' && Number.isFinite(handIndex)) {
                params.handIndex = Math.floor(handIndex);
            }
            let choicesPayload: PlayChoicesPayload | undefined;

            const getDoubleBaseStatEffect = (effects?: CardEffect[]): Extract<CardEffect, { type: 'doubleBaseStat' }> | null => {
                const flat = flattenCardEffects(effects);
                const found = flat.find((eff) => eff.type === 'doubleBaseStat');
                return (found as Extract<CardEffect, { type: 'doubleBaseStat' }>) ?? null;
            };

            const getStatOptionsFromEffects = (effects?: CardEffect[]): Array<'atk' | 'def' | 'spe' | 'bra'> => {
                const statEffect = getDoubleBaseStatEffect(effects);
                const statOptionsRaw = (statEffect?.playerChoice?.chooseOneOf ?? STAT_OPTIONS) as Array<'atk' | 'def' | 'spe' | 'bra'>;
                const statExcluded = new Set(statEffect?.exclude ?? []);
                const statOptions = statOptionsRaw.filter((stat) => !statExcluded.has(stat));
                return cardMeta?.id === 'twice_boost' ? statOptions.filter((stat) => stat !== 'bra') : statOptions;
            };

            const hasStatChoice = (effects?: CardEffect[]): boolean => Boolean(getDoubleBaseStatEffect(effects));
            if (optionalEffectIndexes.length > 0) {
                const promptText = `${cardMeta?.name ?? cardId} の任意効果を発動しますか？`;
                const shouldActivate = window.confirm(promptText);
                if (shouldActivate) {
                    choicesPayload = { ...(choicesPayload ?? {}), optionalEffects: optionalEffectIndexes };
                }
            }
            const chooseOneEffect = cardMeta?.effects?.find(
                (effect): effect is Extract<CardEffect, { type: 'chooseOne' }> =>
                    effect.type === 'chooseOne' && effect.trigger === 'onPlay'
            );
            let chosenOptionEffects: CardEffect[] | undefined;
            let greedSelections: Record<string, { targets?: string[]; choices?: Record<string, unknown> }> | null = null;
            if (chooseOneEffect) {
                const opts = chooseOneEffect.options ?? [];
                if (opts.length < 2) {
                    alert('選択肢が不正です。');
                    return;
                }
                if (hasRoleAbility('strong_greed')) {
                    greedSelections = {};
                    for (const opt of opts) {
                        const optEffects = (opt.effects ?? []).filter((eff) => eff.trigger === chooseOneEffect.trigger);
                        const optTargetRule = getTargetRuleFromEffects(optEffects);
                        if (optTargetRule) {
                            const targetId = await requestTargetSelection(
                                optTargetRule,
                                `${cardMeta?.name ?? cardId}：${opt.label} の対象を選択`,
                                { kind: 'card', cardId }
                            );
                            if (!targetId) return;
                            greedSelections[opt.value] = { ...(greedSelections[opt.value] ?? {}), targets: [targetId] };
                        }
                        if (hasStatChoice(optEffects)) {
                            const optsForStat = getStatOptionsFromEffects(optEffects);
                            if (optsForStat.length === 0) {
                                alert('選択できるステータスがありません。');
                                return;
                            }
                            const selected = await requestStatSelection(
                                `${cardMeta?.name ?? cardId}：${opt.label} の増幅ステータスを選択`,
                                optsForStat
                            );
                            if (!selected) return;
                            greedSelections[opt.value] = {
                                ...(greedSelections[opt.value] ?? {}),
                                choices: { ...(greedSelections[opt.value]?.choices ?? {}), stat: selected },
                            };
                        }
                    }
                    choicesPayload = { ...(choicesPayload ?? {}), [chooseOneEffect.key]: { selections: greedSelections } };
                } else {
                    let selectedValue: string | null = null;
                    const selected = await requestChooseOneSelection(
                        `${cardMeta?.name ?? cardId}：効果を選択`,
                        opts.map((opt) => ({ value: opt.value, label: opt.label }))
                    );
                    selectedValue = selected;
                    if (!selectedValue) {
                        return;
                    }
                    chosenOptionEffects = opts.find((opt) => opt.value === selectedValue)?.effects;
                    choicesPayload = { ...(choicesPayload ?? {}), [chooseOneEffect.key]: selectedValue };
                }
            }

            const isGreed = hasRoleAbility('strong_greed');
            const onPlayEffects = (cardMeta?.effects ?? []).filter((eff) => eff.trigger === 'onPlay');
            const nonChooseOneOnPlayEffects = onPlayEffects.filter((eff) => eff.type !== 'chooseOne');
            const statChoiceEffects = isGreed
                ? nonChooseOneOnPlayEffects
                : chooseOneEffect
                ? [...(chosenOptionEffects ?? []), ...nonChooseOneOnPlayEffects].filter((eff) => eff.trigger === 'onPlay')
                : onPlayEffects;

            if (hasStatChoice(statChoiceEffects)) {
                const optionsForStat = getStatOptionsFromEffects(statChoiceEffects);
                if (optionsForStat.length === 0) {
                    alert('選択できるステータスがありません。');
                    return;
                }
                const statChoice = selectedStatChoice || (await requestStatSelection('増幅するステータスを選択', optionsForStat));
                if (!statChoice) return;
                choicesPayload = { ...(choicesPayload ?? {}), stat: statChoice };
            }

            const targetRule =
                chooseOneEffect && isGreed
                    ? getTargetRuleFromEffects(nonChooseOneOnPlayEffects)
                    : chooseOneEffect
                    ? getTargetRuleFromEffects(chosenOptionEffects)
                    : getCardTargetRule(cardMeta);
            const needsTarget = Boolean(targetRule);
            if (needsTarget && targetRule) {
                const targetId = await requestTargetSelection(targetRule, 'カード対象を選択', { kind: 'card', cardId });
                if (!targetId) return;
                params.targets = [targetId];
            }

            if (curseId === 'rebuttal' && typeof handIndex === 'number' && Number.isFinite(handIndex)) {
                const currentHand = state?.hands?.[playerId] ?? [];
                const usedIndex = Math.floor(handIndex);
                const discardOptions = currentHand
                    .map((cid, idx) => ({ cid, idx }))
                    .filter((entry) => entry.idx !== usedIndex)
                    .map((entry) => ({
                        value: String(entry.idx),
                        label: CARD_LOOKUP.get(entry.cid)?.name ?? entry.cid,
                    }));
                const selected = await requestChooseOneSelection('反駁の呪い: 捨てる手札を選択', discardOptions);
                if (!selected) return;
                const discardIdx = Number.parseInt(selected, 10);
                if (!Number.isFinite(discardIdx)) {
                    alert('捨てる手札の指定が不正です。');
                    return;
                }
                choicesPayload = { ...(choicesPayload ?? {}), curseDiscardIndex: discardIdx };
            }
            if (cardMeta?.id === 'reconstruct') {
                const currentHand = state?.hands?.[playerId] ?? [];
                const usedIndex = typeof handIndex === 'number' && Number.isFinite(handIndex) ? Math.floor(handIndex) : -1;
                const remainingHand = currentHand.filter((_, idx) => idx !== usedIndex);
                if (remainingHand.length < 2) {
                    alert('再構築に必要な手札が足りません。');
                    return;
                }
                const buildDiscardOptions = (excludeIndexes: number[]) =>
                    remainingHand
                        .map((cid, idx) => ({ cid, idx }))
                        .filter((entry) => !excludeIndexes.includes(entry.idx))
                        .map((entry) => ({
                            value: String(entry.idx),
                            label: CARD_LOOKUP.get(entry.cid)?.name ?? entry.cid,
                        }));
                const firstSelected = await requestChooseOneSelection('再構築: 1枚目に捨てる手札を選択', buildDiscardOptions([]));
                if (!firstSelected) return;
                const firstIndex = Number.parseInt(firstSelected, 10);
                if (!Number.isFinite(firstIndex)) {
                    alert('再構築の手札指定が不正です。');
                    return;
                }
                const secondSelected = await requestChooseOneSelection('再構築: 2枚目に捨てる手札を選択', buildDiscardOptions([firstIndex]));
                if (!secondSelected) return;
                const secondIndex = Number.parseInt(secondSelected, 10);
                if (!Number.isFinite(secondIndex)) {
                    alert('再構築の手札指定が不正です。');
                    return;
                }
                choicesPayload = { ...(choicesPayload ?? {}), discardIndexes: [firstIndex, secondIndex] };
            }
            if (choicesPayload) {
                params.choices = choicesPayload;
            }
            if (
                sendWsAction({
                    k: 'match/play',
                    playerId,
                    cardId,
                    targets: params.targets,
                    choices: params.choices,
                    handIndex: params.handIndex,
                })
            ) {
                return;
            }
            throw new Error('WebSocket未接続のため、カードを使用できません。');
        } catch (err) {
            alert('カードをプレイできませんでした: ' + (err as Error).message);
        } finally {
            setSelectedTargetId(null);
            setSelectedStatChoice('');
        }
    };

    const handleRoleAttack = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        const attackRule: TargetRule = { mode: 'others', disallowDefeated: true };
        const targetId = await requestTargetSelection(attackRule, '攻撃対象を選択', { kind: 'roleAttack' });
        if (!targetId) return;
        const struggle = (braTokens[playerId] ?? 0) <= 0;
        try {
            const ok = sendWsAction({ k: 'match/roleAttack', playerId, targetId, struggle });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ロール攻撃できません。');
            }
        } catch (err) {
            alert('ロール攻撃に失敗しました: ' + (err as Error).message);
        } finally {
            setSelectedTargetId(null);
        }
    };

    const handleEndTurn = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        try {
            const ok = sendWsAction({ k: 'match/endTurn', playerId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ターン終了できません。');
            }
        } catch (err) {
            alert('ターン終了に失敗しました: ' + (err as Error).message);
        }
    };

    const handleRescueBra = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        if (!localPlayerRuntime || localMaxBra === null || rescueBraCost === null) {
            alert('プレイヤー状態の取得に失敗しました。');
            return;
        }
        if (!isCurrentPlayer(playerId)) {
            alert('自分のターンではありません。');
            return;
        }
        if (isLocalDefeated) {
            alert('脱落しています。');
            return;
        }
        if (localMaxBra > 0) {
            alert('この救済アクションは「最大Braが0のとき」のみ実行できます。');
            return;
        }

        try {
            const ok = sendWsAction({ k: 'match/rescueBra', playerId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、救済を実行できません。');
            }
        } catch (err) {
            alert('救済に失敗しました: ' + (err as Error).message);
        }
    };

    const handleEndMatchToLobby = React.useCallback(() => {
        if (!localPlayerId) {
            alert('操作するプレイヤーが設定されていません。');
            return;
        }
        const ok = sendWsAction({ k: 'match/end', playerId: localPlayerId } satisfies ActionPayload);
        if (!ok) {
            alert('WebSocket未接続のため、マッチを終了できません。');
        }
    }, [localPlayerId, sendWsAction]);

    const updateRoleActionChoice = React.useCallback((actionId: string, key: string, value: string) => {
        setRoleActionChoices((prev) => ({
            ...prev,
            [actionId]: {
                ...(prev[actionId] ?? {}),
                [key]: value,
            },
        }));
    }, []);

    const handleRoleAction = async (action: RoleActionDefinition) => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (isPromptBlocking) {
            alert('割り込み確認中のため操作できません。');
            return;
        }
        let targetId: string | undefined;
        if (action.requiresTarget) {
            const rule: TargetRule =
                action.requiresTarget === 'self'
                    ? { mode: 'self', disallowDefeated: true }
                    : action.requiresTarget === 'others'
                    ? { mode: 'others', disallowDefeated: true }
                    : { mode: 'any', disallowDefeated: true };
            const selected = await requestTargetSelection(rule, '対象プレイヤーを選択', {
                kind: 'roleAction',
                actionId: action.id,
            });
            if (!selected) return;
            targetId = selected;
        }
        setRoleActionBusy(true);
        try {
            let injectedChoices: Record<string, string | number | boolean> | undefined;
            if (action.id === 'vampire_blood_pattern') {
                const currentHand = state?.hands?.[playerId] ?? [];
                if (currentHand.length === 0) {
                    alert('手札がありません。');
                    return;
                }
                const options = currentHand.map((cid, idx) => ({
                    value: String(idx),
                    label: CARD_LOOKUP.get(cid)?.name ?? cid,
                }));
                const selected = await requestChooseOneSelection('血の紋様: 付与する手札を選択', options);
                if (!selected) return;
                const handIndex = Number.parseInt(selected, 10);
                if (!Number.isFinite(handIndex)) {
                    alert('手札の指定が不正です。');
                    return;
                }
                injectedChoices = { handIndex };
            }
            if (action.id === 'doctor_reshape') {
                const reshapeStats: Array<'atk' | 'def' | 'spe'> = ['atk', 'def', 'spe'];
                const statDown = await requestStatSelection('整形: 下げるステータスを選択', reshapeStats);
                if (!statDown) return;
                const statUp = await requestStatSelection(
                    '整形: 上げるステータスを選択',
                    reshapeStats.filter((stat) => stat !== statDown)
                );
                if (!statUp) return;
                injectedChoices = { ...(injectedChoices ?? {}), statDown, statUp };
            }
            // jester_random のスピン演出はログ検知(useEffect)側で統一する
            // （WS経由でもHTTP経由でも同じ挙動にするため）
            const choices = injectedChoices ?? roleActionChoices[action.id];
            const ok = sendWsAction({ k: 'match/roleAction', playerId, actionId: action.id, targetId, choices });
            if (!ok) {
                throw new Error('WebSocket未接続のため、ロールアクションを実行できません。');
            }
        } catch (err) {
            alert('ロールアクションの実行に失敗しました: ' + (err as Error).message);
        } finally {
            setRoleActionBusy(false);
            if (action.requiresTarget) {
                setSelectedTargetId(null);
            }
        }
    };

    const handlePromptChoice = async (accepted: boolean) => {
        if (!pendingPrompt || !localPlayer) {
            return;
        }
        if (!isPromptTarget) {
            alert('割り込み対象プレイヤーではありません。');
            return;
        }
        try {
            setPromptBusy(true);
            const ok = sendWsAction({ k: 'match/resolvePrompt', playerId: localPlayer.id, accepted });
            if (!ok) {
                throw new Error('WebSocket未接続のため、割り込みを処理できません。');
            }
        } catch (err) {
            alert('割り込みの処理に失敗しました: ' + (err as Error).message);
        } finally {
            setPromptBusy(false);
        }
    };

    const handleInfoDrawChoice = async (cardId: string) => {
        if (!pendingInfoDraw || !localPlayer) {
            return;
        }
        if (!isInfoDrawTarget) {
            alert('情報のカード選択対象ではありません。');
            return;
        }
        try {
            setInfoDrawBusy(true);
            const ok = sendWsAction({ k: 'match/resolveInfoDraw', playerId: localPlayer.id, cardId });
            if (!ok) {
                throw new Error('WebSocket未接続のため、情報のカード選択を処理できません。');
            }
        } catch (err) {
            alert('情報のカード選択に失敗しました: ' + (err as Error).message);
        } finally {
            setInfoDrawBusy(false);
        }
    };

    const getRoleActionAvailability = (action: RoleActionDefinition): { disabled: boolean; reason?: string } => {
        if (!localPlayer) {
            return { disabled: true, reason: '操作するプレイヤーがありません' };
        }
        if (isLocalDefeated) {
            return { disabled: true, reason: '脱落しています' };
        }
        if (!isCurrentPlayer(localPlayer.id)) {
            return { disabled: true, reason: '自分のターンではありません' };
        }
        if (roleActionBusy) {
            return { disabled: true, reason: '処理中です' };
        }
        const cost = action.costBra ?? 0;
        if (cost > 0 && currentBraValue < cost) {
            return { disabled: true, reason: 'Braが不足しています' };
        }
        const localHandCount = (hands[localPlayer.id] ?? []).length;
        if (action.id === 'tsunami_ultimate') {
            const requiredDiscardCount = getTargetCandidates({ mode: 'others', disallowDefeated: true }).length;
            if (localHandCount < requiredDiscardCount) {
                return {
                    disabled: true,
                    reason: `手札が不足しています（必要${requiredDiscardCount}枚）`,
                };
            }
        }
        if (action.id === 'meteor_ultimate' && localHandCount < 3) {
            return { disabled: true, reason: '手札が不足しています（必要3枚）' };
        }
        if (action.requiresTarget) {
            const rule: TargetRule =
                action.requiresTarget === 'self'
                    ? { mode: 'self', disallowDefeated: true }
                    : action.requiresTarget === 'others'
                    ? { mode: 'others', disallowDefeated: true }
                    : { mode: 'any', disallowDefeated: true };
            if (getTargetCandidates(rule).length === 0) {
                return { disabled: true, reason: '対象プレイヤーがいません' };
            }
        }
        if (action.id === 'doctor_surgery' && selectedTargetId) {
            const targetRuntime = runtimeStates[selectedTargetId];
            if (targetRuntime?.roleState?.surgeryPhase) {
                return { disabled: true, reason: '選択中のプレイヤーは手術中です' };
            }
        }
        if (action.choices?.length && action.id !== 'doctor_reshape') {
            const choiceValues = roleActionChoices[action.id] ?? {};
            for (const choice of action.choices) {
                if (!choiceValues[choice.key]) {
                    return { disabled: true, reason: '必要な選択肢を設定してください' };
                }
            }
            if (
                action.id === 'doctor_reshape' &&
                choiceValues.statDown &&
                choiceValues.statUp &&
                choiceValues.statDown === choiceValues.statUp
            ) {
                return { disabled: true, reason: '異なるステータスを選んでください' };
            }
        }
        if (action.id === 'discharge_release') {
            const charge = localPlayerRuntime?.roleState?.chargeTokens ?? 0;
            if (charge <= 0) {
                return { disabled: true, reason: 'チャージトークンがありません' };
            }
        }
        return { disabled: false };
    };

    const renderRoleActionChoiceControls = (action: RoleActionDefinition) => {
        if (!action.choices?.length) {
            return null;
        }
        if (action.id === 'doctor_reshape') {
            return null;
        }
        const choiceValues = roleActionChoices[action.id] ?? {};
        return (
            <div
                className={styles.choiceRow}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {action.choices.map((choice) => {
                    const options = choice.options ?? ROLE_ACTION_BASE_STATS;
                    return (
                        <label key={`${action.id}-${choice.key}`} className={styles.choiceLabel}>
                            {choice.label}
                            <select
                                value={choiceValues[choice.key] ?? ''}
                                onChange={(e) => updateRoleActionChoice(action.id, choice.key, e.target.value)}
                                className={styles.select}
                            >
                                <option value="">未選択</option>
                                {options.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                        </label>
                    );
                })}
            </div>
        );
    };

    const matchScale = Math.min(
        1,
        viewportSize.width / MATCH_DESIGN_WIDTH,
        viewportSize.height / MATCH_DESIGN_HEIGHT
    );
    const scaledCanvasWidth = Math.round(MATCH_DESIGN_WIDTH * matchScale);
    const scaledCanvasHeight = Math.round(MATCH_DESIGN_HEIGHT * matchScale);
    const pageScaleStyle: React.CSSProperties = {
        width: 1480,
        minWidth: 1480,
        maxWidth: 1480,
        height: MATCH_DESIGN_HEIGHT,
        minHeight: MATCH_DESIGN_HEIGHT,
        margin: '0 auto',
        padding: '18px 24px 20px',
        transform: `scale(${matchScale})`,
        transformOrigin: 'top left',
        overflow: 'hidden',
        backgroundImage: `linear-gradient(rgba(255,255,255,0.70), rgba(255,255,255,0.72)), url(${matchGameBgUrl})`,
        backgroundSize: '100% 82%',
        backgroundPosition: 'top center',
        backgroundRepeat: 'no-repeat',
    };

    return (
        <div className={styles.pageViewport}>
            <div className={styles.pageCanvasSlot} style={{ width: scaledCanvasWidth, height: scaledCanvasHeight }}>
                <div className={styles.page} style={pageScaleStyle}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Match {id}</h1>
                    <p className={styles.subtitle}>ロビーID: {id}</p>
                </div>
                <div className={styles.headerMeta}>
                    <div className={styles.helpButtons}>
                        <button
                            type="button"
                            className={styles.helpButton}
                            onClick={requestReconnect}
                            title="WebSocketを再接続します"
                        >
                            再接続
                        </button>
                        {isHost && state?.status === 'finished' && (
                            <button
                                type="button"
                                className={`${styles.helpButton} ${styles.hostEndButton}`}
                                onClick={handleEndMatchToLobby}
                                disabled={!wsConnected || isSpectator}
                                title="マッチを終了してロビーに戻ります（ホスト）"
                            >
                                ロビーに戻る
                            </button>
                        )}
                        <button type="button" className={styles.helpButton} onClick={() => setHelpOpen('roles')}>
                            ロール
                        </button>
                        <button type="button" className={styles.helpButton} onClick={() => setHelpOpen('rules')}>
                            ?
                        </button>
                        <button type="button" className={styles.helpButton} onClick={() => setHelpOpen('deck')}>
                            デッキ
                        </button>
                    </div>
                    <Link to="/" className={styles.backLink}>
                        ホームへ戻る
                    </Link>
                </div>
            </header>

            {error && <p className={styles.errorText}>エラー: {error}</p>}
            {!state && !error && <p>読み込み中...</p>}
            {pendingPrompt && (
                <MatchPendingPromptModal
                    pendingPrompt={pendingPrompt}
                    pendingPromptLabel={pendingPromptLabel ?? ''}
                    pendingCard={pendingCard}
                    pendingEffectType={pendingEffect?.type}
                    isPromptTarget={isPromptTarget}
                    promptBusy={promptBusy}
                    renderPlayerChip={renderPlayerChip}
                    onChoose={handlePromptChoice}
                />
            )}
            {pendingInfoDraw && (
                <MatchPendingInfoDrawModal
                    pendingInfoDraw={pendingInfoDraw}
                    pendingInfoDrawPlayer={pendingInfoDrawPlayer}
                    isInfoDrawTarget={isInfoDrawTarget}
                    infoDrawBusy={infoDrawBusy}
                    cardLookup={CARD_LOOKUP}
                    getCategoryLabel={getCategoryLabel}
                    getKindLabel={getKindLabel}
                    onChoose={handleInfoDrawChoice}
                />
            )}

            {damagePopup && (
                <MatchDamagePopup
                    damagePopup={damagePopup}
                    damagePopupDurationMs={DAMAGE_POPUP_DURATION_MS}
                    cardLookup={CARD_LOOKUP}
                    renderPlayerChip={renderPlayerChip}
                    onClose={closeDamagePopup}
                />
            )}

            <MatchFloatingOverlays
                actionToast={actionToast && !pendingPrompt && !pendingInfoDraw && !damagePopup ? formatLogEntry(actionToast) : null}
                tooltip={tooltip}
                jesterSpin={jesterSpin}
            />

            {state && (
                <div className={styles.matchGrid}>
                    <div className={styles.mainColumn}>
                        <section className={`${styles.sectionCard} ${styles.heroSection}`}>
                            <div className={styles.heroGrid}>
                                <div className={styles.heroSelfPanel}>
                                    {localPlayer ? (
                                        <ul className={styles.heroPlayerList}>
                                            <MatchPlayerCard
                                                key={localPlayer.id}
                                                player={localPlayer}
                                                teamMode={teamMode}
                                                runtime={runtimeStates[localPlayer.id]}
                                                round={state?.round}
                                                nextRoundPriority={state?.nextRoundPriority ?? null}
                                                roleLookup={ROLE_LOOKUP}
                                                installsForPlayer={installsByPlayer[localPlayer.id] ?? []}
                                                braTokenCount={braTokens[localPlayer.id] ?? 0}
                                                handCount={hands[localPlayer.id]?.length ?? 0}
                                                playerName={playerName}
                                                getTeamDef={getTeamDef}
                                                showFloatingTooltip={showFloatingTooltip}
                                                clearFloatingTooltip={clearFloatingTooltip}
                                            />
                                        </ul>
                                    ) : (
                                        <div className={styles.heroFallback}>
                                            {!wsConnected
                                                ? 'サーバー接続中…'
                                                : isSpectator
                                                ? '観戦中（操作不可）'
                                                : '操作権なし'}
                                        </div>
                                    )}
                                </div>

                                <MatchHeroActionPanel
                                    currentPlayerName={currentPlayerName}
                                    deckPileInfo={deckPileInfo}
                                    hasLocalPlayer={Boolean(localPlayer)}
                                    showRescueInDrawSlot={showRescueInDrawSlot}
                                    rescueBraCost={rescueBraCost}
                                    drawDisabled={
                                        localPlayer
                                            ? showRescueInDrawSlot
                                                ? !isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking
                                                : !isCurrentPlayer(localPlayer.id) ||
                                                  isLocalDefeated ||
                                                  isPromptBlocking ||
                                                  (braTokens[localPlayer.id] ?? 0) <= 0
                                            : true
                                    }
                                    roleAttackDisabled={roleAttackDisabled}
                                    endTurnDisabled={localPlayer ? !isCurrentPlayer(localPlayer.id) || isLocalDefeated || isPromptBlocking : true}
                                    attackIsStruggle={attackIsStruggle}
                                    attackButtonLabel={attackButtonLabel}
                                    isPromptBlocking={isPromptBlocking}
                                    localRoleActions={localRoleActions}
                                    visibleLocalRoleActions={visibleLocalRoleActions}
                                    localRoleActionPageCount={localRoleActionPageCount}
                                    safeRoleActionPage={safeRoleActionPage}
                                    onDrawOrRescue={() => (showRescueInDrawSlot ? handleRescueBra() : handleDraw(1))}
                                    onRoleAttack={handleRoleAttack}
                                    onEndTurn={handleEndTurn}
                                    onPrevRoleActionPage={() => setRoleActionPage((prev) => Math.max(0, prev - 1))}
                                    onNextRoleActionPage={() =>
                                        setRoleActionPage((prev) => Math.min(localRoleActionPageCount - 1, prev + 1))
                                    }
                                    onRoleAction={handleRoleAction}
                                    getRoleActionAvailability={getRoleActionAvailability}
                                    renderRoleActionChoiceControls={renderRoleActionChoiceControls}
                                    showFloatingTooltip={showFloatingTooltip}
                                    clearFloatingTooltip={clearFloatingTooltip}
                                />
                            </div>
                        </section>

                        {localPlayer && (
                            <MatchHandSection
                                hand={hands[localPlayer.id] ?? []}
                                cardLookup={CARD_LOOKUP}
                                handCardBgByCategory={HAND_CARD_BG_BY_CATEGORY}
                                sealedHandIndexSet={sealedHandIndexSet}
                                cursedHandIndexMap={cursedHandIndexMap}
                                bloodPatternIndexSet={bloodPatternIndexSet}
                                forcedHandIndexSet={forcedHandIndexSet}
                                currentBra={braTokens[localPlayer.id] ?? 0}
                                isCurrentTurn={isCurrentPlayer(localPlayer.id)}
                                isLocalDefeated={isLocalDefeated}
                                isPromptBlocking={isPromptBlocking}
                                onPlay={handlePlay}
                                onShowCardTooltip={showHandCardTooltip}
                                onHideTooltip={clearFloatingTooltip}
                            />
                        )}

                        <MatchPlayersSection
                            players={localPlayer ? otherPlayers : state.players}
                            localPlayerPresent={Boolean(localPlayer)}
                            wsConnected={wsConnected}
                            isSpectator={isSpectator}
                            teamMode={teamMode}
                            round={state?.round}
                            nextRoundPriority={state?.nextRoundPriority ?? null}
                            runtimeStates={runtimeStates}
                            roleLookup={ROLE_LOOKUP}
                            installsByPlayer={installsByPlayer}
                            braTokens={braTokens}
                            hands={hands}
                            playerName={playerName}
                            getTeamDef={getTeamDef}
                            showFloatingTooltip={showFloatingTooltip}
                            clearFloatingTooltip={clearFloatingTooltip}
                        />
                    </div>

                    <aside className={styles.sidebar}>
                        <MatchTurnLogPanel logs={logsToDisplay} formatLogEntry={formatLogEntry} />
                    </aside>
                </div>
            )}
                </div>
            </div>
            <MatchResultModal
                open={Boolean(matchResultOpen && state?.status === 'finished')}
                winnerText={winnerText}
                matchId={id}
                isHost={isHost}
                wsConnected={wsConnected}
                isSpectator={isSpectator}
                onClose={() => setMatchResultOpen(false)}
                onBackToLobby={handleEndMatchToLobby}
            />
            {selectionModal && (
                <MatchSelectionModal
                    modal={selectionModal}
                    targetItems={selectionTargetItems}
                    statOptions={STAT_OPTIONS}
                    onClose={closeSelection}
                />
            )}
            {helpOpen && (
                <MatchHelpModal
                    mode={helpOpen}
                    onClose={() => setHelpOpen(null)}
                    deckSearchText={deckSearchText}
                    onDeckSearchTextChange={setDeckSearchText}
                    deckCategoryFilter={deckCategoryFilter}
                    onDeckCategoryFilterChange={setDeckCategoryFilter}
                    deckZoneFilter={deckZoneFilter}
                    onDeckZoneFilterChange={setDeckZoneFilter}
                    deckInspectMode={deckInspectMode}
                    onDeckInspectModeChange={setDeckInspectMode}
                    deckSortKey={deckSortKey}
                    onDeckSortKeyChange={setDeckSortKey}
                    deckSortDir={deckSortDir}
                    onDeckSortDirChange={setDeckSortDir}
                    deckCounts={deckCounts}
                    deckCountsToDisplay={deckCountsToDisplay}
                    players={state?.players ?? []}
                    roleLookup={ROLE_LOOKUP}
                    getCategoryLabel={getCategoryLabel}
                    getKindLabel={getKindLabel}
                />
            )}
        </div>
    );
};

export default Match;
