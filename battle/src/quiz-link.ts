/*
 * 퀴즈 앱(포켓몬 배움 탐험대) 연동.
 * 퀴즈에서 얻은 포켓몬만 스타터로 쓸 수 있게, 퀴즈 앱 서버에서 보유 포켓몬 목록을 받아 옵니다.
 * (SPEC.md 1번)
 */
import { getSessionDataLocalStorageKey } from "#app/account";
import { defaultStarterSpecies } from "#app/constants";
import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { QUIZ_RULES } from "#app/quiz-rules";
import { bypassLogin } from "#constants/app-constants";
import type { PokemonSpecies } from "#data/pokemon-species";
import type { SpeciesId } from "#enums/species-id";
import type { StarterSpeciesId } from "#types/starter-species-id";
import { decrypt, encrypt } from "#utils/data";

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

// ---- 판 안 진화 허용 (보호자 공간 스위치, 기본 꺼짐) ----
const EVOLUTION_KEY = "quizEvolutionAllowed";
const quizOptions = { evolutionAllowed: localStorage.getItem(EVOLUTION_KEY) === "1" };

/** 보호자가 "배틀 중 진화 허용"을 켰는지. 서버 응답을 못 받으면 마지막으로 받아 둔 값(처음엔 꺼짐). */
export function isBattleEvolutionAllowed(): boolean {
  return QUIZ_RULES.evolutionSwitch ? quizOptions.evolutionAllowed : true;
}
function noteEvolutionSetting(value: unknown): void {
  if (typeof value !== "boolean") {
    return;
  }
  quizOptions.evolutionAllowed = value;
  localStorage.setItem(EVOLUTION_KEY, value ? "1" : "0");
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
    const body = (await res.json()) as {
      left?: number;
      message?: string | null;
      timeUp?: boolean;
      blocked?: boolean;
      rest?: RestInfo;
      evolution?: boolean;
    };
    noteEvolutionSetting(body.evolution);
    if (body.blocked || body.timeUp) {
      // 하루 시간 제한을 다 썼거나 쉬는 시간: 새 게임도 이어하기도 안 됨 → 화면을 덮고 퀴즈로
      showTimeUpOverlay(body.message ?? TIME_UP_FALLBACK, body.rest?.blocked ? "🌙 지금은 쉬는 시간!" : undefined);
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

// ---- 하루 플레이 시간 제한 · 쉬는 시간 (보호자 공간에서 정함) ----
const TIME_UP_FALLBACK = "오늘 포켓로그 시간을 다 썼어요. 내일 또 하자!";
let timeUpShown = false;

/** 서버가 알려 주는 쉬는 시간 상태 */
interface RestInfo {
  blocked: boolean;
  name: string | null;
  until: string | null;
  message: string | null;
  soon: { name: string; inMinutes: number; at: string } | null;
}

/**
 * 시간을 다 썼거나 쉬는 시간일 때 게임 화면을 가리는 안내판. 게임은 멈추지 않지만 만질 수 없고, 버튼을 누르면 퀴즈 앱으로 돌아갑니다.
 * (진행 중인 판은 게임이 웨이브마다 저장해 두므로 다음에 이어서 할 수 있어요.)
 */
export function showTimeUpOverlay(message: string, heading = "⏰ 오늘은 여기까지!"): void {
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
  title.textContent = heading;
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

/** 화면 위쪽에 잠깐 보이는 안내 띠 (쉬는 시간 10분 전 등). 같은 글은 한 번만. */
const toastShown = new Set<string>();
export function showQuizToast(text: string, ms = 9000): void {
  if (toastShown.has(text)) {
    return;
  }
  toastShown.add(text);
  const bar = document.createElement("div");
  bar.textContent = text;
  bar.style.cssText =
    "position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483645;background:#6d28d9;color:#fff;font-family:system-ui,sans-serif;font-weight:800;font-size:15px;padding:10px 18px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.35);max-width:92vw;text-align:center";
  const add = () => {
    document.body.append(bar);
    setTimeout(() => bar.remove(), ms);
  };
  if (document.body) {
    add();
  } else {
    document.addEventListener("DOMContentLoaded", add);
  }
}

/** 쉬는 시간(또는 시간 제한)이 되어 "이번 전투가 끝나면 저장하고 나가야" 하는 상태 */
let quitAfterBattle = false;
/** 진행 보고 응답의 시간 제한·쉬는 시간 상태를 처리합니다. */
function handleGateReport(data: {
  blocked?: boolean;
  timeUp?: boolean;
  message?: string | null;
  rest?: RestInfo | null;
}): void {
  const rest = data.rest ?? null;
  if (data.blocked || data.timeUp) {
    if (!quitAfterBattle) {
      quitAfterBattle = true;
      showQuizToast(`${data.message ?? TIME_UP_FALLBACK} 이번 전투가 끝나면 저장하고 퀴즈로 돌아갈게.`, 12000);
    }
    return;
  }
  if (rest?.soon) {
    showQuizToast(
      `⏰ ${rest.soon.inMinutes}분 뒤(${rest.soon.at})부터 ${rest.soon.name}이야. 그때는 전투를 마치고 저장할게.`,
    );
  }
}
/** 전투가 끝나 다음 웨이브로 넘어갈 때 부릅니다. 나가야 하면 저장하고 퀴즈 앱으로. */
function quitIfNeeded(): void {
  if (!quitAfterBattle) {
    return;
  }
  quitAfterBattle = false;
  const leave = () => window.location.assign("/");
  try {
    globalScene.gameData.saveAll(true, true, true, true).then(leave, leave);
  } catch {
    leave();
  }
}

// ---- 부활권 · 게임 오버 판 서버에 올리기 (도전 이벤트 "전 과목 올클리어" 보상) ----
export const QUIZ_RUNS_URL = "/api/battle/runs";
export const QUIZ_REVIVE_URL = "/api/battle/revive";
const RUNS_UPLOADED_KEY = "quizRunsUploaded";

interface SavedPokemonLike {
  hp: number;
  stats?: number[];
  status?: unknown;
}
/** 판 저장의 파티 전원(기절한 포켓몬 포함)과 상대의 체력을 가득 채우고 상태 이상을 없앱니다. */
export function healSessionData(data: { party?: SavedPokemonLike[]; enemyParty?: SavedPokemonLike[] }): void {
  for (const p of [...(data.party ?? []), ...(data.enemyParty ?? [])]) {
    const max = p.stats?.[0];
    if (typeof max === "number" && max > 0) {
      p.hp = max;
    }
    p.status = null;
  }
}

function uploadedRunIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(RUNS_UPLOADED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
async function uploadRuns(runs: { id: string; wave: number; victory: boolean; data: string }[]): Promise<void> {
  if (runs.length === 0) {
    return;
  }
  try {
    const res = await fetch(QUIZ_RUNS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runs }),
      keepalive: false,
    });
    if (res.ok) {
      const ids = uploadedRunIds();
      for (const r of runs) {
        ids.add(r.id);
      }
      localStorage.setItem(RUNS_UPLOADED_KEY, JSON.stringify([...ids].slice(-100)));
    }
  } catch (err) {
    console.warn("판 기록을 퀴즈 앱에 올리지 못했어요 (다음에 게임을 열 때 다시 올려요):", err);
  }
}

/** 기기에 있는 원본 "플레이 기록"(runHistoryData_Guest) 중 아직 안 올린 판을 퀴즈 앱 서버에 올립니다. 게임을 열 때 한 번. */
export async function syncQuizRunHistory(): Promise<void> {
  const raw = localStorage.getItem("runHistoryData_Guest");
  if (!raw) {
    return;
  }
  let history: Record<string, { entry: { waveIndex?: number; timestamp?: number }; isVictory: boolean }>;
  try {
    history = JSON.parse(decrypt(raw, bypassLogin));
  } catch {
    return;
  }
  const done = uploadedRunIds();
  const runs = Object.entries(history)
    .filter(([id]) => !done.has(id))
    .map(([id, h]) => ({
      id,
      wave: Number(h.entry?.waveIndex) || 1,
      victory: !!h.isVictory,
      data: JSON.stringify(h.entry),
    }));
  // 한 번에 너무 크지 않게 5판씩
  for (let i = 0; i < runs.length; i += 5) {
    await uploadRuns(runs.slice(i, i + 5));
  }
}

/** 게임 오버(또는 클리어) 때 그 판을 바로 올립니다. */
export function reportQuizRun(entry: { waveIndex: number; timestamp: number }, isVictory: boolean): void {
  void uploadRuns([
    { id: String(entry.timestamp), wave: entry.waveIndex, victory: isVictory, data: JSON.stringify(entry) },
  ]);
}

/** 이 슬롯의 웨이브 시작 저장을 체력 가득 채운 상태로 바꿉니다. 저장이 없으면 false */
function healSavedSlot(slotId: number): boolean {
  const key = getSessionDataLocalStorageKey(slotId);
  const raw = localStorage.getItem(key);
  if (!raw) {
    return false;
  }
  try {
    const data = JSON.parse(decrypt(raw, bypassLogin));
    healSessionData(data);
    localStorage.setItem(key, encrypt(JSON.stringify(data), bypassLogin));
    return true;
  } catch {
    return false;
  }
}

/** 부활권을 쓸지 묻는 창. 쓰면 true */
function askRevive(tickets: number): Promise<boolean> {
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(20,24,32,.75);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif";
    const box = document.createElement("div");
    box.style.cssText =
      "background:#fff;color:#1f2d27;border-radius:20px;padding:22px 20px 18px;max-width:340px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35)";
    box.innerHTML = `<div style="font-size:44px;line-height:1">💖</div>
      <div style="font-size:19px;font-weight:800;margin:6px 0 8px">부활권을 쓸까?</div>
      <p style="font-size:14px;line-height:1.5;color:#4a5d51;margin:0 0 16px">내 포켓몬이 모두 체력을 가득 채우고 이 웨이브를 다시 싸워!<br>남은 부활권 <b>${tickets}장</b></p>`;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px";
    const no = document.createElement("button");
    no.textContent = "안 쓸래";
    no.style.cssText =
      "flex:1;border:1px solid #cbd8c3;background:#fff;color:#1f2d27;border-radius:14px;padding:13px;font-size:16px;font-weight:700";
    const yes = document.createElement("button");
    yes.textContent = "쓸래!";
    yes.style.cssText =
      "flex:1;border:0;background:#e5484d;color:#fff;border-radius:14px;padding:13px;font-size:16px;font-weight:800";
    const done = (v: boolean) => {
      wrap.remove();
      resolve(v);
    };
    no.onclick = () => done(false);
    yes.onclick = () => done(true);
    row.append(no, yes);
    box.append(row);
    wrap.append(box);
    for (const type of ["pointerdown", "touchstart", "keydown"]) {
      wrap.addEventListener(type, e => e.stopPropagation());
    }
    document.body.append(wrap);
  });
}

/**
 * 게임 오버 화면: 부활권이 있으면 쓸지 묻고, 쓰면 서버에서 1장을 빼고 웨이브 시작 저장을 체력 가득 채운 상태로 바꿉니다.
 * true 면 게임이 그 웨이브를 다시 시작하면 됩니다(원본 "다시 도전"과 같은 방식).
 */
export async function offerQuizRevive(slotId: number): Promise<boolean> {
  if (!QUIZ_RULES.reviveTickets || !localStorage.getItem(getSessionDataLocalStorageKey(slotId))) {
    return false;
  }
  try {
    const info = (await (await fetch(QUIZ_REVIVE_URL, { cache: "no-store" })).json()) as {
      tickets?: number;
      blocked?: boolean;
    };
    if (!info.tickets || info.blocked || !(await askRevive(info.tickets))) {
      return false;
    }
    const res = (await (
      await fetch(QUIZ_REVIVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "gameover" }),
      })
    ).json()) as { ok?: boolean; message?: string };
    if (!res.ok) {
      showQuizToast(res.message ?? "부활권을 쓰지 못했어.");
      return false;
    }
    return healSavedSlot(slotId);
  } catch (err) {
    console.warn("부활권 확인 실패:", err);
    return false;
  }
}

/** 배틀 탭에서 되살린 판으로 들어왔으면 "계속하기"를 누르라고 알려 줍니다. */
export function noteRevivedRun(): void {
  if (localStorage.getItem("quizRevived")) {
    localStorage.removeItem("quizRevived");
    showQuizToast("💖 부활권으로 판을 되살렸어! '계속하기'를 누르면 그 웨이브부터 다시 시작해.", 12000);
  }
}

// ---- ✕ 버튼: 언제든 게임을 멈추고 퀴즈로 (부모님 결정) ----
/** 저장하고 퀴즈 앱으로. 전투 중이면 원본 "저장 후 나가기"와 같은 방식(이번 웨이브 시작 지점으로 저장) */
function saveAndLeave(): void {
  const leave = () => window.location.assign("/");
  setTimeout(leave, 5000); // 저장이 오래 걸려도 5초 뒤에는 나감
  try {
    if (globalScene?.currentBattle) {
      globalScene.gameData.saveAll(true, true, true, true).then(leave, leave);
      return;
    }
  } catch {
    // 저장에 실패해도 나감 (웨이브마다 자동 저장되어 있음)
  }
  leave();
}

/** "그만할까?" 확인 창. 아이가 실수로 눌러도 한 번 더 물어봅니다. */
function confirmExit(): void {
  if (document.getElementById("quiz-exit-confirm")) {
    return;
  }
  const wrap = document.createElement("div");
  wrap.id = "quiz-exit-confirm";
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(20,24,32,.75);display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif";
  const box = document.createElement("div");
  box.style.cssText =
    "background:#fff;color:#1f2d27;border-radius:20px;padding:22px 20px 18px;max-width:340px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.35)";
  const title = document.createElement("div");
  title.textContent = "게임을 그만하고 퀴즈로 돌아갈까?";
  title.style.cssText = "font-size:19px;font-weight:800;margin-bottom:8px";
  const text = document.createElement("p");
  text.textContent = "저장하고 나갈게. 다음에 '계속하기'를 누르면 이번 웨이브 처음부터 이어서 할 수 있어.";
  text.style.cssText = "font-size:14px;line-height:1.5;color:#4a5d51;margin:0 0 16px";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px";
  const stay = document.createElement("button");
  stay.textContent = "계속하기";
  stay.style.cssText =
    "flex:1;border:1px solid #cbd8c3;background:#fff;color:#1f2d27;border-radius:14px;padding:13px;font-size:16px;font-weight:700";
  const quit = document.createElement("button");
  quit.textContent = "그만하기";
  quit.style.cssText =
    "flex:1;border:0;background:#17674e;color:#fff;border-radius:14px;padding:13px;font-size:16px;font-weight:800";
  stay.onclick = () => wrap.remove();
  quit.onclick = () => {
    quit.textContent = "저장하는 중…";
    quit.disabled = true;
    stay.disabled = true;
    saveAndLeave();
  };
  row.append(stay, quit);
  box.append(title, text, row);
  wrap.append(box);
  // 게임이 터치·키 입력을 가로채지 않도록 확인 창 안의 입력은 여기서 멈춤
  for (const type of ["pointerdown", "touchstart", "keydown"]) {
    wrap.addEventListener(type, e => e.stopPropagation());
  }
  document.body.append(wrap);
}

/** 게임 화면 오른쪽 위에 늘 떠 있는 ✕ 버튼 */
export function showExitButton(): void {
  if (!QUIZ_RULES.exitButton) {
    return;
  }
  const add = () => {
    if (document.getElementById("quiz-exit-button")) {
      return;
    }
    const btn = document.createElement("button");
    btn.id = "quiz-exit-button";
    btn.type = "button";
    btn.setAttribute("aria-label", "게임 그만하기");
    btn.textContent = "✕";
    btn.style.cssText =
      "position:fixed;top:calc(env(safe-area-inset-top, 0px) + 8px);right:calc(env(safe-area-inset-right, 0px) + 8px);z-index:2147483600;width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(20,24,32,.6);color:#fff;font-size:20px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;touch-action:manipulation";
    for (const type of ["pointerdown", "touchstart"]) {
      btn.addEventListener(type, e => e.stopPropagation());
    }
    btn.addEventListener("click", e => {
      e.stopPropagation();
      confirmExit();
    });
    document.body.append(btn);
  };
  if (document.body) {
    add();
  } else {
    document.addEventListener("DOMContentLoaded", add);
  }
}

// ---- 가로 화면 ----
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

const LANDSCAPE_OVERLAY_ID = "quiz-landscape-overlay";
/** "그냥 세로로 할래"를 누르면 이번에 켠 동안은 다시 묻지 않음 */
let landscapeDismissed = false;

const isPortrait = () => window.innerHeight > window.innerWidth;
const isTouchPhone = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;

/** 전체 화면으로 바꾼 뒤 가로로 고정. 사용자가 누른 순간에 불러야 휴대폰이 허락합니다. */
async function goLandscape(): Promise<boolean> {
  const orientation = screen.orientation as LockableOrientation | undefined;
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
    await orientation?.lock?.("landscape");
    return true;
  } catch (err) {
    console.warn("가로 화면으로 바꾸지 못했어요:", err);
    return false;
  }
}

function hideLandscapeOverlay(): void {
  document.getElementById(LANDSCAPE_OVERLAY_ID)?.remove();
}

/** 세로 화면일 때 게임 위에 띄우는 "가로로 크게 보기" 안내 */
function showLandscapeOverlay(): void {
  if (landscapeDismissed || document.getElementById(LANDSCAPE_OVERLAY_ID) || !document.body) {
    return;
  }
  const wrap = document.createElement("div");
  wrap.id = LANDSCAPE_OVERLAY_ID;
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:2147483500;background:rgba(10,14,24,.82);display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif";
  const box = document.createElement("div");
  box.style.cssText =
    "background:#fff;border-radius:20px;padding:24px 20px;max-width:320px;width:100%;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.4)";
  const icon = document.createElement("div");
  icon.textContent = "📱↻";
  icon.style.cssText = "font-size:44px;margin-bottom:8px";
  const title = document.createElement("div");
  title.textContent = "가로로 크게 보자!";
  title.style.cssText = "font-size:22px;font-weight:800;color:#17202a;margin-bottom:6px";
  const text = document.createElement("div");
  text.textContent = "버튼을 누르고 휴대폰을 옆으로 눕혀 줘.";
  text.style.cssText = "font-size:16px;color:#444;margin-bottom:18px";
  const go = document.createElement("button");
  go.type = "button";
  go.textContent = "가로로 크게 보기";
  go.style.cssText =
    "display:block;width:100%;padding:16px;border:0;border-radius:14px;background:#17674e;color:#fff;font-size:20px;font-weight:800;margin-bottom:10px;touch-action:manipulation";
  const stay = document.createElement("button");
  stay.type = "button";
  stay.textContent = "그냥 세로로 할래";
  stay.style.cssText =
    "display:block;width:100%;padding:10px;border:0;background:none;color:#666;font-size:15px;text-decoration:underline;touch-action:manipulation";
  go.addEventListener("click", async e => {
    e.stopPropagation();
    const ok = await goLandscape();
    if (ok) {
      hideLandscapeOverlay();
    } else {
      text.textContent = "휴대폰을 옆으로 눕혀 줘. 그래도 안 돌아가면 엄마 아빠에게 알려 줘!";
    }
  });
  stay.addEventListener("click", e => {
    e.stopPropagation();
    landscapeDismissed = true;
    hideLandscapeOverlay();
  });
  box.append(icon, title, text, go, stay);
  wrap.append(box);
  // 게임이 터치를 가로채지 않도록 안내 창 안의 입력은 여기서 멈춤
  for (const type of ["pointerdown", "pointerup", "touchstart", "touchend", "keydown"]) {
    wrap.addEventListener(type, e => e.stopPropagation());
  }
  document.body.append(wrap);
}

function checkLandscape(): void {
  if (isPortrait()) {
    showLandscapeOverlay();
  } else {
    hideLandscapeOverlay();
  }
}

/**
 * 휴대폰에서 게임 화면을 가로로 크게 보여 줍니다 (부모님 요청).
 * 먼저 조용히 가로 고정을 시도하고(설치한 앱은 되는 휴대폰도 있음), 그래도 세로면 "가로로 크게 보기" 버튼을 띄웁니다.
 * 그 버튼을 누르는 순간 전체 화면 + 가로 고정을 해서, 휴대폰 "자동 회전"이 꺼져 있어도 가로가 됩니다.
 */
export function lockLandscape(): void {
  if (!QUIZ_RULES.landscapeInApp || !isTouchPhone()) {
    return;
  }
  const orientation = screen.orientation as LockableOrientation | undefined;
  orientation?.lock?.("landscape").catch(() => {
    /* 전체 화면이 아니면 거절하는 휴대폰이 많음 → 안내 버튼으로 */
  });
  const start = () => {
    // 가로 고정이 되면 잠깐 뒤 화면 크기가 바뀌므로 조금 기다렸다 확인
    setTimeout(checkLandscape, 600);
    window.addEventListener("resize", () => setTimeout(checkLandscape, 300));
    document.addEventListener("fullscreenchange", () => setTimeout(checkLandscape, 300));
  };
  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
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

// ---- 이벤트 이로치 → 퀴즈 도감 (SPEC 3번) ----
export const QUIZ_SHINY_URL = "/api/battle/shiny";
const SHINY_PENDING_KEY = "quizShinyPending";

function pendingShinies(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SHINY_PENDING_KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}

/** 아직 퀴즈 앱에 알리지 못한 이로치를 보냅니다. 성공하면 목록을 비웁니다. */
export async function flushQuizShinies(): Promise<void> {
  const ids = pendingShinies();
  if (ids.length === 0) {
    return;
  }
  try {
    const res = await fetch(QUIZ_SHINY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ species: ids }),
    });
    if (res.ok) {
      localStorage.removeItem(SHINY_PENDING_KEY);
    } else {
      console.warn("이로치를 퀴즈 도감에 알리지 못했어요:", res.status);
    }
  } catch (err) {
    console.warn("이로치를 퀴즈 도감에 알리지 못했어요:", err);
  }
}

/** 이벤트에서 이로치를 받으면 퀴즈 도감에도 남기도록 알립니다 (실패하면 기기에 적어 두고 다음에 다시 보냄). */
export function reportQuizShiny(speciesId: number): void {
  const ids = pendingShinies();
  if (!ids.includes(speciesId)) {
    ids.push(speciesId);
  }
  localStorage.setItem(SHINY_PENDING_KEY, JSON.stringify(ids.slice(-50)));
  flushQuizShinies().catch(() => {});
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
      .then(
        (
          data: {
            blocked?: boolean;
            timeUp?: boolean;
            message?: string | null;
            rest?: RestInfo | null;
            evolution?: boolean;
          } | null,
        ) => {
          if (!data) {
            return;
          }
          noteEvolutionSetting(data.evolution);
          handleGateReport(data); // 시간 제한·쉬는 시간: 미리 알림, 또는 이번 전투 뒤 저장하고 나가기
        },
      )
      .catch(() => {});
  };

  setInterval(() => {
    if (document.visibilityState !== "visible") {
      lastTick = Date.now(); // 보이지 않는 동안은 세지 않음
      return;
    }
    send();
  }, REPORT_EVERY_MS);
  // 웨이브가 바뀌면 바로 알림 (최고 웨이브가 늦게 잡히지 않게). 나가야 하는 상태면 전투가 끝난 이 시점에 저장하고 나감
  setInterval(() => {
    if (document.visibilityState === "visible" && currentWave() > lastWave) {
      quitIfNeeded();
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
