// #1025 1단계 — 둘러보기 [순간] 보기 동작 시험(새 소스 글자 검사 없음).
// iframe은 지금 것+다음 것만(≤2), 10회 넘기는 동안 같은 영상 반복 0, 세로만, 390·1440·2560 겹침·잘림 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { waitForShownScreen } from './helpers/visible-frame.mjs';
import { inspectYoutubeIframe, countYoutubeAutoplay } from './helpers/youtube-embed-audit.mjs';
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
  vertical: i % 2 === 0, ownerName: '대표 이용자', treeTitle: i === 3 ? 'AI 명예회원 트리' : '팬 트리 ' + (i + 1),
  title: '세로 순간 ' + (i + 1), url: 'https://www.youtube.com/shorts/' + id,
  thumbnail: 'https://i.ytimg.com/vi/' + id + '/oardefault.jpg',
  note: '짧게 남긴 마음 ' + (i + 1), emotion: '설렘', date: '2026-11-20',
  keywords: [i % 3 === 0 ? '가수:다른가수' : '가수:아이유', '노래:노래' + (i + 1)], aiTester: i === 3,
  startSeconds: i === 0 ? 5 : null, endSeconds: i === 0 ? 20 : null
}));
const GROUPS = [{value:'아이유',count:8},{value:'다른가수',count:4}];

async function step(page, panel, width, delta) {
  if (width <= 780) {
    await panel.evaluate(el => el.querySelector('.moments-context').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })));
  } else {
    await panel.locator('.moments-step').nth(delta > 0 ? 1 : 0).click();
  }
}

async function boot(browser, { width, height, theme, thumb = THUMB, moment = null, init = null }) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 780, isMobile: width <= 780 });
  await ctx.addInitScript(t => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
  if (init) await ctx.addInitScript(init);
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


const CAPTURE=process.env.LT_1286_CAPTURE||'';
const BEFORE=process.env.LT_1286_BEFORE==='1';
// 기존 #1286·#1305·#1332·#1340의 재생·접근성·넘기기 동작을 새 외부 도구 배치에서 유지한다.
test('#1286 세로·가로 영상 방향, 카드 폭 및 접근 이름',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
  const h=await boot(browser,{width,height,theme});
  try{
   const panel=h.page.locator('#community-moments-panel');
   const one=await panel.evaluate(el=>({orientation:el.querySelector('.moments-media').dataset.orientation,
    frame:el.querySelector('.moments-card').getBoundingClientRect().width,
    labels:[...el.querySelectorAll('.moments-rail .moments-rail-button')].map(x=>x.getAttribute('aria-label'))}));
   assert.equal(one.orientation,'portrait','첫 영상 세로 분류');
   assert.deepEqual(one.labels,['마음','댓글','담기','트리','공유'],'다섯 동작 접근 이름');
   assert.ok(width===390?one.frame>=width-32:one.frame<width-120,'카드 너비 규칙');
   await step(h.page,panel,width,1);
   assert.equal(await panel.locator('.moments-media').getAttribute('data-orientation'),'landscape','두 번째 영상 가로 분류');
   assert.equal(await h.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'가로 넘침 0');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }}finally{await browser.close();}
});
test('#1305 사용자 영상 클릭은 서비스 재생 제어를 호출하지 않는다',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{for(const [width,height] of [[390,844],[1440,900]]){
  const h=await boot(browser,{width,height,theme:'night'});
  try{
   const panel=h.page.locator('#community-moments-panel'),stage=panel.locator('.moments-stage');
   const before=await stage.getAttribute('data-lt-playing');
   await panel.locator('.moments-media').evaluate(el=>el.click());
   assert.equal(await stage.getAttribute('data-lt-playing'),before,'서비스 누름 동작은 재생 상태를 바꾸지 않음');
   assert.equal(await panel.locator('.moments-frame:not(.moments-next)').evaluate(el=>new URL(el.src).searchParams.get('controls')),'1','유튜브 기본 재생 도구 유지');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }}finally{await browser.close();}
});
test('#1305 가수 단추·위 도구 영역은 영상 밖에 둔다',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  const h=await boot(browser,{width:390,height:844,theme:'garden'});
  try{
   await h.page.locator('.moments-info-button').click();
   const info=await h.page.evaluate(()=>{
    const chips=document.querySelector('.moments-chips'),buttons=[...chips.querySelectorAll('button')],bar=document.querySelector('.community-top-row'),video=document.querySelector('.moments-frame:not(.moments-next)').getBoundingClientRect();
    return{names:buttons.map(x=>x.textContent),barHeight:bar.getBoundingClientRect().height,barBottom:bar.getBoundingClientRect().bottom,playerTop:video.top,chipsBottom:chips.getBoundingClientRect().bottom,chipWidth:chips.clientWidth};
   });
   assert.ok(info.names.length>=2&&info.names.includes('아이유'),'가수 필터');
   assert.equal(info.barHeight,48,'위 띠 48px');
   assert.ok(info.barBottom<=info.playerTop,'도구 띠가 플레이어 바깥');
   assert.ok(info.chipWidth>0,'가수 단추가 정보 판에 표시됨');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }finally{await browser.close();}
});
test('#1332 소리 단추 조작은 다음 순간에도 유지한다',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
  const h=await boot(browser,{width,height,theme});
  try{
   const panel=h.page.locator('#community-moments-panel'),stage=panel.locator('.moments-stage'),sound=h.page.locator('.moments-toolbar .is-sound');
   assert.equal(await sound.getAttribute('aria-label'),'소리 켜기','처음 음소거 상태');
   await sound.click();
   assert.equal(await stage.getAttribute('data-lt-moments-muted'),'false','소리 켜짐');
   assert.equal(await sound.getAttribute('aria-label'),'소리 끄기','접근성 이름 바뀜');
   const before=await stage.getAttribute('data-lt-moments-id');
   await step(h.page,panel,width,1);
   assert.notEqual(await stage.getAttribute('data-lt-moments-id'),before,'다음 순간');
   assert.equal(await stage.getAttribute('data-lt-moments-muted'),'false','소리 선택 유지');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }}finally{await browser.close();}
});
test('#1332 영상 상태 신호에 따라 소리 접근 이름을 고친다',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  const h=await boot(browser,{width:390,height:844,theme:'night'});
  try{
   const sound=h.page.locator('.moments-toolbar .is-sound');
   await sound.click();
   for(const muted of [true,false]){
    await h.page.evaluate(muted=>{
     const f=document.querySelector('.moments-frame:not(.moments-next)');
     window.dispatchEvent(new MessageEvent('message',{source:f.contentWindow,data:JSON.stringify({event:'infoDelivery',info:{muted}})}));
    },muted);
    assert.equal(await sound.getAttribute('aria-label'),muted?'소리 켜기':'소리 끄기','실제 플레이어 상태 반영');
   }
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }finally{await browser.close();}
});
test('#1340 음소거 강조와 도구의 44픽셀 누름 범위',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
  const h=await boot(browser,{width,height,theme});
  try{
   const sound=h.page.locator('.moments-toolbar .is-sound');
   const before=await sound.evaluate(e=>({color:getComputedStyle(e).color,rose:getComputedStyle(document.documentElement).getPropertyValue('--lt-rose').trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));
   assert.ok(before.w>=44&&before.h>=44,'소리 단추 최소 44픽셀');
   assert.equal(before.color,(()=>{const x=before.rose;return /^#[0-9a-f]{6}$/i.test(x)?'rgb('+[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)).join(', ')+')':x})(),'음소거는 장미색');
   await sound.click();
   const after=await sound.evaluate(e=>getComputedStyle(e).color);
   assert.notEqual(after,before.color,'소리 켜면 강조 해제');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }}finally{await browser.close();}
});
test('#1340 영상 전면 소리 알약·투명 밀기층 제거, 모바일 보기 상태 복귀',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  const h=await boot(browser,{width:390,height:844,theme:'night'});
  try{
   const page=h.page,stage=page.locator('.moments-stage'),info=page.locator('.moments-info-button');
   const overlaps=await page.evaluate(()=>[...document.querySelectorAll('.moments-sound-pill,.moments-swipe-layer,.moments-swipe-hint')].filter(e=>e.getBoundingClientRect().height>0).length);
   assert.equal(overlaps,0,'영상 전면 서비스 알약·밀기층 0');
   await info.click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('lt41.momentInfoOpen')),'1','열림 상태 기억');
   await page.locator('#community-tab-trees').click();
   await page.locator('#community-tab-moments').click();
   assert.equal(await stage.evaluate(e=>e.classList.contains('moments-info-open')),true,'탭 재진입 후 유지');
   await info.click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('lt41.momentInfoOpen')),'0','닫힘 상태 기억');
  }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
 }finally{await browser.close();}
});
// #1354: 영상 위 알약/투명층 시험은 서비스 요소 0 및 원본 재생 기능 유지 시험으로 교체한다.
test('#1354 플레이어 겹침·가시성·자동재생·정보상태·중앙배치', {skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
   const h=await boot(browser,{width,height,theme});
   try{
    const panel=h.page.locator('#community-moments-panel'),stage=panel.locator('.moments-stage');
    const info=h.page.locator('.moments-toolbar .moments-info-button');
    assert.equal(await info.isVisible(),width===390,'정보 단추는 휴대폰에만 표시');
    assert.equal(await h.page.locator('.moments-toolbar .moments-rail-button.is-sound').isVisible(),true,'소리 단추는 상단');
    for(const open of [false,true]){
     if(width===390&&(await info.getAttribute('aria-expanded'))!==String(open))await info.click();
     await panel.evaluate(el=>{
      const f=el.querySelector('.moments-frame:not(.moments-next)');
      window.dispatchEvent(new MessageEvent('message',{source:f.contentWindow,data:JSON.stringify({event:'infoDelivery',info:{playerState:1,muted:true}})}));
     });
     const v=await panel.evaluate(el=>{
      const f=el.querySelector('.moments-frame:not(.moments-next)'),n=el.querySelector('.moments-next'),r=f.getBoundingClientRect(),card=el.querySelector('.moments-card'),ctx=el.querySelector('.moments-context'),row=document.querySelector('.community-top-row.is-moments'),stage=el.querySelector('.moments-stage');
      const rect=e=>e.getBoundingClientRect();
      return {w:r.width,h:r.height,blocked:null,frames:el.querySelectorAll('.moments-frame').length,autoplay:null,nextAuto:n?new URL(n.src).searchParams.get('autoplay'):null,nextMute:n?new URL(n.src).searchParams.get('mute'):null,contextVisible:rect(ctx).height>0,infoOpen:stage.classList.contains('moments-info-open'),contextTop:rect(ctx).top,cardTop:rect(card).top,rowLeft:rect(row).left,rowRight:rect(row).right,stageLeft:rect(stage).left,stageRight:rect(stage).right,topHeight:rect(row).height};
     });
     const playerAudit=await inspectYoutubeIframe(panel.locator('.moments-frame:not(.moments-next)'));
     v.blocked=playerAudit.blocked;
     v.autoplay=await countYoutubeAutoplay(panel);
     assert.equal(playerAudit.minimum200,true,'공용 도우미: 플레이어 최소 크기');
     assert.ok(v.w>=200&&v.h>=200,'플레이어 최소 200×200');
     assert.equal(v.blocked,0,'플레이어 내부 9점의 맨 위 요소는 iframe');
     assert.equal(v.frames,2,'현재 영상+준비 영상 2개');
     assert.equal(v.autoplay,1,'자동재생 지정은 동시에 한 개');
     assert.equal(v.nextAuto,'0','미리 불러 둔 영상 자동재생 금지');
     assert.equal(v.nextMute,'1','미리 불러 둔 영상 음소거');
     if(width===390){
      assert.equal(v.topHeight,48,'상단 띠 48px');
      assert.equal(v.contextVisible,open,'정보 판 보임·숨김');
      assert.equal(v.infoOpen,open,'정보 판 상태');
     }else{
      assert.equal(v.contextVisible,true,'PC 왼쪽 정보 판은 항상 표시');
      assert.ok(Math.abs(v.contextTop-v.cardTop)<=2,'PC 왼쪽 판 상단 플레이어와 정렬');
      assert.ok(Math.abs(v.rowLeft-v.stageLeft)<=2&&Math.abs(v.rowRight-v.stageRight)<=2,'PC 위 도구와 가운데 묶음 좌우 정렬');
     }
     if(CAPTURE){
      const {mkdir}=await import('node:fs/promises');await mkdir(CAPTURE,{recursive:true});
      await h.page.screenshot({path:CAPTURE+'/'+width+'-'+theme+'-'+(open?'open':'closed')+'.png',animations:'disabled'});
     }
    }
    const before=await stage.getAttribute('data-lt-moments-id');
    await step(h.page,panel,width,1);
    assert.notEqual(await stage.getAttribute('data-lt-moments-id'),before,'다음 순간');
    if(width===390){
     assert.equal(await stage.evaluate(e=>e.classList.contains('moments-info-open')),true,'다음 순간에도 정보 판 열림 유지');
     await info.click();
     assert.equal(await stage.evaluate(e=>e.classList.contains('moments-info-open')),false,'정보 판 다시 닫힘');
    }
   }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
  }
 }finally{await browser.close();}
});
test('#1354 재생 불가 오류의 플레이어 제거 및 안내 분리',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  for(const [width,height] of [[390,844],[1440,900]])for(const code of [100,101,150]){
   const h=await boot(browser,{width,height,theme:'night'});
   try{
    await h.page.evaluate(code=>{
     const f=document.querySelector('#community-moments-panel .moments-frame:not(.moments-next)');
     window.dispatchEvent(new MessageEvent('message',{source:f.contentWindow,data:JSON.stringify({event:'onError',data:code})}));
    },code);
    const v=await h.page.locator('#community-moments-panel').evaluate(el=>({
     unavailable:el.querySelector('.moments-stage').dataset.ltMomentUnavailable,
     frameCount:el.querySelectorAll('.moments-frame').length,
     fallbackHeight:el.querySelector('.moments-fallback').getBoundingClientRect().height,
     soundHeight:document.querySelector('.moments-toolbar .is-sound').getBoundingClientRect().height
    }));
    assert.equal(v.unavailable,'1','재생 불가 상태');
    assert.equal(v.frameCount,0,'안내 카드와 겹칠 플레이어가 없음');
    assert.ok(v.fallbackHeight>=200,'안내 카드 표시');
    assert.equal(v.soundHeight,0,'재생 불가 영상의 소리 단추 숨김');
   }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
  }
 }finally{await browser.close();}
});
// #1352·#1360: 재생 끝 다음 넘김, 구간 순간, 재생 불가 건너뛰기 — 화면 배치는 바꾸지 않는다.
async function sendFromCurrent(page, payload) {
  const handle = await page.$('#community-moments-panel .moments-frame:not(.moments-next)');
  assert.ok(handle, '지금 재생 중인 플레이어가 있다');
  const frame = await handle.contentFrame();
  await frame.evaluate(p => window.parent.postMessage(JSON.stringify(p), '*'), payload);
}
const momentId = (page) => page.evaluate(() => document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId || '');

test('#1352 동작: 재생이 끝나면 구간 순간도 다음 순간으로 넘어간다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const h = await boot(browser, { width, height, theme: 'night' });
      try {
        const before = await momentId(h.page);
        assert.equal(before, IDS[0], '첫 순간(구간 있음)에서 시작');
        await sendFromCurrent(h.page, { event: 'onStateChange', info: 0 });
        await h.page.waitForFunction(id => document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId !== id, before, { timeout: 5000 });
        assert.equal(await momentId(h.page), IDS[1], '구간이 있어도 다음으로 넘어간다');
        assert.equal(await h.page.evaluate(() => history.length >= 1), true, '페이지 기록은 유지된다');
        const frames = await h.page.evaluate(() => document.querySelectorAll('#community-moments-panel .moments-frame').length);
        assert.ok(frames <= 2, `동시에 있는 플레이어는 최대 2개(${frames})`);
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1352 동작: 연속 재생 선택을 끄면 구간 반복을 유지한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    const h = await boot(browser, { width: 1440, height: 900, theme: 'night', init: () => localStorage.setItem('lt41.momentAutoNext', '0') });
    try {
      const before = await momentId(h.page);
      await sendFromCurrent(h.page, { event: 'onStateChange', info: 0 });
      await h.page.waitForTimeout(700);
      assert.equal(await momentId(h.page), before, '꺼져 있으면 다음으로 넘어가지 않는다');
    } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
  } finally { await browser.close(); }
});

test('#1360 동작: 재생 불가 알림 100·101·150은 1.5초 뒤 다음으로 넘어간다', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) for (const code of [100, 101, 150]) {
      const h = await boot(browser, { width, height, theme: 'night' });
      try {
        const before = await momentId(h.page);
        await sendFromCurrent(h.page, { event: 'onError', data: code });
        await h.page.waitForFunction(() => document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentUnavailable === '1', null, { timeout: 5000 });
        const notice = await h.page.evaluate(() => {
          const f = document.querySelector('#community-moments-panel .moments-fallback');
          const n = f?.querySelector('.lt-fallback-notice');
          const t = f?.querySelector('.lt-fallback-title');
          if (!n) return { text: '', overlap: true };
          const a = n.getBoundingClientRect(), b = t?.getBoundingClientRect();
          return { text: n.textContent, overlap: !!b && a.top < b.bottom && a.bottom > b.top };
        });
        assert.match(notice.text, /영상을 볼 수 없어요/);
        assert.equal(notice.overlap, false, '문구가 제목과 겹치지 않는다');
        assert.equal(await h.page.locator('#community-moments-panel .moments-rail-button.is-sound').isVisible(), false, '소리 단추가 숨는다');
        await h.page.waitForFunction(id => document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId !== id, before, { timeout: 5000 });
        assert.equal(await momentId(h.page), IDS[1], `${code}: 다음 순간으로 넘어간다`);
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1352 동작: 마지막 순간에서 끝나도 멈추고 다음 것을 더 찾는다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    const h = await boot(browser, { width: 1440, height: 900, theme: 'night' });
    try {
      const panel = h.page.locator('#community-moments-panel');
      for (let i = 0; i < IDS.length - 1; i += 1) await step(h.page, panel, 1440, 1);
      const before = await momentId(h.page);
      assert.equal(before, IDS[IDS.length - 1], '마지막 순간이다');
      await sendFromCurrent(h.page, { event: 'onStateChange', info: 0 });
      await h.page.waitForTimeout(2200);
      assert.equal(await momentId(h.page), before, '더 불러올 것이 없으면 그대로 멈춘다');
    } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
  } finally { await browser.close(); }
});

test('#1286 휴대폰 실제 터치 밀기: 위 띠·영상 옆 여백·정보 판, 영상은 가로채지 않음', {skip:REQUIRE?false:skip,timeout:240000}, async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  for(const theme of ['night','garden']){
   const h=await boot(browser,{width:390,height:844,theme});
   try{
    const page=h.page,stage=page.locator('.moments-stage');
    await page.locator('.moments-info-button').click();
    const cdp=await h.ctx.newCDPSession(page);
    const point=async(area)=>{
     return page.evaluate(area=>{
      const panel=document.querySelector('#community-moments-panel');
      const stage=panel.querySelector('.moments-stage');
      const frame=panel.querySelector('.moments-frame:not(.moments-next)');
      const toolbar=document.querySelector('.moments-toolbar');
      const context=panel.querySelector('.moments-context');
      const rect=area==='toolbar'?toolbar.getBoundingClientRect():area==='context'?context.getBoundingClientRect():area==='video'?frame.getBoundingClientRect():stage.getBoundingClientRect();
      for(let yi=1;yi<=9;yi++)for(let xi=1;xi<=9;xi++){
       const x=rect.left+rect.width*(area==='margin'?[.01,.02,.03,.97,.98,.99,.01,.98,.99][xi-1]:xi/10),y=rect.top+rect.height*yi/10;
       if(x<1||x>innerWidth-1||y<1||y>innerHeight-1)continue;
       const el=document.elementFromPoint(x,y);
       if(!el)continue;
       if(area==='video'&&el===frame)return{x:Math.round(x),y:Math.round(y)};
       if(area==='toolbar'&&toolbar.contains(el)&&!el.closest('button,a,input,select,textarea'))return{x:Math.round(x),y:Math.round(y)};
       if(area==='context'&&context.contains(el)&&!el.closest('button,a,input,select,textarea'))return{x:Math.round(x),y:Math.round(y)};
       if(area==='margin'&&stage.contains(el)&&!el.closest('.moments-media,.moments-context,.moments-nav,.moments-rail,button,a,input,select,textarea'))return{x:Math.round(x),y:Math.round(y)};
      }
      return null;
     },area);
    };
    const swipe=async(p,up)=>{
     const start={x:p.x,y:p.y},end={x:p.x,y:Math.max(8,Math.min(836,p.y+(up?-100:100)))};
     // 시작 지점이 화면 끝에 가까우면 반대쪽으로 충분히 이동한다.
     if(Math.abs(end.y-start.y)<65)end.y=start.y+(up?-70:70);
     const touch=(pos)=>[{x:pos.x,y:pos.y,id:1}];
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(start)});
     for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch({x:start.x,y:start.y+(end.y-start.y)*i/5})});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    for(const area of ['toolbar','margin','context']){
     const p=await point(area);
     assert.ok(p,theme+' '+area+' 실제 노출된 밀기 시작점');
     const before=await stage.getAttribute('data-lt-moments-id');
     await swipe(p,true);
     await page.waitForFunction(id=>document.querySelector('.moments-stage')?.dataset.ltMomentsId!==id,before);
     const after=await stage.getAttribute('data-lt-moments-id');
     assert.notEqual(after,before,theme+' '+area+' 위 밀기 다음 순간');
     await swipe(p,false);
     await page.waitForFunction(id=>document.querySelector('.moments-stage')?.dataset.ltMomentsId!==id,after);
     assert.equal(await stage.getAttribute('data-lt-moments-id'),before,theme+' '+area+' 아래 밀기 이전 순간');
    }
    const video=await point('video');
    assert.ok(video,theme+' 영상 iframe 실제 터치 지점');
    const before=await stage.getAttribute('data-lt-moments-id');
    await swipe(video,true);
    assert.equal(await stage.getAttribute('data-lt-moments-id'),before,theme+' 영상 위 밀기는 서비스 전환 안 함');
    assert.equal(await page.locator('.moments-swipe-layer').count(),0,'영상 위 투명 밀기 층 없음');
   }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
  }
 }finally{await browser.close();}
});
