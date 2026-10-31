import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSelectionRoute, ownerSelectionRoute, accountPosition,
  rememberAccountPosition, resolveAccountPosition,
  stashPendingOwnerRoute, pendingOwnerRoute, takePendingOwnerRoute, selectionStorageKeys
} from '../public/v41/selection-location.mjs';
import {shouldLoadMemberRecords} from '../public/v41/member-entry.mjs';

const storage = () => {
  const values = new Map();
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    dump:()=>Object.fromEntries(values)
  };
};
const trees = [
  {id:'tree A',moments:[{id:'root-a',parentId:null},{id:'next-a',parentId:'root-a'}]},
  {id:'tree-b',moments:[{id:'root-b',parentId:null}]}
];

test('owner routes keep view/tree/moment while public routes stay a separate scope',()=>{
  const hash=ownerSelectionRoute({view:'board',treeId:'tree A',momentId:'next-a'});
  assert.equal(hash,'#my/board?tree=tree+A&moment=next-a');
  assert.deepEqual(parseSelectionRoute(hash),{
    scope:'owner',view:'board',treeId:'tree A',momentId:'next-a',explicit:true
  });
  assert.equal(parseSelectionRoute('#share/public-token/book').scope,'public');
  assert.deepEqual(parseSelectionRoute('#book'),{
    scope:'screen',view:'book',treeId:null,momentId:null,explicit:true
  });
  assert.equal(parseSelectionRoute('#unknown').explicit,false);
});

test('owner address loads account records but public address never opens private records',()=>{
  const cookie='__Host-lovetree-shared=1';
  assert.equal(shouldLoadMemberRecords('','','#my/book?tree=a&moment=b'),true);
  assert.equal(shouldLoadMemberRecords('?account=1','','#home'),true);
  assert.equal(shouldLoadMemberRecords('',cookie,'#home'),true);
  assert.equal(shouldLoadMemberRecords('?account=1',cookie,'#share/token/book'),false);
});

test('account positions are isolated and contain pointers only',()=>{
  const local=storage();
  rememberAccountPosition(local,'member-A',{treeId:'tree A',momentId:'next-a',view:'book',note:'must not persist'});
  rememberAccountPosition(local,'member-B',{treeId:'tree-b',momentId:'root-b',view:'network'});
  assert.deepEqual(accountPosition(local,'member-A'),{treeId:'tree A',momentId:'next-a',view:'book'});
  assert.deepEqual(accountPosition(local,'member-B'),{treeId:'tree-b',momentId:'root-b',view:'network'});
  assert.equal(accountPosition(local,'member-C'),null);
  const serial=local.dump()[selectionStorageKeys.position];
  assert.doesNotMatch(serial,/must not persist|note|token|secret/);
});

test('missing or unauthorized ids fall back without exposing another account selection',()=>{
  assert.deepEqual(resolveAccountPosition(trees,
    {treeId:'not-visible',momentId:'foreign',view:'book'},
    {treeId:'tree-b',momentId:'root-b',view:'network'}),{
      position:{treeId:'tree-b',momentId:'root-b',view:'book'},
      treeMissing:true,momentMissing:false
    });
  assert.deepEqual(resolveAccountPosition(trees,
    {treeId:'tree A',momentId:'deleted',view:'board'}),{
      position:{treeId:'tree A',momentId:'root-a',view:'board'},
      treeMissing:false,momentMissing:true
    });
});

test('pending owner route is one-time and rejects public routes',()=>{
  const session=storage();
  assert.equal(stashPendingOwnerRoute(session,'#share/token/book'),false);
  assert.equal(stashPendingOwnerRoute(session,'#my/book?tree=tree-b&moment=root-b'),true);
  assert.equal(pendingOwnerRoute(session).treeId,'tree-b');
  assert.equal(pendingOwnerRoute(session).treeId,'tree-b');
  assert.equal(takePendingOwnerRoute(session).treeId,'tree-b');
  assert.equal(takePendingOwnerRoute(session),null);
});
