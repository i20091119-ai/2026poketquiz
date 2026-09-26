import { generateQuestions, isAiConfigured } from '@/lib/ai-generator';
import { GRADES, SUBJECTS, type Subject } from '@/lib/game-config';
import { normalizeQuestion, parseCsv, rowsToQuestions, sheetCsvUrls, type QuestionInput } from '@/lib/question-import';
import { checkPassword, isParent, loginCookie, logoutCookie, passwordConfigured } from '@/lib/server/parent-auth';
import {
  activeBank, addQuestions, bankQuestions, createBank, deleteBank, deleteQuestion, getBank, getGrade, json,
  listBanks, publishBank, readState, resetGame, setGrade, updateBank, updateQuestion,
} from '@/lib/server/store';
import { env } from 'cloudflare:workers';

export const dynamic = 'force-dynamic';

const MAX_IMPORT = 1000;
class ParentError extends Error {}

async function overview() {
  const [grade, banks, bank, { state }] = await Promise.all([getGrade(), listBanks(), activeBank(), readState()]);
  const progress = bank ? state.banks[bank.id] : undefined;
  const solved = new Set(progress?.solved ?? []);
  const wrong = progress?.wrong ?? {};
  return {
    grade, grades: GRADES, aiConfigured: isAiConfigured(env),
    banks,
    child: {
      exp: state.exp, stats: state.stats, owned: state.owned.length, dex: state.dex.length,
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
    return json({ loggedIn: true, ...(await overview()) });
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
