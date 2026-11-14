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
test('일지 본문 DB 한도: journal 8000까지(#596), opinion 2001은 CHECK로 거른다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:2});
 try{
  await applySchema(pool);const repo=createFeedbackRepo(pool),tag=suffix(),productId='lt-'+tag;
  const journal=await repo.create({productId,subjectId:'sub_'+tag,kind:'journal',category:'other',title:'긴 일지',body:'가'.repeat(8000),score:4,journalDate:'2026-11-14'});
  assert.equal(journal.body.length,8000);
  await assert.rejects(()=>repo.create({productId,subjectId:'sub_'+tag,kind:'journal',category:'other',body:'가'.repeat(8001),journalDate:'2026-11-14'}),/check|violates/i);
  await assert.rejects(()=>repo.create({productId,subjectId:'sub_'+tag,kind:'opinion',category:'bug',body:'가'.repeat(2001)}),/check|violates/i);
  // 관리자 일지 탭 읽기 경로와 같은 질의 — 일지만 날짜 내림차순
  const journals=await repo.listJournals({productId});
  assert.equal(journals.length,1);
  assert.equal(journals[0].journalDate,'2026-11-14');
  assert.equal(journals[0].body.length,8000);
 }finally{await pool.end();}
});
test('board: opinion/journal, reply counts, replies, persona, today journal',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createFeedbackRepo(pool),tag=suffix(),productId='lt-'+tag;
  const opinion=await repo.create({productId,subjectId:'sub_'+tag,kind:'opinion',category:'bug',title:'버그',body:'넘김 멈춤',context:{screen:'책'}});
  assert.equal(opinion.kind,'opinion');
  const journal=await repo.create({productId,subjectId:'sub_'+tag,kind:'journal',category:'other',title:'오늘',body:'기록',score:4,journalDate:(new Date(Date.now()+9*3600e3)).toISOString().slice(0,10)});
  assert.equal(journal.score,4);
  assert.ok(journal.journalDate);
  // 종류 거르기 + 답글 수
  const onlyJournal=await repo.list({productId,kind:'journal'});
  assert.deepEqual(onlyJournal.map(r=>r.id),[journal.id]);
  const onlyOpinion=await repo.list({productId,kind:'opinion'});
  assert.equal(onlyOpinion[0].replyCount,0);
  // 답글
  await repo.addReply({productId,postId:opinion.id,authorType:'customer',authorSubjectId:'sub_admin',body:'고쳤어요'});
  await repo.addReply({productId,postId:opinion.id,authorType:'internal',authorSubjectId:'sub_admin',body:'내부 메모'});
  const replies=await repo.listReplies({productId,postId:opinion.id});
  assert.equal(replies.length,2);
  const withCount=await repo.get({productId,id:opinion.id});
  assert.equal(withCount.replyCount,2);
  // 오늘 일지
  const today=await repo.todayJournal({productId,subjectId:'sub_'+tag});
  assert.equal(today.id,journal.id);
  // 페르소나
  assert.equal(await repo.getPersona({productId,subjectId:'sub_'+tag}),null);
  const persona=await repo.upsertPersona({productId,subjectId:'sub_'+tag,name:'윤제',intro:{who:'팬'}});
  assert.equal(persona.name,'윤제');
  assert.equal(persona.intro.who,'팬');
  const up=await repo.upsertPersona({productId,subjectId:'sub_'+tag,name:'윤제2',intro:{who:'팬2'}});
  assert.equal(up.name,'윤제2');
  const listed=await repo.list({productId});
  const op=listed.find(r=>r.id===opinion.id);
  assert.equal(op.authorName,'윤제2');
  // journal 은 고객 답변 불가(서비스 규칙) — 여기서는 CHECK(author_type)만 확인
  await assert.rejects(repo.addReply({productId,postId:journal.id,authorType:'nope',body:'x'}),/check|violates/i);
 }finally{await pool.end();}
});
test('feedback table exists after schema and accepts an empty context object',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:2});
 try{
  await applySchema(pool);
  const {rows}=await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='lovetree_feedback' ORDER BY ordinal_position`);
  const cols=rows.map(row=>row.column_name);
  for(const name of ['id','product_id','subject_id','kind','category','title','body','score','journal_date','context','status','memo','issue_number','created_at','updated_at'])assert.ok(cols.includes(name),'missing column '+name);
  const repo=createFeedbackRepo(pool),tag=suffix();
  const row=await repo.create({productId:'lt-'+tag,category:'other',body:'기본 컨텍스트'});
  assert.deepEqual(row.context,{});
 }finally{await pool.end();}
});