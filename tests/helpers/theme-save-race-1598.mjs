// #1598: member theme choice survives delayed/failed writes and rapid screen changes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './screen-audit.mjs';
import { createTree } from '../../public/v41/domain.mjs';

const now='2026-11-28T00:00:00Z';
const field={subject:'시험',title:'모의 순간',note:'시험',emotion:'설렘',date:'2026-11-28',url:''};
const trees=Array.from({length:4},(_,i)=>({...createTree({...field,title:'시험 트리 '+i},now),id:'test-theme-tree-'+i}));
const screens=[['shelf','track32-bookshelf'],['tree','track61-tree'],['book','track59-sketchbook'],['board','track58-pinboard'],['network','track56-network']];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function checkThemeSaveRace() {
  const server=await serve({}, {port:Number(process.env.LT_TEST_PORT||0)});
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  const reports=[];
  try {
    for(const mode of ['delay','failure','offline','remote','guest']){
      const guest=mode==='guest';
      let state={version:1,trees:structuredClone(trees),prefs:{theme:'night',shelfView:'carousel',titleDisplay:'both'}},revision=2,puts=0,completed=0;
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
      await context.addInitScript(isGuest=>{
        if(window!==window.top)return;
        try {
          if(!sessionStorage.getItem('race1598-seeded')) {
            sessionStorage.setItem('race1598-seeded','1');
            localStorage.setItem('lt41.theme',isGuest?'garden':'night');
          }
        } catch {}
      },guest);
      await context.route('**/api/**',async route=>{
        const req=route.request(),url=new URL(req.url());
        if(url.pathname==='/api/workspace') {
          if(req.method()==='GET') return route.fulfill(guest?{status:401,json:{error:{code:'unauthenticated'}}}:{status:200,json:{revision,state,subject:'race-member',writeSubjectBound:true,savedAt:now}});
          if(req.method()==='PUT'){
            puts++;
            const sent=req.postDataJSON();
            if(mode==='delay')await sleep(3000);
            completed++;
            if(mode==='failure')return route.fulfill({status:500,json:{error:{code:'unavailable'}}});
            if(mode==='offline')return route.abort('internetdisconnected');
            if(sent.expectedRevision!==revision)return route.fulfill({status:409,json:{error:{code:'revision_conflict'},currentRevision:revision}});
            state=sent.state;revision++;
            return route.fulfill({status:200,json:{ok:true,revision,writeSubjectBound:true}});
          }
        }
        if(url.pathname==='/api/account')return route.fulfill(guest?{status:401,json:{error:{code:'unauthenticated'}}}:{status:200,json:{ok:true,email:'member@example.invalid',subject:'race-member'}});
        if(url.pathname==='/api/shares')return route.fulfill({status:200,json:{shares:[]}});
        return route.fulfill({status:200,json:{ok:true,items:[],shares:[]}});
      });
      const page=await context.newPage();
      try{
        if(guest){
          await page.goto(origin+'/v41/#home',{waitUntil:'domcontentloaded'});
          await page.waitForFunction(()=>document.documentElement.dataset.ltTheme==='garden');
          assert.equal(await page.evaluate(()=>localStorage.getItem('lt41.theme')),'garden');
          await page.evaluate(()=>{location.hash='#shelf'});
          await page.waitForTimeout(250);
          assert.equal(await page.evaluate(()=>localStorage.getItem('lt41.theme')),'garden');
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.ltTheme),'garden');
          assert.equal(puts,0,'로그아웃 상태에서 계정 저장을 요청하지 않는다');
          reports.push({mode,theme:'garden',puts});
          continue;
        }
        await page.goto(origin+'/v41/?account=1#my/shelf',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.LT41?.prefs?.theme==='night',null,{timeout:20000});
        let expected='garden';
        if(mode==='remote'){
          state={...state,prefs:{...state.prefs,theme:'garden'}};revision++;
          await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
          await page.waitForFunction(()=>window.LT41?.prefs?.theme==='garden',{timeout:10000});
        }else{
          await page.locator('#theme-toggle').click();
          await page.waitForFunction(()=>document.documentElement.dataset.ltTheme==='garden');
        }
        for(const [view,file] of screens){
          await page.evaluate(name=>{location.hash='#my/'+name},view);
          await page.waitForFunction(target=>{
            const f=document.getElementById('view');
            try{return f&&!f.hidden&&f.contentWindow?.location?.href.includes(target)&&f.contentDocument?.readyState==='complete'}catch{return false}
          },file,{timeout:20000});
          const values=await page.evaluate(()=>{
            const f=document.getElementById('view');
            return {
              shell:document.documentElement.dataset.ltTheme||'night',
              inside:f.contentDocument.documentElement.dataset.ltTheme||'night',
              device:localStorage.getItem('lt41.theme'),
              chosen:window.LT41?.prefs?.theme,
              bodyBackground:getComputedStyle(f.contentDocument.body).backgroundColor
            };
          });
          assert.equal(values.shell,expected,mode+'/'+view+' 셸');
          assert.equal(values.inside,expected,mode+'/'+view+' 안쪽');
          assert.equal(values.device,expected,mode+'/'+view+' 기기');
          assert.equal(values.chosen,expected,mode+'/'+view+' 회원 선택');
          reports.push({mode,view,...values});
        }
        if(mode==='delay'||mode==='failure'||mode==='offline'){
          // 기존 저장 시작 대기(900ms)와 3초 지연 이후, 실제 응답 도착을 기준으로 검증한다.
          const deadline=Date.now()+10000;
          while(completed===0&&Date.now()<deadline)await sleep(100);
          assert.equal(completed,1,mode+' 모의 저장 응답 완료');
          await page.evaluate(()=>{location.hash='#my/shelf'});
          await page.waitForFunction(()=>document.getElementById('view')?.contentWindow?.location?.href.includes('track32-bookshelf'),null,{timeout:20000});
          const result=await page.evaluate(()=>({
            shell:document.documentElement.dataset.ltTheme||'night',
            inside:document.getElementById('view').contentDocument.documentElement.dataset.ltTheme||'night',
            stored:localStorage.getItem('lt41.theme'),
            selected:window.LT41?.prefs?.theme,
            feedback:document.getElementById('save-feedback')?.textContent?.trim()||''
          }));
          for(const key of ['shell','inside','stored','selected'])assert.equal(result[key],'garden',mode+'/'+key);
          if(mode==='delay')assert.equal(state.prefs.theme,'garden','늦은 계정 저장이 완료되어야 한다');
          else{
            assert.equal(state.prefs.theme,'night','실패한 저장은 서버를 변경하지 않는다');
            assert.ok(result.feedback.length>0,mode+' 실패 안내가 기존 규칙대로 보여야 한다');
          }
          assert.equal(puts,1,mode+' 저장 시도');
          assert.equal(completed,1,mode+' 저장 응답');
          reports.push({mode,afterSave:true,...result,puts,completed});
        }else{
          assert.equal(puts,0,'다른 기기 변경을 로컬 PUT으로 덮어쓰지 않는다');
        }
      }finally{await context.close()}
    }
    return reports;
  }finally{
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
