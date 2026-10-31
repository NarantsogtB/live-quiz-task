# live-quiz-starter

**HOP ADVANCED — Том Төсөл 5 (Live Quiz Battle), Week 8 — Сурагчийн эхлэл код.**

Durable Object ашиглан "тоглоомын өрөө" үүсгэж, WebSocket-оор олон тоглогчийг нэг өрөөнд холбоно.

## Ажиллуулах

```bash
cd apps/live-quiz/live-quiz-starter
bun install
bun run dev            # http://localhost:8787 — тест client
bun run test:ws        # (өөр terminal) бүх TODO дууссан эсэхийг шалгана
```

## TODO-нууд (дарааллаар нь хий)

| # | Файл | Юу хийх |
|---|------|---------|
| 1 | `wrangler.jsonc` | Durable Object binding `QUIZ_ROOM` + migration `v1` |
| 2 | `src/types.ts` | `Answer` төрлийн 4 талбар |
| 3 | `src/index.ts` | `GET /rooms/:code` → `stub.getState()` |
| 4 | `src/index.ts` | `GET /rooms/:code/ws` → Upgrade шалгаад `stub.fetch(request)` |
| 5 | `src/quiz-room.ts` | `fetch()` дотор `WebSocketPair` + `acceptWebSocket` + `101` |
| 6 | `src/quiz-room.ts` | `webSocketMessage()` дотор `join` / `reaction` холбох |
| 7 | `src/quiz-room.ts` | `handleJoin()` — тоглогч нэмэх, welcome + player_joined |
| 8 | `src/quiz-room.ts` | `broadcast()` — `ctx.getWebSockets()` давтах |
| 9 | `src/quiz-room.ts` | `handleLeave()` — connected=false, player_left |

## Алдаа → аль TODO?

| Алдаа | Шалтгаан |
|-------|----------|
| `Cannot read properties of undefined (reading 'get')` | TODO 1 — binding байхгүй, `env.QUIZ_ROOM` undefined |
| `GET /rooms/:code` → `501 TODO 3` | TODO 3 |
| Browser: WebSocket шууд `onclose`, code 1006 | TODO 4 эсвэл 5 |
| Холбогдсон ч `welcome` ирэхгүй | TODO 6a эсвэл 7 |
| Өөрт welcome ирсэн ч бусдад нь `player_joined` ирэхгүй | TODO 8 |
| Хаахад бусдад `player_left` ирэхгүй | TODO 9 |

`bun run test:ws` бүх мөр ✅ болбол дууссан. 15 минутаас удаан гацвал алдааны бүтэн текстээ Discord-ийн Week 8 thread-д хуулж асуу.
