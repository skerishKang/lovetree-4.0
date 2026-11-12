// #465 작은 것 묶음 — 실행 계약 (1 책장·4 동그라미·5 둘러보기 말투).
// 2(설정 움직임)·3(계정 메뉴 설명)은 #458·#467(PR #499)가 고치는 index.html·설정 창 파일, 4는 헤더 시험 파일(v41-shell-header)로 옮겼다. 6(밤 테마 보드 판)은 대표 결정 전이라 이슈대로 손대지 않았다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const shelf = read('public/v41/views/shelf/shelf.js');
const shelfExtraCss = read('public/v41/views/shelf/shelf-extra.css');
const community = read('public/v41/community-panel.mjs');

test('#465 1: 책장 — 넘길 책이 없으면 화살표를 숨기고, 책 1~2권이면 소개 상자를 낮게 둔다', () => {
  // 렌더 때 목록 길이로 화살표를 숨긴다(검색 필터가 1권으로 줄어도 같다).
  assert.match(shelf, /var prevArrow=\$\('#shelfPrev'\),nextArrow=\$\('#shelfNext'\);/);
  assert.match(shelf, /if\(prevArrow\)prevArrow\.hidden=list\.length<=1;/);
  assert.match(shelf, /if\(nextArrow\)nextArrow\.hidden=list\.length<=1;/);
  // 소개 상자는 책등 목차 기준(3권부터)을 그대로 쓴다 — 1~2권이면 낮게.
  assert.match(shelf, /hero\.classList\.toggle\('compact',!spineVisible\(list\.length\)\)/);
  // 숨김 확실 가드와 낮은 소개 상자 스타일.
  assert.match(shelfExtraCss, /#shelfPrev\[hidden\],#shelfNext\[hidden\]\{display:none!important\}/);
  assert.match(shelfExtraCss, /\.hero\.compact\{min-height:0;padding:16px 26px\}/);
});

test('#465 5: 둘러보기 안내를 사람 말로 — 0개면 아직 없다는 말, 있으면 새로 공개된 순서', () => {
  assert.match(community, /'아직 공개된 트리가 없어요\. 트리를 공개하면 여기에 나타나요\.'/);
  assert.match(community, /`공개된 트리 \$\{answer\.totalVisible\}개를 찾았어요\. 새로 공개된 순서예요\.`/);
  assert.doesNotMatch(community, /공개 허용된 트리/);
  assert.doesNotMatch(community, /인기·추천 순위가 아니에요/);
});

test('#465 2: 설정 "움직임"은 켬/끔 스위치(role=switch)와 설명 한 줄을 가진다', () => {
  const html = read('public/v41/index.html');
  assert.match(html, /<button type="button" role="switch" id="settings-motion" aria-checked="true" aria-describedby="settings-motion-desc">켬<\/button>/);
  assert.match(html, /id="settings-motion-desc">카드 움직임을 멈추거나 다시 재생해요/);
  const shell = read('public/v41/shell.mjs');
  assert.match(shell, /motion\.setAttribute\('aria-checked',String\(!motionPaused\)\)/);
  assert.match(shell, /motion\.textContent=motionPaused\?'끔':'켬';/);
  // 프레임 알림(첫 화면 카드 멈춤)은 기존 배선을 그대로 쓴다 — 새로운 reload 유발 코드 없다.
  assert.match(shell, /postMessage\(\{type:'lt41-motion',paused:motionPaused\},location\.origin\)/);
  assert.match(read('public/v41/shell.css'), /\.settings-choice button\[role=switch\]\{min-width:76px;justify-content:center\}/);
});

test('#465 3: 계정 메뉴 "고급 기능 보기"에 무엇이 달라지는지 한 줄 설명이 있다', () => {
  const html = read('public/v41/index.html');
  assert.match(html, /id="account-advanced" aria-checked="false"><span class="account-item-text">고급 기능 보기<\/span><span class="account-item-desc">보드에서 편집 도구·되돌리기·이어 그리기가 늘어나요<\/span>/);
  assert.match(read('public/v41/shell.css'), /\.account-popover \.account-item-desc\{display:block;font-size:11px/);
  // 설명 내용은 실제 고급 모드가 여는 것과 일치한다(보드 편집 도구·이어 그리기).
  assert.match(read('public/v41/views/board/board-extra.css'), /lt-advanced/);
});
