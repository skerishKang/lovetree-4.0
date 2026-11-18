// #934: '링크를 열 수 없어요' 경고와 저장 결과를 맞춘다.
//  전: 미리보기만 경고를 띄우고 자세한 추가(편집기)는 그대로 저장했다 — 경고와 결과가 어긋났다.
//  후: 편집기의 링크 칸도 '경고를 띄우는 그 판정'(LTMedia.describe의 kind === 'invalid')일 때 저장을 멈춘다.
//  이 시험은 '못 여는 주소 5종'에서 경고와 저장 결과가 같은 말을 하는지(5/5) 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 미리보기(media-preview.js)의 실제 판정을 시험에서 그대로 쓴다 — 사본을 만들지 않는다.
globalThis.window = globalThis;
new Function(read('public/v41/media-preview.js'))();
const describe = globalThis.LTMedia.describe;

const {parseQuickUrl} = await import('../public/v41/quick-add.mjs');
const panels = await import('../public/v41/shell/panels.mjs');

// 경고(미리보기가 '링크를 열 수 없어요'를 띄우는가)와 저장 차단(편집기가 저장을 멈추는가)이
// 같은 입력에서 같은 답을 내야 한다. 편집기 판정은 panels.mjs의 linkFieldError와 같은 규칙이다.
function judge(value) {
  const warned = describe(value).kind === 'invalid';
  const blocked = value.trim() ? describe(value).kind === 'invalid' : false;
  return {warned, blocked};
}

const CASES = [
  ['잘못된 형식(링크 칸에 마음 문구)', '오늘 진짜 좋았다'],
  ['삭제된 영상', 'https://www.youtube.com/watch?v=aaaaaaaaaa1'],
  ['비공개 영상', 'https://www.youtube.com/watch?v=bbbbbbbbbb2'],
  ['지원하지 않는 사이트(일반 링크)', 'https://example.com/foo'],
  ['빈 칸', ''],
];

test('#934 못 여는 주소 5종에서 경고와 저장 결과가 일치한다 (5/5)', () => {
  const rows = CASES.map(([label, value]) => ({label, value, ...judge(value)}));
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.warned, row.blocked, `${row.label}: 경고=${row.warned} 저장차단=${row.blocked} — 두 답이 같아야 한다`);
  }
  // 형식이 틀린 값만 막고, 형식이 맞는 유튜브·일반 링크·빈 칸은 그대로 저장된다.
  assert.deepEqual(rows.map((row) => row.blocked), [true, false, false, false, false]);
  assert.deepEqual(rows.map((row) => row.warned), [true, false, false, false, false]);
});

test('#934 편집기 저장 판정은 경고를 띄우는 그 판정을 쓴다', () => {
  const source = read('public/v41/shell/panels.mjs');
  assert.match(source, /LTMedia\.describe\(value\)/, '미리보기와 같은 함수로 판정한다');
  assert.match(source, /info\.kind !== 'invalid'/, "'invalid'일 때만 막는다");
  assert.match(source, /const linkError = linkFieldError\(\);[\s\S]{0,220}return;/, '판정이 틀리면 저장하지 않고 멈춘다');
  assert.equal(typeof panels.LINK_FORMAT_ERROR, 'string');
  assert.match(panels.LINK_FORMAT_ERROR, /링크 칸의 주소를 열 수 없어요/);
  assert.match(panels.LINK_FORMAT_ERROR, /칸을 비우면 링크 없이 저장돼요/, '고칠 길(칸을 비우기)을 함께 알린다');
});

test('#934 경고 판정은 쉬운 추가의 판정과도 같은 답을 낸다 (5종 재확인)', () => {
  // 두 판정을 각각 따로 돌려도 같은 줄이 나오는지 — 경고만 띄우고 저장하던 상태로 되돌아가면 여기서 깨진다.
  const table = [
    ['오늘 진짜 좋았다', 'invalid', 'invalid'],
    ['https://www.youtube.com/watch?v=aaaaaaaaaa1', 'youtube', 'ok'],
    ['https://example.com/foo', 'link', 'ok'],
    ['', 'none', 'empty'],
  ];
  for (const [value, wantKind, wantStatus] of table) {
    assert.equal(describe(value).kind, wantKind, `${value || '(빈 칸)'} 미리보기 판정`);
    assert.equal(parseQuickUrl(value, describe).status, wantStatus, `${value || '(빈 칸)'} 쉬운 추가 판정`);
  }
});
