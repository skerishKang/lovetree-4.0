import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool} from '../server/db/postgres.js';
import {createCommunityRepo} from '../server/db/community-postgres.js';
import {createTreeVisibilityRepo} from '../server/db/tree-visibility-postgres.js';
import {createTreeDiscoverRepo} from '../server/db/tree-discover-postgres.js';
import {createStatsRepo} from '../server/db/stats-postgres.js';
import {createMemoryStatsRepo} from '../server/testing/memory-stats-repo.js';
import {createMemoryAccountRepo} from '../server/testing/memory-account-repo.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
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
  // 2026-11-16 대표 결정: 소개가 켜진 트리만 목록에 나온다(기본 꺼짐) — 시드 뒤 켠다.
  await pool.query(`INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,'tree',true)`,[productId,'owner-'+tag]);
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
  await pool.query(`INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,'tree',true)`,[productId,'owner-'+tag]);
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
test('#538 둘러보기 SQL: 소개 켬 + 순간 3개 이상·트리당 한 행·비공개 제외·숨김은 트리 단위(261116 대표 결정)',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),visibility=createTreeVisibilityRepo(pool),discover=createTreeDiscoverRepo(pool),tag=suffix(),productId='lt-'+tag;
  const insert=async(shareId,subjectId,treeId,{origin='auto',momentCount=3,discoverable=false})=>{
   await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,origin,moment_count) VALUES($1,$2,$3,$4,'moment','book',$5,$6,$7)`,
    [productId,shareId,subjectId,treeId,discoverable,origin,momentCount]);
  };
  const sid=prefix=>(prefix+tag).padEnd(24,'x').slice(0,24);
  const listedTrees=async()=>(await repo.listDiscoverable({productId})).map(row=>row.treeId).sort();
  await insert(sid('auto3'),'own-a','tree-a',{});await discover.set({productId,subjectId:'own-a',treeId:'tree-a',discover:true}); // 켬 → 나온다
  await insert(sid('own3'),'own-b','tree-b',{origin:'owner',discoverable:true});await discover.set({productId,subjectId:'own-b',treeId:'tree-b',discover:true}); // 옛 스위치 행도 소개 표가 켜져야 나온다
  await insert(sid('two'),'own-c','tree-c',{momentCount:2});await discover.set({productId,subjectId:'own-c',treeId:'tree-c',discover:true}); // 2개 → 안 나온다
  await insert(sid('off'),'own-f','tree-f',{});                             // 기본 꺼짐 → 안 나온다
  await insert(sid('priv'),'own-d','tree-d',{});await discover.set({productId,subjectId:'own-d',treeId:'tree-d',discover:true}); // 켜도 비공개는 안 나온다
  await visibility.set({productId,subjectId:'own-d',treeId:'tree-d',visibility:'private'});
  await insert(sid('dupO'),'own-e','tree-e',{origin:'owner',discoverable:true});await discover.set({productId,subjectId:'own-e',treeId:'tree-e',discover:true}); // 같은 트리에
  await insert(sid('dupA'),'own-e','tree-e',{});                            // 자동 행과 옛 행 → 한 행만
  assert.deepEqual(await listedTrees(),['tree-a','tree-b','tree-e'],'2개·비공개·소개 꺼짐은 빠지고 트리당 한 행만');
  const dup=(await repo.listDiscoverable({productId})).find(row=>row.treeId==='tree-e');
  assert.equal(dup.shareId,sid('dupA'),'트리당 자동 공개 행을 우선한다');
  // 숨김은 트리 단위: 자동 행을 숨겨도 같은 트리의 옛 행으로 다시 나오지 않는다.
  await pool.query(`INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,'admin')`,[productId,sid('dupA')]);
  assert.deepEqual(await listedTrees(),['tree-a','tree-b']);
  // 고객이 끄면 빠지고, 다시 켜면 돌아온다(무료 — 재실행 안전).
  await discover.set({productId,subjectId:'own-a',treeId:'tree-a',discover:false});
  assert.deepEqual(await listedTrees(),['tree-b'],'끄면 목록에서 빠진다');
  await discover.set({productId,subjectId:'own-a',treeId:'tree-a',discover:true});
  assert.deepEqual(await listedTrees(),['tree-a','tree-b'],'다시 켜면 목록에 돌아온다');
 }finally{await pool.end();}
});

// #655 2차: 운영센터 전체 숫자의 집계 질의. 실제 PostgreSQL 이 메모리 모형과 같은 숫자를 내는지 함께 본다.
test('운영센터 전체 숫자 집계: 계정·트리·순간·공개·둘러보기·AI 테스터를 한 번의 집계로 세고 메모리 모형과 같다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const tag=suffix(),productId='lt-'+tag;
  const REAL_ONE='sub_a'+tag,REAL_TWO='sub_b'+tag,AI_ONE='sub_c'+tag;
  const recent=new Date(Date.now()-3600e3).toISOString(),old='2026-05-01T00:00:00.000Z';
  const tree=(id,subject,moments,createdAt=old)=>({id,subject,title:'나무 '+id,coverMomentId:'',coverDesign:'',inbox:false,createdAt,updatedAt:createdAt,
    moments:moments.map((createdAt,index)=>({id:`${id}-m${index}`,parentId:null,links:[],title:'순간',note:'',emotion:'설렘',date:'2026-05-01',url:'',createdAt}))});
  const docs=new Map([
    [REAL_ONE,{version:1,trees:[tree('t1','윤슬',[recent,old]),tree('t2','윤슬',[old])]}],
    [REAL_TWO,{version:1,trees:[tree('t3','윤슬',[recent],recent)]}],
    [AI_ONE,{version:1,trees:[tree('t4','윤슬',[old,old,old])]}]
  ]);
  for(const [subjectId,doc] of docs)await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3::jsonb)',[productId,subjectId,JSON.stringify(doc)]);
  // AI 테스터 역할과 공유 행. '계정'과 '새 계정'은 로그인 표(lovetree_account_emails)의
  // created_at(첫 로그인 시각 = 가입일)으로 가른다 — 문서를 하나도 안 쓴 로그인만 계정도 센다.
  await pool.query("INSERT INTO lovetree_product_roles(product_id,subject_id,role) VALUES($1,$2,'ai_customer')",[productId,AI_ONE]);
  const LOGIN_ONLY='sub_d'+tag;
  // #671: 레인 시험 계정 표식 tester — 실제 사용자와 갈라 센다.
  const TESTER_ONE='sub_e'+tag;
  await pool.query("INSERT INTO lovetree_product_roles(product_id,subject_id,role) VALUES($1,$2,'tester')",[productId,TESTER_ONE]);
  const login=(subjectId,createdAt)=>pool.query('INSERT INTO lovetree_account_emails(product_id,subject_id,email,created_at) VALUES($1,$2,$3,$4)',[productId,subjectId,subjectId+'@example.test',createdAt]);
  await login(REAL_ONE,old);
  await login(REAL_TWO,old);
  await login(AI_ONE,old);
  await login(LOGIN_ONLY,recent);
  await login(TESTER_ONE,recent);
  await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3::jsonb)',[productId,TESTER_ONE,JSON.stringify({version:1,trees:[{id:'t5',createdAt:recent,moments:[{id:'t5-m0',createdAt:recent},{id:'t5-m1',createdAt:recent}]}]})]);
  const share=(shareId,subjectId,treeId,momentCount,createdDaysAgo)=>pool.query(
    `INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,origin,moment_count,created_at)
     VALUES($1,$2,$3,$4,$5,'book','auto',$6,now()-($7||' days')::interval)`,[productId,shareId,subjectId,treeId,treeId+'-m0',momentCount,String(createdDaysAgo)]);
  await share(('s1'+tag).padEnd(24,'x').slice(0,24),REAL_ONE,'t1',3,30);
  await share(('s2'+tag).padEnd(24,'x').slice(0,24),REAL_ONE,'t2',1,30);
  await share(('s3'+tag).padEnd(24,'x').slice(0,24),AI_ONE,'t4',3,30);
  await share(('s4'+tag).padEnd(24,'x').slice(0,24),REAL_TWO,'t3',3,0);
  // 2026-11-16 대표 결정: 소개 켬 트리만 둘러보기 숫자에 센다 — t1·t4는 켜고, t2(1개)도 켜 보아 순간 수 조건을 함께 본다.
  await pool.query(`INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,'t1',true),($1,$3,'t4',true),($1,$2,'t2',true)`,[productId,REAL_ONE,AI_ONE]);
  // 비공개 트리는 공유 행이 있어도 공개·둘러보기에서 빠진다.
  await pool.query("INSERT INTO lovetree_tree_visibility(product_id,subject_id,tree_id,visibility) VALUES($1,$2,'t3','private')",[productId,REAL_TWO]);

  const stats=await createStatsRepo(pool).aggregate({productId,since:new Date(Date.now()-7*86400e3).toISOString()});
  // #743: 트리 계열 카드의 펼침 내역에 쓰는 제목 목록(최대 20)도 같은 집계에서 온다 — 제목만 싣는다.
  // t5는 제목이 없어 목록에서 빠진다(빈 이름을 지어내지 않는다). 순서는 제목·id 순(두 구현 같은 규칙).
  assert.deepEqual(stats,{
    accountsReal:3,accountsAi:1,accountsTester:1,accountsNewReal:1,accountsNewAi:0,accountsNewTester:1,
    treesReal:3,treesAi:1,treesTester:1,
    momentsReal:4,momentsAi:3,momentsTester:2,momentsNewReal:2,momentsNewAi:0,momentsNewTester:2,
    publicReal:2,publicAi:1,publicTester:0,
    featuredReal:1,featuredAi:1,featuredTester:0,
    treesTitles:['나무 t1','나무 t2','나무 t3','나무 t4'],
    publicTitles:['나무 t1','나무 t2','나무 t4'],
    featuredTitles:['나무 t1','나무 t4']
  });

  // 같은 자료를 메모리 저장소로도 쌓아 두 구현이 같은 숫자를 내는지 본다(계약이 갈라지면 여기서 걸린다).
  const workspaceRepo=createMemoryWorkspaceRepo();
  let writes=0;
  for(const [subjectId,doc] of docs)await workspaceRepo.commit({productId,subjectId,doc,expectedRevision:0,clientKey:'k'+(++writes),requestHash:'a'.repeat(64)});
  const accountRepo=createMemoryAccountRepo();
  for(const [subjectId,createdAt] of [[REAL_ONE,old],[REAL_TWO,old],[AI_ONE,old],[LOGIN_ONLY,recent],[TESTER_ONE,recent]]){
    await accountRepo.upsertEmail({productId,subjectId,email:subjectId+'@example.test',at:createdAt});
  }
  const shareRepo=createMemoryShareRepo({now:Date.now()-30*86400e3});
  for(const [subjectId,treeId,momentCount,daysAgo] of [[REAL_ONE,'t1',3,30],[REAL_ONE,'t2',1,30],[AI_ONE,'t4',3,30],[REAL_TWO,'t3',3,0]]){
    await shareRepo.upsertAutoShare({productId,subjectId,shareId:'m'+subjectId+treeId,treeId,entryMomentId:treeId+'-m0',momentCount});
  }
  const roleStore=createModelAdminRoleStore();
  await roleStore.assign({productId,subjectId:AI_ONE,role:'ai_customer'});
  await roleStore.assign({productId,subjectId:TESTER_ONE,role:'tester'});
  await workspaceRepo.commit({productId,subjectId:TESTER_ONE,doc:{version:1,trees:[{id:'t5',createdAt:recent,moments:[{id:'t5-m0',createdAt:recent},{id:'t5-m1',createdAt:recent}]}]},expectedRevision:0,clientKey:'k-tester',requestHash:'b'.repeat(64)});
  const visibilityRepo=createMemoryTreeVisibilityRepo();
  await visibilityRepo.set({productId,subjectId:REAL_TWO,treeId:'t3',visibility:'private'});
  const memory=await createMemoryStatsRepo({workspaceRepo,shareRepo,accountRepo,roleStore,visibilityRepo}).aggregate({productId,since:new Date(Date.now()-7*86400e3).toISOString()});
  assert.deepEqual(memory,stats);
 }finally{await pool.end();}
});
