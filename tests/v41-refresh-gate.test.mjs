import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorkspaceApi, refreshUnauthorized, setMemberRefreshStarted} from '../public/v41/api.mjs';
import {createCommunityApi} from '../public/v41/community-api.mjs';
import {createShareApi} from '../public/v41/share-api.mjs';

const unauthorized = () => Response.json({error:{code:'unauthenticated'}},{status:401});
const recorder = () => {
  const calls=[];
  const fetchImpl=async url=>{
    calls.push(url);
    if(url==='/auth/refresh')return new Response(null,{status:204});
    return unauthorized();
  };
  return {calls,fetchImpl};
};
const refreshCalls = calls => calls.filter(url=>url==='/auth/refresh').length;

test('회원 시작 전 401은 refresh 0회, 401 그대로',async()=>{
  setMemberRefreshStarted(false);
  try {
    const w=recorder();
    assert.equal((await createWorkspaceApi({fetchImpl:w.fetchImpl}).listMedia()).status,401);
    assert.equal(refreshCalls(w.calls),0);
    assert.equal(w.calls.filter(url=>url==='/api/media').length,1);

    const c=recorder();
    assert.equal((await createCommunityApi({fetchImpl:c.fetchImpl}).favorite('test',true)).status,401);
    assert.equal(refreshCalls(c.calls),0);
    assert.equal(c.calls.filter(url=>url.includes('/favorite')).length,1);

    const s=recorder();
    assert.equal((await createShareApi({fetchImpl:s.fetchImpl}).list()).status,401);
    assert.equal(refreshCalls(s.calls),0);
    assert.equal(s.calls.filter(url=>url==='/api/shares').length,1);
  } finally { setMemberRefreshStarted(true); }
});

test('회원 시작 뒤 401은 refresh 1회',async()=>{
  setMemberRefreshStarted(true);
  const w=recorder();
  assert.equal((await createWorkspaceApi({fetchImpl:w.fetchImpl}).listMedia()).status,401);
  assert.equal(refreshCalls(w.calls),1);
  assert.equal(w.calls.filter(url=>url==='/api/media').length,3);

  const c=recorder();
  assert.equal((await createCommunityApi({fetchImpl:c.fetchImpl}).favorite('test',true)).status,401);
  assert.equal(refreshCalls(c.calls),1);
  assert.equal(c.calls.filter(url=>url.includes('/favorite')).length,3);

  const s=recorder();
  assert.equal((await createShareApi({fetchImpl:s.fetchImpl}).list()).status,401);
  assert.equal(refreshCalls(s.calls),1);
  assert.equal(s.calls.filter(url=>url==='/api/shares').length,3);
});

test('refreshUnauthorized 진입부 canRefresh=false면 재시도 없이 401 반환',async()=>{
  let calls=0;
  const request=async()=>{calls++;return unauthorized();};
  const response=await refreshUnauthorized({
    fetchImpl:async()=>{calls++;return new Response(null,{status:204});},
    request, response:unauthorized(), canRefresh:false
  });
  assert.equal(response.status,401);
  assert.equal(calls,0);
});

test('shell.mjs는 공용 화면에서 게이트를 끄고 startMember에서 켠다',()=>{
  const shell=readFileSync(new URL('../public/v41/shell.mjs',import.meta.url),'utf8');
  assert.match(shell,/setMemberRefreshStarted\(false\)/);
  const startLine=shell.split(/\r?\n/).find(line=>line.includes('async function startMember'));
  assert.ok(startLine,'startMember 선언이 있어야 한다');
  assert.match(startLine,/setMemberRefreshStarted\(true\)/);
});
