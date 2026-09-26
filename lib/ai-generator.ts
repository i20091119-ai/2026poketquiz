// AI 문제 생성 연결 자리입니다. 사용할 AI 서비스는 아직 정하지 않았습니다.
//
// 연결하는 방법:
// 1. 사용할 AI 서비스의 API 키를 Cloudflare Secret으로 등록합니다. (예: `npx wrangler secret put AI_API_KEY`)
// 2. 아래 generateQuestions 안에서 AI를 호출해, 과목마다 count개의 문제를 만들어 돌려주세요.
//    돌려준 문제는 normalizeQuestion으로 한 번 더 검사된 뒤 저장됩니다.
// 3. isAiConfigured가 true를 돌려주면 부모 화면에 "AI로 만들기" 버튼이 켜집니다.
import type { Subject } from './game-config.ts';
import type { QuestionInput } from './question-import.ts';

export type GenerateRequest = {
  grade: string;
  subject: Subject;
  keywords: string;
  count: number;
};

export function isAiConfigured(env: Cloudflare.Env): boolean {
  void env;
  return false;
}

export async function generateQuestions(env: Cloudflare.Env, request: GenerateRequest): Promise<QuestionInput[]> {
  void env; void request;
  throw new Error('AI 문제 생성이 아직 연결되지 않았어요. 구글 시트로 문제를 올려 주세요.');
}
