import test from 'node:test';import assert from 'node:assert/strict';
import {createMemberSession} from '../public/v41/member-session.mjs';
import {validateState} from '../public/v41/domain.mjs';
function setup(options={}){let server={version:1,trees:[]},revision=0;const writes=[],events=[];const api={get:async()=>({ok:true,revision,state:server,subject:'member-A',writeSubjectBound:true,...options.read}),put:async body=>{writes.push(body);if(options.put)return options.put(body,writes);server=structuredClone(body.state);return {ok:true,revision:++revision};},logout:async()=>({ok:true})};const session=createMemberSession({api,delay:()=>new Promise(()=>{}),makeClientKey:(()=>{let i=0;return()=>`key-${++i}`})(),onState:s=>events.push(s)});return {session,writes,events,api};}
const fields={subject:'별',title:'처음',note:'기억할 마음',date:'2026-10-31',emotion:'설렘',url:''};
test('old API is readable but cannot write without subject-binding capability',async()=>{const {session,writes}=setup({read:{writeSubjectBound:false}});await session.start();assert.equal(session.snapshot().owned,true);assert.throws(()=>session.apply('new',fields));assert.equal(writes.length,0);});
test('create/add/edit/connect/delete use canonical domain and bound server writes',async()=>{const {session,writes}=setup();await session.start();const first=session.apply('new',fields);const second=session.apply('add',{...fields,title:'다음'},first);session.apply('edit',{...fields,title:'수정됨'},second);session.apply('link',{targetId:first.momentId},second);let tree=session.state().trees[0];assert.equal(tree.moments[1].id,second.momentId);assert.equal(tree.moments[1].parentId,first.momentId);assert.ok(tree.moments[0].links.includes(second.momentId));session.apply('unlink',{targetId:first.momentId},second);session.apply('delete',{},second);validateState(session.state());await session.act('retry');assert.equal(writes.length,1);assert.equal(writes[0].expectedSubject,'member-A');assert.equal(writes[0].expectedRevision,0);assert.equal(writes[0].state.trees[0].moments.length,1);assert.equal(session.snapshot().dirty,false);});
test('quick compose creates a first note and a linked URL without forcing both title and note',async()=>{const {session}=setup();await session.start();const first=session.apply('new',{subject:'별',title:'',note:'한 줄 마음',date:'2026-11-01',emotion:'설렘',url:''});const second=session.apply('add',{title:'',note:'',date:'2026-11-01',emotion:'설렘',url:'https://example.com/photo.jpg'},first);const tree=session.state().trees[0];assert.equal(tree.moments[0].title,'한 줄 마음');assert.equal(tree.moments[1].title,'사진으로 남긴 순간');assert.equal(tree.moments[1].parentId,first.momentId);assert.equal(second.treeId,first.treeId);validateState(session.state());});
test('response loss keeps draft and retries exactly the same request key',async()=>{const {session,writes}=setup({put:(_b,ws)=>ws.length===1?{ok:false,status:0}:{ok:true,revision:1}});await session.start();session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().dirty,true);await session.act('retry');assert.equal(writes[0].clientKey,writes[1].clientKey);assert.deepEqual(writes[0],writes[1]);assert.equal(session.snapshot().dirty,false);});
test('conflict never silently overwrites and account change closes write ownership',async()=>{const {session,writes,api}=setup({put:()=>({ok:false,status:409,code:'revision_conflict',currentRevision:4})});await session.start();session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().phase,'conflict');assert.throws(()=>session.apply('new',fields));await session.act('retry');assert.equal(writes.length,1);await session.act('pull');assert.equal(session.state().trees.length,0);api.put=async()=>({ok:false,status:401,code:'account_changed'});session.apply('new',fields);await session.act('retry');assert.equal(session.snapshot().owned,false);assert.equal(session.snapshot().writable,false);assert.equal(session.state().trees.length,1);assert.throws(()=>session.apply('new',fields));});
test('disposed session cannot restore late account read',async()=>{let resolve;const {session,api,events}=setup();api.get=()=>new Promise(r=>resolve=r);const reading=session.start();session.dispose();resolve({ok:true,revision:0,state:{version:1,trees:[]},subject:'member-A',writeSubjectBound:true});await reading;assert.equal(events.length,0);assert.throws(()=>session.apply('new',fields));});

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
