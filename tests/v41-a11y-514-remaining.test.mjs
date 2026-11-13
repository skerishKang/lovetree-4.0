// #514: 2026-11-13 전 화면 재점검에서 남은 moderate 이하 항목을 실제 화면에서 잰다.
// - meta-viewport: 안쪽 화면 문서가 확대를 막지 않는다(최대 배율·확대 금지 없음).
// - region: 책·보드·지도 안쪽 문서에 main 랜드마크가 있어 내용이 지역 밖에 있지 않다.
// - heading-order: 보드가 h1 → (h2) → 카드 h3 순서를 지킨다.
// - 메모(#531 뒤속): 모바일 '선택한 순간' 줄의 top 은 머리줄 높이에서 계산한다 —
//   머리줄이 두 줄이 되어도 '읽기 전용' 표시와 겹치지 않는다.
// 로그아웃 예시 화면만 쓴다(계정 불필요). 크롬 1개, finally 닫기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_A11Y514_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_A11Y514_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 #514 접근성 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 #514 접근성 시험을 건너뜀'; }
let AXE_SOURCE = '';
try { AXE_SOURCE = await readFile(fileURLToPath(new URL('../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8'); } catch { if (!skip) skip = 'axe-core가 없어 #514 접근성 시험을 건너뜀'; }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const RULES = ['meta-viewport', 'region', 'heading-order', 'landmark-unique', 'empty-heading', 'landmark-one-main'];

const SCREENS = [
  { name: '책', hash: '#book', re: /track59-sketchbook/ },
  { name: '보드', hash: '#board', re: /track58-pinboard/ },
  { name: '지도', hash: '#network', re: /track56-network/ }
];

function serve() {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const file of [path.join(ROOT, clean), path.join(ROOT, clean, 'index.html')]) {
      if (path.relative(ROOT, file).startsWith('..')) continue;
      try {
        if (!(await stat(file)).isFile()) continue;
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        createReadStream(file).pipe(res); return;
      } catch {}
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function openScreen(browser, base, { width, theme, screen }) {
  const mobile = width === 390;
  const context = await browser.newContext({ viewport: { width, height: mobile ? 852 : 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
  await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  const page = await context.newPage();
  await page.goto(`${base}/v41/${screen.hash}`, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => screen.re.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, `${screen.name} 안쪽 화면이 열린다`);
  await page.waitForTimeout(1200);
  await frame.evaluate(AXE_SOURCE).catch(() => {});
  return { context, page, frame };
}

function axeIn(frame) {
  return frame.evaluate(async (rules) => {
    if (!window.axe?.run) return { error: 'axe 없음' };
    const r = await window.axe.run(document, { resultTypes: ['violations'], iframes: false, runOnly: { type: 'rule', values: rules } });
    return { violations: r.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })) };
  }, RULES).catch((e) => ({ error: e.message }));
}

test('#514 meta-viewport: 책·보드·지도 안쪽 문서가 확대를 막지 않는다 × 390·1440 × 밤·정원', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 1440]) {
      for (const theme of ['night', 'garden']) {
        for (const screen of SCREENS) {
          const { context, frame } = await openScreen(browser, base, { width, theme, screen });
          const meta = await frame.evaluate(() => document.querySelector('meta[name="viewport"]')?.content || null);
          assert.ok(meta, `${screen.name}: viewport meta가 있다`);
          assert.doesNotMatch(meta, /maximum-scale/i, `${screen.name} ${width}: 최대 배율로 확대를 막지 않는다(전: maximum-scale=1)`);
          assert.doesNotMatch(meta, /user-scalable\s*=\s*no/i, `${screen.name} ${width}: 확대 금지를 두지 않는다(전: user-scalable=no)`);
          const axe = await axeIn(frame);
          const pmv = (axe.violations || []).filter((v) => v.id === 'meta-viewport');
          assert.equal(pmv.length, 0, `${screen.name} ${width}: axe meta-viewport 위반 0(전: 1)`);
          await context.close();
        }
      }
    }
  } finally { await browser?.close(); server.close(); }
});

test('#514 region: 책·보드·지도 내용이 전부 랜드마크 안에 있다(main 하나) × 390·1440 × 밤·정원', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 1440]) {
      for (const theme of ['night', 'garden']) {
        for (const screen of SCREENS) {
          const { context, frame } = await openScreen(browser, base, { width, theme, screen });
          const land = await frame.evaluate(() => ({
            mains: document.querySelectorAll('main,[role="main"]').length,
            outside: document.querySelectorAll('main').length ? true : false
          }));
          assert.equal(land.mains, 1, `${screen.name} ${width}: main 랜드마크가 정확히 하나다(전: 0)`);
          const axe = await axeIn(frame);
          const region = (axe.violations || []).filter((v) => v.id === 'region');
          assert.equal(region.length, 0, `${screen.name} ${width} ${theme}: 지역 밖 내용 0건(전: ${screen.name === '보드' ? '50~51' : screen.name === '지도' ? '2' : '0'}개)`);
          await context.close();
        }
      }
    }
  } finally { await browser?.close(); server.close(); }
});

test('#514 heading-order: 보드는 h1 → h2(순간 카드) → 카드 h3 순서를 지킨다 × 390·1440 × 밤·정원', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [390, 1440]) {
      for (const theme of ['night', 'garden']) {
        const { context, frame } = await openScreen(browser, base, { width, theme, screen: SCREENS[1] });
        const order = await frame.evaluate(() => {
          const seq = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
          const grouping = document.querySelector('h2.sr-only');
          const cardLayer = document.getElementById('cardLayer');
          return {
            first: seq.slice(0, 3),
            maxJump: seq.reduce((worst, level, i) => (i && level - seq[i - 1] > 1 ? Math.max(worst, level - seq[i - 1]) : worst), 0),
            groupBeforeCards: Boolean(grouping && cardLayer && (grouping.compareDocumentPosition(cardLayer) & Node.DOCUMENT_POSITION_FOLLOWING)),
            groupText: grouping?.textContent.trim() || null
          };
        });
        assert.equal(order.first[0], 1, `${width} ${theme}: 문서가 h1로 시작한다`);
        assert.equal(order.first[1], 2, `${width} ${theme}: 다음 제목이 h2다(전: h1 다음이 곧바로 h3)`);
        assert.equal(order.maxJump, 0, `${width} ${theme}: 제목 단계를 건너뛰지 않는다(전: h1→h3)`);
        assert.equal(order.groupBeforeCards, true, `${width} ${theme}: 카드 묶음 h2가 카드보다 앞에 있다`);
        const axe = await axeIn(frame);
        assert.equal((axe.violations || []).filter((v) => v.id === 'heading-order').length, 0, `${width} ${theme}: axe heading-order 위반 0(전: 1)`);
        await context.close();
      }
    }
  } finally { await browser?.close(); server.close(); }
});

test('#514 메모: 모바일 선택 줄 top을 머리줄 높이에서 계산한다 — 머리줄이 두 줄이 되어도 겹침 0', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const theme of ['night', 'garden']) {
      const { context, frame } = await openScreen(browser, base, { width: 390, theme, screen: SCREENS[1] });
      const measure = () => frame.evaluate(() => {
        const badge = document.getElementById('themeBadge');
        const picker = document.querySelector('.lt-moment-picker');
        const b = badge.getBoundingClientRect(), p = picker.getBoundingClientRect();
        const w = Math.max(0, Math.round(Math.min(b.right, p.right) - Math.max(b.left, p.left)));
        const h = Math.max(0, Math.round(Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top)));
        return { badgeBottom: Math.round(b.bottom), pickerTop: Math.round(p.top), overlap: w * h, cssVar: getComputedStyle(document.documentElement).getPropertyValue('--lt-board-picker-top').trim() };
      });
      const one = await measure();
      assert.match(one.cssVar, /^\d+px$/, `${theme}: top을 계산한 값(변수)으로 쓴다(전: 고정 96px)`);
      assert.equal(one.overlap, 0, `${theme}: 한 줄 머리에서 겹침 0`);
      assert.ok(one.pickerTop >= one.badgeBottom, `${theme}: 선택 줄이 표시 아래에서 시작한다`);

      // 머리줄이 두 줄이 된 상황: 표시가 두 줄로 늘고 머리줄도 높아진다.
      const two = await frame.evaluate(async () => {
        const badge = document.getElementById('themeBadge');
        badge.style.maxWidth = '120px';
        badge.style.whiteSpace = 'normal';
        badge.textContent = '진주빛 보드 · 읽기 전용 · 두 줄이 된 머리 표시';
        document.querySelector('header').style.height = '96px';
        await new Promise((r) => setTimeout(r, 260));
        const b = badge.getBoundingClientRect(), p = document.querySelector('.lt-moment-picker').getBoundingClientRect();
        const w = Math.max(0, Math.round(Math.min(b.right, p.right) - Math.max(b.left, p.left)));
        const h = Math.max(0, Math.round(Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top)));
        return { badgeBottom: Math.round(b.bottom), pickerTop: Math.round(p.top), overlap: w * h, cssVar: getComputedStyle(document.documentElement).getPropertyValue('--lt-board-picker-top').trim() };
      });
      assert.ok(two.badgeBottom > one.badgeBottom, `${theme}: 표시가 실제로 두 줄이 되어 아래끝이 내려갔다`);
      assert.equal(two.overlap, 0, `${theme}: 머리줄이 두 줄이 되어도 겹침 0(전: 480px²)`);
      assert.ok(two.pickerTop >= two.badgeBottom, `${theme}: 선택 줄이 늘어난 표시 아래로 따라 내려간다`);
      await context.close();
    }
  } finally { await browser?.close(); server.close(); }
});
