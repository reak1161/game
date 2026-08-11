import React from 'react';
import type { DeckSummary } from '@shared/types';
import { getDeckListLocal } from '@client/catalog/localCatalog';
import type { CardDefinition } from '@shared/types';
import cardsCatalogRaw from '../../../data/cards.json' with { type: 'json' };

type CardsFile = { cards: CardDefinition[] };

const CARD_LOOKUP = new Map<string, CardDefinition>(
    (((cardsCatalogRaw as CardsFile).cards ?? []) as CardDefinition[]).map((card) => [card.id, card])
);

const CATEGORY_LABEL: Record<string, string> = {
    attack: '攻撃',
    defense: '防御',
    spell: '呪文',
    equip: '装備',
    equipment: '装備',
};

const CATEGORY_ORDER = ['attack', 'defense', 'spell', 'equip', 'equipment'];

const KIND_LABEL: Record<string, string> = {
    skill: 'スキル',
    install: '設置',
};

const getKindLabel = (kind?: string | null) => (kind ? KIND_LABEL[kind] ?? kind.toUpperCase() : undefined);

export type DeckSelectModalProps = {
    open: boolean;
    decks: DeckSummary[];
    selectedDeckId: string;
    onClose: () => void;
    onSelect?: (deckId: string) => void;
    canSelect?: boolean;
    selectLabel?: string;
    selectDisabledReason?: string;
};

const DeckSelectModal: React.FC<DeckSelectModalProps> = ({
    open,
    decks,
    selectedDeckId,
    onClose,
    onSelect,
    canSelect = true,
    selectLabel = 'このデッキにする',
    selectDisabledReason,
}) => {
    const [previewDeckId, setPreviewDeckId] = React.useState(selectedDeckId);
    const [hoveredCardId, setHoveredCardId] = React.useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = React.useState<{ x: number; y: number } | null>(null);

    React.useEffect(() => {
        if (!open) return;
        setPreviewDeckId(selectedDeckId);
    }, [open, selectedDeckId]);

    React.useEffect(() => {
        if (!open) {
            setHoveredCardId(null);
            setTooltipPos(null);
            return;
        }
    }, [open]);

    const deck = React.useMemo(() => {
        try {
            return getDeckListLocal(previewDeckId);
        } catch {
            return null;
        }
    }, [previewDeckId]);

    const deckEntries = React.useMemo(() => {
        if (!deck) return [];
        const rows = deck.entries.map((entry) => {
            const card = CARD_LOOKUP.get(entry.id);
            const rawCategory = card?.category ?? 'unknown';
            const normalizedCategory = rawCategory === 'equipment' ? 'equip' : rawCategory;
            return {
                id: entry.id,
                count: entry.count,
                name: card?.name ?? entry.id,
                category: normalizedCategory,
                kind: card?.kind,
            };
        });

        const categoryIndex = (category: string) => {
            const idx = CATEGORY_ORDER.indexOf(category);
            return idx === -1 ? 999 : idx;
        };

        return rows.sort((a, b) => {
            const ca = categoryIndex(a.category);
            const cb = categoryIndex(b.category);
            if (ca !== cb) return ca - cb;
            return a.name.localeCompare(b.name, 'ja');
        });
    }, [deck]);

    const categoryCounts = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const entry of deckEntries) {
            counts.set(entry.category, (counts.get(entry.category) ?? 0) + entry.count);
        }
        return counts;
    }, [deckEntries]);

    const hoveredCard = React.useMemo(() => {
        if (!hoveredCardId) return null;
        return CARD_LOOKUP.get(hoveredCardId) ?? null;
    }, [hoveredCardId]);

    const tooltipStyle = React.useMemo<React.CSSProperties>(() => {
        if (!tooltipPos || typeof window === 'undefined') {
            return { display: 'none' };
        }
        const width = 320;
        const height = 180;
        const left = Math.min(tooltipPos.x + 12, window.innerWidth - width - 12);
        const top = Math.min(tooltipPos.y + 12, window.innerHeight - height - 12);
        return {
            position: 'fixed',
            left,
            top,
            width,
            maxWidth: 'min(360px, 92vw)',
            maxHeight: 'min(220px, 40vh)',
            overflow: 'auto',
            background: '#0f172a',
            color: '#e2e8f0',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
            zIndex: 60,
            pointerEvents: 'none',
        };
    }, [tooltipPos]);

    const canConfirm = Boolean(onSelect) && canSelect && previewDeckId !== selectedDeckId;
    const confirmDisabled = !canConfirm || Boolean(selectDisabledReason);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.55)',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                style={{
                    width: 'min(980px, 100%)',
                    maxHeight: '85vh',
                    background: '#fff',
                    borderRadius: 16,
                    border: '1px solid rgba(226, 232, 240, 0.9)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                    }}
                >
                    <div style={{ fontSize: 16, fontWeight: 800 }}>デッキ選択</div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '6px 10px',
                            borderRadius: 10,
                            border: '1px solid #cbd5f5',
                            background: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        閉じる
                    </button>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(240px, 320px) 1fr',
                        gap: 0,
                        flex: 1,
                        minHeight: 0,
                    }}
                >
                    <div style={{ borderRight: '1px solid #e2e8f0', overflow: 'auto', padding: 12 }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>デッキ一覧</div>
                        <div style={{ display: 'grid', gap: 8 }}>
                            {decks.map((d) => {
                                const isSelected = d.id === selectedDeckId;
                                const isPreview = d.id === previewDeckId;
                                return (
                                    <button
                                        key={d.id}
                                        onClick={() => setPreviewDeckId(d.id)}
                                        style={{
                                            textAlign: 'left',
                                            padding: 12,
                                            borderRadius: 12,
                                            border: isPreview ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                            background: isPreview ? '#eff6ff' : '#fff',
                                            cursor: 'pointer',
                                            display: 'grid',
                                            gap: 6,
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                            <strong style={{ fontSize: 14 }}>{d.name}</strong>
                                            {isSelected && (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        fontWeight: 800,
                                                        padding: '2px 8px',
                                                        borderRadius: 999,
                                                        background: '#16a34a',
                                                        color: '#fff',
                                                    }}
                                                >
                                                    現在
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#475569' }}>
                                            {d.id} / {d.total}枚
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ overflow: 'auto', padding: 12, minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                                <div style={{ fontSize: 12, color: '#64748b' }}>プレビュー</div>
                                <div style={{ fontSize: 16, fontWeight: 800 }}>
                                    {deck ? deck.name : previewDeckId}
                                    {deck ? <span style={{ marginLeft: 8, fontSize: 12, color: '#475569' }}>（{deck.total}枚）</span> : null}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {Array.from(categoryCounts.entries())
                                    .sort(([a], [b]) => {
                                        const ai = CATEGORY_ORDER.indexOf(a);
                                        const bi = CATEGORY_ORDER.indexOf(b);
                                        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                                    })
                                    .map(([category, count]) => (
                                        <span
                                            key={category}
                                            style={{
                                                fontSize: 12,
                                                padding: '4px 10px',
                                                borderRadius: 999,
                                                background: '#f1f5f9',
                                                border: '1px solid #e2e8f0',
                                                color: '#0f172a',
                                            }}
                                            title={category}
                                        >
                                            {CATEGORY_LABEL[category] ?? category}: {count}
                                        </span>
                                    ))}
                            </div>
                        </div>

                        <div style={{ marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>内容（カードID / 枚数 / 種別）</div>
                            {deckEntries.length === 0 ? (
                                <div style={{ fontSize: 13, color: '#64748b' }}>このデッキの内容を読み込めませんでした。</div>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                                    {deckEntries.map((entry) => (
                                        <li
                                            key={entry.id}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'baseline',
                                                gap: 10,
                                                padding: '8px 10px',
                                                borderRadius: 12,
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                            }}
                                            onMouseEnter={(e) => {
                                                setHoveredCardId(entry.id);
                                                setTooltipPos({ x: e.clientX, y: e.clientY });
                                            }}
                                            onMouseMove={(e) => {
                                                if (hoveredCardId !== entry.id) return;
                                                setTooltipPos({ x: e.clientX, y: e.clientY });
                                            }}
                                            onMouseLeave={() => {
                                                setHoveredCardId((prev) => (prev === entry.id ? null : prev));
                                                setTooltipPos(null);
                                            }}
                                        >
                                            <div style={{ display: 'grid', gap: 2 }}>
                                                <div style={{ fontWeight: 800, fontSize: 13 }}>{entry.name}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>
                                                        {entry.id}
                                                        {entry.kind ? ` / ${getKindLabel(entry.kind)}` : ''}
                                                    </div>
                                                </div>
                                            <div style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
                                                <div style={{ fontSize: 14, fontWeight: 800 }}>×{entry.count}</div>
                                                <div style={{ fontSize: 11, color: '#475569' }}>{CATEGORY_LABEL[entry.category] ?? entry.category}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {hoveredCard && tooltipPos && (
                    <div style={tooltipStyle}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>{hoveredCard.name ?? hoveredCardId}</div>
                        <div style={{ marginTop: 4, fontSize: 11, color: '#cbd5f5' }}>
                            {hoveredCard.id}
                            {hoveredCard.category ? ` / ${CATEGORY_LABEL[hoveredCard.category] ?? hoveredCard.category}` : ''}
                            {typeof hoveredCard.cost === 'number' ? ` / コスト ${hoveredCard.cost}` : ''}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45 }}>
                            {hoveredCard.text ? hoveredCard.text : '説明がありません。'}
                        </div>
                    </div>
                )}

                <div
                    style={{
                        borderTop: '1px solid #e2e8f0',
                        padding: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        {canSelect ? 'プレビューしたデッキを選択できます。' : 'ホストのみデッキ変更できます。'}
                    </div>
                    {onSelect && canSelect && (
                        <button
                            onClick={() => onSelect(previewDeckId)}
                            disabled={confirmDisabled}
                            style={{
                                padding: '10px 14px',
                                borderRadius: 12,
                                border: 'none',
                                background: confirmDisabled ? '#94a3b8' : '#2563eb',
                                color: '#fff',
                                fontWeight: 800,
                                cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                            }}
                            title={selectDisabledReason ?? (previewDeckId === selectedDeckId ? 'すでに選択中のデッキです' : '')}
                        >
                            {selectLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeckSelectModal;
