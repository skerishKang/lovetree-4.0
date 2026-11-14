import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool} from '../server/db/postgres.js';
import {createCommunityRepo} from '../server/db/community-postgres.js';
import {createTreeVisibilityRepo} from '../server/db/tree-visibility-postgres.js';
import {createStatsRepo} from '../server/db/stats-postgres.js';
import {createMemoryStatsRepo} from '../server/testing/memory-stats-repo.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryFeedbackRepo} from '../server/testing/memory-feedback-repo.js';
import {createMemoryTreeVisibilityRepo} from '../server/testing/memory-tree-visibility-repo.js';
import {createModelAdminRoleStore} from '../server/testing/model-admin-role-store.js';
import {assertIsolatedTestDatabase} from '../server/testing/isolated-test-database.js';
const DATABASE_URL=process.env.LOVETREE_TEST_DATABASE_URL??'',skip=DATABASE_URL?false:'isolated PostgreSQL unavailable';
const suffix=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
test('community rows are independent, idempotent and auditable',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),tag=suffix(),productId='lt-'+tag,shareId=('s'+tag).padEnd(24,'x').slice(0,24);
  await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,moment_count) VALUES($1,$2,$3,'tree','moment','book',true,3)`,[productId,shareId,'owner-'+tag]);
  assert.equal((await repo.listDiscoverable({productId})).length,1);
  await repo.setFavorite({productId,shareId,subjectId:'reader',enabled:true});await repo.setFavorite({productId,shareId,subjectId:'reader',enabled:true});
  await repo.setReaction({productId,shareId,subjectId:'reader',enabled:true});
  assert.deepEqual(await repo.stats({productId,shareId,viewerSubjectId:'reader'}),{favorites:1,hearts:1,comments:0,favored:true,hearted:true,reactions:{heart:1,like:0,love:0,laugh:0,wow:0,sad:0,angry:0},mine:['heart']});
  const first=await repo.createComment({productId,commentId:'comment-'+tag,shareId,subjectId:'reader',body:'hello',clientKey:'comment-key-'+tag});
  const replay=await repo.createComment({productId,commentId:'other-'+tag,shareId,subjectId:'reader',body:'changed',clientKey:'comment-key-'+tag});
  assert.equal(replay.id,first.id);assert.equal(replay.body,'hello');
  const concurrent=await Promise.all([repo.createComment({productId,commentId:'parallel-a-'+tag,shareId,subjectId:'reader',body:'same',clientKey:'parallel-key-'+tag}),repo.createComment({productId,commentId:'parallel-b-'+tag,shareId,subjectId:'reader',body:'same',clientKey:'parallel-key-'+tag})]);assert.equal(concurrent[0].id,concurrent[1].id);
  const report=await repo.createReport({productId,reportId:'report-'+tag,shareId,subjectId:'reader',reason:'check',clientKey:'report-key-'+tag});
  assert.equal((await repo.moderateReport({productId,reportId:report.id,status:'resolved',visibility:'hidden',actorSubjectId:'admin'})).hidden,true);
  assert.equal((await repo.listDiscoverable({productId})).length,0);
  assert.equal((await repo.moderateReport({productId,reportId:report.id,status:'dismissed',visibility:'visible',actorSubjectId:'admin'})).hidden,false);
  const {rows}=await pool.query(`SELECT count(*)::int AS n FROM lovetree_community_moderation_audit WHERE product_id=$1`,[productId]);assert.equal(rows[0].n,4);
  await repo.blockOwner({productId,blockerSubjectId:'reader',blockedSubjectId:'owner-'+tag});
  assert.equal((await repo.listDiscoverable({productId,viewerSubjectId:'reader'})).length,0);
 }finally{await pool.end();}
});
test('browse reaction counts keep every kind and deletes remove only the requested kind',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),tag=suffix(),productId='lt-'+tag,shareId=('r'+tag).padEnd(24,'x').slice(0,24);
  await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,moment_count) VALUES($1,$2,$3,'tree','moment','book',true,3)`,[productId,shareId,'owner-'+tag]);
  const card=async viewer=>{const rows=await repo.listDiscoverableSummaries({productId,viewerSubjectId:viewer});return rows.find(row=>row.share.shareId===shareId);};
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'like',enabled:true});
  const first=await card('reader-a');
  assert.deepEqual(first.stats.reactions,{heart:0,like:1,love:0,laugh:0,wow:0,sad:0,angry:0});
  assert.deepEqual(first.stats.mine,['like']);
  await repo.setReaction({productId,shareId,subjectId:'reader-b',kind:'heart',enabled:true});
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'love',enabled:true});
  const both=await card('reader-a');
  assert.equal(both.stats.reactions.heart,1);assert.equal(both.stats.reactions.like,1);assert.equal(both.stats.reactions.love,1);
  assert.deepEqual([...both.stats.mine].sort(),['like','love']);
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'like',enabled:false});
  const afterDelete=await card('reader-a');
  assert.deepEqual(afterDelete.stats.reactions,{heart:1,like:0,love:1,laugh:0,wow:0,sad:0,angry:0});
  assert.deepEqual(afterDelete.stats.mine,['love']);
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'love',enabled:false});
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'like',enabled:true});
  const switched=await card('reader-a');
  assert.deepEqual(switched.stats.mine,['like']);
  assert.equal(switched.stats.reactions.like,1);assert.equal(switched.stats.reactions.love,0);
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'heart',enabled:true});
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'heart',enabled:false});
  const heartOff=await card('reader-a');
  assert.deepEqual(heartOff.stats.mine,['like']);
  assert.equal(heartOff.stats.reactions.heart,1);
 }finally{await pool.end();}
});
test('#538 둘러보기 SQL: 순간 3개 이상·트리당 한 행·비공개 제외·숨김은 트리 단위',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),visibility=createTreeVisibilityRepo(pool),tag=suffix(),productId='lt-'+tag;
  const insert=async(shareId,subjectId,treeId,{origin='auto',momentCount=3,discoverable=false})=>{
   await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,origin,moment_count) VALUES($1,$2,$3,$4,'moment','book',$5,$6,$7)`,
    [productId,shareId,subjectId,treeId,discoverable,origin,momentCount]);
  };
  const sid=prefix=>(prefix+tag).padEnd(24,'x').slice(0,24);
  await insert(sid('auto3'),'own-a','tree-a',{});                       // 자동 공개 3개 → 나온다
  await insert(sid('own3'),'own-b','tree-b',{origin:'owner',discoverable:true}); // 옛 스위치 행 3개 → 나온다
  await insert(sid('two'),'own-c','tree-c',{momentCount:2});            // 순간 2개 → 안 나온다
  await insert(sid('priv'),'own-d','tree-d',{});                        // 비공개 지정 → 안 나온다
  await visibility.set({productId,subjectId:'own-d',treeId:'tree-d',visibility:'private'});
  await insert(sid('dupO'),'own-e','tree-e',{origin:'owner',discoverable:true}); // 같은 트리에
  await insert(sid('dupA'),'own-e','tree-e',{});                        // 자동 행과 옛 행 → 한 행만
  const listed=await repo.listDiscoverable({productId});
  const trees=listed.map(row=>row.treeId).sort();
  assert.deepEqual(trees,['tree-a','tree-b','tree-e'],'2개·비공개는 빠지고 트리당 한 행만');
  const dup=listed.find(row=>row.treeId==='tree-e');
  assert.equal(dup.shareId,sid('dupA'),'트리당 자동 공개 행을 우선한다');
  // 숨김은 트리 단위: 자동 행을 숨겨도 같은 트리의 옛 행으로 다시 나오지 않는다.
  await pool.query(`INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,'admin')`,[productId,sid('dupA')]);
  assert.deepEqual((await repo.listDiscoverable({productId})).map(row=>row.treeId).sort(),['tree-a','tree-b']);
 }finally{await pool.end();}
});

// #655 2차: 운영센터 전체 숫자의 집계 질의. 실제 PostgreSQL 이 메모리 모형과 같은 숫자를 내는지 함께 본다.
test('운영센터 전체 숫자 집계: 계정·트리·순간·공개·둘러보기·AI 테스터를 한 번의 집계로 세고 메모리 모형과 같다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const tag=suffix(),productId='lt-'+tag;
  const REAL_ONE='sub_a'+tag,REAL_TWO='sub_b'+tag,AI_ONE='sub_c'+tag;
  const recent=new Date(Date.now()-3600e3).toISOString(),old='2026-05-01T00:00:00.000Z';
  const tree=(id,subject,moments)=>({id,subject,title:'나무 '+id,coverMomentId:'',coverDesign:'',inbox:false,createdAt:old,updatedAt:old,
    moments:moments.map((createdAt,index)=>({id:`${id}-m${index}`,parentId:null,links:[],title:'순간',note:'',emotion:'설렘',date:'2026-05-01',url:'',createdAt}))});
  const docs=new Map([
    [REAL_ONE,{version:1,trees:[tree('t1','윤슬',[recent,old]),tree('t2','윤슬',[old])]}],
    [REAL_TWO,{version:1,trees:[tree('t3','윤슬',[old])]}],
    [AI_ONE,{version:1,trees:[tree('t4','윤슬',[old,old,old])]}]
  ]);
  for(const [subjectId,doc] of docs)await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3::jsonb)',[productId,subjectId,JSON.stringify(doc)]);
  // AI 테스터 역할과 공유 행(30일 전에 만든 것으로 두어 '새 계정' 판정을 가른다)
  await pool.query("INSERT INTO lovetree_product_roles(product_id,subject_id,role) VALUES($1,$2,'ai_customer')",[productId,AI_ONE]);
  const share=(shareId,subjectId,treeId,momentCount,createdDaysAgo)=>pool.query(
    `INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,origin,moment_count,created_at)
     VALUES($1,$2,$3,$4,$5,'book','auto',$6,now()-($7||' days')::interval)`,[productId,shareId,subjectId,treeId,treeId+'-m0',momentCount,String(createdDaysAgo)]);
  await share(('s1'+tag).padEnd(24,'x').slice(0,24),REAL_ONE,'t1',3,30);
  await share(('s2'+tag).padEnd(24,'x').slice(0,24),REAL_ONE,'t2',1,30);
  await share(('s3'+tag).padEnd(24,'x').slice(0,24),AI_ONE,'t4',3,30);
  await share(('s4'+tag).padEnd(24,'x').slice(0,24),REAL_TWO,'t3',3,0);
  // 비공개 트리는 공유 행이 있어도 공개·둘러보기에서 빠진다.
  await pool.query("INSERT INTO lovetree_tree_visibility(product_id,subject_id,tree_id,visibility) VALUES($1,$2,'t3','private')",[productId,REAL_TWO]);
  await pool.query("INSERT INTO lovetree_feedback(product_id,subject_id,kind,category,body) VALUES($1,$2,'opinion','other','새로 왔어요')",[productId,REAL_TWO]);

  const stats=await createStatsRepo(pool).aggregate({productId,since:new Date(Date.now()-7*86400e3).toISOString()});
  assert.deepEqual(stats,{
    accountsReal:2,accountsAi:1,accountsNewReal:1,accountsNewAi:0,
    treesReal:3,treesAi:1,
    momentsReal:4,momentsAi:3,momentsNewReal:1,momentsNewAi:0,
    publicReal:2,publicAi:1,
    featuredReal:1,featuredAi:1
  });

  // 같은 자료를 메모리 저장소로도 쌓아 두 구현이 같은 숫자를 내는지 본다(계약이 갈라지면 여기서 걸린다).
  const workspaceRepo=createMemoryWorkspaceRepo();
  let writes=0;
  for(const [subjectId,doc] of docs)await workspaceRepo.commit({productId,subjectId,doc,expectedRevision:0,clientKey:'k'+(++writes),requestHash:'a'.repeat(64)});
  const shareRepo=createMemoryShareRepo({now:Date.now()-30*86400e3});
  for(const [subjectId,treeId,momentCount,daysAgo] of [[REAL_ONE,'t1',3,30],[REAL_ONE,'t2',1,30],[AI_ONE,'t4',3,30],[REAL_TWO,'t3',3,0]]){
    await shareRepo.upsertAutoShare({productId,subjectId,shareId:'m'+subjectId+treeId,treeId,entryMomentId:treeId+'-m0',momentCount});
  }
  const roleStore=createModelAdminRoleStore();
  await roleStore.assign({productId,subjectId:AI_ONE,role:'ai_customer'});
  const visibilityRepo=createMemoryTreeVisibilityRepo();
  await visibilityRepo.set({productId,subjectId:REAL_TWO,treeId:'t3',visibility:'private'});
  const feedbackRepo=createMemoryFeedbackRepo({now:Date.now()});
  await feedbackRepo.create({productId,subjectId:REAL_TWO,category:'other',body:'새로 왔어요'});
  const memory=await createMemoryStatsRepo({workspaceRepo,shareRepo,feedbackRepo,roleStore,visibilityRepo}).aggregate({productId,since:new Date(Date.now()-7*86400e3).toISOString()});
  assert.deepEqual(memory,stats);
 }finally{await pool.end();}
});
