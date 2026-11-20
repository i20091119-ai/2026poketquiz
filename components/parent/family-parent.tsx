"use client";
// 보호자 공간: 제때 등교 · 가족 대시보드 연결 (2026-11-20). 규칙 lib/school.ts, 창구 사용법 docs/family-api.md
import { useState } from 'react';
import type { SchoolRules } from '@/lib/school';

type Call = <T extends { message?: string }>(body: Record<string, unknown>) => Promise<T | null>;
type Arrival = { date: string; time: string | null; ok: boolean; deadline: string; source: 'gate' | 'parent'; at: string; by?: string; letter: { picked?: string } | null };
export type SchoolOverview = {
  today: Omit<Arrival, 'date' | 'letter'> | null; deadlineToday: string; start: string | null; arrivals: Arrival[];
  rules: { now: SchoolRules; defaults: SchoolRules; overrides: Partial<SchoolRules> };
  handCheckOpen: boolean; now: string;
};
export type FamilyOverview = { codeSet: boolean };

const MAT: Record<string, string> = { leaf: '풀잎', drop: '물방울', petal: '꽃잎', twig: '나뭇가지', stone: '돌멩이', mud: '진흙' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${DOW[new Date(d + 'T00:00:00Z').getUTCDay()]})`;

/** 학습 현황 탭: 오늘 등교 + 손 체크 + 최근 기록 */
export function SchoolSection({ school, busy, call, reload }: { school: SchoolOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const t = school.today;
  return (
    <section className="panel parent-section">
      <h2>🏫 제때 등교</h2>
      <p className="muted">가족 대시보드가 교문 통과 시각을 보내면 판정해요. 오늘 기준 <b>{school.deadlineToday}</b> 이전이면 성공 → 아이가 미션을 끝내고 마을에 들어가면 우체통 편지로 재료 하나를 골라요. 늦거나 기록이 없으면 아이 화면에는 아무것도 안 나와요.</p>
      <div className="parent-summary">
        <span>오늘: {t ? (t.ok ? `✅ 제때 도착${t.time ? ` (${t.time})` : ''}${t.source === 'parent' ? ' · 손 체크' : ''}` : `늦음 (${t.time})`) : '아직 기록 없음'}</span>
      </div>
      {!t?.ok && (school.handCheckOpen
        ? <button className="primary small" disabled={busy} onClick={async () => { if (await call({ action: 'schoolHandCheck' })) await reload(); }}>✅ 오늘 제때 도착으로 적기</button>
        : <p className="muted">손 체크는 그날 {school.rules.now.handCheckUntil}까지만 할 수 있어요 (지금 {school.now}).</p>)}
      {school.arrivals.length > 0 && <table className="battle-log">
        <thead><tr><th>날짜</th><th>교문 통과</th><th>기준</th><th>결과</th><th>편지 재료</th></tr></thead>
        <tbody>{school.arrivals.map(a => (
          <tr key={a.date}><td>{dayLabel(a.date)}</td><td>{a.time ?? '손 체크'}</td><td>{a.deadline}</td><td>{a.ok ? '✅ 제때' : '늦음'}</td>
            <td>{a.ok ? (a.letter?.picked ? MAT[a.letter.picked] ?? a.letter.picked : '아직 안 받음') : '-'}</td></tr>
        ))}</tbody>
      </table>}
    </section>
  );
}

/** 전체 설정 탭: 기준 시각 + 가족 대시보드 접속 코드 */
export function FamilySettings({ school, family, busy, call, reload }: { school: SchoolOverview; family: FamilyOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const { now, defaults, overrides } = school.rules;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const val = (k: keyof SchoolRules) => draft[k] ?? String(now[k]);
  const fields: { key: keyof SchoolRules; label: string; type: string }[] = [
    { key: 'firstTime', label: '처음 기간 기준 시각', type: 'time' },
    { key: 'firstWeeks', label: '처음 기간(주)', type: 'number' },
    { key: 'laterTime', label: '그 뒤 기준 시각', type: 'time' },
    { key: 'startDate', label: '시작일 (비우면 처음 기록 온 날)', type: 'date' },
    { key: 'handCheckUntil', label: '손 체크 마감 시각', type: 'time' },
  ];
  const dirty = fields.filter(f => draft[f.key] !== undefined && draft[f.key] !== String(now[f.key]));
  return (
    <section className="panel parent-section shiny-chance">
      <h2>🏫 제때 등교 · 가족 대시보드 연결</h2>
      <p className="muted">기준 시각 &ldquo;이전&rdquo;(같은 분 포함)이면 성공. 처음 기록이 온 날{school.start ? `(${school.start})` : ''}부터 {now.firstWeeks}주는 {now.firstTime}, 그 뒤는 {now.laterTime}. 바꿔도 이미 받은 날의 판정은 그대로예요.</p>
      <div className="chance-grid">
        {fields.map(f => (
          <label key={f.key}>
            <span>{f.label} <small className="muted">(기본 {String(defaults[f.key]) || '처음 기록 날'})</small></span>
            <span className="chance-input"><input type={f.type} value={val(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} /></span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="primary small" disabled={busy || !dirty.length} onClick={async () => {
          for (const f of dirty) { if (!(await call({ action: 'setSchoolRule', key: f.key, value: f.key === 'firstWeeks' ? Number(draft[f.key]) : draft[f.key] }))) return; }
          setDraft({}); await reload();
        }}>저장</button>
        <button className="secondary small" disabled={busy || !Object.keys(overrides).length} onClick={async () => { if (await call({ action: 'resetSchoolRules' })) { setDraft({}); await reload(); } }}>처음 값으로</button>
      </div>
      <h3>🔑 가족 대시보드 접속 코드</h3>
      <p className="muted">가족 대시보드가 포켓퀴즈를 읽고 등교 기록을 보낼 때 쓰는 비밀 코드예요. {family.codeSet ? '지금 코드가 있어요(보안을 위해 다시 보여 주지 않아요).' : '아직 없어요.'} 새로 만들면 예전 코드는 바로 못 써요. 사용법: 저장소의 docs/family-api.md</p>
      {code && <p className="family-code"><b>{code}</b><button className="secondary small" onClick={() => { void navigator.clipboard?.writeText(code); }}>복사</button></p>}
      <div className="button-row">
        <button className="primary small" disabled={busy} onClick={async () => {
          if (family.codeSet && !window.confirm('새 코드를 만들면 지금 코드는 더 못 써요. 만들까요?')) return;
          const r = await call<{ message?: string; code?: string }>({ action: 'familyCodeNew' });
          if (r?.code) { setCode(r.code); await reload(); }
        }}>{family.codeSet ? '새 코드 만들기' : '코드 만들기'}</button>
        {family.codeSet && <button className="secondary small danger" disabled={busy} onClick={async () => {
          if (!window.confirm('코드를 지우면 가족 대시보드 연결이 끊겨요. 지울까요?')) return;
          if (await call({ action: 'familyCodeDelete' })) { setCode(''); await reload(); }
        }}>코드 지우기</button>}
      </div>
    </section>
  );
}

/** 개발 탭: 가족 대시보드가 보낸 것처럼 (시험용 기록에만) */
export function SchoolSimTools({ busy, call, reload }: { busy: boolean; call: Call; reload: () => Promise<void> }) {
  const run = async (op: string) => { if (await call({ action: 'simArrival', op })) await reload(); };
  return (
    <div className="sim-group">
      <b>🏫 제때 등교 시험</b>
      <p className="muted">가족 대시보드가 교문 통과 시각을 보낸 것처럼 시험용 기록에 넣어요. 제때면 미션을 끝내고 마을에 들어갈 때 우체통 편지가 와요.</p>
      <div className="button-row">
        <button className="secondary small" disabled={busy} onClick={() => void run('onTime')}>오늘 08:31 (제때)</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('late')}>오늘 08:58 (늦음)</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('yesterday')}>어제 08:31 (지난 ○요일)</button>
      </div>
    </div>
  );
}
