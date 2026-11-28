import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';
import { createShareService, createShareHandler } from '../server/share-service.js';

const PRODUCT='share-list-test', SUBJECT='member-a', OTHER='member-b';
const shareId=i=>'share-'+String(i).padStart(20,'0');
async function fixture() {
  const repo=createMemoryShareRepo({now:Date.UTC(2026,10,28)});
  for(let i=0;i<55;i++){
    const made=await repo.create({productId:PRODUCT,subjectId:SUBJECT,shareId:shareId(i),treeId:'tree-a',entryMomentId:'moment-a',view:'book'});
    assert.ok(made);
  }
  await repo.create({productId:PRODUCT,subjectId:OTHER,shareId:shareId(999),treeId:'tree-b',entryMomentId:'moment-b',view:'book'});
  const service=createShareService({shareRepo:repo,workspaceRepo:{load:async()=>null},productId:PRODUCT});
  const handle=createShareHandler({productId:PRODUCT,service,authenticate:async request=>({productId:PRODUCT,subjectId:request.headers?.subject||SUBJECT})});
  const get=async(cursor,subject=SUBJECT)=>handle({method:'GET',path:'/api/shares',headers:{subject},query:new URLSearchParams(cursor?{cursor}:{}),body:''});
  const revoke=async id=>handle({method:'DELETE',path:'/api/shares/'+id,headers:{subject:SUBJECT},body:''});
  return {repo,get,revoke};
}

test('55개 공유 주소를 50개와 5개로 끊김 없이 모두 받고 오래된 주소를 회수한다',async()=>{
  const {repo,get,revoke}=await fixture();
  const first=await get();
  assert.equal(first.status,200);
  assert.equal(first.body.shares.length,50);
  assert.ok(first.body.nextCursor);
  const second=await get(first.body.nextCursor);
  assert.equal(second.status,200);
  assert.equal(second.body.shares.length,5);
  assert.equal(second.body.nextCursor,null);
  const all=[...first.body.shares,...second.body.shares];
  assert.equal(new Set(all.map(x=>x.id)).size,55);
  assert.deepEqual(all.map(x=>x.id),Array.from({length:55},(_,i)=>shareId(54-i)));
  const old=all.at(-1);
  assert.equal(old.id,shareId(0));
  assert.equal((await revoke(old.id)).status,200);
  assert.equal((await repo.load({productId:PRODUCT,shareId:old.id})).status,'revoked');
  const againFirst=await get();
  const againSecond=await get(againFirst.body.nextCursor);
  assert.equal([...againFirst.body.shares,...againSecond.body.shares].find(x=>x.id===old.id).status,'revoked');
});

test('잘못된 커서는 400이고 다른 계정의 공유는 보이지 않는다',async()=>{
  const {get}=await fixture();
  assert.equal((await get('invalid-cursor')).status,400);
  const other=await get(null,OTHER);
  assert.deepEqual(other.body.shares.map(item=>item.id),[shareId(999)]);
  assert.equal(other.body.nextCursor,null);
});

test('같은 시각에 만든 공유도 ID 순서로 안정적으로 이어진다',async()=>{
  const repo=createMemoryShareRepo({now:Date.UTC(2026,10,28)});
  for(let i=0;i<55;i++)await repo.create({productId:PRODUCT,subjectId:SUBJECT,shareId:shareId(i),treeId:'tree-a',entryMomentId:'moment-a',view:'book'});
  // DB에서 created_at 충돌이 가능하므로 동률 시 share_id 역순으로 결정한다.
  // 같은 순서인 페이지를 두 번 조회해도 조회마다 중복이나 유실이 없어야 한다.
  const first=await repo.listPage({productId:PRODUCT,subjectId:SUBJECT});
  const second=await repo.listPage({productId:PRODUCT,subjectId:SUBJECT,cursor:first.nextCursor});
  assert.equal(first.rows.length,50);
  assert.equal(second.rows.length,5);
  assert.equal(new Set([...first.rows,...second.rows].map(r=>r.shareId)).size,55);
});
