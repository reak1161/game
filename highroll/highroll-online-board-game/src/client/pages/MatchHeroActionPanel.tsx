import React from 'react';
import type { RoleActionDefinition } from '@shared/types';
import styles from './Match.module.css';

type MatchHeroActionPanelProps = {
    currentPlayerName: string;
    deckPileInfo: string;
    hasLocalPlayer: boolean;
    showRescueInDrawSlot: boolean;
    rescueBraCost: number | null;
    drawDisabled: boolean;
    roleAttackDisabled: boolean;
    endTurnDisabled: boolean;
    attackIsStruggle: boolean;
    attackButtonLabel: string;
    isPromptBlocking: boolean;
    localRoleActions: RoleActionDefinition[];
    visibleLocalRoleActions: RoleActionDefinition[];
    localRoleActionPageCount: number;
    safeRoleActionPage: number;
    onDrawOrRescue: () => void;
    onRoleAttack: () => void;
    onEndTurn: () => void;
    onPrevRoleActionPage: () => void;
    onNextRoleActionPage: () => void;
    onRoleAction: (action: RoleActionDefinition) => void;
    getRoleActionAvailability: (action: RoleActionDefinition) => { disabled: boolean; reason?: string };
    renderRoleActionChoiceControls: (action: RoleActionDefinition) => React.ReactNode;
    showFloatingTooltip: (title: string, text: string, event: React.MouseEvent<HTMLElement>) => void;
    clearFloatingTooltip: () => void;
};

const MatchHeroActionPanel: React.FC<MatchHeroActionPanelProps> = ({
    currentPlayerName,
    deckPileInfo,
    hasLocalPlayer,
    showRescueInDrawSlot,
    rescueBraCost,
    drawDisabled,
    roleAttackDisabled,
    endTurnDisabled,
    attackIsStruggle,
    attackButtonLabel,
    isPromptBlocking,
    localRoleActions,
    visibleLocalRoleActions,
    localRoleActionPageCount,
    safeRoleActionPage,
    onDrawOrRescue,
    onRoleAttack,
    onEndTurn,
    onPrevRoleActionPage,
    onNextRoleActionPage,
    onRoleAction,
    getRoleActionAvailability,
    renderRoleActionChoiceControls,
    showFloatingTooltip,
    clearFloatingTooltip,
}) => {
    return (
        <div className={styles.heroActionPanel}>
            <div className={styles.statusGrid}>
                <div className={styles.statusCard}>
                    <div className={styles.statusLabel}>現在の手番</div>
                    <div className={styles.statusValue}>{currentPlayerName}</div>
                </div>
                <div className={styles.statusCard}>
                    <div className={styles.statusLabel}>山札 / 捨て札</div>
                    <div className={styles.statusValue}>{deckPileInfo}</div>
                </div>
            </div>

            {hasLocalPlayer && (
                <>
                    <div className={styles.controlsRow}>
                        <button
                            onClick={onDrawOrRescue}
                            disabled={drawDisabled}
                            className={`${styles.primaryButton} ${showRescueInDrawSlot ? styles.dangerButton : ''}`}
                            title={
                                showRescueInDrawSlot
                                    ? '最大Braが0のときのみ実行できます。最大HPの1/4を消費して最大Braを+1します。'
                                    : undefined
                            }
                        >
                            {showRescueInDrawSlot ? `救済（HP-${rescueBraCost ?? 0} / 最大Bra+1）` : '1枚ドロー'}
                        </button>
                        <button
                            onClick={onRoleAttack}
                            disabled={roleAttackDisabled || isPromptBlocking}
                            className={`${styles.primaryButton} ${attackIsStruggle ? styles.dangerButton : ''}`}
                        >
                            {attackButtonLabel}
                        </button>
                        <button onClick={onEndTurn} disabled={endTurnDisabled} className={styles.secondaryButton}>
                            ターンを終える
                        </button>
                    </div>

                    {localRoleActions.length > 0 && (
                        <div className={styles.abilitySection}>
                            {localRoleActionPageCount > 1 && (
                                <div className={styles.abilityHeader}>
                                    <div className={styles.abilityPager}>
                                        <button
                                            type="button"
                                            className={styles.helpButton}
                                            onClick={onPrevRoleActionPage}
                                            disabled={safeRoleActionPage <= 0}
                                        >
                                            ←
                                        </button>
                                        <span className={styles.abilityPageText}>
                                            {safeRoleActionPage + 1} / {localRoleActionPageCount}
                                        </span>
                                        <button
                                            type="button"
                                            className={styles.helpButton}
                                            onClick={onNextRoleActionPage}
                                            disabled={safeRoleActionPage >= localRoleActionPageCount - 1}
                                        >
                                            →
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className={`${styles.roleActionGrid} ${styles.roleActionGridThreeCols}`}>
                                {visibleLocalRoleActions.map((action) => {
                                    const availability = getRoleActionAvailability(action);
                                    const actionTooltipText = action.description ?? '';
                                    const canShowTooltip = actionTooltipText.trim().length > 0;
                                    const isDisabled = availability.disabled || isPromptBlocking;

                                    return (
                                        <div
                                            key={action.id}
                                            className={`${styles.roleActionCard} ${isDisabled ? styles.roleActionCardDisabled : ''}`}
                                            role="button"
                                            tabIndex={isDisabled ? -1 : 0}
                                            aria-disabled={isDisabled}
                                            onClick={() => {
                                                if (isDisabled) return;
                                                onRoleAction(action);
                                            }}
                                            onKeyDown={(event) => {
                                                if (isDisabled) return;
                                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                                event.preventDefault();
                                                onRoleAction(action);
                                            }}
                                            onMouseMove={(event) => {
                                                if (!canShowTooltip) return;
                                                showFloatingTooltip(action.label, actionTooltipText, event);
                                            }}
                                            onMouseLeave={() => {
                                                if (!canShowTooltip) return;
                                                clearFloatingTooltip();
                                            }}
                                        >
                                            <div className={styles.roleActionHeader}>
                                                <strong className={styles.roleActionName}>{action.label}</strong>
                                                <span className={styles.roleActionCost}>Bra消費: {action.costBra ?? 0}</span>
                                            </div>
                                            {renderRoleActionChoiceControls(action)}
                                            {availability.disabled &&
                                                availability.reason &&
                                                availability.reason !== '自分のターンではありません。' && (
                                                    <div className={styles.roleActionReason}>{availability.reason}</div>
                                                )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MatchHeroActionPanel;
