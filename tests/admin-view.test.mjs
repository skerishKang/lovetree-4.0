import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_ORDER, PERSONA_FIELDS,
  richParagraph, formatTime, parseHash, viewHash, viewToTab,
  visibleRows, statusChangeMessage, buildIssueUrl, issueLink, escapeText
} from '../src/admin-view.js';

test('주소 해시를 화면 상태로 바꾼다(#564 2)', () => {
  assert.deepEqual(parseHash(''), {view: 'board', id: null});
  assert.deepEqual(parseHash('#board'), {view: 'board', id: null});
  assert.deepEqual(parseHash('#reports'), {view: 'reports', id: null});
  assert.deepEqual(parseHash('#issues'), {view: 'issues', id: null});
  assert.deepEqual(parseHash('#feedback/abc'), {view: 'feedback', id: 'abc'});
  assert.deepEqual(parseHash('#persona/고객-01'), {view: 'persona', id: '고객-01'});
  // 모르는 모양은 목록으로 돌린다.
  assert.deepEqual(parseHash('#unknown'), {view: 'board', id: null});
  assert.deepEqual(parseHash('#feedback/'), {view: 'board', id: null});
  // id에 /가 들어가도 잃지 않는다.
  assert.deepEqual(parseHash('#feedback/a/b'), {view: 'feedback', id: 'a/b'});
});

test('화면 상태를 주소 해시로 되돌린다', () => {
  assert.equal(viewHash('board'), '#board');
  assert.equal(viewHash('reports'), '#reports');
  assert.equal(viewHash('issues'), '#issues');
  assert.equal(viewHash('feedback', 'p1'), '#feedback/p1');
  assert.equal(viewHash('persona', '고 객'), '#persona/' + encodeURIComponent('고 객'));
  // 왕복: 해시 → 상태 → 해시가 같다.
  for (const hash of ['#board', '#reports', '#issues', '#feedback/p1', '#persona/x']) {
    const view = parseHash(hash);
    assert.equal(viewHash(view.view, view.id), hash);
  }
});

test('글·페르소나 화면은 게시판 탭이 눌려 있다', () => {
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

test("목록 기본(상태 전체)은 '닫음'을 숨기고, 상태를 고르면 그대로 보인다(#564 10)", () => {
  const rows = [
    {id: '1', status: 'received'},
    {id: '2', status: 'closed'},
    {id: '3', status: 'fixed'}
  ];
  assert.deepEqual(visibleRows(rows, '').map(r => r.id), ['1', '3']);
  assert.deepEqual(visibleRows(rows, null).map(r => r.id), ['1', '3']);
  // 상태를 골랐을 때는 서버 결과를 그대로 쓴다.
  assert.deepEqual(visibleRows(rows, 'closed').map(r => r.id), ['1', '2', '3']);
  assert.deepEqual(visibleRows(undefined, ''), []);
});

test("상태 알림 문구는 받침에 따라 '으로/로'를 고른다(#564 6)", () => {
  assert.equal(statusChangeMessage('received'), "상태를 '받음'으로 바꿨어요");
  assert.equal(statusChangeMessage('reviewing'), "상태를 '확인 중'으로 바꿨어요");
  assert.equal(statusChangeMessage('fixed'), "상태를 '고침'으로 바꿨어요");
  assert.equal(statusChangeMessage('later'), "상태를 '다음에'로 바꿨어요");
  assert.equal(statusChangeMessage('closed'), "상태를 '닫음'으로 바꿨어요");
});

test("'닫음' 상태가 상태 목록에 있다(#564 10)", () => {
  assert.ok(STATUS_ORDER.includes('closed'));
  assert.equal(PERSONA_FIELDS.length, 6);
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
