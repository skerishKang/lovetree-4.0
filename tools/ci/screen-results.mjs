// 화면 검사 결과 모으기: 화면 바뀜 판정이 먼저 성공해야 하고, 잡 건너뜀은 판정이 '안 바뀜'일 때만 통과다.
import { SELECTABLE_JOBS } from './screen-changes.mjs';

export function checkScreenResults(needs = {}) {
  const gate = needs['screen-changes'];
  const changed = gate?.outputs?.changed;
  const jobs = gate?.outputs?.jobs;
  const failures = [];
  const lines = [];
  const selected = jobs === 'all' ? SELECTABLE_JOBS : jobs === 'none' ? [] : (jobs || '').split(',').filter(Boolean);
  if (gate?.result !== 'success') failures.push('screen-changes failed');
  if (gate?.outputs?.mode === 'full') {
    if (needs.deploy?.result !== 'skipped' || jobs !== 'all') failures.push('invalid scheduled full run');
  } else if (needs.deploy?.result !== 'success') failures.push('deploy failed');
  if (!['true','false'].includes(changed) || !jobs ||
      (changed === 'false' && jobs !== 'none') ||
      (changed === 'true' && !selected.length) ||
      selected.some(j => !SELECTABLE_JOBS.includes(j))) failures.push('invalid screen selection');
  for (const [name, value] of Object.entries(needs)) {
    if (!name.startsWith('screen-') || name === 'screen-changes' || SELECTABLE_JOBS.includes(name)) continue;
    if (['failure', 'cancelled'].includes(value?.result)) {
      failures.push(name + ': unrecognized screen job failed (' + value.result + ')');
    }
  }
  for (const name of SELECTABLE_JOBS) {
    const result = needs[name]?.result;
    lines.push(name + ': ' + result);
    if (selected.includes(name)) {
      if (changed === 'true' && result === 'skipped')
        failures.push(name + ': changed screen job skipped');
      else if (result !== 'success')
        failures.push(name + ': selected job did not succeed (' + result + ')');
    } else if (result !== 'skipped' && result !== 'success') {
      failures.push(name + ': unexpected result (' + result + ')');
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
