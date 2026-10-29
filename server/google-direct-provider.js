import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

// Fixed Google endpoints. No caller-provided issuer or endpoint is accepted.
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const OPAQUE = /^[A-Za-z0-9_-]{16,128}$/;

function invalid() { throw new Error('google_login_unavailable'); }
function object64(value) {
  try {
    const bytes = Buffer.from(value, 'base64url');
    const parsed = JSON.parse(bytes.toString('utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
function googleId(subject) {
  return 'usr_' + createHash('sha256').update('google:' + subject, 'utf8').digest('hex').slice(0, 32);
}
export function pkceChallenge(verifier) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) invalid();
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

// Prototype only: not mounted in the login service or authorized for deployment.
export function createGoogleDirectProvider({ clientId, clientSecret, redirectUri, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  if (typeof clientId !== 'string' || !clientId || typeof clientSecret !== 'string' || !clientSecret) invalid();
  if (redirectUri !== 'https://lovetree-4-0.pages.dev/auth/callback') invalid();
  if (typeof fetchImpl !== 'function') invalid();
  return {
    authorizationUrl({ state, nonce, verifier }) {
      if (!OPAQUE.test(state ?? '') || !OPAQUE.test(nonce ?? '')) invalid();
      const url = new URL(AUTH);
      for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256' })) url.searchParams.set(k, v);
      return url.href;
    },
    async exchangeCode({ code, nonce, verifier }) {
      if (typeof code !== 'string' || !code || !OPAQUE.test(nonce ?? '')) invalid();
      pkceChallenge(verifier);
      const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier });
      const response = await fetchImpl(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, redirect: 'error' });
      if (!response.ok) invalid();
      const tokens = await response.json();
      const parts = typeof tokens.id_token === 'string' ? tokens.id_token.split('.') : [];
      if (parts.length !== 3) invalid();
      const header = object64(parts[0]), claims = object64(parts[1]);
      if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !claims) invalid();
      const keyResponse = await fetchImpl(CERTS, { redirect: 'error' });
      if (!keyResponse.ok) invalid();
      const keySet = await keyResponse.json();
      const keys = Array.isArray(keySet.keys) ? keySet.keys.filter(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig')) : [];
      if (keys.length !== 1) invalid();
      let valid = false;
      try { valid = verifySignature('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1], 'ascii'), createPublicKey({ key: keys[0], format: 'jwk' }), Buffer.from(parts[2], 'base64url')); } catch { invalid(); }
      if (!valid) invalid();
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || !aud.includes(clientId) || (aud.length > 1 && claims.azp !== clientId) || claims.nonce !== nonce || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(now() / 1000) || typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub)) invalid();
      return { evidence: { productUserId: googleId(claims.sub), authProvider: 'google', providerSubject: claims.sub } };
    }
  };
}
