import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import type {
  ClientMessage,
  Player,
  PublicRoom,
  Question,
  Room,
  ServerMessage,
  WsAttachment,
} from './types';

// Week 8-д асуулт эхлүүлэхгүй ч data model-ийг бүрэн харуулахын тулд жишээ асуулт хийнэ.
const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: 'WebSocket холболт ямар HTTP статус кодоор эхэлдэг вэ?',
    options: ['200 OK', '101 Switching Protocols', '301 Moved', '404 Not Found'],
    correctIndex: 1,
    timeLimitSec: 20,
  },
  {
    id: 'q2',
    text: 'Нэг Durable Object ID-д дэлхий дээр хэдэн instance зэрэг ажилладаг вэ?',
    options: ['0', 'Яг 1', 'Data center бүрт 1', 'Хязгааргүй'],
    correctIndex: 1,
    timeLimitSec: 20,
  },
];

/**
 * QuizRoom — НЭГ тоглоомын өрөө = НЭГ Durable Object instance.
 *
 * - Worker `env.QUIZ_ROOM.idFromName("482913")` гэж дуудахад Cloudflare яг энэ өрөөний
 *   instance руу (дэлхий дээр ганцхан) хүсэлтийг чиглүүлнэ.
 * - Бүх тоглогчийн WebSocket энд ирж "нэг өрөөнд" цугларна → broadcast боломжтой.
 * - Instance нэг thread-тэй: мессежүүд нэг нэгээр нь боловсруулагдана (race condition бага).
 */
export class QuizRoom extends DurableObject<Env> {
  // In-memory cache. Hibernation/restart болоход устна → storage-оос дахин ачаална.
  private room: Room | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Constructor дуусахаас өмнө ирсэн хүсэлтүүдийг хүлээлгэнэ → room ачаалагдаагүй байхад
    // мессеж боловсруулах эрсдэлгүй. Hibernation-аас сэрэх бүрт constructor дахин ажиллана.
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<Room>('room')) ?? null;
    });
  }

  // ------------------------------------------------------------------
  // RPC методууд — Worker `stub.init(code)` гэж шууд дуудна (fetch шаардлагагүй)
  // ------------------------------------------------------------------

  /** Өрөөг анх удаа үүсгэнэ. Код давхардсан (өрөө аль хэдийн байгаа) бол false. */
  async init(code: string): Promise<boolean> {
    if (this.room) return false;
    this.room = {
      code,
      hostId: null,
      status: 'lobby',
      players: {},
      questions: SAMPLE_QUESTIONS,
      currentQuestionIndex: -1,
      answers: [],
      createdAt: Date.now(),
    };
    await this.save();
    return true;
  }

  /** HTTP polling жишээнд ашиглана: өрөөний одоогийн төлөв (эсвэл null). */
  async getState(): Promise<PublicRoom | null> {
    return this.room ? toPublic(this.room) : null;
  }

  // ------------------------------------------------------------------
  // WebSocket upgrade — RPC-ээр WebSocket дамжуулж болохгүй тул fetch() ашиглана
  // ------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    if (!this.room) {
      return new Response('Room not found', { status: 404 });
    }

    // WebSocketPair = хоёр үзүүртэй "утас": client үзүүрийг browser руу буцаана,
    // server үзүүрийг энэ Durable Object өөртөө барина.
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API: ws.accept()-ийн оронд ctx.acceptWebSocket() ашиглана.
    // Ингэснээр мессеж ирээгүй үед DO санах ойгоос "унтаж" (hibernate) болох ч
    // WebSocket холболт тасрахгүй — мессеж ирэхэд webSocketMessage() дуудагдаж сэрнэ.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies WsAttachment);

    // 101 Switching Protocols — HTTP холболт энэ мөчөөс WebSocket болж хувирна.
    return new Response(null, { status: 101, webSocket: client });
  }

  // ------------------------------------------------------------------
  // Hibernation handler-ууд — Cloudflare runtime өөрөө дуудна
  // ------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const msg = parseClientMessage(raw);
    if (!msg) {
      send(ws, { type: 'error', message: 'Мессеж буруу форматтай (JSON {type: ...} байх ёстой)' });
      return;
    }

    switch (msg.type) {
      case 'join':
        await this.handleJoin(ws, msg.name, msg.role);
        return;
      case 'reaction':
        this.handleReaction(ws, msg.emoji);
        return;
      case 'ping':
        send(ws, { type: 'pong', serverTime: Date.now() });
        return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.handleLeave(ws);
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleLeave(ws);
  }

  // ------------------------------------------------------------------
  // Бизнес логик
  // ------------------------------------------------------------------

  private async handleJoin(ws: WebSocket, rawName: string, role: Player['role']) {
    const room = this.room!;
    const attachment = ws.deserializeAttachment() as WsAttachment;
    if (attachment.playerId) {
      send(ws, { type: 'error', message: 'Та аль хэдийн нэгдсэн байна' });
      return;
    }

    const name = String(rawName ?? '').trim().slice(0, 20);
    if (!name) {
      send(ws, { type: 'error', message: 'Нэрээ оруулна уу' });
      return;
    }
    if (role === 'host' && room.hostId) {
      send(ws, { type: 'error', message: 'Энэ өрөөнд host аль хэдийн байна' });
      return;
    }

    const player: Player = {
      id: crypto.randomUUID().slice(0, 8),
      name,
      role: role === 'host' ? 'host' : 'player',
      score: 0,
      joinedAt: Date.now(),
      connected: true,
    };
    room.players[player.id] = player;
    if (player.role === 'host') room.hostId = player.id;
    await this.save();

    // Энэ WebSocket хэнийх болохыг санана (hibernation-ий дараа ч мэдэгдэнэ).
    ws.serializeAttachment({ playerId: player.id } satisfies WsAttachment);

    send(ws, { type: 'welcome', playerId: player.id, room: toPublic(room) });
    this.broadcast({ type: 'player_joined', player }, ws);
  }

  private handleReaction(ws: WebSocket, emoji: string) {
    const { playerId } = ws.deserializeAttachment() as WsAttachment;
    const player = playerId ? this.room!.players[playerId] : undefined;
    if (!player) {
      send(ws, { type: 'error', message: 'Эхлээд join хийнэ үү' });
      return;
    }
    // Илгээгчийг оруулаад БҮГДЭД нь (except параметргүй).
    this.broadcast({ type: 'reaction', playerId: player.id, name: player.name, emoji: String(emoji).slice(0, 4) });
  }

  private async handleLeave(ws: WebSocket) {
    const { playerId } = (ws.deserializeAttachment() as WsAttachment | null) ?? { playerId: null };
    const player = playerId ? this.room?.players[playerId] : undefined;
    if (!player || !player.connected) return;

    // Устгахгүй, зөвхөн "connected: false" болгоно → Week 9-д reconnect хийх боломжтой.
    player.connected = false;
    await this.save();
    this.broadcast({ type: 'player_left', playerId: player.id }, ws);
  }

  /** Өрөөнд холбогдсон (join хийсэн) бүх WebSocket руу илгээнэ. */
  private broadcast(message: ServerMessage, except?: WebSocket) {
    // getWebSockets() — энэ DO-ийн acceptWebSocket() хийсэн бүх холболт.
    // In-memory массив биш тул hibernation-ий дараа ч бүрэн жагсаалт буцаана.
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      const { playerId } = socket.deserializeAttachment() as WsAttachment;
      if (!playerId) continue; // join хийгээгүй холболтыг алгасна
      send(socket, message);
    }
  }

  private async save() {
    await this.ctx.storage.put('room', this.room);
  }
}

// ----------------------------------------------------------------------
// Туслах функцууд
// ----------------------------------------------------------------------

function send(ws: WebSocket, message: ServerMessage) {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Холболт хаагдаж байгаа үед send алдаа өгч болно — webSocketClose цэвэрлэнэ.
  }
}

function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data.type === 'string' && ['join', 'reaction', 'ping'].includes(data.type)) {
      return data as ClientMessage;
    }
  } catch {
    // JSON биш
  }
  return null;
}

function toPublic(room: Room): PublicRoom {
  const { questions, answers: _answers, ...rest } = room;
  return { ...rest, questionCount: questions.length };
}
