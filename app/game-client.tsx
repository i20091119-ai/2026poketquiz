"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Backpack, BookOpen, Compass, Gift, PartyPopper, Settings, Sun, Swords } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getJson, goTo, openParent, PokemonImage, postJson } from '@/components/game/common';
import { BattleTab, HomePanel, StarterPicker, type BattleGateView } from '@/components/game/home';
import { AllClearDialog, EventTab } from '@/components/game/events';
import { RainbowIntro, RainbowNotice, ShinyChangeDialog } from '@/components/game/rainbow';
import { writeRevivedSession } from '@/lib/battle-save';
import { GiftOpenDialog, GiftPopup, GiftTab, ReplyDialog, type GiftOpenResult } from '@/components/game/gifts';
import { DailyTab, ExploreTab } from '@/components/game/missions';
import { PokedexTab } from '@/components/game/pokedex-tab';
import { BagTab } from '@/components/game/bag-tab';
import { QuizDialog, type AnswerResult } from '@/components/game/quiz-dialog';
import { BallDialog, RewardPicker, type CatchResult, type RewardKind, type RewardResult } from '@/components/game/rewards';
import { ASSETS } from '@/lib/assets';
import { setGrowthRules, type GrowthRules, type Subject } from '@/lib/game-config';
import { AdventureIntro, adventureIntroSeen, markAdventureIntroSeen } from '@/components/game/adventure';
import { OutingCard, OutingGallery, OutingIntro, OutingNudge, OutingReward, OutingWriter } from '@/components/game/outing';
import type { Action, Ball, ChildView, PublicGift, PublicQuestion } from '@/lib/game-engine';
import { species } from '@/lib/pokedex';
import { versionLabel } from '@/lib/version';
import { setStrongOverrides, type StrongOverrides } from '@/lib/pokedex';

type Quiz = { mode: 'daily' | 'explore'; subject?: Subject; question: PublicQuestion };
/** 보호자 시뮬레이션 중일 때 서버가 알려 주는 날짜 정보 (아니면 null) */
type Sim = { today: string; dayOffset: number; clock?: string | null } | null;
type GameResponse = { view: ChildView; strong?: StrongOverrides; growth?: Partial<GrowthRules>; sim?: Sim; battleGate?: BattleGateView };
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
  /** 레인보우: 이로치로 바꿀 포켓몬 고르기 창 (이벤트 id), 이번에 자동으로 띄운 적 있는지, 방금 무지개를 완성했는지 */
  const [change, setChange] = useState<{ id: string; gold: boolean } | null>(null);
  const changeId = change?.id ?? null;
  const autoChangeShown = useRef(new Set<string>());
  const rainbowJustDone = useRef(false);
  /** 모험 팀 업데이트 안내 (기기마다 한 번): null = 아직 기기 기억을 안 읽음 */
  // 기기 브라우저에 기억한 값 (화면을 처음 그릴 때는 "봤음"으로 두고, 브라우저에서 실제 값을 읽음)
  const introStored = useSyncExternalStore(subscribeStorage, adventureIntroSeen, () => true);
  const [introDone, setIntroDone] = useState(false);
  const introSeen = introStored || introDone;
  const [introOpen, setIntroOpen] = useState(false);
  /** 나들이 체험보고서: 쓰는 창, 마스터볼 창, 보고서 모음, 이번 실행에 이미 보여 준 안내 */
  const [writingId, setWritingId] = useState<string | null>(null);
  const [rewardId, setRewardId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [nudgeDone, setNudgeDone] = useState(false);
  const autoReward = useRef(new Set<string>());

  const apply = useCallback((data: GameResponse) => { setStrongOverrides(data.strong); setGrowthRules(data.growth); setView(data.view); setSim(data.sim ?? null); setGate(data.battleGate ?? null); }, []);
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
    if (!view?.partner || giftPopup || opening || replying || quiz || reward || ballQueue.length || changeId || introOpen || introSeen === false || writingId || rewardId) return;
    if (view.outings.some(o => (o.status === 'open' && !o.seenDevices.includes(deviceId())) || (o.status === 'late' && !o.late?.seen))) return;
    if (view.limited.some(e => (e.phase === 'active' && !e.accepted && !e.seenDevices.includes(deviceId())) || (e.phase === 'active' && e.gold && !e.gold.introSeen) || (e.remind && !e.remindSeen) || (e.phase === 'ended' && e.accepted && !e.endSeen))) return;
    const next = view.gifts.find(g => !g.opened && !shownGifts.current.has(g.id));
    if (next) { shownGifts.current.add(next.id); setGiftPopup(next); }
  }, [view, giftPopup, opening, replying, quiz, reward, ballQueue.length, changeId, introOpen, introSeen, writingId, rewardId]);

  // 레인보우를 다 모았는데 아직 포켓몬을 안 골랐으면 (앱을 열 때 한 번) 고르기 창을 띄움
  useEffect(() => {
    if (!view?.partner || quiz || reward || ballQueue.length || giftPopup || opening || replying || changeId) return;
    const ev = view.limited.find(e => e.canChange && !autoChangeShown.current.has(e.id));
    if (ev) { autoChangeShown.current.add(ev.id); setChange({ id: ev.id, gold: false }); return; }
    // 황금 조각 완성도 같은 방식으로 (한 번)
    const g = view.limited.find(e => e.gold?.canChange && !autoChangeShown.current.has(e.id + ':gold'));
    if (g) { autoChangeShown.current.add(g.id + ':gold'); setChange({ id: g.id, gold: true }); }
  }, [view, quiz, reward, ballQueue.length, giftPopup, opening, replying, changeId]);

  // 부모님이 승인한 보고서가 있으면 (이번 실행에 한 번) 칭찬·마스터볼 창을 띄움
  useEffect(() => {
    if (!view?.partner || quiz || reward || ballQueue.length || giftPopup || opening || replying || changeId || writingId || rewardId) return;
    const o = view.outings.find(o => o.status === 'approved' && !autoReward.current.has(o.id));
    if (o) { autoReward.current.add(o.id); setRewardId(o.id); }
  }, [view, quiz, reward, ballQueue.length, giftPopup, opening, replying, changeId, writingId, rewardId]);

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
    } else if (rainbowJustDone.current) {
      // 무지개 완성! 탐험을 멈추고 이로치로 바꿀 포켓몬 고르기 창으로
      rainbowJustDone.current = false;
      setQuiz(null);
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
  // 이벤트 탭 빨간 숫자: 아직 수락 안 한 도전 + 열 수 있는 상자
  const ev = view.events;
  const eventAlerts = (!ev.allClear.hidden && !ev.allClear.accepted ? 1 : 0) + (!ev.streak.hidden && !ev.streak.accepted ? 1 : 0)
    + (ev.streak.completedAt && !ev.streak.hidden ? 1 : 0)
    + view.limited.filter(e => (e.phase === 'active' && !e.accepted) || e.canChange || e.gold?.canChange).length
    + view.outings.filter(o => o.status === 'open' || o.status === 'revise' || o.status === 'approved').length;
  // 레인보우 팝업: 처음 열면 3장 소개 → 끝났을 때 결과 → 마지막 날 저녁 안내 (다른 창이 없을 때 하나씩)
  const calm = !quiz && !reward && !ballQueue.length && !giftPopup && !opening && !replying && !changeId;
  // 소개 팝업은 기기마다 한 번: 다른 기기(보호자 폰)에서 봤어도 이 기기에서 처음이면 뜸. 도전을 시작했으면 안 뜸
  const introEv = calm ? view.limited.find(e => e.phase === 'active' && !e.accepted && !e.seenDevices.includes(deviceId())) ?? null : null;
  const endEv = calm && !introEv ? view.limited.find(e => e.phase === 'ended' && e.accepted && !e.endSeen) ?? null : null;
  // 히든 스테이지 "황금 조각"이 열리면 (이미 열린 상태로 처음 열어도) 한 번 알려 줌
  const goldEv = calm && !introEv && !endEv ? view.limited.find(e => e.phase === 'active' && e.gold && !e.gold.introSeen) ?? null : null;
  const remindEv = calm && !introEv && !endEv && !goldEv ? view.limited.find(e => e.remind && !e.remindSeen) ?? null : null;
  const changeEv = changeId ? view.limited.find(e => e.id === changeId) ?? null : null;
  // 모험 팀 업데이트 안내: 이 기기에서 처음이면 (다른 안내 팝업이 다 끝난 뒤) 한 번
  const showIntro = introOpen || (calm && introSeen === false && !introEv && !endEv && !goldEv && !remindEv && !(view.events.allClear.completedAt && !view.events.allClear.celebrated));
  const closeIntro = () => { markAdventureIntroSeen(); setIntroDone(true); setIntroOpen(false); };
  // 나들이 체험보고서 안내 (다른 팝업이 없을 때 하나씩): 소개(기기마다 한 번) → 기한 넘김 안내 → 칭찬·마스터볼(이번 실행에 한 번) → 이어 쓸까?(이번 실행에 한 번)
  const outingCalm = calm && !showIntro && !introEv && !endEv && !goldEv && !remindEv && !writingId && !rewardId && !galleryOpen;
  const outingIntro = outingCalm ? view.outings.find(o => o.status === 'open' && !o.seenDevices.includes(deviceId())) ?? null : null;
  const outingLate = outingCalm && !outingIntro ? view.outings.find(o => o.status === 'late' && !o.late?.seen) ?? null : null;
  const outingNudge = outingCalm && !outingIntro && !outingLate && !nudgeDone && !nudgeSeenThisRun() ? view.outings.find(o => o.status === 'writing' || o.status === 'revise') ?? null : null;
  const writingOuting = writingId ? view.outings.find(o => o.id === writingId) ?? null : null;
  const rewardOuting = rewardId ? view.outings.find(o => o.id === rewardId) ?? null : null;
  const saveTeam = async (friends: string[]) => { const r = await act<{ message: string }>({ type: 'team', friends }); if (r) setNotice(r.message); return !!r; };
  /** 배틀 탭: 서버에 올려 둔 게임 오버 판을 부활권으로 되살려 첫 슬롯에 넣고 포켓로그로 */
  async function reviveFromHistory(runId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await postJson<{ ok: boolean; message?: string; data?: string }>('/api/battle/revive', { mode: 'history', runId });
      if (!r.ok || !r.data) { setNotice(r.message ?? '되살리지 못했어.'); return; }
      writeRevivedSession(r.data);
      goTo('/battle/')({ preventDefault() {} });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
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
            onSaveTeam={saveTeam} onIntro={() => setIntroOpen(true)}
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
                onEvolve={async (uid, target) => { const r = await act<{ evolved: number; message: string }>({ type: 'evolve', uid, target }); if (r) setEvolved({ id: r.evolved, message: r.message }); }}
                onNotice={message => { setError(''); setNotice(message); }}
                onEnergyStar={async (uid, statType) => { const r = await act<{ message: string }>({ type: 'energyStar', uid, statType }); if (r) setNotice(r.message); return !!r; }} />
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
              <TabsTrigger value="event"><PartyPopper />이벤트{eventAlerts > 0 && <span className="tab-count">{eventAlerts}</span>}</TabsTrigger>
              <TabsTrigger value="gift"><Gift />선물{unopenedGifts > 0 && <span className="tab-count">{unopenedGifts}</span>}</TabsTrigger>
            </TabsList>
            <TabsContent value="battle"><BattleTab left={view.battle.left} perDay={view.battle.perDay} tickets={view.battle.tickets} gate={gate}
              reviveTickets={view.events.reviveTickets} busy={busy} onRevive={runId => void reviveFromHistory(runId)} /></TabsContent>
            <TabsContent value="event">
              {view.outings.filter(o => o.status !== 'rewarded' && o.status !== 'lateDone').map(o => (
                <OutingCard key={o.id} o={o} view={view} busy={busy}
                  onAccept={async () => { const r = await act<{ message: string }>({ type: 'outingAccept', id: o.id }); if (r) { setNotice(r.message); setWritingId(o.id); } }}
                  onWrite={() => setWritingId(o.id)} onReward={() => setRewardId(o.id)} onGallery={() => setGalleryOpen(true)} />
              ))}
              {view.outings.some(o => o.status === 'rewarded' || o.status === 'lateDone') && (
                <button className="secondary outing-gallery-btn" onClick={() => setGalleryOpen(true)}>📒 체험보고서 모음 ({view.outings.filter(o => o.status !== 'open').length})</button>
              )}
              <EventTab events={view.events} limited={view.limited} busy={busy}
                onLimitedAccept={async id => { const r = await act<{ message: string }>({ type: 'limitedAccept', id }); if (r) setNotice(r.message); }}
                onLimitedChange={id => setChange({ id, gold: false })}
                onGoldChange={id => setChange({ id, gold: true })}
                onAccept={async id => { const r = await act<{ message: string }>({ type: 'acceptEvent', event: id }); if (r) setNotice(r.message); }}
                onExplore={s => { setTab('explore'); window.scrollTo({ top: 0, behavior: 'smooth' }); void loadExplore(s); }}
                onOpenBox={() => setReward({ kind: 'event' })} />
            </TabsContent>
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
        onAnswer={async choice => {
          const r = await act<AnswerResult>({ type: 'answer', mode: quiz!.mode, questionId: quiz!.question.id, choice });
          if (r?.rainbow?.kind === 'complete') rainbowJustDone.current = true;
          return r;
        }}
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
          if (reward.kind === 'event') return act<RewardResult>({ type: 'eventBox', pick });
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

      <AllClearDialog open={!!view.events.allClear.completedAt && !view.events.allClear.celebrated && !quiz && !reward}
        onClose={() => void act({ type: 'eventSeen', event: 'allClear' })} />

      <RainbowIntro key={introEv ? 'intro-' + introEv.id : 'intro-none'} ev={introEv} busy={busy}
        onAccept={async () => { if (!introEv) return; const r = await act<{ message: string }>({ type: 'limitedAccept', id: introEv.id }); if (r) { setNotice(r.message); setTab('explore'); } }}
        onLater={() => { if (introEv) void act({ type: 'limitedSeen', id: introEv.id, device: deviceId() }); }} />
      <RainbowNotice ev={endEv ?? goldEv ?? remindEv} kind={endEv ? 'end' : goldEv ? 'gold' : 'remind'}
        onClose={() => { const e = endEv ?? goldEv ?? remindEv; if (e) void act({ type: 'limitedNotice', id: e.id, notice: endEv ? 'end' : goldEv ? 'gold' : 'remind' }); }} />
      <ShinyChangeDialog key={change ? change.id + (change.gold ? ':gold' : '') : 'none'} ev={changeEv} gold={!!change?.gold} owned={view.owned} busy={busy}
        onChange={uid => act<{ species: number; message: string }>({ type: 'limitedShinyChange', id: changeId!, uid, stage: change?.gold ? 'gold' : 'rainbow' })}
        onClose={() => setChange(null)} />

      {view.partner && <AdventureIntro key={showIntro ? 'intro-on' : 'intro-off'} view={view} open={showIntro} busy={busy} onClose={closeIntro} onSave={saveTeam} />}

      <OutingIntro key={outingIntro ? 'oi-' + outingIntro.id : 'oi-none'} o={outingIntro} view={view} busy={busy}
        onAccept={async () => { if (!outingIntro) return; const id = outingIntro.id; const r = await act<{ message: string }>({ type: 'outingAccept', id }); if (r) { setNotice(r.message); setTab2('event'); setWritingId(id); } }}
        onLater={() => { if (outingIntro) void act({ type: 'outingSeen', id: outingIntro.id, device: deviceId() }); }} />
      <OutingNudge o={outingLate ?? outingNudge} view={view} kind={outingLate ? 'late' : 'continue'}
        onGo={() => { markNudgeSeen(); setNudgeDone(true); if (outingNudge) { setTab2('event'); setWritingId(outingNudge.id); } }}
        onClose={() => { if (outingLate) void act({ type: 'outingLateSeen', id: outingLate.id }); else { markNudgeSeen(); setNudgeDone(true); } }} />
      {writingOuting && <OutingWriter key={writingOuting.id} o={writingOuting} view={view} busy={busy} onClose={() => setWritingId(null)}
        onSave={async (step, data) => { const r = await act<{ message: string }>({ type: 'outingSave', id: writingOuting.id, step, data: data as Record<string, unknown> }); if (r) setNotice(r.message); return !!r; }}
        onSubmit={async () => { const r = await act<{ message: string }>({ type: 'outingSubmit', id: writingOuting.id }); if (r) setNotice(r.message); return !!r; }} />}
      {rewardOuting && <OutingReward key={rewardOuting.id} o={rewardOuting} view={view} busy={busy} onClose={() => setRewardId(null)}
        onPick={pick => act<{ balls: { species: number; shiny: boolean }[]; picked: number; message: string }>({ type: 'outingPick', id: rewardOuting.id, pick })} />}
      <OutingGallery open={galleryOpen} outings={view.outings} onClose={() => setGalleryOpen(false)} onWrite={id => { setGalleryOpen(false); setWritingId(id); }} />

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
            // 보내면 답장 창 안에서 "보냈어!" 화면을 보여 주고, "좋아!"를 누르면 닫힘
            const r = await act<{ message: string }>({ type: 'replyGift', id: g.id, sticker, text });
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

/** 나들이 "보고서 이어 쓸까?"는 앱을 열 때(이 탭 실행 동안) 한 번만 */
function nudgeSeenThisRun(): boolean { try { return sessionStorage.getItem('pq-outing-nudge') === '1'; } catch { return false; } }
function markNudgeSeen() { try { sessionStorage.setItem('pq-outing-nudge', '1'); } catch { /* 저장이 막혀 있으면 이번 화면 동안만 */ } }

/** 다른 탭에서 기기 저장이 바뀌면 다시 읽음 */
const subscribeStorage = (cb: () => void) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb); };

/** 이 기기의 이름표 (기기 브라우저에 한 번 만들어 둠). 기간 한정 이벤트 소개 팝업을 기기마다 한 번씩 띄우는 데만 씀 */
let memoryDeviceId = '';
function deviceId(): string {
  try {
    let id = localStorage.getItem('pq-device-id');
    if (!id) { id = (crypto.randomUUID?.() ?? `d${Date.now()}${Math.random().toString(36).slice(2)}`).slice(0, 64); localStorage.setItem('pq-device-id', id); }
    return id;
  } catch {
    // 저장을 못 하는 브라우저(사생활 보호 모드 등)는 이번 실행 동안만
    return memoryDeviceId ||= `m${Date.now()}${Math.random().toString(36).slice(2)}`;
  }
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
