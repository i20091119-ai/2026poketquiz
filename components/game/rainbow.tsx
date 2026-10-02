"use client";
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Subject } from '@/lib/game-config';
import type { LimitedView, OwnedPokemon } from '@/lib/game-engine';
import { shinyName, species } from '@/lib/pokedex';
import { PokemonImage } from './common';
import { ShinyBurst } from './rewards';

/*
 * 기간 한정 이벤트 "✨ 레인보우 컬러체인지!" 화면 (초등 1학년이 혼자 읽을 수 있게 큰 글씨, 숫자는 숫자로).
 * 규칙·날짜는 lib/limited-events.ts, 진행 계산은 lib/game-engine.ts(rainbowAnswer·limitedView).
 */

/** 무지개 6칸: 모은 조각만 그 과목 색으로 켜짐 */
export function RainbowBar({ ev, big }: { ev: LimitedView; big?: boolean }) {
  return (
    <div className={'rainbow-bar' + (big ? ' big' : '')} role="img" aria-label={`무지개 조각 ${ev.pieceCount}개 / ${ev.total}개`}>
      {ev.subjects.map(s => (
        <span key={s.subject} className={'rainbow-piece' + (s.piece ? ' on' : '')} style={{ ['--c' as string]: s.color }}>
          <b>{s.subject}</b>
        </span>
      ))}
    </div>
  );
}

/** 과목별 한 줄: 동그라미 10개로 연속 정답 수 (예: 국어 ●●●○○○○○○○ 3/10) */
function StreakRow({ s, goal, onExplore, busy }: { s: LimitedView['subjects'][number]; goal: number; onExplore?: (subject: Subject) => void; busy?: boolean }) {
  return (
    <div className={'rainbow-row' + (s.piece ? ' done' : '')}>
      <span className="rainbow-chip" style={{ background: s.color }}>{s.subject}</span>
      <span className="rainbow-dots" aria-label={`${s.streak} / ${goal}`}>
        {Array.from({ length: goal }, (_, i) => <i key={i} className={i < s.streak ? 'on' : ''} style={{ ['--c' as string]: s.color }} />)}
      </span>
      <span className="rainbow-count">{s.piece ? <>{s.heart} 조각!</> : <>{s.streak}/{goal}</>}</span>
      {!s.piece && onExplore && <button className="secondary small" disabled={busy} onClick={() => onExplore(s.subject)}>탐험 <ArrowRight size={14} /></button>}
    </div>
  );
}

/** 이벤트 탭 카드 */
export function RainbowCard({ ev, busy, onAccept, onExplore, onChange }: {
  ev: LimitedView; busy: boolean;
  onAccept: () => void; onExplore: (subject: Subject) => void; onChange: () => void;
}) {
  const ended = ev.phase === 'ended';
  const left = ev.total - ev.pieceCount;
  return (
    <section className={'panel event-card rainbow-card' + (ended ? ' ended' : '')}>
      <div className="event-head">
        <span className="event-emoji">🌈</span>
        <div><span className="pill">{ended ? '끝난 이벤트' : '깜짝 이벤트 · 토, 일'}</span><h3>✨ {ev.title}</h3></div>
      </div>
      <RainbowBar ev={ev} big />

      {ended ? <>
        <p className="rainbow-big">모은 조각 {ev.pieceCount}개</p>
        {ev.changed && <ChangedPokemon ev={ev} />}
        <p className="rainbow-text">{endMessage(ev)}</p>
      </> : !ev.accepted ? <>
        <p className="rainbow-text">탐험에서 한 과목을<br /><b>10문제 쭉 맞히면</b><br />그 과목 색 조각 1개!</p>
        <p className="rainbow-text">6개를 다 모으면 내 포켓몬 하나가<br />반짝반짝 이로치로 변신! ✨</p>
        <p className="rainbow-time">⏰ 끝나기까지 {ev.leftLabel}</p>
        <button className="primary glow big-button" disabled={busy} onClick={onAccept}>도전할래!</button>
      </> : <>
        {ev.remind && <p className="rainbow-remind">오늘 밤 12시면 끝나! 조각 {left}개 남았어!</p>}
        {ev.canChange
          ? <>
              <p className="rainbow-big">🌈 무지개 완성!</p>
              <button className="primary glow big-button" disabled={busy} onClick={onChange}>이로치로 바꿀 포켓몬 고르기 ✨</button>
            </>
          : ev.changed
            ? <ChangedPokemon ev={ev} />
            : <p className="rainbow-big">{left === 1 ? '와! 이제 딱 1개 남았어!' : `조각 ${left}개 남았어!`}</p>}
        {!ev.completed && <>
          <div className="rainbow-rows">{ev.subjects.map(s => <StreakRow key={s.subject} s={s} goal={ev.goal} onExplore={onExplore} busy={busy} />)}</div>
          <p className="rainbow-hint">틀리면? 그 과목은 처음부터 다시!</p>
        </>}
        <p className="rainbow-time">⏰ 끝나기까지 {ev.leftLabel}</p>
        <p className="rainbow-bonus">🎁 덤! 이틀 동안 볼에서 이로치가 {ev.shinyMultiplier}배 잘 나와!</p>
      </>}
    </section>
  );
}

function ChangedPokemon({ ev }: { ev: LimitedView }) {
  if (!ev.changed) return null;
  return (
    <div className="rainbow-changed">
      <PokemonImage id={ev.changed.species} shiny className="rainbow-changed-img" />
      <b>✨ {shinyName(ev.changed.species)}</b>
      <small>이로치로 변신했어!</small>
    </div>
  );
}

/** 끝났을 때 한 번 보여 주는 말 */
export const endMessage = (ev: LimitedView) => ev.pieceCount >= ev.partial.minPieces
  ? `이번엔 조각 ${ev.pieceCount}개 모았어! 잘했어! 선물로 사탕 ${ev.partial.candy}개 줄게 🍬`
  : '이번 레인보우는 끝났어. 다음 이벤트에서 또 만나자!';

const INTRO_PAGES = [
  <>
    <p className="intro-small">✨ 깜짝 이벤트! ✨</p>
    <p className="intro-title">레인보우 컬러체인지!</p>
    <p className="intro-text">토요일, 일요일<br />딱 이틀 동안만 열려!</p>
  </>,
  <>
    <p className="intro-title">🌈 무지개 조각 6개를 모아 봐!</p>
    <p className="intro-text">탐험에서 한 과목을<br />10문제 쭉 맞히면<br />그 과목 색 조각 1개!</p>
    <p className="intro-text">틀리면? 그 과목은 처음부터 다시!</p>
  </>,
  <>
    <p className="intro-title">6개를 다 모으면…</p>
    <p className="intro-text">내 포켓몬 하나를 골라서<br />반짝반짝 이로치로 변신! ✨</p>
  </>,
];

/** 기간 중 앱을 처음 열 때 뜨는 3장짜리 팝업 */
export function RainbowIntro({ ev, busy, onAccept, onLater }: { ev: LimitedView | null; busy: boolean; onAccept: () => void; onLater: () => void }) {
  const [page, setPage] = useState(0);
  const last = page === INTRO_PAGES.length - 1;
  return (
    <Dialog open={!!ev} onOpenChange={o => { if (!o && !busy) onLater(); }}>
      <DialogContent className="reward-dialog rainbow-intro">
        <DialogTitle className="sr-only">레인보우 컬러체인지</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {INTRO_PAGES.length}장</DialogDescription>
        {ev && <RainbowBar ev={ev} />}
        <div className="intro-page" key={page}>{INTRO_PAGES[page]}</div>
        <div className="intro-dots">{INTRO_PAGES.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
        {last
          ? <div className="intro-buttons">
              <button className="primary glow big-button" disabled={busy} onClick={onAccept}>도전할래!</button>
              <button className="secondary big-button" disabled={busy} onClick={onLater}>나중에</button>
            </div>
          : <button className="primary big-button" onClick={() => setPage(p => p + 1)}>다음 <ArrowRight size={22} /></button>}
      </DialogContent>
    </Dialog>
  );
}

/** 한 번만 보여 주는 안내 (일요일 저녁 9시, 끝났을 때) */
export function RainbowNotice({ ev, kind, onClose }: { ev: LimitedView | null; kind: 'remind' | 'end'; onClose: () => void }) {
  return (
    <Dialog open={!!ev} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="reward-dialog rainbow-intro">
        <DialogTitle className="intro-title">{kind === 'remind' ? '⏰ 레인보우 컬러체인지' : '🌈 레인보우 컬러체인지 끝!'}</DialogTitle>
        <DialogDescription className="sr-only">레인보우 이벤트 안내</DialogDescription>
        {ev && <RainbowBar ev={ev} big />}
        {ev && <p className="intro-text">{kind === 'remind' ? `오늘 밤 12시면 끝나! 조각 ${ev.total - ev.pieceCount}개 남았어!` : endMessage(ev)}</p>}
        <button className="primary big-button" onClick={onClose}>좋아!</button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 6개를 다 모았을 때: 가진 포켓몬 하나를 골라 이로치로 바꿈.
 * 고르기 → "이 포켓몬으로 할까?" → 조각 6개가 날아가 반짝이며 변신 → "✨ ○○가 반짝반짝 변신했어!"
 */
export function ShinyChangeDialog({ ev, owned, busy, onChange, onClose }: {
  ev: LimitedView | null; owned: OwnedPokemon[]; busy: boolean;
  onChange: (uid: string) => Promise<{ species: number; message: string } | null>;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<OwnedPokemon | null>(null);
  const [stage, setStage] = useState<'pick' | 'confirm' | 'fly' | 'done'>('pick');
  const [message, setMessage] = useState('');
  const candidates = owned.filter(p => !p.shiny);
  const open = !!ev && (ev.canChange || stage === 'fly' || stage === 'done');
  const close = () => { if (stage === 'fly' || busy) return; setStage('pick'); setPicked(null); onClose(); };
  async function go() {
    if (!picked) return;
    const r = await onChange(picked.uid);
    if (!r) return;
    setMessage(r.message);
    setStage('fly');
    window.setTimeout(() => setStage('done'), 1900);
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="reward-dialog rainbow-change">
        {stage === 'pick' && <>
          <DialogTitle className="intro-title">🌈 무지개 완성!</DialogTitle>
          <DialogDescription className="intro-text">이로치로 바꿀 포켓몬을 골라 봐!</DialogDescription>
          {candidates.length === 0
            ? <p className="intro-text">바꿀 수 있는 포켓몬이 없어. 모두 이로치야!</p>
            : <div className="change-grid">
                {candidates.map(p => (
                  <button key={p.uid} className="change-cell" onClick={() => { setPicked(p); setStage('confirm'); }}>
                    <PokemonImage id={p.species} className="change-img" />
                    <b>{species(p.species).name}</b>
                  </button>
                ))}
              </div>}
          <button className="secondary" onClick={close}>나중에 고를래</button>
        </>}
        {stage === 'confirm' && picked && <>
          <DialogTitle className="intro-title">{species(picked.species).name}</DialogTitle>
          <DialogDescription className="intro-text">이 포켓몬을 이로치로 바꿀까?<br />바꾸면 되돌릴 수 없어!</DialogDescription>
          <div className="change-compare">
            <PokemonImage id={picked.species} className="change-big" />
            <ArrowRight size={28} />
            <PokemonImage id={picked.species} shiny className="change-big" />
          </div>
          <div className="intro-buttons">
            <button className="primary glow big-button" disabled={busy} onClick={() => void go()}>응, 바꿀래! ✨</button>
            <button className="secondary big-button" disabled={busy} onClick={() => setStage('pick')}>다시 고를래</button>
          </div>
        </>}
        {(stage === 'fly' || stage === 'done') && picked && <>
          <DialogTitle className="intro-title">{stage === 'done' ? '✨ 변신 성공! ✨' : '반짝반짝…'}</DialogTitle>
          <DialogDescription className="sr-only">무지개 조각이 포켓몬에게 날아가요</DialogDescription>
          <div className={'change-stage' + (stage === 'done' ? ' done' : '')}>
            {stage === 'fly' && ev?.subjects.map((s, i) => (
              <span key={s.subject} className="fly-piece" style={{ ['--c' as string]: s.color, ['--a' as string]: `${i * 60}deg`, animationDelay: `${i * 0.12}s` }} />
            ))}
            {stage === 'done' && <ShinyBurst />}
            <PokemonImage id={picked.species} shiny={stage === 'done'} className="celebration-img change-pokemon" />
          </div>
          {stage === 'done' && <>
            <h3 className="caught-name shiny-name">✨ {shinyName(picked.species)}</h3>
            <p className="intro-text">{message}</p>
            <button className="primary big-button" onClick={() => { setStage('pick'); setPicked(null); onClose(); }}>최고야! <Check size={20} /></button>
          </>}
        </>}
      </DialogContent>
    </Dialog>
  );
}
