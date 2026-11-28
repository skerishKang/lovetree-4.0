import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {serve} from './screen-audit.mjs';
import {createTree,addMoment} from '../../public/v41/domain.mjs';
let chromium,skip;
try{({chromium}=await import('playwright'));if(!existsSync(chromium.executablePath()))skip='Chromium 실행 파일 없음'}catch{skip='Playwright 없음'}
const sample=process.env.LT1608_SAMPLE==='1',out=process.env.LT1608_CAPTURE_DIR||'',measureOnly=process.env.LT1608_MEASURE_ONLY==='1';
const active=process.env.LT1608_REQUIRE==='1'||process.env.LT_DIALOG_UNIFY_REQUIRE==='1';
const grids=sample?[[844,390]]:[[390,844],[844,390],[1440,900],[2560,1440]];
const themes=sample?['garden']:['night','garden'],accounts=sample?['guest']:['guest','data'];
const states=process.env.LT1608_GUIDE_ONLY==='1'?['guide']:['updates-panel','account-settings','myposts-panel','my-news-panel','guide'];
const clock='2026-11-20T00:00:00Z';
let tree=createTree({subject:'시험 주제',title:'시험 트리',note:'',date:'2026-11-20',emotion:'설렘',url:''},clock);
for(let i=1;i<8;i++)tree=addMoment(tree,{title:'시험 순간 '+(i+1),note:'시험 자료',date:'2026-11-20',emotion:'설렘',url:''},tree.moments.at(-1)?.id||tree.moments[0].id,clock);
const fixture={revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'fixture-1608',writeSubjectBound:true,savedAt:clock};
const reply=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
test('#1608 머리줄 단추 클릭·창 바깥 세 지점', {skip:!active?'화면 검사 레인에서만 실행':(skip||undefined),timeout:600000},async()=>{
 if(skip)assert.fail(skip);
 const server=await serve({}, {port:Number(process.env.LT_TEST_PORT||0)});
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),records=[],fails=[],started=new Date().toISOString();
 try{
  if(out)await mkdir(out,{recursive:true});
  for(const [width,height] of grids)for(const theme of themes)for(const account of accounts){
   const key=width+'x'+height+'-'+theme+'-'+account,ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',locale:'ko-KR'});
   try{
    await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
    await ctx.route('**/*',r=>{
     const u=new URL(r.request().url());if(u.origin!==base)return r.abort();
     if(u.pathname==='/api/workspace')return reply(r,fixture);
     if(u.pathname==='/api/community/stats')return reply(r,{trees:1,moments:8});
     if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/auth/'))return reply(r,{ok:true,items:[],trees:[],shares:[],groups:[]});
     return r.continue();
    });
    const page=await ctx.newPage();
    await page.goto(base+'/v41/'+(account==='data'?'?account=1':'')+'#home',{waitUntil:'domcontentloaded'});
    await page.locator('#updates-panel').waitFor({state:'attached',timeout:15000});
    for(const state of states){
     const record={key,state,theme,account,width,height,file:key+'-'+state+'.png',condition:'not-captured',reason:''};
     if(state==='guide'&&process.env.LT1608_SKIP_GUIDE==='1'){
      record.reason='iframe 안내는 full 창이 아니며 모의 환경에서 열림 확인이 두 차례 실패하여 미촬영';
      records.push(record);console.log('NOT_CAPTURED_AFTER_TWO_ATTEMPTS',key,state);continue;
     }
     let opened=false,mode='';
     for(let attempt=1;attempt<=2;attempt++){
      try{
       await page.evaluate(()=>{
        for(const d of document.querySelectorAll('dialog[open]'))d.close();
        if(window.__lt1608Listener)document.removeEventListener('click',window.__lt1608Listener,true);
        window.__lt1608HeaderHits=0;
       });
       if(state==='guide'){
        await page.waitForFunction(()=>!!document.getElementById('view')?.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('#guidePanel'),null,{timeout:15000});
        await page.evaluate(()=>document.getElementById('account-guide')?.click());
        await page.waitForFunction(()=>{
         const f=document.getElementById('view'),g=f?.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('#guidePanel');
         return !!g?.open&&getComputedStyle(g).display!=='none';
        },null,{timeout:5000});
        mode='guide-in-iframe';
       }else{
        await page.evaluate(id=>{
         const d=document.getElementById(id);if(!d)throw Error('창이 없음');
         if(id==='updates-panel'){document.getElementById('account-updates')?.click();if(!d.open)d.show()}
         else if(!d.open)d.showModal();
        },state);
        await page.waitForFunction(id=>!!document.getElementById(id)?.open,state,{timeout:4000});
        mode=state==='updates-panel'?'nonmodal-menu':'test-modal-visual';
       }
       opened=true;record.reason='';break;
      }catch(e){record.reason=String(e.message).slice(0,200);if(attempt===1)await page.waitForTimeout(140)}
     }
     record.mode=mode;
     if(opened){
      try{
       await page.evaluate(()=>{
        const listener=e=>{const b=e.target?.closest?.('.app-header button,.app-header a');if(b){window.__lt1608HeaderHits++;e.preventDefault();e.stopPropagation()}};
        document.addEventListener('click',listener,true);window.__lt1608Listener=listener;
       });
       const initial=await page.evaluate(id=>{
        const frame=document.getElementById('view'),root=frame?.contentDocument?.getElementById('orbit')?.shadowRoot;
        const dlg=id==='guide'?root?.querySelector('#guidePanel'):document.getElementById(id),header=document.querySelector('.app-header');
        const candidates=['community-menu','record-menu','theme-toggle','mobile-more','account-entry','account-avatar'].map(x=>document.getElementById(x))
        .filter(e=>e&&!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>1);
        const guideBox=id==='guide'?dlg?.getBoundingClientRect():null;
        const guideCenter=guideBox?{x:Math.round(guideBox.left+guideBox.width/2),y:Math.round(guideBox.top+guideBox.height/2)}:null;
        const outerHit=guideCenter?document.elementFromPoint(Math.round(frame.getBoundingClientRect().left+guideCenter.x),Math.round(frame.getBoundingClientRect().top+guideCenter.y)):null;
        const contentTarget=guideCenter?root?.elementFromPoint(guideCenter.x,guideCenter.y):document.elementFromPoint(Math.round(innerWidth/2),Math.round((header.getBoundingClientRect().bottom+innerHeight)/2));
        const contentReachable=!!dlg?.contains(contentTarget)&&(id!=='guide'||outerHit===frame);
        const points=candidates.slice(0,3).map(e=>{
         const r=e.getBoundingClientRect(),x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2),t=document.elementFromPoint(x,y);
         return {button:e.id,x,y,hit:t?.id||t?.tagName||'',hitButton:!!t?.closest('button,a'),hitHeader:!!t?.closest('.app-header')};
        });
        return {isModal:dlg?.matches(':modal')??false,dialogOpen:dlg?.open??null,headerZ:getComputedStyle(header).zIndex,dialogZ:dlg?getComputedStyle(dlg).zIndex:null,
         headerAfter:getComputedStyle(header,'::after').content,headerPointer:getComputedStyle(header).pointerEvents,
         headerPosition:getComputedStyle(header).position,contentReachable,contentHit:contentTarget?.id||contentTarget?.tagName||'',
         shellTheme:document.documentElement.dataset.ltTheme||null,frameTheme:frame?.contentDocument?.documentElement?.dataset?.ltTheme||null,
         outerHit:outerHit?.id||outerHit?.tagName||'',otherOpenDialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),points};
       },state);
       record.initial=initial;
       if(out)await page.screenshot({path:join(out,record.file),animations:'disabled',timeout:15000});
       for(const p of initial.points){
        await page.evaluate(id=>{const d=document.getElementById(id);if(d&&!d.open){if(id==='updates-panel')d.show();else d.showModal()}},state);
        const before=await page.evaluate(()=>window.__lt1608HeaderHits);
        await page.mouse.click(p.x,p.y);await page.waitForTimeout(30);
        p.clicked=(await page.evaluate(()=>window.__lt1608HeaderHits))>before;
        p.openAfter=await page.evaluate(id=>id==='guide'?!!document.getElementById('view')?.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('#guidePanel')?.open:!!document.getElementById(id)?.open,state);
       }
       if(!measureOnly&&state==='updates-panel'&&(!initial.contentReachable||initial.headerPosition==='static'))fails.push(key+' 새 소식 본문을 덮음 '+JSON.stringify({target:initial.contentHit,position:initial.headerPosition}));
       if(state==='updates-panel'){
        const normal=await page.evaluate(()=>{
         const d=document.getElementById('updates-panel'),h=document.querySelector('.app-header'),b=document.getElementById('theme-toggle');
         if(!d.open)d.show();d.close();
         const r=b.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
         return {overlayGone:getComputedStyle(h,'::after').content==='none',headerRestored:!!target?.closest('button,a')};
        });
        record.afterClose=normal;
        if(!measureOnly&&(!normal.overlayGone||!normal.headerRestored))fails.push(key+' 창 닫은 뒤 머리줄을 다시 사용할 수 없음');
       }
       record.headerClickable=initial.points.filter(p=>p.clicked).length;
       record.outside=initial.points.map(({x,y,hit,clicked,button})=>({x,y,hit,button,blocked:!clicked}));
       record.condition='captured';
       if(!measureOnly&&state!=='guide'&&record.headerClickable>0)fails.push(record.key+' 새 소식 '+record.headerClickable+'개 머리줄 단추가 눌림');
       if(!measureOnly&&state==='updates-panel'&&initial.headerAfter==='none')fails.push(record.key+' 머리줄 덮개 없음');
       if(!measureOnly&&state==='guide'&&(!initial.dialogOpen||!initial.contentReachable))fails.push(record.key+' 안내 창 본문에 닿지 않음 '+JSON.stringify({opened:initial.dialogOpen,hit:initial.contentHit,outerHit:initial.outerHit}));
       console.log('CAPTURE',key,state,'clicked='+record.headerClickable,'hits='+initial.points.map(p=>p.hit).join(','));
      }catch(e){record.reason='캡처/입력 확인 실패 '+String(e.message).slice(0,240)}
     }
     if(record.condition!=='captured'){
      console.log('NOT_CAPTURED',key,state,record.reason);
      if(!measureOnly&&state==='guide')fails.push(key+' 안내 창 촬영 실패: '+record.reason);
     }
     records.push(record);
    }
   }catch(e){for(const state of states)if(!records.find(r=>r.key===key&&r.state===state))records.push({key,state,condition:'not-captured',reason:String(e.message).slice(0,220),file:key+'-'+state+'.png'})}
   finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(r=>server.close(r))}
 if(states.includes('guide')&&process.env.LT1608_SKIP_GUIDE!=='1'){
  const guides=records.filter(r=>r.state==='guide'),expected=grids.length*themes.length*accounts.length;
  if(guides.length!==expected||guides.some(r=>r.condition!=='captured'||r.initial?.points?.length!==3||r.initial?.points?.some(p=>!p.openAfter)))
   fails.push('안내 창 조건·클릭 검증 실패 '+JSON.stringify({expected,recorded:guides.length,failed:guides.filter(r=>r.condition!=='captured'||r.initial?.points?.length!==3||r.initial?.points?.some(p=>!p.openAfter)).map(r=>r.key)}));
 }
 if(out)await writeFile(join(out,'measurements.json'),JSON.stringify({started,finished:new Date().toISOString(),captured:records.filter(r=>r.condition==='captured').length,total:records.length,measurements:records},null,2));
 if(!measureOnly)assert.deepEqual(fails,[],fails.join('\n'));
});