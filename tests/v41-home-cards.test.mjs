import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  HOME_CARDS_KEY, readHomeCardsMode, writeHomeCardsMode, homeCardsMenu,
  homeCardsLabel, homeCardsPlan, clickWithin,
} from '../v41/home-cards.js';
import {homeMomentCards, HOME_TEXT_LIMIT} from '../v41/home-moments.js';

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
  assert.equal(plan.note, '금빛 카드는 내가 남긴 순간이에요');
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
  assert.ok(mix.note.includes('금빛'));
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
  assert.equal(mix.note.includes('금빛'), true);
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

test('궤도 어댑터: 예시 불투명도를 낮추지 않고 내 카드에만 금빛 표시를 쓴다', () => {
  const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
  assert.equal(/c\.example\?\.\d/.test(orbit), false, '예시 카드 불투명도 보정이 없다');
  // #429 2/2: 카드는 언제나 불투명(opacity를 인라인으로 낮추지 않는다), 깊이는 밝기로만 낸다.
  assert.doesNotMatch(orbit, /el\.style\.opacity=/, '카드 opacity를 인라인으로 쓰지 않는다');
  assert.match(orbit, /el\.style\.filter=`brightness\(/, '깊이를 밝기(brightness)로 낸다');
  assert.doesNotMatch(orbit, /\.card[^{]*\{[^}]*blur/, '카드 규칙에 blur가 없다');
  assert.match(orbit, /\.card\.mine\{/);
  assert.match(orbit, /var\(--lt-gold/);
  for (const start of [orbit.indexOf('.card.mine{'), orbit.indexOf('.card.mine:after{')]) {
    const css = orbit.slice(start, orbit.indexOf('}', start) + 1);
    assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, '새 hex 없이 토큰만 쓴다');
  }
});

test('첫 화면 배선: 모드 저장 키, 인기 API, 공개 카드 클릭 경로를 쓴다', () => {
  const home = readFileSync(new URL('../v41/home.js', import.meta.url), 'utf8');
  const cards = readFileSync(new URL('../v41/home-cards.js', import.meta.url), 'utf8');
  assert.match(cards, /lt41\.homeCards/);
  assert.match(home, /homeCardsPlan\(/);
  assert.match(home, /fetchPopularCards/);
  assert.match(home, /#share\//);
  const popular = readFileSync(new URL('../v41/home-popular.js', import.meta.url), 'utf8');
  assert.match(popular, /createCommunityApi/);
  assert.match(popular, /\.discover\(/);
  assert.match(popular, /createShareApi/);
  assert.equal(/fetch\('/.test(popular), false, '직접 fetch로 새 API를 만들지 않는다');
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

test('첫 화면 카드·움직임은 설정 창이 맡고 첫 화면은 메시지로만 받는다', () => {
  const home = readFileSync(new URL('../v41/home.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../public/v41/shell.mjs', import.meta.url), 'utf8');
  // #380 5번: 첫 화면의 보기 메뉴를 없앴다 — 카드 출처·움직임은 설정 창 "화면" 묶음에서 고른다.
  assert.match(shell, /for\(const b of document\.querySelectorAll\('\[data-home-cards\]'\)\)b\.onclick=/, '설정의 카드 출처 단추');
  assert.match(shell, /localStorage\.setItem\('lt41\.homeCards',b\.dataset\.homeCards\)/, '저장 키는 그대로');
  assert.match(shell, /postMessage\(\{type:'lt41-home-cards'/, '첫 화면에 다시 그리라고 알린다');
  assert.match(shell, /postMessage\(\{type:'lt41-motion'/, '첫 화면의 움직임을 멈추거나 켠다');
  assert.match(home, /type==='lt41-home-cards'[^\n]*location\.reload\(\)/, '첫 화면은 다시 그린다');
  assert.match(home, /type==='lt41-motion'[^\n]*orbit\?\.motion\?\.set/, '첫 화면은 궤도 움직임을 바꾼다');
  // 이슈 #466 M2: 책·보드·지도는 lt41-date-style로 즉시 반영되는데 첫 화면만 안 되던 결함 — 다시 그린다.
  // 2026-11-12 사고: 받을 때마다 새로고침하면 셸이 프레임이 뜰 때마다 보내는 같은 값 때문에 끝없이 이어진다.
  // 값이 실제로 바뀌었을 때만 다시 띄운다(판정은 shouldReloadForDateStyle — tests/v41-home-date-style-loop.test.mjs).
  assert.match(home, /type==='lt41-date-style'\)\{[\s\S]{0,200}shouldReloadForDateStyle\(\{value:event\.data\.value,rendered:renderedDateStyle,mirror\}\)\)location\.reload\(\)/, '날짜 표기가 바뀌면 첫 화면도 다시 그린다');
  assert.doesNotMatch(home, /type==='lt41-date-style'\)\{location\.reload\(\);\}/, '받을 때마다 무조건 새로고침하지 않는다');
  assert.doesNotMatch(home, /createViewMenu|data-lt-view-menu/, '첫 화면에 옛 보기 메뉴가 없다');
});
