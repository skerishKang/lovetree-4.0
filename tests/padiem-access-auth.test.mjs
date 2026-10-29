import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVerifier } from '../server/padiem-access-verify.mjs';
import { createSharedAccessAuth, sharedAuthEnabled } from '../server/padiem-access-auth.mjs';
const fixture = JSON.parse(await readFile(new URL('./padiem-auth-vectors.json', import.meta.url)));
const verifier = createVerifier({ audience: fixture.audience, clock: () => fixture.now * 1000, fetcher: async () => Response.json(fixture.jwks) });
test('the documented 1 switch enables shared auth, with default disabled', () => {
  assert.equal(sharedAuthEnabled('1'), true);
  assert.equal(sharedAuthEnabled('true'), true);
  for (const value of ['', '0', undefined, 'false']) assert.equal(sharedAuthEnabled(value), false);
});
test('old login remains default and new token resolves to existing workspace owner', async () => {
  const legacy = async () => ({ productId: 'lovetree-4-0', subjectId: 'old-subject' });
  const cookie = `__Host-lovetree-access=${fixture.tokens.valid}`;
  assert.equal((await createSharedAccessAuth({ enabled: false, legacy, verifier })({ headers: { cookie } })).subjectId, 'old-subject');
  assert.equal((await createSharedAccessAuth({ enabled: true, legacy, verifier })({ headers: { cookie } })).subjectId, 'sub_existing');
  assert.equal((await createSharedAccessAuth({ enabled: true, legacy, verifier })({ headers: {} })).subjectId, 'old-subject');
});
test('invalid shared token and duplicate cookies do not fall back', async () => {
  const auth = createSharedAccessAuth({ enabled: true, legacy: async () => { throw new Error('must not fall back'); }, verifier });
  await assert.rejects(() => auth({ headers: { cookie: `__Host-lovetree-access=${fixture.tokens.forged}` } }));
  await assert.rejects(() => auth({ headers: { cookie: '__Host-lovetree-access=x; __Host-lovetree-access=y' } }));
});
