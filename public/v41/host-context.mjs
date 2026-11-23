// #791: 미리보기 전용 예시·체험 안내를 위한 호스트 판정(브라우저에서 그대로 쓸 수 있는 순수 모듈).
// 운영 주소는 어떤 경우에도 미리보기가 아니다.
export const PRODUCTION_HOST = 'lovetree.padiem.net';
export const PREVIEW_ROOT_HOST = 'lovetree-4-0.pages.dev';
export const PREVIEW_HOST_SUFFIX = '.lovetree-4-0.pages.dev';

export function isProductionHost(hostname = '') {
  return String(hostname ?? '').trim().toLowerCase() === PRODUCTION_HOST;
}

export function isPagesPreviewHost(hostname = globalThis.location?.hostname || '') {
  const host = String(hostname ?? '').trim().toLowerCase();
  if (!host || isProductionHost(host)) return false;
  return host === PREVIEW_ROOT_HOST || host.endsWith(PREVIEW_HOST_SUFFIX);
}

// 미리보기 배포 자동 검사도 같은 호스트를 쓴다. 사람이 체험을 켤 때만 예시를 얹는다.
// 운영 주소에서는 질의 값과 무관하게 절대 켜지지 않는다.
export function hasPreviewExamples(hostname = globalThis.location?.hostname || '', search = globalThis.location?.search || '') {
  if (!isPagesPreviewHost(hostname)) return false;
  try { return new URLSearchParams(String(search ?? '')).get('lt791') === '1'; } catch { return false; }
}
