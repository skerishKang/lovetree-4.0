import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

test('trial workspace is read only and other hosts keep legacy routing', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => { calls++; assert.equal(url, 'https://api.example/api/workspace'); return new Response('{}', { headers: { 'content-type': 'application/json' } }); };
  const env = { LOVETREE_TRIAL_API_ORIGIN: 'https://api.example' };
  try {
    const origin = 'https://ai-astra4-preview-auth-callb.lovetree-4-0.pages.dev';
    assert.equal((await onRequest({ request: new Request(origin + '/api/workspace'), env })).status, 200);
    assert.equal((await onRequest({ request: new Request(origin + '/api/workspace', { method: 'PUT', body: '{}' }), env })).status, 405);
    assert.equal((await onRequest({ request: new Request('https://other.pages.dev/api/workspace'), env })).status, 503);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
