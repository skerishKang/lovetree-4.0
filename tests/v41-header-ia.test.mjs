import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountPresentation, firstLetter, treePickerLabel, writeMenuLabel,
  homeCenterState, homeStartLoginUrl, HOME_LOGIN_NEXT
} from '../public/v41/header-state.mjs';
import {applyHomeCenter} from '../v41/home-center.js';
import {homePresentation} from '../v41/home-presentation.js';
import {createHomeActions} from '../v41/home-actions.js';

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
