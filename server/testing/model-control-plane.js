import { createHash } from 'node:crypto';
/**
 * 테스트 전용 Control Plane 모형. 확인된 쓰기·읽기 RPC 여섯 개의 응답 형상만 닮는다
 * (`identity_authority_worker.py:192-231,232-238,264-281,316-338`).
 * 실제 권위·실제 배포가 아니라서 이 모형을 통과하는 것이 운영 연결 검증이 아니다.
 */
export function createModelControlPlane({ sessionTtlSeconds = 3600, clock = () => new Date() } = {}) {
  const links = new Map();
  const reverse = new Map();
  const sessions = new Map();
  let counter = 0;

  const linkKey = (productId, userId) => `${productId}\u0000${userId}`;
  const subjectKey = (productId, subjectId) => `${productId}\u0000${subjectId}`;
  const wire = (session) => ({
    session_id: session.session_id,
    product_id: session.product_id,
    subject: { subject_type: 'user', subject_id: session.subject_id },
    issued_at: session.issued_at,
    expires_at: session.expires_at,
    state: session.state,
    revision: session.revision
  });

  return {
    sessions,
    async resolve_or_create_product_link({ product_id, product_user_id, auth_provider, provider_subject }) {
      if (!product_id || !product_user_id || !auth_provider || !provider_subject) return { ok: false, error: { code: 'invalid_identity_authority_rpc' } };
      const key = linkKey(product_id, product_user_id);
      let link = links.get(key);
      if (!link) {
        // 앞쪽 몇 바이트만 베면 같은 접두사를 공유하는 provider_subject가 같은 주체가 된다.
        // 서로 다른 검증 신원은 서로 다른 canonical subject로 나가야 하므로 전체를 해시한다.
        const subject = `sub_${createHash('sha256').update(`${product_id}:${provider_subject}`, 'utf8').digest('hex').slice(0, 32)}`;
        link = { canonical_subject_id: subject, state: 'active' };
        links.set(key, link);
        reverse.set(subjectKey(product_id, subject), product_user_id);
      }
      return { ok: true, link: { product_id, product_user_id, canonical_subject_id: link.canonical_subject_id, state: link.state } };
    },

    async establish_auth_session({ product_id, subject, authenticated_at, not_after }) {
      const existing = links.get(linkKey(product_id, reverse.get(subjectKey(product_id, subject?.subject_id)) ?? ''));
      if (!existing || existing.state !== 'active' || subject?.subject_type !== 'user') {
        return { ok: false, error: { code: 'canonical_product_identity_link_not_active' } };
      }
      const start = new Date(authenticated_at);
      const expiry = new Date(Math.min(new Date(not_after).getTime(), start.getTime() + sessionTtlSeconds * 1000));
      const session = {
        session_id: `sess_${(++counter).toString(16).padStart(4, '0')}${'0'.repeat(28)}`.slice(0, 37),
        product_id,
        subject_id: subject.subject_id,
        issued_at: start.toISOString(),
        expires_at: expiry.toISOString(),
        state: 'active',
        revision: 1
      };
      sessions.set(session.session_id, session);
      return { ok: true, session: wire(session) };
    },

    async revoke_auth_session({ product_id, session_id }) {
      const session = sessions.get(session_id);
      if (!session || session.product_id !== product_id) return { ok: false, error: { code: 'canonical_auth_session_not_found' } };
      session.state = 'revoked';
      session.revision += 1;
      return { ok: true, session: wire(session) };
    },

    async resolve_auth_session({ session_id }) {
      const session = sessions.get(session_id);
      return session ? { ok: true, session: wire(session) } : { ok: false, error: { code: 'canonical_auth_session_not_found' } };
    },

    async resolve_product_user_for_subject({ product_id, canonical_subject_id }) {
      const userId = reverse.get(subjectKey(product_id, canonical_subject_id));
      return userId ? { ok: true, product_user_id: userId } : { ok: false, error: { code: 'canonical_product_identity_link_not_active' } };
    }
  };
}
