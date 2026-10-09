"use client";
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { BALLS, eulReul, POTIONS, SUBJECT_INFO, type EventId, type Subject } from '@/lib/game-config';
import type { BoxItem, ChildView, LimitedView, OutingView } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import { RainbowCard } from './rainbow';
import { DiaryPage, MasterBallProgress } from './outing';
import { PokemonImage } from './common';

/* eslint-disable @next/next/no-img-element */

type Events = ChildView['events'];

/**
 * [이벤트] 탭: 지금 진행 중인 이벤트만 보여요. 설명을 읽고 "도전할래!"를 눌러야 시작하고,
 * 끝난 이벤트(지난 이벤트)는 아래 "📜 지난 이벤트" 모음에 완료 모습 그대로 남아요 (2026-10-09 부모님 요청).
 */
export function EventTab({ events, limited, busy, otherActive = 0, pastCount = 0, onPast, onAccept, onExplore, onOpenBox, onLimitedAccept, onLimitedChange, onGoldChange }: {
  events: Events; limited: LimitedView[]; busy: boolean;
  /** 이 탭 위에 따로 그린 진행 중 이벤트 수 (나들이 보고서) */
  otherActive?: number;
  /** 지난 이벤트 수와 모음 열기 */
  pastCount?: number; onPast?: () => void;
  onAccept: (id: EventId) => void;
  onExplore: (subject: Subject) => void;
  onOpenBox: () => void;
  onLimitedAccept: (id: string) => void;
  onLimitedChange: (id: string) => void;
  onGoldChange: (id: string) => void;
}) {
  const { allClear, streak } = events;
  // 진행 중인 것만: 기간 한정 이벤트는 기간 안, 올클리어는 완료 전, 연속은 완료 전이거나 상자를 아직 안 열었을 때
  const open = limited.filter(e => e.phase === 'active');
  const showAllClear = !allClear.completedAt;
  const showStreak = !streak.completedAt || streak.box?.pick == null;
  const none = !showAllClear && !showStreak && !open.length && !otherActive;
  return (
    <div className="event-list">
      {open.map(e => <RainbowCard key={e.id} ev={e} busy={busy} onAccept={() => onLimitedAccept(e.id)} onExplore={onExplore} onChange={() => onLimitedChange(e.id)} onGoldChange={() => onGoldChange(e.id)} />)}
      {showAllClear && <AllClearCard ev={allClear} busy={busy} onAccept={() => onAccept('allClear')} onExplore={onExplore} />}
      {showStreak && <StreakCard ev={streak} busy={busy} onAccept={() => onAccept('streak')} onOpenBox={onOpenBox} />}
      {none && (
        <section className="panel coming-soon">
          <span className="pill">EVENT</span>
          <h3>🎉 지금 열린 이벤트를 모두 해냈어!</h3>
          <p>새로운 이벤트를 준비하고 있어. 조금만 기다려 줘.</p>
        </section>
      )}
      {pastCount > 0 && onPast && <button className="secondary past-events-btn" onClick={onPast}>📜 지난 이벤트 ({pastCount})</button>}
    </div>
  );
}

// ---------- 지난 이벤트 모음 ----------
const boxLabel = (item: BoxItem | null | undefined) => !item ? '' : item.kind === 'potion' ? POTIONS[item.potion].label : item.kind === 'ball' ? BALLS[item.ball].label : '배틀 추가권';
const shortDate = (d: string | null | undefined) => (d ? d.slice(0, 10).replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1월 $2일') : '');
/** 나들이 보고서가 끝났는지 (완료·기한 넘김) */
export const outingFinished = (o: OutingView) => o.status === 'rewarded' || o.status === 'lateDone' || o.status === 'late';

type PastItem = { key: string; date: string; node: React.ReactNode };
/** 지난 이벤트 (끝난 날 최근 것부터): 올클리어·연속·기간 한정(레인보우)·나들이 보고서. 완료 모습 그대로 */
export function pastEvents(view: ChildView, onWrite?: (id: string) => void): PastItem[] {
  const out: PastItem[] = [];
  const { allClear, streak } = view.events;
  if (allClear.completedAt) out.push({ key: 'allClear', date: allClear.completedAt, node: (
    <section className="panel event-card past-card">
      <div className="event-head"><span className="event-emoji">🏆</span><div><span className="pill">지난 이벤트 · {shortDate(allClear.completedAt)} 완료</span><h3>{allClear.title}</h3></div></div>
      <SubjectCells ev={allClear} />
      <p className="event-done">🎉 6과목 올클리어 성공! 부활권 1장을 받았어.</p>
    </section>
  ) });
  if (streak.completedAt && streak.box?.pick != null) {
    const got = streak.box.items[streak.box.pick];
    out.push({ key: 'streak', date: streak.completedAt, node: (
      <section className="panel event-card past-card">
        <div className="event-head"><span className="event-emoji">📅</span><div><span className="pill">지난 이벤트 · {shortDate(streak.completedAt)} 완료</span><h3>{streak.title}</h3></div></div>
        <Calendar ev={{ ...streak, count: streak.days, doneToday: true }} />
        <p className="event-done">🎉 {streak.days}일 연속 성공! 랜덤박스에서 <b>{eulReul(boxLabel(got))}</b> 받았어.</p>
      </section>
    ) });
  }
  for (const e of view.limited.filter(e => e.phase === 'ended')) {
    out.push({ key: e.id, date: e.end, node: <RainbowCard ev={e} busy={false} onAccept={() => {}} onExplore={() => {}} onChange={() => {}} onGoldChange={() => {}} /> });
  }
  for (const o of view.outings.filter(outingFinished)) {
    const ball = o.reward?.balls && o.reward.picked != null ? o.reward.balls[o.reward.picked] : null;
    out.push({ key: o.id, date: o.late?.date ?? o.deadline ?? o.date, node: (
      <section className="panel event-card past-card outing-past">
        <div className="event-head"><span className="event-emoji">🧺</span><div><span className="pill">지난 이벤트 · 나들이</span><h3>{o.place} 체험보고서</h3></div></div>
        <MasterBallProgress stage={o.stage} />
        {ball && <div className="past-reward"><PokemonImage id={ball.species} shiny={ball.shiny} /><p className="event-done">🎉 마스터볼에서 {ball.shiny ? '✨ 이로치 ' : ''}<b>{eulReul(species(ball.species).name)}</b> 만났어!{o.reward?.duplicate ? ' (우정 보너스)' : ''}</p></div>}
        {o.status === 'late' && <p className="event-desc">마감이 지났어{o.late?.box ? ` (랜덤상자: ${o.late.box})` : ''}. 보고서는 마저 쓸 수 있어.</p>}
        {o.status === 'lateDone' && <p className="event-desc">마감 뒤에 끝까지 다 썼어! 멋져!</p>}
        <DiaryPage page={o.page} />
        {o.status === 'late' && onWrite && <button className="secondary" onClick={() => onWrite(o.id)}>마저 쓰기 ✏️</button>}
      </section>
    ) });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function PastEventsDialog({ open, view, onClose, onWrite }: { open: boolean; view: ChildView; onClose: () => void; onWrite: (id: string) => void }) {
  const items = pastEvents(view, onWrite);
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog past-events">
        <DialogTitle>📜 지난 이벤트</DialogTitle>
        <DialogDescription>{items.length ? `해낸 이벤트 ${items.length}개! 끝난 모습 그대로 모아 뒀어.` : '아직 끝난 이벤트가 없어.'}</DialogDescription>
        <div className="event-list">{items.map(it => <div key={it.key}>{it.node}</div>)}</div>
        <button className="primary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

function AllClearCard({ ev, busy, onAccept, onExplore }: { ev: Events['allClear']; busy: boolean; onAccept: () => void; onExplore: (s: Subject) => void }) {
  const left = ev.subjects.filter(s => !ev.mastered.includes(s));
  return (
    <section className="panel event-card">
      <div className="event-head"><span className="event-emoji">🏆</span><div><span className="pill">도전 이벤트</span><h3>{ev.title}</h3></div></div>
      {!ev.accepted ? <>
        <p className="event-desc">탐험에서 <b>6과목</b> 문제를 모두 맞히면 성공!<br />벌써 다 푼 과목도 인정돼.</p>
        <SubjectCells ev={ev} />
        <Reward icon={<span className="event-emoji">💖</span>} title="부활권 1장" text="포켓로그에서 져도 그 웨이브에서 다시 살아나!" />
        <button className="primary glow" disabled={busy} onClick={onAccept}>도전할래!</button>
      </> : ev.completedAt ? (
        <p className="event-done">🎉 올클리어 성공! 부활권을 받았어.</p>
      ) : <>
        {left.length === 1
          ? <p className="event-big">{left[0]}만 마스터하면 완성!</p>
          : <p className="event-desc">남은 과목 <b>{left.length}개</b>. 과목을 누르면 탐험하러 가!</p>}
        <SubjectCells ev={ev} onExplore={onExplore} busy={busy} />
        <Reward icon={<span className="event-emoji">💖</span>} title="보상: 부활권 1장" text="포켓로그에서 져도 그 웨이브에서 다시 살아나!" />
      </>}
    </section>
  );
}

function SubjectCells({ ev, onExplore, busy }: { ev: Events['allClear']; onExplore?: (s: Subject) => void; busy?: boolean }) {
  return (
    <div className="subject-cells">
      {ev.subjects.map(s => {
        const done = ev.mastered.includes(s);
        const style = { borderColor: SUBJECT_INFO[s].color };
        return done || !onExplore
          ? <div key={s} className={'subject-cell' + (done ? ' done' : '')} style={style}><b>{s}</b>{done ? <Check size={20} /> : <span>·</span>}</div>
          : <button key={s} className="subject-cell go" style={style} disabled={busy} onClick={() => onExplore(s)}><b>{s}</b><span>탐험 →</span></button>;
      })}
    </div>
  );
}

function StreakCard({ ev, busy, onAccept, onOpenBox }: { ev: Events['streak']; busy: boolean; onAccept: () => void; onOpenBox: () => void }) {
  return (
    <section className="panel event-card">
      <div className="event-head"><span className="event-emoji">📅</span><div><span className="pill">도전 이벤트</span><h3>{ev.title}</h3></div></div>
      {!ev.accepted ? <>
        <p className="event-desc">하루도 빠지지 않고 <b>일일미션을 다 풀기</b>!<br />{ev.days}일 이어지면 성공이야. 하루라도 빠지면 처음부터 다시!</p>
        <Calendar ev={ev} />
        <Reward icon={<img src={ASSETS.boxClosed} alt="" />} title="랜덤박스 1개" text="희귀 포켓몬 볼, 배틀 추가권, 이로치 볼 중 하나가 들어 있어!" />
        <button className="primary glow" disabled={busy} onClick={onAccept}>도전할래!</button>
      </> : ev.completedAt ? <>
        <p className="event-done">🎉 {ev.days}일 연속 성공!</p>
        <button className="primary glow" disabled={busy} onClick={onOpenBox}><img className="btn-icon" src={ASSETS.boxClosed} alt="" /> 랜덤박스 열기</button>
      </> : <>
        <p className="event-big">{ev.doneToday ? `오늘까지 ${ev.count}일째! 내일도 해 줘` : `오늘 미션 하면 ${ev.nextCount}일째!`}</p>
        {ev.count === 0 && ev.best > 0 && <p className="event-desc">연속이 끊겼어. 오늘부터 다시 시작하자!</p>}
        <Calendar ev={ev} />
        <Reward icon={<img src={ASSETS.boxClosed} alt="" />} title="보상: 랜덤박스 1개" text="희귀 포켓몬 볼·배틀 추가권·이로치 볼!" />
      </>}
    </section>
  );
}

/** 10칸 달력: 채운 날은 ✔, 오늘 할 칸은 반짝 */
function Calendar({ ev }: { ev: Events['streak'] }) {
  return (
    <div className="streak-cells">
      {Array.from({ length: ev.days }, (_, i) => {
        const filled = i < ev.count;
        const today = ev.accepted && !ev.doneToday && i === ev.count;
        return <div key={i} className={'streak-cell' + (filled ? ' on' : '') + (today ? ' today' : '')}><small>{i + 1}일</small>{filled ? <Check size={18} /> : today ? <span>오늘</span> : null}</div>;
      })}
    </div>
  );
}

function Reward({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="event-reward">{icon}<div><b>{title}</b><small>{text}</small></div></div>;
}

/** 올클리어를 해냈을 때 한 번 뜨는 축하 창 */
export function AllClearDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog">
        <DialogTitle>🏆 전 과목 올클리어!</DialogTitle>
        <DialogDescription>6과목 탐험을 모두 마스터했어. 정말 대단해!</DialogDescription>
        <div className="gift-big">💖</div>
        <h3 className="caught-name">부활권 1장을 받았어!</h3>
        <p>포켓로그에서 지면 그 자리에서 &lsquo;부활권을 쓸까?&rsquo;가 나와. 진행 중인 판이 없으면 배틀 탭에서 쓸 수 있어.</p>
        <button className="primary" onClick={onClose}>좋아!</button>
      </DialogContent>
    </Dialog>
  );
}
