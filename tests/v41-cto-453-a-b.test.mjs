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

  // 예시 트리(1권)를 들고 있는 로그인 상태에서는 트리 고르기·책·보드·지도·순간 추가가 모두 보인다.
  const parts = headerPartsFor({owned: true, treeCount: 1});
  assert.equal(parts.treePicker, true);
  assert.equal(parts.treeViews, true);
  assert.equal(parts.write, true);
  // 로그아웃 예시는 지금대로(내 트리가 아니므로) 보이지 않는다 — #213 결정 유지.
  assert.equal(headerPartsFor({owned: false, treeCount: 1}).treeViews, false);
});

test('B: 자세한 추가를 처음 보일 때 기본값과 기준값을 한 번 잡는다', () => {
  const tidy = text => text.replace(/\r\n/g, '\n');
  const panelsLF = tidy(panels);
  const writePanelLF = tidy(writePanel);
  const quickAddLF = tidy(quickAdd);
  assert.match(writePanelLF, /let onTab = \(\) => \{\};/, '탭을 보일 때 셸에 알린다');
  assert.match(writePanelLF, /paint\(\);\n    onTab\(current\);/, '탭 전환마다 알린다');
  assert.match(panelsLF, /function onWriteTab\(tab\) \{\n    if \(tab !== 'detailed' \|\| formBaseline\) return;/, '기준값이 없을 때만 잡는다(쓴 뒤 탭을 오가도 기준값을 덮지 않는다)');
  // #547: '오늘'은 기기의 지역 날짜로 채운다(예전에는 UTC 날짜라 새벽에 하루 전이 찍혔다).
  // #627: 자동으로 채운 무대 날짜에는 안내를 붙인다(같은 한 줄에서 기준값을 잡는 동작은 그대로다).
  assert.match(panelsLF, /if \(!form\.elements\.date\.value\) \{ form\.elements\.date\.value = localDateOnly\(\); \$\('stage-date-hint'\)\.hidden = false; \}/, '기본 날짜를 채운다(기기의 오늘)');
  assert.match(panelsLF, /if \(!form\.elements\.emotion\.value\) form\.elements\.emotion\.value = '설렘';/, '기본 감정을 채운다');
  assert.match(panelsLF, /function startQuickSession\(\) \{[^}]*\n    formBaseline = '';/, '＋ 순간 추가로 열 때 기준값을 비운다(#462: 남은 수정 상태도 먼저 비운다)');
  // 이슈 671: openWrite가 목적지(그 순간 다음) 준비를 사이에 두게 됐다 — 기준값을 비운 뒤 창을 여는 순서는 그대로다.
});
