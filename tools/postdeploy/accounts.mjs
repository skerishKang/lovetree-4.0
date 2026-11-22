// 계정 번호만 받고 이메일·비밀번호는 저장소 밖 값에서 읽는다. 값은 어디에도 출력하지 않는다.
//  - 로컬1 → 02, 로컬2 → 04, 로컬3 → 01 (03은 2026-11-09 대표 결정으로 삭제 — 브라우저 프로필 노출 건)
// 번호 정규화·선택 우선순위는 tools/account-choice.mjs 한 벌(#344 대표 지시, 2026-11-10):
// --account 인자 > LT_ACCOUNT 환경변수 > 없으면 계정을 쓰는 실행은 시작 전에 멈춘다(조용한 01 기본값 없음).
import { readFileSync } from 'node:fs';
import { normaliseTestAccount } from '../account-choice.mjs';
export { chooseTestAccount } from '../account-choice.mjs';
export const LANE_ACCOUNTS = { local1: '02', local2: '04', local3: '01' };

// 저장소에는 실제 주소를 두지 않는다. 필요한 값은 실행 중에만 저장소 밖 대장에서 읽는다.
export const DEFAULT_EMAILS = { '01': '', '02': '', '04': '' };
export const ACCOUNTS_FILE_ENV = 'LOVETREE_TEST_ACCOUNTS_FILE';

export function readAccountLedger() {
  const file = process.env[ACCOUNTS_FILE_ENV];
  if (!file) throw new Error(`${ACCOUNTS_FILE_ENV}가 없습니다. 저장소 밖 대장 경로를 환경 변수로 지정하세요.`);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`${ACCOUNTS_FILE_ENV}가 가리키는 대장을 읽을 수 없습니다.`);
  }
  const values = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2]) values[m[1]] = m[2];
  }
  return values;
}

export function normaliseAccount(value) {
  return normaliseTestAccount(value, '--account');
}

export function accountSecretKeys(account) {
  const suffix = normaliseAccount(account);
  return { email: `PADIEM_TUTORIAL${suffix}_EMAIL`, password: `PADIEM_TUTORIAL${suffix}_PASSWORD` };
}

export function ledgerEmail(account) {
  const key = accountSecretKeys(account).email;
  const value = readAccountLedger()[key];
  if (!value) throw new Error(`대장에 ${key} 값이 없습니다.`);
  return value.trim();
}

// 같은 계정을 두 창이 동시에 쓰면 세션이 엉킨다. 계정마다 프로필 폴더를 따로 둔다.
export function defaultProfileFor(account, baseDir) {
  const suffix = normaliseAccount(account);
  return suffix === '01' ? `${baseDir}/.profile` : `${baseDir}/.profile-${suffix}`;
}

export function laneFor(account) {
  let suffix;
  try { suffix = normaliseAccount(account); } catch { return ''; }
  return Object.keys(LANE_ACCOUNTS).find((lane) => LANE_ACCOUNTS[lane] === suffix) || '';
}
