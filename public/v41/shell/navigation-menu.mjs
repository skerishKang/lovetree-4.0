// 접기 메뉴와 트리 메뉴 연결.
import { MSG } from "../frame-messages.mjs";
import {displayTreeTitle} from "../tree-name.mjs";
import {headerBadge, cleanupAvailable} from "../inbox-model.mjs";
import {createTreeMenu} from "./tree-menu.mjs";
import {normalizeTitleDisplay, normalizeAccentColor, normalizeDateStyle, normalizeStartPlace, normalizeShareView, normalizeHomeMoment, normalizeBookDisplay, normalizeShelfView, coverModeOf, normalizeCoverDesign} from "../domain.mjs";
import {thumbnailCandidates, coverFallbackAttrs, fallbackCardData, emotionToneOf, mountThumbFallback, ADD_TITLE_LABEL, VIDEO_UNAVAILABLE_TEXT} from "../thumb-fallback.mjs";

export function createNavigationMenu(ctx){
  let moreButton, moreMenu, treePopover, treeTrigger, shellTreeMenu, escHTML, treeMomentThumb, treeCoverMarkup, renderTreeMenu, scrollTreeItemIntoView, openTreeMenu, closeTreeMenu;
  function closeMore(){moreMenu.classList.remove('is-open');moreMenu.hidden=true;moreButton.setAttribute('aria-expanded','false');}

  function buildFoldMenu(){
   moreMenu.replaceChildren();
   const add=(label,click,mark)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=label;if(mark)b.setAttribute('aria-current','true');b.onclick=()=>{closeMore();click()};moreMenu.append(b)};
   // #635 PR C: 로그아웃 상태 메뉴(≡) 맨 위에 시작 입구 — 첫 화면의 '첫 순간 추가'와 같은 시작 흐름(openLoginStart('first'))으로 간다.
   // 로그인 상태 메뉴는 바꾸지 않는다.
   if(!ctx.member?.snapshot().owned)add('내 러브트리 시작하기',()=>(0,ctx.openLoginStart)('first'));
   // #380 2번: 접기 메뉴도 맨 위 메뉴와 같은 구조 — 첫 화면(로고)·둘러보기 · 서재·책·보드·지도 · 순간 추가.
   // 261117 대표 확정: 서재가 탭 줄 [서재][책][보드][지도]의 첫 자리 — 접기 메뉴도 같은 순서를 미러한다.
   // #458: 지금 보고 있는 화면 항목에 aria-current를 남긴다(메뉴를 열 때마다 다시 만들어 지금 상태를 반영한다).
   add('첫 화면',()=>document.querySelector('.brand').click(),ctx.current==='src064-orbit.html');
   add('둘러보기',()=>(0,ctx.$)('community-menu').click());
   add('서재',()=>{(0,ctx.memberViewsAvailable)()?(0,ctx.show)('track32-bookshelf.html'):(0,ctx.openLoginStart)('shelf')},ctx.current==='track32-bookshelf.html');
   // 2026-11-17 대표 결정: 트리 0개여도 네 화면이 모두 열리므로 접기 메뉴에서도 책·보드·지도를 늘 둔다.
   add('책',()=>(0,ctx.show)('track59-sketchbook.html'),ctx.current==='track59-sketchbook.html');
   add('보드',()=>(0,ctx.show)('track58-pinboard.html'),ctx.current==='track58-pinboard.html');
   add('지도',()=>(0,ctx.show)('track56-network.html'),ctx.current==='track56-network.html');
    if(!(0,ctx.$)('write-menu').hidden)add('＋ 순간 추가',()=>(0,ctx.$)('write-menu').click());
    add('의견 보내기',()=>ctx.shellSettings.getFeedbackDialog().open());
   }
  Object.defineProperties(ctx,{
    closeMore:{value:closeMore},
    treeMomentThumb:{get:()=>treeMomentThumb,set:value=>{treeMomentThumb=value;}},
    renderTreeMenu:{get:()=>renderTreeMenu,set:value=>{renderTreeMenu=value;}},
    closeTreeMenu:{get:()=>closeTreeMenu,set:value=>{closeTreeMenu=value;}}
  });
  return {mount(){
    moreButton=(0,ctx.$)('mobile-more'),moreMenu=(0,ctx.$)('header-overflow');

    treePopover=(0,ctx.$)('tree-popover'),treeTrigger=(0,ctx.$)('record-menu');

    shellTreeMenu=createTreeMenu({$:ctx.$, document, window, location, get model(){return ctx.model}, get member(){return ctx.member}, get current(){return ctx.current}, get source(){return ctx.source}, treePopover, treeTrigger, thumbnailCandidates, coverFallbackAttrs, coverModeOf, normalizeCoverDesign, displayTreeTitle, cleanupAvailable, writeLocation:ctx.writeLocation, renderAccount:ctx.renderAccount, flowNavigation:ctx.flowNavigation, choose:ctx.choose, show:ctx.show, openEditor:ctx.openEditor, openLoginStart:ctx.openLoginStart, get shellCleanup(){return ctx.shellCleanup}, get shellTagManager(){return ctx.shellTagManager}, get shellPanels(){return ctx.shellPanels}
     });

    ({ escHTML, treeMomentThumb, treeCoverMarkup, renderTreeMenu, scrollTreeItemIntoView, openTreeMenu, closeTreeMenu }=shellTreeMenu);

    addEventListener('lt41-trees-changed',()=>{
     if(treePopover&&!treePopover.hidden)renderTreeMenu();
     (0,ctx.paintQuickTargetControls)();
     try {
      const titles=(window.LT41?.trees||[]).map(t=>({id:t.id,title:t.title}));
      // #984: frames()는 iframe 요소다 — contentWindow로 보내야 한다(f?.postMessage는 TypeError로 삼켜져 한 번도 나가지 않았다).
      for(const f of (0,ctx.frames)()) f.contentWindow?.postMessage({type:MSG.treesRenamed,titles},location.origin);
     } catch {}
    });

    (0,ctx.$)('mobile-more').addEventListener('click',event=>{
     event.stopPropagation();
     if(moreMenu.hidden){buildFoldMenu();moreMenu.hidden=false;moreMenu.classList.add('is-open');moreButton.setAttribute('aria-expanded','true');}
     else closeMore();
    });

    moreMenu.addEventListener('click',event=>{
     if(event.target.closest('button'))closeMore();
    });

    document.addEventListener('click',event=>{
     if(!moreMenu.contains(event.target)&&event.target!==moreButton)closeMore();
    });

    document.addEventListener('keydown',event=>{
     if(event.key==='Escape'&&!moreMenu.hidden){closeMore();moreButton.focus();}
    });

    addEventListener('resize',()=>{if(matchMedia('(min-width:781px)').matches)closeMore();});

    // #458: 화상 키보드가 올라오면(시각 창이 눌리면) 떠 있는 단추가 입력 칸을 가리지 않게 숨긴다.
    if(window.visualViewport){const fabKbd=()=>document.body.classList.toggle('lt-kbd',window.visualViewport.height<window.innerHeight-120);window.visualViewport.addEventListener('resize',fabKbd);fabKbd();}
  }};
}
