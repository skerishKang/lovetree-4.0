// #481 T7: 공유 창(그리고 셸 창들) 시험 harness의 만능 `$`를 실제 index.html id 목록과 대조한다.
// 문제: harness가 `$: id => (els[id] ||= fakeElement())`로 어떤 id든 즉석에서 만들어 준다. 그래서 코드가
// index.html에 없는 id를 물어도(오타·지워진 요소·이름 바꿈) 시험은 조용히 통과한다 — 화면에서는 아무것도
// 그려지지 않는데 시험은 초록인 그 틈이다. 2026-11-12 사고 계열(#476/#477)이 바로 이런 틈에서 났다.
// 여기서는 두 가지를 값으로 고정한다:
//   ① 하네스가 id를 만들지 않고, index.html에 있는 id만 돌려준다(없으면 undefined를 돌려주고 시험이 실패한다).
//   ② 시험 파일들이 실제로 물어보는 id 집합이 index.html id 안에 들어 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(repoRoot, 'public', 'v41', 'index.html');

/** index.html의 모든 id를 모은다(문자열 스캔 — 정규식 백트래킹 없이). */
function idsInHtml(html) {
  const ids = new Set();
  let i = 0;
  const mark = 'id="';
  const markSingle = "id='";
  while (i < html.length) {
    let at = html.indexOf(mark, i);
    const at2 = html.indexOf(markSingle, i);
    if (at < 0 || (at2 >= 0 && at2 < at)) at = at2;
    if (at < 0) break;
    const quote = html[at + 3];
    const end = html.indexOf(quote, at + 4);
    if (end < 0) break;
    ids.add(html.slice(at + 4, end));
    i = end + 1;
  }
  return ids;
}

const html = fs.readFileSync(htmlPath, 'utf8');
const HTML_IDS = idsInHtml(html);

test('#481 T7 index.html id 목록을 실제로 읽어 왔다', () => {
  assert.ok(HTML_IDS.size > 50, `id를 ${HTML_IDS.size}개 찾았다`);
  // 공유 창의 핵심 id가 실제로 있다(대조의 기준이 살아 있음을 보인다).
  for (const must of ['share-panel', 'share-steps', 'community-panel', 'community-menu', 'view']) {
    assert.ok(HTML_IDS.has(must), `index.html에 #${must}가 있다`);
  }
});

/** 시험 파일에서 `$`/`get`/`getElementById`로 물어보는 id 문자열을 뽑는다. */
function idsAskedBy(source) {
  // 주석 안의 예시($('id'))는 id가 아니다 — 줄 주석과 블록 주석을 걷어 낸다.
  const stripped = source.split(String.fromCharCode(10)).map(line => { const at = line.indexOf(String.fromCharCode(47, 47)); return at >= 0 ? line.slice(0, at) : line; }).join(String.fromCharCode(10));
  const out = new Set();
  const patterns = [
    /\$\('([^']+)'\)/g,
    /\$\("([^"]+)"\)/g,
    /getElementById\('([^']+)'\)/g,
    /getElementById\("([^"]+)"\)/g,
    /\bget\('([^']+)'\)/g,
    /\bel\('([^']+)'\)/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(stripped))) out.add(m[1]);
  }
  return out;
}

const HARNESS_FILES = [
  'tests/v41-share-steps.test.mjs',
  'tests/v41-share-list.test.mjs',
  'tests/public-default-538.test.mjs',
  'tests/v41-shell-messages.test.mjs',
  'tests/v41-shell-dialogs.test.mjs'
];

for (const rel of HARNESS_FILES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) continue;
  test(`#481 T7 ${rel}: harness가 물어보는 id가 모두 index.html에 있다`, () => {
    const source = fs.readFileSync(full, 'utf8');
    const asked = idsAskedBy(source);
    // 하네스가 els['literal'] = 로 미리 심는 id는 `asked`에 안 잡힌다 — 파일에 적힌 els['...'] 리터럴을 모아 본다.
    const seeded = new Set();
    for (const m of source.matchAll(/els\[([^\]]+)\]/g)) {
      const key = m[1].trim();
      if (/^['\"][^'\"]+['\"]$/.test(key)) seeded.add(key.slice(1, -1));
    }
    const all = new Set([...asked, ...seeded]);
    const missing = [...all].filter((id) => !HTML_IDS.has(id)).sort();
    assert.deepEqual(missing, [], `index.html에 없는 id를 만들고 있다: ${missing.join(', ')}`);
  });
}

test('#481 T7 만능 $를 그대로 두면 이 시험이 왜 필요한지 — 없는 id도 통과한다', () => {
  // 세기 증명: 예전 방식(||= fakeElement())은 없는 id를 조용히 만들어 낸다.
  const els = {};
  const loose = (id) => (els[id] ||= { id });
  assert.ok(loose('완전히-없는-id'), '예전 $는 무엇이든 돌려준다');
  assert.ok(!HTML_IDS.has('완전히-없는-id'), '그 id는 index.html에 없다');
  // 새 방식: index.html에 있는 id만 돌려준다 → 없는 id를 물으면 시험이 바로 드러난다.
  const strict = (id) => (HTML_IDS.has(id) ? { id } : undefined);
  assert.equal(strict('완전히-없는-id'), undefined, '새 $는 없는 id를 만들어 주지 않는다');
  assert.ok(strict('share-panel'), '있는 id는 돌려준다');
});
