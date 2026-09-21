import React from 'react';
import type { Player, PlayerRuntimeState, TeamColor } from '@shared/types';
import { buildStatusEffects, getStatusChipBucket, sortChips, type StatusEffectChip } from './matchHelpers';
import type { RoleEntry } from './matchStatic';
import { getCategoryLabel, getKindLabel } from './matchStatic';
import styles from './Match.module.css';

export type InstallInfo = {
    instanceId: string;
    cardId: string;
    name: string;
    text?: string;
    category?: string;
    kind?: string;
};

export type TeamVisual = {
    id: TeamColor;
    label: string;
    bg: string;
    border: string;
    text: string;
};

type MatchPlayerCardProps = {
    player: Player;
    teamMode: boolean;
    runtime?: PlayerRuntimeState;
    round?: number;
    nextRoundPriority?: {
        playerId: string;
        applyOnRound: number;
    } | null;
    roleLookup: Map<string, RoleEntry>;
    installsForPlayer: InstallInfo[];
    braTokenCount: number;
    handCount: number;
    playerName: (playerId: string | undefined) => string;
    getTeamDef: (team?: TeamColor | null) => TeamVisual | null;
    showFloatingTooltip: (title: string, text: string, event: React.MouseEvent) => void;
    clearFloatingTooltip: () => void;
};

const MatchPlayerCard: React.FC<MatchPlayerCardProps> = ({
    player,
    teamMode,
    runtime,
    round,
    nextRoundPriority,
    roleLookup,
    installsForPlayer,
    braTokenCount,
    handCount,
    playerName,
    getTeamDef,
    showFloatingTooltip,
    clearFloatingTooltip,
}) => {
    const teamDef = teamMode ? getTeamDef(player.team ?? null) : null;
    const roleInfo = player.roleId ? roleLookup.get(player.roleId) : undefined;
    const roleRuntime = runtime?.roleState;
    const copiedRoles = roleRuntime?.copiedRoleAbilities ?? [];
    const statusEffects = buildStatusEffects(runtime, player.roleId, round, player.id, nextRoundPriority ?? undefined);

    const clampGiantStat = (stat: 'def' | 'spe', value: number): number => {
        if (player.roleId !== 'giant') return value;
        return Math.min(value, 0);
    };

    const getDisplayedStatValue = (stat: 'atk' | 'def' | 'spe' | 'bra') => {
        if (!runtime) return null;
        const raw = runtime.baseStats[stat] + runtime.statTokens[stat] + runtime.turnBoosts[stat];
        if (stat === 'def' || stat === 'spe') {
            return clampGiantStat(stat, raw);
        }
        return raw;
    };

    const getDisplayedBaseStat = (stat: 'atk' | 'def' | 'spe' | 'bra') => {
        if (!runtime) return null;
        const raw = runtime.baseStats[stat];
        if (stat === 'def' || stat === 'spe') {
            return clampGiantStat(stat, raw);
        }
        return raw;
    };

    const stats = runtime
        ? {
              hp: `${runtime.hp} / ${runtime.maxHp}`,
              tempHp: runtime.tempHp,
              atk: getDisplayedStatValue('atk') ?? 0,
              def: getDisplayedStatValue('def') ?? 0,
              spe: getDisplayedStatValue('spe') ?? 0,
              bra: getDisplayedStatValue('bra') ?? 0,
          }
        : roleInfo?.params
        ? {
              hp: `${roleInfo.params.hp}`,
              tempHp: 0,
              atk: roleInfo.params.atk,
              def: clampGiantStat('def', roleInfo.params.def),
              spe: clampGiantStat('spe', roleInfo.params.spe),
              bra: roleInfo.params.bra,
          }
        : null;

    const installChips: StatusEffectChip[] = installsForPlayer
        .filter((install) => install.category === 'equip' || install.category === 'defense')
        .map((install, index) => {
            const isEquip = install.category === 'equip';
            const kindLabel = getKindLabel(install.kind) ?? 'スキル';
            const categoryLabel = getCategoryLabel(install.category) ?? install.category ?? '設置';
            return {
                key: `install-${install.instanceId}`,
                icon: isEquip ? '🧰' : '🛡️',
                label: install.name,
                color: isEquip ? 'rgba(167, 243, 208, 0.92)' : 'rgba(191, 219, 254, 0.92)',
                tooltip: `${categoryLabel} ・ ${kindLabel}${install.text ? `\n${install.text}` : ''}`,
                bucket: isEquip ? 'equip' : 'defense',
                showLabel: true,
                sortOrder: index,
            };
        });

    const copiedRoleChips: StatusEffectChip[] = copiedRoles.map((entry, index) => {
        const copiedName = roleLookup.get(entry.roleId)?.name ?? entry.roleId;
        const fromName = playerName(entry.fromPlayerId);
        return {
            key: `copied-${entry.roleId}-${entry.fromPlayerId}-${index}`,
            icon: '🪞',
            label: `［${copiedName}］`,
            color: 'rgba(199, 210, 254, 0.92)',
            tooltip: `複製元: ${fromName}`,
            bucket: 'role',
            showLabel: true,
            sortOrder: 50 + index,
        };
    });

    const mergedChips = sortChips([
        ...statusEffects.map((chip, index) => ({
            ...chip,
            bucket: chip.bucket ?? getStatusChipBucket(chip.key),
            sortOrder: chip.sortOrder ?? index,
        })),
        ...copiedRoleChips,
        ...installChips,
    ]);

    const roleName = roleInfo?.name ?? (player.roleId ? `［${player.roleId}］` : 'ロール未設定');

    const renderStatValue = (stat: 'atk' | 'def' | 'spe' | 'bra', label: string, value: number) => {
        if (!runtime) {
            return <span>{label} {value}</span>;
        }
        const base = getDisplayedBaseStat(stat) ?? runtime.baseStats[stat];
        const token = runtime.statTokens[stat] ?? 0;
        const turnBoost = runtime.turnBoosts[stat] ?? 0;
        const total = getDisplayedStatValue(stat) ?? value;
        const toneClass = total > base ? styles.statValueUp : total < base ? styles.statValueDown : '';
        const tooltipLines = [
            `基礎: ${base}`,
            `トークン: ${token >= 0 ? '+' : ''}${token}`,
            `ターン補正: ${turnBoost >= 0 ? '+' : ''}${turnBoost}`,
            `合計: ${total}`,
        ];
        return (
            <span
                onMouseMove={(event) => showFloatingTooltip(label, tooltipLines.join('\n'), event)}
                onMouseLeave={clearFloatingTooltip}
            >
                {label} <span className={toneClass}>{total}</span>
            </span>
        );
    };

    return (
        <li
            key={player.id}
            className={styles.playerCard}
            style={teamDef ? { background: teamDef.bg, borderColor: teamDef.border } : undefined}
        >
            <div className={styles.playerHeader}>
                <div>
                    <div className={styles.playerName}>{player.name}</div>
                </div>
                <span className={styles.roleBadge}>
                    ロール: {roleName}
                    {runtime?.isDefeated ? ' / 脱落' : ''}
                </span>
            </div>
            {stats && (
                <div className={styles.statLine}>
                    <span>
                        HP {stats.hp}
                        {runtime && runtime.tempHp > 0 && ` (+Temp ${runtime.tempHp})`}
                    </span>
                    {renderStatValue('atk', 'Atk', stats.atk)}
                    {renderStatValue('def', 'Def', stats.def)}
                    {renderStatValue('spe', 'Spe', stats.spe)}
                    {renderStatValue('bra', 'Bra', stats.bra)}
                </div>
            )}
            <div className={styles.statLine}>
                <span>Bra トークン: {braTokenCount}</span>
                <span>手札 {handCount}枚</span>
            </div>
            {mergedChips.length > 0 && (
                <div className={styles.effectChips}>
                    {mergedChips.map((effect) => (
                        <span
                            key={`${player.id}-${effect.key}`}
                            className={styles.effectChip}
                            style={{ background: effect.color }}
                            onMouseMove={(event) => {
                                showFloatingTooltip(effect.label, effect.tooltip, event);
                            }}
                            onMouseLeave={clearFloatingTooltip}
                        >
                            <span aria-hidden>{effect.icon}</span>
                            {effect.showLabel && <span className={styles.effectChipLabel}>{effect.label}</span>}
                            {effect.value !== undefined && <span>{effect.value}</span>}
                        </span>
                    ))}
                </div>
            )}
        </li>
    );
};

export default MatchPlayerCard;
