// 계정 번호 → 비밀값 키·프로필 폴더 규칙. 실제 주소는 테스트에도 두지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LANE_ACCOUNTS, DEFAULT_EMAILS, ACCOUNTS_FILE_ENV, readAccountLedger, ledgerEmail, normaliseAccount, accountSecretKeys, defaultProfileFor, laneFor } from '../tools/postdeploy/accounts.mjs';

const RESERVED = 'xxx@example.test';

test('배정 표: 로컬1 → 02, 로컬2 → 04, 로컬3 → 01', () => {
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
  assert.throws(() => normaliseAccount(undefined), /01·02·04/);
  for (const bad of ['03', '033', '00', 'abc', '2a']) assert.throws(() => normaliseAccount(bad), /01·02·04/);
});

test('계정마다 다른 비밀값 키를 읽고 저장소에는 실제 주소를 두지 않는다', () => {
  assert.deepEqual(accountSecretKeys('02'), { email: 'PADIEM_TUTORIAL02_EMAIL', password: 'PADIEM_TUTORIAL02_PASSWORD' });
  assert.deepEqual(accountSecretKeys('4'), { email: 'PADIEM_TUTORIAL04_EMAIL', password: 'PADIEM_TUTORIAL04_PASSWORD' });
  assert.deepEqual(DEFAULT_EMAILS, { '01': '', '02': '', '04': '' });
  assert.equal('03' in DEFAULT_EMAILS, false, '삭제된 03의 자리는 남기지 않는다');
});

test('실제 계정은 저장소 밖 대장에서 읽고 경로 환경 변수가 없으면 멈춘다', () => {
  const saved = process.env[ACCOUNTS_FILE_ENV];
  const dir = mkdtempSync(join(tmpdir(), 'lt-ledger-'));
  try {
    delete process.env[ACCOUNTS_FILE_ENV];
    assert.throws(() => readAccountLedger(), new RegExp(ACCOUNTS_FILE_ENV), '경로가 없으면 분명한 오류');
    const file = join(dir, 'ledger.env');
    writeFileSync(file, `PADIEM_TUTORIAL02_EMAIL=${RESERVED}\n`, 'utf8');
    process.env[ACCOUNTS_FILE_ENV] = file;
    assert.equal(ledgerEmail('02'), RESERVED);
    assert.throws(() => ledgerEmail('04'), /PADIEM_TUTORIAL04_EMAIL/, '대장에 없는 계정은 멈춘다');
  } finally {
    if (saved === undefined) delete process.env[ACCOUNTS_FILE_ENV];
    else process.env[ACCOUNTS_FILE_ENV] = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('계정마다 다른 브라우저 프로필을 써서 두 실행이 동시에 돌아도 세션이 엉키지 않는다', () => {
  assert.equal(defaultProfileFor('01', '/tools/postdeploy'), '/tools/postdeploy/.profile');
  assert.equal(defaultProfileFor('02', '/tools/postdeploy'), '/tools/postdeploy/.profile-02');
  assert.equal(defaultProfileFor('04', '/tools/postdeploy'), '/tools/postdeploy/.profile-04');
  assert.notEqual(defaultProfileFor('02', '/x'), defaultProfileFor('04', '/x'));
});
