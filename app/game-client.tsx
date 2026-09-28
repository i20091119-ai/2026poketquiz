"use client";
import { useCallback, useEffect, useState } from 'react';
import { Backpack, BookOpen, Compass, Gift, Settings, Sun, Swords } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getJson, goTo, openParent, PokemonImage, postJson } from '@/components/game/common';
import { BattleTab, EventTab, HomePanel, StarterPicker } from '@/components/game/home';
import { DailyTab, ExploreTab } from '@/components/game/missions';
import { PokedexTab } from '@/components/game/pokedex-tab';
import { BagTab } from '@/components/game/bag-tab';
import { QuizDialog, type AnswerResult } from '@/components/game/quiz-dialog';
import { BallDialog, RewardPicker, type CatchResult, type RewardKind, type RewardResult } from '@/components/game/rewards';
import { ASSETS } from '@/lib/assets';
import { type Subject } from '@/lib/game-config';
import type { Action, Ball, ChildView, PublicQuestion } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import { versionLabel } from '@/lib/version';

type Quiz = { mode: 'daily' | 'explore'; subject?: Subject; question: PublicQuestion };
/** 보호자 시뮬레이션 중일 때 서버가 알려 주는 날짜 정보 (아니면 null) */
type Sim = { today: string; dayOffset: number } | null;
type GameResponse = { view: ChildView; sim?: Sim };

export default function Game() {
  const [view, setView] = useState<ChildView | null>(null);
  const [sim, setSim] = useState<Sim>(null);
  const [tab, setTab] = useState('daily');
  const [tab2, setTab2] = useState('battle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [reward, setReward] = useState<{ kind: RewardKind; subject?: Subject } | null>(null);
  const [ballQueue, setBallQueue] = useState<Ball[]>([]);
  const [evolved, setEvolved] = useState<{ id: number; message: string } | null>(null);

  const refresh = useCallback((signal?: AbortSignal) =>
    getJson<GameResponse>('/api/game', signal).then(
      data => { setView(data.view); setSim(data.sim ?? null); setError(''); return data.view; },
      e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message); return null; },
    ), []);
  useEffect(() => {
    const controller = new AbortController();
    getJson<GameResponse>('/api/game', controller.signal).then(
      data => { setView(data.view); setSim(data.sim ?? null); },
      e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message); },
    );
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { controller.abort(); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  // 보호자 화면의 "하루 퀴즈 시간": 화면이 보이는 동안만 세어 1분마다(그리고 화면을 벗어날 때) 서버에 보냅니다.
  useEffect(() => {
    let lastTick = Date.now();
    const send = (useBeacon = false) => {
      if (document.visibilityState !== 'visible' && !useBeacon) { lastTick = Date.now(); return; }
      const seconds = Math.round((Date.now() - lastTick) / 1000);
      lastTick = Date.now();
      if (seconds <= 0) return;
      const body = JSON.stringify({ type: 'quizTime', seconds });
      if (useBeacon && navigator.sendBeacon) { navigator.sendBeacon('/api/game', new Blob([body], { type: 'application/json' })); return; }
      fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    };
    const timer = window.setInterval(() => send(), 60_000);
    const onVisibility = () => { if (document.visibilityState === 'hidden') send(true); else lastTick = Date.now(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', () => send(true));
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  async function act<T>(action: Action): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError('');
    try {
      const data = await postJson<GameResponse & { result: T }>('/api/game', action);
      setView(data.view);
      setSim(data.sim ?? null);
      return data.result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ---------- 일일미션 ----------
  const nextDaily = (v: ChildView | null) => v?.daily?.questions.find(q => !v.daily!.correct.includes(q.id) && !v.daily!.wrong.includes(q.id)) ?? null;
  function startDaily() {
    const q = nextDaily(view);
    if (q) setQuiz({ mode: 'daily', question: q });
  }

  // ---------- 탐험 ----------
  async function loadExplore(subject: Subject, skip?: number) {
    try {
      const data = await getJson<{ question: PublicQuestion | null }>(`/api/game/explore?subject=${encodeURIComponent(subject)}${skip ? `&skip=${skip}` : ''}`);
      if (data.question) setQuiz({ mode: 'explore', subject, question: data.question });
      else {
        setQuiz(null);
        const fresh = await refresh();
        const e = fresh?.explore.find(e => e.subject === subject);
        if (e && e.total > 0 && e.solved === e.total && !e.rewardClaimed) {
          setNotice(`${subject} 탐험을 모두 마쳤어! 선물을 골라 봐.`);
          setReward({ kind: 'explore', subject });
        } else if (e?.reviewLater) setNotice(`${subject} 오늘 탐험 끝! 틀린 문제는 다른 날 다시 나와.`);
        else setNotice(`${subject} 오늘 탐험 끝!`);
      }
    } catch (e) { setError((e as Error).message); }
  }

  function afterCorrect() {
    if (!quiz) return;
    if (quiz.mode === 'daily') {
      const q = nextDaily(view);
      if (q) setQuiz({ mode: 'daily', question: q });
      else {
        setQuiz(null);
        const d = view?.daily;
        if (d && d.boxPicks > 0 && !d.claimed) setReward({ kind: 'daily' });
        else if (d?.finished) setNotice(`오늘의 미션 끝! 맞힌 문제 ${d.correct.length}개. 틀린 문제는 다른 날 다시 나와.`);
      }
    } else void loadExplore(quiz.subject!, quiz.question.id);
  }

  const dailyProgress = () => {
    const d = view?.daily;
    if (!d || !quiz) return undefined;
    const answered = d.correct.length + d.wrong.length;
    return `${Math.min(answered + 1, d.questions.length)} / ${d.questions.length}`;
  };
  const exploreProgress = () => {
    const e = view?.explore.find(e => e.subject === quiz?.subject);
    return e ? `남은 문제 ${e.available}` : undefined;
  };

  if (!view) {
    return <main><SimBanner sim={sim} /><Header /><div className="workspace">{error ? <ErrorBar message={error} onRetry={() => void refresh()} /> : <section className="panel empty">불러오는 중…</section>}</div></main>;
  }

  return (
    <main>
      <SimBanner sim={sim} />
      <Header />
      <div className="workspace">
        {error && <ErrorBar message={error} onRetry={() => void refresh()} />}
        {notice && <div className="notice" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice('')}>×</button></div>}

        {!view.partner ? (
          <StarterPicker busy={busy} onPick={async id => { const r = await act<{ message: string }>({ type: 'starter', species: id }); if (r) setNotice(r.message); }} />
        ) : <>
          <HomePanel view={view} busy={busy} onChoosePartner={async uid => { const r = await act<{ message: string }>({ type: 'partner', uid }); if (r) setNotice(r.message); }}
            onExpGift={() => setReward({ kind: 'exp' })}
            onExchange={async statType => { const r = await act<{ message: string }>({ type: 'exchangeExp', statType }); if (r) setNotice(r.message); return !!r; }} />
          <Tabs value={tab} onValueChange={v => { if (!busy) setTab(v); }}>
            <TabsList className="nav">
              <TabsTrigger value="daily"><Sun />일일미션</TabsTrigger>
              <TabsTrigger value="explore"><Compass />탐험</TabsTrigger>
              <TabsTrigger value="pokedex"><BookOpen />포켓몬 도감</TabsTrigger>
              <TabsTrigger value="bag"><Backpack />가방{view.balls.length + view.potions.length > 0 && <span className="tab-count">{view.balls.length + view.potions.length}</span>}</TabsTrigger>
            </TabsList>
            <TabsContent value="daily">
              <DailyTab view={view} busy={busy} onStart={startDaily} onOpenBox={() => setReward({ kind: 'daily' })} />
            </TabsContent>
            <TabsContent value="explore">
              <ExploreTab view={view} busy={busy}
                onExplore={s => void loadExplore(s)}
                onSubjectReward={s => setReward({ kind: 'explore', subject: s })}
                onMasterReward={() => setReward({ kind: 'master' })} />
            </TabsContent>
            <TabsContent value="pokedex">
              <PokedexTab view={view} busy={busy}
                onPartner={async uid => { const r = await act<{ message: string }>({ type: 'partner', uid }); if (r) setNotice(r.message); }}
                onEvolve={async (uid, target) => { const r = await act<{ evolved: number; message: string }>({ type: 'evolve', uid, target }); if (r) setEvolved({ id: r.evolved, message: r.message }); }}/>
            </TabsContent>
            <TabsContent value="bag">
              <BagTab view={view} busy={busy}
                onOpenBall={b => setBallQueue([b])}
                onUsePotion={async (potionId, uid) => { const r = await act<{ message: string }>({ type: 'usePotion', potionId, uid }); if (r) setNotice(r.message); return !!r; }} />
            </TabsContent>
          </Tabs>

          {/* 두 번째 탭 묶음: 위 탭을 무엇으로 골랐든 항상 아래에 보입니다. 처음엔 배틀 탭. */}
          <Tabs className="tabs-secondary" value={tab2} onValueChange={setTab2}>
            <TabsList className="nav">
              <TabsTrigger value="battle"><Swords />배틀</TabsTrigger>
              <TabsTrigger value="event"><Gift />이벤트</TabsTrigger>
            </TabsList>
            <TabsContent value="battle"><BattleTab left={view.battle.left} perDay={view.battle.perDay} /></TabsContent>
            <TabsContent value="event"><EventTab /></TabsContent>
          </Tabs>
        </>}

        <footer>
          <span>포켓몬 배움 탐험대</span>
          <a href="/parent" target="_blank" rel="noreferrer" onClick={openParent('/parent')}><Settings size={14} /> 보호자 공간 ↗</a>
          <a href="https://pokemonkorea.co.kr/pokedex" target="_blank" rel="noreferrer">포켓몬 공식 도감 ↗</a>
          <span className="version">버전 {versionLabel(__BUILD_DATE__)}</span>
        </footer>
      </div>

      <QuizDialog
        question={quiz?.question ?? null}
        progress={quiz?.mode === 'daily' ? dailyProgress() : exploreProgress()}
        busy={busy}
        nextLabel={quiz?.mode === 'daily' && view.daily?.finished ? (view.daily.boxPicks > 0 ? '랜덤상자 받으러 가기' : '미션 끝!') : '다음 문제'}
        chances={quiz?.mode === 'daily' ? (view.daily?.attempts ?? 1) - (view.daily?.tries[quiz.question.id] ?? 0) : 1}
        maxChances={quiz?.mode === 'daily' ? view.daily?.attempts ?? 1 : 1}
        onAnswer={choice => act<AnswerResult>({ type: 'answer', mode: quiz!.mode, questionId: quiz!.question.id, choice })}
        onNext={afterCorrect}
        onClose={() => setQuiz(null)}
      />

      <RewardPicker
        key={reward ? reward.kind + (reward.subject ?? '') : 'none'}
        kind={reward?.kind ?? null}
        subject={reward?.subject}
        picks={reward?.kind === 'daily' ? view.daily?.boxPicks ?? 1 : 1}
        initial={reward?.kind === 'daily' ? view.daily?.box : null}
        busy={busy}
        onPick={pick => {
          if (!reward) return Promise.resolve(null);
          if (reward.kind === 'daily') return act<RewardResult>({ type: 'dailyBox', pick });
          if (reward.kind === 'explore') return act<RewardResult>({ type: 'exploreReward', subject: reward.subject!, pick });
          if (reward.kind === 'exp') return act<RewardResult>({ type: 'expGift', pick });
          return act<RewardResult>({ type: 'masterReward', pick });
        }}
        onClose={() => setReward(null)}
        onOpenBalls={ids => { setReward(null); setBallQueue(ids.map(id => view.balls.find(b => b.id === id)).filter((b): b is Ball => !!b)); }}
      />

      <BallDialog
        key={ballQueue[0]?.id ?? 'none'}
        ball={ballQueue[0] ?? null}
        busy={busy}
        onOpen={b => act<CatchResult>({ type: 'openBall', ballId: b.id })}
        onClose={() => setBallQueue(q => q.slice(1))}
      />

      <Dialog open={!!evolved} onOpenChange={open => { if (!open) setEvolved(null); }}>
        <DialogContent className="reward-dialog">
          <DialogTitle>우와, 진화했어!</DialogTitle>
          <DialogDescription>{evolved?.message}</DialogDescription>
          {evolved && <PokemonImage id={evolved.id} className="celebration-img" />}
          {evolved && <h3 className="caught-name">{species(evolved.id).name}</h3>}
          <button className="primary" onClick={() => setEvolved(null)}>최고야!</button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

/** 보호자 시뮬레이션 중임을 알리는 띠. 누르면 보호자 공간으로 돌아갑니다. */
function SimBanner({ sim }: { sim: Sim }) {
  if (!sim) return null;
  return (
    <a className="sim-banner" href="/parent" onClick={goTo('/parent')}>
      🧪 시뮬레이션 중 · 시험용 기록 · 게임 날짜 {sim.today}{sim.dayOffset > 0 ? ` (오늘 +${sim.dayOffset}일)` : ''} · 눌러서 보호자 공간으로
    </a>
  );
}

function Header() {
  return (
    <header className="topbar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <a className="brand" href="/" onClick={goTo('/')}><img src={ASSETS.logo} alt="" /><span>포켓몬 <b>배움 탐험대</b></span></a>
    </header>
  );
}

function ErrorBar({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="error" role="alert">{message}<button onClick={onRetry}>다시 불러오기</button></div>;
}
