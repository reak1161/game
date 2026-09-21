import React from 'react';
import type { CardDefinition, PendingInfoDraw, PendingPrompt, Player } from '@shared/types';
import styles from './Match.module.css';

type MatchPendingPromptModalProps = {
    pendingPrompt: PendingPrompt;
    pendingPromptLabel: string;
    pendingCard?: CardDefinition;
    pendingEffectType?: string;
    isPromptTarget: boolean;
    promptBusy: boolean;
    renderPlayerChip: (playerId?: string) => React.ReactNode;
    onChoose: (accepted: boolean) => void;
};

const getPromptSourceLabel = (pendingPrompt: PendingPrompt) => {
    if (pendingPrompt.action?.type === 'roleAttack' || pendingPrompt.action?.type === 'resonateRoleAttack') {
        return 'ロール攻撃';
    }
    if (pendingPrompt.source === 'card') return 'カード';
    if (pendingPrompt.source === 'ability') return '能力';
    if (pendingPrompt.source === 'status') return '状態異常';
    return 'その他';
};

const renderPromptPreviewSuffix = (hpDamage: number, tempAbsorbed: number) =>
    tempAbsorbed > 0 ? `${hpDamage}（Temp吸収 ${tempAbsorbed}）` : `${hpDamage}`;

export const MatchPendingPromptModal: React.FC<MatchPendingPromptModalProps> = ({
    pendingPrompt,
    pendingPromptLabel,
    pendingCard,
    pendingEffectType,
    isPromptTarget,
    promptBusy,
    renderPlayerChip,
    onChoose,
}) => {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 40,
                padding: 16,
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: 20,
                    maxWidth: 420,
                    width: '100%',
                    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                }}
            >
                <h3 style={{ margin: 0 }}>ダメージ選択</h3>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 100%', fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                        {renderPlayerChip(pendingPrompt.attackerId)} → {renderPlayerChip(pendingPrompt.targetId)}
                    </div>
                </div>
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc' }}>
                        <div style={{ fontSize: 12, color: '#64748b' }}>受けようとしているダメージ</div>
                        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{pendingPrompt.amount}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>種類: {getPromptSourceLabel(pendingPrompt)}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa' }}>
                        <div style={{ fontSize: 12, color: '#9a3412' }}>割り込み効果（使う場合）</div>
                        <div style={{ fontWeight: 800, marginTop: 4 }}>{pendingPromptLabel}</div>
                        {pendingCard?.text && (
                            <p style={{ marginTop: 6, fontSize: 12, color: '#7c2d12', lineHeight: 1.5 }}>{pendingCard.text}</p>
                        )}
                        {pendingEffectType && <div style={{ marginTop: 6, fontSize: 11, color: '#9a3412' }}>効果: {pendingEffectType}</div>}
                    </div>
                    {pendingPrompt.preview && (
                        <div style={{ padding: 12, borderRadius: 12, background: '#f1f5f9' }}>
                            <div style={{ fontSize: 12, color: '#334155' }}>実際に受けるダメージ / Temp吸収</div>
                            <div style={{ marginTop: 8, display: 'grid', gap: 8, fontSize: 13, color: '#0f172a' }}>
                                <div>
                                    <strong>使う</strong>{' '}
                                    {renderPromptPreviewSuffix(
                                        pendingPrompt.preview.ifAccepted.hpDamage,
                                        pendingPrompt.preview.ifAccepted.tempAbsorbed,
                                    )}
                                    {pendingPrompt.preview.ifAccepted.breakdown && pendingPrompt.preview.ifAccepted.breakdown.length > 0 && (
                                        <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                                            {pendingPrompt.preview.ifAccepted.breakdown.map((line) => (
                                                <div key={line}>{line}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <strong>使わない</strong>{' '}
                                    {renderPromptPreviewSuffix(
                                        pendingPrompt.preview.ifDeclined.hpDamage,
                                        pendingPrompt.preview.ifDeclined.tempAbsorbed,
                                    )}
                                    {pendingPrompt.preview.ifDeclined.breakdown && pendingPrompt.preview.ifDeclined.breakdown.length > 0 && (
                                        <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
                                            {pendingPrompt.preview.ifDeclined.breakdown.map((line) => (
                                                <div key={line}>{line}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {isPromptTarget ? (
                    <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => onChoose(true)}
                            disabled={promptBusy}
                            className={styles.primaryButton}
                            style={{ flex: 1 }}
                        >
                            使う
                        </button>
                        <button
                            type="button"
                            onClick={() => onChoose(false)}
                            disabled={promptBusy}
                            className={styles.secondaryButton}
                            style={{ flex: 1 }}
                        >
                            使わない
                        </button>
                    </div>
                ) : (
                    <p style={{ marginTop: 16, fontSize: 12, color: '#64748b' }}>対象プレイヤーが選択中です...</p>
                )}
            </div>
        </div>
    );
};

type MatchPendingInfoDrawModalProps = {
    pendingInfoDraw: PendingInfoDraw;
    pendingInfoDrawPlayer?: Player;
    isInfoDrawTarget: boolean;
    infoDrawBusy: boolean;
    cardLookup: Map<string, CardDefinition>;
    getCategoryLabel: (category?: string | null) => string | undefined;
    getKindLabel: (kind?: string | null) => string | undefined;
    onChoose: (cardId: string) => void;
};

export const MatchPendingInfoDrawModal: React.FC<MatchPendingInfoDrawModalProps> = ({
    pendingInfoDraw,
    pendingInfoDrawPlayer,
    isInfoDrawTarget,
    infoDrawBusy,
    cardLookup,
    getCategoryLabel,
    getKindLabel,
    onChoose,
}) => {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 41,
                padding: 16,
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 16,
                    padding: 20,
                    maxWidth: isInfoDrawTarget ? 640 : 420,
                    width: '100%',
                    boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                }}
            >
                <h3 style={{ margin: 0 }}>情報: カード選択</h3>
                <div style={{ marginTop: 6, fontSize: 13, color: '#475569', fontWeight: 700 }}>
                    {pendingInfoDraw.drawIndex}/{pendingInfoDraw.drawTotal}
                </div>
                {isInfoDrawTarget ? (
                    <>
                        <p style={{ marginTop: 12, marginBottom: 10, color: '#334155' }}>
                            山札の上から見たカードです。手札に加えるカードを1枚選んでください。
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                            {pendingInfoDraw.options.map((cardId, index) => {
                                const info = cardLookup.get(cardId);
                                return (
                                    <button
                                        key={`${pendingInfoDraw.id}-${index}-${cardId}`}
                                        type="button"
                                        onClick={() => onChoose(cardId)}
                                        disabled={infoDrawBusy}
                                        className={styles.secondaryButton}
                                        style={{
                                            minHeight: 150,
                                            padding: 14,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'stretch',
                                            textAlign: 'left',
                                            gap: 8,
                                        }}
                                    >
                                        <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>
                                            {info?.name ?? cardId}
                                        </span>
                                        <span style={{ fontSize: 12, color: '#64748b' }}>
                                            {getCategoryLabel(info?.category)} / {getKindLabel(info?.kind)}
                                        </span>
                                        <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                            {info?.text ?? '説明がありません。'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <p style={{ marginTop: 14, color: '#334155', lineHeight: 1.6 }}>
                        {pendingInfoDrawPlayer?.name ?? '情報'} がカードを選択しています...
                    </p>
                )}
            </div>
        </div>
    );
};
