import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APP_VERSION, UPDATES } from './version.ts';

test('업데이트 내용: 날짜별, 최신이 맨 위, 짧은 줄', () => {
  assert.ok(UPDATES.length > 0);
  assert.equal(UPDATES[0].version, APP_VERSION, '맨 위 날짜에 지금 버전 표시');
  const seen = new Set<string>();
  UPDATES.forEach((day, i) => {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(day.date)), `${day.date} 날짜 형식`);
    assert.ok(!seen.has(day.date), `${day.date} 날짜가 두 번 나옴`);
    seen.add(day.date);
    if (i > 0) assert.ok(day.date < UPDATES[i - 1].date, `${day.date} 는 ${UPDATES[i - 1].date} 보다 과거여야 함`);
    assert.ok(day.items.length >= 1 && day.items.length <= 8, `${day.date} 항목 1~8줄`);
    for (const item of day.items) {
      assert.ok(item.trim().length > 0);
      assert.ok([...item].length <= 70, `70자 넘음: ${item}`);
    }
  });
});
