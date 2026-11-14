// 포켓몬 마을 레벨·넓어지는 지도 (2026-11-14 부모님: "마을이 너무 작아서 만든 거 놓기 힘듦" → 레벨이 오르면 지도 확장).
// - 지도 전체(lib/village.ts MAP_W × MAP_H)는 처음부터 있고, 구역마다 열리는 레벨이 있음. 안 열린 구역은 걷기·놓기 안 됨(안개 + 🔒 팻말).
// - 처음 마을(12×20)이 넓은 사각형의 위쪽 가운데 (2026-11-14 부모님). 왼쪽 땅은 x가 음수라 처음 마을의 칸 번호는 그대로
//   (아이가 놓은 꾸미기·길·나무 자리가 안 움직임).
// - 레벨 = 마을 별(🏡⭐) 누적. 별은 마을에서 한 일로: 새 손님 만남·서식지에 손님이 온 날·만들기·볼/묘목 만들기·열매 따기.
//   마을은 오늘 미션을 끝내야 열리므로 결국 공부한 날에만 쌓임. 숫자는 lib/village-craft.ts CRAFT_DEFAULT(보호자 전체 설정).

/** 구역: 열리는 레벨 · 이름 · 칸 범위(왼쪽 위 x,y + 너비·높이) */
export const REGIONS = [
  { level: 1, name: '처음 마을', x: 0, y: 0, w: 12, h: 20 },
  { level: 2, name: '오른쪽 풀밭', x: 12, y: 0, w: 8, h: 20 },
  { level: 3, name: '왼쪽 숲', x: -8, y: 0, w: 8, h: 20 },
  { level: 4, name: '아래쪽 숲길', x: 0, y: 20, w: 12, h: 10 },
  { level: 5, name: '강가 모래밭', x: 12, y: 20, w: 8, h: 10 },
  { level: 6, name: '언덕 풀밭', x: -8, y: 20, w: 8, h: 10 },
] as const;
export const MAX_LEVEL = REGIONS.length;

/** 이 칸이 열리는 레벨 (지도 밖이면 99) */
export function levelAt(x: number, y: number): number {
  const r = REGIONS.find(q => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
  return r ? r.level : 99;
}
/** 지금 레벨에서 열린 칸인지 */
export const isOpenCell = (x: number, y: number, level: number) => levelAt(x, y) <= level;
/** 안 열린 칸에 놓거나 가려고 할 때 아이에게 보여 줄 말 */
export const lockedText = (x: number, y: number) => `아직 안 열린 땅이야. 마을 레벨 ${levelAt(x, y)}에 열려!`;

/** 레벨마다 필요한 별 (그 레벨까지 누적) — needs = [레벨2까지, 레벨3까지에서 더, ...] */
export function levelOfStars(stars: number, needs: number[]): { level: number; into: number; next: number | null } {
  let level = 1, used = 0;
  for (const n of needs) {
    if (level >= MAX_LEVEL || stars < used + n) return { level, into: stars - used, next: level >= MAX_LEVEL ? null : n };
    used += n;
    level += 1;
  }
  return { level, into: stars - used, next: null };
}
