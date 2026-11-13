import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool} from '../server/db/postgres.js';
import {createFeedbackRepo} from '../server/db/feedback-postgres.js';
import {assertIsolatedTestDatabase} from '../server/testing/isolated-test-database.js';
const DATABASE_URL=process.env.LOVETREE_TEST_DATABASE_URL??'',skip=DATABASE_URL?false:'isolated PostgreSQL unavailable';
const suffix=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
test('feedback rows save, mask-friendly body, filter, and update by status/memo/issue',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createFeedbackRepo(pool),tag=suffix(),productId='lt-'+tag;
  // 로그아웃(subject_id 비움) 의견 저장
  const anon=await repo.create({productId,subjectId:null,category:'inconvenient',body:'로그아웃 의견',context:{screen:'첫 화면',loggedIn:false}});
  assert.equal(anon.subjectId,null);
  assert.equal(anon.status,'received');
  assert.equal(anon.context.loggedIn,false);
  assert.ok(anon.id>0);
  // 로그인 의견 저장
  const mine=await repo.create({productId,subjectId:'sub_'+tag,category:'bug',body:'로그인 의견',context:{screen:'책',version:'4.1'}});
  assert.equal(mine.subjectId,'sub_'+tag);
  // 최신 순 목록
  const all=await repo.list({productId});
  assert.deepEqual(all.map(row=>row.body),['로그인 의견','로그아웃 의견']);
  // 종류 거르기
  const bugs=await repo.list({productId,category:'bug'});
  assert.deepEqual(bugs.map(row=>row.body),['로그인 의견']);
  // 상태·메모·이슈 업데이트
  const updated=await repo.update({productId,id:mine.id,status:'reviewing',memo:'확인 중',issueNumber:'#541'});
  assert.equal(updated.status,'reviewing');
  assert.equal(updated.memo,'확인 중');
  assert.equal(updated.issueNumber,'#541');
  const byStatus=await repo.list({productId,status:'reviewing'});
  assert.deepEqual(byStatus.map(row=>row.id),[mine.id]);
  // 없는 id는 null
  assert.equal(await repo.update({productId,id:99999999,status:'fixed'}),null);
  assert.equal(await repo.get({productId,id:99999999}),null);
  // body 2001자는 CHECK 위반
  await assert.rejects(repo.create({productId,category:'other',body:'x'.repeat(2001)}),/check|violates|length/i);
  // 허용 외 category 거부
  await assert.rejects(repo.create({productId,category:'nope',body:'x'}),/check|violates|invalid input/i);
 }finally{await pool.end();}
});
test('feedback table exists after schema and accepts an empty context object',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:2});
 try{
  await applySchema(pool);
  const {rows}=await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='lovetree_feedback' ORDER BY ordinal_position`);
  const cols=rows.map(row=>row.column_name);
  for(const name of ['id','product_id','subject_id','category','body','context','status','memo','issue_number','created_at','updated_at'])assert.ok(cols.includes(name),'missing column '+name);
  const repo=createFeedbackRepo(pool),tag=suffix();
  const row=await repo.create({productId:'lt-'+tag,category:'other',body:'기본 컨텍스트'});
  assert.deepEqual(row.context,{});
 }finally{await pool.end();}
});