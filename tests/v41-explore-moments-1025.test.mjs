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
const BRIGHT_THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#f7f2df"/></linearGradient></defs><rect width="360" height="640" fill="url(#g)"/><circle cx="180" cy="250" r="120" fill="#fff8c8"/><text x="180" y="500" fill="#5b5240" font-size="30" text-anchor="middle">BRIGHT STAGE</text></svg>' });
const IDS = ['m001111111a','m002222222b','m003333333c','m004444444d','m005555555e','m006666666f','m007777777g','m008888888h','m009999999i','m010101010j','m011111111k','m012121212l'];
const items = IDS.map((id, i) => ({
  id: 'moment-' + id, videoId: id, shareId: 'share' + String(i).padStart(20, '0'),
  treeTitle: i === 3 ? 'AI 명예회원 트리' : '팬 트리 ' + (i + 1),
  title: '세로 순간 ' + (i + 1), url: 'https://www.youtube.com/shorts/' + id,
  thumbnail: 'https://i.ytimg.com/vi/' + id + '/oardefault.jpg',
  note: '짧게 남긴 마음 ' + (i + 1), emotion: '설렘', date: '2026-11-20',
  keywords: [i % 3 === 0 ? '가수:다른가수' : '가수:아이유', '노래:노래' + (i + 1)], aiTester: i === 3,
  startSeconds: i === 0 ? 5 : null, endSeconds: i === 0 ? 20 : null
}));
const GROUPS = [{value:'아이유',count:8},{value:'다른가수',count:4}];

async function step(page, panel, width, delta) {
  if (width <= 780) {
    await panel.evaluate(el => el.querySelector('.moments-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })));
  } else {
    await panel.locator('.moments-step').nth(delta > 0 ? 1 : 0).click();
  }
}

async function boot(browser, { width, height, theme, thumb = THUMB }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 780, isMobile: width <= 780 });
  await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? thumb(route) : route.abort();
    if (u.pathname === '/api/public/moments') {
      const exclude = new Set(String(u.searchParams.get('exclude') || '').split(',').filter(Boolean));
      const tag = u.searchParams.get('tag') || '';
      const matched = items.filter(i => !exclude.has(i.videoId) && (!tag || i.keywords.some(k => k === tag)));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: matched, total: matched.length, groups: GROUPS }) });
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

test('#1025 2단계 — 가수 칩 필터·구간 주소·나무 선 아이콘·공유 주소 복사', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
 if (skip) assert.fail(skip);
 const browser = await chromium.launch({ headless: true });
 try {
  const h = await boot(browser, { width: 1440, height: 900, theme: 'night' });
  try {
   const panel = h.page.locator('#community-moments-panel');
   await panel.locator('.moments-chip').first().waitFor({ state: 'visible', timeout: 10000 });
   const chips = await panel.locator('.moments-chip').allTextContents();
   assert.deepEqual(chips, ['전체', '아이유', '다른가수'], '칩은 전체 + 서버가 센 상위 가수');
   // 구간 주소: 첫 순간에 start=5&end=20이 들어간다.
   const src = await panel.locator('iframe.moments-frame').first().getAttribute('src');
   assert.match(src, /start=5/, '시작 초가 iframe 주소에 있다: ' + src);
   assert.match(src, /end=20/, '끝 초가 iframe 주소에 있다: ' + src);
   const noRange = await panel.locator('iframe.moments-frame').nth(1).getAttribute('src');
   assert.doesNotMatch(noRange, /start=|end=/, '구간 없는 순간에는 start/end가 없다: ' + noRange);
   // 가수 칩 — 누르면 그 가수만, 5회 넘기는 동안 다른 가수 0.
   await panel.locator('.moments-chip', { hasText: '아이유' }).click();
   await h.page.waitForTimeout(400);
   const seen = [];
   for (let i = 0; i < 5; i++) {
    seen.push(await panel.locator('.moments-stage').getAttribute('data-lt-moments-id'));
    await step(h.page, panel, 1440, 1);
   }
   assert.equal(new Set(seen).size, seen.length, '칩을 골라도 같은 영상 반복 0');
   console.log('#1025 s2 chip', JSON.stringify({ artist: '아이유', ids: seen }));
   // 공유 — /t/<shareId> 주소를 복사한다.
   await h.page.evaluate(() => { globalThis.__copied = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (v) => { globalThis.__copied.push(v); } }, configurable: true }); });
   await panel.locator('.moments-rail-button').nth(3).click();
   await h.page.waitForFunction(() => (globalThis.__copied || []).length > 0, null, { timeout: 5000 });
   const copied = await h.page.evaluate(() => globalThis.__copied[0]);
   assert.match(copied, /\/t\/share0/, '공개 트리 주소를 복사한다: ' + copied);
   // 나무 아이콘 — 컬러 이모지 없이 선 아이콘(svg path)이다.
   const icon = await panel.locator('.moments-rail-svg').evaluate(el => ({ paths: el.querySelectorAll('path').length, stroke: getComputedStyle(el).stroke, text: el.textContent }));
   assert.ok(icon.paths >= 1 && !/♣/.test(icon.text), '나무 선 아이콘: ' + JSON.stringify(icon));
  } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
 } finally { await browser.close(); }
});

test('#1075 — 밝은 영상 위에서도 390·1440의 단추 여섯 개가 보이고 눌린다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
   for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
    const h = await boot(browser, { width, height, theme, thumb: BRIGHT_THUMB });
    try {
     const panel = h.page.locator('#community-moments-panel');
     const nodes = await panel.evaluate(el => [...el.querySelectorAll('.moments-rail-button, .moments-step')].map(node => {
      const r = node.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      const cs = getComputedStyle(node);
      return {
       label: node.getAttribute('aria-label') || node.textContent.trim(),
       visible: cs.display !== 'none' && r.width > 0 && r.height > 0,
       inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
       reaches: node === hit || node.contains(hit),
       hit: hit ? String(hit.className || hit.tagName) : '',
       color: cs.color, background: cs.backgroundColor, opacity: cs.opacity,
       rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
      };
     }));
     const room = await panel.evaluate(el => {
      const card = el.querySelector('.moments-card').getBoundingClientRect();
      const buttons = [...el.querySelectorAll('.moments-rail-button, .moments-step')].map(node => node.getBoundingClientRect());
      const text = Math.max(...[...el.querySelectorAll('.moments-overlay > *')].map(node => node.getBoundingClientRect().right));
      return { cardRight: Math.round(card.right), buttonRight: Math.round(Math.max(...buttons.map(r => r.right))), buttonLeft: Math.round(Math.min(...buttons.map(r => r.left))), textRight: Math.round(text) };
     });
     assert.equal(nodes.length, 6, `${width}·${theme}: 오른쪽 넷 + 위아래 둘`);
     for (const node of nodes) {
      assert.ok(node.visible, `${width}·${theme}: ${node.label}이 보이지 않음 — ${JSON.stringify(node)}`);
      assert.ok(node.inView, `${width}·${theme}: ${node.label}이 화면 밖 — ${JSON.stringify(node)}`);
      assert.ok(node.reaches, `${width}·${theme}: ${node.label}을 다른 요소가 가림 — ${JSON.stringify(node)}`);
     }
      if (width <= 780) {
       for (const node of nodes) {
        assert.equal(node.color, 'rgb(255, 255, 255)', `${width}·${theme}: 밝은 영상 위 흰 글자 — ${node.label} ${node.color}`);
        assert.equal(node.opacity, '1', `${width}·${theme}: ${node.label}만 흐리게 남음 — ${node.opacity}`);
        const parts = node.background.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        assert.ok(parts, `${width}·${theme}: ${node.label}에 어두운 배경이 없음 — ${node.background}`);
        assert.ok(Number(parts[1]) < 40 && Number(parts[2]) < 40 && Number(parts[3]) < 40 && Number(parts[4] ?? 1) > 0.5, `${width}·${theme}: ${node.label} 스크림이 너무 옅음 — ${node.background}`);
       }
       const inset = room.cardRight - room.buttonRight;
       assert.ok(inset >= 10 && inset <= 12, `${width}·${theme}: 단추가 카드 가장자리에서 ${inset}px — ${JSON.stringify(room)}`);
       assert.ok(room.textRight <= room.buttonLeft, `${width}·${theme}: 아래 글이 단추와 겹침 — ${JSON.stringify(room)}`);
       const top = await panel.evaluate(el => ({
        navBottom: Math.max(...[...el.querySelectorAll('.moments-step')].map(n => n.getBoundingClientRect().bottom)),
        railTop: Math.min(...[...el.querySelectorAll('.moments-rail-button')].map(n => n.getBoundingClientRect().top))
       }));
       assert.ok(top.navBottom < top.railTop, `${width}·${theme}: 위아래 단추가 오른쪽 넷과 겹침 — ${JSON.stringify(top)}`);
       const heart = panel.locator('.moments-rail-button').first();
       assert.equal(await heart.locator('.moments-rail-icon').textContent(), '♡', '기본 마음은 빈 하트');
       assert.equal(await heart.getAttribute('aria-pressed'), 'false', '기본 누름 상태 아님');
       await heart.click();
       assert.equal(await heart.locator('.moments-rail-icon').textContent(), '♥', '누른 마음은 채운 하트');
       assert.equal(await heart.getAttribute('aria-pressed'), 'true', '누름 상태 표시');
       await heart.click();
       assert.equal(await heart.locator('.moments-rail-icon').textContent(), '♡', '다시 누르면 빈 하트');
       const before = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
       await panel.locator('.moments-step').nth(1).click();
       const after = await panel.locator('.moments-stage').getAttribute('data-lt-moments-id');
       assert.notEqual(before, after, `${width}·${theme}: 다음 순간 단추가 실제로 눌린다`);
      } else {
      const rail = await panel.locator('.moments-rail-button').first().evaluate(el => getComputedStyle(el).backgroundColor);
      assert.equal(rail, 'rgba(0, 0, 0, 0)', `${width}·${theme}: 데스크톱 단추는 그대로 — ${rail}`);
     }
     console.log('#1075', width, theme, JSON.stringify({ reached: nodes.filter(n => n.reaches).length, nav: nodes.slice(4).map(n => n.rect), rail: nodes.slice(0, 4).map(n => n.rect) }));
    } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
   }
  } finally { await browser.close(); }
});

