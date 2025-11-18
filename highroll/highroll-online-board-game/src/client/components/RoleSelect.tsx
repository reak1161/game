import React from 'react';
import type { Role } from '@shared/types';

type Props = {
    roles: Role[];
    selectedId?: string | null;
    onSelect: (roleId: string) => void;
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
}> = ({ role, active, onClick, onHover, onHoverEnd }) => {
    const { params } = role;
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => onHover?.(role)}
            onMouseLeave={() => onHoverEnd?.()}
            onFocus={() => onHover?.(role)}
            onBlur={() => onHoverEnd?.()}
            title={typeof role.text === 'string' ? role.text : undefined}
            style={{
                textAlign: 'left',
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: active ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: active ? '#eff6ff' : 'white',
                cursor: 'pointer',
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

const RoleSelect: React.FC<Props> = ({ roles, selectedId, onSelect }) => {
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

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ロールを検索（名前/タグ）"
                    style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                {selectedId && (
                    <span style={{ alignSelf: 'center', color: '#2563eb', fontSize: 12 }}>
                        選択: {selectedId}
                    </span>
                )}
            </div>

            <div
                style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 16,
                    background: '#fff',
                    marginBottom: 16,
                    minHeight: 120,
                }}
            >
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
                    </>
                ) : (
                    <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                        ロールカードにカーソルやフォーカスを合わせると詳細を表示します。
                    </p>
                )}
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: 12,
                }}
            >
                {filtered.map((role) => (
                    <RoleCard
                        key={role.id}
                        role={role}
                        active={role.id === selectedId}
                        onClick={() => onSelect(role.id)}
                        onHover={setHoveredRole}
                        onHoverEnd={() => setHoveredRole(null)}
                    />)
                )}
            </div>
        </div>
    );
};

export default RoleSelect;

