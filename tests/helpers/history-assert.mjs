import assert from 'node:assert/strict';

// #1298: 단순 옵션 변경에서 브라우저 방문 기록이 늘어나지 않는지 확인한다.
export async function expectNoHistoryGrowth(page, action, label) {
 const before = await page.evaluate(() => history.length);
 await action();
 const after = await page.evaluate(() => history.length);
 assert.equal(after, before, label + ': 방문 기록 증가 0');
}
