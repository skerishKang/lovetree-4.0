// 쓰기·정리·공유 창과 화면 메시지 연결.
import {mountPrivateUpload} from "../private-upload.mjs";
import {titleView, withoutAutoTitle} from "../book-usability.mjs";
import {screens,screenForView,viewForFile,themedViewFor} from "./navigation.mjs";
import {createPanels} from "./panels.mjs";
import {createQuickAdd} from "./quick-add.mjs";
import {createWritePanel, readWriteTab, writeWriteTab, mountBookmarkEntry, mountEmptyBookmarkEntry} from "./write-panel.mjs";
import {createQuickIntake} from "./quick-intake.mjs";
import {createMessages, lastShelfTreeId} from "./messages.mjs";
import {createTagSave} from "./tag-save.mjs";
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from "./theme.mjs";
import {thumbnailCandidates, coverFallbackAttrs, fallbackCardData, emotionToneOf, mountThumbFallback, ADD_TITLE_LABEL, VIDEO_UNAVAILABLE_TEXT} from "../thumb-fallback.mjs";

export function createWritingRuntime(ctx){
  let shellWrite, shellVideoDup, uploads, shellPanels, shellTags, shellTagManager, shellQuick, shellIntake, shellCleanup, shellJourney, shellMessages, shellBookmarkImport, bookmarkEmptyEntry;
  function openEditor(mode,parentId=''){
    // 2026-11-16 대표 요청: 자세한 추가도 쉬운 추가와 같은 기본 트리를 쓴다 — 늘 같은 트리를 골랐고
    // 지금 트리와 다르면 그 트리를 고른 뒤 연다(에디터 안내 줄이 그 트리를 가리킨다). 목적지 순간이
    // 함께 오면(그 순간 다음에 담기) 사용자가 고른 목적지가 우선이라 그대로 둔다.
    if(mode==='add'&&!parentId){const pref=(0,ctx.quickTargetPreference)();if(pref.mode==='fixed'&&pref.treeId&&window.LT41?.tree?.id!==pref.treeId&&ctx.model?.trees?.some(t=>t.id===pref.treeId))(0,ctx.choose)(pref.treeId);}
    return shellPanels.openEditor(mode,parentId);
  }

  function updateMediaPreview(){return shellPanels.updateMediaPreview();}

  function updateQuickEntryHint(){return shellPanels.updateQuickEntryHint();}

  function openSharePanel(){return shellMessages.openSharePanel();}

  function noteJourneyStep(step,options){return shellJourney.noteJourneyStep(step,options);}

  function gotoJourneyStep(step){return shellJourney.gotoJourneyStep(step);}

  function leaveJourney(options){return shellJourney.leaveJourney(options);}

  function finishJourney(){return shellJourney.finishJourney();}

  function openFirstJourney(options){return shellJourney.openFirstJourney(options);}

  function saveFirstJourney(draft){return shellJourney.saveFirstJourney(draft);}

  function openJourneyBook(args){return shellJourney.openJourneyBook(args);}

  function closeFirstJourney(){return shellJourney.closeFirstJourney();}
  Object.defineProperties(ctx,{
    uploads:{get:()=>uploads,set:value=>{uploads=value;}},
    shellPanels:{get:()=>shellPanels,set:value=>{shellPanels=value;}},
    openEditor:{value:openEditor},
    shellTagManager:{get:()=>shellTagManager,set:value=>{shellTagManager=value;}},
    shellQuick:{get:()=>shellQuick,set:value=>{shellQuick=value;}},
    bookmarkEmptyEntry:{get:()=>bookmarkEmptyEntry},
    shellIntake:{get:()=>shellIntake,set:value=>{shellIntake=value;}},
    shellCleanup:{get:()=>shellCleanup,set:value=>{shellCleanup=value;}},
    shellJourney:{get:()=>shellJourney,set:value=>{shellJourney=value;}},
    gotoJourneyStep:{value:gotoJourneyStep},
    leaveJourney:{value:leaveJourney},
    finishJourney:{value:finishJourney},
    openFirstJourney:{value:openFirstJourney}
  });
  return {mount(){
    // #425: 순간 추가 한 창 — 쉬운 추가·자세한 추가를 한 창의 탭으로 오간다(shell/write-panel.mjs).
    shellWrite=createWritePanel({$:ctx.$,onModalShown:()=>(0,ctx.tipsFollowDialogs)()});

    // #876: 같은 영상을 다시 담을 때 담기 전에 한 번 알려 주는 창(shell/video-dup.mjs). 잠깐 판 — 순간 추가 창
    // 위에 겹쳐 열리고(#845 3단계 STACK_ALLOWED), ×·Esc·뒤로가기로 닫으면 아무것도 담지 않는다.
    shellVideoDup=(0,ctx.lazyPanel)(()=>import('./video-dup.mjs').then(m=>m.createVideoDup({$:ctx.$,onModalShown:()=>(0,ctx.tipsFollowDialogs)(),requestClose:id=>ctx.shellDialogs.requestClose(id),choose:(id,momentId)=>(0,ctx.choose)(id,momentId),openEditor:(mode,parentId)=>openEditor(mode,parentId)})));

    // 헤더·계정 메뉴는 shell/header.mjs가 맡는다(#231 1-B②-2). 셸은 자기 상태를 읽기 함수로 넘긴다.
    addEventListener('lovetree-auth-required',()=>ctx.shellAuth.authRequired());

    window.LT41=null;

    uploads=mountPrivateUpload({form:(0,ctx.$)('moment-form'),assets:(0,ctx.$)('account-assets'),getSubject:()=>ctx.source==='server'&&ctx.member?.snapshot().writable?ctx.member.snapshot().subject:null,getState:()=>ctx.member?.state(),onChange:()=>shellPanels.uploadsChanged(),onUseAsset:()=>(0,ctx.usePrivateAsset)()});

    // 순간 패널·편집기·책 정보는 shell/panels.mjs가 맡는다(#231 1-B③-2). 셸은 자기 상태를 읽기 함수로 넘긴다.
    shellPanels=createPanels({
      getCurrent:()=>ctx.current,
      $:ctx.$,
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      getUploads:()=>uploads,
      notify:text=>(0,ctx.notify)(text),
      panel:id=>(0,ctx.panel)(id),
      // #368: 읽기 전용 안내는 내 기록 창 대신 설정 "내 데이터" 묶음으로 연다.
      openSettingsData:intent=>(0,ctx.openAccountData)(intent),
      show:(file,write)=>(0,ctx.show)(file,write),
      selection:()=>(0,ctx.stateSelection)(),
      openFirstJourney:options=>openFirstJourney(options),
      // #453 A: 예시를 둘러보는 중에 편집기를 열려 하면 로그인 화면 대신 내 기록으로 돌아온다.
      resumeMember:intent=>(0,ctx.resumeMember)(intent),
      openLoginStart:intent=>(0,ctx.openLoginStart)(intent),
      // #425: 같은 창의 탭(쉬운 추가·자세한 추가)과 제목을 이 모듈이 정한다.
      writePanel:shellWrite,
      // #380 4 2차: 편집기의 취소 버튼도 공통 닫기 규칙(×·바깥·Esc와 같은 확인·업로드 중 막기)을 쓴다.
      requestClose:id=>ctx.shellDialogs.requestClose(id),
      // #876: 같은 영상 안내 창 — 자세한 추가도 쉬운 추가와 같은 규칙.
      videoDup:shellVideoDup
    });

    // #453 B: 탭을 보일 때(그리고 창을 여는 두 길 모두에서) 편집기 기준값을 다시 잡는다.
    shellWrite.setTabHook(tab=>shellPanels.onWriteTab(tab));

    // 쉬운 추가(#빠른 추가 ②): 창 열기·끌어다 놓기는 shell/quick-add.mjs가 맡는다.
    // #425부터 입구는 하나다 — 같은 창을 열고 먼저 보일 탭만 설정값(lt41.writeTab)이 정한다.
    // #627 PR B: 꼬리표 저장 한 곳 — 기존 워크스페이스 저장 경로(boardSync)로 keywords만 바꾼다(새 저장 경로·서버 변경 없음).
    // 꼬리표 정리 창은 같은 저장 길을 쓰고, 화면(iframe)의 lt41-tags도 이 한 곳을 부른다(shell/messages.mjs).
    shellTags=createTagSave({
      getMember:()=>ctx.member,
      getModel:()=>ctx.model,
      notify:text=>(0,ctx.notify)(text),
      // 결함 ③(tags-sync): 저장 뒤 열린 화면(iframe) 두 개에 답 모양(lt41-tags-saved)을 알린다.
      frames:()=>[(0,ctx.$)('view')?.contentWindow,(0,ctx.$)('view-next')?.contentWindow].filter(Boolean)
    });

    shellTagManager=(0,ctx.lazyPanel)(()=>import('./tag-manager.mjs').then(m=>m.createTagManager({
      $:ctx.$,
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      notify:text=>(0,ctx.notify)(text),
      panel:id=>(0,ctx.panel)(id),
      closePanel:id=>{ ctx.shellDialogs.requestClose(id); const href=(0,ctx.$)('view')?.contentWindow?.location?.href || ''; if (!href || href === 'about:blank') (0,ctx.show)(ctx.current, false); },
      saveMoments:shellTags.saveMoments
    })));

    shellQuick=createQuickAdd({
      $:ctx.$,
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      getCurrent:()=>ctx.current,
      notify:text=>(0,ctx.notify)(text),
      panel:id=>(0,ctx.panel)(id),
      openSettingsData:intent=>(0,ctx.openAccountData)(intent),
      choose:(id,momentId)=>(0,ctx.choose)(id,momentId),
      openEditor:(mode,parentId)=>openEditor(mode,parentId),
      resumeMember:intent=>(0,ctx.resumeMember)(intent),
      resetEditorBaseline:()=>shellPanels.startQuickSession(),
      openLoginStart:intent=>(0,ctx.openLoginStart)(intent),
      writePanel:shellWrite,
      requestClose:id=>ctx.shellDialogs.requestClose(id),
      // #978: 담는 중에는 열린 창을 닫지 않게 잠시 붙잡는다(저장 뒤 화면 다시 그리기가 창을 닫으려 한다).
      holdPanel:(id,on)=>ctx.shellDialogs.holdPanel(id,on),
      // #876: 같은 영상 안내 창 — 담기 전에 한 번 알려 주고 [그래도 담기]·[그 순간 보기]를 맡긴다.
      videoDup:shellVideoDup,
      // #638: 쉬운 추가가 지금 고른 트리에 담기게 — 지금 트리·트리 목록은 트리 메뉴와 같은 재료(window.LT41)에서 읽는다.
      currentTreeId: () => window.LT41?.tree?.id || '',
      listTrees: () => (Array.isArray(window.LT41?.trees) ? window.LT41.trees : []),
      // 사진 올리기는 기존 업로더(#310 onUploaded·imagesOnly)를 그대로 쓴다.
      mountUpload:mountPrivateUpload,
      // 이슈 671: '그 순간 다음에 담기' 한 줄에 쓸 순간 제목 — 책·보드와 같은 제목 규칙(자동 제목 빼기)을 쓴다.
      momentTitle:moment=>{const main=titleView(moment,(0,ctx.titleDisplayValue)()).main;return main||withoutAutoTitle(moment).title;},
      // #627 PR B: 담은 직후 안내의 꼬리표 줄이 눌렸을 때 — keywords만 기존 경로로 저장한다.
      saveTags:payload=>shellTags.save(payload),
      // 2026-11-16 대표 요청: 처음 고르는 트리 설정(지금 보고 있는 트리/늘 같은 트리) — 바로 아래 한 벌.
      quickTargetPreference:()=>(0,ctx.quickTargetPreference)()
    });

    // #822 1단계: 북마크에서 가져오기 — 창 모듈은 처음 누를 때 받는다(lazyPanel). 입구 한 줄은 쉬운 추가 탭 아래에 둔다.
    // 열리면 공통 창 규칙(#933 한 장)대로 순간 추가 창을 닫고 그 자리에 뜬다.
    shellBookmarkImport=(0,ctx.lazyPanel)(()=>import('./bookmark-import.mjs').then(m=>m.createBookmarkImport({
      $:ctx.$,
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      notify:text=>(0,ctx.notify)(text),
      openSettingsData:intent=>(0,ctx.openAccountData)(intent),
      resumeMember:intent=>(0,ctx.resumeMember)(intent),
      openLoginStart:intent=>(0,ctx.openLoginStart)(intent),
      onModalShown:()=>(0,ctx.tipsFollowDialogs)(),
      // 트리 목록은 쉬운 추가와 같은 재료(window.LT41)에서 읽고, 날짜 표기는 계정 설정 한 벌을 따른다.
      listTrees:()=>(Array.isArray(window.LT41?.trees)?window.LT41.trees:[]),
      dateStyle:()=>(0,ctx.currentDateStyle)(),
      // 처음 고르는 트리는 쉬운 추가와 같은 한 벌(늘 같은 트리 설정 → 지금 보는 트리).
      currentTreeId:()=>window.LT41?.tree?.id||'',
      quickTargetPreference:()=>(0,ctx.quickTargetPreference)(),
      // #978과 같은 길: 담는 동안 화면 다시 그리기·다른 창이 이 창을 닫지 못하게 붙잡는다.
      holdPanel:(id,on)=>ctx.shellDialogs.holdPanel(id,on),
      // 담은 뒤 뒤에 열린 화면을 지금 트리 그대로 한 번 다시 그린다(담는 동안은 모델만 바꾼다).
      refreshScreen:()=>{const id=window.LT41?.tree?.id;if(id)(0,ctx.choose)(id,window.LT41.momentId);},
      // '트리 보러 가기': 담은 트리의 책을 연다(messages.mjs의 책 열기와 같은 길).
      openBook:(treeId,momentId)=>{ctx.current='track59-sketchbook.html';(0,ctx.choose)(treeId,momentId);(0,ctx.writeLocation)();}
    })));
    mountBookmarkEntry({$:ctx.$,onOpen:()=>shellBookmarkImport.open()});
    // #822 6단계: 처음 온 팬 안내 — 트리가 없는 내 계정의 빈 화면(빈 서재·첫 순간 안내)에 같은 입구 한 줄.
    // 보일지 말지는 빈 화면을 그리는 곳(workspace-runtime paintEmptyForScreen)이 정한다.
    bookmarkEmptyEntry=mountEmptyBookmarkEntry({$:ctx.$,onOpen:()=>shellBookmarkImport.open()});

    (0,ctx.$)('write-menu').onclick=()=>{if(ctx.source!=='server'&&ctx.member?.snapshot().owned){void (0,ctx.resumeMember)('write');return;}if(ctx.member?.snapshot().dirty){(0,ctx.explainSaveState)();return;}shellQuick.openWrite();};

    // #458: 모바일 떠 있는 ＋ 단추 — 헤더의 ＋ 순간 추가와 같은 길(같은 창)을 연다. 단추는 body.lt-fab-ok일 때만 보인다.
    (0,ctx.$)('mobile-add').addEventListener('click',()=>(0,ctx.$)('write-menu').click());

    // 빠른 담기 입구: 붙여넣기 + 공유 시트 진입(판정·추적은 ../quick-intake.mjs 한 벌).
    shellIntake=createQuickIntake({
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      // 담기·중복·로그인 필요 안내는 방금 한 행동의 결과다 — 상태 안내가 곧바로 덮지 않게 hold로 띄운다(#353 후속).
      notify:text=>(0,ctx.notify)(text,{hold:true}),
      openLoginStart:intent=>(0,ctx.openLoginStart)(intent),
      // #876: 같은 영상 안내 창 — 붙여넣기·공유로 담을 때도 쉬운 추가와 같은 규칙(조용히 막기를 대체).
      videoDup:shellVideoDup,
      describe:(url)=>globalThis.LTMedia?.describe?.(url),
    });

    // #327 2부: 모아둔 순간 정리 창. #380 5번: 입구는 트리 ▾ 드롭다운의 '정리 전 N개 정리하기' 한 곳뿐이고,
    // 순간 상세의 '다른 트리로 옮기기'(lt41-move 메시지)는 그 순간을 옮기는 별개 동작으로 남는다.
    shellCleanup=(0,ctx.lazyPanel)(()=>import('./cleanup.mjs').then(m=>m.createCleanup({
      $:ctx.$,
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      getTrees:()=>ctx.model?.trees||[],
      choose:(id,momentId)=>(0,ctx.choose)(id,momentId),
      notify:text=>(0,ctx.notify)(text),
      panel:id=>(0,ctx.panel)(id),
      // 정리 목록도 다른 화면과 같은 제목 규칙·썸네일 규칙을 쓴다(중복 구현 금지).
      treeMomentThumb:ctx.treeMomentThumb,
      thumbCandidatesOf:moment=>thumbnailCandidates(moment,{autoLoad:true}),
      fallbackCardOf:moment=>fallbackCardData(moment,{writable:!!ctx.member?.snapshot().writable}),
      emotionToneOf,
      addTitleLabel:ADD_TITLE_LABEL,
      unavailableLabel:VIDEO_UNAVAILABLE_TEXT,
      momentTitle:moment=>{const main=titleView(moment,(0,ctx.titleDisplayValue)()).main;return main||withoutAutoTitle(moment).title;},
    })));

    mountThumbFallback(document,{
      isReadOnly:()=>ctx.source!=='server'||!ctx.member?.snapshot().writable,
      onEditTitle:({treeId,momentId})=>{
        if(ctx.source!=='server'||!ctx.member?.snapshot().writable)return;
        if((0,ctx.$)('cleanup-panel')?.open)(0,ctx.$)('cleanup-panel').close();
        const targetTree=treeId
          ?ctx.model?.trees?.find(t=>t.id===treeId&&t.moments.some(m=>m.id===momentId))
          :(window.LT41?.tree?.moments.some(m=>m.id===momentId)?window.LT41.tree:ctx.model?.trees?.find(t=>t.moments.some(m=>m.id===momentId)));
        if(targetTree){
          if(window.LT41?.tree?.id!==targetTree.id)(0,ctx.choose)(targetTree.id,momentId);
          else{window.LT41.momentId=momentId;(0,ctx.links)();(0,ctx.writeLocation)();}
        }
        openEditor('edit');
        shellPanels.focusTitleInput?.();
      }
    });

    // 첫 여정 연결은 shell/journey.mjs, 공유·둘러보기·lt41-* 수신은 shell/messages.mjs가 맡는다(#231 1-B③-3).
    shellJourney=(0,ctx.lazyPanel)(()=>import('./journey.mjs').then(m=>m.createJourney({
      $:ctx.$,
      closePanels:()=>ctx.shellDialogs.closePanels(),
      syncTips:()=>(0,ctx.syncTreeTips)(),
      getCurrent:()=>ctx.current,
      setCurrent:file=>{ctx.current=file;},
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      notify:text=>(0,ctx.notify)(text),
      panel:id=>(0,ctx.panel)(id),
      openSettingsData:intent=>(0,ctx.openAccountData)(intent),
      show:(file,write)=>(0,ctx.show)(file,write),
      screens,
      choose:(id,momentId)=>(0,ctx.choose)(id,momentId),
      writeLocation:(mode)=>(0,ctx.writeLocation)(mode),
      openLoginStart:intent=>(0,ctx.openLoginStart)(intent),
      flowNavigation:()=>(0,ctx.flowNavigation)(),
      setHandled:hash=>{ctx.handledHash=hash;}
    })));

    shellMessages=createMessages({
      $:ctx.$,
      getCurrent:()=>ctx.current,
      setCurrent:file=>{ctx.current=file;},
      // #1093: 서재 도구 줄의 토글이 부모 저장 경로를 쓰게 한다.
      setShelfView:ctx.setShelfView,
      getModel:()=>ctx.model,
      getSource:()=>ctx.source,
      getMember:()=>ctx.member,
      // #480 L13: 공유 목록·공유 미리보기의 날짜도 계정 설정 한 벌을 따른다(책·보드·지도·첫 화면과 같음).
      getDateStyle:()=>(0,ctx.currentDateStyle)(),
      shareApi:ctx.shareApi,
      discoverOf:treeId=>ctx.discoverState.has(treeId)?ctx.discoverState.get(treeId):null,
      rememberDiscover:(treeId,discover)=>ctx.discoverState.set(treeId,discover===true),
      notify:text=>(0,ctx.notify)(text),
      panel:id=>(0,ctx.panel)(id),
      openSettingsData:intent=>(0,ctx.openAccountData)(intent),
      show:(file,write)=>(0,ctx.show)(file,write),
      links:()=>(0,ctx.links)(),
      writeLocation:(mode)=>(0,ctx.writeLocation)(mode),
      choose:(id,momentId)=>(0,ctx.choose)(id,momentId),
      openTreeManager:()=>shellPanels.openTreeManager(),
      openTagManager:opts=>shellTagManager.open(opts),
      openEditor:(mode,parentId)=>openEditor(mode,parentId),
      openNewTree:()=>openEditor('new'),
      // 이슈 671: lt41-write의 새로 추가(new·add)는 쓰기 창 한 길로 — 목적지(트리·이어질 순간)를 함께 넘긴다.
      openWriteEntry:target=>shellQuick.openWrite(target),
      focusTitleInput:()=>shellPanels.focusTitleInput?.(),
      openLoginStart:intent=>(0,ctx.openLoginStart)(intent),
      openAccountMenu:()=>(0,ctx.openAccountMenu)(),
      openCleanup:options=>shellCleanup.open(options),
      // #627 PR B: 화면(책·보드·지도)의 꼬리표 줄이 확인한 것을 저장하는 한 길.
      saveTags:payload=>shellTags.save(payload),
      openMovePicker:options=>shellCleanup.openMove(options),
      sample:(selection,view)=>(0,ctx.sample)(selection,view),
      applyTheme:(theme)=>(0,ctx.applyTheme)(theme),
      paintThemeControls:()=>paintThemeControls(),
      viewForFile:file=>viewForFile(file),
      get exampleTree(){return ctx.exampleTree;},
      journey:shellJourney,
      // #368 3차: 공유 창 시작값(처음 열 보기·둘러보기 올림 기본)은 계정 설정에서 온다.
      getShareDefaults:()=>({view:(0,ctx.currentShareView)()})
    });
  }};
}
