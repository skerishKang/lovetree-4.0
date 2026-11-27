import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createModelAdminRoleStore} from '../server/testing/model-admin-role-store.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createAdminRoleService,ROLE_UNKNOWN} from '../server/admin-roles.js';
import {ownerFixture,owner,shareId,label,viewer,makePublicHandler,compareRequests,paths,clock} from './helpers/public-owner-batch.mjs';

async function memoryFixture(n,mixed=false){
 const productId='owner-batch-test';
 const data=ownerFixture(n,{mixed}),workspace=createMemoryWorkspaceRepo(),store=createModelAdminRoleStore();
 for(const [subjectId,doc] of data.docs)await workspace.commit({productId,subjectId,doc,expectedRevision:0,clientKey:'fixture',requestHash:'fixture'});
 for(const row of data.roles)await store.assign({productId,...row,grantedBy:'fixture'});
 const index=new Map(data.shares.map(s=>[JSON.stringify([s.subjectId,s.treeId]),s]));
 const roles=new Map(data.roles.map(s=>[s.subjectId,s.role]));
 const base=createMemoryCommunityRepo({
  isPrivateTree:(_p,s,t)=>index.get(JSON.stringify([s,t]))?.private===true,
  isDiscoverOn:(_p,s,t)=>index.get(JSON.stringify([s,t]))?.discover===true,
  roleFor:({subjectId})=>roles.get(subjectId)||null,hasRealCustomers:true,now:()=>clock
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
