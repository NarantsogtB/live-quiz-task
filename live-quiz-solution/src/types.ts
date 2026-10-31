// =====================================================================
// Room / Session Data Model — "Live Quiz Battle"-ийн гол 4 объект
//
//   Room (өрөө) ─┬─ host: 1 хүн (асуулт удирдана, том дэлгэц)
//                ├─ players: олон тоглогч (утаснаасаа нэгдэнэ)
//                ├─ questions: асуултын жагсаалт
//                └─ answers: тоглогч бүрийн хариулт (асуулт бүрт)
//
// Week 8: өрөө үүсгэх + нэгдэх (lobby). Question/Answer-ийг Week 9–10-д ашиглана,
// гэхдээ бүтцийг нь одоо тодорхойлж байна — data model эхэлж, код дараа нь.
// =====================================================================

export type RoomStatus = 'lobby' | 'question' | 'ended';
export type Role = 'host' | 'player';

export interface Player {
  id: string;
  name: string;
  role: Role;
  score: number;
  joinedAt: number; // Date.now()
  connected: boolean; // WebSocket одоо нээлттэй эсэх (Week 9: reconnect)
}

export interface Question {
  id: string;
  text: string;
  options: string[]; // 4 сонголт
  correctIndex: number; // зөвхөн серверт! client руу хэзээ ч бүү илгээ
  timeLimitSec: number;
}

export interface Answer {
  playerId: string;
  questionId: string;
  optionIndex: number;
  answeredAt: number; // хурдад суурилсан оноо (Week 10) үүнээс тооцогдоно
}

export interface Room {
  code: string; // 6 оронтой, жишээ нь "482913"
  hostId: string | null;
  status: RoomStatus;
  players: Record<string, Player>; // id -> Player (хайлт хурдан)
  questions: Question[];
  currentQuestionIndex: number; // -1 = асуулт эхлээгүй
  answers: Answer[];
  createdAt: number;
}

// Client руу илгээх "аюулгүй" хувилбар — questions (correctIndex-тэй) болон answers-ийг нууна.
export type PublicRoom = Omit<Room, 'questions' | 'answers'> & {
  questionCount: number;
};

// =====================================================================
// WebSocket мессежийн протокол — discriminated union
// `type` талбараар нь TypeScript аль мессеж болохыг автоматаар ялгана.
// =====================================================================

// Client -> Server
export type ClientMessage =
  | { type: 'join'; name: string; role: Role }
  | { type: 'reaction'; emoji: string }
  | { type: 'ping' };

// Server -> Client
export type ServerMessage =
  | { type: 'welcome'; playerId: string; room: PublicRoom }
  | { type: 'player_joined'; player: Player }
  | { type: 'player_left'; playerId: string }
  | { type: 'reaction'; playerId: string; name: string; emoji: string }
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; message: string };

// WebSocket бүрт "наасан" жижиг мэдээлэл. Hibernation-ий дараа ч хадгалагдана
// (in-memory хувьсагч устдаг, харин attachment үлддэг).
export interface WsAttachment {
  playerId: string | null; // join хийгээгүй бол null
}
