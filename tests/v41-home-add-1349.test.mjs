import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRED = process.env.LT_HOME_ADD_1349_REQUIRE === '1';
let chromium, unavailable = '';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) unavailable = '화면 시험용 브라우저가 없습니다.';
} catch { unavailable = '화면 시험용 브라우저가 없습니다.'; }
if (!existsSync(new URL('../dist/v41/home.html', import.meta.url))) unavailable = '화면 빌드가 없습니다.';

const moment = i => ({
  subject: '시험 트리', title: '시험 순간 ' + i, date: '2026-11-' + String(i).padStart(2,'0'),
  emotion: '설렘', note: '화면 누름 검증', url: ''
});
function workspace() {
  let tree=createTree(moment(1),'2026-11-01T00:00:00.000Z');
  for (let i=2;i<=4;i++) tree=addMoment(tree,moment(i),tree.moments[0].id, '2026-11-' + String(i).padStart(2,'0') + 'T00:00:00.000Z');
  return { revision:1,state:{version:1,trees:[tree],prefs:{displayName:'화면 검증'}} ,
    subject:'test-1349',writeSubjectBound:true,savedAt:'2026-11-25T00:00:00.000Z'};
}
function checkInput(hit,expected) {
  assert.equal(hit,expected, '포인터로 직접 누른 결과가 위 순간 추가 경로와 일치합니다.');
}
test('#1349 가운데 순간 추가: 390·1440 × 밤·정원 × 로그인·방문자에서 마우스·터치 입력', {
  skip: !REQUIRED ? '화면 전용 검사로 따로 실행합니다.' : false,
  timeout: 300000
},async t=>{
  if (unavailable) return assert.fail(unavailable);
  const server=await serve({});
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try {
    for(const member of [false,true]) for(const width of [390,1440]) for(const theme of ['night','garden']) {
      for(const input of ['mouse','touch']) {
        const caseName=(member?'로그인':'방문자')+' '+width+' '+theme+' '+input;
        if(process.env.LT_HOME_1349_CASE && caseName!==process.env.LT_HOME_1349_CASE)continue;
        await t.test(caseName,async()=>{
          const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:input==='touch',isMobile:input==='touch',reducedMotion:'reduce'});
          try {
            await context.addInitScript(theme=>localStorage.setItem('lt41.theme',theme),theme);
            await context.route('**/*',async route=>{
              const u=new URL(route.request().url());
              if(u.pathname.includes('/auth/login')) return route.fulfill({status:200,contentType:'text/html',body:'<title>로그인</title><main>로그인 안내</main>'});
              if(u.origin!==base) return route.abort();
              if(u.pathname==='/api/workspace' && member) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace())});
              if(u.pathname.startsWith('/api/')) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'});
              return route.continue();
            });
            const page=await context.newPage();
            await page.goto(base+'/v41/'+(member?'?account=1':'')+'#home');
            if(member) {
              await page.waitForFunction(()=>!!window.LT41?.trees?.length);
            }
            // 누르기 전에 셸이 로그인 기록·쓰기 권한을 다 받고 무대 준비 가리개가 내려가기를 기다린다.
            // 이 신호가 없으면 단추가 보인 뒤 셸 상태가 바뀌며 프레임이 다시 그려질 수 있어 누름이 사라진다.
            if(member)await page.waitForFunction(()=>document.body.dataset.member==='in'&&window.LT41?.writable===true&&document.getElementById('stage-loading')?.hidden===true);
            const frame=page.frameLocator('#view');
            const button=member?frame.locator('.home-add-top'):frame.locator('.center .actions button').first();
            await button.waitFor({state:'visible',timeout:15000});
            const box=await button.boundingBox();
            assert.ok(box && box.width>=44 && box.height>=35,'가운데 버튼이 실제로 보입니다.');
            assert.equal(await button.evaluate(el=>{
              const rect=el.getBoundingClientRect(),root=el.getRootNode();
              return root.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===el;
            }),true,'단추 중심에 다른 궤도·카드 층이 걸리지 않습니다.');
            // 프레임 안 단추를 눌러 누름 순간에 대상을 다시 찾는다. 좌표만 기억해 두면 다시 그리기 뒤 낡은 자리를 누를 수 있다.
            if(input==='mouse')await button.click();
            else await button.tap();
            if(member){
              await page.waitForFunction(()=>document.getElementById('write-panel')?.open===true,null,{timeout:4500});
              checkInput(await page.locator('#write-panel').evaluate(e=>e.open),true);
            }else{
              await page.waitForURL(url=>url.pathname.includes('/auth/login'),{timeout:5000});
              assert.ok((await page.url()).includes('/auth/login'),'방문자는 로그인 안내 화면으로 이동합니다.');
            }
          }finally{await context.close();}
        });
      }
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});

async function serve1514(routes){
 const basePort=Number(process.env.LT_TEST_PORT||4580);
 for(let port=basePort;port<basePort+10;port++){
  try{return await serve(routes,{port})}catch(error){if(error?.code!=='EADDRINUSE')throw error}
 }
 throw new Error(`${basePort}~${basePort+9} 포트가 모두 사용 중이다`);
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

test('#1514 첫 화면 상세·트리·그래프가 날짜 설정 변경을 즉시 반영하고 저장 날짜는 바꾸지 않는다',{
 skip:!REQUIRED?'화면 전용 검사로 따로 실행합니다.':false,timeout:180000
},async()=>{
 if(unavailable)assert.fail(unavailable);
 const tree=dateFixture();
 const routes={
  '/date-home.html':dateHost('/v41/home.html',tree),
  '/date-tree.html':dateHost('/v41/views/track61-tree.html',tree),
  '/date-graph.html':dateHost('/v41/views/graph/track60-graph.html',tree)
 };
 const server=await serve1514(routes),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
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

function touchTree(){
 let tree=createTree({subject:'터치 시험',title:'터치 시험',note:'',emotion:'설렘',date:'2026-11-10',url:''},'2026-11-10T00:00:00Z');
 tree.moments[0].title='첫 순간';
 tree=addMoment(tree,{title:'둘째 순간',note:'',emotion:'위로',date:'2026-11-09',url:''},tree.moments[0].id,'2026-11-10T00:00:01Z');
 tree.moments[0].keywords=['노래:같은 곡'];
 tree.moments[1].keywords=['노래:같은 곡'];
 tree.edges=[{kind:'parent',from:tree.moments[0].id,to:tree.moments[1].id,reason:''}];
 return tree;
}

function touchHost(path,tree){
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>터치 시험</title></head><body data-member="in" data-tree-count="1"><script>window.LT41={source:'server',writable:true,owned:true,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script><iframe id="screen" src="${path}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
}

async function hitMeasurement(frame,selector,expectedHeight){
 return frame.locator(selector).evaluate((el,{selector,expectedHeight})=>{
  const r=el.getBoundingClientRect(),before=getComputedStyle(el,'::before'),after=getComputedStyle(el,'::after');
  const px=v=>v&&v!=='auto'?parseFloat(v):0;
  const top=Math.min(px(before.top),px(after.top)),right=Math.min(px(before.right),px(after.right)),bottom=Math.min(px(before.bottom),px(after.bottom)),left=Math.min(px(before.left),px(after.left));
  const hit={left:r.left+left,right:r.right-right,top:r.top+top,bottom:r.bottom-bottom};
  const own=(x,y)=>{const node=el.getRootNode().elementFromPoint(x,y);return node===el||el.contains(node)};
  const cx=(hit.left+hit.right)/2,cy=(hit.top+hit.bottom)/2;
  return {
   selector,visible:{width:r.width,height:r.height},hit:{width:hit.right-hit.left,height:hit.bottom-hit.top},
   topOwn:own(cx,hit.top+.5),bottomOwn:own(cx,hit.bottom-.5),leftOwn:own(hit.left+1.5,cy),rightOwn:own(hit.right-1.5,cy),
   expectedHeight
  };
 },{selector,expectedHeight});
}

function assertHit(m,label){
 assert.equal(m.missing,undefined,`${label}: 대상 없음`);
 if(m.expectedHeight!=null)assert.ok(Math.abs(m.visible.height-m.expectedHeight)<.6,`${label}: 보이는 높이 ${m.visible.height}가 ${m.expectedHeight}에서 바뀌었다`);
 assert.ok(m.hit.width>=44&&m.hit.height>=44,`${label}: 히트박스 ${m.hit.width}x${m.hit.height}`);
 assert.ok(m.topOwn&&m.bottomOwn&&m.leftOwn&&m.rightOwn,`${label}: 히트박스 가장자리가 다른 요소에 잡힌다 ${JSON.stringify(m)}`);
 console.log(JSON.stringify({label,...m}));
}

test('#1514 궤도·첫 화면·책·지도·그래프 조작의 실제 누름 범위가 44px 이상이고 보이는 크기는 유지된다',{
 skip:!REQUIRED?'화면 전용 검사로 따로 실행합니다.':false,timeout:240000
},async()=>{
 if(unavailable)assert.fail(unavailable);
 const tree=touchTree();
 const routes={
  '/touch-home.html':touchHost('/v41/home.html',tree),
  '/touch-book.html':touchHost('/v41/views/track59-sketchbook.html',tree),
  '/touch-map.html':touchHost('/v41/views/track56-network.html',tree),
  '/touch-graph.html':touchHost('/v41/views/graph/track60-graph.html',tree)
 };
 const server=await serve1514(routes),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1440])for(const theme of ['night','garden']){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce',hasTouch:true,isMobile:true});
   await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.removeItem('lt41.boardTheme')}catch{}},theme);
   const page=await ctx.newPage();
   await page.goto(base+'/touch-home.html',{waitUntil:'load'});
   let frame=page.frameLocator('#screen');
   await frame.locator('.center .actions [data-do="moments"]').click();
   await frame.locator('.indexFilter').first().waitFor();
   assertHit(await hitMeasurement(frame,'.indexFilter[data-tree-filter="all"]',45),`${width}/${theme} 궤도 목록 트리 칩`);
   await frame.locator('dialog.orbit-dialog .close[data-do="close"]').click();
   await frame.locator('.recent-open').evaluate(el=>el.click());
   await frame.locator('#mediaTreeChipHome').waitFor();
   assertHit(await hitMeasurement(frame,'#mediaTreeChipHome',44),`${width}/${theme} 첫 화면 트리 칩`);
   await ctx.close();

   const bookCtx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   await bookCtx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t)}catch{}},theme);
   const bookPage=await bookCtx.newPage();await bookPage.goto(base+'/touch-book.html',{waitUntil:'load'});
   const book=bookPage.frameLocator('#screen');
   await bookPage.waitForFunction(()=>!!document.getElementById('screen').contentWindow.__TRACK59__&&!!document.getElementById('screen').contentWindow.__BOOK_USABILITY__);
   await bookPage.evaluate(id=>document.getElementById('screen').contentWindow.__TRACK59__.showDetail(id),tree.moments[0].id);
   await book.locator('#detailSide:not([hidden])').waitFor();
   assertHit(await hitMeasurement(book,'#detailSide .close',44),`${width}/${theme} 책 상세 닫기`);
   await bookCtx.close();

   const mapCtx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   await mapCtx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.removeItem('lt41.boardTheme')}catch{}},theme);
   const mapPage=await mapCtx.newPage();await mapPage.goto(base+'/touch-map.html',{waitUntil:'load'});
   const map=mapPage.frameLocator('#screen');
   await mapPage.waitForFunction(()=>!!document.getElementById('screen').contentWindow.__lt?.dots?.()?.length);
   await mapPage.evaluate(()=>{const frame=document.getElementById('screen').contentWindow;frame.__lt.selectMoment(frame.__lt.nodes[0],true)});
   await map.locator('#detail.open').waitFor();
   // 열린 클래스만으로는 이동 중인 상세 창이 화면 밖에 남을 수 있다.
   // 실제 닫기 손잡이의 화면 안 배치·이동 완료를 기다린 다음 원래 네 점 단언을 한다.
   await mapPage.waitForFunction(() => {
     const win = document.getElementById('screen')?.contentWindow;
     const panel = win?.document.getElementById('detail'), button = win?.document.getElementById('detailClose');
     if (!panel?.classList.contains('open') || !button) return false;
     const box = panel.getBoundingClientRect(), hit = button.getBoundingClientRect();
     const style = win.getComputedStyle(panel);
     const transform = style.transform === 'none' ? null : new win.DOMMatrixReadOnly(style.transform);
     return box.left >= -1 && box.right <= win.innerWidth + 1 &&
       hit.left >= 0 && hit.right <= win.innerWidth && hit.top >= 0 && hit.bottom <= win.innerHeight &&
       (!transform || (Math.abs(transform.m41) < .5 && Math.abs(transform.m42) < .5)) &&
       panel.getAnimations().every(animation => animation.playState !== 'running');
   }, null, { timeout: 10000 });
   assertHit(await hitMeasurement(map,'#detailClose',width===390?44:32),`${width}/${theme} 지도 상세 닫기`);
   if(width===1440)assertHit(await hitMeasurement(map,'#viewNet',36),`${width}/${theme} 지도 필터`);
   await mapCtx.close();

   const graphCtx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   await graphCtx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t)}catch{}},theme);
   const graphPage=await graphCtx.newPage();await graphPage.goto(base+'/touch-graph.html',{waitUntil:'load'});
   const graph=graphPage.frameLocator('#screen');
   await graph.locator('#gBadge').waitFor({state:'attached'});
   await graph.locator('#gsvg g[data-hub-key]').first().waitFor({state:'attached'});
   assertHit(await hitMeasurement(graph,'button.g-legend-item',30),`${width}/${theme} 그래프 범례`);
   await graph.locator('#gsvg g[data-moment]').first().click();
   await graph.locator('#detailCard .d-nav').waitFor();
   assertHit(await hitMeasurement(graph,'.d-nav button:first-child',null),`${width}/${theme} 그래프 이동`);
   await graphCtx.close();
  }
 }finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});

function titleFixture(){
 let tree=createTree({subject:'제목 시험',title:'내 첫 제목',note:'',emotion:'설렘',date:'2026-11-10',url:'https://youtu.be/AbC123xyZ_0',mediaMetadata:{title:'영상 제목',channel:'채널'}},'2026-11-10T00:00:00Z');
 tree.moments[0].mediaMetadata={title:'영상 제목',channel:'채널',source:'youtu.be'};
 tree=addMoment(tree,{title:'내 둘째 제목',note:'',emotion:'위로',date:'2026-11-11',url:'https://youtu.be/AbC123xyZ_0',mediaMetadata:{title:'둘째 영상 제목'}},tree.moments[0].id,'2026-11-11T00:00:00Z');
 tree.moments[1].mediaMetadata={title:'둘째 영상 제목',channel:'채널',source:'youtu.be'};
 tree.edges=[{kind:'parent',from:tree.moments[0].id,to:tree.moments[1].id,reason:''}];
 return tree;
}
function titleHost(path,tree,id){
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>제목 시험</title></head><body data-member="in" data-tree-count="1"><script>window.LT41={source:'server',writable:true,owned:true,momentId:'${id}',prefs:{titleDisplay:'both',dateStyle:'dot'},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script><iframe id="screen" src="${path}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;
}

test('#1540 첫 화면 상세·지도·트리·그래프가 제목 표시 설정을 즉시 반영하고 저장 제목은 바꾸지 않는다',{
 skip:!REQUIRED?'화면 전용 검사로 따로 실행합니다.':false,timeout:300000
},async()=>{
 if(unavailable)assert.fail(unavailable);
 const tree=titleFixture(),id=tree.moments[0].id;
 const routes={
  '/title-home.html':titleHost('/v41/home.html',tree,id),
  '/title-map.html':titleHost(`/v41/views/track56-network.html?open=${encodeURIComponent(id)}`,tree,id),
  '/title-tree.html':titleHost('/v41/views/track61-tree.html',tree,id),
  '/title-graph.html':titleHost('/v41/views/graph/track60-graph.html',tree,id)
 };
 const server=await serve1514(routes),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{
  for(const [name,path,selector,mineTitle,videoTitle] of [
   ['home','/title-home.html','#mediaTitleHome','내 둘째 제목','둘째 영상 제목'],
   ['map','/title-map.html','#detailTitle','내 첫 제목','영상 제목'],
   ['tree','/title-tree.html','#treeDetailTitle','내 첫 제목','영상 제목'],
   ['graph','/title-graph.html','#detailCard h2','내 첫 제목','영상 제목']
  ]){
   const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
   await ctx.addInitScript(()=>{try{localStorage.setItem('lt41.theme','night')}catch{}});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.message||e)));
   await page.goto(base+path,{waitUntil:'load'});
   let frame=page.frameLocator('#screen');
   let live=await page.locator('#screen').elementHandle().then(h=>h.asElement().contentFrame());
   if(name==='home'){
    await live.waitForFunction(()=>!!document.getElementById('orbit')?.shadowRoot?.querySelector('.recent-open'),null,{timeout:15000});
    await frame.locator('.recent-open').evaluate(el=>el.click());
   }else if(name==='tree'){
    await frame.locator('.ts-card').first().click();
   }else if(name==='graph'){
    await frame.locator('#gsvg g[data-moment]').first().evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
   }else{
    await live.waitForFunction(()=>document.getElementById('detail')?.classList.contains('open'),null,{timeout:15000});
   }
   await frame.locator(selector).filter({hasText:mineTitle}).waitFor({timeout:15000});
   for(const [setting,expected] of [['video',videoTitle],['mine',mineTitle],['both',mineTitle]]){
    await page.evaluate(value=>{window.LT41.prefs={...window.LT41.prefs,titleDisplay:value}},setting);
    const child=await page.locator('#screen').elementHandle();
    const current=await child.asElement().contentFrame();
    await current.evaluate(value=>{try{localStorage.setItem('lt41.titleDisplay',value)}catch{}},setting);
    if(name==='home')await current.evaluate(value=>postMessage({type:'lt41-title-display',value},location.origin),setting);
    else await page.evaluate(value=>document.getElementById('screen').contentWindow.postMessage({type:'lt41-title-display',value},location.origin),setting);
    if(name==='home'){
     await current.waitForFunction(()=>!window.__titleMarker||window.__titleMarker!==location.href,null,{timeout:15000}).catch(()=>{});
     live=await child.asElement().contentFrame();
     await live.waitForFunction(()=>!!document.getElementById('orbit')?.shadowRoot?.querySelector('.recent-open'),null,{timeout:15000});
     await live.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     await live.locator('.recent-open').evaluate(el=>el.click());
     frame=page.frameLocator('#screen');
    }else live=current;
    await frame.locator(selector).filter({hasText:expected}).waitFor({timeout:15000});
   }
   assert.equal(await page.evaluate(()=>window.LT41.tree.moments[0].title),'내 첫 제목','저장된 제목은 그대로다');
   assert.deepEqual(errors,[],`${name}: 화면 오류 없음`);
   await ctx.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});


// #1600: 열린 표시 직후부터 실제 닫기 누름 위치가 맞아야 한다.
test('#1600 넓은 보드·지도 상세 닫기: 움직임 줄이기에서 첫 순간 네 가장자리가 단추 자신이다',{
 skip:!REQUIRED?'화면 전용 검사로 따로 실행합니다.':false,timeout:180000
},async()=>{
 if(unavailable)assert.fail(unavailable);
 const tree=touchTree();
 const routes={
  '/close-map.html':touchHost('/v41/views/track56-network.html',tree),
  '/close-board.html':touchHost('/v41/views/track58-pinboard.html',tree)
 };
 const server=await serve1514(routes),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [1440,2560])for(const theme of ['night','garden'])for(const screen of ['map','board']){
   const ctx=await browser.newContext({viewport:{width,height:width===1440?900:1440},reducedMotion:'reduce'});
   try{
    await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.removeItem('lt41.boardTheme')}catch{}},theme);
    await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==base)return r.abort();if(u.pathname.startsWith('/api/'))return r.fulfill({status:200,json:{ok:true,items:[]}});return r.continue()});
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/close-'+screen+'.html',{waitUntil:'load'});
    const frame=await (await page.locator('#screen').elementHandle()).contentFrame();
    if(screen==='map')await frame.waitForFunction(()=>!!window.__lt?.dots?.()?.length);
    else await frame.waitForFunction(()=>typeof selectMoment==='function'&&document.querySelectorAll('#cardLayer .card').length===2);
    const m=await frame.evaluate(({screen,id})=>{
     const detail=document.getElementById('detail'),el=document.getElementById('detailClose');
     // 닫힌 자리부터 계산하고 열기와 누름 판정을 같은 실행 안에서 한다.
     const closed=!detail.classList.contains('open');
     const beforeOpen=detail.getBoundingClientRect().left;
     if(screen==='map')window.__lt.selectMoment(window.__lt.nodes[0],true);
     else selectMoment(id,true);
     const r=el.getBoundingClientRect(),before=getComputedStyle(el,'::before'),after=getComputedStyle(el,'::after');
     const px=v=>v&&v!=='auto'?parseFloat(v):0;
     const hit={left:r.left+Math.min(px(before.left),px(after.left)),right:r.right-Math.min(px(before.right),px(after.right)),top:r.top+Math.min(px(before.top),px(after.top)),bottom:r.bottom-Math.min(px(before.bottom),px(after.bottom))};
     const cx=(hit.left+hit.right)/2,cy=(hit.top+hit.bottom)/2;
     const points=Object.fromEntries(Object.entries({top:[cx,hit.top+.5],bottom:[cx,hit.bottom-.5],left:[hit.left+1.5,cy],right:[hit.right-1.5,cy]}).map(([key,[x,y]])=>{
      const n=document.elementFromPoint(x,y);
      return [key,{x,y,own:n===el||el.contains(n),selector:n?(n.id?'#'+n.id:n.tagName.toLowerCase()+'.'+[...n.classList].join('.')):null}];
     }));
     return {closed,beforeOpen,open:detail.classList.contains('open'),transition:getComputedStyle(detail).transitionProperty,visible:{width:r.width,height:r.height},hit:{width:hit.right-hit.left,height:hit.bottom-hit.top},points};
    },{screen,id:tree.moments[0].id});
    const label=width+'/'+theme+'/'+screen;
    assert.ok(m.closed&&m.open,label+' 닫힌 자리에서 열기');
    assert.equal(m.transition,'none',label+' 움직임 줄이기에서 남는 전환 없음');
    assert.equal(m.visible.width,screen==='map'?32:44,label+' 보이는 너비');
    assertHit({selector:'#detailClose',visible:m.visible,hit:m.hit,expectedHeight:screen==='map'?32:44,topOwn:m.points.top.own,bottomOwn:m.points.bottom.own,leftOwn:m.points.left.own,rightOwn:m.points.right.own},label);
    assert.deepEqual(Object.values(m.points).map(p=>p.selector),Array(4).fill('#detailClose'),label+' 가장자리 선택자');
    const box=await page.locator('#screen').boundingBox();
    await page.mouse.click(box.x+m.points.left.x,box.y+m.points.left.y);
    await frame.locator('#detail:not(.open)').waitFor({state:'attached'});
    assert.deepEqual(errors,[],label+' 화면 오류 없음');
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
