export type ClientMsg =
    | { t: 'join'; name: string }
    | { t: 'action'; payload: unknown }
    | { t: 'ping' };

export type ServerMsg =
    | { t: 'state'; state: unknown }
    | { t: 'error'; message: string }
    | { t: 'pong' };

