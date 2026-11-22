import { MSG } from '../public/v41/frame-messages.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {homeMomentCards} from '../v41/home-moments.js';
import {homeCardsPlan} from '../v41/home-cards.js';
import '../public/v41/youtube-id.mjs'; // #1060: 정본이 등록한 globalThis.LTYouTubeId 를 vm 에도 넣는다.
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 vm 에도 넣는다.

// #340(2026-11-10 CTO 결정): 내 기록(서버 기록·로그인 소유자)의 YouTube 순간을 첫 화면 썸네일 카드로 센다.
// 판정·썸네일 주소는 media-preview의 autoLoadMedia·describe 한 벌을 재사용하므로, 시험도 그 실제 함수를
// vm으로 직접 불러 쓴다(docs/TESTING.md — 동작은 함수 호출로). 예시·공유·파일 기록은 기존 규칙 그대로다.

const scope = { LT41_MSG: MSG,window: {}, URL, URLSearchParams, LTYouTubeId: globalThis.LTYouTubeId, LTEscapeHtml: globalThis.LTEscapeHtml};
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
  assert.equal(plan.note, '테두리가 있는 카드는 내가 남긴 순간이에요');
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

// #952: 궤도 쪽 계약(재생 표시·no-referrer·예시 문구 분리, LTMedia 판정이 첫 화면 카드까지 닿는 것)
// 은 그려진 첫 화면에서 잰다 — tests/v41-home-screen-952.test.mjs. 여기서는 home-cards.js의
// youtube 기본값 함수 입출력을 검사한다.
test('homeCardsPlan은 youtube 판정을 homeMomentCards에 그대로 넘긴다 — 없으면 영상 순간도 글 카드', () => {
  const ytMoment = moment('y1', { url: 'https://youtu.be/abc123DEF45' });
  // youtube 판정을 넘기지 않으면(기본 null) YouTube 순간은 썸네일 카드로 세지 않는다.
  const plain = homeCardsPlan({ mode: 'mine', loggedIn: true, context: member([ytMoment]) });
  assert.equal(plain.kind, 'mine');
  assert.ok(plain.cards.every(c => c.type !== 'video' && c.youtubeThumb === false), '판정 없이는 영상 카드를 만들지 않는다');
  // 판정을 넘기면 같은 순간이 영상 썸네일 카드가 된다.
  const judged = homeCardsPlan({ mode: 'mine', loggedIn: true, context: member([ytMoment]), youtube: owner });
  assert.equal(judged.cards.map(c => c.type === 'video' && c.youtubeThumb).includes(true), true);
});

test('#1026 영상 주소만 있어도 메타데이터 조회 없이 썸네일 후보를 얻는다', () => {
  const {photos}=homeMomentCards(member([yt('y1')]),40,undefined,{auto:true});
  assert.equal(photos[0].image,'https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg');
});
