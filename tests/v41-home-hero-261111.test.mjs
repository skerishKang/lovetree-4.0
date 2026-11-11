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

// #380 2026-11-11: 가운데 세 버튼 — 로그인 전 [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요] / 로그인 후 [＋ 순간 추가·이어 보던 순간·둘러보기].
// 왼쪽 첫 버튼만 흰색 채움(primary-cta), 나머지 테두리. 자리·개수 그대로 3개.

const makeButton=()=>{
  const attrs={};
  const set=new Set();
  return {
    textContent:'',dataset:{},disabled:false,className:'',attrs,set,
    classList:{toggle(name,on){if(on)set.add(name);else set.delete(name);return on},contains:name=>set.has(name)},
    setAttribute:(k,v)=>{attrs[k]=String(v)},
    getAttribute:k=>attrs[k]??null,
    removeAttribute:k=>{delete attrs[k]}
  };
};

test('로그인 전: [＋ 첫 순간 남기기·둘러보기·어떻게 쓰나요], 첫 버튼만 흰색',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  const plan=applyHomeCenter(btns,{member:'out',treeCount:0});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 첫 순간 남기기','둘러보기','어떻게 쓰나요']);
  assert.deepEqual(btns.map(b=>b.dataset.do),['start','community','guide']);
  assert.deepEqual([...btns].map(b=>b.classList.contains('primary-cta')),[true,false,false]);
  assert.equal(plan.state,'out');
});

test('로그인·트리 있음: [＋ 순간 추가·이어 보던 순간·둘러보기], 첫 버튼만 흰색',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:2});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 순간 추가','이어 보던 순간','둘러보기']);
  assert.deepEqual(btns.map(b=>b.dataset.do),['add','resume','community']);
  assert.deepEqual([...btns].map(b=>b.classList.contains('primary-cta')),[true,false,false]);
});

test('로그인·트리 0: 둘째(이어 보던 순간) 비활성 표시',()=>{
  const btns=[makeButton(),makeButton(),makeButton()];
  applyHomeCenter(btns,{member:'in',treeCount:0});
  assert.deepEqual(btns.map(b=>b.textContent),['＋ 순간 추가','이어 보던 순간','둘러보기']);
  assert.equal(btns[1].disabled,true);
  assert.equal(btns[1].attrs['aria-disabled'],'true');
});

test('가운데 세 폭 동일·두 줄 높이 고정·좁은 화면 세로 스택 규칙이 첫 화면에 있다',()=>{
  assert.match(homeSrc,/flex:1 1 0%/);
  assert.match(homeSrc,/min-width:0/);
  assert.match(homeSrc,/min-height:2lh/);
  assert.match(homeSrc,/max-width:480px/);
  assert.match(homeSrc,/flex-direction:column/);
});

test('큰 제목 아래 둘째 줄 상태 문구 계산(2026-11-11): 정리 알림 > 마지막 순간 > 첫 순간 안내',()=>{
  assert.equal(homeSecondLine({member:'out'}),null);
  assert.deepEqual(homeSecondLine({member:'in',unorganizedCount:3}),{text:'정리 안 된 순간 3개 · 정리하기',action:'cleanup'});
  assert.deepEqual(homeSecondLine({member:'in',unorganizedCount:0,hasMoment:false}),{text:'첫 순간을 남기면 여기서 이어 볼 수 있어요',action:'none'});
  assert.deepEqual(homeSecondLine({member:'in',last:{title:'GANGNAM STYLE',days:2}}),{text:'마지막 순간 「GANGNAM STYLE」 · 2일 전',action:'none'});
  assert.deepEqual(homeSecondLine({member:'in',last:{title:'GANGNAM STYLE'}}),{text:'마지막 순간 「GANGNAM STYLE」',action:'none'});
});

test('홈 배선: 추가/resume/둘러보기/로그아웃 시작이 기존 액션으로 연결된다',()=>{
  assert.match(homeSrc,/bridge\.actions\.requestMoment\('add'\)/);
  assert.match(homeSrc,/bridge\.actions\.resume\(\)/);
  assert.match(homeSrc,/communityButton\.onclick=\(\)=>bridge\.actions\.community\(\)/,'둘러보기 연결');
  assert.match(homeSrc,/guideButton\.onclick=\(\)=>bridge\.actions\.community\(\)/,'어떻게 쓰나요 = 둘러보기 동일');
  assert.match(homeSrc,/first\.onclick=bridge\.actions\.start/);
  const centerCode=homeCenterSrc.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
  assert.equal(/새 트리 만들기/.test(centerCode),false,'"새 트리 만들기"는 가운데 줄에서 뺀다');
});

test('큰 제목 아래 설명 둘째 줄: 높이 두 줄 고정·정리하기 한 줄 링크',()=>{
  assert.match(homeSrc,/\.center > p:not\(\.center-note\)\{min-height:2lh\}/);
  assert.match(homeSrc,/center-status/,'정리하기 상태 줄');
  assert.match(homeSrc,/bridge\.actions\.cleanup\(\)/,'정리 창 연결');
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
