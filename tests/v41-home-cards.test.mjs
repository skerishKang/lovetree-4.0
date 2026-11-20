import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_CARDS_KEY, readHomeCardsMode, writeHomeCardsMode, homeCardsMenu,
  homeCardsLabel, homeCardsPlan, clickWithin,
} from '../v41/home-cards.js';
import {homeMomentCards, HOME_TEXT_LIMIT} from '../v41/home-moments.js';
import {fetchPopularCards} from '../v41/home-popular.js';

// 2026-11-08 첫 화면 카드 출처: 예시/인기/내 것만/섞어서, 선명한 예시, 금빛 내 카드.

const moment = (id, extra = {}) => ({
  id, title: `순간 ${id}`, note: `메모 ${id}`, date: '2026-11-01', emotion: '위로',
  parentId: null, createdAt: '2026-11-01T00:00:00.000Z', ...extra,
});
const photo = (id, extra = {}) => moment(id, {mediaMetadata: {thumbnail: '/media/' + id + '.jpg'}, ...extra});
const tree = moments => ({id: 'tree-mine', title: '내 책', moments});
const member = (moments, extra = {}) => ({source: 'server', member: 'in', tree: tree(moments), trees: [tree(moments)], ...extra});
const memory = () => {
  const map = new Map();
  return {getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map};
};

test('모드 저장: 기본은 로그아웃 예시·로그인 섞어서, 로그아웃이면 내 모드를 예시로 되돌린다', () => {
  const storage = memory();
  assert.equal(readHomeCardsMode(storage), 'example');
  assert.equal(readHomeCardsMode(storage, {loggedIn: true}), 'mix');
  storage.setItem(HOME_CARDS_KEY, 'mine');
  assert.equal(readHomeCardsMode(storage, {loggedIn: true}), 'mine');
  assert.equal(readHomeCardsMode(storage, {loggedIn: false}), 'example');
  assert.equal(writeHomeCardsMode(storage, 'popular'), 'popular');
  assert.equal(storage.getItem(HOME_CARDS_KEY), 'popular');
  const broken = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }};
  assert.equal(readHomeCardsMode(broken), 'example');
  assert.equal(writeHomeCardsMode(broken, 'mix'), 'example');
  assert.equal(writeHomeCardsMode(storage, 'unknown'), 'example');
});

test('메뉴: 로그아웃은 예시·인기만, 로그인은 네 모드', () => {
  assert.deepEqual(homeCardsMenu({loggedIn: false}), ['example', 'popular']);
  assert.deepEqual(homeCardsMenu({loggedIn: true}), ['example', 'popular', 'mine', 'mix']);
  assert.equal(homeCardsLabel('mix'), '섞어서');
  assert.equal(homeCardsLabel('nope'), '예시');
});

test('예시 모드: 예시 40장을 선명하게 쓰고 안내는 기존 문구를 유지한다', () => {
  const plan = homeCardsPlan({mode: 'example', loggedIn: true, context: member([photo('p1')])});
  assert.equal(plan.kind, 'example');
  assert.deepEqual(plan.cards, []);
  assert.equal(plan.examples, 40);
  assert.equal(plan.note, null);
});

test('섞어서: 사진 5 + 글 3이면 사진 5 + 글 2, 남는 33자리는 예시', () => {
  const plan = homeCardsPlan({mode: 'mix', loggedIn: true, context: member([
    photo('p1'), photo('p2'), photo('p3'), photo('p4'), photo('p5'),
    moment('t1'), moment('t2'), moment('t3'),
  ])});
  assert.equal(plan.kind, 'mix');
  assert.equal(plan.cards.filter(c => c.type === 'photo').length, 5);
  assert.equal(plan.cards.filter(c => c.type === 'memo').length, HOME_TEXT_LIMIT);
  assert.equal(plan.cards.length, 7);
  assert.equal(plan.examples, 33);
  assert.equal(plan.note, '테두리가 있는 카드는 내가 남긴 순간이에요');
  assert.ok(plan.cards.every(c => c.source === 'mine'));
});

test('섞어서: 사진이 3장 미만이면 내 카드를 올리지 않고 예시만 쓴다', () => {
  for (const photos of [[], [photo('p1')], [photo('p1'), photo('p2')]]) {
    const plan = homeCardsPlan({mode: 'mix', loggedIn: true, context: member([...photos, moment('t1'), moment('t2')])});
    assert.equal(plan.kind, 'mix-empty');
    assert.deepEqual(plan.cards, []);
    assert.equal(plan.examples, 40);
    assert.equal(plan.note, null);
  }
});

test('내 것만: 사진과 글 최대 2장만, 예시를 섞지 않는다', () => {
  const plan = homeCardsPlan({mode: 'mine', loggedIn: true, context: member([
    photo('p1'), photo('p2'), moment('t1'), moment('t2'), moment('t3'),
  ])});
  assert.equal(plan.kind, 'mine');
  assert.equal(plan.cards.length, 4);
  assert.equal(plan.examples, 0);
  assert.equal(plan.note, '');
  const textsOnly = homeCardsPlan({mode: 'mine', loggedIn: true, context: member([moment('t1'), moment('t2'), moment('t3')])});
  assert.equal(textsOnly.cards.length, 2);
  assert.equal(textsOnly.examples, 0);
});

test('내 것만 0장: 예시로 대체하지 않고 첫 순간 안내를 쓴다', () => {
  const plan = homeCardsPlan({mode: 'mine', loggedIn: true, context: member([])});
  assert.equal(plan.kind, 'mine-empty');
  assert.deepEqual(plan.cards, []);
  assert.equal(plan.examples, 0);
  assert.equal(plan.note, '아직 남긴 순간이 없어요 · 첫 순간 추가');
});

test('인기: 10장 미만이면 예시로 채우고 안내, 10장 이상이면 예시 없이 공개 카드만', () => {
  const popular = Array.from({length: 5}, (_, i) => ({id: 'pub' + i, source: 'public', title: '공개' + i}));
  const short = homeCardsPlan({mode: 'popular', loggedIn: false, popular});
  assert.equal(short.cards.length, 5);
  assert.equal(short.examples, 35);
  assert.equal(short.note, '아직 공개된 순간이 적어요');
  const enough = homeCardsPlan({mode: 'popular', loggedIn: false, popular: Array.from({length: 12}, (_, i) => ({id: 'pub' + i}))});
  assert.equal(enough.examples, 0);
  assert.equal(enough.note, '');
});

test('썸네일은 저장된 같은 출처·data 값만 쓰고 외부 이미지는 카드로 쓰지 않는다', () => {
  const {photos, memos} = homeMomentCards(member([
    photo('local'), moment('inline', {attachment: {url: 'data:image/png;base64,AAAA'}}),
    moment('external', {mediaMetadata: {thumbnail: 'https://i.ytimg.com/vi/abc/hq.jpg'}}),
  ]));
  assert.deepEqual(photos.map(c => c.id).sort(), ['inline', 'local']);
  assert.deepEqual(memos.map(c => c.id), ['external']);
});

const PRIVATE_ORIGIN = 'https://lovetree-4-0.pages.dev';
const privateUpload = (id, n, ext = 'png') => moment(id, {
  url: `${PRIVATE_ORIGIN}/api/media/0000000${n}-0000-4000-8000-00000000000${n}.${ext}`,
});

test('업로드 사진 3개는 섞어서와 내 것만에서 사진 카드가 된다', () => {
  const uploads = [privateUpload('u1', 1), privateUpload('u2', 2), privateUpload('u3', 3)];
  const cards = homeMomentCards(member(uploads), 40, PRIVATE_ORIGIN);
  assert.equal(cards.photos.length, 3);
  assert.equal(cards.memos.length, 0);
  assert.ok(cards.photos.every(c => c.type === 'photo' && c.image.startsWith(PRIVATE_ORIGIN + '/api/media/')));
  const mix = homeCardsPlan({mode: 'mix', loggedIn: true, context: member(uploads), origin: PRIVATE_ORIGIN});
  assert.equal(mix.kind, 'mix');
  assert.equal(mix.cards.filter(c => c.type === 'photo').length, 3);
  assert.ok(mix.note.includes('테두리가 있는'));
  const mine = homeCardsPlan({mode: 'mine', loggedIn: true, context: member(uploads), origin: PRIVATE_ORIGIN});
  assert.equal(mine.kind, 'mine');
  assert.equal(mine.cards.length, 3);
  assert.ok(mine.cards.every(c => c.type === 'photo'));
});

test('업로드 사진은 YouTube mediaMetadata 순간과 섞여도 각자 카드로 남는다', () => {
  const uploads = [privateUpload('u1', 1), privateUpload('u2', 2), privateUpload('u3', 3)];
  const youtube = moment('yt', {url: 'https://youtu.be/dQw4w9WgXcQ', mediaMetadata: {thumbnail: '/media/yt.jpg'}});
  const cards = homeMomentCards(member([...uploads, youtube]), 40, PRIVATE_ORIGIN);
  assert.equal(cards.photos.length, 4);
  assert.ok(cards.photos.some(c => c.id === 'yt' && c.type === 'photo'));
  assert.ok(cards.photos.filter(c => c.id.startsWith('u')).every(c => c.type === 'photo'));
  const mix = homeCardsPlan({mode: 'mix', loggedIn: true, context: member([...uploads, youtube]), origin: PRIVATE_ORIGIN});
  assert.equal(mix.cards.filter(c => c.type === 'photo').length, 4);
  assert.equal(mix.note.includes('테두리가 있는'), true);
});

test('다른 출처의 /api/media 모양과 업로드 영상은 사진 카드가 아니다', () => {
  const external = moment('ext', {url: 'https://evil.test/api/media/00000001-0000-4000-8000-000000000001.png'});
  const video = privateUpload('vid', 2, 'mp4');
  const cards = homeMomentCards(member([external, video]), 40, PRIVATE_ORIGIN);
  assert.equal(cards.photos.length, 0);
  assert.equal(cards.memos.find(c => c.id === 'vid')?.type, 'video');
  assert.equal(cards.memos.some(c => c.id === 'ext' && c.type === 'photo'), false);
});

test('공식 별칭의 보관 파일도 현재 출처 경로로만 쓴다', () => {
  const alias = moment('alias', {url: 'https://lovetree.padiem.net/api/media/00000004-0000-4000-8000-000000000004.png'});
  const cards = homeMomentCards(member([alias]), 40, PRIVATE_ORIGIN);
  assert.equal(cards.photos.length, 1);
  assert.equal(cards.photos[0].image, `${PRIVATE_ORIGIN}/api/media/00000004-0000-4000-8000-000000000004.png`);
});

// #952: 궤도 카드의 불투명·밝기 깊이·내 카드 금빛은 그려진 첫 화면의 계산된 스타일로 잰다
// (tests/v41-home-screen-952.test.mjs — #429 2/2 계약). 인기 카드 배선은 아래 함수 시험이 검사한다.
test('인기 카드: 둘러보기의 공개 API 한 벌(community.discover·shares.read)로만 만든다', async () => {
  const calls = [];
  const community = {
    discover: async (params) => { calls.push(['discover', params]); return { ok: true, items: [
      { shareId: 's2', view: 'gallery' },
      { shareId: 's1' },
    ] }; },
  };
  const shares = {
    read: async (id) => { calls.push(['read', id]);
      if (id === 's1') return { tree: { id: 't1', moments: [
        { id: 'm1', title: '최신', createdAt: '2026-11-02T00:00:00Z', mediaMetadata: { thumbnail: '/media/a.jpg' } },
        { id: 'm2', title: '사진 없는 순간', createdAt: '2026-11-01T00:00:00Z' },
      ] } };
      return { tree: { id: 't2', moments: [
        { id: 'm3', title: '가운데', createdAt: '2026-11-03T00:00:00Z', attachment: { url: 'data:image/png;base64,AAAA' } },
      ] } };
    },
  };
  const cards = await fetchPopularCards({ community, shares });
  assert.deepEqual(calls, [['discover', { limit: 12 }], ['read', 's2'], ['read', 's1']], 'discover 한 번·공개 트리마다 read 한 번');
  // 사진이 없는 순간은 카드에서 뺀다. 남은 카드는 최신순이다.
  assert.deepEqual(cards.map(c => c.id), ['m3', 'm1']);
  assert.ok(cards.every(c => c.source === 'public' && c.key === `${c.shareId}/${c.id}`));
  assert.equal(cards.find(c => c.id === 'm3').view, 'gallery', '공개 항목의 보기 값을 그대로 쓴다');
  assert.equal(cards.find(c => c.id === 'm1').view, 'book', '보기 값이 없으면 책 기본');
  // 발견이 막히거나 이상하면 카드 0장 — 주입된 API 외의 길은 없다.
  assert.deepEqual(await fetchPopularCards({ community: { discover: async () => { throw new Error('down'); } }, shares }), []);
  assert.deepEqual(await fetchPopularCards({ community: { discover: async () => ({ ok: false }) }, shares }), []);
  assert.deepEqual(await fetchPopularCards({ community: { discover: async () => ({ ok: true, items: 'nope' }) }, shares }), []);
});

test('카드 메뉴: shadow DOM 클릭은 document retarget에도 안쪽으로 판정한다', () => {
  const wrap = {contains: () => false};
  const button = {role: 'button'};
  const host = {role: 'host'};
  const documentNode = {role: 'document'};
  // shadow DOM 안 버튼 클릭은 document에서 target이 host로 retarget되지만 composedPath에는 cardWrap이 남는다.
  assert.equal(clickWithin({target: host, composedPath: () => [button, wrap, host, documentNode]}, wrap), true);
  assert.equal(clickWithin({target: documentNode, composedPath: () => [documentNode]}, wrap), false);
  const fallback = {contains: target => target === button};
  assert.equal(clickWithin({target: button}, fallback), true, 'composedPath가 없으면 contains로 되돌아간다');
  assert.equal(clickWithin({target: host}, fallback), false);
  assert.equal(clickWithin({target: button}, null), false);
});

// #952: 설정 창의 카드 출처·움직임 배선(#380 5번)과 날짜 표기 다시 띄우기 판정(#466 M2·2026-11-12 사고)
// 은 실제 화면에서 잰다 — tests/v41-home-screen-952.test.mjs.
