// 레인별 전용 시험 계정(#300). 계정 번호 → .secrets 키·프로필 폴더 규칙.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANE_ACCOUNTS, DEFAULT_EMAILS, normaliseAccount, accountSecretKeys, defaultProfileFor, laneFor } from '../tools/postdeploy/accounts.mjs';

test('레인 배정 표: 로컬1 → 02, 로컬2 → 03, 로컬3 → 01', () => {
  assert.deepEqual(LANE_ACCOUNTS, { local1: '02', local2: '03', local3: '01' });
  assert.equal(laneFor('02'), 'local1');
  assert.equal(laneFor('1'), 'local3');
  assert.equal(laneFor('09'), '');
});

test('계정 번호는 01·02·03만 받고 1·tutorial2 표기도 같은 번호로 맞춘다', () => {
  assert.equal(normaliseAccount('1'), '01');
  assert.equal(normaliseAccount('02'), '02');
  assert.equal(normaliseAccount('tutorial03'), '03');
  assert.equal(normaliseAccount(undefined), '01');
  for (const bad of ['04', '00', 'abc', '2a']) assert.throws(() => normaliseAccount(bad), /01·02·03/);
});

test('계정마다 다른 .secrets 키를 읽고 값은 기본값으로 새지 않는다', () => {
  assert.deepEqual(accountSecretKeys('02'), { email: 'PADIEM_TUTORIAL02_EMAIL', password: 'PADIEM_TUTORIAL02_PASSWORD' });
  assert.deepEqual(accountSecretKeys('3'), { email: 'PADIEM_TUTORIAL03_EMAIL', password: 'PADIEM_TUTORIAL03_PASSWORD' });
  // 01만 예전 고정 주소를 기본값으로 쓴다(지금까지 동작 보존). 02·03은 .secrets 값이 없으면 빈 문자열 → 로그인 건너뜀.
  assert.equal(DEFAULT_EMAILS['01'], 'kimbs5993+tutorial01@gmail.com');
  assert.equal(DEFAULT_EMAILS['02'], '');
  assert.equal(DEFAULT_EMAILS['03'], '');
});

test('계정마다 다른 브라우저 프로필을 써서 두 레인이 동시에 돌아도 세션이 엉키지 않는다', () => {
  assert.equal(defaultProfileFor('01', '/tools/postdeploy'), '/tools/postdeploy/.profile');
  assert.equal(defaultProfileFor('02', '/tools/postdeploy'), '/tools/postdeploy/.profile-02');
  assert.equal(defaultProfileFor('03', '/tools/postdeploy'), '/tools/postdeploy/.profile-03');
  assert.notEqual(defaultProfileFor('02', '/x'), defaultProfileFor('03', '/x'));
});
