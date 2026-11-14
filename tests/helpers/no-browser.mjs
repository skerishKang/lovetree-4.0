// 기본 `npm test`에서는 크롬 화면 시험을 돌리지 않는다(2026-11-15 시험 점검).
// 화면 시험은 모두 `import('playwright')` 뒤 chromium.executablePath()가 없으면 건너뛰게 짜여 있다.
// 여기서 'playwright'를 '브라우저 없음' 대역으로 바꿔 그 건너뜀 길을 타게 한다 — 시험 파일은 손대지 않는다.
// - 화면 시험은 CI '미리보기 검사' 화면 잡이 LT_…_REQUIRE=1 로 직접 돌린다(그 잡은 npm test를 쓰지 않는다).
// - 로컬에서 화면 시험까지 다 돌리려면 `npm run test:all`, 한 파일만은
//   `node --test tests/<파일>.test.mjs`(REQUIRE 없이도 크롬이 있으면 돈다).
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
const STUB = 'data:text/javascript,' + encodeURIComponent(
  "const none={executablePath:()=>'',launch:async()=>{throw new Error('npm test 에서는 크롬을 띄우지 않는다 — npm run test:all')}};" +
  "export const chromium=none,firefox=none,webkit=none;export default {chromium:none,firefox:none,webkit:none};"
);
export async function resolve(specifier, context, next) {
  if (specifier === 'playwright' || specifier === 'playwright-core' || specifier === '@playwright/test') {
    return { url: STUB, shortCircuit: true };
  }
  return next(specifier, context);
}
`));
