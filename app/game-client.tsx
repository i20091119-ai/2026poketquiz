"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Backpack, BookOpen, Compass, Gift, PartyPopper, Settings, Sun, Swords } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getJson, goTo, openParent, PokemonImage, postJson } from '@/components/game/common';
import { BattleTab, EventTab, HomePanel, StarterPicker, type BattleGateView } from '@/components/game/home';
import { GiftOpenDialog, GiftPopup, GiftTab, ReplyDialog, type GiftOpenResult } from '@/components/game/gifts';
import { DailyTab, ExploreTab } from '@/components/game/missions';
import { PokedexTab } from '@/components/game/pokedex-tab';
import { BagTab } from '@/components/game/bag-tab';
import { QuizDialog, type AnswerResult } from '@/components/game/quiz-dialog';
import { BallDialog, RewardPicker, type CatchResult, type RewardKind, type RewardResult } from '@/components/game/rewards';
import { ASSETS } from '@/lib/assets';
import { type Subject } from '@/lib/game-config';
import type { Action, Ball, ChildView, PublicGift, PublicQuestion } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import { versionLabel } from '@/lib/version';

type Quiz = { mode: 'daily' | 'explore'; subject?: Subject; question: PublicQuestion };
/** 보호자 시뮬레이션 중일 때 서버가 알려 주는 날짜 정보 (아니면 null) */
type Sim = { today: string; dayOffset: number; clock?: string | null } | null;
type GameResponse = { view: ChildView; sim?: Sim; battleGate?: BattleGateView };
/** 화면이 열려 있을 때 새 선물·쉬는 시간을 알아채는 간격 */
const POLL_MS = 60_000;

export default function Game() {
  const [view, setView] = useState<ChildView | null>(null);
  const [sim, setSim] = useState<Sim>(null);
  const [gate, setGate] = useState<BattleGateView | null>(null);
  const [tab, setTab] = useState('daily');
  const [tab2, setTab2] = useState('battle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [reward, setReward] = useState<{ kind: RewardKind; subject?: Subject } | null>(null);
  const [ballQueue, setBallQueue] = useState<Ball[]>([]);
  const [evolved, setEvolved] = useState<{ id: number; message: string } | null>(null);
  // 보호자 선물: 팝업 → 열기 → (볼 열기) → 답장
  const [giftPopup, setGiftPopup] = useState<PublicGift | null>(null);
  const [opening, setOpening] = useState<PublicGift | null>(null);
  const [replying, setReplying] = useState<PublicGift | null>(null);
  const replyAfterBalls = useRef<PublicGift | null>(null);
  /** 이번에 이미 팝업으로 보여 준 선물 (닫으면 다시 뜨지 않고, 앱을 다시 열면 다시 알려 줌) */
  const shownGifts = useRef(new Set<string>());

  const apply = useCallback((data: GameResponse) => { setView(data.view); setSim(data.sim ?? null); setGate(data.battleGate ?? null); }, []);
  const refresh = useCallback((signal?: AbortSignal) =>
    getJson<GameResponse>('/api/game', signal).then(
      data => { apply(data); setError(''); return data.view; },
      e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message); return null; },
    ), [apply]);
  useEffect(() => {
    const controller = new AbortController();
    getJson<GameResponse>('/api/game', controller.signal).then(
      data => apply(data),
      e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message); },
    );
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    // 열려 있는 동안에도 새 선물·쉬는 시간을 알아채도록 1분마다 다시 읽습니다 (화면이 보일 때만)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
    return () => { controller.abort(); window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [refresh, apply]);

  // 안 받은 선물이 있으면 팝업으로 알려 줍니다 (한 번에 하나, 다른 창이 열려 있지 않을 때)
  useEffect(() => {
    if (!view?.partner || giftPopup || opening || replying || quiz || reward || ballQueue.length) return;
    const next = view.gifts.find(g => !g.opened && !shownGifts.current.has(g.id));
    if (next) { shownGifts.current.add(next.id); setGiftPopup(next); }
  }, [view, giftPopup, opening, replying, quiz, reward, ballQueue.length]);

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
      apply(data);
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
  const unopenedGifts = view.gifts.filter(g => !g.opened).length;
  /** 볼을 다 연 뒤 답장 창으로 이어 갑니다 */
  const closeBall = () => setBallQueue(q => {
    const rest = q.slice(1);
    if (rest.length === 0 && replyAfterBalls.current) { const g = replyAfterBalls.current; replyAfterBalls.current = null; setTimeout(() => setReplying(g), 0); }
    return rest;
  });

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
              <TabsTrigger value="event"><PartyPopper />이벤트</TabsTrigger>
              <TabsTrigger value="gift"><Gift />선물{unopenedGifts > 0 && <span className="tab-count">{unopenedGifts}</span>}</TabsTrigger>
            </TabsList>
            <TabsContent value="battle"><BattleTab left={view.battle.left} perDay={view.battle.perDay} tickets={view.battle.tickets} gate={gate} /></TabsContent>
            <TabsContent value="event"><EventTab /></TabsContent>
            <TabsContent value="gift"><GiftTab gifts={view.gifts} busy={busy} onOpen={g => setOpening(g)} onReply={g => setReplying(g)} /></TabsContent>
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
        onClose={closeBall}
      />

      <GiftPopup gift={giftPopup} onLater={() => setGiftPopup(null)} onOpen={g => { setGiftPopup(null); setOpening(g); }} />
      {opening && (
        <GiftOpenDialog
          key={opening.id}
          gift={opening}
          busy={busy}
          onChoose={(g, choice, subject) => act<GiftOpenResult>({ type: 'openGift', id: g.id, choice, subject })}
          onClose={() => setOpening(null)}
          onOpenBalls={ids => {
            const g = view.gifts.find(x => x.id === opening.id) ?? opening;
            setOpening(null);
            replyAfterBalls.current = g.reply ? null : g;
            setBallQueue(ids.map(id => view.balls.find(b => b.id === id)).filter((b): b is Ball => !!b));
          }}
          onReply={g => { setOpening(null); setReplying(g); }}
        />
      )}
      {replying && (
        <ReplyDialog
          key={replying.id}
          gift={replying}
          busy={busy}
          onLater={() => setReplying(null)}
          onSend={async (g, sticker, text) => {
            const r = await act<{ message: string }>({ type: 'replyGift', id: g.id, sticker, text });
            if (r) { setReplying(null); setNotice(r.message); }
            return !!r;
          }}
        />
      )}

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
      🧪 시뮬레이션 중 · 시험용 기록 · 게임 날짜 {sim.today}{sim.dayOffset > 0 ? ` (오늘 +${sim.dayOffset}일)` : ''}{sim.clock ? ` · 시각 ${sim.clock}` : ''} · 눌러서 보호자 공간으로
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
