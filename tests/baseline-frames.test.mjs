// #1469: 화면 판 모양 기준선 다시 뽑기 도구(tools/baseline-frames.mjs)의 판단을 확인한다.
// 서버·브라우저는 띄우지 않는다 — 기준선 파일에서 거꾸로 가짜 관측 보고(36조건)를 만들어 plan에 넣는다.
// 지키는 것: 두 관측이 같고 바뀐 값이 없으면 쓰지 않는다 · 두 관측에서 같이 바뀐 값만 적는다 ·
//   한쪽 관측만 다르면 실패하고 텍스트를 내지 않는다 · 테마·폭·화면 사이 일관성 검사는 그대로 있다.
// 사용법은 docs/TESTING.md '화면 판 모양 기준선 다시 뽑기'에 적었다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffLeaves, deriveScreens, plan, replaceValues } from '../tools/baseline-frames.mjs';

const oldText = readFileSync(new URL('./fixtures/frame-observation-baseline.json', import.meta.url), 'utf8');
const old = JSON.parse(oldText);
const WIDTHS = ['390', '1440'];
const THEMES = ['night', 'garden'];
const HEAD = 'c0ffee000000000000000000000000000000c0ffee';
const clone = value => JSON.parse(JSON.stringify(value));
const rowOf = (report, id, width, theme) =>
  report.screens.find(r => r.screen === id && r.viewport.width === width && r.theme === theme);

// 기준선의 판 모양 값으로 관측 보고의 요소 노드 하나를 만든다.
function box(style, width, theme) {
  const color = style.borderColor[theme];
  return {
    padding: clone(style.padding[width]),
    borderWidth: [...style.borderWidth],
    borderStyle: [...style.borderStyle],
    borderColor: [color, color, color, color],
    borderRadius: [...style.borderRadius[width]],
    boxShadow: style.boxShadow,
    background: style.background[theme].background,
    backgroundImage: style.background[theme].backgroundImage
  };
}

// 기준선에서 관측 보고(metrics.json)를 거꾸로 만든다. 조건 수는 9화면 × 2폭 × 2테마 = 36개다.
function fakeReport(baseline) {
  const screens = [];
  for (const [id, group] of Object.entries(baseline.screenGroups)) {
    const b = baseline.screens[group];
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const scroll = b.scroll[id];
        const cut = scroll.owner.indexOf(':');
        const toast = b.toast;
        screens.push({
          screen: id,
          theme,
          viewport: { ...baseline.viewports[width] },
          shell: {
            stage: { ...box(b.stage, width, theme), rect: { height: b.stage.height[width] } },
            frame: b.frame ? box(b.frame, width, theme) : null,
            panel: b.panel ? { ...box(b.panel, width, theme), open: b.panel.open } : null,
            backdrop: b.panel ? clone(b.panel.backdrop[theme]) : null,
            toast: toast
              ? {
                  rect: { height: toast.height[width] },
                  margin: [toast.margin[width].top, '0px', toast.margin[width].bottom, '0px'],
                  position: toast.position,
                  flex: toast.flex
                }
              : null,
            toastHidden: toast?.hidden,
            visitorIntro: toast?.visitorIntro,
            toastCenterDelta: toast ? 0.5 : null,
            toastHorizontalOverflow: toast?.horizontalOverflow,
            toastWithinViewport: toast?.withinViewport
          },
          scroll: {
            owner: {
              owner: scroll.owner.slice(0, cut),
              id: scroll.owner.slice(cut + 1),
              overflowY: scroll.overflowY[width]
            },
            shellDocumentScrollable: false,
            frameDocumentScrollable: scroll.frameDocumentScrollable[width]
          }
        });
      }
    }
  }
  return { basis: '가짜 관측', fakeSession: true, errors: [], screens };
}

test('#1469 기준선에서 거꾸로 만든 가짜 관측은 다시 기준선과 같다 — 테두리 색·배경은 테마마다 달라도 된다', () => {
  const frame = old.screens.iframe.frame;
  assert.equal(fakeReport(old).screens.length, 36);
  assert.notEqual(frame.borderColor.night, frame.borderColor.garden);
  assert.notEqual(
    old.screens.iframe.stage.background.night.background,
    old.screens.iframe.stage.background.garden.background
  );
  assert.deepEqual(deriveScreens(fakeReport(old), old).screens, old.screens);
});

test('#1469 두 관측이 같고 바뀐 값이 없으면 쓰지 않는다 — 텍스트·기준 커밋 그대로', () => {
  const result = plan({
    oldText,
    metricsA: fakeReport(old),
    metricsB: fakeReport(old),
    runsEqual: true,
    basis: HEAD
  });
  assert.equal(result.status, 'unchanged');
  assert.deepEqual(result.changed, []);
  assert.equal(result.text, oldText);
  assert.equal(JSON.parse(result.text).basis, old.basis);
});

test('#1469 두 관측에서 같이 바뀐 값은 항목 1건이고, 그 값 줄과 기준 커밋 줄만 바뀐다', () => {
  const raiseHomeStage = report => {
    for (const theme of THEMES) rowOf(report, 'home', 1440, theme).shell.stage.rect.height = 836;
  };
  const before = old.screens.home.stage.height['1440'];
  const first = fakeReport(old);
  const second = fakeReport(old);
  raiseHomeStage(first);
  raiseHomeStage(second);
  const result = plan({ oldText, metricsA: first, metricsB: second, runsEqual: true, basis: HEAD });
  assert.equal(result.status, 'changed');
  assert.deepEqual(result.changed, [{ path: 'screens/home/stage/height/1440', a: before, b: 836 }]);
  const next = JSON.parse(result.text);
  assert.equal(next.basis, HEAD);
  assert.deepEqual(next.screens.home.stage.height, {
    '390': old.screens.home.stage.height['390'],
    '1440': 836
  });
  // 들여쓰기·줄 바꿈은 그대로다. 달라진 줄은 기준 커밋 줄과 높이 줄 두 개뿐이다.
  const beforeLines = oldText.split('\n');
  const afterLines = result.text.split('\n');
  assert.equal(afterLines.length, beforeLines.length);
  const moved = afterLines.flatMap((line, i) => (line === beforeLines[i] ? [] : [[beforeLines[i], line]]));
  assert.equal(moved.length, 2);
  const [[oldBasisLine, newBasisLine], [oldHeightLine, newHeightLine]] = moved;
  assert.equal(newBasisLine, oldBasisLine.replace(old.basis, HEAD));
  assert.equal(newHeightLine, oldHeightLine.replace(String(before), '836'));
});

test('#1469 한쪽 관측만 다르면 실패로 끝나고 텍스트를 내지 않는다', () => {
  // 책장·책·보드·지도·트리가 함께 쓰는 판 모서리(390)를 한쪽 관측에서만 바꾼다.
  const widenIframeFrame = report => {
    for (const r of report.screens) {
      if (old.screenGroups[r.screen] === 'iframe' && r.viewport.width === 390) {
        r.shell.frame.borderRadius = ['13px', '13px', '13px', '13px'];
      }
    }
  };
  const first = fakeReport(old);
  widenIframeFrame(first);
  const result = plan({
    oldText,
    metricsA: first,
    metricsB: fakeReport(old),
    runsEqual: false,
    basis: HEAD
  });
  assert.equal(result.status, 'runs-differ');
  // 배열 값은 원소마다 한 항목으로 나온다.
  assert.deepEqual(
    result.runsDiff,
    old.screens.iframe.frame.borderRadius['390'].map((value, i) => ({
      path: `iframe/frame/borderRadius/390/${i}`,
      a: '13px',
      b: value
    }))
  );
  assert.equal(result.text, null);
  assert.deepEqual(result.changed, []);

  // 관측값 파일의 해시만 다르고 기준선 값이 같을 때도 쓰지 않는다.
  const sameValues = plan({
    oldText,
    metricsA: fakeReport(old),
    metricsB: fakeReport(old),
    runsEqual: false,
    basis: HEAD
  });
  assert.equal(sameValues.status, 'runs-differ');
  assert.deepEqual(sameValues.runsDiff, []);
  assert.equal(sameValues.text, null);

  // 한쪽 관측 안에서 조건 사이 값이 어긋나면 그 사실을 알려 주고 역시 쓰지 않는다.
  const shaky = fakeReport(old);
  rowOf(shaky, 'book', 390, 'garden').shell.frame.borderRadius = ['13px', '13px', '13px', '13px'];
  const broken = plan({
    oldText,
    metricsA: shaky,
    metricsB: fakeReport(old),
    runsEqual: false,
    basis: HEAD
  });
  assert.equal(broken.status, 'runs-differ');
  assert.equal(broken.text, null);
  assert.ok(
    broken.deriveErrors.some(message => /radius\(테마\)/.test(message)),
    JSON.stringify(broken.deriveErrors)
  );
});

test('#1469 두 관측이 같아도 테마·화면 사이에 같아야 할 값이 다르면 실패한다', () => {
  const acrossScreens = fakeReport(old);
  for (const theme of THEMES) {
    rowOf(acrossScreens, 'book', 390, theme).shell.frame.borderRadius = ['13px', '13px', '13px', '13px'];
  }
  assert.throws(
    () =>
      plan({
        oldText,
        metricsA: clone(acrossScreens),
        metricsB: clone(acrossScreens),
        runsEqual: true,
        basis: HEAD
      }),
    /iframe\(화면 간\)/
  );

  const acrossThemes = fakeReport(old);
  rowOf(acrossThemes, 'book', 390, 'night').shell.frame.padding = ['1px', '1px', '1px', '1px'];
  assert.throws(
    () =>
      plan({
        oldText,
        metricsA: clone(acrossThemes),
        metricsB: clone(acrossThemes),
        runsEqual: true,
        basis: HEAD
      }),
    /padding\(테마\)/
  );
});

test('#1469 기준선 구조가 달라지면 바꿔 끼우지 않고, 구조 차이는 한 항목으로 표시한다', () => {
  const next = {
    basis: HEAD,
    viewports: old.viewports,
    screenGroups: old.screenGroups,
    screens: deriveScreens(fakeReport(old), old).screens
  };
  assert.equal(typeof replaceValues(oldText, next), 'string');
  const withExtraKey = clone(next);
  withExtraKey.screens.iframe.extra = { note: '새 키' };
  assert.equal(replaceValues(oldText, withExtraKey), null);

  assert.deepEqual(diffLeaves({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } }), [{ path: 'b/c', a: 2, b: 3 }]);
  const structure = diffLeaves({ a: [1] }, { a: { b: 1 } });
  assert.equal(structure.length, 1);
  assert.match(structure[0].a, /^\(구조\)/);
});
