import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  STATUS_ORDER, PERSONA_FIELDS,
  richParagraph, formatTime, parseHash, viewHash, viewToTab,
  filterRows, statusTabs, kindTabs, STATUS_LABEL,
  tabClickFilters,
  BOARD_KIND_TABS, BOARD_STATUS_TABS, boardKindTabs, boardStatusTabs, filterBoardRows, MENU_TABS,
  linkedIssueNumbers, normalizeIssueNumber, issueStateLabel, needsFixButton,
  statusChangeMessage, buildIssueUrl, issueLink, escapeText, statsCards,
  journalsSummary, journalRowsByCustomer, journalStage,
  isPendingStatus, overviewModel, overviewTodos,
  customerSummaryCards, customerRows, customerDetailModel, customerViewRows
} from '../src/admin-view.js';

test('주소 해시를 화면 상태로 바꾼다(#564 2)', () => {
  // #655: 운영센터를 열면(주소 없이) '한눈에'가 기본이다. 기존 주소(#board 등)는 그대로다.
  assert.deepEqual(parseHash(''), {view: 'overview', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#overview'), {view: 'overview', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#board'), {view: 'board', id: null, status: '', kind: '', cat: 'issue'});
  // 2026-11-17: 없어진 탭의 옛 주소는 고객 글 거르기로 연다.
  assert.deepEqual(parseHash('#reports'), {view: 'board', id: null, status: 'pending', kind: 'report'});
  assert.deepEqual(parseHash('#issues'), {view: 'issues', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#issues?status=closed'), {view: 'issues', id: null, status: 'closed', kind: ''});
  assert.deepEqual(parseHash('#feedback/abc'), {view: 'feedback', id: 'abc', status: '', kind: ''});
  assert.deepEqual(parseHash('#persona/고객-01'), {view: 'persona', id: '고객-01', status: '', kind: ''});
  // 모르는 모양은 목록으로 돌린다.
  assert.deepEqual(parseHash('#unknown'), {view: 'board', id: null, status: '', kind: '', cat: 'issue'});
  assert.deepEqual(parseHash('#feedback/'), {view: 'board', id: null, status: '', kind: '', cat: 'issue'});
  // id에 /가 들어가도 잃지 않는다.
  assert.deepEqual(parseHash('#feedback/a/b'), {view: 'feedback', id: 'a/b', status: '', kind: ''});
});

test('탭 거르기를 주소에 남기고 되돌린다(#570 2)', () => {
  assert.deepEqual(parseHash('#board?status=reviewing'), {view: 'board', id: null, status: 'reviewing', kind: '', cat: 'issue'});
  assert.deepEqual(parseHash('#board?kind=opinion'), {view: 'board', id: null, status: '', kind: 'opinion', cat: 'issue'});
  assert.deepEqual(parseHash('#board?status=reviewing&kind=opinion'), {view: 'board', id: null, status: 'reviewing', kind: 'opinion', cat: 'issue'});
  // 모르는 값은 버린다.
  assert.deepEqual(parseHash('#board?status=bogus'), {view: 'board', id: null, status: '', kind: '', cat: 'issue'});
  assert.deepEqual(parseHash('#board?kind=journal&x=1'), {view: 'board', id: null, status: '', kind: 'journal', cat: 'issue'});
  // 상세 주소에는 탭 상태가 따라가지 않는다.
  assert.deepEqual(parseHash('#feedback/6?status=closed'), {view: 'feedback', id: '6', status: '', kind: ''});
  assert.equal(viewHash('board', null, {status: 'reviewing', kind: 'opinion'}), '#board?status=reviewing&kind=opinion');
  assert.equal(viewHash('board', null, {status: 'closed'}), '#board?status=closed');
  assert.equal(viewHash('board', null, {}), '#board');
  // 고장·불편·요청 두 탭(대표 요청 2026-11-17): 요청만 cat=request, 고장·불편은 기본 #board와 같다.
  assert.deepEqual(parseHash('#board?cat=request'), {view: 'board', id: null, status: '', kind: '', cat: 'request'});
  assert.equal(viewHash('board', null, {cat: 'request'}), '#board?cat=request');
  assert.equal(viewHash('board', null, {cat: 'issue'}), '#board');
  // 왕복: 해시 → 상태 → 해시가 같다.
  for (const hash of ['#overview', '#board', '#board?status=reviewing', '#board?status=pending', '#board?kind=journal', '#board?status=closed&kind=opinion', '#board?kind=report', '#board?status=fixed', '#feedback/p1', '#persona/x']) {
    const view = parseHash(hash);
    assert.equal(viewHash(view.view, view.id, view), hash);
  }
});

test('화면 상태를 주소 해시로 되돌린다', () => {
  assert.equal(viewHash('reports'), '#board?kind=report');
  assert.equal(viewHash('issues'), '#issues');
  assert.equal(viewHash('feedback', 'p1'), '#feedback/p1');
  assert.equal(viewHash('persona', '고 객'), '#persona/' + encodeURIComponent('고 객'));
});

test('상단 탭 7개를 누르면 각자의 화면·거르기로 열린다(2026-11-18 — #801 뒤 3탭이 고장·불편에 붙던 것)', () => {
  // 단추가 달고 나가는 데이터(#801의 tabBtn) → 클릭 처리가 계산할 주소 → 해시를 연 뒤의 화면 상태.
  const click = (t) => {
    const filters = tabClickFilters({ tab: t.view, cat: t.cat, kind: t.kind });
    const hash = viewHash(t.view, null, filters);
    return { hash, route: parseHash(hash) };
  };
  const byLabel = Object.fromEntries(MENU_TABS.map((t) => [t.label, click(t)]));
  // 7개 전부: 탭마다 열려야 할 화면·거르기.
  assert.equal(byLabel['한눈에'].route.view, 'overview');
  assert.equal(byLabel['고객'].route.view, 'customers');
  assert.deepEqual([byLabel['고장·불편'].route.view, byLabel['고장·불편'].route.cat], ['board', 'issue']);
  assert.deepEqual([byLabel['요청'].route.view, byLabel['요청'].route.cat], ['board', 'request']);
  assert.deepEqual([byLabel['사용 일지'].route.view, byLabel['사용 일지'].route.kind], ['board', 'journal']);
  assert.deepEqual([byLabel['신고'].route.view, byLabel['신고'].route.kind], ['board', 'report']);
  assert.equal(byLabel['고치는 일'].route.view, 'issues');
  // 부러지던 세 탭: 주소가 서로 달라야 한다(전부 #board로 붙던 것이 회귀).
  const hashes = new Set(MENU_TABS.map((t) => click(t).hash));
  assert.equal(hashes.size, 7, '7탭의 주소가 모두 달라야 한다');
  // 클릭 처리는 단추의 dataset을 버리지 않는다.
  const js = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
  assert.match(js, /tabClickFilters\(tab\.dataset\)/);
});

test('글·페르소나 화면은 고객 글 탭이 눌려 있다', () => {
  assert.equal(viewToTab('board'), 'board');
  assert.equal(viewToTab('feedback'), 'board');
  assert.equal(viewToTab('persona'), 'board');
  assert.equal(viewToTab('reports'), 'board');
  assert.equal(viewToTab('issues'), 'board');
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
  // 2026-11-17: 신고가 종류에 추가됐다(이 목록에는 신고가 0건).
  assert.deepEqual(kindTabs(rows).map(t => t.count), [2, 1, 1, 0]);
  assert.deepEqual(kindTabs(rows).map(t => t.label), ['전체', '의견', '일지', '신고']);
  // 상태 탭을 고르면 그 상태 안의 숫자다.
  assert.deepEqual(kindTabs(rows, 'closed').map(t => t.count), [1, 1, 0, 0]);
});

test("'받음'은 운영센터에서 '새 글'로 부른다(서버 값은 received 그대로, #570 2)", () => {
  assert.equal(STATUS_LABEL.received, '새 글');
  assert.ok(STATUS_ORDER.includes('closed'));
  assert.equal(PERSONA_FIELDS.length, 7);
  // #590: '자주 쓰는 곳·익숙한 디자인' 칸 — '쓰는 모습' 뒤 순서 고정(내보내기 md 와 같은 순서).
  assert.deepEqual(PERSONA_FIELDS[3], ['habits', '자주 쓰는 곳·익숙한 디자인']);
});

test('옛 #journals 주소는 고객 글의 종류 일지 거르기로 열린다', () => {
  assert.deepEqual(parseHash('#journals'), {view: 'board', id: null, status: '', kind: 'journal'});
  assert.equal(viewHash('journals'), '#board?kind=journal');
  assert.equal(viewToTab('journals'), 'board');
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
  assert.deepEqual(parseHash('#board?status=pending'), {view: 'board', id: null, status: 'pending', kind: '', cat: 'issue'});
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
  // 2026-11-17: 한눈에 숫자는 네 장만 — 계정·트리·순간·공개 트리.
  assert.deepEqual(model.cards.map(card => card.key), ['accounts', 'trees', 'moments', 'public-trees']);
  const byKey = Object.fromEntries(model.cards.map(card => [card.key, card]));
  // 실제 사용자를 크게, AI 테스터를 함께 — AI 테스터는 전체에 포함된 수다.
  // #743: 카드마다 '전체 = 실제 + AI + 시험'을 함께 낸다(숫자가 서로 어긋나 보이지 않게).
  assert.deepEqual(byKey.accounts, {key: 'accounts', label: '계정', total: 15, real: 9, aiTester: 3, tester: 3});

  assert.deepEqual(byKey.moments, {key: 'moments', label: '순간', total: 105, real: 70, aiTester: 20, tester: 15});
  // 트리 계열 카드는 펼침 내역의 제목 목록(최대 20)을 함께 받는다 — 응답에 없으면 null(지어내지 않는다).
  assert.deepEqual(byKey['public-trees'], {key: 'public-trees', label: '공개 트리', total: 11, real: 6, aiTester: 2, tester: 3, titles: null});


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
  assert.deepEqual(parseHash('#board?unanswered=1'), {view: 'board', id: null, status: '', kind: '', cat: 'issue', unanswered: true});
  assert.equal(viewHash(parseHash('#board?unanswered=1').view, null, parseHash('#board?unanswered=1')), '#board?unanswered=1');
  // 신고 대기 카드 → 고객 글의 종류 신고 + 할 일.
  assert.equal(viewHash('reports', null, {status: 'open'}), '#board?kind=report&status=pending');
  const reportRoute = parseHash('#reports?status=open');
  assert.deepEqual(reportRoute, {view: 'board', id: null, status: 'pending', kind: 'report'});
  // 열린·닫힌 이슈 카드 → 고치는 일 화면의 그 상태만(옛 고객 글 상태 주소는 그대로 해석된다).
  assert.equal(viewHash('issues', null, {status: 'open'}), '#issues?status=open');
  assert.equal(viewHash('issues', null, {status: 'closed'}), '#issues?status=closed');
  assert.deepEqual(parseHash('#issues?status=closed'), {view: 'issues', id: null, status: 'closed', kind: ''});
  // 모르는 값은 버린다(주소는 늘 해석된다).
  assert.equal(parseHash('#reports?status=bogus').status, 'pending');
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

/* ── 2026-11-17 운영센터 탭 셋 + 고객 글 한 줄 거르기 — 화면 이름·숫자로 판정한다 ──
   크롬이 있는 곳에서만 돈다. CI는 LT_ADMIN_REQUIRE=1로 건너뜀을 실패로 본다.
   관리자 세션·고객 글·신고 읽기는 모두 가짜 응답(서버·네트워크 쓰기 없음). */
const ADMIN_REQUIRE = process.env.LT_ADMIN_REQUIRE === '1';
let adminChromium, adminSkip = false;
try {
  ({ chromium: adminChromium } = await import('playwright'));
  const candidates = [adminChromium.executablePath()];
  if (process.env.LT_ADMIN_BROWSER_EXE) candidates.push(process.env.LT_ADMIN_BROWSER_EXE);
  if (!candidates.some(p => p && existsSync(p))) adminSkip = 'Playwright Chromium이 없어 운영센터 화면 시험을 건너뜀';
} catch { adminSkip = 'playwright 패키지가 없어 운영센터 화면 시험을 건너뜀'; }

test('운영센터 탭 셋 + 옛 주소 3개 거르기 + 종류×상태 숫자', { skip: adminSkip || false, timeout: 180000 }, async () => {
  if (adminSkip) assert.fail(`건너뜀=실패 — ${adminSkip}`);
  const { mkdirSync } = await import('node:fs');
  const shotDir = process.env.LT_OPS_SHOT_DIR || 'E:\\lovetree-qa\\local4\\운영센터';
  mkdirSync(shotDir, { recursive: true });
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await adminChromium.launch({ headless: true,
    ...(process.env.LT_ADMIN_BROWSER_EXE ? { executablePath: process.env.LT_ADMIN_BROWSER_EXE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/api/admin/session', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, authenticated: true, admin: true}) }));
    await context.route('**/api/admin/feedback', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, feedback: [
      {id: 'p1', kind: 'opinion', category: 'bug', status: 'received', replyCount: 0, issueNumber: '', displayTitle: '새 의견', createdAt: '2026-11-16T09:00:00Z'},
      {id: 'p2', kind: 'opinion', category: 'inconvenient', status: 'reviewing', replyCount: 0, issueNumber: '584', displayTitle: '확인 중 의견', createdAt: '2026-11-16T10:00:00Z'},
      {id: 'p3', kind: 'opinion', category: 'other', status: 'fixed', replyCount: 1, issueNumber: 584, displayTitle: '고침 의견', createdAt: '2026-11-16T11:00:00Z'},
      {id: 'p4', kind: 'journal', status: 'received', replyCount: 0, issueNumber: '', score: 4, journalDate: '2026-11-16', displayTitle: '사용 일지', createdAt: '2026-11-16T12:00:00Z'},
      {id: 'p5', kind: 'opinion', category: 'other', status: 'later', replyCount: 1, issueNumber: '', displayTitle: '다음에', createdAt: '2026-11-15T12:00:00Z'}
    ]}) }));
    await context.route('**/api/community/admin/reports', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, reports: [
      {id: 'r1', status: 'open', hidden: false, reason: '둘러보기 신고 내용', shareId: 'sh_1', createdAt: '2026-11-16T13:00:00Z'}
    ]}) }));
    const page = await context.newPage();
    const read = () => page.evaluate(() => ({
      tabs: [...document.querySelectorAll('header nav [data-tab]')].map(b => b.textContent.trim()),
      menuCounts: [...document.querySelectorAll('header nav .lt-menu-count')].map(b => Number(b.textContent.trim())),
      activeTab: document.querySelector('header nav [data-tab].is-active')?.textContent.trim(),
      kinds: [...document.querySelectorAll('[data-kind-tab]')].map(b => ({label: b.textContent.trim().replace(/\s*\d+$/, ''), active: b.classList.contains('is-active')})),
      kindChips: [...document.querySelectorAll('.lt-post-top [data-kind]')].map(b => b.textContent.trim()),
      statuses: [...document.querySelectorAll('[data-status-tab]')].map(b => ({label: b.textContent.trim().replace(/\s*\d+$/, ''), active: b.classList.contains('is-active')})),
      cards: document.querySelectorAll('.lt-post').length,
      reportCards: document.querySelectorAll('[data-report-act]').length,
      scoreBadges: [...document.querySelectorAll('.lt-post .lt-badge')].filter(b => b.textContent.includes('점수')).length,
      h1: document.querySelector('.lt-h1')?.textContent.trim()
    }));

    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ['night', 'garden']) {
        await page.evaluate(t => { if (t === 'garden') document.documentElement.setAttribute('data-lt-theme', 'garden'); else document.documentElement.removeAttribute('data-lt-theme'); }, theme);
        await page.goto(`${base}/admin.html#board`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.lt-post', { timeout: 8000 });
        const board = await read();
        // 고객 글 탭을 고장·불편·요청으로 나누고 사용 일지·신고를 탭으로 돌린다(대표 요청 2026-11-17).
        assert.deepEqual(board.tabs, ['한눈에', '고객', '고장·불편 1', '요청', '사용 일지', '신고', '고치는 일'], width + '·' + theme + ': 탭 일곱(새 글 수는 고장·불편에만 보인다)');
      assert.equal(board.activeTab.replace(/\s*\d+$/, ''), '고장·불편');
        assert.equal(board.kinds.length, 0, '종류 줄은 없앤다 — 상단 탭과 상태 줄이 대신한다');
        assert.deepEqual(board.kindChips, [], '탭이 이미 의견만 보여 주므로 카드의 종류 칩도 없다');
        assert.deepEqual(board.menuCounts, [1], '고장·불편의 새 글 1(요청 0은 숨긴다)');
        assert.deepEqual(board.statuses.map(s => s.label), ['할 일', '고침', '더 보기 ▾']);
        assert.equal(board.statuses.find(s => s.label === '할 일').active, true, '첫 열기는 할 일');
        assert.equal(board.cards, 2, width + '·' + theme + ': 고장·불편 할 일 2건(새 의견+확인 중 의견)');
        assert.match(board.h1, /고장·불편 2건 · 최신 순/);
        await page.screenshot({ path: `${shotDir}/pr1-board-${width}-${theme}.png` });
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const cases = [
      ['#journals', 'journal'],
      ['#reports', 'report'],
      ['#fixes', '']
    ];
    for (const [hash, tabLabel, kind] of cases) {
      const wantTab = hash === '#journals' ? '사용 일지' : hash === '#reports' ? '신고' : '고치는 일';
      await page.goto(`${base}/admin.html${hash}`, { waitUntil: 'domcontentloaded' });
      // 해시만 바뀌는 이동은 문서를 다시 읽지 않는다 — 본문(h1)과 눌린 탭이 모두 새 주소를 가리킬 때까지 기다린다.
      await page.waitForFunction((h) => {
        const h1 = (document.querySelector('.lt-h1')?.textContent || '').trim();
        const tab = (document.querySelector('header nav [data-tab].is-active')?.textContent || '').replace(/\s*\d+$/, '').trim();
        return h1.includes(h) && tab === h;
      }, wantTab, { timeout: 8000 });
      const got = await read();
      // 탭 글자에는 새 글 수 숫자가 붙을 수 있다(고장·불편 1) — 탭 이름만 비교한다.
      assert.equal(String(got.activeTab || '').replace(/\s*\d+$/, ''), wantTab, hash + ' → ' + wantTab + ' 탭');
      assert.deepEqual(got.kindChips, [], hash + ' → 목록 카드의 종류 칩 없음(탭이 이미 종류를 가리킨다)');
      if (hash === '#reports') {
        assert.equal(got.reportCards, 2, '신고 카드에 처리 단추 2개');
        await page.screenshot({ path: `${shotDir}/pr1-reports.png` });
      }
      if (hash === '#journals') assert.ok(got.scoreBadges >= 1, '일지 카드에 다시 올 점수 배지');
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
});

// ---- 운영센터 고객 정보(261116 대표 결정) 화면 모델 ----
test('고객 화면 모델은 이메일 전문·가린 id·트리 공개 상표·열람 기록을 그대로 전한다', () => {
  const cards = customerSummaryCards({ok: true, payload: {ok: true, stats: {accounts: {total: 10, real: 6, aiTester: 3, tester: 1, new: {total: 2, real: 1, aiTester: 1, tester: 0}}}}});
  assert.equal(cards.error, false);
  assert.deepEqual(cards.cards.map(c => c.value), [10, 6, 3, 1]);
  assert.equal(cards.cards[0].detail, '7일 새 2');
  // 숫자가 빠진 응답은 0으로 지어내지 않고 '불러오지 못했어요'로 간다.
  assert.equal(customerSummaryCards({ok: false}).error, true);
  assert.equal(customerSummaryCards({ok: true, payload: {ok: true, stats: {accounts: {total: 10}}}}).error, true);

  const rows = customerRows({ok: true, payload: {ok: true, customers: [{
    subjectId: 'sub_b200000000000000', subjectMasked: 'sub_…0000', email: 'boram@example.com', displayName: '보람',
    role: 'ai_customer', roleLabel: 'AI 명예회원', joinedAt: '2026-11-02T09:00:00.000Z', lastLoginAt: '2026-11-16T08:00:00.000Z',
    lastActivityAt: '2026-11-16T08:30:00.000Z', treeCount: 1, momentCount: 3
  }]}});
  assert.equal(rows.error, false);
  assert.equal(rows.rows[0].email, 'boram@example.com', '이메일은 가리지 않는다');
  assert.equal(rows.rows[0].role, 'ai_customer', '구분 배지를 그리려면 role이 남아야 한다');
  assert.equal(rows.rows[0].subjectId, 'sub_b200000000000000', '줄 → 자세히 판 이동용 내부 식별자');
  assert.equal(rows.rows[0].subjectMasked, 'sub_…0000');

  const detail = customerDetailModel({ok: true, payload: {ok: true, customer: {
    subjectMasked: 'sub_…0000', email: 'boram@example.com', displayName: '보람', ageVerifiedAt: null,
    trees: [{id: 't3', title: '보람의 기록', visibility: '둘러보기 소개', moments: [
      {id: 'm4', title: '안녕', date: '2026-11-05', emotion: '평온', keywords: ['인사'], url: '/api/media/x.png', note: '메모', uploaded: true},
      {id: 'm5', title: '모르는 공개값', visibility: 'x'}
    ]}, {id: 't9', title: '깨진 트리', visibility: '이상한 값', moments: []}],
    media: [{name: 'a.png', mime: 'image/png', size: 10, path: '/api/admin/customers/sub_b200000000000000/media/a.png'}],
    feedback: [{id: 7, kind: 'journal', body: '일지', status: 'received', score: 4, journalDate: '2026-11-05', replyCount: 1}]
  }}});
  assert.equal(detail.error, false);
  assert.equal(detail.trees[0].visibility, '둘러보기 소개');
  assert.equal(detail.trees[1].visibility, '나만', '모르는 공개값은 지어내지 않고 나만으로 본다');
  assert.equal(detail.trees[0].moments[0].uploaded, true);
  assert.equal(detail.trees[0].moments[0].note, '메모');
  assert.equal(detail.trees[0].moments[0].keywords.join(','), '인사');
  assert.equal(detail.feedback[0].kind, 'journal');
  assert.equal(detail.ageVerifiedAt, null, '만 14세 확인 시각은 자리만 둔다(화면은 —)');
  assert.equal(customerDetailModel({ok: false}).error, true);

  const views = customerViewRows({ok: true, payload: {ok: true, views: [
    {id: '3', adminMasked: 'sub_…aa11', customerEmail: 'boram@example.com', customerName: '보람', viewedAt: '2026-11-16T09:00:00.000Z'}
  ]}});
  assert.equal(views.error, false);
  assert.equal(views.rows[0].customerEmail, 'boram@example.com');
  assert.equal(views.rows[0].adminMasked, 'sub_…aa11');
});

test('없는 시각(null·빈 값)은 —로 보이고 1970년으로 찍히지 않는다(261116)', () => {
  assert.equal(formatTime(null), '—');
  assert.equal(formatTime(undefined), '—');
  assert.equal(formatTime(''), '—');
  assert.equal(formatTime('2026-11-16T09:00:00.000Z').includes('—'), false);
});

// 2026-11-17 운영센터 탭 셋 + 고객 글 한 줄 거르기.
test('머리줄 탭은 한눈에·고객·고장·불편·요청·사용 일지·신고 여섯이다(대표 요청 2026-11-17)', () => {
  assert.deepEqual(MENU_TABS.map(t => t.label), ['한눈에', '고객', '고장·불편', '요청', '사용 일지', '신고', '고치는 일']);
  assert.deepEqual(MENU_TABS.filter(t => t.cat).map(t => t.cat), ['issue', 'request']);
  assert.deepEqual(MENU_TABS.filter(t => t.kind).map(t => t.kind), ['journal', 'report']);
  assert.deepEqual(MENU_TABS.find(t => t.view === 'issues').label, '고치는 일');
});

test('없어진 탭의 옛 주소 셋이 각각 올바른 거르기로 열린다', () => {
  assert.deepEqual(parseHash('#journals'), {view: 'board', id: null, status: '', kind: 'journal'});
  assert.deepEqual(parseHash('#reports'), {view: 'board', id: null, status: 'pending', kind: 'report'});
  assert.deepEqual(parseHash('#fixes'), {view: 'issues', id: null, status: '', kind: ''});
  assert.deepEqual(parseHash('#issues'), {view: 'issues', id: null, status: '', kind: ''});
});

const boardFixture = () => [
  {id: 1, kind: 'opinion', status: 'received', issueNumber: '', replyCount: 0},
  {id: 2, kind: 'opinion', status: 'reviewing', issueNumber: 584, replyCount: 1},
  {id: 3, kind: 'opinion', status: 'fixed', issueNumber: 584, replyCount: 1},
  {id: 4, kind: 'journal', status: 'received', issueNumber: '', replyCount: 0},
  {id: 5, kind: 'report', status: 'reviewing', issueNumber: '', replyCount: 0},
  {id: 6, kind: 'opinion', status: 'later', issueNumber: '', replyCount: 1},
  {id: 7, kind: 'opinion', status: 'closed', issueNumber: '', replyCount: 1}
];

test('고객 글 상태 한 줄: 할 일·고침·더 보기 숫자가 고른 종류 안에서 센다', () => {
  const rows = boardFixture();
  const tabs = boardStatusTabs(rows);
  assert.deepEqual(tabs.map(t => t.key), ['pending', 'fixed', 'more']); // 종류 '전체'와 겹치던 상태 '전체' 칸 제거
  assert.deepEqual(tabs.map(t => t.count), [4, 1, 4]); // 할 일 1·2·4·5, 고침 3, 더 보기 2·3·6·7(이슈 있는 2·3 포함)
  // 종류를 골라도 같은 식으로 센다 — '의견'이면 의견 중 할 일 2·고침 1·더 보기 4.
  const opinion = boardStatusTabs(rows, 'opinion');
  assert.deepEqual(opinion.map(t => t.count), [2, 1, 4]);
  for (const t of tabs) {
    assert.equal(t.count, filterBoardRows(rows, {status: t.key}).length, t.label + ' 숫자 = 실제 줄 수');
  }
  // 칩 숫자 = 그 종류·상태로 실제 화면에 그리는 카드 수.
  for (const kind of ['', 'opinion', 'journal', 'report']) {
    for (const status of ['pending', 'fixed', 'more']) {
      const expected = boardStatusTabs(rows, kind).find(t => t.key === status).count;
      assert.equal(filterBoardRows(rows, {kind, status}).length, expected, `${kind || '전체'}×${status} 카드 수`);
    }
  }
});

test('고객 글 종류 묶음: 전체·의견·일지·신고 숫자가 현재 상태의 합과 맞는다', () => {
  const rows = boardFixture();
  const tabs = boardKindTabs(rows, 'pending');
  assert.deepEqual(tabs.map(t => t.label), ['전체', '의견', '일지', '신고']);
  assert.deepEqual(tabs.map(t => t.count), [4, 2, 1, 1]);
  assert.equal(tabs[0].count, tabs.slice(1).reduce((sum, t) => sum + t.count, 0), '전체 = 의견+일지+신고');
  assert.deepEqual(boardKindTabs(rows, 'all').map(t => t.count), [7, 5, 1, 1]);
});

test('첫 열기는 할 일, 숫자 0인 칸은 화면에서 숨긴다', () => {
  const rows = boardFixture();
  assert.equal(filterBoardRows(rows).length, 4, '상태를 고르지 않으면 할 일');
  assert.deepEqual(boardStatusTabs(rows).map(t => t.count > 0), [true, true, true]);
  // 신고만 있으면 상태 칸은 할 일 1개뿐 — 고침·더 보기는 0 → 숨김 대상이다.
  const reports = boardStatusTabs(rows, 'report');
  assert.deepEqual(reports.map(t => t.count), [1, 0, 0]);
  assert.deepEqual(reports.filter(t => t.count > 0).map(t => t.label), ['할 일']);
  // 고른 칩을 다시 누르면 status=all — 칸은 없고 그 종류의 모든 글이 보인다.
  assert.equal(filterBoardRows(rows, {status: 'all'}).length, 7, '전체 해제 = 모든 글');
  assert.deepEqual(boardStatusTabs(rows).map(t => t.key), ['pending', 'fixed', 'more'], 'all은 칸으로 보이지 않는다');
});

test('운영센터 폭 통일 + 한눈에 카드 4·3 + 고객 칸 이름(1440·390 × 밤·정원)', { skip: adminSkip || false, timeout: 180000 }, async () => {
  if (adminSkip) assert.fail(`건너뜀=실패 — ${adminSkip}`);
  const { mkdirSync } = await import('node:fs');
  const shotDir = process.env.LT_OPS_SHOT_DIR || 'E:\\lovetree-qa\\local4\\운영센터';
  mkdirSync(shotDir, { recursive: true });
  const { serve } = await import('./helpers/screen-audit.mjs');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const stats = {ok: true, stats: {
    accounts: {total: 15, real: 9, aiTester: 3, tester: 3},
    trees: {total: 25, real: 15, aiTester: 5, tester: 5, public: {total: 11, real: 6, aiTester: 2, tester: 3}},
    moments: {total: 105, real: 70, aiTester: 20, tester: 15}
  }};
  const browser = await adminChromium.launch({ headless: true,
    ...(process.env.LT_ADMIN_BROWSER_EXE ? { executablePath: process.env.LT_ADMIN_BROWSER_EXE } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/api/admin/session', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, authenticated: true, admin: true}) }));
    await context.route('**/api/admin/feedback', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, feedback: [
      {id: 'p1', kind: 'opinion', status: 'received', replyCount: 0, displayTitle: '새 의견', createdAt: '2026-11-16T09:00:00Z'},
      {id: 'p2', kind: 'opinion', status: 'reviewing', replyCount: 0, displayTitle: '확인 중', createdAt: '2026-11-16T10:00:00Z'},
      {id: 'p3', kind: 'journal', status: 'received', replyCount: 0, score: 4, journalDate: '2026-11-16', displayTitle: '일지', createdAt: '2026-11-16T11:00:00Z'}
    ]}) }));
    await context.route('**/api/admin/journals', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, journals: []}) }));
    await context.route('**/api/community/admin/reports', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, reports: [{id: 'r1', status: 'open', hidden: false, reason: '신고', shareId: 'sh_1', createdAt: '2026-11-16T12:00:00Z'}]}) }));
    await context.route('**/api/admin/stats', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stats) }));
    await context.route('**/api/admin/customers/views*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, views: []}) }));
    await context.route('**/api/admin/customers', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ok: true, customers: [
      {subjectId: 's1', subjectMasked: 'sub_…1111', email: 'fan@example.com', displayName: '', role: 'real', roleLabel: '실제 고객', joinedAt: '2026-11-01T00:00:00Z', lastLoginAt: '', lastActivityAt: '', treeCount: 1, momentCount: 3},
      {subjectId: 's2', subjectMasked: 'sub_…2222', email: 'named@example.com', displayName: '이름있음', role: 'real', roleLabel: '실제 고객', joinedAt: '2026-11-01T00:00:00Z', lastLoginAt: '', lastActivityAt: '', treeCount: 1, momentCount: 3}
    ]}) }));
    await context.route(/^https:\/\/api\.github\.com\//, r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"not found"}' }));
    const page = await context.newPage();
    const measure = () => page.evaluate(() => {
      const shell = document.querySelector('.admin-shell');
      const tops = [...document.querySelectorAll('.is-overview .lt-stats .lt-stat-cell')].map(el => Math.round(el.getBoundingClientRect().top));
      const todoTops = [...document.querySelectorAll('.is-overview .lt-ov-cards .lt-ov-card')].map(el => Math.round(el.getBoundingClientRect().top));
      const names = [...document.querySelectorAll('.lt-cust-name')].map(el => ({text: el.textContent.trim(), hasName: el.classList.contains('has-name'), weight: getComputedStyle(el).fontWeight}));
      return {
        width: Math.round(shell?.getBoundingClientRect().width || 0),
        statCount: document.querySelectorAll('.lt-stats .lt-stat-cell').length,
        todoCount: document.querySelectorAll('.lt-ov-cards .lt-ov-card').length,
        statRows: new Set(tops).size, todoRows: new Set(todoTops).size,
        names,
        sub: document.querySelector('.lt-board-head .lt-sub')?.textContent.trim() || ''
      };
    });
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const widths = {};
      for (const theme of ['night', 'garden']) {
        await page.evaluate(t => { if (t === 'garden') document.documentElement.setAttribute('data-lt-theme', 'garden'); else document.documentElement.removeAttribute('data-lt-theme'); }, theme);
        for (const [name, hash] of [['overview', '#overview'], ['customers', '#customers'], ['board', '#board']]) {
          await page.goto(`${base}/admin.html${hash}`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.admin-shell', { timeout: 8000 });
          await page.waitForTimeout(150);
          const got = await measure();
          widths[name] = got.width;
          if (width === 1440) assert.equal(got.width, 1180, `${name}·${theme} 본문 폭 1180`);
          else assert.ok(got.width >= 330 && got.width <= 390, `${name}·${theme} 390에서 꽉 참(실제 ${got.width})`);
          if (name === 'overview') {
            assert.equal(got.statCount, 4, '숫자 카드 4장');
            assert.equal(got.todoCount, 3, '할 일 카드 3장');
            if (width === 1440) {
              assert.equal(got.statRows, 1, '1440에서 숫자 4장 한 줄');
              assert.equal(got.todoRows, 1, '1440에서 할 일 3장 한 줄');
            }
          }
          if (name === 'customers') {
            assert.deepEqual(got.names, [
              {text: 'fan', hasName: false, weight: '400'},
              {text: '이름있음', hasName: true, weight: '700'}
            ], '이메일 @ 앞부분은 보통 굵기, 표시 이름은 굵게');
            assert.equal(got.sub, '열 때마다 열람 기록이 남아요');
          }
          await page.screenshot({ path: `${shotDir}/pr2-${name}-${width}-${theme}.png` });
        }
      }
      assert.equal(new Set(Object.values(widths)).size, 1, width + '에서 세 탭 본문 폭이 같다');
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
});

