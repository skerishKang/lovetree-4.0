// #1025 1단계 — 둘러보기 [순간] 보기 동작 시험(새 소스 글자 검사 없음).
// iframe은 지금 것+다음 것만(≤2), 10회 넘기는 동안 같은 영상 반복 0, 세로만, 390·1440·2560 겹침·잘림 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
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
    await panel.evaluate(el => el.querySelector('.moments-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })));
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
test('#1286 휴대폰 쇼츠 폭·접근성·밀기 및 넓은 화면 유지', {skip:REQUIRE?false:skip,timeout:240000},async()=>{
 if(skip)assert.fail(skip);
 const browser=await chromium.launch({headless:true});
 try{
  for(const [width,height] of [[390,844],[1440,900]])for(const theme of ['night','garden']){
   const h=await boot(browser,{width,height,theme});
   try{
    const panel=h.page.locator('#community-moments-panel'),stage=panel.locator('.moments-stage');
    for(const [orientation,offset] of [['portrait',0],['landscape',1]]){
     if(offset)await stage.evaluate(el=>el.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true})));
     await h.page.waitForTimeout(100);
     if(CAPTURE){
      const {mkdir}=await import('node:fs/promises');await mkdir(CAPTURE,{recursive:true});
      await h.page.screenshot({path:CAPTURE+'/'+width+'-'+theme+'-'+orientation+'.png',animations:'disabled'});
     }
     if(BEFORE)continue;
     const m=await panel.evaluate(el=>{
      const stage=el.querySelector('.moments-stage'),card=el.querySelector('.moments-card'),r=card.getBoundingClientRect();
      return {width:innerWidth,left:r.left,right:r.right,cardWidth:r.width,overflow:document.documentElement.scrollWidth-innerWidth,
       names:[...el.querySelectorAll('.moments-rail-button')].map(b=>b.getAttribute('aria-label')),
       backgrounds:[...el.querySelectorAll('.moments-rail-button')].map(b=>getComputedStyle(b).backgroundColor),
       arrows:[getComputedStyle(el.querySelector('.moments-nav')).display],
       owner:el.querySelector('.moments-owner')?.textContent,tree:el.querySelector('.moments-tree-name')?.textContent,
       orientation:el.querySelector('.moments-media').dataset.orientation,
       progress:el.querySelector('.moments-progress').getBoundingClientRect().height,
       soundName:el.querySelector('.moments-rail-button.is-sound')?.classList.contains('is-muted')?'소리 켜기':'소리 끄기'};
     });
     assert.deepEqual(m.names,['마음','댓글','담기','트리','공유',m.soundName],'여섯 단추 접근 이름');
     assert.ok(m.overflow<=0,'가로 넘침 '+JSON.stringify(m));
     assert.ok(m.owner&&m.tree,'주인 및 트리');
     if(width===390){
      assert.ok(m.cardWidth>=width-2&&Math.abs(m.left)<=2,'가로 끝까지 '+JSON.stringify(m));
      assert.ok(m.arrows.every(x=>x==='none'),'▲▼ 숨김');
      assert.ok(m.backgrounds.every(x=>x==='rgba(0, 0, 0, 0)'),'동그란 바탕 제거');
      assert.equal(m.orientation,orientation,'화면 영상 방향');
      assert.ok(m.progress>0&&m.progress<=4,'얇은 진행 막대');
      await panel.locator('.moments-note').click();
      assert.equal(await panel.locator('.moments-note').getAttribute('aria-expanded'),'true');
      await panel.locator('.moments-note').click();
      await panel.evaluate(el=>{
       const f=el.querySelector('.moments-frame:not(.moments-next)');
       window.dispatchEvent(new MessageEvent('message',{source:f.contentWindow,data:JSON.stringify({event:'infoDelivery',info:{currentTime:10,duration:100,muted:true}})}));
      });
      assert.equal(await panel.locator('.moments-progress').getAttribute('data-lt-progress'),'10','유튜브 재생 정보 진행 막대');
      await panel.locator('.moments-rail-button.is-sound').click();
      assert.equal(await panel.locator('.moments-rail-button.is-sound').getAttribute('aria-label'),'소리 끄기');
     }else{
      assert.ok(m.cardWidth<width-120,'넓은 화면 기존 판');
      assert.ok(m.arrows.every(x=>x!=='none'),'PC ▲▼ 유지');
     }
     console.log('#1286',width,theme,orientation,JSON.stringify(m));
    }
    if(BEFORE)continue;
    const before=await stage.getAttribute('data-lt-moments-id');
    if(width===390){
     const swipe=(from,to)=>stage.evaluate((el,pair)=>{
      const layer=el.querySelector('.moments-swipe-layer'),t=y=>new Touch({identifier:1,target:layer,clientX:180,clientY:y});
      layer.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(pair[0])],changedTouches:[t(pair[0])]}));
      layer.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[t(pair[1])]}));
     },[from,to]);
     await swipe(650,340);assert.notEqual(await stage.getAttribute('data-lt-moments-id'),before,'밀어 다음');
     await swipe(340,650);assert.equal(await stage.getAttribute('data-lt-moments-id'),before,'밀어 이전');
     assert.equal(await h.page.evaluate(()=>localStorage.getItem('lt41.momentSwipeSeen')),'1','안내 저장');
    }else{
     await panel.locator('.moments-step').last().click();
     assert.notEqual(await stage.getAttribute('data-lt-moments-id'),before,'PC ▼');
     await h.page.keyboard.press('ArrowUp');
     assert.equal(await stage.getAttribute('data-lt-moments-id'),before,'PC 키보드');
    }
   }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
  }
 }finally{await browser.close();}
});

test('#1305 순간 보기 첫 영상은 소리 없이 자동 재생되고, 누르면 멈춤·재생이 바뀐다', {skip:REQUIRE?false:skip,timeout:240000}, async () => {
  if(skip)assert.fail(skip);
  const browser=await chromium.launch({headless:true});
  try{
   for(const [width,height] of [[390,844],[1440,900]]){
    const h=await boot(browser,{width,height,theme:'night'});
    try{
     const panel=h.page.locator('#community-moments-panel'),stage=panel.locator('.moments-stage');
     await h.page.waitForTimeout(300);
     assert.equal(await stage.getAttribute('data-lt-autoplay'),'1','준비 뒤 재생 명령을 보냈다');
     assert.equal(await stage.getAttribute('data-lt-moments-muted'),'true','첫 영상은 소리 없이');
     await panel.locator('.moments-media').evaluate(el=>el.click());
     assert.equal(await stage.getAttribute('data-lt-playing'),'1','화면 누르면 재생');
     await panel.locator('.moments-media').evaluate(el=>el.click());
     assert.equal(await stage.getAttribute('data-lt-playing'),'0','다시 누르면 멈춤');
     // 소리 선택은 순간을 넘겨도 유지된다.
     await panel.locator('.moments-rail-button.is-sound').evaluate(el=>el.click());
     if(width===390)assert.equal(await stage.getAttribute('data-lt-moments-muted'),'false');
     const before=await stage.getAttribute('data-lt-moments-id');
     await step(h.page,panel,width,1);
     await h.page.waitForTimeout(200);
     assert.notEqual(await stage.getAttribute('data-lt-moments-id'),before,'넘기면 다음 순간');
     if(width===390)assert.equal(await stage.getAttribute('data-lt-moments-muted'),'false','소리 선택 유지');
     assert.equal(await panel.locator('.moments-frame').count(),2,'지금 것+다음 것만 남는다');
    }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
   }
  }finally{await browser.close();}
 });

test('#1305 390 단추는 영상 위 빈 띠에 있고 가수 단추는 잘리지 않는다', {skip:REQUIRE?false:skip,timeout:240000}, async () => {
  if(skip)assert.fail(skip);
  const browser=await chromium.launch({headless:true});
  try{
   const h=await boot(browser,{width:390,height:844,theme:'night'});
   try{
    const m=await h.page.evaluate(()=>{
     const tabs=document.querySelector('.community-tabs').getBoundingClientRect();
     const card=document.querySelector('.moments-card').getBoundingClientRect();
     const chips=document.querySelector('.moments-chips');
     const chipRect=chips.getBoundingClientRect();
     const cs=getComputedStyle(chips);
     return {tabBottom:tabs.bottom,cardTop:card.top,chipsRight:chipRect.right,vw:innerWidth,
      chipScroll:chips.scrollWidth,chipClient:chips.clientWidth,hidden:cs.scrollbarWidth,
      names:[...chips.querySelectorAll('.moments-chip')].map(e=>e.textContent.trim()),tabW:Math.round(tabs.width)};
    });
    assert.ok(m.tabBottom<=m.cardTop,'단추가 영상 위 빈 띠에 있다: '+JSON.stringify(m));
    assert.ok(m.chipsRight<=m.vw+1,'가수 단추 줄이 화면 밖으로 잘리지 않는다: '+JSON.stringify(m));
    assert.ok(m.names.length>=2&&m.names.includes('아이유'),'가수 단추가 여러 개 보인다: '+JSON.stringify(m));
    assert.equal(m.hidden,'none','회색 스크롤 막대를 숨긴다: '+JSON.stringify(m));
    // 트리 화면의 전환 단추도 같은 자리·같은 크기다. 카드 한 장을 mock으로 채운 새 창에서 본다.
    const card={shareId:'c0000000000000000000000a',title:'화면 확인용 공개 트리',subject:'확인 대상',summary:'첫 순간 소개',createdAt:'2026-11-15T09:00:00.000Z',momentCount:3,aiTester:false,emotions:['설렘'],cover:{url:'https://i.ytimg.com/vi/qaScreenAudit001/hqdefault.jpg',title:'첫 순간',emotion:'설렘'},stats:{favorites:0,hearts:0,favored:false,hearted:false,reactions:{},mine:[]}};
    const treeCtx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    try{
    await treeCtx.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
    await treeCtx.route('**/api/community/shares*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[card],total:1,groups:[]})}));
    const treePage=await treeCtx.newPage();
    await treePage.goto(h.base+'/v41/#explore',{waitUntil:'domcontentloaded'});
    await treePage.waitForSelector('#community-list .community-card',{timeout:10000});
    const tree=await treePage.evaluate(()=>{
     const tabs=document.querySelector('.community-tabs').getBoundingClientRect();
     const first=document.querySelector('#community-list .community-card')?.getBoundingClientRect();
     const heading=getComputedStyle(document.querySelector('#community-tree-panel .panel-heading')).display;
     return {tabs:{top:Math.round(tabs.top),left:Math.round(tabs.left),w:Math.round(tabs.width),h:Math.round(tabs.height)},
      firstTop:first?Math.round(first.top):null,firstBottom:first?Math.round(first.bottom):null,vh:innerHeight,heading,note:getComputedStyle(document.querySelector('#community-tree-panel > .panel-note')).display};
    });
    assert.equal(tree.heading,'none','큰 제목을 뺀다');
    assert.equal(tree.note,'none','설명 글을 뺀다');
    assert.equal(tree.tabs.w,m.tabW,'두 화면의 전환 단추 폭이 같다');
    assert.ok(tree.firstTop!==null&&tree.firstTop<tree.vh&&tree.firstBottom>0,'트리 카드 첫 줄이 첫 화면에 보인다: '+JSON.stringify(tree));
    }finally{await treeCtx.close();}
   }finally{await h.ctx.close();await new Promise(r=>h.server.close(r));}
  }finally{await browser.close();}
 });


const SOUND_CAPTURE = process.env.LT_1332_CAPTURE || '';
if (SOUND_CAPTURE) mkdirSync(SOUND_CAPTURE, { recursive: true });
const SOUND_KEY = 'lt41.momentSoundSeen';
const soundSpy = () => {
  window.__ltSoundPosts = [];
  const original = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const real = original.get.call(this);
      if (!real) return real;
      return new Proxy(real, {
        get(target, key) {
          if (key === 'postMessage') return (...args) => { window.__ltSoundPosts.push(String(args[0])); return target.postMessage(...args); };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }
  });
};

test('#1332 알약: 음소거 재생 중 보이고 누르면 소리가 켜진다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
      const h = await boot(browser, { width, height, theme, init: soundSpy });
      try {
        const panel = h.page.locator('#community-moments-panel');
        const stage = panel.locator('.moments-stage');
        const pill = panel.locator('.moments-sound-pill');
        await h.page.waitForTimeout(250);
        assert.equal(await stage.getAttribute('data-lt-moments-muted'), 'true', `${width}/${theme}: 첫 영상은 음소거`);
        assert.equal(await pill.isVisible(), true, `${width}/${theme}: 알약이 보인다`);
        assert.match(await pill.textContent(), /눌러서 소리 켜기/, `${width}/${theme}: 큰 안내 문구`);
        assert.ok((await pill.boundingBox()).height >= 44, `${width}/${theme}: 누름 영역 44px 이상`);
        if (SOUND_CAPTURE) await h.page.screenshot({ path: join(SOUND_CAPTURE, `sound-${width}-${theme}-before.png`), animations: 'disabled' });
        const playingBefore = await stage.getAttribute('data-lt-playing');
        await pill.click();
        await h.page.waitForTimeout(150);
        assert.equal(await stage.getAttribute('data-lt-moments-muted'), 'false', `${width}/${theme}: 소리가 켜졌다`);
        assert.equal(await pill.isVisible(), false, `${width}/${theme}: 알약이 사라졌다`);
        assert.equal(await stage.getAttribute('data-lt-playing'), playingBefore, `${width}/${theme}: 멈춤·재생은 그대로`);
        const sent = await h.page.evaluate(() => (window.__ltSoundPosts || []).some((m) => m.includes('unMute')));
        assert.equal(sent, true, `${width}/${theme}: unMute 명령을 보냈다`);
        const remembered = await h.page.evaluate((key) => localStorage.getItem(key), SOUND_KEY);
        assert.equal(remembered, '1', `${width}/${theme}: 이 기기에 기억했다`);
        if (SOUND_CAPTURE) await h.page.screenshot({ path: join(SOUND_CAPTURE, `sound-${width}-${theme}-after.png`), animations: 'disabled' });
        const beforeId = await stage.getAttribute('data-lt-moments-id');
        await step(h.page, panel, width, 1);
        await h.page.waitForTimeout(250);
        assert.notEqual(await stage.getAttribute('data-lt-moments-id'), beforeId, `${width}/${theme}: 다음 순간`);
        assert.equal(await pill.isVisible(), false, `${width}/${theme}: 다음 순간에도 알약 없음`);
        assert.equal(await stage.getAttribute('data-lt-moments-muted'), 'false', `${width}/${theme}: 소리 유지`);
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1332 다시 방문하면 작은 알약으로 안내한다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) {
      const h = await boot(browser, {
        width, height, theme: 'night',
        init: () => { try { localStorage.setItem('lt41.momentSoundSeen', '1'); } catch {} }
      });
      try {
        const pill = h.page.locator('#community-moments-panel .moments-sound-pill');
        assert.equal(await pill.isVisible(), true, `${width}: 작은 알약도 보인다`);
        assert.equal((await pill.textContent()).trim(), '소리 켜기', `${width}: 짧은 문구`);
        assert.ok(await pill.evaluate((el) => el.classList.contains('is-small')), `${width}: 작은 모양`);
        assert.ok((await pill.boundingBox()).height >= 44, `${width}: 작은 알약도 누름 영역 44px 이상`);
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});


test('#1332 확인: 알약은 글자 묶음·밀기 안내와 겹치지 않고 가운데 아래에 있다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ['night', 'garden']) {
      const h = await boot(browser, {
        width: 390, height: 844, theme,
        init: () => { try { localStorage.removeItem('lt41.momentSwipeSeen'); } catch {} }
      });
      try {
        const box = await h.page.evaluate(() => {
          const panel = document.querySelector('#community-moments-panel');
          const rect = (sel) => panel.querySelector(sel)?.getBoundingClientRect().toJSON() || null;
          return {
            pill: rect('.moments-sound-pill'),
            overlay: rect('.moments-overlay'),
            hint: rect('.moments-swipe-hint'),
            media: rect('.moments-media'),
            hintHidden: panel.querySelector('.moments-swipe-hint')?.hidden
          };
        });
        assert.ok(box.pill && box.overlay && box.media, `${theme}: 요소가 있다`);
        assert.equal(box.hintHidden, false, `${theme}: 밀기 안내가 떠 있다`);
        const overlaps = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        assert.equal(overlaps(box.pill, box.overlay), false, `${theme}: 글자 묶음과 겹침 0`);
        assert.equal(overlaps(box.pill, box.hint), false, `${theme}: 밀기 안내와 겹침 0`);
        assert.ok(box.pill.top > box.media.top + box.media.height / 2, `${theme}: 영상 가운데 아래`);
        assert.ok(box.overlay.top - box.pill.bottom >= 11, `${theme}: 글자 묶음 윗변 12px 위`);
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1332 확인: 유튜브가 음소거로 되돌리면 알약이 다시 보인다', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    const h = await boot(browser, { width: 390, height: 844, theme: 'night' });
    try {
      const pill = h.page.locator('#community-moments-panel .moments-sound-pill');
      await pill.click();
      assert.equal(await pill.isVisible(), false, '누르면 사라진다');
      await h.page.evaluate(() => {
        const frame = document.querySelector('#community-moments-panel .moments-frame');
        window.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ event: 'infoDelivery', info: { muted: true } }),
          source: frame.contentWindow
        }));
      });
      assert.equal(await pill.isVisible(), true, '음소거로 돌아가면 다시 보인다');
      await h.page.evaluate(() => {
        const frame = document.querySelector('#community-moments-panel .moments-frame');
        window.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ event: 'infoDelivery', info: { muted: false } }),
          source: frame.contentWindow
        }));
      });
      assert.equal(await pill.isVisible(), false, '소리 켜짐을 알리면 다시 숨는다');
    } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
  } finally { await browser.close(); }
});


const rgbOf = (value) => {
  const hex = String(value || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
};

test('#1340 화면: 소리 아이콘은 음소거에 장미색, 누르면 흰색이고 줄은 화면 안', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [width, height] of [[390, 844], [1440, 900]]) for (const theme of ['night', 'garden']) {
      const h = await boot(browser, { width, height, theme });
      try {
        const state = await h.page.evaluate(() => {
          const panel = document.querySelector('#community-moments-panel');
          const sound = panel.querySelector('.moments-rail-button.is-sound');
          const buttons = [...panel.querySelectorAll('.moments-rail-button')];
          const overlay = panel.querySelector('.moments-overlay').getBoundingClientRect();
          const rose = getComputedStyle(document.documentElement).getPropertyValue('--lt-rose').trim();
          const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          return {
            label: sound.getAttribute('aria-label'),
            muted: sound.classList.contains('is-muted'),
            hasIcon: !!sound.querySelector('.moments-rail-svg path'),
            hasLabel: sound.querySelector('.moments-rail-label')?.textContent,
            color: getComputedStyle(sound).color,
            rose,
            heartColor: getComputedStyle(panel.querySelector('.moments-rail-button.is-heart')).color,
            allInView: buttons.every((el) => {
              const r = el.getBoundingClientRect();
              return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
            }),
            overlaps: buttons.filter((el) => hit(el.getBoundingClientRect(), overlay)).map((el) => el.getAttribute('aria-label')),
            pillShown: !panel.querySelector('.moments-sound-pill').hidden,
            momentId: panel.querySelector('.moments-stage').dataset.ltMomentsId,
            playing: panel.querySelector('.moments-stage').dataset.ltPlaying
          };
        });
        assert.equal(state.label, '소리 켜기', `${width}/${theme}: 음소거 접근 이름`);
        assert.equal(state.muted, true, `${width}/${theme}: 음소거 표시`);
        assert.ok(state.hasIcon && state.hasLabel, `${width}/${theme}: 아이콘과 글자`);
        assert.equal(state.color, rgbOf(state.rose), `${width}/${theme}: 장미색`);
        assert.equal(state.allInView, true, `${width}/${theme}: 오른쪽 줄 전체가 화면 안`);
        assert.deepEqual(state.overlaps, [], `${width}/${theme}: 글자 묶음과 겹침 0`);
        assert.equal(state.pillShown, true, `${width}/${theme}: 첫 영상 큰 알약`);
        await h.page.locator('#community-moments-panel .moments-rail-button.is-sound').click();
        const after = await h.page.evaluate(() => {
          const panel = document.querySelector('#community-moments-panel');
          const sound = panel.querySelector('.moments-rail-button.is-sound');
          return {
            label: sound.getAttribute('aria-label'),
            muted: sound.classList.contains('is-muted'),
            color: getComputedStyle(sound).color,
            heartColor: getComputedStyle(panel.querySelector('.moments-rail-button.is-heart')).color,
            pillHidden: panel.querySelector('.moments-sound-pill').hidden,
            momentId: panel.querySelector('.moments-stage').dataset.ltMomentsId,
            playing: panel.querySelector('.moments-stage').dataset.ltPlaying
          };
        });
        assert.equal(after.label, '소리 끄기', `${width}/${theme}: 켠 뒤 접근 이름`);
        assert.equal(after.muted, false, `${width}/${theme}: 켠 뒤 표시`);
        assert.equal(after.color, after.heartColor, `${width}/${theme}: 다른 단추와 같은 흰색`);
        assert.equal(after.pillHidden, true, `${width}/${theme}: 누르면 알약 사라짐`);
        assert.equal(after.momentId, state.momentId, `${width}/${theme}: 넘기기 없음`);
        assert.equal(after.playing, state.playing, `${width}/${theme}: 멈춤·재생 없음`);
      } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
    }
  } finally { await browser.close(); }
});

test('#1340 화면: 큰 알약은 첫 방문 첫 영상에서만', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const browser = await chromium.launch({ headless: true });
  try {
    const h = await boot(browser, { width: 390, height: 844, theme: 'night' });
    try {
      const panel = h.page.locator('#community-moments-panel');
      const pill = panel.locator('.moments-sound-pill');
      assert.equal(await pill.isVisible(), true, '첫 영상에서 보인다');
      await step(h.page, panel, 390, 1);
      await h.page.waitForTimeout(200);
      assert.equal(await pill.isVisible(), false, '다음 영상에서는 아이콘만');
      assert.equal(await panel.locator('.moments-rail-button.is-sound').isVisible(), true, '아이콘은 그대로');
    } finally { await h.ctx.close(); await new Promise((r) => h.server.close(r)); }
  } finally { await browser.close(); }
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
