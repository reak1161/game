export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
} as const;

export const jsonText = (value: unknown) => JSON.stringify(value);

export const jsonResponse = (value: unknown, init: ResponseInit = {}): Response =>
  new Response(jsonText(value), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers ?? {}),
    },
  });

export const jsonErrorResponse = (message: string, status = 400): Response =>
  jsonResponse({ message }, { status });

export const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
export const NAME_MAX_LENGTH = 8;
export const MAX_PLAYERS = 6;
export const LOBBY_ROOM_TTL_MS = 60 * 60 * 1000;

export const isValidName = (name: string): boolean =>
  name.length > 0 && [...name].length <= NAME_MAX_LENGTH && NAME_REGEX.test(name);
