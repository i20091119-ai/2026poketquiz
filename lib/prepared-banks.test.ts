import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SUBJECT_AREAS, SUBJECTS, SUBJECT_TYPES } from './game-config.ts';
import { parseCsv, rowsToQuestions } from './question-import.ts';

// 미리 만들어 둔 연습 문제은행(data/banks/bank1~3.csv)이 형식에 맞고 서로 겹치지 않는지
test('연습 문제은행 3개: 형식 오류 없음, 과목당 24문제, 영역 있음, 문제 문장 겹치지 않음', () => {
  const seen = new Set<string>();
  for (const n of [1, 2, 3]) {
    const { questions, issues } = rowsToQuestions(parseCsv(readFileSync(new URL(`../data/banks/bank${n}.csv`, import.meta.url), 'utf8')));
    assert.deepEqual(issues, [], `bank${n} 형식 오류`);
    assert.equal(questions.length, 144, `bank${n} 문제 수`);
    for (const s of SUBJECTS) {
      const qs = questions.filter(q => q.subject === s);
      assert.equal(qs.length, 24, `bank${n} ${s} 문제 수`);
      // 속성은 과목 속성 3개에 고르게
      for (const t of SUBJECT_TYPES[s]) assert.ok(qs.filter(q => q.type === t).length >= 6, `bank${n} ${s} 속성 ${t} 부족`);
      assert.equal(new Set(qs.map(q => q.area)).size, SUBJECT_AREAS[s].length, `bank${n} ${s} 영역이 모두 들어 있음`);
    }
    for (const q of questions) {
      assert.ok((SUBJECT_AREAS[q.subject] as readonly string[]).includes(q.area), `확정 영역이 아님: [${q.subject}] ${q.area} — ${q.prompt}`);
      assert.ok(q.explanation.length > 0, `해설 없음: ${q.prompt}`);
      assert.ok(!seen.has(q.subject + q.prompt), `문제 문장 겹침: ${q.prompt}`);
      seen.add(q.subject + q.prompt);
      // 정답 보기가 해설에 등장하지 않아도 되지만, 정답 보기가 다른 보기와 같으면 안 됨
      assert.equal(q.choices.filter(c => c === q.choices[q.answer]).length, 1);
    }
    // 정답 위치가 한 번호에 몰리지 않음
    for (let a = 0; a < 5; a++) assert.ok(questions.filter(q => q.answer === a).length >= 20, `bank${n} 정답 ${a + 1}번 분포`);
  }
});
