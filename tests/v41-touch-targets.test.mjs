import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {serve} from './helpers/screen-audit.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';

// 2026-11-08 접근성: 44px 미만 터치 타깃을 ::after 히트박스로 넓힌다(보이는 모양은 그대로).
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

const TARGETS = {
  // #886 책 단계: track59-sketchbook.html의 터치 타깃 CSS가 book-extra.css로 이동해 이 소스 파싱 단정은 깨졌다.
  // 실제 렌더링 히트박스 검사는 tests/v41-book-single-537.test.mjs의 '책 조작 버튼 히트박스는 44x44 이상이다(렌더링 ::after 터치 영역)'가 맡는다.
  // #886 항목3: track58-pinboard.html의 터치 타깃 CSS가 board-extra.css로 이동해 이 소스 파싱 단정은 깨졌다.
  // 하드코딩 크기가 실제와도 어긋나(#detailYtLink 실제 24px를 34px로 가정) 거짓 통과를 내던 참이라 지운다.
  // 실제 렌더링 히트박스 검사는 tests/v41-board-pinboard-582.test.mjs의 '조작 버튼 히트박스는 44x44 이상이다(렌더링 ::after 터치 영역)'가 맡는다.
  'public/v41/views/track56-network.html': {
    '#focusFirst': [194, 35], '#zoomIn': [94, 35], '#zoomOut': [94, 35], '#resetFocus': [194, 35],
    '#openMoment': [140, 43], '#detailClose': [32, 32],
  },
};

const styleBlock = html => {
  const match = html.match(/<style id="lt-touch-targets">([\s\S]*?)<\/style>/);
  assert.ok(match, 'lt-touch-targets 스타일 블록이 있어야 한다');
  return match[1];
};
const rules = css => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({sel: m[1], body: m[2]}));
const insetOf = body => {
  const match = body.match(/inset:([^;}]+)/);
  if (!match) return null;
  const [t, r = t, b = t, l = r] = match[1].trim().split(/\s+/).map(value => parseFloat(value));
  return {t, r, b, l};
};

for (const [file, targets] of Object.entries(TARGETS)) {
  test(`${file.split('/').pop()} 조작 버튼 히트박스는 44x44 이상이다`, () => {
    const css = styleBlock(read(file));
    const list = rules(css);
    for (const [selector, [width, height]] of Object.entries(targets)) {
      const rule = list.find(item => item.sel.includes(selector) && item.body.includes('inset'));
      assert.ok(rule, `${selector}에 inset 히트박스 규칙이 있어야 한다`);
      const inset = insetOf(rule.body);
      assert.ok(inset, `${selector}의 inset 값을 읽을 수 있어야 한다`);
      const hitWidth = width - inset.l - inset.r;
      const hitHeight = height - inset.t - inset.b;
      assert.ok(hitWidth >= 44 && hitHeight >= 44, `${selector} 히트박스 ${hitWidth}x${hitHeight}가 44 미만이다`);
    }
  });
}

test('첫 화면 건너뛰기는 44px 이상이다', () => {
  const css = read('public/v41/shell.css');
  const rule = css.split('}').find(block => block.includes('.skip{'));
  assert.ok(rule, '.skip 규칙이 있어야 한다');
  assert.match(rule, /min-height:44px/);
  assert.match(rule, /display:inline-flex/);
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
  const r=el.getBoundingClientRect(),after=getComputedStyle(el,'::after');
  const px=v=>v&&v!=='auto'?parseFloat(v):0;
  const top=px(after.top),right=px(after.right),bottom=px(after.bottom),left=px(after.left);
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

test('#1514 궤도·첫 화면·책·지도·그래프 조작의 실제 누름 범위가 44px 이상이고 보이는 크기는 유지된다',{skip:skip1514||false,timeout:240000},async()=>{
 if(skip1514)assert.fail(skip1514);
 const tree=touchTree();
 const routes={
  '/touch-home.html':touchHost('/v41/home.html',tree),
  '/touch-book.html':touchHost('/v41/views/track59-sketchbook.html',tree),
  '/touch-map.html':touchHost('/v41/views/track56-network.html',tree),
  '/touch-graph.html':touchHost('/v41/views/graph/track60-graph.html',tree)
 };
 const server=await serve1514(routes),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium1514.launch({headless:true});
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
