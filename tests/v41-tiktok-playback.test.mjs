import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {serve} from './helpers/screen-audit.mjs';
import {inspectEmbedIframe,countEmbedAutoplay} from './helpers/youtube-embed-audit.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {MSG} from '../public/v41/frame-messages.mjs';

let chromium,skip;
try{({chromium}=await import('playwright'));if(!existsSync(chromium.executablePath()))skip='브라우저 없음';}catch{skip='브라우저 없음';}
const REQUIRE=process.env.LT_TIKTOK_REQUIRE==='1';
const TT_ID='6718335390845095173',TT_URL='https://www.tiktok.com/@scout2015/video/'+TT_ID;
const IG_CODE='DR_TeHFCB9m',IG_URL='https://www.instagram.com/reel/'+IG_CODE+'/';
const YT_ID='a1111111111';
const THUMB='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TT_PLAYER_HTML='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#121212;color:#fff;font:16px sans-serif}button{margin:16px}</style><button id="error" onclick="parent.postMessage({\'x-tiktok-player\':true,type:\'onPlayerError\',value:{errorCode:3001}},\'*\')">시험 오류</button>';
const EMBED_HTML='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#121212}</style><main aria-label="mocked official player"></main>';
const MEDIA={
 tiktok:{kind:'tiktok',id:TT_ID,code:'',url:TT_URL,src:'https://www.tiktok.com/player/v1/'+TT_ID+'?autoplay=1',title:'TikTok 시험 순간',metadata:{tiktokId:TT_ID,tiktokAuthor:'scout2015',vertical:true}},
 instagram:{kind:'instagram',id:'',code:IG_CODE,url:IG_URL,src:'https://www.instagram.com/reel/'+IG_CODE+'/embed',title:'Instagram 시험 릴스',metadata:{instagramShortcode:IG_CODE,instagramAuthor:'fan',vertical:true}}
};
const SHARE_IDS={tiktok:'share-1378-'+'a'.repeat(20),instagram:'share-1378-'+'b'.repeat(20)};

function treeFor(kind){
 const media=MEDIA[kind];
 return createTree({subject:'#1378 시험',title:media.title,note:'모의 공식 재생기',emotion:'설렘',date:'2026-11-24',url:media.url,mediaMetadata:media.metadata},'2026-11-24T00:00:00.000Z');
}
function matrixTree(){
 const tiktok=treeFor('tiktok'),media=MEDIA.instagram;
 return addMoment(tiktok,{subject:'#1378 시험',title:media.title,note:'모의 공식 재생기',emotion:'벅참',date:'2026-11-25',url:media.url,mediaMetadata:media.metadata},tiktok.moments[0].id,'2026-11-25T00:00:00.000Z');
}
const momentFor=(tree,kind)=>tree.moments.find(m=>m.url===MEDIA[kind].url);

/** 모든 외부 요청을 가로채고, 공식 플레이어·oEmbed·썸네일만 모의 응답으로 채웁니다. */
async function installMockRoutes(ctx,{base,workspace=null,shares=null,moments=null,state={}}){
 const unexpected=[];
 await ctx.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base){
   if(u.origin==='https://www.tiktok.com'&&/^\/player\/v1\/\d+$/.test(u.pathname))
    return route.fulfill({contentType:'text/html',body:TT_PLAYER_HTML});
   if(u.origin==='https://www.tiktok.com'&&u.pathname==='/oembed')
    return route.fulfill({json:{thumbnail_url:''}});
   if(u.origin==='https://www.instagram.com'&&/^\/reel\/[A-Za-z0-9_-]+\/embed$/.test(u.pathname))
    return route.fulfill({contentType:'text/html',body:EMBED_HTML});
   if(/(?:^|\.)ytimg\.com$/.test(u.hostname))
    return route.fulfill({contentType:'image/png',body:Buffer.from(THUMB,'base64')});
   if(/(?:^|\.)youtube(?:-nocookie)?\.com$/.test(u.hostname)&&u.pathname.startsWith('/embed/'))
    return route.fulfill({contentType:'text/html',body:EMBED_HTML});
   unexpected.push(u.href);
   return route.abort();
  }
  if(u.pathname==='/api/workspace')return workspace
   ?route.fulfill({json:{revision:1,state:{version:1,trees:[workspace],prefs:{dateStyle:'dot'}},subject:'test-1378',writeSubjectBound:true,savedAt:'2026-11-24T00:00:00Z'}})
   :route.fulfill({status:401,json:{ok:false,code:'unauthenticated'}});
  if(u.pathname==='/api/account')return route.fulfill({status:401,json:{ok:false,code:'unauthenticated'}});
  if(u.pathname.startsWith('/api/public/shares/')){
   const shareId=decodeURIComponent(u.pathname.slice('/api/public/shares/'.length));
   const tree=shares?.[shareId];
   return tree
    ?route.fulfill({json:{ok:true,share:{id:shareId,view:'book',entryMomentId:tree.moments[0].id},tree}})
    :route.fulfill({status:404,json:{ok:false,code:'share_not_found'}});
  }
  if(u.pathname==='/api/public/moments')return route.fulfill({json:{items:moments||[],total:(moments||[]).length,groups:[]}});
  if(u.pathname==='/api/instagram/oembed')return state.instagramUnavailable
   ?route.fulfill({status:404,headers:{'cache-control':'no-store'},json:{ok:false,error:{code:'instagram_gone'}}})
   :route.fulfill({headers:{'cache-control':'no-store'},json:{ok:true,html:'<blockquote class="instagram-media"></blockquote>'}});
  if(u.pathname==='/api/tiktok/oembed')return route.fulfill({json:{ok:true,thumbnail_url:''}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,items:[]}});
  return route.continue();
 });
 return unexpected;
}

async function openOwner(browser,server,{width,theme,tree}){
 const base='http://127.0.0.1:'+server.address().port;
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
 await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.boardTheme',t);}catch{}},theme);
 const state={};
 const unexpected=await installMockRoutes(ctx,{base,workspace:tree,state});
 const page=await ctx.newPage();
 await page.goto(base+'/v41/?account=1#home',{waitUntil:'load'});
 await page.waitForFunction(()=>window.LT41?.trees?.length===1,null,{timeout:20000});
 const no=page.locator('#discover-ask-no');if(await no.isVisible())await no.click();
 return {server,base,ctx,page,state,unexpected};
}

function openerFor(frame,view,kind){
 const media=MEDIA[kind];
 if(view==='book')return frame.locator(kind==='tiktok'?'[data-tt-play="'+media.id+'"]:visible':'[data-ig-play="'+media.code+'"]:visible').first();
 if(view==='board')return frame.locator(kind==='tiktok'?'[data-lt-tiktok-id="'+media.id+'"] [data-lt-play]:visible':'[data-lt-instagram-code="'+media.code+'"] [data-lt-play]:visible').first();
 return frame.locator('#detailPlayer .lt-media[data-lt-url="'+media.url+'"] [data-lt-play]:visible').first();
}

async function openMoment(page,view,kind,tree){
 const moment=momentFor(tree,kind);
 const query=view==='board'?'?tree='+tree.id:'?tree='+tree.id+'&moment='+moment.id;
 await page.evaluate(({view,query})=>location.hash='#my/'+view+query,{view,query});
 const frame=page.frameLocator('#view'),opener=openerFor(frame,view,kind);
 await opener.waitFor({state:'visible',timeout:20000});
 return {frame,opener};
}

async function assertCompactHasNoIframe(opener){
 const count=await opener.evaluate(element=>{
  const root=element.closest('.lt-media')||element.closest('.clipping');
  return root?root.querySelectorAll('iframe').length:-1;
 });
 assert.equal(count,0,'작은 카드/상세 칸 안에 iframe이 없다');
}

async function shellBlockers(page,player){
 const rect=await player.evaluate(element=>{
  const r=element.getBoundingClientRect();
  return {left:r.left,top:r.top,width:r.width,height:r.height};
 });
 return page.evaluate(rect=>{
  const host=[...document.querySelectorAll('#view,#view-next')].find(x=>!x.hidden&&x.getClientRects().length),h=host?.getBoundingClientRect();
  if(!h)return {count:9,blockers:[]};
  const blockers=[0.1,0.5,0.9].flatMap(y=>[0.1,0.5,0.9].flatMap(x=>{
   const left=h.left+rect.left+rect.width*x,top=h.top+rect.top+rect.height*y;
   const element=document.elementFromPoint(left,top);
   return element===host?[]:[{x,y,left,top,tag:element?.tagName,id:element?.id,className:element?.className}];
  }));
  return {count:blockers.length,blockers};
 },rect);
}

async function assertNoPlaybackIframe(frame){
 assert.equal(await frame.locator('iframe').count(),0,'재생 불가·닫기 뒤 iframe 0');
 assert.equal(await countEmbedAutoplay(frame),0,'자동 재생 iframe도 남아 있지 않다');
}

async function auditPlayback(page,frame,opener,kind,label){
 const media=MEDIA[kind];
 await assertCompactHasNoIframe(opener);
 await opener.click();
 const player=frame.locator('.lt-lightbox iframe[src*="'+(kind==='tiktok'?'/player/v1/':'/reel/')+'"]');
 await player.waitFor({state:'visible',timeout:15000});
 await assertCompactHasNoIframe(opener);
 assert.equal(await player.getAttribute('src'),media.src,label+' 공식 주소');
 const audit=await inspectEmbedIframe(player);
 assert.equal(audit.minimum200,true,label+' 큰 보기 200×200 이상: '+JSON.stringify(audit));
 assert.equal(audit.blocked,0,label+' iframe 9지점 맨 위 요소 0: '+JSON.stringify(audit.blockers));
 assert.ok(audit.points.every(point=>point.withinViewport),label+' 9지점이 화면 안에 있다');
 assert.equal(audit.autoplay,true,label+' 공식 자동 재생');
 assert.equal(await countEmbedAutoplay(frame),1,label+' 동시 자동 재생은 1개');
 const shell=await shellBlockers(page,player);
 assert.equal(shell.count,0,label+' 셸 요소가 가리지 않는다: '+JSON.stringify(shell.blockers));
 await frame.locator('.lt-lightbox-close').click();
 await frame.locator('.lt-lightbox').waitFor({state:'detached'});
 await assertNoPlaybackIframe(frame);
}

async function auditInstagramFailure(frame,opener,state,label){
 state.instagramUnavailable=true;
 try{
  await assertCompactHasNoIframe(opener);
  await opener.click();
  const note=frame.locator('.lt-lightbox-note').filter({hasText:'여기에서 재생할 수 없는 영상입니다.'});
  await note.waitFor({state:'visible',timeout:15000});
  assert.equal(await note.locator('a').getAttribute('href'),MEDIA.instagram.url,label+' 재생 불가 원본 링크');
  await assertNoPlaybackIframe(frame);
  await frame.locator('.lt-lightbox-close').click();
  await frame.locator('.lt-lightbox').waitFor({state:'detached'});
  await assertNoPlaybackIframe(frame);
 }finally{state.instagramUnavailable=false;}
}

// #791: 기존 대기·기준은 유지하고, 책/보드/홈의 공식 재생 칸을 큰 보기 안에서 찾습니다.
test('#791 같은 날짜 설정을 다시 받아도 공식 재생 칸을 유지하고 공식 오류만 안내한다',{skip:REQUIRE?false:skip,timeout:120000},async()=>{
 if(skip)assert.fail(skip);
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const fields={subject:'시험 트리',title:'시험 영상',note:'시험',emotion:'설렘',date:'2026-11-24',url:TT_URL,mediaMetadata:{tiktokId:TT_ID,vertical:true}};
 const first=createTree({...fields,title:'첫 순간',url:''});const tree=addMoment(first,fields,first.moments[0].id);
 try{
  for(const width of [1440,390]){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   try{
    const unexpected=await installMockRoutes(ctx,{base,workspace:tree});
    const p=await ctx.newPage();await p.goto(base+'/v41/?account=1#home');
    await p.waitForFunction(()=>window.LT41?.trees?.length===1);const no=p.locator('#discover-ask-no');if(await no.isVisible())await no.click();
    for(const view of ['book','board','home']){
     await p.evaluate(v=>location.hash='#'+v,view);await p.waitForTimeout(1200);
     const f=p.frameLocator('#view');
     if(view==='book'&&width===390&&!await f.locator(`[data-tt-play="${TT_ID}"]:visible`).count())await f.locator('#nextBtn:visible').click();
     if(view==='book')await f.locator('[data-tt-play="'+TT_ID+'"]').first().click();
     if(view==='board')await f.locator('[data-lt-tiktok-id="'+TT_ID+'"] [data-lt-play]').first().click();
     if(view==='home')await f.locator('.recent-card [data-recent-play]').click();
     const selector=view==='home'
      ?'#mediaViewerHome #mediaVisualHome iframe[src*="/player/v1/"]'
      :'.lt-lightbox iframe[src*="/player/v1/"]';
     const frame=f.locator(selector).first();
     await frame.waitFor({state:'visible'});
     assert.equal(await frame.getAttribute('src'),MEDIA.tiktok.src);
     const handle=await frame.elementHandle();
     // 셸이 실제 화면에 보내는 것과 같은 메시지: 날짜는 이미 그려진 값이다.
     await p.evaluate(type=>{const w=document.getElementById('view').contentWindow;for(let i=0;i<3;i++)w.postMessage({type,value:'dot'},location.origin)},MSG.dateStyle);
     await p.waitForTimeout(1000);
     assert.ok(await handle.evaluate(e=>e.isConnected),width+' '+view+' 같은 설정 뒤 동일한 재생 칸 유지');
     const child=await handle.contentFrame();assert.ok(child);
     await p.evaluate(type=>document.getElementById('view').contentWindow.postMessage({'x-tiktok-player':true,type,value:{errorCode:3001}},location.origin),MSG.tiktokPlayerError);
     await p.waitForTimeout(100);
     assert.ok(await handle.evaluate(e=>e.isConnected),'다른 출처의 오류는 무시한다');
     await child.evaluate(type=>parent.postMessage({'x-tiktok-player':true,type,value:{errorCode:3001}},'*'),MSG.tiktokPlayerError);
     if(view==='home'){
      await f.locator('#mediaExternalHome').filter({hasText:'틱톡에서 보기'}).waitFor({state:'visible'});
      assert.equal(await f.locator('#mediaExternalHome').getAttribute('href'),TT_URL);
     }else{
      await f.locator('.lt-lightbox-note').filter({hasText:'틱톡에서 영상을 재생하지 못했어요.'}).waitFor({state:'visible'});
      assert.equal(await f.locator('.lt-lightbox-note a').last().getAttribute('href'),TT_URL);
     }
     assert.equal(await f.locator('iframe[src*="/player/v1/"]').count(),0,width+' '+view+' 공식 오류 후 iframe 0');
    }
    assert.deepEqual(unexpected,[],'모의하지 않은 외부 요청 0');
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

async function runOwnerMatrix(browser,server,view){
 const tree=matrixTree();
 for(const theme of ['night','garden'])for(const width of [390,1440]){
  const h=await openOwner(browser,server,{width,theme,tree});
  try{
   for(const kind of ['tiktok','instagram']){
    const {frame,opener}=await openMoment(h.page,view,kind,tree);
    const label=width+'·'+theme+'·'+view+'·'+kind;
    await auditPlayback(h.page,frame,opener,kind,label);
    if(kind==='instagram')await auditInstagramFailure(frame,opener,h.state,label);
   }
   assert.deepEqual(h.unexpected,[],width+'·'+theme+'·'+view+' 모의하지 않은 외부 요청 0');
  }finally{await h.ctx.close();}
 }
}

for(const view of ['book','board','network']){
 test('#1378 '+view+' 틱톡·인스타그램 큰 보기(390·1440 × 밤·정원)',{skip:REQUIRE?false:skip,timeout:240000},async()=>{
  if(skip)assert.fail(skip);
  const server=await serve(),browser=await chromium.launch({headless:true});
  try{await runOwnerMatrix(browser,server,view);}
  finally{await browser.close();await new Promise(r=>server.close(r));}
 });
}

test('#1378 공유 실제 진입 경로 #share/<id>/book에서 틱톡·인스타그램 재생',{skip:REQUIRE?false:skip,timeout:300000},async()=>{
 if(skip)assert.fail(skip);
 const server=await serve(),base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 const shares=Object.fromEntries(['tiktok','instagram'].map(kind=>[SHARE_IDS[kind],treeFor(kind)]));
 try{
  for(const theme of ['night','garden'])for(const width of [390,1440]){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.boardTheme',t);}catch{}},theme);
   const state={},unexpected=await installMockRoutes(ctx,{base,shares,state});
   try{
    const page=await ctx.newPage();
    for(const kind of ['tiktok','instagram']){
     const tree=shares[SHARE_IDS[kind]],hash='#share/'+SHARE_IDS[kind]+'/book';
     await page.goto(base+'/v41/?case='+kind+hash,{waitUntil:'load'});
     await page.waitForFunction(treeId=>window.LT41?.source==='share'&&window.LT41?.tree?.id===treeId,tree.id,{timeout:20000});
     assert.equal(await page.evaluate(()=>location.hash),hash,'실제 공유 해시 경로');
     await page.waitForFunction(()=>[...document.querySelectorAll('#view,#view-next')].some(f=>!f.hidden&&f.getClientRects().length&&f.contentDocument?.querySelector('.moment')),null,{timeout:20000});
     const frame=page.frameLocator('#view'),opener=openerFor(frame,'book',kind);
     await opener.waitFor({state:'visible',timeout:20000});
     await auditPlayback(page,frame,opener,kind,width+'·'+theme+'·share·'+kind);
    }
    assert.deepEqual(unexpected,[],'공유 경로에서 모의하지 않은 외부 요청 0');
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

// 공개 moments는 현재 서버와 community-moments가 videoId(YouTube)만 받습니다. 실제 진입 경로는
// YouTube 모의 항목으로 확인하고, TikTok/Instagram 재생 불가라는 소스 제약은 이 시험으로 가리지 않습니다.
test('#1378 공개 moments 실제 진입 경로 #explore/moments 확인',{skip:REQUIRE?false:skip,timeout:180000},async()=>{
 if(skip)assert.fail(skip);
 const server=await serve(),base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
 const items=[{id:'moment-'+YT_ID,videoId:YT_ID,shareId:'share-1378-'+'c'.repeat(20),vertical:true,ownerName:'시험 이용자',treeTitle:'시험 트리',title:'공개 YouTube 순간',url:'https://www.youtube.com/shorts/'+YT_ID,thumbnail:'https://i.ytimg.com/vi/'+YT_ID+'/oardefault.jpg',note:'실제 진입 경로 확인',emotion:'설렘',date:'2026-11-24',keywords:[]}];
 try{
  for(const theme of ['night','garden'])for(const width of [390,1440]){
   const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
   await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);}catch{}},theme);
   const unexpected=await installMockRoutes(ctx,{base,moments:items});
   try{
    const page=await ctx.newPage();
    await page.goto(base+'/v41/#explore/moments',{waitUntil:'load'});
    const panel=page.locator('#community-panel[open] #community-moments-panel:not([hidden])');
    await panel.waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>!!document.querySelector('#community-moments-panel .moments-stage')?.dataset.ltMomentsId,null,{timeout:15000});
    assert.equal(await page.evaluate(()=>location.hash),'#explore/moments','실제 공개 moments 해시 경로');
    assert.equal(await page.locator('#community-moments-panel .moments-stage').getAttribute('data-lt-moments-id'),YT_ID,'모의 공개 순간이 실제로 그려짐');
    const player=panel.locator('.moments-frame:not(.moments-next)');
    await player.waitFor({state:'visible'});
    assert.match(await player.getAttribute('src'),new RegExp('/embed/'+YT_ID+'\\?'));
    assert.equal(await countEmbedAutoplay(panel),1,'공개 moments 자동 재생 1개');
    assert.deepEqual(unexpected,[],'moments 경로에서 모의하지 않은 외부 요청 0');
   }finally{await ctx.close();}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
