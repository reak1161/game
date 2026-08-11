export const generateUuid = (): string => {
    if (typeof globalThis !== 'undefined' && 'crypto' in globalThis) {
        const cryptoObj = globalThis.crypto as Crypto | undefined;
        if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
            return cryptoObj.randomUUID();
        }
    }
    return `id-${Math.random().toString(36).slice(2, 11)}`;
};
