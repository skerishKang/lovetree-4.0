// 회원 기록 불러오기와 저장 상태 반영.
import { MSG } from "../frame-messages.mjs";
import {memberLoginUrl,shouldLoadMemberRecords} from "../member-entry.mjs";
import {workspaceModel} from "../workspace-model.mjs";
import {createWorkspaceApi, setMemberRefreshStarted} from "../api.mjs";
import {createMemberSession} from "../member-session.mjs";
import {clearCachedWorkspace, readCachedWorkspace, readLoginSubject, forgetLoginSubject} from "../workspace-cache.mjs";
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from "../selection-location.mjs";
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,unsavedNoticeText,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn,readBookDisplay,writeBookDisplay,bookDisplayVisible,readShelfView,writeShelfView,shelfViewVisible} from "../header-state.mjs";
import {parseJourneyRoute,journeyRouteDecision} from "../first-journey.mjs";
import {screens,screenForView,viewForFile,themedViewFor} from "./navigation.mjs";
import {report} from "../report.mjs";
import {createNotifier, syncedNoticeText, newlyPublishedTrees, NOTICE_HIDE_MS} from "./notice.mjs";
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment, normalizeBookDisplay, normalizeShelfView, coverModeOf, normalizeCoverDesign} from "../domain.mjs";

export function createMemberRuntime(ctx){
  function memberStatus(status){
    ctx.shellIntake.flush();
    const failed=status.dirty&&['offline','rejected','conflict','login'].includes(status.phase);
   (0,ctx.$)('save-feedback').hidden=!failed;
   (0,ctx.$)('save-message').textContent=failed?
    (status.phase==='login'
     ?'로그인이 만료되어 서버에 저장하지 못했어요. 새 창에서 로그인한 뒤 이 탭을 새로고침하면 입력을 복원합니다.'
     :status.detail||'서버에 저장하지 못했어요. 이 화면을 닫지 말고 다시 저장해 주세요.')
    :'';
   (0,ctx.$)('save-actions').replaceChildren();
   if(failed){
    if(status.phase==='conflict'){
     // 이슈 644 3번: 충돌 떠는 쉬운 말 + 주 단추 하나(최신 기록 불러오기). 불러오기 전에 이 화면 기록을
     // 자동으로 백업해 기록 손실이 없게 한다. '덮어쓰기'는 '자세히' 안에 둔다 — 저장 규칙은 그대로다.
     (0,ctx.$)('save-message').textContent=status.detail||'';
     const pull=status.actions.find(a=>a.name==='pull');
     if(pull){
      const primary=document.createElement('button');
      primary.className='primary';
      primary.textContent=pull.label||'최신 기록 불러오기';
      primary.onclick=async()=>{(0,ctx.backup)();await ctx.member?.act('pull');};
      (0,ctx.$)('save-actions').append(primary);
     }
     const force=status.actions.find(a=>a.name==='force');
     if(force){
      const more=document.createElement('button');
      more.textContent='자세히';
      more.setAttribute('aria-expanded','false');
      const extra=document.createElement('div');
      extra.className='save-extra';
      extra.hidden=true;
      const overwrite=document.createElement('button');
      overwrite.textContent=force.label||'이 화면 것으로 덮어쓰기';
      overwrite.onclick=async()=>{
       if(!confirm('이 화면의 기록을 서버에 저장하고, 다른 곳에서 바뀐 기록은 지워질 수 있어요. 계속할까요?'))return;
       extra.hidden=true;
       await ctx.member?.act('force');
      };
      const keep=document.createElement('button');
      keep.textContent='현재 기록 백업';
      keep.onclick=ctx.backup;
      extra.append(overwrite,keep);
      more.onclick=()=>{extra.hidden=!extra.hidden;more.setAttribute('aria-expanded',String(!extra.hidden));};
      (0,ctx.$)('save-actions').append(more,extra);
     }
    }
    else{
    for(const a of status.actions.filter(a=>['retry','pull','force','login','backup'].includes(a.name))){
     const b=document.createElement('button');
     b.textContent=a.name==='login'?'새 창에서 로그인':a.label;
     b.onclick=async()=>{
      if(a.name==='backup'){(0,ctx.backup)();return;}
      if(a.name==='login'){forgetLoginSubject(localStorage);/* A-18: 새 로그인은 확인된 계정이 없어지는 일 — 표식을 비우고 새 창으로 보낸다 */window.open(memberLoginUrl(readTheme(localStorage)),'_blank','noopener,noreferrer');return;}
      if(['pull','force'].includes(a.name)&&!confirm(a.name==='pull'
       ?'미저장 변경을 버리고 서버 기록을 불러올까요?'
       :'서버의 최신 기록으로 현재 입력을 덮어쓸까요? 다른 창의 변경이 사라질 수 있습니다.'))return;
      await ctx.member?.act(a.name);
     };
     (0,ctx.$)('save-actions').append(b);
    }
    if(!status.actions.some(a=>a.name==='backup')){const b=document.createElement('button');b.textContent='현재 기록 백업';b.onclick=ctx.backup;(0,ctx.$)('save-actions').append(b);}
    }
   }
   if(status.phase==='checking')(0,ctx.notify)('내 기록을 불러오고 있어요.');
   else if(status.phase==='synced'){
    // #984: 저장이 서버에서 확인되면(직전 미저장→synced) 열린 화면에 표지·이름 다시 그리기를 알린다.
    // 실패(rejected·offline·conflict·login)에서는 알리지 않는다 — 화면은 원래 표지를 그대로 두고 저장 안내 떠가 실패를 알린다.
    if(ctx.previousDirty){try{for(const f of (0,ctx.frames)())f.contentWindow?.postMessage({type:MSG.treesSaved},location.origin);}catch(error){report(error, '저장 알림 보내기');}}
    // #549: 기록(순간)이 0개인 새 계정의 첫 안내는 '불러왔어요' 대신 첫 순간 안내로(문구는 notice.mjs 한 벌).
    // #905: 자동 저장이 성공하면 알리지 않는다 — 직전에 저장 안 됨이었다면(previousDirty) 방금 저장된 것이다.
    // 알림은 실패·오프라인·충돌(저장 안내 떠)과 사용자가 누른 큰 동작의 완료 확인만 띄운다.
    const momentCount=(ctx.model?.trees||[]).reduce((n,tree)=>n+((tree.moments||[]).length),0);
    // #1076: 서버 기록을 처음 불러왔을 때만 한 번 — 화면 이동·다시 띄우기로 오는 synced 상태에서는 띄우지 않는다.
    if(!ctx.previousDirty){
     const text=syncedNoticeText({writable:status.writable,previousDirty:ctx.previousDirty,momentCount}),key='synced:'+String(ctx.member?.snapshot()?.subject||'session');
     // #952: 빈 첫 화면을 미리 열지 않으면 기록 응답이 새 소식 확인보다 앞설 수 있다.
     // 새 소식 띠가 줄에 들어온 뒤 안내를 올려야 먼저 보였다가 가려지는 일이 없다.
     if(!ctx.syncedNoticeKeys.has(key)){
      const generation=ctx.loadGeneration;
      void ctx.shellSettings.updatesReady.then(()=>{
       if(generation!==ctx.loadGeneration||!ctx.member?.snapshot().owned||ctx.syncedNoticeKeys.has(key))return;
       ctx.syncedNoticeKeys.add(key);
       ctx.noticeQueue.request('toast',{maxWait:5000,
        show:()=>ctx.shellNotice.notifyOnce(text,key),
        hide:ctx.hideToast
       });
      }).catch(error=>report(error,'새 소식 확인'));
     }
    }
    // 소개 질문(2026-11-16 대표 결정): 아직 안 물은 트리 중 순간 3개 이상인 것이 있으면 묻는다 —
    // 2→3 저장 직후가 대표 경로다. 직전 관측 스냅샷(상태마다 재촬영)은 두지 않는다(#718 원인): 재촬영하면
    // syncing에서 before==after가 되어 전이를 놓친다. 질문은 트리당 1회(discoverAsked), 백필(이미 켜진)은 건너뛴다.
    const treeCounts=(0,ctx.countTreeMoments)();
    const askCandidates=status.writable
     ?newlyPublishedTrees(null,treeCounts).filter(row=>!(0,ctx.discoverAskedList)().includes(row.treeId))
     :[];
    const askTree=askCandidates[0]||null;
    if(askTree)(0,ctx.askDiscover)(askTree.treeId);
    // #538: 첫 순간을 담은 뒤 한 번, 공개 방식(링크 공유·둘러보기 소개 기본 꺼짐)과 익명성을 알린다. 기기당 1회.
    // 질문 창이 뜨는 저장에서는 같은 사실(공개 방식·익명성)이라 여기는 건너뛴다.
    else if(ctx.previousDirty&&status.writable&&(ctx.model?.trees||[]).some(tree=>tree.moments.length>0)){
     let shown=false;try{shown=localStorage.getItem('lt41.publicNoticeShown')==='1';}catch{}
     if(!shown)(0,ctx.notifyPublicBanner)((ctx.model?.trees||[])[0]?.id);
    }
   }
   else if(status.phase==='login'&&!status.dirty&&document.body.dataset.member==='in')(0,ctx.notify)('로그인이 필요해요.');/* #1175: 로그아웃 상태로 시작할 때(저장 연결 확인 401)는 진입만으로 알림을 띄우지 않는다 — 머리글의 로그인 단추가 이미 길을 알린다. */
   else if(!status.dirty&&status.phase==='offline')(0,ctx.notify)(status.detail||'내 기록을 불러오지 못했어요.');
   (0,ctx.$)('write-menu').textContent=status.dirty?'저장 안 됨' :'＋ 순간 추가';
   // #1109: 내 화면을 먼저 고른 경우 빈 판 안내를 회원 상태 알림이 덮지 않는다.
   if(ctx.current!=='src064-orbit.html'&&!window.LT41&&ctx.source!=='share'&&!(0,ctx.$)('empty').hidden)(0,ctx.paintEmptyForScreen)(ctx.current);
   else{(0,ctx.$)('empty-records').textContent=status.writable?'＋ 첫 트리 만들기':'내 기록 불러오기';(0,ctx.$)('empty-records').classList.toggle('primary',!!status.writable);(0,ctx.$)('empty-sample').classList.toggle('primary',!status.writable);}
   ctx.previousDirty=status.dirty;(0,ctx.renderAccount)();(0,ctx.flowNavigation)();document.body.dataset.member=ctx.member?.snapshot().owned?'in':'out';document.body.dataset.treeCount=String(ctx.model?.trees?.length||0);(0,ctx.applyAdvanced)();
  }

  async function startMember(){setMemberRefreshStarted(true);if(!(0,ctx.leaveMember)())return;ctx.backfillStarted=false;ctx.backfillAttempted.clear();const startup=parseSelectionRoute(location.hash);if(startup.scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);++ctx.loadGeneration;const generation=ctx.loadGeneration;(0,ctx.clear)(true);
   const api=createWorkspaceApi({fetchImpl:(url,init)=>fetch(init?.method==='GET'&&url==='/api/workspace'?'/api/workspace?features=bound-writes':url,init)});
   let initialized=false,startupNotice='',session;
   session=createMemberSession({api,onGuard:read=>(0,ctx.workspaceGuardNotice)(read),onState:(state,selection,meta)=>{if(generation!==ctx.loadGeneration)return;try{
    // 4.1 기억 보드 저장·트리 편집(#984)·한마디 저장/자동 제목 보정(#1001): 화면이 이미 자기 상태를 들고 있으므로 셸은 모델만 갱신하고 iframe을 다시 그리지 않는다.
    if(meta?.board||meta?.tree||meta?.moment){const projected=workspaceModel({revision:0,state});ctx.model=projected;if(window.LT41){const tree=projected.trees.find(t=>t.id===window.LT41.tree.id);if(tree){window.LT41.tree=tree;window.LT41.trees=projected.trees;window.LT41.writable=meta.board?true:(ctx.source==='server'&&!!ctx.member?.snapshot().writable);if(meta.moment&&!meta.story){if(selection?.momentId&&tree.moments.some(m=>m.id===selection.momentId))window.LT41.momentId=selection.momentId;try{for(const f of (0,ctx.frames)())f.contentWindow?.postMessage({type:MSG.momentsSaved,treeId:tree.id,momentId:window.LT41.momentId},location.origin);}catch{}}}}return;}const snapshot=session.snapshot(),saved=accountPosition(localStorage,snapshot.subject)||{},active=parseSelectionRoute(location.hash),pending=!initialized&&active.scope!=='owner'?pendingOwnerRoute(sessionStorage):null,route=active.scope==='owner'?active:pending;let requested=selection||(0,ctx.stateSelection)();
     if(!initialized){if(route)requested=route;else if(!selection)requested=saved;
      // #583 '이 순간 열기': 맨 처음 주소(#my/network?tree=…&moment=…)로 열 때도 지도가 그 순간을 가운데 두게 한다 —
      // 뒤의 주소 이동(applyBrowserLocation)과 같은 규칙. 이후 동기화 때는 다시 정하지 않는다(initialized 뒤).
      if(!initialized&&route?.scope==='owner'&&(route.view==='network'||route.view==='board')&&route.momentId){
       if(route.view==='network')(0,ctx.requestNetworkOpen)(route.momentId);else (0,ctx.requestBoardOpen)(route.momentId);
      }
      // #368 3차: 로그인 후 처음 보여 줄 곳(첫 화면/내 트리 전체 보기/이어 읽기). resume이 지금 동작이라 기본값이고,
      // 주소(#my/…·#share/…·#home 등)가 있으면 그 주소가 이긴다(기존 규칙 그대로).
      const startPlace=(()=>{try{return normalizeStartPlace(state.prefs?.startPlace)}catch{return 'resume'}})();
      let view=memberStartupView(active,route,saved,viewForFile(ctx.current));
      if(startPlace!=='resume'&&!route&&active?.scope!=='owner'&&!(active?.scope==='screen'&&active.explicit)&&!pending)view=startPlace==='shelf'?'shelf':'home';
      ctx.current=screenForView(view)[1];}
     // #1109: 같은 화면·같은 트리의 배경 상태 반영은 프레임을 갈지 않는다.
     // 화면이 이미 자기 상태를 들고 있으므로 모델과 창 안 값만 고치고, 기존 '트리 저장' 메시지로 다시 그리게 한다.
     let resolved;
     const projected=workspaceModel({revision:0,state});
     const position=resolveAccountPosition(projected.trees,requested,saved);
     const context=window.LT41;
     const sameTree=context?.tree?.id&&context.tree.id===position.position.treeId;
     const canRefresh=['src064-orbit.html','track59-sketchbook.html','track58-pinboard.html','track32-bookshelf.html'].includes(ctx.current);
     if(initialized&&!meta&&!selection&&sameTree&&canRefresh&&ctx.source==='server'){
      ctx.model=projected;
      const tree=projected.trees.find(t=>t.id===context.tree.id);
      Object.assign(context,{tree,trees:projected.trees,prefs:state.prefs,momentId:position.position.momentId,writable:!!ctx.member?.snapshot().writable});
      document.body.dataset.treeCount=String(projected.trees.length);
      (0,ctx.links)();
      for(const f of (0,ctx.frames)()){try{f.contentWindow?.postMessage({type:MSG.treesSaved,background:true,treeId:tree.id,momentId:context.momentId},location.origin)}catch(error){report(error,'기록 갱신 알림');}}
      resolved=position;
     }else{
      resolved=(0,ctx.load)({revision:0,state},'server',requested,saved);initialized=true;
     }
     if(window.LT41)window.LT41.prefs=state.prefs;
     // #441 후속: 다른 기기의 첫 그림도 계정 날짜 표기를 따르도록, 로그인 때 기기 미러 캐시를 계정값으로 채운다.
     try{localStorage.setItem('lt41.dateStyle',normalizeDateStyle(state.prefs?.dateStyle));}catch(error){report(error, '기기 설정 저장');}
     // 261116 PR 2: 첫 화면 카드 모드도 기기 미러를 계정값으로 채운다(첫 화면 문서는 계정 값을 늦게 알 수 있다).
     try{localStorage.setItem('lt41.homeMoment',JSON.stringify(normalizeHomeMoment(state.prefs?.homeMoment)));}catch(error){report(error, '기기 설정 저장');}
     // #481: 제목 보기도 같은 이유로 기기 미러를 계정값으로 채운다.
     (0,ctx.rememberTitleDisplay)(state.prefs?.titleDisplay);
     (0,ctx.paintTitleDisplayControls)();
     // #1094: 책/목록 보기도 같은 이유로 기기 미러를 계정값으로 채운다.
     (0,ctx.rememberBookDisplay)(state.prefs?.bookDisplay);
     (0,ctx.paintBookDisplayControls)();
     // #1093: 서재 진열 방식도 같은 이유로 기기 미러를 계정값으로 채운다.
     (0,ctx.rememberShelfView)(state.prefs?.shelfView);
     (0,ctx.paintShelfViewControls)();
     if(!ctx.backfillStarted&&snapshot.owned){ctx.backfillStarted=true;void (0,ctx.runTitleBackfill)(state,session);}
     if(snapshot.owned&&resolved.position.treeId){if(viewForFile(ctx.current)!=='home'&&!(0,ctx.onExploreRoute)())(0,ctx.writeLocation)('replace');takePendingOwnerRoute(sessionStorage);if(route?.scope==='owner'&&resolved.treeMissing)startupNotice='이 주소의 기록을 현재 계정에서 찾을 수 없어 최근 위치를 열었어요.';else if(route?.scope==='owner'&&resolved.momentMissing)startupNotice='이 주소의 순간을 찾을 수 없어 트리의 시작 순간을 열었어요.';}
   }catch(error){(0,ctx.openFallbackShell)(error);}},onStatus:status=>{if(generation===ctx.loadGeneration)memberStatus(status);},
   navigate:url=>{
    if(url.startsWith('/auth/login')&&parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);
    location.assign(url.startsWith('/auth/login')?memberLoginUrl(readTheme(localStorage)):url==='#start'?'#home':url);
   }
  });
   ctx.member=session;
   try{await session.start();}catch(error){(0,ctx.openFallbackShell)(error);}
   if(generation===ctx.loadGeneration&&session.snapshot().owned){
    (0,ctx.updateAccountControls)();
    if(session.snapshot().writable&&sessionStorage.getItem(ctx.PENDING_NEW)==='1'){sessionStorage.removeItem(ctx.PENDING_NEW);(0,ctx.openEditor)('new');}
    ctx.shellAuth.consumeLoginIntent(session.snapshot());
    if(ctx.resumeAfterStart){const intent=ctx.resumeAfterStart;ctx.resumeAfterStart=null;if(intent==='write')ctx.shellQuick.openWrite();else (0,ctx.openEditor)(intent);}
    if(startupNotice)(0,ctx.notify)(startupNotice);
   }
   if(generation===ctx.loadGeneration){const startupJourney=parseJourneyRoute(location.hash);if(startupJourney){if(session.snapshot().owned&&session.snapshot().writable)(0,ctx.openFirstJourney)({step:startupJourney.step,route:true});else{history.replaceState(null,'','#home');ctx.handledHash='#home';}}}
  }

  async function sample(selection={},view){if(!(0,ctx.pauseMember)())return;const tree=await (0,ctx.loadExampleTree)();++ctx.loadGeneration;if(view)ctx.current=view;(0,ctx.load)(null,'example',selection,{},tree);if(view)(0,ctx.writeLocation)();(0,ctx.$)('save-feedback').hidden=true;if((0,ctx.$)('account-settings').open)(0,ctx.$)('account-settings').close();}

  // #1175: 공유 화면 밖으로 나가는 길 한 벌 — share 잔여를 치우고 예시 첫 화면으로 돌아가며, 화면에 남은 '감상' 안내를 거둔다.
  function leaveShare(view){
    (0,ctx.hideToast)();
    // 남의 공유에서 로고·뒤로가기로 나가면 방문자 자신의 첫 화면/계정으로 돌아간다.
    if(ctx.member?.snapshot().owned||ctx.visitorAccount){ctx.current=view||'src064-orbit.html';void (0,ctx.startMember)();}
    else void sample({},view);
  }
  Object.defineProperties(ctx,{
    startMember:{value:startMember},
    sample:{value:sample},
    leaveShare:{value:leaveShare}
  });
  return {mount(){

  }};
}
