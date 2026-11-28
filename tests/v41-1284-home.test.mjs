import { listenOnSafePort } from './helpers/safe-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createTree} from '../public/v41/domain.mjs';

const ROOT=path.resolve(process.env.LT_1284_DIST||fileURLToPath(new URL('../dist/',import.meta.url)));
const BASELINE=process.env.LT_1284_BASELINE==='1';
const REQUIRE_TOUCH=process.env.LT_1346_REQUIRE==='1'||process.env.LT_1284_REQUIRE==='1';
const OUT=process.env.LT_1284_CAPTURE_DIR||process.env.LT_1346_CAPTURE_DIR||'';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const BLANK=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const scenarios=[
 {type:'landscape',video:'jNQXAC9IVRw',vertical:false},
 {type:'vertical',video:'dQw4w9WgXcQ',vertical:true},
 {type:'blocked',video:'kFenGaDfuI4',vertical:true,blocked:true}
];
async function serve(){
 const server=createServer(async(req,res)=>{
  const clean=decodeURIComponent((req.url||'/').split('?')[0]);
  const file=path.resolve(ROOT,'.'+(clean.endsWith('/')?clean+'index.html':clean));
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
  try{if(!(await stat(file)).isFile())throw Error('missing');
   res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream'});
   createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end('missing');}
 });
 await listenOnSafePort(server, '127.0.0.1', {port:Number(process.env.LT_TEST_PORT)||0});
 return server;
}
async function open({width,height=width===390?844:900,theme,scene,member=true,fullCounts=false,updates=null}){
 const tree=createTree({subject:'시험 트리',title:'youtube.com에서 간직한 순간',note:'시험용 순간',emotion:'설렘',date:'2026-11-24',url:(scene.vertical?'https://www.youtube.com/shorts/':'https://www.youtube.com/watch?v=')+scene.video,mediaMetadata:{vertical:scene.vertical}},'2026-11-24T11:00:00.000Z');
 const inbox=fullCounts?{...createTree({subject:'모아둔 순간',title:'정리할 순간',note:'시험 자료',emotion:'설렘',date:'2026-11-22',url:''},'2026-11-22T11:00:00.000Z'),inbox:true}:null;
 const data=JSON.stringify({revision:1,state:{version:1,trees:inbox?[tree,inbox]:[tree],prefs:{}},subject:'시험 계정',writeSubjectBound:true,savedAt:'2026-11-24T11:00:00.000Z'});
 const context=await chromium.launch({headless:true,args:['--disable-gpu']});
 const page=await context.newPage({viewport:{width,height},reducedMotion:'reduce'});
 if(fullCounts)await page.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'?route.continue():route.abort();});
 await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
 await page.route('**/api/workspace**',route=>route.fulfill({status:fullCounts&&!member?401:200,contentType:'application/json',body:fullCounts&&!member?'{"ok":false,"error":{"code":"not_logged_in"}}':data}));
 if(fullCounts){
  await page.route('**/api/account',route=>route.fulfill({status:member?200:401,contentType:'application/json',body:member?'{"ok":true,"subject":"시험 계정","email":"test@example.test"}':'{"ok":false,"error":{"code":"not_logged_in"}}'}));
  await page.route('**/api/community/stats',route=>route.fulfill({status:200,contentType:'application/json',body:'{"trees":123,"moments":456}'}));
  await page.route('**/api/shares',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({shares:[{status:'active',treeId:tree.id}]})}));
  await page.route('**/v41/updates.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(updates?[{version:'99.0.0',date:'2026-11-28',items:[{kind:'fix',text:'화면 시험용 새 소식'}]}]:[])}));
 }
 await page.route('**/api/youtube/oembed**',route=>route.fulfill({status:scene.blocked?401:200,contentType:'application/json',body:scene.blocked?'{"error":"youtube_embed_forbidden"}':JSON.stringify({title:'실제 원본 영상 제목 '+scene.type,authorName:'시험 채널',thumbnailUrl:'https://i.ytimg.com/vi/'+scene.video+'/hqdefault.jpg'})}));
 await page.route('**/i.ytimg.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:BLANK}));
 await page.route('**/youtube-nocookie.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>YouTube video</title>'}));
 await page.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.video-consent','1');},theme);
 const url='http://127.0.0.1:'+globalThis._lt1284port+'/v41/'+(member?'?account=1':'');
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  if(member)await page.waitForFunction(()=>{const f=document.querySelector('#view');return !!f?.contentDocument?.querySelector('#orbit')?.shadowRoot?.querySelector('.recent-card');},null,{timeout:12000});
  else await page.frameLocator('#view').locator('.center .actions').waitFor({state:'visible',timeout:12000});
  const frame=page.frameLocator('#view');
  if(await page.locator('#tree-tips').count())await page.locator('#tree-tips').evaluate(el=>el.remove());
  await page.evaluate(()=>{document.body.scrollTop=0;scrollTo(0,0)});
  if(fullCounts){
   await page.waitForFunction(({member,updates})=>{
    const f=document.querySelector('#view'),root=f?.contentDocument?.querySelector('#orbit')?.shadowRoot;
    return !!root?.querySelector(member?'.center .actions[data-inline]':'.center .actions') &&
     (member?window.LT41?.source==='server' && !!root.querySelector('.recent-card') && root.querySelectorAll('.home-count:not([hidden]) .home-count-line:not(:empty)').length>=6:document.body.dataset.member==='out' && root.querySelectorAll('.home-count:not([hidden]) .home-count-line:not(:empty)').length>=2) &&
     (updates?!document.getElementById('updates-card')?.hidden:document.getElementById('updates-card')?.hidden);
   },{member,updates},{timeout:15000});
   await page.evaluate(async()=>{const d=document.querySelector('#view').contentDocument;await document.fonts.ready;await d.fonts.ready;});
  }
  return {context,page,frame};
 }catch(error){await context.close();throw error;}
}
function bounds(a,b){return Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))*Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));}
async function snap(page,file){
 const original=page.viewportSize();
 const needed=await page.evaluate(()=>document.body.scrollHeight);
 try{
  if(needed>original.height)await page.setViewportSize({width:original.width,height:needed});
  await page.evaluate(()=>{document.body.scrollTop=0;scrollTo(0,0)});
  await page.screenshot({path:path.join(OUT,file)});
 }finally{if(page.viewportSize().height!==original.height)await page.setViewportSize(original);}
}
async function measure(page,frame,scene){
 return {outer:await page.evaluate(()=>({width:document.documentElement.clientWidth,fab:(()=>{const el=document.querySelector('#mobile-add');if(!el||getComputedStyle(el).display==='none')return null;const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};})(),scroll:document.documentElement.scrollWidth,bodyScroll:document.body.scrollTop,bodyHeight:document.body.scrollHeight,viewportHeight:innerHeight,frameTop:document.getElementById('view')?.getBoundingClientRect().top||0,links:(()=>{const el=document.querySelector('.home-links');if(!el)return null;const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};})()})),inside:await frame.locator('#orbit').evaluate(el=>{const root=el.shadowRoot,c=root.querySelector('.recent-card'),m=root.querySelector('.recent-media'),a=root.querySelector('.center .actions'),n=root.querySelector('.center-note');const rc=c?.getBoundingClientRect(),rm=m?.getBoundingClientRect(),ra=a?.getBoundingClientRect(),rn=n?.getBoundingClientRect();return {notes:rn&&{top:rn.top,bottom:rn.bottom,left:rn.left,right:rn.right},card:rc&&{top:rc.top,bottom:rc.bottom,left:rc.left,right:rc.right,width:rc.width,height:rc.height},media:rm&&{width:rm.width,height:rm.height,className:m.className,computed:getComputedStyle(m).aspectRatio,blur:getComputedStyle(m,'::before').backgroundImage,thumbWidth:m.querySelector('.recent-thumb')?.getBoundingClientRect().width},actions:ra&&{top:ra.top,bottom:ra.bottom,left:ra.left,right:ra.right},playing:!!root.querySelector('.recent-frame'),viewer:root.querySelector('#mediaViewerHome')?.classList.contains('open')};})};
}
test('#1284 home layout and playback (1440/390, two themes, three media types)',{timeout:240000,skip:process.env.LT_1284_REQUIRE!=='1'?'브라우저 화면 전용 시험은 별도 화면 검사에서 실행':false},async()=>{
 const server=await serve();globalThis._lt1284port=server.address().port;
 if(OUT)await mkdir(OUT,{recursive:true});
 try{
  for(const width of (process.env.LT_1284_ONLY_MOBILE?[390]:[1440,390]))for(const theme of ['night','garden'])for(const scene of scenarios.filter(s=>!process.env.LT_1284_SCENE||s.type===process.env.LT_1284_SCENE)){
   const {context,page,frame}=await open({width,theme,scene});
   try{
    await frame.locator('.recent-card').waitFor({timeout:15000});
    const before=await measure(page,frame,scene);
    const number=before.inside.notes||before.inside.actions;
    const overlap=bounds(before.outer.links,{...number,top:number.top+before.outer.frameTop,bottom:number.bottom+before.outer.frameTop,left:number.left,right:number.right});
    if(BASELINE){if(OUT)await snap(page,scene.type+'-'+theme+'-'+width+'-card.png');await frame.locator('.recent-meta strong').click();await frame.locator('#mediaViewerHome.open').waitFor({timeout:5000});if(OUT)await snap(page,scene.type+'-'+theme+'-'+width+'-detail.png');console.log('BEFORE',JSON.stringify({width,theme,scene:scene.type,overlap,scroll:before.outer.scroll,card:before.inside.card,media:before.inside.media}));continue;}
    if(width===390){assert.equal(overlap,0,'숫자판과 링크 겹침 0');if(before.outer.fab)assert.equal(bounds(before.outer.links,before.outer.fab),0,'휴대폰 + 단추와 링크 겹침 0');const linkReadability=await page.locator('.home-links .feedback-link:visible').evaluateAll(els=>els.map(el=>({font:parseFloat(getComputedStyle(el).fontSize),width:el.clientWidth,content:el.scrollWidth})));for(const label of linkReadability){assert.ok(label.font>=13,'하단 링크 13px 이상');assert.ok(label.content<=label.width+1,'하단 링크 글자 잘림 0');}}
    assert.ok(before.outer.scroll<=before.outer.width+1,'가로 넘침 0');
    if(width===390&&scene.vertical)assert.ok(Math.abs(before.inside.card.width/before.inside.card.height-.8)<.12,'세로 영상 카드 비율 약 4:5');
    if(scene.vertical){assert.ok(before.inside.media.blur!=='none','세로 영상 양옆 흐린 배경 유지');assert.ok(before.inside.media.thumbWidth<before.inside.media.width*.65,'세로 영상은 원본 비율을 유지하고 양옆에 흐린 배경을 보인다');}
    if(OUT)await snap(page,scene.type+'-'+theme+'-'+width+'-card.png');
    await frame.locator('.recent-meta strong').click();
    await frame.locator('#mediaViewerHome.open').waitFor({timeout:5000});
    const detail=await frame.locator('#mediaViewerHome').evaluate(el=>({title:el.querySelector('#mediaTitleHome')?.textContent,kind:el.querySelector('#mediaKickerHome')?.textContent,frame:!!el.querySelector('iframe'),external:el.querySelector('#mediaExternalHome')?.textContent}));
    assert.ok(!detail.kind.includes('VIDEO'),'한국어 영상 종류');
    assert.equal(detail.frame,false,'설명 창 즉시 외부 재생 금지');
    if(OUT)await snap(page,scene.type+'-'+theme+'-'+width+'-detail.png');
    // #1495: 예전에는 소개 창 닫기 줄(최대 3초)이 막힌 영상 정보 응답을 기다려 줬다 — 그 대기를 안내 글자 조건으로 바꿔 둔다(단정은 그대로).
    if(scene.blocked)await page.waitForFunction(()=>document.querySelector('#view')?.contentDocument?.querySelector('#orbit')?.shadowRoot?.querySelector('#mediaExternalHome')?.textContent==='YouTube에서 보기 ↗',null,{timeout:5000}).catch(()=>{});
    if(scene.blocked)await frame.locator('#mediaExternalHome').evaluate(el=>{if(el.textContent!=='YouTube에서 보기 ↗')throw Error('blocked 안내 누락');});
    if(!scene.blocked&&width===390&&theme==='night'){await frame.locator('#mediaPlayHome').click();await frame.locator('#mediaViewerHome iframe').waitFor();const code=scene.type==='landscape'?101:150;await frame.locator('#orbit').evaluate((el,code)=>{dispatchEvent(new MessageEvent('message',{origin:'https://www.youtube-nocookie.com',data:JSON.stringify({event:'onError',info:code})}));},code);await frame.locator('#mediaExternalHome').evaluate(el=>{if(el.textContent!=='YouTube에서 보기 ↗')throw Error('오류 신호 안내 누락');});assert.equal(await frame.locator('#mediaViewerHome iframe').count(),0,'101/150 오류 즉시 임베드 제거');}
    await frame.locator('#mediaCloseHome').click();
    await frame.locator('[data-recent-play]').click({timeout:5000});
    const play=await measure(page,frame,scene);
    assert.equal(play.inside.viewer,false,'재생 누를 때 설명 창 열리지 않음');
    if(!scene.blocked)assert.equal(play.inside.playing,true,'재생 누르면 카드에서 바로 재생');
    if(width===390){assert.equal(await frame.locator('.recent-card.is-playing-mobile').count(),1,'휴대폰 재생 확대');if(OUT)await snap(page,scene.type+'-'+theme+'-'+width+'-playing.png');await page.keyboard.press('Escape');assert.equal(await frame.locator('.recent-frame').count(),0,'Esc로 재생 종료');assert.equal(await frame.locator('[data-recent-play]').evaluate(el=>el.getRootNode().activeElement===el),true,'재생 종료 후 초점 복원');await frame.locator('[data-recent-play]').click();await frame.locator('#orbit').evaluate(()=>history.back());await frame.locator('.recent-frame').waitFor({state:'detached',timeout:4000});}
    console.log(JSON.stringify({width,theme,scene:scene.type,overlap,scroll:before.outer.scroll,bodyScroll:before.outer.bodyScroll,bodyHeight:before.outer.bodyHeight,frameTop:before.outer.frameTop,media:before.inside.media,detail,playing:play.inside.playing}));
   }finally{await context.close();}
  }
 }finally{await new Promise(ok=>server.close(ok));}
});

async function touchState(page){
 return page.evaluate(()=>{
  const frame=document.getElementById('view'),doc=frame.contentDocument,scroller=doc.scrollingElement;
  const actions=doc.querySelector('#orbit').shadowRoot.querySelector('.center .actions').getBoundingClientRect();
  return {shellScroll:document.scrollingElement.scrollTop,shellBodyScroll:document.body.scrollTop,shellHeight:document.body.scrollHeight,viewport:innerHeight,frameHeight:frame.clientHeight,insideScroll:scroller.scrollTop,insideHeight:scroller.scrollHeight,insideClient:scroller.clientHeight,actions:{top:actions.top,bottom:actions.bottom}};
 });
}
async function swipe(page,from,to){
 const cdp=await page.context().newCDPSession(page);
 const point=p=>({x:p.x,y:p.y,id:1,radiusX:4,radiusY:4,force:1});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(from)]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point({x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8})]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await cdp.detach();
 await page.waitForTimeout(250);
}
async function swipeUp(page){
 const box=await page.locator('#view').boundingBox();
 await swipe(page,{x:box.x+box.width/2,y:box.y+box.height-32},{x:box.x+box.width/2,y:box.y+32});
}

test('#1346 첫 화면은 손가락으로 안쪽 문서를 끝까지 스크롤한다',{timeout:300000,skip:!REQUIRE_TOUCH?'터치 화면 전용 시험은 별도 화면 검사에서 실행':false},async()=>{
 const server=await serve();globalThis._lt1284port=server.address().port;
 if(OUT)await mkdir(OUT,{recursive:true});
 const results=[];
 let drag=null,ribbonDrag=null;
 try{
  for(const member of [true,false])for(const [width,height] of [[390,844],[390,700],[844,390]])for(const scene of (member?scenarios.filter(s=>s.type!=='blocked'):[scenarios[0]])){
   const {context,page,frame}=await open({width,height,theme:'night',scene,member});
   try{
    await page.frameLocator('#view').locator('.center .actions').waitFor({state:'visible',timeout:15000});
    const before=await touchState(page);
    const capture=OUT&&member&&((width===390&&height===844&&scene.type==='vertical')||(width===844&&height===390&&scene.type==='landscape'));
    const stem=`touch-${member?'member':'visitor'}-${scene.type}-${width}x${height}`;
    if(capture)await page.screenshot({path:path.join(OUT,stem+'-before.png')});
    await swipeUp(page);
    let after=await touchState(page);
    for(let i=0;i<4&&after.actions.bottom>after.insideClient+1;i++){await swipeUp(page);after=await touchState(page);}
    if(capture)await page.screenshot({path:path.join(OUT,stem+'-after.png')});
    // #1314 이후 844×390은 궤도, 390 세로는 리본이다. 궤도 위상 확인은 가로 궤도에서만 하고, 리본에서는 가로로 끌어도 세로 스크롤이 없는지만 본다.
    if(member&&width===844&&height===390&&scene.type==='landscape'){
     await frame.locator('#orbit').evaluate(()=>globalThis.__LT_ORBIT_TEST__.hold(true));
     const start=await frame.locator('#orbit').evaluate(()=>globalThis.__LT_ORBIT_TEST__.progress(performance.now())),box=await page.locator('#view').boundingBox();
     await swipe(page,{x:box.x+36,y:box.y+box.height-12},{x:box.x+box.width-36,y:box.y+box.height-12});
     const end=await frame.locator('#orbit').evaluate(()=>globalThis.__LT_ORBIT_TEST__.progress(performance.now()));
     drag={start,end,scrollBefore:after.insideScroll,scroll:await frame.locator('#orbit').evaluate(()=>document.scrollingElement.scrollTop)};
    }
    if(member&&width===390&&height===844&&scene.type==='vertical'){
     const box=await page.locator('#view').boundingBox();
     await swipe(page,{x:box.x+36,y:box.y+box.height-12},{x:box.x+box.width-36,y:box.y+box.height-12});
     ribbonDrag={scrollBefore:after.insideScroll,scroll:await frame.locator('#orbit').evaluate(()=>document.scrollingElement.scrollTop)};
    }
    results.push({member,width,height,scene:scene.type,before,after});
   }finally{await context.close();}
  }
  console.log('#1346 TOUCH',JSON.stringify({drag,ribbonDrag,rows:results.map(r=>({member:r.member,scene:r.scene,size:`${r.width}x${r.height}`,shell:[r.before.shellHeight,r.after.shellHeight],inside:[r.before.insideClient,r.before.insideHeight,r.before.insideScroll,r.after.insideScroll],actions:[r.before.actions.bottom,r.after.actions.bottom]}))}));
  assert.ok(drag&&Math.abs(drag.end-drag.start)>.001,'가로 터치 끌기는 궤도 위상을 계속 바꾼다');
  assert.equal(drag.scroll,drag.scrollBefore,'가로 끄기는 세로 스크롤을 만들지 않는다');
  assert.ok(ribbonDrag,'390 세로 리본에서 가로 끌기를 실행했다');
  assert.equal(ribbonDrag.scroll,ribbonDrag.scrollBefore,'390 세로 리본은 가로로 끌어도 세로 스크롤이 생기지 않는다');
  for(const row of results){
   const label=`${row.member?'회원':'방문자'} ${row.scene} ${row.width}x${row.height}`;
   assert.ok(row.after.shellHeight<=row.after.viewport+1,`${label}: 셸 body를 늘리지 않는다 (${row.after.shellHeight}/${row.after.viewport})`);
   assert.equal(row.after.shellScroll,0,`${label}: 셸은 스크롤하지 않는다`);
   assert.equal(row.after.shellBodyScroll,0,`${label}: 셸 body 스크롤도 0이다`);
   const needed=row.before.actions.bottom>row.before.insideClient+1||row.before.insideHeight>row.before.insideClient+1;
   if(needed){
    assert.ok(row.after.insideScroll>row.before.insideScroll,`${label}: 실제 터치로 안쪽 스크롤이 움직인다 (${row.before.insideScroll}→${row.after.insideScroll})`);
    assert.ok(row.after.insideScroll>=row.after.insideHeight-row.after.insideClient-1,`${label}: 손가락으로 문서 끝까지 간다 (${row.after.insideScroll}/${row.after.insideHeight-row.after.insideClient})`);
    assert.ok(row.after.actions.top>=-1&&row.after.actions.bottom<=row.after.insideClient+1,`${label}: 카드 아래 단추가 화면 안에 들어온다 (${row.after.actions.top}~${row.after.actions.bottom}/${row.after.insideClient})`);
   }else{
    assert.equal(row.after.insideScroll,row.before.insideScroll,`${label}: 내용이 화면 안이면 불필요한 스크롤이 없다`);
    assert.ok(row.after.actions.top>=-1&&row.after.actions.bottom<=row.after.insideClient+1,`${label}: 단추가 처음부터 화면 안에 있다`);
   }
  }
 }finally{await new Promise(ok=>server.close(ok));}
});

// #1601: 회원의 실제 두 줄 숫자판과 새 소식 유무를 포함해 마지막 내용에 손가락으로 닿는지 본다.
async function landscapeState(page){
 return page.evaluate(()=>{
  const f=document.querySelector('#view'),d=f.contentDocument,w=f.contentWindow,host=d.querySelector('#orbit'),root=host.shadowRoot,app=root.querySelector('.app'),center=root.querySelector('.center'),fr=f.getBoundingClientRect();
  const plain=(r)=>({top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height});
  const box=(el,inner=false)=>{
   if(!el||!el.getClientRects().length)return null;
   const cs=el.ownerDocument.defaultView.getComputedStyle(el);
   if(cs.display==='none'||cs.visibility==='hidden')return null;
   const r=plain(el.getBoundingClientRect());
   if(inner){r.top+=fr.top;r.bottom+=fr.top;r.left+=fr.left;r.right+=fr.left;}
   return r;
  };
  const band=box(document.querySelector('.home-links')),notice=box(document.querySelector('#updates-card')),actions=box(root.querySelector('.center .actions'),true);
  const buttons=[...root.querySelectorAll('.home-action-group > button')].map(el=>({text:el.textContent.trim(),box:box(el,true)})).filter(r=>r.box);
  const numbers=[...root.querySelectorAll('.home-count:not([hidden]) .home-count-line:not(:empty)')].map(el=>({text:el.textContent.trim(),box:box(el,true)})).filter(r=>r.box);
  const card=box(root.querySelector('.recent-card'),true);
  const intersect=(a,b)=>a&&b&&Math.min(a.right,b.right)>Math.max(a.left,b.left)?Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)):0;
  const visible=b=>b&&b.top>=Math.max(0,fr.top)-1&&b.bottom<=Math.min(innerHeight,fr.bottom)+1&&intersect(b,band)<1&&intersect(b,notice)<1;
  const items=[...buttons,...numbers];
  return {frame:plain(fr),viewport:{width:innerWidth,height:innerHeight},doc:{top:d.scrollingElement.scrollTop,height:d.scrollingElement.scrollHeight,client:d.scrollingElement.clientHeight,overflow:w.getComputedStyle(d.scrollingElement).overflowY},host:{top:host.scrollTop,height:host.scrollHeight,client:host.clientHeight,cssHeight:w.getComputedStyle(host).height,overflow:w.getComputedStyle(host).overflowY},app:{height:app.clientHeight,scrollHeight:app.scrollHeight,overflow:w.getComputedStyle(app).overflowY},center:{height:center.getBoundingClientRect().height,marginTop:w.getComputedStyle(center).marginTop,marginBottom:w.getComputedStyle(center).marginBottom,position:w.getComputedStyle(center).position},shellScroll:document.scrollingElement.scrollTop,shellHeight:document.body.scrollHeight,band,notice,actions,card,buttons,numbers,cardOverlap:intersect(card,band),bandOverlap:Math.max(0,...items.map(r=>intersect(r.box,band))),noticeOverlap:Math.max(0,...items.map(r=>intersect(r.box,notice))),allButtonsVisible:buttons.length>0&&buttons.every(r=>visible(r.box)),allNumbersVisible:numbers.length>0&&numbers.every(r=>visible(r.box)),lastVisible:items.length>0&&visible(items.reduce((a,b)=>a.box.bottom>b.box.bottom?a:b).box)};
 });
}
test('#1601 첫 화면 회원 숫자판 끝과 바닥 띠를 손가락으로 확인한다',{timeout:300000,skip:!REQUIRE_TOUCH?'터치 화면 전용 시험은 별도 화면 검사에서 실행':false},async()=>{
 const server=await serve();globalThis._lt1284port=server.address().port;
 const capture=process.env.LT_1601_CAPTURE_DIR||'';
 const sizes=[[390,844],[844,390],[740,360],[915,412],[1440,900],[2560,1440]];
 const rows=[];
 if(capture)await mkdir(capture,{recursive:true});
 try{
  for(const [width,height] of sizes)for(const theme of ['night','garden'])for(const member of [true,false])for(const updates of [false,true]){
   // 390×844 세로 화면의 새 소식 겹침은 #1605에서 확인.
   if(width===390&&height===844&&updates)continue;
   const label=width+'x'+height+'-'+theme+'-'+(member?'member':'guest')+'-'+(updates?'news':'no-news');
   const {context,page}=await open({width,height,theme,scene:scenarios[0],member,fullCounts:true,updates});
   try{
    const before=await landscapeState(page);
    if(capture)await page.screenshot({path:path.join(capture,label+'-top.png')});
    let after=before;
    // 좁고 낮은 화면은 실제 터치 입력으로 내려간다. 문서 끝의 수치는 셸 좌표로 확인한다.
    if(width<=915&&height<=520){
     for(let i=0;i<5;i++){await swipeUp(page);after=await landscapeState(page);if(after.doc.top>=after.doc.height-after.doc.client-1&&after.lastVisible)break;}
    }else{
     await page.evaluate(()=>{const d=document.querySelector('#view').contentDocument;d.scrollingElement.scrollTop=d.scrollingElement.scrollHeight;});
     after=await landscapeState(page);
    }
    if(capture)await page.screenshot({path:path.join(capture,label+'-bottom.png')});
    const row={label,width,height,theme,member,updates,before,after};rows.push(row);
    console.log('#1601',JSON.stringify(row));
   }finally{await context.close();}
  }
  if(capture){const {writeFile}=await import('node:fs/promises');await writeFile(path.join(capture,'measurements.json'),JSON.stringify(rows,null,2));}
  for(const r of rows){
   const a=r.after;
   assert.equal(a.shellScroll,0,r.label+': 셸 스크롤 없음');
   assert.ok(a.shellHeight<=a.viewport.height+1,r.label+': 셸 높이 유지');
   assert.ok(a.doc.top>=a.doc.height-a.doc.client-1,r.label+': 안쪽 문서 끝까지 접근');
   assert.equal(a.allButtonsVisible,true,r.label+': 마지막 단추 포함 조작줄 표시');
   assert.equal(a.allNumbersVisible,true,r.label+': 숫자판 마지막 줄 포함 표시');
   assert.equal(a.bandOverlap,0,r.label+': 바닥 링크 겹침 0');
   assert.equal(a.noticeOverlap,0,r.label+': 새 소식 띠 겹침 0');
   if(r.width>=651&&r.height<=520){
    assert.ok(a.host.height<=a.host.client+1,r.label+': 궤도 안 별도 스크롤 없음');
    assert.equal(a.cardOverlap,0,r.label+': 마지막 위치 카드와 바닥 링크 겹침 0');
   }
  }
 }finally{await new Promise(ok=>server.close(ok));}
});
