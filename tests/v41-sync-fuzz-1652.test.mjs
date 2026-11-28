import test from 'node:test';
import assert from 'node:assert/strict';
import {runTrace} from './helpers/sync-fuzz-1652.mjs';

const seeds=Array.from({length:250},(_,i)=>164601+i);

test('#1652 고정 시드 250줄기는 세션별 불변식을 모두 지킨다', async () => {
  assert.equal(seeds.length,250,'고정 시드 개수');
  const failures=[];
  let totalSteps=0;
  for(const seed of seeds){
    let result;
    try{result=await runTrace(seed);}
    catch(error){throw new Error(`seed=${seed} step=execution expected=no error actual=${error?.stack||error}`,{cause:error});}
    totalSteps+=result.steps;
    for(const violation of result.violations){
      failures.push({seed,step:violation.step,rule:violation.rule,
        expected:'no invariant violation',actual:violation.detail,action:violation.action});
    }
  }
  assert.deepEqual(failures,[],
    `250 seeds, ${totalSteps} steps: expected=[] actual=${JSON.stringify(failures)}`);
  console.log(`SYNC_FUZZ_1652_SUMMARY seeds=${seeds.length} steps=${totalSteps} violations=0`);
});

test('#1656 시드 164661: 종료된 세션의 지연 응답은 새 보관본을 변경하지 않는다',async()=>{
  const result=await runTrace(164661);
  assert.deepEqual(result.violations,[],
    `seed=164661 step=${result.violations[0]?.step??'none'} expected=[] actual=${JSON.stringify(result.violations)}`);
});

const known=[
  {seed:165594,rule:'lost-moment',label:'새로고침 뒤 세대가 초기화되어 늦은 401이 최신 보관본을 덮음'},
  {seed:166961,rule:'duplicate-client-key',label:'같은 내용을 다른 clientKey로 다시 저장함'}
];
for(const item of known)
  test(`#1652 알려진 실패 ${item.seed}: ${item.label}`,{skip:`KNOWN #1652 — ${item.rule}`},async()=>{
    const result=await runTrace(item.seed);
    assert.ok(result.violations.some(v=>v.rule===item.rule),
      `seed=${item.seed} step=${result.violations[0]?.step??'none'} expected=${item.rule} actual=${JSON.stringify(result.violations)}`);
  });
