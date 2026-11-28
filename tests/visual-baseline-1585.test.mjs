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

import vm from 'node:vm';
import { STABILIZE, FIX_ORBIT_PHASE } from '../tools/visual-baseline/capture-stability.mjs';

test('#1585 화면 비교는 그림자 DOM의 CSS·무한 애니메이션을 매번 정지한다', () => {
  const makeRoot = (elements = [], animations = []) => {
    const styles = [];
    return {
      styles, elements, animations,
      querySelector(selector) { return selector === 'style[data-visual-baseline]' ? styles[0] || null : null; },
      querySelectorAll(selector) { assert.equal(selector, '*'); return elements; },
      getAnimations() { return animations; },
      append(style) { styles.push(style); }
    };
  };
  let pauseCount = 0, finiteCount = 0, lastTime = -1;
  const endless = {
    effect: { getComputedTiming: () => ({ duration: Infinity, iterations: Infinity }) },
    pause() { pauseCount++; },
    set currentTime(value) { lastTime = value; }
  };
  const finite = {
    effect: { getComputedTiming: () => ({ duration: 350, iterations: 1 }) },
    finish() { finiteCount++; }
  };
  const nested = makeRoot([], [endless, finite]);
  const doc = makeRoot([{ shadowRoot: nested }]);
  doc.nodeType = 9;
  doc.documentElement = {append(style) { doc.styles.push(style); }};
  doc.createElement = () => ({ attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, textContent: '' });
  let scrollCount = 0;
  const scope = { document: doc, window: { scrollTo() { scrollCount++; } } };
  vm.runInNewContext(STABILIZE, scope);
  assert.equal(doc.styles.length, 1);
  assert.equal(nested.styles.length, 1, '격리된 그림자 DOM 안에도 고정 CSS가 적용된다');
  assert.match(nested.styles[0].textContent, /animation-play-state:paused/);
  assert.match(nested.styles[0].textContent, /\.book-card\{will-change:auto!important;transform-style:flat!important\}/);
  assert.match(nested.styles[0].textContent, /\.book-cover\{transform-style:flat!important;will-change:auto!important\}/);
  assert.doesNotMatch(nested.styles[0].textContent, /\.book-cover\s*\{[^}]*display:none/);
  assert.doesNotMatch(nested.styles[0].textContent, /\.book-cover\s*\{[^}]*opacity:0/);
  assert.equal(pauseCount, 1);
  assert.equal(lastTime, 0);
  assert.equal(finiteCount, 1);
  assert.equal(scrollCount, 1);
  const later = makeRoot([], [endless]);
  doc.elements.push({ shadowRoot: later });
  vm.runInNewContext(STABILIZE, scope);
  assert.equal(doc.styles.length, 1, '같은 스타일을 중복 추가하지 않는다');
  assert.equal(nested.styles.length, 1);
  assert.equal(later.styles.length, 1, '뒤늦게 생긴 그림자 DOM도 다시 처리한다');
  assert.equal(pauseCount, 3, '기존 및 새 그림자 DOM의 애니메이션을 재정지한다');
});

test('#1585 궤도 캡처는 움직임 정지 후 같은 위상으로 다시 그린다', () => {
  const order = [];
  const hook = {
    pauseFloat() { order.push('float'); },
    hold(on) { order.push('hold:' + on); },
    seek(phase) { order.push('seek:' + phase); },
    syncDomPoses() { order.push('sync'); }
  };
  const result = vm.runInNewContext(FIX_ORBIT_PHASE, { __LT_ORBIT_TEST__: hook });
  assert.equal(result, true);
  assert.deepEqual(order, ['float', 'hold:true', 'seek:0.25', 'sync']);
  assert.equal(vm.runInNewContext(FIX_ORBIT_PHASE, {}), false, '궤도 없는 화면은 그대로 촬영한다');
});
