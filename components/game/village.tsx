"use client";
// 포켓몬 마을 1단계(시험판, 2026-11-13). 규칙은 lib/village.ts, 기록 변경은 lib/game-engine.ts.
// 위에서 내려다보는 도트 지도(16×16 타일을 3배 = 48px, 그림은 village-tiles.tsx), 화살표 버튼으로 서준이가 걷고
// 파트너 포켓몬이 한 칸 뒤에서 따라와요(포켓로그처럼 트레이너 + 포켓몬). 화면은 서준이를 따라 움직여요.
// 포켓몬은 포켓로그의 움직이는 도트 그림(anim-mon.tsx).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import type { Action, ChildView, VillageGuest } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import {
  CELL_COUNT, cellPos, CRAFT_INFO, CRAFTS, HABITAT_INFO, MAP_H, MAP_W, MAP_X0, MATERIAL_INFO, MATERIALS, PICK_SPOTS, PLOTS,
  RESIDENT_LINES, START_POS, type CraftKey, type MaterialKey,
} from '@/lib/village';
import { AnimMon } from './anim-mon';
import { blockedCells, objectInfo, PLAYER, type MapObject } from '@/lib/village-map';
import { GATHER_ROCKS, MAILBOX, TREE_SPOTS, WORKBENCH } from '@/lib/village-craft';
import type { PotionKind } from '@/lib/game-config';
import { KeyChooser, LevelGuide, LockedRegions, useLevelPopups, VillageLevelBar } from './village-level';
import { isOpenCell, lockedText } from '@/lib/village-level';
import { CatchGame, FunIntro, funIntroSeen, ToolsTab, type CatchResult } from './village-fun';
import type { ToolKey } from '@/lib/village-tools';
import { groundAt } from '@/lib/village-map';
import { CraftIntro, IronIcon, PlantSheet, SparkleIcon, useCraftIntro, WorkbenchSheet, type CraftedBall } from './village-craft';
import { DECOR_INFO, DECOR_ITEMS, decorBlocked, decorCells, decorIndexAt, decorSpotProblem, terrainIndexAt, type DecorKey, type DecorTab } from '@/lib/village-decor';
import { CraftIcon, GroundIcon, MaterialIcon, ObjectSprite, PlayerSprite, TOP_ROWS, VillageEntrance, VillageGround } from './village-tiles';

export const TILE = 48; // 16px 타일 × 3 (정수 배)
const VIEW_ROWS = 9;
/** 화면에 보이는 칸 수: 폰 너비에 맞춰 7~11칸 (홀수라 파트너가 가운데) */
function useViewCols() {
  const calc = () => { if (typeof window === 'undefined') return 7; const n = Math.max(7, Math.min(11, Math.floor((window.innerWidth - 12) / TILE))); return n % 2 ? n : n - 1; };
  const [cols, setCols] = useState(calc);
  useEffect(() => { const on = () => setCols(calc()); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  return cols;
}
const pixelSrc = (id: number) => `/assets/pokemon/pixel/${id}.png`;
const key = (x: number, y: number) => `${x},${y}`;
const MAP_BLOCKED = blockedCells();
const inMap = (x: number, y: number) => x >= MAP_X0 && y >= 0 && x < MAP_X0 + MAP_W && y < MAP_H;

/** 첫 화면: 마을 입구 버튼 (잠김 / 열림) */
export function VillageStrip({ view, onOpen }: { view: ChildView; onOpen: () => void }) {
  const v = view.village;
  return (
    <button className={'village-strip' + (v.open ? ' open' : '')} onClick={onOpen}>
      <span className="village-strip-icon">{v.open ? '🏡' : '🔒'}</span>
      <span className="village-strip-text">
        <b>포켓몬 마을</b>
        <small>{v.open ? (v.guests.length ? `손님 ${v.guests.length}마리가 놀러 왔어!` : '마을이 열렸어! 놀러 가자') : `오늘 미션을 끝내면 열려요 (${v.mission.done}/${v.mission.total})`}</small>
      </span>
    </button>
  );
}

type Walker = { id: string; species: number; shiny?: boolean; x: number; y: number; guest?: VillageGuest };
type Sheet = null | 'bag' | 'workbench' | 'plant' | { cell: number } | { decorAt: { x: number; y: number } };
type MakeTab = 'habitat' | DecorTab | 'tools';
type DecorPlacing = { item: DecorKey; variant: number };

type ScreenProps = {
  view: ChildView; busy: boolean;
  act: <T>(action: Action) => Promise<T | null>;
  /** 제작대에서 만든 볼 열기 (가방과 같은 볼 창) */
  onOpenBall?: (b: CraftedBall) => void;
  onClose: () => void;
  /** 마을 안에 있는지 (마을 시간 세기용) */
  onSeconds: (inside: boolean) => void;
};
/** 마을 화면 (전체 화면). 열 때마다 처음 자리에서 시작 */
export function VillageScreen({ open, ...props }: ScreenProps & { open: boolean }) {
  if (!open) return null;
  return <VillageInner {...props} />;
}
/** 열려 있지 않으면 입구 그림 + 미션 진행 막대 */
function VillageInner({ view, busy, act, onClose, onSeconds, onOpenBall }: ScreenProps) {
  const v = view.village;
  // 들어와 있는 동안은 자정이 지나 잠겨도 계속 놀 수 있음 (나가면 잠김)
  const [inside, setInside] = useState(false);
  const [pos, setPos] = useState(START_POS);
  const [dir, setDir] = useState<'down' | 'up' | 'left' | 'right'>('down');
  const [step, setStep] = useState(0);
  // 파트너는 한 칸 뒤에서 따라와요 (바라보는 쪽 = 걸어간 쪽)
  const [follow, setFollow] = useState({ x: START_POS.x + 1, y: START_POS.y, dir: 'left' as 'down' | 'up' | 'left' | 'right' });
  const VIEW_COLS = useViewCols();
  const [sheet, setSheet] = useState<Sheet>(null);
  // 놓기 모드: 고른 물건을 반짝이는 빈 밭 칸을 눌러 바로 놓기
  const [placing, setPlacing] = useState<CraftKey | null>(null);
  // 꾸미기 놓기 모드: 놓을 수 있는 풀밭 칸이 반짝이고, 누르면 놓기
  const [decorPlacing, setDecorPlacing] = useState<DecorPlacing | null>(null);
  // 묘목 심기 모드: 고른 열매 종류, 빈 나무 자리가 반짝이고 누르면 심기
  const [planting, setPlanting] = useState<PotionKind | null>(null);
  // 만들기 창에서 마지막으로 본 칸 (서식지·꾸미기·땅 바꾸기)
  const [makeTab, setMakeTab] = useState<MakeTab>('habitat');
  const [toast, setToast] = useState('');
  const [bubble, setBubble] = useState<{ id: string; text: string } | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [enterFailed, setEnterFailed] = useState(false);
  const localSeconds = useRef(0);
  // 열매나무 (다 자란 나무: 열매가 있으면 열매나무 그림, 오늘 땄으면 보통 나무 / 오늘 심은 것: 묘목)
  const craft = v.craft;
  const treeObjects = useMemo<MapObject[]>(() => craft.trees.map(t => {
    const s = TREE_SPOTS[t.spot];
    if (!t.grown) return { kind: 'sapling', x: s.x, y: s.y + 2 };
    return { kind: t.ready ? (`fruitTree_${t.berry}` as MapObject['kind']) : 'treeRound', x: s.x, y: s.y };
  }), [craft.trees]);
  const extraObjects = useMemo<MapObject[]>(() => [...treeObjects, ...(craft.mail > 0 ? [{ kind: 'mailboxFlag' as const, x: MAILBOX.x, y: MAILBOX.y }] : [])], [treeObjects, craft.mail]);
  // 걸을 수 없는 칸 = 지도(집·나무·물) + 꾸미기 물건(울타리·벤치 등) + 다 자란 열매나무
  // 마을 레벨: 안 열린 구역은 걸을 수 없음 (안개 + 🔒 팻말)
  const openIds = useMemo(() => v.level.regions.filter(r => r.status === 'open').map(r => r.id), [v.level.regions]);
  const lockedCells = useMemo(() => v.level.regions.filter(r => r.status !== 'open').flatMap(r => Array.from({ length: r.w * r.h }, (_, i) => key(r.x + (i % r.w), r.y + Math.floor(i / r.w)))), [v.level.regions]);
  const blocked = useMemo(() => new Set([...MAP_BLOCKED, ...decorBlocked(v.decor, v.terrain), ...blockedCells(treeObjects.filter(o => o.kind !== 'sapling')), ...lockedCells]), [v.decor, v.terrain, treeObjects, lockedCells]);
  const [introOpen, closeIntro] = useCraftIntro(inside);
  const pop = useLevelPopups(inside, introOpen, v.level.keys);
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; });
  // 낚시·벌레잡기 안내 (레벨 안내 다음, 기기마다 처음 한 번)
  const [funOpen, setFunOpen] = useState(false);
  useEffect(() => {
    if (!inside || introOpen || pop.guide || funIntroSeen()) return;
    const t = window.setTimeout(() => setFunOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [inside, introOpen, pop.guide]);
  // 낚시·벌레잡기 놀이 창 (round = 새 판마다 처음부터)
  const [catching, setCatching] = useState<{ tool: ToolKey; x: number; y: number; bug?: number } | null>(null);
  const [round, setRound] = useState(0);
  // 날아다니는 벌레 (잠자리채가 있을 때만, 서준이 근처 열린 풀밭에 2마리)
  const [bugs, setBugs] = useState<{ id: number; x: number; y: number; kind: string }[]>([]);
  const hasNet = craft.tools.net > 0;
  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; });
  useEffect(() => {
    if (!inside || !hasNet) return;
    let next = 1;
    const spawn = () => setBugs(list => {
      const out = list.filter(b => Math.abs(b.x - posRef.current.x) <= 5 && Math.abs(b.y - posRef.current.y) <= 4).slice(0, 2);
      for (let tries = 0; out.length < 2 && tries < 40; tries++) {
        const x = posRef.current.x + Math.floor(Math.random() * 9) - 4, y = posRef.current.y + Math.floor(Math.random() * 7) - 3;
        if (!inMap(x, y) || blockedRef.current.has(key(x, y)) || (x === posRef.current.x && y === posRef.current.y) || out.some(b => b.x === x && b.y === y)) continue;
        if (groundAt(x, y, v.cells, v.terrain) !== 'grass') continue;
        out.push({ id: Date.now() + next++, x, y, kind: Math.random() < 0.5 ? '🦋' : Math.random() < 0.5 ? '🐞' : '🐝' });
      }
      return out;
    });
    const first = window.setTimeout(spawn, 300);
    const t = window.setInterval(spawn, 6000);
    return () => { window.clearTimeout(first); window.clearInterval(t); };
  }, [inside, hasNet, v.cells, v.terrain]);

  // 들어가기: 열려 있으면 한 번 villageEnter (손님을 도감 "만남"에)
  useEffect(() => {
    if (inside || !v.open || enterFailed) return;
    let cancelled = false;
    void act<{ ok: boolean }>({ type: 'villageEnter' }).then(r => { if (cancelled) return; if (r) setInside(true); else setEnterFailed(true); });
    return () => { cancelled = true; };
  }, [inside, v.open, enterFailed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onSeconds(inside); return () => onSeconds(false); }, [inside, onSeconds]);

  // 마을 시간 제한 (보호자 설정): 남은 시간이 0이 되면 안내하고 나가기
  useEffect(() => {
    if (!inside || v.time.allowedMinutes === null) return;
    const limit = v.time.allowedMinutes * 60 - v.time.usedSeconds;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') localSeconds.current += 1;
      if (localSeconds.current >= limit) setTimeUp(true);
    }, 1000);
    return () => window.clearInterval(t);
  }, [inside, v.time.allowedMinutes, v.time.usedSeconds]);

  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { if (!bubble) return; const t = window.setTimeout(() => setBubble(null), 2600); return () => window.clearTimeout(t); }, [bubble]);

  // 돌아다니는 포켓몬: 모험 팀 + 오늘 손님 (손님은 자기 서식지 근처)
  const baseWalkers = useMemo<Walker[]>(() => [
    ...v.residents.slice(1, 3).map((r, i) => ({ id: 'r' + i, species: r.species, shiny: r.shiny, x: [4, 8][i], y: [9, 10][i] })),
    ...v.guests.map(g => { const p = PLOTS[g.plot]; return { id: 'g' + g.plot, species: g.species, x: p.x + 2 < MAP_X0 + MAP_W ? p.x + 2 : p.x - 1, y: p.y + 1, guest: g }; }),
  ], [v.residents, v.guests]);
  // 걸어간 자리 (포켓몬 id → 칸). 없으면 처음 자리
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const walkers = baseWalkers.map(w => ({ ...w, ...moved[w.id] }));
  const walkersRef = useRef(walkers);
  useEffect(() => { walkersRef.current = walkers; });
  useEffect(() => {
    if (!inside) return;
    const t = window.setInterval(() => {
      const next: Record<string, { x: number; y: number }> = {};
      for (const w of walkersRef.current) {
        if (Math.random() < 0.5) continue;
        const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
        const x = w.x + dx, y = w.y + dy;
        // 손님은 자기 밭에서 3칸 안에서만
        const home = w.guest ? PLOTS[w.guest.plot] : null;
        if (!inMap(x, y) || blockedRef.current.has(key(x, y)) || (home && (Math.abs(x - home.x) > 3 || Math.abs(y - home.y) > 3))) continue;
        next[w.id] = { x, y };
      }
      setMoved(m => ({ ...m, ...next }));
    }, 1400);
    return () => window.clearInterval(t);
  }, [inside]);

  const pickupAt = (x: number, y: number) => v.pickups.find(p => PICK_SPOTS[p.spot].x === x && PICK_SPOTS[p.spot].y === y);
  async function move(dx: number, dy: number) {
    if (busy || sheet) return;
    const x = pos.x + dx, y = pos.y + dy;
    setDir(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
    if (inMap(x, y) && !isOpenCell(x, y, openIds)) { setToast(lockedText(x, y)); return; }
    if (!inMap(x, y) || blocked.has(key(x, y))) return;
    setStep(s => s + 1);
    setFollow({ x: pos.x, y: pos.y, dir: x > pos.x ? 'right' : x < pos.x ? 'left' : y > pos.y ? 'down' : 'up' });
    setPos({ x, y });
    const p = pickupAt(x, y);
    if (p) {
      if (v.pickLeft <= 0) { setToast('오늘은 다 주웠어! 내일 또 떨어져 있을 거야.'); return; }
      const r = await act<{ message: string }>({ type: 'villagePick', spot: p.spot, stay: true });
      if (r) setToast(r.message);
    }
  }
  // 화면 위치: 지도 위쪽 숲 줄(TOP_ROWS)까지 포함한 그림 좌표
  const fullH = (MAP_H + TOP_ROWS) * TILE;
  const cam = {
    x: Math.max(0, Math.min(MAP_W * TILE - VIEW_COLS * TILE, (pos.x - MAP_X0) * TILE - Math.floor(VIEW_COLS / 2) * TILE)),
    y: Math.max(0, Math.min(fullH - VIEW_ROWS * TILE, (pos.y + TOP_ROWS) * TILE - Math.floor(VIEW_ROWS / 2) * TILE)),
  };
  const partner = view.owned.find(p => p.uid === view.partner);
  async function placeAt(cell: number) {
    if (!placing || busy) return;
    const item = placing;
    const r = await act<{ message: string }>({ type: 'villagePlace', cell, item, stay: true });
    if (!r) return;
    setToast(r.message);
    // 가방에 더 있으면 계속 놓기, 없으면 끝
    if (v.items[item] - 1 <= 0) setPlacing(null);
  }
  const close = () => { setInside(false); onClose(); };
  // ---------- 열매나무·제작대 ----------
  const lineNo = useRef(0);
  const talk = async (r: { message: string } | null) => { if (r) setToast(r.message); };
  async function harvest(t: (typeof craft.trees)[number]) {
    if (busy) return;
    if (!t.grown) { setToast('오늘 심은 나무야. 내일부터 열매가 열려!'); return; }
    if (!t.ready) { setToast('이 나무는 오늘 다 땄어! 내일 또 열려.'); return; }
    await talk(await act<{ message: string }>({ type: 'villageHarvest', spot: t.spot, stay: true }));
  }
  async function gather(rock: number) {
    if (busy) return;
    if (craft.stoneLeft <= 0) { setToast(`오늘은 돌멩이를 다 캤어! (하루 ${craft.rules.stoneDaily}개) 내일 또 캘 수 있어.`); return; }
    await talk(await act<{ message: string }>({ type: 'villageGather', rock, stay: true }));
  }
  async function openMail() { if (!busy) await talk(await act<{ message: string }>({ type: 'villageMail', stay: true })); }
  async function plantAt(spot: number) {
    if (!planting || busy) return;
    const r = await act<{ message: string }>({ type: 'villagePlant', spot, berry: planting, stay: true });
    if (r) { setToast(r.message); setPlanting(null); }
  }
  const plantTargets = planting ? craft.treeSpots.map(spot => ({ ...TREE_SPOTS[spot], spot })).filter(s => !craft.trees.some(t => t.spot === s.spot)) : [];
  // 물가: 서준이 바로 옆(위·아래·왼쪽·오른쪽) 열린 물 칸
  const waterNear = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ x: pos.x + dx, y: pos.y + dy }))
    .find(c => inMap(c.x, c.y) && isOpenCell(c.x, c.y, openIds) && groundAt(c.x, c.y, v.cells, v.terrain) === 'water') ?? null;
  async function catchDone(hit: boolean): Promise<CatchResult | null> {
    if (!catching) return null;
    const r = await act<CatchResult>({ type: 'villageCatch', tool: catching.tool, x: catching.x, y: catching.y, hit, stay: true });
    if (catching.bug !== undefined) setBugs(list => list.filter(b => b.id !== catching.bug));
    return r;
  }
  async function onMonTap(w: Walker) {
    if (w.guest) {
      const r = await act<{ message: string }>({ type: 'villageTalk', plot: w.guest.plot, stay: true });
      if (r) setBubble({ id: w.id, text: r.message });
      return;
    }
    lineNo.current += 1;
    setBubble({ id: w.id, text: `${species(w.species).name}: ${RESIDENT_LINES[lineNo.current % RESIDENT_LINES.length]}` });
  }
  // 꾸미기: 놓을 수 있는 칸 (서준이·파트너가 서 있는 칸은 빼고)
  const decorTargets = useMemo(() => {
    if (!decorPlacing) return [];
    const info = DECOR_INFO[decorPlacing.item];
    const kind = info.ground ? null : info.variants[decorPlacing.variant];
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < MAP_H; y++) for (let x = MAP_X0; x < MAP_X0 + MAP_W; x++) {
      if (decorSpotProblem(v.decor, v.terrain, decorPlacing.item, kind, x, y, openIds)) continue;
      // 서준이·파트너가 서 있는 칸은 빼고 (물 칸이나 막히는 물건이 발밑에 생기지 않게)
      const cells = kind ? decorCells({ kind, x, y }) : [{ x, y }];
      if (cells.some(c => (c.x === pos.x && c.y === pos.y) || (c.x === follow.x && c.y === follow.y))) continue;
      out.push({ x, y });
    }
    return out;
  }, [decorPlacing, v.decor, v.terrain, pos, follow, openIds]);
  async function placeDecorAt(x: number, y: number) {
    if (!decorPlacing || busy) return;
    const { item, variant } = decorPlacing;
    const r = await act<{ message: string }>({ type: 'decorPlace', item, x, y, variant, stay: true });
    if (!r) return;
    setToast(r.message);
    if (v.decorBag[item] - 1 <= 0) setDecorPlacing(null);
  }

  // ---------- 잠김 ----------
  if (!inside) {
    const m = v.mission;
    return (
      <div className="village-screen" role="dialog" aria-label="포켓몬 마을">
        <div className="village-top"><b>🏡 포켓몬 마을</b><button className="secondary small" onClick={close}>나가기</button></div>
        <div className="village-locked">
          <VillageEntrance open={v.open} />
          {v.open ? <p className="village-lock-text">{enterFailed
            ? (v.time.allowedMinutes !== null && v.time.usedSeconds >= v.time.allowedMinutes * 60 ? '⏰ 오늘 마을 시간은 끝났어. 내일 또 놀러 오자!' : '마을에 들어가지 못했어. 닫고 다시 눌러 줘.')
            : '마을로 들어가는 중…'}</p> : <>
            <p className="village-lock-text">🔒 오늘 미션을 끝내면 열려요</p>
            {m.review && <p className="village-lock-sub">📚 오늘은 복습하는 날! 복습을 끝내도 열려요.</p>}
            <div className="village-lock-bar"><Progress value={m.total ? (m.done / m.total) * 100 : 0} /><span>{m.done} / {m.total || '?'}</span></div>
          </>}
          <button className="primary" onClick={close}>{v.open ? '닫기' : '미션 하러 가기'}</button>
        </div>
      </div>
    );
  }

  // ---------- 마을 안 ----------
  const bagCount = CRAFTS.reduce((s, k) => s + v.items[k], 0);
  const decorBagCount = DECOR_ITEMS.reduce((s, k) => s + v.decorBag[k], 0);
  return (
    <div className="village-screen" role="dialog" aria-label="포켓몬 마을">
      <div className="village-top">
        <b>🏡 포켓몬 마을</b>
        <span className="village-picks">줍기 {v.pickLeft}개 남음</span>
        <button className="secondary small" onClick={close}>나가기</button>
      </div>
      <VillageLevelBar level={v.level} width={VIEW_COLS * TILE} onKeys={() => pop.openChooser()} onHelp={pop.openGuide} />
      <div className="village-view" style={{ width: VIEW_COLS * TILE, height: VIEW_ROWS * TILE }}>
        <div className="village-map" style={{ width: MAP_W * TILE, height: fullH, transform: `translate(${-cam.x}px, ${-cam.y}px)` }}>
          <VillageGround tile={TILE} cells={v.cells} decor={v.decor} terrain={v.terrain} extra={extraObjects} />
          <div className="village-world" style={{ top: TOP_ROWS * TILE, left: -MAP_X0 * TILE, width: (MAP_W + MAP_X0) * TILE, height: MAP_H * TILE }}>
          {/* 밭 칸: 누르면 놓기·되가져오기 */}
          {Array.from({ length: CELL_COUNT }, (_, cell) => {
            const p = cellPos(cell);
            if (!isOpenCell(p.x, p.y, openIds)) return null;
            const item = v.cells[cell];
            const target = !!placing && !item;
            return (
              <button key={'c' + cell} className={'village-cell' + (item ? ' filled' : '') + (target ? ' target' : '')} style={{ left: p.x * TILE, top: p.y * TILE, width: TILE, height: TILE }}
                aria-label={item ? `${CRAFT_INFO[item].name} (누르면 가방으로)` : '빈 칸 (누르면 놓기)'} onClick={() => (target ? void placeAt(cell) : setSheet({ cell }))}>
              </button>
            );
          })}
          {/* 놓은 꾸미기 물건: 누르면 가방에 넣기 (놓기 중이 아닐 때) */}
          {!decorPlacing && !placing && [...v.decor.flatMap(d => decorCells(d)), ...v.terrain.filter(t => decorIndexAt(v.decor, t.x, t.y) < 0)].map(c => (
            <button key={'dt' + c.x + ',' + c.y} className="village-decor-hit" style={{ left: c.x * TILE, top: c.y * TILE, width: TILE, height: TILE }}
              aria-label="꾸미기 물건 (누르면 가방으로)" onClick={() => setSheet({ decorAt: c })} />
          ))}
          {/* 꾸미기 놓기: 놓을 수 있는 칸 */}
          {decorTargets.map(c => (
            <button key={'dp' + c.x + ',' + c.y} className="village-cell target decor" style={{ left: c.x * TILE, top: c.y * TILE, width: TILE, height: TILE }}
              aria-label="여기에 놓기" onClick={() => void placeDecorAt(c.x, c.y)} />
          ))}
          {/* 열매나무·제작대·우편함·바위: 누르면 따기·만들기·택배·캐기 (놓기 중이 아닐 때) */}
          {!placing && !decorPlacing && !planting && <>
            {craft.trees.map(t => {
              const s = TREE_SPOTS[t.spot];
              return <button key={'t' + t.spot} className={'village-hit' + (t.ready ? ' ready' : '')}
                style={{ left: s.x * TILE, top: (t.grown ? s.y : s.y + 2) * TILE, width: (t.grown ? 2 : 1) * TILE, height: (t.grown ? 3 : 1) * TILE }}
                aria-label={t.ready ? '열매 따기' : '열매나무'} onClick={() => void harvest(t)} />;
            })}
            <button className="village-hit" style={{ left: WORKBENCH.x * TILE, top: WORKBENCH.y * TILE, width: objectInfo('workbench').cells[0] * TILE, height: objectInfo('workbench').cells[1] * TILE }}
              aria-label="제작대" onClick={() => setSheet('workbench')} />
            <button className={'village-hit' + (craft.mail > 0 ? ' ready' : '')} style={{ left: MAILBOX.x * TILE, top: MAILBOX.y * TILE, width: TILE, height: 2 * TILE }}
              aria-label="우편함" onClick={() => void openMail()} />
            {GATHER_ROCKS.map((r, i) => isOpenCell(r.x, r.y, openIds) && <button key={'rk' + i} className={'village-hit' + (craft.stoneLeft > 0 ? ' ready' : '')} style={{ left: r.x * TILE, top: r.y * TILE, width: TILE, height: TILE }}
              aria-label="바위 (돌멩이 캐기)" onClick={() => void gather(i)} />)}
          </>}
          {/* 묘목 심기: 빈 나무 자리 */}
          {plantTargets.map(s => (
            <button key={'pl' + s.spot} className="village-cell target plant" style={{ left: s.x * TILE, top: s.y * TILE, width: 2 * TILE, height: 3 * TILE }}
              aria-label="여기에 심기" onClick={() => void plantAt(s.spot)} />
          ))}
          {/* 안 열린 구역: 안개 + 🔒 팻말 */}
          <LockedRegions regions={v.level.regions} keys={v.level.keys} tile={TILE} onChoose={id => pop.openChooser(id)} />
          {/* 완성된 서식지 이름표 */}
          {v.habitats.map((h, i) => h && (
            <span key={'h' + i} className="village-habitat-tag" style={{ left: PLOTS[i].x * TILE - 8, top: PLOTS[i].y * TILE - 18 }}>{HABITAT_INFO[h.kind].emoji} {HABITAT_INFO[h.kind].name}</span>
          ))}
          {/* 땅에 떨어진 재료 */}
          {v.pickups.map(p => (
            <span key={'p' + p.spot} className="village-pickup" style={{ left: PICK_SPOTS[p.spot].x * TILE, top: PICK_SPOTS[p.spot].y * TILE, width: TILE, height: TILE }} title={MATERIAL_INFO[p.kind].name}><MaterialIcon kind={p.kind} /></span>
          ))}
          {/* 날아다니는 벌레 (잠자리채가 있을 때) */}
          {hasNet && !placing && !decorPlacing && !planting && bugs.map(b => (
            <button key={b.id} className="village-bug" style={{ left: b.x * TILE, top: b.y * TILE, width: TILE, height: TILE, zIndex: 12 + b.y }}
              aria-label="벌레 잡기" onClick={() => { setRound(n => n + 1); setCatching({ tool: 'net', x: b.x, y: b.y, bug: b.id }); }}>{b.kind}</button>
          ))}
          {/* 돌아다니는 포켓몬 */}
          {walkers.map(w => (
            <button key={w.id} className={'village-mon' + (w.guest ? ' guest' : '') + (placing || decorPlacing ? ' pass' : '')}
              style={{ left: w.x * TILE, top: w.y * TILE, width: TILE, height: TILE, zIndex: 11 + w.y }}
              onClick={() => void onMonTap(w)}
              aria-label={species(w.species).name}>
              <span className="village-shadow" />
              <AnimMon species={w.species} shiny={w.shiny} scale={1.5} fallback={pixelSrc(w.species)} />
              {w.shiny && <span className="village-shiny">✨</span>}
              {w.guest && <span className="village-guest-mark">손님</span>}
              {bubble?.id === w.id && <span className="village-bubble">{bubble.text}</span>}
            </button>
          ))}
          {/* 파트너: 서준이 한 칸 뒤에서 따라옴 (발밑 동그라미) */}
          {partner && <span className="village-mon partner" style={{ left: follow.x * TILE, top: follow.y * TILE, width: TILE, height: TILE, zIndex: 11 + follow.y }}>
            <span className="village-me-ring" />
            <AnimMon species={partner.species} shiny={partner.shiny} scale={1.5} back={follow.dir === 'up'} flip={follow.dir === 'right'} fallback={pixelSrc(partner.species)} />
          </span>}
          {/* 서준이 */}
          <span className="village-me" style={{ left: pos.x * TILE, top: pos.y * TILE, width: TILE, height: TILE, zIndex: 12 + pos.y }}>
            <span className="village-shadow" />
            <span className="village-me-body"><PlayerSprite sprite={PLAYER.sprite} dir={dir} step={step} /></span>
            <span className="village-me-mark">{PLAYER.name}</span>
          </span>
          </div>
        </div>
        {placing && <div className="village-placing" role="status">
          <span><CraftIcon kind={placing} scale={1} /> 반짝이는 점선 칸을 눌러 <b>{CRAFT_INFO[placing].name}</b> 놓기! (남은 {v.items[placing]}개)</span>
          <button className="secondary small" onClick={() => setPlacing(null)}>그만</button>
        </div>}
        {planting && <div className="village-placing" role="status">
          <span>🌱 마을을 걸어 다니며 반짝이는 자리를 찾아 눌러 줘! <b>열매나무</b>를 심어.</span>
          <button className="secondary small" onClick={() => setPlanting(null)}>그만</button>
        </div>}
        {decorPlacing && <div className="village-placing" role="status">
          <span>
            <DecorIcon item={decorPlacing.item} variant={decorPlacing.variant} scale={1} /> 반짝이는 칸을 눌러 <b>{DECOR_INFO[decorPlacing.item].name}</b> 놓기! (남은 {v.decorBag[decorPlacing.item]}개)
            {DECOR_INFO[decorPlacing.item].variants.length > 1 && <span className="village-variants" aria-label="모양 고르기">
              {DECOR_INFO[decorPlacing.item].variants.map((k, i) => (
                <button key={k} className={'village-variant' + (i === decorPlacing.variant ? ' on' : '')} aria-label={`모양 ${i + 1}`}
                  onClick={() => setDecorPlacing({ ...decorPlacing, variant: i })}><ObjectSprite kind={k} scale={1} /></button>
              ))}
            </span>}
          </span>
          <button className="secondary small" onClick={() => setDecorPlacing(null)}>그만</button>
        </div>}
        {craft.tools.rod > 0 && waterNear && !placing && !decorPlacing && !planting && <button className="village-fish-btn" onClick={() => { setRound(n => n + 1); setCatching({ tool: 'rod', x: waterNear.x, y: waterNear.y }); }}>🎣 낚시하기 <small>({craft.tools.rod}번 남음)</small></button>}
        {toast && <div className="village-toast" role="status">{toast}</div>}
        {timeUp && <div className="village-timeup"><p>⏰ 오늘 마을 시간은 끝났어.<br />내일 또 놀러 오자!</p><button className="primary" onClick={close}>나가기</button></div>}
      </div>

      <div className="village-controls" style={{ width: VIEW_COLS * TILE }}>
        <div className="village-mats" aria-label="재료">
          {MATERIALS.map(k => <span key={k} className="village-mat" title={MATERIAL_INFO[k].name}><MaterialIcon kind={k} /><b>{v.mats[k]}</b></span>)}
          <span className="village-mat" title="철 (훈련으로 받아요)"><IronIcon /><b>{craft.iron}</b></span>
          <span className="village-mat" title="반짝돌 (복습 문제를 맞히면 받아요)"><SparkleIcon /><b>{craft.sparkle}</b></span>
          <button className="secondary small" onClick={() => setSheet('workbench')}>🔨 제작대{craft.balls.length ? ` · 볼 ${craft.balls.length}` : ''}</button>
          <button className="secondary small" onClick={() => setSheet('bag')}>🔨 만들기{bagCount + decorBagCount ? ` · 가방 ${bagCount + decorBagCount}` : ''}</button>
        </div>
        <div className="village-pad" aria-label="움직이기">
          <span />
          <button aria-label="위로" onClick={() => void move(0, -1)}>▲</button>
          <span />
          <button aria-label="왼쪽으로" onClick={() => void move(-1, 0)}>◀</button>
          <span className="village-pad-mid" />
          <button aria-label="오른쪽으로" onClick={() => void move(1, 0)}>▶</button>
          <span />
          <button aria-label="아래로" onClick={() => void move(0, 1)}>▼</button>
          <span />
        </div>
        <a className="village-credit" href="/assets/village/LICENSE.txt" target="_blank" rel="noreferrer">마을 그림: Tuxemon 그림 작가들 (CC BY-SA) · 포켓몬 그림: 포켓로그</a>
      </div>

      <CraftIntro open={introOpen} view={view} onClose={closeIntro} />
      <FunIntro open={funOpen && !introOpen && !pop.guide} view={view} onClose={() => setFunOpen(false)} />
      <CatchGame tool={catching?.tool ?? null} round={round} onDone={catchDone} onClose={() => setCatching(null)} />
      <LevelGuide open={pop.guide} level={v.level} onClose={pop.closeGuide} />
      <KeyChooser key={pop.chooser.first ?? 'none'} level={v.level} open={pop.chooser.open && !pop.guide && !funOpen} busy={busy} first={pop.chooser.first} onClose={pop.closeChooser}
        onUnlock={async id => { const r = await act<{ message: string }>({ type: 'villageUnlock', region: id }); if (r) { setToast(r.message); pop.doneChooser(); } return !!r; }} />
      {sheet && <div className="village-sheet-back" onClick={() => setSheet(null)}>
        <div className="village-sheet" onClick={e => e.stopPropagation()}>
          {sheet === 'workbench' ? <WorkbenchSheet view={view} busy={busy} act={act} onToast={setToast}
              onOpenBall={onOpenBall ? b => { setSheet(null); onOpenBall(b); } : undefined}
              onPlant={() => setSheet('plant')} />
            : sheet === 'plant' ? <PlantSheet onPick={k => { setSheet(null); setPlacing(null); setDecorPlacing(null); setPlanting(k); }} />
            : sheet === 'bag' ? <MakeSheet tab={makeTab} onTab={setMakeTab} view={view} busy={busy} act={act} onToast={setToast} onHelp={() => { setSheet(null); setFunOpen(true); }}
              onPlace={k => { setSheet(null); setDecorPlacing(null); setPlacing(k); }}
              onPlaceDecor={k => { setSheet(null); setPlacing(null); setDecorPlacing({ item: k, variant: 0 }); }} />
            : 'decorAt' in sheet ? <DecorTakeSheet view={view} at={sheet.decorAt} busy={busy} act={act} onToast={setToast} onDone={() => setSheet(null)} />
            : <CellSheet view={view} cell={sheet.cell} busy={busy} act={act} onToast={setToast} onDone={() => setSheet(null)} />}
          <button className="secondary" onClick={() => setSheet(null)}>닫기</button>
        </div>
      </div>}
    </div>
  );
}

/** 만들기: 재료 2개 → 풀숲·물웅덩이·꽃밭 (가방으로) */
function CraftSheet({ view, busy, act, onToast, onPlace }: {
  view: ChildView; busy: boolean; act: <T>(a: Action) => Promise<T | null>; onToast: (s: string) => void; onPlace: (k: CraftKey) => void;
}) {
  const v = view.village;
  return <>
    <p className="village-sheet-note">재료로 만들고 <b>🌱 밭에 놓기</b>를 눌러 봐! 밭(점선 네모 4칸)을 채우면 서식지가 되고, 다음 날 손님이 와.</p>
    <div className="village-recipes">
      {CRAFTS.map(k => {
        const info = CRAFT_INFO[k];
        const cost = Object.entries(info.cost) as [MaterialKey, number][];
        const can = cost.every(([m, n]) => v.mats[m] >= n);
        return (
          <div key={k} className="village-recipe">
            <span className="village-recipe-icon"><CraftIcon kind={k} /></span>
            <span><b>{info.name}</b><small className="village-cost">{cost.map(([m, n]) => <span key={m}><MaterialIcon kind={m} scale={1} /> {MATERIAL_INFO[m].name} {n}</span>)}</small><small>가방에 {v.items[k]}개</small></span>
            <span className="village-recipe-btns">
              <button className="primary small" disabled={busy || !can} onClick={async () => { const r = await act<{ message: string }>({ type: 'villageCraft', item: k, stay: true }); if (r) onToast(r.message); }}>만들기</button>
              {v.items[k] > 0 && <button className="secondary small glow" disabled={busy} onClick={() => onPlace(k)}>🌱 밭에 놓기</button>}
            </span>
          </div>
        );
      })}
    </div>
    <div className="village-habitat-help">
      <b>서식지 만들기 (밭 4칸)</b>
      {(['green', 'shore', 'garden'] as const).map(h => {
        const info = HABITAT_INFO[h];
        const need = Object.entries(info.need).map(([k, n]) => `${CRAFT_INFO[k as CraftKey].name} ${n}`).join(' + ');
        return <small key={h}>{info.emoji} <b>{info.name}</b> = {need} → {info.typeText} 손님</small>;
      })}
      <small><MaterialIcon kind="twig" scale={1} /> 나뭇가지는 다음에 쓸 곳이 생겨요. 모아 두자!</small>
    </div>
  </>;
}

/** 밭 칸 하나: 빈 칸이면 가방에서 골라 놓기, 놓여 있으면 가방으로 */
function CellSheet({ view, cell, busy, act, onToast, onDone }: {
  view: ChildView; cell: number; busy: boolean; act: <T>(a: Action) => Promise<T | null>; onToast: (s: string) => void; onDone: () => void;
}) {
  const v = view.village;
  const item = v.cells[cell];
  if (item) {
    return <>
      <h3><CraftIcon kind={item} /> {CRAFT_INFO[item].name}</h3>
      <p className="village-sheet-note">가방에 다시 넣을까? 서식지가 풀리면 다음 날 손님이 안 와.</p>
      <button className="primary" disabled={busy} onClick={async () => { const r = await act<{ message: string }>({ type: 'villageTake', cell, stay: true }); if (r) { onToast(r.message); onDone(); } }}>가방에 넣기</button>
    </>;
  }
  const have = CRAFTS.filter(k => v.items[k] > 0);
  return <>
    <h3>무엇을 놓을까?</h3>
    {have.length === 0 ? <p className="village-sheet-note">가방에 놓을 것이 없어. 먼저 🔨 만들기에서 만들어 보자!</p>
      : <div className="village-place-row">
        {have.map(k => (
          <button key={k} className="village-place-btn" disabled={busy} onClick={async () => {
            const r = await act<{ message: string }>({ type: 'villagePlace', cell, item: k, stay: true });
            if (r) { onToast(r.message); onDone(); }
          }}><CraftIcon kind={k} /><b>{CRAFT_INFO[k].name}</b><small>{v.items[k]}개</small></button>
        ))}
      </div>}
  </>;
}

/** 꾸미기 물건·땅 바꾸기 그림 */
function DecorIcon({ item, variant = 0, scale = 2 }: { item: DecorKey; variant?: number; scale?: number }) {
  const info = DECOR_INFO[item];
  return info.ground ? <GroundIcon ground={info.ground} scale={scale} title={info.name} /> : <ObjectSprite kind={info.variants[variant]} scale={scale} />;
}

/** 만들기 창 하나에 세 칸: 🌱 서식지(밭) · 🎨 꾸미기(풀밭) · ⛰️ 땅 바꾸기(풀밭) — 2026-11-14 부모님: 만들기·꾸미기가 헷갈려서 합침 */
const MAKE_TABS: { key: MakeTab; label: string }[] = [{ key: 'habitat', label: '🌱 서식지' }, { key: 'decor', label: '🎨 꾸미기' }, { key: 'ground', label: '⛰️ 땅' }, { key: 'tools', label: '🧰 도구' }];
function MakeSheet({ tab, onTab, view, busy, act, onToast, onPlace, onPlaceDecor, onHelp }: {
  tab: MakeTab; onTab: (t: MakeTab) => void; view: ChildView; busy: boolean; act: <T>(a: Action) => Promise<T | null>; onToast: (s: string) => void;
  onPlace: (k: CraftKey) => void; onPlaceDecor: (k: DecorKey) => void; onHelp: () => void;
}) {
  return <>
    <h3>🔨 만들기</h3>
    <div className="village-make-tabs" role="tablist">
      {MAKE_TABS.map(t => <button key={t.key} role="tab" aria-selected={tab === t.key} className={'village-make-tab' + (tab === t.key ? ' on' : '')} onClick={() => onTab(t.key)}>{t.label}</button>)}
    </div>
    {tab === 'habitat' ? <CraftSheet view={view} busy={busy} act={act} onToast={onToast} onPlace={onPlace} />
      : tab === 'tools' ? <ToolsTab view={view} busy={busy} act={act} onToast={onToast} onHelp={onHelp} />
      : <DecorSheet tab={tab} view={view} busy={busy} act={act} onToast={onToast} onPlace={onPlaceDecor} />}
  </>;
}

/** 꾸미기·땅 바꾸기: 재료로 만들기 → 가방, 🌱 놓기로 마을 풀밭에 */
function DecorSheet({ tab, view, busy, act, onToast, onPlace }: {
  tab: DecorTab; view: ChildView; busy: boolean; act: <T>(a: Action) => Promise<T | null>; onToast: (s: string) => void; onPlace: (k: DecorKey) => void;
}) {
  const v = view.village;
  return <>
    <p className="village-sheet-note">{tab === 'decor'
      ? <>재료로 꾸미기 물건을 만들고 <b>🌱 놓기</b>를 눌러 마을 풀밭에 놓아 봐! 놓은 물건을 누르면 가방으로 돌아와.</>
      : <>풀밭을 연못·흙길·돌길로 바꿔 봐! 옆에 붙여 놓으면 이어져. 바꾼 칸을 누르면 풀밭으로 되돌릴 수 있어.</>}</p>
    <div className="village-recipes">
      {DECOR_ITEMS.filter(k => DECOR_INFO[k].tab === tab).map(k => {
        const info = DECOR_INFO[k];
        const cost = Object.entries(v.decorCosts[k]) as [MaterialKey, number][];
        const can = cost.every(([m, n]) => v.mats[m] >= n);
        return (
          <div key={k} className="village-recipe">
            <span className="village-recipe-icon"><DecorIcon item={k} /></span>
            <span><b>{info.name}</b><small className="village-cost">{cost.map(([m, n]) => <span key={m}><MaterialIcon kind={m} scale={1} /> {MATERIAL_INFO[m].name} {n}</span>)}</small>
              <small>가방에 {v.decorBag[k]}개{info.note ? ` · ${info.note}` : ''}</small></span>
            <span className="village-recipe-btns">
              <button className="primary small" disabled={busy || !can} onClick={async () => { const r = await act<{ message: string }>({ type: 'decorCraft', item: k, stay: true }); if (r) onToast(r.message); }}>만들기</button>
              {v.decorBag[k] > 0 && <button className="secondary small glow" disabled={busy} onClick={() => onPlace(k)}>🌱 놓기</button>}
            </span>
          </div>
        );
      })}
    </div>
  </>;
}

/** 놓은 꾸미기 물건: 가방에 다시 넣기 */
function DecorTakeSheet({ view, at, busy, act, onToast, onDone }: {
  view: ChildView; at: { x: number; y: number }; busy: boolean; act: <T>(a: Action) => Promise<T | null>; onToast: (s: string) => void; onDone: () => void;
}) {
  const i = decorIndexAt(view.village.decor, at.x, at.y);
  const d = i >= 0 ? view.village.decor[i] : null;
  const t = d ? -1 : terrainIndexAt(view.village.terrain, at.x, at.y);
  const ground = t >= 0 ? DECOR_ITEMS.find(k => DECOR_INFO[k].ground === view.village.terrain[t].ground) : undefined;
  if (!d && !ground) return <p className="village-sheet-note">여기에는 꾸미기 물건이 없어요.</p>;
  const take = async () => { const r = await act<{ message: string }>({ type: 'decorTake', x: at.x, y: at.y, stay: true }); if (r) { onToast(r.message); onDone(); } };
  if (!d && ground) return <>
    <h3><DecorIcon item={ground} /> {DECOR_INFO[ground].name}</h3>
    <p className="village-sheet-note">풀밭으로 되돌릴까? {DECOR_INFO[ground].name}은 가방에 다시 들어가.</p>
    <button className="primary" disabled={busy} onClick={take}>풀밭으로 되돌리기</button>
  </>;
  return <>
    <h3><ObjectSprite kind={d!.item === 'bush' ? 'bushSmall' : d!.kind} scale={2} /> {DECOR_INFO[d!.item].name}</h3>
    <p className="village-sheet-note">가방에 다시 넣을까? 다른 곳에 다시 놓을 수 있어.</p>
    <button className="primary" disabled={busy} onClick={take}>가방에 넣기</button>
  </>;
}
