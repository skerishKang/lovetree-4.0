import test from 'node:test';
import assert from 'node:assert/strict';
import { tiktokVideoId, tiktokShortUrl, tiktokAuthor, exposedMetadata, createTiktokOembedClient, createTiktokOembedHandler } from '../server/tiktok-oembed.js';
import { ApiError } from '../server/errors.js';

// #791 1단계: 틱톡 oEmbed 프록시 — 유튜브 oEmbed와 같은 길. 짧은 주소(vm·vt)는 서버만 푼다.
const ID = '7252913073450106158';
const CANONICAL = `https://www.tiktok.com/@tiktokofficial/video/${ID}`;
const jsonResponse = (data, status = 200, extra = {}) => ({ ok: status >= 200 && status < 300, status, url: extra.url || '', async json() { return data; } });
const meta = { title: '', author_name: '', thumbnail_url: '', width: '325', height: '578', html: `<iframe src="https://www.tiktok.com/player/v1/${ID}"></iframe>`, provider_name: 'TikTok' };

test('id 추출은 정본 주소와 평문 숫자 id만 받고 닮은 호스트·사진 주소는 거부한다', () => {
  assert.equal(tiktokVideoId(ID), ID);
  assert.equal(tiktokVideoId(CANONICAL), ID);
  assert.equal(tiktokVideoId(`https://tiktok.com/@some.user/video/${ID}`), ID);
  assert.equal(tiktokVideoId(`${CANONICAL}?_t=abc&u_code=x`), ID);
  for (const bad of ['', '   ', '123', 'abcdefghijk', 'https://www.tiktok.com/@x/photo/7252913073450106158', 'https://www.tiktok.com/@x/video/123', `https://www.tiktok.com.evil.example/@x/video/${ID}`, 'https://evil.example/@x/video/' + ID, 'javascript:alert(1)', `http://www.tiktok.com/@x/video/${ID}`]) {
    assert.equal(tiktokVideoId(bad), null, bad);
  }
});

test('짧은 주소는 vm·vt만 받고 코드 모양이 아니면 거부한다', () => {
  assert.equal(tiktokShortUrl('https://vm.tiktok.com/ZGd3XTri5/'), 'https://vm.tiktok.com/ZGd3XTri5/');
  assert.equal(tiktokShortUrl('https://vt.tiktok.com/ZS1234abc/'), 'https://vt.tiktok.com/ZS1234abc/');
  for (const bad of ['', 'https://www.tiktok.com/ZGd3XTri5/', 'https://vm.tiktok.com/', 'http://vm.tiktok.com/ZGd3XTri5/', 'https://vm.tiktok.com.evil.example/x/']) {
    assert.equal(tiktokShortUrl(bad), null, bad);
  }
});

test('표시 필드만 남기고 썸네일은 https + 틱톡 CDN일 때만 통과시킨다', () => {
  const clean = exposedMetadata(ID, { ...meta, author_url: 'https://www.tiktok.com/@x', html: '<iframe>' });
  assert.deepEqual(Object.keys(clean).sort(), ['authorName', 'height', 'thumbnailUrl', 'title', 'videoId', 'width']);
  assert.equal(clean.width, 325);
  assert.equal(clean.height, 578);
  assert.equal(exposedMetadata(ID, { thumbnail_url: 'https://v16m-default.tiktokcdn.com/x.jpg' }).thumbnailUrl, 'https://v16m-default.tiktokcdn.com/x.jpg');
  assert.equal(exposedMetadata(ID, { thumbnail_url: 'https://evil.example/x.jpg' }).thumbnailUrl, '');
  assert.equal(exposedMetadata(ID, { thumbnail_url: 'http://v16m-default.tiktokcdn.com/x.jpg' }).thumbnailUrl, '');
  // oEmbed가 메타를 담지 않으면 빈 문자열로 둔다(2026-11-18 실측).
  assert.equal(clean.title, '');
  assert.equal(clean.authorName, '');
  assert.equal(clean.thumbnailUrl, '');
});

test('성공 응답은 캐시하고 두 번째부터는 업스트림을 다시 부르지 않는다', async () => {
  let calls = 0;
  const client = createTiktokOembedClient({ fetchImpl: async (url, init) => {
    calls += 1;
    assert.match(url, /^https:\/\/www\.tiktok\.com\/oembed\?url=https%3A%2F%2Fwww\.tiktok\.com%2F%40tiktok%2Fvideo%2F7252913073450106158&format=json$/);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.accept, 'application/json');
    return jsonResponse(meta);
  } });
  const first = await client.metadata(CANONICAL);
  assert.equal(first.cached, false);
  assert.equal(first.videoId, ID);
  const second = await client.metadata(ID);
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  assert.equal(client.size(), 1);
});

test('@계정 이름은 정본 주소 경로에서만 풀고 짧은 주소·평문 id는 모른다', () => {
  assert.equal(tiktokAuthor(CANONICAL), 'tiktokofficial');
  assert.equal(tiktokAuthor('https://tiktok.com/@some.user/video/' + ID), 'some.user');
  assert.equal(tiktokAuthor(`${CANONICAL}?_t=abc`), 'tiktokofficial');
  assert.equal(tiktokAuthor('https://vm.tiktok.com/ZGd3XTri5/'), '');
  assert.equal(tiktokAuthor(ID), '');
  assert.equal(tiktokAuthor('https://www.tiktok.com/@x/photo/' + ID), '');
  assert.equal(tiktokAuthor('https://evil.example/@x/video/' + ID), '');
  assert.equal(tiktokAuthor(''), '');
});

test('짧은 주소는 서버에서 따라가 정본 id로 푼다', async () => {
  const seen = [];
  const client = createTiktokOembedClient({ fetchImpl: async (url, init) => {
    seen.push([url, init]);
    if (url.startsWith('https://vm.tiktok.com/')) {
      return jsonResponse({}, 200, { url: CANONICAL });
    }
    return jsonResponse(meta);
  } });
  const resolved = await client.metadata('https://vm.tiktok.com/ZGd3XTri5/');
  assert.equal(resolved.videoId, ID);
  assert.equal(resolved.author, 'tiktokofficial', '짧은 주소의 @이름은 따라간 정본 주소에서 온다');
  assert.equal(seen[0][0], 'https://vm.tiktok.com/ZGd3XTri5/');
  assert.equal(seen[0][1].redirect, 'follow');
  assert.equal(seen.length, 2);
});

test('짧은 주소가 틱톡 영상으로 열리지 않으면 400으로 끊는다(링크 카드로 물러남)', async () => {
  const client = createTiktokOembedClient({ fetchImpl: async () => jsonResponse({}, 200, { url: 'https://www.tiktok.com/?_r=1' }) });
  await assert.rejects(
    () => client.metadata('https://vm.tiktok.com/ZGd3XTri5/'),
    (error) => error instanceof ApiError && error.code === 'tiktok_unresolved' && error.status === 400
  );
});

test('틱톡이 아닌 입력은 400, 업스트림 실패는 캐시하지 않고 502로 끊는다', async () => {
  const client = createTiktokOembedClient({ fetchImpl: async () => jsonResponse({}, 500) });
  await assert.rejects(() => client.metadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), (error) => error.code === 'tiktok_id' && error.status === 400);
  await assert.rejects(() => client.metadata(CANONICAL), (error) => error.code === 'tiktok_metadata' && error.status === 502);
  assert.equal(client.size(), 0);
});

test('핸들러는 인증·경로·메서드를 지키고 값을 그대로 돌려준다', async () => {
  const handler = createTiktokOembedHandler({ authenticate: async () => ({ productId: 'p', subjectId: 's' }), productId: 'p', client: { metadata: async (v) => ({ videoId: ID, title: '', authorName: '', thumbnailUrl: '', width: 325, height: 578, cached: false, echo: v }) } });
  const ok = await handler({ path: '/api/tiktok/oembed', method: 'GET', query: new URLSearchParams({ url: 'https://vm.tiktok.com/ZGd3XTri5/' }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.videoId, ID);
  const wrongPath = await handler({ path: '/api/youtube/oembed', method: 'GET', query: new URLSearchParams({ url: CANONICAL }) });
  assert.equal(wrongPath.status, 404);
  const wrongMethod = await handler({ path: '/api/tiktok/oembed', method: 'POST', query: new URLSearchParams({ url: CANONICAL }) });
  assert.equal(wrongMethod.status, 405);
  const empty = await handler({ path: '/api/tiktok/oembed', method: 'GET', query: new URLSearchParams() });
  assert.equal(empty.status, 400);
});
