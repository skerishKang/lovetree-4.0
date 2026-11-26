// #1025 1단계 — 둘러보기 [순간] 보기 동작 시험(새 소스 글자 검사 없음).
// iframe은 지금 것+다음 것만(≤2), 10회 넘기는 동안 같은 영상 반복 0, 세로만, 390·1440·2560 겹침·잘림 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { waitForShownScreen } from './helpers/visible-frame.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

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

async function boot(browser, { width, height, theme, thumb = THUMB, moment = null }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 780, isMobile: width <= 780 });
  await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  // #1098 2단계: 그 순간의 ♡·댓글 모의 응답 — moment 값을 넣지 않으면 숫자 0·안 눌림(기존 시험과 같은 기본).
  const momentState = moment || { hearts: 0, aiHearts: 0, comments: 0, hearted: false, reactionCalls: 0, commentCalls: 0, commentList: [], failReaction: false };
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? thumb(route) : route.abort();
    if (u.pathname === '/api/public/moments') {
      const exclude = new Set(String(u.searchParams.get('exclude') || '').split(',').filter(Boolean));
      const tag = u.searchParams.get('tag') || '';
      const matched = items.filter(i => !exclude.has(i.videoId) && (!tag || i.keywords.some(k => k === tag)));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: matched, total: matched.length, groups: GROUPS }) });
    }
    if (u.pathname.startsWith('/api/')) {
      const statsPath = u.pathname.match(/^\/api\/community\/shares\/[^/]+\/moments\/[^/]+$/);
      if (statsPath) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hearts: momentState.hearts, aiHearts: momentState.aiHearts, comments: momentState.comments, hearted: momentState.hearted }) });
      if (/\/moments\/[^/]+\/reaction$/.test(u.pathname)) {
        const enabled = route.request().method() === 'PUT';
        momentState.reactionCalls = (momentState.reactionCalls || 0) + 1;
        if (momentState.failReaction) return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'rate_limited', message: '조금 쉬었다가 다시 시도해 주세요.' } }) });
        momentState.hearts += enabled ? 1 : -1; momentState.hearted = enabled;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hearts: momentState.hearts, aiHearts: momentState.aiHearts, comments: momentState.comments, hearted: momentState.hearted }) });
      }
      if (/\/moments\/[^/]+\/comments$/.test(u.pathname)) {
        if (route.request().method() === 'POST') {
          momentState.commentCalls = (momentState.commentCalls || 0) + 1;
          momentState.comments += 1;
          // 서버(#1136)와 같은 응답 — 만들어진 댓글 하나를 201 {comment}로 돌려 준다.
          const created = { id: 'mc-new-' + momentState.commentCalls, authorLabel: '나', body: '새 댓글', createdAt: '2026-11-20T11:00:00.000Z', edited: false };
          momentState.commentList = [...(momentState.commentList || []), created];
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ comment: created }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ comments: momentState.commentList || [] }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    }
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
        if(width<=780)await h.page.locator('.moments-toolbar .moments-info-button').click();
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
            mediaBg: getComputedStyle(el.querySelector('.moments-media')).backgroundColor,
            posterPointer: getComputedStyle(poster).pointerEvents,
            posterOpacity: Number(getComputedStyle(poster).opacity),
            posterZ: Number(getComputedStyle(poster).zIndex),
            frameZ: frame ? Number(getComputedStyle(frame).zIndex) : 0,
            overlayBg: getComputedStyle(overlay).backgroundImage,
            color: getComputedStyle(overlay).color,
            contextBg: getComputedStyle(el.querySelector('.moments-context')).backgroundColor
          };
        });
        assert.equal(look.cardBg,look.mediaBg,"영상 영역 바탕과 카드 바탕 토큰 일치");
        assert.equal(look.posterPointer,"none","썸네일이 플레이어 입력을 가로채지 않음");
        assert.equal(look.overlayBg,"none","플레이어 전면 서비스 그라데이션 0");
        assert.match(look.color,/^rgb/,"서비스 정보 판 글자 색 표시");
        // 판 전체와 오른쪽 단추 4개가 화면 안에 있다(낮은 화면 1440×700 포함).
        const bounds = await panel.evaluate(el => {
          const card = el.querySelector('.moments-card').getBoundingClientRect();
          const rail = [...el.querySelectorAll('.moments-rail-button')].map(node => node.getBoundingClientRect());
          return { viewport: innerHeight, cardBottom: Math.round(card.bottom), cardTop: Math.round(card.top), railCount: rail.length, railBottom: Math.round(Math.max(...rail.map(r => r.bottom))), railTop: Math.round(Math.min(...rail.map(r => r.top))) };
        });
        assert.ok(bounds.cardTop >= 0 && bounds.cardBottom <= bounds.viewport, `${width}·${theme}: 판이 화면 밖 — ${JSON.stringify(bounds)}`);
        assert.equal(bounds.railCount,5,"정보 판의 동작 단추 다섯");
        assert.equal(await h.page.locator(".moments-toolbar .is-sound").isVisible(),true,"별도 상단 소리 단추 표시");
        assert.ok(bounds.railTop >= 0 && bounds.railBottom <= bounds.viewport, `${width}·${theme}: 단추가 화면 밖 — ${JSON.stringify(bounds)}`);
        const tags = await panel.locator('.moments-tags').textContent();
        assert.ok(!tags.includes(':'), `${width}·${theme}: 꼬리표 머리말을 뺀 값만 — ${tags}`);
        // #1354 실제 정보 판 텍스트/바탕 대비를 검사한다(4.5:1 유지).
        const lum=v=>{
          const c=String(v).match(/[\d.]+/g).slice(0,3).map(Number);
          return c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4})
            .reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        };
        const a=lum(look.color),b=lum(look.contextBg);
        const contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        assert.ok(contrast>=4.5,'정보 판 글자 대비 '+contrast.toFixed(2)+':1');
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
   await panel.locator('.moments-rail-button').nth(4).click();
   await h.page.waitForFunction(() => (globalThis.__copied || []).length > 0, null, { timeout: 5000 });
   const copied = await h.page.evaluate(() => globalThis.__copied[0]);
   assert.match(copied, /\/t\/share0/, '공개 트리 주소를 복사한다: ' + copied);
   // 나무 아이콘 — 컬러 이모지 없이 선 아이콘(svg path)이다.
   const icon = await panel.locator('.moments-rail-button', { hasText: '트리' }).locator('.moments-rail-svg').evaluate(el => ({ paths: el.querySelectorAll('path').length, stroke: getComputedStyle(el).stroke, text: el.textContent }));
   assert.ok(icon.paths >= 1 && !/♣/.test(icon.text), '나무 선 아이콘: ' + JSON.stringify(icon));
  } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
 } finally { await browser.close(); }
});

test('#1075 밝은 영상에서도 여섯 조작 단추와 PC 위아래 이동이 보이고 눌린다',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
  const h=await boot(browser,{width,height,theme,thumb:BRIGHT_THUMB});
  try{
   const panel=h.page.locator('#community-moments-panel');
   if(width<=780)await h.page.locator('.moments-toolbar .moments-info-button').click();
   const nodes=await panel.evaluate(el=>{
    const frame=el.querySelector('.moments-frame:not(.moments-next)').getBoundingClientRect();
    const actions=[...el.querySelectorAll('.moments-rail .moments-rail-button'),...el.querySelectorAll('.moments-nav .moments-step'),document.querySelector('.moments-toolbar .is-sound')];
    return actions.filter(node=>node&&getComputedStyle(node).display!=='none'&&node.getBoundingClientRect().height>0).map(node=>{
     const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
     const overlap=r.left<frame.right&&r.right>frame.left&&r.top<frame.bottom&&r.bottom>frame.top;
     return {label:node.getAttribute('aria-label'),w:r.width,h:r.height,inView:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,hit:node===hit||node.contains(hit),overlap,opacity:getComputedStyle(node).opacity};
    });
   });
   assert.equal(nodes.length,width<=780?6:8,'외부 조작 단추 수, PC 방향 단추 두 개 추가');
   for(const n of nodes){
    assert.ok(n.w>=44&&n.h>=44,'누름 영역 44px 이상: '+n.label);
    assert.equal(n.inView,true,'화면 밖 잘림 0: '+n.label);
    assert.equal(n.hit,true,'실제 좌표에서 누름 방해 0: '+n.label);
    assert.equal(n.overlap,false,'유튜브 플레이어 앞 단추 0: '+n.label);
    assert.equal(n.opacity,'1','단추 흐림 0: '+n.label);
   }
   const heart=panel.locator('.moments-rail-button.is-heart');
   assert.equal(await heart.getAttribute('aria-pressed'),'false','처음 공감 미선택');
   await heart.click();
   assert.equal(await heart.getAttribute('aria-pressed'),'true','공감 선택');
   await heart.click();
   assert.equal(await heart.getAttribute('aria-pressed'),'false','다시 공감 해제');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }}finally{await browser.close();}
});

// ── #1098 2단계 — 쇼츠(순간 보기)의 그 순간 ♡·댓글: 레일에 ♡ 수·댓글 수(3 미만은 숫자 없음),
// ♡ 누르기는 순간 반응 API(PUT/DELETE), 댓글 읽기·쓰기는 순간 댓글 API, 막히면 서버 응답 안내를 그대로 보여 준다.
// 로그인 없이 모의 응답만 쓴다(실제 계정·비밀값 미사용).
test('#1098 2단계 — 쇼츠의 그 순간 ♡·댓글 수와 순간 단위 ♡ 누르기·댓글 쓰기', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
   const momentState = { hearts: 9, aiHearts: 2, comments: 0, hearted: false, reactionCalls: 0, commentCalls: 0, failReaction: false, commentList: [
    { id: 'mc-1', authorLabel: '기록한 사람', body: '이 순간을 처음 본 날의 기억이 나요.', createdAt: '2026-11-20T09:00:00.000Z', edited: false, aiTester: true },
    { id: 'mc-2', authorLabel: '기록한 사람', body: '같은 무대 다녀온 사람으로서 공감해요.', createdAt: '2026-11-20T10:00:00.000Z', edited: false }
   ] };
   const h = await boot(browser, { width: 1440, height: 900, theme: 'night', moment: momentState });
   try {
    const panel = h.page.locator('#community-moments-panel');
    // ① 그 순간의 ♡ 수·댓글 수가 레일에 보인다(3 이상).
    await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-rail-button .moments-rail-count')?.textContent === '9', null, { timeout: 5000 });
    const rail = await panel.evaluate(() => [...document.querySelectorAll('#community-moments-panel .moments-rail-button')].map((node) => ({
     label: node.getAttribute('aria-label') || node.textContent.trim(),
     count: node.querySelector('.moments-rail-count')?.textContent || '',
     pressed: node.getAttribute('aria-pressed') || ''
    })));
    assert.equal(rail[0].count, '9', `그 순간의 ♡ 수가 보인다: ${JSON.stringify(rail[0])}`);
    assert.equal(rail[0].pressed, 'false', '아직 안 누른 상태');
    assert.equal(rail[1].count, '', '댓글 0·3 미만은 숫자를 남기지 않는다(#824 결정 7 규칙)');
    // ② ♡ 누르기 — 순간 반응 API(PUT)로, 누른 뒤 수가 10·채운 하트·눌림 표시.
    const heart = panel.locator('.moments-rail-button').first();
    await heart.click();
    await panel.locator('.moments-rail-count').first().waitFor({ state: 'visible', timeout: 5000 });
    await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-rail-button .moments-rail-count')?.textContent === '10', null, { timeout: 3000 });
    assert.equal(momentState.reactionCalls, 1, '순간 반응 API를 한 번 부른다');
    assert.equal(await heart.getAttribute('aria-pressed'), 'true', '눌림 표시');
    assert.equal(await heart.locator('.moments-rail-icon').textContent(), '♥', '누른 마음은 채운 하트');
    await heart.click();
    await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-rail-button .moments-rail-count')?.textContent === '9', null, { timeout: 3000 });
    assert.equal(momentState.reactionCalls, 2, '다시 누르면 끄기(DELETE)로 간다');
    assert.equal(await heart.getAttribute('aria-pressed'), 'false', '끄면 눌림이 풀린다');
    // ③ 댓글 창 — 그 순간의 댓글 목록(AI 명예회원 머리말 구분)과 쓰기 칸.
    await panel.locator('.moments-rail-button').nth(1).click();
    await h.page.waitForSelector('#community-moments-panel .moments-comments-dialog:not([hidden])', { timeout: 5000 });
    await h.page.waitForFunction(() => document.querySelectorAll('#community-moments-panel .moments-comments-dialog .community-comment').length === 2, null, { timeout: 3000 });
    const drawer = await h.page.evaluate(() => {
     const dialog = document.querySelector('#community-moments-panel .moments-comments-dialog');
     const heads = [...dialog.querySelectorAll('.community-comment small')].map((n) => n.textContent || '');
     return { title: dialog.querySelector('.moments-comments-title')?.textContent || '', first: heads[0] || '', second: heads[1] || '' };
    });
    assert.equal(drawer.title, '댓글', '댓글 2·3 미만은 머리글에 숫자를 남기지 않는다');
    assert.match(drawer.first, /^AI 명예회원 · 기록한 사람 · /, 'AI 명예회원 머리말과 이름은 · 로 나뉜다(판과 같은 머리말)');
    assert.match(drawer.second, /^기록한 사람 · /, '일반 댓글에는 AI 명예회원 머리말을 붙이지 않는다');
    // 쇼츠 댓글 창 날짜도 판과 같은 한 벌(formatDisplayDate·날짜 표기 설정)을 따른다 — 예전 UTC 절단('2026-11-20')이 아니다.
    assert.match(drawer.first, /2026\. 11\. 20$/, '쇼츠 댓글 창 날짜는 판과 같은 formatDisplayDate(기본 점 표기)로 나온다');
    // 쓰기 단추 모양 — 판의 '댓글 남기기'와 같은 테마 색·둥근 모서리(회색 납작 막대 금지).
    const submitLook = await h.page.evaluate(() => {
      const submit = document.querySelector('#community-moments-panel .moments-comments-dialog button[type="submit"]');
      const cs = getComputedStyle(submit);
      return { radius: cs.borderRadius, background: cs.backgroundColor, height: Math.round(submit.getBoundingClientRect().height) };
    });
    assert.equal(submitLook.radius, '999px', `쇼츠 쓰기 단추는 둥근 모서리: ${submitLook.radius}`);
    assert.equal(submitLook.background, 'rgb(245, 239, 226)', `쇼츠 쓰기 단추는 테마 색(밤: 종이 색): ${submitLook.background}`);
    assert.ok(submitLook.height >= 44, `쇼츠 쓰기 단추 44px 누르는 자리: ${submitLook.height}`);
    // ④ 댓글 쓰기 — 순간 댓글 API(POST)로, 목록에 더해진다.
    await h.page.locator('#community-moments-panel .moments-comments-dialog textarea').fill('우리도 같이 들었어요.');
    await h.page.locator('#community-moments-panel .moments-comments-dialog button[type="submit"]').click();
    await h.page.waitForFunction(() => document.querySelectorAll('#community-moments-panel .moments-comments-dialog .community-comment').length === 3, null, { timeout: 3000 });
    assert.equal(momentState.commentCalls, 1, '순간 댓글 API를 한 번 부른다');
    const afterWrite = await h.page.evaluate(() => ({
     title: document.querySelector('#community-moments-panel .moments-comments-dialog .moments-comments-title')?.textContent || '',
     railCount: document.querySelector('#community-moments-panel .moments-rail-button:nth-child(2) .moments-rail-count')?.textContent || ''
    }));
    assert.equal(afterWrite.title, '댓글 3', '머리글에 수가 붙는다(3 이상)');
    assert.equal(afterWrite.railCount, '3', '레일 댓글 수도 같이 바뀐다');
    // 댓글 창을 닫고 나서 ♡를 다시 누른다 — 창이 열려 있으면 레일이 뒤에 가린다.
    await h.page.locator('#community-moments-panel .moments-comments-dialog .moments-add-close').click();
    await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-comments-dialog')?.hidden === true, null, { timeout: 3000 });
    // ⑤ 막히면(횟수 제한 모의 429) 서버 응답 안내를 그대로 보여 주고 눌림을 되돌린다.
    momentState.failReaction = true;
    await heart.click();
    await h.page.waitForFunction(() => {
     const icon = document.querySelector('#community-moments-panel .moments-rail-button .moments-rail-icon');
     return icon && icon.textContent === '♡';
    }, null, { timeout: 3000 });
    assert.equal(momentState.reactionCalls, 3, '막힌 요청도 서버까지 갔다');
    assert.equal(await heart.getAttribute('aria-pressed'), 'false', '막힌 요청은 눌림 표시를 되돌린다');
    // ⑥ 390에서도 레일 숫자가 화면 안에 들어온다.
    await h.page.setViewportSize({ width: 390, height: 844 });
    await h.page.waitForTimeout(200);
    const mobile = await h.page.evaluate(() => {
     const nodes = [...document.querySelectorAll('#community-moments-panel .moments-rail-button')];
     return { inView: nodes.every((n) => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(mobile.inView, true, '390 단추 여섯 개가 화면 안에 있다');
    assert.ok(mobile.overflow <= 1, `390 가로 넉침 0: ${mobile.overflow}`);
   } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
  } finally { await browser.close(); }
});

// ── #1092 — 둘러보기를 겹쳐 뜨는 창이 아니라 다른 탭(서재·책·보드·지도)과 같은 화면으로 연 시험.
// · 둘러보기 탭을 누르면 상단 메뉴는 흐려지지 않고 그대로, '둘러보기' 탭에 밑줄(aria-current), 오른쪽 위 × 없음.
// · 바깥 누름·Esc로 닫히지 않는다.
// · 주소도 다른 화면과 같은 방식(#explore) — 둘러보기 → 서재 → 뒤로 가기 = 둘러보기.
// · 안의 내용(공개 트리 목록)은 그대로 불려 온다.
// 실제 계정 로그인 없이 가짜 작업장(시험계정)과 가짜 공개 목록만 쓴다.
const EXPLORE_CARD = (i) => ({
  shareId: 'share' + String(i).padStart(20, '0'), title: '공개 트리 ' + (i + 1), subject: '바다와 달', summary: '첫 기록',
  momentCount: 3 + i, createdAt: '2026-11-2' + i + 'T09:30:00.000Z', publicDisplayName: '공개자' + (i + 1),
  cover: { emotion: '설렘', title: '첫 순간', type: 'photo', url: '' }, emotions: ['설렘'],
  stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] }
});
function exploreTree(n) {
  let t = createTree({ subject: '시험' + n, title: '시험 트리 ' + n, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
  for (let i = 1; i < 3; i++) t = addMoment(t, { title: '순간 ' + i, note: '', emotion: '설렘', date: '2026-11-2' + i, url: '' }, t.moments[0].id, '2026-11-20T00:0' + i + ':00Z');
  return t;
}
async function bootExploreTab(browser, { width, height, theme }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 780, isMobile: width <= 780 });
  await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await ctx.route('**/api/community/shares**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [EXPLORE_CARD(0), EXPLORE_CARD(1), EXPLORE_CARD(2)], totalVisible: 3, nextCursor: '', groups: [], groupsAll: [] }) }));
  const state = { version: 1, trees: [exploreTree(1), exploreTree(2)], prefs: {} };
  await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' }) }));
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/v41/?account=1#my/shelf`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    // 기록 동기화가 서재 화면을 실제로 다 그릴 때까지 기다린다 — 시작 직후 전체 재그리기(choose→show)가 뒤따르므로 그 뒤에 움직인다.
    await waitForShownScreen(page, { hash: '^#my/shelf', path: 'track32-bookshelf\\.html' }, 20000);
    await page.locator('#discover-ask-no').click().catch(() => {});
    return { server, ctx, page };
  } catch (error) {
    await ctx.close();
    await new Promise((ok) => server.close(ok));
    throw error;
  }
}
// 좁은 화면(≤780)에서는 서재·둘러보기 탭이 접기 메뉴(☰) 안으로 접힌다 — 같은 단추를 누른 것으로 흘러간다.
async function openExploreTab(page, width) {
  if (width <= 780) {
    await page.locator('#mobile-more').click();
    await page.locator('#header-overflow.is-open button', { hasText: '둘러보기' }).click();
  } else {
    await page.locator('#community-menu').click();
  }
  await page.waitForSelector('#community-panel[open]', { timeout: 15000 });
}
async function goToShelfTab(page, width) {
  if (width <= 780) {
    await page.locator('#mobile-more').click();
    await page.locator('#header-overflow.is-open button', { hasText: '서재' }).click();
  } else {
    await page.locator('#tree-views button[data-view="track32-bookshelf.html"]').click();
  }
}

test('#1092 둘러보기는 탭 화면이다 — 밑줄·상단 메뉴 선명·× 없음·Esc/바깥 누름 무시·뒤로 가기 = 둘러보기', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) for (const theme of ['night', 'garden']) {
      const h = await bootExploreTab(browser, { width, height, theme });
      try {
        const tail = `${width}·${theme}`;
        await openExploreTab(h.page, width);
        await h.page.waitForFunction(() => document.querySelectorAll('#community-list .community-card').length >= 1, null, { timeout: 15000 });
        const opened = await h.page.evaluate(() => {
          const panel = document.getElementById('community-panel');
          const closeBtn = panel.querySelector('[data-close="community-panel"]');
          const probe = document.getElementById('theme-toggle');
          const pr = probe.getBoundingClientRect();
          const hit = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
          return {
            modal: panel.matches(':modal'),
            hash: location.hash,
            bodyClass: document.body.classList.contains('community-screen'),
            currentTab: document.getElementById('community-menu').getAttribute('aria-current'),
            closeHidden: closeBtn ? getComputedStyle(closeBtn).display === 'none' : true,
            headerHitInsideHeader: !!hit?.closest?.('.app-header'),
            frameHidden: [...document.querySelectorAll('#stage>iframe')].every((f) => getComputedStyle(f).display === 'none')
          };
        });
        assert.equal(opened.modal, false, `${tail}: 둘러보기가 모달 창이 아니다`);
        assert.equal(opened.hash, '#explore', `${tail}: 주소가 다른 화면과 같은 방식(#explore)으로 쓰인다`);
        assert.equal(opened.bodyClass, true, `${tail}: 화면 상태(body.community-screen)가 붙는다`);
        assert.equal(opened.currentTab, 'true', `${tail}: '둘러보기' 탭에 밑줄(aria-current)이 서 있다`);
        assert.equal(opened.closeHidden, true, `${tail}: 오른쪽 위 × 가 없다`);
        assert.equal(opened.headerHitInsideHeader, true, `${tail}: 상단 메뉴가 창 뒤에 가려지지 않는다(누름 좌표가 머리글 안)`);
        assert.equal(opened.frameHidden, true, `${tail}: 화면 뒤의 iframe이 남지 않는다`);
        // 바깥 누름·Esc로 닫히지 않는다.
        await h.page.evaluate(() => document.querySelector('.app-header').click());
        assert.equal(await h.page.evaluate(() => document.getElementById('community-panel')?.open), true, `${tail}: 바깥 누름으로 닫히지 않는다`);
        await h.page.keyboard.press('Escape');
        assert.equal(await h.page.evaluate(() => document.getElementById('community-panel')?.open), true, `${tail}: Esc로 닫히지 않는다`);
        // 다른 탭(서재)을 누르면 그 화면으로 간다 — 창 닫기가 아니라 화면 이동(주소가 새로 쌓인다).
        await goToShelfTab(h.page, width);
        await h.page.waitForFunction(() => location.hash.startsWith('#my/shelf') && !document.getElementById('community-panel')?.open, null, { timeout: 15000 });
        // 뒤로 가기 = 둘러보기.
        await h.page.goBack();
        await h.page.waitForFunction(() => location.hash === '#explore' && !!document.getElementById('community-panel')?.open && document.getElementById('community-menu')?.getAttribute('aria-current') === 'true', null, { timeout: 15000 });
        const back = await h.page.evaluate(() => ({
          modal: document.getElementById('community-panel').matches(':modal'),
          currentTab: document.getElementById('community-menu').getAttribute('aria-current'),
          treesShown: !document.getElementById('community-tree-panel')?.hidden
        }));
        assert.equal(back.modal, false, `${tail}: 뒤로 가기로 돌아온 둘러보기도 화면이다`);
        assert.equal(back.currentTab, 'true', `${tail}: 뒤로 가기 후에도 '둘러보기' 탭 밑줄`);
        assert.equal(back.treesShown, true, `${tail}: 뒤로 가기 후 [트리] 보기가 열린다`);
      } finally {
        await h.ctx.close();
        await new Promise((ok) => h.server.close(ok));
      }
    }
  } finally { await browser.close(); }
});

test('#1092 주소(#explore)로 직접 들어와도 둘러보기는 화면으로 열린다', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    const h = await bootExploreTab(browser, { width: 1440, height: 900, theme: 'night' });
    try {
      await h.page.evaluate(() => { location.hash = '#explore'; });
      await h.page.waitForSelector('#community-panel[open]', { timeout: 15000 });
      await h.page.waitForFunction(() => document.getElementById('community-menu')?.getAttribute('aria-current') === 'true', null, { timeout: 15000 });
      const state = await h.page.evaluate(() => ({
        modal: document.getElementById('community-panel').matches(':modal'),
        hash: location.hash,
        currentTab: document.getElementById('community-menu').getAttribute('aria-current'),
        bodyClass: document.body.classList.contains('community-screen')
      }));
      assert.equal(state.modal, false, '주소로 열린 둘러보기도 모달 창이 아니다');
      assert.equal(state.hash, '#explore', '주소가 유지된다');
      assert.equal(state.currentTab, 'true', "'둘러보기' 탭에 밑줄이 서 있다");
      assert.equal(state.bodyClass, true, '화면 상태가 붙는다');
    } finally {
      await h.ctx.close();
      await new Promise((ok) => h.server.close(ok));
    }
  } finally { await browser.close(); }
});


test('#1098 순간 댓글 창은 불투명하고 뒤 단추를 가린다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(skip);
  const contrast = (fg, bg) => {
    const lin = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = lin(fg), b = lin(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const h = await boot(browser, { width, height, theme: 'night' });
      try {
        const panel = h.page.locator('#community-moments-panel');
        // #1354 휴대폰 단추는 정보 판을 펼친 뒤에만 보인다.
        if (width === 390) await h.page.locator('.moments-toolbar .moments-info-button').click();
        await panel.locator('.moments-rail-button', { hasText: '댓글' }).click();
        const dialog = panel.locator('.moments-comments-dialog');
        await dialog.waitFor({ state: 'visible', timeout: 5000 });
        const look = await dialog.evaluate(el => {
          const s = getComputedStyle(el);
          const title = getComputedStyle(el.querySelector('.moments-comments-title'));
          const input = getComputedStyle(el.querySelector('textarea'));
          return { bg: s.backgroundColor, ink: title.color, inputBg: input.backgroundColor, inputInk: input.color };
        });
        assert.ok(/^rgb\(/.test(look.bg), '창 바탕이 불투명하다: ' + JSON.stringify(look));
        assert.ok(contrast(look.ink, look.bg) >= 4.5, '제목 대비: ' + JSON.stringify(look));
        assert.ok(contrast(look.inputInk, look.inputBg) >= 4.5, '입력 칸 대비: ' + JSON.stringify(look));
        const behind = await panel.evaluate(el => ({
          rail: getComputedStyle(el.querySelector('.moments-rail')).opacity,
          nav: getComputedStyle(el.querySelector('.moments-nav')).opacity
        }));
        assert.equal(behind.rail, '0', '뒤 단추 줄이 가려진다: ' + JSON.stringify(behind));
        assert.equal(behind.nav, '0', '뒤 위아래 단추가 가려진다: ' + JSON.stringify(behind));
        await dialog.locator('.moments-add-close').click();
        assert.equal(await dialog.getAttribute('hidden'), '', '닫기로 닫힌다');
        const restored = await panel.evaluate(el => getComputedStyle(el.querySelector('.moments-rail')).opacity);
        assert.equal(restored, '1', '닫으면 단추가 돌아온다');
      } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1098 회색 썸네일이면 제목 카드로 바뀐다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(skip);
  const GRAY = route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#8a7a92"/><circle cx="30" cy="45" r="5" fill="#fff"/><circle cx="60" cy="45" r="5" fill="#fff"/><circle cx="90" cy="45" r="5" fill="#fff"/></svg>' });
  const browser = await chromium.launch({ headless: true });
  try {
    const h = await boot(browser, { width: 390, height: 844, theme: 'garden', thumb: GRAY });
    try {
      const panel = h.page.locator('#community-moments-panel');
      const fallback = panel.locator('.moments-fallback');
      // #1354 회색 썸네일은 유튜브 플레이어를 덮는 카드가 되면 안 된다.
      const frame = panel.locator('.moments-frame:not(.moments-next)');
      await frame.waitFor({ state: 'attached' });
      const result = await panel.evaluate(el => {
        const f = el.querySelector('.moments-frame:not(.moments-next)');
        const r = f.getBoundingClientRect();
        return { overlay: getComputedStyle(el.querySelector('.moments-fallback')).display,
          top: document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===f };
      });
      assert.equal(result.overlay, 'none', '재생 가능한 영상 위 회색 썸네일 대체 안내 없음');
      assert.equal(result.top, true, '유튜브 플레이어가 실제 클릭을 받는다');
    } finally { await h.ctx.close(); await new Promise(r => h.server.close(r)); }
  } finally { await browser.close(); }
});

import {expectNoHistoryGrowth} from './helpers/history-assert.mjs';

test('#1294 둘러보기 트리·순간 탭과 미리보기·그룹 찾기 뒤로 가기', {skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
 for(const [width,height] of [[390,844],[1440,900]]){
  const h=await bootExploreTab(browser,{width,height,theme:'night'});
  let cdp;
  try{
   await openExploreTab(h.page,width);
   const page=h.page;
   cdp=await page.context().newCDPSession(page);
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:width===1440?6:1});
   await page.waitForSelector('#community-list .community-card');
   const back=async()=>{await page.goBack();await page.waitForTimeout(110);};
   const navState=()=>page.evaluate(()=>({hash:location.hash,trees:!document.getElementById('community-tree-panel').hidden,moments:!document.getElementById('community-moments-panel').hidden}));
   const home=await navState();assert.equal(home.hash,'#explore');
   await expectNoHistoryGrowth(page,async()=>page.locator('#community-sort').selectOption({index:1}),width+' 정렬');
   await page.route('**/api/public/moments**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:items.slice(0,6),total:6,groups:GROUPS})}));
   await page.locator('#community-tab-moments').click();
   await page.waitForFunction(()=>!!document.querySelector('.moments-stage')?.dataset.ltMomentsId);
   assert.equal((await navState()).hash,'#explore/moments');
   if (width === 390) await page.locator('.moments-toolbar .moments-info-button').click();
   await page.locator('#community-moments-panel .moments-rail-button').nth(2).click();
   await page.locator('.moments-add-dialog:not([hidden])').waitFor();
   await back();
   assert.equal(await page.locator('.moments-add-dialog').evaluate(el=>el.hidden),true,width+' 담기 창 한 번 뒤로 가기');
   assert.equal((await navState()).hash,'#explore/moments',width+' 담기 창 화면 유지');
   await back();assert.deepEqual(await navState(),home,width+' 순간 → 트리 복원');
   await page.locator('#community-tab-moments').click();
   await page.locator('#community-tab-trees').click();
   await back();
   assert.equal((await navState()).hash,'#explore/moments',width+' 트리 → 순간 복원');
   await back();assert.deepEqual(await navState(),home,width+' 이전 트리 복원');
   await page.locator('#community-list .community-card').first().click();
   assert.equal(await page.locator('#community-preview').evaluate(el=>el.open),true,width+' 미리보기 열기');
   await back();
   assert.equal(await page.locator('#community-preview').evaluate(el=>el.open),false,width+' 미리보기 복귀');
   assert.deepEqual(await navState(),home,width+' 미리보기 후 화면');
    // 그룹 찾기 칩이 없어졌으므로 상단 검색 확장에 기록이 쌓이지 않는지 확인한다.
    await expectNoHistoryGrowth(page,async()=>page.locator('#community-query').focus(),width+' 찾기 확장');
    assert.equal(await page.locator('#community-query').evaluate(el=>document.activeElement===el),true,width+' 찾기 입력 초점');
    assert.deepEqual(await navState(),home,width+' 찾기 확장 후 화면');
   // 감상 화면 이동은 별도 URL이며 뒤로 가기 한 번에 둘러보기 미리보기를 복원한다.
   const sharedTree=exploreTree(1);
   await page.route('**/api/public/shares/*',async route=>{if(width===1440)await new Promise(resolve=>setTimeout(resolve,700));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,share:{id:EXPLORE_CARD(0).shareId,view:'book',entryMomentId:sharedTree.moments[0].id},tree:sharedTree})});});
   await page.locator('#community-list .community-card').first().click();
   await page.locator('.community-preview-open').click();
   await page.waitForFunction(()=>location.hash.startsWith('#share/'),null,{timeout:15000});
   if(width===390)await page.waitForFunction(()=>document.body.dataset.recordSource==='share'&&document.getElementById('empty')?.hidden,null,{timeout:15000});
   await back();
   assert.equal((await navState()).hash,'#explore',width+' 공유 감상에서 뒤로 가기 주소');
   assert.equal(await page.locator('#community-panel').evaluate(el=>el.open),true,width+' 공유 감상에서 둘러보기 복귀');
   await page.waitForFunction(()=>document.getElementById('community-preview')?.open===true,null,{timeout:5000});
   assert.equal(await page.locator('#community-preview').evaluate(el=>el.open),true,width+' 공유 감상에서 미리보기 상태 복원');

   console.log('#1294 TREES',width,'OK');
  }finally{await cdp?.detach();await h.ctx.close();await new Promise(ok=>h.server.close(ok));}
 }
 }finally{await browser.close();}
});

test('#1294 순간 밀기 기록 누적 없음·댓글 뒤로 가기·탭 복원', {skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
 for(const [width,height] of [[390,844],[1440,900]]){
  const h=await boot(browser,{width,height,theme:'night'});
  try{
   const page=h.page,stage=page.locator('#community-moments-panel .moments-stage');
   const start=await page.evaluate(()=>history.length);
   const startId=await stage.getAttribute('data-lt-moments-id');
   for(let i=0;i<5;i++){
    if(width===390)await stage.evaluate(el=>{
     const t=y=>new Touch({identifier:1,target:el,clientX:180,clientY:y});
     el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(620)],changedTouches:[t(620)]}));
     el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[t(320)]}));
    });
    else await page.locator('.moments-step').nth(1).click();
   }
   assert.notEqual(await stage.getAttribute('data-lt-moments-id'),startId,width+' 다음 순간 이동');
   assert.equal(await page.evaluate(()=>history.length),start,width+' 5번 넘김 후 기록 증가 0');
   if(width===390)await page.locator('.moments-toolbar .moments-info-button').click();
   await page.locator('#community-moments-panel .moments-rail-button').nth(1).click();
   await page.locator('.moments-comments-dialog:not([hidden])').waitFor();
   await page.goBack();await page.waitForTimeout(120);
   assert.equal(await page.locator('.moments-comments-dialog').evaluate(el=>el.hidden),true,width+' 댓글 뒤로 가기');
   assert.equal(await page.evaluate(()=>location.hash),'#explore/moments',width+' 댓글 뒤로 가기 주소 유지');
   const selected=await stage.getAttribute('data-lt-moments-id');
   await page.locator('#community-tab-trees').click();
   await page.goBack();await page.waitForTimeout(130);
   assert.equal(await page.evaluate(()=>location.hash),'#explore/moments',width+' 탭 돌아오기');
   assert.equal(await stage.getAttribute('data-lt-moments-id'),selected,width+' 순간 위치 복원');
   // 분류·화면 설명·소리·공감은 같은 순간 안의 옵션이므로 기록이 늘지 않는다.
   await expectNoHistoryGrowth(page,async()=>page.locator('.moments-chip').last().click(),width+' 가수 필터');
   if(width===390){
    await expectNoHistoryGrowth(page,async()=>page.locator('.moments-note').click(),width+' 설명 펼치기');
    await expectNoHistoryGrowth(page,async()=>page.locator('.moments-rail-button.is-sound').click(),width+' 소리 전환');
   }
   console.log('#1294 MOMENTS',width,'OK');
  }finally{await h.ctx.close();await new Promise(ok=>h.server.close(ok));}
 }
 }finally{await browser.close();}
});

test('#1322 트리 카드 표지는 한 겹 — 가로·세로·그림 없음 높이 차 1px 이하(390·1440 × 밤·정원)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const svg = (w, h, color) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${color}"/></svg>`);
  const card = (i, extra) => ({
    shareId: 'share' + String(i).padStart(20, '0'), title: '트리 ' + (i + 1), subject: '공개자', summary: '첫 기록',
    momentCount: 3 + i, createdAt: '2026-11-20T09:30:00.000Z', publicDisplayName: '공개자', emotions: ['설렘'],
    stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] }, ...extra
  });
  const cards = [
    card(0, { cover: { emotion: '설렘', title: '가로 순간', type: 'photo', thumbnailUrl: svg(640, 360, '#3d5a80') } }),
    card(1, { cover: { emotion: '설렘', title: '세로 순간', type: 'youtube', vertical: true, thumbnailUrl: svg(360, 640, '#7b3f61') }, aiTester: true }),
    card(2, { cover: { emotion: '설렘', title: '제목 카드', type: 'photo', url: '' } })
  ];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
      const server = await serve();
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/community/shares**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: cards, totalVisible: 3, nextCursor: '', groups: [], groupsAll: [] }) }));
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false,"code":"unauthenticated"}' }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/#explore`, { waitUntil: 'load' });
        await page.waitForSelector('#community-list .community-card');
        const facts = await page.evaluate(() => [...document.querySelectorAll('#community-list .community-cover')].map((c) => {
          const badges = [...c.querySelectorAll('.community-cover-badge')].map((b) => {
            const r = b.getBoundingClientRect();
            return { top: Math.round(r.top), height: Math.round(r.height) };
          });
          return {
            h: c.getBoundingClientRect().height, kind: c.dataset.mediaKind,
            fit: c.querySelector('.community-cover-image') ? getComputedStyle(c.querySelector('.community-cover-image')).objectFit : null,
            pos: c.querySelector('.community-cover-image') ? getComputedStyle(c.querySelector('.community-cover-image')).objectPosition : null,
            backdrop: !!c.querySelector('.community-cover-backdrop'),
            grad: getComputedStyle(c, '::after').backgroundImage,
            badges
          };
        }));
        assert.equal(facts.length, 3, `${width}/${theme}: 세 카드가 보인다`);
        const heights = facts.map((f) => f.h);
        assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, `${width}/${theme}: 표지 높이 차 1px 이하 ${JSON.stringify(heights)}`);
        assert.ok(facts.filter((f) => f.fit).every((f) => f.fit === 'cover' && f.pos === '50% 50%'), `${width}/${theme}: 그림은 가운데 기준으로 잘라 맞춘다 ${JSON.stringify(facts.map((f) => [f.fit, f.pos]))}`);
        assert.deepEqual(facts.map((f) => f.backdrop), [false, true, false], `${width}/${theme}: 흐린 배경은 세로 영상만`);
        for (const f of facts) {
          assert.match(f.grad, /linear-gradient/, `${width}/${theme}: 아래쪽 그라데이션 한 겹`);
          assert.ok(f.badges.every((b) => b.height === f.badges[0].height && b.top === f.badges[0].top), `${width}/${theme}: 배지 위치·크기 통일 ${JSON.stringify(f.badges)}`);
        }
        await ctx.close();
      } finally { await new Promise((r) => server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1330 휴대폰 상단·카드 다듬기 — 캡슐 없음, 검색·정렬 같은 높이, 칩 밀기, 빈 인기 무대 숨김, 배지 한 줄', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const card = (i, extra) => ({
    shareId: 'share' + String(i).padStart(20, '0'), title: '트리 ' + (i + 1), subject: '공개자', summary: '첫 기록',
    momentCount: 3 + i, createdAt: '2026-11-20T09:30:00.000Z', publicDisplayName: '공개자', emotions: ['설렘'],
    stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] }, ...extra
  });
  const cards = [
    card(0, { cover: { emotion: '설렘', title: '가로', type: 'youtube', thumbnailUrl: 'https://i.ytimg.com/vi/j-XAL0kGh_E/mqdefault.jpg' } }),
    card(1, { cover: { emotion: '설렘', title: '띠 있는 가로', type: 'youtube', thumbnailUrl: 'https://i.ytimg.com/vi/y234b8-jqVw/hqdefault.jpg' }, aiTester: true }),
    card(2, { cover: { emotion: '설렘', title: '세로', type: 'youtube', vertical: true, thumbnailUrl: 'https://i.ytimg.com/vi/TkV6B6j06NA/oardefault.jpg' } })
  ];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
      const server = await serve();
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/community/shares**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: cards, totalVisible: 3, nextCursor: '', groups: [], groupsAll: [] }) }));
        await ctx.route('**/api/community/stages/popular**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false,"code":"unauthenticated"}' }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/#explore`, { waitUntil: 'load' });
        await page.waitForSelector('#community-list .community-card');
        await page.waitForTimeout(300);
        const facts = await page.evaluate(() => {
          const tabs = document.querySelector('.community-tabs'), q = document.querySelector('#community-query'), s = document.querySelector('.community-sort-trigger');
          const groups = document.querySelector('#community-groups'), find = document.querySelector('button.community-group-find');
          const badges = [...document.querySelectorAll('#community-list .community-cover-badges')];
          return {
            tabBg: getComputedStyle(tabs).backgroundImage, tabPad: getComputedStyle(tabs).padding,
            queryH: q.getBoundingClientRect().height, sortH: s.getBoundingClientRect().height,
            scrollbar: getComputedStyle(groups).scrollbarWidth, snap: getComputedStyle(groups).scrollSnapType,
            fade: getComputedStyle(groups).maskImage, findRight: find.getBoundingClientRect().right, railRight: document.querySelector('.community-group-rail').getBoundingClientRect().right,
            popularHidden: document.querySelector('#community-popular-stages').hidden,
            badgeRows: badges.map((b) => ({ group: Math.round(b.getBoundingClientRect().height), one: Math.round(b.firstElementChild?.getBoundingClientRect().height || 0) })),
            thumb: document.querySelector('#community-list .community-cover-image')?.src || ''
          };
        });
        assert.equal(facts.tabBg, 'none', `${width}/${theme}: 탭을 감싼 캡슐 없음`);
        assert.equal(facts.tabPad, '0px', `${width}/${theme}: 캡슐 안쪽 여백 없음`);
        assert.equal(facts.queryH, facts.sortH, `${width}/${theme}: 검색·정렬 높이 차 0`);
        assert.equal(facts.queryH, 48, `${width}/${theme}: 검색·정렬 48px`);
        if (width === 390) {
          assert.equal(facts.scrollbar, 'none', `${width}/${theme}: 칩 줄 막대 숨김`);
          assert.match(facts.snap, /x/, `${width}/${theme}: 칩 줄 밀기 가능`);
          assert.match(facts.fade, /gradient/, `${width}/${theme}: 오른쪽 끝 흐림`);
          assert.ok(facts.findRight <= facts.railRight + 1, `${width}/${theme}: 그룹 찾기 줄 끝 고정`);
        }
        assert.equal(facts.popularHidden, true, `${width}/${theme}: 빈 인기 무대 줄을 접는다`);
        for (const badge of facts.badgeRows) assert.equal(badge.group, badge.one, `${width}/${theme}: 배지 한 줄`);
        assert.match(facts.thumb, /mqdefault/, `${width}/${theme}: 띠 없는 썸네일 먼저`);
        await ctx.close();
      } finally { await new Promise((r) => server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('빈 인기 무대는 줄을 접고 칩 줄 아래 간격을 다른 정보 줄과 같게 둔다(390·1440 × 밤·정원)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const share = { shareId: 'share' + '0'.repeat(19) + '1', title: '공개 트리', subject: '주인', summary: '첫 기록', momentCount: 3, createdAt: '2026-11-20T09:30:00.000Z', publicDisplayName: '공개자', emotions: ['설렘'], cover: { title: '첫 순간', type: 'photo', url: '' }, stats: { hearts: 3, favorites: 1, hearted: false, favored: false, reactions: { heart: 3 }, mine: [] } };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
      const server = await serve();
      try {
        const base = `http://127.0.0.1:${server.address().port}`;
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/community/shares**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [share], totalVisible: 1, nextCursor: '', groups: [], groupsAll: [] }) }));
        await ctx.route('**/api/community/stages/popular**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false,"code":"unauthenticated"}' }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/#explore`, { waitUntil: 'load' });
        await page.waitForSelector('#community-list .community-card');
        const facts = await page.evaluate(() => {
          const rail = document.querySelector('.community-group-rail').getBoundingClientRect();
          const feedback = document.querySelector('#community-feedback');
          const card = document.querySelector('#community-list .community-card').getBoundingClientRect();
          return { hidden: document.querySelector('#community-popular-stages').hidden, feedbackHidden: feedback.hidden, railToCard: Math.round(card.top - rail.bottom) };
        });
        assert.equal(facts.hidden, true, `${width}/${theme}: 빈 인기 무대 줄을 접는다`);
        assert.equal(facts.feedbackHidden,true,'필터가 없을 때 결과 안내 숨김'); assert.equal(facts.railToCard,10,'빈 인기 무대 줄이 없을 때 칩 아래 간격 10px');
        await ctx.close();
      } finally { await new Promise((r) => server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1338 인기 무대 오류·2초 지연에도 트리 카드를 1초 안에 표시하고 자리 밀림을 막는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
 if(skip)assert.fail(skip);
 const sample={
  shareId:'share'+String(1).padStart(20,'0'),title:'무대 지연 점검 트리',subject:'공개자',summary:'공개된 순간',
  momentCount:3,createdAt:'2026-11-20T09:30:00.000Z',publicDisplayName:'공개자',emotions:['설렘'],
  cover:{title:'첫 순간',type:'photo',url:''},
  stats:{hearts:3,favorites:1,hearted:false,favored:false,reactions:{heart:3},mine:[]}
 };
 const shots=process.env.LT_STAGE_1338_SHOTS||'';
 const browser=await chromium.launch({headless:true});
 try{
  for(const mode of ['failed','late','both'])for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
   const server=await serve();
   try{
    const base='http://127.0.0.1:'+server.address().port;
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    try{
     await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t)}catch{}},theme);
     // #1380: 시간은 페이지 안의 같은 시계로 잰다 — 카드 요청 시작(Resource Timing)부터 카드가 문서에 들어간 순간까지.
     // 바깥(Node) 시계와 waitFor 확인 간격은 실행기가 바쁘면 수 초씩 늘어나 화면 동작과 무관하게 흔들렸다.
     await ctx.addInitScript(()=>{
      const watch=()=>new MutationObserver((_,observer)=>{
       if(document.querySelector('#community-list .community-card')){window.__ltCardAt=performance.now();observer.disconnect();}
      }).observe(document.documentElement,{subtree:true,childList:true});
      if(document.documentElement)watch();else document.addEventListener('DOMContentLoaded',watch);
     });
     let cardRequestAt=0;
     await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
     await ctx.route('**/api/community/shares**',async r=>{
      cardRequestAt=Date.now();
      // 'both': 운영 측정(#1343)처럼 카드·무대 응답이 둘 다 느리고 무대가 카드보다 조금 늦게 오는 경우.
      if(mode==='both')await new Promise(resolve=>setTimeout(resolve,800));
      return r.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify({ok:true,items:[sample],totalVisible:1,nextCursor:'',groups:[],groupsAll:[]})});
     });
     await ctx.route('**/api/community/stages/popular**',async r=>{
      if(mode==='failed')return r.abort('failed');
      await new Promise(resolve=>setTimeout(resolve,mode==='both'?950:2000));
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,items:[{stageId:'late-stage',weeklyVoters:5,title:'늦게 도착한 무대'}]})});
     });
     const page=await ctx.newPage();
     await page.goto(base+'/v41/#explore',{waitUntil:'domcontentloaded'});
     await page.locator('#community-list .community-card').first().waitFor({state:'visible',timeout:5000});
     assert.ok(cardRequestAt>0,mode+'/'+width+'/'+theme+': 트리 요청이 시작됐다');
     const elapsed=await page.evaluate(()=>{
      const entry=performance.getEntriesByType('resource').find(e=>/\/api\/community\/shares\?/.test(e.name));
      return entry&&window.__ltCardAt?Math.round(window.__ltCardAt-entry.startTime):Infinity;
     });
     assert.ok(elapsed<(mode==='both'?1500:1000),mode+'/'+width+'/'+theme+': 카드 요청부터 제때 보여야 함 ('+elapsed+'ms)');
     const before=await page.evaluate(()=>{
      const card=document.querySelector('#community-list .community-card'),popular=document.querySelector('#community-popular-stages');
      return {y:card.getBoundingClientRect().top,hidden:popular.hidden,cardCount:document.querySelectorAll('#community-list .community-card').length,
       stageHeight:popular.getBoundingClientRect().height};
     });
     assert.equal(before.cardCount,1,mode+'/'+width+'/'+theme+': 공개 트리 카드 표시');
     if(mode==='both'){
      assert.equal(before.hidden,false,mode+'/'+width+'/'+theme+': 카드 응답 뒤 300ms 안에 온 인기 무대는 함께 보인다');
      assert.ok(before.stageHeight>0,mode+'/'+width+'/'+theme+': 인기 무대 줄 높이');
     }else{
      assert.equal(before.hidden,true,mode+'/'+width+'/'+theme+': 실패·초과 시간에는 인기 무대 줄 접기');
      assert.equal(before.stageHeight,0,mode+'/'+width+'/'+theme+': 빈 띠 높이 0');
     }
     if(mode==='late')await page.waitForTimeout(2100);
     const after=await page.evaluate(()=>{
      const card=document.querySelector('#community-list .community-card'),popular=document.querySelector('#community-popular-stages');
      return {y:card.getBoundingClientRect().top,hidden:popular.hidden,stageHeight:popular.getBoundingClientRect().height};
     });
     assert.equal(after.y,before.y,mode+'/'+width+'/'+theme+': 카드 뒤 자리 밀림 0');
     assert.equal(after.hidden,before.hidden,mode+'/'+width+'/'+theme+': 처음 그린 뒤 무대 줄 상태가 바뀌지 않음');
     assert.equal(after.stageHeight,before.stageHeight,mode+'/'+width+'/'+theme+': 줄 높이 유지');
     if(shots){
      const {mkdir}=await import('node:fs/promises');
      await mkdir(shots,{recursive:true});
      await page.screenshot({path:shots+'/'+mode+'-'+width+'-'+theme+'.png',animations:'disabled'});
     }
     console.log('#1338',mode,width,theme,'카드',elapsed+'ms','이동',after.y-before.y+'px');
    }finally{await ctx.close();}
   }finally{await new Promise(resolve=>server.close(resolve));}
  }
 }finally{await browser.close();}
});

test('둘러보기 윗줄·역할별 색·마우스 올림·칩 크기 — 390·1440 × 밤·정원', {skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const card=(n,ai)=>({
  shareId:'share'+String(n).padStart(20,'0'),title:ai?'명예회원 공개 트리':'일반 공개 트리',subject:'가수',summary:'공개 기록',
  momentCount:3,createdAt:'2026-11-20T09:30:00.000Z',publicDisplayName:ai?'하늘':'노출되면 안 되는 이름',
  aiTester:ai,cover:{title:'첫 순간',type:'photo',url:''},
  stats:{hearts:3,favorites:1,hearted:false,favored:false,reactions:{heart:3},mine:[]}
 });
 const parseColor=value=>{const parts=value.match(/[\d.]+/g)?.map(Number)||[];return {r:parts[0]||0,g:parts[1]||0,b:parts[2]||0,a:parts[3]??1};};
 const over=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1});
 const luminance=color=>{const channel=value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;};return .2126*channel(color.r)+.7152*channel(color.g)+.0722*channel(color.b);};
 const contrast=(fg,bg)=>{const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
 const browser=await chromium.launch({headless:true});
 try{
 for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
  const server=await serve();
  try{
   const base='http://127.0.0.1:'+server.address().port,ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   try{
    await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
    const body=JSON.stringify({ok:true,items:[card(1,true),card(2,false)],totalVisible:2,nextCursor:'',
      groups:[{value:'적은 그룹',count:2},{value:'많은 그룹',count:9}],
      groupsAll:[{value:'적은 그룹',count:2},{value:'많은 그룹',count:9}]});
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
    await ctx.route('**/api/community/shares**',r=>r.fulfill({status:200,contentType:'application/json',body}));
    await ctx.route('**/api/community/stages/popular**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
    const page=await ctx.newPage();
    await page.goto(base+'/v41/#explore',{waitUntil:'domcontentloaded'});
    await page.locator('.community-card').first().waitFor();
    const initial=await page.evaluate(()=>{
     const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}};
     return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,row:r('.community-top-row'),tabs:r('.community-tabs'),
      search:r('#community-search-form'),sort:r('.community-sort-label'),icon:r('.community-sort-label'),
      firstTab:r('#community-tab-trees'),secondTab:r('#community-tab-moments'),queryName:document.querySelector('#community-query').getAttribute('aria-label'),
      feedbackHidden:document.querySelector('#community-feedback').hidden,
      findVisible:[...document.querySelectorAll('button.community-group-find')].some(e=>e.getBoundingClientRect().width>0),
      names:[...document.querySelectorAll('.community-card-owner')].map(e=>e.textContent),
      groups:[...document.querySelectorAll('#community-groups button')].map(e=>e.textContent),
      ownerLink:document.querySelector('.community-card-owner a')!==null};
    });
    assert.equal(initial.scroll,initial.viewport,width+'/'+theme+': 가로 넘침 0');
    assert.equal(initial.tabs.y,initial.search.y,width+'/'+theme+': 탭·찾기 한 줄');
    assert.equal(initial.search.y,initial.sort.y,width+'/'+theme+': 찾기·정렬 한 줄');
    assert.equal(initial.row.h,48,width+'/'+theme+': 윗줄 높이');
    for(const size of [initial.firstTab.h,initial.secondTab.h,initial.icon.w,initial.icon.h,initial.search.h,initial.sort.h])
     assert.ok(size>=44,width+'/'+theme+': 단추 44픽셀 이상 '+size);
    assert.equal(initial.queryName,'가수·노래·무대 찾기');
    assert.equal(initial.feedbackHidden,true,width+'/'+theme+': 검색·필터 없는 안내 숨김');
    assert.equal(initial.findVisible,false,width+'/'+theme+': 그룹 찾기 칩 제거');
    assert.deepEqual(initial.names,['AI 명예회원 하늘'],width+'/'+theme+': AI 카드만 이름');
    assert.equal(initial.ownerLink,false,width+'/'+theme+': 만든 사람은 링크 아님');
    assert.deepEqual(initial.groups.slice(0,3),['전체','많은 그룹','적은 그룹'],width+'/'+theme+': 방문자 공개 수 순서');
    assert.deepEqual([initial.firstTab.w,initial.firstTab.h],[initial.secondTab.w,initial.secondTab.h],width+'/'+theme+': 선택·비선택 탭 크기 같음');
    const roles=await page.evaluate(()=>{
     const probe=document.createElement('span');probe.style.display='none';document.body.append(probe);
     const read=name=>{probe.style.color='var('+name+')';return getComputedStyle(probe).color;};
     const names=['--lt-role-bg','--lt-role-accent-bg','--lt-role-accent-ink','--lt-role-secondary-border','--lt-role-secondary-ink','--lt-role-input-bg','--lt-role-input-border','--lt-role-input-ink','--lt-role-idle-border','--lt-role-idle-ink','--lt-role-hover-bg','--lt-role-hover-border','--lt-role-hover-ink','--lt-role-text-strong','--lt-role-text-muted','--lt-role-text-faint','--lt-role-border','--lt-rose','--lt-rose-ink'];
     const result=Object.fromEntries(names.map(name=>[name,read(name)]));probe.remove();return result;
    });
    const roleBg=parseColor(roles['--lt-role-bg']);
    // #1362: 선택 탭은 강조 채움이고 비선택 탭과 다르다. 밤의 비선택 탭·칩 테두리는 금색이 아니다.
    const tabLook=await page.evaluate(()=>{const look=id=>{const e=document.getElementById(id),s=getComputedStyle(e);return {selected:e.getAttribute('aria-selected'),bg:s.backgroundColor,border:s.borderTopColor};};return {trees:look('community-tab-trees'),moments:look('community-tab-moments')};});
    assert.equal(tabLook.trees.selected,'true',width+'/'+theme+': 기본 선택 탭은 트리');
    assert.equal(tabLook.trees.bg,roles['--lt-role-accent-bg'],width+'/'+theme+': 선택 탭 강조 채움');
    assert.notEqual(tabLook.moments.bg,tabLook.trees.bg,width+'/'+theme+': 선택·비선택 탭 바탕 다름');
    if(theme==='night'){
     const notGold=c=>{const v=parseColor(c);return v.r-v.b<40;};
     assert.ok(notGold(tabLook.moments.border),width+'/밤: 비선택 탭 테두리 금색 아님 '+tabLook.moments.border);
     const chipBorder=await page.locator('#community-groups .community-group-chip:not(.is-active)').first().evaluate(el=>getComputedStyle(el).borderTopColor);
     assert.ok(notGold(chipBorder),width+'/밤: 비선택 칩 테두리 금색 아님 '+chipBorder);
    }
    const pairs=[
     ['강조',roles['--lt-role-accent-ink'],roles['--lt-role-accent-bg']],
     ['보조 단추',roles['--lt-role-secondary-ink'],roles['--lt-role-bg']],
     ['입력 칸',roles['--lt-role-input-ink'],roles['--lt-role-input-bg']],
     ['선택 안 됨',roles['--lt-role-idle-ink'],roles['--lt-role-bg']],
     ['마우스 올림',roles['--lt-role-hover-ink'],roles['--lt-role-hover-bg']],
     ['글자 진함',roles['--lt-role-text-strong'],roles['--lt-role-bg']],
     ['글자 중간',roles['--lt-role-text-muted'],roles['--lt-role-bg']],
     ['글자 흐림',roles['--lt-role-text-faint'],roles['--lt-role-bg']]
    ];
    for(const [label,fg,bg] of pairs){const f=over(parseColor(fg),parseColor(bg)),b=over(parseColor(bg),roleBg),value=contrast(f,b);assert.ok(value>=4.5,width+'/'+theme+': '+label+' 대비 '+value.toFixed(2)+':1');}
    if(theme==='night'){
     const rose=[roles['--lt-rose'],roles['--lt-rose-ink']];
     assert.ok(Object.entries(roles).filter(([name])=>name.startsWith('--lt-role-')).every(([,value])=>!rose.includes(value)),width+'/밤: 역할 색에 분홍 없음');
    }
    const idleTab=page.locator('#community-tab-moments'),tabBefore=await idleTab.evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,cursor:s.cursor};});
    await idleTab.hover();const tabAfter=await idleTab.evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,cursor:s.cursor};});
    assert.notDeepEqual([tabAfter.bg,tabAfter.color],[tabBefore.bg,tabBefore.color],width+'/'+theme+': 비선택 탭 마우스 올림 변화');
    assert.equal(tabAfter.cursor,'pointer');await page.mouse.move(0,0);
    const sortBefore=await page.locator('.community-sort-trigger').evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color};});
    await page.locator('.community-sort-trigger').hover();const sortAfter=await page.locator('.community-sort-trigger').evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color};});
    assert.notDeepEqual(sortAfter,sortBefore,width+'/'+theme+': 정렬 단추 마우스 올림 변화');await page.mouse.move(0,0);
    const chip=page.locator('#community-groups .community-group-chip').filter({hasText:'많은 그룹'}).first(),chipBefore=await chip.evaluate(el=>{const r=el.getBoundingClientRect();return [r.width,r.height]});
    await chip.click();await page.locator('.community-card').first().waitFor();const chipAfter=await chip.evaluate(el=>{const r=el.getBoundingClientRect();return [r.width,r.height]});
    assert.deepEqual(chipAfter,chipBefore,width+'/'+theme+': 칩 선택 전후 크기 같음');
    await chip.click();
    await page.locator('#community-query').focus();
    assert.equal(await page.locator('#community-query').evaluate(e=>document.activeElement===e),true,width+'/'+theme+': 검색칸 직접 입력');
    assert.ok(await page.locator('#community-query').evaluate(e=>e.getBoundingClientRect().width)>20,width+'/'+theme+': 입력칸 확장');
    const inputLook=await page.locator('#community-query').evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color,border:s.borderTopColor};});
    assert.deepEqual(inputLook,{bg:roles['--lt-role-input-bg'],color:roles['--lt-role-input-ink'],border:roles['--lt-role-input-border']},width+'/'+theme+': 입력 칸 역할 색 적용');
    await page.locator('#community-query').fill('가수');
    await page.locator('#community-query').press('Enter');
    assert.equal(await page.locator('#community-query').inputValue(),'가수');
    await page.locator('.community-sort-trigger').click();
    await page.locator('.community-sort-option[data-sort="popular"]').click();
    assert.equal(await page.locator('#community-sort option[value="popular"]').textContent(),'많이 담긴 순',width+'/'+theme+': 정렬 선택 이름');
    assert.equal(await page.locator('#community-sort').inputValue(),'popular',width+'/'+theme+': 인기순 선택 유지');
    const yBefore=await page.locator('.community-top-row').evaluate(e=>e.getBoundingClientRect().height);
    await page.locator('#community-tab-moments').click();
    const moment=await page.evaluate(()=>({
     row:document.querySelector('.community-top-row').getBoundingClientRect().height,
     search:getComputedStyle(document.querySelector('#community-search-form')).visibility,
     sort:getComputedStyle(document.querySelector('.community-sort-label')).visibility,
     scroll:document.documentElement.scrollWidth,view:innerWidth}));
    assert.equal(moment.row,yBefore,width+'/'+theme+': 순간 전환 높이 변화 0');
    assert.equal(moment.search,'hidden',width+'/'+theme+': 순간 찾기 숨김');
    assert.equal(moment.sort,'hidden',width+'/'+theme+': 순간 정렬 숨김');
    assert.equal(moment.scroll,moment.view,width+'/'+theme+': 순간 가로 넘침 0');
    await page.locator('#community-tab-trees').click();
    assert.equal(await page.locator('#community-sort').inputValue(),'popular',width+'/'+theme+': 돌아와도 인기순 유지');
    console.log('윗줄 점검',width,theme,'통과');
   }finally{await ctx.close();}
  }finally{await new Promise(r=>server.close(r));}
 }
 }finally{await browser.close();}
});


// #1356: 순간 보기 범위 칩(전체·이 트리만·내 순간). 390·1440 × 밤·정원 × 로그인·로그아웃.
const REL_LUM = (value) => {
  const parts = String(value || '').match(/[\d.]+/g)?.map(Number) || [];
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(parts[0] || 0) + 0.7152 * f(parts[1] || 0) + 0.0722 * f(parts[2] || 0);
};
const REL_CONTRAST = (a, b) => (Math.max(REL_LUM(a), REL_LUM(b)) + 0.05) / (Math.min(REL_LUM(a), REL_LUM(b)) + 0.05);

async function bootScope(browser, { width, height, theme, member, controls = {} }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  const calls = { public: 0, mine: 0, lastShare: '' };
  const mineItems = [{ ...items[0], id: 'mine-1', videoId: 'mine11111111', title: '내 순간 하나', keywords: [] }];
  const workspace = { revision: 1, state: { version: 1, trees: [{ id: 'tree1', subject: '주인', title: '내 트리', moments: [], edges: [] }], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-25T00:00:00.000Z' };
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== base) return u.hostname === 'i.ytimg.com' ? THUMB(route) : route.abort();
    if (u.pathname === '/api/public/moments') {
      calls.public += 1;
      calls.lastShare = u.searchParams.get('shareId') || '';
      const shareId = calls.lastShare;
      const listed = shareId ? items.filter((item) => item.shareId === shareId) : items;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: listed, total: listed.length, groups: GROUPS }) });
    }
    if (u.pathname === '/api/community/me/moments') {
      calls.mine += 1;
      if (controls.mineStatus === 500) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      const listed = controls.mineEmpty ? [] : mineItems;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: listed, total: listed.length, groups: [] }) });
    }
    if (u.pathname.startsWith('/api/workspace')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(workspace) });
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    return route.continue();
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/v41/${member ? '?account=1' : ''}#explore/moments`, { waitUntil: 'load' });
    await page.locator('#community-panel[open] #community-moments-panel:not([hidden])').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => !!document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId, null, { timeout: 30000 });
    return { server, ctx, page, calls, controls, base };
  } catch (error) { await ctx.close(); await new Promise((r) => server.close(r)); throw error; }
}

test('#1356 순간 보기 범위 칩: 표시·호출 조건·뒤로 가기·키보드·대비(390·1440 × 밤·정원 × 로그인·로그아웃)', { skip: REQUIRE ? false : skip, timeout: 600000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  const labelOf = (page) => page.locator('.moments-scope-chip').allTextContents();
  try {
    for (const width of [390, 1440]) for (const theme of ['night', 'garden']) for (const member of [false, true]) {
      const key = `${width}·${theme}·${member ? '로그인' : '로그아웃'}`;
      const h = await bootScope(browser, { width, height: width === 390 ? 844 : 900, theme, member });
      try {
        const panel = h.page.locator('#community-moments-panel');
        assert.deepEqual(await labelOf(h.page), member ? ['전체', '내 순간'] : ['전체'], `${key}: 기본 칸`);
        assert.equal(h.calls.mine, 0, `${key}: 첫 열기에서 내 순간 요청 0`);
        // 순간의 트리 이름을 누르면 '이 트리만'이 나타나고 그 트리만 요청한다.
        if (width === 390) await h.page.locator('.moments-info-button').click();
        await panel.locator('.moments-tree-name').first().click();
        await h.page.waitForTimeout(250);
        const afterTree = await labelOf(h.page);
        assert.deepEqual(afterTree, member ? ['전체', '이 트리만', '내 순간'] : ['전체', '이 트리만'], `${key}: 트리 이름 누름 뒤 칸`);
        assert.match(h.page.url(), /scope=tree/, `${key}: 트리 칩이 주소에 남는다`);
        assert.ok(h.calls.lastShare, `${key}: shareId를 붙여 요청`);
        if (member) {
          const beforeMine = h.calls.mine;
          await panel.locator('.moments-scope-chip[data-scope="mine"]').click();
          await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-title')?.textContent === '내 순간 하나', null, { timeout: 10000 });
          assert.equal(h.calls.mine, beforeMine + 1, `${key}: 내 순간은 한 번만 요청`);
          assert.match(h.page.url(), /scope=mine/, `${key}: 내 순간 칩이 주소에 남는다`);
          const scroll = await panel.evaluate((node) => node.scrollTop);
          assert.equal(scroll, 0, `${key}: 칩을 바꾸면 목록 맨 위`);
          await h.page.goBack();
          await h.page.waitForTimeout(200);
          assert.match(h.page.url(), /scope=tree/, `${key}: 뒤로 가기로 이 트리만 복원`);
          assert.equal(await panel.locator('.moments-scope-chip[data-scope="tree"]').getAttribute('aria-pressed'), 'true', `${key}: 복원된 칩 표시`);
        } else {
          assert.equal(await panel.locator('.moments-scope-chip[data-scope="mine"]').count(), 0, `${key}: 로그아웃에는 내 순간 칸 없음`);
          assert.equal(h.calls.mine, 0, `${key}: 로그아웃에서 내 순간 요청 0`);
        }
        // 키보드: Tab으로 다음 칩에 가고 Enter로 고른다.
        const firstChip = panel.locator('.moments-scope-chip').first();
        await firstChip.focus();
        await h.page.keyboard.press('Tab');
        const focused = await h.page.evaluate(() => document.activeElement?.dataset?.scope || '');
        assert.ok(focused, `${key}: Tab으로 범위 칩에 도달`);
        await h.page.keyboard.press('Enter');
        await h.page.waitForTimeout(200);
        assert.equal(await panel.locator(`.moments-scope-chip[data-scope="${focused}"]`).getAttribute('aria-pressed'), 'true', `${key}: Enter로 선택`);
        // 겹침·가로 넘침 0, 선택·쉬는 칩 대비 4.5:1.
        const audit = await auditPage(h.page, '둘러보기 순간 범위');
        const structural = failuresOf(audit, String(width), theme).filter((row) => ['겹침', '가려짐', '잘림', '가로넘침'].includes(row[0]));
        assert.deepEqual(structural, [], `${key}: ${JSON.stringify(structural)}`);
        const colors = await panel.evaluate(() => {
          const probe = document.createElement('span'); probe.style.display = 'none'; document.body.append(probe);
          probe.style.color = 'var(--lt-role-bg)'; const base = getComputedStyle(probe).color; probe.remove();
          const read = (chip) => { const cs = getComputedStyle(chip); return { fg: cs.color, bg: cs.backgroundColor }; };
          return { base, active: read(document.querySelector('.moments-scope-chip.is-active')), idle: read(document.querySelector('.moments-scope-chip:not(.is-active)')) };
        });
        const over = (top, bottom) => {
          const a = String(top).match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 1];
          const b = String(bottom).match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 1];
          const alpha = a[3] ?? 1;
          return `rgb(${a[0] * alpha + b[0] * (1 - alpha)},${a[1] * alpha + b[1] * (1 - alpha)},${a[2] * alpha + b[2] * (1 - alpha)})`;
        };
        assert.ok(REL_CONTRAST(colors.active.fg, over(colors.active.bg, colors.base)) >= 4.5, `${key}: 선택 칩 대비`);
        assert.ok(REL_CONTRAST(colors.idle.fg, over(colors.idle.bg, colors.base)) >= 4.5, `${key}: 쉬는 칩 대비`);
        if (member && width === 1440 && theme === 'night') {
          h.controls.mineStatus = 500;
          await panel.locator('.moments-scope-chip[data-scope="mine"]').click();
          await panel.locator('.moments-empty-retry').waitFor({ state: 'visible', timeout: 10000 });
          assert.match(await panel.locator('.moments-empty').textContent(), /불러오지 못했어요/, `${key}: 오류 안내`);
          h.controls.mineStatus = 200;
          await panel.locator('.moments-empty-retry').click();
          await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-title')?.textContent === '내 순간 하나', null, { timeout: 10000 });
          h.controls.mineEmpty = true;
          await panel.locator('.moments-scope-chip[data-scope="all"]').click();
          await panel.locator('.moments-scope-chip[data-scope="mine"]').click();
          await panel.locator('.moments-empty').waitFor({ state: 'visible', timeout: 10000 });
          assert.equal(await panel.locator('.moments-empty-retry').isVisible(), false, `${key}: 빈 목록에는 다시 시도 없음`);
        }
        if (member && width === 1440 && theme === 'garden') {
          await h.page.goto(`${h.base}/v41/?account=1#share/${items[0].shareId}/book`, { waitUntil: 'load' });
          await h.page.locator('#community-menu').click();
          await h.page.waitForTimeout(400);
          assert.ok((await labelOf(h.page)).includes('이 트리만'), `${key}: 공유 트리 화면에서 들어오면 이 트리만`);
        }
        console.log('#1356', key, JSON.stringify({ chips: afterTree, public: h.calls.public, mine: h.calls.mine, structural: structural.length }));
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});
