import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync, existsSync} from 'node:fs';
import {serve} from './helpers/screen-audit.mjs';
import {createTree, addMoment} from '../public/v41/domain.mjs';
// #327 2부: 모아둔 순간 표시·정리 화면. 계산은 inbox-model.mjs 한 벌이고, 화면은 그 결과를 그린다.
import {INBOX_LABEL, isInboxTree, shelfOrder, pickerLabel, headerBadge, josaRo, cleanupTargets, cleanupState, movedNotice, cleanupAvailable, moveAvailable} from '../public/v41/inbox-model.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

const inbox={id:'t1',title:'모아둔 순간',inbox:true,moments:[{id:'m1',title:'첫 순간',parentId:null},{id:'m2',title:'바다',parentId:'m1'}]};
const normal={id:'t2',title:'우리의 이야기',moments:[]};
const renamed={id:'t3',title:'정리 시험',inbox:true,moments:[]};

test('isInboxTree: 참/거짓뿐인 inbox 표시로만 판정한다',()=>{
 const rows=[[inbox,true],[normal,false],[renamed,true],[null,false],[{},false],[{inbox:'yes'},false],[{inbox:1},false]];
 for(const [tree,want] of rows)assert.equal(isInboxTree(tree),want,JSON.stringify(tree));
});

test('shelfOrder: 모아둔 순간을 책장 맨 앞에 고정하고 나머지 순서는 유지한다',()=>{
 const list=[normal,{id:'t4',title:'둘째 이야기'},renamed,inbox];
 assert.deepEqual(shelfOrder(list).map(t=>t.id),['t3','t1','t2','t4']);
 // inbox 가 없으면 원래 순서 그대로(새 배열, 원본 훼손 없음).
 const plain=[normal,{id:'t4'}];
 const sorted=shelfOrder(plain);
 assert.deepEqual(sorted.map(t=>t.id),['t2','t4']);assert.notEqual(sorted,plain);
 assert.deepEqual(shelfOrder([]),[]);assert.deepEqual(shelfOrder(undefined),[]);
});

test('pickerLabel: 기본 이름이면 표시를 한 번만, 바꾼 이름이면 이름 옆에 붙인다',()=>{
 assert.equal(pickerLabel(inbox),INBOX_LABEL);
 assert.equal(pickerLabel(renamed),'정리 시험 · '+INBOX_LABEL);
 // 자동 문구 트리는 접미사를 뗀 이름으로 보여 준다.
 assert.equal(pickerLabel({id:'t5',title:'여행, 나의 순간들'}),'여행');
 assert.equal(pickerLabel(normal),'우리의 이야기');
 assert.equal(pickerLabel(null),'');
});

test('headerBadge: 서버 기록의 inbox 트리일 때만 모아둔 순간',()=>{
 assert.equal(headerBadge(inbox),INBOX_LABEL);assert.equal(headerBadge(renamed),INBOX_LABEL);
 assert.equal(headerBadge(normal),'');assert.equal(headerBadge(null),'');
});

test('josaRo: 받침 없거나 ㄹ이면 로, 다른 받침이면 으로',()=>{
 const rows=[['정리 시험','으로'],['책','으로'],['길','로'],['서울','로'],['여행','으로'],['바다','로'],['트리','로'],['','로'],['Tree','로']];
 for(const [word,want] of rows)assert.equal(josaRo(word),want,word);
});

test('cleanupTargets: 자기 자신은 빠지고, 이름은 pickerLabel 을 쓴다',()=>{
 const trees=[inbox,normal,renamed];
 assert.deepEqual(cleanupTargets(trees,'t1'),[{id:'t2',label:'우리의 이야기'},{id:'t3',label:'정리 시험 · 모아둔 순간'}]);
 assert.deepEqual(cleanupTargets(trees,'t2'),[{id:'t1',label:INBOX_LABEL},{id:'t3',label:'정리 시험 · 모아둔 순간'}]);
 // inbox 트리 하나뿐이면 대상이 없다(새 트리 만들기만 가능).
 assert.deepEqual(cleanupTargets([inbox],'t1'),[]);
 assert.deepEqual(cleanupTargets(undefined,'t1'),[]);
});

test('cleanupState: 고른 순간·이름·대상으로 두 동작의 가능 여부와 문구를 계산한다',()=>{
 // 아무것도 고르지 않으면 둘 다 막힌다.
 const none=cleanupState({});
 assert.equal(none.count,0);assert.equal(none.canCreate,false);assert.equal(none.canMove,false);
 assert.equal(none.createLabel,'새 트리 만들기');assert.equal(none.moveLabel,'옮기기');
 assert.match(none.createHint,/먼저 골라/);assert.match(none.moveHint,/먼저 골라/);
 // 이름만 있으면 만들기, 대상만 있으면 옮기기.
 const name=cleanupState({selectedIds:['m1'],newTreeName:' 산책 '});
 assert.equal(name.canCreate,true);assert.equal(name.createLabel,'1개의 순간으로 새 트리 만들기');
 assert.equal(name.canMove,false);
 const target=cleanupState({selectedIds:['m1','m2'],targetId:'t2',targetLabel:'우리의 이야기'});
 assert.equal(target.canMove,true);assert.equal(target.moveLabel,'우리의 이야기로 옮기기');
 assert.equal(target.createLabel,'2개의 순간으로 새 트리 만들기');
 // 같은 순간을 두 번 고르면 한 번으로 센다.
 assert.equal(cleanupState({selectedIds:['m1','m1'],newTreeName:'가'}).count,1);
 // 이름이 공백뿐이면 만들 수 없다.
 assert.equal(cleanupState({selectedIds:['m1'],newTreeName:'   '}).canCreate,false);
 // 받침 있는 대상 이름은 '으로 옮기기'.
 assert.equal(cleanupState({selectedIds:['m1'],targetId:'t3',targetLabel:'정리 시험 · 모아둔 순간'}).moveLabel,'정리 시험 · 모아둔 순간으로 옮기기');
});

test('movedNotice: 옮겼어요 안내와 가 보기 단추 문구',()=>{
 assert.deepEqual(movedNotice({targetLabel:'우리의 이야기'}),{text:'우리의 이야기로 옮겼어요.',action:'가 보기'});
 assert.deepEqual(movedNotice({targetLabel:'정리 시험',isNew:true}),{text:'정리 시험으로 새 트리를 만들었어요.',action:'가 보기'});
 assert.equal(movedNotice({}).text,'로 옮겼어요.');
});

test('cleanupAvailable: 내 기록(서버·소유자)의 inbox 트리에서만 정리 화면을 연다',()=>{
 const rows=[
  [{source:'server',owned:true,tree:inbox},true],
  [{source:'server',owned:true,tree:normal},false],
  [{source:'server',owned:false,tree:inbox},false],
  [{source:'share',owned:true,tree:inbox},false],
  [{source:'example',owned:true,tree:inbox},false],
  [{source:'file',owned:true,tree:inbox},false],
  [{source:'server',owned:true,tree:null},false]];
 for(const [input,want] of rows)assert.equal(cleanupAvailable(input),want,JSON.stringify(input));
});

test('moveAvailable: 내 기록이면 일반 트리에서도 옮기기를 보여 준다',()=>{
 const rows=[[{source:'server',owned:true},true],[{source:'server',owned:false},false],[{source:'share',owned:true},false],[{source:'example',owned:true},false],[{source:'file',owned:true},false]];
 for(const [input,want] of rows)assert.equal(moveAvailable(input),want,JSON.stringify(input));
});

test('안내 바는 첫 트리 말풍선 위에 온다(말풍선이 안내를 가리지 않는다)',()=>{
 const css=read('../public/v41/shell.css');
 const zOf=sel=>{const m=css.match(new RegExp(sel+'\\{[^}]*?z-index:(\\d+)'));return m?Number(m[1]):null;};
 const tips=zOf('\\.tree-tips');
 const move=zOf('#move-feedback');
 assert.equal(tips,25,'말풍선 z-index 기준');
 assert.ok(move!==null&&move>tips,'안내 바(#move-feedback)가 말풍선보다 위여야 한다');
});

// ─── 이슈 970: 모아둔 순간을 실제 화면에서 본다(가짜 데이터만, 390·1440) ───
// 목록(넓은 화면은 보드 카드, 휴대폰은 고르기 줄)이 보이고, 하나를 누르면 그 순간의 상세가
// 열리고, 닫으면 초점이 연 곳으로 돌아온다. 운영 API·운영 계정 없이 가짜 작업장만 쓴다.
// LT_970_REQUIRE=1 일 때 실행(CI 화면 잡 — 건너뜀=실패).
const REQUIRE970 = process.env.LT_970_REQUIRE === '1';
let chromium970, skip970 = false;
try {
  ({chromium: chromium970} = await import('playwright'));
  if (!existsSync(chromium970.executablePath())) skip970 = 'Playwright Chromium이 없어 화면 시험을 건너뜀';
} catch { skip970 = 'playwright 패키지가 없어 화면 시험을 건너뜀'; }

function inboxFixture() {
  const clock = '2026-11-18T00:00:00Z';
  let box = createTree({subject: '모아둔 순간', title: '첫 담은 순간', note: '첫 마음', emotion: '설렘', date: '2026-11-18', url: ''}, clock);
  box = addMoment(box, {title: '바다 무대 직캠', note: '둘째 마음', emotion: '설렘', date: '2026-11-18', url: ''}, box.moments[0].id, '2026-11-18T00:01:00Z');
  box = addMoment(box, {title: '새벽 연습실', note: '셋째 마음', emotion: '위로', date: '2026-11-18', url: ''}, box.moments[1].id, '2026-11-18T00:02:00Z');
  box.inbox = true;
  const other = createTree({subject: '우리의 이야기', title: '다른 트리 순간', note: '', emotion: '설렘', date: '2026-11-18', url: ''}, clock);
  return {box, other};
}

test('970 실행: 모아둔 순간 — 목록·누르면 맞는 상세·닫으면 초점 복귀(가짜 데이터)', {skip: skip970 || !REQUIRE970 ? skip970 || 'LT_970_REQUIRE=1 일 때 실행' : false, timeout: 180000}, async () => {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium970.launch({headless: true});
  try {
    const {box, other} = inboxFixture();
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 900}, reducedMotion: 'reduce'});
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); } catch {} });
      // 재현용: LT_970_CPU_RATE=4 또는 6일 때만 CPU 제한과 준비 시점 기록을 켠다.
      const rate = Number(process.env.LT_970_CPU_RATE || 0);
      if (rate) await ctx.addInitScript(() => {
        if (!location.pathname.endsWith('/track58-pinboard.html')) return;
        const trace = (event, count) => console.log('LT970_TRACE ' + JSON.stringify({event, at: Date.now(), count}));
        Object.defineProperty(window, 'LTDEMO', {configurable: true, set(value) {
          Object.defineProperty(window, 'LTDEMO', {value, writable: true, configurable: true, enumerable: true});
          trace('frame-data', value.moments.length);
        }});
        Object.defineProperty(window, 'LTMobileMoments', {configurable: true, set(mount) {
          Object.defineProperty(window, 'LTMobileMoments', {configurable: true, writable: true, enumerable: true, value(params) {
            trace('picker-render-start', params.moments.length);
            const picker = mount(params);
            trace('picker-dom-filled', document.querySelectorAll('.lt-moment-picker select option').length);
            return picker;
          }});
        }});
        const observer = new MutationObserver(() => {
          const count = document.querySelectorAll('#cardLayer .card').length;
          if (count) { trace('card-dom-filled', count); observer.disconnect(); }
        });
        observer.observe(document, {childList: true, subtree: true});
      });
      await ctx.route('**://i.ytimg.com/**', (r) => r.fulfill({status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#333"/></svg>'}));
      await ctx.route('**/api/**', (r) => r.fulfill({status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}'}));
      const state = {version: 1, trees: [other, box], prefs: {}};
      await ctx.route('**/api/workspace**', (r) => r.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({revision: 1, state, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-18T09:00:00.000Z'})}));
      const page = await ctx.newPage();
      if (rate) {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', {rate});
        page.on('response', r => {
          if (new URL(r.url()).pathname === '/api/workspace') console.log('LT970_TRACE', JSON.stringify({event: 'workspace-response', at: Date.now(), width}));
        });
        page.on('console', message => {
          if (message.text().startsWith('LT970_TRACE ')) console.log('LT970_TRACE', JSON.stringify({...JSON.parse(message.text().slice(12)), width}));
        });
      }
      await page.goto(`${origin}/v41/?account=1#my/board?tree=${box.id}`, {waitUntil: 'load', timeout: 60000});
      await page.waitForFunction(() => !!window.LT41?.trees?.length, null, {timeout: 20000});
      await page.locator('#discover-ask-no').click().catch(() => {});
      // 보드 카드와 모바일 고르기 목록은 따로 그려지므로 둘 다 준비될 때까지 기다린다.
      await page.waitForFunction(({n, mobile}) => [...document.querySelectorAll('iframe')].some((f) => {
        try {
          const doc = f.contentDocument;
          return /track58-pinboard/.test(f.contentWindow.location.href)
            && doc.querySelectorAll('.card').length >= n
            && (!mobile || doc.querySelectorAll('.lt-moment-picker select option').length >= n);
        } catch { return false; }
      }), {n: box.moments.length, mobile: width === 390}, {timeout: 20000});
      const frame = page.frames().find((f) => /track58-pinboard/.test(f.url()));
      assert.ok(frame, `${width}: 보드 프레임이 열리지 않음`);
      assert.match(await page.evaluate(() => document.getElementById('source-label')?.textContent || ''), /모아둔 순간/, `${width}: 머리줄에 모아둔 순간 표시`);

      const target = box.moments[1];
      if (width === 1440) {
        // 목록: 카드 셋이 제목과 함께 보인다.
        const cards = await frame.evaluate(() => [...document.querySelectorAll('.card')].map((c) => ({id: c.dataset.id, title: c.querySelector('.cardTitle')?.textContent || '', visible: c.getClientRects().length > 0})));
        assert.deepEqual(cards.map((c) => c.id).sort(), box.moments.map((m) => m.id).sort(), `${width}: 목록에 모아둔 순간 셋`);
        for (const m of box.moments) assert.ok(cards.find((c) => c.id === m.id && c.title === m.title && c.visible), `${width}: 카드 '${m.title}'가 목록에 보인다`);
        // 하나를 누르면 맞는 상세가 열린다(자리 잡힘이 끝날 때까지 기다려 누른다).
        await frame.locator(`.card[data-id="${target.id}"]`).click({timeout: 10000});
        await frame.waitForFunction(() => document.getElementById('detail')?.classList.contains('open'), null, {timeout: 10000});
        assert.equal(await frame.evaluate(() => document.getElementById('dTitle')?.textContent || ''), target.title, `${width}: 누른 순간의 상세 제목`);
        // 닫으면 초점이 연 카드로 돌아온다.
        await frame.click('#detailClose');
        await frame.waitForFunction(() => !document.getElementById('detail')?.classList.contains('open'), null, {timeout: 5000});
        await page.waitForTimeout(150);
        const focus = await frame.evaluate((id) => {
          const a = document.activeElement;
          return {tag: a?.tagName || '', id: a?.id || '', isCard: !!(a?.classList?.contains('card') && a?.dataset?.id === id)};
        }, target.id);
        assert.equal(focus.isCard, true, `${width}: 상세를 닫으면 초점이 연 카드로 돌아온다(지금 초점: ${focus.tag}#${focus.id})`);
      } else {
        // 휴대폰 목록: 고르기(select)에 순간 셋이 순서대로 있다.
        const options = await frame.evaluate(rate => {
          const values = [...document.querySelectorAll('.lt-moment-picker select option')].map(o => o.value);
          if (rate) console.log('LT970_TRACE ' + JSON.stringify({event: 'test-read', at: Date.now(), count: values.length, pickerPresent: !!document.querySelector('.lt-moment-picker')}));
          return values;
        }, rate);
        assert.deepEqual(options, box.moments.map((m) => m.id), `${width}: 고르기 목록에 모아둔 순간 셋`);
        await frame.selectOption('.lt-moment-picker select', target.id);
        await frame.click('.lt-moment-picker button');
        await frame.waitForFunction(() => document.getElementById('detail')?.classList.contains('open'), null, {timeout: 10000});
        assert.equal(await frame.evaluate(() => document.getElementById('dTitle')?.textContent || ''), target.title, `${width}: 누른 순간의 상세 제목`);
        // 닫으면 초점이 연 단추(고르기 줄)로 돌아온다.
        await frame.click('#detailClose');
        await frame.waitForFunction(() => !document.getElementById('detail')?.classList.contains('open'), null, {timeout: 5000});
        await page.waitForTimeout(150);
        const focus = await frame.evaluate(() => {
          const a = document.activeElement;
          return {tag: a?.tagName || '', id: a?.id || '', inPicker: !!a?.closest?.('.lt-moment-picker')};
        });
        assert.equal(focus.inPicker, true, `${width}: 상세를 닫으면 초점이 고르기 줄로 돌아온다(지금 초점: ${focus.tag}#${focus.id})`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); await new Promise((ok) => server.close(ok)); }
});

