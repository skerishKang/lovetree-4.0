// #1254 — 미리보기에는 저장 API가 없다. 대상 주소로 미리보기를 가리고,
// 저장 API에 기대는 확인을 처음부터 하지 않는다. 운영 주소는 지금처럼 전부 검사한다.
// 여기서는 순수 판별만 한다(기록·네트워크·시계 없음) — 시험이 같은 함수를 그대로 부른다.

export const PREVIEW_SKIP_DETAIL = '미리보기에는 저장 API 없음';

// *.pages.dev 미리보기 별칭: 프로젝트 도메인 앞에 배포별 이름이 한 단계 더 붙은 주소.
// 프로젝트 도메인 자체(운영 대체로 쓰는 주소)와 운영 도메인은 미리보기가 아니다.
export function isPreviewTarget(target) {
  let hostname;
  try { hostname = new URL(String(target ?? '')).hostname.toLowerCase(); }
  catch { return false; }
  return /^[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev$/.test(hostname);
}

// 저장 API 경로인지 — 이 배포에서 /api/* 는 전부 서버로 프록시되고 서버는 저장소에 기댄다.
// 주소 전체가 올 수도 있고 경로만 올 수도 있다(콘솔 오류 줄에서는 주소를 뽑아 쓴다).
export function isStorageApiUrl(value) {
  const text = String(value ?? '');
  try { return new URL(text).pathname.startsWith('/api/'); }
  catch { return text.startsWith('/api/'); }
}

// 콘솔 오류 한 줄이 '저장 API가 없어서 난 503'인지 — 503과 저장 API 주소가 함께 있어야 한다.
// 정적 자산·라우팅처럼 저장 API가 아닌 곳의 503은 여기 걸리지 않아 그대로 실패로 남는다.
export function isStorageApi503(line) {
  const text = String(line ?? '');
  if (!/\b503\b/.test(text)) return false;
  const urls = text.match(/https?:\/\/[^\s\]}"')]+/g) || [];
  return urls.some(isStorageApiUrl);
}

// 미리보기 대상에서만 저장 API 503 콘솔 줄을 건너뛴다. 운영 대상에서는 한 줄도 건너뛰지 않는다.
// 저장 API가 아닌 곳의 503은 대상과 무관하게 여기 남아 실패로 이어진다.
export function previewSkippedConsoleErrors(errors, target) {
  if (!isPreviewTarget(target)) return [];
  return (Array.isArray(errors) ? errors : []).filter(isStorageApi503);
}

// 미리보기에서 저장 API 때문에 건너뛰는 확인 목록(이슈 #1254 본문의 목록과 같다).
export const STORAGE_CHECKS = Object.freeze([
  { id: 'session-probe', area: 'auth' },
  { id: 'community-cards', area: 'community' },
  { id: 'browse-aggregates', area: 'community' },
  { id: 'youtube-oembed', area: 'youtube' },
  { id: 'youtube-caption', area: 'youtube' }
]);
