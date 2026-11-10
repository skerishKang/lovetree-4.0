import test from 'node:test';
import assert from 'node:assert/strict';
import { TITLE_DISPLAYS, normalizeTitleDisplay, userTitleText, titleView, formatDisplayDate } from '../public/v41/book-usability.mjs';

// #347 후속: 제목 보기 표(3설정 × 내 제목 있음/없음/자동 × 영상 제목 있음/없음)와 날짜 표기 한 벌.
const moment = (title, video) => ({ title, mediaMetadata: video ? { title: video } : null });
const AUTO = 'www.youtube.com에서 간직한 순간';

const TABLE = [
  { mine: '내 제목', video: '영상 제목', main: { both: '내 제목', mine: '내 제목', video: '영상 제목' }, sub: { both: '영상 제목', mine: '', video: '' } },
  { mine: '내 제목', video: '', main: { both: '내 제목', mine: '내 제목', video: '내 제목' }, sub: { both: '', mine: '', video: '' } },
  { mine: '', video: '영상 제목', main: { both: '영상 제목', mine: '영상 제목', video: '영상 제목' }, sub: { both: '', mine: '', video: '' } },
  { mine: '', video: '', main: { both: '', mine: '', video: '' }, sub: { both: '', mine: '', video: '' } },
  { mine: AUTO, video: '영상 제목', main: { both: '영상 제목', mine: '영상 제목', video: '영상 제목' }, sub: { both: '', mine: '', video: '' }, auto: true },
  { mine: AUTO, video: '', main: { both: '', mine: '', video: '' }, sub: { both: '', mine: '', video: '' }, auto: true },
  { mine: '영상 제목', video: '영상 제목', main: { both: '영상 제목', mine: '영상 제목', video: '영상 제목' }, sub: { both: '', mine: '', video: '' }, auto: true }
];

test('0. 제목 보기 설정 값: both·mine·video만, 모르는 값은 both', () => {
  assert.deepEqual(TITLE_DISPLAYS, ['both', 'mine', 'video']);
  for (const value of ['both', 'mine', 'video']) assert.equal(normalizeTitleDisplay(value), value);
  for (const value of ['', 'BOTH', 'all', '내 제목', null, undefined, 0]) assert.equal(normalizeTitleDisplay(value), 'both');
});

test('1. 표시 규칙 표: 설정 3 × 내 제목 있음/없음/자동 × 영상 제목 있음/없음', () => {
  for (const row of TABLE) {
    const m = moment(row.mine, row.video);
    for (const setting of TITLE_DISPLAYS) {
      const view = titleView(m, setting);
      assert.equal(view.main, row.main[setting], `${JSON.stringify(row)} ${setting} main`);
      assert.equal(view.sub, row.sub[setting], `${JSON.stringify(row)} ${setting} sub`);
      assert.equal(view.setting, setting);
    }
    if (row.auto) assert.equal(userTitleText(m), '', '자동 제목은 내 제목이 아니다');
  }
});

test('2. 강도 증명: 설정을 바꾸면 답이 달라지고, 자동 제목을 내 제목으로 쓰면 잡힌다', () => {
  const both = moment('내 제목', '영상 제목');
  assert.notEqual(titleView(both, 'mine').main, titleView(both, 'video').main, '내/영상 전환이 보인다');
  assert.notEqual(titleView(both, 'both').sub, titleView(both, 'mine').sub, '둘 다에서만 작은 줄');
  assert.equal(titleView(both, 'both').sub, '영상 제목');
  assert.equal(titleView(both, 'mine').sub, '');
  assert.notEqual(userTitleText(moment(AUTO, '영상 제목')), AUTO, '도메인 자동 제목을 내 제목으로 쓰지 않는다');
  assert.notEqual(userTitleText(moment('영상 제목', '영상 제목')), '영상 제목', '#344가 채운 제목을 내 제목으로 쓰지 않는다');
});

test('3. 날짜 표기: 화면에는 "2026. 11. 10" 한 가지', () => {
  assert.equal(formatDisplayDate('2026-11-10'), '2026. 11. 10');
  assert.equal(formatDisplayDate('2026.11.10'), '2026. 11. 10');
  assert.equal(formatDisplayDate('2026-1-5'), '2026. 01. 05');
  assert.equal(formatDisplayDate('2026.1.5'), '2026. 01. 05');
  assert.equal(formatDisplayDate('2026-11-10T12:34:56Z'), '2026. 11. 10');
  assert.equal(formatDisplayDate(''), '');
  assert.equal(formatDisplayDate('날짜 없음'), '날짜 없음', '해석 못 하면 원문 유지');
  // 강도 증명: 저장 형식 그대로 노출하지 않고, 월/일을 0으로 채운다.
  assert.notEqual(formatDisplayDate('2026-1-5'), '2026-1-5');
  assert.notEqual(formatDisplayDate('2026-01-05'), formatDisplayDate('2026-02-05'));
});
