import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream,existsSync,mkdirSync,statSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
let chromium, browserUnavailable=false;
try { ({chromium}=await import('playwright')); if(!existsSync(chromium.executablePath()))browserUnavailable='Playwright Chromium이 없어 건너뜀'; } catch { browserUnavailable='Playwright 패키지가 없어 건너뜀'; }

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const PORT=Number(process.env.LT1499_PORT||4614);
const SHOTS=process.env.LT_1441_SHOT_DIR||'';
const ONLY=process.env.LT_1441_CAPTURE_ONLY==='1';
const format={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const item=(id,video,date,parentId=null,more={})=>({id,videoId:video,shareId:'public-tree-1441',treeTitle:'바람',ownerName:'공개 사용자',title:id,date,parentId,keywords:[],url:'https://www.youtube.com/shorts/'+video,thumbnail:'https://i.ytimg.com/vi/'+video+'/hqdefault.jpg',...more});
const A=item('첫 순간','a1111111111','2026-11-03');
const B=item('다음 순간','b2222222222','2026-11-01','첫 순간');
const C=item('마지막 순간','c3333333333','2026-11-02','다음 순간');
const visible=[C,A,B];
const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
const embed='<html><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:radial-gradient(ellipse at 45% 38%,#775c89,#29283f 52%,#0e1221 90%)}body:after{content:"모의 영상";display:block;text-align:center;padding-top:45vh;color:#f1e7fc;font:16px sans-serif}</style><script>window.__commands=[];window.addEventListener("message",e=>{let d;try{d=typeof e.data==="string"?JSON.parse(e.data):e.data}catch{return}if(d?.event!=="command")return;window.__commands.push(d.func);if(d.func==="mute"||d.func==="unMute")parent.postMessage(JSON.stringify({event:"infoDelivery",info:{muted:d.func==="mute",playerState:1}}),"*")});</script></html>';

function serve(){
 const root=existsSync(join(ROOT,'dist','v41','home.html'))?join(ROOT,'dist'):join(ROOT,'public');
 const server=createServer((req,res)=>{
  const path=decodeURIComponent((req.url||'/').split('?')[0]);
  let file=resolve(root,'.'+path);
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  try{if(statSync(file).isDirectory())file=join(file,'index.html');if(!statSync(file).isFile())throw Error('not file');}
  catch{res.writeHead(404);res.end('missing');return;}
  res.writeHead(200,{'content-type':format[extname(file)]||'application/octet-stream'});
  createReadStream(file).pipe(res);
 });
 return new Promise((ok,fail)=>{server.once('error',fail);server.listen(PORT,'127.0.0.1',()=>ok(server));});
}
async function open(browser,width,theme){
 const context=await browser.newContext({viewport:{width,height:width===390?844:width===844?390:900},reducedMotion:'reduce',hasTouch:width===390,isMobile:width===390});
 await context.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t)}catch{}},theme);
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='www.youtube-nocookie.com')return route.fulfill({status:200,contentType:'text/html',body:embed});
  if(u.hostname==='i.ytimg.com')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#526177"/></svg>'});
  if(u.origin!=='http://127.0.0.1:'+PORT)return route.abort();
  if(u.pathname==='/api/public/moments'){
   const share=u.searchParams.get('shareId');
   const exclude=new Set((u.searchParams.get('exclude')||'').split(','));
   const data=(share&&share!=='public-tree-1441'?[]:visible).filter(x=>!exclude.has(x.videoId));
   return reply(route,{items:data,total:data.length,groups:[]});
  }
  if(u.pathname==='/api/community/shares')return reply(route,{items:[{shareId:'public-tree-1441',title:'바람',isPublic:true,momentCount:3},{shareId:'private-tree-1441',title:'비공개',isPublic:false,momentCount:3}]});
  if(u.pathname==='/api/public/shares/public-tree-1441')return reply(route,{tree:{title:'바람',moments:visible}});
  if(u.pathname==='/api/public/shares/private-tree-1441')return reply(route,{error:'not_found'},404);
  if(u.pathname.startsWith('/api/'))return reply(route,{items:[],ok:true});
  return route.continue();
 });
 return {context,page:await context.newPage()};
}
async function rect(locator){return locator.evaluate(el=>{const a=el.getBoundingClientRect();return {x:a.x,y:a.y,width:a.width,height:a.height};});}
function aligned(a,b,key){for(const k of ['x','y','width','height'])assert.ok(Math.abs(a[k]-b[k])<=1,key+' '+k+': '+a[k]+' vs '+b[k]);}
test('#1515 가로 순간 영상과 조작 줄·반응 막대가 겹치지 않는다', {skip:browserUnavailable,timeout:240000},async()=>{
 const server=await serve();const browser=await chromium.launch({headless:true});
 const failures=[];
 try{
  for(const width of [844,390,1440])for(const theme of ['night','garden']){
   const {context,page}=await open(browser,width,theme);
   try{
    await page.goto('http://127.0.0.1:'+PORT+'/v41/#explore/moments',{waitUntil:'load'});
    await page.locator('#community-panel[open]').waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>!!document.querySelector('.moments-stage')?.dataset.ltMomentsId,null,{timeout:15000});
    const data=await page.evaluate(()=>{
     const r=s=>{const a=document.querySelector(s).getBoundingClientRect();return {x:a.x,y:a.y,w:a.width,h:a.height,right:a.right,bottom:a.bottom}};
     const video=r('.moments-card'),media=r('.moments-media'),stage=r('.moments-stage'),rail=r('.moments-rail'),toolbar=r('.community-top-row');
     const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
     const clip=Math.max(0,video.bottom-innerHeight)+Math.max(0,-video.y);
     return {video,media,stage,rail,toolbar,clip,railOverlap:overlap(video,rail),toolbarOverlap:overlap(video,toolbar),height:innerHeight,width:innerWidth};
    });
    console.log('#1515',width,theme,JSON.stringify(data));
    if(SHOTS){mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:join(SHOTS,width+'-'+theme+'-moments.png'),animations:'disabled'});}
    if(width===844){
     if(data.clip!==0)failures.push(theme+' 잘림 '+data.clip+'px');
     if(data.railOverlap!==0)failures.push(theme+' 반응 막대 겹침 '+data.railOverlap);
     if(data.toolbarOverlap!==0)failures.push(theme+' 조작 줄 겹침 '+data.toolbarOverlap);
    }
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
 assert.deepEqual(failures,[]);
});

test('#1441 두 보기 자리·범위·길·주소·공개 제한·세로 줄·소리 유지', {skip:browserUnavailable,timeout:240000},async()=>{
 const server=await serve(); const browser=await chromium.launch({headless:true});
 try{
  for(const width of (ONLY?[390,844,1440,2560]:[1440,390]))for(const theme of ['night','garden']){
   const key=width+'/'+theme;const {context,page}=await open(browser,width,theme);
   try{
    await page.goto('http://127.0.0.1:'+PORT+'/v41/#explore',{waitUntil:'load'});
    await page.locator('#community-panel[open]').waitFor({state:'visible',timeout:20000});
    const treeRect=await rect(page.locator('.community-tabs'));
    if(SHOTS){mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:join(SHOTS,width+'-'+theme+'-trees.png'),animations:'disabled'});}
    await page.locator('#community-tab-moments').click();
    await page.waitForFunction(()=>!!document.querySelector('.moments-stage')?.dataset.ltMomentsId,null,{timeout:15000});
    if(SHOTS)await page.screenshot({path:join(SHOTS,width+'-'+theme+'-moments.png'),animations:'disabled'});
    if(ONLY)continue;
    const momentTabs=await rect(page.locator('.community-tabs'));
    if(width===390){
     assert.equal((await rect(page.locator('.community-top-row'))).y,0,key+' #1499 위 빈 띠 0');
     assert.equal((await rect(page.locator('.moments-stage'))).y,48,key+' #1499 영상 시작');
     aligned({...treeRect,y:momentTabs.y},momentTabs,key+' tabs');
    }else aligned(treeRect,momentTabs,key+' tabs');
    const trigger=page.locator('.moments-scope-trigger');
    assert.equal(await trigger.isVisible(),true,key+' 범위 메뉴');
    const scopeRect=await rect(trigger),closeRect=await rect(page.locator('.moments-toolbar .moments-close-button'));
    assert.ok(closeRect.x>=scopeRect.x+scopeRect.width,key+' 닫기 단추는 범위 오른쪽');
    assert.ok(Math.abs(closeRect.y-scopeRect.y)<=1,key+' 범위와 닫기 같은 줄');
    assert.equal(await page.locator('.moments-scope-chip:visible').count(),0,key+' 범위 칩 별도 줄 없음');
    const rail=page.locator('.moments-rail');
    const names=await rail.locator('button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
    assert.deepEqual(names.slice(0,6),['소리 켜기','마음','댓글','담기','트리','공유'],key+' 도구 순서');
    const arrows=rail.locator('.moments-step');assert.equal(await arrows.count(),2,key+' 위아래 단추');
    for(let i=0;i<2;i++)assert.equal(await arrows.nth(i).isVisible(),width===1440,key+' 휴대폰 이동 단추 숨김');
    await trigger.click();await page.locator('.moments-scope-chip[data-scope="tree"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.moments-tree-picker-option').length===1,null,{timeout:10000});
    assert.equal(await page.locator('.moments-tree-picker-option').count(),1,key+' 비공개 목록 제외');
    await page.locator('.moments-tree-picker-option').click();
    await page.waitForFunction(()=>document.querySelector('.moments-scope-summary')?.textContent?.includes('1/3'),null,{timeout:10000});
    assert.match(page.url(),/scope=tree&share=public-tree-1441/,key+' 트리 주소');
    assert.equal(await page.locator('.moments-title').textContent(),'첫 순간',key+' 첫 순간 길 순서');
    if(width===1440)await arrows.nth(1).click();else await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('.moments-title')?.textContent==='다음 순간');
    assert.match(await page.locator('.moments-scope-summary').textContent(),/2\/3/,key+' 위치 카운트');
    await page.reload({waitUntil:'load'});
    await page.locator('#community-panel[open]').waitFor({state:'visible',timeout:15000});
    await page.waitForFunction(()=>document.querySelector('.moments-title')?.textContent==='첫 순간',null,{timeout:15000});
    assert.match(page.url(),/scope=tree/,key+' 새로고침 주소');
    await page.locator('.moments-scope-reset').click();
    await page.waitForFunction(()=>location.hash==='#explore/moments',null,{timeout:10000});
    const owner=width===390?page.locator('.moments-card-tree'):page.locator('.moments-tree-name').first();
    await owner.click();await page.locator('.moments-owner-only').click();
    await page.waitForFunction(()=>location.hash.includes('scope=tree'),null,{timeout:10000});
    assert.match(page.url(),/share=public-tree-1441/,key+' 카드 진입');
    await rail.locator('.moments-rail-button.is-sound').click();
    assert.equal(await page.locator('.moments-stage').getAttribute('data-lt-moments-muted'),'false',key+' 소리 켜짐');
    if(width===1440)await arrows.nth(1).click();else await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('.moments-title')?.textContent==='다음 순간');
    assert.equal(await page.locator('.moments-stage').getAttribute('data-lt-moments-muted'),'false',key+' 소리 유지');
    const frame=await (await page.locator('.moments-frame:not(.moments-next)').elementHandle()).contentFrame();
    await page.waitForTimeout(300);
    const commands=await frame.evaluate(()=>window.__commands||[]);
    assert.ok(commands.includes('unMute'),key+' 유튜브 음소거 해제');
    assert.ok(commands.includes('setVolume'),key+' 유튜브 음량 반영');
    console.log('#1441',key,'PASSED',JSON.stringify({tabs:treeRect,rail:names}));
   }finally{await context.close();}
  }
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});

