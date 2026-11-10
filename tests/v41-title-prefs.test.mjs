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
  assert.deepEqual(src.EMPTY_STATE().prefs, { titleDisplay: 'both' });
  assert.deepEqual(pub.EMPTY_STATE().prefs, { titleDisplay: 'both' });
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
