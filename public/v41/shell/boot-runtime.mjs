// 첫 화면 시작과 로그인·종료 안내.
import {memberLoginUrl,shouldLoadMemberRecords} from "../member-entry.mjs";
import {createNotifier, syncedNoticeText, newlyPublishedTrees, NOTICE_HIDE_MS} from "./notice.mjs";
import {LOGIN_NOTICE_PARAM, LOGIN_NOTICE_TEXT, LOGIN_NOTICE_BUTTON, loginNoticeFrom} from "./login-notice.mjs";

export function createBootRuntime(ctx){
  function backup(){const data=ctx.member?.state();if(!data){(0,ctx.notify)('백업할 내 기록이 없어요.');return;}const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='lovetree-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}

  function openAssets(opener=document.activeElement){if(!ctx.member?.snapshot().owned){(0,ctx.notify)('로그인한 뒤 내가 올린 사진·영상을 확인할 수 있어요.');return;}ctx.shellDialogs.rememberOpener(opener);(0,ctx.panel)('account-assets');ctx.uploads.openAssets();}

  function usePrivateAsset(){
   if(ctx.source!=='server'||!ctx.member?.snapshot().owned){(0,ctx.openLoginStart)('new-tree');return false;}
   if(!ctx.member.snapshot().writable){(0,ctx.notify)('서버 편집 연결이 아직 준비되지 않았어요. 기록은 안전하게 읽을 수 있습니다.');(0,ctx.openAccountData)();return false;}
   if(!window.LT41){(0,ctx.openEditor)();(0,ctx.notify)('새 트리를 만든 뒤 순간에 파일을 첨부할 수 있어요.');return false;}
   if(!window.LT41.momentId){(0,ctx.notify)('순간을 먼저 연 뒤 내가 올린 사진·영상을 첨부할 수 있어요.');return false;}
   if(!(0,ctx.$)('write-panel').open)(0,ctx.openEditor)('add');
   return (0,ctx.$)('write-panel').open;
  }
  Object.defineProperties(ctx,{
    backup:{value:backup},
    openAssets:{value:openAssets},
    usePrivateAsset:{value:usePrivateAsset}
  });
  return {mount(){
    if(ctx.initialRoute.scope==='public')(0,ctx.showPublicRoute)(ctx.initialRoute);
    else if((0,ctx.onExploreRoute)()){/* #1025: 둘러보기가 자기 주소를 연다 — 예시 로드로 주소를 덮지 않는다. #1092: [트리] 보기(#explore)는 화면으로 바로 연다 — [순간](#explore/moments)은 창 모듈이 자기 주소로 연다. */
     if(location.hash==='#explore')ctx.shellCommunityScreen.openRoute();
    }
    else if(shouldLoadMemberRecords(location.search,document.cookie,location.hash)||ctx.shellIntake.pending()){
     // #1026 E: 기존 사용자는 예시를 받지 않는다. 주소가 정해지는 즉시 빈 틀을 세우고,
     // 아래 startMember()가 기록을 받는 대로 화면 iframe을 연다 — example.mjs 요청 0.
     (0,ctx.clear)(true);
    }else{
     // 로그아웃·신규 사용자는 예시가 실제 내용이므로 필요한 이 순간에만 동적으로 받는다.
     ctx.shellStageLoading.start('home');
     ctx.exampleInitializing=true;
     void (0,ctx.loadExampleTree)().then(tree=>{if(ctx.source!=='server'&&ctx.source!=='share')(0,ctx.load)(null,'example',{}, {},tree);ctx.exampleInitializing=false;}).catch(()=>{ctx.exampleInitializing=false;});
    }

    addEventListener('beforeunload',e=>{
     if(ctx.member?.snapshot().dirty||(0,ctx.formDirty)()||(0,ctx.treeDirty)()){e.preventDefault();e.returnValue='';}
    });

    if(shouldLoadMemberRecords(location.search,document.cookie,location.hash)||ctx.shellIntake.pending())void (0,ctx.startMember)().catch(error=>(0,ctx.openFallbackShell)(error));

    // 로그아웃으로 다시 연 문서에서는 '로그인이 필요해요' 대신 이 안내를 한 번 띄운다.
    try{if(sessionStorage.getItem('lt41.logoutNotice')==='1'){sessionStorage.removeItem('lt41.logoutNotice');(0,ctx.notify)('로그아웃했어요.');}}catch{}

    // #1175: 로그인 콜백이 거절되면 서버가 JSON 대신 이 표지를 달아 /v41/로 보낸다.
    // 날 글자 대신 한 줄 안내와 다시 로그인 단추를 보여 주고, 표지는 주소에서 걷어 다시 뜨지 않게 한다.
    if(loginNoticeFrom(location.search)){
     try{const clean=new URL(location.href);clean.searchParams.delete(LOGIN_NOTICE_PARAM);history.replaceState(null,'',clean.pathname+clean.search+clean.hash);}catch{}
     // 첫 화면의 다른 안내(새 소식 띠·첫 트리 안내)보다 먼저 보인다 — 그 쪽이 뜨며 토스트를 감추지 못하게 한다.
     ctx.noticeQueue.request('loginNotice',{
      show:()=>{
       (0,ctx.notify)(LOGIN_NOTICE_TEXT,{hold:true,action:{label:LOGIN_NOTICE_BUTTON,run:()=>(0,ctx.openLoginStart)('first')}});
       setTimeout(()=>ctx.noticeQueue.release('loginNotice'),NOTICE_HIDE_MS+50);
      },
      hide:ctx.hideToast
     });
    }
  }};
}
