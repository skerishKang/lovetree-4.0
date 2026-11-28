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
  async function bookReady(page, expectedMomentId=trees[0].moments[1].id) {
    await page.waitForFunction(() => {
      const f=document.querySelector('#view');
      return location.hash.startsWith('#my/book')
        && f?.contentWindow?.location.pathname.endsWith('/track59-sketchbook.html')
        && !!f.contentDocument?.querySelector('#pageLabel');
    },null,{timeout:20000});
    assert.equal(await page.evaluate(() => window.LT41?.momentId),expectedMomentId,'바로 펼치기와 책 열기는 기억한 순간에서 이어야 한다');
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


  async function checkSynced(page,mode) {
    await page.waitForFunction(value=>{
      const doc=document.querySelector('#view')?.contentDocument;
      const shelf=doc?.querySelector('#shelf-open-choice [data-shelf-open-mode="'+value+'"]');
      const other=doc?.querySelector('#shelf-open-choice [data-shelf-open-mode="'+(value==='direct'?'preview':'direct')+'"]');
      const settings=document.querySelector('[data-shelf-open-mode="'+value+'"]');
      return document.documentElement.dataset.ltShelfOpenMode===value
        && shelf?.getAttribute('aria-checked')==='true' && shelf?.tabIndex===0
        && other?.getAttribute('aria-checked')==='false' && other?.tabIndex===-1
        && settings?.getAttribute('aria-checked')==='true';
    },mode,{timeout:10000});
    const info=await page.frameLocator('#view').locator('#shelf-open-choice').evaluate(group=>{
      const d=group.ownerDocument, toolbar=d.querySelector('.lt-screen-toolbar');
      const r=e=>{const x=e?.getBoundingClientRect();return x?{x:x.x,y:x.y,width:x.width,height:x.height,right:x.right,bottom:x.bottom}:null;};
      const overlaps=(a,b)=>!!a&&!!b&&Math.min(a.right,b.right)-Math.max(a.x,b.x)>0&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>0;
      const hitSize=b=>{
        const box=r(b), cx=box.x+box.width/2,cy=box.y+box.height/2;
        const hit=(x,y)=>{const e=d.elementFromPoint(x,y);return e===b||b.contains(e);};
        let width=0,height=0;
        for(let x=Math.floor(box.x-30);x<=box.right+30;x++)if(hit(x,cy))width++;
        for(let y=Math.floor(box.y-30);y<=box.bottom+30;y++)if(hit(cx,y))height++;
        return {width,height};
      };
      const measure=g=>{
        const cs=d.defaultView.getComputedStyle(g);
        return {
          rect:r(g),background:cs.backgroundColor,border:cs.borderTopColor,radius:cs.borderTopLeftRadius,
          buttons:[...g.querySelectorAll('button')].map(b=>{
            const style=d.defaultView.getComputedStyle(b);
            return {rect:r(b),font:style.fontSize,weight:style.fontWeight,
              background:style.backgroundColor,color:style.color,border:style.borderTopColor,
              selected:b.getAttribute('aria-checked')==='true',hit:hitSize(b)};
          })
        };
      };
      const [reference,filter,choice]=['#shelf-view-inline','#shelf-filter-inline','#shelf-open-choice']
        .map(sel=>measure(d.querySelector(sel)));
      return {
        role:group.getAttribute('role'),reference,filter,choice,
        filterOverlap:overlaps(filter.rect,choice.rect),
        toolbarOverlap:overlaps(choice.rect,r(toolbar))||overlaps(filter.rect,r(toolbar)),
        viewport:d.documentElement.clientWidth,
        horizontalOverflow:d.documentElement.scrollWidth-d.documentElement.clientWidth
      };
    });
    assert.equal(info.role,'radiogroup');
    for(const [name,actual] of [['전체/공개만',info.filter],['미리보기/바로 펼치기',info.choice]]){
      assert.ok(Math.abs(actual.rect.height-info.reference.rect.height)<=1,name+' 묶음 높이는 선반/회전과 같다');
      assert.equal(actual.border,info.reference.border,name+' 묶음 테두리 색');
      assert.equal(actual.background,info.reference.background,name+' 묶음 바탕');
      assert.equal(actual.radius,info.reference.radius,name+' 묶음 둥근 모서리');
      for(const button of actual.buttons){
        const basis=info.reference.buttons.find(item=>item.selected===button.selected);
        assert.ok(Math.abs(button.rect.height-basis.rect.height)<=1,name+' 보이는 단추 높이는 선반/회전과 같다');
        assert.equal(button.font,basis.font,name+' 단추 글자 크기');
        assert.equal(button.weight,basis.weight,name+' 단추 글자 굵기');
        assert.equal(button.background,basis.background,name+' 단추 바탕');
        assert.equal(button.color,basis.color,name+' 단추 글자 색');
        assert.equal(button.border,basis.border,name+' 단추 고른 쪽 테두리');
        // 단추가 보이는 높이는 36px로 통일하되, 기존 44px 누름 기준은 그대로 검사한다.
        assert.ok(button.hit.width>=44&&button.hit.height>=44,
          name+' 실제 누름 영역 44px 이상(가로 '+button.hit.width+', 세로 '+button.hit.height+')');
      }
    }
    assert.ok(info.choice.buttons.every(button=>button.rect.width>=78),'미리보기 선택 글자는 잘리지 않아야 한다');
    assert.ok(info.choice.rect.x>=-1&&info.choice.rect.right<=info.viewport+1,'서재 열기 방식은 화면 밖으로 넘치지 않는다');
    assert.ok(info.horizontalOverflow<=0.5,'서재 iframe 문서는 가로 스크롤을 만들지 않는다');
    assert.equal(info.filterOverlap,false,'전체/공개만과 겹치면 안 된다');
    assert.equal(info.toolbarOverlap,false,'390·1440 화면 도구줄과 겹치면 안 된다');
    return info;
  }
  async function shelfChoice(page,mode,input) {
    const b=page.frameLocator('#view').locator('#shelf-open-choice [data-shelf-open-mode="'+mode+'"]');
    if(input==='Enter'){
      // #1631 CI: 라디오 DOM 렌더만으로는 iframe 모듈의 이벤트 연결이 끝났다고 볼 수 없다.
      await page.waitForFunction(()=>{
        const frame=document.querySelector('#view'),doc=frame?.contentDocument;
        return doc?.readyState==='complete' && frame?.contentWindow?.__shelfListenerInstalled===true;
      },null,{timeout:10000});
      // CI에서 Enter가 셸의 account-avatar에 전달된 사례가 있다.
      // 실제 키다운이 해당 라디오에 도달했는지 확인하고, 잘못 전달된 입력만 다시 보낸다.
      // 라디오가 Enter를 받았는데 설정을 바꾸지 못하면 아래 기존 10초 단언이 그대로 실패한다.
      await b.evaluate(button=>{
        button.dataset.ltTestEnterAck='0';
        button.addEventListener('keydown',event=>{
          if(event.key==='Enter' && event.target===button)
            button.dataset.ltTestEnterAck=String(Number(button.dataset.ltTestEnterAck||0)+1);
        },{capture:true});
      });
      let received=false;
      for(let attempt=0;attempt<3;attempt++){
        await b.focus();
        await b.press('Enter');
        received=Number(await b.getAttribute('data-lt-test-enter-ack'))>0;
        if(received)break;
        console.log('서재 Enter 초점 재확인',JSON.stringify({mode,attempt:attempt+1}));
      }
      assert.ok(received,'Enter 키다운이 서재의 해당 라디오에 실제 전달되어야 한다');
    }else await b.click();
    await page.waitForFunction(v=>window.LT41?.prefs?.shelfOpenMode===v,mode,{timeout:10000});
    return checkSynced(page,mode);
  }

  for (const mode of ['preview','direct']) for (const width of [390,1440]) for (const theme of ['night','garden']) for (const input of ['mouse','Enter']) {
    const caseName=mode+' '+width+' '+theme+' '+input;
    if(process.env.LT_SHELF_OPEN_FILTER&&!caseName.includes(process.env.LT_SHELF_OPEN_FILTER))continue;
    await t.test(caseName,async()=>{
      const {ctx,page,state,errors,getWrites}=await makeContext(mode,width,theme);
      try{
        const other=mode==='preview'?'direct':'preview';
        await setting(page,other);
        await checkSynced(page,other);
        await setting(page,mode);
        await checkSynced(page,mode);
        await page.keyboard.press('Escape');
        await shelfChoice(page,other,input);
        await shelfChoice(page,mode,input);
        await until(()=>state.prefs.shelfOpenMode===mode&&getWrites()>=1,'서재 단추 변경이 계정에 저장되어야 한다');
        await checkSynced(page,mode);
        if(SHOTS&&width===1440&&theme==='night'&&input==='mouse'){
          await page.screenshot({path:path.join(SHOTS,'shelf-choice-'+mode+'-1440-night.png')});
        }
        await page.evaluate(id=>{window.LT41.momentId=id;},trees[0].moments[1].id);
        await activate(page,input);
        if(mode==='preview'){
          await page.frameLocator('#view').locator('#readerScreen.active').waitFor({state:'visible',timeout:10000});
          await previewSettled(page);
          assert.match(new URL(page.url()).hash,/^#my\/shelf/,'미리보기에서는 서재 주소 유지');
          assert.equal(await page.frameLocator('#view').locator('#shelfDirectNext').count(),0,'기존 미리보기 체크 칸 제거');
          await page.frameLocator('#view').locator('#openBookButton').click();
        }
        await bookReady(page,trees[0].moments[1].id);
        if(SHOTS&&mode==='direct'&&width===1440&&theme==='night'&&input==='mouse'){
          await page.screenshot({path:path.join(SHOTS,'direct-book-resume-1440-night.png')});
        }
        await backToShelf(page);
        await checkSynced(page,mode);
        assert.equal(state.prefs.shelfOpenMode,mode,'새로고침 뒤에도 계정 설정 유지');
        assert.ok(getWrites()>=1,'계정 저장 요청 이용');
        assert.deepEqual(errors,[],'화면 오류 없음');
      }finally{await ctx.close();}
    });
  }

  if(!process.env.LT_SHELF_OPEN_FILTER||process.env.LT_SHELF_OPEN_FILTER==='keyboard')await t.test('서재 열기 라디오 화살표·Enter·Space와 누름 범위',async()=>{
    for(const width of [390,1440]){
      const {ctx,page,state,errors}=await makeContext('preview',width,'night');
      try{
        await checkSynced(page,'preview');
        const preview=page.frameLocator('#view').locator('#shelf-open-choice [data-shelf-open-mode="preview"]');
        const direct=page.frameLocator('#view').locator('#shelf-open-choice [data-shelf-open-mode="direct"]');
        await preview.press('ArrowRight');
        await checkSynced(page,'direct');
        assert.equal(await direct.evaluate(e=>e===e.ownerDocument.activeElement),true,'오른쪽 화살표는 고른 단추로 초점 이동');
        await direct.press('ArrowLeft');
        await checkSynced(page,'preview');
        await direct.press('Enter');
        await checkSynced(page,'direct');
        await preview.press('Space');
        await checkSynced(page,'preview');
        assert.equal(state.prefs.shelfOpenMode,'preview');
        assert.deepEqual(errors,[]);
      }finally{await ctx.close();}
    }
  });

  if(!process.env.LT_SHELF_OPEN_FILTER||process.env.LT_SHELF_OPEN_FILTER==='fallback')await t.test('기억한 순간이 없으면 첫 장으로 바로 펼친다',async()=>{
    const {ctx,page,errors}=await makeContext('direct',1440,'night');
    try{
      await page.evaluate(()=>{window.LT41.momentId=null;});
      await activate(page,'mouse');
      await bookReady(page,trees[0].moments[0].id);
      assert.deepEqual(errors,[]);
    }finally{await ctx.close();}
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
