"use client";
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { SUBJECT_INFO, type EventId, type Subject } from '@/lib/game-config';
import type { ChildView } from '@/lib/game-engine';

/* eslint-disable @next/next/no-img-element */

type Events = ChildView['events'];

/** [이벤트] 탭: 도전 이벤트 두 개. 설명을 읽고 "도전할래!"를 눌러야 시작하고, 끝내면 다시 나오지 않아요. */
export function EventTab({ events, busy, onAccept, onExplore, onOpenBox }: {
  events: Events; busy: boolean;
  onAccept: (id: EventId) => void;
  onExplore: (subject: Subject) => void;
  onOpenBox: () => void;
}) {
  const { allClear, streak } = events;
  const none = allClear.hidden && streak.hidden;
  return (
    <div className="event-list">
      {!allClear.hidden && <AllClearCard ev={allClear} busy={busy} onAccept={() => onAccept('allClear')} onExplore={onExplore} />}
      {!streak.hidden && <StreakCard ev={streak} busy={busy} onAccept={() => onAccept('streak')} onOpenBox={onOpenBox} />}
      {none && (
        <section className="panel coming-soon">
          <span className="pill">EVENT</span>
          <h3>🎉 도전을 모두 해냈어!</h3>
          <p>새로운 이벤트를 준비하고 있어. 조금만 기다려 줘.</p>
        </section>
      )}
    </div>
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
