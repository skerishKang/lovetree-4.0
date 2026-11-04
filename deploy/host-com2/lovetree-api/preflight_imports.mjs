#!/usr/bin/env node
// install 사전점검: server/index.js의 정적 import 그래프가 실제 파일로 해석되는지 확인한다.
//
// ESM은 모듈 본문을 실행하기 전에 정적 import를 모두 해석한다. 그래서 존재하지 않는
// 상대 경로 파일(예: 과거 사고의 src/domain.js)이 있으면 ERR_MODULE_NOT_FOUND가 나오고,
// 그 파일들이 다 있으면 본문이 실행된다. 설치는 env를 비워 실행하므로(index.js가 제품 ID
// 부재로 즉시 중단) 본문 부작용 없이 그래프만 검사된다.
//
// 분류:
//   ERR_MODULE_NOT_FOUND -> 파일/의존성 누락 -> FAIL (설치 중단)
//   SyntaxError          -> 문법 오류            -> FAIL
//   그 외(환경값 부족 등) -> 그래프는 완전        -> PASS
import { pathToFileURL } from 'node:url';

const entry = process.argv[2] ?? './server/index.js';
const url = new URL(entry, pathToFileURL(`${process.cwd()}/`));
try {
  await import(url.href);
  console.log('LOVETREE_IMPORT_PREFLIGHT=PASS');
} catch (error) {
  const code = error?.code ?? '';
  const name = error?.name ?? '';
  if (code === 'ERR_MODULE_NOT_FOUND' || name === 'SyntaxError') {
    console.error(`LOVETREE_IMPORT_PREFLIGHT=FAIL ${code || name} ${error?.message ?? ''}`);
    process.exit(1);
  }
  console.log('LOVETREE_IMPORT_PREFLIGHT=PASS');
}
