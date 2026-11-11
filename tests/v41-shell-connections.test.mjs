import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

// 2026-11-09 재발 방지: 리팩터링 전 셸이 연결하던 요소 id 목록을 고정한다.
// 출처는 e508302(셸 분리 직전 main, shell.mjs 481줄)에서 `$('id').onclick|onchange|onsubmit|oninput|addEventListener`
// 형태로 잡은 39개다. #245에서 이 중 write-menu 연결이 옮겨지지 않아 운영에서 '순간 남기기'가 무반응이었다
// (로그인 상태에서만 보이는 버튼이라 로그아웃 postdeploy가 잡지 못했다).
const SHELL_CONNECTIONS = [
  'account-advanced', 'account-assets', 'account-assets-open', 'account-avatar', 'account-confirm',
  'account-entry', 'account-form', 'account-logout', 'account-open-settings', 'account-settings-open',
  'advanced-backup', 'advanced-import', 'change-parent', 'clear', 'delete-moment', 'editor-assets-open',
  'editor-cancel', 'empty-records', 'empty-sample', 'file', 'logout', 'mobile-more', 'moment-form',
  'record-menu', 'sample', 'server', 'share-copy', 'share-create', 'share-menu', 'share-moment',
  'share-preview', 'share-view', 'tree-cover', 'tree-delete', 'tree-form',
  'tree-tips-close', 'trees', 'write-menu'
];

const dir = new URL('../public/v41/', import.meta.url);
const shellSource = () => {
  let source = readFileSync(new URL('shell.mjs', dir), 'utf8');
  for (const name of readdirSync(new URL('shell/', dir))) {
    if (name.endsWith('.mjs')) source += readFileSync(new URL('shell/' + name, dir), 'utf8');
  }
  return source.replace(/\s+/g, '');
};

test('셸이 연결하던 요소는 지금도 셸·shell/ 안에서 연결을 갖는다', () => {
  const source = shellSource();
  // #380 4: tree-manager의 연결은 shell/dialogs.mjs의 dialog[data-lt-panel] 공통 틀(열기·닫기·Esc·바깥 클릭)로 옮겨갔다.
  // #380 4 2차: editor의 Esc·바깥 클릭·닫기 확인도 같은 공통 틀로 옮겨갔다(× 버튼과 취소 버튼은 그대로 연결돼 있다).
  // 그래서 두 id는 이 목록에서 빼고, 공통 틀 계약은 tests/v41-panel-mode.test.mjs·v41-shell-dialogs.test.mjs가 고정한다.
  const missing = SHELL_CONNECTIONS.filter(id => !new RegExp(`\\$\\('${id}'\\)\\??\\.(onclick|onchange|onsubmit|oninput|addEventListener)`).test(source));
  assert.deepEqual(missing, [], '연결이 사라진 요소: ' + missing.join(', '));
  assert.equal(SHELL_CONNECTIONS.length, 38);
});
