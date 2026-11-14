// 포켓몬 마을 지도 = 칸 단위 기록 (2026-11-13). 그림 한 장이 아니라 "칸마다 땅 종류 + 그 위 물건"으로 저장하고,
// 화면(components/game/village-tiles.tsx)이 이 기록으로 땅 층 → 물건 층을 다시 그립니다.
// 나중에 아이가 마을을 꾸미는 기능(물건 놓기·땅 바꾸기)은 이 기록을 바꾸는 방식으로 붙일 수 있게 해 둡니다.
// 기준 타일 16px(그림), 화면에서는 3배. 물건 크기·밟는 칸은 lib/data/village-assets.json(scripts/pack-village-town.mjs).
import assets from './data/village-assets.json' with { type: 'json' };
import { MAP_H, MAP_W, PLOTS } from './village.ts';
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

/** 땅 층 (한 글자 = 한 칸, 가로 MAP_W × 세로 MAP_H). . 풀, = 흙길, s 밭, ~ 물 */
export const GROUND_ROWS: string[] = [
  '............', // 0
  '............', // 1
  '............', // 2
  '............', // 3
  '.....==.....', // 4  집 문 앞에서 길 시작
  '.ss..==..ss.', // 5  밭 0, 밭 1
  '.ss..==..ss.', // 6
  '.....==.....', // 7
  '============', // 8  가로 길
  '.....==.....', // 9
  '.....==.....', // 10
  '.....==.....', // 11
  '.....==.....', // 12
  '.....==.ss..', // 13 밭 2
  '.....==.ss..', // 14
  '.~~~.==.....', // 15 연못
  '.~~~.==.....', // 16
  '.~~~.==.....', // 17
  '.....==.....', // 18
  '.....==.....', // 19
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
  ...[0, 2, 4, 6, 8, 10].map((x, i): MapObject => ({ kind: i % 2 ? 'treeRound' : 'treePine', x, y: -3 })),
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
];

const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
/** 지도 기록의 땅 (지도 밖은 풀) */
export function baseGround(x: number, y: number): GroundKind {
  if (!inMap(x, y)) return 'grass';
  return LEGEND[GROUND_ROWS[y][x]] ?? 'grass';
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
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (baseGround(x, y) === 'water') out.add(`${x},${y}`);
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
