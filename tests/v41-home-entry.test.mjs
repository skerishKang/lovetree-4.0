import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeActions} from '../v41/home-actions.js';
import {MEMBER_LOGIN_URL,shouldLoadMemberRecords} from '../public/v41/member-entry.mjs';
import {createMemberSession} from '../public/v41/member-session.mjs';
const context={tree:{id:'tree-a',moments:[{id:'m01'},{id:'m02'}]}};
function setup(){const sent=[];return {...createHomeActions({getContext:()=>context,send:m=>sent.push(m)}),sent};}
test('gold home reports only a moment in the current 4.1 tree',()=>{
 const f=setup();assert.equal(f.select('m02'),true);assert.equal(f.select('foreign'),false);
 assert.deepEqual(f.sent,[{type:'lt41-select',id:'m02'}]);
});
test('4.0 book and workspace actions preserve the selected 4.1 moment',()=>{
 const f=setup();f.actions.openBook('orbit-example','m02');f.actions.openWorkspace('orbit-example','m01');
 assert.deepEqual(f.sent,[{type:'lt41-select',id:'m02'},{type:'lt41-navigate',view:'track59-sketchbook.html'},{type:'lt41-select',id:'m01'},{type:'lt41-navigate',view:'track58-pinboard.html'}]);
 f.actions.openBook('orbit-example','foreign');assert.equal(f.sent.length,4);
});
test('home writing modes are closed and library action uses the existing shelf',()=>{
 const f=setup();f.actions.requestMoment('new');f.actions.requestMoment('unsafe');f.actions.navigate('trees');
 assert.deepEqual(f.sent,[{type:'lt41-write',mode:'new'},{type:'lt41-navigate',view:'track32-bookshelf.html'}]);
});
test('login returns to a path accepted by shared auth and reloads a shared account',()=>{
 assert.equal(new URL(MEMBER_LOGIN_URL,'https://lovetree-4-0.pages.dev').searchParams.get('next'),'/v41/');
 assert.equal(shouldLoadMemberRecords('','a=2; __Host-lovetree-shared=1; b=3'),true);
 assert.equal(shouldLoadMemberRecords('?account=1',''),true);
 assert.equal(shouldLoadMemberRecords('','fake__Host-lovetree-shared=1'),false);
 assert.equal(shouldLoadMemberRecords('','__Host-lovetree-shared=10'),false);
 assert.equal(shouldLoadMemberRecords('',''),false);
});
test('non-secret shared marker never grants member ownership without a verified read',async()=>{
 const session=createMemberSession({api:{get:async()=>({ok:false,status:401}),put:()=>assert.fail('must not write')}});
 if(shouldLoadMemberRecords('','__Host-lovetree-shared=1'))await session.start();
 assert.equal(session.snapshot().owned,false);assert.equal(session.snapshot().writable,false);
});

import {readFile} from 'node:fs/promises';
import {exampleTree} from '../public/v41/example.mjs';
test('4.0 gold cards and the four 4.1 views refer to the same moments and edges',async()=>{
 const samples=JSON.parse(await readFile(new URL('../src/views/orbit-samples.json',import.meta.url),'utf8'));
 assert.deepEqual(samples.map(m=>[m.id,m.title]),exampleTree.moments.map(m=>[m.id,m.title]));
 const links=samples.flatMap(m=>[m.next,m.branch].filter(Boolean).map(to=>`${m.id}/${to}`)).sort();
 assert.deepEqual(links,exampleTree.edges.map(e=>`${e.from}/${e.to}`).sort());
});
