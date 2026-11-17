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

test('#627: 둘러보기 검색은 트리 순간의 제목(영상 제목 포함)도 본다',async()=>{
 // 트리 이름은 자동 이름('모아둔 순간')이고, 그룹 이름은 순간의 영상 제목에만 있다.
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const video='https://www.youtube.com/shorts/Rescene0001',thumbnail='https://i.ytimg.com/vi/Rescene0001/hqdefault.jpg';
 let tree=createTree({subject:'윤슬',title:'첫 무대',note:'다시 보고 싶은 빛',emotion:'설렘',date:'2026-11-01',url:PHOTO},CLOCK);
 tree=editTree(tree,{title:'모아둔 순간',subject:tree.subject,coverMomentId:tree.moments[0].id});
 tree=addMoment(tree,{type:'video',url:video,mediaMetadata:{title:'RESCENE(리센느) 무대 직캠',channel:'기록 채널',source:'youtube.com'}},tree.moments[0].id,CLOCK);
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
  assert.equal(JSON.stringify(list.body).includes('IVE'),false);
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
async function tagSetup({accounts,aiSubjects=[],testerSubjects=[],privateTreeId=null,hiddenShareIds=[],blocks=[],discoverOff=[]}={}){
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
 const admin={roleFor:async value=>aiSubjects.includes(value.subjectId)?'ai_customer':(testerSubjects.includes(value.subjectId)?'tester':null)};
 const service=createCommunityService({communityRepo,shareRepo,workspaceRepo,productId:PRODUCT,admin,makeId:()=>String(++n).padStart(24,'c')});
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

test('tag-moments: 응답은 제목·영상 주소·썸네일·무대 날짜·트리 이름·공유 링크·aiTester뿐 — 개인정보 필드가 없다',async()=>{
 const data=await tagSetup({
  accounts:[{subject:'kimbs5993+tutorial01@gmail.com',trees:[{title:'공개 트리',moments:[
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
