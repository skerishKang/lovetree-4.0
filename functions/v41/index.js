// /v41/ — 개발 주소(*.pages.dev)에서 앱 문서에 X-Robots-Tag noindex 를 붙인다(#541).
// 운영 주소는 검색 대상이라 손대지 않고 정적 자산을 그대로 돌려준다.
// robots.txt 의 전면 차단(개발 주소)과 두 겹으로 막는 용도다.
import { isProductionHost } from '../_lib/search-meta.mjs';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (isProductionHost(url.hostname) || request.method !== 'GET') return next();
  const response = await env.ASSETS.fetch(new Request(new URL('/v41/', url.origin), request));
  if (!response.ok) return response;
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex');
  headers.delete('content-length');
  return new Response(html, { status: response.status, headers });
}
