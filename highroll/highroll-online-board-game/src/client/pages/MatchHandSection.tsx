import React from 'react';
import type { CardDefinition } from '@shared/types';
import styles from './Match.module.css';

type MatchHandSectionProps = {
    hand: string[];
    cardLookup: Map<string, CardDefinition>;
    handCardBgByCategory: Record<string, string>;
    sealedHandIndexSet: Set<number>;
    cursedHandIndexMap: Map<number, string>;
    bloodPatternIndexSet: Set<number>;
    forcedHandIndexSet: Set<number>;
    currentBra: number;
    isCurrentTurn: boolean;
    isLocalDefeated: boolean;
    isPromptBlocking: boolean;
    onPlay: (cardId: string, handIndex: number) => void;
    onShowCardTooltip: (
        event: React.MouseEvent<HTMLDivElement>,
        cardId: string,
        info: CardDefinition | undefined,
        curseId: string | null,
        isBloodPattern: boolean
    ) => void;
    onHideTooltip: () => void;
};

const handWrapperStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    overflowX: 'auto',
    paddingBottom: 0,
};

const cardButtonStyle = (
    active: boolean,
    category: string | null | undefined,
    handCardBgByCategory: Record<string, string>
): React.CSSProperties => {
    const bgUrl = category ? handCardBgByCategory[category] : undefined;
    return {
        position: 'relative',
        border: '1px solid #cbd5f5',
        borderRadius: 12,
        padding: '10px 12px',
        textAlign: 'left',
        background: bgUrl
            ? `${active ? 'linear-gradient(rgba(255,255,255,0.08), rgba(15,23,42,0.04)),' : 'linear-gradient(rgba(255,255,255,0.30), rgba(255,255,255,0.20)),'} url(${bgUrl}) center / cover no-repeat`
            : active
            ? 'linear-gradient(135deg, #1d4ed8, #9333ea)'
            : '#f1f5f9',
        backgroundColor: '#f1f5f9',
        color: '#fff',
        cursor: active ? 'pointer' : 'not-allowed',
        boxShadow: active ? '0 6px 15px rgba(15, 23, 42, 0.25)' : 'none',
        minHeight: 108,
        width: 180,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        textShadow: '0 2px 8px rgba(15,23,42,0.95), 0 1px 2px rgba(0,0,0,0.9)',
    };
};

const MatchHandSection: React.FC<MatchHandSectionProps> = ({
    hand,
    cardLookup,
    handCardBgByCategory,
    sealedHandIndexSet,
    cursedHandIndexMap,
    bloodPatternIndexSet,
    forcedHandIndexSet,
    currentBra,
    isCurrentTurn,
    isLocalDefeated,
    isPromptBlocking,
    onPlay,
    onShowCardTooltip,
    onHideTooltip,
}) => {
    return (
        <section className={`${styles.sectionCard} ${styles.handSection} ${styles.handSectionFixed}`}>
            <div style={handWrapperStyle}>
                {hand.length === 0 && <span className={styles.mutedText}>手札なし</span>}
                {hand.map((cardId, idx) => {
                    const info = cardLookup.get(cardId);
                    const isSealed = sealedHandIndexSet.has(idx);
                    const curseId = cursedHandIndexMap.get(idx) ?? null;
                    const isCursed = Boolean(curseId);
                    const isBloodPattern = bloodPatternIndexSet.has(idx);
                    const requiredBra = curseId === 'enrage' ? 2 : 1;
                    const forceRestricted = forcedHandIndexSet.size > 0 && !forcedHandIndexSet.has(idx);
                    const canPlay =
                        isCurrentTurn &&
                        !isLocalDefeated &&
                        !isPromptBlocking &&
                        info?.playable !== false &&
                        !isSealed &&
                        !forceRestricted &&
                        currentBra >= requiredBra;
                    const wrapperClassName =
                        [
                            isSealed ? styles.sealedHandCard : '',
                            isCursed ? styles.cursedHandCard : '',
                            isBloodPattern ? styles.bloodPatternHandCard : '',
                        ]
                            .filter(Boolean)
                            .join(' ') || undefined;

                    return (
                        <div
                            key={`${cardId}-${idx}`}
                            style={{ position: 'relative', width: 180 }}
                            className={wrapperClassName}
                            onMouseEnter={(event) => onShowCardTooltip(event, cardId, info, curseId, isBloodPattern)}
                            onMouseLeave={onHideTooltip}
                        >
                            <button
                                onClick={() => onPlay(cardId, idx)}
                                disabled={!canPlay}
                                style={cardButtonStyle(canPlay, info?.category, handCardBgByCategory)}
                            >
                                <div
                                    style={{
                                        fontWeight: 400,
                                        fontSize: 20,
                                        textAlign: 'center',
                                        lineHeight: 1.1,
                                        letterSpacing: '0.02em',
                                        fontFamily: '"HighrollDotTitle", "DotGothic16", "MS Gothic", monospace',
                                    }}
                                >
                                    {info?.name ?? cardId}
                                </div>
                            </button>
                            {isSealed && <div className={styles.sealedHandOverlay} aria-hidden="true" />}
                            {isCursed && <div className={styles.cursedHandOverlay} aria-hidden="true" />}
                            {isBloodPattern && <div className={styles.bloodPatternOverlay} aria-hidden="true" />}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default MatchHandSection;
