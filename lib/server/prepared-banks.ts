// 미리 만들어 둔 연습 문제은행 (data/banks/*.csv). 보호자 공간의 "연습 문제은행 불러오기"로 검토 중 상태로 들어갑니다.
// 같은 이름의 문제은행이 이미 있으면 건너뜁니다. CSV 는 빌드 때 글자 그대로 묶입니다 (?raw).
import bank1 from '../../data/banks/bank1.csv?raw';
import bank2 from '../../data/banks/bank2.csv?raw';
import bank3 from '../../data/banks/bank3.csv?raw';
import { parseCsv, rowsToQuestions } from '../question-import.ts';
import { addQuestions, createBank, getGrade, listBanks } from './store.ts';

export const PREPARED_BANKS = [
  { title: '연습 문제은행 1 (초1)', csv: bank1 },
  { title: '연습 문제은행 2 (초1)', csv: bank2 },
  { title: '연습 문제은행 3 (초1)', csv: bank3 },
];

/** 아직 없는 연습 문제은행을 만들어 넣고, 새로 만든 이름 목록을 돌려줍니다. */
export async function importPreparedBanks(): Promise<string[]> {
  const existing = new Set((await listBanks()).map(b => b.title));
  const grade = await getGrade();
  const added: string[] = [];
  for (const bank of PREPARED_BANKS) {
    if (existing.has(bank.title)) continue;
    const { questions, issues } = rowsToQuestions(parseCsv(bank.csv));
    if (issues.length) console.error(`[연습 문제은행] ${bank.title}: 형식이 틀린 줄 ${issues.length}개`, issues.slice(0, 5));
    const id = await createBank(bank.title, grade, {});
    await addQuestions(id, questions);
    added.push(bank.title);
  }
  return added;
}
