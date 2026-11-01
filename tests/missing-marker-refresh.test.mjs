import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkspaceApi} from '../public/v41/api.mjs';
test('missing marker with valid refresh recovers the same upload',async()=>{
 let valid=false,refresh=0,upload=0;const blob=new Blob(['test'],{type:'image/png'});
 const api=createWorkspaceApi({fetchImpl:async(url,init)=>{
  if(url==='/auth/refresh'){refresh++;valid=true;return new Response(null,{status:204});}
  upload++;assert.equal(init.body,blob);return valid?Response.json({url:'https://example.test/api/media/test.png'}):Response.json({error:{code:'unauthenticated'}},{status:401});
 }});
 const result=await api.uploadMedia(blob,'subject','key');assert.equal(result.ok,true);assert.equal(refresh,1);assert.equal(upload,3);
});
test('failed refresh reports 401 and preserves response',async()=>{
 const api=createWorkspaceApi({fetchImpl:async()=>Response.json({error:{code:'unauthenticated'}},{status:401})});
 const result=await api.listMedia();assert.equal(result.status,401);assert.equal(result.code,'unauthenticated');
});
