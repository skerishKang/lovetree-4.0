// 계정 메뉴와 설정 연결.
import {createWorkspaceApi, setMemberRefreshStarted} from "../api.mjs";
import {mountMyNews} from "../my-news.mjs";
import {clearCachedWorkspace, readCachedWorkspace, readLoginSubject, forgetLoginSubject} from "../workspace-cache.mjs";
import {parseSelectionRoute,memberStartupView,ownerSelectionRoute,accountPosition,rememberAccountPosition,resolveAccountPosition,stashPendingOwnerRoute,pendingOwnerRoute,takePendingOwnerRoute} from "../selection-location.mjs";
import {accountPresentation,treePickerLabel,treePickerText,treeViewsVisible,writeMenuLabel,headerState,headerPartsFor,readTipsSeen,writeTipsSeen,tipsWanted,unsavedNoticeText,FIRST_TREE_TIPS,homeCenterState,homeStartLoginUrl,readTheme,readLoginIntent,writeTheme,nextTheme,themeButtonLabel,themeButtonAriaLabel,themePressed,appliedTheme,applyThemeAttribute,LOGIN_INTENTS,readPageTurn,writePageTurn,readBookDisplay,writeBookDisplay,bookDisplayVisible,readShelfView,writeShelfView,shelfViewVisible} from "../header-state.mjs";
import {displayTreeTitle} from "../tree-name.mjs";
import {frameMessage, frameReadyMessages, FRAME_MESSAGE_TYPES} from "../frame-wiring.mjs";
import {screens,screenForView,viewForFile,themedViewFor} from "./navigation.mjs";
import {createWritePanel, readWriteTab, writeWriteTab} from "./write-panel.mjs";
import {createMessages, lastShelfTreeId} from "./messages.mjs";
import {createFeedbackDialog} from "../feedback.mjs";
import {createFeedbackBoard} from "../feedback-board.mjs";
import {mountUpdates} from "../updates.mjs";
import {createSettings} from "./settings.mjs";
import {paintLoginLinks,paintThemeControls,renderThemeChoices,applyTheme as applyThemeFor,toggleTheme as toggleThemeFor} from "./theme.mjs";
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment, normalizeBookDisplay, normalizeShelfView, coverModeOf, normalizeCoverDesign} from "../domain.mjs";

export function createSettingsRuntime(ctx){
  let shellSettings, showPublicRoute, applyAdvanced, applyDateStyleToFrame, applyPageTurnToFrame, applyNetworkViewToFrame, applyBoardThemeToFrame, syncBoardThemeToApp, quickTargetPreference, profileDirty, paintSettingsProfile, accountConfirmMatches, openAccountData, openAccountSettings, paintDateStyleControls, paintStartPlaceControls, paintShareControls, paintQuickTargetControls, paintNetworkViewControls, paintPageTurnControls, paintBoardThemeControls, paintTreeVisibilityList, paintSettingsUsage, loadTreeVisibility, paintTreeManagerVisibility, paintSettingsTab, focusSettingsSection, fillProfileForm, paintScreenControls, readAdvanced, advancedKey, currentDateStyle, currentPageTurn, sendToFrame, currentStartPlace, currentShareView, currentBoardTheme;
  Object.defineProperties(ctx,{
    shellSettings:{get:()=>shellSettings,set:value=>{shellSettings=value;}},
    showPublicRoute:{get:()=>showPublicRoute,set:value=>{showPublicRoute=value;}},
    applyAdvanced:{get:()=>applyAdvanced,set:value=>{applyAdvanced=value;}},
    applyDateStyleToFrame:{get:()=>applyDateStyleToFrame,set:value=>{applyDateStyleToFrame=value;}},
    applyPageTurnToFrame:{get:()=>applyPageTurnToFrame,set:value=>{applyPageTurnToFrame=value;}},
    applyBoardThemeToFrame:{get:()=>applyBoardThemeToFrame,set:value=>{applyBoardThemeToFrame=value;}},
    syncBoardThemeToApp:{get:()=>syncBoardThemeToApp,set:value=>{syncBoardThemeToApp=value;}},
    quickTargetPreference:{get:()=>quickTargetPreference,set:value=>{quickTargetPreference=value;}},
    profileDirty:{get:()=>profileDirty,set:value=>{profileDirty=value;}},
    paintSettingsProfile:{get:()=>paintSettingsProfile,set:value=>{paintSettingsProfile=value;}},
    openAccountData:{get:()=>openAccountData,set:value=>{openAccountData=value;}},
    paintQuickTargetControls:{get:()=>paintQuickTargetControls,set:value=>{paintQuickTargetControls=value;}},
    readAdvanced:{get:()=>readAdvanced,set:value=>{readAdvanced=value;}},
    currentDateStyle:{get:()=>currentDateStyle,set:value=>{currentDateStyle=value;}},
    currentPageTurn:{get:()=>currentPageTurn,set:value=>{currentPageTurn=value;}},
    sendToFrame:{get:()=>sendToFrame,set:value=>{sendToFrame=value;}},
    currentShareView:{get:()=>currentShareView,set:value=>{currentShareView=value;}}
  });
  return {mount(){
    (0,ctx.$)('account-entry').onclick=e=>{
     if(ctx.member?.snapshot().owned){e.preventDefault();(0,ctx.openAccountMenu)();}
     else if(parseSelectionRoute(location.hash).scope==='owner')stashPendingOwnerRoute(sessionStorage,location.hash);
    };

    (0,ctx.$)('account-avatar').onclick=e=>{
     e.stopPropagation();
     if((0,ctx.$)('account-popover').hidden){(0,ctx.openAccountMenu)(e.detail===0?'keyboard':'mouse');void shellSettings.getFeedbackBoard().refreshReplyDot();void shellSettings.refreshMyNewsCount?.();}else (0,ctx.closeAccountMenu)();
    };

    renderThemeChoices();
    shellSettings=createSettings({ $:ctx.$, memberViewsAvailable:ctx.memberViewsAvailable, notify:ctx.notify, setTitleDisplay:ctx.setTitleDisplay, openLoginStart:ctx.openLoginStart, links:ctx.links, screenForView, choose:ctx.choose, panel:ctx.panel, show:ctx.show, frames:ctx.frames, frameLoaded:ctx.frameLoaded, hideFrames:ctx.hideFrames, closeAccountMenu:ctx.closeAccountMenu, openAccountMenu:ctx.openAccountMenu, renderAccount:ctx.renderAccount, updateAccountControls:ctx.updateAccountControls, openAssets:ctx.openAssets, openEditor:ctx.openEditor, sample:ctx.sample, backup:ctx.backup, clear:ctx.clear, startMember:ctx.startMember, leaveMember:ctx.leaveMember, pauseMember:ctx.pauseMember, openFallbackShell:ctx.openFallbackShell, writeLocation:ctx.writeLocation, load:ctx.load, flowNavigation:ctx.flowNavigation, renderTreeMenu:ctx.renderTreeMenu, requestBoardOpen:ctx.requestBoardOpen, lastShelfTreeId, shellHeader:ctx.shellHeader, shellDialogs:ctx.shellDialogs,  shareApi:ctx.shareApi, accountApi:ctx.accountApi, onVisitorAccount:account=>{ctx.visitorAccount=account;ctx.shellHeader?.updateAccountControls();}, myNewsApi:ctx.myNewsApi, readTheme, writeTheme, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment,  readPageTurn, writePageTurn, frameMessage, displayTreeTitle, accountPresentation, createFeedbackDialog, createFeedbackBoard, mountUpdates, mountMyNews, readWriteTab, writeWriteTab, clearCachedWorkspace, forgetLoginSubject, createWorkspaceApi, paintThemeControls, applyTheme:ctx.applyTheme, toggleTheme:ctx.toggleTheme, paintBookDisplayControls:ctx.paintBookDisplayControls, get member(){return ctx.member}, get model(){return ctx.model}, get current(){return ctx.current}, get source(){return ctx.source}, get motionPaused(){return ctx.motionPaused}, get loadGeneration(){return ctx.loadGeneration}, get handledHash(){return ctx.handledHash}, get activeShareId(){return ctx.activeShareId}, set member(v){ctx.member=v}, set model(v){ctx.model=v}, set current(v){ctx.current=v}, set source(v){ctx.source=v}, set motionPaused(v){ctx.motionPaused=v}, set loadGeneration(v){ctx.loadGeneration=v}, set handledHash(v){ctx.handledHash=v}, set activeShareId(v){ctx.activeShareId=v}
     });

    ({ showPublicRoute, applyAdvanced, applyDateStyleToFrame, applyPageTurnToFrame, applyNetworkViewToFrame, applyBoardThemeToFrame, syncBoardThemeToApp, quickTargetPreference, profileDirty, paintSettingsProfile, accountConfirmMatches, openAccountData, openAccountSettings, paintDateStyleControls, paintStartPlaceControls, paintShareControls, paintQuickTargetControls, paintNetworkViewControls, paintPageTurnControls, paintBoardThemeControls, paintTreeVisibilityList, paintSettingsUsage, loadTreeVisibility, paintTreeManagerVisibility, paintSettingsTab, focusSettingsSection, fillProfileForm, paintScreenControls, readAdvanced, advancedKey, currentDateStyle, currentPageTurn, sendToFrame, currentStartPlace, currentShareView, currentBoardTheme }=shellSettings);

    // #1094: 머리줄 묶음과 설정 창의 같은 data-book-display 두 칸이 하나의 길로 바뀌고 저장된다.
    for(const b of document.querySelectorAll('[data-book-display]'))b.onclick=()=>{
     (0,ctx.setBookDisplay)(b.dataset.bookDisplay);
    };

    // #1093: 서재 진열 두 칸도 같은 길로 바뀌고 저장된다.
    for(const b of document.querySelectorAll('[data-shelf-view]'))b.onclick=()=>{
     (0,ctx.setShelfView)(b.dataset.shelfView);
    };

    paintThemeControls();

    (0,ctx.applyTheme)();

    (0,ctx.paintTitleDisplayControls)();

    (0,ctx.paintBookDisplayControls)();

    (0,ctx.paintShelfViewControls)();

    applyAdvanced();
  }};
}
