// #1580: 시험 계정·모의 API만 사용하는 화면 치수와 전후 캡처. npm test 자동 실행 대상 아님.
import {chromium} from 'playwright';
import {serve} from './helpers/screen-audit.mjs';
import {clickToolbarTreeChoice} from './helpers/tree-picker-pr3.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const out=process.env.LT_1580_CAPTURE||fileURLToPath(new URL('../.captures-1580',import.meta.url));
const phase=process.env.LT_1580_PHASE||'before';
const port=Number(process.env.LT_TEST_PORT||4500);
const viewports=[[390,844],[844,390],[1440,900],[2560,1440]];
const themes=['night','garden'];
const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
mkdirSync(path.join(out,phase),{recursive:true});
let a=createTree({subject:'모아둔 순간',title:'디자인 점검 트리',note:'처음 본 날',date:'2026-11-26',emotion:'설렘',url:'https://www.youtube.com/watch?v=gdZLi9oWNZg'},'2026-11-26T00:00:00Z');
a.inbox=true;
for(let i=1;i<7;i++)a=addMoment(a,{title:'순간 '+i,note:'공연을 기억해요',date:'2026-11-26',emotion:'설렘',url:''},a.moments[0].id,'2026-11-26T00:00:0'+i+'Z');
const b=createTree({subject:'다른 트리',title:'다른 기록 트리',note:'다른 곳',date:'2026-11-26',emotion:'위로',url:''},'2026-11-26T00:00:00Z');
function workspace(one){return {revision:1,state:{version:1,trees:one?[a]:[a,b],prefs:{}},subject:'member-1580',writeSubjectBound:true,savedAt:'2026-11-26T09:00:00Z'};}
const server=await serve({}, {port});
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const results=[];
async function newPage(viewport,theme,one){
 const context=await browser.newContext({viewport: {width:viewport[0],height:viewport[1]},colorScheme:'dark',reducedMotion:'reduce'});
 await context.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1');},theme);
 let puts=0;
 await context.route('**://i.ytimg.com/**',route=>route.fulfill({status:200,contentType:'image/png',body:tiny}));
 await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
 await context.route('**/api/workspace**',route=>{
  if(route.request().method()==='PUT'){puts++;return route.fulfill({status:400,contentType:'application/json',body:'{"error":{"code":"test_save_failed","message":"시험용 저장 실패 응답"}}'});}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(workspace(one))});
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/v41/?account=1',{waitUntil:'load'});
 await page.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
 return {page,context,puts:()=>puts,errors};
}
function measure(page,screen){
 return page.evaluate((screen)=>{
  const root=document.querySelector(screen);
  if(!root||!root.open)return {error:'not-open'};
  const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),bottom:Math.round(r.bottom),right:Math.round(r.right)}};
  const shown=e=>{if(!e)return false;const r=e.getBoundingClientRect();const css=getComputedStyle(e);return r.width>0&&r.height>0&&css.display!=='none'&&css.visibility!=='hidden'&& !e.hidden;};
  const children=[...root.querySelectorAll('button,input,select,textarea,a')].filter(shown);
  const controls=children.filter(e=>e.matches('button,a,input:not([type=radio]):not([type=checkbox]),select,textarea'));
  const smallControls=controls.filter(e=>{const r=e.getBoundingClientRect();return r.height<43.5||r.width<43.5}).map(e=>e.id||e.getAttribute('aria-label')||e.textContent.trim().slice(0,30));
  const fonts=[...root.querySelectorAll('*')].filter(e=>shown(e) && [...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize)>0 && parseFloat(getComputedStyle(e).fontSize)<11.99);
  const smallFonts=fonts.map(e=>({name:e.id||e.className||e.tagName,px:parseFloat(getComputedStyle(e).fontSize),text:e.textContent.trim().slice(0,24)}));
  function rgb(s){const m=String(s).match(/rgba?\(([^)]+)\)/);if(!m)return null;let a=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);return {r:a[0],g:a[1],b:a[2],a:a.length>3?a[3]:1};}
  function linear(v){const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}
  function lum(c){return .2126*linear(c.r)+.7152*linear(c.g)+.0722*linear(c.b)}
  function contrast(id){const el=root.querySelector(id);if(!el)return null;const color=rgb(getComputedStyle(el).color);let bg=null;for(let p=el;p;p=p.parentElement){const c=rgb(getComputedStyle(p).backgroundColor);if(c && c.a>.95){bg=c;break;}}if(!color||!bg)return null;const values=[lum(color),lum(bg)].sort((a,b)=>b-a);return Math.round(((values[0]+.05)/(values[1]+.05))*100)/100;}
  const foot=root.querySelector(screen==='#write-panel'?'.editor-bottom':screen==='#cleanup-panel'?'.panel-foot':'.button-row');
  const error=root.querySelector('#form-error');
  const pop=rect(root),footer=rect(foot),err=rect(error);
  const within=footer&&pop?footer.y>=pop.y&&footer.bottom<=pop.bottom+1:false;
  return {popup:pop,footer,footerFirstView:within,error:err,errorText:error?.textContent||'',errorVisible:shown(error)&&err&&err.y>=pop.y&&err.bottom<=pop.bottom,
   smallControlCount:smallControls.length,smallControls,smallFontCount:smallFonts.length,smallFonts,
   contrast:{deleteMoment:contrast('#delete-moment'),deleteTree:contrast('#tree-delete'),cleanupMove:contrast('#cleanup-move'),formError:contrast('#form-error')},
   coverTextCut:[...root.querySelectorAll('#tree-design .cover-design-name')].filter(shown).map(e=>({label:e.textContent,cut:e.scrollWidth>e.clientWidth+1})),
   inputBorders:[...root.querySelectorAll('#tree-form input[name=title],#tree-form input[name=subject]')].map(el=>getComputedStyle(el).borderColor)};
 },screen);
}
async function screenshot(page,name){await page.screenshot({path:path.join(out,phase,name+'.png'),animations:'disabled',timeout:30000});}
async function run(){
 for(const vp of viewports)for(const theme of themes){
  const key=vp[0]+'x'+vp[1]+'-'+theme;
  const h=await newPage(vp,theme,false);
  try{
   if(await h.page.locator('#write-menu').isVisible()) await h.page.locator('#write-menu').click();
   else await h.page.evaluate(()=>document.getElementById('write-menu')?.click());
   if(await h.page.locator('#write-detailed').isHidden())await h.page.locator('#write-tab-detailed').click();
   await h.page.locator('#write-detailed:not([hidden])').waitFor();
   await h.page.waitForTimeout(80);
   const detailed=await measure(h.page,'#write-panel');
   await screenshot(h.page,key+'-detailed');
   // 서버가 돌려준 '저장 실패' 시험 응답도 받고, 입력 검증 오류를 화면 안내로 연결한다.
   const failure=await h.page.evaluate(async()=>{
      const dialog=document.querySelector('#write-panel');
      const form=document.querySelector('#moment-form');
      const input=form.elements.url;
      document.querySelector('#media-change-toggle').click();
      input.value='not-a-valid-video-url';
      form.onsubmit?.({preventDefault(){},target:form});
      const response=await fetch('/api/workspace',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({probe:true})});
      const body=await response.json();
      // 서버의 모의 실패 문구를 폼 오류 위치에 직접 넣어 위치·가림을 계측하는 시각 시험.
      if(!response.ok)document.getElementById('form-error').textContent=body.error?.message||'시험용 저장 실패 응답';
      return {status:response.status,body};
   });
   const error=await measure(h.page,'#write-panel');
   await screenshot(h.page,key+'-failure');
   results.push({key,scenario:'detailed',...detailed,puts:h.puts(),errors:h.errors});
   results.push({key,scenario:'failure',testResponse:failure,...error});
  }catch(e){results.push({key,scenario:'detailed',error:String(e)});}
  finally{await h.context.close()}
  const h2=await newPage(vp,theme,false);
  try{
   await clickToolbarTreeChoice(h2.page);
   await h2.page.locator('[data-tree-action="manage"]').click();
   await h2.page.locator('#tree-manager[open]').waitFor();
   await h2.page.locator('#tree-form input[name="coverMode"][value="design"]').check({force:true});
   await h2.page.locator('#tree-design').scrollIntoViewIfNeeded();
   let value=await measure(h2.page,'#tree-manager');
   await screenshot(h2.page,key+'-tree');
   results.push({key,scenario:'tree',...value});
  }catch(e){results.push({key,scenario:'tree',error:String(e)});}
  finally{await h2.context.close()}
  const h3=await newPage(vp,theme,true);
  try{
   await clickToolbarTreeChoice(h3.page);
   await h3.page.locator('[data-tree-action="cleanup"]').click();
   await h3.page.locator('#cleanup-panel[open]').waitFor();
   const noTarget=h3.page.locator('#cleanup-target-empty');
   if(await noTarget.count() && await noTarget.isVisible())await noTarget.scrollIntoViewIfNeeded();
   let value=await measure(h3.page,'#cleanup-panel');
   value.emptyTargetText=(await noTarget.count()) ? await noTarget.textContent() : '';
   value.emptyTargetVisible=(await noTarget.count()) ? await noTarget.isVisible() : false;
   await screenshot(h3.page,key+'-cleanup');
   results.push({key,scenario:'cleanup',...value});
  }catch(e){results.push({key,scenario:'cleanup',error:String(e)});}
  finally{await h3.context.close()}
  console.log('FINISHED',key,results.filter(x=>x.key===key).map(x=>x.scenario+':'+(x.error||x.footerFirstView)).join(' '));
 }
}
try{await run()}finally{await browser.close();server.close();}
const file=path.join(out,phase,'metrics.json');writeFileSync(file,JSON.stringify({phase,at:new Date().toISOString(),results},null,2));
console.log('METRICS',file);
