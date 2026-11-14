import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree,editTree} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createCommunityHandler,createCommunityService} from '../server/community-service.js';
import {ApiError} from '../server/errors.js';

const PRODUCT='lovetree-test',principal=subjectId=>({productId:PRODUCT,subjectId});
const CLOCK='2026-11-01T00:00:00.000Z';
const PHOTO='https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg';
function sampleTree(url=PHOTO){return createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url},CLOCK);}
async function setup({url=PHOTO,coverMode='',coverDesign='',admin=null}={}){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 let tree=sampleTree(url);
 if(coverMode)tree=editTree(tree,{title:tree.title,subject:tree.subject,coverMomentId:tree.moments[0].id,coverDesign,coverMode});
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed'});
 const shareRepo=createMemoryShareRepo();let share=await shareRepo.create({productId:PRODUCT,shareId:'s'.repeat(24),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 share=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo();communityRepo.seedShares([share]);
 const adminStub=admin||{roleFor:async value=>value.subjectId==='admin'?'admin':null};
 let id=0;
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:adminStub,makeId:()=>String(++id).padStart(24,'c'),now:()=>Date.UTC(2026,10,1)});
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

test('browse cover sends an address only for moment mode — photo/design/basic stay url-less (#425 2번)',async()=>{
 const external='https://example.com/cover.jpg';
 const momentMode=await setup({url:external,coverMode:'moment'});
 const momentCard=(await call(momentMode.handle,'GET','/api/community/shares')).body.items[0];
 assert.equal(momentCard.cover.url,external,'순간에서 표지는 외부 링크 주소를 보낸다');
 assert.equal(momentCard.momentCount,1);
 const designMode=await setup({url:external,coverMode:'design',coverDesign:'texture-3'});
 assert.equal((await call(designMode.handle,'GET','/api/community/shares')).body.items[0].cover.url,'','디자인 표지는 주소를 보내지 않는다');
 const photoDesign=await setup({coverMode:'photo',coverDesign:'texture-1'});
 assert.equal((await call(photoDesign.handle,'GET','/api/community/shares')).body.items[0].cover.url,'','사진 표지는 공개에서 디자인이 되고 주소가 없다');
 const photoBasic=await setup({coverMode:'photo'});
 assert.equal((await call(photoBasic.handle,'GET','/api/community/shares')).body.items[0].cover.url,'','사진 표지 + 디자인 없음은 기본 색 표지');
});

test('#611 3번: AI 테스터 기록은 둘러보기 카드에 aiTester 한 비트만 내린다',async()=>{
 const {handle}=await setup();
 // 보통 기록(alice)은 표지가 없고 계정 정보도 없다.
 const plain=await call(handle,'GET','/api/community/shares');
 assert.equal(plain.status,200);assert.equal(plain.body.items[0].aiTester,undefined);
 assert.equal(JSON.stringify(plain.body).includes('alice'),false);
 // ai_customer 역할이면 aiTester:true만 있고, 이메일·subject 등 계정 정보는 없다.
 const ai=await setup({admin:{roleFor:async value=>value.subjectId==='alice'?'ai_customer':null}});
 const tester=await call(ai.handle,'GET','/api/community/shares');
 assert.equal(tester.body.items[0].aiTester,true);
 assert.equal(JSON.stringify(tester.body).includes('alice'),false);
 assert.equal(JSON.stringify(tester.body).includes('@'),false);
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

test('reaction kinds are allowlisted, per-kind idempotent, toggleable, and blocked after block',async()=>{
 const {handle,communityRepo}=await setup(),shareId='s'.repeat(24);
 const path=`/api/community/shares/${shareId}/reaction`;
 const heart=await call(handle,'PUT',path,{account:'bob',body:{kind:'heart'}});assert.equal(heart.status,200);assert.equal(heart.body.stats.hearts,1);assert.equal(heart.body.stats.reactions.heart,1);assert.deepEqual(heart.body.stats.mine,['heart']);
 const like=await call(handle,'PUT',path,{account:'bob',body:{kind:'like'}});assert.equal(like.status,200);assert.equal(like.body.stats.hearts,1);assert.equal(like.body.stats.reactions.like,1);assert.deepEqual(like.body.stats.mine,['heart','like']);
 const dup=await call(handle,'PUT',path,{account:'bob',body:{kind:'like'}});assert.equal(dup.status,200);assert.equal(dup.body.stats.reactions.like,1);
 const love=await call(handle,'PUT',path,{account:'bob',body:{kind:'love'}});assert.equal(love.status,200);assert.equal(love.body.stats.reactions.love,1);assert.deepEqual(love.body.stats.mine,['heart','like','love']);
 const bad=await call(handle,'PUT',path,{account:'bob',body:{kind:'party'}});assert.equal(bad.status,400);assert.equal(bad.body.error.code,'reaction_kind_invalid');
 const off=await call(handle,'DELETE',path,{account:'bob',query:'kind=like'});assert.equal(off.status,200);assert.equal(off.body.stats.reactions.like,0);assert.deepEqual(off.body.stats.mine,['heart','love']);
 const offLove=await call(handle,'DELETE',path,{account:'bob',query:'kind=love'});assert.equal(offLove.status,200);assert.equal(offLove.body.stats.reactions.love,0);assert.deepEqual(offLove.body.stats.mine,['heart']);
 const legacyOff=await call(handle,'DELETE',path,{account:'bob'});assert.equal(legacyOff.status,200);assert.equal(legacyOff.body.stats.reactions.heart,0);assert.equal(legacyOff.body.stats.hearts,0);assert.deepEqual(legacyOff.body.stats.mine,[]);
 const sad=await call(handle,'PUT',path,{account:'bob',body:{kind:'sad'}});assert.equal(sad.status,200);assert.deepEqual(sad.body.stats.mine,['sad']);
 await call(handle,'POST',`/api/community/shares/${shareId}/block`,{account:'bob'});
 const blocked=await call(handle,'PUT',path,{account:'bob',body:{kind:'wow'}});assert.equal(blocked.status,403);assert.equal(blocked.body.error.code,'reaction_blocked');
 assert.ok(communityRepo.inspect().reactions.some(v=>v.includes('sad')));
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

test('comment edit is own-only, sets edited flag, keeps existing comments, and blocked/hidden are rejected',async()=>{
 const {handle,communityRepo}=await setup(),shareId='s'.repeat(24),path=`/api/community/shares/${shareId}/comments`;
 const made=await call(handle,'POST',path,{account:'bob',key:'edit-key-0001',body:{body:'처음 글'}});assert.equal(made.status,201);
 const other=await call(handle,'PATCH',`/api/community/comments/${made.body.comment.id}`,{account:'eve',body:{body:'남의 글'}});assert.equal(other.status,403);assert.equal(other.body.error.code,'comment_forbidden');
 const empty=await call(handle,'PATCH',`/api/community/comments/${made.body.comment.id}`,{account:'bob',body:{body:'  '}});assert.equal(empty.status,400);assert.equal(empty.body.error.code,'comment_empty');
 const edited=await call(handle,'PATCH',`/api/community/comments/${made.body.comment.id}`,{account:'bob',body:{body:'고친 글'}});assert.equal(edited.status,200);assert.equal(edited.body.comment.body,'고친 글');assert.equal(edited.body.comment.edited,true);assert.equal(edited.body.comment.canEdit,true);
 const listed=await call(handle,'GET',path,{account:'bob'});assert.equal(listed.body.comments[0].body,'고친 글');assert.equal(communityRepo.inspect().comments.length,1);
 await call(handle,'POST',`/api/community/shares/${shareId}/block`,{account:'bob'});
 const blocked=await call(handle,'POST',path,{account:'bob',key:'edit-key-0002',body:{body:'차단 후'}});assert.equal(blocked.status,403);assert.equal(blocked.body.error.code,'comment_blocked');
 const blockedEdit=await call(handle,'PATCH',`/api/community/comments/${made.body.comment.id}`,{account:'bob',body:{body:'차단 후 수정'}});assert.equal(blockedEdit.status,403);
});

test('discover uses batched summaries, excludes blocked/hidden/deleted, and leaks no private ids',async()=>{
 const {handle,communityRepo}=await setup(),shareId='s'.repeat(24);
 await call(handle,'POST',`/api/community/shares/${shareId}/comments`,{account:'bob',key:'browse-key-0001',body:{body:'첫 댓글'}});
 await call(handle,'POST',`/api/community/shares/${shareId}/comments`,{account:'bob',key:'browse-key-0002',body:{body:'ሁ번째'}});
 await call(handle,'PUT',`/api/community/shares/${shareId}/reaction`,{account:'bob',body:{kind:'like'}});
 communityRepo.queryCount=0;
 const list=await call(handle,'GET','/api/community/shares');
 assert.equal(list.status,200);
 assert.equal(communityRepo.queryCount,1);
 const card=list.body.items[0];
 assert.equal(card.stats.comments,2);
 assert.equal(card.stats.hearts,0);
 assert.equal(card.stats.reactions.like,1);
 assert.equal(card.stats.favorites,0);
 assert.equal(JSON.stringify(list.body).includes('bob'),false);
 assert.equal(JSON.stringify(list.body).includes('alice'),false);
 assert.equal(JSON.stringify(list.body).includes('subjectId'),false);
 assert.equal(card.lastActivityAt!=null,true);
 await call(handle,'POST',`/api/community/shares/${shareId}/block`,{account:'eve'});
 const hidden=await call(handle,'GET','/api/community/shares',{account:'eve'});
 assert.deepEqual(hidden.body.items,[]);
});
