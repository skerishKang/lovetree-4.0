// 화면 시험을 잡 사이로 옮겨도 실제 파일·인수·환경·시간 제한이 보존되는지 검증한다.
// 워크플로 텍스트만 해석하므로 얕은 clone에서 Git 이력·원격 브랜치가 필요 없다.
const TEST_PATH = /tests\/[A-Za-z0-9_./-]+\.(?:test\.mjs|mjs|js)/g;
const JOB_HEAD = /^  ([a-z0-9-]+):\n/gm;
const STEP_HEAD = /^      - /gm;

const envOf = (source, indent) => {
  const prefix = ' '.repeat(indent);
  const lines = source.split('\n');
  const result = {};
  for (let i=0; i<lines.length; i++) {
    if (lines[i] !== prefix+'env:') continue;
    for (let j=i+1; j<lines.length; j++) {
      const line=lines[j];
      const match=new RegExp('^'+prefix+'  ([A-Za-z0-9_]+):\\s*(.+)$').exec(line);
      if (match) result[match[1]]=match[2];
      else if (line.trim() && !line.startsWith(prefix+'  #')) break;
    }
  }
  return result;
};

export function screenInvocations(workflowText, selectedJobs = null) {
  const source = String(workflowText).replace(/\r\n/g, '\n');
  const heads = [...source.matchAll(JOB_HEAD)];
  const jobs = new Set(selectedJobs || heads.map(h=>h[1]).filter(j=>j.startsWith('screen-') && j!=='screen-changes'));
  const entries=[];
  for (let i=0;i<heads.length;i++) {
    const job=heads[i][1];
    if(!jobs.has(job)) continue;
    const body=source.slice(heads[i].index,heads[i+1]?.index ?? source.length);
    const stepsStart=body.indexOf('    steps:\n');
    if(stepsStart<0) throw new Error('시험 잡 단계 없음: '+job);
    const header=body.slice(0,stepsStart);
    const jobLimit=Number((/^    timeout-minutes:\s*(\d+)/m.exec(header)||[])[1]||0);
    const jobEnv=envOf(header,4);
    const stepsBody=body.slice(stepsStart);
    const steps=[...stepsBody.matchAll(STEP_HEAD)];
    for(let k=0;k<steps.length;k++) {
      const block=stepsBody.slice(steps[k].index,steps[k+1]?.index??stepsBody.length);
      const stepHeader=block.split(/^\s*run: /m)[0];
      const stepLimit=Number((/^        timeout-minutes:\s*(\d+)/m.exec(stepHeader)||[])[1] || jobLimit);
      const env={...jobEnv,...envOf(stepHeader,8)};
      for (const line of block.split('\n')) {
        if(!/\bnode --test\b/.test(line)) continue;
        const paths=[...line.matchAll(TEST_PATH)].map(m=>m[0]);
        if(!paths.length) continue;
        const cmd=line.replace(TEST_PATH,'').trim().replace(/\s+/g,' ');
        const retry=block.split('\n').filter(x=>/\bretries?\b/.test(x) && !x.trim().startsWith('#')).map(x=>x.trim());
        for (const file of paths) entries.push({file,command:cmd,timeoutMinutes:stepLimit,env,retry,job});
      }
    }
  }
  return entries;
}

export function invocationSignatures(entries) {
  return entries.map(({job,...other})=>JSON.stringify({
    ...other,
    env:Object.fromEntries(Object.entries(other.env).sort(([a],[b])=>a.localeCompare(b)))
  })).sort();
}
