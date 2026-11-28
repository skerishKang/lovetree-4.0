import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTABLE_JOBS } from '../tools/ci/screen-changes.mjs';
import { checkScreenResults } from '../tools/ci/screen-results.mjs';

const SCREENS = SELECTABLE_JOBS;
const gate = (result, changed) => ({ result, outputs: { changed, jobs: changed === 'true' ? 'all' : 'none' } });
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


test('화면 변경 시 모든 선택 잡이 skipped이면 모음 검사는 반드시 실패한다', () => {
  const needs = results('skipped', gate('success','true'));
  needs.runner_picker = { result: 'success' };
  const result = checkScreenResults(needs);
  assert.equal(result.ok,false);
  assert.equal(result.failures.filter(x=>x.includes('changed screen job skipped')).length,SCREENS.length);
});

test('선택기 실패 또는 취소 이후 GitHub에서 화면 시험이 전부 통과하면 모음 검사도 통과한다', () => {
  for (const picker of ['failure','cancelled']) {
    const needs=results('success',gate('success','true'));
    needs.runner_picker={result:picker};
    const result=checkScreenResults(needs);
    assert.equal(result.ok,true,JSON.stringify(result.failures));
  }
});

test('unknown future screen job failure and cancellation cannot be ignored', () => {
  for (const status of ['failure', 'cancelled']) {
    const needs = results('success', gate('success', 'true'));
    needs['screen-future'] = { result: status };
    const outcome = checkScreenResults(needs);
    assert.equal(outcome.ok, false);
    assert.ok(outcome.failures.some(reason => reason.includes('screen-future')));
  }
});
