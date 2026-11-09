// 레인별 전용 시험 계정(#300, 대표 지시 2026-11-09; 2026-11-09 밤 계정 03 삭제·04 신설 — 대표 결정).
// 계정 번호만 받고 이메일·비밀번호는 .secrets 에서 읽는다. 값은 어디에도 출력하지 않는다.
//  - 로컬1 → 02, 로컬2 → 04, 로컬3 → 01 (03은 2026-11-09 대표 결정으로 삭제 — 브라우저 프로필 노출 건)
// 번호 정규화·선택 우선순위는 tools/account-choice.mjs 한 벌(#344 대표 지시, 2026-11-10):
// --account 인자 > LT_ACCOUNT 환경변수 > 없으면 계정을 쓰는 실행은 시작 전에 멈춘다(조용한 01 기본값 없음).
import { normaliseTestAccount } from '../account-choice.mjs';
export { chooseTestAccount } from '../account-choice.mjs';
export const LANE_ACCOUNTS = { local1: '02', local2: '04', local3: '01' };

// 01은 예전과 같은 고정 주소를 기본값으로 둔다(.secrets 에 이메일이 없어도 지금까지대로 동작).
export const DEFAULT_EMAILS = { '01': 'kimbs5993+tutorial01@gmail.com', '02': '', '04': '' };

export function normaliseAccount(value) {
  // 빈 값은 더 이상 조용한 01이 아니다 — 선택이 없으면 호출 도구가 계정을 쓰는 실행인지 판정해 멈춘다(#344).
  return normaliseTestAccount(value, '--account');
}

export function accountSecretKeys(account) {
  const suffix = normaliseAccount(account);
  return { email: `PADIEM_TUTORIAL${suffix}_EMAIL`, password: `PADIEM_TUTORIAL${suffix}_PASSWORD` };
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
