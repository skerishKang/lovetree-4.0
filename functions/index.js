// Serve 4.1 at the custom host root; the pages.dev root remains 4.0.
// #541: 개발 주소(*.pages.dev)는 검색 제외 — 루트(4.0) 문서에 X-Robots-Tag noindex 를 붙인다.
// 운영 주소 루트는 기존처럼 /v41/ 앱 문서로 바꿔 serve 한다. 검색을 열기 전(SEARCH_OPEN=false)에는 여기도 noindex.
import { isProductionHost, isSearchOpenHost } from './_lib/search-meta.mjs';

export async function onRequest({request,next,env}) {
 const url=new URL(request.url);
 if(!isProductionHost(url.hostname)&&url.pathname==='/'&&request.method==='GET'){
  const response=await env.ASSETS.fetch(new Request(new URL('/',url.origin),request));
  if(!response.ok)return response;
  const html=await response.text();
  const headers=new Headers(response.headers);headers.set('x-robots-tag','noindex');headers.delete('content-length');
  return new Response(html,{status:response.status,headers});
 }
 if(isProductionHost(url.hostname)&&url.pathname==='/'&&request.method==='GET'){
  const asset=new URL('/v41/',url.origin);
  const response=await env.ASSETS.fetch(new Request(asset,request));
  if(!response.ok)return response;
  let html=await response.text();
  html=html.replaceAll('href="shell.css"','href="/v41/shell.css"')
   .replaceAll('href="identity.css"','href="/v41/identity.css"')
   .replaceAll('src="media-preview.js"','src="/v41/media-preview.js"')
   .replaceAll('src="shell.mjs"','src="/v41/shell.mjs"')
   .replaceAll('/auth/login?next=%2Fv41%2F','/auth/login?next=%2F');
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  if(!isSearchOpenHost(url.hostname))headers.set('x-robots-tag','noindex');
  return new Response(html,{status:response.status,headers});
 }
 return next();
}
