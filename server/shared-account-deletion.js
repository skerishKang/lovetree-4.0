import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

const encoder = new TextEncoder();
const AUTH_PREPARE_URL = 'https://auth.padiem.net/internal/account-delete/prepare';
const AUTH_COMPLETE_URL = 'https://auth.padiem.net/internal/account-delete/complete';
const AUTH_ABORT_URL = 'https://auth.padiem.net/internal/account-delete/abort';
const ACCOUNT_DELETE_PATH = '/internal/account/delete';
const RPC_PREFIX = '/internal/rpc/';
const SERVICE_AT = 'x-padiem-service-at';
const SERVICE_ID = 'x-padiem-service-id';
const SERVICE_PROOF = 'x-padiem-service-proof';
const SUBJECT_RE = /^sub_[A-Za-z0-9_-]{1,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RPC_WINDOW_SECONDS = 300;

function header(headers, name) {
  const value = headers?.[name];
  return typeof value === 'string' ? value : Array.isArray(value) && value.length === 1 ? value[0] : '';
}

function signedBytes({ method, path, at, serviceId, body }) {
  return Buffer.concat([
    Buffer.from('v2\n' + method + '\n' + path + '\n' + String(at) + '\n' + serviceId + '\n', 'utf8'),
    body
  ]);
}

function signature(secret, fields) {
  return 'v2=' + createHmac('sha256', secret).update(signedBytes(fields)).digest('hex');
}

export function verifySignedAccountDeleteRequest(request, { secret, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (typeof secret !== 'string' || secret.length < 32 || request?.method !== 'POST' || request?.path !== ACCOUNT_DELETE_PATH) return null;
  if (header(request.headers, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const atText = header(request.headers, SERVICE_AT);
  const serviceId = header(request.headers, SERVICE_ID);
  const proof = header(request.headers, SERVICE_PROOF);
  if (!/^(0|[1-9][0-9]{0,10})$/.test(atText) || !UUID_RE.test(serviceId) || !/^v2=[a-f0-9]{64}$/.test(proof)) return null;
  const at = Number(atText);
  const current = now();
  if (!Number.isSafeInteger(at) || Math.abs(current - at) > RPC_WINDOW_SECONDS) return null;
  const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === 'string' ? request.body : '', 'utf8');
  if (!body.length || body.length > 512) return null;
  const expected = Buffer.from(signature(secret, { method: 'POST', path: ACCOUNT_DELETE_PATH, at, serviceId, body }));
  const actual = Buffer.from(proof);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); } catch { return null; }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.keys(payload).sort().join(',') !== 'canonical_subject_id,product_id' ||
      !SUBJECT_RE.test(payload.canonical_subject_id ?? '') || typeof payload.product_id !== 'string') return null;
  return { at, serviceId, payload };
}

export function createTrustedAccountDeleteHandler({ account, productId, secret, claimServiceRequest, now = () => Math.floor(Date.now() / 1000) }) {
  if (!account || typeof account.deleteTrustedSubject !== 'function' || typeof claimServiceRequest !== 'function') {
    throw new Error('trusted account deletion dependencies are required');
  }
  return async (request) => {
    if (request?.path !== ACCOUNT_DELETE_PATH) return { status: 404, body: { error: { code: 'not_found' } } };
    if (request?.method !== 'POST') return { status: 405, body: { error: { code: 'method_not_allowed' } } };
    const verified = verifySignedAccountDeleteRequest(request, { secret, now });
    if (!verified) return { status: secret ? 401 : 404, body: { error: { code: secret ? 'unauthorized' : 'not_found' } } };
    if (verified.payload.product_id !== productId) return { status: 400, body: { error: { code: 'invalid_request' } } };
    let claimed;
    try { claimed = await claimServiceRequest({ serviceId: verified.serviceId, expiresAt: verified.at + 600, now: now() }); }
    catch { return { status: 503, body: { error: { code: 'account_delete_unavailable' } } }; }
    if (claimed !== true) return { status: 409, body: { error: { code: 'request_replayed' } } };
    try {
      await account.deleteTrustedSubject({
        canonicalSubjectId: verified.payload.canonical_subject_id,
        requestedProductId: verified.payload.product_id
      });
      return { status: 200, body: { ok: true, deleted: true }, headers: { 'cache-control': 'no-store' } };
    } catch (error) {
      if (error instanceof ApiError) return { status: error.status, body: { error: { code: error.code } } };
      return { status: 503, body: { error: { code: 'account_delete_unavailable' } } };
    }
  };
}

function unavailable() {
  return new ApiError(503, 'shared_account_unavailable', '공통 계정 연결을 처리할 수 없습니다. 데이터 삭제는 다시 시도할 수 있습니다.');
}

function originOnly(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function createSharedAccountDeletionWorkflow({
  productId,
  identityRpcUrl,
  identityRpcSecret,
  accountDeleteRpcSecret,
  fetcher = fetch,
  now = () => Math.floor(Date.now() / 1000)
}) {
  const identityOrigin = originOnly(identityRpcUrl);

  async function signedPost(url, path, payload, secret) {
    if (!identityOrigin && ![AUTH_PREPARE_URL, AUTH_COMPLETE_URL, AUTH_ABORT_URL].includes(url)) throw unavailable();
    if (typeof secret !== 'string' || secret.length < 32) throw unavailable();
    const body = Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()), 'utf8');
    const at = now();
    const serviceId = randomUUID();
    const proof = signature(secret, { method: 'POST', path, at, serviceId, body });
    let response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          [SERVICE_AT]: String(at),
          [SERVICE_ID]: serviceId,
          [SERVICE_PROOF]: proof
        },
        body
      });
    } catch { throw unavailable(); }
    if (!response?.ok || response.status !== 200) throw unavailable();
    let data;
    try { data = await response.json(); } catch { throw unavailable(); }
    if (!data || typeof data !== 'object' || data.ok !== true) throw unavailable();
    return data;
  }

  async function authority(method, payload) {
    if (!identityOrigin) throw unavailable();
    const path = RPC_PREFIX + method;
    return signedPost(identityOrigin + path, path, payload, identityRpcSecret);
  }

  return {
    async prepare(verified, { alreadyDeleted }) {
      const subjectId = verified?.subjectId;
      if (!SUBJECT_RE.test(subjectId ?? '')) throw unavailable();
      let result;
      try {
        result = await authority('list_active_product_links_for_subject', { canonical_subject_id: subjectId });
      } catch { throw unavailable(); }
      if (Object.keys(result).sort().join(',') !== 'links,ok' || !Array.isArray(result.links)) throw unavailable();
      const links = result.links;
      for (const link of links) {
        if (!link || Object.keys(link).sort().join(',') !== 'product_id,product_user_id,state' ||
            typeof link.product_id !== 'string' || typeof link.product_user_id !== 'string' || link.state !== 'active') throw unavailable();
      }
      const productLinks = links.filter(link => link.product_id === productId);
      if (productLinks.length === 0 && alreadyDeleted) return { subjectId, alreadyUnlinked: true };
      if (productLinks.length !== 1) throw unavailable();
      return {
        subjectId,
        productUserId: productLinks[0].product_user_id,
        lastLink: links.length === 1,
        alreadyUnlinked: false
      };
    },

    async complete(_verified, plan) {
      if (!plan || plan.alreadyUnlinked) return { commonAccountDeleted: false };
      const operationId = plan.lastLink ? randomUUID() : null;
      try {
        if (operationId) {
          const prepared = await signedPost(
            AUTH_PREPARE_URL,
            '/internal/account-delete/prepare',
            { account_id: plan.subjectId, operation_id: operationId },
            accountDeleteRpcSecret
          );
          if (Object.keys(prepared).sort().join(',') !== 'ok,prepared,revoked_sessions' ||
              prepared.prepared !== true || !Number.isInteger(prepared.revoked_sessions) || prepared.revoked_sessions < 0) {
            throw unavailable();
          }
        }
        const removed = await authority('remove_product_link', {
          canonical_subject_id: plan.subjectId,
          product_id: productId,
          product_user_id: plan.productUserId,
          account_deletion_operation_id: operationId
        });
        const expected = ['already_deleted', 'common_account_deleted', 'ok', 'remaining_links', 'removed', 'revoked_sessions'].sort().join(',');
        if (Object.keys(removed).sort().join(',') !== expected || removed.removed !== true ||
            typeof removed.common_account_deleted !== 'boolean' || typeof removed.already_deleted !== 'boolean' ||
            !Number.isInteger(removed.remaining_links) || removed.remaining_links < 0 ||
            !Number.isInteger(removed.revoked_sessions) || removed.revoked_sessions < 0) {
          throw unavailable();
        }
        if (removed.common_account_deleted) {
          if (!operationId) throw unavailable();
          const completed = await signedPost(
            AUTH_COMPLETE_URL,
            '/internal/account-delete/complete',
            { account_id: plan.subjectId, operation_id: operationId },
            accountDeleteRpcSecret
          );
          if (Object.keys(completed).sort().join(',') !== 'deleted,ok' || completed.deleted !== true) {
            throw unavailable();
          }
        } else if (operationId) {
          await signedPost(
            AUTH_ABORT_URL,
            '/internal/account-delete/abort',
            { account_id: plan.subjectId, operation_id: operationId },
            accountDeleteRpcSecret
          );
        }
        return { commonAccountDeleted: removed.common_account_deleted };
      } catch {
        if (operationId) {
          try {
            await signedPost(
              AUTH_ABORT_URL,
              '/internal/account-delete/abort',
              { account_id: plan.subjectId, operation_id: operationId },
              accountDeleteRpcSecret
            );
          } catch { /* the Auth lease expires automatically */ }
        }
        throw unavailable();
      }
    }
  };
}
