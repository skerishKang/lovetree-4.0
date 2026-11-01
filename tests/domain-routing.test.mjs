import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/index.js';
test('only the custom root opens 4.1 and preserves its query/hash',async()=>{
 let calls=0;const next=()=>{calls++;return new Response('legacy');};
 const r=onRequest({request:new Request('https://lovetree.padiem.net/?a=1#book'),next});
 assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://lovetree.padiem.net/v41/?a=1#book');assert.equal(calls,0);
 for(const url of ['https://lovetree-4-0.pages.dev/','https://lovetree.padiem.net/v41/','https://evil.test/'])assert.equal(await onRequest({request:new Request(url),next}).text(),'legacy');
 assert.equal(calls,3);
});
