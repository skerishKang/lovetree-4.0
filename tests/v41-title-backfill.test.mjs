import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeVideoId, titleBackfillTargets, backfillVideoTitles } from '../public/v41/title-backfill.mjs';
import { validateState } from '../public/v41/domain.mjs';
import { createMemberSession } from '../public/v41/member-session.mjs';

// #347 후속 B: 예전 YouTube 순간의 영상 제목 채우기 — 대상·1회 시도·실패 건너뜀·제목 불변.
const YT = 'https://youtu.be/abc123DEF45';
const state = () => ({
  version: 1,
  trees: [{
    id: 't1', subject: '나', title: '나의 순간들', coverMomentId: '', coverDesign: '', inbox: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    moments: [
      { id: 'm1', title: 'youtu.be에서 간직한 순간', note: '', emotion: '설렘', date: '2026-01-01', url: YT, parentId: null, links: [], createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'm2', title: '내가 쓴 제목', note: '', emotion: '설렘', date: '2026-01-02', url: YT, parentId: 'm1', links: [], createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'm3', title: 'youtu.be에서 간직한 순간', note: '', emotion: '설렘', date: '2026-01-03', url: YT, mediaMetadata: { title: '이미 받은 제목' }, parentId: 'm1', links: [], createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 'm4', title: '', note: '', emotion: '설렘', date: '2026-01-04', url: 'https://example.com/x', parentId: 'm1', links: [], createdAt: '2026-01-04T00:00:00.000Z' },
      { id: 'm5', title: '', note: '', emotion: '설렘', date: '2026-01-05', url: 'https://www.youtube.com/watch?v=abc123DEF45', parentId: 'm1', links: [], createdAt: '2026-01-05T00:00:00.000Z' }
    ]
  }]
});

test('0. 유튜브 주소 판정: watch·youtu.be·shorts·live·embed만', () => {
  assert.equal(youtubeVideoId(YT), 'abc123DEF45');
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abc123DEF45&t=10'), 'abc123DEF45');
  assert.equal(youtubeVideoId('https://youtube.com/shorts/abc123DEF45'), 'abc123DEF45');
  assert.equal(youtubeVideoId('https://youtube.com/live/abc123DEF45'), 'abc123DEF45');
  assert.equal(youtubeVideoId('https://youtube.com/embed/abc123DEF45'), 'abc123DEF45');
  assert.equal(youtubeVideoId('https://youtube.com.evil.test/watch?v=abc123DEF45'), '');
  assert.equal(youtubeVideoId('https://example.com/watch?v=abc123DEF45'), '');
  assert.equal(youtubeVideoId(''), '');
});

test('1. 대상: 자동 제목 + 영상 제목 없음 + YouTube만, 사용자 제목·이미 받은 제목·비YouTube 제외', () => {
  const targets = titleBackfillTargets(state());
  assert.deepEqual(targets.map((t) => t.momentId), ['m1', 'm5']);
  assert.ok(!targets.some((t) => t.momentId === 'm2'), '사용자 제목은 절대 건드리지 않는다');
  assert.ok(!targets.some((t) => t.momentId === 'm3'), '이미 영상 제목이 있으면 제외');
  assert.ok(!targets.some((t) => t.momentId === 'm4'), 'YouTube가 아니면 제외');
});

test('2. 채우기: server만, 한 번에 limit개, 성공만 한 번에 저장(제목 불변)', async () => {
  const attempted = new Set();
  const calls = [];
  const fetchTitle = async (id) => (id === 'abc123DEF45' ? '영상 제목' : '');
  const result = await backfillVideoTitles({
    state: state(), source: 'server', attempted, limit: 5, fetchTitle,
    apply: async (action, input) => { calls.push([action, input]); }
  });
  assert.equal(result.attempted, 2);
  assert.equal(result.filled, 2);
  assert.equal(calls.length, 1, '한 번에 모아 저장한다');
  assert.equal(calls[0][0], 'backfillTitles');
  assert.deepEqual(calls[0][1].items.map((i) => i.momentId), ['m1', 'm5']);
  for (const item of calls[0][1].items) {
    assert.deepEqual(item.mediaMetadata, { title: '영상 제목' });
    assert.equal('title' in item, false, '순간 제목을 보내지 않는다');
  }
});

test('3. 다시 불러와도 같은 순간은 한 번만 시도하고, 실패는 건너뛴다', async () => {
  const attempted = new Set();
  let fetches = 0;
  const failing = async () => { fetches += 1; throw new Error('network'); };
  const apply = async () => { throw new Error('should not apply'); };
  const first = await backfillVideoTitles({ state: state(), source: 'server', attempted, limit: 5, fetchTitle: failing, apply });
  assert.equal(first.attempted, 2);
  assert.equal(first.filled, 0);
  const second = await backfillVideoTitles({ state: state(), source: 'server', attempted, limit: 5, fetchTitle: failing, apply });
  assert.equal(second.attempted, 0, '같은 순간은 다시 시도하지 않는다');
  assert.equal(fetches, 2);
});

test('4. 공유·예시에서는 하지 않는다', async () => {
  for (const source of ['share', 'example', 'file']) {
    let called = 0;
    const result = await backfillVideoTitles({ state: state(), source, attempted: new Set(), fetchTitle: async () => { called += 1; return '제목'; }, apply: async () => {} });
    assert.equal(result.attempted, 0);
    assert.equal(called, 0);
  }
});

test('5. 서버 저장: backfillTitles는 mediaMetadata만 바꾸고 title은 그대로 둔다', async () => {
  let saved = validateState(state()), revision = 0;
  const api = {
    get: async () => ({ ok: true, state: saved, revision, subject: 'qa', writeSubjectBound: true }),
    put: async (body) => { saved = validateState(body.state); return { ok: true, revision: ++revision }; },
    logout: async () => ({ ok: true })
  };
  const session = createMemberSession({ api, delay: () => new Promise(() => {}) });
  await session.start();
  session.apply('backfillTitles', { items: [{ treeId: 't1', momentId: 'm1', url: YT, mediaMetadata: { title: '영상 제목' } }] });
  await session.act('retry');
  const moment = saved.trees[0].moments.find((m) => m.id === 'm1');
  assert.equal(moment.title, 'youtu.be에서 간직한 순간', '사용자/자동 제목은 그대로');
  assert.equal(moment.mediaMetadata.title, '영상 제목');
  session.dispose();
});
