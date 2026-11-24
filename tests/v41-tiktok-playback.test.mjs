import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {serve} from './helpers/screen-audit.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {MSG} from '../public/v41/frame-messages.mjs';
let chromium,skip;
try{({chromium}=await import('playwright'));if(!existsSync(chromium.executablePath()))skip='브라우저 없음';}catch{skip='브라우저 없음';}
const REQUIRE=process.env.LT_TIKTOK_REQUIRE==='1';
const id='6718335390845095173',url='https://www.tiktok.com/@scout2015/video/'+id;
test('#791 같은 날짜 설정을 다시 받아도 공식 재생 칸을 유지하고 공식 오류만 안내한다',{skip:REQUIRE?false:skip,timeout:120000},async()=>{
 if(skip)assert.fail(skip);
 const server=await serve(),base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const fields={subject:'시험 트리',title:'시험 영상',note:'시험',emotion:'설렘',date:'2026-11-24',url,mediaMetadata:{tiktokId:id,vertical:true}};
 const first=createTree({...fields,title:'첫 순간',url:''});const tree=addMoment(first,fields,first.moments[0].id);
 try{
 for(const width of [1440,390]){
  const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
  try{
   await ctx.route('**/*',r=>{
    const u=new URL(r.request().url());
    if(u.origin==='https://www.tiktok.com'&&u.pathname==='/player/v1/'+id)return r.fulfill({contentType:'text/html',body:'<!doctype html><button id="error" onclick="parent.postMessage({\'x-tiktok-player\':true,type:\'onPlayerError\',value:{errorCode:3001}},\'*\')">시험 오류</button>'});
    if(u.origin!==base)return r.abort();
    if(u.pathname==='/api/workspace')return r.fulfill({json:{revision:1,state:{version:1,trees:[tree],prefs:{dateStyle:'dot'}},subject:'test-791',writeSubjectBound:true,savedAt:'2026-11-24T00:00:00Z'}});
    if(u.pathname.startsWith('/api/'))return r.fulfill({json:{ok:true,items:[]}});
    return r.continue();
   });
   const p=await ctx.newPage();await p.goto(base+'/v41/?account=1#home');
   await p.waitForFunction(()=>window.LT41?.trees?.length===1);const no=p.locator('#discover-ask-no');if(await no.isVisible())await no.click();
   for(const view of ['book','board','home']){
    await p.evaluate(v=>location.hash='#'+v,view);await p.waitForTimeout(1200);
    const f=p.frameLocator('#view');
    if(view==='book'&&width===390&&!await f.locator(`[data-tt-play="${id}"]:visible`).count())await f.locator('#nextBtn:visible').click();
    if(view==='book')await f.locator('[data-tt-play="'+id+'"]').first().click();
    if(view==='board')await f.locator('[data-lt-tiktok-id="'+id+'"] [data-lt-play]').first().click();
    if(view==='home'){await f.locator('.recent-card').click();await f.locator('#mediaPlayHome').click();}
    const frame=f.locator('iframe[src*="/player/v1/"]').first();
    await frame.waitFor({state:'visible'});
    assert.equal(await frame.getAttribute('src'),'https://www.tiktok.com/player/v1/'+id+'?autoplay=1');
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
    await f.locator('.lt-lightbox-note').filter({hasText:'틱톡에서 영상을 재생하지 못했어요.'}).waitFor({state:'visible'});
    assert.equal(await f.locator('.lt-lightbox-note a').last().getAttribute('href'),url);
   }
  }finally{await ctx.close();}
 }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
