import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createGoogleDirectProvider, pkceChallenge } from '../server/google-direct-provider.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'synthetic-key', use: 'sig' };
const clientId = 'test-client', verifier = 'v'.repeat(43), nonce = 'n'.repeat(24), state = 's'.repeat(24);
const url = 'https://lovetree-4-0.pages.dev/auth/callback';
function signed(claims) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = encode({ alg: 'RS256', kid: jwk.kid }) + '.' + encode(claims);
  return body + '.' + sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url');
}
function setup(changes = {}) {
  const claims = { iss: 'https://accounts.google.com', aud: clientId, sub: '1234567890', nonce, exp: 2000000000, ...changes };
  const calls = [];
  const fetchImpl = async (address, init) => {
    calls.push({ address, init });
    return address.includes('/token')
      ? new Response(JSON.stringify({ id_token: signed(claims) }), { status: 200 })
      : new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  };
  return { provider: createGoogleDirectProvider({ clientId, clientSecret: 'synthetic-only', redirectUri: url, fetchImpl, now: () => 1800000000 * 1000 }), calls };
}
test('PKCE and nonce are sent and verified subject maps to existing Chat user id', async () => {
  const { provider, calls } = setup();
  const request = new URL(provider.authorizationUrl({ state, nonce, verifier }));
  assert.equal(request.searchParams.get('code_challenge'), pkceChallenge(verifier));
  assert.equal(request.searchParams.get('nonce'), nonce);
  const result = await provider.exchangeCode({ code: 'synthetic-code', nonce, verifier });
  assert.equal(result.evidence.productUserId, 'usr_' + createHash('sha256').update('google:1234567890').digest('hex').slice(0, 32));
  assert.equal(result.evidence.providerSubject, '1234567890');
  assert.equal(calls[0].init.body.get('code_verifier'), verifier);
});
for (const claims of [{ nonce: 'bad' }, { aud: 'other' }, { iss: 'https://elsewhere.invalid' }, { exp: 100 }]) {
  test('reject mismatched claims ' + Object.keys(claims)[0], async () => {
    const { provider } = setup(claims);
    await assert.rejects(provider.exchangeCode({ code: 'synthetic-code', nonce, verifier }));
  });
}
test('refuse unapproved redirect URI', () => {
  assert.throws(() => createGoogleDirectProvider({ clientId, clientSecret: 'synthetic-only', redirectUri: 'https://elsewhere.invalid/callback' }));
});
test('reject a forged signature', async () => {
  const token = signed({ iss: 'https://accounts.google.com', aud: clientId, sub: '1234567890', nonce, exp: 2000000000 });
  const parts = token.split('.');
  const signature = Buffer.from(parts[2], 'base64url');
  signature[0] ^= 1;
  const forged = parts[0] + '.' + parts[1] + '.' + signature.toString('base64url');
  const fetchImpl = async address => new Response(JSON.stringify(address.includes('/token') ? { id_token: forged } : { keys: [jwk] }));
  const provider = createGoogleDirectProvider({ clientId, clientSecret: 'synthetic-only', redirectUri: url, fetchImpl, now: () => 1800000000 * 1000 });
  await assert.rejects(provider.exchangeCode({ code: 'synthetic-code', nonce, verifier }));
});
