import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheMomentMediaMetadata, editMoment, importTrees, validateState} from '../public/v41/domain.mjs';
import {createMemberSession} from '../public/v41/member-session.mjs';

const timestamp = '2026-11-06T00:00:00.000Z';
const url = 'https://video.example/watch?id=trial';
function stateWithMoment(overrides = {}) {
  return validateState({version:1,trees:[{
    id:'trial-tree',subject:'시험용 대상',title:'시험 트리',coverMomentId:'',createdAt:timestamp,updatedAt:timestamp,
    moments:[{id:'trial-moment',parentId:null,links:[],createdAt:timestamp,title:'시험 영상',note:'메모',emotion:'설렘',date:'2026-11-06',relation:'',url,...overrides}]
  }]});
}

test('caches provider title and channel with a source derived from the original URL', () => {
  const state = stateWithMoment();
  const tree = cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{
    title:'영상 제목',channel:'채널 이름',source:'untrusted.example'
  },timestamp);
  assert.deepEqual(tree.moments[0].mediaMetadata,{
    title:'영상 제목',channel:'채널 이름',source:'video.example'
  });
  assert.equal(validateState({version:1,trees:[tree]}).trees[0].moments[0].mediaMetadata.source,'video.example');
});

test('keeps metadata through an edit that leaves the original URL unchanged', () => {
  const state = stateWithMoment({mediaMetadata:{title:'영상 제목',channel:'채널 이름',source:'video.example'}});
  const edited = editMoment(state.trees[0],'trial-moment',{
    title:'고친 제목',note:'수정한 메모',emotion:'설렘',date:'2026-11-06',relation:'',url
  },timestamp);
  assert.deepEqual(edited.moments[0].mediaMetadata,state.trees[0].moments[0].mediaMetadata);
});

test('clears stale metadata when a moment gets a different URL', () => {
  const state = stateWithMoment({mediaMetadata:{title:'영상 제목',channel:'채널 이름',source:'video.example'}});
  const edited = editMoment(state.trees[0],'trial-moment',{
    title:'고친 제목',note:'수정한 메모',emotion:'설렘',date:'2026-11-06',relation:'',url:'https://other.example/watch'
  },timestamp);
  assert.equal(edited.moments[0].mediaMetadata,undefined);
});

test('retains cached metadata in exported and imported states and ignores mismatched URLs', () => {
  const state = stateWithMoment();
  const tree = cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{title:'영상 제목',channel:'채널 이름'},timestamp);
  assert.equal(cacheMomentMediaMetadata(tree,'trial-moment','https://other.example/watch',{title:'잘못된 대상',channel:'채널'},timestamp),tree);
  const exported = validateState({version:1,trees:[tree]});
  const imported = importTrees({version:1,trees:[]},exported);
  assert.deepEqual(imported.trees[0].moments[0].mediaMetadata,{
    title:'영상 제목',channel:'채널 이름',source:'video.example'
  });
  assert.equal(imported.trees[0].moments[0].url,url);
});

test('member-session persists explicitly loaded metadata through the normal workspace write', async () => {
  const initial = stateWithMoment();
  let written = null;
  const session = createMemberSession({
    api:{
      get:async()=>({ok:true,status:200,revision:1,subject:'trial-subject',writeSubjectBound:true,state:initial}),
      put:async body=>{written=body;return{ok:true,status:200,revision:2};},
      logout:async()=>({ok:true,status:200})
    },
    delay:()=>Promise.resolve(),
    draftStorage:null
  });
  await session.start();
  session.apply('cacheMediaMetadata',{url,mediaMetadata:{title:'영상 제목',channel:'채널 이름'}},{treeId:'trial-tree',momentId:'trial-moment'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(session.state().trees[0].moments[0].mediaMetadata.source,'video.example');
  assert.equal(written?.state?.trees[0]?.moments[0]?.mediaMetadata?.channel,'채널 이름');
  session.dispose();
});

test('#1038: 실측 세로값은 미디어 정보 캐시에 남고 내보내기·가져오기에서도 유지된다', () => {
  const state = stateWithMoment();
  const tree = cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{
    title:'영상 제목', vertical:true, width:1080, height:1920
  },timestamp);
  const exported = validateState({version:1,trees:[tree]});
  const imported = importTrees({version:1,trees:[]},exported);
  assert.deepEqual(imported.trees[0].moments[0].mediaMetadata,{
    title:'영상 제목',channel:'',source:'video.example',vertical:true,width:1080,height:1920
  });
  assert.throws(()=>cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{vertical:'true'},timestamp),/참이나 거짓/);
  assert.throws(()=>cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{height:-5},timestamp),/숫자/);
});


test('같은 주소의 영상 정보 갱신은 기존 썸네일과 별칭을 지우지 않는다', () => {
 const original={title:'기존 제목',channel:'채널',source:'video.example',thumbnail:'http://video.example/old.jpg',thumbnailUrl:'https://video.example/alias.jpg',poster:'/api/media/private.jpg',image:'data:image/png;base64,AAAA',vertical:true,width:1080,height:1920,futureMediaField:{saved:true}};
 const state=stateWithMoment({mediaMetadata:original});
 const allowedOriginal={...original};delete allowedOriginal.futureMediaField;
 const updated=cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{title:'새 영상 제목',channel:'새 채널'},timestamp);
 assert.deepEqual(updated.moments[0].mediaMetadata,{...allowedOriginal,title:'새 영상 제목',channel:'새 채널'});
 const dimensions=cacheMomentMediaMetadata(state.trees[0],'trial-moment',url,{width:720,height:1280},timestamp);
 assert.deepEqual(dimensions.moments[0].mediaMetadata,{...allowedOriginal,width:720,height:1280});
 assert.deepEqual(state.trees[0].moments[0].mediaMetadata,allowedOriginal,'초기 저장 상태도 모르는 키를 제외한다');
});
