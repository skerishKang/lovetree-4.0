import test from 'node:test';
import assert from 'node:assert/strict';
// 빠른 담기 입구의 순수 계산: 파라미터 소비·추출·분류·중복 판정·세션 보관 (docs/TESTING.md).
// DOM 배선은 tests/v41-quick-intake-flow.test.mjs가 가짜 객체로 직접 부른다.
import {
  INTAKE_URL_PARAM, INTAKE_TEXT_PARAM, INTAKE_TITLE_PARAM, INTAKE_MAX_URL_LENGTH,
  readIntakeParams, classifyIntake, firstHttpUrl, resolveIntakeCandidate, canonicalUrl, isSameVideoMoment,
  findSameVideoInTree, treesWithSameVideo, createPendingSlot, isSameMoment, duplicatesByTree, sameMomentNoun, momentOrigin,
  resolveMediaMetadata, INTAKE_TITLE_WAIT_MS,
} from '../public/v41/quick-intake.mjs';

// LTMedia.describe와 같은 모양의 최소 판정(화면이 실제로 쓰는 전역과 같은 계약).
const describeLike = (url) => {
  const value = String(url ?? '');
  if (!value.trim()) return { kind: 'none', original: value, label: '', openUrl: '' };
  let parsed;
  try { parsed = new URL(value); } catch { return { kind: 'invalid', original: value, label: '', openUrl: '' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { kind: 'invalid', original: value, label: '', openUrl: '' };
  return { kind: 'link', original: value, label: parsed.hostname.replace(/^www\./, ''), openUrl: parsed.href };
};

test('readIntakeParams: 없으면 없고, 있으면 세 값을 읽고 모두 지운다(다른 파라미터는 남긴다)', () => {
  assert.deepEqual(readIntakeParams(''), { found: false, url: '', text: '', title: '', rest: '' });
  assert.deepEqual(readIntakeParams('?intent=new-tree'), { found: false, url: '', text: '', title: '', rest: 'intent=new-tree' });
  const rows = [
    [`?${INTAKE_URL_PARAM}=https%3A%2F%2Fexample.com%2Fa`, { url: 'https://example.com/a', text: '', title: '', rest: '' }],
    [`?${INTAKE_TEXT_PARAM}=제목+https%3A%2F%2Fexample.com%2Fb`, { url: '', text: '제목 https://example.com/b', title: '', rest: '' }],
    [`?${INTAKE_TITLE_PARAM}=https%3A%2F%2Fexample.com%2Fc`, { url: '', text: '', title: 'https://example.com/c', rest: '' }],
    [`?a=1&${INTAKE_URL_PARAM}=https%3A%2F%2Fexample.com%2Fd&${INTAKE_TEXT_PARAM}=t&${INTAKE_TITLE_PARAM}=i&b=2`, { url: 'https://example.com/d', text: 't', title: 'i', rest: 'a=1&b=2' }],
    [`?${INTAKE_URL_PARAM}=%20%20https%3A%2F%2Fexample.com%2Fe%20%20&${INTAKE_URL_PARAM}=ignored`, { url: 'https://example.com/e', text: '', title: '', rest: '' }],
  ];
  for (const [search, shape] of rows) {
    const got = readIntakeParams(search);
    assert.equal(got.found, true, search);
    assert.equal(got.url, shape.url, search);
    assert.equal(got.text, shape.text, search);
    assert.equal(got.title, shape.title, search);
    assert.equal(got.rest, shape.rest, search);
  }
  const empty = readIntakeParams(`?${INTAKE_URL_PARAM}=`);
  assert.equal(empty.found, true, '빈 값도 소비 대상이다(호출자가 버리고 지운다)');
  assert.equal(empty.url, '');
});

test('firstHttpUrl / resolveIntakeCandidate: url → text → title 순, 첫 주소만, 문구·문장부호 제거', () => {
  assert.equal(resolveIntakeCandidate({ url: '  https://a.test/x  ', text: 'https://b.test/y', title: 'https://c.test/z' }), 'https://a.test/x');
  assert.equal(resolveIntakeCandidate({ url: '', text: '제목 https://b.test/y', title: 'https://c.test/z' }), 'https://b.test/y');
  assert.equal(resolveIntakeCandidate({ url: '', text: '', title: 'https://c.test/z.' }), 'https://c.test/z', '꼬리 문장부호 제거');
  assert.equal(resolveIntakeCandidate({ url: '', text: '… https://b.test/y!', title: '' }), 'https://b.test/y');
  assert.equal(resolveIntakeCandidate({ url: ' 첫째 https://a.test/1 둘째 https://a.test/2', text: '', title: '' }), 'https://a.test/1', '첫 주소만');
  assert.equal(resolveIntakeCandidate({ url: '', text: 'ftp://a.test/f', title: '' }), '', 'http(s) 아님');
  assert.equal(resolveIntakeCandidate({ url: '그냥-글자', text: '', title: '' }), '');
  assert.equal(resolveIntakeCandidate({}), '');
  assert.equal(resolveIntakeCandidate(), '');

  const long = `https://a.test/${'a'.repeat(INTAKE_MAX_URL_LENGTH)}`;
  assert.equal(resolveIntakeCandidate({ url: long, text: 'https://b.test/ok', title: '' }), 'https://b.test/ok', '상한 초과 url은 건너뛰고 text를 쓴다');
  assert.equal(resolveIntakeCandidate({ url: long, text: '', title: '' }), '');
  const ok = `https://a.test/${'a'.repeat(INTAKE_MAX_URL_LENGTH - 'https://a.test/'.length)}`;
  assert.equal(ok.length, INTAKE_MAX_URL_LENGTH);
  assert.equal(resolveIntakeCandidate({ url: ok, text: '', title: '' }), ok, '상한 길이는 받는다');
});

test('classifyIntake: 빈 값·주소·그 외를 구분한다', () => {
  assert.equal(classifyIntake('', describeLike).status, 'empty');
  assert.equal(classifyIntake('   ', describeLike).status, 'empty');
  assert.equal(classifyIntake('https://example.com/어떤-글', describeLike).status, 'ok');
  assert.equal(classifyIntake('notaurl', describeLike).status, 'invalid');
  assert.equal(classifyIntake('ftp://example.com/a', describeLike).status, 'invalid');
  assert.equal(classifyIntake('javascript:alert(1)', describeLike).status, 'invalid');
});

test('classifyIntake: 판정 함수가 막혀도 던지지 않는다', () => {
  const broken = () => { throw new Error('deny'); };
  assert.equal(classifyIntake('https://example.com', broken).status, 'invalid');
});

test('canonicalUrl: URL로 읽히면 정규화하고, 아니면 원문', () => {
  assert.equal(canonicalUrl('HTTPS://EXAMPLE.com/a'), 'https://example.com/a');
  assert.equal(canonicalUrl(' https://example.com/a '), 'https://example.com/a');
  assert.equal(canonicalUrl('그냥-글자'), '그냥-글자');
  assert.equal(canonicalUrl(''), '');
});

test('#876 isSameVideoMoment: 같은 영상은 id로, 구간이 같거나 둘 다 없을 때 같은 장면으로 본다', () => {
  const base = { id: 'm0', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
  // 주소 모양이 달라도 영상 id가 같으면 같은 영상(규칙 5) — youtu.be·shorts·watch.
  assert.equal(isSameVideoMoment(base, 'https://youtu.be/dQw4w9WgXcQ'), true, 'youtu.be도 같은 영상');
  assert.equal(isSameVideoMoment(base, 'https://www.youtube.com/shorts/dQw4w9WgXcQ'), true, 'shorts도 같은 영상');
  assert.equal(isSameVideoMoment(base, 'https://www.youtube.com/watch?v=다른id가아니라같은id'), false, '다른 영상은 다르다');
  // 구간이 다르면 다른 장면(규칙 2) — 막지 않고 그냥 담는다.
  assert.equal(isSameVideoMoment({ ...base, startSeconds: 90 }, 'https://youtu.be/dQw4w9WgXcQ?t=30'), false, '구간이 다르면 다른 장면');
  assert.equal(isSameVideoMoment({ ...base, startSeconds: 30 }, 'https://youtu.be/dQw4w9WgXcQ?t=30'), true, '같은 구간은 같은 장면');
  assert.equal(isSameVideoMoment(base, 'https://youtu.be/dQw4w9WgXcQ?t=30'), false, '없음과 있음은 다른 장면');
  assert.equal(isSameVideoMoment({ ...base, startSeconds: 30, endSeconds: 60 }, 'https://youtu.be/dQw4w9WgXcQ?t=30'), false, '끝이 다르면 다른 장면');
  // 유튜브가 아니면 주소가 같을 때만 같은 것으로 본다(기존 규칙 유지).
  assert.equal(isSameVideoMoment({ id: 'm1', url: 'https://example.com/a' }, 'https://EXAMPLE.com/a'), true, '같은 주소');
  assert.equal(isSameVideoMoment({ id: 'm1', url: 'https://example.com/a' }, 'https://example.com/b'), false);
  // 모양이 나빠도 조용히 거짓(막지 않는다).
  assert.equal(isSameVideoMoment({}, 'https://example.com/a'), false);
  assert.equal(isSameVideoMoment({ id: 'm1' }, 'https://example.com/a'), false);
  assert.equal(isSameVideoMoment(base, ''), false);
  assert.equal(isSameVideoMoment(null, 'https://example.com/a'), false);
});

test('#876 findSameVideoInTree: 같은 트리 안의 같은 영상·같은 장면 순간을 찾는다', () => {
  const tree = {
    id: 't0', inbox: true,
    moments: [
      { id: 'm0', url: 'https://example.com/a' },
      { id: 'm1', url: 'https://youtu.be/dQw4w9WgXcQ' },
      {},
    ],
  };
  assert.equal(findSameVideoInTree(tree, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.id, 'm1', '모양이 달라도 같은 영상');
  assert.equal(findSameVideoInTree(tree, 'https://example.com/a')?.id, 'm0', '같은 주소(유튜브 아님)');
  assert.equal(findSameVideoInTree(tree, 'https://example.com/z'), null);
  assert.equal(findSameVideoInTree(null, 'https://example.com/a'), null);
  assert.equal(findSameVideoInTree({ id: 'x', moments: [{}] }, 'https://example.com/a'), null);
  assert.equal(findSameVideoInTree({ id: 'x' }, 'https://example.com/a'), null);
});

test('#876 treesWithSameVideo: 다른 트리에 같은 영상이 있는 트리들을 찾는다(구간은 보지 않는다)', () => {
  const trees = [
    { id: 't0', moments: [{ id: 'm0', url: 'https://youtu.be/dQw4w9WgXcQ' }] },
    { id: 't1', moments: [{ id: 'm1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=99' }] },
    { id: 't2', moments: [{ id: 'm2', url: 'https://youtu.be/다른영상' }] },
    { id: 't3', moments: [{}] },
  ];
  const found = treesWithSameVideo(trees, { excludeTreeId: 't0', url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.deepEqual(found.map(tree => tree.id), ['t1'], '같은 영상이 있는 다른 트리만(구간 무관)');
  assert.deepEqual(treesWithSameVideo(trees, { excludeTreeId: 't1', url: 'https://youtu.be/dQw4w9WgXcQ' }).map(tree => tree.id), ['t0']);
  assert.deepEqual(treesWithSameVideo(trees, { url: 'https://youtu.be/dQw4w9WgXcQ' }).map(tree => tree.id), ['t0', 't1'], '빼는 트리가 없으면 전부');
  assert.deepEqual(treesWithSameVideo(trees, { excludeTreeId: 't0', url: '' }), [], '주소가 없으면 아무것도 보지 않는다');
  assert.deepEqual(treesWithSameVideo(null, { url: 'https://youtu.be/dQw4w9WgXcQ' }), []);
});

test('createPendingSlot: 한 번 보관·덮어쓰기·지우기, 저장소를 못 쓰면 조용하다', () => {
  const file = new Map();
  const storage = { getItem: (k) => (file.has(k) ? file.get(k) : null), setItem: (k, v) => file.set(k, v), removeItem: (k) => file.delete(k) };
  const slot = createPendingSlot(storage);
  assert.equal(slot.read(), null);
  slot.write('https://example.com/a');
  assert.deepEqual(slot.read(), { url: 'https://example.com/a' });
  slot.write('https://example.com/b');
  assert.deepEqual(slot.read(), { url: 'https://example.com/b' });
  slot.clear();
  assert.equal(slot.read(), null);

  const broken = { getItem: () => { throw new Error('deny'); }, setItem: () => { throw new Error('deny'); }, removeItem: () => { throw new Error('deny'); } };
  const safe = createPendingSlot(broken);
  assert.equal(safe.read(), null);
  safe.write('https://example.com');
  safe.clear();

  const noop = createPendingSlot(null);
  noop.write('https://example.com');
  assert.equal(noop.read(), null);
  assert.equal(INTAKE_URL_PARAM, 'quickadd');
  assert.equal(INTAKE_TEXT_PARAM, 'qtext');
  assert.equal(INTAKE_TITLE_PARAM, 'qtitle');
});

// LTMedia.describe처럼 YouTube를 알아보는 최소 판정(저장 전 제목 확보 시험용).
const describeYouTube = (url) => {
  const value = String(url ?? '');
  const match = value.match(/youtube\.com\/watch\?v=([\w-]{11})/) || value.match(/youtu\.be\/([\w-]{11})/);
  if (match) return { kind: 'youtube', original: value, videoId: match[1], label: 'YouTube 영상', openUrl: `https://www.youtube.com/watch?v=${match[1]}` };
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? { kind: 'link', label: parsed.hostname, openUrl: parsed.href } : { kind: 'invalid', openUrl: '' };
  } catch { return { kind: 'none', openUrl: '' }; }
};
const YT = 'https://www.youtube.com/watch?v=abc12345678';

test('resolveMediaMetadata: YouTube는 기존 oEmbed 한 벌로 제목을 받아 mediaMetadata로 넘긴다(#344 계약)', async () => {
  const asked = [];
  const fetchImpl = async (path) => { asked.push(path); return { ok: true, json: async () => ({ title: '  영상 제목  ' }) }; };
  assert.deepEqual(await resolveMediaMetadata(YT, { describe: describeYouTube, fetchImpl }), { mediaMetadata: { title: '영상 제목' } });
  assert.deepEqual(asked, ['/api/youtube/oembed?v=abc12345678'], '영상 제목 조회는 기존 서버 oEmbed 프록시 한 곳만 쓴다');
  assert.ok(INTAKE_TITLE_WAIT_MS > 0 && INTAKE_TITLE_WAIT_MS <= 5000);
});

test('resolveMediaMetadata: 실패·예외·빈 제목은 빈 값(주소만 저장으로 물러남)', async () => {
  const deny = async () => ({ ok: false, json: async () => ({ title: 'x' }) });
  assert.deepEqual(await resolveMediaMetadata(YT, { describe: describeYouTube, fetchImpl: deny }), {});
  const boom = async () => { throw new Error('network'); };
  assert.deepEqual(await resolveMediaMetadata(YT, { describe: describeYouTube, fetchImpl: boom }), {});
  const blank = async () => ({ ok: true, json: async () => ({ title: '   ' }) });
  assert.deepEqual(await resolveMediaMetadata(YT, { describe: describeYouTube, fetchImpl: blank }), {});
});

test('resolveMediaMetadata: 제목이 늦으면 상한 시간 뒤 빈 값으로 끝난다(저장을 막지 않음)', async () => {
  const never = () => new Promise(() => {});
  const started = Date.now();
  const result = await resolveMediaMetadata(YT, { describe: describeYouTube, fetchImpl: never, timeoutMs: 20 });
  assert.deepEqual(result, {});
  assert.ok(Date.now() - started < 1000, '상한(20ms) 뒤 돌아온다');
});

test('resolveMediaMetadata: YouTube가 아니면 oEmbed를 부르지 않는다', async () => {
  let called = 0;
  const fetchImpl = async () => { called += 1; return { ok: true, json: async () => ({ title: 'x' }) }; };
  assert.deepEqual(await resolveMediaMetadata('https://example.com/a', { describe: describeYouTube, fetchImpl }), {});
  assert.deepEqual(await resolveMediaMetadata('그냥 글자', { describe: describeYouTube, fetchImpl }), {});
  assert.equal(called, 0);
});

// #1439: 순간끼리 같은 순간 판정(순간 정리의 '이미 있음'). #876 규칙에 복사 원본(copiedFrom)을 더한다.
test('#1439 isSameMoment: 같은 영상+같은 시작 초, 같은 사진 파일, 같은 원본이면 같고 시작 초가 다르면 다르다', () => {
  const yt = (id, extra = {}) => ({ id, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', ...extra });
  const photo = 'https://lovetree-4-0.pages.dev/api/media/0f0e0d0c-0b0a-4999-8999-000000000001.png';
  const rows = [
    [yt('a', { startSeconds: 30 }), { id: 'b', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 30 }, true, '같은 영상·같은 시작 초(주소 모양 달라도)'],
    [yt('a', { startSeconds: 30 }), { id: 'b', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 45 }, false, '시작 초가 다르면 다른 순간'],
    [yt('a'), { id: 'b', url: 'https://youtu.be/dQw4w9WgXcQ?t=30' }, false, '없음과 30초는 다르다'],
    [yt('a'), yt('b'), true, '둘 다 시작 초 없음'],
    [{ id: 'p', url: photo }, { id: 'q', url: photo }, true, '같은 사진 파일'],
    [{ id: 'p', url: photo }, { id: 'q', url: photo.replace('001.png', '002.png') }, false, '다른 사진 파일'],
    [{ id: 'o', title: '원본' }, { id: 'c', copiedFrom: 'o', title: '고친 사본' }, true, '원본과 사본'],
    [{ id: 'c1', copiedFrom: 'o', url: photo }, { id: 'c2', copiedFrom: 'o' }, true, '같은 원본의 두 사본'],
    [{ id: 'x', title: '글만' }, { id: 'y', title: '글만' }, false, '주소 없는 글 순간은 원본으로만'],
    [null, yt('b'), false, '빈 값'],
  ];
  for (const [a, b, want, label] of rows) {
    assert.equal(isSameMoment(a, b), want, label);
    assert.equal(isSameMoment(b, a), want, label + '(반대로)');
  }
  assert.equal(momentOrigin({ id: 'c', copiedFrom: 'o' }), 'o');
  assert.equal(momentOrigin({ id: 'o' }), 'o');
});

test('#1439 duplicatesByTree: 대상 트리마다 이미 있는 고른 순간만 모은다', () => {
  const trees = [
    { id: 't2', moments: [{ id: 'x', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 30 }] },
    { id: 't3', moments: [{ id: 'y', url: 'https://youtu.be/dQw4w9WgXcQ', startSeconds: 90 }] },
    { id: 't4', moments: [{ id: 'z', copiedFrom: 'm2' }] },
  ];
  const picked = [{ id: 'm1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', startSeconds: 30 }, { id: 'm2', title: '글' }];
  assert.deepEqual(duplicatesByTree(trees, picked, ['t2', 't3', 't4', 'nope']), [
    { treeId: 't2', momentIds: ['m1'] },
    { treeId: 't4', momentIds: ['m2'] },
  ], '시작 초가 다른 t3은 없음, 없는 트리는 무시');
  assert.deepEqual(duplicatesByTree(trees, [], ['t2']), []);
});

test('#1439 sameMomentNoun: 알림 문구 이름(영상·사진·순간)', () => {
  assert.equal(sameMomentNoun({ url: 'https://youtu.be/dQw4w9WgXcQ' }), '영상');
  assert.equal(sameMomentNoun({ url: '/api/media/0f0e0d0c-0b0a-4999-8999-000000000001.mp4' }), '영상');
  assert.equal(sameMomentNoun({ url: '/api/media/0f0e0d0c-0b0a-4999-8999-000000000001.webp' }), '사진');
  assert.equal(sameMomentNoun({ url: 'https://example.com/article' }), '순간');
  assert.equal(sameMomentNoun({}), '순간');
});
