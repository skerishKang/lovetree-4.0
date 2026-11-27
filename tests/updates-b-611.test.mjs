// #611 4번(내 의견 손질): 새 답글 숫자·닫으면 사라짐 · 고객 덧붙이기 · 새 소식 링크.
// DOM이 없는 Node 시험 — createFeedbackBoard에 작은 가짜 DOM을 준다(크롬 화면은 updates-screen-611.test.mjs의 패턴을 따른다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFeedbackBoard, unreadReplyCount } from '../public/v41/feedback-board.mjs';
import { journalRowsByCustomer } from '../src/admin-view.js';

function fakeEl(name) {
  return {
    name, innerHTML: '', textContent: '', value: '', hidden: false, open: false, dataset: {},
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector() { return fakeEl(name + '-child'); },
    querySelectorAll() { return []; },
    reset() {}, showModal() { this.open = true; }, close() { this.open = false; },
    focus() {}, click() {}
  };
}

const UPDATES = readFileSync(new URL('../public/v41/updates.json', import.meta.url), 'utf8');

function mount(fetchImpl, posts, opts = {}) {
  const els = {
    'journal-panel': fakeEl('journal-panel'), 'journal-form': fakeEl('journal-form'),
    'journal-error': fakeEl('journal-error'), 'myposts-panel': fakeEl('myposts-panel'),
    'myposts-list': fakeEl('myposts-list'), 'journal-save': fakeEl('journal-save')
  };
  const $ = id => els[id] || fakeEl(id);
  const counts = [];
  const opened = [];
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const board = createFeedbackBoard({
    $, notify: () => {}, show: () => els['journal-panel'].showModal(), showFull: () => els['myposts-panel'].showModal(),
    onReplyCount: n => counts.push(n), onOpenUpdates: v => opened.push(v), storage,
    isLoggedIn: opts.isLoggedIn, memberPhase: opts.memberPhase
  });
  const realFetch = globalThis.fetch, realConfirm = globalThis.LT41Confirm;
  globalThis.LT41Confirm = {ask: async () => opts.confirmAnswer ?? true};
  globalThis.fetch = async (path, init) => {
    if (typeof fetchImpl === 'function') return fetchImpl(path, init);
    return {
      ok: true, status: 200,
      json: async () => (path === '/v41/updates.json' ? JSON.parse(UPDATES) : {posts})
    };
  };
  return { board, els, counts, opened, restore: () => { globalThis.fetch = realFetch; globalThis.LT41Confirm = realConfirm; } };
}

test('611 4번: 안 본 운영센터 답글만 센다(내 덧붙임은 빼고)', () => {
  const posts = [
    {id: 1, replies: [{id: 11, mine: false, body: 'a'}, {id: 12, mine: true, body: 'b'}]},
    {id: 2, replies: []}
  ];
  assert.equal(unreadReplyCount(posts, new Set()), 1);
  assert.equal(unreadReplyCount(posts, new Set([11])), 0);
  assert.equal(unreadReplyCount(null, new Set()), 0);
});

test('#1211: 받은 운영센터 답글은 이름과 본문을 표시하고 수정 단추가 없다', async()=>{
  const posts=[{id:5,kind:'opinion',status:'fixed',body:'의견',replies:[{id:21,authorType:'customer',authorName:'운영센터',mine:false,canEdit:false,canDelete:false,body:'답글을 받았어요.'}]}];
  const {board,els,restore}=mount(null,posts);
  try{
    await board.openMyPosts();
    const html=els['myposts-list'].innerHTML;
    assert.match(html,/<span>운영센터<\/span>/);
    assert.match(html,/답글을 받았어요\./);
    assert.doesNotMatch(html,/data-reply-edit=|data-reply-delete=/);
  }finally{restore();}
});

test('611 4번: 열어 보면 사라진다 — 내 의견 목록의 숫자는 0으로 보고된다', async () => {
  const posts = [{id: 5, kind: 'opinion', status: 'fixed', issueNumber: '#608', displayTitle: '보드 날짜', body: '기력', createdAt: '2026-11-14T00:00:00Z', replies: [{id: 21, authorType: 'customer', mine: false, body: '봤어요'}]}];
  const {board, els, counts, restore} = mount(null, posts);
  try {
    await board.openMyPosts();
    assert.equal(counts.at(-1), 0, '열면 사라진다');
    const html = els['myposts-list'].innerHTML;
    assert.match(html, /내 덧붙임|답변/, '답글 줄이 있다');
    assert.match(html, /data-followup="5"/, '덧붙이기 칸이 있다');
    assert.match(html, /새 소식에도 올렸어요 — 4\.1\.3 보기/, '새 소식 링크가 버전과 함께 있다');
    assert.match(html, /이슈 #608/, '상태 줄에는 이슈가 남는다');
    // 같은 저장소로 다시 묻는다 — 열어 본 답글이어서 다시 켜지지 않는다.
    assert.equal(await board.refreshReplyDot(), 0);
    // 저장소가 새 것이면 다시 보이는 것도 자연스럽다(새 기기).
  } finally { restore(); }
});

test('#1541 내 덧붙임 삭제는 앱 확인 창의 취소·확인을 따른다', async () => {
  for (const answer of [false, true]) {
    const posts = [{id: 5, kind: 'opinion', status: 'fixed', body: '의견', replies: [{id: 21, authorType: 'customer', mine: true, canDelete: true, body: '내 덧붙임'}]}];
    const deletes = [];
    const {board, els, restore} = mount((path, init) => {
      if (init?.method === 'DELETE') { deletes.push(path); return {ok: true, status: 200, json: async () => ({ok: true})}; }
      return {ok: true, status: 200, json: async () => ({posts})};
    }, posts, {confirmAnswer: answer});
    try {
      const reply = fakeEl('reply'); reply.dataset.replyId = '21';
      const post = fakeEl('post'); post.dataset.followup = '5';
      const button = fakeEl('delete');
      button.closest = selector => selector === '.myposts-reply' ? reply : post;
      els['myposts-list'].querySelectorAll = selector => selector === '[data-reply-delete]' ? [button] : [];
      await board.openMyPosts();
      await button.listeners.click();
      assert.equal(deletes.length, answer ? 1 : 0);
    } finally { restore(); }
  }
});

test('A-20: 의견 답글 시각도 날짜 표기 설정을 따른다', async () => {
  const posts = [{id: 7, kind: 'opinion', status: 'closed', issueNumber: '#700', displayTitle: '날짜', body: '의견', createdAt: '2026-11-14T09:00:00Z', replies: [{id: 71, authorType: 'staff', mine: false, body: '답변'}]}];
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => (key === 'lt41.dateStyle' ? 'dash' : null) };
  const {board, els, restore} = mount(null, posts);
  try {
    await board.openMyPosts();
    assert.match(els['myposts-list'].innerHTML, /2026-11-14/, 'dash 표기가 답글 시각에도 적용된다');
    assert.doesNotMatch(els['myposts-list'].innerHTML, /2026\. 11\. 14/, '기본 표기가 남지 않는다');
  } finally { restore(); globalThis.localStorage = previous; }
});

test('611 4번: 반영 안 된 의견에는 새 소식 링크를 단지 않는다', async () => {
  const posts = [{id: 6, kind: 'opinion', status: 'reviewing', issueNumber: null, displayTitle: '아직', body: '기력', createdAt: '2026-11-14T00:00:00Z', replies: []}];
  const {board, els, restore} = mount(null, posts);
  try {
    await board.openMyPosts();
    assert.doesNotMatch(els['myposts-list'].innerHTML, /새 소식에도 올렸어요/, '링크 없음');
    assert.match(els['myposts-list'].innerHTML, /data-followup="6"/, '덧붙이기 칸은 있다');
  } finally { restore(); }
});

test('611 3번·호칭 결정: 운영센터 일지 줄의 AI 고객 이름을 AI 명예회원으로 알린다', () => {
  const rows = journalRowsByCustomer([
    {id: 1, subjectId: 'ai', authorName: '윤제', authorRole: 'ai_customer', journalDate: '2026-11-14', score: 4},
    {id: 2, subjectId: 'me', authorName: null, authorRole: null, journalDate: '2026-11-14', score: 3}
  ]);
  assert.equal(rows.find(r => r.subjectId === 'ai').name, 'AI 명예회원 윤제');
  assert.equal(rows.find(r => r.subjectId === 'me').name, '고객');
});

// ── 하은 2회차(261116) ⑥: '오래된 글(#20)이 빠진다' 확인 ─────────────────────────────────
// 진단(운영 DB READ ONLY, SELECT만): #20은 하은 글이 아니다 — #N은 고객별 번호가 아니라
// 전체 글 일련번호다(#18 윤제·#19 보람·#20 무편성 계정·#21~#24 하은). 하은 목록 4건은 온전하다.
// 이 시험은 화면 계약을 고정한다: 서버가 돌려준 글을 하나도 빼지 않고, 서버 순서(최신 먼저)대로 그린다.
// 개수 제한은 서버 몫(listBySubject LIMIT 200 — 넘으면 오래된 것부터 잘린다)이고 '더 보기'는 없는 UI다.
test('하은2회차 ⑥: 내 의견 목록은 서버가 돌려준 글을 빠뜨리지 않고 최신 먼저 그린다', async () => {
  const posts = [
    { id: 24, kind: 'opinion', status: 'received', body: '네 번째', createdAt: '2026-11-16T11:27:08Z', replies: [] },
    { id: 23, kind: 'opinion', status: 'received', body: '세 번째', createdAt: '2026-11-16T11:26:55Z', replies: [] },
    { id: 22, kind: 'journal', status: 'received', body: '일지', createdAt: '2026-11-15T20:54:57Z', replies: [] },
    { id: 21, kind: 'opinion', status: 'reviewing', body: '두 번째', createdAt: '2026-11-15T20:51:32Z', replies: [] },
    { id: 12, kind: 'opinion', status: 'fixed', issueNumber: '#600', body: '가장 오래된 글', createdAt: '2026-11-14T09:00:00Z', replies: [] }
  ];
  const { board, els, restore } = mount(null, posts);
  try {
    await board.openMyPosts();
    const html = els['myposts-list'].innerHTML;
    for (const id of [24, 23, 22, 21, 12]) assert.match(html, new RegExp(`myposts-no">#${id}<\/span>`), `#${id}도 목록에 있다(빠지지 않는다)`);
    // 서버 순서(최신 먼저)대로 그린다 — 화면이 임의로 다시 섞지 않는다.
    const order = [...html.matchAll(/myposts-no">#(\d+)<\/span>/g)].map((m) => Number(m[1]));
    assert.deepEqual(order, [24, 23, 22, 21, 12], '서버가 준 순서(최신 먼저) 그대로다');
  } finally { restore(); }
});

test('#1273 6번: 보낸 직후 응답의 의견이 내 의견 목록에 바로 나온다', async () => {
  const posts = [{id: 9, kind: 'opinion', status: 'received', body: '먼저 보낸 의견', createdAt: '2026-11-24T00:00:00Z', replies: []}];
  const {board, els, restore} = mount(null, posts);
  try {
    await board.openMyPosts();
    assert.match(els['myposts-list'].innerHTML, /#9<\/span>/);
    await board.addSentPost({id: 10, kind: 'opinion', status: 'received', title: '새 의견', body: '방금 보낸 의견', createdAt: '2026-11-24T00:01:00Z'});
    const html = els['myposts-list'].innerHTML;
    assert.match(html, /#10<\/span>/, '다시 부르기 전에도 새 의견이 보인다');
    assert.match(html, /방금 보낸 의견/, '응답에 담긴 본문으로 그린다');
    // 같은 번호를 두 번 넣어도 목록에 한 번만 있다.
    await board.addSentPost({id: 10, kind: 'opinion', status: 'received', body: '방금 보낸 의견', createdAt: '2026-11-24T00:01:00Z'});
    assert.equal([...els['myposts-list'].innerHTML.matchAll(/#10<\/span>/g)].length, 1);
  } finally { restore(); }
});

test('#1273 6번: 로그인 상태에서 세션이 늦거나 401이어도 로그인 안내가 뜨지 않는다', async () => {
  const unauthorized = () => ({ok: false, status: 401, message: '로그인이 필요해요.', json: async () => ({})});
  const {board, els, restore} = mount(unauthorized, [], {isLoggedIn: () => true, memberPhase: () => 'synced'});
  try {
    await board.openMyPosts();
    const html = els['myposts-list'].innerHTML;
    assert.doesNotMatch(html, /로그인이 필요해요/, '로그인 상태에는 그 문구를 띄우지 않는다');
    assert.match(html, /로그인을 확인하고 있어요/, '세션 확인 중으로 안내한다');
  } finally { restore(); }
});

test('#1273 6번: 세션 확인이 끝나기 전에는 목록을 부르지 않는다', async () => {
  const calls = [];
  const {board, restore} = mount(path => {
    calls.push(path);
    return {ok: true, status: 200, json: async () => (path === '/v41/updates.json' ? JSON.parse(UPDATES) : {posts: []})};
  }, [], {isLoggedIn: () => true, memberPhase: (() => { let n = 0; return () => (n++ < 2 ? 'checking' : 'synced'); })()});
  try {
    await board.openMyPosts();
    assert.deepEqual(calls.filter(p => p === '/api/board/mine'), ['/api/board/mine']);
  } finally { restore(); }
});

test('#1273 6번: 창을 닫은 상태에서 보낸 의견도 다시 열면 목록에 있다', async () => {
  const {board, els, restore} = mount(null, []);
  try {
    await board.addSentPost({id: 12, kind: 'opinion', status: 'received', body: '닫힌 상태에서 보낸 의견', createdAt: '2026-11-24T00:03:00Z'});
    await board.openMyPosts();
    const html = els['myposts-list'].innerHTML;
    assert.match(html, /#12<\/span>/, '보낸 글은 목록에 한 번 있다');
    assert.match(html, /닫힌 상태에서 보낸 의견/);
  } finally { restore(); }
});
