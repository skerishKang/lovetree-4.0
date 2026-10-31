import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('operational schema apply verifies share and community tables',()=>{
 const script=fs.readFileSync(new URL('../scripts/apply-schema.mjs',import.meta.url),'utf8');
 for(const table of ['lovetree_shares','lovetree_community_favorites','lovetree_community_reactions','lovetree_community_comments','lovetree_community_reports','lovetree_community_blocks','lovetree_community_hidden_shares','lovetree_community_moderation_audit'])assert.match(script,new RegExp(`['\"]${table}['\"]`));
 assert.match(script,/TABLES\.every\(name => present\.has\(name\)\)/);
});
