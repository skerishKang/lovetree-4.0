import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createShareApi} from '../public/v41/share-api.mjs';
test('share client uses only fixed same-origin endpoints',async()=>{
 const calls=[],fetchImpl=async(url,init={})=>{calls.push([url,init.method||'GET',init.body]);return new Response(JSON.stringify(url.includes('/public/')?{share:{id:'token'},tree:{}}:{shares:[]}),{headers:{'content-type':'application/json'}});};
 const api=createShareApi({fetchImpl});await api.preview({treeId:'t'});await api.create({treeId:'t'});await api.list();await api.setDiscoverable('abc',true);await api.revoke('abc');await api.read('abc');
 assert.deepEqual(calls.map(c=>c.slice(0,2)),[['/api/shares/preview','POST'],['/api/shares','POST'],['/api/shares','GET'],['/api/shares/abc/discovery','PUT'],['/api/shares/abc','DELETE'],['/api/public/shares/abc','GET']]);
});
// #952: 셸·HTML·CSS 글자 검사 16개를 걷어냈다. 링크 만들기 전 미리보기 확인·공개 읽기 경로·회수 안내·
// 공개 범위 문구는 이제 동작 시험이 본다 — 공유 창 단계(v41-share-steps: 미리보기 전 링크 막힘·3단계·discover PUT),
// 손님 화면(v41-share-guest-635: ?open=·쓰기 0건), 공개 응답(pages-search-preview: 회수 안내·noindex·카드).
// 남은 것은 셸이 실제로 부르는 api 표면이다.
test('4.1 share api 표면: 트리 공개는 setTreeVisibility·둘러보기 소개는 setTreeDiscover로 부른다', () => {
 const api=createShareApi({fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json'}})});
 assert.equal(typeof api.setTreeVisibility,'function','설정의 트리 공개는 setTreeVisibility(visibility PUT)');
 assert.equal(typeof api.setTreeDiscover,'function','둘러보기 소개는 setTreeDiscover(서버가 판단)');
 // 옛 setDiscoverable은 share-api.mjs에 남아 있지만 부르는 곳이 없다(셸은 discover PUT을 쓴다 — v41-share-steps 5번).
 // 지울지는 제품 코드 정리 건으로 따로 볼 일이라 이 PR에서 손대지 않는다.
});
