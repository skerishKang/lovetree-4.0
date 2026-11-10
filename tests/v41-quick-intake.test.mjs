import test from 'node:test';
import assert from 'node:assert/strict';
// 빠른 담기 입구의 순수 계산: 파라미터 소비·추출·분류·중복 판정·세션 보관 (docs/TESTING.md).
// DOM 배선은 tests/v41-quick-intake-flow.test.mjs가 가짜 객체로 직접 부른다.
import {
  INTAKE_URL_PARAM, INTAKE_TEXT_PARAM, INTAKE_TITLE_PARAM, INTAKE_MAX_URL_LENGTH, INTAKE_DUP_TEXT,
  readIntakeParams, classifyIntake, firstHttpUrl, resolveIntakeCandidate, canonicalUrl, isInboxDuplicate, createPendingSlot,
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

test('isInboxDuplicate: inbox의 같은 주소만 잡는다(모양이 나빠도 조용히 거짓)', () => {
  const trees = [
    { id: 't0', inbox: true, moments: [{ id: 'm0', url: 'https://example.com/a' }, { id: 'm1' }] },
    { id: 't1', inbox: false, moments: [{ id: 'm2', url: 'https://example.com/a' }] },
    { id: 't2', inbox: true, moments: [{ id: 'm3', url: 'HTTPS://EXAMPLE.com/a' }] },
  ];
  assert.equal(isInboxDuplicate(trees, 'https://example.com/a'), true, '이미 inbox에 있다');
  assert.equal(isInboxDuplicate(trees, 'https://EXAMPLE.com/a'), true, '정규화해서 비교한다(대문자 호스트)');
  assert.equal(isInboxDuplicate(trees, 'https://example.com/b'), false);
  assert.equal(isInboxDuplicate([trees[1]], 'https://example.com/a'), false, '일반 트리는 세지 않는다');
  assert.equal(isInboxDuplicate([{ id: 'x', inbox: true, moments: [{}] }], 'https://example.com/a'), false);
  assert.equal(isInboxDuplicate(null, 'https://example.com/a'), false);
  assert.equal(isInboxDuplicate(trees, ''), false);
  assert.equal(isInboxDuplicate(trees, '그냥-글자'), false);
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
  assert.equal(typeof INTAKE_DUP_TEXT, 'string');
  assert.ok(INTAKE_DUP_TEXT.length > 0);
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
