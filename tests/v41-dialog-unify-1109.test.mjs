import {clickToolbarTreeChoice,treeChoiceExpanded,treeChoiceFocused} from './helpers/tree-picker-pr3.mjs';
// #1109: 정리 창과 순간 목록 창의 닫기 단추·뒤 덮개·390 크기를 같게, 정리 창 아래 단추는 스크롤 끝에서 보이게.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';
import {askAppConfirm} from '../public/v41/confirm.mjs';

const REQUIRE = process.env.LT_DIALOG_UNIFY_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = '화면 시험용 브라우저가 없어 건너뜀';
} catch { skip = '화면 시험용 브라우저가 없어 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 건너뜀';

function sampleTree() {
  let tree = createTree({ subject: '정리 시험', title: '정리 시험', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
  tree.inbox = true;
  for (let i = 1; i < 12; i += 1) {
    tree = addMoment(tree, { title: `순간 ${i + 1}`, note: '', emotion: '설렘', date: '2026-11-20', url: '' }, tree.moments[0].id, `2026-11-20T00:00:${String(i).padStart(2, '0')}Z`);
  }
  return tree;
}
const otherTree = () => createTree({ subject: '다른 트리', title: '다른 트리', note: '', emotion: '설렘', date: '2026-11-20', url: '' }, '2026-11-20T00:00:00Z');
const workspace = (tree) => JSON.stringify({ revision: 1, state: { version: 1, trees: [tree, otherTree()], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-20T09:00:00.000Z' });

test('#1541 공용 확인 함수는 앱 확인 창의 Promise를 그대로 쓰고 없으면 취소한다', async () => {
  const saved = globalThis.LT41Confirm;
  const messages = [];
  try {
    globalThis.LT41Confirm = {ask: async message => { messages.push(message); return true; }};
    assert.equal(await askAppConfirm('확인 문구'), true);
    globalThis.LT41Confirm = {ask: async () => false};
    assert.equal(await askAppConfirm('취소 문구'), false);
    delete globalThis.LT41Confirm;
    assert.equal(await askAppConfirm('창 없음'), false);
    assert.deepEqual(messages, ['확인 문구']);
  } finally {
    if (saved === undefined) delete globalThis.LT41Confirm;
    else globalThis.LT41Confirm = saved;
  }
});

test('#1541 v41 제품 코드에 브라우저 기본 확인 창 호출이 남지 않는다', () => {
  const root = fileURLToPath(new URL('../public/v41/', import.meta.url));
  const files = readdirSync(root, {recursive: true}).filter(file => /\.(?:js|mjs|html)$/.test(file));
  const hits = files.flatMap(file => {
    const source = readFileSync(join(root, file), 'utf8');
    return [...source.matchAll(/\bconfirm\s*\(/g)].map(match => ({file, line: source.slice(0, match.index).split('\n').length}));
  });
  assert.deepEqual(hits, []);
});

test('#1541 앱 확인 창은 취소 초점·Enter 확인·Esc 취소·바깥 누름 취소를 따른다', {skip: skip || undefined}, async (t) => {
  if (skip) { t.skip(skip); return; }
  const server = await serve({'/__confirm1541.html': '<!doctype html><meta charset="utf-8"><script src="/v41/confirm-dialog.js"></script>'});
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/__confirm1541.html`);
    const focused = await page.evaluate(() => { window.__confirmAnswer = LT41Confirm.ask('Enter 확인'); return document.activeElement.id; });
    assert.equal(focused, 'lt-confirm-cancel');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__confirmAnswer), true);
    await page.evaluate(() => { window.__confirmAnswer = LT41Confirm.ask('Esc 취소'); window.__escPropagation = 0; document.addEventListener('keydown', event => { if (event.key === 'Escape') window.__escPropagation += 1; }); });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__confirmAnswer), false);
    assert.equal(await page.evaluate(() => window.__escPropagation), 0);
    await page.evaluate(() => { window.__confirmAnswer = LT41Confirm.ask('바깥 취소'); document.getElementById('lt-confirm').click(); });
    assert.equal(await page.evaluate(() => window.__confirmAnswer), false);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

async function withShell(tree, { width, height, theme, deferred = false, cached = deferred, hash = '' }, fn) {
  const server = await serve({}, {port:Number(process.env.LT_TEST_PORT)||0});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const initial = JSON.parse(workspace(tree));
  initial.subject = 'test-1109';
  let release;
  const response = deferred ? new Promise(resolve => { release = resolve; }) : Promise.resolve(initial);
  try {
    if (cached) await ctx.addInitScript(payload => {
      if (window !== window.top) return;
      localStorage.setItem('lovetree.v41.login-subject', payload.subject);
      localStorage.setItem('lovetree.v41.workspace-cache:' + payload.subject, JSON.stringify({ version: 1, subject: payload.subject, state: payload.state }));
    }, initial);
    await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx.route('**://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
    await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx.route('**/api/workspace**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await response) }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error.message || error)));
    await page.goto(`${base}/v41/?account=1${hash}`, { waitUntil: 'load' });
    if (!deferred || cached) await page.waitForFunction(() => !!window.LT41?.trees?.length, null, { timeout: 20000 });
    // #1495: 예전에는 소개 창 '안 함' 누르기가 첫 화면이 다 뜰 때까지 기다려 줬다 — 그 몫을 첫 화면 순간 목록 단추가 보일 때까지 기다리기로 바꾼다.
    if (!deferred && !hash) await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => !f.hidden && f.getBoundingClientRect().width > 0 && f.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]')), null, { timeout: 20000 });
    await fn({ page, errors, initial, release });
  } finally { release?.(initial); await browser.close(); server.close(); }
}

const closeFacts = (root, selector) => root.locator(selector).evaluate((el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const bd = getComputedStyle(el, '::backdrop');
  return {
    aria: el.getAttribute('aria-label'),
    text: (el.textContent || '').trim(),
    width: Math.round(r.width), height: Math.round(r.height),
    radius: cs.borderTopLeftRadius, font: cs.fontSize,
    backdrop: bd.backgroundColor, blur: bd.backdropFilter,
    dialogWidth: Math.round(el.closest('dialog')?.getBoundingClientRect().width || el.getBoundingClientRect().width)
  };
});

test('#1109 두 창의 닫기 단추·덮개·폭이 같고 정리 창 아래 단추가 보인다', { skip: skip || undefined }, async (t) => {
  if (skip) { t.skip(skip); return; }
  const tree = sampleTree();
  for (const [width, height] of [[1440, 900], [390, 844]]) for (const theme of ['night', 'garden']) {
    await withShell(tree, { width, height, theme }, async ({ page, errors }) => {
      await clickToolbarTreeChoice(page);
      await page.locator('[data-tree-action="cleanup"]').click();
      await page.waitForSelector('#cleanup-panel[open]');
      const cleanup = await closeFacts(page, '#cleanup-panel [data-close="cleanup-panel"]');
      assert.equal(cleanup.aria, '닫기', '정리 창 닫기 단추 이름');
      assert.equal(cleanup.text, '×', '정리 창 닫기 단추 글자');
      // 본문을 맨 아래까지 스크롤해도 주 단추는 화면 안에 남는다.
      await page.locator('#cleanup-panel .cleanup-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await page.waitForTimeout(200);
      const foot = await page.evaluate(() => {
        const ids = ['cleanup-create', 'cleanup-move'];
        return ids.map((id) => {
          const el = document.getElementById(id);
          const r = el.getBoundingClientRect();
          return { id, hidden: !!el.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) };
        });
      });
      for (const b of foot) {
        assert.equal(b.hidden, false, `${b.id} 단추가 숨지 않는다`);
        assert.ok(b.w > 0 && b.h >= 44 && b.top >= 0 && b.bottom <= height, `${width}·${theme}: ${b.id} 단추가 화면 안에 있다 — ${JSON.stringify(b)}`);
      }
      await page.evaluate(() => document.getElementById('cleanup-panel').close());
       await clickToolbarTreeChoice(page);
       await page.locator('[data-tree-action="moments"]').click();
       await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f =>
         !f.hidden && f.getBoundingClientRect().width > 0 && f.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]')),
         null, { timeout: 8000 });

      let frame = null;
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const ok = await f.evaluate(() => document.documentElement.getBoundingClientRect().width > 0 && !!document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]')).catch(() => false);
        if (ok) { frame = f; break; }
      }
      assert.ok(frame, '순간 목록을 든 화면을 찾는다');
      await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=moments],[data-do=index]').click());
      await frame.locator('.orbit-dialog[open]').waitFor({ state: 'attached', timeout: 8000 });
      const list = await closeFacts(frame, '.orbit-dialog button[data-do="close"]');
      assert.equal(list.aria, '닫기', '순간 목록 닫기 단추 이름');
      assert.equal(list.text, '×', '순간 목록 닫기 단추 글자');
      const tail = `${width}·${theme}`;
      assert.deepEqual({ w: list.width, h: list.height, radius: list.radius, font: list.font },
        { w: cleanup.width, h: cleanup.height, radius: cleanup.radius, font: cleanup.font }, `${tail}: 닫기 단추 모양이 같다`);
      assert.equal(list.backdrop, cleanup.backdrop, `${tail}: 뒤 덮개 색이 같다(${list.backdrop} vs ${cleanup.backdrop})`);
      assert.equal(list.blur, cleanup.blur, `${tail}: 뒤 덮개 흐림이 같다`);
      assert.equal(list.dialogWidth, cleanup.dialogWidth, `${tail}: 창 폭이 같다(${list.dialogWidth} vs ${cleanup.dialogWidth})`);
      if (width === 390) assert.equal(cleanup.dialogWidth, 390, '390: 두 창 모두 화면 꽉 참');
      else assert.ok(Math.abs(cleanup.dialogWidth - 900) <= 2, `1440: 두 창 모두 900px 카드(실측 ${cleanup.dialogWidth})`);
      assert.deepEqual(errors, [], `${tail}: 페이지 오류 없음`);
    });
  }
});
async function momentListFrame(page) {
 for (const f of page.frames()) {
  if (f === page.mainFrame()) continue;
  const ok = await f.evaluate(() => document.documentElement.getBoundingClientRect().width > 0 && !!document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]')).catch(() => false);
  if (ok) return f;
 }
 return null;
}

test('#1109 배경 상태 반영을 받아도 순간 목록 창이 열린 채로 남는다', { skip: skip || undefined }, async (t) => {
 if (skip) { t.skip(skip); return; }
 await withShell(sampleTree(), { width: 1440, height: 900, theme: 'night' }, async ({ page, errors }) => {
  const frame = await momentListFrame(page);
  assert.ok(frame, '첫 화면 프레임을 찾는다');
  await frame.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=moments],[data-do=index]').click());
  await frame.locator('.orbit-dialog[open]').waitFor({ state: 'attached', timeout: 8000 });
  await page.evaluate(() => document.getElementById('view').contentWindow.postMessage({ type: 'lt41-trees-saved' }, location.origin));
  await page.waitForTimeout(300);
  const facts = await frame.evaluate(() => {
   const d = document.getElementById('orbit').shadowRoot.querySelector('.orbit-dialog');
   const b = d?.querySelector('button[data-do="close"]');
   const r = b?.getBoundingClientRect();
   return { open: !!d?.open, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0 };
  });
  assert.deepEqual(facts, { open: true, w: 44, h: 44 }, '창이 열린 채이고 닫기 단추 크기가 그대로다');
  assert.deepEqual(errors, [], '페이지 오류 없음');
 });
});

test('#1109 배경 상태 반영은 프레임을 갈지 않고 화면 숫자를 새 값으로 고친다', { skip: skip || undefined }, async (t) => {
 if (skip) { t.skip(skip); return; }
 await withShell(sampleTree(), { width: 1440, height: 900, theme: 'night' }, async ({ page, errors }) => {
  const frame = await momentListFrame(page);
  const before = await frame.evaluate(() => ({ url: location.href, text: [...document.getElementById('orbit').shadowRoot.querySelectorAll('.home-count')].map(n => n.textContent).join('|') }));
  await page.evaluate(() => {
   const tree = window.LT41.trees[0];
   tree.moments.push({ id: 'bg-added', parentId: tree.moments[0].id, title: '다른 기기에서 담은 순간', note: '', emotion: '설렘', date: '2026-11-22', url: '', createdAt: '2026-11-22T00:00:00.000Z' });
  });
  await page.evaluate(() => document.getElementById('view').contentWindow.postMessage({ type: 'lt41-trees-saved' }, location.origin));
  await page.waitForTimeout(300);
  const after = await frame.evaluate(() => ({ url: location.href, text: [...document.getElementById('orbit').shadowRoot.querySelectorAll('.home-count')].map(n => n.textContent).join('|') }));
  assert.equal(after.url, before.url, '프레임 주소가 그대로다(다시 띄우지 않음)');
  assert.notEqual(after.text, before.text, '숫자가 새 상태로 바뀐다');
  assert.deepEqual(errors, [], '페이지 오류 없음');
 });
});

test('#1109 다른 화면으로 가면 기존처럼 프레임이 바뀐다', { skip: skip || undefined }, async (t) => {
 if (skip) { t.skip(skip); return; }
 await withShell(sampleTree(), { width: 1440, height: 900, theme: 'night' }, async ({ page, errors }) => {
  await page.locator('[data-view="track32-bookshelf.html"]').click();
  await page.waitForFunction(() => {
   const f = document.getElementById('view');
   try { return new URL(f.contentWindow.location.href).pathname.endsWith('/track32-bookshelf.html'); } catch { return false; }
  }, null, { timeout: 10000 });
  assert.deepEqual(errors, [], '페이지 오류 없음');
 });
});
test('#1109 저장본 뒤 서버 기록이 도착해도 네 화면은 같은 문서에서 갱신한다', { skip: skip || undefined, timeout: 120000 }, async (t) => {
 if (skip) { t.skip(skip); return; }
 for (const view of ['home','book','board','shelf']) {
  t.diagnostic(view);
  const tree = sampleTree();
  await withShell(tree, { width: 1440, height: 900, theme: 'night', deferred: true, hash: '#my/'+view+'?tree='+tree.id }, async ({ page, errors, initial, release }) => {
   const files={home:'home.html',book:'track59-sketchbook.html',board:'track58-pinboard.html',shelf:'track32-bookshelf.html'};
   await page.waitForFunction(file => {
    const f=document.getElementById('view'),doc=f?.contentDocument;
    return !!f && !f.hidden && !!doc && new URL(doc.URL).pathname.endsWith(file)&&!!(doc.getElementById('orbit')?.shadowRoot?.querySelector('.recent-card')||f.contentWindow?.__TRACK59__||f.contentWindow?.__LT58V11||doc.querySelector('.book-card'));
   }, files[view], {timeout:20000});
   const active=await page.locator('#view').elementHandle();
   const frame=await active.contentFrame();
   const before=await frame.evaluate(view=>{
    window.__sameDocument1109=true;
    if(view==='home'){
     const root=document.getElementById('orbit').shadowRoot;
     const fonts=[...root.querySelectorAll('.recent-head,.recent-change')].map(el=>getComputedStyle(el).fontSize);
     root.querySelector('[data-do=moments],[data-do=index]').click();
     return fonts;
    }
    return [];
   }, view);
   if(view==='home')await frame.locator('.orbit-dialog[open]').waitFor({state:'attached'});
   const changed=structuredClone(initial);
   changed.revision=2;
   changed.state.trees[0]=addMoment(tree,{title:'서버에서 도착한 순간',note:'새 기록',emotion:'설렘',date:'2026-11-22',url:view==='home'?'https://www.youtube.com/watch?v=abcdefghijk':''},tree.moments[0].id,'2026-11-22T00:00:00Z');
   const added=changed.state.trees[0].moments.at(-1).id;
   release(changed);
   await page.waitForFunction(id=>window.LT41?.tree?.moments.some(m=>m.id===id),added,{timeout:20000});
   await frame.waitForFunction(({view,id})=>{
    if(view==='home')return document.getElementById('orbit').shadowRoot.querySelector('.recent-card .recent-title-text')?.textContent==='서버에서 도착한 순간';
    if(view==='book')return window.__TRACK59__?.getState().pageIds.includes(id);
    if(view==='board')return !!document.querySelector('.card[data-id="'+id+'"]');
    return [...document.querySelectorAll('.book-card-meta')].some(el=>el.textContent.includes('13개 순간'));
   },{view,id:added},{timeout:20000});
   assert.equal(await active.getAttribute('id'),'view',view+': 보이는 프레임이 그대로다');
   assert.equal(await frame.evaluate(()=>window.__sameDocument1109),true,view+': 같은 문서다');
   if(view==='home'){
    const after=await frame.evaluate(()=>{
     const root=document.getElementById('orbit').shadowRoot;
     const dialog=root.querySelector('.orbit-dialog');
     const rect=dialog.querySelector('[data-do=close]').getBoundingClientRect();
     return {open:dialog.open,w:Math.round(rect.width),h:Math.round(rect.height),fonts:[...root.querySelectorAll('.recent-head,.recent-change')].map(el=>getComputedStyle(el).fontSize),counts:[...root.querySelectorAll('.home-count')].map(el=>el.textContent).join('|')};
    });
    assert.deepEqual({open:after.open,w:after.w,h:after.h},{open:true,w:44,h:44});
    assert.deepEqual(after.fonts,before,'최근 순간 칩 글자 크기가 그대로다');
    assert.match(after.counts,/순간 14/,'두 트리의 전체 순간 수가 늘었다');
    assert.ok(await frame.locator('.recent-card .recent-thumb').count(),'서버에서 확인한 영상 미리보기도 보인다');
   }
   assert.deepEqual(errors,[],view+': 페이지 오류 없음');
  });
 }
});

test('#1109 저장본이 없는 회원 진입은 서버 응답 전 빈 첫 화면 문서를 열지 않는다', { skip: skip || undefined }, async (t) => {
 if (skip) { t.skip(skip); return; }
 await withShell(sampleTree(), { width: 390, height: 844, theme: 'night', deferred: true, cached: false }, async ({ page, errors, initial, release }) => {
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#view,#view-next')].map(f=>f.contentWindow.location.href)),['about:blank','about:blank'],'기록을 받기 전에는 빈 문서를 먼저 열지 않는다');
  release(initial);
  await page.waitForFunction(()=>!!window.LT41?.trees?.length);
  await page.waitForFunction(()=>!!document.getElementById('view')?.contentDocument?.getElementById('orbit')?.shadowRoot?.querySelector('.recent-card'));
  assert.equal(await page.evaluate(()=>document.getElementById('view-next').contentWindow.location.href),'about:blank','기록으로 처음부터 한 장만 연다');
  assert.deepEqual(errors,[],'페이지 오류 없음');
 });
});

test('#1109 회원 기록 확인 중과 읽기 실패에도 빈 화면 탐색을 유지한다', { skip: skip || undefined }, async (t) => {
 if (skip) { t.skip(skip); return; }
 const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 const states=['empty','delayed','offline','login'];
 try {
  for(const [width,height] of [[1440,900],[390,844]])for(const state of states){
   const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   let release,requested;
   const gate=new Promise(resolve=>{release=resolve});
   const started=new Promise(resolve=>{requested=resolve});
   try {
    await ctx.addInitScript(()=>localStorage.setItem('lt41.theme','garden'));
    await ctx.route('**/*',r=>new URL(r.request().url()).origin===base?r.fallback():r.abort());
    await ctx.route('**/api/**',r=>r.fulfill({status:200,json:{ok:true,items:[]}}));
    await ctx.route('**/api/workspace**',async r=>{
     requested();
     if(state==='delayed'||state==='offline')await Promise.all([gate,new Promise(resolve=>setTimeout(resolve,600))]);
     if(state==='offline')return r.fulfill({status:503,json:{ok:false,code:'unavailable'}});
     if(state==='login')return r.fulfill({status:401,json:{ok:false,code:'unauthenticated'}});
     return r.fulfill({status:200,json:{revision:1,state:{version:1,trees:[],prefs:{}},subject:'test-1109-empty',writeSubjectBound:true,savedAt:'2026-11-22T00:00:00Z'}});
    });
    const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto(`${base}/v41/?account=1`,{waitUntil:'load'});
    await started;
    const facts=async()=>{
     if(width===390&&await page.locator('#header-overflow').isHidden())await page.locator('#mobile-more').click();
     return page.evaluate(()=>{
      const menu=innerWidth<=780,labels=['서재','책','보드','지도'];
      const nodes=[...document.querySelectorAll(menu?'#header-overflow button':'#tree-views button[data-view]')].filter(b=>labels.includes(b.textContent.trim()));
      const nav=document.querySelector('#tree-views');
      return {hidden:nav.hidden,display:getComputedStyle(nav).display,member:document.body.dataset.member,source:document.body.dataset.recordSource,buttons:nodes.map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent.trim(),w:r.width,h:r.height}})};
     });
    };
    const check=async(stage)=>{
     const row=await facts();console.log('# 빈 화면 탐색',width,state,stage,JSON.stringify(row));
     assert.equal(row.hidden,false,`${width}/${state}/${stage}: 회원 탭이 숨지 않는다`);
     assert.equal(row.buttons.length,4);
     assert.ok(row.buttons.every(b=>b.w>0&&b.h>0),JSON.stringify(row.buttons));
    };
    if(state==='delayed'||state==='offline'){
     await check('응답 전');
     assert.equal(await page.locator('#write-menu').isHidden(),true,'확인 전 쓰기 권한 없음');
     assert.equal(await page.locator('#account-avatar').isHidden(),true,'확인 전 계정 표시 없음');
     if(width===390)await page.locator('#header-overflow button').filter({hasText:/^서재$/}).click();
     else await page.locator('#tree-views button[data-view="track32-bookshelf.html"]').click();
     // #1487 결정(2026-11-27): 확인 중에 탭으로 연 안쪽 화면도 주소로 들어올 때처럼 '불러오는 중'을 보이고,
     // 로그인 안내는 확인이 끝난 뒤에만 그린다(응답 뒤 단정은 아래 그대로).
     await page.waitForFunction(()=>!document.getElementById('stage-loading').hidden,null,{timeout:5000});
     assert.equal(await page.locator('#empty').isHidden(),true,'확인 중에는 빈 상태 안내(로그인 안내 포함)를 보이지 않는다');
     assert.equal(await page.evaluate(()=>{const f=document.getElementById('view');try{return f.hidden||!/track32-bookshelf/.test(f.contentWindow.location.pathname);}catch{return true;}}),true,'인증 확인 중에는 개인 기록(서재 화면)을 미리 공개하지 않는다');
     assert.equal(new URL(page.url()).hash,'#shelf','확인 중에도 고른 서재 주소를 남긴다');
     release();
    }
    await page.waitForFunction(wanted=>document.body.dataset.recordSource==='server'&&document.body.dataset.member===wanted,['empty','delayed'].includes(state)?'in':'out');
    if(state==='login'){
     assert.equal(await page.locator('#tree-views').evaluate(e=>e.hidden),false,'인증 실패 후에도 화면 탐색 탭은 유지한다(#1231)');
     continue;
    }
    await check('응답 후');
    if(state==='delayed'||state==='offline'){
     assert.equal(new URL(page.url()).hash,'#shelf','먼저 고른 서재 주소 유지');
     assert.equal(await page.locator('#empty h1').textContent(),state==='offline'?'로그인하면 내 서재가 보여요':'아직 책장이 비어 있어요.');
     assert.equal(await page.locator('#empty-records').textContent(),state==='offline'?'로그인':'＋ 새 트리');
    }
    if(state==='offline')assert.equal(await page.locator('#account-avatar').isHidden(),true,'읽기 실패를 로그인 성공으로 보지 않는다');
   } finally {release();await ctx.close();}
  }
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});


test('#1231 로그아웃 서재·책·보드·지도 빈 상태와 화면별 로그인 복귀(1440·390)', { skip: skip || undefined, timeout: 180000 }, async () => {
 const server=await serve(),base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 const cases=[
  ['서재','track32-bookshelf.html','shelf'],
  ['트리','track61-tree.html','tree'],
  ['책','track59-sketchbook.html','book'],
  ['보드','track58-pinboard.html','board'],
  ['지도','track56-network.html','network']
 ];
 const dest=process.env.LT_1231_CAPTURE_DIR;
 if(dest)mkdirSync(dest,{recursive:true});
 try {
  for(const [width,height] of [[1440,900],[390,844]]){
   const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   try {
    await ctx.addInitScript(()=>localStorage.setItem('lt41.theme','night'));
    await ctx.route('**/api/**',r=>r.fulfill({status:401,json:{ok:false,code:'unauthenticated'}}));
    await ctx.route('**/auth/login?**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>로그인 확인</title>'}));
    const page=await ctx.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/v41/#home`,{waitUntil:'load'});
    // 인증 표시가 먼저 확정되어도 비동기 예시 트리는 뒤늦게 화면을 다시 그릴 수 있다.
    // 예시 데이터까지 준비된 로그아웃 상태에서 탭을 누른다(#1109는 인증 확인 중 탭 유지도 별도로 검사).
    await page.waitForFunction(()=>document.documentElement.dataset.ltAuthPhase==='ready'&&document.documentElement.dataset.ltAuthHint==='out'&&document.body.dataset.member==='out'&&document.body.dataset.recordSource==='example'&&window.LT41?.source==='example'&&document.querySelector('#tree-views')?.hidden===false);
    const initial=await page.evaluate(()=>({member:document.body.dataset.member,views:[...document.querySelectorAll('#tree-views button[data-view]')].map(b=>b.textContent.trim()),header:document.querySelector('.app-header').getBoundingClientRect().height}));
    assert.equal(initial.member,'out',`${width}: 로그아웃`);
    assert.deepEqual(initial.views,['서재','트리','보드','책','지도'],`${width}: 다섯 탭 그대로 유지`);
    if(width===390)assert.ok(initial.header<=62,`${width}: 기존 모바일 한 줄 높이`);
    else assert.ok(initial.header>=56,`${width}: 데스크톱 머리줄 높이 유지`);
    if(dest)await page.locator('.app-header').screenshot({path:join(dest,`guest-header-${width}.png`),animations:'disabled'});
    for(const [name,file,key] of cases){
     if(width===390){
      await page.locator('#mobile-more').click();
      await page.locator('#header-overflow [role=menuitem]').filter({hasText:new RegExp(`^${name}$`)}).click();
     }else await page.locator(`#tree-views [data-view="${file}"]`).click();
     const expected=`로그인하면 내 ${name}${name==='책'?'이':'가'} 보여요`;
     await page.waitForFunction(title=>document.querySelector('#empty h1')?.textContent===title,expected).catch(async error=>{
       const state=await page.evaluate(()=>({hash:location.hash,title:document.querySelector('#empty h1')?.textContent,emptyHidden:document.getElementById('empty')?.hidden,guest:document.getElementById('empty')?.dataset.emptyGuest,member:document.body.dataset.member,source:document.body.dataset.recordSource,auth:document.documentElement.dataset.ltAuthPhase,frame:document.getElementById('view')?.getAttribute('src'),current:[...document.querySelectorAll('[data-view][aria-current=true]')].map(x=>x.textContent)}));
       throw new Error(`${width}/${name}: ${error.message} — ${JSON.stringify(state)}`);
     });
     const state=await page.evaluate(()=>({hash:location.hash,home:document.body.classList.contains('home-screen'),visible:!document.getElementById('empty').hidden,guest:document.getElementById('empty').dataset.emptyGuest,button:document.getElementById('empty-records').textContent.trim(),loginVisible:!!document.querySelector('#account-entry')?.getClientRects().length,tabHidden:document.getElementById('tree-views').hidden,current:[...document.querySelectorAll('#tree-views button[data-view]')].filter(b=>b.getAttribute('aria-current')==='true').map(b=>b.textContent.trim())}));
     assert.equal(state.hash,'#'+key,`${width}/${name}: 화면 주소 유지`);
     assert.equal(state.home,false,`${width}/${name}: 첫 화면으로 되돌아가지 않음`);
     assert.equal(state.visible,true,`${width}/${name}: 빈 상태 표시`);
     assert.equal(state.guest,'1');
     assert.equal(state.button,'로그인');
     assert.equal(state.loginVisible,true);
     assert.equal(state.tabHidden,false);
     assert.deepEqual(state.current,[name],`${width}/${name}: 현재 탭`);
     if(dest&&key==='shelf')await page.screenshot({path:join(dest,`guest-shelf-${width}.png`),animations:'disabled',fullPage:true});
    }
    if(width===390){
     await page.locator('#mobile-more').click();
     await page.locator('#header-overflow [role=menuitem]').filter({hasText:/^서재$/}).click();
    }else await page.locator('#tree-views [data-view="track32-bookshelf.html"]').click();
    await page.locator('#empty-records').click();
    await page.waitForURL('**/auth/login?*');
    const login=new URL(page.url());
    assert.equal(login.pathname,'/auth/login');
    assert.equal(login.searchParams.get('next'),'/v41/#shelf',`${width}: 로그인하면 서재 복귀`);
    assert.deepEqual(errors,[],`${width}: 페이지 예외 없음`);
   }finally{await ctx.close()}
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});
