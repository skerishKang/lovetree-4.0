// #426(2026-11-12): 첫 화면 "최근 순간 카드" 규격 — 두 줄 안내를 썸네일 카드 한 장으로 바꾼다.
// 궤도(orbit.js)의 소스 계약을 본다: 카드 유무·모양 분기·▶ 재생 조건·안전 구역 포함.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const orbit=src('src/views/orbit.js');
const homeCenter=src('v41/home-center.js');
const home=src('v41/home.js');
const homePresentation=src('v41/home-presentation.js');

test('#426 최근 순간 카드는 내 기록 최신 순간 한 장(예시·로그아웃에는 없다)',()=>{
  // orbitRecords가 최신순 정렬이므로 첫 장이 최근 순간이다 — 카드는 순간 목록 한 벌(momentList.entries)에서 읽는다(섞어서·사진 3장 미만 사용자도 받는다).
  assert.match(orbit,/const recentMoment=!demo&&Array\.isArray\(momentList\?\.entries\)&&momentList\.entries\.length\?momentList\.entries\[0\]:null;/);
  // 예시(데모)·빈 궤도(로그아웃)에서는 카드 마크업 자체가 없다.
  assert.match(orbit,/\$\{recentMoment\?recentMarkup\(recentMoment\):''\}/);
});

test('#426 카드 모양: 썸네일 크게 + 마지막 순간·지난 날 + 한 줄 제목 + 트리 이름·이어 보기',()=>{
  assert.match(orbit,/마지막 순간\$\{days===null\?'':` · \$\{days\}일 전`\}/,'첫 줄 안내');
  assert.match(orbit,/<strong>\$\{esc\(head\)\}<\/strong>/,'한 줄 제목');
  assert.match(orbit,/· 이어 보기 →<\/small>/,'트리 이름·이어 보기');
  assert.match(orbit,/aria-label="마지막 순간 열기: \$\{esc\(head\)\}"/,'카드 접근성 이름');
  // 금빛 내 카드와 같은 결 — .card.mine과 같은 토큰(테두리·이중선·번짐)을 쓴다.
  assert.match(orbit,/\.recent-card\{[^}]*border:3px solid var\(--lt-gold-line\)/);
  assert.match(orbit,/\.recent-card:after\{[^}]*border:1px solid var\(--lt-gold-line\)/);
});

test('#426 썸네일은 공용 모듈(#435) 그대로 — 회색이면 글 카드·최소 카드로 내려간다',()=>{
  // 카드 썸네일은 thumbFallbackAttrs(후보 사슬)를 쓰고, 썸네일이 없으면 fallbackCardMarkup(글·최소 카드), 글은 글 카드 모양.
  assert.match(orbit,/recent-media[^`]*\$\{thumbFallbackAttrs\(c,\{candidates:c\.thumbCandidates\|\|\[c\.image\],writable,variant:'orbit'\}\)\}/);
  assert.match(orbit,/needsFallbackCard\(c,\{autoLoad:false\}\)\?\`<span class="recent-media recent-media--slot">\$\{fallbackCardMarkup\(c,\{writable,variant:'orbit'\}\)\}/);
  assert.match(orbit,/recent-media--memo/);
  // 세로 영상은 9:16(#409), 가로는 16:9.
  assert.match(orbit,/isVerticalMoment\(c\)/);
  assert.match(orbit,/\.recent-media\{[^}]*aspect-ratio:16\/9/);
  assert.match(orbit,/\.recent-media\.vertical\{[^}]*aspect-ratio:9\/16/);
});

test('#426 카드 누르면 그 순간 열기 — 궤도 카드와 같은 onOpen 경로, Enter·Space도 같다',()=>{
  assert.match(orbit,/case'recent':if\(!e\.target\.closest\?\.\('\[data-lt-title-edit\]'\)\)openRecent\(\);break;/);
  assert.match(orbit,/const openRecent=\(\)=>\{if\(!recentMoment\)return;if\(onOpen&&\!recentMoment\.example\)\{onOpen\(recentMoment\);return;\}actions\.openBook\(recentMoment\.treeId,recentMoment\.id,demo\);\};/);
  assert.match(orbit,/shadow\.addEventListener\('keydown',e=>\{if\(e\.key!=='Enter'&&e\.key!==' '\)return;if\(e\.target\.matches\?\.\('\[data-do=recent\]'\)\)\{e\.preventDefault\(\);openRecent\(\);\}\}/);
  // role=button·tabindex=0으로 키보드 진입을 보장한다.
  assert.match(orbit,/class="recent-card mine" role="button" tabindex="0"/);
});

test('#426 ▶ 재생은 누른 뒤에만 — 첫 화면이 열릴 때는 플레이어 요청이 없다',()=>{
  // iframe(플레이어)은 ▶를 눌렀을 때만 만든다: toggleRecentPlay 안에서만 createElement('iframe')이 recent-frame으로 나온다.
  const playBlock=orbit.split('const toggleRecentPlay=')[1]?.split('shadow.addEventListener')[0]||'';
  assert.match(playBlock,/document\.createElement\('iframe'\)/,'iframe은 ▶ 처리기 안에서만');
  assert.equal((orbit.match(/recent-frame/g)||[]).length-(orbit.match(/className='recent-frame'/g)||[]).length>=0,true);
  assert.match(orbit,/embedUrl\(id\)/,'embed 주소는 누른 뒤에 만든다');
  // ▶ 영역은 재생/정지로 구분한다(라벨·표시).
  assert.match(playBlock,/btn\.setAttribute\('aria-label','정지'\)/);
  assert.match(playBlock,/btn\.setAttribute\('aria-label','여기서 재생'\)/);
  // 카드의 다른 곳을 누르면 순간 열기 — ▶ 클릭이 카드 열기로 새지 않는다.
  assert.match(orbit,/if\(play\)\{e\.stopPropagation\(\);toggleRecentPlay\(play\);return;\}/);
});

test('#426 이어 보던 순간 버튼은 없다 — 로그인 후 버튼은 추가·둘러보기 두 개',()=>{
  assert.doesNotMatch(homeCenter,/resume/);
  assert.match(homeCenter,/'in-trees':\['add','community'\]/);
  assert.match(homeCenter,/'in-empty':\['add','community'\]/);
  assert.match(homeCenter,/button\.hidden = true/,'남는 자리는 숨긴다');
  // 둘째 줄에서도 마지막 순간 문구를 뺀다(카드가 대신) — 안내 문구에는 마지막 순간 표기가 남지 않는다.
  assert.doesNotMatch(homePresentation,/마지막 순간 「/);
  assert.doesNotMatch(homePresentation,/`마지막 순간 ·/);
  assert.match(home,/최근 순간 카드가 이어 보기를 대신/);
});

test('#426 390: 카드 폭=화면-32px, 세로 썸네일 높이 제한',()=>{
  assert.match(orbit,/\.recent-card\{[^}]*width:min\(430px,86vw\)/);
  assert.match(orbit,/width:calc\(100vw - 32px\)/);
  assert.match(orbit,/\.recent-media\.vertical\{[^}]*38dvh/);
  // 카드가 .center 안에 있어 #440 안전 구역 측정에 함께 잡힌다.
  assert.match(orbit,/<\/p>\$\{recentMoment\?recentMarkup\(recentMoment\):''\}<div class="actions">/);
});
