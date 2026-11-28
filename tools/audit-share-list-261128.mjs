import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {serve} from '../tests/helpers/screen-audit.mjs';
import {createTree,addMoment} from '../public/v41/domain.mjs';
import {clickToolbarTreeChoice} from '../tests/helpers/tree-picker-pr3.mjs';

const phase=process.env.LT_SHARE_AUDIT_PHASE||'before';
const dir=process.env.LT_SHARE_AUDIT_DIR;
if(!dir)throw new Error('LT_SHARE_AUDIT_DIR missing');
mkdirSync(dir,{recursive:true});
const input=i=>({subject:'시험 트리',title:'공유 목록 검증 순간 '+String(i+1),date:'2026-11-28',emotion:'설렘',note:'시험 서버에서만 보이는 가짜 기록입니다.',url:''});
let tree=createTree(input(0));
for(let i=1;i<4;i++)tree=addMoment(tree,input(i),tree.moments[0].id);
const shareId=i=>'share-'+String(i).padStart(20,'0');
const shares=Array.from({length:55},(_,i)=>({
  id:shareId(54-i),treeId:tree.id,view:i%3===0?'board':i%3===1?'book':'network',
  status:'active',origin:'owner',createdAt:new Date(Date.UTC(2026,10,28,0,0,0)+(54-i)*1000).toISOString(),
  discoverable:false,momentCount:4
}));
const server=await serve();
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
try{
for(const theme of ['night','garden'])for(const [width,height] of [[390,844],[1440,900]]){
  const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  try{
    await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
    await ctx.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.origin!==base)return route.abort();
      if(u.pathname==='/api/workspace')return route.fulfill({status:200,json:{revision:1,subject:'audit-share-member',writeSubjectBound:true,savedAt:'2026-11-28T00:00:00.000Z',state:{version:1,trees:[tree],prefs:{theme}}}});
      if(u.pathname==='/api/account')return route.fulfill({status:200,json:{ok:true,email:'tester@example.invalid',subject:'audit-share-member'}});
      if(u.pathname==='/api/shares'&&route.request().method()==='GET'){
        const cursor=u.searchParams.get('cursor');
        return route.fulfill({status:200,json:cursor==null
          ?{shares:shares.slice(0,50),...(phase==='after'?{nextCursor:'page-2'}:{})}
          :{shares:shares.slice(50),nextCursor:null}});
      }
      if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,json:{ok:true,items:[]}});
      return route.continue();
    });
    const page=await ctx.newPage();
    await page.goto(base+'/v41/?account=1#shelf');
    await page.waitForFunction(()=>window.LT41?.trees?.length===1&&!document.querySelector('#account-avatar')?.hidden);
    await clickToolbarTreeChoice(page);
    await page.locator('[data-tree-action="share"]').click();
    await page.locator('#share-panel[open] .share-item').first().waitFor();
    const modal=page.locator('#share-panel');
    const suffix=width+'-'+theme;
    await modal.evaluate(e=>e.scrollTop=0);
    await page.screenshot({path:join(dir,phase+'-'+suffix+'-top.png'),animations:'disabled'});
    await modal.evaluate(e=>e.scrollTop=e.scrollHeight);
    await page.screenshot({path:join(dir,phase+'-'+suffix+'-bottom.png'),animations:'disabled'});
    const first=await page.evaluate(()=>({rows:document.querySelectorAll('#share-list>.share-item').length,more:[...document.querySelectorAll('#share-list>button')].map(b=>({label:b.textContent,height:b.getBoundingClientRect().height})),scrollWidth:document.querySelector('#share-panel').scrollWidth,clientWidth:document.querySelector('#share-panel').clientWidth}));
    let expanded=null;
    if(phase==='after'){
      const more=page.locator('#share-list>button').filter({hasText:'더 보기'});
      await more.waitFor();
      await more.click();
      await page.waitForFunction(()=>document.querySelectorAll('#share-list>.share-item').length===55);
      await modal.evaluate(e=>e.scrollTop=e.scrollHeight);
      await page.screenshot({path:join(dir,phase+'-'+suffix+'-expanded-bottom.png'),animations:'disabled'});
      expanded=await page.evaluate(()=>({rows:document.querySelectorAll('#share-list>.share-item').length,more:document.querySelectorAll('#share-list>button').length,oldRevoke:!!document.querySelector('#share-list>.share-item:last-of-type .share-item-actions button:last-child'),scrollWidth:document.querySelector('#share-panel').scrollWidth,clientWidth:document.querySelector('#share-panel').clientWidth}));
      assert.equal(expanded.rows,55);
      assert.equal(expanded.more,0);
      assert.ok(expanded.oldRevoke);
      assert.ok(first.more.every(b=>b.height>=44));
    }
    console.log('SHARE_AUDIT',JSON.stringify({phase,width,theme,first,expanded}));
    assert.ok(first.scrollWidth<=first.clientWidth+1);
    if(expanded)assert.ok(expanded.scrollWidth<=expanded.clientWidth+1);
  }finally{await ctx.close();}
}
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
