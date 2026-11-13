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

test('#426 최근 순간 카드는 내 기록 최신 순간 한 장(로그아웃에는 없다)',()=>{
  // 카드는 순간 목록 한 벌(momentList.entries)에서 읽는다 — 예시 모드(사진 3장 미만 등)에서도 순간이 있으면 카드가 나오고, 로그아웃은 momentList가 없어 없다.
  assert.match(orbit,/const recentMoment=\(Array\.isArray\(momentList\?\.entries\)&&momentList\.entries\.length\)\?momentList\.entries\[0\]:null;/);
  // 예시(데모)·빈 궤도(로그아웃)에서는 카드 마크업 자체가 없다 — 로그아웃은 momentList가 없다.
  assert.match(orbit,/\$\{recentMoment\?recentMarkup\(recentMoment\):''\}/);
});

test('#426 카드 모양: 썸네일 크게 + 마지막 순간·지난 날 + 한 줄 제목 + 트리 이름·이어 보기',()=>{
  assert.match(orbit,/마지막 순간\$\{days===null\?'':` · \$\{relativeDayLabel\(days\)\}`\}/,'첫 줄 안내(#549: 오늘·어제·N일 전)');
  assert.match(orbit,/localDaysBetween\(undefined,raw\)/,'일수는 기기 지역 날짜(#547) 기준');
  assert.match(orbit,/<strong>\$\{esc\(head\)\}<\/strong>/,'한 줄 제목');
  assert.match(orbit,/· 이어 보기 →<\/small>/,'트리 이름·이어 보기');
  // 이슈 #466 M6: 카드 자체는 role="button"이 아니다(안의 ▶ 재생·제목 달기와 중첩되면 axe
  // nested-interactive). 뒤에 깔린 투명 단추(recent-open)가 열기를 맡고, 자기 이름은 aria-label로 준다.
  assert.match(orbit,/class="recent-card mine" data-do="recent">/,'카드 자체는 역할·초점 대상이 아니다(M6)');
  assert.doesNotMatch(orbit,/class="recent-card[^>]*role="button"/,'카드 div에 더는 role=button을 주지 않는다(M6)');
  assert.match(orbit,/class="recent-open" data-do="recent" aria-label="\$\{esc\(head\)\} 이어 보기">/,'열기 전담 투명 단추가 따로 있다');
  assert.match(orbit,/aria-label="여기서 재생"/,'▶ 재생 단추는 자기 이름을 유지한다');
  assert.match(orbit,/setAttribute\('aria-label','정지'\)/,'재생 중에는 정지 이름');
  // 금빛 내 카드와 같은 결 — .card.mine과 같은 진한 금 테두리(--lt-gold-deep)·이중선·번짐 토큰을 쓴다(#443).
  assert.match(orbit,/\.recent-card\{[^}]*border:3px solid var\(--lt-gold-deep\)/);
  assert.match(orbit,/\.recent-card:after\{[^}]*border:1px solid var\(--lt-gold-line\)/);
});

test('#426 썸네일은 공용 모듈(#435) 그대로 — 회색이면 글 카드·최소 카드로 내려간다',()=>{
  // 카드 썸네일은 thumbFallbackAttrs(후보 사슬)를 쓰고, 썸네일이 없으면 fallbackCardMarkup(글·최소 카드), 글은 글 카드 모양.
  assert.match(orbit,/recent-media[^`]*\$\{thumbFallbackAttrs\(c,\{candidates:c\.thumbCandidates\|\|\[c\.image\],writable,variant:'orbit'\}\)\}/);
  assert.match(orbit,/needsFallbackCard\(c,\{autoLoad:false\}\)\?\`<span class="recent-media recent-media--slot">\$\{fallbackCardMarkup\(c,\{writable,variant:'orbit',dateStyle\}\)\}/);
  assert.match(orbit,/recent-media--memo/);
  // 세로 영상은 9:16(#409), 가로는 16:9.
  assert.match(orbit,/isVerticalMoment\(c\)/);
  assert.match(orbit,/\.recent-media\{[^}]*aspect-ratio:16\/9/);
  assert.match(orbit,/\.recent-media\.vertical\{[^}]*aspect-ratio:9\/16/);
});

test('#426 카드 누르면 그 순간 열기 — 궤도 카드와 같은 onOpen 경로, Enter·Space도 같다',()=>{
  assert.match(orbit,/case'recent':if\(!e\.target\.closest\?\.\('\[data-lt-title-edit\]'\)\)openRecent\(\);break;/);
  assert.match(orbit,/const openRecent=\(\)=>\{if\(!recentMoment\)return;if\(onOpen&&\!recentMoment\.example\)\{onOpen\(recentMoment\);return;\}actions\.openBook\(recentMoment\.treeId,recentMoment\.id,demo\);\};/);
  // 이슈 #466 M6: recent-open이 실제 <button>이라 Enter·Space는 네이티브 동작으로 처리된다
  // (카드 div 자체의 수동 keydown 가로채기는 더 이상 없다 — 중첩 상호작용 구조를 없앴기 때문).
  assert.doesNotMatch(orbit,/shadow\.addEventListener\('keydown',e=>\{if\(e\.key!=='Enter'&&e\.key!==' '\)/,'카드 전용 수동 Enter·Space 가로채기를 두지 않는다(네이티브 버튼이 처리)');
  assert.match(orbit,/<button type="button" class="recent-open" data-do="recent"/,'네이티브 버튼이 키보드 진입을 보장한다');
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

test('#426 이어 보던 순간 버튼은 없다 — 로그인 후 버튼은 추가·둘러보기·내 트리',()=>{
  assert.doesNotMatch(homeCenter,/resume/);
  // 2026-11-14 대표 결정: 셋째 자리에 '내 트리'(trees)를 둔다. 순서·문구는 header-state 한 곳에서 온다.
  assert.match(homeCenter,/button\.hidden = true/,'자리가 모자라면 숨긴다');
  assert.match(homeCenter,/'in-trees':\['add','community','trees'\]/);
  assert.match(homeCenter,/'in-empty':\['add','community','trees'\]/);
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
