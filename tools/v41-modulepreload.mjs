// #400: 셸이 정적으로 부르는 모듈을 모두 찾아 index.html 맨 위에 modulepreload 목록으로 적는다.
// 브라우저가 한 층씩 열어 보며 다음 파일을 알아내는 연쇄 로딩을 없애, 전부 한꺼번에 받게 한다.
// 사용: node tools/v41-modulepreload.mjs          → index.html 목록 갱신
//       node tools/v41-modulepreload.mjs --check  → 목록이 어긋났으면 실패(시험이 부른다)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'v41');
const START = '<!-- modulepreload:start (tools/v41-modulepreload.mjs가 만든다) -->';
const END = '<!-- modulepreload:end -->';

export function collect(entry = 'shell.mjs') {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    // 정적 import/export ... from '...' 와 import '...' 만 본다(동적 import()는 필요할 때 부르므로 제외).
    const re = /(?:^|[\n;}])\s*(?:import|export)\s*(?:[^'"()]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+\.m?js)['"]/g;
    let m;
    while ((m = re.exec(text))) visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
  };
  visit(entry);
  return [...seen].sort();
}

export function block(files = collect()) {
  return START + files.map(f => `<link rel="modulepreload" href="${f}">`).join('') + END;
}

export function apply(html, files) {
  const next = block(files);
  if (html.includes(START)) return html.replace(new RegExp(START.replace(/[()]/g, '\\$&') + '[\\s\\S]*?' + END), () => next);
  return html.replace('</title>', '</title>' + next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const next = apply(html);
  if (process.argv.includes('--check')) {
    if (next !== html) { console.error('modulepreload 목록이 어긋났습니다. node tools/v41-modulepreload.mjs 로 갱신하세요.'); process.exit(1); }
  } else if (next !== html) fs.writeFileSync(file, next);
}
