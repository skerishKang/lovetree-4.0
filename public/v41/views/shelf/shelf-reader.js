// 내 책장 읽기(펼침·장 넘김·끌기) 화면 동작 (#231 후속, 2026-11-09).
// views/shelf/shelf.js 안에 있던 함수를 그대로 옮겼다 — 조건·문구·id·순서 변경 0.
// 화면(DOM)을 다루므로 node에서는 createReader(가짜 DOM)로 시험한다.
import { escapeShelf, leftPageMarkup, pageMeta, pageTarget, rightPageMarkup, youtubeId as youtubeIdOf } from './shelf-model.mjs';
import { coverFallbackAttrs } from '../../thumb-fallback.mjs';

export function createReader(deps) {
  const { $, $$, state, getBook, showToast, save, renderShelf, getShelfCard } = deps;
  const esc = escapeShelf;
  const leftMarkup = leftPageMarkup, rightMarkup = rightPageMarkup;
  const youtubeId = (url) => youtubeIdOf(url, window.LTMedia && window.LTMedia.describe);

  function setCover(book) {
        var cover=$('#bookCoverFace');
        cover.style.setProperty('--cover',book.color);
        cover.style.setProperty('--cover-accent',book.accent);
        cover.style.setProperty('--tilt','0deg');
        // #256-3: 디자인 표지는 책장과 같은 판정(shelf-model coverChoice) 결과를 쓴다. 없으면 속성을 뺀다(기존 화면 변화 0).
        if(book.design)cover.setAttribute('data-cover-design',book.design);else cover.removeAttribute('data-cover-design');
        var coverMedia=$('#coverMedia');if(book.coverMedia){var cands=book.coverCandidates&&book.coverCandidates.length?book.coverCandidates:[book.coverMedia];coverMedia.setAttribute('data-lt-candidates',JSON.stringify(cands));coverMedia.setAttribute('data-lt-cand-index','0');coverMedia.setAttribute('data-lt-fallback-mode','cover');if(coverMedia.dataset)delete coverMedia.dataset.ltThumbSettled;coverMedia.src=book.coverMedia;coverMedia.hidden=false;}else{coverMedia.hidden=true;coverMedia.removeAttribute('src');coverMedia.removeAttribute('data-lt-candidates');}
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
  function clearVideo() {
        $$('#rightPage iframe, #sheetFront iframe, #sheetBack iframe').forEach(function(frame){frame.remove();});
      }
  function renderPage(book) {
        clearVideo();
        $('#leftPage').innerHTML=leftMarkup(book,state.chapterIndex);
        $('#rightPage').innerHTML=rightMarkup(book,state.chapterIndex);
        $('#underPage').innerHTML=state.chapterIndex<book.chapters.length-1?rightMarkup(book,state.chapterIndex+1):rightMarkup(book,state.chapterIndex);
        $('#underPage').style.display='none';
        var meta=pageMeta(state.chapterIndex, book.chapters.length);
        $('#pageCounter').textContent=meta.counter;
        $('#prevPage').disabled=meta.prevDisabled;
        $('#nextPage').disabled=meta.nextDisabled;
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
        if(selected?.design)cover.setAttribute('data-cover-design',selected.design);
        var selected=getBook(state.selectedId);cover.innerHTML=(selected?.coverMedia?'<img class="book-cover-media" src="'+esc(selected.coverMedia)+'"'+coverFallbackAttrs(selected.coverCandidates||[selected.coverMedia])+' alt="" referrerpolicy="no-referrer">':'')+'<span class="cover-symbol"><span>'+esc(selected?.symbol||'♡')+'</span></span><strong class="cover-title">'+esc(selected?.name||'LoveTree')+'</strong>';
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
        var next=pageTarget(state.chapterIndex, book.chapters.length, direction, forcedIndex);
        if(next===null){showToast(typeof forcedIndex==='number'||state.chapterIndex+direction<0?'첫 순간예요.':'마지막 순간예요.');return;}
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
  return { setCover, renderChapterList, clearVideo, renderPage, mountVideo, applyOpenProgress, animateOpenProgress, renderReader, animateSharedBook, openReader, backToShelf, openBook, closeBook, turnPage, bindBookDrag };
}
