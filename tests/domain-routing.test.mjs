import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/index.js';
test('every root serves 4.1 without redirect; pages.dev root no longer shows 4.0',async()=>{
 let fetched='',calls=0;const next=()=>{calls++;return new Response('legacy');};
 const asset='<head><link href="shell.css"><link href="identity.css"><script src="media-preview.js"></script><script src="shell.mjs"></script><link rel="modulepreload" href="shell/tag-manager.mjs"><link rel="manifest" href="manifest.webmanifest"><link rel="canonical" href="https://lovetree.padiem.net/"><a href="/auth/login?next=%2Fv41%2F">login</a></head>';
 const env={ASSETS:{fetch:async request=>{fetched=request.url;return new Response(asset,{headers:{'content-type':'text/html'}});}}};
 const r=await onRequest({request:new Request('https://lovetree.padiem.net/?a=1'),next,env});
 assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);assert.equal(fetched,'https://lovetree.padiem.net/v41/');
 const html=await r.text();
 assert.match(html,/<head><base href="\/v41\/">/,'모든 상대 자산이 /v41/을 기준으로 풀린다');
 assert.match(html,/href="shell\.css"/,'글자 바꾸기 없이 원문 상대 주소가 남는다');
 assert.match(html,/href="shell\/tag-manager\.mjs"/);
 assert.match(html,/src="shell\.mjs"/);
 assert.match(html,/href="https:\/\/lovetree\.padiem\.net\/"/,'공유 카드 절대 주소는 그대로다');
 assert.match(html,/next=%2Fv41%2F/,'로그인 복귀 주소도 그대로다');
 assert.doesNotMatch(html,/href="\/v41\/shell\.css"/);
 assert.equal(r.headers.get('x-robots-tag'),'noindex','서비스 시작 전(SEARCH_OPEN=false)에는 운영 주소 루트도 noindex');
 // #541: 운영 주소 밖 루트(/)는 검색 제외 — 자산 문서에 X-Robots-Tag noindex 를 붙여 돌려준다.
 for(const url of ['https://lovetree.padiem.net/v41/'])assert.equal(await (await onRequest({request:new Request(url),next,env})).text(),'legacy');
 // 2026-11-23: pages.dev 루트도 4.1을 보여 준다(옛 4.0 화면 내림). 검색 제외는 그대로.
 for(const url of ['https://lovetree-4-0.pages.dev/','https://abc123.lovetree-4-0.pages.dev/']){
  fetched='';const dev=await onRequest({request:new Request(url),next,env});
  assert.equal(dev.status,200);assert.equal(fetched,new URL('/v41/',url).href,'pages.dev 루트도 4.1 앱 문서를 연다');
  const devHtml=await dev.text();
  assert.match(devHtml,/<head><base href="\/v41\/">/,'pages.dev 루트도 /v41/ 기준으로 자산을 푼다');
  assert.match(devHtml,/href="https:\/\/lovetree\.padiem\.net\/"/,'공유 카드 기준 주소는 운영 주소 그대로');
  assert.equal(dev.headers.get('x-robots-tag'),'noindex');
 }
 assert.equal(calls,1);
});
