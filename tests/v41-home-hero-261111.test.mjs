import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHomeCenter} from '../v41/home-center.js';
import {createHomeActions} from '../v41/home-actions.js';
import {createCleanup} from '../public/v41/shell/cleanup.mjs';
// 261116 PR 2: 첫 화면 카드 모드·숫자 줄이기 — 같은 첫 화면의 기존 시험 파일에 더한다.
import {formatCount, homeMomentPick, homeMomentMenu, homeDayMoment, readHomeMoment, HOME_MOMENT_KEY} from '../v41/home-card-mode.js';


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
  assert.deepEqual([...btns].map(b=>b.classList.contains('primary-cta')),[true,false,false],"가운데 첫 단추만 크림색");
  assert.deepEqual(btns.map(b=>b.hidden),[false,false,false]);
});

test('로그인·트리 0: 세 자리 모두 채운다, 비활성 표시 없음',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:0});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 첫 순간 추가','둘러보기','어떻게 쓰나요']);
  assert.equal(btns.some(b=>b.disabled),false);
  assert.deepEqual(btns.map(b=>b.hidden),[false,false,false]);
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

// #952: 추가·둘러보기·안내 패널 배선(#426·#635·#388)은 실제 화면에서 잰다 —
// tests/v41-home-screen-952.test.mjs(단추 누름 → 메시지·화면 전환·안내 창 내용).

test('정리 창 빈 제목 대체를 그려진 행에서 본다: 영상/비영상 구분, 흐린 글자', () => {
  // v41-cleanup-dirty-confirm.test.mjs의 가짜 DOM 흉내로 createCleanup을 직접 돌린다.
  const els = {};
  const element = () => ({
    textContent: '', className: '', value: '', dataset: {}, children: [], listeners: {},
    classList: { set: new Set(), add(n) { this.set.add(n); }, remove(n) { this.set.delete(n); }, contains(n) { return this.set.has(n); } },
    setAttribute() {}, append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    querySelectorAll: () => [],
  });
  const opened = [];
  globalThis.window = { LT41: { tree: { id: 't1', moments: [
    { id: 'v', parentId: 'p1', mediaMetadata: { poster: '/media/v.jpg' } },
    { id: 'm', parentId: 'p1', note: '글 기록' },
    { id: 't', parentId: 'p1', title: '있는 제목' },
  ] } } };
  globalThis.document = { createElement: () => element() };
  try {
    const cleanup = createCleanup({
      $: id => {
        const el = (els[id] = els[id] || element());
        // <select> 흉내 — sync가 targetLabel을 만든다.
        if (id === 'cleanup-target') el.selectedOptions = el.selectedOptions || [{ textContent: '' }];
        return el;
      },
      getMember: () => ({ snapshot: () => ({ owned: true, writable: true }) }),
      getSource: () => 'server', getTrees: () => [],
      choose: () => {}, notify: () => {}, panel: id => opened.push(id),
      momentTitle: m => m.title || '', treeMomentThumb: () => '',
    });
    assert.equal(cleanup.open(), true);
    const rows = els['cleanup-moments'].children;
    // 행 = [체크 상자, 글자] — 썸네일이 없어 img는 끼지 않는다.
    assert.deepEqual(rows.map(r => r.children[1].textContent), ['제목 없는 영상', '제목 없는 순간', '있는 제목']);
    assert.deepEqual(rows.map(r => r.children[1].classList.contains('is-blank')), [true, true, false], '빈 제목만 흐린 글자로');
    assert.deepEqual(opened, ['cleanup-panel']);
  } finally { delete globalThis.window; delete globalThis.document; }
});
test('정리 화면 열기 메시지가 홈 액션에 준비됐다(261117 고객 의견 — 모아둔 순간 정리 창)',()=>{
  const sent=[];
  createHomeActions({getContext:()=>null,send:m=>sent.push(m)}).actions.cleanup();
  assert.deepEqual(sent,[{type:'lt41-cleanup'}]);
});



// #952: 처리방침·약관 링크(2026-11-16)는 그려진 안내 패널에서 잰다 —
// tests/v41-home-screen-952.test.mjs(주소·새 창·누름 영역 44px).

// 261118 도현 의견 1-2: 첫 화면 숫자판에 '트리 0'(내 트리)과 '트리 9'(둘러보기 공개 집계)가 같은 라벨로
// 나란히 보였고, '순간 117'은 남의 것까지 센 공개 집계라 내 숫자로 읽혔다. 로그인은 내 것만 남기고
// (모아둔 N·전체 N·트리 N·최근 — 둘러보기 입구는 바로 위 '둘러보기' 단추에 있다), 로그아웃은 내 숫자가
// 없으니 0 두 줄 대신 둘러보기 공개 집계만 '예시' 표시로 남긴다. 같은 뜻 숫자가 두 번 보이지 않게 한다.
