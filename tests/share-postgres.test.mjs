import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool} from '../server/db/postgres.js';
import {createShareRepo} from '../server/db/shares-postgres.js';
import {assertIsolatedTestDatabase} from '../server/testing/isolated-test-database.js';
const DATABASE_URL=process.env.LOVETREE_TEST_DATABASE_URL??'';
const skip=DATABASE_URL?false:'격리된 PostgreSQL 테스트 DB가 없습니다(LOVETREE_TEST_DATABASE_URL 설정 필요). 이 파일의 검증은 미수행입니다.';
const suffix=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
test('share rows are owner-scoped, revocable, and schema application is repeatable',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);await applySchema(pool);const repo=createShareRepo(pool),tag=suffix(),productId='lt-'+tag,subjectId='u-'+tag,shareId=('s'+tag).padEnd(24,'x').slice(0,24);
  const made=await repo.create({productId,subjectId,shareId,treeId:'tree-a',entryMomentId:'moment-a',view:'book'});
  assert.equal(made.status,'active');assert.equal((await repo.load({productId,shareId})).subjectId,subjectId);
  assert.equal((await repo.list({productId,subjectId})).length,1);assert.equal((await repo.list({productId,subjectId:'other'})).length,0);
  const revoked=await repo.revoke({productId,subjectId,shareId});assert.equal(revoked.status,'revoked');assert.match(revoked.revokedAt,/^\d{4}-/);
  assert.equal(await repo.create({productId,subjectId,shareId,treeId:'tree-b',entryMomentId:'moment-b',view:'board'}),null);
 }finally{await pool.end();}
});
