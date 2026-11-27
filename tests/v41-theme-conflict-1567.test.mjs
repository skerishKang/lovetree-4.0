import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberSession } from '../public/v41/member-session.mjs';

const fields = {subject:'기록',title:'새 기록',note:'내용',date:'2026-11-28',emotion:'설렘',url:''};
function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key,value) => data.set(key,String(value)),
    removeItem: key => data.delete(key)
  };
}
function store(initial={version:1,trees:[],prefs:{}}) {
  let state=structuredClone(initial), revision=0, key=0, beforePut=null;
  const requests=[];
  return {
    api() {
      return {
        get:async()=>({ok:true,revision,state:structuredClone(state),subject:'member-A',
          themeMissing:!Object.hasOwn(state.prefs||{},'theme'),writeSubjectBound:true}),
        put:async body=>{
          requests.push(structuredClone(body));
          if(beforePut) await beforePut(body);
          if(body.expectedRevision!==revision) return {ok:false,status:409,code:'revision_conflict',currentRevision:revision};
          state=structuredClone(body.state);
          return {ok:true,revision:++revision};
        },
        logout:async()=>({ok:true})
      };
    },
    member(localTheme,storage=memoryStorage()) {
      if(localTheme) storage.setItem('lt41.theme',localTheme);
      const statuses=[];
      const session=createMemberSession({api:this.api(),onStatus:s=>statuses.push(s),
        draftStorage:null,cacheStorage:null,themeStorage:storage,delay:()=>new Promise(()=>{}),
        makeClientKey:()=>`key-${++key}`});
      return {session,statuses,storage};
    },
    read:()=>({revision,state:structuredClone(state),requests}),
    bump:()=>{revision+=1;},
    onPut:callback=>{beforePut=callback;}
  };
}
function assertNoRecordConflict(member) {
  assert.equal(member.session.snapshot().phase,'synced');
  assert.equal(member.session.snapshot().dirty,false);
  assert.ok(member.statuses.every(s=>s.phase!=='conflict'),'테마 때문에 사용자 기록 충돌 안내가 뜨지 않는다');
  assert.ok(member.statuses.every(s=>!s.actions?.some(a=>a.name==='force')),'전체 덮어쓰기 안내가 없다');
}

test('#1567 첫 테마 올리기 A(정원) 성공, B(밤) 충돌 뒤 새로고침해도 계정 테마가 남는다',async()=>{
  const database=store(),a=database.member('garden'),b=database.member('night');
  await a.session.start();await b.session.start();
  assert.equal(a.session.snapshot().dirty,true);
  assert.equal(b.session.snapshot().dirty,true);
  await a.session.act('retry');
  assert.equal(database.read().state.prefs.theme,'garden');
  await b.session.act('retry');
  assertNoRecordConflict(b);
  assert.equal(b.session.state().prefs.theme,'garden');
  assert.equal(b.storage.getItem('lt41.theme'),'garden','기기 미러도 계정 테마를 따른다');
  const reloaded=database.member(null,b.storage);
  await reloaded.session.start();
  assertNoRecordConflict(reloaded);
  assert.equal(reloaded.session.state().prefs.theme,'garden');
  assert.equal(database.read().state.prefs.theme,'garden');
});

test('#1567 저장 중 다른 기기의 기록이 바뀌어도 테마만 다시 저장해 기록을 지킨다',async()=>{
  const database=store({version:1,trees:[],prefs:{theme:'garden'}}),
    a=database.member(null),b=database.member(null);
  await a.session.start();await b.session.start();
  a.session.apply('new',fields);
  await a.session.act('retry');
  b.session.apply('setPrefs',{theme:'night'});
  await b.session.act('retry');
  assertNoRecordConflict(b);
  assert.equal(database.read().state.prefs.theme,'night');
  assert.equal(database.read().state.trees.length,1,'A의 기록을 덮어쓰지 않는다');
});

test('#1567 서버 테마만 먼저 바뀌면 로컬 기록과 테마 변경을 안전하게 재시도한다',async()=>{
  const database=store({version:1,trees:[],prefs:{theme:'garden'}}),
    a=database.member(null),b=database.member(null);
  await a.session.start();await b.session.start();
  b.session.apply('new',fields);
  b.session.apply('setPrefs',{theme:'night'});
  a.session.apply('setPrefs',{theme:'night'});
  await a.session.act('retry');
  await b.session.act('retry');
  assertNoRecordConflict(b);
  assert.equal(database.read().state.prefs.theme,'night');
  assert.equal(database.read().state.trees.length,1);
});

test('#1567 기기 B는 기록만 바꿨고 A는 테마만 바꿨다면 A 테마를 지켜 기록을 보낸다',async()=>{
  const database=store({version:1,trees:[],prefs:{theme:'garden'}}),
    a=database.member(null),b=database.member(null);
  await a.session.start();await b.session.start();
  b.session.apply('new',fields);
  a.session.apply('setPrefs',{theme:'night'});
  await a.session.act('retry');
  await b.session.act('retry');
  assertNoRecordConflict(b);
  assert.equal(database.read().state.prefs.theme,'night');
  assert.equal(database.read().state.trees.length,1);
  assert.equal(b.storage.getItem('lt41.theme'),'night');
});

test('#1567 첫 테마 올리기와 기록 추가가 겹쳐도 계정 테마만 채택하고 기록은 저장한다',async()=>{
  const database=store(),a=database.member('garden'),b=database.member('night');
  await a.session.start();await b.session.start();
  b.session.apply('new',fields);
  await a.session.act('retry');
  await b.session.act('retry');
  assertNoRecordConflict(b);
  assert.equal(database.read().state.prefs.theme,'garden');
  assert.equal(database.read().state.trees.length,1);
});

test('#1567 테마와 실제 기록 충돌이 겹치면 기존 기록 충돌 방침은 지킨다',async()=>{
  const database=store({version:1,trees:[],prefs:{theme:'garden'}}),
    a=database.member(null),b=database.member(null);
  await a.session.start();await b.session.start();
  a.session.apply('new',{...fields,title:'A 기록'});await a.session.act('retry');
  b.session.apply('new',{...fields,title:'B 기록'});
  b.session.apply('setPrefs',{theme:'night'});
  const result=await b.session.act('retry');
  assert.equal(result.phase,'conflict','실제 기록 충돌은 자동 전체 덮어쓰기 금지');
  assert.equal(database.read().state.trees[0].moments[0].title,'A 기록');
  assert.equal(database.read().state.prefs.theme,'garden');
});

test('#1567 다른 기기가 연속 갱신해 테마 재시도도 충돌하면 전체 덮어쓰기를 내놓지 않는다',async()=>{
  const database=store({version:1,trees:[],prefs:{theme:'garden'}}),b=database.member(null);
  await b.session.start();
  const a=database.member(null);await a.session.start();
  a.session.apply('new',fields);await a.session.act('retry');
  b.session.apply('setPrefs',{theme:'night'});
  let bumped=false;
  database.onPut(body=>{
    if (!bumped && body.expectedRevision===1 && body.state.prefs.theme==='night') {
      bumped=true;database.bump();
    }
  });
  const failed=await b.session.act('retry');
  assert.equal(bumped,true,'첫 충돌 뒤 테마 다시 쓰는 중 서버가 한 번 더 바뀐다');
  assert.equal(failed.phase,'rejected');
  assert.ok(failed.actions.some(a=>a.name==='retry'));
  assert.ok(failed.actions.every(a=>a.name!=='force'&&a.name!=='pull'));
  database.onPut(null);
  await b.session.act('retry');
  assertNoRecordConflict(b);
  assert.equal(database.read().state.prefs.theme,'night');
  assert.equal(database.read().state.trees.length,1);
});
