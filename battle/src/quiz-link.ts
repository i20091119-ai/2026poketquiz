/*
 * 퀴즈 앱(포켓몬 배움 탐험대) 연동.
 * 퀴즈에서 얻은 포켓몬만 스타터로 쓸 수 있게, 퀴즈 앱 서버에서 보유 포켓몬 목록을 받아 옵니다.
 * (SPEC.md 1번)
 */
import { defaultStarterSpecies } from "#app/constants";
import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { QUIZ_RULES } from "#app/quiz-rules";
import type { PokemonSpecies } from "#data/pokemon-species";
import type { SpeciesId } from "#enums/species-id";
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

/** 진화 단계 깊이 (스타터 0, 1단계 진화 1, …) */
function evolutionDepth(speciesId: SpeciesId): number {
  let depth = 0;
  let current: SpeciesId | null = speciesId;
  while (current != null && depth < 5) {
    const prev = speciesDataRegistry.getSpeciesData(current).prevolution;
    if (prev == null) {
      break;
    }
    current = prev;
    depth++;
  }
  return depth;
}

/**
 * 고른 스타터로 실제 출전할 종. 퀴즈에서 그 스타터 계열의 진화형을 갖고 있으면 가장 많이 진화한 모습을 돌려줍니다.
 * (부모님 결정: 진화한 포켓몬은 진화한 모습으로, 레벨은 시작 레벨 그대로)
 */
export function quizStartingSpecies(starterId: StarterSpeciesId): PokemonSpecies {
  let best: SpeciesId = starterId;
  let bestDepth = 0;
  if (QUIZ_RULES.startEvolved) {
    for (const id of quizOwnedSpecies) {
      try {
        if (speciesDataRegistry.getStarter(id as SpeciesId) !== starterId) {
          continue;
        }
        const depth = evolutionDepth(id as SpeciesId);
        if (depth > bestDepth) {
          best = id as SpeciesId;
          bestDepth = depth;
        }
      } catch {
        // 포켓로그에 없는 번호는 건너뜀
      }
    }
  }
  return speciesDataRegistry.getSpecies(best);
}

// ---- 하루 시도 횟수 (SPEC 7번) — 퀴즈 앱 서버가 관리합니다 ----
export const QUIZ_BATTLE_URL = "/api/battle";
const OFFLINE_MESSAGE = "퀴즈 앱 서버에 연결되지 않아 새 게임을 시작할 수 없어요. 인터넷을 확인하고 다시 해 주세요.";

export interface BattleStartResult {
  ok: boolean;
  /** 시작할 수 없을 때 아이에게 보여 줄 말 */
  message?: string;
}

/** 오늘 새 게임을 시작할 수 있는지 확인만 합니다 (횟수를 쓰지 않음). */
export async function canStartNewBattle(): Promise<BattleStartResult> {
  try {
    const res = await fetch(QUIZ_BATTLE_URL, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, message: OFFLINE_MESSAGE };
    }
    const body = (await res.json()) as { left?: number; message?: string | null; timeUp?: boolean };
    if (body.timeUp) {
      showTimeUpOverlay(body.message ?? TIME_UP_FALLBACK);
      return { ok: false, message: body.message ?? TIME_UP_FALLBACK };
    }
    return (body.left ?? 0) > 0 ? { ok: true } : { ok: false, message: body.message ?? OFFLINE_MESSAGE };
  } catch (err) {
    console.warn("시도 횟수 확인 실패:", err);
    return { ok: false, message: OFFLINE_MESSAGE };
  }
}

/** 새 게임을 실제로 시작할 때 호출해 횟수 1을 씁니다. 이어하기는 부르지 않습니다. */
export async function consumeNewBattleStart(): Promise<BattleStartResult> {
  try {
    const res = await fetch(QUIZ_BATTLE_URL, { method: "POST", cache: "no-store" });
    if (!res.ok) {
      return { ok: false, message: OFFLINE_MESSAGE };
    }
    const body = (await res.json()) as { ok?: boolean; message?: string | null };
    return body.ok ? { ok: true } : { ok: false, message: body.message ?? OFFLINE_MESSAGE };
  } catch (err) {
    console.warn("시도 횟수 기록 실패:", err);
    return { ok: false, message: OFFLINE_MESSAGE };
  }
}

// ---- 하루 플레이 시간 제한 (보호자 공간에서 정함, 기본 없음) ----
const TIME_UP_FALLBACK = "오늘 포켓로그 시간을 다 썼어요. 내일 또 하자!";
let timeUpShown = false;

/**
 * 시간을 다 썼을 때 게임 화면을 가리는 안내판. 게임은 멈추지 않지만 만질 수 없고, 버튼을 누르면 퀴즈 앱으로 돌아갑니다.
 * (진행 중인 판은 게임이 웨이브마다 저장해 두므로 내일 이어서 할 수 있어요.)
 */
export function showTimeUpOverlay(message: string): void {
  if (timeUpShown) {
    return;
  }
  timeUpShown = true;
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:2147483646;background:rgba(20,24,32,.92);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-family:system-ui,sans-serif;padding:24px";
  const box = document.createElement("div");
  box.style.cssText = "max-width:420px";
  const title = document.createElement("div");
  title.textContent = "⏰ 오늘은 여기까지!";
  title.style.cssText = "font-size:26px;font-weight:800;margin-bottom:12px";
  const text = document.createElement("p");
  text.textContent = message;
  text.style.cssText = "font-size:17px;line-height:1.5;margin:0 0 20px";
  const link = document.createElement("a");
  link.href = "/";
  link.textContent = "퀴즈로 돌아가기";
  link.style.cssText =
    "display:inline-block;background:#2e7d5b;color:#fff;font-weight:800;font-size:18px;padding:14px 26px;border-radius:14px;text-decoration:none";
  box.append(title, text, link);
  wrap.append(box);
  const add = () => document.body.append(wrap);
  if (document.body) {
    add();
  } else {
    document.addEventListener("DOMContentLoaded", add);
  }
}

// ---- 일일미션 사탕 (SPEC 11번) ----
export const QUIZ_CANDY_URL = "/api/battle/candy";
const APPLIED_KEY = "quizCandyApplied";

interface CandyGift {
  id: string;
  date: string;
  /** 퀴즈 도감 번호 (진화형일 수 있음 → 스타터로 바꿈) */
  species: number;
  amount: number;
}

/**
 * 퀴즈 앱에서 아직 안 가져간 사탕 묶음을 받아 스타터에게 넣고 저장한 뒤, 가져갔다고 알립니다.
 * 저장 데이터를 읽은 직후(LoginPhase)에 부릅니다. 알림이 실패해도 같은 묶음을 두 번 넣지 않도록 넣은 묶음 번호를 기기에 적어 둡니다.
 */
async function fetchCandyGifts(): Promise<CandyGift[]> {
  try {
    const res = await fetch(QUIZ_CANDY_URL, { cache: "no-store" });
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as { gifts?: CandyGift[] };
    return Array.isArray(body.gifts) ? body.gifts : [];
  } catch (err) {
    console.warn("퀴즈 앱에서 사탕 목록을 받지 못했어요:", err);
    return [];
  }
}
function appliedCandyIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(APPLIED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export async function applyQuizCandyGifts(): Promise<void> {
  const gifts = await fetchCandyGifts();
  if (gifts.length === 0) {
    return;
  }
  const appliedSet = appliedCandyIds();
  let added = 0;
  for (const gift of gifts) {
    if (appliedSet.has(gift.id) || !(gift.amount > 0)) {
      continue;
    }
    try {
      const starterId = speciesDataRegistry.getStarter(gift.species);
      globalScene.gameData.addStarterCandy(starterId, Math.floor(gift.amount));
      added += gift.amount;
    } catch {
      console.warn("포켓로그에 없는 포켓몬 번호라 사탕을 건너뜁니다:", gift.species);
    }
    appliedSet.add(gift.id);
  }
  if (added > 0) {
    console.log(`퀴즈 일일미션 사탕 ${added}개를 넣었어요`);
    try {
      await globalScene.gameData.saveSystem();
    } catch (err) {
      console.warn("사탕을 넣은 뒤 저장 실패 (다음 저장 때 함께 저장됨):", err);
    }
  }
  // 넣은 묶음 번호는 최근 200개만 기억
  localStorage.setItem(APPLIED_KEY, JSON.stringify([...appliedSet].slice(-200)));
  try {
    const res = await fetch(QUIZ_CANDY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: gifts.map(g => g.id) }),
    });
    if (!res.ok) {
      console.warn("사탕 가져갔다는 알림 실패:", res.status);
    }
  } catch (err) {
    console.warn("사탕 가져갔다는 알림 실패:", err);
  }
}

// ---- 진행 보고 (보호자 화면의 날짜별 기록) ----
export const QUIZ_PROGRESS_URL = "/api/battle/progress";
const REPORT_EVERY_MS = 60_000;

/**
 * 1분마다(그리고 화면을 벗어날 때) "지금 웨이브, 그동안 플레이한 초"를 퀴즈 앱에 보냅니다.
 * 화면이 보이고 판이 진행 중일 때만 시간을 셉니다. 게임 시작 때 한 번 부릅니다.
 */
export function startProgressReporting(): void {
  let lastTick = Date.now();
  let lastWave = 0;

  const currentWave = (): number => {
    try {
      return globalScene?.currentBattle?.waveIndex ?? 0;
    } catch {
      return 0;
    }
  };
  const send = (useBeacon = false) => {
    const now = Date.now();
    const seconds = Math.round((now - lastTick) / 1000);
    lastTick = now;
    const wave = currentWave();
    if (wave <= 0 || seconds <= 0) {
      return;
    }
    lastWave = wave;
    // 파티 포켓몬의 지금 레벨 (퀴즈 도감에 "포켓로그 최고 레벨"로 표시). starter = 진화 전 첫 모습 번호
    let party: { species: number; starter: number; level: number }[] = [];
    try {
      party = globalScene.getPlayerParty().map(p => ({
        species: p.species.speciesId,
        starter: speciesDataRegistry.getStarter(p.species.speciesId),
        level: p.level,
      }));
    } catch {
      party = [];
    }
    const body = JSON.stringify({ wave, seconds, party });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(QUIZ_PROGRESS_URL, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(QUIZ_PROGRESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { timeUp?: boolean; message?: string | null } | null) => {
        if (data?.timeUp) {
          showTimeUpOverlay(data.message ?? TIME_UP_FALLBACK);
        }
      })
      .catch(() => {});
  };

  setInterval(() => {
    if (document.visibilityState !== "visible") {
      lastTick = Date.now(); // 보이지 않는 동안은 세지 않음
      return;
    }
    send();
  }, REPORT_EVERY_MS);
  // 웨이브가 바뀌면 바로 알림 (최고 웨이브가 늦게 잡히지 않게)
  setInterval(() => {
    if (document.visibilityState === "visible" && currentWave() > lastWave) {
      send();
    }
  }, 5_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      send(true);
    } else {
      lastTick = Date.now();
    }
  });
  window.addEventListener("pagehide", () => send(true));
}
