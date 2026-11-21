// #1109: 정리 창과 순간 목록 창의 닫기 단추·뒤 덮개·390 크기를 같게, 정리 창 아래 단추는 스크롤 끝에서 보이게.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_DIALOG_UNIFY_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = '화면 시험용 브라우저가 없어 건너뜀';
} catch { skip = '화면 시험용 브라우저가 없어 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 건너뜀';

function sampleTree() {
  let tree = createTree({ subject: '정리 시험', title: '정리 시험', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
  tree.inbox = true;
  for (let i = 1; i < 12; i += 1) {
    tree = addMoment(tree, { title: `순간 ${i + 1}`, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, `2026-11-20T00:00:${String(i).padStart(2, '0')}Z`);
  }
  return tree;
}
const otherTree = () => createTree({ subject: '다른 트리', title: '다른 트리', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
const workspace = (tree) => JSON.stringify({ revision: 1, state: { version: 1, trees: [tree, otherTree()], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' });

async function withShell(tree, { width, height, theme }, fn) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  try {
    await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: workspace(tree) }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    await page.locator('#discover-ask-no').click().catch(() => {});
    await fn({ page, errors });
  } finally { await browser.close(); server.close(); }
}

const closeFacts = (root, selector) => root.locator(selector).evaluate((el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const bd = getComputedStyle(el, '::backdrop');
  return {
    aria: el.getAttribute('aria-label'),
    text: (el.textContent || '').trim(),
    width: Math.round(r.width), height: Math.round(r.height),
    radius: cs.borderTopLeftRadius, font: cs.fontSize,
    backdrop: bd.backgroundColor, blur: bd.backdropFilter,
    dialogWidth: Math.round(el.closest('dialog')?.getBoundingClientRect().width || el.getBoundingClientRect().width)
  };
});

test('#1109 두 창의 닫기 단추·덮개·폭이 같고 정리 창 아래 단추가 보인다', { skip: skip || undefined }, async (t) => {
  if (skip) { t.skip(skip); return; }
  const tree = sampleTree();
  for (const [width, height] of [[1440, 900], [390, 844]]) for (const theme of ['night', 'garden']) {
    await withShell(tree, { width, height, theme }, async ({ page, errors }) => {
      await page.locator('#record-menu').click();
      await page.locator('[data-tree-action="cleanup"]').click();
      await page.waitForSelector('#cleanup-panel[open]');
      const cleanup = await closeFacts(page, '#cleanup-panel [data-close="cleanup-panel"]');
      assert.equal(cleanup.aria, '닫기', '정리 창 닫기 단추 이름');
      assert.equal(cleanup.text, '×', '정리 창 닫기 단추 글자');
      // 본문을 맨 아래까지 스크롤해도 주 단추는 화면 안에 남는다.
      await page.locator('#cleanup-panel .cleanup-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(200);
      const foot = await page.evaluate(() => {
        const ids = ['cleanup-create', 'cleanup-move'];
        return ids.map((id) => {
          const el = document.getElementById(id);
          const r = el.getBoundingClientRect();
          return { id, hidden: !!el.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
        });
      });
      for (const b of foot) {
        assert.equal(b.hidden, false, `${b.id} 단추가 숨지 않는다`);
        assert.ok(b.w > 0 && b.h >= 44 && b.top >= 0 && b.bottom <= height, `${width}·${theme}: ${b.id} 단추가 화면 안에 있다 — ${JSON.stringify(b)}`);
      }
      await page.evaluate(() => document.getElementById('cleanup-panel').close());

      let frame = null;
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const ok = await f.evaluate(() => document.documentElement.getBoundingClientRect().width > 0 && !!document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]')).catch(() => false);
        if (ok) { frame = f; break; }
      }
      assert.ok(frame, '순간 목록을 든 화면을 찾는다');
      await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=moments],[data-do=index]').click());
      await frame.locator('.orbit-dialog[open]').waitFor({ state: 'attached', timeout: 8000 });
      const list = await closeFacts(frame, '.orbit-dialog button[data-do="close"]');
      assert.equal(list.aria, '닫기', '순간 목록 닫기 단추 이름');
      assert.equal(list.text, '×', '순간 목록 닫기 단추 글자');
      const tail = `${width}·${theme}`;
      assert.deepEqual({ w: list.width, h: list.height, radius: list.radius, font: list.font },
        { w: cleanup.width, h: cleanup.height, radius: cleanup.radius, font: cleanup.font }, `${tail}: 닫기 단추 모양이 같다`);
      assert.equal(list.backdrop, cleanup.backdrop, `${tail}: 뒤 덮개 색이 같다(${list.backdrop} vs ${cleanup.backdrop})`);
      assert.equal(list.blur, cleanup.blur, `${tail}: 뒤 덮개 흐림이 같다`);
      assert.equal(list.dialogWidth, cleanup.dialogWidth, `${tail}: 창 폭이 같다(${list.dialogWidth} vs ${cleanup.dialogWidth})`);
      if (width === 390) assert.equal(cleanup.dialogWidth, 390, '390: 두 창 모두 화면 꽉 참');
      else assert.ok(Math.abs(cleanup.dialogWidth - 900) <= 2, `1440: 두 창 모두 900px 카드(실측 ${cleanup.dialogWidth})`);
      assert.deepEqual(errors, [], `${tail}: 페이지 오류 없음`);
    });
  }
});