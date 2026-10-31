# live-quiz-solution

**HOP ADVANCED — Том Төсөл 5 (Live Quiz Battle), Week 8 — БАГШИЙН бүрэн шийдэл.**
Сурагчдын хувилбар: `../live-quiz-starter` (TODO-тэй).

Стек: **Cloudflare Workers + Durable Objects (SQLite storage) + WebSocket Hibernation API**.

## Ажиллуулах

```bash
cd apps/live-quiz/live-quiz-solution
bun install
bun run dev            # http://localhost:8787 — browser-оор нээвэл тест client
bun run test:ws        # (өөр terminal) 3 тоглогчийн автомат шалгалт
bun run typecheck
```

## Folder бүтэц

```
wrangler.jsonc       Durable Object binding (QUIZ_ROOM) + migration (new_sqlite_classes) + assets
src/
  index.ts           Worker (stateless router): POST /rooms, GET /rooms/:code, GET /rooms/:code/ws
  quiz-room.ts       QuizRoom Durable Object — нэг өрөө = нэг instance, WebSocket-уудыг барина
  types.ts           Data model (Room, Player, Question, Answer) + мессежийн протокол
  env.ts             Env interface (wrangler.jsonc-тэй таарах ёстой)
public/index.html    Тест client: өрөө үүсгэх, нэгдэх, emoji reaction, Polling vs WebSocket тоолуур
scripts/ws-test.ts   Bun скрипт: host + 2 тоглогч → join, reaction broadcast, leave шалгана
```

## Урсгал

```
Browser ──POST /rooms──▶ Worker ──idFromName(code)──▶ QuizRoom.init(code)   (RPC)
Browser ──GET /rooms/:code/ws (Upgrade)──▶ Worker ──stub.fetch()──▶ QuizRoom.fetch()
                                   ◀────────── 101 Switching Protocols ─────────┘
Browser ══{type:"join"}══▶ QuizRoom.webSocketMessage() ══broadcast══▶ бүх тоглогч
```

## Анхаарах

- `compatibility_date` = `2026-06-22` — repo-ийн local wrangler (4.103)-ийн workerd дэмжих хамгийн сүүлийн огноо
  `2026-06-24` тул. Wrangler шинэчилбэл огноог ахиулж болно.
- `wrangler dev --local` дээр DO-ийн storage `.wrangler/state/` дотор хадгалагдана — цэвэрлэх бол тэр фолдерыг устга.
