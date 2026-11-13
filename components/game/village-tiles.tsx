"use client";
// 포켓몬 마을 그림 (2026-11-13). 지도는 칸 단위 기록(lib/village-map.ts)이고, 여기서 두 층으로 다시 그려요.
//   땅 층: 캔버스 한 장 (풀·흙길·밭·물, 이어지는 땅은 오토타일 8px 조각) — 밭에 놓은 물웅덩이도 땅(물)이라 붙으면 연못처럼 이어짐
//   물건 층: 칸마다 그림 조각 (집·나무·꽃…), 아래 줄 기준으로 포켓몬과 앞뒤를 맞춤
// 그림판: public/assets/village/ground.png·objects.png (16px 배수, 목록·출처 ASSETS.md), 화면에서는 정수 배(3배 = 48px).
import { useEffect, useRef, type CSSProperties } from 'react';
import assets from '@/lib/data/village-assets.json' with { type: 'json' };
import { autotileQuarters, groundAt, MAP_OBJECTS, objectInfo, placedObject, type GroundKind, type MapObject, type ObjectKind } from '@/lib/village-map';
import { cellPos, CRAFT_INFO, MAP_H, MAP_W, type CraftKey, type MaterialKey } from '@/lib/village';

const T = assets.tile;
const GROUND = assets.ground as Record<string, { rect: number[] }>;
const OBJECTS = assets.objects as Record<string, { rect: number[] }>;
/** 지도 위쪽에 더 그리는 숲 줄 수 (걸을 수 없음, 그림만) */
export const TOP_ROWS = 2;

function sheetStyle(sheet: { file: string; width: number; height: number }, rect: number[], scale: number): CSSProperties {
  const [sx, sy, w, h] = rect;
  return {
    width: w * scale, height: h * scale, backgroundImage: `url(${sheet.file})`,
    backgroundSize: `${sheet.width * scale}px ${sheet.height * scale}px`, backgroundPosition: `${-sx * scale}px ${-sy * scale}px`,
  };
}

/** 물건 그림 하나 (scale = 정수 배) */
export function ObjectSprite({ kind, scale = 3, style, title }: { kind: ObjectKind; scale?: number; style?: CSSProperties; title?: string }) {
  return <i className="vsprite" title={title} aria-hidden={!title} style={{ ...sheetStyle(assets.sheets.objects, OBJECTS[kind].rect, scale), ...style }} />;
}

/** 걷는 사람 (16×32, 4방향 × 걷기 3장). step이 바뀔 때마다 다음 걸음, 서 있으면 가운데 장면 */
export function PlayerSprite({ sprite, dir, step, scale = 3 }: { sprite: keyof typeof assets.players; dir: 'down' | 'up' | 'left' | 'right'; step: number; scale?: number }) {
  const p = assets.players[sprite];
  const col = p.walk[step % p.walk.length];
  const row = p.rows[dir];
  return <i className="vsprite" aria-hidden style={sheetStyle(p, [col * p.frame[0], row * p.frame[1], p.frame[0], p.frame[1]], scale)} />;
}

// ---------- 땅 층 ----------
let sheetImg: Promise<HTMLImageElement> | null = null;
function loadGroundSheet() {
  sheetImg ??= new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = assets.sheets.ground.file; });
  return sheetImg;
}
/** cols×rows 칸(왼쪽 위 = 지도 칸 x0, y0)의 땅을 원래 크기(16px)로 그림 */
function drawGround(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x0: number, y0: number, cols: number, rows: number, at: (x: number, y: number) => GroundKind) {
  const tile = (name: string, dx: number, dy: number) => { const [sx, sy] = GROUND[name].rect; ctx.drawImage(img, sx, sy, T, T, dx, dy, T, T); };
  ctx.clearRect(0, 0, cols * T, rows * T);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = x0 + c, y = y0 + r, g = at(x, y);
    tile(g === 'water' ? 'water' : 'grass', c * T, r * T);
    if (g === 'grass') continue;
    for (const [sx, sy, dx, dy] of autotileQuarters(g, (a, b) => at(a, b) === g, x, y)) ctx.drawImage(img, sx, sy, 8, 8, c * T + dx, r * T + dy, 8, 8);
  }
}
function GroundLayer({ x0, y0, cols, rows, scale, at, version, style }: {
  x0: number; y0: number; cols: number; rows: number; scale: number; at: (x: number, y: number) => GroundKind; version: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void loadGroundSheet().then(img => {
      const ctx = ref.current?.getContext('2d');
      if (!alive || !ctx) return;
      ctx.imageSmoothingEnabled = false;
      drawGround(ctx, img, x0, y0, cols, rows, at);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [x0, y0, cols, rows, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="vcanvas" width={cols * T} height={rows * T} aria-hidden style={{ width: cols * T * scale, height: rows * T * scale, ...style }} />;
}

// ---------- 물건 층 ----------
/** 물건들을 칸 자리에 (y0 = 그림 맨 위 칸이 지도 몇 번째 줄인지). z = 아래 줄 기준(포켓몬 z = 11 + 줄), 바닥에 붙은 것은 늘 아래 */
function ObjectLayer({ objects, tile, y0 }: { objects: MapObject[]; tile: number; y0: number }) {
  const scale = tile / T;
  return <>{objects.map((o, i) => {
    const info = objectInfo(o.kind);
    const bottom = o.y + info.cells[1] - 1;
    return <ObjectSprite key={i} kind={o.kind} scale={scale}
      style={{ position: 'absolute', left: o.x * tile, top: (o.y - y0) * tile, zIndex: info.flat ? 3 : 11 + bottom }} />;
  })}</>;
}

/** 마을: 땅 층 + 물건 층 (밭에 놓은 것까지). 좌표는 위쪽 숲 줄(TOP_ROWS)을 포함한 그림 좌표 */
export function VillageGround({ tile, cells }: { tile: number; cells: (CraftKey | null)[] }) {
  const at = (x: number, y: number) => groundAt(x, y, cells);
  const placed: MapObject[] = [];
  cells.forEach((item, cell) => {
    const kind = placedObject(item, cell);
    if (!kind) return;
    placed.push({ kind, ...cellPos(cell) });
  });
  return (
    <div className="village-ground" aria-hidden>
      <GroundLayer x0={0} y0={-TOP_ROWS} cols={MAP_W} rows={MAP_H + TOP_ROWS} scale={tile / T} at={at} version={cells.join(',')} />
      <ObjectLayer objects={[...MAP_OBJECTS, ...placed]} tile={tile} y0={-TOP_ROWS} />
    </div>
  );
}

// ---------- 재료·만든 물건 아이콘 ----------
const MATERIAL_OBJECT: Record<MaterialKey, ObjectKind> = { leaf: 'matLeaf', drop: 'matDrop', petal: 'matPetal', twig: 'matTwig' };
export const MaterialIcon = ({ kind, scale = 2 }: { kind: MaterialKey; scale?: number }) => <ObjectSprite kind={MATERIAL_OBJECT[kind]} scale={scale} />;
/** 만든 물건 그림: 풀숲 = 덤불, 꽃밭 = 꽃, 물웅덩이 = 물가 테두리가 있는 물 한 칸 */
export function CraftIcon({ kind, scale = 2 }: { kind: CraftKey; scale?: number }) {
  if (kind === 'puddle') {
    return (
      <span title={CRAFT_INFO[kind].name} style={{ display: 'inline-block', width: T * scale, height: T * scale }}>
        <GroundLayer x0={0} y0={0} cols={1} rows={1} scale={scale} at={(x, y) => (x === 0 && y === 0 ? 'water' : 'grass')} version="puddle" />
      </span>
    );
  }
  return <ObjectSprite kind={kind === 'bush' ? 'bush' : 'flowerPink'} scale={scale} title={CRAFT_INFO[kind].name} />;
}

// ---------- 잠겨 있을 때 보이는 마을 입구 (작은 지도 기록) ----------
const ENT_ROWS = ['...........', '...........', '...........', '.....=.....', '.....=.....', '.....=.....'];
const ENT_OBJECTS: MapObject[] = [
  { kind: 'treePine', x: 0, y: -1 }, { kind: 'treeRound', x: 2, y: 0 }, { kind: 'treeRound', x: 7, y: 0 }, { kind: 'treePine', x: 9, y: -1 },
  { kind: 'house', x: 3, y: -3 },
  { kind: 'flowerYellow', x: 1, y: 4 }, { kind: 'flowerPink', x: 9, y: 4 }, { kind: 'flowerWhite', x: 3, y: 5 }, { kind: 'mushroom', x: 7, y: 5 },
];
const entranceAt = (x: number, y: number): GroundKind => (ENT_ROWS[y]?.[x] === '=' ? 'path' : 'grass');
export function VillageEntrance({ open }: { open?: boolean }) {
  const tile = 32, cols = ENT_ROWS[0].length, rows = ENT_ROWS.length;
  return (
    <div className={'village-entrance' + (open ? ' open' : '')} style={{ width: cols * tile, height: rows * tile }} aria-hidden>
      <GroundLayer x0={0} y0={0} cols={cols} rows={rows} scale={tile / T} at={entranceAt} version="entrance" style={{ position: 'absolute', left: 0, top: 0 }} />
      <ObjectLayer objects={ENT_OBJECTS} tile={tile} y0={0} />
      {!open && <span className="village-entrance-lock">🔒</span>}
    </div>
  );
}
