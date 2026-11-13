import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/index.js';
test('custom root serves 4.1 without redirect; legacy origin stays unchanged',async()=>{
 let fetched='',calls=0;const next=()=>{calls++;return new Response('legacy');};
 const env={ASSETS:{fetch:async request=>{fetched=request.url;return new Response('<link href="shell.css"><link href="identity.css"><script src="media-preview.js"></script><script src="shell.mjs"></script><a href="/auth/login?next=%2Fv41%2F">login</a>',{headers:{'content-type':'text/html'}});}}};
 const r=await onRequest({request:new Request('https://lovetree.padiem.net/?a=1'),next,env});
 assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);assert.equal(fetched,'https://lovetree.padiem.net/v41/');
 const html=await r.text();assert.match(html,/href="\/v41\/shell.css"/);assert.match(html,/src="\/v41\/shell.mjs"/);assert.match(html,/next=%2F"/);
 // #541: 운영 주소 밖 루트(/)는 검색 제외 — 자산 문서에 X-Robots-Tag noindex 를 붙여 돌려준다.
 for(const url of ['https://lovetree.padiem.net/v41/'])assert.equal(await (await onRequest({request:new Request(url),next,env})).text(),'legacy');
 for(const url of ['https://lovetree-4-0.pages.dev/','https://evil.test/']){
  const dev=await onRequest({request:new Request(url),next,env});
  assert.match(await dev.text(),/href="shell\.css"/,'운영 주소 밖 루트는 자산 문서 그대로');
  assert.equal(dev.headers.get('x-robots-tag'),'noindex');
 }
 assert.equal(calls,1);
});
