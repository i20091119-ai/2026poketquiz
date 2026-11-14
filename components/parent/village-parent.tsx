"use client";
// 보호자 공간: 포켓몬 마을 (2026-11-13). 학습 현황 탭 요약 · 전체 설정 탭 규칙(시간 제한·재료 숫자) · 개발 탭 시험 버튼
import { useState } from 'react';
import { PokemonImage } from '@/components/game/common';
import { CRAFT_INFO, CRAFTS, MATERIAL_INFO, MATERIALS, type CraftKey, type MaterialKey, type VillageRules, type VillageTimeMode } from '@/lib/village';
import { DECOR_INFO, DECOR_ITEMS, type DecorKey } from '@/lib/village-decor';
import type { CraftRules } from '@/lib/village-craft';
import { POTIONS } from '@/lib/game-config';

type Call = <T extends { message?: string }>(body: Record<string, unknown>) => Promise<T | null>;
type Field = { key: Exclude<keyof VillageRules, 'timeMode'>; label: string; min: number; max: number };
export type VillageOverview = {
  started: boolean; mats: Record<MaterialKey, number>; items: Record<CraftKey, number>; gained: number;
  habitats: { kind: string; name: string; since: string }[];
  guests: { species: number; name: string; habitat: string }[];
  met: number; open: boolean; time: { allowedMinutes: number | null; usedSeconds: number };
  rules: { now: VillageRules; defaults: VillageRules; overrides: Partial<VillageRules>; fields: Field[] };
  /** 꾸미기: 놓은 물건 수·가방, 재료 수(지금·처음·바꾼 물건) */
  decorPlaced: number; decorBag: Record<DecorKey, number>;
  decor: { now: Record<DecorKey, Partial<Record<MaterialKey, number>>>; defaults: Record<string, Partial<Record<MaterialKey, number>>>; changed: string[] };
  /** 열매나무·제작대 (2026-11-14) */
  craft?: { trees: number; iron: number; sparkle: number; mail: number; balls: number; made: number;
    now: CraftRules; defaults: CraftRules; overrides: Partial<CraftRules>; fields: { key: keyof CraftRules; label: string; min: number; max: number; group: string }[] };
  berrySources?: Partial<Record<string, number>>;
};
const SOURCE_LABEL: Record<string, string> = { box: '상자·선물 고르기', gift: '보호자 작은 선물', tree: '마을 열매나무', guest: '마을 손님', returned: '제작 볼 돌려받기' };

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
        <p>꾸미기: 마을에 놓은 물건 {village.decorPlaced}개 · 가방 {DECOR_ITEMS.filter(k => village.decorBag[k] > 0).map(k => `${DECOR_INFO[k].name} ${village.decorBag[k]}`).join(' · ') || '없음'}</p>
        {village.craft && <p>열매나무 {village.craft.trees}그루 · 철 {village.craft.iron} · 반짝돌 {village.craft.sparkle}{village.craft.mail ? ` · 우편함에 철 소포 ${village.craft.mail}개` : ''} · 안 연 제작 볼 {village.craft.balls}개 · 지금까지 만든 것 {village.craft.made}번</p>}
        {village.berrySources && Object.keys(village.berrySources).length > 0 && <p>열매 들어온 곳: {Object.entries(village.berrySources).map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`).join(' · ')}</p>}
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
      <DecorCostEditor village={village} busy={busy} call={call} reload={reload} />
      {village.craft && <CraftRulesEditor craft={village.craft} busy={busy} call={call} reload={reload} />}
    </section>
  );
}

/** 꾸미기 물건 재료 수 (물건마다 재료 4가지 0~20, 하나 이상은 1 이상) */
function DecorCostEditor({ village, busy, call, reload }: { village: VillageOverview; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const { now, defaults, changed } = village.decor;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const val = (k: DecorKey, m: MaterialKey) => draft[`${k}|${m}`] ?? String(now[k][m] ?? 0);
  const rowDirty = (k: DecorKey) => MATERIALS.some(m => draft[`${k}|${m}`] !== undefined && Number(draft[`${k}|${m}`]) !== (now[k][m] ?? 0));
  const costText = (c: Partial<Record<MaterialKey, number>>) => MATERIALS.filter(m => (c[m] ?? 0) > 0).map(m => `${MATERIAL_INFO[m].name} ${c[m]}`).join(' + ');
  return (
    <div className="decor-costs">
      <h3>🎨 꾸미기 물건 재료</h3>
      <p className="muted">물건 하나를 만드는 데 드는 재료 수예요. 0~20개, 적어도 한 가지는 1개 이상이어야 해요. 이미 만든 물건은 그대로예요.</p>
      <div className="table-wrap"><table className="decor-cost-table">
        <thead><tr><th>물건</th>{MATERIALS.map(m => <th key={m}>{MATERIAL_INFO[m].name}</th>)}<th /></tr></thead>
        <tbody>{DECOR_ITEMS.map(k => (
          <tr key={k}>
            <td>{DECOR_INFO[k].name}{changed.includes(k) && <small className="muted"><br />(처음: {costText(defaults[k])})</small>}</td>
            {MATERIALS.map(m => <td key={m}><input type="number" min={0} max={20} aria-label={`${DECOR_INFO[k].name} ${MATERIAL_INFO[m].name}`} value={val(k, m)}
              onChange={e => setDraft(d => ({ ...d, [`${k}|${m}`]: e.target.value }))} /></td>)}
            <td><button className="primary small" disabled={busy || !rowDirty(k)} onClick={async () => {
              const cost = Object.fromEntries(MATERIALS.map(m => [m, Number(val(k, m))]));
              if (await call({ action: 'setDecorCost', item: k, cost })) { setDraft(d => Object.fromEntries(Object.entries(d).filter(([key]) => !key.startsWith(k + '|')))); await reload(); }
            }}>저장</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <button className="secondary small" disabled={busy || changed.length === 0} onClick={async () => {
        if (!window.confirm('꾸미기 물건 재료를 모두 처음 값으로 되돌릴까요?')) return;
        if (await call({ action: 'resetDecorCosts' })) { setDraft({}); await reload(); }
      }}>재료 처음 값으로</button>
    </div>
  );
}

/** 열매나무·제작대 규칙 (레시피 열매는 한 종류로 셈, 열매 상한은 "성장 규칙"의 열매 보유 상한) */
function CraftRulesEditor({ craft, busy, call, reload }: { craft: NonNullable<VillageOverview['craft']>; busy: boolean; call: Call; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const dirty = craft.fields.filter(f => draft[f.key] !== undefined && Number(draft[f.key]) !== craft.now[f.key]);
  const groups = [...new Set(craft.fields.map(f => f.group))];
  return (
    <div className="decor-costs">
      <h3>🍎 열매나무 · 🔨 제작대</h3>
      <p className="muted">레시피의 열매는 아이가 고른 한 종류로 세요. 철·반짝돌은 공부로만 생겨요(철 = 트레이너 훈련 주 정산 때 우편함, 반짝돌 = 이틀 뒤 복습 문제 첫 시도 정답). 열매 보유 상한(종류마다)은 위 &ldquo;성장 규칙&rdquo;에서 바꿔요.</p>
      {groups.map(g => <div key={g}><b>{g}</b><div className="chance-grid">
        {craft.fields.filter(f => f.group === g).map(f => (
          <label key={f.key}>
            <span>{f.label} <small className="muted">(기본 {craft.defaults[f.key]})</small></span>
            <span className="chance-input"><input type="number" min={f.min} max={f.max} value={draft[f.key] ?? String(craft.now[f.key])} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} /></span>
          </label>
        ))}
      </div></div>)}
      <div className="button-row">
        <button className="primary small" disabled={busy || dirty.length === 0} onClick={async () => {
          for (const f of dirty) { if (!(await call({ action: 'setCraftRule', key: f.key, value: Number(draft[f.key]) }))) return; }
          setDraft({}); await reload();
        }}>숫자 저장</button>
        <button className="secondary small" disabled={busy || Object.keys(craft.overrides).length === 0} onClick={async () => {
          if (!window.confirm('열매나무·제작대 규칙을 처음 값으로 되돌릴까요?')) return;
          if (await call({ action: 'resetCraftRules' })) { setDraft({}); await reload(); }
        }}>처음 값으로</button>
      </div>
    </div>
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
      <b>🍎 열매나무 · 🔨 제작대 시험</b>
      <p className="muted">열매나무는 미션 전엔 안 열리고 하루 한 번, &ldquo;다음 날로&rdquo;면 다시 열려요. 철은 개발 탭 &ldquo;📅 집 공부 시험&rdquo;의 지난주 채우기(5 → 철 2, 3½ → 철 1) 뒤 마을 우편함으로 와요.</p>
      <div className="button-row">
        <button className="secondary small" disabled={busy} onClick={() => void run('berries')}>열매 종류마다 +20</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('berry99')}>{POTIONS.apple.label} 상한까지</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('stone')}>돌멩이 +10</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('study')}>철 +2 · 반짝돌 +1</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('reviewDue')}>맞힌 문제 2개를 오늘 복습으로(반짝돌 확인)</button>
        <button className="secondary small" disabled={busy} onClick={() => void run('dexFull')}>보통~희귀 포켓몬 도감 다 채우기(볼 대체 확인)</button>
      </div>
    </div>
  );
}
