import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newsLineLabel,
  newsAiLabel,
  newsTargetLabel,
  newsDayLabel,
  renderMyNews,
  mountMyNews,
  MY_NEWS_NOT_READY_TEXT,
  MY_NEWS_PANEL_ID
} from '../public/v41/my-news.mjs';

// #1098 3단계 — 내 소식 창의 줄 모양·문구·점 숫자 규칙(순수 한 벌). 실제 창 동작은 화면 시험(브라우저)이 잡는다.
// 서버는 줄을 하루(한국 날짜)·종류·대상으로 묶어 최신순으로 내려 준다(#1159) — 화면은 그 순서를 그대로 그린다.

const TREES = [
  { id: 't1', title: '첫 무대', moments: [{ id: 'm1', title: '이어지는 순간' }, { id: 'm2', note: '제목 없는 기록' }] },
  { id: 't2', title: '', subject: '다른 트리', moments: [] }
];

test('줄 이름표 — 같은 순간의 ♡ 5개는 한 줄(♡ 5), 댓글·담기도 같은 모양이다', () => {
  assert.equal(newsLineLabel({ kind: 'heart', count: 5 }), '♡ 5');
  assert.equal(newsLineLabel({ kind: 'comment', count: 2 }), '댓글 2');
  assert.equal(newsLineLabel({ kind: 'favorite', count: 3 }), '담기 3');
  assert.equal(newsLineLabel({ kind: 'heart', count: 1 }), '♡ 1');
});

test('줄 이름표 — 모르는 종류·개수 0은 빈 값(그리지 않는다)', () => {
  assert.equal(newsLineLabel({ kind: 'wow', count: 3 }), '');
  assert.equal(newsLineLabel({ kind: 'heart', count: 0 }), '');
  assert.equal(newsLineLabel({ count: 4 }), '');
  assert.equal(newsLineLabel(null), '');
});

test('AI 명예회원 몫은 구분 이름표로, 0이면 표시하지 않는다(계정 정보는 어디에도 없다)', () => {
  assert.equal(newsAiLabel({ aiCount: 2 }), 'AI 명예회원 2');
  assert.equal(newsAiLabel({ aiCount: 0 }), '');
  assert.equal(newsAiLabel({}), '');
});

test('대상 이름표 — 내 기록에서 트리·순간을 찾아 붙인다. 못 찾으면 빈 값', () => {
  assert.equal(newsTargetLabel({ treeId: 't1' }, TREES), '첫 무대');
  assert.equal(newsTargetLabel({ treeId: 't1', momentId: 'm1' }, TREES), '첫 무대 · 이어지는 순간');
  assert.equal(newsTargetLabel({ treeId: 't1', momentId: 'm2' }, TREES), '첫 무대 · 제목 없는 기록', '제목이 없으면 마음 한마디를 쓴다');
  assert.equal(newsTargetLabel({ treeId: 't1', momentId: '없는 순간' }, TREES), '첫 무대', '지워진 순간은 트리 이름만');
  assert.equal(newsTargetLabel({ treeId: 't2' }, TREES), '다른 트리', '빈 제목은 기록한 대상 이름으로');
  assert.equal(newsTargetLabel({ treeId: '없는 트리' }, TREES), '');
  assert.equal(newsTargetLabel({ treeId: 't1' }, []), '');
});

test('날짜 줄 — 서버의 한국 날짜를 M월 D일로. 올해가 아니면 연도를 앞에 붙인다', () => {
  assert.equal(newsDayLabel('2026-11-22'), '11월 22일');
  assert.equal(newsDayLabel('2026-01-05'), '1월 5일');
  assert.equal(newsDayLabel('2025-12-03', 2026), '2025년 12월 3일');
  assert.equal(newsDayLabel(''), '');
  assert.equal(newsDayLabel('2026-13-40'), '');
  assert.equal(newsDayLabel('11월 22일'), '');
});

test('목록 그리기 — 서버 순서(최신순) 그대로, 하루가 바뀌는 자리에 날짜 줄이 하나씩', () => {
  const html = renderMyNews([
    { day: '2026-11-22', kind: 'heart', count: 3, treeId: 't1' },
    { day: '2026-11-22', kind: 'comment', count: 1, treeId: 't1', momentId: 'm1', lastBody: '소식이 될 댓글' },
    { day: '2026-11-21', kind: 'favorite', count: 2, treeId: 't1' }
  ], { trees: TREES });
  const labels = [...html.matchAll(/class="my-news-label">([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(labels, ['♡ 3', '댓글 1', '담기 2'], '서버가 준 최신순을 그대로 그린다');
  const days = [...html.matchAll(/class="my-news-day">([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(days, ['11월 22일', '11월 21일'], '하루가 바뀌는 자리에만 날짜 줄');
  assert.ok(html.includes('소식이 될 댓글'), '댓글 줄에는 가장 최근 본문이 함께 온다');
  assert.ok(html.includes('첫 무대 · 이어지는 순간'), '대상 이름표');
  assert.ok(html.includes('role="listitem"'), '줄은 목록 항목이다');
});

test('목록 그리기 — 빈 목록은 안내 한 줄, 알 수 없는 줄은 빠뜨리지 않고 거른다', () => {
  const empty = renderMyNews([]);
  assert.ok(empty.includes('아직 새 소식이 없어요'));
  const html = renderMyNews([
    { day: '2026-11-22', kind: 'like', count: 4, treeId: 't1' },
    { day: '2026-11-22', kind: 'heart', count: 1, aiCount: 1, treeId: 't1' }
  ], { trees: TREES });
  assert.ok(html.includes('♡ 1'));
  assert.ok(html.includes('AI 명예회원 1'), '명예회원 몫은 구분 이름표로');
  assert.ok(!html.includes('like'), '모르는 반응 종류는 소식 줄이 아니다');
});

test('목록 그리기 — 본문·이름표의 특수 문자는 그대로 보이게(스크립트가 아니라 글자로)', () => {
  const html = renderMyNews([{ day: '2026-11-22', kind: 'comment', count: 1, treeId: 't1', lastBody: '<img src=x onerror=alert(1)>안녕' }], { trees: TREES });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
});

test('창 열기 — 성공하면 목록을 채우고 읽음 표시가 서버에 남았으므로 점을 바로 지운다(0)', async () => {
  const elements = {};
  const $ = id => elements[id] || (elements[id] = { id, innerHTML: '', hidden: true, textContent: '' });
  const panels = [];
  let asked = 0;
  const mount = mountMyNews({
    $,
    showPanel: id => panels.push(id),
    fetchNews: async () => { asked += 1; return { ok: true, lines: [{ day: '2026-11-22', kind: 'heart', count: 5, treeId: 't1' }], lastReadAt: '2026-11-22T09:00:00.000Z' }; },
    fetchCount: async () => 3,
    getTrees: () => TREES,
    onCount: value => { $('account-dot-count').textContent = String(value); }
  });
  assert.equal(await mount.refreshCount(), 3, '점용 숫자 — 안 읽은 줄 수');
  assert.equal($('account-dot-count').textContent, '3');
  const lines = await mount.open();
  assert.deepEqual(lines, [{ day: '2026-11-22', kind: 'heart', count: 5, treeId: 't1' }]);
  assert.equal(asked, 1, '목록 한 번 — 읽음 표시는 이 한 번의 읽기에 서버가 남긴다(#1159)');
  assert.deepEqual(panels, [MY_NEWS_PANEL_ID]);
  assert.ok($('my-news-list').innerHTML.includes('♡ 5'));
  assert.equal($('my-news-error').hidden, true, '성공했으면 안내 줄은 숨는다');
  assert.equal($('account-dot-count').textContent, '0', '창을 열었으므로 점은 바로 사라진다');
  assert.equal(mount.lastCount(), 0);
});

test('창 열기 — 실패하면 창 안에 짧은 안내 한 줄만 남기고, 점은 지우지 않는다', async () => {
  const elements = {};
  const $ = id => elements[id] || (elements[id] = { id, innerHTML: '', hidden: true, textContent: '' });
  const panels = [];
  const painted = [];
  const mount = mountMyNews({
    $,
    showPanel: id => panels.push(id),
    fetchNews: async () => ({ ok: false, status: 500 }),
    fetchCount: async () => 2,
    getTrees: () => TREES,
    onCount: value => painted.push(value)
  });
  await mount.refreshCount();
  assert.deepEqual(painted, [2]);
  const lines = await mount.open();
  assert.equal(lines, null);
  assert.deepEqual(panels, [MY_NEWS_PANEL_ID], '실패해도 창은 같은 틀로 열린다(빈 화면·깨진 화면 없음)');
  assert.equal($('my-news-error').hidden, false);
  assert.equal($('my-news-error').textContent, MY_NEWS_NOT_READY_TEXT);
  assert.equal($('my-news-list').innerHTML, '', '실패한 목록 내용은 남기지 않는다');
  assert.deepEqual(painted, [2], '읽음 표시가 서버에 남지 않았으므로 점 숫자는 그대로다');
});

test('창 열기 — 연결이 끊겨도(예외) 같은 안내 한 줄', async () => {
  const elements = {};
  const $ = id => elements[id] || (elements[id] = { id, innerHTML: '', hidden: true, textContent: '' });
  const mount = mountMyNews({ $, showPanel: () => {}, fetchNews: async () => { throw new Error('offline'); }, fetchCount: async () => null, getTrees: () => TREES, onCount: () => {} });
  await mount.open();
  assert.equal($('my-news-error').hidden, false);
  assert.equal($('my-news-error').textContent, MY_NEWS_NOT_READY_TEXT);
});

test('점용 숫자 — 실패하면 지금 점을 바꾸지 않는다(모른다고 0으로 두지 않는다)', async () => {
  const elements = {};
  const $ = id => elements[id] || (elements[id] = { id, innerHTML: '', hidden: true, textContent: '' });
  const painted = [];
  const mount = mountMyNews({ $, showPanel: () => {}, fetchNews: async () => null, fetchCount: async () => { throw new Error('offline'); }, getTrees: () => [], onCount: value => painted.push(value) });
  assert.equal(await mount.refreshCount(), null);
  assert.deepEqual(painted, []);
  assert.equal(await mount.refreshCount(), null);
  assert.deepEqual(painted, []);
});

test('점용 숫자 — community-api의 실제 응답 모양({ok, unreadCount})도 같은 길로 점이 된다', async () => {
  const elements = {};
  const $ = id => elements[id] || (elements[id] = { id, innerHTML: '', hidden: true, textContent: '' });
  const painted = [];
  const mount = mountMyNews({ $, showPanel: () => {}, fetchNews: async () => null, fetchCount: async () => ({ ok: true, status: 200, unreadCount: 3 }), getTrees: () => [], onCount: value => painted.push(value) });
  assert.equal(await mount.refreshCount(), 3, '두 경로 응답의 unreadCount가 점용 숫자가 된다');
  assert.deepEqual(painted, [3]);
  const failed = mountMyNews({ $, showPanel: () => {}, fetchNews: async () => null, fetchCount: async () => ({ ok: false, status: 503, code: 'unavailable' }), getTrees: () => [], onCount: value => painted.push(value) });
  assert.equal(await failed.refreshCount(), null, '실패 응답({ok:false})은 점을 바꾸지 않는다');
  assert.deepEqual(painted, [3]);
});

test('빈 목록을 열어도 점은 0으로 지워진다(읽음 표시는 서버에 남았다)', async () => {
  const elements = {};
  const $ = id => elements[id] || (elements[id] = { id, innerHTML: '', hidden: true, textContent: '' });
  const painted = [];
  const mount = mountMyNews({ $, showPanel: () => {}, fetchNews: async () => ({ ok: true, lines: [] }), fetchCount: async () => 0, getTrees: () => TREES, onCount: value => painted.push(value) });
  await mount.refreshCount();
  await mount.open();
  assert.ok($('my-news-list').innerHTML.includes('아직 새 소식이 없어요'));
  assert.deepEqual(painted, [0, 0]);
});
