// 포켓몬 마을 레벨·열쇠로 넓히는 땅 (2026-11-14 부모님).
// - "마을이 너무 작아서 만든 거 놓기 힘듦" → 레벨이 오르면 땅이 넓어짐.
// - 같은 날: 처음 마을은 넓은 사각형의 위쪽 가운데. 레벨이 오를 때마다 열쇠 1개 → 아이가 자물쇠 땅(왼쪽·오른쪽·아래) 중
//   지금 열린 땅에 붙어 있는 것 하나를 골라서 엶. 계속 레벨이 오르면 바깥으로 계속 넓어짐.
// - 지도 전체(lib/village.ts MAP_X0~, MAP_W × MAP_H)는 처음부터 있고, 안 열린 구역은 걷기·놓기 안 됨(안개 + 🔒 팻말).
// - 왼쪽 땅은 x가 음수라 처음 마을(x 0~11, y 0~19)의 칸 번호는 그대로 (아이가 놓은 꾸미기·길·나무 자리가 안 움직임).
// - 레벨 = 마을 별(⭐) 누적. 별은 마을에서 한 일로 (숫자는 lib/village-craft.ts CRAFT_DEFAULT, 보호자 전체 설정).

import { eunNeun } from './game-config.ts';

/** 구역 격자: 가로 5칸(A~E) × 세로 3줄(1~3). 처음 마을 = C1 (위쪽 가운데) */
const COLS = [{ x: -16, w: 8 }, { x: -8, w: 8 }, { x: 0, w: 12 }, { x: 12, w: 8 }, { x: 20, w: 8 }];
const ROWS = [{ y: 0, h: 20 }, { y: 20, h: 10 }, { y: 30, h: 10 }];
const NAMES: Record<string, { name: string; emoji: string; about: string }> = {
  C1: { name: '처음 마을', emoji: '🏡', about: '서준이 집이 있는 곳' },
  B1: { name: '왼쪽 숲', emoji: '🌲', about: '숲 연못과 밭이 있어' },
  D1: { name: '오른쪽 풀밭', emoji: '🌼', about: '넓은 풀밭, 꾸미기 하기 좋아' },
  A1: { name: '꽃 들판', emoji: '🌸', about: '꽃이 가득한 들판' },
  E1: { name: '버섯 숲', emoji: '🍄', about: '버섯이 자라는 숲' },
  B2: { name: '언덕 풀밭', emoji: '⛰️', about: '작은 연못이 있는 언덕' },
  C2: { name: '아래쪽 숲길', emoji: '🌳', about: '숲속 길과 밭' },
  D2: { name: '강가 모래밭', emoji: '🏞️', about: '큰 호수가 있어' },
  A2: { name: '서쪽 호수', emoji: '💧', about: '물가에 밭이 있어' },
  E2: { name: '바위 언덕', emoji: '🪨', about: '돌멩이를 캘 바위가 많아' },
  A3: { name: '소나무 숲', emoji: '🌲', about: '키 큰 소나무 숲' },
  B3: { name: '꽃길', emoji: '🌷', about: '꽃이 핀 길과 밭' },
  C3: { name: '남쪽 연못', emoji: '🐸', about: '연못 옆 열매나무 자리' },
  D3: { name: '모래 해변', emoji: '🏖️', about: '바다가 보이는 해변' },
  E3: { name: '깊은 숲', emoji: '🌳', about: '조용한 깊은 숲' },
};
export type Region = { id: string; col: number; row: number; name: string; emoji: string; about: string; x: number; y: number; w: number; h: number };
export const REGIONS: Region[] = ROWS.flatMap((r, row) => COLS.map((c, col) => {
  const id = 'ABCDE'[col] + (row + 1);
  return { id, col, row, ...NAMES[id], x: c.x, y: r.y, w: c.w, h: r.h };
}));
export const GRID = { cols: COLS.length, rows: ROWS.length };
/** 처음부터 열린 구역 */
export const START_REGION = 'C1';
/** 최고 레벨 = 처음 1 + 열 수 있는 구역 수 */
export const MAX_LEVEL = REGIONS.length;

/** 이 칸의 구역 (지도 밖이면 null) */
export function regionAt(x: number, y: number): Region | null {
  return REGIONS.find(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h) ?? null;
}
/** 열린 구역에 있는 칸인지 (open = 열린 구역 id 목록) */
export const isOpenCell = (x: number, y: number, open: readonly string[]) => { const r = regionAt(x, y); return !!r && open.includes(r.id); };
/** 안 열린 칸에 놓거나 가려고 할 때 아이에게 보여 줄 말 */
export const lockedText = (x: number, y: number) => `🔒 ${eunNeun(regionAt(x, y)?.name ?? '여기')} 아직 잠겨 있어. 마을 레벨을 올려서 🔑 열쇠로 열어 줘!`;

/** 열린 구역 목록 (처음 마을 + 아이가 열쇠로 연 곳, 모르는 id는 뺌) */
export function openRegions(opened: readonly string[] | undefined): string[] {
  return [START_REGION, ...(opened ?? []).filter(id => id !== START_REGION && REGIONS.some(r => r.id === id))];
}
const neighbors = (r: Region) => REGIONS.filter(q => Math.abs(q.col - r.col) + Math.abs(q.row - r.row) === 1);
export type Dir = 'left' | 'right' | 'down' | 'up';
/** 열쇠로 열 수 있는 구역: 아직 잠겼고, 열린 구역과 맞닿은 곳. dir = 붙어 있는 열린 땅에서 본 방향 */
export function choosableRegions(open: readonly string[]): (Region & { dir: Dir })[] {
  return REGIONS.filter(r => !open.includes(r.id)).flatMap(r => {
    const from = neighbors(r).find(q => open.includes(q.id));
    if (!from) return [];
    const dir: Dir = r.col < from.col ? 'left' : r.col > from.col ? 'right' : r.row > from.row ? 'down' : 'up';
    return [{ ...r, dir }];
  });
}
export const DIR_TEXT: Record<Dir, string> = { left: '⬅️ 왼쪽', right: '➡️ 오른쪽', down: '⬇️ 아래', up: '⬆️ 위' };

/** 별 → 레벨. needs[i] = 레벨 i+2가 되려면 그 전 레벨에서 더 필요한 별 */
export function levelOfStars(stars: number, needs: number[]): { level: number; into: number; next: number | null } {
  let level = 1, used = 0;
  for (const n of needs) {
    if (level >= MAX_LEVEL) break;
    if (stars < used + n) return { level, into: stars - used, next: n };
    used += n;
    level += 1;
  }
  return { level, into: stars - used, next: null };
}
