import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createShareHandler,createShareService} from '../server/share-service.js';

const PRODUCT='lovetree-test',CLOCK='2026-11-01T00:00:00.000Z';
const principal=subjectId=>({productId:PRODUCT,subjectId});
const first=createTree({subject:'윤슬',title:'첫 장면',note:'비밀 마음',emotion:'설렘',date:'2026-11-01',url:'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg'},CLOCK);
const second=createTree({subject:'다른 대상',title:'다른 트리',note:'절대 공개하지 않음',emotion:'위로',date:'2026-11-01',url:'https://example.com/public'},CLOCK);
const state={version:1,trees:[first,second]};

async function setup(){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 await workspace.write(principal('alice'),{state,expectedRevision:0,clientKey:'seed',});
 const shareRepo=createMemoryShareRepo();let n=0;
 const service=createShareService({shareRepo,workspaceRepo,productId:PRODUCT,makeId:()=>String(++n).padStart(24,'s')});
 const authenticate=async request=>principal(request.headers?.account||'alice');
 return {workspace,handle:createShareHandler({authenticate,service,productId:PRODUCT})};
}
const request=(handle,method,path,body,account)=>handle({method,path,headers:{...(body?{'content-type':'application/json'}:{}),...(account?{account}:{})},body:body?JSON.stringify(body):''});

test('preview is non-mutating and explicit create exposes one projected tree only',async()=>{
 const {handle}=await setup(),input={treeId:first.id,entryMomentId:first.moments[0].id,view:'board'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 assert.equal(preview.status,200);assert.equal(preview.body.preview.tree.moments[0].url,'');assert.equal(preview.body.preview.omittedPrivateMedia,1);
 assert.deepEqual((await request(handle,'GET','/api/shares',null,'alice')).body.shares,[]);
 const unpreviewed=await request(handle,'POST','/api/shares',input,'alice');assert.equal(unpreviewed.status,409);assert.equal(unpreviewed.body.error.code,'share_preview_stale');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');assert.equal(made.status,201);
 const publicRead=await request(handle,'GET','/api/public/shares/'+made.body.share.id);
 assert.equal(publicRead.status,200);assert.equal(publicRead.headers['cache-control'],'no-store, max-age=0');
 assert.equal(publicRead.body.tree.id,first.id);assert.equal(publicRead.body.tree.moments[0].url,'');
 assert.equal(JSON.stringify(publicRead.body).includes(second.title),false);assert.equal('state' in publicRead.body,false);assert.equal(JSON.stringify(publicRead.body).includes('alice'),false);
});

test('owner changes remain live, another account cannot revoke, and successful revoke is immediate',async()=>{
 const {handle,workspace}=await setup(),input={treeId:first.id,entryMomentId:first.moments[0].id,view:'book'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice'),id=made.body.share.id;
 const updated=structuredClone(state);updated.trees[0].title='바뀐 제목';
 await workspace.write(principal('alice'),{state:updated,expectedRevision:1,clientKey:'update'});
 assert.equal((await request(handle,'GET','/api/public/shares/'+id)).body.tree.title,'바뀐 제목');
 const denied=await request(handle,'DELETE','/api/shares/'+id,null,'bob');assert.equal(denied.status,403);assert.equal(denied.body.error.code,'share_forbidden');
 const revoked=await request(handle,'DELETE','/api/shares/'+id,null,'alice');assert.equal(revoked.status,200);
 const after=await request(handle,'GET','/api/public/shares/'+id);assert.equal(after.status,410);assert.equal(after.body.error.code,'share_revoked');
});

test('invalid, missing, deleted and account-isolated states stay distinct',async()=>{
 const {handle,workspace}=await setup();
 assert.equal((await request(handle,'GET','/api/public/shares/bad')).body.error.code,'share_invalid');
 assert.equal((await request(handle,'GET','/api/public/shares/'+'x'.repeat(24))).body.error.code,'share_not_found');
 const input={treeId:first.id,view:'network'},preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');
 await workspace.write(principal('alice'),{state:{version:1,trees:[second]},expectedRevision:1,clientKey:'remove'});
 const removed=await request(handle,'GET','/api/public/shares/'+made.body.share.id);assert.equal(removed.status,410);assert.equal(removed.body.error.code,'share_removed');
 assert.deepEqual((await request(handle,'GET','/api/shares',null,'bob')).body.shares,[]);
});
