import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// #256-3 표지 고르기: 데이터 필드(서버·클라이언트 두 벌)와 표지 결정 규칙(coverChoice)을 함수로 직접 부른다.
// 마크업·CSS 값만 글자 검사로 남긴다(docs/TESTING.md).
import * as serverDomain from '../src/domain.js';
import * as webDomain from '../public/v41/domain.mjs';
import { coverChoice, shelfBook, COVER_PALETTE } from '../public/v41/views/shelf/shelf-model.mjs';

const NOW = new Date().toISOString();
const moment = (id, extra = {}) => ({ id, title: '순간 ' + id, note: '', emotion: '설렘', date: '2026-11-09', relation: '', url: '', parentId: id === 'm1' ? null : 'm1', links: [], createdAt: NOW, ...extra });
const treeOf = (extra = {}) => ({ id: 'tree1', subject: '대상', title: '트리', coverMomentId: '', createdAt: NOW, updatedAt: NOW, moments: [moment('m1'), moment('m2')], ...extra });
const stateOf = (tree) => ({ version: 1, trees: [tree] });

test('두 벌(서버 src/domain.js · 클라이언트 public/v41/domain.mjs)의 디자인 표지 허용 목록이 같다', () => {
  assert.deepEqual(serverDomain.COVER_DESIGN_IDS, webDomain.COVER_DESIGN_IDS, '두 벌이 어긋나면 한쪽 저장이 다른 쪽에서 잘려나간다');
  assert.equal(serverDomain.COVER_DESIGN_IDS.length, 6, '디자인 표지는 4~6종');
  for (const id of serverDomain.COVER_DESIGN_IDS) assert.match(id, /^texture-[1-6]$/, '정해진 디자인 표지 ID뿐이다');
});

test('normalizeCoverDesign: 정해진 값만 남기고 모르는 값·타입은 저장 거부 없이 \'\'로 되돌린다(두 벌 같다)', () => {
  for (const domain of [serverDomain, webDomain]) {
    assert.equal(domain.normalizeCoverDesign('texture-1'), 'texture-1');
    assert.equal(domain.normalizeCoverDesign('texture-6'), 'texture-6');
    assert.equal(domain.normalizeCoverDesign(''), '');
    assert.equal(domain.normalizeCoverDesign(undefined), '');
    assert.equal(domain.normalizeCoverDesign(null), '');
    assert.equal(domain.normalizeCoverDesign(7), '');
    assert.equal(domain.normalizeCoverDesign('texture-9'), '', '목록 밖 ID');
    assert.equal(domain.normalizeCoverDesign('texture-0'), '', '목록 밖 ID');
    assert.equal(domain.normalizeCoverDesign('TEXTURE-1'), '', '대소문자도 다른 값');
    assert.equal(domain.normalizeCoverDesign(' texture-1 '), '', '공백도 다른 값');
  }
});

test('validateState(서버 벌)는 coverDesign을 저장하고 모르는 트리 필드는 여전히 잘라낸다', () => {
  const state = serverDomain.validateState(stateOf(treeOf({ coverDesign: 'texture-2', secretField: 'x' })));
  assert.equal(state.trees[0].coverDesign, 'texture-2');
  assert.equal(state.trees[0].secretField, undefined, '다른 필드는 추가하지 않았다');
  const fallback = serverDomain.validateState(stateOf(treeOf({ coverDesign: 'texture-9' })));
  assert.equal(fallback.trees[0].coverDesign, '', '모르는 값은 \'\'로');
  const missing = serverDomain.validateState(stateOf(treeOf({})));
  assert.equal(missing.trees[0].coverDesign, '', '없으면 \'\'');
  // 표지 방법은 고른 저장본에만 있다 — 방법이 없던 옛 저장본에는 빈 값을 심지 않는다.
  assert.deepEqual(Object.keys(missing.trees[0]).sort(), ['coverDesign', 'coverMomentId', 'createdAt', 'id', 'inbox', 'moments', 'subject', 'title', 'updatedAt'], '트리 필드는 이것만');
  const chosen = serverDomain.validateState(stateOf(treeOf({ coverMode: 'design', coverDesign: 'texture-2' })));
  assert.equal(chosen.trees[0].coverMode, 'design', '고른 방법은 그대로 남는다(되돌리면 그대로 다시 보인다)');
  const junkMode = serverDomain.validateState(stateOf(treeOf({ coverMode: 'nope' })));
  assert.equal(junkMode.trees[0].coverMode, undefined, '모르는 방법은 빈 값이 되어 키가 생기지 않는다');
});

test('validateState(클라이언트 벌)도 같은 규칙으로 coverDesign을 정리한다', () => {
  const state = webDomain.validateState(stateOf(treeOf({ coverDesign: 'texture-5' })));
  assert.equal(state.trees[0].coverDesign, 'texture-5');
  const fallback = webDomain.validateState(stateOf(treeOf({ coverDesign: 'nope' })));
  assert.equal(fallback.trees[0].coverDesign, '');
});

test('createTree는 coverDesign \'\'으로 시작한다(두 벌)', () => {
  for (const domain of [serverDomain, webDomain]) {
    const tree = domain.createTree({ subject: '대상', title: '나의 순간', note: '첫 마음' });
    assert.equal(tree.coverDesign, '');
  }
});

test('editTree는 coverDesign을 저장하고, 모르는 값은 \'\'로 두며, 값이 같으면 같은 트리를 돌려준다', () => {
  const base = serverDomain;
  const tree = base.validateState(stateOf(treeOf({ coverDesign: 'texture-1' }))).trees[0];
  const changed = base.editTree(tree, { title: tree.title, subject: tree.subject, coverMomentId: '', coverDesign: 'texture-3' });
  assert.equal(changed.coverDesign, 'texture-3');
  assert.equal(changed.updatedAt !== tree.updatedAt, true, '디자인만 바꿔도 저장 대상이 된다');
  const cleaned = base.editTree(tree, { title: tree.title, subject: tree.subject, coverMomentId: '', coverDesign: 'texture-7' });
  assert.equal(cleaned.coverDesign, '', '모르는 값은 \'\'로');
  const untouched = base.editTree(tree, { title: tree.title, subject: tree.subject, coverMomentId: '', coverDesign: 'texture-1' });
  assert.equal(untouched, tree, '변화가 없으면 같은 트리(저장 생략)');
  const webTree = webDomain.validateState(stateOf(treeOf({ coverDesign: 'texture-1' }))).trees[0];
  assert.equal(webDomain.editTree(webTree, { title: webTree.title, subject: webTree.subject, coverMomentId: '', coverDesign: 'texture-4' }).coverDesign, 'texture-4');
});

test('coverChoice 우선순위: 사진 표지 > 디자인 표지 > 지금 규칙(책장 순서 색)', () => {
  const palette = COVER_PALETTE;
  const photoTree = treeOf({ coverMomentId: 'm1', coverDesign: 'texture-3', moments: [moment('m1', { type: 'photo', image: '/api/media/aaa.jpg' }), moment('m2')] });
  assert.deepEqual(coverChoice(photoTree, 0, palette), { color: palette[0], accent: palette[0], coverMedia: '/api/media/aaa.jpg', design: '' }, '사진이 이기고 디자인은 무시된다');
  const designTree = treeOf({ coverDesign: 'texture-2' });
  assert.deepEqual(coverChoice(designTree, 0, palette), { color: palette[1], accent: palette[1], coverMedia: '', design: 'texture-2' }, 'texture-2는 테마 표지 색 2번');
  const videoCoverTree = treeOf({ coverMomentId: 'm1', coverDesign: 'texture-3', moments: [moment('m1', { type: 'video', image: '' }), moment('m2')] });
  assert.equal(coverChoice(videoCoverTree, 1, palette).design, 'texture-3', '사진이 아닌 표지 순간은 사진 우선이 아니므로 디자인이 이긴다');
  const unknownTree = treeOf({ coverDesign: 'texture-9' });
  assert.equal(coverChoice(unknownTree, 2, palette).design, '', '모르는 값은 기본 규칙으로');
});

test('coverChoice: 사진·디자인이 둘 다 없으면 지금 규칙과 정확히 같다(기존 화면 변화 0)', () => {
  const palette = COVER_PALETTE;
  for (let index = 0; index < 8; index += 1) {
    const choice = coverChoice(treeOf(), index, palette);
    assert.deepEqual(choice, { color: palette[index % palette.length], accent: palette[index % palette.length], coverMedia: '', design: '' });
  }
});

test('shelfBook은 coverChoice 결과를 그대로 책 객체에 실는다', () => {
  const palette = COVER_PALETTE;
  const designed = shelfBook(treeOf({ coverDesign: 'texture-4' }), 0, palette, (v) => v);
  assert.equal(designed.design, 'texture-4');
  assert.equal(designed.color, palette[3], 'texture-4는 테마 표지 색 4번');
  assert.equal(designed.coverMedia, '');
  const photo = shelfBook(treeOf({ coverMomentId: 'm1', moments: [moment('m1', { type: 'photo', image: '/api/media/a.png' }), moment('m2')] }), 0, palette, (v) => v);
  assert.equal(photo.coverMedia, '/api/media/a.png');
  assert.equal(photo.design, '');
});

test('디자인 표지 질감은 identity.css 한 곳에 있고 6종 모두 책장·펼친 책·고르기 칩을 같이 본다(마크업·CSS 값 검사)', () => {
  const css = readFileSync('public/v41/identity.css', 'utf8');
  for (const id of serverDomain.COVER_DESIGN_IDS) {
    const rule = css.match(new RegExp('\\[data-cover-design="' + id + '"\\][^{]*\\{([^}]*)\\}'));
    assert.ok(rule, id + ' 질감 규칙이 identity.css에 있다');
    assert.match(rule[1], /background-image:/, id + ' 질감은 background-image로 얹는다');
    assert.doesNotMatch(rule[1], /url\(/, id + ' 질감에 외부 이미지 없다(CSS만)');
  }
  const shelfExtra = readFileSync('public/v41/views/shelf/shelf-extra.css', 'utf8');
});

test('책 정보 관리 창: 디자인 표지 라디오와 사진 표지 안내·사진 빼기가 있고 패널이 저장값을 반영한다(구조 검사)', () => {
  const shell = readFileSync('public/v41/index.html', 'utf8');
  // #380 5번: 표지 방법은 맨 위 한 줄에서 하나만 고르고, 고른 방법의 내용만 아래에 보인다.
  for (const [value, label] of [['basic', '첫 순간(기본)'], ['moment', '순간에서'], ['design', '디자인'], ['photo', '사진']]) {
  }
  assert.equal((shell.match(/name="coverDesign" value="texture-/g) || []).length, 6, '디자인 6종 라디오');
  const panels = readFileSync('public/v41/shell/panels.mjs', 'utf8');
  // #314: RadioNodeList.value = ''는 이전 체크를 풀지 않는다 — 라디오마다 명시적으로 정한다.
});

test('표지 방법 하나만 표지가 된다 — 고르지 않은 방법의 저장값은 지우지 않는다', () => {
  const photoMoment = moment('m2', { type: 'photo', image: 'https://example.test/photo.jpg' });
  const base = { ...treeOf({ coverMomentId: 'm2', coverDesign: 'texture-3' }), moments: [moment('m1'), photoMoment] };
  // 옛 저장본(방법 없음)은 지금 규칙 그대로 — 사진 표지가 이긴다.
  assert.equal(coverChoice(base, 0, COVER_PALETTE).coverMedia, 'https://example.test/photo.jpg', '옛 저장본: 사진 표지 우선');
  // 디자인을 고르면 디자인이 표지가 되고, 사진은 쓰지 않는다.
  const design = coverChoice({ ...base, coverMode: 'design' }, 0, COVER_PALETTE);
  assert.equal(design.design, 'texture-3');
  assert.equal(design.coverMedia, '', '디자인을 고르면 사진 표지를 쓰지 않는다');
  // 첫 순간(기본)은 색 표지 — 저장해 둔 사진·디자인을 쓰지 않는다.
  const basic = coverChoice({ ...base, coverMode: 'basic' }, 0, COVER_PALETTE);
  assert.equal(basic.coverMedia, '');
  assert.equal(basic.design, '');
  // 되돌리면 그대로 다시 보인다(저장값은 남아 있다).
  assert.equal(base.coverMomentId, 'm2', '사진 표지 순간은 지우지 않는다');
  assert.equal(base.coverDesign, 'texture-3', '디자인 표지는 지우지 않는다');
  assert.equal(coverChoice({ ...base, coverMode: 'photo' }, 0, COVER_PALETTE).coverMedia, 'https://example.test/photo.jpg', '사진으로 되돌리면 그대로');
  assert.equal(coverChoice({ ...base, coverMode: 'moment' }, 0, COVER_PALETTE).coverMedia, 'https://example.test/photo.jpg', '순간에서로 되돌리면 그대로');
});

test('editTree: 고르지 않은 방법의 저장값(표지 순간·디자인)을 지우지 않고 방법만 바꾼다(두 벌 같다)', () => {
  for (const domain of [serverDomain, webDomain]) {
    const tree = { ...treeOf({ coverMomentId: 'm2', coverDesign: 'texture-3' }), moments: [moment('m1'), moment('m2', { type: 'photo', image: 'https://example.test/p.jpg' })] };
    const design = domain.editTree(tree, { title: tree.title, subject: tree.subject, coverMomentId: tree.coverMomentId, coverDesign: tree.coverDesign, coverMode: 'design' });
    assert.equal(design.coverMode, 'design');
    assert.equal(design.coverMomentId, 'm2', '표지 순간은 그대로');
    assert.equal(design.coverDesign, 'texture-3', '디자인은 그대로');
    const back = domain.editTree(design, { title: tree.title, subject: tree.subject, coverMomentId: tree.coverMomentId, coverDesign: tree.coverDesign, coverMode: 'photo' });
    assert.equal(back.coverMode, 'photo');
    assert.equal(back.coverMomentId, 'm2', '사진으로 되돌아온다(순간이 지워지지 않았다)');
  }
});
