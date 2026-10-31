import type { Env } from './env';

// Durable Object классыг Worker-ийн entry файлаас export хийх ЗААВАЛ шаардлагатай —
// эс бөгөөс wrangler "QuizRoom класс олдсонгүй" гэж алдаа өгнө.
export { QuizRoom } from './quiz-room';

/**
 * Worker = "хүлээн авагч / чиглүүлэгч" (stateless).
 * Өөрөө өрөөний төлөв хадгалахгүй — хүсэлтийг зөв Durable Object руу дамжуулна.
 *
 *   POST /rooms              → шинэ өрөө (6 оронтой код)
 *   GET  /rooms/:code        → өрөөний төлөв JSON (HTTP polling жишээ)
 *   GET  /rooms/:code/ws     → WebSocket холболт (Upgrade)
 *   GET  /                   → public/index.html (тест client, assets-аар)
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
      const state = await stub.getState();
      return state ? json(state) : json({ error: 'Өрөө олдсонгүй' }, 404);
    }

    // GET /rooms/:code/ws
    if (parts.length === 3 && parts[2] === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected Upgrade: websocket', { status: 426 });
      }
      // Хүсэлтийг бүтнээр нь DO руу дамжуулна — 101 хариуг DO өөрөө буцаана.
      return stub.fetch(request);
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
