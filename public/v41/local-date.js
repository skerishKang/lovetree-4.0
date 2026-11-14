// #547: '오늘' 날짜는 사용자 기기의 지역 날짜로 만든다.
// 예전에는 new Date().toISOString().slice(0, 10) 으로 만들었는데, toISOString은 UTC 날짜라
// 한국 시간 0시~9시(UTC 전날 15시~24시)에는 하루 전 날짜가 됐다(새벽에 남긴 순간이 어제로 찍힘).
// 지역 연·월·일을 그대로 읽어 'YYYY-MM-DD'로 적는다 — 기기 시간대가 어디든 그 기기의 오늘이 된다.
//
// 규칙은 이 파일 한 벌뿐이다. 클래식 스크립트(보드 board.*)도 이 파일을 그대로 읽고,
// 모듈은 local-date.mjs가 이 한 벌을 그대로 내보낸다(두 벌로 갈라지지 않게).
(function (root) {
  const pad2 = (value) => String(value).padStart(2, '0');

  // 기기의 지역 날짜를 'YYYY-MM-DD'로 돌려준다. clock은 기준 시각(기본값: 지금), 잘못된 값이면 지금으로 본다.
  function localDateOnly(clock) {
    const at = clock === undefined ? new Date() : clock instanceof Date ? clock : new Date(clock);
    const date = Number.isNaN(at.getTime()) ? new Date() : at;
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  // #549: 지난 날 안내('마지막 순간 · N일 전')의 일수를 기기 지역 날짜(#547) 기준으로 세는 한 벌.
  // 예전에는 (Date.now()-raw)/86400000의 floor라 UTC 기준이었고, 새벽을 넘은 순간 '0일 전'·'1일 전'이
  // 하루 밀려 보였다. from(기준 시각, 기본값 지금)과 to(순간 시각)의 지역 날짜가 며칠 차이인지 돌려준다.
  // 잘못된 시각은 localDateOnly와 같은 규칙으로 지금으로 본다.
  function localDaysBetween(fromClock, toClock) {
    const day = (clock) => Date.parse(`${localDateOnly(clock)}T00:00:00`);
    return Math.round((day(fromClock === undefined ? new Date() : fromClock) - day(toClock)) / 86400000);
  }

  // #549: 일수를 사람 말로. 0일은 '오늘', 1일은 '어제', 그 뒤는 'N일 전'. 미래 시각(시계 차이)도 '오늘'.
  function relativeDayLabel(days) {
    const count = Number(days);
    if (!Number.isFinite(count) || count <= 0) return '오늘';
    if (count === 1) return '어제';
    return `${count}일 전`;
  }

  root.LTLocalDate = {localDateOnly, localDaysBetween, relativeDayLabel};
})(typeof window !== 'undefined' ? window : globalThis);
