// AST 비교 도구 (tools/v41-ast-same.mjs)
// 같은 JS 파일 두 개가 "동작 동일"인지, acorn AST로 비교한다.
// 무시하는 것: 숫자 원문 표기(.62와 0.62 같은 raw), 빈 문장, 괄호 묶음
//   (괄호는 AST에 나타나지 않는다. &&·|| 사슬의 묶는 순서는 괄호 차이로 달라질 수 있어 평평하게 편다.)
// 실패하는 것: 나머지 모든 차이 (이름, 조건, 호출, 연산자, 문자열 값 등)
//
// 저장소에 파서가 없어 의존성으로 추가하지 않는다. acorn을 따로 준비해서:
//   ACORN_PATH=<acorn 경로> node tools/v41-ast-same.mjs <원본> <서식본> [원본2 서식본2 ...]
// 로 실행한다. (예: npx acorn 패키지를 임시 폴더에 깔아 그 dist/acorn.mjs를 ACORN_PATH로 준다.)
// 출력: 파일마다 "AST SAME" 또는 "AST DIFF"와 첫 차이 위치. 종료 코드는 전부 같으면 0, 아니면 1.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const loadAcorn = () => {
  const candidates = [];
  if (process.env.ACORN_PATH) candidates.push(process.env.ACORN_PATH);
  try {
    candidates.push(createRequire(import.meta.url).resolve('acorn'));
  } catch { /* 저장소에는 acorn이 없다 */ }
  if (!candidates.length) {
    console.error('acorn을 찾지 못했다. ACORN_PATH=<acorn.js 또는 acorn.mjs 경로> 로 실행하라.');
    process.exit(2);
  }
  return candidates[0];
};

const acornPath = loadAcorn();
const { parse } = await import(
  acornPath.endsWith('.mjs') || acornPath.endsWith('.js') ? `file://${acornPath}` : acornPath
);

const DROP = new Set(['start', 'end', 'loc', 'range', 'raw']);
const deref = (n, op) => (n && n.type === 'LogicalExpression' && n.operator === op
  ? [...deref(n.left, op), ...deref(n.right, op)]
  : [n]);
const strip = (n) => {
  if (Array.isArray(n)) return n.filter((x) => !(x && x.type === 'EmptyStatement')).map(strip);
  if (n && typeof n === 'object') {
    if (n.type === 'LogicalExpression') {
      return { type: 'LogicalChain', operator: n.operator, parts: deref(n, n.operator).map(strip) };
    }
    const o = {};
    for (const k of Object.keys(n)) { if (DROP.has(k)) continue; o[k] = strip(n[k]); }
    return o;
  }
  return n;
};
const ast = (f) => JSON.stringify(strip(parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' })));

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2 !== 0) {
  console.error('사용법: node tools/v41-ast-same.mjs <원본> <서식본> [원본2 서식본2 ...]');
  process.exit(2);
}
let failed = 0;
for (let i = 0; i < args.length; i += 2) {
  const [a, b] = [args[i], args[i + 1]];
  const A = ast(a), B = ast(b);
  if (A === B) {
    console.log(`${path.basename(b)}  AST SAME`);
    continue;
  }
  failed++;
  let j = 0; while (j < Math.min(A.length, B.length) && A[j] === B[j]) j++;
  console.log(`${path.basename(b)}  AST DIFF at ${j}`);
  console.log(`  원본: ${A.slice(Math.max(0, j - 100), j + 140)}`);
  console.log(`  서식: ${B.slice(Math.max(0, j - 100), j + 140)}`);
}
process.exit(failed ? 1 : 0);
