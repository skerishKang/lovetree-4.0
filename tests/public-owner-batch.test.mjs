import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createModelAdminRoleStore} from '../server/testing/model-admin-role-store.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createAdminRoleService,ROLE_UNKNOWN} from '../server/admin-roles.js';
import {ownerFixture,owner,shareId,label,viewer,makePublicHandler,compareRequests,paths,clock} from './helpers/public-owner-batch.mjs';

async function memoryFixture(n,mixed=false,{batchOverride=null,ownerRoleLookup=null}={}){
 const productId='owner-batch-test';
 const data=ownerFixture(n,{mixed}),workspace=createMemoryWorkspaceRepo(),store=createModelAdminRoleStore();
 for(const [subjectId,doc] of data.docs)await workspace.commit({productId,subjectId,doc,expectedRevision:0,clientKey:'fixture',requestHash:'fixture'});
 for(const row of data.roles)await store.assign({productId,...row,grantedBy:'fixture'});
 const index=new Map(data.shares.map(s=>[JSON.stringify([s.subjectId,s.treeId]),s]));
 const roles=new Map(data.roles.map(s=>[s.subjectId,s.role]));
 const base=createMemoryCommunityRepo({
  isPrivateTree:(_p,s,t)=>index.get(JSON.stringify([s,t]))?.private===true,
  isDiscoverOn:(_p,s,t)=>index.get(JSON.stringify([s,t]))?.discover===true,
  roleFor:ownerRoleLookup||(({subjectId})=>roles.get(subjectId)||null),hasRealCustomers:true,now:()=>clock
 });
 base.seedShares(data.shares.map(s=>({productId,...s})));
 if(mixed){
  await base.createReport({productId,reportId:'fixture-report',shareId:shareId(6),subjectId:viewer,reason:'시험',clientKey:'fixture'});
  await base.moderateReport({productId,reportId:'fixture-report',status:'closed',visibility:'hidden',actorSubjectId:viewer});
  await base.blockOwner({productId,blockerSubjectId:viewer,blockedSubjectId:owner(10)});
  await base.blockOwner({productId,blockerSubjectId:owner(11),blockedSubjectId:viewer});
 }
 let queries=0;
 const wrap=(repo,names)=>({...repo,...Object.fromEntries(names.map(name=>[name,async (...args)=>{queries++;return repo[name](...args);}]))});
 const workspaceRepo=wrap(workspace,['load','loadMany']);
 const roleStore=wrap(store,['roleFor','rolesFor']);
 if(batchOverride)roleStore.rolesFor=async args=>{queries++;return batchOverride(args,store);};
 const communityRepo=wrap(base,['listDiscoverableSummaries','listPublicTagShares']);
 return {workspace,store,productId,makeHandler:legacy=>makePublicHandler({productId,workspaceRepo,roleStore,communityRepo,legacy}),
  measure:async fn=>{queries=0;const response=await fn();return {response,queries};}};
}

test('공개 목록의 계정 문서·역할 일괄 조회는 후보 수와 무관하게 3회 이하',async()=>{
 for(const n of [24,60,240,400]){
  const f=await memoryFixture(n);
  await compareRequests(f.makeHandler,f.measure,[
   [paths.shares,{limit:String(n)}],[paths.stats,{}],[paths.moments,{}],[paths.moments,{limit:'30'}],[paths.tags,{tag:'가수:검증그룹'}]
  ]);
  const handle=f.makeHandler(false);
  const cold=await f.measure(()=>handle(paths.stats));
  const warm=await f.measure(()=>handle(paths.stats));
  assert.equal(cold.queries,2);assert.equal(warm.queries,0);
  assert.deepEqual(cold.response,warm.response);
 }
});

test('공개 목록 응답 바이트와 숨김·비공개·차단·시험 계정·명예회원 판정을 유지',async()=>{
 const f=await memoryFixture(24,true);
 await compareRequests(f.makeHandler,f.measure);
 const handle=f.makeHandler(false);
 for(const i of [4,5,6,7,8,9]){
  const card=await handle(paths.shares,{q:label(i)});
  const tag=await handle(paths.tags,{tag:'노래:검증-'+i});
  assert.deepEqual(card.body.items,[],'제외 카드 '+i);
  assert.deepEqual(tag.body.items,[],'제외 순간 '+i);
 }
 assert.equal((await handle(paths.shares,{q:label(3)})).body.items[0].aiTester,true);
 for(const i of [10,11,12]){
  assert.deepEqual((await handle(paths.tags,{tag:'노래:검증-'+i},viewer)).body.items,[]);
 }
 assert.deepEqual((await handle(paths.shares,{q:label(10)},viewer)).body.items,[]);
 for(const i of [1,2,13])assert.equal((await handle(paths.shares,{q:label(i)})).body.items[0].shareId,shareId(i));
});

test('역할 일괄 조회는 제품 격리·없는 행·잘못된 식별자·조회 실패를 단건과 같이 판정',async()=>{
 const store=createModelAdminRoleStore(),productId='owner-batch-test',ids=[owner(1),owner(2),owner(3),'invalid-owner'];
 await store.assign({productId,subjectId:ids[0],role:'ai_customer',grantedBy:'fixture'});
 await store.assign({productId:'other-product',subjectId:ids[1],role:'tester',grantedBy:'fixture'});
 const svc=createAdminRoleService({store,productId});
 const opt={unknownOnFailure:true};
 const batch=await svc.rolesFor({productId,subjectIds:[...ids,ids[0]]},opt);
 assert.equal(batch.size,4);
 for(const id of ids)assert.equal(batch.get(id),await svc.roleFor({productId,subjectId:id},opt));
 assert.equal(batch.get(ids[1]),null);
 assert.equal(batch.get(ids[3]),ROLE_UNKNOWN);
 const explicit=await store.rolesFor({productId,subjectIds:[ids[0],ids[1],ids[2],ids[0]]});
 assert.equal(explicit.size,3,'요청한 모든 서로 다른 계정 키');
 assert.equal(explicit.has(ids[1]),true,'역할 없는 정상 계정도 명시적인 키');
 assert.equal(explicit.get(ids[1]),null);
 const foreign=await svc.rolesFor({productId:'other-product',subjectIds:ids},opt);
 assert.ok([...foreign.values()].every(role=>role===null));
 const broken=createAdminRoleService({productId,store:{...store,
  rolesFor:async()=>{throw Error('시험 오류');},
  roleFor:async input=>{if(input.subjectId===ids[2])throw Error('시험 오류');return store.roleFor(input);}
 }});
 const fallback=await broken.rolesFor({productId,subjectIds:ids},opt);
 assert.equal(fallback.get(ids[0]),'ai_customer');
 assert.equal(fallback.get(ids[2]),ROLE_UNKNOWN);
});

test('메모리 문서 일괄 조회는 같은 제품만 읽고 없는 계정을 생략하며 원본을 보호',async()=>{
 const f=await memoryFixture(2);
 const ids=[owner(1),owner(2),owner(3),owner(1)];
 await f.workspace.commit({productId:'other-product',subjectId:owner(3),doc:{version:1,trees:[]},expectedRevision:0,clientKey:'fixture',requestHash:'fixture'});
 const batch=await f.workspace.loadMany({productId:f.productId,subjectIds:ids});
 assert.equal(batch.size,2);assert.equal(batch.has(owner(3)),false);
 assert.deepEqual(batch.get(owner(1)),await f.workspace.load({productId:f.productId,subjectId:owner(1)}));
 batch.get(owner(1)).doc.trees.length=0;
 assert.equal((await f.workspace.load({productId:f.productId,subjectId:owner(1)})).doc.trees.length,1);
});


// #1614: 정상 '역할 없음'은 명시적인 null, 부분 결과 누락은 모름으로 닫는다.
// 이 계약은 서버와 저장소의 양쪽을 함께 검증해야 한다.
test('#1614 부분 결과: 명시적 역할 없음과 누락된 시험 계정을 구분',async()=>{
 const productId='owner-batch-test', good=owner(1), missed=owner(4);
 const store={
  async roleFor({subjectId}){return subjectId===missed?{productId,subjectId,role:'tester'}:null;},
  async rolesFor(){return new Map([[good,null]]);}
 };
 const admin=createAdminRoleService({store,productId});
 const roles=await admin.rolesFor({productId,subjectIds:[good,missed]},{unknownOnFailure:true});
 assert.equal(roles.get(good),null,'명시한 역할 없음은 정상 공개 계정');
 assert.equal(roles.get(missed),ROLE_UNKNOWN,'누락한 계정은 모름');
 assert.equal(roles.size,2);
});

test('#1614 부분 일괄 조회에서 빠진 시험 계정은 공개 카드·태그·순간에서 제외, 질의 상한 유지',async()=>{
 const missing=owner(4);
 const f=await memoryFixture(24,true,{
  ownerRoleLookup:()=>null,
  batchOverride:async({productId,subjectIds},store)=>{
   // 모든 일반 계정의 역할 없음은 명시한다. 시험 계정 하나만 누락한다.
   const result=new Map();
   for(const subjectId of subjectIds){
    if(subjectId===missing)continue;
    result.set(subjectId,await store.roleFor({productId,subjectId}));
   }
   return result;
  }
 });
 const handle=f.makeHandler(false);
 for(const [path,query] of [
   [paths.shares,{q:label(4)}],
   [paths.tags,{tag:'노래:검증-4'}],
   [paths.moments,{limit:'30'}]
 ]){
  const {response,queries}=await f.measure(()=>handle(path,query));
  assert.equal(response.status,200,path);
  assert.ok(queries<=3,path+' 질의 수: '+queries);
  assert.equal(response.body.items.some(item=>item.shareId===shareId(4)),false,path+' 부분 결과 누락 계정 제외');
 }
 const {response,queries}=await f.measure(()=>handle(paths.shares,{q:label(1)}));
 assert.equal(queries,3);
 assert.equal(response.body.items[0]?.shareId,shareId(1),'명시적 역할 없음 일반 계정 공개 유지');
});
