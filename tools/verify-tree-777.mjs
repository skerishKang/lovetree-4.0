import {chromium} from 'playwright';
import {serve} from '../tests/helpers/screen-audit.mjs';
import {dataset} from '../tests/fixtures/tree-777-data.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.LT_TREE_SHOT_DIR || 'tmp/tree-777';await mkdir(out,{recursive:true});
const server=await serve();const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const results=[];
function fixture(n){
 const list=dataset(n);const first=list[0];let tree=createTree({subject:'777',title:first.title,note:'',emotion:first.emotion,date:first.date,url:''},'2026-11-18T00:00:00Z');
 const ids=new Map([[first.id,tree.moments[0].id]]);
 for(const m of list.slice(1)){tree=addMoment(tree,{title:m.title,note:'',emotion:m.emotion,date:m.date,url:''},ids.get(m.parentId),'2026-11-18T00:00:00Z');ids.set(m.id,tree.moments.at(-1).id);}
 // Serve the same example images through the actual private photo URL contract.
 const reverse=new Map([...ids].map(([a,b])=>[b,list.find(m=>m.id===a)]));
 for(const m of tree.moments)if(reverse.get(m.id)?.thumb)m.url=origin+'/api/media/'+m.id+'.webp';
 return tree;
}
try{for(const w of [1440,390])for(const theme of ['night','garden'])for(const n of [10,40,120]){
 const samples=[];
 for(let run=0;run<(n===120?5:1);run++){
 const ctx=await browser.newContext({viewport:{width:w,height:w===390?844:900},reducedMotion:'reduce'});
 try{
 await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t)},theme);
 const tree=fixture(n);const state={version:1,trees:[tree],prefs:{}};
 await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
 await ctx.route('**/api/workspace**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,state,subject:'tree-test',writeSubjectBound:true,savedAt:'2026-11-18T09:00:00Z'})}));
 await ctx.route('**/api/media/*.webp',r=>{const id=r.request().url().split('/').at(-1).replace('.webp','');const at=tree.moments.findIndex(m=>m.id===id);const pic=dataset(n)[at]?.thumb;return pic?r.fulfill({path:'dist'+pic,contentType:'image/webp'}):r.fulfill({status:404});});
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/v41/?account=1#my/tree',{waitUntil:'load'});
 await p.waitForFunction(()=>!!window.LT41?.tree,{},{timeout:15000});
 await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.checkVisibility()&&f.contentWindow?.__LT_TREE_VIEW__?.perf.firstPaintMs!=null),{},{timeout:15000});
 if(await p.locator('#discover-ask[open]').count())await p.locator('#discover-ask-no').click({timeout:5000});
 const f=p.frames().find(f=>f.url().includes('track61-tree.html'));
 const r=await f.evaluate(()=>{const {state,perf}=window.__LT_TREE_VIEW__,l=state.layout,stage=document.querySelector('#stage').getBoundingClientRect(),footer=document.querySelector('.ts-footer').getBoundingClientRect(),bar=document.querySelector('.lt-screen-toolbar').getBoundingClientRect();const boxes=[...document.querySelectorAll('.ts-card,.ts-chip')].map(x=>x.getBoundingClientRect());let overlap=0,clip=0;for(let i=0;i<boxes.length;i++){const b=boxes[i];if(b.left<stage.left-.5||b.right>stage.right+.5||b.top<stage.top-.5||b.bottom>stage.bottom+.5)clip++;for(let j=0;j<i;j++){const a=boxes[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)overlap++;}}return {total:l.total,visible:l.visible,edges:l.edges.length,ribbons:state.ribbons.size,first:perf.firstPaintMs,draw:perf.firstBuildMs,overlap,clip,footerGap:footer.top-stage.bottom,barGap:stage.top-bar.bottom,images:document.querySelectorAll('.ts-thumb img').length,theme:document.documentElement.dataset.ltTheme||'night'};});
 console.log(JSON.stringify({w,theme,n,run,...r,errors}));assert.deepEqual(errors,[]);assert.equal(r.total,n);assert.equal(r.overlap,0);assert.equal(r.clip,0);assert.equal(r.edges,r.ribbons);assert.ok(r.footerGap>=-.5&&r.barGap>=-.5);assert.equal(r.theme,theme);assert.ok(r.images>0);samples.push(r);
 if(run===0){
 await p.screenshot({path:out+'/'+n+'-'+w+'-'+theme+'-fit.png'});
 await f.locator('#goRoot').click();await f.waitForFunction(()=>document.querySelector('#stage').dataset.lod==='near');
 await p.screenshot({path:out+'/'+n+'-'+w+'-'+theme+'-root.png'});
 const card=f.locator('.ts-card.is-root');assert.equal(await card.locator('.ts-title').evaluate(e=>getComputedStyle(e).fontSize),'11px');const id=await card.getAttribute('data-id');await card.click();await f.locator('#treeDetail[open]').waitFor();await f.locator('#openMoment').click();await p.waitForFunction(id=>location.hash.includes('/book')&&window.LT41?.momentId===id,id,{timeout:10000});
 }
 }finally{await ctx.close();}
 }results.push({w,theme,n,samples});await writeFile(out+'/results.json',JSON.stringify(results,null,2));
}}finally{await browser.close();await new Promise(r=>server.close(r));}
