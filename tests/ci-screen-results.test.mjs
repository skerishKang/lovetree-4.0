import test from 'node:test';
import assert from 'node:assert/strict';
import { checkScreenResults } from '../tools/ci/screen-results.mjs';

const SCREENS = ['screen-board', 'screen-home', 'screen-book', 'screen-reload', 'screen-shell', 'screen-map-a', 'screen-map-b', 'screen-book-screen', 'screen-audit-a', 'screen-audit-b', 'screen-audit-c'];
const gate = (result, changed) => ({ result, outputs: { changed } });
const results = (screenResult, gateResult = gate('success', 'false')) => {
  const needs = { 'screen-changes': gateResult };
  for (const name of SCREENS) needs[name] = { result: screenResult };
  needs.deploy = { result: 'success' };
  return needs;
};

test('안 바뀜 판정이면 화면 잡이 모두 건너뛰어도 통과한다', () => {
  const r = checkScreenResults(results('skipped', gate('success', 'false')));
  assert.equal(r.ok, true, JSON.stringify(r.failures));
  assert.deepEqual(r.failures, []);
});

test('바뀜 판정인데 화면 잡 하나가 건너뛰면 실패한다', () => {
  const needs = results('success', gate('success', 'true'));
  needs['screen-home'] = { result: 'skipped' };
  const r = checkScreenResults(needs);
  assert.equal(r.ok, false);
  assert.ok(r.failures.some(line => line.includes('screen-home')), JSON.stringify(r.failures));
});

test('판정 잡이 취소되면 화면 잡이 모두 건너뛰어도 실패한다', () => {
  const r = checkScreenResults(results('skipped', gate('cancelled', 'false')));
  assert.equal(r.ok, false);
  assert.ok(r.failures.some(line => line.includes('screen-changes')), JSON.stringify(r.failures));
});

test('바뀜 판정이고 화면 잡이 모두 성공이면 통과한다', () => {
  const r = checkScreenResults(results('success', gate('success', 'true')));
  assert.equal(r.ok, true, JSON.stringify(r.failures));
});
