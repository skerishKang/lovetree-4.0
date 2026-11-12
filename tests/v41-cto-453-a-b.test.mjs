import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {headerPartsFor} from '../public/v41/header-state.mjs';

const readSource = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const shell = readSource('public/v41/shell.mjs');
const writePanel = readSource('public/v41/shell/write-panel.mjs');
const panels = readSource('public/v41/shell/panels.mjs');
const quickAdd = readSource('public/v41/shell/quick-add.mjs');

// #453 CTO 최종 점검 1차 — A(예시 모드 메뉴)·B(자세한 추가 가짜 더러움).

test('A: 예시를 둘러봐도 로그인한 계정은 남는다(메뉴가 사라지지 않는다)', () => {
  // 예시로 갈 때 셸 상태를 비우면(leaveMember) 로그인 계정이 사라져 트리 틀·순간 추가가 함께 숨었다.
  assert.ok(shell.includes("if(!member?.snapshot().owned){member?.dispose();member=null;return true;}member.dispose();return true;}"), '예시로 갈 때는 저장 연결만 끊고 계정 표시는 남긴다');
  assert.match(shell, /function sample\(selection=\{\},view\)\{if\(!pauseMember\(\)\)return;/, '예시 입구는 pauseMember를 쓴다');
  assert.doesNotMatch(shell, /function sample\([^)]*\)\{if\(!leaveMember\(\)\)return;/, '예시 입구에서 계정을 버리지 않는다');

  // 예시 트리(1권)를 들고 있는 로그인 상태에서는 트리 고르기·책·보드·지도·순간 추가가 모두 보인다.
  const parts = headerPartsFor({owned: true, treeCount: 1});
  assert.equal(parts.treePicker, true);
  assert.equal(parts.treeViews, true);
  assert.equal(parts.write, true);
  // 로그아웃 예시는 지금대로(내 트리가 아니므로) 보이지 않는다 — #213 결정 유지.
  assert.equal(headerPartsFor({owned: false, treeCount: 1}).treeViews, false);
});

test('A: 예시에서 순간 추가를 누르면 로그인 화면 대신 내 기록으로 돌아와 같은 창을 연다', () => {
  assert.match(shell, /function resumeMember\(intent\)\{resumeAfterStart=intent\|\|'write';return startMember\(\);\}/);
  assert.match(shell, /\$\('write-menu'\)\.onclick=\(\)=>\{if\(source!=='server'&&member\?\.snapshot\(\)\.owned\)\{void resumeMember\('write'\);return;\}shellQuick\.openWrite\(\);\}/);
  assert.match(shell, /if\(resumeAfterStart\)\{const intent=resumeAfterStart;resumeAfterStart=null;if\(intent==='write'\)shellQuick\.openWrite\(\);else openEditor\(intent\);\}/, '내 기록을 불러온 뒤에 이어서 연다');
  assert.match(quickAdd, /if \(deps\.getSource\(\) !== 'server'\) \{ deps\.resumeMember\?\.\('write'\); return false; \}/, '쉬운 추가 입구도 로그인으로 보내지 않는다');
  assert.match(panels, /if \(getSource\(\) !== 'server'\) \{ deps\.resumeMember\?\.\(requestedMode === 'edit' \? 'write' : requestedMode \|\| 'write'\); return; \}/, '자세한 추가 입구도 같다');
});

test('B: 자세한 추가를 처음 보일 때 기본값과 기준값을 한 번 잡는다', () => {
  const tidy = text => text.replace(/\r\n/g, '\n');
  const panelsLF = tidy(panels);
  const writePanelLF = tidy(writePanel);
  const quickAddLF = tidy(quickAdd);
  assert.match(writePanelLF, /let onTab = \(\) => \{\};/, '탭을 보일 때 셸에 알린다');
  assert.match(writePanelLF, /paint\(\);\n    onTab\(current\);/, '탭 전환마다 알린다');
  assert.match(panelsLF, /function onWriteTab\(tab\) \{\n    if \(tab !== 'detailed' \|\| formBaseline\) return;/, '기준값이 없을 때만 잡는다(쓴 뒤 탭을 오가도 기준값을 덮지 않는다)');
  assert.match(panelsLF, /if \(!form\.elements\.date\.value\) form\.elements\.date\.value = new Date\(\)\.toISOString\(\)\.slice\(0, 10\);/, '기본 날짜를 채운다');
  assert.match(panelsLF, /if \(!form\.elements\.emotion\.value\) form\.elements\.emotion\.value = '설렘';/, '기본 감정을 채운다');
  assert.match(panelsLF, /function startQuickSession\(\) \{\n    formBaseline = '';/, '＋ 순간 추가로 열 때 기준값을 비운다');
  assert.match(quickAddLF, /deps\.resetEditorBaseline\?\.\(\);\n    deps\.writePanel\.open\(\);/, '빠른 추가도 기준값을 비운 뒤 연다');
  assert.match(quickAddLF, /deps\.resetEditorBaseline\?\.\(\);\n    deps\.writePanel\.open\('easy'\);/, '빠른 추가(쉬운 탭)도 같다');
  assert.match(shell, /shellWrite\.setTabHook\(tab=>shellPanels\.onWriteTab\(tab\)\);/);
});
