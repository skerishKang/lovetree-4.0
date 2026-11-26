import { listenOnSafePort } from './helpers/safe-port.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOpsNotifier, audienceForRole, OPS_NOTIFY_KEY_HEADER, OPS_SITE } from '../server/ops-notify.js';
import { createFeedbackService } from '../server/feedback-service.js';
import { createMemoryFeedbackRepo } from '../server/testing/memory-feedback-repo.js';
import { ROLE_ADMIN, ROLE_AI_CUSTOMER, ROLE_TESTER } from '../server/admin-roles.js';

const PRODUCT = 'lovetree-test';
const KEY = 'fake-key-for-test';

async function receiver({ failTimes = 0 } = {}) {
  const seen = [];
  let fails = failTimes;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const status = fails > 0 ? 503 : 200;
      if (fails > 0) fails -= 1;
      seen.push({ headers: req.headers, url: req.url, status, body: JSON.parse(raw) });
      res.writeHead(status);
      res.end(status === 200 ? 'ok' : 'retry');
    });
  });
  await listenOnSafePort(server, '127.0.0.1');
  return {
    url: `http://127.0.0.1:${server.address().port}/api/ops/notify-event`,
    seen,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function waitUntil(predicate, timeout = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('기한 안에 조건을 만나지 못했습니다.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('받는 쪽에 정확히 5개 필드와 서비스 키 헤더만 보낸다', async (t) => {
  const sink = await receiver();
  t.after(() => sink.close());
  const notify = createOpsNotifier({ url: sink.url, key: KEY });
  t.after(() => notify.close());

  const result = await notify.notify({ kind: 'feedback_new', audience: 'real', title: '가'.repeat(120), sourceId: 'post-1' });

  assert.equal(result.sent, true);
  assert.equal(sink.seen.length, 1);
  const request = sink.seen[0];
  assert.equal(request.url, '/api/ops/notify-event');
  assert.equal(request.headers[OPS_NOTIFY_KEY_HEADER.toLowerCase()], KEY);
  assert.deepEqual(Object.keys(request.body).sort(), ['audience', 'kind', 'site', 'source_id', 'title']);
  assert.equal(request.body.site, OPS_SITE);
  assert.equal(request.body.kind, 'feedback_new');
  assert.equal(request.body.audience, 'real');
  assert.equal(request.body.source_id, 'post-1');
  assert.equal(request.body.title.length, 80);
});

test('시험 계정은 건너뛰고 실제 회원과 AI 명예회원을 구분한다', () => {
  assert.equal(audienceForRole(ROLE_TESTER), null);
  assert.equal(audienceForRole(ROLE_AI_CUSTOMER), 'ai');
  assert.equal(audienceForRole(ROLE_ADMIN), 'real');
  assert.equal(audienceForRole(null), 'real');
});

test('키나 주소가 비면 아무것도 보내지 않는다', async () => {
  const forbiddenFetch = () => { throw new Error('실제 수신 경로를 호출하면 안 됩니다.'); };
  const noKey = createOpsNotifier({ url: 'https://chat.padiem.net/api/ops/notify-event', key: '', fetchImpl: forbiddenFetch });
  const noUrl = createOpsNotifier({ url: '', key: KEY, fetchImpl: forbiddenFetch });
  assert.equal(noKey.enabled, false);
  assert.equal(noUrl.enabled, false);
  assert.equal((await noKey.notify({ kind: 'feedback_new', audience: 'real', title: '제목', sourceId: 'x' })).reason, 'disabled');
  assert.equal((await noUrl.notify({ kind: 'feedback_new', audience: 'real', title: '제목', sourceId: 'y' })).reason, 'disabled');
});

test('실패분은 다음 의견 때 다시 보내고 같은 글은 한 번만 보낸다', async (t) => {
  const sink = await receiver({ failTimes: 1 });
  t.after(() => sink.close());
  const notify = createOpsNotifier({ url: sink.url, key: KEY });
  t.after(() => notify.close());

  const first = await notify.notify({ kind: 'feedback_new', audience: 'real', title: '첫 의견', sourceId: 'p1' });
  assert.equal(first.sent, false);
  assert.equal(notify.pending.length, 1);

  const second = await notify.notify({ kind: 'feedback_append', audience: 'ai', title: '덧붙임', sourceId: 'p2' });
  assert.equal(second.sent, true);
  await waitUntil(() => sink.seen.filter((item) => item.status === 200).length === 2 && notify.pending.length === 0);
  assert.deepEqual(sink.seen.filter((item) => item.status === 200).map((item) => item.body.source_id).sort(), ['p1', 'p2']);
  assert.equal(notify.pending.length, 0);

  const again = await notify.notify({ kind: 'feedback_new', audience: 'real', title: '같은 글', sourceId: 'p1' });
  assert.equal(again.reason, 'duplicate');
  assert.equal(sink.seen.length, 3);
});

test('10분 주기에도 실패분을 다시 보낸다', async (t) => {
  const sink = await receiver({ failTimes: 1 });
  t.after(() => sink.close());
  let tick = null;
  const notify = createOpsNotifier({
    url: sink.url,
    key: KEY,
    setIntervalFn: (callback) => { tick = callback; return { unref() {} }; },
    clearIntervalFn: () => {}
  });

  const first = await notify.notify({ kind: 'feedback_new', audience: 'real', title: '타이머 확인', sourceId: 'p3' });
  assert.equal(first.sent, false);
  assert.equal(typeof tick, 'function');
  tick();
  await waitUntil(() => sink.seen.length === 2 && notify.pending.length === 0);
  assert.equal(notify.pending.length, 0);
});

test('알림이 실패해도 의견 저장은 성공하고 시험 계정 글은 보내지 않는다', async (t) => {
  const sink = await receiver({ failTimes: 99 });
  t.after(() => sink.close());
  const notify = createOpsNotifier({ url: sink.url, key: KEY });
  t.after(() => notify.close());
  const roles = new Map([['tester', ROLE_TESTER], ['ai', ROLE_AI_CUSTOMER], ['real', null]]);
  const admin = { roleFor: async (principal) => roles.get(principal.subjectId) ?? null };
  const feedbackRepo = createMemoryFeedbackRepo();
  const service = createFeedbackService({ feedbackRepo, productId: PRODUCT, admin, opsNotify: notify });

  const real = await service.submit({ principal: { productId: PRODUCT, subjectId: 'real' }, category: 'bug', body: '저장 성공' });
  assert.equal(real.status, 'received');
  assert.equal(feedbackRepo.rows.length, 1);
  await waitUntil(() => sink.seen.length >= 1);
  assert.equal(sink.seen[0].body.audience, 'real');
  assert.equal(sink.seen[0].body.kind, 'feedback_new');

  const tester = await service.submit({ principal: { productId: PRODUCT, subjectId: 'tester' }, category: 'bug', body: '시험 계정 글' });
  assert.equal(tester.status, 'received');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(sink.seen.some((item) => item.body.source_id === String(tester.id)), false);

  const ai = await service.createJournal({ principal: { productId: PRODUCT, subjectId: 'ai' }, title: '오늘 일지', body: '내용', score: 5 });
  assert.equal(ai.status, 'received');
  await waitUntil(() => sink.seen.some((item) => item.body.source_id === String(ai.id)));
  assert.equal(sink.seen.find((item) => item.body.source_id === String(ai.id)).body.audience, 'ai');
  assert.equal(notify.pending.length > 0, true);
});
