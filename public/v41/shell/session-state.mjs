// 초기 주소와 회원 상태, 로그인 연결.
import {createWorkspaceApi, setMemberRefreshStarted} from "../api.mjs";
import {createShareApi} from "../share-api.mjs";
import {createCommunityApi} from "../community-api.mjs";
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from "../selection-location.mjs";
import {screens,screenForView,viewForFile,themedViewFor} from "./navigation.mjs";
import {createCommunityScreen} from "./community-screen.mjs";
import {createStageLoading} from "./stage-loading.mjs";
import {createAuth} from "./auth.mjs";

export function createSessionState(ctx){
  let initialRoute, model, current, source, loadGeneration, previousDirty, member, visitorAccount, handledHash, activeShareId, resumeAfterStart, shellStageLoading, shellCommunityScreen, networkOpenMoment, requestNetworkOpen, takeNetworkOpen, boardOpenMoment, requestBoardOpen, takeBoardOpen, shareApi, accountApi, myNewsApi, shellAuth;
  function startLogin(intent=''){return shellAuth.startLogin(intent);}

  function openLoginStart(intent='first'){return shellAuth.openLoginStart(intent);}
  Object.defineProperties(ctx,{
    initialRoute:{get:()=>initialRoute,set:value=>{initialRoute=value;}},
    model:{get:()=>model,set:value=>{model=value;}},
    current:{get:()=>current,set:value=>{current=value;}},
    source:{get:()=>source,set:value=>{source=value;}},
    loadGeneration:{get:()=>loadGeneration,set:value=>{loadGeneration=value;}},
    previousDirty:{get:()=>previousDirty,set:value=>{previousDirty=value;}},
    member:{get:()=>member,set:value=>{member=value;}},
    visitorAccount:{get:()=>visitorAccount,set:value=>{visitorAccount=value;}},
    handledHash:{get:()=>handledHash,set:value=>{handledHash=value;}},
    activeShareId:{get:()=>activeShareId,set:value=>{activeShareId=value;}},
    resumeAfterStart:{get:()=>resumeAfterStart,set:value=>{resumeAfterStart=value;}},
    shellStageLoading:{get:()=>shellStageLoading,set:value=>{shellStageLoading=value;}},
    shellCommunityScreen:{get:()=>shellCommunityScreen,set:value=>{shellCommunityScreen=value;}},
    requestNetworkOpen:{get:()=>requestNetworkOpen,set:value=>{requestNetworkOpen=value;}},
    takeNetworkOpen:{get:()=>takeNetworkOpen,set:value=>{takeNetworkOpen=value;}},
    requestBoardOpen:{get:()=>requestBoardOpen,set:value=>{requestBoardOpen=value;}},
    takeBoardOpen:{get:()=>takeBoardOpen,set:value=>{takeBoardOpen=value;}},
    shareApi:{get:()=>shareApi,set:value=>{shareApi=value;}},
    accountApi:{get:()=>accountApi,set:value=>{accountApi=value;}},
    myNewsApi:{get:()=>myNewsApi,set:value=>{myNewsApi=value;}},
    shellAuth:{get:()=>shellAuth,set:value=>{shellAuth=value;}},
    openLoginStart:{value:openLoginStart}
  });
  return {mount(){
    // #1092: 둘러보기는 겹쳐 뜨는 창이 아니라 서재·책·보드·지도와 같은 화면이다 — 공통 틀의 Esc·바깥 누름 닫기 규칙(#380)을 쓰지 않는다.
    // 열기·닫기·주소는 shell/community-screen.mjs 한 곳에서 바꾼다(창 모듈 community-panel.mjs는 그대로).
    initialRoute=parseSelectionRoute(location.hash);

    model=null,current=screenForView(initialRoute.view)[1],source='example',loadGeneration=0,previousDirty=false,member=null,visitorAccount=null,handledHash=null,activeShareId=null,resumeAfterStart=null;

    // #1092: 둘러보기 화면 — 창 모듈의 showModal 호출을 비모달 화면 열기로 바꾸고, 닫을 때 #explore 주소 기록을 지킨다.
    // #1026: 0.8초 안에 내용이 오지 않으면 무대에 불러오는 중을 띄운다(움직임 끄기 설정은 표시할 때 읽는다).
    shellStageLoading=createStageLoading({$:ctx.$,isMotionOff:()=>ctx.motionPaused});

    shellCommunityScreen=createCommunityScreen({$:ctx.$,setHandled:hash=>{handledHash=hash;},flowNavigation:ctx.flowNavigation,stageLoading:shellStageLoading});

    // #583 '이 순간 열기': 주소(#my/network?tree=…&moment=…)로 지도를 특정 순간을 가운데 두고 열 요청이 오면
    // 여기에 한 번 적어 두고, 지도 프레임을 띄울 때(show) 소비해 프레임 주소에 ?open=<순간>을 붙인다.
    // 지도(network.js)는 이 표시가 있을 때만 그 순간을 고른 상태로 가운데에 둔다 — 그냥 지도를 열 때는
    // 예전대로 전체 보기(화면 맞춤)로 뜬다.
    networkOpenMoment=null;

    requestNetworkOpen=id=>{networkOpenMoment=id||null};

    takeNetworkOpen=()=>{const v=networkOpenMoment;networkOpenMoment=null;return v};

    // #891: 보드도 같은 길 — 주소(공유·이어 보기)가 특정 순간을 가리켜 실제로 찾았을 때만 보드 프레임 주소에
    // ?open=<순간>을 붙여 보낸다. 탭·메뉴로 들어오면 요청이 없으므로 보드는 상세 판을 닫은 채 연다.
    boardOpenMoment=null;

    requestBoardOpen=id=>{boardOpenMoment=id||null};

    takeBoardOpen=()=>{const v=boardOpenMoment;boardOpenMoment=null;return v};

    setMemberRefreshStarted(false);

    shareApi=createShareApi();

    accountApi=createWorkspaceApi();

    // #1098 3단계 내 소식 — #1159의 두 읽기 경로(/api/community/my-news·/unread-count)만 쓰는 전용 연결. 서버 변경 없음.
    myNewsApi=createCommunityApi();

    // 로그인 시작·세션 연결은 shell/auth.mjs가 맡는다(#231 1-B③-1). 셸은 자기 상태를 넘기고 부르기만 한다.
    shellAuth=createAuth({
      $:ctx.$,
      getMember:()=>member,
      notify:text=>(0,ctx.notify)(text),
      onAuthRequired:()=>ctx.shellHeader.paintAuthExpired(),
      // #1134 후속: 401 뒤 세션을 다시 확인하는 가벼운 요청 — api.mjs를 거치지 않아 401 이벤트를 다시 보내지 않는다.
      checkSession:async()=>{try{const r=await fetch('/api/account',{headers:{accept:'application/json'},credentials:'same-origin'});return r.ok;}catch{return false;}},
      closeAccountMenu:()=>(0,ctx.closeAccountMenu)(),
      openEditor:(mode,parentId)=>(0,ctx.openEditor)(mode,parentId),
      showScreen:file=>(0,ctx.show)(file)
    });
  }};
}
