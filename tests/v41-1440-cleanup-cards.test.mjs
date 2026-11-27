import test from 'node:test';

import {serve} from './helpers/screen-audit.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {clickToolbarTreeChoice} from './helpers/tree-picker-pr3.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const require1440 = process.env.LT_1440_REQUIRE === '1';
test('#1440 순간 정리 방식 선택과 조작', {skip: !require1440 ? '전용 브라우저 검사에서 실행' : undefined, timeout:240000}, async t => {
const {chromium} = await import('playwright');
const port=Number(process.env.LT1440_PORT || 4548);
const server=await serve({}, {port}), base='http://127.0.0.1:'+port;
let browser;
const out=process.env.LT1440_CAPTURE_DIR;if(out) await fs.mkdir(out,{recursive:true});
const clock='2026-11-18T00:00:00Z', input=(title)=>({subject:title,title,note:'',emotion:'설렘',date:'2026-11-18',url:''});
let box=createTree(input('모아둔 순간'),clock);
for(const title of ['바다 무대','새벽 연습실','여행의 기록'])box=addMoment(box,input(title),box.moments[0].id,clock);
box.inbox=true;
const other=createTree(input('우리의 이야기'),clock), third=createTree(input('추억'),clock);
try {
browser=await chromium.launch({headless:true,args:['--disable-gpu']});
for(const width of [1440,390,1024,700,701])for(const theme of ['night','garden']) await t.test(width+' '+theme, async()=>{
const narrow=width<=700||width===1024;
const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},hasTouch:width===390||width===1024,isMobile:width===390,reducedMotion:'reduce'});
const state={version:1,trees:[box,other,third],prefs:{}};
await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);},theme);
await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
await ctx.route('**/api/**',r=>r.fulfill({status:200,json:{ok:true,items:[]}}));
await ctx.route('**/api/workspace**',r=>r.fulfill({status:200,json:{revision:1,state,subject:'fixture',writeSubjectBound:true,savedAt:clock}}));
const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGEERROR',String(e)));
try{
await p.goto(base+'/v41/?account=1',{waitUntil:'load',timeout:60000});
await p.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
await p.locator('#discover-ask-no').click({timeout:1000}).catch(()=>{});
const settings=async()=>{
  await p.locator('#account-avatar').click();
  await p.locator('#account-open-settings').click();
  await p.locator('#account-settings[open]').waitFor({timeout:10000});
  const choices=p.locator('#settings-cleanup-choices button');
  if(!await choices.first().isVisible()){
    const tabs=p.locator('#account-settings [role=tab]');
    for(let i=0;i<await tabs.count();i++){await tabs.nth(i).click();if(await choices.first().isVisible())break;}
  }
  return choices;
};
let choices=await settings();
assert.equal(await choices.first().getAttribute('aria-checked'),'true');
await choices.nth(1).click();
assert.equal(await p.evaluate(()=>localStorage.getItem('lt41.cleanupView')),'cards');
await p.reload({waitUntil:'load',timeout:60000});
await p.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
choices=await settings();
assert.equal(await choices.nth(1).getAttribute('aria-checked'),'true');
await choices.first().click();
await p.reload({waitUntil:'load',timeout:60000});
await p.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
choices=await settings();
assert.equal(await choices.first().getAttribute('aria-checked'),'true');
await choices.nth(1).click();
await p.reload({waitUntil:'load',timeout:60000});
await p.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
await clickToolbarTreeChoice(p);
await p.locator('[data-tree-action=cleanup]').click({timeout:10000});
await p.locator('#cleanup-panel[open]').waitFor({timeout:10000});
assert.equal(await p.locator('#cleanup-panel').getAttribute('data-cleanup-cards'),'');
const check=p.locator('#cleanup-moments input');
await check.nth(1).check();await check.nth(2).check();
const shot=async name=>{await p.evaluate(()=>document.fonts.ready);if(out) await p.screenshot({path:out+'/'+width+'-'+theme+'-'+name+'.png',animations:'disabled'});};
await shot('source');
assert.equal(await p.evaluate(()=>matchMedia('(max-width: 700px), (pointer: coarse)').matches),narrow);
assert.equal(await p.locator('#cleanup-move-box').isVisible(),!narrow);
if(narrow){
await p.locator('#cleanup-move').click();
assert.equal(await p.locator('#cleanup-pick').isVisible(),false);
await shot('targets');await p.locator('#cleanup-back').click();
assert.equal(await p.locator('#cleanup-moments input:checked').count(),2);
await p.locator('#cleanup-move').click();
await p.goBack();
await p.locator('#cleanup-pick').waitFor({timeout:10000});
assert.equal(await p.locator('#cleanup-moments input:checked').count(),2);
await p.locator('#cleanup-move').click();
}
if(!narrow){
await p.locator('.cleanup-card-action').first().focus();
await p.keyboard.press('Enter');
}else await p.locator('.cleanup-card-action').first().click();
await p.locator('.cleanup-local-notice:not([hidden])').waitFor({timeout:10000});
assert.equal(await p.locator('#cleanup-moments input').count(),2);
await shot('moved');
await p.locator('.cleanup-local-notice button').click();
assert.equal(await p.locator('#cleanup-moments input').count(),4);
await check.nth(1).check();await check.nth(2).check();
await p.locator('#cleanup-copy').click();
await p.locator('#cleanup-targets input').first().check();
await p.locator('#cleanup-copy-finish').click();
await p.locator('.cleanup-local-notice:not([hidden])').waitFor({timeout:10000});
assert.equal(await check.count(),4);
await shot('copied');
await p.locator('.cleanup-local-notice button').click();
if(!narrow){
await check.nth(1).check();await check.nth(2).check();
await p.locator('#cleanup-moments .cleanup-moment').nth(1).dragTo(p.locator('#cleanup-targets .cleanup-target').first());
await p.locator('.cleanup-local-notice:not([hidden])').waitFor({timeout:10000});
assert.equal(await check.count(),2);
await shot('drag');await p.locator('.cleanup-local-notice button').click();
assert.equal(await check.count(),4);
}
for(const mode of ['move','copy']){
await check.nth(1).check();await check.nth(2).check();
await p.locator('#cleanup-'+mode).click();
await p.locator('#cleanup-new-card').click();
await p.locator('#cleanup-new-name').fill('새로운 기록');
await shot('new-'+mode);
await p.locator('#cleanup-create').click();
await p.locator('.cleanup-local-notice:not([hidden])').waitFor({timeout:10000});
assert.equal(await check.count(),mode==='move'?2:4);
assert.ok(await p.evaluate(()=>window.LT41.trees.some(t=>t.subject==='새로운 기록')));
await p.locator('.cleanup-local-notice button').click();
assert.equal(await check.count(),4);
assert.ok(await p.evaluate(()=>!window.LT41.trees.some(t=>t.subject==='새로운 기록')));
}
if(width===1440){
  await p.locator('button.close[data-close=cleanup-panel]').click();
  const choices=await settings();
  await p.evaluate(()=>{
    const get=Storage.prototype.getItem, set=Storage.prototype.setItem;
    Storage.prototype.getItem=function(key){if(key==='lt41.cleanupView')throw new DOMException('blocked','SecurityError');return get.call(this,key)};
    Storage.prototype.setItem=function(key,value){if(key==='lt41.cleanupView')throw new DOMException('blocked','SecurityError');return set.call(this,key,value)};
  });
  await choices.first().click();
  assert.equal(await choices.first().getAttribute('aria-checked'),'true');
  assert.equal(await p.evaluate(()=>LT41_THEME_REGISTRY.readCleanupView()),'classic');
  const notice=p.locator('#settings-cleanup-storage-note');
  assert.equal(await notice.isVisible(),true);
  assert.match(await notice.textContent(),/이번 접속에서만/);
  await p.locator('button.close[data-close=account-settings]').click();
  await clickToolbarTreeChoice(p);
  await p.locator('[data-tree-action=cleanup]').click();
  assert.equal(await p.locator('#cleanup-panel').getAttribute('data-cleanup-cards'),null);
  await p.locator('button.close[data-close=cleanup-panel]').click();
  const again=await settings();
  await again.nth(1).click();
  assert.equal(await again.nth(1).getAttribute('aria-checked'),'true');
  assert.equal(await p.evaluate(()=>LT41_THEME_REGISTRY.readCleanupView()),'cards');
  assert.equal(await notice.isVisible(),true);
  await p.locator('button.close[data-close=account-settings]').click();
  await clickToolbarTreeChoice(p);
  await p.locator('[data-tree-action=cleanup]').click();
  assert.equal(await p.locator('#cleanup-panel').getAttribute('data-cleanup-cards'),'');
}
console.log('PASS',width,theme);
}catch(e){if(out) await p.screenshot({path:out+'/'+width+'-'+theme+'-failure.png'}).catch(()=>{});throw e;}
finally{await ctx.close()}
});
}finally{await browser?.close();await new Promise(r=>server.close(r))}

});
