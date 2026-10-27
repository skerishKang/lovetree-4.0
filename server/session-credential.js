/**
 * 러브트리 저장 API가 세션 id를 읽는 지점. 자격 증명은 제품 고유(first-party)이며,
 * 어떤 경로로 받을지는 실행 시 설정으로 고른다 — 기본값으로 남기지 않는다.
 * 여기서는 값만 넘기고 확인은 권위에게 시킨다. 서명 검증용 비밀은 이 서버가 갖지 않는다.
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
