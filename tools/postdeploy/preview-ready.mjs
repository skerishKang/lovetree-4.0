// 미리보기 배포는 정적 자산이 먼저 열리고 /api/* Functions는 잠시 뒤 붙는다(#337 실측:
// 배포 직후 검사에서 /api/community/shares·/api/youtube/oembed가 404, 같은 배포가 수십 분 뒤 503).
// 그 404 창에 검사가 들어가면 예외 목록으로도 넘기지 못하는 진짜 실패가 된다. 그래서 미리보기 주소를
// 찾은 뒤 허용 목록 안 경로 하나(/api/account)가 404가 아닌 응답(401·503 등)을 줄 때까지 짧게 기다린다.
// 404를 성공으로 세지 않는다 — 허용 목록에서 404를 넘기면 진짜 고장을 가린다(2026-11-09 CTO 결정).
// 시간이 넘으면 검사를 막지 않고 지금처럼 진행한다. 호출자가 요약에 한 줄을 남긴다.
export const READY_TIMEOUT_MS = 60_000;
export const READY_INTERVAL_MS = 3000;

export async function functionsReady(previewUrl, { fetcher = (...args) => fetch(...args), timeoutMs = READY_TIMEOUT_MS, intervalMs = READY_INTERVAL_MS, log = () => {} } = {}) {
  if (!previewUrl) return null; // 주소가 없으면 확인할 것도 없다. 호출자가 그대로 진행한다.
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  while (true) {
    attempts += 1;
    try {
      // 한 번의 요청이 멈춰도 기한을 넘기지 않도록 남은 기한만큼 상한을 둔다.
      const remaining = deadline - Date.now();
      const signal = typeof AbortSignal?.timeout === 'function' && remaining > 0 ? AbortSignal.timeout(Math.max(remaining, 1)) : undefined;
      const res = await fetcher(`${previewUrl}/api/account`, { headers: { accept: 'application/json' }, redirect: 'manual', signal });
      if (res.status !== 404) {
        log(`Functions 준비 확인: ${attempts}번째 시도(${Date.now() - startedAt}ms 경과)에서 응답 ${res.status}`);
        return true;
      }
    } catch (error) {
      log(`Functions 준비 확인 오류: ${String(error.message || error).slice(0, 80)}`);
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  log(`Functions 준비 확인 실패: ${attempts}번 시도(${Date.now() - startedAt}ms 경과)했지만 /api/account가 404가 아닌 응답을 주지 않았다`);
  return false;
}
