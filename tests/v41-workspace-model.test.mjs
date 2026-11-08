import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceModel } from '../public/v41/workspace-model.mjs';
import vm from 'node:vm';
import fs from 'node:fs';

const time = '2026-10-31T00:00:00Z';
const moment = (id, parentId, links = []) => ({id, parentId, links, title:id,
  note:'기록 본문', relation:parentId ? '이어진 이유' : '', emotion:'설렘', date:'2026-10-31', url:'', createdAt:time});
const document = () => ({revision:7,state:{version:1,trees:[{id:'tree1',title:'기억',subject:'대상',coverMomentId:'a',
  createdAt:time,updatedAt:time,moments:[moment('root',null),moment('a','root',['b']),
  moment('b','root',['a']),moment('c','root')]}]}});
test('all children and related connections survive without being confused',()=>{
  const input=document(), before=structuredClone(input), result=workspaceModel(input,{treeId:'tree1',momentId:'c'});
  assert.equal(result.trees[0].edges.filter(e=>e.kind==='parent').length,3);
  assert.equal(result.trees[0].edges.filter(e=>e.kind==='related').length,1);
  assert.deepEqual(result.selection,{treeId:'tree1',momentId:'c'});
  assert.equal(result.revision,7);assert.deepEqual(input,before);
  assert.deepEqual(result.trees[0].moments,input.state.trees[0].moments);
  assert.equal(result.trees[0].subject,'대상');assert.equal(result.trees[0].coverMomentId,'a');
});
test('empty account stays empty; stale selection falls back to root',()=>{
  assert.deepEqual(workspaceModel({revision:0,state:{version:1,trees:[]}}).selection,{treeId:null,momentId:null});
  assert.equal(workspaceModel(document(),{momentId:'missing'}).selection.momentId,'root');
});
test('invalid revision or dangling parent is rejected',()=>{
  assert.throws(()=>workspaceModel({...document(),revision:-1}));
  const input=document();input.state.trees[0].moments[1].parentId='missing';
  assert.throws(()=>workspaceModel(input));
});
test('300 moments and multiple trees preserve all parents and selection',()=>{
  const input=document();
  input.state.trees[0].moments=[moment('root',null),...Array.from({length:299},(_,i)=>moment('n'+i,'root'))];input.state.trees[0].coverMomentId='';
  input.state.trees.push({...input.state.trees[0],id:'tree2',moments:[moment('second',null)]});
  const output=workspaceModel(input,{treeId:'tree1',momentId:'n298'});
  assert.equal(output.trees[0].moments.length,300);
  assert.equal(output.trees[0].edges.length,299);
  assert.equal(output.selection.momentId,'n298');
  assert.equal(workspaceModel(input,{treeId:'tree2'}).selection.momentId,'second');
});
test('shelf management uses real metadata and removes unsupported fixed classifications',()=>{
  // 2026-11-09 #231 후속: 스타일·스크립트는 views/shelf/로 나눴다(마크업+옮긴 파일을 함께 본다).
  const shelf=[
    fs.readFileSync(new URL('../public/v41/views/track32-bookshelf.html',import.meta.url),'utf8'),
    fs.readFileSync(new URL('../public/v41/views/shelf/shelf.js',import.meta.url),'utf8'),
    fs.readFileSync(new URL('../public/v41/views/shelf/shelf.css',import.meta.url),'utf8')
  ].join('\n');
  // #231 1.5단계 ⑥: 안쪽 화면은 views/ 한 벌만 있다.
  assert.equal(fs.existsSync(new URL('../public/v41/design/views/track32-bookshelf.html',import.meta.url)),false);
  const navigation=fs.readFileSync(new URL('../public/v41/view-navigation.js',import.meta.url),'utf8');
  // #231 1-B③-2: 책 정보 관리(editTree·tree-manager)는 shell/panels.mjs로 옮겼다. 두 파일을 함께 본다.
  const shell=fs.readFileSync(new URL('../public/v41/shell.mjs',import.meta.url),'utf8')+fs.readFileSync(new URL('../public/v41/shell/panels.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(shelf,/data-filter="(?:kpop|actor|series)"/);
  assert.doesNotMatch(shelf,/categoryLabel\(/);
    // #212: 카드 정보 줄은 '순간 N개 · 마지막 YYYY-MM-DD'로 바뀌었지만, 책 값은 계속 실제 tree 메타데이터에서 온다(고정 분류 없음).
  assert.match(shelf,/subject:tree\.subject/);assert.match(shelf,/book\.lastDate/);assert.match(shelf,/coverMedia/);assert.match(shelf,/tree\.coverMomentId/);
  assert.match(navigation,/subject:t\.subject/);assert.match(navigation,/coverMomentId:t\.coverMomentId/);assert.match(navigation,/globalThis\.LTMedia\?\./);
  assert.match(shell,/apply\('editTree'/);assert.match(shell,/tree-manager/);assert.match(shell,/tree-delete/);
});

test('view runtime uses imported text only, keeps every edge, and does not persist',()=>{
  const input=document();input.state.trees[0].moments[0].title='<b>원문 그대로</b>';
  const model=workspaceModel(input), context={tree:model.trees[0],momentId:'root'},sent=[];
  const scope={parent:{LT41:context,postMessage:value=>sent.push(value)},window:{},location:{origin:'https://example.test'}};
  vm.runInNewContext(fs.readFileSync(new URL('../public/v41/runtime.js',import.meta.url),'utf8'),scope);
  const data=scope.window.LTDEMO;
  assert.equal(data.moments.length,4);assert.equal(data.edges.length,4);
  assert.equal(data.moments[0].title,'<b>원문 그대로</b>');
  assert.ok(data.moments.every(m=>m.type==='memo'&&m.image===''));
  data.select('c');assert.equal(context.momentId,'c');assert.equal(sent.length,1);
  data.select('missing');assert.equal(context.momentId,'c');
});
