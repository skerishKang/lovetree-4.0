import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createCommunityHandler,createCommunityService} from '../server/community-service.js';
import {ApiError} from '../server/errors.js';

const PRODUCT='lovetree-test',principal=subjectId=>({productId:PRODUCT,subjectId});
async function setup(){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const tree=createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url:'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg'},'2026-11-01T00:00:00.000Z');
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed'});
 const shareRepo=createMemoryShareRepo();let share=await shareRepo.create({productId:PRODUCT,shareId:'s'.repeat(24),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book'});
 share=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo();communityRepo.seedShares([share]);
 const admin={roleFor:async value=>value.subjectId==='admin'?'admin':null};
 let id=0;
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin,makeId:()=>String(++id).padStart(24,'c'),now:()=>Date.UTC(2026,10,1)});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 return {tree,workspaceRepo,shareRepo,communityRepo,service,handle:createCommunityHandler({authenticate,service,productId:PRODUCT})};
}
const call=(handle,method,path,{body,account,key,query}={})=>handle({method,path,query:new URLSearchParams(query||''),headers:{...(account?{account}:{}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},body:body?JSON.stringify(body):''});

test('discovery exposes only the live projected share and supports search and emotion filters',async()=>{
 const {handle,tree}=await setup();
 const list=await call(handle,'GET','/api/community/shares',{query:'q=윤슬&emotion=설렘&limit=1'});
 assert.equal(list.status,200);assert.equal(list.headers['cache-control'],'no-store, max-age=0');
 assert.equal(list.body.items.length,1);assert.equal(list.body.items[0].title,tree.title);assert.equal(list.body.items[0].cover.url,'');
 assert.equal(JSON.stringify(list.body).includes('alice'),false);assert.equal(list.body.items[0].stats.hearts,0);
 const empty=await call(handle,'GET','/api/community/shares',{query:'q=없는검색'});
 assert.deepEqual(empty.body.items,[]);
});

test('favorites and reactions are authenticated, idempotent and remain outside workspace JSON',async()=>{
 const {handle,workspaceRepo}=await setup(),shareId='s'.repeat(24);
 assert.equal((await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`)).status,401);
 const first=await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
 const again=await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
 const heart=await call(handle,'PUT',`/api/community/shares/${shareId}/reaction`,{account:'bob'});
 assert.equal(first.body.stats.favorites,1);assert.equal(again.body.stats.favorites,1);assert.equal(heart.body.stats.hearts,1);
 assert.deepEqual((await call(handle,'GET','/api/community/me/favorites',{account:'bob'})).body.shareIds,[shareId]);
 const stored=await workspaceRepo.load({productId:PRODUCT,subjectId:'alice'});
 assert.equal(JSON.stringify(stored.doc).includes('favorites'),false);assert.equal(JSON.stringify(stored.doc).includes('reaction'),false);
});

test('comments use an idempotency key, hide account ids and enforce author or admin delete',async()=>{
 const {handle,communityRepo}=await setup(),shareId='s'.repeat(24),path=`/api/community/shares/${shareId}/comments`;
 assert.equal((await call(handle,'POST',path,{account:'bob',body:{body:'좋은 순간이에요'}})).body.error.code,'idempotency_key_required');
 const made=await call(handle,'POST',path,{account:'bob',key:'comment-key-0001',body:{body:'좋은 순간이에요'}});
 const replay=await call(handle,'POST',path,{account:'bob',key:'comment-key-0001',body:{body:'바뀌면 안 돼요'}});
 assert.equal(made.status,201);assert.equal(replay.body.comment.id,made.body.comment.id);
 const publicList=await call(handle,'GET',path);assert.equal(publicList.body.comments[0].mine,false);assert.equal(publicList.body.comments[0].canDelete,false);assert.equal(JSON.stringify(publicList.body).includes('bob'),false);
 const adminList=await call(handle,'GET',path,{account:'admin'});assert.equal(adminList.body.comments[0].canDelete,true);
 assert.equal((await call(handle,'DELETE',`/api/community/comments/${made.body.comment.id}`,{account:'eve'})).status,403);
 assert.equal((await call(handle,'DELETE',`/api/community/comments/${made.body.comment.id}`,{account:'admin'})).status,200);assert.equal(communityRepo.inspect().audits[0].action,'hide_comment');
});

test('owner state can comment but cannot block its own public tree',async()=>{
 const {handle}=await setup(),shareId='s'.repeat(24),path=`/api/community/shares/${shareId}/comments`;
 assert.equal((await call(handle,'POST',path)).status,401);
 const made=await call(handle,'POST',path,{account:'alice',key:'owner-comment-0001',body:{body:'내 공개 기록의 안내'}});assert.equal(made.body.comment.mine,true);assert.equal(made.body.comment.canDelete,true);
 const blocked=await call(handle,'POST',`/api/community/shares/${shareId}/block`,{account:'alice'});assert.equal(blocked.status,400);assert.equal(blocked.body.error.code,'cannot_block_self');
});

test('comment writes are rate limited per authenticated member',async()=>{
 const {handle}=await setup(),shareId='s'.repeat(24),path=`/api/community/shares/${shareId}/comments`;
 for(let index=0;index<12;index+=1)assert.equal((await call(handle,'POST',path,{account:'bob',key:'rate-key-'+String(index).padStart(4,'0'),body:{body:'댓글 '+index}})).status,201);
 const limited=await call(handle,'POST',path,{account:'bob',key:'rate-key-9999',body:{body:'한 번 더'}});assert.equal(limited.status,429);assert.equal(limited.body.error.code,'rate_limited');
});

test('report, block and moderation are separate audited data and blocked owners disappear for that member',async()=>{
 const {handle,communityRepo}=await setup(),shareId='s'.repeat(24);
 const report=await call(handle,'POST',`/api/community/shares/${shareId}/report`,{account:'bob',key:'report-key-0001',body:{reason:'확인이 필요해요'}});
 assert.equal(report.status,201);
 assert.equal((await call(handle,'GET','/api/community/admin/reports',{account:'bob'})).status,403);
 const reports=await call(handle,'GET','/api/community/admin/reports',{account:'admin'});assert.equal(reports.body.reports.length,1);
 const done=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'resolved',visibility:'hidden'}});
 assert.equal(done.body.report.status,'resolved');assert.equal(done.body.report.hidden,true);assert.equal(communityRepo.inspect().audits.length,2);
 assert.deepEqual((await call(handle,'GET','/api/community/shares')).body.items,[]);
 const restored=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'dismissed',visibility:'visible'}});
 assert.equal(restored.body.report.hidden,false);assert.equal(communityRepo.inspect().audits.length,4);
 await call(handle,'POST',`/api/community/shares/${shareId}/block`,{account:'bob'});
 const hidden=await call(handle,'GET','/api/community/shares',{account:'bob'});assert.deepEqual(hidden.body.items,[]);
 const anonymous=await call(handle,'GET','/api/community/shares');assert.equal(anonymous.body.items.length,1);
});
