import GameEngine from "../../src/server/game/engine";
import { buildDeckCards, getCardsCatalog, getRolesCatalog } from "./highrollCatalog";
import type { CardDefinition, GameState, Role } from "../../src/shared/types";

type Env = {
  ROOMS: DurableObjectNamespace;
};

type StoredRoom = {
  roomId: string;
  deckId: string;
  state: GameState;
};

type ClientMsg =
  | { t: "join"; name: string }
  | { t: "action"; payload: any }
  | { t: "ping" };

type ServerMsg =
  | { t: "state"; state: any }
  | { t: "error"; message: string }
  | { t: "pong" };

const jsonText = (value: unknown) => JSON.stringify(value);

const NAME_REGEX = /^[0-9A-Za-z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+$/;
const NAME_MAX_LENGTH = 8;
const isValidName = (name: string): boolean =>
  name.length > 0 && [...name].length <= NAME_MAX_LENGTH && NAME_REGEX.test(name);

const normalizeCatalog = (): { roles: Role[]; cards: CardDefinition[] } => ({
  roles: getRolesCatalog(),
  cards: getCardsCatalog(),
});

export class RoomDO implements DurableObject {
  private sockets = new Set<WebSocket>();
  private engine: GameEngine | null = null;
  private roomId: string | null = null;
  private deckId: string | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly _env: Env,
  ) {}

  private safeSend(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(jsonText(msg));
    } catch {
      // noop
    }
  }

  private broadcast(msg: ServerMsg): void {
    for (const ws of this.sockets) this.safeSend(ws, msg);
  }

  private broadcastState(): void {
    if (!this.engine) return;
    this.broadcast({ t: "state", state: this.engine.getState() });
  }

  private async load(): Promise<void> {
    if (this.engine) return;
    const stored = await this.state.storage.get<StoredRoom>("room");
    if (!stored) return;
    this.roomId = stored.roomId;
    this.deckId = stored.deckId;
    this.engine = new GameEngine(stored.roomId, [], { catalog: normalizeCatalog(), state: stored.state });
  }

  private async persist(): Promise<void> {
    if (!this.engine || !this.roomId || !this.deckId) return;
    const stored: StoredRoom = {
      roomId: this.roomId,
      deckId: this.deckId,
      state: this.engine.getState(),
    };
    await this.state.storage.put("room", stored);
  }

  private requireEngine(): GameEngine {
    if (!this.engine) {
      throw new Error("room_not_initialized");
    }
    return this.engine;
  }

  private async ensureRoom(roomId: string): Promise<void> {
    if (this.engine) return;
    const catalog = normalizeCatalog();
    const engine = new GameEngine(roomId, [], { catalog });
    const deckId = "default_60";
    engine.assignSharedDeck(deckId, buildDeckCards(deckId));
    this.engine = engine;
    this.roomId = roomId;
    this.deckId = deckId;
    await this.persist();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId") ?? this.state.id.toString();
    await this.load();
    await this.ensureRoom(roomId);

    if (url.pathname === "/state" && request.method === "GET") {
      const engine = this.requireEngine();
      return new Response(jsonText(engine.getState()), {
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected websocket", { status: 400 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();

      this.sockets.add(server);

      // 接続直後に必ず state を送る
      this.broadcastState();

      let joined = false;

      server.addEventListener("message", async (event) => {
        let msg: ClientMsg | null = null;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          this.safeSend(server, { t: "error", message: "不正なJSONです" });
          return;
        }

        if (msg.t === "ping") {
          this.safeSend(server, { t: "pong" });
          return;
        }

        if (msg.t === "join") {
          if (joined) return;
          const name = String(msg.name ?? "").trim();
          if (!isValidName(name)) {
            this.safeSend(server, { t: "error", message: "名前は8文字以内で、英数字/ひらがな/カタカナ/漢字のみ使用できます。" });
            return;
          }
          const engine = this.requireEngine();
          const player = engine.addPlayer(name);
          engine.markPlayerReady(player.id, true);
          joined = true;
          await this.persist();
          this.broadcastState();
          return;
        }

        if (msg.t === "action") {
          // ここは将来的に「engine の操作」へ置き換える（payloadの形を確定後）
          // 今は "state再送" だけ保証しておく
          await this.persist();
          this.broadcastState();
          return;
        }
      });

      server.addEventListener("close", async () => {
        this.sockets.delete(server);
        await this.persist();
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }
}
