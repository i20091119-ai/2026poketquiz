"use client";
// 보호자 공간: 집 공부 기록(달력에 ●■▲) · 응원 한 줄 · 집 공부·전설 규칙 · 시뮬레이션 (2026-10-15 부모님 요청)
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PokemonImage } from '@/components/game/common';
import { Gem } from '@/components/game/legend';
import { MarkLegend, monthOf, MonthCalendar, monthStats, shiftMonth } from '@/components/game/offline';
import { GIFT_LETTER_MAX, GIFT_SENDERS, type GiftSender } from '@/lib/game-config';
import type { LegendView } from '@/lib/game-engine';
import { gemShape } from '@/lib/gem';
import { DAY_BOX_LABEL, halfText, MARK_LABEL, MARK_SYMBOL, plusDays, stageNeed, weekStartOf, type DayBoxKind, type DayMark, type OfflineRules } from '@/lib/offline';
import { species } from '@/lib/pokedex';
import { LEGENDS } from './outing-parent';

type Call = <T extends { message?: string }>(body: Record<string, unknown>) => Promise<T | null>;
type Field = { key: 'weekGoal' | 'fullCount' | 'someCount' | 'noneCount' | 'eventPieces'; label: string; min: number; max: number; step?: number };
export type OfflineOverview = {
  today: string;
  marks: Record<string, DayMark>;
  given: Record<string, DayMark>;
  weeks: Record<string, { goal: number; score: number; settled: boolean; piece: boolean; cheer: { by: GiftSender; text: string; at: string } | null }>;
  unopenedBoxes: number;
  legend: LegendView;
  gotAll: { stage: number; species: number; shiny: boolean; at: string }[];
  rules: { now: OfflineRules; defaults: OfflineRules; overrides: Partial<OfflineRules>; fields: Field[] };
};

/** 누를 때마다 ● → ■ → ▲ → 빈칸 */
const NEXT: Record<string, DayMark | null> = { '': 'full', full: 'some', some: 'none', none: null };
const loadSender = (): GiftSender => { try { const v = localStorage.getItem('pq-gift-sender'); return v === 'dad' ? 'dad' : 'mom'; } catch { return 'mom'; } };
const dateText = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 ${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]}요일`;

/** 📅 집 공부 탭: 오늘 기록(맨 위) + 달력 + 이번 주 응원 + 전설 현황 */
export function StudyRecord({ overview, sim, busy, call, reload }: { overview: OfflineOverview; sim: boolean; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [month, setMonth] = useState(monthOf(overview.today));
  const [warning, setWarning] = useState('');
  const today = overview.today;
  const setMark = async (date: string, mark: DayMark | null) => {
    const r = await call<{ warning: string | null; message?: string }>({ action: 'offlineMark', date, mark });
    if (r) { setWarning(r.warning ? `${dateText(date)}: ${r.warning}` : ''); await reload(); }
  };
  const ws = weekStartOf(today);
  const week = overview.weeks[ws];
  const goal = week?.goal ?? overview.rules.now.weekGoal;
  const lg = overview.legend;
  const weeksForCal = Object.fromEntries(Object.entries(overview.weeks).map(([k, w]) => [k, { goal: w.goal, score: w.score, piece: w.piece }]));
  const stats = monthStats(month, overview.marks, weeksForCal, lg.log);
  return (
    <section className="panel parent-section study-panel">
      <h2>📅 집 공부 기록{sim ? ' (시험용 기록)' : ''}</h2>
      <p className="muted">종이 계획표를 보고 저녁에 적어 주세요. 아이는 다음 날 앱을 열면 선물 상자를 받아요. 한 주(월~일) 합계가 {halfText(overview.rules.now.weekGoal)} 이상이면 전설 조각 1개 (● 1, ■ 0.5).</p>
      <div className="study-today">
        <b>오늘 {dateText(today)}</b>
        {(['full', 'some', 'none'] as DayMark[]).map(m => (
          <button key={m} className={'secondary small mark-btn' + (overview.marks[today] === m ? ' on' : '')} disabled={busy} onClick={() => void setMark(today, m)}>
            <span className={'mark-' + m}>{MARK_SYMBOL[m]}</span> {MARK_LABEL[m]}
          </button>
        ))}
        {overview.marks[today] && <button className="text-button" disabled={busy} onClick={() => void setMark(today, null)}>지우기</button>}
      </div>
      {warning && <p className="study-warning">⚠️ {warning}</p>}
      <div className="month-nav">
        <button className="icon-button" aria-label="이전 달" onClick={() => setMonth(m => shiftMonth(m, -1))}><ChevronLeft /></button>
        <b>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</b>
        <button className="icon-button" aria-label="다음 달" onClick={() => setMonth(m => shiftMonth(m, 1))}><ChevronRight /></button>
      </div>
      <MonthCalendar month={month} today={today} marks={overview.marks} weeks={weeksForCal} defaultGoal={overview.rules.now.weekGoal} busy={busy}
        onDay={d => void setMark(d, NEXT[overview.marks[d] ?? ''])} />
      <MarkLegend />
      <p className="muted">날짜를 누를 때마다 ● → ■ → ▲ → 빈칸. 앞으로 올 날짜는 막혀 있어요. 지난 날을 고쳐도 이미 나간 선물·조각은 회수하지 않아요.</p>
      <p className="study-month-stats">이번 달 <b className="mark-full">●</b> {stats.full}개 · 얻은 전설 조각 💎 {stats.pieces}개{overview.unopenedBoxes ? ` · 아이가 아직 안 연 상자 ${overview.unopenedBoxes}개` : ''}</p>
      <p>이번 주 합계 <b>{halfText(week?.score ?? 0)} / {halfText(goal)}</b>{week ? '' : ' (이번 주 첫 기록 때 기준이 정해져요)'}</p>
      <CheerEditor key={ws + (week?.cheer?.at ?? '')} weekStart={ws} cheer={week?.cheer ?? null} busy={busy} call={call} reload={reload} />
      <h3>💎 전설 지도</h3>
      <div className="legend-admin-stage">
        <div className="row">
          {(() => { const s = lg.stages.find(x => x.stage === lg.stage)!; return <Gem stage={s.stage} salt={s.salt} need={s.need} filled={Math.min(lg.pieces, s.need)} size={56} />; })()}
          <span><b>{lg.stage}단계</b> · 조각 {Math.min(lg.pieces, lg.need)}/{lg.need}{lg.pieces > lg.need ? ` (+${lg.pieces - lg.need} 남음)` : ''}{lg.pending ? ' · ✨ 마스터볼 고르기 대기' : ''}</span>
        </div>
        {lg.waiting && <p className="study-warning">⚠️ {lg.stage}단계 전설 후보가 없어요. 전체 설정 탭 &ldquo;집 공부 · 전설 규칙&rdquo;에서 후보를 정해 주세요. 그동안 조각은 계속 모여요.</p>}
        <div className="legend-candidates">
          {overview.gotAll.map((g, i) => <span key={i} className="legend-cand got" title={`${g.stage}단계 ${species(g.species).name}`}><PokemonImage id={g.species} shiny={g.shiny} /></span>)}
        </div>
        {overview.gotAll.length > 0 && <small className="muted">전설 지도에서 만난 전설: {overview.gotAll.map(g => species(g.species).name + (g.shiny ? '✨' : '')).join(', ')}</small>}
      </div>
    </section>
  );
}

function CheerEditor({ weekStart, cheer, busy, call, reload }: { weekStart: string; cheer: { by: GiftSender; text: string } | null; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [by, setBy] = useState<GiftSender>(cheer?.by ?? loadSender());
  const [text, setText] = useState(cheer?.text ?? '');
  return (
    <div className="gift-form">
      <div className="gift-row"><span className="gift-label">이번 주 응원 한 줄</span>
        <div className="button-row">{(Object.keys(GIFT_SENDERS) as GiftSender[]).map(s => <button key={s} className={'chip' + (by === s ? ' on' : '')} onClick={() => setBy(s)}>{GIFT_SENDERS[s]}</button>)}</div></div>
      <input value={text} maxLength={GIFT_LETTER_MAX} placeholder="예: 이번 주 매일 책 읽은 거 정말 멋졌어!" onChange={e => setText(e.target.value)} />
      <div className="button-row">
        <button className="primary small" disabled={busy || text.trim() === (cheer?.text ?? '')} onClick={async () => { if (await call({ action: 'offlineCheer', weekStart, by, text })) await reload(); }}>응원 저장</button>
        <small className="muted">{plusDays(weekStart, 7).slice(5).replace('-', '/')}(다음 월요일) &ldquo;지난주 탐험 기록&rdquo;에 보여요. 비우면 안 보여요.</small>
      </div>
    </div>
  );
}

/** 전체 설정 탭: 집 공부 · 전설 규칙 */
export function OfflineRulesEditor({ overview, busy, call, reload }: { overview: OfflineOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const { now, defaults, fields } = overview.rules;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (k: Field['key']) => draft[k] ?? String(now[k]);
  const dirty = fields.filter(f => draft[f.key] !== undefined && Number(draft[f.key]) !== now[f.key]);
  const changed = Object.keys(overview.rules.overrides).length > 0;
  const lg = overview.legend;
  const shownStages = Math.max(lg.stage + 2, 4);
  const boxRow = (mark: DayMark) => {
    const key = `${mark}Box` as 'fullBox' | 'someBox' | 'noneBox';
    return (
      <div className="gift-row" key={mark}><span className="gift-label"><span className={'mark-' + mark}>{MARK_SYMBOL[mark]}</span> 날 상자 (기본 {DAY_BOX_LABEL[defaults[key]]})</span>
        <div className="button-row">{(['book', 'normal', 'off'] as DayBoxKind[]).map(k => (
          <button key={k} className={'chip' + (now[key] === k ? ' on' : '')} disabled={busy} onClick={async () => { if (await call({ action: 'setOfflineRule', key, value: k })) await reload(); }}>{DAY_BOX_LABEL[k]}</button>
        ))}</div></div>
    );
  };
  return (
    <section className="panel parent-section shiny-chance">
      <h2>📅 집 공부 · 전설 규칙</h2>
      <p className="muted">한 주 기준은 그 주에 처음 기록할 때 그 주에 고정돼요(진행 중 규칙 변경 금지). 단계 조각 수는 아직 열리지 않은 단계부터 적용돼요. 책 상자는 랜덤상자와 같은데 볼이 한 등급 위예요(몬스터볼 대신 슈퍼볼…).</p>
      <div className="chance-grid">
        {fields.map(f => (
          <label key={f.key}>
            <span>{f.label} <small className="muted">(기본 {String(defaults[f.key])})</small></span>
            <span className="chance-input"><input type="number" min={f.min} max={f.max} step={f.step ?? 1} value={value(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} /></span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="primary small" disabled={busy || dirty.length === 0} onClick={async () => {
          for (const f of dirty) { if (!(await call({ action: 'setOfflineRule', key: f.key, value: Number(draft[f.key]) }))) return; }
          setDraft({}); await reload();
        }}>숫자 저장</button>
        <button className={now.legendShiny ? 'primary small' : 'secondary small'} disabled={busy} onClick={async () => { if (await call({ action: 'setOfflineRule', key: 'legendShiny', value: !now.legendShiny })) await reload(); }}>
          {now.legendShiny ? '✨ 전설 마스터볼 이로치 확률: 켜짐 (누르면 끔)' : '전설 마스터볼 이로치 확률: 꺼짐 (누르면 켬)'}
        </button>
      </div>
      <div className="gift-form">{(['full', 'some', 'none'] as DayMark[]).map(boxRow)}</div>
      <h3>단계별 조각 수 · 전설 후보 (한 단계 5마리)</h3>
      {Array.from({ length: shownStages }, (_, i) => i + 1).map(stage => (
        <StageEditor key={stage + ':' + (now.candidates[String(stage)] ?? []).join(',') + ':' + stageNeed(now, stage) + ':' + (now.gemSalt[String(stage)] ?? 0)}
          stage={stage} now={now} legend={lg} busy={busy} call={call} reload={reload} />
      ))}
      {changed && <button className="secondary" disabled={busy} onClick={async () => { if (await call({ action: 'resetOfflineRules' })) { setDraft({}); await reload(); } }}>처음 값으로</button>}
      <p className="muted">포켓로그 원본 스타터 비용(팀 포인트 15): 프리져·레지아이스·유크시·엠라이트 5 / 썬더·파이어·라이코·앤테이·스이쿤·레지락·레지스틸·아그놈·코바르온·비리디온 6 / 라티아스·라티오스·히드런·테라키온 7 / 뮤츠·루기아·칠색조 8 / 가이오가·그란돈·레쿠쟈 9.</p>
    </section>
  );
}

function StageEditor({ stage, now, legend, busy, call, reload }: { stage: number; now: OfflineRules; legend: LegendView; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const opened = stage <= legend.stage;
  const info = legend.stages.find(s => s.stage === stage);
  const need = opened && info ? info.need : stageNeed(now, stage);
  const [needDraft, setNeedDraft] = useState(String(need));
  const ids = now.candidates[String(stage)] ?? [];
  const [pick, setPick] = useState(0);
  const salt = now.gemSalt[String(stage)] ?? 0;
  const saveIds = async (next: number[]) => { if (await call({ action: 'setLegendStage', stage, candidates: next })) await reload(); };
  const got = new Set(legend.stages.find(s => s.stage === stage)?.got.map(g => g.species) ?? []);
  return (
    <div className="legend-admin-stage">
      <div className="row">
        <Gem stage={stage} salt={salt} need={need} filled={0} size={48} />
        <b>{stage}단계</b>
        <small className="muted">{gemShape(stage, salt).color.name} {stage === 1 ? '다이아몬드' : stage === 2 ? '에메랄드 컷' : stage === 3 ? '별' : '자동 모양'}{opened ? ' · 열린 단계' : ''}</small>
        {stage >= 4 && <button className="secondary small" disabled={busy} onClick={async () => { if (await call({ action: 'regenGem', stage })) await reload(); }}>다른 모양으로 다시 만들기</button>}
      </div>
      <div className="row">
        <span>한 마리에 조각</span>
        <input type="number" min={1} max={20} value={needDraft} disabled={opened} onChange={e => setNeedDraft(e.target.value)} style={{ width: 70 }} />
        {opened ? <small className="muted">이미 열린 단계라 그대로예요</small>
          : <button className="primary small" disabled={busy || Number(needDraft) === need} onClick={async () => { if (await call({ action: 'setLegendStage', stage, need: Number(needDraft) })) await reload(); }}>저장</button>}
      </div>
      <div className="legend-candidates">
        {ids.map(id => (
          <span key={id} className="outing-candidate" title={species(id).name}>
            <PokemonImage id={id} /><small>{species(id).name}{got.has(id) ? ' ✅' : ''}</small>
            <button className="text-button" disabled={busy} onClick={() => void saveIds(ids.filter(x => x !== id))}>빼기</button>
          </span>
        ))}
        {ids.length === 0 && <small className="muted">후보가 아직 없어요.</small>}
      </div>
      {ids.length < 5 && <div className="row">
        <select value={pick} onChange={e => setPick(Number(e.target.value))}>
          <option value={0}>전설 고르기…</option>
          {LEGENDS.filter(l => !ids.includes(l.id)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button className="secondary small" disabled={busy || !pick} onClick={() => { void saveIds([...ids, pick]); setPick(0); }}>후보에 넣기</button>
      </div>}
    </div>
  );
}

/** 개발 탭: 집 공부 · 전설 시뮬레이션 */
export function OfflineSimTools({ busy, call, reload }: { busy: boolean; call: Call; reload: () => Promise<void> }) {
  const run = async (op: string) => { if (await call({ action: 'simOffline', op })) await reload(); };
  const [note, setNote] = useState('');
  const clearDevice = (what: 'week' | 'intro') => {
    try {
      for (const k of Object.keys(localStorage)) if (what === 'week' ? k.startsWith('pq-week-seen-') : k === 'pq-offline-intro-v1') localStorage.removeItem(k);
      setNote(what === 'week' ? '이 기기에서 "지난주 탐험 기록"을 다시 볼 수 있어요.' : '이 기기에서 집 공부 처음 안내를 다시 볼 수 있어요.');
    } catch { setNote('이 기기 저장을 지우지 못했어요.'); }
  };
  return (
    <div className="sim-group">
      <b>📅 집 공부 · 💎 전설 시험</b>
      <p className="muted">달력 기록은 &ldquo;📅 집 공부&rdquo; 탭에서 그대로 적어 보면 돼요(시뮬레이션 중엔 시험용 기록에). &ldquo;다음 날로&rdquo;를 누르면 하루 선물 상자가 와요.</p>
      <div className="button-row">
        <button className="secondary small" disabled={busy} onClick={() => void run('weekGood')}>지난주 채우기: 조각 받는 주(●●■●■●▲ = 5)</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('weekShort')}>지난주 채우기: 아쉬운 주(3½)</button>
        <button className="secondary small" onClick={() => clearDevice('week')}>이 기기 주간 기록 다시 보기</button>
        <button className="secondary small" onClick={() => clearDevice('intro')}>이 기기 처음 안내 다시 보기</button>
      </div>
      <div className="button-row">
        <button className="secondary small" disabled={busy} onClick={() => void run('piece1')}>전설 조각 +1</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('pieceNear')}>보석 1개 전으로</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('pieceFull')}>보석 완성(마스터볼)</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('leaveOne')}>이 단계 전설 1마리만 남기기</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('stage4')}>4단계로(자동 보석)</button>
        <button className="secondary small danger" disabled={busy} onClick={() => void run('reset')}>집 공부·전설 시험 기록 지우기</button>
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}
