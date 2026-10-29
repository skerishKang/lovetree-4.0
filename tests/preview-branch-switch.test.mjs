import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/auth/[[path]].js';

const origin = 'https://ai-astra4-preview-auth-callb.lovetree-4-0.pages.dev';
const env = { LOVETREE_AUTH_STATE_KEY: Buffer.alloc(32, 7).toString('base64url'), LOVETREE_AUTH_CALLBACK_URI: `${origin}/auth/callback` };

test('only the designated preview opts in when the shared switch is off', async () => {
  const trial = await onRequest({request:new Request(`${origin}/auth/login`), env});
  assert.equal(trial.status, 302);
  assert.equal(new URL(trial.headers.get('location')).origin, 'https://auth.padiem.net');
  for (const other of ['https://lovetree-4-0.pages.dev', 'https://other-preview.lovetree-4-0.pages.dev']) {
    const result = await onRequest({request:new Request(`${other}/auth/login`), env});
    assert.equal(result.status, 503); // Legacy proxy has no upstream in this isolated test.
    assert.equal((await result.json()).error.code, 'storage_unavailable');
  }
});
