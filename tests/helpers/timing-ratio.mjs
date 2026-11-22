// 시간 시험 도우미 — 절대 ms 한도는 기계마다 흔들린다(#728 CI windows 러너에서 50ms 한도가 88.5ms로 실패, #731).
// 같은 실행에서 작은 입력과 큰 입력을 각각 예열 1회 뒤 여러 번 재어 최선값을 내고, 비율로 판정하게 돕는다.
// 시험이 지키려는 것: 큰 입력이 작은 입력에 비해 제곱으로 느려지지 않는 것(선형이면 비율은 10배 안팎).
export const TIMING_RATIO_LIMIT = 25; // 선형 10배 안팎에 대한 여유 — 제곱(100배 이상)은 확실히 잡는다.
export const TIMING_CEILING_MS = 250; // 2차 방벽 — 평소 값(20ms 안팎)의 10배 이상 느려진 큰 되돌림을 따로 잡는다.

export const TIMING_RUNS = 7; // 회당 7회 — 한 번의 튐이 중앙값을 흔들지 못하게 한다.
export const TIMING_MIN_MS = 4; // 묶음 하나가 이보다 짧으면 같은 계산을 여러 번 묶어 재서 시계 해상도를 피한다.

// 중앙값 7회. 작은 입력이 0.36ms처럼 짧아도 반복 묶음으로 4ms 이상 재므로 비율이 흔들리지 않는다.
// 가장 빠른 한 번(best-of)은 러너가 잠깐 쉬었을 때 0.1ms 아래로 내려가 비율을 25배 넘게 부풀렸다(#현재).
export function timingRatio({ small, big, smallRuns = TIMING_RUNS, bigRuns = TIMING_RUNS, minMs = TIMING_MIN_MS }) {
  small(); // 예열 1회 — 모듈 적재·JIT 준비 시간은 재지 않는다
  big();
  const measure = (fn, runs) => {
    const warm = performance.now();
    fn();
    const oneMs = Math.max(performance.now() - warm, 0.001);
    const repeat = Math.max(1, Math.min(500, Math.ceil(minMs / oneMs)));
    const times = [];
    let last;
    for (let run = 0; run < runs; run += 1) {
      const started = performance.now();
      for (let index = 0; index < repeat; index += 1) last = fn();
      times.push((performance.now() - started) / repeat);
    }
    times.sort((a, b) => a - b);
    return { ms: times[Math.floor(times.length / 2)], last, repeat };
  };
  const s = measure(small, smallRuns);
  const b = measure(big, bigRuns);
  return { smallMs: s.ms, bigMs: b.ms, ratio: b.ms / s.ms, last: b.last, smallRepeat: s.repeat, bigRepeat: b.repeat };
}
