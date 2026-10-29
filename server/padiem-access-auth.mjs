import { createVerifier } from './padiem-access-verify.mjs';
import { ApiError } from './errors.js';

// Draft backend bridge. Pages callback and refresh handling must be connected
// before this is enabled; the default remains the existing authority path.
export function createSharedAccessAuth({ enabled = false, legacy, verifier = createVerifier({ audience: 'lovetree-4-0' }) }) {
  if (typeof legacy !== 'function') throw new Error('legacy authenticator is required');
  return async (request) => {
    if (!enabled) return legacy(request);
    const raw = typeof request?.headers?.cookie === 'string' ? request.headers.cookie : '';
    const entries = raw.split(';').map(s => s.trim()).filter(s => s.startsWith('__Host-lovetree-access='));
    if (entries.length === 0) return legacy(request);
    if (entries.length !== 1) throw new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');
    // A presented but invalid shared credential must never fall back to the old path.
    let result;
    try { result = await verifier(entries[0].slice('__Host-lovetree-access='.length)); }
    catch (error) {
      if (error?.message === 'jwks_unavailable' || error instanceof TypeError) throw new ApiError(503, 'auth_unavailable', '로그인 확인을 하지 못했어요.');
      throw new ApiError(401, 'unauthenticated', '로그인 확인을 하지 못했어요.');
    }
    return Object.freeze({ productId: 'lovetree-4-0', subjectId: result.accountId });
  };
}
