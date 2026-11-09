import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {homeMomentCards} from '../v41/home-moments.js';
import {homeCardsPlan} from '../v41/home-cards.js';

// #340(2026-11-10 CTO 결정): 내 기록(서버 기록·로그인 소유자)의 YouTube 순간을 첫 화면 썸네일 카드로 센다.
// 판정·썸네일 주소는 media-preview의 autoLoadMedia·describe 한 벌을 재사용하므로, 시험도 그 실제 함수를
// vm으로 직접 불러 쓴다(docs/TESTING.md — 동작은 함수 호출로). 예시·공유·파일 기록은 기존 규칙 그대로다.

const scope = {window: {}, URL, URLSearchParams};
vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js', import.meta.url), 'utf8'), scope);
const media = scope.window.LTMedia;

const moment = (id, extra = {}) => ({
  id, title: `순간 ${id}`, note: `메모 ${id}`, date: '2026-11-01', emotion: '위로',
  parentId: null, createdAt: '2026-11-01T00:00:00.000Z', ...extra,
});
const photo = (id, extra = {}) => moment(id, {mediaMetadata: {thumbnail: '/media/' + id + '.jpg'}, ...extra});
const yt = (id, url = 'https://youtu.be/abc123DEF45') => moment(id, {url});
const text = (id) => moment(id);
const tree = (moments) => ({id: 'tree-mine', title: '내 책', moments});
const member = (moments, extra = {}) => ({source: 'server', member: 'in', tree: tree(moments), trees: [tree(moments)], ...extra});
// #330 판정 한 벌을 그대로 쓴 소유자 묶음.
const owner = {describe: media.describe, auto: media.autoLoadMedia('server', true)};

test('소유자: 사진·YouTube·글이 각자의 카드로 분류된다', () => {
  const {photos, memos} = homeMomentCards(member([photo('p1'), yt('y1'), text('t1')]), 40, undefined, owner);
  assert.deepEqual(photos.map(c => c.id), ['p1', 'y1']);
  assert.deepEqual(memos.map(c => c.id), ['t1']);
  const card = photos.find(c => c.id === 'y1');
  // 썸네일 주소는 LTMedia.describe의 loadUrl 한 벌에서 온다 — 새 판정을 만들지 않았다.
  assert.equal(card.image, media.describe('https://youtu.be/abc123DEF45').loadUrl);
  assert.equal(card.image, 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
  assert.equal(card.type, 'video');
  assert.equal(card.youtubeThumb, true);
  assert.equal(card.source, 'mine');
  assert.equal(card.treeId, 'tree-mine');
  assert.equal(card.title, '순간 y1');
});

test('소유자 판정은 autoLoadMedia 한 벌을 따른다 — 예시·공유·파일·비소유는 글 카드 그대로', () => {
  for (const [source, owned, expected] of [
    ['server', true, true], ['server', false, false],
    ['example', true, false], ['share', true, false], ['file', true, false],
  ]) {
    assert.equal(media.autoLoadMedia(source, owned), expected, `${source}·owned=${owned}`);
  }
  const {photos, memos} = homeMomentCards(member([yt('y1')], {source: 'share'}), 40, undefined, {describe: media.describe, auto: false});
  assert.deepEqual(photos.map(c => c.id), []);
  const card = memos.find(c => c.id === 'y1');
  assert.equal(card.image, '');
  assert.equal(card.type, 'memo');
  assert.equal(card.youtubeThumb, false);
});

test('섞어서: YouTube 3장이면 내 썸네일 카드 3장(예시로 물러나지 않는다)', () => {
  const plan = homeCardsPlan({mode: 'mix', loggedIn: true, context: member([yt('y1'), yt('y2'), yt('y3')]), youtube: owner});
  assert.equal(plan.kind, 'mix');
  assert.equal(plan.cards.length, 3);
  assert.ok(plan.cards.every(c => c.type === 'video' && c.youtubeThumb === true));
  assert.ok(plan.cards.every(c => c.image.startsWith('https://i.ytimg.com/vi/')));
  assert.equal(plan.examples, 37);
  assert.equal(plan.note, '금빛 카드는 내가 남긴 순간이에요');
});

test('섞어서: YouTube 2장이면 지금처럼 예시(mix-empty 기준은 #297 보류로 그대로)', () => {
  for (const moments of [[], [yt('y1')], [yt('y1'), yt('y2')]]) {
    const plan = homeCardsPlan({mode: 'mix', loggedIn: true, context: member(moments), youtube: owner});
    assert.equal(plan.kind, 'mix-empty');
    assert.deepEqual(plan.cards, []);
    assert.equal(plan.examples, 40);
    assert.equal(plan.note, null);
  }
});

test('섞어서: YouTube 2 + 사진 1은 카드 3장으로 섞어서(YouTube가 카드로 세어진다)', () => {
  const plan = homeCardsPlan({mode: 'mix', loggedIn: true, context: member([photo('p1'), yt('y1'), yt('y2')]), youtube: owner});
  assert.equal(plan.kind, 'mix');
  assert.equal(plan.cards.length, 3);
  assert.equal(plan.cards.filter(c => c.type === 'photo').length, 1);
  assert.equal(plan.cards.filter(c => c.type === 'video' && c.youtubeThumb).length, 2);
});

test('내 것만: YouTube 썸네일 카드가 사진 다음·글 앞에 온다', () => {
  const plan = homeCardsPlan({mode: 'mine', loggedIn: true, context: member([photo('p1'), yt('y1'), text('t1'), text('t2'), text('t3')]), youtube: owner});
  assert.equal(plan.kind, 'mine');
  assert.deepEqual(plan.cards.map(c => `${c.id}:${c.type}`), ['p1:photo', 'y1:video', 't1:memo', 't2:memo']);
});

test('YouTube가 아닌 링크·다른 출처·비공개 영상은 썸네일 카드가 아니다(외부 이미지 유입 차단)', () => {
  const moments = [
    moment('photo-link', {url: 'https://example.test/a.png?size=2'}),
    moment('evil-media', {url: 'https://evil.test/api/media/00000001-0000-4000-8000-000000000001.png'}),
    moment('playlist', {url: 'https://youtube.com/playlist?list=x'}),
    moment('mp4', {url: 'https://lovetree-4-0.pages.dev/api/media/00000002-0000-4000-8000-000000000002.mp4'}),
  ];
  const {photos, memos} = homeMomentCards(member(moments), 40, 'https://lovetree-4-0.pages.dev', owner);
  assert.deepEqual(photos.map(c => c.id), []);
  assert.ok(memos.every(c => c.youtubeThumb === false));
  assert.ok(memos.every(c => !String(c.image).startsWith('https://i.ytimg.com/')));
  assert.equal(memos.find(c => c.id === 'mp4')?.type, 'video');
});

test('시작 시간(?t=90)이 붙어도 같은 썸네일 한 벌을 쓴다', () => {
  const {photos} = homeMomentCards(member([yt('y1', 'https://www.youtube.com/watch?v=abc123DEF45&t=90')]), 40, undefined, owner);
  assert.equal(photos[0].image, media.describe('https://www.youtube.com/watch?v=abc123DEF45&t=90').loadUrl);
  assert.equal(photos[0].image, 'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
});

test('궤도 연결: 재생 표시·no-referrer·예시 문구 분리를 소스로 고정한다', () => {
  const orbit = readFileSync(new URL('../src/views/orbit.js', import.meta.url), 'utf8');
  // YouTube 썸네일 카드만 video 타입으로 세운다(사진·글 카드와 예시는 그대로).
  assert.match(orbit, /type:m\.youtubeThumb&&m\.image\?'video':\(m\.image\?'photo':'memo'\)/);
  // 재생 표시는 꾸미기 요소다(aria-hidden). 카드 자체가 누르는 곳이다.
  assert.match(orbit, /c\.youtubeThumb&&c\.image\?'<span class="playGlyph" aria-hidden="true">▶<\/span>':''/);
  // 썸네일 요청은 #330과 같은 no-referrer·lazy다.
  assert.match(orbit, /c\.youtubeThumb\?' referrerpolicy="no-referrer" loading="lazy" decoding="async"':''/);
  // '영상 포스터 예시' 문구는 예시 카드에만 붙는다 — 내 YouTube 카드가 예시로 읽히지 않게 한다.
  assert.match(orbit, /\(demo\|\|c\.example\)&&c\.type==='video'\?' · 영상 포스터 예시':''/);
  assert.equal(/\$\{c\.type==='video'\?' · 영상 포스터 예시'/.test(orbit), false, '기록 상태 없이 붙던 예시 문구 판정은 남기지 않는다');
  // 재생 표시 모양은 기존 궤도 CSS 한 벌(.card.video .playGlyph)을 쓴다.
  const css = readFileSync(new URL('../src/views/orbit-source.css', import.meta.url), 'utf8');
  assert.match(css, /\.card\.video \.playGlyph\{/);
});

test('첫 화면 배선: home.js는 LTMedia 판정 한 벌을 homeCardsPlan에 넘긴다', () => {
  const home = readFileSync(new URL('../v41/home.js', import.meta.url), 'utf8');
  const cards = readFileSync(new URL('../v41/home-cards.js', import.meta.url), 'utf8');
  const moments = readFileSync(new URL('../v41/home-moments.js', import.meta.url), 'utf8');
  assert.match(home, /LTMedia\?\.currentContext\?\.\(\)/);
  assert.match(home, /LTMedia\?\.autoLoadMedia\?\.\(mediaState\.source,mediaState\.owned\)===true/);
  assert.match(home, /homeCardsPlan\(\{mode,loggedIn,context,popular,youtube\}\)/);
  assert.match(cards, /youtube = null/);
  assert.match(cards, /homeMomentCards\(context, limit, origin, youtube\)/);
  assert.match(moments, /media\?\.kind === 'youtube' && media\.loadUrl/);
});
