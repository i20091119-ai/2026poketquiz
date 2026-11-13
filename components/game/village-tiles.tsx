"use client";
// 포켓몬 마을 그림. 한 장으로 묶은 타일 그림(public/assets/village/village.png, Ninja Adventure · CC0)을
// 정수 배(2배)로 키워 그려요 (image-rendering: pixelated). 조각 자리는 lib/data/village-atlas.json.
import type { CSSProperties } from 'react';
import atlas from '@/lib/data/village-atlas.json' with { type: 'json' };
import { CRAFT_INFO, HOUSE, isPath, MAP_H, MAP_W, PLOTS, POND, TREES, type CraftKey, type MaterialKey } from '@/lib/village';

export const SHEET = '/assets/village/village.png';
const PIECES = atlas.pieces as Record<string, number[]>;
export type PieceName = keyof typeof atlas.pieces;

/** 타일 조각 하나 (scale = 정수 배) */
export function Sprite({ name, scale = 2, x, y, className, style, title }: {
  name: PieceName | string; scale?: number; x?: number; y?: number; className?: string; style?: CSSProperties; title?: string;
}) {
  const [sx, sy, w, h] = PIECES[name] ?? PIECES.grass;
  return (
    <i className={'vsprite' + (className ? ' ' + className : '')} title={title} aria-hidden={!title}
      style={{
        width: w * scale, height: h * scale, backgroundImage: `url(${SHEET})`,
        backgroundSize: `${atlas.width * scale}px ${atlas.height * scale}px`, backgroundPosition: `${-sx * scale}px ${-sy * scale}px`,
        ...(x !== undefined ? { position: 'absolute', left: x, top: y } : null), ...style,
      }} />
  );
}

/** 아이(Boy, 16×16 칸 4방향 × 4걸음) 한 칸 */
export function BoySprite({ dir, step, scale = 2 }: { dir: 'down' | 'up' | 'left' | 'right'; step: number; scale?: number }) {
  const [bx, by] = PIECES.boy;
  const col = { down: 0, up: 1, left: 2, right: 3 }[dir];
  return <i className="vsprite" style={{
    width: 16 * scale, height: 16 * scale, backgroundImage: `url(${SHEET})`,
    backgroundSize: `${atlas.width * scale}px ${atlas.height * scale}px`,
    backgroundPosition: `${-(bx + col * 16) * scale}px ${-(by + (step % 4) * 16) * scale}px`,
  }} />;
}

/** 재료·만든 물건 그림 */
export const MATERIAL_PIECE: Record<MaterialKey, string> = { leaf: 'm_leaf', drop: 'm_drop', petal: 'redflower', twig: 'm_twig' };
export const CRAFT_PIECE: Record<CraftKey, string> = { bush: 'bush', puddle: 'w_one', flowers: 'sunflower' };
export const MaterialIcon = ({ kind, scale = 2 }: { kind: MaterialKey; scale?: number }) => <Sprite name={MATERIAL_PIECE[kind]} scale={scale} />;
export const CraftIcon = ({ kind, scale = 2 }: { kind: CraftKey; scale?: number }) => <Sprite name={CRAFT_PIECE[kind]} scale={scale} title={CRAFT_INFO[kind].name} />;

/** 이웃 칸이 같은 땅인지 보고 고르는 조각 (prefix: d_ 흙, w_ 물) */
export function autoPiece(prefix: 'd_' | 'w_', same: (x: number, y: number) => boolean, x: number, y: number): string {
  const n = same(x, y - 1), s = same(x, y + 1), w = same(x - 1, y), e = same(x + 1, y);
  if (!w && !e) return prefix + (n && s ? 'v' : n ? 'v2' : s ? 'v1' : 'one');
  if (!n && !s) return prefix + (w && e ? 'h' : w ? 'h2' : 'h1');
  return prefix + (!n ? 't' : !s ? 'b' : '') + (!w ? 'l' : !e ? 'r' : '') || prefix + 'c';
}
const pieceFix = (name: string) => (name.endsWith('_') ? name + 'c' : name);
// 흙 한 칸(d_one)은 없으면 가로 가운데로
const dirt = (name: string) => (PIECES[name] ? name : 'd_h');

const inPlot = (x: number, y: number) => PLOTS.findIndex(p => x >= p.x && x <= p.x + 1 && y >= p.y && y <= p.y + 1);
const inPond = (x: number, y: number) => x >= POND.x && x < POND.x + POND.w && y >= POND.y && y < POND.y + POND.h;
const path = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && isPath(x, y) && inPlot(x, y) < 0;
/** 풀밭 무늬 (칸마다 정해짐) */
const grassAt = (x: number, y: number) => ['grass', 'grass', 'grass', 'grass1', 'grass', 'grass2', 'grass', 'grass3', 'grass', 'grass4'][(x * 7 + y * 13 + x * y) % 10];
/** 꾸밈 꽃·풀 (걸을 수 있음) */
const DECOR: { x: number; y: number; name: string }[] = [
  { x: 3, y: 4, name: 'daisy' }, { x: 8, y: 2, name: 'tuft' }, { x: 2, y: 12, name: 'daisy' }, { x: 9, y: 9, name: 'tuft' },
  { x: 4, y: 14, name: 'daisy' }, { x: 9, y: 17, name: 'stump' }, { x: 3, y: 9, name: 'tuft' }, { x: 7, y: 12, name: 'stump' },
  { x: 11, y: 13, name: 'rock' }, { x: 7, y: 19, name: 'tuft' },
];

/** 바닥 + 집·나무·연못 (밭 칸에 놓은 물건은 village.tsx 가 그 위에) */
export function VillageGround({ tile }: { tile: number }) {
  const scale = tile / 16;
  const out = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    out.push(<Sprite key={`g${x},${y}`} name={grassAt(x, y)} scale={scale} x={x * tile} y={y * tile} />);
    if (inPond(x, y)) out.push(<Sprite key={`w${x},${y}`} name={pieceFix(autoPiece('w_', inPond, x, y))} scale={scale} x={x * tile} y={y * tile} />);
    else if (path(x, y)) out.push(<Sprite key={`p${x},${y}`} name={dirt(pieceFix(autoPiece('d_', path, x, y)))} scale={scale} x={x * tile} y={y * tile} />);
    else {
      const plot = inPlot(x, y);
      if (plot >= 0) out.push(<Sprite key={`s${x},${y}`} name={pieceFix(autoPiece('d_', (a, b) => inPlot(a, b) === plot, x, y))} scale={scale} x={x * tile} y={y * tile} />);
    }
  }
  for (const d of DECOR) out.push(<Sprite key={`d${d.x},${d.y}`} name={d.name} scale={scale} x={d.x * tile} y={d.y * tile} />);
  for (const t of TREES) out.push(<Sprite key={`t${t.x},${t.y}`} name={t.pink ? 'treePink' : 'tree'} scale={scale} x={t.x * tile} y={t.y * tile} />);
  out.push(<Sprite key="house" name="house" scale={scale} x={HOUSE.x * tile} y={HOUSE.y * tile} />);
  return <div className="village-ground" aria-hidden>{out}</div>;
}

/** 밭에 놓은 물건: 물웅덩이끼리 붙어 있으면 연못처럼 이어서 그림 */
export function PlacedItem({ cells, cell, tile }: { cells: (CraftKey | null)[]; cell: number; tile: number }) {
  const item = cells[cell];
  if (!item) return null;
  const scale = tile / 16;
  if (item !== 'puddle') return <Sprite name={CRAFT_PIECE[item]} scale={scale} />;
  const base = cell - (cell % 4), i = cell % 4;
  const at = (cx: number, cy: number) => cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1 && cells[base + cy * 2 + cx] === 'puddle';
  return <Sprite name={pieceFix(autoPiece('w_', at, i % 2, Math.floor(i / 2)))} scale={scale} />;
}

/** 잠겨 있을 때 보이는 마을 입구 그림 (문 + 나무 + 풀밭, 타일로) */
export function VillageEntrance({ open }: { open?: boolean }) {
  const W = 11, H = 6, tile = 32;
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    cells.push(<Sprite key={`g${x},${y}`} name={grassAt(x + 3, y + 5)} x={x * tile} y={y * tile} />);
    if (x === 5 && y >= 2) cells.push(<Sprite key={`p${x},${y}`} name={y === 2 ? 'd_v1' : 'd_v'} x={x * tile} y={y * tile} />);
  }
  return (
    <div className={'village-entrance' + (open ? ' open' : '')} style={{ width: W * tile, height: H * tile }} aria-hidden>
      {cells}
      <Sprite name="tree" x={0} y={0} /><Sprite name="treePink" x={2 * tile} y={tile} /><Sprite name="tree" x={7 * tile} y={tile} /><Sprite name="treePink" x={9 * tile} y={0} />
      <Sprite name="house" x={3.5 * tile} y={-tile} style={{ opacity: 0.9 }} />
      <Sprite name="gate" x={4 * tile} y={3 * tile} />
      <Sprite name="daisy" x={1 * tile} y={4 * tile} /><Sprite name="daisy" x={9 * tile} y={4 * tile} /><Sprite name="tuft" x={3 * tile} y={5 * tile} />
      {!open && <span className="village-entrance-lock">🔒</span>}
    </div>
  );
}
