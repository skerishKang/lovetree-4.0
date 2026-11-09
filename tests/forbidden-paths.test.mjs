// 커밋 금지 경로 검사(2026-11-09 대표 결정 — 브라우저 프로필 노출 건 재발 방지).
// git ls-files(트래킹 중인 파일)에 금지 경로가 하나라도 있으면 시험을 실패시켜 CI를 막는다.
// .gitignore만으로는 `git add -A` 이전에 이미 추적 중인 파일이나 강제 add를 막지 못한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';

const FORBIDDEN = [
  { pattern: /^tools\/postdeploy\/\.profile[^/]*\//, reason: '브라우저 프로필(세션 쿠키 포함)은 절대 커밋하지 않는다' },
  { pattern: /^\.tmp-[^/]*\//, reason: '레인 임시 작업 폴더는 커밋하지 않는다' },
  { pattern: /^out\//, reason: '캡처·리포트 결과(out/)는 커밋하지 않는다' },
  { pattern: /^tools\/postdeploy\/out\//, reason: 'postdeploy 결과는 커밋하지 않는다' }
];

test('트래킹 중인 파일에 금지 경로(프로필·임시 폴더·결과물)가 없다', () => {
  let files = '';
  try {
    files = execSync('git ls-files -z', { cwd: path.resolve('.'), maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (error) {
    // git 저장소가 아닌 환경(예: 일부 샌드박스)에서는 건너뛴다 — CI 체크아웃에서는 반드시 돈다.
    const message = String(error && error.message || error);
    if (/not a git repository|git not found|ENOENT/i.test(message)) return;
    throw error;
  }
  const tracked = files.split('\0').filter(Boolean);
  const offenders = [];
  for (const file of tracked) {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(file)) offenders.push(`${file} — ${rule.reason}`);
    }
  }
  assert.deepEqual(offenders, [], `금지 경로가 커밋돼 있다:\n${offenders.join('\n')}\ngit rm -r --cached 로 제거하고 .gitignore에 넣으세요.`);
});
