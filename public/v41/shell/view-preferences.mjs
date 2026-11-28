// 화면 표시 설정과 제목 보정.
import { MSG } from "../frame-messages.mjs";
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,unsavedNoticeText,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,normalizeTheme,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn,readBookDisplay,writeBookDisplay,bookDisplayVisible,readShelfView,writeShelfView,shelfViewVisible} from "../header-state.mjs";
import {frameMessage, frameReadyMessages, FRAME_MESSAGE_TYPES} from "../frame-wiring.mjs";
import {screens,screenForView,viewForFile,themedViewFor} from "./navigation.mjs";
import {paintLoginLinks,paintThemeControls,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from "./theme.mjs";
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment, normalizeBookDisplay, normalizeShelfView, coverModeOf, normalizeCoverDesign} from "../domain.mjs";
import {backfillVideoTitles} from "../title-backfill.mjs";
import {isVisitMode,readVisitPrefs,readVisitTheme,setVisitTheme} from "../visit-mode.mjs";

export function createViewPreferences(ctx){
  let backfillStarted, backfillAttempted;
  // #977: 셸을 세우다 예외가 나도 빈 화면에 멈추지 않는다 — 읽을 수 있는 기록으로 한 번 더 열고 안내를 남긴다.
  function openFallbackShell(error){
   try{console.warn('[LT41] 셸을 여는 중 문제가 있었어요:',error?.message||String(error));}catch{}
   let state={version:1,trees:[]};
   try{state=ctx.member?.state?.()||state;}catch{}
   try{(0,ctx.load)({revision:0,state},'server');}catch{try{(0,ctx.load)({revision:0,state:{version:1,trees:[]}},'file');}catch{}}
   (0,ctx.notify)('기록을 불러오지 못했어요. 화면을 새로고침해 다시 시도해 주세요.',{hold:true});
  }

  // #347 후속: 계정 제목 보기 설정. 계정 상태(state.prefs.titleDisplay)에 저장하고 화면에 알린다.
  function currentPrefs(){if(isVisitMode())return readVisitPrefs()||{titleDisplay:'both'};try{return ctx.member?.state?.().prefs||{titleDisplay:'both'}}catch{return {titleDisplay:'both'}}}

  function titleDisplayValue(){return normalizeTitleDisplay(currentPrefs().titleDisplay)}

  function paintTitleDisplayControls(){const value=titleDisplayValue();for(const b of document.querySelectorAll('[data-title-display]'))b.setAttribute('aria-checked',String(b.dataset.titleDisplay===value));}

  function postTitleDisplay(){try{(0,ctx.$)('view').contentWindow.postMessage(frameMessage('titleDisplay',titleDisplayValue()),location.origin)}catch{}}

  // #481: 화면(iframe)은 그려지는 시점에 계정 값을 모른다. 날짜 표기와 같이 마지막 값을 기기에 함께 둔다 —
  // 받는 쪽은 '지금 그린 값'과 '미러'를 비교해, 다시 뜨면 정말 새 값으로 그려질 때만 다시 띄운다.
  function rememberTitleDisplay(value){try{localStorage.setItem('lt41.titleDisplay',normalizeTitleDisplay(value));}catch{}}

  function setTitleDisplay(value){
   if(isVisitMode())return;
   if(!ctx.member?.snapshot().owned){(0,ctx.notify)('로그인한 뒤 제목 보기를 바꿀 수 있어요.');return;}
   try{ctx.member.apply('setPrefs',{titleDisplay:value});}catch(e){(0,ctx.notify)('제목 보기를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
   if(window.LT41)window.LT41.prefs=ctx.member.state().prefs;
   rememberTitleDisplay(titleDisplayValue());
   paintTitleDisplayControls();
   postTitleDisplay();
  }

  // #1094: 책/목록 보기 선택. 계정 상태(state.prefs.bookDisplay)에 저장하고 기기 미러(lt41.bookDisplay)에 함께 둔다
  // (날짜 표기·제목 보기와 같은 길). 머리줄 묶음(.view-toggle)과 설정 창의 같은 data-book-display 단추 두 칸을 칠한다.
  // 서재 안의 프레임은 누르는 순간 부모의 prefs와 미러를 함께 읽어, 중간 화면 없이 고른 방식으로 연다.
  function currentBookDisplay(){if(isVisitMode())return normalizeBookDisplay(readVisitPrefs()?.bookDisplay);try{return normalizeBookDisplay(ctx.member?.state?.().prefs?.bookDisplay)}catch{return readBookDisplay(localStorage)}}

  function rememberBookDisplay(value){writeBookDisplay(localStorage,value)}

  function paintBookDisplayControls(){const value=currentBookDisplay();for(const b of document.querySelectorAll('[data-book-display]'))b.setAttribute('aria-checked',String(b.dataset.bookDisplay===value));}

  function setBookDisplay(value){
   if(isVisitMode())return;
   const next=normalizeBookDisplay(value);
   if(!ctx.member?.snapshot().owned){(0,ctx.notify)('로그인한 뒤 보기 방식을 바꿀 수 있어요.');return;}
   try{ctx.member.apply('setPrefs',{bookDisplay:next});}catch(e){(0,ctx.notify)('보기 방식을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
   if(window.LT41)window.LT41.prefs=ctx.member.state().prefs;
   rememberBookDisplay(currentBookDisplay());
   paintBookDisplayControls();
  }

  // #1093: 서재 진열 방식(선반/회전)도 같은 길로 저장하고, 서재 화면에 바로 알린다.
  // #1366: 값이 없거나 잘못된 값이면 회전이 기본이다. 저장된 'shelf'는 그대로 유지한다.
  const shelfViewOf=value=>value==='shelf'?'shelf':'carousel';
  function currentShelfView(){if(isVisitMode())return shelfViewOf(readVisitPrefs()?.shelfView);try{return shelfViewOf(ctx.member?.state?.().prefs?.shelfView)}catch{return shelfViewOf(readShelfView(localStorage))}}

  function rememberShelfView(value){writeShelfView(localStorage,value)}

  function paintShelfViewControls(){const value=currentShelfView();for(const b of document.querySelectorAll('[data-shelf-view]'))b.setAttribute('aria-checked',String(b.dataset.shelfView===value));}

  function setShelfView(value){
   if(isVisitMode())return;
   const next=shelfViewOf(value);
   if(!ctx.member?.snapshot().owned){(0,ctx.notify)('로그인한 뒤 진열 방식을 바꿀 수 있어요.');return;}
   try{ctx.member.apply('setPrefs',{shelfView:next});}catch(e){(0,ctx.notify)('진열 방식을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');return;}
   if(window.LT41)window.LT41.prefs=ctx.member.state().prefs;
   rememberShelfView(currentShelfView());
   paintShelfViewControls();
   try{(0,ctx.$)('view').contentWindow.postMessage({type:MSG.shelfView,value:currentShelfView()},location.origin)}catch{}
  }

  async function runTitleBackfill(state,session){
   if(ctx.source!=='server'||!session.snapshot().owned)return;
   await backfillVideoTitles({state,source:ctx.source,apply:(action,input)=>session.apply(action,input),attempted:backfillAttempted});
  }

  function themedView(){return themedViewFor(ctx.current);}

  function applyTheme(theme=readVisitTheme()||readTheme(localStorage)){return applyThemeFor(ctx.current,theme);}

  function reflectTheme(value){if(isVisitMode()){const theme=normalizeTheme(value||readVisitTheme());setVisitTheme(theme);if(window.LT41)window.LT41.prefs={...(window.LT41.prefs||{}),theme};applyTheme(theme);paintThemeControls(theme);(0,ctx.syncBoardThemeToApp)(theme);return theme;}const theme=writeTheme(localStorage,value);applyTheme(theme);paintThemeControls(theme);(0,ctx.syncBoardThemeToApp)(theme);return theme;}
  function setTheme(value){const theme=reflectTheme(value);if(isVisitMode())return theme;if(ctx.member?.snapshot().owned){try{ctx.member.apply('setPrefs',{theme});if(window.LT41)window.LT41.prefs=ctx.member.state().prefs;}catch(error){(0,ctx.notify)('테마를 계정에 저장하지 못했어요. 다시 시도해 주세요.');}}return theme;}
  function toggleTheme(){return setTheme(nextTheme(readVisitTheme()||readTheme(localStorage)));}
  Object.defineProperties(ctx,{
    openFallbackShell:{value:openFallbackShell},
    currentPrefs:{value:currentPrefs},
    titleDisplayValue:{value:titleDisplayValue},
    paintTitleDisplayControls:{value:paintTitleDisplayControls},
    rememberTitleDisplay:{value:rememberTitleDisplay},
    setTitleDisplay:{value:setTitleDisplay},
    rememberBookDisplay:{value:rememberBookDisplay},
    paintBookDisplayControls:{value:paintBookDisplayControls},
    setBookDisplay:{value:setBookDisplay},
    rememberShelfView:{value:rememberShelfView},
    paintShelfViewControls:{value:paintShelfViewControls},
    setShelfView:{value:setShelfView},
    backfillStarted:{get:()=>backfillStarted,set:value=>{backfillStarted=value;}},
    backfillAttempted:{get:()=>backfillAttempted,set:value=>{backfillAttempted=value;}},
    runTitleBackfill:{value:runTitleBackfill},
    applyTheme:{value:applyTheme},
    reflectTheme:{value:reflectTheme},
    setTheme:{value:setTheme},
    toggleTheme:{value:toggleTheme}
  });
  return {mount(){
    backfillStarted=false,backfillAttempted=new Set();
  }};
}
