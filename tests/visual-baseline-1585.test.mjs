import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUB_PATHS, visualPublicApiResponse, installVisualPublicApiStubs
} from '../tools/visual-baseline/public-api-stub.mjs';

const ORIGIN = 'https://preview-example.pages.dev';
const sample = path => visualPublicApiResponse(ORIGIN + path, 'GET', ORIGIN);

test('#1585 공개 API 고정 응답은 503이나 조회 시각과 관계없이 동일하다', () => {
  assert.deepEqual(STUB_PATHS, [
    '/api/community/stats', '/api/community/shares',
    '/api/public/moments', '/api/public/tag-moments',
    '/api/community/stages/popular'
  ]);
  assert.deepEqual(sample('/api/community/stats'), { trees: 17, moments: 42 });
  assert.deepEqual(sample('/api/community/stats?random=1'), sample('/api/community/stats?random=2'));
  assert.equal(sample('/api/community/shares?limit=24').totalVisible, 1);
  assert.equal(sample('/api/community/shares?q=a').items[0].title, '화면 점검 공개 트리');
  assert.deepEqual(sample('/api/public/moments?limit=200').items, []);
  assert.deepEqual(sample('/api/public/tag-moments?tag=a').items, []);
  assert.deepEqual(sample('/api/community/stages/popular').items, []);
  const altered = sample('/api/community/shares');
  altered.items[0].title = '임시 수정';
  assert.equal(sample('/api/community/shares').items[0].title, '화면 점검 공개 트리', '요청 사이 자료는 독립이다');
});

test('#1585 가로채기는 동일 출처의 GET 공개 경로에만 적용한다', async () => {
  const hit = [], events = [];
  const context = { async route(pattern, handler) {
    assert.equal(pattern, '**/api/**');
    this.handler = handler;
  } };
  await installVisualPublicApiStubs(context, ORIGIN + '/v41/', path => hit.push(path));
  const simulated = async (url, method = 'GET') => {
    const route = {
      request: () => ({ url: () => url, method: () => method }),
      fulfill: async response => events.push({ type: 'fulfill', ...response }),
      continue: async () => events.push({ type: 'continue' })
    };
    await context.handler(route);
    return events.at(-1);
  };
  const success = await simulated(ORIGIN + '/api/community/stats?limit=1');
  assert.equal(success.status, 200);
  assert.deepEqual(JSON.parse(success.body), { trees: 17, moments: 42 });
  assert.match(success.contentType, /^application\/json/);
  assert.deepEqual(hit, ['/api/community/stats']);
  assert.equal((await simulated(ORIGIN + '/api/account')).type, 'continue', '로그인 요청은 제외');
  assert.equal((await simulated(ORIGIN + '/api/community/shares/123')).type, 'continue', '알 수 없는 상세 경로는 제외');
  assert.equal((await simulated(ORIGIN + '/api/community/stats', 'POST')).type, 'continue', '쓰기 요청은 제외');
  assert.equal((await simulated('https://other.invalid/api/community/stats')).type, 'continue', '다른 도메인은 제외');
  assert.deepEqual(hit, ['/api/community/stats']);
});
