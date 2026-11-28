// #1605 — 모의 계정과 헤드리스 화면을 이용한 전후 실측. 운영 API·DB 호출 없음.
import { chromium } from 'playwright';
import { serve } from './screen-audit.mjs';
import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';

const PHASE=process.env.LT_1605_PHASE||'before';
const PORT=Number(process.env.LT_TEST_PORT||4504);
const OUTPUT=path.resolve(process.env.LT_1605_DIR||'.capture-1605',PHASE);
if(existsSync(OUTPUT)) {
 const backup=path.join(path.dirname(OUTPUT),'_to_delete');mkdirSync(backup,{recursive:true});
 renameSync(OUTPUT,path.join(backup,PHASE+'-'+Date.now()));
}
mkdirSync(OUTPUT,{recursive:true});
const SIZES=[[390,844],[844,390],[1440,900],[2560,1440]];
const THEMES=['night','garden'];
const COUNTS=[5,40,120];
const BANNERS=[false,true];
const SCREENS={
 shelf:'track32-bookshelf.html',tree:'track61-tree.html',
 board:'track58-pinboard.html',book:'track59-sketchbook.html',network:'track56-network.html'
};
function workspace(count){
 const moments=Array.from({length:count},(_,i)=>{
  const date=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
  return {id:'m'+(i+1),parentId:i?'m'+i:null,relation:i?'이어짐':'',
    title:'가짜 순간 '+(i+1),date,emotion:'설렘',note:'캡처용 시험 기록 '+(i+1),type:'memo',
    url:'',keywords:[],createdOrder:i+1,links:[],createdAt:date+'T00:00:00.000Z'};
 });
 return {revision:1,subject:'trial-1605',writeSubjectBound:true,themeMissing:false,
  state:{version:1,prefs:{theme:'night'},trees:[{
   id:'t6',subject:'가짜 대상',title:'디자인 최종 점검',coverMomentId:'',inbox:false,
   createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-06T00:00:00.000Z',moments
  }]}};
}
const server=await serve({}, {port:PORT});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const records=[],began=new Date().toISOString(), errors=[];
const name=(vp,theme,count,screen,banner,kind='screen')=>vp[0]+'x'+vp[1]+'-'+theme+'-'+count+'-'+screen+'-'+(banner?'notice':'clear')+'-'+kind+'.png';
function intersection(a,b){
 if(!a||!b)return {height:0,area:0};
 const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left));
 const h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 return {height:+h.toFixed(2),area:+(w*h).toFixed(2)};
}
async function measureScreen(page,screen,count,banner){
 return page.evaluate(({screen,count,banner})=>{
  const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const inter=(a,b)=>{if(!a||!b)return{height:0,area:0};const w=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),h=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return{height:+h.toFixed(2),area:+(w*h).toFixed(2)}};
  const card=document.getElementById('updates-card'),frame=document.getElementById('view');
  const doc=frame?.contentDocument;
  const bannerRect=!card?.hidden&&card&&getComputedStyle(card).display!=='none'?rect(card):null;
  const frameRect=rect(frame);
  const overlap=inter(bannerRect,frameRect);
  const docScroll=doc?.scrollingElement;
  const scrollers=[docScroll,...doc?.querySelectorAll('*')||[]].filter((el,i,a)=>el&&a.indexOf(el)===i&&el.scrollHeight>el.clientHeight+3&&/scroll|auto/.test(getComputedStyle(el).overflowY)).slice(0,50);
  const scroll=scrollers.map(el=>{const max=el.scrollHeight-el.clientHeight;const original=el.scrollTop;el.scrollTop=max;const actual=el.scrollTop;el.scrollTop=original;return{element:el.id||el.className||el.tagName,max,actual,reached:Math.abs(max-actual)<2}});
  let tree=null,book=null;
  if(screen==='tree'&&doc?.querySelector('#cards')){
   const elements=[...doc.querySelectorAll('#cards [data-kind]')];
   const moments=elements.filter(el=>el.dataset.kind==='moment');
   const small=els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width<43.5||r.height<43.5});
   tree={mode:frame.contentWindow.__LT_TREE_VIEW__?.state?.mode,scale:frame.contentWindow.__LT_TREE_VIEW__?.state?.scale,
      totalCards:elements.length,momentCards:moments.length,under44:small(elements).length,momentUnder44:small(moments).length,
      minMomentWidth:moments.length?Math.min(...moments.map(el=>el.getBoundingClientRect().width)):null,
      minMomentHeight:moments.length?Math.min(...moments.map(el=>el.getBoundingClientRect().height)):null};
  }
  if(screen==='book'&&doc?.querySelector('#turnWhy')){
   const tip=doc.querySelector('#turnWhy'),wrap=doc.querySelector('#bookWrap');
   const hintRect=rect(tip),wrapRect=rect(wrap);
   const content=[...doc.querySelectorAll('.page .moment-title,.page .letter,.page .note-piece,.page .archive-piece,.page .clipping,.page .moment-card')]
      .filter(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return r.width>1&&r.height>1&&c.visibility!=='hidden'&&c.display!=='none'});
   const pageCardOverlap=content.reduce((sum,el)=>sum+inter(hintRect,rect(el)).area,0);
   book={hintShown:tip.classList.contains('show')&&getComputedStyle(tip).opacity!=='0',
     hintRect,bookRect:wrapRect,overlapWithBook:inter(hintRect,wrapRect),cardOverlapArea:+pageCardOverlap.toFixed(2),
     contentCount:content.length,shape:doc.documentElement.dataset.bookShape};
  }
  let contentHits=0;
  if(doc&&bannerRect&&frameRect) {
   const nodes=[...doc.querySelectorAll('button,a[href],[role=button],input,select,textarea')];
   for(const el of nodes){
    const r=el.getBoundingClientRect(),c=getComputedStyle(el);
    if(c.display==='none'||c.visibility==='hidden'||r.width<4||r.height<4)continue;
    const shifted={left:r.left+frameRect.left,right:r.right+frameRect.left,top:r.top+frameRect.top,bottom:r.bottom+frameRect.top};
    if(inter(bannerRect,shifted).area>20)contentHits++;
   }
  }
  return {bannerShown:!!bannerRect,bannerRect,frameRect,overlap,pressBehindBanner:contentHits,
    shellTheme:document.documentElement.dataset.ltTheme||'night',innerTheme:doc?.documentElement?.dataset.ltTheme||'night',
    innerScreen:doc?.documentElement?.dataset.v41Screen||null,
    scroll,tree,book};
 },{screen,count,banner});
}

const capture=async(page,file)=>page.screenshot({path:path.join(OUTPUT,file),animations:'disabled',timeout:20000});
const expected=5*2*3*2*4;
try{
 for(const [width,height] of SIZES)for(const theme of THEMES)for(const count of COUNTS){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1')}catch{}},theme);
  const fake={...workspace(count),state:{...workspace(count).state,prefs:{theme}}};
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==base){
    if(url.hostname==='i.ytimg.com'||url.hostname==='audit.invalid')return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64')});
    return route.abort();
   }
   if(url.pathname.startsWith('/api/workspace')){
    if(request.method()!=='GET')return route.fulfill({status:400,contentType:'application/json',body:'{"code":"mock_write_blocked"}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fake)});
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[],"total":0}'});
   return route.continue();
  });
  const page=await context.newPage();const jsErrors=[];
  page.on('pageerror',e=>jsErrors.push(e.message.slice(0,180)));
  try{
   await page.goto(base+'/v41/?account=1',{waitUntil:'load',timeout:18000});
   await page.waitForFunction(()=>window.LT41?.tree?.id==='t6',null,{timeout:16000});
   for(const [screen,file] of Object.entries(SCREENS)){
    await page.evaluate(f=>document.querySelector('[data-view="'+f+'"]')?.click(),file);
    await page.waitForFunction(s=>document.querySelector('#view')?.contentDocument?.documentElement?.dataset?.v41Screen===s,screen,{timeout:16000});
    // 화면 변경 뒤 내부 스크롤이 초기화되므로 각 띠 조건에서 마지막 위치까지 내려간다.
    for(const banner of BANNERS){
     const position=await page.evaluate(enabled=>{
      const card=document.getElementById('updates-card');
      if(card){card.querySelector('#updates-card-text').textContent='러브트리가 새로워졌어요 — 4.1.15';card.hidden=!enabled;}
      const doc=document.querySelector('#view')?.contentDocument;
      const scrolling=doc?.scrollingElement;
      if(scrolling)scrolling.scrollTop=scrolling.scrollHeight;
      for(const e of doc?.querySelectorAll('*')||[]){
       if(e.scrollHeight>e.clientHeight+3&&/auto|scroll/.test(getComputedStyle(e).overflowY))e.scrollTop=e.scrollHeight;
      }
      return !!card&&!card.hidden;
     },banner);
     await page.waitForTimeout(70);
     const measurement=await measureScreen(page,screen,count,banner);
     const entry={kind:'inner-banner',phase:PHASE,width,height,theme,count,screen,banner,position,metrics:measurement,
      errors:jsErrors.slice(0,3)};
     records.push(entry);
     // 3개 규모 전체 수치는 모두 재되, 대표 40개 화면을 모든 크기·테마·띠로 촬영한다.
     if(count===40)await capture(page,name([width,height],theme,count,screen,banner));
     if(banner&&measurement.bannerShown!==true)errors.push('BANNER_NOT_SHOWN '+JSON.stringify({width,height,theme,count,screen}));
    }
    if(screen==='tree'){
     await page.evaluate(()=>document.getElementById('updates-card').hidden=true);
     const initial=await measureScreen(page,screen,count,false);
     if(count===5||count===40||count===120)await capture(page,name([width,height],theme,count,screen,false,'initial'));
     await page.evaluate(()=>document.getElementById('view')?.contentDocument?.getElementById('goFit')?.click());
     await page.waitForTimeout(45);
     const fit=await measureScreen(page,screen,count,false);
     records.push({kind:'tree-fit-button',phase:PHASE,width,height,theme,count,screen:'tree',initial:initial.tree,fit:fit.tree});
    }
    if(screen==='book'){
     // 실제 책 2쪽으로 이동한 뒤, 넘기는 애니메이션 중 나타나는 힌트를 같은 상태로 고정하여 실측.
     await page.evaluate(()=>{
      const doc=document.querySelector('#view')?.contentDocument;
      doc?.getElementById('nextBtn')?.click();
     });
     await page.waitForTimeout(500);
     await page.evaluate(()=>{
      const doc=document.querySelector('#view')?.contentDocument;
      doc?.getElementById('turnWhy')?.classList.add('show');
      doc?.getElementById('bookWrap')?.classList.add('turning');
     });
     await page.waitForTimeout(70);
     const hint=await measureScreen(page,'book',count,false);
     records.push({kind:'book-hint',phase:PHASE,width,height,theme,count,screen:'book',metrics:hint});
     if((width===1440||width===2560)||count===40)await capture(page,name([width,height],theme,count,'book',false,'turn-hint'));
     await page.evaluate(()=>{const doc=document.querySelector('#view')?.contentDocument;doc?.getElementById('turnWhy')?.classList.remove('show');doc?.getElementById('bookWrap')?.classList.remove('turning')});
    }
   }
  }catch(e){errors.push(width+'x'+height+' '+theme+' '+count+' '+String(e));}
  finally{await context.close()}
  console.log('PROGRESS',PHASE,width+'x'+height,theme,count,'bannerRecords',records.filter(x=>x.kind==='inner-banner').length,'errors',errors.length);
 }
}finally{
 await browser.close();await new Promise(r=>server.close(r));
}
const saved={phase:PHASE,source:process.env.LT_1605_SOURCE||'',started:began,ended:new Date().toISOString(),
  expectedBannerCases:expected,actualBannerCases:records.filter(x=>x.kind==='inner-banner').length,
  records,errors};
writeFileSync(path.join(OUTPUT,'measurements.json'),JSON.stringify(saved,null,2));
const banners=records.filter(x=>x.kind==='inner-banner'&&x.banner);
const books=records.filter(x=>x.kind==='book-hint');
const trees=records.filter(x=>x.kind==='tree-fit-button');
const summary={
 banner:{maxOverlapHeight:Math.max(0,...banners.map(x=>x.metrics.overlap.height)),
  minOverlapHeight:Math.min(...banners.map(x=>x.metrics.overlap.height)),
  nonzero:banners.filter(x=>x.metrics.overlap.height>1).length,
  overlapSum:banners.reduce((v,x)=>v+x.metrics.overlap.height,0),
  blockedPressCount:banners.reduce((v,x)=>v+x.metrics.pressBehindBanner,0)},
 book:{maxOverlapArea:Math.max(0,...books.map(x=>x.metrics.book?.overlapWithBook.area||0)),
  sumCardArea:books.reduce((v,x)=>v+(x.metrics.book?.cardOverlapArea||0),0),
  nonzero:books.filter(x=>(x.metrics.book?.overlapWithBook.area||0)>1).length},
 tree:{at40:trees.filter(x=>x.count===40).map(x=>({size:x.width+'x'+x.height,theme:x.theme,mode:x.initial?.mode,under44:x.initial?.under44,afterFit:x.fit?.under44})),
  at5:trees.filter(x=>x.count===5).map(x=>({size:x.width+'x'+x.height,theme:x.theme,mode:x.initial?.mode,under44:x.initial?.under44})),
  at120:trees.filter(x=>x.count===120).map(x=>({size:x.width+'x'+x.height,theme:x.theme,mode:x.initial?.mode,under44:x.initial?.under44}))}
};
writeFileSync(path.join(OUTPUT,'summary.json'),JSON.stringify(summary,null,2));
console.log('DONE',PHASE,JSON.stringify({cases:saved.actualBannerCases,errors:errors.length,summary,output:OUTPUT}));
