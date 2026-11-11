import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceApi, setMemberRefreshStarted} from '../public/v41/api.mjs';
import {createMemberSession} from '../public/v41/member-session.mjs';

function memorySessionStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function fakeWorkspaceServer() {
  let subject = 'sub_member_a', token = 'access-valid', refreshSucceeds = false;
  const workspaces = new Map();
  const writes = [], requests = [];
  const workspace = id => workspaces.get(id) ?? {revision:0,state:{version:1,trees:[]}};
  const fetchImpl = async (url, init = {}) => {
    if (url === '/auth/refresh') {
      const record={url,token}; requests.push(record);
      if (!refreshSucceeds) { record.status=401; return Response.json({error:{code:'not_authenticated'}},{status:401}); }
      token = 'access-refreshed';
      record.status=204;
      return new Response(null,{status:204});
    }
    if (url !== '/api/workspace') throw new Error('unexpected fake route');
    const method = init.method || 'GET';
    const record={url,method,token,body:init.body}; requests.push(record);
    if (token === 'access-expired') { record.status=401; return Response.json({error:{code:'unauthenticated'}},{status:401}); }
    const current = workspace(subject);
    if (method === 'GET') { record.status=200; return Response.json({
      revision:current.revision,state:current.state,subject,writeSubjectBound:true
    }); }
    if (method !== 'PUT') { record.status=405; return Response.json({error:{code:'method_not_allowed'}},{status:405}); }
    const body = JSON.parse(init.body);
    writes.push({subject,body});
    if (body.expectedRevision !== current.revision) { record.status=409; return Response.json({error:{code:'revision_conflict',currentRevision:current.revision}},{status:409}); }
    const saved = {revision:current.revision+1,state:body.state};
    workspaces.set(subject,saved);
    record.status=200;
    return Response.json({revision:saved.revision,state:saved.state,subject,writeSubjectBound:true});
  };
  return {
    requests,writes,fetchImpl,
    expireAccessToken(){token='access-expired';},
    allowRefresh(){refreshSucceeds=true;},
    signInAgain(){token='access-after-login';},
    useSubject(value){subject=value;}
  };
}

const fields = {subject:'별',title:'처음',note:'기억할 마음',date:'2026-11-06',emotion:'설렘',url:''};
const makeSession = (api, draftStorage) => createMemberSession({
  api,draftStorage,delay:()=>new Promise(()=>{}),makeClientKey:()=> 'request-key-1'
});

test('15-minute access expiry refreshes and saves the exact same workspace request', async () => {
  setMemberRefreshStarted(true);
  const server=fakeWorkspaceServer(), storage=memorySessionStorage();
  const api=createWorkspaceApi({fetchImpl:server.fetchImpl});
  const session=makeSession(api,storage);
  await session.start();
  session.apply('new',fields);
  const content=session.state();
  server.expireAccessToken(); server.allowRefresh();

  await session.act('retry');

  const writes=server.requests.filter(x=>x.method==='PUT');
  assert.equal(server.requests.filter(x=>x.url==='/auth/refresh').length,1);
  assert.equal(writes.length,3);
  assert.deepEqual(writes.map(x=>x.status),[401,401,200]);
  assert.equal(new Set(writes.map(x=>x.body)).size,1);
  assert.deepEqual(server.writes.at(-1).body.state,content);
  assert.equal(session.snapshot().dirty,false);
  assert.equal(storage.values.size,0);
});

test('failed refresh restores the same-account draft after login and never exposes it to another account', async () => {
  setMemberRefreshStarted(true);
  const server=fakeWorkspaceServer(), storage=memorySessionStorage();
  const api=createWorkspaceApi({fetchImpl:server.fetchImpl});
  const first=makeSession(api,storage);
  await first.start();
  first.apply('new',fields);
  const content=first.state();
  server.expireAccessToken();

  await first.act('retry');
  assert.equal(first.status().phase,'login');
  assert.match(first.status().detail,/로그인이 만료되어 서버에 저장하지 못했어요/);
  assert.deepEqual(first.state(),content);
  assert.equal(server.writes.length,0);
  const pendingKey='lovetree.v41.pending-write:sub_member_a';
  const pending=storage.getItem(pendingKey);
  assert.ok(pending);
  assert.equal(pending.includes('access-expired'),false);
  assert.equal(pending.includes('access-after-login'),false);
  const failedBodies=server.requests.filter(x=>x.method==='PUT').map(x=>x.body);
  assert.deepEqual(server.requests.filter(x=>x.method==='PUT').map(x=>x.status),[401,401]);

  server.useSubject('sub_member_b'); server.signInAgain();
  const otherAccount=makeSession(api,storage);
  await otherAccount.start();
  assert.deepEqual(otherAccount.state(),{version:1,trees:[],prefs:{ titleDisplay:'both', displayName: '', accentColor: '', dateStyle:'dot', startPlace:'resume', shareView:'book', shareDiscover:false }});
  assert.equal(otherAccount.snapshot().dirty,false);
  assert.ok(storage.getItem(pendingKey));

  server.useSubject('sub_member_a');
  const afterLogin=makeSession(api,storage);
  await afterLogin.start();
  assert.deepEqual(afterLogin.state(),content);
  assert.equal(afterLogin.snapshot().writable,true);
  assert.equal(afterLogin.snapshot().dirty,true);
  await afterLogin.act('retry');

  assert.equal(server.writes.length,1);
  assert.equal(server.writes[0].subject,'sub_member_a');
  assert.deepEqual(server.writes[0].body.state,content);
  const allBodies=server.requests.filter(x=>x.method==='PUT').map(x=>x.body);
  assert.ok(allBodies.slice(0,failedBodies.length).every((body,index)=>body===failedBodies[index]));
  assert.equal(new Set(allBodies).size,1);
  assert.equal(afterLogin.snapshot().dirty,false);
  assert.equal(storage.getItem(pendingKey),null);
});
