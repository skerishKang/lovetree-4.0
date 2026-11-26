import {clickToolbarTreeChoice} from './helpers/tree-picker-pr3.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_TREETAG_REQUIRE === '1';
const SHOT = process.env.LT_TREETAG_SHOT_DIR || '';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 시험을 건너뜀';

function fixtureTree() {
  let tree = createTree({ subject: '모아둔 순간', title: '모아둔 순간', note: '', emotion: '설렘', date: '2026-11-18', url: '' }, '2026-11-18T00:00:00Z');
  for (const title of ['첫 순간', '둘 순간', '셋 순간']) {
    tree = addMoment(tree, { title, note: '', emotion: '설렘', date: '2026-11-18', url: '' }, tree.moments[0].id, '2026-11-18T00:00:01Z');
  }
  return tree;
}

async function openShell(browser, origin, tree, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
  await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>' }));
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  let state = { version: 1, trees: [tree], prefs: {} };
  await ctx.route('**/api/workspace**', (r) => {
    if (r.request().method() === 'PUT') {
      const body = r.request().postDataJSON() || {};
      if (body.state) state = body.state;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: 2, subject: '시험계정' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z' }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  const saved = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('response', (r) => { if (r.request().method() === 'PUT' && /api\/workspace/.test(r.url())) saved.push(new Date().toISOString()); });
  await page.goto(`${origin}/v41/?account=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
  return { ctx, page, errors, saved };
}

async function openManager(page) {
  await clickToolbarTreeChoice(page);
  await page.click('[data-tree-action="manage"]');
  await page.waitForFunction(() => document.getElementById('tree-manager')?.open === true, null, { timeout: 10000 });
}

test('#862 표지 이름 즉시 갱신·주제 빈 칸·정리 판 960px', { skip: skip || !REQUIRE ? skip || 'LT_TREETAG_REQUIRE=1 일 때 실행' : false }, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx: c1, page, errors, saved } = await openShell(browser, origin, fixtureTree(), 1440, 900);
    await page.evaluate(() => { location.hash = '#my/shelf'; });
    let shelf = null;
    for (let i = 0; i < 40 && !shelf; i++) {
      shelf = page.frames().find((f) => /track32-bookshelf/.test(f.url()));
      if (!shelf) await page.waitForTimeout(250);
    }
    assert.ok(shelf, '서재 화면이 열린다');
    await shelf.waitForSelector('.cover-title', { timeout: 10000 });
    await page.evaluate(() => {
      for (const f of document.querySelectorAll('iframe')) {
        if (/track32-bookshelf/.test(f.contentWindow?.location?.href || '')) f.__ltToken = 'kept';
      }
    });
    const before = (await shelf.locator('.cover-title').first().innerText()).trim();

    await openManager(page);
    const subject = await page.evaluate(() => {
      const el = document.querySelector('#tree-form [name="subject"]');
      return { value: el.value, placeholder: el.getAttribute('placeholder') || '' };
    });
    assert.equal(subject.value, '', '기본subject는 빈 칸');
    assert.ok(subject.placeholder.length > 0, 'placeholder가 있다');
    await page.fill('#tree-form [name="title"]', '우리의 첫 가을');
    await page.click('#tree-form button[type="submit"]');
    await page.waitForResponse((r) => r.request().method() === 'PUT' && /api\/workspace/.test(r.url()), { timeout: 10000 });
    const savedAt = saved.at(-1);
    const sameFrame = await page.evaluate(() => [...document.querySelectorAll('iframe')].some((f) => f.__ltToken === 'kept'));
    assert.equal(sameFrame, true, '저장 중 새로고침 없음');

    await page.evaluate(() => { location.hash = '#my/home'; });
    await page.waitForTimeout(300);
    await page.evaluate(() => { location.hash = '#my/shelf'; });
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => {
      try {
        const text = (f.contentDocument?.querySelector('.cover-title')?.textContent || '').trim();
        return /track32-bookshelf/.test(f.contentWindow.location.href) && text.length > 0;
      } catch { return false; }
    }), null, { timeout: 10000 });
    await page.waitForTimeout(300);
    const fresh = await page.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => /track32-bookshelf/.test(x.contentWindow?.location?.href || ''));
      const d = f?.contentDocument;
      return {
        cover: (d?.querySelector('.cover-title')?.textContent || '').trim(),
        strip: (d?.querySelector('#resumeTree')?.textContent || '').trim(),
        toast: (document.getElementById('toast')?.textContent || '').trim()
      };
    });
    assert.equal(before, '모아둔 순간');
    assert.equal(fresh.cover, '우리의 첫 가을', '저장 응답 뒤 표지 이름');
    assert.equal(fresh.strip, '우리의 첫 가을', '저장 응답 뒤 이어 보기 띠 이름');
    assert.deepEqual(errors, [], '페이지 오류 없음');
    if (SHOT) { mkdirSync(SHOT, { recursive: true }); await page.screenshot({ path: path.join(SHOT, '01-shelf-after-save-1440.png') }); }
    await c1.close();

    const { ctx: c2, page: wide, errors: wideErrors } = await openShell(browser, origin, fixtureTree(), 2560, 1080);
    await openManager(wide);
    await wide.click('[data-close="tree-manager"]');
    await wide.waitForFunction(() => document.getElementById('tree-manager')?.open === false, null, { timeout: 10000 });
    await clickToolbarTreeChoice(wide);
    await wide.click('[data-tree-action="tags"]');
    await wide.waitForFunction(() => document.getElementById('tag-panel')?.open === true, null, { timeout: 10000 });
    const panel = await wide.evaluate(() => {
      const head = document.querySelector('#tag-panel .panel-heading').getBoundingClientRect();
      const list = document.querySelector('#tag-panel .tag-manage-list').getBoundingClientRect();
      const text = document.getElementById('tag-panel').innerText;
      return { head: { x: Math.round(head.left), w: Math.round(head.width) }, list: { x: Math.round(list.left), w: Math.round(list.width) }, emptyCount: (text.match(/아직 꼬리표가 없어요/g) || []).length };
    });
    assert.ok(panel.head.w <= 960, `판 제목 폭 ${panel.head.w} <= 960`);
    assert.ok(panel.list.w <= 960, `목록 폭 ${panel.list.w} <= 960`);
    assert.ok(panel.head.x > 780, `판 제목이 가운데(Left ${panel.head.x})`);
    assert.equal(panel.emptyCount, 1, '빈 안내는 목록 자리 한 번만');
    assert.deepEqual(wideErrors, [], '페이지 오류 없음');
    if (SHOT) await wide.screenshot({ path: path.join(SHOT, '02-tag-panel-2560.png') });
    console.log(JSON.stringify({ before, savedAt, sameFrame, fresh, subject, panel }));
    await c2.close();
  } finally {
    await browser.close();
    await new Promise((ok) => server.close(ok));
  }
});
