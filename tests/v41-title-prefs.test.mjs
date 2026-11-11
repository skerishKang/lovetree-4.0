import test from 'node:test';
import assert from 'node:assert/strict';
import * as src from '../src/domain.js';
import * as pub from '../public/v41/domain.mjs';
import { createMemberSession } from '../public/v41/member-session.mjs';

// #347 후속: 표시 설정(state.prefs.titleDisplay)이 두 벌에서 같고, 서버 PUT→GET을 지나도 남는지.
const YOUTUBE = 'https://youtu.be/abc123DEF45';

test('0. 설정 값·기본값·정규화가 두 벌에서 같다', () => {
  assert.deepEqual(src.TITLE_DISPLAYS, pub.TITLE_DISPLAYS);
  assert.deepEqual(src.TITLE_DISPLAYS, ['both', 'mine', 'video']);
  for (const value of ['both', 'mine', 'video', '', 'BOTH', 'all', null, undefined, 0]) {
    assert.equal(src.normalizeTitleDisplay(value), pub.normalizeTitleDisplay(value));
  }
  for (const value of [undefined, null, {}, { titleDisplay: 'mine' }, { titleDisplay: 'evil' }, { titleDisplay: 'video', extra: 1 }]) {
    assert.deepEqual(src.normalizePrefs(value), pub.normalizePrefs(value));
  }
  assert.deepEqual(src.EMPTY_STATE().prefs, { titleDisplay: 'both', displayName: '', accentColor: '' });
  assert.deepEqual(pub.EMPTY_STATE().prefs, { titleDisplay: 'both', displayName: '', accentColor: '' });
});

test('0-1. #368 2차 프로필 규칙(표시 이름 20자·동그라미 색)이 두 벌에서 같다', () => {
  // 팔레트는 7색 + 기본(''). 두 벌이 같은 목록이다.
  assert.deepEqual(src.ACCENT_COLORS, pub.ACCENT_COLORS);
  assert.deepEqual(src.ACCENT_COLORS, ['', 'rose', 'gold', 'green', 'blue', 'purple', 'orange', 'teal']);
  assert.equal(src.MAX_DISPLAY_NAME, pub.MAX_DISPLAY_NAME);
  assert.equal(src.MAX_DISPLAY_NAME, 20);
  for (const value of ['', 'rose', 'gold', 'green', 'blue', 'purple', 'orange', 'teal', 'crimson', 'RED', null, undefined, 7, {}]) {
    assert.equal(src.normalizeAccentColor(value), pub.normalizeAccentColor(value));
  }
  assert.equal(src.normalizeAccentColor('crimson'), '', '모르는 색은 기본색');
  // 표시 이름: 공백 정리 + 문자 단위 20자 잘라 내기. 값이 없으면 ''.
  for (const [input, expected] of [
    ['윤슬', '윤슬'],
    ['  여름   바다   ','여름 바다'],
    ['가'.repeat(25), '가'.repeat(20)],
    ['😀'.repeat(22), '😀'.repeat(20)],
    ['', ''], ['   ', ''], [null, ''], [undefined, ''], [42, ''], [{}, '']
  ]) {
    assert.equal(src.normalizeDisplayName(input), expected, JSON.stringify(input));
    assert.equal(pub.normalizeDisplayName(input), expected, JSON.stringify(input));
  }
  // 옛 저장본(프로필 값 없음)은 그대로 읽힌다 — 제목 보기만 남고 새 키는 빈 값이다.
  const old = { version: 1, trees: [], prefs: { titleDisplay: 'mine' } };
  assert.deepEqual(src.validateState(structuredClone(old)).prefs, { titleDisplay: 'mine', displayName: '', accentColor: '' });
  assert.deepEqual(pub.validateState(structuredClone(old)).prefs, { titleDisplay: 'mine', displayName: '', accentColor: '' });
});

test('0-2. 프로필은 계정 기록(PUT→GET)을 지나도 남는다', async () => {
  let state = { version: 1, trees: [] }, revision = 0, lastPut = null;
  const api = {
    get: async () => ({ ok: true, state, revision, subject: 'qa', writeSubjectBound: true }),
    put: async (body) => { lastPut = structuredClone(body.state); state = pub.validateState(body.state); return { ok: true, revision: ++revision }; },
    logout: async () => ({ ok: true })
  };
  const session = createMemberSession({ api, delay: () => new Promise(() => {}) });
  await session.start();
  session.apply('setPrefs', { displayName: '  윤슬   지기  ', accentColor: 'teal' });
  await session.act('retry');
  assert.equal(lastPut.prefs.displayName, '윤슬 지기', 'PUT 본문에 표시 이름이 실린다');
  assert.equal(lastPut.prefs.accentColor, 'teal', 'PUT 본문에 동그라미 색이 실린다');
  const restored = createMemberSession({ api });
  await restored.start();
  assert.deepEqual(restored.state().prefs, { titleDisplay: 'both', displayName: '윤슬 지기', accentColor: 'teal' }, 'GET으로 돌아온 프로필');
  // 이름을 지우면 빈 값(이메일 폴백)으로 저장된다.
  restored.apply('setPrefs', { displayName: '   ', accentColor: '' });
  await restored.act('retry');
  const again = createMemberSession({ api });
  await again.start();
  assert.deepEqual(again.state().prefs, { titleDisplay: 'both', displayName: '', accentColor: '' });
  // 두 검증기 모두 같은 상태를 받아들인다.
  assert.deepEqual(src.validateState(structuredClone(state)), pub.validateState(structuredClone(state)));
  session.dispose();
  restored.dispose();
  again.dispose();
});

test('1. validateState: prefs가 없으면 기본, 모르는 값은 both, 두 벌 같은 결과', () => {
  const base = { version: 1, trees: [] };
  for (const prefs of [undefined, { titleDisplay: 'mine' }, { titleDisplay: 'video' }, { titleDisplay: 'evil' }, null]) {
    const input = { ...base, ...(prefs === undefined ? {} : { prefs }) };
    const a = src.validateState(structuredClone(input));
    const b = pub.validateState(structuredClone(input));
    assert.deepEqual(a, b);
    assert.equal(a.prefs.titleDisplay, prefs?.titleDisplay === 'mine' || prefs?.titleDisplay === 'video' ? prefs.titleDisplay : 'both');
  }
  const updatedSrc = src.updatePrefs({ version: 1, trees: [], prefs: { titleDisplay: 'mine' } }, { titleDisplay: 'video' });
  const updatedPub = pub.updatePrefs({ version: 1, trees: [], prefs: { titleDisplay: 'mine' } }, { titleDisplay: 'video' });
  assert.deepEqual(updatedSrc, updatedPub);
  assert.equal(updatedSrc.prefs.titleDisplay, 'video');
});

test('2. 서버 경계(PUT→GET): 설정이 저장되고, 나무 편집 뒤에도 남는다', async () => {
  let state = { version: 1, trees: [] }, revision = 0, lastPut = null;
  const api = {
    get: async () => ({ ok: true, state, revision, subject: 'qa', writeSubjectBound: true }),
    put: async (body) => { lastPut = structuredClone(body.state); state = pub.validateState(body.state); return { ok: true, revision: ++revision }; },
    logout: async () => ({ ok: true })
  };
  const session = createMemberSession({ api, delay: () => new Promise(() => {}) });
  await session.start();
  session.apply('setPrefs', { titleDisplay: 'video' });
  await session.act('retry');
  assert.equal(lastPut.prefs.titleDisplay, 'video', 'PUT 본문에 설정이 실린다');
  const restored = createMemberSession({ api });
  await restored.start();
  assert.equal(restored.state().prefs.titleDisplay, 'video', 'GET으로 돌아온 설정');

  // 나무 편집(빠른 추가) 뒤에도 설정이 유지된다.
  restored.apply('quickAdd', { url: YOUTUBE, mediaMetadata: { title: '영상 제목' } });
  await restored.act('retry');
  const again = createMemberSession({ api });
  await again.start();
  assert.equal(again.state().prefs.titleDisplay, 'video');
  assert.equal(again.state().trees[0].moments[0].mediaMetadata.title, '영상 제목');
  // 두 검증기 모두 같은 상태를 받아들인다.
  assert.deepEqual(src.validateState(structuredClone(state)), pub.validateState(structuredClone(state)));
  session.dispose();
  restored.dispose();
  again.dispose();
});
