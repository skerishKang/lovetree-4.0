import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serve } from './helpers/screen-audit.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const root='test-results/1425-impl';
mkdirSync(root,{recursive:true});
const host=String.raw`<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0} iframe{border:0;width:100vw;height:100vh;display:block}</style><script>
const params=new URLSearchParams(location.search), count=Number(params.get('count')||5), source=params.get('source')||'server';
const moments=Array.from({length:count},(_,i)=>({id:String(i+1),parentId:i?String(i):null,title:'기억 '+(i+1),date:'2026-11-28',emotion:'기쁨',note:'전시 보기 시험 기록 '+(i+1),createdAt:'2026-11-28T01:00:00.000Z',url:''}));
const tree={id:'test-tree',title:'전시 시험 트리',moments,edges:[]};
window.LT41={source,writable:source==='server',tree,momentId:count?'1':null,prefs:{titleDisplay:'both'}};
</script><iframe title="전시" src="/v41/views/exhibit/exhibit.html"></iframe></html>`;
test('#1425 헤드리스 16개 조합과 200개 CPU 6배 측정', {timeout:120000}, async () => {
const server=await serve({'/1425-host.html':host},{port:4630});
const browser=await chromium.launch({headless:true});
const results=[];
try {
 const sizes=[[390,844],[844,390],[1440,900],[2560,1440]];
 for(const [width,height] of sizes)for(const theme of ['night','garden'])for(const source of ['server','share']){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:4630/1425-host.html?count=5&source='+source);
  await page.evaluate(theme=>localStorage.setItem('lt41.theme',theme),theme);
  await page.reload();
  const f=page.frameLocator('iframe');
  await f.locator('#exCount').waitFor({timeout:10000});
  await f.locator('.ex-node.is-active').waitFor({timeout:10000});
  const info=await f.locator('body').evaluate(body=>({overflow:document.documentElement.scrollWidth-innerWidth,buttons:[...document.querySelectorAll('button')].filter(el=>!el.hidden&&getComputedStyle(el).display!=='none').filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&r.width<44||r.height&&r.height<44}).map(el=>el.id||el.className).slice(0,8),count:document.getElementById('exCount').textContent,readonly:window.LTDEMO.readOnly,nodes:document.querySelectorAll('.ex-node').length}));
  await f.locator('body').screenshot({path:root+'/'+width+'x'+height+'-'+theme+'-'+source+'.png'});
  results.push({width,height,theme,source,...info,errors});
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:4630/1425-host.html?count=200');
 const frame=page.frameLocator('iframe');
 await frame.locator('.ex-node.is-active').waitFor();
 const first=await frame.locator('#exCount').textContent();
 await frame.locator('#stage').focus();await page.keyboard.press('ArrowRight');
 await frame.locator('#exCount').waitFor({state:'visible'});
 await page.waitForTimeout(350);
 const second=await frame.locator('#exCount').textContent();
 const nodes=await frame.locator('.ex-node').count();
 let perf={};
 const session=await page.context().newCDPSession(page);
 await session.send('Emulation.setCPUThrottlingRate',{rate:6});
 await frame.locator('body').evaluate(()=>{window.__LT_EXHIBIT_VIEW__.perf.frames=[];});
 for(let i=0;i<30;i++){await frame.locator('body').evaluate((element,i)=>window.__LT_EXHIBIT_VIEW__.goTo(i),i);await page.waitForTimeout(45);}
 await page.waitForTimeout(800);
 perf=await frame.locator('body').evaluate(()=>{const f=window.__LT_EXHIBIT_VIEW__.perf.frames.filter(x=>Number.isFinite(x)&&x>0);return {frames:f.length,avg:f.reduce((a,b)=>a+b,0)/Math.max(1,f.length),max:Math.max(...f),nodes:document.querySelectorAll('.ex-node').length,scenes:document.querySelectorAll('.ex-scene').length};});
 await session.send('Emulation.setCPUThrottlingRate',{rate:1});
 results.push({test:'200',first,second,nodes,perf});
 await page.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
writeFileSync(root+'/results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

assert.equal(results.filter(row=>row.width).length,16);
for(const row of results.filter(row=>row.width)){assert.equal(row.overflow,0,JSON.stringify(row));assert.deepEqual(row.errors,[]);assert.equal(row.count,'01 / 05');assert.equal(row.readonly,row.source==='share');}
const large=results.find(row=>row.test==='200');assert.equal(large.second,'002 / 200');assert.ok(large.nodes>0 && large.nodes<=19);assert.ok(large.perf.frames>0 && large.perf.nodes>0 && large.perf.nodes<=19);
});
