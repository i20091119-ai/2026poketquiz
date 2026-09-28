"use client";
import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, BookPlus, Copy, Download, FlaskConical, LogOut, Pencil, Plus, Send, Sparkles, Trash2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getJson, goTo, postJson, TypeBadge } from '@/components/game/common';
import { StatBoard } from '@/components/game/home';
import { BATTLE_PASSWORD_MIN, CHOICE_COUNT, GRADES, SUBJECT_AREAS, SUBJECTS, SUBJECT_TYPES, TYPE_INFO, type Subject, type TypeKey } from '@/lib/game-config';
import type { ActivityDay, AreaReport, Question } from '@/lib/game-engine';
import { species, TOTAL_SPECIES } from '@/lib/pokedex';
import { aiRequestText } from '@/lib/question-import';
import { APP_VERSION, CHANGES, versionLabel } from '@/lib/version';

type Keywords = Partial<Record<Subject, string>>;
type BankSummary = { id: number; title: string; grade: string; keywords: Keywords; status: 'draft' | 'published' | 'archived'; created_at: string; published_at: string | null; question_count: number };
type Overview = {
  loggedIn: true; grade: string; aiConfigured: boolean; battlePasswordSet: boolean; banks: BankSummary[];
  battle: {
    log: { date: string; maxWave: number; seconds: number; starts: number }[]; leftToday: number; candy: { pending: number; sent: number; rule: { finished: number; perfect: number } };
    /** 하루 시간 제한(분, 0 = 없음)과 고를 수 있는 값 */
    limit: number; limitOptions: readonly number[];
  };
  /** 최근 28일 날짜별 활동 (오래된 날부터) */
  activity: ActivityDay[];
  /** 아직 안 불러온 연습 문제은행 이름 */
  preparedBanks: string[];
  /** 개발자 메뉴 시뮬레이션: 이 브라우저가 시뮬레이션 중인지, 시험용 기록의 날짜와 요약 */
  sim: {
    active: boolean; today: string; dayOffset: number;
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
function Dashboard({ overview, busy, error, call, onOpenBank, reload }: {
  overview: Overview; busy: boolean; error: string; call: Call; onOpenBank: (id: number, issues?: ImportResult['issues']) => void; reload: () => Promise<void>;
}) {
  const [grade, setGrade] = useState(overview.grade);
  const [battlePassword, setBattlePassword] = useState('');
  const [battleLimit, setBattleLimit] = useState(overview.battle.limit);
  const [creating, setCreating] = useState(false);
  const { child, active } = overview;
  return (
    <>
      <section className="panel parent-intro">
        <span className="pill">{overview.sim.active ? '🧪 시뮬레이션 중 · 아래는 시험용 기록' : '아이 현황'}</span>
        <h2>{child.partner ? `${species(child.partner).name}와 모험 중` : '아직 파트너를 고르지 않았어요'}</h2>
        <div className="parent-summary">
          <span>모은 경험치 {child.exp.toLocaleString()}{child.expSpent ? ` (스탯으로 바꾼 ${child.expSpent.toLocaleString()})` : ''}</span>
          <span>보유 포켓몬 {child.owned}마리</span>
          <span>도감 {child.dex} / {TOTAL_SPECIES}</span>
        </div>
        <StatBoard stats={child.stats} />
      </section>

      <ActivitySection days={overview.activity} />

      {active && (
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
      )}

      <section className="panel parent-section">
        <h2>포켓로그 기록</h2>
        <p>아이가 포켓로그(전투 게임)를 날짜별로 어디까지, 얼마나 했는지예요. 게임이 1분마다 알려 주는 값이라 1~2분 차이는 날 수 있어요. 오늘 새 게임 {overview.battle.leftToday}번 남음.</p>
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
        <h3>하루 플레이 시간 제한</h3>
        <p className="muted">정해 두면 그날 포켓로그를 그 시간만큼 한 뒤에는 게임 화면에 &lsquo;오늘은 여기까지&rsquo; 안내가 뜨고 퀴즈로 돌아가요. 하던 판은 내일 이어서 할 수 있어요. 지금은 <b>{overview.battle.limit ? `${overview.battle.limit}분` : '제한 없음'}</b>.</p>
        <div className="inline-form">
          <select value={battleLimit} onChange={e => setBattleLimit(Number(e.target.value))}>
            {overview.battle.limitOptions.map(m => <option key={m} value={m}>{m ? `하루 ${m}분` : '제한 없음'}</option>)}
          </select>
          <button className="secondary" disabled={busy || battleLimit === overview.battle.limit} onClick={async () => { if (await call({ action: 'setBattleLimit', minutes: battleLimit })) await reload(); }}>저장</button>
        </div>
      </section>

      <section className="panel parent-section">
        <h2>기본 학년</h2>
        <p>새 문제은행을 만들 때 기본으로 쓰는 학년이에요. AI 요청문에도 들어가요.</p>
        <div className="inline-form">
          <select value={grade} onChange={e => setGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</select>
          <button className="secondary" disabled={busy || grade === overview.grade} onClick={async () => { if (await call({ action: 'setGrade', grade })) await reload(); }}>저장</button>
        </div>
      </section>

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

      <DevMenu sim={overview.sim} busy={busy} call={call} reload={reload} />

      {/* 이 칸은 항상 맨 아래에 둡니다. 새 칸을 추가할 때는 이 위에 넣어 주세요. */}
      <section className="panel parent-section danger-zone">
        <h2>아이 게임 처음부터 다시 하기</h2>
        <p>파트너, 포켓몬, 스탯, 경험치, 푼 문제 기록이 모두 지워지고 <b>파트너 고르기부터</b> 다시 시작해요. 문제은행은 그대로 남아요.</p>
        <div><button className="secondary danger" disabled={busy} onClick={async () => {
          if (!window.confirm('정말 아이 게임 기록을 모두 지우고 처음부터 시작할까요? 되돌릴 수 없어요.')) return;
          if (await call({ action: 'resetChild' })) await reload();
        }}>초기화하기</button></div>
      </section>

      <NewBankDialog open={creating} grade={overview.grade} busy={busy} error={error} call={call}
        onClose={() => setCreating(false)} onCreated={(id, issues) => { setCreating(false); onOpenBank(id, issues); }} />
    </>
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
/** 버전 표시와 시뮬레이션(아이 기록을 건드리지 않는 시험용 기록으로 앱 전체를 해 보기) */
function DevMenu({ sim, busy, call, reload }: { sim: Overview['sim']; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const childScreen = '/';
  const start = async (source: 'copy' | 'empty') => {
    if (source === 'copy' && !window.confirm('지금 아이 기록을 시험용으로 복사해서 시뮬레이션을 시작할까요? 아이의 진짜 기록은 바뀌지 않아요.')) return;
    if (await call({ action: 'simStart', source })) goTo(childScreen)({ preventDefault() {} });
  };
  const s = sim.summary;
  return (
    <section className="panel parent-section dev-menu">
      <h2><FlaskConical size={20} style={{ verticalAlign: '-3px' }} /> 개발자 메뉴</h2>

      <h3>① 버전</h3>
      <p>버전 <b>{versionLabel(__BUILD_DATE__)}</b> <span className="muted">· 저장 번호 {__APP_VERSION__}</span></p>
      <p className="muted">버전 {APP_VERSION}에서 바뀐 것</p>
      <ul className="changes">{CHANGES.map(c => <li key={c}>{c}</li>)}</ul>

      <h3>② 시뮬레이션</h3>
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
        <p className="muted">‘다음 날로 넘기기’를 누른 뒤 아이 화면을 새로고침하면 일일미션과 포켓로그 새 게임 횟수가 새 날 기준으로 다시 시작해요. 아이 화면 맨 위의 보라색 띠를 누르면 여기로 돌아와요.</p>
      </> : <>
        <div className="button-row">
          <button className="primary small" disabled={busy} onClick={() => void start('copy')}>시험용 기록을 지금 아이 기록으로 복사해서 시작</button>
          <button className="secondary" disabled={busy} onClick={() => void start('empty')}>빈 기록으로 시작</button>
        </div>
        <p className="muted">시작하면 아이 화면으로 이동하고, 화면 맨 위에 ‘시뮬레이션 중’ 띠가 보여요. 끝낼 때는 띠를 눌러 여기로 돌아와 ‘시뮬레이션 끝내기’를 누르면 돼요. 끝내는 걸 잊어도 7일 뒤엔 저절로 풀려요.</p>
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
