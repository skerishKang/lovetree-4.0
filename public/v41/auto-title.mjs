// #707: 자동 제목('<도메인>에서 간직한 순간') 규칙 한 벌. 다른 파일을 import하지 않는 순수 모듈이라
// domain·book-usability·title-backfill이 함께 불러 써도 순환 import이 생기지 않는다(#694와 같은 '한 벌' 취지).

/** 자동 생성 제목: "<도메인>에서 간직한 순간" (예: "youtu.be에서 간직한 순간"). 정확히 일치할 때만 자동으로 본다. */
export const AUTO_TITLE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?에서 간직한 순간$/i;

/** 자동 생성 제목인지 — 정확히 일치할 때만 true(사람이 쓴 한글 제목은 false). */
export function isAutoTitle(title) {
  return AUTO_TITLE.test(String(title ?? '').trim());
}

/** 주소에서 자동 제목 문구를 만든다(#647 규칙 — suggestMomentTitle의 기본 문구와 같다). */
export function autoTitleFor(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  return `${host || '링크'}에서 간직한 순간`;
}
