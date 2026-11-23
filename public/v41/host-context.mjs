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
