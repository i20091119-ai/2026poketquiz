// 이 요청이 "누구의 기록"을 쓰는지 정합니다.
// - 평소: 아이의 진짜 기록(family), 오늘 = 한국 시간 오늘
// - 보호자가 개발자 메뉴에서 시뮬레이션을 켜면 그 브라우저에 pq_sim 쿠키가 생기고,
//   그 브라우저의 아이 화면·포켓로그는 모두 시험용 기록(sim)을 씁니다. 오늘 = 진짜 오늘 + "다음 날로 넘기기" 횟수.
// - 쿠키는 보호자 비밀번호로 서명되어 있어 아무나 만들 수 없고, 아이 기기에는 없으므로 아이 기록은 바뀌지 않습니다.
import { env } from 'cloudflare:workers';
import { shiftDate, todayKorea } from '../game-engine.ts';
import { sameText, sign } from './parent-auth.ts';
import { getSimDayOffset, REAL_PLAYER, SIM_PLAYER, type PlayerId } from './store.ts';

const COOKIE = 'pq_sim';
const MAX_AGE = 60 * 60 * 24 * 7; // 7일 (끝내기를 잊어도 일주일 뒤엔 저절로 풀림)

export type Player = {
  id: PlayerId;
  /** 이 기록 기준의 "오늘" (YYYY-MM-DD) */
  today: string;
  /** 시뮬레이션이면 날짜 정보, 아니면 null */
  sim: { today: string; dayOffset: number } | null;
};

async function hasSimCookie(request: Request) {
  if (!env.PARENT_PASSWORD) return false;
  const cookie = request.headers.get('cookie') ?? '';
  const value = cookie.split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!value) return false;
  const [expires, sig] = value.split('.');
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  return sameText(sig, await sign('sim:' + expires, env.PARENT_PASSWORD));
}

/** 이 요청이 쓸 기록과 오늘 날짜 */
export async function playerOf(request: Request): Promise<Player> {
  const realToday = todayKorea();
  if (!(await hasSimCookie(request))) return { id: REAL_PLAYER, today: realToday, sim: null };
  const dayOffset = await getSimDayOffset();
  const today = shiftDate(realToday, dayOffset);
  return { id: SIM_PLAYER, today, sim: { today, dayOffset } };
}

/** 시뮬레이션 켜기 쿠키 (보호자 요청에만 발급) */
export async function simStartCookie(request: Request) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const value = `${expires}.${await sign('sim:' + expires, env.PARENT_PASSWORD ?? '')}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}
/** 시뮬레이션 끝내기 (쿠키 지우기) */
export const simStopCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/** 이 요청의 브라우저가 지금 시뮬레이션 중인지 (보호자 화면 표시용) */
export const isSimulating = (request: Request) => hasSimCookie(request);
