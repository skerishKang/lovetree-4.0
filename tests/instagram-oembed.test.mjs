import test from 'node:test';
import assert from 'node:assert/strict';
import { instagramShortcode, exposedMetadata, createInstagramOembedClient, createInstagramOembedHandler } from '../server/instagram-oembed.js';
import { ApiError } from '../server/errors.js';

// #791 2단계: 인스타그램 oEmbed — 외부 호출은 가짜 응답으로만 시험한다.
const CODE = 'C0abc123XYZ';
const REEL = `https://www.instagram.com/reel/${CODE}/?igsh=abc`;
const jsonResponse = (data, status = 200, extra = {}) => ({ ok: status >= 200 && status < 300, status, url: extra.url || '', async json() { return data; } });
// 2025-11-03부터 응답에 thumbnail_url이 없다.
const meta = { caption: '바다에서 보낸 순간 #ILLIT #SuperShy', title: '인스타그램 릴스', author_name: 'tiktokofficial', type: 'video' };

test('코드는 reel·reels·p·tv·짧은 주소와 평문에서만 뽑는다', () => {
  assert.equal(instagramShortcode(CODE), CODE);
  assert.equal(instagramShortcode(REEL), CODE);
  assert.equal(instagramShortcode(`https://www.instagram.com/reels/${CODE}/`), CODE);
  assert.equal(instagramShortcode(`https://instagram.com/p/${CODE}/?x=1`), CODE);
  assert.equal(instagramShortcode(`https://instagr.am/reel/${CODE}/`), CODE);
  for (const bad of ['', '   ', '123', 'https://www.instagram.com/explore/tags/x/', `https://instagram.com.evil.test/reel/${CODE}/`, `http://www.instagram.com/reel/${CODE}/`, 'javascript:alert(1)']) {
    assert.equal(instagramShortcode(bad), null, bad);
  }
});

test('표시 필드는 caption·@계정만 남기고 썸네일은 없다', () => {
  const clean = exposedMetadata(CODE, { ...meta, thumbnail_url: '', html: '<iframe>' });
  assert.deepEqual(Object.keys(clean).sort(), ['authorName', 'shortcode', 'thumbnailUrl', 'title']);
  assert.equal(clean.title, meta.caption);
  assert.equal(clean.authorName, 'tiktokofficial');
  assert.equal(clean.thumbnailUrl, '');
  assert.equal(exposedMetadata(CODE, { title: '', author_name: '' }).title, '');
});

test('모의 응답은 caption을 우선하고 caption이 없으면 title로 대체한다', async () => {
  const preferredClient = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({ ...meta, caption: '원본 캡션', title: '대체 제목', author_name: '  원본계정  ' }) });
  const preferred = await preferredClient.metadata(REEL);
  assert.equal(preferred.title, '원본 캡션');
  assert.equal(preferred.authorName, '원본계정');

  const fallbackClient = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({ ...meta, caption: undefined }) });
  const fallback = await fallbackClient.metadata(REEL);
  assert.equal(fallback.title, meta.title);
});

test('모의 응답의 240자 초과 caption은 저장 한도에 맞춰 자른다', async () => {
  const caption = '가'.repeat(241);
  const client = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({ ...meta, caption }) });
  const got = await client.metadata(REEL);
  assert.equal(got.title.length, 240);
  assert.equal(got.title, caption.slice(0, 240));
});

test('성공 응답은 캐시하고 refresh 요청은 캐시를 지우고 다시 부른다', async () => {
  let calls = 0;
  const captions = ['첫 캡션', '바뀐 캡션'];
  const client = createInstagramOembedClient({ fetchImpl: async (url, init) => {
    calls += 1;
    assert.match(url, /^https:\/\/graph\.facebook\.com\/instagram_oembed\?url=https%3A%2F%2Fwww\.instagram\.com%2Freel%2F/);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.accept, 'application/json');
    return jsonResponse({ ...meta, caption: captions[calls - 1] });
  } });
  const first = await client.metadata(REEL);
  assert.equal(first.cached, false);
  assert.equal(first.shortcode, CODE);
  const cached = await client.metadata(CODE);
  assert.equal(cached.cached, true);
  assert.equal(cached.title, '첫 캡션');
  const refreshed = await client.metadata(CODE, { refresh: true });
  assert.equal(refreshed.cached, false);
  assert.equal(refreshed.title, '바뀐 캡션');
  assert.equal(calls, 2);
});

test('429는 캐시하지 않고 상태·오류 본문 계약을 그대로 돌려준다(링크 저장은 화면이 계속한다)', async () => {
  const fetchImpl = async () => jsonResponse({}, 429);
  const client = createInstagramOembedClient({ fetchImpl });
  await assert.rejects(
    () => client.metadata(REEL),
    (error) => error instanceof ApiError && error.code === 'instagram_rate_limited' && error.status === 429
  );
  assert.equal(client.size(), 0);

  const handler = createInstagramOembedHandler({
    authenticate: async () => ({ productId: 'p', subjectId: 's' }), productId: 'p', client
  });
  const response = await handler({ path: '/api/instagram/oembed', method: 'GET', query: new URLSearchParams({ url: REEL }) });
  assert.equal(response.status, 429);
  assert.deepEqual(response.body, {
    error: { code: 'instagram_rate_limited', message: '인스타그램 조회 한도에 걸렸어요. 잠시 뒤 다시 시도할게요.' }
  });
});

test('영상이 아닌 글·형식 오류·주소 아님도 각각 끊는다', async () => {
  const notVideo = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({ ...meta, type: 'image' }) });
  await assert.rejects(() => notVideo.metadata(REEL), (error) => error.code === 'instagram_not_video' && error.status === 400);
  // 실제 공식 응답은 type:'rich'다 — 영상으로 받는다(caption·@계정은 없을 수 있다).
  const rich = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({ type: 'rich', html: '<blockquote class="instagram-media"></blockquote>' }) });
  const got = await rich.metadata(REEL);
  assert.equal(got.shortcode, CODE);
  assert.equal(got.title, '');
  const broken = createInstagramOembedClient({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }) });
  await assert.rejects(() => broken.metadata(REEL), (error) => error.code === 'instagram_metadata' && error.status === 502);
  const wrong = createInstagramOembedClient({ fetchImpl: async () => jsonResponse(meta) });
  await assert.rejects(() => wrong.metadata('https://www.youtube.com/watch?v=abcdefghijk'), (error) => error.code === 'instagram_id' && error.status === 400);
});

test('삭제·비공개 응답은 재생 불가 코드로 구분한다', async () => {
  const gone = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({}, 404) });
  await assert.rejects(() => gone.metadata(REEL), (error) => error.code === 'instagram_gone' && error.status === 404);
  const privateClient = createInstagramOembedClient({ fetchImpl: async () => jsonResponse({}, 403) });
  await assert.rejects(() => privateClient.metadata(REEL), (error) => error.code === 'instagram_private' && error.status === 403);
});

test('핸들러는 인증·경로·메서드·refresh를 지킨다', async () => {
  const seen = [];
  const handler = createInstagramOembedHandler({
    authenticate: async () => ({ productId: 'p', subjectId: 's' }), productId: 'p',
    client: { metadata: async (v, options) => { seen.push([v, options]); return { shortcode: CODE, title: '캡션', authorName: '작가', thumbnailUrl: '', cached: false }; } }
  });
  const ok = await handler({ path: '/api/instagram/oembed', method: 'GET', query: new URLSearchParams({ url: REEL, refresh: '1' }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.shortcode, CODE);
  assert.deepEqual(seen[0], [REEL, { refresh: true }]);
  assert.equal((await handler({ path: '/api/tiktok/oembed', method: 'GET', query: new URLSearchParams() })).status, 404);
  assert.equal((await handler({ path: '/api/instagram/oembed', method: 'POST', query: new URLSearchParams() })).status, 405);
  assert.equal((await handler({ path: '/api/instagram/oembed', method: 'GET', query: new URLSearchParams() })).status, 400);
});
