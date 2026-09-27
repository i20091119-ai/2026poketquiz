/*
 * 퀴즈 앱(포켓몬 배움 탐험대) 연동.
 * 퀴즈에서 얻은 포켓몬만 스타터로 쓸 수 있게, 퀴즈 앱 서버에서 보유 포켓몬 목록을 받아 옵니다.
 * (SPEC.md 1번)
 */
import { defaultStarterSpecies } from "#app/constants";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import type { StarterSpeciesId } from "#types/starter-species-id";

/** 퀴즈 앱 서버 주소. 게임이 퀴즈 앱의 /battle/ 아래에서 열리므로 같은 주소를 씁니다. */
export const QUIZ_MY_POKEMON_URL = "/api/my-pokemon";
const CACHE_KEY = "quizOwnedSpecies";

/** 퀴즈 앱에서 받은 보유 포켓몬의 전국도감 번호 (진화형 그대로) */
export const quizOwnedSpecies: number[] = [];

/**
 * 퀴즈 앱에서 보유 포켓몬 목록을 받아 옵니다. 실패하면 마지막으로 받아 둔 목록을 씁니다.
 * 게임 시작 전에 한 번 호출합니다.
 */
export async function loadQuizOwnedSpecies(): Promise<void> {
  let ids: number[] | null = null;
  try {
    const res = await fetch(QUIZ_MY_POKEMON_URL, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { species?: unknown };
      if (Array.isArray(body.species)) {
        ids = body.species.filter((n): n is number => Number.isInteger(n) && n > 0);
        localStorage.setItem(CACHE_KEY, JSON.stringify(ids));
      }
    }
  } catch (err) {
    console.warn("퀴즈 앱에서 보유 포켓몬 목록을 받지 못했어요:", err);
  }
  if (ids == null) {
    try {
      ids = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") as number[];
    } catch {
      ids = [];
    }
  }
  quizOwnedSpecies.splice(0, quizOwnedSpecies.length, ...ids);
}

/**
 * 보유 포켓몬을 포켓로그 스타터(진화 전 첫 모습)로 바꿔 기본 스타터 목록을 채웁니다.
 * 종 데이터가 준비된 뒤(initSpeciesDataRegistry 다음)에 호출해야 합니다.
 */
export function applyQuizStarters(): void {
  const starters = new Set<StarterSpeciesId>();
  for (const id of quizOwnedSpecies) {
    try {
      starters.add(speciesDataRegistry.getStarter(id));
    } catch {
      console.warn("포켓로그에 없는 포켓몬 번호라 건너뜁니다:", id);
    }
  }
  defaultStarterSpecies.splice(0, defaultStarterSpecies.length, ...starters);
  console.log(`퀴즈 앱 보유 포켓몬 ${quizOwnedSpecies.length}마리 → 스타터 ${starters.size}종`);
}
