"use client";
// 포켓몬 마을 열매나무·제작대 화면 (2026-11-14 부모님 결정). 규칙은 lib/village-craft.ts, 기록 변경은 lib/game-engine.ts.
// 제작대 창: 열매 종류 고르기(가진 수/상한) → 레시피마다 재료 그림 + 가진 수/필요 수 → 모자라면 흐리게 + 무엇이 모자란지.
// 만들면 짧은 뚝딱 연출 → 결과(볼은 바로 열거나 가방에, 묘목은 심으러 가기). 처음 들어올 때 안내 4장(기기마다 한 번).
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { BALLS, POTIONS, type PotionKind } from '@/lib/game-config';
import type { Action, ChildView } from '@/lib/game-engine';
import { BERRY_KINDS, RECIPE_INFO, RECIPES, STUDY_MAT_INFO, type RecipeCost, type RecipeKey } from '@/lib/village-craft';
import { MaterialIcon, ObjectSprite } from './village-tiles';

/* eslint-disable @next/next/no-img-element */

type Act = <T>(a: Action) => Promise<T | null>;
type Craft = ChildView['village']['craft'];
export type CraftedBall = Craft['balls'][number];

/** 열매 그림 */
export const BerryIcon = ({ kind, size = 28 }: { kind: PotionKind; size?: number }) => <img src={ASSETS.potion[kind]} alt="" width={size} height={size} className="berry-icon" />;
/** 철·반짝돌 그림 */
export const IronIcon = ({ scale = 2 }: { scale?: number }) => <ObjectSprite kind="matIron" scale={scale} />;
export const SparkleIcon = ({ scale = 2 }: { scale?: number }) => <ObjectSprite kind="matSparkle" scale={scale} />;

/** 모자란 것을 초1 말로 (다 있으면 null) — 엔진의 craftShortage와 같은 말 */
/** 가진 열매 합 (종류 상관없이) */
export const berryTotal = (craft: Craft) => BERRY_KINDS.reduce((a, k) => a + (craft.berries[k] ?? 0), 0);
/** 쓸 열매 정하기: 많이 가진 것부터 (엔진 berryPlan과 같은 순서) */
export function autoBerryPlan(craft: Craft, need: number): Partial<Record<PotionKind, number>> {
  const plan: Partial<Record<PotionKind, number>> = {};
  let left = need;
  for (const k of [...BERRY_KINDS].sort((a, b) => (craft.berries[b] ?? 0) - (craft.berries[a] ?? 0))) {
    if (left <= 0) break;
    const n = Math.min(left, craft.berries[k] ?? 0);
    if (n > 0) { plan[k] = n; left -= n; }
  }
  return plan;
}
export function shortageText(craft: Craft, stone: number, cost: RecipeCost): string | null {
  const need: string[] = [];
  const b = berryTotal(craft);
  if (b < cost.berry) need.push(`열매 ${cost.berry - b}개`);
  if (stone < cost.stone) need.push(`돌멩이 ${cost.stone - stone}개`);
  if (craft.iron < cost.iron) need.push(`철 ${cost.iron - craft.iron}개`);
  if (craft.sparkle < cost.sparkle) need.push(`반짝돌 ${cost.sparkle - craft.sparkle}개`);
  if (!need.length) return null;
  const hint = craft.iron < cost.iron ? ` (${STUDY_MAT_INFO.iron.how})` : craft.sparkle < cost.sparkle ? ` (${STUDY_MAT_INFO.sparkle.how})` : '';
  return `${need.join(', ')}가 더 필요해!${hint}`;
}

function RecipeIcon({ recipe }: { recipe: RecipeKey }) {
  return recipe === 'sapling' ? <ObjectSprite kind="sapling" scale={3} /> : <img src={ASSETS.ball[recipe]} alt="" width={44} height={44} />;
}

/** 제작대 창 */
export function WorkbenchSheet({ view, busy, act, onToast, onOpenBall, onPlant }: {
  view: ChildView; busy: boolean; act: Act; onToast: (s: string) => void;
  onOpenBall?: (b: CraftedBall) => void; onPlant: () => void;
}) {
  const craft = view.village.craft;
  const stone = view.village.mats.stone;
  const [note, setNote] = useState('');
  // 열매 고르기 단계: 많이 가진 것부터 자동으로 채운 뒤 +/−로 바꿀 수 있음
  const [planning, setPlanning] = useState<{ recipe: RecipeKey; plan: Partial<Record<PotionKind, number>> } | null>(null);
  const [making, setMaking] = useState<RecipeKey | null>(null);
  const [made, setMade] = useState<{ recipe: RecipeKey; ballId?: string } | null>(null);
  const treesFull = craft.trees.length + craft.saplings >= craft.treeMax;

  async function make(recipe: RecipeKey, berries: Partial<Record<PotionKind, number>>) {
    setNote('');
    setPlanning(null);
    setMaking(recipe);
    const [r] = await Promise.all([
      act<{ message: string; ballId?: string }>({ type: 'villageMake', recipe, berries, stay: true }),
      new Promise(res => window.setTimeout(res, 900)), // 뚝딱뚝딱 연출
    ]);
    setMaking(null);
    if (r) { setMade({ recipe, ballId: r.ballId }); onToast(r.message); }
  }

  if (making) return <div className="craft-making" role="status"><span className="craft-hammer">🔨</span><b>뚝딱뚝딱…</b><RecipeIcon recipe={making} /></div>;
  if (made) {
    const ball = made.ballId ? craft.balls.find(b => b.id === made.ballId) : undefined;
    return <div className="craft-made">
      <span className="craft-made-pic"><RecipeIcon recipe={made.recipe} /></span>
      <h3>{RECIPE_INFO[made.recipe].name}을 만들었어!</h3>
      {made.recipe === 'sapling'
        ? <><p className="village-sheet-note">마을의 빈 나무 자리에 심으면 다음 날부터 열매가 열려.</p>
          <button className="primary glow" onClick={onPlant}>🌱 심으러 가기</button></>
        : <><p className="village-sheet-note">열면 아직 도감에 없는 포켓몬이 나와! 📖 방명록에 온 친구가 먼저 나와. 가방에 넣어 두고 나중에 열어도 돼.</p>
          {ball && onOpenBall && <button className="primary glow" onClick={() => onOpenBall(ball)}>지금 열어 보기!</button>}</>}
      <button className="secondary" onClick={() => setMade(null)}>제작대로 돌아가기</button>
    </div>;
  }

  if (planning) {
    const need = craft.recipes[planning.recipe].berry;
    const sum = BERRY_KINDS.reduce((a, k) => a + (planning.plan[k] ?? 0), 0);
    const set = (k: PotionKind, d: number) => setPlanning(p => {
      if (!p) return p;
      const now = p.plan[k] ?? 0;
      const next = Math.max(0, Math.min(craft.berries[k] ?? 0, now + d));
      if (d > 0 && sum >= need) return p;
      return { ...p, plan: { ...p.plan, [k]: next } };
    });
    return <>
      <h3>🍎 어떤 열매를 쓸까?</h3>
      <p className="village-sheet-note">{RECIPE_INFO[planning.recipe].name}에는 열매 <b>{need}개</b>가 필요해. 종류는 섞어도 돼! 많이 가진 열매부터 골라 두었어.</p>
      <div className="berry-plan">{BERRY_KINDS.filter(k => (craft.berries[k] ?? 0) > 0).map(k => (
        <div key={k} className="berry-plan-row">
          <BerryIcon kind={k} /><span>{POTIONS[k].label} <small>({craft.berries[k]}개 있음)</small></span>
          <button className="secondary small" aria-label="빼기" onClick={() => set(k, -1)}>−</button>
          <b>{planning.plan[k] ?? 0}</b>
          <button className="secondary small" aria-label="더하기" onClick={() => set(k, 1)}>+</button>
        </div>
      ))}</div>
      <p className={'berry-plan-sum' + (sum === need ? ' ok' : '')}>{sum} / {need}개 {sum === need ? '✅' : sum < need ? `(${need - sum}개 더 골라 줘)` : ''}</p>
      <button className="primary big-button" disabled={busy || sum !== need} onClick={() => void make(planning.recipe, planning.plan)}>🔨 만들기!</button>
      <button className="secondary" onClick={() => setPlanning(null)}>제작대로 돌아가기</button>
    </>;
  }

  return <>
    <h3>🔨 제작대</h3>
    <div className="craft-stock" aria-label="가진 재료">
      <span><MaterialIcon kind="stone" scale={1} /> 돌멩이 <b>{stone}</b></span>
      <span><IronIcon scale={1} /> 철 <b>{craft.iron}</b></span>
      <span><SparkleIcon scale={1} /> 반짝돌 <b>{craft.sparkle}</b></span>
    </div>
    <p className="village-sheet-note">열매는 <b>종류 상관없이 합쳐서</b> 써. 지금 열매 <b>{berryTotal(craft)}개</b></p>
    <div className="craft-berries" aria-label="가진 열매">
      {BERRY_KINDS.map(k => (
        <span key={k} className={'craft-berry' + ((craft.berries[k] ?? 0) ? '' : ' none')}>
          <BerryIcon kind={k} /><small>{POTIONS[k].label}</small><b>{craft.berries[k] ?? 0}/{craft.berryCap}</b>
        </span>
      ))}
    </div>
    <div className="village-recipes">
      {RECIPES.map(k => {
        const cost = craft.recipes[k];
        const short = shortageText(craft, stone, cost);
        const blocked = k === 'sapling' && treesFull ? `지금은 열매나무를 ${craft.treeMax}그루까지 키울 수 있어! 마을 레벨이 오르면 자리가 늘어나.` : null;
        const parts: { key: string; icon: React.ReactNode; have: number; need: number }[] = [
          { key: 'berry', icon: <span aria-label="열매">🍎</span>, have: berryTotal(craft), need: cost.berry },
          { key: 'stone', icon: <MaterialIcon kind="stone" scale={1} />, have: stone, need: cost.stone },
          { key: 'iron', icon: <IronIcon scale={1} />, have: craft.iron, need: cost.iron },
          { key: 'sparkle', icon: <SparkleIcon scale={1} />, have: craft.sparkle, need: cost.sparkle },
        ].filter(p => p.need > 0);
        return (
          <div key={k} className={'village-recipe' + (short || blocked ? ' short' : '')}>
            <span className="village-recipe-icon"><RecipeIcon recipe={k} /></span>
            <span><b>{RECIPE_INFO[k].name}</b>
              <small className="village-cost">{parts.map(p => <span key={p.key} className={p.have >= p.need ? 'ok' : 'lack'}>{p.icon} {p.have}/{p.need}</span>)}</small>
              <small>{k === 'sapling' ? `열매나무 ${craft.trees.length}그루${craft.saplings ? ` · 묘목 ${craft.saplings}개` : ''} (최대 ${craft.treeMax})` : RECIPE_INFO[k].note}</small></span>
            <span className="village-recipe-btns">
              <button className={'primary small' + (short || blocked ? ' dim' : '')} disabled={busy} aria-disabled={!!(short || blocked)}
                onClick={() => { if (short || blocked) setNote(blocked ?? short!); else { setNote(''); setPlanning({ recipe: k, plan: autoBerryPlan(craft, cost.berry) }); } }}>만들기</button>
            </span>
          </div>
        );
      })}
    </div>
    {note && <p className="craft-note" role="status">{note}</p>}
    {craft.saplings > 0 && <button className="secondary glow" onClick={onPlant}>🌱 묘목 심기 ({craft.saplings}개)</button>}
    {craft.balls.length > 0 && <div className="craft-balls">
      <b>만든 볼 {craft.balls.length}개</b> <small>(가방에도 있어)</small>
      <div className="craft-ball-row">{craft.balls.map(b => (
        <button key={b.id} className="craft-ball" disabled={busy || !onOpenBall} onClick={() => onOpenBall?.(b)}>
          <img src={ASSETS.ball[b.kind]} alt="" width={32} height={32} /><small>{BALLS[b.kind].label} 열기</small>
        </button>
      ))}</div>
    </div>}
  </>;
}

/** 묘목 심기: 열매 종류 고르기 → (마을에서) 빈 나무 자리 누르기 */
export function PlantSheet({ onPick }: { onPick: (berry: PotionKind) => void }) {
  return <>
    <h3>🌱 어떤 열매나무로 키울까?</h3>
    <p className="village-sheet-note">고르면 마을에 빈 나무 자리가 반짝여. 눌러서 심어 줘!</p>
    <div className="craft-berries">
      {BERRY_KINDS.map(k => (
        <button key={k} className="craft-berry" onClick={() => onPick(k)}><BerryIcon kind={k} /><small>{POTIONS[k].label} 나무</small></button>
      ))}
    </div>
  </>;
}

// ---------- 처음 안내 4장 (기기마다 한 번, 부모님 문구) ----------
const INTRO_KEY = 'pq-village-craft-intro-v1';
export function craftIntroSeen(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return true; }
}
function markCraftIntroSeen() { try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* 이번 화면 동안만 */ } }

export function CraftIntro({ open, view, onClose }: { open: boolean; view: ChildView; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const tree = view.village.craft.trees[0];
  const pages = [
    <>
      <p className="intro-title">🌳 열매나무가 생겼어!</p>
      <div className="feed-intro-pics"><ObjectSprite kind={`fruitTree_${tree?.berry ?? 'apple'}` as never} scale={3} /></div>
      <p className="intro-text">마을에 열매나무가 생겼어!<br />매일 미션을 끝내면 <b>열매를 딸 수 있어</b></p>
    </>,
    <>
      <p className="intro-title">🔨 제작대</p>
      <div className="feed-intro-pics"><ObjectSprite kind="workbench" scale={3} /><img src={ASSETS.ball.poke} alt="" /></div>
      <p className="intro-text">제작대에서 열매로 <b>몬스터볼</b>을 만들 수 있어.<br />볼을 열면 <b>아직 못 만난 포켓몬</b>이 나와!</p>
    </>,
    <>
      <p className="intro-title">공부로 얻는 재료</p>
      <div className="feed-intro-pics"><IronIcon scale={4} /><SparkleIcon scale={4} /></div>
      <p className="intro-text"><b>철</b>은 훈련이나 미션 5일, <b>반짝돌</b>은 복습 문제를 맞히거나 미션을 하나도 안 틀리면 받아</p>
    </>,
    <>
      <p className="intro-title">열매 99개의 꿈</p>
      <div className="feed-intro-pics"><BerryIcon kind={tree?.berry ?? 'apple'} size={56} /><img src={ASSETS.ball.ultra} alt="" /></div>
      <p className="intro-text">열매 99개를 모으면 <b>하이퍼볼</b>!<br />드문 포켓몬이 나와</p>
    </>,
  ];
  const last = page === pages.length - 1;
  const close = () => { markCraftIntroSeen(); onClose(); };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="reward-dialog rainbow-intro feed-intro">
        <DialogTitle className="sr-only">열매나무·제작대 안내</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {pages.length}장</DialogDescription>
        <div className="intro-page" key={page}>{pages[page]}</div>
        <div className="intro-dots">{pages.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        <div className="intro-buttons">
          {last
            ? <button className="primary glow big-button" onClick={close}>알았어!</button>
            : <button className="primary big-button" onClick={() => setPage(p => p + 1)}>다음 <ArrowRight size={22} /></button>}
          {page > 0 && !last && <button className="secondary" onClick={() => setPage(p => p - 1)}>앞으로</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 마을 안에서 안내를 띄울지 (화면이 그려진 뒤 기기 기록을 읽음) */
export function useCraftIntro(inside: boolean): [boolean, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!inside || craftIntroSeen()) return;
    const t = window.setTimeout(() => setShow(true), 400);
    return () => window.clearTimeout(t);
  }, [inside]);
  return [show, () => setShow(false)];
}
