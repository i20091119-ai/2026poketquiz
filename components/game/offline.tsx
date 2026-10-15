"use client";
// 집 공부 달력 · 월요일 주간 기록 · 처음 안내 (2026-10-15 부모님 요청).
// 아이는 보기만 하고, 기록은 부모님이 보호자 공간에서 적습니다. 달력(MonthCalendar)은 보호자 화면에서도 같이 씀.
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { GIFT_SENDERS } from '@/lib/game-config';
import type { ChildView } from '@/lib/game-engine';
import { halfText, MARK_SCORE, MARK_SYMBOL, plusDays, weekDates, weekStartOf, type DayMark } from '@/lib/offline';
import { species } from '@/lib/pokedex';
import { PokemonImage } from './common';
import { Gem, gemLeftText } from './legend';


type WeekInfo = { goal: number; score: number; piece: boolean };
type LegendLog = { date: string; source: string; n: number; ref?: string };

export const monthOf = (date: string) => date.slice(0, 7);
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const lastDayOf = (month: string) => plusDays(shiftMonth(month, 1) + '-01', -1);
/** 이 달을 덮는 주들의 월요일 */
export function monthWeeks(month: string): string[] {
  const out: string[] = [];
  for (let ws = weekStartOf(month + '-01'); ws <= lastDayOf(month); ws = plusDays(ws, 7)) out.push(ws);
  return out;
}
const DOW = ['월', '화', '수', '목', '금', '토', '일'];

/** 이번 달 ● 개수와 얻은 조각 (주 조각은 그 주가 끝나는 달, 이벤트 조각은 받은 날의 달) */
export function monthStats(month: string, marks: Record<string, DayMark>, weeks: Record<string, WeekInfo>, log: LegendLog[]) {
  const full = Object.entries(marks).filter(([d, m]) => monthOf(d) === month && m === 'full').length;
  const weekPieces = Object.entries(weeks).filter(([ws, w]) => w.piece && monthOf(plusDays(ws, 6)) === month).length;
  const eventPieces = log.filter(l => l.source !== 'week' && monthOf(l.date) === month).reduce((s, l) => s + l.n, 0);
  return { full, pieces: weekPieces + eventPieces };
}

/** 월~일 7칸 + 오른쪽 "주" 칸. onDay를 주면 날짜를 누를 수 있음 (보호자 화면) */
export function MonthCalendar({ month, today, marks, weeks, defaultGoal, onDay, busy }: {
  month: string; today: string; marks: Record<string, DayMark>; weeks: Record<string, WeekInfo>; defaultGoal: number;
  onDay?: (date: string) => void; busy?: boolean;
}) {
  return (
    <div className="study-cal" role="grid" aria-label={`${month} 수련 달력`}>
      {[...DOW, '주'].map(d => <div key={d} className={'study-cal-head' + (d === '주' ? ' week' : '')}>{d}</div>)}
      {monthWeeks(month).map(ws => {
        const score = weekDates(ws).reduce((s, d) => s + (marks[d] ? MARK_SCORE[marks[d]] : 0), 0);
        const goal = weeks[ws]?.goal ?? defaultGoal;
        const reached = score >= goal;
        return [
          ...weekDates(ws).map(d => {
            const m = marks[d];
            const cls = 'study-day' + (monthOf(d) !== month ? ' other' : '') + (d === today ? ' today' : '') + (d > today ? ' future' : '') + (m ? ' mark-' + m : '');
            const inner = <><span className="study-day-no">{Number(d.slice(8))}</span><span className="study-mark">{m ? MARK_SYMBOL[m] : ''}</span></>;
            return onDay
              ? <button key={d} className={cls} disabled={busy || d > today} onClick={() => onDay(d)} aria-label={`${d} ${m ? MARK_SYMBOL[m] : '빈칸'}`}>{inner}</button>
              : <div key={d} className={cls}>{inner}</div>;
          }),
          ws > today ? <div key={ws + 'w'} className="study-week future" /> : <div key={ws + 'w'} className={'study-week' + (reached ? ' reached' : '')}>
            {reached && <Gem stage={1} need={3} filled={3} complete size={18} className="study-week-gem" />}
            <b>{halfText(score)}</b><small>/ {halfText(goal)}</small>
          </div>,
        ];
      })}
    </div>
  );
}

export function MarkLegend() {
  return <p className="study-legend"><span className="mark-full">●</span> 다 했어요 <span className="mark-some">■</span> 하나라도 했어요 <span className="mark-none">▲</span> 못 했어요</p>;
}

/** 아이 화면: 집 공부 달력 (보기만) */
export function StudyCalendarDialog({ open, view, onClose, onOpenBox }: { open: boolean; view: ChildView; onClose: () => void; onOpenBox: () => void }) {
  const off = view.offline;
  const [month, setMonth] = useState(monthOf(off.today));
  const stats = monthStats(month, off.marks, off.weeks, view.legend.log);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog study-dialog">
        <DialogTitle>📅 수련 달력</DialogTitle>
        <DialogDescription>부모님이 적어 주신 수련 기록이야.</DialogDescription>
        <div className="month-nav">
          <button className="icon-button" aria-label="이전 달" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft /></button>
          <b>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</b>
          <button className="icon-button" aria-label="다음 달" onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight /></button>
        </div>
        <MonthCalendar month={month} today={off.today} marks={off.marks} weeks={off.weeks} defaultGoal={off.weekGoal} />
        <MarkLegend />
        <p className="study-month-stats">이번 달 <b className="mark-full">●</b> {stats.full}개 · 얻은 전설 조각 💎 {stats.pieces}개</p>
        {off.boxes.length > 0 && <button className="primary glow" onClick={onOpenBox}>🎁 수련 선물 상자 열기 ({off.boxes.length})</button>}
        <button className="secondary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

/** 첫 화면 일일미션 위: 집 공부 달력 · 전설 지도 바로 가기 */
export function StudyStrip({ view, onCalendar, onMap }: { view: ChildView; onCalendar: () => void; onMap: () => void }) {
  const lg = view.legend;
  const cur = lg.stages.find(s => s.stage === lg.stage);
  return (
    <div className="study-strip">
      <button className="study-strip-btn" onClick={onCalendar}>
        <span className="study-strip-icon">📅</span><span>수련 달력</span>
        {view.offline.boxes.length > 0 && <span className="tab-count">{view.offline.boxes.length}</span>}
      </button>
      <button className={'study-strip-btn' + (lg.pending ? ' glow' : '')} onClick={onMap}>
        {cur && <Gem stage={cur.stage} salt={cur.salt} need={cur.need} filled={Math.min(lg.pieces, cur.need)} size={30} />}
        <span>전설 지도 {lg.pending ? '✨' : `${Math.min(lg.pieces, lg.need)}/${lg.need}`}</span>
      </button>
    </div>
  );
}

// ---------- 월요일 주간 기록 ----------
const weekSeenKey = (ws: string) => `pq-week-seen-${ws}`;
export function weekSeen(ws: string): boolean {
  try { return localStorage.getItem(weekSeenKey(ws)) === '1'; } catch { return true; }
}
export function markWeekSeen(ws: string) { try { localStorage.setItem(weekSeenKey(ws), '1'); } catch { /* 저장이 막혀 있으면 이번 화면 동안만 */ } }
const shortDate = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;

/**
 * 지난주 탐험 기록: 제목·기간 → 월~일 표시가 하나씩 튀어나오며 합계·막대가 오름(약 4초)
 * → 기준 이상이면 조각이 날아와 보석에 맞춰짐 / 모자라면 무엇이 더 있었으면 됐는지 → 응원 한 줄 → 버튼
 */
export function WeekRecordDialog({ view, open, onDone }: { view: ChildView; open: boolean; onDone: (openPick: boolean) => void }) {
  const w = view.offline.lastWeek;
  const [shown, setShown] = useState(0); // 튀어나온 날 수 (0~7)
  const [stage, setStage] = useState<'days' | 'result'>('days');
  useEffect(() => {
    if (!open || !w) return;
    if (shown < 7) { const t = window.setTimeout(() => setShown(n => n + 1), shown === 0 ? 700 : 450); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => setStage('result'), 700);
    return () => window.clearTimeout(t);
  }, [open, w, shown]);
  if (!w) return null;
  const running = w.marks.slice(0, shown).reduce((s, m) => s + (m ? MARK_SCORE[m] : 0), 0);
  const pct = Math.min(100, (running / w.goal) * 100);
  const st = view.legend.stages.find(s => s.stage === w.stage);
  const filledAfter = Math.min(w.need, w.before + 1);
  const completes = w.piece && filledAfter >= w.need;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && stage === 'result') onDone(completes && !!view.legend.pending); }}>
      <DialogContent className="reward-dialog week-record">
        <DialogTitle className="intro-title">지난주 수련 기록</DialogTitle>
        <DialogDescription>{shortDate(w.start)} ~ {shortDate(w.end)}</DialogDescription>
        <div className="week-days">
          {w.marks.map((m, i) => (
            <div key={i} className={'week-day' + (i < shown ? ' pop' : '')}>
              <small>{DOW[i]}</small>
              <span className={'study-mark big' + (m ? ' mark-' + m : '')}>{i < shown ? (m ? MARK_SYMBOL[m] : '·') : ''}</span>
            </div>
          ))}
        </div>
        <div className="week-bar" aria-label={`합계 ${halfText(running)} / ${halfText(w.goal)}`}>
          <i style={{ width: pct + '%' }} className={running >= w.goal ? 'reached' : ''} />
          <span>{halfText(running)} / {halfText(w.goal)}</span>
        </div>
        {stage === 'result' && <div className="week-result">
          {w.piece ? <>
            {st && <div className="week-gem">
              <Gem stage={w.stage} salt={st.salt} need={w.need} filled={filledAfter} fly={filledAfter - 1} glow={completes} size={120} /></div>}
            <p className="intro-text"><b>전설 조각을 얻었어!</b><br />{gemLeftText(filledAfter, w.need)}</p>
          </> : <p className="intro-text">{w.short}</p>}
          {w.cheer && <p className="week-cheer">💌 {GIFT_SENDERS[w.cheer.by]}: {w.cheer.text}</p>}
          <button className="primary big-button" onClick={() => onDone(completes && !!view.legend.pending)}>
            {completes && view.legend.pending ? '✨ 마스터볼 열러 가기' : '이번 주도 수련하자'}
          </button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

// ---------- 처음 안내 (업데이트 뒤 기기마다 한 번) ----------
const INTRO_KEY = 'pq-offline-intro-v1';
export function offlineIntroSeen(): boolean {
  try { return localStorage.getItem(INTRO_KEY) === '1'; } catch { return true; }
}
export function markOfflineIntroSeen() { try { localStorage.setItem(INTRO_KEY, '1'); } catch { /* 이번 화면 동안만 */ } }

export function OfflineIntro({ open, view, onClose }: { open: boolean; view: ChildView; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const s1 = view.legend.stages.find(s => s.stage === 1);
  const slides: React.ReactNode[] = [
    <>
      <p className="intro-title">📅 트레이너 수련이 생겼어!</p>
      <p className="intro-text">집에서 하는 공부는 <b>트레이너 수련</b>이야!</p>
      <p className="intro-text">수련을 <b>다 하면 <span className="mark-full">●</span></b>,<br />조금이라도 하면 <b><span className="mark-some">■</span></b>를<br />부모님이 기록해 줘.</p>
    </>,
    <>
      <p className="intro-title">🎁 다음 날엔 선물!</p>
      <p className="intro-text">다음 날 앱을 열면<br /><b>선물 상자</b>가 와 있어.</p>
      <p className="intro-text"><span className="mark-full">●</span> 날엔 더 좋은 <b>📘 수련 상자</b>!</p>
    </>,
    <>
      <p className="intro-title">💎 전설 조각</p>
      <p className="intro-text">일주일에 <span className="mark-full">●</span> <b>5개</b>를 모으면<br /><b>전설 조각 1개</b>!</p>
      <p className="intro-text"><span className="mark-some">■</span><span className="mark-some">■</span> 2개는 <span className="mark-full">●</span> 1개야.</p>
      <div className="intro-formula">
        <span className="mark-full">●</span><span className="mark-full">●</span><span className="mark-full">●</span><span className="mark-full">●</span><span className="mark-some">■</span><span className="mark-some">■</span> = 💎
      </div>
    </>,
    <>
      <p className="intro-title">✨ 마스터볼</p>
      {s1 && <Gem stage={1} salt={s1.salt} need={s1.need} filled={s1.need} complete size={110} />}
      <p className="intro-text">조각 <b>3개</b>를 모으면 보석이 완성되고<br /><b>마스터볼</b>을 열 수 있어.<br />안에 <b>전설 포켓몬</b>이 있어!</p>
    </>,
    <>
      <p className="intro-title">🗺️ 전설 지도</p>
      <p className="intro-text">전설은 갈수록 더 귀해.<br />다음 단계는 조각이 더 많이 필요해.</p>
      <div className="intro-map">
        {view.legend.stages.slice(0, 3).map(s => (
          <div key={s.stage} className="intro-map-step" style={{ marginLeft: (s.stage - 1) * 16 }}>
            <Gem stage={s.stage} salt={s.salt} need={s.need} filled={0} unknown={!s.open} size={44} />
            <small>{s.stage}단계 · 조각 {s.need}개</small>
          </div>
        ))}
      </div>
      <p className="intro-text small">1단계 전설 친구들</p>
      <div className="legend-candidates center">
        {[...(s1?.got ?? []).map(g => g.species), ...(s1?.left ?? [])].map(id => (
          <span key={id} className={'legend-cand ' + ((s1?.got ?? []).some(g => g.species === id) ? 'got' : 'silhouette')} title={species(id).name}><PokemonImage id={id} /></span>
        ))}
      </div>
    </>,
  ];
  const last = page === slides.length - 1;
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog offline-intro">
        <DialogTitle className="sr-only">트레이너 수련 안내</DialogTitle>
        <DialogDescription className="sr-only">{page + 1} / {slides.length}</DialogDescription>
        <div className="intro-page" key={page}>{slides[page]}</div>
        <div className="intro-dots">{slides.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        <div className="intro-buttons">
          <button className="primary big-button" onClick={() => (last ? onClose() : setPage(p => p + 1))}>{last ? '알았어!' : '다음'}</button>
          {page > 0 && <button className="secondary" onClick={() => setPage(p => p - 1)}>앞으로</button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
