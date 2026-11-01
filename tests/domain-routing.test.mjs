import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/index.js';
test('custom root serves 4.1 without redirect; legacy origin stays unchanged',async()=>{
 let fetched='',calls=0;const next=()=>{calls++;return new Response('legacy');};
 const env={ASSETS:{fetch:async request=>{fetched=request.url;return new Response('<link href="shell.css"><link href="identity.css"><script src="media-preview.js"></script><script src="shell.mjs"></script><a href="/auth/login?next=%2Fv41%2F">login</a>',{headers:{'content-type':'text/html'}});}}};
 const r=await onRequest({request:new Request('https://lovetree.padiem.net/?a=1'),next,env});
 assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);assert.equal(fetched,'https://lovetree.padiem.net/v41/');
 const html=await r.text();assert.match(html,/href="\/v41\/shell.css"/);assert.match(html,/src="\/v41\/shell.mjs"/);assert.match(html,/next=%2F"/);
 for(const url of ['https://lovetree-4-0.pages.dev/','https://lovetree.padiem.net/v41/','https://evil.test/'])assert.equal(await (await onRequest({request:new Request(url),next,env})).text(),'legacy');
 assert.equal(calls,3);
});
