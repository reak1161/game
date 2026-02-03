import { API_BASE } from './env';

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

export const withApiBase = (path: string): string => {
    const normalized = normalizePath(path);
    if (!API_BASE) {
        return normalized;
    }
    if (API_BASE.endsWith('/api') && normalized.startsWith('/api/')) {
        return `${API_BASE}${normalized.slice('/api'.length)}`;
    }
    return `${API_BASE}${normalized}`;
};

export const SOCKET_URL = API_BASE || undefined;
