// #1611: 공통 소유 시험 이동은 파일·실행 인수·환경·시간 제한을 하나도 잃지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEST_OWNERS,COMMON_OWNER_TESTS} from '../tools/ci/screen-owners.mjs';
import {jobTestFiles,selectJobs,selectScreens,SELECTABLE_JOBS} from '../tools/ci/screen-changes.mjs';
import {screenInvocations,invocationSignatures} from '../tools/ci/screen-invocations.mjs';
import {checkScreenResults} from '../tools/ci/screen-results.mjs';

const workflow=readFileSync(new URL('../.github/workflows/preview-check.yml',import.meta.url),'utf8');
const prior=JSON.parse(readFileSync(new URL('../tools/ci/screen-invocations.before-common.json',import.meta.url),'utf8'));
const jobs=jobTestFiles(workflow);
const actual=screenInvocations(workflow,Object.keys(jobs));
const unique=[...new Set(actual.map(x=>x.file))].sort();
const signatures=invocationSignatures(actual);
const common=['screen-common-a','screen-common-b'];

test('#1611 공통 소유 시험 목록은 단일 권한표에서 나오고 두 공통 잡으로만 이동한다',()=>{
  assert.equal(COMMON_OWNER_TESTS.length,11,'공통 소유 11개 시험 파일');
  assert.deepEqual(COMMON_OWNER_TESTS,
    Object.keys(TEST_OWNERS).filter(file=>TEST_OWNERS[file].includes('common')).sort());
  for(const file of COMMON_OWNER_TESTS){
    const holders=Object.entries(jobs).filter(([,files])=>files.has(file)).map(([name])=>name);
    if(file==='tests/v41-screen-audit.test.mjs')
      assert.deepEqual(holders,common,'공통 검사기 파일은 A의 a/b, B의 c 묶음에 각 한 번');
    else
      assert.equal(holders.length,1,file+' 공통 잡 간 파일 중복·누락 없음');
    assert.ok(holders.every(name=>common.includes(name)),file+' 공통 소유는 공통 잡에만 있다');
  }
  for(const [job,files] of Object.entries(jobs))
    if(!common.includes(job))
      for(const file of files)
        assert.ok(!TEST_OWNERS[file]?.includes('common'),job+'에 공통 소유 시험이 남음: '+file);
});

test('#1611 전후 시험 파일 합집합 82개 같고 빠짐·중복 실행 조합 0',()=>{
  assert.equal(prior.sourceRevision,'eecea158ec4628f96c3b906d5e77fd331340bd59');
  assert.deepEqual(unique,prior.uniqueFiles,'원래 16개 잡 시험 파일 합집합이 보존된다');
  assert.equal(actual.length,88,'전체 명령 호출별 시험 88개');
  assert.equal(signatures.length,new Set(signatures).size,'동일한 실행 중복 0');
  assert.deepEqual(signatures,prior.signatures,
    '파일별 실제 node --test 명령 인수·환경 변수·timeout·retry까지 정확히 같아야 한다');
  assert.equal(Object.keys(jobs).length,15,'새 A/B 잡을 포함한 총 15개');
  assert.deepEqual(common.filter(x=>!SELECTABLE_JOBS.includes(x)),[],'두 공통 잡 모두 선택 가능');
});

test('#1611 화면별 선택 수는 줄이고 공통 A/B만 모든 화면에 따라간다',()=>{
  const cases=[
    ['src/views/orbit.js',7],
    ['public/v41/views/board/board.js',12],
    ['public/v41/views/book/book.css',12],
    ['public/v41/views/shelf/shelf-views.mjs',8],
    ['public/v41/views/network/network.js',10],
    ['public/v41/shell.css',15],
    ['docs/a.md',0]
  ];
  for(const [file,count] of cases){
    const selection=selectJobs([file]);
    const selected=selection==='all'?[...SELECTABLE_JOBS]:selection==='none'?[]:selection.split(',');
    assert.equal(selected.length,count,file+' 선택 잡 수');
    if(count>0)for(const name of common)assert.ok(selected.includes(name),file+' 공통 잡 누락: '+name);
    if(count<15&&count>0)for(const job of selected)
      if(!common.includes(job))
        assert.ok([...jobs[job]].some(f=>TEST_OWNERS[f].some(area=>selectScreens([file]).split(',').includes(area))),
          file+' 원래 화면 소유 잡을 선택한다');
  }
});

test('#1611 예약 전체 검사와 네 필수 검사 이름·실행기 분배는 유지한다',()=>{
  const body=name=>{
    const head=new RegExp('^  '+name+':\\n','m').exec(workflow);
    assert.ok(head,'잡 없음 '+name);
    const start=head.index+head[0].length;
    const tail=workflow.slice(start);
    const next=tail.search(/^  [a-z0-9-]+:\n/m);
    return tail.slice(0,next<0?undefined:next);
  };
  const required={
    'screen-changes':'화면 바뀜 검사',
    deploy:'미리보기 배포 검사(postdeploy)',
    visual:'겉모습 비교(알림용)',
    preview:'미리보기 postdeploy(로그아웃)'
  };
  for(const [job,name] of Object.entries(required))
    assert.ok(body(job).includes('    name: '+name),job+' 필수 검사 이름 그대로');
  assert.match(workflow,/cron: "0 2,10,18 \* \* \*"/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(body('screen-common-a'),/runs-on: .*needs\.runner_picker\.outputs\.screen_common_a/);
  assert.match(body('screen-common-b'),/runs-on: .*needs\.runner_picker\.outputs\.screen_common_b/);
  const runsA=body('screen-common-a').match(/LT_SCREEN_AUDIT_SHARD=[abc] .*tests\/v41-screen-audit\.test\.mjs/g)||[];
  const runsB=body('screen-common-b').match(/LT_SCREEN_AUDIT_SHARD=[abc] .*tests\/v41-screen-audit\.test\.mjs/g)||[];
  assert.equal(runsA.length,2,'공통 검사 A의 a/b 두 실행 조합');
  assert.equal(runsB.length,1,'공통 검사 B의 c 한 실행 조합');
  for(const shard of ['a','b'])
    assert.ok(runsA.some(line=>line.startsWith('LT_SCREEN_AUDIT_SHARD='+shard+' ')),'A 검사 조합 '+shard);
  assert.ok(runsB[0].startsWith('LT_SCREEN_AUDIT_SHARD=c '),'B 검사 조합 c');
  assert.equal((body('screen-common-a').match(/timeout-minutes: 10/g)||[]).length,3,
    'A 글꼴 준비와 a/b 검사 각각 10분 상한');
  assert.equal((body('screen-common-b').match(/timeout-minutes: 10/g)||[]).length,2,
    'B 글꼴 준비와 c 검사 각각 10분 상한');
  const deps=body('preview').match(/needs: \[([^\]]+)\]/)?.[1].split(',').map(s=>s.trim());
  assert.ok(deps);
  for(const name of common)assert.ok(deps.includes(name),name+' 필수 집계 의존성');
  for(const old of ['screen-audit-a','screen-audit-b','screen-audit-c'])
    assert.ok(!deps.includes(old),'삭제된 이전 잡을 기다리지 않음');
});

test('#1611 고른 공통 잡을 건너뛰거나 실패·취소하면 필수 결과 집계는 실패한다',()=>{
  const selected='screen-common-a,screen-common-b,screen-home';
  const needs={
    'screen-changes':{result:'success',outputs:{changed:'true',jobs:selected}},
    deploy:{result:'success'},
    ...Object.fromEntries(SELECTABLE_JOBS.map(job=>[job,{result:selected.split(',').includes(job)?'success':'skipped'}]))
  };
  assert.equal(checkScreenResults(needs).ok,true);
  for(const bad of ['skipped','failure','cancelled']){
    const altered={...needs,'screen-common-a':{result:bad}};
    assert.equal(checkScreenResults(altered).ok,false,'공통 잡 '+bad);
  }
  const missing={...needs,'screen-changes':{result:'success',outputs:{changed:'true',jobs:'screen-home'}}};
  assert.equal(checkScreenResults(missing).ok,false,'공통 잡 둘이 빠진 선택을 거부');
});

test('#1629 실제 화면 잡 이름과 모음 잡 needs·판정의 이름이 정확히 같아야 한다',()=>{
  const assertContract=source=>{
    const normalized=source.replace(/\r\n/g,'\n');
    const jobIds=[...normalized.matchAll(/^  (screen-[a-z0-9-]+):[ \t]*$/gm)]
      .map(m=>m[1]).filter(id=>id!=='screen-changes').sort();
    const preview=normalized.slice(normalized.indexOf('  preview:\n'));
    const match=/^    needs: \[([^\]\n]+)\]$/m.exec(preview);
    assert.ok(match,'모음 잡의 needs가 있다');
    const expected=match[1].split(',').map(s=>s.trim())
      .filter(id=>id.startsWith('screen-')&&id!=='screen-changes').sort();
    assert.deepEqual(expected,jobIds,'실제 워크플로 잡 이름 = 모음 잡 needs');
    assert.deepEqual(jobIds,[...SELECTABLE_JOBS].sort(),'판정의 선택 가능 잡 = 실제 워크플로 잡');
    assert.deepEqual(jobIds.filter(id=>id.startsWith('screen-common-')),common,'공통 잡 A/B만 존재한다');
  };
  assertContract(workflow);
  for(const old of ['screen-audit-a','screen-audit-b','screen-audit-c']){
    const changedNeeds=workflow.replace(
      /(  preview:\n[\s\S]*?    needs: \[[^\]\n]*?)screen-common-a(?=, screen-common-b, deploy\])/m,
      (_all,prefix)=>prefix+old
    );
    assert.notEqual(changedNeeds,workflow,'이전 잡 이름으로 needs 변경 시험 준비');
    assert.throws(()=>assertContract(changedNeeds),assert.AssertionError,'옛 이름의 needs를 거부한다');
    const changedJob=workflow.replace(/^  screen-common-a:$/m,'  '+old+':');
    assert.notEqual(changedJob,workflow,'이전 잡 이름으로 정의 변경 시험 준비');
    assert.throws(()=>assertContract(changedJob),assert.AssertionError,'옛 이름의 잡 정의를 거부한다');
  }
});

test('#1639 실행 워크플로의 merge 판으로 화면 선택·실행기·모음 판정을 읽는다',()=>{
  const jobBody=name=>{
    const start=workflow.indexOf('\n  '+name+':\n');
    assert.ok(start>=0,'잡 정의: '+name);
    const tail=workflow.slice(start+1);
    const next=tail.slice(3+name.length).search(/\n  [a-z0-9-]+:\n/);
    return next<0?tail:tail.slice(0,3+name.length+next);
  };
  for(const job of ['screen-changes','runner_picker','preview']){
    const checkout=jobBody(job).match(/- uses: actions\/checkout@v4\n\s+with:\n\s+ref: ([^\n]+)/);
    assert.ok(checkout,job+' 체크아웃 설정');
    assert.match(checkout[1],/github\.sha/,'실행 워크플로의 merge SHA');
    assert.doesNotMatch(checkout[1],/pull_request\.head\.sha/,'오래된 PR head 선택 금지');
  }
  assert.match(jobBody('screen-board'),/ref: .*pull_request\.head\.sha/,
    '실제 화면 시험 대상은 PR head 그대로');
});

test('#1639 예전 PR head의 잡 목록은 실제 needs의 성공을 실패로 오판하지 않는다',()=>{
  const obsolete=['screen-audit-a','screen-audit-b','screen-audit-c'];
  const oldHeadJobs=SELECTABLE_JOBS.filter(j=>!common.includes(j)).concat(obsolete);
  const runningNeeds={
    'screen-changes':{result:'success',outputs:{changed:'true',jobs:'all'}},
    deploy:{result:'success'},
    ...Object.fromEntries(SELECTABLE_JOBS.map(j=>[j,{result:'success'}]))
  };
  assert.deepEqual(oldHeadJobs.filter(j=>!Object.hasOwn(runningNeeds,j)),obsolete,
    '예전 PR head의 이름은 실제 needs에 없다');
  assert.equal(checkScreenResults(runningNeeds).ok,true,
    '모음 잡은 실행된 merge 판의 이름을 사용한다');
  for(const status of ['skipped','failure','cancelled']){
    for(const job of ['screen-common-a','screen-common-b','screen-board']){
      const broken={...runningNeeds,[job]:{result:status}};
      const result=checkScreenResults(broken);
      assert.equal(result.ok,false,job+' '+status+'는 실패');
      assert.ok(result.failures.some(s=>s.includes(job)),job+' 결과가 판정에 남는다');
    }
  }
  const missing={...runningNeeds};
  delete missing['screen-common-b'];
  assert.equal(checkScreenResults(missing).ok,false,'실제 필요한 공통 잡 누락도 실패');
});
