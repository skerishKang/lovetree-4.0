import test from 'node:test';
import assert from 'node:assert/strict';
import {createRateLimiter,rateRequest,REQUEST_RATE_LIMITS,retryAfterHeaders,trustedClientIp} from '../server/rate-limit.js';
import {ApiError} from '../server/errors.js';

const START=Date.parse('2026-11-22T12:00:00.000Z');

test('창 안에서 한도를 넘으면 429를 던지고, 창이 지나면 다시 기록된다',()=>{
 let at=START;
 const limiter=createRateLimiter({now:()=>at});
 for(let count=0;count<3;count+=1)limiter.rate('sub:alice',3);
 assert.throws(()=>limiter.rate('sub:alice',3),error=>error instanceof ApiError&&error.status===429&&error.code==='rate_limited');
 at+=60_001; // 창이 지났다
 limiter.rate('sub:alice',3);
 assert.equal(limiter.hits.get('sub:alice').length,1,'창이 지나면 오래 기록은 버리고 이번 요청만 남는다');
});

test('기록마다 안내 문구를 바꿔 쓸 수 있다(의견 창구의 문구)',()=>{
 let at=START;
 const limiter=createRateLimiter({now:()=>at,windowMs:10*60_000});
 const notice='같은 곳에서 10분에 3번까지 보낼 수 있어요. 잠시 뒤 다시 시도해 주세요.';
 limiter.rate('ip:203.0.113.9',1,notice);
 assert.throws(()=>limiter.rate('ip:203.0.113.9',1,notice),error=>error.message===notice);
});

test('다른 키 요청 때 창이 지나 빈 목록이 된 키는 Map에서 지워진다',()=>{
 let at=START;
 const limiter=createRateLimiter({now:()=>at});
 limiter.rate('sub:alice',3);
 limiter.rate('sub:bob',3);
 assert.equal(limiter.hits.size,2);
 at+=60_001; // 창이 지났다
 limiter.rate('sub:carol',3); // 아무 요청이든 오면 지난 기록을 치운다
 assert.equal(limiter.hits.has('sub:alice'),false);
 assert.equal(limiter.hits.has('sub:bob'),false);
 assert.equal(limiter.hits.size,1);
});

test('판정: 창이 지난 뒤 Map 크기 0',()=>{
 let at=START;
 const limiter=createRateLimiter({now:()=>at});
 limiter.rate('sub:alice',3);
 limiter.rate('sub:alice',3);
 limiter.rate('sub:alice',3);
 assert.equal(limiter.hits.size,1);
 at+=60_001; // 창이 지났고 새 요청은 아직 없다
 limiter.prune();
 assert.equal(limiter.hits.size,0,'빈 목록은 키 삭제 — 창이 지나면 Map이 비는다');
});

test('저장 요청은 짧은 묶음과 분당 한도를 함께 세고 Retry-After를 준다',async()=>{
 let at=START;
 const limiter=createRateLimiter({now:()=>at});
 for(let index=0;index<15;index+=1)await rateRequest(limiter,{productId:'p',scope:'workspace-put',subjectId:'member',...REQUEST_RATE_LIMITS.workspace});
 await assert.rejects(()=>rateRequest(limiter,{productId:'p',scope:'workspace-put',subjectId:'member',...REQUEST_RATE_LIMITS.workspace}),error=>
   error instanceof ApiError&&error.status===429&&error.details.retryAfterSeconds>0&&error.details.retryAfterSeconds<=10);
 at+=10_001;
 await rateRequest(limiter,{productId:'p',scope:'workspace-put',subjectId:'member',...REQUEST_RATE_LIMITS.workspace});
});

test('900ms 간격 자동 저장 1분은 한도에 걸리지 않는다',async()=>{
 let at=START;
 const limiter=createRateLimiter({now:()=>at});
 for(let index=0;index<67;index+=1){
  await rateRequest(limiter,{productId:'p',scope:'workspace-put',subjectId:'member',...REQUEST_RATE_LIMITS.workspace});
  at+=901;
 }
});

test('IP는 프록시 증명이 있을 때만 쓰고 429 머리말을 만든다',()=>{
 const request={headers:{'x-lovetree-client-ip':'203.0.113.9'}};
 assert.equal(trustedClientIp(request,false),null);
 assert.equal(trustedClientIp(request,true),'203.0.113.9');
 const error=new ApiError(429,'rate_limited','잠시 뒤 다시 시도해 주세요.',{retryAfterSeconds:7});
 assert.deepEqual(retryAfterHeaders({'cache-control':'no-store'},error),{'cache-control':'no-store','retry-after':'7'});
});
