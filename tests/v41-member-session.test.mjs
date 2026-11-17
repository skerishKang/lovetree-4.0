import test from 'node:test';import assert from 'node:assert/strict';
import {createMemberSession} from '../public/v41/member-session.mjs';
import {validateState,createTree} from '../public/v41/domain.mjs';
function setup(options={}){let server={version:1,trees:[]},revision=0;const writes=[],events=[],gets=[];const api={get:async()=>{gets.push(1);return {ok:true,revision,state:server,subject:'member-A',writeSubjectBound:true,...options.read};},put:async body=>{writes.push(body);if(options.put)return options.put(body,writes);server=structuredClone(body.state);return {ok:true,revision:++revision};},logout:async()=>({ok:true})};const session=createMemberSession({api,delay:()=>new Promise(()=>{}),makeClientKey:(()=>{let i=0;return()=>`key-${++i}`})(),onState:s=>events.push(s)});return {session,writes,events,api,gets,changeServer:next=>{server=next;revision+=1;}};}
const fields={subject:'별',title:'처음',note:'기억할 마음',date:'2026-10-31',emotion:'설렘',url:''};
test('old API is readable but cannot write without subject-binding capability',async()=>{const {session,writes}=setup({read:{writeSubjectBound:false}});await session.start();assert.equal(session.snapshot().owned,true);assert.throws(()=>session.apply('new',fields));assert.equal(writes.length,0);});
test('create/add/edit/connect/delete use canonical domain and bound server writes',async()=>{const {session,writes}=setup();await session.start();const first=session.apply('new',fields);const second=session.apply('add',{...fields,title:'다음'},first);session.apply('edit',{...fields,title:'수정됨'},second);session.apply('link',{targetId:first.momentId},second);let tree=session.state().trees[0];assert.equal(tree.moments[1].id,second.momentId);assert.equal(tree.moments[1].parentId,first.momentId);assert.ok(tree.moments[0].links.includes(second.momentId));session.apply('unlink',{targetId:first.momentId},second);session.apply('delete',{},second);validateState(session.state());await session.act('retry');assert.equal(writes.length,1);assert.equal(writes[0].expectedSubject,'member-A');assert.equal(writes[0].expectedRevision,0);assert.equal(writes[0].state.trees[0].moments.length,1);assert.equal(session.snapshot().dirty,false);});
test('quick compose creates a first note and a linked URL without forcing both title and note',async()=>{const {session}=setup();await session.start();const first=session.apply('new',{subject:'별',title:'',note:'한 줄 마음',date:'2026-11-01',emotion:'설렘',url:''});const second=session.apply('add',{title:'',note:'',date:'2026-11-01',emotion:'설렘',url:'https://example.com/photo.jpg'},first);const tree=session.state().trees[0];assert.equal(tree.moments[0].title,'한 줄 마음');assert.equal(tree.moments[1].title,'사진으로 남긴 순간');assert.equal(tree.moments[1].parentId,first.momentId);assert.equal(second.treeId,first.treeId);validateState(session.state());});
test('response loss keeps draft and retries exactly the same request key',async()=>{const {session,writes}=setup({put:(_b,ws)=>ws.length===1?{ok:false,status:0}:{ok:true,revision:1}});await session.start();session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().dirty,true);await session.act('retry');assert.equal(writes[0].clientKey,writes[1].clientKey);assert.deepEqual(writes[0],writes[1]);assert.equal(session.snapshot().dirty,false);});
test('conflict never silently overwrites and account change closes write ownership',async()=>{const {session,writes,api}=setup({put:()=>({ok:false,status:409,code:'revision_conflict',currentRevision:4})});await session.start();session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().phase,'conflict');assert.throws(()=>session.apply('new',fields));await session.act('retry');assert.equal(writes.length,1);await session.act('pull');assert.equal(session.state().trees.length,0);api.put=async()=>({ok:false,status:401,code:'account_changed'});session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().owned,false);assert.equal(session.snapshot().writable,false);assert.equal(session.state().trees.length,1);assert.throws(()=>session.apply('new',fields));});
test('disposed session cannot restore late account read',async()=>{let resolve;const {session,api,events}=setup();api.get=()=>new Promise(r=>resolve=r);const reading=session.start();session.dispose();resolve({ok:true,revision:0,state:{version:1,trees:[]},subject:'member-A',writeSubjectBound:true});await reading;assert.equal(events.length,0);assert.throws(()=>session.apply('new',fields));});

// 로그아웃은 서버 요청 뒤 화면 상태를 다시 알려야 한다 — 알림이 빠지면 셸이 로그인 상태로 남아
// 계정 동그라미가 그대로 보인다(sync-controller act('logout') 누락 재발 방지).
test('로그아웃 성공 뒤 로그인 상태 알림이 와서 계정 동그라미가 사라진다',async()=>{
  const statuses=[];const server={version:1,trees:[]};let revision=0;
  const api={get:async()=>({ok:true,revision,state:server,subject:'member-A',writeSubjectBound:true}),put:async()=>({ok:true,revision:++revision}),logout:async()=>({ok:true})};
  const session=createMemberSession({api,delay:()=>new Promise(()=>{}),onStatus:s=>statuses.push(s),navigate:()=>{}});
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
