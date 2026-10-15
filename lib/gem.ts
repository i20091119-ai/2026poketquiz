// 전설 보석 모양 (그림 파일 없이 SVG로 그림, 2026-10-15 부모님 요청).
// 보석 하나 = 그 단계 한 마리에 필요한 조각 수만큼 중심에서 나뉜 모양.
// 1단계 다이아몬드(파랑) · 2단계 에메랄드 컷(보라) · 3단계 별(금) · 4단계부터 좌우 대칭 다각형 자동 생성
// (단계 번호 + 보호자 "다른 모양으로 다시 만들기" 값을 씨앗으로 써서, 다시 열어도 같은 모양).

export type Pt = [number, number];
export type GemColor = { name: string; fill: string; light: string; dark: string };
export const GEM_COLORS = {
  blue: { name: '파랑', fill: '#3b82f6', light: '#bfdbfe', dark: '#1e40af' },
  purple: { name: '보라', fill: '#8b5cf6', light: '#ddd6fe', dark: '#5b21b6' },
  gold: { name: '금색', fill: '#eab308', light: '#fef08a', dark: '#a16207' },
  red: { name: '빨강', fill: '#ef4444', light: '#fecaca', dark: '#991b1b' },
  green: { name: '초록', fill: '#22c55e', light: '#bbf7d0', dark: '#166534' },
  pink: { name: '분홍', fill: '#ec4899', light: '#fbcfe8', dark: '#9d174d' },
  teal: { name: '청록', fill: '#14b8a6', light: '#99f6e4', dark: '#115e59' },
  orange: { name: '주황', fill: '#f97316', light: '#fed7aa', dark: '#9a3412' },
} satisfies Record<string, GemColor>;
/** 4단계부터 색 순서 (바로 앞 단계와 겹치지 않음: 3단계 금 → 빨강 …, 한 바퀴 돌아도 금 → 빨강) */
const AUTO_COLORS: (keyof typeof GEM_COLORS)[] = ['red', 'green', 'pink', 'teal', 'orange', 'blue', 'purple', 'gold'];
export function gemColor(stage: number): GemColor {
  if (stage === 1) return GEM_COLORS.blue;
  if (stage === 2) return GEM_COLORS.purple;
  if (stage === 3) return GEM_COLORS.gold;
  return GEM_COLORS[AUTO_COLORS[(stage - 4) % AUTO_COLORS.length]];
}

/** 같은 씨앗이면 같은 수가 나오는 난수 */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const polar = (c: Pt, r: number, deg: number): Pt => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];
const round = (p: Pt): Pt => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];

export type GemShape = { stage: number; kind: 'diamond' | 'emerald' | 'star' | 'auto'; points: Pt[]; center: Pt; color: GemColor };

/** 단계의 보석 모양 (100×100 칸 안). salt = 보호자 "다른 모양으로 다시 만들기" (4단계부터만 씀) */
export function gemShape(stage: number, salt = 0): GemShape {
  const color = gemColor(stage);
  if (stage === 1) return { stage, kind: 'diamond', color, center: [50, 42], points: [[28, 16], [72, 16], [94, 40], [50, 94], [6, 40]] };
  if (stage === 2) return { stage, kind: 'emerald', color, center: [50, 50], points: [[30, 8], [70, 8], [88, 26], [88, 74], [70, 92], [30, 92], [12, 74], [12, 26]] };
  if (stage === 3) {
    const c: Pt = [50, 54];
    const points = Array.from({ length: 10 }, (_, i) => round(polar(c, i % 2 ? 20 : 47, -90 + i * 36)));
    return { stage, kind: 'star', color, center: c, points };
  }
  const rand = seededRandom(stage * 9973 + salt * 7919 + 17);
  const c: Pt = [50, 50];
  // 오른쪽 반쪽 꼭짓점 (위 -90° ~ 아래 90° 사이) → 왼쪽으로 뒤집어 좌우 대칭
  const side = 2 + Math.floor(rand() * 3); // 2~4개
  const spiky = rand() < 0.45; // 뾰족함: 안쪽으로 들어간 꼭짓점을 섞음
  const angles = Array.from({ length: side }, (_, i) => -90 + (180 * (i + 0.5 + (rand() - 0.5) * 0.5)) / side).sort((a, b) => a - b);
  const right: Pt[] = [];
  angles.forEach((deg, i) => {
    const r = spiky && i % 2 === 1 ? 22 + rand() * 8 : 36 + rand() * 11;
    // 깎인 모서리: 꼭짓점 하나를 가까운 두 점으로 나눔
    if (!spiky && rand() < 0.35) { right.push(polar(c, r, deg - 7), polar(c, r, deg + 7)); }
    else right.push(polar(c, r, deg));
  });
  const topPointy = rand() < 0.6;
  const bottomPointy = rand() < 0.75;
  const top: Pt[] = topPointy ? [[50, 50 - (38 + rand() * 9)]] : [];
  const bottom: Pt[] = bottomPointy ? [[50, 50 + (40 + rand() * 7)]] : [];
  const left = right.map(([x, y]) => [100 - x, y] as Pt).reverse();
  const points = [...top, ...right, ...bottom, ...left].map(round);
  return { stage, kind: 'auto', color, center: c, points };
}

const angleOf = (c: Pt, p: Pt) => {
  let deg = (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI; // -180~180, 위 = -90
  if (deg < -90) deg += 360; // -90 ~ 270
  return deg;
};
/** 중심에서 deg 방향으로 쏜 선이 테두리와 만나는 점 */
function rayHit(c: Pt, pts: Pt[], deg: number): Pt {
  const d: Pt = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  let best: Pt | null = null;
  let bestT = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const e: Pt = [q[0] - p[0], q[1] - p[1]];
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const w: Pt = [p[0] - c[0], p[1] - c[1]];
    const t = (w[0] * e[1] - w[1] * e[0]) / den;
    const u = (w[0] * d[1] - w[1] * d[0]) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 && t < bestT) { bestT = t; best = [c[0] + t * d[0], c[1] + t * d[1]]; }
  }
  return best ?? c;
}
/** 보석을 중심에서 n조각으로 나눈 다각형들 (위에서부터 시계 방향) */
export function gemWedges(pts: Pt[], n: number, center?: Pt): Pt[][] {
  const c = center ?? ([pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] as Pt);
  const parts = Math.max(1, Math.round(n));
  const verts = pts.map(p => ({ p, a: angleOf(c, p) }));
  return Array.from({ length: parts }, (_, i) => {
    const a0 = -90 + (360 * i) / parts;
    const a1 = -90 + (360 * (i + 1)) / parts;
    const inside = verts.filter(v => v.a > a0 + 1e-6 && v.a < a1 - 1e-6).sort((x, y) => x.a - y.a).map(v => v.p);
    return [c, rayHit(c, pts, a0), ...inside, rayHit(c, pts, a1)].map(round);
  });
}
export const pointsAttr = (pts: Pt[]) => pts.map(p => p.join(',')).join(' ');
