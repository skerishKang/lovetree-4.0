import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {exampleDocument,exampleMedia} from '../public/v41/example.mjs';
import {workspaceModel} from '../public/v41/workspace-model.mjs';
const runtime=readFileSync(new URL('../public/v41/runtime.js',import.meta.url),'utf8');
test('example is canonical and its graph retains branches and related edges',()=>{
 const model=workspaceModel(exampleDocument);const tree=model.trees[0];assert.equal(tree.moments.length,12);assert.equal(tree.edges.filter(e=>e.kind==='parent').length,11);assert.equal(tree.edges.filter(e=>e.kind==='related').length,1);assert.equal(tree.edges.filter(e=>e.from==='m03'&&e.kind==='parent').length,2);assert.equal(Object.keys(exampleMedia).length,12);assert.ok(tree.moments.every(m=>m.url===''));
});
test('example media never decorates account records, even when moment IDs match',()=>{
 const tree=workspaceModel(exampleDocument).trees[0];
 function render(context){const window={};vm.runInNewContext(runtime,{parent:{LT41:context,postMessage(){}},window,location:{origin:'https://example.test'}});return window.LTDEMO;}
 const member=render({tree,momentId:'m01'});assert.ok(member.moments.every(m=>m.type==='memo'&&m.image===''));
 const example=render({tree,momentId:'m01',exampleMedia});assert.ok(example.moments.every(m=>m.type==='photo'&&m.image.startsWith('data:image/')));assert.equal(member.edges.length,example.edges.length);
});
