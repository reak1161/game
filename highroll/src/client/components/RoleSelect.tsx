import React from 'react';
import type { Role } from '@shared/types';
import styles from './RoleSelect.module.css';

type Props = {
    roles: Role[];
    selectedId?: string | null;
    onSelect: (roleId: string) => void;
    disabled?: boolean;
};

const StatBadge: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <span style={{
        display: 'inline-block',
        padding: '2px 6px',
        borderRadius: 6,
        background: '#f2f4f7',
        fontSize: 12,
        marginRight: 6,
    }}>
        {label}:{value}
    </span>
);

const RoleCard: React.FC<{
    role: Role;
    active: boolean;
    onClick: () => void;
    onHover?: (role: Role) => void;
    onHoverEnd?: () => void;
    disabled?: boolean;
}> = ({ role, active, onClick, onHover, onHoverEnd, disabled }) => {
    const { params } = role;
    return (
        <button
            onClick={disabled ? undefined : onClick}
            onMouseEnter={() => (disabled ? undefined : onHover?.(role))}
            onMouseLeave={() => (disabled ? undefined : onHoverEnd?.())}
            onFocus={() => (disabled ? undefined : onHover?.(role))}
            onBlur={() => (disabled ? undefined : onHoverEnd?.())}
            disabled={disabled}
            title={typeof role.text === 'string' ? role.text : undefined}
            style={{
                textAlign: 'left',
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: active ? '#eff6ff' : 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 16 }}>{role.name}</strong>
                {Array.isArray(role.tags) && role.tags.length > 0 && (
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                        {role.tags.join(', ')}
                    </span>
                )}
            </div>
            <div style={{ marginTop: 6 }}>
                <StatBadge label="HP" value={Number(params?.hp ?? 0)} />
                <StatBadge label="Atk" value={Number(params?.atk ?? 0)} />
                <StatBadge label="Def" value={Number(params?.def ?? 0)} />
                <StatBadge label="Spe" value={Number(params?.spe ?? 0)} />
                <StatBadge label="Bra" value={Number(params?.bra ?? 0)} />
            </div>
            {typeof role.text === 'string' && (
                <p style={{ marginTop: 8, color: '#334155', fontSize: 13, lineHeight: 1.3 }}>
                    {role.text}
                </p>
            )}
        </button>
    );
};

const RoleSelect: React.FC<Props> = ({ roles, selectedId, onSelect, disabled }) => {
    const [query, setQuery] = React.useState('');
    const [hoveredRole, setHoveredRole] = React.useState<Role | null>(null);
    const lowerQ = query.trim().toLowerCase();
    const filtered = roles.filter((r) => {
        if (!lowerQ) return true;
        const hay = [r.name, r.id, ...(Array.isArray(r.tags) ? r.tags : [])]
            .filter((x) => typeof x === 'string')
            .join(' ')
            .toLowerCase();
        return hay.includes(lowerQ);
    });
    const detailRole = hoveredRole ?? roles.find((role) => role.id === selectedId) ?? null;
    const detailText = detailRole ? (detailRole as any).detailText : null;

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ロールを検索（名前/タグ）"
                    disabled={disabled}
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                {selectedId && (
                    <span style={{ alignSelf: 'center', color: '#2563eb', fontSize: 12 }}>
                        選択: {selectedId}
                    </span>
                )}
            </div>

            <div className={styles.detailPanel}>
                {detailRole ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <strong style={{ fontSize: 18 }}>{detailRole.name}</strong>
                            {Array.isArray(detailRole.tags) && detailRole.tags.length > 0 && (
                                <span style={{ fontSize: 12, color: '#475569' }}>
                                    {detailRole.tags.join(', ')}
                                </span>
                            )}
                        </div>
                        <div style={{ marginTop: 8 }}>
                            <StatBadge label="HP" value={Number(detailRole.params?.hp ?? 0)} />
                            <StatBadge label="Atk" value={Number(detailRole.params?.atk ?? 0)} />
                            <StatBadge label="Def" value={Number(detailRole.params?.def ?? 0)} />
                            <StatBadge label="Spe" value={Number(detailRole.params?.spe ?? 0)} />
                            <StatBadge label="Bra" value={Number(detailRole.params?.bra ?? 0)} />
                        </div>
                        {typeof detailRole.text === 'string' && (
                            <p style={{ marginTop: 10, color: '#0f172a', lineHeight: 1.4, fontSize: 14 }}>
                                {detailRole.text}
                            </p>
                        )}
                        {typeof detailText === 'string' && (
                            <div style={{ marginTop: 10, color: '#0f172a', lineHeight: 1.5, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                                {detailText}
                            </div>
                        )}
                    </>
                ) : (
                    <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                        ロールカードにカーソルやフォーカスを合わせると詳細を表示します。
                    </p>
                )}
            </div>

            <div className={styles.cardsScroll}>
                <div className={styles.cardsGrid}>
                    {filtered.map((role) => (
                        <RoleCard
                            key={role.id}
                            role={role}
                            active={role.id === selectedId}
                            onClick={() => onSelect(role.id)}
                            onHover={setHoveredRole}
                            onHoverEnd={() => setHoveredRole(null)}
                            disabled={disabled}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default RoleSelect;

