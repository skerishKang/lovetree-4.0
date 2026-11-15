import test from 'node:test';
import assert from 'node:assert/strict';
// #627 후속: 같은 영상·같은 무대 찾기 한 벤(same-stage.mjs) — 동작 시험만 한다(소스 글자 검사 없다).
import { videoKey, findDuplicates, findSameStage } from '../public/v41/same-stage.mjs';

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

test('300개 순간 계산은 50ms 안에서 끝난다', () => {
  const moments = [];
  for (let i = 0; i < 300; i += 1) {
    moments.push({
      id: `m${i}`,
      url: `https://youtu.be/v${String(i % 150).padStart(10, '0')}`, // 150개 영상 × 2번
      date: i % 4 < 2 ? '2024-01-05' : '2024-01-12',
      keywords: [`무대:${i % 2 ? '인기가요' : '뮤직뱅크'}`, '노래:Super Shy'],
    });
  }
  findDuplicates(moments);
  findSameStage(moments); // 첫 계산은 모듈 적재·JIT 준비가 섞이므로 준비 1회 후에 잰다
  const started = performance.now();
  const duplicates = findDuplicates(moments);
  const duplicatesMs = performance.now() - started;
  const sameStarted = performance.now();
  const sameStage = findSameStage(moments);
  const sameMs = performance.now() - sameStarted;
  assert.equal(duplicates.length, 150, '같은 영상 묶음 150개');
  assert.equal(sameStage.length, 4, '같은 무대 묶음 4개(무대 2 × 날짜 2)');
  assert.ok(duplicatesMs <= 50, `findDuplicates 300개 ${duplicatesMs.toFixed(1)}ms ≤ 50ms`);
  assert.ok(sameMs <= 50, `findSameStage 300개 ${sameMs.toFixed(1)}ms ≤ 50ms`);
});
