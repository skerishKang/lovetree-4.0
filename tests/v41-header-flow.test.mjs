// 셸 헤더의 상태 × 화면 표 (#231 1-B 후속, 2026-11-09).
// 전: 소스 글자를 정규식으로 보던 시험(v41-header-states 6번, v41-header-tabs-mobile 6·7번).
// 후: createHeader를 가짜 DOM으로 띄우고 flowNavigation()을 불러 결과를 한 표로 확인한다.
// 상태 4 × 화면 5를 한 번에 돌리므로, 줄 단위 1:1 번역이 아니라 조합으로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeaderHarness, fakeNav, fakeTabButton } from './helpers/fake-dom.mjs';
import { treeViewsVisible, headerPartsFor } from '../public/v41/header-state.mjs';

const SCREENS = [
  ['첫 화면', 'src064-orbit.html', false],
  ['내 책장', 'track32-bookshelf.html', false],
  ['기억책', 'track59-sketchbook.html', true],
  ['기억 보드', 'track58-pinboard.html', true],
  ['관계 지도', 'track56-network.html', true]
];

// 기대값은 header-state.mjs에서 계산하지 않고 여기에 적는다(구현을 베끼면 시험이 약해진다).
const STATES = [
  {
    name: '로그아웃',
    make: () => ({ owned: false, trees: 0, tree: null, source: 'example' }),
    expect: {
      treeViews: false, recordMenu: false, writeMenu: false, shareMenu: false,
      picker: '트리 고르기', write: '처음 시작하기', aria: '이 트리 보기'
    }
  },
  {
    name: '로그인·트리 없음',
    make: () => ({ owned: true, trees: 0, tree: null, source: 'server' }),
    expect: {
      // 로그인했어도 트리가 없으면 기억책·보드·관계 지도 탭은 숨긴다(1-B 이전 동작 그대로).
      treeViews: false, recordMenu: false, writeMenu: true, shareMenu: false,
      picker: '트리 고르기', write: '새 트리 만들기', aria: '이 트리 보기'
    }
  },
  {
    name: '로그인·트리 있음',
    make: () => ({ owned: true, trees: 2, tree: { title: '리센느, 나의 순간들' }, source: 'server' }),
    expect: {
      treeViews: true, recordMenu: true, writeMenu: true, shareMenu: true,
      picker: '트리: 리센느', write: '순간 남기기', aria: '리센느 보기'
    }
  },
  {
    name: '공유 감상',
    make: () => ({ owned: true, trees: 2, tree: { title: '리센느, 나의 순간들' }, source: 'share' }),
    expect: {
      treeViews: false, recordMenu: false, writeMenu: false, shareMenu: false,
      picker: '트리: 리센느', write: '순간 남기기', aria: '리센느 보기'
    }
  }
];

test('상태 4 × 화면 5: 보이는 버튼·문구·접근성 이름이 표대로다', () => {
  const table = [];
  for (const state of STATES) {
    for (const [label, file, reading] of SCREENS) {
      const h = createHeaderHarness({ ...state.make(), current: file });
      try {
        h.header.flowNavigation();
        const got = {
          treeViews: !h.els['tree-views'].hidden,
          recordMenu: !h.els['record-menu'].hidden,
          writeMenu: !h.els['write-menu'].hidden,
          shareMenu: !h.els['share-menu'].hidden,
          picker: h.els['source-label'].textContent,
          write: h.els['write-menu'].textContent,
          aria: h.els['tree-views'].getAttribute('aria-label')
        };
        const want = { ...state.expect };
        // 읽기 화면에서는 '순간 남기기'가 '순간 추가'가 된다(트리가 있을 때만).
        if (reading && state.expect.write === '순간 남기기') want.write = '순간 추가';
        assert.deepEqual(got, want, `${state.name} × ${label}`);
        table.push(`${state.name} × ${label}: ${JSON.stringify(got)}`);
      } finally {
        h.restore();
      }
    }
  }
  assert.equal(table.length, 20, '상태 4 × 화면 5 = 20칸을 모두 확인한다');
});

test('어느 상태·화면에서도 비활성(disabled)으로 남기지 않고 숨김으로 정리한다', () => {
  for (const state of STATES) {
    for (const [, file] of SCREENS) {
      const buttons = [fakeTabButton({ id: 'record-menu' }), fakeTabButton()];
      const h = createHeaderHarness({ ...state.make(), current: file });
      h.els['tree-views'].querySelectorAll = () => buttons;
      try {
        h.header.flowNavigation();
        for (const b of buttons) {
          assert.equal(b.disabled, false, '트리 탭을 disabled로 두지 않는다');
          assert.equal(b.title, '', '남아 있던 안내 title도 지운다');
        }
      } finally {
        h.restore();
      }
    }
  }
});

test('공유 감상에서는 로그인했어도 트리 탭·트리 선택을 숨긴다(공개 읽기)', () => {
  // 표만으로는 잡히지 않는 자리(공유 감상이면 parts 자체가 false)라 규칙을 직접 확인한다.
  assert.equal(treeViewsVisible({owned: true, publicReading: false}), true);
  assert.equal(treeViewsVisible({owned: true, publicReading: true}), false, '공개 읽기에는 트리 탭을 열지 않는다');
  assert.equal(treeViewsVisible({owned: false, publicReading: false}), false);
  const share = headerPartsFor({owned: true, treeCount: 2, publicReading: true});
  assert.equal(share.treeViews, false);
  assert.equal(share.treePicker, false);
});

test('화면을 바꿀 때마다 현재 탭을 가운데로 드러내고 말풍선을 다시 맞춘다', () => {
  const active = fakeTabButton({ id: 'write-menu' });
  active.setAttribute('aria-current', 'true');
  const nav = fakeNav({ scrollWidth: 720, clientWidth: 390, scrollLeft: 200, buttons: [active, fakeTabButton({ id: 'record-menu' })] });
  const h = createHeaderHarness({ owned: true, trees: 1, tree: { title: '리센느' }, source: 'server', navBar: nav });
  try {
    h.header.flowNavigation();
    assert.deepEqual(active.scrolledWith, { inline: 'center', block: 'nearest', behavior: 'smooth' });
    assert.equal(h.calls.tips, 1, '화면을 바꿀 때 말풍선 위치를 다시 맞춘다');
  } finally {
    h.restore();
  }
});

test('동작 줄이기 설정이면 부드럽게 굴리지 않는다', () => {
  const active = fakeTabButton();
  active.setAttribute('aria-current', 'true');
  const nav = fakeNav({ scrollWidth: 720, clientWidth: 390, scrollLeft: 200, buttons: [active] });
  const h = createHeaderHarness({ owned: true, trees: 1, tree: { title: '리센느' }, source: 'server', navBar: nav, reduceMotion: true });
  try {
    h.header.flowNavigation();
    assert.equal(active.scrolledWith.behavior, 'auto');
  } finally {
    h.restore();
  }
});

test('넓은 화면에서는 탭을 끌어오지 않고 페이드만 갱신한다', () => {
  const active = fakeTabButton();
  active.setAttribute('aria-current', 'true');
  const nav = fakeNav({ scrollWidth: 900, clientWidth: 900, scrollLeft: 0, buttons: [active] });
  const h = createHeaderHarness({ owned: true, trees: 1, tree: { title: '리센느' }, source: 'server', navBar: nav, narrow: false });
  try {
    h.header.flowNavigation();
    assert.equal(active.scrolledWith, null, '넓은 화면에서는 scrollIntoView를 부르지 않는다');
  } finally {
    h.restore();
  }
});

test('페이드는 넘치는 쪽에만 켠다(스크롤 위치에 따라)', () => {
  const cases = [
    { name: '넘치지 않음', scrollWidth: 390, clientWidth: 390, scrollLeft: 0, want: [] },
    { name: '넘침·왼쪽 끝', scrollWidth: 720, clientWidth: 390, scrollLeft: 0, want: ['fade-end'] },
    { name: '넘침·가운데', scrollWidth: 720, clientWidth: 390, scrollLeft: 150, want: ['fade-start', 'fade-end'] },
    { name: '넘침·오른쪽 끝', scrollWidth: 720, clientWidth: 390, scrollLeft: 330, want: ['fade-start'] }
  ];
  for (const c of cases) {
    const nav = fakeNav({ scrollWidth: c.scrollWidth, clientWidth: c.clientWidth, scrollLeft: c.scrollLeft });
    const h = createHeaderHarness({ owned: true, trees: 1, tree: { title: '리센느' }, source: 'server', navBar: nav });
    try {
      h.header.updateNavFade();
      const on = ['fade-start', 'fade-end'].filter((n) => nav.classList.contains(n));
      assert.deepEqual(on, c.want, c.name);
    } finally {
      h.restore();
    }
  }
});

test('스크롤·폭 변경에 반응해 페이드를 다시 계산한다', () => {
  const nav = fakeNav({ scrollWidth: 720, clientWidth: 390, scrollLeft: 0 });
  const h = createHeaderHarness({ owned: true, trees: 1, tree: { title: '리센느' }, source: 'server', navBar: nav });
  try {
    assert.equal(typeof nav.listeners.scroll, 'function', '스크롤에 반응한다');
    nav.scrollLeft = 330;
    nav.listeners.scroll();
    assert.equal(nav.classList.contains('fade-start'), true);
    assert.equal(nav.classList.contains('fade-end'), false);
  } finally {
    h.restore();
  }
});

test('계정 자리: 로그아웃은 "로그인", 로그인은 동그라미 + 안내 이름', async () => {
  const out = createHeaderHarness({ owned: false, trees: 0 });
  try {
    out.header.renderAccount();
    assert.equal(out.els['account-entry'].hidden, false);
    assert.equal(out.els['account-entry'].textContent, '로그인');
    assert.equal(out.els['account-avatar'].hidden, true);
  } finally { out.restore(); }

  const inTrees = createHeaderHarness({ owned: true, trees: 1, tree: { title: '리센느' }, account: { ok: true, email: 'a@b.co' } });
  try {
    await inTrees.header.loadAccountEmail();
    assert.equal(inTrees.els['account-entry'].hidden, true);
    assert.equal(inTrees.els['account-avatar'].hidden, false);
    assert.equal(inTrees.els['account-avatar'].getAttribute('aria-label').length > 0, true, '동그라미에 읽을 이름이 있다');
  } finally { inTrees.restore(); }
});
