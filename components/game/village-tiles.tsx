"use client";
// 포켓몬 마을 그림 (2026-11-13 부모님이 고른 "위에서 본 도트 마을").
// 바닥·나무·집·꾸밈 = Tuxemon 무료 타일(CC BY-SA 4.0 등, public/assets/village/LICENSE.txt)을 한 장으로 묶은
// public/assets/village/town.png (조각 자리 lib/data/village-town.json, scripts/pack-village-town.mjs로 만듦).
// 16px 타일을 정수 배(3배 = 48px)로 키워 그려요 (image-rendering: pixelated).
// 재료 그림(풀잎·물방울·꽃잎·나뭇가지)만 예전 그림(village.png, Ninja Adventure · CC0)을 그대로 써요.
import { useEffect, useRef, type CSSProperties } from 'react';
import itemAtlas from '@/lib/data/village-atlas.json' with { type: 'json' };
import town from '@/lib/data/village-town.json' with { type: 'json' };
import { CRAFT_INFO, HOUSE, isPath, MAP_H, MAP_W, PLOTS, POND, TREES, type CraftKey, type MaterialKey } from '@/lib/village';

export const TOWN_SHEET = '/assets/village/town.png';
const ITEM_SHEET = '/assets/village/village.png';
const TOWN = town.pieces as Record<string, number[]>;
const ITEMS = itemAtlas.pieces as Record<string, number[]>;
/** 지도 위쪽에 더 그리는 숲 줄 수 (걸을 수 없음, 그림만) */
export const TOP_ROWS = 2;

function sheetStyle(sheet: string, size: { width: number; height: number }, rect: number[], scale: number): CSSProperties {
  const [sx, sy, w, h] = rect;
  return {
    width: w * scale, height: h * scale, backgroundImage: `url(${sheet})`,
    backgroundSize: `${size.width * scale}px ${size.height * scale}px`, backgroundPosition: `${-sx * scale}px ${-sy * scale}px`,
  };
}

/** 마을 그림 조각 하나 (scale = 정수 배) */
export function TownSprite({ name, scale = 3, x, y, z, style, title }: {
  name: string; scale?: number; x?: number; y?: number; z?: number; style?: CSSProperties; title?: string;
}) {
  return (
    <i className="vsprite" title={title} aria-hidden={!title}
      style={{
        ...sheetStyle(TOWN_SHEET, town, TOWN[name] ?? TOWN.grass, scale),
        ...(x !== undefined ? { position: 'absolute', left: x, top: y } : null), ...(z !== undefined ? { zIndex: z } : null), ...style,
      }} />
  );
}

// ---------- 이웃 칸을 보고 고르는 8점 조각 (흙길·밭·연못 테두리) ----------
type Same = (x: number, y: number) => boolean;
/** [원본 x, 원본 y, 그릴 x, 그릴 y] (타일 안 8×8 조각 4개). 흙(sand)은 안쪽 모서리까지, 연못 테두리(rim)는 가운데가 비어 있음 */
export function quarters(frame: 'sand' | 'rim', same: Same, x: number, y: number): [number, number, number, number][] {
  const [fx, fy] = TOWN[frame];
  const [ix, iy] = TOWN.sandIn;
  const off = frame === 'sand' ? [0, 8, 16, 24] : [0, 8, 32, 40];
  const out: [number, number, number, number][] = [];
  for (const qx of [0, 1]) for (const qy of [0, 1]) {
    const hx = qx ? 1 : -1, vy = qy ? 1 : -1;
    const ho = !same(x + hx, y), vo = !same(x, y + vy);
    if (!ho && !vo) {
      // 안쪽: 흙은 대각선이 풀이면 안쪽 모서리 조각, 연못은 비어 있음(물만)
      if (frame === 'rim') continue;
      if (!same(x + hx, y + vy)) { out.push([ix + (qx ? 0 : 24), iy + (qy ? 0 : 24), qx * 8, qy * 8]); continue; }
    }
    const i = ho ? (qx ? 3 : 0) : (qx ? 2 : 1);
    const j = vo ? (qy ? 3 : 0) : (qy ? 2 : 1);
    out.push([fx + off[i], fy + off[j], qx * 8, qy * 8]);
  }
  return out;
}

/** 8점 조각 4개로 그린 타일 (밭에 놓은 물웅덩이처럼 바뀌는 것만 화면 조각으로) */
function QuarterTile({ parts, scale, under }: { parts: [number, number, number, number][]; scale: number; under?: string }) {
  return (
    <i className="vsprite vquad" aria-hidden style={{ width: 16 * scale, height: 16 * scale, position: 'relative' }}>
      {under && <TownSprite name={under} scale={scale} x={0} y={0} />}
      {parts.map(([sx, sy, dx, dy], k) => (
        <i key={k} className="vsprite" style={{ ...sheetStyle(TOWN_SHEET, town, [sx, sy, 8, 8], scale), position: 'absolute', left: dx * scale, top: dy * scale }} />
      ))}
    </i>
  );
}

// ---------- 바닥 그리기 (한 번만 캔버스에) ----------
type Ground = 'grass' | 'path' | 'pond' | `plot${number}`;
let sheetImg: Promise<HTMLImageElement> | null = null;
function loadSheet() {
  sheetImg ??= new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = TOWN_SHEET; });
  return sheetImg;
}
/** cols×rows 칸 바닥을 원래 크기(16px)로 그림. 꾸밈 조각은 그 위에 */
function drawGround(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cols: number, rows: number, at: (x: number, y: number) => Ground, decor: { x: number; y: number; name: string }[]) {
  const piece = (name: string, dx: number, dy: number) => { const [sx, sy, w, h] = TOWN[name]; ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h); };
  const quad = (parts: [number, number, number, number][], x: number, y: number) => { for (const [sx, sy, dx, dy] of parts) ctx.drawImage(img, sx, sy, 8, 8, x * 16 + dx, y * 16 + dy, 8, 8); };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    piece('grass', x * 16, y * 16);
    const g = at(x, y);
    if (g === 'pond') { piece('water', x * 16, y * 16); quad(quarters('rim', (a, b) => at(a, b) === 'pond', x, y), x, y); }
    else if (g !== 'grass') quad(quarters('sand', (a, b) => at(a, b) === g, x, y), x, y);
  }
  for (const d of decor) piece(d.name, d.x * 16, d.y * 16);
}
function GroundCanvas({ cols, rows, scale, at, decor, className, style }: {
  cols: number; rows: number; scale: number; at: (x: number, y: number) => Ground; decor: { x: number; y: number; name: string }[]; className?: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    void loadSheet().then(img => {
      const ctx = ref.current?.getContext('2d');
      if (!alive || !ctx) return;
      ctx.imageSmoothingEnabled = false;
      drawGround(ctx, img, cols, rows, at, decor);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [cols, rows, at, decor]);
  return <canvas ref={ref} className={'vcanvas' + (className ? ' ' + className : '')} width={cols * 16} height={rows * 16} aria-hidden
    style={{ width: cols * 16 * scale, height: rows * 16 * scale, ...style }} />;
}

// ---------- 마을 지도 ----------
const inPlot = (x: number, y: number) => PLOTS.findIndex(p => x >= p.x && x <= p.x + 1 && y >= p.y && y <= p.y + 1);
const inPond = (x: number, y: number) => x >= POND.x && x < POND.x + POND.w && y >= POND.y && y < POND.y + POND.h;
/** 지도 칸의 바닥 종류 (y는 위쪽 숲 줄을 뺀 지도 좌표) */
const mapGround = (x: number, gy: number): Ground => {
  const y = gy - TOP_ROWS;
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 'grass';
  if (inPond(x, y)) return 'pond';
  const plot = inPlot(x, y);
  if (plot >= 0) return `plot${plot}`;
  return isPath(x, y) ? 'path' : 'grass';
};
/** 꾸밈 꽃·버섯 (걸을 수 있음, 지도 좌표) */
const DECOR = [
  { x: 3, y: 4, name: 'flowerWhite' }, { x: 8, y: 2, name: 'flowerYellow' }, { x: 2, y: 12, name: 'flowerPink' }, { x: 9, y: 9, name: 'flowerBlue' },
  { x: 4, y: 14, name: 'flowerYellow' }, { x: 9, y: 17, name: 'stump' }, { x: 3, y: 9, name: 'flowerOrange' }, { x: 7, y: 12, name: 'mushroom' },
  { x: 11, y: 13, name: 'rock' }, { x: 7, y: 19, name: 'flowerRed' }, { x: 2, y: 3, name: 'mushroomBrown' }, { x: 11, y: 3, name: 'flowerWhite' },
].map(d => ({ ...d, y: d.y + TOP_ROWS }));

/** 큰 그림(나무·집)을 칸 자리의 아래·가운데에 맞춰 놓기. z = 아래쪽 줄 (포켓몬과 앞뒤를 맞춤) */
function anchored(name: string, cx: number, bottom: number, tile: number) {
  const [, , w, h] = TOWN[name];
  const s = tile / 16;
  return { left: cx * tile - (w * s) / 2, top: bottom * tile - h * s };
}

/** 바닥(한 장) + 위쪽 숲 + 나무·집. 좌표는 위쪽 숲 줄을 포함한 그림 좌표 */
export function VillageGround({ tile }: { tile: number }) {
  const scale = tile / 16;
  const objects = [];
  // 위쪽 숲 (지도 밖, 두 줄)
  for (let i = 0; i < MAP_W / 2 + 1; i++) {
    const p = anchored(i % 2 ? 'treeRound' : 'treePine', i * 2 + (i % 2 ? 0.2 : 0), TOP_ROWS - 0.3 + (i % 2 ? 0.4 : 0), tile);
    objects.push(<TownSprite key={'f' + i} name={i % 2 ? 'treeRound' : 'treePine'} scale={scale} x={p.left} y={p.top} z={10} />);
  }
  TREES.forEach((t, i) => {
    const name = t.pink ? 'treePine' : 'treeRound';
    const p = anchored(name, t.x + 1, t.y + 2 + TOP_ROWS, tile);
    objects.push(<TownSprite key={'t' + i} name={name} scale={scale} x={p.left} y={p.top} z={10 + t.y + 2} />);
  });
  const h = anchored('house', HOUSE.x + HOUSE.w / 2, HOUSE.y + HOUSE.h + TOP_ROWS, tile);
  objects.push(<TownSprite key="house" name="house" scale={scale} x={h.left} y={h.top} z={10 + HOUSE.y + HOUSE.h} />);
  return (
    <div className="village-ground" aria-hidden>
      <GroundCanvas cols={MAP_W} rows={MAP_H + TOP_ROWS} scale={scale} at={mapGround} decor={DECOR} />
      {objects}
    </div>
  );
}

// ---------- 재료·만든 물건 ----------
export const MATERIAL_PIECE: Record<MaterialKey, string> = { leaf: 'm_leaf', drop: 'm_drop', petal: 'redflower', twig: 'm_twig' };
export const MaterialIcon = ({ kind, scale = 2 }: { kind: MaterialKey; scale?: number }) => (
  <i className="vsprite" aria-hidden style={sheetStyle(ITEM_SHEET, itemAtlas, ITEMS[MATERIAL_PIECE[kind]] ?? ITEMS.grass, scale)} />
);
const FLOWER_KINDS = ['flowerYellow', 'flowerPink', 'flowerWhite', 'flowerBlue'];
/** 만든 물건 그림: 풀숲 = 덤불, 꽃밭 = 꽃, 물웅덩이 = 테두리 있는 물 한 칸 */
export function CraftIcon({ kind, scale = 2 }: { kind: CraftKey; scale?: number }) {
  if (kind === 'puddle') return <span title={CRAFT_INFO[kind].name}><QuarterTile parts={quarters('rim', () => false, 0, 0)} scale={scale} under="water" /></span>;
  return <TownSprite name={kind === 'bush' ? 'bush' : 'flowerPink'} scale={scale} title={CRAFT_INFO[kind].name} />;
}

/** 밭에 놓은 물건: 물웅덩이끼리 붙어 있으면 연못처럼 이어서 그림 */
export function PlacedItem({ cells, cell, tile }: { cells: (CraftKey | null)[]; cell: number; tile: number }) {
  const item = cells[cell];
  if (!item) return null;
  const scale = tile / 16;
  if (item === 'bush') return <TownSprite name="bush" scale={scale} />;
  if (item === 'flowers') return <TownSprite name={FLOWER_KINDS[cell % FLOWER_KINDS.length]} scale={scale} />;
  const base = cell - (cell % 4), i = cell % 4;
  const at = (cx: number, cy: number) => cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1 && cells[base + cy * 2 + cx] === 'puddle';
  return <QuarterTile parts={quarters('rim', at, i % 2, Math.floor(i / 2))} scale={scale} under="water" />;
}

// ---------- 잠겨 있을 때 보이는 마을 입구 ----------
const ENT_W = 11, ENT_H = 6;
const entranceGround = (x: number, y: number): Ground => (x >= 5 && x <= 5 && y >= 3 ? 'path' : 'grass');
const ENT_DECOR = [{ x: 1, y: 4, name: 'flowerYellow' }, { x: 9, y: 4, name: 'flowerPink' }, { x: 3, y: 5, name: 'flowerWhite' }, { x: 7, y: 5, name: 'mushroom' }];
export function VillageEntrance({ open }: { open?: boolean }) {
  const tile = 32, scale = 2;
  const put = (name: string, cx: number, bottom: number, k: string) => { const p = anchored(name, cx, bottom, tile); return <TownSprite key={k} name={name} scale={scale} x={p.left} y={p.top} />; };
  return (
    <div className={'village-entrance' + (open ? ' open' : '')} style={{ width: ENT_W * tile, height: ENT_H * tile }} aria-hidden>
      <GroundCanvas cols={ENT_W} rows={ENT_H} scale={scale} at={entranceGround} decor={ENT_DECOR} style={{ position: 'absolute', left: 0, top: 0 }} />
      {put('treePine', 1, 2.2, 'a')}{put('treeRound', 3, 3, 'b')}{put('treeRound', 8, 3, 'c')}{put('treePine', 10, 2.2, 'd')}
      {put('house', 5.5, 3, 'h')}
      {!open && <span className="village-entrance-lock">🔒</span>}
    </div>
  );
}
