import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool} from '../server/db/postgres.js';
import {createFeedbackRepo} from '../server/db/feedback-postgres.js';
import {createFeedbackOutboxRepo} from '../server/db/feedback-outbox-postgres.js';
import {ACCOUNT_USER_TABLES} from '../server/db/account-postgres.js';
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
  const persona=await repo.upsertPersona({productId,subjectId:'sub_'+tag,name:'시험 사용자',intro:{who:'팬'}});
  assert.equal(persona.name,'시험 사용자');
  assert.equal(persona.intro.who,'팬');
  const up=await repo.upsertPersona({productId,subjectId:'sub_'+tag,name:'시험 사용자2',intro:{who:'팬2'}});
  assert.equal(up.name,'시험 사용자2');
  const listed=await repo.list({productId});
  const op=listed.find(r=>r.id===opinion.id);
  assert.equal(op.authorName,'시험 사용자2');
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
test('#671 후속: DATE 칸은 DB의 YYYY-MM-DD를 그대로 내린다 — 현지 자정 Date도 하루 밀리지 않는다',async()=>{
 // node-postgres는 DATE를 현지 시각 자정 Date로 파싱한다. toISOString()으로 바꾸면 KST(+09:00)에서 하루가 밀렸다.
 const rows=[
  {id:1,subject_id:'sub_a',kind:'journal',category:'other',title:'일지',body:'내용',score:3,journal_date:new Date(2026,10,14),context:{},status:'received',memo:null,issue_number:null,author_name:'시험 사용자',author_role:'ai_customer',reply_count:1,created_at:'2026-11-14T01:00:00.000Z',updated_at:'2026-11-14T01:00:00.000Z'},
  {id:2,subject_id:null,kind:'opinion',category:'bug',title:null,body:'의견',score:null,journal_date:'2026-11-14',context:{},status:'received',memo:null,issue_number:null,author_name:null,author_role:null,reply_count:0,created_at:'2026-11-14T01:00:00.000Z',updated_at:null}];
 const repo=createFeedbackRepo({query:async()=>({rows})});
 const list=await repo.list({productId:'lt-date'});
 assert.equal(list[0].journalDate,'2026-11-14','Date(현지 자정)도 그날 날짜로');
 assert.equal(list[1].journalDate,'2026-11-14','문자열은 그대로');
});test('보관 최소화(2026-11-16): 6개월 넘은 비로그인 의견+답글과 90일 넘은 탈퇴 기록을 지운다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createFeedbackRepo(pool),tag=suffix(),productId='lt-'+tag;
  const old=new Date(Date.now()-(183+10)*24*60*60*1000).toISOString();
  const recent=new Date(Date.now()-60*24*60*60*1000).toISOString();
  // 비로그인 의견(오래됨) + 답글, 비로그인 의견(최근), 로그인 의견(오래됨)
  const guestOld=await repo.create({productId,subjectId:null,category:'other',body:'6개월 넘은 비로그인 의견'});
  const guestRecent=await repo.create({productId,subjectId:null,category:'other',body:'6개월 안 된 비로그인 의견',context:{}});
  const mine=await repo.create({productId,subjectId:'sub_keep_'+tag,category:'bug',body:'로그인 의견은 건드리지 않는다'});
  await pool.query('UPDATE lovetree_feedback SET created_at=$1, updated_at=$1 WHERE id=ANY($2)',[old,[guestOld.id,mine.id]]);
  await pool.query('UPDATE lovetree_feedback SET created_at=$1, updated_at=$1 WHERE id=$2',[recent,guestRecent.id]);
  await repo.addReply({productId,postId:guestOld.id,authorType:'customer',authorSubjectId:null,body:'그 의견에 달린 답글'});
  await repo.addReply({productId,postId:mine.id,authorType:'internal',authorSubjectId:null,body:'로그인 의견의 답글'});
  // 탈퇴 기록: 90일 넘은 것 1건, 90일 안 된 것 1건
  const hashOld='a'.repeat(64),hashKeep='b'.repeat(64);
  const oldDeletedAt=new Date(Date.now()-(90+5)*24*60*60*1000).toISOString();
  await pool.query('INSERT INTO lovetree_account_deletions (product_id,subject_hash,deleted_at) VALUES ($1,$2,$3),($1,$4,now())',[productId,hashOld,oldDeletedAt,hashKeep]);
  const purge=await import('../server/db/access-log-retention-postgres.js');
  const gf=await purge.deleteExpiredGuestFeedback(pool);
  const ad=await purge.deleteExpiredAccountDeletionRecords(pool);
  assert.equal(gf.deletedPosts,1,'6개월 넘은 비로그인 의견 1건만 지운다');
  assert.equal(gf.deletedReplies,1,'그 의견의 답글 1건만 지운다');
  assert.equal(ad.deleted,1,'90일 넘은 탈퇴 기록 1건만 지운다');
  const left=await pool.query('SELECT id,subject_id FROM lovetree_feedback WHERE product_id=$1 ORDER BY id',[productId]);
  // node-postgres는 bigint(id)를 문자열로 돌려준다 — repo가 만든 숫자 id와 비교하려면 숫자로 맞춘다(CI 1차 실패 원인).
  assert.deepEqual(left.rows.map(r=>Number(r.id)),[guestRecent.id,mine.id],'6개월 안 된 비로그인 의견과 로그인 의견은 남는다');
  const replies=await pool.query('SELECT body FROM lovetree_feedback_replies WHERE product_id=$1',[productId]);
  assert.deepEqual(replies.rows.map(r=>r.body),['로그인 의견의 답글'],'남는 의견의 답글도 남는다');
  const del=await pool.query('SELECT subject_hash FROM lovetree_account_deletions WHERE product_id=$1',[productId]);
  assert.deepEqual(del.rows.map(r=>r.subject_hash),[hashKeep],'90일 안 된 탈퇴 기록은 남는다');
 }finally{await pool.end();}
});
test('1190 outbox: 보낼 줄은 저장과 같은 트랜잭션에 넣고 같은 일 키는 한 줄만 둔다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createFeedbackRepo(pool),outbox=createFeedbackOutboxRepo(pool),tag=suffix(),productId='lt-'+tag;
  const saved=await repo.transaction(async client=>{
   const row=await repo.create({productId,subjectId:'sub_'+tag,category:'bug',body:'보낼 의견'},client);
   await outbox.enqueue({productId,feedbackId:row.id,eventKey:'new',kind:'new',payload:{event:'new',body:row.body,status:row.status}},client);
   return row;
  });
  assert.ok(saved.id>0);
  const first=await outbox.enqueue({productId,feedbackId:saved.id,eventKey:'new',kind:'new',payload:{event:'new',body:'중복'}});
  assert.equal(first,null,'같은 의견 id·일 키는 새 줄을 만들지 않는다');
  const rows=await outbox.list({productId});
  assert.equal(rows.length,1);
  assert.equal(rows[0].kind,'new');
  assert.equal(rows[0].payload.body,'보낼 의견','처음 넣은 값이 그대로 남는다');
  assert.equal(rows[0].status,'pending');
  assert.ok(ACCOUNT_USER_TABLES.some(item=>item.table==='lovetree_feedback_outbox'),'탈퇴 정리 목록에 보낼 줄 표가 있다');
 }finally{await pool.end();}
});
