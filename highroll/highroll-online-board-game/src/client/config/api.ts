const normalizeBase = (raw?: string | null): string => {
    if (!raw) {
        return '';
    }
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const defaultDevServer = import.meta.env.DEV ? 'http://localhost:4000' : undefined;

export const API_BASE = normalizeBase(import.meta.env.VITE_SERVER_URL ?? defaultDevServer);

export const withApiBase = (path: string): string => (API_BASE ? `${API_BASE}${path}` : path);

export const SOCKET_URL = API_BASE || undefined;
