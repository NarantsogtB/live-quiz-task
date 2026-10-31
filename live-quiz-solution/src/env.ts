import type { QuizRoom } from './quiz-room';

// Cloudflare Env — wrangler.jsonc-ийн binding-уудтай нэр нь яг таарах ёстой.
export interface Env {
  QUIZ_ROOM: DurableObjectNamespace<QuizRoom>;
  ASSETS: Fetcher;
}
