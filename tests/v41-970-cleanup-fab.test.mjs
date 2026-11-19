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

// #978: 닫기 확인은 브라우저 기본 confirm()이 아니라 앱 안 공통 틀(#lt-close-confirm)이다.
// 닫기 단추를 누르면 앱 안 확인 창이 뜨고, 예/아니요 단추를 눌러 답한다. 브라우저 dialog 이벤트는 없어야 한다.
async function closeConfirm(page, answer) {
  await page.locator('#cleanup-panel [data-close="cleanup-panel"]').click({ timeout: 8000 });
  await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
  assert.match(await page.locator('#lt-close-confirm-title').textContent(), /저장하지 않고 닫을까요/);
  // 초점은 확인 틀 안에 머물고(아니요 단추), Tab은 틀 안에서만 순환한다.
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'lt-close-confirm-no', '확인 틀 안(아니요)으로 초점이 간다');
  await page.locator(answer ? '#lt-close-confirm-yes' : '#lt-close-confirm-no').click();
  await page.waitForFunction(() => !document.querySelector('#lt-close-confirm')?.open, null, { timeout: 5000 });
  await page.waitForTimeout(200);
}

test('정리 창: 고르기·이름은 취소하면 그대로 남고, 닫기 확인을 거쳐야 닫힌다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  // #978: 390·1440 둘 다 같은 앱 안 확인 틀을 쓴다. 브라우저 기본 confirm(dialog 이벤트)은 한 번도 불리지 않는다.
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await withShell(sampleTree(), { width, height }, async ({ page, errors, puts }) => {
      const nativeDialogs = [];
      page.on('dialog', (dialog) => { nativeDialogs.push(dialog.message()); void dialog.dismiss().catch(() => {}); });
      await openCleanup(page);
      const rows = page.locator('#cleanup-moments .cleanup-moment');
      assert.equal(await rows.count(), 3, `${width}: 순간 3개가 목록에 그려진다`);
      assert.equal(await page.locator('#cleanup-count').textContent(), '아직 고르지 않았어요.');
      assert.equal(await page.locator('#cleanup-create').isDisabled(), true, '고르지 않으면 만들기 막힘');
      assert.equal(await page.locator('#cleanup-move').isDisabled(), true, '고르지 않으면 옮기기 막힘');

      // 하나 고르고 이름을 적으면 문구·단추가 센다.
      await rows.nth(0).locator('input[type=checkbox]').check();
      assert.match(await page.locator('#cleanup-count').textContent(), /1개를 골랐어요/);
      await page.locator('#cleanup-new-name').fill('산책');
      assert.equal(await page.locator('#cleanup-create').isDisabled(), false, '이름을 적으면 만들기 열림');

      // 쓰다 만 입력이 있는데 닫으려 하면 앱 안 틀로 한 번 묻고, 아니오면 그대로 남는다.
      await closeConfirm(page, false);
      assert.equal(await page.locator('#cleanup-panel').getAttribute('open'), '', `${width}: 아니요 → 창이 그대로 열려 있다`);
      assert.equal(await page.locator('#cleanup-new-name').inputValue(), '산책', `${width}: 이름 그대로`);
      assert.equal(await page.locator('#cleanup-moments input:checked').count(), 1, `${width}: 고른 순간도 그대로`);

      // 예로 닫으면 아무것도 저장하지 않는다.
      await closeConfirm(page, true);
      await page.waitForFunction(() => !document.querySelector('#cleanup-panel')?.open, null, { timeout: 5000 });
      assert.equal(puts.length, 0, `${width}: 닫기만 하면 저장 호출이 없다`);
      assert.deepEqual(nativeDialogs, [], `${width}: 브라우저 기본 confirm(dialog)은 한 번도 불리지 않는다`);
      assert.deepEqual(errors, [], `${width}: 페이지 오류 없음`);
    });
  }
});

// #978: 확인 틀이 열린 동안 Esc = 아니요 — 창·이름·고른 순간 그대로, 초점은 정리 창으로 돌아온다.
test('정리 창: 닫기 확인 틀에서 Esc는 아니요 — 창이 그대로 남고 초점이 돌아온다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  await withShell(sampleTree(), {}, async ({ page, errors, puts }) => {
    const nativeDialogs = [];
    page.on('dialog', (dialog) => { nativeDialogs.push(dialog.message()); void dialog.dismiss().catch(() => {}); });
    await openCleanup(page);
    await page.locator('#cleanup-moments .cleanup-moment input[type=checkbox]').nth(0).check();
    await page.locator('#cleanup-new-name').fill('산책');
    await page.locator('#cleanup-panel [data-close="cleanup-panel"]').click();
    await page.waitForSelector('#lt-close-confirm[open]', { timeout: 8000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#lt-close-confirm')?.open, null, { timeout: 5000 });
    assert.equal(await page.locator('#cleanup-panel').getAttribute('open'), '', 'Esc=아니요 → 정리 창 그대로');
    assert.equal(await page.locator('#cleanup-new-name').inputValue(), '산책', '이름 그대로');
    assert.equal(await page.locator('#cleanup-moments input:checked').count(), 1, '고른 순간 그대로');
    assert.equal(await page.evaluate(() => document.querySelector('#cleanup-panel')?.contains(document.activeElement)), true, '초점이 정리 창 안으로 돌아온다');
    assert.equal(puts.length, 0, '저장 호출 없음');
    assert.deepEqual(nativeDialogs, [], '브라우저 기본 confirm 없음');
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
// #977: 작업 공간에 형식이 어긋난 트리가 하나 섞여 있어도 셸은 읽을 수 있는 트리로 열린다.
// 정식 생성기로 만든 트리 2개 + 손으로 적은 트리 1개(#977 재현 그대로)를 /api/workspace로만 물린다.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const MALFORMED_TREE = { id: 't2', title: '다른 트리', moments: [] };

function guardTree(subject) {
  let tree = createTree({ subject, title: subject, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
  tree = addMoment(tree, { title: `${subject} 둘째`, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, '2026-11-20T00:00:01Z');
  return tree;
}

async function withGuardWorkspace(trees, { width = 1440, height = 900 } = {}, fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  try {
    await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const puts = [];
    await ctx.route('**/api/workspace**', async (route) => {
      if (route.request().method() === 'PUT') {
        puts.push(route.request().postDataJSON());
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"revision":2}' });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees, prefs: {} }, subject: '시험계정', writeSubjectBound: true }) });
    });
    const page = await ctx.newPage();
    const errors = [], warnings = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await page.waitForTimeout(300);
    await fn({ page, errors, warnings, puts });
  } finally {
    await browser.close();
    server.close();
  }
}

const shellFacts = (page) => page.evaluate(() => ({
  trees: (window.LT41?.trees || []).map((tree) => tree.id),
  titles: (window.LT41?.trees || []).map((tree) => tree.title),
  source: window.LT41?.source || null,
  toast: document.querySelector('#toast')?.textContent || ''
}));

test('어긋난 트리 1개 + 정상 2개: 셸이 열리고 정상 트리 2개만 보이며 안내·콘솔 경고가 한 줄씩 (390·1440)', async (t) => {
  if (skip) { t.skip(skip); return; }
  for (const width of [390, 1440]) {
    await withGuardWorkspace([guardTree('첫 트리'), MALFORMED_TREE, guardTree('둘째 트리')], { width, height: width === 390 ? 844 : 900 }, async ({ page, errors, warnings }) => {
      const facts = await shellFacts(page);
      assert.deepEqual(facts.trees.length, 2, `${width}: 정상 트리 2개만 열린다 (${facts.trees.join(', ')})`);
      assert.equal(facts.trees.includes('t2'), false, `${width}: 어긋난 트리는 빠진다`);
      assert.deepEqual(facts.titles, ['첫 트리', '둘째 트리'], `${width}: 정상 트리 제목이 그대로`);
      assert.equal(facts.source, 'server', `${width}: 서버 기록으로 연다`);
      assert.match(facts.toast, /열 수 없는 트리 1개를 잠시 빼고 열었어요/, `${width}: 화면 안내 한 줄`);
      assert.equal(warnings.filter((text) => /열 수 없는 트리/.test(text)).length, 1, `${width}: 콘솔 경고 한 줄`);
      assert.deepEqual(errors, [], `${width}: 페이지 오류 없음`);
      if (width === 1440) {
        await page.locator('#record-menu').click();
        await page.waitForSelector('#tree-popover [data-tree-id]', { timeout: 5000 }).catch(() => {});
        assert.equal(await page.locator('#tree-popover [data-tree-id]').count(), 2, '트리 메뉴에도 정상 트리 2개만 보인다');
      }
    });
  }
});

test('어긋난 트리가 있어도 순간을 저장하면 그 트리가 PUT 본문에 그대로 남는다', async (t) => {
  if (skip) { t.skip(skip); return; }
  await withGuardWorkspace([guardTree('첫 트리'), MALFORMED_TREE, guardTree('둘째 트리')], {}, async ({ page, errors, puts }) => {
    await page.locator('#write-menu').click();
    await page.waitForFunction(() => document.getElementById('write-panel')?.open, null, { timeout: 5000 });
    await page.fill('#quick-url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.waitForFunction(() => !document.getElementById('quick-submit')?.disabled, null, { timeout: 5000 });
    await page.locator('#quick-submit').click();
    for (let i = 0; i < 120 && !puts.length; i += 1) await page.waitForTimeout(100);
    assert.equal(puts.length, 1, '저장(PUT)이 한 번 나간다');
    const saved = puts[0].state.trees;
    assert.equal(saved.length, 3, '정상 트리 2 + 어긋난 트리 1');
    assert.deepEqual(saved.find((tree) => tree.id === 't2'), MALFORMED_TREE, '어긋난 트리가 손대지 않은 그대로 남는다');
    assert.ok(saved.some((tree) => tree.id !== 't2' && tree.moments.length === 3), '새 순간은 정상 트리에 담긴다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('정상 데이터만 있으면 어긋난 트리 안내가 뜨지 않는다', async (t) => {
  if (skip) { t.skip(skip); return; }
  await withGuardWorkspace([guardTree('첫 트리'), guardTree('둘째 트리')], {}, async ({ page, errors, warnings }) => {
    const facts = await shellFacts(page);
    assert.deepEqual(facts.trees.length, 2, '정상 트리 2개가 그대로 열린다');
    assert.equal(/열 수 없는 트리/.test(facts.toast), false, '어긋난 트리 안내가 없다');
    assert.equal(warnings.filter((text) => /열 수 없는 트리/.test(text)).length, 0, '콘솔 경고가 없다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});
