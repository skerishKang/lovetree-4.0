// 시간 시험 도우미 — 절대 ms 한도는 기계마다 흔들린다(#728 CI windows 러너에서 50ms 한도가 88.5ms로 실패, #731).
// 같은 실행에서 작은 입력과 큰 입력을 각각 예열 1회 뒤 여러 번 재어 최선값을 내고, 비율로 판정하게 돕는다.
// 시험이 지키려는 것: 큰 입력이 작은 입력에 비해 제곱으로 느려지지 않는 것(선형이면 비율은 10배 안팎).
export const TIMING_RATIO_LIMIT = 25; // 선형 10배 안팎에 대한 여유 — 제곱(100배 이상)은 확실히 잡는다.
export const TIMING_CEILING_MS = 250; // 2차 방벽 — 평소 값(20ms 안팎)의 10배 이상 느려진 큰 되돌림을 따로 잡는다.

export function timingRatio({ small, big, smallRuns = 15, bigRuns = 7 }) {
  small(); // 예열 1회 — 모듈 적재·JIT 준비 시간은 재지 않는다
  big();
  const bestOf = (fn, runs) => {
    let best = Infinity;
    let last;
    for (let run = 0; run < runs; run += 1) {
      const started = performance.now();
      last = fn();
      best = Math.min(best, performance.now() - started); // 여러 번 중 가장 빠른 값 — 기계가 느려도 흔들리지 않게
    }
    return { best, last };
  };
  const smallMs = bestOf(small, smallRuns).best;
  const { best: bigMs, last } = bestOf(big, bigRuns);
  return { smallMs, bigMs, ratio: bigMs / smallMs, last };
}
