// #1611: 얕은 clone에서도 같은 화면 잡의 명령·시험·상한을 검사한다.
// 워크플로 텍스트만 받으므로 git 저장소·원격 브랜치에 의존하지 않는다.
const COMMAND_LINE = /(?:timeout-minutes:|--test-name-pattern|--test-skip-pattern|retry|retries|^\s*run:|node --test)/;
const TEST_FILE = /tests\/[A-Za-z0-9_./-]+\.(?:test\.mjs|mjs|js)/g;

export function screenCommandContract(workflowText, jobNames) {
  const source = String(workflowText).replace(/\r\n/g, '\n');
  const result = {};
  for (const job of jobNames) {
    const head = new RegExp('^  ' + job + ':\\n', 'm').exec(source);
    if (!head) throw new Error('화면 잡을 찾을 수 없다: ' + job);
    const bodyStart = head.index + head[0].length;
    const nextJob = /^  [\w-]+:\n/gm;
    nextJob.lastIndex = bodyStart;
    const match = nextJob.exec(source);
    const body = source.slice(bodyStart, match?.index ?? source.length);
    const lines = body.split('\n');
    // #1620 자체 실행기 캐시 준비 명령은 화면 시험 명령·재시도가 아니다.
    // 해당 준비 단계는 워크플로에 그대로 두고 별도의 존재 확인 시험으로 지킨다.
    const runnerCache = 'run: echo "npm_config_cache=$HOME/.npm-lovetree-ci-cache" >> "$GITHUB_ENV"';
    const commandLines = lines.filter(line => COMMAND_LINE.test(line) && line.trim() !== runnerCache);
    const testFiles = [...new Set([...body.matchAll(TEST_FILE)].map(m=>m[0]))].sort();
    if (!testFiles.length || !commandLines.length) throw new Error('기준이 비어 있는 화면 잡: ' + job);
    result[job] = {
      tests: testFiles,
      commands: commandLines,
      timeouts: lines.filter(line => /timeout-minutes:/.test(line)),
      retries: lines.filter(line => /retry|retries/.test(line))
    };
  }
  return result;
}
