// 포켓몬 마을 꾸미기 (2026-11-14 부모님 결정: 꾸미기 1·2단계 = 꾸미기 물건 만들기, 같은 날 땅 바꾸기(연못 칸·흙길·돌길)도).
// 만들기 창 한 곳에서 [🌱 서식지 | 🎨 꾸미기 | ⛰️ 땅 바꾸기] 세 칸으로 나눠 보여 줘요. 꾸미기·땅 바꾸기는 같은 가방(decorBag)을 써요.
// 재료로 꾸미기 물건을 만들어 가방에 넣고, 마을 풀밭(연잎은 물 위)에 놓거나 다시 가방에 넣어요.
// 물건을 더 늘리려면: scripts/pack-village-town.mjs 에 그림 한 줄 + 아래 DECOR_INFO 에 한 줄.
// 재료 수는 보호자 전체 설정에서 바꿀 수 있어요 (settings.village_decor_costs, 바꾼 것만).
// 상태 변경은 lib/game-engine.ts (decorCraft·decorPlace·decorTake), 이 파일은 규칙과 계산만.
import { baseGround, blockedCells, MAP_OBJECTS, objectInfo, plotCellAt, type ObjectKind, type TerrainCell, type TerrainGround } from './village-map.ts';
import { MAP_H, MAP_W, MATERIALS, PICK_SPOTS, START_POS, type MaterialKey } from './village.ts';
import { TREE_SPOTS } from './village-craft.ts';
import { isOpenCell, lockedText } from './village-level.ts';

export const DECOR_ITEMS = ['flower', 'bush', 'bushRose', 'mushroom', 'lily', 'stump', 'fence', 'pot', 'flowerBox', 'bench', 'pineSmall', 'rock', 'pondTile', 'pathTile', 'stoneTile'] as const;
export type DecorKey = typeof DECOR_ITEMS[number];
type Cost = Partial<Record<MaterialKey, number>>;
/**
 * 꾸미기 물건: 이름, 칸(tab: 꾸미기/땅 바꾸기), 그림(여러 개면 놓을 때 고름), 재료, 물 위에만 놓는지.
 * 땅 바꾸기(ground)는 그림 대신 그 칸의 땅을 바꿔요 (붙여 놓으면 연못·길이 이어짐).
 */
export type DecorTab = 'decor' | 'ground';
export const DECOR_INFO: Record<DecorKey, { name: string; tab: DecorTab; variants: ObjectKind[]; ground?: TerrainGround; cost: Cost; onWater?: boolean; note?: string }> = {
  flower: { name: '꽃', tab: 'decor', variants: ['flowerRed', 'flowerYellow', 'flowerWhite', 'flowerPink', 'flowerBlue', 'flowerOrange'], cost: { petal: 1 } },
  bush: { name: '작은 덤불', tab: 'decor', variants: ['bushSmall'], cost: { leaf: 2 } },
  bushRose: { name: '꽃 덤불', tab: 'decor', variants: ['bushRose'], cost: { leaf: 2, petal: 1 } },
  mushroom: { name: '버섯', tab: 'decor', variants: ['mushroom', 'mushroomBrown'], cost: { leaf: 1, drop: 1 } },
  lily: { name: '연잎', tab: 'decor', variants: ['lily'], cost: { leaf: 1, drop: 1 }, onWater: true, note: '물 위에만' },
  stump: { name: '그루터기', tab: 'decor', variants: ['stump'], cost: { twig: 2 } },
  fence: { name: '나무 울타리', tab: 'decor', variants: ['fenceT'], cost: { twig: 2 }, note: '붙이면 이어져요' },
  pot: { name: '꽃 화분', tab: 'decor', variants: ['pot'], cost: { petal: 2, twig: 1 } },
  flowerBox: { name: '꽃 상자', tab: 'decor', variants: ['flowerBox'], cost: { petal: 3, twig: 2 } },
  bench: { name: '벤치', tab: 'decor', variants: ['bench'], cost: { twig: 4 } },
  pineSmall: { name: '작은 나무', tab: 'decor', variants: ['pineSmall'], cost: { leaf: 3, twig: 2 } },
  rock: { name: '바위', tab: 'decor', variants: ['rock'], cost: { stone: 1 } },
  pondTile: { name: '연못 칸', tab: 'ground', variants: [], ground: 'water', cost: { drop: 2 }, note: '붙이면 연못이 돼요' },
  pathTile: { name: '흙길', tab: 'ground', variants: [], ground: 'path', cost: { mud: 1 }, note: '붙이면 길이 이어져요' },
  stoneTile: { name: '돌길', tab: 'ground', variants: [], ground: 'stone', cost: { stone: 2 }, note: '붙이면 길이 이어져요' },
};
export const isGroundItem = (item: DecorKey) => !!DECOR_INFO[item].ground;
/** 마을에 놓을 수 있는 꾸미기 물건 수·땅 바꾸기 칸 수 (기록이 너무 커지지 않게) */
export const DECOR_MAX = 80;
export const TERRAIN_MAX = 120;
/** 가방에 같은 물건을 넣어 둘 수 있는 수 */
export const DECOR_BAG_MAX = 30;

// ---------- 재료 수 (보호자가 바꾼 것만 덮어씀) ----------
export type DecorCosts = Partial<Record<DecorKey, Cost>>;
export function cleanDecorCosts(ov: unknown): DecorCosts {
  const out: DecorCosts = {};
  if (!ov || typeof ov !== 'object') return out;
  for (const item of DECOR_ITEMS) {
    const c = (ov as Record<string, unknown>)[item];
    if (!c || typeof c !== 'object') continue;
    const cost: Cost = {};
    for (const m of MATERIALS) {
      const n = (c as Record<string, unknown>)[m];
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 20) cost[m] = n;
    }
    // 재료가 하나도 없으면 공짜가 되므로 받지 않음
    if (Object.values(cost).some(n => (n ?? 0) > 0)) out[item] = cost;
  }
  return out;
}
let overrides: DecorCosts = {};
/** 서버는 요청마다, 화면은 응답의 village.decorCosts 로 맞춤 */
export function setDecorCosts(ov?: DecorCosts | null) { overrides = cleanDecorCosts(ov); }
/** 지금 재료 수 (0인 재료는 뺌) */
export function decorCost(item: DecorKey): Cost {
  const c = overrides[item] ?? DECOR_INFO[item].cost;
  return Object.fromEntries(Object.entries(c).filter(([, n]) => (n ?? 0) > 0)) as Cost;
}
export const decorCostsNow = (): Record<DecorKey, Cost> => Object.fromEntries(DECOR_ITEMS.map(k => [k, decorCost(k)])) as Record<DecorKey, Cost>;

// ---------- 놓기 ----------
/** 마을에 놓인 꾸미기 물건. (x, y) = 밟는 자리(바닥 칸)의 왼쪽 위 */
export type DecorPlaced = { item: DecorKey; kind: ObjectKind; x: number; y: number };
/** 바닥 칸: 밟을 수 없는 칸이 있으면 그 칸들, 없으면 그림 맨 아래 줄 */
export function decorBase(kind: ObjectKind): { dx: number; dy: number; w: number; h: number } {
  const { cells, foot } = objectInfo(kind);
  return foot ? { dx: foot[0], dy: foot[1], w: foot[2], h: foot[3] } : { dx: 0, dy: cells[1] - 1, w: cells[0], h: 1 };
}
/** 놓인 물건이 차지하는 바닥 칸 */
export function decorCells(d: { kind: ObjectKind; x: number; y: number }): { x: number; y: number }[] {
  const b = decorBase(d.kind);
  const out = [];
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) out.push({ x: d.x + i, y: d.y + j });
  return out;
}
/** 그림 왼쪽 위 칸 (물건 층에 그릴 자리) */
export function decorImageAt(d: { kind: ObjectKind; x: number; y: number }) {
  const b = decorBase(d.kind);
  return { x: d.x - b.dx, y: d.y - b.dy };
}
/** 걸을 수 없는 칸: 막히는 꾸미기 물건 + 땅 바꾸기로 만든 물 */
export function decorBlocked(decor: DecorPlaced[], terrain: TerrainCell[] = []): string[] {
  return [
    ...decor.filter(d => objectInfo(d.kind).foot).flatMap(d => decorCells(d).map(c => `${c.x},${c.y}`)),
    ...terrain.filter(t => t.ground === 'water').map(t => `${t.x},${t.y}`),
  ];
}
const MAP_BLOCKED = blockedCells(MAP_OBJECTS);
/** 지도에 처음부터 있는 꽃·버섯 같은 작은 물건 자리 (그 위에 겹쳐 놓지 않게) */
const MAP_TAKEN = new Set(MAP_OBJECTS.filter(o => o.y >= 0).flatMap(o => { const b = decorBase(o.kind); return decorCells({ kind: o.kind, x: o.x + b.dx, y: o.y + b.dy }); }).map(c => `${c.x},${c.y}`));
const KEEP_FREE = new Set([START_POS, ...PICK_SPOTS].map(p => `${p.x},${p.y}`));
/** 열매나무 자리 (2×3, 묘목을 심을 곳이라 비워 둠, 2026-11-14) */
export const TREE_CELLS = new Set(TREE_SPOTS.flatMap(t => [0, 1].flatMap(dx => [0, 1, 2].map(dy => `${t.x + dx},${t.y + dy}`))));
/**
 * 여기에 놓을 수 있는지 (안 되면 이유). 풀밭에만(연잎은 물 위에만), 길·밭·집·나무 자리와 다른 꾸미기 물건 위는 안 됨,
 * 처음 서는 자리·재료가 떨어지는 자리는 비워 둠. 땅 바꾸기는 원래 풀밭이고 아직 바꾸지 않은 칸에만 (한 칸).
 */
export function decorSpotProblem(decor: DecorPlaced[], terrain: TerrainCell[], item: DecorKey, kind: ObjectKind | null, x: number, y: number, level = 1): string | null {
  const used = new Set(decor.flatMap(d => decorCells(d).map(c => `${c.x},${c.y}`)));
  const changed = new Map(terrain.map(t => [`${t.x},${t.y}`, t.ground]));
  const info = DECOR_INFO[item];
  const cells = info.ground || !kind ? [{ x, y }] : decorCells({ kind, x, y });
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= MAP_W || c.y >= MAP_H) return '마을 밖에는 놓을 수 없어요.';
    if (!isOpenCell(c.x, c.y, level)) return lockedText(c.x, c.y);
    const k = `${c.x},${c.y}`;
    const base = baseGround(c.x, c.y);
    if (info.ground) {
      if (base !== 'grass') return '풀밭만 바꿀 수 있어요.';
      if (changed.has(k)) return '여기는 이미 바꾼 땅이에요. 누르면 되돌릴 수 있어요.';
    }
    const g = changed.get(k) ?? base;
    if (!info.ground && (info.onWater ? g !== 'water' : g !== 'grass')) return info.onWater ? '연잎은 물 위에만 놓을 수 있어요.' : '풀밭에만 놓을 수 있어요.';
    if (plotCellAt(c.x, c.y) >= 0) return '밭에는 놓을 수 없어요.';
    if (!info.onWater && MAP_BLOCKED.has(k)) return '여기는 자리가 없어요.';
    if (used.has(k) || MAP_TAKEN.has(k)) return '여기에는 이미 놓여 있어요.';
    if (KEEP_FREE.has(k)) return '여기는 비워 두자! (재료가 떨어지는 자리예요)';
    if (TREE_CELLS.has(k)) return '여기는 열매나무 자리예요.';
  }
  return null;
}
/** 땅 바꾸기 칸 찾기 (없으면 -1) */
export const terrainIndexAt = (terrain: TerrainCell[], x: number, y: number) => terrain.findIndex(t => t.x === x && t.y === y);
/** 바닥 칸으로 놓인 물건 찾기 (없으면 -1) */
export function decorIndexAt(decor: DecorPlaced[], x: number, y: number): number {
  return decor.findIndex(d => decorCells(d).some(c => c.x === x && c.y === y));
}

/** 나무 울타리: 이웃 울타리를 보고 그림 조각 고르기 (가로·세로·모서리, 갈림길은 가로/세로로) */
export function fenceKind(decor: DecorPlaced[], x: number, y: number): ObjectKind {
  const at = (a: number, b: number) => decor.some(d => d.item === 'fence' && d.x === a && d.y === b);
  const n = at(x, y - 1), s = at(x, y + 1), w = at(x - 1, y), e = at(x + 1, y);
  if (e && s && !w && !n) return 'fenceTL';
  if (w && s && !e && !n) return 'fenceTR';
  if (e && n && !w && !s) return 'fenceBL';
  if (w && n && !e && !s) return 'fenceBR';
  if ((n || s) && !w && !e) return 'fenceL';
  if (w || e) return 'fenceT';
  return 'fencePost';
}
