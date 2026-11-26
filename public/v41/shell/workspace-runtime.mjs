// 기록 선택과 빈 화면, 기록 상태 전환.
import {workspaceModel} from "../workspace-model.mjs";
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from "../selection-location.mjs";
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,unsavedNoticeText,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn,readBookDisplay,writeBookDisplay,bookDisplayVisible,readShelfView,writeShelfView,shelfViewVisible} from "../header-state.mjs";
import {connectionSignature} from "./panel-dirty.mjs";
import {createConnections} from "./connections.mjs";
import {createTreeTips} from "./tree-tips.mjs";

export function createWorkspaceRuntime(ctx){
  let shellConnections, mapMetaText, mountConnectionTool, setConnectionCount, connectionDirty, links, motionPaused, shellTreeTips, anyDialogOpen, tipsFollowDialogs, closeTreeTips, accountMenuOpen, tipsFollowAccountMenu, showTreeTips, syncTreeTips, navBar, narrowNav, onExploreRoute;
  function frames(){return ctx.shellScreens.frames();}

  function hideFrames(){return ctx.shellScreens.hideFrames();}

  function showInFrame(url,title){return ctx.shellScreens.showInFrame(url,title);}

  function show(file,write=true,treeKey='',fromHeaderTab=false){
   if(file==='src064-orbit.html')ctx.shellStageLoading.start('home');else ctx.shellStageLoading.cancel();
   return ctx.shellScreens.show(file,write,treeKey,fromHeaderTab);
  }

  function frameLoaded(frame){return ctx.shellScreens.frameLoaded(frame);}

  // #380 5번: '정리하기' 입구는 트리 ▾ 드롭다운 한 곳에서만 그린다(renderTreeMenu). 헤더 단추는 없앴다.
  function viewContext(){}

  function choose(id,momentId,skipShow=false){const tree=ctx.model.trees.find(t=>t.id===id);if(skipShow&&window.LT41?.tree?.id===tree?.id){window.LT41.momentId=tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id;window.LT41.prefs=(0,ctx.currentPrefs)();window.LT41.writable=ctx.source==='server'&&!!ctx.member?.snapshot().writable;return;}window.LT41=tree?{tree,trees:ctx.model.trees,source:ctx.source,momentId:tree.moments.find(m=>m.id===momentId)?.id||tree.moments.find(m=>m.parentId===null)?.id||tree.moments[0]?.id,prefs:(0,ctx.currentPrefs)(),writable:ctx.source==='server'&&!!ctx.member?.snapshot().writable,}:null;
    if(!skipShow&&(tree||ctx.current==='src064-orbit.html'))show(ctx.current,false,id||'');
   else if(!skipShow||!tree){(0,ctx.flowNavigation)();document.body.classList.remove('home-screen');hideFrames();
    // #1487: 로그인 확인 중에는 손님 안내('로그인하면 내 … 보여요')를 그리지 않고 첫 화면처럼 '불러오는 중'을 보인다.
    // 확인 응답 전에 이미 로그인한 사람에게 다시 로그인하라고 하지 않는다. 손님으로 확정되면 그때 빈 상태를 그린다.
    if(authPendingGuest()){waitAuthThenEmpty();return;}
    paintEmptyNow();}}

  function authPendingGuest(){return document.documentElement.dataset.ltAuthPhase==='pending'&&!ctx.member?.snapshot().owned;}
  // 261118 대표 결정: 트리 0개 계정이 주소(#my/shelf 등)로 바로 들어와도 그 화면의 빈 상태(#817)를 보여 준다 —
  // 탭을 눌러 열 때와 같은 문구('아직 책장이 비어 있어요.' 등)로 시작한다. 빈 상태에서는 불러올 화면이 없으므로 덮개도 걷는다(#1487).
  function paintEmptyNow(){ctx.shellStageLoading.cancel();paintEmptyForScreen(ctx.current);(0,ctx.$)('empty').hidden=false;links();}
  let authWait=null;
  function waitAuthThenEmpty(){
    (0,ctx.$)('empty').hidden=true;
    ctx.shellStageLoading.start('auth');
    if(authWait)return;
    const root=document.documentElement;
    authWait=new MutationObserver(()=>{
      if(root.dataset.ltAuthPhase==='pending')return;
      authWait.disconnect();authWait=null;
      // 회원이면 기록을 받은 쪽(choose·show)이 화면을 연다. 손님으로 확정됐고 열린 트리가 없을 때만 빈 상태를 그린다.
      if(ctx.member?.snapshot().owned||window.LT41||ctx.current==='src064-orbit.html')return;
      paintEmptyNow();
    });
    authWait.observe(root,{attributes:true,attributeFilter:['data-lt-auth-phase']});
  }

  // #453 D2: 빈 화면 문구·단추는 계정 상태에 맞춘다. 로그인한 사람에게 '로그인한 계정의 기록을 불러오세요'는 어색하고,
  // 백업 파일 열기는 계정 없이 쓰는 입구라 로그인 상태에서는 숨긴다(로그아웃은 지금 그대로 둔다).
  // 2026-11-17 대표 결정: 트리 0개 계정이 서재·책·보드·지도탭을 열면 그 화면의 빈 상태를 보여 준다.
  function paintEmptyForScreen(file){
    const empty=(0,ctx.$)('empty');
    const owned=!!ctx.member?.snapshot().owned;
    const shelf=file==='track32-bookshelf.html';
    if(shelf&&owned)empty.dataset.emptyView='shelf';else delete empty.dataset.emptyView;
    if(!owned){
      // 2026-11-23: 로그아웃 탭은 예시 트리 대신 보드와 같은 빈 상태를 보여 준다.
      const name=({'track32-bookshelf.html':'서재','track61-tree.html':'트리','track59-sketchbook.html':'책','track58-pinboard.html':'보드','track56-network.html':'지도','track60-graph.html':'지도'})[file]||'기록';
      empty.dataset.emptyGuest='1';
      empty.querySelector('h1').textContent=`로그인하면 내 ${name}${name==='책'?'이':'가'} 보여요`;
      empty.querySelector('p').textContent='로그인한 계정의 기록을 이 화면에서 볼 수 있어요.';
      (0,ctx.$)('empty-records').textContent='로그인';
    }else{
      delete empty.dataset.emptyGuest;
      empty.querySelector('h1').textContent=shelf?'아직 책장이 비어 있어요.':'아직 트리가 없어요.';
      empty.querySelector('p').textContent=shelf?'첫 순간을 담으면 책장에 책이 꽂혀요.':'좋아하는 영상 주소 하나면 시작돼요.';
      (0,ctx.$)('empty-records').textContent=shelf?'＋ 새 트리':'＋ 첫 순간 추가';
    }
    (0,ctx.$)('empty-records').hidden=false;(0,ctx.$)('empty-records').classList.add('primary');
    (0,ctx.$)('empty-sample').hidden=true;(0,ctx.$)('empty-file').hidden=true;
    // #822 6단계: 트리가 아직 없는 내 계정에는 '이미 모아 둔 영상이 있나요? 북마크에서 가져오기' 한 줄을 함께 보인다.
    void ctx.bookmarkEmptyEntry?.show(owned&&!!ctx.member?.snapshot().writable);
  }

  function paintEmptyCopy(){
    const owned=!!ctx.member?.snapshot().owned;
    delete (0,ctx.$)('empty').dataset.emptyView;
    delete (0,ctx.$)('empty').dataset.emptyGuest;
    (0,ctx.$)('empty').querySelector('h1').textContent=owned?'아직 트리가 없어요.':'다시 펼칠 순간을 기다리고 있어요.';
   // #463(2026-11-13): 트리 0개(로그인)는 처음 온 사람용 한 줄로. 예전 문구는 다시 온 사람용이었고
   // ("예시를 둘러보거나..."), 떠 있는 카드가 예시라는 것도 모호했다.
   (0,ctx.$)('empty').querySelector('p').textContent=owned
     ? '좋아하는 영상 주소 하나면 시작돼요. 지금 보이는 카드는 예시예요.'
     : '예시를 둘러보거나 로그인한 계정의 기록을 불러오세요.';
   (0,ctx.$)('empty-sample').hidden=false;(0,ctx.$)('empty-records').hidden=false;
   // #463: 로그인(트리 0개)에서는 ＋ 첫 트리 만들기가 주 버튼, 예시 둘러보기는 보조.
   // 로그아웃은 2026-11-07 첫 화면 시작 버튼 방침대로 지금 그대로 둔다.
   (0,ctx.$)('empty-records').textContent=owned?'＋ 첫 트리 만들기':'내 기록 불러오기';
   (0,ctx.$)('empty-records').classList.toggle('primary',owned);
   (0,ctx.$)('empty-sample').classList.toggle('primary',!owned);
   (0,ctx.$)('empty-file').hidden=owned;
   // #822 6단계: 북마크 입구 한 줄은 화면별 빈 상태(paintEmptyForScreen)에서만 보인다 — 이 문구로 바뀌면 거둔다.
   void ctx.bookmarkEmptyEntry?.show(false);
  }

  // #977: 작업 공간을 읽다 예외가 나도 셸 전체가 멈추지 않게 한다.
  // 서버 기록이면 지금 화면을 그대로 두고 안내만 남긴다(모델을 비우면 지도·책 이동까지 막힌다).
  // 파일 고르기·공유는 부른 쪽이 실패를 알 수 있도록 그대로 던진다(기존 동작 유지).
  function projectWorkspace(input){
   try{return workspaceModel(input);}
   catch(error){console.warn('[LT41] 작업 공간을 읽지 못했어요:',error?.message||String(error));return null;}
  }

  function load(input,kind,selection={},fallback={},example=null,silent=false){
   const projected=kind==='example'?{trees:[example||ctx.exampleTree].filter(Boolean)}:projectWorkspace(input);
   if(!projected){
    if(kind!=='server')throw new Error('기록을 읽을 수 없어요. 파일 형식을 확인해 주세요.');
    (0,ctx.notify)('기록을 불러오지 못했어요. 화면을 새로고침해 다시 시도해 주세요.',{hold:true});
    return {position:{treeId:null,momentId:null},treeMissing:false,momentMissing:false};
   }
   ctx.model=projected;
   ctx.source=kind;
   if(kind!=='share'){
    ctx.activeShareId=null;
    paintEmptyCopy();
   }
   document.body.dataset.recordSource=kind;
   document.body.dataset.member=ctx.member?.snapshot().owned?'in':'out';
   document.body.dataset.treeCount=String(ctx.model?.trees?.length||0);
   // #368: 트리 고르기는 맨 위 트리 ▾ 드롭다운 한 곳이다(옛 내 기록 창의 select는 없앴다).
   const resolved=resolveAccountPosition(ctx.model.trees,selection,fallback),chosen=ctx.model.trees.find(t=>t.id===resolved.position.treeId);
   // #1109: 회원 기록을 기다리는 동안 첫 화면 문서를 먼저 열지 않는다. 빈 서재·책·보드는 기존 빈 판을 그린다.
   if(silent&&(ctx.current==='src064-orbit.html'||onExploreRoute())){
    window.LT41=null;
    if(!onExploreRoute())ctx.shellStageLoading.start('home');
    return resolved;
   }
   // 예시나 회원 기록이 늦게 도착해도 먼저 고른 둘러보기는 그대로 둔다.
   const keepExplore=(kind==='server'||(kind==='example'&&ctx.exampleInitializing))&&onExploreRoute();
   choose(chosen?.id,resolved.position.momentId,keepExplore);
   return resolved;
  }

  function clear(silent=false){load({revision:0,state:{version:1,trees:[]}},'file',{},{},null,silent);}

  function stateSelection(){return {treeId:window.LT41?.tree.id,momentId:window.LT41?.momentId};}

  function formDirty(){return ctx.shellPanels.formDirty();}

  function treeDirty(){return ctx.shellPanels.treeDirty();}

  function canLeave(){return !(formDirty()||treeDirty()||ctx.member?.snapshot().dirty)||confirm('아직 저장되지 않은 입력이 있어요. 현재 기록을 백업한 뒤 이동하는 것을 권합니다. 저장하지 않고 이동할까요?');}

  function leaveMember(){if(!canLeave())return false;ctx.member?.dispose();ctx.member=null;return true;}

  // #453 A: 예시를 둘러보는 동안에도 "로그인한 계정"은 그대로 둔다. 저장 연결만 끊어(dispose) 예시 내용이 계정에 섞이지 않게 하고,
  // 다시 내 기록으로 돌아올 때는 startMember()가 새 연결을 연다. 로그아웃 상태면 지금처럼 셸 상태를 비운다.
  function pauseMember(){if(!canLeave())return false;if(!ctx.member?.snapshot().owned){ctx.member?.dispose();ctx.member=null;return true;}ctx.member.dispose();return true;}

  // #453 A: 예시를 둘러보는 중에 순간 추가·새 트리를 누르면 내 기록으로 돌아와서 이어 간다(로그인 화면으로 보내지 않는다).
  function resumeMember(intent){ctx.resumeAfterStart=intent||'write';return (0,ctx.startMember)();}

  // 이슈 644 3번: 저장 실패 떠가 이미 보이면 그 설명을 그대로 쓰고, 숨어 있는 동안(저장 중)에는 저장 중 설명을 연다.
  function explainSaveState(){
    if(!(0,ctx.$)('save-feedback').hidden)return; // 이미 떠 있다 — 그 떠가 같은 설명이다.
    const s=ctx.member?.status?.();
    (0,ctx.$)('save-message').textContent=unsavedNoticeText(s?.phase);
    (0,ctx.$)('save-actions').replaceChildren();
    (0,ctx.$)('save-feedback').hidden=false;
   }
  Object.defineProperties(ctx,{
    frames:{value:frames},
    hideFrames:{value:hideFrames},
    show:{value:show},
    frameLoaded:{value:frameLoaded},
    mountConnectionTool:{get:()=>mountConnectionTool,set:value=>{mountConnectionTool=value;}},
    connectionDirty:{get:()=>connectionDirty,set:value=>{connectionDirty=value;}},
    links:{get:()=>links,set:value=>{links=value;}},
    motionPaused:{get:()=>motionPaused,set:value=>{motionPaused=value;}},
    tipsFollowDialogs:{get:()=>tipsFollowDialogs,set:value=>{tipsFollowDialogs=value;}},
    closeTreeTips:{get:()=>closeTreeTips,set:value=>{closeTreeTips=value;}},
    syncTreeTips:{get:()=>syncTreeTips,set:value=>{syncTreeTips=value;}},
    choose:{value:choose},
    paintEmptyForScreen:{value:paintEmptyForScreen},
    paintEmptyCopy:{value:paintEmptyCopy},
    onExploreRoute:{get:()=>onExploreRoute,set:value=>{onExploreRoute=value;}},
    load:{value:load},
    clear:{value:clear},
    stateSelection:{value:stateSelection},
    formDirty:{value:formDirty},
    treeDirty:{value:treeDirty},
    leaveMember:{value:leaveMember},
    pauseMember:{value:pauseMember},
    resumeMember:{value:resumeMember},
    explainSaveState:{value:explainSaveState}
  });
  return {mount(){
    shellConnections=createConnections({$:ctx.$, document, window, panel:ctx.panel, show, writeLocation:ctx.writeLocation, connectionSignature, viewContext, get current(){return ctx.current}
     });

    ({ mapMetaText, mountConnectionTool, setConnectionCount, connectionDirty, links }=shellConnections);

    motionPaused=false;

    shellTreeTips=createTreeTips({$:ctx.$, document, localStorage, get model(){return ctx.model}, get current(){return ctx.current}, get source(){return ctx.source}, get member(){return ctx.member}, noticeQueue:ctx.noticeQueue, FIRST_TREE_TIPS, tipsWanted, readTipsSeen, writeTipsSeen, shellPanels:ctx.shellPanels, hideToast:ctx.hideToast, flowNavigation:ctx.flowNavigation
     });

    ({ anyDialogOpen, tipsFollowDialogs, closeTreeTips, accountMenuOpen, tipsFollowAccountMenu, showTreeTips, syncTreeTips }=shellTreeTips);

    // 2026-11-07: 390·360에서 탭 7개가 폭을 넘는다. 탭 줄은 가로 스크롤이고, 화면을 바꿀 때 현재 탭을 가운데로 당겨 보이게 한다.
    // 넘치는 쪽 끝에만 페이드를 켜서 잘린 것이 아니라 더 있다는 신호를 준다. 데스크톱(넓은 폭)은 스크롤이 없어 아무 일도 하지 않는다.
    navBar=document.querySelector('.app-header nav');

    narrowNav=()=>matchMedia('(max-width:780px)').matches;

    onExploreRoute=()=>/^#explore(?:\/moments)?$/.test(location.hash);
  }};
}
