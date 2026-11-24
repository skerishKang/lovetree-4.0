// Functions가 직접 답하는 준비 확인 경로를 본다(#1254). 예전에는 저장 API를 거치는 계정 확인
// 경로를 봤는데, PR 미리보기에는 저장 API 주소가 설정돼 있지 않아 그 경로가 늘 503이었다.
// 그 때문에 배포가 다 떴는데도 준비 상태가 'cold'로 고정됐다. 저장소에 기대지 않는
// Functions 라우팅 응답(robots.txt)을 보면 미리보기에서도 준비 여부를 제대로 읽을 수 있다.
// 404를 성공으로 세지 않는다 — 라우팅이 아직 안 붙은 상태를 넘기면 진짜 고장을 가린다(2026-11-09 CTO 결정).
//
// #496(2026-11-13): 503도 **아직 안 뜬 것**으로 본다. 예전에는 "404가 아니면 준비됨"이라 배포 직후의
// 503을 준비 완료로 읽었고, 그 상태로 채점에 들어가 환경 문제와 제품 결함이 같은 빨강이 됐다.
// 시도 횟수·간격·기한은 바꾸지 않는다 — 주소만 저장 API가 아닌 쪽으로 바꾼다.
//
// 상태 셋으로 답한다(호출자가 요약에 나눠 적는다):
//   'ready'  — Functions가 응답한다(200·401·403 등). 채점해도 된다.
//   'cold'   — 기한 안에 404/503만 봤다(또는 계속 오류). **환경 준비 안 됨**이지 제품 결함이 아니다.
//   null     — 주소가 없어 확인할 것도 없다.
// 시간이 넘으면 검사를 막지 않고 지금처럼 진행한다. 호출자가 요약에 한 줄을 남긴다.
export const READY_TIMEOUT_MS = 60_000;
export const READY_INTERVAL_MS = 3000;
// Functions가 직접 답하는 정적·라우팅 응답 — 저장 API(/api/*)를 거치지 않는다.
export const READY_PATH = '/robots.txt';

// '아직 안 뜬' 응답 — 이 코드가 오면 준비된 것이 아니라 더 기다린다.
// 404: Functions 라우트가 아직 안 붙었다(#337 실측). 502·503·504: 엣지/게이트웨이가 뒷단을 못 찾는다.
export const NOT_YET_STATUSES = Object.freeze([404, 502, 503, 504]);

export function isNotYetUp(status) {
  return NOT_YET_STATUSES.includes(status);
}

// 시계·잠자는 함수는 넣어 바꿀 수 있다(기본값은 실제 시계·실제 setTimeout). 검사가 실제 시간에
// 기대지 않고 기한 경계를 결정적으로 밟을 수 있게 하려는 주입 지점일 뿐, 기본 동작은 같다.
const realNow = () => Date.now();
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function functionsReady(previewUrl, { fetcher = (...args) => fetch(...args), timeoutMs = READY_TIMEOUT_MS, intervalMs = READY_INTERVAL_MS, log = () => {}, now = realNow, sleep = realSleep } = {}) {
  if (!previewUrl) return null; // 주소가 없으면 확인할 것도 없다. 호출자가 그대로 진행한다.
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  const seen = new Set();
  while (true) {
    // 기한이 이미 지났으면 더 시도하지 않는다. 상한 신호 없는 시도를 한 번 더 하면
    // 기한을 넘겨 멈춘 요청이 그대로 남기 때문이다(#338 불안정 시험의 원인).
    const remaining = deadline - now();
    if (attempts > 0 && remaining <= 0) break;
    attempts += 1;
    try {
      // 한 번의 요청이 멈춰도 기한을 넘기지 않도록 남은 기한만큼 상한을 둔다.
      const signal = typeof AbortSignal?.timeout === 'function' && remaining > 0 ? AbortSignal.timeout(Math.max(remaining, 1)) : undefined;
      const res = await fetcher(`${previewUrl}${READY_PATH}`, { headers: { accept: 'text/plain' }, redirect: 'manual', signal });
      seen.add(res.status);
      if (!isNotYetUp(res.status)) {
        log(`Functions 준비 확인: ${attempts}번째 시도(${now() - startedAt}ms 경과)에서 응답 ${res.status}`);
        return 'ready';
      }
      // 404·503은 '아직 안 뜬' 신호 — 다음 시도로 넘긴다.
      log(`Functions 준비 대기: ${attempts}번째 시도(${now() - startedAt}ms 경과) 응답 ${res.status} — 아직 안 뜬 것으로 보고 더 기다린다`);
    } catch (error) {
      log(`Functions 준비 확인 오류: ${String(error.message || error).slice(0, 80)}`);
    }
    if (now() >= deadline) break;
    await sleep(intervalMs);
  }
  const saw = [...seen].sort().join('·') || '응답 없음';
  log(`Functions 준비 확인 실패: ${attempts}번 시도(${now() - startedAt}ms 경과)했지만 Functions가 응답하지 않았다(본 응답: ${saw}) — 환경 준비 안 됨`);
  return 'cold';
}
