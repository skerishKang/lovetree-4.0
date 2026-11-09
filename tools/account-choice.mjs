// 시험 계정 선택 한 벌(2026-11-10 대표 지시 — #300 레인 계정 규칙 보강).
//
// 우선순위: --account 인자 > LT_ACCOUNT 환경변수 > (선택 없음).
// 선택 없이 계정을 쓰는 실행(자동 로그인·a11y 검사 등)은 시작 전에 멈춘다 —
// 기본 계정(01)으로 조용히 넘어가지 않는다. 두 레인이 같은 계정을 쓰면 세션이 엉키고
// 정리가 상대 트리를 지운다(#300: 레인별 전용 계정).
//
// 03은 2026-11-09 대표 결정으로 삭제됐다(브라우저 프로필 노출 건) — 다시 쓰지 못하게 막는다.
const ALLOWED = new Set(['01', '02', '04']);

export function normaliseTestAccount(value, source = '--account') {
  const raw = String(value ?? '').trim().replace(/^tutorial/i, '');
  const text = raw.padStart(2, '0');
  if (!ALLOWED.has(text)) {
    throw new Error(`${source} 값은 01·02·04 중 하나여야 합니다${raw ? `: ${value}` : ' (빈 값)'}`);
  }
  return text;
}

// 인자·환경변수로 선택한 계정을 돌려준다. 둘 다 없으면 ''(선택 없음) — 호출 도구가
// 계정을 쓰는 실행인지 판정해 ''이면 시작 전에 멈춘다.
export function chooseTestAccount({ arg = '', env = '' } = {}) {
  const given = String(arg ?? '').trim();
  if (given) return normaliseTestAccount(given, '--account');
  const fromEnv = String(env ?? '').trim();
  if (fromEnv) return normaliseTestAccount(fromEnv, 'LT_ACCOUNT');
  return '';
}
