import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// #822 1단계 북마크에서 가져오기: 판정·추출 계산은 함수를 직접 불러 표로 확인한다(docs/TESTING.md).
// 창 연결은 tests/v41-bookmark-import-flow.test.mjs가 createBookmarkImport를 가짜 DOM으로 직접 부른다.
// 시험 자료는 네 브라우저 형식의 가짜 북마크 파일(tests/fixtures/bookmarks)이다 — 실제 북마크는 쓰지 않는다.
import {
  BOOKMARK_SCAN_MAX, NO_FOLDER_LABEL, UNNAMED_FOLDER_LABEL, READ_NOT_BOOKMARK, READ_NO_VIDEO,
  isBookmarkFile, parseBookmarkHtml, classifyBookmarkUrl, cleanBookmarkTitle, bookmarkDate, folderLabel,
  collectBookmarkVideos, readBookmarkVideos, folderGroups, foundSummaryText,
  existingVideoTrees, defaultPicked, scopeState, pickScope, pickOne, createTitleQueue, pickedCountText,
  NEW_TREE_VALUE, importOrder, saveBlockText, momentInputFor, saveBookmarkVideos, waitForSync, progressText, savedSummaryText,
  SYNC_DONE, SYNC_PENDING, SYNC_FAILED, SAVE_FAILED_TEXT, BOOKMARK_IMPORT_MAX, limitNoteText, limitRefusedText,
} from '../public/v41/bookmark-import.mjs';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { createTree, addMoment, latestMomentId, validateState, MAX_MOMENTS, MAX_TREES } from '../public/v41/domain.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/bookmarks/${name}.html`, import.meta.url), 'utf8');
const NOW = new Date(2026, 10, 24, 12, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
// 기대 날짜는 시험 기기의 시간대에서 직접 계산한다(구현의 localDateOnly를 다시 부르지 않는다).
const localDate = (seconds) => { const d = new Date(seconds * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const TODAY = '2026-11-24';

const HEAD = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n';
const fileOf = (body) => `${HEAD}<DL><p>\n${body}\n</DL><p>\n`;
const anchor = (href, title = '가짜 영상', date = '1710471600') => `<DT><A HREF="${href}" ADD_DATE="${date}">${title}</A>`;

test('네 브라우저 형식에서 유튜브 영상만 고르고 폴더 이름·제목·날짜를 함께 꺼낸다', () => {
  const rows = [
    // [파일, 영상 id 순서, 폴더 이름 순서, 재생목록, 채널, 같은 영상, 전체 북마크]
    ['chrome', ['FAKEvid0001', 'FAKEvid0002', 'FAKEvid0003', 'FAKEvid0004'], ['북마크바', '북마크바 › 직캠 모음', '북마크바 › 직캠 모음', NO_FOLDER_LABEL], 1, 1, 1, 9],
    ['edge', ['FAKEvid0011', 'FAKEvid0012', 'FAKEvid0013', 'FAKEvid0014'], ['즐겨찾기 모음', '즐겨찾기 모음', '즐겨찾기 모음', '즐겨찾기 모음'], 0, 1, 1, 8],
    ['firefox', ['FAKEvid0101', 'FAKEvid0102', 'FAKEvid0103', 'FAKEvid0104'], [NO_FOLDER_LABEL, '북마크 도구 모음 › 무대', '북마크 도구 모음 › 무대', '기타 북마크'], 1, 1, 0, 7],
    ['safari', ['FAKEvid0201', 'FAKEvid0202', 'FAKEvid0203', 'FAKEvid0204'], ['즐겨찾기', '즐겨찾기 › 콘서트', NO_FOLDER_LABEL, '읽기 목록'], 0, 1, 1, 7],
  ];
  for (const [name, ids, folders, playlists, channels, duplicates, total] of rows) {
    const read = readBookmarkVideos(fixture(name), { now: NOW });
    assert.equal(read.ok, true, `${name}: 읽기 성공`);
    assert.deepEqual(read.videos.map((v) => v.videoId), ids, `${name}: 유튜브 영상만, 파일 순서대로, 같은 영상은 한 번`);
    assert.deepEqual(read.videos.map((v) => v.folder), folders, `${name}: 폴더 이름`);
    assert.equal(read.playlistCount, playlists, `${name}: 재생목록 개수`);
    assert.equal(read.channelCount, channels, `${name}: 채널 개수`);
    assert.equal(read.duplicateCount, duplicates, `${name}: 같은 영상 개수`);
    assert.equal(read.bookmarkCount, total, `${name}: 읽은 북마크 수`);
    assert.equal(read.truncated, false);
    assert.deepEqual(read.videos.map((v) => v.id), ['b0', 'b1', 'b2', 'b3'], `${name}: 항목 이름표는 차례대로`);
    for (const video of read.videos) assert.ok(!/youtube$/i.test(video.title) && video.title.length > 0, `${name}: 제목에서 ' - YouTube' 꼬리를 뗀다 (${video.title})`);
  }
});

test('순간 날짜는 북마크 추가 날짜를 쓰고, 없으면(사파리) 오늘이다', () => {
  const chrome = readBookmarkVideos(fixture('chrome'), { now: NOW });
  assert.deepEqual(chrome.videos.map((v) => [v.date, v.dated]), [1710471600, 1712545200, 1714532400, 1717210800].map((s) => [localDate(s), true]));
  const safari = readBookmarkVideos(fixture('safari'), { now: NOW });
  assert.deepEqual(safari.videos.map((v) => [v.date, v.dated]), Array(4).fill([TODAY, false]));
});

test('북마크 추가 날짜 → 순간 날짜 표', () => {
  const noon = Math.floor(new Date(2024, 2, 15, 12, 0, 0).getTime() / 1000);
  const rows = [
    [String(noon), '2024-03-15', true, '초'],
    [String(noon * 1000), '2024-03-15', true, '천분의 일 초로 적힌 값'],
    [String(noon * 1000000), '2024-03-15', true, '백만분의 일 초로 적힌 값'],
    ['', TODAY, false, '없음'],
    [undefined, TODAY, false, '없음(undefined)'],
    ['0', TODAY, false, '0'],
    ['1', TODAY, false, '유튜브가 생기기 전'],
    ['abc', TODAY, false, '숫자가 아님'],
    ['-5', TODAY, false, '음수'],
    [String(Math.floor(NOW.getTime() / 1000) + 3 * 86400), TODAY, false, '앞날'],
  ];
  for (const [input, date, dated, why] of rows) assert.deepEqual(bookmarkDate(input, NOW), { date, dated }, why);
});

test('주소 가르기 표: 영상(watch·youtu.be·shorts·live·embed)만 영상이고 재생목록·채널은 따로 센다', () => {
  const rows = [
    ['https://www.youtube.com/watch?v=FAKEvid0001', 'video', 'FAKEvid0001'],
    ['https://youtu.be/FAKEvid0002?t=42', 'video', 'FAKEvid0002'],
    ['https://www.youtube.com/shorts/FAKEvid0003', 'video', 'FAKEvid0003'],
    ['https://www.youtube.com/live/FAKEvid0014', 'video', 'FAKEvid0014'],
    ['https://www.youtube.com/embed/FAKEvid0104', 'video', 'FAKEvid0104'],
    ['https://m.youtube.com/watch?v=FAKEvid0012', 'video', 'FAKEvid0012'],
    ['https://music.youtube.com/watch?v=FAKEvid0011', 'video', 'FAKEvid0011'],
    ['http://www.youtube.com/watch?v=FAKEvid0013', 'video', 'FAKEvid0013'],
    ['https://www.youtube.com/watch?v=FAKEvid0004&list=PLfake01&index=2', 'video', 'FAKEvid0004'],
    ['https://www.youtube.com/playlist?list=PLfake01', 'playlist', ''],
    ['https://www.youtube.com/watch?list=PLfake01', 'playlist', ''],
    ['https://music.youtube.com/playlist?list=PLfake01', 'playlist', ''],
    ['https://www.youtube.com/@fakechannel', 'channel', ''],
    ['https://www.youtube.com/@fakechannel/videos', 'channel', ''],
    ['https://www.youtube.com/channel/UCfake000000000000000001', 'channel', ''],
    ['https://www.youtube.com/c/FakeChannelName', 'channel', ''],
    ['https://www.youtube.com/user/fakeuser', 'channel', ''],
    ['https://www.youtube.com/', 'other', ''],
    ['https://www.youtube.com/results?search_query=fake', 'other', ''],
    ['https://www.youtube.com/watch?v=short', 'other', ''],
    ['https://youtube.com.evil.example/watch?v=FAKEvid0001', 'other', ''],
    ['https://example.test/watch?v=FAKEvid0001', 'other', ''],
    ['https://user:pw@www.youtube.com/watch?v=FAKEvid0001', 'other', ''],
    ['https://i.ytimg.com/vi/FAKEvid0001/hqdefault.jpg', 'other', ''],
    ['place:sort=8&maxResults=10', 'other', ''],
    ['javascript:alert(1)', 'other', ''],
    ['', 'other', ''],
    [`https://www.youtube.com/watch?v=FAKEvid0001&x=${'a'.repeat(2100)}`, 'other', ''],
  ];
  for (const [href, kind, videoId] of rows) {
    const found = classifyBookmarkUrl(href);
    assert.equal(found.kind, kind, href.slice(0, 80));
    assert.equal(found.videoId, videoId, href.slice(0, 80));
  }
});

test('북마크 제목 손질 표', () => {
  const rows = [
    ['(3) 봄 무대 직캠 4K - YouTube', '봄 무대 직캠 4K'],
    ['(99+) 봄 무대 - YouTube', '봄 무대'],
    ['첫 음반 타이틀곡 - YouTube Music', '첫 음반 타이틀곡'],
    ['여름 축제 – YouTube', '여름 축제'],
    ['  줄바꿈\n 섞인   제목 - YouTube ', '줄바꿈 섞인 제목'],
    ['(2024) 연말 무대', '(2024) 연말 무대'],
    ['(3) 내가 붙인 이름', '(3) 내가 붙인 이름'],
    ['내가 붙인 이름', '내가 붙인 이름'],
    ['YouTube', ''],
    ['https://www.youtube.com/watch?v=FAKEvid0001', ''],
    ['', ''],
    [undefined, ''],
  ];
  for (const [raw, want] of rows) assert.equal(cleanBookmarkTitle(raw), want, String(raw));
});

test('같은 영상은 주소 모양이 달라도 한 번만, 구간이 다르면 다른 장면으로 남긴다(#876 규칙)', () => {
  const text = fileOf([
    anchor('https://www.youtube.com/watch?v=FAKEvid0001', '첫 북마크'),
    anchor('https://youtu.be/FAKEvid0001', '짧은 주소'),
    anchor('https://www.youtube.com/shorts/FAKEvid0001', '쇼츠 주소'),
    anchor('https://www.youtube.com/watch?v=FAKEvid0001&t=90', '90초부터'),
    anchor('https://youtu.be/FAKEvid0001?t=90', '90초부터 짧은 주소'),
  ].join('\n'));
  const read = readBookmarkVideos(text, { now: NOW });
  assert.deepEqual(read.videos.map((v) => v.title), ['첫 북마크', '90초부터']);
  assert.equal(read.duplicateCount, 3);
});

test('북마크 파일이 아니면 읽지 않고, 영상이 없으면 까닭과 개수를 돌려준다', () => {
  const page = '<!doctype html><html><body><a href="https://www.youtube.com/watch?v=FAKEvid0001">영상</a></body></html>';
  assert.equal(isBookmarkFile(page), false);
  const refused = readBookmarkVideos(page, { now: NOW });
  assert.deepEqual([refused.ok, refused.reason, refused.videos.length], [false, READ_NOT_BOOKMARK, 0]);
  for (const blank of ['', null, undefined, '{"roots":{}}']) assert.equal(readBookmarkVideos(blank).reason, READ_NOT_BOOKMARK);
  const none = readBookmarkVideos(fileOf([anchor('https://example.test/'), anchor('https://www.youtube.com/playlist?list=PLfake01'), anchor('https://www.youtube.com/@fake')].join('\n')), { now: NOW });
  assert.deepEqual([none.ok, none.reason, none.playlistCount, none.channelCount, none.bookmarkCount], [false, READ_NO_VIDEO, 1, 1, 3]);
  assert.equal(isBookmarkFile(`﻿\n\t${HEAD}`), true, '앞에 빈칸·표식이 있어도 북마크 파일이다');
  assert.equal(isBookmarkFile('<!doctype netscape-bookmark-file-1>'), true, '대소문자를 가리지 않는다');
});

test('어긋난 구조도 멈추지 않고 읽는다: 닫히지 않은 꼬리표·속성 안의 >·글자 표기·이름 없는 폴더', () => {
  const text = `${HEAD}<DL><p>
    <DT><H3 ADD_DATE="1">가수 &amp; 무대 &#44032;&#x1F600;</H3>
    <DL><p>
      <DT><A HREF="https://www.youtube.com/watch?v=FAKEvid0301&amp;t=5" ICON="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>" ADD_DATE="1710471600">꺾쇠 &lt;b&gt; <b>굵게</b> &quot;따옴표&quot;</A>
      <DT><A HREF='https://youtu.be/FAKEvid0302' ADD_DATE=1710471601>따옴표 없는 속성
      <DT><A HREF="https://youtu.be/FAKEvid0303">닫히지 않고 폴더가 닫힘
    </DL><p>
    <DT><H3></H3>
    <DL><p>
      <DT><A HREF="https://youtu.be/FAKEvid0304">이름 없는 폴더 안</A>
    </DL><p>
    <DT><H3>목록 없이 끝난 폴더</H3>
    <DT><A HREF="https://youtu.be/FAKEvid0305">그다음 북마크</A>
    </DL></DL></DL>
    <DT><A HREF="https://youtu.be/FAKEvid0306">남는 닫기 뒤</A>`;
  const read = readBookmarkVideos(text, { now: NOW });
  assert.deepEqual(read.videos.map((v) => [v.videoId, v.title, v.folder]), [
    ['FAKEvid0301', '꺾쇠 <b> 굵게 "따옴표"', '가수 & 무대 가😀'],
    ['FAKEvid0302', '따옴표 없는 속성', '가수 & 무대 가😀'],
    ['FAKEvid0303', '닫히지 않고 폴더가 닫힘', '가수 & 무대 가😀'],
    ['FAKEvid0304', '이름 없는 폴더 안', UNNAMED_FOLDER_LABEL],
    ['FAKEvid0305', '그다음 북마크', NO_FOLDER_LABEL],
    ['FAKEvid0306', '남는 닫기 뒤', NO_FOLDER_LABEL],
  ]);
  assert.equal(read.videos[0].url, 'https://www.youtube.com/watch?v=FAKEvid0301&t=5', '주소의 &amp;는 &로 읽는다');
  assert.equal(read.videos[1].dated, true, '따옴표 없는 ADD_DATE도 읽는다');
});

test('폴더는 깊이 들어가도 바깥부터 차례로 잇고, 폴더별 묶음은 처음 나온 순서를 지킨다', () => {
  const nested = (depth, inner) => depth ? `<DT><H3>단계${depth}</H3>\n<DL><p>\n${nested(depth - 1, inner)}\n</DL><p>` : inner;
  const text = fileOf([
    anchor('https://youtu.be/FAKEvid0401', '바깥 하나'),
    nested(3, anchor('https://youtu.be/FAKEvid0402', '깊은 곳')),
    anchor('https://youtu.be/FAKEvid0403', '바깥 둘'),
    `<DT><H3>단계3</H3>\n<DL><p>\n${anchor('https://youtu.be/FAKEvid0404', '같은 이름의 다른 폴더')}\n</DL><p>`,
  ].join('\n'));
  const read = readBookmarkVideos(text, { now: NOW });
  assert.deepEqual(read.videos.map((v) => v.folderPath), [[], ['단계3', '단계2', '단계1'], [], ['단계3']]);
  const groups = folderGroups(read.videos);
  assert.deepEqual(groups.map((g) => [g.label, g.videos.map((v) => v.videoId)]), [
    [NO_FOLDER_LABEL, ['FAKEvid0401', 'FAKEvid0403']],
    ['단계3 › 단계2 › 단계1', ['FAKEvid0402']],
    ['단계3', ['FAKEvid0404']],
  ]);
  assert.equal(folderLabel([]), NO_FOLDER_LABEL);
  assert.equal(folderLabel(['가', '', '나']), '가 › 나');
});

test('북마크가 아주 많으면 상한까지만 읽고 알린다', () => {
  const many = Array.from({ length: BOOKMARK_SCAN_MAX + 5 }, (_, i) => `<DT><A HREF="https://example.test/${i}">글 ${i}</A>`);
  many[10] = anchor('https://youtu.be/FAKEvid0501', '앞쪽 영상');
  many[BOOKMARK_SCAN_MAX + 2] = anchor('https://youtu.be/FAKEvid0502', '상한 뒤 영상');
  const parsed = parseBookmarkHtml(fileOf(many.join('\n')));
  assert.equal(parsed.entries.length, BOOKMARK_SCAN_MAX);
  assert.equal(parsed.truncated, true);
  const read = readBookmarkVideos(fileOf(many.join('\n')), { now: NOW });
  assert.deepEqual([read.ok, read.truncated, read.videos.map((v) => v.videoId)], [true, true, ['FAKEvid0501']]);
});

test('찾은 것 요약 문구: 개수만 말하고, 없는 항목은 말하지 않는다', () => {
  const videos = (n) => Array.from({ length: n }, () => ({}));
  const rows = [
    [{ videos: videos(4) }, '유튜브 영상 4개를 찾았어요.'],
    [{ videos: videos(4), playlistCount: 2 }, '유튜브 영상 4개를 찾았어요. 재생목록 2개는 이번에는 담지 않아요.'],
    [{ videos: videos(4), channelCount: 5 }, '유튜브 영상 4개를 찾았어요. 채널 5개는 이번에는 담지 않아요.'],
    [{ videos: videos(37), playlistCount: 2, channelCount: 5, duplicateCount: 3 }, '유튜브 영상 37개를 찾았어요. 재생목록 2개·채널 5개는 이번에는 담지 않아요. 같은 영상 3개는 하나로 모았어요.'],
  ];
  for (const [input, want] of rows) assert.equal(foundSummaryText(input), want);
});

test('유튜브가 아닌 북마크의 주소·제목은 결과에 남지 않는다', () => {
  const read = readBookmarkVideos(fixture('chrome'), { now: NOW });
  const dump = JSON.stringify(read);
  for (const secret of ['example.test', '가짜 소식', '가짜 채널', '무대 모음', 'PLfake']) {
    if (secret === 'PLfake') { assert.equal(read.videos.filter((v) => v.url.includes(secret)).length, 1, '재생목록 안의 영상 주소는 영상으로 남는다'); continue; }
    assert.ok(!dump.includes(secret), `${secret} 은(는) 결과에 없어야 한다`);
  }
  assert.equal(collectBookmarkVideos(null).videos.length, 0);
});

// ---- 3단계: 미리보기 목록의 계산 ----
const video = (n, extra = {}) => ({ id: `b${n}`, videoId: `FAKEvid${String(n).padStart(4, '0')}`, url: `https://www.youtube.com/watch?v=FAKEvid${String(n).padStart(4, '0')}`, ...extra });

test('이미 담은 영상은 어느 트리에 있든 찾고(주소 모양이 달라도), 구간이 다른 같은 영상은 새 장면으로 둔다', () => {
  const trees = [
    { id: 't1', title: '첫 트리', moments: [{ id: 'm1', url: 'https://youtu.be/FAKEvid0001' }, { id: 'm2', url: '' }, { id: 'm3', url: 'https://example.test/' }] },
    { id: 't2', subject: '둘째 트리', moments: [{ id: 'm4', url: 'https://www.youtube.com/watch?v=FAKEvid0002&t=30' }, { id: 'm5', url: 'https://www.youtube.com/shorts/FAKEvid0003', startSeconds: 10, endSeconds: 20 }] },
  ];
  const videos = [
    video(1),                                                                 // 첫 트리에 짧은 주소로 있음
    video(2),                                                                 // 둘째 트리에는 30초부터 — 다른 장면
    video(2, { id: 'b2t', url: 'https://youtu.be/FAKEvid0002?t=30' }),         // 같은 30초 장면 → 이미 있음
    video(3),                                                                 // 둘째 트리에는 구간(10~20)으로 — 다른 장면
    video(4),                                                                 // 어디에도 없음
  ];
  const found = existingVideoTrees(videos, trees);
  assert.deepEqual([...found], [['b1', '첫 트리'], ['b2t', '둘째 트리']]);
  assert.deepEqual([...existingVideoTrees(videos, trees, (tree) => `<${tree.id}>`)], [['b1', '<t1>'], ['b2t', '<t2>']], '트리 이름 규칙은 화면이 넘긴다');
  assert.equal(existingVideoTrees(videos, null).size, 0);
  assert.equal(existingVideoTrees(null, trees).size, 0);
});

test('처음 고름은 이미 담은 영상을 빼고 파일 순서대로, 상한까지만', () => {
  const videos = [video(1), video(2), video(3), video(4), video(5)];
  const existing = new Map([['b2', '트리']]);
  assert.deepEqual(defaultPicked(videos, existing), ['b1', 'b3', 'b4', 'b5']);
  assert.deepEqual(defaultPicked(videos, existing, 2), ['b1', 'b3']);
  assert.deepEqual(defaultPicked(videos, new Map(videos.map((v) => [v.id, '트리']))), []);
  assert.deepEqual(defaultPicked(null, existing), []);
});

test('묶음 고르기 칸의 모양 표(전체·폴더 공통)', () => {
  const videos = [video(1), video(2), video(3)];
  const existing = new Map([['b3', '트리']]);
  const rows = [
    [[], { total: 2, on: 0, checked: false, mixed: false, empty: false }, '아무것도 안 고름'],
    [['b1'], { total: 2, on: 1, checked: false, mixed: true, empty: false }, '일부'],
    [['b1', 'b2'], { total: 2, on: 2, checked: true, mixed: false, empty: false }, '새 영상 모두'],
    [['b1', 'b2', 'b3'], { total: 2, on: 2, checked: true, mixed: false, empty: false }, '이미 있음까지 손으로 고름'],
    [['b3'], { total: 2, on: 0, checked: false, mixed: true, empty: false }, '이미 있음만 손으로 고름'],
  ];
  for (const [picked, want, why] of rows) assert.deepEqual(scopeState(videos, existing, new Set(picked)), want, why);
  assert.deepEqual(scopeState([video(3)], existing, new Set()), { total: 0, on: 0, checked: false, mixed: false, empty: true }, '새 영상이 없는 폴더');
});

test('묶음 고르기·하나 고르기 표: 켜면 새 영상만, 끄면 그 묶음을 모두 풀고, 상한이 차면 더 고르지 않는다', () => {
  const videos = [video(1), video(2), video(3), video(4)];
  const existing = new Map([['b2', '트리']]);
  const scope = (picked, on, max) => { const out = pickScope(videos, existing, new Set(picked), on, max); return [[...out.picked], out.clipped]; };
  assert.deepEqual(scope([], true), [['b1', 'b3', 'b4'], 0], '켜기: 이미 있음은 고르지 않는다');
  assert.deepEqual(scope(['b2'], true), [['b2', 'b1', 'b3', 'b4'], 0], '손으로 고른 이미 있음은 그대로 둔다');
  assert.deepEqual(scope(['b1', 'b2', 'b9'], false), [['b9'], 0], '끄기: 이 묶음 것만 모두 푼다(다른 묶음 것은 그대로)');
  assert.deepEqual(scope(['b9'], true, 2), [['b9', 'b1'], 2], '상한 2: 하나만 더 고르고 둘은 못 고른다');
  assert.deepEqual(scope(['b8', 'b9'], true, 2), [['b8', 'b9'], 3], '상한이 이미 찼으면 하나도 못 고른다');
  const one = (picked, id, on, max) => { const out = pickOne(new Set(picked), id, on, max); return [[...out.picked], out.refused]; };
  assert.deepEqual(one([], 'b1', true), [['b1'], false]);
  assert.deepEqual(one(['b1'], 'b1', true), [['b1'], false], '이미 고른 것');
  assert.deepEqual(one(['b1'], 'b1', false), [[], false]);
  assert.deepEqual(one(['b1', 'b2'], 'b3', true, 2), [['b1', 'b2'], true], '상한이 차면 거절');
  assert.deepEqual(one(['b1', 'b2'], 'b2', false, 2), [['b1'], false], '풀기는 언제나 된다');
  assert.equal(pickedCountText(0), '고른 영상이 없어요');
  assert.equal(pickedCountText(12), '12개 고름');
});

test('제목 줄: 한 번에 하나씩 차례로, 상한까지만 부르고, 받은 것은 다시 부르지 않는다', async () => {
  const calls = [];
  let active = 0, peak = 0;
  const gaps = [];
  const got = [];
  const queue = createTitleQueue({
    limit: 4,
    gapMs: 30,
    wait: async (ms) => { gaps.push(ms); },
    fetchTitle: async (id) => {
      calls.push(id);
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (id === 'bad') throw new Error('조회 실패');
      if (id === 'empty') return '';
      return ` 제목 ${id} `;
    },
    onTitle: (id, title) => got.push([id, title]),
  });
  const first = queue.add(['a', 'bad', 'a', '', null]);
  void queue.add(['empty', 'b', 'c']); // 달리는 중에 더 세워도 줄은 하나다
  await first;
  assert.equal(peak, 1, '동시에 하나만 부른다');
  assert.deepEqual(calls, ['a', 'bad', 'empty', 'b'], '세운 순서대로, 같은 것은 한 번, 상한 4번까지만');
  assert.deepEqual(got, [['a', '제목 a'], ['bad', ''], ['empty', ''], ['b', '제목 b']]);
  assert.deepEqual(gaps, [30, 30, 30], '사이마다 쉰다(상한에 닿은 뒤에는 쉬지 않는다)');
  assert.deepEqual([queue.title('a'), queue.title('bad'), queue.has('bad'), queue.has('c'), queue.asked(), queue.idle()], ['제목 a', '', true, false, 4, true]);
  await queue.add(['a', 'bad', 'c']);
  assert.equal(calls.length, 4, '상한 뒤에는 더 부르지 않고, 받은 것(실패 포함)은 다시 부르지 않는다');
  queue.remember('c', ' 저장 때 받은 제목 ');
  assert.equal(queue.title('c'), '저장 때 받은 제목');
});

test('제목 줄 멈추기: 줄을 비우고 지금 받던 하나만 끝낸다. 다시 세우면 이어서 받는다', async () => {
  const calls = [];
  let release = null;
  const queue = createTitleQueue({ fetchTitle: (id) => { calls.push(id); return new Promise((resolve) => { release = () => resolve(`제목 ${id}`); }); } });
  const running = queue.add(['a', 'b', 'c']);
  assert.deepEqual([calls, queue.waiting()], [['a'], 2]);
  queue.stop();
  release();
  await running;
  assert.deepEqual([calls, queue.title('a'), queue.waiting(), queue.idle()], [['a'], '제목 a', 0, true]);
  const again = queue.add(['b']);
  release();
  await again;
  assert.deepEqual(calls, ['a', 'b']);
});

// ---- 4단계: 담을 트리 고르기와 한 번에 저장 ----
// 저장은 실제 저장 세션(createMemberSession)에 가짜 서버만 붙여 확인한다 — 기존 저장 경로(member.apply → PUT) 그대로다.
const CLOCK = '2026-11-01T00:00:00.000Z';
function seedTree(count, subject = '첫 트리') {
  let tree = createTree({ subject, title: '시작 순간', note: '', date: '2026-11-01', url: '' }, CLOCK);
  for (let i = 1; i < count; i += 1) tree = addMoment(tree, { title: `순간 ${i}`, note: '', date: '2026-11-02', url: '' }, tree.moments[0].id, CLOCK);
  return tree;
}
async function startSession(trees) {
  const writes = [];
  const session = createMemberSession({
    api: {
      get: async () => ({ ok: true, status: 200, revision: 1, subject: 'trial-subject', writeSubjectBound: true, state: { version: 1, trees } }),
      put: async (body) => { writes.push(body); return { ok: true, status: 200, revision: writes.length + 1 }; },
      logout: async () => ({ ok: true, status: 200 }),
    },
    delay: () => Promise.resolve(),
    draftStorage: null,
    cacheStorage: null,
  });
  await session.start();
  return { session, writes };
}
const picked = (rows) => rows.map(([n, date, title]) => video(n, { date, dated: true, title: title ?? `북마크 제목 ${n}` }));

test('담는 순서는 북마크한 날이 이른 것부터, 같은 날은 파일 순서', () => {
  const videos = picked([[1, '2024-05-01'], [2, '2024-03-15'], [3, '2024-05-01'], [4, '2023-12-31'], [5, '2024-03-15']]);
  assert.deepEqual(importOrder(videos).map((v) => v.id), ['b4', 'b2', 'b5', 'b1', 'b3']);
  assert.deepEqual(importOrder(null), []);
});

test('담기 전 판정 표: 고른 것·새 트리 이름·트리 수·트리에 남은 자리', () => {
  const full = { id: 'full', moments: Array(MAX_MOMENTS).fill({}) };
  const near = { id: 'near', moments: Array(MAX_MOMENTS - 2).fill({}) };
  const roomy = { id: 'roomy', moments: Array(5).fill({}) };
  const trees = [full, near, roomy];
  const rows = [
    [{ count: 0, target: 'roomy', trees }, '담을 영상을 골라 주세요.'],
    [{ count: 3, target: 'roomy', trees }, ''],
    [{ count: 2, target: 'near', trees }, ''],
    [{ count: 3, target: 'near', trees }, `이 트리에는 2개만 더 담을 수 있어요(한 트리에 ${MAX_MOMENTS}개까지). 고른 영상을 줄이거나 다른 트리를 골라 주세요.`],
    [{ count: 1, target: 'full', trees }, `이 트리는 가득 찼어요(한 트리에 ${MAX_MOMENTS}개까지). 다른 트리를 골라 주세요.`],
    [{ count: 1, target: 'gone', trees }, '담을 트리를 골라 주세요.'],
    [{ count: 1, target: NEW_TREE_VALUE, trees, newName: '' }, '새 트리 이름을 적어 주세요.'],
    [{ count: 1, target: NEW_TREE_VALUE, trees, newName: '   ' }, '새 트리 이름을 적어 주세요.'],
    [{ count: 1, target: NEW_TREE_VALUE, trees, newName: '가'.repeat(61) }, '트리 이름은 60자까지 적을 수 있어요.'],
    [{ count: 1, target: NEW_TREE_VALUE, trees, newName: '가'.repeat(60) }, ''],
    [{ count: 1, target: NEW_TREE_VALUE, trees: Array(MAX_TREES).fill(roomy), newName: '새 트리' }, `트리는 ${MAX_TREES}개까지 만들 수 있어요.`],
    [{ count: 200, target: NEW_TREE_VALUE, trees: [], newName: '새 트리' }, ''],
  ];
  for (const [input, want] of rows) assert.equal(saveBlockText(input), want, JSON.stringify({ ...input, trees: undefined }));
});

test('순간 저장 입력: 받은 영상 제목 → 북마크 제목(80자) → 주소만', () => {
  const base = video(1, { date: '2024-03-15', title: '북마크 제목' });
  assert.deepEqual(momentInputFor(base, ' 영상 제목 '), { url: base.url, date: '2024-03-15', mediaMetadata: { title: '영상 제목' } }, '쉬운 추가와 같은 모양');
  assert.deepEqual(momentInputFor(base, ''), { url: base.url, date: '2024-03-15', title: '북마크 제목' });
  const long = momentInputFor({ ...base, title: '가'.repeat(200) }, '');
  assert.equal(long.title.length, 80, '도메인의 80자 규칙 그대로');
  assert.ok(long.title.endsWith('…'));
  assert.deepEqual(momentInputFor({ ...base, title: '' }, ''), { url: base.url, date: '2024-03-15' }, '제목이 없으면 기존 자동 제목 규칙에 맡긴다');
});

test('이미 있는 트리에 담기: 순간 수가 고른 만큼 늘고, 날짜는 북마크한 날, 가장 최근 순간 다음에 날짜순으로 이어진다', async () => {
  const tree = seedTree(3);
  const anchor = latestMomentId(tree);
  const { session, writes } = await startSession([tree]);
  const videos = picked([[1, '2024-05-01'], [2, '2024-03-15'], [3, '2024-04-08', '']]);
  const progress = [];
  const outcome = await saveBookmarkVideos({
    videos,
    target: { treeId: tree.id, afterMomentId: anchor },
    apply: (...args) => session.apply(...args),
    titleFor: async (v) => (v.id === 'b1' ? '받은 영상 제목' : ''),
    onProgress: (p) => progress.push([p.done, p.total, p.video?.id || null]),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const grown = session.state().trees.find((t) => t.id === tree.id);
  assert.equal(grown.moments.length, 6, '3개 + 고른 3개');
  assert.deepEqual([outcome.treeId, outcome.saved.length, outcome.failed.length], [tree.id, 3, 0]);
  const added = grown.moments.slice(3);
  assert.deepEqual(added.map((m) => [m.date, m.url, m.title]), [
    ['2024-03-15', videos[1].url, '북마크 제목 2'],
    ['2024-04-08', videos[2].url, 'youtube.com에서 간직한 순간'],
    ['2024-05-01', videos[0].url, '받은 영상 제목'],
  ], '날짜순, 제목은 받은 영상 제목 → 북마크 제목 → 자동 제목');
  assert.deepEqual(added.map((m) => m.parentId), [anchor, added[0].id, added[1].id], '앞 순간 다음에 한 줄로 잇는다');
  assert.equal(added[2].mediaMetadata?.title, '받은 영상 제목', '받은 제목은 쉬운 추가처럼 영상 정보로 남는다');
  assert.equal(added[0].mediaMetadata, undefined, '북마크 제목은 순간 제목으로만 쓴다');
  assert.deepEqual(outcome.saved.map((item) => item.momentId), added.map((m) => m.id));
  assert.equal(outcome.lastMomentId, added[2].id);
  assert.deepEqual(progress, [[0, 3, 'b2'], [1, 3, 'b3'], [2, 3, 'b1'], [3, 3, null]], '하나 담기 전마다, 그리고 끝에 한 번');
  // 기존 저장 경로로 서버에 간다: 마지막 PUT의 그 트리 순간 수가 같다.
  assert.equal(writes.at(-1)?.state?.trees.find((t) => t.id === tree.id)?.moments.length, 6, '저장 뒤 트리 순간 수');
  assert.doesNotThrow(() => validateState(session.state()));
  session.dispose();
});

test('새 트리에 담기: 가장 이른 영상으로 트리를 만들고 나머지를 잇는다', async () => {
  const { session, writes } = await startSession([seedTree(2)]);
  const videos = picked([[1, '2024-05-01'], [2, '2024-03-15'], [3, '2024-04-08']]);
  const outcome = await saveBookmarkVideos({ videos, target: { newName: '  가짜 직캠 모음  ' }, apply: (...args) => session.apply(...args) });
  await new Promise((resolve) => setImmediate(resolve));
  const state = session.state();
  assert.equal(state.trees.length, 2);
  const made = state.trees.find((t) => t.id === outcome.treeId);
  assert.deepEqual([made.subject, made.title, made.inbox, made.moments.length], ['가짜 직캠 모음', '가짜 직캠 모음', false, 3]);
  assert.deepEqual(made.moments.map((m) => [m.date, m.parentId === null ? 'root' : m.parentId]), [['2024-03-15', 'root'], ['2024-04-08', made.moments[0].id], ['2024-05-01', made.moments[1].id]]);
  assert.equal(state.trees[0].moments.length, 2, '다른 트리는 그대로');
  assert.equal(writes.at(-1)?.state?.trees.find((t) => t.id === made.id)?.moments.length, 3, '저장 뒤 새 트리 순간 수');
  session.dispose();
});

test('담지 못한 것은 멈추지 않고 실패 목록에 까닭과 함께 적는다(한 트리 한도)', async () => {
  const tree = seedTree(MAX_MOMENTS - 1);
  const { session } = await startSession([tree]);
  const videos = picked([[1, '2024-03-15'], [2, '2024-04-08'], [3, '2024-05-01']]);
  const outcome = await saveBookmarkVideos({ videos, target: { treeId: tree.id, afterMomentId: latestMomentId(tree) }, apply: (...args) => session.apply(...args) });
  assert.deepEqual(outcome.saved.map((item) => item.video.id), ['b1']);
  assert.deepEqual(outcome.failed.map((item) => [item.video.id, item.reason]), [['b2', `한 트리에는 ${MAX_MOMENTS}개의 순간까지 담을 수 있어요.`], ['b3', `한 트리에는 ${MAX_MOMENTS}개의 순간까지 담을 수 있어요.`]]);
  assert.equal(session.state().trees[0].moments.length, MAX_MOMENTS);
  session.dispose();
  // 까닭 없는 실패·제목 조회 실패도 담기를 멈추지 않는다.
  let calls = 0;
  const odd = await saveBookmarkVideos({
    videos,
    target: { treeId: 't', afterMomentId: 'm' },
    apply: () => { calls += 1; if (calls === 2) throw {}; return { treeId: 't', momentId: `m${calls}` }; },
    titleFor: async () => { throw new Error('조회 실패'); },
  });
  assert.deepEqual([odd.saved.length, odd.failed.map((item) => item.reason)], [2, [SAVE_FAILED_TEXT]]);
});

test('새 트리 만들기가 실패하면 다음 영상으로 다시 만들어 본다', async () => {
  const videos = picked([[1, '2024-03-15'], [2, '2024-04-08'], [3, '2024-05-01']]);
  const calls = [];
  const outcome = await saveBookmarkVideos({
    videos,
    target: { newName: '새 트리' },
    apply: (action, input, selection, hint) => {
      calls.push([action, selection?.treeId || '', selection?.momentId || '', hint ? Object.keys(hint).filter((key) => hint[key]).join('+') : '']);
      if (calls.length === 1) throw new Error('만들지 못했어요');
      return { treeId: 'made', momentId: `m${calls.length}` };
    },
  });
  // 새 트리는 화면을 그 트리로 다시 띄우는 기존 길 그대로, 그 뒤 더하기는 모델만 고친다(열린 화면을 순간마다 다시 그리지 않는다).
  assert.deepEqual(calls, [['new', '', '', ''], ['new', '', '', ''], ['add', 'made', 'm2', 'moment+story']]);
  assert.deepEqual([outcome.treeId, outcome.saved.length, outcome.failed.map((item) => item.reason)], ['made', 2, ['만들지 못했어요']]);
});

test('서버 저장 기다림 표: 저장됨·실패·기다림 상한', async () => {
  const run = async (snaps, options = {}) => {
    let i = 0, waits = 0;
    const result = await waitForSync(() => snaps[Math.min(i++, snaps.length - 1)], { timeoutMs: 1000, pollMs: 250, wait: async () => { waits += 1; }, ...options });
    return [result, waits];
  };
  assert.deepEqual(await run([{ dirty: false, phase: 'synced' }]), [SYNC_DONE, 0]);
  assert.deepEqual(await run([{ dirty: true, phase: 'syncing' }, { dirty: true, phase: 'syncing' }, { dirty: false, phase: 'synced' }]), [SYNC_DONE, 2]);
  for (const phase of ['offline', 'rejected', 'conflict', 'login']) assert.deepEqual(await run([{ dirty: true, phase: 'syncing' }, { dirty: true, phase }]), [SYNC_FAILED, 1], phase);
  assert.deepEqual(await run([{ dirty: true, phase: 'syncing' }]), [SYNC_PENDING, 4], '상한(1초)까지 네 번 기다리고 멈춘다');
  assert.deepEqual(await run([null]), [SYNC_PENDING, 4], '상태를 못 읽어도 끝없이 돌지 않는다');
  assert.deepEqual(await waitForSync(() => { throw new Error('읽기 실패'); }, { timeoutMs: 0, wait: async () => {} }), SYNC_PENDING);
});

test('진행 표시와 마친 뒤 한 줄 문구', () => {
  assert.equal(progressText(0, 37), '0 / 37');
  assert.equal(progressText(12, 37), '12 / 37');
  assert.equal(progressText(40, 37), '37 / 37');
  assert.equal(savedSummaryText({ saved: 34, treeName: '가짜 직캠 모음' }), '✓ 34개를 ‘가짜 직캠 모음’에 담았어요');
  assert.equal(savedSummaryText({ saved: 2 }), '✓ 2개를 담았어요');
  assert.equal(savedSummaryText({ saved: 0, treeName: '트리' }), '담지 못했어요.');
});

// ---- 5단계: 한 번에 200개 상한 ----

test('한 번에 담는 상한은 200개다: 넘으면 앞에서부터 200개만 골라 두고, 나눠 담으라고 알린다', () => {
  assert.equal(BOOKMARK_IMPORT_MAX, 200);
  const many = Array.from({ length: 230 }, (_, i) => video(i + 1));
  const existing = new Map([['b3', '트리'], ['b150', '트리']]);
  const first = defaultPicked(many, existing, BOOKMARK_IMPORT_MAX);
  assert.equal(first.length, 200);
  assert.deepEqual([first[0], first[2], first.at(-1)], ['b1', 'b4', 'b202'], '이미 있음(b3·b150)을 건너뛰고 파일 순서대로 200개');
  // 전체 고르기를 눌러도 200개에서 멈추고, 못 고른 수를 알려 준다.
  const all = pickScope(many, existing, new Set(), true, BOOKMARK_IMPORT_MAX);
  assert.deepEqual([all.picked.size, all.clipped], [200, 28]);
  assert.deepEqual(pickOne(all.picked, 'b230', true, BOOKMARK_IMPORT_MAX).refused, true);
  // 안내 문구.
  assert.equal(limitNoteText(200), '');
  assert.equal(limitNoteText(37), '');
  assert.equal(limitNoteText(228), '새 영상이 228개예요. 한 번에 200개까지 담을 수 있어서 먼저 200개를 골라 두었어요. 담고 나면 남은 영상을 이어서 고를 수 있어요.');
  assert.equal(limitRefusedText(), '한 번에 200개까지 담을 수 있어요. 지금 고른 것을 먼저 담고, 남은 영상은 이어서 담아 주세요.');
  assert.equal(pickedCountText(200, BOOKMARK_IMPORT_MAX), '200개 고름 · 한 번에 200개까지');
  assert.equal(pickedCountText(199, BOOKMARK_IMPORT_MAX), '199개 고름');
  assert.equal(pickedCountText(0, BOOKMARK_IMPORT_MAX), '고른 영상이 없어요');
  // 상한을 넘는 수는 담기 전 판정에서도 막는다.
  assert.equal(saveBlockText({ count: 201, target: NEW_TREE_VALUE, trees: [], newName: '새 트리' }), limitRefusedText());
  assert.equal(saveBlockText({ count: 200, target: NEW_TREE_VALUE, trees: [], newName: '새 트리' }), '');
  assert.equal(saveBlockText({ count: 4, target: NEW_TREE_VALUE, trees: [], newName: '새 트리', max: 3 }), limitRefusedText(3));
});
