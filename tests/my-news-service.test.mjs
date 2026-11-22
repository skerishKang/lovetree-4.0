import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree,addMoment} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createMemoryTreeVisibilityRepo} from '../server/testing/memory-tree-visibility-repo.js';
import {createMyNewsHandler,createMyNewsService} from '../server/my-news-service.js';
import {createMomentCommunityHandler,createMomentCommunityService} from '../server/moment-community-service.js';
import {createCommunityHandler,createCommunityService} from '../server/community-service.js';
import {ApiError} from '../server/errors.js';

const PRODUCT='lovetree-test',principal=subjectId=>({productId:PRODUCT,subjectId});
const PHOTO='https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg';
const SHARE='s'.repeat(24);
const myNewsPath='/api/community/my-news';
const unreadPath='/api/community/my-news/unread-count';
const momentPath=(momentId,suffix='')=>`/api/community/shares/${SHARE}/moments/${momentId}${suffix}`;
const treeActionPath=(action)=>`/api/community/shares/${SHARE}/${action}`;

// #1098 3단계 시험 — 내 소식(목록·안 읽은 수·읽음 표시) 서버 규칙. 화면은 이번에 다루지 않는다.
// 묶음은 한국 날짜(KST) 기준 하루 단위다 — 11-21 19시(KST)와 11-22 05시(KST)는 다른 줄이다.
let clockMs=Date.UTC(2026,10,1);
const at=(y,m,d,h=0,mi=0)=>Date.UTC(y,m,d,h,mi);
async function setup({roles={}}={}){
 clockMs=at(2026,10,21,10); // 2026-11-21 10:00Z = KST 11-21 19:00
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 let tree=createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url:PHOTO},'2026-11-01T00:00:00.000Z');
 tree=addMoment(tree,{type:'note',note:'이어지는 순간'},tree.moments[0].id,'2026-11-01T00:00:00.000Z');
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed'});
 const shareRepo=createMemoryShareRepo();
 const share=await shareRepo.create({productId:PRODUCT,shareId:SHARE,subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 const visibilityRepo=createMemoryTreeVisibilityRepo();
 const roleFor=async ({subjectId})=>roles[subjectId]??null;
 const communityRepo=createMemoryCommunityRepo({now:()=>new Date(clockMs).toISOString(),roleFor});
 communityRepo.seedShares([share]);
 const adminStub={roleFor};
 let id=0;
 const makeId=()=>String(++id).padStart(24,'c');
 const momentService=createMomentCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo,productId:PRODUCT,admin:adminStub,makeId,now:()=>clockMs});
 const treeService=createCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo,stageVoteRepo:{resolveMoment:async input=>({stageId:'stub',...input})},productId:PRODUCT,admin:adminStub,makeId,now:()=>clockMs});
 const newsService=createMyNewsService({communityRepo,productId:PRODUCT,now:()=>clockMs});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 // 폴백 사슬: 내 소식 → 순간 → 트리 커뮤니티(운영과 같은 조립 — index.js와 같은 순서다).
 const momentHandle=createMomentCommunityHandler({authenticate,service:momentService,productId:PRODUCT,
  fallback:createCommunityHandler({authenticate,service:treeService,productId:PRODUCT})});
 const handle=createMyNewsHandler({authenticate,service:newsService,productId:PRODUCT,fallback:momentHandle});
 return {tree,communityRepo,handle,newsService};
}
const call=(handle,method,path,{body,account,key,query}={})=>handle({method,path,query:new URLSearchParams(query||''),headers:{...(account?{account}:{}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},body:body?JSON.stringify(body):''});

test('내 소식은 하루(KST)·종류·대상으로 묶여 한 줄이 된다 — 같은 순간의 ♡ 여러 개도 한 줄',async()=>{
 const {handle,communityRepo,tree}=await setup();
 const own=tree.moments[0].id,second=tree.moments[1].id;
 // 같은 날(11-21 KST) 같은 순간에 ♡ 3개 — 한 줄이다.
 for(const who of ['bob','anna','carol'])assert.equal((await call(handle,'PUT',momentPath(own,'/reaction'),{account:who})).status,200);
 // 같은 날 트리에 담기·♡, 순간에 댓글 — 각각 별개의 줄이다.
 await communityRepo.setFavorite({productId:PRODUCT,shareId:SHARE,subjectId:'bob',enabled:true});
 await communityRepo.setReaction({productId:PRODUCT,shareId:SHARE,subjectId:'anna',enabled:true,kind:'heart'});
 clockMs=at(2026,10,21,10,30);
 const comment=await call(handle,'POST',momentPath(own,'/comments'),{account:'bob',key:'news-key-0001',body:{body:'소식이 될 댓글'}});
 assert.equal(comment.status,201);
 // 다음 날(11-22 KST) 같은 순간의 ♡는 새 줄이다 — 하루 묶음이므로 섞이지 않는다.
 clockMs=at(2026,10,21,20); // KST 11-22 05:00
 assert.equal((await call(handle,'PUT',momentPath(own,'/reaction'),{account:'dave'})).status,200);
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.equal(list.status,200);
 const lines=list.body.lines;
 assert.equal(lines.length,5,'줄은 다섯 — 순간♡(22일)·댓글·담기·순간♡(21일 3개)·트리♡');
 assert.deepEqual(lines.map(line=>[line.kind,line.targetKind,line.count]),[
  ['heart','moment',1],['comment','moment',1],['favorite','tree',1],['heart','moment',3],['heart','tree',1]
 ]);
 assert.equal(lines[0].day,'2026-11-22','KST 05:00은 다음 날이다');
 assert.equal(lines[3].day,'2026-11-21');
 assert.equal(lines[3].momentId,own);
 assert.equal(lines[1].lastBody,'소식이 될 댓글','댓글 줄에는 가장 최근 본문이 함께 온다');
 assert.equal(lines[2].momentId,'','트리 줄에는 순간이 없다');
 assert.equal(lines[0].treeId,tree.id,'어느 트리의 소식인지 treeId 가 함께 온다');
 assert.ok(lines.every(line=>line.aiCount===0),'사람 것만 있으면 aiCount 는 0이다');
 assert.ok(list.body.lastReadAt,'목록을 열면 읽은 시각이 내려온다');
});

test('목록을 열면 그 시점까지 읽음 — 안 읽은 수는 0이 되고, 새 소식이 생기면 다시 센다',async()=>{
 const {handle,tree,newsService}=await setup();
 const own=tree.moments[0].id,second=tree.moments[1].id;
 // 두 줄 분량: m0의 ♡ 한 줄(두 사람), m1의 ♡ 한 줄.
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'bob'});
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'anna'});
 await call(handle,'PUT',momentPath(second,'/reaction'),{account:'carol'});
 const before=await call(handle,'GET',unreadPath,{account:'alice'});
 assert.equal(before.status,200);
 assert.equal(before.body.unreadCount,2,'안 읽은 줄 수 — 묶음 단위다');
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.equal(list.status,200);
 assert.equal(list.body.lines.length,2);
 const after=await call(handle,'GET',unreadPath,{account:'alice'});
 assert.equal(after.body.unreadCount,0,'목록을 열었으므로 0이다');
 // 읽은 뒤 같은 줄에 새 소식이 쌓이면 그 줄은 다시 안 읽은 것이다.
 clockMs+=60*60*1000;
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'erin'});
 const again=await call(handle,'GET',unreadPath,{account:'alice'});
 assert.equal(again.body.unreadCount,1,'새 일이 생긴 줄 하나만 다시 센다');
 const secondRead=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.equal(secondRead.body.lines.length,2,'목록은 읽었든 아니든 전체 줄을 내려준다');
 assert.ok(String(secondRead.body.lastReadAt)>String(list.body.lastReadAt),'읽은 시각은 앞으로만 간다');
 // 읽음 표시는 안 읽은 수를 볼 때 일어나지 않는다(점은 사라지지 않는다).
 const fresh=await setup();
 assert.equal((await call(fresh.handle,'GET',unreadPath,{account:'alice'})).body.unreadCount,0,'소식이 없으면 0이다');
 assert.equal((await call(fresh.handle,'GET',unreadPath,{account:'alice'})).body.unreadCount,0,'보는 것만으로는 읽음이 아니다');
});

test('시험 계정이 남긴 ♡·댓글·담기는 소식과 안 읽은 수에서 빠진다',async()=>{
 const {handle,communityRepo,tree}=await setup({roles:{tester:'tester'}});
 const own=tree.moments[0].id;
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'tester'});
 await call(handle,'POST',momentPath(own,'/comments'),{account:'tester',key:'tester-key-0001',body:{body:'시험 계정 댓글'}});
 await communityRepo.setReaction({productId:PRODUCT,shareId:SHARE,subjectId:'tester',enabled:true,kind:'heart'});
 await communityRepo.setFavorite({productId:PRODUCT,shareId:SHARE,subjectId:'tester',enabled:true});
 assert.equal((await call(handle,'GET',unreadPath,{account:'alice'})).body.unreadCount,0,'시험 계정만 남겼으면 소식이 아니다');
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'bob'});
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.equal(list.body.lines.length,1,'사람 것이 한 줄만 남는다');
 assert.equal(list.body.lines[0].kind,'heart');
 assert.equal(list.body.lines[0].count,1,'시험 계정의 ♡는 줄의 수에도 섞이지 않는다');
});

test('내가 내 트리에 남긴 ♡·댓글·담기는 소식이 아니다',async()=>{
 const {handle,communityRepo,tree}=await setup();
 const own=tree.moments[0].id;
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'alice'});
 await call(handle,'POST',momentPath(own,'/comments'),{account:'alice',key:'self-key-0001',body:{body:'내가 남긴 댓글'}});
 await communityRepo.setFavorite({productId:PRODUCT,shareId:SHARE,subjectId:'alice',enabled:true});
 await communityRepo.setReaction({productId:PRODUCT,shareId:SHARE,subjectId:'alice',enabled:true,kind:'heart'});
 const unread=await call(handle,'GET',unreadPath,{account:'alice'});
 assert.equal(unread.body.unreadCount,0,'자기 것이면 소식도 숫자도 아니다');
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.equal(list.body.lines.length,0);
});

test('숨김·삭제된 댓글은 소식에서 빠진다',async()=>{
 const {handle,communityRepo,tree}=await setup();
 const own=tree.moments[0].id,second=tree.moments[1].id;
 const visible=await call(handle,'POST',momentPath(own,'/comments'),{account:'bob',key:'hide-key-0001',body:{body:'남을 댓글'}});
 assert.equal(visible.status,201);
 const hiddenComment=await call(handle,'POST',momentPath(second,'/comments'),{account:'bob',key:'hide-key-0002',body:{body:'운영이 숨길 댓글'}});
 const deletedComment=await call(handle,'POST',momentPath(own,'/comments'),{account:'bob',key:'hide-key-0003',body:{body:'스스로 삭제할 댓글'}});
 await communityRepo.deleteComment({productId:PRODUCT,commentId:hiddenComment.body.comment.id,subjectId:'admin',admin:true});
 await communityRepo.deleteComment({productId:PRODUCT,commentId:deletedComment.body.comment.id,subjectId:'bob',admin:false});
 const before=await call(handle,'GET',unreadPath,{account:'alice'});
 assert.equal(before.body.unreadCount,1,'보이는 댓글 한 줄이 안 읽은 소식이다 — 숨김·삭제 줄은 세지 않는다');
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.equal(list.body.lines.length,1,'보이는 댓글 한 줄만 남는다');
 assert.equal(list.body.lines[0].lastBody,'남을 댓글');
 const after=await call(handle,'GET',unreadPath,{account:'alice'});
 assert.equal(after.body.unreadCount,0,'목록을 열었으므로 읽음이다');
});

test('AI 명예회원이 남긴 소식은 aiCount로 구분된다',async()=>{
 const {handle,tree}=await setup({roles:{ai:'ai_customer'}});
 const own=tree.moments[0].id;
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'ai'});
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'bob'});
 await call(handle,'POST',momentPath(own,'/comments'),{account:'ai',key:'ai-key-0001',body:{body:'명예회원 댓글'}});
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 const heartLine=list.body.lines.find(line=>line.kind==='heart');
 const commentLine=list.body.lines.find(line=>line.kind==='comment');
 assert.equal(heartLine.count,2,'명예회원 몫도 줄의 수에는 들어간다(2단계 공개 숫자와 같은 방식)');
 assert.equal(heartLine.aiCount,1,'그중 명예회원 몫이 구분된다');
 assert.equal(commentLine.count,1);
 assert.equal(commentLine.aiCount,1);
});

test('내 소식 경로는 로그인이 필요하고, 다른 메서드·나머지 커뮤니티 경로는 기존 길로 간다',async()=>{
 const {handle,tree}=await setup();
 const own=tree.moments[0].id;
 assert.equal((await call(handle,'GET',myNewsPath)).status,401,'로그인 없이는 못 본다');
 assert.equal((await call(handle,'GET',unreadPath)).status,401);
 const posted=await call(handle,'POST',myNewsPath,{account:'alice',body:{}});
 assert.equal(posted.status,404,'읽기 전용 — 다른 메서드는 기존 커뮤니티 판정(404)을 따른다');
 assert.equal(posted.body.error.code,'not_found');
 // 폴백 사슬이 살아 있다 — 순간 쓰기·읽기는 이 핸들러 한 곳으로도 된다(운영 조립과 같다).
 await call(handle,'PUT',momentPath(own,'/reaction'),{account:'bob'});
 const stats=await call(handle,'GET',momentPath(own),{account:'alice'});
 assert.equal(stats.status,200);
 assert.equal(stats.body.hearts,1);
});

test('하루 경계는 한국 날짜(Asia/Seoul) 기준이다',async()=>{
 const {handle,communityRepo}=await setup();
 clockMs=at(2026,10,21,14,30); // KST 11-21 23:30 — 아직 11-21이다
 await communityRepo.setReaction({productId:PRODUCT,shareId:SHARE,subjectId:'bob',enabled:true,kind:'heart'});
 clockMs=at(2026,10,21,15,30); // KST 11-22 00:30 — 11-22가 됐다
 await communityRepo.setReaction({productId:PRODUCT,shareId:SHARE,subjectId:'anna',enabled:true,kind:'heart'});
 const list=await call(handle,'GET',myNewsPath,{account:'alice'});
 assert.deepEqual(list.body.lines.map(line=>line.day),['2026-11-22','2026-11-21'],'UTC 0시가 아니라 KST 0시로 하루가 갈린다');
 assert.deepEqual(list.body.lines.map(line=>line.count),[1,1]);
});
