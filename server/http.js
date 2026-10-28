import { ApiError } from './errors.js';
import { parsePrincipal } from './principal.js';

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

function errorBody(error) {
  const { code, message, details } = error;
  return { error: { code, message, ...(details ? details : {}) } };
}

export function createApiHandler({ authenticate, service, productId, maxBodyBytes = DEFAULT_MAX_BODY_BYTES }) {
  async function handle(request) {
    const { method = 'GET', path = '', body = '' } = request ?? {};
    const text = typeof body === 'string' ? body : String(body);
    if (Buffer.byteLength(text, 'utf8') > maxBodyBytes) throw new ApiError(413, 'payload_too_large', '보내는 기록이 너무 커요. 일부만 나눠서 저장해 주세요.');

    let verified;
    try { verified = await authenticate(request ?? {}); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(503, 'auth_unavailable', '로그인 연결에 문제를 만났어요.'); }
    const principal = parsePrincipal(verified, productId);

    if (path !== '/api/workspace') throw new ApiError(404, 'not_found', '요청을 찾을 수 없어요.');
    if (method === 'GET') return { status: 200, body: await service.read(principal) };
    if (method === 'PUT') {
      const contentType = String(request?.headers?.['content-type'] ?? '');
      if (!contentType.split(';')[0].toLowerCase().endsWith('application/json')) {
        throw new ApiError(415, 'unsupported_media_type', 'JSON으로만 저장할 수 있어요.');
      }
      let payload;
      try { payload = JSON.parse(text); }
      catch { throw new ApiError(400, 'invalid_json', '기록 형식을 읽을 수 없어요.'); }
      return { status: 200, body: await service.write(principal, payload) };
    }
    throw new ApiError(405, 'method_not_allowed', '이 요청은 지원하지 않아요.');
  }

  return async function requestHandler(request) {
    try {
      const { status, body } = await handle(request);
      return { status, body };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: errorBody(error) };
      console.error('[lovetree-storage] 요청 처리 실패', { path: request?.path, method: request?.method });
      return { status: 500, body: { error: { code: 'internal_error', message: '서버에서 처리하지 못했어요.' } } };
    }
  };
}

export function createNodeHandler(requestHandler, { maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  return async function nodeHandler(req, res) {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('aborted', () => { aborted = true; });
    try {
      // 한도를 넘겨도 읽기를 멈추지 않고 확보만 멈춘다. 반복자를 중간에 끊으면
      // 스트림이 파괴되어 클라이언트가 413 응답 대신 연결 절단을 보게 된다.
      for await (const chunk of req) {
        if (size <= maxBodyBytes) chunks.push(chunk);
        size += chunk.length;
      }
    } catch {
      aborted = true;
    }
    if (aborted || res.destroyed) { res.destroy(); return; }

    let path;
    let query;
    try { const url = new URL(req.url, 'http://localhost'); path = url.pathname; query = url.searchParams; }
    catch {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'invalid_path', message: '요청 경로를 읽을 수 없어요.' } }));
      return;
    }
    const result = await requestHandler({ method: req.method, path, query, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
    if (res.destroyed) return;
    res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(result.headers ?? {}) });
    res.end(JSON.stringify(result.body));
  };
}
