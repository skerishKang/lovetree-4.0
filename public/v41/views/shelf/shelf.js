// 내 책장 동작 (#231 후속, 2026-11-09).
// 계산(표지 색·이름·정보 줄·검색·카드 배치·페이지)은 shelf-model.mjs로 옮기고 여기서는 화면만 다룬다.
// 조건·문구·id·순서 변경 0. #291(궤도)와 같이 모듈로 불러 쓴다.
import {
  COVER_PALETTE, allBooks as allBooksOf, bookMeta, buildShelf, carouselTransform, coverStyle as coverStyleOf,
  escapeShelf, filterShelf, findBook, lastMomentDate as lastMomentDateOf,
  resolveShelfIndex, resumeCard, spineItems as spineItemsOf, spineScrollLeft as spineScrollLeftOf, spineStyle as spineStyleOf, spineTargetIndex as spineTargetIndexOf, spineVisible as spineVisibleOf,
  treeTitleOf, youtubeId as youtubeIdOf
} from './shelf-model.mjs';
import { shelfOrder, INBOX_LABEL } from '../../inbox-model.mjs';
import { titleView, titleDisplayOf, shouldReloadForTitleDisplay } from '../../book-usability.mjs';
import { coverFallbackAttrs, mountThumbFallback } from '../../thumb-fallback.mjs';
import { createReader } from './shelf-reader.js';

{
  {
    'use strict';
      var $ = function (selector) { return document.querySelector(selector); };
      var $$ = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
      var sourceLabel = 'bookmarks_LIKE_only_2026-07-28.html';
      // #212: 표지에 보이는 이름은 한 번만 쓴다. 자동 접미사(", 나의 순간들")는 표시 단계에서만 뺀다(tree-name.mjs).
      var namer = function (value) { return (window.LTTreeName && window.LTTreeName.displayTreeTitle) ? window.LTTreeName.displayTreeTitle(value) : value; };
      var treeTitle = function (value) { return treeTitleOf(value, namer); };
      var lastMomentDate = lastMomentDateOf;
      // #212: 표지 색은 테마 변수를 넘긴다. 밤은 장미색이 아닌 값, 정원은 지금 크림색 책장 색이며
      // 실제 색값은 identity.css의 --lt-cover-N에만 있다(테마를 바꿔도 다시 그릴 필요가 없다).
      var palette = COVER_PALETTE;
      var books = buildShelf(shelfOrder(LTDEMO.library), palette, namer);
      var state = { filter:'all', query:'', selectedId:null, shelfIndex:0, shelfList:[], chapterIndex:0, open:false, openProgress:0, customBooks:[], pageTurning:false };
      var storageKey = 'lovetree-people-book-shelf-v2-1-true-page-motion';
      var drag = { active:false, mode:'', startX:0, startY:0, moved:false, startProgress:0 };
      var shelfDrag = { active:false, startX:0, moved:false, downIndex:null };
      try {
        var saved = {};
        state.selectedId = null;
        state.shelfIndex = Number.isInteger(saved.shelfIndex) ? saved.shelfIndex : 0;
        state.chapterIndex = Number.isInteger(saved.chapterIndex) ? saved.chapterIndex : 0;
        state.open = false;
        state.openProgress = 0;
        state.customBooks = [];
      } catch (error) {}
      state.shelfIndex=Math.max(0,books.findIndex(book=>book.id===parent.LT41.tree.id));
      function allBooks() { return allBooksOf(books, state.customBooks); }
      function getBook(id) { return findBook(allBooks(), id); }
      function save() {} // Selection belongs to the shell; never persist another account's library.
      var esc = escapeShelf;
      var youtubeId = function (url) { return youtubeIdOf(url, window.LTMedia && window.LTMedia.describe); };
      function showToast(message) { var toast=$('#toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(function(){toast.classList.remove('show');},2400); }
      var coverStyle = coverStyleOf;
      // #256 2번: 책등 목차 계산은 shelf-model.mjs 한 벌만 쓴다(보일지 말지·책등 목록·누른 책 → 넘기기 위치·목차 줄 가로 위치).
      var spineVisible = spineVisibleOf, spineItems = spineItemsOf, spineStyle = spineStyleOf, spineTargetIndex = spineTargetIndexOf, spineScrollLeft = spineScrollLeftOf;
      function openModal(id) { $('#'+id).classList.remove('hidden'); }
      function closeModal(id) { $('#'+id).classList.add('hidden'); }
      function renderShelf() {
        var list=filterShelf(allBooks(), state.filter, state.query);
        state.shelfList=list;
        state.shelfIndex=resolveShelfIndex(list, state.selectedId, state.shelfIndex);
        $('#resultCount').textContent=list.length+'권';
        renderSpines(list);
        // #465: 넘길 책이 없으면(1권 이하) 좌우 넘김 화살표를 숨기고, 책이 1~2권이면
        // 소개 상자(hero)를 낮게 둔다 — 책등 목차가 3권부터인 것과 같은 기준이다.
        var prevArrow=$('#shelfPrev'),nextArrow=$('#shelfNext');
        if(prevArrow)prevArrow.hidden=list.length<=1;
        if(nextArrow)nextArrow.hidden=list.length<=1;
        var hero=document.querySelector('.hero');
        if(hero)hero.classList.toggle('compact',!spineVisible(list.length));
        // #256-1: 목록이 바뀔 때마다 다시 그린다. 칸은 검색·필터와 무관하게 전체 책(allBooks) 기준이라 좁아져도 그대로다.
        renderResumeCard();
        $('#shelfRail').innerHTML=list.length?list.map(function(book,index){
          // #212: 표지에 이름 한 번만. 표지 아래는 "순간 N개 · 마지막 YYYY-MM-DD" 하나만. "책 · 02"·"기본 표지" 같은 내부 표시는 없다.
          // #256-3: 디자인 표지는 shelf-model coverChoice 판정(book.design)을 그대로 쓴다. 없으면 속성도 없다(기존 화면 변화 0).
          return '<article class="book-card" data-book-index="'+index+'"><button type="button" data-book-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 기억책 열기">'+
            '<div class="book-cover"'+(book.design?' data-cover-design="'+esc(book.design)+'"':'')+' style="'+coverStyle(book)+'">'+(book.inbox?'<span class="inbox-chip">'+INBOX_LABEL+'</span>':'')+(book.coverMedia?'<img class="book-cover-media" src="'+esc(book.coverMedia)+'"'+coverFallbackAttrs(book.coverCandidates||[book.coverMedia])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(book.symbol)+'</span></span><strong class="cover-title">'+esc(book.name)+'</strong></div>'+
            '<span class="book-card-meta"><span>'+esc(bookMeta(book))+'</span></span></button></article>';
        }).join(''):'<div class="empty"><strong>찾는 책이 없어요.</strong><span>트리 이름·좋아하는 대상·순간 제목으로 검색해 보세요.</span></div>';
        updateCarousel(false);
      }
      function renderSpines(list) {
        // #256 2번: 3권부터만 책등을 세운다. 1~2권이면 목차를 숨긴다(hidden).
        var nav=$('#shelfSpines'),row=$('#shelfSpineRow');
        if(!nav||!row)return;
        var visible=spineVisible(list.length);
        nav.hidden=!visible;
        row.innerHTML=visible?spineItems(list).map(function(item){
          return '<button type="button" class="shelf-spine" data-book-id="'+esc(item.id)+'" data-book-index="'+item.index+'" style="'+spineStyle(item)+'" aria-label="'+esc(item.name)+' 책으로 넘기기"><span class="shelf-spine-title">'+esc(item.name)+'</span></button>';
        }).join(''):'';
        syncSpines(true);
      }
      var spineActiveId=null;
      function syncSpines(instant) {
        // 레일(아래 넘기기)이 움직이면 목차의 선택 표시와 가로 위치를 그 책에 맞춘다.
        var row=$('#shelfSpineRow');
        if(!row||!row.children.length)return;
        var book=state.shelfList[state.shelfIndex],activeId=book?book.id:null;
        Array.prototype.forEach.call(row.children,function(button){
          var active=button.dataset.bookId===activeId;
          button.classList.toggle('is-active',active);
          if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');
        });
        if(activeId===spineActiveId)return;
        spineActiveId=activeId;
        var active=row.querySelector('[data-book-id="'+CSS.escape(activeId||'')+'"]');
        if(!active)return;
        // CTO 검토 후속: scrollIntoView는 목차 줄뿐 아니라 스크롤 가능한 조상(책장 문서·셸 부모)까지 움직인다.
        // 목차 줄(#shelfSpineRow)의 가로 스크롤만 움직인다. 위치 계산은 shelf-model의 spineScrollLeft 한 벌.
        var rowRect=row.getBoundingClientRect(),rect=active.getBoundingClientRect();
        row.scrollTo({left:spineScrollLeft(row.clientWidth,row.scrollWidth,rect.left-rowRect.left+row.scrollLeft,rect.width),behavior:instant?'auto':'smooth'});
      }
      // #256-1: 오른쪽 위 작은 책장(빠른 이동) 자리를 이어 읽기 칸으로 쓴다.
      // 마지막 위치는 새로 저장하지 않고, 셸이 이미 저장·복원하는 계정 위치를 읽어 보여 준다.
      function renderResumeCard() {
        var card=$('#resumeCard');
        if(!card)return;
        var context=window.parent&&window.parent.LT41?window.parent.LT41:null;
        var info=resumeCard({
          source:context?context.source:'server',
          treeId:context&&context.tree?context.tree.id:'',
          momentId:typeof LTDEMO.get==='function'?String(LTDEMO.get()||''):'',
          books:allBooks()
        });
        card.hidden=false;
        card.dataset.resumeKind=info.kind;
        var cover=$('#resumeCover');
        if(cover){
          if(info.book){
            cover.style.setProperty('--cover',info.book.color);
            cover.style.setProperty('--cover-accent',info.book.accent);
            // #256-3: 디자인 표지는 책장 카드와 같은 판정(coverChoice 결과 book.design)을 쓴다. 없으면 속성을 뺀다.
            // 질감은 identity.css의 같은 규칙이 resume-cover 선택자로 함께 그린다(새 사본 없음).
            if(info.book.design)cover.setAttribute('data-cover-design',info.book.design);else cover.removeAttribute('data-cover-design');
            cover.innerHTML=(info.book.coverMedia?'<img src="'+esc(info.book.coverMedia)+'"'+coverFallbackAttrs(info.book.coverCandidates||[info.book.coverMedia])+' alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span>'+esc(info.book.symbol)+'</span><strong>'+esc(info.book.name)+'</strong>';
          } else { cover.removeAttribute('data-cover-design'); cover.innerHTML=''; }
        }
        $('#resumeTitle').textContent=info.title;
        if(info.moment){const setting=(()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})();const main=titleView(info.moment,setting).main;if(main)$('#resumeTitle').textContent='지난번 '+main.replace(/[.。!?！？]+$/u,'')+'까지 봤어요';}
        $('#resumeAction').textContent=info.action;
        card.onclick=function(){
          if(info.kind==='first'){parent.postMessage({type:'lt41-write',mode:'new'},location.origin);return;}
          if(info.book&&info.moment)LTDEMO.openBook(info.moment.id,info.book.id);
          else if(info.book)LTDEMO.openBook(info.book.chapters[0]&&info.book.chapters[0].id,info.book.id);
        };
      }
      function setShelfAtmosphere(book) {
        var viewport=$('#shelfViewport');
        if(!viewport||!book)return;
        viewport.style.setProperty('--shelf-accent',book.color);
        viewport.setAttribute('data-selected-book',book.id);
      }
      function updateCarousel() {
        var rail=$('#shelfRail');
        if(!rail||!state.shelfList.length)return;
        var center=state.shelfIndex;
        state.shelfList.forEach(function(book,index){
          var card=rail.querySelector('[data-book-index="'+index+'"]');
          if(!card)return;
          // #212: 중앙 카드는 레일 높이(375)보다 큰 352px이라 위로 뜨면 표지 윗부분이 잘렸다.
          // 중앙은 위로 띄우지 않고 아래로 살짝 내리고, 배율을 레일 안에 들어가는 값으로 조정한다.
          var placed=carouselTransform(index-center);
          card.style.setProperty('--x',placed.x+'px');
          card.style.setProperty('--y',placed.y+'px');
          card.style.setProperty('--z',placed.z+'px');
          card.style.setProperty('--scale',placed.scale);
          card.style.setProperty('--rot',placed.rotate+'deg');
          card.style.setProperty('--alpha',placed.alpha);
          card.style.zIndex=String(placed.zIndex);
          card.classList.toggle('is-center',index===center);
          card.style.pointerEvents=placed.pointerEvents;
          card.style.filter=placed.filter;
        });
        syncSpines();
        setShelfAtmosphere(state.shelfList[center]);
      }
      function moveShelf(direction) {
        if(!state.shelfList.length)return;
        var next=Math.max(0,Math.min(state.shelfList.length-1,state.shelfIndex+direction));
        if(next===state.shelfIndex)return;
        state.shelfIndex=next;save();updateCarousel();
      }
      function selectShelfIndex(index) {
        if(index<0||index>=state.shelfList.length)return;
        if(index!==state.shelfIndex){state.shelfIndex=index;updateCarousel();}
        var book=state.shelfList[index];
        if(book)openReader(book.id,getShelfCard(index));
      }
      function getShelfCard(index) { return $('#shelfRail [data-book-index="'+index+'"]'); }
      // 읽기(펼침·장 넘김·끌기)는 shelf-reader.js가 맡는다. 상태·도우미만 넘겨 준다.
      var reader = createReader({ $: $, $$: $$, state: state, getBook: getBook, showToast: showToast, save: save, renderShelf: renderShelf, getShelfCard: getShelfCard });
      var setCover = reader.setCover, renderChapterList = reader.renderChapterList, clearVideo = reader.clearVideo,
        renderPage = reader.renderPage, mountVideo = reader.mountVideo, applyOpenProgress = reader.applyOpenProgress,
        animateOpenProgress = reader.animateOpenProgress, renderReader = reader.renderReader,
        openReader = reader.openReader, backToShelf = reader.backToShelf, openBook = reader.openBook,
        closeBook = reader.closeBook, turnPage = reader.turnPage, bindBookDrag = reader.bindBookDrag;
      function bindShelfDrag() {
        var rail=$('#shelfRail');
        rail.addEventListener('click',function(event){if(event.detail===0){var card=event.target.closest('[data-book-index]');if(card)selectShelfIndex(Number(card.dataset.bookIndex));}});
        rail.addEventListener('pointerdown',function(event){
          var card=event.target.closest('.book-card');
          shelfDrag.active=true;shelfDrag.startX=event.clientX;shelfDrag.moved=false;shelfDrag.downIndex=card?Number(card.dataset.bookIndex):null;shelfDrag.startIndex=state.shelfIndex;
          rail.classList.add('dragging');rail.setPointerCapture(event.pointerId);
        });
        rail.addEventListener('pointermove',function(event){
          if(!shelfDrag.active)return;
          var dx=event.clientX-shelfDrag.startX;
          if(Math.abs(dx)>7)shelfDrag.moved=true;
          if(shelfDrag.moved){state.shelfIndex=Math.max(0,Math.min(state.shelfList.length-1,shelfDrag.startIndex-dx/158));updateCarousel();}
        });
        rail.addEventListener('pointerup',function(){
          if(!shelfDrag.active)return;
          var moved=shelfDrag.moved,downIndex=shelfDrag.downIndex;
          shelfDrag.active=false;rail.classList.remove('dragging');
          if(moved){state.shelfIndex=Math.round(state.shelfIndex);save();updateCarousel();}
          else if(downIndex!==null)selectShelfIndex(downIndex);
          shelfDrag.downIndex=null;
        });
        rail.addEventListener('pointercancel',function(){if(!shelfDrag.active)return;shelfDrag.active=false;rail.classList.remove('dragging');state.shelfIndex=Math.round(state.shelfIndex);updateCarousel();});
      }
      function bind() {
        $('#shelfSpineRow').addEventListener('click',function(event){
          // #256 2번: 책등을 누르면 아래 넘기기가 그 책으로 이동한다(책을 바로 열지는 않는다).
          var spine=event.target.closest('[data-book-id]');
          if(!spine)return;
          var index=spineTargetIndex(state.shelfList,spine.dataset.bookId);
          if(index<0||index>=state.shelfList.length||index===state.shelfIndex)return;
          state.shelfIndex=index;save();updateCarousel();
        });
        $('#shelfJump').addEventListener('click',function(){state.query='';state.filter='all';$('#searchInput').value='';$$('.filter').forEach(function(item){item.classList.toggle('active',item.dataset.filter==='all');});renderShelf();var book=getShelfCard(state.shelfIndex)?.querySelector('button[data-book-id]');if(book)openReader(book.dataset.bookId,book.closest('.book-card'));});
        $('#searchInput').addEventListener('input',function(event){state.query=event.target.value;renderShelf();});
        $$('.filter').forEach(function(button){button.addEventListener('click',function(){state.filter=button.dataset.filter;$$('.filter').forEach(function(item){item.classList.toggle('active',item===button);});renderShelf();});});
        $('#shelfPrev').addEventListener('click',function(){moveShelf(-1);});
        $('#shelfNext').addEventListener('click',function(){moveShelf(1);});
        $('#backToShelf').addEventListener('click',backToShelf);
        $('#openBookButton').addEventListener('click',openBook);
        $('#closeBookButton').addEventListener('click',closeBook);
        $('#prevPage').addEventListener('click',function(){turnPage(-1);});
        $('#nextPage').addEventListener('click',function(){turnPage(1);});
        $('#rightPage').addEventListener('click',function(event){if(event.target.closest('[data-play-video]'))mountVideo();});
        bindBookDrag();bindShelfDrag();
        document.addEventListener('keydown',function(event){if(!state.selectedId){if(event.key==='ArrowRight')moveShelf(1);if(event.key==='ArrowLeft')moveShelf(-1);return;}if(event.key==='Escape'&&state.open){closeBook();return;}if(state.open&&event.key==='ArrowRight')turnPage(1);if(state.open&&event.key==='ArrowLeft')turnPage(-1);});
        $('#newBookButton').addEventListener('click',function(){openModal('newBookModal');});
        $$('[data-close]').forEach(function(button){button.addEventListener('click',function(){closeModal(button.dataset.close);});});
        $$('.modal-backdrop').forEach(function(backdrop){backdrop.addEventListener('click',function(event){if(event.target===backdrop)closeModal(backdrop.id);});});
        $('#newBookForm').addEventListener('submit',function(event){
          event.preventDefault();
          var name=$('#newBookName').value.trim(),url=$('#newBookUrl').value.trim();
          if(!name||!url)return;
          state.customBooks.push({id:'custom-'+Date.now(),name:name,category:'all',color:palette[0],accent:palette[0],symbol:'♡',description:'새롭게 기록하기 시작한 트리.',tags:['새 책','첫 마음'],lastDate:new Date().toISOString().slice(0,10),chapters:[{title:$('#newBookChapter').value.trim()||'처음 마음이 움직인 장면',url:url,mood:'첫 마음',note:'이 사람을 처음 책으로 만들게 된 순간'}]});
          save();closeModal('newBookModal');$('#newBookForm').reset();renderShelf();showToast(name+'의 책을 만들었어요.');
        });
      }
      mountThumbFallback(document);
      renderShelf();renderResumeCard();bind();
  }
}

// #481: 제목 보기가 바뀌면 책장의 제목(이어 읽기·표지)도 다시 그려야 한다. 다만 날짜 표기와 같은 판정으로
// '지금 그린 값과 다르고, 기기 미러가 이미 그 값일 때'만 다시 띄운다 — 받을 때마다 새로고침하면 고리가 된다.
const renderedTitleDisplay=titleDisplayOf((()=>{try{return parent.LT41?.prefs?.titleDisplay||'both'}catch{return 'both'}})());
if(typeof addEventListener==='function')addEventListener('message',e=>{
 if(e.data?.type!=='lt41-title-display')return;
 let mirror=null;try{mirror=localStorage.getItem('lt41.titleDisplay');}catch{}
 if(shouldReloadForTitleDisplay({value:e.data.value,rendered:renderedTitleDisplay,mirror}))location.reload();
});
