import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// #541 공유 링크 미리보기 카드(/t/<id>)와 검색 준비(robots.txt·sitemap.xml) 시험.
// 함수는 순수 조립으로 만들어 fetch 를 가짜로 갈아 끼워 서버 응답별 동작을 확인한다.
import { createTreePreview, shareCardFromRead, cardImageFor, youtubeVideoId } from '../functions/_lib/tree-preview.mjs';
import { createRobots, createSitemap, collectSitemapShares, CARD_IMAGE_URL, PRODUCTION_HOST, SEARCH_OPEN } from '../functions/_lib/search-meta.mjs';
import { youtubeIdFrom } from '../public/v41/thumb-fallback.mjs';
import { onRequest as prodRoot } from '../functions/index.js';
import { onRequest as v41Root } from '../functions/v41/index.js';

const UPSTREAM = 'https://api.lovetree.example';
const ENV = { LOVETREE_API_ORIGIN: UPSTREAM };
const SHARE_ID = 'LtShareId1234567890ab'; // [A-Za-z0-9_-]{20,64}
const DEV = 'https://lovetree-4-0.pages.dev';
const PROD = 'https://lovetree.padiem.net';

const READ = {
  share: { id: SHARE_ID, treeId: 'tree-internal-1', subjectId: 'subject-internal-1', entryMomentId: 'moment-internal-1', view: 'board', status: 'active' },
  tree: {
    id: 'tree-internal-1', title: '윤슬', subject: '아이브',
    moments: [
      { id: 'moment-internal-1', parentId: null, title: '첫 만남 스테이지', emotion: '설렘', date: '2026-11-01', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', links: [] },
      { id: 'moment-internal-2', parentId: 'moment-internal-1', title: '다음 날 앙코르', emotion: '벅참', date: '2026-11-02', url: '', links: [] }
    ]
  }
};

function recorder(reply) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, method: init?.method });
    const answer = typeof reply === 'function' ? reply(url) : reply;
    return answer;
  };
  fetcher.calls = calls;
  return fetcher;
}

function jsonReply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const onRequest = createTreePreview();
const call = (url, { ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0', method = 'GET', env = ENV, fetcher = null } = {}) =>
  (fetcher ? createTreePreview({ fetcher }) : onRequest)({ request: new Request(url, { method, headers: { 'user-agent': ua } }), env });

test('링크 미리보기 봇에게는 og 카드 HTML 을 돌려준다', async () => {
  const fetcher = recorder(jsonReply(READ));
  const response = await call(`${DEV}/t/${SHARE_ID}`, { ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', fetcher });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /<meta property="og:title" content="윤슬">/);
  assert.match(html, /순간 2개 · 좋아하는 대상 아이브 · “첫 만남 스테이지”/);
  assert.match(html, /<meta property="og:image" content="https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg">/);
  assert.doesNotMatch(html, /og:image:width/, 'YouTube 썸네일에는 1200×630 크기를 적지 않는다');
  assert.match(html, new RegExp(`<meta property="og:url" content="${PROD}/t/${SHARE_ID}">`));
  assert.match(html, new RegExp(`<link rel="canonical" href="${PROD}/t/${SHARE_ID}">`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="robots" content="noindex">/, '검색을 열기 전에는 공유 카드도 noindex(미리보기는 그대로)');
  assert.match(html, /<meta name="twitter:image" content="https:\/\/i\.ytimg\.com/);
  assert.match(html, /#share\/LtShareId1234567890ab\/board/, '스크립트 넘기기도 지금 공유 주소 형식을 쓴다');
});

test('사람에게는 지금 공유 주소 형식(#share/<id>/<view>)으로 302 를 보낸다', async () => {
  const dev = await call(`${DEV}/t/${SHARE_ID}`, { fetcher: recorder(jsonReply(READ)) });
  assert.equal(dev.status, 302);
  assert.equal(dev.headers.get('location'), `${DEV}/v41/#share/${SHARE_ID}/board`);
  assert.equal(dev.headers.get('cache-control'), 'no-store');
  const prod = await call(`${PROD}/t/${SHARE_ID}`, { fetcher: recorder(jsonReply(READ)) });
  assert.equal(prod.headers.get('location'), `${PROD}/#share/${SHARE_ID}/board`);
});

test('첫 순간이 YouTube 가 아니면 기본 카드 그림을 쓴다', async () => {
  const read = structuredClone(READ);
  read.tree.moments[0].url = 'https://example.com/photo.jpg';
  const fetcher = recorder(jsonReply(read));
  const response = await call(`${DEV}/t/${SHARE_ID}`, { ua: 'Twitterbot/1.0', fetcher });
  const html = await response.text();
  assert.match(html, new RegExp(`<meta property="og:image" content="${CARD_IMAGE_URL}">`));
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
});

test('직접 올린 사진(/api/media/)은 카드 그릴로 나가지 않는다(#427 전까지)', async () => {
  const read = structuredClone(READ);
  read.tree.moments[0].url = '/api/media/12345678-1234-4123-8123-123456789012.png';
  read.tree.moments[0].mediaMetadata = { thumbnail: '/api/media/12345678-1234-4123-8123-123456789012.png' };
  const fetcher = recorder(jsonReply(read));
  const response = await call(`${DEV}/t/${SHARE_ID}`, { ua: 'Discordbot/1.0', fetcher });
  const html = await response.text();
  assert.match(html, new RegExp(`<meta property="og:image" content="${CARD_IMAGE_URL}">`));
  assert.doesNotMatch(html, /api\/media\//);
});

test('저장해 둔 ytimg 썸네일이 있으면 그 주소를 쓴다', () => {
  const image = cardImageFor({ url: '', mediaMetadata: { thumbnail: 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg' } });
  assert.equal(image, 'https://i.ytimg.com/vi/abc12345678/hqdefault.jpg');
  assert.equal(cardImageFor({ url: '', mediaMetadata: { thumbnail: 'https://evil.example/x.jpg' } }), '', 'ytimg 밖 주소는 버린다');
  assert.equal(cardImageFor(null), '');
});

test('취소·삭제·없는 공유는 취소 카드(noindex)이고 사람은 첫 화면으로 간다', async () => {
  for (const status of [404, 410]) {
    const fetcher = recorder(jsonReply({ error: { code: 'share_not_found' } }, status));
    const bot = await call(`${DEV}/t/${SHARE_ID}`, { ua: 'kakaotalk 10.0', fetcher });
    const html = await bot.text();
    assert.match(html, /공유가 취소되었어요/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, new RegExp(`<meta property="og:image" content="${CARD_IMAGE_URL}">`));
    const human = await call(`${PROD}/t/${SHARE_ID}`, { fetcher });
    assert.equal(human.status, 302);
    assert.equal(human.headers.get('location'), `${PROD}/`);
  }
});

test('주소 형식이 밖이면 서버까지 가지 않고 취소 카드로 끝낸다', async () => {
  const fetcher = recorder(jsonReply(READ));
  for (const path of ['/t/short', '/t/', '/t/has!special0000000000000', '/t/']) {
    const response = await call(`${DEV}${path}`, { ua: 'Googlebot/2.1' });
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /공유가 취소되었어요/);
  }
  assert.equal(fetcher.calls.length, 0);
});

test('서버에 닿지 못하면 중립 기본 카드(noindex)이고 사람은 공유 주소로 간다', async () => {
  const fetcher = recorder(() => { throw new Error('down'); });
  const bot = await call(`${DEV}/t/${SHARE_ID}`, { ua: 'Slackbot-LinkExpanding 1.0', fetcher });
  const html = await bot.text();
  assert.doesNotMatch(html, /공유가 취소되었어요/, '몰라서 단정하지 않는다');
  assert.match(html, new RegExp(`<meta property="og:title" content="러브트리">`));
  assert.match(html, /<meta name="robots" content="noindex">/);
  const human = await call(`${DEV}/t/${SHARE_ID}`, { fetcher });
  assert.equal(human.headers.get('location'), `${DEV}/v41/#share/${SHARE_ID}/book`);
});

test('POST 는 405 JSON 이다', async () => {
  const response = await call(`${DEV}/t/${SHARE_ID}`, { method: 'POST' });
  assert.equal(response.status, 405);
});

test('카드 HTML 에 계정·내부 id 를 적지 않는다', async () => {
  const fetcher = recorder(jsonReply(READ));
  const response = await call(`${DEV}/t/${SHARE_ID}`, { ua: 'facebookexternalhit/1.1', fetcher });
  const html = await response.text();
  for (const secret of ['subject-internal-1', 'tree-internal-1', 'moment-internal-1', 'moment-internal-2', 'subjectId', 'treeId', 'entryMomentId', '@']) {
    assert.doesNotMatch(html, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `카드에 ${secret} 이 없어야 한다`);
  }
});

test('shareCardFromRead — 첫 순간 기준은 공유가 처음 여는 순간(entryMomentId)이다', () => {
  const card = shareCardFromRead(READ);
  assert.equal(card.view, 'board');
  assert.match(card.description, /“첫 만남 스테이지”/);
  assert.doesNotMatch(card.description, /AI 테스터/, '일반 트리에는 표시하지 않는다');
  // #611 3번: AI 테스터 기록의 미리보기 카드 문구에는 'AI 테스터'를 알린다(계정 정보는 넣지 않는다).
  const aiCard = shareCardFromRead({ ...READ, aiTester: true });
  assert.match(aiCard.description, /AI 테스터/, 'AI 테스터 표시');
  assert.doesNotMatch(aiCard.description, /@/i, '이메일을 넣지 않는다');
  const fallen = shareCardFromRead({ share: { view: 'etc' }, tree: { title: '  ', subject: '', moments: [{ id: 'a', parentId: null, title: '혼자 남은 순간', url: '' }] } });
  assert.equal(fallen.view, 'book', '알 수 없는 view 는 책으로');
  assert.equal(fallen.title, '러브트리', '제목이 비면 서비스 이름으로');
  assert.match(fallen.description, /순간 1개 · “혼자 남은 순간”/);
});

test('youtubeVideoId 는 thumb-fallback youtubeIdFrom 과 같은 판정이다', () => {
  const corpus = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/hqdefault.webp',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short10id!',
    'https://www.youtube.com/watch?v=toolongid123456',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?x=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&more=1',
    ''
  ];
  for (const value of corpus) {
    assert.equal(youtubeVideoId(value), youtubeIdFrom(value), `같은 판정: ${value}`);
  }
});

test('검색 열기 스위치는 서비스 시작 전이라 닫혀 있다(2026-11-14)', () => {
  assert.equal(SEARCH_OPEN, false, '서비스를 열 때만 true 로 바꾼다');
});

test('robots.txt — 검색을 열기 전에는 운영 주소도 전면 차단', async () => {
  const robots = createRobots();
  for (const origin of [PROD, DEV]) {
    const response = await robots({ request: new Request(`${origin}/robots.txt`) });
    assert.equal(await response.text(), 'User-agent: *\nDisallow: /\n', origin);
  }
});

test('robots.txt — 검색을 열면 운영 주소는 허용 + sitemap 안내, 개발 주소는 전면 차단', async () => {
  const robots = createRobots({ searchOpen: true });
  const prod = await robots({ request: new Request(`${PROD}/robots.txt`) });
  const prodBody = await prod.text();
  assert.match(prodBody, /User-agent: \*\nAllow: \//);
  assert.ok(prodBody.includes(`Sitemap: https://${PRODUCTION_HOST}/sitemap.xml`));
  const dev = await robots({ request: new Request(`${DEV}/robots.txt`) });
  assert.equal(await dev.text(), 'User-agent: *\nDisallow: /\n');
});

test('sitemap.xml — 둘러보기에 공개된 공유만 운영 주소에서 나열한다', async () => {
  const pages = {
    'limit': { items: [{ shareId: 'Aaaaaaaaaaaaaaaaaaa1', createdAt: '2026-11-13T10:00:00Z' }, { shareId: 'Bbbbbbbbbbbbbbbbbbb2', createdAt: '2026-11-12T09:00:00Z' }], nextCursor: 'Bbbbbbbbbbbbbbbbbbb2' },
    'cursor': { items: [{ shareId: 'Ccccccccccccccccccc3', createdAt: 'bad-date' }, { shareId: 'short-not-valid' }], nextCursor: null }
  };
  const fetcher = recorder((url) => jsonReply(String(url).includes('cursor=') ? pages.cursor : pages.limit));
  const entries = await collectSitemapShares({ fetcher, origin: UPSTREAM });
  assert.deepEqual(entries.map((e) => e.shareId), ['Aaaaaaaaaaaaaaaaaaa1', 'Bbbbbbbbbbbbbbbbbbb2', 'Ccccccccccccccccccc3'], '형식이 밖인 id 는 버린다');
  assert.deepEqual(fetcher.calls.map((c) => c.url), [
    `${UPSTREAM}/api/community/shares?limit=24`,
    `${UPSTREAM}/api/community/shares?limit=24&cursor=Bbbbbbbbbbbbbbbbbbb2`
  ]);
  const sitemap = createSitemap({ fetcher, searchOpen: true });
  const response = await sitemap({ request: new Request(`${PROD}/sitemap.xml`), env: ENV });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /application\/xml/);
  const xml = await response.text();
  assert.match(xml, new RegExp(`<loc>${PROD}/t/Aaaaaaaaaaaaaaaaaaa1</loc>`));
  assert.match(xml, /<lastmod>2026-11-13<\/lastmod>/);
  assert.doesNotMatch(xml, /<lastmod>bad-date<\/lastmod>/);
});

test('sitemap.xml — 검색을 열기 전에는 운영 주소도 404 이고 서버를 부르지 않는다', async () => {
  const fetcher = recorder(jsonReply({ items: [] }));
  const closed = createSitemap({ fetcher });
  assert.equal((await closed({ request: new Request(`${PROD}/sitemap.xml`), env: ENV })).status, 404);
  assert.equal(fetcher.calls.length, 0);
});

test('sitemap.xml — 공개된 공유가 없으면 빈 urlset, 개발 주소는 404, 서버가 죽으면 503', async () => {
  const empty = createSitemap({ fetcher: recorder(jsonReply({ items: [], nextCursor: null })), searchOpen: true });
  const emptyResponse = await empty({ request: new Request(`${PROD}/sitemap.xml`), env: ENV });
  assert.equal(emptyResponse.status, 200);
  assert.match(await emptyResponse.text(), /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\s*<\/urlset>/);
  const dev = createSitemap({ fetcher: recorder(jsonReply({ items: [] })), searchOpen: true });
  assert.equal((await dev({ request: new Request(`${DEV}/sitemap.xml`), env: ENV })).status, 404);
  const broken = createSitemap({ fetcher: recorder(() => { throw new Error('down'); }), searchOpen: true });
  assert.equal((await broken({ request: new Request(`${PROD}/sitemap.xml`), env: ENV })).status, 503);
});

test('_routes.json 이 새 경로를 함수로 보낸다', async () => {
  const routes = JSON.parse(await readFile(new URL('../public/_routes.json', import.meta.url), 'utf8'));
  for (const path of ['/v41/', '/t/*', '/robots.txt', '/sitemap.xml']) {
    assert.ok(routes.include.includes(path), `${path} 가 include 에 있어야 한다`);
  }
});

test('검색을 열기 전에는 개발·운영 주소 문서 모두 X-Robots-Tag noindex(#541)', async () => {
  const assets = (html) => ({ ASSETS: { fetch: async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }) } });
  const nextStatic = () => new Response('static');
  // 루트(/): 개발 주소는 4.0 문서, 운영 주소는 /v41/ 문서로 바꿔 serve 하고 둘 다 noindex 를 붙인다.
  const devRoot = await prodRoot({ request: new Request(`${DEV}/`), env: assets('<html>4.0</html>'), next: nextStatic });
  assert.equal(devRoot.headers.get('x-robots-tag'), 'noindex');
  const prodRootResponse = await prodRoot({ request: new Request(`${PROD}/`), env: assets('<html><link href="shell.css"><link href="identity.css"><script src="shell.mjs"></html>'), next: nextStatic });
  const rootHtml = await prodRootResponse.text();
  assert.match(rootHtml, /href="\/v41\/shell\.css"/, '운영 주소 루트는 기존처럼 자산 주소를 바꾼다');
  assert.equal(prodRootResponse.headers.get('x-robots-tag'), 'noindex', '서비스 시작 전에는 운영 주소도 noindex');
  // /v41/: 검색을 열기 전에는 운영·개발 주소 모두 noindex 를 붙인다.
  const prodV41 = await v41Root({ request: new Request(`${PROD}/v41/`), env: assets('<html>app</html>'), next: nextStatic });
  assert.equal(await prodV41.text(), '<html>app</html>');
  assert.equal(prodV41.headers.get('x-robots-tag'), 'noindex');
  const devV41 = await v41Root({ request: new Request(`${DEV}/v41/`), env: assets('<html>app</html>'), next: nextStatic });
  assert.equal(await devV41.text(), '<html>app</html>');
  assert.equal(devV41.headers.get('x-robots-tag'), 'noindex');
});
