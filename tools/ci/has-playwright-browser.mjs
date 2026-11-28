import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
try {
  const locked = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'))
    .packages['node_modules/playwright'].version;
  const installed = require('playwright/package.json').version;
  const executable = require('playwright').chromium.executablePath();
  // playwright의 브라우저 개정판은 설치된 Playwright 버전과 executablePath로 고정된다.
  // npm 설치 버전과 잠금 파일이 같고 실행 파일이 있을 때만 설치를 건너뛴다.
  process.exit(installed === locked && existsSync(executable) ? 0 : 1);
} catch {
  process.exit(1);
}
