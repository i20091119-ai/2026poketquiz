"use client";
// 포켓몬 마을 낚시·벌레잡기 화면 (2026-11-14 부모님: "5분 만에 줍기 끝내고 할 게 없대"). 규칙은 lib/village-tools.ts.
// - 🔨 만들기 창 "🧰 도구" 칸: 낚싯대·잠자리채 만들기 (남은 횟수 막대, 15번 쓰면 부서짐)
// - 낚시: 물가에 서면 "🎣 낚시하기" → 찌가 퐁! 하고 가라앉을 때 "당겨!" (빠르거나 늦으면 놓침)
// - 벌레잡기: 마을에 날아다니는 벌레를 누르면 → 움직이는 화살표가 초록 칸에 올 때 "휘둘러!"
// - 안내 3장(기기마다 처음 한 번, 도구 칸의 "어떻게 해?"로 다시): 바위·열매나무 누르기 → 도구 만들기 → 낚시·벌레잡기 하는 법
import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Action, ChildView } from '@/lib/game-engine';
import { MATERIAL_INFO, type MaterialKey } from '@/lib/village';
import { TOOL_INFO, TOOLS, type ToolKey } from '@/lib/village-tools';
import { species } from '@/lib/pokedex';
import { AnimMon } from './anim-mon';
import { MaterialIcon } from './village-tiles';

type Act = <T>(a: Action) => Promise<T | null>;
export type CatchResult = { hit: boolean; left: number; broke: boolean; message: string; mat?: MaterialKey | null; berry?: string | null; met?: { species: number; fresh: boolean } | null };

/** 만들기 창 "🧰 도구" 칸 */
export function ToolsTab({ view, busy, act, onToast, onHelp }: { view: ChildView; busy: boolean; act: Act; onToast: (s: string) => void; onHelp: () => void }) {
  const v = view.village;
  const max = v.craft.rules.toolUses;
  const [note, setNote] = useState('');
  return <>
    <p className="village-sheet-note">재료로 도구를 만들면 <b>🎣 낚시</b>와 <b>🦋 벌레잡기</b>를 할 수 있어! 도구는 <b>{max}번</b> 쓰면 부서져. <button className="link-btn" onClick={onHelp}>어떻게 해?</button></p>
    <div className="village-recipes">
      {TOOLS.map(k => {
        const info = TOOL_INFO[k];
        const left = v.craft.tools[k];
        const cost = Object.entries(v.craft.toolCosts[k]).filter(([, n]) => (n ?? 0) > 0) as [MaterialKey, number][];
        const short = cost.filter(([m, n]) => v.mats[m] < n);
        const why = left > 0 ? `${info.name}가 아직 있어! 다 쓰면 다시 만들 수 있어.` : short.length ? `${short.map(([m, n]) => `${MATERIAL_INFO[m].name} ${n - v.mats[m]}개`).join(', ')}가 더 필요해!` : null;
        return (
          <div key={k} className={'village-recipe' + (why ? ' short' : '')}>
            <span className="village-recipe-icon tool-icon">{info.emoji}</span>
            <span><b>{info.name}</b>
              <small className="village-cost">{cost.map(([m, n]) => <span key={m} className={v.mats[m] >= n ? 'ok' : 'lack'}><MaterialIcon kind={m} scale={1} /> {v.mats[m]}/{n}</span>)}</small>
              {left > 0
                ? <span className="tool-uses" aria-label={`${left}번 남음`}><i style={{ width: `${Math.round((left / max) * 100)}%` }} /><small>{left}/{max}번 남음</small></span>
                : <small>{info.where} {info.action}</small>}
            </span>
            <span className="village-recipe-btns">
              <button className={'primary small' + (why ? ' dim' : '')} disabled={busy} aria-disabled={!!why}
                onClick={async () => { if (why) { setNote(why); return; } setNote(''); const r = await act<{ message: string }>({ type: 'toolCraft', tool: k, stay: true }); if (r) onToast(r.message); }}>만들기</button>
            </span>
          </div>
        );
      })}
    </div>
    {note && <p className="craft-note" role="status">{note}</p>}
  </>;
}

/** 낚시·벌레잡기 놀이 창. 끝나면 onDone(맞혔는지) */
export function CatchGame({ tool, round, onDone, onClose }: { tool: ToolKey | null; round: number; onDone: (hit: boolean) => Promise<CatchResult | null>; onClose: () => void }) {
  return (
    <Dialog open={!!tool} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog catch-game">
        {tool && <CatchInner key={tool + round} tool={tool} onDone={onDone} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CatchInner({ tool, onDone, onClose }: { tool: ToolKey; onDone: (hit: boolean) => Promise<CatchResult | null>; onClose: () => void }) {
  const info = TOOL_INFO[tool];
  // 낚시: wait → bite(가라앉음) / 벌레: swing(화살표가 움직임)
  const [phase, setPhase] = useState<'ready' | 'wait' | 'bite' | 'swing' | 'sending' | 'done'>('ready');
  const [result, setResult] = useState<CatchResult | null>(null);
  const [hint, setHint] = useState('');
  const timer = useRef<number | null>(null);
  // 벌레잡기 게이지: 화살표 위치(0~100)와 초록 칸
  const [zone] = useState(() => { const w = 26; const s = 10 + Math.floor(Math.random() * (90 - w - 10)); return { s, w }; });
  const pos = useRef(0);
  const [arrow, setArrow] = useState(0);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (phase !== 'swing') return;
    let raf = 0;
    const t0 = performance.now();
    const loop = (t: number) => { const p = ((t - t0) / 1100) % 2; pos.current = (p < 1 ? p : 2 - p) * 100; setArrow(pos.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  async function finish(hit: boolean, why = '') {
    if (timer.current) window.clearTimeout(timer.current);
    setHint(why);
    setPhase('sending');
    const r = await onDone(hit);
    setResult(r);
    setPhase('done');
  }
  function start() {
    if (tool === 'net') { setPhase('swing'); return; }
    setPhase('wait');
    timer.current = window.setTimeout(() => {
      setPhase('bite');
      timer.current = window.setTimeout(() => void finish(false, '조금 늦었어!'), 950);
    }, 1500 + Math.random() * 2500);
  }

  if (phase === 'done' || phase === 'sending') {
    const met = result?.met;
    return <>
      <DialogTitle>{result?.hit ? (tool === 'rod' ? '🎣 낚았다!' : '🦋 잡았다!') : '앗, 놓쳤어!'}</DialogTitle>
      <DialogDescription>{phase === 'sending' ? '…' : [hint, result?.message].filter(Boolean).join(' ')}</DialogDescription>
      {result?.hit && result.mat && <div className="catch-got"><MaterialIcon kind={result.mat} scale={4} /></div>}
      {met && <div className="catch-met">
        <span className="catch-met-mon"><AnimMon species={met.species} scale={2} fallback={`/assets/pokemon/pixel/${met.species}.png`} /></span>
        <p><b>{species(met.species).name}</b>{met.fresh ? '를 처음 만났어! 📖 방명록에 남겼어. 🏠 마을점수도 받았어!' : '를 또 만났어! 📖 방명록에 발자국 도장 🐾'}</p>
      </div>}
      {result && result.left > 0 && <p className="catch-left">{info.name} {result.left}번 더 쓸 수 있어</p>}
      <button className="primary big-button" disabled={phase === 'sending'} onClick={onClose}>좋아!</button>
    </>;
  }
  if (tool === 'rod') return <>
    <DialogTitle>🎣 낚시</DialogTitle>
    <DialogDescription>{phase === 'ready' ? '찌가 "퐁!" 하고 물속으로 들어가면 바로 당겨!' : phase === 'wait' ? '기다려… 기다려…' : '지금이야!'}</DialogDescription>
    <div className={'fish-pond' + (phase === 'bite' ? ' bite' : '')} aria-hidden>
      <span className="fish-bobber">{phase === 'bite' ? '💦' : '🔴'}</span>
      {phase === 'bite' && <b className="fish-pop">퐁!</b>}
    </div>
    {phase === 'ready'
      ? <button className="primary big-button" onClick={start}>낚싯대 던지기</button>
      : <button className="primary big-button pull-btn" onClick={() => (phase === 'bite' ? void finish(true) : void finish(false, '너무 빨리 당겼어!'))}>당겨!</button>}
    <button className="secondary" onClick={onClose} disabled={phase !== 'ready'}>그만할래</button>
  </>;
  return <>
    <DialogTitle>🦋 벌레잡기</DialogTitle>
    <DialogDescription>{phase === 'ready' ? '화살표가 초록 칸에 올 때 휘둘러!' : '초록 칸에서 눌러!'}</DialogDescription>
    <div className="bug-gauge" aria-hidden>
      <span className="bug-zone" style={{ left: `${zone.s}%`, width: `${zone.w}%` }} />
      {phase === 'swing' && <span className="bug-arrow" style={{ left: `${arrow}%` }}>▼</span>}
      <span className="bug-fly">🦋</span>
    </div>
    {phase === 'ready'
      ? <button className="primary big-button" onClick={start}>잠자리채 들기</button>
      : <button className="primary big-button pull-btn" onClick={() => { const p = pos.current; void finish(p >= zone.s && p <= zone.s + zone.w, p < zone.s ? '조금 빨랐어!' : p > zone.s + zone.w ? '조금 늦었어!' : ''); }}>휘둘러!</button>}
    <button className="secondary" onClick={onClose} disabled={phase !== 'ready'}>그만할래</button>
  </>;
}

// ---------- 안내 3장 ----------
const FUN_KEY = 'pq-village-fun-intro-v1';
export function funIntroSeen(): boolean { try { return localStorage.getItem(FUN_KEY) === '1'; } catch { return true; } }
function markFunIntroSeen() { try { localStorage.setItem(FUN_KEY, '1'); } catch { /* 이번 화면 동안만 */ } }

export function FunIntro({ open, view, onClose }: { open: boolean; view: ChildView; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const c = view.village.craft;
  const cost = (k: ToolKey) => Object.entries(c.toolCosts[k]).filter(([, n]) => (n ?? 0) > 0).map(([m, n]) => `${MATERIAL_INFO[m as MaterialKey].name} ${n}`).join(' + ');
  const pages = [
    <>
      <p className="intro-title">👆 마을에서 누를 수 있는 것</p>
      <ul className="village-guide-list">
        <li>🪨 <b>회색 바위</b>를 누르면 돌멩이를 캐 (하루 {c.rules.stoneDaily}번)</li>
        <li>🍎 <b>열매나무</b>를 누르면 열매를 따 (하루 1번)</li>
        <li>📮 <b>우편함</b>에 택배가 오면 깃발이 서</li>
        <li>🐾 <b>손님 포켓몬</b>을 누르면 말을 걸어</li>
      </ul>
      <p className="intro-text small">누를 수 있는 곳은 노랗게 반짝여!</p>
    </>,
    <>
      <p className="intro-title">🧰 도구를 만들자!</p>
      <p className="intro-text">🔨 만들기 → <b>🧰 도구</b> 칸에서 만들어.</p>
      <ul className="village-guide-list">
        <li>🎣 낚싯대 = {cost('rod')}</li>
        <li>🦋 잠자리채 = {cost('net')}</li>
      </ul>
      <p className="intro-text">도구는 <b>{c.rules.toolUses}번</b> 쓰면 부서져.<br />부서지면 다시 만들면 돼!</p>
    </>,
    <>
      <p className="intro-title">🎣 낚시 · 🦋 벌레잡기</p>
      <p className="intro-text">🎣 <b>물가</b>에 서면 &ldquo;낚시하기&rdquo; 버튼이 나와.<br />찌가 <b>퐁!</b> 하고 들어가면 바로 &ldquo;당겨!&rdquo;</p>
      <p className="intro-text">🦋 마을에 날아다니는 <b>벌레</b>를 눌러.<br />화살표가 <b>초록 칸</b>에 올 때 &ldquo;휘둘러!&rdquo;</p>
      <p className="intro-text small">잡으면 재료나 열매를 받고, 가끔 포켓몬을 만나! 만난 포켓몬은 📖 방명록에 남고, 처음이면 🏠 마을점수도 받아.</p>
    </>,
  ];
  const last = page === pages.length - 1;
  const close = () => { markFunIntroSeen(); setPage(0); onClose(); };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="reward-dialog rainbow-intro feed-intro village-guide">
        <DialogTitle className="sr-only">낚시·벌레잡기 안내</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {pages.length}장</DialogDescription>
        <div className="intro-page" key={page}>{pages[page]}</div>
        <div className="intro-dots">{pages.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        <div className="intro-buttons">
          {last ? <button className="primary glow big-button" onClick={close}>알았어!</button>
            : <button className="primary big-button" onClick={() => setPage(p => p + 1)}>다음 <ArrowRight size={22} /></button>}
          {page > 0 && <button className="secondary" onClick={() => setPage(p => p - 1)}>앞으로</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
