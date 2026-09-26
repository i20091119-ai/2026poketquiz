import { SUBJECTS, type Subject } from '@/lib/game-config';
import { nextExploreQuestion, secureRandom } from '@/lib/game-engine';
import { activeBank, json, readState } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/** 탐험: 그 과목에서 아직 맞히지 못한 문제 하나를 줍니다. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const subject = params.get('subject') as Subject;
    if (!SUBJECTS.includes(subject)) return json({ error: '과목을 다시 골라 주세요.' }, 400);
    const skip = Number(params.get('skip')) || undefined;
    const [bank, { state }] = await Promise.all([activeBank(), readState()]);
    return json({ question: nextExploreQuestion(state, bank, subject, secureRandom, skip) });
  } catch (error) {
    console.error('탐험 문제 읽기 실패', error);
    return json({ error: '문제를 불러오지 못했어요.' }, 503);
  }
}
