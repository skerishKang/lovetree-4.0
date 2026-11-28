// 2026-11-07 첫 화면 테마 A/B(밤/정원)와 워드마크 LoveTree 통일 1단계의 회귀 시험.
// 기본은 A, 저장·재방문은 유지, 저장 실패는 A, 안쪽 네 화면은 항상 A, 워드마크 문구와 외부 글꼴 요청 0건을 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { existsSync } from 'node:fs';
import { createTree, addMoment } from '../public/v41/domain.mjs';
import {
  readTheme, writeTheme, memberPreferredTheme, nextTheme, themeButtonLabel, themeButtonAriaLabel, themeIconGlyph, themePressed,
  appliedTheme, applyThemeAttribute, normalizeTheme, THEMES, DEFAULT_THEME, THEME_KEY,
  normalizeBookDisplay, readBookDisplay, writeBookDisplay, bookDisplayVisible,
  bookDisplayLabel, bookDisplayAriaLabel, bookDisplayPressed, BOOK_DISPLAY_KEY,
  normalizeShelfView, readShelfView, writeShelfView, shelfViewVisible,
  shelfViewLabel, shelfViewAriaLabel, shelfViewPressed, SHELF_VIEW_KEY
} from '../public/v41/header-state.mjs';


function memoryStorage(initial = {}) {
  const data = {...initial};
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); }
  };
}

function brokenStorage() {
  return {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
}

function fakeRoot() {
  const attributes = {};
  return {
    attributes,
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; },
    getAttribute: key => attributes[key] ?? null
  };
}

test('정원 대상: 책장·기억책·기억 보드·관계 지도(#212, 2026-11-08 정원 적용 레인)', async () => {
  assert.equal(appliedTheme('garden', 'book'), 'garden');
  for (const view of ['board', 'network']) {
    assert.equal(appliedTheme('garden', view), 'garden', view);
    assert.equal(appliedTheme('night', view), 'night', view);
  }
  assert.equal(appliedTheme('garden', 'shelf'), 'garden');
  assert.equal(appliedTheme('night', 'shelf'), 'night');
  assert.equal(appliedTheme('garden', 'inner'), 'night');
  // 문서 속성도 화면에 따라 정해진다.
  // #231 1-B: 화면별 테마 대상 계산은 shell/navigation.mjs가 맡는다 — 소스 글자 대신
  // themedViewFor를 직접 불러 입출력으로 확인한다(이슈 952).
  const { themedViewFor } = await import('../public/v41/shell/navigation.mjs');
  assert.equal(themedViewFor('src064-orbit.html'), 'home');
  assert.equal(themedViewFor('track59-sketchbook.html'), 'book');
  assert.equal(themedViewFor('track58-pinboard.html'), 'board');
  assert.equal(themedViewFor('track56-network.html'), 'network');
  assert.equal(themedViewFor('track32-bookshelf.html'), 'shelf');
  assert.equal(themedViewFor('없는-화면.html'), 'inner');
});

test('테마 레지스트리는 밤·정원 두 항목과 저장 기본 규칙을 한 곳에 둔다', () => {
  assert.deepEqual(THEMES.map(theme => ({id:theme.id,label:theme.label,order:theme.order,icon:theme.icon,tone:theme.tone,attribute:theme.attribute})), [
    {id:'night',label:'밤',order:1,icon:'☾',tone:'dark',attribute:null},
    {id:'garden',label:'정원',order:2,icon:'☀',tone:'light',attribute:'garden'}
  ]);
  assert.equal(DEFAULT_THEME, 'night');
  assert.equal(THEME_KEY, 'lt41.theme');
  assert.equal(themeIconGlyph('night'), '☀');
  assert.equal(themeIconGlyph('garden'), '☾');
  for (const value of [undefined, null, '', 'memory-paper', 'GARDEN']) assert.equal(normalizeTheme(value), 'night');
  assert.equal(normalizeTheme('garden'), 'garden');
  const storage = memoryStorage({});
  assert.equal(readTheme(storage), 'night');
  assert.equal(writeTheme(storage, 'garden'), 'garden');
  assert.equal(storage.data[THEME_KEY], 'garden');
  assert.equal(readTheme(storage), 'garden');
  assert.equal(readTheme(brokenStorage()), 'night');
  assert.equal(writeTheme(brokenStorage(), 'garden'), 'night');
  const root = fakeRoot();
  assert.equal(applyThemeAttribute(root, 'garden'), 'garden');
  assert.equal(root.getAttribute('data-lt-theme'), 'garden');
  assert.equal(applyThemeAttribute(root, 'unknown'), 'night');
  assert.equal(root.getAttribute('data-lt-theme'), null);
});

test('화면 테마는 설정 창의 "화면" 묶음에 있고 밤/정원 두 칸으로 aria-checked를 쓴다', () => {
  assert.equal(themeButtonLabel('night'), '정원');
  assert.equal(themeButtonLabel('garden'), '밤');
  assert.equal(themeButtonAriaLabel('night'), '정원 테마로 바꾸기');
  assert.equal(themeButtonAriaLabel('garden'), '밤 테마로 바꾸기');
  assert.equal(themePressed('night'), false);
  assert.equal(themePressed('garden'), true);
  assert.equal(nextTheme('night'), 'garden');
  assert.equal(nextTheme('garden'), 'night');
  // #380 5번(테마는 설정 창 "화면" 묶음에 있다)·#776(머리줄 단추 하나)·첫 화면 ◐ 없음의
  // 소스 글자 검사 13은 지웠다(이슈 952) — 테마 라디오의 실제 role·aria-checked는
  // tests/v41-a11y-shell-names.test.mjs의 실행 시험이, 밤/정원 적용 결과는 아래 실행 시험이
  // 화면에서 확인한다. 첫 화면 요소(◐·순간 목록)는 첫 화면 화면 시험이 확인한다.
});

// '워드마크 LoveTree + 4.1' 소스 글자 시험(4 단정)은 지웠다(이슈 952) — 브랜드 이름의
// 접근성 이름은 tests/v41-a11y-shell-names.test.mjs의 실행 시험이 실제 요소에서 확인하고,
// MEMORY ORBIT·새싹 없음은 첫 화면 화면 시험이 확인한다.

// '첫 그리기 전 테마 인라인 스크립트' 소스 글자 시험(4 단정)은 지웠다(이슈 952) —
// 이 배선이 지키려던 결과(첫 그림에 이미 밤/정원이 적용되어 있다)는 아래 실행 시험이
// 뜬 문서의 data-lt-theme과 무대 색으로 확인한다.

// '정원 색은 한 블록에만'(9 단정)·'움직임 줄이기면 전환 끔'(1 단정) CSS 글자 시험은 지웠다(이슈 952) —
// 색 값·블록 위치는 identity.css의 시각 통일 기준(--lt-* 토큰) 감사가 맡고, 정원 무대 색이
// 실제로 칠해지는 결과는 아래 실행 시험이 잰다.

test('글꼴은 저장소 안에서만 받고 외부 글꼴 요청이 0건이다', () => {
  // 소스 글자 스캔(6 단정)은 지웠다(이슈 952) — 외부 글꼴 요청 0건은 아래 실행 시험이
  // 실제 네트워크 요청 목록에서 센다.
  assert.ok(fs.existsSync(new URL('../public/fonts/gowun-batang/OFL.txt', import.meta.url)), 'OFL 라이선스가 함께 있어야 한다');
  assert.ok(fs.existsSync(new URL('../public/fonts/gowun-batang/GowunBatang-Bold.latin.woff2', import.meta.url)), 'woff2 서브셋이 저장소에 있어야 한다');
});

// '정원 워드마크만 Gowun Batang' CSS 글자 시험(2 단정)은 지웠다(이슈 952) —
// 아래 실행 시험이 정원·밤에서 .brand>span에 실제로 적용된 글꼴을 잰다.

/* ── 이슈 952: 지운 소스 글자 시험의 대체 실행 시험 ──
   밤이 기본이고, 저장한 정원이 다음 부팅에 그대로이며, 정원에서는 워드마크만 Gowun Batang이다.
   외부 글꼴 요청 0건은 실제 네트워크 요청 목록에서 센다(소스 글자 스캔 대신).
   LT_SHELL_952_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패). */
const REQUIRE952T = process.env.LT_SHELL_952_REQUIRE === '1';
let chromium952t = null;
let skip952t = false;
try {
  ({ chromium: chromium952t } = await import('playwright'));
  if (!existsSync(chromium952t.executablePath())) skip952t = 'Playwright chromium이 설치되어 있지 않아 실행 시험을 건너뜀';
} catch {
  skip952t = 'playwright 패키지가 없어 실행 시험을 건너뜀';
}
if (REQUIRE952T && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip952t = '빌드 결과가 없어 실행 시험을 건너뜀';

test('#1026 첫 화면은 문서와 카드 영역 모두 처음부터 기기 테마를 사용한다', { skip: skip952t || undefined }, async () => {
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952t.launch();
  try {
    for (const theme of ['garden','night']) {
      const ctx = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
      await ctx.addInitScript((value) => {
        try { localStorage.setItem('lt41.theme',value); } catch {}
        window.__firstThemeSamples=[];
        function sample(){
          const root=document.documentElement, app=document.querySelector('#orbit')?.shadowRoot?.querySelector('.app');
          if(document.body){
            const entry={theme:root.getAttribute('data-lt-theme')||'night',app:app?getComputedStyle(app).backgroundImage:null};
            const last=window.__firstThemeSamples.at(-1);
            if(!last||last.theme!==entry.theme||last.app!==entry.app)window.__firstThemeSamples.push(entry);
          }
          requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      }, theme);
      await ctx.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
      await ctx.route('**/api/workspace*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,state:{version:1,trees:[],prefs:{theme}},subject:'시험계정',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z'})}));
      await ctx.route('**/assets/v41home-*.js',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});
      const page=await ctx.newPage();
      await page.goto(base+'/v41/?account=1#home');
      await page.waitForFunction(()=>!!document.querySelector('#view')?.contentDocument?.querySelector('#orbit')?.shadowRoot?.querySelector('.app'),null,{timeout:20000});
      await page.waitForFunction(()=>document.querySelector('#view').contentWindow.__firstThemeSamples?.some(x=>x.app),null,{timeout:5000});
      const got=await page.evaluate(()=>({shell:window.__firstThemeSamples,home:document.querySelector('#view').contentWindow.__firstThemeSamples}));
      assert.ok(got.shell.length>0&&got.home.length>0);
      assert.ok([...got.shell,...got.home].every(x=>x.theme===theme),JSON.stringify(got));
      const appFrames=got.home.filter(x=>x.app);
      assert.ok(appFrames.length>0);
      if(theme==='garden') assert.ok(appFrames.every(x=>x.app.includes('rgb(251, 248, 241)')&&x.app.includes('rgb(247, 240, 232)')),JSON.stringify(got));
      else assert.ok(appFrames.every(x=>!x.app.includes('rgb(247, 240, 232)')),JSON.stringify(got));
      await ctx.close();
    }
  } finally {await browser.close();server.close();}
});

test('952 실행: 밤이 기본이고 정원 저장은 다음 부팅에 유지되며 외부 글꼴 요청이 없다', { skip: skip952t || undefined }, async () => {
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952t.launch();
  try {
    const cases = [
      { stored: null, want: 'night', gowun: false, stage: 'rgb(4, 4, 7)' },
      { stored: 'garden', want: 'garden', gowun: true, stage: 'rgb(247, 240, 232)' }
    ];
    for (const c of cases) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const urls = [];
      if (c.stored) await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, c.stored);
      await ctx.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [], prefs: {theme:c.want} }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) }));
      const page = await ctx.newPage();
      page.on('request', (r) => urls.push(r.url()));
      await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !!document.querySelector('.brand > span'), null, { timeout: 15000 });
      const got = await page.evaluate(() => ({
        theme: document.documentElement.dataset.ltTheme,
        stage: getComputedStyle(document.documentElement).backgroundColor,
        brandFont: getComputedStyle(document.querySelector('.brand > span')).fontFamily
      }));
      // 밤은 data-lt-theme 속성이 없는 값이다(applyThemeAttribute: 정원만 속성을 남긴다).
      assert.equal(got.theme || 'night', c.want, `저장값이 없으면 밤, 정원을 저장했으면 정원(${c.stored})`);
      assert.equal(got.stage, c.stage, `${c.want}: 무대 색은 그 테마의 --lt-stage다`);
      assert.equal(got.brandFont.includes('Gowun Batang'), c.gowun, `${c.want}: 워드마크 글꼴 ${c.gowun ? 'Gowun Batang' : 'Gowun Batang 아님'}`);
      const external = urls.filter((u) => /fonts\.(googleapis|gstatic)\.com|^https?:\/\/fonts\./.test(u));
      assert.deepEqual(external, [], `${c.want}: 외부 글꼴 요청 0건 — ${JSON.stringify(external)}`);
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
});

test('#1026 안쪽 네 문서는 첫 그림 전에 기기 테마와 판 선택을 적용한다', async()=>{
  const {runInNewContext}=await import('node:vm');
  const registry=fs.readFileSync(new URL('../public/v41/theme-registry.js',import.meta.url),'utf8');
  for(const [screen,file] of [['book','track59-sketchbook'],['network','track56-network'],['board','track58-pinboard'],['shelf','track32-bookshelf']]){
    const html=fs.readFileSync(new URL('../public/v41/views/'+file+'.html',import.meta.url),'utf8');
    if(screen==='board') assert.ok(html.indexOf('href="/v41/views/board/board-extra.css"')>0&&html.indexOf('href="/v41/views/board/board-extra.css"')<html.indexOf('</head>'),'보드 정원 색은 첫 그림 전에 함께 읽는다');
    const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    for(const [theme,plate,want,wantPlate] of [['garden',null,'garden','paper'],['night',null,null,'night'],['garden','night','garden','night'],['night','paper',null,'paper']]){
      const attrs=new Map(),root={dataset:{v41Screen:screen},setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
      const window={};window.parent=window;
      const context={document:{documentElement:root},window,localStorage:{getItem:k=>k==='lt41.theme'?theme:plate}};
      runInNewContext(registry,context);
      runInNewContext(script,context);
      assert.equal(attrs.get('data-lt-theme')||null,want,screen);
      assert.equal(attrs.get('data-lt-board-theme')||null,['network','board'].includes(screen)?wantPlate:null,screen);
    }
  }
});

test('트리·그래프·첫 여정의 첫 그리기도 레지스트리와 기존 폴백 규칙을 쓴다', async()=>{
  const {runInNewContext}=await import('node:vm');
  const registry=fs.readFileSync(new URL('../public/v41/theme-registry.js',import.meta.url),'utf8');
  const run=(file,{stored='',parentTheme=null,standalone=true})=>{
    const html=fs.readFileSync(new URL('../public/v41/'+file,import.meta.url),'utf8');
    const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    const attrs=new Map(),root={setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
    const window={};
    window.parent=standalone?window:{document:{documentElement:{getAttribute:()=>parentTheme}}};
    const context={document:{documentElement:root},window,parent:window.parent,localStorage:{getItem:key=>key==='lt41.theme'?stored:null}};
    runInNewContext(registry,context);
    runInNewContext(script,context);
    return attrs.get('data-lt-theme')||null;
  };
  assert.equal(run('views/track61-tree.html',{parentTheme:'garden',standalone:false}),'garden');
  assert.equal(run('views/track61-tree.html',{stored:'night',parentTheme:'garden',standalone:false}),null);
  assert.equal(run('views/track61-tree.html',{stored:'unknown',parentTheme:'garden',standalone:false}),null);
  assert.equal(run('views/graph/track60-graph.html',{stored:'garden'}),'garden');
  assert.equal(run('views/graph/track60-graph.html',{stored:'night'}),null);
  assert.equal(run('views/first-journey.html',{stored:'night',parentTheme:'garden',standalone:false}),'garden');
  assert.equal(run('views/first-journey.html',{stored:'garden'}),'garden');
});

test('셸과 각 화면 iframe의 테마가 같고 테마 전환은 프레임을 다시 불러오지 않는다', { skip: skip952t || undefined }, async()=>{
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve({});
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium952t.launch();
  let tree = createTree({subject:'시험',title:'테마 일치 트리',note:'',emotion:'설렘',date:'2026-11-18',url:''},'2026-11-18T00:00:00Z');
  tree = addMoment(tree,{title:'첫 순간',note:'고정 기록',emotion:'설렘',date:'2026-11-18',url:''},tree.moments[0].id,'2026-11-18T00:01:00Z');
  try {
    for (const initial of ['night','garden']) {
      const ctx = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
      await ctx.addInitScript((value)=>{
        try { localStorage.setItem('lt41.theme',value); } catch {}
        window.__themeFrameLoads={};
        document.addEventListener('load',event=>{
          const id=event.target?.id;
          if(id==='view'||id==='view-next')window.__themeFrameLoads[id]=(window.__themeFrameLoads[id]||0)+1;
        },true);
      },initial);
      await ctx.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
      await ctx.route('**/api/workspace*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({revision:1,state:{version:1,trees:[tree],prefs:{theme:initial}},subject:'시험계정',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z'})}));
      const page = await ctx.newPage();
      await page.goto(base+'/v41/?account=1#home');
      await page.waitForFunction(()=>!!window.LT41?.trees?.length,null,{timeout:20000});
      const screens=[
        ['', 'home.html'], ['#shelf','track32-bookshelf.html'], ['#tree','track61-tree.html'],
        ['#book','track59-sketchbook.html'], ['#board','track58-pinboard.html'],
        ['#network','track56-network.html'], ['#journey/00','first-journey.html']
      ];
      const state=()=>page.evaluate(()=>{
        const frame=document.getElementById('view');
        return {shell:document.documentElement.getAttribute('data-lt-theme')||'night',frame:frame?.contentDocument?.documentElement.getAttribute('data-lt-theme')||'night',href:frame?.contentWindow?.location?.href||'',loads:{...window.__themeFrameLoads}};
      });
      const open=async(hash,file)=>{
        if(hash)await page.evaluate(value=>{location.hash=value},hash);
        await page.waitForFunction(expected=>document.getElementById('view')?.contentWindow?.location?.href.includes(expected),file,{timeout:20000});
        await page.waitForFunction(()=>document.getElementById('view')?.contentDocument?.readyState==='complete',null,{timeout:10000});
      };
      for(const [hash,file] of screens){
        await open(hash,file);
        const got=await state();
        assert.equal(got.shell,initial,`${file}: 셸 테마`);
        assert.equal(got.frame,initial,`${file}: iframe 테마`);
      }
      // 직전 화면 교대의 숨은 프레임 비우기(600ms)가 테마 전환과 겹치지 않게 둔다.
      await page.waitForTimeout(700);
      await page.evaluate(()=>document.getElementById('theme-toggle').click());
      const switched=initial==='night'?'garden':'night';
      await page.waitForFunction(expected=>document.documentElement.getAttribute('data-lt-theme')===expected,switched==='garden'?'garden':null,{timeout:5000});
      const afterToggle=await state();
      assert.equal(afterToggle.frame,switched,'머리줄 전환 후 iframe 테마');
      const loadsAfterToggle=afterToggle.loads;
      await page.evaluate(()=>{
        document.getElementById('account-avatar').click();
        document.getElementById('account-open-settings').click();
      });
      await page.waitForFunction(()=>document.getElementById('account-settings')?.open,null,{timeout:5000});
      const choices=await page.evaluate(()=>[...document.querySelectorAll('#account-settings [data-set-theme]')].map(button=>({id:button.dataset.setTheme,checked:button.getAttribute('aria-checked')})));
      assert.deepEqual(choices,[{id:'night',checked:String(switched==='night')},{id:'garden',checked:String(switched==='garden')}]);
      await page.evaluate(value=>document.querySelector(`#account-settings [data-set-theme="${value}"]`).click(),initial);
      await page.waitForFunction(expected=>document.documentElement.getAttribute('data-lt-theme')===expected,initial==='garden'?'garden':null,{timeout:5000});
      await page.waitForTimeout(500);
      const afterSettings=await state();
      assert.equal(afterSettings.frame,initial,'설정 전환 후 iframe 테마');
      assert.deepEqual(afterSettings.loads,loadsAfterToggle,'테마 전환으로 iframe이 다시 불러와지 않는다');
      await ctx.close();
    }
  } finally {await browser.close();server.close();}
});

// #1094: 책/목록 보기 전환(테마와 같은 두 칸고르기). 기본은 책, 기기 미러는 날짜 표기·제목 보기와 같은 길이다.
test('책/목록 보기는 기본 책, 미러 저장·반환, 서재·책에서만 보인다', () => {
  assert.equal(BOOK_DISPLAY_KEY, 'lt41.bookDisplay');
  assert.equal(normalizeBookDisplay('book'), 'book');
  assert.equal(normalizeBookDisplay('list'), 'list');
  for (const value of ['', 'shelf', 'BOOK', null, undefined, 1]) assert.equal(normalizeBookDisplay(value), 'book', JSON.stringify(value));
  const storage = memoryStorage({});
  assert.equal(readBookDisplay(storage), 'book', '저장 없으면 책이다');
  assert.equal(writeBookDisplay(storage, 'list'), 'list');
  assert.equal(storage.data[BOOK_DISPLAY_KEY], 'list');
  assert.equal(readBookDisplay(storage), 'list', '다시 들어와도 기억된다');
  assert.equal(readBookDisplay(brokenStorage()), 'book', '저장소가 막히면 책이다');
  assert.equal(writeBookDisplay(brokenStorage(), 'list'), 'book', '저장 실패는 기본을 돌려준다');
  for (const file of ['track32-bookshelf.html', 'track59-sketchbook.html']) assert.equal(bookDisplayVisible({ current: file }), true, file);
  for (const file of ['track58-pinboard.html', 'track56-network.html', 'src064-orbit.html', 'first-journey.html', '']) assert.equal(bookDisplayVisible({ current: file }), false, file);
  assert.equal(bookDisplayLabel('book'), '책');
  assert.equal(bookDisplayLabel('list'), '목록');
  assert.equal(bookDisplayLabel('엉뚱한값'), '책');
  assert.equal(bookDisplayAriaLabel('book'), '책으로 보기');
  assert.equal(bookDisplayAriaLabel('list'), '목록으로 보기');
  assert.equal(bookDisplayPressed('book'), false);
  assert.equal(bookDisplayPressed('list'), true);
  // #1366: 서재 진열 방식도 같은 계약 — 기본 회전, 서재에서만 보인다.
  assert.equal(readShelfView(memoryStorage({})), 'carousel', '저장 없으면 회전이다');
  assert.equal(writeShelfView(storage, 'carousel'), 'carousel');
  assert.equal(storage.data[SHELF_VIEW_KEY], 'carousel');
  assert.equal(readShelfView(storage), 'carousel', '다시 들어와도 기억된다');
  assert.equal(readShelfView(brokenStorage()), 'carousel', '저장소가 막히면 회전이다');
  assert.equal(writeShelfView(brokenStorage(), 'carousel'), 'carousel', '저장 실패는 기본을 돌려준다');
  assert.equal(normalizeShelfView('엉뚱한값'), 'carousel');
  assert.equal(shelfViewVisible({ current: 'track32-bookshelf.html' }), true);
  for (const file of ['track59-sketchbook.html', 'track58-pinboard.html', 'track56-network.html', 'src064-orbit.html', '']) assert.equal(shelfViewVisible({ current: file }), false, file);
  assert.equal(shelfViewLabel('shelf'), '선반');
  assert.equal(shelfViewLabel('carousel'), '회전');
  assert.equal(shelfViewAriaLabel('shelf'), '선반 보기');
  assert.equal(shelfViewAriaLabel('carousel'), '회전 책장 보기');
  assert.equal(shelfViewPressed('shelf'), false);
  assert.equal(shelfViewPressed('carousel'), true);
});


test('#1558 guest theme stays local without workspace writes', {skip:skip952t||undefined}, async()=>{
  const {serve}=await import('./helpers/screen-audit.mjs');
  const server=await serve({});
  const browser=await chromium952t.launch({headless:true});
  try {
    const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    let puts=0;
    await ctx.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"items":[]}'}));
    await ctx.route('**/api/workspace*',r=>{
      if(r.request().method()==='PUT')puts++;
      return r.fulfill({status:401,contentType:'application/json',body:'{"error":{"code":"unauthenticated"}}'});
    });
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/v41/#home');
    await page.waitForFunction(()=>document.getElementById('theme-toggle')?.onclick);
    await page.evaluate(()=>document.getElementById('theme-toggle').click());
    await page.waitForFunction(()=>localStorage.getItem('lt41.theme')==='garden'&&document.documentElement.dataset.ltTheme==='garden');
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('theme-toggle')?.onclick);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.ltTheme),'garden');
    assert.equal(puts,0);
    await ctx.close();
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('#1598 회원 테마는 계정값이 우선이고 계정값이 없을 때만 기기 값을 쓴다', () => {
  assert.equal(memberPreferredTheme({owned:true,accountTheme:'night',deviceTheme:'garden'}),'night');
  assert.equal(memberPreferredTheme({owned:true,accountTheme:'garden',deviceTheme:'night'}),'garden');
  assert.equal(memberPreferredTheme({owned:true,accountTheme:null,deviceTheme:'garden'}),'garden');
  assert.equal(memberPreferredTheme({owned:false,accountTheme:'night',deviceTheme:'garden'}),'garden');
});

test('#1598 로그인 후 기기 테마만 바뀌어도 서재·트리·책·보드·지도는 계정 테마를 지킨다', {skip:skip952t||undefined,timeout:180000}, async()=>{
  const {serve}=await import('./helpers/screen-audit.mjs');
  const server=await serve({}, {port:Number(process.env.LT_TEST_PORT||0)});
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium952t.launch({headless:true});
  const now='2026-11-28T00:00:00.000Z';
  const field={subject:'시험',title:'기록 순간',note:'모의 자료',emotion:'설렘',date:'2026-11-28',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'};
  const trees=Array.from({length:4},(_,i)=>({...createTree({...field,title:'모의 트리 '+i},now),id:'theme-case-tree-'+i}));
  const screens=[['shelf','track32-bookshelf'],['tree','track61-tree'],['book','track59-sketchbook'],['board','track58-pinboard'],['network','track56-network']];
  try{
    for(const [accountTheme,deviceTheme] of [['night','garden'],['garden','night']]){
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
      const state={version:1,trees,prefs:{theme:accountTheme,shelfView:'carousel',titleDisplay:'both'}};
      await context.addInitScript((mirror)=>{
        if(window!==window.top)return;
        try{if(!sessionStorage.getItem('theme-case-seeded')){sessionStorage.setItem('theme-case-seeded','1');localStorage.setItem('lt41.theme',mirror);}}catch{}
      },deviceTheme);
      await context.route('**/api/**',r=>{
        const u=new URL(r.request().url());
        if(u.pathname==='/api/workspace')return r.fulfill({status:200,json:{revision:1,state,subject:'test-member',writeSubjectBound:true,savedAt:now}});
        if(u.pathname==='/api/account')return r.fulfill({status:200,json:{ok:true,email:'test@example.invalid',subject:'test-member'}});
        if(u.pathname==='/api/shares')return r.fulfill({status:200,json:{shares:[]}});
        return r.fulfill({status:200,json:{ok:true,items:[],shares:[]}});
      });
      const page=await context.newPage();
      try{
        await page.goto(base+'/v41/?account=1#my/book',{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForFunction(theme=>window.LT41?.prefs?.theme===theme,accountTheme,{timeout:25000});
        const normalized=theme=>theme==='night'?null:'garden';
        assert.equal(await page.evaluate(()=>localStorage.getItem('lt41.theme')),accountTheme,'로그인 시 기기 미러는 계정값으로 복구');
        // 로그인은 이미 끝났다. 계정 API는 바꾸지 않고 기기 저장값만 다시 반대로 만든다.
        await page.evaluate(value=>localStorage.setItem('lt41.theme',value),deviceTheme);
        for(const [view,file] of screens){
          await page.evaluate(v=>{location.hash='#my/'+v},view);
          await page.waitForFunction(target=>{
            const f=document.getElementById('view');
            try{return f&&!f.hidden&&f.contentWindow?.location?.href?.includes(target)&&f.contentDocument?.readyState==='complete'}catch{return false}
          },file,{timeout:23000});
          const result=await page.evaluate(()=>{
            const f=document.getElementById('view'),inner=f.contentDocument;
            return {shell:document.documentElement.getAttribute('data-lt-theme'),frame:inner.documentElement.getAttribute('data-lt-theme'),device:localStorage.getItem('lt41.theme'),account:window.LT41?.prefs?.theme,body:getComputedStyle(inner.body).backgroundColor};
          });
          assert.equal(result.account,accountTheme,view+' 계정 설정');
          assert.equal(result.device,accountTheme,view+' 기기 미러 복원');
          assert.equal(result.shell,normalized(accountTheme),view+' 셸');
          assert.equal(result.frame,normalized(accountTheme),view+' 안쪽');
          if(accountTheme==='garden')assert.equal(result.body,'rgb(247, 240, 232)',view+' 정원 배경');
          else assert.notEqual(result.body,'rgb(247, 240, 232)',view+' 밤 배경');
        }
      }finally{await context.close()}
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('#1598 테마 선택 후 저장 3초 지연·500·오프라인·다른 기기 변경·로그아웃 회귀', {skip:skip952t||undefined,timeout:180000}, async()=>{
  const {checkThemeSaveRace}=await import('./helpers/theme-save-race-1598.mjs');
  const observations=await checkThemeSaveRace();
  assert.equal(observations.filter(r=>r.view).length,20);
  for(const mode of ['delay','failure','offline']){
    assert.ok(observations.some(r=>r.mode===mode&&r.afterSave),mode+' 저장 응답 이후 검증');
  }
  assert.ok(observations.some(r=>r.mode==='guest'&&r.theme==='garden'&&r.puts===0));
});
