import React from 'react';
import { useParams, Link } from 'react-router-dom';
import type {
    CardDefinition,
    CardEffect,
    CardTarget,
    GameLogEntry,
    GameState,
    Player,
    PlayerRuntimeState,
    RoleActionDefinition,
    StatKey,
} from '@shared/types';
import { drawCards, endTurn, getMatch, playCard, roleAction as performRoleAction, roleAttack } from '@client/api/matches';
import cardsCatalogRaw from '../../../data/cards.json';
import rolesCatalogRaw from '../../../data/roles.json';
import { clearRememberedMatchPlayer, getRememberedMatchPlayer, rememberMatchPlayer } from '@client/utils/matchPlayer';
import { getRoleActions, ROLE_ACTION_BASE_STATS } from '@shared/roleActions';

type CardsFile = {
    cards: CardDefinition[];
};

type RoleEntry = {
    id: string;
    name: string;
    params: {
        hp: number;
        atk: number;
        def: number;
        spe: number;
        bra: number;
    };
    text?: string;
};

type RolesFile = {
    roles: RoleEntry[];
};

const CARD_LOOKUP = new Map<string, CardDefinition>(((cardsCatalogRaw as CardsFile).cards ?? []).map((card) => [card.id, card]));
const ROLE_LOOKUP = new Map<string, RoleEntry>(((rolesCatalogRaw as RolesFile).roles ?? []).map((role) => [role.id, role]));
const statusColors: Record<string, string> = {
    waiting: '#eab308',
    inProgress: '#22c55e',
    finished: '#ef4444',
};
const STAT_OPTIONS: Array<'atk' | 'def' | 'spe' | 'bra'> = ['atk', 'def', 'spe', 'bra'];

const effectHasTarget = (effect: CardEffect): effect is CardEffect & { target: CardTarget } => 'target' in effect;

const cardNeedsTarget = (card?: CardDefinition | null): boolean =>
    Boolean(
        card?.effects?.some(
            (effect) => effectHasTarget(effect) && (effect.target === 'chosen_enemy' || effect.target === 'chosen_player')
        )
    );

const cardNeedsStatChoice = (card?: CardDefinition | null): boolean =>
    Boolean(card?.effects?.some((effect) => effect.type === 'doubleBaseStat'));

type StatusEffectChip = {
    key: string;
    icon: string;
    label: string;
    value?: number | string;
    color: string;
    tooltip: string;
};

const buildStatusEffects = (runtime?: PlayerRuntimeState, roleId?: string): StatusEffectChip[] => {
    if (!runtime?.roleState) return [];
    const { roleState } = runtime;
    const effects: StatusEffectChip[] = [];

    if ((roleState.burnStacks ?? 0) > 0) {
        const burn = roleState.burnStacks ?? 0;
        effects.push({
            key: 'burn',
            icon: '🔥',
            label: '炎上',
            value: burn,
            color: '#f97316',
            tooltip:
                roleId === 'flame'
                    ? `炎上${burn}: ターン終了時に${burn}回復し、炎上-1`
                    : `炎上${burn}: ターン終了時に${burn}ダメージを受け、炎上-1`,
        });
    }

    if ((roleState.shockTokens ?? 0) > 0) {
        const shock = roleState.shockTokens ?? 0;
        effects.push({
            key: 'shock',
            icon: '⚡',
            label: '感電',
            value: shock,
            color: '#eab308',
            tooltip: `感電${shock}: 5ごとにBraを1失い、その分感電を消費`,
        });
    }

    if (roleState.surgeryPhase === 'immobilize') {
        effects.push({
            key: 'surgery-immobilize',
            icon: '🩺',
            label: '手術準備中',
            color: '#a855f7',
            tooltip: '次のターンは行動不可（手術中）',
        });
    } else if (roleState.surgeryPhase === 'heal') {
        effects.push({
            key: 'surgery-heal',
            icon: '❤️‍🩹',
            label: '手術回復待ち',
            color: '#a855f7',
            tooltip: '次のターン開始時にHP+15',
        });
    }

    if ((roleState.pendingBraPenalty ?? 0) > 0) {
        const pen = roleState.pendingBraPenalty ?? 0;
        effects.push({
            key: 'anesthesia',
            icon: '💉',
            label: '麻酔',
            value: pen,
            color: '#38bdf8',
            tooltip: `次のターン Bra-${pen}`,
        });
    }

    return effects;
};

type PlayChoicesPayload = Record<string, string | number | boolean | string[] | number[]>;

const groupInstallsByPlayer = (
    runtimeStates: Record<string, PlayerRuntimeState | undefined>,
    cardLookup: Map<string, CardDefinition>
): Record<
    string,
    Array<{ instanceId: string; cardId: string; name: string; text?: string; category?: string; kind?: string }>
> => {
    const result: Record<
        string,
        Array<{ instanceId: string; cardId: string; name: string; text?: string; category?: string; kind?: string }>
    > = {};
    Object.entries(runtimeStates).forEach(([playerId, runtime]) => {
        if (!runtime || !runtime.installs.length) {
            return;
        }
        result[playerId] = runtime.installs.map((install) => {
            const cardInfo = cardLookup.get(install.cardId);
            return {
                instanceId: install.instanceId,
                cardId: install.cardId,
                name: cardInfo?.name ?? install.cardId,
                text: cardInfo?.text,
                category: cardInfo?.category,
                kind: cardInfo?.kind,
            };
        });
    });
    return result;
};

type StoredPlayerInfo = ReturnType<typeof getRememberedMatchPlayer>;

const Match: React.FC = () => {
    const { id } = useParams();
    const [state, setState] = React.useState<GameState | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [localPlayerInfo, setLocalPlayerInfo] = React.useState<StoredPlayerInfo>(() => {
        if (typeof window === 'undefined' || !id) return null;
        return getRememberedMatchPlayer(id);
    });
    const [customCardId, setCustomCardId] = React.useState('');
    const [hoverCardKey, setHoverCardKey] = React.useState<string | null>(null);
    const [hoveredPlayerId, setHoveredPlayerId] = React.useState<string | null>(null);
    const [selectedTargetId, setSelectedTargetId] = React.useState<string | null>(null);
    const [selectedStatChoice, setSelectedStatChoice] = React.useState<'atk' | 'def' | 'spe' | 'bra' | ''>('');
    const [roleActionChoices, setRoleActionChoices] = React.useState<Record<string, Record<string, string>>>({});
    const [roleActionBusy, setRoleActionBusy] = React.useState(false);
    const localPlayerId = localPlayerInfo?.id ?? null;
    const localPlayerName = localPlayerInfo?.name;

    const refresh = React.useCallback(() => {
        if (!id) return;
        getMatch(id)
            .then(({ state }) => {
                setState(state);
                if (localPlayerId && !state.players.some((p) => p.id === localPlayerId)) {
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
                }
            })
            .catch((e) => setError((e as Error).message));
    }, [id, localPlayerId, localPlayerName]);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    React.useEffect(() => {
        if (!id) return;
        const timer = setInterval(() => {
            refresh();
        }, 2000);
        return () => clearInterval(timer);
    }, [id, refresh]);

    React.useEffect(() => {
        if (!state || state.players.length === 0) return;
        if (selectedTargetId && state.players.some((p) => p.id === selectedTargetId)) {
            return;
        }
        const fallback =
            state.players.find((p) => p.id !== localPlayerId)?.id ??
            state.players[0]?.id ??
            null;
        setSelectedTargetId(fallback ?? null);
    }, [state, localPlayerId, selectedTargetId]);

    if (!id) {
        return <div style={{ padding: 16 }}>マッチIDが不正です。</div>;
    }

    const currentPlayerId = state?.currentPlayerId ?? state?.turnOrder?.[state?.currentTurn ?? 0];
    const isCurrentPlayer = (playerId: string) => currentPlayerId === playerId;
    const hands = state?.hands ?? {};
    const runtimeStates = state?.board?.playerStates ?? {};
    const installsByPlayer = React.useMemo(
        () => (state ? groupInstallsByPlayer(runtimeStates, CARD_LOOKUP) : {}),
        [state, runtimeStates]
    );
    const playerName = React.useCallback(
        (pid: string | undefined) => state?.players.find((p) => p.id === pid)?.name ?? '不明なプレイヤー',
        [state?.players]
    );
    const isPlayerDefeated = (pid: string) => Boolean(runtimeStates[pid]?.isDefeated);
    const braTokens = state?.braTokens ?? {};
    const roleAttackUsed = state?.roleAttackUsed ?? {};
    const logs: GameLogEntry[] = state?.logs ?? [];
    const logsToDisplay = [...logs].slice(-20).reverse();
    const deckInfo = `${state?.sharedDeck.length ?? 0}枚 / 捨て札 ${state?.sharedDiscard.length ?? 0}枚`;
    const currentPlayerName = state?.players.find((p) => p.id === currentPlayerId)?.name ?? '未設定';
    const localPlayer = state?.players.find((p) => p.id === localPlayerId) ?? null;
    const localPlayerRuntime = localPlayerId ? runtimeStates[localPlayerId] : undefined;
    const isLocalDefeated = Boolean(localPlayerRuntime?.isDefeated);
    const localRoleActions = getRoleActions(localPlayer?.roleId);
    const dischargeExists = Boolean(state?.players.some((p) => p.roleId === 'discharge'));

    React.useEffect(() => {
        setRoleActionChoices({});
    }, [localPlayer?.roleId]);

    const requireLocalPlayer = (): string | null => {
        if (!localPlayerId) {
            alert('操作するプレイヤーが設定されていません。');
            return null;
        }
        return localPlayerId;
    };

    const selectedTargetIsSelf = selectedTargetId === localPlayerId;
    const selectedTargetDefeated = selectedTargetId ? isPlayerDefeated(selectedTargetId) : false;
    const currentBraValue = localPlayerId ? braTokens[localPlayerId] ?? 0 : 0;
    const attackIsStruggle = currentBraValue <= 0;
    const attackButtonLabel = attackIsStruggle ? '悪あがき' : 'ロール攻撃';
    const roleAttackAlreadyUsed = localPlayerId ? Boolean(roleAttackUsed[localPlayerId]) : true;
    const canAttackTarget =
        !!selectedTargetId && !selectedTargetIsSelf && !selectedTargetDefeated && state?.players.some((p) => p.id === selectedTargetId);
    const roleAttackDisabled =
        !localPlayer ||
        isLocalDefeated ||
        !isCurrentPlayer(localPlayer.id) ||
        roleAttackAlreadyUsed ||
        !canAttackTarget;
    const describeTargets = (ids?: string[]) => {
        if (!ids || ids.length === 0) {
            return '';
        }
        return ids.map((pid) => playerName(pid)).join(', ');
    };
    const formatLogEntry = (entry: GameLogEntry): string => {
        switch (entry.type) {
            case 'turnStart':
                return `${playerName(entry.playerId)}のターン開始`;
            case 'cardPlay': {
                const cardInfo = CARD_LOOKUP.get(entry.cardId);
                const targetText = describeTargets(entry.targets);
                const cardName = cardInfo?.name ?? entry.cardId;
                return `${playerName(entry.playerId)}がカード「${cardName}」を${targetText ? `${targetText}に` : ''}使用`;
            }
            case 'roleAttack': {
                const detail = entry.isStruggle ? '（悪あがき）' : '';
                const base = `${playerName(entry.attackerId)}が${playerName(entry.targetId)}にロール攻撃${detail} - ${entry.damage}ダメージ`;
                return entry.selfInflicted ? `${base} / 自傷 ${entry.selfInflicted}` : base;
            }
            case 'roleAttackHit': {
                return `${playerName(entry.attackerId)}の連撃 ${entry.hitIndex}/${entry.totalHits} → ${playerName(entry.targetId)} に ${entry.damage}ダメージ`;
            }
            case 'playerDefeated':
                return `${playerName(entry.playerId)}が脱落`;
            case 'roleAction': {
                const desc = entry.description ?? entry.actionId;
                const target = entry.targetId ? ` → ${playerName(entry.targetId)}` : '';
                return `${playerName(entry.playerId)}が${desc}${target}`;
            }
            case 'statusEffect': {
                const kindText = entry.kind === 'heal' ? '回復' : 'ダメージ';
                return `${playerName(entry.playerId)}の炎上: ${entry.amount}${kindText}`;
            }
            default:
                return '';
        }
    };

    const handleDraw = async (count = 1) => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        try {
            const { state } = await drawCards(id, playerId, count);
            setState(state);
        } catch (err) {
            alert('ドローに失敗しました: ' + (err as Error).message);
        }
    };

    const handlePlay = async (cardId: string) => {
        const playerId = requireLocalPlayer();
        if (!playerId || !cardId) return;
        const cardMeta = CARD_LOOKUP.get(cardId);
        const needsTarget = cardNeedsTarget(cardMeta);
        const needsStatChoice = cardNeedsStatChoice(cardMeta);
        if (needsTarget && !selectedTargetId) {
            alert('このカードを使うには対象プレイヤーを選択してください。');
            return;
        }
        if (needsStatChoice && !selectedStatChoice) {
            alert('このカードを使うには強化するステータスを選択してください。');
            return;
        }
        const optionalEffectIndexes =
            cardMeta?.effects?.reduce<number[]>((acc, effect, index) => {
                if (effect?.optional) {
                    acc.push(index);
                }
                return acc;
            }, []) ?? [];
        try {
            const params: { targets?: string[]; choices?: PlayChoicesPayload } = {};
            if (needsTarget && selectedTargetId) {
                params.targets = [selectedTargetId];
            }
            let choicesPayload: PlayChoicesPayload | undefined;
            if (needsStatChoice && selectedStatChoice) {
                choicesPayload = { ...(choicesPayload ?? {}), stat: selectedStatChoice };
            }
            if (optionalEffectIndexes.length > 0) {
                const promptText = `${cardMeta?.name ?? cardId} の任意効果を発動しますか？`;
                const shouldActivate = window.confirm(promptText);
                if (shouldActivate) {
                    choicesPayload = { ...(choicesPayload ?? {}), optionalEffects: optionalEffectIndexes };
                }
            }
            if (choicesPayload) {
                params.choices = choicesPayload;
            }
            const { state } = await playCard(id, playerId, cardId, params);
            setState(state);
        } catch (err) {
            alert('カードをプレイできませんでした: ' + (err as Error).message);
        }
    };

    const handleRoleAttack = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        if (!selectedTargetId || selectedTargetId === playerId) {
            alert('攻撃対象を選択してください。');
            return;
        }
        if (isPlayerDefeated(selectedTargetId)) {
            alert('倒れているプレイヤーは対象にできません。');
            return;
        }
        const struggle = (braTokens[playerId] ?? 0) <= 0;
        try {
            const { state } = await roleAttack(id, playerId, selectedTargetId, struggle);
            setState(state);
        } catch (err) {
            alert('ロール攻撃に失敗しました: ' + (err as Error).message);
        }
    };

    const handleEndTurn = async () => {
        const playerId = requireLocalPlayer();
        if (!playerId) return;
        try {
            const { state } = await endTurn(id, playerId);
            setState(state);
        } catch (err) {
            alert('ターン終了に失敗しました: ' + (err as Error).message);
        }
    };

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
        const targetId = action.requiresTarget ? selectedTargetId : undefined;
        setRoleActionBusy(true);
        try {
            const { state } = await performRoleAction(id, playerId, action.id, {
                targetId: targetId ?? undefined,
                choices: roleActionChoices[action.id],
            });
            setState(state);
        } catch (err) {
            alert('ロールアクションの実行に失敗しました: ' + (err as Error).message);
        } finally {
            setRoleActionBusy(false);
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
        if (action.requiresTarget) {
            if (!selectedTargetId) {
                return { disabled: true, reason: '対象を選択してください' };
            }
            if (action.requiresTarget === 'self' && selectedTargetId !== localPlayer.id) {
                return { disabled: true, reason: '自分を対象にしてください' };
            }
            if (action.requiresTarget === 'others' && selectedTargetId === localPlayer.id) {
                return { disabled: true, reason: '自分以外を対象にしてください' };
            }
            if (selectedTargetId && isPlayerDefeated(selectedTargetId)) {
                return { disabled: true, reason: '脱落したプレイヤーは対象にできません' };
            }
        }
        if (action.id === 'doctor_surgery' && selectedTargetId) {
            const targetRuntime = runtimeStates[selectedTargetId];
            if (targetRuntime?.roleState?.surgeryPhase) {
                return { disabled: true, reason: '選択中のプレイヤーは手術中です' };
            }
        }
        if (action.choices?.length) {
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
                return { disabled: true, reason: '異なるステータスを選択してください' };
            }
        }
        if (action.id === 'discharge_release') {
            const charge = localPlayerRuntime?.roleState?.chargeTokens ?? 0;
            if (charge <= 0) {
                return { disabled: true, reason: '蓄電トークンがありません' };
            }
        }
        return { disabled: false };
    };

    const renderRoleActionChoiceControls = (action: RoleActionDefinition) => {
        if (!action.choices?.length) {
            return null;
        }
        const choiceValues = roleActionChoices[action.id] ?? {};
        return (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {action.choices.map((choice) => {
                    const options = choice.options ?? ROLE_ACTION_BASE_STATS;
                    return (
                        <label
                            key={`${action.id}-${choice.key}`}
                            style={{ fontSize: 11, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}
                        >
                            {choice.label}
                            <select
                                value={choiceValues[choice.key] ?? ''}
                                onChange={(e) => updateRoleActionChoice(action.id, choice.key, e.target.value)}
                                style={{ padding: 6, borderRadius: 8, border: '1px solid #cbd5f5', minWidth: 140 }}
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

    const renderPlayerCard = (player: Player) => {
        const controlling = localPlayerId === player.id;
        const roleInfo = player.roleId ? ROLE_LOOKUP.get(player.roleId) : undefined;
        const runtime = runtimeStates[player.id];
        const roleRuntime = runtime?.roleState;
        const surgeryPhase = roleRuntime?.surgeryPhase;
        const surgeryText =
            surgeryPhase === 'immobilize'
                ? '手術準備中（次のターンは行動不可）'
                : surgeryPhase === 'heal'
                ? '手術回復待ち（次のターン開始時にHP+15）'
                : null;
        const chargeTokens = roleRuntime?.chargeTokens ?? 0;
        const shockTokens = roleRuntime?.shockTokens ?? 0;
        const statusEffects = buildStatusEffects(runtime, player.roleId);
        const stats = runtime
            ? {
                  hp: `${runtime.hp} / ${runtime.maxHp}`,
                  tempHp: runtime.tempHp,
                  atk: runtime.baseStats.atk + runtime.statTokens.atk + runtime.turnBoosts.atk,
                  def: runtime.baseStats.def + runtime.statTokens.def + runtime.turnBoosts.def,
                  spe: runtime.baseStats.spe + runtime.statTokens.spe + runtime.turnBoosts.spe,
                  bra: runtime.baseStats.bra + runtime.statTokens.bra + runtime.turnBoosts.bra,
              }
            : roleInfo?.params
            ? {
                  hp: `${roleInfo.params.hp}`,
                  tempHp: 0,
                  atk: roleInfo.params.atk,
                  def: roleInfo.params.def,
                  spe: roleInfo.params.spe,
                  bra: roleInfo.params.bra,
              }
            : null;
        const showDetail = runtime && hoveredPlayerId === player.id;
        const installsForPlayer = installsByPlayer[player.id] ?? [];
        return (
            <li
                key={player.id}
                style={{
                    borderRadius: 16,
                    padding: 16,
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 15px rgba(15,23,42,0.05)',
                }}
                onMouseEnter={() => setHoveredPlayerId(player.id)}
                onMouseLeave={() => setHoveredPlayerId((prev) => (prev === player.id ? null : prev))}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{player.name}</div>
                        <div style={{ fontSize: 13, color: '#475569' }}>
                            ロール: {roleInfo?.name ?? '未選択'}
                        </div>
                    </div>
                    {controlling && (
                        <span style={{ padding: '6px 12px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', fontSize: 12 }}>このタブが操作中</span>
                    )}
                </div>
                {stats && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#475569' }}>
                        <span>
                            HP {stats.hp}
                            {runtime && runtime.tempHp > 0 && ` (+Temp ${runtime.tempHp})`}
                        </span>
                        <span>Atk {stats.atk}</span>
                        <span>Def {stats.def}</span>
                        <span>Spe {stats.spe}</span>
                        <span>Bra {stats.bra}</span>
                    </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                    Bra 残り: {braTokens[player.id] ?? 0} / 手札 {hands[player.id]?.length ?? 0} 枚
                </div>
                {dischargeExists && (chargeTokens > 0 || shockTokens > 0) && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#1e293b' }}>
                        {player.roleId === 'discharge' && chargeTokens > 0 && <span>蓄電: {chargeTokens}</span>}
                        {shockTokens > 0 && (
                            <span style={{ marginLeft: player.roleId === 'discharge' && chargeTokens > 0 ? 8 : 0 }}>
                                感電: {shockTokens}
                            </span>
                        )}
                    </div>
                )}
                {runtime?.isDefeated && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>戦闘不能</div>
                )}
                {statusEffects.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {statusEffects.map((effect) => (
                            <span
                                key={`${player.id}-${effect.key}`}
                                title={effect.tooltip}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    background: effect.color,
                                    color: '#0f172a',
                                    fontSize: 11,
                                    fontWeight: 700,
                                }}
                            >
                                <span aria-hidden>{effect.icon}</span>
                                <span>{effect.label}</span>
                                {effect.value !== undefined && <span>{effect.value}</span>}
                            </span>
                        ))}
                    </div>
                )}
                {roleInfo?.text && (
                    <p style={{ marginTop: 8, fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{roleInfo.text}</p>
                )}
                {showDetail && runtime && (
                    <div
                        style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 12,
                            background: '#0f172a',
                            color: '#e2e8f0',
                            fontSize: 12,
                        }}
                    >
                        <strong>基礎 / 追加トークン内訳</strong>
                        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                            {STAT_OPTIONS.map((stat) => {
                                const base = runtime.baseStats[stat];
                                const token = runtime.statTokens[stat];
                                const boost = runtime.turnBoosts[stat];
                                const sum = base + token + boost;
                                return (
                                    <div key={`${player.id}-${stat}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                        <span style={{ textTransform: 'uppercase' }}>{stat}</span>
                                        <span>
                                            基礎 {base}
                                            {token !== 0 && ` / トークン ${token > 0 ? `+${token}` : token}`}
                                            {boost !== 0 && ` / ブースト ${boost > 0 ? `+${boost}` : boost}`}
                                            <strong style={{ marginLeft: 4 }}>⇒ {sum}</strong>
                                        </span>
                                    </div>
                                );
                            })}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                <span>TempHP</span>
                                <span>{runtime.tempHp}</span>
                            </div>
                        </div>
                        {installsForPlayer.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                                <strong>設置カード</strong>
                                <ul style={{ marginTop: 8, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {installsForPlayer.map((install) => (
                                        <li key={install.instanceId} style={{ lineHeight: 1.4 }}>
                                            {install.name}
                                            {install.category && (
                                                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>{install.category}</span>
                                            )}
                                            {install.text && <div style={{ fontSize: 11, color: '#cbd5f5' }}>{install.text}</div>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </li>
        );
    };

    const handWrapperStyle: React.CSSProperties = {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
    };

    const cardButtonStyle = (active: boolean): React.CSSProperties => ({
        position: 'relative',
        border: '1px solid #cbd5f5',
        borderRadius: 12,
        padding: '12px 14px',
        textAlign: 'left',
        background: active ? 'linear-gradient(135deg, #1d4ed8, #9333ea)' : '#f1f5f9',
        color: active ? '#fff' : '#0f172a',
        cursor: active ? 'pointer' : 'not-allowed',
        boxShadow: active ? '0 6px 15px rgba(37, 99, 235, 0.35)' : 'none',
        minHeight: 150,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        justifyContent: 'space-between',
    });

    const tooltipStyle: React.CSSProperties = {
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 8,
        background: '#0f172a',
        color: '#fff',
        padding: '8px 10px',
        borderRadius: 8,
        width: 240,
        zIndex: 5,
        boxShadow: '0 6px 12px rgba(15, 23, 42, 0.25)',
        fontSize: 12,
    };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: 26 }}>Match {id}</h1>
                <Link to="/">ロビーへ戻る</Link>
            </div>
            {error && <p style={{ color: '#b91c1c' }}>エラー: {error}</p>}
            {!state && !error && <p>読み込み中...</p>}
            {state && (
                <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 180 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>ステータス</div>
                            <div style={{ fontWeight: 700, color: statusColors[state.status] ?? '#0f172a', fontSize: 20 }}>{state.status}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 220 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>現在の手番</div>
                            <div style={{ fontWeight: 700, fontSize: 20 }}>{currentPlayerName}</div>
                        </div>
                        <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: 220 }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>山札 / 捨て札</div>
                            <div style={{ fontWeight: 700, fontSize: 20 }}>{deckInfo}</div>
                        </div>
                        <button onClick={refresh} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #cbd5f5', background: '#fff' }}>
                            手動更新
                        </button>
                    </div>

                    <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h2 style={{ margin: 0 }}>プレイヤー一覧</h2>
                        {localPlayer ? <span style={{ color: '#16a34a' }}>このタブは {localPlayer.name} を操作中</span> : <span style={{ color: '#b91c1c' }}>このタブには操作権がありません</span>}
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
                        {state.players.map((player) => renderPlayerCard(player))}
                    </ul>
                </section>

                {!localPlayer && (
                    <section style={{ border: '1px dashed #fecaca', borderRadius: 16, padding: 16, background: '#fff7ed' }}>
                        <p style={{ margin: 0, color: '#b45309' }}>このブラウザは観戦モードです。ロビー参加時に割り当てられたプレイヤーのみ操作できます。</p>
                    </section>
                )}

                    {localPlayer && (
                        <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                            <h2 style={{ marginTop: 0 }}>{localPlayer.name} の操作</h2>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                                <button
                                    onClick={() => handleDraw(1)}
                                    disabled={!isCurrentPlayer(localPlayer.id) || isLocalDefeated}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: isCurrentPlayer(localPlayer.id) && !isLocalDefeated ? '#2563eb' : '#94a3b8',
                                        color: '#fff',
                                    }}
                                >
                                    1枚ドロー
                                </button>
                                <button
                                    onClick={handleRoleAttack}
                                    disabled={roleAttackDisabled}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: 'none',
                                        background: roleAttackDisabled ? '#94a3b8' : attackIsStruggle ? '#f97316' : '#22c55e',
                                        color: '#fff',
                                    }}
                                >
                                    {attackButtonLabel}
                                </button>
                                <button
                                    onClick={handleEndTurn}
                                    disabled={!isCurrentPlayer(localPlayer.id) || isLocalDefeated}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: 8,
                                        border: '1px solid #cbd5f5',
                                        background: isCurrentPlayer(localPlayer.id) && !isLocalDefeated ? '#fff8e1' : '#fff',
                                    }}
                                >
                                    ターンを終了
                                </button>
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <label style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    カード対象
                                    <select
                                        value={selectedTargetId ?? ''}
                                        onChange={(e) => setSelectedTargetId(e.target.value || null)}
                                        style={{ padding: 6, borderRadius: 8, border: '1px solid #cbd5f5', minWidth: 160 }}
                                    >
                                        <option value="">対象未選択</option>
                                        {(state?.players ?? []).map((player) => (
                                            <option key={player.id} value={player.id} disabled={isPlayerDefeated(player.id)}>
                                                {player.name}
                                                {isPlayerDefeated(player.id) ? ' (脱落)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label style={{ fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    ステータス選択（必要時）
                                    <select
                                        value={selectedStatChoice}
                                        onChange={(e) => setSelectedStatChoice((e.target.value as typeof selectedStatChoice) || '')}
                                        style={{ padding: 6, borderRadius: 8, border: '1px solid #cbd5f5', minWidth: 160 }}
                                    >
                                        <option value="">未選択</option>
                                        {STAT_OPTIONS.map((stat) => (
                                            <option key={stat} value={stat}>
                                                {stat.toUpperCase()}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            {localRoleActions.length > 0 && (
                                <div style={{ marginTop: 16, width: '100%' }}>
                                    <h3 style={{ margin: '8px 0', fontSize: 16 }}>ロール専用アクション</h3>
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        {localRoleActions.map((action) => {
                                            const availability = getRoleActionAvailability(action);
                                            return (
                                                <div
                                                    key={action.id}
                                                    style={{
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 12,
                                                        padding: 12,
                                                        background: '#f8fafc',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                                        <strong>{action.label}</strong>
                                                        <span style={{ fontSize: 12, color: '#475569' }}>Bra消費: {action.costBra ?? 0}</span>
                                                    </div>
                                                    {action.description && (
                                                        <p style={{ marginTop: 6, fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{action.description}</p>
                                                    )}
                                                    {action.requiresTarget && (
                                                        <div style={{ fontSize: 11, color: '#475569' }}>
                                                            対象: {selectedTargetId ? playerName(selectedTargetId) : '未選択'}
                                                        </div>
                                                    )}
                                                    {renderRoleActionChoiceControls(action)}
                                                    <button
                                                        onClick={() => handleRoleAction(action)}
                                                        disabled={availability.disabled}
                                                        style={{
                                                            marginTop: 8,
                                                            padding: '6px 12px',
                                                            borderRadius: 8,
                                                            border: 'none',
                                                            background: availability.disabled ? '#cbd5f5' : '#34d399',
                                                            color: '#0f172a',
                                                            cursor: availability.disabled ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        実行
                                                    </button>
                                                    {availability.disabled && availability.reason && (
                                                        <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626' }}>{availability.reason}</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div>
                                <h3>手札</h3>
                                <div style={handWrapperStyle}>
                                    {(hands[localPlayer.id] ?? []).length === 0 && <span style={{ color: '#94a3b8' }}>手札なし</span>}
                                    {(hands[localPlayer.id] ?? []).map((cardId, idx) => {
                                        const cardKey = `${cardId}-${idx}`;
                                        const info = CARD_LOOKUP.get(cardId);
                                        const targetRequired = cardNeedsTarget(info);
                                        const statChoiceRequired = cardNeedsStatChoice(info);
                                        const canPlay =
                                            isCurrentPlayer(localPlayer.id) &&
                                            !isLocalDefeated &&
                                            (braTokens[localPlayer.id] ?? 0) > 0 &&
                                            (!targetRequired || !!selectedTargetId) &&
                                            (!statChoiceRequired || !!selectedStatChoice);
                                        return (
                                            <div
                                                key={cardKey}
                                                style={{ position: 'relative', width: 180 }}
                                                onMouseEnter={() => setHoverCardKey(cardKey)}
                                                onMouseLeave={() => setHoverCardKey((prev) => (prev === cardKey ? null : prev))}
                                            >
                                                <button onClick={() => handlePlay(cardId)} disabled={!canPlay} style={cardButtonStyle(canPlay)}>
                                                    <div style={{ fontSize: 12, opacity: 0.8 }}>{info?.category?.toUpperCase() ?? 'CARD'} ・ {info?.kind ?? 'skill'}</div>
                                                    <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{info?.name ?? cardId}</div>
                                                    <div style={{ fontSize: 12, marginTop: 4 }}>コスト {info?.cost ?? 1}</div>
                                                </button>
                                                {hoverCardKey === cardKey && (
                                                    <div style={tooltipStyle}>
                                                        <strong>{info?.name ?? cardId}</strong>
                                                        <p style={{ marginTop: 4, lineHeight: 1.4 }}>{info?.text ?? '説明がありません。'}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                    <input
                                        value={customCardId}
                                        onChange={(e) => setCustomCardId(e.target.value)}
                                        placeholder="カードIDを入力"
                                        style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                    />
                                    <button
                                        onClick={() => handlePlay(customCardId)}
                                        disabled={!isCurrentPlayer(localPlayer.id) || !customCardId || isLocalDefeated}
                                        style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5f5', background: '#fff' }}
                                    >
                                        入力カードをプレイ
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                        <h2 style={{ marginTop: 0 }}>ターンログ</h2>
                        {logsToDisplay.length === 0 ? (
                            <p style={{ color: '#94a3b8', margin: 0 }}>まだログはありません。</p>
                        ) : (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {logsToDisplay.map((entry, idx) => (
                                    <li
                                        key={`${entry.type}-${entry.timestamp}-${idx}`}
                                        style={{
                                            padding: '6px 8px',
                                            borderRadius: 8,
                                            background: '#f8fafc',
                                            border: '1px solid #e2e8f0',
                                            fontSize: 12,
                                            color: '#0f172a',
                                        }}
                                    >
                                        {formatLogEntry(entry)}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default Match;
