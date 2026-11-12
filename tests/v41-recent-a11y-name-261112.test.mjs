// #449 — "마지막 순간" 카드의 접근 이름은 보이는 글자에서 온다(axe label-content-name-mismatch serious).
// aria-label을 부분적으로 쓰면(보이는 글자 일부만 포함) axe가 오히려 위반으로 잡는다(로컬 픽스처로 확인).
// 그래서 aria-label을 지우고 안쪽 보이는 글자(마지막 순간 · N일 전 / 제목 / 트리 · 이어 보기 →)로 이름을 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');

test('마지막 순간 카드: aria-label 없음 — 접근 이름은 보이는 글자(마지막 순간 · N일 전 · 제목 · 이어 보기)에서 온다', () => {
  assert.doesNotMatch(orbit, /class="recent-card[^>]*aria-label/, '카드에 aria-label을 다시 붙이지 않는다');
  // 보이는 글자가 그대로 이름이 되려면 안쪽 글자가 마크업에 있어야 한다.
  assert.match(orbit, /<small>마지막 순간\$\{days===null\?'':` · \$\{days\}일 전`\}<\/small>/);
  assert.match(orbit, /<strong>\$\{esc\(head\)\}<\/strong>/);
  assert.match(orbit, / · 이어 보기 →<\/small>/);
});

test('▶ 재생 단추는 자기 이름을 따로 유지한다(여기서 재생 ↔ 정지)', () => {
  assert.match(orbit, /class="recent-play" data-recent-play aria-label="여기서 재생"/);
  assert.match(orbit, /btn\.setAttribute\('aria-label','정지'\)/);
  assert.match(orbit, /btn\.setAttribute\('aria-label','여기서 재생'\)/);
});

test('키보드(Enter·Space)로 열기 · 카드 누르면 그 순간 열기 동작을 유지한다', () => {
  assert.match(orbit, /shadow\.addEventListener\('keydown',e=>\{if\(e\.key!=='Enter'&&e\.key!==' '\)return;if\(e\.target\.matches\?\.\('\[data-do=recent\]'\)\)\{e\.preventDefault\(\);openRecent\(\);\}\}/);
  assert.match(orbit, /e\.target\.closest\?\.\('\[data-do=recent\]'\)\)openRecent\(\);return;/);
  assert.match(orbit, /const openRecent=\(\)=>\{if\(!recentMoment\)return;if\(onOpen&&!recentMoment\.example\)\{onOpen\(recentMoment\);return;\}/);
});
