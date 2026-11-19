// #970 동작 시험 — 서재·책장(#938 대표 결정)과 날짜 표시.
// 1) 서재: 책이 왼쪽부터 놓이고(첫 책이 책장 왼쪽 안쪽), 책장이 화면 세로 가운데에 있으며,
//    한 줄에 다 들어가면 화살표가 없고 넘칠 때만 좌우 화살표가 뜨며 누르면 한 칸씩 넘어간다. 390·1440.
//    (#972 서재 여백 수정이 들어와도 깨지지 않게 여백 수치는 고정하지 않는다 — 순서·가운데·화살표 동작만 잰다.)
// 2) 날짜 표시: 시계를 고정했을 때 오늘·어제·지난 날짜·다른 해가 기기 지역 날짜 규칙대로 나온다.
// 가짜 데이터는 정식 생성기(createTree/addMoment)로만 만든다. 운영 API·계정은 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';
import { localDateOnly, localDaysBetween, relativeDayLabel } from '../public/v41/local-date.mjs';
import { formatDisplayDate } from '../public/v41/book-usability.mjs';

const REQUIRE = process.env.LT_970_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }

function books(count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    let tree = createTree({ subject: `서재 책 ${i + 1}`, title: `서재 책 ${i + 1}`, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, `2026-11-20T00:00:0${i}Z`);
    tree.moments[0].title = `첫 장면 ${i + 1}`;
    tree = addMoment(tree, { title: `둘째 장면 ${i + 1}`, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, `2026-11-20T00:01:0${i}Z`);
    list.push(tree);
  }
  return list;
}

const WORKSPACE = (trees) => JSON.stringify({ revision: 1, state: { version: 1, trees, prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' });

async function withShelf(trees, { width, height }, fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: 'reduce' });
  try {
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (route) => {
      if (route.request().method() === 'PUT') { route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"revision":2}' }); return; }
      route.fulfill({ status: 200, contentType: 'application/json', body: WORKSPACE(trees) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    // 서재는 트리 ▾의 '서재 전체 보기'로 연다(실제 입구).
    await page.locator('#record-menu').click();
    await page.locator('[data-tree-action="shelf"]').click();
    let frame = null;
    for (let i = 0; i < 80 && !frame; i += 1) {
      frame = page.frames().find((f) => /track32-bookshelf/.test(f.url()));
      if (frame) break;
      await page.waitForTimeout(250);
    }
    assert.ok(frame, '서재 화면이 열리지 않음');
    await frame.waitForSelector('#shelfRail [data-book-index]', { timeout: 20000 });
    await page.waitForTimeout(600); // 배치·ResizeObserver가 한 번 돌 시간
    await fn({ page, frame, errors });
  } finally {
    await browser.close();
    server.close();
  }
}

async function geometry(frame) {
  return frame.evaluate(() => {
    const rail = document.querySelector('#shelfRail').getBoundingClientRect();
    const viewport = document.querySelector('#shelfViewport').getBoundingClientRect();
    const cards = [...document.querySelectorAll('#shelfRail [data-book-index]')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { i: Number(el.dataset.bookIndex), left: r.left, right: r.right, cy: r.top + r.height / 2, center: el.classList.contains('is-center') };
      })
      .sort((a, b) => a.i - b.i);
    return {
      rail: { left: rail.left, right: rail.right, width: rail.width },
      viewport: { cy: viewport.top + viewport.height / 2, height: viewport.height },
      screen: { height: innerHeight },
      cards,
      prevHidden: document.querySelector('#shelfPrev').hidden,
      nextHidden: document.querySelector('#shelfNext').hidden,
    };
  });
}

test('서재 — 책이 왼쪽부터 놓이고 책장이 세로 가운데에 있다(1440, 다 들어감)', async (t) => {
  if (skip) { if (REQUIRE) assert.fail(`화면 시험을 건너뛸 수 없습니다: ${skip}`); t.skip(skip); return; }
  await withShelf(books(4), { width: 1440, height: 900 }, async ({ frame, errors }) => {
    const g = await geometry(frame);
    assert.equal(g.cards.length, 4, '책 4권이 그려진다');
    // 왼쪽부터: 번호 순서대로 오른쪽으로 가고, 서로 겹치지 않는다.
    for (let i = 1; i < g.cards.length; i += 1) {
      assert.ok(g.cards[i].left > g.cards[i - 1].left, `책 ${i + 1}이 책 ${i}보다 오른쪽: ${JSON.stringify(g.cards)}`);
      assert.ok(g.cards[i].left >= g.cards[i - 1].right - 2, `책 ${i + 1}이 앞 책을 덮지 않는다`);
    }
    // 첫 책은 책장 왼쪽 안쪽에 붙어 있다(가운데 정렬이 아니다).
    const firstGap = g.cards[0].left - g.rail.left;
    assert.ok(firstGap >= -4, `첫 책이 책장 밖으로 나가지 않는다: ${firstGap}`);
    assert.ok(firstGap <= g.rail.width * 0.15, `첫 책이 왼쪽에 붙어 있다(가운데 아님): ${firstGap} / ${g.rail.width}`);
    // 세로 가운데: 책장 중심이 화면 중심에서 화면 높이의 10% 안.
    const offCenter = Math.abs(g.viewport.cy - g.screen.height / 2);
    assert.ok(offCenter <= g.screen.height * 0.10, `책장이 세로 가운데: 중심차 ${Math.round(offCenter)}px (화면 ${g.screen.height}px)`);
    // 다 들어가면 화살표 0개.
    assert.equal(g.prevHidden, true, '다 들어가면 이전 화살표 없음');
    assert.equal(g.nextHidden, true, '다 들어가면 다음 화살표 없음');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('서재 — 390에서 넘칠 때만 화살표가 뜨고 누르면 한 칸 넘어간다', async (t) => {
  if (skip) { if (REQUIRE) assert.fail(`화면 시험을 건너뛸 수 없습니다: ${skip}`); t.skip(skip); return; }
  await withShelf(books(4), { width: 390, height: 844 }, async ({ frame, errors }) => {
    const before = await geometry(frame);
    assert.equal(before.cards.length, 4, '책 4권');
    assert.equal(before.prevHidden, false, '넘치면 화살표가 뜬다(이전)');
    assert.equal(before.nextHidden, false, '넘치면 화살표가 뜬다(다음)');
    // 첫 책이 여전히 왼쪽 안쪽에서 시작한다.
    assert.ok(before.cards[0].left - before.rail.left <= before.rail.width * 0.2, '390에서도 첫 책이 왼쪽 안쪽');

    const centeredBefore = before.cards.find((c) => c.center)?.i;
    await frame.click('#shelfNext');
    await frame.waitForTimeout(500);
    const after = await geometry(frame);
    // 한 칸 넘어간다: 0번 책이 왼쪽으로 밀리고(또는 화면 밖으로), 위치가 실제로 바뀐다.
    const shift = before.cards[0].left - after.cards[0].left;
    assert.ok(shift > 20, `다음 화살표가 책장을 왼쪽으로 민다: ${Math.round(shift)}px`);
    // 고른 책(가운데)은 그대로다 — 책장만 움직인다.
    assert.equal(after.cards.find((c) => c.center)?.i, centeredBefore, '고른 책은 그대로');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('날짜 표시 — 시계를 고정하면 오늘·어제·지난 날짜가 지역 날짜대로 나온다', () => {
  // 기기 지역 시각으로 만든 기준 시각(시간대와 무관하게 '지역 날짜'가 그대로 쓰인다).
  const now = new Date(2026, 10, 20, 10, 0, 0); // 2026-11-20 10:00 지역
  const rows = [
    ['2026-11-20', 0, '오늘'],
    ['2026-11-19', 1, '어제'],
    ['2026-11-13', 7, '7일 전'],
    ['2026-10-21', 30, '30일 전'],
  ];
  for (const [day, wantDays, wantLabel] of rows) {
    assert.equal(localDateOnly(new Date(`${day}T09:00:00`)), day, `지역 날짜 ${day}`);
    assert.equal(localDaysBetween(now, new Date(`${day}T09:00:00`)), wantDays, `${day} 일수`);
    assert.equal(relativeDayLabel(wantDays), wantLabel, `${day} 표시`);
  }
  // 미래(시계 차이)는 '오늘'로 눙친다.
  assert.equal(relativeDayLabel(localDaysBetween(now, new Date('2026-11-21T09:00:00'))), '오늘');
});

test('날짜 표시 — 해가 바뀌어도 지역 날짜대로 오늘·어제가 나온다', () => {
  // 1월 1일 새벽: 12월 31일 밤에 남긴 순간은 '어제'다(UTC 날짜로 세면 '오늘'이 된다).
  const newYear = new Date(2026, 0, 1, 0, 30, 0);
  assert.equal(localDaysBetween(newYear, new Date(2025, 11, 31, 23, 50, 0)), 1, '해 넘김 하루 차이');
  assert.equal(relativeDayLabel(1), '어제');
  assert.equal(localDaysBetween(newYear, new Date(2026, 0, 1, 0, 10, 0)), 0, '같은 날 새벽');
  assert.equal(relativeDayLabel(0), '오늘');
  // 다른 해의 기록은 그 해로 보인다.
  assert.equal(localDateOnly(new Date(2024, 11, 31, 23, 0, 0)), '2024-12-31', '다른 해 지역 날짜');
  assert.equal(relativeDayLabel(localDaysBetween(newYear, new Date(2024, 11, 31, 23, 0, 0))), '366일 전', '다른 해 일수');
  assert.equal(formatDisplayDate('2024-12-31'), '2024. 12. 31', '다른 해 화면 표기');
  assert.equal(formatDisplayDate('2026-11-20', 'long'), '11월 20일', '같은 해 긴 표기');
});
