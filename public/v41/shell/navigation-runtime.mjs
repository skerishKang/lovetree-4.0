// 주소·창·머리줄·화면 전환 연결.
import { MSG } from "../frame-messages.mjs";
import {clearCachedWorkspace, readCachedWorkspace, readLoginSubject, forgetLoginSubject} from "../workspace-cache.mjs";
import {applyViewAccessibility,connectionLabel} from "../view-a11y.mjs";
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,unsavedNoticeText,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn,readBookDisplay,writeBookDisplay,bookDisplayVisible,readShelfView,writeShelfView,shelfViewVisible} from "../header-state.mjs";
import {frameMessage, frameReadyMessages, FRAME_MESSAGE_TYPES} from "../frame-wiring.mjs";
import {screens,screenForView,viewForFile,themedViewFor} from "./navigation.mjs";
import {createScreens} from "./screens.mjs";
import {createHomeLink} from "./home-link.mjs";
import {createHeader} from "./header.mjs";
import {createDialogs} from "./dialogs.mjs";
import {createLocation} from "./location.mjs";

export function createNavigationRuntime(ctx){
  let shellLocation, PENDING_NEW, shellDialogs, shellHomeLink, shellHeader, shellScreens;
  function writeLocation(mode,boardState){return shellLocation.writeLocation(mode,boardState);}

  function applyBrowserLocation(){return shellLocation.applyBrowserLocation();}

  // 2026-11-07 계정 표시: 로그인 상태는 첫 글자 동그라미 + 작은 메뉴, 로그아웃 상태는 기존 로그인 알약.
  function panel(id){const target=(0,ctx.$)(id);if(!target.open){(0,ctx.$)('toast').hidden=true;if(target.dataset.ltPanel){shellDialogs.noteOpener(id);if(target.dataset.ltPanel==='full')shellDialogs.syncPanelTop();}
   // 새 소식 창은 비모달로 연다(2026-11-16 대표 지적) — 위 메뉴가 눌리고 메뉴가 흐리게 덮이지 않는다.
   // 나머지 창은 그대로 showModal(맨 위 창 하나 규칙은 dialogs.mjs의 topDialog가 맡는다).
   if(id==='updates-panel')target.show();else target.showModal();}
   // #549: 모달 창이 열려 있는 동안에는 창 밖 요소가 전부 inert가 되어 창 밖의 안내가 눌리지 않는다.
   // 261118 대표 결정(#845): 창 안으로 옮겨 붙이지 않고, 창이 열려 있는 동안은 안내 판을 숨긴다.
   (0,ctx.tipsFollowDialogs)();}

  // 로고 클릭은 해시 변경에만 의존하지 않는다(2026-11-17 실측). 주소가 남는 화면(서재 등)에서 눌러도 첫 화면으로 간다.
  function closePanelsForHome(){
    (0,ctx.closeTreeMenu)();(0,ctx.closeMore)();closeAccountMenu();
    let ok=true;
    for(const d of document.querySelectorAll('dialog[data-lt-panel][open]')){if(!shellDialogs.requestClose(d.id))ok=false;}
    return ok;
  }

  function scrollHomeToTop(){
    try{window.scrollTo(0,0)}catch{}
    const frame=(0,ctx.$)('view');
    try{frame?.contentWindow?.scrollTo?.(0,0)}catch{}
    try{const app=frame?.contentDocument?.querySelector?.('.app');if(app)app.scrollTop=0}catch{}
  }

  function setHomeHash(){
    if(location.hash!=='#home')history.pushState(null,'','#home');
    ctx.handledHash='#home';
  }

  function memberViewsAvailable(){return treeViewsVisible({...ctx.member?.snapshot(),publicReading:ctx.source==='share'});}

  function flowNavigation(){return shellHeader.flowNavigation();}

  function updateNavFade(){return shellHeader.updateNavFade();}

  function revealCurrentTab(){return shellHeader.revealCurrentTab();}

  function closeAccountMenu(){return shellHeader.closeAccountMenu();}

  function renderAccount(){return shellHeader.renderAccount();}

  function openAccountMenu(via){return shellHeader.openAccountMenu(via);}

  function loadAccountEmail(){return shellHeader.loadAccountEmail();}

  function updateAccountControls(){return shellHeader.updateAccountControls();}
  Object.defineProperties(ctx,{
    writeLocation:{value:writeLocation},
    PENDING_NEW:{get:()=>PENDING_NEW,set:value=>{PENDING_NEW=value;}},
    panel:{value:panel},
    shellDialogs:{get:()=>shellDialogs,set:value=>{shellDialogs=value;}},
    shellHeader:{get:()=>shellHeader,set:value=>{shellHeader=value;}},
    memberViewsAvailable:{value:memberViewsAvailable},
    flowNavigation:{value:flowNavigation},
    closeAccountMenu:{value:closeAccountMenu},
    renderAccount:{value:renderAccount},
    openAccountMenu:{value:openAccountMenu},
    updateAccountControls:{value:updateAccountControls},
    shellScreens:{get:()=>shellScreens,set:value=>{shellScreens=value;}}
  });
  return {mount(){
    // 주소 처리(#view·#tree/…·#share/…·#journey/NN 읽기·쓰기)는 shell/location.mjs가 맡는다.
    shellLocation=createLocation({
      $:ctx.$,
      getCurrent:()=>ctx.current,
      setCurrent:file=>{ctx.current=file;},
      getMember:()=>ctx.member,
      getSource:()=>ctx.source,
      getModel:()=>ctx.model,
      getActiveShareId:()=>ctx.activeShareId,
      getHandled:()=>ctx.handledHash,
      setHandled:hash=>{ctx.handledHash=hash;},
      communityScreen:ctx.shellCommunityScreen,
      show:(file,write)=>(0,ctx.show)(file,write),
      choose:(id,momentId)=>(0,ctx.choose)(id,momentId),
      links:(...args)=>(0,ctx.links)(...args),
      notify:text=>(0,ctx.notify)(text),
      startMember:()=>(0,ctx.startMember)(),
      showPublicRoute:route=>(0,ctx.showPublicRoute)(route),
      // #1175: share 잔여(source·공유 아이디·공유 기록)를 치우고 예시 기록을 다시 싣는다 — 로그아웃 상태에서
      // 공유 화면 밖으로 나가는 길(로고·뒤로 가기)이 share 주소 재진입에 묶히지 않게 하고, 남은 '감상' 안내도 거둔다.
      leaveShare:view=>(0,ctx.leaveShare)(view),
      requestNetworkOpen:ctx.requestNetworkOpen,
      requestBoardOpen:ctx.requestBoardOpen,
      journey:ctx.shellJourney,
      gotoJourneyStep:step=>(0,ctx.gotoJourneyStep)(step),
      openFirstJourney:options=>(0,ctx.openFirstJourney)(options),
      finishJourney:()=>(0,ctx.finishJourney)(),
      leaveJourney:()=>(0,ctx.leaveJourney)()
    });

    // 새 소식 창(비모달)의 Esc — 다른 창이 하나라도 열려 있으면 그 창이 Esc를 맡는다(맨 위 창 하나 규칙).
    // capture로 등록해 다른 Esc 처리보다 먼저 본다 — 아래 창(공유 목록)이 먼저 닫힌 뒤 '열린 창 없음'으로 오판하지 않게.
    // #1092: 둘러보기는 창이 아니라 화면이라 Esc를 맡지 않는다 — 맨 위 창 판정에서 뺀다(화면 위의 창도 Esc로 닫히게).
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const updates = (0,ctx.$)('updates-panel');
      if (!updates?.open || updates.matches(':modal')) return;
      if ([...document.querySelectorAll('dialog[open]')].some(d => d !== updates && !(d.id === 'community-panel' && document.body.classList.contains('community-screen')))) return; // 다른 창이 남아 있으면(맨 위 모달 포함) 그 창이 맡는다
      event.preventDefault(); shellDialogs.requestClose('updates-panel');
    }, true);

    // 새 소식 창이 열린 채 위 메뉴(머리글)를 누르면 창을 닫고 그 메뉴로 이동한다(캡처 — 이동 처리는 그대로).
    document.querySelector('.app-header')?.addEventListener('click', () => {
      const updates = (0,ctx.$)('updates-panel');
      if (updates?.open && !updates.matches(':modal')) shellDialogs.requestClose('updates-panel');
    }, true);

    PENDING_NEW='lovetree.v41.pending-new';

    // 대화상자 접근성(Tab 순환·Esc 복귀·포커스 되돌리기)은 shell/dialogs.mjs가 맡는다(#231 1-B 후속).
    shellDialogs=createDialogs({
      $:ctx.$,
      closeTreeTips:()=>(0,ctx.closeTreeTips)(),
      closeAccountMenu:()=>closeAccountMenu(),
      // #380 4: 공통 틀이 닫을 때 "저장하지 않고 닫을까요?"를 묻는 판정 — 트리 관리는 폼 기준값과 비교한다.
      isTreeDirty:()=>ctx.shellPanels.treeDirty(),
      // #380 4 2차: 편집기는 입력(제목·메모·주소·사진·고른 연결)이 바뀌었으면 더러움,
      // 순간 잇기는 고른 연결이 저장 전이면 더러움이다. 어느 쪽이든 공통 틀이 한 번 묻고 닫는다.
      // #425: 한 창에서 보이는 구역만 본다 — 쉬운 추가는 주소를 적고 아직 담지 않았을 때,
      // 자세한 추가는 폼(제목·마음·주소·첨부·연결)이 기준값과 다를 때 더러움이다.
      isEditorDirty:()=>((0,ctx.$)('write-easy').hidden?ctx.shellPanels.detailedDirty():(0,ctx.$)('quick-url').value.trim()!==''),
      isConnectionDirty:()=>(0,ctx.connectionDirty)(),
      // #380 4 마지막: 빠른 추가는 주소를 적어 두고 아직 담지 않았을 때, 공유는 공개 범위를 미리 봤는데 링크를 아직 만들지 않았을 때만 더러움이다.
      // 설정·내 보관 파일·둘러보기·추가 방식 고르기는 입력을 적어 두지 않으므로 바로 닫힌다.
      isShareDirty:()=>{const create=(0,ctx.$)('share-create');return (0,ctx.$)('share-panel').open&&!!create&&!create.disabled&&(0,ctx.$)('share-created').hidden;},
      // #368 2차: 설정의 프로필 폼은 쓰다 만 이름·색이 있으면 공통 틀이 한 번 묻는다. 다른 설정 항목은 누르는 즉시 적용되어 더러움이 없다.
      isSettingsDirty:()=>(0,ctx.profileDirty)(),
      // #480 M8: 정리 창 — 새 트리 이름을 적었거나 순간 고름·옮길 트리가 열 때와 달라졌으면 한 번 묻는다.
      isCleanupDirty:()=>ctx.shellCleanup.dirty(),
      // 편집기 규칙이 공통 틀보다 우선한다: 업로드 중에는 Esc·바깥 클릭·× 모두 닫지 않고 이유를 알린다.
      // 빠른 추가의 사진 올리기도 같은 규칙을 쓴다(업로드가 끝나면 곧바로 담기므로 중간에 닫으면 사라진다).
      panelBlocked:id=>id==='write-panel'&&(ctx.uploads.busy||ctx.shellQuick.uploads?.busy)?'파일 전송을 마치거나 취소해 주세요.':'',
      notify:text=>(0,ctx.notify)(text)
    });

    shellHomeLink=createHomeLink({
      $:ctx.$,
      getCurrent:()=>ctx.current,
      show:(file,write)=>{
        // #1175: 공유 화면을 본 뒤 로고로 나가면 share 잔여를 치운다 — share 상태가 남으면 탭 줄이 숨어
        // 서재 단추에 닿지 못하고, 화면을 옮길 때마다 공유 기록을 다시 읽어 '감상' 안내가 되풀이된다.
        if(file==='src064-orbit.html'&&ctx.source==='share'){(0,ctx.leaveShare)(file);return true;}
        return (0,ctx.show)(file,write);
      },
      closePanels:closePanelsForHome,
      setHomeHash,
      scrollToTop:scrollHomeToTop
    });

    shellHomeLink.mount();

    shellHeader=createHeader({
      $:ctx.$,
      navBar:document.querySelector('.app-header nav'),
      getMember:()=>ctx.member,
      getModel:()=>ctx.model,
      getSource:()=>ctx.source,
      getCurrent:()=>ctx.current,
      getVisitorAccount:()=>ctx.visitorAccount||null,
      accountApi:ctx.accountApi,
      // #368: 이메일을 불러오거나 지울 때마다 설정 "프로필" 표시도 같이 칠한다.
      onEmailChange:email=>(0,ctx.paintSettingsProfile)(email),
      // #465 4: 동그라미 깜빡임 — 계정 정보를 부르는 동안 저장본(#408)의 표시 이름으로 먼저 그린다.
      getCachedName:()=>{try{return readCachedWorkspace(localStorage,readLoginSubject(localStorage))?.state?.prefs?.displayName||''}catch{return ''}},
      // 이슈 644 2번: 아바타에 새 소식이 있으면 마우스 설명을 점 안내로 바꾼다.
      getAccountTip:()=>ctx.shellSettings.getAccountTip(),
      delegate:{syncTreeTips:()=>(0,ctx.syncTreeTips)()}
    });

    // 화면 전환·iframe 두 장 교대는 shell/screens.mjs가 맡는다(#231 1-B). 셸은 지금 화면과 나머지 일을 넘긴다.
    shellScreens=createScreens({
      $:ctx.$,
      screens,
      getCurrent:()=>ctx.current,
      setCurrent:file=>{ctx.current=file;},
      getSource:()=>ctx.source,
      hasTree:()=>!!window.LT41,
      isGuest:()=>!ctx.member?.snapshot().owned && ctx.source!=='share',
      takeNetworkOpen:ctx.takeNetworkOpen,
      takeBoardOpen:ctx.takeBoardOpen,
      // #1026 E: 로그아웃 예시를 동적으로 받는 동안에는 사용자가 연 창을 닫지 않는다.
      closePanels:()=>{if(ctx.exampleInitializing)return;shellDialogs.closePanels();},
      // 이슈 933: 화면을 옮긴 뒤 안내 판을 다시 맞춘다 — 첫 여정(새 트리 만들기)에서는 띄우지 않는다.
      syncTips:()=>(0,ctx.syncTreeTips)(),
      flowNavigation,
      paintEmptyForScreen:ctx.paintEmptyForScreen,
      paintEmptyCopy:ctx.paintEmptyCopy,
      applyTheme:ctx.applyTheme,
      writeLocation,
      links:(...args)=>(0,ctx.links)(...args),
      onFrameReady:frame=>{
        const d=frame.contentDocument;if(!d)return;
        (0,ctx.mountConnectionTool)(d);applyViewAccessibility(d);ctx.shellQuick.mountFrame(d);(0,ctx.watchFrameSheet)(frame);
        /* 이슈 458: 모바일(781px 미만)에서는 셸의 ＋ 단추가 오른쪽 아래에 뜬다 — 첫 화면 궤도가 그 자리를 비끼게
           프레임 html에 표시를 남긴다(궤도 쪽 좁은 화면 배치가 이 표시를 읽는다). */
        if(matchMedia('(max-width:780px)').matches)d.documentElement.dataset.ltFab='1';else delete d.documentElement.dataset.ltFab;
        // 화면이 자리 잡은 뒤 알림 자리를 다시 잰다 — 알림이 떠 있는 동안 화면이 늦게 편성되면(기록 불러오기·글꼴)
        // 자리가 낡아 화면 아래쪽 내용(책의 페이지 알약·이유 안내)을 덮는다. 자리는 살아 있는 값이라 즉시 따라 옮겨 앉는다.
        (0,ctx.placeToast)();setTimeout(ctx.placeToast,1600);
        // #368 2차·3차: 새로 열린 화면에 페이지 넘김·날짜 표기 값을 알린다(테마와 같은 시점).
        // #481 T6: 무엇을 뜰 때마다 보내는지는 frameReadyMessages가 정한다(보내는 시점을 실행 시험으로 고정한다).
        // 무엇을 뜰 때마다 보내는지는 frameReadyMessages가 정하고, 여기서는 그것을 순서대로 보낸다
        // (보내는 시점·값·순서를 실행 시험이 같은 함수로 확인한다).
        const ready=frameReadyMessages({dateStyle:(0,ctx.currentDateStyle)(),pageTurn:(0,ctx.currentPageTurn)()==='on'});
        (0,ctx.applyPageTurnToFrame)(frame);(0,ctx.applyDateStyleToFrame)(frame);(0,ctx.applyBoardThemeToFrame)(frame);
        // #478: 고급 기능 보기 값도 새로 열린 화면에 알린다. applyAdvanced는 지금 화면(#view)에만 보내므로
        // 화면을 옮긴 뒤 열린 프레임은 단순 모드로 남았다(보드 도구가 숨는 결함).
        try{frame.contentWindow.postMessage({type:MSG.advanced,value:(0,ctx.readAdvanced)()},location.origin)}catch{}
        // 화면 교대(두 장 앞뒤 바꿈)가 늦게 끝나는 경우를 위해 한 번 더 알린다(같은 값을 또 보내는 건 무해하다).
        for(const message of ready.repeats)setTimeout(()=>(0,ctx.sendToFrame)(frame,message),1600);
        d.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;let file;if(b.matches('[data-action="tree"],[data-menu="tree"]'))file='track32-bookshelf.html';if(b.matches('#storyBook,[data-menu="book"]'))file='track59-sketchbook.html';if(ctx.current==='track56-network.html'&&b.id==='openMoment')file='track59-sketchbook.html';if(file){e.preventDefault();e.stopImmediatePropagation();(0,ctx.show)(file);}},true);
      }
    });
  }};
}
