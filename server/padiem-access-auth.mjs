import { createVerifier } from './padiem-access-verify.mjs';

// Draft backend bridge. Pages callback and refresh handling must be connected
// before this is enabled; the default remains the existing authority path.
export function createSharedAccessAuth({ enabled = false, legacy, verifier = createVerifier({ audience: 'lovetree-4-0' }) }) {
  if (typeof legacy !== 'function') throw new Error('legacy authenticator is required');
  return async (request) => {
    if (!enabled) return legacy(request);
    const raw = typeof request?.headers?.cookie === 'string' ? request.headers.cookie : '';
    const entries = raw.split(';').map(s => s.trim()).filter(s => s.startsWith('__Host-lovetree-access='));
    if (entries.length === 0) return legacy(request);
    if (entries.length !== 1) throw new Error('invalid shared credential');
    // A presented but invalid shared credential must never fall back to the old path.
    const result = await verifier(entries[0].slice('__Host-lovetree-access='.length));
    return Object.freeze({ productId: 'lovetree-4-0', subjectId: result.accountId });
  };
}
