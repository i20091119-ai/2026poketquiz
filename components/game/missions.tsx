"use client";
import { ArrowRight, Check, Gift, RotateCcw, Sparkles, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ASSETS } from '@/lib/assets';
import { DAILY_PER_SUBJECT, SUBJECTS, SUBJECT_INFO, SUBJECT_TYPES, type Subject } from '@/lib/game-config';
import type { ChildView } from '@/lib/game-engine';
import { TypeBadge } from './common';

/* eslint-disable @next/next/no-img-element */

export function DailyTab({ view, busy, onStart, onOpenBox }: {
  view: ChildView; busy: boolean; onStart: () => void; onOpenBox: () => void;
}) {
  const d = view.daily;
  if (!view.bank || !d) return <section className="panel empty">아직 이번 주 문제은행이 없어요. 보호자에게 알려 주세요.</section>;
  const done = d.correct.length + d.wrong.length;
  const total = d.questions.length;
  const missed = d.finished && !d.complete;
  return (
    <section className="panel mission">
      <div className="section-heading"><span className="pill">TODAY&apos;S MISSION</span><span>{d.date}</span></div>
      <h2>{d.claimed ? '오늘의 미션 성공! 내일 또 만나자' : d.complete ? '랜덤상자를 열 시간이야!' : missed ? '오늘의 미션 끝! 수고했어' : '오늘의 미션을 풀어 보자!'}</h2>
      <p>{missed
        ? <>틀린 {d.wrong.length}문제는 다른 날 미션에 다시 나와. 그때 맞혀 보자!</>
        : <>과목마다 {DAILY_PER_SUBJECT}문제씩, 문제마다 기회는 한 번! 모두 맞히면 <b>랜덤상자 3개 중 하나</b>를 고를 수 있어. 틀린 문제는 다른 날 다시 나와.</>}</p>
      <div className="daily-subjects">
        {SUBJECTS.map(s => {
          const qs = d.questions.filter(q => q.subject === s);
          if (!qs.length) return null;
          return (
            <div className="daily-subject" key={s}>
              <span className="subject-chip" style={{ background: SUBJECT_INFO[s].color }}>{s}</span>
              <div className="dots">{qs.map(q => {
                const ok = d.correct.includes(q.id), miss = d.wrong.includes(q.id);
                return <span key={q.id} className={'dot' + (ok ? ' on' : miss ? ' miss' : '')}>{ok ? <Check size={12} /> : miss ? <X size={12} /> : null}</span>;
              })}</div>
            </div>
          );
        })}
      </div>
      <div className="mission-footer"><span><b>{done}</b> / {total} 문제 풀었어</span><span>맞힘 {d.correct.length} · 틀림 {d.wrong.length}</span></div>
      <Progress value={total ? (done / total) * 100 : 0} />
      {d.claimed
        ? <button className="primary" disabled>오늘의 미션 완료! <Check size={20} /></button>
        : missed
          ? <button className="primary" disabled>내일 다시 도전!</button>
          : d.complete
          ? <button className="primary glow" disabled={busy} onClick={onOpenBox}><img className="btn-icon" src={ASSETS.boxClosed} alt="" /> 랜덤상자 고르기</button>
          : <button className="primary" disabled={busy} onClick={onStart}>{done ? '이어서 풀기' : '미션 시작!'} <ArrowRight size={20} /></button>}
    </section>
  );
}

export function ExploreTab({ view, busy, onExplore, onSubjectReward, onMasterReward }: {
  view: ChildView; busy: boolean;
  onExplore: (s: Subject) => void; onSubjectReward: (s: Subject) => void; onMasterReward: () => void;
}) {
  if (!view.bank) return <section className="panel empty">아직 이번 주 문제은행이 없어요. 보호자에게 알려 주세요.</section>;
  return (
    <>
      <section className="panel">
        <div className="section-heading"><span className="pill">EXPLORE</span><span>{view.bank.title}</span></div>
        <h2>과목을 골라 탐험을 떠나자!</h2>
        <p>문제마다 기회는 한 번! 맞힌 문제는 다시 나오지 않고, 틀린 문제는 다른 날 다시 나와. 과목을 모두 맞히면 <b>물약 3개 중 하나</b>, 모든 과목을 마스터하면 <b>특별한 볼</b>을 받을 수 있어!</p>
      </section>
      <div className="explore-grid">
        {view.explore.map(e => {
          const mastered = e.total > 0 && e.solved === e.total;
          return (
            <section className="panel explore-card" key={e.subject} style={{ borderTopColor: SUBJECT_INFO[e.subject].color }}>
              <h3>{e.subject}</h3>
              <p className="muted">{SUBJECT_INFO[e.subject].description}</p>
              <div className="type-row">{SUBJECT_TYPES[e.subject].map(t => <TypeBadge key={t} type={t} small />)}</div>
              <div className="mission-footer">
                <span><b>{e.solved}</b> / {e.total}</span>
                {mastered && <span className="mastered"><Sparkles size={14} /> 마스터</span>}
              </div>
              <Progress value={e.total ? (e.solved / e.total) * 100 : 0} />
              {e.review > 0 && <p className="review-note"><RotateCcw size={14} /> 전에 틀린 문제 {e.review}개가 다시 나왔어!</p>}
              {e.reviewLater > 0 && <p className="review-note later">오늘 틀린 {e.reviewLater}문제는 다른 날 다시 나와요.</p>}
              {e.inDaily > 0 && <p className="review-note later">{e.inDaily}문제는 오늘의 미션에서 풀어요.</p>}
              {e.total === 0
                ? <button className="secondary" disabled>문제가 없어요</button>
                : mastered && !e.rewardClaimed
                  ? <button className="primary glow" disabled={busy} onClick={() => onSubjectReward(e.subject)}><Gift size={18} /> 물약 고르기</button>
                  : e.available > 0
                    ? <button className="primary" disabled={busy} onClick={() => onExplore(e.subject)}>탐험하기 ({e.available}) <ArrowRight size={18} /></button>
                    : <button className="secondary" disabled><Check size={16} /> {mastered ? '물약 받음' : '오늘은 끝!'}</button>}
            </section>
          );
        })}
      </div>
      <section className={'panel master-card' + (view.allMastered && !view.masterClaimed ? ' ready' : '')}>
        <img src={ASSETS.ball.luxury} alt="" />
        <div>
          <h3>모든 과목 마스터 보상</h3>
          <p>{view.masterClaimed ? '이번 문제은행의 마스터 보상을 받았어!' : view.allMastered ? '모든 과목을 마스터했어! 볼 3개 중 하나를 골라 봐.' : '모든 과목의 문제를 다 맞히면 전설이나 희귀한 포켓몬을 만날 확률이 50%인 볼을 받아.'}</p>
        </div>
        {view.allMastered && !view.masterClaimed && <button className="primary glow" disabled={busy} onClick={onMasterReward}>볼 고르기</button>}
      </section>
    </>
  );
}
