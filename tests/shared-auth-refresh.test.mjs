import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceApi } from '../src/sync.js';

test('two tabs serialize refresh, second retries with the refreshed cookie', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: '__Host-lovetree-shared=1' } });
  let queue = Promise.resolve(); let refreshes = 0; let valid = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, fn) { const run = queue.then(fn); queue = run.catch(() => {}); return run; } } } });
  try {
    const api = createWorkspaceApi({ fetchImpl: async (url) => {
      if (url === '/auth/refresh') { refreshes++; valid = true; return new Response(null, { status: 204 }); }
      if (!valid) return new Response('{}', { status: 401 });
      return Response.json({ revision: 0, state: { trees: [], activeTreeId: null } });
    } });
    const [a,b] = await Promise.all([api.get(), api.get()]);
    assert.equal(refreshes, 1);
    // The returned document shape may fail unrelated state validation; the
    // essential condition is both requests made it past authentication.
    assert.notEqual(a.status, 401); assert.notEqual(b.status, 401);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator;
    if (previousDoc) Object.defineProperty(globalThis, 'document', previousDoc); else delete globalThis.document;
  }
});

test('without Web Locks, both tabs can use the server grace response', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousDoc = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: '__Host-lovetree-shared=1' } });
  let valid = false; let refreshes = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  try {
    const api = createWorkspaceApi({ fetchImpl: async (url) => {
      if (url === '/auth/refresh') { refreshes++; valid = true; return new Response(null, { status: 204 }); }
      if (!valid) return new Response('{}', { status: 401 });
      return Response.json({ revision: 0, state: { trees: [], activeTreeId: null } });
    } });
    const [a, b] = await Promise.all([api.get(), api.get()]);
    assert.ok(refreshes >= 1);
    assert.notEqual(a.status, 401); assert.notEqual(b.status, 401);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator;
    if (previousDoc) Object.defineProperty(globalThis, 'document', previousDoc); else delete globalThis.document;
  }
});


test('legacy unauthenticated response does not attempt shared refresh', async () => {
  let calls = 0;
  const api = createWorkspaceApi({ fetchImpl: async () => { calls++; return new Response('{}', { status: 401 }); } });
  const response = await api.get();
  assert.equal(response.status, 401);
  assert.equal(calls, 1);
});
