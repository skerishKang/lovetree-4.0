import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyHomeCenter} from '../v41/home-center.js';
import {createHomeActions} from '../v41/home-actions.js';
// 261116 PR 2: 첫 화면 카드 모드·숫자 줄이기 — 같은 첫 화면의 기존 시험 파일에 더한다.
import {formatCount, homeMomentPick, homeMomentMenu, homeDayMoment, readHomeMoment, HOME_MOMENT_KEY} from '../v41/home-card-mode.js';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const homeCenterSrc=src('v41/home-center.js');
const homeSrc=src('v41/home.js');
const homeHtml=src('v41/home.html');
const identityCss=src('public/v41/identity.css');
const cleanupSrc=src('public/v41/shell/cleanup.mjs');
const shellCss=src('public/v41/shell.css');

// #380 2026-11-11: 가운데 버튼 — 로그인 전 [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·둘러보기·내 트리](2026-11-14 대표 결정으로 셋째 자리를 채운다).
// 왼쪽 첫 버튼만 흰색 채움(primary-cta), 나머지 테두리. 로그인 후에는 버튼 2개라 셋째 자리는 숨긴다.

const makeButton=()=>{
  const attrs={};
  const set=new Set();
  return {
    textContent:'',dataset:{},disabled:false,hidden:false,className:'',attrs,set,
    classList:{toggle(name,on){if(on)set.add(name);else set.delete(name);return on},contains:name=>set.has(name)},
    setAttribute:(k,v)=>{attrs[k]=String(v)},
    getAttribute:k=>attrs[k]??null,
    removeAttribute:k=>{delete attrs[k]}
  };
};

test('로그인 전: [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요], 첫 버튼만 흰색',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  const plan=applyHomeCenter(btns,{member:'out',treeCount:0});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 첫 순간 추가','둘러보기','어떻게 쓰나요']);
  assert.deepEqual(btns.map(b=>b.dataset.do),['start','community','guide']);
  assert.deepEqual([...btns].map(b=>b.classList.contains('primary-cta')),[true,false,false]);
  assert.equal(plan.state,'out');
});

// 2026-11-14 대표 결정: 로그인한 첫 화면도 로그아웃과 같은 세 자리를 쓴다. 261116 PR 2(대표 확정)로
// 첫 자리는 '＋ 순간 추가'→'순간 목록'으로 바뀌고, '+ 순간 추가'는 글귀 바로 아래 위쪽 단추(밝은 채움)로 올라갔다.
test('로그인·트리 있음: [순간 목록·둘러보기·내 트리] 세 개, 세트는 테두리형',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:2});
  assert.deepEqual(btns.map(b=>b.textContent),['순간 목록','둘러보기','서재']);
  assert.deepEqual(btns.map(b=>b.dataset.do), ['moments','community','trees']);
  assert.deepEqual([...btns].map(b=>b.classList.contains('primary-cta')),[false,false,false],"밝은 채움은 위쪽 '+ 순간 추가' 하나");
  assert.deepEqual(btns.map(b=>b.hidden),[false,false,false]);
});

test('로그인·트리 0: 세 자리 모두 채운다, 비활성 표시 없음',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:0});
  assert.deepEqual(btns.map(b=>b.textContent),['순간 목록','둘러보기','서재']);
  assert.equal(btns.some(b=>b.disabled),false);
  assert.deepEqual(btns.map(b=>b.hidden),[false,false,false]);
});

test('가운데 세 폭 동일·좁은 화면 규칙이 첫 화면에 있다(로그인 세트는 390에서도 한 줄)',()=>{
  assert.match(homeSrc,/flex:1 1 0%/);
  assert.match(homeSrc,/min-width:0/);
  // 261116 PR 2: 둘째 줄은 치워졌다 — 두 줄 높이 고정(min-height:2lh)도 같이 뺐다.
  assert.doesNotMatch(homeSrc,/min-height:2lh/);
  assert.match(homeSrc,/max-width:480px/);
  assert.match(homeSrc,/flex-direction:column/);
  // 로그인 세트([순간 목록·둘러보기·내 트리])는 좁은 화면에서도 한 줄(data-inline), 옛 세로 쌓기는 로그아웃만.
  assert.match(homeSrc,/if\(loggedIn\)actionsRow\?\.setAttribute\('data-inline',''\)/);
  assert.match(homeSrc,/\.center \.actions\[data-count="3"\]:not\(\[data-inline\]\)\{flex-direction:column/);
});

// ── 261116 PR 2: 첫 화면 카드 모드·숫자 줄이기(순수 계산) ─────────────────────
test('숫자 줄이기 한 벌: 1,000↑ 1.2k · 1,000,000↑ 1.2m · 1.0k→1k(소수 한 자리)',()=>{
  assert.equal(formatCount(0),'0');
  assert.equal(formatCount(7),'7');
  assert.equal(formatCount(999),'999');
  assert.equal(formatCount(1000),'1k');
  assert.equal(formatCount(1234),'1.2k');
  assert.equal(formatCount(999999),'1m','999,999는 k로 적으면 1000.0k — 1m 경계로 읽는다');
  assert.equal(formatCount(1000000),'1m');
  assert.equal(formatCount(1234567),'1.2m');
  assert.equal(formatCount(-5),'0');
  assert.equal(formatCount('not-a-number'),'0');
});

const ENTRY=(id,treeId,extra={})=>({id,treeId,treeLabel:extra.treeLabel||`트리 ${treeId}`,createdAt:extra.createdAt||'2026-11-01T00:00:00Z',date:extra.date||'2026-11-01',...extra});

test('카드 모드 고르기: 마지막(기본)·고정·무작위, 못 고르면 마지막으로 돌아온다',()=>{
  const entries=[ENTRY('m1','t1',{createdAt:'2026-11-10T00:00:00Z'}),ENTRY('m2','t2',{createdAt:'2026-11-09T00:00:00Z'}),ENTRY('m3','t1',{createdAt:'2026-11-08T00:00:00Z'})];
  const last=homeMomentPick(entries,{mode:'last'});
  assert.equal(last.moment.id,'m1');
  assert.equal(last.header,null,"'마지막 순간' 기본 문구(궤도가 '· 오늘'을 붙인다)");
  const pinned=homeMomentPick(entries,{mode:'pin',momentId:'m2',treeId:'t2'});
  assert.equal(pinned.moment.id,'m2');
  assert.equal(pinned.header,'고정한 순간');
  const random=homeMomentPick(entries,{mode:'random'},{seed:'2026-11-16'});
  assert.equal(random.header,'오늘의 무작위');
  assert.ok(entries.some(e=>e.id===random.moment.id),'무작위도 목록 안의 순간이다');
  assert.equal(random.moment.id,homeMomentPick(entries,{mode:'random'},{seed:'2026-11-16'}).moment.id,'같은 씨면 같은 순간 — 하루 동안 유지');
  const gone=homeMomentPick(entries,{mode:'pin',momentId:'nope',treeId:'t9'});
  assert.equal(gone.moment.id,'m1','지워진 고정 순간은 마지막으로 돌아온다');
  assert.equal(homeMomentPick([],{mode:'random'}).moment,null,'빈 목록은 카드 없음');
});

test('카드 모드 고르기: 특정 트리에서 — 머리글은 <트리>에서, 그 트리의 최근 순간',()=>{
  const entries=[ENTRY('m1','t1',{createdAt:'2026-11-10T00:00:00Z'}),ENTRY('m2','t2',{createdAt:'2026-11-09T00:00:00Z'}),ENTRY('m3','t1',{createdAt:'2026-11-08T00:00:00Z'})];
  const trees=[{id:'t1',label:'하은 트리'},{id:'t2',label:'모아둔 순간'}];
  const picked=homeMomentPick(entries,{mode:'tree',treeId:'t1'},{trees});
  assert.equal(picked.moment.id,'m1','그 트리의 가장 최근 순간');
  assert.equal(picked.header,'하은 트리에서');
  const empty=homeMomentPick(entries,{mode:'tree',treeId:'nope'},{trees});
  assert.equal(empty.moment.id,'m1','없는 트리는 마지막으로 돌아온다');
});

test('그날의 순간: 무대 날짜가 1년 전 오늘·한 달 전 오늘(1년 먼저), 없으면 null',()=>{
  const now=new Date('2026-11-16T12:00:00');
  const trees=[
    {id:'t1',moments:[{id:'old',date:'2025-11-16',createdAt:'2025-11-16T00:00:00Z'}]},
    {id:'t2',moments:[{id:'month',date:'2026-10-16',createdAt:'2026-10-16T00:00:00Z'}]}
  ];
  const day=homeDayMoment(trees,{now});
  assert.deepEqual(day,{treeId:'t1',id:'old',kind:'year'},'1년 전 오늘을 먼저 본다');
  const picked=homeMomentPick([ENTRY('old','t1'),ENTRY('month','t2')],{mode:'day'},{day});
  assert.equal(picked.header,'1년 전 오늘');
  const only=homeDayMoment([{id:'t2',moments:[{id:'month',date:'2026-10-16',createdAt:'2026-10-16T00:00:00Z'}]}],{now});
  assert.deepEqual(only,{treeId:'t2',id:'month',kind:'month'});
  assert.equal(homeMomentPick([ENTRY('month','t2')],{mode:'day'},{day:only}).header,'한 달 전 오늘');
  assert.equal(homeDayMoment([{id:'t1',moments:[{id:'x',date:'2026-01-01'}]}],{now}),null,'없으면 null — 카드는 마지막으로 돌아온다');
});

test('머리글 ▾ 목록: 다섯 항목, 고정은 걸어 둔 순간이 있을 때만, 트리 목록을 같이 준다',()=>{
  const trees=[{id:'t1',label:'하은 트리'},{id:'t2',label:'모아둔 순간'}];
  const menu=homeMomentMenu({mode:'last'},{trees});
  assert.deepEqual(menu.map(i=>i.label),['마지막에 담은 순간','고정한 순간','그날의 순간','무작위','특정 트리에서']);
  assert.equal(menu.find(i=>i.mode==='pin').disabled,true,'아직 걸어 둔 순간이 없다');
  assert.deepEqual(menu.find(i=>i.mode==='tree').trees,trees);
  const pinned=homeMomentMenu({mode:'pin',momentId:'m1',treeId:'t1'},{trees});
  assert.equal(pinned.find(i=>i.mode==='pin').disabled,false);
  assert.equal(pinned.find(i=>i.mode==='tree').trees.length,2);
});

test('카드 모드 값: 계정 설정(prefs)을 먼저 보고 기기 미러, 없으면 기본(마지막)',()=>{
  const store=new Map();
  const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  assert.deepEqual(readHomeMoment({prefs:null,storage}),{mode:'last',treeId:'',momentId:''},'기본은 마지막');
  storage.setItem(HOME_MOMENT_KEY,JSON.stringify({mode:'random'}));
  assert.deepEqual(readHomeMoment({prefs:null,storage}).mode,'random','기기 미러');
  assert.deepEqual(readHomeMoment({prefs:{homeMoment:{mode:'tree',treeId:'t1'}},storage}).mode,'tree','계정 설정이 이긴다');
  storage.setItem(HOME_MOMENT_KEY,'broken-json');
  assert.deepEqual(readHomeMoment({prefs:null,storage}).mode,'last','막힌 미러는 기본으로');
});

test('홈 배선: 추가/둘러보기/로그아웃 시작이 기존 액션으로 연결되고 resume 버튼은 없다(#426)',()=>{
  assert.match(homeSrc,/bridge\.actions\.requestMoment\('add'\)/);
  assert.doesNotMatch(homeSrc,/bridge\.actions\.resume\(\)/,'이어 보던 순간 버튼 배선 제거');
  assert.match(homeSrc,/communityButton\.onclick=\(\)=>bridge\.actions\.community\(\)/,'둘러보기 연결');
  // #635: '어떻게 쓰나요'는 같은 첫 화면의 안내 패널을 연다(별도 사용법 안내 화면은 없다 — #388).
  assert.match(homeSrc,/guideButton\.onclick=openGuide/,'어떻게 쓰나요 = 안내 패널');
  assert.match(homeSrc,/guideDialog\.setAttribute\('aria-label','어떻게 쓰나요'\)/,'안내 패널은 기존 orbit-dialog 틀을 쓴다');
  assert.match(homeSrc,/data-do="guide-new"/,'안내 패널의 첫 순간 추가 단추');
  assert.match(homeSrc,/data-do="guide-community"/,'안내 패널의 둘러보기 단추');
  assert.match(homeSrc,/first\.onclick=bridge\.actions\.start/);
  const centerCode=homeCenterSrc.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
  assert.equal(/새 트리 만들기/.test(centerCode),false,'"새 트리 만들기"는 가운데 줄에서 뺀다');
});

test('큰 제목 아래 둘째 줄: 치웠다(261116 PR 2) — 모아둔 숫자를 누르면 정리 창',()=>{
  // 261116 PR 2: 둘째 줄 안내 자리에 '+ 순간 추가' 단추가 온다(밝은 채움).
  assert.match(homeSrc,/home-add-top/);
  assert.match(homeSrc,/primary-cta home-add-top/);
  assert.match(homeSrc,/quote\?\.after\(addTop\)/);
  assert.doesNotMatch(homeSrc,/정리 안 된 순간/,'둘째 줄 안내 문구는 첫 화면에서 뺐다');
  assert.doesNotMatch(homeSrc,/homeSecondLine/,'옛 둘째 줄 글자 단추는 없다');
  // #380 5번: 첫 화면의 정리 링크(center-status)는 없다.
  assert.equal(homeSrc.includes('center-status'),false,'첫 화면 정리 링크 없음');
  // 261117 고객 의견: 숫자 줄 '모아둔 N' 칸을 누르면 정리 창(lt41-cleanup)을 연다.
  assert.match(homeSrc,/inboxLine\.onclick=\(\)=>bridge\.actions\.cleanup\(\)/,'모아둔 칸 클릭은 정리 창 액션');
  assert.match(homeSrc,/setAttribute\('aria-label',`모아둔 순간 \$\{inboxCount\}개 정리하기`\)/,'모아둔 칸 이름');
  assert.match(homeSrc,/setAttribute\('aria-disabled','true'\)/,'모아둔 0은 비활성 표기');
  assert.match(homeSrc,/\.home-info-line\{pointer-events:auto/,'모아둔 칸은 눌을 수 있게 화면 위로 올린다');
  assert.match(homeSrc,/\.home-info-line\{pointer-events:auto;display:flex/,'모아둔 칸 최소 높이 44px');
});

test('가운데 위 모아둔 순간 알약은 첫 화면에서 제거됐다',()=>{
  assert.equal(homeHtml.includes('homeInboxFlag'),false);
  assert.match(homeHtml,/<main id="orbit"/);
  assert.equal(identityCss.includes('.inbox-flag'),false);
  assert.equal(homeSrc.includes('homeInboxFlag'),false);
});

test('정리 화면 빈 제목 대체: 영상/비영상 구분, 흐린 글자, 원본 노출 없음',()=>{
  assert.match(cleanupSrc,/제목 없는 영상/);
  assert.match(cleanupSrc,/제목 없는 순간/);
  assert.match(cleanupSrc,/is-blank/);
  assert.equal(/String\(moment\.title/.test(cleanupSrc),false);
  assert.match(shellCss,/\.cleanup-moment \.is-blank/);
});

test('정리 화면 열기 메시지가 홈 액션에 준비됐다(261117 고객 의견 — 모아둔 순간 정리 창)',()=>{
  const sent=[];
  createHomeActions({getContext:()=>null,send:m=>sent.push(m)}).actions.cleanup();
  assert.deepEqual(sent,[{type:'lt41-cleanup'}]);
});

test('첫 화면 가운데 버튼 폭(대표 2026-11-13): 두 개여도 늘어나지 않고, 휴대폰에서는 줄을 꽉 채우지 않는다', () => {
  const home = src('v41/home.js');
  // 세 개일 때 폭(약 176px)을 상한으로 — 두 개면 265px씩 늘어나던 것을 막는다.
  assert.match(home, /\.center \.actions \.subtleBtn\{flex:1 1 0%;max-width:176px;/);
  // 휴대폰: 두 개는 나란히(각 150px까지), 세 개(로그아웃)는 세로로 쌓되 240px까지만 — 로그인 세트는 data-inline으로 한 줄. 줄 전체로 늘리던 규칙은 없다.
  assert.match(home, /@media \(max-width:480px\)\{[^']*\.subtleBtn\{max-width:150px\}[^']*\[data-count="3"\]:not\(\[data-inline\]\)\{flex-direction:column;align-items:center\}[^']*max-width:240px\}/);
  assert.doesNotMatch(home, /align-items:stretch\}\.center \.actions \.subtleBtn\{width:100%\}\}/);
  // 보이는 버튼 수를 표시한다.
  assert.match(home, /setAttribute\('data-count',String\(centerButtons\.filter\(b=>!b\.hidden/);
});

// 처리방침·약관 링크(2026-11-16): 첫 화면 '어떻게 쓰나요' 안내 패널 아래에도 같은 두 링크가 있다.
// 새 창(target=_blank, rel=noopener)으로 열고, 처리방침은 공용 로그인 처리방침의 러브트리 절(#lovetree)로 바로 간다.
test('첫 화면 안내 패널에 처리방침·약관 링크가 있다(새 창, 러브트리 절)', () => {
  assert.match(homeSrc, /<div class="guide-policy"><a href="https:\/\/auth\.padiem\.net\/privacy#lovetree" target="_blank" rel="noopener">개인정보 처리방침<\/a><a href="https:\/\/auth\.padiem\.net\/terms" target="_blank" rel="noopener">이용약관<\/a><\/div>/);
  // 누름 영역 44px.
  assert.match(homeSrc, /#guidePanel \.guide-policy a\{min-height:44px/);
});

// 261118 도현 의견 1-2: 첫 화면 숫자판에 '트리 0'(내 트리)과 '트리 9'(둘러보기 공개 집계)가 같은 라벨로
// 나란히 보였고, '순간 117'은 남의 것까지 센 공개 집계라 내 숫자로 읽혔다. 로그인은 내 것만 남기고
// (모아둔 N·전체 N·트리 N·최근 — 둘러보기 입구는 바로 위 '둘러보기' 단추에 있다), 로그아웃은 내 숫자가
// 없으니 0 두 줄 대신 둘러보기 공개 집계만 '예시' 표시로 남긴다. 같은 뜻 숫자가 두 번 보이지 않게 한다.
test('첫 화면 숫자판: 로그인은 내 것만, 로그아웃 집계는 예시 표시(261118 도현 의견 1-2)',()=>{
  // 로그인: 둘러보기 공개 집계 칸을 만들지 않는다 — 모아둔·전체 칸은 로그인일 때만 붙인다.
  assert.match(homeSrc,/if\(loggedIn\)infoRow\.append\(cellMoments\)/,'모아둔·전체 칸은 로그인만');
  assert.doesNotMatch(homeSrc,/infoRow\.append\(cellMoments,cellCommunity\)/,'로그인에도 공개 집계를 붙이던 옛 배선은 뺐다');
  assert.doesNotMatch(homeSrc,/communityLine\('순간'\)/,'공개 집계를 그냥 순간으로 부르던 라벨은 뺐다');
  assert.doesNotMatch(homeSrc,/communityLine\('트리'\)/,'공개 집계를 그냥 트리로 부르던 라벨은 뺐다(내 트리 칸과 같은 뜻 숫자 두 번 금지)');
  // 로그아웃: 둘러보기 칸만 남기고 '예시'로 표시한다 — 내 기록이 아니라는 뜻을 글자·낭독기에 함께 둔다.
  assert.match(homeSrc,/if\(!loggedIn\)\{\s*const cellCommunity=/,'둘러보기 집계 칸은 로그아웃에만');
  assert.match(homeSrc,/communityLine\('예시 순간'\)/,'공개 순간 집계는 예시 표시');
  assert.match(homeSrc,/communityLine\('예시 트리'\)/,'공개 트리 집계는 예시 표시');
  assert.match(homeSrc,/둘러보기 공개 순간 \$\{formatCount\(stats\?\.moments\)\}개 — 내 기록이 아니에요/,'낭독기에도 내 기록이 아님을 알린다');
  assert.match(homeSrc,/둘러보기 공개 트리 \$\{formatCount\(stats\?\.trees\)\}개 — 내 기록이 아니에요/,'트리 집계 낭독기 이름');
  // 로그인 숫자판은 두 칸(순간 목록·내 트리)이므로 3칸 격자를 두 칸으로 좁힌다(휴대폰 규칙도 함께).
  assert.match(homeSrc,/infoRow\.dataset\.cells='2'/,'두 칸 표시');
  assert.match(homeSrc,/\.home-info\[data-cells="2"\]\{grid-template-columns:repeat\(2,minmax\(0,176px\)\)\}/,'두 칸 격자 규칙');
  assert.match(homeSrc,/\.home-info\[data-cells="2"\]\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/,'휴대폰 두 칸 격자 규칙');
  // 기존 규칙 유지: 모아둔 칸 누르면 정리 창, 0이면 비활성 표기.
  assert.match(homeSrc,/inboxLine\.onclick=\(\)=>bridge\.actions\.cleanup\(\)/);
  assert.match(homeSrc,/setAttribute\('aria-disabled','true'\)/);
});
