// 레인별 전용 시험 계정(#300, 2026-11-09 대표 결정으로 03 삭제·04 신설). 계정 번호 → .secrets 키·프로필 폴더 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_ACCOUNTS, DEFAULT_EMAILS, normaliseAccount, accountSecretKeys, defaultProfileFor, laneFor } from '../tools/postdeploy/accounts.mjs';

test('레인 배정 표: 로컬1 → 02, 로컬2 → 04, 로컬3 → 01', () => {
  assert.deepEqual(LANE_ACCOUNTS, { local1: '02', local2: '04', local3: '01' });
  assert.equal(laneFor('02'), 'local1');
  assert.equal(laneFor('04'), 'local2');
  assert.equal(laneFor('1'), 'local3');
  assert.equal(laneFor('09'), '');
});

test('계정 번호는 01·02·04만 받고 1·tutorial4 표기도 같은 번호로 맞춘다', () => {
  assert.equal(normaliseAccount('1'), '01');
  assert.equal(normaliseAccount('02'), '02');
  assert.equal(normaliseAccount('tutorial04'), '04');
  // 2026-11-11(#344): 빈 값은 더 이상 조용한 01이 아니다 — 선택 없음은 시작 전에 멈춘다(tools/account-choice.mjs).
  assert.throws(() => normaliseAccount(undefined), /01·02·04/);
  // 03은 2026-11-09 대표 결정으로 삭제됐다(브라우저 프로필 노출 건) — 다시 쓰지 못하게 막는다.
  for (const bad of ['03', '033', '00', 'abc', '2a']) assert.throws(() => normaliseAccount(bad), /01·02·04/);
});

test('계정마다 다른 .secrets 키를 읽고 값은 기본값으로 새지 않는다', () => {
  assert.deepEqual(accountSecretKeys('02'), { email: 'PADIEM_TUTORIAL02_EMAIL', password: 'PADIEM_TUTORIAL02_PASSWORD' });
  assert.deepEqual(accountSecretKeys('4'), { email: 'PADIEM_TUTORIAL04_EMAIL', password: 'PADIEM_TUTORIAL04_PASSWORD' });
  // 01만 예전 고정 주소를 기본값으로 쓴다(지금까지 동작 보존). 02·04는 .secrets 값이 없으면 빈 문자열 → 로그인 건너뜀.
  assert.equal(DEFAULT_EMAILS['01'], 'kimbs5993+tutorial01@gmail.com');
  assert.equal(DEFAULT_EMAILS['02'], '');
  assert.equal(DEFAULT_EMAILS['04'], '');
  assert.equal('03' in DEFAULT_EMAILS, false, '삭제된 03의 자리는 남기지 않는다');
});

test('계정마다 다른 브라우저 프로필을 써서 두 레인이 동시에 돌아도 세션이 엉키지 않는다', () => {
  assert.equal(defaultProfileFor('01', '/tools/postdeploy'), '/tools/postdeploy/.profile');
  assert.equal(defaultProfileFor('02', '/tools/postdeploy'), '/tools/postdeploy/.profile-02');
  assert.equal(defaultProfileFor('04', '/tools/postdeploy'), '/tools/postdeploy/.profile-04');
  assert.notEqual(defaultProfileFor('02', '/x'), defaultProfileFor('04', '/x'));
});
