const normalizeBase = (raw?: string | null): string | undefined => {
    if (!raw) {
        return undefined;
    }
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

// 優先順位：VITE_API_BASE → VITE_SERVER_URL（過去互換）→（devは同一オリジン /api）
const rawApiBase = normalizeBase(import.meta.env.VITE_API_BASE);
const rawLegacyServerUrl = normalizeBase(import.meta.env.VITE_SERVER_URL);

const defaultDevBase =
    import.meta.env.DEV && typeof window !== 'undefined' ? `${window.location.origin}/api` : undefined;

export const API_BASE = rawApiBase ?? rawLegacyServerUrl ?? defaultDevBase ?? '/api';

export const wsBase = (base: string): string => {
    if (base.startsWith('/')) {
        const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${location.host}${base}`;
    }
    return base.replace(/^http/i, 'ws');
};

