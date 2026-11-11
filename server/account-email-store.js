/** 내부 전용: 검증된 access 토큰이 인증한 계정의 이메일을 모아 둔다. */
export function createAccountEmailStore({ repo, productId, verify, now = () => new Date() }) {
  if (!repo || typeof repo.upsertEmail !== 'function') throw new Error('account repo가 필요합니다');
  if (typeof verify !== 'function') throw new Error('토큰 검증기가 필요합니다');

  return async (request) => {
    if (request?.path !== '/internal/account/email') return { status: 404, body: { error: { code: 'not_found' } } };
    if (request?.method !== 'POST') return { status: 405, body: { error: { code: 'method_not_allowed' } } };

    let body;
    try {
      const raw = typeof request.body === 'string' || Buffer.isBuffer(request.body) ? request.body : JSON.stringify(request.body ?? {});
      body = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
    } catch {
      return { status: 400, body: { error: { code: 'invalid_json', message: 'JSON 본문을 읽을 수 없습니다.' } } };
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: { error: { code: 'invalid_body' } } };
    }

    const header = request?.headers?.authorization ?? request?.headers?.Authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== 'string' || !/\bBearer\s+/i.test(raw)) {
      return { status: 401, body: { error: { code: 'unauthorized' } } };
    }

    let verified;
    try {
      verified = await verify(raw.replace(/^Bearer\s+/i, '').trim());
    } catch (error) {
      // 서명·만료 문제와 키 조회 장애를 구분한다(인증 경계와 같은 코드 공유).
      if (error?.message === 'jwks_unavailable' || error instanceof TypeError) {
        return { status: 503, body: { error: { code: 'authentication_unavailable', message: '토큰 검증을 준비하는 중이에요. 잠시 후 다시 시도해 주세요.' } } };
      }
      return { status: 401, body: { error: { code: 'unauthorized' } } };
    }

    const canonical = verified?.accountId ?? verified?.subject;
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (typeof canonical !== 'string' || !/^sub_[A-Za-z0-9_-]{1,128}$/.test(canonical)) {
      return { status: 401, body: { error: { code: 'unauthorized' } } };
    }
    if (body.canonical_subject_id !== undefined
        && (typeof body.canonical_subject_id !== 'string' || body.canonical_subject_id !== canonical)) {
      return { status: 400, body: { error: { code: 'subject_mismatch', message: '토큰이 인증한 계정과 본문의 계정이 다릅니다.' } } };
    }
    if (!email || email.length > 320 || /[\u0000-\u001f\u007f]/.test(email)) {
      return { status: 400, body: { error: { code: 'invalid_email' } } };
    }

    try {
      await repo.upsertEmail({ productId, subjectId: canonical, email, at: now().toISOString() });
    } catch {
      return { status: 503, body: { error: { code: 'account_email_unavailable', message: '이메일을 저장하지 못했어요. 다시 로그인하면 채워집니다.' } } };
    }
    return { status: 200, body: { ok: true } };
  };
}
