"use client";
// 시험용 포켓몬 마을 (/village-demo, 2026-11-13 부모님 요청: "시험용 마을 들어간 상태의 창").
// 서버에 아무것도 보내지 않고 이 화면 안에서만 진짜 게임 규칙(lib/game-engine.ts)을 돌려요.
// 아이의 진짜 기록·미리보기 기록 어디에도 저장되지 않고, 새로고침하면 처음 상태로 돌아가요.
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { VillageScreen } from '@/components/game/village';
import { applyAction, childView, initialState, secureRandom, syncVillage, todayKorea, type Action, type GameState } from '@/lib/game-engine';

const shiftDay = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 오늘 미션을 다 끝낸 시험용 기록: 나오하 파트너 + 뜨아거·피카츄 친구, 재료 조금, 서식지 2개(손님이 와 있음) */
function demoState(today: string): GameState {
  const now = new Date().toISOString();
  const state = initialState();
  state.owned = [
    { uid: 'p1', species: 906, obtainedAt: now },
    { uid: 'p2', species: 909, obtainedAt: now },
    { uid: 'p3', species: 25, obtainedAt: now },
  ];
  state.partner = 'p1';
  state.team = ['p2', 'p3'];
  state.daily = { date: today, bankId: 0, questionIds: [1], correct: [1], wrong: [], tries: {}, box: null, claimed: true };
  const yesterday = shiftDay(today, -1);
  state.village = {
    mats: { leaf: 6, drop: 6, petal: 4, twig: 2 },
    items: { bush: 1, puddle: 2, flowers: 1 },
    cells: ['bush', 'bush', 'puddle', 'puddle', 'flowers', 'flowers', 'flowers', 'flowers', null, null, null, null],
    habitats: [{ kind: 'shore', since: yesterday }, { kind: 'garden', since: yesterday }, null],
    picked: [],
  } as unknown as GameState['village'];
  syncVillage(state, today, secureRandom); // 어제 완성된 서식지 → 오늘 손님
  return state;
}

export default function VillageDemo() {
  const [today] = useState(todayKorea);
  const [state] = useState(() => demoState(today));
  const [view, setView] = useState(() => childView(state, null, today));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const router = useRouter();

  const act = useCallback(async <T,>(action: Action): Promise<T | null> => {
    setBusy(true);
    try {
      const ctx = { bank: null, today, now: new Date().toISOString(), random: secureRandom };
      const result = applyAction(state, action, ctx) as T;
      syncVillage(state, today, secureRandom);
      setView(childView(state, null, today));
      setNotice('');
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [state, today]);
  const noop = useCallback(() => undefined, []);

  return (
    <>
      <div className="village-demo-band" role="note">🧪 시험용 마을이에요. 여기서 한 것은 저장되지 않아요 (새로고침하면 처음으로).</div>
      {notice && <div className="village-demo-band warn" role="status">{notice}</div>}
      <VillageScreen open view={view} busy={busy} act={act} onClose={() => router.push('/')} onSeconds={noop} />
    </>
  );
}
