import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { applySchema, createPool } from '../server/db/postgres.js';
import { assertIsolatedTestDatabase } from '../server/testing/isolated-test-database.js';
import { createShareRepo } from '../server/db/shares-postgres.js';
import { createShareVisitsRepo } from '../server/db/share-visits-postgres.js';
import { createShareVisitsService, VISIT_WINDOW_MS } from '../server/share-visits-service.js';
import { createTreeVisibilityRepo } from '../server/db/tree-visibility-postgres.js';

const url = process.env.LOVETREE_TEST_DATABASE_URL || '';
test('방문 저장소 실제 DB 동시 집계·만료·공개 경계·칼럼', {skip: !url}, async()=>{
  assertIsolatedTestDatabase(url);
  const pool = await createPool(url,{max:4});
  const productId='visit-test-'+randomBytes(8).toString('hex');
  const shareId=randomBytes(18).toString('base64url'), subjectId='owner', treeId='tree';
  const scope={productId,shareId};
  try {
    await applySchema(pool);
    const shareRepo=createShareRepo(pool), repo=createShareVisitsRepo(pool), visibilityRepo=createTreeVisibilityRepo(pool);
    const communityRepo={isHiddenShare:async()=>false};
    await shareRepo.create({...scope,subjectId,treeId,entryMomentId:'moment',view:'book'});
    let at=Date.parse('2026-11-27T23:55:00Z');
    const service=createShareVisitsService({repo,shareRepo,visibilityRepo,communityRepo,productId,secret:randomBytes(32).toString('hex'),now:()=>at});
    const visitor={trusted:true,authKnown:true,clientIp:'192.0.2.1'};
    assert.deepEqual(await Promise.all(Array.from({length:8},()=>service.record(shareId,visitor))),Array(8).fill(1));
    assert.equal(await service.record(shareId,{...visitor,subjectId}),1);
    at+=10*60*1000;
    assert.equal(await service.record(shareId,visitor),1);
    const rows=await pool.query('SELECT visitor_hash,expires_at FROM lovetree_share_visit_dedup WHERE product_id=$1',[productId]);
    assert.equal(rows.rowCount,1); assert.match(rows.rows[0].visitor_hash,/^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(rows.rows).includes(visitor.clientIp),false);
    at+=VISIT_WINDOW_MS;
    await service.prune();
    assert.equal((await pool.query('SELECT 1 FROM lovetree_share_visit_dedup WHERE product_id=$1',[productId])).rowCount,0);
    assert.equal(await service.count(shareId),1);
    assert.equal(await service.record(shareId,visitor),2);
    await visibilityRepo.set({productId,subjectId,treeId,visibility:'private'});
    assert.equal(await service.record(shareId,visitor),0);
    await visibilityRepo.set({productId,subjectId,treeId,visibility:'public'});
    await pool.query('INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,$3)',[productId,shareId,subjectId]);
    assert.equal(await service.record(shareId,{...visitor,clientIp:'192.0.2.2'}),0);
    await pool.query('DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1',[productId]);
    await shareRepo.revoke({...scope,subjectId});
    assert.equal(await service.record(shareId,visitor),0);
    assert.equal(await repo.count(scope),2);
    const cols=await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('lovetree_share_visits','lovetree_share_visit_dedup') ORDER BY ordinal_position");
    for(const [table,expected] of [['lovetree_share_visits',['product_id','share_id','visits']],['lovetree_share_visit_dedup',['product_id','share_id','visitor_hash','expires_at']]]) {
      assert.deepEqual(cols.rows.filter(r=>r.table_name===table).map(r=>r.column_name),expected);
    }
  } finally {
    await pool.query('DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1',[productId]);
    await pool.query('DELETE FROM lovetree_tree_visibility WHERE product_id=$1',[productId]);
    await pool.query('DELETE FROM lovetree_shares WHERE product_id=$1',[productId]);
    await pool.end();
  }
});
