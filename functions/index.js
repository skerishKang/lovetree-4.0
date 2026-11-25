// 어느 주소로 들어와도 루트(/)는 4.1 앱 문서를 serve 한다. 예전에는 pages.dev 루트에 4.0을 남겨 두었지만,
// 사용자가 pages.dev로 들어와 옛 화면을 보는 일이 생겨 4.1로 하나로 맞춘다(대표 결정 2026-11-23).
// #541: 운영 주소 밖(*.pages.dev 등)은 검색 제외. 운영 주소도 검색을 열기 전(SEARCH_OPEN=false)에는 noindex.
import { isSearchOpenHost } from './_lib/search-meta.mjs';

export async function onRequest({request,next,env}) {
 const url=new URL(request.url);
 if(url.pathname==='/'&&request.method==='GET'){
  const asset=new URL('/v41/',url.origin);
  const response=await env.ASSETS.fetch(new Request(asset,request));
  if(!response.ok)return response;
  let html=await response.text();
  // #1054: 네 개만 고치던 글자 바꾸기를 없애고 문서 자체에 기준 주소를 둔다.
  // 주소는 그대로 '/'에 있으므로 공유 카드(absolute canonical·og:url)와 검색 제외 헤더가 그대로 동작한다.
  if(!/<base\s/i.test(html))html=html.replace(/<head([^>]*)>/i,(tag)=>`${tag}<base href="/v41/">`);
  const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-store');
  if(!isSearchOpenHost(url.hostname))headers.set('x-robots-tag','noindex');
  return new Response(html,{status:response.status,headers});
 }
 return next();
}
