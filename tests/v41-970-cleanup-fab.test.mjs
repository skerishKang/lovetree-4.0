// #970 동작 시험 — 정리 창(cleanup.mjs)과 모바일 아래 ＋ 단추(#mobile-add).
// 1) 정리 창: 트리 ▾에서 '정리 전 N개 정리하기'로 열고, 순간 고를 → 이름 적기 → 취소하면 그대로,
//    확인하면 저장(PUT /api/workspace)되고 안내가 뜬다. 쓰다 만 입력이 있으면 닫을 때 한 번 묻는다.
// 2) 아래 ＋ 단추: 390 폭에서 화면 안 오른쪽 아래에 보이고(56px 원), 누르면 쓰기 창이 열린다. 1440에서는 숨는다.
// 셸을 그대로 띄우고 /api/workspace만 시험 기록으로 물린다(#842·#932 시험과 같은 방식). 운영 API는 쓰지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_970_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }

function otherTree() {
  return createTree({ subject: '다른 트리', title: '다른 트리', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
}

function sampleTree() {
  let tree = createTree({ subject: '정리 시험', title: '정리 시험', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
  tree.moments[0].title = '첫 순간';
  tree = addMoment(tree, { title: '둘째 순간', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, '2026-11-20T00:00:01Z');
  tree = addMoment(tree, { title: '셋째 순간', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[1].id, '2026-11-20T00:00:02Z');
  // 정리 입구는 모아둔 순간(inbox) 트리에서만 열린다(#380 5번).
  tree.inbox = true;
  return tree;
}

const WORKSPACE = (tree) => JSON.stringify({ revision: 1, state: { version: 1, trees: [tree, otherTree()], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' });

async function withShell(tree, { width = 1440, height = 900 } = {}, fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  try {
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    let puts = [];
    await ctx.route('**/api/workspace**', async (route) => {
      if (route.request().method() === 'PUT') {
        puts.push(route.request().postDataJSON());
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"revision":2}' });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: WORKSPACE(tree) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.waitForTimeout(300);
    await fn({ page, errors, puts });
  } finally {
    await browser.close();
    server.close();
  }
}

async function openCleanup(page) {
  await page.locator('#record-menu').click();
  await page.locator('[data-tree-action="cleanup"]').click();
  await page.waitForSelector('#cleanup-panel[open]', { timeout: 10000 });
}

// 닫기 단추를 누르면 브라우저 확인 창이 뜬 채 클릭이 멈춘다 — 창 처리기를 먼저 걸고 누른다.
async function closeConfirm(page, answer) {
  const seen = [];
  page.once('dialog', (dialog) => {
    seen.push(dialog.message());
    void (answer ? dialog.accept() : dialog.dismiss()).catch(() => {});
  });
  await page.locator('#cleanup-panel [data-close="cleanup-panel"]').click({ noWaitAfter: true, timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 40 && !seen.length; i += 1) await page.waitForTimeout(100);
  assert.equal(seen.length, 1, '닫을 때 한 번 묻는다');
  assert.match(seen[0], /저장하지 않고 닫을까요/, seen[0]);
  await page.waitForTimeout(300);
}

test('정리 창: 고르기·이름은 취소하면 그대로 남고, 닫기 확인을 거쳐야 닫힌다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  await withShell(sampleTree(), {}, async ({ page, errors, puts }) => {
    await openCleanup(page);
    const rows = page.locator('#cleanup-moments .cleanup-moment');
    assert.equal(await rows.count(), 3, '순간 3개가 목록에 그려진다');
    assert.equal(await page.locator('#cleanup-count').textContent(), '아직 고르지 않았어요.');
    assert.equal(await page.locator('#cleanup-create').isDisabled(), true, '고르지 않으면 만들기 막힘');
    assert.equal(await page.locator('#cleanup-move').isDisabled(), true, '고르지 않으면 옮기기 막힘');

    // 하나 고르고 이름을 적으면 문구·단추가 센다.
    await rows.nth(0).locator('input[type=checkbox]').check();
    assert.match(await page.locator('#cleanup-count').textContent(), /1개를 골랐어요/);
    await page.locator('#cleanup-new-name').fill('산책');
    assert.equal(await page.locator('#cleanup-create').isDisabled(), false, '이름을 적으면 만들기 열림');

    // 쓰다 만 입력이 있는데 닫으려 하면 한 번 묻고, 아니오면 그대로 남는다.
    await closeConfirm(page, false);
    assert.equal(await page.locator('#cleanup-panel').getAttribute('open'), '', '아니요 → 창이 그대로 열려 있다');
    assert.equal(await page.locator('#cleanup-new-name').inputValue(), '산책');
    assert.equal(await page.locator('#cleanup-moments input:checked').count(), 1, '고른 순간도 그대로');

    // 예로 닫으면 아무것도 저장하지 않는다.
    await closeConfirm(page, true);
    await page.waitForFunction(() => !document.querySelector('#cleanup-panel')?.open, null, { timeout: 5000 });
    assert.equal(puts.length, 0, '닫기만 하면 저장 호출이 없다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('정리 창: 확인하면 새 트리가 저장되고 안내가 뜬다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  await withShell(sampleTree(), {}, async ({ page, errors, puts }) => {
    await openCleanup(page);
    await page.locator('#cleanup-moments .cleanup-moment input[type=checkbox]').nth(0).check();
    await page.locator('#cleanup-moments .cleanup-moment input[type=checkbox]').nth(1).check();
    assert.match(await page.locator('#cleanup-count').textContent(), /2개를 골랐어요/);
    await page.locator('#cleanup-new-name').fill('산책에서 본 것들');
    await page.locator('#cleanup-create').click();

    // 안내 줄은 8초 뒤 스스로 사라지고 저장은 900ms 뒤에 나간다 — 둘 다 그때그때 잰다.
    let noticeOk = false;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (!noticeOk) {
        noticeOk = await page.evaluate(() => {
          const bar = document.querySelector('#move-feedback');
          return !!bar && !bar.hidden && /산책에서 본 것들/.test(bar.textContent || '');
        });
      }
      if (noticeOk && puts.length) break;
      await page.waitForTimeout(100);
    }
    assert.ok(noticeOk, '이동 안내 줄이 화면에 뜬다');
    assert.equal(puts.length, 1, '새 트리 만들기 저장이 한 번');
    assert.equal(puts[0].state.trees.length, 3, '기존 2 + 새 트리');
    const made = puts[0].state.trees.find((t) => t.subject === '산책에서 본 것들');
    assert.ok(made, `새 트리 이름(대상)이 저장본에 있다: ${puts[0].state.trees.map((t) => t.subject).join(' / ')}`);
    assert.equal(made.moments.length, 2, '고른 순간 2개가 새 트리에 들어간다');
    await page.waitForFunction(() => !document.querySelector('#cleanup-panel')?.open, null, { timeout: 5000 });
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('아래 ＋ 단추: 390 폭에서 화면 안에 보이고(56px 원) 누르면 쓰기 창이 열린다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  await withShell(sampleTree(), { width: 390, height: 844 }, async ({ page, errors }) => {
    await page.waitForSelector('body.lt-fab-ok', { timeout: 10000 });
    const fab = page.locator('#mobile-add');
    await fab.waitFor({ state: 'visible', timeout: 8000 });
    const box = await fab.boundingBox();
    assert.ok(box, '단추가 화면에 그려진다');
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `화면 안: ${JSON.stringify(box)}`);
    assert.ok(box.width >= 44 && box.height >= 44, `누르는 영역 44px 이상: ${box.width}×${box.height}`);

    await fab.click();
    await page.waitForSelector('#write-panel[open]', { timeout: 8000 });
    assert.ok(await page.locator('#write-panel').getAttribute('open') !== null, '쓰기 창이 열린다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('아래 ＋ 단추: 1440 폭에서는 보이지 않는다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  await withShell(sampleTree(), { width: 1440, height: 900 }, async ({ page }) => {
    await page.waitForFunction(() => document.body.classList.contains('lt-fab-ok'), null, { timeout: 10000 });
    await page.waitForTimeout(400);
    const fab = page.locator('#mobile-add');
    assert.equal(await fab.isVisible(), false, '1440에서는 떠 있는 ＋ 단추가 없다');
  });
});