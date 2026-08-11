const normalizeBase = (raw?: string | null): string | undefined => {
    if (!raw) return undefined;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const rawApiBase = normalizeBase(import.meta.env.VITE_API_BASE);
const rawLegacyServerUrl = normalizeBase(import.meta.env.VITE_SERVER_URL);

// 開発時のデフォルト:
// - 自分のPCで http://localhost:5173 を開く場合は、Vite の WS proxy が環境によって不安定なため 4000 直結を優先。
// - Cloudflare Tunnel / 別PC / LAN から開く場合は、観戦側のPCの "localhost:4000" を見に行ってしまうので必ず /api を使う。
const defaultDevBase = (() => {
    if (!import.meta.env.DEV) return undefined;
    if (typeof location === 'undefined') return '/api';
    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'http://localhost:4000/api';
    }
    return '/api';
})();

export const API_BASE = rawApiBase ?? rawLegacyServerUrl ?? defaultDevBase ?? '/api';

export const wsBase = (base: string): string => {
    if (base.startsWith('/')) {
        const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
        return `${protocol}://${location.host}${base}`;
    }
    return base.replace(/^http/i, 'ws');
};
