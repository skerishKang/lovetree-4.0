// #970 동작 시험 — 서재·책장(#938 대표 결정)과 날짜 표시.
// 1) 서재: 책이 왼쪽부터 놓이고(첫 책이 책장 왼쪽 안쪽), 책장이 화면 세로 가운데에 있으며,
//    한 줄에 다 들어가면 화살표가 없고 넘칠 때만 좌우 화살표가 뜨며 누르면 한 칸씩 넘어간다. 390·1440.
//    (#972 서재 여백 수정이 들어와도 깨지지 않게 여백 수치는 고정하지 않는다 — 순서·가운데·화살표 동작만 잰다.)
// 2) 날짜 표시: 시계를 고정했을 때 오늘·어제·지난 날짜·다른 해가 기기 지역 날짜 규칙대로 나온다.
// 가짜 데이터는 정식 생성기(createTree/addMoment)로만 만든다. 운영 API·계정은 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { SHELF_VIEW_NAMES } from '../public/v41/views/shelf/shelf-views.mjs';
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

const WORKSPACE = (trees, view) => JSON.stringify({ revision: 1, state: { version: 1, trees, prefs: view ? { shelfView: view } : {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' });


// #1418: 36조합을 한 페이지에서 폭·보기·데이터만 바꿔 잰다(데이터 변경 때만 다시 연다).
async function withShelfSession(fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  let trees = books(20), view = 'carousel', frame = null;
  const errors = [];
  try {
    await ctx.addInitScript((v) => { try { localStorage.setItem('lt41.shelfView', v); } catch {} }, view);
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (route) => {
      if (route.request().method() === 'PUT') { route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"revision":2}' }); return; }
      route.fulfill({ status: 200, contentType: 'application/json', body: WORKSPACE(trees, view) });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    async function openShelf() {
      await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      // 무대 준비가 끝나기 전의 클릭은 '불러오는 중' 덮개에 가로챼진다.
      await page.waitForFunction(() => document.getElementById('stage-loading')?.hidden === true, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      await page.locator('#record-menu').click();
      await page.locator('[data-tree-action="shelf"]').click();
      frame = null;
      for (let i = 0; i < 80 && !frame; i += 1) {
        frame = page.frames().find((f) => /track32-bookshelf/.test(f.url()));
        if (frame) break;
        await page.waitForTimeout(250);
      }
      assert.ok(frame, '서재 화면이 열리지 않음');
      await frame.waitForSelector('#shelfRail [data-book-index]', { timeout: 20000 });
      await page.waitForTimeout(600);
    }
    await openShelf();
    await fn({
      errors,
      getFrame: () => frame,
      geometry: () => geometry(frame),
      setData: async (count) => { trees = books(count); await openShelf(); },
      setViewport: async (width, height) => { await page.setViewportSize({ width, height }); await page.waitForTimeout(600); },
      setView: async (name) => { view = name; await frame.evaluate((n) => document.querySelector(`#shelf-view-inline [data-shelf-view="${n}"]`).click(), name); await frame.waitForTimeout(600); }
    });
  } finally {
    await browser.close();
    server.close();
  }
}

async function withShelf(trees, { width, height, view }, fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark', reducedMotion: 'reduce' });
  let prefs = view ? { shelfView: view } : {}; let resolveSave; const saved = new Promise((r) => { resolveSave = r; });
  if (view) await ctx.addInitScript((v) => { try { localStorage.setItem('lt41.shelfView', v); } catch {} }, view);
  try {
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (route) => {
      if (route.request().method() === 'PUT') { try { const body = route.request().postDataJSON(); const next = body?.state?.prefs || body?.prefs; if (next) prefs = { ...prefs, ...next }; } catch {} route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"revision":2}' }); resolveSave?.(); return; }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees, prefs }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' }) });
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
    await fn({ page, frame, errors, saved });
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
  await withShelf(books(4), { width: 1440, height: 900, view: 'shelf' }, async ({ frame, errors }) => {
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
  await withShelf(books(4), { width: 390, height: 844, view: 'carousel' }, async ({ frame, errors }) => {
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
    // 회전 보기에서는 화살표가 가운데 책을 한 칸 옮긴다(#1366 기본 보기).
    assert.equal(after.cards.find((c) => c.center)?.i, centeredBefore + 1, '가운데 책이 한 칸 앞으로');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

// #1376 1단계: 보기 이름만 바꿔 같은 화면 수치 검사를 돌린다(기준·대기 시간은 그대로).
test('서재 — 보기 이름만 바꿔도 겹침·가로 넘침이 0이다', async (t) => {
  if (skip) { if (REQUIRE) assert.fail(`화면 시험을 건너뛸 수 없습니다: ${skip}`); t.skip(skip); return; }
  for (const name of SHELF_VIEW_NAMES) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await withShelf(books(4), vp, async ({ page, frame, errors }) => {
        if (name !== 'shelf') {
          await frame.evaluate((n) => document.querySelector(`#shelf-view-inline [data-shelf-view="${n}"]`).click(), name);
          await frame.waitForTimeout(600);
          const applied = await frame.evaluate((n) => document.querySelector('#shelfViewport')?.dataset.shelfView === n, name);
          assert.equal(applied, true, `${name}: 고른 보기로 바뀐다`);
        }
        const audit = await auditPage(page, `서재 ${name}`);
        // 화살표는 원래 레일 가장자리 카드 위에 얹힌다(#889). 이 설계 겹침 두 쌍만 빼고
        // 나머지 겹침·가로 넘침·가려짐·검사오류가 0인지 보기 이름마다 같은 기준으로 잰다.
        const hits = failuresOf(audit, `${vp.width}`, 'dark').filter((r) =>
          ['검사오류', '가로넘침', '겹침', '가려짐'].includes(r.항목) && !/shelfPrev|shelfNext/.test(r.줄));
        assert.deepEqual(hits, [], `${name} ${vp.width}: 겹침·가로 넘침 0`);
        const g = await geometry(frame);
        assert.equal(g.cards.length, 4, `${name} ${vp.width}: 책 4권`);
        assert.ok(g.cards.every((c) => Number.isFinite(c.left) && Number.isFinite(c.cy)), `${name}: 모든 카드에 위치가 있다`);
        assert.deepEqual(errors, [], `${name}: 페이지 오류 없음`);
      });
    }
  }
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

// #1366: 저장된 값이 없으면 회전 보기가 기본이다.
test('서재 — 저장값 없으면 회전 보기가 기본이다', async (t) => {
  if (skip) { if (REQUIRE) assert.fail(`화면 시험을 건너뛸 수 없습니다: ${skip}`); t.skip(skip); return; }
  await withShelf(books(1), { width: 1440, height: 900 }, async ({ frame, errors }) => {
    const view = await frame.evaluate(() => document.querySelector('#shelfViewport')?.dataset.shelfView || '');
    assert.equal(view, 'carousel', '값 없음 → 회전');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

// #1366: 기본 보기는 회전이고, 첫 책(회전은 가운데 책)의 왼쪽 끝이 화면 안에 있다.
test('서재 — 390·844·1440 × 선반·회전 × 책 1·4·20권에서 왼쪽 잘림 0', async (t) => {
  if (skip) { if (REQUIRE) assert.fail(`화면 시험을 건너뛸 수 없습니다: ${skip}`); t.skip(skip); return; }
  await withShelfSession(async ({ errors, getFrame, geometry, setData, setViewport, setView }) => {
    for (const count of [1, 4, 20]) {
      await setData(count);
      for (const width of [390, 844, 1440]) {
        await setViewport(width, width === 390 ? 844 : 900);
        for (const name of SHELF_VIEW_NAMES) {
          await setView(name);
          const frame = getFrame();
          const applied = await frame.evaluate((n) => document.querySelector('#shelfViewport')?.dataset.shelfView === n, name);
          assert.equal(applied, true, `${width} ${name}: 보기가 적용된다`);
          const g = await geometry();
          const card = name === 'shelf' ? g.cards[0] : (g.cards.find((c) => c.center) || g.cards[0]);
          assert.ok(card, `${width} ${name} ${count}권: 카드가 있다`);
          assert.ok(card.left >= 0, `${width} ${name} ${count}권: 왼쪽 잘림 0 (왼쪽 끝 ${Math.round(card.left)}px)`);
          assert.deepEqual(errors, [], `${width} ${name} ${count}권: 페이지 오류 없음`);
        }
      }
    }
  });
});

// #1435 3: 설정 화면에서 고른 서재 기본 보기가 서재에 바로 반영되고 새로고침 뒤에도 남는다.
test('서재 — 설정에서 고른 기본 보기가 저장되고 다시 열려도 남는다', async (t) => {
  if (skip) { if (REQUIRE) assert.fail(`화면 시험을 건너뛸 수 없습니다: ${skip}`); t.skip(skip); return; }
  for (const name of ['shelf', 'carousel']) {
    await withShelf(books(2), { width: 1440, height: 900 }, async ({ page, errors, saved }) => {
      await page.locator('#account-avatar').click();
      await page.locator('#account-open-settings').click();
      await page.waitForSelector('#account-settings[open]');
      await page.locator(`#settings-tab-screen`).click();
      await page.locator(`[data-settings-shelf-view="${name}"]`).click();
      assert.equal(await page.evaluate(() => localStorage.getItem('lt41.shelfView')), name, '기기 값에 저장된다');
      assert.equal(await page.evaluate(() => window.LT41?.prefs?.shelfView), name, '계정 값에 저장된다');
      await saved;
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
      await page.locator('#discover-ask-no').click().catch(() => {});
      await page.locator('#account-avatar').click();
      await page.locator('#account-open-settings').click();
      await page.waitForSelector('#account-settings[open]');
      const checked = await page.evaluate((v) => document.querySelector(`[data-settings-shelf-view="${v}"]`)?.getAttribute('aria-checked'), name);
      assert.equal(checked, 'true', '새로고침 뒤에도 선택이 남는다');
      assert.deepEqual(errors, [], '페이지 오류 없음');
    });
  }
});
