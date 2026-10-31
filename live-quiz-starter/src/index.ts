import type { Env } from './env';

// Durable Object классыг Worker-ийн entry файлаас export хийх ЗААВАЛ шаардлагатай —
// эс бөгөөс wrangler "QuizRoom класс олдсонгүй" гэж алдаа өгнө.
export { QuizRoom } from './quiz-room';

/**
 * Worker = "хүлээн авагч / чиглүүлэгч" (stateless).
 * Өөрөө өрөөний төлөв хадгалахгүй — хүсэлтийг зөв Durable Object руу дамжуулна.
 *
 *   POST /rooms              → шинэ өрөө (6 оронтой код)          ✅ бэлэн
 *   GET  /rooms/:code        → өрөөний төлөв JSON (polling)        TODO 3
 *   GET  /rooms/:code/ws     → WebSocket холболт (Upgrade)         TODO 4
 *   GET  /                   → public/index.html (тест client)     ✅ бэлэн
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // "/rooms/482913/ws" → ["rooms","482913","ws"]

    if (parts[0] !== 'rooms') {
      return new Response('Not found', { status: 404 });
    }

    // POST /rooms
    if (parts.length === 1 && request.method === 'POST') {
      return createRoom(env);
    }

    const code = parts[1];
    if (!code || !/^\d{6}$/.test(code)) {
      return json({ error: 'Өрөөний код 6 оронтой тоо байх ёстой' }, 400);
    }

    // Нэг код → үргэлж НЭГ ижил ID → дэлхий дээр НЭГ ижил instance.
    const stub = env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName(code));

    // GET /rooms/:code
    if (parts.length === 2 && request.method === 'GET') {
      // TODO 3: stub.getState()-ийг (RPC) дуудаж, өрөө байвал JSON-оор, байхгүй бол 404 буцаа.
      //   Санаа: доорх createRoom() доторх stub.init(code) дуудлагыг хар — яг адилхан.
      void stub;
      return json({ error: 'TODO 3' }, 501);
    }

    // GET /rooms/:code/ws
    if (parts.length === 3 && parts[2] === 'ws') {
      // TODO 4:
      //   (а) request.headers.get('Upgrade') нь 'websocket' биш бол 426 буцаа.
      //   (б) Хүсэлтийг бүтнээр нь Durable Object руу дамжуул: return stub.fetch(request)
      //   Асуулт: яагаад энд WebSocketPair үүсгэхгүй, DO руу дамжуулж байна вэ?
      return new Response('TODO 4', { status: 501 });
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function createRoom(env: Env): Promise<Response> {
  // Санамсаргүй код давхцах магадлал бага ч, давхцвал дахин оролдоно.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const stub = env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName(code));
    if (await stub.init(code)) {
      return json({ code }, 201);
    }
  }
  return json({ error: 'Өрөө үүсгэж чадсангүй, дахин оролдоно уу' }, 500);
}

function generateRoomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
