const normalizeBase = (raw?: string | null): string | undefined => {
    if (!raw) {
        return undefined;
    }
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const envServerUrl = normalizeBase(import.meta.env.VITE_SERVER_URL);
const defaultSameOrigin = !import.meta.env.DEV && typeof window !== 'undefined' ? window.location.origin : undefined;
const defaultDevBase = import.meta.env.DEV ? '' : undefined;

export const API_BASE = envServerUrl ?? defaultDevBase ?? defaultSameOrigin ?? '';

export const withApiBase = (path: string): string => (API_BASE ? `${API_BASE}${path}` : path);

export const SOCKET_URL = API_BASE || undefined;
