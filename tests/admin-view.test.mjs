import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  STATUS_ORDER, PERSONA_FIELDS,
  richParagraph, formatTime, parseHash, viewHash, viewToTab,
  filterRows, statusTabs, kindTabs, STATUS_LABEL,
  linkedIssueNumbers, normalizeIssueNumber, issueStateLabel, needsFixButton,
  statusChangeMessage, buildIssueUrl, issueLink, escapeText, statsCards,
  journalsSummary, journalRowsByCustomer, journalStage,
  isPendingStatus, overviewModel, overviewTodos
} from '../src/admin-view.js';

test('주소 해시를 화면 상태로 바꾼다(#564 2)', () => {
  // #655: 운영센터를 열면(주소 없이) '한눈에'가 기본이다. 기존 주소(#board 등)는 그대로다.
  assert.deepEqual(parseHash(''), {view: 'overview', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#overview'), {view: 'overview', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#board'), {view: 'board', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#reports'), {view: 'reports', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#issues'), {view: 'issues', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#feedback/abc'), {view: 'feedback', id: 'abc', status: '', kind: ''});
  assert.deepEqual(parseHash('#persona/고객-01'), {view: 'persona', id: '고객-01', status: '', kind: ''});
  // 모르는 모양은 목록으로 돌린다.
  assert.deepEqual(parseHash('#unknown'), {view: 'board', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#feedback/'), {view: 'board', id: null, status: '', kind: ''});
  // id에 /가 들어가도 잃지 않는다.
  assert.deepEqual(parseHash('#feedback/a/b'), {view: 'feedback', id: 'a/b', status: '', kind: ''});
});

test('탭 거르기를 주소에 남기고 되돌린다(#570 2)', () => {
  assert.deepEqual(parseHash('#board?status=reviewing'), {view: 'board', id: null, status: 'reviewing', kind: ''});
  assert.deepEqual(parseHash('#board?kind=opinion'), {view: 'board', id: null, status: '', kind: 'opinion'});
  assert.deepEqual(parseHash('#board?status=reviewing&kind=opinion'), {view: 'board', id: null, status: 'reviewing', kind: 'opinion'});
  // 모르는 값은 버린다.
  assert.deepEqual(parseHash('#board?status=bogus'), {view: 'board', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#board?kind=journal&x=1'), {view: 'board', id: null, status: '', kind: 'journal'});
  // 상세 주소에는 탭 상태가 따라가지 않는다.
  assert.deepEqual(parseHash('#feedback/6?status=closed'), {view: 'feedback', id: '6', status: '', kind: ''});
  assert.equal(viewHash('board', null, {status: 'reviewing', kind: 'opinion'}), '#board?status=reviewing&kind=opinion');
  assert.equal(viewHash('board', null, {status: 'closed'}), '#board?status=closed');
  assert.equal(viewHash('board', null, {}), '#board');
  // 왕복: 해시 → 상태 → 해시가 같다.
  for (const hash of ['#overview', '#board', '#board?status=reviewing', '#board?status=pending', '#board?kind=journal', '#board?status=closed&kind=opinion', '#reports', '#issues', '#feedback/p1', '#persona/x']) {
    const view = parseHash(hash);
    assert.equal(viewHash(view.view, view.id, view), hash);
  }
});

test('화면 상태를 주소 해시로 되돌린다', () => {
  assert.equal(viewHash('reports'), '#reports');
  assert.equal(viewHash('issues'), '#issues');
  assert.equal(viewHash('feedback', 'p1'), '#feedback/p1');
  assert.equal(viewHash('persona', '고 객'), '#persona/' + encodeURIComponent('고 객'));
});

test('글·페르소나 화면은 고객 글 탭이 눌려 있다', () => {
  assert.equal(viewToTab('board'), 'board');
  assert.equal(viewToTab('feedback'), 'board');
  assert.equal(viewToTab('persona'), 'board');
  assert.equal(viewToTab('reports'), 'reports');
  assert.equal(viewToTab('issues'), 'issues');
});

test("날짜를 '11.14 06:31' 모양으로 쓴다(지역 시간, 초 없음)", () => {
  const date = new Date(2026, 10, 14, 6, 31, 44); // 지역 시간 11.14 06:31:44
  assert.equal(formatTime(date.toISOString()), '11.14 06:31');
  assert.equal(formatTime('그럴 듯하지 않은 날짜'), '—');
});

test('본문·답글은 이스케이프한 뒤 줄바꿈을 살린다(#564 11)', () => {
  assert.equal(richParagraph('<b>첫</b>\n둘'), '&lt;b&gt;첫&lt;/b&gt;<br>둘');
  assert.equal(richParagraph('가\r\n나\r다\n라'), '가<br>나<br>다<br>라');
  assert.equal(richParagraph(null), '');
  assert.equal(escapeText('"') , '&quot;');
});

test('상태 탭을 고르면 그 상태만, 고르지 않으면 닫음을 뺀 전체다(#570 2)', () => {
  const rows = [
    {id: '1', status: 'received', kind: 'opinion'},
    {id: '2', status: 'closed', kind: 'opinion'},
    {id: '3', status: 'fixed', kind: 'journal'},
    {id: '4', status: 'reviewing', kind: 'journal'}
  ];
  // 기본(어느 상태 탭도 안 고름)은 '닫음 뺀 전체'다.
  assert.deepEqual(filterRows(rows, {}).map(r => r.id), ['1', '3', '4']);
  // 상태 탭을 고르면 그 상태만 — '닫음' 탭을 고르면 닫음이 보인다.
  assert.deepEqual(filterRows(rows, {status: 'closed'}).map(r => r.id), ['2']);
  assert.deepEqual(filterRows(rows, {status: 'fixed'}).map(r => r.id), ['3']);
  // 종류 탭은 상태 탭과 겹쳐 거른다.
  assert.deepEqual(filterRows(rows, {kind: 'journal'}).map(r => r.id), ['3', '4']);
  assert.deepEqual(filterRows(rows, {kind: 'opinion', status: 'closed'}).map(r => r.id), ['2']);
  assert.deepEqual(filterRows(undefined, {}), []);
});

test('상태 탭 줄은 숫자를 세고, 닫음은 숫자를 보이지 않는다(#570 2)', () => {
  const rows = [
    {id: '1', status: 'received', kind: 'opinion'},
    {id: '2', status: 'received', kind: 'journal'},
    {id: '3', status: 'reviewing', kind: 'opinion'},
    {id: '4', status: 'closed', kind: 'opinion'},
    {id: '5', status: 'later', kind: 'journal'}
  ];
  const tabs = statusTabs(rows);
  assert.deepEqual(tabs.map(t => t.count), [2, 1, 0, 1, null]); // 새 글 2 · 확인 중 1 · 고침 0 · 다음에 1 · 닫음(숫자 없음)
  assert.equal(tabs[0].label, '새 글');
  assert.equal(tabs[4].label, '닫음');
  // 종류 탭을 고르면 그 종류의 숫자다.
  assert.deepEqual(statusTabs(rows, 'journal').map(t => t.count), [1, 0, 0, 1, null]);
});

test('종류 탭 줄은 전체·의견·일지 숫자를 센다(#570 2)', () => {
  const rows = [
    {id: '1', status: 'received', kind: 'opinion'},
    {id: '2', status: 'closed', kind: 'opinion'},
    {id: '3', status: 'fixed', kind: 'journal'}
  ];
  // 상태 탭을 고르지 않으면 기본 화면(닫음 뺀 전체)의 숫자다.
  assert.deepEqual(kindTabs(rows).map(t => t.count), [2, 1, 1]);
  assert.deepEqual(kindTabs(rows).map(t => t.label), ['전체', '의견', '일지']);
  // 상태 탭을 고르면 그 상태 안의 숫자다.
  assert.deepEqual(kindTabs(rows, 'closed').map(t => t.count), [1, 1, 0]);
});

test("'받음'은 운영센터에서 '새 글'로 부른다(서버 값은 received 그대로, #570 2)", () => {
  assert.equal(STATUS_LABEL.received, '새 글');
  assert.ok(STATUS_ORDER.includes('closed'));
  assert.equal(PERSONA_FIELDS.length, 7);
  // #590: '자주 쓰는 곳·익숙한 디자인' 칸 — '쓰는 모습' 뒤 순서 고정(내보내기 md 와 같은 순서).
  assert.deepEqual(PERSONA_FIELDS[3], ['habits', '자주 쓰는 곳·익숙한 디자인']);
});

test('#596 사용 일지 탭 주소: #journals 왕복', () => {
  assert.deepEqual(parseHash('#journals'), {view: 'journals', id: null, status: '', kind: ''});
  assert.equal(viewHash('journals'), '#journals');
  assert.equal(viewToTab('journals'), 'journals');
});

test('#596 오늘 요약·고객별 줄·떠남 위험(이틀 연속 2 이하)', () => {
  const journals = [
    {id: 1, subjectId: 'a', authorName: '시험 사용자', kind: 'journal', journalDate: '2026-11-13', score: 2, createdAt: '2026-11-13T01:00:00Z', displayTitle: '13일'},
    {id: 2, subjectId: 'a', authorName: '시험 사용자', kind: 'journal', journalDate: '2026-11-14', score: 2, createdAt: '2026-11-14T01:00:00Z', displayTitle: '14일'},
    {id: 3, subjectId: 'b', authorName: '다른', kind: 'journal', journalDate: '2026-11-14', score: 1, createdAt: '2026-11-14T02:00:00Z', displayTitle: '14일 b'}
  ];
  const summary = journalsSummary(journals, '2026-11-14');
  assert.deepEqual(summary, {activeCustomers: 2, journalCount: 2, avgScore: 1.5, atRisk: 1});
  const rows = journalRowsByCustomer(journals);
  assert.deepEqual(rows.map(row => row.name), ['시험 사용자', '다른']); // 최근 기록일 내림차순(같으면 고정 순서)
  assert.equal(rows[0].stage, '꾸준'); // 2일
  assert.equal(rows[1].stage, '시작'); // 1일
  assert.deepEqual(rows[0].flow, [{day: '2026-11-13', score: 2}, {day: '2026-11-14', score: 2}]);
  assert.equal(rows[0].atRisk, true); // 이틀 연속 2 이하
  assert.equal(rows[1].atRisk, false); // 하루뿐이라 판정 불가
  assert.equal(rows[0].journals[0].journalDate, '2026-11-14'); // 펼칠 일지도 날짜 내림차순
  assert.equal(journalStage(1), '시작');
  assert.equal(journalStage(4), '꾸준');
  assert.equal(journalStage(5), '정착');
});

test("상태 알림 문구는 받침에 따라 '으로/로'를 고른다(#564 6)", () => {
  assert.equal(statusChangeMessage('received'), "상태를 '새 글'로 바꿨어요");
  assert.equal(statusChangeMessage('reviewing'), "상태를 '확인 중'으로 바꿨어요");
  assert.equal(statusChangeMessage('fixed'), "상태를 '고침'으로 바꿨어요");
  assert.equal(statusChangeMessage('later'), "상태를 '다음에'로 바꿨어요");
  assert.equal(statusChangeMessage('closed'), "상태를 '닫음'으로 바꿨어요");
});

test('고객 글의 연결 이슈 번호만 추려 번호 내림차순으로 나열한다(#570 4)', () => {
  const rows = [
    {id: '1', issueNumber: '549'},
    {id: '2', issueNumber: '548'},
    {id: '3', issueNumber: '549'}, // 같은 이슈에 연결된 글 — 번호는 한 번만
    {id: '4', issueNumber: ''},
    {id: '5', issueNumber: 'abc'},
    {id: '6', issueNumber: '541;alert(1)'},
    {id: '7'}
  ];
  assert.deepEqual(linkedIssueNumbers(rows), [549, 548]);
  assert.deepEqual(linkedIssueNumbers([]), []);
  assert.deepEqual(linkedIssueNumbers(undefined), []);
  // #636: 앞의 '#'이 붙어 저장된 값도 같은 번호로 읽는다(운영 도구가 그렇게 저장해 왔다). 빈 값·잘못된 값은 버린다.
  assert.deepEqual(linkedIssueNumbers([{issueNumber: '#584'}, {issueNumber: ' 584 '}, {issueNumber: '584'}]), [584]);
  assert.deepEqual(linkedIssueNumbers([{issueNumber: '#584'}, {issueNumber: '611'}, {issueNumber: ''}, {issueNumber: null}, {issueNumber: 'abc'}, {issueNumber: '#'}, {issueNumber: '#12a'}]), [611, 584]);
  assert.deepEqual(linkedIssueNumbers([{issueNumber: ''}, {issueNumber: '   '}, {issueNumber: null}, {issueNumber: undefined}, {}, {issueNumber: '#'}, {issueNumber: '!42'}, {issueNumber: '4 2'}, {issueNumber: '0x10'}]), []);
  assert.deepEqual(linkedIssueNumbers([{issueNumber: '#000'}]), [0]);
  assert.equal(normalizeIssueNumber('#584'), '584');
  assert.equal(normalizeIssueNumber(' 584 '), '584');
  assert.equal(normalizeIssueNumber('# 584'), '584');
  assert.equal(normalizeIssueNumber('584'), '584');
  assert.equal(normalizeIssueNumber(''), '');
  assert.equal(normalizeIssueNumber('#'), '');
  assert.equal(normalizeIssueNumber('abc'), '');
  assert.equal(normalizeIssueNumber(null), '');
});

test("GitHub open/closed를 '이슈 열림/이슈 닫힘'으로 바꿔 쓴다(대표 요청 2026-11-16 — '고침 완료'는 이슈 닫힘, 고객 글 '고침'과 다른 것)", () => {
  assert.equal(issueStateLabel('open'), '이슈 열림');
  assert.equal(issueStateLabel('closed'), '이슈 닫힘');
  assert.equal(issueStateLabel(''), '');
  assert.equal(issueStateLabel(undefined), '');
});

test('고침 완료 이슈에 연결됐지만 고침이 아닌 고객 글에만 바꾸기 단추를 보인다(#570 4)', () => {
  // 이슈가 고침 완료인데 글은 아직 확인 중 → 단추를 보인다.
  assert.equal(needsFixButton({status: 'reviewing'}, 'closed'), true);
  // 이미 '고침'이면 단추가 없다.
  assert.equal(needsFixButton({status: 'fixed'}, 'closed'), false);
  // 이슈가 아직 고치는 중이면 단추가 없다.
  assert.equal(needsFixButton({status: 'reviewing'}, 'open'), false);
  // 이슈 상태를 못 읽었으면 단추를 보이지 않는다(자동으로 바꾸지 않는다).
  assert.equal(needsFixButton({status: 'reviewing'}, undefined), false);
  assert.equal(needsFixButton(null, 'closed'), false);
});

test('GitHub 이슈 새 글 주소는 제목·본문만 넣는다(#564 4)', () => {
  const url = new URL(buildIssueUrl({title: '제목 with & <>', body: '본문\n줄바꿈'}));
  assert.equal(url.origin + url.pathname, 'https://github.com/skerishKang/lovetree-4.0/issues/new');
  assert.equal(url.searchParams.get('title'), '제목 with & <>');
  assert.equal(url.searchParams.get('body'), '본문\n줄바꿈');
  // 계정·트리 정보 따위의 다른 인자는 없다.
  assert.deepEqual([...url.searchParams.keys()].sort(), ['body', 'title']);
});

test('연결 이슈 번호가 숫자일 때만 링크를 만든다(#564 14)', () => {
  assert.ok(issueLink('541').includes('href="https://github.com/skerishKang/lovetree-4.0/issues/541"'));
  assert.ok(issueLink('541').includes('#541'));
  // #636: '#'이 붙어 저장된 값도 이슈 링크가 되어야 한다(운영센터 '고치는 일' 탭이 비어 보이던 원인).
  assert.equal(issueLink('#541'), issueLink('541'));
  assert.equal(issueLink(' #541 '), issueLink('541'));
  assert.equal(issueLink(' 541 '), issueLink('541'));
  assert.equal(issueLink(''), '');
  assert.equal(issueLink('abc'), '');
  assert.equal(issueLink('541;alert(1)'), '');
  assert.equal(issueLink(null), '');
});

test('운영센터 배경 — 빌드 순서와 상관없이 무대색이 styles.css :root 크림을 이긴다(html:root 명시도)', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/admin.css', import.meta.url), 'utf8');
  assert.match(css, /html:root\s*\{[^}]*background-color:\s*var\(--lt-stage\)/);
  assert.match(css, /body\s*\{[^}]*min-height:\s*100vh/);
});

/* ── #655 '한눈에' 탭 — 이미 있는 API의 응답만 모아 숫자를 낸다 ── */

test("#655 '한눈에' 카드 숫자 — 가짜 응답으로 각 카드 계산이 맞다('#584'·'584' 섞인 이슈 번호 포함)", () => {
  const feedback = {ok: true, payload: {feedback: [
    {id: 'a1', kind: 'opinion', status: 'received', createdAt: '2026-11-10T01:00:00Z', replyCount: 0, issueNumber: '#584'},
    {id: 'a2', kind: 'bug', status: 'reviewing', createdAt: '2026-11-11T02:00:00Z', replyCount: 2},
    {id: 'a3', kind: 'opinion', status: 'fixed', createdAt: '2026-11-12T03:00:00Z', replyCount: 1, issueNumber: '584'},
    {id: 'a4', kind: 'journal', status: 'later', createdAt: '2026-11-13T04:00:00Z', replyCount: 0},
    {id: 'a5', kind: 'opinion', status: 'closed', createdAt: '2026-11-09T05:00:00Z', replyCount: 0}
  ]}};
  const reports = {ok: true, payload: {reports: [{id: 'r1', status: 'open'}, {id: 'r2', status: 'resolved'}, {id: 'r3', status: 'open'}]}};
  const journals = {ok: true, payload: {journals: [
    {id: 'j1', subjectId: 'c1', authorName: '고객1', authorRole: 'ai_customer', journalDate: '2026-11-14', score: 4, createdAt: '2026-11-14T01:00:00Z'},
    {id: 'j2', subjectId: 'c1', authorName: '고객1', journalDate: '2026-11-15', score: 2, createdAt: '2026-11-15T01:00:00Z'},
    {id: 'j3', subjectId: 'c2', authorName: '고객2', journalDate: '2026-11-15', createdAt: '2026-11-15T02:00:00Z'}
  ]}};
  const model = overviewModel({feedback, journals, reports, issues: {ok: true, states: new Map([[584, 'open']])}});
  assert.deepEqual(model.feedbackCard, {pending: 2, fixed: 1, total: 5, unanswered: 2});
  assert.deepEqual(model.reportCard, {pending: 2, total: 3});
  // '#584'와 '584'는 같은 이슈다(#636 정규화) — 열린 1로 센다.
  assert.deepEqual(model.issueCard, {open: 1, closed: 0});
  assert.equal(model.journalCard.total, 2);
  assert.equal(model.journalCard.rows[0].name, 'AI 명예회원 고객1');
  assert.equal(model.journalCard.rows[0].lastDay, '2026-11-15');
  assert.equal(model.journalCard.rows[0].latestScore, 2);
  // 오늘 할 일: 답 안 단 글 오래된 순, 닫은 글은 빠지고, 이슈 번호는 숫자로 돌아온다.
  assert.deepEqual(model.todos.map(t => t.id), ['a1', 'a4']);
  assert.equal(model.todos[0].issueNumber, '584');
  assert.equal(model.todos[1].issueNumber, '');
});

test('#655 오늘 할 일 — 오래된 순 5개로 자르고 닫은 글은 뺀다', () => {
  const posts = Array.from({length: 7}, (_, i) => ({
    id: 'p' + i, status: i === 6 ? 'closed' : 'received', replyCount: 0,
    createdAt: `2026-11-${String(8 + i).padStart(2, '0')}T00:00:00Z`, displayTitle: i === 6 ? '닫은 글' : `글 ${i}`, issueNumber: ''
  }));
  const todos = overviewTodos(posts);
  assert.equal(todos.length, 5, '5개로 자른다');
  assert.deepEqual(todos.map(t => t.id), ['p0', 'p1', 'p2', 'p3', 'p4'], '오래된 순, 닫은 글(p6)은 빠진다');
  assert.equal(overviewTodos(null).length, 0, '응답이 없으면 빈 목록');
});

test('#655 한 API가 실패해도 나머지 카드는 계산된다', () => {
  const model = overviewModel({
    feedback: {ok: false, payload: null},
    journals: {ok: true, payload: {journals: []}},
    reports: {ok: true, payload: {reports: []}},
    issues: {ok: false, states: new Map()}
  });
  assert.ok(model.feedbackCard.error, '고객 글 카드만 실패');
  assert.deepEqual(model.reportCard, {pending: 0, total: 0}, '신고 카드는 그대로');
  assert.deepEqual(model.journalCard, {total: 0, rows: []}, '사용 일지 카드는 그대로');
  assert.ok(model.issueCard.error, '이슈 상태를 못 가져오면 고치는 일 카드도 실패');
  assert.deepEqual(model.todos, [], '고객 글을 못 가져오면 오늘 할 일도 비운다');
});

test('#655 처리 대기(pending) 조건 — 받음·확인 중을 한 번에 거르고 주소에 남긴다', () => {
  assert.deepEqual(parseHash('#board?status=pending'), {view: 'board', id: null, status: 'pending', kind: ''});
  assert.equal(viewHash('board', null, {status: 'pending'}), '#board?status=pending');
  assert.equal(viewToTab('overview'), 'overview');
  const rows = [{status: 'received'}, {status: 'reviewing'}, {status: 'fixed'}, {status: 'closed'}];
  assert.deepEqual(filterRows(rows, {status: 'pending'}), [{status: 'received'}, {status: 'reviewing'}]);
  // 기존 조건은 그대로다.
  assert.deepEqual(filterRows(rows, {status: 'fixed'}), [{status: 'fixed'}]);
  assert.equal(filterRows(rows, {}).length, 3, '조건 없으면 닫음을 뺀 전체(#564 10)');
});

test('#655 2차 전체 숫자 카드 — 실제 사용자·AI 테스터·시험 계정을 나눠 읽고, 못 불러오면 그 줄만 실패로 둔다', () => {
  // #671: 세 갈래(실제 사용자 / AI 테스터 / 시험 계정)를 카드마다 읽는다. 셋의 합이 전체다.
  const payload = {ok: true, payload: {ok: true, stats: {
    checkedAt: '2026-11-20T00:00:00.000Z',
    window: {days: 7, since: '2026-11-13T00:00:00.000Z'},
    accounts: {total: 15, real: 9, aiTester: 3, tester: 3, new: {total: 6, real: 3, aiTester: 1, tester: 2}},
    trees: {total: 25, real: 15, aiTester: 5, tester: 5, public: {total: 11, real: 6, aiTester: 2, tester: 3}, featured: {total: 8, real: 4, aiTester: 1, tester: 3}},
    moments: {total: 105, real: 70, aiTester: 20, tester: 15, new: {total: 15, real: 9, aiTester: 2, tester: 4}}
  }}};
  const model = statsCards(payload);
  assert.equal(model.error, false);
  assert.deepEqual(model.cards.map(card => card.key), ['accounts', 'accounts-new', 'trees', 'moments', 'moments-new', 'public-trees', 'featured-trees']);
  const byKey = Object.fromEntries(model.cards.map(card => [card.key, card]));
  // 실제 사용자를 크게, AI 테스터를 함께 — AI 테스터는 전체에 포함된 수다.
  // #743: 카드마다 '전체 = 실제 + AI + 시험'을 함께 낸다(숫자가 서로 어긋나 보이지 않게).
  assert.deepEqual(byKey.accounts, {key: 'accounts', label: '계정', total: 15, real: 9, aiTester: 3, tester: 3});
  assert.deepEqual(byKey['accounts-new'], {key: 'accounts-new', label: '새 계정 · 7일', total: 6, real: 3, aiTester: 1, tester: 2});
  assert.deepEqual(byKey.moments, {key: 'moments', label: '순간', total: 105, real: 70, aiTester: 20, tester: 15});
  // 트리 계열 카드는 펼침 내역의 제목 목록(최대 20)을 함께 받는다 — 응답에 없으면 null(지어내지 않는다).
  assert.deepEqual(byKey['public-trees'], {key: 'public-trees', label: '공개 트리', total: 11, real: 6, aiTester: 2, tester: 3, titles: null});
  assert.deepEqual(byKey['featured-trees'], {key: 'featured-trees', label: '둘러보기 소개', total: 8, real: 4, aiTester: 1, tester: 3, titles: null});

  // 응답이 실패했거나 값이 이상하면 그 카드만 실패 — 숫자를 0으로 지어내지 않는다.
  assert.deepEqual(statsCards({ok: false, status: 503, payload: null}), {error: true, cards: []});
  assert.equal(statsCards({ok: true, payload: {ok: false}}).error, true);
  // 시험 계정 칸이 없으면(옛 응답) 그 카드는 실패로 둔다 — 숫자를 지어내지 않는다.
  const noTester = statsCards({ok: true, payload: {ok: true, stats: {accounts: {total: 1, real: 0, aiTester: 1, new: {total: 0, real: 0, aiTester: 0}}, trees: {}, moments: {}}}});
  assert.equal(noTester.error, true);
  const broken = statsCards({ok: true, payload: {ok: true, stats: {accounts: {total: 1, real: 1}, trees: {}, moments: {}}}});
  assert.equal(broken.error, true);
  assert.ok(broken.cards.every(card => card.error), '값이 없는 카드는 실패로 남는다');

  // #743: 트리 계열 카드는 서버가 준 제목 목록(최대 20)을 펼침 내역에 쓴다. 제목만 싣는다(이메일·subject 없음).
  const withTitles = statsCards({ok: true, payload: {ok: true, stats: {
    accounts: {total: 2, real: 2, aiTester: 0, tester: 0, new: {total: 0, real: 0, aiTester: 0, tester: 0}},
    trees: {total: 3, real: 3, aiTester: 0, tester: 0, titles: ['가을 노래', '겨울 산책'], public: {total: 1, real: 1, aiTester: 0, tester: 0, titles: ['가을 노래']}, featured: {total: 0, real: 0, aiTester: 0, tester: 0, titles: []}},
    moments: {total: 4, real: 4, aiTester: 0, tester: 0, new: {total: 0, real: 0, aiTester: 0, tester: 0}}
  }}});
  const treeCards = Object.fromEntries(withTitles.cards.map(card => [card.key, card]));
  assert.deepEqual(treeCards.trees.titles, ['가을 노래', '겨울 산책']);
  assert.deepEqual(treeCards['public-trees'].titles, ['가을 노래']);
  assert.deepEqual(treeCards['featured-trees'].titles, [], '제목이 없으면 빈 목록(숫자를 지어내지 않는다)');
  assert.equal(treeCards.moments.titles, undefined, '트리 계열이 아닌 카드에는 제목 목록이 없다');

});

test('journal_date가 비어 있으면 만든 시각을 한국 시각 날짜로 읽는다(UTC 자름이 아니다)', () => {
  // 2026-11-14T19:28:00Z = 한국 시각 2026-11-15 04:28.
  const rows = journalRowsByCustomer([
    {id: 1, subjectId: 'a', authorName: '시험 사용자', kind: 'journal', journalDate: null, score: 3, createdAt: '2026-11-14T19:28:00Z'},
    {id: 2, subjectId: 'a', authorName: '시험 사용자', kind: 'journal', journalDate: '2026-11-13', score: 2, createdAt: '2026-11-13T01:00:00Z'}
  ]);
  assert.equal(rows[0].lastDay, '2026-11-15', '한국 시각 11-15 04:28 기록은 11-15로 보인다');
  assert.deepEqual(rows[0].flow, [{day: '2026-11-13', score: 2}, {day: '2026-11-15', score: 3}]);
});

test('#743 한눈에 카드: 갈 탭이 있는 카드가 자기 조건으로 그 탭을 여는 주소를 만든다', () => {
  // 답글 0 카드 → 고객 글 탭에서 답글 0만 남긴다(주소 왕복).
  assert.equal(viewHash('board', null, {unanswered: true}), '#board?unanswered=1');
  assert.deepEqual(parseHash('#board?unanswered=1'), {view: 'board', id: null, status: '', kind: '', unanswered: true});
  assert.equal(viewHash(parseHash('#board?unanswered=1').view, null, parseHash('#board?unanswered=1')), '#board?unanswered=1');
  // 신고 대기 카드 → 신고 탭의 검토 대기만.
  assert.equal(viewHash('reports', null, {status: 'open'}), '#reports?status=open');
  assert.equal(parseHash('#reports?status=open').status, 'open');
  assert.equal(viewHash(parseHash('#reports?status=open').view, null, parseHash('#reports?status=open')), '#reports?status=open');
  // 열린·닫힌 이슈 카드 → 고치는 일 탭의 그 상태만.
  assert.equal(viewHash('issues', null, {status: 'open'}), '#issues?status=open');
  assert.equal(viewHash('issues', null, {status: 'closed'}), '#issues?status=closed');
  assert.equal(parseHash('#issues?status=closed').status, 'closed');
  // 모르는 값은 버린다(주소는 늘 해석된다).
  assert.equal(parseHash('#reports?status=bogus').status, '');
  assert.equal(parseHash('#issues?status=pending').status, '');
  // 두 카드(전체·고침)는 지금처럼 상태 조건만 쓴다.
  assert.equal(viewHash('board', null, {status: 'fixed', kind: '', unanswered: false}), '#board?status=fixed');
  assert.equal(viewHash('board', null, {status: '', kind: '', unanswered: false}), '#board');

  // 거르기도 같은 뜻이다 — 답글 0은 닫힌 글을 빼고 센다('한눈에' 카드 숫자와 같은 규칙).
  const rows = [
    {id: 'a', status: 'received', replyCount: 0},
    {id: 'b', status: 'reviewing', replyCount: 2},
    {id: 'c', status: 'fixed', replyCount: 0},
    {id: 'd', status: 'closed', replyCount: 0}
  ];
  assert.deepEqual(filterRows(rows, {unanswered: true}).map(row => row.id), ['a', 'c']);
  assert.deepEqual(filterRows(rows, {unanswered: true, status: 'fixed'}).map(row => row.id), ['c']);
  assert.equal(filterRows(rows, {}).length, 3, '조건이 없으면 지금과 같다(닫음 제외)');
});

/* ── 대표 요청 2026-11-16: 운영센터 상태 칩 한 모양 + 이름 + PR 번호 — 숫자로 판정한다 ──
   크롬(Playwright chromium)이 있는 곳에서만 돈다. CI '미리보기 검사'는 LT_ADMIN_REQUIRE=1 로 직접 돌려
   건너뜀을 실패로 본다. 관리자 세션·고객 글·GitHub 읽기는 모두 가짜 응답(서버·네트워크 쓰기 없음). */

const ADMIN_REQUIRE = process.env.LT_ADMIN_REQUIRE === '1';
let adminChromium, adminSkip = false;
try {
  const pw = await import('playwright');
  adminChromium = pw.chromium;
  if (!adminChromium?.executablePath?.() && !adminChromium?.executablePath) adminSkip = 'playwright 대역이어서 칩 검사를 건너뜀';
  else if (!existsSync(adminChromium.executablePath())) adminSkip = 'Playwright Chromium이 없어 칩 검사를 건너뜀';
} catch { adminSkip = 'playwright 패키지가 없어 칩 검사를 건너뜀'; }
if (ADMIN_REQUIRE && !existsSync(new URL('../dist/admin.html', import.meta.url))) adminSkip = '빌드 결과가 없어 칩 검사를 건너뜀(npx vite build 필요)';

const LONG_TITLE = '순간이 3개가 되는 순간에 트리가 둘러보기에 공개된다는 안내를 들었는데 저장할 때는 계속 서버에 저장됐어요만 떴고 공유 판에서 비공개로 바꾸려니 Plus 전용이라고 나왔어요. 저는 아직 열여덟 살이 안 됐는데 가입할 때 나이를 묻는 칸이 없었던 것도 신기했어요.';

test('운영센터 상태 칩: 1440·390에서 높이가 같고 한 줄이며 폭이 글자+여백뿐이다(대표 요청 2026-11-16)', { skip: ADMIN_REQUIRE ? false : adminSkip, timeout: 120000 }, async () => {
  if (adminSkip) assert.fail(`건너뜀=실패 — ${adminSkip}`);
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await adminChromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/api/admin/session', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, authenticated: true, admin: true}) }));
    await context.route('**/api/admin/feedback', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, feedback: [
      {id: 'p1', kind: 'opinion', status: 'fixed', replyCount: 1, issueNumber: '#584', displayTitle: LONG_TITLE, createdAt: '2026-11-15T09:00:00Z'},
      {id: 'p2', kind: 'opinion', status: 'reviewing', replyCount: 0, issueNumber: '584', displayTitle: '짧은 제목', createdAt: '2026-11-15T10:00:00Z'},
      {id: 'p3', kind: 'bug', status: 'received', replyCount: 0, issueNumber: '#637', displayTitle: '검색이 안 돼요', createdAt: '2026-11-15T11:00:00Z'}
    ]}) }));
    await context.route('**api.github.com/repos/**/issues/584', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({number: 584, title: '둘러보기 검색이 막혀 있다', state: 'closed'}) }));
    await context.route('**api.github.com/repos/**/issues/637', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({number: 637, title: '검색 색인 고치기', state: 'open', pull_request: {number: 637}}) }));
    const page = await context.newPage();
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${base}/admin.html#issues`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-issue-row="637"]', { timeout: 8000 });
      await page.waitForTimeout(200);
      const chips = await page.evaluate(() => {
        const oneLineHeight = (el) => {
          const cs = getComputedStyle(el);
          return parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
            + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
            + Math.ceil(parseFloat(cs.fontSize) * parseFloat(cs.lineHeight));
        };
        return [...document.querySelectorAll('.lt-badge')].map(el => {
          const rect = el.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          return {
            text: el.textContent.trim(),
            h: Math.round(rect.height * 10) / 10,
            w: Math.round(rect.width * 10) / 10,
            textW: Math.round(range.getBoundingClientRect().width * 10) / 10,
            overflow: el.scrollWidth - el.clientWidth,
            lineH: Math.round(oneLineHeight(el) * 10) / 10
          };
        });
      });
      assert.ok(chips.length >= 4, `고치는 일 탭에 칩이 그려진다(실제 ${chips.length}개)`);
      const heights = chips.map(chip => chip.h);
      assert.ok(Math.max(...heights) - Math.min(...heights) <= 1,
        `모든 칩의 높이가 같다(오차 1px — 실제 ${Math.min(...heights)}~${Math.max(...heights)}px)`);
      for (const chip of chips) {
        assert.ok(chip.h <= chip.lineH + 1, `칩 안 글자가 한 줄이다(${chip.text} — 높이 ${chip.h}px ≤ 한 줄 ${chip.lineH}px)`);
        assert.ok(chip.overflow <= 0, `칩 안 글자가 잘리지 않는다(${chip.text} — 넘침 ${chip.overflow}px)`);
        // 칩 폭 = 글자 폭 + 좌우 여백(9px×2) + 테두리(1px×2) — 남은 폭을 채우거나 눌리지 않았다.
        assert.ok(chip.w <= chip.textW + 21, `칩 폭이 글자 폭+여백뿐이다(${chip.text} — ${chip.w}px ≤ 글자 ${chip.textW}px+21px)`);
        assert.ok(chip.w >= chip.textW, `칩이 글자를 담는다(${chip.text} — ${chip.w}px ≥ ${chip.textW}px)`);
      }
      // 긴 글 줄: 제목이 줄바꿈을 하고(칩을 밀지 않음), 그 줄의 칩도 한 줄 높이를 유지한다.
      const longRow = await page.evaluate(() => {
        const row = [...document.querySelectorAll('.lt-issue-post')].find(el => el.querySelector('.lt-post-title')?.textContent.length > 40);
        if (!row) return null;
        const title = row.querySelector('.lt-post-title');
        const badge = row.querySelector('.lt-badge');
        return { titleH: Math.round(title.getBoundingClientRect().height), badgeH: Math.round(badge.getBoundingClientRect().height) };
      });
      assert.ok(longRow, '긴 제목 고객 글 줄이 그려진다');
      assert.ok(longRow.titleH > longRow.badgeH, `긴 글은 줄바꿈하고 칩을 밀지 않는다(제목 ${longRow.titleH}px > 칩 ${longRow.badgeH}px)`);
      // 이름: 이슈 칩은 '이슈 닫힘/이슈 열림', 고객 글 칩은 '고객에게: ' 머리, PR 번호는 'PR #637 · 제목'.
      const texts = chips.map(chip => chip.text);
      assert.ok(texts.includes('이슈 닫힘'), `이슈 칩 이름이 '이슈 닫힘'이다(실제: ${JSON.stringify(texts)})`);
      assert.ok(texts.some(text => text === '고객에게: 고침'), `고객 글 칩에 '고객에게:' 머리를 붙인다(실제: ${JSON.stringify(texts)})`);
      const prTitle = await page.textContent('[data-issue-row="637"] .lt-issue-title');
      assert.match(prTitle, /^PR #637 · /, `PR 번호는 'PR #번호 · 제목'으로 보인다(실제: ${prTitle})`);
      const issueTitle = await page.textContent('[data-issue-row="584"] .lt-issue-title');
      assert.equal(issueTitle, '둘러보기 검색이 막혀 있다', '이슈는 제목을 그대로 보인다');
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
});
