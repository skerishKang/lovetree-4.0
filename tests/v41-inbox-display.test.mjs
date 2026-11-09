import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// #327 2부: 모아둔 순간 표시·정리 화면. 계산은 inbox-model.mjs 한 벌이고, 화면은 그 결과를 그린다.
import {INBOX_LABEL, isInboxTree, shelfOrder, pickerLabel, headerBadge, josaRo, cleanupTargets, cleanupState, movedNotice, cleanupAvailable, moveAvailable} from '../public/v41/inbox-model.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

const inbox={id:'t1',title:'모아둔 순간',inbox:true,moments:[{id:'m1',title:'첫 순간',parentId:null},{id:'m2',title:'바다',parentId:'m1'}]};
const normal={id:'t2',title:'우리의 이야기',moments:[]};
const renamed={id:'t3',title:'정리 시험',inbox:true,moments:[]};

test('isInboxTree: 참/거짓뿐인 inbox 표시로만 판정한다',()=>{
 const rows=[[inbox,true],[normal,false],[renamed,true],[null,false],[{},false],[{inbox:'yes'},false],[{inbox:1},false]];
 for(const [tree,want] of rows)assert.equal(isInboxTree(tree),want,JSON.stringify(tree));
});

test('shelfOrder: 모아둔 순간을 책장 맨 앞에 고정하고 나머지 순서는 유지한다',()=>{
 const list=[normal,{id:'t4',title:'둘째 이야기'},renamed,inbox];
 assert.deepEqual(shelfOrder(list).map(t=>t.id),['t3','t1','t2','t4']);
 // inbox 가 없으면 원래 순서 그대로(새 배열, 원본 훼손 없음).
 const plain=[normal,{id:'t4'}];
 const sorted=shelfOrder(plain);
 assert.deepEqual(sorted.map(t=>t.id),['t2','t4']);assert.notEqual(sorted,plain);
 assert.deepEqual(shelfOrder([]),[]);assert.deepEqual(shelfOrder(undefined),[]);
});

test('pickerLabel: 기본 이름이면 표시를 한 번만, 바꾼 이름이면 이름 옆에 붙인다',()=>{
 assert.equal(pickerLabel(inbox),INBOX_LABEL);
 assert.equal(pickerLabel(renamed),'정리 시험 · '+INBOX_LABEL);
 // 자동 문구 트리는 접미사를 뗀 이름으로 보여 준다.
 assert.equal(pickerLabel({id:'t5',title:'여행, 나의 순간들'}),'여행');
 assert.equal(pickerLabel(normal),'우리의 이야기');
 assert.equal(pickerLabel(null),'');
});

test('headerBadge: 서버 기록의 inbox 트리일 때만 모아둔 순간',()=>{
 assert.equal(headerBadge(inbox),INBOX_LABEL);assert.equal(headerBadge(renamed),INBOX_LABEL);
 assert.equal(headerBadge(normal),'');assert.equal(headerBadge(null),'');
});

test('josaRo: 받침 없거나 ㄹ이면 로, 다른 받침이면 으로',()=>{
 const rows=[['정리 시험','으로'],['책','으로'],['길','로'],['서울','로'],['여행','으로'],['바다','로'],['트리','로'],['','로'],['Tree','로']];
 for(const [word,want] of rows)assert.equal(josaRo(word),want,word);
});

test('cleanupTargets: 자기 자신은 빠지고, 이름은 pickerLabel 을 쓴다',()=>{
 const trees=[inbox,normal,renamed];
 assert.deepEqual(cleanupTargets(trees,'t1'),[{id:'t2',label:'우리의 이야기'},{id:'t3',label:'정리 시험 · 모아둔 순간'}]);
 assert.deepEqual(cleanupTargets(trees,'t2'),[{id:'t1',label:INBOX_LABEL},{id:'t3',label:'정리 시험 · 모아둔 순간'}]);
 // inbox 트리 하나뿐이면 대상이 없다(새 트리 만들기만 가능).
 assert.deepEqual(cleanupTargets([inbox],'t1'),[]);
 assert.deepEqual(cleanupTargets(undefined,'t1'),[]);
});

test('cleanupState: 고른 순간·이름·대상으로 두 동작의 가능 여부와 문구를 계산한다',()=>{
 // 아무것도 고르지 않으면 둘 다 막힌다.
 const none=cleanupState({});
 assert.equal(none.count,0);assert.equal(none.canCreate,false);assert.equal(none.canMove,false);
 assert.equal(none.createLabel,'새 트리 만들기');assert.equal(none.moveLabel,'옮기기');
 assert.match(none.createHint,/먼저 골라/);assert.match(none.moveHint,/먼저 골라/);
 // 이름만 있으면 만들기, 대상만 있으면 옮기기.
 const name=cleanupState({selectedIds:['m1'],newTreeName:' 산책 '});
 assert.equal(name.canCreate,true);assert.equal(name.createLabel,'1개의 순간으로 새 트리 만들기');
 assert.equal(name.canMove,false);
 const target=cleanupState({selectedIds:['m1','m2'],targetId:'t2',targetLabel:'우리의 이야기'});
 assert.equal(target.canMove,true);assert.equal(target.moveLabel,'우리의 이야기로 옮기기');
 assert.equal(target.createLabel,'2개의 순간으로 새 트리 만들기');
 // 같은 순간을 두 번 고르면 한 번으로 센다.
 assert.equal(cleanupState({selectedIds:['m1','m1'],newTreeName:'가'}).count,1);
 // 이름이 공백뿐이면 만들 수 없다.
 assert.equal(cleanupState({selectedIds:['m1'],newTreeName:'   '}).canCreate,false);
 // 받침 있는 대상 이름은 '으로 옮기기'.
 assert.equal(cleanupState({selectedIds:['m1'],targetId:'t3',targetLabel:'정리 시험 · 모아둔 순간'}).moveLabel,'정리 시험 · 모아둔 순간으로 옮기기');
});

test('movedNotice: 옮겼어요 안내와 가 보기 단추 문구',()=>{
 assert.deepEqual(movedNotice({targetLabel:'우리의 이야기'}),{text:'우리의 이야기로 옮겼어요.',action:'가 보기'});
 assert.deepEqual(movedNotice({targetLabel:'정리 시험',isNew:true}),{text:'정리 시험으로 새 트리를 만들었어요.',action:'가 보기'});
 assert.equal(movedNotice({}).text,'로 옮겼어요.');
});

test('cleanupAvailable: 내 기록(서버·소유자)의 inbox 트리에서만 정리 화면을 연다',()=>{
 const rows=[
  [{source:'server',owned:true,tree:inbox},true],
  [{source:'server',owned:true,tree:normal},false],
  [{source:'server',owned:false,tree:inbox},false],
  [{source:'share',owned:true,tree:inbox},false],
  [{source:'example',owned:true,tree:inbox},false],
  [{source:'file',owned:true,tree:inbox},false],
  [{source:'server',owned:true,tree:null},false]];
 for(const [input,want] of rows)assert.equal(cleanupAvailable(input),want,JSON.stringify(input));
});

test('moveAvailable: 내 기록이면 일반 트리에서도 옮기기를 보여 준다',()=>{
 const rows=[[{source:'server',owned:true},true],[{source:'server',owned:false},false],[{source:'share',owned:true},false],[{source:'example',owned:true},false],[{source:'file',owned:true},false]];
 for(const [input,want] of rows)assert.equal(moveAvailable(input),want,JSON.stringify(input));
});

test('책장: inbox 트리를 맨 앞으로 정렬해 그리고 표시를 붙인다',()=>{
 const shelf=read('../public/v41/views/shelf/shelf.js');
 assert.match(shelf,/buildShelf\(shelfOrder\(LTDEMO\.library\)/);
 assert.match(shelf,/inbox-chip/);
 assert.match(shelf,/import \{ shelfOrder, INBOX_LABEL \} from '\.\.\/\.\.\/inbox-model\.mjs'/);
 const model=read('../public/v41/views/shelf/shelf-model.mjs');
 assert.match(model,/inbox: tree\.inbox === true/);
 // 보기 데이터(LTDEMO.library)에도 inbox 표시가 그대로 옮겨진다.
 const nav=read('../public/v41/view-navigation.js');
 assert.match(nav,/inbox:t\.inbox===true/);
});

test('셸: 헤더 표시·정리하기 단추·트리 고르기 목록이 inbox-model 을 쓴다',()=>{
 const shell=read('../public/v41/shell.mjs');
 // 헤더: 서버 기록의 inbox 트리면 '모아둔 순간' 표시를 보인다.
 assert.match(shell,/headerBadge\(c\.tree\)/);
 assert.match(shell,/isInboxTree\(c\.tree\)/);
 assert.match(shell,/\$\('cleanup-menu'\)\.hidden=!\(source==='server'&&member\?\.snapshot\(\)\.owned&&member\.snapshot\(\)\.writable&&isInboxTree\(c\.tree\)\)/);
 // 트리 고르기 목록: pickerLabel 한 벌.
 assert.match(shell,/o\.textContent=pickerLabel\(t\)/);
 assert.doesNotMatch(shell,/o\.textContent=displayTreeTitle\(t\.title\)/);
 // 정리 창 모듈 연결과 진입 단추.
 assert.match(shell,/createCleanup\(\{/);
 assert.match(shell,/\$\('cleanup-menu'\)\.onclick=\(\)=>shellCleanup\.open\(\{\}\)/);
 // 보기 메시지: 옮기기 요청은 서버 기록에서만 받는다.
 const messages=read('../public/v41/shell/messages.mjs');
 assert.match(messages,/lt41-move' && getSource\(\) === 'server'\) openCleanup\(\{ momentId: data\.momentId \}\)/);
});

test('정리 창: 순간 고르기·새 트리 만들기·옮기기·안내가 화면에 있다',()=>{
 const html=read('../public/v41/index.html');
 assert.match(html,/id="cleanup-menu"/);
 assert.match(html,/id="cleanup-panel"/);
 assert.match(html,/id="cleanup-moments"/);
 assert.match(html,/id="cleanup-new-name"/);
 assert.match(html,/id="cleanup-target"/);
 assert.match(html,/id="cleanup-create"/);
 assert.match(html,/id="cleanup-move"/);
 assert.match(html,/id="move-feedback"/);
 assert.match(html,/id="move-message"/);
 assert.match(html,/id="move-actions"/);
 const cleanup=read('../public/v41/shell/cleanup.mjs');
 // 저장은 기존 도메인 경로 그대로다.
 assert.match(cleanup,/apply\('treeFromMoments', \{ momentIds: pickedIds\(\), subject: name \}, \{ treeId: fromTreeId \}\)/);
 assert.match(cleanup,/apply\('moveMoment', \{ toTreeId: targetId \}, \{ treeId: fromTreeId, momentId \}\)/);
 // 옮긴 뒤 안내: '가 보기' 단추가 대상 트리로 보내고, 원래 트리에 머문다(트리가 남아 있을 때).
 assert.match(cleanup,/movedNotice\(\{ targetLabel, isNew \}\)/);
 assert.match(cleanup,/button\.textContent = notice\.action/);
 assert.match(cleanup,/choose\(treeId\)/);
 assert.match(cleanup,/stillThere && window\.LT41\?\.tree\?\.id !== fromTreeId/);
 assert.match(cleanup,/choose\(fromTreeId\)/);
 // 대상이 없으면 옮기기 칸을 숨긴다.
 assert.match(cleanup,/\$\('cleanup-move-box'\)\.hidden = !targets\.length/);
});

test('궤도: 현재 트리가 모아둔 순간이면 궤도 첫 화면에도 표시한다',()=>{
 const html=read('../v41/home.html');
 assert.match(html,/id="homeInboxFlag"/);
 const home=read('../v41/home.js');
 assert.match(home,/context\.tree&&context\.tree\.inbox===true/);
 assert.match(home,/homeInboxFlag/);
});

test('순간 상세의 옮기기: 내 기록에서만 보이고 공유·예시는 숨긴다',()=>{
 const book=read('../public/v41/views/book/book-extra.js');
 assert.match(book,/data-detail-move/);
 assert.match(book,/window\.parent\.LT41\.source==='server'/);
 assert.match(book,/lt41-move/);
 const runtime=read('../public/v41/runtime.js');
 assert.match(runtime,/context\.source==='server'/);
 assert.match(runtime,/lt41-move/);
 const board=read('../public/v41/views/board/board-extras.js');
 assert.match(board,/window\.parent\.LT41\.source==='server'&&!LTDEMO\.readOnly/);
 assert.match(board,/lt41-move/);
});
