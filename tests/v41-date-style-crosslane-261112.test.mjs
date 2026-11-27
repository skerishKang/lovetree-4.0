// 오늘 머지분 레인 사이 리뷰(이슈 #466 M1~M5): 날짜 표기(dateStyle)가 첫 화면·공용 썸네일
// 카드·로그인 미러 캐시에서 설정을 무시하던 결함. 문자열 고정이 아니라 실제 함수를 불러
// 결과 값으로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { formatDisplayDate } from '../public/v41/book-usability.mjs';
import { fallbackCardData } from '../public/v41/thumb-fallback.mjs';
import { ltDateStyle } from '../v41/home-moments.js';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('M1: formatDisplayDate는 이미 포맷된 문자열을 같은 스타일로 다시 받아도 값이 바뀌지 않는다(이중 포맷 안전)', () => {
  // dash로 이미 포맷된 문자열(home-moments.cardOf가 만드는 값)을 dateOf가 같은 스타일로 다시 포맷해도
  // dot으로 되돌아가면 안 된다 — #441 이전에는 style 인자가 빠져 항상 dot으로 되돌아갔다.
  const dash = formatDisplayDate('2026-11-10', 'dash');
  assert.equal(dash, '2026-11-10');
  assert.equal(formatDisplayDate(dash, 'dash'), '2026-11-10', '이미 dash인 문자열을 dash로 다시 포맷해도 그대로다');
  assert.notEqual(formatDisplayDate(dash, 'dash'), '2026. 11. 10', 'dot으로 되돌아가면 안 된다(M1 회귀)');

  const long = formatDisplayDate('2026-11-10', 'long');
  assert.equal(long, '11월 10일');
  assert.equal(formatDisplayDate(long, 'long'), '11월 10일', '이미 long인 문자열을 long으로 다시 포맷해도 그대로다');

  const dot = formatDisplayDate('2026-11-10', 'dot');
  assert.equal(dot, '2026. 11. 10');
  assert.equal(formatDisplayDate(dot, 'dot'), '2026. 11. 10', '이미 dot인 문자열을 dot으로 다시 포맷해도 그대로다');
});

test('M1: 원본(저장) 날짜 문자열에 style을 주면 설정대로 포맷된다(인자 없으면 항상 dot이던 결함)', () => {
  const raw = '2026-11-10T00:00:00Z';
  assert.equal(formatDisplayDate(raw, 'dash'), '2026-11-10');
  assert.equal(formatDisplayDate(raw, 'long'), '11월 10일');
  assert.equal(formatDisplayDate(raw, 'dot'), '2026. 11. 10');
  assert.notEqual(formatDisplayDate(raw), formatDisplayDate(raw, 'dash'), 'style 없이 부르면 dash와 달라야 한다(dot 기본값 확인)');
});

test('M4: 공용 썸네일 글 카드·최소 카드의 날짜도 dateStyle을 따른다', () => {
  const moment = { date: '2026-11-10', emotion: '설렘', url: 'https://example.com/post' };
  const dot = fallbackCardData(moment, {});
  const dash = fallbackCardData(moment, { dateStyle: 'dash' });
  const long = fallbackCardData(moment, { dateStyle: 'long' });
  assert.equal(dot.date, '2026. 11. 10', '기본(인자 없음)은 기존과 같은 dot');
  assert.equal(dash.date, '2026-11-10', 'dateStyle=dash를 주면 대시로 바뀐다(M4 수리 전에는 항상 dot)');
  assert.equal(long.date, '11월 10일', 'dateStyle=long도 반영된다');
});

test('M5: 로그인 기기 미러(ltDateStyle)는 문서 속성을 localStorage보다 먼저 보고, 둘 다 없으면 dot', () => {
  const savedDoc = globalThis.document, savedStorage = globalThis.localStorage;
  try {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    globalThis.document = { createElementNS: (ns, tag) => ({ tagName: String(tag), namespaceURI: String(ns), attrs: {}, children: [], setAttribute(n,v){this.attrs[n]=String(v)}, getAttribute(n){return this.attrs[n]??null}, append(...k){this.children.push(...k)}, querySelector(){return null}, querySelectorAll(){return []} }),  documentElement: { attrs: {}, getAttribute(name) { return this.attrs[name] ?? null; } } };

    assert.equal(ltDateStyle(), 'dot', '아무것도 없으면 기본 dot');

    globalThis.localStorage.setItem('lt41.dateStyle', 'dash');
    assert.equal(ltDateStyle(), 'dash', '문서 속성이 없으면 기기 미러(localStorage)를 따른다');

    globalThis.document.documentElement.attrs['data-lt-date-style'] = 'long';
    assert.equal(ltDateStyle(), 'long', '문서 속성이 있으면 미러보다 먼저 본다(셸이 심어 준 최신 값)');
  } finally {
    if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
    if (savedStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = savedStorage;
  }
});

test('M3: 기억책 "이어진 순간" 날짜도 상세 kicker와 같은 styledDate(dateStyle 적용)를 쓴다', () => {
  // book-extra.js는 LTDEMO 전역에 의존하는 classic script라 직접 실행하지 않고(이 파일의 다른 시험과
  // 같은 이유), 소스가 journey 항목에서도 화면 안 다른 날짜와 같은 한 벌을 쓰는지 확인한다.
  const bookExtra = read('public/v41/views/book/book-extra.js');
  assert.match(bookExtra, /const styledDate=v=>formatDisplayDate\(v,ltDateStyle\(\)\);/, 'styledDate 정의가 있다');
  assert.match(bookExtra, /journey-date">'\+t\(styledDate\(item\.date\)\)/, 'journey 항목 날짜가 styledDate를 쓴다(M3 수리 전에는 formatDisplayDate(item.date)로 style 누락)');
  assert.doesNotMatch(bookExtra, /journey-date">'\+t\(formatDisplayDate\(item\.date\)\)/, '더 이상 style 없는 포맷을 쓰지 않는다');
});

let chromium1514=null,skip1514='';
try{
 ({chromium:chromium1514}=await import('playwright'));
 if(!existsSync(chromium1514.executablePath()))skip1514='Playwright Chromium이 없다';
}catch{skip1514='playwright 패키지가 없다'}
if(!existsSync(new URL('../dist/v41/home.html',import.meta.url)))skip1514='빌드 결과가 없다';

async function serve1514(routes){
 for(let port=4580;port<=4589;port++){
  try{return await serve(routes,{port})}catch(error){if(error?.code!=='EADDRINUSE')throw error}
 }
 throw new Error('4580~4589 포트가 모두 사용 중이다');
}

function dateFixture(){
 let tree=createTree({subject:'날짜 시험',title:'날짜 시험',note:'',emotion:'설렘',date:'2026-11-10',url:''},'2026-11-10T00:00:00Z');
 tree.moments[0].title='첫 순간';
 tree=addMoment(tree,{title:'둘째 순간',note:'',emotion:'위로',date:'2026-11-09',url:''},tree.moments[0].id,'2026-11-10T00:00:01Z');
 tree.moments[1].keywords=['노래:같은 곡'];
 tree.moments[0].keywords=['노래:같은 곡'];
 tree.edges=[{kind:'parent',from:tree.moments[0].id,to:tree.moments[1].id,reason:''}];
 return tree;
}

function dateHost(path,tree){
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>날짜 시험</title></head><body data-member="in" data-tree-count="1"><script>window.LT41={source:'server',writable:true,owned:true,momentId:'m1',prefs:{dateStyle:'dot'},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script><iframe id="screen" src="${path}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
}

test('#1514 첫 화면 상세·트리·그래프가 날짜 설정 변경을 즉시 반영하고 저장 날짜는 바꾸지 않는다',{skip:skip1514||false,timeout:180000},async()=>{
 if(skip1514)assert.fail(skip1514);
 const tree=dateFixture();
 const routes={
  '/date-home.html':dateHost('/v41/home.html',tree),
  '/date-tree.html':dateHost('/v41/views/track61-tree.html',tree),
  '/date-graph.html':dateHost('/v41/views/graph/track60-graph.html',tree)
 };
 const server=await serve1514(routes),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium1514.launch({headless:true});
 try{
  for(const [name,path,selector,expected] of [
   ['home','/date-home.html','#mediaMetaHome','2026-11-09'],
   ['tree','/date-tree.html','#treeDetailNote','2026-11-10'],
   ['graph','/date-graph.html','#detailCard .d-date','2026-11-10']
  ]){
   const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
   await ctx.addInitScript(()=>{try{localStorage.setItem('lt41.theme','night')}catch{}});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
   await page.goto(base+path,{waitUntil:'load'});
   const frame=page.frameLocator('#screen');
   const initial=name==='home'?'2026. 11. 09':'2026. 11. 10';
   if(name==='home'){
    await frame.locator('#orbit').evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await frame.locator('.recent-open').evaluate(el=>el.click());
    await frame.locator(selector).filter({hasText:initial}).waitFor();
   }else if(name==='tree'){
    await frame.locator('.ts-card').first().click();
    await frame.locator(selector).filter({hasText:initial}).waitFor();
   }else{
    await frame.locator('#gsvg g[data-moment]').first().click();
    await frame.locator(selector).filter({hasText:initial}).waitFor();
   }
   let activeFrame=frame;
   if(name==='home'){
    const child=await page.locator('#screen').elementHandle();
    const childFrame=await child.asElement().contentFrame();
    await childFrame.evaluate(()=>{window.__dateMarker='before';localStorage.setItem('lt41.dateStyle','dash')});
    await childFrame.evaluate(()=>postMessage({type:'lt41-date-style',value:'dash'},location.origin));
    await childFrame.waitForFunction(()=>window.__dateMarker===undefined,null,{timeout:15000});
    const reloadedFrame=await child.asElement().contentFrame();
    await reloadedFrame.waitForFunction(()=>!!window.LTHomeHistory&&!!document.getElementById('orbit')?.shadowRoot?.querySelector('.recent-open'),null,{timeout:15000});
    await reloadedFrame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await reloadedFrame.locator('.recent-open').evaluate(el=>el.click());
    activeFrame=reloadedFrame;
   }else{
    await page.evaluate(()=>document.getElementById('screen').contentWindow.postMessage({type:'lt41-date-style',value:'dash'},location.origin));
   }
   await activeFrame.locator(selector).filter({hasText:expected}).waitFor({timeout:10000});
   const expectedLong=name==='home'?'11월 9일':'11월 10일';
   if(name==='home'){
    const child=await page.locator('#screen').elementHandle();
    const current=await child.asElement().contentFrame();
    await current.evaluate(()=>{window.__dateMarker='before-long';localStorage.setItem('lt41.dateStyle','long')});
    await current.evaluate(()=>postMessage({type:'lt41-date-style',value:'long'},location.origin));
    await current.waitForFunction(()=>window.__dateMarker===undefined,null,{timeout:15000});
    const reloadedFrame=await child.asElement().contentFrame();
    await reloadedFrame.waitForFunction(()=>!!window.LTHomeHistory&&!!document.getElementById('orbit')?.shadowRoot?.querySelector('.recent-open'),null,{timeout:15000});
    await reloadedFrame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await reloadedFrame.locator('.recent-open').evaluate(el=>el.click());
    activeFrame=reloadedFrame;
   }else{
    await page.evaluate(()=>document.getElementById('screen').contentWindow.postMessage({type:'lt41-date-style',value:'long'},location.origin));
   }
   await activeFrame.locator(selector).filter({hasText:expectedLong}).waitFor({timeout:10000});
   assert.equal(await page.evaluate(()=>window.LT41.tree.moments[0].date),'2026-11-10','저장된 날짜는 그대로다');
   assert.deepEqual(errors,[],`${name}: 화면 오류 없음`);
   await ctx.close();
  }
 }finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});
