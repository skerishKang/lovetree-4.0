import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { serve } from './screen-audit.mjs';
import { createTree, addMoment } from '../../public/v41/domain.mjs';

const REQUIRE = process.env.LT_970_REQUIRE === '1';
const SHOTS = process.env.LT_SHELF_OPEN_SHOTS_DIR || '';
let chromium, unavailable = '';
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) unavailable = '브라우저가 설치되지 않았습니다';
} catch { unavailable = '브라우저 패키지가 없습니다'; }

const time = '2026-11-28T00:00:00.000Z';
function makeTree(title) {
  let tree = createTree({ subject: title, title, note: '', emotion: '설렘', date: '2026-11-28', url: '' }, time);
  tree = addMoment(tree, { title: title + '의 두 번째 순간', note: '시험', emotion: '설렘', date: '2026-11-27', url: '' }, tree.moments[0].id, time);
  return tree;
}
const trees = [makeTree('한 권의 기억'), makeTree('다른 책')];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('#1631 서재 미리보기·바로 펼치기 선택과 복원', {
  skip: !REQUIRE ? 'LT_970_REQUIRE=1에서 실행' : unavailable || false,
  timeout: 360000
}, async (t) => {
  if (unavailable) assert.fail(unavailable);
  const server = await serve();
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  async function makeContext(mode, width, theme) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 390 ? 844 : 900 },
      reducedMotion: 'reduce', locale: 'ko-KR', timezoneId: 'Asia/Seoul'
    });
    const state = { version: 1, trees, prefs: { theme, shelfView: 'shelf', shelfOpenMode: mode } };
    let revision = 1;
    let writes = 0;
    const errors = [];
    await ctx.addInitScript(({mode,theme}) => {
      localStorage.setItem('lt41.theme', theme);
      localStorage.setItem('lt41.shelfView', 'shelf');
      localStorage.setItem('lt41.shelfOpenMode', mode);
      localStorage.setItem('lt41.tips.firstTree', '1');
    }, {mode,theme});
    await ctx.route('**://i.ytimg.com/**', r => r.fulfill({status:200,contentType:'image/png',body:png}));
    await ctx.route('**/api/**', r => {
      const url = new URL(r.request().url());
      const json = data => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      if (url.pathname === '/api/account') return json({ok:true,subject:'audit-1631',email:'audit@example.test'});
      if (url.pathname === '/api/workspace') {
        if (r.request().method() === 'PUT') {
          const posted = r.request().postDataJSON();
          if (posted?.state) { state.prefs = posted.state.prefs; revision += 1; writes += 1; }
        }
        return json({ok:true,revision,state,subject:'audit-1631',writeSubjectBound:true,savedAt:time});
      }
      return json({ok:true,items:[],shares:[]});
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(origin + '/v41/?account=1#my/shelf', { waitUntil:'load' });
    await page.waitForFunction(() => {
      const f = document.querySelector('#view');
      return window.LT41?.source === 'server'
        && f?.contentWindow?.location.pathname.endsWith('/track32-bookshelf.html')
        && !!f.contentDocument?.querySelector('#shelfRail button[data-book-id]');
    }, null, {timeout:20000});
    return {ctx,page,state,errors,getWrites:()=>writes};
  }

  async function until(check,label) {
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){if(check())return;await new Promise(resolve=>setTimeout(resolve,100));}
    assert.fail(label);
  }
  async function setting(page,mode) {
    if (!(await page.locator('#account-settings').evaluate(el => el.open))) {
      await page.locator('#account-avatar').click();
      await page.locator('#account-open-settings').click();
      await page.locator('#account-settings[open]').waitFor({ state:'visible' });
    }
    const button = page.locator('[data-shelf-open-mode="' + mode + '"]');
    await button.click();
    await page.waitForFunction(v => window.LT41?.prefs?.shelfOpenMode === v,mode,{timeout:10000});
    assert.equal(await button.getAttribute('aria-checked'),'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('lt41.shelfOpenMode')),mode);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.ltShelfOpenMode),mode);
  }
  async function shelfReady(page) {
    await page.waitForFunction(() => {
      const f=document.querySelector('#view');
      return f?.contentWindow?.location.pathname.endsWith('/track32-bookshelf.html')
        && !!f.contentDocument?.querySelector('button[data-book-id]');
    },null,{timeout:20000});
  }
  // #1634: 'active'만으로 촬영하지 않는다. 애니메이션·덮개가 확정된 뒤 캡처한다.
  async function previewSettled(page) {
    await page.waitForFunction(() => {
      const d=document.querySelector('#view')?.contentDocument;
      const shelf=d?.querySelector('#shelfScreen'),reader=d?.querySelector('#readerScreen');
      if(!shelf||!reader)return false;
      return shelf.classList.contains('is-covered')&&!shelf.classList.contains('is-leaving')
        && reader.classList.contains('active')&&!reader.classList.contains('is-preparing')
        && getComputedStyle(reader).opacity==='1'
        && reader.getAnimations({subtree:false}).every(a=>a.playState==='finished');
    },null,{timeout:20000});
    const state=await page.frameLocator('#view').locator('#readerScreen').evaluate(reader => {
      const d=reader.ownerDocument,shelf=d.querySelector('#shelfScreen');
      const css=getComputedStyle(reader),rect=reader.getBoundingClientRect(),viewport=d.documentElement;
      const bg=css.backgroundColor;
      const opaque=/^rgb\(/.test(bg)||/^rgba\([^)]*,\s*1(?:\.0+)?\)$/.test(bg);
      const hidesShelf=getComputedStyle(shelf).display==='none'||!shelf.checkVisibility({checkVisibilityCSS:true});
      const coversShelf=css.position==='fixed'&&css.opacity==='1'&&css.visibility==='visible'
        &&opaque&&rect.left<=0&&rect.top<=0&&rect.right>=viewport.clientWidth
        &&rect.bottom>=viewport.clientHeight
        &&reader.contains(d.elementFromPoint(viewport.clientWidth/2,viewport.clientHeight/2));
      return {covered:shelf.classList.contains('is-covered'),hidesShelf,coversShelf};
    });
    assert.ok(state.covered&&(state.hidesShelf||state.coversShelf),'완료된 미리보기의 불투명한 화면이 책장과 최근 순간을 가려야 한다');
  }
  async function bookReady(page) {
    await page.waitForFunction(() => {
      const f=document.querySelector('#view');
      return location.hash.startsWith('#my/book')
        && f?.contentWindow?.location.pathname.endsWith('/track59-sketchbook.html')
        && !!f.contentDocument?.querySelector('#pageLabel');
    },null,{timeout:20000});
    assert.equal(await page.evaluate(() => window.LT41?.momentId),trees[0].moments[0].id,'직접 펼치기는 선택한 트리 첫 장');
  }
  async function backToShelf(page) {
    await page.goBack({waitUntil:'load'});
    await shelfReady(page);
    assert.match(new URL(page.url()).hash,/^#my\/shelf/,'뒤로 가기는 서재');
    await page.reload({waitUntil:'load'});
    await shelfReady(page);
  }
  async function activate(page, input) {
    const btn = page.frameLocator('#view').locator('#shelfRail button[data-book-id]').first();
    if(input==='mouse')await btn.click();
    else{await btn.focus(); await page.keyboard.press('Enter');}
  }

  for (const mode of ['preview','direct']) for (const width of [390,1440]) for (const theme of ['night','garden']) for (const input of ['mouse','Enter']) {
    const caseName=mode + ' ' + width + ' ' + theme + ' ' + input;
    if (process.env.LT_SHELF_OPEN_FILTER && !caseName.includes(process.env.LT_SHELF_OPEN_FILTER)) continue;
    await t.test(caseName, async () => {
      const {ctx,page,state,errors,getWrites} = await makeContext(mode,width,theme);
      try {
        // Setting updates remain reversible, and use the existing account save path.
        const other=mode==='preview'?'direct':'preview';
        await setting(page,other);
        await setting(page,mode);
        await until(()=>state.prefs.shelfOpenMode===mode && getWrites()>=1,'계정 저장이 완료되어야 한다');
        if(SHOTS && mode==='preview' && width===1440 && theme==='night' && input==='mouse') {
          await page.screenshot({path:path.join(SHOTS,'settings-1440-night.png')});
        }
        await page.keyboard.press('Escape');
        await activate(page,input);
        if(mode==='preview') {
          await page.frameLocator('#view').locator('#readerScreen.active').waitFor({state:'visible',timeout:10000});
          await previewSettled(page);
          assert.match(new URL(page.url()).hash,/^#my\/shelf/,'기본은 서재 미리보기');
          assert.equal(await page.frameLocator('#view').locator('#shelfDirectNext').isChecked(),false);
          if(SHOTS && width===1440 && theme==='night' && input==='mouse') {
            await page.screenshot({path:path.join(SHOTS,'preview-check-1440-night.png')});
          }
          await page.frameLocator('#view').locator('#openBookButton').click();
        }
        await bookReady(page);
        if(SHOTS && mode==='direct' && width===1440 && theme==='night' && input==='mouse') {
          await page.screenshot({path:path.join(SHOTS,'direct-book-1440-night.png')});
        }
        await backToShelf(page);
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.ltShelfOpenMode),mode,'새로고침 뒤 설정 유지');
        assert.equal(state.prefs.shelfOpenMode,mode,'계정 설정 유지');
        assert.ok(getWrites()>=1,'계정 저장 요청을 사용한다');
        assert.deepEqual(errors,[],'화면 오류 없음');
      } finally { await ctx.close(); }
    });
  }

  if (!process.env.LT_SHELF_OPEN_FILTER || process.env.LT_SHELF_OPEN_FILTER === 'checkbox') await t.test('미리보기 체크는 다음부터 바로 펼치기로 저장',async()=>{
    const {ctx,page,state,errors} = await makeContext('preview',1440,'night');
    try{
      await activate(page,'mouse');
      const box=page.frameLocator('#view').locator('#shelfDirectNext');
      await box.waitFor({state:'visible'});
      await previewSettled(page);
      await box.check();
      await page.waitForFunction(()=>window.LT41?.prefs?.shelfOpenMode==='direct',null,{timeout:10000});
      await until(()=>state.prefs.shelfOpenMode==='direct','체크 설정이 계정에 저장되어야 한다');
      await page.frameLocator('#view').locator('#backToShelf').click({timeout:3500});
      await page.frameLocator('#view').locator('#readerScreen.active').waitFor({state:'hidden',timeout:10000});
      await shelfReady(page);
      await activate(page,'mouse');
      await bookReady(page);
      assert.deepEqual(errors,[]);
    }finally{await ctx.close()}
  });
});


test('#1631 방문 중 저장을 막고 로그아웃에서는 기기에 저장한다', async () => {
  const { createViewPreferences } = await import('../../public/v41/shell/view-preferences.mjs');
  const { setVisitMode } = await import('../../public/v41/visit-mode.mjs');
  const original = { window: globalThis.window, document: globalThis.document, localStorage: globalThis.localStorage };
  const had = {window: 'window' in globalThis, document: 'document' in globalThis, localStorage: 'localStorage' in globalThis};
  const values = new Map([['lt41.shelfOpenMode','preview']]);
  const calls = [];
  const account = { prefs: {shelfOpenMode:'preview'} };
  const member = {
    snapshot: () => ({owned:true}),
    state: () => account,
    apply: (type,payload) => { calls.push({type,payload}); Object.assign(account.prefs,payload); }
  };
  const ctx = {
    member,
    $: () => ({contentDocument: null}),
    notify: () => {}
  };
  try {
    globalThis.window = {LT41:{prefs:account.prefs}};
    globalThis.document = {documentElement:{dataset:{}},querySelectorAll:()=>[]};
    globalThis.localStorage = {
      getItem:key=>values.get(key)??null,
      setItem:(key,value)=>values.set(key,String(value)),
      removeItem:key=>values.delete(key)
    };
    createViewPreferences(ctx);
    setVisitMode(true);
    assert.equal(ctx.currentShelfOpenMode(),'preview','방문 때 공유 소유자 설정을 적용하지 않는다');
    assert.equal(ctx.setShelfOpenMode('direct'),false,'방문 중 설정 변경 거부');
    assert.equal(calls.length,0,'방문 중 계정 저장 요청 0건');
    assert.equal(values.get('lt41.shelfOpenMode'),'preview','방문 중 기기 설정 그대로');
    assert.equal(account.prefs.shelfOpenMode,'preview','방문자 계정 값 그대로');
    setVisitMode(false);
    assert.equal(ctx.setShelfOpenMode('direct'),true,'자기 계정에서는 설정 가능');
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0],{type:'setPrefs',payload:{shelfOpenMode:'direct'}});
    assert.equal(values.get('lt41.shelfOpenMode'),'direct');
    ctx.member=null;
    assert.equal(ctx.setShelfOpenMode('preview'),true,'로그아웃에서는 기기 설정');
    assert.equal(calls.length,1,'로그아웃에 계정 저장 요청 없음');
    assert.equal(values.get('lt41.shelfOpenMode'),'preview');
  } finally {
    setVisitMode(false);
    for(const name of Object.keys(original)) {
      if(had[name])globalThis[name]=original[name];
      else delete globalThis[name];
    }
  }
});
