import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, rateRequest, REQUEST_RATE_LIMITS } from '../server/rate-limit.js';
import { createMemberSession } from '../public/v41/member-session.mjs';
import { createMemoryShareRepo } from '../server/testing/memory-share-repo.js';

const START = Date.parse('2026-11-28T12:00:00.000Z');
const fields = (title = '첫 순간') => ({subject:'별',title,note:'기억',date:'2026-11-28',emotion:'설렘',url:''});
function storage() {
  const values=new Map();
  return {rejectWrite:false,
    getItem:key=>values.get(key)??null,
    setItem(key,value){if(this.rejectWrite)throw new Error('quota exceeded');values.set(key,String(value));},
    removeItem:key=>values.delete(key),
    key:index=>[...values.keys()][index]??null,
    get length(){return values.size;}
  };
}
function member({draftStorage=storage(), put, delay=()=>new Promise(()=>{}), schedule=()=>1, cancelSchedule=()=>{}}={}) {
  const writes=[];
  const api={
    get:async()=>({ok:true,revision:0,state:{version:1,trees:[]},subject:'member-A',writeSubjectBound:true}),
    put:async body=>{writes.push(body);return put?.(body,writes.length)??{ok:true,revision:1};},
    logout:async()=>({ok:true})
  };
  const session=createMemberSession({api,draftStorage,cacheStorage:null,delay,schedule,cancelSchedule});
  return {session,writes,draftStorage};
}
const limited={ok:false,status:429,code:'rate_limited',retryAfterSeconds:7};

test('#1663 인증된 6명 동시 정상 편집은 공동 IP 때문에 제한되지 않고, 한 계정 초과는 제한된다',async()=>{
  let at=START;
  const limiter=createRateLimiter({now:()=>at});
  for(let tick=0;tick<67;tick++){
    at=START+tick*900;
    for(let person=0;person<6;person++){
      await rateRequest(limiter,{productId:'lt',scope:'workspace-put',
        subjectId:'member-'+person,clientIp:'203.0.113.10',...REQUEST_RATE_LIMITS.workspace});
    }
  }
  at+=60_000;
  for(let i=0;i<15;i++)await rateRequest(limiter,{productId:'lt',scope:'workspace-put',subjectId:'heavy',clientIp:'203.0.113.10',...REQUEST_RATE_LIMITS.workspace});
  await assert.rejects(()=>rateRequest(limiter,{productId:'lt',scope:'workspace-put',subjectId:'heavy',clientIp:'203.0.113.10',...REQUEST_RATE_LIMITS.workspace}),error=>error.status===429);
  for(let i=0;i<60;i++)await rateRequest(limiter,{productId:'lt',scope:'workspace-put',subjectId:null,clientIp:'198.51.100.2',...REQUEST_RATE_LIMITS.workspace});
  await assert.rejects(()=>rateRequest(limiter,{productId:'lt',scope:'workspace-put',subjectId:null,clientIp:'198.51.100.2',...REQUEST_RATE_LIMITS.workspace}),error=>error.status===429);
});

test('#1663 429을 받은 즉시 보관하고 숨김 없이 다시 접속해 복구한다',async()=>{
  const draftStorage=storage();
  const first=member({draftStorage,put:()=>limited});
  await first.session.start();
  first.session.apply('new',fields());
  await first.session.act('retry');
  assert.equal(first.session.status().phase,'throttled');
  assert.equal(first.session.snapshot().dirty,true);
  assert.equal(draftStorage.length,1,'429 응답 직후 기기에 보관해야 한다');
  assert.equal(JSON.parse(draftStorage.getItem(draftStorage.key(0))).state.trees[0].moments[0].title,'첫 순간');
  first.session.dispose();
  const reopened=member({draftStorage,put:()=>limited});
  await reopened.session.start();
  assert.equal(reopened.session.state().trees[0].moments[0].title,'첫 순간');
  assert.equal(reopened.session.snapshot().dirty,true);
  reopened.session.dispose();
});

test('#1663 저장 대기 중 기기 보관이 실패하면 백업 단추와 경고를 표시한다',async()=>{
  const draftStorage=storage();
  const {session}=member({draftStorage,put:()=>limited});
  await session.start();
  const first=session.apply('new',fields());
  await session.act('retry');
  draftStorage.rejectWrite=true;
  session.apply('add',fields('둘째 순간'),first);
  assert.equal(session.flushOnHide(),false);
  assert.equal(session.status().phase,'throttled');
  assert.match(session.status().detail,/보관|백업/);
  assert.ok(session.status().actions.some(action=>action.name==='backup'));
  session.dispose();
});

test('#1663 429 대기 중 기존 자동 저장은 보내지 않고 최신 편집을 예약 재시도에 담는다',async()=>{
  const waits=[],retryJobs=[];
  let releaseFirst;
  const {session,writes}=member({
    delay:()=>new Promise(resolve=>waits.push(resolve)),
    schedule:(fn,ms)=>{retryJobs.push({fn,ms});return retryJobs.length;},
    put:(_body,count)=>count===1 ? new Promise(resolve=>{releaseFirst=resolve;}) : {ok:true,revision:1}
  });
  await session.start();
  const first=session.apply('new',fields());
  const saving=session.act('retry');
  session.apply('add',fields('둘째 순간'),first);
  releaseFirst(limited);
  await saving;
  assert.equal(session.status().phase,'throttled');
  assert.deepEqual(retryJobs.map(job=>job.ms),[7000]);
  for(const resolve of waits)resolve();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,1,'기존 900ms 자동 저장은 대기를 앞질러 보내지 않는다');
  retryJobs[0].fn();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,2);
  assert.equal(writes[1].state.trees[0].moments.length,2);
  assert.equal(session.status().phase,'synced');
  session.dispose();
});

test('#1663 공유 미리보기 소비 후 동일 내용만 기한 안에 재응답한다',async()=>{
  const repo=createMemoryShareRepo({now:START});
  const tokenHash='a'.repeat(64),requestHash='b'.repeat(64);
  await repo.createPreview({tokenHash,productId:'lt',subjectId:'member',treeId:'tree',
    requestHash,expiresAt:new Date(START+300_000).toISOString()});
  const input={tokenHash,productId:'lt',subjectId:'member',treeId:'tree',requestHash,now:START,
    shareId:'share-created-1234567890',entryMomentId:'moment',view:'book',momentCount:1};
  assert.equal((await repo.createShareWithPreview(input)).status,'created');
  const replay=await repo.createShareWithPreview({...input,shareId:'other-share-1234567890'});
  assert.equal(replay.status,'replayed');
  assert.equal(replay.share.shareId,input.shareId);
  assert.equal((await repo.createShareWithPreview({...input,requestHash:'c'.repeat(64)})).status,'stale');
  assert.equal((await repo.createShareWithPreview({...input,now:START+300_001})).status,'expired');
});

test('#1663 429 대기 뒤 화면을 숨기면 최신 보관본이 다음 접속에 자동 복원된다',async()=>{
  const draftStorage=storage();
  const first=member({draftStorage,put:()=>limited});
  await first.session.start();
  first.session.apply('new',fields());
  await first.session.act('retry');
  assert.equal(first.session.flushOnHide(),false);
  assert.equal(JSON.parse(draftStorage.getItem(draftStorage.key(0))).reason,'hide',
    '저장 대기 중 숨김 기록은 이전 보관본과 같아도 숨김 복구로 승격한다');
  first.session.dispose();
  const reopened=member({draftStorage,put:()=>({ok:true,revision:1})});
  await reopened.session.start();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(reopened.session.status().phase,'synced');
  assert.equal(reopened.session.snapshot().dirty,false);
  assert.equal(draftStorage.length,0);
  reopened.session.dispose();
});
