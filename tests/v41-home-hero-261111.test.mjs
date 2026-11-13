import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyHomeCenter} from '../v41/home-center.js';
import {homeSecondLine} from '../v41/home-presentation.js';
import {createHomeActions} from '../v41/home-actions.js';

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

// 2026-11-14 대표 결정: 로그인한 첫 화면도 로그아웃과 같은 세 자리를 쓴다(#426 의 '셋째 자리는 숨김'을 대신한다).
test('로그인·트리 있음: [＋ 순간 추가·둘러보기·내 트리] 세 개, 첫 버튼만 흰색',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:2});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 순간 추가','둘러보기','내 트리']);
  assert.deepEqual(btns.map(b=>b.dataset.do), ['add','community','trees']);
  assert.deepEqual([...btns].map(b=>b.classList.contains('primary-cta')),[true,false,false]);
  assert.deepEqual(btns.map(b=>b.hidden),[false,false,false]);
});

test('로그인·트리 0: 세 자리 모두 채운다, 비활성 표시 없음',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:0});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 순간 추가','둘러보기','내 트리']);
  assert.equal(btns.some(b=>b.disabled),false);
  assert.deepEqual(btns.map(b=>b.hidden),[false,false,false]);
});

test('가운데 세 폭 동일·두 줄 높이 고정·좁은 화면 세로 스택 규칙이 첫 화면에 있다',()=>{
  assert.match(homeSrc,/flex:1 1 0%/);
  assert.match(homeSrc,/min-width:0/);
  assert.match(homeSrc,/min-height:2lh/);
  assert.match(homeSrc,/max-width:480px/);
  assert.match(homeSrc,/flex-direction:column/);
});

test('큰 제목 아래 둘째 줄 상태 문구 계산(2026-11-11·#426 2026-11-12): 정리 알림 > 첫 순간 안내, 마지막 순간은 카드가 대신',()=>{
  assert.equal(homeSecondLine({member:'out'}),null);
  // #380 5번: 정리 입구는 트리 ▾ 드롭다운 한 곳뿐 — 첫 화면은 몇 개인지만 알린다.
  assert.deepEqual(homeSecondLine({member:'in',unorganizedCount:3}),{text:'정리 안 된 순간 3개',action:'none'});
  assert.deepEqual(homeSecondLine({member:'in',unorganizedCount:0,hasMoment:false}),{text:'첫 순간을 남기면 여기서 이어 볼 수 있어요',action:'none'});
  // #426: 순간이 있으면 둘째 줄은 안내 한 줄만 — 마지막 순간은 최근 순간 카드가 보여 준다.
  assert.equal(homeSecondLine({member:'in',last:{title:'GANGNAM STYLE',days:2}}),null);
  assert.equal(homeSecondLine({member:'in',last:{title:'GANGNAM STYLE'}}),null);
});

test('홈 배선: 추가/둘러보기/로그아웃 시작이 기존 액션으로 연결되고 resume 버튼은 없다(#426)',()=>{
  assert.match(homeSrc,/bridge\.actions\.requestMoment\('add'\)/);
  assert.doesNotMatch(homeSrc,/bridge\.actions\.resume\(\)/,'이어 보던 순간 버튼 배선 제거');
  assert.match(homeSrc,/communityButton\.onclick=\(\)=>bridge\.actions\.community\(\)/,'둘러보기 연결');
  assert.match(homeSrc,/guideButton\.onclick=\(\)=>bridge\.actions\.community\(\)/,'어떻게 쓰나요 = 둘러보기 동일');
  assert.match(homeSrc,/first\.onclick=bridge\.actions\.start/);
  const centerCode=homeCenterSrc.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
  assert.equal(/새 트리 만들기/.test(centerCode),false,'"새 트리 만들기"는 가운데 줄에서 뺀다');
});

test('큰 제목 아래 설명 둘째 줄: 높이 두 줄 고정·정리 입구는 첫 화면에 없다',()=>{
  assert.match(homeSrc,/\.center > p:not\(\.center-note\)\{min-height:2lh\}/);
  // #380 5번: 첫 화면의 정리 링크(center-status)를 없앴다 — 입구는 트리 ▾ 드롭다운 하나뿐이다.
  assert.equal(homeSrc.includes('center-status'),false,'첫 화면 정리 링크 없음');
  assert.equal(homeSrc.includes('actions.cleanup('),false,'첫 화면에서 정리 창을 열지 않는다');
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

test('정리 화면 열기 메시지가 홈 액션에 준비됐다',()=>{
  const sent=[];
  createHomeActions({getContext:()=>null,send:m=>sent.push(m)}).actions.cleanup();
  assert.deepEqual(sent,[{type:'lt41-move'}]);
});

test('첫 화면 가운데 버튼 폭(대표 2026-11-13): 두 개여도 늘어나지 않고, 휴대폰에서는 줄을 꽉 채우지 않는다', () => {
  const home = src('v41/home.js');
  // 세 개일 때 폭(약 176px)을 상한으로 — 두 개면 265px씩 늘어나던 것을 막는다.
  assert.match(home, /\.center \.actions \.subtleBtn\{flex:1 1 0%;max-width:176px;/);
  // 휴대폰: 두 개는 나란히(각 150px까지), 세 개는 세로로 쌓되 240px까지만. 줄 전체로 늘리던 규칙은 없다.
  assert.match(home, /@media \(max-width:480px\)\{[^']*\.subtleBtn\{max-width:150px\}[^']*\[data-count="3"\]\{flex-direction:column;align-items:center\}[^']*max-width:240px\}/);
  assert.doesNotMatch(home, /align-items:stretch\}\.center \.actions \.subtleBtn\{width:100%\}\}/);
  // 보이는 버튼 수를 표시한다.
  assert.match(home, /setAttribute\('data-count',String\(centerButtons\.filter\(b=>!b\.hidden/);
});
