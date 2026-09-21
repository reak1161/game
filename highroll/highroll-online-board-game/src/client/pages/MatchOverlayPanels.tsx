import React from 'react';
import type { CardDefinition } from '@shared/types';
import type { DamageResolvedLog } from './matchHelpers';
import styles from './Match.module.css';

type MatchDamagePopupProps = {
    damagePopup: DamageResolvedLog;
    damagePopupDurationMs: number;
    cardLookup: Map<string, CardDefinition>;
    renderPlayerChip: (playerId?: string) => React.ReactNode;
    onClose: () => void;
};

export const MatchDamagePopup: React.FC<MatchDamagePopupProps> = ({
    damagePopup,
    damagePopupDurationMs,
    cardLookup,
    renderPlayerChip,
    onClose,
}) => {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 35,
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: 18,
                    paddingBottom: 26,
                    maxWidth: 440,
                    width: '100%',
                    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ margin: 0 }}>ダメージ結果</h3>
                <div
                    style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 12,
                        background: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 58,
                    }}
                >
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', textAlign: 'center', lineHeight: 1.2 }}>
                        {damagePopup.source === 'status' ? (
                            <>
                                {renderPlayerChip(damagePopup.targetId)}
                                <span>（特殊ダメージ{damagePopup.label ? `: ${damagePopup.label}` : ''}）</span>
                            </>
                        ) : damagePopup.attackerId === damagePopup.targetId ? (
                            <>
                                {renderPlayerChip(damagePopup.targetId)}
                                <span>（自傷{damagePopup.label ? `: ${damagePopup.label}` : ''}）</span>
                            </>
                        ) : (
                            <>
                                {renderPlayerChip(damagePopup.attackerId)} → {renderPlayerChip(damagePopup.targetId)}
                            </>
                        )}
                    </div>
                </div>

                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>種別</div>
                        <div style={{ fontWeight: 800, marginTop: 2 }}>
                            {damagePopup.label ??
                                (damagePopup.source === 'role'
                                    ? 'ロール攻撃'
                                    : damagePopup.source === 'card'
                                    ? 'カード'
                                    : damagePopup.source === 'ability'
                                    ? '能力'
                                    : damagePopup.source === 'status'
                                    ? '特殊ダメージ'
                                    : 'その他')}
                        </div>
                        {damagePopup.cardId && (
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                                カード: {cardLookup.get(damagePopup.cardId)?.name ?? damagePopup.cardId}
                            </div>
                        )}
                        {damagePopup.abilityId && (
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>能力: {damagePopup.abilityId}</div>
                        )}
                    </div>

                    <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>ダメージ（予定 → 実際）</div>
                        <div
                            style={{
                                marginTop: 6,
                                display: 'flex',
                                alignItems: 'baseline',
                                justifyContent: 'space-between',
                                gap: 10,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 12, color: '#64748b' }}>予定</span>
                                <span style={{ fontWeight: 900, fontSize: 22, color: '#0f172a' }}>{damagePopup.attempted}</span>
                            </div>
                            <div style={{ fontSize: 14, color: '#94a3b8' }}>→</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                <span style={{ fontSize: 12, color: '#64748b' }}>実際</span>
                                <span
                                    style={{
                                        fontWeight: 900,
                                        fontSize: 22,
                                        color: damagePopup.totalAfterReductions <= 0 ? '#dc2626' : '#0f172a',
                                    }}
                                >
                                    {damagePopup.totalAfterReductions}
                                </span>
                            </div>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                            Temp吸収: {damagePopup.tempAbsorbed} / HPダメージ: {damagePopup.hpDamage}
                        </div>
                    </div>

                    {damagePopup.breakdown && damagePopup.breakdown.length > 0 && (
                        <div style={{ padding: 12, borderRadius: 12, background: '#f1f5f9' }}>
                            <div style={{ fontSize: 12, color: '#334155' }}>軽減/無効の内訳</div>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                                {damagePopup.breakdown.map((line) => (
                                    <div key={line}>{line}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className={styles.secondaryButton} onClick={onClose}>
                        閉じる
                    </button>
                </div>
                <div className={styles.damagePopupProgressTrack} aria-hidden="true">
                    <div className={styles.damagePopupProgressBar} style={{ animationDuration: `${damagePopupDurationMs}ms` }} />
                </div>
            </div>
        </div>
    );
};

type MatchResultModalProps = {
    open: boolean;
    winnerText: React.ReactNode;
    matchId: string;
    isHost: boolean;
    wsConnected: boolean;
    isSpectator: boolean;
    onClose: () => void;
    onBackToLobby: () => void;
};

export const MatchResultModal: React.FC<MatchResultModalProps> = ({
    open,
    winnerText,
    matchId,
    isHost,
    wsConnected,
    isSpectator,
    onClose,
    onBackToLobby,
}) => {
    if (!open) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 34,
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: 18,
                    maxWidth: 520,
                    width: '100%',
                    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ margin: 0, fontSize: 20 }}>ゲーム終了</h2>
                <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                    <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a' }}>{winnerText}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>マッチID: {matchId}</div>
                </div>

                <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} className={styles.secondaryButton}>
                        閉じる
                    </button>
                    {isHost && (
                        <button
                            type="button"
                            onClick={onBackToLobby}
                            className={styles.primaryButton}
                            disabled={!wsConnected || isSpectator}
                        >
                            マッチを終了してロビーに戻る（ホスト）
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
