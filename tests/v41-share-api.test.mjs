import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createShareApi} from '../public/v41/share-api.mjs';
test('share client uses only fixed same-origin endpoints',async()=>{
 const calls=[],fetchImpl=async(url,init={})=>{calls.push([url,init.method||'GET',init.body]);return new Response(JSON.stringify(url.includes('/public/')?{share:{id:'token'},tree:{}}:{shares:[]}),{headers:{'content-type':'application/json'}});};
 const api=createShareApi({fetchImpl});await api.preview({treeId:'t'});await api.create({treeId:'t'});await api.list();await api.revoke('abc');await api.read('abc');
 assert.deepEqual(calls.map(c=>c.slice(0,2)),[['/api/shares/preview','POST'],['/api/shares','POST'],['/api/shares','GET'],['/api/shares/abc','DELETE'],['/api/public/shares/abc','GET']]);
});
test('4.1 shell gates link creation behind preview and public reading behind the public endpoint',()=>{
 const shell=fs.readFileSync(new URL('../public/v41/shell.mjs',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../public/v41/index.html',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../public/v41/shell.css',import.meta.url),'utf8');
 assert.match(shell,/sharePreviewKey!==JSON\.stringify\(payload\)/);assert.match(shell,/shareApi\.read\(route\.shareId/);assert.match(shell,/source==='share'/);assert.match(shell,/share_revoked:\['공유가 취소됐어요/);
 assert.match(html,/id="share-create"[^>]*disabled/);assert.match(html,/비공개 업로드 파일은 제외/);assert.match(html,/이미 받은 사본·캡처/);assert.match(css,/\[hidden\]\{display:none!important\}/);
});
