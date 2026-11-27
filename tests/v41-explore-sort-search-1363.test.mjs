import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';

import {serve} from './helpers/screen-audit.mjs';
import {mkdir} from 'node:fs/promises';
const REQUIRE=process.env.LT_MOMENTS_1025_REQUIRE==='1';
let chromium,skipReason=null;
try{
 ({chromium}=await import('playwright'));
 if(!existsSync(chromium.executablePath()))skipReason='브라우저 실행 파일 없음';
}catch{skipReason='브라우저 모듈 없음';}
const card=(n,ai)=>({
 shareId:'share'+String(n).padStart(20,'0'),title:ai?'AI 기록 트리':'일반 공개 트리',
 subject:'가수',summary:'공개 기록',momentCount:3,createdAt:'2026-11-20T09:30:00.000Z',
 publicDisplayName:ai?'하늘':'비공개 일반 사용자',aiTester:ai,
 cover:{title:'첫 순간',type:'photo',url:''},stats:{hearts:3,favorites:1,hearted:false,favored:false,reactions:{heart:3},mine:[]}
});
test('#1363 정렬 직접 메뉴·검색 입력·#1361 안내 위치 — 390·1440 밤·정원', {skip:REQUIRE?false:(skipReason||undefined),timeout:180000},async()=>{
 if(skipReason)assert.fail(skipReason);
 const server=await serve({}, {port:Number(process.env.LT_TEST_PORT||process.env.LT1499_PORT||0)});const browser=await chromium.launch({headless:true});
 const base='http://127.0.0.1:'+server.address().port;
 const capture=process.env.LT1363_CAPTURE_DIR;
 if(capture)await mkdir(capture,{recursive:true});
 try {
  for(const [width,height] of [[390,844],[844,390],[1440,900]])for(const theme of ['night','garden']){
   const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   const queries=[];
   try{
    await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
    await ctx.route('**/api/community/shares?**',r=>{
      const url=new URL(r.request().url());queries.push({q:url.searchParams.get('q'),sort:url.searchParams.get('sort')});
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,items:[card(1,true),card(2,false)],totalVisible:2,groups:[{value:'가수',count:2}],groupsAll:[{value:'가수',count:2}],nextCursor:''})});
    });
    await ctx.route('**/api/community/shares/*/favorite',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,stats:{hearts:3,favorites:2,hearted:false,favored:true,reactions:{heart:3},mine:[]}})}));
    const page=await ctx.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/v41/#explore',{waitUntil:'domcontentloaded'});
    await page.locator('.community-card').first().waitFor();
    assert.deepEqual(errors,[],width+'/'+theme+' 화면 스크립트 오류 없음');
    const initial=await page.evaluate(()=>{
     const box=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
     return {row:box('.community-top-row'),input:box('#community-query'),sort:box('.community-sort-trigger'),card:box('.community-card'),
      overflow:document.documentElement.scrollWidth-innerWidth,policy:!!document.querySelector('.community-policy'),
      submit:!!document.querySelector('.community-search-submit'),old:!!document.querySelector('.community-search-trigger'),
      owner:[...document.querySelectorAll('.community-card-owner')].map(e=>e.textContent),label:document.querySelector('#community-query').getAttribute('aria-label')};
    });
    assert.equal(initial.overflow,0,width+'/'+theme+' 가로 넘침 0');
    assert.equal(initial.row.h,48,width+'/'+theme+' 윗줄 높이 48');
    assert.equal(initial.input.y,initial.sort.y,width+'/'+theme+' 검색·정렬 같은 줄');
    assert.ok(initial.input.h>=44&&initial.sort.w>=44&&initial.sort.h>=44,width+'/'+theme+' 클릭 영역 44 이상');
    assert.equal(initial.policy,false,width+'/'+theme+' 목록 아래 어려운 문장 없음');
    assert.equal(initial.submit,false,width+'/'+theme+' 찾기 제출 단추 없음');
    assert.equal(initial.old,false,width+'/'+theme+' 이전 찾기 열기 단추 없음');
    assert.equal(initial.label,'가수·노래·무대 찾기');
    assert.deepEqual(initial.owner,['AI 명예회원 하늘'],width+'/'+theme+' 명예회원만 이름');
    if(capture)await page.screenshot({path:capture+'/'+width+'-'+theme+'.png',animations:'disabled'});
    const btn=page.locator('.community-sort-trigger');
    assert.match(await btn.textContent(), /최신순/);
    await btn.click();
    if(capture)await page.screenshot({path:capture+'/'+width+'-'+theme+'-sort-open.png',animations:'disabled'});
    assert.equal(await btn.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.community-sort-option').count(),2);
    assert.ok((await page.locator('.community-sort-option').first().boundingBox()).height>=44,width+'/'+theme+' 메뉴 항목 44 이상');
    assert.equal(await page.locator('.community-sort-option.is-selected').count(),1);
    await btn.press('ArrowDown');await btn.press('Enter');
    assert.equal(await page.locator('#community-sort').inputValue(),'popular',width+'/'+theme+' 키보드로 인기순');
    assert.equal(await page.locator('.community-sort-option.is-selected').textContent(),'✓  많이 담긴 순');
    assert.match(await btn.textContent(), /많이 담긴 순/);
    assert.equal(await btn.getAttribute('aria-expanded'),'false');
    await btn.click();await btn.press('ArrowUp');await btn.press('Enter');
    assert.equal(await page.locator('#community-sort').inputValue(),'newest',width+'/'+theme+' 키보드로 최신순');
    await btn.click();await btn.press('Escape');
    assert.equal(await btn.getAttribute('aria-expanded'),'false',width+'/'+theme+' Esc 닫힘');
    await btn.click();await page.locator('#community-query').click();
    assert.equal(await btn.getAttribute('aria-expanded'),'false',width+'/'+theme+' 바깥 클릭 닫힘');
    const q=page.locator('#community-query');
    await q.fill('가');await page.waitForTimeout(430);
    assert.equal(await page.locator('#community-suggest').isVisible(),true,width+'/'+theme+' 자동 검색 뒤에도 그룹 추천 유지');
    const autoResponse=page.waitForResponse(r=>r.url().includes('/api/community/shares?')&&new URL(r.url()).searchParams.get('q')==='노래 검색');
    await q.fill('노래 검색');
    await autoResponse;
    assert.ok(queries.some(item=>item.q==='노래 검색'),width+'/'+theme+' 지연 후 자동 검색');
    const enterResponse=page.waitForResponse(r=>r.url().includes('/api/community/shares?')&&new URL(r.url()).searchParams.get('q')==='엔터 검색');
    await q.fill('엔터 검색');await q.press('Enter');
    await enterResponse;
    assert.ok(queries.some(item=>item.q==='엔터 검색'),width+'/'+theme+' 엔터 검색');
    assert.ok((await page.locator('.community-search-clear').boundingBox()).width>=44,width+'/'+theme+' 지우기 44 이상');
    await page.locator('.community-search-clear').click();
    assert.equal(await q.inputValue(),'',width+'/'+theme+' × 지우기');
    await page.locator('.community-card').first().click();
    await page.locator('#community-preview [data-community-action="favorite"]').click();
    await page.waitForFunction(()=>document.querySelector('#community-feedback')?.textContent==='즐겨찾기에 넣었어요. 주인이 공개를 끄면 목록에서 사라져요.');
    assert.equal(await page.locator('#community-feedback').textContent(),'즐겨찾기에 넣었어요. 주인이 공개를 끄면 목록에서 사라져요.');
    assert.equal(await page.locator('.community-preview-start-help').textContent(),'이 트리를 복사하지 않고 같은 주제로 내 트리를 새로 만들어요.');
    await page.locator('.community-preview-close').click();
    const rowHeight=await page.locator('.community-top-row').evaluate(e=>e.getBoundingClientRect().height);
    await page.locator('#community-tab-moments').click();
    assert.equal(await page.locator('.community-top-row').evaluate(e=>e.getBoundingClientRect().height),rowHeight,width+'/'+theme+' 순간 높이 변화 0');
    assert.equal(await page.locator('#community-search-form').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    assert.equal(await page.locator('.community-sort-label').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,width+'/'+theme+' 순간 넘침 0');
    console.log('검증',width,theme,JSON.stringify({cardY:initial.card.y,queries:queries.length}));
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});

// #1576: 새 화면 계측은 기존 미리보기 CI 화면 시험 레인에서 함께 실행한다.
import './helpers/explore-design-1576.mjs';
