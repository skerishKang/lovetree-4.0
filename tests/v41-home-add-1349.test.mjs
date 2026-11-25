import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRED = process.env.LT_HOME_ADD_1349_REQUIRE === '1';
let chromium, unavailable = '';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) unavailable = '화면 시험용 브라우저가 없습니다.';
} catch { unavailable = '화면 시험용 브라우저가 없습니다.'; }
if (!existsSync(new URL('../dist/v41/home.html', import.meta.url))) unavailable = '화면 빌드가 없습니다.';

const moment = i => ({
  subject: '시험 트리', title: '시험 순간 ' + i, date: '2026-11-' + String(i).padStart(2,'0'),
  emotion: '설렘', note: '화면 누름 검증', url: ''
});
function workspace() {
  let tree=createTree(moment(1),'2026-11-01T00:00:00.000Z');
  for (let i=2;i<=4;i++) tree=addMoment(tree,moment(i),tree.moments[0].id, '2026-11-' + String(i).padStart(2,'0') + 'T00:00:00.000Z');
  return { revision:1,state:{version:1,trees:[tree],prefs:{displayName:'화면 검증'}} ,
    subject:'test-1349',writeSubjectBound:true,savedAt:'2026-11-25T00:00:00.000Z'};
}
function checkInput(hit,expected) {
  assert.equal(hit,expected, '포인터로 직접 누른 결과가 위 순간 추가 경로와 일치합니다.');
}
test('#1349 가운데 순간 추가: 390·1440 × 밤·정원 × 로그인·방문자에서 마우스·터치 입력', {
  skip: !REQUIRED ? '화면 전용 검사로 따로 실행합니다.' : false,
  timeout: 300000
},async t=>{
  if (unavailable) return assert.fail(unavailable);
  const server=await serve({});
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  try {
    for(const member of [false,true]) for(const width of [390,1440]) for(const theme of ['night','garden']) {
      for(const input of ['mouse','touch']) {
        const caseName=(member?'로그인':'방문자')+' '+width+' '+theme+' '+input;
        if(process.env.LT_HOME_1349_CASE && caseName!==process.env.LT_HOME_1349_CASE)continue;
        await t.test(caseName,async()=>{
          const context=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:input==='touch',isMobile:input==='touch',reducedMotion:'reduce'});
          try {
            await context.addInitScript(theme=>localStorage.setItem('lt41.theme',theme),theme);
            await context.route('**/*',async route=>{
              const u=new URL(route.request().url());
              if(u.pathname.includes('/auth/login')) return route.fulfill({status:200,contentType:'text/html',body:'<title>로그인</title><main>로그인 안내</main>'});
              if(u.origin!==base) return route.abort();
              if(u.pathname==='/api/workspace' && member) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace())});
              if(u.pathname.startsWith('/api/')) return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'});
              return route.continue();
            });
            const page=await context.newPage();
            await page.goto(base+'/v41/'+(member?'?account=1':'')+'#home');
            if(member) {
              await page.waitForFunction(()=>!!window.LT41?.trees?.length);
              const intro=page.locator('#discover-ask');
              await intro.waitFor({state:'visible',timeout:6000}).catch(()=>{});
              if(await intro.isVisible()){
                await page.locator('#discover-ask-no').click();
                await intro.waitFor({state:'hidden',timeout:5000});
              }
            }
            // 누르기 전에 셸이 로그인 기록·쓰기 권한을 다 받고 무대 준비 가리개가 내려가기를 기다린다.
            // 이 신호가 없으면 단추가 보인 뒤 셸 상태가 바뀌며 프레임이 다시 그려질 수 있어 누름이 사라진다.
            if(member)await page.waitForFunction(()=>document.body.dataset.member==='in'&&window.LT41?.writable===true&&document.getElementById('stage-loading')?.hidden===true);
            const frame=page.frameLocator('#view');
            const button=member?frame.locator('.home-add-top'):frame.locator('.center .actions button').first();
            await button.waitFor({state:'visible',timeout:15000});
            const box=await button.boundingBox();
            assert.ok(box && box.width>=44 && box.height>=35,'가운데 버튼이 실제로 보입니다.');
            assert.equal(await button.evaluate(el=>{
              const rect=el.getBoundingClientRect(),root=el.getRootNode();
              return root.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===el;
            }),true,'단추 중심에 다른 궤도·카드 층이 걸리지 않습니다.');
            // 프레임 안 단추를 눌러 누름 순간에 대상을 다시 찾는다. 좌표만 기억해 두면 다시 그리기 뒤 낡은 자리를 누를 수 있다.
            if(input==='mouse')await button.click();
            else await button.tap();
            if(member){
              await page.waitForFunction(()=>document.getElementById('write-panel')?.open===true,null,{timeout:4500});
              checkInput(await page.locator('#write-panel').evaluate(e=>e.open),true);
            }else{
              await page.waitForURL(url=>url.pathname.includes('/auth/login'),{timeout:5000});
              assert.ok((await page.url()).includes('/auth/login'),'방문자는 로그인 안내 화면으로 이동합니다.');
            }
          }finally{await context.close();}
        });
      }
    }
  }finally{await browser.close();await new Promise(r=>server.close(r));}
});
