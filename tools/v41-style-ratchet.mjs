// #1015(#886 항목5): !important·인라인 style 래칫 — 파일별 개수가 기준보다 늘면 실패, 줄면 통과.
// 사용: node tools/v41-style-ratchet.mjs          → 기준과 비교(늘면 파일·전후 숫자·줄 번호를 보여주고 실패)
//       node tools/v41-style-ratchet.mjs --write  → 줄어든 쪽만 기준에 반영(늘어난 파일이 있으면 쓰지 않고 실패)
//       --root <dir> --baseline <file>            → 검사 대상·기준 파일 바꾸기(시험에서 임시 사본을 볼 때)
// CSS 변수만 넣는 인라인(style="--n:3")은 세지 않는다. 특정 문자열 위치가 아니라 개수만 집계한다(#952 방침).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = new Set(['.css', '.html', '.js', '.mjs']);
const IMPORTANT_RE = /!\s*important\b/gi;
// style 앞에 공백을 요구해 data-date-style="…" 같은 다른 속자를 세지 않는다.
const STYLE_ATTR_RE = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi;

export function isVarsOnly(value) {
  return value.split(';').every(part => {
    const t = part.trim();
    return t === '' || t.startsWith('--');
  });
}

export function countText(text, ext) {
  const lineAt = index => text.slice(0, index).split(/\r?\n/).length;
  const importantLines = [...text.matchAll(IMPORTANT_RE)].map(m => lineAt(m.index));
  const inlineStyleLines = [];
  if (ext === '.html' || ext === '.js' || ext === '.mjs') {
    for (const m of text.matchAll(STYLE_ATTR_RE)) {
      if (!isVarsOnly(m[2])) inlineStyleLines.push(lineAt(m.index));
    }
  }
  return {important: importantLines.length, inlineStyle: inlineStyleLines.length, importantLines, inlineStyleLines};
}

export function scan(root) {
  const out = {};
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && EXTS.has(path.extname(entry.name))) {
        const key = 'public/v41/' + path.relative(root, full).split(path.sep).join('/');
        out[key] = countText(fs.readFileSync(full, 'utf8'), path.extname(entry.name));
      }
    }
  };
  walk(root);
  return out;
}

export function loadBaseline(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')).files ?? {};
}

export function compare(current, baseline) {
  const increased = [];
  const decreased = [];
  for (const [file, counts] of Object.entries(current)) {
    const base = baseline[file] ?? {important: 0, inlineStyle: 0};
    for (const metric of ['important', 'inlineStyle']) {
      if (counts[metric] > base[metric]) {
        increased.push({file, metric, before: base[metric], after: counts[metric], lines: counts[metric + 'Lines']});
      } else if (counts[metric] < base[metric]) {
        decreased.push({file, metric, before: base[metric], after: counts[metric]});
      }
    }
  }
  for (const [file, base] of Object.entries(baseline)) {
    if (current[file]) continue;
    for (const metric of ['important', 'inlineStyle']) {
      if ((base[metric] ?? 0) > 0) decreased.push({file, metric, before: base[metric], after: 0});
    }
  }
  return {increased, decreased};
}

function reportIncreased(increased) {
  for (const it of increased) {
    const name = it.metric === 'important' ? '!important' : '인라인 style';
    console.error(`[늘음] ${it.file} ${name} ${it.before} → ${it.after} (줄 번호: ${it.lines.join(', ')})`);
  }
}

function baselineOf(current) {
  const files = {};
  for (const key of Object.keys(current).sort()) {
    const {important, inlineStyle} = current[key];
    if (important > 0 || inlineStyle > 0) files[key] = {important, inlineStyle};
  }
  return {files};
}

export function run({root, baselineFile, write}) {
  const current = scan(root);
  const baseline = loadBaseline(baselineFile);
  if (baseline === null) {
    if (!write) {
      console.error(`기준 파일이 없습니다: ${baselineFile} — node tools/v41-style-ratchet.mjs --write 로 만드세요.`);
      return 1;
    }
    fs.mkdirSync(path.dirname(baselineFile), {recursive: true});
    fs.writeFileSync(baselineFile, JSON.stringify(baselineOf(current), null, 2) + '\n');
    console.log(`기준 파일을 새로 만들었습니다: ${baselineFile}`);
    return 0;
  }
  const {increased, decreased} = compare(current, baseline);
  if (increased.length > 0) {
    reportIncreased(increased);
    console.error(write
      ? '늘어난 파일이 있어 기준을 쓰지 않았습니다. 새 !important·인라인 style은 PR에 이유를 쓰고 CTO 승인 뒤 기준을 올리세요.'
      : '기준보다 늘었습니다. 새 !important·인라인 style은 넣지 않습니다(#1015). 꼭 필요하면 PR에 이유를 쓰고 CTO 승인 뒤 기준을 올리세요.');
    return 1;
  }
  if (write) {
    const next = JSON.stringify(baselineOf(current), null, 2) + '\n';
    const prev = fs.readFileSync(baselineFile, 'utf8');
    if (next === prev) {
      console.log('기준과 같습니다 — 쓸 것이 없습니다.');
      return 0;
    }
    fs.writeFileSync(baselineFile, next);
    for (const d of decreased) console.log(`[낮춤] ${d.file} ${d.metric === 'important' ? '!important' : '인라인 style'} ${d.before} → ${d.after}`);
    console.log(`기준을 낮췄습니다: ${baselineFile}`);
    return 0;
  }
  const totalImportant = Object.values(current).reduce((n, c) => n + c.important, 0);
  const totalStyle = Object.values(current).reduce((n, c) => n + c.inlineStyle, 0);
  console.log(`스타일 래칫 통과 — !important ${totalImportant}곳, 인라인 style ${totalStyle}곳 (기준을 넘지 않음)`);
  if (decreased.length > 0) {
    for (const d of decreased) console.log(`[줄음] ${d.file} ${d.metric === 'important' ? '!important' : '인라인 style'} ${d.before} → ${d.after}`);
    console.log('기준을 낮추세요: node tools/v41-style-ratchet.mjs --write');
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valueOf = flag => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  const root = valueOf('--root') ?? path.join(repoRoot, 'public', 'v41');
  const baselineFile = valueOf('--baseline') ?? path.join(repoRoot, 'tests', 'fixtures', 'style-baseline.json');
  process.exitCode = run({root, baselineFile, write: args.includes('--write')});
}