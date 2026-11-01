import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunityApi} from '../public/v41/community-api.mjs';

test('expired community session refreshes then retries one comment with the same idempotency key',async()=>{
 const calls=[];let tries=0;
 const fetchImpl=async(url,init={})=>{calls.push({url,init});if(url==='/auth/refresh')return new Response(null,{status:204});tries++;return tries<3?new Response('{}',{status:401}):new Response('{"id":"ok"}',{status:200});};
 const result=await createCommunityApi({fetchImpl}).comment('test','hello');
 assert.equal(result.ok,true);
 assert.deepEqual(calls.map(x=>x.url),['/api/community/shares/test/comments','/api/community/shares/test/comments','/auth/refresh','/api/community/shares/test/comments']);
 const requests=calls.filter(x=>x.url.includes('/comments'));
 assert.equal(new Set(requests.map(x=>x.init.headers['idempotency-key'])).size,1);
 assert.equal(new Set(requests.map(x=>x.init.body)).size,1);
});

test('community does not retry non-auth errors or a failed refresh',async()=>{
 const calls=[];const fetchImpl=async(url)=>{calls.push(url);return new Response('{}',{status:url==='/auth/refresh'?503:401});};
 const result=await createCommunityApi({fetchImpl}).favorite('test',true);
 assert.equal(result.status,401);assert.deepEqual(calls,['/api/community/shares/test/favorite','/api/community/shares/test/favorite','/auth/refresh']);
 const calls2=[];const api=createCommunityApi({fetchImpl:async url=>{calls2.push(url);return new Response('{}',{status:503});}});
 assert.equal((await api.discover({})).status,503);assert.equal(calls2.length,1);
});
