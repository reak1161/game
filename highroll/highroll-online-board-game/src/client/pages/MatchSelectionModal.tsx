import React from 'react';
import styles from './Match.module.css';

type TargetSelectionItem = {
    playerId: string;
    playerLabel: React.ReactNode;
    isDefeated: boolean;
    badges: string[];
    disabled: boolean;
    disabledReason: string | null;
};

type SelectionModalState =
    | {
          type: 'target';
          title: string;
          note?: string;
      }
    | { type: 'stat'; title: string; options?: Array<'atk' | 'def' | 'spe' | 'bra'> }
    | { type: 'chooseOne'; title: string; options: Array<{ value: string; label: string }> };

type MatchSelectionModalProps = {
    modal: SelectionModalState;
    targetItems: TargetSelectionItem[];
    statOptions: Array<'atk' | 'def' | 'spe' | 'bra'>;
    onClose: (value: string | null) => void;
};

const MatchSelectionModal: React.FC<MatchSelectionModalProps> = ({ modal, targetItems, statOptions, onClose }) => {
    return (
        <div className={styles.modalOverlay} onClick={() => onClose(null)}>
            <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{modal.title}</h2>
                    <button type="button" className={styles.modalClose} onClick={() => onClose(null)}>
                        閉じる
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {modal.type === 'target' ? (
                        targetItems.length === 0 ? (
                            <p className={styles.mutedText}>選択できるプレイヤーがいません。</p>
                        ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                                {modal.note && <div className={styles.selectionNote}>{modal.note}</div>}
                                {targetItems.map((item) => (
                                    <button
                                        key={item.playerId}
                                        type="button"
                                        className={styles.secondaryButton}
                                        onClick={() => onClose(item.playerId)}
                                        disabled={item.disabled}
                                        title={item.disabledReason ?? undefined}
                                    >
                                        <span className={styles.selectionOptionRow}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                {item.playerLabel}
                                                {item.isDefeated && <span style={{ color: '#b91c1c' }}>(脱落)</span>}
                                            </span>
                                            <span className={styles.selectionOptionMeta}>
                                                {item.badges.map((badge) => (
                                                    <span key={`${item.playerId}-${badge}`} className={styles.selectionOptionBadge}>
                                                        {badge}
                                                    </span>
                                                ))}
                                            </span>
                                        </span>
                                        {item.disabledReason && <div className={styles.selectionOptionReason}>{item.disabledReason}</div>}
                                    </button>
                                ))}
                            </div>
                        )
                    ) : modal.type === 'stat' ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {(modal.options ?? statOptions).map((stat) => (
                                <button key={stat} type="button" className={styles.secondaryButton} onClick={() => onClose(stat)}>
                                    {stat.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            {modal.options.map((opt) => (
                                <button key={opt.value} type="button" className={styles.secondaryButton} onClick={() => onClose(opt.value)}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatchSelectionModal;
