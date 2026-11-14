import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocation} from '../public/v41/shell/location.mjs';
import {ownerSelectionRoute} from '../public/v41/selection-location.mjs';

// #231 1-B 후속: shell/location.mjs를 직접 호출해 주소 읽기·쓰기를 고정한다(가짜 history·location).

function setup({hash = '#home', handled = '', source = 'example', owned = false, shareId = null, current = 'src064-orbit.html', journey = {}, trees = [], networkOpen = null} = {}) {
  const calls = [];
  const historyCalls = [];
  const storage = {data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); }};
  globalThis.location = {hash};
  globalThis.history = {
    state: null,
    pushState(state, title, url) { historyCalls.push(['push', url]); globalThis.location.hash = url; },
    replaceState(state, title, url) { historyCalls.push(['replace', url]); globalThis.location.hash = url; },
  };
  globalThis.localStorage = storage;
  globalThis.addEventListener = (type, fn) => calls.push(['listen', type, fn]);
  const state = {current, handled, member: owned ? {snapshot: () => ({owned: true, subject: 'me@example.com'})} : null};
  globalThis.window = {LT41: owned ? {tree: {id: 't1'}, momentId: 'm1'} : null};
  const api = createLocation({
    $: () => null,
    getCurrent: () => state.current,
    setCurrent: file => { state.current = file; calls.push(['current', file]); },
    getMember: () => state.member,
    getSource: () => source,
    getModel: () => ({trees}),
    getActiveShareId: () => shareId,
    getHandled: () => state.handled,
    setHandled: h => { state.handled = h; },
    show: (file, write) => calls.push(['show', file, write]),
    choose: (id, momentId) => calls.push(['choose', id, momentId]),
    notify: text => calls.push(['notify', text]),
    startMember: () => calls.push(['startMember']),
    showPublicRoute: route => calls.push(['public', route.shareId]),
    requestNetworkOpen: id => { (networkOpen || calls).push(['networkOpen', id]); },
    journey: {saved: () => !!journey.saved},
    gotoJourneyStep: step => calls.push(['goto', step]),
    openFirstJourney: options => calls.push(['openJourney', options.step]),
    finishJourney: () => calls.push(['finish']),
    leaveJourney: () => calls.push(['leave']),
  });
  return {api, calls, historyCalls, state, storage};
}

test('예시 감상은 화면 이름만 주소에 쓰고, 같은 주소면 history를 건드리지 않는다', () => {
  const {api, historyCalls, state} = setup({hash: '#home', current: 'track59-sketchbook.html'});
  api.writeLocation();
  assert.deepEqual(historyCalls, [['push', '#book']]);
  assert.equal(state.handled, '#book');

  historyCalls.length = 0;
  api.writeLocation();
  assert.deepEqual(historyCalls, [], '이미 같은 주소면 쌓지 않는다');
  assert.equal(state.handled, '#book');
});

test('replace 모드는 replaceState로 쓰고, 공유 감상은 #share/<id>/<view>를 쓴다', () => {
  const {api, historyCalls} = setup({hash: '#home', source: 'share', shareId: 'sh_1', current: 'track58-pinboard.html'});
  api.writeLocation('replace');
  assert.deepEqual(historyCalls, [['replace', '#share/sh_1/board']]);
});

test('로그인한 내 기록은 #my/<view>?tree=…&moment=…를 쓰고 최근 위치를 저장한다', () => {
  const {api, historyCalls, storage} = setup({hash: '#home', source: 'server', owned: true, current: 'track59-sketchbook.html'});
  api.writeLocation();
  const expected = ownerSelectionRoute({view: 'book', treeId: 't1', momentId: 'm1'});
  assert.deepEqual(historyCalls, [['push', expected]]);
  assert.match(storage.data['lovetree.v41.account-positions.v1'] || '', /me@example\.com/);
});

test('popstate·hashchange는 같은 함수에 연결된다', () => {
  const {calls} = setup();
  const listened = calls.filter(c => c[0] === 'listen').map(c => c[1]);
  assert.deepEqual(listened, ['popstate', 'hashchange']);
});

test('이미 처리한 해시는 다시 처리하지 않는다', () => {
  const {api, calls} = setup({hash: '#book', handled: '#book'});
  api.applyBrowserLocation();
  assert.deepEqual(calls.filter(c => c[0] !== 'listen'), []);
});

test('여정 주소는 단계 이동·열기·완료·나가기로 나뉜다', () => {
  const goto = setup({hash: '#journey/03', current: 'first-journey.html'});
  goto.api.applyBrowserLocation();
  assert.deepEqual(goto.calls.filter(c => c[0] !== 'listen'), [['goto', 3]]);

  const open = setup({hash: '#journey/02', current: 'src064-orbit.html'});
  open.api.applyBrowserLocation();
  assert.deepEqual(open.calls.filter(c => c[0] !== 'listen'), [['openJourney', 2]]);

  const finished = setup({hash: '#journey/04', current: 'src064-orbit.html', journey: {saved: true}});
  finished.api.applyBrowserLocation();
  assert.deepEqual(finished.calls.filter(c => c[0] !== 'listen'), [['finish']]);

  const leave = setup({hash: '#home', current: 'first-journey.html'});
  leave.api.applyBrowserLocation();
  assert.deepEqual(leave.calls.filter(c => c[0] !== 'listen'), [['leave']]);
});

test('공유 주소는 공유 감상으로, 내 기록 주소는 로그인 전이면 로그인 시작으로 보낸다', () => {
  const share = setup({hash: '#share/sh_9/book'});
  share.api.applyBrowserLocation();
  assert.deepEqual(share.calls.filter(c => c[0] !== 'listen'), [['public', 'sh_9']]);

  const owner = setup({hash: '#my/book?tree=t1&moment=m1', source: 'example'});
  owner.api.applyBrowserLocation();
  const ownerCalls = owner.calls.filter(c => c[0] !== 'listen');
  assert.deepEqual(ownerCalls[0], ['current', 'track59-sketchbook.html']);
  assert.deepEqual(ownerCalls[1], ['show', 'track59-sketchbook.html', false]);
  assert.deepEqual(ownerCalls[2], ['startMember']);
});

test('보통 화면 주소는 화면만 바꿔 보여 준다', () => {
  const {api, calls} = setup({hash: '#network'});
  api.applyBrowserLocation();
  assert.deepEqual(calls.filter(c => c[0] !== 'listen'), [['current', 'track56-network.html'], ['show', 'track56-network.html', false]]);
});

// #583 '이 순간 열기': 주소가 지도의 특정 순간을 가리키면(로그인 상태) 지도가 그 순간을 가운데 두고
// 열리게 요청을 남긴다. 순간을 찾지 못했거나 지도가 아닌 보기면 요청을 남기지 않는다.
test('#my/network?moment=…는 지도 열기 요청을 남기고, 못 찾은 순간·다른 보기는 남기지 않는다', () => {
  const trees = [{id: 't1', moments: [{id: 'm9', parentId: null}, {id: 'm1', parentId: null}]}];
  const open = setup({hash: '#my/network?tree=t1&moment=m9', source: 'server', owned: true, trees});
  open.api.applyBrowserLocation();
  assert.deepEqual(open.calls.filter(c => c[0] === 'networkOpen'), [['networkOpen', 'm9']]);

  // 주소의 순간이 이 계정에 없으면: 시작 순간 안내만 하고 가운데 열기 요청은 없다.
  const missing = setup({hash: '#my/network?tree=t1&moment=zz', source: 'server', owned: true, trees});
  missing.api.applyBrowserLocation();
  assert.deepEqual(missing.calls.filter(c => c[0] === 'networkOpen'), []);
  assert.ok(missing.calls.some(c => c[0] === 'notify'), '못 찾은 순간 안내는 그대로다');

  // 지도가 아닌 보기(책)의 주소는 요청을 남기지 않는다.
  const book = setup({hash: '#my/book?tree=t1&moment=m9', source: 'server', owned: true, trees});
  book.api.applyBrowserLocation();
  assert.deepEqual(book.calls.filter(c => c[0] === 'networkOpen'), []);
});
