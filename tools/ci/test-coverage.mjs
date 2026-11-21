// B-05: 브라우저를 쓰는 시험 파일이 워크플로 어디에도 없으면 실패하게 하는 누락 검사.
// 시험 본문은 이 도구만 호출한다 — 경로 규칙은 여기 한 곳에 둔다.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_DIR = resolve(ROOT, 'tests');
const WORKFLOW_DIR = resolve(ROOT, '.github', 'workflows');
const TEST_PATH = /tests\/[A-Za-z0-9_./-]+\.test\.mjs/g;
const BROWSER_PATTERNS = [
  /import\(\s*['"]playwright['"]\s*\)/,
  /from\s+['"]playwright['"]/,
  /chromium\.(?:executablePath|launch)\s*\(/,
  /LT_[A-Z0-9_]+_REQUIRE/
];

export function browserTestFiles() {
  return readdirSync(TEST_DIR)
    .filter(name => name.endsWith('.test.mjs'))
    .filter(name => {
      const source = readFileSync(resolve(TEST_DIR, name), 'utf8');
      return BROWSER_PATTERNS.some(pattern => pattern.test(source));
    })
    .map(name => 'tests/' + name)
    .sort();
}

export function workflowReferencedTestFiles() {
  const found = new Set();
  for (const name of readdirSync(WORKFLOW_DIR).filter(name => name.endsWith('.yml'))) {
    const text = readFileSync(resolve(WORKFLOW_DIR, name), 'utf8');
    for (const match of text.matchAll(TEST_PATH)) found.add(match[0]);
  }
  return [...found].sort();
}

export function missingBrowserTests() {
  const referenced = new Set(workflowReferencedTestFiles());
  return browserTestFiles().filter(path => !referenced.has(path));
}

export const COVERAGE_ROOT = ROOT;
