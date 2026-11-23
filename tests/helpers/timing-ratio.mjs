// 시간 시험 도우미 — 절대 ms 한도는 기계마다 흔들린다(#728 CI windows 러너에서 50ms 한도가 88.5ms로 실패, #731).
// 같은 실행에서 작은 입력과 큰 입력을 충분히 예열한 뒤 여러 번 묶어 재고, 중앙값으로 비율을 판정한다.
// 시험이 지키려는 것: 큰 입력이 작은 입력에 비해 제곱으로 느려지지 않는 것(선형이면 비율은 10배 안팎).
export const TIMING_RATIO_LIMIT = 25; // 선형 10배 안팎에 대한 여유 — 제곱(100배 이상)은 확실히 잡는다.
export const TIMING_CEILING_MS = 250; // 2차 방벽 — 평소 값(20ms 안팎)의 10배 이상 느려진 큰 되돌림을 따로 잡는다.

export const TIMING_RUNS = 9; // 회당 9회 — 한 번의 튐이 중앙값을 흔들지 못하게 한다.
export const TIMING_MIN_MS = 20; // 묶음 하나가 이보다 짧으면 같은 계산을 여러 번 묶어 재서 시계 해상도와 예열 비용을 피한다.
const MAX_REPEAT = 4000;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function repeatOf(fn, minMs) {
  fn(); // 예열 — 모듈 적재·JIT 준비 시간은 재지 않는다
  const started = performance.now();
  fn();
  const oneMs = Math.max(performance.now() - started, 0.001);
  return Math.max(1, Math.min(MAX_REPEAT, Math.ceil(minMs / oneMs)));
}

function measure(fn, repeat) {
  const started = performance.now();
  let last;
  for (let index = 0; index < repeat; index += 1) last = fn();
  return { ms: Math.max(0, performance.now() - started) / repeat, last };
}

export function timingRatio({ small, big, smallRuns = TIMING_RUNS, bigRuns = TIMING_RUNS, minMs = TIMING_MIN_MS }) {
  for (let i = 0; i < 3; i += 1) { small(); big(); } // 양쪽을 함께 여러 번 예열해 JIT 상태를 맞춘다
  const smallRepeat = repeatOf(small, minMs);
  const bigRepeat = repeatOf(big, minMs);
  const smallTimes = [], bigTimes = [], ratios = [];
  let lastSmall, lastBig;
  for (let run = 0; run < Math.max(smallRuns, bigRuns); run += 1) {
    // 순서를 번갈아 잡아 한쪽에만 몰리는 GC·스케줄 흔들림을 나눠 갖는다.
    const first = run % 2 === 0 ? measure(small, smallRepeat) : null;
    const second = measure(big, bigRepeat);
    const last = first || measure(small, smallRepeat);
    const s = first ? first : last;
    const b = second;
    smallTimes.push(s.ms); bigTimes.push(b.ms); ratios.push(b.ms / Math.max(s.ms, 0.000001));
    lastSmall = s.last; lastBig = b.last;
  }
  return {
    smallMs: median(smallTimes), bigMs: median(bigTimes), ratio: median(ratios),
    last: lastBig, lastSmall, smallRepeat, bigRepeat
  };
}

// 시간과 무관한 보조 계측: 입력 순간을 읽는 횟수를 센다. 선형이면 약 10배, 제곱이면 약 100배다.
// 시험은 이 값에도 같은 한도를 적용해, 러너가 바쁜 날의 시간 흔들림과 별개로 '제곱 아님'을 확인한다.
export function countIterations(fn, list) {
  let count = 0;
  const proxy = new Proxy(list, {
    get(target, prop, receiver) {
      if (prop === Symbol.iterator) {
        return function* () { for (const item of target) { count += 1; yield item; } };
      }
      if (typeof prop === 'string' && /^(0|[1-9]\d*)$/.test(prop) && Number(prop) < target.length) count += 1;
      return Reflect.get(target, prop, receiver);
    }
  });
  const last = fn(proxy);
  return { count, last };
}

export function countRatio({ small, big }) {
  const s = countIterations(small.fn, small.list);
  const b = countIterations(big.fn, big.list);
  return { smallCount: s.count, bigCount: b.count, ratio: b.count / Math.max(1, s.count), last: b.last, lastSmall: s.last };
}
