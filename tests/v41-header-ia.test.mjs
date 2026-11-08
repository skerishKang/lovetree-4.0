import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  accountPresentation, firstLetter, treePickerLabel, treePickerText, treeViewsVisible, writeMenuLabel,
  homeCenterState, homeStartLoginUrl, HOME_LOGIN_NEXT
} from '../public/v41/header-state.mjs';
import {hasPendingDraft} from '../public/v41/sync-controller.mjs';
import {applyHomeCenter} from '../v41/home-center.js';
import {homePresentation} from '../v41/home-presentation.js';
import {createHomeActions} from '../v41/home-actions.js';

const readSource = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// 2026-11-07 상단 메뉴 재구성: 로그인/로그아웃 상태별 계정 표시와 트리 유무별 트리 선택 문구.

test('로그아웃 상태는 기존 로그인 알약, 로그인 상태는 첫 글자 동그라미', () => {
  const out = accountPresentation({owned: false});
  assert.equal(out.mode, 'login');
  assert.equal(out.label, '로그인');
  assert.equal(out.initial, '');
  assert.equal(out.ariaLabel, null, '로그아웃 상태에는 계정 메뉴 aria-label을 붙이지 않는다');

  const inState = accountPresentation({owned: true, email: 'kimbs5993+tutorial01@gmail.com'});
  assert.equal(inState.mode, 'avatar');
  assert.equal(inState.initial, 'K');
  assert.equal(inState.label, 'kimbs5993+tutorial01@gmail.com');
  assert.equal(inState.ariaLabel, '내 계정 메뉴, kimbs5993+tutorial01@gmail.com로 로그인됨');
});

test('계정 첫 글자는 이메일 앞부분의 첫 글자이고, 없으면 점으로 둔다', () => {
  assert.equal(firstLetter('kimbs5993+tutorial01@gmail.com'), 'K');
  assert.equal(firstLetter('  limone@example.com'), 'L');
  assert.equal(firstLetter('김범수@example.com'), '김');
  assert.equal(firstLetter(''), '·');
  assert.equal(firstLetter('   '), '·');
  assert.equal(firstLetter('+tag@example.com'), 'T', '기호는 건너뛰고 첫 글자를 쓴다');
});

test('이메일이 아직 없으면 계정 subject로 첫 글자를 만들고 표시는 내 계정으로 둔다', () => {
  const view = accountPresentation({owned: true, subject: 'padiem|user-42'});
  assert.equal(view.mode, 'avatar');
  assert.equal(view.initial, 'P');
  assert.equal(view.label, '내 계정');
  assert.equal(view.ariaLabel, '내 계정 메뉴, 내 계정로 로그인됨');
});

test('트리 선택 문구는 트리가 있으면 이름, 없으면 트리 고르기', () => {
  assert.equal(treePickerLabel('그날의 공기'), '그날의 공기');
  assert.equal(treePickerLabel(''), '트리 고르기');
  assert.equal(treePickerLabel('   '), '트리 고르기');
  assert.equal(treePickerLabel(null), '트리 고르기');
  assert.equal(treePickerLabel(undefined), '트리 고르기');
});

test('헤더 주 버튼 문구는 로그인·트리·읽기 상태를 따른다', () => {
  assert.equal(writeMenuLabel({owned: false}), '처음 시작하기');
  assert.equal(writeMenuLabel({owned: true, hasTree: false}), '새 트리 만들기');
  assert.equal(writeMenuLabel({owned: true, hasTree: true, reading: false}), '순간 남기기');
  assert.equal(writeMenuLabel({owned: true, hasTree: true, reading: true}), '순간 추가');
  assert.equal(writeMenuLabel({owned: true, hasTree: true, reading: true, dirty: true}), '미저장 기록');
  assert.equal(writeMenuLabel({owned: false, dirty: true}), '처음 시작하기', '로그아웃 상태에서는 미저장 표시를 쓰지 않는다');
});

test('첫 화면 로그아웃: 첫 버튼만 흰색 강조이고 문구는 처음 시작하기', () => {
  const plan = homeCenterState({member: 'out', treeCount: 0});
  assert.equal(plan.state, 'out');
  assert.equal(plan.buttons.length, 3, '버튼 개수는 그대로 3개');
  assert.deepEqual(plan.buttons.map(b => b.label), ['처음 시작하기', '새 트리 만들기', '내 책장']);
  assert.deepEqual(plan.buttons.map(b => b.emphasis), [true, false, false]);
  assert.deepEqual(plan.buttons.map(b => b.disabled), [false, false, false]);
});

test('첫 화면 로그인·트리 0: 이어 보던 순간은 비활성, 새 트리 만들기가 흰색', () => {
  const plan = homeCenterState({member: 'in', treeCount: 0});
  assert.equal(plan.state, 'in-empty');
  assert.deepEqual(plan.buttons.map(b => b.label), ['이어 보던 순간', '새 트리 만들기', '내 책장']);
  assert.deepEqual(plan.buttons.map(b => b.emphasis), [false, true, false]);
  assert.equal(plan.buttons[0].disabled, true);
  assert.equal(plan.buttons[0].title, '아직 이어 볼 순간이 없어요');
});

test('첫 화면 로그인·트리 있음: 이어 보던 순간이 흰색, 나머지는 보조', () => {
  const plan = homeCenterState({member: 'in', treeCount: 2});
  assert.equal(plan.state, 'in-trees');
  assert.deepEqual(plan.buttons.map(b => b.emphasis), [true, false, false]);
  assert.deepEqual(plan.buttons.map(b => b.disabled), [false, false, false]);
});

test('흰색 강조는 세 상태 모두에서 정확히 하나다', () => {
  for (const state of [{member: 'out'}, {member: 'in', treeCount: 0}, {member: 'in', treeCount: 3}]) {
    const plan = homeCenterState(state);
    assert.equal(plan.buttons.filter(b => b.emphasis).length, 1, JSON.stringify(state));
  }
});

test('로그아웃 첫 버튼의 로그인 주소는 4.1 첫 화면으로 돌아온다', () => {
  assert.equal(HOME_LOGIN_NEXT, '/v41/');
  assert.equal(homeStartLoginUrl(), '/auth/login?next=%2Fv41%2F');
  const url = new URL(homeStartLoginUrl(), 'https://lovetree-4-0.pages.dev');
  assert.equal(url.pathname, '/auth/login');
  assert.equal(url.searchParams.get('next'), '/v41/', '공용 인증이 받는 로컬 경로 형식이어야 한다');
});

test('applyHomeCenter는 실제 버튼의 문구·강조·비활성을 상태에 맞춘다', () => {
  const make = () => {
    const attrs = {};
    return {
      textContent: '', dataset: {}, disabled: false, className: '',
      classList: {
        toggle(name, on) {
          const has = this._set?.has(name);
          this._set = this._set || new Set();
          if (on) this._set.add(name); else this._set.delete(name);
          return on;
        },
        contains(name) { return !!this._set?.has(name); }
      },
      setAttribute: (k, v) => { attrs[k] = v; },
      removeAttribute: (k) => { delete attrs[k]; },
      getAttribute: (k) => attrs[k],
      _attrs: attrs
    };
  };
  const buttons = [make(), make(), make()];
  const plan = applyHomeCenter(buttons, {member: 'in', treeCount: 0});
  assert.equal(plan.state, 'in-empty');
  assert.deepEqual(buttons.map(b => b.textContent), ['이어 보던 순간', '새 트리 만들기', '내 책장']);
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0].getAttribute('aria-disabled'), 'true');
  assert.equal(buttons[0].title, '아직 이어 볼 순간이 없어요');
  assert.equal(buttons[1].classList.contains('primary-cta'), true);
  assert.equal(buttons[0].classList.contains('primary-cta'), false);
  assert.deepEqual(buttons.map(b => b.dataset.do), ['resume', 'new', 'trees']);
});

test('첫 화면 표시 상태는 로그인·트리 수를 셸 컨텍스트에서 읽는다', () => {
  const out = homePresentation({source: 'example'});
  assert.equal(out.centerState.member, 'out');
  assert.equal(out.centerState.treeCount, 0);

  const empty = homePresentation({source: 'server', tree: null, trees: []});
  assert.equal(empty.centerState.member, 'in');
  assert.equal(empty.centerState.treeCount, 0);

  const withTree = homePresentation({source: 'server', tree: {id: 't1', moments: [{id: 'm1'}]}, trees: [{id: 't1'}, {id: 't2'}]});
  assert.equal(withTree.centerState.member, 'in');
  assert.equal(withTree.centerState.treeCount, 2);
  assert.equal(withTree.canResume, false, '선택된 순간이 없으면 이어 보기를 켜지 않는다');

  const resumable = homePresentation({source: 'server', tree: {id: 't1', moments: [{id: 'm1'}]}, trees: [{id: 't1'}], momentId: 'm1'});
  assert.equal(resumable.canResume, true, '선택된 순간이 있으면 이어 보기가 가능하다');
});

test('첫 화면 로그아웃 첫 버튼은 셸에 로그인 시작을 요청한다', () => {
  const sent = [];
  const bridge = createHomeActions({getContext: () => null, send: m => sent.push(m)});
  bridge.actions.start();
  assert.deepEqual(sent, [{type: 'lt41-start'}]);
});

// #213 1번: 서버가 401이면 화면도 로그아웃으로 그린다.
test('트리 선택 글자는 로그인 상태에서만 "트리: 이름"이고 로그아웃은 "트리 고르기"다', () => {
  assert.equal(treePickerText({owned: true, treeTitle: '그날의 공기'}), '트리: 그날의 공기');
  assert.equal(treePickerText({owned: true, treeTitle: ''}), '트리 고르기');
  assert.equal(treePickerText({owned: true, treeTitle: '   '}), '트리 고르기');
  // 로그아웃이면 예시 트리가 열려 있어도 내 트리가 아니므로 이름을 보여 주지 않는다.
  assert.equal(treePickerText({owned: false, treeTitle: '좋아하는 순간들'}), '트리 고르기');
  // 브라우저에만 남은 미저장 기록은 지우지 않고 구분해 보여 준다.
  assert.equal(treePickerText({owned: false, pendingDraft: true}), '저장 안 된 기록');
  assert.equal(treePickerText({owned: false, treeTitle: '좋아하는 순간들', pendingDraft: true}), '저장 안 된 기록');
  // 로그인 상태에서는 서버 기록이 기준이다.
  assert.equal(treePickerText({owned: true, treeTitle: '그날의 공기', pendingDraft: true}), '트리: 그날의 공기');
});

test('트리 보기 탭은 로그인한 내 트리에서만 보인다', () => {
  assert.equal(treeViewsVisible({owned: true}), true);
  assert.equal(treeViewsVisible({owned: false}), false);
  // 공유로 남의 트리를 감상할 때도 숨긴다.
  assert.equal(treeViewsVisible({owned: true, publicReading: true}), false);
  assert.equal(treeViewsVisible({owned: false, publicReading: true}), false);
});

test('브라우저에만 남은 미저장 기록을 찾아낸다', () => {
  const make = entries => {
    const map = new Map(entries);
    return {
      get length() { return map.size; },
      key: index => [...map.keys()][index] ?? null,
      getItem: key => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: key => map.delete(key)
    };
  };
  const empty = make([]);
  assert.equal(hasPendingDraft(empty), false);
  assert.equal(hasPendingDraft(null), false);

  const withDraft = make([['lovetree.v41.pending-write:sub_member_a', '{"version":1}']]);
  assert.equal(hasPendingDraft(withDraft), true, '계정을 모를 때(401) 남은 키로 판단');
  assert.equal(hasPendingDraft(withDraft, 'sub_member_a'), true);
  assert.equal(hasPendingDraft(withDraft, 'sub_member_b'), false, '다른 계정의 기록은 내 것이 아니다');

  // 미저장 기록이 아닌 키는 세지 않는다.
  const other = make([['lt41.theme', 'night'], ['lt41.account.position:sub_member_a', '{}']]);
  assert.equal(hasPendingDraft(other), false);
  // 저장소를 읽을 수 없어도 던지지 않는다.
  assert.equal(hasPendingDraft({get length() { throw new Error('blocked'); }, key() { return null; }, getItem() { return null; }}), false);
});

// #213 0번 확인: #215가 로그인 안내 창(#login-start)을 없앤 뒤에도 #144
// (쓰기 중 세션 만료 → 쓰던 내용 보존 + 다시 로그인 안내 → 재로그인 후 이어서 저장)가
// 셸의 저장 실패 안내(#save-feedback)로 그대로 동작하는지 소스로 고정한다.
test('세션 만료 저장 실패는 없어진 안내 창 대신 #save-feedback으로 다시 로그인을 안내한다', () => {
  const shell = readSource('public/v41/shell.mjs');
  const index = readSource('public/v41/index.html');

  // 안내 창은 없다. 로그인이 필요한 진입점은 셸 대화상자가 아니라 바로 /auth/login으로 간다.
  assert.equal(index.includes('login-start'), false, 'index.html에 안내 창이 남음');
  assert.match(shell, /function openLoginStart\(intent='first'\)\{startLogin\(/);

  // 저장 실패가 로그인 만료이면 상단 저장 안내가 문구와 '새 창에서 로그인' 행동을 그린다.
  assert.match(shell, /const failed=status\.dirty&&\['offline','rejected','conflict','login'\]\.includes\(status\.phase\)/);
  assert.match(shell, /\$\('save-feedback'\)\.hidden=!failed/);
  assert.match(shell, /로그인이 만료되어 서버에 저장하지 못했어요\. 새 창에서 로그인한 뒤 이 탭을 새로고침하면 입력을 복원합니다\./);
  assert.match(shell, /a\.name==='login'\?'새 창에서 로그인'/);
  assert.match(shell, /window\.open\(memberLoginUrl\(readTheme\(localStorage\)\)/);

  // 입력은 지우지 않는다. 그 자리에서 백업할 수 있고, 다시 시도(재로그인 후 이어서 저장)도 남아 있다.
  assert.match(shell, /\['retry','pull','force','login'\]\.includes\(a\.name\)/);
  assert.match(shell, /b\.textContent='현재 기록 백업'/);
});
