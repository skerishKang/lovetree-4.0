import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeOrbitPlan, HOME_ORBIT_LIMIT} from '../v41/home-moments.js';
import {createHomeActions} from '../v41/home-actions.js';

// 2026-11-08 첫 화면: 로그인한 사람의 순간이 궤도에 오르고, 남는 자리만 흐린 예시로 채운다.

const moment = (id, extra = {}) => ({
  id,
  title: `순간 ${id}`,
  note: `메모 ${id}`,
  date: '2026-11-01',
  emotion: '위로',
  parentId: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});
const tree = moments => ({id: 'tree-mine', title: '내 책', updatedAt: '2026-11-08T00:00:00.000Z', moments});
const member = (trees, extra = {}) => ({source: 'server', member: 'in', tree: trees[0] || null, trees, ...extra});

test('로그아웃은 지금처럼 예시만 쓴다', () => {
  const plan = homeOrbitPlan({source: 'example'});
  assert.equal(plan.kind, 'out');
  assert.deepEqual(plan.cards, []);
  assert.equal(plan.fill, 0);
  assert.equal(plan.note, '');
});

test('로그인·순간 0개도 예시만 쓰고 기존 안내 문구를 유지한다', () => {
  const plan = homeOrbitPlan(member([tree([])]));
  assert.equal(plan.kind, 'empty');
  assert.deepEqual(plan.cards, []);
  assert.equal(plan.note, '');
});

test('내 순간 3개는 최근 수정 순으로 3장, 남는 37자리는 예시로 채운다', () => {
  const plan = homeOrbitPlan(member([tree([
    moment('m1', {updatedAt: '2026-11-01T00:00:00.000Z'}),
    moment('m2', {updatedAt: '2026-11-03T00:00:00.000Z'}),
    moment('m3', {updatedAt: '2026-11-02T00:00:00.000Z'}),
  ])]));
  assert.equal(plan.kind, 'mixed');
  assert.deepEqual(plan.cards.map(c => c.id), ['m2', 'm3', 'm1']);
  assert.equal(plan.fill, HOME_ORBIT_LIMIT - 3);
  assert.equal(plan.note, '흐린 카드는 감상 예시예요');
  assert.ok(plan.cards.every(c => c.type === 'memo'), '글만 있는 순간은 기존 메모 카드 모양');
  assert.equal(plan.cards[0].note, '메모 m2');
});

test('궤도를 가득 채우면 안내는 내 순간 문구가 되고 예시를 섞지 않는다', () => {
  const moments = Array.from({length: HOME_ORBIT_LIMIT}, (_, i) => moment(`m${i}`));
  const plan = homeOrbitPlan(member([tree(moments)]));
  assert.equal(plan.kind, 'mine');
  assert.equal(plan.cards.length, HOME_ORBIT_LIMIT);
  assert.equal(plan.fill, 0);
  assert.equal(plan.note, '내가 남긴 순간들이에요');
});

test('썸네일은 저장된 같은 출처·data 값만 쓰고 외부 이미지는 요청하지 않는다', () => {
  const plan = homeOrbitPlan(member([tree([
    moment('local', {mediaMetadata: {thumbnail: '/media/local.jpg', title: 't', source: 'x'}}),
    moment('inline', {attachment: {url: 'data:image/png;base64,AAAA'}}),
    moment('external', {url: 'https://i.ytimg.com/vi/abc/hq.jpg', mediaMetadata: {thumbnail: 'https://i.ytimg.com/vi/abc/hq.jpg'}}),
  ])]));
  const byId = Object.fromEntries(plan.cards.map(c => [c.id, c]));
  assert.equal(byId.local.type, 'photo');
  assert.equal(byId.local.image, '/media/local.jpg');
  assert.equal(byId.inline.type, 'photo');
  assert.equal(byId.external.image, '', '외부 이미지는 클릭 전 요청을 만들지 않는다');
  assert.equal(byId.external.type, 'memo');
});

test('카드를 누르면 lt41-select → lt41-navigate로 그 순간의 기억책을 연다', () => {
  const context = {source: 'server', member: 'in', tree: tree([moment('m1')]), trees: [tree([moment('m1')])]};
  const sent = [];
  const actions = createHomeActions({getContext: () => context, send: m => sent.push(m), gallery: true});
  actions.actions.openMine('tree-mine', 'm1');
  assert.deepEqual(sent, [
    {type: 'lt41-select', id: 'm1'},
    {type: 'lt41-navigate', view: 'track59-sketchbook.html'},
  ]);
  actions.actions.openMine('tree-mine', 'foreign');
  assert.equal(sent.length, 2, '내 트리에 없는 순간은 열지 않는다');
});

test('흐린 예시 카드는 내 순간을 선택하지 않고 기존 예시 감상으로 남는다', () => {
  const context = {source: 'server', member: 'in', tree: tree([moment('m1')]), trees: [tree([moment('m1')])]};
  const sent = [];
  const actions = createHomeActions({getContext: () => context, send: m => sent.push(m), gallery: true});
  actions.actions.openBook('limone-example', 'm01');
  assert.deepEqual(sent, [{type: 'lt41-example', view: 'track59-sketchbook.html', momentId: 'm01'}]);
});

test('궤도 어댑터는 예시 채움을 받고, 외부 요청·oEmbed 호출을 만들지 않는다', () => {
  const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
  assert.match(orbit, /examples=\[\]/);
  assert.match(orbit, /c\.example\?\.55/);
  assert.equal(/fetch\(|XMLHttpRequest|oembed/i.test(orbit), false);
  const home = readFileSync(new URL('../v41/home.js', import.meta.url), 'utf8');
  assert.match(home, /homeOrbitPlan\(context\)/);
  assert.match(home, /examples:orbitPlan\.fill\?ORBIT_EXAMPLE\.moments/);
  assert.match(home, /onOpen:card=>bridge\.actions\.openMine/);
});
