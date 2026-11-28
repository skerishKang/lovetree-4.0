import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {applySchema,createPool,createWorkspaceRepo} from '../server/db/postgres.js';
import {createAdminRoleRepo} from '../server/db/admin-roles-postgres.js';
import {createAdminRoleService,ROLE_UNKNOWN} from '../server/admin-roles.js';
import {createCommunityRepo} from '../server/db/community-postgres.js';
import {assertIsolatedTestDatabase} from '../server/testing/isolated-test-database.js';
import {ownerFixture,owner,shareId,label,viewer,makePublicHandler,compareRequests,paths,assertSameResponse} from './helpers/public-owner-batch.mjs';

const url=process.env.LOVETREE_TEST_DATABASE_URL||'';
async function seed(pool,productId,data,mixed){
 const docs=[...data.docs].map(([subject_id,doc])=>({subject_id,doc}));
 await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) SELECT $1,x.subject_id,x.doc FROM jsonb_to_recordset($2::jsonb) AS x(subject_id text,doc jsonb)',[productId,JSON.stringify(docs)]);
 const rows=data.shares.map(s=>({share_id:s.shareId,subject_id:s.subjectId,tree_id:s.treeId,entry_moment_id:s.entryMomentId,initial_view:s.view,moment_count:s.momentCount,status:s.status,created_at:s.createdAt}));
 await pool.query('INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,moment_count,status,created_at) SELECT $1,x.share_id,x.subject_id,x.tree_id,x.entry_moment_id,x.initial_view,x.moment_count,x.status,x.created_at FROM jsonb_to_recordset($2::jsonb) AS x(share_id text,subject_id text,tree_id text,entry_moment_id text,initial_view text,moment_count int,status text,created_at timestamptz)',[productId,JSON.stringify(rows)]);
 await pool.query('INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) SELECT $1,x.subject_id,x.tree_id,true FROM jsonb_to_recordset($2::jsonb) AS x(subject_id text,tree_id text)',[productId,JSON.stringify(data.shares.filter(s=>s.discover).map(s=>({subject_id:s.subjectId,tree_id:s.treeId})))]);
 if(!mixed)return;
 await pool.query('INSERT INTO lovetree_product_roles(product_id,subject_id,role) SELECT $1,x.subject_id,x.role FROM jsonb_to_recordset($2::jsonb) AS x(subject_id text,role text)',[productId,JSON.stringify(data.roles.map(r=>({subject_id:r.subjectId,role:r.role})))]);
 await pool.query("INSERT INTO lovetree_tree_visibility(product_id,subject_id,tree_id,visibility) VALUES($1,$2,$3,'private')",[productId,owner(5),'tree-5']);
 await pool.query('INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,$3)',[productId,shareId(6),viewer]);
 await pool.query('INSERT INTO lovetree_community_blocks(product_id,blocker_subject_id,blocked_subject_id) VALUES($1,$2,$3),($1,$4,$2)',[productId,viewer,owner(10),owner(11)]);
 // 인기순이 최신순과 실제로 다른 시험 자료를 둔다.
 await pool.query("INSERT INTO lovetree_community_votes(product_id,subject_id,target_kind,target_id,voted_at) VALUES($1,$2,'tree',$3,$4),($1,$5,'tree',$3,$4)",[productId,owner(20),shareId(1),'2026-11-19T00:00:00Z',owner(21)]);
}
function harness(pool,productId){
 let queries=0;
 const counted={query:async(...args)=>{queries++;return pool.query(...args);}};
 const workspaceRepo=createWorkspaceRepo(counted),roleStore=createAdminRoleRepo(counted),communityRepo=createCommunityRepo(counted,{hasRealCustomers:true});
 return {workspaceRepo,roleStore,makeHandler:legacy=>makePublicHandler({productId,workspaceRepo,roleStore,communityRepo,legacy}),
  measure:async fn=>{queries=0;const response=await fn();return {response,queries};}};
}
async function cleanup(pool,products){
 for(const table of ['lovetree_community_votes','lovetree_community_blocks','lovetree_community_hidden_shares','lovetree_tree_discover','lovetree_tree_visibility','lovetree_product_roles','lovetree_shares','lovetree_workspaces'])
  await pool.query('DELETE FROM '+table+' WHERE product_id=ANY($1::text[])',[products]);
}

test('격리 PostgreSQL 공개 조회 후보 400장도 질의 상한을 지키고 단건 응답과 바이트가 같다',{skip:!url},async t=>{
 assertIsolatedTestDatabase(url);
 const pool=await createPool(url,{max:8}),productId='owner-batch-large-'+randomBytes(8).toString('hex');
 try{
  await applySchema(pool);
  await seed(pool,productId,ownerFixture(400),false);
  const f=harness(pool,productId);
  await compareRequests(f.makeHandler,f.measure,[
   [paths.shares,{limit:'240'}],[paths.stats,{}],[paths.moments,{}],[paths.moments,{limit:'30'}],[paths.tags,{tag:'가수:검증그룹'}]
  ]);
  const handle=f.makeHandler(false);
  const shares=await f.measure(()=>handle(paths.shares,{limit:'240'}));
  assert.equal(shares.queries,3);assert.equal(shares.response.body.totalVisible,240);assert.equal(shares.response.body.items.length,24);
  const moments=await f.measure(()=>handle(paths.moments,{}));
  assert.equal(moments.queries,3);assert.equal(moments.response.body.total,1200);assert.equal(moments.response.body.items.length,30);
  const tag=await f.measure(()=>handle(paths.tags,{tag:'가수:검증그룹'}));
  assert.equal(tag.queries,3);assert.equal(tag.response.body.items.length,30);
  const cold=await f.measure(()=>handle(paths.stats));
  const warm=await f.measure(()=>handle(paths.stats));
  assert.equal(cold.queries,2);assert.equal(warm.queries,0);
  assertSameResponse(cold.response,warm.response,'공개 집계 캐시');
  t.diagnostic('둘러보기 240장 3회, 순간·꼬리표 400장 각각 3회, 집계 2회, 캐시 0회');
 }finally{await cleanup(pool,[productId]);await pool.end();}
});

test('격리 PostgreSQL 일괄 조회는 정렬·공개 경계·역할·제품 격리를 그대로 유지',{skip:!url},async()=>{
 assertIsolatedTestDatabase(url);
 const pool=await createPool(url,{max:8}),productId='owner-batch-mixed-'+randomBytes(8).toString('hex'),foreign=productId+'-foreign';
 try{
  await applySchema(pool);
  await seed(pool,productId,ownerFixture(24,{mixed:true}),true);
  await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3)',[foreign,owner(9),{version:1,trees:[]}]);
  await pool.query("INSERT INTO lovetree_product_roles(product_id,subject_id,role) VALUES($1,$2,'tester')",[foreign,owner(2)]);
  const f=harness(pool,productId);
  await compareRequests(f.makeHandler,f.measure);
  const handle=f.makeHandler(false);
  for(const i of [4,5,6,7,8,9]){
   assert.deepEqual((await handle(paths.shares,{q:label(i)})).body.items,[],'제외 카드 '+i);
   assert.deepEqual((await handle(paths.tags,{tag:'노래:검증-'+i})).body.items,[],'제외 순간 '+i);
  }
  assert.equal((await handle(paths.shares,{q:label(3)})).body.items[0].aiTester,true);
  assert.deepEqual((await handle(paths.shares,{q:label(3),sort:'popular'})).body.items,[]);
  for(const i of [1,2,13])assert.equal((await handle(paths.shares,{q:label(i)})).body.items[0].shareId,shareId(i));
  assert.equal((await handle(paths.shares,{sort:'popular'})).body.items[0].shareId,shareId(1));
  assert.deepEqual((await handle(paths.shares,{q:label(10)},viewer)).body.items,[]);
  for(const i of [10,11,12])assert.deepEqual((await handle(paths.tags,{tag:'노래:검증-'+i},viewer)).body.items,[]);
  const docs=await f.workspaceRepo.loadMany({productId,subjectIds:[owner(1),owner(9),owner(1)]});
  assert.equal(docs.size,1);assert.equal(docs.has(owner(9)),false);
  assert.deepEqual(docs.get(owner(1)),await f.workspaceRepo.load({productId,subjectId:owner(1)}));
  const {response:rawRoles,queries:batchQueries}=await f.measure(() =>
   f.roleStore.rolesFor({productId,subjectIds:[owner(1),owner(2),owner(3),owner(4),owner(9)]}));
  assert.equal(batchQueries,1,'요청한 모든 계정에 대해 SQL 한 번');
  assert.equal(rawRoles.size,5);
  assert.equal(rawRoles.has(owner(1)),true);
  assert.equal(rawRoles.get(owner(1)),null,'일반 계정 역할 없음은 명시적 null');
  assert.equal(rawRoles.get(owner(2)),null,'다른 제품 역할은 섞지 않음');
  assert.equal(rawRoles.get(owner(3))?.role,'ai_customer');
  assert.equal(rawRoles.get(owner(4))?.role,'tester');
  assert.equal(rawRoles.get(owner(9)),null,'역할도 문서도 없는 계정 null');
  const admin=createAdminRoleService({store:f.roleStore,productId}),ids=[owner(2),owner(3),owner(4),'invalid'];
  const roles=await admin.rolesFor({productId,subjectIds:ids},{unknownOnFailure:true});
  for(const id of ids)assert.equal(roles.get(id),await admin.roleFor({productId,subjectId:id},{unknownOnFailure:true}));
  assert.equal(roles.get(owner(2)),null);assert.equal(roles.get('invalid'),ROLE_UNKNOWN);
 }finally{await cleanup(pool,[productId,foreign]);await pool.end();}
});
