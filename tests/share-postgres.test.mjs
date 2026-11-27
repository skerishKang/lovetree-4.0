import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool,createWorkspaceRepo} from '../server/db/postgres.js';
import {createShareRepo} from '../server/db/shares-postgres.js';
import {createShareService,createShareHandler} from '../server/share-service.js';
import {assertIsolatedTestDatabase} from '../server/testing/isolated-test-database.js';
import {ApiError} from '../server/errors.js';
const DATABASE_URL=process.env.LOVETREE_TEST_DATABASE_URL??'';
const skip=DATABASE_URL?false:'격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';
const suffix=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
test('share rows are owner-scoped, revocable, and schema application is repeatable',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);await applySchema(pool);const repo=createShareRepo(pool),tag=suffix(),productId='lt-'+tag,subjectId='u-'+tag,shareId=('s'+tag).padEnd(24,'x').slice(0,24);
  const made=await repo.create({productId,subjectId,shareId,treeId:'tree-a',entryMomentId:'moment-a',view:'book'});
  assert.equal(made.status,'active');assert.equal(made.discoverable,false);assert.equal((await repo.load({productId,shareId})).subjectId,subjectId);
  assert.equal((await repo.setDiscoverable({productId,subjectId,shareId,discoverable:true})).discoverable,true);assert.equal((await repo.setDiscoverable({productId,subjectId:'other',shareId,discoverable:false}))??null,null);
  assert.equal((await repo.list({productId,subjectId})).length,1);assert.equal((await repo.list({productId,subjectId:'other'})).length,0);
  const revoked=await repo.revoke({productId,subjectId,shareId});assert.equal(revoked.status,'revoked');assert.match(revoked.revokedAt,/^\d{4}-/);
  // 중복 ID는 insert가 무시되고 행이 없으면 undefined를 돌려준다.
  const duplicate=await repo.create({productId,subjectId,shareId,treeId:'tree-b',entryMomentId:'moment-b',view:'board'});
  assert.equal(duplicate??null,null);
 }finally{await pool.end();}
});

test('#1046: 저장 뒤 동기화가 취소한 자동 공유 행을 되살리지 않는다', {skip}, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
  try{
    await applySchema(pool);
    const repo=createShareRepo(pool),tag=suffix(),productId='lt-'+tag,subjectId='u-'+tag,treeId='tree-'+tag;
    const auto=await repo.upsertAutoShare({productId,subjectId,shareId:('a'+tag).padEnd(24,'x').slice(0,24),treeId,entryMomentId:'moment-a',momentCount:3});
    assert.equal(auto.status,'active');
    const revoked=await repo.revoke({productId,subjectId,shareId:auto.shareId});
    assert.equal(revoked.status,'revoked');
    // 저장 뒤 동기화가 같은 트리에 다시 upsert해도 revoked 상태를 유지한다.
    const again=await repo.upsertAutoShare({productId,subjectId,shareId:('b'+tag).padEnd(24,'x').slice(0,24),treeId,entryMomentId:'moment-b',momentCount:4});
    assert.ok(!again,'이미 있는 자동 행은 그대로 둔다');
    const loaded=await repo.load({productId,shareId:auto.shareId});
    assert.equal(loaded.status,'revoked','되살아나지 않는다');
    assert.ok(loaded.revokedAt,'주인이 내림 표식이 남는다');
    // 사용자가 공유 창에서 직접 켜면 새 주소로 열린다.
    const fresh=await repo.create({productId,subjectId,shareId:('c'+tag).padEnd(24,'x').slice(0,24),treeId,entryMomentId:'moment-a',view:'book'});
    assert.equal(fresh.status,'active');
    assert.equal((await repo.load({productId,shareId:fresh.shareId})).status,'active');
    assert.equal((await repo.load({productId,shareId:auto.shareId})).status,'revoked','옛 주소는 그대로 막힌다');
  }finally{await pool.end();}
});

test('#1549 공유 만들기·소개 스위치 미로그인 판정은 Postgres에서도 같다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const productId='lt-'+suffix();
  const service=createShareService({shareRepo:createShareRepo(pool),workspaceRepo:createWorkspaceRepo(pool),productId});
  const handle=createShareHandler({service,productId,authenticate:async()=>{throw new ApiError(401,'unauthenticated','로그인이 필요해요.');}});
  const call=(method,path)=>handle({method,path,headers:{}});
  const created=await call('POST','/api/shares');
  assert.equal(created.status,401);assert.equal(created.body.error.code,'unauthenticated');
  for(const method of ['PUT','DELETE']){
   const switched=await call(method,'/api/shares/'+'s'.repeat(24)+'/discovery');
   assert.equal(switched.status,401);assert.equal(switched.body.error.code,'unauthenticated');
  }
 }finally{await pool.end();}
});
