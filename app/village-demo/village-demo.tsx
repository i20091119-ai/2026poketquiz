"use client";
// 시험용 포켓몬 마을 (/village-demo, 2026-11-13 부모님 요청: "시험용 마을 들어간 상태의 창").
// 서버에 아무것도 보내지 않고 이 화면 안에서만 진짜 게임 규칙(lib/game-engine.ts)을 돌려요.
// 아이의 진짜 기록·미리보기 기록 어디에도 저장되지 않고, 새로고침하면 처음 상태로 돌아가요.
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { VillageScreen } from '@/components/game/village';
import { BallDialog, type CatchResult, type QueuedBall } from '@/components/game/rewards';
import { applyAction, childView, initialState, secureRandom, syncVillage, todayKorea, type Action, type GameState } from '@/lib/game-engine';

const shiftDay = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 오늘 미션을 다 끝낸 시험용 기록: 나오하 파트너 + 뜨아거·피카츄 친구, 재료 넉넉히, 서식지 2개(손님이 와 있음), 꾸미기 몇 개 */
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
    mats: { leaf: 12, drop: 12, petal: 12, twig: 12, stone: 12, mud: 12 },
    items: { bush: 1, puddle: 2, flowers: 1 },
    // 꾸미기: 가방에 몇 개 + 이미 놓은 울타리·꽃·벤치
    decorBag: { flower: 3, fence: 3, bench: 1, pot: 1, lily: 1, rock: 1, pondTile: 3, pathTile: 4, stoneTile: 4 },
    // 땅 바꾸기: 돌길 몇 칸 + 연못 칸 (원래 연못에 붙여서)
    terrain: [{ x: 3, y: 9, ground: 'stone' }, { x: 3, y: 10, ground: 'stone' }, { x: 4, y: 10, ground: 'stone' }, { x: 4, y: 16, ground: 'water' }],
    decor: [
      { item: 'fence', kind: 'fenceT', x: 7, y: 15 }, { item: 'fence', kind: 'fenceT', x: 8, y: 15 }, { item: 'fence', kind: 'fenceT', x: 9, y: 15 },
      { item: 'flower', kind: 'flowerPink', x: 8, y: 16 }, { item: 'flower', kind: 'flowerYellow', x: 9, y: 16 },
      { item: 'bench', kind: 'bench', x: 8, y: 11 },
    ],
    cells: ['bush', 'bush', 'puddle', 'puddle', 'flowers', 'flowers', 'flowers', 'flowers', 'bush', 'bush', 'bush', 'bush'],
    habitats: [{ kind: 'shore', since: yesterday }, { kind: 'garden', since: yesterday }, { kind: 'green', since: yesterday }],
    picked: [],
    // 열매나무·제작대 (2026-11-14): 첫 나무(파트너 계열) + 불꽃열매 나무, 묘목 1, 철·반짝돌, 우편함 택배, 만든 볼 하나
    trees: [{ spot: 0, berry: 'apple', since: yesterday }, { spot: 1, berry: 'fire', since: yesterday }],
    saplings: 1,
    study: { iron: 2, sparkle: 1 },
    mail: [{ id: 'k1', kind: 'iron', amount: 1, week: yesterday, at: now }],
    craftedBalls: [{ id: 'c1', kind: 'poke', made: yesterday }],
  } as unknown as GameState['village'];
  // 열매: 사과열매 32 · 불꽃열매 99(가득) · 별빛열매 40 · 얼음열매 12
  const berries = { apple: 32, fire: 99, star: 40, blue: 12 } as const;
  state.potions = Object.entries(berries).flatMap(([kind, n]) => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i}`, kind: kind as keyof typeof berries })));
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
  const [ball, setBall] = useState<QueuedBall | null>(null);

  return (
    <>
      <div className="village-demo-band" role="note">🧪 시험용 마을이에요. 여기서 한 것은 저장되지 않아요 (새로고침하면 처음으로).</div>
      {notice && <div className="village-demo-band warn" role="status">{notice}</div>}
      <VillageScreen open view={view} busy={busy} act={act} onClose={() => router.push('/')} onSeconds={noop}
        onOpenBall={b => setBall({ id: b.id, kind: b.kind, crafted: true })} />
      <BallDialog key={ball?.id ?? 'none'} ball={ball} busy={busy} onOpen={b => act<CatchResult>({ type: 'openCraftedBall', id: b.id })} onClose={() => setBall(null)} />
    </>
  );
}
