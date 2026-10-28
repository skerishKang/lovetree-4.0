/**
 * 러브트리 저장 API가 **제시된 자격 증명**을 읽는 지점만 제공한다. 여기서는 진위를
 * 확인하지 않는다 — 읽기만으로는 로그인이 성립하지 않는다. 배포가 주입하는
 * credential.verify가 이 값으로 세션 id를 확정하고, 그 뒤에 권위를 문다.
 * 서명 검증·발급·폐기 계약은 그 검증자 안에 있고, 이 서버는 발행자 비밀을 갖지 않는다.
 * 어떤 경로로 받지는 실행 시 설정으로 고른다 — 기본값으로 남기지 않는다.
 */
export function fromCookie(name) {
  if (typeof name !== 'string' || !name) throw new Error('쿠키 이름을 명시해야 합니다.');
  return request => {
    const header = String(request?.headers?.cookie ?? '');
    let found = null;
    for (const part of header.split(';')) {
      const at = part.indexOf('=');
      if (at < 0) continue;
      if (part.slice(0, at).trim() !== name) continue;
      found = part.slice(at + 1).trim();
    }
    return found;
  };
}

export function fromBearer() {
  return request => {
    const header = String(request?.headers?.authorization ?? '');
    const [scheme, ...rest] = header.trim().split(/\s+/);
    if (!rest.length || scheme.toLowerCase() !== 'bearer') return null;
    return rest.join(' ').trim();
  };
}
