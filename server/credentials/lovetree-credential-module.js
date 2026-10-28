import { readSessionToken } from './lovetree-session.js';

/**
 * `LOVETREE_CREDENTIAL_MODULE`의 실제 구현.
 * 서명·만료만 여기서 확인하고, 세션이 살아 있는지는 canonical 세션 확인(읽기 경계)에 맡긴다.
 * 비밀은 러브트리 것만 쓰고(`LOVETREE_SESSION_SECRET`) 절대 반환·로그에 올리지 않는다.
 */
export function createCredentialVerifier({ env = process.env, present, now = () => Math.floor(Date.now() / 1000) }) {
  const secret = env.LOVETREE_SESSION_SECRET ?? '';
  if (typeof present !== 'function') throw new Error('제시된 자격 증명을 읽는 지점이 필요합니다.');
  if (!secret) throw new Error('LOVETREE_SESSION_SECRET이 필요합니다. 다른 제품의 서명 비밀을 복사하지 않습니다.');
  return {
    async verify(request) {
      const presented = present(request ?? {});
      if (typeof presented !== 'string') return null;
      const payload = readSessionToken({ secret, token: presented, now: now() });
      return payload ? { sessionId: payload.canonicalSessionId } : null;
    }
  };
}
