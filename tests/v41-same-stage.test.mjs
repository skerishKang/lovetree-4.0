import test from 'node:test';
import assert from 'node:assert/strict';
// #627 후속: 같은 영상·같은 무대 찾기 한 벌(same-stage.mjs) — 동작 시험만 한다(소스 글자 검사 없다).
import { videoKey, findDuplicates, findSameStage } from '../public/v41/same-stage.mjs';
import { stageKeyForMoment, findMatchingStageId } from '../src/stage-key.js';
import { timingRatio, TIMING_RATIO_LIMIT, TIMING_CEILING_MS } from './helpers/timing-ratio.mjs';

test('videoKey — 주소 모양 열여덟 가지(watch·youtu.be·shorts·m.youtube·embed·t=·ytimg)', () => {
  const cases = [
    // 묶는 쪽: 유튜브 주소에서 11자리 id
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // watch
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83&list=PL1', 'dQw4w9WgXcQ'], // watch + t=·list=
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // youtu.be
    ['https://youtu.be/dQw4w9WgXcQ?t=32', 'dQw4w9WgXcQ'], // youtu.be + t=
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // shorts
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // live
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=30', 'dQw4w9WgXcQ'], // embed
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // m.youtube
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // music.youtube
    ['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 'dQw4w9WgXcQ'], // ytimg 썸네일
    ['https://i.ytimg.com/vi_webp/dQw4w9WgXcQ/hqdefault.webp', 'dQw4w9WgXcQ'], // ytimg webp
    ['http://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'], // http도 영상이다
    // 버리는 쪽: 유튜브가 아니거나 영상 id가 없거나 받지 않는 모양
    ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', ''], // 유튜브 흉내
    ['https://example.com/watch?v=dQw4w9WgXcQ', ''],
    ['https://www.youtube.com/watch?x=dQw4w9WgXcQ', ''], // v= 가 아니면
    ['https://youtu.be/shortid', ''], // 11자리가 아니면
    ['', ''],
    [null, ''],
  ];
  for (const [url, expected] of cases) assert.equal(videoKey(url), expected, `videoKey(${String(url)})`);
});

test('findDuplicates — 같은 영상 2번(주소 모양이 달라도 id가 같으면 묶는다)', () => {
  const moments = [
    { id: 'm1', url: 'https://www.youtube.com/watch?v=aaa111bbb01' },
    { id: 'm2', url: 'https://youtu.be/aaa111bbb01?t=32' }, // 같은 영상, 다른 모양
    { id: 'm3', url: 'https://www.youtube.com/shorts/aaa111bbb02' }, // 다른 영상 하나뿐
    { id: 'm4', url: 'https://example.com/photo.jpg' }, // 유튜브가 아니면 묶지 않는다
  ];
  assert.deepEqual(findDuplicates(moments), [{ key: 'aaa111bbb01', momentIds: ['m1', 'm2'] }]);
});

test('findDuplicates — 하나뿐인 영상·id 없는 순간·빈 입력은 묶음이 없다', () => {
  assert.deepEqual(findDuplicates([{ id: 'm1', url: 'https://youtu.be/aaa111bbb01' }]), []);
  assert.deepEqual(findDuplicates([{ url: 'https://youtu.be/aaa111bbb01' }, { id: 'm2', url: 'https://youtu.be/aaa111bbb01' }]), [], 'id 없는 순간은 건너뛴다');
  assert.deepEqual(findDuplicates([]), []);
  assert.deepEqual(findDuplicates(null), []);
});

const fancam = (id, { stage, song, date }, url = 'https://youtu.be/aaa111bbb01') => ({
  id,
  url,
  date,
  keywords: [stage ? `무대:${stage}` : '감정:설렘', song ? `노래:${song}` : '멤버:제나'],
});

test('findSameStage — 같은 무대 직캠 3개는 하나로 묶인다', () => {
  const moments = [
    fancam('m1', { stage: '인기가요', song: 'Super Shy', date: '2023-08-27' }, 'https://youtu.be/aaa111bbb01'),
    fancam('m2', { stage: '인기가요', song: 'Super Shy', date: '2023-08-27' }, 'https://youtu.be/aaa111bbb02'),
    fancam('m3', { stage: '인기가요', song: 'Super Shy', date: '2023-08-27' }, 'https://www.youtube.com/shorts/aaa111bbb03'),
    fancam('m4', { stage: '엠카운트다운', song: 'Super Shy', date: '2023-08-31' }, 'https://youtu.be/aaa111bbb04'), // 무대가 다르다
  ];
  const groups = findSameStage(moments);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].momentIds, ['m1', 'm2', 'm3'], '무대·노래·무대 날짜가 모두 같은 것만');
  assert.equal(groups[0].stage, '인기가요');
  assert.equal(groups[0].song, 'Super Shy');
  assert.equal(groups[0].date, '2023-08-27');
});

test('findSameStage — 날짜가 다른 같은 노래는 묶지 않는다', () => {
  const moments = [
    fancam('m1', { stage: '뮤직뱅크', song: 'The Chase', date: '2024-11-15' }),
    fancam('m2', { stage: '뮤직뱅크', song: 'The Chase', date: '2024-11-22' }), // 무대 날짜만 다르다
  ];
  assert.deepEqual(findSameStage(moments), []);
});

test('findSameStage — 무대·노래·무대 날짜 중 하나라도 비면 묶지 않는다', () => {
  const noSong = (id) => ({ id, url: 'https://youtu.be/aaa111bbb01', date: '2023-08-27', keywords: ['무대:인기가요'] });
  const noStage = (id) => ({ id, url: 'https://youtu.be/aaa111bbb01', date: '2023-08-27', keywords: ['노래:Super Shy'] });
  const noDate = (id) => ({ id, url: 'https://youtu.be/aaa111bbb01', date: '', keywords: ['무대:인기가요', '노래:Super Shy'] });
  const noTags = (id) => ({ id, url: 'https://youtu.be/aaa111bbb01', date: '2023-08-27', keywords: [] });
  const legacyTags = (id) => ({ id, url: 'https://youtu.be/aaa111bbb01', date: '2023-08-27', keywords: ['인기가요', 'Super Shy'] }); // 종류 없는 옛 꼬리표는 무대·노래로 읽지 않는다
  for (const make of [noSong, noStage, noDate, noTags, legacyTags]) {
    assert.deepEqual(findSameStage([make('a'), make('b')]), [], `${make.name} — 묶지 않는다`);
  }
});

test('findSameStage — 표기 차이는 tags.mjs tagKey로 하나로 센다', () => {
  const moments = [
    fancam('m1', { stage: '쇼챔피언', song: 'Super Shy', date: '2024-01-05' }),
    fancam('m2', { stage: '쇼챔피언', song: 'super shy.', date: '2024-01-05' }), // 대소문자·마침표 차이
  ];
  const groups = findSameStage(moments);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].song, 'Super Shy', '표시 값은 처음 본 원본 값');
});

test('300개 순간 계산은 30개에 비해 제곱으로 느려지지 않는다', () => {
  const moments = [];
  for (let i = 0; i < 300; i += 1) {
    moments.push({
      id: `m${i}`,
      url: `https://youtu.be/v${String(i % 150).padStart(10, '0')}`, // 150개 영상 × 2번
      date: i % 4 < 2 ? '2024-01-05' : '2024-01-12',
      keywords: [`무대:${i % 2 ? '인기가요' : '뮤직뱅크'}`, '노래:Super Shy'],
    });
  }
  const dup = timingRatio({ small: () => findDuplicates(moments.slice(0, 30)), big: () => findDuplicates(moments) });
  const stage = timingRatio({ small: () => findSameStage(moments.slice(0, 30)), big: () => findSameStage(moments) });
  const duplicates = dup.last;
  const sameStage = stage.last;
  assert.equal(duplicates.length, 150, '같은 영상 묶음 150개');
  assert.equal(sameStage.length, 4, '같은 무대 묶음 4개(무대 2 × 날짜 2)');
  // 절대 ms 대신 같은 실행의 30개와 비교한다(#728 CI windows 러너 흔들림, #731).
  assert.ok(dup.ratio <= TIMING_RATIO_LIMIT, `findDuplicates 300개/30개 비율 ${dup.ratio.toFixed(1)}배 ≤ ${TIMING_RATIO_LIMIT}배 (30개 ${dup.smallMs.toFixed(2)}ms · 300개 ${dup.bigMs.toFixed(1)}ms)`);
  assert.ok(dup.bigMs <= TIMING_CEILING_MS, `findDuplicates 300개 ${dup.bigMs.toFixed(1)}ms ≤ ${TIMING_CEILING_MS}ms`);
  assert.ok(stage.ratio <= TIMING_RATIO_LIMIT, `findSameStage 300개/30개 비율 ${stage.ratio.toFixed(1)}배 ≤ ${TIMING_RATIO_LIMIT}배 (30개 ${stage.smallMs.toFixed(2)}ms · 300개 ${stage.bigMs.toFixed(1)}ms)`);
  assert.ok(stage.bigMs <= TIMING_CEILING_MS, `findSameStage 300개 ${stage.bigMs.toFixed(1)}ms ≤ ${TIMING_CEILING_MS}ms`);
});

test('findSameStage — 묶음 열쇠는 값에 나올 수 없는 구분자로 잡는다(| 값이어도 안 뭉개진다)', () => {
  const moments = [
    fancam('m1', { stage: 'A', song: 'B|C', date: '2024-05-01' }, 'https://youtu.be/aaa111bbb01'),
    fancam('m2', { stage: 'A|B', song: 'C', date: '2024-05-01' }, 'https://youtu.be/bbb222ccc02'),
    fancam('m3', { stage: 'A', song: 'B|C', date: '2024-05-01' }, 'https://youtu.be/ccc333ddd03'),
  ];
  const groups = findSameStage(moments);
  assert.equal(groups.length, 1, '무대:A·노래:B|C 와 무대:A|B·노래:C 는 다른 묶음이다');
  assert.deepEqual(groups[0].momentIds, ['m1', 'm3'], '같은 무대·노래·날짜인 m1·m3만 한 무더기');
  assert.equal(groups[0].stage, 'A');
  assert.equal(groups[0].song, 'B|C');
});

const videoId = 'AbC123xyZ_0';
const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
const stageKey = (fields = {}) => stageKeyForMoment({ url: watchUrl, ...fields });
const rangeKey = (startSeconds, endSeconds) => stageKey({ startSeconds, endSeconds });

test('무대 키는 영상 전체, 시작만 있는 책갈피, 시작과 끝이 있는 구간을 구분한다', () => {
  const source = { version: 1, platform: 'youtube', videoId };
  const cases = [
    [{}, 'whole', null, null],
    [{ url: `https://youtube.com/shorts/${videoId}` }, 'whole', null, null],
    [{ startSeconds: 0 }, 'bookmark', 0, null],
    [{ url: `https://youtu.be/${videoId}?t=42s` }, 'bookmark', 42, null],
    [{ url: watchUrl + '#start=9', endSeconds: 74 }, 'range', 9, 74],
    [{ url: watchUrl + '&t=9', startSeconds: 10, endSeconds: 74 }, 'range', 10, 74],
    [{ endSeconds: 43200 }, 'range', 0, 43200],
  ];
  for (const [fields, kind, startSeconds, endSeconds] of cases) {
    assert.deepEqual(stageKey(fields), { ...source, kind, startSeconds, endSeconds });
  }
});

test('무대 키는 시청할 수 없는 주소와 잘못된 명시 구간을 제외한다', () => {
  for (const fields of [
    { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` },
    { url: 'https://www.tiktok.com/@artist/video/12345' },
    { url: '/api/media/example.mp4' },
    { url: `https://youtube.com.example/watch?v=${videoId}` },
    { startSeconds: -1 }, { startSeconds: 1.5 }, { endSeconds: 43201 },
    { startSeconds: 10, endSeconds: 10 }, { startSeconds: 11, endSeconds: 10 },
  ]) {
    assert.equal(stageKey(fields), null, JSON.stringify(fields));
  }
});

test('무대의 영상 전체·책갈피는 입력 종류와 영상이 일치할 때만 연결된다', () => {
  const whole = stageKey();
  const bookmark = stageKey({ startSeconds: 0 });
  const anchors = [
    { stageId: 'whole-id', registrationOrder: 1, key: whole },
    { stageId: 'bookmark-id', registrationOrder: 2, key: bookmark },
  ];
  assert.equal(findMatchingStageId(whole, anchors), 'whole-id');
  assert.equal(findMatchingStageId(bookmark, anchors), 'bookmark-id');
  for (const key of [
    rangeKey(0, 30), stageKey({ startSeconds: 1 }),
    { ...whole, platform: 'tiktok' }, { ...whole, version: 2 },
    stageKey({ url: `https://youtu.be/${videoId.toLowerCase()}` }),
  ]) {
    assert.equal(findMatchingStageId(key, anchors), null);
  }
});

test('구간은 고정 기준과의 교집합/합집합이 50% 이상일 때만 같은 무대다', () => {
  const anchors = [{ stageId: 'anchor-id', registrationOrder: 1, key: rangeKey(10, 22) }];
  assert.equal(findMatchingStageId(rangeKey(14, 26), anchors), 'anchor-id'); // 8/16
  assert.equal(findMatchingStageId(rangeKey(15, 27), anchors), null); // 7/17
  assert.equal(findMatchingStageId(rangeKey(18, 30), anchors), null); // 14~26초를 거쳐 이어지지 않는다
  assert.equal(findMatchingStageId(rangeKey(22, 30), anchors), null); // 끝점에서만 만난다
  assert.equal(findMatchingStageId(rangeKey(10, 11), anchors), null); // 포함된 1초 장면
});

test('고정 기준이 여럿이면 겹침 비율을 먼저, 동률이면 등록 순서를 따른다', () => {
  const early = { stageId: 'z-first', registrationOrder: 2, key: rangeKey(0, 10) };
  const late = { stageId: 'a-second', registrationOrder: 10, key: rangeKey(5, 15) };
  for (const anchors of [[early, late], [late, early]]) {
    assert.equal(findMatchingStageId(rangeKey(2, 14), anchors), 'a-second'); // 8/14와 9/13
    assert.equal(findMatchingStageId(rangeKey(2, 13), anchors), 'z-first'); // 둘 다 8/13
  }
});
