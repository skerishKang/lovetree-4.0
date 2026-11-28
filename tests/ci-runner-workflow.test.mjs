import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JOBS } from '../tools/ci/pick-runners.mjs';
import { screenCommandContract } from '../tools/ci/screen-commands.mjs';

const workflow=readFileSync(new URL('../.github/workflows/preview-check.yml',import.meta.url),'utf8');
const baseline=JSON.parse(readFileSync(new URL('../tools/ci/screen-commands.baseline.json',import.meta.url),'utf8'));
const jobBody=name=>{
  const re=new RegExp('^  '+name+':\\n','m');
  const head=re.exec(workflow);
  assert.ok(head,'잡이 존재해야 함 '+name);
  const start=head.index+head[0].length;
  const tail=workflow.slice(start);
  const next=/^  [\w-]+:\n/m.exec(tail);
  return tail.slice(0,next?.index??tail.length);
};

test('CGI 빈자리 판정은 선택된 16개 화면 잡 각각의 runs-on 출력을 제공한다',()=>{
  const picker=jobBody('runner_picker');
  assert.match(picker,/secrets\.RUNNER_PICKER_TOKEN/);
  assert.match(picker,/needs\.screen-changes\.outputs\.jobs/);
  assert.match(picker,/node tools\/ci\/pick-runners\.mjs/);
  for(const job of JOBS){
    const key=job.replaceAll('-','_');
    assert.match(picker,new RegExp(key+': \\$\\{\\{ steps\\.pick\\.outputs\\.'+key+' \\}\\}'));
    const block=jobBody(job);
    assert.ok(block.includes("runs-on: ${{ fromJSON(needs.runner_picker.outputs."+key+" || '[\"ubuntu-latest\"]') }}"),job);
    assert.match(block,/needs: \[screen-changes, runner_picker\]/,job);
    assert.match(block,/npm_config_cache=\$HOME\/\.npm-lovetree-ci-cache/,job);
    assert.match(block,/node tools\/ci\/has-playwright-browser\.mjs/,job);
    assert.match(block,/npx playwright install chromium/,job);
    assert.ok(block.indexOf('npm_config_cache=') < block.indexOf('actions/setup-node@v4'),job);
    assert.match(block,/runner\.environment == 'self-hosted'/,job);
  }
});
test('실행기·브라우저 준비 변경은 기존 화면 시험 명령과 대기 계약을 보존한다',()=>{
  const after=screenCommandContract(workflow,JOBS);
  for(const job of JOBS)assert.deepEqual(after[job],baseline.jobs[job],job);
  assert.ok(!workflow.includes('npm_config_cache=$HOME/.npm-runner-$RUNNER_NAME'));
});
test('비화면 필수 잡 이름·동시성·알림용 겉모습 잡은 바꾸지 않는다',()=>{
  assert.match(workflow,/group: preview-check-\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}/);
  assert.match(workflow,/cancel-in-progress: true/);
  for(const name of ['screen-changes','deploy','visual','preview'])assert.ok(jobBody(name).length>0);
});
