import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool} from '../server/db/postgres.js';
import {createCommunityRepo} from '../server/db/community-postgres.js';
import {createTreeVisibilityRepo} from '../server/db/tree-visibility-postgres.js';
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
  await insert(sid('two'),'own-c','tree-c',{});                         // 순간 2개 → 안 나온다
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
