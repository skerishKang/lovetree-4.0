// 미리보기 배포는 정적 자산이 먼저 열리고 /api/* Functions는 잠시 뒤 붙는다(#337 실측:
// 배포 직후 검사에서 /api/community/shares·/api/youtube/oembed가 404, 같은 배포가 수십 분 뒤 503).
// 그 404 창에 검사가 들어가면 예외 목록으로도 넘기지 못하는 진짜 실패가 된다. 그래서 미리보기 주소를
// 찾은 뒤 허용 목록 안 경로 하나(/api/account)가 404가 아닌 응답(401 등)을 줄 때까지 짧게 기다린다.
// 404를 성공으로 세지 않는다 — 허용 목록에서 404를 넘기면 진짜 고장을 가린다(2026-11-09 CTO 결정).
//
// #496(2026-11-13): 503도 **아직 안 뜬 것**으로 본다. 예전에는 "404가 아니면 준비됨"이라 배포 직후의
// 503을 준비 완료로 읽었고, 그 상태로 채점에 들어가 환경 문제와 제품 결함이 같은 빨강이 됐다.
// #493 실패 2건(e102493·9a1488a)이 정확히 그 모양이었다 — "1번째 시도에서 응답 503" 뒤 채점.
//
// 상태 셋으로 답한다(호출자가 요약에 나눠 적는다):
//   'ready'  — Functions가 응답한다(401·403·200 등). 채점해도 된다.
//   'cold'   — 기한 안에 404/503만 봤다(또는 계속 오류). **환경 준비 안 됨**이지 제품 결함이 아니다.
//   null     — 주소가 없어 확인할 것도 없다.
// 시간이 넘으면 검사를 막지 않고 지금처럼 진행한다. 호출자가 요약에 한 줄을 남긴다.
export const READY_TIMEOUT_MS = 60_000;
export const READY_INTERVAL_MS = 3000;

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
      const res = await fetcher(`${previewUrl}/api/account`, { headers: { accept: 'application/json' }, redirect: 'manual', signal });
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
  log(`Functions 준비 확인 실패: ${attempts}번 시도(${now() - startedAt}ms 경과)했지만 /api/account가 응답하지 않았다(본 응답: ${saw}) — 환경 준비 안 됨`);
  return 'cold';
}
