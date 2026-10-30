import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerReader} from '../public/v41/server-reader.mjs';
const doc={ok:true,revision:0,state:{version:1,trees:[]}};
function setup(api){const events=[];return {events,reader:createServerReader({api,onClear:()=>events.push('clear'),onDocument:d=>events.push(d),onStatus:s=>events.push(s)})};}
test('successful read validates canonical document; 401 clears previous account',async()=>{
  const {reader,events}=setup({get:async()=>doc});await reader.read();assert.equal(events[0],'clear');assert.ok(events.includes(doc));
  const denied=setup({get:async()=>({ok:false,status:401})});await denied.reader.read();assert.equal(denied.events[0],'clear');assert.match(denied.events.at(-1),/로그인/);
});
test('logout discards stale read and never restores previous account',async()=>{
  let resolve;const {reader,events}=setup({get:()=>new Promise(r=>resolve=r),logout:async()=>({ok:true})});
  const pending=reader.read();await reader.logout();resolve(doc);await pending;assert.ok(!events.includes(doc));assert.match(events.at(-1),/로그아웃/);
});
test('malformed success and failed logout are explicit failures',async()=>{
  const {reader,events}=setup({get:async()=>({...doc,state:{version:9}}),logout:async()=>({ok:false})});await reader.read();assert.ok(!events.some(e=>e?.state));assert.match(events.at(-1),/형식/);await reader.logout();assert.match(events.at(-1),/실패/);
});
