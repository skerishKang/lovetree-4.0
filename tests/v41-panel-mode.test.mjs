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
  assert.match(html, /<dialog id="cleanup-panel" data-lt-panel="full" data-lt-return="cleanup-menu" aria-labelledby="cleanup-title">/);
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
  assert.match(html, /data-lt-return="cleanup-menu"/);
  assert.match(html, /data-lt-return="record-menu"/);
  // dialog 'open' 이벤트는 환경마다 시점이 달라 쓰지 않는다 — 셸 panel()이 showModal 직전에 기록한다.
  assert.match(dialogs, /noteOpener: id => \{ const d = \$\(id\); if \(d\?\.dataset\?\.ltPanel\) openers\.set\(d, document\.activeElement\); \}/);
  assert.match(dialogs, /const opener = openers\.get\(d\);/);
  assert.match(dialogs, /const fallback = d\.dataset\.ltReturn \? document\.getElementById\(d\.dataset\.ltReturn\) : null;/);
  assert.match(dialogs, /const target = focusReturnTarget\(opener, fallback\);/);
  assert.match(dialogs, /setTimeout\(\(\) => target\?\.focus\?\.\(\), 0\)/);
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

test('편집기와 순간 잇기는 전체 화면 모양을 태그로 받는다', () => {
  assert.match(html, /<dialog id="editor" data-lt-panel="full" data-lt-return="write-menu" aria-labelledby="editor-title">/);
  assert.match(html, /<dialog id="connection-panel" data-lt-panel="full" aria-labelledby="connection-title">/);
  // 전체 화면이 된 뒤에도 오른쪽 패널 시절의 고정 폭이 남으면 안 된다(id 선택자가 data-lt-panel 규칙을 이긴다).
  assert.doesNotMatch(css, /#editor\{width:480px\}/);
  assert.match(css, /dialog\[data-lt-panel=full]\{inset:var\(--lt-panel-top,66px\) 0 0 0;/);
});

test('공통 틀은 편집기·순간 잇기의 더러움 판정을 셸에서 받는다', () => {
  assert.match(dialogs, /PANEL_DIRTY\['editor'\] = \(\) => deps\.isEditorDirty\?\.\(\) === true;/);
  assert.match(dialogs, /PANEL_DIRTY\['connection-panel'\] = \(\) => deps\.isConnectionDirty\?\.\(\) === true;/);
  assert.match(shell, /isEditorDirty:\(\)=>shellPanels\.formDirty\(\)/);
  assert.match(shell, /isConnectionDirty:\(\)=>connectionDirty\(\)/);
  // 편집기 더러움은 제목·메모·주소·사진·고른 연결이 모두 들어 있는 폼 기준값 비교(formDirty)를 그대로 쓴다.
  assert.match(panels, /new URLSearchParams\(new FormData\(\$\('moment-form'\)\)\)\.toString\(\) !== formBaseline/);
});

test('편집기 규칙이 공통 틀보다 우선한다 — 업로드 중에는 Esc·바깥 클릭·× 모두 닫지 않는다', () => {
  assert.match(dialogs, /const message = deps\.panelBlocked\?\.\(d\.id\) \|\| '';/);
  assert.match(dialogs, /if \(panelBlockedMessage\(d\)\) return false;/);
  assert.match(shell, /panelBlocked:id=>id==='editor'&&uploads\.busy\?'파일 전송을 마치거나 취소해 주세요\.':''/);
  // 저장 중 이중 저장 방지(업로드·저장 중 제출 무시)는 그대로다.
  assert.match(panels, /if \(getUploads\(\)\.busy\) return;/);
  // 편집기 Esc 확인은 공통 틀 한 벌만 남는다(두 번 묻지 않게).
  assert.doesNotMatch(panels, /작성 중인 입력을 버리고 닫을까요\?/);
  assert.doesNotMatch(shell, /작성 중인 입력을 버리고 닫을까요\?/);
});

test('편집기의 취소 버튼도 공통 닫기 규칙을 쓴다', () => {
  assert.match(panels, /\$\('editor-cancel'\)\.onclick = \(\) => \{ requestClose\?\.\('editor'\); \};/);
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
  assert.match(panels, /setEditorMode\(mode, parentId\);\n    panel\('editor'\);/);
  assert.match(shell, /writable:source==='server'&&!!member\?\.snapshot\(\)\.writable/);
});
