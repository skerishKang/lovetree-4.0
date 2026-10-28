/**
 * systemd ExecCondition — 저장 API를 띄워도 되는지 참/거짓으로만 답한다.
 *
 * 환경값(접속 문자열·비밀)은 어디에도 출력하지 않는다. 파일 레인의 check_config.py와
 * 같은 규칙이고, journal에 남는 것은 개별 깃발과 최종 준비 여부뿐이다.
 * 판정 한 자리를 서버와 같은 함수(server/listen-config.js)에서 가져와, 유닛이 다른
 * 결정을 내리는 일이 없게 한다.
 */
import { resolveListen } from './server/listen-config.js';

const MIN_NODE = [22, 13, 0];
const NODE_OK = (() => {
  const parts = String(process.versions.node ?? '').split('.').map(Number);
  for (let i = 0; i < MIN_NODE.length; i += 1) {
    if ((parts[i] ?? 0) > MIN_NODE[i]) return true;
    if ((parts[i] ?? 0) < MIN_NODE[i]) return false;
  }
  return true;
})();

const flags = {
  NODE: NODE_OK,
  PRODUCT_ID: String(process.env.LOVETREE_PRODUCT_ID ?? '').trim() !== '',
  DATABASE_URL: String(process.env.LOVETREE_DATABASE_URL ?? '').trim() !== ''
};

try {
  const { host, port } = resolveListen({ env: process.env });
  flags.LISTEN = host === '127.0.0.1' && port > 0;
} catch {
  flags.LISTEN = false;
}

try {
  await import('pg');
  flags.PG = true;
} catch {
  flags.PG = false;
}

const ready = Object.values(flags).every(Boolean);
console.log(Object.entries(flags).map(([key, value]) => `${key}=${value ? 1 : 0}`).join(' '));
console.log('LOVETREE_CONFIG_READY=' + (ready ? '1' : '0'));
process.exitCode = ready ? 0 : 1;
