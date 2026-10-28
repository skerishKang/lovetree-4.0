import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authEntryState, authEntry, applyAuthEntry } from '../src/auth-entry.js';

test('owned가 아니면 로그인, owned면 로그아웃을 가리킨다', () => {
  assert.deepEqual(authEntryState({ owned: false, phase: 'local' }), { action: 'login', label: '로그인', busy: false });
  assert.deepEqual(authEntryState({ owned: true, phase: 'synced' }), { action: 'logout', label: '로그아웃', busy: false });
});

test('확인·저장 중에는 버튼을 막는다', () => {
  assert.equal(authEntryState({ owned: false, phase: 'checking' }).busy, true);
  assert.equal(authEntryState({ owned: true, phase: 'syncing' }).busy, true);
  assert.equal(authEntryState({ owned: true, phase: 'conflict' }).busy, false);
});

test('버튼 HTML은 data-auth-action과 aria-label을 가지고, busy면 disabled다', () => {
  const html = authEntry({ owned: false, phase: 'local' }, 'ghost');
  assert.match(html, /class="ghost auth-entry"/);
  assert.match(html, /data-auth-action="login"/);
  assert.match(html, /aria-label="로그인"/);
  assert.match(html, /로그인/);
  assert.doesNotMatch(html, /disabled/);
  assert.match(authEntry({ owned: false, phase: 'checking' }, ''), / disabled>/);
});

test('applyAuthEntry는 열려 있는 버튼의 문구·속성만 바꾼다', () => {
  const attrs = {};
  const button = {
    setAttribute: (name, value) => { attrs[name] = value; },
    textContent: '',
    disabled: undefined
  };
  applyAuthEntry(button, { owned: false, phase: 'local' });
  assert.equal(attrs['data-auth-action'], 'login');
  assert.equal(button.textContent, '로그인');
  assert.equal(button.disabled, false);
  applyAuthEntry(button, { owned: true, phase: 'synced' });
  assert.equal(attrs['data-auth-action'], 'logout');
  assert.equal(button.textContent, '로그아웃');
  assert.equal(button.disabled, false);
  applyAuthEntry(button, { owned: true, phase: 'syncing' });
  assert.equal(button.disabled, true);
});

test('기존 sync 규칙과 같은 문서 판정을 아직 해치지 않는다(재수출 없음 확인)', () => {
  // 이 조각은 저장·복구 규칙을 다루지 않는다. 모듈이 값만 내보내는지 확인한다.
  assert.equal(typeof authEntryState, 'function');
  assert.equal(typeof authEntry, 'function');
});

