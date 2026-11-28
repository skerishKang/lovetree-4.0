import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberSession} from '../public/v41/member-session.mjs';
import {EMPTY_STATE} from '../public/v41/domain.mjs';

function memStorage() {
  const map = new Map();
  return {
    getItem:key => map.get(key) ?? null,
    setItem:(key,value) => map.set(key,String(value)),
    removeItem:key => map.delete(key),
    key:index => [...map.keys()][index] ?? null,
    get length() { return map.size; }
  };
}
const fields=title=>({subject:'기록',title,note:'메모',date:'2026-11-28',emotion:'설렘',url:''});
const pendingKey='lovetree.v41.pending-write:member-A';

test('#1652 시드 165594: 새 세션 보관본은 이전 세션의 늦은 응답에 유지된다 (8단계)', async()=>{
  const storage=memStorage(), pending=[];
  const makeSession=tag=>createMemberSession({
    api:{
      get:async()=>({ok:true,revision:0,state:EMPTY_STATE(),subject:'member-A',writeSubjectBound:true}),
      put:body=>new Promise(resolve=>pending.push({tag,body,resolve})),
      logout:async()=>({ok:true})
    },
    draftStorage:storage,cacheStorage:null,delay:()=>new Promise(()=>{}),
    makeClientKey:()=>tag+'-request-key'
  });
  // 1–3. 이전 세션이 작성하고, 서버 응답을 기다린다.
  const old=makeSession('old'); await old.start();
  old.apply('new',fields('이전 내용'));
  const oldSave=old.act('retry');
  assert.equal(pending.length,1);
  // 4–6. 새로운 세션이 더 최근의 보관본을 먼저 기록한다.
  const fresh=makeSession('fresh'); await fresh.start();
  fresh.apply('new',fields('최신 내용'));
  fresh.flushOnHide();
  assert.equal(pending.length,2);
  // 7–8. 이전 응답이 늦게 도착해도 최신 보관본은 그대로다.
  pending[0].resolve({ok:false,status:401,code:'unauthenticated'});
  await oldSave;
  const draft=JSON.parse(storage.getItem(pendingKey));
  assert.equal(draft.state.trees[0].moments[0].title,'최신 내용');
  old.dispose();fresh.dispose();
});

test('#1652 시드 166961: 성공한 본문으로 되돌리면 추가 개정·요청 키가 없다 (9단계)', async()=>{
  let saved=EMPTY_STATE(),revision=0;const writes=[];
  const session=createMemberSession({
    api:{
      get:async()=>({ok:true,revision,state:structuredClone(saved),subject:'member-A',writeSubjectBound:true}),
      put:async body=>{writes.push(structuredClone(body));saved=structuredClone(body.state);return {ok:true,revision:++revision};},
      logout:async()=>({ok:true})
    },
    cacheStorage:null,draftStorage:memStorage(),delay:()=>new Promise(()=>{}),
    makeClientKey:(()=>{let n=0;return()=>`save-key-${++n}`;})()
  });
  // 1–3. 첫 본문을 저장한다.
  await session.start();
  session.apply('new',fields('원래 내용'));
  await session.act('retry');
  // 4–6. 설정을 변경했다가 마지막 저장 본문으로 되돌린다.
  const accepted=JSON.stringify(session.state());
  const original=session.state().prefs.titleDisplay;
  session.apply('setPrefs',{titleDisplay:original==='mine'?'both':'mine'});
  assert.notEqual(JSON.stringify(session.state()),accepted,'서버 승인 본문과 실제로 달라져야 한다');
  session.apply('setPrefs',{titleDisplay:original});
  assert.equal(JSON.stringify(session.state()),accepted);
  // 7–9. 재저장을 요청해도 네트워크 PUT와 새로운 개정은 생기지 않는다.
  await session.act('retry');
  assert.equal(writes.length,1,'같은 본문을 다른 키로 재저장하지 않는다');
  assert.equal(revision,1);
  assert.equal(session.status().phase,'synced');
  session.dispose();
});

test('#1652/#1663: 429 대기 중 닫힌 세션의 재시도는 새 세션의 보관본을 덮지 않는다', async()=>{
  const draftStorage=memStorage(), oldWrites=[], newWrites=[], canceled=[];
  let lateRetry;
  const get=async()=>({ok:true,revision:0,state:EMPTY_STATE(),subject:'member-A',writeSubjectBound:true});
  const old=createMemberSession({
    api:{get,put:async body=>{oldWrites.push(body);return {ok:false,status:429,code:'rate_limited',retryAfterSeconds:7};},
      logout:async()=>({ok:true})},
    draftStorage,cacheStorage:null,delay:()=>new Promise(()=>{}),
    schedule:fn=>{lateRetry=fn;return 17;},
    cancelSchedule:handle=>canceled.push(handle),
    makeClientKey:()=> 'old-429-key'
  });
  await old.start();
  old.apply('new',fields('옛 기록'));
  await old.act('retry');
  assert.equal(old.status().phase,'throttled');
  assert.ok(draftStorage.getItem(pendingKey),'429 즉시 보관');
  old.dispose();
  assert.deepEqual(canceled,[17],'닫힌 세션의 예약 재시도 취소');

  const fresh=createMemberSession({
    api:{get,put:body=>{newWrites.push(body);return new Promise(()=>{});},logout:async()=>({ok:true})},
    draftStorage,cacheStorage:null,delay:()=>new Promise(()=>{}),
    makeClientKey:()=> 'fresh-429-key'
  });
  await fresh.start();
  assert.equal(fresh.state().trees[0].moments[0].title,'옛 기록');
  const tree=fresh.state().trees[0];
  fresh.apply('edit',fields('새 세션 기록'),{treeId:tree.id,momentId:tree.moments[0].id});
  fresh.flushOnHide();
  const latest=draftStorage.getItem(pendingKey);
  assert.equal(JSON.parse(latest).state.trees[0].moments[0].title,'새 세션 기록');
  assert.equal(JSON.parse(latest).reason,'hide');
  lateRetry();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(draftStorage.getItem(pendingKey),latest,'과거 429 예약 응답이 최신 보관본을 변경하지 않는다');
  assert.equal(oldWrites.length,1,'종료한 세션에서 추가 PUT 금지');
  assert.equal(newWrites.length,1,'새 세션의 복구 요청만 전송');
  fresh.dispose();
});

test('#1652/#1663: 429 대기 중 마지막 승인 본문으로 되돌리면 예약·보관본·중복 PUT가 없다',async()=>{
  let revision=0,server=EMPTY_STATE(),key=0;
  const writes=[],scheduled=[],canceled=[],draftStorage=memStorage();
  const session=createMemberSession({
    api:{
      get:async()=>({ok:true,revision,state:structuredClone(server),subject:'member-A',writeSubjectBound:true}),
      put:async body=>{
        writes.push(body);
        if(writes.length===1){server=structuredClone(body.state);return {ok:true,revision:++revision};}
        return {ok:false,status:429,code:'rate_limited',retryAfterSeconds:7};
      },
      logout:async()=>({ok:true})
    },
    draftStorage,cacheStorage:null,delay:()=>new Promise(()=>{}),
    makeClientKey:()=>`429-key-${++key}`,
    schedule:(fn,ms)=>{scheduled.push({fn,ms});return 9;},
    cancelSchedule:handle=>canceled.push(handle)
  });
  await session.start();
  session.apply('new',fields('서버 승인 기록'));
  await session.act('retry');
  const saved=JSON.stringify(session.state());
  const initial=session.state().prefs.titleDisplay;
  session.apply('setPrefs',{titleDisplay:initial==='mine'?'both':'mine'});
  assert.notEqual(JSON.stringify(session.state()),saved,'429 전송 본문이 마지막 승인 본문과 실제로 달라야 한다');
  await session.act('retry');
  assert.equal(session.status().phase,'throttled');
  assert.equal(writes.length,2);
  assert.equal(scheduled[0].ms,7000);
  assert.ok(draftStorage.getItem(pendingKey),'429 동안 복구할 편집 보관');
  session.apply('setPrefs',{titleDisplay:initial});
  assert.equal(JSON.stringify(session.state()),saved);
  assert.equal(session.status().phase,'synced');
  assert.equal(session.snapshot().dirty,false);
  assert.equal(draftStorage.getItem(pendingKey),null,'서버 승인 본문으로 복귀했으므로 보관본 정리');
  assert.deepEqual(canceled,[9],'429 예약 취소');
  scheduled[0].fn();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,2,'취소된 429 예약이 재전송하지 않는다');
  assert.equal(revision,1,'서버 개정 증가 없음');
  session.dispose();
});

test('#1652/#1663: 세션 종료 뒤 도착한 429도 새 세션 보관본을 건드리지 않는다',async()=>{
  const draftStorage=memStorage(), oldRequests=[], freshRequests=[], scheduled=[];
  const get=async()=>({ok:true,revision:0,state:EMPTY_STATE(),subject:'member-A',writeSubjectBound:true});
  const old=createMemberSession({
    api:{get,put:body=>new Promise(resolve=>oldRequests.push({body,resolve})),logout:async()=>({ok:true})},
    draftStorage,cacheStorage:null,delay:()=>new Promise(()=>{}),
    schedule:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},
    makeClientKey:()=> 'late-429-old'
  });
  await old.start();
  old.apply('new',fields('요청 중이던 기록'));
  const sending=old.act('retry');
  assert.equal(oldRequests.length,1);
  old.flushOnHide();
  old.dispose();

  const fresh=createMemberSession({
    api:{get,put:body=>new Promise(resolve=>freshRequests.push({body,resolve})),logout:async()=>({ok:true})},
    draftStorage,cacheStorage:null,delay:()=>new Promise(()=>{}),
    makeClientKey:()=> 'late-429-new'
  });
  await fresh.start();
  const tree=fresh.state().trees[0];
  fresh.apply('edit',fields('새로고침 후 최신 기록'),{treeId:tree.id,momentId:tree.moments[0].id});
  fresh.flushOnHide();
  const latest=draftStorage.getItem(pendingKey);
  assert.equal(JSON.parse(latest).state.trees[0].moments[0].title,'새로고침 후 최신 기록');
  oldRequests[0].resolve({ok:false,status:429,code:'rate_limited',retryAfterSeconds:7});
  await sending;
  assert.equal(draftStorage.getItem(pendingKey),latest,'종료된 요청의 429가 새 세션 보관본을 수정하지 않는다');
  assert.equal(scheduled.length,0,'종료된 세션은 429 재시도 예약 금지');
  assert.equal(oldRequests.length,1,'종료된 세션 PUT 추가 발행 금지');
  assert.equal(freshRequests.length,1,'현재 세션의 PUT만 유지');
  fresh.dispose();
});
