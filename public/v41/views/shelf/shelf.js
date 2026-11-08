// 내 책장 동작 (#231 후속, 2026-11-09). track32-bookshelf.html 인라인 스크립트를 그대로 옮겼다.
// 조건·문구·id·순서 변경 0 — 실행 시점을 바꾸지 않으려고 클래식 스크립트(IIFE) 한 파일로 둔다.
    (function () {
      'use strict';
      var $ = function (selector) { return document.querySelector(selector); };
      var $$ = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
      var sourceLabel = 'bookmarks_LIKE_only_2026-07-28.html';
      // #212: 표지에 보이는 이름은 한 번만 쓴다. 자동 접미사(", 나의 순간들")는 표시 단계에서만 뺀다(tree-name.mjs).
      var treeTitle = function (value) { return (window.LTTreeName && window.LTTreeName.displayTreeTitle) ? window.LTTreeName.displayTreeTitle(value) : value; };
      var lastMomentDate = function (tree) { var dates = tree.moments.map(function (moment) { return moment.date || ''; }).filter(Boolean).sort(); return dates.length ? dates[dates.length - 1] : ''; };
      // #212: 표지 색은 테마 변수를 넘긴다. 밤은 장미색이 아닌 값, 정원은 지금 크림색 책장 색이며
      // 실제 색값은 identity.css의 --lt-cover-N에만 있다(테마를 바꿔도 다시 그릴 필요가 없다).
      var palette = ['var(--lt-cover-1)', 'var(--lt-cover-2)', 'var(--lt-cover-3)', 'var(--lt-cover-4)'];
      var books = LTDEMO.library.map(function(tree,index){var color=palette[index%palette.length],cover=tree.moments.find(function(moment){return moment.id===tree.coverMomentId;}),coverMedia=cover&&cover.type==='photo'?cover.image||'':'';return {id:tree.id,name:treeTitle(tree.title),subject:tree.subject||'',category:'all',color:color,accent:color,symbol:'✦',coverMedia:coverMedia,lastDate:lastMomentDate(tree),description:tree.subject?'좋아하는 대상 · '+tree.subject:'좋아하는 대상을 기록한 책입니다.',tags:[tree.subject||'좋아하는 대상'],chapters:tree.moments.map(m=>({title:m.title,url:m.externalUrl||'',mood:m.emotion,note:m.memo||m.whyNext||'',id:m.id,type:m.type,image:m.image||''}))};});
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
      function allBooks() { return books.concat(state.customBooks); }
      function getBook(id) { return allBooks().find(function (book) { return book.id === id; }); }
      function save() {} // Selection belongs to the shell; never persist another account's library.
      function esc(value) { return String(value || '').replace(/[&<>"']/g,function (char) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[char]; }); }
      function youtubeId(url) { var u; try { u = new URL(String(url || '')); } catch (e) { return ''; } if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''; var hosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']; if (hosts.indexOf(u.hostname) < 0) return ''; var described = (window.LTMedia && typeof window.LTMedia.describe === 'function') ? window.LTMedia.describe(String(url || '')) : null; if (described && described.kind === 'youtube') return described.videoId || ''; if (u.hostname === 'youtu.be') { var id1 = u.pathname.split('/').filter(Boolean)[0] || ''; return /^[A-Za-z0-9_-]{11}$/.test(id1) ? id1 : ''; } if (u.pathname === '/watch') { var id2 = u.searchParams.get('v') || ''; return /^[A-Za-z0-9_-]{11}$/.test(id2) ? id2 : ''; } var m = u.pathname.match(/^\/(shorts|live|embed)\/([^/?#]+)/); return m && /^[A-Za-z0-9_-]{11}$/.test(m[2]) ? m[2] : ''; }
      function showToast(message) { var toast=$('#toast'); toast.textContent=message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(function(){toast.classList.remove('show');},2400); }
      function coverStyle(book) { return '--cover:'+book.color+';--cover-accent:'+book.accent+';--tilt:'+((book.id.length%5)-2)+'deg;'; }
      function openModal(id) { $('#'+id).classList.remove('hidden'); }
      function closeModal(id) { $('#'+id).classList.add('hidden'); }
      function renderShelf() {
        var query=state.query.trim().toLowerCase();
        var list=allBooks().filter(function(book){
          var filterOk=state.filter==='all'||book.category===state.filter;
          var queryOk=!query||[book.name,book.description].concat(book.tags).concat(book.chapters.map(function(chapter){return chapter.title;})).join(' ').toLowerCase().indexOf(query)>=0;
          return filterOk&&queryOk;
        });
        state.shelfList=list;
        if(!list.length)state.shelfIndex=0;
        else if(state.selectedId){var selectedIndex=list.findIndex(function(book){return book.id===state.selectedId;});if(selectedIndex>=0)state.shelfIndex=selectedIndex;}
        else state.shelfIndex=Math.max(0,Math.min(state.shelfIndex,list.length-1));
        $('#resultCount').textContent=list.length+'권';
        renderHeroShelf(list);
        $('#shelfRail').innerHTML=list.length?list.map(function(book,index){
          // #212: 표지에 이름 한 번만. 표지 아래는 "순간 N개 · 마지막 YYYY-MM-DD" 하나만. "책 · 02"·"기본 표지" 같은 내부 표시는 없다.
          return '<article class="book-card" data-book-index="'+index+'"><button type="button" data-book-id="'+esc(book.id)+'" aria-label="'+esc(book.name)+' 기억책 열기">'+
            '<div class="book-cover" style="'+coverStyle(book)+'">'+(book.coverMedia?'<img class="book-cover-media" src="'+esc(book.coverMedia)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(book.symbol)+'</span></span><strong class="cover-title">'+esc(book.name)+'</strong></div>'+
            '<span class="book-card-meta"><span>'+book.chapters.length+'개 순간 · 마지막 '+esc(book.lastDate||'-')+'</span></span></button></article>';
        }).join(''):'<div class="empty"><strong>찾는 책이 없어요.</strong><span>트리 이름·좋아하는 대상·순간 제목으로 검색해 보세요.</span></div>';
        updateCarousel(false);
      }
      function renderHeroShelf(list) {
        // #212 4번: 예시 그림 대신 실제 내 책(최대 4권)을 세운다. 책이 없으면 아무것도 그리지 않는다.
        var host=$('#heroBooks'),shelf=$('#heroShelf');
        if(!host)return;
        var shown=list.slice(0,4);
        host.innerHTML=shown.map(function(book,index){
          return '<div class="hero-book" style="--book:'+esc(book.color)+';--tilt:'+(((index%3)-1)*2)+'deg" title="'+esc(book.name)+'"><i></i><span>'+esc(book.name)+'</span></div>';
        }).join('');
        if(shelf)shelf.style.display=shown.length?'block':'none';
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
          var distance=index-center;
          var absolute=Math.abs(distance);
          var x=distance*158 + (distance>0?Math.min(absolute*8,22):distance<0?-Math.min(absolute*8,22):0);
          var z=-absolute*78;
          // #212: 중앙 카드는 레일 높이(375)보다 큰 352px이라 위로 뜨면 표지 윗부분이 잘렸다.
          // 중앙은 위로 띄우지 않고 아래로 살짝 내리고, 배율을 레일 안에 들어가는 값으로 조정한다.
          var scale=absolute===0?1.06:absolute===1?.82:absolute===2?.66:.54;
          var rotate=distance===0?0:distance>0?-22:22;
          var alpha=absolute===0?1:absolute===1?.9:absolute===2?.66:absolute===3?.28:0;
          card.style.setProperty('--x',x+'px');
          card.style.setProperty('--y',(absolute===0?6:Math.min(absolute*8,28))+'px');
          card.style.setProperty('--z',z+'px');
          card.style.setProperty('--scale',scale);
          card.style.setProperty('--rot',rotate+'deg');
          card.style.setProperty('--alpha',alpha);
          card.style.zIndex=String(100-absolute);
          card.classList.toggle('is-center',distance===0);
          card.style.pointerEvents=absolute>3?'none':'auto';
          card.style.filter=absolute>2?'saturate(.72) brightness(.86)':'none';
        });
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
      function setCover(book) {
        var cover=$('#bookCoverFace');
        cover.style.setProperty('--cover',book.color);
        cover.style.setProperty('--cover-accent',book.accent);
        cover.style.setProperty('--tilt','0deg');
        var coverMedia=$('#coverMedia');if(book.coverMedia){coverMedia.src=book.coverMedia;coverMedia.hidden=false;}else{coverMedia.hidden=true;coverMedia.removeAttribute('src');}
        cover.querySelector('.cover-symbol span').textContent=book.symbol;
        $('#coverTitle').textContent=book.name;
        $('#coverTitle').textContent=book.name;
        $('#coverBack').innerHTML='순간의 기록<br /><small>'+esc(book.name)+'의 다음 장으로</small>';
        $('#readerLabel').textContent='기억책';
        $('#stageBookCode').textContent='순간의 기록';
        $('#readerEyebrow').textContent='기억책';
        $('#readerTitle').textContent=book.name+'의 LoveTree';
        $('#readerDescription').textContent=book.description;
        $('#chapterCount').textContent=book.chapters.length+'개 순간';
      }
      function renderChapterList(book) {
        $('#chapterList').innerHTML=book.chapters.map(function(chapter,index){
          return '<button class="chapter-item '+(index===state.chapterIndex?'active':'')+'" type="button" data-index="'+index+'" style="--node:'+(index%2?book.accent:book.color)+'"><span class="num">'+String(index+1).padStart(2,'0')+'</span><span><strong>'+esc(chapter.title)+'</strong><small>'+esc(chapter.mood)+'</small></span><span class="arrow">›</span></button>';
        }).join('');
        $$('#chapterList [data-index]').forEach(function(item){item.addEventListener('click',function(){var index=Number(item.dataset.index);if(state.open){turnPage(index>state.chapterIndex?1:-1,index);}else{state.chapterIndex=index;save();renderChapterList(book);showToast('순간 '+String(index+1).padStart(2,'0')+'을 선택했어요. 책을 열어보세요.');}});});
      }
      function leftMarkup(book,index) {
        if(index===0)return '<span class="page-label">첫 마음 · '+esc(book.name)+'</span><div class="chapter-art"><span>'+esc(book.symbol)+'</span></div><span class="page-number">첫 순간</span>';
        var previous=book.chapters[index-1];
        return '<span class="page-label">PREVIOUS CHAPTER · '+String(index).padStart(2,'0')+'</span><h3>'+esc(previous.title)+'</h3><p>'+esc(previous.note)+'</p><span class="page-number">기록 경로 · '+String(index).padStart(2,'0')+'</span>';
      }
      function rightMarkup(book,index) {
        var chapter=book.chapters[index];
        var type=chapter.type||'photo';
        var label=({photo:'사진',video:'영상 예시',memo:'메모',link:'링크'})[type]||'순간';
        var art=chapter.image?'<img src="'+esc(chapter.image)+'" alt="" loading="lazy" />':'<span class="poster-caption">기록해 둔 마음</span>';
        var info=type==='video'?'<span class="poster-caption">영상의 예시 이미지입니다</span>':'';
        return '<div class="page-video"><span class="page-label">순간 · '+String(index+1).padStart(2,'0')+' · '+esc(chapter.mood)+'</span><div class="video-holder"><div class="video-poster">'+art+info+'</div></div><h3>'+esc(chapter.title)+'</h3><p>'+esc(chapter.note)+'</p><span class="poster-caption">'+esc(label)+' · 내 기록</span></div>';
      }
      function clearVideo() {
        $$('#rightPage iframe, #sheetFront iframe, #sheetBack iframe').forEach(function(frame){frame.remove();});
      }
      function renderPage(book) {
        clearVideo();
        $('#leftPage').innerHTML=leftMarkup(book,state.chapterIndex);
        $('#rightPage').innerHTML=rightMarkup(book,state.chapterIndex);
        $('#underPage').innerHTML=state.chapterIndex<book.chapters.length-1?rightMarkup(book,state.chapterIndex+1):rightMarkup(book,state.chapterIndex);
        $('#underPage').style.display='none';
        $('#pageCounter').textContent='PAGE '+String(state.chapterIndex+1).padStart(2,'0')+' / '+String(book.chapters.length).padStart(2,'0');
        $('#prevPage').disabled=state.chapterIndex===0;
        $('#nextPage').disabled=state.chapterIndex===book.chapters.length-1;
      }
      function mountVideo() {
        var book=getBook(state.selectedId);
        if(!book||state.pageTurning)return;
        var chapter=book.chapters[state.chapterIndex];
        var id=youtubeId(chapter.url);
        if(!id){showToast('이 순간에는 재생할 수 있는 YouTube 영상 ID가 없어요.');return;}
        clearVideo();
        var holder=$('#rightPage [data-video-holder]');
        if(!holder)return;
        var frame=document.createElement('iframe');
        frame.id='pageVideo';
        frame.className=/youtube\.com\/shorts/i.test(chapter.url||'')?'is-short':'';
        frame.title=chapter.title;
        frame.allow='autoplay; encrypted-media; picture-in-picture';
        frame.allowFullscreen=true;
        frame.src='https://www.youtube.com/embed/'+id+'?autoplay=1&rel=0';
        holder.innerHTML='';
        holder.appendChild(frame);
      }
      function applyOpenProgress() {
        var book3d=$('#book3d');
        if(!book3d)return;
        var progress=state.open?1:Math.max(0,Math.min(1,state.openProgress));
        book3d.classList.toggle('open',state.open);
        book3d.style.setProperty('--open-progress',progress);
        book3d.style.setProperty('--cover-angle',(-165*progress)+'deg');
        book3d.style.setProperty('--page-opacity',progress);
        book3d.style.setProperty('--body-rotate',(state.open?0:(-9+9*progress))+'deg');
        book3d.style.setProperty('--book-lift',(28*progress)+'px');
      }
      function animateOpenProgress(target,done) {
        var book3d=$('#book3d');
        if(!book3d){if(done)done();return;}
        var start=state.openProgress;
        var started=Date.now();
        var duration=720;
        book3d.classList.add('dragging');
        function frame(){
          var progress=Math.min(1,(Date.now()-started)/duration);
          var eased=progress<.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;
          state.openProgress=start+(target-start)*eased;
          applyOpenProgress();
          if(progress<1){requestAnimationFrame(frame);return;}
          state.openProgress=target;
          book3d.classList.remove('dragging');
          applyOpenProgress();
          if(done)done();
        }
        requestAnimationFrame(frame);
      }
      function renderReader() {
        var book=getBook(state.selectedId);
        if(!book)return;
        if(state.chapterIndex>=book.chapters.length)state.chapterIndex=0;
        setCover(book);
        renderChapterList(book);
        if(state.open||state.openProgress>0)renderPage(book);
        applyOpenProgress();
        $('#openBookButton').classList.toggle('hidden',state.open);
        $('#closeBookButton').classList.toggle('hidden',!state.open);
        $('#readerHint').textContent=state.open?'책장을 좌우로 끌거나 화살표로 한 장씩 넘겨보세요':'표지를 누른 채 오른쪽으로 움직이면 책이 열려요';
      }
      function animateSharedBook(fromRect,toRect,done) {
        if(!fromRect||!toRect){if(done)done();return;}
        var source=document.createElement('div');
        source.className='transfer-book';
        var cover=document.createElement('div');
        cover.className='book-cover';
        cover.style.setProperty('--cover',getBook(state.selectedId)?.color||'#6b5873');
        var selected=getBook(state.selectedId);cover.innerHTML=(selected?.coverMedia?'<img class="book-cover-media" src="'+esc(selected.coverMedia)+'" alt="" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(selected?.symbol||'♡')+'</span></span><strong class="cover-title">'+esc(selected?.name||'LoveTree')+'</strong>';
        source.appendChild(cover);
        document.body.appendChild(source);
        function place(rect){source.style.left=rect.left+'px';source.style.top=rect.top+'px';source.style.width=rect.width+'px';source.style.height=rect.height+'px';}
        place(fromRect);
        source.style.transform='rotateY(-14deg) rotateZ(-1deg)';
        requestAnimationFrame(function(){requestAnimationFrame(function(){place(toRect);source.style.transform='rotateY(0deg) rotateZ(0deg)';});});
        var finished=false;
        function finish(){if(finished)return;finished=true;source.remove();if(done)done();}
        source.addEventListener('transitionend',finish,{once:true});
        setTimeout(finish,820);
      }
      function openReader(id,sourceCard) {
        var book=getBook(id);
        if(!book)return;
        var source=sourceCard&&sourceCard.querySelector('.book-cover');
        var sourceRect=source?source.getBoundingClientRect():null;
        state.selectedId=id;state.shelfIndex=Math.max(0,state.shelfList.findIndex(function(item){return item.id===id;}));state.chapterIndex=Math.max(0,book.chapters.findIndex(m=>m.id===LTDEMO.get()));state.open=false;state.openProgress=0;save();
        $('#shelfScreen').classList.add('is-leaving');
        $('#readerScreen').classList.add('active','is-preparing');
        renderReader();
        var targetRect=$('#bookCoverFace').getBoundingClientRect();
        animateSharedBook(sourceRect,targetRect,function(){
          if(LTDEMO.openBook){LTDEMO.openBook(book.chapters[state.chapterIndex].id,book.id);return;}
          $('#shelfScreen').style.display='none';
          $('#shelfScreen').classList.remove('is-leaving');
          $('#readerScreen').classList.remove('is-preparing');
          window.scrollTo({top:0,behavior:'smooth'});
        });
      }
      function backToShelf() {
        var book=getBook(state.selectedId);
        if(!book){$('#readerScreen').classList.remove('active');return;}
        clearVideo();
        state.open=false;state.openProgress=0;state.pageTurning=false;
        $('#turnSheet').className='sheet';
        renderReader();
        var sourceRect=$('#bookCoverFace').getBoundingClientRect();
        $('#readerScreen').classList.add('is-preparing');
        $('#shelfScreen').style.display='block';
        renderShelf();
        var target=getShelfCard(state.shelfIndex);
        var targetRect=target?target.querySelector('.book-cover').getBoundingClientRect():null;
        animateSharedBook(sourceRect,targetRect,function(){
          $('#readerScreen').classList.remove('active','is-preparing');
          state.selectedId=null;save();
          $('#crumbLabel').textContent='내 책장';
          window.scrollTo({top:0,behavior:'smooth'});
        });
      }
      function openBook() {
        var book=getBook(state.selectedId);
        if(!book||state.open)return;
        renderPage(book);
        animateOpenProgress(1,function(){
          state.open=true;state.openProgress=1;save();renderReader();
          showToast('책이 열렸어요. 화살표로 순간을 넘겨보세요.');
        });
      }
      function closeBook() {
        var book=getBook(state.selectedId);
        if(!book)return;
        clearVideo();
        state.pageTurning=false;
        $('#turnSheet').className='sheet';
        animateOpenProgress(0,function(){state.open=false;state.openProgress=0;save();renderReader();});
      }
      function turnPage(direction,forcedIndex) {
        var book=getBook(state.selectedId);
        if(!book||state.pageTurning)return;
        if(!state.open){openBook();return;}
        var next=typeof forcedIndex==='number'?forcedIndex:state.chapterIndex+direction;
        if(next<0||next>=book.chapters.length){showToast(next<0?'첫 순간예요.':'마지막 순간예요.');return;}
        var current=state.chapterIndex;
        var forward=next>current;
        clearVideo();
        var sheet=$('#turnSheet');
        sheet.className='sheet';
        if(forward){
          $('#leftPage').innerHTML=leftMarkup(book,current);
          $('#rightPage').innerHTML=rightMarkup(book,next);
          $('#underPage').style.display='block';
          $('#underPage').innerHTML=rightMarkup(book,next);
          $('#sheetFront').innerHTML=rightMarkup(book,current);
          $('#sheetBack').innerHTML=leftMarkup(book,next);
          void sheet.offsetWidth;
          sheet.className='sheet turn-next';
        }else{
          $('#leftPage').innerHTML=leftMarkup(book,next);
          $('#rightPage').innerHTML=rightMarkup(book,next);
          $('#underPage').style.display='none';
          $('#sheetFront').innerHTML=leftMarkup(book,current);
          $('#sheetBack').innerHTML=rightMarkup(book,next);
          void sheet.offsetWidth;
          sheet.className='sheet turn-prev';
        }
        state.pageTurning=true;
        setTimeout(function(){
          state.chapterIndex=next;state.pageTurning=false;sheet.className='sheet';renderPage(book);renderChapterList(book);save();
        },840);
      }
      function bindBookDrag() {
        var book3d=$('#book3d');
        book3d.addEventListener('pointerdown',function(event){
          if(!state.open&& !event.target.closest('.book-cover-face'))return;
          if(state.open&&event.target.closest('button, a'))return;
          drag.active=true;drag.mode=state.open?'page':'cover';drag.startX=event.clientX;drag.startY=event.clientY;drag.moved=false;drag.startProgress=state.openProgress;
          book3d.classList.add('dragging');book3d.setPointerCapture(event.pointerId);
        });
        book3d.addEventListener('pointermove',function(event){
          if(!drag.active)return;
          var dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
          if(Math.abs(dx)>5||Math.abs(dy)>5)drag.moved=true;
          if(drag.mode==='cover'){
            var progress=drag.startProgress+(dx>=0?dx/220:dx/900);
            state.openProgress=Math.max(0,Math.min(1,progress));
            applyOpenProgress();
          }else{
            book3d.style.setProperty('--body-rotate',(dx*.07)+'deg');
            book3d.style.setProperty('--body-tilt',(-dy*.04)+'deg');
          }
        });
        book3d.addEventListener('pointerup',function(event){
          if(!drag.active)return;
          var dx=event.clientX-drag.startX,mode=drag.mode,progress=state.openProgress;
          drag.active=false;book3d.classList.remove('dragging');
          book3d.style.removeProperty('--body-rotate');book3d.style.removeProperty('--body-tilt');
          if(mode==='cover'){
            if(progress>=.45){openBook();return;}
            animateOpenProgress(0,function(){if(dx<0)showToast('표지는 오른쪽 방향으로만 열려요.');});
            return;
          }
          if(Math.abs(dx)>55)turnPage(dx<0?1:-1);
        });
        book3d.addEventListener('pointercancel',function(){drag.active=false;book3d.classList.remove('dragging');book3d.style.removeProperty('--body-rotate');book3d.style.removeProperty('--body-tilt');if(drag.mode==='cover')animateOpenProgress(0);});
      }
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
      renderShelf();bind();
    }());
