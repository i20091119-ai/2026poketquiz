// 포켓몬 마을 지도 = 칸 단위 기록 (2026-11-13). 그림 한 장이 아니라 "칸마다 땅 종류 + 그 위 물건"으로 저장하고,
// 화면(components/game/village-tiles.tsx)이 이 기록으로 땅 층 → 물건 층을 다시 그립니다.
// 나중에 아이가 마을을 꾸미는 기능(물건 놓기·땅 바꾸기)은 이 기록을 바꾸는 방식으로 붙일 수 있게 해 둡니다.
// 기준 타일 16px(그림), 화면에서는 3배. 물건 크기·밟는 칸은 lib/data/village-assets.json(scripts/pack-village-town.mjs).
import assets from './data/village-assets.json' with { type: 'json' };
import { MAP_H, MAP_W, MAP_X0, PLOTS } from './village.ts';
import type { CraftKey } from './village.ts';
import { GATHER_ROCKS, MAILBOX, WORKBENCH } from './village-craft.ts';

export const TILE_PX = assets.tile;
/** 마을을 걷는 아이 캐릭터 (2026-11-13 부모님: 포켓로그처럼 서준이가 마을에 있어야 함). 그림은 assets.players */
export const PLAYER = { name: '서준', sprite: 'seojun' as keyof typeof assets.players };

/** 땅 종류: 풀 / 흙길 / 밭(흙, 서식지를 만드는 곳) / 물 / 돌길(땅 바꾸기로만) */
export type GroundKind = 'grass' | 'path' | 'soil' | 'water' | 'stone';
/** 땅 바꾸기(2026-11-14): 아이가 풀밭 칸을 물·흙길·돌길로 바꾼 것 (지도 기록 위에 덮어씀) */
export type TerrainGround = 'water' | 'path' | 'stone';
export type TerrainCell = { x: number; y: number; ground: TerrainGround };
const LEGEND: Record<string, GroundKind> = { '.': 'grass', '=': 'path', s: 'soil', '~': 'water' };
export const GROUND_LEGEND = LEGEND;

/** 땅 층 (한 글자 = 한 칸, 가로 MAP_W × 세로 MAP_H, 글자 번호 = x - MAP_X0). . 풀, = 흙길, s 밭, ~ 물.
 *  처음 마을(x 0~11, y 0~19)은 넓은 사각형(가로 5구역 × 세로 3줄)의 위쪽 가운데, 나머지 구역은 열쇠로 엶(lib/village-level.ts) */
export const GROUND_ROWS: string[] = [
  '............................................', // 0
  '............................................', // 1
  '............................................', // 2
  '............................................', // 3
  '...........ss........==........ss...........', // 4  처음 마을 집 문 앞 길
  '...........ss....ss..==..ss....ss...........', // 5
  '.................ss..==..ss.................', // 6
  '.....................==.....................', // 7
  '..========================================..', // 8  가로 길 (꽃 들판 ~ 버섯 숲)
  '.....................==.....................', // 9
  '.....................==.....................', // 10
  '.....................==.....................', // 11
  '.....................==.....................', // 12
  '...ss................==.ss..................', // 13
  '...ss................==.ss..................', // 14
  '.........~~~.....~~~.==.....................', // 15
  '.........~~~.....~~~.==.....................', // 16
  '.................~~~.==.....................', // 17
  '.....................==.....................', // 18
  '.....................==.....................', // 19  ─ 1줄 구역 끝 (처음 마을은 가로 0~11, 세로 0~19)
  '.....................==......ss.............', // 20
  '.ss..................==......ss.............', // 21
  '.ss...............ss.==.....................', // 22
  '..................ss.=====================..', // 23  숲길 → 강가 → 바위 언덕 길
  '..=====================.....................', // 24  서쪽 호수 → 언덕 → 숲길 길
  '~~~~~................==.......~~~~~..ss.....', // 25
  '~~~~~.......~~.......==......~~~~~~~.ss.....', // 26
  '~~~~~.......~~.......==......~~~~~~~........', // 27
  '~~~~~................==......~~~~~~~........', // 28
  '~~~~~................==......~~~~~~~........', // 29  ─ 2줄 구역 끝
  '.....................==.....................', // 30
  '.....................==......ss.............', // 31
  '.....................==......ss.............', // 32
  '.....................==.....................', // 33
  '..========================================..', // 34  3줄 가로 길 (소나무 숲 ~ 깊은 숲)
  '.....................==.....................', // 35
  '..........ss.....~~~~==.....................', // 36
  '..........ss.....~~~~==.....~~~~~~~~........', // 37
  '.................~~~~==.....~~~~~~~~........', // 38
  '.....................==.....~~~~~~~~........', // 39
];

/** 물건 이름 (그림 목록의 물건) */
export type ObjectKind = keyof typeof assets.objects;
export type MapObject = { kind: ObjectKind; x: number; y: number };
/** 물건 정보: 그림 크기(칸)·밟을 수 없는 칸(그림 왼쪽 위 기준)·바닥에 붙은 작은 것 */
export function objectInfo(kind: ObjectKind): { cells: [number, number]; foot: [number, number, number, number] | null; flat: boolean } {
  const o = assets.objects[kind] as { cells: number[]; foot: number[] | null; flat?: boolean };
  return { cells: [o.cells[0], o.cells[1]], foot: o.foot ? [o.foot[0], o.foot[1], o.foot[2], o.foot[3]] : null, flat: !!o.flat };
}

/** 물건 층: (x, y) = 그림 왼쪽 위 칸. 지도 밖(y < 0)은 위쪽 숲처럼 그림만 */
export const MAP_OBJECTS: MapObject[] = [
  // 위쪽 숲 (지도 밖, 걸을 수 없는 곳)
  ...Array.from({ length: 22 }, (_, i) => -16 + i * 2).map((x, i): MapObject => ({ kind: i % 2 ? 'treeRound' : 'treePine', x, y: -3 })),
  // 집 (5×6, 아래 3줄이 막힘 = 4~8, 1~3)
  { kind: 'house', x: 4, y: -2 },
  // 나무 (2×3, 아래 2줄이 막힘)
  { kind: 'treeRound', x: 0, y: -1 }, { kind: 'treePine', x: 10, y: -1 },
  { kind: 'treeRound', x: 0, y: 9 }, { kind: 'treeRound', x: 10, y: 9 },
  { kind: 'treePine', x: 0, y: 17 }, { kind: 'treeRound', x: 10, y: 17 },
  // 꾸밈 (지나갈 수 있음)
  { kind: 'flowerWhite', x: 2, y: 7 }, { kind: 'flowerYellow', x: 9, y: 2 }, { kind: 'flowerPink', x: 2, y: 12 }, { kind: 'flowerBlue', x: 9, y: 9 },
  { kind: 'flowerYellow', x: 4, y: 14 }, { kind: 'stump', x: 11, y: 16 }, { kind: 'flowerOrange', x: 3, y: 9 }, { kind: 'mushroom', x: 7, y: 12 },
  { kind: 'rock', x: 11, y: 13 }, { kind: 'flowerRed', x: 7, y: 19 }, { kind: 'mushroomBrown', x: 2, y: 3 }, { kind: 'flowerWhite', x: 11, y: 3 },
  { kind: 'lily', x: 2, y: 16 }, { kind: 'bushRose', x: 4, y: 17 },
  // 열매·제작대 (2026-11-14): 제작대·우편함, 돌멩이를 캘 바위 (자리는 lib/village-craft.ts)
  { kind: 'workbench', x: WORKBENCH.x, y: WORKBENCH.y }, { kind: 'mailbox', x: MAILBOX.x, y: MAILBOX.y },
  ...GATHER_ROCKS.filter(r => !(r.x === 11 && r.y === 13)).map((r): MapObject => ({ kind: 'rock', x: r.x, y: r.y })),
  // ---- 넓어지는 구역 (2026-11-14, 마을 레벨 열쇠로 아이가 골라 엶. 처음 마을 C1이 위쪽 가운데, 왼쪽은 x가 음수. 구역 이름 lib/village-level.ts) ----
  // D1 오른쪽 풀밭: 넓은 풀밭 (꾸미기 놓을 자리)
  { kind: 'treeRound', x: 18, y: -1 }, { kind: 'treePine', x: 18, y: 17 },
  { kind: 'flowerPink', x: 13, y: 2 }, { kind: 'flowerBlue', x: 19, y: 5 }, { kind: 'mushroom', x: 14, y: 9 }, { kind: 'flowerYellow', x: 19, y: 13 }, { kind: 'stump', x: 12, y: 18 },
  // B1 왼쪽 숲
  { kind: 'treePine', x: -8, y: -1 }, { kind: 'treeRound', x: -3, y: -1 }, { kind: 'treePine', x: -8, y: 10 }, { kind: 'treeRound', x: -3, y: 11 }, { kind: 'treePine', x: -2, y: 17 },
  { kind: 'flowerYellow', x: -6, y: 2 }, { kind: 'flowerPink', x: -2, y: 6 }, { kind: 'mushroom', x: -4, y: 12 }, { kind: 'flowerBlue', x: -7, y: 18 }, { kind: 'lily', x: -6, y: 16 },
  // C2 아래쪽 숲길
  { kind: 'treePine', x: 0, y: 20 }, { kind: 'treePine', x: 0, y: 26 }, { kind: 'treeRound', x: 9, y: 27 }, { kind: 'pineSmall', x: 11, y: 25 },
  { kind: 'mushroomBrown', x: 8, y: 21 }, { kind: 'flowerRed', x: 3, y: 27 }, { kind: 'bushRose', x: 7, y: 28 },
  // D2 강가 모래밭
  { kind: 'lily', x: 16, y: 27 }, { kind: 'lily', x: 14, y: 28 }, { kind: 'flowerOrange', x: 12, y: 25 }, { kind: 'flowerWhite', x: 16, y: 21 },
  // B2 언덕 풀밭 (언덕·계단은 다음에 이 구역에)
  { kind: 'treePine', x: -8, y: 20 }, { kind: 'treeRound', x: -3, y: 20 }, { kind: 'treePine', x: -8, y: 26 }, { kind: 'pineSmall', x: -2, y: 28 },
  { kind: 'flowerOrange', x: -6, y: 22 }, { kind: 'flowerWhite', x: -2, y: 22 }, { kind: 'stump', x: -7, y: 24 }, { kind: 'lily', x: -4, y: 26 },
  // A1 꽃 들판
  { kind: 'treeRound', x: -12, y: -1 }, { kind: 'treePine', x: -16, y: 16 },
  { kind: 'flowerRed', x: -14, y: 2 }, { kind: 'flowerYellow', x: -10, y: 3 }, { kind: 'flowerPink', x: -12, y: 6 }, { kind: 'flowerBlue', x: -15, y: 10 },
  { kind: 'flowerWhite', x: -11, y: 11 }, { kind: 'flowerOrange', x: -9, y: 14 }, { kind: 'flowerPink', x: -14, y: 18 }, { kind: 'bushRose', x: -12, y: 16 }, { kind: 'flowerYellow', x: -9, y: 5 },
  // E1 버섯 숲
  { kind: 'treePine', x: 22, y: 2 }, { kind: 'treeRound', x: 26, y: 4 }, { kind: 'treePine', x: 20, y: 11 }, { kind: 'treeRound', x: 23, y: 11 }, { kind: 'treePine', x: 26, y: 16 },
  { kind: 'mushroom', x: 21, y: 5 }, { kind: 'mushroomBrown', x: 24, y: 6 }, { kind: 'mushroom', x: 22, y: 15 }, { kind: 'mushroomBrown', x: 27, y: 10 }, { kind: 'mushroom', x: 25, y: 1 }, { kind: 'stump', x: 24, y: 17 },
  // A2 서쪽 호수
  { kind: 'lily', x: -14, y: 27 }, { kind: 'lily', x: -13, y: 28 }, { kind: 'treePine', x: -12, y: 20 }, { kind: 'flowerBlue', x: -16, y: 23 }, { kind: 'flowerWhite', x: -9, y: 22 },
  // E2 바위 언덕
  { kind: 'treePine', x: 26, y: 25 }, { kind: 'pineSmall', x: 24, y: 20 }, { kind: 'rock', x: 24, y: 26 }, { kind: 'rock', x: 20, y: 21 }, { kind: 'rock', x: 27, y: 29 }, { kind: 'stump', x: 23, y: 25 },
  // A3 소나무 숲
  { kind: 'treePine', x: -16, y: 30 }, { kind: 'treePine', x: -11, y: 30 }, { kind: 'treePine', x: -14, y: 35 }, { kind: 'treePine', x: -10, y: 36 }, { kind: 'treePine', x: -16, y: 37 },
  { kind: 'mushroomBrown', x: -13, y: 31 }, { kind: 'stump', x: -9, y: 30 },
  // B3 꽃길
  { kind: 'flowerPink', x: -5, y: 31 }, { kind: 'flowerYellow', x: -2, y: 33 }, { kind: 'flowerRed', x: -7, y: 38 }, { kind: 'flowerBlue', x: -4, y: 38 }, { kind: 'bushRose', x: -3, y: 36 },
  { kind: 'flowerWhite', x: -8, y: 35 }, { kind: 'flowerOrange', x: -1, y: 31 },
  // C3 남쪽 연못
  { kind: 'lily', x: 2, y: 37 }, { kind: 'flowerYellow', x: 9, y: 31 }, { kind: 'flowerPink', x: 1, y: 31 }, { kind: 'treeRound', x: 10, y: 35 }, { kind: 'mushroom', x: 3, y: 32 },
  // D3 모래 해변
  { kind: 'lily', x: 15, y: 38 }, { kind: 'flowerOrange', x: 12, y: 35 }, { kind: 'stump', x: 16, y: 31 }, { kind: 'flowerWhite', x: 19, y: 30 },
  // E3 깊은 숲
  { kind: 'treeRound', x: 20, y: 30 }, { kind: 'treePine', x: 24, y: 30 }, { kind: 'treeRound', x: 26, y: 35 }, { kind: 'treePine', x: 20, y: 36 }, { kind: 'pineSmall', x: 26, y: 38 },
  { kind: 'mushroom', x: 23, y: 33 }, { kind: 'mushroomBrown', x: 27, y: 32 },
];

const inMap = (x: number, y: number) => x >= MAP_X0 && y >= 0 && x < MAP_X0 + MAP_W && y < MAP_H;
/** 지도 기록의 땅 (지도 밖은 풀) */
export function baseGround(x: number, y: number): GroundKind {
  if (!inMap(x, y)) return 'grass';
  return LEGEND[GROUND_ROWS[y][x - MAP_X0]] ?? 'grass';
}
/** 밭 칸 번호 (밭 × 4 + 자리), 밭이 아니면 -1 */
export function plotCellAt(x: number, y: number): number {
  const p = PLOTS.findIndex(q => x >= q.x && x <= q.x + 1 && y >= q.y && y <= q.y + 1);
  return p < 0 ? -1 : p * 4 + (y - PLOTS[p].y) * 2 + (x - PLOTS[p].x);
}
/** 지금 보이는 땅: 땅 바꾸기로 바꾼 칸, 밭에 물웅덩이를 놓은 칸은 물 (붙어 있으면 하나의 연못처럼 이어짐) */
export function groundAt(x: number, y: number, cells: (CraftKey | null)[] = [], terrain: TerrainCell[] = []): GroundKind {
  const t = terrain.find(c => c.x === x && c.y === y);
  if (t) return t.ground;
  const g = baseGround(x, y);
  if (g === 'soil') { const c = plotCellAt(x, y); if (c >= 0 && cells[c] === 'puddle') return 'water'; }
  return g;
}
/** 밭에 놓은 풀숲·꽃밭은 물건 층에 (물웅덩이는 땅 층) */
const PLACED_OBJECT: Partial<Record<CraftKey, ObjectKind[]>> = { bush: ['bush'], flowers: ['flowerYellow', 'flowerPink', 'flowerWhite', 'flowerBlue'] };
export function placedObject(item: CraftKey | null, cell: number): ObjectKind | null {
  const list = item ? PLACED_OBJECT[item] : undefined;
  return list ? list[cell % list.length] : null;
}
/** 밭에 놓은 것들 → 물건 층. 밭 4칸이 모두 풀숲이면(초록 풀숲 서식지) 큰 덤불 숲 하나로 (2026-11-14 부모님) */
export function plotObjects(cells: (CraftKey | null)[]): MapObject[] {
  const out: MapObject[] = [];
  PLOTS.forEach((p, plot) => {
    const four = [0, 1, 2, 3].map(i => cells[plot * 4 + i] ?? null);
    if (four.every(c => c === 'bush')) { out.push({ kind: 'bushBig', x: p.x, y: p.y }); return; }
    four.forEach((item, i) => { const kind = placedObject(item, plot * 4 + i); if (kind) out.push({ kind, x: p.x + (i % 2), y: p.y + Math.floor(i / 2) }); });
  });
  return out;
}

/** 걸을 수 없는 칸: 물건의 막힌 칸 + 지도 기록의 물 (땅 바꾸기로 만든 물은 lib/village-decor.ts decorBlocked) */
export function blockedCells(objects: MapObject[] = MAP_OBJECTS): Set<string> {
  const out = new Set<string>();
  for (const o of objects) {
    const f = objectInfo(o.kind).foot;
    if (!f) continue;
    for (let dy = 0; dy < f[3]; dy++) for (let dx = 0; dx < f[2]; dx++) out.add(`${o.x + f[0] + dx},${o.y + f[1] + dy}`);
  }
  for (let y = 0; y < MAP_H; y++) for (let x = MAP_X0; x < MAP_X0 + MAP_W; x++) if (baseGround(x, y) === 'water') out.add(`${x},${y}`);
  return out;
}

// ---------- 오토타일: 이웃 칸을 보고 8px 조각 4개 고르기 ----------
/** 이어지는 땅마다 쓰는 세트: set = 테두리 세트(32×32), inner = 안쪽 모서리 세트, hollow = 가운데가 비어 밑의 땅(물)이 보임 */
export const AUTOTILE: Record<Exclude<GroundKind, 'grass'>, { set: string; inner: string; base?: string }> = {
  path: { set: 'sand', inner: 'sandIn' },
  soil: { set: 'sand', inner: 'sandIn' },
  water: { set: 'shore', inner: 'shoreIn', base: 'water' },
  stone: { set: 'stoneSet', inner: 'stoneIn' },
};
/**
 * 한 칸을 그릴 8px 조각 4개: [그림판 x, 그림판 y, 칸 안 x, 칸 안 y].
 * 조각 고르는 법(4×4 세트, 0·3 = 바깥 테두리, 1·2 = 안쪽): 가로 이웃이 다른 땅이면 바깥 열, 세로 이웃이 다르면 바깥 줄,
 * 둘 다 같은 땅인데 대각선만 다르면 안쪽 모서리 세트. 어떤 모양으로 깔아도 테두리가 이어집니다.
 */
export function autotileQuarters(kind: Exclude<GroundKind, 'grass'>, same: (x: number, y: number) => boolean, x: number, y: number): [number, number, number, number][] {
  const { set, inner } = AUTOTILE[kind];
  const [fx, fy] = (assets.ground as Record<string, { rect: number[] }>)[set].rect;
  const [ix, iy] = (assets.ground as Record<string, { rect: number[] }>)[inner].rect;
  const out: [number, number, number, number][] = [];
  for (const qx of [0, 1]) for (const qy of [0, 1]) {
    const hx = qx ? 1 : -1, vy = qy ? 1 : -1;
    const ho = !same(x + hx, y), vo = !same(x, y + vy);
    if (!ho && !vo && !same(x + hx, y + vy)) { out.push([ix + (qx ? 0 : 24), iy + (qy ? 0 : 24), qx * 8, qy * 8]); continue; }
    const i = ho ? (qx ? 3 : 0) : (qx ? 2 : 1);
    const j = vo ? (qy ? 3 : 0) : (qy ? 2 : 1);
    out.push([fx + i * 8, fy + j * 8, qx * 8, qy * 8]);
  }
  return out;
}
