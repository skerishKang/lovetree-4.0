import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree,editTree} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createShareHandler,createShareService} from '../server/share-service.js';

const PRODUCT='lovetree-test',CLOCK='2026-11-01T00:00:00.000Z';
const principal=subjectId=>({productId:PRODUCT,subjectId});
const first=createTree({subject:'윤슬',title:'첫 장면',note:'비밀 마음',emotion:'설렘',date:'2026-11-01',url:'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg'},CLOCK);
const second=createTree({subject:'다른 대상',title:'다른 트리',note:'절대 공개하지 않음',emotion:'위로',date:'2026-11-01',url:'https://example.com/public'},CLOCK);
const state={version:1,trees:[first,second]};

async function setup(documentState=state){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 await workspace.write(principal('alice'),{state:documentState,expectedRevision:0,clientKey:'seed',});
 const shareRepo=createMemoryShareRepo();let n=0;
 const service=createShareService({shareRepo,workspaceRepo,productId:PRODUCT,makeId:()=>String(++n).padStart(24,'s')});
 const authenticate=async request=>principal(request.headers?.account||'alice');
 return {workspace,workspaceRepo,handle:createShareHandler({authenticate,service,productId:PRODUCT})};
}
const request=(handle,method,path,body,account)=>handle({method,path,headers:{...(body?{'content-type':'application/json'}:{}),...(account?{account}:{})},body:body?JSON.stringify(body):''});

test('preview is non-mutating and explicit create exposes one projected tree only',async()=>{
 const {handle,workspaceRepo}=await setup(),input={treeId:first.id,entryMomentId:first.moments[0].id,view:'board'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 assert.equal(preview.status,200);assert.equal(preview.body.preview.tree.moments[0].url,'');assert.equal(preview.body.preview.omittedPrivateMedia,1);
 // #425 2번: 공개 응답에는 올린 사진 주소(/api/media/)가 한 건도 없다.
 assert.equal(JSON.stringify(preview.body).includes('/api/media/'),false,'미리보기에 올린 사진 주소가 없다');
 // 순간 자리(제목·감정·날짜·마음)와 개수는 그대로 남는다.
 const projectedMoment=preview.body.preview.tree.moments[0],sourceMoment=first.moments[0];
 assert.equal(preview.body.preview.tree.moments.length,first.moments.length,'순간 개수는 그대로');
 assert.deepEqual({title:projectedMoment.title,emotion:projectedMoment.emotion,date:projectedMoment.date,note:projectedMoment.note,parentId:projectedMoment.parentId},{title:sourceMoment.title,emotion:sourceMoment.emotion,date:sourceMoment.date,note:sourceMoment.note,parentId:sourceMoment.parentId},'순간 자리는 그대로');
 // 이미 올린 사진은 저장본에서 지워지지 않는다 — 공개 응답만 주소를 뺀다.
 const stored=await workspaceRepo.load({productId:PRODUCT,subjectId:'alice'});
 assert.equal(stored.doc.trees[0].moments[0].url,sourceMoment.url,'저장본의 사진 주소는 그대로');
 assert.deepEqual((await request(handle,'GET','/api/shares',null,'alice')).body.shares,[]);
 const unpreviewed=await request(handle,'POST','/api/shares',input,'alice');assert.equal(unpreviewed.status,409);assert.equal(unpreviewed.body.error.code,'share_preview_stale');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');assert.equal(made.status,201);assert.equal(made.body.share.discoverable,false);
 assert.equal((await request(handle,'PUT','/api/shares/'+made.body.share.id+'/discovery',null,'bob')).status,403);
 const listed=await request(handle,'PUT','/api/shares/'+made.body.share.id+'/discovery',null,'alice');assert.equal(listed.body.share.discoverable,true);
 const unlisted=await request(handle,'DELETE','/api/shares/'+made.body.share.id+'/discovery',null,'alice');assert.equal(unlisted.body.share.discoverable,false);
 const publicRead=await request(handle,'GET','/api/public/shares/'+made.body.share.id);
 assert.equal(publicRead.status,200);assert.equal(publicRead.headers['cache-control'],'no-store, max-age=0');
 assert.equal(publicRead.body.tree.id,first.id);assert.equal(publicRead.body.tree.moments[0].url,'');
 assert.equal(JSON.stringify(publicRead.body).includes('/api/media/'),false,'공유 응답에 올린 사진 주소가 없다');
 assert.equal(JSON.stringify(publicRead.body).includes(second.title),false);assert.equal('state' in publicRead.body,false);assert.equal(JSON.stringify(publicRead.body).includes('alice'),false);
});

test('photo cover is projected to design or basic in the public tree while the stored tree keeps photo mode',async()=>{
 const photo=editTree(first,{title:first.title,subject:first.subject,coverMomentId:first.moments[0].id,coverDesign:'texture-2',coverMode:'photo'});
 const designed=await setup({version:1,trees:[photo]});
 const input={treeId:photo.id,entryMomentId:photo.moments[0].id,view:'book'};
 const preview=await request(designed.handle,'POST','/api/shares/preview',input,'alice');
 assert.equal(preview.status,200);
 assert.equal(preview.body.preview.tree.coverMode,'design','사진 표지 + 디자인 → 디자인 표지');
 assert.equal(preview.body.preview.tree.coverDesign,'texture-2');
 assert.equal(preview.body.preview.tree.coverMomentId,photo.moments[0].id,'표지 순간 자리는 그대로');
 assert.equal(preview.body.preview.tree.moments.length,photo.moments.length);
 const kept=(await designed.workspaceRepo.load({productId:PRODUCT,subjectId:'alice'})).doc.trees[0];
 assert.equal(kept.coverMode,'photo','저장본의 표지 방법은 바꾸지 않는다');
 assert.equal(kept.moments[0].url,first.moments[0].url);

 const plain=editTree(first,{title:first.title,subject:first.subject,coverMomentId:first.moments[0].id,coverDesign:'',coverMode:'photo'});
 const basic=await setup({version:1,trees:[plain]});
 const basicPreview=await request(basic.handle,'POST','/api/shares/preview',{...input,treeId:plain.id},'alice');
 assert.equal(basicPreview.body.preview.tree.coverMode,'basic','사진 표지 + 디자인 없음 → 기본 색 표지');
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
