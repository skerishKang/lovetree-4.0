import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chooseTestAccount, normaliseTestAccount } from '../tools/account-choice.mjs';

// #344(2026-11-10 대표 지시): 도구의 계정 선택 한 벌 — --account 인자 > LT_ACCOUNT 환경변수 >
// 둘 다 없으면 계정을 쓰는 실행은 시작 전에 멈춘다(기본 계정 01로 조용히 넘어가지 않는다, #300 레인 계정 규칙).
// a11y 검사는 항상 계정으로 로그인하고, postdeploy는 --auto-login·--auth-flows가 계정을 쓴다.
// 판정 함수는 직접 호출하고, 도구 가드는 실제 실행(child_process)으로 확인한다(docs/TESTING.md).

const run = promisify(execFile);
const HERE = fileURLToPath(new URL('..', import.meta.url));
const spawn = (args, env = {}) => run(process.execPath, args, {
  cwd: HERE,
  env: { ...process.env, LT_ACCOUNT: env.LT_ACCOUNT ?? '' },
  timeout: 30000,
  windowsHide: true,
});

test('선택 우선순위: 인자 > 환경변수 > 없음(빈 문자열)', () => {
  assert.equal(chooseTestAccount({ arg: '02', env: '04' }), '02', '인자가 환경변수보다 우선한다');
  assert.equal(chooseTestAccount({ arg: '', env: '04' }), '04', '환경변수도 계정 선택이다');
  assert.equal(chooseTestAccount({ arg: '4' }), '04', '1자리 표기도 같은 계정으로 맞춘다');
  assert.equal(chooseTestAccount({ arg: 'tutorial02' }), '02', 'tutorial 접두 표기도 같은 계정으로 맞춘다');
  assert.equal(chooseTestAccount({}), '', '둘 다 없으면 선택 없음 — 도구가 계정을 쓰면 여기서 멈춘다');
  assert.equal(chooseTestAccount({ arg: '  ', env: '  ' }), '', '공백 값도 선택 없음');
});

test('정규화: 01·02·04만 받고 03(폐기)·빈 값은 거절한다', () => {
  assert.equal(normaliseTestAccount('1'), '01');
  assert.equal(normaliseTestAccount('02'), '02');
  assert.equal(normaliseTestAccount('tutorial04'), '04');
  for (const bad of ['03', '033', '00', 'abc', '2a']) {
    assert.throws(() => normaliseTestAccount(bad), /01·02·04/, `${bad} 은 거절`);
  }
  assert.throws(() => normaliseTestAccount(''), /빈 값/, '빈 값 선택은 조용한 01로 넘어가지 않는다');
  assert.throws(() => chooseTestAccount({ env: '03' }), /LT_ACCOUNT/, '환경변수 출처를 오류 메시지에 남긴다');
});

test('a11y: 인자·환경변수 둘 다 없으면 브라우저를 띄우기 전에 멈춘다', async () => {
  await assert.rejects(
    spawn(['tools/a11y/a11y-run.mjs', '--state', 'out']),
    (error) => {
      assert.equal(error.code, 2, '종료 코드 2(시작 전 정지)');
      assert.match(String(error.stderr), /시험 계정을 정하지 못했/);
      assert.doesNotMatch(String(error.stdout), /로그인 확인 완료/, '검사를 시작하지 않는다');
      assert.doesNotMatch(String(error.stdout), /검사 \d+건/, '전수 검사를 돌리지 않는다');
      return true;
    },
  );
});

test('a11y: 잘못된 계정 인자(폐기된 03)도 거절한다', async () => {
  await assert.rejects(
    spawn(['tools/a11y/a11y-run.mjs', '--account', '03', '--state', 'out']),
    (error) => {
      assert.match(String(error.stderr), /01·02·04/);
      return true;
    },
  );
});

test('postdeploy: --auto-login·--auth-flows는 계정이 없으면 시작 전에 멈춘다', async () => {
  for (const mode of ['--auto-login', '--auth-flows']) {
    await assert.rejects(
      spawn(['tools/postdeploy/postdeploy.mjs', 'https://example.test/v41/', mode]),
      (error) => {
        assert.match(String(error.stderr), /시험 계정이 필요합니다/);
        assert.doesNotMatch(String(error.stdout), /시험 계정으로 자동 로그인/, '로그인을 시도하지 않는다');
        return true;
      },
    );
  }
});

test('postdeploy: 인자가 우선이다 — env(04)가 있어도 잘못된 인자(03)로 거절한다', async () => {
  await assert.rejects(
    spawn(['tools/postdeploy/postdeploy.mjs', 'https://example.test/v41/', '--auto-login', '--account', '03'], { LT_ACCOUNT: '04' }),
    (error) => {
      assert.match(String(error.stderr), /01·02·04 중 하나여야 합니다: 03/, '인자를 먼저 검사한다(env로 대체하지 않는다)');
      return true;
    },
  );
});

test('배선: 두 도구 모두 한 벌의 판정을 쓰고 조용한 기본 계정이 남지 않는다(글자 검사)', () => {
  const a11y = readFileSync(new URL('../tools/a11y/a11y-run.mjs', import.meta.url), 'utf8');
  const postdeploy = readFileSync(new URL('../tools/postdeploy/postdeploy.mjs', import.meta.url), 'utf8');
  const accounts = readFileSync(new URL('../tools/postdeploy/accounts.mjs', import.meta.url), 'utf8');
  const choice = readFileSync(new URL('../tools/account-choice.mjs', import.meta.url), 'utf8');
  assert.match(a11y, /chooseTestAccount\(\{ arg: options\.account, env: process\.env\.LT_ACCOUNT \}\)/);
  assert.match(a11y, /secrets\(options\.secrets, options\.account\)/, '시크릿 키도 선택된 계정에서 온다');
  assert.match(a11y, /account: options\.account,/, '보고서 계정도 선택된 계정이다');
  assert.doesNotMatch(a11y, /process\.env\.LT_ACCOUNT \|\| '01'/, 'env 기본값 01 함정을 남기지 않는다');
  assert.match(postdeploy, /chooseTestAccount\(\{ arg: opts\.account, env: process\.env\.LT_ACCOUNT \}\)/);
  assert.match(postdeploy, /opts\.autoLogin \|\| opts\.authFlows\) throw new Error\('--auto-login·--auth-flows는 시험 계정이 필요합니다/, '계정을 쓰는 모드만 멈춘다');
  assert.doesNotMatch(postdeploy, /account: '01',/, '조용한 기본 계정 기본값을 남기지 않는다');
  assert.match(accounts, /normaliseTestAccount\(value, '--account'\)/, '정규화도 한 벌을 쓴다');
  assert.doesNotMatch(accounts, /return '01'; \/\/ 옵션을 안 주면/, '조용한 01 기본값 주석·분기를 남기지 않는다');
  assert.match(choice, /ALLOWED = new Set\(\['01', '02', '04'\]\)/, '허용 계정은 레인 배정(01·02·04)과 같다');
});
