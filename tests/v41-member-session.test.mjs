import test from 'node:test';import assert from 'node:assert/strict';
import {createMemberSession} from '../public/v41/member-session.mjs';
import {validateState,createTree} from '../public/v41/domain.mjs';
// 저장소 고정(환경 가정 제거): Node 26은 전역 sessionStorage를 노출하지만 CI의 Node 22는 노출하지 않는다.
// 고정하지 않으면 앞 시험이 401로 남긴 초안이 전역 저장소를 통해 뒤 시험으로 새어 들어간다
// (같은 subject·revision에서 복원 → 'rejected'·dirty). 저장소 없이 도는 CI 환경과 같게 명시적으로 고정한다.
function setup(options={}){let server={version:1,trees:[]},revision=0;const writes=[],events=[],gets=[];const api={get:async()=>{gets.push(1);return {ok:true,revision,state:server,subject:'member-A',writeSubjectBound:true,...options.read};},put:async body=>{writes.push(body);if(options.put)return options.put(body,writes);server=structuredClone(body.state);return {ok:true,revision:++revision};},logout:async()=>({ok:true})};const session=createMemberSession({api,delay:()=>new Promise(()=>{}),schedule:options.schedule,cancelSchedule:options.cancelSchedule,makeClientKey:(()=>{let i=0;return()=>`key-${++i}`})(),onState:s=>events.push(s),onStatus:options.onStatus||(()=>{}),draftStorage:options.draftStorage||null,cacheStorage:null});return {session,writes,events,api,gets,changeServer:next=>{server=next;revision+=1;}};}
function memStorage(){const map=new Map();return {getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>{map.set(key,String(value))},removeItem:key=>{map.delete(key)},key:index=>[...map.keys()][index]??null,get length(){return map.size}};}
const fields={subject:'별',title:'처음',note:'기억할 마음',date:'2026-10-31',emotion:'설렘',url:''};
test('old API is readable but cannot write without subject-binding capability',async()=>{const {session,writes}=setup({read:{writeSubjectBound:false}});await session.start();assert.equal(session.snapshot().owned,true);assert.throws(()=>session.apply('new',fields));assert.equal(writes.length,0);});
test('create/add/edit/connect/delete use canonical domain and bound server writes',async()=>{const {session,writes}=setup();await session.start();const first=session.apply('new',fields);const second=session.apply('add',{...fields,title:'다음'},first);session.apply('edit',{...fields,title:'수정됨'},second);session.apply('link',{targetId:first.momentId},second);let tree=session.state().trees[0];assert.equal(tree.moments[1].id,second.momentId);assert.equal(tree.moments[1].parentId,first.momentId);assert.ok(tree.moments[0].links.includes(second.momentId));session.apply('unlink',{targetId:first.momentId},second);session.apply('delete',{},second);validateState(session.state());await session.act('retry');assert.equal(writes.length,1);assert.equal(writes[0].expectedSubject,'member-A');assert.equal(writes[0].expectedRevision,0);assert.equal(writes[0].state.trees[0].moments.length,1);assert.equal(session.snapshot().dirty,false);});
test('quick compose creates a first note and a linked URL without forcing both title and note',async()=>{const {session}=setup();await session.start();const first=session.apply('new',{subject:'별',title:'',note:'한 줄 마음',date:'2026-11-01',emotion:'설렘',url:''});const second=session.apply('add',{title:'',note:'',date:'2026-11-01',emotion:'설렘',url:'https://example.com/photo.jpg'},first);const tree=session.state().trees[0];assert.equal(tree.moments[0].title,'한 줄 마음');assert.equal(tree.moments[1].title,'사진으로 남긴 순간');assert.equal(tree.moments[1].parentId,first.momentId);assert.equal(second.treeId,first.treeId);validateState(session.state());});
test('response loss keeps draft and retries exactly the same request key',async()=>{const {session,writes}=setup({put:(_b,ws)=>ws.length===1?{ok:false,status:0}:{ok:true,revision:1}});await session.start();session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().dirty,true);await session.act('retry');assert.equal(writes[0].clientKey,writes[1].clientKey);assert.deepEqual(writes[0],writes[1]);assert.equal(session.snapshot().dirty,false);});
test('4.1 저장 429은 보관본을 유지하고 Retry-After·2→4→8초 뒤 다시 시도한다',async()=>{
 const limited={ok:false,status:429,code:'rate_limited',retryAfterSeconds:7};
 const timers=[],draftStorage=memStorage();
 const {session,writes}=setup({draftStorage,schedule:(fn,ms)=>{timers.push({fn,ms});return timers.length;},cancelSchedule:()=>{},put:(_body,seen)=>seen.length<=5?limited:{ok:true,revision:1}});
 await session.start();session.apply('new',fields);await session.act('retry');
 assert.equal(session.status().phase,'throttled');assert.equal(session.snapshot().dirty,true);
 assert.equal(session.flushOnHide(),false);assert.equal(writes.length,1);assert.equal(draftStorage.length,1);
 assert.deepEqual(timers.map(timer=>timer.ms),[7000]);
 for(const expected of [2000,4000,8000]){
  timers.shift().fn();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(session.status().phase,'throttled');assert.deepEqual(timers.map(timer=>timer.ms),[expected]);
 }
 timers.shift().fn();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(session.status().phase,'throttled');assert.deepEqual(session.status().actions.map(action=>action.name),['retry','backup']);
 await session.act('retry');assert.equal(session.status().phase,'synced');assert.equal(draftStorage.length,0);
 assert.equal(new Set(writes.map(body=>body.clientKey)).size,1);
});

test('conflict never silently overwrites and account change closes write ownership',async()=>{const {session,writes,api}=setup({put:()=>({ok:false,status:409,code:'revision_conflict',currentRevision:4})});await session.start();session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().phase,'conflict');assert.throws(()=>session.apply('new',fields));await session.act('retry');assert.equal(writes.length,1);await session.act('pull');assert.equal(session.state().trees.length,0);api.put=async()=>({ok:false,status:401,code:'account_changed'});session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().owned,false);assert.equal(session.snapshot().writable,false);assert.equal(session.state().trees.length,1);assert.throws(()=>session.apply('new',fields));});
test('disposed session cannot restore late account read',async()=>{let resolve;const {session,api,events}=setup();api.get=()=>new Promise(r=>resolve=r);const reading=session.start();session.dispose();resolve({ok:true,revision:0,state:{version:1,trees:[]},subject:'member-A',writeSubjectBound:true});await reading;assert.equal(events.length,0);assert.throws(()=>session.apply('new',fields));});

// 로그아웃은 서버 요청 뒤 화면 상태를 다시 알려야 한다 — 알림이 빠지면 셸이 로그인 상태로 남아
// 계정 동그라미가 그대로 보인다(sync-controller act('logout') 누락 재발 방지).
test('로그아웃 성공 뒤 로그인 상태 알림이 와서 계정 동그라미가 사라진다',async()=>{
  const statuses=[];const server={version:1,trees:[]};let revision=0;
  const api={get:async()=>({ok:true,revision,state:server,subject:'member-A',writeSubjectBound:true}),put:async()=>({ok:true,revision:++revision}),logout:async()=>({ok:true})};
  const session=createMemberSession({api,delay:()=>new Promise(()=>{}),onStatus:s=>statuses.push(s),navigate:()=>{},draftStorage:null,cacheStorage:null});
  await session.start();
  assert.equal(session.snapshot().owned,true);
  assert.equal(statuses.at(-1).phase,'synced');
  const before=statuses.length;
  const out=await session.act('logout');
  assert.equal(out.phase,'login','act 반환값도 로그인 상태다');
  assert.ok(statuses.length>before,'로그아웃 뒤 상태 알림이 온다');
  const last=statuses.at(-1);
  assert.equal(last.phase,'login');
  assert.equal(last.writable,false,'쓰기 연결도 끊긴 것으로 알린다');
  assert.ok(last.actions.some(a=>a.name==='login'),'로그인 다시 안내가 붙는다');
  assert.equal(session.snapshot().owned,false,'셸이 계정 동그라미 대신 로그인 알약을 고른다');
  assert.equal(session.state().trees.length,0);
  session.dispose();
});

// 이슈 644 3번: 다른 탭이 기록을 바뀌었을 때 이 화면의 대응 — 고친 게 없으면 조용히 최신 기록을 불러오고(띠 없음),
// 고친 게 있으면 아무것도 하지 않는다(충돌 판정은 저장 때 그대로). check는 확인할 뿐 덮어쓰지 않는다.
test('check: 고친 게 없으면 조용히 최신 기록을 불러온다(띠 없음)',async()=>{const {session,changeServer,gets}=setup();await session.start();
  const other={version:1,trees:[createTree({subject:'별',title:'다른 탭이 만든 트리',note:'기록',emotion:'설렘',date:'2026-11-15',url:''},'2026-11-15T00:00:00.000Z')],prefs:session.state().prefs};
  changeServer(other);
  const status=await session.act('check');
  assert.equal(gets.length,2,'확인은 읽기 한 번으로 끝난다');
  assert.equal(status.phase,'synced');
  assert.equal(status.detail,null,'띠 문구가 없다');
  assert.equal(session.state().trees[0].moments[0].title,'다른 탭이 만든 트리','최신 기록으로 조용히 바뀐다');
  assert.equal(session.snapshot().dirty,false);
});
test('check: 고친 게 있으면 아무것도 하지 않는다',async()=>{const {session,changeServer,gets}=setup();await session.start();
  session.apply('new',fields);
  const before=session.state();
  changeServer({version:1,trees:[],prefs:before.prefs});
  await session.act('check');
  assert.equal(gets.length,1,'확인조차 하지 않는다');
  assert.deepEqual(session.state(),before,'고친 내용이 지켜진다');
});
test('충돌 띠는 고친 개수를 쉬운 말로 알리고, 저장에 성공하면 개수를 다시 센다',async()=>{let call=0;const {session}=setup({put:()=>{call+=1;return call===1?{ok:true,revision:1}:{ok:false,status:409,code:'revision_conflict',currentRevision:5};}});await session.start();
  const first=session.apply('new',fields);await session.act('retry');
  const second=session.apply('add',{...fields,title:'두 번째'},first);
  session.apply('add',{...fields,title:'세 번째'},second);
  const status=await session.act('retry');
  assert.equal(status.phase,'conflict');
  assert.equal(status.changes,2,'마지막 저장 뒤 고친 2개');
  assert.match(status.detail,/다른 곳에서 기록이 바뀌었어요\. 이 화면에서 고친 2개는 따로 보관해 둘게요\./);
  assert.ok(status.actions.some(a=>a.name==='pull'&&a.label==='최신 기록 불러오기'),'주 단추는 최신 기록 불러오기 하나');
  assert.ok(status.actions.some(a=>a.name==='force'&&a.label==='이 화면 것으로 덮어쓰기'),'덮어쓰기는 자세히 안으로');
});

test('tree details and selected cover save, reload, and keep moment identity',async()=>{
  const {session,writes}=setup();await session.start();
  const root=session.apply('new',{...fields,title:'root'});
  const cover=session.apply('add',{...fields,title:'cover',url:'https://example.test/cover.jpg'},root);
  const before=structuredClone(session.state().trees[0]);
  const selection=session.apply('editTree',{title:'새 책 이름',subject:'새 대상',coverMomentId:cover.momentId},root);
  assert.deepEqual(selection,root);
  let tree=session.state().trees[0];
  assert.equal(tree.title,'새 책 이름');assert.equal(tree.subject,'새 대상');assert.equal(tree.coverMomentId,cover.momentId);
  assert.deepEqual(tree.moments.map(moment=>moment.id),before.moments.map(moment=>moment.id));
  assert.equal(tree.moments[1].parentId,root.momentId);
  validateState(session.state());
  await session.act('retry');assert.equal(writes.length,1);
  const restored=setup({read:{state:writes[0].state,revision:1}}).session;await restored.start();
  tree=restored.state().trees[0];assert.equal(tree.title,'새 책 이름');assert.equal(tree.subject,'새 대상');assert.equal(tree.coverMomentId,cover.momentId);
  assert.equal(tree.moments[1].parentId,root.momentId);validateState(restored.state());
});

test('reparent preserves selection, descendants, links, retry, and reload',async()=>{
  const {session,writes}=setup();await session.start();
  const root=session.apply('new',{...fields,title:'root'});
  const a=session.apply('add',{...fields,title:'A'},root);
  const b=session.apply('add',{...fields,title:'B'},a);
  const c=session.apply('add',{...fields,title:'C'},root);
  session.apply('link',{targetId:c.momentId},a);
  const selection=session.apply('reparent',{targetId:c.momentId,relation:'C에서 다시 이어져서'},a);
  assert.deepEqual(selection,a);
  let tree=session.state().trees[0];
  assert.equal(tree.moments.find(moment=>moment.id===a.momentId).parentId,c.momentId);
  assert.equal(tree.moments.find(moment=>moment.id===b.momentId).parentId,a.momentId);
  assert.ok(tree.moments.find(moment=>moment.id===a.momentId).links.includes(c.momentId));
  assert.throws(()=>session.apply('reparent',{targetId:b.momentId},a),/다음 순간/);
  assert.throws(()=>session.apply('reparent',{targetId:c.momentId},root),/시작 순간/);
  validateState(session.state());
  await session.act('retry');
  assert.equal(writes.length,1);
  const restored=setup({read:{state:writes[0].state,revision:1}}).session;
  await restored.start();
  tree=restored.state().trees[0];
  assert.equal(tree.moments.find(moment=>moment.id===a.momentId).parentId,c.momentId);
  assert.equal(tree.moments.find(moment=>moment.id===b.momentId).parentId,a.momentId);
  validateState(restored.state());
});

// 창 닫힘 유실(운영센터 의견 #35): 담은 직후 꼬리표 칩을 확정하면 저장은 900ms 대기에 들어가고,
// 그 안에 창이 닫히면(탭 닫기·앱 전환·휴대폰 화면 꺼짐) 칩은 '확정'으로 보였지만 요청은 나가지 않았다.
// 페이지가 숨거나 닫히는 순간 flushOnHide()가 keepalive로 즉시 보낸다 — 재현은 순간 담기(boardSync와 같은
// 저장 대기)로 하고, 숨김 신호 대신 셸이 부르는 것과 같은 flushOnHide()를 직접 누른다.
test('담은 직후 꼬리표 확정 뒤 창이 닫혀도(숨겨져도) 아직 못 보낸 저장을 즉시 보낸다',async()=>{
  const {session,writes}=setup();
  await session.start();
  const made=session.apply('quickAdd',{url:'https://www.youtube.com/watch?v=gdZLi9oWNZg'});
  assert.equal(writes.length,0,'900ms 저장 대기 중에는 요청이 나가지 않는다(창 닫힘 전 상태)');
  const sent=session.flushOnHide();
  assert.equal(sent,true,'숨김 때 못 보낸 저장을 즉시 보낸다');
  await session.act('noop').catch(()=>{});
  assert.equal(writes.length,1,'keepalive 저장 1회');
  assert.equal(writes[0].state.trees.find(t=>t.id===made.treeId).moments.find(m=>m.id===made.momentId).keywords,undefined,'담은 순간 자체가 서버에 도달한다');
});
test('보낼 것이 없으면 숨김 때 요청을 보내지 않는다',async()=>{
  const {session,writes}=setup();
  await session.start();
  assert.equal(session.flushOnHide(),false);
  assert.equal(writes.length,0);
});
test('숨김 저장은 keepalive로 보낸다 — api.put에 keepalive 표시가 함께 간다',async()=>{
  const seen=[];
  const server={version:1,trees:[]};let revision=0;
  const api={get:async()=>({ok:true,revision,state:server,subject:'member-A',writeSubjectBound:true}),
    put:async(body,options)=>{seen.push(options||null);server=structuredClone(body.state);return {ok:true,revision:++revision};},
    logout:async()=>({ok:true})};
  const session=createMemberSession({api,delay:()=>new Promise(()=>{}),makeClientKey:()=>'key-1',draftStorage:null,cacheStorage:null});
  await session.start();
  session.apply('quickAdd',{url:'https://www.youtube.com/watch?v=gdZLi9oWNZg'});
  session.flushOnHide();
  assert.equal(seen.length,1);
  assert.equal(seen[0]?.keepalive,true,'창이 닫혀도 요청이 끝까지 나가는 keepalive다');
});
test('keepalive 한도(64KB)를 넘는 큰 기록은 숨김 저장을 건너뛴다 — 기존 900ms 저장이 맡는다',async()=>{
  const {session,writes}=setup();
  await session.start();
  const first=session.apply('new',fields);
  for(let i=0;i<130;i++)session.apply('add',{...fields,title:'',note:'가'.repeat(500)},first);
  assert.equal(session.flushOnHide(),false,'한도를 넘으면 보내지 않는다');
  assert.equal(writes.length,0);
});

// #1045: 80KB 문서는 keepalive로 못 보낸다. 숨김 때 기기에 동기로 적어 두고 다음 접속이 개정을 견줘 이어 보낸다.
function bigChange(session){
  const tree=session.apply('new',fields);
  for(let i=0;i<160;i++)session.apply('add',{...fields,title:'',note:'가'.repeat(500)},tree);
  return tree;
}
test('#1045 큰 기록은 숨김 때 기기에 적고 다음 접속에서 서버로 이어 보낸다',async()=>{
  const draftStorage=memStorage();
  const {session:first,writes:firstWrites}=setup({draftStorage});
  await first.start();
  bigChange(first);
  assert.equal(firstWrites.length,0,'900ms 대기 중에는 요청이 없다');
  assert.equal(first.flushOnHide(),false,'큰 기록은 keepalive로 보내지 않는다');
  assert.equal(draftStorage.length,1,'대신 기기 보관함에 한 건 적는다');
  const saved=JSON.parse(draftStorage.getItem(draftStorage.key(0)));
  assert.equal(saved.reason,'hide');
  assert.equal(saved.expectedRevision,0);

  const {session:next,writes}=setup({draftStorage});
  await next.start();
  await next.act('noop').catch(()=>{});
  assert.equal(writes.length,1,'다음 접속에서 미전송분을 이어 보낸다');
  assert.equal(writes[0].expectedRevision,0);
  assert.ok(writes[0].state.trees[0].moments.some(moment=>moment.note==='가'.repeat(500)),'마지막 변경이 서버에 도달한다');
  assert.equal(next.snapshot().dirty,false);
  assert.equal(draftStorage.length,0,'보내고 나면 임시 보관을 지운다');
});
test('#1045 서버 개정이 앞선 기기 보관분은 기존 충돌 안내를 보여 준다',async()=>{
  const draftStorage=memStorage();
  const {session:first,changeServer}=setup({draftStorage});
  await first.start();
  bigChange(first);
  first.flushOnHide();
  const advanced=structuredClone(first.state());
  changeServer(advanced);
  changeServer(advanced);

  const {session:next,writes}=setup({draftStorage,read:{revision:2,state:advanced}});
  const status=await next.start();
  assert.equal(status.phase,'conflict','자동으로 덮어쓰지 않는다');
  assert.ok(status.detail.includes('고친'),'기존 충돌 띠 문구를 쓴다');
  assert.ok(status.actions.some(action=>action.name==='pull'),'최신 기록 불러오기 선택지가 있다');
  assert.equal(writes.length,0,'충돌 상태에서는 요청을 보내지 않는다');
});

// A-07(#1056): 형식(400)·크기(413) 거부는 서버 문구와 백업만 — 같은 본 재전송인 재시도는 붙지 않는다.
test('400·413 거부는 서버 문구와 백업 단추만, 연결 끊김은 재시도를 유지한다',async()=>{
  const cases=[
    {status:400,code:'invalid_document',message:'기록 형식을 확인해 주세요.',want:'rejected'},
    {status:413,code:'payload_too_large',message:'보내는 기록이 너무 커요. 일부만 나눠서 저장해 주세요.',want:'rejected'},
    {status:0,code:'network',message:null,want:'offline'}
  ];
  for(const c of cases){
    const {session}=setup({put:()=>({ok:false,status:c.status,code:c.code,message:c.message})});
    await session.start();
    session.apply('new',fields);
    const status=await session.act('retry');
    assert.equal(status.phase,c.want,`${c.status}: 단계`);
    if(c.status===0) assert.equal(status.detail,'서버에 저장되지 않았어요. 이 화면을 닫기 전에 다시 시도해 주세요.');
    else assert.equal(status.detail,c.message,`${c.status}: 서버 문구 그대로`);
    const names=status.actions.map(a=>a.name);
    if(c.status===0) assert.deepEqual(names,['retry'],'연결 끊김은 재시도');
    else assert.deepEqual(names,['backup'],`${c.status}: 재시도 없이 백업만`);
    session.dispose();
  }
});


// #1643: 저장 실패·숨김과 비동기 응답의 교차에서도 마지막 편집이 남아야 한다.
const draft1643 = storage => JSON.parse(storage.getItem('lovetree.v41.pending-write:member-A') || 'null');
const titles1643 = state => state.trees[0]?.moments.map(moment => moment.title) || [];
const restore1643 = async storage => {
  const {session} = setup({draftStorage:storage,put:()=>new Promise(()=>{})});
  await session.start();
  return session;
};

test('#1643 ① 지연 PUT 뒤 둘째 편집과 401: 최신 두 순간과 새 요청 키가 보관·복원된다', async () => {
  const draftStorage=memStorage();
  let reply;
  const {session,writes}=setup({draftStorage,put:()=>new Promise(resolve => {reply=resolve;})});
  await session.start();
  const first=session.apply('new',fields);
  const saving=session.act('retry');
  assert.equal(writes.length,1,'첫 편집의 PUT가 시작됨');
  session.apply('add',{...fields,title:'둘째'},first);
  reply({ok:false,status:401,code:'unauthenticated'});
  await saving;
  const draft=draft1643(draftStorage);
  assert.ok(draft,'401 후 계정별 보관본');
  assert.deepEqual(titles1643(draft.state),['처음','둘째']);
  assert.notEqual(draft.clientKey,writes[0].clientKey,'전송 당시 본문과 달라 새 요청 키');
  const restored=await restore1643(draftStorage);
  assert.deepEqual(titles1643(restored.state()),['처음','둘째'],'다시 로그인 후 복원');
  restored.dispose();
  session.dispose();
});

test('#1643 ② 작은 keepalive 실패: 숨김 직후 보관하고 새로고침 뒤 복원한다', async () => {
  const draftStorage=memStorage();
  const {session,writes}=setup({draftStorage,put:()=>({ok:false,status:0})});
  await session.start();
  session.apply('new',fields);
  assert.equal(session.flushOnHide(),true,'작은 본문은 keepalive 시도');
  assert.deepEqual(titles1643(draft1643(draftStorage)?.state||{trees:[]}),['처음'],'네트워크 응답 전에 동기 보관');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1);
  assert.deepEqual(titles1643(draft1643(draftStorage)?.state||{trees:[]}),['처음'],'실패 후에도 보관 유지');
  const restored=await restore1643(draftStorage);
  assert.deepEqual(titles1643(restored.state()),['처음'],'새로고침 후 복원');
  restored.dispose();
  session.dispose();
});

test('#1643 ③ 한글 64KiB 초과·60000자 미만: keepalive 없이 계정별 보관·복원한다', async () => {
  const draftStorage=memStorage();
  const {session,writes}=setup({draftStorage});
  await session.start();
  const first=session.apply('new',fields);
  for (let i=0;i<50;i++) session.apply('add',{...fields,title:'한글 '+i,note:'가'.repeat(500)},first);
  const serial=JSON.stringify(session.state());
  assert.ok(serial.length<60000,'문자 수는 예전 keepalive 한도 이내');
  assert.ok(new TextEncoder().encode(serial).byteLength>65536,'UTF-8은 keepalive의 64KiB를 초과');
  assert.equal(session.flushOnHide(),false,'바이트가 크면 keepalive를 보내지 않음');
  assert.equal(writes.length,0,'거부될 keepalive PUT 0회');
  const draft=draft1643(draftStorage);
  assert.ok(draft,'전체 보관본');
  assert.equal(draft.state.trees[0].moments.length,51);
  const restored=await restore1643(draftStorage);
  assert.equal(restored.state().trees[0].moments.length,51,'새로고침 뒤 모든 순간 복원');
  restored.dispose();
  session.dispose();
});

test('#1643 ④ 지연 PUT·둘째 편집·숨김 뒤 앞 PUT 401: 숨김 보관본 세대가 지켜진다', async () => {
  const draftStorage=memStorage();
  let reply;
  const {session,writes}=setup({draftStorage,put:()=>new Promise(resolve=>{reply=resolve;})});
  await session.start();
  const first=session.apply('new',fields);
  const saving=session.act('retry');
  assert.equal(writes.length,1);
  session.apply('add',{...fields,title:'둘째'},first);
  assert.equal(session.flushOnHide(),false,'기존 PUT 진행 중에는 다시 보내지 않음');
  const before=draft1643(draftStorage);
  assert.deepEqual(titles1643(before.state),['처음','둘째'],'숨김 시 최신 상태 보관');
  reply({ok:false,status:401,code:'unauthenticated'});
  await saving;
  assert.deepEqual(titles1643(draft1643(draftStorage).state),['처음','둘째'],'늦은 401이 숨김 보관본을 덮지 않음');
  const restored=await restore1643(draftStorage);
  assert.deepEqual(titles1643(restored.state()),['처음','둘째'],'새로고침 뒤 복원');
  restored.dispose();
  session.dispose();
});


test('#1643 보강: 앞 PUT 성공만으로 최신 숨김 보관본을 지우지 않고 서버 개정에 맞춘다', async () => {
  const draftStorage=memStorage(), replies=[];
  const {session,writes}=setup({draftStorage,put:()=>new Promise(resolve=>replies.push(resolve))});
  await session.start();
  const first=session.apply('new',fields);
  const saving=session.act('retry');
  session.apply('add',{...fields,title:'둘째'},first);
  assert.equal(session.flushOnHide(),false);
  assert.equal(draft1643(draftStorage).expectedRevision,0);
  replies[0]({ok:true,revision:1});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,2,'첫 요청만 성공한 뒤 최신 본문 재전송');
  assert.deepEqual(titles1643(draft1643(draftStorage).state),['처음','둘째']);
  assert.equal(draft1643(draftStorage).expectedRevision,1,'숨김 보관본을 서버 최신 개정에 맞춰 보존');
  assert.equal(writes[1].clientKey,draft1643(draftStorage).clientKey);
  replies[1]({ok:false,status:0});
  await saving;
  assert.deepEqual(titles1643(draft1643(draftStorage).state),['처음','둘째'],'뒷 요청 실패 뒤에도 보관본 유지');
  session.dispose();
});

test('#1643 보강: 기기 보관 실패와 keepalive 네트워크 실패를 사용자에게 알린다', async () => {
  const quotaStorage={
    getItem:()=>null,
    setItem:()=>{throw new Error('QuotaExceededError');},
    removeItem:()=>{}
  };
  const {session}=setup({draftStorage:quotaStorage,put:()=>({ok:false,status:0})});
  await session.start();
  session.apply('new',fields);
  assert.equal(session.flushOnHide(),true,'보관 실패 시에도 가능한 keepalive 전송 시도');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(session.status().phase,'offline');
  assert.match(session.status().detail,/보관|백업/,'네트워크·기기 보관 모두 실패했음을 숨기지 않는다');
  session.dispose();
});


test('#1646 검토 1: 401 보관 복원 후 둘째 수정 저장 성공이면 옛 초안이 지워지고 다음 접속도 정상', async () => {
  const draftStorage = memStorage();
  const {session:expired} = setup({
    draftStorage,put:()=>({ok:false,status:401,code:'unauthenticated'})
  });
  await expired.start();
  const first=expired.apply('new',fields);
  expired.apply('add',{...fields,title:'둘째'},first);
  await expired.act('retry');
  assert.deepEqual(titles1643(draft1643(draftStorage).state),['처음','둘째']);
  expired.dispose();

  const {session:relogged,writes} = setup({draftStorage});
  await relogged.start();
  assert.equal(relogged.status().phase,'rejected','같은 계정의 미전송 초안 복원');
  assert.deepEqual(titles1643(relogged.state()),['처음','둘째']);
  const tree=relogged.state().trees[0];
  relogged.apply('edit',{...fields,title:'둘째 수정'},
    {treeId:tree.id,momentId:tree.moments[1].id});
  await relogged.act('retry');
  assert.equal(relogged.status().phase,'synced','편집을 서버에 저장함');
  assert.deepEqual(titles1643(writes[0].state),['처음','둘째 수정']);
  assert.equal(draftStorage.length,0,'서버가 수락한 세대보다 오래된 401 보관본 제거');
  const {session:next} = setup({draftStorage,read:{revision:1,state:writes[0].state}});
  await next.start();
  assert.equal(next.status().phase,'synced','다음 접속에서 거짓 충돌 없음');
  assert.deepEqual(titles1643(next.state()),['처음','둘째 수정']);
  next.dispose();
  relogged.dispose();
});

test('#1646 검토 2: visibilitychange/pagehide 중복 숨김은 같은 보관 실패를 한 번만 알린다', async () => {
  const statuses=[];
  const storage={
    getItem:()=>null,
    setItem:()=>{throw Error('quota exceeded')},
    removeItem:()=>{}
  };
  const {session,writes}=setup({
    draftStorage:storage,onStatus:status=>statuses.push(status),
    put:()=>new Promise(()=>{})
  });
  await session.start();
  const first=session.apply('new',fields);
  assert.equal(session.flushOnHide(),true,'첫 숨김에서 keepalive 전송');
  session.flushOnHide();
  const warnings=()=>statuses.filter(s=>s.detail?.includes('기기에 기록을 보관하지 못했어요'));
  assert.equal(warnings().length,1,'같은 편집에 대한 보관 실패 안내는 한 번');
  session.apply('add',{...fields,title:'다음 편집'},first);
  session.flushOnHide();
  assert.equal(warnings().length,2,'이후 새 편집이 실패하면 별도로 한 번 안내');
  assert.equal(writes.length,1,'진행 중인 PUT를 중복 전송하지 않음');
  session.dispose();
});

test('#1646 검토 3: dispose 뒤 공개 flushOnHide는 계정별 보관·PUT를 일으키지 않는다', async () => {
  const draftStorage=memStorage();
  const {session,writes}=setup({draftStorage});
  await session.start();
  session.apply('new',fields);
  assert.equal(session.snapshot().dirty,true,'저장 대기 중');
  session.dispose();
  assert.equal(session.flushOnHide(),false,'닫힌 세션에서 숨김 처리 차단');
  assert.equal(draftStorage.length,0,'닫힌 세션은 보관본을 새로 쓰지 않음');
  assert.equal(writes.length,0,'닫힌 세션은 keepalive PUT를 하지 않음');
});


test('#1652 2번 시드 164661: 종료된 저장 대기는 새 세션의 저장 완료 후 보관본을 변경하지 않는다', async () => {
  const draftStorage=memStorage();
  let server={version:1,trees:[]}, revision=0;
  const keys=()=>Array.from({length:draftStorage.length},(_,i)=>draftStorage.key(i));
  const sessionWith=(put)=>createMemberSession({
    api:{
      get:async()=>({ok:true,revision,state:structuredClone(server),subject:'member-A',writeSubjectBound:true}),
      put:async(body)=>put(body),
      logout:async()=>({ok:true})
    },
    draftStorage,cacheStorage:null,
    makeClientKey:(()=>{let i=0;return()=>('seed164661-key-'+(++i))})()
  });

  // 1. 이전 세션에서 새 순간을 적고 900ms 저장 대기를 남긴다.
  const old=sessionWith(async()=>({ok:false,status:0}));
  await old.start();
  old.apply('new',{...fields,title:'지난 세션 순간'});
  // 2. 같은 계정으로 다시 접속하며 기존 화면을 닫는다.
  old.dispose();
  const intermediate=sessionWith(async()=>({ok:false,status:0}));
  await intermediate.start();
  // 3. 새 편집의 전송이 네트워크 문제로 실패해 계정별 보관본이 생긴다.
  intermediate.apply('new',{...fields,title:'현재 보존할 순간'});
  await intermediate.act('retry');
  assert.equal(intermediate.status().phase,'offline');
  intermediate.flushOnHide();
  assert.equal(draftStorage.length,1,'네트워크 실패 뒤 숨김 보관본 생성');
  // 4. 같은 계정의 새 세션에서 미전송 기록을 복원한다.
  intermediate.dispose();
  const current=sessionWith(async body=>{
    server=structuredClone(body.state);
    return {ok:true,revision:++revision};
  });
  await current.start();
  // 5. 숨김 보관본은 같은 개정에서 자동으로 다시 저장된다.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(current.status().phase,'synced');
  assert.equal(draftStorage.length,0);
  const saved=structuredClone(server);
  // 6. 이전 두 세션의 기존 900ms 대기가 끝나도 기록을 새로 만들면 안 된다.
  await new Promise(resolve=>setTimeout(resolve,1100));
  assert.deepEqual(keys(),[],'종료된 세션의 저장 대기가 보관본을 되살리지 않아야 한다');
  assert.equal(revision,1,'새로운 서버 저장은 한 번만 일어나야 한다');
  const again=sessionWith(async()=>({ok:false,status:0}));
  await again.start();
  assert.equal(again.status().phase,'synced','다음 접속에 거짓 충돌이 없어야 한다');
  assert.deepEqual(again.state(),saved);
  again.dispose();
  current.dispose();
});

test('#1652 2번: 종료 후 도착한 저장 응답은 보관본과 상태를 변경하지 않는다',async()=>{
  const draftStorage=memStorage();
  let release;
  const pending=new Promise(resolve=>{release=resolve});
  const {session,writes}=setup({draftStorage,put:()=>pending});
  await session.start();
  session.apply('new',fields);
  const saving=session.act('retry');
  assert.equal(writes.length,1,'진행 중인 저장');
  session.dispose();
  release({ok:false,status:401,code:'unauthenticated'});
  await saving;
  assert.equal(draftStorage.length,0,'닫힌 세션의 늦은 응답은 보관본을 새로 만들지 않는다');
});
