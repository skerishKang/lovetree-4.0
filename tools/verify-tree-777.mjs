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
// The links belong only on the home screen; never allow them over a tree stage or status bar.
async function auditBottom(p,w,tag){
 const m=await p.evaluate(()=>{
  const links=document.querySelector('.home-links');
  const iframe=[...document.querySelectorAll('#stage iframe')].find(f=>f.getClientRects().length&&f.contentWindow?.__LT_TREE_VIEW__);
  const doc=iframe?.contentDocument;
  const local=iframe?.getBoundingClientRect();
  const region=(selector)=>{const el=doc?.querySelector(selector);if(!el||!local)return null;const r=el.getBoundingClientRect();return {left:local.left+r.left,top:local.top+r.top,right:local.left+r.right,bottom:local.top+r.bottom};};
  const stage=region('#stage'),footer=region('.ts-footer');
  const linkVisible=!!links&&getComputedStyle(links).display!=='none'&&links.getClientRects().length>0;
  const r=linkVisible?links.getBoundingClientRect():null;
  const lb=r?{left:r.left,top:r.top,right:r.right,bottom:r.bottom}:null;
  const intersects=(a,b)=>!a||!b?0:Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  const fab=document.querySelector('#mobile-add');
  return {linksVisible:linkVisible,linksFooterOverlap:intersects(lb,footer),linksStageOverlap:intersects(lb,stage),fabVisible:!!fab&&getComputedStyle(fab).display!=='none'&&fab.getClientRects().length>0,footerTop:footer?.top,stageBottom:stage?.bottom};
 });
 console.log(JSON.stringify({bottomAudit:tag,w,...m}));
 assert.equal(m.linksVisible,false,tag+': tree view must not render home-only links');
 assert.equal(m.linksFooterOverlap,0,tag+': links/status row overlap 0');
 assert.equal(m.linksStageOverlap,0,tag+': links/tree canvas overlap 0');
 if(w===390)assert.equal(m.fabVisible,false,tag+': mobile floating add must not obscure branches');
 return m;
}
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
 // Capture the normal returning-visitor state instead of a first-tree introduction modal.
 await ctx.addInitScript(id=>localStorage.setItem('lt41.discoverAsked',JSON.stringify([id])),tree.id);
 await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
 await ctx.route('**/api/workspace**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,state,subject:'tree-test',writeSubjectBound:true,savedAt:'2026-11-18T09:00:00Z'})}));
 await ctx.route('**/api/media/*.webp',r=>{const id=r.request().url().split('/').at(-1).replace('.webp','');const at=tree.moments.findIndex(m=>m.id===id);const pic=dataset(n)[at]?.thumb;return pic?r.fulfill({path:'dist'+pic,contentType:'image/webp'}):r.fulfill({status:404});});
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/v41/?account=1#my/tree',{waitUntil:'load'});
 await p.waitForFunction(()=>!!window.LT41?.tree,{},{timeout:15000});
 await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>f.checkVisibility()&&f.contentWindow?.__LT_TREE_VIEW__?.perf.firstPaintMs!=null),{},{timeout:15000});
 await p.waitForTimeout(300);
 assert.equal(await p.locator('#discover-ask[open]').count(),0,'returning-visitor screenshots must not have introduction dialog');
 const f=p.frames().find(f=>f.url().includes('track61-tree.html'));
 const r=await f.evaluate(()=>{const {state,perf}=window.__LT_TREE_VIEW__,l=state.layout,stage=document.querySelector('#stage').getBoundingClientRect(),footer=document.querySelector('.ts-footer').getBoundingClientRect(),bar=document.querySelector('.lt-screen-toolbar').getBoundingClientRect();const boxes=[...document.querySelectorAll('.ts-card,.ts-chip')].map(x=>x.getBoundingClientRect());let overlap=0,clip=0;for(let i=0;i<boxes.length;i++){const b=boxes[i];if(b.left<stage.left-.5||b.right>stage.right+.5||b.top<stage.top-.5||b.bottom>stage.bottom+.5)clip++;for(let j=0;j<i;j++){const a=boxes[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)overlap++;}}return {total:l.total,visible:l.visible,edges:l.edges.length,ribbons:state.ribbons.size,first:perf.firstPaintMs,draw:perf.firstBuildMs,overlap,clip,footerGap:footer.top-stage.bottom,barGap:stage.top-bar.bottom,images:document.querySelectorAll('.ts-thumb img').length,theme:document.documentElement.dataset.ltTheme||'night'};});
 console.log(JSON.stringify({w,theme,n,run,...r,errors}));assert.deepEqual(errors,[]);assert.equal(r.total,n);assert.equal(r.overlap,0);assert.equal(r.clip,0);assert.equal(r.edges,r.ribbons);assert.ok(r.footerGap>=-.5&&r.barGap>=-.5);assert.equal(r.theme,theme);assert.ok(r.images>0);samples.push(r);
 if(run===0){
 await auditBottom(p,w,n+'-'+w+'-'+theme+'-fit');
 // Exclude the transient success toast from the before/after layout evidence.
 await p.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.hidden=true;t.classList.remove('show');t.style.display='none';}});
 await p.screenshot({path:out+'/'+n+'-'+w+'-'+theme+'-fit.png'});
 await f.locator('#goRoot').click();await f.waitForFunction(()=>document.querySelector('#stage').dataset.lod==='near');
 await auditBottom(p,w,n+'-'+w+'-'+theme+'-root');
 await p.screenshot({path:out+'/'+n+'-'+w+'-'+theme+'-root.png'});
 const card=f.locator('.ts-card.is-root');assert.equal(await card.locator('.ts-title').evaluate(e=>getComputedStyle(e).fontSize),'11px');const id=await card.getAttribute('data-id');await card.click();await f.locator('#treeDetail[open]').waitFor();await f.locator('#openMoment').click();await p.waitForFunction(id=>location.hash.includes('/book')&&window.LT41?.momentId===id,id,{timeout:10000});
 }
 }finally{await ctx.close();}
 }results.push({w,theme,n,samples});await writeFile(out+'/results.json',JSON.stringify(results,null,2));
}}finally{await browser.close();await new Promise(r=>server.close(r));}
