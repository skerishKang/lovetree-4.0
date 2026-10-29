import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('application entry never reads or clears the old browser record keys', async () => {
  const paths = ['src/main.js','src/sync.js','src/views/memory.js','src/views/book.js','src/views/orbit.js','src/views/shelf.js'];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|indexedDB|lovetree\.v4\.workspace|parked-unsent|local-before-server/);
    assert.doesNotMatch(source, /이 기기에만 저장|이 브라우저에 보관/);
  }
});
