// #1073 B-21: 두 벌의 검증 규칙 — 서버 사본(src/domain.js)과 화면 사본(public/v41/domain.mjs)은
// 따로 고쳐진다(한 벌로 합치는 일은 별도 이슈). 기능별 대조 시험은 각자 있지만, 전체 출력이
// 같은 답을 내는지 보는 대조는 없었다. 필드가 다 들어간 고정 문서 하나를 두 validateState에
// 넣어 결과가 정확히 같은지 본다. 한쪽 허용 목록에만 필드를 더해 출력에 한 필드라도 차이가
// 나면 이 시험이 실패한다 — 아직 어느 쪽 허용 목록에도 없는 이름의 필드도 문서에 심어 두어,
// 한쪽만 허용 목록에 넣는 순간 걸리게 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/domain.js';
import * as screen from '../public/v41/domain.mjs';

// 어느 허용 목록에도 없는 순간 필드 — 지금은 두 벌 모두 지운다. prefs의 junkPref는 보존한다.
const UNKNOWN_FIELDS = {z: 1.5, w: '남는가', legacyNote: '옛 문서 흔적'};

const FIXED_STATE = {
  version: 1,
  prefs: {
    titleDisplay: 'mine',
    displayName: '  유리   바다  ',
    accentColor: 'teal',
    dateStyle: 'long',
    startPlace: 'home',
    shareView: 'network',
    shareDiscover: true,
    treeChipOrder: ['t1', 't1', 'all', '', 't2', 'x'.repeat(100)],
    homeMoment: {mode: 'pin', treeId: 't1', momentId: 'm1'},
    junkPref: '어느 허용 목록에도 없는 값',
  },
  trees: [
    {
      id: 't1',
      subject: '유리 바다',
      title: '유리 바다, 나의 순간들',
      coverMomentId: 'm1',
      coverDesign: 'texture-3',
      coverMode: 'photo',
      inbox: true,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      moments: [
        {
          id: 'm1', parentId: null, links: ['m2', 'm3'], createdAt: '2026-11-01T00:00:00.000Z',
          title: '첫 순간', note: '  마음   한마디  ', emotion: '설렘', date: '2026-11-01',
          relation: '시작',
          url: 'https://www.youtube.com/watch?v=abc123',
          startSeconds: 5, endSeconds: 30,
          mediaMetadata: {title: '영상 제목', channel: '채널', thumbnail: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg', vertical: true, width: 1080, height: 1920, junkMeta: 1},
          x: 120.4, y: -80.6, rot: 45,
          pinStyle: 'pin-a', cardStyle: 'card-b', color: 'blue',
          keywords: ['가수:이름', '무대:쇼', 'k'.repeat(24), 'k'.repeat(25)],
          ...UNKNOWN_FIELDS,
        },
        {
          id: 'm2', parentId: 'm1', links: [], createdAt: '2026-11-01T01:00:00.000Z',
          title: '이어진 순간', note: '', emotion: '노래하는 기쁨', date: '2026-11-02',
          relation: '이어서',
          url: 'https://example.com/photo.jpg',
        },
        {
          id: 'm3', parentId: 'm1', links: ['m1'], createdAt: '2026-11-01T02:00:00.000Z',
          title: '최소 순간', date: '2026-11-03',
        },
      ],
    },
    {
      id: 't2',
      subject: '두 번째 책',
      title: '두 번째 책, 나의 순간들',
      coverMomentId: '',
      coverDesign: 'texture-거짓',
      coverMode: '아무값',
      inbox: true,
      createdAt: '2026-11-03T00:00:00.000Z',
      updatedAt: '2026-11-03T00:00:00.000Z',
      moments: [
        {id: 'n1', parentId: null, links: [], createdAt: '2026-11-03T00:00:00.000Z', title: '혼자 남는 순간', date: '2026-11-04'},
      ],
    },
  ],
};

test('두 벌의 validateState가 필드가 다 들어간 고정 문서에서 같은 출력을 내려준다', () => {
  const fromServerCopy = server.validateState(structuredClone(FIXED_STATE));
  const fromScreenCopy = screen.validateState(structuredClone(FIXED_STATE));
  assert.deepEqual(fromScreenCopy, fromServerCopy);
});

test('모르는 순간 필드는 지우고 모르는 설정은 보존한다', () => {
  const cleaned = screen.validateState(structuredClone(FIXED_STATE));
  const moment = cleaned.trees[0].moments.find(m => m.id === 'm1');
  assert.equal(Object.keys(moment).some(key => Object.prototype.hasOwnProperty.call(UNKNOWN_FIELDS, key)), false, '모르는 순간 필드는 출력에 남지 않는다');
  assert.equal(cleaned.prefs.junkPref, FIXED_STATE.prefs.junkPref, '모르는 설정 값은 다른 버전이 쓸 수 있게 보존한다');
  assert.equal(moment.keywords.includes('k'.repeat(25)), false, '길이 한도를 넘은 꼬리표는 지운다');
  assert.deepEqual(moment.keywords, ['가수:이름', '무대:쇼', 'k'.repeat(24)]);
});

for (const [name, domain] of [['서버', server], ['브라우저', screen]]) {
  test(name + '에서 모르는 설정은 개수·바이트·키 길이 상한 안에서만 보존한다', () => {
    const many = Object.fromEntries(Array.from({length: domain.MAX_UNKNOWN_PREFS + 5}, (_, index) => [`future-${index}`, index]));
    const longKey = 'x'.repeat(81);
    const prefs = domain.normalizePrefs({ small: '남김', huge: '가'.repeat(6000), [longKey]: '버림', ...many });
    const kept = Object.keys(prefs).filter(key => key === 'small' || key.startsWith('future-'));
    assert.equal(prefs.small, '남김');
    assert.equal(prefs.huge, undefined);
    assert.equal(prefs[longKey], undefined);
    assert.equal(kept.length, domain.MAX_UNKNOWN_PREFS);
    const unknown = Object.fromEntries(kept.map(key => [key, prefs[key]]));
    assert.ok(new TextEncoder().encode(JSON.stringify(unknown)).byteLength <= domain.MAX_UNKNOWN_PREF_BYTES);
  });
}

for (const [name, domain] of [['서버', server], ['브라우저', screen]]) {
  test(name + '에서 옛 트리와 잘못된 열 화면은 트리 보기로 읽는다', () => {
    const state = structuredClone(FIXED_STATE);
    assert.equal(domain.validateState(state).trees[0].openView, 'tree');
    for (const invalid of [null, 'shelf', 'map', ['book'], 3]) {
      state.trees[0].openView = invalid;
      assert.equal(domain.validateState(state).trees[0].openView, 'tree');
    }
  });

  test(name + '에서 열 화면만 바꾸거나 이름만 고쳐도 트리 설정이 유지된다', () => {
    const fields = { subject: '봄날', title: '첫 순간', note: '첫 마음' };
    const tree = domain.createTree(fields);
    assert.equal(tree.openView, 'tree');
    const edit = { title: tree.title, subject: tree.subject };
    for (const openView of ['tree', 'board', 'book', 'network']) {
      assert.equal(domain.createTree({ ...fields, openView }).openView, openView);
      const changed = domain.editTree(tree, { ...edit, openView });
      assert.equal(changed.openView, openView);
      assert.equal(domain.editTree(changed, edit), changed);
      assert.equal(domain.editTree(changed, { ...edit, title: '새 이름' }).openView, openView);
      assert.equal(domain.editTree(changed, { ...edit, openView: '알 수 없음' }).openView, 'tree');
    }
  });

  test(name + '에서 순간 0개 트리에 첫 순간을 추가하면 시작 순간으로 저장된다', () => {
    const tree = domain.createTree({ subject: '봄날', title: '빈 트리', note: '첫 마음', emotion: '설렘', date: '2026-11-01', url: '' }, '2026-11-01T00:00:00.000Z');
    const empty = { ...tree, moments: [] };
    const grown = domain.addMoment(empty, { title: '첫 순간', note: '첫 마음', emotion: '설렘', date: '2026-11-01', url: '' }, '');
    assert.equal(grown.moments.length, 1);
    assert.equal(grown.moments[0].parentId, null);
    assert.equal(domain.validateState({ version: 1, trees: [grown], prefs: {} }).trees[0].moments[0].parentId, null);
    const quick = domain.quickAdd({ version: 1, trees: [empty], prefs: {} }, { treeId: empty.id, url: 'https://example.com/first' }, '2026-11-01T00:00:00.000Z');
    assert.equal(quick.state.trees[0].moments.length, 1);
    assert.equal(quick.state.trees[0].moments[0].parentId, null);
  });

  test(name + '에서 백업을 기존 목록에 합치면 새 식별자에도 열 화면이 보존된다', () => {
    const currentTree = { ...FIXED_STATE.trees[0], openView: 'network' };
    const current = { version: 1, trees: [currentTree] };
    const imported = domain.importTrees(current, {
      version: 1, trees: [{ ...currentTree, openView: 'board' }, FIXED_STATE.trees[1]]
    });
    assert.deepEqual(imported.trees.map(tree => tree.openView), ['network', 'board', 'tree']);
    assert.notEqual(imported.trees[1].id, currentTree.id);
    assert.deepEqual(current.trees, [currentTree]);
  });
}
