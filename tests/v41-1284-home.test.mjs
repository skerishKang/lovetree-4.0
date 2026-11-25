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
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 return server;
}
async function open({width,height=width===390?844:900,theme,scene,member=true}){
 const tree=createTree({subject:'시험 트리',title:'youtube.com에서 간직한 순간',note:'시험용 순간',emotion:'설렘',date:'2026-11-24',url:(scene.vertical?'https://www.youtube.com/shorts/':'https://www.youtube.com/watch?v=')+scene.video,mediaMetadata:{vertical:scene.vertical}},'2026-11-24T11:00:00.000Z');
 const data=JSON.stringify({revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'시험 계정',writeSubjectBound:true,savedAt:'2026-11-24T11:00:00.000Z'});
 const context=await chromium.launch({headless:true,args:['--disable-gpu']});
 const page=await context.newPage({viewport:{width,height},reducedMotion:'reduce'});
 await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
 await page.route('**/api/workspace**',route=>route.fulfill({status:200,contentType:'application/json',body:data}));
 await page.route('**/api/youtube/oembed**',route=>route.fulfill({status:scene.blocked?401:200,contentType:'application/json',body:scene.blocked?'{"error":"youtube_embed_forbidden"}':JSON.stringify({title:'실제 원본 영상 제목 '+scene.type,authorName:'시험 채널',thumbnailUrl:'https://i.ytimg.com/vi/'+scene.video+'/hqdefault.jpg'})}));
 await page.route('**/i.ytimg.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:BLANK}));
 await page.route('**/youtube-nocookie.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<title>YouTube video</title>'}));
 await page.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.video-consent','1');},theme);
 const url='http://127.0.0.1:'+globalThis._lt1284port+'/v41/'+(member?'?account=1':'');
 try{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#discover-ask-no').click({timeout:3000}).catch(()=>{});
  if(member)await page.waitForFunction(()=>{const f=document.querySelector('#view');return !!f?.contentDocument?.querySelector('#orbit')?.shadowRoot?.querySelector('.recent-card');},null,{timeout:12000});
  else await page.frameLocator('#view').locator('.center .actions').waitFor({state:'visible',timeout:12000});
  const frame=page.frameLocator('#view');
  if(await page.locator('#tree-tips').count())await page.locator('#tree-tips').evaluate(el=>el.remove());
  await page.evaluate(()=>{document.body.scrollTop=0;scrollTo(0,0)});
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
    if(scene.blocked)await frame.locator('#mediaExternalHome').evaluate(el=>{if(el.textContent!=='YouTube에서 보기')throw Error('blocked 안내 누락');});
    if(!scene.blocked&&width===390&&theme==='night'){await frame.locator('#mediaPlayHome').click();await frame.locator('#mediaViewerHome iframe').waitFor();const code=scene.type==='landscape'?101:150;await frame.locator('#orbit').evaluate((el,code)=>{dispatchEvent(new MessageEvent('message',{origin:'https://www.youtube-nocookie.com',data:JSON.stringify({event:'onError',info:code})}));},code);await frame.locator('#mediaExternalHome').evaluate(el=>{if(el.textContent!=='YouTube에서 보기')throw Error('오류 신호 안내 누락');});assert.equal(await frame.locator('#mediaViewerHome iframe').count(),0,'101/150 오류 즉시 임베드 제거');}
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
 let drag=null;
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
    if(member&&width===390&&height===844&&scene.type==='vertical'){
     await frame.locator('#orbit').evaluate(()=>globalThis.__LT_ORBIT_TEST__.hold(true));
     const start=await frame.locator('#orbit').evaluate(()=>globalThis.__LT_ORBIT_TEST__.progress(performance.now())),box=await page.locator('#view').boundingBox();
     await swipe(page,{x:box.x+36,y:box.y+box.height-12},{x:box.x+box.width-36,y:box.y+box.height-12});
     const end=await frame.locator('#orbit').evaluate(()=>globalThis.__LT_ORBIT_TEST__.progress(performance.now()));
     drag={start,end,scrollBefore:after.insideScroll,scroll:await frame.locator('#orbit').evaluate(()=>document.scrollingElement.scrollTop)};
    }
    results.push({member,width,height,scene:scene.type,before,after});
   }finally{await context.close();}
  }
  console.log('#1346 TOUCH',JSON.stringify({drag,rows:results.map(r=>({member:r.member,scene:r.scene,size:`${r.width}x${r.height}`,shell:[r.before.shellHeight,r.after.shellHeight],inside:[r.before.insideClient,r.before.insideHeight,r.before.insideScroll,r.after.insideScroll],actions:[r.before.actions.bottom,r.after.actions.bottom]}))}));
  assert.ok(drag&&Math.abs(drag.end-drag.start)>.001,'가로 터치 끌기는 궤도 위상을 계속 바꾼다');
  assert.equal(drag.scroll,drag.scrollBefore,'가로 끄기는 세로 스크롤을 만들지 않는다');
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
