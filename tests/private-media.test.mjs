import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPrivateMediaStore,createMediaHandler,MAX_MEDIA_BYTES,IMAGE_LIMIT_BYTES} from '../server/private-media.js';
import {createNodeHandler} from '../server/http.js';
import {createProxy} from '../functions/_lib/proxy.js';
import {createWorkspaceApi} from '../public/v41/api.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOasAAAAASUVORK5CYII=','base64');
const A={productId:'lovetree-4-0',subjectId:'upload-test-A'},B={...A,subjectId:'upload-test-B'};
async function setup(t,options={}){const directory=await mkdtemp(join(tmpdir(),'lt-media-'));t.after(()=>rm(directory,{recursive:true,force:true}));return {directory,store:createPrivateMediaStore({directory,...options})};}
test('private media round trip, account/product isolation, restart and deletion',async t=>{
 const {directory,store}=await setup(t),id=randomUUID(),asset=await store.put(A,{id,mime:'image/png',bytes:png});
 assert.deepEqual((await store.get(A,asset.name)).bytes,png);
 await assert.rejects(store.get(B,asset.name),{status:404});
 await assert.rejects(store.get({...A,productId:'other'},asset.name),{status:404});
 assert.equal((await createPrivateMediaStore({directory}).list(A)).items[0].id,id);
 assert.equal((await store.list(B)).items.length,0);
 await store.remove(A,asset.name);await assert.rejects(store.get(A,asset.name),{status:404});assert.equal((await store.list(A)).usedBytes,0);
});
test('same request replay is idempotent; a different file conflicts, bounded quota serializes parallel uploads',async t=>{
 const {store}=await setup(t,{quotaBytes:png.length,maxItems:1}),id=randomUUID();
 await Promise.all([store.put(A,{id,mime:'image/png',bytes:png}),store.put(A,{id,mime:'image/png',bytes:png})]);
 assert.equal((await store.list(A)).items.length,1);
 const competing=await Promise.allSettled([store.put(B,{id:randomUUID(),mime:'image/png',bytes:png}),store.put(B,{id:randomUUID(),mime:'image/png',bytes:png})]);
 assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);assert.equal(competing.find(x=>x.status==='rejected').reason.code,'media_quota');
 await assert.rejects(store.put(A,{id,mime:'image/png',bytes:Buffer.concat([png,Buffer.from('x')])}),{status:409});
 await assert.rejects(store.put(A,{id:randomUUID(),mime:'image/png',bytes:png}),{status:413,code:'media_quota'});
});
test('type signatures, size limits and traversal are rejected without files',async t=>{
 const {store}=await setup(t);
 for(const [mime,bytes,code] of [['image/svg+xml',Buffer.from('<svg/>'),'media_type'],['image/png',Buffer.from('<html/>'),'media_signature'],['image/png',Buffer.alloc(IMAGE_LIMIT_BYTES+1),'media_size'],['video/mp4',Buffer.alloc(MAX_MEDIA_BYTES+1),'media_size']]){
 await assert.rejects(store.put(A,{id:randomUUID(),mime,bytes}),{code});}
 await assert.rejects(store.put(A,{id:'../outside',mime:'image/png',bytes:png}),{status:400});
 await assert.rejects(store.get(A,'../outside.png'),{status:404});assert.equal((await store.list(A)).usedBytes,0);
});
test('video bytes and MIME survive storage; corrupt/truncated files fail closed',async t=>{
 const {store,directory}=await setup(t),bytes=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(20)]);
 const asset=await store.put(A,{id:randomUUID(),mime:'video/mp4',bytes});
 assert.deepEqual(await store.get(A,asset.name),{mime:'video/mp4',bytes});
 const dir=join(directory,(await readdir(directory))[0]),path=join(dir,(await readdir(dir))[0]);const saved=await readFile(path);saved[saved.length-1]^=1;await writeFile(path,saved);
 await assert.rejects(store.get(A,asset.name),/checksum/);
});
test('HTTP boundary authenticates, binds subject and origin; unknown route/method closed; unavailable is honest',async t=>{
 const {store}=await setup(t),authenticate=async r=>r.headers?.user==='A'?A:r.headers?.user==='B'?B:null;
 const handle=createMediaHandler({authenticate,productId:A.productId,store,publicOrigin:'https://front.test'});
 const request={method:'POST',path:'/api/media',headers:{user:'A',origin:'https://front.test','content-type':'image/png','x-lovetree-subject':A.subjectId,'x-lovetree-upload-id':randomUUID()},rawBody:png};
 assert.equal((await handle({...request,headers:{}})).status,401);
 assert.equal((await handle({...request,headers:{...request.headers,origin:'https://evil.test'}})).status,403);
 assert.equal((await handle({...request,headers:{...request.headers,'x-lovetree-subject':B.subjectId}})).status,401);
 const result=await handle(request);assert.equal(result.status,200);
 const path=new URL(result.body.url).pathname;
 assert.equal((await handle({method:'GET',path,headers:{user:'B'}})).status,404);
 assert.equal((await handle({method:'PUT',path,headers:{user:'A'}})).status,405);
 assert.equal((await handle({method:'GET',path:'/api/media/../anything',headers:{user:'A'}})).status,404);
 const unavailable=createMediaHandler({authenticate,productId:A.productId,store:null,publicOrigin:'https://front.test'});
 assert.equal((await unavailable({method:'GET',path:'/api/media',headers:{user:'A'}})).status,503);
 const get=await handle({method:'GET',path,headers:{user:'A'}});assert.equal(get.headers['cache-control'],'private, no-store');assert.deepEqual(get.binary,png);
});
test('real Node binary adapter + Pages proxy preserve upload/get/delete and cookie identity',async t=>{
 const {store}=await setup(t),handle=createMediaHandler({authenticate:async r=>r.headers.cookie==='test=A'?A:r.headers.cookie==='test=B'?B:null,productId:A.productId,store,publicOrigin:'https://front.test'});
 const server=createServer(createNodeHandler(handle));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const env={LOVETREE_API_ORIGIN:'http://127.0.0.1:'+server.address().port},proxy=createProxy();
 const request=(path,init={})=>proxy({request:new Request('https://front.test'+path,{...init,headers:{cookie:'test=A',origin:'https://front.test',...init.headers}}),env});
 const id=randomUUID(),uploaded=await request('/api/media',{method:'POST',headers:{'content-type':'image/png','x-lovetree-subject':A.subjectId,'x-lovetree-upload-id':id},body:png});
 assert.equal(uploaded.status,200);const asset=await uploaded.json();
 const downloaded=await request('/api/media/'+asset.name);assert.equal(downloaded.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),png);
 const other=await request('/api/media/'+asset.name,{headers:{cookie:'test=B'}});assert.equal(other.status,404);
 const tooBig=await request('/api/media',{method:'POST',headers:{'content-type':'video/mp4','x-lovetree-subject':A.subjectId,'x-lovetree-upload-id':randomUUID()},body:Buffer.alloc(MAX_MEDIA_BYTES+1)});assert.equal(tooBig.status,413);
 assert.equal((await request('/api/media/nope.png')).status,404);
 assert.equal((await request('/api/media',{method:'PUT'})).status,405);
 assert.equal((await request('/api/media/'+asset.name,{method:'DELETE',headers:{'x-lovetree-subject':A.subjectId}})).status,200);
 assert.equal((await request('/api/media/'+asset.name)).status,404);
});
test('browser API keeps binary bytes and upload id, including cancellation',async()=>{
 const id=randomUUID();let sent;
 const api=createWorkspaceApi({fetchImpl:async(url,init)=>{sent={url,init};return new Response(png,{headers:{'content-type':'image/png'}});}});
 const read=await api.fetchMedia(id+'.png');assert.deepEqual(Buffer.from(await read.blob.arrayBuffer()),png);
 const uploader=createWorkspaceApi({fetchImpl:async(url,init)=>{sent={url,init};return Response.json({url:'https://front.test/api/media/'+id+'.png'});}});
 await uploader.uploadMedia(new Blob([png],{type:'image/png'}),A.subjectId,id);
 assert.equal(sent.init.headers['x-lovetree-upload-id'],id);assert.equal(sent.init.headers['x-lovetree-subject'],A.subjectId);
 const controller=new AbortController();controller.abort();
 const cancelled=createWorkspaceApi({fetchImpl:async(_,init)=>{init.signal.throwIfAborted();}});
 assert.equal((await cancelled.uploadMedia(new Blob([png]),A.subjectId,id,controller.signal)).code,'cancelled');
});

test('explicit frontend alias uploads share canonical storage; unlisted or malformed origins stay closed',async t=>{
 const {store}=await setup(t),primary='https://lovetree-4-0.pages.dev',alias='https://lovetree.padiem.net';
 const authenticate=async()=>A,handle=createMediaHandler({authenticate,productId:A.productId,store,publicOrigin:primary,additionalPublicOrigins:[alias]});
 const post=origin=>({method:'POST',path:'/api/media',headers:{origin,'content-type':'image/png','x-lovetree-subject':A.subjectId,'x-lovetree-upload-id':randomUUID()},rawBody:png});
 for(const origin of [primary,alias]){
  const result=await handle(post(origin));assert.equal(result.status,200);assert.equal(new URL(result.body.url).origin,origin);
  assert.deepEqual((await handle({method:'GET',path:new URL(result.body.url).pathname,headers:{}})).binary,png);
 }
 for(const origin of ['https://evil.test','https://lovetree.padiem.net.evil.test',undefined]){
  const result=await handle(post(origin));assert.equal(result.status,403);assert.equal(result.body.error.message,'이 화면에서 다시 요청해 주세요.');
 }
 const invalid=createMediaHandler({authenticate,productId:A.productId,store,publicOrigin:primary,additionalPublicOrigins:[alias+'/path']});
 assert.equal((await invalid(post(primary))).status,503);
 assert.equal((await store.list(A)).items.length,2);
});
