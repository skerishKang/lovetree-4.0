// #1073 B-21: 두 벌의 검증 규칙 — 서버 사본(src/domain.js)과 화면 사본(public/v41/domain.mjs)은
// 따로 고쳐진다(한 벌로 합치는 일은 별도 이슈). 기능별 대조 시험은 각자 있지만, 전체 출력이
// 같은 답을 내는지 보는 대조는 없었다. 필드가 다 들어간 고정 문서 하나를 두 validateState에
// 넣어 결과가 정확히 같은지 본다. 한쪽 허용 목록에만 필드를 더해 출력에 한 필드라도 차이가
// 나면 이 시험이 실패한다 — 아직 어느 쪽 허용 목록에도 없는 이름의 필드도 문서에 심어 두어,
// 한쪽만 허용 목록에 넣는 순간 걸리게 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateState as validateServerCopy} from '../src/domain.js';
import {validateState as validateScreenCopy} from '../public/v41/domain.mjs';

// 어느 허용 목록에도 없는 필드들 — 지금은 두 벌 모두 지운다. 한쪽만 허용하면 이 시험이 실패한다.
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
  const fromServerCopy = validateServerCopy(structuredClone(FIXED_STATE));
  const fromScreenCopy = validateScreenCopy(structuredClone(FIXED_STATE));
  assert.deepEqual(fromScreenCopy, fromServerCopy);
});

test('어느 허용 목록에도 없는 필드는 두 벌 모두 같은 방식으로 지운다', () => {
  const cleaned = validateScreenCopy(structuredClone(FIXED_STATE));
  const moment = cleaned.trees[0].moments.find(m => m.id === 'm1');
  assert.equal(Object.keys(moment).some(key => Object.prototype.hasOwnProperty.call(UNKNOWN_FIELDS, key)), false, '모르는 필드는 출력에 남지 않는다');
  assert.equal('junkPref' in cleaned.prefs, false, '모르는 설정 값은 출력에 남지 않는다');
  assert.equal(moment.keywords.includes('k'.repeat(25)), false, '길이 한도를 넘은 꼬리표는 지운다');
  assert.deepEqual(moment.keywords, ['가수:이름', '무대:쇼', 'k'.repeat(24)]);
});
