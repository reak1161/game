import React from 'react';
import type { Player, PlayerRuntimeState } from '@shared/types';
import styles from './Match.module.css';
import MatchPlayerCard, { type InstallInfo, type TeamVisual } from './MatchPlayerCard';
import type { RoleEntry } from './matchStatic';

type MatchPlayersSectionProps = {
    players: Player[];
    localPlayerPresent: boolean;
    wsConnected: boolean;
    isSpectator: boolean;
    teamMode: boolean;
    round?: number;
    nextRoundPriority: {
        playerId: string;
        applyOnRound: number;
    } | null;
    runtimeStates: Record<string, PlayerRuntimeState | undefined>;
    roleLookup: Map<string, RoleEntry>;
    installsByPlayer: Record<string, InstallInfo[]>;
    braTokens: Record<string, number>;
    hands: Record<string, string[]>;
    playerName: (playerId: string | undefined) => string;
    getTeamDef: (team?: Player['team'] | null) => TeamVisual | null;
    showFloatingTooltip: (title: string, text: string, event: React.MouseEvent) => void;
    clearFloatingTooltip: () => void;
};

const MatchPlayersSection: React.FC<MatchPlayersSectionProps> = ({
    players,
    localPlayerPresent,
    wsConnected,
    isSpectator,
    teamMode,
    round,
    nextRoundPriority,
    runtimeStates,
    roleLookup,
    installsByPlayer,
    braTokens,
    hands,
    playerName,
    getTeamDef,
    showFloatingTooltip,
    clearFloatingTooltip,
}) => {
    return (
        <section
            className={`${styles.sectionCard} ${styles.playersSection} ${styles.playersStripSection} ${
                localPlayerPresent ? styles.playersStripSectionNoHeader : ''
            }`}
        >
            {!localPlayerPresent && (
                <div className={styles.sectionHeader}>
                    <h2>プレイヤー情報</h2>
                    {!wsConnected ? (
                        <span className={styles.sectionBadgeDanger}>接続中…（操作不可）</span>
                    ) : isSpectator ? (
                        <span className={styles.sectionBadgeDanger}>観戦中（操作不可）</span>
                    ) : (
                        <span className={styles.sectionBadgeDanger}>操作権なし（操作不可）</span>
                    )}
                </div>
            )}
            <ul className={styles.playerStrip}>
                {players.map((player) => (
                    <MatchPlayerCard
                        key={player.id}
                        player={player}
                        teamMode={teamMode}
                        runtime={runtimeStates[player.id]}
                        round={round}
                        nextRoundPriority={nextRoundPriority}
                        roleLookup={roleLookup}
                        installsForPlayer={installsByPlayer[player.id] ?? []}
                        braTokenCount={braTokens[player.id] ?? 0}
                        handCount={hands[player.id]?.length ?? 0}
                        playerName={playerName}
                        getTeamDef={getTeamDef}
                        showFloatingTooltip={showFloatingTooltip}
                        clearFloatingTooltip={clearFloatingTooltip}
                    />
                ))}
            </ul>
        </section>
    );
};

export default MatchPlayersSection;
