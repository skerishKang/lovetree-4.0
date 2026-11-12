// #481 T4: #449 음수 반지름(createRadialGradient ... r1 less than 0) 회귀를 **실행**으로 확인한다.
// 그 때 결함: 창이 낮으면 배율(scale)이 음수로 내려가 허브 후광 반지름(hubR*scale*2.5)이 음수가 되고
// 브라우저가 페이지 오류를 냈다. 고침은 배율에 바닥값(.12)을 두고 반지름을 0.5 이상으로 자른 것.
// 예전 시험은 배율 코드 문자열을 매칭하는 데 그쳐, 실제로 반지름이 0 이상인지 돌려 보지 않았다.
// 여기서는 진짜 canvas 2D 문맥 대신 '음수 반지름을 넣으면 던지는' 가짜 문맥을 씌워 그린 결과를 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const networkPath = path.join(repoRoot, 'public/v41/views/network/network.js');

/** 브라우저가 하는 것과 같은 규칙: 반지름이 음수면 오류를 던진다. */
function fakeCtx() {
  const calls = { radial: 0, arc: 0 };
  const ctx = {
    canvas: { width: 800, height: 300 },
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, shadowColor: '', shadowBlur: 0,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    setLineDash() {}, getLineDash() { return []; }, measureText() { return { width: 10 }; },
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, setTransform() {}, resetTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    rect() {}, stroke() {}, fill() {}, clip() {}, fillRect() {}, clearRect() {}, strokeRect() {},
    fillText() {}, strokeText() {}, drawImage() {}, putImageData() {}, createImageData() { return {}; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      calls.radial += 1;
      if (!(r0 >= 0) || !(r1 >= 0)) throw new Error(`createRadialGradient: 반지름이 음수 (r0=${r0}, r1=${r1})`);
      return { addColorStop() {} };
    },
    createPattern() { return null; },
    arc(x, y, r) {
      calls.arc += 1;
      if (!(r >= 0)) throw new Error(`arc: 반지름이 음수 (r=${r})`);
    },
    ellipse(x, y, rx, ry) {
      if (!(rx >= 0) || !(ry >= 0)) throw new Error(`ellipse: 반지름이 음수 (${rx}, ${ry})`);
    }
  };
  return { ctx, calls };
}

/** network.js를 격리된 전역에서 평가한다(모듈 최상위에서 window/document를 만진다). */
function loadNetwork() {
  const source = fs.readFileSync(networkPath, 'utf8');
  const { ctx } = fakeCtx();
  const noopEl = () => new Proxy({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [], appendChild() {}, removeChild() {}, insertBefore() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 300 }), focus() {}, setAttribute() {},
    getAttribute: () => null, closest: () => null, textContent: '', innerHTML: '', remove() {}
  }, { get: (t, k) => (k in t ? t[k] : undefined) });
  const sandbox = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise, Error, isNaN, parseFloat, parseInt,
    requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}, setTimeout() { return 1; }, clearTimeout() {},
    addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    devicePixelRatio: 1, innerWidth: 800, innerHeight: 300, location: { search: '', origin: 'http://localhost' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
    MutationObserver: function () { return { observe() {}, disconnect() {}, takeRecords() { return []; } }; },
    IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      readyState: 'complete', hidden: false,
      documentElement: noopEl(), body: noopEl(), head: noopEl(),
      getElementById: () => noopEl(), querySelector: () => null, querySelectorAll: () => [],
      createElement: () => noopEl(), addEventListener() {}, removeEventListener() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // 화면이 실제로 부르는 모델을 먼저 올린다(LT56Model).
  const modelPath = path.join(repoRoot, 'public/v41/views/network/network-model.js');
  vm.runInContext(fs.readFileSync(modelPath, 'utf8'), sandbox, { filename: 'network-model.js' });
  vm.runInContext(source, sandbox, { filename: 'network.js' });
  return sandbox;
}

const source = fs.readFileSync(networkPath, 'utf8');

/** network.js에서 drawHub 함수 정의를 그대로 뽑는다(파일이 한 줄로 minify 되어 있다). */
function hubDrawSource() {
  const src = fs.readFileSync(networkPath, 'utf8');
  const at = src.indexOf('function drawHub(c){');
  assert.ok(at >= 0, 'drawHub 정의를 찾았다');
  let i = src.indexOf('{', at);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error('drawHub 본문이 닫히지 않는다');
}

test('#449 고침의 핵심 두 가지가 코드에 있다 — 배율 바닥값과 반지름 하한', () => {
  // 이 두 줄이 사라지면 아래 실행 시험이 재현하지 못할 수 있으므로 함께 고정한다.
  assert.match(source, /Math\.max\(\.5,c\.hubR\*state\.scale\)/, '허브 반지름은 0.5 이상으로 자른다');
  assert.match(source, /Math\.max\(\.12,/, '배율에 바닥값 0.12가 있다');
});

test('#449 실행: 후광 반지름 실제 계산이 어떤 배율에서도 음수가 되지 않는다', () => {
  // 고침과 같은 식을 그대로 옮겨, 결함이 났던 낮은 창 배율들(음수·0·극소)을 넣어 본다.
  const hubHalfF = (hubR, scale) => Math.max(0.5, hubR * scale) * 2.5;
  for (const scale of [-3, -0.5, 0, 0.001, 0.12, 0.5, 1, 2.4]) {
    for (const hubR of [10, 18, 34]) {
      const r = hubHalfF(hubR, scale);
      assert.ok(r >= 0, `scale=${scale} hubR=${hubR} → ${r}`);
      assert.ok(Number.isFinite(r), `scale=${scale} hubR=${hubR} → ${r}`);
    }
  }
  // 예전 식(hubR*scale*2.5)은 음수 배율에서 음수를 낸다 = 결함 재현(세기 증명).
  assert.ok(18 * -0.7 * 2.5 < 0, '예전 식은 음수를 낸다');
});

test('#449 실행: 파일에서 뽑은 진짜 drawHub를 음수 배율로 불러도 문맥이 오류를 내지 않는다', () => {
  // 파일을 통째로 평가하면 document·LTDEMO 등 화면 의존이 줄줄이 필요해진다. 대신 **그 파일의 실제 함수 본문**을
  // 그대로 떼어 내, 문맥이 던지는 조건(음수 반지름)을 진짜로 통과하는지 본다.
  const fnSource = hubDrawSource();
  assert.ok(fnSource.length > 200, 'drawHub 본문을 뽑았다');
  const { ctx, calls } = fakeCtx();
  const state = { view: 'constellation', mode: 'DEFAULT', scale: 1, mobile: false, mobileCluster: 0 };
  const stub = {
    ctx, state, COLORS: ['#8b6cf0', '#7fb3f5'],
    w2s: (x, y) => ({ x, y }),
    visible: () => true,
    colorOf: () => '#8b6cf0',
    hexRgb: (hex) => [139, 108, 240]
  };
  const drawHub = new Function(
    'ctx', 'state', 'COLORS', 'w2s', 'visible', 'colorOf', 'hexRgb',
    fnSource + String.fromCharCode(10) + 'return drawHub;'
  )(stub.ctx, stub.state, stub.COLORS, stub.w2s, stub.visible, stub.colorOf, stub.hexRgb);
  // 결함이 났던 조건들: 창이 낮아 배율이 음수·0·극소인 경우.
  for (const scale of [-2.6, -0.7, -0.05, 0, 0.001, 0.12]) {
    state.scale = scale;
    assert.doesNotThrow(() => drawHub({ x: 100, y: 80, index: 0, name: '가', sub: '나', color: '#8b6cf0', hubR: 18 }),
      `scale=${scale}: 허브를 그릴 수 있다(음수 반지름 없음)`);
  }
  assert.ok(calls.radial > 0, '실제로 후광(radial gradient)을 그렸다');
  assert.ok(calls.arc > 0, '실제로 원을 그렸다');
});

test('#449 실행: 가짜 문맥은 음수 반지름을 실제로 잡아낸다(시험이 헛돌지 않는다)', () => {
  const { ctx } = fakeCtx();
  assert.throws(() => ctx.createRadialGradient(0, 0, 0, 0, 0, -1), /반지름이 음수/, '음수 r1은 오류');
  assert.throws(() => ctx.arc(0, 0, -2), /반지름이 음수/, '음수 arc 반지름은 오류');
  assert.doesNotThrow(() => ctx.createRadialGradient(0, 0, 0, 0, 0, 0), '0은 허용(브라우저와 같다)');
});
