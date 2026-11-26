import { chromium } from 'playwright';
import { createTree, addMoment } from './dist/v41/domain.mjs';
const base=process.env.CAP_BASE||'http://127.0.0.1:4013';
const label=process.env.CAP_LABEL||'after';
let tree=createTree({subject:'시험 대상',title:'영상 순간',date:'2026-11-20',emotion:'설렘',note:'검수용',url:'https://www.youtube.com/watch?v=abc123DEF45'},'2026-11-20T00:00:00.000Z');
for(let i=2;i<=4;i+=1)tree=addMoment(tree,{subject:'시험 대상',title:'순간 '+i,date:'2026-11-0'+i,emotion:'설렘',note:'검수용',url:''},tree.moments[0].id,'2026-11-0'+i+'T00:00:00.000Z');
const workspace={revision:1,state:{version:1,trees:[tree],prefs:{}},subject:'qa-1435-fake',writeSubjectBound:true,savedAt:'2026-11-25T00:00:00.000Z'};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [390,1440])for(const theme of ['night','garden']){
  const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce'});
  await ctx.addInitScript(t=>{try{localStorage.setItem('lt41.theme',t)}catch{}},theme);
  await ctx.route('**://i.ytimg.com/**',r=>r.abort());
  await ctx.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;if(p==='/api/workspace')return r.fulfill({status:200,json:workspace});if(p==='/api/account')return r.fulfill({status:200,json:{ok:true,email:'qa@example.invalid',subject:'qa-1435-fake',admin:false,confirmKind:'phrase'}});return r.fulfill({status:200,json:{ok:true,items:[]}})});
  const page=await ctx.newPage();
  await page.goto(base+'/v41/?account=1#home',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.body.dataset.member==='in',null,{timeout:20000});
  await page.locator('#discover-ask-no').click().catch(()=>{});
  await page.waitForTimeout(1500);
  await page.screenshot({path:`caps/${label}-${width}-${theme}-home.png`,animations:'disabled'});
  await page.locator('#account-avatar').click();
  await page.screenshot({path:`caps/${label}-${width}-${theme}-menu.png`,animations:'disabled'});
  await page.locator('#account-open-settings').click();
  await page.waitForSelector('#account-settings[open]');
  await page.screenshot({path:`caps/${label}-${width}-${theme}-settings.png`,animations:'disabled'});
  console.log('CAP '+label+' '+width+' '+theme);
  await ctx.close();
 }
}finally{await browser.close()}
