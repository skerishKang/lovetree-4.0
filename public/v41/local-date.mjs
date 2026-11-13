// #547: 지역 날짜 규칙은 local-date.js 한 벌에 있다(클래식 스크립트 보드도 같은 파일을 읽는다).
// 모듈들은 이 파일을 통해서만 그 한 벌을 쓴다 — 규칙이 두 벌로 갈라지지 않게.
import './local-date.js';

/**
 * 기기의 지역 날짜를 'YYYY-MM-DD'로 돌려준다.
 * @param {Date|number|string} [clock] 기준 시각(기본값: 지금). 잘못된 값이면 지금으로 본다.
 */
export function localDateOnly(clock) {
  return globalThis.LTLocalDate.localDateOnly(clock);
}

/**
 * #549: 두 시각 사이가 기기 지역 날짜(#547) 기준으로 며칠 차이인지 돌려준다.
 * @param {Date|number|string} [fromClock] 기준 시각(기본값: 지금)
 * @param {Date|number|string} toClock 비교할 시각
 */
export function localDaysBetween(fromClock, toClock) {
  return globalThis.LTLocalDate.localDaysBetween(fromClock, toClock);
}

/**
 * #549: 일수를 사람 말로 ('오늘'·'어제'·'N일 전').
 * @param {number} days 지역 날짜 기준 일수
 */
export function relativeDayLabel(days) {
  return globalThis.LTLocalDate.relativeDayLabel(days);
}
