import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createCommunityApi} from '../public/v41/community-api.mjs';
import {createProxy} from '../functions/_lib/proxy.js';
test('community client uses fixed same-origin routes and idempotency headers',async()=>{
 const calls=[],fetchImpl=async(url,init={})=>{calls.push({url,init});return new Response(JSON.stringify(url.includes('/comments')?{comments:[]}:{items:[],stats:{},report:{}}),{headers:{'content-type':'application/json'}});},api=createCommunityApi({fetchImpl});
 await api.discover({q:'윤슬',limit:12});await api.favorite('s'.repeat(24),true);await api.react('s'.repeat(24),false);await api.comments('s'.repeat(24));await api.comment('s'.repeat(24),'hello');await api.report('s'.repeat(24),'check');await api.block('s'.repeat(24));
 assert.equal(calls.every(call=>call.url.startsWith('/api/community/')),true);assert.match(calls[4].init.headers['idempotency-key'],/^comment-/);assert.match(calls[5].init.headers['idempotency-key'],/^report-/);
});
test('4.1 discovery explains explicit-public scope and separates bookmark from new private writing',()=>{
 const html=fs.readFileSync(new URL('../public/v41/index.html',import.meta.url),'utf8'),shell=fs.readFileSync(new URL('../public/v41/shell.mjs',import.meta.url),'utf8'),panel=fs.readFileSync(new URL('../public/v41/community-panel.mjs',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../public/v41/shell.css',import.meta.url),'utf8'),admin=fs.readFileSync(new URL('../src/admin.js',import.meta.url),'utf8'),schema=fs.readFileSync(new URL('../server/db/schema.sql',import.meta.url),'utf8');
 assert.match(html,/id="community-menu"/);assert.match(html,/명시적으로 공개한 트리만/);assert.match(html,/인기·추천 순위는 표시하지 않아요/);assert.match(html,/원본을 복사하지 않고/);
 assert.match(shell,/mountCommunity/);assert.match(panel,/대표 순간부터 감상/);assert.match(panel,/내 기록 새로 시작/);assert.doesNotMatch(panel,/adopt|clone|copyTree/);
 assert.match(css,/#community-list/);assert.match(css,/@media\(max-width:780px\)/);assert.match(admin,/발견·커뮤니티 신고 검토/);assert.match(admin,/visibility: hide \? 'hidden' : 'visible'/);assert.match(schema,/lovetree_community_hidden_shares/);assert.match(schema,/hide_comment/);
});

test('Pages proxy constrains community routes and forwards idempotency only',async()=>{
 const calls=[],fetcher=async(url,init)=>{calls.push({url,method:init.method,headers:Object.fromEntries(init.headers)});return new Response('{}',{headers:{'content-type':'application/json'}});},proxy=createProxy({fetcher});
 const allowed=[['/api/community/shares','GET'],['/api/community/shares/'+ 's'.repeat(24)+'/comments','POST'],['/api/community/shares/'+ 's'.repeat(24)+'/favorite','PUT'],['/api/community/shares/'+ 's'.repeat(24)+'/reaction','DELETE'],['/api/community/shares/'+ 's'.repeat(24)+'/report','POST'],['/api/community/shares/'+ 's'.repeat(24)+'/block','POST'],['/api/community/comments/comment-1','DELETE'],['/api/community/admin/reports/report-1','PATCH']];
 for(const [path,method] of allowed){const headers=method==='POST'?{'content-type':'application/json','idempotency-key':'community-key-1'}:undefined;const response=await proxy({request:new Request('https://front.test'+path,{method,headers,body:method==='POST'?'{}':undefined}),env:{LOVETREE_API_ORIGIN:'https://api.test'}});assert.equal(response.status,200,`${method} ${path}`);}
 const denied=await proxy({request:new Request('https://front.test/api/community/unknown'),env:{LOVETREE_API_ORIGIN:'https://api.test'}});assert.equal(denied.status,404);
 assert.equal(calls.some(call=>call.headers['idempotency-key']==='community-key-1'),true);
});
