// #949: 첫 화면 가운데 안전 구역 — 가드(src/views/orbit.js)와 겹침 시험(v41-orbit-535)이 같은 함수를 쓴다.
// 구역은 가운데 덩어리(.center: 눈썹~h1~문구~단추~숫자 줄)의 실제 사각형 + 여백 32px 뿐이다.
// 글꼴이 늦게 도착해 덩어리가 자라면 ResizeObserver·fonts.ready 뒤 다시 재서 같은 값이 된다.
// 순수 함수만 둔다 — 시험은 이 함수의 소스를 페이지에 그대로 넣어 쓴다(toString).
export const SAFE_MARGIN = 32;

export function safeZoneOf(centerRect, appRect) {
  if (!centerRect || !appRect) return null;
  return {
    l: centerRect.left - appRect.left - SAFE_MARGIN,
    t: centerRect.top - appRect.top - SAFE_MARGIN,
    r: centerRect.right - appRect.left + SAFE_MARGIN,
    b: centerRect.bottom - appRect.top + SAFE_MARGIN
  };
}

export function zoneOverlapArea(zone, r) {
  if (!zone) return 0;
  return Math.max(0, Math.min(zone.r, r.r) - Math.max(zone.l, r.l)) * Math.max(0, Math.min(zone.b, r.b) - Math.max(zone.t, r.t));
}