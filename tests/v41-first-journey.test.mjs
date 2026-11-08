import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  JOURNEY_STEPS, JOURNEY_LAST_STEP, JOURNEY_STORAGE_KEY,
  emptyJourneyDraft, normalizeJourneyDraft, journeyDraftHasContent,
  readJourneyDraft, writeJourneyDraft, clearJourneyDraft, journeyRestoreQuestion,
  persistJourneyDraft, finishJourneyDraft, discardFinishedJourneyDraft,
  nextJourneyStep, previousJourneyStep, journeyStepProblem, journeySavePlan,
  journeyPreviewTitle, journeyEntry,
} from '../public/v41/first-journey.mjs';

// 2026-11-07 새 트리 만들기 = 첫 여정. 단계·검증·저장 인자·진입 경로·임시 보관을 고정한다.

const draft = extra => normalizeJourneyDraft({
  subject: '그날의 무대',
  url: 'https://www.youtube.com/watch?v=nqofkzQD19E',
  note: '우연히 보게 됐는데 하루 종일 생각났어.',
  emotion: '위로',
  date: '2026-11-07',
  reason: '다시 봐도 그 표정이 오래 남아서',
  nextUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  nextReason: '댓글을 따라 찾아봤어요',
  ...extra,
});

test('단계는 00~04 다섯 개이고 앞뒤 이동은 범위를 넘지 않는다', () => {
  assert.deepEqual(JOURNEY_STEPS.map(step => step.index), ['00', '01', '02', '03', '04']);
  assert.deepEqual(JOURNEY_STEPS.map(step => step.label), ['트리 이름', '첫 순간', '마음 남기기', '다음 영상 잇기', '성장']);
  assert.equal(JOURNEY_LAST_STEP, 4);
  assert.equal(nextJourneyStep(0), 1);
  assert.equal(nextJourneyStep(4), 4);
  assert.equal(nextJourneyStep(99), 4);
  assert.equal(previousJourneyStep(4), 3);
  assert.equal(previousJourneyStep(0), 0);
  assert.equal(previousJourneyStep(-3), 0);
});

test('단계별 필수 입력은 트리 이름 → 첫 링크 → 다음 링크 순서다', () => {
  assert.equal(journeyStepProblem(0, emptyJourneyDraft()), '좋아하는 대상을 적어 주세요.');
  assert.equal(journeyStepProblem(0, draft()), '');
  assert.equal(journeyStepProblem(1, emptyJourneyDraft()), '첫 순간의 링크나 사진 주소를 넣어 주세요.');
  assert.equal(journeyStepProblem(1, draft({url: 'ftp://example.com/a.png'})), 'http 또는 https 링크만 사용할 수 있어요.');
  assert.equal(journeyStepProblem(1, draft()), '');
  assert.notEqual(normalizeJourneyDraft(draft({date: '2026-02-31'})).date, '2026-02-31', '잘못된 시점은 오늘로 되돌린다');
  assert.equal(journeyStepProblem(2, draft()), '');
  assert.equal(journeyStepProblem(3, draft({nextUrl: ''})), '다음 링크를 넣거나 나중에 잇기를 눌러 주세요.');
  assert.equal(journeyStepProblem(3, draft({nextUrl: '', skipped: true})), '', '나중에 잇기는 다음 링크 없이 통과한다');
  assert.equal(journeyStepProblem(3, draft()), '');
  assert.equal(journeyStepProblem(4, draft()), '');
});

test('저장 계획은 트리 하나와 첫 순간, 이어진 두 번째 순간을 기존 도메인 입력으로 만든다', () => {
  const plan = journeySavePlan(draft());
  assert.ok(plan.first, '트리와 첫 순간을 만드는 입력이 있다');
  assert.equal(plan.first.subject, '그날의 무대');
  assert.equal(plan.first.url, 'https://www.youtube.com/watch?v=nqofkzQD19E');
  assert.equal(plan.first.emotion, '위로');
  assert.equal(plan.first.date, '2026-11-07');
  assert.equal(plan.first.note, '다시 봐도 그 표정이 오래 남아서', '02의 이유가 마음 한마디보다 먼저 쓰인다');
  assert.equal('id' in plan.first, false, 'id는 도메인 createTree가 만든다');
  assert.equal('parentId' in plan.first, false);
  assert.equal('links' in plan.first, false, '관련 연결 필드를 새로 만들지 않는다');

  assert.ok(plan.second, '03은 두 번째 순간 입력을 만든다');
  assert.equal(plan.second.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(plan.second.relation, '댓글을 따라 찾아봤어요', '연결 이유는 기존 relation 필드에 담는다');
  assert.equal('parentId' in plan.second, false, '부모는 셸이 첫 순간 id로 넘긴다');
  assert.equal(plan.treeId, '');
  assert.equal(plan.momentId, '');

  const fallback = journeySavePlan(draft({reason: ''}));
  assert.equal(fallback.first.note, '우연히 보게 됐는데 하루 종일 생각났어.', '이유가 없으면 01의 마음 한마디를 쓴다');
  assert.equal(journeyPreviewTitle(draft()), '다시 봐도 그 표정이 오래 남아서');
});

test('나중에 잇기는 두 번째 순간을 만들지 않는다', () => {
  const plan = journeySavePlan(draft({skipped: true}));
  assert.ok(plan.first);
  assert.equal(plan.second, null);
  assert.deepEqual(journeySavePlan(draft({skipped: true, nextUrl: ''})).second, null);
});

test('이미 저장된 트리에서는 다시 트리를 만들지 않고 이어진 순간만 추가한다', () => {
  const plan = journeySavePlan(draft({savedTreeId: 'tree-1', savedMomentId: 'moment-1'}));
  assert.equal(plan.first, null, '중간에 닫았다 이어도 트리를 두 번 만들지 않는다');
  assert.equal(plan.treeId, 'tree-1');
  assert.equal(plan.momentId, 'moment-1');
  assert.equal(plan.second.relation, '댓글을 따라 찾아봤어요');
});

test('진입 경로: 로그아웃=로그인, 편집 불가=기록 패널, 새 트리=첫 여정, 추가·수정=기존 패널', () => {
  assert.deepEqual(journeyEntry({owned: false}), {screen: 'login', reason: 'signed-out'});
  assert.deepEqual(journeyEntry({owned: true, writable: false}), {screen: 'records', reason: 'not-writable'});
  assert.equal(journeyEntry({owned: true, writable: true, mode: 'new'}).screen, 'journey');
  assert.equal(journeyEntry({owned: true, writable: true, mode: 'add'}).screen, 'panel');
  assert.equal(journeyEntry({owned: true, writable: true, mode: 'edit'}).screen, 'panel');
  assert.equal(journeyEntry().screen, 'login', '기본값은 로그아웃이다');
});

test('임시 보관은 저장·복원되고 이어서 쓸지 묻는 문구를 만든다', () => {
  const memory = new Map();
  const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
  assert.equal(readJourneyDraft(storage), null);
  assert.equal(writeJourneyDraft(storage, draft({step: 3})), true);
  assert.equal(memory.has(JOURNEY_STORAGE_KEY), true);
  const restored = readJourneyDraft(storage);
  assert.equal(restored.subject, '그날의 무대');
  assert.equal(restored.nextReason, '댓글을 따라 찾아봤어요');
  assert.equal(restored.step, 3);
  assert.equal(journeyDraftHasContent(restored), true);
  assert.match(journeyRestoreQuestion(restored), /그날의 무대/);
  assert.equal(journeyRestoreQuestion(emptyJourneyDraft()), '');
  assert.equal(clearJourneyDraft(storage), true);
  assert.equal(readJourneyDraft(storage), null);
});

test('깨진 임시 값과 저장소 오류는 화면을 멈추지 않는다', () => {
  const broken = {getItem: () => '{not json'};
  assert.equal(readJourneyDraft(broken), null);
  assert.equal(readJourneyDraft({getItem: () => JSON.stringify({subject: '  '})}), null, '빈 값은 복원하지 않는다');
  const throwing = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); }};
  assert.equal(readJourneyDraft(throwing), null);
  assert.equal(writeJourneyDraft(throwing, draft()), false);
  assert.equal(clearJourneyDraft(throwing), false);
  assert.equal(readJourneyDraft(null), null);
});

test('완료한 여정은 임시값을 지우고 pagehide 뒤에도 다시 저장하지 않는다', () => {
  const memory = new Map();
  const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
  const completed = draft({step: 4, savedTreeId: 'tree-1', savedMomentId: 'moment-1'});
  assert.equal(writeJourneyDraft(storage, completed), true);
  assert.equal(finishJourneyDraft(storage), true);
  assert.equal(readJourneyDraft(storage), null);
  assert.equal(memory.has(JOURNEY_STORAGE_KEY), false, '완료 즉시 임시값이 없다');
  assert.equal(persistJourneyDraft(storage, completed, {completed: true}), false, '완료 뒤 pagehide는 쓰지 않는다');
  assert.equal(memory.has(JOURNEY_STORAGE_KEY), false);
  assert.equal(journeyRestoreQuestion(readJourneyDraft(storage)), '', '복원 안내가 없다');
});

test('새 여정은 완료 표시가 남은 이전 임시값을 버리고, 중간에 닫은 값은 남긴다', () => {
  const memory = new Map();
  const storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
  const stale = draft({step: 4, savedTreeId: 'tree-1', savedMomentId: 'moment-1'});
  writeJourneyDraft(storage, stale);
  finishJourneyDraft(storage);
  writeJourneyDraft(storage, stale);
  assert.equal(discardFinishedJourneyDraft(storage), true, '완료 표시를 새 여정이 소비한다');
  assert.equal(readJourneyDraft(storage), null);
  assert.equal(journeyRestoreQuestion(readJourneyDraft(storage)), '', '완료된 값은 복원 안내를 만들지 않는다');
  writeJourneyDraft(storage, draft({step: 2}));
  persistJourneyDraft(storage, draft({step: 2}), {completed: false});
  assert.match(journeyRestoreQuestion(readJourneyDraft(storage)), /그날의 무대/, '중간에 닫은 값은 남는다');
});

test('복원 값은 길이·단계·저장 id만 안전하게 되살린다', () => {
  const restored = normalizeJourneyDraft({step: 99, subject: 'x'.repeat(80), emotion: '없는감정', savedTreeId: 'tree-1', savedMomentId: '', extra: '무시'});
  assert.equal(restored.step, 4);
  assert.equal(restored.subject.length, 60);
  assert.equal(restored.emotion, '없는감정', '가져온 감정은 바꾸지 않는다(도메인 규칙)');
  assert.equal(restored.savedTreeId, '', '트리와 순간 id가 둘 다 있어야 저장된 것으로 본다');
  assert.equal('extra' in restored, false);
});

test('첫 여정 화면은 --lt-* 토큰만 쓰고 새 hex·단어 중간 줄바꿈이 없다', () => {
  const html = readFileSync(new URL('../public/v41/views/first-journey.html', import.meta.url), 'utf8');
  assert.match(html, /first-journey\.mjs/);
  assert.match(html, /identity\.css/);
  assert.match(html, /Pretendard|--lt-ui/, '글꼴은 공통 Pretendard를 쓴다');
  assert.match(html, /word-break:keep-all/);
  for (const token of ['--lt-stage', '--lt-pearl', '--lt-gold-line', '--lt-rose']) assert.match(html, new RegExp(token));
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(html), false, '새 hex 색을 쓰지 않는다');
  assert.equal(/<header[^>]*class="(topbar|brand)"|MEMORY ORBIT/.test(html), false, '화면 안에 자체 머리글·워드마크를 두지 않는다');
  for (const label of ['트리 이름', '첫 순간', '마음 남기기', '다음 영상 잇기', '성장']) assert.match(html, new RegExp(label));
  assert.match(html, /피어났어요/);
  assert.match(html, /이어졌어요/);
  assert.match(html, /discardFinishedJourneyDraft\(storage\)/, '새 여정은 완료된 이전 임시값을 버린다');
  assert.match(html, /state\.completed = true;/, '완료 플래그를 세운다');
  assert.match(html, /function saveDraftBeforeLeave\(\)/, 'pagehide·visibilitychange를 같은 완료 가드로 묶는다');
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.equal(/(?<!text-)transform\s*:/.test(style), false, '전환은 transform이 아니라 페이드다');
});

// 셸 연결(새 트리 → 첫 여정, 저장·기억책 열기·뒤로가기)은 2026-11-09에
// 소스 글자에서 함수 직접 호출로 옮겼다 → tests/v41-journey-flow.test.mjs
