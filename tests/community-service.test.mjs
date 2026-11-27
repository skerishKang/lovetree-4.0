import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree,editTree,addMoment} from '../src/domain.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import { createMemoryTreeDiscoverRepo } from '../server/testing/memory-tree-discover-repo.js';
import {createCommunityHandler,createCommunityService} from '../server/community-service.js';
import {createShareService} from '../server/share-service.js';
import {readStoredDocument} from '../server/workspace-service.js';
import {ApiError} from '../server/errors.js';
import {createAdminRoleService} from '../server/admin-roles.js';

const PRODUCT='lovetree-test',principal=subjectId=>({productId:PRODUCT,subjectId});
const CLOCK='2026-11-01T00:00:00.000Z';
const PHOTO='https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg';
function sampleTree(url=PHOTO){return createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url},CLOCK);}
async function setup({url=PHOTO,coverMode='',coverDesign='',mediaMetadata=null,admin=null,signupAtFor=null}={}){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 let tree=sampleTree(url);
 if(mediaMetadata)tree={...tree,moments:tree.moments.map((moment,index)=>index===0?{...moment,mediaMetadata}:moment)};
 if(coverMode)tree=editTree(tree,{title:tree.title,subject:tree.subject,coverMomentId:tree.moments[0].id,coverDesign,coverMode});
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed'});
 const shareRepo=createMemoryShareRepo();let share=await shareRepo.create({productId:PRODUCT,shareId:'s'.repeat(24),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 share=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo({now:()=>CLOCK});communityRepo.seedShares([share]);
 const adminStub=admin||{roleFor:async value=>value.subjectId==='admin'?'admin':null};
 let id=0;
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:adminStub,makeId:()=>String(++id).padStart(24,'c'),now:()=>Date.UTC(2026,10,1),signupAtFor});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 return {tree,workspaceRepo,shareRepo,communityRepo,service,handle:createCommunityHandler({authenticate,service,productId:PRODUCT})};
}
const call=(handle,method,path,{body,account,key,query}={})=>handle({method,path,query:new URLSearchParams(query||''),headers:{...(account?{account}:{}),...(body?{'content-type':'application/json'}:{}),...(key?{'idempotency-key':key}:{})},body:body?JSON.stringify(body):''});

// SQL 소속·표의 정합성은 격리 PostgreSQL에서, 여기서는 인증·경계·응답 계약을 검사한다.
function stageRequests({ at, now=()=>at, signupAtFor, stageVoteRepo }) {
 const service=createCommunityService({productId:PRODUCT,now,signupAtFor,stageVoteRepo});
 return createCommunityHandler({productId:PRODUCT,service,authenticate:async ({headers})=>{
  if(!headers.account)throw new ApiError(401,'unauthenticated','로그인이 필요해요.');
  return principal(headers.account);
 }});
}

test('무대 PUT은 가입 7일 정각부터 허용하고 철회된 무대와 비로그인 쓰기를 막는다',async()=>{
 const at=Date.parse('2026-11-22T15:00:00Z'), week=7*86400000, writes=[];
 const stageVoteRepo={
  detail:async ({stageId})=>stageId==='visible'?{stageId}:null,
  setVote:async input=>{writes.push(input);return input.enabled&&input.stageId==='visible'?{saved:true,voted:true,weeklyVoters:null}:null;}
 };
 const signupAtFor=async ({subjectId})=>({eligible:new Date(at-week),young:new Date(at-week+1),invalid:'invalid'}[subjectId]);
 const handle=stageRequests({at,signupAtFor,stageVoteRepo});
 const vote=(account,id='visible',method='PUT')=>call(handle,method,'/api/community/stages/'+id+'/vote',{account});
 for(const account of ['young','missing','invalid']){
  const denied=await vote(account);
  assert.equal(denied.status,403);
  assert.equal(denied.body.error.code,'vote_too_new');
  assert.match(denied.headers['cache-control'],/no-store/);
 }
 assert.equal((await vote('young','withdrawn')).status,404);
 for(const method of ['PUT','DELETE'])assert.equal((await vote(undefined,'visible',method)).status,401);
 assert.equal(writes.length,0);
 const admitted=await vote('eligible');
 assert.equal(admitted.status,200);
 assert.deepEqual(admitted.body,{saved:true,voted:true,weeklyVoters:null});
 assert.deepEqual(writes[0],{productId:PRODUCT,stageId:'visible',subjectId:'eligible',enabled:true,votedAt:'2026-11-22T15:00:00.000Z',
  since:'2026-11-22T15:00:00.000Z',until:'2026-11-29T15:00:00.000Z'});
 assert.equal((await vote('eligible','withdrawn')).body.error.code,'stage_not_found');
 const removed=await vote('young','withdrawn','DELETE');
 assert.equal(removed.status,204);
 assert.equal(removed.body,undefined);
 assert.equal(writes.at(-1).enabled,false);
 let clock=at-1;
 const crossing=stageRequests({now:()=>clock,stageVoteRepo,signupAtFor:async()=>{
  clock=at;
  return new Date(at-week);
 }});
 assert.equal((await call(crossing,'PUT','/api/community/stages/visible/vote',{account:'crossing'})).status,403);
 assert.equal(writes.some(input=>input.subjectId==='crossing'),false);
});

test('공개 무대 조회는 열람자·한국 주 경계·다른 트리 커서를 전달하고 쓰기 횟수를 제한한다',async()=>{
 const at=Date.parse('2026-11-22T14:59:59.999Z'), calls=[];
 const shareId='s'.repeat(24),cursor='t'.repeat(24);
 const stageVoteRepo={
  resolveMoment:async input=>{calls.push(input);return {stageId:'public-stage'};},
  detail:async input=>{calls.push(input);return {stageId:input.stageId};},
  popular:async input=>{calls.push(input);return [];},
  setVote:async()=>undefined
 };
 const handle=stageRequests({at,stageVoteRepo});
 const resolved=await call(handle,'GET','/api/community/shares/'+shareId+'/moments/m0/stage');
 assert.deepEqual(resolved.body,{stageId:'public-stage'});
 assert.deepEqual(calls.at(-1),{productId:PRODUCT,viewerSubjectId:null,shareId,momentId:'m0'});
 const popular=await call(handle,'GET','/api/community/stages/popular');
 assert.deepEqual(popular.body,{weekStart:'2026-11-15T15:00:00.000Z',weekEndExclusive:'2026-11-22T15:00:00.000Z',items:[]});
 const detail=await call(handle,'GET','/api/community/stages/public-stage',{account:'viewer',query:{currentShareId:shareId,cursor}});
 assert.equal(detail.status,200);
 assert.equal(calls.at(-1).viewerSubjectId,'viewer');
 assert.equal(calls.at(-1).currentShareId,shareId);
 assert.equal(calls.at(-1).afterShareId,cursor);
 assert.equal((await call(handle,'GET','/api/community/stages/public-stage',{query:{cursor:'?'}})).status,400);
 for(const res of [resolved,popular,detail])assert.match(res.headers['cache-control'],/no-store/);
 for(let i=0;i<40;i++)assert.equal((await call(handle,'DELETE','/api/community/stages/s/vote',{account:'viewer'})).status,204);
 assert.equal((await call(handle,'PUT','/api/community/stages/s/vote',{account:'viewer'})).status,429);
});

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

test('비YouTube 링크 표지는 공개 HTTPS 썸네일만 쓰고 일반·위험 링크 주소는 대체하지 않는다',async()=>{
 const external='https://images.example.com/articles/og.jpg';
 const linked=await setup({url:'https://example.com/article',coverMode:'moment',mediaMetadata:{title:'기사 제목',channel:'기사 채널',thumbnail:external}});
 const card=(await call(linked.handle,'GET','/api/community/shares')).body.items[0];
 assert.equal(card.cover.thumbnailUrl,external);
 const blocked=await setup({url:'https://example.com/article',coverMode:'moment',mediaMetadata:{title:'기사 제목',thumbnail:'javascript:alert(1)'}});
 const blockedCard=(await call(blocked.handle,'GET','/api/community/shares')).body.items[0];
 assert.equal(blockedCard.cover.thumbnailUrl,'');
 const plain=await setup({url:'http://example.com/article',coverMode:'moment'});
 assert.equal((await call(plain.handle,'GET','/api/community/shares')).body.items[0].cover.thumbnailUrl,'','평문 링크 주소는 썸네일로 쓰지 않는다');
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

test('둘러보기 카드와 반응 응답은 통계 허용 목록만 내린다',async()=>{
 const {handle,communityRepo}=await setup(),shareId='s'.repeat(24);
 const summaries=communityRepo.listDiscoverableSummaries.bind(communityRepo);
 communityRepo.listDiscoverableSummaries=async input=>{
  const rows=await summaries(input);
  for(const row of rows){row.stats.futureStat='future-stat-value';row.stats.reactions.future='future-reaction';row.stats.mine.push('future');}
  return rows;
 };
 communityRepo.stats=async()=>({favorites:1,hearts:2,comments:3,favored:false,hearted:true,reactions:{heart:2,like:1,future:9},mine:['heart','future'],futureStat:'future-stat-value'});
 const list=await call(handle,'GET','/api/community/shares');
 const stats=list.body.items[0].stats;
 assert.deepEqual(Object.keys(stats).sort(),['comments','favored','favorites','hearted','hearts','mine','reactions','weeklyFavorites']);
 assert.deepEqual(Object.keys(stats.reactions).sort(),['angry','heart','laugh','love','sad','wow','like'].sort());
 assert.deepEqual(stats.mine,[]);
 const reaction=await call(handle,'PUT',`/api/community/shares/${shareId}/reaction`,{account:'bob',body:{kind:'like'}});
 assert.deepEqual(Object.keys(reaction.body.stats).sort(),['comments','favored','favorites','hearted','hearts','mine','reactions','voted','weeklyFavorites']);
 assert.equal(JSON.stringify(reaction.body).includes('future'),false);
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

// 담기 = 트리 투표(#824 대표 결정): 1인 1표 영구 + 가입 7일 게이트.
test('담기는 표를 남긴다 — 재담기에도 표는 하나고 응답에 표 유무·이번 주 수가 있다',async()=>{
 const DAY=24*60*60*1000,NOW=Date.UTC(2026,10,1); // 2026-11-01(일) — 이번 주는 10-26(월) 00:00 KST 시작
 const signupAtFor=async({subjectId})=>new Date(NOW-8*DAY).toISOString(); // bob: 가입 8일째 → 투표 가능
 const {handle,communityRepo}=await setup({signupAtFor}),shareId='s'.repeat(24);
 const first=await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
 assert.equal(first.status,200);
 assert.equal(first.body.stats.voted,true,'담으면 표가 있다');
 assert.equal(first.body.stats.weeklyFavorites,1,'이번 주 표 수가 응답에 따라온다');
 // 해제 뒤 재담기 — 표는 새로 세지 않는다(1인 1표 영구)
 await call(handle,'DELETE',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
 const again=await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
 assert.equal(again.status,200);
 assert.equal(again.body.stats.voted,true);
 assert.equal(again.body.stats.weeklyFavorites,1,'재담기로 표가 늘지 않는다');
 assert.equal(await communityRepo.hasVoted({productId:PRODUCT,targetKind:'tree',targetId:shareId,subjectId:'bob'}),true);
});

test('가입 7일 미만은 담기(투표)가 막힌다 — 403 vote_too_new, 안내 문구는 대표 결정 그대로',async()=>{
 const DAY=24*60*60*1000,NOW=Date.UTC(2026,10,1);
 const cases=[
  {label:'가입 3일째',at:new Date(NOW-3*DAY).toISOString()},
  {label:'가입 6일 23시간',at:new Date(NOW-7*DAY+60*1000).toISOString()},
  {label:'가입일을 못 읽음(행 없음)',at:null}
 ];
 for(const c of cases){
  const signupAtFor=async({subjectId})=>c.at;
  const {handle,communityRepo}=await setup({signupAtFor}),shareId='s'.repeat(24);
  const res=await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
  assert.equal(res.status,403,c.label);
  assert.equal(res.body.error?.code,'vote_too_new',c.label);
  assert.equal(res.body.error?.message,'가입하고 7일이 지나면 투표할 수 있어요.',c.label);
  assert.equal(await communityRepo.hasVoted({productId:PRODUCT,targetKind:'tree',targetId:shareId,subjectId:'bob'}),false,c.label+': 표도 남지 않는다');
  const list=await call(handle,'GET','/api/community/shares');
  assert.equal(list.body.items[0].stats.favorites,0,c.label+': 즐겨찾기도 남지 않는다');
 }
 // 경계: 정확히 7일째 되는 순간부터는 통과한다
 const boundary=await setup({signupAtFor:async()=>new Date(NOW-7*DAY).toISOString()}),shareId='s'.repeat(24);
 assert.equal((await call(boundary.handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'})).status,200,'7일째 되면 투표할 수 있다');
});

test('이번 주 표 수는 주 시작(월요일 0시 KST) 이후만 센다',async()=>{
 const DAY=24*60*60*1000,NOW=Date.UTC(2026,10,1);
 const {handle,communityRepo}=await setup({signupAtFor:async()=>new Date(NOW-30*DAY).toISOString()}),shareId='s'.repeat(24);
 // 지난 주(주 시작 전)에 남은 표 — 백필된 옛 담기 같은 경우
 await communityRepo.recordVote({productId:PRODUCT,targetKind:'tree',targetId:shareId,subjectId:'old-fan',votedAt:new Date(NOW-8*DAY).toISOString()});
 const res=await call(handle,'PUT',`/api/community/shares/${shareId}/favorite`,{account:'bob'});
 assert.equal(res.status,200);
 assert.equal(res.body.stats.weeklyFavorites,1,'지난 주 표는 이번 주 수에서 빠진다');
});

// #824 결정 2: 둘러보기 카드에 이번 주 표 수가 따라오고, sort=popular로 많이 담긴 순 정렬이 된다.
test('둘러보기 카드 stats에 weeklyFavorites가 있고 sort=popular로 정렬된다',async()=>{
 const DAY=24*60*60*1000,NOW=Date.UTC(2026,10,1);
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const treeA=sampleTree(),treeB=sampleTree();
 await workspace.write(principal('alice'),{state:{version:1,trees:[treeA]},expectedRevision:0,clientKey:'seed'});
 await workspace.write(principal('carol'),{state:{version:1,trees:[treeB]},expectedRevision:0,clientKey:'seed'});
 const shareRepo=createMemoryShareRepo();
 const sA=await shareRepo.create({productId:PRODUCT,shareId:'a'.repeat(24),subjectId:'alice',treeId:treeA.id,entryMomentId:treeA.moments[0].id,view:'book',momentCount:3});
 const sB=await shareRepo.create({productId:PRODUCT,shareId:'b'.repeat(24),subjectId:'carol',treeId:treeB.id,entryMomentId:treeB.moments[0].id,view:'book',momentCount:3});
 await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:sA.shareId,discoverable:true});
 await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'carol',shareId:sB.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo();communityRepo.seedShares([sA,sB]);
 // sB에 이번 주 표 2개, sA에 이번 주 1개 + 지난 주 1개
 await communityRepo.recordVote({productId:PRODUCT,targetKind:'tree',targetId:sB.shareId,subjectId:'v1',votedAt:new Date(NOW-1*DAY).toISOString()});
 await communityRepo.recordVote({productId:PRODUCT,targetKind:'tree',targetId:sB.shareId,subjectId:'v2',votedAt:new Date(NOW-2*DAY).toISOString()});
 await communityRepo.recordVote({productId:PRODUCT,targetKind:'tree',targetId:sA.shareId,subjectId:'v3',votedAt:new Date(NOW-1*DAY).toISOString()});
 await communityRepo.recordVote({productId:PRODUCT,targetKind:'tree',targetId:sA.shareId,subjectId:'v0',votedAt:new Date(NOW-8*DAY).toISOString()});
 let id=0;
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:{roleFor:async()=>null},makeId:()=>String(++id).padStart(24,'c'),now:()=>NOW});
 const popular=await service.discover({sort:'popular'});
 assert.deepEqual(popular.items.map(i=>i.shareId),[sB.shareId,sA.shareId],'많이 담긴 순으로 정렬된다');
 assert.equal(popular.items[0].stats.weeklyFavorites,2);
 assert.equal(popular.items[1].stats.weeklyFavorites,1,'지난 주 표는 카드 집계에서 빠진다');
 const latest=await service.discover({});
 assert.deepEqual(latest.items.map(i=>i.shareId),[sA.shareId,sB.shareId],'기본 정렬은 기존 순서를 유지한다');
 assert.equal(latest.items[0].stats.weeklyFavorites,1,'기본 정렬에서도 이번 주 수는 응답에 있다');
 const weird=await service.discover({sort:'nonsense'});
 assert.deepEqual(weird.items.map(i=>i.shareId),[sA.shareId,sB.shareId],'모르는 sort 값은 기본으로 돌린다');
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
 const before=await call(handle,'GET','/api/community/shares');
 const report=await call(handle,'POST',`/api/community/shares/${shareId}/report`,{account:'bob',key:'report-key-0001',body:{reason:'확인이 필요해요'}});
 assert.equal(report.status,201);
 assert.equal((await call(handle,'GET','/api/community/admin/reports',{account:'bob'})).status,403);
 const reports=await call(handle,'GET','/api/community/admin/reports',{account:'admin'});assert.equal(reports.body.reports.length,1);
 const done=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'resolved',visibility:'hidden'}});
 assert.equal(done.body.report.status,'resolved');assert.equal(done.body.report.hidden,true);assert.equal(communityRepo.inspect().audits.length,2);
 assert.deepEqual((await call(handle,'GET','/api/community/shares')).body.items,[]);
 const restored=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'dismissed',visibility:'visible'}});
 assert.equal(restored.body.report.hidden,false);assert.equal(communityRepo.inspect().audits.length,4);
 assert.deepEqual((await call(handle,'GET','/api/community/shares')).body.items,before.body.items,'숨김을 풀면 둘러보기 목록이 원래대로 돌아온다');
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

test('#627: 둘러보기 검색은 트리 순간의 제목(영상 제목 포함)도 본다',async()=>{
 // 트리 이름은 자동 이름('모아둔 순간')이고, 그룹 이름은 순간의 영상 제목에만 있다.
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const video='https://www.youtube.com/shorts/Rescene0001',savedThumbnail='https://img.youtube.com/vi/Rescene0001/hqdefault.jpg',thumbnail='https://i.ytimg.com/vi/Rescene0001/mqdefault.jpg';
 let tree=createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url:PHOTO},CLOCK);
 tree=editTree(tree,{title:'모아둔 순간',subject:tree.subject,coverMomentId:tree.moments[0].id});
 tree=addMoment(tree,{type:'video',url:video,mediaMetadata:{title:'RESCENE(리센느) 무대 직캠',channel:'기록 채널',source:'youtube.com',thumbnail:savedThumbnail}},tree.moments[0].id,CLOCK);
 const videoMoment=tree.moments.find(moment=>moment.url===video);
 tree=editTree(tree,{title:tree.title,subject:tree.subject,coverMomentId:videoMoment.id});
 tree={...tree,moments:tree.moments.map((moment,index)=>index===0?{...moment,keywords:[...(moment.keywords||[]),'가수:IVE','노래:Love Attack','무대:인기가요']}:moment)};
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed-rescene'});
 const shareRepo=createMemoryShareRepo();
 const share=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:'r'.repeat(24),discoverable:true,treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3}).catch(()=>null)
  ||await shareRepo.create({productId:PRODUCT,shareId:'r'.repeat(24),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 const discoverable=share.discoverable===true?share:await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo();communityRepo.seedShares([discoverable]);
 let id=0;
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:{roleFor:async()=>null},makeId:()=>String(++id).padStart(24,'d'),now:()=>Date.UTC(2026,10,1)});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 const handle=createCommunityHandler({authenticate,service,productId:PRODUCT});
 for(const query of ['rescene','RESCENE','리센느']){
  const list=await call(handle,'GET','/api/community/shares',{query:'q='+encodeURIComponent(query)});
  assert.equal(list.status,200,query);
  assert.equal(list.body.items.length,1,`'${query}' 검색으로 순간 제목의 그룹 이름을 찾는다`);
  assert.equal(list.body.items[0].title,'모아둔 순간');
  // 검색용으로 모은 순간 제목은 응답에 내보내지 않는다(공개 카드 모양 그대로 — 실제 응답은 JSON 직렬화를 거친다).
  assert.equal(Object.prototype.propertyIsEnumerable.call(list.body.items[0],'searchText'),false);
  assert.ok(Array.isArray(list.body.groups),'그룹 칩 목록을 함께 준다');
  assert.ok(Array.isArray(list.body.groupsAll),'찾기 창 전체 목록을 함께 준다');
  // #784: discover 응답은 groups/groupsAll가 그룹 이름('IVE')을 정규 표시로만 같이 내려 준다.
  // 카드(items)에는 계속 내보내지 않는다 — 누출 검증은 카드에만 걸어 가명(tagKey) 누출을 그대로 본다.
  assert.equal(JSON.stringify(list.body.items).includes('IVE'),false);
  assert.equal(JSON.stringify(list.body).includes('artistTags'),false);
  assert.equal(JSON.stringify(list.body).includes('searchText'),false);
 }
 const artistSearch=await call(handle,'GET','/api/community/shares',{query:'q=IVE'});
 assert.equal(artistSearch.body.items.length,1,'가수 꼬리표도 검색한다');
 const artistGroup=await call(handle,'GET','/api/community/shares',{query:'artist=IVE'});
 assert.equal(artistGroup.body.items.length,1,'가수 그룹은 붙인 꼬리표와 정확히 맞춘다');
 assert.equal((await call(handle,'GET','/api/community/shares',{query:'artist=ITZY'})).body.items.length,0);
 assert.equal(artistGroup.body.items[0].cover.type,'youtube');
 assert.equal(artistGroup.body.items[0].cover.vertical,true);
 assert.equal(artistGroup.body.items[0].cover.thumbnailUrl,thumbnail);
 assert.equal(Object.hasOwn(artistGroup.body.items[0],'publicDisplayName'),false,'계정 표시 이름은 공개 목록 응답에 새로 노출하지 않는다');
 // 뜻 없는 검색어는 그대로 걸러진다(검색이 무조건 통과로 바뀌지 않았다).
 assert.deepEqual((await call(handle,'GET','/api/community/shares',{query:'q=없는검색'})).body.items,[]);
 // 순간 제목을 더 보느라 조회 수가 늘지 않는다(요약 한 번).
 communityRepo.queryCount=0;
 await call(handle,'GET','/api/community/shares',{query:'q=rescene'});
 assert.equal(communityRepo.queryCount,1);
});

test('#887: 표지 미지정 트리의 둘러보기 카드는 첫 YouTube 순간 썸네일(mqdefault)로 채운다',async()=>{
 // 기본 표지(coverMomentId 없음) 트리도 카드 표지가 비면 글자 칸만 남는다(#887 — 운영 7카드 전부 해당).
 // 사슬: 명시 표지 → 사진 표지 → 첫 YouTube 순간 썸네일(mqdefault) → 글자 칸.
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const video='https://www.youtube.com/shorts/rescene0001';
 let tree=sampleTree(PHOTO); // 첫 순간: 사진(표지 미지정 — 기본 표지)
 tree=addMoment(tree,{type:'video',url:video,mediaMetadata:{title:'RESCENE(리센느) 무대 직캠',channel:'기록 채널',source:'youtube.com'}},tree.moments[0].id,CLOCK);
 tree=addMoment(tree,{type:'note',note:'둘러보기 후보 조건(순간 3개)를 맞추는 메모'},tree.moments[0].id,CLOCK);
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed-cover-887'});
 const shareRepo=createMemoryShareRepo();
 const share=await shareRepo.create({productId:PRODUCT,shareId:'c'.repeat(24),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 const discoverable=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo();communityRepo.seedShares([discoverable]);
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:{roleFor:async()=>null},now:()=>Date.UTC(2026,10,1)});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 const handle=createCommunityHandler({authenticate,service,productId:PRODUCT});
 const list=await call(handle,'GET','/api/community/shares',{});
 assert.equal(list.status,200);
 assert.equal(list.body.items.length,1);
 const cover=list.body.items[0].cover;
 assert.equal(cover.thumbnailUrl,'https://i.ytimg.com/vi/rescene0001/mqdefault.jpg','첫 YouTube 순간의 mqdefault로 채운다');
 assert.equal(cover.type,'youtube','표지 종류도 YouTube로 맞춰 화면이 영상 표지로 그린다');
 assert.equal(cover.url,'','사진·개인 미디어 주소는 기본 표지 트리에 흘리지 않는다(#425 유지)');
 // YouTube 순간이 아예 없는 기본 표지 트리는 글자 칸(빈 표지) — 사진 주소도 흘리지 않는다.
 let tree2=sampleTree(PHOTO);
 tree2=addMoment(tree2,{type:'note',note:'메모'},tree2.moments[0].id,CLOCK);
 tree2=addMoment(tree2,{type:'note',note:'메모2'},tree2.moments[0].id,CLOCK);
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree2]},expectedRevision:1,clientKey:'seed-cover-887-2'});
 const share2=await shareRepo.create({productId:PRODUCT,shareId:'d'.repeat(24),subjectId:'alice',treeId:tree2.id,entryMomentId:tree2.moments[0].id,view:'book',momentCount:3});
 const discoverable2=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share2.shareId,discoverable:true});
 communityRepo.seedShares([discoverable,discoverable2]);
 const list2=await call(handle,'GET','/api/community/shares',{});
 const photoCard=list2.body.items.find(item=>item.shareId===share2.shareId);
 assert.equal(photoCard.cover.thumbnailUrl,'','YouTube 순간이 없으면 글자 칸으로 둔다');
 assert.equal(photoCard.cover.url,'','사진 주소는 표지 모드가 moment일 때만(#425 유지)');
});

test('#627: 비공개 트리는 순간 제목으로도 검색되지 않는다',async()=>{
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 let tree=createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url:PHOTO},CLOCK);
 tree=editTree(tree,{title:'모아둔 순간',subject:tree.subject,coverMomentId:tree.moments[0].id});
 tree=addMoment(tree,{url:'https://www.youtube.com/watch?v=rescene00002',mediaMetadata:{title:'RESCENE(리센느) 연습실',channel:'기록 채널',source:'youtu.be'}},tree.moments[0].id,CLOCK);
 await workspace.write(principal('alice'),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed-private'});
 const shareRepo=createMemoryShareRepo();
 const share=await shareRepo.create({productId:PRODUCT,shareId:'p'.repeat(24),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:3});
 const discoverable=await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'alice',shareId:share.shareId,discoverable:true});
 // 공개 판정: 비공개로 바꾼 트리는 둘러보기 후보에서 빠진다(공개 범위 규칙은 그대로 — 저장소가 트리 공개 상태를 본다).
 const communityRepo=createMemoryCommunityRepo({isPrivateTree:async()=>true});communityRepo.seedShares([discoverable]);
 const visibilityRepo={get:async()=>({visibility:'private'})};
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,visibilityRepo,productId:PRODUCT,admin:{roleFor:async()=>null},makeId:()=>'x'.repeat(24),now:()=>Date.UTC(2026,10,1)});
 const authenticate=async request=>principal(request.headers?.account||'bob');
 const handle=createCommunityHandler({authenticate,service,productId:PRODUCT});
 const hidden=await call(handle,'GET','/api/community/shares',{query:'q=rescene'});
 assert.deepEqual(hidden.body.items,[],'비공개 트리는 순간 제목 검색으로도 나오지 않는다');
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

// ── #627 3단계 '다른 팬 보기': GET /api/public/tag-moments (화면 없음 — 서버 규칙만) ──────────
const TAG_URL='https://example.com/video/zena.mp4';
async function tagSetup({accounts,aiSubjects=[],testerSubjects=[],privateTreeId=null,hiddenShareIds=[],blocks=[],discoverOff=[],admin=null,validateDocument=null}={}){
 // accounts: [{subject, trees:[{title, moments:[{title, date, url, keywords, mediaMetadata?}]}]}]
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const shareRepo=createMemoryShareRepo();
 const rows=[];let n=0;
 for(const account of accounts){
  const trees=[];
  for(const t of account.trees){
   let tree=createTree({subject:'좋아하는 대상',title:t.moments[0].title,note:'기록',emotion:'설렘',date:t.moments[0].date,url:t.moments[0].url},CLOCK);
   tree=editTree(tree,{title:t.title,subject:tree.subject,coverMomentId:''});
   tree.moments[0].keywords=t.moments[0].keywords||[];
   if(t.moments[0].mediaMetadata)tree.moments[0].mediaMetadata=t.moments[0].mediaMetadata;
   for(const m of t.moments.slice(1)){
    tree=addMoment(tree,{title:m.title,note:'기록',emotion:'설렘',date:m.date,url:m.url},tree.moments[0].id,CLOCK);
    const moment=tree.moments.at(-1);
    moment.keywords=m.keywords||[];
    if(m.mediaMetadata)moment.mediaMetadata=m.mediaMetadata;
   }
   // 2026-11-16 대표 결정: 다른 팬 보기도 '소개 켬 + 순간 3개 이상'만 훑는다 — 시험 트리를 3개 이상으로
   // 맞춘다(껍질 순간은 꼬리표 없음 — 걸림 목록에 섞이지 않는다).
   while(tree.moments.length<3){
    tree=addMoment(tree,{title:'담은 순간',note:'기록',emotion:'설렘',date:'2026-11-01',url:''},tree.moments[0].id,CLOCK);
   }
   trees.push(tree);
  }
  await workspace.write(principal(account.subject),{state:{version:1,trees},expectedRevision:0,clientKey:'seed'});
  for(const tree of trees){
   const shareId='share'+String(++n).padStart(20,'0');
   rows.push(await shareRepo.create({productId:PRODUCT,shareId,subjectId:account.subject,treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:tree.moments.length,origin:'auto'}));
  }
 }
 // 소개 표: 기본 켬(기존 시험 유지) — discoverOff 에 넣은 주인의 트리만 꺼 둔다(2026-11-16 대표 결정).
 const discoverRepo=createMemoryTreeDiscoverRepo();
 for(const row of rows)await discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:!discoverOff.includes(row.subjectId)});
 const communityRepo=createMemoryCommunityRepo({
  isPrivateTree:privateTreeId?(p,s,t)=>t===privateTreeId:null,
  isDiscoverOn:(p,s,t)=>discoverRepo.isOn(p,s,t)
 });
 communityRepo.seedShares(rows);
 let r=0;
 for(const shareId of hiddenShareIds){
  await communityRepo.createReport({productId:PRODUCT,reportId:'report-'+String(++r).padStart(20,'0'),shareId,subjectId:'moderator',reason:'시험',clientKey:'key-'+r});
  await communityRepo.moderateReport({productId:PRODUCT,reportId:'report-'+String(r).padStart(20,'0'),status:'resolved',visibility:'hidden',actorSubjectId:'admin'});
 }
 for(const [a,b] of blocks)await communityRepo.blockOwner({productId:PRODUCT,blockerSubjectId:a,blockedSubjectId:b});
 const adminStub=admin||{roleFor:async value=>aiSubjects.includes(value.subjectId)?'ai_customer':(testerSubjects.includes(value.subjectId)?'tester':null)};
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:adminStub,makeId:()=>String(++n).padStart(24,'c'),validateDocument:validateDocument||undefined});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 return {communityRepo,shareRepo,discoverRepo,workspaceRepo,handle:createCommunityHandler({authenticate,service,productId:PRODUCT}),shareRows:rows.map(r=>({subjectId:r.subjectId,treeId:r.treeId,shareId:r.shareId}))};
}
const tagCall=(handle,tag,account)=>call(handle,'GET','/api/public/tag-moments',{query:'tag='+encodeURIComponent(tag),account});

test('tag-moments: 같은 꼬리표의 공개 순간만 나오고 내 것·비공개·숨김·차단·표기 차이를 한 벌로 판정한다',async()=>{
 const song=v=>'노래:'+v;
 const data=await tagSetup({
  accounts:[
   {subject:'s1',trees:[{title:'첫 트리',moments:[
    {title:'최신 무대',date:'2026-11-05',url:TAG_URL,keywords:[song('Super Shy')]},
    {title:'예전 무대',date:'2026-11-01',url:TAG_URL,keywords:[song('Super Shy')]},
   ]}]},
   {subject:'s2',trees:[{title:'다른 팬 트리',moments:[{title:'표기 다른 순간',date:'2026-10-20',url:TAG_URL,keywords:[song('super shy.')]}]}]},
   {subject:'s3',trees:[{title:'비공개 트리',moments:[{title:'숨은 기록',date:'2026-11-03',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
   {subject:'s4',trees:[{title:'숨김 트리',moments:[{title:'신고 처리된 순간',date:'2026-11-02',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
   {subject:'s5',trees:[{title:'내가 차단한 트리',moments:[{title:'차단된 순간',date:'2026-11-04',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
   {subject:'s6',trees:[{title:'나를 차단한 트리',moments:[{title:'역차단된 순간',date:'2026-11-04',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
   {subject:'s7',trees:[{title:'다른 꼬리표 트리',moments:[{title:'다른 노래',date:'2026-11-06',url:TAG_URL,keywords:[song('Drama')]}]}]},
   {subject:'viewer',trees:[{title:'내 트리',moments:[{title:'내 순간',date:'2026-11-07',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
  ],
  privateTreeId:'tree-private-1',
  blocks:[['viewer','s5'],['s6','viewer']],
 });
 // 비공개 트리의 공유 행을 비공개 트리 id로 바꿔 두고(isPrivateTree가 걸러 봄), 숨김 트리의 행을 신고 처리로 숨긴다.
 data.communityRepo.seedShares(data.communityRepo.shares.map(row=>row.subjectId==='s3'?{...row,treeId:'tree-private-1'}:row));
 const hiddenRow=data.communityRepo.shares.find(row=>row.subjectId==='s4');
 await data.communityRepo.createReport({productId:PRODUCT,reportId:'report-hidden-1',shareId:hiddenRow.shareId,subjectId:'moderator',reason:'시험',clientKey:'key-hidden-1'});
 await data.communityRepo.moderateReport({productId:PRODUCT,reportId:'report-hidden-1',status:'resolved',visibility:'hidden',actorSubjectId:'admin'});

 const mine=await tagCall(data.handle,'노래:Super Shy','viewer');
 assert.equal(mine.status,200);
 const titles=mine.body.items.map(item=>item.title);
 assert.deepEqual(titles,['최신 무대','예전 무대','표기 다른 순간'],'무대 날짜 최신 먼저, 표기 차이(super shy.)도 같은 꼬리표다');
 assert.equal(JSON.stringify(mine.body).includes('내 순간'),false,'요청한 사람 자신의 순간은 뺀다');
 assert.equal(JSON.stringify(mine.body).includes('숨은 기록'),false,'비공개 트리는 뺀다');
 assert.equal(JSON.stringify(mine.body).includes('신고 처리된 순간'),false,'숨김(신고 처리) 트리는 뺀다');
 assert.equal(JSON.stringify(mine.body).includes('차단된 순간'),false,'내가 차단한 트리는 뺀다');
 assert.equal(JSON.stringify(mine.body).includes('역차단된 순간'),false,'나를 차단한 트리도 뺀다(양방향)');
 assert.equal(JSON.stringify(mine.body).includes('다른 노래'),false,'다른 꼬리표 값은 뺀다');
 // 로그아웃으로 부르면 내 것 제외·차단이 사라진다(공개 경로, 요청자가 없어 차단 관계도 없다).
 const anonymous=await tagCall(data.handle,'노래:Super Shy');
 assert.equal(anonymous.status,200);
 assert.ok(anonymous.body.items.some(item=>item.title==='내 순간'),'로그아웃이면 내 트리 개념이 없다');
 assert.ok(anonymous.body.items.some(item=>item.title==='차단된 순간'),'로그아웃에는 차단 관계가 없다 — 공개 판정만으로 걸러진다');
 assert.equal(anonymous.body.items.some(item=>item.title==='숨은 기록'),false,'비공개·숨김은 요청자와 무관하게 뺀다');
 assert.equal(anonymous.body.items.some(item=>item.title==='신고 처리된 순간'),false);
});

test('tag-moments: 소개가 꺼진 트리의 순간은 나오지 않는다(2026-11-16 대표 결정 — 기본 꺼짐)',async()=>{
 const song=v=>'노래:'+v;
 const data=await tagSetup({
  accounts:[
   {subject:'s1',trees:[{title:'켠 트리',moments:[{title:'켠 트리 순간',date:'2026-11-05',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
   {subject:'s2',trees:[{title:'끈 트리',moments:[{title:'끈 트리 순간',date:'2026-11-04',url:TAG_URL,keywords:[song('Super Shy')]}]}]},
  ],
  discoverOff:['s2']
 });
 const res=await tagCall(data.handle,'노래:Super Shy');
 assert.equal(res.status,200);
 assert.deepEqual(res.body.items.map(item=>item.title),['켠 트리 순간'],'소개가 켜진 트리의 순간만 나온다');
 // 켜면 바로 나온다(무료 — 본인 트리).
 await data.discoverRepo.set({productId:PRODUCT,subjectId:'s2',treeId:data.shareRows.find(r=>r.subjectId==='s2').treeId,discover:true});
 const after=await tagCall(data.handle,'노래:Super Shy');
 assert.deepEqual(after.body.items.map(item=>item.title),['켠 트리 순간','끈 트리 순간'],'켜면 다른 팬 보기에 나온다');
});

test('tag-moments: 비YouTube 링크의 공개 HTTPS 썸네일을 유지한다',async()=>{
 const external='https://images.example.com/articles/og.jpg';
 const data=await tagSetup({accounts:[{subject:'link-owner',trees:[{title:'기사 트리',moments:[{title:'기사 순간',date:'2026-11-05',url:'https://example.com/article',keywords:['무대:링크'],mediaMetadata:{thumbnail:external}}]}]}]});
 const response=await tagCall(data.handle,'무대:링크');
 assert.equal(response.status,200);
 assert.equal(response.body.items[0].thumbnail,external);
});

test('tag-moments: 응답은 제목·영상 주소·썸네일·무대 날짜·트리 이름·공유 링크·aiTester뿐 — 개인정보 필드가 없다',async()=>{
 const data=await tagSetup({
  accounts:[{subject:'kate@example.test',trees:[{title:'공개 트리',moments:[
   {title:'비공개 미디어 순간',date:'2026-11-05',url:PHOTO,keywords:['무대:쇼챔피언']},
   {title:'영상 순간',date:'2026-11-04',url:TAG_URL,keywords:['무대:쇼챔피언'],mediaMetadata:{thumbnail:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'}},
  ]}]}],
 });
 const res=await tagCall(data.handle,'무대:쇼챔피언');
 assert.equal(res.status,200);
 const [redacted,video]=res.body.items;
 assert.equal(redacted.url,'','올린 사진(/api/media/) 주소는 공개 읽기와 같이 거른다');
 assert.equal(video.url,TAG_URL);
 assert.equal(video.thumbnail,'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
 assert.equal(video.link,'/t/'+video.shareId,'공유 링크는 /t/<공유 주소>');
 assert.equal(video.treeTitle,'공개 트리');
 assert.equal(video.date,'2026-11-04','무대 날짜');
 const body=JSON.stringify(res.body);
 assert.equal(body.includes('@'),false,'이메일은 내리지 않는다');
 assert.equal(body.includes('kimbs5993'),false);
 assert.equal(body.includes('subject'),false,'subject id는 내리지 않는다');
 for(const item of res.body.items)assert.deepEqual(Object.keys(item).sort(),['aiTester','date','link','shareId','thumbnail','title','treeTitle','url'],'응답 필드는 약속한 것만');
});

test('tag-moments: AI 테스터 표시는 공개 읽기와 같은 판정(roleFor=ai_customer)으로 한 비트만 내린다',async()=>{
 const data=await tagSetup({
  accounts:[
   {subject:'tester',trees:[{title:'AI 테스터 트리',moments:[{title:'테스터 순간',date:'2026-11-05',url:TAG_URL,keywords:['가수:RESCENE']}]}]},
   {subject:'human',trees:[{title:'일반 트리',moments:[{title:'일반 순간',date:'2026-11-04',url:TAG_URL,keywords:['가수:RESCENE']}]}]},
  ],
  aiSubjects:['tester'],
 });
 const res=await tagCall(data.handle,'가수:RESCENE');
 const byTree=Object.fromEntries(res.body.items.map(item=>[item.treeTitle,item.aiTester]));
 assert.equal(byTree['AI 테스터 트리'],true,'AI 고객 계정 글에는 aiTester:true');
 assert.equal(byTree['일반 트리'],false,'일반 계정은 false');
 assert.equal(JSON.stringify(res.body).includes('tester'),false,'표시 외에 계정 흔적은 없다');
});

test('tag-moments: 개수 제한 30 — 그 이상 담아도 30개만 무대 날짜 최신 순으로',async()=>{
 const moments=[];
 for(let i=0;i<35;i+=1){
  moments.push({title:'순간 '+i,date:`2026-${String(1+Math.floor(i/28)).padStart(2,'0')}-${String(1+(i%28)).padStart(2,'0')}`,url:TAG_URL,keywords:['노래:15-LOVE']});
 }
 const data=await tagSetup({accounts:[{subject:'s1',trees:[{title:'많은 트리',moments}]}]});
 const res=await tagCall(data.handle,'노래:15-LOVE');
 assert.equal(res.body.items.length,30);
 const dates=res.body.items.map(item=>item.date);
 assert.deepEqual([...dates].sort().reverse(),dates,'무대 날짜 최신 먼저');
 assert.equal(JSON.stringify(res.body).includes('순간 34'),true,'가장 최신부터 채운다');
});

test('tag-moments: 종류 없는 꼬리표·빈 값은 400',async()=>{
 const data=await tagSetup({accounts:[{subject:'s1',trees:[{title:'트리',moments:[{title:'순간',date:'2026-11-01',url:TAG_URL,keywords:['무대']}]}]}]});
 assert.equal((await tagCall(data.handle,'무대')).status,400,'종류 표시가 없는 옛 꼬리표는 이 경로에서 받지 않는다');
 assert.equal((await tagCall(data.handle,'')).status,400);
 assert.equal((await tagCall(data.handle,'노래:')).status,400);
});

test('#678 후속: tester 계정 트리는 둘러보기·다른 팬 보기에 나오지 않고, 공유 링크 직접 열기는 그대로 된다',async()=>{
 const data=await tagSetup({
  accounts:[
   {subject:'t1',trees:[{title:'시험 계정 트리',moments:[{title:'시험 계정 트리 순간',date:'2026-11-06',url:TAG_URL,keywords:['가수:RESCENE']},{title:'시험 계정 트리 둘째 순간',date:'2026-11-06',url:TAG_URL,keywords:['가수:RESCENE']},{title:'시험 계정 트리 셋째 순간',date:'2026-11-06',url:TAG_URL,keywords:['가수:RESCENE']}]}]},
   {subject:'a1',trees:[{title:'AI 명예회원 트리',moments:[{title:'AI 명예회원 트리 순간',date:'2026-11-05',url:TAG_URL,keywords:['가수:RESCENE']},{title:'AI 명예회원 트리 둘째 순간',date:'2026-11-05',url:TAG_URL,keywords:['가수:RESCENE']},{title:'AI 명예회원 트리 셋째 순간',date:'2026-11-05',url:TAG_URL,keywords:['가수:RESCENE']}]}]},
   {subject:'h1',trees:[{title:'일반 트리',moments:[{title:'일반 트리 순간',date:'2026-11-04',url:TAG_URL,keywords:['가수:RESCENE']},{title:'일반 트리 둘째 순간',date:'2026-11-04',url:TAG_URL,keywords:['가수:RESCENE']},{title:'일반 트리 셋째 순간',date:'2026-11-04',url:TAG_URL,keywords:['가수:RESCENE']}]}]},
  ],
  aiSubjects:['a1'],
  testerSubjects:['t1'],
 });
 // 둘러보기: 시험 계정 트리는 빠지고 AI 명예회원·일반 트리는 그대로(배지 비트도 유지).
 const list=await call(data.handle,'GET','/api/community/shares');
 assert.equal(list.status,200);
 const titles=list.body.items.map(item=>item.title);
 assert.equal(titles.includes('시험 계정 트리'),false,'시험 계정 트리는 둘러보기에 없다');
 assert.deepEqual(titles,['AI 명예회원 트리','일반 트리']);
 assert.equal(list.body.items.find(item=>item.title==='AI 명예회원 트리').aiTester,true,'AI 명예회원 배지는 유지');
 // 다른 팬 보기: 시험 계정 순간이 빠지고 나머지는 꼬리표 판정대로.
 const res=await tagCall(data.handle,'가수:RESCENE');
 const treeTitles=res.body.items.map(item=>item.treeTitle);
 assert.equal(treeTitles.includes('시험 계정 트리'),false,'시험 계정 순간은 다른 팬 보기에 없다');
 assert.deepEqual([...new Set(treeTitles)],['AI 명예회원 트리','일반 트리']);
 assert.equal(res.body.items.find(item=>item.treeTitle==='AI 명예회원 트리').aiTester,true);
 // 공유 링크 직접 열기(/t/<id>가 읽는 공개 읽기 경로 — share-service.read)는 시험 계정 트리도 그대로 된다(레인 시험용).
 const testerShare=data.shareRows.find(r=>r.subjectId==='t1');
 const shareService=createShareService({shareRepo:data.shareRepo,workspaceRepo:data.workspaceRepo,productId:PRODUCT});
 const direct=await shareService.read(testerShare.shareId);
 assert.ok(direct.tree,'공유 링크 직접 열기는 막히지 않는다');
 assert.equal(direct.tree.title,'시험 계정 트리');
});

test('#936: 같은 역할 계정의 공개 카드는 배지가 일관되게 — 명예회원 100%, 일반 0%',async()=>{
 const three=(prefix,date)=>[
  {title:prefix+' 첫 순간',date,url:TAG_URL,keywords:['가수:RESCENE']},
  {title:prefix+' 둘 순간',date,url:TAG_URL,keywords:[]},
  {title:prefix+' 셋 순간',date,url:TAG_URL,keywords:[]}
 ];
 const data=await tagSetup({
  accounts:[
   {subject:'ai',trees:[
    {title:'명예회원 첫 트리',moments:three('명예 첫','2026-11-05')},
    {title:'명예회원 둘 트리',moments:three('명예 둘','2026-11-04')}
   ]},
   {subject:'normal',trees:[
    {title:'일반 첫 트리',moments:three('일반 첫','2026-11-03')},
    {title:'일반 둘 트리',moments:three('일반 둘','2026-11-02')}
   ]}
  ],
  aiSubjects:['ai']
 });
 const list=await call(data.handle,'GET','/api/community/shares');
 assert.equal(list.status,200);
 const aiCards=list.body.items.filter(item=>item.title.startsWith('명예회원'));
 const normalCards=list.body.items.filter(item=>item.title.startsWith('일반'));
 assert.equal(aiCards.length,2,'명예회원 공개 트리 2개');
 assert.equal(normalCards.length,2,'일반 공개 트리 2개');
 assert.ok(aiCards.every(item=>item.aiTester===true),'명예회원 카드 배지 100%');
 assert.ok(normalCards.every(item=>item.aiTester===undefined),'일반 카드 배지 0%');
 // 같은 판정이 '다른 팬 보기'에도 적용된다(목록·미리보기·공유 안내가 같은 비트).
 const tagged=await tagCall(data.handle,'가수:RESCENE');
 const aiMoments=tagged.body.items.filter(item=>item.treeTitle.startsWith('명예회원'));
 const normalMoments=tagged.body.items.filter(item=>item.treeTitle.startsWith('일반'));
 assert.ok(aiMoments.length>0&&aiMoments.every(item=>item.aiTester===true),'명예회원 순간 배지 100%');
 assert.ok(normalMoments.length>0&&normalMoments.every(item=>item.aiTester!==true),'일반 순간 배지 0%');
});

// #1025 1단계: 공개 세로 순간 무작위 조회 — 비공개·가로·판정 없는 옛 순간은 절대 나오지 않는다.
const SHORTS_URL=id=>'https://www.youtube.com/shorts/'+id;
const WATCH_URL=id=>'https://www.youtube.com/watch?v='+id;
function momentsSetup(){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const shareRepo=createMemoryShareRepo(),rows=[];let n=0;
 const save=async(subject,title,moments,privateTree=false)=>{
  let tree=createTree({subject:'좋아하는 대상',title,note:'기록',emotion:'설렘',date:'2026-11-01',url:moments[0].url},CLOCK);
  tree=editTree(tree,{title,subject:tree.subject,coverMomentId:''});
  tree.moments[0].title=moments[0].title;tree.moments[0].keywords=moments[0].keywords||[];
  for(const [key,value] of [['startSeconds',moments[0].startSeconds],['endSeconds',moments[0].endSeconds]])if(value!==undefined)tree.moments[0][key]=value;
  for(const m of moments.slice(1)){
   tree=addMoment(tree,{title:m.title,note:m.note||'기록',emotion:'설렘',date:'2026-11-01',url:m.url},tree.moments[0].id,CLOCK);
   tree.moments.at(-1).keywords=m.keywords||[];
   for(const [key,value] of [['startSeconds',m.startSeconds],['endSeconds',m.endSeconds]])if(value!==undefined)tree.moments.at(-1)[key]=value;
  }
  // 공개 판정(둘러보기와 같은 규칙)은 순간 3개 이상만 훑는다 — 껍질 순간으로 채운다(세로 아님).
  while(tree.moments.length<3){
   tree=addMoment(tree,{title:'담은 순간',note:'기록',emotion:'설렘',date:'2026-11-01',url:''},tree.moments[0].id,CLOCK);
  }
  await workspace.write(principal(subject),{state:{version:1,trees:[tree]},expectedRevision:0,clientKey:'seed-'+subject});
  const shareId='mshare'+String(++n).padStart(20,'0');
  rows.push(await shareRepo.create({productId:PRODUCT,shareId,subjectId:subject,treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:tree.moments.length,origin:'auto'}));
  return {tree,shareId,privateTree};
 };
 const discoverRepo=createMemoryTreeDiscoverRepo();
 let privateId=null;
 const communityRepo=createMemoryCommunityRepo({
  isPrivateTree:(p,s,t)=>t===privateId,
  isDiscoverOn:(p,s,t)=>discoverRepo.isOn(p,s,t)
 });
 let r=0;const random=()=>[0.9,0.1,0.5,0.3][r++%4];
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,
  admin:{roleFor:async v=>v.subjectId==='honor'?'ai_customer':(v.subjectId==='tester'?'tester':null)},random});
 return {workspaceRepo,shareRepo,communityRepo,discoverRepo,service,rows,save,seed:()=>communityRepo.seedShares(rows),setPrivate:id=>{privateId=id;}};
}
const momentsCall=(service,query='')=>{const q=Object.fromEntries(new URLSearchParams(query));if(q.exclude)q.exclude=q.exclude.split(',').filter(Boolean);return service.moments(q);};

test('moments: 공개 세로 순간만 무작위로 나오고 비공개·가로·판정 없는 순간·시험계정은 제외된다',async()=>{
 const d=momentsSetup();
 await d.save('alice','공개 세로 트리',[
  {title:'쇼츠 가수',url:SHORTS_URL('aaaa1111111'),keywords:['가수:가수A']},
  {title:'쇼츠 노래',url:SHORTS_URL('bbbb2222222'),keywords:['노래:노래B']}
 ]);
 await d.save('honor','명예회원 트리',[{title:'명예 쇼츠',url:SHORTS_URL('cccc3333333'),keywords:['가수:가수A']}]);
 await d.save('plain','가로 섞인 트리',[
  {title:'가로 무대',url:WATCH_URL('dddd4444444')},
  {title:'판정 없는 watch 쇼츠',url:WATCH_URL('eeee5555555')}
 ]);
 const privateOne=await d.save('secret','비공개 트리',[{title:'비공개 쇼츠',url:SHORTS_URL('ffff6666666')}]);
 d.setPrivate(privateOne.tree.id);
 await d.save('tester','시험계정 트리',[{title:'시험 쇼츠',url:SHORTS_URL('gggg7777777')}]);
 for(const row of d.rows)await d.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:true});
 d.seed();
 const res=await momentsCall(d.service,'limit=30');
 assert.equal(res.total,3,'세로 확정 공개 순간 3개(쇼츠 가수·노래·명예)');
 assert.deepEqual(res.items.map(i=>i.title).sort(),['명예 쇼츠','쇼츠 가수','쇼츠 노래']);
 assert.equal(res.items.some(i=>i.title.includes('비공개')||i.title.includes('시험')||i.title.includes('가로')),false);
 assert.ok(res.items.every(i=>i.aiTester===(i.title==='명예 쇼츠')),'AI 명예회원 표시는 그 순간에만');
 assert.ok(res.items.every(i=>i.videoId&&i.thumbnail.includes('oardefault.jpg')),'세로 포스터 주소');
 const shuffled=res.items.map(i=>i.title);
 assert.equal(new Set(shuffled).size,3,'무작위 순서에도 같은 영상 중복 0');
});

test('moments: 이미 본 영상 id 제외·가수 꼬리표 거르기·상한을 지킨다',async()=>{
 const d=momentsSetup();
 await d.save('alice','트리',[
  {title:'가수A 쇼츠',url:SHORTS_URL('aaaa1111111'),keywords:['가수:가수A']},
  {title:'가수B 쇼츠',url:SHORTS_URL('bbbb2222222'),keywords:['가수:가수B']},
  {title:'다른 가수A',url:SHORTS_URL('cccc3333333'),keywords:['가수:가수A']}
 ]);
 for(const row of d.rows)await d.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:true});
 d.seed();
 const all=await momentsCall(d.service,'limit=2');
 assert.equal(all.items.length,2,'상한 2개');
 assert.equal(all.total,3);
 assert.equal(new Set(all.items.map(i=>i.videoId)).size,2);
 const excluded=await momentsCall(d.service,'limit=30&exclude=aaaa1111111,cccc3333333');
 assert.deepEqual(excluded.items.map(i=>i.title),['가수B 쇼츠'],'본 영상 id 두 개 제외');
 const tagged=await momentsCall(d.service,'limit=30&tag='+encodeURIComponent('가수:가수A'));
 assert.equal(tagged.total,2,'가수 꼬리표로 거른다');
 assert.ok(tagged.items.every(i=>i.keywords.includes('가수:가수A')));
});

test('moments 2단계: 가수 꼬리표 상위 6개와 구간 값을 함께 준다',async()=>{
 const d=momentsSetup();
 const artists=['가수A','가수B','가수C','가수D','가수E','가수F','가수G'];
 const rows=artists.map((name,i)=>[
  {title:name+' 쇼츠1',url:SHORTS_URL('a'.repeat(9)+i+'111'),keywords:['가수:'+name],startSeconds:3,endSeconds:12},
  {title:name+' 쇼츠2',url:SHORTS_URL('b'.repeat(9)+i+'222'),keywords:['가수:'+name]}
 ]);
 for(const [i,moments] of rows.entries())await d.save('singer'+i,'트리',moments);
 for(const row of d.rows)await d.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:true});
 d.seed();
 const res=await momentsCall(d.service,'limit=30');
 assert.equal(res.groups.length,6,'칩은 상위 6개만');
 assert.ok(res.groups.every(g=>artists.includes(g.value)&&g.count===2),'공개 세로 순간에서 가수별로 셌다: '+JSON.stringify(res.groups));
 const ranged=res.items.find(i=>i.title==='가수A 쇼츠1');
 assert.equal(ranged?.startSeconds,3);assert.equal(ranged?.endSeconds,12,'구간 값도 응답에 있다');
 assert.equal(res.items.find(i=>i.title==='가수A 쇼츠2')?.startSeconds,null,'구간 없는 순간은 null');
 const filtered=await momentsCall(d.service,'limit=30&tag='+encodeURIComponent('가수:가수A'));
 assert.equal(filtered.total,2,' tag 인자로 그 가수만');
 assert.ok(filtered.items.every(i=>i.keywords.includes('가수:가수A')));
});

test('#1356 이 트리만: shareId는 그 공유 트리의 공개 순간만 — 다른 팬·숨김·소개 끈·비공개 트리는 빈 목록',async()=>{
 const d=momentsSetup();
 const alice=await d.save('alice','앨리스 트리',[
  {title:'앨리스 쇼츠1',url:SHORTS_URL('aaaa1111111'),keywords:['가수:가수A']},
  {title:'앨리스 쇼츠2',url:SHORTS_URL('bbbb2222222'),keywords:['가수:가수B']}
 ]);
 const bob=await d.save('bob','밥 트리',[{title:'밥 쇼츠',url:SHORTS_URL('cccc3333333'),keywords:['가수:가수A']}]);
 const hidden=await d.save('carol','숨김 트리',[{title:'숨김 쇼츠',url:SHORTS_URL('dddd4444444')}]);
 const off=await d.save('dave','소개 끈 트리',[{title:'끈 쇼츠',url:SHORTS_URL('eeee5555555')}]);
 const priv=await d.save('erin','비공개 트리',[{title:'비공개 쇼츠',url:SHORTS_URL('ffff6666666')}]);
 d.setPrivate(priv.tree.id);
 await d.communityRepo.createReport({productId:PRODUCT,reportId:'report-1356-hidden',shareId:hidden.shareId,subjectId:'moderator',reason:'시험',clientKey:'key-1356-hidden'});
 await d.communityRepo.moderateReport({productId:PRODUCT,reportId:'report-1356-hidden',status:'resolved',visibility:'hidden',actorSubjectId:'admin'});
 for(const row of d.rows)await d.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:row.subjectId!=='dave'});
 d.seed();
 const titles=async q=>(await momentsCall(d.service,q)).items.map(i=>i.title).sort();
 assert.deepEqual(await titles('limit=30&shareId='+alice.shareId),['앨리스 쇼츠1','앨리스 쇼츠2'],'앨리스 트리 공개 순간만');
 assert.deepEqual(await titles('limit=30&shareId='+bob.shareId),['밥 쇼츠'],'밥 트리만');
 assert.deepEqual(await titles('limit=30&shareId='+hidden.shareId),[],'숨김 공유는 빈 목록');
 assert.deepEqual(await titles('limit=30&shareId='+off.shareId),[],'소개 끈 트리는 빈 목록');
 assert.deepEqual(await titles('limit=30&shareId='+priv.shareId),[],'비공개 트리는 빈 목록');
 assert.deepEqual(await titles('limit=30'),['밥 쇼츠','앨리스 쇼츠1','앨리스 쇼츠2'],'인자 없으면 전체 공개 순간');
});

test('#1356 이 트리만: 없는 shareId·잘못된 형식은 빈 목록, tag·exclude와 함께 쓰인다',async()=>{
 const d=momentsSetup();
 const alice=await d.save('alice','앨리스 트리',[
  {title:'앨리스 쇼츠1',url:SHORTS_URL('aaaa1111111'),keywords:['가수:가수A']},
  {title:'앨리스 쇼츠2',url:SHORTS_URL('bbbb2222222'),keywords:['가수:가수B']}
 ]);
 await d.save('bob','밥 트리',[{title:'밥 쇼츠',url:SHORTS_URL('cccc3333333'),keywords:['가수:가수A']}]);
 for(const row of d.rows)await d.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:true});
 d.seed();
 const total=async q=>(await momentsCall(d.service,q)).total;
 assert.equal(await total('limit=30'),3,'기존 결과 3개');
 assert.equal(await total('limit=30&shareId='+'x'.repeat(26)),0,'없는 공유는 빈 목록');
 assert.equal(await total('limit=30&shareId=short'),0,'짧은 형식은 빈 목록');
 assert.equal(await total('limit=30&shareId='),0,'빈 값은 빈 목록');
 assert.equal(await total('limit=30&shareId='+encodeURIComponent('bad id!!/../../x'+'y'.repeat(20))),0,'허용되지 않는 문자는 빈 목록');
 assert.equal(await total('limit=30&shareId='+'z'.repeat(65)),0,'너무 긴 형식은 빈 목록');
 assert.equal(await total('limit=30&shareId='+alice.shareId+'&tag='+encodeURIComponent('가수:가수A')),1,'tag와 함께: 앨리스 트리의 그 가수만');
 assert.equal(await total('limit=30&shareId='+alice.shareId+'&exclude=aaaa1111111'),1,'exclude와 함께: 본 영상은 뺀다');
 assert.equal(await total('limit=30&shareId='+alice.shareId+'&tag='+encodeURIComponent('가수:가수B')+'&exclude=bbbb2222222'),0,'tag·exclude 둘 다: 남는 것 없음');
});

test('담기: 공개 순간을 고른 트리에 복사해도 원본 공개 트리는 그대로다',async()=>{
 const {copyPublicMoment}=await import('../public/v41/moments-copy.mjs');
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 let mine=createTree({subject:'내 대상',title:'담을 트리',note:'',emotion:'설렘',date:'2026-11-01',url:''},CLOCK);
 const originalTitle=mine.title;
 const item={title:'담은 쇼츠',url:SHORTS_URL('aaaa1111111'),treeTitle:'원본 공개 트리',shareId:'s'.repeat(24),keywords:['가수:아이유','노래:노래1'],note:'원래 마음 글',emotion:'설렘',date:'2026-11-20',startSeconds:5,endSeconds:20};
 await workspace.write(principal('me'),{state:{version:1,trees:[mine]},expectedRevision:0,clientKey:'seed'});
 const copied=copyPublicMoment(mine,item,'https://example.test');
 await workspace.write(principal('me'),{state:{version:1,trees:[{...mine,moments:copied.moments}]},expectedRevision:1,clientKey:'copy'});
 const after=await workspace.read(principal('me'));
 const tree=after.state.trees.find(t=>t.id===mine.id);
 const moment=tree.moments.find(m=>m.id===copied.copiedId);
 assert.ok(moment,'고른 트리에 새 순간이 생겼다');
 assert.equal(tree.title,originalTitle,'원본 공개 트리(대상 트리의 기존 값)는 그대로');
 assert.equal(moment.url,item.url);assert.equal(moment.title,item.title);
 assert.deepEqual(moment.keywords,item.keywords,'꼬리표 복사');
 assert.equal(moment.startSeconds,5);assert.equal(moment.endSeconds,20,'구간 복사');
 assert.ok(moment.note.startsWith('원래 출처: 원본 공개 트리'),'출처 표시: '+moment.note);
 assert.doesNotMatch(moment.note,/원래 마음 글/,'원래 마음 글은 비운다');
});

test('#1071: 역할 조회 실패는 모름으로 구분해 공개 목록에서 빼고 기록 한 줄을 남긴다',async()=>{
 const broken='sub_'+'a'.repeat(16),normal='sub_'+'b'.repeat(16);
 // 역할 저장소가 특정 주인에 대해 던진다 — 기본 roleFor 은 예전처럼 조용히 '역할 없음'으로 닫힌다.
 const admin=createAdminRoleService({productId:PRODUCT,store:{async roleFor({subjectId}){
  if(subjectId===broken)throw new Error('저장 장애');
  return null;
 }}});
 assert.equal(await admin.roleFor({productId:PRODUCT,subjectId:broken}),null);
 const data=await tagSetup({
  accounts:[
   {subject:broken,trees:[{title:'역할 모름 트리',moments:[{title:'역할 모름 순간',date:'2026-11-05',url:TAG_URL,keywords:['가수:RESCENE']}]}]},
   {subject:normal,trees:[{title:'일반 트리',moments:[{title:'일반 순간',date:'2026-11-04',url:TAG_URL,keywords:['가수:RESCENE']}]}]}
  ],
  admin
 });
 const warnings=[],originalWarn=console.warn;
 console.warn=(...args)=>warnings.push(args.join(' '));
 let list;
 try{list=await call(data.handle,'GET','/api/community/shares');}
 finally{console.warn=originalWarn;}
 assert.equal(list.status,200);
 assert.deepEqual(list.body.items.map(item=>item.title),['일반 트리'],'역할을 읽지 못한 주인의 카드는 공개 목록에 없다');
 assert.equal(warnings.length,1,'기록은 한 줄');
 assert.match(warnings[0],/역할을 읽지 못해/);
 const tagged=await tagCall(data.handle,'가수:RESCENE');
 assert.equal(tagged.body.items.some(item=>item.treeTitle==='역할 모름 트리'),false,'다른 팬 보기에서도 빠진다');
});

test('#1067: 한 번의 둘러보기에서 주인 문서는 한 번만 읽고 검증한다',async()=>{
 let loads=0,validates=0;
 const validateDocument=doc=>{validates+=1;return readStoredDocument(doc);};
 const data=await tagSetup({
  accounts:[{subject:'owner',trees:Array.from({length:10},(_,i)=>({title:'트리 '+i,moments:[{title:'순간 '+i,date:'2026-11-01',url:TAG_URL,keywords:[]}]}))}],
  validateDocument
 });
 const load=data.workspaceRepo.load.bind(data.workspaceRepo);
 data.workspaceRepo.load=async (...args)=>{loads+=1;return load(...args);};
 const first=await call(data.handle,'GET','/api/community/shares');
 assert.equal(first.status,200);
 assert.equal(first.body.items.length,10);
 assert.equal(loads,1,'문서 읽기는 한 번');
 assert.equal(validates,1,'문서 검증은 한 번');
 for(const row of data.shareRows)await data.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:false});
 const second=await call(data.handle,'GET','/api/community/shares');
 assert.equal(second.body.items.length,0,'공개를 끈 직후 다음 요청에서 바로 보이지 않는다');
});


// B-08(#1064): 트리 id는 계정끼리 겹칠 수 있다(복원 기록). 둘러보기는 (계정, 트리)로 묶고,
// 숨김도 (계정, 트리) 범위로만 판정한다 — 한쪽 숨김이 다른 계정에 번지지 않는다.
test('같은 tree_id의 두 계정은 둘 다 소개되고 한쪽 숨김이 다른 쪽에 번지지 않는다',async()=>{
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const treeId='same-tree-id'; // 복원 기록은 서로 같은 로컬 트리 id를 가질 수 있다.
 const t1=createTree({subject:'윤슬',title:'첫 무대',note:'기록',emotion:'설렘',date:'2026-11-01',url:PHOTO},CLOCK);
 const t2=createTree({subject:'바다',title:'다른 무대',note:'기록',emotion:'위로',date:'2026-11-02',url:PHOTO},CLOCK);
 t1.id=treeId;t2.id=treeId;
 await workspace.write(principal('owner1'),{state:{version:1,trees:[t1]},expectedRevision:0,clientKey:'seed-1'});
 await workspace.write(principal('owner2'),{state:{version:1,trees:[t2]},expectedRevision:0,clientKey:'seed-2'});
 const shareRepo=createMemoryShareRepo();
 const s1=await shareRepo.create({productId:PRODUCT,shareId:'s'.repeat(23)+'1',subjectId:'owner1',treeId,entryMomentId:t1.moments[0].id,view:'book',momentCount:3});
 const s2=await shareRepo.create({productId:PRODUCT,shareId:'s'.repeat(23)+'2',subjectId:'owner2',treeId,entryMomentId:t2.moments[0].id,view:'book',momentCount:3});
 await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'owner1',shareId:s1.shareId,discoverable:true});
 await shareRepo.setDiscoverable({productId:PRODUCT,subjectId:'owner2',shareId:s2.shareId,discoverable:true});
 const communityRepo=createMemoryCommunityRepo({now:()=>CLOCK});
 communityRepo.seedShares([s1,s2]);
 const adminStub={roleFor:async value=>value.subjectId==='admin'?'admin':null};
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin:adminStub,makeId:()=>String(1).padStart(24,'c'),now:()=>Date.UTC(2026,10,1)});
 const authenticate=async request=>{const subjectId=request.headers?.account;if(!subjectId)throw new ApiError(401,'unauthenticated','login');return principal(subjectId);};
 const handle=createCommunityHandler({authenticate,service,productId:PRODUCT});
 const idsOf=result=>result.body.items.map(item=>item.shareId).sort();
 const list=await call(handle,'GET','/api/community/shares');
 assert.equal(list.status,200);
 assert.deepEqual(idsOf(list),[s1.shareId,s2.shareId].sort(),'같은 tree_id라도 두 계정이 모두 나온다');
 // owner1 쪽만 숨김 — owner2는 그대로 남는다(숨김이 tree_id로 번지지 않는다).
 const report=await call(handle,'POST',`/api/community/shares/${s1.shareId}/report`,{account:'eve',key:'b08-report-0001',body:{reason:'숨김 시험'}});
 assert.equal(report.status,201);
 const hidden=await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'resolved',visibility:'hidden'}});
 assert.equal(hidden.status,200);assert.equal(hidden.body.report.hidden,true);
 const after=await call(handle,'GET','/api/community/shares');
 assert.deepEqual(idsOf(after),[s2.shareId],'owner1만 내려가고 owner2는 남는다');
 // 해제 — 두 계정이 다시 나온다.
 await call(handle,'PATCH',`/api/community/admin/reports/${report.body.report.id}`,{account:'admin',body:{status:'dismissed',visibility:'visible'}});
 assert.deepEqual(idsOf(await call(handle,'GET','/api/community/shares')),[s1.shareId,s2.shareId].sort());
});

test('#1273 5번: 첫 화면 공개 트리 숫자와 둘러보기 목록은 같은 자료에서 같은 기준으로 센다', async () => {
  const three = (prefix) => [1, 2, 3].map(i => ({title: prefix + i, date: '2026-11-0' + i, url: TAG_URL, keywords: ['가수:RESCENE']}));
  const data = await tagSetup({
    accounts: [
      {subject: 't1', trees: [{title: '시험 계정 트리', moments: three('시험')}]},
      {subject: 'a1', trees: [{title: '명예회원 트리', moments: three('명예')}]},
      {subject: 'h1', trees: [{title: '일반 트리', moments: three('일반')}]}
    ],
    aiSubjects: ['a1'],
    testerSubjects: ['t1']
  });
  const stats = await call(data.handle, 'GET', '/api/community/stats');
  const list = await call(data.handle, 'GET', '/api/community/shares');
  assert.equal(stats.status, 200);
  assert.equal(list.status, 200);
  assert.equal(stats.body.trees, list.body.totalVisible, '집계와 목록 수가 같다');
  assert.equal(stats.body.trees, 2, '시험 계정 트리는 둘 다에서 빠진다');
  assert.equal(stats.body.moments, 6, '순간 수도 같은 기준으로 센다');
  assert.deepEqual(list.body.items.map(item => item.title), ['명예회원 트리', '일반 트리']);
});

// #1356 2단계 '내 순간': 본인 작업공간의 세로 순간만 (비공개 트리 포함, 공개 목록과 같은 모양)
const MY_MOMENT_KEYS=['aiTester','date','emotion','endSeconds','id','keywords','note','shareId','startSeconds','thumbnail','title','treeTitle','url','videoId'];
function treeWith(title,moments){
  let tree=createTree({subject:'좋아하는 대상',title,note:'기록',emotion:'설렘',date:'2026-11-01',url:moments[0].url},CLOCK);
  tree=editTree(tree,{title,subject:tree.subject,coverMomentId:''});
  tree.moments[0].title=moments[0].title;
  tree.moments[0].keywords=moments[0].keywords||[];
  for(const m of moments.slice(1)){
    tree=addMoment(tree,{title:m.title,note:'기록',emotion:'설렘',date:'2026-11-01',url:m.url},tree.moments[0].id,CLOCK);
    tree.moments.at(-1).keywords=m.keywords||[];
  }
  while(tree.moments.length<3)tree=addMoment(tree,{title:'담은 순간',note:'기록',emotion:'설렘',date:'2026-11-01',url:''},tree.moments[0].id,CLOCK);
  return tree;
}
async function mySetup(){
  const d=momentsSetup();
  const ws=createWorkspaceService({repo:d.workspaceRepo,productId:PRODUCT});
  const trees=[
    treeWith('앨리스 트리',[{title:'앨리스 쇼츠1',url:SHORTS_URL('aaaa1111111'),keywords:['가수:가수A']},{title:'앨리스 쇼츠2',url:SHORTS_URL('bbbb2222222'),keywords:['가수:가수B']}]),
    treeWith('앨리스 비공개 트리',[{title:'비공개 쇼츠',url:SHORTS_URL('ffff6666666')}]),
    treeWith('앨리스 가로 트리',[{title:'가로 무대',url:WATCH_URL('dddd4444444')}]),
  ];
  await ws.write(principal('alice'),{state:{version:1,trees},expectedRevision:0,clientKey:'seed-alice-1356-own'});
  const rows=[];
  for(const [i,tree] of trees.slice(0,2).entries()){
    rows.push(await d.shareRepo.create({productId:PRODUCT,shareId:'ownshare'+String(i+1).padStart(17,'0'),subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:tree.moments.length,origin:'auto'}));
  }
  d.rows.push(...rows);
  await d.save('bob','밥 트리',[{title:'밥 쇼츠',url:SHORTS_URL('cccc3333333'),keywords:['가수:가수A']}]);
  d.setPrivate(trees[1].id);
  for(const row of d.rows)await d.discoverRepo.set({productId:PRODUCT,subjectId:row.subjectId,treeId:row.treeId,discover:true});
  d.seed();
  return {d,trees,rows};
}
test('#1356 내 순간: 본인 작업공간의 세로 순간만 — 비공개 트리 포함, 가로·타인 순간 제외',async()=>{
  const {d,rows}=await mySetup();
  const mine=await d.service.myMoments('alice');
  assert.deepEqual(mine.items.map(i=>i.title).sort(),['비공개 쇼츠','앨리스 쇼츠1','앨리스 쇼츠2'].sort());
  assert.equal(mine.total,3);
  assert.equal(mine.items.find(i=>i.title==='앨리스 쇼츠1').shareId,rows[0].shareId);
  assert.equal(mine.items.find(i=>i.title==='비공개 쇼츠').shareId,rows[1].shareId);
  assert.deepEqual(mine.groups.map(g=>g.value).sort(),['가수A','가수B']);
  assert.ok(!JSON.stringify(mine).includes('"subjectId"'));
  assert.deepEqual(await d.service.myMoments('nobody'),{items:[],total:0,groups:[]});
});
test('#1356 내 순간 API: 로그인 필수·subjectId 인자 무시·공개 목록과 같은 한 줄 모양·limit·exclude',async()=>{
  const {d}=await mySetup();
  const handle=createCommunityHandler({
    productId:PRODUCT,
    service:d.service,
    authenticate:async request=>{
      const account=request.headers?.account;
      if(!account)throw new ApiError(401,'unauthenticated','login');
      return principal(account);
    },
  });
  const path='/api/community/me/moments';
  assert.equal((await call(handle,'GET',path)).status,401);
  const res=await call(handle,'GET',path,{account:'alice',query:'subjectId=bob&limit=30'});
  assert.equal(res.status,200);
  assert.deepEqual(res.body.items.map(i=>i.title).sort(),['비공개 쇼츠','앨리스 쇼츠1','앨리스 쇼츠2'].sort());
  assert.ok(!JSON.stringify(res.body).includes('"subjectId"'));
  const pub=await d.service.moments({limit:30});
  assert.ok(!pub.items.some(i=>i.title==='비공개 쇼츠'),'공개 목록에는 비공개 트리가 나오지 않는다');
  assert.deepEqual(Object.keys(res.body.items[0]).sort(),MY_MOMENT_KEYS);
  assert.deepEqual(Object.keys(pub.items[0]).sort(),MY_MOMENT_KEYS);
  const one=await call(handle,'GET',path,{account:'alice',query:'limit=1'});
  assert.equal(one.body.items.length,1);
  assert.equal(one.body.total,3);
  const ex=await call(handle,'GET',path,{account:'alice',query:'exclude=aaaa1111111'});
  assert.equal(ex.body.total,2);
  assert.ok(!ex.body.items.some(i=>i.videoId==='aaaa1111111'));
});

test('#1548 POST /api/community/shares/:id/report: 미로그인 401, 빈 이유 400', async () => {
 const {handle} = await setup(), shareId = 's'.repeat(24), path = '/api/community/shares/' + shareId + '/report';
 const anon = await call(handle, 'POST', path, {body: {reason: '확인이 필요해요'}, key: 'report-key-1548-01'});
 assert.equal(anon.status, 401);
 assert.equal(anon.body.error.code, 'unauthenticated');
 const empty = await call(handle, 'POST', path, {account: 'bob', body: {reason: ''}, key: 'report-key-1548-02'});
 assert.equal(empty.status, 400);
 assert.equal(empty.body.error.code, 'report_reason_required');
});

test('#1548 GET /api/public/tag-moments: 빈 태그와 긴 태그에서 응답 모양이 유지된다', async () => {
 const {handle} = await setup();
 const empty = await tagCall(handle, '', undefined);
 assert.equal(empty.status, 400);
 assert.equal(empty.body.error.code, 'tag_invalid');
 const long = await tagCall(handle, '노래:' + 'a'.repeat(100), undefined);
 assert.equal(long.status, 200);
 assert.equal(typeof long.body.tag, 'string');
 assert.ok(long.body.tag.length <= 28);
 assert.ok(Array.isArray(long.body.items));
});

test('#1552 공유 신고 이유 500자는 저장하고 501자는 빈 이유와 같은 400이다', async () => {
 const {handle,communityRepo} = await setup(), shareId = 's'.repeat(24), path = '/api/community/shares/' + shareId + '/report';
 const ok = await call(handle, 'POST', path, {account: 'bob', body: {reason: '가'.repeat(500)}, key: 'report-key-1552-ok'});
 assert.equal(ok.status, 201);
 assert.equal(communityRepo.inspect().reports.find(r => r.id === ok.body.report.id).reason.length, 500);
 const empty = await call(handle, 'POST', path, {account: 'bob', body: {reason: ''}, key: 'report-key-1552-empty'});
 const tooLong = await call(handle, 'POST', path, {account: 'bob', body: {reason: '가'.repeat(501)}, key: 'report-key-1552-long'});
 assert.equal(empty.status, 400);
 assert.equal(tooLong.status, 400);
 assert.deepEqual(tooLong.body, empty.body);
});
