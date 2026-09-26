// 구글 시트(CSV)로 문제를 가져오고 검증합니다.
import { CHOICE_COUNT, SUBJECTS, SUBJECT_TYPES, TYPE_INFO, TYPE_KEYS, type Subject, type TypeKey } from './game-config.ts';
import type { Question } from './game-engine.ts';

export type QuestionInput = Omit<Question, 'id'>;
export type ImportIssue = { row: number; message: string };

export const SHEET_COLUMNS = ['과목', '문제', ...Array.from({ length: CHOICE_COUNT }, (_, i) => `보기${i + 1}`), '정답', '해설', '속성'];

const SUBJECT_ALIASES: Record<string, Subject> = {
  국어: '국어', 수학: '수학', 산수: '수학', 영어: '영어', English: '영어', english: '영어', 한자: '한자', 역사: '역사',
  상식: '상식', 사회: '상식', 과학: '상식', '사회/과학': '상식', '사회·과학': '상식',
};

/**
 * 구글 시트 링크를 CSV로 내려받을 수 있는 주소 후보들로 바꿉니다. 앞에서부터 차례로 시도합니다.
 * - 링크에 탭 번호(gid)가 없으면 첫 번째 탭을 가져옵니다 (첫 탭 번호가 0이 아닐 수 있어서 지정하지 않음).
 * - 엑셀 파일(.xlsx)을 드라이브에서 연 링크(rtpof=true)는 excel: true 로 알려 줍니다.
 */
export function sheetCsvUrls(link: string): { urls: string[]; excel: boolean } {
  let url: URL;
  try { url = new URL(link.trim()); } catch { throw new Error('구글 시트 링크를 확인해 주세요.'); }
  if (url.hostname !== 'docs.google.com') throw new Error('docs.google.com 의 구글 시트 링크만 사용할 수 있어요.');
  const gid = url.searchParams.get('gid') ?? url.hash.match(/gid=(\d+)/)?.[1] ?? null;
  const excel = url.searchParams.get('rtpof') === 'true';
  // "웹에 게시" 링크: /spreadsheets/d/e/<id>/pub...
  const published = url.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]+)/);
  if (published) {
    const out = new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`);
    out.searchParams.set('output', 'csv');
    if (gid) out.searchParams.set('gid', gid);
    return { urls: [out.toString()], excel };
  }
  const shared = url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)/);
  if (!shared) throw new Error('구글 시트 링크를 확인해 주세요.');
  const base = `https://docs.google.com/spreadsheets/d/${shared[1]}`;
  const tab = gid ? `&gid=${gid}` : '';
  return { urls: [`${base}/export?format=csv${tab}`, `${base}/gviz/tq?tqx=out:csv${tab}`], excel };
}

/**
 * RFC 4180 CSV (따옴표, 줄바꿈 포함 칸 지원).
 * 구글 시트에서 칸을 복사해 붙여 넣은 내용(탭으로 구분)도 읽습니다. 첫 줄에 탭이 있으면 탭으로만 나눕니다.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  const sep = src.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

function hash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}
function toType(value: string, subject: Subject, prompt: string): TypeKey {
  const v = value.trim();
  const found = TYPE_KEYS.find(t => t === v.toLowerCase() || TYPE_INFO[t].label === v);
  const allowed = SUBJECT_TYPES[subject];
  if (found && allowed.includes(found)) return found;
  return allowed[hash(prompt) % allowed.length];
}

/** 문제 하나를 검사하고 정리합니다. 문제가 있으면 오류 메시지를 던집니다. */
export function normalizeQuestion(input: {
  subject: string; prompt: string; choices: string[]; answer: number | string; explanation?: string; type?: string;
}): QuestionInput {
  const subject = SUBJECT_ALIASES[String(input.subject ?? '').trim()];
  if (!subject) throw new Error(`과목은 ${SUBJECTS.join(', ')} 중 하나여야 해요.`);
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt || prompt.length > 500) throw new Error('문제는 1~500자로 적어 주세요.');
  const choices = (input.choices ?? []).map(c => String(c ?? '').trim());
  if (choices.length !== CHOICE_COUNT || choices.some(c => !c || c.length > 150)) throw new Error(`보기 ${CHOICE_COUNT}개를 모두 채워 주세요 (각 150자 이내).`);
  if (new Set(choices).size !== CHOICE_COUNT) throw new Error('보기가 서로 달라야 해요.');
  let answer: number;
  const raw = String(input.answer ?? '').trim();
  if (typeof input.answer === 'number') answer = input.answer;
  else if (/^\d+$/.test(raw)) answer = Number(raw) - 1; // 시트에서는 1~5번
  else answer = choices.indexOf(raw);
  if (!Number.isInteger(answer) || answer < 0 || answer >= CHOICE_COUNT) throw new Error(`정답은 1~${CHOICE_COUNT} 번호나 보기 글자로 적어 주세요.`);
  const explanation = String(input.explanation ?? '').trim();
  if (explanation.length > 600) throw new Error('해설은 600자 이내로 적어 주세요.');
  return { subject, prompt, choices, answer, explanation, type: toType(input.type ?? '', subject, prompt) };
}

/** CSV 행들을 문제로 바꿉니다. 첫 줄이 제목 줄이면 열 이름으로 찾고, 아니면 기본 열 순서를 씁니다. */
export function rowsToQuestions(rows: string[][]) {
  const questions: QuestionInput[] = [];
  const issues: ImportIssue[] = [];
  if (!rows.length) return { questions, issues: [{ row: 0, message: '시트가 비어 있어요.' }] };
  const header = rows[0].map(c => c.trim().replace(/\s/g, ''));
  const hasHeader = header.includes('문제') || header.includes('과목');
  const col = (name: string, fallback: number) => {
    const i = hasHeader ? header.indexOf(name) : -1;
    return i >= 0 ? i : fallback;
  };
  const idx = {
    subject: col('과목', 0), prompt: col('문제', 1),
    choices: Array.from({ length: CHOICE_COUNT }, (_, i) => col(`보기${i + 1}`, 2 + i)),
    answer: col('정답', 2 + CHOICE_COUNT), explanation: col('해설', 3 + CHOICE_COUNT), type: col('속성', 4 + CHOICE_COUNT),
  };
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const rowNumber = i + (hasHeader ? 2 : 1);
    try {
      questions.push(normalizeQuestion({
        subject: r[idx.subject] ?? '', prompt: r[idx.prompt] ?? '', choices: idx.choices.map(c => r[c] ?? ''),
        answer: r[idx.answer] ?? '', explanation: r[idx.explanation] ?? '', type: r[idx.type] ?? '',
      }));
    } catch (e) {
      issues.push({ row: rowNumber, message: (e as Error).message });
    }
  });
  return { questions, issues };
}

/** 부모가 AI 대화창에 붙여 넣어 시트용 문제를 만들 때 쓰는 요청문 */
export function aiRequestText(grade: string, keywords: Partial<Record<Subject, string>>, perSubject: number) {
  const lines = SUBJECTS.filter(s => keywords[s]?.trim()).map(s =>
    `- ${s}: ${keywords[s]!.trim()} (속성은 ${SUBJECT_TYPES[s].map(t => TYPE_INFO[t].label).join('/')} 중 내용과 가장 어울리는 것)`);
  return [
    `${grade} 어린이를 위한 학습 퀴즈를 과목별로 ${perSubject}개씩 만들어 주세요.`,
    '과목과 범위:',
    ...lines,
    '',
    `조건: 보기는 서로 다른 ${CHOICE_COUNT}개, 정답은 1개, 해설은 아이가 이해할 수 있는 짧은 한국어 문장.`,
    '결과는 구글 시트에 붙여 넣을 수 있도록 아래 열 순서의 CSV(쉼표 구분, 첫 줄은 제목)로만 주세요.',
    SHEET_COLUMNS.join(','),
    '정답 열에는 정답 보기의 번호(1~5)를 적어 주세요.',
  ].join('\n');
}
