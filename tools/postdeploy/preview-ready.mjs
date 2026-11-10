// 미리보기 배포는 정적 자산이 먼저 열리고 /api/* Functions는 잠시 뒤 붙는다(#337 실측:
// 배포 직후 검사에서 /api/community/shares·/api/youtube/oembed가 404, 같은 배포가 수십 분 뒤 503).
// 그 404 창에 검사가 들어가면 예외 목록으로도 넘기지 못하는 진짜 실패가 된다. 그래서 미리보기 주소를
// 찾은 뒤 허용 목록 안 경로 하나(/api/account)가 404가 아닌 응답(401·503 등)을 줄 때까지 짧게 기다린다.
// 404를 성공으로 세지 않는다 — 허용 목록에서 404를 넘기면 진짜 고장을 가린다(2026-11-09 CTO 결정).
// 시간이 넘으면 검사를 막지 않고 지금처럼 진행한다. 호출자가 요약에 한 줄을 남긴다.
export const READY_TIMEOUT_MS = 60_000;
export const READY_INTERVAL_MS = 3000;

// 시계·잠자는 함수는 넣어 바꿀 수 있다(기본값은 실제 시계·실제 setTimeout). 검사가 실제 시간에
// 기대지 않고 기한 경계를 결정적으로 밟을 수 있게 하려는 주입 지점일 뿐, 기본 동작은 같다.
const realNow = () => Date.now();
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function functionsReady(previewUrl, { fetcher = (...args) => fetch(...args), timeoutMs = READY_TIMEOUT_MS, intervalMs = READY_INTERVAL_MS, log = () => {}, now = realNow, sleep = realSleep } = {}) {
  if (!previewUrl) return null; // 주소가 없으면 확인할 것도 없다. 호출자가 그대로 진행한다.
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
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
      if (res.status !== 404) {
        log(`Functions 준비 확인: ${attempts}번째 시도(${now() - startedAt}ms 경과)에서 응답 ${res.status}`);
        return true;
      }
    } catch (error) {
      log(`Functions 준비 확인 오류: ${String(error.message || error).slice(0, 80)}`);
    }
    if (now() >= deadline) break;
    await sleep(intervalMs);
  }
  log(`Functions 준비 확인 실패: ${attempts}번 시도(${now() - startedAt}ms 경과)했지만 /api/account가 404가 아닌 응답을 주지 않았다`);
  return false;
}
