import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree,addMoment} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createMemoryTreeVisibilityRepo} from '../server/testing/memory-tree-visibility-repo.js';
import {createMomentCommunityHandler,createMomentCommunityService} from '../server/moment-community-service.js';
import {createCommunityHandler,createCommunityService} from '../server/community-service.js';
import {ApiError} from '../server/errors.js';

const PRODUCT='lovetree-test',principal=subjectId=>({productId:PRODUCT,subjectId});
const CLOCK='2026-11-01T00:00:00.000Z';
const PHOTO='https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg';
const SHARE='s'.repeat(24);
const momentPath=(momentId,suffix='')=>`/api/community/shares/${SHARE}/moments/${momentId}${suffix}`;
const commentPath=momentId=>momentPath(momentId,'/comments');
const reactionPath=momentId=>momentPath(momentId,'/reaction');

// #1098 2단계 시험 — 순간 단위 ♡·댓글 서버 규칙(러브버드 규칙). 화면 파일은 이번에 다루지 않는다.
async function setup({roles={}}={}){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 let tree=createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url:PHOTO},CLOCK);
 tree=addMoment(tree,{type:'note',note:'이어지는 순간'},tree.moments[0].id,CLOCK);
 const other=createTree({subject:'다른기록',title:'감춰진 사본',note:'공유하지 않은 트리',emotion:'위로',date:'2026-11-02',url:PHOTO},CLOCK);
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree,other]},expectedRevision:0,clientKey:'seed'});
 const shareRepo=createMemoryShareRepo();
 let share=await shareRepo.create({productId:PRODUCT,shareId:SHARE,subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 share=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 const visibilityRepo=createMemoryTreeVisibilityRepo();
 const roleFor=async ({subjectId})=>subjectId==='admin'?'admin':(roles[subjectId]??null);
 const communityRepo=createMemoryCommunityRepo({now:()=>CLOCK,roleFor});
 communityRepo.seedShares([share]);
 const adminStub={roleFor};
 let id=0;
 const makeId=()=>String(++id).padStart(24,'c');
 const momentService=createMomentCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo,productId:PRODUCT,admin:adminStub,makeId,now:()=>Date.UTC(2026,10,1)});
 // 무대 조회(/stage)는 기존 커뮤니티 핸들러 경로 — 라우팅 폴백이 이어지는지 보기 위한 껍데기다.
 const treeService=createCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo,stageVoteRepo:{resolveMoment:async input=>({stageId:'stub',...input})},productId:PRODUCT,admin:adminStub,makeId,now:()=>Date.UTC(2026,10,1)});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 const handle=createMomentCommunityHandler({authenticate,service:momentService,productId:PRODUCT,
  fallback:createCommunityHandler({authenticate,service:treeService,productId:PRODUCT})});
 return {tree,other,workspaceRepo,shareRepo,communityRepo,visibilityRepo,service:momentService,handle};
}
const call=(handle,method,path,{body,account,key,query}={})=>handle({method,path,query:new URLSearchParams(query||''),headers:{...(account?{account}:{}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},body:body?JSON.stringify(body):''});

test('트리와 순간이 둘 다 공개일 때만 순간 ♡·댓글을 남길 수 있다(공개/비공개 조합 4가지)',async()=>{
 const {handle,tree,other,visibilityRepo}=await setup();
 const own=tree.moments[0].id,second=tree.moments[1].id,hidden=other.moments[0].id;
 // ① 트리 공개 × 순간 공개(공개 사본에 있음) → 허용
 const heart=await call(handle,'PUT',reactionPath(own),{account:'bob'});
 assert.equal(heart.status,200);assert.equal(heart.body.hearts,1);assert.equal(heart.body.hearted,true);
 const comment=await call(handle,'POST',commentPath(own),{account:'bob',key:'combo-key-0001',body:{body:'순간에 남기는 마음'}});
 assert.equal(comment.status,201);assert.equal(comment.body.comment.mine,true);
 // ② 트리 공개 × 순간 비공개(공유된 트리의 공개 사본에 없음 — 다른 트리의 순간) → 404 거부
 assert.equal((await call(handle,'PUT',reactionPath(hidden),{account:'bob'})).status,404);
 assert.equal((await call(handle,'POST',commentPath(hidden),{account:'bob',key:'combo-key-0002',body:{body:'숨긴 사본'}})).status,404);
 // ③ 트리 비공개 × 순간 공개(문서에는 있음) → 404 거부(없는 것과 같이)
 await visibilityRepo.set({productId:PRODUCT,subjectId:'alice',treeId:tree.id,visibility:'private'});
 assert.equal((await call(handle,'PUT',reactionPath(own),{account:'bob'})).status,404);
 assert.equal((await call(handle,'POST',commentPath(second),{account:'bob',key:'combo-key-0003',body:{body:'비공개 트리'}})).status,404);
 assert.equal((await call(handle,'GET',commentPath(own))).status,404);
 assert.equal((await call(handle,'GET',momentPath(own))).status,404);
 // ④ 트리 비공개 × 순간 비공개 → 404 거부
 assert.equal((await call(handle,'PUT',reactionPath(hidden),{account:'bob'})).status,404);
 // 비로그인 쓰기는 막고, 읽기는 로그인 없이 열려 있다(트리를 다시 공개로).
 await visibilityRepo.set({productId:PRODUCT,subjectId:'alice',treeId:tree.id,visibility:'public'});
 assert.equal((await call(handle,'PUT',reactionPath(own))).status,401);
 assert.equal((await call(handle,'POST',commentPath(own),{key:'combo-key-0004',body:{body:'로그인 없이'}})).status,401);
 const read=await call(handle,'GET',commentPath(own));
 assert.equal(read.status,200);assert.equal(read.body.comments.length,1);
 const stats=await call(handle,'GET',momentPath(own));
 assert.equal(stats.status,200);assert.equal(stats.body.hearts,1);
});

test('순간 통계 응답은 허용 목록만 내린다',async()=>{
 const {handle,tree,communityRepo}=await setup();
 communityRepo.momentStats=async()=>({hearts:1,aiHearts:0,comments:2,hearted:true,futureStat:'future-moment-stat'});
 const read=await call(handle,'GET',momentPath(tree.moments[0].id));
 assert.deepEqual(Object.keys(read.body).sort(),['aiHearts','comments','hearted','hearts']);
 const reaction=await call(handle,'PUT',reactionPath(tree.moments[0].id),{account:'bob'});
 assert.deepEqual(Object.keys(reaction.body).sort(),['aiHearts','comments','hearted','hearts']);
 assert.equal(JSON.stringify(reaction.body).includes('future'),false);
});

test('같은 요청 두 번은 한 건만 — 댓글은 idempotency 키로, 반응은 한 칸으로',async()=>{
 const {handle,tree,communityRepo}=await setup();
 const own=tree.moments[0].id,second=tree.moments[1].id;
 // 반응: 같은 ♡ 요청을 두 번 보내도 칸은 하나다.
 await call(handle,'PUT',reactionPath(own),{account:'bob'});
 const replayHeart=await call(handle,'PUT',reactionPath(own),{account:'bob'});
 assert.equal(replayHeart.status,200);assert.equal(replayHeart.body.hearts,1);
 assert.equal(communityRepo.inspect().momentReactions.length,1);
 // 댓글: 같은 키의 두 번째 요청은 첫 행을 돌려준다(본문은 첫 요청 그대로).
 const first=await call(handle,'POST',commentPath(own),{account:'bob',key:'dup-key-0001',body:{body:'첫 요청'}});
 const replay=await call(handle,'POST',commentPath(own),{account:'bob',key:'dup-key-0001',body:{body:'다시 보낸 요청'}});
 assert.equal(first.status,201);assert.equal(replay.body.comment.id,first.body.comment.id);
 assert.equal(replay.body.comment.body,'첫 요청');
 assert.equal(communityRepo.inspect().comments.length,1);
 // 키 없이는 받지 않는다(기존 댓글 규칙과 같다).
 const keyless=await call(handle,'POST',commentPath(own),{account:'bob',body:{body:'키 없음'}});
 assert.equal(keyless.status,400);assert.equal(keyless.body.error.code,'idempotency_key_required');
 // 같은 키라도 대상 순간이 다르면 다른 요청이다(유일 제약이 대상까지 본다).
 const otherMoment=await call(handle,'POST',commentPath(second),{account:'bob',key:'dup-key-0001',body:{body:'다른 순간 같은 키'}});
 assert.equal(otherMoment.status,201);assert.notEqual(otherMoment.body.comment.id,first.body.comment.id);
 assert.equal(communityRepo.inspect().comments.length,2);
});

test('순간 반응 종류는 ♡ 하나다',async()=>{
 const {handle,tree}=await setup();
 const own=tree.moments[0].id;
 for(const kind of ['like','love','laugh','wow','sad','angry']){
  const bad=await call(handle,'PUT',reactionPath(own),{account:'bob',body:{kind}});
  assert.equal(bad.status,400);assert.equal(bad.body.error.code,'reaction_kind_invalid');
 }
 const badOff=await call(handle,'DELETE',reactionPath(own),{account:'bob',query:'kind=like'});
 assert.equal(badOff.status,400);
 // ♡는 켰다 끌 수 있다.
 const on=await call(handle,'PUT',reactionPath(own),{account:'bob',body:{kind:'heart'}});
 assert.equal(on.status,200);assert.equal(on.body.hearts,1);
 const off=await call(handle,'DELETE',reactionPath(own),{account:'bob'});
 assert.equal(off.status,200);assert.equal(off.body.hearts,0);assert.equal(off.body.hearted,false);
});

test('쓰기 횟수 제한 — 댓글 12·반응 40을 넘으면 429',async()=>{
 const {handle,tree}=await setup();
 const own=tree.moments[0].id;
 for(let index=0;index<12;index+=1){
  const made=await call(handle,'POST',commentPath(own),{account:'bob',key:'rate-key-'+String(index).padStart(4,'0'),body:{body:'댓글 '+index}});
  assert.equal(made.status,201);
 }
 const limited=await call(handle,'POST',commentPath(own),{account:'bob',key:'rate-key-9999',body:{body:'넘는 요청'}});
 assert.equal(limited.status,429);assert.equal(limited.body.error.code,'rate_limited');
 for(let index=0;index<40;index+=1){
  const toggled=await call(handle,index%2?'DELETE':'PUT',reactionPath(own),{account:'bob'});
  assert.equal(toggled.status,200);
 }
 const reactionLimited=await call(handle,'PUT',reactionPath(own),{account:'bob'});
 assert.equal(reactionLimited.status,429);
 // 다른 사람의 창은 따로 센다.
 const other=await call(handle,'PUT',reactionPath(own),{account:'anna'});
 assert.equal(other.status,200);
});

test('공개 숫자에서 시험 계정은 빠지고, AI 명예회원은 aiHearts·aiTester 비트로 구분된다',async()=>{
 const {handle,tree,communityRepo}=await setup({roles:{tester:'tester',ai:'ai_customer'}});
 const own=tree.moments[0].id;
 // 시험 계정(tester)의 ♡·댓글은 쓰기는 되지만 공개 숫자·목록에서는 빠진다.
 const testerHeart=await call(handle,'PUT',reactionPath(own),{account:'tester'});
 assert.equal(testerHeart.status,200);assert.equal(testerHeart.body.hearts,0);assert.equal(testerHeart.body.hearted,true);
 await call(handle,'POST',commentPath(own),{account:'tester',key:'tester-key-0001',body:{body:'시험 계정 댓글'}});
 // AI 명예회원(ai_customer)의 ♡·댓글은 숫자에 들어가고, 구분 비트로 내려간다.
 const aiHeart=await call(handle,'PUT',reactionPath(own),{account:'ai'});
 assert.equal(aiHeart.status,200);assert.equal(aiHeart.body.hearts,1);assert.equal(aiHeart.body.aiHearts,1);
 const aiComment=await call(handle,'POST',commentPath(own),{account:'ai',key:'ai-key-0001',body:{body:'명예회원 댓글'}});
 assert.equal(aiComment.status,201);assert.equal(aiComment.body.comment.aiTester,true);
 const bobHeart=await call(handle,'PUT',reactionPath(own),{account:'bob'});
 assert.equal(bobHeart.body.hearts,2);assert.equal(bobHeart.body.aiHearts,1);
 const list=await call(handle,'GET',commentPath(own));
 const bodies=list.body.comments.map(row=>row.body);
 assert.deepEqual(bodies,['명예회원 댓글']);
 assert.equal(list.body.comments[0].aiTester,true);
 const stats=await call(handle,'GET',momentPath(own));
 assert.equal(stats.body.hearts,2);assert.equal(stats.body.aiHearts,1);assert.equal(stats.body.comments,1);
 assert.equal(communityRepo.inspect().momentReactions.length,3);
 // 시험 계정 트리 자체는 기존 규칙(#678)대로 목록에서 빠진다 — 이번에 바꾸지 않는다.
});

test('순간 댓글 신고·숨기기는 같은 운영센터 길로 — 댓글만 숨겨지고 감사 기록이 남는다',async()=>{
 const {handle,tree,communityRepo}=await setup();
 const own=tree.moments[0].id;
 const made=await call(handle,'POST',commentPath(own),{account:'bob',key:'ops-key-0001',body:{body:'숨겨야 할 댓글'}});
 const report=await call(handle,'POST',momentPath(own,`/comments/${made.body.comment.id}/report`),{account:'eve',key:'ops-report-0001',body:{reason:'숨겨야 할 댓글이에요'}});
 assert.equal(report.status,201);
 const replay=await call(handle,'POST',momentPath(own,`/comments/${made.body.comment.id}/report`),{account:'eve',key:'ops-report-0001',body:{reason:'숨겨야 할 댓글이에요'}});
 assert.equal(replay.body.report.id,report.body.report.id);
 // 기존 운영센터 목록(관리자 경로)에 그대로 나온다 — 어떤 댓글인지 commentId 로.
 const reports=await call(handle,'GET','/api/community/admin/reports',{account:'admin'});
 assert.equal(reports.status,200);
 const row=reports.body.reports.find(item=>item.id===report.body.report.id);
 assert.ok(row);assert.equal(row.commentId,made.body.comment.id);
 // 숨기기: 댓글만 숨겨진다 — 트리(공유)는 그대로 남는다.
 const done=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'resolved',visibility:'hidden'}});
 assert.equal(done.status,200);assert.equal(done.body.report.status,'resolved');assert.equal(done.body.report.hidden,true);
 assert.equal((await call(handle,'GET',commentPath(own))).body.comments.length,0);
 assert.equal((await call(handle,'GET','/api/community/shares')).body.items.length,1);
 const audits=communityRepo.inspect().audits;
 assert.ok(audits.some(item=>item.action==='hide_comment'));
 assert.ok(audits.some(item=>item.action==='resolved'));
 assert.equal(communityRepo.inspect().hiddenShares.length,0);
 // 기각: 상태만 바뀌고 댓글 복구는 없다(트리 댓글과 같다).
 const dismiss=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'dismissed',visibility:'visible'}});
 assert.equal(dismiss.body.report.status,'dismissed');
 assert.ok(communityRepo.inspect().audits.some(item=>item.action==='dismissed'));
});

test('순간 댓글 고치기·지우기는 기존 댓글 경로를 그대로 쓴다',async()=>{
 const {handle,tree,communityRepo}=await setup();
 const own=tree.moments[0].id;
 const made=await call(handle,'POST',commentPath(own),{account:'bob',key:'edit-key-0001',body:{body:'처음 문구'}});
 const id=made.body.comment.id;
 const other=await call(handle,'PATCH',`/api/community/comments/${id}`,{account:'eve',body:{body:'남의 문구'}});
 assert.equal(other.status,403);assert.equal(other.body.error.code,'comment_forbidden');
 const edited=await call(handle,'PATCH',`/api/community/comments/${id}`,{account:'bob',body:{body:'고친 문구'}});
 assert.equal(edited.status,200);assert.equal(edited.body.comment.body,'고친 문구');assert.equal(edited.body.comment.edited,true);
 const list=await call(handle,'GET',commentPath(own));
 assert.equal(list.body.comments[0].body,'고친 문구');
 const removed=await call(handle,'DELETE',`/api/community/comments/${id}`,{account:'admin'});
 assert.equal(removed.status,200);
 assert.equal(communityRepo.inspect().audits.some(item=>item.action==='hide_comment'),true);
 assert.equal((await call(handle,'GET',commentPath(own))).body.comments.length,0);
});

test('차단한 기록의 순간에는 ♡·댓글을 남길 수 없다',async()=>{
 const {handle,tree}=await setup();
 const own=tree.moments[0].id;
 const blocked=await call(handle,'POST',`/api/community/shares/${SHARE}/block`,{account:'bob'});
 assert.equal(blocked.status,200);
 const reaction=await call(handle,'PUT',reactionPath(own),{account:'bob'});
 assert.equal(reaction.status,403);assert.equal(reaction.body.error.code,'reaction_blocked');
 const comment=await call(handle,'POST',commentPath(own),{account:'bob',key:'block-key-0001',body:{body:'차단 뒤 댓글'}});
 assert.equal(comment.status,403);assert.equal(comment.body.error.code,'comment_blocked');
});

test('잘못된 공유·순간 주소는 404로 닫힌다',async()=>{
 const {handle,tree}=await setup();
 const own=tree.moments[0].id;
 assert.equal((await call(handle,'PUT','/api/community/shares/short/moments/'+own+'/reaction',{account:'bob'})).status,404);
 assert.equal((await call(handle,'PUT',momentPath('..%2Fescape','/reaction'),{account:'bob'})).status,404);
 assert.equal((await call(handle,'GET',momentPath(own,'/stage'))).body.stageId,'stub','무대 조회는 기존 경로로 그대로 간다');
});

test('숨긴 공유는 순간 커뮤니티 읽기·쓰기·신고를 닫는다', async () => {
 const {handle,tree,communityRepo}=await setup(), momentId=tree.moments[0].id;
 const comment=await call(handle,'POST',commentPath(momentId),{account:'bob',key:'moment-hidden-seed-1',body:{body:'기존 댓글'}});
 assert.equal(comment.status,201);
 assert.equal((await call(handle,'PUT',reactionPath(momentId),{account:'bob'})).status,200);
 await communityRepo.createReport({productId:PRODUCT,reportId:'moment-hidden-report',shareId:SHARE,subjectId:'moderator',reason:'관리 검토',clientKey:'moment-hidden-report-1'});
 await communityRepo.moderateReport({productId:PRODUCT,reportId:'moment-hidden-report',status:'resolved',visibility:'hidden',actorSubjectId:'moderator'});
 const before=communityRepo.inspect();
 const requests=[
  ['GET',momentPath(momentId),{}],
  ['GET',commentPath(momentId),{}],
  ['POST',commentPath(momentId),{account:'eve',key:'moment-hidden-new-1',body:{body:'추가 댓글'}}],
  ['PUT',reactionPath(momentId),{account:'eve'}],
  ['DELETE',reactionPath(momentId),{account:'bob'}],
  ['PATCH','/api/community/comments/'+comment.body.comment.id,{account:'bob',body:{body:'수정'}}],
  ['DELETE','/api/community/comments/'+comment.body.comment.id,{account:'bob'}],
  ['POST',momentPath(momentId,'/comments/'+comment.body.comment.id+'/report'),{account:'eve',key:'moment-hidden-report-2',body:{reason:'관리 검토'}}]
 ];
 for(const [method,path,options] of requests){
  const response=await call(handle,method,path,options);
  assert.equal(response.status,404,method+' '+path);
  assert.equal(response.body.error.code,'share_not_found',method+' '+path);
 }
 const after=communityRepo.inspect();
 for(const key of ['comments','momentReactions','reports'])
  assert.deepEqual(after[key],before[key],key+' 기존 행 보존');
});
