#!/usr/bin/env node
// #1469(#1436 후속): 화면 판 모양 관측 기준선(tests/fixtures/frame-observation-baseline.json)을 다시 뽑는다.
// 사용: npm run baseline:frames   (1~2분, 포트 4401, 창 뜨는 브라우저 없음)
// 하는 일: CI 화면 잡과 같은 빌드(vite build) → 36조건(9화면 × 390·1440 × 밤·정원) 헤드리스 관측 두 번
//   → 두 관측값 파일의 SHA-256이 같을 때만 이전 기준선과 비교 → 바뀐 값이 있을 때만 기준선 파일을 갱신한다.
// 두 관측이 다르면 파일을 쓰지 않고 실패로 끝난다. 바뀐 값이 없으면 파일을 건드리지 않는다(기준 커밋도 그대로).
// 값은 두 관측에서만 온다. 기존 기준선 파일에서 가져오는 것은 구조(화면 묶음·뷰포트)와 허용 오차뿐이다.
// 관측은 비교 시험(tests/v41-screen-audit.test.mjs)과 같은 도우미·같은 포트를 쓴다.
// 언제 다시 뽑는지·PR 본문에 무엇을 적는지는 docs/TESTING.md '화면 판 모양 기준선 다시 뽑기'에 적었다.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'fixtures', 'frame-observation-baseline.json');
const OUTPUT = join(ROOT, 'test-results', 'v41-frame-observation');
// 비교 시험과 같은 포트다. 임의 포트가 Chromium이 막는 5061을 받아 실패한 적 있다(#1420).
const PORT = 4401;
const WIDTHS = ['390', '1440'];
const THEMES = ['night', 'garden'];
const TIME_LIMIT_MS = 10 * 60 * 1000;

const round3 = n => Math.round(n * 1000) / 1000;
const show = value => JSON.stringify(value);
const must = (ok, message) => {
  if (!ok) throw new Error(message);
};
const same = (a, b, what) => {
  if (!isDeepStrictEqual(a, b)) throw new Error(`${what} 값이 다르다\n  ${show(a)}\n  ${show(b)}`);
};

// 관측 보고(metrics.json)에서 기준선의 screens 구조를 만든다. 조건 수·뷰포트·테마·폭 사이 일관성을 함께 검사한다.
export function deriveScreens(report, old, label = '관측') {
  must(report && Array.isArray(report.errors) && Array.isArray(report.screens), `${label}: 관측 보고 형식이 다르다`);
  must(report.errors.length === 0, `${label}: 관측 중 화면 오류 ${report.errors.length}건 — ${report.errors.join(' | ')}`);
  const rows = new Map();
  for (const r of report.screens) {
    const key = `${r.viewport.width}/${r.theme}/${r.screen}`;
    must(!rows.has(key), `${label}: 중복 조건 ${key}`);
    must(r.scroll.shellDocumentScrollable === false, `${label}: ${key} 셸 문서가 스크롤 주인이다`);
    must(
      isDeepStrictEqual(r.viewport, old.viewports[r.viewport.width]),
      `${label}: ${key} 뷰포트가 다르다 ${show(r.viewport)}`
    );
    rows.set(key, r);
  }
  const groupOf = old.screenGroups;
  const ids = Object.keys(groupOf);
  must(rows.size === ids.length * WIDTHS.length * THEMES.length, `${label}: 조건 수가 ${rows.size}개다`);
  const row = (id, w, t) => {
    const r = rows.get(`${w}/${t}/${id}`);
    must(r, `${label}: 조건 없음 ${w}/${t}/${id}`);
    return r;
  };

  const pick = (node, what) => {
    must(node, `${what} 요소가 없다`);
    must(
      node.borderColor.every(c => c === node.borderColor[0]),
      `${what} 네 변 테두리 색이 다르다 ${show(node.borderColor)}`
    );
    return {
      padding: node.padding,
      borderWidth: node.borderWidth,
      borderStyle: node.borderStyle,
      color: node.borderColor[0],
      radius: node.borderRadius,
      boxShadow: node.boxShadow,
      background: node.background,
      backgroundImage: node.backgroundImage
    };
  };
  const style = (get, what) => {
    const p = {};
    for (const w of WIDTHS) for (const t of THEMES) p[`${w}/${t}`] = pick(get(w, t), `${what} ${w}/${t}`);
    // 테두리 색·배경은 테마마다 다른 값이다(기준선이 night·garden을 따로 가진다). 테마와 무관해야 하는 항목만 본다.
    for (const w of WIDTHS) {
      const n = p[`${w}/night`];
      const g = p[`${w}/garden`];
      for (const k of ['padding', 'borderWidth', 'borderStyle', 'radius', 'boxShadow']) {
        same(n[k], g[k], `${what} ${w} ${k}(테마)`);
      }
    }
    // 모서리 반경·여백은 폭마다 다른 값이다. 폭과 무관해야 하는 항목만 본다.
    for (const t of THEMES) {
      for (const k of ['borderWidth', 'borderStyle', 'color', 'boxShadow', 'background', 'backgroundImage']) {
        same(p[`390/${t}`][k], p[`1440/${t}`][k], `${what} ${k}(폭)`);
      }
    }
    const n = p['390/night'];
    const garden = p['390/garden'];
    return {
      padding: { '390': n.padding, '1440': p['1440/night'].padding },
      borderWidth: n.borderWidth,
      borderStyle: n.borderStyle,
      borderColor: { night: n.color, garden: garden.color },
      borderRadius: { '390': n.radius, '1440': p['1440/night'].radius },
      boxShadow: n.boxShadow,
      background: {
        night: { background: n.background, backgroundImage: n.backgroundImage },
        garden: { background: garden.background, backgroundImage: garden.backgroundImage }
      }
    };
  };

  const groups = {};
  for (const id of ids) (groups[groupOf[id]] ||= []).push(id);
  const screens = {};
  const seen = { toastCenterDelta: 0 };
  for (const [g, members] of Object.entries(groups)) {
    const conditions = id => WIDTHS.flatMap(w => THEMES.map(t => row(id, w, t)));
    const stageStyles = members.map(id => style((w, t) => row(id, w, t).shell.stage, `${g}/${id} stage`));
    for (const s of stageStyles.slice(1)) same(s, stageStyles[0], `${g} stage(화면 간)`);
    const height = {};
    for (const w of WIDTHS) {
      const hs = members.flatMap(id => THEMES.map(t => row(id, w, t).shell.stage.rect.height));
      must(hs.every(h => Math.abs(h - hs[0]) <= 0.002), `${g} ${w} 무대 높이가 조건 간에 다르다 ${show(hs)}`);
      height[w] = round3(hs[0]);
    }
    const st = stageStyles[0];
    const out = {
      stage: {
        padding: st.padding,
        height,
        borderWidth: st.borderWidth,
        borderStyle: st.borderStyle,
        borderColor: st.borderColor,
        borderRadius: st.borderRadius,
        boxShadow: st.boxShadow,
        background: st.background
      }
    };

    const frameNodes = members.flatMap(conditions);
    const hasFrame = frameNodes.some(r => r.shell.frame);
    must(frameNodes.every(r => !!r.shell.frame === hasFrame), `${g} iframe 판 유무가 조건 간에 다르다`);
    if (hasFrame) {
      const fs = members.map(id => style((w, t) => row(id, w, t).shell.frame, `${g}/${id} iframe`));
      for (const s of fs.slice(1)) same(s, fs[0], `${g} iframe(화면 간)`);
      out.frame = fs[0];
    } else out.frame = null;

    const hasPanel = frameNodes.some(r => r.shell.panel);
    must(frameNodes.every(r => !!r.shell.panel === hasPanel), `${g} 셸 패널 유무가 조건 간에 다르다`);
    if (hasPanel) {
      const ps = members.map(id => style((w, t) => row(id, w, t).shell.panel, `${g}/${id} panel`));
      for (const s of ps.slice(1)) same(s, ps[0], `${g} panel(화면 간)`);
      const opens = frameNodes.map(r => r.shell.panel.open);
      must(opens.every(o => o === opens[0]), `${g} 패널 열림 상태가 다르다 ${show(opens)}`);
      const backdrop = {};
      for (const t of THEMES) {
        const bs = members.flatMap(id => WIDTHS.map(w => row(id, w, t).shell.backdrop));
        must(bs.every(Boolean), `${g} ${t} 패널 덮개가 없다`);
        for (const b of bs.slice(1)) same(b, bs[0], `${g} ${t} 덮개(조건 간)`);
        backdrop[t] = bs[0];
      }
      const p = ps[0];
      out.panel = {
        open: opens[0],
        padding: p.padding,
        borderWidth: p.borderWidth,
        borderStyle: p.borderStyle,
        borderColor: p.borderColor,
        borderRadius: p.borderRadius,
        boxShadow: p.boxShadow,
        background: p.background,
        backdrop
      };
    } else out.panel = null;

    out.scroll = {};
    for (const id of members) {
      let item;
      for (const t of THEMES) {
        const n = row(id, '390', t);
        const w = row(id, '1440', t);
        const now = {
          owner: `${n.scroll.owner?.owner}:${n.scroll.owner?.id}`,
          overflowY: { '390': n.scroll.owner?.overflowY ?? null, '1440': w.scroll.owner?.overflowY ?? null },
          frameDocumentScrollable: {
            '390': n.scroll.frameDocumentScrollable,
            '1440': w.scroll.frameDocumentScrollable
          }
        };
        if (t === 'night') item = now;
        else same(now, item, `${id} 스크롤(테마)`);
      }
      out.scroll[id] = item;
    }

    if (g === 'share-guest') {
      must(isDeepStrictEqual(members, ['share-guest']), '공유 방문자 책 묶음이 다르다');
      const all = conditions('share-guest').map(r => r.shell);
      for (const k of ['toastHidden', 'visitorIntro', 'toastHorizontalOverflow', 'toastWithinViewport']) {
        must(all.every(s => s[k] === all[0][k]), `공유 방문자 책 안내 ${k} 값이 조건 간에 다르다`);
      }
      for (const k of ['position', 'flex']) {
        must(all.every(s => s.toast[k] === all[0].toast[k]), `공유 방문자 책 안내 ${k} 값이 조건 간에 다르다`);
      }
      const first = all[0];
      const toast = {
        hidden: first.toastHidden,
        visitorIntro: first.visitorIntro,
        position: first.toast.position,
        flex: first.toast.flex,
        height: {},
        margin: {}
      };
      for (const w of WIDTHS) {
        const hs = THEMES.map(t => row('share-guest', w, t).shell.toast.rect.height);
        must(
          Math.abs(hs[0] - hs[1]) <= 0.002,
          `공유 방문자 책 안내 ${w} 높이가 테마마다 다르다 ${show(hs)}`
        );
        toast.height[w] = round3(hs[0]);
        const ms = THEMES.map(t => row('share-guest', w, t).shell.toast.margin);
        must(
          ms[0][0] === ms[1][0] && ms[0][2] === ms[1][2],
          `공유 방문자 책 안내 ${w} 세로 여백이 테마마다 다르다 ${show(ms)}`
        );
        toast.margin[w] = { top: ms[0][0], bottom: ms[0][2] };
      }
      // 좌우 여백 차이 허용치는 기준선의 상수를 그대로 쓴다(관측값이 아니다).
      toast.centeringTolerance = old.screens['share-guest'].toast.centeringTolerance;
      for (const s of all) {
        // 숨긴 예전 안내는 레이아웃이 없으므로 중심 정렬을 재지 않는다.
        if (!s.toastHidden) {
          must(Number.isFinite(s.toastCenterDelta), '공유 방문자 책 안내 좌우 여백 차이를 재지 못했다');
          seen.toastCenterDelta = Math.max(seen.toastCenterDelta, s.toastCenterDelta);
        }
        must(s.toastHorizontalOverflow === 0, `공유 방문자 책 안내 가로 넘침 ${s.toastHorizontalOverflow}`);
        must(s.toastWithinViewport === true, '공유 방문자 책 안내가 화면 밖으로 나갔다');
      }
      must(
        seen.toastCenterDelta <= toast.centeringTolerance,
        `공유 방문자 책 안내 좌우 여백 차이 ${seen.toastCenterDelta}px가 허용 ${toast.centeringTolerance}px를 넘는다`
      );
      toast.horizontalOverflow = first.toastHorizontalOverflow;
      toast.withinViewport = first.toastWithinViewport;
      out.toast = toast;
      out.stageShortfall = {};
      for (const w of WIDTHS) out.stageShortfall[w] = round3(screens.iframe.stage.height[w] - out.stage.height[w]);
    }
    screens[g] = out;
  }
  return { screens, seen };
}

// 잎 값만 모아 다른 곳을 찾는다. 키 집합이 다르면 '(구조)' 표시 한 줄로 끝낸다.
export function diffLeaves(a, b, path = [], out = []) {
  if (isDeepStrictEqual(a, b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (!isDeepStrictEqual(ka, kb)) {
      out.push({ path: path.join('/'), a: `(구조) ${show(ka)}`, b: `(구조) ${show(kb)}` });
      return out;
    }
    for (const k of ka) diffLeaves(a[k], b[k], path.concat(k), out);
    return out;
  }
  out.push({ path: path.join('/'), a, b });
  return out;
}

// 기존 파일의 들여쓰기·줄 바꿈을 그대로 두고 값만 바꾼 텍스트를 만든다.
// 키·배열 길이(구조)가 다르면 바꿔 끼울 수 없으므로 null을 돌려준다.
export function replaceValues(oldText, next) {
  const parsed = parseWithSpans(oldText);
  must(isDeepStrictEqual(parsed.root, JSON.parse(oldText)), '기존 기준선 텍스트를 다시 읽은 값이 기존 값과 다르다');
  const fresh = parseWithSpans(JSON.stringify(next));
  if (parsed.leaves.length !== fresh.leaves.length) return null;
  const edits = [];
  for (let k = 0; k < parsed.leaves.length; k++) {
    const p = parsed.leaves[k];
    const f = fresh.leaves[k];
    if (p.path !== f.path) return null;
    if (!Object.is(p.value, f.value)) edits.push({ start: p.start, end: p.end, after: f.value });
  }
  let text = oldText;
  for (const e of edits.sort((x, y) => y.start - x.start)) {
    text = text.slice(0, e.start) + JSON.stringify(e.after) + text.slice(e.end);
  }
  must(
    isDeepStrictEqual(JSON.parse(text), JSON.parse(JSON.stringify(next))),
    '바꾼 텍스트가 관측 값과 다르다'
  );
  return text;
}

// JSON 텍스트를 값과 함께 잎의 글자 위치도 읽는다(값만 바꿔 끼우는 데 쓴다).
function parseWithSpans(text) {
  let i = 0;
  const leaves = [];
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const str = () => {
    const s = i;
    i++;
    while (text[i] !== '"') {
      if (text[i] === '\\') i++;
      i++;
    }
    i++;
    return JSON.parse(text.slice(s, i));
  };
  const value = path => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      const o = {};
      if (text[i] === '}') {
        i++;
        return o;
      }
      for (;;) {
        ws();
        const k = str();
        ws();
        must(text[i] === ':', '객체 키 뒤에 콜론이 없다');
        i++;
        o[k] = value(path.concat(k));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        must(text[i] === '}', '객체 구분이 없다');
        i++;
        return o;
      }
    }
    if (c === '[') {
      i++;
      ws();
      const a = [];
      if (text[i] === ']') {
        i++;
        return a;
      }
      for (;;) {
        a.push(value(path.concat(String(a.length))));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        must(text[i] === ']', '배열 구분이 없다');
        i++;
        return a;
      }
    }
    if (c === '"') {
      const s = i;
      const v = str();
      leaves.push({ path: path.join('/'), start: s, end: i, value: v });
      return v;
    }
    const m = /^[^,}\]\s]+/.exec(text.slice(i));
    must(m, `값을 읽을 수 없다(위치 ${i})`);
    const raw = m[0];
    const v = JSON.parse(raw);
    i += raw.length;
    leaves.push({ path: path.join('/'), start: i - raw.length, end: i, value: v });
    return v;
  };
  return { root: value([]), leaves };
}

// 두 관측과 이전 기준선을 받아 무엇을 할지 정한다. 파일은 쓰지 않는다.
//   runs-differ  두 관측이 다르다 — 쓰지 않는다.
//   structure    기준선 구조(키·길이)가 달라져 값을 바꿔 끼울 수 없다 — 쓰지 않는다.
//   unchanged    바뀐 값이 없다 — 쓰지 않는다(기준 커밋도 그대로).
//   changed      바뀐 값이 있다 — text가 새 파일 내용이다(기준 커밋은 basis).
export function plan({ oldText, metricsA, metricsB, runsEqual, basis }) {
  const old = JSON.parse(oldText);
  const derive = (metrics, label) => {
    try {
      return { screens: deriveScreens(metrics, old, label).screens, error: null };
    } catch (error) {
      return { screens: null, error: error?.message ?? String(error) };
    }
  };
  const first = derive(metricsA, '관측 1');
  const second = derive(metricsB, '관측 2');
  if (!runsEqual) {
    // 어느 쪽이 틀렸는지는 따지지 않고 멈춘다. 둘 다 기준선 구조로 만들 수 있을 때만 차이를 보여준다.
    return {
      status: 'runs-differ',
      runsDiff: first.screens && second.screens ? diffLeaves(first.screens, second.screens) : [],
      deriveErrors: [first.error, second.error].filter(Boolean),
      changed: [],
      text: null,
      oldBasis: old.basis
    };
  }
  const deriveError = first.error ?? second.error;
  // 관측값 파일이 같은데 일관성 검사에 걸렸다 — 조건 사이 값이 흔들린 것이니 그대로 실패다.
  if (deriveError) throw new Error(deriveError);
  const runsDiff = diffLeaves(first.screens, second.screens);
  if (runsDiff.length) {
    return { status: 'runs-differ', runsDiff, deriveErrors: [], changed: [], text: null, oldBasis: old.basis };
  }
  const changed = diffLeaves(old.screens, first.screens).map(d => ({ ...d, path: `screens/${d.path}` }));
  if (!changed.length) return { status: 'unchanged', runsDiff, changed, text: oldText, oldBasis: old.basis };
  const text = replaceValues(oldText, {
    basis,
    viewports: old.viewports,
    screenGroups: old.screenGroups,
    screens: first.screens
  });
  if (text === null) return { status: 'structure', runsDiff, changed, text: null, oldBasis: old.basis };
  return { status: 'changed', runsDiff, changed, text, oldBasis: old.basis };
}

// 표는 PR 본문에 그대로 붙일 수 있게 마크다음으로 찍는다.
const cell = value => '`' + (typeof value === 'string' ? value : JSON.stringify(value)).replaceAll('|', '\\|') + '`';
function table(head, rows) {
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`]
    .concat(rows.map(r => `| ${r.join(' | ')} |`))
    .join('\n');
}
const rel = file => relative(ROOT, file).split('\\').join('/');
const elapsed = from => Math.round((Date.now() - from) / 1000);

// 커밋하지 않은 변경(기준선 파일 제외)이 있으면 관측된 코드가 기준 커밋과 다르다.
function uncommittedChanges() {
  const out = execFileSync(
    'git',
    ['status', '--porcelain', '--', '.', ':(exclude)tests/fixtures/frame-observation-baseline.json'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

// CI 화면 잡과 같은 빌드다(npx vite build가 부르는 같은 vite 명령 파일).
function build() {
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  must(existsSync(vite), 'node_modules/vite가 없다 — npm ci를 먼저 한다');
  const r = spawnSync(process.execPath, [vite, 'build'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) {
    process.stderr.write((r.stdout ?? '') + (r.stderr ?? ''));
    throw new Error(`빌드 실패(종료 코드 ${r.status})`);
  }
}

// 한 번 관측한다. 서버·브라우저는 성공·실패와 관계없이 닫는다. 관측값 파일의 해시를 함께 돌려준다.
async function observeOnce(name, { chromium, serve, observeFrameMatrix }, active) {
  const outputDir = join(OUTPUT, name);
  rmSync(outputDir, { recursive: true, force: true });
  const file = join(outputDir, 'metrics.json');
  active.server = await serve({}, { port: PORT });
  try {
    active.browser = await chromium.launch({ headless: true });
    await observeFrameMatrix({
      browser: active.browser,
      base: `http://127.0.0.1:${active.server.address().port}`,
      outputDir
    });
    must(existsSync(file), `${name}: 관측값 파일이 없다`);
    const bytes = readFileSync(file);
    return { report: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex'), file };
  } finally {
    await active.browser?.close().catch(() => {});
    active.browser = null;
    await new Promise(done => active.server.close(done));
    active.server = null;
  }
}

async function main() {
  const started = Date.now();
  const active = { browser: null, server: null };
  setTimeout(async () => {
    console.error(`기준선 다시 뽑기가 ${Math.round(TIME_LIMIT_MS / 60000)}분을 넘겨 멈춘다.`);
    await active.browser?.close().catch(() => {});
    active.server?.close();
    process.exit(1);
  }, TIME_LIMIT_MS).unref();

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const oldText = readFileSync(BASELINE, 'utf8');
  const dirty = uncommittedChanges();
  if (dirty.length) {
    console.log(
      `주의: 커밋하지 않은 변경 ${dirty.length}건 — 기준 커밋 ${head.slice(0, 8)}에는 그 변경이 없다. ` +
        '화면 변경을 먼저 커밋한 뒤 다시 돌리는 것이 맞다.'
    );
    for (const line of dirty.slice(0, 5)) console.log(`  ${line}`);
  }
  build();
  console.log(`빌드: 끝 (${elapsed(started)}초)`);

  const { chromium } = await import('playwright');
  const { serve } = await import('../tests/helpers/screen-audit.mjs');
  const { observeFrameMatrix } = await import('../tests/helpers/frame-observation.mjs');
  const helpers = { chromium, serve, observeFrameMatrix };
  const first = await observeOnce('regen-1', helpers, active);
  console.log(`관측 1: ${first.report.screens.length}조건, 화면 오류 ${first.report.errors.length}건 (${elapsed(started)}초)`);
  const second = await observeOnce('regen-2', helpers, active);
  console.log(`관측 2: ${second.report.screens.length}조건, 화면 오류 ${second.report.errors.length}건 (${elapsed(started)}초)`);
  console.log(`관측값 SHA-256: 1번 ${first.sha256}`);
  console.log(`                2번 ${second.sha256}`);

  const result = plan({
    oldText,
    metricsA: first.report,
    metricsB: second.report,
    runsEqual: first.sha256 === second.sha256,
    basis: head
  });
  if (result.status === 'runs-differ') {
    console.error('두 관측이 다르다 — 기준선 파일을 쓰지 않는다. 아래 차이의 원인(그리기 흔들림·시험 데이터)을 먼저 잡고 다시 돌린다.');
    if (result.runsDiff.length) {
      console.error(
        table(['항목', '관측 1', '관측 2'], result.runsDiff.map(d => [cell(d.path), cell(d.a), cell(d.b)]))
      );
    } else if (result.deriveErrors.length) {
      for (const message of result.deriveErrors) console.error(`  ${message}`);
    } else {
      console.error('기준선에 들어가는 값은 같지만 관측값 파일이 다르다(기준선 밖의 항목이 흔들렸다).');
    }
    return 1;
  }
  if (result.status === 'structure') {
    console.error('기준선 구조(키·길이)가 달라져 값을 바꿔 끼울 수 없다 — 기준선 파일을 쓰지 않는다. 구조를 바꾼 변경을 먼저 확인한다.');
    for (const d of result.changed) console.error(`  ${d.path}: ${show(d.a)} → ${show(d.b)}`);
    return 1;
  }
  if (result.status === 'unchanged') {
    console.log('바뀐 항목 없음 — 기준선 파일을 건드리지 않았다.');
    if (result.oldBasis !== head) {
      console.log(`(기준 커밋은 파일 값 ${result.oldBasis.slice(0, 8)} 그대로다. 지금 HEAD는 ${head.slice(0, 8)}.)`);
    }
    return 0;
  }

  writeFileSync(BASELINE, result.text);
  const rows = [];
  if (result.oldBasis !== head) rows.push(['기준 커밋(basis)', cell(result.oldBasis.slice(0, 8)), cell(head.slice(0, 8))]);
  for (const d of result.changed) rows.push([cell(d.path.replace(/^screens\//, '')), cell(d.a), cell(d.b)]);
  console.log(`바뀐 항목 ${rows.length}건 — ${rel(BASELINE)}을 갱신했다 (${elapsed(started)}초).`);
  console.log(table(['항목', '이전 값', '새 값'], rows));
  console.log('PR 본문에 위 표를 넣고 항목마다 이유 PR 번호를 적는다. 기준값은 손으로 고치지 않는다.');
  return 0;
}

if (process.argv[1]?.endsWith('baseline-frames.mjs')) {
  let code = 1;
  try {
    code = await main();
  } catch (error) {
    console.error(`기준선 다시 뽑기 실패 — ${error?.message ?? error}`);
  }
  process.exitCode = code;
  // 끝난 뒤 남은 손잡이가 있어도 멈추게 한다(출력은 먼저 흘러간다).
  setTimeout(() => process.exit(code), 5000).unref();
}
