"use client";
// 보호자 공간: 포켓몬 마을 (2026-11-13). 학습 현황 탭 요약 · 전체 설정 탭 규칙(시간 제한·재료 숫자) · 개발 탭 시험 버튼
import { useState } from 'react';
import { PokemonImage } from '@/components/game/common';
import { CRAFT_INFO, CRAFTS, MATERIAL_INFO, MATERIALS, type CraftKey, type MaterialKey, type VillageRules, type VillageTimeMode } from '@/lib/village';

type Call = <T extends { message?: string }>(body: Record<string, unknown>) => Promise<T | null>;
type Field = { key: Exclude<keyof VillageRules, 'timeMode'>; label: string; min: number; max: number };
export type VillageOverview = {
  started: boolean; mats: Record<MaterialKey, number>; items: Record<CraftKey, number>; gained: number;
  habitats: { kind: string; name: string; since: string }[];
  guests: { species: number; name: string; habitat: string }[];
  met: number; open: boolean; time: { allowedMinutes: number | null; usedSeconds: number };
  rules: { now: VillageRules; defaults: VillageRules; overrides: Partial<VillageRules>; fields: Field[] };
};

const TIME_LABEL: Record<VillageTimeMode, string> = { off: '제한 없음', daily: '하루 ○분', perQuiz: '퀴즈 ○문제당 ○분' };

/** 학습 현황 탭: 마을 요약 */
export function VillageReport({ village }: { village: VillageOverview }) {
  const used = Math.round(village.time.usedSeconds / 60);
  return (
    <section className="panel parent-section">
      <h2>🏡 포켓몬 마을</h2>
      <p className="muted">오늘의 미션(또는 복습)을 끝내면 열려요. 재료는 정답(확률)·미션 끝·마을에서 줍기로만 모이고, 볼·열매·전설 조각으로는 바뀌지 않아요. 손님은 &ldquo;만남&rdquo;이라 가진 포켓몬에 들어가지 않아요.</p>
      <div className="parent-summary">
        <span>오늘 {village.open ? '열림' : '잠김(미션 전)'}</span>
        <span>오늘 마을 {used}분{village.time.allowedMinutes !== null ? ` / ${village.time.allowedMinutes}분` : ''}</span>
        <span>지금까지 받은 재료 {village.gained}개</span>
        <span>만난 손님 {village.met}마리</span>
      </div>
      {!village.started ? <p className="muted">아직 마을에 들어간 적이 없어요.</p> : <>
        <p>재료: {MATERIALS.map(k => `${MATERIAL_INFO[k].name} ${village.mats[k]}`).join(' · ')}</p>
        <p>가방: {CRAFTS.map(k => `${CRAFT_INFO[k].name} ${village.items[k]}`).join(' · ')}</p>
        <p>서식지: {village.habitats.length ? village.habitats.map(h => `${h.name}(${h.since}~)`).join(', ') : '아직 없음'}</p>
        {village.guests.length > 0 && <div className="village-guests-parent">오늘 손님:
          {village.guests.map(g => <span key={g.species}><PokemonImage id={g.species} size={40} /> {g.name} <small className="muted">({g.habitat})</small></span>)}</div>}
      </>}
    </section>
  );
}

/** 전체 설정 탭: 마을 규칙 */
export function VillageRulesEditor({ village, busy, call, reload }: { village: VillageOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const { now, defaults, fields } = village.rules;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const value = (k: Field['key']) => draft[k] ?? String(now[k]);
  const dirty = fields.filter(f => draft[f.key] !== undefined && Number(draft[f.key]) !== now[f.key]);
  const changed = Object.keys(village.rules.overrides).length > 0;
  const shown = fields.filter(f => (f.key === 'dailyMinutes' ? now.timeMode === 'daily' : f.key === 'perQuestions' || f.key === 'perMinutes' ? now.timeMode === 'perQuiz' : true));
  return (
    <section className="panel parent-section shiny-chance">
      <h2>🏡 포켓몬 마을 규칙</h2>
      <p className="muted">마을 시간 제한은 오늘 마을에 있던 시간으로 세요. &ldquo;퀴즈 ○문제당 ○분&rdquo;은 오늘 푼 문제 수(첫 시도 기준)로 계산해요. 이미 들어와 있으면 시간이 끝날 때 &ldquo;오늘 마을 시간은 끝났어&rdquo; 안내가 떠요.</p>
      <div className="gift-row"><span className="gift-label">마을 시간 제한 (기본 {TIME_LABEL[defaults.timeMode]})</span>
        <div className="button-row">{(['off', 'daily', 'perQuiz'] as VillageTimeMode[]).map(m => (
          <button key={m} className={'chip' + (now.timeMode === m ? ' on' : '')} disabled={busy} onClick={async () => { if (await call({ action: 'setVillageRule', key: 'timeMode', value: m })) await reload(); }}>{TIME_LABEL[m]}</button>
        ))}</div></div>
      <div className="chance-grid">
        {shown.map(f => (
          <label key={f.key}>
            <span>{f.label} <small className="muted">(기본 {String(defaults[f.key])})</small></span>
            <span className="chance-input"><input type="number" min={f.min} max={f.max} value={value(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} /></span>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button className="primary small" disabled={busy || dirty.length === 0} onClick={async () => {
          for (const f of dirty) { if (!(await call({ action: 'setVillageRule', key: f.key, value: Number(draft[f.key]) }))) return; }
          setDraft({}); await reload();
        }}>숫자 저장</button>
        <button className="secondary small" disabled={busy || !changed} onClick={async () => {
          if (!window.confirm('포켓몬 마을 규칙을 처음 값으로 되돌릴까요?')) return;
          if (await call({ action: 'resetVillageRules' })) { setDraft({}); await reload(); }
        }}>처음 값으로</button>
      </div>
    </section>
  );
}

/** 개발 탭: 마을 시험 (시뮬레이션 중에만, 시험용 기록에) */
export function VillageSimTools({ busy, call, reload }: { busy: boolean; call: Call; reload: () => Promise<void> }) {
  const run = async (op: string) => { if (await call({ action: 'simVillage', op })) await reload(); };
  return (
    <div className="sim-group">
      <b>🏡 포켓몬 마을 시험</b>
      <p className="muted">마을은 오늘의 미션을 다 풀면 열려요. 서식지를 만든 다음 &ldquo;다음 날로&rdquo;를 누르면 손님이 와요.</p>
      <div className="button-row">
        <button className="secondary small" disabled={busy} onClick={() => void run('bankDone')}>문제은행 다 푼 상태로(복습 모드)</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('mats')}>재료 종류마다 +10</button>
      </div>
    </div>
  );
}
