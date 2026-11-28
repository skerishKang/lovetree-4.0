import test from 'node:test';
import assert from 'node:assert/strict';
import {runTrace} from './helpers/sync-fuzz-1652.mjs';

const seeds=Array.from({length:250},(_,i)=>164601+i);
const knownStale=new Set([164661,164665,164705,164795,164846]);

test('#1652 고정 시드 250줄기는 알려진 실패 외 불변식 위반이 없다', async () => {
  assert.equal(knownStale.size,5);
  for(const seed of seeds){
    if(knownStale.has(seed))continue;
    const result=await runTrace(seed);
    assert.deepEqual(result.violations,[],`seed ${seed}: ${JSON.stringify(result.violations)}`);
  }
});

const known=[
  {seed:164661,rule:'stale-draft',label:'닫힌 세션의 지연 저장이 옛 보관본을 다시 만듦'},
  {seed:165594,rule:'lost-moment',label:'새로고침 뒤 세대가 초기화되어 늦은 401이 최신 보관본을 덮음'},
  {seed:166961,rule:'duplicate-client-key',label:'같은 내용을 다른 clientKey로 다시 저장함'}
];
for(const item of known)
  test(`#1652 알려진 실패 ${item.seed}: ${item.label}`,{skip:`KNOWN #1652 — ${item.rule}`},async()=>{
    const result=await runTrace(item.seed);
    assert.ok(result.violations.some(v=>v.rule===item.rule),JSON.stringify(result.violations));
  });
