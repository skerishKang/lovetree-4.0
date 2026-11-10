// #346 2단계: a11y 로그인 상태 검사용 시험 자료(트리 3권)와 도구 배선 시험.
// 빈 계정이면 안쪽 화면이 빈 패널로 대체되어 검사가 조용히 빠지던 문제를 막는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFixtureState, needsFixture } from '../tools/a11y/fixture.mjs';
import { validateState } from '../public/v41/domain.mjs';

const RUN = fs.readFileSync(new URL('../tools/a11y/a11y-run.mjs', import.meta.url), 'utf8');
const README = fs.readFileSync(new URL('../tools/a11y/README.md', import.meta.url), 'utf8');

test('needsFixture: 빈 계정만 자료를 넣는다', () => {
  assert.equal(needsFixture([]), true);
  assert.equal(needsFixture([{ id: 't' }]), false);
  assert.equal(needsFixture(null), false);
  assert.equal(needsFixture(undefined), false);
});

test('buildFixtureState: 저장 규칙을 통과하고, 트리 3권 × 순간 3개(시작 1 + 연결 2)다', () => {
  const state = buildFixtureState('2026-11-10T00:00:00.000Z');
  const safe = validateState(state);
  assert.equal(safe.trees.length, 3);
  for (const tree of safe.trees) {
    assert.equal(tree.moments.length, 3);
    assert.equal(tree.moments.filter((m) => m.parentId === null).length, 1, '시작 순간은 하나');
    assert.equal(tree.moments.filter((m) => m.parentId !== null).length, 2, '연결 2개');
    assert.ok(tree.moments.some((m) => m.id === tree.coverMomentId), '표지는 트리 안의 순간');
    assert.ok(tree.moments.every((m) => m.date === '2026-11-10'));
  }
  const ids = safe.trees.flatMap((t) => [t.id, ...t.moments.map((m) => m.id)]);
  assert.equal(new Set(ids).size, ids.length, 'id는 겹치지 않는다');
});

test('배선: 로그인 검사 전에만 자료를 준비하고, 끝나면 되돌리며, 건너뜀을 센다', () => {
  assert.match(RUN, /import \{ buildFixtureState, needsFixture \} from '\.\/fixture\.mjs'/, '계산 한 벌을 쓴다');
  assert.ok(RUN.indexOf('const states =') < RUN.indexOf("if (states.includes('in'))"), 'states 선언 뒤에 준비한다(TDZ)');
  assert.match(RUN, /if \(states\.includes\('in'\)\) \{[\s\S]*?ensureFixture\(browser, options, storage\)/, '로그인 상태에서만 준비');
  assert.match(RUN, /await fixture\.restore\(\)/, '검사 뒤 복원 호출');
  assert.match(RUN, /skippedScreens \+= 1/, '화면이 열리지 않은 횟수를 센다');
  assert.match(RUN, /건너뜀 \$\{skipped \+ skippedScreens\}/, '요약에 실제 건너뜀 수를 보여 준다');
  assert.match(RUN, /skippedScreens,/, '보고서에도 남긴다');
  assert.match(README, /자동으로 넣고, 검사가 끝나면 원래\(빈\) 상태로 되돌린다/, 'README가 같은 절차를 말한다');
});
