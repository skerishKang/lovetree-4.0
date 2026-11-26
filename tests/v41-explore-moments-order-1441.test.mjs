import test from 'node:test';
import assert from 'node:assert/strict';
import {orderTreeMoments} from '../public/v41/community-moments-order.mjs';

test('tree path follows parent links before dates',()=>{
 const entries=[
  {id:'a',date:'2026-11-03'},
  {id:'c',parentId:'b',date:'2026-11-01'},
  {id:'b',parentId:'a',date:'2026-11-04'},
 ];
 assert.deepEqual(orderTreeMoments(entries).map(x=>x.id),['a','b','c']);
});
test('branches are deterministically sorted by date',()=>{
 const entries=[{id:'a',date:'2026-11-01'},{id:'b',parentId:'a',date:'2026-11-04'},{id:'c',parentId:'a',date:'2026-11-02'}];
 assert.deepEqual(orderTreeMoments(entries).map(x=>x.id),['a','c','b']);
});
test('disconnected moments fall back to date order',()=>{
 const entries=[{id:'z',date:'2026-11-03'},{id:'a',date:'2026-11-01'},{id:'b',date:'2026-11-02'}];
 assert.deepEqual(orderTreeMoments(entries).map(x=>x.id),['a','b','z']);
});
test('cycles terminate with each moment exactly once',()=>{
 const entries=[{id:'b',parentId:'a',date:'2026-11-02'},{id:'a',parentId:'b',date:'2026-11-01'}];
 assert.deepEqual(orderTreeMoments(entries).map(x=>x.id),['a','b']);
});
test('missing parents remain visible and no duplicate IDs',()=>{
 const entries=[{id:'x',parentId:'gone',date:'2026-11-02'},{id:'x',date:'2026-11-01'},{id:'y',date:'2026-11-03'}];
 assert.deepEqual([...new Set(orderTreeMoments(entries).map(x=>x.id))].sort(),['x','y']);
});

