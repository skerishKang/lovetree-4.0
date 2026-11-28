import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRunners, activeJobs, freeCGIRunners, pickRunners,
  githubOutputs, githubSummary, AVG_SECONDS, JOBS } from '../tools/ci/pick-runners.mjs';

const env = {
  SCREEN_CHANGED: 'true',
  SCREEN_JOBS: 'all',
  USE_CGI_RUNNER: '1',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_REPOSITORY: 'padiem-ai/lovetree-4.0',
  HEAD_REPO: 'padiem-ai/lovetree-4.0',
  RUNNER_PICKER_TOKEN: '시험용-가짜값'
};
const response = runners => async () => ({
  ok: true, json: async () => ({ total_count: runners.length, runners })
});
const runners = n => [
  ...Array.from({ length:n }, (_, i) => ({
    name: 'CGI-LOVETREE-CI' + (i+1), status: 'online', busy: false
  })),
  { name: 'CGI-LOVETREE-CI9', status:'online', busy: true },
  { name: 'CGI-LOVETREE-CI8', status:'offline', busy: false },
  { name: 'unrelated-runner', status:'online', busy: false }
];

test('잡 목록 및 평균 정렬 기준은 16개 화면 잡이다', () => {
  assert.equal(JOBS.length, 16);
  assert.deepEqual([...activeJobs('all')].sort(), [...JOBS].sort());
  assert.deepEqual(activeJobs('none'), []);
  assert.throws(() => activeJobs('screen-unknown'), /알 수 없는/);
  assert.ok(AVG_SECONDS['screen-map-a'] > AVG_SECONDS['screen-home']);
});
test('CGI 0자리이면 모든 화면 잡은 GitHub로 간다', async () => {
  const result=await pickRunners(env, response(runners(0)));
  assert.equal(result.available, 0);
  assert.equal(result.chosen.length, 0);
  assert.equal(Object.values(result.labels).filter(v => v.includes('cgi')).length, 0);
});
test('CGI 2자리면 실제 선택한 잡 중 평균이 긴 순서 2개만 배정한다', async () => {
  const settings = {...env, SCREEN_JOBS:'screen-home,screen-board,screen-map-a,screen-shelf'};
  const result=await pickRunners(settings, response(runners(2)));
  assert.deepEqual(result.ordered, ['screen-map-a','screen-board','screen-home','screen-shelf']);
  assert.deepEqual(result.chosen, ['screen-map-a','screen-board']);
  assert.deepEqual(result.labels['screen-board'], ['self-hosted','Linux','X64','cgi']);
  assert.deepEqual(result.labels['screen-audit-a'], ['ubuntu-latest']);
});
test('CGI 4자리면 평균 긴 화면 잡 4개만 CGI로 배정한다', async () => {
  const result=await pickRunners(env, response(runners(4)));
  assert.deepEqual(result.chosen, ['screen-map-a','screen-audit-a','screen-board','screen-book']);
  assert.equal(result.available, 4);
  assert.equal(result.ordered.length, 16);
});
test('대기 중 또는 오프라인 실행기는 빈자리로 계산하지 않는다', () => {
  assert.equal(freeCGIRunners({runners:runners(2)}),2);
  assert.throws(()=>freeCGIRunners({message:'error'}),/응답 오류/);
});
test('토큰 없거나 변수 0이면 API를 부르지 않고 GitHub만 고른다', async () => {
  const unexpected = async () => {throw new Error('API를 불러서는 안 됩니다')};
  const withoutToken=await pickRunners({...env,RUNNER_PICKER_TOKEN:''}, unexpected);
  const switchedOff=await pickRunners({...env,USE_CGI_RUNNER:'0'}, unexpected);
  assert.equal(withoutToken.chosen.length,0);
  assert.equal(switchedOff.chosen.length,0);
  assert.match(withoutToken.reason,/토큰/);
  assert.match(switchedOff.reason,/꺼짐/);
});
test('포크 PR 또는 비PR 실행이면 GitHub를 사용한다', async () => {
  const unexpected = async () => {throw new Error('API를 불러서는 안 됩니다')};
  for(const changes of [
    {HEAD_REPO:'another/fork'},
    {GITHUB_EVENT_NAME:'workflow_dispatch'},
    {GITHUB_EVENT_NAME:'schedule'}
  ]) {
    const result=await pickRunners({...env,...changes},unexpected);
    assert.equal(result.chosen.length,0);
  }
});
test('API 오류 및 불완전한 API 응답이면 안전하게 GitHub로 되돌린다', async () => {
  const unavailable = async () => ({ok:false,json:async()=>({})});
  for(const fetcher of [unavailable, async()=>{throw Error('API 오류')},async()=>({ok:true,json:async()=>({other:[]})})]){
    const result=await pickRunners(env,fetcher);
    assert.equal(result.chosen.length,0);
    assert.match(result.reason,/실행기 조회 실패/);
  }
});
test('비어있는 화면 잡 목록에서도 API를 조회하지 않는다',async()=>{
  let called=false;
  const result=await pickRunners({...env,SCREEN_CHANGED:'false',SCREEN_JOBS:'none'},async()=>{
    called=true;throw Error('should not call');
  });
  assert.equal(called,false);
  assert.deepEqual(result.ordered,[]);
  assert.equal(result.chosen.length,0);
});
test('출력은 잡별로 16개이고 비밀 문자열을 포함하지 않는다',async()=>{
  const result=await pickRunners(env,response(runners(2)));
  const output=githubOutputs(result);
  assert.match(output,/screen_map_a=\["self-hosted","Linux","X64","cgi"\]/);
  assert.match(output,/screen_home=\["ubuntu-latest"\]/);
  assert.equal(output.split('\n').filter(x=>/^screen_.*=/.test(x)).length,16);
  assert.doesNotMatch(output,/시험용-가짜값/);
  assert.doesNotMatch(githubSummary(result),/시험용-가짜값/);
});
