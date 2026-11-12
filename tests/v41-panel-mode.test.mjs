// #380 4: 오른쪽 패널을 두 모양으로 띄우는 공통 틀 계약.
// 순간 정리(cleanup-panel)는 전체 화면(맨 위 메뉴 아래 내용 자리), 트리 관리(tree-manager)는 가운데 작은 창.
// 공통 닫기 규칙(×·바깥 클릭·Esc, 쓰던 내용 확인, 초점 복귀)은 shell/dialogs.mjs 한 벌이 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('public/v41/index.html');
const css = read('public/v41/shell.css');
const dialogs = read('public/v41/shell/dialogs.mjs');
const shell = read('public/v41/shell.mjs');
const panels = read('public/v41/shell/panels.mjs');

test('순간 정리는 전체 화면 모양, 트리 관리는 가운데 창 모양을 태그로 받는다', () => {
  // #380 5번: 정리 창 입구는 트리 ▾ 드롭다운이라, 닫은 뒤 초점은 그 단추(record-menu)로 돌아간다.
  assert.match(html, /<dialog id="cleanup-panel" data-lt-panel="full" data-lt-return="record-menu" aria-labelledby="cleanup-title">/);
  assert.match(html, /<dialog id="tree-manager" data-lt-panel="center" data-lt-return="record-menu" aria-labelledby="tree-manager-title">/);
});

test('전체 화면 모양은 맨 위 메뉴 아래 내용 자리를 모두 차지한다', () => {
  assert.match(css, /dialog\[data-lt-panel=full]\{inset:var\(--lt-panel-top,66px\) 0 0 0;width:auto;max-width:none;height:calc\(100dvh - var\(--lt-panel-top,66px\)\);max-height:calc\(100dvh - var\(--lt-panel-top,66px\)\);border-left:0;box-shadow:none\}/);
});

test('가운데 창 모양은 화면 중앙에 놓이고 좁은 화면에서는 여백을 남긴다', () => {
  assert.match(css, /dialog\[data-lt-panel=center]\{inset:0;margin:auto;width:min\(460px,calc\(100vw - 32px\)\);max-width:calc\(100vw - 32px\);height:fit-content;max-height:calc\(100dvh - 88px\);border:1px solid var\(--line\);border-radius:var\(--lt-r-card\);box-shadow:0 18px 60px #0009\}/);
  // 옛 고정 폭 규칙은 가운데 창 규칙과 겹치지 않게 뺀다.
  assert.doesNotMatch(css, /#tree-manager\{width:460px\}/);
});

test('공통 틀은 열 때 연 버튼을 기억하고 닫히면 초점을 돌려준다', () => {
  assert.match(html, /data-lt-return="record-menu"/);
  assert.match(html, /data-lt-return="record-menu"/);
  // dialog 'open' 이벤트는 환경마다 시점이 달라 쓰지 않는다 — 셸 panel()이 showModal 직전에 기록한다.
  assert.match(dialogs, /noteOpener: id => \{/);
  assert.match(dialogs, /openers\.set\(d, assetsOpener\?\.isConnected \? assetsOpener : document\.activeElement\);/);
  // panel()을 지나지 않고 패널 모듈이 직접 showModal로 여는 창(빠른 추가·고르기·둘러보기)도 연 버튼을 안다.
  assert.match(dialogs, /let lastControl = null;/);
  assert.match(dialogs, /const outside = lastControl \? !\(d\.contains\?\.\(lastControl\) \?\? false\) : false;/);
  assert.match(dialogs, /const opener = recorded \|\| \(outside \? lastControl : null\);/);
  assert.match(dialogs, /const fallback = d\.dataset\.ltReturn \? document\.getElementById\(d\.dataset\.ltReturn\) : null;/);
  assert.match(dialogs, /const target = focusReturnTarget\(opener, fallback\);/);
  // #481 L14: 화면(iframe) 안 버튼이 열었으면 그 안으로 초점을 돌려주고, 아니면 셸의 연 버튼으로 돌려준다.
  assert.match(dialogs, /const openedFromFrame = opener && typeof opener\.contentWindow !== 'undefined' && opener\.tagName === 'IFRAME';/);
  assert.match(dialogs, /if \(openedFromFrame && focusIntoFrame\(opener\)\) return;/);
  assert.match(dialogs, /target\?\.focus\?\.\(\);/);
  assert.match(shell, /if\(!target\.open\)\{if\(target\.dataset\.ltPanel\)\{shellDialogs\.noteOpener\(id\);if\(target\.dataset\.ltPanel==='full'\)shellDialogs\.syncPanelTop\(\);\}target\.showModal\(\);\}/);
});

test('공통 틀은 Esc·바깥 클릭 모두 쓰던 내용이 있으면 한 번 묻고 닫는다', () => {
  assert.match(dialogs, /'저장하지 않고 닫을까요\?'/);
  assert.match(dialogs, /PANEL_DIRTY = \{ 'tree-manager': \(\) => deps\.isTreeDirty\?\.\(\) === true \}/);
  assert.match(dialogs, /d\.addEventListener\('cancel', event => \{ if \(!panelConfirmClose\(d\)\) event\.preventDefault\(\); else d\.close\(\); \}\)/);
  assert.match(dialogs, /if \(panelConfirmClose\(d\)\) d\.close\(\);/);
  // 맨 위 메뉴 높이는 열릴 때 잰다(1440 65px·390 62px를 같은 규칙으로).
  assert.match(dialogs, /--lt-panel-top/);
  assert.match(dialogs, /defaultView\?\.addEventListener\?\.\('resize'/);
});

test('공통 틀을 쓰는 대화상자는 옛 바깥 클릭 규칙이 두 번 묶지 않는다', () => {
  assert.match(dialogs, /dialog:not\(\[data-lt-panel]\)/);
  // 트리 관리의 옛 Esc 확인은 공통 틀로 옮겨졌다(두 번 묻지 않게).
  assert.doesNotMatch(panels, /트리 변경을 버리고 닫을까요\?/);
});

test('셸은 트리 관리 더러움 판정을 공통 틀에 넘긴다', () => {
  assert.match(shell, /isTreeDirty:\(\)=>shellPanels\.treeDirty\(\)/);
  // #380 4 2차: × 버튼도 공통 틀(requestClose)로 보내 Esc·바깥 클릭과 같은 규칙을 쓴다.
  assert.match(shell, /if\(target\?\.dataset\?\.ltPanel\)\{shellDialogs\.requestClose\(b\.dataset\.close\);return;\}/);
});

test('트리 관리는 메뉴를 닫기 전에 열어 연 버튼이 초점 기록에 남는다', () => {
  assert.match(shell, /data-tree-action="manage"\]'\)\?\.addEventListener\('click',\(\)=>\{shellPanels\.openTreeManager\(\);closeTreeMenu\(\);\}\);/);
});

// #380 4 2차: 편집기(자세히 추가·수정)·순간 잇기(connection-panel)를 같은 전체 화면 틀로 옮긴다.
// 편집기 자체 규칙(업로드 중 닫기 방지·저장 중 이중 저장 방지·내 기록 저장본을 보는 동안의 편집 잠금)은 그대로 이긴다.

test('순간 잇기는 전체 화면 모양을 태그로 받고, 순간 추가는 한 창(가운데)으로 모인다', () => {
  // #425: 편집기(자세한 추가)는 고르기 창·빠른 추가와 한 창(write-panel)으로 합쳐졌다 — 가운데 창 태그.
  assert.match(html, /<dialog id="write-panel" data-lt-panel="center" data-lt-return="write-menu" aria-labelledby="write-panel-title">/);
  assert.match(html, /<dialog id="connection-panel" data-lt-panel="full" aria-labelledby="connection-title">/);
  // 한 창은 두 탭이 같은 폭(540px)이고, 길면 창 안에서 세로로 스크롤한다.
  assert.match(css, /#write-panel\{width:min\(540px,calc\(100vw - 32px\)\);/);
  assert.match(css, /#write-panel\{[^}]*overflow-y:auto/);
  // 모바일은 화면을 꽉 채운다.
  assert.match(css, /@media\(max-width:780px\)\{\n #write-panel\{inset:0;width:100vw;/);
  assert.match(css, /dialog\[data-lt-panel=full]\{inset:var\(--lt-panel-top,66px\) 0 0 0;/);
});

test('공통 틀은 한 창(순간 추가)·순간 잇기의 더러움 판정을 셸에서 받는다', () => {
  assert.match(dialogs, /PANEL_DIRTY\['write-panel'\] = \(\) => deps\.isEditorDirty\?\.\(\) === true;/);
  assert.match(dialogs, /PANEL_DIRTY\['connection-panel'\] = \(\) => deps\.isConnectionDirty\?\.\(\) === true;/);
  assert.match(shell, /isEditorDirty:\(\)=>\(\$\('write-easy'\)\.hidden\?shellPanels\.detailedDirty\(\):\$\('quick-url'\)\.value\.trim\(\)!==''\)/);
  assert.match(shell, /isConnectionDirty:\(\)=>connectionDirty\(\)/);
  // 자세한 추가 더러움은 제목·메모·주소·사진·고른 연결이 모두 들어 있는 폼 기준값 비교를 그대로 쓴다.
  assert.match(panels, /new URLSearchParams\(new FormData\(\$\('moment-form'\)\)\)\.toString\(\) !== formBaseline/);
  // 한 창은 보이는 구역만 본다 — 쉬운 추가 탭은 주소, 자세한 추가 탭은 폼 기준값.
  assert.match(shell, /isEditorDirty:\(\)=>\(\$\('write-easy'\)\.hidden\?shellPanels\.detailedDirty\(\):\$\('quick-url'\)\.value\.trim\(\)!==''\)/);
});

test('편집기 규칙이 공통 틀보다 우선한다 — 업로드 중에는 Esc·바깥 클릭·× 모두 닫지 않는다', () => {
  assert.match(dialogs, /const message = deps\.panelBlocked\?\.\(d\.id\) \|\| '';/);
  assert.match(dialogs, /if \(panelBlockedMessage\(d\)\) return false;/);
  // 업로드 중 닫기 막기는 편집기와 빠른 추가(사진 올리기) 두 곳에 걸린다.
  assert.match(shell, /panelBlocked:id=>id==='write-panel'&&\(uploads\.busy\|\|shellQuick\.uploads\?\.busy\)\?'파일 전송을 마치거나 취소해 주세요\.':''/);
  // 저장 중 이중 저장 방지(업로드·저장 중 제출 무시)는 그대로다.
  assert.match(panels, /if \(getUploads\(\)\.busy\) return;/);
  // 편집기 Esc 확인은 공통 틀 한 벌만 남는다(두 번 묻지 않게).
  assert.doesNotMatch(panels, /작성 중인 입력을 버리고 닫을까요\?/);
  assert.doesNotMatch(shell, /작성 중인 입력을 버리고 닫을까요\?/);
});

test('편집기의 취소 버튼도 공통 닫기 규칙을 쓴다', () => {
  assert.match(panels, /\$\('editor-cancel'\)\.onclick = \(\) => \{ requestClose\?\.\('write-panel'\); \};/);
  assert.match(shell, /requestClose:id=>shellDialogs\.requestClose\(id\)/);
  assert.match(dialogs, /requestClose: id => \{ const d = \$\(id\); if \(!d\) return false; if \(!panelConfirmClose\(d\)\) return false; d\.close\(\); return true; \}/);
});

test('순간 잇기는 고른 연결이 저장 전이면 더러움이다', () => {
  // 패널은 연결을 만들지 않는다 — 보여 준 연결 목록과 지금 트리의 저장본을 비교한다.
  assert.match(shell, /function connectionDirty\(\)\{return \$\('connection-panel'\)\.open&&connectionSignature\(window\.LT41\?\.tree,window\.LT41\?\.momentId\)!==connectionShown;\}/);
  assert.match(shell, /connectionShown=connectionSignature\(c\.tree,c\.momentId\);/);
  assert.match(shell, /import \{connectionSignature\} from '\.\/shell\/panel-dirty\.mjs';/);
});

test('내 기록 저장본을 보는 동안의 편집 잠금은 그대로다', () => {
  // 서버 확인 전(checking)에는 writable이 false라 편집기를 열지 않고 기록 패널로 보낸다 — 전체 화면 이동은 이 관문을 지난다.
  assert.match(panels, /if \(!getMember\(\)\.snapshot\(\)\.writable\) \{/);
  assert.match(panels, /setEditorMode\(mode, parentId\);\r?\n    panel\('write-panel'\);/);
  assert.match(shell, /writable:source==='server'&&!!member\?\.snapshot\(\)\.writable/);
});

test('#380 4 마지막: 남은 오른쪽 패널이 공통 틀 태그를 받고, 오른쪽에 붙는 패널이 남지 않는다', () => {
  // 전체 화면: 설정·내 보관 파일·공유·둘러보기. 가운데 창: 트리 관리·순간 추가(한 창, #425).
  assert.match(html, /<dialog id="share-panel" data-lt-panel="full" data-lt-return="share-menu" aria-labelledby="share-title">/);
  assert.match(html, /<dialog id="account-assets" data-lt-panel="full" data-lt-return="account-avatar" aria-labelledby="account-assets-title">/);
  assert.match(html, /<dialog id="account-settings" data-lt-panel="full" data-lt-return="account-avatar" aria-labelledby="account-title">/);
  assert.match(html, /<dialog id="community-panel" data-lt-panel="full" data-lt-return="community-menu" aria-labelledby="community-title">/);
  assert.match(html, /<dialog id="write-panel" data-lt-panel="center" data-lt-return="write-menu" aria-labelledby="write-panel-title">/);
  assert.equal(html.includes('id="write-chooser"'), false, '고르기 창은 없다');
  assert.equal(html.includes('id="quick-add"'), false, '빠른 추가는 한 창의 탭이다');
  // 오른쪽에 붙는 패널도, 공통 틀 밖 대화상자도 없다(#368: 내 기록(records)은 설정으로 옮겨졌다).
  const tags = [...html.matchAll(/<dialog id="([a-z-]+)"[^>]*>/g)].map(m => [m[1], /data-lt-panel="(full|center)"/.test(m[0]) ? m[1] : '']);
  const nonFrame = tags.filter(([, f]) => !f).map(([id]) => id);
  assert.deepEqual(nonFrame, []);
  // 오른쪽 패널 시절 id 고정 폭은 빠져야 한다(id 선택자가 공통 틀 규칙을 이긴다).
  assert.doesNotMatch(css, /#write-chooser\{width:420px\}|#quick-add\{width:460px\}/);
});

test('둘러보기의 위치·크기 고정은 공통 전체 화면 틀로 통일한다(모바일 inset 6px 제거)', () => {
  assert.match(css, /dialog\[data-lt-panel=full]\{inset:var\(--lt-panel-top,66px\) 0 0 0;/);
  // 모바일 전용 inset·둥근 테두리 고정이 없고, 안쪽 여백만 남는다.
  assert.doesNotMatch(css, /#community-panel\{inset:6px 6px 8px/);
  assert.doesNotMatch(css, /#community-panel\{position:absolute;inset:10px 14px 14px/);
  assert.doesNotMatch(css, /body\.home-screen #community-panel\{inset:/);
  assert.match(css, /#community-panel\{padding:20px clamp\(16px,3vw,48px\) 40px;/);
});

test('더러움 판정은 한 창(순간 추가)과 공유·설정(프로필 폼)에 붙는다', () => {
  assert.match(dialogs, /PANEL_DIRTY\['write-panel'\] = \(\) => deps\.isEditorDirty\?\.\(\) === true;/);
  assert.match(dialogs, /PANEL_DIRTY\['share-panel'\] = \(\) => deps\.isShareDirty\?\.\(\) === true;/);
  // #368 2차: 설정은 프로필(표시 이름·동그라미 색)을 쓰다 두었을 때만 묻는다.
  assert.match(dialogs, /PANEL_DIRTY\['account-settings'\] = \(\) => deps\.isSettingsDirty\?\.\(\) === true;/);
  // 내 보관 파일·둘러보기는 PANEL_DIRTY에 없다(묻지 않고 닫는다).
  for (const id of ['account-assets', 'community-panel']) {
    assert.ok(!dialogs.includes(`PANEL_DIRTY['${id}']`), `${id}는 묻지 않고 닫는다`);
  }
  assert.match(shell, /isShareDirty:\(\)=>\{const create=\$\([^)]*share-create'\);/);
  assert.match(shell, /!create\.disabled&&\$\([^)]*share-created'\)\.hidden/);
});

test('한 창의 사진 올리기 중에도 같은 닫기 막기 규칙을 쓴다', () => {
  assert.match(shell, /panelBlocked:id=>id==='write-panel'&&\(uploads\.busy\|\|shellQuick\.uploads\?\.busy\)/);
  // 공통 틀의 머리 높이 측정은 panel() 호출 없이 직접 열 때도 맞는다(관찰자 + 항상 동기화).
  assert.match(dialogs, /syncPanelTop\(\);\n  document\.defaultView\?\.addEventListener\?\.\('resize', syncPanelTop\);/);
  assert.match(dialogs, /new ResizeObserver\(syncPanelTop\)\.observe\(headerBox\);/);
});
