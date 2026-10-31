// =====================================================================
// 3 тоглогч зэрэг холбогдож join → reaction → гарах урсгалыг шалгах скрипт.
//
//   1-р terminal:  bun run dev
//   2-р terminal:  bun run test:ws
//
// BASE_URL=http://localhost:8787 (өөр порт бол env-ээр өг)
// =====================================================================

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8787';
const WS_URL = BASE_URL.replace(/^http/, 'ws');

type Msg = { type: string; [key: string]: unknown };

interface TestClient {
  name: string;
  ws: WebSocket;
  inbox: Msg[];
}

function connect(code: string, name: string, role: 'host' | 'player'): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/rooms/${code}/ws`);
    const client: TestClient = { name, ws, inbox: [] };
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as Msg;
      client.inbox.push(msg);
      console.log(`  ⬇ ${name.padEnd(6)} ← ${msg.type}`);
    });
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', name, role }));
      resolve(client);
    });
    ws.addEventListener('error', () => reject(new Error(`${name}: холбогдож чадсангүй`)));
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const count = (c: TestClient, type: string) => c.inbox.filter((m) => m.type === type).length;

function check(label: string, ok: boolean) {
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  // 1. HTTP-ээр өрөө үүсгэнэ
  const res = await fetch(`${BASE_URL}/rooms`, { method: 'POST' });
  const { code } = (await res.json()) as { code: string };
  console.log(`POST /rooms → ${res.status}, code=${code}\n`);

  // 2. Host + 2 тоглогч WebSocket-оор нэгдэнэ (дарааллаар — join мэдэгдэл тоолоход амар)
  const host = await connect(code, 'Багш', 'host');
  await wait(200);
  const bat = await connect(code, 'Бат', 'player');
  await wait(200);
  const saraa = await connect(code, 'Сараа', 'player');
  await wait(300);

  check('Бүгд welcome хүлээж авсан', [host, bat, saraa].every((c) => count(c, 'welcome') === 1));
  check('Host 2 player_joined мэдэгдэл авсан', count(host, 'player_joined') === 2);
  check('Бат 1 player_joined (Сараа) авсан', count(bat, 'player_joined') === 1);

  // 3. Нэг тоглогчийн reaction бүгдэд broadcast болох ёстой
  console.log('\nБат 🔥 илгээв');
  bat.ws.send(JSON.stringify({ type: 'reaction', emoji: '🔥' }));
  await wait(300);
  check('Reaction 3 хүнд бүгдэд нь хүрсэн', [host, bat, saraa].every((c) => count(c, 'reaction') === 1));

  // 4. HTTP polling endpoint ижил төлөвийг харуулах ёстой
  const state = (await (await fetch(`${BASE_URL}/rooms/${code}`)).json()) as { players: Record<string, unknown> };
  check('GET /rooms/:code → 3 тоглогч', Object.keys(state.players).length === 3);

  // 5. Сараа гарахад бусад нь player_left авна
  console.log('\nСараа гарав');
  saraa.ws.close(1000, 'bye');
  await wait(300);
  check('Host player_left авсан', count(host, 'player_left') === 1);
  check('Бат player_left авсан', count(bat, 'player_left') === 1);

  host.ws.close();
  bat.ws.close();
  await wait(100);
  console.log(process.exitCode ? '\nЗарим шалгалт амжилтгүй ❌' : '\nБүх шалгалт амжилттай 🎉');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
