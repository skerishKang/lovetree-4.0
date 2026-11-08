import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  JOURNEY_ROUTE_PREFIX, journeyRouteHash, parseJourneyRoute, journeyResumeStep,
  journeyRouteDecision, normalizeJourneyDraft, journeyDraftHasContent,
} from '../public/v41/first-journey.mjs';

// 2026-11-08 첫 여정 뒤로가기: 단계 기록·popstate 복귀·밖으로 나가기·저장 뒤 이동을 고정한다.

const draft = extra => normalizeJourneyDraft({
  subject: '그날의 무대',
  url: 'https://www.youtube.com/watch?v=nqofkzQD19E',
  ...extra,
});

test('단계마다 #journey/00~04 기록을 만들고 범위를 넘지 않는다', () => {
  assert.equal(JOURNEY_ROUTE_PREFIX, '#journey/');
  assert.deepEqual([0, 1, 2, 3, 4].map(journeyRouteHash), ['#journey/00', '#journey/01', '#journey/02', '#journey/03', '#journey/04']);
  assert.equal(journeyRouteHash(9), '#journey/04');
  assert.equal(journeyRouteHash(-2), '#journey/00');
  assert.equal(journeyRouteHash('03'), '#journey/03');
  assert.deepEqual(parseJourneyRoute('#journey/02'), {step: 2, index: '02'});
  assert.deepEqual(parseJourneyRoute('#journey/00'), {step: 0, index: '00'});
  for (const hash of ['#journey/05', '#journey/0', '#journey/', '#my/book', '#home', '', null, undefined]) {
    assert.equal(parseJourneyRoute(hash), null, `${hash}는 첫 여정 기록이 아니다`);
  }
});

test('새로고침은 기록한 단계로 열고, 임시 보관값이 없으면 00으로 간다', () => {
  assert.equal(journeyResumeStep(null), 0);
  assert.equal(journeyResumeStep({}), 0);
  assert.equal(journeyResumeStep(draft({step: 2})), 2);
  assert.equal(journeyResumeStep(draft({step: 4})), 4);
  assert.equal(journeyResumeStep(draft({step: 1, savedTreeId: 'tree-1', savedMomentId: 'moment-1'})), 3, '이미 만든 트리는 성장 단계 아래로 내려가지 않는다');
  assert.equal(journeyResumeStep(draft({step: 99})), 4);
  assert.equal(journeyDraftHasContent(draft()), true);
});

test('popstate가 단계 기록이면 그 단계로 돌아간다', () => {
  assert.deepEqual(journeyRouteDecision({hash: '#journey/01', open: true}), {action: 'goto', step: 1});
  assert.deepEqual(journeyRouteDecision({hash: '#journey/04', open: true}), {action: 'goto', step: 4});
  assert.deepEqual(journeyRouteDecision({hash: '#journey/00', open: false}), {action: 'open', step: 0}, '직접 주소·새로고침은 그 단계로 연다');
});

test('첫 여정 밖 기록이면 닫고, 닫힌 상태의 다른 해시는 건드리지 않는다', () => {
  assert.deepEqual(journeyRouteDecision({hash: '#home', open: true}), {action: 'leave', step: null});
  assert.deepEqual(journeyRouteDecision({hash: '#my/book?tree=t&moment=m', open: true}), {action: 'leave', step: null});
  assert.deepEqual(journeyRouteDecision({hash: '#book', open: false}), {action: 'ignore', step: null});
  assert.deepEqual(journeyRouteDecision({}), {action: 'ignore', step: null});
});

test('저장이 끝난 뒤 뒤로가기는 성장 단계로 다시 들어가지 않고 첫 화면으로 간다', () => {
  assert.deepEqual(journeyRouteDecision({hash: '#journey/04', open: false, saved: true}), {action: 'finished', step: null});
  assert.deepEqual(journeyRouteDecision({hash: '#journey/03', open: false, saved: true}), {action: 'finished', step: null});
  assert.deepEqual(journeyRouteDecision({hash: '#journey/04', open: false}), {action: 'open', step: 4}, '저장 전에는 04로 열 수 있다');
});

test('셸은 기록·복귀·닫기·저장 뒤 이동을 이 규칙에 연결한다', () => {
  // #231 1-B③-3: 여정 연결은 shell/journey.mjs, lt41-* 수신은 shell/messages.mjs로 옮겼다.
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8')
    + readFileSync(new URL('../public/v41/shell/journey.mjs', import.meta.url), 'utf8')
    + readFileSync(new URL('../public/v41/shell/messages.mjs', import.meta.url), 'utf8');
  assert.match(shell, /journeyRouteDecision\(\{hash:location\.hash,open:current==='first-journey\.html',saved:shellJourney\.saved\(\)\}\)/);
  assert.match(shell, /function writeJourneyLocation\(step, mode = 'push'\)/);
  assert.match(shell, /history\[mode === 'replace' \? 'replaceState' : 'pushState'\]\(mode === 'replace' \? history\.state : \{lt41Journey: depth \+ 1\}/);
  assert.match(shell, /type === 'lt41-journey-step'/);
  assert.match(shell, /type: 'lt41-journey-goto'/);
  assert.match(shell, /function closeFirstJourney\(\) \{[\s\S]*?history\.go\(-depth\)/);
  assert.match(shell, /function finishJourney\(\) \{[\s\S]*?show\('src064-orbit\.html', false\);\s*history\.replaceState\(null, '', '#home'\)/, '저장 뒤 뒤로가기는 첫 화면으로 나간다');
  assert.match(shell, /journeySaved = true;\s*setCurrent\('track59-sketchbook\.html'\)/, '저장을 마치고 기억책으로 갈 때 완료로 표시한다');
  assert.match(shell, /const startupJourney=parseJourneyRoute\(location\.hash\)/, '새로고침은 #journey/NN을 다시 연다');
  assert.match(shell, /openFirstJourney\(\{step:startupJourney\.step,route:true\}\)/);
});

test('여정 화면은 단계를 셸에 알리고, 되돌아갈 단계는 입력을 유지한 채 다시 그린다', () => {
  const html = readFileSync(new URL('../public/v41/views/first-journey.html', import.meta.url), 'utf8');
  assert.match(html, /post\(\{type: 'lt41-journey-step', step: state\.step\}\)/);
  assert.match(html, /event\.data\?\.type === 'lt41-journey-goto'\) \{ goToStep\(event\.data\.step\)/);
  assert.match(html, /function goToStep\(value\) \{\n  readForm\(\);/, '단계 복귀 전에 입력을 읽어 둔다');
  assert.match(html, /Number\.parseInt\(params\.get\('step'\) \|\| '', 10\)/, '주소의 단계를 읽는다');
  assert.match(html, /state\.step = stored[\s\S]{0,220}: 0;/, '임시 보관값이 없으면 00이다');
  assert.match(html, /\$\('steps'\)\.addEventListener\('click'/, '단계 탭도 같은 기록 규칙을 따른다');
  assert.match(html, /if \(hashRoute && !readJourneyDraft\(storage\)\) \{/, '임시 보관값이 없으면 #journey/NN이어도 00부터 시작한다');
  assert.match(html, /location\.assign\('\/v41\/'\)/, '단독 미리보기 닫기는 첫 화면으로 간다');
});
