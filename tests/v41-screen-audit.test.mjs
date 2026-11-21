// 검사 함수는 tests/helpers/screen-audit.mjs에 있다(①겹침·가려짐 #635 규칙 ②가로 넘침·잘림 ③흔적 값 넷 #635 ④글자 기준선 #548 ⑤알림 줄이 아래 링크 줄·＋ 단추·새 소식 카드를 덮지 않음 #666).
// 화면 목록: 첫 화면(예시)·책(공유 링크, 마지막 장 포함)·보드·지도·둘러보기·의견 보내기 창(보내기 전·후)·어떻게 쓰나요 안내.
// #666이 더한 상태: 알림 줄(토스트)이 떠 있는 셸 첫 화면·보드 — ＋ 단추(body.lt-fab-ok)와 새 소식 카드가 함께 뜬 자리에서 잰다.
// #666 2번이 더한 상태: 계정 메뉴가 열린 자리·닫힌 자리의 첫 트리 안내 — 메뉴가 열려 있는 동안 안내는 접혀 있고 겹침 0.
// 크기·테마: 390·1440 × 밤·정원. 앞으로 화면 수리는 아래 SCREENS에 화면이나 상태를 한 줄 더하는 것으로 끝낸다.
// #678 후속 B가 더한 상태: 내 의견 덧붙임 고치기 열림 — 내 덧붙임의 고치기 입력칸·단추·(고침) 표시가 함께 보이는 자리.
//
// 알려진 문제(기준을 낮추지 않는다): main에서 이미 나는 실패는 KNOWN에 화면·항목·이슈 번호와 함께 적고,
// 그 줄은 빨강이 아니라 보고로 넘긴다. KNOWN에 없는 실패만 이 시험을 빨갛게 만든다.
// 크롬(Playwright chromium)이 없는 곳에서는 건너뛴다 — CI(LT_SCREEN_AUDIT_REQUIRE=1)에서는 건너뜀을 실패로 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_SCREEN_AUDIT_REQUIRE === '1';
const SCREEN_AUDIT_CAPTURE_DIR = fileURLToPath(new URL('../test-results/v41-screen-audit/', import.meta.url));
const screenAuditCapture = (name) => {
  mkdirSync(SCREEN_AUDIT_CAPTURE_DIR, { recursive: true });
  return join(SCREEN_AUDIT_CAPTURE_DIR, name);
};
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium이 없어 화면 공통 검사를 건너뜀';
} catch { skip = 'playwright 패키지가 없어 화면 공통 검사를 건너뜀'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '빌드 결과가 없어 화면 공통 검사를 건너뜀(npx vite build 필요)';

// — 알려진 문제 목록 — main에서 이미 나는 것(기준을 낮추지 않고 따로 기록한다. 목록 밖의 새 실패만 빨강이 된다) —
// 형식: { 화면(줄 맨 앞), 항목, 찾을: 줄에서 찾을 정규식, 이슈 }
// #662에서 보드·안내·책의 항목을 모두 고쳐 KNOWN에서 뺐다 — 이제 검사기가 지켜서 새로 생기면 빨강이 된다.
// (261116: 둘러보기 카드 10·11px(#540·#611 3번)도 12px 이상으로 고쳐 KNOWN에서 뺐다 — #705 후속. KNOWN 4→3건.)
const KNOWN = [
  // #666 2번의 새 상태가 처음 그린 자리 — 첫 화면 '최근 순간' 카드(src/views/orbit.js:80)의 아래 두 줄이 11px다
  // (레거시 첫 화면 모양. 트리가 있어야 뜨므로 지금까지 잰 적이 없었다). 이 이슈에서는 손대지 않는다.
  { 화면: '계정 메뉴·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  { 화면: '계정 메뉴 닫힘·첫 트리 안내', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548(12px 기준)·레거시 첫 화면' },
  // '첫 화면 글자 카드' 상태(261116, #728 후속)가 처음 잰 자리 — 레거시 첫 화면·SRC064 원본의 기존 모양.
  { 화면: '첫 화면 글자 카드', 항목: '작은글자', 찾을: 'small "(마지막 순간|시험 · 이어 보기)', 이슈: '#548·레거시 첫 화면(계정 메뉴 상태와 같은 줄)' },
  { 화면: '첫 화면 글자 카드', 항목: '작은글자', 찾을: 'div.memo(Kicker|Foot)', 이슈: 'SRC064 궤도 메모 카드 원본 9px(#728 후속 — 이 이슈에서 손대지 않는다)' },
  { 화면: '첫 화면 글자 카드', 항목: '겹침', 찾을: 'span.lt-fallback-date × strong.lt-fallback-title', 이슈: '#728 후속 — legacy box의 rect 보고(그림은 3줄 말줄임 — 2070·1440 줌 실측)' },
  { 화면: '첫 화면 글자 카드', 항목: '겹침', 찾을: '(span.lt-fallback-emotion × (strong|small)|strong.lt-fallback-title × button.subtleBtn|small.lt-fallback-notice × button.subtleBtn|div.firstMark × small)', 이슈: '궤도 카드가 가운데 UI 뒤를 지나가는 3D 원본 배치(#728 후속 — 궤도 배치 불변)' },
  // 지도 — Track56 원본 모양: 안내 문구가 캔버스 뒤에 깔려 있다(원본 보존 커밋 b2567fe — 원본 구조는 바꾸지 않는다).
  { 화면: '지도', 항목: '가려짐', 찾을: 'p ← canvas#stage', 이슈: 'Track56 원본(b2567fe)' },
  // (261116, '둘러보기 소개 질문'·'공유 판·소개 스위치' 상태가 처음 잰 자리) 회원 계정의 궤도 첫 화면 —
  // 실제 기록이 있어야 그리는 레거시 카드라 지금까지 안 잰 곳. #548·#728과 같은 원본 모양이라 이 이슈에서 손대지 않는다.
  { 화면: '둘러보기 소개 질문', 항목: '작은글자', 찾을: 'span.lt-fallback-action "제목 달기"', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '둘러보기 소개 질문', 항목: '작은글자', 찾을: 'small "(마지막 순간|모아둔 순간)', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '공유 판·소개 꺼짐', 항목: '작은글자', 찾을: 'span.lt-fallback-action "제목 달기"', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '공유 판·소개 꺼짐', 항목: '작은글자', 찾을: 'small "(마지막 순간|모아둔 순간)', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '공유 판·소개 켜짐', 항목: '작은글자', 찾을: 'span.lt-fallback-action "제목 달기"', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '공유 판·소개 켜짐', 항목: '작은글자', 찾을: 'small "(마지막 순간|모아둔 순간)', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '꼬리표 직접 붙이기', 항목: '작은글자', 찾을: 'span.lt-fallback-action "제목 달기"', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
  { 화면: '꼬리표 직접 붙이기', 항목: '작은글자', 찾을: 'small "(마지막 순간|모아둔 순간)', 이슈: '#548(12px 기준)·레거시 궤도 카드' },
];

// #638: '내 의견 목록' 상태 — 상태 말 네 가지·답변·새 소식 링크가 한 화면에 보이게 하는 가짜 게시물.
// #678 후속 B: p5에는 내 덧붙임 둘(하나는 고친 것 — (고침) 표시)과 운영센터 답변 하나가 있다.
// 운영센터 답변도 authorType은 'customer'지만 canEdit·canDelete가 false라 고치기·지우기 단추가 그려지지 않아야 한다.
const MINE_POSTS = [
  { id: 1, kind: 'opinion', status: 'received', createdAt: '2026-11-10T09:00:00.000Z', title: '책 넘기기가 느려요', body: '책 넘기기가 느려요\n390 화면에서 특히 그래요', issueNumber: null, replies: [] },
  { id: 2, kind: 'opinion', status: 'reviewing', createdAt: '2026-11-11T09:00:00.000Z', title: '지도 글자가 작아요', body: '지도 글자가 작아요', issueNumber: null, replies: [{ id: 'r1', mine: false, body: '살펴보고 있어요' }] },
  { id: 3, kind: 'opinion', status: 'fixed', createdAt: '2026-11-12T09:00:00.000Z', title: '지도 날짜가 잘못 보여요', body: '지도 날짜가 잘못 보여요', issueNumber: 638, replies: [{ id: 'r2', mine: false, body: '4.1.4에서 고쳤어요' }] },
  { id: 4, kind: 'journal', status: 'closed', createdAt: '2026-11-13T09:00:00.000Z', title: '오늘 사용 일지', body: '오늘 사용 일지 내용', issueNumber: null, replies: [] },
  { id: 5, kind: 'opinion', status: 'reviewing', createdAt: '2026-11-15T09:00:00.000Z', title: '내 의견 덧붙임 고치기 화면 확인', body: '내 의견 덧붙임 고치기 화면을 확인하기 위한 시험 의견입니다', issueNumber: null, replies: [
    { id: 'f1', authorType: 'customer', mine: true, canEdit: true, canDelete: true, edited: false, body: '처음 남긴 덧붙임', createdAt: '2026-11-15T09:05:00.000Z' },
    { id: 'f2', authorType: 'customer', mine: true, canEdit: true, canDelete: true, edited: true, body: '고쳐서 저장한 덧붙임', createdAt: '2026-11-15T09:06:00.000Z' },
    { id: 'f3', authorType: 'customer', mine: false, canEdit: false, canDelete: false, edited: false, body: '운영센터가 남긴 답변입니다. 덧붙임이 아니라 단추가 보이지 않아요.', createdAt: '2026-11-15T09:07:00.000Z' }
  ] }
];

// #678 후속(회차 지적): 둘러보기 상태 — 반응이 하나도 없는 공개 트리 카드. 0짜리 칩 7개 대신
// '반응 남기기' 한 개만 보이는지 검사한다. 카드 글자 중 main에서 이미 10·11px인 것은 KNOWN으로 넘긴다.
const COMMUNITY_CARDS = [
  { shareId: 'c0000000000000000000000a', title: '화면 확인용 공개 트리', subject: '확인 대상', summary: '첫 순간 소개', createdAt: '2026-11-15T09:00:00.000Z', momentCount: 3, aiTester: false, emotions: ['설렘'], cover: { url: 'https://i.ytimg.com/vi/qaScreenAudit001/hqdefault.jpg', title: '첫 순간', emotion: '설렘' }, stats: { favorites: 0, hearts: 0, favored: false, hearted: false, reactions: { heart: 0, like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0 }, mine: [] } }
];

const knownHit = (항목, 줄) => KNOWN.some((k) => 줄.startsWith(k.화면) && k.항목 === 항목 && new RegExp(k.찾을).test(줄));

// 썸네일 자리를 채우는 1px PNG — 외부 네트워크 없이 결정적으로(썸네일 카드 모양) 그린다.
const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

// 시험 트리(#635와 같은 모양 — 순간 3개 사슬, 첫 순간은 유튜브). 가짜 데이터다.
// 첫 순간이 두 갈래(e2·e3)를 나가므로 첫 장에 갈림길 탭이 보인다 — #700 후속 탭 글자 크기·잘림 검사 대상.

// #942: 초심자·기존 사용자의 추가 단추와 단추별 숫자 묶음을 실제 화면에서 잰다.
test('#942 첫 화면 추가 단추와 숫자 묶음', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(skip);
  const server=await serve(),base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  const dest=process.env.LT_HOME_CTA_CAPTURE;
  if(dest)mkdirSync(dest,{recursive:true});
  const make=(subject,count)=>{
    const input=i=>({subject,title:'시험 순간 '+(i+1),date:'2026-11-'+String(i+1).padStart(2,'0'),emotion:'설렘',note:'화면 확인용 가짜 기록',url:i===count-1?'':i%3===0?'https://audit.invalid/photo.jpg':i%3===1?'https://www.youtube.com/watch?v=dQw4w9WgXcQ':''});
    const clock=i=>'2026-11-'+String(i+1).padStart(2,'0')+'T00:00:00.000Z';
    let tree=createTree(input(0),clock(0));for(let i=1;i<count;i++)tree=addMoment(tree,input(i),tree.moments[0].id,clock(i));
    return tree;
  };
  const trees=[make('좋아하는 순간들',8),make('여름',3),make('함께 부른 노래',3)];
  const workspace={revision:1,state:{version:1,trees,prefs:{displayName:'화면검사 시험계정'}},subject:'visual-audit-fake',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z'};
  const share={id:'audit-share-000000000001',treeId:trees[0].id,view:'book',status:'active',origin:'manual',createdAt:'2026-11-20T00:00:00.000Z'};
  const measure=e=>{
    const s=getComputedStyle(e),r=e.getBoundingClientRect();
    const L=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const a=L(s.backgroundColor),b=L(s.color);
    return {text:e.textContent.trim(),bg:s.backgroundColor,ink:s.color,border:s.borderTopWidth,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),visible:!!e.getClientRects().length,x:r.x,y:r.y,w:r.width,h:r.height};
  };
  const failures=[];
  const check=(ok,message)=>{if(!ok)failures.push(message)};
  try{
    for(const theme of ['night','garden'])for(const [width,height] of [[390,844],[1440,900]])for(const kind of ['guest','empty','member']){
      const member=kind==='member',signedIn=kind!=='guest';
      const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
      try{
        await ctx.addInitScript(t=>{localStorage.setItem('lt41.theme',t);localStorage.setItem('lt41.tips.firstTree','1')},theme);
        await ctx.route('**/*',r=>{
          const u=new URL(r.request().url());
          if(u.origin!==base)return u.hostname==='i.ytimg.com'||u.hostname==='audit.invalid'?THUMB(r):r.abort();
          if(u.pathname==='/api/workspace'&&signedIn)return r.fulfill({status:200,json:{...workspace,state:{...workspace.state,trees:member?trees:[]}}});
          if(u.pathname==='/api/shares'&&member)return r.fulfill({status:200,json:{ok:true,items:[share],shares:[share]}});
          if(u.pathname==='/api/community/stats')return r.fulfill({status:200,json:{trees:17,moments:123}});
          if(u.pathname.startsWith('/api/'))return r.fulfill({status:200,json:{ok:true,items:[]}});
          return r.continue();
        });
        const page=await ctx.newPage();
        await page.goto(base+'/v41/'+(signedIn?'?account=1':'')+'#home');
        if(signedIn)await page.waitForFunction(()=>document.body.dataset.member==='in'&&!document.querySelector('#account-avatar')?.hidden);
        if(member){
          await page.waitForFunction(()=>window.LT41?.trees?.length===3);
          const ask=page.locator('#discover-ask-no');
          await ask.waitFor({state:'visible',timeout:4000}).catch(()=>{});
          if(await ask.isVisible())await ask.click();
          await ask.waitFor({state:'hidden'});
        }
        const current=page.frameLocator('#view');
        const first=member?'moments':'start';
        await current.locator('.center .actions [data-do='+first+']').waitFor({state:'visible'});
        await current.locator('.center .actions [data-do='+first+']').evaluate(async e=>{await e.ownerDocument.fonts.ready});
        await current.locator('.home-count:not([hidden])').first().waitFor({state:'visible'});
        await page.waitForTimeout(450);
        const buttons=await current.locator('.center .actions > .subtleBtn,.center .actions > .home-action-group > .subtleBtn').evaluateAll((es,fn)=>es.map(e=>({text:e.textContent.trim(),bg:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderTopWidth})));
        const headers=await page.locator('#write-menu,#mobile-add').evaluateAll(es=>es.map(e=>({id:e.id,visible:!!e.getClientRects().length})));
        const head=await page.locator('#write-menu').evaluate(measure),fab=await page.locator('#mobile-add').evaluate(measure);
        const top=await current.locator('.home-add-top').count()?await current.locator('.home-add-top').evaluate(measure):null;
        const groups=await current.locator('.home-action-group').evaluateAll(es=>es.map(e=>{
          const b=e.querySelector('.subtleBtn'),n=e.querySelector('.home-count'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect(),nr=n.getBoundingClientRect();
          const range=document.createRange();range.selectNodeContents(n);const tr=range.getBoundingClientRect();
           const lines=[...n.querySelectorAll('.home-count-line')].map(row=>row.textContent.trim());
           return {label:b.textContent.trim(),count:n.hidden?'':lines.join('|'),x:r.x,y:r.y,w:r.width,h:r.height,inner:n.hidden?null:nr.top-br.bottom,center:n.hidden?null:(tr.left+tr.width/2)-(br.left+br.width/2),font:parseFloat(getComputedStyle(n).fontSize),overflow:n.hidden?0:Math.max(0,tr.right-br.right,br.left-tr.left)};
        }));
        const values={buttons,headers,head,fab,top,groups};const key=width+'-'+theme+'-'+kind;
        console.log('#942',key,JSON.stringify(values));
        if(dest){
          if(width===1440)await current.locator('.card:not(.off):not(.clash)').first().waitFor({state:'visible',timeout:8000});
          await page.screenshot({path:join(dest,'home-'+key+'.png'),animations:'allow'});
        }
        const rose=theme==='night'?'rgb(180, 87, 107)':'rgb(152, 80, 94)';
        const visibleAdds=[head,fab,top].filter(b=>b?.visible);
        check(visibleAdds.length===(member?(width===1440?2:1):0),key+' 추가 단추 개수 '+JSON.stringify(visibleAdds));
        if(top?.visible)check(top.bg===rose&&top.ink==='rgb(255, 255, 255)'&&top.contrast>=4.5,key+' 가운데 장미색·대비 '+JSON.stringify(top));
        if(head.visible)check(head.bg!==rose&&head.border!=='0px'&&head.contrast>=4.5,key+' 머리줄은 밝은 테두리 '+JSON.stringify(head));
        check(head.visible===(member&&width===1440)&&!fab.visible&&!!top?.visible===member,key+' 추가 단추 위치');
        check(JSON.stringify(buttons.map(b=>b.text))===JSON.stringify(member?['순간 목록','둘러보기','서재']:['＋ 첫 순간 추가','둘러보기','어떻게 쓰나요']),key+' 가운데 순서');
        const light=theme==='night'?'rgb(238, 233, 224)':'rgb(255, 253, 248)';
        check(member?buttons.every(b=>b.bg===light):buttons[0]?.bg===rose,key+' 자주색 하나·나머지는 밝은 단추(#1084) '+JSON.stringify(buttons.map(b=>b.bg)));
        check(buttons.slice(member?0:1).every(b=>b.bg===light&&b.border!=='0px'),key+' 밝은 바탕·얇은 테두리 '+JSON.stringify(buttons));
        check(groups.length===3,key+' 묶음 3개');
         check(JSON.stringify(groups.map(g=>g.count))===JSON.stringify(member?['순간 14|','공개 트리 17|공개 순간 123','트리 3|공개 트리 1']:['',(signedIn?'':'예시 ')+'공개 트리 17|순간 123','']),key+' 숫자 귀속');
        for(const g of groups.filter(g=>g.count))check(g.inner>=4&&g.inner<=6&&Math.abs(g.center)<=2&&g.font>=12&&g.overflow<=1,key+' 숫자 간격 '+JSON.stringify(g));
        for(let i=1;i<groups.length;i++){
          const a=groups[i-1],b=groups[i],gap=Math.abs(a.y-b.y)<2?b.x-a.x-a.w:b.y-a.y-a.h;
          check(gap>=Math.max(width===1440?16:14,3*5),key+' 묶음 간격 '+gap);
        }
      }finally{await ctx.close()}
    }
  }finally{await browser.close();await new Promise(r=>server.close(r))}
  assert.deepEqual(failures,[]);
});

// #987: 공유·설정 창은 실제로 열린 상태에서 폭, 위치, 대비와 선택 표시를 잰다.
test('#987 공유 창 폭·단추·대비와 설정 정렬·동그라미·배치', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  if (skip) assert.fail(skip);
  const server = await serve(), base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const dest = process.env.LT_VISUAL_987_CAPTURE;
  if (dest) mkdirSync(dest, { recursive: true });
  const failures = [];
  const check = (condition, reason) => { if (!condition) failures.push(reason); };
  const make = (title, count) => {
    const input = i => ({subject:title,title:'화면 검사 순간 ' + (i+1),date:'2026-11-' + String(i+1).padStart(2,'0'),emotion:'설렘',note:'가짜 화면 검사 기록입니다.',url:i%3===0?'https://audit.invalid/photo.jpg':i%3===1?'https://www.youtube.com/watch?v=dQw4w9WgXcQ':''});
    let t = createTree(input(0));
    for (let i=1;i<count;i++) t=addMoment(t,input(i),t.moments[0].id);
    return t;
  };
  const trees=[make('좋아하는 무대의 길고 긴 순간들',8),make('여름',3),make('함께 부른 노래',3)];
  const workspace={revision:1,state:{version:1,trees,prefs:{displayName:'화면검사 시험계정'}},subject:'visual-audit-fake',writeSubjectBound:true,savedAt:'2026-11-20T00:00:00.000Z'};
  const share={id:'audit-share-000000000001',treeId:trees[0].id,view:'book',status:'active',origin:'manual',createdAt:'2026-11-20T00:00:00.000Z'};
  const sizes=[[390,844],[1440,900],[2560,1440]], layoutRatios=new Map();
  try {
    for (const theme of ['night','garden']) for (const [width,height] of sizes) {
      const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      try {
        await ctx.addInitScript(t=>localStorage.setItem('lt41.theme',t),theme);
        await ctx.route('**/*',route=>{
          const u=new URL(route.request().url());
          if(u.origin!==base) return u.hostname==='i.ytimg.com'||u.hostname==='audit.invalid'?THUMB(route):route.abort();
          if(u.pathname==='/api/workspace')return route.fulfill({status:200,json:workspace});
          if(u.pathname==='/api/account')return route.fulfill({status:200,json:{ok:true,email:'audit@example.invalid',subject:workspace.subject}});
          if(u.pathname==='/api/shares')return route.fulfill({status:200,json:{ok:true,items:[share],shares:[share]}});
          if(u.pathname.startsWith('/api/'))return route.fulfill({status:200,json:{ok:true,items:[]}});
          return route.continue();
        });
        const page=await ctx.newPage();
        await page.goto(base+'/v41/?account=1#shelf');
        await page.waitForFunction(()=>window.LT41?.trees?.length===3&&!document.querySelector('#account-avatar')?.hidden);
        const ask=page.locator('#discover-ask-no');
        if(await ask.isVisible())await ask.click();
        await page.locator('#record-menu').click();
        await page.locator('[data-tree-action="shelf"]').click();
        await page.locator('#record-menu').click();
        await page.locator('[data-tree-action="share"]').click();
        await page.locator('#share-panel[open] .share-item-actions button').first().waitFor();
        const snap=async(label,id)=>{
          if(!dest)return;
          const name=label+'-'+width+'-'+theme;
          await page.screenshot({path:join(dest,name+'.png'),animations:'disabled'});
          const dialog=page.locator(id);
          const scroll=await dialog.evaluate(e=>e.scrollHeight>e.clientHeight+20);
          if(scroll){
            await dialog.evaluate(e=>e.scrollTop=e.scrollHeight);
            await page.screenshot({path:join(dest,name+'-bottom.png'),animations:'disabled'});
            await dialog.evaluate(e=>e.scrollTop=0);
          }
        };
        const shared=await page.evaluate(()=>{
          const $=s=>document.querySelector(s), rect=e=>e.getBoundingClientRect(), css=e=>getComputedStyle(e);
          const panel=$('#share-panel'), form=$('#share-form'), r=rect(panel), fr=rect(form), preview=$('#share-preview');
          const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
          const mix=(front,back)=>{const a=front[3]??1;return front.slice(0,3).map((v,i)=>v*a+back[i]*(1-a));};
          const l=c=>c.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
          const ratio=(a,b)=>(Math.max(l(a),l(b))+0.05)/(Math.min(l(a),l(b))+0.05);
          const bg=mix(rgb(css(panel).backgroundColor),rgb(css(document.documentElement).backgroundColor));
          const outline=e=>{const s=css(e),surface=mix(rgb(s.backgroundColor),bg);const stroke=mix(rgb(s.borderTopColor),surface);return Math.min(ratio(stroke,surface),ratio(stroke,bg));};
          const look=e=>{const s=css(e);return {radius:s.borderTopLeftRadius,bg:s.backgroundColor,border:s.borderTopColor,color:s.color,height:rect(e).height}};
          const buttons=[...panel.querySelectorAll('.share-item-actions button')].map(look), ref=look(preview);
          const section=panel.querySelector(':scope > section:last-of-type');
          // 공유 제목의 실제 글자 아래끝과 선택 상자 위끝 사이를 잰다.
          const labelGaps=['#share-moment','#share-view'].map(id=>{const select=$(id),range=document.createRange();range.selectNode(select.parentElement.firstChild);return rect(select).top-range.getBoundingClientRect().bottom});
          return {labelGaps,formWidth:fr.width,centerOffset:Math.abs((fr.left+fr.right-r.left-r.right)/2),otherWidths:[...panel.querySelectorAll(':scope > .share-steps,:scope > .share-visibility,:scope > .panel-note,:scope > section:not([hidden])')].map(e=>rect(e).width),buttons,ref,contrast:[outline($('#share-moment')),outline($('#share-view')),outline(preview)],topGap:rect(panel.querySelector('.panel-heading')).top-r.top,bottomGap:r.bottom-rect(section).bottom,overflow:panel.scrollWidth-panel.clientWidth};
        });
        console.log('#987 share',width,theme,JSON.stringify(shared));
        await snap('share','#share-panel');
        if(width===390||width===1440)check(shared.labelGaps.every(gap=>gap>=6),'공유 제목과 선택 상자 간격 '+width+' '+theme+' '+JSON.stringify(shared.labelGaps));
        check(shared.formWidth<=960.5&&shared.otherWidths.every(w=>w<=960.5)&&shared.centerOffset<=2&&shared.overflow<=1,'공유 폭 '+width+' '+theme);
        check(shared.buttons.length===2&&shared.buttons.every(b=>b.radius===shared.ref.radius&&b.bg===shared.ref.bg&&b.border===shared.ref.border&&b.color===shared.ref.color&&b.height>=44),'공유 단추 '+width+' '+theme);
        if(theme==='garden')check(shared.contrast.every(n=>n>=3),'공유 정원 대비 '+width+' '+JSON.stringify(shared.contrast));
        if(width===2560)check(Math.abs(shared.topGap-shared.bottomGap)<=70,'공유 세로 배치 '+theme+' '+JSON.stringify([shared.topGap,shared.bottomGap]));
        await page.locator('#share-panel [data-close]').click();
        await page.locator('#account-avatar').click();
        await page.locator('#account-open-settings').click();
        await page.locator('#account-settings[open]').waitFor();
        for(const tab of ['records','profile','account','screen']){
          await page.locator('#settings-tab-'+tab).click();
          await page.locator('#account-settings-'+tab+':not([hidden])').waitFor();
          if(tab==='records')await page.locator('#settings-tree-visibility-list .settings-row').first().waitFor();
          const m=await page.evaluate(tab=>{
            const $=s=>document.querySelector(s),r=e=>e.getBoundingClientRect(), panel=$('#account-settings'), p=r(panel), layout=r($('.settings-layout')), title=r(panel.querySelector('.panel-heading')), page=r($('#account-settings-'+tab));
            const rows=[...document.querySelectorAll('#settings-tree-visibility-list .settings-row')].map(e=>{const a=e.querySelector('[data-tree-visibility-value="public"]'),b=e.querySelector('[data-tree-visibility-value="private"]');return [r(a).x,r(b).x]});
            const circles=[...document.querySelectorAll('#profile-color button')].map(e=>({w:r(e).width,h:r(e).height,y:r(e).y}));
            return {layoutWidth:layout.width,widthRatio:layout.width/p.width,topGap:title.top-p.top,bottomGap:p.bottom-layout.bottom,centerRatio:(title.top+layout.bottom-2*p.top)/(2*p.height),overflow:panel.scrollWidth-panel.clientWidth,rows,circles,pageWidth:page.width};
          },tab);
          console.log('#987 settings',tab,width,theme,JSON.stringify(m));
          await snap('settings-'+tab,'#account-settings');
          check(m.overflow<=1,'설정 가로 넘침 '+tab+' '+width+' '+theme);
          if(tab==='records'){
            const spread=i=>Math.max(...m.rows.map(r=>r[i]))-Math.min(...m.rows.map(r=>r[i]));
            check(m.rows.length===3&&spread(0)<=2&&spread(1)<=2,'기록 버튼 열 '+width+' '+theme+' '+JSON.stringify(m.rows));
          }
          if(tab==='profile'){
            check(m.circles.length===8&&m.circles.every(c=>c.h>=44&&Math.abs(c.w/c.h-1)<=0.05),'프로필 원 '+width+' '+theme);
            if(width===390)check([...new Set(m.circles.map(c=>c.y))].every(y=>m.circles.filter(c=>c.y===y).length===4),'프로필 색상 두 줄 '+theme);
          }
          if(width===1440)layoutRatios.set(theme+tab,m);
          if(width===2560&&(tab==='profile'||tab==='account')){
            const prev=layoutRatios.get(theme+tab);
            check(Math.abs(prev.widthRatio-m.widthRatio)<=0.03&&Math.abs(prev.centerRatio-m.centerRatio)<=0.05&&Math.abs(m.topGap-m.bottomGap)<=50,'설정 큰 화면 비율 '+tab+' '+theme);
          }
        }
      } finally {await ctx.close();}
    }
  } finally {await browser.close();await new Promise(r=>server.close(r));}
  assert.deepEqual(failures,[]);
});

const VIDEO_TITLE = 'Super Shy — Official MV';
const tree = (() => {
  const moments = [
    { id: 'm1', title: 'super shy — official mv', date: '2026-11-01', emotion: '설렘', note: '첫 날의 글', parentId: null, relation: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaMetadata: { title: VIDEO_TITLE, channel: '예시 채널' }, x: null, y: null, rot: 0, color: 'rose', keywords: [], privacy: 'public' },
    { id: 'm2', title: '둘째 순간', date: '2026-11-02', emotion: '행복', note: '이어지는 글', parentId: 'm1', relation: '같이 들어서', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'sky', keywords: ['무대'], privacy: 'public' },
    { id: 'm3', title: '마지막 순간', date: '2026-11-03', emotion: '그리움', note: '끝의 글', parentId: 'm1', relation: '', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'gold', keywords: [], privacy: 'public' }
  ];
  const edges = [
    { id: 'e2', kind: 'parent', from: 'm1', to: 'm2', reason: '같이 들어서' },
    { id: 'e3', kind: 'parent', from: 'm1', to: 'm3', reason: '다른 경로' }
  ];
  return { id: 't1', title: '시험 트리', moments, edges };
})();

// 공유(감상) 호스트 — 셸이 LT41.source='share'를 iframe에 넘기는 것과 같은 틀(#635).
const shareHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>호스트</title></head><body data-member="out" data-record-source="share">
<script>window.LT41={source:'share',writable:false,owned:false,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script>
<iframe src="/v41/views/track59-sketchbook.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// 첫 화면 호스트 — 로그아웃 상태(예시 데이터가 그려진다).
const homeHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>첫 화면 호스트</title></head><body data-member="out" data-record-source="file" data-tree-count="0">
<script>window.LT41={source:'file',member:'out',treeCount:0,trees:[],prefs:{}};</script>
<iframe src="/v41/home.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// #666: 알림 줄을 실제 사용자 길로 띄운다 — 기록 파일을 열면 셸이 '파일을 열었어요…'(또는 '불러오기 실패…') 안내를 올린다.
// 알림 줄은 셸(index.html)의 #toast이고, 아래 링크 줄·＋ 단추·새 소식 카드도 같은 문서에 있다.
const raiseToast = async (page) => {
  await page.setInputFiles('#file', { name: 'record.json', mimeType: 'application/json', buffer: Buffer.from('{"trees":"깨진 값"}') }).catch(() => {});
  await page.waitForFunction(() => { const t = document.getElementById('toast'); return !!t && !t.hidden; }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
  // 알림 줄이 실제로 떠 있고, 자리가 아래에 붙은 것들 위로 잡혔는지 먼저 확인한다(검사가 빈손으로 통과하지 않게).
  const box = await page.evaluate(() => {
    const t = document.getElementById('toast');
    const r = t.getBoundingClientRect();
    return { hidden: t.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), gap: getComputedStyle(document.documentElement).getPropertyValue('--lt-toast-bottom').trim(), text: t.textContent };
  });
  assert.equal(box.hidden, false, '알림 줄이 떠 있다');
  assert.ok(box.text.trim().length > 0, '알림 줄에 글자가 있다');
  assert.ok(Number.parseFloat(box.gap) > 0, `알림 줄 자리를 아래에 붙은 것들 위로 잡았다(--lt-toast-bottom: ${box.gap || '없음'})`);
  return box;
};
const lowerToast = async (page) => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); };

// #666 2번: 첫 트리 안내와 계정 메뉴는 한 번에 하나만. 안내는 서버 기록·로그인 소유자가 첫 트리를
// 만든 자리에서만 뜨므로(tipsWanted), 가짜 /api/workspace로 그 자리를 만든다. 트리 하나·순간 하나.
// 기록 문서는 도메인 규칙을 통과해야 셸이 '내 기록'으로 받아 준다(손으로 만든 트리는 거절된다) — createTree로 만든다.
let firstTree = createTree({ subject: '시험', title: '시험 트리', note: '기록', emotion: '설렘', date: '2026-11-15', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, '2026-11-15T00:00:00.000Z');
// #627 PR B: '꼬리표 줄이 열린 상세'·'꼬리표 정리 화면' 상태에 쓰는 모양 — 첫 순간에는 꼬리표가 있고(종류 표시와 옛 낱말 섞음),
// 둘째 순간에는 없어 '제목에서 꼬리표 한 번에 제안받기'의 대상이 된다. 도메인 규칙을 통과하는 값만 쓴다.
firstTree.moments[0].keywords = ['노래:Super Shy', '무대'];
// #678 후속(꼬리표 걸러 보기): 걸러 보기 상태 전용 트리 — 둘째 순간(꼬리표 없음)이 있어야
// 칩을 눌렀을 때 목록이 2건→1건으로 줄어드는 것을 검사할 수 있다. addMoment는 불변이므로 반환 트리를 쓴다.
const twoMomentTree = addMoment(firstTree, { subject: '시험', title: '뉴진스 Super Shy 직캠 @인기가요 23716', note: '기록', emotion: '설렘', date: '2026-11-15', url: '' }, firstTree.moments[0].id, '2026-11-15T00:01:00.000Z');
if (!twoMomentTree?.moments || twoMomentTree.moments.length !== 2) throw new Error('시험 트리의 둘째 순간을 만들지 못했다');
const fiveMomentTree = (() => {
  let t = twoMomentTree;
  const rows = [
    { title: '데뷔 무대의 첫 인사', date: '2026-11-13' },
    { title: '팬콘에서 함께 부른 노래', date: '2026-11-14' },
    { title: '다시 펼친 연습 영상', date: '2026-11-15' }
  ];
  rows.forEach((row, i) => {
    t = addMoment(t, { subject: '시험', title: row.title, note: '가짜 화면 점검 기록', emotion: '설렘', date: row.date, url: '' }, t.moments[0].id, `2026-11-15T00:0${i + 2}:00.000Z`);
    t.moments.at(-1).keywords = [];
  });
  return t;
})();
if (!fiveMomentTree?.moments || fiveMomentTree.moments.length < 5) throw new Error('화면 점검용 가짜 트리에 순간이 다섯 개 미만이다');

// #627 PR3: '그래프 보기' 상태의 시험 트리 — 꼬리표 허브 8종(무대·노래·멤버·가수)·같은 영상 묶음(stacks)·
// 꼬리표 없는 순간 3개(선반·제안받기 대상). 도메인 규칙(createTree·addMoment)으로 만들어 셸이 그대로 받게 한다 —
// 호스트(LT41 직접 주입)와 셸 주소(#my/graph) 양쪽에서 같은 트리를 쓴다.
const graphTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  const defs = [
    { title: '데뷔쇼 첫 무대', date: '2026-01-10', url: V + 'aaa11111111', keywords: ['가수:하츠투하츠', '무대:데뷔쇼'] },
    { title: '데뷔쇼 다시 보기', date: '2026-01-20', url: V + 'aaa11111111', keywords: ['가수:하츠투하츠', '무대:데뷔쇼'] },
    { title: '쇼챔 1주차', date: '2026-02-05', url: V + 'bbb22222222', keywords: ['가수:하츠투하츠', '무대:쇼챔피언', '노래:With'] },
    { title: '쇼챔 2주차', date: '2026-02-12', url: V + 'bbb22222222', keywords: ['가수:하츠투하츠', '무대:쇼챔피언', '노래:With', '멤버:제나'] },
    { title: '쇼챔 3주차', date: '2026-02-19', url: V + 'ccc33333333', keywords: ['가수:하츠투하츠', '무대:쇼챔피언', '노래:15-LOVE'] },
    { title: '제나 직캠', date: '2026-03-01', url: V + 'ddd44444444', keywords: ['가수:하츠투하츠', '멤버:제나'] },
    { title: '제나 직캠 세로', date: '2026-03-02', url: V + 'ddd44444444', keywords: ['가수:하츠투하츠', '멤버:제나'] },
    { title: '팬콘 하이투치', date: '2026-04-10', url: V + 'eee55555555', keywords: ['가수:하츠투하츠', '무대:팬콘'] },
    { title: '팬콘 앙코르', date: '2026-04-11', url: V + 'eee55555555', keywords: ['가수:하츠투하츠', '무대:팬콘'] },
    { title: '멜론 어워즈 무대', date: '2026-05-20', url: V + 'fff66666666', keywords: ['가수:하츠투하츠', '무대:멜론뮤직어워즈'] },
    { title: 'RESCENE 단체 컨셉', date: '2026-06-01', url: V + 'ggg77777777', keywords: ['가수:RESCENE'] },
    { title: 'RESCENE 비하인드', date: '2026-06-02', url: V + 'hhh88888888', keywords: ['가수:RESCENE'] },
    { title: 'With 연습실', date: '2026-02-22', url: '', keywords: ['노래:With'] },
    { title: '15-LOVE 무대 영상', date: '2026-03-15', url: V + 'iii99999999', keywords: ['노래:15-LOVE'] },
    { title: '벤치의 기억', date: '2026-02-01', url: '', keywords: [] },
    { title: '산책한 날', date: '2026-04-03', url: '', keywords: [] },
    { title: '창밖의 비', date: '2026-05-05', url: '', keywords: [] }
  ];
  let t = createTree({ subject: '시험', title: '시험 트리(꼬리표)', note: '기록', emotion: '설렘', date: defs[0].date, url: defs[0].url }, '2026-11-15T00:00:00.000Z');
  t.moments[0].keywords = defs[0].keywords;
  for (let i = 1; i < defs.length; i++) {
    t = addMoment(t, { subject: '시험', title: defs[i].title, note: '기록', emotion: '설렘', date: defs[i].date, url: defs[i].url }, t.moments[0].id, '2026-11-15T00:0' + Math.min(i, 9) + ':00.000Z');
    t.moments.at(-1).keywords = defs[i].keywords;
  }
  return t;
})();
// 첫 화면 글자 카드(261116): 내려간 영상(없는 id → 회색 120×90)의 '영상을 볼 수 없어요' 카드를
// 궤도에서 그리기 위한 시험 트리 — 긴 사용자 제목 1건(3줄 높이 절단 대상)·영상 제목+채널 1건(보조 줄)·사진 1건.
const thumbTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  let t = createTree({ subject: '시험', title: '글자 카드 시험 트리', note: '기록', emotion: '설렘', date: '2026-11-11', url: V + 'zz404zz404a' }, '2026-11-16T00:00:00.000Z');
  t.moments[0].title = 'CHAERYEONG Moonlit Club 퍼포먼스를 보고 그 밤의 무대 조명이 꽃처럼 피어 올랐던 기억을 길고 담백하게 적어 본다';
  t.moments[0].url = V + 'zz404zz404a';
  t.moments[0].mediaMetadata = { thumbnail: '', width: 1920, height: 1080 };
  t.moments[0].createdAt = '2026-11-13T09:00:00.000Z'; t.moments[0].updatedAt = t.moments[0].createdAt;
  t = addMoment(t, { subject: '시험', title: '내려간 직캠 영상', note: '기록', emotion: '그리움', date: '2026-11-12', url: V + 'zz404zz404b' }, t.moments[0].id, '2026-11-16T00:01:00.000Z');
  t.moments[1].mediaMetadata = { title: '유튜브에서 내려간 무대 직캠 영상', channel: 'KBS Kpop', thumbnail: '', width: 1920, height: 1080 };
  t.moments[1].createdAt = '2026-11-12T09:00:00.000Z'; t.moments[1].updatedAt = t.moments[1].createdAt;
  t = addMoment(t, { subject: '시험', title: '사진 순간(정상)', note: '기록', emotion: '즐거움', date: '2026-11-10', url: '' }, t.moments[0].id, '2026-11-16T00:02:00.000Z');
  t.moments[2].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
  // 261117 대표 결정: 이 상태는 390의 궤도 겹침 검사가 목적 — 9장 이상(표준 좁은 화면 궤도)이어야 한다.
  // 8장 이하 390은 궤도 카드를 숨기는 계약(소수 카드는 가운데에 집중)이라 별도 단언(#657 후속 261117)이 본다.
  for (let fi = 0; fi < 6; fi++) {
    t = addMoment(t, { subject: '시험', title: '사진 순간 채우기 ' + (fi + 1), note: '기록', emotion: '즐거움', date: '2026-11-0' + (fi % 9 + 1), url: '' }, t.moments.at(-1).id, '2026-11-16T00:03:0' + fi + '.000Z');
    t.moments.at(-1).mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="' + ['#5a6e8a', '#6e8a5a', '#8a7a5a', '#8a5a6e'][fi % 4] + '"/></svg>').toString('base64') };
    t.moments.at(-1).createdAt = '2026-11-09T0' + fi + ':00:00.000Z'; t.moments.at(-1).updatedAt = t.moments.at(-1).createdAt;
  }
  t.moments[2].createdAt = '2026-11-10T09:00:00.000Z'; t.moments[2].updatedAt = t.moments[2].createdAt;
  return t;
})();
// 그래프 보기는 지금 주소(#my/graph)로만 열리는 화면이라 셸 상태 대신 호스트가 LT41을 직접 넘긴다(share-host와 같은 틀).
const graphHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그래프 호스트</title></head>
<body data-member="in" data-record-source="file"><script>window.LT41={source:'file',writable:false,owned:true,momentId:'m01',prefs:{},tree:${JSON.stringify(graphTree)},trees:[${JSON.stringify(graphTree)}]};</script>
<iframe src="/v41/views/graph/track60-graph.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const frameOf = async (page, test_) => {
  for (let i = 0; i < 80; i++) {
    const f = page.frames().find((f) => f !== page.mainFrame() && test_.test(f.url()));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  return null;
};

const frameUrls = (page) => page.frames().map((f) => { try { return f.url(); } catch { return '<url 조회 실패>'; } });
const readyFrame = async (page, test_, { root = null, view = null, timeout = 45000, why = '프레임 준비' } = {}) => {
  const deadline = Date.now() + timeout;
  let detail = '대기 시작';
  while (Date.now() < deadline) {
    const f = page.frames().find((x) => x !== page.mainFrame() && test_.test(x.url()));
    if (f) {
      try {
        const ok = await f.evaluate(({ sel, wantView }) =>
          document.readyState === 'complete' &&
          (!sel || Boolean(document.querySelector(sel))) &&
          (!wantView || document.body?.dataset?.ltView === wantView), { sel: root, wantView: view });
        if (ok) return f;
        detail = '프레임은 있으나 문서 준비 전(readyState·루트 요소·보기 상태)';
      } catch (e) { detail = '프레임 평가 실패: ' + String(e?.message || e); }
    } else {
      detail = '대상 프레임을 아직 찾지 못함';
    }
    await page.waitForTimeout(250);
  }
  assert.fail(`${why} 실패 — ${detail} (최대 ${timeout / 1000}초). 현재 프레임 URL: [${frameUrls(page).join(' | ')}]`);
};

test('#657 화면 공통 검사기: 주요 화면 17 상태 × 390·1440 × 밤·정원에서 겹침·잘림·흔적 값·작은 글자가 0이다', { skip: REQUIRE ? false : skip, timeout: 900000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve({ '/share-host.html': shareHost, '/home-host.html': homeHost, '/graph-host.html': graphHost });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const known = [], fresh = [];
  const SIZES = [[1440, 900], [390, 844]];
  // #1080: 조합(테마×폭)을 shard로 나눠 병렬 잡에서 돌린다. shard가 없으면 예전처럼 네 조합 전부.
  // 어느 shard를 골라도 검사 항목·기준은 그대로이고, 셋을 합치면 네 조합이 모두 실행된다.
  const SHARD = process.env.LT_SCREEN_AUDIT_SHARD || '';
  const shardOf = (theme, width) => theme === 'night' ? (width === 1440 ? 'a' : 'b') : 'c';
  const COMBOS = [];
  for (const theme of ['night', 'garden']) for (const size of SIZES) if (!SHARD || SHARD === shardOf(theme, size[0])) COMBOS.push([size, theme]);

  // 한 조합(크기·테마)을 돌고 실패 줄을 돌려준다.
  const runCombo = async ([width, height], theme) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await context.route('**://i.ytimg.com/**', THUMB); // 썸네일은 네트워크 없이 1px 그림으로 — 막으면 대체 카드(11px 글자)가 나와 검사가 아니라 모양이 된다
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page = await context.newPage();
    const rows = [];
    const take = async (p, screen) => {
      const audit = await auditPage(p, screen);
      rows.push(...failuresOf(audit, `${width}`, theme));
      const required = screen === '셸 첫 화면·알림 줄'
        ? ['updates-card×.home-links']
        : screen === '새 소식 닫기 버튼' ? ['updates-foot×body-text'] : [];
      for (const pair of required) {
        const check = audit.bottomChecks.find((x) => x.pair === pair);
        assert.ok(check, `${screen} 감사 대상 쌍이 실제로 검사되었다: ${pair}`);
        assert.ok(check.left?.width > 0 && check.left?.height > 0 && check.right?.width > 0 && check.right?.height > 0,
          `${screen} ${pair} 양쪽 요소가 실제로 보인다: ${JSON.stringify(check)}`);
        assert.equal(check.area, 0, `${screen} ${pair} 겹침 면적 0px²: ${JSON.stringify(check)}`);
      }
    };

    // 첫 화면(예시) → 어떻게 쓰나요 안내
    await page.goto(`${base}/home-host.html`, { waitUntil: 'domcontentloaded' });
    const home = await frameOf(page, /home\.html/);
    assert.ok(home, '첫 화면 프레임이 열린다');
    await home.waitForFunction(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=guide]'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    await take(page, '첫 화면(예시)');
    await home.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide]').click());
    await home.waitForFunction(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[aria-label="어떻게 쓰나요"]')?.open, null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await take(page, '어떻게 쓰나요 안내');
    await context.close();

    // 책(공유 링크) — 첫 장부터 마지막 장까지 넘기며 매 장 검사
    const ctx2 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx2.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx2.route('**://i.ytimg.com/**', THUMB);
    await ctx2.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/share-host.html`, { waitUntil: 'domcontentloaded' });
    const book = await frameOf(page2, /track59-sketchbook/);
    assert.ok(book, '책 프레임이 열린다');
    await book.waitForFunction(() => !!document.querySelector('.moment'), null, { timeout: 20000 });
    // 장 넘김 애니메이션이 끝나기를 기다린다(#662 CI: 450ms 고정 대기는 넘김 중간에 검사해 img·clipping이 글자를 덮은 것으로 나왔다).
    const bookIdle = () => book.waitForFunction(() => { try { return machineState === 'IDLE'; } catch { return false; } }, null, { timeout: 5000 }).catch(() => {});
    await bookIdle();
    await page2.waitForTimeout(700);
    // #700 후속(갈림길 탭): 첫 장의 탭이 보이는 자리에서 글자 크기와 잘림을 직접 단정한다 —
    // 12px 기준(#548)에 단추 규칙(13px)을 적용하고, 무대(.stage) 밖으로 나가 잘리는 모양을 막는다.
    const branchTab = await book.evaluate(() => {
      const tab = document.getElementById('branchTab');
      if (!tab || tab.hidden) return null;
      const stage = document.querySelector('.stage');
      const tr = tab.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      return { font: parseFloat(getComputedStyle(tab).fontSize), tabRight: tr.right, stageRight: sr.right, text: tab.textContent.trim(), title: tab.title || '' };
    });
    assert.ok(branchTab, '첫 장에 갈림길 탭이 보인다(시험 트리의 첫 순간이 두 갈래를 나간다)');
    assert.ok(branchTab.font >= 13, `갈림길 탭 글자는 13px 이상이다(실측 ${branchTab.font}px)`);
    assert.ok(branchTab.tabRight <= branchTab.stageRight, `갈림길 탭이 무대 안쪽에 있어야 한다 — 잘림 0(탭 오른쪽 ${Math.round(branchTab.tabRight)}px / 무대 오른쪽 ${Math.round(branchTab.stageRight)}px)`);
    assert.match(branchTab.text, /갈림길\s*\d+/, `탭은 짧은 '갈림길 N'이다(실측: ${branchTab.text})`);
    assert.ok(branchTab.title.includes('에서 갈라진 길'), `긴 제목은 툴팁에만 있다(실측: ${branchTab.title})`);
    for (let i = 0; i < 12; i++) {
      await take(page2, i === 0 ? '책·공유 첫 장' : `책·공유 ${i + 1}장`);
      const next = book.locator('#nextBtn');
      if (await next.isDisabled()) break;
      await next.click();
      await bookIdle();
      await page2.waitForTimeout(450);
    }
    await take(page2, '책·공유 마지막 장');
    await ctx2.close();

    // 셸 화면 — 보드 → 지도 → 둘러보기(한 번 뜬 셸에서 주소와 패널만 바꿔 본다)
    const ctx3 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx3.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx3.route('**://i.ytimg.com/**', THUMB);
    await ctx3.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page3 = await ctx3.newPage();
    await page3.goto(`${base}/v41/#board`, { waitUntil: 'load' });
    await frameOf(page3, /views\/track/); // 안쪽 화면 프레임이 뜰 때까지(검사 누락 방지)
    await page3.waitForTimeout(1200);
    await take(page3, '보드');
    // #662 후속(CTO 지시): 안내 풍선은 상세 판이 닫혀 있을 때만 뜬다 — 판은 로드 때 선택 복원으로 열려 있으므로 먼저 닫는다.
    // 닫힘 상태에서는 풍선이 캔버스 위에 뜬 상태로 겹침·대비를 풍선까지 잰다(풍선은 '도구×캔버스' 제외 대상이 아니다).
    const boardFrame = await frameOf(page3, /views\/track/);
    await boardFrame.evaluate(() => document.getElementById('detailClose').click());
    await boardFrame.waitForFunction(() => { const d = document.getElementById('detail'); if (!d || d.classList.contains('open')) return false; const r = d.getBoundingClientRect(); return r.left >= innerWidth || r.top >= innerHeight; }, null, { timeout: 5000 }).catch(() => {});
    await page3.waitForTimeout(300);
    await boardFrame.evaluate(() => toast('순간을 선택해 연결된 기록을 살펴보세요.'));
    await page3.waitForTimeout(400);
    await take(page3, '보드·안내·판 닫힘');
    // 판을 열면 안내는 치워진다(이미 순간을 선택했으므로) — 열림 상태에서도 겹침 0을 잰다.
    await boardFrame.evaluate(() => selectMoment(LTDEMO.get()));
    await page3.waitForTimeout(500);
    assert.equal(await boardFrame.evaluate(() => document.querySelector('.toast').classList.contains('show')), false, '상세 판이 열렸으면 보드 안내 풍선은 사라진다');
    await take(page3, '보드·안내·판 열림');
    await boardFrame.evaluate(() => document.getElementById('detailClose').click());
    // 판 닫힘 넘어가는 동안(0.35s transform)을 기다린다 — 중간에 검사하면 판 끝에 걸친 단추가 '가려짐'으로 잡힌다.
    await boardFrame.waitForFunction(() => { const d = document.getElementById('detail'); if (!d || d.classList.contains('open')) return false; const r = d.getBoundingClientRect(); return r.left >= innerWidth || r.top >= innerHeight; }, null, { timeout: 5000 }).catch(() => {});
    await page3.waitForTimeout(300);
    // #666: ＋ 단추(body.lt-fab-ok — 로그인해 내 기록을 쓰는 자리에서만 뜬다)를 함께 띄우고 알림 줄을 올린다.
    await page3.evaluate(() => document.body.classList.add('lt-fab-ok'));
    await raiseToast(page3);
    await take(page3, '보드·알림 줄');
    await lowerToast(page3);
    await page3.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    await page3.evaluate(() => { location.hash = '#network'; });
    await page3.waitForTimeout(1800);
    await take(page3, '지도');
    // 2026-11-16 대표 결정: 보기 고르기에 [그래프]가 셋째로 붙는다 — 390에서도 세 단추가 머리줄에 들어간다(넘침·겹침 0).
    const mapHeader = await page3.evaluate(() => {
      const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return /track56-network/.test(f.contentWindow.location.href); } catch { return false; } });
      if (!frame) return null;
      const doc = frame.contentDocument;
      const bar = doc.querySelector('.topbar');
      const switchBtns = [...doc.querySelectorAll('.view-switch .pill')];
      const btns = [...doc.querySelectorAll('.top-actions button')].filter((b) => b.getBoundingClientRect().width > 0);
      const rects = btns.map((b) => b.getBoundingClientRect());
      const pairTexts = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) pairTexts.push(btns[i].textContent.trim() + '×' + btns[j].textContent.trim());
      }
      return {
        switchCount: switchBtns.length,
        labels: switchBtns.map((b) => b.textContent.trim()),
        netPressed: doc.getElementById('viewNet')?.getAttribute('aria-pressed'),
        graphPressed: doc.getElementById('viewGraph')?.getAttribute('aria-pressed'),
        overflowX: Math.max(0, bar.scrollWidth - bar.clientWidth),
        outOfFrame: btns.filter((b) => b.getBoundingClientRect().right > doc.documentElement.clientWidth + 1).map((b) => b.textContent.trim()),
        pairTexts
      };
    }).catch(() => null);
    assert.ok(mapHeader, '지도 머리줄을 잰다');
    assert.deepEqual(mapHeader.labels, ['이어진 길', '묶음', '시간 순'], `보기 고르기 세 단추(실제 ${JSON.stringify(mapHeader.labels)})`);
    assert.equal(mapHeader.netPressed, 'true', '현재 보기(그물형) aria-pressed=true');
    assert.equal(mapHeader.graphPressed, 'false', '그래프 단추는 지도에서 눌리지 않은 상태');
    assert.equal(mapHeader.overflowX, 0, `지도 머리줄 가로 넘침 0(실제 ${mapHeader.overflowX})`);
    assert.deepEqual(mapHeader.outOfFrame, [], '머리줄 단추가 화면 밖으로 나가지 않는다');
    assert.deepEqual(mapHeader.pairTexts, [], `머리줄 단추 겹침 0(실제 ${JSON.stringify(mapHeader.pairTexts)})`);
    // #638: 지도 390(조작 줄) — iframe 안 조작 줄이 셸의 링크 줄·＋ 단추와 겹치지 않고, 보기 전환 단추 대비 4.5:1.
    if (width === 390) {
      const ribbonCheck = await page3.evaluate(() => {
        const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map((v) => parseFloat(v)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const mix = (t, b) => [t[0] * t[3] + b[0] * (1 - t[3]), t[1] * t[3] + b[1] * (1 - t[3]), t[2] * t[3] + b[2] * (1 - t[3]), 1];
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
        // iframe은 src 속성이 비어 있다(셸이 contentWindow.location.replace로 화면을 바꾼다) —
        // f.url()은 DOM iframe에 없어서 이 검사가 늘 빈손이었다(#638: contentWindow 주소로 찾는다).
        const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return /track56-network/.test(f.contentWindow.location.href); } catch { return false; } });
        if (!frame) return null;
        const doc = frame.contentDocument;
        const ribbonEl = doc.getElementById('mobileRibbon');
        if (!ribbonEl || frame.contentWindow.getComputedStyle(ribbonEl).display === 'none') return null;
        const off = box(frame);
        const vp = (o) => o && { t: o.t + off.t, b: o.b + off.t, l: o.l + off.l, r: o.r + off.l };
        const ribbon = vp(box(ribbonEl));
        const links = box(document.querySelector('.home-links'));
        const fab = box(document.getElementById('mobile-add'));
        const ox = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = (a, b) => Math.min(a.b, b.b) - Math.max(a.t, b.t);
        const contrast = (el) => {
          if (!el || el.getBoundingClientRect().width < 2) return 0; // 좁은 화면에서 숨은 단추(왼쪽 판)는 대비를 재지 않는다
          const win = frame.contentWindow;
          const fg = rgb(win.getComputedStyle(el).color);
          const layers = [];
          for (let n = el; n; n = n.parentElement) { const bg = rgb(win.getComputedStyle(n).backgroundColor); if (bg) { layers.push(bg); if (bg[3] >= 1) break; } }
          let bgc = layers.length && layers[layers.length - 1][3] >= 1 ? layers[layers.length - 1] : [255, 255, 255, 1];
          for (let i = layers.length - 2; i >= 0; i--) bgc = mix(layers[i], bgc);
          const fge = fg[3] < 1 ? mix(fg, bgc) : fg;
          return Math.round((Math.max(lum(fge), lum(bgc)) + 0.05) / (Math.min(lum(fge), lum(bgc)) + 0.05) * 100) / 100;
        };
        return {
          cut: Math.max(0, ribbonEl.scrollWidth - ribbonEl.clientWidth),
          linksOverlap: links ? Math.max(0, ox(ribbon, links)) * Math.max(0, oy(ribbon, links)) : 0,
          fabOverlap: fab && fab.r > fab.l ? Math.max(0, ox(ribbon, fab)) * Math.max(0, oy(ribbon, fab)) : 0,
          contrastNet: contrast(doc.getElementById('viewNet')),
          contrastConc: contrast(doc.getElementById('viewConc'))
        };
      }).catch(() => null);
      if (ribbonCheck) {
        const tail = ` · ${width}·${theme}`;
        if (ribbonCheck.cut > 0) rows.push({ 항목: '잘림', 줄: `지도 390(조작 줄) 잘림 .mobile-ribbon ${Math.round(ribbonCheck.cut)}px 넘침${tail}` });
        if (ribbonCheck.linksOverlap > 0) rows.push({ 항목: '겹침', 줄: `지도 390(조작 줄) 겹침 .mobile-ribbon × .home-links ${Math.round(ribbonCheck.linksOverlap)}px²${tail}` });
        if (ribbonCheck.fabOverlap > 0) rows.push({ 항목: '겹침', 줄: `지도 390(조작 줄) 겹침 .mobile-ribbon × #mobile-add ${Math.round(ribbonCheck.fabOverlap)}px²${tail}` });
        for (const [id, v] of [['viewNet', ribbonCheck.contrastNet], ['viewConc', ribbonCheck.contrastConc]]) if (v > 0 && v < 4.5) rows.push({ 항목: '대비', 줄: `지도 390(조작 줄) 대비 #${id} ${v}:1 < 4.5:1${tail}` });
      }
    }
    await ctx3.close();

    // 둘러보기 → 의견 보내기 창 — 새로 뜬 셸에서(지도 잔상 상태에 좌우되지 않게)
    const ctx4 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx4.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx4.route('**://i.ytimg.com/**', THUMB);
    await ctx4.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    // #638: 내 의견 목록 — /api/board/mine만 가짜 게시물로 답한다(위의 포괄 목적 경로보다 나중에 등록한 것이 이긴다).
    await ctx4.route('**/api/board/mine*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, posts: MINE_POSTS }) }));
    await ctx4.route('**/api/community/shares*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: COMMUNITY_CARDS, totalVisible: COMMUNITY_CARDS.length }) }));
    const page4 = await ctx4.newPage();
    await page4.goto(`${base}/v41/`, { waitUntil: 'load' });
    await page4.waitForTimeout(1200);
    // #666: 셸 첫 화면(링크 줄 + 새 소식 카드 + ＋ 단추)에서 알림 줄이 이것들을 덮지 않는지 잰다.
    await page4.evaluate(() => document.body.classList.add('lt-fab-ok'));
    if (width === 390) {
      await page4.waitForFunction(() => {
        const card = document.getElementById('updates-card'), fab = document.getElementById('mobile-add');
        return card && !card.hidden && fab && getComputedStyle(fab).display !== 'none';
      }, null, { timeout: 8000 });
      const cardPair = await page4.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const lines = (el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; };
        const card = document.getElementById('updates-card'), fab = document.getElementById('mobile-add');
        const text = document.getElementById('updates-card-text'), view = document.getElementById('updates-view');
        return { card: box(card), fab: box(fab), gap: Math.round(fab.getBoundingClientRect().top - card.getBoundingClientRect().bottom), text: text.textContent.trim(), textLines: lines(text), viewLines: lines(view) };
      });
      assert.equal(cardPair.card.width, 358, `390 새 소식 카드가 원래 전체 폭이다: ${JSON.stringify(cardPair)}`);
      assert.equal(cardPair.gap, 8, `390 카드 아래와 ＋ 위 간격이 8px이다: ${JSON.stringify(cardPair)}`);
      assert.equal(cardPair.textLines, 1, `390 새 소식 카드 문구가 한 줄이다: ${JSON.stringify(cardPair)}`);
      assert.equal(cardPair.viewLines, 1, `390 보기 단추 문구가 한 줄이다: ${JSON.stringify(cardPair)}`);
      assert.match(cardPair.text, /\d+\.\d+\.\d+/, `390 카드에 최신 버전 글자가 보인다: ${JSON.stringify(cardPair)}`);
    }
    await raiseToast(page4);
    await take(page4, '셸 첫 화면·알림 줄');
    await lowerToast(page4);
    await page4.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    // (2026-11-16) '자동 공개 안내' 토스트는 질문 창(아래 '둘러보기 소개 질문' 상태)으로 대신해 남기지 않는다.
    await page4.evaluate(() => document.getElementById('community-menu')?.click());
    await page4.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForFunction(() => !!document.querySelector('.community-card'), null, { timeout: 8000 });
    await take(page4, '둘러보기');
    // #784: 반응 단추는 격자 카드에 없고, 카드를 열어야 미리보기에서 보인다.
    await page4.locator('.community-card').first().click();
    await page4.waitForFunction(() => {
      const preview = document.getElementById('community-preview');
      return preview?.open && preview.querySelector('.community-reaction-open');
    }, null, { timeout: 8000 });
    await page4.waitForTimeout(400);
    const reactions = await page4.evaluate(() => {
      const preview = document.getElementById('community-preview');
      return {
        previewOpen: Boolean(preview?.open),
        open: preview?.querySelectorAll('.community-reaction-open').length || 0,
        zeroChips: [...(preview?.querySelectorAll('.community-reaction') || [])].filter((b) => / 0$/.test(b.textContent.trim())).length
      };
    });
    assert.equal(reactions.previewOpen, true, '카드를 누르면 둘러보기 미리보기가 열린다');
    assert.ok(reactions.open >= 1, '반응이 없으면 미리보기에서 반응 남기기 단추가 보인다');
    assert.equal(reactions.zeroChips, 0, '0짜리 반응 칩은 보이지 않는다');
    // #903: 가입 7일 미만이 담기를 누르면 서버 안내가 담기 단추 바로 다음 줄에 뜬다 —
    // 단추와 안내의 세로 거리를 1440·390에서 모두 12px 이하로 잰다(눈이 아니라 수치로).
    await ctx4.route('**/api/community/shares/*/favorite', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'vote_too_new', message: '가입하고 7일이 지나면 투표할 수 있어요.' } }) }));
    await page4.evaluate(() => document.querySelector('#community-preview [data-community-action="favorite"]')?.click());
    await page4.waitForFunction(() => {
      const note = document.querySelector('#community-preview .community-vote-note');
      return Boolean(note && !note.hidden && note.textContent.trim());
    }, null, { timeout: 8000 });
    const voteGap = await page4.evaluate(() => {
      const note = document.querySelector('#community-preview .community-vote-note');
      const fav = document.querySelector('#community-preview [data-community-action="favorite"]');
      const a = note.getBoundingClientRect(), b = fav.getBoundingClientRect();
      // #903 후속: 투표 막힘 안내는 미리보기 안에서 한 번만 보인다(단추 아래 칸 하나 — 상태 줄에는 내리지 않는다).
      const texts = [...document.querySelectorAll('#community-preview p, #community-preview small, #community-preview span')]
        .filter((node) => node.textContent.includes('가입하고 7일')).length;
      return { gap: Math.round(a.top - b.bottom), text: note.textContent.trim(), noticeCount: texts };
    });
    assert.equal(voteGap.text, '가입하고 7일이 지나면 투표할 수 있어요.', '서버 안내 문구를 그대로 담기 단추 옆에 내린다');
    assert.equal(voteGap.noticeCount, 1, '미리보기 안에 안내 문구는 하나다(상태 줄에 같은 말을 반복하지 않는다)');
    assert.ok(voteGap.gap >= -1 && voteGap.gap <= 12, `안내가 담기 단추 바로 아래 있다(거리 ${voteGap.gap}px ≤ 12px)`);
    // 하은 1회차(261116,#728 후속): 새벽(KST 0~9시, UTC 전날)에 담은 순간의 둘러보기 카드 날짜가
    // UTC 절단('2026. 11. 15')으로 나왔다 — Asia/Seoul 시간대 문맥에서 한국 날짜로 보이는지 수치로 단정한다.
    const ctxDate = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'Asia/Seoul' });
    await ctxDate.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctxDate.route('**://i.ytimg.com/**', THUMB);
    await ctxDate.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const CROSSING = '2026-11-15T20:00:00.000Z'; // UTC로는 11-15, 한국 시간으로는 11-16 05:00(0~9시 구간)
    await ctxDate.route('**/api/community/shares*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [Object.assign({}, COMMUNITY_CARDS[0], { createdAt: CROSSING, momentCount: 3 })], totalVisible: 1 }) }));
    const pageDate = await ctxDate.newPage();
    await pageDate.goto(`${base}/v41/`, { waitUntil: 'load' });
    await pageDate.waitForTimeout(1200);
    await pageDate.evaluate(() => document.getElementById('community-menu')?.click());
    await pageDate.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await pageDate.waitForFunction(() => !!document.querySelector('.community-card-meta')?.textContent.trim(), null, { timeout: 8000 }).catch(() => {});
    await pageDate.waitForTimeout(400);
    const cardDate = await pageDate.evaluate((crossing) => {
      const meta = document.querySelector('.community-card-meta')?.textContent || '';
      const d = new Date(crossing);
      const localToday = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { meta, localToday };
    }, CROSSING);
    const utcCut = '2026. 11. 15';
    assert.ok(cardDate.meta.includes(cardDate.localToday.replace(/-/g, '. ')), `새벽 순간의 카드 날짜는 지역(한국) 날짜다 — 실제 "${cardDate.meta}" / 기대 ${cardDate.localToday}`);
    assert.ok(!cardDate.meta.includes(utcCut), `카드 날짜가 UTC 절단(어제)으로 나온다: "${cardDate.meta}"`);
    await pageDate.screenshot({ path: screenAuditCapture('audit-community-date-' + width + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
    await ctxDate.close();
    // 둘러보기 소개 질문(2026-11-16 대표 결정) — 새 계정의 쉬운 추가 3번째 저장에서 한 번 묻는다.
    // [지금은 안 할래요] → discover false·다시 안 물음, [소개하기] → discover true, 공유 판 스위치가 같은 값,
    // 백필(이미 3개·소개 켜짐) 계정은 묻지 않는다. 창 모양(겹침·잘림 0)은 take가 함께 잰다.
    const oembed = (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: '검사기 시험 영상', author_name: '시험 채널', thumbnail_url: 'https://i.ytimg.com/vi/qaAsk001/hqdefault.jpg' }) });
    const openQuick = async (pageAsk) => {
      if (await pageAsk.evaluate(() => !!document.getElementById('write-panel')?.open)) return;
      // 저장이 끝난 뒤(메뉴 이름이 '＋ 순간 추가'로 돌아온 뒤) 연다 — dirty 가드(explainSaveState)를 피하려는 대기다.
      await pageAsk.waitForFunction(() => document.getElementById('write-menu')?.textContent === '＋ 순간 추가', null, { timeout: 10000 }).catch(() => {});
      await pageAsk.evaluate(() => document.getElementById('write-menu')?.click());
      await pageAsk.waitForFunction(() => !!document.getElementById('quick-url'), null, { timeout: 8000 });
    };
    const quickSave = async (pageAsk, url) => {
      await openQuick(pageAsk);
      await pageAsk.fill('#quick-url', url);
      await pageAsk.click('#quick-submit');
      await pageAsk.waitForTimeout(800);
    };
    const askFlow = async (answer) => {
      const ctxAsk = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxAsk.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxAsk.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxAsk.route('**://i.ytimg.com/**', THUMB);
      const discoverPuts = [];
      await ctxAsk.route('**/api/workspace*', (r) => {
        if (r.request().method() === 'PUT') {
          const body = r.request().postDataJSON() || {};
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: Number(body.expectedRevision || 0) + 1, subject: '검사기계정' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) });
      });
      await ctxAsk.route('**/api/youtube/oembed*', oembed);
      await ctxAsk.route('**/api/trees/*/discover', (r) => {
        if (r.request().method() === 'PUT') { const body = r.request().postDataJSON() || {}; discoverPuts.push(body.discover === true); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'askTree', discover: body.discover === true }) }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'askTree', discover: discoverPuts[discoverPuts.length - 1] === true }) });
      });
      const pageAsk = await ctxAsk.newPage();
      await pageAsk.goto(base + '/v41/?account=1', { waitUntil: 'load' });
      await pageAsk.waitForTimeout(1200);
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk01');
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk02');
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk03');
      // 3번째 저장의 동기화 뒤 질문 창이 한 번 뜬다(2→3).
      await pageAsk.waitForFunction(() => !!document.getElementById('discover-ask')?.open, null, { timeout: 15000 });
      await pageAsk.waitForTimeout(400);
      const buttons = await pageAsk.evaluate(() => [document.getElementById('discover-ask-yes')?.textContent, document.getElementById('discover-ask-no')?.textContent]);
      assert.deepEqual(buttons, ['소개하기', '지금은 안 할래요'], '질문 창 단추는 소개하기·지금은 안 할래요다');
      await take(pageAsk, '둘러보기 소개 질문'); // 겹침·잘림 0 검사에 창이 함께 든다(390·1440 × 밤·정원)
      await pageAsk.screenshot({ path: screenAuditCapture('audit-discover-ask-' + width + '-' + theme + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
      await pageAsk.evaluate((a) => document.getElementById(a === 'yes' ? 'discover-ask-yes' : 'discover-ask-no')?.click(), answer);
      await pageAsk.waitForFunction(() => !document.getElementById('discover-ask')?.open, null, { timeout: 8000 });
      assert.deepEqual(discoverPuts, [answer === 'yes'], '[소개하기]는 true, [지금은 안 할래요]는 false로 저장된다');
      const asked = await pageAsk.evaluate(() => { try { return JSON.parse(localStorage.getItem('lt41.discoverAsked') || '[]'); } catch { return []; } });
      assert.ok(asked.length >= 1, '고른 트리는 discoverAsked에 기억된다');
      return { ctxAsk, pageAsk, discoverPuts };
    };
    const addFourth = async (pageAsk) => {
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk09');
      await pageAsk.waitForTimeout(1500);
      assert.equal(await pageAsk.evaluate(() => !!document.getElementById('discover-ask')?.open), false, '고른 뒤 같은 트리에서 다시 묻지 않는다');
    };
    const noAsk = await askFlow('no');
    await addFourth(noAsk.pageAsk);
    // 공유 판 두 칸 선택: 꺼짐 상태 문장·단추를 잰 뒤 켜기 → 켜짐 — 선택 뒤 상자 안 두 문장(순간 수 힌트·상태)이 같은 상태를 말한다.
    {
      const { ctxAsk, pageAsk, discoverPuts } = noAsk;
      await pageAsk.evaluate(() => document.getElementById('share-menu')?.click());
      await pageAsk.waitForFunction(() => !!document.getElementById('share-panel')?.open, null, { timeout: 8000 }).catch(() => {});
      await pageAsk.waitForFunction(() => (document.getElementById('share-disc-off')?.getAttribute('aria-checked')||'')==='true', null, { timeout: 8000 });
      await pageAsk.waitForTimeout(400);
      const box = () => pageAsk.evaluate(() => ({ off: document.getElementById('share-disc-off')?.getAttribute('aria-checked')||'', on: document.getElementById('share-disc-on')?.getAttribute('aria-checked')||'' }));
      const before = await box();
      assert.equal(before.off, 'true', '안 할래요를 고른 트리는 공유 판에서도 안 함이 선택'); assert.equal(before.on, 'false');
      // 261117 고객 의견: '공개되는 범위' 문구가 줄바꿈돼도 겹침 0 — 문구 자리로 스크롤한 뒤에도 잰다.
      await pageAsk.evaluate(() => document.querySelector('.share-warning')?.scrollIntoView({ block: 'center' }));
      await pageAsk.waitForTimeout(300);
      await take(pageAsk, '공유 판·소개 꺼짐');
      await pageAsk.screenshot({ path: screenAuditCapture('audit-discover-panel-off-' + width + '-' + theme + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
      await pageAsk.evaluate(() => document.getElementById('share-disc-on')?.click());
      await pageAsk.waitForFunction(() => (document.getElementById('share-disc-on')?.getAttribute('aria-checked')||'')==='true', null, { timeout: 8000 });
      assert.deepEqual(discoverPuts, [false, true], '공유 판 스위치(소개 켜기)도 discover PUT으로 저장한다');
      await pageAsk.waitForTimeout(400);
      const after = await box();
      // 두 칸 선택 뒤 상자 안 문장들이 같은 상태를 말한다(261116 2차 지적 — 첫 줄이 옛 값에 머물던 것).
      assert.equal(after.on, 'true', '켜짐 뒤 소개가 선택'); assert.equal(after.off, 'false');
      await pageAsk.evaluate(() => document.querySelector('.share-warning')?.scrollIntoView({ block: 'center' }));
      await pageAsk.waitForTimeout(300);
      await take(pageAsk, '공유 판·소개 켜짐');
      await pageAsk.screenshot({ path: screenAuditCapture('audit-discover-panel-on-' + width + '-' + theme + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
      await ctxAsk.close();
    }
    const yesAsk = await askFlow('yes');
    await addFourth(yesAsk.pageAsk);
    await yesAsk.ctxAsk.close();
    // 백필 계정(이미 3개·소개 켜짐) — 질문 없이 건너뛴다.
    {
      const ctxBack = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxBack.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxBack.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxBack.route('**://i.ytimg.com/**', THUMB);
      const now = '2026-11-16T09:00:00.000Z';
      const moments = [1, 2, 3].map((i) => ({ id: 'bm' + i, parentId: i === 1 ? null : 'bm' + (i - 1), links: [], createdAt: now, updatedAt: now, url: 'https://www.youtube.com/watch?v=qaBack00' + i, title: '백필 순간 ' + i, note: '', emotion: '', date: '2026-11-1' + (2 + i) }));
      await ctxBack.route('**/api/workspace*', (r) => {
        if (r.request().method() === 'PUT') { const body = r.request().postDataJSON() || {}; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: Number(body.expectedRevision || 0) + 1, subject: '검사기계정' }) }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 2, state: { version: 1, trees: [{ id: 'askBackTree', subject: '검사기 트리', title: '검사기 트리 제목', createdAt: now, updatedAt: now, coverMomentId: '', moments }] }, subject: '검사기계정', writeSubjectBound: true, savedAt: now }) });
      });
      await ctxBack.route('**/api/youtube/oembed*', oembed);
      await ctxBack.route('**/api/trees/*/discover', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'askBackTree', discover: true }) }));
      const pageBack = await ctxBack.newPage();
      await pageBack.goto(base + '/v41/?account=1', { waitUntil: 'load' });
      await pageBack.waitForTimeout(1200);
      await quickSave(pageBack, 'https://www.youtube.com/watch?v=qaBack09');
      await pageBack.waitForTimeout(1500);
      assert.equal(await pageBack.evaluate(() => !!document.getElementById('discover-ask')?.open), false, '백필(이미 소개 켜진) 계정은 질문 없이 건너뛴다');
      await ctxBack.close();
    }
    await ctxDate.close();
    // 꼬리표 직접 붙이기(261116 대표 지적) — 제안이 없는 영상을 담은 직후의 꼬리표 줄.
    // 접힘·오류 0이 기본, [직접 붙이기]로 한 줄 펼침(44px 같은 높이·예시 placeholder·개발 용어 없음),
    // 빈 값으로 붙이면 오류 한 줄, 'ILLIT'을 붙이면 방금 담은 순간에 '가수:ILLIT' 저장(#742와 같은 순간 id).
    {
      const ctxTag = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxTag.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxTag.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxTag.route('**://i.ytimg.com/**', THUMB);
      const tagSaves = []; // keywords가 담긴 순간 기록({ momentId, keywords })
      const putMoments = []; // 회차별 그림 기록 — 회차 1의 순간과 회차 2의 순간 id를 가른다
      await ctxTag.route('**/api/workspace*', (r) => {
        if (r.request().method() === 'PUT') {
          const body = r.request().postDataJSON() || {};
          const moments = [];
          for (const tree of body.state?.trees || []) for (const m of tree.moments || []) moments.push(m.id);
          putMoments.push(moments);
          for (const tree of body.state?.trees || []) for (const m of tree.moments || []) {
            if (Array.isArray(m.keywords) && m.keywords.length) tagSaves.push({ momentId: m.id, keywords: [...m.keywords] });
          }
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: Number(body.expectedRevision || 0) + 1, subject: '검사기계정' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [] }, subject: '검사기계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) });
      });
      await ctxTag.route('**/api/youtube/oembed*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: '헤어지자고? #shorts', author_name: '시험 채널' }) }));
      await ctxTag.route('**/api/trees/*/discover', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'tagTree', discover: false }) }));
      const pageTag = await ctxTag.newPage();
      await pageTag.goto(base + '/v41/?account=1', { waitUntil: 'load' });
      await pageTag.waitForTimeout(1200);
      const quickSaveOnce = async (n) => {
        await pageTag.evaluate(() => document.getElementById('write-menu')?.click());
        await pageTag.waitForFunction(() => !!document.getElementById('quick-url'), null, { timeout: 8000 });
        await pageTag.fill('#quick-url', 'https://www.youtube.com/watch?v=qaTag00' + n);
        await pageTag.click('#quick-submit');
        await pageTag.waitForTimeout(900);
      };
      await quickSaveOnce(1);
      await quickSaveOnce(2); // 같은 창에서 연속 담기 — 꼬리표 줄은 방금 담은(두 번째) 순간을 가리킨다
      await pageTag.waitForFunction(() => !!document.querySelector('#quick-tagline .lt-tagline'), null, { timeout: 10000 });
      // 접힘 기본: 오류 0·입력 줄 없음·안내+[직접 붙이기]. 개발 용어('종류'·'값')는 처음부터 없다.
      const folded = await pageTag.evaluate(() => {
        const err = document.querySelector('#quick-tagline .lt-tagline-error');
        return {
          errorHidden: !err || err.hidden,
          row: !!document.querySelector('#quick-tagline .lt-tagline-kind'),
          toggle: !!document.querySelector('#quick-tagline .lt-tagline-toggle'),
          text: (document.querySelector('#quick-tagline')?.textContent || '').replace(/\\s+/g, ' ').trim()
        };
      });
      assert.equal(folded.errorHidden, true, '처음 상태에 오류가 없다');
      assert.equal(folded.row, false, '직접 입력 칸은 접혀 있다');
      assert.equal(folded.toggle, true, '[직접 붙이기]만 보인다');
      assert.ok(folded.text.includes('가수·노래를 붙여 두면 나중에 저절로 묶여요'), '제안이 없을 때는 안내 한 줄이 보인다 — 실제 "' + folded.text + '"');
      assert.ok(!/종류|꼬리표 값/.test(folded.text), '접힌 말에 개발 용어가 없다 — 실제 "' + folded.text + '"');
      await take(pageTag, '꼬리표 직접 붙이기');
      await pageTag.screenshot({ path: screenAuditCapture('tagline-after-folded-' + width + '-' + theme + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
      await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-toggle')?.click());
      await pageTag.waitForFunction(() => !!document.querySelector('#quick-tagline .lt-tagline-kind'), null, { timeout: 8000 });
      await pageTag.waitForTimeout(300);
      // 펼침: 세 요소 높이 같음(44px)·placeholder 예시·개발 용어 0.
      const open = await pageTag.evaluate(() => {
        const els = ['.lt-tagline-kind', '.lt-tagline-value', '.lt-tagline-add'].map((sel) => document.querySelector('#quick-tagline ' + sel));
        const hs = els.map((el) => Math.round(el.getBoundingClientRect().height));
        const value = document.querySelector('#quick-tagline .lt-tagline-value');
        return { hs, placeholder: value?.placeholder || '', text: (document.querySelector('#quick-tagline')?.textContent || '').replace(/\\s+/g, ' ').trim() };
      });
      assert.ok(open.hs.every((h) => h >= 44) && (Math.max(...open.hs) - Math.min(...open.hs)) <= 1, '펼친 세 요소의 높이가 같다(44px) — 실제 ' + JSON.stringify(open.hs));
      assert.equal(open.placeholder, '예: 좋아하는 가수', '가수 갈래의 예시는 특정 실명 없이 뜻만 알린다(261117 고객 의견)');
      // 갈래 없음('그냥 단어로')은 문장 꼬리표의 예시로 — 실명이 아닌 흔한 말로. 본 뒤 갈래는 가수로 되돌린다(뒤 저장 시험이 '가수:값'을 본다).
      const wordPlaceholder = await pageTag.evaluate(() => {
        const sel = document.querySelector('#quick-tagline .lt-tagline-kind');
        if (!sel) return null;
        sel.value = '';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        const placeholder = document.querySelector('#quick-tagline .lt-tagline-value')?.placeholder || '';
        sel.value = 'artist';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return placeholder;
      });
      assert.equal(wordPlaceholder, '예: 입덕 순간, 무대, 직캠', '갈래 없음의 예시는 문장 꼬리표 예시로 보인다');
      assert.ok(!/종류|꼬리표 값/.test(open.text), '펼친 말에도 개발 용어가 없다 — 실제 "' + open.text + '"');
      await pageTag.screenshot({ path: screenAuditCapture('tagline-after-open-' + width + '-' + theme + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
      // 빈 값으로 [붙이기] → 오류 한 줄(칸 바로 아래).
      await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-add')?.click());
      await pageTag.waitForFunction(() => { const e = document.querySelector('#quick-tagline .lt-tagline-error'); return !!e && !e.hidden; }, null, { timeout: 8000 });
      const errText = await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-error')?.textContent || '');
      assert.equal(errText, '붙일 내용을 적어 주세요.', '빈 값 오류는 눌렀을 때만 한 줄로 보인다');
      await take(pageTag, '꼬리표 직접 붙이기');
      await pageTag.screenshot({ path: screenAuditCapture('tagline-after-error-' + width + '-' + theme + '.png'), animations: 'disabled', timeout: 10000 }).catch(() => {});
      // 'ILLIT' 붙이기 → 방금 담은 순간에 '가수:ILLIT' 저장(첫 순간이 아니다 — #742와 같은 순간 id).
      await pageTag.fill('#quick-tagline .lt-tagline-value', 'ILLIT');
      await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-add')?.click());
      await pageTag.waitForFunction(() => { const c = [...document.querySelectorAll('#quick-tagline .lt-tag-chip.is-confirmed')]; return c.some((x) => x.textContent.includes('ILLIT')); }, null, { timeout: 10000 });
      await pageTag.waitForTimeout(1200); // 저장 PUT까지
      const firstRound = putMoments[0] || [], secondRound = putMoments[putMoments.length - 1] || [];
      const addedNow = secondRound.find((id) => !firstRound.includes(id));
      assert.ok(addedNow, '두 번째 담기에서 새 순간 id를 가린다 — ' + JSON.stringify({ firstRound, secondRound }));
      const save = tagSaves[tagSaves.length - 1];
      assert.ok(save && save.momentId === addedNow, '꼬리표는 방금 담은 순간에 저장된다(#742와 같은 순간 id) — 실제 ' + JSON.stringify(save));
      assert.deepEqual(save.keywords, ['가수:ILLIT'], '갈래와 값을 붙여 저장한다');
      await ctxTag.close();
    }
    await page4.keyboard.press('Escape');    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(300);
    await page4.evaluate(() => document.getElementById('feedback-panel').showModal());
    await page4.waitForTimeout(400);
    await take(page4, '의견 창·보내기 전');
    await page4.selectOption('#feedback-category', 'bug');
    await page4.fill('#feedback-body', '화면 공통 검사기 시험 문장입니다');
    await page4.click('#feedback-send');
    await page4.waitForFunction(() => !document.getElementById('feedback-done')?.hidden, null, { timeout: 8000 });
    await page4.waitForTimeout(300);
    await take(page4, '의견 창·보낸 뒤');
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(400);
    // #638: 새 소식 펼침 — 펼친 새 소식 목록에서 겹침·작은 글자가 0인지.
    await page4.evaluate(() => document.getElementById('updates-link')?.click());
    await page4.waitForFunction(() => !!document.getElementById('updates-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(500);
    const footerWhileOpen = await page4.evaluate(() => {
      const links = document.querySelector('.home-links'), card = document.getElementById('updates-card'), fab = document.getElementById('mobile-add');
      const foot = document.querySelector('#updates-panel .updates-foot');
      const text = document.querySelector('#updates-panel .updates-version');
      const box = (el) => { const r = el?.getBoundingClientRect(); return r && { width: r.width, height: r.height }; };
      return { linksDisplay: links && getComputedStyle(links).display, links: box(links), card: box(card), fab: box(fab), foot: box(foot), text: box(text) };
    });
    assert.equal(footerWhileOpen.linksDisplay, 'none', `창이 열리면 아래 링크 줄을 숨긴다: ${JSON.stringify(footerWhileOpen)}`);
    assert.equal(footerWhileOpen.links?.width, 0, `창이 열리면 아래 링크 줄의 화면 폭이 0이다: ${JSON.stringify(footerWhileOpen)}`);
    assert.ok(footerWhileOpen.foot?.width > 0 && footerWhileOpen.text?.width > 0, `새 소식 창 감사 대상(닫기 줄·본문)이 화면에 있다: ${JSON.stringify(footerWhileOpen)}`);
    await take(page4, '새 소식 펼침');
    // #638: '새로워진 것'·'고친 것' 제목은 한 버전에 한 번 — 출처 묶음마다 되풀이되지 않는다(수치로 판정).
    const repeats = await page4.evaluate(() => {
      const out = [];
      for (const v of document.querySelectorAll('.updates-version')) {
        const counts = new Map();
        for (const h of v.querySelectorAll('.updates-kind h3')) counts.set(h.textContent.trim(), (counts.get(h.textContent.trim()) || 0) + 1);
        for (const [t, n] of counts) if (n > 1) out.push(`${v.getAttribute('data-updates-version')} 버전 "${t}" ${n}번`);
      }
      return out;
    });
    for (const r of repeats) rows.push({ 항목: '되풀이', 줄: `새 소식 펼침 제목 되풀이 ${r} · ${width}·${theme}` });
    // 새 소식 창 닫기 규칙(2026-11-16 대표 지적): 머리 고정 ×(aria-label '닫기')·맨 아래 '닫기'·Esc.
    // 비모달이라 열린 채 위 메뉴를 누르면 창이 닫히고 이동한다(아래 겹친 창 닫기에서 같이 잰다).
    const closeTop = await page4.evaluate(() => {
      const close = document.querySelector('#updates-panel .panel-heading .close');
      if (!close) return null;
      const r = close.getBoundingClientRect();
      return { label: close.getAttribute('aria-label'), visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
    });
    assert.deepEqual(closeTop, { label: '닫기', visible: true }, '새 소식 창 머리의 닫기 ×가 스크롤과 무관하게 보이고 aria-label은 닫기다');
    await page4.evaluate(() => { const p = document.getElementById('updates-panel'); if (p) p.scrollTop = p.scrollHeight; });
    await page4.waitForTimeout(300);
    const closeBottom = await page4.evaluate(() => {
      const rows = [...document.querySelectorAll('#updates-panel .updates-foot button')];
      const bottom = rows[rows.length - 1];
      if (!bottom) return null;
      const r = bottom.getBoundingClientRect();
      return { text: bottom.textContent.trim(), visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
    });
    assert.deepEqual(closeBottom, { text: '닫기', visible: true }, '새 소식 창 맨 아래에도 닫기가 보인다');
    await take(page4, '새 소식 닫기 버튼');
    // 겹친 창 닫기(2026-11-16 대표 지적): 새 소식(비모달) 위에อีก�창(공유 목록·모달)을 띄우고 Esc →
    // 맨 위 창 하나만 닫힌다(공유 목록 닫힘·새 소식은 남음) → Esc 한 번 더 → 새 소식 닫힘.
    // 머리 메뉴(공유 목록 단추)는 '창이 열린 채 누르면 창 닫고 이동' 규칙의 대상이라, 겹친 창 시험은 메뉴를 거치지 않고 직접 띄운다.
    await page4.evaluate(() => document.getElementById('community-panel')?.showModal());
    await page4.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(500);
    const afterFirst = await page4.evaluate(() => ({ community: !!document.getElementById('community-panel')?.open, updates: !!document.getElementById('updates-panel')?.open }));
    assert.deepEqual(afterFirst, { community: false, updates: true }, 'Esc 1회는 맨 위 창(공유 목록) 하나만 닫는다 — 새 소식은 남는다');
    await take(page4, '겹친 창 닫기');
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(500);
    const afterSecond = await page4.evaluate(() => ({ updates: !!document.getElementById('updates-panel')?.open }));
    assert.deepEqual(afterSecond, { updates: false }, 'Esc 2회차에 새 소식 창이 닫힌다(맨 위 창 하나 규칙)');
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(400);
    // #638: 내 의견 목록 — 가짜 게시물로 상태 말·출처 묶음이 그려진 목록을 검사한다.
    await page4.evaluate(() => document.getElementById('account-my-posts')?.onclick?.());
    await page4.waitForFunction(() => !!document.getElementById('myposts-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(500);
    // #678 후속(회차 지적): 내 의견 머리 줄에 운영센터와 같은 의견 번호(#N)가 작게 보인다.
    const nos = await page4.evaluate(() => [...document.querySelectorAll('.myposts-no')].map((n) => n.textContent.trim()));
    assert.deepEqual(nos, ['#1', '#2', '#3', '#4', '#5'], '게시물마다 의견 번호(#N)가 보인다');
    await take(page4, '내 의견 목록');
    // #678 후속 B: 내 덧붙임 고치기 열림 — 고치기를 눌러 입력칸이 열린 자리. 내 덧붙임에만 단추가 있고
    // 고친 덧붙임에는 (고침) 표시가 붙으며, 운영센터 답변에는 단추가 없는 것까지 한 화면에서 본다.
    const editButtons = await page4.locator('.myposts-reply-btn[data-reply-edit]').count();
    assert.equal(editButtons, 2, '내 덧붙임 둘에만 고치기 단추가 있다(운영센터 답변에는 없다)');
    assert.equal(await page4.locator('.myposts-reply-edited').count(), 1, '고친 덧붙임에 (고침) 표시가 하나 있다');
    // 단추는 덧붙임 머리 줄 안에 있고, 겉모양은 작아도 누름 영역은 44px 이상이다(수치로 판정).
    const buttons = await page4.evaluate(() => {
      const list = [...document.querySelectorAll('.myposts-reply-head .myposts-reply-btn')];
      const rects = list.map(b => b.getBoundingClientRect());
      return { count: list.length, inHead: list.every(b => b.closest('.myposts-reply-head')), minH: Math.round(Math.min(...rects.map(r => r.height))), minW: Math.round(Math.min(...rects.map(r => r.width))) };
    });
    assert.equal(buttons.count, 4, '고치기·지우기 단추 네 개(내 덧붙임 둘)가 모두 머리 줄 안에 있다');
    assert.equal(buttons.inHead, true, '단추의 부모는 덧붙임 머리 줄이다');
    assert.ok(buttons.minH >= 44 && buttons.minW >= 44, `누름 영역 44px 이상(최소 ${buttons.minW}×${buttons.minH}px)`);
    await page4.locator('.myposts-reply-btn[data-reply-edit]').first().click();
    // 고치기 중에는 원래 덧붙임 카드가 숨는다(같은 글이 두 번 보이지 않게).
    await page4.waitForFunction(() => !!document.querySelector('.myposts-reply-edit input'), null, { timeout: 8000 });
    await page4.waitForTimeout(400);
    const editState = await page4.evaluate(() => {
      const editInput = document.querySelector('.myposts-reply-edit input');
      const hiddenBoxes = [...document.querySelectorAll('.myposts-reply')].filter(b => b.hidden);
      return { open: Boolean(editInput), hiddenCount: hiddenBoxes.length };
    });
    assert.equal(editState.open, true, '고치기 입력칸이 열려 있다');
    assert.equal(editState.hiddenCount, 1, '고치는 덧붙임 카드 하나가 숨는다');
    await take(page4, '내 의견 덧붙임 고치기 열림');
    await ctx4.close();

    // 2026-11-17: 운영센터 '한눈에' — 숫자 4장·할 일 3장이 1440·1920에서 각각 한 줄, 390은 줄바꿈(가로 넘침 0),
    // 모든 카드가 같은 누름 모양(role·tabindex·44px 이상)이고, 탭이 있는 카드는 그 탭을 조건으로 열며
    // 탭이 없는 카드는 내역을 펼친다(다시 누르면 접힘). 관리자 세션은 가짜 API(응답 모형)로 만든다.
    const ctxAdm = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctxAdm.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctxAdm.route('**://i.ytimg.com/**', THUMB);
    await ctxAdm.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctxAdm.route('**/api/admin/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true, admin: true, role: 'admin' }) }));
    await ctxAdm.route('**/api/admin/feedback', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, feedback: [
      { id: 'f1', kind: 'opinion', status: 'received', replyCount: 0, createdAt: '2026-11-14T09:00:00.000Z', displayTitle: '꼬리표가 안 붙어요', issueNumber: 741 },
      { id: 'f2', kind: 'opinion', status: 'fixed', replyCount: 2, createdAt: '2026-11-13T09:00:00.000Z', displayTitle: '편집 창 꼬리표', issueNumber: 736 },
      { id: 'f3', kind: 'journal', status: 'reviewing', replyCount: 0, createdAt: '2026-11-12T09:00:00.000Z', displayTitle: '오늘 사용 일지', issueNumber: null }
    ] }) }));
    await ctxAdm.route('**/api/admin/journals', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, journals: [] }) }));
    await ctxAdm.route('**/api/community/admin/reports', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, reports: [
      { id: 'r1', status: 'open', reason: '시험 신고', shareId: 'share-1', createdAt: '2026-11-14T10:00:00.000Z', hidden: false }
    ] }) }));
    await ctxAdm.route('**/api/admin/stats', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stats: {
      checkedAt: '2026-11-16T00:00:00.000Z', window: { days: 7, since: '2026-11-09T00:00:00.000Z' },
      accounts: { total: 8, real: 2, aiTester: 4, tester: 2, new: { total: 3, real: 1, aiTester: 1, tester: 1 } },
      trees: { total: 9, real: 4, aiTester: 3, tester: 2, titles: ['가을 노래', '겨울 산책', '봄의 기록'], public: { total: 3, real: 2, aiTester: 1, tester: 0, titles: ['가을 노래', '봄의 기록'] }, featured: { total: 1, real: 1, aiTester: 0, tester: 0, titles: ['가을 노래'] } },
      moments: { total: 40, real: 21, aiTester: 12, tester: 7, new: { total: 6, real: 3, aiTester: 2, tester: 1 } }
    } }) }));
    await ctxAdm.route('**://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: 736, title: '시험 이슈', state: 'open' }) }));
    const pageAdm = await ctxAdm.newPage();
    await pageAdm.goto(`${base}/admin.html`, { waitUntil: 'load' });
    await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-stats .lt-stat').length === 4 && document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 3, null, { timeout: 20000 });
    await pageAdm.waitForTimeout(400);
    const adminCards = await pageAdm.evaluate(() => {
      const stat = [...document.querySelectorAll('.lt-stats .lt-stat')];
      const todo = [...document.querySelectorAll('.lt-ov-cards .lt-ov-card')];
      const all = [...stat, ...todo];
      const rects = all.map((el) => el.getBoundingClientRect());
      const flat = (el) => el.textContent.replace(/\s+/g, ' ').trim();
      return {
        statCount: stat.length, todoCount: todo.length,
        statTops: [...new Set(stat.map((el) => Math.round(el.getBoundingClientRect().top)))],
        todoTops: [...new Set(todo.map((el) => Math.round(el.getBoundingClientRect().top)))],
        minW: Math.round(Math.min(...rects.map((r) => r.width))), minH: Math.round(Math.min(...rects.map((r) => r.height))),
        roles: all.map((el) => el.getAttribute('role')), tabs: all.map((el) => el.getAttribute('tabindex')),
        cursors: [...new Set(all.map((el) => getComputedStyle(el).cursor))],
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        firstStatText: flat(stat[0]),
        treeCardText: flat(stat.find((el) => el.dataset.statToggle === 'public-trees'))
      };
    });
    assert.equal(adminCards.statCount, 4, '전체 숫자 카드 4개');
    assert.equal(adminCards.todoCount, 3, '처리할 일 카드 3개');
    if (width >= 1440) {
      assert.equal(adminCards.statTops.length, 1, `전체 숫자 카드가 한 줄이다(카드 위 좌표 ${JSON.stringify(adminCards.statTops)})`);
      assert.equal(adminCards.todoTops.length, 1, `처리할 일 카드가 한 줄이다(카드 위 좌표 ${JSON.stringify(adminCards.todoTops)})`);
    }
    assert.equal(adminCards.overflow, 0, `운영센터 가로 넘침 0(실제 ${adminCards.overflow}px)`);
    assert.ok(adminCards.minH >= 44 && adminCards.minW >= 44, `카드 누름 영역 44px 이상(최소 ${adminCards.minW}×${adminCards.minH}px)`);
    assert.deepEqual(adminCards.roles, Array(7).fill('button'), '모든 카드가 role=button이다');
    assert.deepEqual(adminCards.tabs, Array(7).fill('0'), '모든 카드가 tabindex=0이다(키보드로 연다)');
    assert.deepEqual(adminCards.cursors, ['pointer'], `모든 카드가 같은 누름 모양(커서 ${JSON.stringify(adminCards.cursors)})`);
    // 숫자 뜻: 큰 숫자가 '실제 고객'이고, 전체 = 실제 + AI + 시험을 카드 안에 함께 적는다.
    assert.ok(adminCards.firstStatText.includes('실제 고객'), `큰 숫자가 무엇을 세는지 카드 안에 적는다(실측: ${adminCards.firstStatText})`);
    assert.ok(adminCards.firstStatText.includes('전체 8') && adminCards.firstStatText.includes('AI 4') && adminCards.firstStatText.includes('시험 2'), `전체 = 실제+AI+시험을 함께 적는다(실측: ${adminCards.firstStatText})`);
    assert.ok(adminCards.treeCardText.includes('전체 3'), `공개 트리 카드도 전체를 함께 적는다(실측: ${adminCards.treeCardText})`);
    await take(pageAdm, '운영센터 한눈에');

    // 1920에서도 두 묶음이 각각 한 줄이다(#743 대표 요청).
    if (width >= 1440) {
      await pageAdm.setViewportSize({ width: 1920, height: 1080 });
      await pageAdm.waitForTimeout(400);
      const wide = await pageAdm.evaluate(() => ({
        statTops: [...new Set([...document.querySelectorAll('.lt-stats .lt-stat')].map((el) => Math.round(el.getBoundingClientRect().top)))],
        todoTops: [...new Set([...document.querySelectorAll('.lt-ov-cards .lt-ov-card')].map((el) => Math.round(el.getBoundingClientRect().top)))],
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      }));
      assert.equal(wide.statTops.length, 1, `1920 전체 숫자 한 줄(실측 ${JSON.stringify(wide.statTops)})`);
      assert.equal(wide.todoTops.length, 1, `1920 처리할 일 한 줄(실측 ${JSON.stringify(wide.todoTops)})`);
      assert.equal(wide.overflow, 0, `1920 가로 넘침 0(실제 ${wide.overflow}px)`);
      await pageAdm.setViewportSize({ width, height });
      await pageAdm.waitForTimeout(300);
    }

    // 탭이 없는 카드(전체 숫자)는 내역이 펼쳐지고, 다시 누르면 접힌다. Enter로도 열린다.
    const expand = await pageAdm.evaluate(() => {
      const card = document.querySelector('[data-stat-toggle="trees"]');
      card.click();
      const detail = document.getElementById('stat-detail-trees');
      const open = { hidden: detail.hidden, expanded: card.getAttribute('aria-expanded'), titles: detail.querySelectorAll('.lt-stat-titles li').length, split: detail.querySelectorAll('.lt-stat-split li').length, text: detail.textContent.replace(/\s+/g, ' ').trim() };
      card.click();
      const closed = { hidden: detail.hidden, expanded: card.getAttribute('aria-expanded') };
      return { open, closed };
    });
    assert.deepEqual([expand.open.hidden, expand.open.expanded], [false, 'true'], '탭이 없는 카드를 누르면 내역이 펼쳐진다');
    assert.equal(expand.open.titles, 3, `트리 카드 내역에 제목 목록(최대 20)이 보인다(실측 ${expand.open.titles}개)`);
    assert.equal(expand.open.split, 3, '내역에 실제 고객·AI 명예회원·시험 계정 갈래 수가 있다');
    assert.ok(expand.open.text.includes('AI 명예회원') && !/@/.test(expand.open.text), '내역에 이메일 같은 개인정보는 없다');
    assert.deepEqual([expand.closed.hidden, expand.closed.expanded], [true, 'false'], '다시 누르면 내역이 접힌다');
    await pageAdm.focus('[data-stat-toggle="accounts"]');
    await pageAdm.keyboard.press('Enter');
    await pageAdm.waitForTimeout(200);
    const byEnter = await pageAdm.evaluate(() => ({ hidden: document.getElementById('stat-detail-accounts').hidden, expanded: document.querySelector('[data-stat-toggle="accounts"]').getAttribute('aria-expanded') }));
    assert.deepEqual([byEnter.hidden, byEnter.expanded], [false, 'true'], 'Enter로도 내역이 펼쳐진다');
    await pageAdm.keyboard.press('Enter');
    await pageAdm.waitForTimeout(200);

    // 탭이 있는 카드는 그 탭을 해당 조건으로 걸러 연다(주소에 조건이 남는다).
    const jump = async (selector) => {
      await pageAdm.evaluate(() => { location.hash = '#overview'; });
      await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 3, null, { timeout: 8000 });
      await pageAdm.click(selector);
      await pageAdm.waitForFunction(() => location.hash !== '#overview', null, { timeout: 8000 });
      await pageAdm.waitForTimeout(200);
      return pageAdm.evaluate(() => ({ hash: location.hash, filterNote: !!document.querySelector('[data-clear-filter]') }));
    };
    const pending = await jump('[data-ov-view="board"][data-ov-status="pending"]');
    assert.equal(pending.hash, '#board?status=pending', `처리 대기 카드 → 고객 글 탭의 처리 대기(실제 ${pending.hash})`);
    const unanswered = await jump('[data-ov-unanswered="1"]');
    assert.equal(unanswered.hash, '#board?unanswered=1', `답글 0 카드 → 답글 0만 거른 고객 글(실제 ${unanswered.hash})`);
    assert.equal(unanswered.filterNote, true, '거른 조건을 지우는 단추가 함께 보인다');
    // 2026-11-17: 할 일 카드만 남았고 신고·고치는 일 카드는 없다(고객 글 거르기로 옮김).
    assert.equal(await pageAdm.locator('[data-ov-view="reports"]').count(), 0, '신고 카드 없음');
    assert.equal(await pageAdm.locator('[data-ov-view="issues"]').count(), 0, '고치는 일 카드 없음');
    // 키보드(Space)로도 남은 카드가 열린다.
    await pageAdm.evaluate(() => { location.hash = '#overview'; });
    await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 3, null, { timeout: 8000 });
    await pageAdm.focus('[data-ov-view="board"][data-ov-status="pending"]');
    await pageAdm.keyboard.press(' ');
    await pageAdm.waitForFunction(() => location.hash.startsWith('#board?status='), null, { timeout: 8000 });
    assert.equal(await pageAdm.evaluate(() => location.hash), '#board?status=pending', 'Space로도 카드가 열린다');
    await ctxAdm.close();

    // #666 2번: 계정 메뉴가 열린 자리에서 첫 트리 안내가 메뉴를 덮지 않는다(한 번에 하나만).
    // 안내가 뜨고 메뉴가 열리면 안내를 잠시 접고, 메뉴를 닫으면 다시 뜨는 것까지 확인한다.
    const ctx5 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx5.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx5.route('**://i.ytimg.com/**', THUMB);
    await ctx5.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx5.route('**/api/workspace**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [firstTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    }));
    await ctx5.route('**/api/trees/*/discover*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, discover: true }) }));
    const page5 = await ctx5.newPage();
    // ?account=1 은 '내 기록을 불러오는 자리'라는 표시다(shouldLoadMemberRecords) — 로그인 화면으로 가지 않고 기록을 읽는다.
    await page5.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page5.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
    await page5.waitForFunction(() => !document.getElementById('tree-tips')?.hidden, null, { timeout: 8000 });
    await page5.click('#account-avatar');
    await page5.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 8000 });
    await page5.waitForTimeout(300);
    const both = await page5.evaluate(() => ({ tips: !document.getElementById('tree-tips').hidden, pop: !document.getElementById('account-popover').hidden }));
    assert.equal(both.pop, true, '계정 메뉴가 열렸다');
    assert.equal(both.tips, false, '메뉴가 열려 있는 동안 첫 트리 안내는 접혀 있다(한 번에 하나만 보인다)');
    await take(page5, '계정 메뉴·첫 트리 안내');
    // 접었다고 '봤음'으로 적지 않는다 — 메뉴를 닫으면 안내가 그대로 돌아온다.
    await page5.click('#account-avatar');
    await page5.waitForTimeout(400);
    const after = await page5.evaluate(() => ({ tips: !document.getElementById('tree-tips').hidden, pop: !document.getElementById('account-popover').hidden, seen: localStorage.getItem('lt41.tips.firstTree') || '' }));
    assert.deepEqual({ tips: after.tips, pop: after.pop }, { tips: true, pop: false }, '메뉴를 닫으면 안내가 다시 뜬다(봤음 처리하지 않음)');
    assert.notEqual(after.seen, '1', '접었다고 봤음으로 적지 않는다');
    // #678 후속(꼬리표 걸러 보기): 트리 메뉴의 내 순간 전체 보기로 홈 보기를 열면 순간 목록이
    // 처음부터 열린다(#394 경로). 화면 점검 계정은 순간 다섯 개이며, 첫 순간의 꼬리표로 걸러 보는 것도 확인한다.
    // 셸의 보기 프레임은 src가 빈 채 내용이 채워지므로
    // 프레임을 URL이 아니라 내용(orbit 순간 목록 단추)으로 찾는다 — 매 단계 다시 찾는다.
    // 이 상태에서만 순간 다섯 개짜리 트리를 쓴다 — 앞 상태들(첫 트리 안내)은 '트리 하나·순간 하나' 조건이라 그대로 둔다.
    const fiveMomentRoute = (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [fiveMomentTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    });
    await ctx5.route('**/api/workspace**', fiveMomentRoute);
    const page5b = await ctx5.newPage();
    await page5b.addInitScript(() => localStorage.removeItem('lt41.updatesCardDay'));
    await page5b.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page5b.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
    // #1103: 안내는 한 줄을 차례로 지나간다. 이 상태는 목록 창이 주인공이므로 먼저 뜬 판·띠를 닫아 줄을 비운다.
    await page5b.waitForFunction(() => !document.getElementById('tree-tips')?.hidden, null, { timeout: 8000 }).catch(() => {});
    if (!await page5b.evaluate(() => document.getElementById('tree-tips')?.hidden)) await page5b.click('#tree-tips-close');
    await page5b.waitForFunction(() => { const c = document.getElementById('updates-card'); return c && !c.hidden; }, null, { timeout: 10000 }).catch(() => {});
    if (!await page5b.evaluate(() => document.getElementById('updates-card')?.hidden)) await page5b.click('#updates-dismiss');
    await page5b.waitForFunction(() => { const c = document.getElementById('updates-card'); return c && c.hidden; }, null, { timeout: 8000 }).catch(() => {});
    await page5b.click('#record-menu');
    await page5b.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 8000 });
    await page5b.click('#tree-popover [data-tree-action="moments"]');
    const orbitFrameOf = async () => {
      for (const f of page5b.frames()) {
        if (f === page5b.mainFrame()) continue;
        let ok = false;
        try {
          ok = await Promise.race([
            f.evaluate(() => document.documentElement.getBoundingClientRect().width > 0 && Boolean(document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]'))),
            page5b.waitForTimeout(2000).then(() => false)
          ]);
        } catch { ok = false; }
        if (ok) return f;
      }
      return null;
    };
    const frameEval = async (fn) => {
      const f = await orbitFrameOf();
      if (!f) return null;
      try {
        return await Promise.race([f.evaluate(fn), page5b.waitForTimeout(2000).then(() => null)]);
      } catch { return null; }
    };
    let chips0 = null;
    for (let i = 0; i < 24; i++) {
      const list = await frameEval(() => Boolean(document.getElementById('orbit')?.shadowRoot?.querySelector('.index-list .indexTagChip')));
      if (!list) {
        const f = await orbitFrameOf();
        if (f) await f.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=moments],[data-do=index]').click()).catch(() => {});
        await page5b.waitForTimeout(400);
      }
      chips0 = await frameEval(() => {
        const sr = document.getElementById('orbit')?.shadowRoot;
        return {
          chips: sr ? [...sr.querySelectorAll('.index-list .indexTagChip')].map((b) => b.textContent.trim()) : [],
          rows: sr ? sr.querySelectorAll('.index-list [data-lt-moment-row]').length : 0
        };
      });
      if (chips0 && chips0.chips.some((t) => t.includes('노래 · Super Shy'))) break;
      await page5b.waitForTimeout(400);
    }
    assert.ok(chips0 && chips0.chips.some((t) => t.includes('노래 · Super Shy')), '꼬리표 칩에 노래 · Super Shy가 있다 — 실측=' + JSON.stringify(chips0));
    assert.equal(chips0.rows, 5, `순간 목록에 다섯 개의 가짜 순간이 화면에 있다 — 실측=${JSON.stringify(chips0)}`);
    const listState = await frameEval(() => {
      const dialog = document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[open]');
      const list = dialog?.querySelector('.index-list'), r = list?.getBoundingClientRect();
      return { open: !!dialog, width: r?.width || 0, height: r?.height || 0, rows: list?.querySelectorAll('[data-lt-moment-row]').length || 0 };
    });
    assert.ok(listState?.open && listState.width > 0 && listState.height > 0 && listState.rows === 5, `순간 목록 창과 다섯 줄이 화면에 있다: ${JSON.stringify(listState)}`);
    const listFooter = await page5b.evaluate(() => ({
      sheet: document.body.classList.contains('lt-sheet-open'),
      links: getComputedStyle(document.querySelector('.home-links')).display,
      card: getComputedStyle(document.getElementById('updates-card')).display
    }));
    assert.deepEqual(listFooter, { sheet: true, links: 'none', card: 'none' }, `순간 목록 창이 열리면 아래 고정 항목이 숨는다: ${JSON.stringify(listFooter)}`);
    // #1103: 띠·판은 이 자리에서 우리가 닫았다. 정보 안내가 스스로 내려갈 때까지 기다린 뒤,
    // 문구 길이가 자리 검사에 끼어들지 않도록 짧은 한 줄을 셸 알림 줄 자리에 그대로 그린다.
    await page5b.waitForFunction(() => { const t = document.getElementById('toast'); return t && t.hidden; }, null, { timeout: 12000 }).catch(() => {});
    await page5b.evaluate(() => { const t = document.getElementById('toast'); t.textContent = '불러왔어요.'; t.hidden = false; });
    const toastBox = await page5b.locator('#toast').boundingBox();
    const shellFrameBox = await page5b.locator('#view').boundingBox();
    const listFrame = await orbitFrameOf();
    const listWindowBox = await listFrame.evaluate(() => {
      const r = document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[open]')?.getBoundingClientRect();
      return r && { top: r.top, width: r.width, height: r.height };
    });
    const lastListRow = await listFrame.evaluate(() => {
      const rows = [...(document.getElementById('orbit')?.shadowRoot?.querySelectorAll('dialog[open] .index-list [data-lt-moment-row]') || [])];
      const r = rows.at(-1)?.getBoundingClientRect();
      return r && { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    assert.ok(toastBox?.width > 0 && toastBox?.height > 0 && shellFrameBox?.width > 0 && listWindowBox?.width > 0 && listWindowBox?.height > 0 && lastListRow?.width > 0 && lastListRow?.height > 0,
      `목록 창 겹침 검사에서 알림·창·마지막 순간·프레임이 모두 보인다: ${JSON.stringify({ toastBox, shellFrameBox, listWindowBox, lastListRow })}`);
    const rowInPage = { x: shellFrameBox.x + lastListRow.x, y: shellFrameBox.y + lastListRow.y, width: lastListRow.width, height: lastListRow.height };
    const toastOverlap = Math.max(0, Math.min(toastBox.x + toastBox.width, rowInPage.x + rowInPage.width) - Math.max(toastBox.x, rowInPage.x))
      * Math.max(0, Math.min(toastBox.y + toastBox.height, rowInPage.y + rowInPage.height) - Math.max(toastBox.y, rowInPage.y));
    assert.equal(toastOverlap, 0, `알림 줄과 순간 목록 마지막 줄 겹침이 0px²이다: ${JSON.stringify({ toastBox, rowInPage, toastOverlap })}`);
    assert.ok(toastBox.y + toastBox.height <= shellFrameBox.y + listWindowBox.top, `알림 줄은 목록 창 위쪽 바깥에 있다: ${JSON.stringify({ toastBox, shellFrameBox, listWindowBox })}`);
    await take(page5b, '순간 목록 다섯 개');
    await lowerToast(page5b);
    const listClose = await frameEval(() => {
      const b = document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[open] [data-do="close"]');
      const r = b?.getBoundingClientRect();
      return r && { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const listFrameBox = await page5b.locator('#view').boundingBox();
    assert.ok(listClose && listFrameBox, `순간 목록 닫기 단추의 좌표를 읽었다: ${JSON.stringify({ listClose, listFrameBox })}`);
    await page5b.mouse.click(listFrameBox.x + listClose.x + listClose.width / 2, listFrameBox.y + listClose.y + listClose.height / 2);
    await page5b.waitForFunction(() => !document.body.classList.contains('lt-sheet-open'), null, { timeout: 8000 });
    const restoredFooter = await page5b.evaluate(() => ({
      links: getComputedStyle(document.querySelector('.home-links')).display,
      card: getComputedStyle(document.getElementById('updates-card')).display
    }));
    // #1103: 이 상태는 줄을 비우려고 띠를 닫았다(한 번에 하나). 링크 줄은 창을 닫으면 돌아오고, 닫은 띠는 돌아오지 않는다.
    assert.deepEqual(restoredFooter, { links: 'flex', card: 'none' }, `순간 목록 창을 닫으면 아래 링크 줄이 돌아온다(닫아 둔 띠는 그대로): ${JSON.stringify(restoredFooter)}`);
    let picked = null;
    for (let i = 0; i < 16; i++) {
      picked = await frameEval(() => {
        const sr = document.getElementById('orbit')?.shadowRoot;
        if (!sr) return null;
        const chips = [...sr.querySelectorAll('.index-list .indexTagChip')];
        return {
          open: !!sr.querySelector('dialog[open]'),
          picked: sr.querySelectorAll('.index-list .indexTagPicked').length,
          rows: sr.querySelectorAll('.index-list [data-lt-moment-row]').length,
          minH: chips.length ? Math.min(...chips.map((b) => Math.round(b.getBoundingClientRect().height))) : null
        };
      });
      // 닫힌 dialog 안의 요소는 getBoundingClientRect가 0이다(실측: 닫힘 0 / 열림 44).
      // 창이 열려 있고 칩이 실제로 보일 때까지 기다린 뒤에만 높이를 단정한다.
      if (picked && picked.open && picked.picked >= 1 && picked.rows >= 1 && picked.rows < chips0.rows && picked.minH >= 44) break;
      const f = await orbitFrameOf();
      if (f) await f.evaluate(() => { const sr = document.getElementById('orbit')?.shadowRoot; const b = sr && [...sr.querySelectorAll('.index-list .indexTagChip')].find((b) => b.textContent.includes('노래 · Super Shy')); if (b) b.click(); }).catch(() => {});
      await page5b.waitForTimeout(400);
    }
    const pickDetail = `실측=${JSON.stringify(picked)}, 기다린 것: 열린 목록 창 + 고른 꼬리표 1개 이상 + 줄 수 감소 + 칩 높이 44px 이상`;
    assert.ok(picked && picked.picked >= 1, '고른 꼬리표가 위에 모여 보인다 — ' + pickDetail);
    assert.ok(picked.rows >= 1 && picked.rows < chips0.rows, '걸러 보기로 순간 수가 준다 — ' + pickDetail);
    assert.ok(picked.open, '칩을 잴 때 목록 창이 열려 있다 — ' + pickDetail);
    assert.ok(picked.minH >= 44, '칩 누름 영역 44px 이상 — ' + pickDetail);
    await take(page5b, '순간 목록 꼬리표 걸러 보기');
    await ctx5.unroute('**/api/workspace**', fiveMomentRoute);
    await page5b.close();
    // #627 PR B: 꼬리표 줄이 열린 상세(보드) — 확정 칩·직접 입력이 보이는 자리에서 겹침·잘림·작은 글자를 잰다.
    // 같은 문맥에서 보드를 새로 연다(주소에 보기까지 넣는다 — 셸은 불러올 때의 주소로 보기를 정한다).
    await ctx5.route('**/api/workspace**', fiveMomentRoute);
    const page6 = await ctx5.newPage();
    await page6.goto(`${base}/v41/?account=1#board`, { waitUntil: 'load' });
    await frameOf(page6, /views\/track/);
    await page6.waitForTimeout(1500);
    const tagBoard = await frameOf(page6, /track58-pinboard/);
    assert.ok(tagBoard, '보드 프레임이 열린다(꼬리표 줄 상태)');
    await tagBoard.waitForFunction(() => !!document.getElementById('dTags') && document.getElementById('dTags').childNodes.length > 0, null, { timeout: 10000 }).catch(() => {});
    await tagBoard.evaluate(() => selectMoment(LTDEMO.moments[0].id));
    await page6.waitForTimeout(600);
    await page6.waitForFunction(() => document.body.classList.contains('lt-sheet-open'), null, { timeout: 8000 });
    const detailState = await page6.evaluate(() => {
      const detail = document.querySelector('#view')?.contentDocument?.getElementById('detail');
      const r = detail?.getBoundingClientRect();
      return { open: !!detail?.classList.contains('open'), width: r?.width || 0, height: r?.height || 0, footerDisplay: getComputedStyle(document.querySelector('.home-links')).display, cardDisplay: getComputedStyle(document.getElementById('updates-card')).display, fabDisplay: getComputedStyle(document.getElementById('mobile-add')).display, trees: window.LT41?.trees?.length || 0, moments: window.LT41?.tree?.moments?.length || 0 };
    });
    assert.equal(detailState.open, true, `순간 상세 창이 실제로 열려 있다: ${JSON.stringify(detailState)}`);
    assert.ok(detailState.width > 0 && detailState.height > 0, `순간 상세 창이 화면에 있다: ${JSON.stringify(detailState)}`);
    assert.ok(detailState.trees >= 1 && detailState.moments >= 5, `보드·상세는 트리 하나·순간 다섯 개 이상인 가짜 계정이다: ${JSON.stringify(detailState)}`);
    assert.equal(detailState.footerDisplay, 'none', `상세 창이 열리면 아래 링크 줄을 숨긴다: ${JSON.stringify(detailState)}`);
    assert.equal(detailState.cardDisplay, 'none', `상세 창이 열리면 새 소식 카드를 숨긴다: ${JSON.stringify(detailState)}`);
    assert.equal(detailState.fabDisplay, 'none', `상세 창이 열리면 ＋ 단추를 숨긴다: ${JSON.stringify(detailState)}`);
    // 직접 붙이기는 접힘이 기본이다(261116 대표 지적) — [직접 붙이기]가 보이고 입력 줄은 아직 없다.
    const tagFolded = await tagBoard.evaluate(() => ({
      toggle: !!document.querySelector('#dTags .lt-tagline-toggle'),
      row: !!document.querySelector('#dTags .lt-tagline-kind')
    }));
    assert.deepStrictEqual(tagFolded, { toggle: true, row: false }, '꼬리표 직접 붙이기는 접힘이 기본이다 — [직접 붙이기]만 보인다');
    await tagBoard.evaluate(() => document.querySelector('#dTags .lt-tagline-toggle')?.click());
    await tagBoard.waitForFunction(() => !!document.querySelector('#dTags .lt-tagline-kind'), null, { timeout: 8000 });
    // 펼친 입력 줄이 실제로 보이는지 단정한다(숨김 클래스를 쓰면 검사기 겹침만으로는 못 잡는다 — 실측에서 잡았던 결함).
    const tagInputSeen = await tagBoard.evaluate(() => ['.lt-tagline-kind', '.lt-tagline-value', '.lt-tagline-add'].map((s) => {
      const el = document.querySelector(`#dTags ${s}`);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none';
    }));
    assert.deepStrictEqual(tagInputSeen, [true, true, true], '펼친 꼬리표 입력 줄(갈래·내용·붙이기)이 상세 판에 보여야 한다');
    // #627 2차: '보드 1440 판 폭' — 보드 iframe이 셸 내용 폭을 다 쓰는지, 보드 안 .app이 가로로 밀려
    // (숨은 가로 스크롤) 오른쪽에 검은 빈 자리가 생기지 않는지 단정한다. 스크롤을 부르는 동작을 해도
    // 판이 밀리지 않아야 한다(overflow:clip으로 스크롤 컨테이너가 아니게 만들었다).
    const boardWidth = await page6.evaluate(() => ({
      stageW: document.getElementById('stage').clientWidth,
      frameW: Math.round(document.getElementById('view').getBoundingClientRect().width),
    }));
    assert.equal(boardWidth.frameW, boardWidth.stageW, `보드 iframe 폭 = 셸 내용 폭(실제: ${JSON.stringify(boardWidth)})`);
    const appScroll = await tagBoard.evaluate(() => {
      const app = document.getElementById('app');
      return { sl: app.scrollLeft, sw: app.scrollWidth, cw: app.clientWidth };
    });
    assert.equal(appScroll.sl, 0, '보드 .app이 가로로 밀려 있지 않다(검은 빈 자리 없음)');
    await tagBoard.evaluate(() => { document.getElementById('app').scrollLeft = 400; });
    assert.equal(await tagBoard.evaluate(() => document.getElementById('app').scrollLeft), 0, '보드 .app은 가로 스크롤 컨테이너가 아니다(overflow:clip — 밀어도 안 밀린다)');
    await tagBoard.evaluate(() => document.getElementById('dTags').scrollIntoView({ block: 'center' }));
    await page6.waitForTimeout(200);
    assert.equal(await tagBoard.evaluate(() => document.getElementById('app').scrollLeft), 0, '꼬리표 줄로 스크롤해도 보드 판이 가로로 밀리지 않는다');
    // #716: 390 두 줄 도구 줄 — 카드가 도구 줄 밑으로 들어가 꼬리표·제목이 비치지 않는다(교차 면적 0·바탕 알파 1),
    // 도구 줄이 옆으로 넘치거나 단추가 잘리지 않고, '선택한 순간' 고르기 칸도 도구 줄과 겹치지 않는다.
    if (width === 390) {
      const bar = await tagBoard.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, rt: r.right }; };
        const header = document.querySelector('header');
        const hb = box(header);
        const cs = getComputedStyle(header);
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || [];
        const alphas = stops.map((s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return 1; const p = m[1].split(',').map((v) => parseFloat(v)); return p.length > 3 ? p[3] : 1; });
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') alphas.push(1);
        const items = [...header.querySelectorAll('button, .boardThemeSwitch, .boardModeSwitch, .tree-title')].filter((el) => {
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0;
        }).map((el) => ({ text: (el.textContent || '').trim().slice(0, 12), ...box(el) }));
        const vw = innerWidth;
        const texts = [...document.querySelectorAll('#cardLayer .card h3, #cardLayer .card .cardMeta, #cardLayer .card .keywordOnCard, #cardLayer .card .videoTitle, #cardLayer .card .domain, #cardLayer .card small, #cardLayer .card .firstTag')].filter((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; });
        const frame = box(document.getElementById('viewport'));
        let area = 0;
        for (const el of texts) {
          const r = box(el);
          // 판(.boardFrame)은 overflow:hidden 이라 위로 삐져나온 카드는 잘려 보이지 않는다 —
          // 도구 줄 뒤로 '보이는' 겹침만 잡는다(텍스트 ∩ 도구 줄 ∩ 판 보이는 영역).
          const w = Math.min(hb.rt, r.rt, frame.rt) - Math.max(hb.l, r.l, frame.l);
          const h = Math.min(hb.b, r.b, frame.b) - Math.max(hb.t, r.t, frame.t);
          if (w > 0 && h > 0) area += w * h;
        }
        const frameTop = Math.round(frame.t);
        const picker = document.querySelector('.lt-moment-picker');
        const pb = picker ? box(picker) : null;
        const pickerOverlap = pb ? Math.max(0, Math.min(hb.b, pb.b) - Math.max(hb.t, pb.t)) : 0;
        return {
          alphas, overlapArea: Math.round(area),
          overflowRight: Math.round(Math.max(0, ...items.map((i) => i.rt - vw))),
          cut: items.filter((i) => i.rt > vw + 0.5 || i.l < -0.5).map((i) => i.text).join(','),
          frameTop, headerBottom: Math.round(hb.b), pickerOverlap: Math.round(pickerOverlap)
        };
      });
      assert.equal(bar.alphas.some((a) => a < 1), false, `390 도구 줄 바탕은 불투명하다(정지 색 알파 ${JSON.stringify(bar.alphas)})`);
      assert.equal(bar.overlapArea, 0, `390 도구 줄 뒤로 카드 글자가 들어가지 않는다(교차 면적 ${bar.overlapArea}px²)`);
      assert.equal(bar.overflowRight, 0, `390 도구 줄이 가로로 넘치지 않는다(넘침 ${bar.overflowRight}px)`);
      assert.equal(bar.cut, '', `390 잘린 단추가 없다(잘림: ${bar.cut || '없음'})`);
      assert.ok(bar.frameTop >= bar.headerBottom, `390 판이 도구 줄 아래끝(${bar.headerBottom}px)부터 시작한다(실제 ${bar.frameTop}px)`);
      assert.equal(bar.pickerOverlap, 0, `390 '선택한 순간' 고르기 칸이 도구 줄과 겹치지 않는다(겹침 ${bar.pickerOverlap}px)`);
    }
    await take(page6, '꼬리표 줄이 열린 상세');
    // #627 PR B: 꼬리표 정리 화면 — 목록·개수와 '제목에서 꼬리표 한 번에 제안받기'가 그려진 자리를 잰다.
    await page6.evaluate(() => document.getElementById('record-menu')?.click());
    await page6.waitForTimeout(400);
    await page6.evaluate(() => document.querySelector('[data-tree-action="tags"]')?.click());
    await page6.waitForFunction(() => !!document.getElementById('tag-panel')?.open, null, { timeout: 8000 });
    await page6.waitForTimeout(300);
    await page6.evaluate(() => document.getElementById('tag-suggest-open')?.click());
    await page6.waitForTimeout(400);
    await take(page6, '꼬리표 정리 화면');
    // #627 후속: 책 쪽(카드)에도 확정 꾀리표가 그려지는지 단정한다 — 책 페이지는 book-extra.js가
    // momentContent를 덮어 써 paintTitle로 제목 줄을 다시 그리므로, 거기에 꾀리표가 없으면 책 카드에는
    // 끝내 보이지 않는다(실측에서 잡았던 결함). 첫 순간을 선택한 채 책으로 넘어가 칩을 센다.
    await page6.evaluate(() => { location.hash = '#my/book?tree=' + LT41.tree.id; });
    await frameOf(page6, /track59-sketchbook/);
    await page6.waitForTimeout(1500);
    const bookChips = await (await readyFrame(page6, /track59-sketchbook/, { why: '책 쪽 확정 꾀리표를 읽을 책 프레임' })).evaluate(() =>
      [...document.querySelectorAll('.moment-title .lt-tag-chip')].map((n) => n.textContent.trim()));
    assert.ok(bookChips.includes('Super Shy') && bookChips.includes('무대'), `책 쪽에 확정 꾀리표 칩이 그려져야 한다(실제: ${JSON.stringify(bookChips)})`);
    // 보드 첫 진입 두 안내(390) — 셸 알림('내 기록을 불러왔어요.')과 보드 안내 말풍선('순간을 선택해…')이
    // 같은 자리에 포개지지 않는다. 보드는 ≤700px에서 말풍선을 화면 아래 중앙(bottom 95px)에 띄우고,
    // 셸 알림도 #666 규칙으로 아래 중앙(--lt-toast-bottom)에 뜬다. 보드는 셸 알림이 떠 있는 동안
    // 기다렸다 말풍선을 띄운다 — 두 상자가 동시에 보이는 동안에는 겹침 면적이 0이어야 한다.
    // 1440은 말풍선(오른쪽 아래)·알림(아래 중앙)이 다른 모서리라 기하학적으로 겹치지 않고, 선택 복원으로
    // 상세 판이 열려 안내가 뜨지 않는 폭이어서 390에서만 잰다.
    // 새 문맥으로 띄운다(저장된 보기·선택이 없어야 첫 진입 흐름 — 900ms 뒤 말풍선, 셸 알림은 약 3초 — 이 재현된다).
    if (width === 390) {
      const ctxNotice = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxNotice.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxNotice.route('**://i.ytimg.com/**', THUMB);
      await ctxNotice.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxNotice.route('**/api/workspace**', (r) => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ revision: 1, state: { version: 1, trees: [firstTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
      }));
      const pageNotice = await ctxNotice.newPage();
      await pageNotice.goto(`${base}/v41/?account=1#board`, { waitUntil: 'domcontentloaded' });
      await readyFrame(pageNotice, /track58-pinboard/, { root: '#cardLayer', why: '390 보드 첫 진입 프레임' });
      // #1103: 판이 떠 있으면 안내 줄을 비운다 — 정보 안내는 그 뒤에 차례로 온다.
      // (이 화면은 #board라 새 소식 띠는 뜨지 않는다 — 띠는 첫 화면에서만.)
      await pageNotice.waitForFunction(() => !document.getElementById('tree-tips')?.hidden, null, { timeout: 8000 }).catch(() => {});
      if (!await pageNotice.evaluate(() => document.getElementById('tree-tips')?.hidden)) await pageNotice.click('#tree-tips-close');
      const twoNotices = await pageNotice.evaluate(async () => {
        const boxOf = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, rt: r.right }; };
        const overlapArea = (a, b) => Math.max(0, Math.min(a.rt, b.rt) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        // 보드 문서는 #view·#view-next 가운데 지금 #cardLayer(보드)를 든 쪽이다(셸이 두 프레임을 갈아끼운다).
        const boardToast = () => {
          for (const id of ['view', 'view-next']) {
            const doc = document.getElementById(id)?.contentDocument;
            const toast = doc && doc.getElementById('toast');
            if (toast && doc.getElementById('cardLayer')) return toast;
          }
          return null;
        };
        // 보드 안내는 셸 알림(약 3초)이 사라진 뒤 600ms마다 최대 10번 다시 시도해 뜬다(최대 약 7초).
        // 고정 횟수로 재면 느린 기기에서 안내가 뜨기 전에 검사가 끝나 빈손 실패가 난다 —
        // 두 안내를 모두 '실제로 본' 뒤에 끝내고, 못 보면 마지막 관찰 상태를 메시지에 남긴다.
        const state = () => {
          const shell = document.getElementById('toast');
          const board = boardToast();
          return {
            shellUp: !!shell && !shell.hidden,
            boardUp: !!board && board.classList.contains('show'),
            shellText: shell ? (shell.textContent || '').trim().slice(0, 60) : null,
            boardText: board ? (board.textContent || '').trim().slice(0, 60) : null,
            frames: [...document.querySelectorAll('iframe')].map((f) => { try { return f.contentWindow?.location?.href || ''; } catch { return ''; } }).filter((url) => /track58/.test(url))
          };
        };
        let sawShell = false, sawBoard = false, maxArea = 0, bothAt = -1, last = null, samples = 0;
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline && !(sawShell && sawBoard)) {
          last = state();
          if (last.shellUp) sawShell = true;
          if (last.boardUp) sawBoard = true;
          if (last.shellUp && last.boardUp) {
            bothAt = samples;
            maxArea = Math.max(maxArea, overlapArea(boxOf(document.getElementById('toast')), boxOf(boardToast())));
          }
          samples += 1;
          await new Promise((r) => setTimeout(r, 200));
        }
        const detail = `${samples}회 관찰, 마지막 상태: 셸 알림=${last?.shellUp ? '보임' : '없음'}(${last?.shellText ?? '요소 없음'}), 보드 말풍선=${last?.boardUp ? '보임' : '없음'}(${last?.boardText ?? '요소 없음'}), 보드 프레임=[${(last?.frames || []).join(' | ')}]`;
        return { sawShell, sawBoard, maxArea: Math.round(maxArea), bothAt, detail };
      });
      assert.ok(twoNotices.sawShell, `390 셸 알림(기록 불러오기 안내)이 떠 있는 자리를 본다(빈손 통과 금지) — ${twoNotices.detail}`);
      assert.ok(twoNotices.sawBoard, `390 보드 안내 말풍선이 뜨는 자리를 본다(빈손 통과 금지) — ${twoNotices.detail}`);
      assert.equal(twoNotices.maxArea, 0, `390 셸 알림과 보드 안내 말풍선이 같은 자리에 포개지지 않는다(겹침 ${twoNotices.maxArea}px², 동시 노출: ${twoNotices.bothAt < 0 ? '없음' : twoNotices.bothAt + '번째 관찰'})`);
      await pageNotice.close();
      await ctxNotice.close();
    }
    // 2026-11-16 대표 결정: 지도→그래프→동심원형→그물형 왕복 — 기존 화면 전환 메시지(lt41-navigate) 한 길로
    // 오가고, 지금 트리·순간이 유지되는지(같은 트리·같은 순간·그래프 표시의 순간 수)까지 잰다.
    // 쓰기 가능 문맥(ctx5 — 예시가 아니라 지금 트리를 부른 자리)에서만 의미가 있어 여기서 한다.
    const pageMap = await ctx5.newPage();
    await pageMap.goto(`${base}/v41/?account=1#network`, { waitUntil: 'load' });
    await readyFrame(pageMap, /track56-network/, { root: '#mapMain', why: '지도 첫 열기' });
    await pageMap.waitForTimeout(1500);
    const treeBeforeTrip = await pageMap.evaluate(() => ({ id: window.LT41?.tree?.id || '', moments: (window.LT41?.tree?.moments || []).length, momentId: window.LT41?.momentId || '' }));
    assert.ok(treeBeforeTrip.id, '지금 트리가 부른 상태에서 왕복을 본다');
    // 프레임 교체·재적재 창(보기 단추를 누른 직후 주소가 잠깐 다른 문서로 보이는 때)에 find()가 undefined를
    // 돌려 undefined.evaluate로 죽던 자리(#657 CI 2차 실측) — 준비된 frame을 기다리고, 없으면 URL 목록을
    // 담은 메시지로 실패한다(null.evaluate TypeError가 나지 않게).
    const tripMapFrame = (why) => readyFrame(pageMap, /track56-network/, { root: '#mapMain', why });
    await (await tripMapFrame('지도→그래프: 지도 프레임')).evaluate(() => document.getElementById('viewGraph').click());
    await pageMap.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /track60-graph/.test(f.contentWindow.location.href); } catch { return false; } }), null, { timeout: 10000 });
    // 그래프 모듈이 그려질 때까지(배지가 채워질 때까지) 기다린다 — 프레임 주소만으로는 그리기 전이다.
    await pageMap.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => { try { return /track60-graph/.test(x.contentWindow.location.href); } catch { return false; } });
      return Boolean(f && (f.contentDocument.getElementById('gBadge')?.textContent || '').length > 0);
    }, null, { timeout: 10000 });
    const gFrameTrip = await readyFrame(pageMap, /track60-graph/, { root: '#gBadge', why: '지도의 [그래프] 단추로 그래프 보기가 열린다(기존 lt41-navigate 한 길)' });
    const tripGraph = await gFrameTrip.evaluate(() => {
      const b = [...document.querySelectorAll('.g-view-switch .pill')];
      return { n: b.length, pressed: b.map((x) => x.getAttribute('aria-pressed')), badge: document.getElementById('gBadge')?.textContent || '' };
    });
    assert.equal(tripGraph.n, 3, '그래프 머리줄 보기 고르기 세 단추');
    assert.deepEqual(tripGraph.pressed, ['false', 'false', 'true'], '현재 보기(그래프)만 aria-pressed=true');
    assert.ok(tripGraph.badge.startsWith(`순간 ${treeBeforeTrip.moments}`), `그래프 표시의 순간 수가 지금 트리와 같다(실제 ${tripGraph.badge})`);
    const navCurrent = await pageMap.evaluate(() => document.querySelector('.tree-views [data-view="track56-network.html"]')?.getAttribute('aria-current'));
    assert.equal(navCurrent, 'true', '그래프 보기에서 위쪽 메뉴(책·보드·지도)의 지도가 켜진 상태다');
    await gFrameTrip.evaluate(() => document.getElementById('gViewConc').click());
    await pageMap.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => { try { return /track56-network/.test(x.contentWindow.location.href); } catch { return false; } });
      return Boolean(f && f.contentDocument?.body && f.contentDocument.body.dataset.ltView === 'concentric');
    }, null, { timeout: 10000 });
    const mapAfterConc = await (await tripMapFrame('동심원 복귀: 지도 프레임')).evaluate(() => ({ view: document.body.dataset.ltView, concPressed: document.getElementById('viewConc')?.getAttribute('aria-pressed'), stored: localStorage.getItem('lt41.network.view') }));
    assert.equal(mapAfterConc.view, 'concentric', '그래프의 [동심원형]으로 지도가 동심원형 보기로 열린다');
    assert.equal(mapAfterConc.concPressed, 'true', '동심원형이 눌린 상태(aria-pressed=true)');
    assert.equal(mapAfterConc.stored, 'concentric', '지도 보기 저장 키(lt41.network.view)가 바뀐다');
    await (await tripMapFrame('그물 복귀 누르기: 지도 프레임')).evaluate(() => document.getElementById('viewNet').click());
    const treeAfterTrip = await pageMap.evaluate(() => ({ id: window.LT41?.tree?.id || '', moments: (window.LT41?.tree?.moments || []).length, momentId: window.LT41?.momentId || '' }));
    const mapAfterNet = await (await readyFrame(pageMap, /track56-network/, { root: '#mapMain', view: 'network', timeout: 45000, why: '그물 복귀 확인: 지도 프레임이 다시 붙고 준비될 때까지' })).evaluate(() => ({ view: document.body.dataset.ltView, netPressed: document.getElementById('viewNet')?.getAttribute('aria-pressed') }));
    assert.equal(mapAfterNet.view, 'network', '지도의 [그물형]으로 그물 보기로 돌아온다');
    assert.equal(mapAfterNet.netPressed, 'true', '그물형이 눌린 상태(aria-pressed=true)');
    assert.deepEqual(treeAfterTrip, treeBeforeTrip, '왕복 뒤에도 지금 트리·순간이 유지된다');
    await pageMap.close();
    await ctx5.close();

    // #627 PR3: 그래프 보기 — 지금은 주소(#my/graph)로만 열리는 화면이라 호스트가 LT41을 직접 넘긴다
    // (share-host와 같은 틀, 실제 트리 = 셸이 넘기는 순간들과 같은 모양). 허브 이름 상자 겹침 0·
    // 가로 넘침 0·고리 썸네일 동그라미 보임을 수치로 단정한다.
    const ctx7 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx7.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx7.route('**://i.ytimg.com/**', THUMB);
    await ctx7.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    // #627 3단계 '다른 팬 보기' 가짜 응답: 무대 허브 꼬리표는 5건(AI 명예회원 1건), 그 외 꼬리표는 빈 응답 —
    // 3개 미리보기·'더 보기'·빈 상태 문구를 한 상태에서 단정한다. (playwright는 나중에 등장한 경로가 먼저 맞는다.)
    const fansFixture = [
      { shareId: 'fan1', link: '/t/fan1', treeTitle: '시험 사용자의 기억 나무', title: '데뷔쇼 직관 기록', url: 'https://www.youtube.com/watch?v=aaa11111111', thumbnail: 'https://i.ytimg.com/vi/aaa11111111/hqdefault.jpg', date: '2026-01-10', aiTester: false },
      { shareId: 'fan2', link: '/t/fan2', treeTitle: 'AI 명예회원 나무', title: '데뷔쇼 다시 보기', url: '', thumbnail: '', date: '2026-01-20', aiTester: true },
      { shareId: 'fan3', link: '/t/fan3', treeTitle: '은지의 앨범', title: '데뷔쇼 엔딩 멘트', url: 'https://www.youtube.com/watch?v=bbb22222222', thumbnail: 'https://i.ytimg.com/vi/bbb22222222/hqdefault.jpg', date: '2026-01-12', aiTester: false },
      { shareId: 'fan4', link: '/t/fan4', treeTitle: '민의 사담', title: '데뷔쇼 리허설 후기', url: '', thumbnail: '', date: '2026-01-11', aiTester: false },
      { shareId: 'fan5', link: '/t/fan5', treeTitle: '서현의 순간', title: '데뷔쇼 첫 소환', url: '', thumbnail: '', date: '2026-01-09', aiTester: false }
    ];
    await ctx7.route('**/api/public/tag-moments**', (r) => {
      const tag = new URL(r.request().url()).searchParams.get('tag') || '';
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag, items: tag.startsWith('무대:') ? fansFixture : [] }) });
    });
    const page7 = await ctx7.newPage();
    await page7.goto(`${base}/graph-host.html`, { waitUntil: 'domcontentloaded' });
    const graphFrame = await frameOf(page7, /track60-graph/);
    assert.ok(graphFrame, '그래프 프레임이 열린다');
    await page7.waitForTimeout(700);
    // 2026-11-16 대표 결정: 그래프 머리줄에도 지도와 같은 모양의 보기 고르기가 있고 그래프가 눌린 상태다.
    const graphSwitch = await graphFrame.evaluate(() => {
      const b = [...document.querySelectorAll('.g-view-switch .pill')];
      return {
        n: b.length,
        labels: b.map((x) => x.textContent.trim()),
        pressed: b.map((x) => x.getAttribute('aria-pressed')),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      };
    }).catch(() => null);
    assert.ok(graphSwitch, '그래프 머리줄 보기 고르기를 잰다');
    assert.deepEqual(graphSwitch.labels, ['이어진 길', '묶음', '시간 순'], `보기 고르기 세 단추(실제 ${JSON.stringify(graphSwitch.labels)})`);
    assert.deepEqual(graphSwitch.pressed, ['false', 'false', 'true'], '현재 보기(그래프)만 aria-pressed=true');
    assert.equal(graphSwitch.overflow, 0, `그래프 머리줄에서 가로 넘침 0(실제 ${graphSwitch.overflow})`);
    await take(page7, '그래프 보기');
    const graphCheck = await page7.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const names = [...doc.querySelectorAll('.g-hubname')];
      const boxes = names.map((x) => x.getBoundingClientRect());
      let hubPairs = 0;
      const pairTexts = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          hubPairs++;
          pairTexts.push(names[i].textContent + '×' + names[j].textContent + ' @' + Math.round(a.left) + ',' + Math.round(a.top));
        }
      }
      return {
        hubPairs,
        pairTexts,
        hubs: names.length,
        thumbs: doc.querySelectorAll('#gsvg image').length,
        stacks: [...doc.querySelectorAll('.g-stackcount')].map((x) => x.textContent),
        overflow: Math.max(0, doc.documentElement.scrollWidth - doc.documentElement.clientWidth),
        badge: doc.getElementById('gBadge')?.textContent || '',
        // CTO 지적(#714 후속): 이름 상자가 빈 곳만 피하는지로는 부족하다 — 아래 세 가지를 잰다.
        narrow: doc.documentElement.clientWidth < 700,
        hubDots: [...doc.querySelectorAll('.g-hubdot')].map((c) => {
          const r = c.getBoundingClientRect();
          return { key: c.parentElement?.getAttribute('data-hub-key'), cr: Number(c.parentElement?.getAttribute('data-cr') || 0), x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }),
        nameBoxes: [...doc.querySelectorAll('.g-hubname')].filter((x) => !x.classList.contains('g-hubsub') && x.getBoundingClientRect().width > 0).map((x) => {
          const r = x.getBoundingClientRect();
          return { key: x.parentElement?.getAttribute('data-hub-key'), cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height, t: x.textContent };
        }),
        rings: [...doc.querySelectorAll('.g-ring')].map((c) => { const r = c.getBoundingClientRect(); return { key: c.getAttribute('data-key'), x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }),
        counts: [...doc.querySelectorAll('.g-stackcount')].map((x) => {
          const box = x.getBoundingClientRect();
          const dot = x.parentElement?.querySelector('circle');
          const dr = dot ? dot.getBoundingClientRect() : null;
          return { t: x.textContent, x: box.left + box.width / 2, y: box.top + box.height / 2, h: box.height, dotX: dr ? dr.left + dr.width / 2 : null, dotY: dr ? dr.top + dr.height / 2 : null, dotR: dr ? dr.width / 2 : null };
        })
      };
    });
    // ① 각 허브 이름의 중심은 자기 고리 중심에서 (고리 반지름 + 이름 높이 + 여유) 안에 있다(좁은 화면).
    if (graphCheck.narrow) {
      const tooFar = graphCheck.nameBoxes.map((n) => {
        const dot = graphCheck.hubDots.find((d) => d.key === n.key);
        if (!dot) return n.t + ' ← 자기 고리를 못 찾음';
        const dist = Math.hypot(n.cx - dot.x, n.cy - dot.y);
        const limit = dot.cr + n.h + 12;
        return dist <= limit ? null : `${n.t} 거리 ${Math.round(dist)} > ${Math.round(limit)}`;
      }).filter(Boolean);
      assert.deepEqual(tooFar, [], `390 허브 이름은 자기 고리 바로 아래에 있어야 한다: ${JSON.stringify(tooFar)}`);
      // ③ 좁은 화면에서는 허브 이름을 숨기지 않는다.
      const hidden = graphCheck.hubDots.length - graphCheck.nameBoxes.length;
      assert.equal(hidden, 0, `390에서 숨겨진 허브 이름 0(실제 ${hidden}개 숨김)`);
    }
    // ② 고리끼리 겹침 0(원-원 거리, 2px 여유).
    const ringPairs = [];
    for (let i = 0; i < graphCheck.rings.length; i++) for (let j = i + 1; j < graphCheck.rings.length; j++) {
      const a = graphCheck.rings[i], b = graphCheck.rings[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < a.r + b.r - 2) ringPairs.push(`${a.key}×${b.key} @거리${Math.round(dist)} < r${Math.round(a.r)}+${Math.round(b.r)}`);
    }
    assert.deepEqual(ringPairs, [], `고리끼리 겹침 0: ${JSON.stringify(ringPairs)}`);
    // '×N' 개수 표시는 점과 원 거리로 판정한다(상자 겹침이 아니라) — 점 표면에서 떨어져 있어야 한다.
    const countTouch = graphCheck.counts.map((c) => {
      if (c.dotX == null) return null;
      const dist = Math.hypot(c.x - c.dotX, c.y - c.dotY);
      return dist >= c.dotR + c.h / 2 + 1 ? null : `${c.t} 점 표면에서 ${Math.round(dist - c.dotR)}px`;
    }).filter(Boolean);
    assert.deepEqual(countTouch, [], `무더기 개수(×N)가 점에 닿지 않게 떨어져 있다: ${JSON.stringify(countTouch)}`);
    assert.equal(graphCheck.hubPairs, 0, `허브 이름 상자 겹침 0(실제 ${graphCheck.hubPairs}: ${JSON.stringify(graphCheck.pairTexts)})`);
    assert.equal(graphCheck.overflow, 0, `그래프 보기 가로 넘침 0(실제 ${graphCheck.overflow})`);
    assert.ok(graphCheck.hubs >= 4, `허브가 그려진다(실제 ${graphCheck.hubs})`);
    assert.ok(graphCheck.thumbs >= 3, `고리 썸네일 동그라미가 보인다(실제 ${graphCheck.thumbs})`);
    assert.ok(graphCheck.stacks.length >= 1, `같은 영상·같은 무대 무더기 개수가 표시된다(실제 ${JSON.stringify(graphCheck.stacks)})`);
    assert.match(graphCheck.badge, /순간 17/, '표시에 순간 수가 있다');
    // CTO 지적(#713 후속): 검사기가 이름 상자끼리만 재었다 — 이름↔허브 점·이름↔'처음/지금'·'×N'↔점도 0이어야 한다.
    const graphTouch = await page7.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const rect = (x) => x.getBoundingClientRect().toJSON();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const out = { nameOnDot: [], nameOnMark: [], countOnDot: [] };
      const dots = [...doc.querySelectorAll('.g-hubdot')].map((c) => ({ key: c.parentElement.getAttribute('data-hub-key'), r: rect(c) }));
      const marks = [...doc.querySelectorAll('.g-mark')].map((x) => ({ r: rect(x) }));
      for (const name of [...doc.querySelectorAll('.g-hubname')]) {
        const nr = rect(name);
        const key = name.parentElement?.getAttribute('data-hub-key');
        const own = dots.find((d) => d.key === key);
        if (own && hit(nr, own.r)) out.nameOnDot.push(name.textContent + ' ← 자기 점 @' + Math.round(nr.left) + ',' + Math.round(nr.top) + ' w' + Math.round(nr.width) + ' | dot @' + Math.round(own.r.left) + ',' + Math.round(own.r.top) + ' w' + Math.round(own.r.width) + ' h' + Math.round(own.r.height));
        for (const mk of marks) if (hit(nr, mk.r)) out.nameOnMark.push(name.textContent + ' ← 처음/지금');
      }
      for (const count of [...doc.querySelectorAll('.g-stackcount')]) {
        const cr = rect(count);
        const dot = count.parentElement?.querySelector('circle');
        if (dot && hit(cr, rect(dot))) out.countOnDot.push(count.textContent + ' ← 점');
      }
      return out;
    });
    assert.deepEqual(graphTouch.nameOnDot, [], `허브 이름이 자기 점 위에 겹친다: ${JSON.stringify(graphTouch.nameOnDot)}`);
    assert.deepEqual(graphTouch.nameOnMark, [], `허브 이름이 '처음/지금' 표시와 겹친다: ${JSON.stringify(graphTouch.nameOnMark)}`);
    assert.deepEqual(graphTouch.countOnDot, [], `무더기 개수(×N)가 점 위에 겹친다: ${JSON.stringify(graphTouch.countOnDot)}`);
    assert.match(graphCheck.badge, /순간 17/, '표시에 순간 수가 있다');
    // #627 3단계: 허브 상세의 '같은 노래를 담은 다른 팬' 칸 — 가짜 응답(무대=5건·AI 1건, 그 외=빈 응답)으로
    // 3개 미리보기·AI 명예회원 표시·'더 보기'·빈 상태 문구·판 안 배치(겹침·넘침 0)를 단정한다.
    const fansCheck = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const hub = [...doc.querySelectorAll('#gsvg g[role="button"]')].find((g) => (g.getAttribute('aria-label') || '').startsWith('무대'));
      hub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 700));
      const box = doc.querySelector('.d-fans');
      const cardR = doc.getElementById('detailCard').getBoundingClientRect();
      const rows = box ? [...box.children].filter((x) => x.querySelector?.('.d-fans-row')) : [];
      const rowRects = rows.map((x) => x.getBoundingClientRect());
      let rowPairs = 0;
      for (let i = 0; i < rowRects.length; i++) for (let j = i + 1; j < rowRects.length; j++) {
        const a = rowRects[i], b = rowRects[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) rowPairs++;
      }
      const outside = rows.filter((x) => { const r = x.getBoundingClientRect(); return r.width === 0 || r.left < cardR.left - 1 || r.right > cardR.right + 1; }).length;
      return {
        head: doc.querySelector('.d-fanshead')?.textContent || '',
        rows: rows.length,
        rowPairs,
        outside,
        aiBadge: doc.querySelector('.d-fans-ai')?.textContent || '',
        aiOnRow: rows[1]?.querySelector('.d-fans-ai')?.textContent || '',
        links: rows.map((x) => x.querySelector('a')?.getAttribute('href') || ''),
        more: doc.querySelector('.d-fans-more')?.textContent || '',
        thumbs: rows.filter((x) => x.querySelector('.d-fans-thumb')).length
      };
    });
    assert.match(fansCheck.head, /같은 무대를 본 다른 팬/, `칸 제목은 소스 상수(실제 "${fansCheck.head}")`);
    assert.equal(fansCheck.rows, 3, `처음엔 3개만 보인다(실제 ${fansCheck.rows})`);
    assert.equal(fansCheck.rowPairs, 0, `다른 팬 줄끼리 겹침 0(실제 ${fansCheck.rowPairs})`);
    assert.equal(fansCheck.outside, 0, `다른 팬 줄이 상세 판 안에 있다(벗어난 줄 ${fansCheck.outside})`);
    assert.equal(fansCheck.aiBadge, 'AI 명예회원', 'AI 명예회원 표시가 있다');
    assert.equal(fansCheck.aiOnRow, 'AI 명예회원', 'AI 표시는 aiTester 줄(fixture 2번째)에 붙는다');
    assert.ok(fansCheck.links.every((l) => l.startsWith('/t/')), `줄이 공개 트리 링크(/t/…)다: ${JSON.stringify(fansCheck.links)}`);
    assert.ok(fansCheck.thumbs >= 1, '썸네일 줄이 있다(썸네일 없는 줄은 자리를 비우지 않는다)');
    assert.match(fansCheck.more, /더 보기/, "나머지는 '더 보기'로");
    const afterMore = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      doc.querySelector('.d-fans-more')?.click();
      await new Promise((res) => setTimeout(res, 250));
      return [...doc.querySelectorAll('.d-fans > li')].filter((x) => x.querySelector('.d-fans-row')).length;
    });
    assert.equal(afterMore, 5, `'더 보기'로 나머지가 보인다(실제 ${afterMore})`);
    const emptyCheck = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const hub = [...doc.querySelectorAll('#gsvg g[role="button"]')].find((g) => (g.getAttribute('aria-label') || '').startsWith('노래'));
      hub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 700));
      return {
        empty: doc.querySelector('.d-fans-empty')?.textContent || '',
        head: doc.querySelector('.d-fanshead')?.textContent || '',
        overflow: Math.max(0, doc.documentElement.scrollWidth - doc.documentElement.clientWidth)
      };
    });
    assert.equal(emptyCheck.head, '같은 노래를 담은 다른 팬', '노래 허브의 칸 제목(소스 상수)');
    assert.equal(emptyCheck.empty, '아직 같은 노래를 담은 다른 팬이 없어요', `빈 상태 문구(실제 "${emptyCheck.empty}")`);
    assert.equal(emptyCheck.overflow, 0, `다른 팬 칸이 있어도 가로 넘침 0(실제 ${emptyCheck.overflow})`);
    await ctx7.close();

    // 주소로 열리는지(#my/graph) — 셸이 그래프 보기를 화면 파일로 띄우는지 단정한다(메뉴 단추는 없다).
    const ctx8 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx8.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx8.route('**://i.ytimg.com/**', THUMB);
    await ctx8.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx8.route('**/api/workspace**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [graphTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    }));
    const page8 = await ctx8.newPage();
    await page8.goto(`${base}/v41/?account=1#my/graph`, { waitUntil: 'load' });
    const graphByHash = await frameOf(page8, /track60-graph/);
    assert.ok(graphByHash, '#my/graph 주소로 그래프 보기가 열린다(메뉴 연결 없이 주소로만)');
    // 프레임이 열렸어도 주소가 틀리면 배포가 4.0 첫 화면으로 되돌려 준다(2026-11-16 보고) — 문서 표시까지 본다.
    // 의견 #26 수정으로 트리 값이 쿼리에 붙을 수 있다 — 하위 폴더 경로 자체는 그대로다.
    assert.match(graphByHash.url(), /views\/graph\/track60-graph\.html(?:\?|$)/, '#my/graph 프레임 주소에 그래프 하위 폴더가 있다');
    assert.equal(await graphByHash.evaluate(() => document.documentElement.getAttribute('data-v41-screen')), 'graph', '#my/graph 프레임 문서가 그래프 화면이다');
    await ctx8.close();

    // 261117 대표 결정: 글자 카드 세부 검사(존재·줄·말줄임·배치)는 1440에서 한다 — 390은 가운데가 커져
    // 위·아래 띠가 카드를 못 담아 안전망이 궤도 카드를 숨길 수 있다(소수 카드 숨김 계약은
    // '#657 후속 261117' 단언이 본다). 390에서 이 상태의 겹침 검사는 보이는 카드가 없어 자동 만족이다.
    if (width === 1440) {
    // shadowRoot 안에서 줄(감정·날짜·제목·알림)을 지키는지 — 제목이 3줄 높이 안(max-height 절단)·카드 안 배치·
    // '첫 순간' 배지와 감정 칩 겹침 0을 수치로 단정한다. 카드는 그림자 안에 있으므로 shadowRoot로
    // 스코핑한다(#730과 같은 판정). 셸이 lt41-date-style 동기화로 프레임을 다시 띄우므로 매번 전 프레임 검사.
    const ctx9 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx9.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); localStorage.setItem('lt41.homeCards', 'mine'); } catch {} }, theme);
    await ctx9.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#282828"/><text x="60" y="52" font-size="18" fill="#777" text-anchor="middle">...</text></svg>' }));
    await ctx9.route('**/api/**', (r) => {
      if (/api\/workspace/.test(r.request().url())) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [thumbTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    const page9 = await ctx9.newPage();
    await page9.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    let homeFrame = null, cardCheck = null;
    /* 이슈 928: 셸은 부팅 때 첫 화면을 두 번 띄운다(기록 도착 전 예시 트리 → 도착 뒤 실제 트리, 두 장 교대).
       교대 창(reveal 뒤 600ms)에는 숨은 옛 장(#view-next — '다음 화면 준비' 슬롯)에 카드가 온전히 그려져 있고
       page.frames()가 그 숨은 장을 먼저 돌려준다. 내용만 보고 골랐더니 숨은 장의 rect 0(감정 0/날짜 0)을 재어
       가짜 결함을 냈다. 그래서 '지금 보이는 장'(frameElement가 hidden·inert가 아닌 장)만 고르고, 재는 사이에
       장이 바뀌면(hiddenFrame) 다시 고른다 — 단정 기준(3줄·같은 줄·겹침·넘침)은 그대로다. */
    const measureCards = () => {
      const fe = window.frameElement;
      if (!fe || fe.hidden || fe.hasAttribute('inert')) return { hiddenFrame: true, cards: 0, bad: [], overflow: 0 };
      const sh = document.getElementById('orbit').shadowRoot;
      const cards = [...sh.querySelectorAll('.card .lt-fallback-card, .recent-media .lt-fallback-card')];
      const bad = [];
      for (const card of cards) {
        const cr = card.getBoundingClientRect();
        const title = card.querySelector('.lt-fallback-title');
        if (!title) { bad.push('제목 칸이 없다'); continue; }
        const tcs = getComputedStyle(title);
        const limit = parseFloat(tcs.fontSize) * parseFloat(tcs.lineHeight) * 3 + 2;
        if (title.clientHeight > limit) bad.push(`제목이 3줄 높이를 넘는다(${title.clientHeight}px > ${Math.round(limit)}px — max-height 3줄 절단)`);
        const inside = (el) => { const r = el.getBoundingClientRect(); return r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 && r.left >= cr.left - 1 && r.right <= cr.right + 1; };
        for (const sel of ['.lt-fallback-head', '.lt-fallback-title', '.lt-fallback-notice']) {
          const el = card.querySelector(sel);
          if (el && !inside(el)) bad.push(sel + '이(가) 카드 밖으로 나온다');
        }
        const emo = card.querySelector('.lt-fallback-emotion');
        const date = card.querySelector('.lt-fallback-date');
        if (emo && date) {
          const er = emo.getBoundingClientRect(), dr = date.getBoundingClientRect();
          /* 감정 칩 박스는 패딩을 포함해 날짜 칸과 최대 4px 맞닿을 수 있다(글자 충돌 아님 — 2070 줌 실측).
             판정은 '날짜가 감정보다 한 줄 아래에서 시작하는가'(각자 다른 줄)로 한다. */
          if (!(dr.top >= er.top + parseFloat(getComputedStyle(emo).fontSize) - 1)) bad.push('감정과 날짜가 같은 줄에 붙어 있다(감정 ' + Math.round(er.top) + ' / 날짜 ' + Math.round(dr.top) + ')');
        }
        /* 4px 이하는 절대 위치 알림(하단 고정)·반올림 한계 — 시각 결함이 아니다(2070·1440 실측). */
        if (card.scrollHeight > card.clientHeight + 4) bad.push(`카드 내용이 카드 밖으로 넘친다(${card.scrollHeight - card.clientHeight}px)`);
      }
      for (const fm of [...sh.querySelectorAll('.card .firstMark')]) {
        const fb = fm.parentElement?.querySelector('.surface .lt-fallback-card');
        const emo = fb?.querySelector('.lt-fallback-emotion');
        if (!fb || !emo) continue;
        const a = fm.getBoundingClientRect(), b = emo.getBoundingClientRect();
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (ox * oy > 0) bad.push(`'첫 순간' 배지와 감정 칩이 겹친다(${Math.round(ox * oy)}px²)`);
      }
      return { cards: cards.length, bad, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) };
    };
    for (let i = 0; i < 80 && !cardCheck; i++) {
      for (const fr of page9.frames()) {
        if (fr === page9.mainFrame()) continue;
        const shown = await fr.evaluate(() => {
          const fe = window.frameElement;
          if (!fe || fe.hidden || fe.hasAttribute('inert')) return false;
          return !!document.getElementById('orbit')?.shadowRoot?.querySelector('.card .lt-fallback-title');
        }).catch(() => false);
        if (!shown) continue;
        homeFrame = fr;
        cardCheck = await fr.evaluate(measureCards).catch(() => null);
        if (cardCheck && !cardCheck.hiddenFrame) break;
        cardCheck = null; homeFrame = null;
      }
      if (!cardCheck) await page9.waitForTimeout(300);
    }
    assert.ok(homeFrame && cardCheck, '첫 화면 글자 카드가 그려진다(내려간 영상 → 글 카드, 보이는 장)');
    assert.ok(cardCheck.cards >= 1, `첫 화면 글자 카드 수(실제 ${cardCheck.cards})`);
    assert.deepEqual(cardCheck.bad, [], `첫 화면 글자 카드 줄·말줄임·배치: ${JSON.stringify(cardCheck.bad)}`);
    assert.equal(cardCheck.overflow, 0, `첫 화면 가로 넘침 0(실제 ${cardCheck.overflow})`);
    await take(page9, '첫 화면 글자 카드');
    await ctx9.close();
    } // width 1440 — 390은 위 단언(궤도 카드 0장)이 대신한다

    await context.close();
    return rows;
  };

  try {
    // 두 조합씩 나란히(같은 브라우저의 다른 문맥) — 잡 시간을 지키기 위해서다.
    for (let i = 0; i < COMBOS.length; i += 2) {
      const pairs = await Promise.all(COMBOS.slice(i, i + 2).map(([size, theme]) => runCombo(size, theme)));
      for (const rows of pairs) for (const row of rows) (knownHit(row.항목, row.줄) ? known : fresh).push(row);
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (known.length) console.log(`#657 알려진 문제(${known.length}건 — KNOWN 목록에 있다, 기준 그대로):\n` + known.map((r) => '  ' + r.줄).join('\n'));
  assert.deepEqual(fresh, [], `알려진 문제 밖의 새 화면 실패 ${fresh.length}건:\n` + fresh.map((r) => '  ' + r.줄).join('\n'));
});

// #713 후속(2026-11-16 보고): #my/graph가 그래프가 아니라 첫 화면으로 열렸다 — screenUrl이 그래프의
// 하위 폴더(views/graph/)를 빠뜨려 없는 주소를 배포가 4.0 첫 화면(SPA 폴백)으로 되돌려 줬다.
// 세 경우 모두 iframe 파일 이름·프레임 문서 표시(data-v41-screen)·주소를 문자로 기록해 단정한다(눈 판단 없음).
test('#my/graph는 로그인 진입·로그인 왕복·hash 이동 세 경우 모두 그래프 화면을 연다', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const GRAPH_FRAME = /views\/graph\/track60-graph\.html/;
  const workspace = (r, owned) => r.fulfill({
    status: owned ? 200 : 401, contentType: 'application/json',
    body: owned
      ? JSON.stringify({ revision: 1, state: { version: 1, trees: [graphTree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' })
      : '{"error":"auth"}'
  });
  const frameShown = (file) => () => {
    const f = document.getElementById('view');
    return !!f && !f.hidden && new RegExp(file).test(f.contentWindow?.location?.href || '');
  };
  const graphState = async (page) => {
    const f = await frameOf(page, GRAPH_FRAME);
    const screen = f ? await f.evaluate(() => document.documentElement.getAttribute('data-v41-screen') || '') : '';
    return { frame: f ? f.url() : '(프레임 없음)', screen, hash: await page.evaluate(() => location.hash) };
  };
  try {
    // ① 로그인된 상태에서 주소창에 #my/graph 입력(새 페이지 로드).
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx1.route('**://i.ytimg.com/**', THUMB);
    await ctx1.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx1.route('**/api/workspace**', (r) => workspace(r, true));
    const page1 = await ctx1.newPage();
    await page1.goto(`${base}/v41/#my/graph`, { waitUntil: 'load' });
    await page1.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got1 = await graphState(page1);
    assert.match(got1.frame, GRAPH_FRAME, '① 로그인 상태 #my/graph: iframe 파일이 views/graph/track60-graph.html이다');
    assert.equal(got1.screen, 'graph', '① 프레임 문서가 그래프 화면이다(data-v41-screen)');
    assert.match(got1.hash, /^#my\/graph/, '① 주소가 #my/graph로 남는다');
    await ctx1.close();

    // ② 로그아웃 상태에서 #my/graph로 들어와 로그인을 거쳐 돌아온 경우 — 같은 탭이 hash 없이 돌아오고
    // 보관 경로(pending-owner-route)로 그래프를 되살린다. 로그인 왕복은 ?account=1 돌아옴 + 회원 응답으로 흉내 낸다.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    let owned = false;
    await ctx2.route('**://i.ytimg.com/**', THUMB);
    await ctx2.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx2.route('**/api/workspace**', (r) => workspace(r, owned));
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/v41/#my/graph`, { waitUntil: 'load' });
    await page2.waitForTimeout(1200);
    const stash = await page2.evaluate(() => sessionStorage.getItem('lovetree.v41.pending-owner-route.v1') || '');
    assert.equal(stash, '#my/graph', '② 로그인 전 보관 경로가 남는다');
    owned = true;
    await page2.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page2.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got2 = await graphState(page2);
    assert.match(got2.frame, GRAPH_FRAME, '② 로그인 왕복 뒤에도 그래프 화면을 연다');
    assert.equal(got2.screen, 'graph', '② 프레임 문서가 그래프 화면이다');
    assert.match(got2.hash, /^#my\/graph/, '② 돌아온 뒤 주소가 #my/graph로 쓰인다');
    await ctx2.close();

    // ③ 다른 화면(책)에 있다가 hash만 #my/graph로 바꾼 경우.
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx3.route('**://i.ytimg.com/**', THUMB);
    await ctx3.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx3.route('**/api/workspace**', (r) => workspace(r, true));
    const page3 = await ctx3.newPage();
    await page3.goto(`${base}/v41/#my/book`, { waitUntil: 'load' });
    await page3.waitForFunction(frameShown('track59-sketchbook'), null, { timeout: 20000 });
    await page3.evaluate(() => { location.hash = '#my/graph'; });
    await page3.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got3 = await graphState(page3);
    assert.match(got3.frame, GRAPH_FRAME, '③ hash만 바꿔도 그래프 화면을 연다');
    assert.equal(got3.screen, 'graph', '③ 프레임 문서가 그래프 화면이다');
    assert.match(got3.hash, /^#my\/graph/, '③ 주소가 #my/graph다');
    await ctx3.close();
  } finally {
    await browser.close();
    server.close();
  }
});

// 261116 대표 지적 — 운영센터 머리줄이 본 화면 셸 머리줄과 같은 규칙인지 숫자로 판정한다.
// 390·1440·2560에서 셸(/v41/)과 운영센터(admin.html)의 로고 left·오른쪽 끝 단추 right·머리줄 높이가
// 오차 2px 안에서 같아야 한다. 관리자 세션은 가짜 API(세션 관리자·빈 목록)로 만들고, 새 시험 파일 없이
// 이 검사기 파일에 둔다. 셸과 운영센터는 같은 문맥의 다른 탭으로 열어 같은 뷰포트에서 잰다.
const headerEdges = () => {
  const header = document.querySelector('.app-header');
  const brand = header.querySelector('.brand');
  const rightBtn = [...header.querySelectorAll('button, a')]
    .filter((el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0; })
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  const box = header.getBoundingClientRect();
  return {
    logoLeft: Math.round(brand.getBoundingClientRect().left),
    rightBtnRight: rightBtn ? Math.round(rightBtn.getBoundingClientRect().right) : 0,
    rightBtnName: rightBtn ? `${rightBtn.tagName.toLowerCase()}.${[...rightBtn.classList].join('.')}` : '(없음)',
    height: Math.round(box.height)
  };
};
test('운영센터 머리줄이 본 화면 셸 머리줄과 같은 폭·위치다(390·1440·2560 — 로고 left·오른쪽 끝 단추 right·높이, 오차 2px)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`미리보기 검사에서는 건너뜀이 실패다 — ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440, 2560]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await context.route('**://i.ytimg.com/**', THUMB);
      // 뒤에 등록한 것이 이긴다 — 공통 응답을 먼저, 관리자 응답을 나중에.
      await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await context.route('**/api/admin/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true, admin: true }) }));
      await context.route('**/api/admin/feedback', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"feedback":[]}' }));
      await context.route('**/api/admin/journals', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"journals":[]}' }));
      await context.route('**/api/community/admin/reports', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"reports":[]}' }));
      const shell = await context.newPage();
      await shell.goto(`${base}/v41/`, { waitUntil: 'load' });
      await shell.waitForSelector('.app-header', { timeout: 10000 });
      await shell.waitForTimeout(400);
      const admin = await context.newPage();
      await admin.goto(`${base}/admin.html`, { waitUntil: 'load' });
      await admin.waitForSelector('.app-header .brand', { timeout: 10000 });
      await admin.waitForTimeout(400);
      const s = await shell.evaluate(headerEdges);
      const a = await admin.evaluate(headerEdges);
      assert.ok(Math.abs(a.logoLeft - s.logoLeft) <= 2, `${width}: 로고 left가 셸과 같다(셸 ${s.logoLeft} / 운영센터 ${a.logoLeft})`);
      assert.ok(Math.abs(a.rightBtnRight - s.rightBtnRight) <= 2, `${width}: 오른쪽 끝 단추 right가 셸과 같다(셸 ${s.rightBtn}=${s.rightBtnRight} / 운영센터 ${a.rightBtn}=${a.rightBtnRight})`);
      assert.ok(Math.abs(a.height - s.height) <= 2, `${width}: 머리줄 높이가 셸과 같다(셸 ${s.height} / 운영센터 ${a.height})`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

// 261117 대표 결정: 좁은 화면(390)에서 궤도 카드가 8장 이하인 계정은 궤도 카드를 숨긴다 —
// 커진 가운데(위쪽 '+ 순간 추가'·정보 줄)가 소수 카드의 원을 덮어 밀어낸 카드가 한자리에 쌓였다
// (실측 3장 동일 좌표). 9장 이상은 기존 좁은 화면 궤도를 그대로 쓴다(글자 카드 상태가 390 겹침을 잰다).
test('#657 후속 261117: 좁은 화면 소수 카드(≤8) 계정은 궤도 카드 0장 — 가운데에 집중한다', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  const { createTree, addMoment } = await import('../public/v41/domain.mjs');
  let t = createTree({ subject: '시험', title: '카드 적은 트리', note: '기록', emotion: '설렘', date: '2026-11-11', url: '' }, '2026-11-16T00:00:00.000Z');
  t = addMoment(t, { subject: '시험', title: '사진 순간', note: '기록', emotion: '즐거움', date: '2026-11-11', url: '' }, t.moments[0].id, '2026-11-16T00:01:00.000Z');
  t.moments[1].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
  t = addMoment(t, { subject: '시험', title: '메모 순간', note: '기록', emotion: '그리움', date: '2026-11-12', url: '' }, t.moments[1].id, '2026-11-16T00:02:00.000Z');
  const fewTrees = [t];
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript((theme) => {
      try {
        localStorage.setItem('lt41.theme', theme);
        localStorage.setItem('lt41.dateStyle', 'dot');
        localStorage.setItem('lt41.titleDisplay', 'both');
        localStorage.setItem('lt41.homeCards', 'mine');
      } catch {}
    }, 'night');
    await context.route('**://i.ytimg.com/**', THUMB);
    await context.route('**/api/**', (r) => {
      if (/api\/workspace/.test(r.request().url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: fewTrees, prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    const page = await context.newPage();
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(6000);
    const visible = await page.evaluate(() => {
      // 셸이 프레임을 갈아끼운다(#view·#view-next) — 지금 보이는 쪽의 궤도를 본다(예전 프레임의 예시 궤도와 섞이지 않게).
      const els = [...document.querySelectorAll('#view,#view-next')].filter((e) => e.getClientRects().length > 0 && !e.hidden);
      const sh = (els[0] || document.getElementById('view'))?.contentDocument?.getElementById('orbit')?.shadowRoot;
      if (!sh) return null;
      return [...sh.querySelectorAll('button.card')].filter((c) => getComputedStyle(c).display !== 'none').length;
    });
    assert.equal(visible, 0, `390 소수 카드 계정: 궤도 카드 0장(실제 ${visible}장)`);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 2026-11-17 CTO 캡처 후속: 390에서 궤도 카드가 0장이어도 다른 층 카드가 바닥 링크 줄에 겹치지 않는다.
// 눈이 아니라 수치로 판정한다 — 보이는 카드 수, 카드↔링크 겹침 쌍 0, 카드 아래끝 ≤ 링크 줄 top−8(1440도 겹침 0).
test('#657 후속 261117: 카드 층은 바닥 링크 줄 위에서 자른다(390 few·many, 1440)', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  const { createTree, addMoment } = await import('../public/v41/domain.mjs');
  const treeWith = (n) => {
    let t = createTree({ subject: '시험', title: '카드 계정', note: '기록', emotion: '설렘', date: '2026-11-11', url: '' }, '2026-11-16T00:00:00.000Z');
    for (let i = 1; i < n; i++) {
      t = addMoment(t, { subject: '시험', title: `순간 ${i}`, note: '기록', emotion: '설렘', date: '2026-11-11', url: '' }, t.moments[i - 1].id, `2026-11-16T00:0${i % 10}:00.000Z`);
      t.moments[i].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
    }
    return t;
  };
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [label, width, count] of [['few-390', 390, 3], ['many-390', 390, 12], ['many-1440', 1440, 12]]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.homeCards', 'mine'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', THUMB);
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [treeWith(count)], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(6000);
      const measured = await page.evaluate(() => {
        const frames = [...document.querySelectorAll('#view,#view-next')].filter((f) => f.getClientRects().length > 0 && !f.hidden);
        const sh = (frames[0] || document.getElementById('view'))?.contentDocument?.getElementById('orbit')?.shadowRoot;
        const cards = sh ? [...sh.querySelectorAll('button.card')].filter((c) => getComputedStyle(c).display !== 'none') : [];
        const rects = cards.map((c) => {
          const a = c.getBoundingClientRect(), s = c.querySelector('.surface')?.getBoundingClientRect() || a;
          return { l: Math.min(a.left, s.left), r: Math.max(a.right, s.right), t: Math.min(a.top, s.top), b: Math.max(a.bottom, s.bottom) };
        });
        const allLinks = [...document.querySelectorAll('.home-links a,.home-links button')].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 8), l: r.left, r: r.right, t: r.top, b: r.bottom, shown: r.r > r.l && r.b > r.t }; });
        const links = allLinks.filter((l) => l.shown);
        const overlaps = rects.reduce((n, c) => n + links.filter((l) => Math.min(c.r, l.r) - Math.max(c.l, l.l) > 0 && Math.min(c.b, l.b) - Math.max(c.t, l.t) > 0).length, 0);
        const lr = document.querySelector('.home-links')?.getBoundingClientRect();
        window.scrollTo(0, document.documentElement.scrollHeight);
        const scroll = { scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, links: allLinks.map((l) => ({ text: l.text, shown: l.shown, top: Math.round(l.t), bottom: Math.round(l.b), inView: !l.shown || (l.t >= -1 && l.b <= globalThis.innerHeight + 1) })) };
        return { count: cards.length, overlaps, ceiling: lr ? Math.round(lr.top) - 8 : null, lowest: rects.length ? Math.round(Math.max(...rects.map((c) => c.b))) : null, scroll };
      });
      assert.equal(measured.overlaps, 0, `${label}: 카드↔바닥 링크 겹침 ${measured.overlaps}쌍`);
      if (label === 'few-390') assert.equal(measured.count, 0, `390 소수 카드 계정: 보이는 카드 ${measured.count}장(기존 궤도 숨김 유지)`);
      if (measured.ceiling > 0 && measured.lowest !== null) assert.ok(measured.lowest <= measured.ceiling, `${label}: 카드 아래끝 ${measured.lowest} > 링크 줄 위 ${measured.ceiling}`);
      assert.equal(measured.scroll.links.length, 4, `${label}: 바닥 링크 4개를 잰다`);
      assert.ok(measured.scroll.links.every((l) => l.inView), `${label}: 맨 아래 스크롤 뒤 링크가 화면 밖 — ${JSON.stringify(measured.scroll.links)}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 2026-11-17 11:28 대표 지적: 같은 탭 줄이니 글자 크기·굵기를 맞추고, 고른 칸은 묶음 안쪽을 꽉 채운다.
test('#657 후속 261117: 상단 탭 글자 통일과 고른 탭 칸 높이(390·1440 × 정원·밤)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  const { createTree } = await import('../public/v41/domain.mjs');
  const oneTree = [createTree({ subject: '시험', title: '모아둔 순간', note: '기억', emotion: '설렘', date: '2026-11-17', url: '' }, '2026-11-17T00:00:00.000Z')];
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['night', 'garden']) {
      for (const width of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: oneTree, prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-17T00:00:00.000Z' }) }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => !document.getElementById('tree-views')?.hidden, null, { timeout: 10000 });
        const fonts = await page.evaluate(() => {
          const style = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return { size: s.fontSize, weight: s.fontWeight, color: s.color }; };
          const topViews = ['track32-bookshelf.html', 'track59-sketchbook.html', 'track58-pinboard.html', 'track56-network.html'];
          return { browse: style('#community-menu'), picker: style('#record-menu'), tabs: [...document.querySelectorAll('#tree-views button[data-view]')].filter((b) => topViews.includes(b.dataset.view)).map((b) => ({ view: b.dataset.view, size: getComputedStyle(b).fontSize, weight: getComputedStyle(b).fontWeight, color: getComputedStyle(b).color, current: b.getAttribute('aria-current') === 'true' })) };
        });
        assert.equal(fonts.tabs.length, 4, `${width}/${theme}: 탭 4개`);
        // 261118 대표 결정 2차 5: 묶음(서재·책·보드·지도)은 글자 14px·같은 굵기로 통일한다 — 둘러보기·트리 고르기는 묶음 밖 13px다.
        // 390에서는 묶음이 접혀 보이지 않으므로(접기 메뉴가 대신 열린다) 글자 크기는 펼친 폭에서만 잰다.
        if (width !== 390) {
          for (const tab of fonts.tabs) {
            assert.equal(tab.size, '14px', `${width}/${theme}/${tab.view}: 묶음 탭 글자 14px`);
            assert.equal(tab.weight, '400', `${width}/${theme}/${tab.view}: 묶음 탭 굵기 같음`);
          }
        }
        const unselected = fonts.tabs.filter((t) => !t.current);
        assert.ok(unselected.length >= 3, `${width}/${theme}: 고르지 않은 탭 3개 이상`);
        for (const tab of unselected) assert.equal(tab.color, unselected[0].color, `${width}/${theme}/${tab.view}: 탭 글자색 RGB ${tab.color} = ${unselected[0].color}`);
        const labels = { 'track32-bookshelf.html': '서재', 'track59-sketchbook.html': '책', 'track58-pinboard.html': '보드', 'track56-network.html': '지도' };
        for (const view of ['track32-bookshelf.html', 'track59-sketchbook.html', 'track58-pinboard.html', 'track56-network.html']) {
          if (width === 390) {
            await page.locator('#mobile-more').click();
            await page.locator('#header-overflow button').filter({ hasText: new RegExp('^' + labels[view] + '$') }).evaluate((el) => el.click());
          } else {
            await page.locator(`#tree-views button[data-view="${view}"]`).click();
          }
          await page.waitForTimeout(250);
          // 누른 탭 위에 마우스가 남아 있으면 hover 바탕이 섞인다 — 바탕0 계약은 마우스를 치운 뒤에 잰다.
          await page.mouse.move(2, 300);
          if (width === 1440) {
            // 261119 대표 결정: 탭은 판 안 칸이 아니라 글자 링크다 — 감싸는 판 배경·테두리 0,
            // 고른 탭은 채움 대신 '밑줄 2px + 진한 글자', 누름 영역은 44px 이상, 고른 탭은 1개.
            const box = await page.evaluate(() => {
              const frame = document.querySelector('.tree-frame');
              const fcs = getComputedStyle(frame);
              const btn = document.querySelector('#tree-views button[aria-current="true"]');
              const cs = getComputedStyle(btn);
              const others = [...document.querySelectorAll('#tree-views button[data-view]')].filter((b) => b !== btn);
              const r = btn.getBoundingClientRect();
              return {
                frameBg: fcs.backgroundColor, frameBorder: parseFloat(fcs.borderTopWidth) || 0,
                bg: cs.backgroundColor, deco: cs.textDecorationLine, thickness: cs.textDecorationThickness, color: cs.color,
                height: Math.round(r.height),
                otherBg: others.map((b) => getComputedStyle(b).backgroundColor),
                otherDeco: others.map((b) => getComputedStyle(b).textDecorationLine),
                current: document.querySelectorAll('#tree-views button[aria-current="true"]').length
              };
            });
            assert.equal(box.frameBg, 'rgba(0, 0, 0, 0)', `${width}/${theme}/${view}: 탭을 감싸는 판 배경 없음`);
            assert.equal(box.frameBorder, 0, `${width}/${theme}/${view}: 탭을 감싸는 판 테두리 없음`);
            assert.equal(box.bg, 'rgba(0, 0, 0, 0)', `${width}/${theme}/${view}: 고른 탭 칸을 칠하지 않는다`);
            assert.equal(box.deco, 'underline', `${width}/${theme}/${view}: 고른 탭은 밑줄로 표시한다`);
            assert.equal(box.thickness, '2px', `${width}/${theme}/${view}: 밑줄 두께 2px`);
            assert.ok(box.height >= 44, `${width}/${theme}/${view}: 탭 누름 영역 ${box.height}px ≥ 44`);
            assert.equal(box.current, 1, `${width}/${theme}/${view}: 현재 화면 표시는 1개`);
            assert.notEqual(box.color, unselected[0].color, `${width}/${theme}/${view}: 고른 탭 글자가 더 진하다`);
            for (const d of box.otherDeco) assert.equal(d, 'none', `${width}/${theme}/${view}: 고르지 않은 탭에 밑줄 없음`);
            for (const b of box.otherBg) assert.equal(b, 'rgba(0, 0, 0, 0)', `${width}/${theme}/${view}: 고르지 않은 탭 배경 투명`);
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
// 2026-11-17 대표 결정: 트리 0개 계정에서도 서재·책·보드·지도 탭이 보이고 각 화면의 빈 상태가 뜬다.
test('#657 후속 261117: 트리 0개 계정의 탭 4개와 화면별 빈 상태(390·1440 × 정원·밤)', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['night', 'garden']) {
      for (const width of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-17T00:00:00.000Z' }) }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
        const labels = { 'track32-bookshelf.html': '서재', 'track59-sketchbook.html': '책', 'track58-pinboard.html': '보드', 'track56-network.html': '지도' };
        const openMore = async () => {
          if (width !== 390) return;
          const open = await page.locator('#header-overflow').evaluate((el) => el.classList.contains('is-open') && !el.hidden);
          if (!open) await page.locator('#mobile-more').click();
          await page.waitForTimeout(200);
        };
        await openMore();
        const tabs = await page.evaluate((labelList) => {
          const folded = innerWidth <= 780;
          const nodes = folded
            ? [...document.querySelectorAll('#header-overflow button')].filter((b) => labelList.includes(b.textContent.trim()))
            : [...document.querySelectorAll('#tree-views button[data-view]')];
          const buttons = nodes.map((b) => {
            const r = b.getBoundingClientRect();
            return { text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), color: getComputedStyle(b).color, current: b.getAttribute('aria-current') === 'true' };
          });
          return { buttons, folded, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, themeButtons: document.querySelectorAll('#theme-toggle').length };
        }, Object.values(labels));
        assert.equal(tabs.buttons.length, 4, `${width}/${theme}: 탭 4개 — ${JSON.stringify(tabs.buttons)}`);
        assert.ok(tabs.buttons.every((b) => b.w > 0 && b.h > 0), `${width}/${theme}: 탭 rect>0 — ${JSON.stringify(tabs.buttons)}`);
        assert.ok(tabs.overflow <= 0, `${width}/${theme}: 가로 넘침 ${tabs.overflow}px`);
        assert.equal(tabs.themeButtons, 1, `${width}/${theme}: 머리줄 테마 단추 1개`);
        const unselectedColors = [...new Set(tabs.buttons.filter((b) => !b.current).map((b) => b.color))];
        assert.equal(unselectedColors.length, 1, `${width}/${theme}: 고르지 않은 탭 글자색 RGB 같음 — ${JSON.stringify(tabs.buttons)}`);
        for (const [view, heading, action] of [
          ['track32-bookshelf.html', '아직 책장이 비어 있어요.', '＋ 새 트리'],
          ['track59-sketchbook.html', '아직 트리가 없어요.', '＋ 첫 순간 추가'],
          ['track58-pinboard.html', '아직 트리가 없어요.', '＋ 첫 순간 추가'],
          ['track56-network.html', '아직 트리가 없어요.', '＋ 첫 순간 추가']
        ]) {
          await openMore();
          if (tabs.folded) await page.locator('#header-overflow button').filter({ hasText: new RegExp('^' + labels[view] + '$') }).click();
          else await page.locator(`#tree-views button[data-view="${view}"]`).click();
          await page.waitForTimeout(350);
          await openMore();
          const state = await page.evaluate((folded) => {
            const rect = (sel) => {
              const el = document.querySelector(sel);
              if (!el || el.hidden) return null;
              const r = el.getBoundingClientRect();
              return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: Math.round(r.width), h: Math.round(r.height) };
            };
            const overlap = (a, b) => !a || !b ? 0 : Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
            const targets = [['h1', rect('#empty h1')], ['p', rect('#empty p')], ['button', rect('#empty-records')]];
            const blockers = [['updates', rect('.updates-card')], ['toast', rect('#toast')], ['plus', rect('#mobile-add')]];
            return {
              hash: location.hash,
              home: document.body.classList.contains('home-screen'),
              emptyShown: !document.getElementById('empty')?.hidden,
              heading: document.querySelector('#empty h1')?.textContent?.trim(),
              action: document.getElementById('empty-records')?.textContent?.trim(),
              rectsOk: targets.every(([, t]) => t && t.w > 0 && t.h > 0),
              overlaps: targets.flatMap(([tn, t]) => blockers.map(([bn, b]) => [tn + '/' + bn, overlap(t, b)])),
              current: folded
              ? Object.keys({ 'track32-bookshelf.html': '서재', 'track59-sketchbook.html': '책', 'track58-pinboard.html': '보드', 'track56-network.html': '지도' }).find((v) => { const b = [...document.querySelectorAll('#header-overflow button')].find((x) => x.getAttribute('aria-current') === 'true'); return b && b.textContent.trim() === { 'track32-bookshelf.html': '서재', 'track59-sketchbook.html': '책', 'track58-pinboard.html': '보드', 'track56-network.html': '지도' }[v]; }) || ''
              : document.querySelector('#tree-views button[aria-current="true"]')?.dataset.view || ''
            };
          }, tabs.folded);
          assert.equal(state.hash, '#' + { 'track32-bookshelf.html': 'shelf', 'track59-sketchbook.html': 'book', 'track58-pinboard.html': 'board', 'track56-network.html': 'network' }[view], `${width}/${theme}/${view}: 주소가 탭에 남는다`);
          assert.equal(state.home, false, `${width}/${theme}/${view}: 첫 화면으로 튕기지 않는다`);
          assert.ok(state.emptyShown, `${width}/${theme}/${view}: 빈 상태가 보인다`);
          assert.equal(state.heading, heading, `${width}/${theme}/${view}: 빈 상태 문구`);
          assert.equal(state.action, action, `${width}/${theme}/${view}: 빈 상태 단추`);
          assert.equal(state.current, view, `${width}/${theme}/${view}: 탭 표시 유지`);
          assert.ok(state.rectsOk, `${width}/${theme}/${view}: 안내 문장·단추 rect>0`);
          const worst = state.overlaps.reduce((a, b) => (b[1] > a[1] ? b : a), ['none', 0]);
          assert.equal(worst[1], 0, `${width}/${theme}/${view}: 안내·단추와 새 소식·알림·＋ 단추 겹침 ${worst[0]} ${worst[1]}px²`);
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 2026-11-17 대표 지적: 트리가 있는 계정에서도 고르지 않은 탭 글자색이 밤·정원 모두 같아야 한다(빈 상태와 같은 규칙).
test('#657 후속 261117: 트리 있는 계정의 탭 글자색도 같다(정원·밤)', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  const { createTree } = await import('../public/v41/domain.mjs');
  const tree = createTree({ subject: '시험', title: '색 확인 트리', note: '기록', emotion: '설렘', date: '2026-11-17', url: '' }, '2026-11-17T00:00:00.000Z');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['night', 'garden']) for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [tree], prefs: {} }, subject: '시험계정', writeSubjectBound: true, savedAt: '2026-11-17T00:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => !document.getElementById('tree-views')?.hidden, null, { timeout: 10000 });
      if (width === 390) await page.locator('#mobile-more').click();
      await page.waitForTimeout(200);
      const colors = await page.evaluate(() => {
        const nodes = innerWidth <= 780
          ? [...document.querySelectorAll('#header-overflow button')].filter((b) => ['서재', '책', '보드', '지도'].includes(b.textContent.trim()))
          : [...document.querySelectorAll('#tree-views button[data-view]')];
        return nodes.filter((b) => b.getAttribute('aria-current') !== 'true').map((b) => getComputedStyle(b).color);
      });
      assert.equal(new Set(colors).size, 1, `${width}/${theme}: 고르지 않은 탭 글자색 RGB 같음 — ${JSON.stringify(colors)}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

// #972: 눈검사에서 찾은 다섯 가지를 화면의 실제 위치와 크기로 검사한다.
test('#972 서재·책 상세·둘러보기·새 소식 화면 치수', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`화면 시험을 건너뛸 수 없다: ${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['night', 'garden']) for (const [width, height] of [[390, 844], [1440, 900], [2560, 1440]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      try {
        await ctx.addInitScript((value) => localStorage.setItem('lt41.theme', value), theme);
        const groups = ['BTS', 'Hearts2Hearts', 'RIIZE'].map(value => ({ value, count: 2 }));
        await ctx.route('**/api/community/**', route => {
          const body = route.request().url().includes('/shares')
            ? { items: [], nextCursor: null, totalVisible: 0, groups, groupsAll: groups }
            : { items: [] };
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        });
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/#shelf`);
        await page.waitForFunction(() => document.querySelector('#view')?.contentDocument?.querySelector('.book-card')?.getBoundingClientRect().width > 0);
        const shelf = await page.frameLocator('#view').locator('.shelf-screen').evaluate(async el => {
          // 레일 크기 재계산과 책의 이동 효과가 끝난 실제 배치에서 측정한다.
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await Promise.allSettled(el.getAnimations({ subtree: true })
            .filter(a => Number.isFinite(a.effect.getComputedTiming().endTime))
            .map(a => a.finished));
          const rect = sel => el.querySelector(sel).getBoundingClientRect();
          const s = rect('.shelf-viewport'), c = rect('.shelf-controls'), h = rect('.resume-strip');
          const card = rect('.book-card'), cover = rect('.book-cover'), rail = rect('.shelf-rail'), base = rect('.shelf-base');
          return { count: el.querySelectorAll('.book-card').length, upper: c.top - h.bottom, lower: s.top - c.bottom,
            balance: Math.abs(h.top - (innerHeight - s.bottom)), innerGap: cover.top - s.top,
            cardToBase: base.top - card.bottom, firstLeft: card.left - rail.left,
            arrows: [...el.querySelectorAll('.shelf-arrow')].filter(n => !n.hidden).length,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        assert.equal(shelf.count, 1);
        assert.ok(shelf.upper >= 0 && shelf.upper <= 48, `${theme}/${width}: 펼쳐 보기 아래 여백 ${shelf.upper}px`);
        assert.ok(shelf.lower >= 0 && shelf.lower <= 24, `${theme}/${width}: 검색 아래 여백 ${shelf.lower}px`);
        assert.ok(shelf.balance <= 40, `${theme}/${width}: 세 요소 묶음의 위·아래 여백 차이 ${shelf.balance}px`);
        assert.ok(shelf.innerGap >= 0 && shelf.innerGap <= 65, `${theme}/${width}: 책장 안 표지 위 여백 ${shelf.innerGap}px`);
        assert.ok(shelf.cardToBase >= -1 && shelf.cardToBase <= 8, `${theme}/${width}: 책과 선반 사이 ${shelf.cardToBase}px`);
        assert.ok(Math.abs(shelf.firstLeft) <= 4, `${theme}/${width}: 첫 책 왼쪽 오차 ${shelf.firstLeft}px`);
        assert.equal(shelf.arrows, 0, `${theme}/${width}: 한 권이면 화살표 숨김`);
        assert.ok(shelf.overflow <= 1, `${theme}/${width}: 서재 가로 넘침 ${shelf.overflow}px`);

        await page.goto(`${base}/v41/#book`);
        await page.waitForFunction(() => document.querySelector('#view')?.contentWindow?.__TRACK59__?.pageSteps?.().length > 0);
        const frame = page.frames().find(f => f.url().includes('track59-sketchbook'));
        await frame.waitForSelector('.moment[data-moment]');
        await frame.evaluate(() => {
          const card = [...document.querySelectorAll('.moment[data-moment]')].find(el => el.getBoundingClientRect().width > 0);
          showDetail(card.dataset.moment);
        });
        await frame.waitForSelector('#detailSide:not([hidden])');
        const meta = await frame.locator('#detailSide').evaluate(el => ({
          lines: [...el.querySelectorAll('.detail-kicker')].map(n => n.textContent.trim()),
          close: el.querySelector('[data-detail-close]').getBoundingClientRect().height
        }));
        assert.equal(meta.lines.length, 1, `${theme}/${width}: 상세 메타 줄 수`);
        assert.match(meta.lines[0], /사진 · 2026\. 01\. 01 · 끌림/);
        assert.ok(meta.close > 0, '상세 닫기 단추가 남는다');

        if (width === 390 || width === 2560) {
          await page.goto(`${base}/v41/#shelf`);
          await page.waitForFunction(() => typeof document.querySelector('#community-menu')?.onclick === 'function');
          await page.evaluate(() => document.querySelector('#community-menu').click());
          await page.waitForSelector('#community-panel[open] .community-group-chip:nth-child(4)');
          const discover = await page.evaluate(() => {
            const rect = sel => document.querySelector(sel).getBoundingClientRect();
            const rail = rect('#community-groups'), last = rect('#community-groups .community-group-chip:last-child');
            const button = rect('button.community-group-find'), popular = rect('#community-popular-stages');
            const form = rect('#community-search-form'), head = rect('#community-panel .panel-heading'), list = rect('.community-results');
            const overlap = Math.max(0, Math.min(last.right, button.right) - Math.max(last.left, button.left)) *
              Math.max(0, Math.min(last.bottom, button.bottom) - Math.max(last.top, button.top));
            return { clip: Math.max(0, last.right - rail.right), overlap, gap: button.left - rail.right,
              chipHeight: last.height, alignment: Math.max(...[form, head, list].flatMap(r => [Math.abs(popular.left - r.left), Math.abs(popular.width - r.width)])) };
          });
          assert.ok(discover.clip <= 1, `${theme}/${width}: 마지막 칩 잘림 ${discover.clip}px`);
          assert.equal(discover.overlap, 0, `${theme}/${width}: 칩과 단추 겹침`);
          assert.ok(discover.gap >= 8 && discover.chipHeight >= 44, '칩과 단추 사이 여백 및 터치 높이');
          assert.ok(discover.alignment <= 1, `${theme}/${width}: 인기 무대 제목·검색·목록 정렬 오차 ${discover.alignment}px`);
        }

        if (width !== 390) {
          await page.goto(`${base}/v41/#shelf`);
          await page.waitForFunction(() => typeof document.querySelector('#updates-link')?.onclick === 'function');
          await page.evaluate(() => document.querySelector('#updates-link').click());
          await page.waitForSelector('#updates-panel[open] .updates-version');
          const updates = await page.evaluate(() => {
            const head = document.querySelector('#updates-panel .panel-heading').getBoundingClientRect();
            const cards = [...document.querySelectorAll('#updates-panel .updates-version')].map(el => el.getBoundingClientRect());
            return { count: cards.length, maxWidth: Math.max(...cards.map(r => r.width)),
              alignment: Math.max(...cards.map(r => Math.abs(r.left - head.left))) };
          });
          assert.ok(updates.count > 0);
          assert.ok(updates.maxWidth <= 960 && updates.maxWidth >= 900, `${theme}/${width}: 새 소식 카드 폭 ${updates.maxWidth}px`);
          assert.ok(updates.alignment <= 1, `${theme}/${width}: 새 소식 제목과 카드 정렬`);
        }
      } finally { await ctx.close(); }
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

/* #987: 실제 로그인 셸에서 가짜 트리로 카드·메뉴·상세 창의 경계를 잰다. */
test('#987 보드 첫 줄과 모바일 셸 겹침·현재 표시', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  const server = await serve();
  const browser = await chromium.launch({ headless: true });
  const base = 'http://127.0.0.1:' + server.address().port;
  const dest = process.env.LT_VISUAL_987_CAPTURE;
  if (dest) mkdirSync(dest, { recursive: true });
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };
  const makeTree = (count, name) => {
    const input = i => ({ subject: name, title: '화면 검사 순간 ' + (i + 1), note: '가짜 기록을 읽는 화면입니다.', emotion: '설렘', date: '2026-11-' + String(i % 20 + 1).padStart(2, '0'), url: i % 3 === 1 ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : i % 3 === 0 ? 'https://audit.invalid/photo.jpg' : '' });
    let t = createTree(input(0));
    for (let i = 1; i < count; i++) t = addMoment(t, input(i), t.moments[0].id);
    return t;
  };
  async function withPage(width, height, theme, count, run) {
    const trees = [makeTree(count, '좋아하는 무대의 길고 긴 순간들'), makeTree(3, '여름'), makeTree(3, '함께 부른 노래')];
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    try {
      await ctx.addInitScript(t => localStorage.setItem('lt41.theme', t), theme);
      await ctx.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== base) return u.hostname === 'i.ytimg.com' || u.hostname === 'audit.invalid' ? THUMB(route) : route.abort();
        if (u.pathname === '/api/workspace') return route.fulfill({ status: 200, json: { revision: 1, state: { version: 1, trees, prefs: { displayName: '화면검사 시험계정' } }, subject: 'visual-audit-fake', writeSubjectBound: true, savedAt: '2026-11-20T00:00:00.000Z' } });
        if (u.pathname === '/api/account') return route.fulfill({ status: 200, json: { ok: true, email: 'audit@example.invalid', subject: 'visual-audit-fake' } });
        if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, json: { ok: true, items: [] } });
        return route.continue();
      });
      const page = await ctx.newPage();
      await page.goto(base + '/v41/?account=1#shelf');
      await page.waitForFunction(() => window.LT41?.trees?.length === 3 && !document.querySelector('#account-avatar')?.hidden);
      const ask = page.locator('#discover-ask-no');
      if (await ask.isVisible()) await ask.click();
      await page.locator('#record-menu').click();
      await page.locator('[data-tree-action="shelf"]').click();
      await page.frameLocator('#view').locator('#shelfRail [data-book-index]').first().waitFor();
      await page.locator('#toast').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
      const snap = async label => { if (dest) await page.screenshot({ path: join(dest, label + '-' + width + '-' + theme + '.png'), animations: 'disabled' }); };
      await run(page, snap, trees[0]);
    } finally { await ctx.close(); }
  }
  try {
    for (const theme of ['night', 'garden']) {
      for (const width of [360, 375, 390]) await withPage(width, 844, theme, 8, async (page, snap) => {
        await page.locator('#record-menu').click();
        const header = await page.evaluate(() => {
          const t = document.querySelector('#record-menu'), s = document.querySelector('#theme-toggle'), a = t.querySelector('svg');
          const b = t.getBoundingClientRect(), c = s.getBoundingClientRect(), d = a.getBoundingClientRect();
          const hit = document.elementFromPoint(d.x + d.width/2, d.y + d.height/2);
          return { overlap: Math.max(0, Math.min(b.right,c.right)-Math.max(b.left,c.left))*Math.max(0,Math.min(b.bottom,c.bottom)-Math.max(b.top,c.top)), arrowVisible: a.contains(hit) || t.contains(hit), arrowGap: b.right-d.right, arrowWidth: d.width, overflow: document.documentElement.scrollWidth-innerWidth };
        });
        console.log('#987 header', width, theme, JSON.stringify(header));
        await snap('tree-menu');
        check(header.overlap === 0 && header.arrowVisible && header.arrowWidth > 0 && header.arrowGap >= 0 && header.arrowGap <= 16 && header.overflow === 0, '트리 ' + width + ' ' + theme + ' ' + JSON.stringify(header));
        await page.locator('#record-menu').click();
        if (width !== 390) return;
        await page.locator('#mobile-more').click();
        const menu = await page.locator('#header-overflow [aria-current=true]').evaluate(el => {
          const cs = getComputedStyle(el);
          return { underline: cs.textDecorationLine, shadow: cs.boxShadow, border: cs.borderTopWidth, others: [...el.parentElement.querySelectorAll('button:not([aria-current=true])')].map(b => getComputedStyle(b).textDecorationLine) };
        });
        console.log('#987 menu', width, theme, JSON.stringify(menu));
        await snap('nav-menu');
        check(menu.underline.includes('underline') && menu.shadow === 'none' && menu.border === '0px' && menu.others.every(x => !x.includes('underline')), '접힌 메뉴 ' + theme + ' ' + JSON.stringify(menu));
        await page.locator('#header-overflow').getByRole('menuitem', { name: '책', exact: true }).click();
        await page.frameLocator('#view').locator('.moment[data-moment]').first().waitFor();
        // #1078: 한마디 줄 오른쪽 끝이 ＋ 단추에 덮이지 않는다(상세 창을 열기 전, 단추가 보이는 자리에서 잰다).
        await page.waitForTimeout(250);
        const story = await page.evaluate(() => {
          const f = document.querySelector('#view'), r = f.getBoundingClientRect();
          const el = f.contentDocument.querySelector('#whyMargin [data-story-open]');
          const fab = document.getElementById('mobile-add');
          if (!el || !fab || !fab.getBoundingClientRect().width) return { skipped: true };
          const d = el.getBoundingClientRect(), a = fab.getBoundingClientRect();
          return {
            area: Math.max(0, Math.min(r.x + d.right, a.right) - Math.max(r.x + d.left, a.left)) * Math.max(0, Math.min(r.y + d.bottom, a.bottom) - Math.max(r.y + d.top, a.top)),
            right: Math.round(r.x + d.right), fabLeft: Math.round(a.left), text: el.textContent.trim()
          };
        });
        console.log('#1078 book', theme, JSON.stringify(story));
        check(story.skipped || (story.area === 0 && story.right <= story.fabLeft), '책 한마디 줄 × ＋ 단추 겹침 0 ' + theme + ' ' + JSON.stringify(story));
        const frame = await (await page.locator('#view').elementHandle()).contentFrame();
        await frame.evaluate(() => { const c = [...document.querySelectorAll('.moment[data-moment]')].find(e => e.getBoundingClientRect().width > 0); showDetail(c.dataset.moment); });
        await frame.locator('#detailSide:not([hidden])').waitFor();
        await page.waitForTimeout(200);
        const detail = await page.evaluate(() => {
          const f = document.querySelector('#view'), r = f.getBoundingClientRect(), d = f.contentDocument.querySelector('#detailSide').getBoundingClientRect(), a = document.querySelector('#mobile-add').getBoundingClientRect();
          return { overlap: Math.max(0,Math.min(r.x+d.right,a.right)-Math.max(r.x+d.left,a.left))*Math.max(0,Math.min(r.y+d.bottom,a.bottom)-Math.max(r.y+d.top,a.top)), fabWidth: a.width, detailWidth: d.width };
        });
        console.log('#987 book', theme, JSON.stringify(detail));
        await snap('book-detail');
        check(detail.detailWidth > 0 && detail.overlap === 0, '책 상세 ' + theme + ' ' + JSON.stringify(detail));
        await frame.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        await page.waitForTimeout(200);
        check(await page.locator('#mobile-add').isVisible(), '책 상세 닫은 뒤 순간 추가 ' + theme);
      });
      for (const width of [1440, 2560]) for (const count of [8, 40]) await withPage(width, width === 1440 ? 900 : 1440, theme, count, async (page, snap) => {
        await page.locator('[data-view="track58-pinboard.html"]').click();
        await page.frameLocator('#view').locator('.card[data-id]').first().waitFor();
        const frame = await (await page.locator('#view').elementHandle()).contentFrame();
        await frame.waitForFunction(n => document.querySelectorAll('.card[data-id]').length === n, count);
        await frame.evaluate(() => selectMoment(document.querySelector('.card[data-id]').dataset.id,true));
        await frame.locator('#detail.open').waitFor();
        await page.waitForTimeout(600);
        const m = await frame.evaluate(() => {
          const title = document.querySelector('.boardTitle').getBoundingClientRect(), vp = document.querySelector('#viewport').getBoundingClientRect(), btn = document.querySelector('#cinemaBtn').getBoundingClientRect();
          const cards = [...document.querySelectorAll('.card[data-id]')].map(e => e.getBoundingClientRect());
          return { titleBottom: title.bottom, viewportTop: vp.top, firstTop: Math.min(...cards.map(r=>r.top)), overlap: Math.max(...cards.map(r=>Math.max(0,Math.min(r.right,btn.right,vp.right)-Math.max(r.left,btn.left,vp.left))*Math.max(0,Math.min(r.bottom,btn.bottom,vp.bottom)-Math.max(r.top,btn.top,vp.top)))), visible: cards.filter(r=>r.bottom>vp.top&&r.top<vp.bottom&&r.right>vp.left&&r.left<vp.right).length, horizontalFit: cards.filter(r=>r.left>=vp.left-1&&r.right<=vp.right+1).length };
        });
        console.log('#987 board', width, count, theme, JSON.stringify(m));
        await snap('board-detail-' + count);
        check(m.firstTop >= Math.max(m.titleBottom,m.viewportTop)-1 && m.visible>0 && m.overlap===0 && (count!==8 || m.horizontalFit===8), '보드 ' + width + ' ' + count + ' ' + theme + ' ' + JSON.stringify(m));
      });
    }
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
  assert.deepEqual(failures, []);
});
