import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('operational schema apply verifies the explicit share table',()=>{
 const script=fs.readFileSync(new URL('../scripts/apply-schema.mjs',import.meta.url),'utf8');
 assert.match(script,/['"]lovetree_shares['"]/);
 assert.match(script,/TABLES\.every\(name => present\.has\(name\)\)/);
});
