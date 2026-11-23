// #1204: measure post-load CLS in both the shell and the orbit iframe.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const MAIN=process.env.LT_HOME_1204_MAIN_DIST;
const CURRENT=fileURLToPath(new URL('../../dist',import.meta.url));
assert.ok(MAIN,'LT_HOME_1204_MAIN_DIST must point at the built main dist');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
async function serve(root){
 const app=createServer(async(req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true,"items":[]}');return;}
  for(const candidate of [path.resolve(root,'.'+name),path.resolve(root,'.'+name,'index.html')]){
   if(!candidate.startsWith(path.resolve(root)+path.sep))continue;
   try{if(!(await stat(candidate)).isFile())continue;res.writeHead(200,{'Content-Type':MIME[path.extname(candidate)]||'application/octet-stream'});createReadStream(candidate).pipe(res);return;}catch{}
  }
  res.writeHead(404);res.end();
 });
 await new Promise(ok=>app.listen(0,'127.0.0.1',ok));
 return {app,base:'http://127.0.0.1:'+app.address().port};
}
const collect=()=>({cls:window.__ltHome1204CLS?.cls??null,shifts:window.__ltHome1204CLS?.shifts??[]});
async function snapshot(browser,server,width,theme){
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'no-preference'});
 await ctx.addInitScript(theme=>{
  try{localStorage.setItem('lt41.theme',theme);}catch{}
  const record=window.__ltHome1204CLS={cls:0,shifts:[]};
  try{new PerformanceObserver(list=>{
   for(const e of list.getEntries())if(!e.hadRecentInput){record.cls+=e.value;record.shifts.push({at:e.startTime,value:e.value});}
  }).observe({type:'layout-shift',buffered:true});}catch{}
 },theme);
 try{
  const page=await ctx.newPage();await page.goto(server.base+'/v41/',{waitUntil:'load'});
  const frame=page.frameLocator('#view');
  await frame.locator('#orbit').waitFor({state:'attached',timeout:20000});
  await frame.locator('.center .actions').waitFor({state:'visible',timeout:20000});
  await page.waitForTimeout(2500);
  const shell=await page.evaluate(collect);
  const inner=await frame.locator('#orbit').evaluate(()=>({cls:window.__ltHome1204CLS?.cls??null,shifts:window.__ltHome1204CLS?.shifts??[]}));
  return {shell,inner};
 }finally{await ctx.close();}
}
const before=await serve(path.resolve(MAIN)),after=await serve(CURRENT);
const browser=await chromium.launch({headless:true});
let failures=[];
try{
 for(const [width,theme] of [[1440,'night'],[1440,'garden'],[390,'night'],[390,'garden']]){
  const old=await snapshot(browser,before,width,theme);
  const next=await snapshot(browser,after,width,theme);
  const beforeTotal=old.shell.cls+old.inner.cls,afterTotal=next.shell.cls+next.inner.cls;
  const record={width,theme,before:{shell:old.shell.cls,inner:old.inner.cls,total:beforeTotal},after:{shell:next.shell.cls,inner:next.inner.cls,total:afterTotal}};
  console.log(JSON.stringify(record));
  if(afterTotal>beforeTotal+0.0001)failures.push(record);
 }
 assert.deepEqual(failures,[],'#1204: CLS must not regress relative to main');
}finally{await browser.close();before.app.close();after.app.close();}
