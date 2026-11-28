import {clickToolbarTreeChoice,treeChoiceExpanded,treeChoiceFocused} from './helpers/tree-picker-pr3.mjs';
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
    await page.waitForTimeout(300);
    await fn({ page, errors, puts });
  } finally {
    await browser.close();
    server.close();
  }
}

async function openCleanup(page) {
  await clickToolbarTreeChoice(page);
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
    await page.evaluate(() => { location.hash = '#shelf'; });
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
const MALFORMED_TREE = { id: 't2', title: '다른 트리', moments: [{ id: 'bad-moment' }] };

function guardTree(subject) {
  let tree = createTree({ subject, title: subject, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
  tree = addMoment(tree, { title: `${subject} 둘째`, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, '2026-11-20T00:00:01Z');
  return tree;
}

async function withGuardWorkspace(trees, { width = 1440, height = 900, quarantined = 0 } = {}, fn) {
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
      const served = { revision: 1, state: { version: 1, trees, prefs: {} }, subject: '시험계정', writeSubjectBound: true };
      // #986: 서버가 읽지 못해 빼 둔 트리는 개수(quarantined)만 응답에 실린다.
      if (quarantined) served.quarantined = quarantined;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(served) });
    });
    const page = await ctx.newPage();
    const errors = [], warnings = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
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
        await clickToolbarTreeChoice(page);
        await page.waitForSelector('#tree-popover [data-tree-id]', { timeout: 5000 }).catch(() => {});
        assert.equal(await page.locator('#tree-popover [data-tree-id]').count(), 2, '트리 메뉴에도 정상 트리 2개만 보인다');
      }
    });
  }
});

test('어긋난 트리가 있어도 순간을 저장하면 PUT 본문에는 어긋난 트리가 들어가지 않는다', async (t) => {
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
    // #986: 원본 보존은 서버 몫이다 — 본문에 어긋난 트리를 다시 붙이면 서버 전체 검사에
    // 400 invalid_document로 거절되어 그 계정은 영영 저장하지 못하게 된다.
    assert.equal(saved.some((tree) => tree.id === 't2'), false, '어긋난 트리 원본이 본문에 다시 붙지 않는다');
    assert.deepEqual(saved.length, 2, '본문에는 정상 트리 2개만 담긴다');
    assert.ok(saved.some((tree) => tree.moments.length === 3), '새 순간은 정상 트리에 담긴다');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

test('서버가 읽지 못해 빼 둔 트리는 개수(quarantined)로도 안내를 띄운다', async (t) => {
  if (skip) { t.skip(skip); return; }
  // 서버는 이미 어긋난 트리를 빼고 정상 트리만 돌려주고, 개수만 quarantined로 알린다.
  await withGuardWorkspace([guardTree('첫 트리'), guardTree('둘째 트리')], { quarantined: 1 }, async ({ page, errors, warnings }) => {
    const facts = await shellFacts(page);
    assert.deepEqual(facts.trees.length, 2, '서버가 돌려준 정상 트리 2개가 열린다');
    assert.match(facts.toast, /열 수 없는 트리 1개를 잠시 빼고 열었어요/, '서버 개수로 안내 한 줄');
    assert.equal(warnings.filter((text) => /열 수 없는 트리/.test(text)).length, 1, '콘솔 경고 한 줄');
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

test('#1089 정리 창은 순간 목록 창과 같은 가운데 카드 틀이다', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await withShell(sampleTree(), { width, height }, async ({ page }) => {
      await openCleanup(page);
      const cleanup = await page.locator('#cleanup-panel').evaluate((el) => {
        const box = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const rows = el.querySelector('#cleanup-moments').getBoundingClientRect();
        return { width: Math.round(box.width), left: Math.round(box.left), rows: Math.round(rows.width), radius: cs.borderTopLeftRadius };
      });
      // 순간 목록 창(안쪽 iframe의 .orbit-dialog)도 같은 폭 규칙이다.
      await page.locator('#cleanup-panel [data-close="cleanup-panel"]').click();
      await page.waitForFunction(() => !document.querySelector('#cleanup-panel')?.open, null, { timeout: 5000 });
      // 정리 메뉴는 서재 화면을 표시한다. 비교할 순간 목록은 홈 화면으로 돌아간 뒤 연다.
      await page.locator('.brand').click();
      await page.waitForFunction(() => {
        const frame = document.querySelector('#view:not([hidden])');
        return !!frame && /\/v41\/home\.html$/.test(frame.contentWindow.location.pathname)
          && !!frame.contentDocument?.querySelector('#orbit')?.shadowRoot?.querySelector('.orbit-dialog');
      }, null, { timeout: 5000 });
      await page.frameLocator('#view').locator('.orbit-dialog').first().evaluate((el) => el.showModal());
      await page.frameLocator('#view').locator('.orbit-dialog[open]').waitFor({ timeout: 5000 });
      const list = await page.frameLocator('#view').locator('.orbit-dialog').first().evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { width: Math.round(box.width), left: Math.round(box.left) };
      });
      const diff = Math.abs(cleanup.width - list.width);
      console.log('#1089', width, JSON.stringify({ cleanup, list, diff }));
      assert.ok(diff <= 40, `${width}: 정리 창 ${cleanup.width}px vs 순간 목록 ${list.width}px — 차이 ${diff}px`);
      assert.ok(cleanup.rows <= Math.max(list.width, 900), `${width}: 정리 줄이 카드 밖으로 늘어나지 않는다(${cleanup.rows}px)`);
      if (width === 1440) {
        assert.ok(cleanup.width >= 800 && cleanup.width <= 900, `1440: 가운데 카드 폭(실측 ${cleanup.width}px)`);
        assert.ok(Math.abs(cleanup.left - (width - cleanup.width) / 2) <= 2, '1440: 가운데 정렬');
      } else {
        assert.equal(cleanup.width, 390, '390: 꽉 찬 창');
      }
    });
  }
});


// ── #1439: 정리 창의 복사하기·같은 순간 알림·되돌리기를 실제 셸에서 본다 ──
// 가짜 /api/workspace는 마지막으로 저장(PUT)된 기록을 다음 읽기(GET)에 돌려준다 — 새로고침 뒤 유지까지 본다.
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
function organizeWorkspace() {
  const at = '2026-11-20T00:00:00Z';
  const base = { note: '', emotion: '설렘', date: '2026-11-20' };
  let inbox = createTree({ ...base, subject: '정리 시험', title: '정리 시험', url: '' }, at);
  inbox.moments[0].title = '첫 순간';
  const root = inbox.moments[0].id;
  inbox = addMoment(inbox, { ...base, title: '영상 순간', note: '원본 메모', url: VIDEO, startSeconds: 30, relation: '계속 생각나서', mediaMetadata: { title: '영상 순간' } }, root, '2026-11-20T00:00:01Z');
  inbox = addMoment(inbox, { ...base, title: '셋째 순간', url: '' }, root, '2026-11-20T00:00:02Z');
  inbox.inbox = true;
  const billy = createTree({ ...base, subject: '빌리 하루나', title: '빌리 하루나', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 30, mediaMetadata: { title: '같은 장면' } }, at);
  const yoon = createTree({ ...base, subject: '윤슬', title: '윤슬', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 90, mediaMetadata: { title: '다른 장면' } }, at);
  return { version: 1, trees: [inbox, billy, yoon], prefs: {} };
}
async function withLiveShell(state, { width = 1440, height = 900 } = {}, fn) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  const live = { revision: 1, state: structuredClone(state), puts: [] };
  try {
    // 둘러보기 소개 물음(순간 3개 이상인 트리에 한 번)은 이 시험의 대상이 아니다 — 시험 트리는 이미 물은 것으로 두어
    // 물음 창이 되돌리기 안내를 가리지 않게 한다(불러오자마자 뜨는 때와 복사로 3개가 되는 때 모두).
    const asked = state.trees.map((tree) => tree.id);
    await ctx.addInitScript((ids) => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} }, asked);
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        live.puts.push(body);
        live.state = body.state;
        live.revision += 1;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: live.revision }) });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: live.revision, state: live.state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' }) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    // #1478: 위에서 모든 시험 트리를 이미 물은 것으로 두어 질문 창은 뜨지 않는다 — 보이지 않는 단추를 30초 기다리지 않는다.
    await page.waitForTimeout(300);
    await fn({ page, errors, live, origin });
  } finally {
    await browser.close();
    server.close();
  }
}
// 저장(PUT)이 n번째까지 나갈 때까지 잰다(저장 대기 900ms + 여유).
async function waitPuts(live, n, ms = 12000) {
  const deadline = Date.now() + ms;
  while (live.puts.length < n && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.ok(live.puts.length >= n, `저장 ${n}번째가 나간다(지금 ${live.puts.length})`);
}
const shape = (state) => state.trees.map((t) => [t.id, t.moments.map((m) => [m.id, m.parentId, m.relation || '', m.copiedFrom || ''])]);
const row = (page, host, text) => page.locator(`#${host} .cleanup-moment`, { hasText: text });

test('#1439 정리 창: 이미 있음 → 건너뛰기로 두 트리에 복사 → 되돌리기, 옮기기 → 되돌리기, 저장·새로고침 뒤 유지', async (t) => {
  if (skip) { t.skip(skip); return; }
  if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) { t.skip('빌드 결과가 없어 화면 시험을 건너뜀'); return; }
  const start = organizeWorkspace();
  await withLiveShell(start, {}, async ({ page, errors, live }) => {
    const original = shape(live.state);
    const [inbox, billy, yoon] = live.state.trees;
    const videoId = inbox.moments.find((m) => m.title === '영상 순간').id;
    const thirdId = inbox.moments.find((m) => m.title === '셋째 순간').id;

    // 1) 두 순간을 골라 두 트리에 복사 — 빌리 하루나에는 같은 영상·같은 시작 초가 있어 '이미 있음 1개'.
    await openCleanup(page);
    await row(page, 'cleanup-moments', '영상 순간').locator('input').check();
    await row(page, 'cleanup-moments', '셋째 순간').locator('input').check();
    assert.equal((await row(page, 'cleanup-targets', '빌리 하루나').locator('.cleanup-dup').textContent()).trim(), '이미 있음 1개');
    assert.equal(await row(page, 'cleanup-targets', '윤슬').locator('.cleanup-dup').isHidden(), true, '시작 초가 다른 같은 영상은 이미 있음이 아니다');
    await row(page, 'cleanup-targets', '빌리 하루나').locator('input').check();
    await row(page, 'cleanup-targets', '윤슬').locator('input').check();
    assert.equal(await page.locator('#cleanup-move').isDisabled(), true, '두 트리면 옮기기는 막힌다');
    assert.equal(await page.locator('#cleanup-copy').textContent(), '트리 2곳에 복사하기');
    await page.locator('#cleanup-copy').click();
    await page.waitForSelector('#video-dup-panel[open]', { timeout: 8000 });
    assert.equal(await page.locator('#video-dup-title').textContent(), '이 트리에 같은 영상이 이미 있어요');
    assert.match(await page.locator('#video-dup-text').textContent(), /'빌리 하루나' 트리 · 고른 2개 중 1개가 이미 있어요/);
    assert.equal(await page.locator('#video-dup-view').isHidden(), true, '정리에서는 그 순간 보기가 없다');
    await page.locator('#video-dup-skip').click();
    await page.waitForFunction(() => { const bar = document.querySelector('#move-feedback'); return bar && !bar.hidden && /복사했어요/.test(bar.textContent || ''); }, null, { timeout: 8000 });
    assert.equal(await page.locator('#move-message').textContent(), '트리 2곳에 2개 복사했어요. 이미 있는 1개는 건너뛰었어요.');
    await waitPuts(live, 1);
    const afterCopy = live.state.trees;
    assert.deepEqual(afterCopy.find((tr) => tr.id === billy.id).moments.filter((m) => m.copiedFrom).map((m) => m.copiedFrom), [thirdId], '빌리 하루나: 이미 있는 영상은 건너뛰고 셋째만');
    assert.deepEqual(afterCopy.find((tr) => tr.id === yoon.id).moments.filter((m) => m.copiedFrom).map((m) => m.copiedFrom), [videoId, thirdId], '윤슬: 둘 다');
    const copy = afterCopy.find((tr) => tr.id === yoon.id).moments.find((m) => m.copiedFrom === videoId);
    assert.equal(copy.note, '원본 메모');
    assert.equal(copy.relation, '계속 생각나서', '다음으로 간 이유도 복사');
    assert.equal(copy.parentId, yoon.moments[0].id, '대상 트리 시작 순간 아래');

    // 2) 마우스를 올려 두면 8초가 지나도 안내가 남는다(공통 타이머). 되돌리기는 사본을 모두 거둔다.
    await page.locator('#move-message').hover();
    await page.waitForTimeout(9000);
    assert.equal(await page.locator('#move-feedback').isVisible(), true, '올려 둔 동안은 사라지지 않는다');
    await page.locator('#move-actions button', { hasText: '되돌리기' }).click();
    await waitPuts(live, 2);
    assert.deepEqual(shape(live.state), original, '복사 되돌리기 → 처음 모습');

    // 3) 옮기기 → 되돌리기: 원래 트리·원래 자리로.
    await openCleanup(page);
    await row(page, 'cleanup-moments', '셋째 순간').locator('input').check();
    await row(page, 'cleanup-targets', '윤슬').locator('input').check();
    assert.equal(await page.locator('#cleanup-move').textContent(), '윤슬로 옮기기');
    await page.locator('#cleanup-move').click();
    await page.waitForFunction(() => /윤슬로 1개 옮겼어요/.test(document.querySelector('#move-message')?.textContent || ''), null, { timeout: 8000 });
    await waitPuts(live, 3);
    assert.equal(live.state.trees.find((tr) => tr.id === yoon.id).moments.some((m) => m.id === thirdId), true, '윤슬로 옮겨졌다');
    await page.locator('#move-actions button', { hasText: '되돌리기' }).click();
    await waitPuts(live, 4);
    assert.deepEqual(shape(live.state), original, '옮기기 되돌리기 → 처음 모습');

    // 4) 시작 초가 다른 같은 영상은 묻지 않고 복사 → 새로고침 뒤에도 사본·원본 표시가 남는다.
    await page.waitForFunction(() => window.LT41?.tree?.inbox === true, null, { timeout: 10000 });
    await openCleanup(page);
    await row(page, 'cleanup-moments', '영상 순간').locator('input').check();
    await row(page, 'cleanup-targets', '윤슬').locator('input').check();
    await page.locator('#cleanup-copy').click();
    await page.waitForFunction(() => /윤슬에 1개 복사했어요/.test(document.querySelector('#move-message')?.textContent || ''), null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => !!document.querySelector('#video-dup-panel')?.open), false, '묻지 않는다');
    await waitPuts(live, 5);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    const kept = await page.evaluate((id) => window.LT41.trees.find((tr) => tr.id === id)?.moments.filter((m) => m.copiedFrom).map((m) => [m.copiedFrom, m.note]), yoon.id);
    assert.deepEqual(kept, [[videoId, '원본 메모']], '새로고침 뒤에도 사본이 남는다');
    assert.deepEqual(await page.evaluate((id) => window.LT41.trees.find((tr) => tr.id === id)?.moments.length, inbox.id), 3, '원본 트리는 그대로');
    assert.deepEqual(errors, [], '페이지 오류 없음');
  });
});

const harness1480 = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/v41/identity.css"><link rel="stylesheet" href="/v41/shell.css"><style>body{padding:30px;background:#161921;color:white}#cleanup-panel{display:block;position:static;max-width:560px} .journey-thumb{display:grid;place-items:center;width:64px;height:64px;overflow:hidden;border-radius:10px}</style></head><body>
<dialog id="cleanup-panel" open><div id="cleanup-desc"></div><div id="cleanup-moments" class="cleanup-moments"></div><div id="cleanup-targets"></div><div id="cleanup-move-box"></div><input id="cleanup-new-name"><div id="cleanup-error"></div><div id="cleanup-count"></div><div id="cleanup-target-hint"></div><button id="cleanup-create"></button><button id="cleanup-move"></button><button id="cleanup-copy"></button></dialog><div class="journey-thumb" id="journey"></div><div class="branch-thumb" id="branch"></div>
<script type="module">
import {createCleanup} from '/v41/shell/cleanup.mjs';
import {thumbnailCandidates,thumbFallbackAttrs,mountThumbFallback} from '/v41/thumb-fallback.mjs';
const broken={id:'bad',title:'실패하는 영상',type:'video',emotion:'그리움',url:'https://youtu.be/abc123DEF45'};
const good={id:'good',title:'정상 영상',type:'video',emotion:'설렘',url:'https://youtu.be/good123DEF4'};
const tree={id:'t1',moments:[broken,good]};const other={id:'t2',moments:[]};
window.LT41={tree,trees:[tree,other],source:'server'};
mountThumbFallback(document);
const cleanup=createCleanup({$:id=>document.getElementById(id),getMember:()=>({snapshot:()=>({owned:true,writable:true})}),getSource:()=> 'server',getTrees:()=>[tree,other],choose:()=>{},notify:()=>{},panel:()=>{},thumbCandidatesOf:m=>thumbnailCandidates(m,{autoLoad:true}),treeMomentThumb:()=>'',momentTitle:m=>m.title});
cleanup.open();
const list=thumbnailCandidates(broken,{autoLoad:true});
document.getElementById('journey').innerHTML='<img alt="" src="'+list[0]+'"'+thumbFallbackAttrs(broken,{candidates:list,mode:'thumb-slot'})+'>';
 document.getElementById('branch').innerHTML='<img alt="" src="'+list[0]+'"'+thumbFallbackAttrs(broken,{candidates:list,mode:'thumb-slot'})+'>';
window.__ready1480=true;
</script></body></html>`;

test('#1480 실패한 작은 영상 썸네일을 보이는 대체 표지로 교체하고 성공한 그림을 보존한다',{skip:REQUIRE?false:skip,timeout:60000},async()=>{
 const port=Number(process.env.LT_TEST_PORT||4148);
 const server=await serve({'/1480.html':harness1480},{port});
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:844}});
   await context.route('**/i.ytimg.com/**',route=>{
    if(route.request().url().includes('good123DEF4'))return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64')});
    return route.fulfill({status:404,body:'이미지 없음'});
   });
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+port+'/1480.html',{waitUntil:'load'});
   await page.waitForFunction(()=>window.__ready1480===true);
   await page.waitForFunction(()=>document.querySelectorAll('.cleanup-moment-thumb-slot .lt-recent-fallback').length===1 && document.querySelectorAll('.journey-thumb .lt-recent-fallback').length===1 && document.querySelectorAll('.branch-thumb .lt-recent-fallback').length===1,{timeout:10000});
   const result=await page.evaluate(()=>{
    const slots=[...document.querySelectorAll('.cleanup-moment-thumb-slot')];
    const broken=slots[0],good=slots[1],journey=document.querySelector('.journey-thumb');
    return {brokenImg:broken.querySelector('img')?.naturalWidth??null,brokenLetter:broken.querySelector('.lt-recent-fallback-letter')?.textContent,goodImg:good.querySelector('img')?.naturalWidth??null,goodFallback:!!good.querySelector('.lt-recent-fallback'),journeyImg:journey.querySelector('img')?.naturalWidth??null,journeyLetter:journey.querySelector('.lt-recent-fallback-letter')?.textContent,branchImg:document.querySelector('.branch-thumb img')?.naturalWidth??null,branchLetter:document.querySelector('.branch-thumb .lt-recent-fallback-letter')?.textContent,zeroImgs:[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0).length};
   });
   assert.equal(result.brokenImg,null);
   assert.equal(result.brokenLetter,'실');
   assert.ok(result.goodImg>0);
   assert.equal(result.goodFallback,false);
   assert.equal(result.journeyImg,null);
   assert.equal(result.journeyLetter,'실');
   assert.equal(result.branchImg,null);
   assert.equal(result.branchLetter,'실');
   assert.equal(result.zeroImgs,0);
   assert.deepEqual(errors,[]);
   console.log('#1480',width,JSON.stringify(result));
   await context.close();
  }
 }finally{await browser.close();await new Promise(done=>server.close(done));}
});
