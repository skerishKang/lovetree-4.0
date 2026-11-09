import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suggestMomentTitle, quickAdd, validateState, EMPTY_STATE } from '../src/domain.js';
import { suggestMomentTitle as suggestMjs, quickAdd as quickAddMjs, validateState as validateReader, EMPTY_STATE as EMPTY_STATE_MJS } from '../public/v41/domain.mjs';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { fetchVideoTitle } from '../public/v41/video-title.mjs';

// #344(2026-11-10 대표 요청): 자동 제목을 영상 제목으로 — 우선순위는 사용자 입력 > 영상 제목(oEmbed) >
// 마음 한마디 첫 줄 > 기존 도메인 규칙. src/domain.js와 public/v41/domain.mjs 두 벌이 같은 규칙인지
// 같은 입력 표로 확인하고, 서버 경계(PUT→GET)에서 제목·mediaMetadata가 살아 남는지 본다.
// 기존 순간 제목은 바꾸지 않는다(cacheMomentMediaMetadata는 제목을 건드리지 않는다).

const YOUTUBE = 'https://youtu.be/abc123DEF45';

test('우선순위: 사용자 입력 > 영상 제목 > 마음 한마디 첫 줄 > 기존 규칙(두 벌 같다)', () => {
  const matrix = [
    [{ title: '내가 쓴 제목', note: '메모', url: YOUTUBE, mediaMetadata: { title: '영상 제목' } }, '내가 쓴 제목'],
    [{ note: '메모 첫 줄\n둘째 줄', url: YOUTUBE, mediaMetadata: { title: '영상 제목' } }, '영상 제목'],
    [{ url: YOUTUBE, mediaMetadata: { title: '영상 제목' } }, '영상 제목'],
    [{ url: YOUTUBE }, 'youtu.be에서 간직한 순간'],
    [{ note: '마음 첫 줄\n둘째 줄', url: YOUTUBE }, '마음 첫 줄'],
  ];
  for (const [input, expected] of matrix) {
    assert.equal(suggestMomentTitle(input), expected, `src: ${JSON.stringify(input)}`);
    assert.equal(suggestMjs(input), expected, `mjs: ${JSON.stringify(input)}`);
  }
});

test('영상 제목은 80자로 자르고, oEmbed를 못 받으면(빈 값) 기존 규칙으로 물러난다(두 벌 같다)', () => {
  const longTitle = '가'.repeat(90);
  const matrix = [
    [{ url: YOUTUBE, mediaMetadata: { title: longTitle } }, '가'.repeat(80) + '…'],
    [{ url: YOUTUBE, mediaMetadata: { title: '   ' } }, 'youtu.be에서 간직한 순간', 'oEmbed 실패·빈 값 → 기존 규칙'],
    [{ url: YOUTUBE, mediaMetadata: { title: 42 } }, 'youtu.be에서 간직한 순간', '문자열이 아닌 제목 → 기존 규칙'],
    [{ url: YOUTUBE }, 'youtu.be에서 간직한 순간'],
    [{ note: '마음만 적었다', url: YOUTUBE }, '마음만 적었다'],
    [{ title: '  공백 제목  ', url: YOUTUBE, mediaMetadata: { title: '영상 제목' } }, '공백 제목'],
  ];
  for (const [input, expected] of matrix) {
    assert.equal(suggestMomentTitle(input), expected, `src: ${JSON.stringify(input)}`);
    assert.equal(suggestMjs(input), expected, `mjs: ${JSON.stringify(input)}`);
  }
});

test('quickAdd 저장값: 영상 제목이 자동 제목이 되고 mediaMetadata도 함께 저장된다(두 벌 같다)', () => {
  for (const [add, empty] of [[quickAdd, EMPTY_STATE], [quickAddMjs, EMPTY_STATE_MJS]]) {
    const result = add(empty(), { url: YOUTUBE, mediaMetadata: { title: 'Me at the zoo' } });
    const moment = result.state.trees[0].moments[0];
    assert.equal(moment.title, 'Me at the zoo');
    assert.deepEqual(moment.mediaMetadata, { title: 'Me at the zoo', channel: '', source: 'youtu.be' });
    // oEmbed를 못 받으면(빈 값) 기존 규칙 — mediaMetadata도 남지 않는다.
    const fallback = add(empty(), { url: YOUTUBE, mediaMetadata: { title: '' } });
    assert.equal(fallback.state.trees[0].moments[0].title, 'youtu.be에서 간직한 순간');
    assert.equal('mediaMetadata' in fallback.state.trees[0].moments[0], false);
  }
});

test('fetchVideoTitle: oEmbed 성공·실패·예외 모두 안전하다', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ title: '  Me at the zoo  ' }) });
  assert.equal(await fetchVideoTitle('abc123DEF45', ok), 'Me at the zoo');
  const notOk = async () => ({ ok: false, json: async () => ({ title: 'x' }) });
  assert.equal(await fetchVideoTitle('abc123DEF45', notOk), '', '응답 실패는 빈 값(기존 규칙으로 물러남)');
  const boom = async () => { throw new Error('network'); };
  assert.equal(await fetchVideoTitle('abc123DEF45', boom), '', '예외도 빈 값');
  let called = 0;
  const counting = async () => { called += 1; return ok(); };
  assert.equal(await fetchVideoTitle('', counting), '');
  assert.equal(called, 0, '빈 videoId는 요청하지 않는다');
});

test('서버 경계(PUT→GET): 자동 제목·mediaMetadata가 저장 왕복을 살아 남는다', async () => {
  let state = { version: 1, trees: [] }, revision = 0;
  const api = {
    get: async () => ({ ok: true, state, revision, subject: 'qa', writeSubjectBound: true }),
    put: async (body) => { state = validateState(body.state); return { ok: true, revision: ++revision }; },
    logout: async () => ({ ok: true }),
  };
  const session = createMemberSession({ api, delay: () => new Promise(() => {}) });
  await session.start();
  const saved = session.apply('quickAdd', { url: YOUTUBE, mediaMetadata: { title: 'Big Buck Bunny 60fps 4K' } });
  await session.act('retry');
  const restored = createMemberSession({ api });
  await restored.start();
  const tree = restored.state().trees.find((t) => t.id === saved.treeId);
  const moment = tree.moments.find((m) => m.id === saved.momentId);
  assert.equal(moment.title, 'Big Buck Bunny 60fps 4K');
  assert.equal(moment.mediaMetadata.title, 'Big Buck Bunny 60fps 4K');
  // 리더 검증(같은 규칙 두 벌)도 같은 상태를 받아 들인다.
  assert.deepEqual(validateReader(JSON.parse(JSON.stringify(state))), state);
  session.dispose();
  restored.dispose();
});

test('배선: 빠른 추가·자세한 추가가 미리보기 제목을 저장에 함께 넘긴다(글자 검사)', () => {
  const quickDom = readFileSync(new URL('../public/v41/shell/quick-add.mjs', import.meta.url), 'utf8');
  const panels = readFileSync(new URL('../public/v41/shell/panels.mjs', import.meta.url), 'utf8');
  const quickPure = readFileSync(new URL('../public/v41/quick-add.mjs', import.meta.url), 'utf8');
  const videoTitle = readFileSync(new URL('../public/v41/video-title.mjs', import.meta.url), 'utf8');
  // 빠른 추가: titleCache의 제목을 quickAdd 입력에 붙인다. 못 받으면 붙이지 않는다(기존 규칙).
  assert.match(quickDom, /apply\('quickAdd', \{url, \.\.\.quickMediaTitle\(url\)\}\)/);
  assert.match(quickDom, /const title = titleCache\.get\(parsed\.videoId\) \|\| '';/);
  assert.match(quickDom, /return title \? \{ mediaMetadata: \{ title \} \} : \{\};/);
  assert.match(quickDom, /import \{fetchVideoTitle\} from '\.\.\/video-title\.mjs';/);
  // 자세한 추가: 미리보기 때 받아 둔 제목을 저장 입력에 함께 넘긴다(사용자 입력 우선은 도메인 판정).
  assert.match(panels, /apply\(editorMode, \{\.\.\.Object\.fromEntries\(new FormData\(e\.target\)\), \.\.\.editorMediaTitle\(\)\}, selection\(\)\)/);
  assert.match(panels, /import \{fetchVideoTitle\} from '\.\.\/video-title\.mjs';/);
  assert.match(panels, /suggestMomentTitle\(\{title, note, url, mediaMetadata: editorVideoTitle && url === editorVideoUrl \? \{title: editorVideoTitle\} : null\}\)/, '안내 문구도 같은 규칙을 따른다');
  // 조회 한 벌: 서버 oEmbed 프록시만 쓴다.
  assert.match(videoTitle, /\/api\/youtube\/oembed\?v=/);
  assert.match(quickPure, /export function parseQuickUrl/, '빠른 추가 판정은 기존 한 벌');
});
