import { MSG } from '../public/v41/frame-messages.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {parseMomentLink} from '../src/media.js';
import {createTree,addMoment,validateState,importTrees} from '../src/domain.js';
import {validateState as validateReader} from '../public/v41/domain.mjs';
import {workspaceModel} from '../public/v41/workspace-model.mjs';
import {createMemberSession} from '../public/v41/member-session.mjs';
import '../public/v41/youtube-id.mjs'; // #1060: 정본이 등록한 globalThis.LTYouTubeId 를 vm 에도 넣는다.
import '../public/v41/html-escape.mjs'; // A-15: 글자 막기 정본을 vm 에도 넣는다.
const scope={ LT41_MSG: MSG,window:{},URL,URLSearchParams,LTYouTubeId:globalThis.LTYouTubeId,LTEscapeHtml:globalThis.LTEscapeHtml};vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),scope);const media=scope.window.LTMedia;
const urls=['https://youtu.be/abc123DEF45?t=2분','https://www.youtube.com/watch?v=abc123DEF45&start=83','https://youtube.com/shorts/abc123DEF45','https://youtube.com/live/abc123DEF45','https://youtube.com/playlist?list=x','https://youtube.com.evil.test/watch?v=abc123DEF45','https://example.test/a.png?size=2','https://example.test/a.mp4','https://example.test/notes','javascript:alert(1)','https://user:pass@example.test/a.jpg'];
test('member media reuses current YouTube parser and exact-host/time normalization',()=>{for(const url of urls){const original=parseMomentLink(url),next=media.describe(url);assert.equal(next.openUrl,original.openUrl);if(original.kind==='youtube'){assert.equal(next.videoId,original.videoId);assert.equal(next.startSeconds,original.startSeconds);}}});
test('file-extension classification is URL-path based and preserves the original value',()=>{assert.equal(media.describe(urls[6]).kind,'photo');assert.equal(media.describe(urls[7]).kind,'video');assert.equal(media.describe('https://example.test/notes?name=x.jpg').kind,'link');assert.equal(media.describe('https://example.test/photo%2Ewebp').kind,'photo');for(const url of urls)assert.equal(media.describe(url).original,url);});
test('initial markup defers external media requests, escapes text and uses no-referrer links',()=>{for(const url of urls.filter(u=>media.describe(u).openUrl)){const html=media.markup(url,'안전한 제목'),escaped=media.markup(url,'"><img src=x onerror=alert(1)>');assert.doesNotMatch(html,/<img|<video|<iframe/i);assert.doesNotMatch(html,/<[^>]*\s(?:src|srcdoc)\s*=/i);assert.match(escaped,/&lt;img/);assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/referrerpolicy="no-referrer"/);}assert.doesNotMatch(media.markup('javascript:alert(1)'),/href=/);});
const fields={subject:'검수',title:'미디어 기록',note:'남기고 싶은 장면',emotion:'설렘',date:'2026-11-01',url:urls[6]};
test('all URL types survive backend/reader validation, JSON, import ids and parent/related mapping',()=>{let tree=createTree(fields);for(const url of urls.slice(0,9))tree=addMoment(tree,{...fields,url},tree.moments[0].id);const state={version:1,trees:[tree],prefs:{ titleDisplay:'both', displayName: '', accentColor: '', dateStyle:'dot', startPlace:'resume', shareView:'book', shareDiscover:false, treeChipOrder: [], bookDisplay: 'book', shelfView: 'shelf', homeMoment: { mode: 'last', treeId: '', momentId: '' } }},roundtrip=validateState(JSON.parse(JSON.stringify(state)));assert.deepEqual(roundtrip,state);assert.deepEqual(validateReader(roundtrip),state);const model=workspaceModel({revision:1,state});assert.deepEqual(model.trees[0].moments.map(m=>m.url),tree.moments.map(m=>m.url));const imported=importTrees({version:1,trees:[]},state);assert.deepEqual(imported.trees[0].moments.map(m=>m.url),tree.moments.map(m=>m.url));assert.notEqual(imported.trees[0].id,tree.id);});

test('bound member PUT and a new session GET preserve media URLs without a schema change',async()=>{let state={version:1,trees:[]},revision=0;const api={get:async()=>({ok:true,state,revision,subject:'qa',writeSubjectBound:true}),put:async b=>{state=validateState(b.state);return {ok:true,revision:++revision}},logout:async()=>({ok:true})};const session=createMemberSession({api,delay:()=>new Promise(()=>{})});await session.start();const first=session.apply('new',fields);session.apply('add',{...fields,url:urls[0]},first);await session.act('retry');assert.equal(revision,1);const restored=createMemberSession({api});await restored.start();assert.deepEqual(restored.state(),state);assert.equal(restored.state().trees[0].moments[1].url,new URL(urls[0]).href);session.dispose();restored.dispose();});

test('private aliases fetch on the current official host without rewriting stored values or trusting lookalikes',()=>{
 const name='12345678-1234-4234-8234-123456789abc.png',path='/api/media/'+name;
 for(const origin of ['https://lovetree.padiem.net','https://lovetree-4-0.pages.dev']){
  const scope={ LT41_MSG: MSG,window:{},location:{origin},URL,URLSearchParams,LTYouTubeId:globalThis.LTYouTubeId,LTEscapeHtml:globalThis.LTEscapeHtml};
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

// #791: 틱톡 — 주소 알아보기·세로 패널·늦은 재생기·썸네일 다시 받기.
const TT_ID='7252913073450106158';
const TT_CANONICAL=`https://www.tiktok.com/@tiktokofficial/video/${TT_ID}`;
const TT_SHORT='https://vm.tiktok.com/ZGd3XTri5/';
const ttScope={LT41_MSG:MSG,window:{},URL,URLSearchParams,LTYouTubeId:globalThis.LTYouTubeId,LTEscapeHtml:globalThis.LTEscapeHtml,location:{origin:'https://lovetree.local'},fetch:async()=>({ok:false})};
ttScope.window.parent=ttScope.window;
vm.runInNewContext(readFileSync(new URL('../public/v41/media-preview.js',import.meta.url),'utf8'),ttScope);
const ttMedia=ttScope.window.LTMedia;

test('틱톡 정본·짧은 주소를 알아보고 서버 해석과 같은 결과를 쓴다',()=>{
 for(const url of [TT_CANONICAL,TT_SHORT]){
  const original=parseMomentLink(url),next=ttMedia.describe(url);
  assert.equal(next.kind,'tiktok');
  assert.equal(next.openUrl,original.openUrl);
  assert.equal(next.videoId,original.videoId);
  assert.equal(next.vertical,true);
 }
 assert.equal(ttMedia.describe('https://www.tiktok.com/@x/photo/'+TT_ID).kind,'link');
 assert.equal(ttMedia.describe('https://vm.tiktok.com.evil.test/ZGd3XTri5/').kind,'link');
 assert.equal(ttMedia.tiktokPlayerId(TT_ID),TT_ID);
 assert.equal(ttMedia.tiktokPlayerId('not-a-number'),'');
});

test('틱톡 카드는 세로·플랫폼 표식·원본 열기 링크를 그리고 재생기는 누르기 전에 없다',()=>{
 const thumb='https://v16m-default.tiktokcdn.com/frame.jpg';
 const html=ttMedia.markup(TT_CANONICAL,'제목',{thumbnail:thumb,tiktokId:TT_ID,tiktokAuthor:'tiktokofficial'},'m1');
 assert.match(html,/data-lt-tiktok="1"/);
 assert.match(html,/data-lt-vertical="1"/);
 assert.match(html,/lt-tt-mark[^>]*>TikTok/);
 assert.match(html,/lt-tt-backdrop/);
 assert.match(html,/@tiktokofficial/);
 assert.match(html,/원본에서 열기/);
 assert.match(html,/ ↗/);
 assert.match(html,/data-lt-play/);
 assert.match(html,/data-lt-thumb-refresh/);
 assert.doesNotMatch(html,/embed\.js/);
 assert.doesNotMatch(html,/tiktok-embed/);
 const escaped=ttMedia.markup(TT_CANONICAL,'"><img src=x onerror=alert(1)>');
 assert.match(escaped,/&lt;img/);
});

test('공식 embed.js는 누를 때만 한 번 붙는다',()=>{
 const appended=[];
 const fakeDoc={head:{append(node){appended.push(node)}},querySelector(){return appended[0]||null},createElement(tag){return {tag,setAttribute(k,v){this[k]=v}}}};
 const script=ttMedia.ensureTiktokEmbedScript(fakeDoc);
 assert.equal(script.src,'https://www.tiktok.com/embed.js');
 assert.equal(appended.length,1);
 ttMedia.ensureTiktokEmbedScript(fakeDoc);
 assert.equal(appended.length,1,'중복으로 넣지 않는다');
});

test('시간이 지나 막힌 썸네일은 refresh 쿼리로 다시 받아 패널을 고친다',async()=>{
 const status={textContent:''},img={src:'',dataset:{}},backdrop={style:{setProperty(k,v){this[k]=v}}};
 const root={dataset:{ltUrl:TT_CANONICAL,ltMomentId:'m1'},isConnected:true,querySelector(sel){return sel==='.lt-media-status'?status:sel==='.lt-tt-thumb'?img:sel==='.lt-tt-backdrop'?backdrop:null;}};
 const calls=[];
 ttScope.fetch=async(url)=>{calls.push(url);return {ok:true,json:async()=>({thumbnailUrl:'https://v16m-default.tiktokcdn.com/new.jpg',videoId:TT_ID})};};
 await ttMedia.refreshTiktokThumb(root);
 assert.equal(calls.length,1);
 assert.match(calls[0],/\/api\/tiktok\/oembed\?url=/);
 assert.match(calls[0],/refresh=1/);
 assert.equal(img.src,'https://v16m-default.tiktokcdn.com/new.jpg');
 assert.equal(backdrop.style['--lt-tt-bg'],'url("https://v16m-default.tiktokcdn.com/new.jpg")');
 assert.equal(status.textContent,'썸네일을 다시 받았어요.');
});
