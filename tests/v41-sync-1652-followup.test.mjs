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
  session.apply('setPrefs',{titleDisplay:original==='title'?'both':'title'});
  session.apply('setPrefs',{titleDisplay:original});
  assert.equal(JSON.stringify(session.state()),accepted);
  // 7–9. 재저장을 요청해도 네트워크 PUT와 새로운 개정은 생기지 않는다.
  await session.act('retry');
  assert.equal(writes.length,1,'같은 본문을 다른 키로 재저장하지 않는다');
  assert.equal(revision,1);
  assert.equal(session.status().phase,'synced');
  session.dispose();
});
