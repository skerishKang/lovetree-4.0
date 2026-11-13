// 지도 판: 실제 셸 설정 → 프레임 수신 → 다시 그리기와 클릭 흐름을 로그아웃 예시로 시험한다.
// 계정 입구는 열지 않는다. 설정 dialog만 showModal()로 드러낸 뒤 실제 선택 단추를 누른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleMap } from './helpers/map-contrast.mjs';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.env.LT_MAP_CONTRAST_ROOT || fileURLToPath(new URL('../public', import.meta.url)));
const REQUIRE = process.env.LT_MAP_CONTRAST_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 지도 흐름 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 지도 흐름 시험을 건너뜀'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
async function serve() {
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function openMap(browser, base, { width, appTheme, plate = 'paper' }) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 852 : 900 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ appTheme, plate }) => {
    if (window.top === window && !localStorage.getItem('map-flow-initialized')) {
      localStorage.setItem('map-flow-initialized', '1');
      localStorage.setItem('lt41.theme', appTheme);
      localStorage.setItem('lt41.boardTheme', plate);
    }
    // 완성된 지도 한 장을 칠하는 background fillRect만 센다. 검사 자체는 rAF를 만들지 않는다.
    window.__mapDrawCount = 0;
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.id === 'stage' && args[0] === 0 && args[1] === 0) window.__mapDrawCount++;
      return fill.apply(this, args);
    };
  }, { appTheme, plate });
  const page = await context.newPage(), errors = [], dialogs = [];
  let loads = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
  page.on('framenavigated', frame => { if (/track56-network/.test(frame.url())) loads++; });
  await page.goto(`${base}/v41/#network`, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => f.contentWindow?.__lt?.dots().length));
  const frame = page.frames().find(f => /track56-network/.test(f.url()));
  assert.ok(frame, '로그아웃 예시 지도 프레임이 열린다');
  await frame.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2100); // 첫 로드·글꼴·셸의 지연 설정 전달이 끝난 뒤
  assert.equal(await page.evaluate(() => window.LT41?.source), 'example', '계정 대신 예시 트리만 쓴다');
  return { context, page, frame, errors, dialogs, loads: () => loads };
}

async function fingerprint(frame) {
  return frame.evaluate(async () => {
    const c = document.getElementById('stage');
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const canvas = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    const surfaces = ['.legend', '.controls', '.detail', '.top-actions .pill', '.hero p'].map(sel => {
      const cs = getComputedStyle(document.querySelector(sel));
      return [sel, cs.color, cs.backgroundColor, cs.backgroundImage, cs.borderColor];
    });
    return { canvas, surfaces, dots: window.__lt.dots() };
  });
}

// 그려진 화면 지문은 연출·글꼴이 다 끝난 뒤에야 같아진다. 느린 환경에서는 한 번 읽어 비교하면 가끔 어긋나므로,
// 같아질 때까지 잠깐씩 다시 읽는다(최대 약 4초). 끝내 다르면 마지막 값으로 단언이 실패한다.
async function fingerprintMatching(frame, expected) {
  let got = await fingerprint(frame);
  for (let i = 0; i < 12 && JSON.stringify(got) !== JSON.stringify(expected); i += 1) {
    await new Promise(r => setTimeout(r, 350));
    got = await fingerprint(frame);
  }
  return got;
}

async function settingsPlate(page, frame, plate) {
  await page.evaluate(() => document.getElementById('account-settings').showModal());
  await page.locator(`#account-settings button[data-board-theme="${plate}"]`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await frame.evaluate(() => { window.__mapDrawCount = 0; });
  await page.locator(`#account-settings button[data-board-theme="${plate}"]`).click();
  await page.waitForTimeout(180);
  assert.equal(await frame.evaluate(() => document.documentElement.dataset.ltBoardTheme), plate, '설정 선택이 열린 지도에 전달된다');
  assert.equal(await page.evaluate(() => localStorage.getItem('lt41.boardTheme')), plate, '보드와 같은 저장 키');
  assert.equal(await frame.evaluate(() => window.__mapDrawCount), 1, '바뀐 판은 한 번만 그린다');
  await page.evaluate(() => document.getElementById('account-settings').close());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
}

async function assertIdle(frame, page, plate) {
  await frame.evaluate(plate => {
    window.__mapDrawCount = 0;
    // 셸이 같은 속성과 같은 메시지를 다시 보내도 같은 화면을 다시 칠하지 않는다.
    for (let i = 0; i < 3; i++) {
      document.documentElement.setAttribute('data-lt-board-theme', plate);
      window.postMessage({ type: 'lt41-board-theme', value: plate }, location.origin);
    }
  }, plate);
  await page.waitForTimeout(600);
  assert.equal(await frame.evaluate(() => window.__mapDrawCount), 0, '같은 설정 반복·유휴 그리기 0');
}

async function clickMapObject(frame, kind) {
  // 연출이 끝난 좌표를 읽고 누른다. 느린 CI에서는 그래도 누르는 사이 화면이 움직여 빗나갈 수 있어,
  // 눌린 결과(고른 순간·묶음)가 기대와 다르면 다시 멈추기를 기다려 누른다(최대 4번). 그래도 다르면 호출한 쪽 단언이 잡는다.
  let point = null;
  const tries = [];
  await frame.evaluate(() => {
    if (window.__mapPointerLog) return;
    window.__mapPointerLog = [];
    for (const type of ['pointerdown', 'pointerup', 'pointercancel']) document.addEventListener(type, e => window.__mapPointerLog.push(`${type}@${Math.round(e.clientX)},${Math.round(e.clientY)}>${e.target?.id || e.target?.tagName}`), true);
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await settleMap(frame);
    point = await frame.evaluate(kind => {
      const candidates = kind === 'hub' ? window.__lt.hubs() : window.__lt.dots().filter(n => !n.first);
      return candidates.find(n => document.elementFromPoint(n.x, n.y)?.id === 'stage');
    }, kind);
    assert.ok(point, `${kind}: 실제 누를 수 있는 좌표가 있다`);
    await frame.evaluate(() => { window.__mapPointerLog.length = 0; });
    await frame.locator('#stage').click({ position: { x: point.x, y: point.y } });
    const hit = await frame.evaluate(({ kind, id }) => (kind === 'hub' ? window.__lt.state.cluster?.id : window.__lt.state.selected?.id) === id, { kind, id: point.id });
    if (hit) return point;
    // 빗나간 까닭을 남긴다(실패 글에 그대로 나온다): 누른 자리, 실제로 온 누름, 누른 뒤 상태와 그 묶음·점의 지금 자리.
    tries.push(await frame.evaluate(({ kind, point }) => {
      const s = window.__lt.state, now = (kind === 'hub' ? window.__lt.hubs() : window.__lt.dots()).find(n => n.id === point.id), r = document.getElementById('stage').getBoundingClientRect();
      return { at: [Math.round(point.x), Math.round(point.y)], now: now ? [Math.round(now.x), Math.round(now.y)] : null, mode: s.mode, view: s.view, selected: s.selected?.id || null, cluster: s.cluster?.id || null, drag: !!s.drag, stage: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inner: [innerWidth, innerHeight], pointer: window.__mapPointerLog.splice(0) };
    }, { kind, point }));
    await new Promise(r => setTimeout(r, 400));
  }
  assert.fail(`${kind} 누르기가 네 번 모두 빗나감: ${JSON.stringify(tries)}`);
}

async function interactions({ page, frame, width }) {
  const stored = await page.evaluate(() => localStorage.getItem('lt41.boardTheme'));
  for (const surface of [page, frame]) await surface.evaluate(() => {
    window.__mapThemeNotices = [];
    const target = document.getElementById('toast');
    new MutationObserver(() => {
      const text = target.textContent || '';
      if (/판.*(?:바꿔|테마)/.test(text)) window.__mapThemeNotices.push(text);
    }).observe(target, { childList: true, subtree: true, characterData: true });
  });
  const dot = await clickMapObject(frame, 'dot');
  assert.equal(await frame.evaluate(() => window.__lt.state.selected?.id), dot.id, '점 클릭이 그 순간을 고른다');
  await frame.waitForFunction(() => document.getElementById('detail').classList.contains('open'));
  await frame.locator('#detailClose').click();
  assert.equal(await frame.locator('#detail').evaluate(el => el.classList.contains('open')), false, '상세 닫기');
  // #529: 닫힌 상세 창 안으로 초점이 가도 지도 겹이 옆으로 밀리지 않는다(밀리면 이후 누르기가 전부 395px 빗나갔다).
  assert.deepEqual(await frame.evaluate(() => {
    document.getElementById('detailClose').focus();
    const app = document.querySelector('.app'), left = Math.round(document.getElementById('stage').getBoundingClientRect().left);
    document.activeElement?.blur?.();
    return [left, app.scrollLeft, app.scrollTop];
  }), [0, 0, 0], '닫힌 상세 창에 초점이 가도 지도가 밀리지 않는다');
  await frame.locator('#overviewBtn').click();
  const hub = await clickMapObject(frame, 'hub');
  assert.equal(await frame.evaluate(() => window.__lt.state.cluster?.id), hub.id, '묶음 클릭');
  if (width === 1440) {
    const viewport = page.viewportSize();
    await page.setViewportSize({ ...viewport, width: 1340 });
    await page.waitForTimeout(120);
    const centered = await frame.evaluate(id => {
      const p = window.__lt.hubs().find(h => h.id === id), b = window.__lt.box();
      return { id: window.__lt.state.cluster?.id, dx: Math.abs(p.x - b.x - b.w / 2), dy: Math.abs(p.y - b.y - b.h / 2) };
    }, hub.id);
    assert.equal(centered.id, hub.id, '크기 변경 뒤 고른 묶음 유지');
    assert.ok(centered.dx < 1 && centered.dy < 1, `크기 변경 뒤 묶음을 새 상자 가운데에 유지 (${centered.dx}, ${centered.dy})`);
    await frame.locator('#overviewBtn').click();
    await page.setViewportSize(viewport);
    await page.waitForTimeout(120);
  }
  await frame.locator('#overviewBtn').click();
  await frame.locator('#viewConc').click();
  assert.equal(await frame.evaluate(() => window.__lt.state.view), 'concentric', '동심원형 전환');
  await clickMapObject(frame, 'dot');
  await frame.locator('#detailClose').click();
  await frame.locator('#overviewBtn').click();
  await frame.locator('#viewNet').click();
  assert.equal(await frame.evaluate(() => window.__lt.state.view), 'network', '그물형 전환');
  if (width > 980) {
    await frame.locator('#zoomIn').click();
    assert.ok(await frame.evaluate(() => window.__lt.state.scale > 1), '확대 단추');
    await frame.locator('#zoomOut').click();
    assert.ok(await frame.evaluate(() => window.__lt.state.scale < 1.18), '축소 단추');
    await frame.locator('#focusFirst').click();
  } else {
    // 모바일에서는 탐색 창을 숨긴다. 실제 캔버스 확대·축소 입력과 아래 첫 순간 단추를 쓴다.
    const point = await frame.evaluate(() => window.__lt.dots().find(n => document.elementFromPoint(n.x, n.y)?.id === 'stage'));
    await frame.locator('#stage').hover({ position: { x: point.x, y: point.y } });
    await page.keyboard.down('Control');
    try {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
      assert.ok(await frame.evaluate(() => window.__lt.state.scale > 1), '모바일 확대 입력');
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(80);
      assert.ok(await frame.evaluate(() => window.__lt.state.scale < 1.08), '모바일 축소 입력');
    } finally { await page.keyboard.up('Control'); }
    await frame.locator('#mobileRibbon button.origin').click();
  }
  assert.equal(await frame.evaluate(() => window.__lt.state.selected?.id), await frame.evaluate(() => window.__lt.FIRST.id), '첫 순간 보기');
  await frame.locator('#detailClose').click();
  await frame.locator('#overviewBtn').click();
  assert.equal(await frame.evaluate(() => window.__lt.state.scale), 1, '전체 보기 배율');
  assert.equal(await frame.evaluate(() => window.__lt.state.selected), null, '전체 보기 선택 해제');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1700); // 묶음 등장 연출 종료
  assert.equal(await page.evaluate(() => localStorage.getItem('lt41.boardTheme')), stored, '일반 클릭은 판 값을 바꾸지 않는다');
  for (const surface of [page, frame]) assert.deepEqual(await surface.evaluate(() => window.__mapThemeNotices), [], '일반 클릭의 엉뚱한 판 알림 0');
  await assertIdle(frame, page, stored);
}

test('지도 판 실제 흐름: 설정·저장 복원·두 보기·누르기·유휴 0 (1440·390 × 밤·정원)', { skip: REQUIRE ? false : skip, timeout: 180000 }, async t => {
  if (skip) assert.fail(`CI에서는 지도 흐름 건너뜀이 실패다 — ${skip}`);
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1440, 390]) for (const appTheme of ['night', 'garden']) {
      await t.test(`${width} ${appTheme}: 종이 ↔ 밤, 저장한 첫 화면과 일치`, async () => {
        const live = await openMap(browser, base, { width, appTheme });
        try {
          const initialLoads = live.loads(), paper = await fingerprint(live.frame);
          await settingsPlate(live.page, live.frame, 'night');
          const switched = await fingerprint(live.frame);
          assert.notEqual(switched.canvas, paper.canvas, '밤 판은 실제 그려진 픽셀이 달라진다');
          const fresh = await openMap(browser, base, { width, appTheme, plate: 'night' });
          try {
            assert.deepEqual(await fingerprintMatching(fresh.frame, switched), switched, '바로 바꾼 밤 판 = 저장 후 처음 연 밤 판 (캔버스 픽셀·패널 색·점 자리)');
            assert.deepEqual(fresh.errors, [], '저장 복원 페이지 오류 0');
          } finally { await fresh.context.close(); }
          await settingsPlate(live.page, live.frame, 'paper');
          assert.deepEqual(await fingerprintMatching(live.frame, paper), paper, '바로 바꾼 종이 판 = 저장 후 처음 연 종이 판');
          await settingsPlate(live.page, live.frame, 'night');
          await assertIdle(live.frame, live.page, 'night');
          await interactions({ ...live, width });
          const positions = rows => rows.map(({ id, x, y }) => ({ id, x, y }));
          const beforePaperSwitch = positions((await fingerprint(live.frame)).dots);
          await settingsPlate(live.page, live.frame, 'paper');
          // 크기 변경은 기존 배치를 다시 잰다. 판 전환 전후의 같은 상태끼리 비교한다.
          assert.deepEqual(positions((await fingerprint(live.frame)).dots), beforePaperSwitch, '판 전환 자체는 배치를 바꾸지 않는다');
          await interactions({ ...live, width });
          assert.equal(live.loads(), initialLoads, '판 전환·클릭·반복 메시지에서 프레임 다시 뜨기 0');
          assert.deepEqual(live.errors, [], '페이지 오류 0');
          assert.deepEqual(live.dialogs, [], '엉뚱한 브라우저 알림 0');
          t.diagnostic(`${width} ${appTheme}: 저장/즉시 픽셀 동일, 전환 1회 그리기, 유휴 0, 일반 클릭 판 알림 0, 재로딩 0`);
        } finally { await live.context.close(); }
      });
    }
    await t.test('보드 도구 줄에서 고른 판도 지도와 설정이 함께 쓴다', async () => {
      const live = await openMap(browser, base, { width: 1440, appTheme: 'night' });
      try {
        await live.page.evaluate(() => { localStorage.setItem('lt41.advanced.', '1'); location.hash = 'board'; });
        await live.page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => !f.hidden && /track58-pinboard/.test(f.src || f.contentWindow.location.href) && f.contentDocument?.querySelector('#cardLayer .card')));
        await live.page.waitForTimeout(800); // 셸이 가려진 이전 장을 비우는 600ms 교대가 끝난 뒤
        const board = live.page.frames().find(f => /track58-pinboard/.test(f.url()));
        assert.ok(board, '예시 보드가 열린다');
        await board.locator('button[data-board-theme="night"]').first().click();
        await live.page.waitForTimeout(150);
        assert.equal(await live.page.evaluate(() => localStorage.getItem('lt41.boardTheme')), 'night', '보드 도구 줄 저장');
        assert.equal(await live.page.locator('#account-settings button[data-board-theme="night"]').getAttribute('aria-checked'), 'true', '셸 설정도 밤을 고른 상태');
        await live.page.evaluate(() => { location.hash = 'network'; });
        await live.page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => !f.hidden && f.contentWindow?.__lt?.dots().length));
        const map = live.page.frames().find(f => /track56-network/.test(f.url()));
        assert.equal(await map.evaluate(() => document.documentElement.dataset.ltBoardTheme), 'night', '다음 지도도 같은 밤 판');
        assert.deepEqual(live.errors, [], '보드↔지도 전환 오류 0');
      } finally { await live.context.close(); }
    });
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
