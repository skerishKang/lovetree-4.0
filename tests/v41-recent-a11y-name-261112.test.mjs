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
  // #549: 'N일 전'은 '오늘'·'어제'로 바뀌었고(relativeDayLabel), 접근 이름은 여전히 보이는 글자에서 온다.
  assert.match(orbit, /<small>마지막 순간\$\{days===null\?'':` · \$\{relativeDayLabel\(days\)\}`\}<\/small>/);
  assert.match(orbit, /<strong>\$\{esc\(head\)\}<\/strong>/);
  assert.match(orbit, / · 이어 보기 →<\/small>/);
});

test('▶ 재생 단추는 자기 이름을 따로 유지한다(여기서 재생 ↔ 정지)', () => {
  assert.match(orbit, /class="recent-play" data-recent-play aria-label="여기서 재생"/);
  assert.match(orbit, /btn\.setAttribute\('aria-label','정지'\)/);
  assert.match(orbit, /btn\.setAttribute\('aria-label','여기서 재생'\)/);
});

test('키보드(Enter·Space)로 열기 · 카드 누르면 그 순간 열기 동작을 유지한다', () => {
  // 이슈 #466 M6: 열기는 실제 <button>(recent-open)이 전담해 Enter·Space는 네이티브 동작으로 처리된다
  // — div에 역할을 주고 수동으로 Enter·Space를 가로채던 것(중첩 상호작용의 원인)은 없앴다.
  assert.match(orbit, /<button type="button" class="recent-open" data-do="recent"/);
  assert.doesNotMatch(orbit, /shadow\.addEventListener\('keydown',e=>\{if\(e\.key!=='Enter'&&e\.key!==' '\)/);
  assert.match(orbit, /e\.target\.closest\?\.\('\[data-do=recent\]'\)\)openRecent\(\);return;/);
  assert.match(orbit, /const openRecent=\(\)=>\{if\(!recentMoment\)return;if\(onOpen&&!recentMoment\.example\)\{onOpen\(recentMoment\);return;\}/);
});
