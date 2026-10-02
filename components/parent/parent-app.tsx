"use client";
import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, BookPlus, Copy, Download, FlaskConical, LogOut, Pencil, Plus, Send, Sparkles, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getJson, goTo, postJson, TypeBadge } from '@/components/game/common';
import { StatBoard } from '@/components/game/home';
import { ASSETS } from '@/lib/assets';
import type { RestRule } from '@/lib/battle-rest';
import { BATTLE_PASSWORD_MIN, CHOICE_COUNT, GIFT_LETTER_MAX, GIFT_REASON_MAX, GIFT_REASONS, GIFT_SENDERS, GIFT_SIZES, GIFT_CHOICE_INFO, GRADES, REPLY_STICKERS, SUBJECT_AREAS, SUBJECTS, SUBJECT_TYPES, TYPE_INFO, type GiftLimits, type GiftSender, type GiftSize, type Subject, type TypeKey } from '@/lib/game-config';
import type { ActivityDay, AreaReport, PublicGift, Question } from '@/lib/game-engine';
import { defaultStrong, defaultThird, evolutionRequirement, isStrong, setStrongOverrides, species, SPECIES, subjectOf, thirdTypeChoices, thirdTypeOf, TOTAL_SPECIES, type StrongOverrides } from '@/lib/pokedex';
import { PokemonImage } from '@/components/game/common';
import { aiRequestText } from '@/lib/question-import';
import { UPDATES, versionLabel } from '@/lib/version';

type Keywords = Partial<Record<Subject, string>>;
type BankSummary = { id: number; title: string; grade: string; keywords: Keywords; status: 'draft' | 'published' | 'archived'; created_at: string; published_at: string | null; question_count: number };
type Overview = {
  /** 속성 변경(센 포켓몬·도전 속성)에서 바꾼 것 */
  strong: StrongOverrides;
  /** 볼별 이로치 확률(%)과 기본값, 시뮬레이션에서 100%로 열기 여부 */
  shiny: { chance: Record<string, number>; defaults: Record<string, number>; simAll: boolean; balls: { kind: string; label: string }[] };
  loggedIn: true; grade: string; aiConfigured: boolean; battlePasswordSet: boolean; banks: BankSummary[];
  battle: {
    log: { date: string; maxWave: number; seconds: number; starts: number }[]; leftToday: number; candy: { pending: number; sent: number; rule: { finished: number; perfect: number } };
    /** 하루 시간 제한(분, 0 = 없음)과 고를 수 있는 값 */
    limit: number; limitOptions: readonly number[];
    /** 판 안 진화 허용 (기본 꺼짐) */
    evolution: boolean;
    /** 배틀 추가권(보호자 큰 선물) 남은 장수 */
    tickets: number;
    /** 쉬는 시간 규칙과 지금 상태 */
    rest: { rules: RestRule[]; openToday: boolean; now: { blocked: boolean; name: string | null; until: string | null }; timeUp: boolean };
  };
  /** 도전 이벤트 */
  events: {
    allClear: { accepted: boolean; acceptedAt: string | null; mastered: Subject[]; completedAt: string | null };
    streak: { accepted: boolean; acceptedAt: string | null; count: number; best: number; completedAt: string | null; boxOpened: boolean };
    reviveTickets: number;
  };
  /** 보호자 선물 */
  gifts: { list: PublicGift[]; counts: GiftLimits; limits: GiftLimits; newReplies: number; today: string };
  /** 최근 28일 날짜별 활동 (오래된 날부터) */
  activity: ActivityDay[];
  /** 아직 안 불러온 연습 문제은행 이름 */
  preparedBanks: string[];
  /** 개발자 메뉴 시뮬레이션: 이 브라우저가 시뮬레이션 중인지, 시험용 기록의 날짜와 요약 */
  sim: {
    active: boolean; today: string; dayOffset: number;
    /** 시험용 기록의 지금 시각 'HH:MM' 과 직접 정했는지 */
    clock: string; clockFixed: boolean;
    summary: { partner: number | null; exp: number; owned: number; dailyDone: boolean; battleLeft: number; battleWave: number; battleMinutes: number };
  };
  child: { exp: number; expSpent: number; stats: Record<TypeKey, number>; owned: number; dex: number; partner: number | null };
  active: null | {
    id: number; title: string;
    subjects: { subject: Subject; total: number; solved: number; review: number }[];
    hardest: { id: number; subject: Subject; prompt: string; wrong: number; solved: boolean }[];
    areas: { subject: Subject; areas: AreaReport[] }[];
  };
};
type BankDetail = { bank: Omit<BankSummary, 'question_count'>; questions: Question[] };
type ImportResult = { imported: number; issues: { row: number; message: string }[]; message: string; bankId?: number };

const STATUS_LABEL = { draft: '검토 중', published: '아이에게 공개 중', archived: '지난 문제은행' };
const PER_SUBJECT = 100;

export default function ParentApp() {
  const [auth, setAuth] = useState<'loading' | 'login' | 'ok'>('loading');
  const [passwordConfigured, setPasswordConfigured] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [bankId, setBankId] = useState<number | null>(null);
  const [firstIssues, setFirstIssues] = useState<ImportResult['issues']>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() =>
    getJson<Overview | { loggedIn: false; passwordConfigured: boolean }>('/api/parent').then(data => {
      if (!data.loggedIn) { setPasswordConfigured(data.passwordConfigured); setAuth('login'); return; }
      setStrongOverrides(data.strong);
      setOverview(data);
      setAuth('ok');
    }, e => setError((e as Error).message)), []);
  useEffect(() => { load(); }, [load]);

  /** 부모 API 호출 공통 처리 */
  async function call<T extends { message?: string }>(body: Record<string, unknown>): Promise<T | null> {
    if (busy) return null;
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await postJson<T>('/api/parent', body);
      if (data.message) setNotice(data.message);
      return data;
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes('로그인')) setAuth('login');
      return null;
    } finally { setBusy(false); }
  }

  if (auth === 'loading') return <Shell><section className="panel empty">불러오는 중…</section>{error && <p className="error">{error}</p>}</Shell>;
  if (auth === 'login') return <Shell><Login configured={passwordConfigured} busy={busy} error={error} onLogin={async password => { if (await call({ action: 'login', password })) await load(); }} /></Shell>;
  if (!overview) return null;

  const logout = async () => { await call({ action: 'logout' }); setAuth('login'); };

  return (
    <Shell onLogout={logout}>
      {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>닫기</button></div>}
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {bankId
        ? <BankEditor bankId={bankId} initialIssues={firstIssues} grade={overview.grade} aiConfigured={overview.aiConfigured} busy={busy} call={call}
            onBack={() => { setBankId(null); void load(); }} />
        : <Dashboard overview={overview} busy={busy} error={error} call={call} onOpenBank={(id, issues = []) => { setFirstIssues(issues); setBankId(id); }} reload={load} />}
    </Shell>
  );
}

type Call = <T extends { message?: string }>(body: Record<string, unknown>) => Promise<T | null>;

function Shell({ children, onLogout }: { children: React.ReactNode; onLogout?: () => void }) {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" onClick={goTo('/')}><span>포켓몬 <b>배움 탐험대</b> · 보호자 공간</span></a>
        <span className="topbar-actions">
          <a className="text-button" href="/" onClick={goTo('/')}><ArrowLeft size={16} /> 게임으로</a>
          {onLogout && <button className="text-button" onClick={onLogout}><LogOut size={16} /> 로그아웃</button>}
        </span>
      </header>
      <div className="workspace">{children}<footer><span className="version">버전 {versionLabel(__BUILD_DATE__)}</span></footer></div>
    </main>
  );
}

function Login({ configured, busy, error, onLogin }: { configured: boolean; busy: boolean; error: string; onLogin: (pw: string) => void }) {
  const [password, setPassword] = useState('');
  return (
    <section className="panel login">
      <span className="pill">FOR PARENTS</span>
      <h2>보호자 로그인</h2>
      {!configured
        ? <p className="error">부모 비밀번호가 아직 설정되지 않았어요. Cloudflare에 <code>PARENT_PASSWORD</code> Secret을 등록해 주세요. (README 참고)</p>
        : <form onSubmit={e => { e.preventDefault(); onLogin(password); }}>
            <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <button className="primary" disabled={busy || !password}>들어가기</button>
          </form>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// ---------------- 대시보드 ----------------
/** 보호자 공간 탭: 아이 화면처럼 위 묶음(자주 보는 것)과 아래 묶음(설정·개발) */
const MAIN_TABS = [
  { key: 'report', label: '📊 학습 현황' },
  { key: 'gift', label: '🎁 선물' },
  { key: 'events', label: '🏆 이벤트 기록' },
  { key: 'battlelog', label: '⚔️ 포켓로그 기록' },
  { key: 'banks', label: '📚 문제은행' },
] as const;
const LOWER_TABS = [
  { key: 'battle', label: '⚔️ 배틀 설정' },
  { key: 'settings', label: '⚙️ 전체 설정' },
  { key: 'dev', label: '🛠️ 개발' },
  { key: 'update', label: '🆕 업데이트' },
] as const;
type MainTab = typeof MAIN_TABS[number]['key'];
type LowerTab = typeof LOWER_TABS[number]['key'];
const TAB_KEY = 'pq-parent-tab4';
function loadTabs(): { top: MainTab; low: LowerTab } {
  const fallback = { top: 'report' as MainTab, low: 'battle' as LowerTab };
  try {
    const v = JSON.parse(localStorage.getItem(TAB_KEY) ?? 'null') as { top?: string; low?: string } | null;
    return {
      top: MAIN_TABS.some(t => t.key === v?.top) ? v!.top as MainTab : fallback.top,
      low: LOWER_TABS.some(t => t.key === v?.low) ? v!.low as LowerTab : fallback.low,
    };
  } catch { return fallback; }
}

function Dashboard({ overview, busy, error, call, onOpenBank, reload }: {
  overview: Overview; busy: boolean; error: string; call: Call; onOpenBank: (id: number, issues?: ImportResult['issues']) => void; reload: () => Promise<void>;
}) {
  const [grade, setGrade] = useState(overview.grade);
  const [battlePassword, setBattlePassword] = useState('');
  const [battleLimit, setBattleLimit] = useState(overview.battle.limit);
  const [creating, setCreating] = useState(false);
  // 고른 탭은 이 기기에 기억해 두었다가 다음에 열 때 그대로 보여 줍니다
  const [tabs, setTabs] = useState(loadTabs);
  const save = (next: { top: MainTab; low: LowerTab }) => { setTabs(next); try { localStorage.setItem(TAB_KEY, JSON.stringify(next)); } catch { /* 저장 못 해도 진행 */ } };
  const go = (top: MainTab) => save({ ...tabs, top });
  const goLow = (low: LowerTab) => save({ ...tabs, low });
  const tab = tabs.top, low = tabs.low;
  const { child, active } = overview;
  const newReplies = overview.gifts.newReplies;

  return (
    <>
      {/* 맨 위: 아이 현황 한 줄 요약 (어느 탭에서든 보임) */}
      <section className="panel parent-intro compact">
        <div className="heading-row">
          <div>
            <span className="pill">{overview.sim.active ? '🧪 시뮬레이션 중 · 아래는 시험용 기록' : '아이 현황'}</span>
            <h2>{child.partner ? `${species(child.partner).name}와 모험 중` : '아직 파트너를 고르지 않았어요'}</h2>
          </div>
          <div className="parent-summary">
            <span>모은 경험치 {child.exp.toLocaleString()}{child.expSpent ? ` (스탯으로 바꾼 ${child.expSpent.toLocaleString()})` : ''}</span>
            <span>보유 포켓몬 {child.owned}마리</span>
            <span>도감 {child.dex} / {TOTAL_SPECIES}</span>
          </div>
        </div>
        {newReplies > 0 && (
          <div className="reply-badge">
            <b>💌 새 답장 {newReplies}개</b>
            <button className="secondary small" onClick={() => go('gift')}>보러 가기</button>
            <button className="text-button" disabled={busy} onClick={async () => { if (await call({ action: 'markRepliesSeen' })) await reload(); }}>확인했어요</button>
          </div>
        )}
      </section>

      {/* 위 탭 묶음 */}
      <div className="parent-tabs main" role="tablist">
        {MAIN_TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={'parent-tab' + (tab === t.key ? ' on' : '')} onClick={() => go(t.key)}>
            {t.label}{t.key === 'gift' && newReplies > 0 && <span className="tab-count">{newReplies}</span>}
          </button>
        ))}
      </div>

      {tab === 'report' && <>
        <section className="panel parent-section"><StatBoard stats={child.stats} /></section>
        <ActivitySection days={overview.activity} />
        {active ? (
          <section className="panel parent-section">
            <h2>공개 중인 문제은행: {active.title}</h2>
            <div className="progress-table">
              {active.subjects.map(s => (
                <div key={s.subject}><b>{s.subject}</b><span>{s.solved} / {s.total} 맞힘{s.review ? ` · 틀려서 다시 풀 문제 ${s.review}` : ''}</span>
                  <div className="bar"><i style={{ width: `${s.total ? (s.solved / s.total) * 100 : 0}%` }} /></div></div>
              ))}
            </div>
            <AreaBoard report={active.areas} />
          </section>
        ) : <section className="panel parent-section"><p className="muted">아직 공개 중인 문제은행이 없어요. &lsquo;문제은행&rsquo; 탭에서 만들어 공개해 주세요.</p></section>}
      </>}

      {tab === 'events' && <EventsSection events={overview.events} />}

      {tab === 'battlelog' && <>
        <section className="panel parent-section">
          <h2>포켓로그 기록</h2>
          <p>아이가 포켓로그(전투 게임)를 날짜별로 어디까지, 얼마나 했는지예요. 게임이 1분마다 알려 주는 값이라 1~2분 차이는 날 수 있어요. 오늘 새 게임 {overview.battle.leftToday}번 남음{overview.battle.tickets ? ` · 배틀 추가권 ${overview.battle.tickets}장` : ''}.</p>
          <p className="muted">🍬 일일미션 사탕: 다 풀면 {overview.battle.candy.rule.finished}개, 모두 맞히면 {overview.battle.candy.rule.perfect}개를 파트너에게 보내요. 지금까지 {overview.battle.candy.sent}개{overview.battle.candy.pending ? ` (게임이 아직 안 가져간 ${overview.battle.candy.pending}개)` : ''}. 사탕은 포켓로그 안에서 패시브 특성 해제·스타터 비용 낮추기에 써요.</p>
          {overview.battle.log.length === 0
            ? <p className="muted">아직 기록이 없어요. 아이가 포켓로그를 시작하면 여기에 쌓여요.</p>
            : <table className="battle-log">
                <thead><tr><th>날짜</th><th>최고 웨이브</th><th>플레이 시간</th><th>새 게임</th></tr></thead>
                <tbody>
                  {overview.battle.log.map(d => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{d.maxWave ? `${d.maxWave}웨이브` : '-'}</td>
                      <td>{d.seconds ? `${Math.max(1, Math.round(d.seconds / 60))}분` : '-'}</td>
                      <td>{d.starts ? `${d.starts}번` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
        </section>
      </>}

      {tab === 'banks' && <>
        <section className="panel parent-section">
          <div className="heading-row">
            <div><h2>주차별 문제은행</h2><p>공개한 문제은행 하나가 아이의 일일미션과 탐험에 쓰여요.</p></div>
            <div className="button-row">
              {overview.preparedBanks.length > 0 && <button className="secondary small" disabled={busy}
                onClick={async () => { if (await call({ action: 'importPreparedBanks' })) await reload(); }}>
                <BookPlus size={16} /> 연습 문제은행 {overview.preparedBanks.length}개 불러오기</button>}
              <button className="primary small" onClick={() => setCreating(true)}><Plus size={18} /> 구글 시트로 문제은행 추가</button>
            </div>
          </div>
          {overview.preparedBanks.length > 0 && <p className="muted">미리 만들어 둔 초1 연습 문제은행(과목당 24문제, 영역 표시 포함)을 &lsquo;검토 중&rsquo; 상태로 가져와요. 내용을 보고 고친 뒤 공개하면 돼요.</p>}
          <div className="bank-list">
            {overview.banks.map(b => (
              <button key={b.id} className={'bank-row ' + b.status} onClick={() => onOpenBank(b.id)}>
                <b>{b.title}</b>
                <span>{b.grade} · {b.question_count}문제 · {STATUS_LABEL[b.status]}</span>
                <Pencil size={16} />
              </button>
            ))}
            {!overview.banks.length && <p>아직 문제은행이 없어요.</p>}
          </div>
        </section>
      </>}

      {tab === 'gift' && <GiftSection gifts={overview.gifts} busy={busy} call={call} reload={reload} />}

      {/* 아래 탭 묶음 (항상 보임, 처음엔 배틀 설정): 아이 화면의 [배틀 | 이벤트 | 선물] 처럼 */}
      <div className="parent-lower">
      <div className="parent-tabs" role="tablist">
        {LOWER_TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={low === t.key} className={'parent-tab' + (low === t.key ? ' on' : '')} onClick={() => goLow(t.key)}>{t.label}</button>
        ))}
      </div>
      {low === 'battle' && <>
        <section className="panel parent-section">
          <RestEditor rest={overview.battle.rest} busy={busy} call={call} reload={reload} />
        </section>
        <section className="panel parent-section">
          <h2>하루 플레이 시간 제한</h2>
          <p className="muted">정해 두면 그날 포켓로그를 그 시간만큼 한 뒤에는 게임 화면에 &lsquo;오늘은 여기까지&rsquo; 안내가 뜨고 퀴즈로 돌아가요. 하던 판은 내일 이어서 할 수 있어요. 지금은 <b>{overview.battle.limit ? `${overview.battle.limit}분` : '제한 없음'}</b>.</p>
          <div className="inline-form">
            <select value={battleLimit} onChange={e => setBattleLimit(Number(e.target.value))}>
              {overview.battle.limitOptions.map(m => <option key={m} value={m}>{m ? `하루 ${m}분` : '제한 없음'}</option>)}
            </select>
            <button className="secondary" disabled={busy || battleLimit === overview.battle.limit} onClick={async () => { if (await call({ action: 'setBattleLimit', minutes: battleLimit })) await reload(); }}>저장</button>
          </div>
          <h2>배틀 중 진화 허용</h2>
          <p className="muted">꺼 두면(기본) 포켓로그 판 안에서 레벨이 올라도 진화하지 않고, 진화의 돌 같은 진화 아이템도 보상에 나오지 않아요. 포켓몬 진화는 퀴즈 스탯으로만 해요. 지금은 <b>{overview.battle.evolution ? '허용' : '막음'}</b>.</p>
          <div className="inline-form">
            <button className="secondary" disabled={busy}
              onClick={async () => { if (await call({ action: 'setBattleEvolution', allowed: !overview.battle.evolution })) await reload(); }}>
              {overview.battle.evolution ? '진화 막기' : '진화 허용하기'}
            </button>
          </div>
        </section>
        <section className="panel parent-section">
          <h2>포켓로그(전투 게임) 비밀번호</h2>
          <p>{overview.battlePasswordSet
            ? '비밀번호가 정해져 있어요. 가족 기기에서 포켓로그(/battle)를 열 때 한 번 넣으면 1년 동안 다시 묻지 않아요. 바꾸면 모든 기기에서 다시 넣어야 해요.'
            : '아직 안 정했어요. 정하기 전까지 포켓로그는 열리지 않아요. 아이가 외우기 쉬운 것으로 ' + BATTLE_PASSWORD_MIN + '자 이상 정해 주세요.'}</p>
          <div className="inline-form">
            <input type="text" value={battlePassword} onChange={e => setBattlePassword(e.target.value)} placeholder={overview.battlePasswordSet ? '새 비밀번호 (바꿀 때만)' : `비밀번호 (${BATTLE_PASSWORD_MIN}자 이상)`} />
            <button className="secondary" disabled={busy || battlePassword.trim().length < BATTLE_PASSWORD_MIN}
              onClick={async () => { if (await call({ action: 'setBattlePassword', password: battlePassword })) { setBattlePassword(''); await reload(); } }}>
              {overview.battlePasswordSet ? '바꾸기' : '정하기'}
            </button>
            {overview.battlePasswordSet && <button className="secondary danger" disabled={busy}
              onClick={async () => { if (window.confirm('포켓로그 비밀번호를 지울까요? 다시 정하기 전까지 포켓로그가 열리지 않아요.') && await call({ action: 'clearBattlePassword' })) await reload(); }}>지우기</button>}
          </div>
          <p className="muted">게임 주소: <a href="/battle/" target="_blank" rel="noreferrer">/battle/</a> · 미리 받아 두기: <a href="/battle/prepare" target="_blank" rel="noreferrer">/battle/prepare</a></p>
        </section>
      </>}

      {low === 'settings' && <>
        <section className="panel parent-section">
          <h2>기본 학년</h2>
          <p>새 문제은행을 만들 때 기본으로 쓰는 학년이에요. AI 요청문에도 들어가요.</p>
          <div className="inline-form">
            <select value={grade} onChange={e => setGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</select>
            <button className="secondary" disabled={busy || grade === overview.grade} onClick={async () => { if (await call({ action: 'setGrade', grade })) await reload(); }}>저장</button>
          </div>
        </section>
        <ShinyChanceEditor overview={overview} busy={busy} call={call} reload={reload} />
        <StrongEditor overview={overview} busy={busy} call={call} reload={reload} />
      </>}

      {low === 'update' && <DevMenu part="version" sim={overview.sim} shinyAll={overview.shiny.simAll} busy={busy} call={call} reload={reload} />}

      {low === 'dev' && <>
        <DevMenu part="sim" sim={overview.sim} shinyAll={overview.shiny.simAll} busy={busy} call={call} reload={reload} />
        <ExportSection busy={busy} call={call} />
        {/* 이 칸은 항상 개발 탭의 맨 아래에 둡니다. 새 칸을 추가할 때는 이 위에 넣어 주세요. */}
        <section className="panel parent-section danger-zone">
          <h2>아이 게임 처음부터 다시 하기</h2>
          <p>파트너, 포켓몬, 스탯, 경험치, 푼 문제 기록이 모두 지워지고 <b>파트너 고르기부터</b> 다시 시작해요. 문제은행은 그대로 남아요.</p>
          <div><button className="secondary danger" disabled={busy} onClick={async () => {
            if (!window.confirm('정말 아이 게임 기록을 모두 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) return;
            if (await call({ action: 'resetChild' })) await reload();
          }}>초기화하기</button></div>
        </section>
      </>}
      </div>

      <NewBankDialog open={creating} grade={overview.grade} busy={busy} error={error} call={call}
        onClose={() => setCreating(false)} onCreated={(id, issues) => { setCreating(false); onOpenBank(id, issues); }} />
    </>
  );
}

// ---------------- 도전 이벤트 ----------------
function EventsSection({ events }: { events: Overview['events'] }) {
  const { allClear: a, streak: st } = events;
  return (
    <section className="panel parent-section">
      <h2>도전 이벤트</h2>
      <table className="battle-log">
        <thead><tr><th>이벤트</th><th>수락</th><th>진도</th><th>완료</th></tr></thead>
        <tbody>
          <tr>
            <td>도전! 전 과목 올클리어<br /><small className="muted">보상: 부활권 1장</small></td>
            <td>{a.accepted ? a.acceptedAt : '아직'}</td>
            <td>{a.accepted ? `${a.mastered.length} / ${SUBJECTS.length}과목${a.mastered.length < SUBJECTS.length ? ` (남은 과목: ${SUBJECTS.filter(s => !a.mastered.includes(s)).join(', ')})` : ''}` : '-'}</td>
            <td>{a.completedAt ?? '-'}</td>
          </tr>
          <tr>
            <td>일일미션 10일 연속<br /><small className="muted">보상: 랜덤박스 1개</small></td>
            <td>{st.accepted ? st.acceptedAt : '아직'}</td>
            <td>{st.accepted ? `지금 ${st.count}일 연속 · 최고 ${st.best}일` : '-'}</td>
            <td>{st.completedAt ? `${st.completedAt}${st.boxOpened ? ' · 상자 엶' : ' · 상자 아직'}` : '-'}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">남은 부활권 {events.reviveTickets}장. 아이가 이벤트 탭에서 &lsquo;도전할래!&rsquo;를 눌러야 시작돼요.</p>
    </section>
  );
}

// ---------------- 보호자 선물 ----------------
const SENDER_KEY = 'pq-gift-sender';
const SIZE_KEYS = Object.keys(GIFT_SIZES) as GiftSize[];
const stickerLabel = (key: string) => REPLY_STICKERS.find(s => s.key === key)?.label ?? key;
function StickerImg({ k }: { k: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ASSETS.sticker(k)} alt="" />;
}
/** 선물 보내기 폼 + 한도 + 보낸 선물 기록(답장 포함) */
function GiftSection({ gifts, busy, call, reload }: { gifts: Overview['gifts']; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [from, setFrom] = useState<GiftSender>(() => { try { const v = localStorage.getItem(SENDER_KEY); return v === 'dad' ? 'dad' : 'mom'; } catch { return 'mom'; } });
  const [reason, setReason] = useState<string>(GIFT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [size, setSize] = useState<GiftSize>('small');
  const [letter, setLetter] = useState('');
  const [limits, setLimits] = useState<GiftLimits>(gifts.limits);
  const [showLimits, setShowLimits] = useState(false);
  const custom = reason === '__custom';
  const finalReason = (custom ? customReason : reason).trim();
  const left = (s: GiftSize) => Math.max(0, gifts.limits[s] - gifts.counts[s]);
  const pickSender = (s: GiftSender) => { setFrom(s); try { localStorage.setItem(SENDER_KEY, s); } catch { /* 저장 못 해도 진행 */ } };
  const send = async () => {
    const r = await call({ action: 'sendGift', from, reason: finalReason, size, letter });
    if (r) { setLetter(''); setCustomReason(''); await reload(); }
  };
  return (
    <section className="panel parent-section gift-section">
      <div className="heading-row">
        <div><h2>🎁 선물 보내기</h2><p className="muted">숙제·독서 등을 잘했을 때 보내요. 아이가 앱을 열면 팝업으로 알려 주고, 상자를 열 때 하나를 골라요(큰 선물에는 이로치 볼도 있어요).</p></div>
        <button className="text-button" onClick={() => setShowLimits(v => !v)}>{showLimits ? '한도 닫기' : '한도 바꾸기'}</button>
      </div>
      {showLimits && (
        <div className="gift-limits">
          {SIZE_KEYS.map(s => (
            <label key={s}>{GIFT_SIZES[s].label} {s === 'large' ? '(일주일)' : '(하루)'}
              <input type="number" min={0} max={20} value={limits[s]} onChange={e => setLimits({ ...limits, [s]: Number(e.target.value) })} />
            </label>
          ))}
          <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'setGiftLimits', ...limits })) await reload(); }}>한도 저장</button>
        </div>
      )}
      <div className="gift-form">
        <div className="gift-row"><span className="gift-label">보내는 사람</span>
          <div className="button-row">{(Object.keys(GIFT_SENDERS) as GiftSender[]).map(s => <button key={s} className={'chip' + (from === s ? ' on' : '')} onClick={() => pickSender(s)}>{GIFT_SENDERS[s]}</button>)}</div></div>
        <div className="gift-row"><span className="gift-label">이유</span>
          <div className="button-row">
            {GIFT_REASONS.map(r => <button key={r} className={'chip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{r}</button>)}
            <button className={'chip' + (custom ? ' on' : '')} onClick={() => setReason('__custom')}>직접 입력</button>
            {custom && <input className="gift-custom" value={customReason} maxLength={GIFT_REASON_MAX} placeholder="예: 동생 돌보기" onChange={e => setCustomReason(e.target.value)} />}
          </div></div>
        <div className="gift-row"><span className="gift-label">선물 크기</span>
          <div className="gift-sizes">
            {SIZE_KEYS.map(s => (
              <button key={s} className={'gift-size' + (size === s ? ' on' : '') + (left(s) ? '' : ' out')} onClick={() => setSize(s)}>
                <span className="gift-emoji">{GIFT_SIZES[s].emoji}</span>
                <b>{GIFT_SIZES[s].label}</b>
                <small>{GIFT_SIZES[s].options.map(o => GIFT_CHOICE_INFO[o].label).join(' 또는 ')}</small>
                <small className={left(s) ? 'ok' : 'none'}>{s === 'large' ? '이번 주' : '오늘'} {left(s)}개 더 보낼 수 있음</small>
              </button>
            ))}
          </div></div>
        <div className="gift-row"><span className="gift-label">한 줄 편지</span>
          <input value={letter} maxLength={GIFT_LETTER_MAX} placeholder="(선택) 예: 오늘 숙제 스스로 다 했네, 멋져!" onChange={e => setLetter(e.target.value)} /></div>
        <button className="primary small" disabled={busy || !finalReason || !left(size)} onClick={() => void send()}>
          <Send size={16} /> {GIFT_SENDERS[from]}가 {GIFT_SIZES[size].label} 보내기
        </button>
      </div>

      <h3>보낸 선물 기록</h3>
      {gifts.list.length === 0 ? <p className="muted">아직 보낸 선물이 없어요.</p> : (
        <table className="battle-log gift-log">
          <thead><tr><th>날짜</th><th>보낸 사람</th><th>이유</th><th>크기</th><th>편지</th><th>아이가 고른 것</th><th>답장</th></tr></thead>
          <tbody>
            {gifts.list.map(g => (
              <tr key={g.id} className={g.reply && !g.reply.seen ? 'new-reply' : ''}>
                <td>{g.date.slice(5)}</td><td>{g.fromLabel}</td><td>{g.reason}</td><td>{GIFT_SIZES[g.size].emoji} {GIFT_SIZES[g.size].label}</td>
                <td className="muted">{g.letter || '-'}</td>
                <td>{g.opened ? g.opened.got : <span className="muted">아직 안 열었어요</span>}</td>
                <td>{g.reply
                  ? <span className="reply-cell"><StickerImg k={g.reply.sticker} /> <b>{stickerLabel(g.reply.sticker)}</b>{g.reply.text ? <> — {g.reply.text}</> : null}{!g.reply.seen && <span className="tab-count">새</span>}</span>
                  : <span className="muted">{g.opened ? '아직 없음' : '-'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------- 포켓로그 쉬는 시간 ----------------
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
/** 요일·시작·끝·이름으로 여러 개 등록. 자정을 넘기는 시간대(22:30~07:30)도 됩니다. */
function RestEditor({ rest, busy, call, reload }: { rest: Overview['battle']['rest']; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [rules, setRules] = useState<RestRule[]>(rest.rules);
  const [dirty, setDirty] = useState(false);
  const update = (i: number, patch: Partial<RestRule>) => { setRules(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); setDirty(true); };
  const toggleDay = (i: number, d: number) => update(i, { days: rules[i].days.includes(d) ? rules[i].days.filter(x => x !== d) : [...rules[i].days, d].sort() });
  const add = () => { setRules(rs => [...rs, { id: `r${Date.now()}`, name: '쉬는 시간', days: [1, 2, 3, 4, 5], start: '13:00', end: '15:00' }]); setDirty(true); };
  const remove = (i: number) => { setRules(rs => rs.filter((_, j) => j !== i)); setDirty(true); };
  const save = async () => { if (await call({ action: 'setBattleRest', rules })) { setDirty(false); await reload(); } };
  const status = rest.now.blocked ? `지금은 '${rest.now.name}'이라 배틀이 잠겨 있어요${rest.now.until ? ` (${rest.now.until}까지)` : ''}.` : rest.openToday ? '오늘은 쉬는 시간 없이 열려 있어요.' : '지금은 배틀할 수 있는 시간이에요.';
  return (
    <div className="rest-editor standalone">
      <h2>배틀 쉬는 시간</h2>
      <p className="muted">이 시간에는 포켓로그 새 게임도 이어하기도 잠겨요(퀴즈는 그대로). 게임 중이면 10분 전에 안내하고, 시간이 되면 그 전투를 마친 뒤 저장하고 퀴즈로 돌아와요. 끝 시각이 시작보다 빠르면 다음 날 그 시각까지예요. 판단은 서버의 한국 시간 기준. <b>{status}</b></p>
      <div className="rest-list">
        {rules.map((r, i) => (
          <div className="rest-rule" key={r.id}>
            <input className="rest-name" value={r.name} maxLength={20} onChange={e => update(i, { name: e.target.value })} />
            <div className="rest-days">{DAY_LABELS.map((d, di) => <button key={d} className={'chip' + (r.days.includes(di) ? ' on' : '')} onClick={() => toggleDay(i, di)}>{d}</button>)}</div>
            <span className="rest-time"><input type="time" value={r.start} onChange={e => update(i, { start: e.target.value })} /> ~ <input type="time" value={r.end} onChange={e => update(i, { end: e.target.value })} />{r.start > r.end ? <small className="muted"> (다음 날)</small> : null}</span>
            <button className="text-button danger" onClick={() => remove(i)}><Trash2 size={16} /> 삭제</button>
          </div>
        ))}
        {rules.length === 0 && <p className="muted">쉬는 시간이 없어요. 언제든 배틀할 수 있어요.</p>}
      </div>
      <div className="button-row">
        <button className="secondary small" onClick={add}><Plus size={16} /> 쉬는 시간 추가</button>
        <button className="primary small" disabled={busy || !dirty} onClick={() => void save()}>저장</button>
        <button className={'secondary small' + (rest.openToday ? ' on' : '')} disabled={busy}
          onClick={async () => { if (await call({ action: 'restOpenToday', open: !rest.openToday })) await reload(); }}>
          {rest.openToday ? '오늘만 열어 주기 끄기' : '오늘만 열어 주기'}
        </button>
      </div>
      {rest.openToday && <p className="muted">오늘은 쉬는 시간이 적용되지 않아요. 자정이 지나면 저절로 원래대로 돌아가요.</p>}
    </div>
  );
}

// ---------------- 학습 활동 그래프 ----------------
const CHART = { quiz: '#2a78d6', battle: '#eb6834' }; // 두 색은 색약 검사를 통과한 짝 (파랑·주황)
const minutes = (sec: number) => Math.round(sec / 60);
const weekday = ['일', '월', '화', '수', '목', '금', '토'];
/** 하루 퀴즈 시간·포켓로그 시간을 막대로. 최근 7일 또는 최근 4주(주별 합계) */
function ActivitySection({ days }: { days: ActivityDay[] }) {
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [asTable, setAsTable] = useState(false);
  const rows = range === 'week'
    ? days.slice(-7).map(d => ({ label: `${Number(d.date.slice(8))}일(${weekday[new Date(d.date + 'T00:00:00').getDay()]})`, quiz: minutes(d.quizSeconds), battle: minutes(d.battleSeconds), answered: d.answered, correct: d.correct, wave: d.battleWave }))
    : Array.from({ length: 4 }, (_, i) => {
        const week = days.slice(i * 7, i * 7 + 7);
        return {
          label: `${week[0].date.slice(5).replace('-', '/')}~${week[6].date.slice(5).replace('-', '/')}`,
          quiz: minutes(week.reduce((s, d) => s + d.quizSeconds, 0)), battle: minutes(week.reduce((s, d) => s + d.battleSeconds, 0)),
          answered: week.reduce((s, d) => s + d.answered, 0), correct: week.reduce((s, d) => s + d.correct, 0), wave: Math.max(...week.map(d => d.battleWave)),
        };
      });
  const totalQuiz = rows.reduce((s, r) => s + r.quiz, 0), totalBattle = rows.reduce((s, r) => s + r.battle, 0);
  const totalAnswered = rows.reduce((s, r) => s + r.answered, 0), totalCorrect = rows.reduce((s, r) => s + r.correct, 0);
  return (
    <section className="panel parent-section activity">
      <div className="heading-row">
        <div><h2>하루에 얼마나 했나</h2><p className="muted">퀴즈 화면을 보고 있던 시간과 포켓로그 플레이 시간(분). 1분마다 기록해서 1~2분 차이는 날 수 있어요.</p></div>
        <div className="button-row">
          <button className={'chip' + (range === 'week' ? ' on' : '')} onClick={() => setRange('week')}>최근 7일</button>
          <button className={'chip' + (range === 'month' ? ' on' : '')} onClick={() => setRange('month')}>최근 4주</button>
          <button className="text-button" onClick={() => setAsTable(v => !v)}>{asTable ? '그래프로' : '표로 보기'}</button>
        </div>
      </div>
      <div className="parent-summary">
        <span><i className="dot" style={{ background: CHART.quiz }} /> 퀴즈 {totalQuiz}분</span>
        <span><i className="dot" style={{ background: CHART.battle }} /> 포켓로그 {totalBattle}분</span>
        <span>푼 문제 {totalAnswered}개{totalAnswered ? ` · 첫 시도 정답 ${Math.round((totalCorrect / totalAnswered) * 100)}%` : ''}</span>
      </div>
      {asTable
        ? <table className="battle-log">
            <thead><tr><th>{range === 'week' ? '날짜' : '주'}</th><th>퀴즈</th><th>포켓로그</th><th>푼 문제</th><th>첫 시도 정답</th><th>최고 웨이브</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.label}><td>{r.label}</td><td>{r.quiz}분</td><td>{r.battle}분</td><td>{r.answered}개</td><td>{r.correct}개</td><td>{r.wave || '-'}</td></tr>)}</tbody>
          </table>
        : <div className="chart-box">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="#e6ede3" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6c7a72' }} axisLine={{ stroke: '#dbe5d9' }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6c7a72' }} axisLine={false} tickLine={false} allowDecimals={false} unit="분" />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} formatter={(v, name) => [`${v}분`, name === 'quiz' ? '퀴즈' : '포켓로그']}
                  labelFormatter={(l, payload) => { const r = payload?.[0]?.payload as typeof rows[number] | undefined; return r ? `${l} · 푼 문제 ${r.answered}개${r.wave ? ` · ${r.wave}웨이브` : ''}` : String(l); }} />
                <Legend formatter={v => (v === 'quiz' ? '퀴즈' : '포켓로그')} iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="quiz" fill={CHART.quiz} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="battle" fill={CHART.battle} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>}
    </section>
  );
}

// ---------------- 영역별 성적 ----------------
/** 과목마다 영역별 정답률·틀린 수·약점 표시, 반복 오답 문제 */
function AreaBoard({ report }: { report: { subject: Subject; areas: AreaReport[] }[] }) {
  const weakAreas = report.flatMap(r => r.areas.filter(a => a.weak).map(a => `${r.subject} · ${a.area}`));
  const rate = (a: AreaReport) => (a.correct + a.wrong ? Math.round((a.correct / (a.correct + a.wrong)) * 100) : null);
  const level = (a: AreaReport) => a.weak ? 'weak' : rate(a) === null ? 'none' : rate(a)! >= 80 ? 'good' : 'mid';
  return (
    <div className="area-board">
      <div className="heading-row">
        <h3>영역별로 보기</h3>
        <span className="muted legend"><i className="lv good" /> 잘함(80% 이상) <i className="lv mid" /> 보통 <i className="lv weak" /> 약점(최근 5번 중 2번 이상 틀림) <i className="lv none" /> 아직 안 품</span>
      </div>
      {weakAreas.length > 0
        ? <p className="focus-note">🎯 지금 집중 중인 영역: <b>{weakAreas.join(', ')}</b> — 일일미션에 이 영역 문제가 더 자주 나와요. 최근 5번 중 4번 이상 맞히면 보통으로 돌아가요.</p>
        : <p className="muted">지금 약점으로 잡힌 영역은 없어요. (문제에 &lsquo;영역&rsquo;이 적혀 있어야 나눠 보여요. 영역이 없는 문제는 &lsquo;기타&rsquo;로 묶여요.)</p>}
      <div className="area-grid">
        {report.map(r => (
          <div className="area-subject" key={r.subject}>
            <b>{r.subject}</b>
            {r.areas.length === 0 && <span className="muted">문제 없음</span>}
            {r.areas.map(a => (
              <div className={'area-row ' + level(a)} key={a.area} title={`맞힘 ${a.correct} · 틀림 ${a.wrong} · 최근 ${a.recent.split('').map(c => c === 'o' ? 'O' : 'X').join('') || '-'}`}>
                <span className="area-name">{a.area}</span>
                <span className="area-stat">{rate(a) === null ? '-' : `${rate(a)}%`}</span>
                <span className="area-stat">{a.wrong ? `틀림 ${a.wrong}` : ''}</span>
                <span className="area-recent">{a.recent.slice(-5).split('').map((c, i) => <i key={i} className={c === 'o' ? 'o' : 'x'} />)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {report.some(r => r.areas.some(a => a.repeated.length)) && <>
        <h3>반복해서 틀리는 문제 (2번 이상)</h3>
        <ul className="hardest">
          {report.flatMap(r => r.areas.flatMap(a => a.repeated.map(q => (
            <li key={q.id}>[{r.subject} · {a.area}] {q.prompt} <span>{q.wrong}번 틀림{q.solved ? ' · 이후 맞힘' : ''}</span></li>
          ))))}
        </ul>
      </>}
    </div>
  );
}

// ---------------- 개발자 메뉴 ----------------
/** '2026-10-02' → '10월 2일' */
const dayLabel = (date: string) => { const [, m, d] = date.split('-'); return `${Number(m)}월 ${Number(d)}일`; };

/** 버전 표시와 시뮬레이션(아이 기록을 건드리지 않는 시험용 기록으로 앱 전체를 해 보기) */
function DevMenu({ part, sim, shinyAll, busy, call, reload }: { part: 'version' | 'sim'; sim: Overview['sim']; shinyAll: boolean; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const childScreen = '/';
  const start = async (source: 'copy' | 'empty') => {
    if (source === 'copy' && !window.confirm('지금 아이 기록을 시험용으로 복사해서 시뮬레이션을 시작할까요? 아이의 진짜 기록은 바뀌지 않아요.')) return;
    if (await call({ action: 'simStart', source })) goTo(childScreen)({ preventDefault() {} });
  };
  const s = sim.summary;
  const [clock, setClock] = useState(sim.clock);
  return (
    <section className="panel parent-section dev-menu">
      {part === 'version' ? <>
      <h2><FlaskConical size={20} style={{ verticalAlign: '-3px' }} /> 업데이트 내용</h2>
      <p>버전 <b>{versionLabel(__BUILD_DATE__)}</b> <span className="muted">· 저장 번호 {__APP_VERSION__}</span></p>
      <p className="muted">날짜별로 바뀐 것 (날짜를 누르면 펼쳐져요)</p>
      <div className="update-days">
        {UPDATES.map((day, i) => (
          <details key={day.date} className="update-day" open={i === 0}>
            <summary>
              <b>{dayLabel(day.date)}</b> <span className="muted">({day.items.length})</span>
              {i === 0 && <span className="update-new">최신</span>}
              {day.version && <span className="update-ver">버전 {day.version}</span>}
            </summary>
            <ul className="changes">{day.items.map(c => <li key={c}>{c}</li>)}</ul>
          </details>
        ))}
      </div>
      </> : <>
      <h2><FlaskConical size={20} style={{ verticalAlign: '-3px' }} /> 시뮬레이션</h2>
      <p>보호자가 아이처럼 앱 전체(일일미션, 탐험, 도감, 가방, 포켓로그 배틀)를 해 볼 수 있어요. <b>아이의 진짜 기록은 절대 바뀌지 않고</b>, 이 브라우저에서만 시험용 기록을 써요. 포켓로그 시도 횟수와 기록도 시험용으로 따로 세요.</p>
      {sim.active ? <>
        <div className="sim-state">
          <b>🧪 시뮬레이션 중</b> · 게임 날짜 <b>{sim.today}</b>{sim.dayOffset > 0 ? ` (오늘 +${sim.dayOffset}일)` : ' (오늘)'}<br />
          시험용 기록: {s.partner ? `파트너 ${species(s.partner).name}` : '파트너 아직 없음'} · 경험치 {s.exp.toLocaleString()} · 포켓몬 {s.owned}마리 · 오늘 일일미션 {s.dailyDone ? '끝' : '진행 중'} · 포켓로그 새 게임 {s.battleLeft}번 남음{s.battleWave ? ` · 오늘 최고 ${s.battleWave}웨이브 ${s.battleMinutes}분` : ''}
        </div>
        <div className="button-row">
          <button className="primary small" disabled={busy} onClick={goTo(childScreen)}>아이 화면으로 가기</button>
          <button className="secondary" disabled={busy} onClick={async () => { if (await call({ action: 'simNextDay' })) await reload(); }}>다음 날로 넘기기 →</button>
          <button className="secondary" disabled={busy} onClick={async () => { if (await call({ action: 'simStop' })) await reload(); }}>시뮬레이션 끝내기</button>
        </div>
        <div className="inline-form">
          <span>지금 시각(시험용): <b>{sim.clock}</b>{sim.clockFixed ? ' (직접 정함)' : ' (진짜 시각)'}</span>
          <input type="time" value={clock} onChange={e => setClock(e.target.value)} />
          <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simSetClock', clock })) await reload(); }}>이 시각으로</button>
          {sim.clockFixed && <button className="text-button" disabled={busy} onClick={async () => { if (await call({ action: 'simSetClock', clock: '' })) await reload(); }}>진짜 시각으로</button>}
        </div>
        <p className="muted">시각을 바꾸면 아이 화면 배틀 탭과 포켓로그가 그 시각 기준으로 쉬는 시간을 판단해요 (예: 23:00으로 정하면 잠자는 시간이라 잠김).</p>
        <div className="button-row">
          <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simGiveRevive' })) await reload(); }}>시험용 부활권 +1</button>
          <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simStreak', days: 9 })) await reload(); }}>연속 기록 9일로 맞추기</button>
        </div>
        <div className="button-row">
          <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simGiveBalls' })) await reload(); }}>시험용 볼 +1씩 (이로치 볼 포함)</button>
          <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'simGiveShinies' })) await reload(); }}>가진 포켓몬마다 이로치도 +1</button>
          <button className={shinyAll ? 'primary small' : 'secondary small'} disabled={busy} onClick={async () => { if (await call({ action: 'simShinyAll', on: !shinyAll })) await reload(); }}>{shinyAll ? '✨ 이로치 100% 켜짐 (누르면 끔)' : '볼 열 때 이로치 100%로 켜기'}</button>
        </div>
        <p className="muted">이로치 확인용이에요. 볼을 1개씩 넣고 ‘이로치 100%’를 켜면 볼마다 이로치가 나와요. ‘가진 포켓몬마다 이로치도 +1’을 누르면 기본 모습과 이로치를 둘 다 가진 상태가 되어, 포켓로그 팀 선택 화면에서 따로 보이고 같이 출전할 수 있는지 볼 수 있어요. (시험용 기록에만 적용돼요. 진짜 기록은 그대로예요.)</p>
        <p className="muted">도전 이벤트 확인용이에요. &lsquo;연속 기록 9일로 맞추기&rsquo; 뒤 오늘 일일미션을 다 풀면 10일 연속이 돼요(이벤트를 먼저 수락해야 해요). 끊김은 &lsquo;다음 날로 넘기기&rsquo;를 두 번 누르면 확인돼요.</p>
        <p className="muted">‘다음 날로 넘기기’를 누른 뒤 아이 화면을 새로고침하면 일일미션과 포켓로그 새 게임 횟수가 새 날 기준으로 다시 시작해요. 아이 화면 맨 위의 보라색 띠를 누르면 여기로 돌아와요.</p>
      </> : <>
        <div className="button-row">
          <button className="primary small" disabled={busy} onClick={() => void start('copy')}>시험용 기록을 지금 아이 기록으로 복사해서 시작</button>
          <button className="secondary" disabled={busy} onClick={() => void start('empty')}>빈 기록으로 시작</button>
        </div>
        <p className="muted">시작하면 아이 화면으로 이동하고, 화면 맨 위에 ‘시뮬레이션 중’ 띠가 보여요. 끝낼 때는 띠를 눌러 여기로 돌아와 ‘시뮬레이션 끝내기’를 누르면 돼요. 끝내는 걸 잊어도 7일 뒤엔 저절로 풀려요.</p>
      </>}
      </>}
    </section>
  );
}

function thisWeekTitle() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return `${monday.getMonth() + 1}월 ${monday.getDate()}일 주 문제은행`;
}

function KeywordFields({ keywords, onChange }: { keywords: Keywords; onChange: (k: Keywords) => void }) {
  return (
    <div className="scope-grid">
      {SUBJECTS.map(s => (
        <label key={s}>{s} 키워드
          <textarea rows={2} maxLength={500} value={keywords[s] ?? ''} placeholder={s === '상식' ? '예: 사계절의 날씨, 우리 동네 사람들' : ''}
            onChange={e => onChange({ ...keywords, [s]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

function NewBankDialog({ open, grade, busy, error, call, onClose, onCreated }: {
  open: boolean; grade: string; busy: boolean; error: string; call: Call; onClose: () => void;
  onCreated: (id: number, issues: ImportResult['issues']) => void;
}) {
  const [title, setTitle] = useState(thisWeekTitle);
  const [bankGrade, setBankGrade] = useState(grade);
  const [sheetUrl, setSheetUrl] = useState('');
  const [pasted, setPasted] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [keywords, setKeywords] = useState<Keywords>({});
  const [showKeywords, setShowKeywords] = useState(false);
  const withPaste = showPaste && !!pasted.trim();
  const withSheet = !withPaste && !!sheetUrl.trim();
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="edit-dialog wide">
        <DialogTitle>새 문제은행 만들기</DialogTitle>
        <DialogDescription>구글 시트 링크를 넣으면 시트의 문제를 바로 가져와요.</DialogDescription>
        <label>이름<input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
        <label>학년<select value={bankGrade} onChange={e => setBankGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</select></label>
        <label>구글 시트 링크
          <input placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
        </label>
        <p className="muted">시트 오른쪽 위 <b>공유</b> → 일반 액세스를 <b>링크가 있는 모든 사용자</b>로 바꾼 뒤 <b>링크 복사</b>해서 붙여 넣어 주세요.
          {' '}<a className="text-button" href="/templates/question-template.csv" download><Download size={14} /> 시트 양식 내려받기</a></p>
        <button type="button" className="text-button" onClick={() => setShowPaste(v => !v)}>
          {showPaste ? '▾' : '▸'} 링크가 안 되면: 시트 내용을 통째로 복사해서 붙여 넣기
        </button>
        {showPaste && <>
          <p className="muted">구글 시트에서 아무 칸이나 누르고 <b>⌘ + A</b>(전체 선택) → <b>⌘ + C</b>(복사)한 뒤, 아래 칸을 누르고 <b>⌘ + V</b>(붙여 넣기) 하세요.</p>
          <textarea rows={5} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="여기에 붙여 넣기" />
        </>}
        <button type="button" className="text-button" onClick={() => setShowKeywords(v => !v)}>
          {showKeywords ? '▾' : '▸'} 과목별 키워드 적기 (선택 · AI 요청문에 쓰여요)
        </button>
        {showKeywords && <KeywordFields keywords={keywords} onChange={setKeywords} />}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy} onClick={async () => {
          const r = await call<ImportResult>({ action: 'createBank', title, grade: bankGrade, keywords, ...(withPaste ? { csv: pasted } : withSheet ? { sheetUrl } : {}) });
          if (r?.bankId) onCreated(r.bankId, r.issues ?? []);
        }}>{busy ? '가져오는 중…' : withPaste ? '붙여 넣은 문제로 만들기' : withSheet ? '시트에서 문제 가져와서 만들기' : '빈 문제은행 만들기'}</button>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- 문제은행 편집 ----------------
function BankEditor({ bankId, initialIssues, grade, aiConfigured, busy, call, onBack }: {
  bankId: number; initialIssues: ImportResult['issues']; grade: string; aiConfigured: boolean; busy: boolean; call: Call; onBack: () => void;
}) {
  const [detail, setDetail] = useState<BankDetail | null>(null);
  const [title, setTitle] = useState('');
  const [bankGrade, setBankGrade] = useState(grade);
  const [keywords, setKeywords] = useState<Keywords>({});
  const [sheetUrl, setSheetUrl] = useState('');
  const [csv, setCsv] = useState('');
  const [issues, setIssues] = useState<ImportResult['issues']>(initialIssues);
  const [editing, setEditing] = useState<Question | null>(null);
  const [filter, setFilter] = useState<Subject | '전체'>('전체');
  const [generating, setGenerating] = useState<string>('');

  const load = useCallback(() =>
    getJson<BankDetail>(`/api/parent?bank=${bankId}`).then(data => {
      setDetail(data);
      setTitle(data.bank.title);
      setBankGrade(data.bank.grade);
      setKeywords(data.bank.keywords);
    }, e => window.alert((e as Error).message)), [bankId]);
  useEffect(() => { load(); }, [load]);

  if (!detail) return <section className="panel empty">불러오는 중…</section>;
  const { bank, questions } = detail;
  const counts = Object.fromEntries(SUBJECTS.map(s => [s, questions.filter(q => q.subject === s).length])) as Record<Subject, number>;
  const shown = filter === '전체' ? questions : questions.filter(q => q.subject === filter);

  async function importSheet(body: Record<string, unknown>) {
    const r = await call<ImportResult>({ action: 'importQuestions', bankId, ...body });
    if (r) { setIssues(r.issues); setSheetUrl(''); setCsv(''); await load(); }
  }
  async function generateAll() {
    for (const s of SUBJECTS.filter(s => keywords[s]?.trim())) {
      setGenerating(`${s} 문제를 만드는 중…`);
      const r = await call({ action: 'generate', bankId, subject: s, count: PER_SUBJECT });
      if (!r) break;
    }
    setGenerating('');
    await load();
  }
  async function copyPrompt() {
    const text = aiRequestText(bankGrade, keywords, PER_SUBJECT);
    try { await navigator.clipboard.writeText(text); window.alert('AI 요청문을 복사했어요. AI 대화창에 붙여 넣은 뒤, 결과를 구글 시트에 옮겨 주세요.'); }
    catch { window.prompt('아래 내용을 복사해 주세요.', text); }
  }

  return (
    <>
      <button className="text-button" onClick={onBack}><ArrowLeft size={16} /> 문제은행 목록</button>
      <section className="panel parent-section">
        <div className="heading-row">
          <div><span className={'status-tag ' + bank.status}>{STATUS_LABEL[bank.status]}</span><h2>{bank.title}</h2></div>
          <div className="button-row">
            {bank.status !== 'published' && <button className="primary small" disabled={busy || !questions.length}
              onClick={async () => { if (window.confirm('이 문제은행을 아이에게 공개할까요? 지금 공개 중인 문제은행은 지난 문제은행이 돼요.') && await call({ action: 'publish', bankId })) await load(); }}>
              <Send size={16} /> 아이에게 공개</button>}
            {bank.status !== 'published' && <button className="secondary small danger" disabled={busy}
              onClick={async () => { if (window.confirm('문제은행과 문제를 모두 지울까요?') && await call({ action: 'deleteBank', bankId })) onBack(); }}>
              <Trash2 size={16} /> 삭제</button>}
          </div>
        </div>
        <div className="parent-summary">{SUBJECTS.map(s => <span key={s}>{s} {counts[s]}문제</span>)}<span>합계 {questions.length}문제</span></div>
      </section>

      <section className="panel parent-section">
        <h2>기본 정보와 키워드</h2>
        <label>이름<input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} /></label>
        <label>학년<select value={bankGrade} onChange={e => setBankGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</select></label>
        <KeywordFields keywords={keywords} onChange={setKeywords} />
        <button className="secondary" disabled={busy} onClick={async () => { if (await call({ action: 'updateBank', bankId, title, grade: bankGrade, keywords })) await load(); }}>저장</button>
      </section>

      <section className="panel parent-section">
        <h2>문제 채우기</h2>
        <div className="source-grid">
          <div className="source-card">
            <h3><Upload size={18} /> 구글 시트 링크</h3>
            <p>시트 공유를 <b>링크가 있는 모든 사용자(뷰어)</b>로 바꾼 뒤 링크를 붙여 넣어 주세요. 여러 탭이 있으면 해당 탭을 연 상태의 링크를 쓰면 돼요.</p>
            <input placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} />
            <button className="primary small" disabled={busy || !sheetUrl.trim()} onClick={() => void importSheet({ sheetUrl })}>시트에서 가져오기</button>
            <details>
              <summary>링크가 안 되면: 시트 내용을 통째로 복사해서 붙여 넣기 (⌘A → ⌘C → ⌘V)</summary>
              <textarea rows={5} value={csv} onChange={e => setCsv(e.target.value)} placeholder="여기에 붙여 넣기" />
              <button className="secondary small" disabled={busy || !csv.trim()} onClick={() => void importSheet({ csv })}>붙여 넣은 내용 가져오기</button>
            </details>
            <a className="text-button" href="/templates/question-template.csv" download><Download size={16} /> 시트 양식(CSV) 내려받기</a>
          </div>
          <div className="source-card">
            <h3><Sparkles size={18} /> AI로 만들기</h3>
            {aiConfigured ? <>
              <p>키워드를 적은 과목마다 {PER_SUBJECT}문제씩 만들어요. 과목마다 시간이 조금 걸려요.</p>
              <button className="primary small" disabled={busy || !!generating || !SUBJECTS.some(s => keywords[s]?.trim())} onClick={() => void generateAll()}>AI로 문제 만들기</button>
              {generating && <p className="notice">{generating}</p>}
            </> : <p>AI 자동 생성은 아직 연결되지 않았어요. 아래 요청문을 원하는 AI 대화창에 붙여 넣고, 결과를 구글 시트에 옮겨서 가져올 수 있어요.</p>}
            <button className="secondary small" onClick={() => void copyPrompt()}><Copy size={16} /> AI 요청문 복사</button>
          </div>
        </div>
        {issues.length > 0 && (
          <div className="issues">
            <b>가져오지 못한 줄 {issues.length}개</b>
            <ul>{issues.slice(0, 30).map(i => <li key={i.row}>{i.row}번째 줄: {i.message}</li>)}</ul>
            {issues.length > 30 && <p>…외 {issues.length - 30}개</p>}
          </div>
        )}
      </section>

      <section className="panel parent-section">
        <div className="heading-row">
          <h2>문제 검토</h2>
          <select value={filter} onChange={e => setFilter(e.target.value as Subject | '전체')}>
            <option>전체</option>{SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {!shown.length && <p>문제가 없어요.</p>}
        {shown.map((q, i) => (
          <article className="review-question" key={q.id}>
            <div className="heading-row">
              <b>{i + 1}. [{q.subject}{q.area ? ` · ${q.area}` : ''}] {q.prompt}</b>
              <span className="button-row">
                <TypeBadge type={q.type} small />
                <button className="text-button" disabled={busy} onClick={() => setEditing(q)}><Pencil size={14} /> 수정</button>
                <button className="text-button danger" disabled={busy} onClick={async () => { if (window.confirm('이 문제를 지울까요?') && await call({ action: 'deleteQuestion', id: q.id })) await load(); }}><Trash2 size={14} /></button>
              </span>
            </div>
            <p className="choices-line">{q.choices.map((c, n) => <span className={n === q.answer ? 'correct-option' : ''} key={n}>{n + 1}. {c}{n === q.answer ? ' ✓' : ''}</span>)}</p>
            {q.explanation && <p className="explanation">{q.explanation}</p>}
          </article>
        ))}
      </section>

      <QuestionEditor question={editing} busy={busy} onClose={() => setEditing(null)}
        onSave={async q => { if (await call({ action: 'updateQuestion', id: q.id, question: q })) { setEditing(null); await load(); } }} />
    </>
  );
}

function QuestionEditor({ question, busy, onClose, onSave }: {
  question: Question | null; busy: boolean; onClose: () => void; onSave: (q: Question) => void;
}) {
  return (
    <Dialog open={!!question} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="edit-dialog">
        <DialogTitle>문제 수정</DialogTitle>
        <DialogDescription>정답은 왼쪽 동그라미로 골라 주세요.</DialogDescription>
        {question && <QuestionForm key={question.id} initial={question} busy={busy} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function QuestionForm({ initial, busy, onSave }: { initial: Question; busy: boolean; onSave: (q: Question) => void }) {
  const [q, setQ] = useState(initial);
  const types = SUBJECT_TYPES[q.subject];
  return <>
    <label>과목
      <select value={q.subject} onChange={e => { const subject = e.target.value as Subject; setQ({ ...q, subject, type: SUBJECT_TYPES[subject][0] }); }}>
        {SUBJECTS.map(s => <option key={s}>{s}</option>)}
      </select>
    </label>
    <label>속성
      <select value={q.type} onChange={e => setQ({ ...q, type: e.target.value as TypeKey })}>
        {types.map(t => <option key={t} value={t}>{TYPE_INFO[t].label}</option>)}
      </select>
    </label>
    <label>문제<textarea rows={2} value={q.prompt} onChange={e => setQ({ ...q, prompt: e.target.value })} /></label>
    {Array.from({ length: CHOICE_COUNT }, (_, i) => (
      <div className="edit-choice" key={i}>
        <input type="radio" name="answer" aria-label={`${i + 1}번을 정답으로`} checked={q.answer === i} onChange={() => setQ({ ...q, answer: i })} />
        <input aria-label={`${i + 1}번 보기`} value={q.choices[i] ?? ''} onChange={e => setQ({ ...q, choices: q.choices.map((c, n) => (n === i ? e.target.value : c)) })} />
      </div>
    ))}
    <label>해설<textarea rows={3} value={q.explanation} onChange={e => setQ({ ...q, explanation: e.target.value })} /></label>
    <label>영역 <small className="muted">(비우면 &lsquo;기타&rsquo;)</small>
      <input maxLength={30} list={`areas-${q.subject}`} value={q.area ?? ''} onChange={e => setQ({ ...q, area: e.target.value })} />
      <datalist id={`areas-${q.subject}`}>{SUBJECT_AREAS[q.subject].map(a => <option key={a} value={a} />)}</datalist>
    </label>
    <button className="primary" disabled={busy} onClick={() => onSave(q)}>저장</button>
  </>;
}

type StrongFilter = 'third' | 'strong' | 'changed' | 'all';
const STRONG_PAGE = 60;
/**
 * 속성 변경: 센 포켓몬(진화에 스탯이 더 드는 포켓몬)과 도전 속성(3과목이 되게 더 모아야 하는 속성)을 바꿉니다.
 * 격자(그림·이름·속성)에서 포켓몬을 누르면 팝업이 뜨고, 거기서 고칩니다.
 * 기본값은 lib/strong-pokemon.ts, 바꾼 것은 기록 저장소 settings.strong_overrides 에 남습니다.
 */
function StrongEditor({ overview, busy, call, reload }: { overview: Overview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StrongFilter>('third');
  const [limit, setLimit] = useState(STRONG_PAGE);
  const [openId, setOpenId] = useState<number | null>(null);
  const changed = new Set([...Object.keys(overview.strong.strong), ...Object.keys(overview.strong.third)].map(Number));
  const q = query.trim();
  const all = SPECIES.filter(s => s.from !== null);
  const list = (q
    ? all.filter(s => s.name.includes(q))
    : all.filter(s => filter === 'all' ? true : filter === 'third' ? !!thirdTypeOf(s.id) : filter === 'strong' ? isStrong(s.id) : changed.has(s.id))
  );
  const shown = list.slice(0, limit);
  const act = async (body: Record<string, unknown>) => { if (await call(body)) await reload(); };
  const thirdCount = all.filter(s => thirdTypeOf(s.id)).length;
  const strongCount = all.filter(s => isStrong(s.id)).length;
  const pickFilter = (k: StrongFilter) => { setFilter(k); setLimit(STRONG_PAGE); };
  return (
    <section className="panel parent-section strong-editor">
      <h2>속성 변경 (센 포켓몬 💥)</h2>
      <p className="muted">
        센 포켓몬은 진화에 스탯이 약 1.2배 들어요. 도전 속성이 있으면 원래 두 속성과 다른 과목의 스탯까지 모아야 해요(3과목).
        지금 센 포켓몬 {strongCount}종, 그중 도전 속성 {thirdCount}종. 포켓몬 그림을 누르면 설정 창이 떠요.
      </p>
      <div className="strong-tools">
        <input value={query} onChange={e => { setQuery(e.target.value); setLimit(STRONG_PAGE); }} placeholder="포켓몬 이름으로 찾기 (예: 리자몽)" />
        {!q && (
          <div className="button-row">
            {([['third', '3과목 포켓몬'], ['strong', '센 포켓몬 전체'], ['changed', `바꾼 것 ${changed.size}`], ['all', '진화형 전체']] as const).map(([k, label]) => (
              <button key={k} className={filter === k ? 'primary small' : 'secondary'} onClick={() => pickFilter(k)}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {shown.length === 0 && <p className="muted">해당하는 포켓몬이 없어요.</p>}
      <div className="strong-grid">
        {shown.map(s => {
          const third = thirdTypeOf(s.id) ?? '';
          return (
            <button key={s.id} type="button" className={'strong-card' + (changed.has(s.id) ? ' changed' : '')} onClick={() => setOpenId(s.id)}>
              <PokemonImage id={s.id} className="strong-img" />
              <b>{isStrong(s.id) ? '💥 ' : ''}{s.name}</b>
              <span className="type-row">{s.types.map(t => <TypeBadge key={t} type={t} small />)}{third && <><span className="plus">+</span><TypeBadge type={third} small /></>}</span>
            </button>
          );
        })}
      </div>
      {list.length > shown.length && (
        <div><button className="secondary" onClick={() => setLimit(n => n + STRONG_PAGE)}>더 보기 ({shown.length} / {list.length})</button></div>
      )}
      {changed.size > 0 && (
        <div><button className="secondary danger" disabled={busy} onClick={async () => {
          if (!window.confirm('바꾼 센 포켓몬·도전 속성을 모두 처음 값으로 되돌릴까요?')) return;
          await act({ action: 'resetStrong' });
        }}>모두 처음 값으로</button></div>
      )}
      <StrongDialog id={openId} changed={changed} busy={busy} act={act} onClose={() => setOpenId(null)} />
    </section>
  );
}

/** 포켓몬 하나의 속성 설정 팝업: 센 포켓몬 여부, 도전 속성, 필요한 스탯 */
function StrongDialog({ id, changed, busy, act, onClose }: { id: number | null; changed: Set<number>; busy: boolean; act: (body: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const s = id ? species(id) : null;
  const strong = id ? isStrong(id) : false;
  const third = (id ? thirdTypeOf(id) : null) ?? '';
  const choices = id ? thirdTypeChoices(id) : [];
  const reqText = id ? evolutionRequirement(id).map(r => `${TYPE_INFO[r.type].label} ${r.amount}`).join(' + ') : '';
  return (
    <Dialog open={!!s} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="edit-dialog strong-dialog">
        {s && id && <>
          <DialogTitle>{strong ? '💥 ' : ''}{s.name}</DialogTitle>
          <DialogDescription>No.{String(id).padStart(4, '0')} · {species(s.from!).name}에서 진화</DialogDescription>
          <div className="strong-dialog-body">
            <PokemonImage id={id} className="strong-img-big" />
            <div className="type-row">{s.types.map(t => <TypeBadge key={t} type={t} />)}{third && <><span className="plus">+</span><TypeBadge type={third} /></>}</div>
            <p className="strong-cost">진화에 필요: <b>{reqText}</b></p>
            <label className="strong-check"><input type="checkbox" checked={strong} disabled={busy} onChange={e => act({ action: 'setStrongPokemon', id, strong: e.target.checked })} /> 💥 센 포켓몬</label>
            {strong && choices.length > 0 && (
              <label>도전 속성
                <select value={third} disabled={busy} onChange={e => act({ action: 'setThirdType', id, type: e.target.value })}>
                  <option value="">도전 속성 없음</option>
                  {choices.map(t => <option key={t} value={t}>{TYPE_INFO[t].label} ({subjectOf(t)})</option>)}
                </select>
              </label>
            )}
            {!strong && <p className="muted">센 포켓몬이 아니면 도전 속성도 쓰이지 않아요.</p>}
            <div className="button-row">
              {changed.has(id) && (
                <button className="secondary small" disabled={busy} title={`처음 값: ${defaultStrong(id) ? '센 포켓몬' : '보통'}${defaultThird(id) ? ` · 도전 ${TYPE_INFO[defaultThird(id) as TypeKey].label}` : ''}`}
                  onClick={async () => { await act({ action: 'setStrongPokemon', id, strong: null }); await act({ action: 'setThirdType', id, type: null }); }}>처음 값으로</button>
              )}
              <button className="primary small" onClick={onClose}>닫기</button>
            </div>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}

/** 아이 기록 내보내기: 아이의 진짜 기록과 활동 기록을 JSON 한 파일로 내려받습니다 (시험용 기록은 빠짐) */
function ExportSection({ busy, call }: { busy: boolean; call: Call }) {
  return (
    <section className="panel parent-section">
      <h2><Download size={20} style={{ verticalAlign: '-3px' }} /> 아이 기록 내보내기</h2>
      <p>문제 풀이(고른 답·시도), 하루 활동 시간, 포켓로그 판 기록, 포켓몬·진화·스탯, 볼·상자·선물·이벤트를 한 파일(JSON)로 내려받아요. 시험용(시뮬레이션) 기록은 들어가지 않아요.</p>
      <p className="muted">고른 답·진화·스탯 변화·볼 결과처럼 예전에는 저장하지 않던 항목은 <b>이 업데이트를 올린 날부터</b> 쌓여요. 그 전 내용은 이전에 남아 있던 것(하루 퀴즈 시간 35일, 포켓로그 하루 기록 14일, 보유 포켓몬 얻은 날, 선물 기록)만 들어가요. 파일 맨 앞 &lsquo;기록시작&rsquo;에 항목별 시작일이 적혀 있어요.</p>
      <div><button className="primary small" disabled={busy} onClick={async () => {
        const data = await call<{ file?: unknown; message?: string }>({ action: 'exportChild' });
        if (!data?.file) return;
        const blob = new Blob([JSON.stringify(data.file, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `child-record-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }}><Download size={16} /> 내려받기</button></div>
    </section>
  );
}

/** 이로치 확률: 볼을 열 때 이로치가 나올 확률(%)을 볼 종류마다 정합니다 (기본값은 lib/game-config.ts SHINY_CHANCE_DEFAULT) */
function ShinyChanceEditor({ overview, busy, call, reload }: { overview: Overview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const { chance, defaults, balls } = overview.shiny;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (k: string) => draft[k] ?? String(chance[k]);
  const dirty = balls.filter(b => draft[b.kind] !== undefined && Number(draft[b.kind]) !== chance[b.kind]);
  const changed = balls.some(b => chance[b.kind] !== defaults[b.kind]);
  return (
    <section className="panel parent-section shiny-chance">
      <h2>✨ 이로치 확률</h2>
      <p className="muted">볼을 열었을 때 이로치(색이 다른 포켓몬)가 나올 확률이에요. 이로치 볼은 확률과 상관없이 항상 이로치가 나와요. 바꾸면 아이 화면에 바로 적용돼요.</p>
      <div className="chance-grid">
        {balls.map(b => (
          <label key={b.kind}>
            <span>{b.label} <small className="muted">(기본 {defaults[b.kind]}%)</small></span>
            <span className="chance-input"><input type="number" min={0} max={100} step={0.5} inputMode="decimal" value={value(b.kind)} onChange={e => setDraft(d => ({ ...d, [b.kind]: e.target.value }))} /> %</span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="primary small" disabled={busy || dirty.length === 0} onClick={async () => {
          for (const b of dirty) { if (!(await call({ action: 'setShinyChance', ball: b.kind, percent: Number(draft[b.kind]) }))) return; }
          setDraft({}); await reload();
        }}>저장</button>
        {changed && <button className="secondary" disabled={busy} onClick={async () => { if (await call({ action: 'resetShinyChance' })) { setDraft({}); await reload(); } }}>처음 값으로</button>}
      </div>
    </section>
  );
}
