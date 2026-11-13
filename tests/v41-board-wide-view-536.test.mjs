// #536: 넓은 화면에서 판이 오른쪽에만 차는 문제 + 머리줄 [종이|밤] 단추의 실행형 시험.
// - 넓은 화면(2560) × 순간 1~3개: 판(.surface)이 화면 폭을 채운다(좌우 빈 공간이 한쪽으로 쏠리지 않는다).
// - 모아둔 순간 같은 별 모양(한 뿌리 + 자식 N) 트리: 카드가 판 폭을 고르게 쓴다(한 기둥이 아니다).
// - 기억한 자리(저장된 보기): 판 규칙(덮거나 가운데)을 거친다 — 판이 화면보다 좁으면 가운데에 선다.
// - 머리줄 [종이|밤]: 고급 기능을 켜지 않아도 보이고, 누르면 판·저장값·설정이 같은 값(lt41.boardTheme)으로 바뀐다.
// - 자기 기록(쓰기 가능)에는 '읽기 전용' 표시가 붙지 않는다(예시에는 붙는다 — #531 유지).
// - 390에서 머리줄이 넘치지 않는다(단순·고급 × 쓰기 가능·예시).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_BOARD_WIDE_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_BOARD_WIDE_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 보드 넓은 화면 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 보드 넓은 화면 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// 쓰기 가능(내 기록) 보드 호스트: 셸 없이 LT41(서버·쓰기 가능)을 넘긴다(#520 시험과 같은 방식).
const hostHTML = (tree) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>보드 호스트</title></head><body>
<script>window.LT41={source:'server',writable:true,momentId:${JSON.stringify(tree.moments[0].id)},prefs:{},tree:${JSON.stringify(tree)}};</script>
<iframe src="/v41/views/track58-pinboard.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const chainTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 'm' + (i + 1), title: '순간 ' + (i + 1), date: '2026-01-0' + ((i % 9) + 1), emotion: '설렘', note: '메모',
    parentId: i ? 'm' + i : null, relation: i ? '이어서' : '', url: '', x: null, y: null, rot: 0, color: 'rose', keywords: []
  }));
  const edges = [];
  for (let i = 2; i <= n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 'm' + (i - 1), to: 'm' + i, reason: '이어서' });
  return { id: 't' + n, title: '사슬 ' + n, moments, edges };
};
// 모아둔 순간과 같은 만들기 경로(빠른 추가): 전부 한 뿌리의 자식(별 모양), 자리 저장 없음.
const starTree = (n) => {
  const moments = Array.from({ length: n }, (_, i) => ({
    id: 's' + i, title: '모은 순간 ' + (i + 1), date: '2026-01-01', emotion: '설렘', note: '메모',
    parentId: i ? 's0' : null, relation: '', url: i ? 'https://youtu.be/dQw4w9WgXcQ' : '', x: null, y: null, rot: 0, color: 'violet', keywords: []
  }));
  const edges = [];
  for (let i = 1; i < n; i++) edges.push({ id: 'e' + i, kind: 'parent', from: 's0', to: 's' + i, reason: '' });
  return { id: 'star' + n, title: '모아둔 ' + n, moments, edges };
};

function serve(extra = {}) {
  const server = createServer(async (req, res) => {
    const clean = decodeURIComponent((req.url || '/').split('?')[0]);
    if (extra[clean]) { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end(extra[clean]); return; }
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

async function openHost(browser, url, { width, height, savedView } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  if (savedView) {
    await context.addInitScript((v) => { try { localStorage.setItem('lt41.boardView', JSON.stringify(v)); } catch {} }, savedView);
  }
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
    if (!frame) await page.waitForTimeout(250);
  }
  assert.ok(frame, '보드 프레임이 열린다');
  await frame.waitForSelector('.surface', { timeout: 20000 });
  await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  return { context, page, frame };
}

const geometry = (frame) => frame.evaluate(() => {
  const vw = innerWidth;
  const s = document.querySelector('.surface').getBoundingClientRect();
  const cards = [...document.querySelectorAll('#cardLayer .card')].map((c) => c.getBoundingClientRect());
  const left = cards.length ? Math.min(...cards.map((r) => r.left)) : 0;
  const right = cards.length ? Math.max(...cards.map((r) => r.right)) : 0;
  let overlap = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const ox = Math.min(cards[i].right, cards[j].right) - Math.max(cards[i].left, cards[j].left);
    const oy = Math.min(cards[i].bottom, cards[j].bottom) - Math.max(cards[i].top, cards[j].top);
    if (ox > 2 && oy > 2) overlap++;
  }
  return {
    vw, zoom: document.getElementById('zoomLabel').textContent,
    surface: { left: Math.round(s.left), right: Math.round(s.right), width: Math.round(s.width) },
    cover: (Math.min(s.right, vw) - Math.max(s.left, 0)) / vw,
    bundleWidth: Math.round(right - left), overlap
  };
});

test('#536 넓은 화면 × 순간 1~3개: 판이 화면 폭을 채우고 한쪽으로 쏠리지 않는다(1440·1920·2560)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const trees = [chainTree(1), chainTree(2), chainTree(3)];
  const server = await serve(Object.fromEntries(trees.map((t) => ['/__host-' + t.id + '.html', hostHTML(t)])));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1080]]) {
      for (const tree of trees) {
        const { context, frame } = await openHost(browser, `${base}/__host-${tree.id}.html`, { width: w, height: h });
        const g = await geometry(frame);
        assert.ok(g.cover >= 0.85, `${w} ${tree.title}: 판이 화면 폭의 85% 이상 (${(g.cover * 100).toFixed(1)}%) — 전: 2560에서 66%`);
        assert.ok(g.surface.left <= w * 0.15, `${w} ${tree.title}: 판 왼쪽 빈 공간은 화면의 15% 이하 (${g.surface.left}px) — 전: 2560에서 863px(34%)`);
        await context.close();
      }
    }
  } finally { await browser.close(); server.close(); }
});

test('#536 순간 40개 사슬의 처음 보기는 넓은 화면에서도 판을 채운다(지금과 같다)', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(40);
  const server = await serve({ '/__host-40.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [w, h] of [[1440, 900], [2560, 1080]]) {
      const { context, frame } = await openHost(browser, `${base}/__host-40.html`, { width: w, height: h });
      const g = await geometry(frame);
      assert.ok(g.cover >= 0.9, `${w}: 순간 40개 판 덮음 ${(g.cover * 100).toFixed(1)}% ≥ 90%`);
      assert.equal(g.zoom, '80%', `${w}: 읽을 수 있는 0.8배 처음 보기 유지`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('#536 별 모양 트리(모아둔 순간 26): 카드가 판 폭을 고르게 쓰고 겹치지 않는다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-star.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, frame } = await openHost(browser, `${base}/__host-star.html`, { width: 1440, height: 900 });
    const g = await geometry(frame);
    assert.equal(g.overlap, 0, '겹친 카드 쌍 0');
    // 전: 한 기둥(카드 묶음 폭 ≈ 카드 한 장 + 옆 열 = 화면의 ~31%). 후: 열로 펼쳐 묶음 폭 700px 이상.
    assert.ok(g.bundleWidth >= 700, `카드 묶음 폭 ${g.bundleWidth}px ≥ 700px (전: 449px 기둥)`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#536 기억한 자리도 판 규칙을 거친다: 판이 화면보다 좁으면 가운데에 선다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = starTree(26);
  const server = await serve({ '/__host-star.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    // 사용자가 0.38배로 줄여 왼쪽을 보고 있던 자리(보고서의 재현 상태)를 기억해 둔 것으로 흉내.
    const saved = { [tree.id]: { cx: 500, cy: 2000, z: 0.38, t: 1 } };
    const { context, frame } = await openHost(browser, `${base}/__host-star.html`, { width: 2000, height: 1100, savedView: saved });
    const g = await geometry(frame);
    assert.equal(g.zoom, '38%', '기억한 배율을 그대로 연다(#490·#492 유지)');
    const centerLeft = Math.round((g.vw - g.surface.width) / 2);
    assert.ok(Math.abs(g.surface.left - centerLeft) <= 4, `판이 화면 가운데에 선다 (left ${g.surface.left} ≈ ${centerLeft}) — 전: 저장값 그대로라 한쪽으로 쏠림`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#536 머리줄 [종이|밤]: 고급을 켜지 않아도 보이고, 한 벌이며, 누르면 판·저장값이 바뀐다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(3);
  const server = await serve({ '/__host-3.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const { context, page, frame } = await openHost(browser, `${base}/__host-3.html`, { width: 1440, height: 900 });
    const state = await frame.evaluate(() => {
      const header = document.querySelector('header');
      const sw = document.querySelector('.boardThemeSwitch');
      return {
        inHeader: !!sw && header.contains(sw),
        toolbarSwitch: !!document.querySelector('.toolbar .boardThemeSwitch'),
        visible: sw && getComputedStyle(sw).display !== 'none' && sw.getBoundingClientRect().width > 0,
        pressed: document.querySelector('[data-board-theme="paper"]')?.getAttribute('aria-pressed')
      };
    });
    assert.equal(state.inHeader, true, '전환은 머리줄에 있다');
    assert.equal(state.toolbarSwitch, false, '도구 줄에는 두 벌째가 없다');
    assert.equal(state.visible, true, '고급을 켜지 않아도 보인다');
    await frame.locator('header .boardThemeSwitch [data-board-theme="night"]').click();
    await page.waitForTimeout(400);
    const after = await frame.evaluate(() => ({
      plate: document.documentElement.getAttribute('data-lt-board-theme'),
      stored: localStorage.getItem('lt41.boardTheme'),
      pressedNight: document.querySelector('[data-board-theme="night"]')?.getAttribute('aria-pressed')
    }));
    assert.equal(after.plate, 'night', '누르면 열린 보드 판이 바로 밤이 된다');
    assert.equal(after.stored, 'night', '설정과 같은 값(lt41.boardTheme)을 쓴다');
    assert.equal(after.pressedNight, 'true', '눌린 쪽이 표시된다');
    await frame.locator('header .boardThemeSwitch [data-board-theme="paper"]').click();
    await page.waitForTimeout(300);
    assert.equal(await frame.evaluate(() => localStorage.getItem('lt41.boardTheme')), 'paper', '종이로 되돌린다');
    await context.close();
  } finally { await browser.close(); server.close(); }
});

test('#536 표시·390 머리줄: 자기 기록에는 읽기 전용 표시가 없고, 예시에는 있으며, 390에서 머리줄이 넘치지 않는다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`CI에서는 건너뜀이 실패다 — ${skip}`);
  const tree = chainTree(3);
  const server = await serve({ '/__host-3.html': hostHTML(tree) });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    // 자기 기록(쓰기 가능): '읽기 전용' 표시 없음 + 390 단순·고급에서 머리줄 넘침 0
    for (const [w, h, mobile] of [[1440, 900, false], [390, 852, true]]) {
      for (const advanced of [false, true]) {
        const { context, frame } = await openHost(browser, `${base}/__host-3.html`, { width: w, height: h });
        if (advanced) await frame.evaluate(() => document.body.classList.add('lt-advanced'));
        await page_stable(frame);
        const m = await frame.evaluate(() => {
          const header = document.querySelector('header');
          const badge = document.getElementById('themeBadge');
          const picker = document.querySelector('.lt-moment-picker');
          let overlap = null;
          if (picker && badge) {
            const b = badge.getBoundingClientRect(), p = picker.getBoundingClientRect();
            overlap = Math.max(0, Math.round(Math.min(b.right, p.right) - Math.max(b.left, p.left))) * Math.max(0, Math.round(Math.min(b.bottom, p.bottom) - Math.max(b.top, p.top)));
          }
          return { badge: badge?.textContent.trim(), overflow: header.scrollWidth - header.clientWidth, overlap, switchVisible: getComputedStyle(document.querySelector('.boardThemeSwitch')).display !== 'none' };
        });
        assert.ok(!m.badge.includes('읽기 전용'), `${w} ${advanced ? '고급' : '단순'}: 자기 기록에 '읽기 전용' 표시가 없다 (${m.badge})`);
        assert.equal(m.overflow, 0, `${w} ${advanced ? '고급' : '단순'}: 머리줄 넘침 0`);
        assert.equal(m.switchVisible, true, `${w} ${advanced ? '고급' : '단순'}: 머리줄 전환이 보인다`);
        if (mobile) assert.equal(m.overlap, 0, '390: 읽기 전용 표시·선택 줄 겹침 0 유지(#521)');
        await context.close();
      }
    }
    // 예시(읽기 전용): '읽기 전용' 표시 유지(#531·#521 계약)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${base}/v41/#board`, { waitUntil: 'load' });
    let frame = null;
    for (let i = 0; i < 80 && !frame; i++) {
      frame = page.frames().find((f) => f !== page.mainFrame() && /views\/track58-pinboard/.test(f.url()));
      if (!frame) await page.waitForTimeout(250);
    }
    assert.ok(frame, '예시 보드 프레임이 열린다');
    await frame.waitForSelector('.surface', { timeout: 20000 });
    await frame.waitForFunction(() => document.querySelectorAll('#cardLayer .card').length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(1000);
    const badge = await frame.evaluate(() => document.getElementById('themeBadge')?.textContent.trim());
    assert.ok(badge.includes('읽기 전용'), `예시 보드에는 '읽기 전용' 표시가 유지된다 (${badge})`);
    await context.close();
  } finally { await browser.close(); server.close(); }
});

async function page_stable(frame) {
  await frame.waitForTimeout(600);
}
