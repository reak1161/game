import React from 'react';
import styles from './Match.module.css';

type TooltipAdjustment = {
    label: string;
    base: number;
    adjusted: number;
};

type FloatingTooltipState = {
    title: string;
    text: string;
    x: number;
    y: number;
    adjustments?: TooltipAdjustment[];
};

type MatchFloatingOverlaysProps = {
    actionToast: React.ReactNode | null;
    tooltip: FloatingTooltipState | null;
    jesterSpin: { label: string; result?: string } | null;
};

const MatchFloatingOverlays: React.FC<MatchFloatingOverlaysProps> = ({ actionToast, tooltip, jesterSpin }) => {
    return (
        <>
            {actionToast && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        bottom: 18,
                        display: 'flex',
                        justifyContent: 'center',
                        zIndex: 34,
                        pointerEvents: 'none',
                        padding: 16,
                    }}
                >
                    <div
                        style={{
                            background: 'rgba(15, 23, 42, 0.92)',
                            color: '#e2e8f0',
                            borderRadius: 14,
                            padding: '10px 14px',
                            maxWidth: 560,
                            width: '100%',
                            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',
                            fontSize: 13,
                            lineHeight: 1.5,
                            textAlign: 'center',
                        }}
                    >
                        {actionToast}
                    </div>
                </div>
            )}

            {tooltip && (
                <div className={styles.cardTooltipFloating} style={{ top: tooltip.y, left: tooltip.x }}>
                    <strong>{tooltip.title}</strong>
                    <p style={{ margin: '4px 0 0', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{tooltip.text}</p>
                    {tooltip.adjustments && tooltip.adjustments.length > 0 && (
                        <div className={styles.cardEffectAdjustments}>
                            {tooltip.adjustments.map((adjustment, index) => {
                                const tone =
                                    adjustment.adjusted > adjustment.base
                                        ? styles.cardEffectAdjustedIncrease
                                        : adjustment.adjusted < adjustment.base
                                          ? styles.cardEffectAdjustedDecrease
                                          : '';
                                return (
                                    <div key={`${adjustment.label}-${index}`} className={styles.cardEffectItem}>
                                        <span className={styles.cardEffectLabel}>{adjustment.label}</span>
                                        <span className={styles.cardEffectBase}>{adjustment.base}</span>
                                        <span className={styles.cardEffectArrow}>→</span>
                                        <span className={`${styles.cardEffectAdjusted} ${tone}`.trim()}>{adjustment.adjusted}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {jesterSpin && (
                <div className={styles.jesterOverlay}>
                    <div className={styles.jesterPanel}>
                        <div className={styles.jesterTitle}>道化のスロット</div>
                        <div className={styles.jesterSlot}>{jesterSpin.label}</div>
                        {jesterSpin.result && <div className={styles.jesterResult}>結果: {jesterSpin.result}</div>}
                    </div>
                </div>
            )}
        </>
    );
};

export default MatchFloatingOverlays;
