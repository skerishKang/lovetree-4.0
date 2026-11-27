import test from 'node:test';
import assert from 'node:assert/strict';
import {createTree,editTree,addMoment,validateState as validateServerState,normalizePrefs} from '../src/domain.js';
import {validateState as validateBrowserState} from '../public/v41/domain.mjs';
import {createWorkspaceService} from '../server/workspace-service.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryTreeDiscoverRepo} from '../server/testing/memory-tree-discover-repo.js';
import {createMemoryCommunityRepo} from '../server/testing/memory-community-repo.js';
import {createShareHandler,createShareService,projectSharedTree,projectSharedTreeFromScan} from '../server/share-service.js';
import {PUBLIC_TREE_FIELDS,PUBLIC_MOMENT_FIELDS,PUBLIC_MEDIA_FIELDS,PUBLIC_VISIT_PREFS,projectPublicVisitPrefs} from '../server/public-projection.js';
import {createMemberSession} from '../public/v41/member-session.mjs';
import {safePublicThumbnail} from '../public/v41/public-thumbnail.mjs';
import {ApiError} from '../server/errors.js';

const PRODUCT='lovetree-test',CLOCK='2026-11-01T00:00:00.000Z';
const principal=subjectId=>({productId:PRODUCT,subjectId});
const first=createTree({subject:'윤슬',title:'첫 장면',note:'비밀 마음',emotion:'설렘',date:'2026-11-01',url:'https://front.test/api/media/123e4567-e89b-42d3-a456-426614174000.jpg'},CLOCK);
const second=createTree({subject:'다른 대상',title:'다른 트리',note:'절대 공개하지 않음',emotion:'위로',date:'2026-11-01',url:'https://example.com/public'},CLOCK);
const state={version:1,trees:[first,second]};

async function setup(documentState=state,admin=null,{visibilityRepo=null,discoverRepo=null,communityRepo=null}={}){
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 await workspace.write(principal('alice'),{state:documentState,expectedRevision:0,clientKey:'seed',});
 const shareRepo=createMemoryShareRepo();let n=0;
 const service=createShareService({shareRepo,workspaceRepo,visibilityRepo,discoverRepo,communityRepo,productId:PRODUCT,admin,makeId:()=>String(++n).padStart(24,'s')});
 const authenticate=async request=>principal(request.headers?.account||'alice');
 return {workspace,workspaceRepo,shareRepo,visibilityRepo,discoverRepo,communityRepo,service,handle:createShareHandler({authenticate,service,productId:PRODUCT})};
}
const request=(handle,method,path,body,account)=>handle({method,path,headers:{...(body?{'content-type':'application/json'}:{}),...(account?{account}:{})},body:body?JSON.stringify(body):''});

test('preview is non-mutating and explicit create exposes one projected tree only',async()=>{
 const {handle,workspaceRepo}=await setup(),input={treeId:first.id,entryMomentId:first.moments[0].id,view:'board'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 assert.equal(preview.status,200);assert.equal(preview.body.preview.tree.moments[0].url,'');assert.equal(preview.body.preview.omittedPrivateMedia,1);
 // #425 2번: 공개 응답에는 올린 사진 주소(/api/media/)가 한 건도 없다.
 assert.equal(JSON.stringify(preview.body).includes('/api/media/'),false,'미리보기에 올린 사진 주소가 없다');
 // 순간 자리(제목·감정·날짜·마음)와 개수는 그대로 남는다.
 const projectedMoment=preview.body.preview.tree.moments[0],sourceMoment=first.moments[0];
 assert.equal(preview.body.preview.tree.moments.length,first.moments.length,'순간 개수는 그대로');
 assert.deepEqual({title:projectedMoment.title,emotion:projectedMoment.emotion,date:projectedMoment.date,note:projectedMoment.note,parentId:projectedMoment.parentId},{title:sourceMoment.title,emotion:sourceMoment.emotion,date:sourceMoment.date,note:sourceMoment.note,parentId:sourceMoment.parentId},'순간 자리는 그대로');
 // 이미 올린 사진은 저장본에서 지워지지 않는다 — 공개 응답만 주소를 뺀다.
 const stored=await workspaceRepo.load({productId:PRODUCT,subjectId:'alice'});
 assert.equal(stored.doc.trees[0].moments[0].url,sourceMoment.url,'저장본의 사진 주소는 그대로');
 assert.deepEqual((await request(handle,'GET','/api/shares',null,'alice')).body.shares,[]);
 const unpreviewed=await request(handle,'POST','/api/shares',input,'alice');assert.equal(unpreviewed.status,409);assert.equal(unpreviewed.body.error.code,'share_preview_stale');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');assert.equal(made.status,201);assert.equal(made.body.share.discoverable,false);
 assert.equal((await request(handle,'PUT','/api/shares/'+made.body.share.id+'/discovery',null,'bob')).status,403);
 const listed=await request(handle,'PUT','/api/shares/'+made.body.share.id+'/discovery',null,'alice');assert.equal(listed.body.share.discoverable,true);
 const unlisted=await request(handle,'DELETE','/api/shares/'+made.body.share.id+'/discovery',null,'alice');assert.equal(unlisted.body.share.discoverable,false);
 const publicRead=await request(handle,'GET','/api/public/shares/'+made.body.share.id);
 assert.equal(publicRead.status,200);assert.equal(publicRead.headers['cache-control'],'no-store, max-age=0');
 assert.equal(publicRead.body.tree.id,made.body.share.id,'공개 트리 손잡이는 내부 트리 id가 아니라 공유 id다');
 assert.deepEqual(Object.keys(publicRead.body.share).sort(),['entryMomentId','id','view']);
 assert.deepEqual(Object.keys(publicRead.body.tree).sort(),PUBLIC_TREE_FIELDS.filter(key=>key!=='coverMode').sort());
 assert.equal(JSON.stringify(publicRead.body).includes(first.id),false,'주인 내부 트리 id는 응답에 없다');
 assert.equal('treeId' in publicRead.body.share,false,'공유 요약에 내부 treeId가 없다');
 assert.equal(publicRead.body.tree.moments[0].url,'');
 assert.equal(JSON.stringify(publicRead.body).includes('/api/media/'),false,'공유 응답에 올린 사진 주소가 없다');
 assert.equal(JSON.stringify(publicRead.body).includes(second.title),false);assert.equal('state' in publicRead.body,false);assert.equal(JSON.stringify(publicRead.body).includes('alice'),false);
});

test('공개 투영은 허용 목록 밖 필드를 버리고 내부 트리 id를 공유 id로 바꾼다',()=>{
 const source=structuredClone(first);
 source.email='owner@example.test';source.subjectId='owner-subject';source.treeId='owner-tree';source.prefs={displayName:'주인',accentColor:'rose'};source.futureTreeField='future-tree-value';
 const moment=source.moments[0];
 moment.copiedFrom='copied-source';moment.futureMomentField='future-moment-value';moment.links=[{id:'future-link'}];moment.keywords=['무대:시험',{value:'future-keyword'}];
 moment.mediaMetadata={title:'영상 제목',channel:'영상 채널',source:'private.example',thumbnail:'https://front.test/api/media/private-thumb.jpg',vertical:true,width:1080,height:1920,futureMediaField:'future-media-value'};
 const projected=projectSharedTreeFromScan({state:{trees:[source]}},source.id,'public-share-id');
 assert.equal(projected.tree.id,'public-share-id');
 assert.deepEqual(Object.keys(projected.tree).sort(),PUBLIC_TREE_FIELDS.filter(key=>key!=='coverMode').sort());
 assert.deepEqual(Object.keys(projected.tree.moments[0]).sort(),['createdAt','date','emotion','id','keywords','links','mediaMetadata','note','parentId','relation','title','url']);
 assert.deepEqual(Object.keys(projected.tree.moments[0].mediaMetadata).sort(),['channel','height','title','vertical','width']);
 assert.deepEqual(projected.tree.moments[0].links,[]);
 assert.deepEqual(projected.tree.moments[0].keywords,['무대:시험']);
 assert.equal(projected.tree.moments[0].url,'');
 assert.equal(projected.omittedPrivateMedia,1);
 const body=JSON.stringify(projected);
 for(const value of ['owner@example.test','owner-subject','owner-tree','future-tree-value','copied-source','future-moment-value','future-link','future-keyword','future-media-value','/api/media/'])assert.equal(body.includes(value),false,value);
 assert.equal(source.email,'owner@example.test','주인 저장 사본은 바뀌지 않는다');
 assert.equal(moment.copiedFrom,'copied-source','원본 복사 출처도 저장 사본에 남는다');
});

test('저장 미디어 형식은 서버와 화면에서 같고 원본 주소는 유지한다',()=>{
 const tree=createTree({subject:'저장 검사',title:'시작',note:'기록',emotion:'설렘',date:'2026-11-27',url:'https://example.com/video'},CLOCK);
 const metadata={title:'기존 영상',channel:'채널',source:'example.com',thumbnail:'http://images.example.com/old.jpg',thumbnailUrl:'https://images.example.com/alias.jpg',poster:'/api/media/private.jpg',image:'data:image/png;base64,AAAA',authorName:'저자',vertical:true,width:1080,height:1920,unknownKey:'저장 금지'};
 const record={version:1,trees:[{...tree,moments:[{...tree.moments[0],mediaMetadata:metadata}]}]};
 const expected={...metadata};delete expected.unknownKey;
 const server=validateServerState(record),browser=validateBrowserState(record);
 assert.deepEqual(browser,server,'서버와 화면 저장 모양이 같다');
 assert.deepEqual(server.trees[0].moments[0].mediaMetadata,expected,'모르는 키는 버리고 원본 주소는 남긴다');
 for(const bad of [[], '문자열', {title:'가'.repeat(241)}, {thumbnail:'가'.repeat(2049)}, {vertical:'true'}, {width:100001}, {height:NaN}]){
  const candidate={version:1,trees:[{...tree,moments:[{...tree.moments[0],mediaMetadata:bad}]}]};
  assert.throws(()=>validateServerState(candidate),'서버 거부');
  assert.throws(()=>validateBrowserState(candidate),'화면 거부');
 }
});

test('공개 썸네일은 유튜브 그림 호스트만 허용한다',()=>{
 const external='https://images.example.com/articles/og.jpg?size=large';
 for(const value of ['https://ytimg.com/vi/abc123DEF45/hqdefault.jpg','https://i.ytimg.com/vi/abc123DEF45/hqdefault.jpg'])assert.equal(safePublicThumbnail(value),value);
 for(const value of [external,'https://ytimg.com.evil.example/vi/abc123DEF45/hqdefault.jpg','https://i.ytimg.com.evil.example/img.jpg','https://i.ytimg.com/api/media/private.png','/api/media/private.png','https://front.test/api/media/private.png','http://images.example.com/og.jpg','data:image/png;base64,AAAA','javascript:alert(1)','ftp://images.example.com/og.jpg','https://user:pass@images.example.com/og.jpg'])assert.equal(safePublicThumbnail(value),'',value);
 const tree=createTree({subject:'시험 대상',title:'기사 링크',note:'비YouTube 링크',emotion:'설렘',date:'2026-11-27',url:'https://example.com/article',mediaMetadata:{title:'기사 제목',channel:'기사 채널',thumbnail:external}},CLOCK);
 const projected=projectSharedTree({version:1,trees:[tree]},tree.id);
 assert.equal(tree.moments[0].mediaMetadata.thumbnail,external,'저장 원본에는 외부 썸네일이 유지된다');
 assert.equal(projected.tree.moments[0].mediaMetadata.thumbnail,undefined,'공개 응답에서 외부 썸네일을 거른다');
 const blocked=createTree({subject:'시험 대상',title:'위험 링크',note:'위험 썸네일',emotion:'설렘',date:'2026-11-27',url:'https://example.com/article',mediaMetadata:{title:'기사 제목',thumbnail:'http://images.example.com/og.jpg'}},CLOCK);
 assert.equal(blocked.moments[0].mediaMetadata.thumbnail,'http://images.example.com/og.jpg','저장 원본에는 평문 썸네일이 남는다');
 assert.equal(projectSharedTree({version:1,trees:[blocked]},blocked.id).tree.moments[0].mediaMetadata.thumbnail,undefined,'공개 응답에서만 평문 주소를 거른다');
});

test('#611 3번: 공개 공유 읽기에는 aiTester 한 비트만 내린다(계정·이메일·subject는 넣지 않는다)',async()=>{
 const input={treeId:first.id,entryMomentId:first.moments[0].id,view:'board'};
 // 보통 기록: 표지가 없다.
 const plain=await setup();
 const pPrev=await request(plain.handle,'POST','/api/shares/preview',input,'alice');
 const pMade=await request(plain.handle,'POST','/api/shares',{...input,previewToken:pPrev.body.preview.previewToken},'alice');
 const pRead=await request(plain.handle,'GET','/api/public/shares/'+pMade.body.share.id);
 assert.equal(pRead.status,200);assert.equal(pRead.body.aiTester,undefined,'일반 기록에는 표시하지 않는다');
 assert.equal(JSON.stringify(pRead.body).includes('alice'),false);
 assert.equal(JSON.stringify(pRead.body).match(/@/),null,'이메일이 없다');
 // ai_customer 역할: aiTester:true만 있다.
 const ai=await setup(state,{roleFor:async value=>value.subjectId==='alice'?'ai_customer':null});
 const aPrev=await request(ai.handle,'POST','/api/shares/preview',input,'alice');
 const aMade=await request(ai.handle,'POST','/api/shares',{...input,previewToken:aPrev.body.preview.previewToken},'alice');
 const aRead=await request(ai.handle,'GET','/api/public/shares/'+aMade.body.share.id);
 assert.equal(aRead.body.aiTester,true,'AI 명예회원 비트(aiTester)');
 assert.equal(JSON.stringify(aRead.body).includes('alice'),false);
 assert.equal(JSON.stringify(aRead.body).match(/@/),null,'이메일이 없다');
 assert.equal(JSON.stringify(aRead.body).includes('subjectId'),false,'subject 식별자 필드를 내리지 않는다');
});

test('photo cover is projected to design or basic in the public tree while the stored tree keeps photo mode',async()=>{
 const photo=editTree(first,{title:first.title,subject:first.subject,coverMomentId:first.moments[0].id,coverDesign:'texture-2',coverMode:'photo'});
 const designed=await setup({version:1,trees:[photo]});
 const input={treeId:photo.id,entryMomentId:photo.moments[0].id,view:'book'};
 const preview=await request(designed.handle,'POST','/api/shares/preview',input,'alice');
 assert.equal(preview.status,200);
 assert.equal(preview.body.preview.tree.coverMode,'design','사진 표지 + 디자인 → 디자인 표지');
 assert.equal(preview.body.preview.tree.coverDesign,'texture-2');
 assert.equal(preview.body.preview.tree.coverMomentId,photo.moments[0].id,'표지 순간 자리는 그대로');
 assert.equal(preview.body.preview.tree.moments.length,photo.moments.length);
 const kept=(await designed.workspaceRepo.load({productId:PRODUCT,subjectId:'alice'})).doc.trees[0];
 assert.equal(kept.coverMode,'photo','저장본의 표지 방법은 바꾸지 않는다');
 assert.equal(kept.moments[0].url,first.moments[0].url);

 const plain=editTree(first,{title:first.title,subject:first.subject,coverMomentId:first.moments[0].id,coverDesign:'',coverMode:'photo'});
 const basic=await setup({version:1,trees:[plain]});
 const basicPreview=await request(basic.handle,'POST','/api/shares/preview',{...input,treeId:plain.id},'alice');
 assert.equal(basicPreview.body.preview.tree.coverMode,'basic','사진 표지 + 디자인 없음 → 기본 색 표지');
});

test('owner changes remain live, another account cannot revoke, and successful revoke is immediate',async()=>{
 const {handle,workspace}=await setup(),input={treeId:first.id,entryMomentId:first.moments[0].id,view:'book'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice'),id=made.body.share.id;
 const updated=structuredClone(state);updated.trees[0].title='바뀐 제목';
 await workspace.write(principal('alice'),{state:updated,expectedRevision:1,clientKey:'update'});
 assert.equal((await request(handle,'GET','/api/public/shares/'+id)).body.tree.title,'바뀐 제목');
 const denied=await request(handle,'DELETE','/api/shares/'+id,null,'bob');assert.equal(denied.status,403);assert.equal(denied.body.error.code,'share_forbidden');
 const revoked=await request(handle,'DELETE','/api/shares/'+id,null,'alice');assert.equal(revoked.status,200);
 const after=await request(handle,'GET','/api/public/shares/'+id);assert.equal(after.status,410);assert.equal(after.body.error.code,'share_revoked');
});

test('invalid, missing, deleted and account-isolated states stay distinct',async()=>{
 const {handle,workspace}=await setup();
 assert.equal((await request(handle,'GET','/api/public/shares/bad')).body.error.code,'share_invalid');
 assert.equal((await request(handle,'GET','/api/public/shares/'+'x'.repeat(24))).body.error.code,'share_not_found');
 const input={treeId:first.id,view:'network'},preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');
 await workspace.write(principal('alice'),{state:{version:1,trees:[second]},expectedRevision:1,clientKey:'remove'});
 const removed=await request(handle,'GET','/api/public/shares/'+made.body.share.id);assert.equal(removed.status,410);assert.equal(removed.body.error.code,'share_removed');
 assert.deepEqual((await request(handle,'GET','/api/shares',null,'bob')).body.shares,[]);
});

test('방문 읽기는 허용 목록과 서재 범위를 지키고 ETag 재검증을 지원한다',async()=>{
 const grow=tree=>addMoment(addMoment(tree,{title:'둘째 순간',note:'공개 기록',emotion:'설렘',date:'2026-11-02',url:''},tree.moments[0].id,CLOCK),{title:'셋째 순간',note:'공개 기록',emotion:'위로',date:'2026-11-03',url:''},tree.moments[0].id,CLOCK);
 const current=grow(structuredClone(first));
 const introduced=grow(createTree({subject:'다른 대상',title:'소개한 다른 트리',note:'공개 기록',emotion:'위로',date:'2026-11-01',url:'https://example.com/public'},CLOCK));
 const linkOnly=grow(createTree({subject:'링크 대상',title:'링크 전용 트리',note:'링크로만 공개',emotion:'설렘',date:'2026-11-01',url:'https://example.com/link'},CLOCK));
 const privateTree=grow(createTree({subject:'비공개 대상',title:'비공개 트리',note:'비공개 기록',emotion:'그리움',date:'2026-11-01',url:'https://example.com/private'},CLOCK));
 const discoverRepo=createMemoryTreeDiscoverRepo();
 const visibilityRepo={get:async({treeId})=>({visibility:treeId===privateTree.id?'private':'public'})};
 const communityRepo=createMemoryCommunityRepo({isPrivateTree:(p,s,t)=>t===privateTree.id,isDiscoverOn:(p,s,t)=>discoverRepo.isOn(p,s,t)});
 const prefs={dateStyle:'long',titleDisplay:'mine',bookDisplay:'list',shelfView:'shelf',treeChipOrder:[privateTree.id,introduced.id,'all',current.id,introduced.id,linkOnly.id,'unknown-id'],displayName:'private@example.test',accentColor:'rose',startPlace:'home',shareView:'board',shareDiscover:true,homeMoment:{mode:'tree',treeId:privateTree.id},futureKey:'secret-future',theme:'dark'};
 const {handle,shareRepo}=await setup({version:1,trees:[current,introduced,linkOnly,privateTree],prefs},null,{discoverRepo,visibilityRepo,communityRepo});
 const shares=[];
 for(const [shareId,tree] of [['v'.repeat(24),current],['w'.repeat(24),introduced],['x'.repeat(24),linkOnly],['y'.repeat(24),privateTree]]){
  const share=await shareRepo.create({productId:PRODUCT,shareId,subjectId:'alice',treeId:tree.id,entryMomentId:tree.moments[0].id,view:'book',momentCount:tree.moments.length});
  shares.push(share);
  await discoverRepo.set({productId:PRODUCT,subjectId:'alice',treeId:tree.id,discover:tree!==linkOnly});
 }
 communityRepo.seedShares(shares);
 const response=await request(handle,'GET','/api/public/visits/'+shares[0].shareId);
 assert.equal(response.status,200);
 assert.equal(response.headers['cache-control'],'private, no-cache');
 assert.match(response.headers.etag,/^"[A-Za-z0-9_-]+"$/);
 assert.deepEqual(Object.keys(response.body).sort(),['shelf','stats','tree','visit']);
 assert.deepEqual(Object.keys(response.body.stats).sort(),['comments','favored','favorites','hearted','hearts','mine','reactions','visits']);
 assert.deepEqual(Object.keys(response.body.visit).sort(),['aiTester','entryMomentId','momentCount','omittedPrivateMedia','ownerLabel','prefs','shareId','updatedAt','view']);
 assert.equal(response.body.tree.id,shares[0].shareId);
 assert.equal(response.body.visit.ownerLabel,'');
 assert.deepEqual(response.body.visit.prefs,{dateStyle:'long',titleDisplay:'mine',bookDisplay:'list',shelfView:'shelf',treeChipOrder:[shares[1].shareId,shares[0].shareId]});
 assert.deepEqual(Object.keys(response.body.visit.prefs).sort(),[...PUBLIC_VISIT_PREFS].sort());
 assert.deepEqual(response.body.shelf.map(item=>item.shareId),[shares[0].shareId,shares[1].shareId]);
 const body=JSON.stringify(response.body);
 for(const value of [current.id,introduced.id,linkOnly.id,privateTree.id,linkOnly.title,privateTree.title,'alice','@'])assert.equal(body.includes(value),false,value);
 const cached=await handle({method:'GET',path:'/api/public/visits/'+shares[0].shareId,headers:{'if-none-match':response.headers.etag}});
 assert.equal(cached.status,304);assert.equal(cached.body,undefined);assert.equal(cached.headers.etag,response.headers.etag);
 const linkResponse=await request(handle,'GET','/api/public/visits/'+shares[2].shareId);
 assert.equal(linkResponse.status,200);assert.deepEqual(linkResponse.body.shelf.map(item=>item.shareId),[shares[2].shareId],'링크 전용 입구는 자기 트리만 서재에 둔다');
 assert.deepEqual(linkResponse.body.visit.prefs.treeChipOrder,[shares[2].shareId]);
 const privateResponse=await request(handle,'GET','/api/public/visits/'+shares[3].shareId);
 assert.equal(privateResponse.status,403);assert.equal(privateResponse.body.error.code,'share_private');
 await shareRepo.revoke({productId:PRODUCT,subjectId:'alice',shareId:shares[0].shareId});
 const revoked=await request(handle,'GET','/api/public/visits/'+shares[0].shareId);
 assert.equal(revoked.status,410);assert.equal(revoked.body.error.code,'share_revoked');
});

// #986: 규칙이 바뀐 예전 문서처럼 저장소에 어긋난 트리(시작 순간이 둘)가 남아 있어도
// 읽을 수 있는 트리의 공유·공개 상태 설정은 계속 동작한다.
function deviantTree() {
  const tree = createTree({ subject: '어긋남', title: '어긋난 옛 트리', note: '', emotion: '설렘', date: '2026-11-01', url: '' }, CLOCK);
  const grown = { ...tree, moments: [...tree.moments, { ...tree.moments[0], id: 'moment-second-root', parentId: null }] };
  return grown;
}

test('방문 설정은 저장 문서의 새 필드와 개인 설정을 공개하지 않고 옛 문서는 기본값을 사용한다',async()=>{
 const {handle,workspaceRepo,shareRepo}=await setup();
 const shareId='p'.repeat(24);
 await shareRepo.create({productId:PRODUCT,shareId,subjectId:'alice',treeId:first.id,entryMomentId:first.moments[0].id,view:'book',momentCount:first.moments.length});
 const defaults=Object.fromEntries(PUBLIC_VISIT_PREFS.map(key=>[key,normalizePrefs()[key]]));
 const raw={dateStyle:'bad@example.test',titleDisplay:{subjectId:'alice'},bookDisplay:'bad',shelfView:'bad',treeChipOrder:[second.id,'all','unknown-id'],displayName:'owner@example.test',accentColor:'gold',startPlace:'home',shareView:'board',shareDiscover:true,homeMoment:{mode:'tree',treeId:second.id},futureKey:'secret-future',theme:'dark'};
 for(const [index,prefs] of [undefined,raw].entries()){
  const doc={version:1,trees:[first,second],...(prefs===undefined?{}:{prefs})};
  assert.equal((await workspaceRepo.commit({productId:PRODUCT,subjectId:'alice',doc,expectedRevision:index+1,clientKey:'raw-prefs-'+index,requestHash:String(index).repeat(64)})).status,'saved');
  const response=await request(handle,'GET','/api/public/visits/'+shareId);
  assert.equal(response.status,200);
  assert.deepEqual(response.body.visit.prefs,defaults);
  assert.deepEqual(Object.keys(response.body.visit.prefs).sort(),[...PUBLIC_VISIT_PREFS].sort());
  const body=JSON.stringify(response.body);
  for(const value of ['@','alice','subjectId',first.id,second.id,'secret-future','displayName','accentColor','startPlace','shareView','shareDiscover','homeMoment','futureKey','theme','unknown-id'])assert.equal(body.includes(value),false,value);
  assert.deepEqual((await workspaceRepo.load({productId:PRODUCT,subjectId:'alice'})).doc,doc);
 }
 assert.deepEqual(projectPublicVisitPrefs(raw,new Map()),defaults);
});

async function setupWithQuarantinedTree() {
  const workspaceRepo = createMemoryWorkspaceRepo();
  const deviant = deviantTree();
  await workspaceRepo.commit({
    productId: PRODUCT, subjectId: 'alice',
    doc: { version: 1, trees: [first, deviant] },
    expectedRevision: 0, clientKey: 'seed-quarantined', requestHash: '0'.repeat(64)
  });
  const shareRepo = createMemoryShareRepo(); let n = 0;
  const service = createShareService({ shareRepo, workspaceRepo, productId: PRODUCT, makeId: () => String(++n).padStart(24, 's') });
  const authenticate = async request => principal(request.headers?.account || 'alice');
  return { deviant, handle: createShareHandler({ authenticate, service, productId: PRODUCT }) };
}

test('격리 트리가 섞인 기록에서도 공유 만들기·공개 읽기는 읽을 수 있는 트리로 동작한다', async () => {
  const { handle } = await setupWithQuarantinedTree();
  const input = { treeId: first.id, entryMomentId: first.moments[0].id, view: 'board' };
  const preview = await request(handle, 'POST', '/api/shares/preview', input, 'alice');
  assert.equal(preview.status, 200, '미리보기가 500이 아니라 200이다');
  const made = await request(handle, 'POST', '/api/shares', { ...input, previewToken: preview.body.preview.previewToken }, 'alice');
  assert.equal(made.status, 201);
  const publicRead = await request(handle, 'GET', '/api/public/shares/' + made.body.share.id);
  assert.equal(publicRead.status, 200, '방문자의 공개 읽기도 500이 아니다');
  assert.equal(publicRead.body.tree.id, made.body.share.id, '읽을 수 있는 트리의 공개 손잡이는 공유 id다');
  assert.equal(JSON.stringify(publicRead.body).includes(first.id), false, '주인 내부 트리 id는 응답에 없다');
  assert.equal(JSON.stringify(publicRead.body).includes('어긋난 옛 트리'), false, '격리 트리 내용은 응답에 없다');
});

test('격리 트리가 섞인 기록에서도 본인 트리의 공개 상태 스위치는 동작한다', async () => {
  const { deviant, handle } = await setupWithQuarantinedTree();
  const shown = await request(handle, 'PUT', '/api/trees/' + first.id + '/visibility', { visibility: 'private' }, 'alice');
  assert.equal(shown.status, 200, '공개 상태 바꾸기가 500이 아니라 200이다');
  assert.equal(shown.body.visibility, 'private');
  const gone = await request(handle, 'PUT', '/api/trees/' + deviant.id + '/visibility', { visibility: 'private' }, 'alice');
  assert.equal(gone.status, 404, '격리 트리는 화면에 없으므로 대상이 되지 않는다');
});


test('다른 트리 저장과 제목 수정에도 미디어 원본을 보존하고 공개 응답에서만 거른다',async()=>{
 const original={title:'영상 제목',channel:'채널',source:'example.com',thumbnail:'http://images.example.com/old.jpg',thumbnailUrl:'https://images.example.com/alias.jpg',poster:'/api/media/private.jpg',image:'data:image/png;base64,AAAA',authorName:'옛 채널',vertical:true,width:1080,height:1920,futureMediaField:{memo:'저장하지 않을 정보'}};
 let a=createTree({subject:'기록',note:'첫 순간',emotion:'설렘',date:'2026-11-01',url:'https://example.com/video'},CLOCK);
 a.moments[0].mediaMetadata=structuredClone(original);
 const expectedOriginal=structuredClone(original);delete expectedOriginal.futureMediaField;
 a=addMoment(a,{title:'주소 없는 순간',note:'기록',emotion:'설렘',date:'2026-11-01',url:''},a.moments[0].id,CLOCK);
 const linkless={title:'보관 제목',channel:'채널',source:'INTERNAL_SOURCE_MARKER',thumbnail:'/api/media/private.jpg',poster:'https://example.com/alias.jpg'};
 a.moments[1].mediaMetadata=structuredClone(linkless);
 const b=structuredClone(second);
 const workspaceRepo=createMemoryWorkspaceRepo(),workspace=createWorkspaceService({repo:workspaceRepo,productId:PRODUCT});
 const owner=principal('alice');
 await workspaceRepo.commit({...owner,doc:{version:1,trees:[a,b]},expectedRevision:0,clientKey:'legacy',requestHash:'legacy'});
 const shareRepo=createMemoryShareRepo();const service=createShareService({shareRepo,workspaceRepo,productId:PRODUCT});
 const shareId='v'.repeat(24);await shareRepo.create({...owner,shareId,treeId:a.id,entryMomentId:a.moments[0].id,view:'book'});
 const handle=createShareHandler({authenticate:async()=>owner,service,productId:PRODUCT});
 const writes=[];
 const session=createMemberSession({api:{get:async()=>({ok:true,...await workspace.read(owner),subject:owner.subjectId,writeSubjectBound:true}),put:async body=>{writes.push(structuredClone(body));return {ok:true,...await workspace.write(owner,body)};}},delay:()=>new Promise(()=>{}),draftStorage:null,cacheStorage:null});
 try {
  await session.start();
  assert.deepEqual(session.state().trees[0].moments[0].mediaMetadata,expectedOriginal);
  for(const tree of [b,a]){
   const title=tree.title+' 수정';
   session.apply('editTree',{subject:tree.subject,title,coverMomentId:tree.coverMomentId},{treeId:tree.id});
   await session.act('retry');
   assert.deepEqual(writes.at(-1).state.trees[0].moments[0].mediaMetadata,expectedOriginal);
   const stored=await workspaceRepo.load(owner);
   assert.equal(stored.doc.trees.find(t=>t.id===tree.id).title,title);
   assert.deepEqual(stored.doc.trees[0].moments[0].mediaMetadata,expectedOriginal);
   assert.deepEqual(stored.doc.trees[0].moments[1].mediaMetadata,linkless);
   assert.deepEqual((await workspace.read(owner)).state.trees[0].moments[0].mediaMetadata,expectedOriginal);
   for(const kind of ['shares','visits']){
    const response=await request(handle,'GET','/api/public/'+kind+'/'+shareId);
    assert.equal(response.status,200);
    assert.deepEqual(response.body.tree.moments[0].mediaMetadata,{title:original.title,channel:original.channel,source:'example.com',vertical:true,width:1080,height:1920});
    assert.deepEqual(response.body.tree.moments[1].mediaMetadata,{title:linkless.title,channel:linkless.channel});
    assert.equal(JSON.stringify(response.body).includes(linkless.source),false);
   }
   assert.deepEqual((await workspaceRepo.load(owner)).doc,stored.doc,'공개 읽기는 저장 원본을 바꾸지 않는다');
  }
  assert.equal(writes.length,2);
 } finally {session.dispose();}
});

test('#1544 운영이 숨긴 공유는 없는 공유와 같은 404로 읽히고 숨김을 풀면 200이다',async()=>{
 const communityRepo=createMemoryCommunityRepo();
 const {handle}=await setup(state,null,{communityRepo});
 const input={treeId:first.id,view:'book'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');
 const id=made.body.share.id;
 const otherInput={treeId:second.id,view:'book'};
 const otherPreview=await request(handle,'POST','/api/shares/preview',otherInput,'alice');
 const otherMade=await request(handle,'POST','/api/shares',{...otherInput,previewToken:otherPreview.body.preview.previewToken},'alice');
 communityRepo.seedShares([
  {productId:PRODUCT,subjectId:'alice',treeId:first.id,shareId:id,status:'active',momentCount:first.moments.length},
  {productId:PRODUCT,subjectId:'alice',treeId:second.id,shareId:otherMade.body.share.id,status:'active',momentCount:second.moments.length}
 ]);
 const missing=await request(handle,'GET','/api/public/shares/'+'x'.repeat(24));
 assert.equal(missing.status,404);
 const normal=await request(handle,'GET','/api/public/shares/'+id);
 assert.equal(normal.status,200);
 await communityRepo.createReport({productId:PRODUCT,reportId:'report-1544-hide',shareId:id,subjectId:'moderator',reason:'확인',clientKey:'key-1544-hide'});
 const moderated=await communityRepo.moderateReport({productId:PRODUCT,reportId:'report-1544-hide',status:'resolved',visibility:'hidden',actorSubjectId:'moderator'});
 assert.equal(moderated.hidden,true);
 const hidden=await request(handle,'GET','/api/public/shares/'+id);
 assert.equal(hidden.status,404);
 assert.equal((await request(handle,'GET','/api/public/visits/'+id)).status,404);
 assert.deepEqual(hidden.body,missing.body,'응답 본문이 없는 공유와 같다');
 assert.deepEqual(hidden.headers,missing.headers,'응답 머리말이 없는 공유와 같다');
 assert.equal((await request(handle,'GET','/api/public/shares/'+otherMade.body.share.id)).status,200,'숨기지 않은 공유는 영향 없음');
 await communityRepo.moderateReport({productId:PRODUCT,reportId:'report-1544-hide',status:'dismissed',visibility:'visible',actorSubjectId:'moderator'});
 assert.equal((await request(handle,'GET','/api/public/shares/'+id)).status,200,'숨김을 풀면 200');
 assert.equal((await request(handle,'GET','/api/public/visits/'+id)).status,200);
});

test('#1544 숨김은 같은 트리의 다른 공유 주소에도 적용된다(둘러보기·무대와 같은 기준)',async()=>{
 const communityRepo=createMemoryCommunityRepo();
 const {handle}=await setup(state,null,{communityRepo});
 const input={treeId:first.id,view:'book'};
 const preview=await request(handle,'POST','/api/shares/preview',input,'alice');
 const made=await request(handle,'POST','/api/shares',{...input,previewToken:preview.body.preview.previewToken},'alice');
 const id=made.body.share.id,sibling='s'.repeat(24);
 communityRepo.seedShares([
  {productId:PRODUCT,subjectId:'alice',treeId:first.id,shareId:id,status:'active',momentCount:first.moments.length},
  {productId:PRODUCT,subjectId:'alice',treeId:first.id,shareId:sibling,status:'active',momentCount:first.moments.length}
 ]);
 await communityRepo.createReport({productId:PRODUCT,reportId:'report-1544-sibling',shareId:sibling,subjectId:'moderator',reason:'확인',clientKey:'key-1544-sibling'});
 await communityRepo.moderateReport({productId:PRODUCT,reportId:'report-1544-sibling',status:'resolved',visibility:'hidden',actorSubjectId:'moderator'});
 assert.equal(await communityRepo.isHiddenShare({productId:PRODUCT,shareId:id,subjectId:'alice',treeId:first.id}),true);
 assert.equal((await request(handle,'GET','/api/public/shares/'+id)).status,404,'같은 트리의 다른 주소도 막힌다');
 assert.equal(await communityRepo.isHiddenShare({productId:PRODUCT,shareId:id,subjectId:'bob',treeId:first.id}),false,'다른 계정의 같은 트리 아이디에는 번지지 않는다');
});

test('#1549 공유 만들기 쓰기 경로: 미로그인 401, 깨진 본문 400, 다른 형식 415, 없는 트리 410, 잘못된 보기는 기본값',async()=>{
 const {service}=await setup();
 const handle=createShareHandler({
  authenticate:async()=>{throw new ApiError(401,'unauthenticated','로그인이 필요해요.');},
  service,productId:PRODUCT
 });
 const call=(method,body,contentType='application/json')=>handle({
  method,path:'/api/shares',headers:{'content-type':contentType},
  body:contentType==='application/json'?JSON.stringify(body):String(body)
 });
 const anon=await call('POST',{treeId:first.id});
 assert.equal(anon.status,401);assert.equal(anon.body.error.code,'unauthenticated');
 const normal=createShareHandler({authenticate:async request=>principal(request.headers?.account||'alice'),service,productId:PRODUCT});
 const wrongType=await normal({method:'POST',path:'/api/shares',headers:{account:'alice','content-type':'text/plain'},body:'x'});
 assert.equal(wrongType.status,415,'현재는 형식 오류를 415로 돌려준다');assert.equal(wrongType.body.error.code,'unsupported_media_type');
 const brokenJson=await normal({method:'POST',path:'/api/shares',headers:{account:'alice','content-type':'application/json'},body:'{'});
 assert.equal(brokenJson.status,400);assert.equal(brokenJson.body.error.code,'invalid_json');
 const json=(body,path='/api/shares')=>normal({method:'POST',path,headers:{account:'alice','content-type':'application/json'},body:JSON.stringify(body)});
 const missingTree=await json({treeId:'bad'});
 assert.equal(missingTree.status,410,'없는 트리는 공유할 수 없다');assert.equal(missingTree.body.error.code,'share_removed');
 const preview=await json({treeId:first.id,view:'bogus'},'/api/shares/preview');
 assert.equal(preview.status,200);assert.equal(preview.body.preview.view,'book','잘못된 보기는 미리보기에서 기본값이 된다');
 const made=await json({treeId:first.id,view:'bogus',previewToken:preview.body.preview.previewToken});
 assert.equal(made.status,201,'잘못된 보기 값도 기본값으로 만들어진다');assert.equal(made.body.share.view,'book');
});

test('#1549 소개 스위치 쓰기 경로: 미로그인 PUT·DELETE 401, 잘못된 주소 404, 남의 공유 403',async()=>{
 const {service}=await setup();
 const handle=createShareHandler({
  authenticate:async()=>{throw new ApiError(401,'unauthenticated','로그인이 필요해요.');},
  service,productId:PRODUCT
 });
 const path='/api/shares/'+'s'.repeat(24)+'/discovery';
 for(const method of ['PUT','DELETE']){
  const anon=await handle({method,path,headers:{}});
  assert.equal(anon.status,401,method);assert.equal(anon.body.error.code,'unauthenticated');
 }
 const normal=createShareHandler({authenticate:async request=>principal(request.headers?.account||'alice'),service,productId:PRODUCT});
 const malformed=await normal({method:'PUT',path:'/api/shares/bad/discovery',headers:{account:'alice'}});
 assert.equal(malformed.status,404);assert.equal(malformed.body.error.code,'share_not_found');
 const json=(body,path='/api/shares')=>normal({method:'POST',path,headers:{account:'alice','content-type':'application/json'},body:JSON.stringify(body)});
 const preview=await json({treeId:first.id},'/api/shares/preview');
 assert.equal(preview.status,200);assert.ok(preview.body.preview,'미리보기가 만들어진다');
 const made=await json({treeId:first.id,previewToken:preview.body.preview.previewToken});
 assert.equal(made.status,201);assert.ok(made.body.share,'공유가 만들어진다');
 const own='/api/shares/'+made.body.share.id+'/discovery';
 for(const method of ['PUT','DELETE']){
  const other=await normal({method,path:own,headers:{account:'bob'}});
  assert.equal(other.status,403,method);assert.equal(other.body.error.code,'share_forbidden');
 }
});
