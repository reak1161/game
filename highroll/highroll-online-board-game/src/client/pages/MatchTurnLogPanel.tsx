import React from 'react';
import type { GameLogEntry } from '@shared/types';
import styles from './Match.module.css';

type MatchTurnLogPanelProps = {
    logs: GameLogEntry[];
    formatLogEntry: (entry: GameLogEntry) => React.ReactNode;
};

// TurnLogPanel is intentionally display-only so Match.tsx can focus on
// state transitions and WebSocket interaction.
const MatchTurnLogPanel: React.FC<MatchTurnLogPanelProps> = ({ logs, formatLogEntry }) => {
    return (
        <section className={`${styles.sectionCard} ${styles.logSectionCard}`}>
            <div className={styles.logPanel}>
                {logs.length === 0 ? (
                    <p className={styles.mutedText}>まだログはありません。</p>
                ) : (
                    <ul className={styles.turnLog}>
                        {logs.map((entry, idx) => (
                            <li
                                key={`${entry.type}-${entry.timestamp}-${idx}`}
                                className={`${styles.turnLogItem} ${
                                    entry.type === 'turnStart' ? styles.turnLogCurrent : ''
                                } ${entry.type === 'roundStart' ? styles.turnLogRound : ''}`}
                            >
                                {formatLogEntry(entry)}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

export default MatchTurnLogPanel;
