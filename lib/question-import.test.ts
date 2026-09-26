import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiRequestText, parseCsv, rowsToQuestions, sheetCsvUrls } from './question-import.ts';

test('구글 시트 링크 → CSV 주소 후보', () => {
  assert.deepEqual(sheetCsvUrls('https://docs.google.com/spreadsheets/d/abc_123-X/edit?usp=sharing#gid=456'), {
    urls: [
      'https://docs.google.com/spreadsheets/d/abc_123-X/export?format=csv&gid=456',
      'https://docs.google.com/spreadsheets/d/abc_123-X/gviz/tq?tqx=out:csv&gid=456',
    ],
    excel: false,
  });
  // 탭 번호가 없으면 지정하지 않음 (첫 탭)
  assert.deepEqual(sheetCsvUrls('https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing').urls, [
    'https://docs.google.com/spreadsheets/d/abc/export?format=csv',
    'https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv',
  ]);
  assert.equal(sheetCsvUrls('https://docs.google.com/spreadsheets/d/abc/edit?usp=sharing&ouid=1&rtpof=true&sd=true').excel, true);
  assert.deepEqual(sheetCsvUrls('https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pubhtml?gid=9').urls,
    ['https://docs.google.com/spreadsheets/d/e/2PACX-xyz/pub?output=csv&gid=9']);
  assert.throws(() => sheetCsvUrls('https://example.com/sheet'));
});

test('CSV: 따옴표와 줄바꿈이 들어간 칸', () => {
  assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n"여러\n줄",2,3\n'), [['a', 'b,c', 'd "e"'], ['여러\n줄', '2', '3']]);
});

test('구글 시트에서 복사해 붙여 넣은 내용(탭 구분)도 읽는다', () => {
  const pasted = '과목\t문제\t보기1\t보기2\t보기3\t보기4\t보기5\t정답\t해설\t속성\n상식\t해가 뜨는 곳은?\t동쪽\t서쪽\t남쪽\t북쪽\t위쪽\t1\t동쪽, 아침에 떠요.\t땅\n';
  const { questions, issues } = rowsToQuestions(parseCsv(pasted));
  assert.equal(issues.length, 0);
  assert.equal(questions[0].explanation, '동쪽, 아침에 떠요.'); // 칸 안의 쉼표는 그대로
});

test('시트 행 → 문제 (제목 줄, 과목 별칭, 정답 번호, 속성 자동)', () => {
  const csv = [
    '과목,문제,보기1,보기2,보기3,보기4,보기5,정답,해설,속성',
    '과학,해가 뜨는 방향은?,동쪽,서쪽,남쪽,북쪽,위쪽,1,해는 동쪽에서 떠요.,땅',
    '수학,2+2=?,1,2,3,4,5,4,,',
    '국어,빈칸,가,가,다,라,마,1,,',
    '체육,달리기?,a,b,c,d,e,1,,',
  ].join('\n');
  const { questions, issues } = rowsToQuestions(parseCsv(csv));
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0], { subject: '상식', prompt: '해가 뜨는 방향은?', choices: ['동쪽', '서쪽', '남쪽', '북쪽', '위쪽'], answer: 0, explanation: '해는 동쪽에서 떠요.', type: 'ground' });
  assert.equal(questions[1].answer, 3);
  assert.ok(['electric', 'steel', 'rock'].includes(questions[1].type));
  assert.deepEqual(issues.map(i => i.row), [4, 5]);
});

test('AI 요청문에 열 순서가 들어간다', () => {
  const text = aiRequestText('초1', { 수학: '덧셈' }, 100);
  assert.match(text, /과목,문제,보기1,보기2,보기3,보기4,보기5,정답,해설,속성/);
  assert.match(text, /수학: 덧셈/);
});
