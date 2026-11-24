// 화면 검사 결과 모으기: 화면 바뀜 판정이 먼저 성공해야 하고, 잡 건너뜀은 판정이 '안 바뀜'일 때만 통과다.
export function checkScreenResults(needs = {}) {
  const gate = needs['screen-changes'];
  const changed = gate?.outputs?.changed;
  const failures = [];
  const lines = [];
  for (const [name, value] of Object.entries(needs)) {
    const result = value?.result;
    lines.push(`${name}: ${result}`);
    if (name === 'screen-changes') {
      if (result !== 'success') failures.push(`${name}이 성공하지 않았다(${result})`);
    } else if (name === 'deploy') {
      if (result !== 'success') failures.push(`${name}이 성공하지 않았다(${result})`);
    } else if (result === 'skipped') {
      // 2026-11-24: 한 화면만 바뀐 PR은 고른 잡 밖의 화면 잡을 건너뛴다. 고르지 않은 잡의 건너뜀만 통과다.
      const jobs = gate?.outputs?.jobs;
      const notPicked = changed === 'true' && jobs !== undefined && jobs !== 'all' && !String(jobs).split(',').includes(name);
      if (changed !== 'false' && !notPicked) failures.push(`${name}이 바뀜 판정 ${changed}에서 건너뛰었다`);
    } else if (result !== 'success') {
      failures.push(`${name}이 성공하지 않았다(${result})`);
    }
  }
  return { ok: failures.length === 0, failures, lines, changed };
}

if (process.argv[1] && process.argv[1].endsWith('screen-results.mjs')) {
  let text = '';
  process.stdin.on('data', (chunk) => { text += chunk; });
  process.stdin.on('end', () => {
    const { ok, failures, lines } = checkScreenResults(JSON.parse(text));
    for (const line of lines) console.log(line);
    if (!ok) { for (const reason of failures) console.error(reason); process.exit(1); }
  });
}
