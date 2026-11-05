import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeVideoId, exposedMetadata, createYoutubeOembedClient, createYoutubeOembedHandler } from '../server/youtube-oembed.js';
import { ApiError } from '../server/errors.js';

const ID = 'abcdefghijk';
const jsonResponse = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return data; } });
const meta = { title: '바다 산책', author_name: '러브트리', thumbnail_url: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' };

test('id 추출은 watch·shorts·live·youtu.be와 평문 id만 받고 닮은 호스트는 거부한다', () => {
  assert.equal(youtubeVideoId(ID), ID);
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk&t=90s'), ID);
  assert.equal(youtubeVideoId('https://m.youtube.com/watch?v=abcdefghijk'), ID);
  assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk?t=90'), ID);
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/abcdefghijk'), ID);
  assert.equal(youtubeVideoId('https://www.youtube.com/live/abcdefghijk'), ID);
  assert.equal(youtubeVideoId('https://www.youtube.com/embed/abcdefghijk'), ID);
  assert.equal(youtubeVideoId('https://music.youtube.com/watch?v=abcdefghijk'), ID);
  for (const bad of ['', '   ', 'too-short', 'toolongtoolong', 'https://www.youtube.com/playlist?list=PL123', 'https://www.youtube.com/watch?v=bad', 'https://youtube.com.evil.example/watch?v=abcdefghijk', 'https://evil.example/watch?v=abcdefghijk', 'https://www.youtube.com/watch?x=abcdefghijk', 'https://user:pass@www.youtube.com/watch?v=abcdefghijk', 'javascript:alert(1)', 'http://www.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/embed/bad', 'https://youtu.be.evil.example/abcdefghijk']) {
    assert.equal(youtubeVideoId(bad), null, bad);
  }
});

test('표시 필드만 남기고 썸네일은 https + ytimg.com 일 때만 통과시킨다', () => {
  const clean = exposedMetadata(ID, { ...meta, provider_name: 'YouTube', html: '<iframe>', author_url: 'https://youtube.com/@x' });
  assert.deepEqual(Object.keys(clean).sort(), ['authorName', 'thumbnailUrl', 'title', 'videoId']);
  assert.equal(clean.thumbnailUrl, meta.thumbnail_url);
  assert.equal(exposedMetadata(ID, { thumbnail_url: 'https://evil.example/x.jpg' }).thumbnailUrl, '');
  assert.equal(exposedMetadata(ID, { thumbnail_url: 'http://i.ytimg.com/vi/x/hqdefault.jpg' }).thumbnailUrl, '');
  assert.equal(exposedMetadata(ID, { thumbnail_url: 'https://i.ytimg.com.evil.example/x.jpg' }).thumbnailUrl, '');
  assert.equal(exposedMetadata(ID, { title: 'x'.repeat(500) }).title.length, 200);
});

test('성공 응답은 캐시하고 두 번째부터는 업스트림을 다시 부르지 않는다', async () => {
  let calls = 0;
  const client = createYoutubeOembedClient({ fetchImpl: async (url, init) => {
    calls += 1;
    assert.match(url, /^https:\/\/www\.youtube\.com\/oembed\?url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3Dabcdefghijk&format=json$/);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.accept, 'application/json');
    return jsonResponse(meta);
  } });
  const first = await client.metadata(ID);
  assert.equal(first.cached, false);
  assert.equal(first.authorName, '러브트리');
  const second = await client.metadata(ID);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  assert.equal(client.size(), 1);
});

test('실패는 캐시하지 않고 다시 시도한다', async () => {
  let calls = 0;
  const client = createYoutubeOembedClient({ fetchImpl: async () => { calls += 1; return jsonResponse({}, 500); } });
  await assert.rejects(() => client.metadata(ID), (error) => error instanceof ApiError && error.code === 'youtube_metadata' && error.status === 502);
  await assert.rejects(() => client.metadata(ID), (error) => error.code === 'youtube_metadata');
  assert.equal(calls, 2);
  assert.equal(client.size(), 0);
});

test('캐시 항목은 TTL이 지나면 만료된다', async () => {
  let clock = 1000;
  let calls = 0;
  const client = createYoutubeOembedClient({ now: () => clock, ttlMs: 100, fetchImpl: async () => { calls += 1; return jsonResponse(meta); } });
  await client.metadata(ID);
  clock = 1050;
  assert.equal((await client.metadata(ID)).cached, true);
  clock = 1200;
  assert.equal((await client.metadata(ID)).cached, false);
  assert.equal(calls, 2);
});

test('404는 youtube_not_found, 형식 오류는 youtube_metadata로 구분한다', async () => {
  await assert.rejects(() => createYoutubeOembedClient({ fetchImpl: async () => jsonResponse({}, 404) }).metadata(ID), (error) => error.status === 404 && error.code === 'youtube_not_found');
  await assert.rejects(() => createYoutubeOembedClient({ fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new Error('bad json'); } }) }).metadata(ID), (error) => error.status === 502 && error.code === 'youtube_metadata');
});

test('시간 초과나 연결 실패는 youtube_unreachable로 끝난다', async () => {
  const hanging = createYoutubeOembedClient({ timeoutMs: 5, fetchImpl: (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }) });
  await assert.rejects(() => hanging.metadata(ID), (error) => error.status === 502 && error.code === 'youtube_unreachable');
  const broken = createYoutubeOembedClient({ fetchImpl: async () => { throw new Error('network'); } });
  await assert.rejects(() => broken.metadata(ID), (error) => error.code === 'youtube_unreachable');
});

function handler(overrides = {}) {
  const authenticate = async (request) => {
    const account = request?.headers?.account;
    if (!account) throw new ApiError(401, 'unauthenticated', '로그인이 필요해요.');
    return { productId: 'lovetree-test', subjectId: account };
  };
  const seen = [];
  const client = { metadata: async (videoId) => { seen.push(videoId); return { videoId, title: 'T', authorName: 'A', thumbnailUrl: '', cached: false }; } };
  const handle = createYoutubeOembedHandler({ authenticate, productId: 'lovetree-test', client, ttlMs: 60_000, ...overrides });
  const call = (method, path, { account, query } = {}) => handle({ method, path, query: new URLSearchParams(query || {}), headers: account ? { account } : {} });
  return { call, seen, handle };
}

test('oEmbed 경로는 인증을 요구하고 GET만 받으며 id를 서버에서 다시 뽑는다', async () => {
  const { call, seen } = handler();
  assert.equal((await call('GET', '/api/youtube/oembed', { query: { v: ID } })).status, 401);
  assert.equal((await call('POST', '/api/youtube/oembed', { account: 'bob', query: { v: ID } })).status, 405);
  const invalid = await call('GET', '/api/youtube/oembed', { account: 'bob', query: { v: 'https://evil.example/watch?v=abcdefghijk' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'youtube_id');

  const watch = await call('GET', '/api/youtube/oembed', { account: 'bob', query: { v: 'https://www.youtube.com/watch?v=abcdefghijk&t=90s' } });
  assert.equal(watch.status, 200);
  assert.equal(watch.body.videoId, ID);
  assert.equal(watch.headers['cache-control'], 'private, max-age=60');
  assert.equal(watch.headers['x-content-type-options'], 'nosniff');
  assert.equal((await call('GET', '/api/youtube/oembed', { account: 'bob', query: { url: 'https://youtu.be/abcdefghijk?t=90' } })).status, 200);
  assert.deepEqual(seen, [ID, ID]);
});

test('oEmbed 핸들러는 다른 경로와 다른 제품 세션을 거부한다', async () => {
  const { handle } = handler();
  assert.equal((await handle({ method: 'GET', path: '/api/other', query: new URLSearchParams({ v: ID }), headers: { account: 'bob' } })).status, 404);
  const mismatch = createYoutubeOembedHandler({
    authenticate: async () => ({ productId: 'other', subjectId: 'bob' }),
    productId: 'lovetree-test',
    client: { metadata: async () => ({}) }
  });
  assert.equal((await mismatch({ method: 'GET', path: '/api/youtube/oembed', query: new URLSearchParams({ v: ID }), headers: {} })).status, 403);
});
