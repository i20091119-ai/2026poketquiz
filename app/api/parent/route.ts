import { generateQuestions, isAiConfigured } from '@/lib/ai-generator';
import { normalizeRules, parseHm } from '@/lib/battle-rest';
import { BATTLE_LIMIT_OPTIONS, BATTLE_PASSWORD_MIN, BALLS, GIFT_SIZES, GRADES, SHINY_CHANCE_BALLS, SHINY_CHANCE_DEFAULT, SUBJECTS, TYPE_INFO, type GiftLimits, type Subject, type TypeKey } from '@/lib/game-config';
import { defaultStrong, defaultThird, isSpecies, isStrong, isValidThird, setStrongOverrides, species, subjectOf, thirdTypeOf } from '@/lib/pokedex';
import { activityList, areaReport, battleLogList, eventsReport, simGiveBalls, simGiveShinies, simSetStreak, battleStartsLeft, battleTickets, candySummary, GameError, giftCounts, giftList, initialState, markRepliesSeen, sendGift, shiftDate, todayKorea, unseenReplies, type GiftInput } from '@/lib/game-engine';
import { battleGate } from '@/lib/server/battle-gate';
import { importPreparedBanks, PREPARED_BANKS } from '@/lib/server/prepared-banks';
import { normalizeQuestion, parseCsv, rowsToQuestions, sheetCsvUrls, type QuestionInput } from '@/lib/question-import';
import { hashBattlePassword } from '@/lib/server/battle-auth';
import { checkPassword, isParent, loginCookie, logoutCookie, passwordConfigured } from '@/lib/server/parent-auth';
import { isSimulating, playerOf, simClock, simStartCookie, simStopCookie } from '@/lib/server/player';
import {
  activeBank, addQuestions, getBattlePasswordHash, setBattlePasswordHash, bankQuestions, createBank, deleteBank, deleteQuestion, getBank, getGrade,
  getBattleEvolutionAllowed, getBattleLimitMinutes, getBattleRest, getGiftLimits, getRestOpenDate, getSimDayOffset, json, listBanks, mutateState, overwriteState, publishBank, readState, resetGame,
  setBattleEvolutionAllowed, setBattleLimitMinutes, setBattleRest, setGiftLimits, setGrade, setRestOpenDate, setSimClock, setSimDayOffset, SIM_PLAYER, updateBank, updateQuestion,
  getStrongOverrides, loadStrongOverrides, saveStrongOverrides,
  getShinyChance, getSimShinyAll, setShinyChance, setSimShinyAll,
} from '@/lib/server/store';
import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

const MAX_IMPORT = 1000;
class ParentError extends Error {}

/** 개발자 메뉴의 시뮬레이션 상태: 이 브라우저가 시뮬레이션 중인지, 시험용 기록의 오늘과 요약 */
async function simulationInfo(request: Request) {
  const [active, { today, dayOffset, clock, simTime }, { state }] = await Promise.all([isSimulating(request), simClock(), readState(SIM_PLAYER)]);
  const day = state.battleLog?.[today];
  return {
    active, today, dayOffset,
    /** 시뮬레이션의 지금 시각 'HH:MM' (정해 둔 값이 없으면 진짜 시각) 과 직접 정했는지 */
    clock: `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`, clockFixed: simTime !== null,
    summary: {
      partner: state.owned.find(p => p.uid === state.partner)?.species ?? null,
      exp: state.exp, owned: state.owned.length,
      dailyDone: !!state.daily && state.daily.date === today && state.daily.correct.length + state.daily.wrong.length >= state.daily.questionIds.length && state.daily.questionIds.length > 0,
      battleLeft: battleStartsLeft(state, today),
      battleWave: day?.maxWave ?? 0, battleMinutes: day ? Math.round(day.seconds / 60) : 0,
    },
  };
}

async function overview(request: Request) {
  // 시뮬레이션 중인 브라우저에서는 아이 현황·영역·활동도 시험용 기록 기준으로 보여 줍니다 (진짜 기록은 그대로).
  const player = await playerOf(request);
  const [grade, banks, bank, { state }, battleHash, sim, battleLimit, battleEvolution, giftLimits, restRules, restOpen, strong, shinyChance, simShinyAll] = await Promise.all([
    getGrade(), listBanks(), activeBank(), readState(player.id), getBattlePasswordHash(), simulationInfo(request), getBattleLimitMinutes(), getBattleEvolutionAllowed(), getGiftLimits(), getBattleRest(), getRestOpenDate(), loadStrongOverrides(), getShinyChance(), getSimShinyAll(),
  ]);
  const today = player.today;
  const gate = await battleGate(player, state);
  const progress = bank ? state.banks[bank.id] : undefined;
  const solved = new Set(progress?.solved ?? []);
  const wrong = progress?.wrong ?? {};
  return {
    grade, grades: GRADES, aiConfigured: isAiConfigured(env),
    battlePasswordSet: !!battleHash,
    battle: {
      log: battleLogList(state), leftToday: battleStartsLeft(state, today), tickets: battleTickets(state), candy: candySummary(state, today), limit: battleLimit, limitOptions: BATTLE_LIMIT_OPTIONS, evolution: battleEvolution,
      /** 쉬는 시간 규칙, 오늘만 열어 주기 여부, 지금 막혀 있는지 */
      rest: { rules: restRules, openToday: restOpen === today, now: { blocked: gate.rest.blocked, name: gate.rest.name, until: gate.rest.until }, timeUp: gate.timeUp },
    },
    /** 도전 이벤트 진행 상황과 부활권 */
    events: eventsReport(state, bank, today),
    /** 보호자 "속성 변경"에서 바꾼 센 포켓몬·도전 속성 */
    strong,
    /** 볼별 이로치 확률(%), 기본값, 시뮬레이션 100% 여부 */
    shiny: {
      chance: shinyChance, defaults: SHINY_CHANCE_DEFAULT, simAll: simShinyAll,
      balls: SHINY_CHANCE_BALLS.map(k => ({ kind: k, label: BALLS[k].label })),
    },
    /** 보호자 선물: 기록(최근 것부터), 오늘·이번 주 보낸 수, 한도, 아직 안 본 답장 수 */
    gifts: { list: giftList(state), counts: giftCounts(state, today), limits: giftLimits, newReplies: unseenReplies(state), today },
    /** 최근 4주 날짜별 활동 (퀴즈 시간·푼 문제·포켓로그 시간) — 주간 그래프용 */
    activity: activityList(state, today, 28),
    /** 준비된 연습 문제은행 중 아직 안 불러온 것 */
    preparedBanks: PREPARED_BANKS.map(b => b.title).filter(t => !banks.some(x => x.title === t)),
    sim,
    banks,
    child: {
      exp: state.exp, expSpent: state.expSpent ?? 0, stats: state.stats, owned: state.owned.length, dex: state.dex.length,
      partner: state.owned.find(p => p.uid === state.partner)?.species ?? null,
    },
    active: bank && {
      id: bank.id, title: bank.title,
      subjects: SUBJECTS.map(s => {
        const qs = bank.questions.filter(q => q.subject === s);
        return { subject: s, total: qs.length, solved: qs.filter(q => solved.has(q.id)).length, review: qs.filter(q => progress?.review?.[q.id]).length };
      }),
      hardest: bank.questions.filter(q => wrong[q.id]).sort((a, b) => wrong[b.id] - wrong[a.id]).slice(0, 10)
        .map(q => ({ id: q.id, subject: q.subject, prompt: q.prompt, wrong: wrong[q.id], solved: solved.has(q.id) })),
      /** 과목별 영역 성적 (약점 영역, 반복 오답 포함) */
      areas: areaReport(state, bank),
    },
  };
}

/** 구글 시트를 CSV로 읽어 옵니다. 주소 후보를 차례로 시도하고, 실패하면 이유를 쉬운 말로 알려 줍니다. */
async function fetchSheet(link: string): Promise<string> {
  let target: ReturnType<typeof sheetCsvUrls>;
  try { target = sheetCsvUrls(link); } catch (e) { throw new ParentError((e as Error).message); }
  const tried: string[] = [];
  let needLogin = false, notFound = false, offline = false;
  for (const url of target.urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const type = res.headers.get('content-type') ?? '';
      const body = await res.text();
      const looksCsv = res.ok && !type.includes('text/html') && !/^\s*<(!doctype|html)/i.test(body);
      if (looksCsv) return body;
      tried.push(`${url} → ${res.status} ${type} (최종 주소: ${res.url})`);
      if (/accounts\.google\.com|ServiceLogin/i.test(res.url + body.slice(0, 3000))) needLogin = true;
      if (res.status === 404) notFound = true;
    } catch (error) {
      offline = true;
      tried.push(`${url} → 접속 실패: ${(error as Error).message}`);
    }
  }
  // 터미널에 자세한 내용을 남겨 두면 문제를 찾을 때 도움이 됩니다.
  console.error('[구글 시트 가져오기 실패]\n' + tried.join('\n'));
  if (target.excel) throw new ParentError("엑셀 파일(.xlsx)을 드라이브에서 연 시트라서 읽을 수 없어요. 시트 위쪽 메뉴에서 '파일 → Google Sheets로 저장'을 누른 뒤, 새로 열린 시트의 링크를 넣어 주세요.");
  if (offline) throw new ParentError('구글에 접속하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
  if (needLogin) throw new ParentError("구글 시트를 볼 권한이 없어요. 시트 오른쪽 위 '공유' → 일반 액세스를 '링크가 있는 모든 사용자'로 바꾼 뒤, 다시 '링크 복사'해서 넣어 주세요.");
  if (notFound) throw new ParentError('시트를 찾을 수 없어요. 링크를 끝까지 빠짐없이 복사했는지 확인해 주세요.');
  throw new ParentError('구글 시트를 읽지 못했어요. 링크를 다시 복사해서 넣어 보고, 그래도 안 되면 "링크가 안 되면: 시트 내용을 통째로 복사해서 붙여 넣기"를 눌러 주세요.');
}

async function loadSheet(body: { sheetUrl?: string; csv?: string }) {
  const text = body.sheetUrl ? await fetchSheet(body.sheetUrl) : body.csv ?? '';
  if (!text.trim()) throw new ParentError('구글 시트 링크를 넣거나 시트 내용을 붙여 넣어 주세요.');
  if (text.length > 2_000_000) throw new ParentError('시트가 너무 커요. 나눠서 올려 주세요.');
  const { questions, issues } = rowsToQuestions(parseCsv(text));
  if (questions.length > MAX_IMPORT) throw new ParentError(`한 번에 ${MAX_IMPORT}문제까지 올릴 수 있어요.`);
  return { questions, issues };
}

async function editableBank(id: unknown) {
  const bank = await getBank(Number(id));
  if (!bank) throw new ParentError('문제은행을 찾을 수 없어요.');
  return bank;
}

export async function GET(request: Request) {
  try {
    if (!(await isParent(request))) return json({ loggedIn: false, passwordConfigured: passwordConfigured() });
    const bankId = Number(new URL(request.url).searchParams.get('bank'));
    if (bankId) {
      const bank = await editableBank(bankId);
      return json({ loggedIn: true, bank: { ...bank, keywords: JSON.parse(bank.keywords) }, questions: await bankQuestions(bankId) });
    }
    return json({ loggedIn: true, ...(await overview(request)) });
  } catch (error) {
    if (error instanceof ParentError) return json({ error: error.message }, 400);
    console.error('부모 화면 읽기 실패', error);
    return json({ error: '정보를 불러오지 못했어요.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: '페이지에서 다시 시도해 주세요.' }, 403);
    const text = await request.text();
    if (text.length > 2_100_000) return json({ error: '요청 내용이 너무 길어요.' }, 400);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return json({ error: '요청을 읽지 못했어요.' }, 400); }

    if (body.action === 'login') {
      if (!(await checkPassword(String(body.password ?? '')))) {
        await new Promise(r => setTimeout(r, 1000)); // 무작정 대입을 늦춥니다.
        return json({ error: '비밀번호가 맞지 않아요.' }, 401);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': await loginCookie(request) } });
    }
    if (body.action === 'logout') {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': logoutCookie() } });
    }
    if (!(await isParent(request))) return json({ error: '부모 로그인이 필요해요.' }, 401);

    switch (body.action) {
      case 'setGrade':
        await setGrade(String(body.grade));
        return json({ message: '학년을 저장했어요.' });

      case 'setBattlePassword': {
        const password = String(body.password ?? '').trim();
        if (password.length < BATTLE_PASSWORD_MIN) throw new ParentError(`포켓로그 비밀번호는 ${BATTLE_PASSWORD_MIN}자 이상으로 정해 주세요.`);
        await setBattlePasswordHash(await hashBattlePassword(password));
        return json({ message: '포켓로그 비밀번호를 저장했어요. 가족 기기에서 한 번씩 넣어 주면 돼요.' });
      }
      case 'clearBattlePassword':
        await setBattlePasswordHash(null);
        return json({ message: '포켓로그 비밀번호를 지웠어요. 다시 정하기 전까지 포켓로그는 열리지 않아요.' });

      case 'setBattleLimit': {
        const minutes = Number(body.minutes);
        if (!(BATTLE_LIMIT_OPTIONS as readonly number[]).includes(minutes)) throw new ParentError('시간 제한 값을 다시 골라 주세요.');
        await setBattleLimitMinutes(minutes);
        return json({ message: minutes ? `포켓로그 하루 시간 제한을 ${minutes}분으로 정했어요. 다 쓰면 게임 화면에 안내가 뜨고 퀴즈로 돌아가요.` : '포켓로그 시간 제한을 없앴어요.' });
      }

      case 'setBattleEvolution': {
        const allowed = body.allowed === true;
        await setBattleEvolutionAllowed(allowed);
        return json({ message: allowed ? '배틀 중 진화를 허용했어요. 게임에는 1분 안에 반영돼요.' : '배틀 중 진화를 막았어요. 레벨이 올라도 진화하지 않고, 진화 아이템도 보상에 나오지 않아요.' });
      }

      // ---- 속성 변경 (센 포켓몬·도전 속성) ----
      case 'setStrongPokemon': {
        const id = Number(body.id);
        const s = isSpecies(id) ? species(id) : null;
        if (!s || s.from === null) throw new ParentError('진화해서 나오는 포켓몬만 바꿀 수 있어요.');
        const ov = await getStrongOverrides();
        const strong = body.strong === true ? true : body.strong === false ? false : null;
        if (strong === null || strong === defaultStrong(id)) delete ov.strong[id]; else ov.strong[id] = strong;
        await saveStrongOverrides(ov);
        setStrongOverrides(ov);
        return json({ message: `${s.name}: ${isStrong(id) ? '센 포켓몬으로 정했어요. 진화에 스탯이 더 많이 들어요.' : '보통 포켓몬으로 정했어요.'}` });
      }
      case 'setThirdType': {
        const id = Number(body.id);
        const s = isSpecies(id) ? species(id) : null;
        if (!s || s.from === null) throw new ParentError('진화해서 나오는 포켓몬만 바꿀 수 있어요.');
        const type = body.type === null || body.type === undefined ? null : String(body.type) as TypeKey | '';
        if (type && !isValidThird(id, type)) throw new ParentError('도전 속성은 원래 두 속성과 다른 과목의 속성만 고를 수 있어요.');
        const ov = await getStrongOverrides();
        if (type === null || type === defaultThird(id)) delete ov.third[id]; else ov.third[id] = type;
        await saveStrongOverrides(ov);
        setStrongOverrides(ov);
        const t = thirdTypeOf(id);
        return json({ message: `${s.name}: ${t ? `도전 속성을 ${TYPE_INFO[t].label}(${subjectOf(t)})로 정했어요.` : '도전 속성을 없앴어요.'}` });
      }
      case 'resetStrong': {
        await saveStrongOverrides({ strong: {}, third: {} });
        setStrongOverrides(null);
        return json({ message: '센 포켓몬과 도전 속성을 처음 값으로 되돌렸어요.' });
      }

      // ---- 이로치 확률 (개발자 메뉴) ----
      case 'setShinyChance': {
        const kind = String(body.ball);
        if (!(SHINY_CHANCE_BALLS as string[]).includes(kind)) throw new ParentError('볼 종류를 다시 골라 주세요.');
        const percent = Number(body.percent);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new ParentError('확률은 0~100 사이로 넣어 주세요.');
        const cur = await getShinyChance();
        await setShinyChance({ ...cur, [kind]: percent });
        return json({ message: `${BALLS[kind as keyof typeof BALLS].label}에서 이로치가 나올 확률을 ${percent}%로 정했어요.` });
      }
      case 'resetShinyChance':
        await setShinyChance(null);
        return json({ message: '이로치 확률을 처음 값으로 되돌렸어요.' });

      // ---- 보호자 선물 ----
      case 'sendGift': {
        // 시뮬레이션 중인 브라우저에서 보내면 시험용 기록으로만 갑니다 (playerOf)
        const player = await playerOf(request);
        const [limits] = await Promise.all([getGiftLimits()]);
        const input: GiftInput = { from: body.from as GiftInput['from'], reason: String(body.reason ?? ''), size: body.size as GiftInput['size'], letter: String(body.letter ?? '') };
        const now = new Date().toISOString();
        const { result } = await mutateState(state => {
          try { return { result: sendGift(state, input, player.today, now, limits), changed: true }; } catch (e) { if (e instanceof GameError) throw new ParentError(e.message); throw e; }
        }, player.id);
        return json({ message: `${GIFT_SIZES[result.size].label}을 보냈어요. 아이가 앱을 열면 팝업으로 알려 줘요.${player.sim ? ' (시뮬레이션: 시험용 기록에만 감)' : ''}`, gift: result.id });
      }
      case 'setGiftLimits': {
        const num = (v: unknown, name: string) => { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 20) throw new ParentError(`${name} 한도는 0~20 사이 숫자로 적어 주세요.`); return n; };
        const limits: GiftLimits = { small: num(body.small, '작은 선물'), medium: num(body.medium, '보통 선물'), large: num(body.large, '큰 선물') };
        await setGiftLimits(limits);
        return json({ message: `선물 한도를 저장했어요. 작은 하루 ${limits.small}개 · 보통 하루 ${limits.medium}개 · 큰 일주일 ${limits.large}개.` });
      }
      case 'markRepliesSeen': {
        const player = await playerOf(request);
        const { result } = await mutateState(state => { const n = markRepliesSeen(state); return { result: n, changed: n > 0 }; }, player.id);
        return json({ message: result ? `답장 ${result}개를 확인했어요.` : '새 답장이 없어요.' });
      }

      // ---- 포켓로그 쉬는 시간 ----
      case 'setBattleRest': {
        let rules;
        try { rules = normalizeRules(body.rules); } catch (e) { throw new ParentError((e as Error).message); }
        await setBattleRest(rules);
        return json({ message: rules.length ? `쉬는 시간 ${rules.length}개를 저장했어요.` : '쉬는 시간을 모두 지웠어요. 언제든 배틀할 수 있어요.' });
      }
      case 'restOpenToday': {
        const player = await playerOf(request);
        const open = body.open !== false;
        await setRestOpenDate(open ? player.today : null);
        return json({ message: open ? `오늘(${player.today})만 쉬는 시간 없이 열어 줬어요. 자정이 지나면 저절로 원래대로 돌아가요.` : '오늘만 열어 주기를 껐어요. 쉬는 시간 규칙이 다시 적용돼요.' });
      }

      case 'importPreparedBanks': {
        const added = await importPreparedBanks();
        return json({ message: added.length ? `연습 문제은행 ${added.length}개(${added.join(', ')})를 불러왔어요. 검토한 뒤 '아이에게 공개'를 눌러 주세요.` : '준비된 연습 문제은행은 이미 모두 불러왔어요.' });
      }

      case 'createBank': {
        const grade = String(body.grade ?? await getGrade());
        if (!(GRADES as readonly string[]).includes(grade)) throw new ParentError('학년을 다시 골라 주세요.');
        const keywords = (body.keywords ?? {}) as Partial<Record<Subject, string>>;
        const sheet = body.sheetUrl || body.csv ? await loadSheet(body as { sheetUrl?: string; csv?: string }) : null;
        const bankId = await createBank(String(body.title ?? ''), grade, keywords);
        if (sheet) await addQuestions(bankId, sheet.questions);
        const message = !sheet ? '빈 문제은행을 만들었어요. 아래에서 문제를 채워 주세요.'
          : sheet.questions.length ? `문제은행을 만들고 시트에서 ${sheet.questions.length}문제를 가져왔어요. 확인 후 '아이에게 공개'를 눌러 주세요.`
          : '문제은행은 만들었지만 가져온 문제가 없어요. 아래 안내를 확인해 주세요.';
        return json({ bankId, imported: sheet?.questions.length ?? 0, issues: sheet?.issues ?? [], message });
      }

      case 'updateBank': {
        const bank = await editableBank(body.bankId);
        const grade = String(body.grade ?? bank.grade);
        if (!(GRADES as readonly string[]).includes(grade)) throw new ParentError('학년을 다시 골라 주세요.');
        await updateBank(bank.id, String(body.title ?? bank.title), grade, (body.keywords ?? {}) as Partial<Record<Subject, string>>);
        return json({ message: '문제은행 정보를 저장했어요.' });
      }

      case 'importQuestions': {
        const bank = await editableBank(body.bankId);
        const sheet = await loadSheet(body as { sheetUrl?: string; csv?: string });
        await addQuestions(bank.id, sheet.questions);
        return json({ imported: sheet.questions.length, issues: sheet.issues, message: `${sheet.questions.length}문제를 추가했어요.` });
      }

      case 'generate': {
        const bank = await editableBank(body.bankId);
        const subject = body.subject as Subject;
        if (!SUBJECTS.includes(subject)) throw new ParentError('과목을 다시 골라 주세요.');
        const keywords = JSON.parse(bank.keywords)[subject] ?? '';
        if (!keywords) throw new ParentError(`${subject} 키워드를 먼저 적어 주세요.`);
        const count = Math.min(100, Math.max(1, Number(body.count) || 100));
        const generated = await generateQuestions(env, { grade: bank.grade, subject, keywords, count });
        const questions: QuestionInput[] = [];
        for (const q of generated) { try { questions.push(normalizeQuestion({ ...q, subject })); } catch { /* 형식이 틀린 문제는 버립니다 */ } }
        await addQuestions(bank.id, questions);
        return json({ imported: questions.length, message: `${subject} ${questions.length}문제를 만들었어요.` });
      }

      case 'publish': {
        const bank = await editableBank(body.bankId);
        const count = (await bankQuestions(bank.id)).length;
        if (!count) throw new ParentError('문제가 없는 문제은행은 공개할 수 없어요.');
        await publishBank(bank.id);
        return json({ message: `'${bank.title}'을 아이에게 공개했어요.` });
      }

      case 'deleteBank': {
        const bank = await editableBank(body.bankId);
        if (bank.status === 'published') throw new ParentError('지금 공개 중인 문제은행은 지울 수 없어요. 다른 은행을 먼저 공개해 주세요.');
        await deleteBank(bank.id);
        return json({ message: '문제은행을 지웠어요.' });
      }

      case 'updateQuestion': {
        const q = body.question as Parameters<typeof normalizeQuestion>[0];
        let clean: QuestionInput;
        try { clean = normalizeQuestion(q); } catch (e) { throw new ParentError((e as Error).message); }
        await updateQuestion(Number(body.id), clean);
        return json({ message: '문제를 저장했어요.' });
      }

      case 'resetChild':
        await resetGame();
        return json({ message: '아이 게임을 처음부터 다시 시작하도록 초기화했어요. 아이 화면에서 파트너를 새로 고르면 돼요.' });

      // ---- 개발자 메뉴: 시뮬레이션 (아이의 진짜 기록은 절대 건드리지 않고 sim 기록만 씀) ----
      case 'simStart': {
        const copy = body.source === 'copy';
        const state = copy ? (await readState()).state : initialState();
        await overwriteState(SIM_PLAYER, state);
        await setSimDayOffset(0);
        await setSimClock(null);
        const message = copy ? '지금 아이 기록을 시험용으로 복사했어요. 이 브라우저의 아이 화면과 포켓로그는 시험용 기록을 써요.'
          : '빈 시험용 기록으로 시작해요. 이 브라우저의 아이 화면과 포켓로그는 시험용 기록을 써요.';
        return new Response(JSON.stringify({ ok: true, message }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': await simStartCookie(request) },
        });
      }
      case 'simNextDay': {
        if (!(await isSimulating(request))) throw new ParentError('시뮬레이션을 먼저 시작해 주세요.');
        const days = (await getSimDayOffset()) + 1;
        await setSimDayOffset(days);
        return json({ message: `시험용 기록의 날짜를 ${shiftDate(todayKorea(), days)}(으)로 넘겼어요. 아이 화면을 새로고침하면 일일미션과 새 게임 횟수가 새 날 기준이 돼요.` });
      }
      case 'simSetClock': {
        // 시뮬레이션의 "지금 시각"을 정합니다 (쉬는 시간 막힘 확인용). 비우면 진짜 시각으로 돌아감
        if (!(await isSimulating(request))) throw new ParentError('시뮬레이션을 먼저 시작해 주세요.');
        const text = String(body.clock ?? '').trim();
        if (text && parseHm(text) === null) throw new ParentError('시각은 07:30 처럼 적어 주세요.');
        await setSimClock(text || null);
        return json({ message: text ? `시험용 기록의 지금 시각을 ${text}(으)로 정했어요. 아이 화면·포켓로그의 쉬는 시간 판단에 이 시각을 써요.` : '시험용 기록의 시각을 진짜 시각으로 되돌렸어요.' });
      }
      // 시뮬레이션 전용 도우미 (시험용 기록에만)
      case 'simGiveRevive': {
        if (!(await isSimulating(request))) throw new ParentError('시뮬레이션을 먼저 시작해 주세요.');
        await mutateState(state => { state.reviveTickets = (state.reviveTickets ?? 0) + 1; return { result: null, changed: true }; }, SIM_PLAYER);
        return json({ message: '시험용 기록에 부활권 1장을 넣었어요.' });
      }
      case 'simShinyAll': {
        await setSimShinyAll(body.on === true);
        return json({ message: body.on === true ? '시뮬레이션에서는 볼을 열면 이로치가 100% 나와요. (진짜 기록에는 영향 없어요)' : '시뮬레이션의 이로치 확률을 보통으로 되돌렸어요.' });
      }
      case 'simGiveBalls': {
        if (!(await isSimulating(request))) throw new ParentError('시뮬레이션을 먼저 시작해 주세요.');
        const { result } = await mutateState(state => ({ result: simGiveBalls(state), changed: true }), SIM_PLAYER);
        return json({ message: `시험용 기록에 볼 ${result}종(이로치 볼 포함)을 1개씩 넣었어요.` });
      }
      case 'simGiveShinies': {
        if (!(await isSimulating(request))) throw new ParentError('시뮬레이션을 먼저 시작해 주세요.');
        const { result } = await mutateState(state => { const n = simGiveShinies(state, new Date().toISOString()); return { result: n, changed: n > 0 }; }, SIM_PLAYER);
        return json({ message: result ? `시험용 기록의 포켓몬 ${result}마리에게 이로치를 하나씩 넣었어요. 포켓로그 팀 선택 화면에서 기본·이로치가 따로 보이는지 확인해 보세요.` : '이미 모든 포켓몬이 이로치도 갖고 있어요.' });
      }
      case 'simStreak': {
        if (!(await isSimulating(request))) throw new ParentError('시뮬레이션을 먼저 시작해 주세요.');
        const { today } = await simClock();
        const days = Math.max(0, Math.min(9, Number(body.days) || 0));
        const { result } = await mutateState(state => { const ok = simSetStreak(state, today, days); return { result: ok, changed: ok }; }, SIM_PLAYER);
        if (!result) throw new ParentError('시험용 기록에서 "일일미션 10일 연속" 이벤트를 먼저 수락해 주세요.');
        return json({ message: `연속 기록을 어제까지 ${days}일로 맞췄어요. 오늘 일일미션을 다 풀면 ${days + 1}일째가 돼요.` });
      }
      case 'simStop':
        await setSimClock(null);
        return new Response(JSON.stringify({ ok: true, message: '시뮬레이션을 끝냈어요. 이 브라우저의 아이 화면은 다시 진짜 기록을 보여 줘요.' }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': simStopCookie() },
        });

      case 'deleteQuestion':
        await deleteQuestion(Number(body.id));
        return json({ message: '문제를 지웠어요.' });

      default:
        return json({ error: '지원하지 않는 요청이에요.' }, 400);
    }
  } catch (error) {
    if (error instanceof ParentError) return json({ error: error.message }, 400);
    const message = (error as Error).message;
    console.error('부모 요청 실패', error);
    return json({ error: message || '요청을 처리하지 못했어요.' }, 500);
  }
}
