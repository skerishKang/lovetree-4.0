import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {parseMomentLink} from '../src/media.js';
import {createTree,addMoment,validateState,importTrees} from '../src/domain.js';
import {validateState as validateReader} from '../public/v41/domain.mjs';
import {workspaceModel} from '../public/v41/workspace-model.mjs';
import {createMemberSession} from '../public/v41/member-session.mjs';
const scope={window:{},URL,URLSearchParams};vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),scope);const media=scope.window.LTMedia;
const urls=['https://youtu.be/abc123DEF45?t=2분','https://www.youtube.com/watch?v=abc123DEF45&start=83','https://youtube.com/shorts/abc123DEF45','https://youtube.com/live/abc123DEF45','https://youtube.com/playlist?list=x','https://youtube.com.evil.test/watch?v=abc123DEF45','https://example.test/a.png?size=2','https://example.test/a.mp4','https://example.test/notes','javascript:alert(1)','https://user:pass@example.test/a.jpg'];
test('member media reuses current YouTube parser and exact-host/time normalization',()=>{for(const url of urls){const original=parseMomentLink(url),next=media.describe(url);assert.equal(next.openUrl,original.openUrl);if(original.kind==='youtube'){assert.equal(next.videoId,original.videoId);assert.equal(next.startSeconds,original.startSeconds);}}});
test('file-extension classification is URL-path based and preserves the original value',()=>{assert.equal(media.describe(urls[6]).kind,'photo');assert.equal(media.describe(urls[7]).kind,'video');assert.equal(media.describe('https://example.test/notes?name=x.jpg').kind,'link');assert.equal(media.describe('https://example.test/photo%2Ewebp').kind,'photo');for(const url of urls)assert.equal(media.describe(url).original,url);});
test('initial markup has no media source/iframe, escapes text and always leaves an original link',()=>{for(const url of urls.filter(u=>media.describe(u).openUrl)){const html=media.markup(url,'"><img src=x onerror=alert(1)>');assert.doesNotMatch(html,/<img|<video|<iframe/i);assert.match(html,/&lt;img/);assert.match(html,/target="_blank"/);assert.match(html,/noopener noreferrer/);}assert.doesNotMatch(media.markup('javascript:alert(1)'),/href=/);});
const fields={subject:'검수',title:'미디어 기록',note:'남기고 싶은 장면',emotion:'설렘',date:'2026-11-01',url:urls[6]};
test('all URL types survive backend/reader validation, JSON, import ids and parent/related mapping',()=>{let tree=createTree(fields);for(const url of urls.slice(0,9))tree=addMoment(tree,{...fields,url},tree.moments[0].id);const state={version:1,trees:[tree]},roundtrip=validateState(JSON.parse(JSON.stringify(state)));assert.deepEqual(roundtrip,state);assert.deepEqual(validateReader(roundtrip),state);const model=workspaceModel({revision:1,state});assert.deepEqual(model.trees[0].moments.map(m=>m.url),tree.moments.map(m=>m.url));const imported=importTrees({version:1,trees:[]},state);assert.deepEqual(imported.trees[0].moments.map(m=>m.url),tree.moments.map(m=>m.url));assert.notEqual(imported.trees[0].id,tree.id);});
test('bound member PUT and a new session GET preserve media URLs without a schema change',async()=>{let state={version:1,trees:[]},revision=0;const api={get:async()=>({ok:true,state,revision,subject:'qa',writeSubjectBound:true}),put:async b=>{state=validateState(b.state);return {ok:true,revision:++revision}},logout:async()=>({ok:true})};const session=createMemberSession({api,delay:()=>new Promise(()=>{})});await session.start();const first=session.apply('new',fields);session.apply('add',{...fields,url:urls[0]},first);await session.act('retry');assert.equal(revision,1);const restored=createMemberSession({api});await restored.start();assert.deepEqual(restored.state(),state);assert.equal(restored.state().trees[0].moments[1].url,new URL(urls[0]).href);session.dispose();restored.dispose();});

test('private aliases fetch on the current official host without rewriting stored values or trusting lookalikes',()=>{
 const name='12345678-1234-4234-8234-123456789abc.png',path='/api/media/'+name;
 for(const origin of ['https://lovetree.padiem.net','https://lovetree-4-0.pages.dev']){
  const scope={window:{},location:{origin},URL,URLSearchParams};
  vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),scope);
  const media=scope.window.LTMedia;
  for(const old of ['https://lovetree.padiem.net','https://lovetree-4-0.pages.dev']){
   const value=old+path,m=media.describe(value);assert.equal(m.privateFile,true);
   assert.equal(m.original,value);assert.equal(m.loadUrl,origin+path);assert.equal(media.privateAssetName(value),name);
   assert.doesNotMatch(media.markup(value),/target="_blank"/);
  }
  for(const value of ['https://evil.test'+path,'https://lovetree.padiem.net.evil.test'+path,origin+path+'?x=1',origin+'/api/media/not-a-uuid.png'])assert.equal(media.privateAssetName(value),null);
 }
 assert.equal(media.privateAssetName('https://lovetree-4-0.pages.dev'+path,'https://preview.test'),null);
});
