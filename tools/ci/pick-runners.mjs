import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// 세 차례의 완료된 화면 CI 실행에서 측정한 잡별 평균 소요 시간(초).
// 평균값이 같은 경우 잡 ID를 기준으로 정렬한다. 워크플로 실행 중에는 API로 재계산하지 않는다.
export const AVG_SECONDS = Object.freeze({
  'screen-map-a': 953,
  'screen-audit-a': 462,
  'screen-board': 393,
  'screen-book': 379,
  'screen-shell-extra': 346,
  'screen-home': 345,
  'screen-book-screen': 288,
  'screen-board-b': 284,
  'screen-reload': 270,
  'screen-map-b': 257,
  'screen-audit-c': 255,
  'screen-home-followup': 246,
  'screen-audit-b': 211,
  'screen-shell': 167,
  'screen-shelf': 164,
  'screen-home-1284': 95
});
export const JOBS = Object.freeze(Object.keys(AVG_SECONDS));
// 글꼴 차이로 화면 넘침 계측이 달랐던 책 시험은 항상 GitHub에서 실행한다.
export const CGI_EXCLUDED_JOBS = Object.freeze(['screen-book', 'screen-book-screen']);
const CGI_EXCLUDED = new Set(CGI_EXCLUDED_JOBS);
export const CGI_LABELS = Object.freeze(['self-hosted', 'Linux', 'X64', 'cgi']);
export const HOSTED_LABELS = Object.freeze(['ubuntu-latest']);
export const OUTPUT_KEY = job => job.replaceAll('-', '_');
const JOB_SET = new Set(JOBS);
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function activeJobs(selection) {
  if (selection === 'none' || selection === '') return [];
  if (selection === 'all') return [...JOBS];
  if (typeof selection !== 'string') throw new Error('화면 잡 목록을 읽지 못했습니다');
  const names = selection.split(',').map(x => x.trim()).filter(Boolean);
  if (names.some(name => !JOB_SET.has(name))) throw new Error('알 수 없는 화면 잡');
  return [...new Set(names)];
}

export function assignRunners(selection = 'all', available = 0) {
  const ordered = activeJobs(selection).sort((a, b) =>
    AVG_SECONDS[b] - AVG_SECONDS[a] || a.localeCompare(b));
  const slots = Number.isSafeInteger(available) && available > 0 ? available : 0;
  const onCGI = new Set(ordered.filter(job => !CGI_EXCLUDED.has(job)).slice(0, slots));
  return {
    ordered,
    chosen: [...onCGI],
    slots,
    labels: Object.fromEntries(JOBS.map(job =>
      [job, onCGI.has(job) ? [...CGI_LABELS] : [...HOSTED_LABELS]]))
  };
}

export function freeCGIRunners(response) {
  if (!response || !Array.isArray(response.runners)) throw new Error('실행기 응답 오류');
  return response.runners.filter(runner =>
    typeof runner?.name === 'string' &&
    runner.name.startsWith('CGI-LOVETREE-CI') &&
    runner.status === 'online' &&
    runner.busy === false).length;
}

async function fetchFreeRunners(repo, token, fetcher) {
  let page = 1, total = 0, checked = 0;
  for (; page <= 20; page++) {
    const response = await fetcher(
      `https://api.github.com/repos/${repo}/actions/runners?per_page=100&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!response?.ok) throw new Error('실행기 API 호출 실패');
    const data = await response.json();
    total += freeCGIRunners(data);
    checked += data.runners.length;
    if (data.runners.length < 100 || (Number.isInteger(data.total_count) && checked >= data.total_count)) return total;
  }
  // 조회가 온전히 끝나지 않았다면 빈자리를 추정하지 않고 전부 GitHub로 보낸다.
  throw new Error('실행기 목록 전체 조회 실패');
}

export async function pickRunners(env = process.env, fetcher = fetch) {
  const selection = env.SCREEN_JOBS || 'none';
  let reason = 'github', free = 0;
  if (env.SCREEN_CHANGED !== 'true' || selection === 'none') reason = '화면 잡 없음';
  else if (env.USE_CGI_RUNNER !== '1') reason = 'CGI 선택 꺼짐';
  else if (env.GITHUB_EVENT_NAME !== 'pull_request' ||
    !REPOSITORY.test(env.GITHUB_REPOSITORY || '') ||
    env.HEAD_REPO !== env.GITHUB_REPOSITORY) reason = '같은 저장소 PR 아님';
  else if (!env.RUNNER_PICKER_TOKEN) reason = '조회 토큰 없음';
  else {
    try {
      free = await fetchFreeRunners(env.GITHUB_REPOSITORY, env.RUNNER_PICKER_TOKEN, fetcher);
      reason = free ? 'CGI 빈자리 배정' : 'CGI 빈자리 없음';
    } catch {
      free = 0;
      reason = '실행기 조회 실패';
    }
  }
  let plan;
  try { plan = assignRunners(selection, free); }
  catch {
    plan = assignRunners('all', 0);
    reason = '화면 잡 목록 오류';
  }
  return { ...plan, reason, available: free };
}

export function githubOutputs(plan) {
  return [
    `available=${plan.available}`,
    `selected=${plan.chosen.join(',') || 'none'}`,
    `reason=${plan.reason}`,
    ...JOBS.map(job => `${OUTPUT_KEY(job)}=${JSON.stringify(plan.labels[job])}`)
  ].join('\n') + '\n';
}

export function githubSummary(plan) {
  const rows = [
    '## 화면 실행기 고르기',
    '',
    `- 판정: ${plan.reason}`,
    `- 비어 있는 CGI 실행기: ${plan.available}`,
    `- 이번 실행의 화면 잡: ${plan.ordered.length}`,
    '',
    '| 화면 잡 | 최근 평균(초) | 실행기 |',
    '|---|---:|---|'
  ];
  for (const job of plan.ordered) {
    rows.push(`| ${job} | ${AVG_SECONDS[job]} | ${plan.chosen.includes(job) ? 'CGI' : 'GitHub'} |`);
  }
  return rows.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const plan = await pickRunners();
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, githubOutputs(plan));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, githubSummary(plan));
  // 토큰·API 응답·Authorization 헤더는 출력하지 않는다.
  console.log(`실행기 판정: ${plan.reason}, CGI ${plan.available}자리, 선택 ${plan.chosen.length}개`);
}
