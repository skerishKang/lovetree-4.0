import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_ORDER, PERSONA_FIELDS,
  richParagraph, formatTime, parseHash, viewHash, viewToTab,
  filterRows, statusTabs, kindTabs, STATUS_LABEL,
  linkedIssueNumbers, issueStateLabel, needsFixButton,
  statusChangeMessage, buildIssueUrl, issueLink, escapeText
} from '../src/admin-view.js';

test('주소 해시를 화면 상태로 바꾼다(#564 2)', () => {
  assert.deepEqual(parseHash(''), {view: 'board', id: null, status: '', kind: ''});
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
  for (const hash of ['#board', '#board?status=reviewing', '#board?kind=journal', '#board?status=closed&kind=opinion', '#reports', '#issues', '#feedback/p1', '#persona/x']) {
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
});

test("GitHub open/closed를 '고치는 중/고침 완료'로 바꿔 쓴다(#570 4)", () => {
  assert.equal(issueStateLabel('open'), '고치는 중');
  assert.equal(issueStateLabel('closed'), '고침 완료');
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
