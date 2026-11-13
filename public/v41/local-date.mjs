// #547: '오늘' 날짜는 사용자 기기의 지역 날짜로 만든다.
// 예전에는 new Date().toISOString().slice(0, 10) 으로 만들었는데, toISOString은 UTC 날짜라
// 한국 시간 0시~9시(UTC 전날 15시~24시)에는 하루 전 날짜가 됐다(새벽에 남긴 순간이 어제로 찍힘).
// 지역 연·월·일을 그대로 읽어 'YYYY-MM-DD'로 적는다 — 기기 시간대가 어디든 그 기기의 오늘이 된다.
const pad2 = (value) => String(value).padStart(2, '0');

/**
 * 기기의 지역 날짜를 'YYYY-MM-DD'로 돌려준다.
 * @param {Date|number|string} [clock] 기준 시각(기본값: 지금). 잘못된 값이면 지금으로 본다.
 */
export function localDateOnly(clock = new Date()) {
  const at = clock instanceof Date ? clock : new Date(clock);
  const date = Number.isNaN(at.getTime()) ? new Date() : at;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
