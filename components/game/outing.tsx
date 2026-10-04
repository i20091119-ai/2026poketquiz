"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ASSETS } from '@/lib/assets';
import { eulReul, GIFT_SENDERS, iGa, waGwa } from '@/lib/game-config';
import type { ChildView, OutingView } from '@/lib/game-engine';
import {
  ACTIVITY_OPTIONS, charCount, dateLabel, FEELINGS, feelingParagraph, firstSentence, reportParagraphs, sentenceCount, STEP_TITLES, stepProblem, WEATHERS, WHO_OPTIONS,
  type OutingReport,
} from '@/lib/outing';
import { shinyName, species } from '@/lib/pokedex';
import { PokemonImage, postJson } from './common';
import { ShinyBurst } from './rewards';

/* eslint-disable @next/next/no-img-element */

/*
 * 나들이 체험보고서 이벤트 화면 (초등 1학년이 혼자 읽을 수 있게 큰 글씨, 숫자는 숫자로).
 * 규칙은 lib/outing.ts, 저장·확인·보상은 lib/game-engine.ts (outingSave·outingSubmit·reviewOuting·outingPick).
 */

export const mediaUrl = (id: string) => `/api/media?id=${encodeURIComponent(id)}`;
const fromLabel = (o: OutingView) => GIFT_SENDERS[o.from as keyof typeof GIFT_SENDERS] ?? '부모님';

/** 파트너 포켓몬이 말풍선으로 말해요 */
export function PartnerTalk({ view, children }: { view: ChildView; children: React.ReactNode }) {
  const p = view.owned.find(p => p.uid === view.partner) ?? view.owned[0];
  return (
    <div className="partner-talk">
      {p && <PokemonImage id={p.species} shiny={p.shiny} />}
      <div className="talk-bubble">{children}</div>
    </div>
  );
}
const partnerName = (view: ChildView) => {
  const p = view.owned.find(p => p.uid === view.partner) ?? view.owned[0];
  return p ? (p.shiny ? shinyName(p.species) : species(p.species).name) : '파트너';
};

/** 마스터볼 3개 실루엣: 7단계 중 마친 만큼 차례로 채워짐 */
export function MasterBallProgress({ stage, big }: { stage: number; big?: boolean }) {
  const fill = (i: number) => Math.max(0, Math.min(1, (stage / 7) * 3 - i));
  return (
    <div className={'mb-progress' + (big ? ' big' : '')} role="img" aria-label={`보고서 ${stage}단계 / 7단계`}>
      {[0, 1, 2].map(i => (
        <span key={i} className="mb-slot">
          <img className="mb-shadow" src={ASSETS.ball.master} alt="" />
          <span className="mb-fill" style={{ height: `${fill(i) * 100}%` }}><img src={ASSETS.ball.master} alt="" /></span>
        </span>
      ))}
    </div>
  );
}

// ---------- 소개 팝업 (기기마다 한 번) ----------
export function OutingIntro({ o, view, busy, onAccept, onLater }: { o: OutingView | null; view: ChildView; busy: boolean; onAccept: () => void; onLater: () => void }) {
  const [page, setPage] = useState(0);
  if (!o) return null;
  const pages = [
    <>
      <p className="intro-title">🧺 나들이 체험보고서!</p>
      <p className="intro-text">{dateLabel(o.date)}에 간<br /><b>{o.place}</b> 기억나?</p>
      {o.letter && <p className="outing-letter">💌 {fromLabel(o)}: &ldquo;{o.letter}&rdquo;</p>}
    </>,
    <>
      <p className="intro-title">✏️ 보고서를 써 보자!</p>
      <PartnerTalk view={view}>내가 하나씩 도와줄게!<br />7단계만 따라 하면<br />멋진 보고서가 완성돼.</PartnerTalk>
    </>,
    <>
      <p className="intro-title">🎁 다 쓰면?</p>
      <MasterBallProgress stage={7} big />
      <p className="intro-text">7일 안에 다 쓰고<br />부모님이 읽어 주시면<br /><b>마스터볼 3개 중 1개</b>를 열 수 있어!</p>
      <p className="intro-text">안에는 <b>전설의 포켓몬</b>이 들어 있어!</p>
    </>,
  ];
  const last = page === pages.length - 1;
  return (
    <Dialog open onOpenChange={v => { if (!v && !busy) onLater(); }}>
      <DialogContent className="reward-dialog rainbow-intro outing-intro">
        <DialogTitle className="sr-only">나들이 체험보고서</DialogTitle>
        <DialogDescription className="sr-only">{page + 1}장 / {pages.length}장</DialogDescription>
        <div className="intro-page" key={page}>{pages[page]}</div>
        <div className="intro-dots">{pages.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>
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

// ---------- 이벤트 탭 카드 ----------
export function OutingCard({ o, view, busy, onAccept, onWrite, onReward, onGallery }: {
  o: OutingView; view: ChildView; busy: boolean; onAccept: () => void; onWrite: () => void; onReward: () => void; onGallery: () => void;
}) {
  const fresh = o.status === 'writing' && o.acceptedDate && o.stage < 3 && daysSince(o.date, view.today) <= 1;
  return (
    <section className="panel event-card outing-card">
      <div className="event-head">
        <span className="event-emoji">🧺</span>
        <div><span className="pill">나들이 이벤트</span><h3>{o.place} 체험보고서</h3></div>
      </div>
      <MasterBallProgress stage={o.stage} big />
      {o.status === 'open' && <>
        <p className="event-desc">{dateLabel(o.date)}에 간 {o.place} 이야기를<br />7단계로 써 보자!</p>
        <button className="primary glow big-button" disabled={busy} onClick={onAccept}>도전할래!</button>
      </>}
      {o.status === 'writing' && <>
        <p className="outing-deadline">⏰ 보고서 마감까지 <b>{o.daysLeft}일</b></p>
        <p className="event-desc">{o.stage}단계 / 7단계 {o.stage ? '했어!' : ''}</p>
        {fresh && <p className="outing-tip">💡 다녀온 날이나 다음 날에 1~3단계를 쓰면 기억이 잘 나!</p>}
        <button className="primary big-button" disabled={busy} onClick={onWrite}>{o.stage ? '보고서 이어 쓰기 ✏️' : '보고서 쓰기 시작 ✏️'}</button>
      </>}
      {o.status === 'revise' && <>
        <p className="outing-note">📝 {fromLabel2(o.revision?.by)}: &ldquo;{o.revision?.note}&rdquo;</p>
        <button className="primary big-button" disabled={busy} onClick={onWrite}>고쳐서 다시 보내기 ✏️</button>
      </>}
      {o.status === 'submitted' && <p className="outing-wait">📖 부모님이 읽는 중이야. 조금만 기다려 줘!</p>}
      {o.status === 'approved' && <>
        <p className="event-big">🎉 부모님이 칭찬해 주셨어!</p>
        <button className="primary glow big-button" disabled={busy} onClick={onReward}>마스터볼 고르러 가기</button>
      </>}
      {o.status === 'rewarded' && <p className="event-done">🎉 보고서 완성! 전설의 포켓몬을 만났어.</p>}
      {o.status === 'late' && <>
        <p className="outing-note">마감이 지났어. 보고서는 마저 쓸 수 있어 (보상은 없어).</p>
        <button className="secondary big-button" disabled={busy} onClick={onWrite}>마저 쓰기 ✏️</button>
      </>}
      {o.status === 'lateDone' && <p className="event-done">📒 보고서를 끝까지 썼어! 멋져!</p>}
      <button className="text-button" onClick={onGallery}>📒 체험보고서 모음 보기</button>
    </section>
  );
}
const fromLabel2 = (by?: string) => GIFT_SENDERS[by as keyof typeof GIFT_SENDERS] ?? '부모님';
const daysSince = (date: string, today: string) => Math.round((Date.parse(today) - Date.parse(date)) / 86400000);

// ---------- 그림일기 한 장 (보고서 모음·보호자 화면·인쇄) ----------
export function DiaryPage({ page, mark }: { page: OutingView['page']; mark?: React.ReactNode }) {
  return (
    <article className={'diary-page' + (page.complete ? '' : ' incomplete')}>
      <header className="diary-head">
        <span>📅 {dateLabel(page.date)}</span>
        <span>날씨: {page.weather || '—'}</span>
        {!page.complete && <span className="diary-mark">미완성</span>}
        {mark}
      </header>
      <h3 className="diary-title">{page.title}</h3>
      <div className="diary-picture">
        {page.picture ? <img src={mediaUrl(page.picture.mediaId)} alt="보고서 그림" /> : <span className="muted">그림이 아직 없어요</span>}
      </div>
      <div className="diary-text">
        {page.paragraphs.length ? page.paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="muted">아직 쓴 글이 없어요</p>}
      </div>
    </article>
  );
}

export function OutingGallery({ open, outings, onClose, onWrite }: { open: boolean; outings: OutingView[]; onClose: () => void; onWrite: (id: string) => void }) {
  const list = outings.filter(o => o.status !== 'open');
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="reward-dialog outing-gallery">
        <DialogTitle>📒 체험보고서 모음</DialogTitle>
        <DialogDescription>{list.length ? `보고서 ${list.length}장` : '아직 보고서가 없어. 나들이 이벤트에서 써 보자!'}</DialogDescription>
        {list.map(o => (
          <div key={o.id} className="gallery-item">
            <DiaryPage page={o.page} />
            {o.status === 'late' && <button className="secondary" onClick={() => onWrite(o.id)}>마저 쓰기 ✏️</button>}
          </div>
        ))}
        <button className="primary" onClick={onClose}>닫기</button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 보고서 쓰기 (7단계, 단계마다 배우기 → 해보기 → 고쳐보기) ----------
type Phase = 'learn' | 'try' | 'check';
export function OutingWriter({ o, view, busy, onClose, onSave, onSubmit }: {
  o: OutingView | null; view: ChildView; busy: boolean; onClose: () => void;
  onSave: (step: number, data: Partial<OutingReport>) => Promise<boolean>;
  onSubmit: () => Promise<boolean>;
}) {
  const [step, setStep] = useState(() => (o ? Math.min(7, o.stage + 1) : 1));
  const [phase, setPhase] = useState<Phase>('learn');
  const [draft, setDraft] = useState<OutingReport>(() => ({ ...(o?.report ?? {}) }));
  const [hint, setHint] = useState('');
  if (!o) return null;
  const min = o.rules?.minChars ?? 10;
  const set = (patch: Partial<OutingReport>) => { setDraft(d => ({ ...d, ...patch })); setHint(''); };
  const go = (s: number) => { setStep(s); setPhase('learn'); setHint(''); };
  const problem = stepProblem(step, draft, { minChars: min });
  const save = async () => {
    if (problem) { setHint(problem); return; }
    if (await onSave(step, draft)) { if (step < 7) go(step + 1); }
  };
  const done = o.stage >= 7 && !stepProblem(7, draft, { minChars: min });
  return (
    <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}>
      <DialogContent className="reward-dialog outing-writer">
        <DialogTitle className="writer-title">🧺 {o.place} 체험보고서 <small>{o.status === 'writing' && o.daysLeft !== null ? `· 마감까지 ${o.daysLeft}일` : ''}</small></DialogTitle>
        <DialogDescription className="sr-only">{step}단계 {STEP_TITLES[step - 1]}</DialogDescription>
        <div className="step-chips">
          {STEP_TITLES.map((t, i) => {
            const n = i + 1, locked = n > o.stage + 1;
            return <button key={n} className={'step-chip' + (n === step ? ' on' : '') + (n <= o.stage ? ' done' : '')} disabled={locked || busy} onClick={() => go(n)} title={t}>{n <= o.stage ? <Check size={14} /> : n}</button>;
          })}
        </div>
        <MasterBallProgress stage={o.stage} />
        {o.status === 'revise' && o.revision && <p className="outing-note">📝 {fromLabel2(o.revision.by)}: &ldquo;{o.revision.note}&rdquo;</p>}
        <h3 className="step-title">{step}단계 · {STEP_TITLES[step - 1]}</h3>
        <div className="phase-tabs">
          {(['learn', 'try', 'check'] as Phase[]).map(p => <span key={p} className={'phase' + (p === phase ? ' on' : '')}>{p === 'learn' ? '① 배우기' : p === 'try' ? '② 해보기' : '③ 고쳐보기'}</span>)}
        </div>
        <StepBody step={step} phase={phase} o={o} view={view} draft={draft} set={set} min={min} />
        {hint && <p className="writer-hint">{hint}</p>}
        <div className="writer-buttons">
          {phase === 'learn' && <button className="primary big-button" onClick={() => setPhase('try')}>해 볼게! <ArrowRight size={20} /></button>}
          {phase === 'try' && <>
            <button className="primary big-button" onClick={() => { if (step === 7) { void save(); return; } setPhase('check'); }}>{step === 7 ? '다 확인했어!' : '다 썼어!'} <ArrowRight size={20} /></button>
            <button className="secondary" onClick={() => setPhase('learn')}>다시 배우기</button>
          </>}
          {phase === 'check' && <>
            <button className="primary big-button" disabled={busy} onClick={() => void save()}>저장하고 다음으로 <ArrowRight size={20} /></button>
            <button className="secondary" onClick={() => setPhase('try')}>고칠래</button>
          </>}
          {done && step === 7 && (o.status === 'writing' || o.status === 'revise' || o.status === 'late') && (
            <button className="primary glow big-button" disabled={busy} onClick={async () => { if (await onSubmit()) onClose(); }}>
              {o.status === 'late' ? '보고서 완성하기 📒' : '부모님께 보내기 💌'}
            </button>
          )}
          <button className="text-button" onClick={onClose}>나중에 이어 쓰기</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Counter({ text, min }: { text?: string; min: number }) {
  const n = charCount(text);
  return <span className={'char-count' + (n >= min ? ' ok' : '')}>{n} / {min}글자</span>;
}
function Chips({ options, value, onPick }: { options: string[]; value?: string; onPick: (v: string) => void }) {
  return <div className="chip-row">{options.map(op => <button key={op} type="button" className={'pick-chip' + (op === value ? ' on' : '')} onClick={() => onPick(op)}>{op}</button>)}</div>;
}
/** 고쳐보기: 스스로 확인하는 질문과 자동으로 살핀 결과 */
function CheckList({ items }: { items: { q: string; ok: boolean }[] }) {
  return <ul className="self-check">{items.map(it => <li key={it.q} className={it.ok ? 'ok' : ''}>{it.ok ? '✅' : '🔎'} {it.q}</li>)}</ul>;
}

function StepBody({ step, phase, o, view, draft, set, min }: {
  step: number; phase: Phase; o: OutingView; view: ChildView; draft: OutingReport; set: (p: Partial<OutingReport>) => void; min: number;
}) {
  const name = partnerName(view);
  const sight = draft.sight ?? o.sights[0] ?? '동물';
  switch (step) {
    case 1: {
      const sentence = firstSentence(draft);
      if (phase === 'learn') return <PartnerTalk view={view}>보고서는 <b>언제, 누구와, 어디서</b>로 시작하면 읽는 사람이 바로 알 수 있어!<br /><span className="talk-example">예) 토요일에 엄마와 바다에 갔다.</span></PartnerTalk>;
      if (phase === 'try') return <div className="step-form">
        <p className="q">📅 언제 갔어?</p>
        <Chips options={[dateLabel(o.date), '지난 주말', '어제', '오늘']} value={draft.when} onPick={v => set({ when: v })} />
        <p className="q">👨‍👩‍👧 누구와 갔어?</p>
        <Chips options={WHO_OPTIONS} value={draft.who} onPick={v => set({ who: v })} />
        <p className="q">📍 어디에 갔어?</p>
        <Chips options={[o.place]} value={draft.where} onPick={v => set({ where: v })} />
        <p className="q">🌤️ 날씨는 어땠어?</p>
        <Chips options={WEATHERS} value={draft.weather} onPick={v => set({ weather: v })} />
        {sentence && <>
          <p className="made-sentence">✨ {sentence}</p>
          <p className="q">이 문장을 보고 따라 써 봐!</p>
          <textarea className="write-box" rows={2} value={draft.first ?? ''} onChange={e => set({ first: e.target.value })} placeholder={sentence} />
        </>}
      </div>;
      return <><WrittenText text={draft.first} /><CheckList items={[
        { q: '언제가 들어갔어?', ok: !!draft.when && (draft.first ?? '').includes(draft.when.split(' ')[0]) },
        { q: '누구와가 들어갔어?', ok: !!draft.who && (draft.first ?? '').includes(draft.who.replace(/와$/, '')) },
        { q: '어디서가 들어갔어?', ok: !!draft.where && (draft.first ?? '').includes(draft.where) },
        { q: '끝에 마침표(.)를 찍었어?', ok: /[.!]\s*$/.test(draft.first ?? '') },
      ]} /></>;
    }
    case 2: {
      const did = draft.did ?? [];
      const options = [...o.sights.map(s => `${s} 보기`), ...ACTIVITY_OPTIONS];
      const move = (i: number, d: number) => { const next = [...did]; const j = i + d; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; set({ did: next }); };
      if (phase === 'learn') return <PartnerTalk view={view}>한 일을 <b>순서대로</b> 쓰면 이야기가 쏙쏙 들어와!<br /><span className="talk-example">먼저, 표를 샀다. 그다음, 펭귄을 봤다. 마지막으로, 아이스크림을 먹었다.</span></PartnerTalk>;
      if (phase === 'try') return <div className="step-form">
        <p className="q">한 일 3개를 골라 줘! ({did.length}/3)</p>
        <div className="chip-row">{options.map(op => {
          const on = did.includes(op);
          return <button key={op} type="button" className={'pick-chip' + (on ? ' on' : '')} onClick={() => set({ did: on ? did.filter(x => x !== op) : did.length < 3 ? [...did, op] : did })}>{op}</button>;
        })}</div>
        {did.length > 0 && <ol className="order-list">{did.map((d, i) => (
          <li key={d}><b>{['먼저', '그다음', '마지막으로'][i]}</b> {d}
            <span className="order-buttons"><button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">⬆</button><button type="button" onClick={() => move(i, 1)} disabled={i === did.length - 1} aria-label="아래로">⬇</button></span>
          </li>))}</ol>}
        <p className="q">&lsquo;먼저, 그다음, 마지막으로&rsquo;를 넣어서 써 봐!</p>
        <textarea className="write-box" rows={4} value={draft.order ?? ''} onChange={e => set({ order: e.target.value })} placeholder="먼저, … 그다음, … 마지막으로, …" />
        <Counter text={draft.order} min={min} />
      </div>;
      const t = draft.order ?? '';
      return <><WrittenText text={t} /><CheckList items={[{ q: '"먼저"가 있어?', ok: t.includes('먼저') }, { q: '"그다음"이 있어?', ok: t.includes('그다음') }, { q: '"마지막으로"가 있어?', ok: t.includes('마지막') }, { q: `${min}글자 넘게 썼어?`, ok: charCount(t) >= min }]} /></>;
    }
    case 3: {
      if (phase === 'learn') return <PartnerTalk view={view}>두 문장을 비교해 봐!<br /><span className="talk-plain">😐 {eulReul(sight)} 봤다.</span><br /><span className="talk-example">😃 커다란 {iGa(sight)} &lsquo;킁킁&rsquo; 소리를 내며 천천히 걸어 다녔다.</span><br />생김새, 소리, 하던 일을 쓰면 눈에 보이는 것 같지?</PartnerTalk>;
      if (phase === 'try') return <div className="step-form">
        <p className="q">무엇을 자세히 써 볼까?</p>
        <Chips options={o.sights} value={draft.sight} onPick={v => set({ sight: v })} />
        <p className="q">👀 생김새는 어땠어?</p>
        <input className="write-line" value={draft.look ?? ''} onChange={e => set({ look: e.target.value })} placeholder="예) 목이 길고 점무늬가 있었다" />
        <p className="q">👂 어떤 소리가 났어?</p>
        <input className="write-line" value={draft.sound ?? ''} onChange={e => set({ sound: e.target.value })} placeholder="예) 아무 소리도 안 났다, 어흥" />
        <p className="q">🏃 무엇을 하고 있었어?</p>
        <input className="write-line" value={draft.doing ?? ''} onChange={e => set({ doing: e.target.value })} placeholder="예) 나뭇잎을 먹고 있었다" />
        <p className="q">이제 <b>두 문장 이상</b>으로 자세히 써 봐!</p>
        <textarea className="write-box" rows={4} value={draft.detail ?? ''} onChange={e => set({ detail: e.target.value })} />
        <Counter text={draft.detail} min={min} /> <span className="char-count">{sentenceCount(draft.detail)} / 2문장</span>
      </div>;
      const t = draft.detail ?? '';
      return <><WrittenText text={t} /><CheckList items={[{ q: '두 문장 이상이야?', ok: sentenceCount(t) >= 2 }, { q: `${draft.sight ?? '고른 것'} 이야기야?`, ok: !!draft.sight && t.includes(draft.sight) }, { q: '생김새·소리·하던 일 중에 2가지 넘게 썼어?', ok: charCount(t) >= min * 2 }]} /></>;
    }
    case 4: {
      if (phase === 'learn') return <PartnerTalk view={view}>안내판이나 엄마, 아빠 설명에서 <b>처음 안 것</b>이 있었어?<br /><span className="talk-example">예) 기린은 혀가 까만색이라는 것을 알게 되었다.</span></PartnerTalk>;
      if (phase === 'try') return <div className="step-form">
        <p className="q">새로 알게 된 것 한 가지를 써 봐!</p>
        <textarea className="write-box" rows={3} value={draft.learned ?? ''} onChange={e => set({ learned: e.target.value })} placeholder="…라는 것을 알게 되었다." />
        <Counter text={draft.learned} min={min} />
      </div>;
      const t = draft.learned ?? '';
      return <><WrittenText text={t} /><CheckList items={[{ q: `${min}글자 넘게 썼어?`, ok: charCount(t) >= min }, { q: '끝에 마침표(.)를 찍었어?', ok: /[.!]\s*$/.test(t) }]} /></>;
    }
    case 5: {
      if (phase === 'learn') return <PartnerTalk view={view}>&lsquo;재미있었다&rsquo; 말고 다른 말로 마음을 나타내 볼까?<br /><span className="talk-example">참 신기했다. 왜냐하면 펭귄이 물속에서 엄청 빨랐기 때문이다.</span></PartnerTalk>;
      if (phase === 'try') return <div className="step-form">
        <p className="q">그때 마음은 어땠어?</p>
        <Chips options={FEELINGS} value={draft.feeling} onPick={v => set({ feeling: v })} />
        {draft.feeling && <>
          <p className="made-sentence">참 {draft.feeling}. 왜냐하면…</p>
          <textarea className="write-box" rows={3} value={draft.because ?? ''} onChange={e => set({ because: e.target.value })} placeholder="… 때문이다." />
          <Counter text={draft.because} min={min} />
        </>}
      </div>;
      return <><WrittenText text={feelingParagraph(draft)} /><CheckList items={[{ q: '마음 낱말을 골랐어?', ok: !!draft.feeling }, { q: '왜 그런 마음이었는지 썼어?', ok: charCount(draft.because) >= min }]} /></>;
    }
    case 6:
      if (phase === 'learn') return <PartnerTalk view={view}>보고서에 그림을 넣으면 더 멋져!<br />그날 본 것을 그려 보거나, 부모님이 찍은 사진을 골라 봐.</PartnerTalk>;
      if (phase === 'try') return <PictureStep o={o} draft={draft} set={set} />;
      return <><div className="diary-picture">{draft.picture ? <img src={mediaUrl(draft.picture.mediaId)} alt="고른 그림" /> : null}</div><CheckList items={[{ q: '그림을 골랐어?', ok: !!draft.picture }]} /></>;
    case 7: {
      const page = { ...o.page, weather: draft.weather ?? '', paragraphs: reportParagraphs(draft), picture: draft.picture ?? null, complete: true };
      const c = draft.checks ?? {};
      const toggle = (k: 'missing' | 'period' | 'read') => set({ checks: { ...c, [k]: !c[k] } });
      if (phase === 'learn') return <PartnerTalk view={view}>마지막이야! 다 쓴 보고서를 <b>소리 내어</b> 읽어 보자.<br />이상한 곳이 있으면 위의 숫자를 눌러 고칠 수 있어.</PartnerTalk>;
      return <div className="step-form">
        <DiaryPage page={page} />
        <button type="button" className="secondary read-aloud" onClick={() => readAloud(page.paragraphs.join(' '))}><Volume2 size={18} /> {iGa(name)} 읽어 줄게</button>
        <div className="final-checks">
          <label className={c.missing ? 'on' : ''}><input type="checkbox" checked={!!c.missing} onChange={() => toggle('missing')} /> 빠진 내용 없이 다 썼어</label>
          <label className={c.period ? 'on' : ''}><input type="checkbox" checked={!!c.period} onChange={() => toggle('period')} /> 문장 끝에 마침표(.)를 찍었어</label>
          <label className={c.read ? 'on' : ''}><input type="checkbox" checked={!!c.read} onChange={() => toggle('read')} /> 소리 내어 한 번 읽었어</label>
        </div>
      </div>;
    }
    default: return null;
  }
}
function WrittenText({ text }: { text?: string }) {
  return <div className="written-text"><small>내가 쓴 글</small><p>{text || '(아직 없어)'}</p></div>;
}
function readAloud(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.85;
  window.speechSynthesis.speak(u);
}

/** 6단계: 그리기 또는 부모님 사진 고르기 */
function PictureStep({ o, draft, set }: { o: OutingView; draft: OutingReport; set: (p: Partial<OutingReport>) => void }) {
  const [mode, setMode] = useState<'draw' | 'photo'>(draft.picture?.kind === 'photo' || (!draft.picture && o.photoIds.length) ? 'photo' : 'draw');
  return (
    <div className="step-form">
      <div className="chip-row">
        <button type="button" className={'pick-chip' + (mode === 'draw' ? ' on' : '')} onClick={() => setMode('draw')}>✏️ 그리기</button>
        {o.photoIds.length > 0 && <button type="button" className={'pick-chip' + (mode === 'photo' ? ' on' : '')} onClick={() => setMode('photo')}>📷 사진 고르기</button>}
      </div>
      {mode === 'photo'
        ? <div className="photo-pick">{o.photoIds.map(id => (
            <button key={id} type="button" className={'photo-choice' + (draft.picture?.mediaId === id ? ' on' : '')} onClick={() => set({ picture: { kind: 'photo', mediaId: id } })}>
              <img src={mediaUrl(id)} alt="부모님이 올린 사진" />
            </button>))}</div>
        : <DrawingPad saved={draft.picture?.kind === 'drawing' ? draft.picture.mediaId : null} onSaved={id => set({ picture: { kind: 'drawing', mediaId: id } })} />}
    </div>
  );
}

const PEN_COLORS = ['#222222', '#e5484d', '#f2b705', '#2f9e6a', '#2f7fd6', '#8e4ec6', '#8a5a2b'];
/** 손가락으로 그리기 → 줄여서(가로 최대 480, JPEG) 저장 */
function DrawingPad({ saved, onSaved }: { saved: string | null; onSaved: (id: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [size, setSize] = useState(6);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  }, []);
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!, r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext('2d')!, p = point(e);
    ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
    setDirty(true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext('2d')!, p = point(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const clear = () => { const c = canvas.current!, ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); setDirty(false); };
  const save = async () => {
    setState('saving');
    try {
      const data = canvas.current!.toDataURL('image/jpeg', 0.75);
      const r = await postJson<{ id: string }>('/api/media', { kind: 'drawing', data });
      onSaved(r.id); setDirty(false); setState('idle');
    } catch { setState('error'); }
  };
  return (
    <div className="drawing-pad">
      {saved && !dirty && <p className="muted">저장한 그림이 있어. 새로 그리면 바뀌어.</p>}
      <canvas ref={canvas} width={480} height={360} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
      <div className="pad-tools">
        {PEN_COLORS.map(c => <button key={c} type="button" className={'pen' + (c === color ? ' on' : '')} style={{ background: c }} onClick={() => setColor(c)} aria-label="색" />)}
        <button type="button" className={'pick-chip' + (size === 6 ? ' on' : '')} onClick={() => setSize(6)}>가늘게</button>
        <button type="button" className={'pick-chip' + (size === 14 ? ' on' : '')} onClick={() => setSize(14)}>굵게</button>
        <button type="button" className="pick-chip" onClick={clear}>다 지우기</button>
      </div>
      <button type="button" className="primary" disabled={!dirty || state === 'saving'} onClick={() => void save()}>{state === 'saving' ? '저장하는 중…' : saved && !dirty ? '그림 저장됨 ✓' : '이 그림으로 할래!'}</button>
      {state === 'error' && <p className="writer-hint">그림을 저장하지 못했어. 다시 눌러 줘.</p>}
    </div>
  );
}

// ---------- 보상: 마스터볼 3개 중 1개 ----------
export function OutingReward({ o, view, busy, onPick, onClose }: {
  o: OutingView | null; view: ChildView; busy: boolean;
  onPick: (pick: number) => Promise<{ balls: { species: number; shiny: boolean }[]; picked: number; message: string } | null>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{ balls: { species: number; shiny: boolean }[]; picked: number; message: string } | null>(null);
  if (!o) return null;
  const nameOf = (b: { species: number; shiny: boolean }) => (b.shiny ? shinyName(b.species) : species(b.species).name);
  return (
    <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}>
      <DialogContent className="reward-dialog outing-reward">
        <DialogTitle className="intro-title">{result ? '🎉 전설의 포켓몬!' : '💌 부모님이 칭찬해 주셨어!'}</DialogTitle>
        <DialogDescription className="sr-only">마스터볼 고르기</DialogDescription>
        {!result && o.approval && (
          <div className="praise">
            <img src={ASSETS.sticker(o.approval.sticker)} alt="" />
            <p>{fromLabel2(o.approval.by)}: &ldquo;{o.approval.praise}&rdquo;</p>
          </div>
        )}
        {!result && <p className="intro-text">마스터볼 3개 중 <b>하나</b>를 골라 봐!</p>}
        <div className="mb-choices">
          {[0, 1, 2].map(i => {
            const b = result?.balls[i];
            return (
              <button key={i} type="button" className={'mb-choice' + (result ? (i === result.picked ? ' picked' : ' other') : '')} disabled={busy || !!result}
                onClick={async () => { const r = await onPick(i); if (r) setResult(r); }}>
                {b ? <>{i === result!.picked && b.shiny && <ShinyBurst />}<PokemonImage id={b.species} shiny={b.shiny} /><b>{nameOf(b)}</b>{i !== result!.picked && <small>여기엔 이 친구가 있었어</small>}</>
                  : <img src={ASSETS.ball.master} alt="마스터볼" />}
              </button>
            );
          })}
        </div>
        {result && <p className="intro-text">{result.message}</p>}
        {result && <PartnerTalk view={view}>{waGwa(partnerName(view))} 같이 끝까지 쓴 덕분이야! 보고서 모음에도 들어갔어.</PartnerTalk>}
        <button className="primary big-button" disabled={busy} onClick={onClose}>{result ? '최고야!' : '나중에 고를래'}</button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- 앱을 열 때 한 번: 이어 쓰기 / 기한 넘김 안내 ----------
export function OutingNudge({ o, view, kind, onGo, onClose }: { o: OutingView | null; view: ChildView; kind: 'continue' | 'late'; onGo: () => void; onClose: () => void }) {
  if (!o) return null;
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="reward-dialog rainbow-intro">
        <DialogTitle className="intro-title">🧺 {o.place} 체험보고서</DialogTitle>
        <DialogDescription className="sr-only">보고서 안내</DialogDescription>
        {kind === 'continue' ? <>
          <PartnerTalk view={view}>보고서 이어 쓸까?<br />{o.status === 'revise' ? '부모님이 고쳐 볼 곳을 알려 주셨어!' : `지금 ${o.stage}단계까지 했어. 마감까지 ${o.daysLeft ?? 0}일!`}</PartnerTalk>
          <div className="intro-buttons">
            <button className="primary big-button" onClick={onGo}>응, 쓸래! ✏️</button>
            <button className="secondary big-button" onClick={onClose}>나중에</button>
          </div>
        </> : <>
          <PartnerTalk view={view}>
            마감이 지났어.<br />
            {o.late?.box ? <>그래도 {o.late.stage}단계까지 열심히 써서 <b>랜덤상자</b>를 받았어! 가방에 {eulReul(o.late.box)} 넣었어.<br /></> : null}
            다음엔 끝까지 해서 마스터볼 열어 보자!
          </PartnerTalk>
          <p className="muted">보고서는 마저 쓸 수 있어 (보상은 없어).</p>
          <button className="primary big-button" onClick={onClose}>좋아!</button>
        </>}
      </DialogContent>
    </Dialog>
  );
}
