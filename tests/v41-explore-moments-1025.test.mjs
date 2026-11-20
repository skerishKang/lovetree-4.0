// #1025 1단계 — 둘러보기 [순간] 보기 동작 시험(새 소스 글자 검사 없음).
// iframe은 지금 것+다음 것만(≤2), 10회 넘기는 동안 같은 영상 반복 0, 세로만, 390·1440·2560 겹침·잘림 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';

const REQUIRE = process.env.LT_MOMENTS_1025_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 순간 보기 시험을 건너뜀';
} catch { skip = 'playwright 패키지가 없어 순간 보기 시험을 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 순간 보기 시험을 건너뜀';

const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#1b3a6b"/><stop offset="0.5" stop-color="#a23b6e"/><stop offset="1" stop-color="#e0a24f"/></linearGradient></defs><rect width="360" height="640" fill="url(#g)"/><circle cx="180" cy="280" r="110" fill="#f3d9a4"/><path d="M60 520 Q180 430 300 520 L300 640 L60 640Z" fill="#12233f"/><text x="180" y="590" fill="#fff" font-size="34" text-anchor="middle">SHORTS</text></svg>' });
const IDS = ['m001111111a','m002222222b','m003333333c','m004444444d','m005555555e','m006666666f','m007777777g','m008888888h','m009999999i','m010101010j','m011111111k','m012121212l'];
const items = IDS.map((id, i) => ({
  id: 'moment-' + id, videoId: id, shareId: 'share' + String(i).padStart(20, '0'),
  treeTitle: i === 3 ? 'AI 명예회원 트리' : '팬 트리 ' + (i + 1),
  title: '세로 순간 ' + (i + 1), url: 'https://www.youtube.com/shorts/' + id,
  thumbnail: 'https://i.ytimg.com/vi/' + id + '/oardefault.jpg',
  note: '짧게 남긴 마음 ' + (i + 1), emotion: '설렘', date: '2026-11-20',
  keywords: ['가수:아이유', '노래:노래' + (i + 1)], aiTester: i === 3
}));

async function step(page, panel, width, delta) {
  if (width <= 780) {
    await panel.evaluate(el => el.querySelector('.moments-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })));
  } else {
    await panel.locator('.moments-step').nth(delta > 0 ? 1 : 0).click();
  }
}

async function boot(browser, { width, height, theme }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 780, isMobile: width <= 780 });
  await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? THUMB(route) : route.abort();
    if (u.pathname === '/api/public/moments') {
      const exclude = new Set(String(u.searchParams.get('exclude') || '').split(',').filter(Boolean));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: items.filter(i => !exclude.has(i.videoId)), total: items.length }) });
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/v41/#explore/moments`, { waitUntil: 'load' });
    await page.locator('#community-panel[open] #community-moments-panel:not([hidden])').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => !!document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId, null, { timeout: 15000 });
    return { server, ctx, page, base };
  } catch (error) {
    await ctx.close();
    await new Promise(r => server.close(r));
    throw error;
  }
}

// 판 영역의 실제 픽셀 다양성 —naturalWidth만 보면 빈 판을 통과시킨다(#1025 CTO 재검수).
async function panelPixels(page, panel) {
  const box = await panel.locator('.moments-card').boundingBox();
  const shot = await page.screenshot({ animations: 'allow', scale: 'css' });
  return page.evaluate(async ({ dataUrl, box }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const x = Math.max(0, Math.round(box.x)), y = Math.max(0, Math.round(box.y));
    const w = Math.min(img.width - x, Math.round(box.width)), h = Math.min(img.height - y, Math.round(box.height));
    const data = ctx.getImageData(x, y, w, h).data;
    const colors = new Set(); let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += lum; sum2 += lum * lum; n += 1;
    }
    return { colors: colors.size, std: Math.round(Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)) * 10) / 10, pixels: n };
  }, { dataUrl: 'data:image/png;base64,' + shot.toString('base64'), box });
}

test('#1025 순간 보기 — iframe 2개 이하·10회 넘기기 같은 영상 반복 0·세로만·가로넘침 0', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900], [1440, 700], [2560, 1440]]) for (const theme of ['night', 'garden']) {
      const h = await boot(browser, { width, height, theme });
      try {
        const panel = h.page.locator('#community-moments-panel');
        const seen = [];
        let maxFrames = 0;
        for (let i = 0; i < 11; i++) {
          const state = await panel.evaluate(el => ({
            id: el.querySelector('.moments-stage')?.dataset.ltMomentsId || '',
            frames: el.querySelectorAll('iframe.moments-frame').length,
            posterVisible: !!el.querySelector('.moments-poster')?.getAttribute('src'),
            title: el.querySelector('.moments-title')?.textContent || ''
          }));
          maxFrames = Math.max(maxFrames, state.frames);
          assert.ok(state.frames <= 2, `${width}·${theme}: 살아 있는 iframe ${state.frames}개 > 2`);
          assert.ok(state.posterVisible && state.title, `${width}·${theme}: 썸네일·제목이 보인다 — ${JSON.stringify(state)}`);
          seen.push(state.id);
          if (i < 10) await step(h.page, panel, width, 1);
        }
        assert.equal(new Set(seen).size, seen.length, `${width}·${theme}: 같은 영상 반복 — ${seen.join(',')}`);
        assert.ok(seen.every(id => /^[A-Za-z0-9_-]+$/.test(id)), '세로 영상 id만');
        const ai = await panel.locator('.moments-ai').count();
        assert.ok(ai >= 0, 'AI 명예회원 표시 자리');
        // 빈 판이 아니라는 증명 — 썸네일이 판을 실제로 채운다(색 종류·명도 표준편차).
        const pixels = await panelPixels(h.page, panel);
        assert.ok(pixels.colors > 20 && pixels.std > 8, `${width}·${theme}: 판 픽셀 다양성 부족(빈 판 의심) — ${JSON.stringify(pixels)}`);
        const look = await panel.evaluate(el => {
          const card = el.querySelector('.moments-card'), poster = el.querySelector('.moments-poster');
          const frame = el.querySelector('iframe.moments-frame');
          const overlay = el.querySelector('.moments-overlay');
          return {
            cardBg: getComputedStyle(card).backgroundColor,
            posterOpacity: Number(getComputedStyle(poster).opacity),
            posterZ: Number(getComputedStyle(poster).zIndex),
            frameZ: frame ? Number(getComputedStyle(frame).zIndex) : 0,
            overlayBg: getComputedStyle(overlay).backgroundImage,
            color: getComputedStyle(overlay).color
          };
        });
        assert.equal(look.cardBg, 'rgb(0, 0, 0)', `${width}·${theme}: 판 바탕은 테마와 무관한 검정 — ${look.cardBg}`);
        assert.ok(look.posterOpacity > 0 && look.posterZ > look.frameZ, `${width}·${theme}: 썸네일이 iframe 위에 늘 보인다 — ${JSON.stringify(look)}`);
        assert.match(look.overlayBg, /rgba\(0, 0, 0, 0\.92\)/, `${width}·${theme}: 판 아래 검은 그라데이션`);
        assert.equal(look.color, 'rgb(255, 255, 255)', `${width}·${theme}: 겹친 글은 흰색`);
        // 판 전체와 오른쪽 단추 4개가 화면 안에 있다(낮은 화면 1440×700 포함).
        const bounds = await panel.evaluate(el => {
          const card = el.querySelector('.moments-card').getBoundingClientRect();
          const rail = [...el.querySelectorAll('.moments-rail-button')].map(node => node.getBoundingClientRect());
          return { viewport: innerHeight, cardBottom: Math.round(card.bottom), cardTop: Math.round(card.top), railCount: rail.length, railBottom: Math.round(Math.max(...rail.map(r => r.bottom))), railTop: Math.round(Math.min(...rail.map(r => r.top))) };
        });
        assert.ok(bounds.cardTop >= 0 && bounds.cardBottom <= bounds.viewport, `${width}·${theme}: 판이 화면 밖 — ${JSON.stringify(bounds)}`);
        assert.equal(bounds.railCount, 4, `${width}·${theme}: 단추 4개`);
        assert.ok(bounds.railTop >= 0 && bounds.railBottom <= bounds.viewport, `${width}·${theme}: 단추가 화면 밖 — ${JSON.stringify(bounds)}`);
        const tags = await panel.locator('.moments-tags').textContent();
        assert.ok(!tags.includes(':'), `${width}·${theme}: 꼬리표 머리말을 뺀 값만 — ${tags}`);
        // 흰 글자 대비 — 그라데이션 최약 지점(alpha .55) 위에 하얀 썸네일이 있어도 4.5:1 이상.
        const bg = 255 * (1 - 0.55), lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const contrast = 1.05 / (lin(bg) + 0.05);
        assert.ok(contrast >= 4.5, `${width}·${theme}: 글 대비 ${contrast.toFixed(2)}:1 < 4.5:1`);
        // ↑ 단추와 키보드도 같은 동작
        const beforeUp = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
        if (width <= 780) await panel.evaluate(el => el.querySelector('.moments-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })));
        else await panel.locator('.moments-step').first().click();
        const afterUp = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
        assert.notEqual(beforeUp, afterUp, '이전 단추가 넘긴다');
        await h.page.keyboard.press('ArrowDown');
        const afterKey = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
        assert.equal(afterKey, beforeUp, '↓ 키가 같은 동작');
        // 화면 공통 검사기 — 겹침·잘림·가로넘침 0(이 보기는 12px 미만 글자 라벨은 의도적이다).
        const audit = await auditPage(h.page, '둘러보기 순간 보기');
        const structural = failuresOf(audit, String(width), theme).filter(row => ['겹침', '가려짐', '잘림', '가로넘침'].includes(row[0]));
        assert.deepEqual(structural, [], `${width}·${theme}: ${JSON.stringify(structural)}`);
        console.log('#1025', width, theme, JSON.stringify({ maxFrames, unique: new Set(seen).size, advances: seen.length - 1, structural: structural.length, pixels: { colors: pixels.colors, std: pixels.std }, contrast: Number(contrast.toFixed(2)), cardBottom: bounds.cardBottom, railBottom: bounds.railBottom, viewport: bounds.viewport, tags }));
      } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});
