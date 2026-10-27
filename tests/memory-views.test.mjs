import test from 'node:test';
import assert from 'node:assert/strict';
import { readingOrder, resume, remember, orbitRecords, hasRecovery, recoveryData } from '../src/views/memory.js';
import { RECOVERY_KEY, STORAGE_KEY } from '../src/storage.js';
const mem = () => { const data = new Map(); return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)}; };
const trees = [{id:'t',updatedAt:'2026-10-27',moments:[{id:'root',parentId:null,createdAt:'1'},{id:'a',parentId:'root',createdAt:'2'},{id:'b',parentId:'root',createdAt:'3'},{id:'a1',parentId:'a',createdAt:'4'}]}];
test('book order preserves every branch; orbit keeps tree and moment identities',()=>{
 assert.deepEqual(readingOrder(trees[0]).map(m=>m.id),['root','a','a1','b']);
 const records=orbitRecords([...trees,{...trees[0],id:'other'}]);
 assert.equal(new Set(records.map(c=>c.key)).size,8);
 assert.equal(records.find(c=>c.key==='t/a1').parentId,'a');
});
test('reading position survives reload and handles deleted moments or unavailable storage',()=>{
 const storage=mem();remember(storage,'t','a');assert.equal(resume(storage,trees).moment.id,'a');
 assert.equal(resume(storage,[{...trees[0],moments:trees[0].moments.filter(m=>m.id!=='a')}]).moment.id,'a1');
 assert.equal(resume(storage,[]),null);
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.doesNotThrow(()=>remember(blocked,'t','a'));assert.equal(resume(blocked,trees).moment.id,'a1');
});
test('recovery export remains available after a healthy reload and never falls back to healthy records',()=>{
 const storage=mem();storage.setItem(RECOVERY_KEY,'broken original');storage.setItem(STORAGE_KEY,'healthy records');
 assert.equal(hasRecovery(storage,{}),true);assert.equal(recoveryData(storage,{}),'broken original');
 const clean=mem();clean.setItem(STORAGE_KEY,'healthy records');assert.equal(hasRecovery(clean,{}),false);assert.equal(recoveryData(clean,{}),null);
 assert.equal(recoveryData(clean,{recovery:true}),'healthy records');
});
