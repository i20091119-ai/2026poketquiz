"use client";
// 포켓몬 마을 1단계(시험판, 2026-11-13). 규칙은 lib/village.ts, 기록 변경은 lib/game-engine.ts.
// 위에서 내려다보는 도트 지도(16×16 타일을 3배 = 48px, 그림은 village-tiles.tsx), 화살표 버튼으로 파트너 포켓몬이 걷고
// 화면이 파트너를 따라 움직여요. 포켓몬은 포켓로그의 움직이는 도트 그림(anim-mon.tsx). 사람 캐릭터는 없어요(2026-11-13 부모님).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import type { Action, ChildView, VillageGuest } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import {
  BLOCKED, CELL_COUNT, cellPos, CRAFT_INFO, CRAFTS, GUEST_LINES, HABITAT_INFO, MAP_H, MAP_W, MATERIAL_INFO, MATERIALS, PICK_SPOTS, PLOTS,
  RESIDENT_LINES, START_POS, type CraftKey, type MaterialKey,
} from '@/lib/village';
import { AnimMon } from './anim-mon';
import { CraftIcon, MaterialIcon, PlacedItem, TOP_ROWS, VillageEntrance, VillageGround } from './village-tiles';

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
const blocked = new Set(BLOCKED.map(p => key(p.x, p.y)));
const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

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
type Sheet = null | 'bag' | { cell: number };

type ScreenProps = {
  view: ChildView; busy: boolean;
  act: <T>(action: Action) => Promise<T | null>;
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
function VillageInner({ view, busy, act, onClose, onSeconds }: ScreenProps) {
  const v = view.village;
  // 들어와 있는 동안은 자정이 지나 잠겨도 계속 놀 수 있음 (나가면 잠김)
  const [inside, setInside] = useState(false);
  const [pos, setPos] = useState(START_POS);
  const [dir, setDir] = useState<'down' | 'up' | 'left' | 'right'>('down');
  const [hop, setHop] = useState(0);
  const VIEW_COLS = useViewCols();
  const [sheet, setSheet] = useState<Sheet>(null);
  // 놓기 모드: 고른 물건을 반짝이는 빈 밭 칸을 눌러 바로 놓기
  const [placing, setPlacing] = useState<CraftKey | null>(null);
  const [toast, setToast] = useState('');
  const [bubble, setBubble] = useState<{ id: string; text: string } | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [enterFailed, setEnterFailed] = useState(false);
  const localSeconds = useRef(0);

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
    ...v.guests.map(g => { const p = PLOTS[g.plot]; return { id: 'g' + g.plot, species: g.species, x: p.x + 2 < MAP_W ? p.x + 2 : p.x - 1, y: p.y + 1, guest: g }; }),
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
        if (!inMap(x, y) || blocked.has(key(x, y)) || (home && (Math.abs(x - home.x) > 3 || Math.abs(y - home.y) > 3))) continue;
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
    if (!inMap(x, y) || blocked.has(key(x, y))) return;
    setHop(h => h + 1);
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
    x: Math.max(0, Math.min(MAP_W * TILE - VIEW_COLS * TILE, pos.x * TILE - Math.floor(VIEW_COLS / 2) * TILE)),
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
  return (
    <div className="village-screen" role="dialog" aria-label="포켓몬 마을">
      <div className="village-top">
        <b>🏡 포켓몬 마을</b>
        <span className="village-picks">줍기 {v.pickLeft}개 남음</span>
        <button className="secondary small" onClick={close}>나가기</button>
      </div>
      <div className="village-view" style={{ width: VIEW_COLS * TILE, height: VIEW_ROWS * TILE }}>
        <div className="village-map" style={{ width: MAP_W * TILE, height: fullH, transform: `translate(${-cam.x}px, ${-cam.y}px)` }}>
          <VillageGround tile={TILE} />
          <div className="village-world" style={{ top: TOP_ROWS * TILE, width: MAP_W * TILE, height: MAP_H * TILE }}>
          {/* 밭 칸: 누르면 놓기·되가져오기 */}
          {Array.from({ length: CELL_COUNT }, (_, cell) => {
            const p = cellPos(cell);
            const item = v.cells[cell];
            const target = !!placing && !item;
            return (
              <button key={'c' + cell} className={'village-cell' + (item ? ' filled' : '') + (target ? ' target' : '')} style={{ left: p.x * TILE, top: p.y * TILE, width: TILE, height: TILE }}
                aria-label={item ? `${CRAFT_INFO[item].name} (누르면 가방으로)` : '빈 칸 (누르면 놓기)'} onClick={() => (target ? void placeAt(cell) : setSheet({ cell }))}>
                <PlacedItem cells={v.cells} cell={cell} tile={TILE} />
              </button>
            );
          })}
          {/* 완성된 서식지 이름표 */}
          {v.habitats.map((h, i) => h && (
            <span key={'h' + i} className="village-habitat-tag" style={{ left: PLOTS[i].x * TILE - 8, top: PLOTS[i].y * TILE - 18 }}>{HABITAT_INFO[h.kind].emoji} {HABITAT_INFO[h.kind].name}</span>
          ))}
          {/* 땅에 떨어진 재료 */}
          {v.pickups.map(p => (
            <span key={'p' + p.spot} className="village-pickup" style={{ left: PICK_SPOTS[p.spot].x * TILE, top: PICK_SPOTS[p.spot].y * TILE, width: TILE, height: TILE }} title={MATERIAL_INFO[p.kind].name}><MaterialIcon kind={p.kind} /></span>
          ))}
          {/* 돌아다니는 포켓몬 */}
          {walkers.map(w => (
            <button key={w.id} className={'village-mon' + (w.guest ? ' guest' : '') + (placing ? ' pass' : '')}
              style={{ left: w.x * TILE, top: w.y * TILE, width: TILE, height: TILE, zIndex: 11 + w.y }}
              onClick={() => setBubble({ id: w.id, text: `${species(w.species).name}: ${(w.guest ? GUEST_LINES : RESIDENT_LINES)[Math.floor(Math.random() * (w.guest ? GUEST_LINES : RESIDENT_LINES).length)]}` })}
              aria-label={species(w.species).name}>
              <span className="village-shadow" />
              <AnimMon species={w.species} shiny={w.shiny} scale={1.5} fallback={pixelSrc(w.species)} />
              {w.shiny && <span className="village-shiny">✨</span>}
              {w.guest && <span className="village-guest-mark">손님</span>}
              {bubble?.id === w.id && <span className="village-bubble">{bubble.text}</span>}
            </button>
          ))}
          {/* 파트너 = 내가 움직이는 포켓몬 (발밑 동그라미) */}
          {partner && <span className="village-me" style={{ left: pos.x * TILE, top: pos.y * TILE, width: TILE, height: TILE, zIndex: 12 + pos.y }}>
            <span className="village-me-ring" />
            <span key={hop} className="village-me-hop">
              <AnimMon species={partner.species} shiny={partner.shiny} scale={1.5} back={dir === 'up'} flip={dir === 'right'} fallback={pixelSrc(partner.species)} />
            </span>
            <span className="village-me-mark">{species(partner.species).name}</span>
          </span>}
          </div>
        </div>
        {placing && <div className="village-placing" role="status">
          <span><CraftIcon kind={placing} scale={1} /> 반짝이는 점선 칸을 눌러 <b>{CRAFT_INFO[placing].name}</b> 놓기! (남은 {v.items[placing]}개)</span>
          <button className="secondary small" onClick={() => setPlacing(null)}>그만</button>
        </div>}
        {toast && <div className="village-toast" role="status">{toast}</div>}
        {timeUp && <div className="village-timeup"><p>⏰ 오늘 마을 시간은 끝났어.<br />내일 또 놀러 오자!</p><button className="primary" onClick={close}>나가기</button></div>}
      </div>

      <div className="village-controls" style={{ width: VIEW_COLS * TILE }}>
        <div className="village-mats" aria-label="재료">
          {MATERIALS.map(k => <span key={k} className="village-mat" title={MATERIAL_INFO[k].name}><MaterialIcon kind={k} /><b>{v.mats[k]}</b></span>)}
          <button className="secondary small" onClick={() => setSheet('bag')}>🔨 만들기{bagCount ? ` · 가방 ${bagCount}` : ''}</button>
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

      {sheet && <div className="village-sheet-back" onClick={() => setSheet(null)}>
        <div className="village-sheet" onClick={e => e.stopPropagation()}>
          {sheet === 'bag' ? <CraftSheet view={view} busy={busy} act={act} onToast={setToast} onPlace={k => { setSheet(null); setPlacing(k); }} />
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
    <h3>🔨 만들기</h3>
    <p className="village-sheet-note">재료로 만들고 <b>🌱 밭에 놓기</b>를 눌러 봐! 밭(점선 네모 4칸)을 채우면 서식지가 돼.</p>
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
