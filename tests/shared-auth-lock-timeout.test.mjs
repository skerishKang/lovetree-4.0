import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceApi as legacyApi} from '../src/sync.js';
import {createWorkspaceApi as v41Api} from '../public/v41/api.mjs';

for (const [name,createApi] of [['4.0',legacyApi],['4.1',v41Api]]) {
 test(name+' cancels an expired refresh waiting behind another tab',async()=>{
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const doc=Object.getOwnPropertyDescriptor(globalThis,'document');
  let calls=0,watchdog;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{cookie:'__Host-lovetree-shared=1'}});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{
   request(_name,options,callback){
    // Another tab still owns the lock: this callback must never start.
    return new Promise((resolve,reject)=>{
     options?.signal?.addEventListener('abort',()=>reject(new DOMException('deadline','AbortError')),{once:true});
    });
   }
  }}});
  try {
   const api=createApi({timeoutMs:20,fetchImpl:async()=>{calls++;return Response.json({error:{code:'unauthenticated'}},{status:401});}});
   const outcome=await Promise.race([api.get(),new Promise(resolve=>{watchdog=setTimeout(()=>resolve({hung:true}),300);})]);
   assert.equal(outcome.hung,undefined,'expired Web Lock wait must settle');
   assert.equal(outcome.status,0);assert.equal(outcome.code,'timeout');
   assert.equal(calls,1,'do not issue a refresh or retry after the deadline');
  } finally {
   clearTimeout(watchdog);
   if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;
   if(doc)Object.defineProperty(globalThis,'document',doc);else delete globalThis.document;
  }
 });
}
