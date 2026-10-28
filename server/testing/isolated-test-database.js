/**
 * 테스트 전용: 격리 PostgreSQL 연결 문자열 검사. 운영·공유 DB를 우연히 찍지 않게
 * loopback 호스트와 lovetree_test_ 접두 DB 이름을 **둘 다** 요구한다.
 * 이 모듈은 env를 읽지 않고 연결 문자열만 인자로 받는다 — 다른 env로 대체하는
 * fallback이 구조적으로 존재하지 않는다.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const PREFIX = 'lovetree_test_';

export function assertIsolatedTestDatabase(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('LOVETREE_TEST_DATABASE_URL가 비어 있습니다. 다른 연결 문자열로 대체하지 않습니다.');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('테스트 DB 연결 문자열 형식이 올바르지 않아요.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('postgres:// 또는 postgresql:// 연결만 허용합니다.');
  }
  if (!LOOPBACK.has(parsed.hostname)) {
    throw new Error(`테스트 DB는 loopback 호스트만 허용합니다(현재: ${parsed.hostname || '없음'}).`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!database.startsWith(PREFIX)) {
    throw new Error(`테스트 DB 이름은 ${PREFIX} 접두사를 써야 합니다(현재: ${database || '없음'}).`);
  }
  return parsed;
}
