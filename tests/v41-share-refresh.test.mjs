import test from 'node:test';
import assert from 'node:assert/strict';
import {createShareApi} from '../public/v41/share-api.mjs';
test('expired session refreshes before repeating share creation with the same payload',async()=>{
 const calls=[];let tries=0;
 const api=createShareApi({fetchImpl:async(url,init)=>{calls.push({url,init});if(url==='/auth/refresh')return new Response(null,{status:204});return ++tries<3?new Response('{}',{status:401}):new Response('{"share":{"id":"a"}}',{status:200});}});
 const result=await api.create({treeId:'t',previewToken:'p'});
 assert.equal(result.ok,true);assert.equal(calls.filter(x=>x.url==='/auth/refresh').length,1);
 assert.equal(new Set(calls.filter(x=>x.url==='/api/shares').map(x=>x.init.body)).size,1);
});

test('public link reads never trigger a private session refresh',async()=>{
 const calls=[];const api=createShareApi({fetchImpl:async url=>{calls.push(url);return new Response('{}',{status:401});}});
 assert.equal((await api.read('a')).status,401);assert.deepEqual(calls,['/api/public/shares/a']);
});
