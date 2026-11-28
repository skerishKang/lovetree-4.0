import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serve} from './screen-audit.mjs';

let chromium,unavailable;
try{({chromium}=await import('playwright'));if(!existsSync(chromium.executablePath()))unavailable='Chromium 실행 파일 없음';}
catch{unavailable='Playwright 모듈 없음';}
const all=process.env.LT1583_FULL_GRID==='1';
const measureOnly=process.env.LT1583_MEASURE_ONLY==='1';
const captures=process.env.LT1583_CAPTURE_DIR||'';
const screens=all?[[390,844],[844,390],[1440,900],[2560,1440]]:[[844,390]];
const cards=Array.from({length:18},(_,i)=>({
 shareId:'mock-share-'+String(i+1).padStart(16,'0'),title:'공개 트리 '+(i+1),
 subject:'음악과 무대',summary:'서로 다른 순간을 천천히 살펴보세요. '.repeat(10),
 momentCount:8,aiTester:true,publicDisplayName:'시험 공개자',createdAt:'2026-11-20T00:00:00.000Z',
 cover:{title:'첫 순간',type:'photo',url:''},
 stats:{hearts:3,favorites:1,hearted:false,favored:false,reactions:{heart:3},mine:[]}
}));
const workspace={revision:1,subject:'test-1583',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z',
 state:{version:1,trees:[{id:'tree-1583',title:'시험 트리',subject:'시험 주제',moments:[],edges:[]}],prefs:{}}};
const response=(r,v)=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});

test('#1583 첫 순간 안내·테마 초점선은 카드와 키보드 조작을 지킨다',{skip:unavailable||undefined,timeout:480000},async()=>{
 if(unavailable)assert.fail(unavailable);
 const server=await serve({}, {port:Number(process.env.LT_TEST_PORT||0)});
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const records=[],failures=[];
 try{
  if(captures)await mkdir(captures,{recursive:true});
  for(const [width,height] of screens)for(const theme of ['night','garden'])for(const member of [false,true]){
   const key=width+'x'+height+'-'+theme+'-'+(member?'member':'guest');
   const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',locale:'ko-KR',timezoneId:'Asia/Seoul'});
   try{
    await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t)},theme);
    await ctx.route('**/*',r=>{
     const u=new URL(r.request().url());
     if(u.origin!==base)return r.abort();
     if(u.pathname==='/api/workspace')return response(r,workspace);
     if(u.pathname==='/api/community/shares')return response(r,{ok:true,items:cards,totalVisible:18,groups:[],groupsAll:[],nextCursor:''});
     if(u.pathname.startsWith('/api/'))return response(r,{ok:true,items:[]});
     return r.continue();
    });
    const page=await ctx.newPage();
    await page.goto(base+'/v41/'+(member?'?account=1':'')+'#explore',{waitUntil:'domcontentloaded'});
    await page.locator('.community-card').first().waitFor({timeout:20000});
    if(member)await page.waitForFunction(()=>document.querySelector('#toast')?.textContent?.includes('첫 순간을 남겨 보세요.'),null,{timeout:12000});
    const panel=page.locator('#community-panel');
    await panel.evaluate(e=>e.scrollTop=e.scrollHeight);
    const data=await page.evaluate(()=>{
      const p=document.querySelector('#community-panel'),t=document.querySelector('#toast');
      const s=getComputedStyle(p),ts=getComputedStyle(t);
      const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}};
      const visibleToast=!t.hidden&&ts.display!=='none'&&ts.visibility!=='hidden'&&ts.opacity!=='0';
      const tb=visibleToast?box(t):null;
      const area=(a,b)=>a&&b?Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)):0;
      const overlap=[...p.querySelectorAll('.community-card')].map(c=>area(tb,box(c)));
      const black=s.outlineColor==='rgb(16, 16, 16)'||s.outlineColor==='rgb(0, 0, 0)';
      return {toastText:t.textContent,toastVisible:visibleToast,toastMarker:t.hasAttribute('data-lt-first-moment-intro'),
       overlapArea:Math.round(overlap.reduce((a,b)=>a+b,0)*100)/100,overlappedCards:overlap.filter(x=>x>0).length,
       toastRect:tb,scrollTop:p.scrollTop,scrollMax:p.scrollHeight-p.clientHeight,
       focus:p.matches(':focus'),focusVisible:p.matches(':focus-visible'),
       outline:{style:s.outlineStyle,color:s.outlineColor,width:s.outlineWidth,offset:s.outlineOffset,black},
       border:{top:s.borderTop,left:s.borderLeft},panelRect:box(p)};
    });
    if(captures)await page.screenshot({path:join(captures,key+'-g-bottom.png'),animations:'disabled'});
    if(!measureOnly){
     if(data.overlapArea>1)failures.push(key+' 안내 겹침 '+data.overlapArea);
     if(member && (!data.toastMarker||data.toastVisible))failures.push(key+' 첫 순간 안내를 둘러보기에서 숨기지 않음');
     if(!data.focus||!data.focusVisible||data.outline.style==='none'||parseFloat(data.outline.width)<2)
      failures.push(key+' 키보드 초점 표시 사라짐 '+JSON.stringify(data.outline));
     if(data.outline.black)failures.push(key+' 검은 외곽선 남음 '+JSON.stringify(data.outline));
     if(data.scrollMax-data.scrollTop>1)failures.push(key+' 카드 목록을 맨 아래까지 스크롤하지 못함');
     if(member){
      const ordinary=await page.evaluate(()=>{
       const t=document.querySelector('#toast');
       t.toggleAttribute('data-lt-first-moment-intro',false);
       return getComputedStyle(t).display!=='none';
      });
      if(!ordinary)failures.push(key+' 다른 일반 알림까지 숨겨짐');
     }
    }
    records.push({key,width,height,theme,account:member?'member':'guest',...data});
    console.log('MEASURE',JSON.stringify({key,area:data.overlapArea,hitCards:data.overlappedCards,
     toast:data.toastVisible,tag:data.toastMarker,outline:data.outline,focus:data.focusVisible}));
   }finally{await ctx.close();}
  }
  if(captures)await writeFile(join(captures,'measurements.json'),JSON.stringify(records,null,2));
  if(!measureOnly)assert.deepEqual(failures,[],failures.join('\n'));
 }finally{await browser.close();await new Promise(ok=>server.close(ok));}
});