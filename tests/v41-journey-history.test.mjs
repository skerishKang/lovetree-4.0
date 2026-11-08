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

// 7번(셸 연결 10줄)은 2026-11-09에 함수 시험으로 옮겼다.
//  · popstate/hashchange 표·중복 처리·감시 등록 → tests/v41-journey-flow.test.mjs (createLocation + fakeBrowser)
//  · 단계 기록 push/replace·닫기 go(-depth)·저장 뒤 첫 화면 → 같은 파일의 createJourney 표(3차)
test('주소 단계와 임시 보관값이 만나 시작 단계가 정해진다(화면 규칙을 함수로 고정)', () => {
  const startStep = (hash, stored) => {
    const route = parseJourneyRoute(hash);
    if (!route) return null;
    if (!stored) return 0;
    return journeyResumeStep(stored);
  };
  const empty = {subject: 'x', url: ''};
  assert.equal(startStep('#journey/02', draft({step: 2})), 2, '보관값이 있으면 주소 단계를 따른다');
  assert.equal(startStep('#journey/02', null), 0, '보관값이 없으면 00부터 시작한다');
  assert.equal(startStep('#journey/04', draft({step: 1, savedTreeId: 't', savedMomentId: 'm'})), 3, '이미 만든 트리 아래로는 내려가지 않는다');
  assert.equal(startStep('#home', draft({step: 2})), null, '여정 주소가 아니면 시작 단계가 없다');
  assert.equal(journeyDraftHasContent({...empty, subject: ''}), false, '빈 보관값은 내용 없음');
});

// 8번(여정 화면 인라인 스크립트 8줄)은 2026-11-09에 함수 시험으로 옮겼다.
//  · 단계 알림(lt41-journey-step)·goto 복귀(입력 유지)·단계 탭·주소 단계/보관값 복원·
//    #journey/NN 기록·단독 닫기 → tests/v41-journey-page.test.mjs
//    (public/v41/views/journey/journey-page.mjs의 createJourneyPage를 가짜 문서로 띄운다)
