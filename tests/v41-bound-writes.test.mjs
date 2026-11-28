import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiHandler} from '../server/http.js';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createTree} from '../src/domain.js';
const productId='lovetree-test';
function setup(subjectId='usr_a',repo=createMemoryWorkspaceRepo()){
 const service=createWorkspaceService({repo,productId});
 return createApiHandler({authenticate:async()=>({productId,subjectId}),service,productId});
}
const get=(handle,query)=>handle({path:'/api/workspace',method:'GET',query:new URLSearchParams(query)});
const put=(handle,payload)=>handle({path:'/api/workspace',method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
const state=()=>({version:1,trees:[createTree({subject:'검수',title:'내 순간',note:'계정 경계 검수',emotion:'설렘',date:'2026-10-31',url:''})],prefs:{ theme: 'night', titleDisplay:'both', displayName: '', accentColor: '', dateStyle:'dot', startPlace:'resume', shareView:'book', shareDiscover:false, treeChipOrder: [], bookDisplay: 'book', shelfView: 'shelf', shelfOpenMode: 'preview', homeMoment: { mode: 'last', treeId: '', momentId: '' } }});

test('capability is opt-in and matching subject keeps existing write contract',async()=>{
 const handle=setup();assert.equal(Object.hasOwn((await get(handle,'')).body,'writeSubjectBound'),false);
 assert.equal((await get(handle,'features=bound-writes')).body.writeSubjectBound,true);
 const document=state();const result=await put(handle,{state:document,expectedRevision:0,clientKey:'bound-1',expectedSubject:'usr_a'});
 assert.equal(result.status,200);assert.equal(result.body.revision,1);assert.deepEqual((await get(handle,'')).body.state,document);
 // Every write must carry an account binding.
 const missing=await put(handle,{state:document,expectedRevision:1,clientKey:'unbound-1'});
 assert.equal(missing.status,401);
 assert.equal(missing.body.error.code,'account_changed');
});
test('cookie account switch rejects A draft before any B write or claim',async()=>{
 const repo=createMemoryWorkspaceRepo(),a=setup('usr_a',repo),b=setup('usr_b',repo),document=state();
 for(const expectedSubject of ['usr_a',null,1,'']){
  const result=await put(b,{state:document,expectedRevision:0,clientKey:'same-key',expectedSubject});
  assert.equal(result.status,401);assert.equal(result.body.error.code,'account_changed');
 }
 assert.equal((await get(b,'')).body.revision,0);assert.equal((await get(a,'')).body.revision,0);
 // Rejected attempts did not reserve the key in B's workspace.
 assert.equal((await put(b,{state:document,expectedRevision:0,clientKey:'same-key',expectedSubject:'usr_b'})).status,200);
 assert.equal((await get(a,'')).body.state.trees.length,0);
});


test('unbound workspace write does not alter a different account',async()=>{
 const repo=createMemoryWorkspaceRepo(),a=setup('usr_a',repo),b=setup('usr_b',repo),document=state();
 assert.equal((await put(a,{state:document,expectedRevision:0,clientKey:'bound-a',expectedSubject:'usr_a'})).status,200);
 const attempt=await put(b,{state:document,expectedRevision:0,clientKey:'unbound-b'});
 assert.equal(attempt.status,401);
 assert.equal(attempt.body.error.code,'account_changed');
 assert.equal((await get(b,'')).body.revision,0);
 assert.equal((await get(a,'')).body.revision,1);
 // A refused request must not reserve a client key in the current account.
 assert.equal((await put(b,{state:document,expectedRevision:0,clientKey:'unbound-b',expectedSubject:'usr_b'})).status,200);
});